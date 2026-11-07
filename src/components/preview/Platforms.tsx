'use client';

// Look-alike screens of YouTube, Instagram and TikTok, so a creator can see how a video
// and its thumbnail will look before posting. Approximations only — no official logos.
import {
  Bookmark,
  Camera,
  ChevronDown,
  Clapperboard,
  Ellipsis,
  EllipsisVertical,
  Grid3x3,
  Heart,
  House,
  Inbox,
  Lock,
  Menu,
  MessageCircle,
  Mic,
  Music2,
  Bell,
  Play,
  Plus,
  Repeat2,
  Search,
  Send,
  Share2,
  SquarePlay,
  SquarePlus,
  ThumbsDown,
  ThumbsUp,
  Tv,
  User,
  Users,
  BadgeCheck,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatDuration } from '@shared/format';
import { cx } from '@/lib/api';
import { captionParts, compact, gradient, initials, SAFE_ZONES, SAMPLE_POSTS, type PreviewData } from '@/lib/preview';

// ---------------------------------------------------------------- building blocks

export interface MediaOptions {
  playing: boolean;
  muted: boolean;
  onDuration?: (seconds: number) => void;
}

/** The video (when there is one and `motion` is on), otherwise the thumbnail, otherwise a placeholder. */
function Media({ data, motion, opts, className }: { data: PreviewData; motion: boolean; opts?: MediaOptions; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || !opts) return;
    v.muted = opts.muted;
    if (opts.playing) void v.play().catch(() => {});
    else v.pause();
  }, [opts, opts?.playing, opts?.muted, data.videoUrl]);

  if (motion && data.videoUrl) {
    return (
      <video
        ref={ref}
        key={data.videoUrl}
        src={data.videoUrl}
        poster={data.thumbUrl}
        crossOrigin="anonymous"
        className={cx('size-full object-cover', className)}
        autoPlay={opts?.playing ?? false}
        muted
        loop
        playsInline
        data-testid="preview-video"
        onLoadedMetadata={(e) => opts?.onDuration?.(e.currentTarget.duration)}
      />
    );
  }
  if (data.thumbUrl) return <img src={data.thumbUrl} alt="" className={cx('size-full object-cover', className)} draggable={false} />;
  if (data.videoUrl) {
    // A paused video shows its first frame, so it works as a thumbnail too.
    return <video src={`${data.videoUrl}#t=0.5`} crossOrigin="anonymous" className={cx('size-full object-cover', className)} muted preload="metadata" playsInline />;
  }
  return (
    <div className={cx('flex size-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-700 to-slate-900 p-4 text-center text-xs text-white/70', className)}>
      <Play className="size-8" />
      Add a video or thumbnail
    </div>
  );
}

function Avatar({ data, size = 36, ring }: { data: PreviewData; size?: number; ring?: string }) {
  const style = { width: size, height: size };
  const inner = data.avatarUrl ? (
    <img src={data.avatarUrl} alt="" className="size-full rounded-full object-cover" draggable={false} />
  ) : (
    <div className="flex size-full items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-fuchsia-500 font-bold text-white" style={{ fontSize: size * 0.38 }}>
      {initials(data.channel)}
    </div>
  );
  if (!ring) return <div className="shrink-0" style={style}>{inner}</div>;
  return (
    <div className="shrink-0 rounded-full p-[2.5px]" style={{ ...style, background: ring }}>
      <div className="size-full rounded-full bg-white p-[2px] dark:bg-black">{inner}</div>
    </div>
  );
}

function Caption({ text, clamp = 2, className }: { text: string; clamp?: number; className?: string }) {
  return (
    <p className={cx('break-words', clamp === 1 ? 'line-clamp-1' : clamp === 2 ? 'line-clamp-2' : 'line-clamp-3', className)}>
      {captionParts(text).map((p, i) => (p.tag ? <b key={i}>{p.text}</b> : <span key={i}>{p.text}</span>))}
    </p>
  );
}

