'use client';

import type { VideoDownloaderApi } from '@shared/api';

/** The desktop API (undefined when the page is opened in a normal browser). */
export function getApi(): VideoDownloaderApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.vd;
}

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function fileName(p?: string): string {
  if (!p) return '';
  return p.split(/[\\/]/).pop() ?? p;
}

/** Extract the first http(s) link from pasted text (same rules as the main process, simplified). */
export function findUrl(text: string): string | null {
  const t = text.trim();
  const m = /\bhttps?:\/\/[^\s<>"'`]+/i.exec(t);
  if (m) return m[0].replace(/[.,;:!?'"]+$/, '');
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*$/i.test(t)) return `https://${t}`;
  return null;
}
