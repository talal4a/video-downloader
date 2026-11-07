// Serves the exported Next.js UI from inside the app as app://local/...
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { protocol } from 'electron';

export const APP_SCHEME = 'app';
export const APP_ORIGIN = `${APP_SCHEME}://local`;
/** Plays finished downloads in the Preview Studio: vdmedia://job/<job id>/<file index> */
export const MEDIA_SCHEME = 'vdmedia';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: vdmedia: https: http:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob: data: vdmedia: https: http:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** Must be called before the app is ready. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  ]);
}

export function handleAppProtocol(rootDir: string): void {
  const root = path.resolve(rootDir);
  protocol.handle(APP_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      let file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root)) return new Response('Forbidden', { status: 403 });
      if (!fs.existsSync(file) && !path.extname(file)) file = `${file}.html`;
      if (!fs.existsSync(file)) file = path.join(root, '404.html');
      const body = await fs.promises.readFile(file);
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
          'Content-Security-Policy': CSP,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch (err) {
      return new Response(`Error: ${(err as Error).message}`, { status: 500 });
    }
  });
}

const MEDIA_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
};

/**
 * Serves downloaded files to the Preview Studio, with Range support so the video can seek.
 * `resolve` only returns files the app downloaded itself (nothing else on disk can be read).
 */
export function handleMediaProtocol(resolve: (jobId: string, index: number) => string | null): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const url = new URL(request.url);
    const [, jobId, idx] = url.pathname.split('/');
    const file = url.hostname === 'job' && jobId ? resolve(decodeURIComponent(jobId), Number(idx) || 0) : null;
    if (!file) return new Response('Not found', { status: 404 });
    let size: number;
    try {
      size = (await fs.promises.stat(file)).size;
    } catch {
      return new Response('Not found', { status: 404 });
    }
    const headers: Record<string, string> = {
      'Content-Type': MEDIA_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
    };
    const m = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') ?? '');
    let start = 0;
    let end = size - 1;
    if (m && (m[1] || m[2])) {
      if (m[1]) {
        start = Number(m[1]);
        if (m[2]) end = Math.min(Number(m[2]), size - 1);
      } else {
        start = Math.max(0, size - Number(m[2]));
      }
      if (start > end || start >= size) {
        return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
      }
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    }
    headers['Content-Length'] = String(end - start + 1);
    const body = Readable.toWeb(fs.createReadStream(file, { start, end })) as unknown as ReadableStream;
    return new Response(body, { status: m && (m[1] || m[2]) ? 206 : 200, headers });
  });
}
