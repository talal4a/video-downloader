'use client';

import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/api';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm shadow-brand-600/30 hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-600/50 disabled:shadow-none',
  secondary:
    'bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-white/5 dark:text-slate-100 dark:ring-white/10 dark:hover:bg-white/10',
  subtle: 'bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-200 dark:hover:bg-brand-500/25',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-14 px-6 text-base gap-2.5 rounded-2xl font-semibold',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex shrink-0 select-none items-center justify-center font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...rest}
      className={cx(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cx('flex cursor-pointer items-start justify-between gap-4 py-2.5', disabled && 'cursor-not-allowed opacity-60')}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-slate-500 dark:text-slate-400">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-white/20',
        )}
      >
        <span className={cx('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </label>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cx('inline-flex rounded-xl bg-slate-100 p-1 dark:bg-white/5', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40',
            value === o.value
              ? 'bg-white text-slate-900 shadow-sm dark:bg-white/15 dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  selected,
  onClick,
  title,
  subtitle,
  badge,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'relative flex min-w-[88px] flex-col items-start rounded-xl px-3.5 py-2 text-left ring-1 transition-all disabled:cursor-not-allowed disabled:opacity-40',
        selected
          ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-500/15'
          : 'bg-white ring-slate-200 hover:ring-slate-300 dark:bg-white/5 dark:ring-white/10 dark:hover:ring-white/25',
      )}
    >
      <span className={cx('text-sm font-semibold', selected ? 'text-brand-700 dark:text-brand-200' : 'text-slate-800 dark:text-slate-100')}>{title}</span>
      {subtitle && <span className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</span>}
      {badge && (
        <span className="absolute -top-2 right-2 rounded-full bg-amber-400 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-amber-950">
          {badge}
        </span>
      )}
    </button>
  );
}

export function ProgressBar({ value, indeterminate, tone = 'brand' }: { value: number; indeterminate?: boolean; tone?: 'brand' | 'green' | 'amber' }) {
  const color = tone === 'green' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-brand-600';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cx('h-full rounded-full transition-[width] duration-300', color, indeterminate && 'progress-stripes animate-stripes')}
        style={{ width: `${indeterminate ? 100 : Math.max(2, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={cx(
        'rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 dark:bg-white/[0.04] dark:shadow-none dark:ring-white/10',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">{children}</h2>
      {right}
    </div>
  );
}
