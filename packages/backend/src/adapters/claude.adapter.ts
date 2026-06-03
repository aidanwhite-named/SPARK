import { BaseLLMAdapter, LLMRequest, LLMResponse, StreamCallback } from './base.adapter.js';
import { CLIExecutor } from '../executor/cli.executor.js';

export class ClaudeAdapter extends BaseLLMAdapter {
  readonly llmType = 'claude' as const;
  readonly displayName = 'Claude (Anthropic)';

  private executor: CLIExecutor;

  private readonly models = [
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-6',
    'claude-opus-4-7',
  ];

  private readonly completeTimeoutMs = 45_000;
  private readonly streamTimeoutMs = 120_000;
  private readonly idleTimeoutMs = 20_000;
  private readonly maxStreamTextBytes = 120_000;
  private readonly maxToolCalls = 8;

  constructor() {
    super();
    this.executor = new CLIExecutor();
  }

  getModels(): string[] {
    return this.models;
  }

  private assertSupportedModel(model?: string) {
    if (!model) return;
    if (!this.models.includes(model)) {
      throw new Error(`Unsupported Claude model "${model}". Allowed: ${this.models.join(', ')}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.executor.run('claude', ['--version'], { timeout: 5000, idleTimeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    this.assertSupportedModel(request.model);

    const start = Date.now();
    const finalPrompt = this.buildFinalPrompt(request);
    const model = request.model ?? '(default)';
    console.log(`[Claude:complete] model=${model} | prompt=${finalPrompt.length} bytes`);

    const args = ['--print', '--dangerously-skip-permissions'];
    if (request.model) {
      args.push('--model', request.model);
    }

    const result = await this.executor.run('claude', args, {
      stdinData: finalPrompt,
      timeout: this.completeTimeoutMs,
      idleTimeout: this.idleTimeoutMs,
      maxStdoutBytes: 250_000,
      maxStderrBytes: 80_000,
    });

    if (result.exitCode !== 0) {
      const errMsg = result.stdout.trim() || result.stderr.trim() || `Claude CLI exited with code ${result.exitCode}`;
      throw new Error(errMsg);
    }

    const durationMs = Date.now() - start;
    console.log(`[Claude:complete] done in ${durationMs}ms | response=${result.stdout.trim().length} bytes`);

    return {
      content: result.stdout.trim(),
      llmType: this.llmType,
      model: request.model,
      durationMs,
    };
  }

  async stream(request: LLMRequest, onChunk: StreamCallback): Promise<void> {
    this.assertSupportedModel(request.model);

    const finalPrompt = this.buildFinalPrompt(request);
    const model = request.model ?? '(default)';
    const t0 = Date.now();
    console.log(`[Claude:stream] model=${model} | prompt=${finalPrompt.length} bytes`);

    const args = [
      '--print',
      '--verbose',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--allowedTools', 'WebSearch,WebFetch',
      '--dangerously-skip-permissions',
    ];
    if (request.model) {
      args.push('--model', request.model);
    }

    let lastAssistantText = '';
    let firstChunk = false;
    let toolCallCount = 0;
    let done = false;

    await this.executor.stream('claude', args, (line) => {
      try {
        const parsed = JSON.parse(line);

        if (parsed.type === 'error' || parsed.error) {
          throw new Error(
            parsed.message?.content?.[0]?.text ??
            parsed.error?.message ??
            parsed.message ??
            (typeof parsed.error === 'string' ? parsed.error : 'Claude stream error')
          );
        }

        if (parsed.type === 'assistant' && parsed.message?.content) {
          for (const block of parsed.message.content) {
            if (block.type === 'tool_use') {
              toolCallCount++;
              if (toolCallCount > this.maxToolCalls) {
                throw new Error(`Claude tool-call limit exceeded (${this.maxToolCalls})`);
              }
              console.log(
                `[Claude:stream] tool_use #${toolCallCount}: ${block.name} at +${Date.now() - t0}ms`,
                block.input ? JSON.stringify(block.input).slice(0, 120) : ''
              );
            }
          }
        }

        if (parsed.type === 'assistant' && parsed.message?.content) {
          let fullText = '';
          for (const block of parsed.message.content) {
            if (block.type === 'text' && block.text) {
              fullText += block.text;
            }
          }

          if (fullText.length > this.maxStreamTextBytes) {
            throw new Error(`Claude output limit exceeded (${this.maxStreamTextBytes} bytes)`);
          }

          if (fullText.length > lastAssistantText.length) {
            const newPart = fullText.slice(lastAssistantText.length);
            if (newPart) {
              if (!firstChunk) {
                firstChunk = true;
                console.log(`[Claude:stream] first text chunk at +${Date.now() - t0}ms`);
              }
              onChunk({ type: 'chunk', content: newPart });
            }
            lastAssistantText = fullText;
          }
        } else if (parsed.type === 'result') {
          done = true;
          console.log(
            `[Claude:stream] done at +${Date.now() - t0}ms | tool calls=${toolCallCount} | total text=${lastAssistantText.length} bytes`
          );
          onChunk({ type: 'done' });
        }
      } catch (err) {
        if (line.trim().startsWith('{')) {
          throw err;
        }
      }
    }, {
      stdinData: finalPrompt,
      timeout: this.streamTimeoutMs,
      idleTimeout: this.idleTimeoutMs,
      maxStdoutBytes: 1_000_000,
      maxStderrBytes: 80_000,
      maxLines: 5_000,
    });

    if (!done) {
      onChunk({ type: 'done' });
    }
  }
}
