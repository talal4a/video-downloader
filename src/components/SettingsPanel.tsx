'use client';

import { CircleCheck, CircleX, FolderOpen, LogIn, LogOut, Monitor, Moon, RefreshCw, Sun, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { qualityChoiceLabel } from '@shared/format';
import type { AccountInfo, AppInfo, AppUpdateState, EngineInfo, QualityChoice, Settings, ThemeSetting } from '@shared/types';
import { cx, getApi } from '@/lib/api';
import { Button, Segmented, Toggle } from './ui';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-slate-200 px-6 py-5 dark:border-white/10">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{title}</h3>
      {children}
    </section>
  );
}

function Status({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-sm', ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
      {ok ? <CircleCheck className="size-4" /> : <CircleX className="size-4" />}
      {children}
    </span>
  );
}

const QUALITIES: QualityChoice[] = ['best', 2160, 1440, 1080, 720, 480, 360];

export default function SettingsPanel({
  open,
  onClose,
  settings,
  engine,
  appUpdate,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  engine: EngineInfo | null;
  appUpdate: AppUpdateState | null;
}) {
  const api = getApi();
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [busyAccount, setBusyAccount] = useState<string | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [updatingEngine, setUpdatingEngine] = useState(false);

  useEffect(() => {
    if (!open || !api) return;
    void api.getAccounts().then(setAccounts);
    void api.getAppInfo().then(setAppInfo);
  }, [open, api]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !api) return null;
  const set = (patch: Partial<Settings>) => void api.updateSettings(patch);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Settings">
      <button type="button" aria-label="Close settings" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex h-full w-[460px] max-w-full animate-fade-in flex-col bg-white shadow-2xl dark:bg-[#111729]">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-white/10">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Section title="Downloads">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Save files to</p>
            <p className="mt-1 break-all rounded-lg bg-slate-100 px-3 py-2 text-[13px] text-slate-600 dark:bg-white/5 dark:text-slate-300">{settings.downloadDir}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => void api.chooseDownloadDir()}>
                Change…
              </Button>
              <Button size="sm" variant="ghost" icon={<FolderOpen className="size-4" />} onClick={() => void api.openDownloadsFolder()}>
                Open
              </Button>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-100">Default video quality</p>
              <div className="flex flex-wrap gap-1.5">
                {QUALITIES.map((q) => (
                  <button
                    key={String(q)}
                    type="button"
                    onClick={() => set({ defaultQuality: q })}
                    className={cx(
                      'h-8 rounded-lg px-3 text-[13px] font-medium ring-1',
                      settings.defaultQuality === q
                        ? 'bg-brand-600 text-white ring-brand-600'
                        : 'ring-slate-200 hover:bg-slate-50 dark:ring-white/10 dark:hover:bg-white/5',
                    )}
                  >
                    {qualityChoiceLabel(q)}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-100">Start with</p>
              <Segmented
                value={settings.defaultKind}
                onChange={(v) => set({ defaultKind: v })}
                options={[
                  { value: 'video', label: 'Video (MP4)' },
                  { value: 'audio', label: 'Audio (MP3)' },
                ]}
              />
            </div>

            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-100">Downloads at the same time</p>
              <Segmented value={settings.maxConcurrent} onChange={(v) => set({ maxConcurrent: v })} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} />
            </div>

            <div className="mt-3">
              <Toggle
                checked={settings.turbo}
                onChange={(v) => set({ turbo: v })}
                label="Turbo mode (multi-connection)"
                description={
                  engine && !engine.aria2
                    ? 'Not available on this computer (aria2 is missing).'
                    : 'Downloads each file in up to 16 parts at once, like IDM. Turns itself off automatically if a site does not allow it.'
                }
                disabled={Boolean(engine && !engine.aria2)}
              />
              {settings.turbo && engine?.aria2 && (
                <div className="mb-1 ml-0.5 flex items-center gap-2 text-[13px] text-slate-500">
                  Connections:
                  <Segmented value={settings.connections} onChange={(v) => set({ connections: v })} options={[4, 8, 16].map((n) => ({ value: n, label: String(n) }))} />
                </div>
              )}
            </div>
          </Section>

          <Section title="Convenience">
            <Toggle
              checked={settings.watchClipboard}
              onChange={(v) => set({ watchClipboard: v })}
              label="Catch copied video links"
              description="When you copy a YouTube, Instagram, TikTok… link anywhere, the app offers to download it."
            />
            <Toggle
              checked={settings.closeToTray}
              onChange={(v) => set({ closeToTray: v })}
              label="Keep running in the background when closed"
              description="The app stays near the clock (system tray) so it can keep catching links and finish downloads."
            />
            <Toggle checked={settings.openAtLogin} onChange={(v) => set({ openAtLogin: v })} label="Start when the computer starts" />
            <Toggle checked={settings.notifyOnFinish} onChange={(v) => set({ notifyOnFinish: v })} label="Show a notification when a download finishes" />
            <div className="mt-2">
              <p className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-100">Appearance</p>
              <Segmented<ThemeSetting>
                value={settings.theme}
                onChange={(v) => set({ theme: v })}
                options={[
                  { value: 'system', label: (<><Monitor className="size-4" /> Auto</>) },
                  { value: 'light', label: (<><Sun className="size-4" /> Light</>) },
                  { value: 'dark', label: (<><Moon className="size-4" /> Dark</>) },
                ]}
              />
            </div>
          </Section>

          <Section title="Accounts (optional)">
            <p className="mb-3 text-[13px] text-slate-500 dark:text-slate-400">
              Some Instagram, Facebook, TikTok or X videos can only be seen when logged in. Log in here once and the app will use it for that site only. Your password is never stored by the app.
            </p>
            <ul className="space-y-2">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-xl px-3 py-2 ring-1 ring-slate-200 dark:ring-white/10">
                  <span className="text-sm font-medium">
                    {a.name}
                    <span className={cx('ml-2 text-xs', a.loggedIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400')}>{a.loggedIn ? '● Logged in' : 'Not logged in'}</span>
                  </span>
                  {a.loggedIn ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<LogOut className="size-4" />}
                      loading={busyAccount === a.id}
                      onClick={async () => {
                        setBusyAccount(a.id);
                        setAccounts(await api.logout(a.id));
                        setBusyAccount(null);
                      }}
                    >
                      Log out
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="subtle"
                      icon={<LogIn className="size-4" />}
                      loading={busyAccount === a.id}
                      onClick={async () => {
                        setBusyAccount(a.id);
                        setAccounts(await api.login(a.id));
                        setBusyAccount(null);
                      }}
                    >
                      Log in
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Download engine">
            {engine ? (
              <div className="space-y-1.5">
                <Status ok={Boolean(engine.ytdlpVersion)}>yt-dlp {engine.ytdlpVersion ?? 'missing'}</Status>
                <br />
                <Status ok={engine.ffmpeg}>FFmpeg {engine.ffmpeg ? 'ready' : 'missing'}</Status>
                <br />
                <Status ok={engine.aria2}>aria2 turbo {engine.aria2 ? 'ready' : 'missing'}</Status>
                <br />
                <Status ok={engine.jsRuntime}>YouTube helper {engine.jsRuntime ? `ready (${engine.jsRuntimeName})` : 'missing — some qualities may not show'}</Status>
                {engine.lastUpdateResult && (
                  <p className="pt-1 text-xs text-slate-500">
                    Last check: {engine.lastUpdateResult}
                    {engine.lastUpdateCheck ? ` (${new Date(engine.lastUpdateCheck).toLocaleString()})` : ''}
                  </p>
                )}
                <div className="pt-2">
                  <Toggle checked={settings.autoUpdateEngine} onChange={(v) => set({ autoUpdateEngine: v })} label="Update automatically every day" description="Sites like YouTube change often. Updates keep downloads working." />
                  <Button
                    size="sm"
                    icon={<RefreshCw className={cx('size-4', (updatingEngine || engine.updating) && 'animate-spin')} />}
                    disabled={updatingEngine || engine.updating}
                    onClick={async () => {
                      setUpdatingEngine(true);
                      await api.updateEngine();
                      setUpdatingEngine(false);
                    }}
                  >
                    {updatingEngine || engine.updating ? 'Updating…' : 'Update now'}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Loading…</p>
            )}
          </Section>

          <Section title="About">
            <p className="text-sm">
              <span className="font-semibold">Video Downloader</span> {appInfo ? `v${appInfo.version}` : ''}
            </p>
            <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
              Free and open source. Uses yt-dlp, FFmpeg and aria2. Only download videos you have the right to keep.
            </p>
            {appUpdate && appUpdate.status !== 'disabled' && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                {appUpdate.status === 'ready' ? (
                  <Button size="sm" variant="primary" onClick={() => void api.installAppUpdate()}>
                    Restart to update to v{appUpdate.version}
                  </Button>
                ) : (
                  <>
                    <span className="text-slate-500">
                      {appUpdate.status === 'checking'
                        ? 'Checking for app updates…'
                        : appUpdate.status === 'downloading'
                          ? `Downloading update ${Math.round((appUpdate.progress ?? 0) * 100)}%`
                          : appUpdate.status === 'none'
                            ? 'The app is up to date.'
                            : appUpdate.status === 'available'
                              ? `Update v${appUpdate.version} found…`
                              : ''}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => void api.checkAppUpdate()}>
                      Check now
                    </Button>
                  </>
                )}
              </div>
            )}
            <button type="button" onClick={() => void api.openExternal('https://github.com/talal4a/video-downloader')} className="mt-3 text-[13px] font-semibold text-brand-600 hover:underline dark:text-brand-300">
              Project page on GitHub →
            </button>
          </Section>
        </div>
      </div>
    </div>
  );
}
