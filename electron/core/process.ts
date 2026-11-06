import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

export interface RunOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  onLine?: (line: string, stream: 'stdout' | 'stderr') => void;
  /** Collect full stdout (for -J JSON output). */
  collectStdout?: boolean;
  timeoutMs?: number;
}

export interface RunHandle {
  child: ChildProcess;
  done: Promise<RunResult>;
  kill: () => void;
}

export interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  /** Last ~64KB of combined output, for error messages. */
  tail: string;
  timedOut: boolean;
  killed: boolean;
  spawnError?: Error;
}

const TAIL_LIMIT = 64 * 1024;

/** Kill a process and all of its children (yt-dlp starts ffmpeg/aria2c/node). */
export function killTree(child: ChildProcess): void {
  const pid = child.pid;
  if (!pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    try {
      const k = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      k.on('error', () => child.kill());
    } catch {
      child.kill();
    }
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  setTimeout(() => {
    if (child.exitCode === null) {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }
  }, 3000).unref();
}

export function run(cmd: string, args: string[], opts: RunOptions = {}): RunHandle {
  const spawnOpts: SpawnOptions = {
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    windowsHide: true,
    // On macOS/Linux, start a new process group so the whole tree can be killed.
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  };
  let child: ChildProcess;
  let killed = false;
  let timedOut = false;
  const stdoutChunks: Buffer[] = [];
  let tail = '';
  let spawnError: Error | undefined;

  try {
    child = spawn(cmd, args, spawnOpts);
  } catch (err) {
    const e = err as Error;
    const fake = { pid: undefined, exitCode: 1 } as unknown as ChildProcess;
    return {
      child: fake,
      kill: () => {},
      done: Promise.resolve({
        code: null,
        signal: null,
        stdout: '',
        tail: e.message,
        timedOut: false,
        killed: false,
        spawnError: e,
      }),
    };
  }

  const pushTail = (s: string) => {
    tail += s;
    if (tail.length > TAIL_LIMIT) tail = tail.slice(-TAIL_LIMIT);
  };

  const lineSplitter = (stream: 'stdout' | 'stderr') => {
    let buf = '';
    return (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (stream === 'stderr' || !opts.collectStdout) pushTail(text);
      if (!opts.onLine) return;
      buf += text;
      const parts = buf.split(/\r\n|\n|\r/);
      buf = parts.pop() ?? '';
      for (const line of parts) if (line) opts.onLine(line, stream);
    };
  };

  const onStdout = lineSplitter('stdout');
  child.stdout?.on('data', (chunk: Buffer) => {
    if (opts.collectStdout) stdoutChunks.push(chunk);
    onStdout(chunk);
  });
  child.stderr?.on('data', lineSplitter('stderr'));

  let timer: NodeJS.Timeout | undefined;
  const kill = () => {
    if (killed) return;
    killed = true;
    killTree(child);
  };
  if (opts.timeoutMs) {
    timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, opts.timeoutMs);
  }

  const done = new Promise<RunResult>((resolve) => {
    child.on('error', (err) => {
      spawnError = err;
    });
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({
        code,
        signal,
        stdout: opts.collectStdout ? Buffer.concat(stdoutChunks).toString('utf8') : '',
        tail: spawnError ? `${tail}\n${spawnError.message}` : tail,
        timedOut,
        killed,
        spawnError,
      });
    });
  });

  return { child, done, kill };
}

/** Run a command and return its trimmed stdout, or null if it fails. */
export async function runForOutput(
  cmd: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
  timeoutMs = 30000,
): Promise<string | null> {
  const h = run(cmd, args, { env, collectStdout: true, timeoutMs });
  const r = await h.done;
  if (r.spawnError || r.code !== 0) return null;
  return r.stdout.trim();
}
