import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { moveFile, sanitizeFileName, uniquePath } from '../../electron/core/files';

describe('sanitizeFileName', () => {
  it('removes characters Windows does not allow', () => {
    expect(sanitizeFileName('a<b>c:d"e/f\\g|h?i*j')).toBe("a b c -d'e f g h i j");
  });
  it('keeps Unicode and emoji', () => {
    expect(sanitizeFileName('پاکستان زندہ باد 🇵🇰')).toBe('پاکستان زندہ باد 🇵🇰');
  });
  it('handles reserved names, dots and empty titles', () => {
    expect(sanitizeFileName('CON')).toBe('_CON');
    expect(sanitizeFileName('  ...name...  ')).toBe('name');
    expect(sanitizeFileName('   ')).toBe('video');
    expect(sanitizeFileName('a\u0000b\nc')).toBe('a b c');
  });
  it('limits the length without splitting emoji', () => {
    const s = sanitizeFileName('😀'.repeat(200), 10);
    expect(Array.from(s)).toHaveLength(10);
  });
});

describe('uniquePath / moveFile', () => {
  it('adds (1), (2)... for existing files and moves files', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-files-'));
    const p1 = uniquePath(dir, 'Video', 'mp4');
    expect(path.basename(p1)).toBe('Video.mp4');
    fs.writeFileSync(p1, 'x');
    expect(path.basename(uniquePath(dir, 'Video', '.mp4'))).toBe('Video (1).mp4');
    const src = path.join(dir, 'src.bin');
    fs.writeFileSync(src, 'data');
    await moveFile(src, path.join(dir, 'sub', 'dst.bin'));
    expect(fs.readFileSync(path.join(dir, 'sub', 'dst.bin'), 'utf8')).toBe('data');
    expect(fs.existsSync(src)).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
