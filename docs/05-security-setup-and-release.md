# Security, setup and release

How the app keeps people safe, and how to run, test, build and release it.

## Security measures in the code

- **Locked-down window:** `contextIsolation`, `sandbox` and no Node.js in the page. The page only gets the small `window.vd` API.
- **Content-Security-Policy** on the app's own pages (`protocol.ts`): scripts and styles only from the app; images may come from `https:`; no plugins, no framing.
- **No navigation away:** links to other sites open in the normal browser; pop-ups are blocked.
- **Checked input:** every download request is re-checked in the main process (link must be `http(s)`, kind, quality 100-4320, bitrate, subtitle code, sizes). Settings are corrected to safe values.
- **Files:** **Play / Show in folder** only work for files in the download folder or made by a download. Only `http(s)` links can be opened externally.
- **Downloads from the internet:** yt-dlp and Deno are checked against their official SHA-256 sums; zips with `../` paths are refused; all tools come from their official GitHub releases.
- **No shell:** programs are started with an argument list (never through a command shell), so titles and links cannot run commands. `--` comes before every link.
- **Accounts:** passwords are typed into the site itself; cookies are stored per site with owner-only permissions and used only for that site.
- **Privacy:** no analytics, no tracking, no server. The app only talks to the video sites and to GitHub (updates).
- **Safe file names** for Windows, and never overwriting existing files.

## Environment variables (developers and tests only)

Normal users never need these.

| Name | Meaning |
| --- | --- |
| `VD_USER_DATA` | Use another app data folder |
| `VD_DOWNLOAD_DIR` | Force the download folder |
| `VD_DISABLE_CLIPBOARD` | Turn off link catching |
| `VD_DISABLE_UPDATER` | Turn off app updates |
| `VD_DEV_URL` | Dev server address (default `http://localhost:3123`) |
| `VD_YTDLP`, `VD_FFMPEG_DIR`, `VD_ARIA2C` | Use specific tools (`VD_ARIA2C=` empty turns turbo off) |
| `VD_TOOLS_BASE` | Download missing tools from a mirror (tests) |
| `VD_FORCE_JS_FALLBACK` | Pretend the built-in YouTube runtime fails (tests) |
| `VD_E2E_APP`, `VD_TEST_YOUTUBE`, `VD_TEST_VERBOSE` | Test the installed app, run internet YouTube tests, verbose logs |

## Run locally (Mac)

1. Install Node.js 22.12 or newer (`brew install node`) and, for full features, `brew install ffmpeg aria2`.
2. `git clone https://github.com/talal4a/video-downloader.git` and `cd video-downloader`.
3. `npm install`
4. `npm run setup` downloads yt-dlp for this computer into `resources/bin/mac`.
5. `npm run dev` opens the app with live reload (Next.js on port 3123 + Electron).

## Commands

| Command | What it does |
| --- | --- |
| `npm run setup` | Download yt-dlp (+ FFmpeg and aria2 on Windows) into `resources/bin/<os>` |
| `npm run dev` | Development app with live reload |
| `npm run build` | UI to `out/` + desktop code to `dist-electron/` |
| `npm start` | Run the built app |
| `npm run lint` / `npm run typecheck` | Code checks |
| `npm test` | Unit tests |
| `npm run test:integration` | Real downloads against a local test server |
| `npm run test:e2e` | Drive the real app (add `VD_E2E_APP=<path to exe>` to test an installed build) |
| `npm run dist:win` | Windows installer `release/Video-Downloader-Setup-<version>.exe` (works on a Mac, no Wine needed) |
| `npm run dist:mac` | Mac app `release/Video-Downloader-<version>-arm64.dmg` (ad-hoc signed) |
| `npm run dist:linux` | Linux AppImage |
| `npm run icons` | Redraw the app and tray icons |
| `npm run docs` | Rebuild this PDF (`docs/Video-Downloader-Docs.pdf`) |

## Tests

| Suite | Count | What |
| --- | --- | --- |
| Unit (`tests/unit`) | 75 | Link detection, error messages, safe names, quality labels and sizes, yt-dlp commands, progress parsing, aria2 control file, cookies, settings, ZIP extractor |
| Integration (`tests/integration`) | 24 (+1 internet) | Real yt-dlp, FFmpeg and aria2 against a local server: 720p/best merge, MP3, thumbnails, captions (inside the video, `.srt`, drawn onto the picture and checked by pixel brightness), Unicode names, `(1)` copies, turbo with live progress, cancel, multi-video posts, parallel queue, errors, first-start tool download, checksum refusal, YouTube runtime and Deno fallback |
| End-to-end (`e2e`) | 11 | Starts the real app: paste → download 720p, MP3 + thumbnail, captions inside the video, clipboard catching, live progress + cancel, error screen, settings, dark mode, Node.js self-test of the installed app, real YouTube (internet) |

