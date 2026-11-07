// Data for the Preview Studio (social media simulator). Everything stays on this computer.

export type PreviewPlatform = 'youtube' | 'instagram' | 'tiktok';
export type PreviewView = 'yt-home' | 'yt-shorts' | 'ig-reels' | 'ig-grid' | 'tt-fyp' | 'tt-grid';

export interface PreviewData {
  /** blob:, vdmedia: or https: address of the video (optional). */
  videoUrl?: string;
  videoName?: string;
  /** blob:, data: or https: address of the thumbnail / cover (optional). */
  thumbUrl?: string;
  avatarUrl?: string;
  title: string;
  channel: string;
  handle: string;
  caption: string;
  sound: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  age: string;
  /** seconds, read from the video when one is loaded */
  duration?: number;
  verified: boolean;
}

export const EMPTY_PREVIEW: PreviewData = {
  title: 'My new video — watch till the end!',
  channel: 'Your Channel',
  handle: 'yourname',
  caption: 'This is how my post looks 🔥 #viral #fyp',
  sound: 'Original sound - yourname',
  views: 125000,
  likes: 8400,
  comments: 312,
  shares: 120,
  age: '2 days ago',
  verified: false,
};

export const VIEWS: Record<PreviewPlatform, { id: PreviewView; label: string; shape: 'wide' | 'phone' }[]> = {
  youtube: [
    { id: 'yt-home', label: 'Home feed', shape: 'wide' },
    { id: 'yt-shorts', label: 'Shorts', shape: 'phone' },
  ],
  instagram: [
    { id: 'ig-reels', label: 'Reels feed', shape: 'phone' },
    { id: 'ig-grid', label: 'Profile grid', shape: 'phone' },
  ],
  tiktok: [
    { id: 'tt-fyp', label: 'For You feed', shape: 'phone' },
    { id: 'tt-grid', label: 'Profile grid', shape: 'phone' },
  ],
};

export const PLATFORM_NAMES: Record<PreviewPlatform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

export function platformOf(view: PreviewView): PreviewPlatform {
  return view.startsWith('yt') ? 'youtube' : view.startsWith('ig') ? 'instagram' : 'tiktok';
}

/**
 * Parts of a full-screen vertical video covered by each app's buttons and text
 * (percent of the screen). Approximate — apps change their layouts over time.
 */
export const SAFE_ZONES: Record<'yt-shorts' | 'ig-reels' | 'tt-fyp', { top: number; bottom: number; right: number }> = {
  'yt-shorts': { top: 9, bottom: 24, right: 16 },
  'ig-reels': { top: 8, bottom: 22, right: 15 },
  'tt-fyp': { top: 10, bottom: 26, right: 17 },
};

/** Other posts shown around yours so it looks like a real feed. */
export const SAMPLE_POSTS = [
  { title: 'I tried cooking every street food in one day', channel: 'Food Trails', views: 2_400_000, age: '3 weeks ago', duration: 924, colors: ['#f97316', '#be123c'] },
  { title: '10 phone tricks nobody tells you about', channel: 'Tech Simple', views: 860_000, age: '5 days ago', duration: 612, colors: ['#0ea5e9', '#4338ca'] },
  { title: 'Sunrise hike above the clouds (4K)', channel: 'Wander North', views: 431_000, age: '1 month ago', duration: 1388, colors: ['#22c55e', '#0f766e'] },
  { title: 'Beginner guitar: your first song in 15 minutes', channel: 'Strum Easy', views: 1_100_000, age: '2 years ago', duration: 903, colors: ['#eab308', '#b45309'] },
  { title: 'We built a tiny house in 30 days', channel: 'Build Crew', views: 5_600_000, age: '8 months ago', duration: 1745, colors: ['#a855f7', '#6d28d9'] },
  { title: 'Morning routine that changed my life', channel: 'Calm Days', views: 290_000, age: '4 days ago', duration: 488, colors: ['#ec4899', '#9d174d'] },
  { title: 'Cheapest vs most expensive burger', channel: 'Taste Test', views: 3_200_000, age: '6 days ago', duration: 1012, colors: ['#ef4444', '#7c2d12'] },
  { title: 'Learn this before your next exam', channel: 'Study Hub', views: 77_000, age: '11 hours ago', duration: 541, colors: ['#14b8a6', '#155e75'] },
];

export function gradient(colors: string[]): string {
  return `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
}

/** "1234567" -> "1.2M" like the apps show it. */
export function compact(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/\.0$/, '')}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(Math.round(n));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? 'Y') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Split a caption into plain text and #hashtags / @mentions (shown bold in the apps). */
export function captionParts(text: string): { text: string; tag: boolean }[] {
  const out: { text: string; tag: boolean }[] = [];
  const re = /([#@][\p{L}\p{N}_]+)/gu;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index), tag: false });
    out.push({ text: m[0], tag: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), tag: false });
  return out;
}

export function cleanHandle(h: string): string {
  return h.trim().replace(/^@+/, '').replace(/\s+/g, '').slice(0, 30) || 'yourname';
}
