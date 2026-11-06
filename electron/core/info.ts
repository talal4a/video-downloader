import crypto from 'node:crypto';
import type { FriendlyError, MediaInfo } from '../../shared/types';
import type { Engine } from './engine';
import { classifyError, friendly } from './errors';
import { run } from './process';
import { fetchFirstImage, type FetchLike, type ImageResult } from './thumbnails';
import { normalizeUrl, safeParseUrl } from './urls';
import { buildInfoArgs, parseInfo } from './ytdlp';

export class FriendlyFailure extends Error {
  constructor(public readonly friendly: FriendlyError) {
    super(friendly.message);
  }
}

export interface InfoDeps {
  engine: Engine;
  fetchImpl: FetchLike;
  cookiesFor?: (url: string) => Promise<string | undefined>;
  log?: (msg: string) => void;
  timeoutMs?: number;
}

const CACHE_MS = 10 * 60 * 1000;

export class InfoService {
  private cache = new Map<string, { info: MediaInfo; at: number }>();
  private byKey = new Map<string, MediaInfo>();
  private thumbs = new Map<string, Promise<ImageResult | null>>();
  private engineUpdatedAt = 0;

  constructor(private readonly deps: InfoDeps) {}

  getByKey(key: string): MediaInfo | undefined {
    return this.byKey.get(key);
  }

  async get(input: string): Promise<MediaInfo> {
    const url = normalizeUrl(input);
    if (!safeParseUrl(url)) {
      throw new FriendlyFailure(friendly('invalid_url', "That doesn't look like a valid link.", 'Copy the full link from the address bar or the Share button.'));
    }
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.info;

    const engine = this.deps.engine;
    if (!engine.tools.ytdlp) {
      throw new FriendlyFailure(friendly('engine_missing', 'The download engine is missing.', 'Please reinstall Video Downloader.'));
    }

    let lastError: FriendlyError | undefined;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const cookies = await this.deps.cookiesFor?.(url).catch(() => undefined);
      const h = run(engine.tools.ytdlp, buildInfoArgs(engine.commonArgs(), url, cookies), {
        env: engine.childEnv(),
        collectStdout: true,
        timeoutMs: this.deps.timeoutMs ?? 120000,
      });
      const r = await h.done;
      const out = r.stdout.trim();
      if (out.startsWith('{')) {
        try {
          const raw = JSON.parse(out);
          const key = crypto.randomBytes(8).toString('hex');
          const info = parseInfo(raw, url, key);
          this.cache.set(url, { info, at: Date.now() });
          this.byKey.set(key, info);
          if (this.byKey.size > 200) this.byKey.delete(this.byKey.keys().next().value as string);
          return info;
        } catch (err) {
          lastError = friendly('extractor', 'Could not read the video details.', 'Please try again.', String(err));
        }
      } else if (r.timedOut) {
        lastError = friendly('timeout', 'The site took too long to answer.', 'Check your internet connection and try again.');
      } else if (r.spawnError) {
        lastError = friendly('engine_missing', 'The download engine could not start.', 'Please reinstall Video Downloader.', r.spawnError.message);
        break;
      } else {
        lastError = classifyError(r.tail);
      }

      const code = lastError.code;
      if ((code === 'extractor' || code === 'http_403') && Date.now() - this.engineUpdatedAt > 10 * 60 * 1000) {
        this.engineUpdatedAt = Date.now();
        this.deps.log?.(`Info failed (${code}); updating engine and retrying`);
        await engine.update().catch(() => {});
        continue;
      }
      if ((code === 'network' || code === 'timeout' || code === 'unknown') && attempt < 2) {
        await new Promise((res) => setTimeout(res, 1500));
        continue;
      }
      break;
    }
    throw new FriendlyFailure(lastError ?? classifyError(''));
  }

  /** Best thumbnail image for an info key (cached). */
  thumbnail(key: string): Promise<ImageResult | null> {
    const info = this.byKey.get(key);
    if (!info) return Promise.resolve(null);
    let p = this.thumbs.get(key);
    if (!p) {
      p = fetchFirstImage(info.thumbnails, this.deps.fetchImpl);
      this.thumbs.set(key, p);
      if (this.thumbs.size > 50) this.thumbs.delete(this.thumbs.keys().next().value as string);
      p.then((r) => {
        if (!r) this.thumbs.delete(key);
      });
    }
    return p;
  }
}
