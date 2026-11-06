import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractZip } from '../../electron/core/unzip';

const python = process.platform === 'win32' ? 'python' : 'python3';
let work: string;

// Build test archives with Python's standard zipfile module (independent implementation).
function makeZip(dest: string, script: string) {
  execFileSync(python, ['-c', `import zipfile, sys\n${script}`, dest]);
}

beforeAll(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-unzip-'));
});
afterAll(() => fs.rmSync(work, { recursive: true, force: true }));

describe('extractZip', () => {
  it('extracts deflated and stored files, folders, Unicode names and exec bits', async () => {
    const zip = path.join(work, 'a.zip');
    const big = crypto.randomBytes(3 * 1024 * 1024).toString('base64'); // compressible but not trivial
    fs.writeFileSync(path.join(work, 'big.txt'), big);
    makeZip(
      zip,
      `
z = zipfile.ZipFile(sys.argv[1], 'w')
z.writestr('ffmpeg-build/', '')
z.write(sys.argv[1].replace('a.zip', 'big.txt'), 'ffmpeg-build/bin/big.txt', compress_type=zipfile.ZIP_DEFLATED)
z.writestr('ffmpeg-build/bin/stored.bin', b'\\x00\\x01raw', compress_type=zipfile.ZIP_STORED)
z.writestr('ffmpeg-build/empty.txt', b'')
z.writestr('ffmpeg-build/پاکستان.txt', 'urdu'.encode(), compress_type=zipfile.ZIP_DEFLATED)
i = zipfile.ZipInfo('ffmpeg-build/bin/tool'); i.external_attr = 0o755 << 16; i.compress_type = zipfile.ZIP_DEFLATED
z.writestr(i, '#!/bin/sh\\necho hi\\n')
z.close()`,
    );
    const out = path.join(work, 'out-a');
    const files = await extractZip(zip, out);
    expect(files.length).toBe(5);
    expect(fs.readFileSync(path.join(out, 'ffmpeg-build/bin/big.txt'), 'utf8')).toBe(big);
    expect(fs.readFileSync(path.join(out, 'ffmpeg-build/bin/stored.bin'))).toEqual(Buffer.from([0, 1, 0x72, 0x61, 0x77]));
    expect(fs.statSync(path.join(out, 'ffmpeg-build/empty.txt')).size).toBe(0);
    expect(fs.readFileSync(path.join(out, 'ffmpeg-build/پاکستان.txt'), 'utf8')).toBe('urdu');
    if (process.platform !== 'win32') expect(fs.statSync(path.join(out, 'ffmpeg-build/bin/tool')).mode & 0o111).not.toBe(0);
  });

  it('reads ZIP64 archives', async () => {
    const zip = path.join(work, 'z64.zip');
    makeZip(
      zip,
      `
z = zipfile.ZipFile(sys.argv[1], 'w', compression=zipfile.ZIP_DEFLATED, allowZip64=True)
with z.open('inside/data.txt', 'w', force_zip64=True) as f: f.write(b'hello zip64' * 1000)
z.close()`,
    );
    const out = path.join(work, 'out-64');
    await extractZip(zip, out);
    expect(fs.readFileSync(path.join(out, 'inside/data.txt'), 'utf8')).toBe('hello zip64'.repeat(1000));
  });

  it('refuses entries that try to escape the folder', async () => {
    const zip = path.join(work, 'evil.zip');
    makeZip(zip, `z = zipfile.ZipFile(sys.argv[1], 'w'); z.writestr('../evil.txt', 'x'); z.close()`);
    await expect(extractZip(zip, path.join(work, 'out-evil'))).rejects.toThrow(/unsafe path/);
    expect(fs.existsSync(path.join(work, 'evil.txt'))).toBe(false);
  });

  it('rejects files that are not zips', async () => {
    const bad = path.join(work, 'bad.zip');
    fs.writeFileSync(bad, 'hello');
    await expect(extractZip(bad, path.join(work, 'out-bad'))).rejects.toThrow(/not a zip/);
  });
});
