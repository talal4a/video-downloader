// Locates the helper programs (yt-dlp, FFmpeg, aria2) and keeps yt-dlp up to date.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { EngineInfo } from '../../shared/types';
import { run, runForOutput } from './process';
import type { FetchLike } from './thumbnails';
import { installTools, toolSources, type SetupProgress } from './toolsetup';

const IS_WIN = process.platform === 'win32';
const exe = (name: string) => (IS_WIN ? `${name}.exe` : name);

export interface ToolPaths {
  ytdlp: string | null;
  ffmpeg: string | null;
  ffprobe: string | null;
  aria2c: string | null;
}

export interface EngineOptions {
  /** Folder with the binaries shipped inside the installer. */
  bundledDir?: string;
  /** Writable folder for the self-updating copy of yt-dlp. */
  userBinDir: string;
  /** yt-dlp cache folder (player JS cache etc). */
  cacheDir: string;
  /** Executable used as the JavaScript runtime for YouTube (Electron itself, run as Node). */
  jsRuntimePath?: string;
  /** True when jsRuntimePath is the Electron binary (needs ELECTRON_RUN_AS_NODE=1). */
  jsRuntimeIsElectron?: boolean;
  /** Where to remember the last update time. */
  stateFile?: string;
  env?: NodeJS.ProcessEnv;
  log?: (msg: string) => void;
  /** Used to download missing tools (Electron passes net.fetch so system proxies work). */
  fetchImpl?: FetchLike;
}

