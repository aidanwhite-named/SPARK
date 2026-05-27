import { spawn, SpawnOptions } from 'child_process';

export interface RunOptions {
  timeout?: number;        // ms
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// ─────────────────────────────────────────────────────────────
// CLI Executor
// child_process.spawn 기반으로 CLI를 실행하고 결과를 수집
// ─────────────────────────────────────────────────────────────
export class CLIExecutor {

  // ── 단일 실행 (결과를 모아서 반환) ──────────────────────────
  async run(
    command: string,
    args: string[],
    options: RunOptions = {}
  ): Promise<RunResult> {
    const { timeout = 120_000, cwd = process.cwd(), env = process.env } = options;

    return new Promise((resolve, reject) => {
      const spawnOpts: SpawnOptions = {
        cwd,
        env,
        // Windows에서는 shell: true 필요
        shell: process.platform === 'win32',
      };

      const child = spawn(command, args, spawnOpts);

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString('utf8');
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString('utf8');
      });

      // 타임아웃 처리
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`CLI timeout after ${timeout}ms: ${command} ${args.join(' ')}`));
      }, timeout);

      child.on('close', (exitCode) => {
        clearTimeout(timer);
        if (exitCode !== 0 && !stdout) {
          reject(new Error(`CLI error (exit ${exitCode}): ${stderr || 'Unknown error'}`));
        } else {
          resolve({ stdout, stderr, exitCode: exitCode ?? 0 });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`CLI spawn error: ${err.message}\nCommand: ${command}`));
      });
    });
  }

  // ── 스트리밍 실행 (줄 단위로 콜백 호출) ────────────────────
  async stream(
    command: string,
    args: string[],
    onLine: (line: string) => void,
    options: RunOptions = {}
  ): Promise<void> {
    const { timeout = 300_000, cwd = process.cwd(), env = process.env } = options;

    return new Promise((resolve, reject) => {
      const spawnOpts: SpawnOptions = {
        cwd,
        env,
        shell: process.platform === 'win32',
      };

      const child = spawn(command, args, spawnOpts);

      let buffer = '';

      child.stdout?.on('data', (data: Buffer) => {
        buffer += data.toString('utf8');
        const lines = buffer.split('\n');
        // 마지막 줄은 아직 미완성일 수 있으므로 버퍼에 유지
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          onLine(line);
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        console.error('[CLI stderr]', data.toString('utf8'));
      });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`CLI stream timeout after ${timeout}ms`));
      }, timeout);

      child.on('close', () => {
        clearTimeout(timer);
        // 버퍼에 남은 내용 처리
        if (buffer.trim()) {
          onLine(buffer);
        }
        resolve();
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`CLI stream error: ${err.message}`));
      });
    });
  }
}
