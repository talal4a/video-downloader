// Small formatting helpers shared by the UI and the main process.

export function formatBytes(bytes?: number | null, digits = 1): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const d = value >= 100 ? 0 : digits;
  return `${value.toFixed(d)} ${units[unit]}`;
}

export function formatSpeed(bytesPerSecond?: number | null): string {
  if (!bytesPerSecond || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '';
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatDuration(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function formatEta(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s left`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s left`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m left`;
}

export function formatCount(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return '';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

const STANDARD: Record<number, { label: string; note?: string }> = {
  4320: { label: '8K', note: '4320p' },
  2160: { label: '4K', note: '2160p' },
  1440: { label: '2K', note: '1440p' },
  1080: { label: '1080p', note: 'Full HD' },
  720: { label: '720p', note: 'HD' },
  480: { label: '480p' },
  360: { label: '360p' },
  240: { label: '240p' },
  144: { label: '144p' },
};

/**
 * Label a video quality. `shortSide` is min(width, height) — what yt-dlp calls "res".
 * `longSide` helps for unusual aspect ratios (e.g. a 3840x1600 cinema video is still "4K").
 */
export function qualityLabel(shortSide: number, longSide?: number): { label: string; note?: string } {
  if (STANDARD[shortSide]) return STANDARD[shortSide];
  const long = longSide ?? Math.round((shortSide * 16) / 9);
  if (long >= 7680) return STANDARD[4320];
  if (long >= 3840) return STANDARD[2160];
  if (long >= 2560) return STANDARD[1440];
  if (long >= 1920) return STANDARD[1080];
  if (long >= 1280) return STANDARD[720];
  return { label: `${shortSide}p` };
}

export function qualityChoiceLabel(q: number | 'best'): string {
  return q === 'best' ? 'Best' : qualityLabel(q).label;
}
