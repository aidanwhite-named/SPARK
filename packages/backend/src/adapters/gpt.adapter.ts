import { BaseLLMAdapter, LLMRequest, LLMResponse, StreamCallback } from './base.adapter.js';
import { CLIExecutor } from '../executor/cli.executor.js';

// OpenAI CLI 또는 커스텀 래퍼 사용
// pip install openai 후 python -m openai ... 또는
// npx openai-cli 사용 가능
export class GPTAdapter extends BaseLLMAdapter {
  readonly llmType = 'gpt' as const;
  readonly displayName = 'GPT (OpenAI)';

  private executor: CLIExecutor;

  private readonly models = [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'o1-preview',
    'o1-mini',
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
      // openai CLI 확인 (pip install openai)
      await this.executor.run('openai', ['--version'], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();
    const finalPrompt = this.buildFinalPrompt(request);

    // openai CLI 사용
    // openai api chat.completions.create -m gpt-4o -g user "내용"
    const model = request.model ?? 'gpt-4o';
    const args = [
      'api', 'chat.completions.create',
      '-m', model,
      '-g', 'user', finalPrompt,
    ];

    const result = await this.executor.run('openai', args);

    return {
      content: result.stdout.trim(),
      llmType: this.llmType,
      model,
      durationMs: Date.now() - start,
    };
  }

  async stream(request: LLMRequest, onChunk: StreamCallback): Promise<void> {
    const finalPrompt = this.buildFinalPrompt(request);
    const model = request.model ?? 'gpt-4o';

    const args = [
      'api', 'chat.completions.create',
      '-m', model,
      '--stream',
      '-g', 'user', finalPrompt,
    ];

    let fullContent = '';
    await this.executor.stream('openai', args, (line) => {
      // OpenAI SSE 형식 파싱
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          onChunk({ type: 'done', metadata: { content: fullContent } });
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const text = parsed.choices?.[0]?.delta?.content;
          if (text) {
            fullContent += text;
            onChunk({ type: 'chunk', content: text });
          }
        } catch {
          // 파싱 실패 무시
        }
      }
    });
  }
}
