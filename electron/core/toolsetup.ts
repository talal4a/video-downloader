// Downloads missing helper programs (yt-dlp, FFmpeg, aria2) from their official releases.
// Used on first start when the installer did not include them, or when an antivirus removed one.
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { run } from './process';
import { extractZip } from './unzip';
import type { FetchLike } from './thumbnails';

export interface SetupProgress {
  step: string;
  /** 0..1 for the current step, when known */
  progress?: number;
  error?: string;
}

export interface ToolSources {
  ytdlp: { url: string; sumsUrl: string; fileName: string; saveAs: string };
  ffmpeg: { urls: string[]; archive: 'zip' | 'tar.xz'; pick: RegExp }[];
  aria2?: { url: string; pick: RegExp };
  /** Deno: JavaScript runtime for YouTube, only fetched if the app's own Node.js cannot be used. */
  deno?: { url: string; sumUrl: string; exe: string };
}

function denoAsset(platform: NodeJS.Platform, arch: string): string | null {
  const a = arch === 'arm64' ? 'aarch64' : arch === 'x64' ? 'x86_64' : null;
  if (!a) return null;
  if (platform === 'win32') return a === 'x86_64' ? 'deno-x86_64-pc-windows-msvc.zip' : null;
  if (platform === 'darwin') return `deno-${a}-apple-darwin.zip`;
  if (platform === 'linux') return `deno-${a}-unknown-linux-gnu.zip`;
  return null;
}

function withDeno(s: ToolSources, platform: NodeJS.Platform, base: string): ToolSources {
  const asset = denoAsset(platform, process.arch);
  if (!asset) return s;
  const url = `${base}/denoland/deno/releases/latest/download/${asset}`;
  return { ...s, deno: { url, sumUrl: `${url}.sha256sum`, exe: platform === 'win32' ? 'deno.exe' : 'deno' } };
}

const GH = 'https://github.com';

/** Official download locations. `base` replaces https://github.com (used by tests). */
export function toolSources(platform: NodeJS.Platform = process.platform, base = GH): ToolSources {
  return withDeno(baseSources(platform, base), platform, base);
}

function baseSources(platform: NodeJS.Platform, base: string): ToolSources {
  const ytBase = `${base}/yt-dlp/yt-dlp/releases/latest/download`;
  if (platform === 'win32') {
    return {
      ytdlp: { url: `${ytBase}/yt-dlp.exe`, sumsUrl: `${ytBase}/SHA2-256SUMS`, fileName: 'yt-dlp.exe', saveAs: 'yt-dlp.exe' },
      ffmpeg: [
        {
          urls: [
            `${base}/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip`,
            `${base}/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip`,
            `${base}/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip`,
            `${base}/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip`,
          ],
          archive: 'zip',
          pick: /[\\/]bin[\\/]([^\\/]+\.dll|ffmpeg\.exe|ffprobe\.exe)$/i,
        },
      ],
      aria2: {
        url: `${base}/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-win-64bit-build1.zip`,
        pick: /[\\/]aria2c\.exe$/i,
      },
    };
  }
  if (platform === 'darwin') {
    return {
      ytdlp: { url: `${ytBase}/yt-dlp_macos`, sumsUrl: `${ytBase}/SHA2-256SUMS`, fileName: 'yt-dlp_macos', saveAs: 'yt-dlp_macos' },
      ffmpeg: [
        { urls: ['https://evermeet.cx/ffmpeg/getrelease/zip'], archive: 'zip', pick: /[\\/]ffmpeg$/ },
        { urls: ['https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip'], archive: 'zip', pick: /[\\/]ffprobe$/ },
      ],
    };
  }
  return {
    ytdlp: { url: `${ytBase}/yt-dlp_linux`, sumsUrl: `${ytBase}/SHA2-256SUMS`, fileName: 'yt-dlp_linux', saveAs: 'yt-dlp_linux' },
    ffmpeg: [
      {
        urls: [`${base}/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz`],
        archive: 'tar.xz',
        pick: /[\\/]bin[\\/](ffmpeg|ffprobe)$/,
      },
    ],
  };
}

