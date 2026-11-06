import type { AudioBitrate, QualityChoice, Settings, SubtitleMode, ThemeSetting } from '../../shared/types';

export function defaultSettings(downloadDir: string): Settings {
  return {
    downloadDir,
    watchClipboard: true,
    turbo: true,
    connections: 16,
    maxConcurrent: 3,
    closeToTray: true,
    openAtLogin: false,
    defaultKind: 'video',
    defaultQuality: 1080,
    audioBitrate: 320,
    theme: 'system',
    notifyOnFinish: true,
    autoUpdateEngine: true,
    subtitleMode: 'embed',
  };
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Merge a (possibly bad) patch into settings, keeping every value valid. */
export function sanitizeSettings(current: Settings, patch: Partial<Settings>): Settings {
  const s: Settings = { ...current };
  const p = patch ?? {};
  if (typeof p.downloadDir === 'string' && p.downloadDir.trim()) s.downloadDir = p.downloadDir.trim();
  for (const key of ['watchClipboard', 'turbo', 'closeToTray', 'openAtLogin', 'notifyOnFinish', 'autoUpdateEngine'] as const) {
    if (typeof p[key] === 'boolean') s[key] = p[key] as boolean;
  }
  if (typeof p.connections === 'number' && Number.isFinite(p.connections)) s.connections = clamp(Math.round(p.connections), 1, 16);
  if (typeof p.maxConcurrent === 'number' && Number.isFinite(p.maxConcurrent))
    s.maxConcurrent = clamp(Math.round(p.maxConcurrent), 1, 5);
  if (p.defaultKind === 'video' || p.defaultKind === 'audio') s.defaultKind = p.defaultKind;
  if (p.defaultQuality === 'best' || (typeof p.defaultQuality === 'number' && p.defaultQuality >= 100 && p.defaultQuality <= 4320))
    s.defaultQuality = p.defaultQuality as QualityChoice;
  if (p.audioBitrate === 320 || p.audioBitrate === 192 || p.audioBitrate === 128) s.audioBitrate = p.audioBitrate as AudioBitrate;
  if (p.theme === 'system' || p.theme === 'light' || p.theme === 'dark') s.theme = p.theme as ThemeSetting;
  if (p.subtitleMode === 'embed' || p.subtitleMode === 'burn' || p.subtitleMode === 'file') s.subtitleMode = p.subtitleMode as SubtitleMode;
  return s;
}
