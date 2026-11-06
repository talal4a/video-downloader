# Download engine

How a link becomes a file. Code: `electron/core/` (plain Node.js, no Electron, so it is fully tested).

## Helper programs

| Program | Job | License |
| --- | --- | --- |
| yt-dlp | Reads the video page, lists formats, downloads | Unlicense (public domain) |
| FFmpeg + FFprobe | Joins HD video with audio, MP3 conversion, cover art, thumbnail conversion | GPL |
| aria2 | Turbo mode: up to 16 connections per file | GPL |
| Electron's own Node.js | Solves YouTube's JavaScript challenges for yt-dlp (no extra download) | MIT |
| Deno (only if needed) | Backup JavaScript runtime for YouTube | MIT |

`engine.ts` finds them in this order: test overrides (`VD_YTDLP`, `VD_FFMPEG_DIR`, `VD_ARIA2C`), the installer's `resources/bin`, the app's own `bin` folder, then the system `PATH` (plus `/opt/homebrew/bin` and `/usr/local/bin` on Mac).

- yt-dlp is copied from the installer into the app's data folder so it can update itself even when the app is installed in a protected folder. A newer bundled copy replaces an older one.
- **Self-repair:** if yt-dlp, FFmpeg or aria2 (Windows) is missing, `toolsetup.ts` downloads it from the official GitHub release on start. yt-dlp is checked against its `SHA2-256SUMS` file; Deno against its `.sha256sum` file. Zips are opened with a small built-in extractor (`unzip.ts`) that refuses `../` paths.
- **YouTube runtime self-test:** at start the app runs itself as Node.js (`ELECTRON_RUN_AS_NODE=1 … --permission -`) with a tiny script, exactly as yt-dlp will. If that fails it uses Deno, then a system Node.js 22+, and downloads Deno only as a last resort.

## Getting video details

`info.ts` runs:

```
yt-dlp -J --flat-playlist --no-playlist --no-warnings [--cookies file] -- <link>
```

- Links are cleaned first: `https://` is added, `youtu.be/…` works, a channel page goes to its **Videos** tab.
- The JSON is turned into a `MediaInfo`: title, channel, site, length, views, thumbnails (best first), qualities with sizes, subtitles, live flag, playlist entries.
- Cached for 10 minutes. Time limit 120 s.
- On "site changed" errors (`extractor`, `http_403`) the engine updates yt-dlp once (at most every 10 minutes) and tries again. Network errors are retried once after 1.5 s.

## Quality rules

| Choice | yt-dlp command |
| --- | --- |
| Video, chosen quality | `-f "bv*+ba/b" -S "res:<value>,vcodec:h264,acodec:aac" --merge-output-format mp4 --remux-video mp4` |
| Video, Best | `-S "res,vcodec:h264,acodec:aac"` (highest resolution first) |
| MP3 | `-f "ba/b" --extract-audio --audio-format mp3 --audio-quality 320K\|192K\|128K --embed-thumbnail --convert-thumbnails jpg` |
| Captions | `--write-subs` or `--write-auto-subs --sub-langs <lang> --convert-subs srt`, plus `--embed-subs` for "In the video" |

