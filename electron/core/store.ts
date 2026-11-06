import fs from 'node:fs';
import path from 'node:path';

/** Tiny JSON file store with atomic writes (survives crashes/power loss mid-write). */
export class JsonFile<T> {
  constructor(
    private readonly file: string,
    private readonly fallback: T,
  ) {}

  read(): T {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return structuredClone(this.fallback);
    }
  }

  write(value: T): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
      fs.renameSync(tmp, this.file);
    } catch {
      // Not fatal: settings/history just won't be remembered.
    }
  }
}

/** Debounce helper for frequent saves. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): ((...args: A) => void) & { flush: () => void } {
  let timer: NodeJS.Timeout | undefined;
  let lastArgs: A | undefined;
  const wrapped = (...args: A) => {
    lastArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...(lastArgs as A));
    }, ms);
  };
  wrapped.flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
      fn(...(lastArgs as A));
    }
  };
  return wrapped;
}
