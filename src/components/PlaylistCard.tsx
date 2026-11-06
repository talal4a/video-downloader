'use client';

import { Check, Download, Film, ListVideo, Music } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatDuration, qualityChoiceLabel } from '@shared/format';
import type { AudioBitrate, DownloadRequest, MediaInfo, MediaKind, QualityChoice, Settings } from '@shared/types';
import { cx } from '@/lib/api';
import { BITRATES, Thumbnail } from './MediaCard';
import { Button, Card, Chip, Segmented } from './ui';

const SHOW_MAX = 400;

export default function PlaylistCard({
  info,
  settings,
  onStart,
  onOpenUrl,
}: {
  info: MediaInfo;
  settings: Settings;
  onStart: (reqs: DownloadRequest[]) => Promise<boolean>;
  onOpenUrl: (url: string) => void;
}) {
  const entries = useMemo(() => info.entries ?? [], [info.entries]);
  const separate = info.playlistMode === 'separate';
  const [kind, setKind] = useState<MediaKind>(info.hasVideo ? settings.defaultKind : 'audio');
  const qualityOptions: QualityChoice[] = ['best', ...info.qualities.map((q) => q.value)];
  const [quality, setQuality] = useState<QualityChoice>(() => {
    if (settings.defaultQuality === 'best') return 'best';
    const fit = info.qualities.find((q) => q.value <= (settings.defaultQuality as number));
    return fit ? fit.value : 'best';
  });
  const [bitrate, setBitrate] = useState<AudioBitrate>(settings.audioBitrate);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(entries.map((e) => e.index)));
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);

  const count = separate ? selected.size : entries.length;

  async function start() {
    setBusy(true);
    const common = { kind, quality, audioBitrate: bitrate, site: info.site, subtitles: null };
    const reqs: DownloadRequest[] = separate
      ? entries
          .filter((e) => selected.has(e.index) && e.url)
          .map((e) => ({ ...common, url: e.url!, title: e.title, thumbnail: e.thumbnail, duration: e.duration, subfolder: info.title }))
      : [{ ...common, url: info.url, title: info.title, thumbnail: info.thumbnails[0], multi: true, subfolder: entries.length > 1 ? info.title : undefined }];
    const ok = await onStart(reqs);
    setBusy(false);
    if (ok) {
      setAdded(true);
      setTimeout(() => setAdded(false), 2500);
    }
  }

  const toggle = (i: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  return (
    <Card className="animate-fade-in">
      <div className="grid gap-5 md:grid-cols-[minmax(0,280px)_1fr]">
        <div>
          <Thumbnail infoKey={info.key} title={info.title} />
        </div>
        <div className="min-w-0 space-y-4">
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">{info.site}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                <ListVideo className="size-3.5" /> {separate ? 'Playlist' : 'Post with several videos'} · {info.playlistCount ?? entries.length}
              </span>
            </div>
            <h2 className="line-clamp-2 break-words text-lg font-semibold leading-snug text-slate-900 dark:text-white">{info.title}</h2>
            {info.uploader && <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">{info.uploader}</p>}
          </div>

          <Segmented<MediaKind>
            value={kind}
            onChange={setKind}
            options={[
              { value: 'video', label: (<><Film className="size-4" /> Video (MP4)</>), disabled: !info.hasVideo },
              { value: 'audio', label: (<><Music className="size-4" /> Audio (MP3)</>) },
            ]}
          />

          {kind === 'video' ? (
            <div role="radiogroup" className="flex flex-wrap gap-2 pt-1">
              {qualityOptions.map((q) => (
                <Chip
                  key={String(q)}
                  selected={quality === q}
                  onClick={() => setQuality(q)}
                  title={qualityChoiceLabel(q)}
                  subtitle={q === 'best' ? 'Highest available' : 'or lower if missing'}
                />
              ))}
            </div>
          ) : (
            <div role="radiogroup" className="flex flex-wrap gap-2 pt-1">
              {BITRATES.map((b) => (
                <Chip key={b.value} selected={bitrate === b.value} onClick={() => setBitrate(b.value)} title={b.label} subtitle={b.note} />
              ))}
            </div>
          )}

          {entries.length > 0 && (
            <div className="rounded-2xl ring-1 ring-slate-200 dark:ring-white/10">
              {separate && (
                <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-[13px] dark:border-white/10">
                  <span className="text-slate-500 dark:text-slate-400">
                    {selected.size} of {entries.length} selected
                  </span>
                  <span className="flex gap-3">
                    <button type="button" className="font-semibold text-brand-600 hover:underline dark:text-brand-300" onClick={() => setSelected(new Set(entries.map((e) => e.index)))}>
                      Select all
                    </button>
                    <button type="button" className="font-semibold text-slate-500 hover:underline" onClick={() => setSelected(new Set())}>
                      None
                    </button>
                  </span>
                </div>
              )}
              <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto dark:divide-white/5">
                {entries.slice(0, SHOW_MAX).map((e) => (
                  <li key={e.index}>
                    <label className={cx('flex items-center gap-3 px-3 py-2 text-sm', separate && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5')}>
                      {separate && (
                        <input
                          type="checkbox"
                          className="size-4 accent-brand-600"
                          checked={selected.has(e.index)}
                          onChange={() => toggle(e.index)}
                        />
                      )}
                      <span className="w-7 shrink-0 text-right text-xs tabular-nums text-slate-400">{e.index}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-200" title={e.title}>
                        {e.title}
                      </span>
                      {e.duration ? <span className="shrink-0 text-xs tabular-nums text-slate-400">{formatDuration(e.duration)}</span> : null}
                      {separate && e.url && (
                        <button type="button" onClick={(ev) => { ev.preventDefault(); onOpenUrl(e.url!); }} className="shrink-0 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300">
                          Open
                        </button>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
              {entries.length > SHOW_MAX && (
                <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-white/10">…and {entries.length - SHOW_MAX} more (included when selected).</p>
              )}
            </div>
          )}

          <Button
            variant="primary"
            size="lg"
            className="min-w-[260px]"
            disabled={count === 0}
            loading={busy}
            icon={added ? <Check className="size-5" /> : <Download className="size-5" />}
            onClick={start}
          >
            {added ? 'Added to downloads' : `Download ${count} ${count === 1 ? 'item' : 'items'} as ${kind === 'audio' ? 'MP3' : 'MP4'}`}
          </Button>
          {separate && <p className="text-xs text-slate-500 dark:text-slate-400">Files are saved in a folder named after the playlist.</p>}
        </div>
      </div>
    </Card>
  );
}