- Up to 1080p the app picks **H.264 + AAC in MP4**, which plays everywhere.
- YouTube only offers 2K and 4K as VP9 or AV1; the app then picks **VP9** (better support than AV1). VP9 MP4 plays in VLC, IINA, Windows Media Player and browsers, but **not in QuickTime** on Mac.
- "Value" is the short side of the picture (yt-dlp's `res`), so vertical and cinema-shaped videos get the right label. Size estimates add the best AAC audio to the video size.

## Downloading

Every download gets its own temporary folder `<temp>/VideoDownloader/<job id>-<attempt>` with plain ASCII names (`media.mp4`, or `001.mp4`, `002.mp4` for multi-video posts). Common options:

```
--ignore-config --color never --encoding utf-8 --cache-dir <app>/cache
--ffmpeg-location <ffmpeg folder> --no-js-runtimes --js-runtimes node:<app exe>
--socket-timeout 30 --retries 10 --fragment-retries 10 --extractor-retries 3
--newline --progress --progress-template … --ignore-errors --no-mtime
--embed-metadata --concurrent-fragments 8 --no-playlist|--yes-playlist
```

**Turbo mode** (on by default, needs aria2):

```
--downloader aria2c --downloader m3u8,dash:native
--downloader-args "aria2c:-x 16 -s 16 -k 1M --auto-save-interval=1"
```

Normal files are split over up to 16 connections; streamed formats (DASH/HLS) use 8 parallel fragments in yt-dlp itself.

## Live progress

- yt-dlp prints one JSON line per update (`VDPROG {...}`): bytes done, total, speed, time left, format, item number.
- Post-processing prints `VDPP "<step>" "started"`, shown in plain words (Merger → "Joining video and audio…").
- aria2 keeps its own output until it ends, so in turbo mode the app reads aria2's control file (`*.aria2`, rewritten every second) every 0.7 s (`aria2.ts`) for bytes done, total, smoothed speed and time left.
- The bar is shared: video stream 0-92 %, audio stream 92-100 %; for several videos, item N of M. It never moves backwards.

## Retries and safe mode

| Problem | What happens (max 3 tries) |
| --- | --- |
| Turbo download failed | Try again without aria2 ("Retrying in normal mode…") |
| Site changed / 403 / format missing | Update yt-dlp once, then try again |
| Network, timeout, rate limit, unknown | Wait 4 s × try number, then try again |
| Cover art, subtitles or metadata failed | "Safe mode": try again without these extras, keep the video, show a warning |
| Private, removed, DRM, unsupported… | Stop at once with the plain message |

If at least one finished file exists, the download counts as done.

## Captions

| Mode | How |
| --- | --- |
| In the video (`embed`) | yt-dlp puts the captions in the MP4 as a `mov_text` track. FFprobe checks the track is there; then the extra `.srt` is deleted. If it is missing, the `.srt` is kept with a warning |
| Always visible (`burn`) | After the download, FFmpeg draws the `.srt` onto the picture: `-vf subtitles=captions-1.srt:fontsdir=fonts:force_style='FontName=Arial' -c:v libx264 -preset veryfast -crf 20 -c:a copy`. It runs inside the job folder with simple names (no Windows path escaping problems) and gets a copy of the system font (Arial on Windows/Mac, DejaVu Sans on Linux) so text always shows. Progress comes from `-progress pipe:1`. Cancel stops it. On failure the original video and `.srt` are kept with a warning |
| Separate file (`file`) | The `.srt` is saved as `Title.<lang>.srt` |

- Languages: the video's own captions, auto-generated captions in the original language (`<lang>-orig`), and **English (auto-translated)** when YouTube offers it and there is no English track.
- If captions fail (for example YouTube refuses them), "safe mode" saves the video without them and says so.

## Saving files

- Finished files are moved to the download folder (default **Downloads → Video Downloader**), in a sub-folder for playlists.
- Names come from the title, made safe for Windows: `< > : " / \ | ? *` and control characters are replaced, names like `CON` are prefixed, length is capped at 120 characters. Urdu, Arabic and emoji are kept.
- Never overwrites: `Title.mp4`, `Title (1).mp4`, `Title (2).mp4`…
- Subtitles are saved as `Title.<lang>.srt`. Thumbnails as `Title - thumbnail.jpg`.
- Moving across drives falls back to copy + delete. The temporary folder is removed afterwards and cleaned on every start.

## Thumbnails

- Candidates, best first: for YouTube `maxresdefault.jpg` and `hq720.jpg`, then yt-dlp's list sorted by preference and size, then smaller YouTube sizes. Relative links are made absolute.
- The first real image wins (tiny placeholders under 1.2 KB and 404s are skipped). The picture type is read from the bytes.
- JPG and PNG are kept; WebP, AVIF, GIF and HEIC are converted to high-quality JPG with FFmpeg.

## Keeping yt-dlp fresh

- 8 s after start and every 3 hours, if more than 20 hours passed since the last check and no download is running: `yt-dlp --update-to stable`.
- Also on demand (**Update now**) and automatically after "site changed" errors.
- Result is stored in `engine.json` and shown in Settings.

## Stopping a download

- **Cancel** stops yt-dlp and everything it started: `taskkill /T /F` on Windows, the whole process group on Mac/Linux.
- Helper windows are always hidden (no black console windows on Windows).
