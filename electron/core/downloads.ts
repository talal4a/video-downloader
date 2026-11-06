import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { DownloadRequest, FriendlyError, Job, Settings } from '../../shared/types';
import type { Engine } from './engine';
import { classifyError, friendly, isRetryable } from './errors';
import {
  ensureDir,
  MEDIA_EXTENSIONS,
  moveFile,
  removeDir,
  sanitizeFileName,
  SUBTITLE_EXTENSIONS,
  uniquePath,
} from './files';
import { readAria2Progress } from './aria2';
import { run, type RunHandle } from './process';
import { buildDownloadArgs, parseProgressLine, POSTPROCESSOR_LABELS, type ProgressEvent } from './ytdlp';

export interface ManagerDeps {
  engine: Engine;
  /** Folder for in-progress downloads (cleaned up after each job). */
  tempRoot: string;
  getSettings: () => Settings;
  cookiesFor?: (url: string) => Promise<string | undefined>;
  log?: (msg: string) => void;
  /** Wait between retries (ms). Tests set this to 0. */
  retryDelayMs?: number;
}

interface Part {
  key: string;
  formatId?: string;
  start: number;
  end: number;
  downloaded: number;
  total?: number;
}

interface Item {
  job: Job;
  handle?: RunHandle;
  cancelRequested: boolean;
  disableTurbo: boolean;
  engineUpdated: boolean;
  safeMode: boolean;
  parts: Map<string, Part>;
  current?: Part;
  lastEmit: number;
  lastErrorLines: string[];
}

export interface CollectedMedia {
  path: string;
  ext: string;
  index: number;
  subtitles: { path: string; lang: string; ext: string }[];
}

const MAX_ATTEMPTS = 3;
const EXTRAS_RE = /thumbnail|subtitle|EmbedThumbnail|Metadata|AtomicParsley|mutagen|Postprocessing: (?!Conversion failed)/i;

