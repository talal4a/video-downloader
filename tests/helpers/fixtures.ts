// Generates small test videos/images with FFmpeg (cached between runs).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const TITLE = 'Ünïcödé "Test": Video/Name? 🎬';

function ff(ffmpeg: string, args: string[]) {
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit', windowsHide: true });
}

export function makeFixtures(dir: string, ffmpeg: string): string {
  const marker = path.join(dir, '.done-v4');
  if (fs.existsSync(marker)) return dir;
  fs.mkdirSync(path.join(dir, 'dash'), { recursive: true });
  const src = ['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '6'];
  ff(ffmpeg, [...src, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', path.join(dir, 'sample.mp4')]);
  ff(ffmpeg, [
    '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000', '-t', '6',
    '-map', '0:v', '-map', '0:v', '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-g', '30', '-keyint_min', '30', '-sc_threshold', '0',
    '-s:v:0', '1920x1080', '-s:v:1', '1280x720', '-s:v:2', '640x360',
    '-b:v:0', '2500k', '-b:v:1', '1200k', '-b:v:2', '400k', '-c:a', 'aac', '-b:a', '128k',
    '-seg_duration', '2', '-use_template', '1', '-use_timeline', '1',
    '-adaptation_sets', 'id=0,streams=v id=1,streams=a', '-f', 'dash', path.join(dir, 'dash', 'manifest.mpd'),
  ]);
  ff(ffmpeg, ['-f', 'lavfi', '-i', 'testsrc2=size=1280x720', '-frames:v', '1', '-c:v', 'libwebp', path.join(dir, 'thumb.webp')]);
  ff(ffmpeg, ['-f', 'lavfi', '-i', 'testsrc2=size=1280x720', '-frames:v', '1', '-q:v', '2', path.join(dir, 'thumb.jpg')]);
  // A ~6 MB file served slowly, for cancel tests.
  ff(ffmpeg, ['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-t', '20', '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '2500k', '-pix_fmt', 'yuv420p', path.join(dir, 'big.mp4')]);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  fs.writeFileSync(
    path.join(dir, 'page.html'),
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(TITLE)}</title>
<meta property="og:title" content="${esc(TITLE)}"><meta property="og:image" content="/thumb.webp"></head>
<body><video src="/sample.mp4" controls></video></body></html>`,
  );
  fs.writeFileSync(
    path.join(dir, 'multi.html'),
    `<!doctype html><html><head><meta charset="utf-8"><title>Two clips</title></head>
<body><video src="/sample.mp4" controls></video><video src="/big.mp4" controls></video></body></html>`,
  );
  // A black video with an English captions track (<track>), to test captions.
  ff(ffmpeg, ['-f', 'lavfi', '-i', 'color=c=black:size=640x360:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=44100', '-t', '5', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', path.join(dir, 'black.mp4')]);
  fs.writeFileSync(path.join(dir, 'captions.en.vtt'), 'WEBVTT\n\n00:00:00.000 --> 00:00:04.800\nHELLO CAPTIONS\n');
  fs.writeFileSync(
    path.join(dir, 'page-subs.html'),
    `<!doctype html><html><head><meta charset="utf-8"><title>Captioned clip</title></head>
<body><video src="/black.mp4" controls><track kind="subtitles" src="/captions.en.vtt" srclang="en" label="English"></video></body></html>`,
  );
  fs.writeFileSync(marker, 'ok');
  return dir;
}
