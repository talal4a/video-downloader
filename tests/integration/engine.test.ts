// End-to-end tests of the real download engine: yt-dlp + FFmpeg (+ aria2c when available),
// against a local web server. No internet needed (the YouTube test is opt-in).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Engine } from '../../electron/core/engine';
import { InfoService, FriendlyFailure } from '../../electron/core/info';
import { DownloadManager } from '../../electron/core/downloads';
import { defaultSettings } from '../../electron/core/settings';
import { toCommonImage } from '../../electron/core/thumbnails';
import type { DownloadRequest, Job, Settings } from '../../shared/types';
import { makeFixtures, TITLE } from '../helpers/fixtures';
import { startMediaServer, type MediaServer } from '../helpers/media-server';

const ROOT = path.resolve(__dirname, '..', '.tmp');
const osDir = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
const bundledDir = path.resolve(__dirname, '..', '..', 'resources', 'bin', osDir);

let engine: Engine;
let server: MediaServer;
let info: InfoService;
let work: string;
let settings: Settings;

function probe(file: string): { codec_type: string; codec_name: string; width?: number; height?: number }[] {
  const out = execFileSync(engine.tools.ffprobe!, ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height', '-of', 'json', file], {
    encoding: 'utf8',
  });
  return JSON.parse(out).streams;
}