/** A phone with a 9:19.5 screen, status bar and rounded corners. */
export function PhoneFrame({ children, light, testId }: { children: ReactNode; light?: boolean; testId?: string }) {
  return (
    <div className="rounded-[46px] bg-neutral-900 p-[10px] shadow-2xl ring-1 ring-black/40" style={{ width: 320 }} data-testid={testId}>
      <div className={cx('relative overflow-hidden rounded-[37px]', light ? 'bg-white text-neutral-900' : 'bg-black text-white')} style={{ height: 650 }}>
        <div className={cx('pointer-events-none absolute inset-x-0 top-0 z-30 flex h-9 items-center justify-between px-7 text-[12px] font-semibold', light ? 'text-neutral-900' : 'text-white')}>
          <span>9:41</span>
          <span className="absolute left-1/2 top-2 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-black" />
          <span className="flex items-center gap-1">
            <span className="tracking-tighter">●●●</span>
            <span className="inline-block h-[10px] w-5 rounded-[3px] border border-current p-px">
              <span className="block h-full w-3/4 rounded-[1px] bg-current" />
            </span>
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Red = covered by buttons/text; dashed green = safe area for faces and text. */
function SafeZones({ zone }: { zone: { top: number; bottom: number; right: number } }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-40" data-testid="safe-zones">
      <div className="absolute inset-x-0 top-0 bg-rose-500/35" style={{ height: `${zone.top}%` }} />
      <div className="absolute inset-x-0 bottom-0 flex items-start justify-center bg-rose-500/35 pt-1 text-[10px] font-bold uppercase tracking-wide text-white" style={{ height: `${zone.bottom}%` }}>
        Covered by text & buttons
      </div>
      <div className="absolute right-0 bg-rose-500/35" style={{ top: `${zone.top}%`, bottom: `${zone.bottom}%`, width: `${zone.right}%` }} />
      <div
        className="absolute flex items-start justify-start border-2 border-dashed border-emerald-400 p-1 text-[10px] font-bold uppercase text-emerald-300"
        style={{ top: `${zone.top}%`, bottom: `${zone.bottom}%`, left: '3%', right: `${zone.right}%` }}
      >
        Safe area
      </div>
    </div>
  );
}

function SideButton({ icon, label }: { icon: ReactNode; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 drop-shadow">
      {icon}
      {label !== undefined && <span className="text-[11px] font-semibold">{label}</span>}
    </div>
  );
}

function NavBar({ items, dark = true }: { items: { icon: ReactNode; label?: string; active?: boolean }[]; dark?: boolean }) {
  return (
    <div className={cx('absolute inset-x-0 bottom-0 z-20 flex h-[58px] items-start justify-around pt-2', dark ? 'bg-black text-white' : 'border-t border-neutral-200 bg-white text-neutral-900')}>
      {items.map((it, i) => (
        <div key={i} className={cx('flex flex-col items-center gap-0.5 text-[9px]', !it.active && 'opacity-80')}>
          {it.icon}
          {it.label && <span className={cx(it.active && 'font-bold')}>{it.label}</span>}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- YouTube

function YtCard({
  title,
  channel,
  meta,
  duration,
  thumb,
  avatar,
  verified,
  dark,
  mine,
}: {
  title: string;
  channel: string;
  meta: string;
  duration?: number;
  thumb: ReactNode;
  avatar: ReactNode;
  verified?: boolean;
  dark: boolean;
  mine?: boolean;
}) {
  return (
    <div className="min-w-0" data-testid={mine ? 'yt-my-card' : undefined}>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-neutral-800">
        {thumb}
        {duration ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1 py-px text-[11px] font-semibold text-white">{formatDuration(duration)}</span>
        ) : null}
      </div>
      <div className="mt-2.5 flex gap-2.5">
        {avatar}
        <div className="min-w-0">
          <p className={cx('line-clamp-2 text-[14px] font-semibold leading-[1.3]', dark ? 'text-white' : 'text-[#0f0f0f]')}>{title || 'Untitled'}</p>
          <p className={cx('mt-1 flex items-center gap-1 text-[12px]', dark ? 'text-[#aaa]' : 'text-[#606060]')}>
            {channel}
            {verified && <BadgeCheck className="size-3" />}
          </p>
          <p className={cx('text-[12px]', dark ? 'text-[#aaa]' : 'text-[#606060]')}>{meta}</p>
        </div>
        <EllipsisVertical className={cx('ml-auto size-4 shrink-0', dark ? 'text-white' : 'text-neutral-800')} />
      </div>
    </div>
  );
}

export function YouTubeHome({ data, dark, opts }: { data: PreviewData; dark: boolean; opts: MediaOptions }) {
  const [hover, setHover] = useState(false);
  const chips = ['All', 'Music', 'Gaming', 'Live', 'Podcasts', 'News', 'Recently uploaded'];
  return (
    <div className={cx('w-full max-w-[940px] overflow-hidden rounded-2xl shadow-xl ring-1', dark ? 'bg-[#0f0f0f] ring-white/10' : 'bg-white ring-black/10')} data-testid="preview-yt-home">
      <div className={cx('flex items-center gap-4 px-4 py-2.5', dark ? 'text-white' : 'text-neutral-900')}>
        <Menu className="size-5" />
        <span className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight">
          <Tv className="size-5" /> Home
        </span>
        <div className={cx('mx-auto flex h-9 w-full max-w-[440px] items-center rounded-full border pl-4', dark ? 'border-white/15 bg-[#121212]' : 'border-neutral-300 bg-white')}>
          <span className={cx('flex-1 text-[13px]', dark ? 'text-[#888]' : 'text-[#888]')}>Search</span>
          <span className={cx('flex h-full w-14 items-center justify-center rounded-r-full', dark ? 'bg-white/10' : 'bg-neutral-100')}>
            <Search className="size-4" />
          </span>
        </div>
        <Mic className="size-5" />
        <Bell className="size-5" />
        <Avatar data={data} size={28} />
      </div>
      <div className="flex gap-2 overflow-hidden px-4 pb-3">
        {chips.map((c, i) => (
          <span
            key={c}
            className={cx(
              'whitespace-nowrap rounded-lg px-3 py-1 text-[13px] font-medium',
              i === 0 ? (dark ? 'bg-white text-black' : 'bg-[#0f0f0f] text-white') : dark ? 'bg-white/10 text-white' : 'bg-black/5 text-[#0f0f0f]',
            )}
          >
            {c}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-x-4 gap-y-6 px-4 pb-6">
        <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
          <YtCard
            mine
            dark={dark}
            title={data.title}
            channel={data.channel}
            verified={data.verified}
            meta={`${compact(data.views)} views • ${data.age}`}
            duration={data.duration}
            thumb={<Media data={data} motion={hover} opts={{ ...opts, playing: hover }} />}
            avatar={<Avatar data={data} size={36} />}
          />
        </div>
        {SAMPLE_POSTS.slice(0, 5).map((p) => (
          <YtCard
            key={p.title}
            dark={dark}
            title={p.title}
            channel={p.channel}
            meta={`${compact(p.views)} views • ${p.age}`}
            duration={p.duration}
            thumb={<div className="size-full" style={{ background: gradient(p.colors) }} />}
            avatar={<div className="size-9 shrink-0 rounded-full" style={{ background: gradient(p.colors) }} />}
          />
        ))}
      </div>
    </div>
  );
}

export function YouTubeShorts({ data, safe, opts }: { data: PreviewData; safe: boolean; opts: MediaOptions }) {
  return (
    <PhoneFrame testId="preview-yt-shorts">
      <div className="absolute inset-x-0 top-0 bottom-[58px]">
        <Media data={data} motion opts={opts} />
      </div>
      <div className="absolute inset-x-0 top-0 bottom-[58px] bg-gradient-to-b from-black/30 via-transparent to-black/60" />
      <div className="absolute right-4 top-11 z-10 flex gap-4">
        <Search className="size-5" />
        <EllipsisVertical className="size-5" />
      </div>
      <div className="absolute bottom-[78px] right-2.5 z-10 flex flex-col items-center gap-4">
        <SideButton icon={<ThumbsUp className="size-7 fill-white/10" />} label={compact(data.likes)} />
        <SideButton icon={<ThumbsDown className="size-7" />} label="Dislike" />
        <SideButton icon={<MessageCircle className="size-7" />} label={compact(data.comments)} />
        <SideButton icon={<Share2 className="size-7" />} label="Share" />
        <SideButton icon={<Repeat2 className="size-7" />} label="Remix" />
        <div className="size-8 overflow-hidden rounded-md ring-2 ring-white">
          <Media data={data} motion={false} />
        </div>
      </div>
      <div className="absolute bottom-[70px] left-3 right-[64px] z-10 space-y-2">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <Avatar data={data} size={28} />
          <span className="truncate">@{data.handle}</span>
          <span className="rounded-full bg-white px-3 py-1 text-[12px] font-bold text-black">Subscribe</span>
        </div>
        <Caption text={data.title} clamp={2} className="text-[13px] leading-snug" />
        <p className="flex items-center gap-1.5 text-[12px]">
          <Music2 className="size-3.5 shrink-0" />
          <span className="truncate">{data.sound}</span>
        </p>
      </div>
      <div className="absolute inset-x-0 bottom-[58px] z-10 h-[2px] bg-white/30">
        <div className="h-full w-1/3 bg-red-600" />
      </div>
      <NavBar
        items={[
          { icon: <House className="size-5" />, label: 'Home' },
          { icon: <Clapperboard className="size-5" />, label: 'Shorts', active: true },
          { icon: <Plus className="size-8 rounded-full border border-white/40 p-1" /> },
          { icon: <SquarePlay className="size-5" />, label: 'Subscriptions' },
          { icon: <User className="size-5" />, label: 'You' },
        ]}
      />
      {safe && <SafeZones zone={SAFE_ZONES['yt-shorts']} />}
    </PhoneFrame>
  );
}

// ---------------------------------------------------------------- Instagram

export function InstagramReels({ data, safe, opts }: { data: PreviewData; safe: boolean; opts: MediaOptions }) {
  return (
    <PhoneFrame testId="preview-ig-reels">
      <div className="absolute inset-x-0 top-0 bottom-[58px]">
        <Media data={data} motion opts={opts} />
      </div>
      <div className="absolute inset-x-0 top-0 bottom-[58px] bg-gradient-to-b from-black/30 via-transparent to-black/60" />
      <div className="absolute inset-x-4 top-11 z-10 flex items-center justify-between">
        <span className="flex items-center gap-1 text-[20px] font-bold">
          Reels <ChevronDown className="size-4" />
        </span>
        <Camera className="size-6" />
      </div>
      <div className="absolute bottom-[78px] right-3 z-10 flex flex-col items-center gap-[18px]">
        <SideButton icon={<Heart className="size-7" />} label={compact(data.likes)} />
        <SideButton icon={<MessageCircle className="size-7 -scale-x-100" />} label={compact(data.comments)} />
        <SideButton icon={<Send className="size-7" />} label={compact(data.shares)} />
        <SideButton icon={<Ellipsis className="size-6" />} />
        <div className="size-7 overflow-hidden rounded-md ring-2 ring-white">
          <Avatar data={data} size={28} />
        </div>
      </div>
      <div className="absolute bottom-[72px] left-3 right-[60px] z-10 space-y-2">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <Avatar data={data} size={30} />
          <span className="truncate">{data.handle}</span>
          {data.verified && <BadgeCheck className="size-3.5 shrink-0 fill-sky-500 text-white" />}
          <span className="rounded-lg border border-white/80 px-2.5 py-0.5 text-[12px]">Follow</span>
        </div>
        <Caption text={data.caption} clamp={1} className="text-[13px]" />
        <p className="flex items-center gap-1.5 text-[12px]">
          <Music2 className="size-3.5 shrink-0" />
          <span className="truncate">{data.sound}</span>
        </p>
      </div>
      <NavBar
        items={[
          { icon: <House className="size-6" /> },
          { icon: <Search className="size-6" /> },
          { icon: <SquarePlus className="size-6" /> },
          { icon: <Clapperboard className="size-6" />, active: true },
          { icon: <Avatar data={data} size={24} /> },
        ]}
      />
      {safe && <SafeZones zone={SAFE_ZONES['ig-reels']} />}
    </PhoneFrame>
  );
}

function GridTile({ children, badge, views }: { children: ReactNode; badge?: ReactNode; views?: string }) {
  return (
    <div className="relative aspect-[3/4] overflow-hidden bg-neutral-200">
      {children}
      {badge && <span className="absolute right-1.5 top-1.5 text-white drop-shadow">{badge}</span>}
      {views && (
        <span className="absolute bottom-1 left-1.5 flex items-center gap-0.5 text-[11px] font-semibold text-white drop-shadow">
          <Play className="size-3 fill-white" /> {views}
        </span>
      )}
    </div>
  );
}

export function InstagramGrid({ data }: { data: PreviewData }) {
  return (
    <PhoneFrame light testId="preview-ig-grid">
      <div className="absolute inset-0 overflow-hidden pt-10">
        <div className="flex items-center justify-between px-4 pb-2">
          <span className="flex items-center gap-1 text-[18px] font-bold">
            {data.handle} <ChevronDown className="size-4" />
          </span>
          <span className="flex gap-4">
            <SquarePlus className="size-6" />
            <Menu className="size-6" />
          </span>
        </div>
        <div className="flex items-center gap-5 px-4">
          <Avatar data={data} size={78} ring="linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)" />
          <div className="grid flex-1 grid-cols-3 gap-2 text-center text-[12px] leading-tight">
            <span><b className="block text-[16px]">128</b>posts</span>
            <span><b className="block text-[16px]">{compact(Math.round(data.views / 5))}</b>followers</span>
            <span><b className="block text-[16px]">312</b>following</span>
          </div>
        </div>
        <div className="px-4 pt-2 text-[13px]">
          <p className="font-semibold">{data.channel}</p>
          <Caption text={data.caption} clamp={2} className="text-neutral-700" />
        </div>
        <div className="flex gap-1.5 px-4 py-3">
          <span className="flex-1 rounded-lg bg-neutral-200/80 py-1.5 text-center text-[13px] font-semibold">Edit profile</span>
          <span className="flex-1 rounded-lg bg-neutral-200/80 py-1.5 text-center text-[13px] font-semibold">Share profile</span>
        </div>
        <div className="flex border-b border-neutral-200 text-neutral-400">
          <span className="flex flex-1 justify-center border-b-2 border-neutral-900 py-2 text-neutral-900"><Grid3x3 className="size-5" /></span>
          <span className="flex flex-1 justify-center py-2"><Clapperboard className="size-5" /></span>
          <span className="flex flex-1 justify-center py-2"><User className="size-5" /></span>
        </div>
        <div className="grid grid-cols-3 gap-[2px]" data-testid="ig-grid">
          <GridTile badge={<Clapperboard className="size-4" />} views={compact(data.views)}>
            <Media data={data} motion={false} />
          </GridTile>
          {SAMPLE_POSTS.slice(0, 8).map((p) => (
            <GridTile key={p.title}>
              <div className="size-full" style={{ background: gradient(p.colors) }} />
            </GridTile>
          ))}
        </div>
      </div>
      <NavBar
        dark={false}
        items={[
          { icon: <House className="size-6" /> },
          { icon: <Search className="size-6" /> },
          { icon: <SquarePlus className="size-6" /> },
          { icon: <Clapperboard className="size-6" /> },
          { icon: <Avatar data={data} size={24} />, active: true },
        ]}
      />
    </PhoneFrame>
  );
}

// ---------------------------------------------------------------- TikTok

export function TikTokFeed({ data, safe, opts }: { data: PreviewData; safe: boolean; opts: MediaOptions }) {
  return (
    <PhoneFrame testId="preview-tt-fyp">
      <div className="absolute inset-x-0 top-0 bottom-[58px]">
        <Media data={data} motion opts={opts} />
      </div>
      <div className="absolute inset-x-0 top-0 bottom-[58px] bg-gradient-to-b from-black/25 via-transparent to-black/55" />
      <div className="absolute inset-x-4 top-11 z-10 flex items-center justify-between text-[15px]">
        <Tv className="size-5" />
        <span className="flex gap-4">
          <span className="text-white/70">Following</span>
          <span className="relative font-bold">
            For You
            <span className="absolute -bottom-1.5 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-white" />
          </span>
        </span>
        <Search className="size-5" />
      </div>
      <div className="absolute bottom-[74px] right-2 z-10 flex flex-col items-center gap-4">
        <div className="relative mb-2">
          <Avatar data={data} size={46} />
          <span className="absolute -bottom-2 left-1/2 flex size-5 -translate-x-1/2 items-center justify-center rounded-full bg-rose-500 text-white">
            <Plus className="size-3.5" strokeWidth={3} />
          </span>
        </div>
        <SideButton icon={<Heart className="size-8 fill-white" />} label={compact(data.likes)} />
        <SideButton icon={<MessageCircle className="size-8 fill-white" />} label={compact(data.comments)} />
        <SideButton icon={<Bookmark className="size-7 fill-white" />} label={compact(Math.round(data.likes / 9))} />
        <SideButton icon={<Share2 className="size-7" />} label={compact(data.shares)} />
        <div className="size-10 animate-[spin_5s_linear_infinite] overflow-hidden rounded-full bg-neutral-800 p-2 ring-4 ring-neutral-700">
          <Avatar data={data} size={24} />
        </div>
      </div>
      <div className="absolute bottom-[70px] left-3 right-[70px] z-10 space-y-1.5">
        <p className="flex items-center gap-1 text-[15px] font-bold">
          {data.channel}
          {data.verified && <BadgeCheck className="size-4 fill-sky-500 text-white" />}
        </p>
        <Caption text={data.caption} clamp={2} className="text-[13px] leading-snug" />
        <p className="flex items-center gap-1.5 text-[13px]">
          <Music2 className="size-3.5 shrink-0" />
          <span className="truncate">{data.sound}</span>
        </p>
      </div>
      <NavBar
        items={[
          { icon: <House className="size-6" />, label: 'Home', active: true },
          { icon: <Users className="size-6" />, label: 'Friends' },
          { icon: <span className="flex h-7 w-11 items-center justify-center rounded-lg bg-white text-black shadow-[-3px_0_0_#25f4ee,3px_0_0_#fe2c55]"><Plus className="size-5" strokeWidth={3} /></span> },
          { icon: <Inbox className="size-6" />, label: 'Inbox' },
          { icon: <User className="size-6" />, label: 'Profile' },
        ]}
      />
      {safe && <SafeZones zone={SAFE_ZONES['tt-fyp']} />}
    </PhoneFrame>
  );
}

export function TikTokGrid({ data }: { data: PreviewData }) {
  return (
    <PhoneFrame light testId="preview-tt-grid">
      <div className="absolute inset-0 overflow-hidden pt-10">
        <div className="flex items-center justify-between px-4 pb-3">
          <User className="size-5" />
          <span className="flex items-center gap-1 text-[16px] font-bold">
            {data.channel} <ChevronDown className="size-4" />
          </span>
          <Menu className="size-5" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Avatar data={data} size={90} />
          <p className="text-[15px] font-semibold">@{data.handle}</p>
          <div className="flex gap-6 text-center text-[12px] text-neutral-500">
            <span><b className="block text-[16px] text-neutral-900">312</b>Following</span>
            <span><b className="block text-[16px] text-neutral-900">{compact(Math.round(data.views / 4))}</b>Followers</span>
            <span><b className="block text-[16px] text-neutral-900">{compact(data.likes * 6)}</b>Likes</span>
          </div>
          <div className="flex gap-1.5">
            <span className="rounded-md bg-neutral-100 px-6 py-2 text-[13px] font-semibold">Edit profile</span>
            <span className="rounded-md bg-neutral-100 px-6 py-2 text-[13px] font-semibold">Share profile</span>
          </div>
        </div>
        <div className="mt-3 flex border-b border-neutral-200 text-neutral-400">
          <span className="flex flex-1 justify-center border-b-2 border-neutral-900 py-2 text-neutral-900"><Grid3x3 className="size-5" /></span>
          <span className="flex flex-1 justify-center py-2"><Lock className="size-5" /></span>
          <span className="flex flex-1 justify-center py-2"><Heart className="size-5" /></span>
        </div>
        <div className="grid grid-cols-3 gap-[2px]" data-testid="tt-grid">
          <GridTile views={compact(data.views)}>
            <Media data={data} motion={false} />
          </GridTile>
          {SAMPLE_POSTS.slice(0, 8).map((p) => (
            <GridTile key={p.title} views={compact(p.views)}>
              <div className="size-full" style={{ background: gradient(p.colors) }} />
            </GridTile>
          ))}
        </div>
      </div>
      <NavBar
        dark={false}
        items={[
          { icon: <House className="size-6" />, label: 'Home' },
          { icon: <Users className="size-6" />, label: 'Friends' },
          { icon: <span className="flex h-7 w-11 items-center justify-center rounded-lg bg-neutral-900 text-white"><Plus className="size-5" strokeWidth={3} /></span> },
          { icon: <Inbox className="size-6" />, label: 'Inbox' },
          { icon: <User className="size-6" />, label: 'Profile', active: true },
        ]}
      />
    </PhoneFrame>
  );
}

