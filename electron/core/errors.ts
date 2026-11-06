import type { FriendlyError } from '../../shared/types';

export type ErrorCode =
  | 'invalid_url'
  | 'unsupported'
  | 'private'
  | 'unavailable'
  | 'age_restricted'
  | 'login_required'
  | 'bot_check'
  | 'geo_blocked'
  | 'drm'
  | 'live_not_started'
  | 'live'
  | 'no_media'
  | 'format_unavailable'
  | 'network'
  | 'http_403'
  | 'http_404'
  | 'rate_limited'
  | 'disk_full'
  | 'permission'
  | 'ffmpeg_missing'
  | 'engine_missing'
  | 'extractor'
  | 'timeout'
  | 'canceled'
  | 'interrupted'
  | 'save_failed'
  | 'unknown';

interface Rule {
  code: ErrorCode;
  test: RegExp;
  message: string;
  hint?: string;
}

// Order matters: the first match wins.
const RULES: Rule[] = [
  {
    code: 'drm',
    test: /\bDRM\b|drm.?protected/i,
    message: 'This video is protected (DRM) and cannot be downloaded.',
  },
  {
    code: 'bot_check',
    test: /confirm you.?re not a bot|not a robot/i,
    message: 'YouTube is asking to confirm you are not a robot.',
    hint: 'Wait a few minutes and try again. If it keeps happening, restart your internet router.',
  },
  {
    code: 'age_restricted',
    test: /confirm your age|age.?restricted|inappropriate for some users/i,
    message: 'This video is age-restricted and needs a signed-in account.',
  },
  {
    code: 'private',
    test: /private video|This (video|post|account) is private|is private\b/i,
    message: 'This video is private.',
    hint: 'Only the owner (or people they allowed) can see it.',
  },
  {
    code: 'login_required',
    test: /login required|log in|logged.?in|requires? (an )?account|rate-limit reached or login required|use --cookies|--cookies-from-browser|authentication/i,
    message: 'This site needs you to be logged in to get this video.',
    hint: 'Open Settings → Accounts and log in to this site, then try again.',
  },
  {
    code: 'live_not_started',
    test: /live event will begin|Premieres in|This live stream (recording )?is not available|is_upcoming|will begin in/i,
    message: 'This live stream or premiere has not started yet.',
  },
  {
    code: 'geo_blocked',
    test: /available in your (country|region)|geo.?restrict|blocked it in your country|not available in your location/i,
    message: 'This video is blocked in your country.',
  },
  {
    code: 'unavailable',
    test: /video unavailable|this video has been removed|no longer available|does not exist|has been terminated|copyright claim|account associated with this video has been|content isn.t available|not available anymore|Video unavailable|removed by the uploader/i,
    message: 'This video is not available (it may have been deleted or blocked).',
  },
  {
    code: 'unsupported',
    test: /Unsupported URL|no suitable extractor/i,
    message: "This link isn't supported.",
    hint: 'Copy the link of the video page itself (open the video, then copy the address).',
  },
  {
    code: 'invalid_url',
    test: /is not a valid URL|Invalid URL|URL could be a direct video link/i,
    message: "That doesn't look like a valid link.",
  },
  {
    code: 'no_media',
    test: /No video formats found|There's no video in this|no media found|This post does not contain|No video could be found/i,
    message: 'No video was found at this link.',
    hint: 'If it is a photo post, there is no video to download. You can still save the thumbnail.',
  },
  {
    code: 'format_unavailable',
    test: /Requested format is not available|format not available/i,
    message: 'This quality is not available for this video.',
    hint: 'Pick another quality and try again.',
  },
  {
    code: 'ffmpeg_missing',
    test: /ffmpeg (is )?not (found|installed)|ffprobe and ffmpeg not found|ffmpeg could not be found/i,
    message: 'A required part of the app (FFmpeg) is missing.',
    hint: 'Please reinstall Video Downloader.',
  },
  {
    code: 'disk_full',
    test: /No space left on device|Errno 28|disk (is )?full|not enough space|ENOSPC/i,
    message: 'Your disk is full.',
    hint: 'Free up some space (or choose another download folder in Settings) and try again.',
  },
  {
    code: 'permission',
    test: /Permission denied|Errno 13|Access is denied|EACCES|EPERM/i,
    message: "The app can't write to the download folder.",
    hint: 'Choose another download folder in Settings.',
  },
  {
    code: 'rate_limited',
    test: /HTTP Error 429|Too Many Requests|rate.?limit/i,
    message: 'The site is limiting downloads right now.',
    hint: 'Wait a few minutes and try again.',
  },
  {
    code: 'http_403',
    test: /HTTP Error 403|403 Forbidden|status code 403|errorCode=22/i,
    message: 'The site refused the download.',
    hint: 'Try again — the app updates itself to fix this.',
  },
  {
    code: 'http_404',
    test: /HTTP Error 404|404 Not Found/i,
    message: 'The video could not be found (error 404).',
  },
  {
    code: 'timeout',
    test: /timed out|Read timed out|ETIMEDOUT|timeout/i,
    message: 'The connection is too slow or timed out.',
    hint: 'Check your internet and try again.',
  },
  {
    code: 'network',
    test: /Unable to download (webpage|API page|JSON)|getaddrinfo|Name or service not known|No address associated|Temporary failure in name resolution|Network is unreachable|Connection (refused|reset|aborted)|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|Failed to resolve|urlopen error|SSL: |CERTIFICATE_VERIFY_FAILED|RemoteDisconnected|IncompleteRead|Unable to connect|nodename nor servname/i,
    message: "Can't connect to the site.",
    hint: 'Check your internet connection and try again.',
  },
  {
    code: 'extractor',
    test: /Unable to extract|Signature extraction failed|n challenge|nsig|Failed to parse JSON|please report this issue|Unable to decode|KeyError|Some formats may be missing|jsc/i,
    message: 'The site changed something and the download engine needs an update.',
    hint: 'The app will try to update its download engine automatically. Please try again in a minute.',
  },
];

export const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'network',
  'timeout',
  'http_403',
  'extractor',
  'rate_limited',
  'unknown',
]);

/** Pick the most relevant "ERROR:" lines from yt-dlp output. */
export function errorLines(output: string): string[] {
  const lines = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const errs = lines.filter((l) => /^ERROR:/i.test(l)).map((l) => l.replace(/^ERROR:\s*/i, ''));
  if (errs.length) return errs;
  // No ERROR: line — fall back to the last few non-progress lines.
  return lines.filter((l) => !l.startsWith('VDPROG') && !l.startsWith('[#')).slice(-3);
}

export function classifyError(output: string): FriendlyError {
  const errs = errorLines(output);
  const details = errs.join('\n').slice(0, 2000) || output.slice(-1500);
  const haystack = errs.length ? errs.join('\n') : output;
  for (const rule of RULES) {
    if (rule.test.test(haystack)) {
      return { code: rule.code, message: rule.message, hint: rule.hint, details };
    }
  }
  return {
    code: 'unknown',
    message: 'Something went wrong while getting this video.',
    hint: 'Please try again. If it keeps failing, the video may not be downloadable.',
    details,
  };
}

export function friendly(code: ErrorCode, message: string, hint?: string, details?: string): FriendlyError {
  return { code, message, hint, details };
}

export function isRetryable(err: FriendlyError): boolean {
  return RETRYABLE.has(err.code as ErrorCode);
}
