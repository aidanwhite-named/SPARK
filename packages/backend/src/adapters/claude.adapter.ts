import { BaseLLMAdapter, LLMRequest, LLMResponse, StreamCallback, StreamChunk } from './base.adapter.js';
import { CLIExecutor } from '../executor/cli.executor.js';

export class ClaudeAdapter extends BaseLLMAdapter {
  readonly llmType = 'claude' as const;
  readonly displayName = 'Claude (Anthropic)';

  private executor: CLIExecutor;

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

    // 프롬프트는 stdin으로 전달 — args로 넘기면 shell이 특수문자를 망가뜨림
    const args = ['--print'];
    if (request.model) {
      args.push('--model', request.model);
    }

    const result = await this.executor.run('claude', args, { stdinData: finalPrompt });

    return {
      content: result.stdout.trim(),
      llmType: this.llmType,
      model: request.model,
      durationMs: Date.now() - start,
    };
  }

  async stream(request: LLMRequest, onChunk: StreamCallback): Promise<void> {
    const finalPrompt = this.buildFinalPrompt(request);

    const args = [
      '--print',
      '--verbose',
      '--output-format', 'stream-json',
      '--include-partial-messages',
    ];
    if (request.model) {
      args.push('--model', request.model);
    }

    let lastAssistantText = '';

    await this.executor.stream('claude', args, (line) => {
      try {
        const parsed = JSON.parse(line);

        if (parsed.type === 'assistant' && parsed.message?.content) {
          let fullText = '';
          for (const block of parsed.message.content) {
            if (block.type === 'text' && block.text) {
              fullText += block.text;
            }
          }
          if (fullText.length > lastAssistantText.length) {
            const newPart = fullText.slice(lastAssistantText.length);
            if (newPart) onChunk({ type: 'chunk', content: newPart });
            lastAssistantText = fullText;
          }
        } else if (parsed.type === 'result') {
          onChunk({ type: 'done' });
        }
      } catch {
        // JSON 파싱 실패 시 무시
      }
    }, { stdinData: finalPrompt });
  }
}
