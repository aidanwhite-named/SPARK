import { Prompt, LLMInfo } from '../types';

const BASE = '/api';

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};

  if (!(options?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: '알 수 없는 오류가 발생했습니다.' }));
    throw new Error(errorData.error || res.statusText);
  }

  return res.status === 204 ? undefined as T : res.json();
}

export const api = {
  // Prompts
  getPrompts: () => req<Prompt[]>('/prompts'),
  createPrompt: (data: { name: string; content: string }) =>
    req<Prompt>('/prompts', { method: 'POST', body: JSON.stringify(data) }),
  updatePrompt: (id: string, data: { name?: string; content?: string }) =>
    req<Prompt>(`/prompts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePrompt: (id: string) => req<void>(`/prompts/${id}`, { method: 'DELETE' }),
  getLLMAvailability: () => req<LLMInfo[]>('/llm/availability'),
};