function isExecutable(p: string): boolean {
  try {
    const st = fs.statSync(p);
    if (!st.isFile()) return false;
    if (IS_WIN) return true;
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function pathDirs(env: NodeJS.ProcessEnv): string[] {
  const raw = env.PATH ?? env.Path ?? '';
  const dirs = raw.split(path.delimiter).filter(Boolean);
  if (process.platform === 'darwin') dirs.push('/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin');
  if (process.platform === 'linux') dirs.push('/usr/local/bin', '/usr/bin');
  return dirs;
}

export function findInPath(names: string[], env: NodeJS.ProcessEnv = process.env): string | null {
  for (const dir of pathDirs(env)) {
    for (const n of names) {
      const p = path.join(dir, n);
      if (isExecutable(p)) return p;
    }
  }
  return null;
}

function findIn(dir: string | undefined, names: string[]): string | null {
  if (!dir) return null;
  for (const n of names) {
    const p = path.join(dir, n);
    if (isExecutable(p)) return p;
  }
  return null;
}

const YTDLP_NAMES = IS_WIN
  ? ['yt-dlp.exe']
  : process.platform === 'darwin'
    ? ['yt-dlp_macos', 'yt-dlp']
    : ['yt-dlp_linux', 'yt-dlp'];

/** Compare yt-dlp versions like "2026.10.26" or "2026.10.26.233412". */
export function compareVersions(a?: string, b?: string): number {
  const pa = (a ?? '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = (b ?? '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

interface EngineState {
  lastUpdateCheck?: number;
  lastUpdateResult?: string;
}

/** JavaScript runtime yt-dlp uses to solve YouTube's challenges (needed for full quality lists). */
export interface JsRuntime {
  kind: 'node' | 'deno';
  path: string;
  /** The Electron app itself, run as Node.js (ELECTRON_RUN_AS_NODE=1). */
  electron: boolean;
}

/** Run a tiny script exactly the way yt-dlp does (permission flags, script on stdin). */
export function testNodeRuntime(execPath: string, electron: boolean, env: NodeJS.ProcessEnv): Promise<boolean> {
  const childEnv = { ...env, ...(electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) };
  const exec = (args: string[], input?: string) =>
    new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
      let out = '';
      let err = '';
      let child;
      try {
        child = spawn(execPath, args, { env: childEnv, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch {
        resolve({ code: -1, out, err: 'spawn failed' });
        return;
      }
      const timer = setTimeout(() => child.kill(), 20000);
      child.stdout.on('data', (d: Buffer) => (out += d.toString()));
      child.stderr.on('data', (d: Buffer) => (err += d.toString()));
      child.on('error', () => resolve({ code: -1, out, err: 'error' }));
      child.on('close', (code: number | null) => {
        clearTimeout(timer);
        resolve({ code, out, err });
      });
      child.stdin.on('error', () => {});
      child.stdin.end(input ?? '');
    });
  return (async () => {
    const v = await exec(['--version']);
    const m = /^v(\d+)\.(\d+)/.exec(v.out.trim());
    if (!m || Number(m[1]) < 22) return false;
    const [major, minor] = [Number(m[1]), Number(m[2])];
    const flags = major > 23 || (major === 23 && minor >= 5) ? ['--permission'] : ['--experimental-permission', '--no-warnings=ExperimentalWarning'];
    const r = await exec([...flags, '-'], 'console.log(6 * 7)');
    return r.code === 0 && r.out.trim() === '42' && r.err.trim() === '';
  })();
}

export class Engine {
  tools: ToolPaths = { ytdlp: null, ffmpeg: null, ffprobe: null, aria2c: null };
  version?: string;
  updating = false;
  setup?: SetupProgress;
  js: JsRuntime | null = null;
  private setupPromise: Promise<void> | null = null;
  private updatePromise: Promise<string> | null = null;
  private state: EngineState = {};
  private readonly env: NodeJS.ProcessEnv;
  private readonly log: (msg: string) => void;

  constructor(private readonly opts: EngineOptions) {
    this.env = opts.env ?? process.env;
    this.log = opts.log ?? (() => {});
  }

  async init(): Promise<void> {
    await fsp.mkdir(this.opts.userBinDir, { recursive: true }).catch(() => {});
    await fsp.mkdir(this.opts.cacheDir, { recursive: true }).catch(() => {});
    this.state = this.readState();

    const override = this.env.VD_YTDLP;
    const bundled = findIn(this.opts.bundledDir, YTDLP_NAMES);
    let ytdlp: string | null = override && isExecutable(override) ? override : null;

    if (!ytdlp && bundled) {
      // Keep a writable copy so yt-dlp can update itself even when installed in Program Files.
      const userCopy = path.join(this.opts.userBinDir, path.basename(bundled));
      try {
        let copy = !isExecutable(userCopy);
        if (!copy) {
          const bundledVersion = this.readBundledVersions().ytdlp;
          const userVersion = (await runForOutput(userCopy, ['--version'], this.env, 60000)) ?? undefined;
          if (!userVersion || (bundledVersion && compareVersions(bundledVersion, userVersion) > 0)) copy = true;
        }
        if (copy) {
          await fsp.copyFile(bundled, userCopy);
          if (!IS_WIN) await fsp.chmod(userCopy, 0o755);
        }
        ytdlp = userCopy;
      } catch (err) {
        this.log(`Could not prepare writable yt-dlp copy: ${(err as Error).message}`);
        ytdlp = bundled;
      }
    }
    if (!ytdlp) ytdlp = findIn(this.opts.userBinDir, YTDLP_NAMES) ?? findInPath(YTDLP_NAMES, this.env);

    this.tools = { ytdlp, ...this.resolveHelpers() };
    await this.detectJsRuntime();
    this.version = ytdlp ? ((await runForOutput(ytdlp, ['--version'], this.childEnv(), 60000)) ?? undefined) : undefined;
    this.log(
      `Engine: yt-dlp=${ytdlp} (${this.version}) ffmpeg=${this.tools.ffmpeg} aria2c=${this.tools.aria2c} js=${this.js ? `${this.js.kind}:${this.js.path}` : 'none'}`,
    );
  }

  /** Prefer the app's own Node.js; fall back to Deno or a system Node.js if it does not work here. */
  private async detectJsRuntime(): Promise<void> {
    const own = this.opts.jsRuntimePath;
    if (own && !this.env.VD_FORCE_JS_FALLBACK && (await testNodeRuntime(own, Boolean(this.opts.jsRuntimeIsElectron), this.env))) {
      this.js = { kind: 'node', path: own, electron: Boolean(this.opts.jsRuntimeIsElectron) };
      return;
    }
    if (own) this.log('Built-in JavaScript runtime self-test failed; looking for Deno or Node.js');
    const deno = findIn(this.opts.userBinDir, [exe('deno')]) ?? findInPath([exe('deno')], this.env);
    if (deno) {
      this.js = { kind: 'deno', path: deno, electron: false };
      return;
    }
    const node = this.env.VD_FORCE_JS_FALLBACK ? null : findInPath([exe('node')], this.env);
    if (node && (await testNodeRuntime(node, false, this.env))) {
      this.js = { kind: 'node', path: node, electron: false };
      return;
    }
    this.js = null;
  }

  private get ffmpegDir(): string {
    return path.join(this.opts.userBinDir, 'ffmpeg');
  }

  private resolveHelpers(): Omit<ToolPaths, 'ytdlp'> {
    const dirs = [this.env.VD_FFMPEG_DIR, this.opts.bundledDir, this.ffmpegDir];
    const pick = (name: string) => {
      for (const d of dirs) {
        const p = findIn(d, [exe(name)]);
        if (p) return p;
      }
      return findInPath([exe(name)], this.env);
    };
    // VD_ARIA2C lets tests point at a specific aria2c, or disable it with an empty value.
    const ariaOverride = this.env.VD_ARIA2C;
    let aria2c: string | null;
    if (ariaOverride !== undefined) aria2c = ariaOverride && isExecutable(ariaOverride) ? ariaOverride : null;
    else
      aria2c =
        findIn(this.opts.bundledDir, [exe('aria2c')]) ?? findIn(this.opts.userBinDir, [exe('aria2c')]) ?? findInPath([exe('aria2c')], this.env);
    return { ffmpeg: pick('ffmpeg'), ffprobe: pick('ffprobe'), aria2c };
  }

  /** Which required tools are missing (aria2 only counts on Windows, where we can fetch it). */
  missing(): { ytdlp: boolean; ffmpeg: boolean; aria2: boolean; deno: boolean } {
    return {
      ytdlp: !this.tools.ytdlp,
      ffmpeg: !this.tools.ffmpeg || !this.tools.ffprobe,
      aria2: !this.tools.aria2c && process.platform === 'win32' && this.env.VD_ARIA2C === undefined,
      deno: !this.js,
    };
  }

  /**
   * Download any missing tool from its official release (first start without bundled tools,
   * or after an antivirus removed one). Safe to call repeatedly.
   */
  ensureTools(onProgress?: (p: SetupProgress) => void): Promise<void> {
    if (this.setupPromise) return this.setupPromise;
    const need = this.missing();
    if (!need.ytdlp && !need.ffmpeg && !need.aria2 && !need.deno) return Promise.resolve();
    this.setupPromise = (async () => {
      const report = (p: SetupProgress) => {
        this.setup = p;
        onProgress?.(p);
      };
      report({ step: 'Getting ready for first use…', progress: 0 });
      const problems = await installTools({
        fetchImpl: this.opts.fetchImpl ?? fetch,
        sources: toolSources(process.platform, this.env.VD_TOOLS_BASE || undefined),
        binDir: this.opts.userBinDir,
        ffmpegDir: this.ffmpegDir,
        need,
        onProgress: report,
        log: this.log,
      });
      if (need.ytdlp) {
        const y = findIn(this.opts.userBinDir, YTDLP_NAMES);
        if (y) {
          this.tools.ytdlp = y;
          this.version = (await runForOutput(y, ['--version'], this.childEnv(), 60000)) ?? undefined;
        }
      }
      this.tools = { ytdlp: this.tools.ytdlp, ...this.resolveHelpers() };
      if (need.deno) await this.detectJsRuntime();
      this.setup = problems.length ? { step: 'Setup failed', error: problems.join('\n') } : undefined;
      onProgress?.(this.setup ?? { step: 'Ready', progress: 1 });
      this.log(`Tool setup finished. Problems: ${problems.join('; ') || 'none'}`);
    })().finally(() => {
      this.setupPromise = null;
    });
    return this.setupPromise;
  }

  private readBundledVersions(): { ytdlp?: string } {
    if (!this.opts.bundledDir) return {};
    try {
      return JSON.parse(fs.readFileSync(path.join(this.opts.bundledDir, 'versions.json'), 'utf8'));
    } catch {
      return {};
    }
  }

  private readState(): EngineState {
    if (!this.opts.stateFile) return {};
    try {
      return JSON.parse(fs.readFileSync(this.opts.stateFile, 'utf8'));
    } catch {
      return {};
    }
  }

  private writeState(): void {
    if (!this.opts.stateFile) return;
    try {
      fs.writeFileSync(this.opts.stateFile, JSON.stringify(this.state, null, 2));
    } catch {
      /* ignore */
    }
  }

  get hasJsRuntime(): boolean {
    return Boolean(this.js);
  }

  /** Environment for yt-dlp: our tools first in PATH, UTF-8 output, Electron-as-Node for YouTube. */
  childEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...this.env };
    const dirs = new Set<string>();
    for (const p of [this.tools.aria2c, this.tools.ffmpeg, this.tools.ytdlp, this.opts.bundledDir]) {
      if (p) dirs.add(p === this.opts.bundledDir ? p : path.dirname(p));
    }
    const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
    env[pathKey] = [...dirs, env[pathKey] ?? ''].filter(Boolean).join(path.delimiter);
    env.PYTHONIOENCODING = 'utf-8';
    env.PYTHONUTF8 = '1';
    if (this.js?.electron) env.ELECTRON_RUN_AS_NODE = '1';
    else delete env.ELECTRON_RUN_AS_NODE;
    return env;
  }

  /** Arguments every yt-dlp call gets. */
  commonArgs(): string[] {
    const out = ['--ignore-config', '--color', 'never', '--encoding', 'utf-8', '--cache-dir', this.opts.cacheDir];
    if (this.tools.ffmpeg) out.push('--ffmpeg-location', path.dirname(this.tools.ffmpeg));
    if (this.js) out.push('--no-js-runtimes', '--js-runtimes', `${this.js.kind}:${this.js.path}`);
    out.push('--socket-timeout', '30', '--retries', '10', '--fragment-retries', '10', '--extractor-retries', '3');
    return out;
  }

  problems(): string[] {
    if (this.setupPromise) return [];
    const p: string[] = [];
    if (!this.tools.ytdlp) p.push('The download engine (yt-dlp) is missing.');
    if (!this.tools.ffmpeg || !this.tools.ffprobe) p.push('FFmpeg is missing: HD video and MP3 conversion will not work.');
    return p;
  }

  info(): EngineInfo {
    return {
      ytdlpVersion: this.version,
      ytdlpPath: this.tools.ytdlp ?? undefined,
      ffmpeg: Boolean(this.tools.ffmpeg && this.tools.ffprobe),
      aria2: Boolean(this.tools.aria2c),
      jsRuntime: this.hasJsRuntime,
      jsRuntimeName: this.js ? (this.js.electron ? 'built-in' : this.js.kind === 'deno' ? 'Deno' : 'Node.js') : undefined,
      updating: this.updating,
      lastUpdateCheck: this.state.lastUpdateCheck,
      lastUpdateResult: this.state.lastUpdateResult,
      problems: this.problems(),
      setup: this.setup,
    };
  }

  needsDailyUpdate(): boolean {
    const last = this.state.lastUpdateCheck ?? 0;
    return Date.now() - last > 20 * 60 * 60 * 1000;
  }

  /** Update yt-dlp to the newest stable release. Safe to call many times (runs once at a time). */
  update(): Promise<string> {
    if (this.updatePromise) return this.updatePromise;
    this.updatePromise = this.doUpdate().finally(() => {
      this.updatePromise = null;
    });
    return this.updatePromise;
  }

  private async doUpdate(): Promise<string> {
    const ytdlp = this.tools.ytdlp;
    if (!ytdlp) return 'Download engine not found.';
    this.updating = true;
    try {
      const h = run(ytdlp, ['--ignore-config', '--update-to', 'stable'], {
        env: this.childEnv(),
        collectStdout: true,
        timeoutMs: 180000,
      });
      const r = await h.done;
      const text = `${r.stdout}\n${r.tail}`;
      let result: string;
      if (/Updated yt-dlp to/i.test(text)) {
        result = `Updated to ${(text.match(/Updated yt-dlp to\s+(\S+)/i) ?? [])[1] ?? 'the newest version'}`;
      } else if (/up to date/i.test(text)) {
        result = 'Already up to date';
      } else if (/pip|PyPi|package manager|brew|Homebrew|installed/i.test(text) && r.code !== 0) {
        result = 'Managed by your system package manager';
      } else {
        result = r.code === 0 ? 'Update check finished' : 'Update failed (will retry later)';
      }
      this.version = (await runForOutput(ytdlp, ['--version'], this.childEnv(), 60000)) ?? this.version;
      this.state.lastUpdateCheck = Date.now();
      this.state.lastUpdateResult = result;
      this.writeState();
      this.log(`yt-dlp update: ${result} -> ${this.version}`);
      return result;
    } finally {
      this.updating = false;
    }
  }
}
