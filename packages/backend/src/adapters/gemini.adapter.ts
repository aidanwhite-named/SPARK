import { BaseLLMAdapter, LLMRequest, LLMResponse, StreamCallback } from './base.adapter.js';
import { CLIExecutor } from '../executor/cli.executor.js';

export class GeminiAdapter extends BaseLLMAdapter {
  readonly llmType = 'gemini' as const;
  readonly displayName = 'Gemini (Google)';

  private executor: CLIExecutor;

  private readonly models = [
    'gemini-3.1-pro-preview',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
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
      await this.executor.run('npx', ['--no-install', 'gemini', '--version'], { timeout: 15000 });
      return true;
    } catch {
      return false;
    }
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();
    const finalPrompt = this.buildFinalPrompt(request);
    const model = request.model ?? '(default)';
    console.log(`[Gemini:complete] model=${model} | prompt=${finalPrompt.length} bytes`);
    const args: string[] = ['--no-install', 'gemini'];
    if (request.model) {
      args.push('--model', request.model);
    }

    let content = '';
    await this.executor.stream('npx', args, (line) => {
      content += line + '\n';
    }, { stdinData: finalPrompt });

    const durationMs = Date.now() - start;
    console.log(`[Gemini:complete] done in ${durationMs}ms | response=${content.trim().length} bytes`);
    return {
      content: content.trim(),
      llmType: this.llmType,
      model: request.model,
      durationMs,
    };
  }

  async stream(request: LLMRequest, onChunk: StreamCallback): Promise<void> {
    const finalPrompt = this.buildFinalPrompt(request);
    const model = request.model ?? '(default)';
    const t0 = Date.now();
    console.log(`[Gemini:stream] model=${model} | prompt=${finalPrompt.length} bytes`);
    const args: string[] = ['--no-install', 'gemini'];
    if (request.model) {
      args.push('--model', request.model);
    }

    let buffer = '';
    let firstChunk = false;
    await this.executor.stream('npx', args, (line) => {
      if (!firstChunk) {
        firstChunk = true;
        console.log(`[Gemini:stream] ✏️  first chunk at +${Date.now() - t0}ms`);
      }
      buffer += line + '\n';
      onChunk({ type: 'chunk', content: line + '\n' });
    }, { stdinData: finalPrompt });

    console.log(`[Gemini:stream] ✅ done at +${Date.now() - t0}ms | total text=${buffer.length} bytes`);
    onChunk({ type: 'done', metadata: { content: buffer } });
  }
}