function waitFor(manager: DownloadManager, id: string, timeoutMs = 120000): Promise<Job> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for job ${id}: ${JSON.stringify(manager.get(id))}`)), timeoutMs);
    const check = (job: Job) => {
      if (job.id !== id) return;
      if (['done', 'error', 'canceled'].includes(job.status)) {
        clearTimeout(timer);
        manager.off('update', check);
        resolve(job);
      }
    };
    manager.on('update', check);
    const current = manager.get(id);
    if (current) check(current);
  });
}

function newManager(over: Partial<Settings> = {}): DownloadManager {
  const s = { ...settings, ...over };
  return new DownloadManager({
    engine,
    tempRoot: path.join(work, 'temp'),
    getSettings: () => s,
    retryDelayMs: 0,
    log: (m) => process.env.VD_TEST_VERBOSE && console.log(m),
  });
}

function request(over: Partial<DownloadRequest>): DownloadRequest {
  return { url: '', title: 'Test', kind: 'video', quality: 'best', audioBitrate: 320, ...over };
}

beforeAll(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-it-'));
  engine = new Engine({
    bundledDir: fs.existsSync(bundledDir) ? bundledDir : undefined,
    userBinDir: path.join(work, 'bin'),
    cacheDir: path.join(work, 'cache'),
    jsRuntimePath: process.execPath,
    jsRuntimeIsElectron: false,
    log: (m) => process.env.VD_TEST_VERBOSE && console.log(m),
  });
  await engine.init();
  if (!engine.tools.ytdlp || !engine.tools.ffmpeg || !engine.tools.ffprobe) {
    throw new Error(`Missing tools: ${JSON.stringify(engine.tools)}. Run "npm run setup" first.`);
  }
  makeFixtures(path.join(ROOT, 'fixtures'), engine.tools.ffmpeg);
  server = await startMediaServer(path.join(ROOT, 'fixtures'));
  info = new InfoService({ engine, fetchImpl: fetch });
  settings = { ...defaultSettings(path.join(work, 'Downloads')), turbo: false, maxConcurrent: 2 };
});

afterAll(async () => {
  await server?.close();
  fs.rmSync(work, { recursive: true, force: true });
});

describe('engine', () => {
  it('finds yt-dlp and ffmpeg and reports a version', () => {
    expect(engine.version).toMatch(/^\d{4}\.\d{2}\.\d{2}/);
    expect(engine.info().ffmpeg).toBe(true);
    expect(engine.problems()).toEqual([]);
  });
});

describe('info', () => {
  it('reads title, thumbnail and qualities from a web page with a video', async () => {
    const i = await info.get(`${server.url}/page.html`);
    expect(i.title).toContain(TITLE);
    expect(i.isPlaylist).toBe(false);
    expect(i.hasVideo).toBe(true);
    expect(i.thumbnails.some((t) => t.endsWith('/thumb.webp'))).toBe(true);
  });

  it('lists every quality of a DASH stream', async () => {
    const i = await info.get(`${server.url}/dash/manifest.mpd`);
    expect(i.qualities.map((q) => q.label)).toEqual(['1080p', '720p', '360p']);
    expect(i.hasAudio).toBe(true);
  });

  it('downloads the thumbnail and converts WebP to JPG', async () => {
    const i = await info.get(`${server.url}/page.html`);
    const img = await info.thumbnail(i.key);
    expect(img?.ext).toBe('webp');
    const jpg = await toCommonImage(img!, engine.tools.ffmpeg, path.join(work, 'thumbs'));
    expect(jpg.ext).toBe('jpg');
    expect(jpg.buffer[0]).toBe(0xff);
  });

  it('gives a friendly error for a missing page', async () => {
    await expect(info.get(`${server.url}/nope.mp4`)).rejects.toSatisfy((e: unknown) => {
      return e instanceof FriendlyFailure && ['http_404', 'unavailable', 'unsupported'].includes(e.friendly.code);
    });
  });

  it('gives a friendly error for a link that is not a URL', async () => {
    await expect(info.get('hello world')).rejects.toBeInstanceOf(FriendlyFailure);
  });

  it('detects several videos on one page as a "single" playlist', async () => {
    const i = await info.get(`${server.url}/multi.html`);
    expect(i.isPlaylist).toBe(true);
    expect(i.playlistMode).toBe('single');
    expect(i.entries?.length).toBe(2);
  });
});

describe('downloads', () => {
  it('downloads 720p from a multi-quality stream and merges video + audio into MP4', async () => {
    const m = newManager();
    const job = m.add(request({ url: `${server.url}/dash/manifest.mpd`, title: 'Dash 720', quality: 720 }));
    const done = await waitFor(m, job.id);
    expect(done.status, JSON.stringify(done.error)).toBe('done');
    expect(path.basename(done.filePath!)).toBe('Dash 720.mp4');
    const streams = probe(done.filePath!);
    const v = streams.find((s) => s.codec_type === 'video')!;
    expect(v.height).toBe(720);
    expect(v.codec_name).toBe('h264');
    expect(streams.some((s) => s.codec_type === 'audio' && s.codec_name === 'aac')).toBe(true);
    expect(done.progress).toBe(1);
  });

  it('picks the best quality when asked for "best"', async () => {
    const m = newManager();
    const job = m.add(request({ url: `${server.url}/dash/manifest.mpd`, title: 'Dash best', quality: 'best' }));
    const done = await waitFor(m, job.id);
    expect(done.status).toBe('done');
    expect(probe(done.filePath!).find((s) => s.codec_type === 'video')!.height).toBe(1080);
  });

  it('converts to MP3 with cover art', async () => {
    const m = newManager();
    const job = m.add(request({ url: `${server.url}/page.html`, title: 'Song', kind: 'audio', audioBitrate: 192 }));
    const done = await waitFor(m, job.id);
    expect(done.status, JSON.stringify(done.error)).toBe('done');
    expect(done.filePath!.endsWith('Song.mp3')).toBe(true);
    const streams = probe(done.filePath!);
    expect(streams.some((s) => s.codec_type === 'audio' && s.codec_name === 'mp3')).toBe(true);
  });

  it('makes file names safe and never overwrites an existing file', async () => {
    const m = newManager();
    const a = await waitFor(m, m.add(request({ url: `${server.url}/sample.mp4`, title: TITLE })).id);
    const b = await waitFor(m, m.add(request({ url: `${server.url}/sample.mp4`, title: TITLE })).id);
    expect(a.status).toBe('done');
    expect(b.status).toBe('done');
    expect(path.basename(a.filePath!)).toBe("Ünïcödé 'Test' - Video Name 🎬.mp4");
    expect(path.basename(b.filePath!)).toBe("Ünïcödé 'Test' - Video Name 🎬 (1).mp4");
    expect(fs.existsSync(a.filePath!) && fs.existsSync(b.filePath!)).toBe(true);
  });

  it('uses multi-connection (turbo) mode when aria2c is available', async () => {
    if (!engine.tools.aria2c) return;
    const m = newManager({ turbo: true, connections: 8 });
    const before = server.requests.length;
    const seen: { progress: number; speed?: number; downloaded?: number }[] = [];
    const job = m.add(request({ url: `${server.url}/slow/big.mp4`, title: 'Turbo' }));
    m.on('update', (j: Job) => j.id === job.id && j.status === 'downloading' && seen.push({ progress: j.progress, speed: j.speed, downloaded: j.downloadedBytes }));
    const done = await waitFor(m, job.id);
    expect(done.status, JSON.stringify(done.error)).toBe('done');
    expect(done.turbo).toBe(true);
    const rangeRequests = server.requests.slice(before).filter((r) => r.includes('/big.mp4') && r.includes('bytes='));
    expect(rangeRequests.length).toBeGreaterThan(1);
    // Live progress while downloading (not only at the end).
    const middle = seen.filter((s) => s.progress > 0.05 && s.progress < 0.9);
    expect(middle.length, JSON.stringify(seen.slice(0, 20))).toBeGreaterThan(2);
    expect(middle.some((s) => (s.speed ?? 0) > 0)).toBe(true);
  });

  it('can be canceled mid-download and leaves no files behind', async () => {
    const m = newManager();
    const job = m.add(request({ url: `${server.url}/slow/big.mp4`, title: 'Cancel me' }));
    await new Promise<void>((resolve) => {
      const onUpdate = (j: Job) => {
        if (j.id === job.id && j.status === 'downloading' && j.progress > 0) {
          m.off('update', onUpdate);
          resolve();
        }
      };
      m.on('update', onUpdate);
    });
    m.cancel(job.id);
    const done = await waitFor(m, job.id);
    expect(done.status).toBe('canceled');
    await new Promise((r) => setTimeout(r, 500));
    expect(fs.existsSync(path.join(settings.downloadDir, 'Cancel me.mp4'))).toBe(false);
    const leftovers = fs.existsSync(path.join(work, 'temp')) ? fs.readdirSync(path.join(work, 'temp')).filter((d) => d.startsWith(job.id)) : [];
    expect(leftovers).toEqual([]);
  });

  it('downloads every video of a multi-video page into numbered files', async () => {
    const m = newManager();
    const job = m.add(request({ url: `${server.url}/multi.html`, title: 'Two clips', multi: true, subfolder: 'Album' }));
    const done = await waitFor(m, job.id);
    expect(done.status, JSON.stringify(done.error)).toBe('done');
    expect(done.files?.map((f) => path.basename(f))).toEqual(['Two clips - 01.mp4', 'Two clips - 02.mp4']);
    expect(path.basename(path.dirname(done.files![0]))).toBe('Album');
  });

  it('reports a clear error (without retrying forever) when the video does not exist', async () => {
    const m = newManager();
    const job = m.add(request({ url: `${server.url}/missing.mp4`, title: 'Missing' }));
    const done = await waitFor(m, job.id);
    expect(done.status).toBe('error');
    expect(done.error?.message).toBeTruthy();
  });

  it('runs downloads in parallel up to the limit and queues the rest', async () => {
    const m = newManager({ maxConcurrent: 2 });
    const jobs = [1, 2, 3].map((n) => m.add(request({ url: `${server.url}/sample.mp4`, title: `Parallel ${n}` })));
    expect(m.list().filter((j) => j.status === 'queued').length).toBe(1);
    const results = await Promise.all(jobs.map((j) => waitFor(m, j.id)));
    expect(results.every((r) => r.status === 'done')).toBe(true);
  });
});

describe.runIf(process.env.VD_TEST_YOUTUBE === '1')('youtube (internet)', () => {
  it('reads a real YouTube video', async () => {
    try {
      const i = await info.get('https://www.youtube.com/watch?v=jNQXAC9IVRw');
      expect(i.title.toLowerCase()).toContain('zoo');
      expect(i.qualities.length).toBeGreaterThan(0);
    } catch (e) {
      if (e instanceof FriendlyFailure && e.friendly.code === 'bot_check') {
        console.warn('YouTube bot check on this network (normal for cloud servers) — skipped');
        return;
      }
      throw e;
    }
  });
});