async function download(fetchImpl: FetchLike, url: string, dest: string, onProgress?: (p: number) => void): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': 'VideoDownloader' }, redirect: 'follow' });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
      const total = Number(res.headers.get('content-length')) || 0;
      let received = 0;
      const body = Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream);
      body.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (total && onProgress) onProgress(Math.min(1, received / total));
      });
      await pipeline(body, fs.createWriteStream(dest));
      return;
    } catch (err) {
      lastError = err;
      if (/HTTP 404/.test(String(err))) break;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

async function extract(archive: string, kind: 'zip' | 'tar.xz', into: string): Promise<void> {
  await fsp.mkdir(into, { recursive: true });
  if (kind === 'zip') {
    await extractZip(archive, into);
    return;
  }
  const r = await run('tar', ['-xJf', archive, '-C', into]).done;
  if (r.code !== 0) throw new Error(`tar failed: ${r.tail}`);
}

export interface InstallOptions {
  fetchImpl: FetchLike;
  sources: ToolSources;
  /** Where yt-dlp and aria2 go. */
  binDir: string;
  /** Where FFmpeg (and its DLLs) go. */
  ffmpegDir: string;
  need: { ytdlp: boolean; ffmpeg: boolean; aria2: boolean; deno?: boolean };
  onProgress?: (p: SetupProgress) => void;
  log?: (msg: string) => void;
}

/** Install the missing tools. Returns a list of problems (empty when everything worked). */
export async function installTools(opts: InstallOptions): Promise<string[]> {
  const problems: string[] = [];
  const work = await fsp.mkdtemp(path.join(os.tmpdir(), 'vd-setup-'));
  const report = (step: string, progress?: number) => opts.onProgress?.({ step, progress });
  try {
    await fsp.mkdir(opts.binDir, { recursive: true });
    if (opts.need.ytdlp) {
      try {
        const s = opts.sources.ytdlp;
        report('Downloading the download engine (yt-dlp)…', 0);
        const tmp = path.join(work, s.fileName);
        await download(opts.fetchImpl, s.url, tmp, (p) => report('Downloading the download engine (yt-dlp)…', p));
        const sums = path.join(work, 'sums.txt');
        await download(opts.fetchImpl, s.sumsUrl, sums);
        const expected = (await fsp.readFile(sums, 'utf8'))
          .split('\n')
          .map((l) => l.trim().split(/\s+/))
          .find(([, name]) => name === s.fileName)?.[0];
        const actual = crypto.createHash('sha256').update(await fsp.readFile(tmp)).digest('hex');
        if (!expected || expected.toLowerCase() !== actual) throw new Error('checksum does not match');
        const dest = path.join(opts.binDir, s.saveAs);
        await fsp.copyFile(tmp, dest);
        if (process.platform !== 'win32') await fsp.chmod(dest, 0o755);
        opts.log?.(`Installed yt-dlp to ${dest}`);
      } catch (err) {
        problems.push(`Could not download yt-dlp: ${(err as Error).message}`);
      }
    }
    if (opts.need.ffmpeg) {
      try {
        await fsp.mkdir(opts.ffmpegDir, { recursive: true });
        for (const [i, part] of opts.sources.ffmpeg.entries()) {
          const label = 'Downloading FFmpeg (for HD video and MP3)…';
          let ok = false;
          let lastErr: unknown;
          for (const url of part.urls) {
            const archive = path.join(work, `ffmpeg-${i}.${part.archive}`);
            try {
              report(label, 0);
              await download(opts.fetchImpl, url, archive, (p) => report(label, p));
              report('Unpacking FFmpeg…');
              const dir = path.join(work, `ffmpeg-${i}`);
              await extract(archive, part.archive, dir);
              const picked = listFiles(dir).filter((f) => part.pick.test(f));
              if (!picked.length) throw new Error('nothing found in archive');
              for (const f of picked) {
                const dest = path.join(opts.ffmpegDir, path.basename(f));
                await fsp.copyFile(f, dest);
                if (process.platform !== 'win32') await fsp.chmod(dest, 0o755);
              }
              opts.log?.(`Installed FFmpeg from ${url}`);
              ok = true;
              break;
            } catch (err) {
              lastErr = err;
              opts.log?.(`FFmpeg source failed (${url}): ${(err as Error).message}`);
            }
          }
          if (!ok) throw lastErr instanceof Error ? lastErr : new Error('download failed');
        }
      } catch (err) {
        problems.push(`Could not download FFmpeg: ${(err as Error).message}`);
      }
    }
    if (opts.need.deno && opts.sources.deno) {
      try {
        const d = opts.sources.deno;
        const label = 'Downloading the YouTube helper (Deno)…';
        report(label, 0);
        const zip = path.join(work, 'deno.zip');
        await download(opts.fetchImpl, d.url, zip, (p) => report(label, p));
        const sumFile = path.join(work, 'deno.sha256');
        await download(opts.fetchImpl, d.sumUrl, sumFile);
        const expected = /\b[a-f0-9]{64}\b/i.exec(await fsp.readFile(sumFile, 'utf8'))?.[0]?.toLowerCase();
        const actual = crypto.createHash('sha256').update(await fsp.readFile(zip)).digest('hex');
        if (!expected || expected !== actual) throw new Error('checksum does not match');
        const dir = path.join(work, 'deno');
        await extract(zip, 'zip', dir);
        const bin = listFiles(dir).find((f) => path.basename(f) === d.exe);
        if (!bin) throw new Error('deno not found in archive');
        const dest = path.join(opts.binDir, d.exe);
        await fsp.copyFile(bin, dest);
        if (process.platform !== 'win32') await fsp.chmod(dest, 0o755);
      } catch (err) {
        // Not fatal: YouTube still works, but may offer fewer qualities.
        opts.log?.(`Deno install failed: ${(err as Error).message}`);
      }
    }
    if (opts.need.aria2 && opts.sources.aria2) {
      try {
        const label = 'Downloading turbo mode (aria2)…';
        report(label, 0);
        const zip = path.join(work, 'aria2.zip');
        await download(opts.fetchImpl, opts.sources.aria2.url, zip, (p) => report(label, p));
        const dir = path.join(work, 'aria2');
        await extract(zip, 'zip', dir);
        const exe = listFiles(dir).find((f) => opts.sources.aria2!.pick.test(f));
        if (!exe) throw new Error('aria2c not found in archive');
        await fsp.copyFile(exe, path.join(opts.binDir, path.basename(exe)));
      } catch (err) {
        // Turbo mode is optional: downloads still work without it.
        opts.log?.(`aria2 install failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await fsp.rm(work, { recursive: true, force: true }).catch(() => {});
  }
  return problems;
}
