// Everything that knows about yt-dlp's command line and JSON output.
import path from 'node:path';
import type { DownloadRequest, MediaEntry, MediaInfo, QualityOption, SubtitleOption } from '../../shared/types';
import { qualityLabel } from '../../shared/format';
import { youtubePlaylistUrlFor } from './urls';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

// ---------------------------------------------------------------------------
// Info parsing
// ---------------------------------------------------------------------------

const AUDIO_EXTS = new Set(['m4a', 'mp3', 'opus', 'ogg', 'oga', 'wav', 'flac', 'aac', 'weba', 'mka', 'wma']);

export function isAudioOnly(f: Raw): boolean {
  if (f.vcodec === 'none') return true;
  if (f.resolution === 'audio only') return true;
  if (f.vcodec == null && f.height == null && f.width == null) {
    if (f.acodec && f.acodec !== 'none') return true;
    if (AUDIO_EXTS.has(String(f.ext ?? '').toLowerCase())) return true;
  }
  return false;
}

export function isUsableFormat(f: Raw): boolean {
  if (!f || typeof f !== 'object') return false;
  if (f.ext === 'mhtml') return false; // storyboards
  if (typeof f.format_id === 'string' && /^sb\d/.test(f.format_id)) return false;
  if (f.has_drm === true) return false;
  return true;
}

export function isVideoFormat(f: Raw): boolean {
  return isUsableFormat(f) && !isAudioOnly(f);
}

function hasAudioStream(f: Raw): boolean {
  return Boolean(f.acodec && f.acodec !== 'none');
}

function dims(f: Raw): { short?: number; long?: number } {
  const w = Number(f.width) || undefined;
  const h = Number(f.height) || undefined;
  if (w && h) return { short: Math.min(w, h), long: Math.max(w, h) };
  if (h) return { short: h };
  const m = /(\d{3,4})p/.exec(String(f.format_note ?? f.format ?? ''));
  if (m) return { short: Number(m[1]) };
  return {};
}

function codecRank(vcodec: unknown): number {
  const v = String(vcodec ?? '').toLowerCase();
  if (v.startsWith('avc') || v.startsWith('h264')) return 4;
  if (v.startsWith('hev') || v.startsWith('hvc') || v.startsWith('h265')) return 3;
  if (v.startsWith('vp9') || v.startsWith('vp09')) return 2;
  if (v.startsWith('av01') || v.startsWith('av1')) return 1;
  return 0;
}

export function formatSize(f: Raw, duration?: number): number | undefined {
  const s = Number(f.filesize) || Number(f.filesize_approx);
  if (s) return s;
  const tbr = Number(f.tbr);
  if (tbr && duration) return (tbr * 1000 * duration) / 8;
  return undefined;
}

function bestAudio(formats: Raw[]): Raw | undefined {
  const audio = formats.filter((f) => isUsableFormat(f) && isAudioOnly(f));
  if (!audio.length) return undefined;
  // Mirror our yt-dlp sort ("acodec:aac"): prefer AAC/M4A, then by bitrate.
  return [...audio].sort((a, b) => {
    const aa = /mp4a|aac/i.test(String(a.acodec)) ? 1 : 0;
    const bb = /mp4a|aac/i.test(String(b.acodec)) ? 1 : 0;
    if (aa !== bb) return bb - aa;
    return (Number(b.abr ?? b.tbr) || 0) - (Number(a.abr ?? a.tbr) || 0);
  })[0];
}

export function computeQualities(formats: Raw[], duration?: number): QualityOption[] {
  const video = formats.filter(isVideoFormat);
  const audio = bestAudio(formats);
  const audioSize = audio ? formatSize(audio, duration) : undefined;
  const groups = new Map<string, { value: number; note?: string; formats: Raw[] }>();
  for (const f of video) {
    const { short, long } = dims(f);
    if (!short || short < 100) continue;
    const { label, note } = qualityLabel(short, long);
    const g = groups.get(label);
    if (!g) groups.set(label, { value: short, note, formats: [f] });
    else {
      g.value = Math.max(g.value, short);
      g.formats.push(f);
    }
  }
  const out: QualityOption[] = [];
  for (const [label, g] of groups) {
    const atTop = g.formats.filter((f) => dims(f).short === g.value);
    const best = [...atTop].sort((a, b) => {
      const r = codecRank(b.vcodec) - codecRank(a.vcodec);
      if (r) return r;
      return (Number(b.tbr) || 0) - (Number(a.tbr) || 0);
    })[0];
    let size = formatSize(best, duration);
    if (size && !hasAudioStream(best) && audioSize) size += audioSize;
    out.push({
      value: g.value,
      label,
      note: g.note,
      sizeBytes: size ? Math.round(size) : undefined,
      fps: Number(best.fps) || undefined,
    });
  }
  return out.sort((a, b) => b.value - a.value);
}

