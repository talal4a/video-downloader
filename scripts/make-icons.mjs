// Renders the app icons (build/icon.png, tray icons) from SVG using Playwright's Chromium.
// Run: npm run icons   (only needed when the design changes; the PNGs are committed)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const out = path.resolve('build');
fs.mkdirSync(out, { recursive: true });

const appIcon = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c5cff"/><stop offset="0.55" stop-color="#6d4dff"/><stop offset="1" stop-color="#d946ef"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="24" y="24" width="464" height="464" rx="112" fill="url(#g)"/>
  <rect x="24" y="24" width="464" height="464" rx="112" fill="url(#shine)"/>
  <path d="M256 112 v190" stroke="#fff" stroke-width="52" stroke-linecap="round"/>
  <path d="M168 222 l88 92 l88 -92" fill="none" stroke="#fff" stroke-width="52" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M136 372 h240" stroke="#fff" stroke-width="44" stroke-linecap="round" opacity="0.92"/>
</svg>`;

const trayTemplate = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <path d="M16 4 v15" stroke="#000" stroke-width="4" stroke-linecap="round"/>
  <path d="M9 13 l7 7 l7 -7" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M7 27 h18" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>
</svg>`;

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function render(svg, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.locator('svg').screenshot({ path: path.join(out, file), omitBackground: true });
  console.log('wrote', file);
}
await render(appIcon(1024), 1024, 'icon.png');
await render(appIcon(256), 256, 'icon-256.png');
await render(appIcon(32), 32, 'tray.png');
await render(appIcon(64), 64, 'tray@2x.png');
await render(trayTemplate(16), 16, 'trayTemplate.png');
await render(trayTemplate(32), 32, 'trayTemplate@2x.png');
await browser.close();
