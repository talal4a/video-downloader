import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { run } from './process';

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface ImageResult {
  buffer: Buffer;
  /** e.g. "jpg", "png", "webp" */
  ext: string;
  mime: string;
  url: string;
}

export function sniffImage(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { ext: 'png', mime: 'image/png' };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return { ext: 'webp', mime: 'image/webp' };
  if (buf.toString('ascii', 0, 4) === 'GIF8') return { ext: 'gif', mime: 'image/gif' };
  if (buf.toString('ascii', 4, 12) === 'ftypavif' || buf.toString('ascii', 4, 12) === 'ftypavis')
    return { ext: 'avif', mime: 'image/avif' };
  if (buf.toString('ascii', 4, 8) === 'ftyp' && /hei[cx]|mif1/.test(buf.toString('ascii', 8, 12)))
    return { ext: 'heic', mime: 'image/heic' };
  return null;
}

/** Download the first candidate that is a real image (skips YouTube's 404 placeholder). */
export async function fetchFirstImage(
  urls: string[],
  fetchImpl: FetchLike,
  timeoutMs = 15000,
): Promise<ImageResult | null> {
  for (const url of urls.slice(0, 12)) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        headers: { 'User-Agent': BROWSER_UA, Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' },
        signal: ctrl.signal,
        redirect: 'follow',
      });
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 1200) continue; // placeholders are tiny
      const kind = sniffImage(buffer);
      if (!kind) continue;
      return { buffer, ...kind, url };
    } catch {
      // try next candidate
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/**
 * Convert to a widely supported format: JPEG and PNG are kept, anything else
 * (WebP, AVIF, GIF, HEIC) becomes a high-quality JPEG using FFmpeg.
 */
export async function toCommonImage(
  img: ImageResult,
  ffmpeg: string | null,
  tmpDir: string,
): Promise<{ buffer: Buffer; ext: string }> {
  if (img.ext === 'jpg' || img.ext === 'png') return { buffer: img.buffer, ext: img.ext };
  if (!ffmpeg) return { buffer: img.buffer, ext: img.ext };
  const id = crypto.randomBytes(6).toString('hex');
  await fsp.mkdir(tmpDir, { recursive: true });
  const input = path.join(tmpDir, `thumb-${id}.${img.ext}`);
  const output = path.join(tmpDir, `thumb-${id}.jpg`);
  try {
    await fsp.writeFile(input, img.buffer);
    const h = run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-frames:v', '1', '-q:v', '1', output], {
      timeoutMs: 60000,
    });
    const r = await h.done;
    if (r.code === 0) {
      const buffer = await fsp.readFile(output);
      if (sniffImage(buffer)?.ext === 'jpg') return { buffer, ext: 'jpg' };
    }
    return { buffer: img.buffer, ext: img.ext };
  } finally {
    await fsp.rm(input, { force: true }).catch(() => {});
    await fsp.rm(output, { force: true }).catch(() => {});
  }
}
