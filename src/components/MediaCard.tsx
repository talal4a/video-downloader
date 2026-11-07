'use client';

import { Captions, Check, Clock, Download, ExternalLink, Eye, Film, ImageDown, ListVideo, Music, Radio, Smartphone, User } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatBytes, formatCount, formatDuration } from '@shared/format';
import type { AudioBitrate, DownloadRequest, MediaInfo, MediaKind, QualityChoice, Settings, SubtitleMode } from '@shared/types';
import { cx, getApi } from '@/lib/api';
import { Button, Card, Chip, Segmented } from './ui';

export function Thumbnail({ infoKey, title, duration, className }: { infoKey: string; title: string; duration?: number; className?: string }) {
  // undefined = loading, null = no thumbnail. Tagged with the key so a new video starts as "loading".
  const [loaded, setLoaded] = useState<{ key: string; src: string | null; size: string }>({ key: '', src: null, size: '' });
  useEffect(() => {
    let alive = true;
    getApi()
      ?.getThumbnail(infoKey)
      .then((t) => alive && setLoaded({ key: infoKey, src: t?.dataUrl ?? null, size: '' }))
      .catch(() => alive && setLoaded({ key: infoKey, src: null, size: '' }));
    return () => {
      alive = false;
    };
  }, [infoKey]);
  const src = loaded.key === infoKey ? loaded.src : undefined;
  const size = loaded.key === infoKey ? loaded.size : '';
  const setSize = (s: string) => setLoaded((l) => ({ ...l, size: s }));
  return (
    <div className={cx('relative aspect-video overflow-hidden rounded-2xl bg-slate-100 dark:bg-white/5', className)}>
      {src === undefined && <div className="absolute inset-0 animate-pulse bg-slate-200 dark:bg-white/10" />}
      {src === null && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400">
          <Film className="size-10" />
        </div>
      )}
      {src && (
        <img
          src={src}
          alt={title}
          className="absolute inset-0 size-full object-cover"
          onLoad={(e) => setSize(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)}
        />
      )}
      {duration ? (
        <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-xs font-semibold text-white">{formatDuration(duration)}</span>
      ) : null}
      {size && (
        <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white" title="Thumbnail size">
          {size}
        </span>
      )}
    </div>
  );
}

export function defaultQualityFor(info: MediaInfo, settings: Settings): QualityChoice {
  if (!info.qualities.length) return 'best';
  if (settings.defaultQuality === 'best') return info.qualities[0].value;
  const fit = info.qualities.find((q) => q.value <= (settings.defaultQuality as number));
  return fit ? fit.value : info.qualities[info.qualities.length - 1].value;
}

const SUBTITLE_HELP: Record<SubtitleMode, string> = {
  embed: 'Turn captions on or off in your video player (fast).',
  burn: 'Always on screen, also when shared on WhatsApp (takes longer).',
  file: 'Saved as a .srt file next to the video.',
};

export const BITRATES: { value: AudioBitrate; label: string; note: string }[] = [
  { value: 320, label: '320 kbps', note: 'Best' },
  { value: 192, label: '192 kbps', note: 'Good' },
  { value: 128, label: '128 kbps', note: 'Small' },
];

export function audioSize(duration: number | undefined, kbps: number): number | undefined {
  return duration ? (duration * kbps * 1000) / 8 : undefined;
}

