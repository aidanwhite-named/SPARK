import { BaseLLMAdapter, LLMRequest, LLMResponse, StreamCallback, StreamChunk } from './base.adapter.js';
import { CLIExecutor } from '../executor/cli.executor.js';

export class ClaudeAdapter extends BaseLLMAdapter {
  readonly llmType = 'claude' as const;
  readonly displayName = 'Claude (Anthropic)';

  private executor: CLIExecutor;

  // claude CLI로 사용 가능한 모델들
  private readonly models = [
    'claude-opus-4-7',
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
  ];

  constructor() {
    super();
    this.executor = new CLIExecutor();
  }

  getModels(): string[] {
    return this.models;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.executor.run('claude', ['--version'], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();
    const finalPrompt = this.buildFinalPrompt(request);

    // claude CLI 호출
    // 사용법: claude -p "프롬프트" [--model claude-sonnet-4-5]
    const args = ['-p', finalPrompt];
    if (request.model) {
      args.push('--model', request.model);
    }

    const result = await this.executor.run('claude', args);

    return {
      content: result.stdout.trim(),
      llmType: this.llmType,
      model: request.model,
      durationMs: Date.now() - start,
    };
  }

  async stream(request: LLMRequest, onChunk: StreamCallback): Promise<void> {
    const finalPrompt = this.buildFinalPrompt(request);

    // claude CLI는 기본적으로 스트리밍 출력
    // --output-format stream-json 옵션 사용 가능
    const args = ['-p', finalPrompt, '--output-format', 'stream-json', '--no-markdown'];
    if (request.model) {
      args.push('--model', request.model);
    }

    await this.executor.stream('claude', args, (line) => {
      try {
        // stream-json 형식 파싱
        const parsed = JSON.parse(line);
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          onChunk({ type: 'chunk', content: parsed.delta.text });
        } else if (parsed.type === 'message_stop') {
          onChunk({ type: 'done' });
        }
      } catch {
        // JSON 파싱 실패 시 raw 텍스트로 처리
        if (line.trim()) {
          onChunk({ type: 'chunk', content: line });
        }
      }
    });
  }
}
