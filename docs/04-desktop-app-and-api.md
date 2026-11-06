# Desktop app and API

The Electron main process in `electron/`: it owns the window, the tray, the clipboard, saved data and the download engine, and offers a small API to the screens.

## Stack

- Electron 45 (Chromium + Node.js 24), bundled with esbuild into `dist-electron/main.cjs` and `preload.cjs`.
- `electron-updater` for app updates from GitHub Releases. `electron-builder` for installers.
- Everything else is plain Node.js in `electron/core/`.

## Files

| File | Purpose |
| --- | --- |
| `main.ts` | Start-up, window, tray, menus, notifications, IPC handlers, settings, history, logging |
| `preload.ts` | Exposes `window.vd` safely (`contextBridge`) |
| `protocol.ts` | Serves the exported UI as `app://local/…` with a strict Content-Security-Policy |
| `clipboard.ts` | Link catching (checks every second) |
| `accounts.ts` | Optional site log-in and cookie export |
| `updater.ts` | App self-update (Windows installer builds) |
| `core/engine.ts` | Finds and updates tools, YouTube runtime self-test, common yt-dlp options |
| `core/toolsetup.ts`, `core/unzip.ts` | Downloads missing tools; ZIP extractor |
| `core/info.ts` | Video details and thumbnails |
| `core/downloads.ts` | Queue, jobs, progress, retries, saving files |
| `core/ytdlp.ts` | yt-dlp command lines, JSON parsing, progress parsing |
| `core/aria2.ts` | Reads aria2's control file for live turbo progress |
| `core/errors.ts` | Turns yt-dlp errors into plain messages |
| `core/files.ts`, `core/urls.ts`, `core/thumbnails.ts`, `core/cookies.ts`, `core/settings.ts`, `core/store.ts`, `core/process.ts` | Safe names, link detection, images, cookie files, settings rules, JSON files, running and stopping programs |

## Window and start-up

- One copy only (`requestSingleInstanceLock`); a second launch focuses the window and passes on any link.
- Window opens when ready (no white flash) with the system's light/dark background.
- In development it loads `http://localhost:3123`; in the app it loads `app://local/`.
- Links to other sites open in the normal browser; the window cannot be navigated away.
- **Start with the computer** starts hidden (`--hidden`) in the tray.
- Windows: no menu bar. Mac: standard App / Edit / View / Window menus.
- Start-up order: clean the temporary folder → find tools → download missing tools → YouTube runtime self-test → engine status to the UI. The window does not wait for this; requests wait for the engine to be ready.

## IPC API (`window.vd`)

Each call returns a promise. Errors come back as `{ ok: false, error: { code, message, hint, details } }`.

| Call | Purpose |
| --- | --- |
| `getInfo(url)` | Video details (`MediaInfo`) |
| `getThumbnail(key)` / `saveThumbnail(key)` | Preview as `data:` URL / save HD JPG to the download folder |
| `startDownloads(requests)` | Add one or more downloads (max 2000); every request is checked |
| `listDownloads()`, `cancelDownload(id)`, `retryDownload(id)`, `removeDownload(id)`, `clearFinished()` | Manage the list |
| `openFile(path)`, `showInFolder(path)`, `openDownloadsFolder()`, `openExternal(url)` | Open things (only known download files; only `http(s)` links) |
| `readClipboardUrl()` | First link in the clipboard |
| `getSettings()`, `updateSettings(patch)`, `chooseDownloadDir()` | Settings |
| `getEngineInfo()`, `updateEngine()` | Tool status; update yt-dlp or repair missing tools |
| `getAccounts()`, `login(id)`, `logout(id)` | Optional site accounts |
| `getAppInfo()`, `getAppUpdate()`, `checkAppUpdate()`, `installAppUpdate()` | Version and self-update |

Events: `onDownloadUpdate`, `onDownloadRemoved`, `onClipboardLink`, `onOpenUrl`, `onSettingsChanged`, `onEngineInfo`, `onAppUpdate`. Download updates are sent at most 4 times a second per job.

## Data model

**DownloadRequest**: `url`, `title`, `thumbnail`, `site`, `duration`, `kind` (`video`/`audio`), `quality` (number or `best`), `audioBitrate` (320/192/128), `subtitles` (`{ lang, auto }` or none), `subfolder`, `multi`.

**Job**: `id`, `request`, `status` (`queued`, `starting`, `downloading`, `processing`, `done`, `error`, `canceled`), `stage`, `progress` (0-1), `downloadedBytes`, `totalBytes`, `speed`, `eta`, `itemIndex`/`itemCount`, `filePath`, `files`, `error`, `warnings`, `turbo`, `attempts`, times.

**Settings** (defaults): download folder `Downloads/Video Downloader`, catch links **on**, turbo **on** with 16 connections, 3 at a time, keep running in tray **on**, start with computer **off**, start with **Video**, default quality **1080p**, MP3 **320 kbps**, theme **Auto**, notifications **on**, daily engine update **on**. Bad values are corrected (for example connections 1-16, at a time 1-5).

## Saved data

App data folder: `%APPDATA%\Video Downloader` on Windows, `~/Library/Application Support/Video Downloader` on Mac.

| File / folder | Contents |
| --- | --- |
| `settings.json` | Settings |
| `history.json` | Last 500 downloads (written safely: temp file then rename) |
| `engine.json` | Last yt-dlp update time and result |
| `bin/` | Updatable yt-dlp, downloaded FFmpeg (`bin/ffmpeg/`), aria2, Deno |
| `cache/` | yt-dlp cache (YouTube player code) |
| `cookies/` | Exported site cookies (only for logged-in sites) |
| `logs/main.log` | App log, rotated at 2 MB |

## Accounts (optional log-in)

| Site | Log-in page | Logged in when cookie exists |
| --- | --- | --- |
| Instagram | instagram.com/accounts/login | `sessionid` |
| Facebook | facebook.com/login | `c_user` |
| TikTok | tiktok.com/login | `sessionid` |
| X (Twitter) | x.com/i/flow/login | `auth_token` |

- The person logs in inside a normal browser window with its own storage (`persist:acct-<site>`); the window closes by itself once logged in. The app never sees or stores the password.
- For a link from that site only, cookies are written to `cookies/<site>.txt` (Netscape format, owner-only permissions) and given to yt-dlp with `--cookies`.
- **Log out** clears that site's storage and deletes the file.
- YouTube log-in is not offered: Google blocks sign-in inside apps.

## App updates

- Only in installed Windows builds. Checks 15 s after start and every 6 hours from https://github.com/talal4a/video-downloader/releases (needs the repository to be public and the release to include `latest.yml`).
- Downloads in the background; a banner "A new version is ready" offers **Restart now**. Otherwise it installs when the app quits.
- Errors are silent (no scary messages for the user).

## Logging

- `logs/main.log`: start-up, tools found, every download attempt, failures with yt-dlp details, update results, crashes. Useful when someone sends a problem report.
