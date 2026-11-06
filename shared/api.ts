// The API the desktop app exposes to the UI as `window.vd` (see electron/preload.ts).
import type {
  AccountId,
  AccountInfo,
  AppInfo,
  AppUpdateState,
  DownloadRequest,
  EngineInfo,
  Job,
  MediaInfo,
  Result,
  Settings,
  ThumbnailPreview,
} from './types';

export interface VideoDownloaderApi {
  getInfo(url: string): Promise<Result<MediaInfo>>;
  getThumbnail(key: string): Promise<ThumbnailPreview | null>;
  saveThumbnail(key: string): Promise<Result<string>>;

  startDownloads(requests: DownloadRequest[]): Promise<Result<Job[]>>;
  listDownloads(): Promise<Job[]>;
  cancelDownload(id: string): Promise<void>;
  retryDownload(id: string): Promise<void>;
  removeDownload(id: string): Promise<void>;
  clearFinished(): Promise<void>;

  openFile(path: string): Promise<Result<void>>;
  showInFolder(path: string): Promise<void>;
  openDownloadsFolder(): Promise<void>;
  openExternal(url: string): Promise<void>;
  readClipboardUrl(): Promise<string | null>;

  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  chooseDownloadDir(): Promise<Settings>;

  getEngineInfo(): Promise<EngineInfo>;
  updateEngine(): Promise<EngineInfo>;

  getAccounts(): Promise<AccountInfo[]>;
  login(id: AccountId): Promise<AccountInfo[]>;
  logout(id: AccountId): Promise<AccountInfo[]>;

  getAppInfo(): Promise<AppInfo>;
  getAppUpdate(): Promise<AppUpdateState>;
  checkAppUpdate(): Promise<AppUpdateState>;
  installAppUpdate(): Promise<void>;

  onDownloadUpdate(cb: (job: Job) => void): () => void;
  onDownloadRemoved(cb: (id: string) => void): () => void;
  onClipboardLink(cb: (url: string) => void): () => void;
  onOpenUrl(cb: (url: string) => void): () => void;
  onSettingsChanged(cb: (s: Settings) => void): () => void;
  onEngineInfo(cb: (e: EngineInfo) => void): () => void;
  onAppUpdate(cb: (u: AppUpdateState) => void): () => void;
}

export const IPC = {
  getInfo: 'info:get',
  getThumbnail: 'thumb:get',
  saveThumbnail: 'thumb:save',
  startDownloads: 'dl:start',
  listDownloads: 'dl:list',
  cancelDownload: 'dl:cancel',
  retryDownload: 'dl:retry',
  removeDownload: 'dl:remove',
  clearFinished: 'dl:clear',
  openFile: 'shell:openFile',
  showInFolder: 'shell:showInFolder',
  openDownloadsFolder: 'shell:openDownloads',
  openExternal: 'shell:openExternal',
  readClipboardUrl: 'clipboard:readUrl',
  getSettings: 'settings:get',
  updateSettings: 'settings:update',
  chooseDownloadDir: 'settings:chooseDir',
  getEngineInfo: 'engine:get',
  updateEngine: 'engine:update',
  getAccounts: 'accounts:get',
  login: 'accounts:login',
  logout: 'accounts:logout',
  getAppInfo: 'app:info',
  getAppUpdate: 'app:update:get',
  checkAppUpdate: 'app:update:check',
  installAppUpdate: 'app:update:install',
  // events (main -> renderer)
  evDownloadUpdate: 'ev:dl:update',
  evDownloadRemoved: 'ev:dl:removed',
  evClipboardLink: 'ev:clipboard',
  evOpenUrl: 'ev:openUrl',
  evSettings: 'ev:settings',
  evEngine: 'ev:engine',
  evAppUpdate: 'ev:appUpdate',
} as const;

declare global {
  interface Window {
    vd?: VideoDownloaderApi;
  }
}
