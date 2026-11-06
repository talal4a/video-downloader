// IDM-style link catching: notices when a video link is copied anywhere on the computer.
import { EventEmitter } from 'node:events';
import { clipboard } from 'electron';
import { extractFirstUrl, isLikelyMediaUrl } from './core/urls';

export class ClipboardWatcher extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private lastText: string | null = null;
  private lastUrl = '';
  private busy = false;

  start(): void {
    if (this.timer) return;
    // Ignore whatever was already copied before the app started.
    this.lastText = null;
    void this.read().then((t) => {
      if (this.lastText === null) this.lastText = t;
    });
    this.timer = setInterval(() => void this.tick(), 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  private async read(): Promise<string> {
    try {
      return (await clipboard.readText()) ?? '';
    } catch {
      return '';
    }
  }

  private async tick(): Promise<void> {
    if (this.busy || this.lastText === null) return;
    this.busy = true;
    let text: string;
    try {
      text = await this.read();
    } finally {
      this.busy = false;
    }
    if (text === this.lastText) return;
    this.lastText = text;
    const url = extractFirstUrl(text);
    if (!url || !isLikelyMediaUrl(url) || url === this.lastUrl) return;
    this.lastUrl = url;
    this.emit('link', url);
  }
}
