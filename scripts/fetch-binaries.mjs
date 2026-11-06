// Downloads the free helper programs the app needs into resources/bin/<os>/:
//   yt-dlp (download engine), FFmpeg + FFprobe (merge HD video/audio, MP3), aria2 (turbo mode).
// Usage: node scripts/fetch-binaries.mjs [--os win|mac|linux] [--force]
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import extractZip from 'extract-zip';

const argv = process.argv.slice(2);
const argOs = argv.includes('--os') ? argv[argv.indexOf('--os') + 1] : null;
const force = argv.includes('--force');
const target = argOs ?? (process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux');
const outDir = path.resolve('resources', 'bin', target);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-fetch-'));
fs.mkdirSync(outDir, { recursive: true });

const YTDLP = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
const ARIA2_WIN = 'https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-win-64bit-build1.zip';
const FFMPEG_WIN = [
  'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip',
  'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip',
  'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
  'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
];
const FFMPEG_LINUX = [
  'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz',
  'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz',
];
const FFMPEG_MAC = ['https://evermeet.cx/ffmpeg/getrelease/zip', 'https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip'];

const exe = (n) => (target === 'win' ? `${n}.exe` : n);
const log = (...a) => console.log('[fetch-binaries]', ...a);

async function download(url, dest, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'video-downloader-build' }, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
      log(`downloaded ${url} (${(fs.statSync(dest).size / 1048576).toFixed(1)} MB)`);
      return;
    } catch (err) {
      if (i === tries || /HTTP 404/.test(String(err))) throw new Error(`${url}: ${err.message}`);
      log(`retry ${i} for ${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

async function firstWorking(urls, dest) {
  const errors = [];
  for (const u of urls) {
    try {
      await download(u, dest);
      return u;
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw new Error(`All downloads failed:\n${errors.join('\n')}`);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function findFiles(dir, test) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...findFiles(p, test));
    else if (test(e.name, p)) out.push(p);
  }
  return out;
}

function have(name) {
  return fs.existsSync(path.join(outDir, name)) && !force;
}

function whichSystem(name) {
  for (const d of (process.env.PATH ?? '').split(path.delimiter).concat(['/opt/homebrew/bin', '/usr/local/bin'])) {
    const p = path.join(d, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function latestYtdlpTag() {
  try {
    const res = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest', { redirect: 'manual' });
    const loc = res.headers.get('location') ?? '';
    return loc.split('/').pop() || undefined;
  } catch {
    return undefined;
  }
}

async function fetchYtdlp() {
  const name = target === 'win' ? 'yt-dlp.exe' : target === 'mac' ? 'yt-dlp_macos' : 'yt-dlp_linux';
  const dest = path.join(outDir, target === 'win' ? 'yt-dlp.exe' : name);
  if (have(path.basename(dest))) return log('yt-dlp already present');
  const tmp = path.join(work, name);
  await download(`${YTDLP}/${name}`, tmp);
  const sums = path.join(work, 'SHA2-256SUMS');
  await download(`${YTDLP}/SHA2-256SUMS`, sums);
  const expected = fs
    .readFileSync(sums, 'utf8')
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .find(([, f]) => f === name)?.[0];
  if (!expected || expected !== sha256(tmp)) throw new Error(`yt-dlp checksum mismatch for ${name}`);
  log('yt-dlp checksum OK');
  fs.copyFileSync(tmp, dest);
  if (target !== 'win') fs.chmodSync(dest, 0o755);
}

async function fetchFfmpeg() {
  if (have(exe('ffmpeg')) && have(exe('ffprobe'))) return log('ffmpeg already present');
  if (target === 'win') {
    const zip = path.join(work, 'ffmpeg.zip');
    const used = await firstWorking(FFMPEG_WIN, zip);
    log(`ffmpeg from ${used}`);
    const dir = path.join(work, 'ffmpeg');
    await extractZip(zip, { dir });
    const files = findFiles(dir, (n, p) => /[\\/]bin[\\/]/.test(p) && (/^(ffmpeg|ffprobe)\.exe$/i.test(n) || /\.dll$/i.test(n)));
    for (const f of files) fs.copyFileSync(f, path.join(outDir, path.basename(f)));
    log(`ffmpeg files: ${files.map((f) => path.basename(f)).join(', ')}`);
  } else if (target === 'linux') {
    const sys = whichSystem('ffmpeg');
    if (sys && whichSystem('ffprobe') && process.platform === 'linux' && !force) return log(`using system ffmpeg (${sys})`);
    const tar = path.join(work, 'ffmpeg.tar.xz');
    await firstWorking(FFMPEG_LINUX, tar);
    execFileSync('tar', ['-xJf', tar, '-C', work]);
    for (const f of findFiles(work, (n) => n === 'ffmpeg' || n === 'ffprobe')) {
      fs.copyFileSync(f, path.join(outDir, path.basename(f)));
      fs.chmodSync(path.join(outDir, path.basename(f)), 0o755);
    }
  } else {
    if (whichSystem('ffmpeg') && whichSystem('ffprobe') && process.platform === 'darwin' && !force) {
      return log('using Homebrew/system ffmpeg');
    }
    for (const [i, url] of FFMPEG_MAC.entries()) {
      const zip = path.join(work, `ff${i}.zip`);
      await download(url, zip);
      await extractZip(zip, { dir: path.join(work, `ff${i}`) });
    }
    for (const f of findFiles(work, (n) => n === 'ffmpeg' || n === 'ffprobe')) {
      fs.copyFileSync(f, path.join(outDir, path.basename(f)));
      fs.chmodSync(path.join(outDir, path.basename(f)), 0o755);
    }
  }
}

async function fetchAria2() {
  if (target !== 'win') {
    if (whichSystem('aria2c')) return log('using system aria2c');
    return log(`aria2 not found — turbo mode will be off. Install it with: ${target === 'mac' ? 'brew install aria2' : 'sudo apt install aria2'}`);
  }
  if (have('aria2c.exe')) return log('aria2 already present');
  const zip = path.join(work, 'aria2.zip');
  await download(ARIA2_WIN, zip);
  const dir = path.join(work, 'aria2');
  await extractZip(zip, { dir });
  const [aria] = findFiles(dir, (n) => n.toLowerCase() === 'aria2c.exe');
  if (!aria) throw new Error('aria2c.exe not found in zip');
  fs.copyFileSync(aria, path.join(outDir, 'aria2c.exe'));
}

try {
  log(`target: ${target} -> ${outDir}`);
  await fetchYtdlp();
  await fetchFfmpeg();
  await fetchAria2();
  const versions = { ytdlp: await latestYtdlpTag(), fetchedAt: new Date().toISOString() };
  const ytdlpLocal = path.join(outDir, target === 'win' ? 'yt-dlp.exe' : target === 'mac' ? 'yt-dlp_macos' : 'yt-dlp_linux');
  const sameOs = (target === 'win') === (process.platform === 'win32') && (target === 'mac') === (process.platform === 'darwin');
  if (sameOs && fs.existsSync(ytdlpLocal)) {
    try {
      versions.ytdlp = execFileSync(ytdlpLocal, ['--version'], { encoding: 'utf8' }).trim();
    } catch {
      /* keep tag */
    }
  }
  fs.writeFileSync(path.join(outDir, 'versions.json'), JSON.stringify(versions, null, 2));
  log('done:', fs.readdirSync(outDir).join(', '));
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
