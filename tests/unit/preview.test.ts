import { describe, expect, it } from 'vitest';
import { captionParts, cleanHandle, compact, initials, platformOf, SAFE_ZONES, VIEWS } from '../../src/lib/preview';

describe('preview studio helpers', () => {
  it('shows counts like the apps do', () => {
    expect(compact(999)).toBe('999');
    expect(compact(8400)).toBe('8.4K');
    expect(compact(12_000)).toBe('12K');
    expect(compact(1_250_000)).toBe('1.3M');
    expect(compact(25_000_000)).toBe('25M');
    expect(compact(3_000_000_000)).toBe('3B');
    expect(compact(-5)).toBe('0');
  });
  it('makes hashtags and mentions bold parts, in any language', () => {
    expect(captionParts('Sunset #travel with @friend!')).toEqual([
      { text: 'Sunset ', tag: false },
      { text: '#travel', tag: true },
      { text: ' with ', tag: false },
      { text: '@friend', tag: true },
      { text: '!', tag: false },
    ]);
    expect(captionParts('#پاکستان').map((p) => p.tag)).toEqual([true]);
  });
  it('cleans usernames and makes initials', () => {
    expect(cleanHandle('  @@my name ')).toBe('myname');
    expect(cleanHandle('')).toBe('yourname');
    expect(initials('Your Channel')).toBe('YC');
    expect(initials('')).toBe('Y');
  });
  it('knows every view and its platform', () => {
    const all = Object.values(VIEWS).flat();
    expect(all.map((v) => v.id)).toEqual(['yt-home', 'yt-shorts', 'ig-reels', 'ig-grid', 'tt-fyp', 'tt-grid']);
    expect(all.map((v) => platformOf(v.id))).toEqual(['youtube', 'youtube', 'instagram', 'instagram', 'tiktok', 'tiktok']);
    for (const z of Object.values(SAFE_ZONES)) expect(z.top + z.bottom).toBeLessThan(50);
  });
});
