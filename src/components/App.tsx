'use client';

import { ArrowRight, ClipboardPaste, Download, Link2, LoaderCircle, MousePointerClick, RotateCcw, Settings as SettingsIcon, Smartphone, Sparkles, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import type { AppUpdateState, DownloadRequest, EngineInfo, FriendlyError, Job, MediaInfo, Settings } from '@shared/types';
import { cx, fileName, findUrl, getApi, hostOf } from '@/lib/api';
import { EMPTY_PREVIEW, type PreviewData, type PreviewView } from '@/lib/preview';
import DownloadList from './DownloadList';
import MediaCard from './MediaCard';
import PlaylistCard from './PlaylistCard';
import PreviewStudio from './preview/PreviewStudio';
import SettingsPanel from './SettingsPanel';
import { ToastProvider, useToast } from './Toasts';
import { Button, Card, ProgressBar, Segmented } from './ui';

type InfoState =
  | { status: 'idle' }
  | { status: 'loading'; url: string }
  | { status: 'error'; url: string; error: FriendlyError }
  | { status: 'ready'; info: MediaInfo };

const SITES = ['YouTube', 'Instagram', 'TikTok', 'Facebook', 'X (Twitter)', 'Vimeo', 'Reddit', 'Dailymotion', 'SoundCloud', '+1000 more'];

function Logo() {
  return (
    <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-fuchsia-500 text-white shadow-md shadow-brand-500/30">
      <Download className="size-5" strokeWidth={2.5} />
    </div>
  );
}

function applyTheme(theme: Settings['theme']) {
  try {
    localStorage.setItem('vd-theme', theme);
  } catch {
    /* ignore */
  }
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

function NotInApp() {
  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
      <Logo />
      <h1 className="text-2xl font-bold">Video Downloader</h1>
      <p className="text-slate-500">
        This is the screen of the Video Downloader desktop app. Open it with the app (or run <code className="rounded bg-slate-200 px-1 dark:bg-white/10">npm run dev</code>) to download videos.
      </p>
    </main>
  );
}

function Main() {
  const api = getApi()!;
  const toast = useToast();
  const [input, setInput] = useState('');
  const [state, setState] = useState<InfoState>({ status: 'idle' });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [engine, setEngine] = useState<EngineInfo | null>(null);
  const [appUpdate, setAppUpdate] = useState<AppUpdateState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState<'download' | 'preview'>('download');
  const [preview, setPreview] = useState<PreviewData>(EMPTY_PREVIEW);
  const [previewView, setPreviewView] = useState<PreviewView>('yt-home');
  const tabRef = useRef(tab);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  /** Open the Preview Studio with a downloaded video or a video's thumbnail and details. */
  const openPreview = useCallback((patch: Partial<PreviewData>) => {
    setPreview((d) => {
      for (const key of ['videoUrl', 'thumbUrl'] as const) {
        if (key in patch && d[key]?.startsWith('blob:') && d[key] !== patch[key]) URL.revokeObjectURL(d[key]!);
      }
      return { ...d, ...patch };
    });
    setTab('preview');
    window.scrollTo({ top: 0 });
  }, []);
  const [clipLink, setClipLink] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const requestId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const downloadsRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const load = useCallback(
    async (raw: string) => {
      const url = (findUrl(raw) ?? raw).trim();
      if (!url) return;
      setInput(url);
      setClipLink(null);
      const id = ++requestId.current;
      setState({ status: 'loading', url });
      const res = await api.getInfo(url);
      if (id !== requestId.current) return;
      setState(res.ok ? { status: 'ready', info: res.value } : { status: 'error', url, error: res.error });
    },
    [api],
  );

  // Initial data + live updates from the app.
  useEffect(() => {
    void api.getSettings().then((s) => {
      setSettings(s);
      applyTheme(s.theme);
    });
    void api.listDownloads().then(setJobs);
    void api.getEngineInfo().then(setEngine);
    void api.getAppUpdate().then(setAppUpdate);
    const offs = [
      api.onDownloadUpdate((job) =>
        setJobs((list) => {
          const i = list.findIndex((j) => j.id === job.id);
          if (i === -1) return [job, ...list];
          const copy = list.slice();
          copy[i] = job;
          return copy;
        }),
      ),
      api.onDownloadRemoved((id) => setJobs((list) => list.filter((j) => j.id !== id))),
      api.onSettingsChanged((s) => {
        setSettings(s);
        applyTheme(s.theme);
      }),
      api.onEngineInfo(setEngine),
      api.onAppUpdate(setAppUpdate),
      api.onOpenUrl((url) => void load(url)),
      api.onClipboardLink((url) => {
        const s = stateRef.current;
        // Nothing on screen yet: get the video straight away (IDM style). Otherwise just offer it.
        if (s.status === 'idle' || (s.status === 'error' && s.url !== url)) void load(url);
        else if (!(s.status === 'ready' && (s.info.inputUrl === url || s.info.url === url)) && !(s.status === 'loading' && s.url === url)) setClipLink(url);
      }),
    ];
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => void api.getSettings().then((s) => applyTheme(s.theme));
    mq.addEventListener('change', onScheme);
    return () => {
      offs.forEach((off) => off());
      mq.removeEventListener('change', onScheme);
    };
  }, [api, load]);

  // Ctrl+V anywhere on the page loads the link.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (tabRef.current !== 'download') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const text = e.clipboardData?.getData('text') ?? '';
      const url = findUrl(text);
      if (url) {
        e.preventDefault();
        void load(url);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [load]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim()) void load(input);
    else inputRef.current?.focus();
  };

  const pasteFromClipboard = async () => {
    const url = await api.readClipboardUrl();
    if (url) void load(url);
    else toast({ tone: 'info', title: 'No link copied yet', body: 'Copy a video link first (from the address bar or the Share button), then click Paste.' });
  };

  const startDownloads = async (reqs: DownloadRequest[]) => {
    const res = await api.startDownloads(reqs);
    if (!res.ok) {
      toast({ tone: 'error', title: res.error.message, body: res.error.hint });
      return false;
    }
    toast({
      tone: 'success',
      title: reqs.length > 1 ? `${reqs.length} downloads added` : 'Download started',
      body: reqs.length === 1 ? reqs[0].title : undefined,
    });
    setTimeout(() => downloadsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    return true;
  };

  const saveThumbnail = async (key: string) => {
    const res = await api.saveThumbnail(key);
    if (res.ok) {
      toast({ tone: 'success', title: 'Thumbnail saved', body: res.value.split(/[\\/]/).pop(), action: { label: 'Show in folder', onClick: () => void api.showInFolder(res.value) } });
    } else {
      toast({ tone: 'error', title: res.error.message, body: res.error.hint });
    }
  };

  const loading = state.status === 'loading';
  const [fixing, setFixing] = useState(false);
  const fixEngine = async () => {
    setFixing(true);
    setEngine(await api.updateEngine());
    setFixing(false);
  };

  return (
    <div
      className="min-h-full"
      onDragOver={(e) => {
        e.preventDefault();
        if (tab === 'download') setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
        const url = findUrl(text);
        if (url) void load(url);
      }}
    >
      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-30 flex items-center justify-center rounded-3xl border-4 border-dashed border-brand-400 bg-brand-500/10 text-xl font-semibold text-brand-700 dark:text-brand-200">
          Drop the link here
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-slate-50/80 backdrop-blur dark:border-white/10 dark:bg-[#0b1020]/80">
        <div className={cx('mx-auto flex items-center justify-between gap-4 px-6 py-3', tab === 'preview' ? 'max-w-7xl' : 'max-w-5xl')}>
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <h1 className="text-[17px] font-bold leading-tight">Video Downloader</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Videos · MP3 · Thumbnails — free & open source</p>
            </div>
          </div>
          <Segmented<'download' | 'preview'>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'download', label: (<><Download className="size-4" /> Download</>) },
              { value: 'preview', label: (<><Smartphone className="size-4" /> Preview studio</>) },
            ]}
          />
          <div className="flex items-center gap-2">
            {engine && (
              <span
                title={engine.problems.length ? engine.problems.join('\n') : `Engine ready (yt-dlp ${engine.ytdlpVersion ?? ''})`}
                className={cx(
                  'hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex',
                  engine.problems.length ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
                )}
              >
                <span className={cx('size-1.5 rounded-full', engine.problems.length ? 'bg-rose-500' : 'bg-emerald-500')} />
                {engine.setup && !engine.setup.error ? 'Setting up…' : engine.updating ? 'Updating engine…' : engine.problems.length ? 'Problem' : 'Ready'}
              </span>
            )}
            <Button variant="ghost" icon={<SettingsIcon className="size-4" />} onClick={() => setSettingsOpen(true)} data-testid="open-settings">
              Settings
            </Button>
          </div>
        </div>
      </header>

      <main className={cx('mx-auto space-y-5 px-6 py-6', tab === 'preview' ? 'max-w-7xl' : 'max-w-5xl')}>
        {appUpdate?.status === 'ready' && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-600 px-4 py-3 text-white shadow">
            <span className="inline-flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4" /> A new version (v{appUpdate.version}) is ready.
            </span>
            <Button size="sm" onClick={() => void api.installAppUpdate()}>
              Restart now
            </Button>
          </div>
        )}

        {engine?.setup && !engine.setup.error && (
          <div className="rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-200 dark:bg-brand-500/10 dark:ring-brand-500/30" data-testid="setup-banner">
            <p className="flex items-center gap-2 text-sm font-semibold text-brand-900 dark:text-brand-100">
              <LoaderCircle className="size-4 animate-spin" /> Getting ready for first use — this happens only once
            </p>
            <p className="mt-1 text-[13px] text-brand-800/80 dark:text-brand-200/80">
              {engine.setup.step}
              {engine.setup.progress != null && engine.setup.progress > 0 ? ` ${Math.round(engine.setup.progress * 100)}%` : ''}
            </p>
            <div className="mt-2">
              <ProgressBar value={engine.setup.progress ?? 0} indeterminate={!engine.setup.progress} />
            </div>
          </div>
        )}

        {engine && (engine.problems.length > 0 || engine.setup?.error) && (
          <div className="flex items-start gap-3 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/30">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              {engine.problems.map((p) => (
                <p key={p}>{p}</p>
              ))}
              <p className="mt-1 text-rose-600 dark:text-rose-300">
                The app downloads these parts automatically. Check that the internet is working, then click Fix it.
              </p>
              <Button size="sm" variant="danger" className="mt-2" loading={fixing} onClick={fixEngine}>
                Fix it
              </Button>
            </div>
          </div>
        )}

        {tab === 'preview' ? (
          <PreviewStudio data={preview} setData={setPreview} view={previewView} setView={setPreviewView} />
        ) : (
          <>
        <Card className="p-6">
          <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => {
                  const url = findUrl(e.clipboardData.getData('text'));
                  if (url) {
                    e.preventDefault();
                    void load(url);
                  }
                }}
                placeholder="Paste a video link here (YouTube, Instagram, TikTok, Facebook…)"
                aria-label="Video link"
                data-testid="url-input"
                spellCheck={false}
                autoFocus
                className="h-14 w-full rounded-2xl bg-slate-100 pl-12 pr-10 text-[15px] text-slate-900 ring-1 ring-transparent transition placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-white/5 dark:text-white dark:focus:bg-white/10"
              />
              {input && (
                <button
                  type="button"
                  aria-label="Clear"
                  onClick={() => {
                    setInput('');
                    requestId.current++;
                    setState({ status: 'idle' });
                    inputRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-white/10"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="lg" variant="secondary" icon={<ClipboardPaste className="size-5" />} onClick={pasteFromClipboard} data-testid="paste-button">
                Paste
              </Button>
              <Button size="lg" variant="primary" type="submit" loading={loading} icon={!loading ? <ArrowRight className="size-5" /> : undefined} data-testid="go-button">
                {loading ? 'Getting…' : 'Get video'}
              </Button>
            </div>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="mr-1">Works with</span>
            {SITES.map((s) => (
              <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-white/5">
                {s}
              </span>
            ))}
          </div>
        </Card>

        {clipLink && (
          <div className="flex animate-fade-in flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-50 px-4 py-3 ring-1 ring-brand-200 dark:bg-brand-500/10 dark:ring-brand-500/30">
            <span className="inline-flex min-w-0 items-center gap-2 text-sm text-brand-900 dark:text-brand-100">
              <MousePointerClick className="size-4 shrink-0" />
              <span className="truncate">
                You copied a video link: <b>{hostOf(clipLink)}</b>
              </span>
            </span>
            <span className="flex gap-2">
              <Button size="sm" variant="primary" onClick={() => void load(clipLink)}>
                Get this video
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setClipLink(null)}>
                Dismiss
              </Button>
            </span>
          </div>
        )}

        {state.status === 'loading' && (
          <Card className="animate-fade-in">
            <div className="grid gap-5 md:grid-cols-[minmax(0,320px)_1fr]">
              <div className="aspect-video animate-pulse rounded-2xl bg-slate-200 dark:bg-white/10" />
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                  <LoaderCircle className="size-4 animate-spin" /> Getting video details from {hostOf(state.url)}…
                </div>
                <div className="h-5 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
                <div className="flex gap-2 pt-4">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-12 w-24 animate-pulse rounded-xl bg-slate-200 dark:bg-white/10" />
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        {state.status === 'error' && (
          <Card className="animate-fade-in">
            <div className="flex items-start gap-4" data-testid="info-error">
              <div className="rounded-2xl bg-rose-100 p-3 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                <TriangleAlert className="size-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-slate-900 dark:text-white">{state.error.message}</h2>
                {state.error.hint && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{state.error.hint}</p>}
                <p className="mt-1 truncate text-xs text-slate-400">{state.url}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="subtle" icon={<RotateCcw className="size-4" />} onClick={() => void load(state.url)}>
                    Try again
                  </Button>
                  {state.error.code === 'login_required' && (
                    <Button size="sm" onClick={() => setSettingsOpen(true)}>
                      Open Accounts
                    </Button>
                  )}
                </div>
                {state.error.details && (
                  <details className="mt-3 text-xs text-slate-400">
                    <summary className="cursor-pointer">Technical details</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-words">{state.error.details}</pre>
                  </details>
                )}
              </div>
            </div>
          </Card>
        )}

        {state.status === 'ready' && settings && (
          <div data-testid="media-card">
            {state.info.isPlaylist ? (
              <PlaylistCard key={state.info.key} info={state.info} settings={settings} onStart={startDownloads} onOpenUrl={(u) => void load(u)} />
            ) : (
              <MediaCard
                key={state.info.key}
                info={state.info}
                settings={settings}
                onStart={startDownloads}
                onSaveThumbnail={() => saveThumbnail(state.info.key)}
                onOpenUrl={(u) => void load(u)}
                onPreview={async () => {
                  const info = state.info;
                  const thumb = await api.getThumbnail(info.key);
                  openPreview({
                    videoUrl: undefined,
                    videoName: undefined,
                    thumbUrl: thumb?.dataUrl,
                    title: info.title,
                    channel: info.uploader ?? preview.channel,
                    views: info.viewCount ?? preview.views,
                    duration: info.duration,
                  });
                }}
              />
            )}
          </div>
        )}

        {state.status === 'idle' && jobs.length === 0 && (
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { n: 1, t: 'Copy a video link', d: 'From the address bar or the Share → Copy link button.' },
              { n: 2, t: 'Paste it above', d: 'Or just copy it — the app notices the link by itself.' },
              { n: 3, t: 'Pick quality → Download', d: 'MP4 up to 4K, MP3 audio, or the HD thumbnail.' },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200/70 dark:bg-white/[0.03] dark:ring-white/10">
                <span className="flex size-7 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{s.n}</span>
                <p className="mt-2 font-semibold">{s.t}</p>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{s.d}</p>
              </div>
            ))}
          </div>
        )}

        <div ref={downloadsRef} className="scroll-mt-20">
          <DownloadList
            jobs={jobs}
            onPreview={(job) =>
              openPreview({
                videoUrl: `vdmedia://job/${encodeURIComponent(job.id)}/0`,
                videoName: fileName(job.filePath),
                thumbUrl: job.request.thumbnail,
                title: job.request.title,
                duration: job.request.duration,
              })
            }
          />
        </div>
          </>
        )}
      </main>

      {settings && <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} engine={engine} appUpdate={appUpdate} />}
    </div>
  );
}

const noopSubscribe = () => () => {};

export default function App() {
  // null while pre-rendering, then true inside the desktop app.
  const inApp = useSyncExternalStore(noopSubscribe, () => Boolean(getApi()), () => null);
  if (inApp === null) return null;
  if (!inApp) return <NotInApp />;
  return (
    <ToastProvider>
      <Main />
    </ToastProvider>
  );
}
