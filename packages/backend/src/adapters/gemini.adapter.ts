import { BaseLLMAdapter, LLMRequest, LLMResponse, StreamCallback } from './base.adapter.js';
import { CLIExecutor } from '../executor/cli.executor.js';

export class GeminiAdapter extends BaseLLMAdapter {
  readonly llmType = 'gemini' as const;
  readonly displayName = 'Gemini (Google)';

  private executor: CLIExecutor;

  private readonly models = [
    'gemini-2.0-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
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
      await this.executor.run('gemini', ['--version'], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();
    const finalPrompt = this.buildFinalPrompt(request);

    // 프롬프트는 stdin으로 전달 — args로 넘기면 shell이 특수문자를 망가뜨림
    const args: string[] = [];
    if (request.model) {
      args.push('--model', request.model);
    }

    const result = await this.executor.run('gemini', args, { stdinData: finalPrompt });

    return {
      content: result.stdout.trim(),
      llmType: this.llmType,
      model: request.model,
      durationMs: Date.now() - start,
    };
  }

  async stream(request: LLMRequest, onChunk: StreamCallback): Promise<void> {
    const finalPrompt = this.buildFinalPrompt(request);

    const args: string[] = [];
    if (request.model) {
      args.push('--model', request.model);
    }

    let buffer = '';
    await this.executor.stream('gemini', args, (line) => {
      buffer += line + '\n';
      onChunk({ type: 'chunk', content: line + '\n' });
    }, { stdinData: finalPrompt });

    onChunk({ type: 'done', metadata: { content: buffer } });
  }
}
