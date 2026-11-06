// Builds docs/Video-Downloader-Docs.pdf from the Markdown files in docs/.
// Run: npm run docs   (uses Playwright's Chromium: `npx playwright install chromium` once)
import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { chromium } from 'playwright';

const docsDir = path.resolve('docs');
const files = ['README.md', ...fs.readdirSync(docsDir).filter((f) => /^\d\d-.*\.md$/.test(f)).sort()];
const idOf = (file) => (file === 'README.md' ? 'index' : file.replace(/\.md$/, ''));

const sections = files.map((file) => {
  const md = fs.readFileSync(path.join(docsDir, file), 'utf8');
  let html = marked.parse(md, { gfm: true });
  // Links between the Markdown files become links inside the PDF.
  html = html.replace(/href="(\d\d-[\w-]+)\.md"/g, (_m, name) => `href="#${name}"`);
  return `<section id="${idOf(file)}">${html}</section>`;
});

const css = `
@page { size: A4; margin: 18mm 17mm 20mm 17mm; }
* { box-sizing: border-box; }
body { font-family: Arial, "Liberation Sans", Helvetica, sans-serif; color: #18213a; font-size: 10.6pt; line-height: 1.5; margin: 0; }
section { break-before: page; }
section:first-child { break-before: auto; }
h1 { font-size: 22pt; color: #0b1530; margin: 0 0 12pt; padding-bottom: 8pt; border-bottom: 2.5pt solid #0b1530; }
h2 { font-size: 14.5pt; color: #1f3a8a; margin: 18pt 0 8pt; break-after: avoid; }
h3 { font-size: 12pt; color: #1f3a8a; margin: 14pt 0 6pt; break-after: avoid; }
p { margin: 6pt 0; }
ul, ol { margin: 6pt 0 6pt 0; padding-left: 20pt; }
li { margin: 3pt 0; }
a { color: #1f3a8a; text-decoration: underline; }
code { font-family: "DejaVu Sans Mono", Menlo, Consolas, monospace; font-size: 8.8pt; background: #eef1f7; border-radius: 3pt; padding: 1pt 4pt; color: #0f1b3d; }
pre { background: #f2f4f9; border: 0.6pt solid #d6dcea; border-radius: 4pt; padding: 8pt 10pt; white-space: pre-wrap; break-inside: avoid; }
pre code { background: none; padding: 0; font-size: 8.4pt; }
table { width: 100%; border-collapse: collapse; margin: 8pt 0 10pt; font-size: 9.2pt; }
th { background: #e3e8f4; text-align: left; font-weight: bold; }
th, td { border: 0.6pt solid #cfd6e4; padding: 5pt 7pt; vertical-align: top; }
tr { break-inside: avoid; }
blockquote { margin: 10pt 0; padding: 6pt 10pt; border-left: 3pt solid #1f3a8a; background: #f2f4f9; }
strong { color: #0b1530; }
`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Video Downloader docs</title><style>${css}</style></head><body>${sections.join('\n')}</body></html>`;
const outHtml = path.join(docsDir, '.docs.html');
fs.writeFileSync(outHtml, html);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
await page.goto(`file://${outHtml}`);
await page.pdf({
  path: path.join(docsDir, 'Video-Downloader-Docs.pdf'),
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate:
    '<div style="width:100%;text-align:center;font-family:Arial,sans-serif;font-size:7.5pt;color:#6b7280;">Video Downloader docs · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  margin: { top: '18mm', bottom: '20mm', left: '17mm', right: '17mm' },
});
await browser.close();
fs.rmSync(outHtml, { force: true });
console.log('wrote docs/Video-Downloader-Docs.pdf');
