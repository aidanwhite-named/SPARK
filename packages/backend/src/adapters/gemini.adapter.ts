import { BaseLLMAdapter, LLMRequest, LLMResponse, StreamCallback } from './base.adapter.js';
import { CLIExecutor } from '../executor/cli.executor.js';

export class GeminiAdapter extends BaseLLMAdapter {
  readonly llmType = 'gemini' as const;
  readonly displayName = 'Gemini (Google)';

  private executor: CLIExecutor;

  private readonly models = [
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
    const model = request.model ?? '(default)';
    console.log(`[Gemini:complete] model=${model} | prompt=${finalPrompt.length} bytes`);
    const args: string[] = [];
    if (request.model) {
      args.push('--model', request.model);
    }

    // Gemini CLI는 스트리밍 기반이므로 executor.run()(블로킹) 대신
    // executor.stream()으로 출력을 수집 — 모델 응답이 오는 즉시 읽기 시작
    let content = '';
    await this.executor.stream('gemini', args, (line) => {
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
    const args: string[] = [];
    if (request.model) {
      args.push('--model', request.model);
    }

    let buffer = '';
    let firstChunk = false;
    await this.executor.stream('gemini', args, (line) => {
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
