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

    // claude CLI 호출: --print는 비대화형 모드, 프롬프트는 positional 인수
    const args = ['--print', finalPrompt];
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

    // claude CLI 올바른 플래그:
    //   --print (-p): 비대화형 출력 모드 (값 없는 boolean 플래그)
    //   --output-format stream-json: 스트리밍 JSON 출력
    //   --system-prompt: 시스템 프롬프트 (언어 지시)
    //   마지막 positional argument: 사용자 프롬프트
    // Claude Code CLI stream-json 이벤트 타입:
    //   {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}} → 응답 텍스트
    //   {"type":"result","subtype":"success","result":"..."} → 완료
    // --include-partial-messages: 스트리밍 중 부분 응답도 수신
    // Claude Code CLI 올바른 플래그:
    //   --bare: 최소 모드 (툴/LSP/훅 스킵 → 빠른 시작)
    //   --print: 비대화형 출력 모드
    //   --verbose: stream-json에 필수
    //   --output-format stream-json: 스트리밍 JSON
    //   --include-partial-messages: 부분 응답 수신으로 진짜 스트리밍
    const args = [
      '--print',
      '--verbose',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      finalPrompt,
    ];
    if (request.model) {
      args.push('--model', request.model);
    }

    let lastAssistantText = ''; // 누적 텍스트 추적 (부분 응답에서 delta 계산)

    await this.executor.stream('claude', args, (line) => {
      try {
        const parsed = JSON.parse(line);

        if (parsed.type === 'assistant' && parsed.message?.content) {
          // content 배열에서 텍스트 추출
          let fullText = '';
          for (const block of parsed.message.content) {
            if (block.type === 'text' && block.text) {
              fullText += block.text;
            }
          }
          // --include-partial-messages 사용 시 누적 텍스트에서 새 부분만 추출
          if (fullText.length > lastAssistantText.length) {
            const newPart = fullText.slice(lastAssistantText.length);
            if (newPart) onChunk({ type: 'chunk', content: newPart });
            lastAssistantText = fullText;
          }
        } else if (parsed.type === 'result') {
          // 최종 결과 이벤트 → 완료 신호
          onChunk({ type: 'done' });
        }
      } catch {
        // JSON 파싱 실패 시 무시 (시스템 메시지 등)
      }
    });
  }
}
