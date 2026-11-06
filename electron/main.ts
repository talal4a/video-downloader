// Video Downloader — Electron main process.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  net,
  Notification,
  shell,
  Tray,
  type MenuItemConstructorOptions,
} from 'electron';
import { IPC } from '../shared/api';
import type { AccountId, DownloadRequest, Job, Result, Settings, SubtitleMode } from '../shared/types';
import { Accounts } from './accounts';
import { ClipboardWatcher } from './clipboard';
import { DownloadManager } from './core/downloads';
import { Engine } from './core/engine';
import { friendly } from './core/errors';
import { ensureDir, removeDir, sanitizeFileName, uniquePath } from './core/files';
import { FriendlyFailure, InfoService } from './core/info';
import { defaultSettings, sanitizeSettings } from './core/settings';
import { debounce, JsonFile } from './core/store';
import { toCommonImage } from './core/thumbnails';
import { extractFirstUrl, safeParseUrl } from './core/urls';
import { APP_ORIGIN, handleAppProtocol, registerAppScheme } from './protocol';
import { AppUpdater } from './updater';

// ---------------------------------------------------------------- setup

const APP_ID = 'com.talal4a.videodownloader';
const DEV_URL = process.env.VD_DEV_URL || 'http://localhost:3123';

if (process.env.VD_USER_DATA) app.setPath('userData', process.env.VD_USER_DATA);
const isDev = !app.isPackaged && process.argv.includes('--dev');
const startHidden = process.argv.includes('--hidden');

registerAppScheme();
app.setAppUserModelId(APP_ID);

const userData = app.getPath('userData');
const osDir = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
const appRoot = app.getAppPath();
const resourcesDir = app.isPackaged ? process.resourcesPath : path.join(appRoot, 'build');
const bundledBin = app.isPackaged ? path.join(process.resourcesPath, 'bin') : path.join(appRoot, 'resources', 'bin', osDir);
const iconFile = path.join(resourcesDir, app.isPackaged ? 'icons' : '', 'icon.png');
const trayIconFile = path.join(
  resourcesDir,
  app.isPackaged ? 'icons' : '',
  process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png',
);
const tempRoot = path.join(os.tmpdir(), 'VideoDownloader');

// ---------------------------------------------------------------- logging

const logFile = path.join(userData, 'logs', 'main.log');
function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  if (!app.isPackaged) process.stdout.write(line);
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 2 * 1024 * 1024) {
      fs.renameSync(logFile, `${logFile}.old`);
    }
    fs.appendFileSync(logFile, line);
  } catch {
    /* ignore */
  }
}
process.on('uncaughtException', (err) => log(`uncaughtException: ${err.stack ?? err}`));
process.on('unhandledRejection', (err) => log(`unhandledRejection: ${(err as Error)?.stack ?? err}`));

// ---------------------------------------------------------------- state

const settingsFile = new JsonFile<Partial<Settings>>(path.join(userData, 'settings.json'), {});
const defaultDownloadDir = process.env.VD_DOWNLOAD_DIR || path.join(app.getPath('downloads'), 'Video Downloader');
let settings: Settings = sanitizeSettings(defaultSettings(defaultDownloadDir), settingsFile.read());
if (process.env.VD_DOWNLOAD_DIR) settings.downloadDir = process.env.VD_DOWNLOAD_DIR;
if (process.env.VD_DISABLE_CLIPBOARD) settings.watchClipboard = false;

const historyFile = new JsonFile<Job[]>(path.join(userData, 'history.json'), []);

const engine = new Engine({
  bundledDir: bundledBin,
  userBinDir: path.join(userData, 'bin'),
  cacheDir: path.join(userData, 'cache'),
  jsRuntimePath: process.execPath,
  jsRuntimeIsElectron: true,
  stateFile: path.join(userData, 'engine.json'),
  log,
  fetchImpl: (url, init) => net.fetch(url, init),
});

/** Download missing tools (first start / antivirus removed one) and tell the UI how it goes. */
function ensureTools(): Promise<void> {
  return engine.ensureTools((p) => send(IPC.evEngine, { ...engine.info(), setup: p.step === 'Ready' ? undefined : p }));
}
let engineReady: Promise<void> = Promise.resolve();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let trayHintShown = false;

const accounts = new Accounts(path.join(userData, 'cookies'), () => mainWindow);
const cookiesFor = (url: string) => accounts.cookiesFileFor(url);

