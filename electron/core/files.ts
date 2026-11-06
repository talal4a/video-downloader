import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/**
 * Make a string safe to use as a file name on Windows, macOS and Linux.
 * Keeps Unicode (Urdu, Arabic, emoji...) but removes characters Windows forbids.
 */
export function sanitizeFileName(name: string, maxLength = 120): string {
  let out = (name || '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>:"/\\|?*]/g, (ch) => (ch === ':' ? ' -' : ch === '"' ? "'" : ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .replace(/^[. ]+/g, '');
  if (!out) out = 'video';
  if (WINDOWS_RESERVED.test(out)) out = `_${out}`;
  // Cut by code points (not UTF-16 units) so emoji are not split in half.
  const chars = Array.from(out);
  if (chars.length > maxLength) out = chars.slice(0, maxLength).join('').trim().replace(/[. ]+$/g, '');
  return out || 'video';
}

/** Return a path that does not exist yet: "name.mp4", "name (1).mp4", "name (2).mp4"... */
export function uniquePath(dir: string, base: string, ext: string): string {
  const e = ext ? (ext.startsWith('.') ? ext : `.${ext}`) : '';
  let candidate = path.join(dir, `${base}${e}`);
  let i = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${i})${e}`);
    i++;
  }
  return candidate;
}

/** Move a file, falling back to copy+delete when moving across drives. */
export async function moveFile(from: string, to: string): Promise<void> {
  await fsp.mkdir(path.dirname(to), { recursive: true });
  try {
    await fsp.rename(from, to);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EXDEV' || code === 'EPERM' || code === 'EBUSY') {
      await fsp.copyFile(from, to);
      await fsp.rm(from, { force: true });
    } else {
      throw err;
    }
  }
}

export async function removeDir(dir: string): Promise<void> {
  try {
    await fsp.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Ignore: a virus scanner may still hold a file open on Windows. It will be cleaned next start.
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

export function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export const MEDIA_EXTENSIONS = new Set([
  'mp4',
  'm4v',
  'mkv',
  'webm',
  'mov',
  'avi',
  'flv',
  '3gp',
  'ts',
  'mp3',
  'm4a',
  'aac',
  'opus',
  'ogg',
  'oga',
  'wav',
  'flac',
  'wma',
]);

export const SUBTITLE_EXTENSIONS = new Set(['srt', 'vtt', 'ass', 'ssa', 'ttml', 'srv3', 'lrc']);
