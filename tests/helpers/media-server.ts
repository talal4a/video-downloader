// A tiny HTTP server with Range support, used to test downloads without the internet.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4s': 'video/iso.segment',
  '.mpd': 'application/dash+xml',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
};

export interface MediaServer {
  url: string;
  close: () => Promise<void>;
  requests: string[];
}

/** Files under "/slow/" are sent at ~bytesPerSecond so a download can be canceled mid-way. */
export async function startMediaServer(root: string, slowBytesPerSecond = 256 * 1024): Promise<MediaServer> {
  const requests: string[] = [];
  let activeSlow = 0;
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    requests.push(`${req.method} ${pathname} ${req.headers.range ?? ''}`);
    const slow = pathname.startsWith('/slow/');
    const file = path.join(root, slow ? pathname.slice('/slow'.length) : pathname);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    const size = fs.statSync(file).size;
    const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    let start = 0;
    let end = size - 1;
    let status = 200;
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
    if (m) {
      if (m[1]) {
        start = Number(m[1]);
        if (m[2]) end = Math.min(Number(m[2]), size - 1);
      } else if (m[2]) {
        start = Math.max(0, size - Number(m[2]));
      }
      status = 206;
    }
    const headers: http.OutgoingHttpHeaders = {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
    };
    if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    res.writeHead(status, headers);
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file, { start, end, highWaterMark: 16 * 1024 });
    if (!slow) {
      stream.pipe(res);
      return;
    }
    // The limit is shared by all connections, so multi-connection (turbo) downloads stay slow too.
    activeSlow++;
    let closed = false;
    stream.on('data', (chunk) => {
      stream.pause();
      const delay = Math.max(1, Math.round((chunk.length * 1000 * activeSlow) / slowBytesPerSecond));
      res.write(chunk, () => setTimeout(() => !closed && stream.resume(), delay));
    });
    stream.on('end', () => res.end());
    res.on('close', () => {
      closed = true;
      activeSlow--;
      stream.destroy();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
