// Drives the real desktop app (Electron) like a person would.
// Uses a local web server, so no internet is needed.
//   Dev build:       npm run build && npm run test:e2e
//   Packaged build:  VD_E2E_APP="release/win-unpacked/Video Downloader.exe" npm run test:e2e
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { makeFixtures } from '../tests/helpers/fixtures';
import { startMediaServer, type MediaServer } from '../tests/helpers/media-server';
import { Engine } from '../electron/core/engine';

const repo = path.resolve(__dirname, '..');
const shots = path.join(repo, 'e2e', '.tmp', 'screenshots');
let app: ElectronApplication;
let page: Page;
let server: MediaServer;
let work: string;
let downloads: string;
let ffprobe: string;

async function shot(name: string) {
  fs.mkdirSync(shots, { recursive: true });
  await page.waitForTimeout(450); // let fade/colour transitions finish
  await page.screenshot({ path: path.join(shots, `${name}.png`) });
}

function filesIn(dir: string): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
}

beforeAll(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-e2e-'));
  downloads = path.join(work, 'Downloads');
  const osDir = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
  const engine = new Engine({ bundledDir: path.join(repo, 'resources', 'bin', osDir), userBinDir: path.join(work, 'bin0'), cacheDir: path.join(work, 'c0') });
  await engine.init();
  if (!engine.tools.ffmpeg || !engine.tools.ffprobe) throw new Error('ffmpeg is needed to create test videos');
  ffprobe = engine.tools.ffprobe;
  const fixtures = makeFixtures(path.join(repo, 'tests', '.tmp', 'fixtures'), engine.tools.ffmpeg);
  server = await startMediaServer(fixtures);

  const packaged = process.env.VD_E2E_APP;
  app = await electron.launch({
    ...(packaged ? { executablePath: path.resolve(repo, packaged), args: [] } : { args: [repo] }),
    env: {
      ...process.env,
      VD_USER_DATA: path.join(work, 'userdata'),
      VD_DOWNLOAD_DIR: downloads,
      VD_DISABLE_UPDATER: '1',
      ELECTRON_ENABLE_LOGGING: '1',
    },
    timeout: 60_000,
  });
  app.process().stdout?.on('data', (d) => process.env.VD_TEST_VERBOSE && process.stdout.write(`[app] ${d}`));
  page = await app.firstWindow();
  await page.setViewportSize({ width: 1180, height: 860 }).catch(() => {});
  await page.waitForSelector('[data-testid=url-input]', { timeout: 60_000 });
});

