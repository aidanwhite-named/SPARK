// ─────────────────────────────────────────────────────────────
// Base Adapter — 모든 LLM 어댑터가 구현해야 하는 인터페이스
// ─────────────────────────────────────────────────────────────

export type LLMType = 'claude' | 'gemini';

export interface LLMRequest {
  prompt: string;          // 시스템 프롬프트
  userInput: string;       // 사용자 입력
  model?: string;          // 특정 모델 지정 (optional)
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface LLMResponse {
  content: string;
  llmType: LLMType;
  model?: string;
  durationMs: number;
  tokenCount?: number;
}

export interface StreamChunk {
  type: 'chunk' | 'done' | 'error';
  content?: string;
  error?: string;
  metadata?: Partial<LLMResponse>;
}

// 스트리밍 콜백 타입
export type StreamCallback = (chunk: StreamChunk) => void;

// ─────────────────────────────────────────────────────────────
// Abstract Base Adapter
// ─────────────────────────────────────────────────────────────
export abstract class BaseLLMAdapter {
  abstract readonly llmType: LLMType;
  abstract readonly displayName: string;

  // 단일 응답 (non-streaming)
  abstract complete(request: LLMRequest): Promise<LLMResponse>;

  // 스트리밍 응답
  abstract stream(request: LLMRequest, onChunk: StreamCallback): Promise<void>;

  // CLI 사용 가능 여부 확인
  abstract isAvailable(): Promise<boolean>;

  // 사용 가능한 모델 목록
  abstract getModels(): string[];

  // 최종 프롬프트 조합
  protected buildFinalPrompt(request: LLMRequest): string {
    if (!request.prompt || request.prompt.trim() === '') {
      return request.userInput;
    }
    // 시스템 프롬프트에 {{input}} 변수 치환
    const systemWithInput = request.prompt.replace(/\{\{input\}\}/g, request.userInput);
    // 변수가 없는 경우 시스템 + 사용자 입력 분리
    if (!request.prompt.includes('{{input}}')) {
      return `${request.prompt}\n\n---\n\n${request.userInput}`;
    }
    return systemWithInput;
  }
}