function langName(code: string): string {
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'language' });
    return dn.of(code.replace(/-orig$/, '').split('-')[0]) ?? code;
  } catch {
    return code;
  }
}

export function parseSubtitles(raw: Raw): SubtitleOption[] {
  const out: SubtitleOption[] = [];
  const manual: Raw = raw.subtitles ?? {};
  for (const lang of Object.keys(manual)) {
    if (lang === 'live_chat' || lang === 'rechat' || lang === 'danmaku') continue;
    const name = (manual[lang]?.[0]?.name as string | undefined) ?? langName(lang);
    out.push({ lang, name, auto: false });
  }
  const auto: Raw = raw.automatic_captions ?? {};
  const origKeys = Object.keys(auto).filter((k) => k.endsWith('-orig'));
  const keys = origKeys.length ? origKeys : raw.language && auto[raw.language] ? [raw.language as string] : [];
  for (const lang of keys) {
    if (out.some((s) => s.lang === lang.replace(/-orig$/, ''))) continue;
    out.push({ lang, name: `${langName(lang)} (auto-generated)`, auto: true });
  }
  // Videos in other languages: YouTube can translate the captions to English.
  const hasEnglish = out.some((s) => /^en\b/.test(s.lang));
  if (!hasEnglish && auto.en && !keys.some((k) => /^en\b/.test(k))) {
    out.push({ lang: 'en', name: 'English (auto-translated)', auto: true });
  }
  return out.slice(0, 60);
}

