'use client';

import { Ban, CircleAlert, CircleCheck, Film, FolderOpen, Music, Play, RotateCcw, Trash2, TriangleAlert, X, Zap } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { formatBytes, formatEta, formatSpeed, qualityChoiceLabel } from '@shared/format';
import type { Job } from '@shared/types';
import { cx, fileName, getApi } from '@/lib/api';
import { useToast } from './Toasts';
import { Button, Card, IconButton, ProgressBar, SectionTitle } from './ui';

function isActive(j: Job) {
  return j.status === 'queued' || j.status === 'starting' || j.status === 'downloading' || j.status === 'processing';
}

function JobThumb({ job }: { job: Job }) {
  const [failed, setFailed] = useState(false);
  const Icon = job.request.kind === 'audio' ? Music : Film;
  return (
    <div className="relative hidden aspect-video w-28 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:block dark:bg-white/5">
      {job.request.thumbnail && !failed ? (
        <img src={job.request.thumbnail} alt="" referrerPolicy="no-referrer" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <div className="flex size-full items-center justify-center text-slate-400">
          <Icon className="size-6" />
        </div>
      )}
    </div>
  );
}

function JobRow({ job }: { job: Job }) {
  const api = getApi();
  const toast = useToast();
  const [showDetails, setShowDetails] = useState(false);
  const active = isActive(job);
  const r = job.request;
  const captions = r.subtitles?.lang
    ? ` · Captions ${r.subtitles.mode === 'burn' ? '(always visible)' : r.subtitles.mode === 'file' ? '(.srt)' : '(in video)'}`
    : '';
  const format = r.kind === 'audio' ? `MP3 · ${r.audioBitrate} kbps` : `MP4 · ${qualityChoiceLabel(r.quality)}${captions}`;
  const pct = Math.round(job.progress * 100);

  const open = async () => {
    if (!job.filePath || !api) return;
    const res = await api.openFile(job.filePath);
    if (!res.ok) toast({ tone: 'error', title: res.error.message, body: res.error.hint });
  };

  let statusLine: ReactNode = null;
  if (job.status === 'queued') statusLine = <span className="text-slate-500">Waiting in line…</span>;
  else if (job.status === 'starting') statusLine = <span className="text-slate-500">{job.stage ?? 'Starting…'}</span>;
  else if (job.status === 'downloading') {
    statusLine = (
      <span className="flex flex-wrap gap-x-3 text-slate-600 dark:text-slate-300">
        {pct > 0 || job.downloadedBytes ? (
          <span className="font-semibold text-slate-900 dark:text-white">{pct}%</span>
        ) : (
          <span>Connecting…</span>
        )}
        <span>{job.stage}</span>
        {job.totalBytes ? (
          <span className="tabular-nums">
            {formatBytes(job.downloadedBytes)} of {formatBytes(job.totalBytes)}
          </span>
        ) : null}
        {job.speed ? <span className="tabular-nums">{formatSpeed(job.speed)}</span> : null}
        {job.eta != null ? <span className="tabular-nums">{formatEta(job.eta)}</span> : null}
      </span>
    );
  } else if (job.status === 'processing') statusLine = <span className="text-slate-600 dark:text-slate-300">{job.stage ?? 'Finishing…'}</span>;
  else if (job.status === 'done') {
    statusLine = (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
        <CircleCheck className="size-4 shrink-0" />
        <span className="truncate" title={job.filePath}>
          Saved{job.files && job.files.length > 1 ? ` ${job.files.length} files` : ''} — {fileName(job.filePath)}
        </span>
      </span>
    );
  } else if (job.status === 'canceled') {
    statusLine = (
      <span className="inline-flex items-center gap-1.5 text-slate-500">
        <Ban className="size-4" /> Canceled
      </span>
    );
  } else if (job.status === 'error') {
    statusLine = (
      <span className="inline-flex min-w-0 items-start gap-1.5 text-rose-600 dark:text-rose-400">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        <span>
          {job.error?.message ?? 'Download failed.'} {job.error?.hint && <span className="text-slate-500 dark:text-slate-400">{job.error.hint}</span>}
        </span>
      </span>
    );
  }

  return (
    <li className="flex animate-fade-in gap-4 px-4 py-3.5" data-testid="job" data-status={job.status}>
      <JobThumb job={job} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white" title={r.title}>
              {r.title}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{format}</span>
              {r.site && <span>· {r.site}</span>}
              {job.turbo && active && (
                <span className="inline-flex items-center gap-0.5 font-semibold text-amber-600 dark:text-amber-400" title="Multi-connection download">
                  <Zap className="size-3" /> Turbo
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {job.status === 'done' && (
              <>
                <Button size="sm" variant="subtle" icon={<Play className="size-3.5" />} onClick={open}>
                  Play
                </Button>
                <IconButton label="Show in folder" onClick={() => job.filePath && api?.showInFolder(job.filePath)}>
                  <FolderOpen className="size-4" />
                </IconButton>
              </>
            )}
            {(job.status === 'error' || job.status === 'canceled') && (
              <Button size="sm" variant="subtle" icon={<RotateCcw className="size-3.5" />} onClick={() => api?.retryDownload(job.id)}>
                Retry
              </Button>
            )}
            {active ? (
              <IconButton label="Cancel download" onClick={() => api?.cancelDownload(job.id)}>
                <X className="size-4" />
              </IconButton>
            ) : (
              <IconButton label="Remove from list (the file is kept)" onClick={() => api?.removeDownload(job.id)}>
                <Trash2 className="size-4" />
              </IconButton>
            )}
          </div>
        </div>

        {active && <ProgressBar value={job.progress} indeterminate={job.status !== 'downloading' || job.progress === 0} tone={job.status === 'processing' ? 'green' : 'brand'} />}
        <div className="text-[13px]">{statusLine}</div>
        {job.warnings?.map((w) => (
          <p key={w} className="inline-flex items-center gap-1.5 text-[13px] text-amber-600 dark:text-amber-400">
            <TriangleAlert className="size-3.5" /> {w}
          </p>
        ))}
        {job.status === 'error' && job.error?.details && (
          <div>
            <button type="button" className="text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" onClick={() => setShowDetails((v) => !v)}>
              {showDetails ? 'Hide technical details' : 'Show technical details'}
            </button>
            {showDetails && (
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-100 p-2 text-[11px] text-slate-600 dark:bg-black/30 dark:text-slate-300">
                {job.error.details}
              </pre>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export default function DownloadList({ jobs }: { jobs: Job[] }) {
  const api = getApi();
  const active = jobs.filter(isActive).length;
  const finished = jobs.length - active;
  return (
    <Card className="p-0">
      <div className="px-5 pt-4">
        <SectionTitle
          right={
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" icon={<FolderOpen className="size-4" />} onClick={() => api?.openDownloadsFolder()}>
                Open folder
              </Button>
              {finished > 0 && (
                <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => api?.clearFinished()}>
                  Clear finished
                </Button>
              )}
            </div>
          }
        >
          Downloads{' '}
          {active > 0 && (
            <span className="ml-1 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">{active} active</span>
          )}
        </SectionTitle>
      </div>
      {jobs.length === 0 ? (
        <div className="px-5 pb-8 pt-2 text-center text-sm text-slate-500 dark:text-slate-400">Your downloads will appear here.</div>
      ) : (
        <ul className={cx('divide-y divide-slate-100 pb-2 dark:divide-white/5')}>
          {jobs.map((j) => (
            <JobRow key={j.id} job={j} />
          ))}
        </ul>
      )}
    </Card>
  );
}