const info = new InfoService({
  engine,
  fetchImpl: (url, init) => net.fetch(url, init),
  cookiesFor,
  log,
});

const manager = new DownloadManager({ engine, tempRoot, getSettings: () => settings, cookiesFor, log });
const clipboardWatcher = new ClipboardWatcher();
const updater = new AppUpdater(app.isPackaged && process.platform === 'win32' && !process.env.VD_DISABLE_UPDATER, log);

let historyFrozen = false;
const saveHistory = debounce(() => {
  if (!historyFrozen) historyFile.write(manager.list().slice(0, 500));
}, 1000);

// ---------------------------------------------------------------- helpers

function send(channel: string, payload?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow(true);
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function notify(title: string, body: string, onClick?: () => void): void {
  if (!Notification.isSupported()) return;
  try {
    const n = new Notification({ title, body, icon: fs.existsSync(iconFile) ? iconFile : undefined, silent: false });
    n.on('click', () => {
      showWindow();
      onClick?.();
    });
    n.show();
  } catch (err) {
    log(`notify failed: ${(err as Error).message}`);
  }
}

function applySettingsSideEffects(prev: Settings | null): void {
  nativeTheme.themeSource = settings.theme;
  if (settings.watchClipboard) clipboardWatcher.start();
  else clipboardWatcher.stop();
  if (!prev || prev.openAtLogin !== settings.openAtLogin) {
    if (app.isPackaged && process.platform !== 'linux') {
      try {
        app.setLoginItemSettings({ openAtLogin: settings.openAtLogin, args: ['--hidden'] });
      } catch (err) {
        log(`setLoginItemSettings failed: ${(err as Error).message}`);
      }
    }
  }
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function updateSettings(patch: Partial<Settings>): Settings {
  const prev = settings;
  settings = sanitizeSettings(settings, patch);
  settingsFile.write(settings);
  applySettingsSideEffects(prev);
  send(IPC.evSettings, settings);
  return settings;
}

function updateTaskbarProgress(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const active = manager.activeJobs();
  if (!active.length) {
    mainWindow.setProgressBar(-1);
    return;
  }
  const avg = active.reduce((s, j) => s + (j.progress || 0), 0) / active.length;
  mainWindow.setProgressBar(Math.max(0.01, avg));
}

function isKnownFile(p: string): boolean {
  if (typeof p !== 'string' || !p) return false;
  const resolved = path.resolve(p);
  const inDownloads = resolved.startsWith(path.resolve(settings.downloadDir));
  const fromJob = manager.list().some((j) => j.files?.some((f) => path.resolve(f) === resolved));
  return inDownloads || fromJob;
}

function validateRequest(r: unknown): DownloadRequest | null {
  if (!r || typeof r !== 'object') return null;
  const q = r as Partial<DownloadRequest>;
  if (typeof q.url !== 'string' || !safeParseUrl(q.url)) return null;
  const kind = q.kind === 'audio' ? 'audio' : 'video';
  const quality = q.quality === 'best' ? 'best' : typeof q.quality === 'number' && q.quality >= 100 && q.quality <= 4320 ? Math.round(q.quality) : 'best';
  const audioBitrate = q.audioBitrate === 128 || q.audioBitrate === 192 ? q.audioBitrate : 320;
  const mode: SubtitleMode = q.subtitles?.mode === 'burn' || q.subtitles?.mode === 'file' ? q.subtitles.mode : 'embed';
  const subs =
    q.subtitles && typeof q.subtitles.lang === 'string' && /^[\w@.-]{1,40}$/.test(q.subtitles.lang)
      ? { lang: q.subtitles.lang, auto: Boolean(q.subtitles.auto), mode }
      : null;
  return {
    url: q.url,
    title: typeof q.title === 'string' && q.title.trim() ? q.title.slice(0, 300) : 'video',
    thumbnail: typeof q.thumbnail === 'string' && /^https?:\/\//.test(q.thumbnail) ? q.thumbnail : undefined,
    site: typeof q.site === 'string' ? q.site.slice(0, 60) : undefined,
    duration: typeof q.duration === 'number' ? q.duration : undefined,
    kind,
    quality,
    audioBitrate,
    subtitles: kind === 'video' ? subs : null,
    subfolder: typeof q.subfolder === 'string' && q.subfolder.trim() ? q.subfolder.slice(0, 120) : undefined,
    multi: q.multi === true,
  };
}

// ---------------------------------------------------------------- window

function createWindow(show = true): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 840,
    minWidth: 860,
    minHeight: 620,
    show: false,
    title: 'Video Downloader',
    icon: fs.existsSync(iconFile) ? iconFile : undefined,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b1020' : '#f5f7fb',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  const win = mainWindow;

  win.once('ready-to-show', () => {
    if (show) {
      win.show();
      win.focus();
    }
  });

  const allowedOrigin = isDev ? new URL(DEV_URL).origin : APP_ORIGIN;
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(allowedOrigin)) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Right-click menu (Cut / Copy / Paste) — people expect to right-click → Paste.
  win.webContents.on('context-menu', (_e, params) => {
    const items: MenuItemConstructorOptions[] = [];
    if (params.isEditable) {
      items.push(
        { role: 'cut', label: 'Cut', enabled: params.editFlags.canCut },
        { role: 'copy', label: 'Copy', enabled: params.editFlags.canCopy },
        { role: 'paste', label: 'Paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll', label: 'Select all' },
      );
    } else if (params.selectionText) {
      items.push({ role: 'copy', label: 'Copy' });
    }
    if (params.linkURL && /^https?:\/\//.test(params.linkURL)) {
      items.push({ label: 'Download this link', click: () => send(IPC.evOpenUrl, params.linkURL) });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });

  win.on('close', (e) => {
    if (quitting) return;
    if (settings.closeToTray && tray) {
      e.preventDefault();
      win.hide();
      if (!trayHintShown) {
        trayHintShown = true;
        notify('Video Downloader is still running', 'It keeps catching video links you copy. Right-click its icon near the clock to quit.');
      }
      return;
    }
    if (manager.hasActive()) {
      const choice = dialog.showMessageBoxSync(win, {
        type: 'question',
        buttons: ['Keep downloading', 'Quit anyway'],
        defaultId: 0,
        cancelId: 0,
        title: 'Downloads are running',
        message: 'Downloads are still running.',
        detail: 'If you quit now, they will stop. You can retry them later.',
      });
      if (choice === 0) e.preventDefault();
    }
  });
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  if (isDev) void win.loadURL(DEV_URL);
  else void win.loadURL(`${APP_ORIGIN}/`);
}

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: 'Open Video Downloader', click: () => showWindow() },
    {
      label: 'Download link from clipboard',
      click: async () => {
        const url = extractFirstUrl(await clipboard.readText());
        showWindow();
        if (url) send(IPC.evOpenUrl, url);
      },
    },
    { label: 'Open downloads folder', click: () => void openDownloadsFolder() },
    { type: 'separator' },
    {
      label: 'Catch copied video links',
      type: 'checkbox',
      checked: settings.watchClipboard,
      click: (item) => updateSettings({ watchClipboard: item.checked }),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
}