export function thumbnailCandidates(raw: Raw): string[] {
  const urls: string[] = [];
  const isYt = raw.extractor_key === 'Youtube' && typeof raw.id === 'string' && /^[\w-]{11}$/.test(raw.id);
  if (isYt) {
    urls.push(`https://i.ytimg.com/vi/${raw.id}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${raw.id}/hq720.jpg`);
  }
  if (typeof raw.thumbnail === 'string') urls.push(raw.thumbnail);
  const thumbs: Raw[] = Array.isArray(raw.thumbnails) ? raw.thumbnails : [];
  const sorted = thumbs
    .filter((t) => t && typeof t.url === 'string' && !/storyboard/i.test(t.url))
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const pa = Number(a.t.preference ?? 0);
      const pb = Number(b.t.preference ?? 0);
      if (pa !== pb) return pb - pa;
      const sa = (Number(a.t.width) || 0) * (Number(a.t.height) || 0);
      const sb = (Number(b.t.width) || 0) * (Number(b.t.height) || 0);
      if (sa !== sb) return sb - sa;
      return b.i - a.i; // yt-dlp lists worst..best
    });
  for (const { t } of sorted) urls.push(t.url);
  if (isYt) urls.push(`https://i.ytimg.com/vi/${raw.id}/sddefault.jpg`, `https://i.ytimg.com/vi/${raw.id}/hqdefault.jpg`);
  const base = typeof raw.webpage_url === 'string' ? raw.webpage_url : undefined;
  const absolute = urls.map((u) => {
    try {
      return new URL(u, base).toString();
    } catch {
      return u;
    }
  });
  return [...new Set(absolute.filter((u) => /^https?:\/\//i.test(u)))].slice(0, 12);
}

function siteName(raw: Raw): string {
  const key = String(raw.extractor_key ?? raw.ie_key ?? raw.extractor ?? '').replace(/(Tab|Playlist|Post|Reel|Story|User|IE)$/i, '');
  const map: Record<string, string> = {
    Youtube: 'YouTube',
    Instagram: 'Instagram',
    Facebook: 'Facebook',
    TikTok: 'TikTok',
    Twitter: 'X (Twitter)',
    Vimeo: 'Vimeo',
    Dailymotion: 'Dailymotion',
    Reddit: 'Reddit',
    SoundCloud: 'SoundCloud',
    Soundcloud: 'SoundCloud',
    Generic: 'Web',
    HTML5MediaEmbed: 'Web',
  };
  if (map[key]) return map[key];
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(map)) if (lower.startsWith(k.toLowerCase())) return v;
  return key || 'Web';
}

function entryUrl(e: Raw): string | undefined {
  for (const u of [e.webpage_url, e.url, e.original_url]) {
    if (typeof u === 'string' && /^https?:\/\//i.test(u)) return u;
  }
  if (e.ie_key === 'Youtube' && typeof e.id === 'string') return `https://www.youtube.com/watch?v=${e.id}`;
  return undefined;
}

function firstThumb(e: Raw): string | undefined {
  const c = thumbnailCandidates(e);
  return c.find((u) => !/maxresdefault|hq720/.test(u)) ?? c[0];
}

const STANDARD_QUALITIES = [2160, 1440, 1080, 720, 480, 360];

export function parseInfo(raw: Raw, inputUrl: string, key: string): MediaInfo {
  const isPlaylist = raw._type === 'playlist' || raw._type === 'multi_video';
  const base = {
    key,
    inputUrl,
    url: String(raw.webpage_url ?? raw.original_url ?? inputUrl),
    id: String(raw.id ?? ''),
    title: String(raw.title ?? raw.fulltitle ?? 'Untitled').trim() || 'Untitled',
    uploader: (raw.uploader ?? raw.channel ?? raw.creator ?? raw.uploader_id) || undefined,
    site: siteName(raw),
    duration: Number(raw.duration) || undefined,
    viewCount: Number(raw.view_count) || undefined,
    uploadDate: typeof raw.upload_date === 'string' ? raw.upload_date : undefined,
    isLive: raw.is_live === true || raw.live_status === 'is_live' || raw.live_status === 'is_upcoming',
  };

  if (isPlaylist) {
    const rawEntries: Raw[] = (Array.isArray(raw.entries) ? raw.entries : []).filter(Boolean);
    const entries: MediaEntry[] = rawEntries.map((e, i) => ({
      index: i + 1,
      id: e.id ? String(e.id) : undefined,
      title: String(e.title ?? `${base.title} ${i + 1}`),
      url: entryUrl(e),
      duration: Number(e.duration) || undefined,
      thumbnail: firstThumb(e),
    }));
    const separate =
      rawEntries.length > 0 &&
      rawEntries.every((e) => (e._type === 'url' || e._type === 'url_transparent') && entryUrl(e));
    let qualities: QualityOption[];
    let hasVideo = true;
    let hasAudio = true;
    if (!separate) {
      const all = rawEntries.flatMap((e) => (Array.isArray(e.formats) ? e.formats : [e]));
      qualities = computeQualities(all).map((q) => ({ ...q, sizeBytes: undefined }));
      hasVideo = all.some(isVideoFormat) || all.length === 0;
      hasAudio = all.some((f) => isAudioOnly(f) || hasAudioStream(f)) || all.length === 0;
    } else {
      qualities = STANDARD_QUALITIES.map((v) => ({ value: v, ...qualityLabel(v) }));
    }
    const thumbs = thumbnailCandidates(raw);
    if (!thumbs.length && rawEntries[0]) thumbs.push(...thumbnailCandidates(rawEntries[0]));
    return {
      ...base,
      isPlaylist: true,
      thumbnails: thumbs,
      qualities,
      hasVideo,
      hasAudio,
      subtitles: [],
      entries,
      playlistMode: separate ? 'separate' : 'single',
      playlistCount: Number(raw.playlist_count) || entries.length,
    };
  }

  const formats: Raw[] = (Array.isArray(raw.formats) && raw.formats.length ? raw.formats : [raw]).filter(isUsableFormat);
  const qualities = computeQualities(formats, base.duration);
  const audio = bestAudio(formats);
  const hasVideo = formats.some(isVideoFormat);
  const hasAudio = formats.some((f) => isAudioOnly(f) || hasAudioStream(f)) || (hasVideo && formats.some((f) => f.acodec == null));
  return {
    ...base,
    isPlaylist: false,
    thumbnails: thumbnailCandidates(raw),
    qualities,
    hasVideo,
    hasAudio,
    audioSizeBytes: audio ? formatSize(audio, base.duration) : undefined,
    subtitles: parseSubtitles(raw),
    parentPlaylistUrl: youtubePlaylistUrlFor(inputUrl),
  };
}

// ---------------------------------------------------------------------------
// Command lines
// ---------------------------------------------------------------------------

export const PROGRESS_PREFIX = 'VDPROG ';
export const PP_PREFIX = 'VDPP ';

export const DOWNLOAD_PROGRESS_TEMPLATE =
  'download:' +
  PROGRESS_PREFIX +
  '{"s":%(progress.status)j,"d":%(progress.downloaded_bytes)j,"t":%(progress.total_bytes)j,' +
  '"te":%(progress.total_bytes_estimate)j,"sp":%(progress.speed)j,"eta":%(progress.eta)j,' +
  '"fi":%(progress.fragment_index)j,"fc":%(progress.fragment_count)j,"f":%(info.format_id)j,' +
  '"vc":%(info.vcodec)j,"ac":%(info.acodec)j,"pi":%(info.playlist_index)j,"pc":%(info.n_entries)j}';

export const POSTPROCESS_PROGRESS_TEMPLATE =
  'postprocess:' + PP_PREFIX + '%(progress.postprocessor)j %(progress.status)j';

export function buildInfoArgs(common: string[], url: string, cookiesFile?: string): string[] {
  const args = [...common, '-J', '--flat-playlist', '--no-playlist', '--no-warnings'];
  if (cookiesFile) args.push('--cookies', cookiesFile);
  args.push('--', url);
  return args;
}

export interface DownloadArgsInput {
  req: DownloadRequest;
  outDir: string;
  common: string[];
  turbo: boolean;
  connections: number;
  cookiesFile?: string;
  fragments?: number;
  /** Skip optional extras (cover art, metadata, subtitles) after a failure caused by them. */
  safeMode?: boolean;
}

export function outputBaseName(multi: boolean): string {
  return multi ? '%(playlist_index|1)03d.%(ext)s' : 'media.%(ext)s';
}

export function videoSort(quality: DownloadRequest['quality']): string {
  // Prefer H.264 + AAC (plays everywhere). Above 1080p YouTube only has VP9/AV1; VP9 is then chosen.
  return quality === 'best' ? 'res,vcodec:h264,acodec:aac' : `res:${Math.round(quality)},vcodec:h264,acodec:aac`;
}

export function buildDownloadArgs(input: DownloadArgsInput): string[] {
  const { req } = input;
  const args = [
    ...input.common,
    '--newline',
    '--progress',
    '--progress-template',
    DOWNLOAD_PROGRESS_TEMPLATE,
    '--progress-template',
    POSTPROCESS_PROGRESS_TEMPLATE,
    // Do not fail the whole download because subtitles or cover art could not be saved.
    '--ignore-errors',
    '--no-mtime',
    ...(input.safeMode ? [] : ['--embed-metadata']),
    '--concurrent-fragments',
    String(input.fragments ?? 8),
    req.multi ? '--yes-playlist' : '--no-playlist',
    '-o',
    path.join(input.outDir, outputBaseName(Boolean(req.multi))),
  ];

  if (req.kind === 'audio') {
    args.push(
      '-f',
      'ba/b',
      '--extract-audio',
      '--audio-format',
      'mp3',
      '--audio-quality',
      `${req.audioBitrate}K`,
    );
    if (!input.safeMode) args.push('--embed-thumbnail', '--convert-thumbnails', 'jpg');
  } else {
    args.push('-f', 'bv*+ba/b', '-S', videoSort(req.quality), '--merge-output-format', 'mp4', '--remux-video', 'mp4');
    if (req.subtitles?.lang && !input.safeMode) {
      args.push(
        req.subtitles.auto ? '--write-auto-subs' : '--write-subs',
        '--sub-langs',
        req.subtitles.lang,
        '--convert-subs',
        'srt',
      );
      // "In the video": a switchable captions track inside the MP4 (mov_text).
      // "Always visible" is drawn onto the picture afterwards by the download manager.
      if ((req.subtitles.mode ?? 'embed') === 'embed') args.push('--embed-subs');
    }
  }

  if (input.turbo) {
    const c = Math.max(1, Math.min(16, Math.round(input.connections || 16)));
    args.push(
      '--downloader',
      'aria2c',
      '--downloader',
      'm3u8,dash:native',
      '--downloader-args',
      // --auto-save-interval=1: rewrite the control file every second so we can show live progress.
      `aria2c:-x ${c} -s ${c} -k 1M --auto-save-interval=1`,
    );
  }
  if (input.cookiesFile) args.push('--cookies', input.cookiesFile);
  args.push('--', req.url);
  return args;
}

// ---------------------------------------------------------------------------
// Progress parsing
// ---------------------------------------------------------------------------

export type ProgressEvent =
  | {
      type: 'download';
      status: string;
      downloaded?: number;
      total?: number;
      speed?: number;
      eta?: number;
      fragIndex?: number;
      fragCount?: number;
      formatId?: string;
      vcodec?: string;
      acodec?: string;
      playlistIndex?: number;
      playlistCount?: number;
    }
  | { type: 'aria2'; downloaded: number; total: number; percent: number; speed: number; eta?: number }
  | { type: 'postprocess'; name: string; status: string }
  | { type: 'destination'; file: string }
  | { type: 'item'; index: number; count: number };

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== 'NA' ? v : undefined);

const SIZE_UNITS: Record<string, number> = {
  B: 1,
  KIB: 1024,
  MIB: 1024 ** 2,
  GIB: 1024 ** 3,
  TIB: 1024 ** 4,
  KB: 1000,
  MB: 1000 ** 2,
  GB: 1000 ** 3,
};

export function parseSize(value: string, unit: string): number {
  return Number(value) * (SIZE_UNITS[unit.toUpperCase()] ?? 1);
}

export function parseAria2Eta(s?: string): number | undefined {
  if (!s) return undefined;
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(s);
  if (!m || !s) return undefined;
  return (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0);
}

const ARIA2_RE =
  /^\[#[0-9a-f]+\s+([\d.]+)([KMGT]?i?B)\/([\d.]+)([KMGT]?i?B)\((\d+)%\)\s+CN:\d+(?:\s+SD:\d+)?\s+DL:([\d.]+)([KMGT]?i?B)(?:\s+ETA:([\dhms]+))?\]/i;

export function parseProgressLine(line: string): ProgressEvent | null {
  const l = line.trim();
  if (l.startsWith(PROGRESS_PREFIX)) {
    try {
      const json = l.slice(PROGRESS_PREFIX.length).replace(/:\s*(NA|NaN|-?Infinity)(?=\s*[,}])/g, ':null');
      const o = JSON.parse(json);
      return {
        type: 'download',
        status: str(o.s) ?? 'downloading',
        downloaded: num(o.d),
        total: num(o.t) ?? num(o.te),
        speed: num(o.sp),
        eta: num(o.eta),
        fragIndex: num(o.fi),
        fragCount: num(o.fc),
        formatId: str(o.f),
        vcodec: str(o.vc),
        acodec: str(o.ac),
        playlistIndex: num(o.pi),
        playlistCount: num(o.pc),
      };
    } catch {
      return null;
    }
  }
  if (l.startsWith(PP_PREFIX)) {
    const m = /^VDPP\s+"?([^"\s]+)"?\s+"?([^"\s]+)"?/.exec(l);
    return m ? { type: 'postprocess', name: m[1], status: m[2] } : null;
  }
  const a = ARIA2_RE.exec(l);
  if (a) {
    return {
      type: 'aria2',
      downloaded: parseSize(a[1], a[2]),
      total: parseSize(a[3], a[4]),
      percent: Number(a[5]),
      speed: parseSize(a[6], a[7]),
      eta: parseAria2Eta(a[8]),
    };
  }
  const d = /^\[download\] Destination:\s+(.+)$/.exec(l);
  if (d) return { type: 'destination', file: d[1] };
  const it = /^\[download\] Downloading (?:item|video) (\d+) of (\d+)/.exec(l);
  if (it) return { type: 'item', index: Number(it[1]), count: Number(it[2]) };
  return null;
}

export const POSTPROCESSOR_LABELS: Record<string, string> = {
  Merger: 'Joining video and audio…',
  ExtractAudio: 'Converting to MP3…',
  VideoRemuxer: 'Preparing MP4…',
  VideoConvertor: 'Converting video…',
  EmbedThumbnail: 'Adding cover picture…',
  Metadata: 'Adding title and details…',
  FFmpegMetadata: 'Adding title and details…',
  ThumbnailsConvertor: 'Preparing cover picture…',
  SubtitlesConvertor: 'Preparing captions…',
  EmbedSubtitle: 'Adding captions…',
  FixupM3u8: 'Fixing video…',
  FixupM4a: 'Fixing audio…',
  FixupStretched: 'Fixing video…',
  FixupDuplicateMoov: 'Fixing video…',
  FixupTimestamp: 'Fixing video…',
  FixupDuration: 'Fixing video…',
  MoveFiles: 'Finishing…',
};
