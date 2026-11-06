import { describe, expect, it } from 'vitest';
import { classifyError, isRetryable } from '../../electron/core/errors';

const cases: [string, string][] = [
  ['ERROR: [youtube] abc: Private video. Sign in if you\'ve been granted access to this video', 'private'],
  ['ERROR: [youtube] abc: Video unavailable. This video has been removed by the uploader', 'unavailable'],
  ['ERROR: [youtube] abc: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication.', 'bot_check'],
  ['ERROR: [youtube] abc: Sign in to confirm your age. This video may be inappropriate for some users.', 'age_restricted'],
  ['ERROR: [Instagram] abc: Requested content is not available, rate-limit reached or login required. Use --cookies', 'login_required'],
  ['ERROR: Unsupported URL: https://example.com/', 'unsupported'],
  ['ERROR: [generic] Unable to download webpage: <urlopen error [Errno 11001] getaddrinfo failed>', 'network'],
  ['ERROR: unable to download video data: HTTP Error 403: Forbidden', 'http_403'],
  ['ERROR: [youtube] abc: This live event will begin in 3 hours.', 'live_not_started'],
  ['ERROR: [youtube] abc: The uploader has not made this video available in your country', 'geo_blocked'],
  ['ERROR: Postprocessing: [Errno 28] No space left on device', 'disk_full'],
  ['ERROR: [Netflix] This video is DRM protected', 'drm'],
  ['ERROR: [youtube] abc: Requested format is not available. Use --list-formats', 'format_unavailable'],
  ['ERROR: [youtube] abc: Unable to extract initial player response; please report this issue', 'extractor'],
  ['ERROR: something completely new', 'unknown'],
];

describe('classifyError', () => {
  it.each(cases)('%s -> %s', (text, code) => {
    const e = classifyError(`[youtube] Extracting URL\n${text}\n`);
    expect(e.code).toBe(code);
    expect(e.message.length).toBeGreaterThan(5);
  });

  it('marks temporary problems as retryable', () => {
    expect(isRetryable(classifyError('ERROR: HTTP Error 403: Forbidden'))).toBe(true);
    expect(isRetryable(classifyError('ERROR: Private video'))).toBe(false);
  });
});
