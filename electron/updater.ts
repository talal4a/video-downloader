// Keeps the app itself up to date from GitHub Releases (Windows installer builds only).
import { EventEmitter } from 'node:events';
import type { AppUpdateState } from '../shared/types';

export class AppUpdater extends EventEmitter {
  state: AppUpdateState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private updater: any = null;

  constructor(
    enabled: boolean,
    private readonly log: (msg: string) => void,
  ) {
    super();
    this.state = { status: enabled ? 'idle' : 'disabled' };
    if (!enabled) return;
    try {
      // Loaded lazily so development builds never touch it.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { autoUpdater } = require('electron-updater');
      this.updater = autoUpdater;
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.logger = { info: log, warn: log, error: log, debug: () => {} };
      autoUpdater.on('checking-for-update', () => this.set({ status: 'checking' }));
      autoUpdater.on('update-available', (i: { version: string }) => this.set({ status: 'available', version: i.version }));
      autoUpdater.on('update-not-available', () => this.set({ status: 'none' }));
      autoUpdater.on('download-progress', (p: { percent: number }) =>
        this.set({ status: 'downloading', version: this.state.version, progress: p.percent / 100 }),
      );
      autoUpdater.on('update-downloaded', (i: { version: string }) => this.set({ status: 'ready', version: i.version }));
      autoUpdater.on('error', (err: Error) => {
        log(`App update error: ${err?.message}`);
        this.set({ status: 'error', message: 'Could not check for app updates.' });
      });
    } catch (err) {
      log(`electron-updater unavailable: ${(err as Error).message}`);
      this.state = { status: 'disabled' };
    }
  }

  private set(s: AppUpdateState): void {
    this.state = s;
    this.emit('state', s);
  }

  async check(): Promise<AppUpdateState> {
    if (!this.updater) return this.state;
    try {
      await this.updater.checkForUpdates();
    } catch (err) {
      this.log(`checkForUpdates failed: ${(err as Error).message}`);
    }
    return this.state;
  }

  install(): void {
    if (this.updater && this.state.status === 'ready') this.updater.quitAndInstall(true, true);
  }
}