/** Find the finished files yt-dlp produced in a job folder. */
export async function collectOutputs(dir: string, req: DownloadRequest): Promise<CollectedMedia[]> {
  let names: string[] = [];
  try {
    names = await fsp.readdir(dir);
  } catch {
    return [];
  }
  const media = new Map<string, CollectedMedia[]>();
  const subs: { stem: string; path: string; lang: string; ext: string }[] = [];
  for (const name of names) {
    if (/\.(part|ytdl|temp|tmp|aria2)$/i.test(name) || /\.part-Frag|\.temp\./i.test(name)) continue;
    const sub = /^(media|\d+|NA)\.([\w@-]+)\.(\w+)$/i.exec(name);
    if (sub && SUBTITLE_EXTENSIONS.has(sub[3].toLowerCase())) {
      subs.push({ stem: sub[1], path: path.join(dir, name), lang: sub[2], ext: sub[3].toLowerCase() });
      continue;
    }
    const m = /^(media|\d+|NA)\.(\w+)$/i.exec(name);
    if (!m) continue;
    const ext = m[2].toLowerCase();
    if (!MEDIA_EXTENSIONS.has(ext)) continue;
    const list = media.get(m[1]) ?? [];
    list.push({ path: path.join(dir, name), ext, index: /^\d+$/.test(m[1]) ? Number(m[1]) : 1, subtitles: [] });
    media.set(m[1], list);
  }
  const preferred = req.kind === 'audio' ? ['mp3', 'm4a', 'opus', 'ogg', 'webm'] : ['mp4', 'mkv', 'webm', 'mov'];
  const out: CollectedMedia[] = [];
  for (const [stem, list] of media) {
    list.sort((a, b) => {
      const ia = preferred.indexOf(a.ext);
      const ib = preferred.indexOf(b.ext);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    const chosen = list[0];
    chosen.subtitles = subs.filter((s) => s.stem === stem).map(({ path: p, lang, ext }) => ({ path: p, lang, ext }));
    out.push(chosen);
  }
  return out.sort((a, b) => a.index - b.index);
}

export class DownloadManager extends EventEmitter {
  private items = new Map<string, Item>();
  private order: string[] = [];

  constructor(private readonly deps: ManagerDeps) {
    super();
  }

  // ---------------------------------------------------------------- public API

  list(): Job[] {
    return [...this.order].reverse().map((id) => this.items.get(id)!.job);
  }

  get(id: string): Job | undefined {
    return this.items.get(id)?.job;
  }

  hasActive(): boolean {
    return [...this.items.values()].some((it) => isActive(it.job));
  }

  activeJobs(): Job[] {
    return [...this.items.values()].map((it) => it.job).filter(isActive);
  }

  /** Restore finished jobs from history. Jobs that were running when the app closed become "interrupted". */
  restore(jobs: Job[]): void {
    for (const j of jobs.slice(0, 500).reverse()) {
      if (!j || !j.id || this.items.has(j.id) || !j.request?.url) continue;
      const job: Job = { ...j };
      if (isActive(job)) {
        job.status = 'error';
        job.error = friendly('interrupted', 'The download stopped because the app was closed.', 'Click Retry to start it again.');
        job.speed = undefined;
        job.eta = undefined;
      }
      this.items.set(job.id, this.newItem(job));
      this.order.push(job.id);
    }
  }

  add(req: DownloadRequest): Job {
    const job: Job = {
      id: crypto.randomBytes(8).toString('hex'),
      request: { ...req },
      status: 'queued',
      stage: 'Waiting…',
      progress: 0,
      createdAt: Date.now(),
      attempts: 0,
    };
    this.items.set(job.id, this.newItem(job));
    this.order.push(job.id);
    this.emitUpdate(job.id, true);
    this.pump();
    return job;
  }

  cancel(id: string): void {
    const it = this.items.get(id);
    if (!it || !isActive(it.job)) return;
    it.cancelRequested = true;
    if (it.handle) {
      it.job.stage = 'Canceling…';
      this.emitUpdate(id, true);
      it.handle.kill();
    } else {
      this.finish(it, 'canceled');
    }
  }

  retry(id: string): Job | undefined {
    const it = this.items.get(id);
    if (!it || isActive(it.job)) return it?.job;
    const job = it.job;
    Object.assign(job, {
      status: 'queued',
      stage: 'Waiting…',
      progress: 0,
      error: undefined,
      warnings: undefined,
      speed: undefined,
      eta: undefined,
      downloadedBytes: undefined,
      totalBytes: undefined,
      finishedAt: undefined,
      attempts: 0,
    } satisfies Partial<Job>);
    it.cancelRequested = false;
    it.disableTurbo = false;
    it.engineUpdated = false;
    it.safeMode = false;
    // Move to the top of the list.
    this.order = this.order.filter((x) => x !== id);
    this.order.push(id);
    this.emitUpdate(id, true);
    this.pump();
    return job;
  }

  remove(id: string): void {
    const it = this.items.get(id);
    if (!it) return;
    if (isActive(it.job)) this.cancel(id);
    this.items.delete(id);
    this.order = this.order.filter((x) => x !== id);
    this.emit('removed', id);
    this.emit('changed');
  }

  clearFinished(): void {
    for (const it of [...this.items.values()]) {
      if (!isActive(it.job)) this.remove(it.job.id);
    }
  }

  cancelAll(): void {
    for (const it of this.items.values()) if (isActive(it.job)) this.cancel(it.job.id);
  }

  // ---------------------------------------------------------------- internals

  private newItem(job: Job): Item {
    return {
      job,
      cancelRequested: false,
      disableTurbo: false,
      engineUpdated: false,
      safeMode: false,
      parts: new Map(),
      lastEmit: 0,
      lastErrorLines: [],
    };
  }

  private emitUpdate(id: string, force = false): void {
    const it = this.items.get(id);
    if (!it) return;
    const now = Date.now();
    if (!force && now - it.lastEmit < 250) return;
    it.lastEmit = now;
    this.emit('update', { ...it.job });
    if (force) this.emit('changed');
  }

  private running(): number {
    return [...this.items.values()].filter((it) => ['starting', 'downloading', 'processing'].includes(it.job.status)).length;
  }

  private pump(): void {
    const max = Math.max(1, this.deps.getSettings().maxConcurrent || 1);
    const queued = this.order.map((id) => this.items.get(id)!).filter((it) => it.job.status === 'queued');
    for (const it of queued) {
      if (this.running() >= max) break;
      it.job.status = 'starting';
      it.job.stage = 'Starting…';
      it.job.startedAt = Date.now();
      this.emitUpdate(it.job.id, true);
      void this.runJob(it).catch((err) => {
        this.deps.log?.(`Job ${it.job.id} crashed: ${(err as Error).stack ?? err}`);
        it.job.error = friendly('unknown', 'Something went wrong.', 'Please try again.', String(err));
        this.finish(it, 'error');
      });
    }
  }

  private finish(it: Item, status: Job['status']): void {
    const job = it.job;
    job.status = status;
    job.finishedAt = Date.now();
    job.speed = undefined;
    job.eta = undefined;
    if (status === 'done') {
      job.progress = 1;
      job.stage = undefined;
    } else if (status === 'canceled') {
      job.stage = undefined;
    } else if (status === 'error') {
      job.stage = undefined;
    }
    this.emitUpdate(job.id, true);
    this.emit('finished', { ...job });
    setImmediate(() => this.pump());
  }

  private async runJob(it: Item): Promise<void> {
    const { engine } = this.deps;
    const job = it.job;
    const req = job.request;
    if (!engine.tools.ytdlp) {
      job.error = friendly('engine_missing', 'The download engine is missing.', 'Please reinstall Video Downloader.');
      return this.finish(it, 'error');
    }

    while (true) {
      if (it.cancelRequested) return this.finish(it, 'canceled');
      job.attempts++;
      const settings = this.deps.getSettings();
      const useTurbo = settings.turbo && Boolean(engine.tools.aria2c) && !it.disableTurbo;
      job.turbo = useTurbo;
      const outDir = path.join(this.deps.tempRoot, `${job.id}-${job.attempts}`);
      await ensureDir(outDir);
      const cookies = await this.deps.cookiesFor?.(req.url).catch(() => undefined);
      const args = buildDownloadArgs({
        req,
        outDir,
        common: engine.commonArgs(),
        turbo: useTurbo,
        connections: settings.connections,
        cookiesFile: cookies,
        safeMode: it.safeMode,
      });
      it.parts.clear();
      it.current = undefined;
      it.lastErrorLines = [];
      job.progress = 0;
      this.deps.log?.(`Job ${job.id} attempt ${job.attempts} turbo=${useTurbo}: ${req.url}`);

      const handle = run(engine.tools.ytdlp, args, {
        env: engine.childEnv(),
        onLine: (line) => this.onLine(it, line),
      });
      it.handle = handle;
      const stopPolling = useTurbo ? this.pollAria2(it, outDir) : () => {};
      const result = await handle.done;
      stopPolling();
      it.handle = undefined;

      if (it.cancelRequested) {
        await removeDir(outDir);
        return this.finish(it, 'canceled');
      }

      const outputs = await collectOutputs(outDir, req);
      if (outputs.length > 0) {
        job.status = 'processing';
        job.stage = 'Saving file…';
        this.emitUpdate(job.id, true);
        try {
          job.files = await this.saveOutputs(job, outputs);
          job.filePath = job.files[0];
          job.warnings = this.collectWarnings(it, outputs, result.code);
          await removeDir(outDir);
          return this.finish(it, 'done');
        } catch (err) {
          await removeDir(outDir);
          job.error = classifyError(`ERROR: ${(err as Error).message}`);
          if (job.error.code === 'unknown') {
            job.error = friendly('save_failed', 'The file was downloaded but could not be saved.', 'Check the download folder in Settings.', String(err));
          }
          return this.finish(it, 'error');
        }
      }

      await removeDir(outDir);
      const error: FriendlyError = result.spawnError
        ? friendly('engine_missing', 'The download engine could not start.', 'Please reinstall Video Downloader.', result.spawnError.message)
        : classifyError(result.tail);
      this.deps.log?.(`Job ${job.id} failed (${error.code}): ${error.details ?? ''}`);

      // Optional extras (cover art, subtitles, metadata) must never stop the video itself.
      if (!it.safeMode && job.attempts < MAX_ATTEMPTS + 1 && failedOnExtras(result.tail, error.details)) {
        it.safeMode = true;
        job.stage = 'Retrying without extras…';
        this.emitUpdate(job.id, true);
        continue;
      }
      const canRetry = job.attempts < MAX_ATTEMPTS && (isRetryable(error) || error.code === 'format_unavailable');
      if (canRetry) {
        if (useTurbo) {
          // Some servers reject many parallel connections; fall back to the normal downloader.
          it.disableTurbo = true;
          job.stage = 'Retrying in normal mode…';
          this.emitUpdate(job.id, true);
          continue;
        }
        if ((error.code === 'extractor' || error.code === 'http_403' || error.code === 'format_unavailable') && !it.engineUpdated) {
          it.engineUpdated = true;
          job.stage = 'Updating the download engine…';
          job.status = 'starting';
          this.emitUpdate(job.id, true);
          await engine.update().catch(() => {});
          continue;
        }
        if (error.code === 'network' || error.code === 'timeout' || error.code === 'rate_limited' || error.code === 'unknown') {
          job.stage = 'Connection problem — retrying…';
          job.status = 'starting';
          this.emitUpdate(job.id, true);
          await sleep((this.deps.retryDelayMs ?? 4000) * job.attempts);
          continue;
        }
      }
      job.error = error;
      return this.finish(it, 'error');
    }
  }

  /** aria2 does not report progress through a pipe, so read its control file every 700 ms. */
  private pollAria2(it: Item, dir: string): () => void {
    let stopped = false;
    let last: { bytes: number; at: number; speed?: number } | null = null;
    const tick = async () => {
      if (stopped) return;
      const p = await readAria2Progress(dir);
      if (stopped || !p) return;
      const now = Date.now();
      let speed = last?.speed;
      if (last && p.completed >= last.bytes && now > last.at) {
        const instant = ((p.completed - last.bytes) * 1000) / (now - last.at);
        speed = speed === undefined ? instant : speed * 0.6 + instant * 0.4;
      } else if (last && p.completed < last.bytes) {
        speed = undefined; // a new file started
      }
      last = { bytes: p.completed, at: now, speed };
      const eta = speed && speed > 0 ? (p.total - p.completed) / speed : undefined;
      this.applyEvent(it, {
        type: 'aria2',
        downloaded: p.completed,
        total: p.total,
        percent: (p.completed / p.total) * 100,
        speed: speed ?? 0,
        eta,
      });
    };
    const timer = setInterval(() => void tick(), 700);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }

  private collectWarnings(it: Item, outputs: CollectedMedia[], exitCode: number | null): string[] | undefined {
    const req = it.job.request;
    const warnings: string[] = [];
    if (req.kind === 'video' && req.subtitles?.lang && outputs.every((o) => o.subtitles.length === 0)) {
      warnings.push('Subtitles could not be saved for this video.');
    }
    if (it.safeMode && req.kind === 'audio') warnings.push('The cover picture could not be added to this MP3.');
    if (req.kind === 'audio' && outputs.some((o) => o.ext !== 'mp3')) {
      warnings.push('Could not convert to MP3, so the original audio file was saved.');
    }
    if (req.kind === 'video' && outputs.some((o) => o.ext !== 'mp4')) {
      warnings.push('This video could not be put in an MP4 file, so it was saved in its original format.');
    }
    if (req.multi && exitCode !== 0 && it.job.itemCount && outputs.length < it.job.itemCount) {
      warnings.push(`${it.job.itemCount - outputs.length} of ${it.job.itemCount} items could not be downloaded.`);
    }
    return warnings.length ? warnings : undefined;
  }

  private async saveOutputs(job: Job, outputs: CollectedMedia[]): Promise<string[]> {
    const req = job.request;
    const settings = this.deps.getSettings();
    let dir = settings.downloadDir;
    if (req.subfolder) dir = path.join(dir, sanitizeFileName(req.subfolder, 80));
    await ensureDir(dir);
    const base = sanitizeFileName(req.title);
    const saved: string[] = [];
    for (const [i, out] of outputs.entries()) {
      const name = outputs.length > 1 || req.multi ? `${base} - ${String(out.index || i + 1).padStart(2, '0')}` : base;
      const target = uniquePath(dir, name, out.ext);
      await moveFile(out.path, target);
      saved.push(target);
      const stem = path.basename(target, `.${out.ext}`);
      for (const sub of out.subtitles) {
        await moveFile(sub.path, uniquePath(dir, `${stem}.${sanitizeFileName(sub.lang, 20)}`, sub.ext));
      }
    }
    return saved;
  }

  // ---------------------------------------------------------------- progress

  private onLine(it: Item, line: string): void {
    if (/^ERROR:/i.test(line)) it.lastErrorLines.push(line);
    const ev = parseProgressLine(line);
    if (!ev) return;
    // In turbo mode aria2's own lines arrive late (buffered); the control-file poller is used instead.
    if (ev.type === 'aria2' && it.job.turbo) return;
    this.applyEvent(it, ev);
  }

  private startPart(it: Item, key: string, kind: 'video-only' | 'audio-only' | 'combined'): Part {
    const existing = it.parts.get(key);
    if (existing) return existing;
    const req = it.job.request;
    let start = 0;
    let end = 1;
    if (req.kind === 'video') {
      if (kind === 'video-only') end = 0.92;
      else if (kind === 'audio-only' && it.parts.size > 0) start = 0.92;
    }
    const part: Part = { key, start, end, downloaded: 0 };
    it.parts.set(key, part);
    return part;
  }

  private applyEvent(it: Item, ev: ProgressEvent): void {
    const job = it.job;
    const req = job.request;
    switch (ev.type) {
      case 'item': {
        job.itemIndex = ev.index;
        job.itemCount = ev.count;
        it.parts.clear();
        it.current = undefined;
        break;
      }
      case 'destination': {
        // e.g. "media.f137.mp4" (part of a merge) or "media.mp4" (single file)
        const base = path.basename(ev.file);
        if (/\.(jpg|jpeg|png|webp|srt|vtt)$/i.test(base)) return;
        const isPart = /\.f[\w-]+\.\w+$/.test(base);
        const kind: 'video-only' | 'audio-only' | 'combined' = !isPart
          ? 'combined'
          : it.parts.size === 0
            ? 'video-only'
            : 'audio-only';
        it.current = this.startPart(it, `${job.itemIndex ?? 1}:${base}`, kind);
        job.status = 'downloading';
        job.stage = req.kind === 'audio' || kind === 'audio-only' ? 'Downloading audio' : 'Downloading video';
        if (job.itemCount && job.itemCount > 1) job.stage += ` (${job.itemIndex ?? 1} of ${job.itemCount})`;
        break;
      }
      case 'download': {
        if (ev.playlistIndex && req.multi) job.itemIndex = ev.playlistIndex;
        if (ev.playlistCount && req.multi) job.itemCount = ev.playlistCount;
        const audioOnly = ev.vcodec === 'none';
        const videoOnly = !audioOnly && ev.acodec === 'none';
        const kind = audioOnly ? 'audio-only' : videoOnly ? 'video-only' : 'combined';
        const formatId = ev.formatId ?? '?';
        // The "Destination" line normally created the part already; bind it to this format.
        let part = it.current;
        if (!part || (part.formatId && part.formatId !== formatId)) {
          part = this.startPart(it, `${job.itemIndex ?? 1}:${formatId}`, kind);
          it.current = part;
        }
        if (!part.formatId) {
          part.formatId = formatId;
          // Correct the guessed share of the progress bar now that we know what this stream is.
          if (part.downloaded === 0 && req.kind === 'video') {
            const isFirst = [...it.parts.values()][0] === part;
            part.start = kind === 'audio-only' && !isFirst ? 0.92 : 0;
            part.end = kind === 'video-only' ? 0.92 : 1;
          }
        }
        if (ev.downloaded != null) part.downloaded = ev.downloaded;
        if (ev.total) part.total = ev.total;
        if (ev.status === 'finished') {
          part.downloaded = ev.total ?? ev.downloaded ?? part.downloaded;
          part.total = part.downloaded;
        }
        job.status = 'downloading';
        job.speed = ev.status === 'finished' ? undefined : ev.speed;
        job.eta = ev.status === 'finished' ? undefined : ev.eta;
        job.stage = req.kind === 'audio' || audioOnly ? 'Downloading audio' : 'Downloading video';
        if (job.itemCount && job.itemCount > 1) job.stage += ` (${job.itemIndex ?? 1} of ${job.itemCount})`;
        this.updateProgress(it);
        break;
      }
      case 'aria2': {
        const part = it.current ?? this.startPart(it, `${job.itemIndex ?? 1}:aria2`, 'combined');
        it.current = part;
        part.downloaded = ev.downloaded;
        part.total = ev.total || part.total;
        job.status = 'downloading';
        job.speed = ev.speed;
        job.eta = ev.eta;
        this.updateProgress(it);
        break;
      }
      case 'postprocess': {
        if (ev.status === 'started') {
          job.status = 'processing';
          job.stage = POSTPROCESSOR_LABELS[ev.name] ?? 'Finishing…';
          job.speed = undefined;
          job.eta = undefined;
        }
        break;
      }
    }
    this.emitUpdate(job.id, ev.type === 'postprocess' || ev.type === 'destination');
  }

  private updateProgress(it: Item): void {
    const job = it.job;
    const part = it.current;
    if (!part) return;
    const frac = part.total ? Math.min(1, part.downloaded / part.total) : 0;
    const itemProgress = part.start + (part.end - part.start) * frac;
    let overall = itemProgress;
    if (job.request.multi && job.itemCount && job.itemCount > 1) {
      overall = ((job.itemIndex ?? 1) - 1 + itemProgress) / job.itemCount;
    }
    job.progress = Math.max(job.progress, Math.min(0.999, overall));
    let downloaded = 0;
    let total = 0;
    for (const p of it.parts.values()) {
      downloaded += p.downloaded;
      total += p.total ?? p.downloaded;
    }
    job.downloadedBytes = downloaded;
    job.totalBytes = total || undefined;
  }
}

/** Did the run die while handling cover art / subtitles / metadata (rather than the video itself)? */
export function failedOnExtras(tail: string, details?: string): boolean {
  if (details && EXTRAS_RE.test(details)) return true;
  const lines = tail.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('VDPROG') && !l.startsWith('[#'));
  const errIdx = lines.findIndex((l) => /^ERROR:/.test(l));
  if (errIdx < 0) return false;
  const before = lines.slice(Math.max(0, errIdx - 2), errIdx + 1).join('\n');
  return /Downloading (video )?thumbnail|Writing video subtitles|Downloading subtitles|\[(EmbedThumbnail|ThumbnailsConvertor|Metadata|SubtitlesConvertor)\]/i.test(before);
}

function isActive(job: Job): boolean {
  return job.status === 'queued' || job.status === 'starting' || job.status === 'downloading' || job.status === 'processing';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
