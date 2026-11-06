import { describe, expect, it } from 'vitest';
import { extractFirstUrl, isLikelyMediaUrl, normalizeUrl, siteForUrl, youtubePlaylistUrlFor } from '../../electron/core/urls';

describe('extractFirstUrl', () => {
  it('finds a link inside text', () => {
    expect(extractFirstUrl('look at this https://youtu.be/abc123XYZ_- !!')).toBe('https://youtu.be/abc123XYZ_-');
  });
  it('accepts links without https://', () => {
    expect(extractFirstUrl('youtu.be/dQw4w9WgXcQ')).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(extractFirstUrl('www.instagram.com/reel/C1234/')).toBe('https://www.instagram.com/reel/C1234/');
  });
  it('drops unbalanced closing brackets and punctuation', () => {
    expect(extractFirstUrl('(see https://x.com/a/status/1).')).toBe('https://x.com/a/status/1');
    expect(extractFirstUrl('https://en.wikipedia.org/wiki/Foo_(bar)')).toBe('https://en.wikipedia.org/wiki/Foo_(bar)');
  });
  it('returns null for plain text', () => {
    expect(extractFirstUrl('hello world')).toBeNull();
    expect(extractFirstUrl('')).toBeNull();
    expect(extractFirstUrl(null)).toBeNull();
  });
});

describe('isLikelyMediaUrl', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/abcdefghijk',
    'https://www.youtube.com/playlist?list=PL123',
    'https://www.instagram.com/reel/C1abc/',
    'https://www.instagram.com/p/C1abc/',
    'https://www.tiktok.com/@user/video/1234567890',
    'https://vm.tiktok.com/ZM123/',
    'https://x.com/user/status/1234567890',
    'https://www.facebook.com/watch?v=123',
    'https://fb.watch/abc/',
    'https://vimeo.com/123456',
    'https://example.com/files/movie.mp4',
  ])('detects %s', (url) => expect(isLikelyMediaUrl(url)).toBe(true));

  it.each([
    'https://www.youtube.com/',
    'https://www.instagram.com/',
    'https://www.instagram.com/someuser/',
    'https://x.com/home',
    'https://google.com/search?q=video',
    'https://example.com/',
    'ftp://example.com/a.mp4',
  ])('ignores %s', (url) => expect(isLikelyMediaUrl(url)).toBe(false));
});

describe('normalizeUrl', () => {
  it('adds https and sends channel pages to the Videos tab', () => {
    expect(normalizeUrl(' youtube.com/@SomeChannel ')).toBe('https://youtube.com/@SomeChannel/videos');
    expect(normalizeUrl('https://www.youtube.com/@SomeChannel/shorts')).toBe('https://www.youtube.com/@SomeChannel/shorts');
    expect(normalizeUrl('https://www.youtube.com/watch?v=abc')).toBe('https://www.youtube.com/watch?v=abc');
  });
});

describe('youtubePlaylistUrlFor', () => {
  it('returns the playlist of a watch link', () => {
    expect(youtubePlaylistUrlFor('https://www.youtube.com/watch?v=abc&list=PLxyz&index=2')).toBe('https://www.youtube.com/playlist?list=PLxyz');
  });
  it('ignores mixes and plain videos', () => {
    expect(youtubePlaylistUrlFor('https://www.youtube.com/watch?v=abc&list=RDabc')).toBeUndefined();
    expect(youtubePlaylistUrlFor('https://www.youtube.com/watch?v=abc')).toBeUndefined();
    expect(youtubePlaylistUrlFor('https://www.youtube.com/playlist?list=PLxyz')).toBeUndefined();
  });
});

describe('siteForUrl', () => {
  it('matches subdomains but not look-alikes', () => {
    expect(siteForUrl('https://m.youtube.com/watch?v=1')?.name).toBe('YouTube');
    expect(siteForUrl('https://notyoutube.com/watch?v=1')).toBeNull();
  });
});
