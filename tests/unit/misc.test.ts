import { describe, expect, it } from 'vitest';
import { toNetscapeCookieFile } from '../../electron/core/cookies';
import { defaultSettings, sanitizeSettings } from '../../electron/core/settings';
import { compareVersions } from '../../electron/core/engine';
import { failedOnExtras } from '../../electron/core/downloads';
import { formatBytes, formatDuration, formatEta, qualityLabel } from '../../shared/format';

describe('cookies', () => {
  it('writes the Netscape format yt-dlp expects', () => {
    const text = toNetscapeCookieFile([
      { name: 'sessionid', value: 'abc', domain: '.instagram.com', path: '/', secure: true, httpOnly: true, expirationDate: 1900000000.5 },
      { name: 'csrftoken', value: 'x', domain: 'www.instagram.com', hostOnly: true, path: '/', secure: true },
    ]);
    const lines = text.trim().split('\n');
    expect(lines[0]).toBe('# Netscape HTTP Cookie File');
    expect(lines).toContain('#HttpOnly_.instagram.com\tTRUE\t/\tTRUE\t1900000000\tsessionid\tabc');
    expect(lines).toContain('www.instagram.com\tFALSE\t/\tTRUE\t0\tcsrftoken\tx');
  });
});

describe('settings', () => {
  it('keeps values valid', () => {
    const s = sanitizeSettings(defaultSettings('/d'), {
      maxConcurrent: 99,
      connections: 0,
      theme: 'pink' as never,
      defaultQuality: 720,
      audioBitrate: 999 as never,
      turbo: false,
      subtitleMode: 'nope' as never,
    });
    expect(s.subtitleMode).toBe('embed');
    expect(sanitizeSettings(s, { subtitleMode: 'burn' }).subtitleMode).toBe('burn');
    expect(s.maxConcurrent).toBe(5);
    expect(s.connections).toBe(1);
    expect(s.theme).toBe('system');
    expect(s.defaultQuality).toBe(720);
    expect(s.audioBitrate).toBe(320);
    expect(s.turbo).toBe(false);
  });
});

describe('helpers', () => {
  it('compares yt-dlp versions', () => {
    expect(compareVersions('2026.10.26', '2026.9.1')).toBe(1);
    expect(compareVersions('2026.10.26', '2026.10.26')).toBe(0);
    expect(compareVersions('2026.10.26', '2026.10.26.1')).toBe(-1);
  });
  it('formats numbers for people', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatEta(42)).toBe('42s left');
    expect(qualityLabel(2160).label).toBe('4K');
  });
  it('recognises failures caused by optional extras', () => {
    expect(failedOnExtras('[info] Downloading video thumbnail 0 ...\nERROR: Unable to handle request: Unsupported url scheme')).toBe(true);
    expect(failedOnExtras('[youtube] abc: Downloading webpage\nERROR: Private video')).toBe(false);
  });
});

describe('aria2 control file', () => {
  it('counts finished and in-flight pieces', async () => {
    const { parseAria2Control } = await import('../../electron/core/aria2');
    // version 1, no info hash, piece 1 MiB, total 3.5 MiB, pieces 0 and 3 done, piece 1 has 4 blocks of 16 KiB.
    const parts: Buffer[] = [];
    const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
    const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
    const u64 = (n: number) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };
    const MiB = 1024 * 1024;
    parts.push(u16(1), u32(0), u32(0), u32(MiB), u64(3.5 * MiB), u64(0), u32(1), Buffer.from([0b1001_0000]));
    parts.push(u32(1), u32(1), u32(MiB), u32(8), Buffer.from([0b1111_0000, 0, 0, 0, 0, 0, 0, 0]));
    const p = parseAria2Control(Buffer.concat(parts));
    expect(p).toEqual({ total: 3.5 * MiB, completed: MiB + 0.5 * MiB + 4 * 16 * 1024 });
  });
  it('returns null for garbage', async () => {
    const { parseAria2Control } = await import('../../electron/core/aria2');
    expect(parseAria2Control(Buffer.from('nope'))).toBeNull();
  });
});
