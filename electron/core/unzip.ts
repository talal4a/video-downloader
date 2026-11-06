// Small, dependency-free ZIP extractor (stored + deflate, ZIP64), streaming so large
// archives (FFmpeg is ~90 MB) never have to fit in memory. Works on every Node.js version.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';

const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;
const SIG_ZIP64_EOCD = 0x06064b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

interface Entry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
  mode: number;
  isDir: boolean;
  encrypted: boolean;
}

async function readAt(fh: fsp.FileHandle, position: number, length: number): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  let read = 0;
  while (read < length) {
    const { bytesRead } = await fh.read(buf, read, length - read, position + read);
    if (bytesRead === 0) break;
    read += bytesRead;
  }
  return buf.subarray(0, read);
}

async function readEntries(fh: fsp.FileHandle, size: number): Promise<Entry[]> {
  const tailLen = Math.min(size, 22 + 0xffff);
  const tail = await readAt(fh, size - tailLen, tailLen);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip file');
  let count = tail.readUInt16LE(eocd + 10);
  let cdSize = tail.readUInt32LE(eocd + 12);
  let cdOffset = tail.readUInt32LE(eocd + 16);

  // ZIP64 archives keep the real values in a separate record.
  if ((cdOffset === 0xffffffff || count === 0xffff || cdSize === 0xffffffff) && eocd >= 20) {
    if (tail.readUInt32LE(eocd - 20) === SIG_ZIP64_LOCATOR) {
      const recOffset = Number(tail.readBigUInt64LE(eocd - 20 + 8));
      const rec = await readAt(fh, recOffset, 56);
      if (rec.readUInt32LE(0) !== SIG_ZIP64_EOCD) throw new Error('bad zip64 record');
      count = Number(rec.readBigUInt64LE(32));
      cdSize = Number(rec.readBigUInt64LE(40));
      cdOffset = Number(rec.readBigUInt64LE(48));
    }
  }

  const cd = await readAt(fh, cdOffset, cdSize);
  const entries: Entry[] = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (cd.readUInt32LE(p) !== SIG_CENTRAL) throw new Error('bad central directory');
    const flags = cd.readUInt16LE(p + 8);
    const method = cd.readUInt16LE(p + 10);
    let compressedSize = cd.readUInt32LE(p + 20);
    let uncompressedSize = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    const externalAttrs = cd.readUInt32LE(p + 38);
    let localOffset = cd.readUInt32LE(p + 42);
    const name = cd.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLen);
    // ZIP64 extra field holds the 64-bit sizes/offset that are 0xffffffff above.
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = cd.readUInt16LE(e);
      const len = cd.readUInt16LE(e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (uncompressedSize === 0xffffffff) {
          uncompressedSize = Number(cd.readBigUInt64LE(q));
          q += 8;
        }
        if (compressedSize === 0xffffffff) {
          compressedSize = Number(cd.readBigUInt64LE(q));
          q += 8;
        }
        if (localOffset === 0xffffffff) localOffset = Number(cd.readBigUInt64LE(q));
      }
      e += 4 + len;
    }
    entries.push({
      name,
      method,
      compressedSize,
      localOffset,
      mode: (externalAttrs >>> 16) & 0o777,
      isDir: name.endsWith('/'),
      encrypted: (flags & 1) === 1,
    });
    p = extraEnd + commentLen;
  }
  return entries;
}

/** Resolve an entry name inside `root`, refusing absolute paths and "../" tricks. */
function safeTarget(root: string, name: string): string {
  const clean = name.replace(/\\/g, '/');
  if (clean.startsWith('/') || /^[a-zA-Z]:/.test(clean)) throw new Error(`unsafe path in zip: ${name}`);
  const target = path.resolve(root, clean);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`unsafe path in zip: ${name}`);
  return target;
}

/** Extract `zipFile` into `destDir`. Returns the paths of the extracted files. */
export async function extractZip(zipFile: string, destDir: string): Promise<string[]> {
  const root = path.resolve(destDir);
  await fsp.mkdir(root, { recursive: true });
  const fh = await fsp.open(zipFile, 'r');
  const written: string[] = [];
  try {
    const { size } = await fh.stat();
    const entries = await readEntries(fh, size);
    for (const entry of entries) {
      const target = safeTarget(root, entry.name);
      if (entry.isDir) {
        await fsp.mkdir(target, { recursive: true });
        continue;
      }
      if (entry.encrypted) throw new Error(`encrypted zip entries are not supported: ${entry.name}`);
      const local = await readAt(fh, entry.localOffset, 30);
      if (local.readUInt32LE(0) !== SIG_LOCAL) throw new Error(`bad local header: ${entry.name}`);
      const dataStart = entry.localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      const out = fs.createWriteStream(target);
      if (entry.compressedSize === 0) {
        await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
      } else {
        const source = fs.createReadStream(zipFile, { start: dataStart, end: dataStart + entry.compressedSize - 1 });
        if (entry.method === 0) await pipeline(source, out);
        else if (entry.method === 8) await pipeline(source, zlib.createInflateRaw(), out);
        else throw new Error(`unsupported zip compression method ${entry.method}: ${entry.name}`);
      }
      if (process.platform !== 'win32' && entry.mode & 0o111) await fsp.chmod(target, entry.mode | 0o600);
      written.push(target);
    }
  } finally {
    await fh.close();
  }
  return written;
}
