# Product and screens

What a person sees and can do in Video Downloader, screen by screen.

## What Video Downloader is

- A desktop app for Windows (and macOS) that saves online videos to the computer.
- Paste or copy a link; the app shows the video and every quality; one click downloads it.
- Free and open source. No account, no ads, no paid services. Powered by yt-dlp, FFmpeg and aria2.

## Supported sites

YouTube (videos, Shorts, playlists, channels), Instagram (posts, reels, stories), TikTok, Facebook, X (Twitter), Vimeo, Dailymotion, Reddit, Twitch, SoundCloud, Pinterest, LinkedIn, Threads, Bilibili, Rumble, Streamable, Bandcamp, VK, OK.ru and 1000+ more (everything yt-dlp supports), plus direct links to media files (`.mp4`, `.m3u8`, `.mpd`, `.mp3`…).

## Main screen

| Part | What it does |
| --- | --- |
| Header | Logo, engine status chip (**Ready**, **Setting up…**, **Updating engine…** or **Problem**), **Settings** button |
| Link box | "Paste a video link here". Pasting a link loads it straight away. **Paste** reads the clipboard; **Get video** loads what is typed; **×** clears |
| "Works with" chips | The best-known supported sites |
| First-time steps | Three cards (copy a link, paste it, pick quality) shown until the first download |
| Video card | Appears when a link is loaded (see below) |
| Downloads list | Every download with live progress and actions (see below) |

- **Ctrl+V / Cmd+V** anywhere on the page (outside a text box) loads a copied link.
- **Drag and drop** a link (from a browser address bar) onto the window loads it.
- **Right-click** in the link box gives Cut / Copy / Paste / Select all. Right-clicking a link gives **Download this link**.
- While loading, a skeleton card shows "Getting video details from <site>…".

## Video card (single video)

- Big thumbnail with duration and its real size (for example `1280×720`), site badge, title, channel, length, views and **Open page**.
- **Save thumbnail (HD)** saves the biggest picture available as JPG (WebP is converted).
- **Video (MP4)** or **Audio (MP3)** switch. Video is greyed out for audio-only links.
- **Quality chips** list only what the video really has: 8K, 4K, 2K, 1080p (Full HD), 720p (HD), 480p, 360p, 240p, 144p, each with an estimated size. The top one has a **Best** badge. Vertical videos (Shorts, Reels) are labelled by their short side, so 1080×1920 is "1080p".
- The default choice is the best quality up to the setting **Default video quality** (1080p unless changed).
- **MP3 quality**: 320 kbps (Best), 192 kbps (Good), 128 kbps (Small), with estimated sizes.
- **Captions** (video only): pick a language, an auto-generated track, or **English (auto-translated)** for YouTube videos in other languages. Then choose how to add them:
  - **In the video** (default, fast): a captions track inside the MP4 that can be switched on/off in VLC, QuickTime, Windows Media Player…
  - **Always visible**: drawn onto the picture, so they show everywhere, also when the video is shared on WhatsApp. The video is re-encoded (H.264), which takes longer; progress shows "Adding captions to the video… 45%".
  - **Separate .srt file**: saved next to the video.
  - The last choice is remembered. Videos without captions show "No captions available for this video." The button then reads "Download MP4 · 1080p · CC".
- A watch link that is part of a playlist shows "This video is part of a playlist. **Show whole playlist →**".
- Live streams and premieres that have not started show a note instead of the download button.
- The big button reads "Download MP4 · 1080p" or "Download MP3 · 320 kbps" with "About 241 MB". After clicking it shows "Added to downloads" and the page scrolls to the list.

## Playlist and multi-video posts

- **Playlists / channels** (each item is its own link): list of items with check boxes, **Select all / None**, kind (MP4/MP3) and quality (**Best** or a maximum such as 1080p, "or lower if missing"). Each item becomes its own download and is saved in a folder named after the playlist. A channel link opens its **Videos** tab.
- **Posts with several videos** (Instagram carousel, a page with several clips): downloaded in one go as `Title - 01.mp4`, `Title - 02.mp4`…
- Up to 400 items are shown; more are still included.

## Downloads list

