// First-start setup: downloads missing tools from (a local copy of) their GitHub release pages.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Engine } from '../../electron/core/engine';
import { installTools, toolSources } from '../../electron/core/toolsetup';
import { startMediaServer, type MediaServer } from '../helpers/media-server';

const osDir = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
const bundledDir = path.resolve(__dirname, '..', '..', 'resources', 'bin', osDir);
const exe = (n: string) => (process.platform === 'win32' ? `${n}.exe` : n);

let work: string;
let mirror: string;
let server: MediaServer;
let real: Engine;

function sha256(file: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function makeZip(srcDir: string, dest: string) {
  if (process.platform === 'win32') {
    execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${srcDir}\\*' -DestinationPath '${dest}' -Force`]);
  } else {
    execFileSync('python3', ['-c', 'import shutil,sys; shutil.make_archive(sys.argv[1][:-4], "zip", sys.argv[2])', dest, srcDir]);
  }
}

/** Lay out files exactly like the GitHub release URLs the app uses. */
function buildMirror(root: string) {
  const s = toolSources(process.platform, '');
  const place = (url: string) => {
    const p = path.join(root, ...url.split('/').filter(Boolean));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    return p;
  };
  const yt = place(s.ytdlp.url);
  fs.copyFileSync(real.tools.ytdlp!, yt);
  fs.writeFileSync(place(s.ytdlp.sumsUrl), `${'0'.repeat(64)}  other-file\n${sha256(yt)}  ${s.ytdlp.fileName}\n`);

  // FFmpeg archive (first candidate URL only; the others 404 like a missing asset).
  const ff = s.ffmpeg[0];
  const staging = path.join(work, 'ffstage', 'ffmpeg-test-build', 'bin');
  fs.mkdirSync(staging, { recursive: true });
  for (const t of [real.tools.ffmpeg!, real.tools.ffprobe!]) fs.copyFileSync(t, path.join(staging, path.basename(t)));
  if (process.platform === 'win32') {
    for (const dll of fs.readdirSync(path.dirname(real.tools.ffmpeg!)).filter((f) => f.endsWith('.dll'))) {
      fs.copyFileSync(path.join(path.dirname(real.tools.ffmpeg!), dll), path.join(staging, dll));
    }
  }
  const archive = place(ff.urls[0]);
  if (ff.archive === 'zip') makeZip(path.join(work, 'ffstage'), archive);
  else execFileSync('tar', ['-cJf', archive, '-C', path.join(work, 'ffstage'), '.']);

  if (s.deno) {
    // Stand-in "deno" binary (any executable will do for install/detection).
    const d = path.join(work, 'denostage');
    fs.mkdirSync(d, { recursive: true });
    fs.copyFileSync(process.execPath, path.join(d, s.deno.exe));
    const zip = place(s.deno.url);
    makeZip(d, zip);
    fs.writeFileSync(place(s.deno.sumUrl), `${sha256(zip)}  ${path.basename(zip)}\n`);
  }
  if (s.aria2 && real.tools.aria2c) {
    const a = path.join(work, 'ariastage', 'aria2-1.37.0-win-64bit-build1');
    fs.mkdirSync(a, { recursive: true });
    fs.copyFileSync(real.tools.aria2c, path.join(a, 'aria2c.exe'));
    makeZip(path.join(work, 'ariastage'), place(s.aria2.url));
  }
}

beforeAll(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-setup-it-'));
  real = new Engine({ bundledDir: fs.existsSync(bundledDir) ? bundledDir : undefined, userBinDir: path.join(work, 'realbin'), cacheDir: path.join(work, 'c') });
  await real.init();
  if (!real.tools.ytdlp || !real.tools.ffmpeg || !real.tools.ffprobe) throw new Error('Run "npm run setup" first');
  mirror = path.join(work, 'mirror');
  buildMirror(mirror);
  server = await startMediaServer(mirror);
});

afterAll(async () => {
  await server?.close();
  fs.rmSync(work, { recursive: true, force: true });
});

