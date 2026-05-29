import { spawn, SpawnOptions } from 'child_process';

export interface RunOptions {
  timeout?: number;        // ms
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdinData?: string;      // 프로세스의 stdin으로 전달할 데이터
  shell?: boolean;         // shell 모드 강제 지정 (기본: Windows=true, 그외=false)
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
    const { timeout = 120_000, cwd = process.cwd(), env = process.env, stdinData, shell } = options;
    const useShell = shell ?? process.platform === 'win32';

    return new Promise((resolve, reject) => {
      const spawnOpts: SpawnOptions = {
        cwd,
        env,
        shell: useShell,
        stdio: ['pipe', 'pipe', 'pipe'],
      };

      const child = spawn(command, args, spawnOpts);

      if (stdinData && child.stdin) {
        child.stdin.write(stdinData, 'utf8');
        child.stdin.end();
      } else if (child.stdin) {
        child.stdin.end();
      }

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
    const { timeout = 300_000, cwd = process.cwd(), env = process.env, stdinData, shell } = options;
    // Windows에서 .cmd 파일 실행을 위해 shell 필요. stdinData가 있어도 shell 유지.
    const useShell = shell ?? process.platform === 'win32';

    return new Promise((resolve, reject) => {
      const spawnOpts: SpawnOptions = {
        cwd,
        env,
        shell: useShell,
        stdio: ['pipe', 'pipe', 'pipe'], // 항상 pipe로 통일 (stdin 제어 위해)
      };

      const child = spawn(command, args, spawnOpts);

      // stdin으로 프롬프트 전달 후 닫기
      if (stdinData && child.stdin) {
        child.stdin.write(stdinData, 'utf8');
        child.stdin.end();
      } else if (child.stdin) {
        child.stdin.end(); // stdin이 없으면 즉시 닫아야 프로세스가 대기하지 않음
      }

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
