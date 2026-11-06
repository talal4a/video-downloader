import { describe, expect, it } from 'vitest';
import { buildDownloadArgs, computeQualities, parseInfo, parseProgressLine, thumbnailCandidates, videoSort } from '../../electron/core/ytdlp';
import type { DownloadRequest } from '../../shared/types';

// A YouTube-like format list.
function ytFormats() {
  const f: Record<string, unknown>[] = [];
  const v = (id: string, w: number, h: number, vcodec: string, tbr: number) =>
    f.push({ format_id: id, width: w, height: h, vcodec, acodec: 'none', ext: 'mp4', tbr, filesize: tbr * 125 * 100 });
  f.push({ format_id: 'sb0', ext: 'mhtml', vcodec: 'none', acodec: 'none', format_note: 'storyboard' });
  f.push({ format_id: '140', vcodec: 'none', acodec: 'mp4a.40.2', ext: 'm4a', abr: 129, filesize: 1_600_000 });
  f.push({ format_id: '251', vcodec: 'none', acodec: 'opus', ext: 'webm', abr: 135, filesize: 1_700_000 });
  v('160', 256, 144, 'avc1.4d400c', 80);
  v('134', 640, 360, 'avc1.4d401e', 300);
  v('136', 1280, 720, 'avc1.4d401f', 1200);
  v('247', 1280, 720, 'vp9', 1000);
  v('137', 1920, 1080, 'avc1.640028', 2500);
  v('248', 1920, 1080, 'vp9', 2000);
  v('271', 2560, 1440, 'vp9', 6000);
  v('313', 3840, 2160, 'vp9', 14000);
  v('401', 3840, 2160, 'av01.0.12M.08', 12000);
  f.push({ format_id: '18', width: 640, height: 360, vcodec: 'avc1.42001E', acodec: 'mp4a.40.2', ext: 'mp4', tbr: 500 });
  return f;
}

describe('computeQualities', () => {
  it('lists each quality once, best first, with sizes', () => {
    const q = computeQualities(ytFormats(), 100);
    expect(q.map((x) => x.label)).toEqual(['4K', '2K', '1080p', '720p', '360p', '144p']);
    const hd = q.find((x) => x.label === '1080p')!;
    expect(hd.value).toBe(1080);
    // H.264 1080p (2500 kbps * 100 s) + AAC audio
    expect(hd.sizeBytes).toBe(2500 * 125 * 100 + 1_600_000);
  });
  it('uses the short side so vertical videos (Shorts/Reels) get the right label', () => {
    const q = computeQualities([{ format_id: 'a', width: 1080, height: 1920, vcodec: 'avc1', acodec: 'mp4a' }]);
    expect(q[0]).toMatchObject({ value: 1080, label: '1080p' });
  });
  it('labels unusual sizes by their width', () => {
    const q = computeQualities([{ format_id: 'a', width: 3840, height: 1600, vcodec: 'vp9', acodec: 'none' }]);
    expect(q[0]).toMatchObject({ value: 1600, label: '4K' });
  });
});

