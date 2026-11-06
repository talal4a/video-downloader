// Link detection helpers (used for the paste box and the clipboard watcher).

export interface KnownSite {
  name: string;
  hosts: string[];
}

export const KNOWN_SITES: KnownSite[] = [
  { name: 'YouTube', hosts: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'] },
  { name: 'Instagram', hosts: ['instagram.com', 'instagr.am'] },
  { name: 'Facebook', hosts: ['facebook.com', 'fb.watch', 'fb.com'] },
  { name: 'TikTok', hosts: ['tiktok.com'] },
  { name: 'X (Twitter)', hosts: ['x.com', 'twitter.com'] },
  { name: 'Vimeo', hosts: ['vimeo.com'] },
  { name: 'Dailymotion', hosts: ['dailymotion.com', 'dai.ly'] },
  { name: 'Reddit', hosts: ['reddit.com', 'redd.it'] },
  { name: 'Twitch', hosts: ['twitch.tv'] },
  { name: 'SoundCloud', hosts: ['soundcloud.com'] },
  { name: 'Pinterest', hosts: ['pinterest.com', 'pin.it'] },
  { name: 'LinkedIn', hosts: ['linkedin.com'] },
  { name: 'Threads', hosts: ['threads.net', 'threads.com'] },
  { name: 'Snapchat', hosts: ['snapchat.com'] },
  { name: 'Bilibili', hosts: ['bilibili.com', 'b23.tv'] },
  { name: 'Rumble', hosts: ['rumble.com'] },
  { name: 'Streamable', hosts: ['streamable.com'] },
  { name: 'Bandcamp', hosts: ['bandcamp.com'] },
  { name: 'VK', hosts: ['vk.com', 'vkvideo.ru'] },
  { name: 'OK.ru', hosts: ['ok.ru'] },
  { name: 'Imgur', hosts: ['imgur.com'] },
  { name: 'Tumblr', hosts: ['tumblr.com'] },
  { name: '9GAG', hosts: ['9gag.com'] },
  { name: 'Kick', hosts: ['kick.com'] },
  { name: 'Mixcloud', hosts: ['mixcloud.com'] },
  { name: 'TED', hosts: ['ted.com'] },
  { name: 'Likee', hosts: ['likee.video'] },
];

const MEDIA_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|flv|m3u8|mpd|mp3|m4a|aac|wav|flac|ogg|opus)(\?|#|$)/i;

const HTTP_URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/i;

function bareSiteRegex(): RegExp {
  const hosts = KNOWN_SITES.flatMap((s) => s.hosts)
    .map((h) => h.replace(/\./g, '\\.'))
    .join('|');
  return new RegExp(`(?:^|[\\s(])((?:[a-z0-9-]+\\.)*(?:${hosts})\\/[^\\s<>"'\`]*)`, 'i');
}
const BARE_SITE_RE = bareSiteRegex();

function trimTrailingPunctuation(url: string): string {
  let out = url.replace(/[.,;:!?'"]+$/, '');
  // Remove a trailing ")" or "]" only when unbalanced (e.g. "(see https://x.com/a)").
  for (const [open, close] of [
    ['(', ')'],
    ['[', ']'],
  ] as const) {
    while (out.endsWith(close) && count(out, close) > count(out, open)) out = out.slice(0, -1);
  }
  return out;
}

function count(s: string, ch: string): number {
  let n = 0;
  for (const c of s) if (c === ch) n++;
  return n;
}

/** Find the first web link in any text (also accepts "youtu.be/xyz" without https://). */
export function extractFirstUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.trim();
  if (!t || t.length > 8000) return null;
  const m = HTTP_URL_RE.exec(t);
  if (m) return trimTrailingPunctuation(m[0]);
  const b = BARE_SITE_RE.exec(t);
  if (b) return `https://${trimTrailingPunctuation(b[1])}`;
  return null;
}

export function safeParseUrl(url: string): URL | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

function hostMatches(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return h === domain || h.endsWith(`.${domain}`);
}

export function siteForUrl(url: string): KnownSite | null {
  const u = safeParseUrl(url);
  if (!u) return null;
  return KNOWN_SITES.find((s) => s.hosts.some((h) => hostMatches(u.hostname, h))) ?? null;
}

export function isYouTubeUrl(url: string): boolean {
  return siteForUrl(url)?.name === 'YouTube';
}

/**
 * Does this look like a link to a video/audio page? Used for clipboard detection,
 * so it must not fire on every link the user copies (e.g. a plain homepage).
 */
export function isLikelyMediaUrl(url: string): boolean {
  const u = safeParseUrl(url);
  if (!u) return false;
  if (MEDIA_EXT.test(u.pathname)) return true;
  const site = siteForUrl(url);
  if (!site) return false;
  const path = u.pathname.replace(/\/+$/, '');
  if (site.name === 'YouTube') {
    if (u.hostname.toLowerCase().endsWith('youtu.be')) return path.length > 1;
    return (
      (path === '/watch' && u.searchParams.has('v')) ||
      (path === '/playlist' && u.searchParams.has('list')) ||
      /^\/(shorts|live|embed|v)\/[\w-]+/.test(path) ||
      /^\/(@[\w.-]+|channel\/[\w-]+|c\/[\w.-]+|user\/[\w.-]+)(\/(videos|shorts|streams))?$/.test(path)
    );
  }
  if (site.name === 'Instagram') return /^\/(p|reel|reels|tv|stories)\//.test(`${path}/`);
  if (site.name === 'Facebook') {
    return (
      u.hostname.endsWith('fb.watch') ||
      /\/(videos|watch|reel|share|story\.php)/.test(path) ||
      u.searchParams.has('v')
    );
  }
  if (site.name === 'TikTok') return /\/video\/\d+/.test(path) || /^(vm|vt)\./.test(u.hostname) || /^\/t\//.test(path);
  if (site.name === 'X (Twitter)') return /\/status\/\d+/.test(path);
  return path.length > 1;
}

/** Clean up a link before handing it to yt-dlp. */
export function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/+/, '')}`;
  const u = safeParseUrl(url);
  if (!u) return url;
  if (isYouTubeUrl(url) && !u.hostname.toLowerCase().endsWith('youtu.be')) {
    const path = u.pathname.replace(/\/+$/, '');
    // A channel page without a tab -> its "Videos" tab (yt-dlp would otherwise list tabs).
    if (/^\/(@[\w.-]+|channel\/[\w-]+|c\/[\w.-]+|user\/[\w.-]+)$/.test(path)) {
      u.pathname = `${path}/videos`;
    }
  }
  return u.toString();
}

/** If a YouTube watch link also carries a playlist, return the link to the whole playlist. */
export function youtubePlaylistUrlFor(url: string): string | undefined {
  const u = safeParseUrl(url);
  if (!u || !isYouTubeUrl(url)) return undefined;
  const list = u.searchParams.get('list');
  if (!list) return undefined;
  if (u.pathname.replace(/\/+$/, '') === '/playlist') return undefined;
  // Skip auto-generated mixes, "watch later" etc. — they are endless or private.
  if (/^(RD|UL|WL$|LL$)/.test(list)) return undefined;
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(list)}`;
}

export function displayHost(url: string): string {
  const u = safeParseUrl(url);
  return u ? u.hostname.replace(/^www\./, '') : url;
}
