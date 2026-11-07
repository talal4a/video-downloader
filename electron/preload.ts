// Runs in the window before the UI loads. Exposes a small, safe API as `window.vd`.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type VideoDownloaderApi } from '../shared/api';

function on<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, value: T) => cb(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: VideoDownloaderApi = {
  getInfo: (url) => ipcRenderer.invoke(IPC.getInfo, url),
  getThumbnail: (key) => ipcRenderer.invoke(IPC.getThumbnail, key),
  saveThumbnail: (key) => ipcRenderer.invoke(IPC.saveThumbnail, key),
  startDownloads: (reqs) => ipcRenderer.invoke(IPC.startDownloads, reqs),
  listDownloads: () => ipcRenderer.invoke(IPC.listDownloads),
  cancelDownload: (id) => ipcRenderer.invoke(IPC.cancelDownload, id),
  retryDownload: (id) => ipcRenderer.invoke(IPC.retryDownload, id),
  removeDownload: (id) => ipcRenderer.invoke(IPC.removeDownload, id),
  clearFinished: () => ipcRenderer.invoke(IPC.clearFinished),
  openFile: (p) => ipcRenderer.invoke(IPC.openFile, p),
  showInFolder: (p) => ipcRenderer.invoke(IPC.showInFolder, p),
  openDownloadsFolder: () => ipcRenderer.invoke(IPC.openDownloadsFolder),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  readClipboardUrl: () => ipcRenderer.invoke(IPC.readClipboardUrl),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.updateSettings, patch),
  chooseDownloadDir: () => ipcRenderer.invoke(IPC.chooseDownloadDir),
  getEngineInfo: () => ipcRenderer.invoke(IPC.getEngineInfo),
  updateEngine: () => ipcRenderer.invoke(IPC.updateEngine),
  getAccounts: () => ipcRenderer.invoke(IPC.getAccounts),
  login: (id) => ipcRenderer.invoke(IPC.login, id),
  logout: (id) => ipcRenderer.invoke(IPC.logout, id),
  capturePreview: (rect, name) => ipcRenderer.invoke(IPC.capturePreview, rect, name),
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  getAppUpdate: () => ipcRenderer.invoke(IPC.getAppUpdate),
  checkAppUpdate: () => ipcRenderer.invoke(IPC.checkAppUpdate),
  installAppUpdate: () => ipcRenderer.invoke(IPC.installAppUpdate),
  onDownloadUpdate: (cb) => on(IPC.evDownloadUpdate, cb),
  onDownloadRemoved: (cb) => on(IPC.evDownloadRemoved, cb),
  onClipboardLink: (cb) => on(IPC.evClipboardLink, cb),
  onOpenUrl: (cb) => on(IPC.evOpenUrl, cb),
  onSettingsChanged: (cb) => on(IPC.evSettings, cb),
  onEngineInfo: (cb) => on(IPC.evEngine, cb),
  onAppUpdate: (cb) => on(IPC.evAppUpdate, cb),
};

contextBridge.exposeInMainWorld('vd', api);