afterEach(async (ctx) => {
  if (ctx.task.result?.state !== 'fail') return;
  // Help debugging on CI: save a screenshot and print the app log + visible download rows.
  await shot(`FAILED-${ctx.task.name.replace(/\W+/g, '-')}`).catch(() => {});
  const rows = await page.locator('[data-testid=job]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-status')}: ${(e as HTMLElement).innerText.replace(/\s+/g, ' ')}`)).catch(() => []);
  console.log('--- download rows ---\n' + rows.join('\n'));
  const logFile = path.join(work, 'userdata', 'logs', 'main.log');
  if (fs.existsSync(logFile)) console.log('--- app log (tail) ---\n' + fs.readFileSync(logFile, 'utf8').split('\n').slice(-60).join('\n'));
});

afterAll(async () => {
  await app?.close().catch(() => {});
  await server?.close();
  try {
    fs.rmSync(work, { recursive: true, force: true });
  } catch {
    /* Windows may still hold files for a moment */
  }
});

describe('desktop app', () => {
  it('starts and shows the paste box with a ready engine', async () => {
    await expect(page.title()).resolves.toBe('Video Downloader');
    await page.waitForSelector('text=Ready', { timeout: 60_000 });
    await shot('01-start');
  });

  it('gets video details and downloads 720p MP4', async () => {
    await page.fill('[data-testid=url-input]', `${server.url}/dash/manifest.mpd`);
    await page.click('[data-testid=go-button]');
    await page.waitForSelector('[data-testid=media-card]', { timeout: 120_000 });
    for (const q of ['1080p', '720p', '360p']) {
      await expect(page.locator('[data-testid=media-card] [role=radio]', { hasText: q }).count()).resolves.toBeGreaterThan(0);
    }
    await shot('02-video-details');
    await page.locator('[data-testid=media-card] [role=radio]', { hasText: '720p' }).click();
    await page.click('[data-testid=download-button]');
    await page.waitForSelector('[data-testid=job][data-status=done]', { timeout: 120_000 });
    await shot('03-download-done');
    expect(filesIn(downloads).filter((f) => f.endsWith('.mp4')).length).toBe(1);
  });

  it('downloads MP3 and saves the HD thumbnail', async () => {
    await page.fill('[data-testid=url-input]', `${server.url}/page.html`);
    await page.click('[data-testid=go-button]');
    await page.waitForSelector('[data-testid=media-card] >> text=Ünïcödé', { timeout: 120_000 });
    await page.click('text=Audio (MP3)');
    await page.click('[data-testid=download-button]');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=job][data-status=done]').length >= 2, null, { timeout: 120_000 });
    expect(filesIn(downloads).some((f) => f.endsWith('.mp3'))).toBe(true);
    await page.click('text=Save thumbnail (HD)');
    await page.waitForSelector('text=Thumbnail saved', { timeout: 30_000 });
    expect(filesIn(downloads).some((f) => f.endsWith('- thumbnail.jpg'))).toBe(true);
    await shot('04-mp3-and-thumbnail');
  });

  it('adds captions inside the video', async () => {
    await page.fill('[data-testid=url-input]', `${server.url}/page-subs.html`);
    await page.click('[data-testid=go-button]');
    await page.waitForSelector('[data-testid=captions] select', { timeout: 120_000 });
    await page.selectOption('[data-testid=captions] select', 'en');
    await page.click('[data-testid=captions] button[role=radio]:has-text("In the video")');
    await expect(page.locator('[data-testid=download-button]').innerText()).resolves.toContain('CC');
    await shot('04b-captions');
    const before = await page.locator('[data-testid=job][data-status=done]').count();
    await page.click('[data-testid=download-button]');
    await page.waitForFunction((n) => document.querySelectorAll('[data-testid=job][data-status=done]').length > n, before, { timeout: 120_000 });
    const file = filesIn(downloads).find((f) => f.startsWith('Captioned clip') && f.endsWith('.mp4'));
    expect(file).toBeTruthy();
    const streams = execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', path.join(downloads, file!)], { encoding: 'utf8' });
    expect(streams).toContain('subtitle');
  });

  it('catches a copied video link automatically (IDM style)', async () => {
    await page.click('button[aria-label=Clear]');
    const link = `${server.url}/sample.mp4`;
    await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), link);
    await page.waitForFunction((l) => (document.querySelector('[data-testid=url-input]') as HTMLInputElement)?.value === l, link, { timeout: 15_000 });
    await page.waitForSelector('[data-testid=media-card]', { timeout: 120_000 });
    await shot('05-clipboard-caught');
  });

  it('shows live progress and can cancel a download', async () => {
    await page.fill('[data-testid=url-input]', `${server.url}/slow/big.mp4`);
    await page.click('[data-testid=go-button]');
    await page.waitForSelector('[data-testid=media-card]', { timeout: 120_000 });
    await page.click('[data-testid=download-button]');
    const job = page.locator('[data-testid=job][data-status=downloading]').first();
    await job.waitFor({ timeout: 60_000 });
    await page.waitForSelector('[data-testid=job][data-status=downloading] >> text=/\\d+%/', { timeout: 60_000 });
    await shot('05b-downloading');
    await job.locator('button[aria-label="Cancel download"]').click();
    await page.waitForSelector('[data-testid=job][data-status=canceled]', { timeout: 30_000 });
  });

  it('shows a clear message for a broken link', async () => {
    await page.fill('[data-testid=url-input]', `${server.url}/does-not-exist.mp4`);
    await page.click('[data-testid=go-button]');
    await page.waitForSelector('[data-testid=info-error]', { timeout: 120_000 });
    await shot('06-error');
  });

  it('Preview studio: shows a video and thumbnail on YouTube, Instagram and TikTok', async () => {
    const fixtures = path.join(repo, 'tests', '.tmp', 'fixtures');
    await page.click('button[role=radio]:has-text("Preview studio")');
    await page.waitForSelector('[data-testid=preview-studio]');
    await page.setInputFiles('[data-testid=studio-video-input]', path.join(fixtures, 'sample.mp4'));
    await page.setInputFiles('[data-testid=studio-thumb-input]', path.join(fixtures, 'thumb.jpg'));
    await page.fill('[data-testid=studio-title]', 'My amazing travel vlog');
    await page.fill('[data-testid=studio-caption]', 'Sunset in the mountains #travel @friend');
    await page.fill('[data-testid=studio-views]', '1250000');
    await expect(page.locator('[data-testid=yt-my-card]').innerText()).resolves.toContain('My amazing travel vlog');
    await expect(page.locator('[data-testid=yt-my-card]').innerText()).resolves.toContain('1.3M views');
    await shot('11-studio-youtube-home');

    const views: [string, string, string][] = [
      ['YouTube', 'Shorts', 'preview-yt-shorts'],
      ['Instagram', 'Reels feed', 'preview-ig-reels'],
      ['Instagram', 'Profile grid', 'preview-ig-grid'],
      ['TikTok', 'For You feed', 'preview-tt-fyp'],
      ['TikTok', 'Profile grid', 'preview-tt-grid'],
    ];
    for (const [platform, view, testId] of views) {
      await page.click(`[data-testid=preview-studio] button[role=radio]:has-text("${platform}")`);
      await page.click(`[data-testid=preview-studio] button[role=radio]:has-text("${view}")`);
      await page.waitForSelector(`[data-testid=${testId}]`);
      if (view === 'Shorts' || view === 'Reels feed' || view === 'For You feed') {
        // The uploaded video really plays inside the phone.
        await page.waitForFunction(() => {
          const v = document.querySelector('[data-testid=preview-video]') as HTMLVideoElement | null;
          return !!v && v.readyState >= 2;
        }, null, { timeout: 30_000 });
      }
      if (view === 'For You feed') {
        await page.click('[data-testid=studio-safe-zones]');
        await page.waitForSelector('[data-testid=safe-zones]');
        await expect(page.locator('[data-testid=preview-tt-fyp]').innerText()).resolves.toContain('#travel');
      }
      await shot(`12-studio-${testId}`);
    }

    // Use a frame of the video as the thumbnail.
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-testid=preview-studio] video[controls]') as HTMLVideoElement | null;
      return !!v && v.readyState >= 2;
    });
    await page.click('[data-testid=studio-use-frame]');
    await page.waitForSelector('text=Thumbnail set from the video');

    // Save the preview as a picture.
    await page.click('[data-testid=studio-save-picture]');
    await page.waitForSelector('text=Preview saved as a picture', { timeout: 30_000 });
    expect(filesIn(downloads).some((f) => f.startsWith('Preview - TikTok') && f.endsWith('.png'))).toBe(true);
  });

  it('Preview studio: opens a finished download and plays it', async () => {
    await page.click('button[role=radio]:has-text("Download")');
    const previewButton = page.locator('[data-testid=job][data-status=done] button[aria-label^="Preview on"]').first();
    await previewButton.click();
    await page.waitForSelector('[data-testid=preview-studio]');
    await page.click('[data-testid=preview-studio] button[role=radio]:has-text("Instagram")');
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-testid=preview-video]') as HTMLVideoElement | null;
      return !!v && v.src.startsWith('vdmedia://') && v.readyState >= 2;
    }, null, { timeout: 30_000 });
    await shot('13-studio-from-download');
    await page.click('button[role=radio]:has-text("Download")');
  });

  it('opens settings and shows the engine status', async () => {
    await page.click('[data-testid=open-settings]');
    await page.waitForSelector('text=Download engine');
    await page.waitForSelector('text=/yt-dlp \\d{4}\\./');
    // The packaged app must be able to run itself as Node.js for YouTube (no extra download needed).
    await page.waitForSelector(process.env.VD_E2E_APP ? 'text=YouTube helper ready (built-in)' : 'text=/YouTube helper ready/');
    await shot('07-settings');
    await page.keyboard.press('Escape');
  });

  it.runIf(Boolean(process.env.VD_E2E_APP))('can run as Node.js (needed by yt-dlp for YouTube)', () => {
    const exe = path.resolve(repo, process.env.VD_E2E_APP!);
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
    const version = spawnSync(exe, ['--version'], { env, encoding: 'utf8', windowsHide: true });
    expect(version.stdout.trim()).toMatch(/^v\d+\./);
    expect(Number(version.stdout.trim().slice(1).split('.')[0])).toBeGreaterThanOrEqual(22);
    const run = spawnSync(exe, ['--permission', '-'], { env, input: 'console.log(6 * 7)', encoding: 'utf8', windowsHide: true });
    expect(run.stderr.trim()).toBe('');
    expect(run.stdout.trim()).toBe('42');
  });

  it.runIf(process.env.VD_TEST_YOUTUBE === '1')('downloads a real YouTube video (internet)', async () => {
    await page.fill('[data-testid=url-input]', 'https://www.youtube.com/watch?v=jNQXAC9IVRw');
    await page.click('[data-testid=go-button]');
    const which = await Promise.race([
      page.waitForSelector('[data-testid=media-card]', { timeout: 180_000 }).then(() => 'card'),
      page.waitForSelector('[data-testid=info-error]', { timeout: 180_000 }).then(() => 'error'),
    ]);
    await shot('09-youtube');
    if (which === 'error') {
      const text = await page.locator('[data-testid=info-error]').innerText();
      // Cloud servers are often blocked by YouTube; that is not a bug in the app.
      expect(text).toMatch(/robot|limiting|sign|bot/i);
      console.warn(`YouTube blocked this CI machine: ${text.split('\n')[0]}`);
      return;
    }
    const before = await page.locator('[data-testid=job][data-status=done]').count();
    await page.click('[data-testid=download-button]');
    await page.waitForFunction(
      (n) => document.querySelectorAll('[data-testid=job][data-status=done]').length > n || document.querySelector('[data-testid=job][data-status=error]'),
      before,
      { timeout: 180_000 },
    );
    await shot('10-youtube-download');
    const failed = await page.locator('[data-testid=job][data-status=error]').count();
    if (failed) {
      const text = await page.locator('[data-testid=job][data-status=error]').first().innerText();
      expect(text).toMatch(/robot|limiting|refused/i);
      console.warn(`YouTube download blocked on CI: ${text}`);
    }
  });

  it('switches to dark mode', async () => {
    await page.click('[data-testid=open-settings]');
    await page.click('button[role=radio]:has-text("Dark")');
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    await shot('08a-dark-settings');
    await page.keyboard.press('Escape');
    await shot('08-dark');
    await page.click('[data-testid=open-settings]');
    await page.click('button[role=radio]:has-text("Light")');
    await page.keyboard.press('Escape');
  });
});