describe('parseInfo', () => {
  it('parses a single video', () => {
    const info = parseInfo(
      {
        _type: 'video',
        id: 'dQw4w9WgXcQ',
        title: 'Hello',
        uploader: 'Someone',
        extractor_key: 'Youtube',
        webpage_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        duration: 100,
        formats: ytFormats(),
        thumbnails: [{ url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg', preference: -10 }],
        subtitles: { en: [{ name: 'English', ext: 'vtt' }], live_chat: [{}] },
        automatic_captions: { 'en-orig': [{}], fr: [{}] },
      },
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1',
      'k1',
    );
    expect(info.site).toBe('YouTube');
    expect(info.hasVideo && info.hasAudio).toBe(true);
    expect(info.qualities[0].label).toBe('4K');
    expect(info.thumbnails[0]).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg');
    expect(info.subtitles.map((s) => s.lang)).toEqual(['en']);
    expect(info.parentPlaylistUrl).toBe('https://www.youtube.com/playlist?list=PL1');
  });

  it('parses a playlist of links as separate downloads', () => {
    const info = parseInfo(
      {
        _type: 'playlist',
        id: 'PL1',
        title: 'My list',
        extractor_key: 'YoutubeTab',
        entries: [
          { _type: 'url', ie_key: 'Youtube', id: 'aaaaaaaaaaa', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', title: 'One' },
          { _type: 'url', ie_key: 'Youtube', id: 'bbbbbbbbbbb', url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb', title: 'Two' },
        ],
      },
      'https://www.youtube.com/playlist?list=PL1',
      'k2',
    );
    expect(info.isPlaylist).toBe(true);
    expect(info.playlistMode).toBe('separate');
    expect(info.entries?.map((e) => e.title)).toEqual(['One', 'Two']);
    expect(info.qualities.map((q) => q.value)).toContain(1080);
  });

  it('offers English auto-translated captions for videos in other languages', () => {
    const info = parseInfo(
      { id: 'x', title: 'Urdu video', extractor_key: 'Youtube', language: 'ur', automatic_captions: { 'ur-orig': [{}], en: [{}], fr: [{}] }, formats: ytFormats() },
      'https://www.youtube.com/watch?v=x',
      'k4',
    );
    expect(info.subtitles.map((x) => [x.lang, x.auto])).toEqual([
      ['ur-orig', true],
      ['en', true],
    ]);
    expect(info.subtitles[1].name).toBe('English (auto-translated)');
  });

  it('treats an audio-only source as audio', () => {
    const info = parseInfo({ id: 's', title: 'Song', extractor_key: 'Soundcloud', formats: [{ format_id: 'mp3', vcodec: 'none', acodec: 'mp3', ext: 'mp3' }] }, 'https://soundcloud.com/a/b', 'k3');
    expect(info.hasVideo).toBe(false);
    expect(info.hasAudio).toBe(true);
    expect(info.site).toBe('SoundCloud');
  });

  it('resolves relative thumbnail links', () => {
    expect(thumbnailCandidates({ webpage_url: 'https://a.com/x/page', thumbnail: '/t.jpg' })).toEqual(['https://a.com/t.jpg']);
  });
});

describe('buildDownloadArgs', () => {
  const base: DownloadRequest = { url: 'https://youtu.be/x', title: 'T', kind: 'video', quality: 1080, audioBitrate: 320 };
  it('builds a video command preferring H.264 + AAC in MP4', () => {
    const a = buildDownloadArgs({ req: base, outDir: '/tmp/j', common: ['--ignore-config'], turbo: false, connections: 16 });
    expect(a).toContain('bv*+ba/b');
    expect(a[a.indexOf('-S') + 1]).toBe('res:1080,vcodec:h264,acodec:aac');
    expect(a[a.indexOf('--merge-output-format') + 1]).toBe('mp4');
    expect(a.slice(-2)).toEqual(['--', 'https://youtu.be/x']);
    expect(a).not.toContain('aria2c');
  });
  it('builds an MP3 command with the chosen bitrate', () => {
    const a = buildDownloadArgs({ req: { ...base, kind: 'audio', audioBitrate: 192 }, outDir: '/tmp/j', common: [], turbo: true, connections: 32 });
    expect(a).toContain('--extract-audio');
    expect(a[a.indexOf('--audio-quality') + 1]).toBe('192K');
    expect(a).toContain('--embed-thumbnail');
    expect(a[a.indexOf('--downloader-args') + 1]).toBe('aria2c:-x 16 -s 16 -k 1M --auto-save-interval=1');
  });
  it('drops extras in safe mode and adds subtitles otherwise', () => {
    const withSubs = buildDownloadArgs({ req: { ...base, subtitles: { lang: 'en', auto: false } }, outDir: '/t', common: [], turbo: false, connections: 1 });
    expect(withSubs).toContain('--write-subs');
    expect(withSubs).toContain('--embed-subs'); // "In the video" is the default
    for (const mode of ['burn', 'file'] as const) {
      const a = buildDownloadArgs({ req: { ...base, subtitles: { lang: 'en', auto: true, mode } }, outDir: '/t', common: [], turbo: false, connections: 1 });
      expect(a).toContain('--write-auto-subs');
      expect(a).not.toContain('--embed-subs');
    }
    const safe = buildDownloadArgs({ req: { ...base, subtitles: { lang: 'en', auto: false } }, outDir: '/t', common: [], turbo: false, connections: 1, safeMode: true });
    expect(safe).not.toContain('--write-subs');
    expect(safe).not.toContain('--embed-metadata');
  });
  it('sorts for the best quality when asked', () => {
    expect(videoSort('best')).toBe('res,vcodec:h264,acodec:aac');
  });
});

describe('parseProgressLine', () => {
  it('parses yt-dlp progress JSON (with NA values)', () => {
    const ev = parseProgressLine('VDPROG {"s":"downloading","d":1048386,"t":NA,"te":2013240.0,"sp":5000.5,"eta":NA,"fi":1,"fc":2,"f":"137","vc":"avc1","ac":"none","pi":NA,"pc":NA}');
    expect(ev).toMatchObject({ type: 'download', status: 'downloading', downloaded: 1048386, total: 2013240, speed: 5000.5, formatId: '137', acodec: 'none' });
  });
  it('parses aria2 console lines', () => {
    expect(parseProgressLine('[#68b50f 3.9MiB/19MiB(20%) CN:8 DL:2.0MiB ETA:7s]')).toEqual({
      type: 'aria2',
      downloaded: 3.9 * 1024 ** 2,
      total: 19 * 1024 ** 2,
      percent: 20,
      speed: 2 * 1024 ** 2,
      eta: 7,
    });
    expect(parseProgressLine('[#68b50f 16MiB/19MiB(84%) CN:4 DL:3.2MiB]')).toMatchObject({ type: 'aria2', eta: undefined });
    expect(parseProgressLine('[#a 1.0GiB/2.0GiB(50%) CN:16 DL:10MiB ETA:1h2m3s]')).toMatchObject({ eta: 3723 });
  });
  it('parses post-processing, destination and item lines', () => {
    expect(parseProgressLine('VDPP "Merger" "started"')).toEqual({ type: 'postprocess', name: 'Merger', status: 'started' });
    expect(parseProgressLine('[download] Destination: C:\\Temp\\job\\media.f137.mp4')).toEqual({ type: 'destination', file: 'C:\\Temp\\job\\media.f137.mp4' });
    expect(parseProgressLine('[download] Downloading item 2 of 5')).toEqual({ type: 'item', index: 2, count: 5 });
    expect(parseProgressLine('[youtube] Extracting URL')).toBeNull();
  });
});
