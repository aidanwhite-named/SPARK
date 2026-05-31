import { spawn, SpawnOptions, ChildProcess } from 'child_process';

function quoteArgs(command: string, args: string[]): string {
  const parts = [command, ...args].map((arg) =>
    /[ \t"'`]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg
  );
  return parts.join(' ');
}

export interface RunOptions {
  timeout?: number;
  idleTimeout?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  maxLines?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdinData?: string;
  shell?: boolean;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class CLIExecutor {
  private terminate(child: ChildProcess, reason: string) {
    if (child.killed) return;
    console.warn(`[CLI] terminating pid=${child.pid ?? 'unknown'}: ${reason}`);

    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      return;
    }

    child.kill('SIGTERM');
  }

  async run(
    command: string,
    args: string[],
    options: RunOptions = {}
  ): Promise<RunResult> {
    const {
      timeout = 120_000,
      idleTimeout = 30_000,
      maxStdoutBytes = 2_000_000,
      maxStderrBytes = 200_000,
      cwd = process.cwd(),
      env = process.env,
      stdinData,
      shell,
    } = options;
    const useShell = shell ?? process.platform === 'win32';

    return new Promise((resolve, reject) => {
      const spawnOpts: SpawnOptions = {
        cwd,
        env,
        shell: useShell,
        stdio: ['pipe', 'pipe', 'pipe'],
      };

      const [spawnCmd, spawnArgs] = useShell
        ? [quoteArgs(command, args), [] as string[]]
        : [command, args];

      const t0 = Date.now();
      const label = `[CLI:run] ${command}`;
      console.log(`${label} spawn (stdin ${stdinData ? `${stdinData.length} bytes` : 'none'})`);

      const child = spawn(spawnCmd, spawnArgs, spawnOpts);

      if (stdinData && child.stdin) {
        child.stdin.write(stdinData, 'utf8');
        child.stdin.end();
      } else if (child.stdin) {
        child.stdin.end();
      }

      let stdout = '';
      let stderr = '';
      let firstData = false;
      let settled = false;
      let idleTimer: NodeJS.Timeout;
      let timer: NodeJS.Timeout;

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(idleTimer);
        this.terminate(child, err.message);
        reject(err);
      };

      const resetIdleTimer = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          fail(new Error(`CLI idle timeout after ${idleTimeout}ms: ${command} ${args.join(' ')}`));
        }, idleTimeout);
      };

      idleTimer = setTimeout(() => {
        fail(new Error(`CLI idle timeout after ${idleTimeout}ms: ${command} ${args.join(' ')}`));
      }, idleTimeout);

      child.stdout?.on('data', (data: Buffer) => {
        resetIdleTimer();
        if (!firstData) {
          firstData = true;
          console.log(`${label} first output at +${Date.now() - t0}ms`);
        }
        stdout += data.toString('utf8');
        if (stdout.length > maxStdoutBytes) {
          fail(new Error(`CLI stdout limit exceeded (${maxStdoutBytes} bytes): ${command}`));
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        resetIdleTimer();
        stderr += data.toString('utf8');
        if (stderr.length > maxStderrBytes) {
          fail(new Error(`CLI stderr limit exceeded (${maxStderrBytes} bytes): ${command}`));
        }
      });

      timer = setTimeout(() => {
        fail(new Error(`CLI timeout after ${timeout}ms: ${command} ${args.join(' ')}`));
      }, timeout);

      child.on('close', (exitCode) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(idleTimer);
        console.log(`${label} done in ${Date.now() - t0}ms (exit ${exitCode}, stdout ${stdout.length} bytes)`);
        if (exitCode !== 0 && !stdout) {
          reject(new Error(`CLI error (exit ${exitCode}): ${stderr || 'Unknown error'}`));
        } else {
          resolve({ stdout, stderr, exitCode: exitCode ?? 0 });
        }
      });

      child.on('error', (err) => {
        fail(new Error(`CLI spawn error: ${err.message}\nCommand: ${command}`));
      });
    });
  }

  async stream(
    command: string,
    args: string[],
    onLine: (line: string) => void,
    options: RunOptions = {}
  ): Promise<void> {
    const {
      timeout = 300_000,
      idleTimeout = 45_000,
      maxStdoutBytes = 4_000_000,
      maxStderrBytes = 200_000,
      maxLines = 20_000,
      cwd = process.cwd(),
      env = process.env,
      stdinData,
      shell,
    } = options;
    const useShell = shell ?? process.platform === 'win32';

    return new Promise((resolve, reject) => {
      const spawnOpts: SpawnOptions = {
        cwd,
        env,
        shell: useShell,
        stdio: ['pipe', 'pipe', 'pipe'],
      };

      const [spawnCmd, spawnArgs] = useShell
        ? [quoteArgs(command, args), [] as string[]]
        : [command, args];

      const t0 = Date.now();
      const label = `[CLI:stream] ${command}`;
      console.log(`${label} spawn (stdin ${stdinData ? `${stdinData.length} bytes` : 'none'})`);

      const child = spawn(spawnCmd, spawnArgs, spawnOpts);

      if (stdinData && child.stdin) {
        child.stdin.write(stdinData, 'utf8');
        child.stdin.end();
      } else if (child.stdin) {
        child.stdin.end();
      }

      let buffer = '';
      let lineCount = 0;
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let firstData = false;
      let settled = false;
      let idleTimer: NodeJS.Timeout;
      let timer: NodeJS.Timeout;

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(idleTimer);
        this.terminate(child, err.message);
        reject(err);
      };

      const resetIdleTimer = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          fail(new Error(`CLI stream idle timeout after ${idleTimeout}ms: ${command}`));
        }, idleTimeout);
      };

      idleTimer = setTimeout(() => {
        fail(new Error(`CLI stream idle timeout after ${idleTimeout}ms: ${command}`));
      }, idleTimeout);

      child.stdout?.on('data', (data: Buffer) => {
        resetIdleTimer();
        stdoutBytes += data.length;
        if (stdoutBytes > maxStdoutBytes) {
          fail(new Error(`CLI stream stdout limit exceeded (${maxStdoutBytes} bytes): ${command}`));
          return;
        }

        if (!firstData) {
          firstData = true;
          console.log(`${label} first output at +${Date.now() - t0}ms`);
        }

        buffer += data.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          lineCount++;
          if (lineCount > maxLines) {
            fail(new Error(`CLI stream line limit exceeded (${maxLines} lines): ${command}`));
            return;
          }
          try {
            onLine(line);
          } catch (err) {
            fail(err instanceof Error ? err : new Error(String(err)));
            return;
          }
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        resetIdleTimer();
        stderrBytes += data.length;
        if (stderrBytes > maxStderrBytes) {
          fail(new Error(`CLI stream stderr limit exceeded (${maxStderrBytes} bytes): ${command}`));
          return;
        }
        console.error('[CLI stderr]', data.toString('utf8'));
      });

      timer = setTimeout(() => {
        fail(new Error(`CLI stream timeout after ${timeout}ms`));
      }, timeout);

      child.on('close', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(idleTimer);

        if (buffer.trim()) {
          lineCount++;
          try {
            onLine(buffer);
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
            return;
          }
        }

        console.log(`${label} done in ${Date.now() - t0}ms (${lineCount} lines)`);
        resolve();
      });

      child.on('error', (err) => {
        fail(new Error(`CLI stream error: ${err.message}`));
      });
    });
  }
}