function createTray(): void {
  try {
    let img = nativeImage.createFromPath(trayIconFile);
    if (img.isEmpty()) img = nativeImage.createFromPath(iconFile).resize({ width: 16, height: 16 });
    if (img.isEmpty()) return;
    if (process.platform === 'darwin') img.setTemplateImage(true);
    tray = new Tray(img);
    tray.setToolTip('Video Downloader');
    tray.setContextMenu(buildTrayMenu());
    tray.on('click', () => showWindow());
    tray.on('double-click', () => showWindow());
  } catch (err) {
    log(`Tray not available: ${(err as Error).message}`);
    tray = null;
  }
}

async function openDownloadsFolder(): Promise<void> {
  await ensureDir(settings.downloadDir).catch(() => {});
  await shell.openPath(settings.downloadDir);
}

function setAppMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]),
  );
}

// ---------------------------------------------------------------- IPC

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function registerIpc(): void {
  ipcMain.handle(IPC.getInfo, async (_e, url: unknown) => {
    if (typeof url !== 'string' || url.length > 4096) {
      return { ok: false, error: friendly('invalid_url', "That doesn't look like a valid link.") };
    }
    await engineReady;
    try {
      return ok(await info.get(url));
    } catch (err) {
      if (err instanceof FriendlyFailure) return { ok: false, error: err.friendly };
      log(`getInfo crashed: ${(err as Error).stack}`);
      return { ok: false, error: friendly('unknown', 'Something went wrong.', 'Please try again.', String(err)) };
    }
  });

  ipcMain.handle(IPC.getThumbnail, async (_e, key: unknown) => {
    if (typeof key !== 'string') return null;
    const img = await info.thumbnail(key);
    if (!img) return null;
    return { dataUrl: `data:${img.mime};base64,${img.buffer.toString('base64')}` };
  });

  ipcMain.handle(IPC.saveThumbnail, async (_e, key: unknown): Promise<Result<string>> => {
    if (typeof key !== 'string') return { ok: false, error: friendly('unknown', 'Nothing to save.') };
    const media = info.getByKey(key);
    const img = await info.thumbnail(key);
    if (!media || !img) {
      return { ok: false, error: friendly('no_media', 'No thumbnail was found for this video.') };
    }
    try {
      await engineReady;
      const conv = await toCommonImage(img, engine.tools.ffmpeg, tempRoot);
      await ensureDir(settings.downloadDir);
      const target = uniquePath(settings.downloadDir, `${sanitizeFileName(media.title, 100)} - thumbnail`, conv.ext);
      await fsp.writeFile(target, conv.buffer);
      return ok(target);
    } catch (err) {
      return { ok: false, error: friendly('save_failed', 'Could not save the thumbnail.', 'Check the download folder in Settings.', String(err)) };
    }
  });

  ipcMain.handle(IPC.startDownloads, async (_e, reqs: unknown): Promise<Result<Job[]>> => {
    await engineReady;
    if (!engine.tools.ytdlp) {
      return { ok: false, error: friendly('engine_missing', 'The download engine is missing.', 'Please reinstall Video Downloader.') };
    }
    if (!Array.isArray(reqs) || reqs.length === 0 || reqs.length > 2000) {
      return { ok: false, error: friendly('unknown', 'Nothing to download.') };
    }
    const valid = reqs.map(validateRequest).filter((r): r is DownloadRequest => r !== null);
    if (!valid.length) return { ok: false, error: friendly('invalid_url', "That doesn't look like a valid link.") };
    return ok(valid.map((r) => manager.add(r)));
  });

  ipcMain.handle(IPC.listDownloads, () => manager.list());
  ipcMain.handle(IPC.cancelDownload, (_e, id: string) => manager.cancel(String(id)));
  ipcMain.handle(IPC.retryDownload, (_e, id: string) => void manager.retry(String(id)));
  ipcMain.handle(IPC.removeDownload, (_e, id: string) => manager.remove(String(id)));
  ipcMain.handle(IPC.clearFinished, () => manager.clearFinished());

  ipcMain.handle(IPC.openFile, async (_e, p: unknown): Promise<Result<void>> => {
    if (typeof p !== 'string' || !isKnownFile(p) || !fs.existsSync(p)) {
      return { ok: false, error: friendly('unavailable', 'This file was moved or deleted.') };
    }
    const err = await shell.openPath(p);
    return err ? { ok: false, error: friendly('unknown', 'Windows could not open this file.', 'Install a video player such as VLC (free).', err) } : ok(undefined);
  });
  ipcMain.handle(IPC.showInFolder, async (_e, p: unknown) => {
    if (typeof p === 'string' && isKnownFile(p) && fs.existsSync(p)) shell.showItemInFolder(p);
    else await openDownloadsFolder();
  });
  ipcMain.handle(IPC.openDownloadsFolder, () => openDownloadsFolder());
  ipcMain.handle(IPC.openExternal, (_e, url: unknown) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) void shell.openExternal(url);
  });
  ipcMain.handle(IPC.readClipboardUrl, async () => extractFirstUrl(await clipboard.readText()));

  ipcMain.handle(IPC.getSettings, () => settings);
  ipcMain.handle(IPC.updateSettings, (_e, patch: Partial<Settings>) => updateSettings(patch ?? {}));
  ipcMain.handle(IPC.chooseDownloadDir, async () => {
    const opts = {
      title: 'Choose where to save downloads',
      defaultPath: settings.downloadDir,
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
    };
    const res = mainWindow ? await dialog.showOpenDialog(mainWindow, opts) : await dialog.showOpenDialog(opts);
    if (!res.canceled && res.filePaths[0]) return updateSettings({ downloadDir: res.filePaths[0] });
    return settings;
  });

  ipcMain.handle(IPC.getEngineInfo, async () => {
    await engineReady;
    return engine.info();
  });
  ipcMain.handle(IPC.updateEngine, async () => {
    await engineReady;
    const m = engine.missing();
    if (m.ytdlp || m.ffmpeg || m.aria2) {
      await ensureTools();
      const i = engine.info();
      send(IPC.evEngine, i);
      return i;
    }
    const p = engine.update();
    send(IPC.evEngine, engine.info());
    await p;
    const i = engine.info();
    send(IPC.evEngine, i);
    return i;
  });

  const accountId = (id: unknown): AccountId | null =>
    id === 'instagram' || id === 'facebook' || id === 'tiktok' || id === 'x' ? id : null;
  ipcMain.handle(IPC.getAccounts, () => accounts.list());
  ipcMain.handle(IPC.login, async (_e, id: unknown) => {
    const a = accountId(id);
    if (a) await accounts.login(a);
    return accounts.list();
  });
  ipcMain.handle(IPC.logout, async (_e, id: unknown) => {
    const a = accountId(id);
    if (a) await accounts.logout(a);
    return accounts.list();
  });

  ipcMain.handle(IPC.getAppInfo, () => ({ version: app.getVersion(), platform: process.platform, isPackaged: app.isPackaged }));
  ipcMain.handle(IPC.getAppUpdate, () => updater.state);
  ipcMain.handle(IPC.checkAppUpdate, () => updater.check());
  ipcMain.handle(IPC.installAppUpdate, () => {
    quitting = true;
    updater.install();
  });
}

