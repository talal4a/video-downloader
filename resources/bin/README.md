This folder is filled by `npm run setup` (scripts/fetch-binaries.mjs) with the free tools the app bundles:

- `yt-dlp` — the download engine (public domain / Unlicense)
- `ffmpeg` + `ffprobe` — merging HD video with audio and MP3 conversion (GPL)
- `aria2c` — multi-connection "turbo" downloads (GPL)

The files are not committed to git. The Windows build on GitHub Actions downloads them automatically.