export default function MediaCard({
  info,
  settings,
  onStart,
  onSaveThumbnail,
  onOpenUrl,
  onPreview,
}: {
  info: MediaInfo;
  settings: Settings;
  onStart: (reqs: DownloadRequest[]) => Promise<boolean>;
  onSaveThumbnail: () => Promise<void>;
  onOpenUrl: (url: string) => void;
  onPreview?: () => void;
}) {
  const canVideo = info.hasVideo;
  const canAudio = info.hasAudio || info.hasVideo;
  const [kind, setKind] = useState<MediaKind>(!canVideo ? 'audio' : settings.defaultKind);
  const [quality, setQuality] = useState<QualityChoice>(() => defaultQualityFor(info, settings));
  const [bitrate, setBitrate] = useState<AudioBitrate>(settings.audioBitrate);
  const [subLang, setSubLang] = useState<string>('');
  const [subMode, setSubMode] = useState<SubtitleMode>(settings.subtitleMode ?? 'embed');
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [savingThumb, setSavingThumb] = useState(false);

  const selectedQuality = info.qualities.find((q) => q.value === quality);
  const estimate = useMemo(() => {
    if (kind === 'audio') return audioSize(info.duration, bitrate);
    return selectedQuality?.sizeBytes;
  }, [kind, bitrate, selectedQuality, info.duration]);

  const label =
    kind === 'audio'
      ? `Download MP3 · ${bitrate} kbps`
      : `Download MP4${selectedQuality ? ` · ${selectedQuality.label}` : ''}${subLang ? ' · CC' : ''}`;

  async function start() {
    setBusy(true);
    const sub = info.subtitles.find((s) => s.lang === subLang);
    const ok = await onStart([
      {
        url: info.url,
        title: info.title,
        thumbnail: info.thumbnails.find((t) => !/maxresdefault|hq720/.test(t)) ?? info.thumbnails[0],
        site: info.site,
        duration: info.duration,
        kind,
        quality,
        audioBitrate: bitrate,
        subtitles: kind === 'video' && sub ? { lang: sub.lang, auto: sub.auto, mode: subMode } : null,
      },
    ]);
    setBusy(false);
    if (ok) {
      setAdded(true);
      setTimeout(() => setAdded(false), 2500);
    }
  }

  return (
    <Card className="animate-fade-in">
      <div className="grid gap-5 md:grid-cols-[minmax(0,320px)_1fr]">
        <div className="space-y-3">
          <Thumbnail infoKey={info.key} title={info.title} duration={info.duration} />
          <Button
            className="w-full"
            icon={<ImageDown className="size-4" />}
            loading={savingThumb}
            onClick={async () => {
              setSavingThumb(true);
              await onSaveThumbnail();
              setSavingThumb(false);
            }}
          >
            Save thumbnail (HD)
          </Button>
          {onPreview && (
            <Button className="w-full" variant="ghost" icon={<Smartphone className="size-4" />} onClick={onPreview} data-testid="preview-from-card">
              Preview on YouTube / Instagram / TikTok
            </Button>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">{info.site}</span>
              {info.isLive && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                  <Radio className="size-3" /> LIVE
                </span>
              )}
            </div>
            <h2 className="line-clamp-2 break-words text-lg font-semibold leading-snug text-slate-900 dark:text-white" title={info.title}>
              {info.title}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-500 dark:text-slate-400">
              {info.uploader && (
                <span className="inline-flex items-center gap-1">
                  <User className="size-3.5" /> {info.uploader}
                </span>
              )}
              {info.duration ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" /> {formatDuration(info.duration)}
                </span>
              ) : null}
              {info.viewCount ? (
                <span className="inline-flex items-center gap-1">
                  <Eye className="size-3.5" /> {formatCount(info.viewCount)} views
                </span>
              ) : null}
              <button type="button" onClick={() => getApi()?.openExternal(info.url)} className="inline-flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-300">
                <ExternalLink className="size-3.5" /> Open page
              </button>
            </div>
          </div>

          {info.parentPlaylistUrl && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[13px] text-slate-600 ring-1 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10">
              <span className="inline-flex items-center gap-2">
                <ListVideo className="size-4 text-brand-500" /> This video is part of a playlist.
              </span>
              <button type="button" onClick={() => onOpenUrl(info.parentPlaylistUrl!)} className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
                Show whole playlist →
              </button>
            </div>
          )}

          {info.isLive ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30">
              This is a live stream (or it has not started yet). You can download it after the stream has ended.
            </p>
          ) : (
            <>
              <Segmented<MediaKind>
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'video', label: (<><Film className="size-4" /> Video (MP4)</>), disabled: !canVideo, title: canVideo ? undefined : 'This link has no video' },
                  { value: 'audio', label: (<><Music className="size-4" /> Audio (MP3)</>), disabled: !canAudio },
                ]}
              />

              {kind === 'video' ? (
                <div>
                  <p className="mb-2 text-[13px] font-medium text-slate-500 dark:text-slate-400">Quality</p>
                  {info.qualities.length ? (
                    <div role="radiogroup" className="flex flex-wrap gap-2 pt-1">
                      {info.qualities.map((q, i) => (
                        <Chip
                          key={q.value}
                          selected={quality === q.value}
                          onClick={() => setQuality(q.value)}
                          title={q.label}
                          subtitle={[q.note && q.note !== q.label ? q.note : null, q.sizeBytes ? `~${formatBytes(q.sizeBytes)}` : null].filter(Boolean).join(' · ') || ' '}
                          badge={i === 0 && q.value >= 1080 ? 'Best' : undefined}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Best available quality will be downloaded.</p>
                  )}
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-[13px] font-medium text-slate-500 dark:text-slate-400">MP3 quality</p>
                  <div role="radiogroup" className="flex flex-wrap gap-2 pt-1">
                    {BITRATES.map((b) => (
                      <Chip
                        key={b.value}
                        selected={bitrate === b.value}
                        onClick={() => setBitrate(b.value)}
                        title={b.label}
                        subtitle={[b.note, audioSize(info.duration, b.value) ? `~${formatBytes(audioSize(info.duration, b.value))}` : null].filter(Boolean).join(' · ')}
                      />
                    ))}
                  </div>
                </div>
              )}

              {kind === 'video' &&
                (info.subtitles.length > 0 ? (
                  <div className="space-y-2" data-testid="captions">
                    <label className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <Captions className="size-4 text-slate-400" />
                      Captions:
                      <select
                        value={subLang}
                        onChange={(e) => setSubLang(e.target.value)}
                        aria-label="Captions language"
                        className="h-9 rounded-lg bg-white px-2 text-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-white/10"
                      >
                        <option value="">None</option>
                        {info.subtitles.map((s) => (
                          <option key={s.lang} value={s.lang}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {subLang && (
                      <div className="flex flex-wrap items-center gap-3">
                        <Segmented<SubtitleMode>
                          value={subMode}
                          onChange={(m) => {
                            setSubMode(m);
                            void getApi()?.updateSettings({ subtitleMode: m });
                          }}
                          options={[
                            { value: 'embed', label: 'In the video', title: 'A captions track inside the video. Turn it on or off in the player.' },
                            { value: 'burn', label: 'Always visible', title: 'Drawn onto the picture so it shows everywhere. Takes longer.' },
                            { value: 'file', label: 'Separate .srt file', title: 'A captions file saved next to the video.' },
                          ]}
                        />
                        <span className="text-xs text-slate-500 dark:text-slate-400">{SUBTITLE_HELP[subMode]}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                    <Captions className="size-3.5" /> No captions available for this video.
                  </p>
                ))}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  variant="primary"
                  size="lg"
                  className="min-w-[260px] flex-1 sm:flex-none"
                  loading={busy}
                  icon={added ? <Check className="size-5" /> : <Download className="size-5" />}
                  onClick={start}
                  data-testid="download-button"
                >
                  {added ? 'Added to downloads' : label}
                </Button>
                {estimate ? <span className="text-sm text-slate-500 dark:text-slate-400">About {formatBytes(estimate)}</span> : null}
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