// ---------------------------------------------------------------- lifecycle

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    showWindow();
    const url = argv.map((a) => extractFirstUrl(a)).find((u): u is string => Boolean(u));
    if (url) send(IPC.evOpenUrl, url);
  });

  manager.restore(historyFile.read());
  manager.on('update', (job: Job) => {
    send(IPC.evDownloadUpdate, job);
    updateTaskbarProgress();
  });
  manager.on('changed', () => saveHistory());
  manager.on('removed', (id: string) => {
    send(IPC.evDownloadRemoved, id);
    saveHistory();
    updateTaskbarProgress();
  });
  manager.on('finished', (job: Job) => {
    saveHistory();
    const focused = mainWindow?.isFocused() ?? false;
    if (!settings.notifyOnFinish || focused) return;
    if (job.status === 'done') {
      notify('Download complete ✔', job.request.title, () => job.filePath && shell.showItemInFolder(job.filePath));
    } else if (job.status === 'error') {
      notify('Download failed', `${job.request.title}\n${job.error?.message ?? ''}`);
    }
  });

  clipboardWatcher.on('link', (url: string) => {
    send(IPC.evClipboardLink, url);
    const visible = mainWindow?.isVisible() && mainWindow.isFocused();
    if (!visible) {
      notify('Video link copied', 'Click here to download it.', () => send(IPC.evOpenUrl, url));
    }
  });

  updater.on('state', (s) => send(IPC.evAppUpdate, s));

  app.whenReady().then(async () => {
    log(`Starting Video Downloader ${app.getVersion()} (${process.platform}, packaged=${app.isPackaged})`);
    setAppMenu();
    if (!isDev) handleAppProtocol(path.join(appRoot, 'out'));
    registerIpc();
    await removeDir(tempRoot);
    engineReady = engine
      .init()
      .then(() => ensureTools())
      .then(
        () => send(IPC.evEngine, engine.info()),
        (err) => log(`engine init failed: ${(err as Error).stack}`),
      );
    createWindow(!startHidden);
    createTray();
    applySettingsSideEffects(null);

    // Keep the download engine fresh (YouTube changes often).
    const maybeUpdateEngine = async () => {
      await engineReady;
      if (settings.autoUpdateEngine && engine.needsDailyUpdate() && !manager.hasActive()) {
        await engine.update().catch(() => {});
        send(IPC.evEngine, engine.info());
      }
    };
    setTimeout(() => void maybeUpdateEngine(), 8000);
    setInterval(() => void maybeUpdateEngine(), 3 * 60 * 60 * 1000);

    setTimeout(() => void updater.check(), 15000);
    setInterval(() => void updater.check(), 6 * 60 * 60 * 1000);
  });

  app.on('activate', () => showWindow());

  app.on('before-quit', () => {
    quitting = true;
    saveHistory.flush();
    historyFile.write(manager.list().slice(0, 500));
    historyFrozen = true;
    clipboardWatcher.stop();
    manager.cancelAll();
  });

  // Only fires when the window is really closed (not hidden to the tray).
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
