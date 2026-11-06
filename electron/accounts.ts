// Optional log-in for sites that hide some videos behind an account (mainly Instagram).
// The person logs in inside a normal browser window; we hand the cookies to yt-dlp.
import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, session, type Session } from 'electron';
import type { AccountId, AccountInfo } from '../shared/types';
import { toNetscapeCookieFile } from './core/cookies';
import { safeParseUrl } from './core/urls';

interface AccountDef {
  id: AccountId;
  name: string;
  loginUrl: string;
  domains: string[];
  authCookie: string;
}

export const ACCOUNT_DEFS: AccountDef[] = [
  { id: 'instagram', name: 'Instagram', loginUrl: 'https://www.instagram.com/accounts/login/', domains: ['instagram.com'], authCookie: 'sessionid' },
  { id: 'facebook', name: 'Facebook', loginUrl: 'https://www.facebook.com/login/', domains: ['facebook.com'], authCookie: 'c_user' },
  { id: 'tiktok', name: 'TikTok', loginUrl: 'https://www.tiktok.com/login', domains: ['tiktok.com'], authCookie: 'sessionid' },
  { id: 'x', name: 'X (Twitter)', loginUrl: 'https://x.com/i/flow/login', domains: ['x.com', 'twitter.com'], authCookie: 'auth_token' },
];

function browserUserAgent(): string {
  const chrome = (process.versions.chrome ?? '140').split('.')[0];
  const platform =
    process.platform === 'win32'
      ? 'Windows NT 10.0; Win64; x64'
      : process.platform === 'darwin'
        ? 'Macintosh; Intel Mac OS X 10_15_7'
        : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome}.0.0.0 Safari/537.36`;
}

export class Accounts {
  private windows = new Map<AccountId, BrowserWindow>();

  constructor(
    private readonly cookieDir: string,
    private readonly parent: () => BrowserWindow | null,
  ) {}

  private ses(id: AccountId): Session {
    const s = session.fromPartition(`persist:acct-${id}`);
    s.setUserAgent(browserUserAgent());
    return s;
  }

  private def(id: AccountId): AccountDef {
    const d = ACCOUNT_DEFS.find((a) => a.id === id);
    if (!d) throw new Error(`Unknown account ${id}`);
    return d;
  }

  async isLoggedIn(id: AccountId): Promise<boolean> {
    const d = this.def(id);
    const cookies = await this.ses(id).cookies.get({ name: d.authCookie });
    return cookies.some((c) => c.value && d.domains.some((dom) => (c.domain ?? '').replace(/^\./, '').endsWith(dom)));
  }

  async list(): Promise<AccountInfo[]> {
    return Promise.all(ACCOUNT_DEFS.map(async (d) => ({ id: d.id, name: d.name, loggedIn: await this.isLoggedIn(d.id) })));
  }

  /** Opens a log-in window and resolves when it is closed (it closes itself once logged in). */
  login(id: AccountId): Promise<void> {
    const existing = this.windows.get(id);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return new Promise((resolve) => existing.once('closed', () => resolve()));
    }
    const d = this.def(id);
    const parent = this.parent() ?? undefined;
    const win = new BrowserWindow({
      width: 480,
      height: 720,
      parent,
      modal: false,
      title: `Log in to ${d.name}`,
      autoHideMenuBar: true,
      webPreferences: { session: this.ses(id), contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    this.windows.set(id, win);
    win.webContents.setWindowOpenHandler(({ url }) => {
      // Keep log-in pop-ups (e.g. "Log in with Facebook") inside the same window.
      void win.loadURL(url);
      return { action: 'deny' };
    });
    void win.loadURL(d.loginUrl);
    let wasLoggedIn = false;
    const timer = setInterval(async () => {
      if (win.isDestroyed()) return;
      const ok = await this.isLoggedIn(id).catch(() => false);
      if (ok && !wasLoggedIn) {
        wasLoggedIn = true;
        // Give the site a moment to finish setting its cookies, then close.
        setTimeout(() => !win.isDestroyed() && win.close(), 2500);
      }
    }, 1500);
    return new Promise((resolve) => {
      win.once('closed', () => {
        clearInterval(timer);
        this.windows.delete(id);
        resolve();
      });
    });
  }

  async logout(id: AccountId): Promise<void> {
    await this.ses(id).clearStorageData();
    fs.rmSync(path.join(this.cookieDir, `${id}.txt`), { force: true });
  }

  /** Cookie file for the account matching this link, or undefined when not logged in. */
  async cookiesFileFor(url: string): Promise<string | undefined> {
    const u = safeParseUrl(url);
    if (!u) return undefined;
    const host = u.hostname.toLowerCase();
    const d = ACCOUNT_DEFS.find((a) => a.domains.some((dom) => host === dom || host.endsWith(`.${dom}`)));
    if (!d || !(await this.isLoggedIn(d.id))) return undefined;
    const cookies = await this.ses(d.id).cookies.get({});
    const relevant = cookies.filter((c) => d.domains.some((dom) => (c.domain ?? '').replace(/^\./, '').endsWith(dom)));
    fs.mkdirSync(this.cookieDir, { recursive: true });
    const file = path.join(this.cookieDir, `${d.id}.txt`);
    fs.writeFileSync(file, toNetscapeCookieFile(relevant), { mode: 0o600 });
    return file;
  }
}
