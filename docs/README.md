# Video Downloader master docs

Short, simple guide to everything built in Video Downloader: a free desktop app that downloads videos (MP4 up to 4K), audio (MP3) and HD thumbnails from YouTube, Instagram, TikTok, Facebook, X and 1000+ sites.

| # | Section | What it covers |
| --- | --- | --- |
| 1 | [Product and screens](01-product-and-screens.md) | Main screen, video card, playlists, downloads list, Preview studio, settings, link catching, tray, first start |
| 2 | [Download engine](02-download-engine.md) | yt-dlp, FFmpeg, aria2, quality rules, MP3, thumbnails, turbo mode, progress, retries, file names |
| 3 | [Front-end](03-front-end.md) | Stack, folders, data flow, components, theme, tests |
| 4 | [Desktop app and API](04-desktop-app-and-api.md) | Electron main process, window and tray, IPC API, saved data, accounts, updates |
| 5 | [Security, setup and release](05-security-setup-and-release.md) | Safety rules, variables, running, testing, building installers, releasing, limits |

## The project at a glance

- `src/` : the screens (Next.js 16 + React 19 + Tailwind CSS 4), exported as static files.
- `electron/` : the desktop app (Electron 45): window, tray, clipboard, accounts, updates.
- `electron/core/` : the download engine in plain Node.js (yt-dlp, FFmpeg, aria2), fully tested.
- `shared/` : types, the IPC API contract and formatting helpers used by both sides.
- `tests/` and `e2e/` : unit tests, real download tests and tests that drive the real app.
- `scripts/` : build helpers (tool download, Electron bundle, icons, these docs).
- `docs/` : these docs. Rebuild the PDF with `npm run docs`.

## Current version

- **1.2.0**: adds the **Preview studio**: see how a video and its thumbnail look on YouTube, Instagram and TikTok before posting.
- 1.1.0 added captions (inside the video, always visible, or `.srt`) and English auto-translated captions.
- Windows installer: `Video-Downloader-Setup-1.2.0.exe`. Mac app: `Video-Downloader-1.2.0-arm64.dmg`.
- Download page: https://github.com/talal4a/video-downloader/releases/latest
