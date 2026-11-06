# Video Downloader

A free, open-source desktop app for Windows (and macOS for development) that downloads **videos (MP4 up to 4K)**, **audio (MP3)** and **HD thumbnails** from YouTube, Instagram, TikTok, Facebook, X (Twitter), Vimeo, Reddit and 1000+ other sites, with an **IDM-style** link catcher and **multi-connection turbo downloads**.

No accounts, no ads, no paid services. Built with Next.js + Electron, powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp), [FFmpeg](https://ffmpeg.org) and [aria2](https://aria2.github.io).

---

## For the person using it (Windows)

### Install (one time, about 1 minute)

1. Get the file **`Video-Downloader-Setup-x.y.z.exe`** (see [Getting the installer](#getting-the-installer-for-your-friend) below).
2. Double-click it. It installs by itself and puts a **Video Downloader** icon on the desktop. No admin password is needed.
3. The first time, Windows may show a blue box **"Windows protected your PC"**. This happens because the app is free and not "code-signed" (signing costs money). Click **More info → Run anyway**. You only have to do this once.

### Use it

1. **Copy** a video link (in the browser: the address bar, or **Share → Copy link** in the YouTube/Instagram/TikTok app or website).
2. The app **notices the link by itself** and shows the video. (You can also click **Paste**, or press Ctrl+V in the app.)
3. Choose **Video (MP4)** or **Audio (MP3)**, pick a quality, click **Download**.

Files are saved in **Downloads → Video Downloader**. Click **Play** or the folder icon next to a finished download.

Other handy things:
- **Save thumbnail (HD)** saves the video's picture in the biggest size available.
- **Playlists:** paste a YouTube playlist link and tick the videos you want. They are saved in a folder named after the playlist.
- **Captions:** choose a language, then **In the video** (turn on/off in the player), **Always visible** (always on screen, takes longer) or **Separate .srt file**.
- **Several downloads at once:** they queue up and run 3 at a time (changeable in Settings).
- Closing the window keeps the app running near the clock (system tray) so it can keep catching links. Right-click the icon → **Quit** to close it completely.
- **Settings → Accounts:** if an Instagram/Facebook/TikTok/X video says "needs you to be logged in", log in there once.

### If something doesn't work

| Message | What to do |
| --- | --- |
| *YouTube is asking to confirm you are not a robot* | Wait a few minutes and try again. Restarting the internet router usually fixes it. |
| *This site needs you to be logged in* | Settings → Accounts → Log in to that site. |
| *The site changed something…* | The app updates its download engine automatically. Try again in a minute, or Settings → Download engine → **Update now**. |
| *This video is private / not available / protected (DRM)* | That video cannot be downloaded (Netflix, Prime, Spotify, private videos…). |
| Antivirus warning | Some antiviruses wrongly flag download tools. The app is open source; you can allow it. |

The app keeps a log at `%APPDATA%\Video Downloader\logs\main.log` (useful when asking for help).

---

## What it can and cannot do

| Feature | Status | Notes |
| --- | --- | --- |
| Paste a link → details appear instantly → one-click download | ✅ | Title, channel, duration, thumbnail, every quality with file size |
| IDM-style link catching | ✅ | Watches the clipboard: copy a video link anywhere and the app offers it (works while minimised, with a notification) |
| HD thumbnail download | ✅ | Biggest size available (YouTube maxres 1280×720 when it exists); WebP is converted to JPG |
| 4K / 2K / 1080p / 720p … 144p | ✅ | Up to 1080p uses H.264 (plays everywhere). YouTube only offers 2K/4K as VP9, which plays in Windows 10/11, VLC and browsers |
| MP4 video and MP3 audio (320/192/128 kbps) | ✅ | MP3 gets the title and cover picture |
| Multi-connection turbo download (IDM-style) | ✅ | aria2 with up to 16 connections per file, live speed/ETA. Falls back to normal mode automatically if a site refuses |
| Parallel fragments for DASH/HLS streams | ✅ | 8 fragments at a time |
| Playlists, multi-video posts | ✅ | |
| Captions | ✅ | Inside the video (switchable), always visible (drawn on the picture), or `.srt`; English auto-translation for YouTube |
| Queue, cancel, retry, history | ✅ | Automatic retries for network hiccups; engine self-update when a site changes |
| Instagram / Facebook / TikTok / X private-ish content | ⚠️ | Works after logging in via Settings → Accounts |
| YouTube age-restricted videos | ❌ | Needs a signed-in YouTube account; Google blocks sign-in inside apps |
| DRM content (Netflix, Prime, Disney+, Spotify) | ❌ | Not possible, and not allowed |
| Live streams while they are live | ❌ | Download after the stream ends |

> Only download videos you own or have permission to keep. Respect each site's terms and copyright law.

---

## For the developer (macOS)

Everything is free. You need **Node.js 22.12+** (`brew install node`) and, optionally, Homebrew FFmpeg/aria2.

```bash
npm install
npm run setup          # downloads yt-dlp (+ uses Homebrew ffmpeg/aria2 if installed)
npm run dev            # opens the app with live reload
```

On macOS, install the helpers once for full features: `brew install ffmpeg aria2`.

**Use it as a normal Mac app:** run `npm run dist:mac`, open the `.dmg` in the `release` folder and drag **Video Downloader** into **Applications**. It is signed "ad-hoc" (free), so if you copy it to *another* Mac, open it there the first time with right-click → **Open**.

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server + Electron window |
| `npm run build` | Builds the UI (static export to `out/`) and the Electron main process |
| `npm start` | Runs the built app |
| `npm test` | Unit tests |
| `npm run test:integration` | Real downloads with yt-dlp/FFmpeg/aria2 against a local test server (no internet needed) |
| `npm run test:e2e` | Drives the real Electron app (paste, download, cancel, clipboard, settings) |
| `npm run lint` / `npm run typecheck` | Code checks |
| `npm run dist:win` | Builds the Windows installer (`release/Video-Downloader-Setup-*.exe`) |
| `npm run dist:mac` | Builds a `.dmg` for your Mac (unsigned) |

### Getting the installer for your friend

You don't need a Windows PC. There are two ways:

**A. Build it on your Mac (2 minutes):**

```bash
npm run dist:win
```

This downloads the official Windows versions of yt-dlp, FFmpeg and aria2 (from their GitHub releases), builds the app and creates `release/Video-Downloader-Setup-x.y.z.exe`. No Wine is needed on modern macOS.

**B. Let GitHub build and test it on a real Windows machine:** the workflow in `.github/workflows/build.yml` runs all tests on Windows, builds the installer and tests the installed app for every push to `main`.

> If the **Actions** tab shows runs that fail immediately with "startup failure", GitHub Actions is blocked for the account, not by the code. For private repositories this is usually billing: open **GitHub → Settings → Billing and plans** and make sure there is no payment problem, Actions minutes are left, and the spending limit is not $0 when minutes are used up (or make the repository public, which makes Actions free). Also check **repository → Settings → Actions → General → Allow all actions**. Then click **Re-run** on the latest run.

With GitHub Actions working:

- **Every push to `main`:** GitHub → **Actions** → latest "Build & test" run → download the **Video-Downloader-Windows-Setup** artifact (a zip containing the `.exe`).
- **Releases:** bump `"version"` in `package.json`, then push a tag:

  ```bash
  git tag v1.0.1
  ```

  ```bash
  git push origin v1.0.1
  ```

  When the run finishes, the installer is on the repository's **Releases** page.

Send the `.exe` to your friend (WhatsApp, Google Drive, USB…). If you make this repository **public**, the installed app will also update itself automatically from Releases (the download engine always updates itself either way).

### Updating your friend's app

1. Raise `"version"` in `package.json` (for example `1.1.0` → `1.2.0`) and run `npm run dist:win`.
2. Publish a GitHub release with **all three** files from `release/`: the `.exe`, the `.exe.blockmap` and `latest.yml`.
3. That's it: the installed app finds the update by itself (15 s after start, every 6 hours, or Settings → About → **Check now**), downloads it and asks to **Restart now**. Or send the new `.exe` and double-click it; it installs over the old one and keeps settings and history.

### How it works

```
Next.js UI (src/)  ──IPC──▶  Electron main process (electron/)
                              ├─ InfoService      yt-dlp -J  → title, formats, thumbnails
                              ├─ DownloadManager  queue, yt-dlp + aria2 + FFmpeg, progress, retries
                              ├─ Engine           finds bundled tools, keeps yt-dlp updated
                              ├─ ClipboardWatcher IDM-style link catching
                              └─ Accounts         optional site log-in → cookies for yt-dlp
```

- The UI is a static Next.js export served inside the app from `app://local/` (no web server, works offline).
- If a helper program is missing (for example an antivirus removed `yt-dlp.exe`), the app downloads it again from its official GitHub release on start, with a progress bar (yt-dlp and Deno are checksum-verified).
- YouTube needs a JavaScript runtime; the app reuses Electron's built-in Node.js (checked by a self-test at start), so nothing extra is installed. If that ever fails, it falls back to Deno.
- Downloads run in a temporary folder with plain ASCII names and are moved to the Downloads folder at the end, with safe file names (Urdu/Arabic/emoji titles are kept).
- aria2 does not report progress through a pipe, so the app reads aria2's control file every 0.7 s for live percent, speed and time left.

Project layout: `src/` UI · `electron/` desktop app · `electron/core/` engine (plain Node, fully tested) · `shared/` types · `tests/` unit + integration · `e2e/` app tests · `scripts/` build helpers.

## License

MIT, see [LICENSE](LICENSE). Bundled third-party programs are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