- The local server (`tests/helpers/media-server.ts`) supports Range requests and a slow mode; test videos are made with FFmpeg (`tests/helpers/fixtures.ts`).
- Checked on Node.js 22 and 26. The E2E suite was also run against the packaged app.

## Building the installers

- `scripts/fetch-binaries.mjs` downloads the official tools: yt-dlp (checksum-verified), FFmpeg (yt-dlp or BtbN builds, shared DLL version first) and aria2 1.37 for Windows; on Mac it uses Homebrew FFmpeg/aria2 when present. It unzips with the system tool (`ditto`, `tar.exe`, `unzip`).
- `electron-builder.yml`:
  - Windows: one-click NSIS installer, per-user (no admin password), desktop and Start-menu shortcuts, opens after install, executable `VideoDownloader.exe`.
  - Mac: `.dmg`, ad-hoc signature (free), no hardened runtime.
  - Linux: AppImage.
  - Tools go to `resources/bin`, icons to `resources/icons`; the UI and code are packed in `app.asar`.
- The installer is not code-signed (that costs money), so Windows shows "Windows protected your PC" once: **More info → Run anyway**.

## Releasing a new version (manual)

GitHub Actions is blocked on this account by a billing lock, so releases are made by hand:

1. Change `"version"` in `package.json` (for example `1.2.0`).
2. On the Mac: `npm run dist:win` (and `npm run dist:mac` if wanted).
3. Open `https://github.com/talal4a/video-downloader/releases/new?tag=v1.2.0&title=Video%20Downloader%201.2.0`.
4. Attach from `release/`: `Video-Downloader-Setup-1.2.0.exe`, `Video-Downloader-Setup-1.2.0.exe.blockmap` and `latest.yml` (these two let installed apps update themselves), plus the `.dmg` if wanted.
5. Click **Publish release** (not "Save draft").

Share link: https://github.com/talal4a/video-downloader/releases/latest

## Updating a PC that already has the app

**Automatic (best):** publish the new release with all three files (`.exe`, `.exe.blockmap`, `latest.yml`). The installed app checks 15 seconds after it starts and every 6 hours (or **Settings → About → Check now**), downloads the update in the background and shows "A new version is ready" → **Restart now**. Nothing else to do on that PC.

**By hand:** send the new `Video-Downloader-Setup-<version>.exe`; double-clicking it installs over the old version. Settings, history and downloaded files are kept.

- The version number in `package.json` must be higher than the installed one, otherwise nothing updates.
- Version 1.0.0 was published with only the `.exe`, which is fine: the app looks at the newest release, so 1.1.0 just needs all three files.

## Automatic build (when GitHub Actions works)

`.github/workflows/build.yml` is ready:

- Every push and pull request: lint, typecheck, unit tests, UI build (Ubuntu).
- `main`, version tags and manual runs: on real Windows it downloads the tools, runs the integration tests, builds the installer, tests the installed app end-to-end, and uploads the installer and screenshots.
- Pushing a tag `v1.2.3` publishes a GitHub Release with the installer, `latest.yml` and blockmap.

## Installing on a Windows PC

1. Download `Video-Downloader-Setup-<version>.exe` and double-click it.
2. "Windows protected your PC" → **More info → Run anyway** (first time only).
3. It installs to the user's folder and opens. Files are saved in **Downloads → Video Downloader**.
4. Needs normal 64-bit Windows 10 or 11 (not "S mode").

## Known limits

| Limit | Why / workaround |
| --- | --- |
| 4K/2K files don't open in QuickTime (Mac) | YouTube only has VP9 at that size. Use VLC or IINA, or pick 1080p |
| YouTube "not a robot" check | Happens on cloud servers and sometimes busy networks. Wait or restart the router |
| Age-restricted YouTube videos | Need a signed-in YouTube account; Google blocks sign-in inside apps |
| DRM (Netflix, Prime, Disney+, Spotify) | Not possible and not allowed |
| Live streams | Download after the stream ends |
| Some Instagram/Facebook/TikTok/X videos | Log in once in Settings → Accounts |
| App self-update | Needs a public repository and releases that include `latest.yml` |
| "Always visible" captions on 4K | Re-encoding 4K takes a long time on older computers; "In the video" is instant |

> Only download videos you own or have permission to keep, and respect each site's terms and copyright law.
