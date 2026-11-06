// Live progress for aria2 (turbo mode).
// aria2 buffers its console output when it is not attached to a terminal, so we read its
// control file (<file>.aria2), which it rewrites every second, to know how much is done.
// Format: https://aria2.github.io/manual/en/html/technical-notes.html#control-file-aria2-format
import fsp from 'node:fs/promises';
import path from 'node:path';

export interface Aria2Progress {
  completed: number;
  total: number;
}

function popcount(buf: Buffer): number {
  let n = 0;
  for (const byte of buf) {
    let b = byte;
    while (b) {
      n += b & 1;
      b >>= 1;
    }
  }
  return n;
}

export function parseAria2Control(data: Buffer): Aria2Progress | null {
  try {
    let off = 0;
    const version = data.readUInt16BE(off);
    off += 2;
    // Version 0 used host byte order (little endian on PCs); version 1 is big endian.
    const le = version === 0;
    const u32 = () => {
      const v = le ? data.readUInt32LE(off) : data.readUInt32BE(off);
      off += 4;
      return v;
    };
    const u64 = () => {
      const v = le ? data.readBigUInt64LE(off) : data.readBigUInt64BE(off);
      off += 8;
      return Number(v);
    };
    off += 4; // extension
    const infoHashLength = u32();
    off += infoHashLength;
    const pieceLength = u32();
    const total = u64();
    u64(); // upload length
    const bitfieldLength = u32();
    const bitfield = data.subarray(off, off + bitfieldLength);
    off += bitfieldLength;
    const pieces = Math.ceil(total / pieceLength);
    let completed = 0;
    for (let i = 0; i < pieces; i++) {
      if (bitfield[i >> 3] & (0x80 >> (i & 7))) {
        completed += i === pieces - 1 ? total - pieceLength * (pieces - 1) : pieceLength;
      }
    }
    const inFlight = u32();
    for (let i = 0; i < inFlight && off < data.length; i++) {
      u32(); // index
      const length = u32();
      const pbLength = u32();
      const pb = data.subarray(off, off + pbLength);
      off += pbLength;
      completed += Math.min(length, popcount(pb) * 16 * 1024);
    }
    if (!total || pieceLength <= 0) return null;
    return { completed: Math.min(completed, total), total };
  } catch {
    return null;
  }
}

/** Progress of the aria2 download currently running in a folder (newest control file). */
export async function readAria2Progress(dir: string): Promise<Aria2Progress | null> {
  let names: string[];
  try {
    names = (await fsp.readdir(dir)).filter((n) => n.endsWith('.aria2'));
  } catch {
    return null;
  }
  if (!names.length) return null;
  let newest: { file: string; mtime: number } | null = null;
  for (const n of names) {
    try {
      const st = await fsp.stat(path.join(dir, n));
      if (!newest || st.mtimeMs > newest.mtime) newest = { file: path.join(dir, n), mtime: st.mtimeMs };
    } catch {
      /* file was just renamed/removed */
    }
  }
  if (!newest) return null;
  try {
    return parseAria2Control(await fsp.readFile(newest.file));
  } catch {
    return null;
  }
}