| State | What it shows |
| --- | --- |
| Waiting in line | Queued (3 at a time by default) |
| Starting / retrying | "Starting…", "Retrying in normal mode…", "Updating the download engine…", "Connection problem — retrying…" |
| Downloading | Progress bar, percent, "Downloading video / audio", "12 MB of 80 MB", speed, time left, **Turbo** badge |
| Processing | Green moving bar: "Joining video and audio…", "Converting to MP3…", "Adding captions…", "Adding captions to the video… 45%", "Adding cover picture…" |
| Saved | Green tick and file name; **Play**, **Show in folder** |
| Failed | Plain message and hint, **Show technical details**, **Retry** |
| Canceled | **Retry** |

- Header: number of active downloads, **Open folder**, **Clear finished**.
- **×** cancels a running download (all helper programs are stopped, temporary files removed). The bin icon removes an item from the list; the file stays on disk.
- The format line shows captions too, for example "MP4 · 1080p · Captions (in video)".
- Warnings in amber, for example "Captions are not available for this video, so it was saved without them." or "The cover picture could not be added to this MP3."
- The list is kept between restarts (last 500). Downloads running when the app was closed show "The download stopped because the app was closed" with **Retry**.
- Windows taskbar icon shows the overall progress.

## IDM-style link catching

- While the app runs it checks the clipboard every second.
- When a video link is copied anywhere (browser, WhatsApp, YouTube app…):
  - nothing on screen yet: the app loads it at once;
  - something already on screen: a banner "You copied a video link: youtube.com" with **Get this video** / **Dismiss**;
  - window hidden or not focused: a notification "Video link copied — Click here to download it."
- Only real video links count (a YouTube home page or an Instagram profile does not).
- Can be turned off in Settings or from the tray menu.

## Tray, notifications and closing

- Closing the window keeps the app running near the clock (system tray) so it can catch links and finish downloads. The first time, a notification explains this.
- Tray menu: **Open Video Downloader**, **Download link from clipboard**, **Open downloads folder**, **Catch copied video links** (on/off), **Quit**.
- With "Keep running in the background" off, closing during downloads asks "Downloads are still running. Keep downloading / Quit anyway".
- Notifications when a download finishes or fails (when the window is not focused). Clicking "Download complete" shows the file.
- Only one copy of the app runs; opening it again brings the window to the front.

## Settings panel

| Group | Options |
| --- | --- |
| Downloads | Save folder (**Change…**, **Open**), default video quality (Best, 4K, 2K, 1080p, 720p, 480p, 360p), start with Video or Audio, downloads at the same time (1-5), **Turbo mode** with 4 / 8 / 16 connections |
| Convenience | Catch copied video links, keep running in the background, start with the computer, notifications, appearance (Auto / Light / Dark) |
| Accounts (optional) | Log in / Log out for Instagram, Facebook, TikTok, X (see [Desktop app and API](04-desktop-app-and-api.md)) |
| Download engine | yt-dlp version, FFmpeg, aria2 turbo, YouTube helper (built-in / Deno / Node.js) status, last update check, **Update automatically every day**, **Update now** |
| About | App version, app update status (**Restart to update** when ready), project link |

Escape or a click outside closes the panel.

## First start

- If a helper program is missing (an installer built without them, or an antivirus removed one), a banner "Getting ready for first use — this happens only once" downloads it with a progress bar: yt-dlp, FFmpeg, aria2 (Windows) and, only if needed, Deno.
- If that fails: a red banner names what is missing with a **Fix it** button.

## Error messages

| Situation | Message |
| --- | --- |
| YouTube bot check | "YouTube is asking to confirm you are not a robot." Wait, or restart the router |
| Login needed | "This site needs you to be logged in to get this video." → **Open Accounts** |
| Private / removed / blocked | "This video is private." / "…not available…" / "…blocked in your country." |
| Age-restricted | "This video is age-restricted and needs a signed-in account." |
| DRM (Netflix, Spotify…) | "This video is protected (DRM) and cannot be downloaded." |
| Not a video page | "This link isn't supported." / "No video was found at this link." |
| Network / slow | "Can't connect to the site." / "The connection is too slow or timed out." |
| Site changed | "The site changed something…"; the engine updates itself and retries |
| Disk / folder | "Your disk is full." / "The app can't write to the download folder." |

Every error also has **Technical details** with the original yt-dlp message.

## Appearance

- Light and dark themes (Auto follows the computer). Purple brand colour, rounded cards, system font (Segoe UI on Windows).
- Window 1180×840, smallest 860×620.
