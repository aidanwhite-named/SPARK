// ─────────────────────────────────────────────────────────────
// Adapter Factory — LLM 타입에 따라 적절한 어댑터 반환
// 새로운 LLM 추가 시 여기만 수정하면 됨
// ─────────────────────────────────────────────────────────────

import { BaseLLMAdapter, LLMType } from './base.adapter.js';
import { ClaudeAdapter } from './claude.adapter.js';
import { GeminiAdapter } from './gemini.adapter.js';
import { GPTAdapter } from './gpt.adapter.js';

class AdapterFactory {
  private adapters: Map<LLMType, BaseLLMAdapter> = new Map();

  constructor() {
    // 싱글톤 인스턴스 — 어댑터는 한 번만 생성
    this.adapters.set('claude', new ClaudeAdapter());
    this.adapters.set('gemini', new GeminiAdapter());
    this.adapters.set('gpt', new GPTAdapter());
  }

  get(llmType: LLMType): BaseLLMAdapter {
    const adapter = this.adapters.get(llmType);
    if (!adapter) {
      throw new Error(`Unknown LLM type: ${llmType}`);
    }
    return adapter;
  }

  getAll(): BaseLLMAdapter[] {
    return Array.from(this.adapters.values());
  }

  async getAvailability(): Promise<Record<LLMType, boolean>> {
    const results = await Promise.allSettled(
      Array.from(this.adapters.entries()).map(async ([type, adapter]) => ({
        type,
        available: await adapter.isAvailable(),
      }))
    );

    return results.reduce((acc, result) => {
      if (result.status === 'fulfilled') {
        acc[result.value.type] = result.value.available;
      }
      return acc;
    }, {} as Record<LLMType, boolean>);
  }
}

// 전역 싱글톤
export const adapterFactory = new AdapterFactory();
