# Front-end

The screens in `src/`. They are a Next.js app exported as static files and shown inside the desktop window.

## Stack

| Part | Library |
| --- | --- |
| UI | React 19 |
| Framework | Next.js 16 (App Router), `output: 'export'` (static files in `out/`) |
| Styling | Tailwind CSS 4 (`@tailwindcss/postcss`) with a custom purple `brand` palette |
| Icons | `lucide-react` |
| Language | TypeScript 5.9 |
| Lint | ESLint 9 with `eslint-config-next` (core-web-vitals + TypeScript) |

No web server, no database, no outside fonts: everything works offline. Talking to the computer goes through the desktop API (`window.vd`).

## Folder map

| Path | Purpose |
| --- | --- |
| `src/app/layout.tsx` | Page shell; applies the saved theme before first paint (no white flash) |
| `src/app/page.tsx` | The only page; renders `App` |
| `src/app/globals.css` | Tailwind setup, `dark:` variant, brand colours, progress stripes, fade-in |
| `src/components/App.tsx` | Main screen: link box, banners, loading/error/video states, paste, drag and drop, events |
| `src/components/MediaCard.tsx` | Single video: thumbnail, Video/Audio switch, quality and MP3 chips, subtitles, download |
| `src/components/PlaylistCard.tsx` | Playlists and multi-video posts with selection |
| `src/components/DownloadList.tsx` | Downloads list rows, progress, actions, error details |
| `src/components/SettingsPanel.tsx` | Settings side panel |
| `src/components/preview/PreviewStudio.tsx` | Preview studio: post inputs (video, thumbnail, frame grab, profile picture, text, numbers), platform/view tabs, safe zones, play/sound, Save as picture |
| `src/components/preview/Platforms.tsx` | The six look-alike screens (YouTube home and Shorts, Instagram Reels and grid, TikTok For You and grid), phone frame, safe-zone overlay |
| `src/lib/preview.ts` | Preview data, defaults, views per platform, safe-zone sizes, sample feed posts, count formatting ("1.3M"), caption hashtag parts |
| `src/components/Toasts.tsx` | Small pop-up messages (success, error, info) with an optional action |
| `src/components/ui.tsx` | Button, IconButton, Toggle, Segmented, Chip, ProgressBar, Card |
| `src/lib/api.ts` | `getApi()` for `window.vd`, link finder, class helper |
| `shared/types.ts` | Shared types: `MediaInfo`, `DownloadRequest`, `Job`, `Settings`, `EngineInfo`… |
| `shared/api.ts` | The `VideoDownloaderApi` contract and IPC channel names |
| `shared/format.ts` | Bytes, speed, duration, time left, view counts, quality labels |

## Data flow

- `getApi()` returns `window.vd`, which the preload script exposes. Opened in a normal browser, the page shows a short "open it with the app" screen instead.
- **Loading a link:** `App.load()` → `vd.getInfo(url)` → `{ ok, value | error }`. A request counter ignores late answers when a newer link was loaded.
- **Thumbnails** come back as a `data:` URL from `vd.getThumbnail(key)` (so sites that block hot-linking still show).
- **Downloads:** `vd.startDownloads([...])` adds jobs; live changes arrive through `vd.onDownloadUpdate(job)` and `vd.onDownloadRemoved(id)`; the list is merged by job id.
- **Live events also used:** `onClipboardLink`, `onOpenUrl` (notification, tray, right-click, second launch), `onSettingsChanged`, `onEngineInfo` (status and first-start progress), `onAppUpdate`.
- **Preview studio:** uploaded files become `blob:` addresses (they never leave the computer); finished downloads play through `vdmedia://job/<id>/0`. The studio state lives in `App`, so switching tabs keeps it. **Save as picture** calls `vd.capturePreview(rect, name)`.
- **Settings** are read with `vd.getSettings()` and changed with `vd.updateSettings(patch)`; the main process checks every value.
- **Theme:** the chosen mode is also kept in `localStorage` (`vd-theme`) only so the first paint uses the right colours; the real value lives in the app's settings file.

## Screen states

| State | Shows |
| --- | --- |
| `idle` | Link box and three "how it works" cards (until something is downloaded) |
| `loading` | Skeleton card "Getting video details from …" |
| `error` | Message, hint, **Try again**, **Open Accounts** for login errors, technical details |
| `ready` | `MediaCard` or `PlaylistCard` |

A header switch shows either the downloader or the Preview studio; downloads keep running in the background.

## Accessibility and comfort

- Real buttons, `role="radio"` chips, `role="switch"` toggles, labelled icon buttons, visible focus rings.
- Keyboard: Enter loads, Escape closes Settings, Ctrl/Cmd+V loads a copied link anywhere.
- Light and dark themes with matching contrast.

## Testing and build

| Command | What it does |
| --- | --- |
| `npm run build:ui` | `next build` → static files in `out/` |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript for the UI and the desktop app |
| `npm run test:e2e` | Drives the real app with Playwright (see [Security, setup and release](05-security-setup-and-release.md)) |

Elements used by tests: `url-input`, `go-button`, `paste-button`, `media-card`, `download-button`, `job` (with `data-status`), `info-error`, `open-settings`, `setup-banner`, `captions`, `preview-studio`, `studio-*` inputs, `preview-*` screens, `preview-video`, `safe-zones`.
