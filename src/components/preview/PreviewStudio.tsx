'use client';

import { Camera, Film, ImageDown, ImagePlus, Moon, Pause, Play, RotateCcw, ScanLine, Sun, UserRound, Volume2, VolumeX, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react';
import { cx, getApi } from '@/lib/api';
import { EMPTY_PREVIEW, PLATFORM_NAMES, platformOf, VIEWS, type PreviewData, type PreviewPlatform, type PreviewView } from '@/lib/preview';
import { InstagramGrid, InstagramReels, TikTokFeed, TikTokGrid, YouTubeHome, YouTubeShorts } from './Platforms';
import { useToast } from '../Toasts';
import { Button, Card, Segmented, Toggle } from '../ui';

const TIPS: Record<PreviewView, string> = {
  'yt-home': 'Thumbnails show small (16:9). Use big, short text and a clear face. Hover the card to see the video play.',
  'yt-shorts': 'Shorts fill the phone screen. Keep faces and text inside the safe area (turn on Safe zones).',
  'ig-reels': 'Reels are cut to 9:16. The caption and buttons cover the bottom and right side.',
  'ig-grid': 'The profile grid crops your cover to 3:4 — keep the important part in the middle.',
  'tt-fyp': 'TikTok covers the right side and the bottom with buttons and text. Check the safe zones.',
  'tt-grid': 'The profile grid crops your cover to 3:4 and shows the view count at the bottom left.',
};

function revoke(url?: string) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-slate-500 dark:text-slate-400">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'h-9 w-full rounded-lg bg-white px-2.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-white/5 dark:ring-white/10';

function NumberField({ label, value, onChange, testId }: { label: string; value: number; onChange: (n: number) => void; testId?: string }) {
  return (
    <Field label={label}>
      <input
        type="number"
        min={0}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className={inputClass}
        data-testid={testId}
      />
    </Field>
  );
}

function FileButton({
  label,
  accept,
  icon,
  onFile,
  testId,
}: {
  label: string;
  accept: string;
  icon: ReactNode;
  onFile: (f: File) => void;
  testId?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button size="sm" icon={icon} onClick={() => ref.current?.click()}>
        {label}
      </Button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        data-testid={testId}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </>
  );
}

export default function PreviewStudio({
  data,
  setData,
  view,
  setView,
}: {
  data: PreviewData;
  setData: (fn: (d: PreviewData) => PreviewData) => void;
  view: PreviewView;
  setView: (v: PreviewView) => void;
}) {
  const toast = useToast();
  const [safe, setSafe] = useState(false);
  const [dark, setDark] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [saving, setSaving] = useState(false);
  const sourceRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const platform = platformOf(view);
  const shape = VIEWS[platform].find((v) => v.id === view)?.shape ?? 'phone';
  const set = (patch: Partial<PreviewData>) => setData((d) => ({ ...d, ...patch }));

  useEffect(() => {
    const v = sourceRef.current;
    if (v) v.muted = true;
  }, [data.videoUrl]);

  const setVideo = (f: File) => {
    if (!f.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name)) {
      toast({ tone: 'error', title: 'That is not a video file', body: 'Choose an MP4, MOV or WebM video.' });
      return;
    }
    setData((d) => {
      revoke(d.videoUrl);
      return { ...d, videoUrl: URL.createObjectURL(f), videoName: f.name, duration: undefined };
    });
  };
  const setImage = (key: 'thumbUrl' | 'avatarUrl') => (f: File) => {
    if (!f.type.startsWith('image/')) {
      toast({ tone: 'error', title: 'That is not a picture', body: 'Choose a JPG, PNG or WebP image.' });
      return;
    }
    setData((d) => {
      revoke(d[key]);
      return { ...d, [key]: URL.createObjectURL(f) };
    });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    for (const f of Array.from(e.dataTransfer.files)) {
      if (f.type.startsWith('video/')) setVideo(f);
      else if (f.type.startsWith('image/')) setImage('thumbUrl')(f);
    }
  };

  /** Use the frame shown in the small player as the thumbnail. */
  const useFrame = () => {
    const v = sourceRef.current;
    if (!v || !v.videoWidth) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      canvas.getContext('2d')!.drawImage(v, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          setData((d) => {
            revoke(d.thumbUrl);
            return { ...d, thumbUrl: URL.createObjectURL(blob) };
          });
          toast({ tone: 'success', title: 'Thumbnail set from the video' });
        },
        'image/jpeg',
        0.92,
      );
    } catch {
      toast({ tone: 'error', title: 'Could not take this frame', body: 'Choose a thumbnail picture instead.' });
    }
  };

  const savePicture = async () => {
    const el = previewRef.current;
    const api = getApi();
    if (!el || !api) return;
    setSaving(true);
    el.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 350));
    const r = el.getBoundingClientRect();
    const res = await api.capturePreview(
      { x: r.left, y: r.top, width: r.width, height: r.height },
      `${PLATFORM_NAMES[platform]} ${VIEWS[platform].find((v) => v.id === view)?.label ?? ''} - ${data.title}`,
    );
    setSaving(false);
    if (res.ok) toast({ tone: 'success', title: 'Preview saved as a picture', body: res.value.split(/[\\/]/).pop(), action: { label: 'Show in folder', onClick: () => void api.showInFolder(res.value) } });
    else toast({ tone: 'error', title: res.error.message, body: res.error.hint });
  };

  const reset = () =>
    setData((d) => {
      revoke(d.videoUrl);
      revoke(d.thumbUrl);
      revoke(d.avatarUrl);
      return { ...EMPTY_PREVIEW };
    });

  const onDuration = useCallback((s: number) => Number.isFinite(s) && setData((d) => ({ ...d, duration: s })), [setData]);
  const opts = useMemo(() => ({ playing, muted, onDuration }), [playing, muted, onDuration]);
  const isFeed = view === 'yt-shorts' || view === 'ig-reels' || view === 'tt-fyp';

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]" data-testid="preview-studio" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <Card className="space-y-4 self-start">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Your post</h2>
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={reset}>
            Reset
          </Button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Files stay on this computer. Drop a video or picture anywhere here.</p>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <FileButton label="Choose video" accept="video/*,.mkv,.mov" icon={<Film className="size-4" />} onFile={setVideo} testId="studio-video-input" />
            {data.videoUrl && (
              <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => setData((d) => (revoke(d.videoUrl), { ...d, videoUrl: undefined, videoName: undefined, duration: undefined }))}>
                Remove
              </Button>
            )}
          </div>
          {data.videoUrl && (
            <div className="space-y-2">
              <video ref={sourceRef} src={data.videoUrl} crossOrigin="anonymous" controls muted playsInline className="max-h-48 w-full rounded-xl bg-black" />
              <p className="truncate text-xs text-slate-500">{data.videoName ?? 'Video'}</p>
              <Button size="sm" variant="subtle" icon={<Camera className="size-4" />} onClick={useFrame} data-testid="studio-use-frame">
                Use this frame as thumbnail
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10">
            {data.thumbUrl ? <img src={data.thumbUrl} alt="Thumbnail" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center text-[11px] text-slate-400">No thumbnail</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <FileButton label="Thumbnail" accept="image/*" icon={<ImagePlus className="size-4" />} onFile={setImage('thumbUrl')} testId="studio-thumb-input" />
            {data.thumbUrl && (
              <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => setData((d) => (revoke(d.thumbUrl), { ...d, thumbUrl: undefined }))}>
                Remove
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="size-12 shrink-0 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10">
            {data.avatarUrl ? <img src={data.avatarUrl} alt="Profile" className="size-full object-cover" /> : <UserRound className="m-3 size-6 text-slate-400" />}
          </div>
          <FileButton label="Profile picture" accept="image/*" icon={<ImagePlus className="size-4" />} onFile={setImage('avatarUrl')} testId="studio-avatar-input" />
        </div>

        <Field label="Title (YouTube)">
          <input value={data.title} onChange={(e) => set({ title: e.target.value })} className={inputClass} maxLength={100} data-testid="studio-title" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Channel / display name">
            <input value={data.channel} onChange={(e) => set({ channel: e.target.value })} className={inputClass} maxLength={50} data-testid="studio-channel" />
          </Field>
          <Field label="@username">
            <input value={data.handle} onChange={(e) => set({ handle: e.target.value.replace(/^@+/, '').replace(/\s+/g, '') })} className={inputClass} maxLength={30} />
          </Field>
        </div>
        <Field label="Caption (Instagram / TikTok)">
          <textarea value={data.caption} onChange={(e) => set({ caption: e.target.value })} rows={3} maxLength={2200} className={cx(inputClass, 'h-auto py-2')} data-testid="studio-caption" />
        </Field>
        <Field label="Sound / music">
          <input value={data.sound} onChange={(e) => set({ sound: e.target.value })} className={inputClass} maxLength={80} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Views" value={data.views} onChange={(n) => set({ views: n })} testId="studio-views" />
          <NumberField label="Likes" value={data.likes} onChange={(n) => set({ likes: n })} />
          <NumberField label="Comments" value={data.comments} onChange={(n) => set({ comments: n })} />
          <NumberField label="Shares" value={data.shares} onChange={(n) => set({ shares: n })} />
        </div>
        <Field label="Posted">
          <select value={data.age} onChange={(e) => set({ age: e.target.value })} className={inputClass}>
            {['Just now', '1 hour ago', '5 hours ago', '1 day ago', '2 days ago', '1 week ago', '1 month ago', '1 year ago'].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Field>
        <Toggle checked={data.verified} onChange={(v) => set({ verified: v })} label="Verified badge" />
      </Card>

      <Card className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<PreviewPlatform>
            value={platform}
            onChange={(p) => setView(VIEWS[p][0].id)}
            options={(['youtube', 'instagram', 'tiktok'] as const).map((p) => ({ value: p, label: PLATFORM_NAMES[p] }))}
          />
          <Segmented<PreviewView> value={view} onChange={setView} options={VIEWS[platform].map((v) => ({ value: v.id, label: v.label }))} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isFeed && (
            <Button size="sm" variant={safe ? 'subtle' : 'secondary'} icon={<ScanLine className="size-4" />} onClick={() => setSafe((s) => !s)} data-testid="studio-safe-zones">
              Safe zones {safe ? 'on' : 'off'}
            </Button>
          )}
          {view === 'yt-home' && (
            <Button size="sm" icon={dark ? <Moon className="size-4" /> : <Sun className="size-4" />} onClick={() => setDark((d) => !d)}>
              {dark ? 'Dark' : 'Light'}
            </Button>
          )}
          {data.videoUrl && isFeed && (
            <>
              <Button size="sm" icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={() => setPlaying((p) => !p)}>
                {playing ? 'Pause' : 'Play'}
              </Button>
              <Button size="sm" icon={muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />} onClick={() => setMuted((m) => !m)}>
                {muted ? 'Sound off' : 'Sound on'}
              </Button>
            </>
          )}
          <Button size="sm" variant="primary" className="ml-auto" icon={<ImageDown className="size-4" />} loading={saving} onClick={savePicture} data-testid="studio-save-picture">
            Save as picture
          </Button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{TIPS[view]}</p>
        <div className={cx('flex justify-center rounded-2xl bg-slate-100 p-6 dark:bg-black/30', shape === 'wide' && 'p-4')}>
          <div ref={previewRef} className={cx(shape === 'wide' && 'w-full')} data-testid="studio-preview">
            {view === 'yt-home' && <YouTubeHome data={data} dark={dark} opts={opts} />}
            {view === 'yt-shorts' && <YouTubeShorts data={data} safe={safe} opts={opts} />}
            {view === 'ig-reels' && <InstagramReels data={data} safe={safe} opts={opts} />}
            {view === 'ig-grid' && <InstagramGrid data={data} />}
            {view === 'tt-fyp' && <TikTokFeed data={data} safe={safe} opts={opts} />}
            {view === 'tt-grid' && <TikTokGrid data={data} />}
          </div>
        </div>
        <p className="text-center text-[11px] text-slate-400">
          Look-alike preview for planning only. Real apps change their layout from time to time and are not affiliated with this app.
        </p>
      </Card>
    </div>
  );
}
