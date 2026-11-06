// Types shared between the Electron main process and the Next.js UI.

export type MediaKind = 'video' | 'audio';

/** Target maximum quality. A number is the short side of the video ("1080" = 1080p). */
export type QualityChoice = number | 'best';

export type AudioBitrate = 320 | 192 | 128;

export interface QualityOption {
  /** Value passed to yt-dlp's `res:` sort (short side of the frame). */
  value: number;
  /** Human label, e.g. "4K", "1080p". */
  label: string;
  /** Short description, e.g. "Full HD". */
  note?: string;
  /** Approximate final file size (video + audio) in bytes, when known. */
  sizeBytes?: number;
  fps?: number;
}

export interface SubtitleOption {
  lang: string;
  name: string;
  auto: boolean;
}

export interface MediaEntry {
  index: number;
  id?: string;
  title: string;
  url?: string;
  duration?: number;
  thumbnail?: string;
}

export interface MediaInfo {
  /** Cache key used to reference this info in later calls (thumbnail, etc.). */
  key: string;
  /** URL the user entered (normalised). */
  inputUrl: string;
  /** Canonical page URL reported by the site. */
  url: string;
  id: string;
  title: string;
  uploader?: string;
  site: string;
  duration?: number;
  viewCount?: number;
  uploadDate?: string;
  isLive: boolean;
  isPlaylist: boolean;
  /** Candidate thumbnail URLs, best first. */
  thumbnails: string[];
  qualities: QualityOption[];
  hasVideo: boolean;
  hasAudio: boolean;
  /** Approximate size of the audio stream in bytes (for MP3 size estimates we use bitrate instead). */
  audioSizeBytes?: number;
  subtitles: SubtitleOption[];
  /** Playlist entries (only when isPlaylist). */
  entries?: MediaEntry[];
  /**
   * How to download a playlist:
   * - "separate": every entry is its own link, so each becomes its own download job.
   * - "single": the entries live on one page (e.g. Instagram carousel), downloaded in one go.
   */
  playlistMode?: 'separate' | 'single';
  playlistCount?: number;
  /** When a single video is opened from a playlist link, the URL of the full playlist. */
  parentPlaylistUrl?: string;
}

export interface DownloadRequest {
  url: string;
  title: string;
  thumbnail?: string;
  site?: string;
  duration?: number;
  kind: MediaKind;
  quality: QualityChoice;
  audioBitrate: AudioBitrate;
  /** Subtitle language code to save as .srt next to the video, or null. */
  subtitles?: { lang: string; auto: boolean } | null;
  /** Put the file(s) in this sub-folder of the download folder (used for playlists). */
  subfolder?: string;
  /** The URL holds several videos that must be downloaded in one go (Instagram carousel etc). */
  multi?: boolean;
}

export type JobStatus = 'queued' | 'starting' | 'downloading' | 'processing' | 'done' | 'error' | 'canceled';

export interface FriendlyError {
  code: string;
  message: string;
  hint?: string;
  details?: string;
}

export interface Job {
  id: string;
  request: DownloadRequest;
  status: JobStatus;
  /** Plain-language description of what is happening right now. */
  stage?: string;
  /** 0..1 */
  progress: number;
  downloadedBytes?: number;
  totalBytes?: number;
  /** bytes per second */
  speed?: number;
  /** seconds */
  eta?: number;
  /** Current item / item count for multi-video posts. */
  itemIndex?: number;
  itemCount?: number;
  /** Final file path (first file when several). */
  filePath?: string;
  files?: string[];
  error?: FriendlyError;
  /** Non-fatal problems (e.g. subtitles could not be saved). */
  warnings?: string[];
  turbo?: boolean;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  attempts: number;
}

export type ThemeSetting = 'system' | 'light' | 'dark';

export interface Settings {
  downloadDir: string;
  watchClipboard: boolean;
  /** Multi-connection downloads with aria2 (IDM style). */
  turbo: boolean;
  connections: number;
  maxConcurrent: number;
  closeToTray: boolean;
  openAtLogin: boolean;
  defaultKind: MediaKind;
  defaultQuality: QualityChoice;
  audioBitrate: AudioBitrate;
  theme: ThemeSetting;
  notifyOnFinish: boolean;
  autoUpdateEngine: boolean;
}

export interface EngineInfo {
  ytdlpVersion?: string;
  ytdlpPath?: string;
  ffmpeg: boolean;
  aria2: boolean;
  jsRuntime: boolean;
  updating: boolean;
  lastUpdateCheck?: number;
  lastUpdateResult?: string;
  problems: string[];
}

export type AccountId = 'instagram' | 'facebook' | 'tiktok' | 'x';

export interface AccountInfo {
  id: AccountId;
  name: string;
  loggedIn: boolean;
}

export interface AppUpdateState {
  status: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'none' | 'error';
  version?: string;
  progress?: number;
  message?: string;
}

export interface AppInfo {
  version: string;
  platform: string;
  isPackaged: boolean;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: FriendlyError };

export interface ThumbnailPreview {
  dataUrl: string;
  width?: number;
  height?: number;
}