describe.skipIf(process.platform === 'darwin')('first-start tool setup', () => {
  it('downloads, verifies and unpacks yt-dlp and FFmpeg', async () => {
    const binDir = path.join(work, 'install1');
    const steps: string[] = [];
    const problems = await installTools({
      fetchImpl: fetch,
      sources: toolSources(process.platform, server.url),
      binDir,
      ffmpegDir: path.join(binDir, 'ffmpeg'),
      need: { ytdlp: true, ffmpeg: true, aria2: process.platform === 'win32' },
      onProgress: (p) => steps.push(p.step),
    });
    expect(problems).toEqual([]);
    const yt = path.join(binDir, toolSources().ytdlp.saveAs);
    expect(execFileSync(yt, ['--version'], { encoding: 'utf8' }).trim()).toMatch(/^\d{4}\./);
    expect(execFileSync(path.join(binDir, 'ffmpeg', exe('ffmpeg')), ['-version'], { encoding: 'utf8' })).toContain('ffmpeg version');
    expect(fs.existsSync(path.join(binDir, 'ffmpeg', exe('ffprobe')))).toBe(true);
    if (process.platform === 'win32' && real.tools.aria2c) expect(fs.existsSync(path.join(binDir, 'aria2c.exe'))).toBe(true);
    expect(steps.some((s) => s.includes('yt-dlp'))).toBe(true);
  });

  it('refuses a download whose checksum does not match', async () => {
    const s = toolSources(process.platform, server.url);
    const badSums = path.join(mirror, ...new URL(s.ytdlp.sumsUrl).pathname.split('/').filter(Boolean));
    const original = fs.readFileSync(badSums, 'utf8');
    fs.writeFileSync(badSums, `${'f'.repeat(64)}  ${s.ytdlp.fileName}\n`);
    try {
      const binDir = path.join(work, 'install2');
      const problems = await installTools({ fetchImpl: fetch, sources: s, binDir, ffmpegDir: path.join(binDir, 'ffmpeg'), need: { ytdlp: true, ffmpeg: false, aria2: false } });
      expect(problems.join()).toMatch(/checksum/);
      expect(fs.existsSync(path.join(binDir, s.ytdlp.saveAs))).toBe(false);
    } finally {
      fs.writeFileSync(badSums, original);
    }
  });

  it('Engine installs what is missing on first start and then uses it', async () => {
    // A computer with nothing installed: no yt-dlp/ffmpeg overrides and an almost empty PATH.
    const cleanEnv = () => {
      const env: NodeJS.ProcessEnv = { ...process.env, VD_TOOLS_BASE: server.url };
      for (const k of Object.keys(env)) if (/^(VD_YTDLP|VD_FFMPEG_DIR|VD_ARIA2C|PATH)$/i.test(k)) delete env[k];
      env.PATH = path.dirname(process.execPath);
      if (process.platform !== 'win32') env.VD_ARIA2C = '';
      env.VD_FORCE_JS_FALLBACK = '1'; // pretend the built-in runtime does not work here
      return env;
    };
    const userBin = path.join(work, 'engine-bin');
    const engine = new Engine({
      userBinDir: userBin,
      cacheDir: path.join(work, 'c2'),
      env: cleanEnv(),
      fetchImpl: fetch,
    });
    await engine.init();
    expect(engine.missing().ytdlp).toBe(true);
    expect(engine.missing().deno).toBe(true);
    const progress: string[] = [];
    await engine.ensureTools((p) => progress.push(p.step));
    expect(engine.tools.ytdlp).toBeTruthy();
    expect(engine.version).toMatch(/^\d{4}\./);
    expect(engine.tools.ffmpeg).toBeTruthy();
    expect(engine.problems()).toEqual([]);
    expect(engine.js?.kind).toBe('deno');
    expect(engine.commonArgs().join(' ')).toContain('deno:');
    expect(progress.length).toBeGreaterThan(1);
  });
});
