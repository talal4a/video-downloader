import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Video Downloader',
  description: 'Download videos, MP3 audio and thumbnails from YouTube, Instagram, TikTok, Facebook and 1000+ sites.',
};

// Applies the saved/system theme before the page paints (avoids a white flash in dark mode).
const themeScript = `(function(){try{var t=localStorage.getItem('vd-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
