import { Prompt, LLMInfo } from '../types';

const BASE = '/api';

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? undefined as T : res.json();
}

export const api = {
  getPrompts: () => req<Prompt[]>('/prompts'),
  createPrompt: (data: { name: string; content: string }) =>
    req<Prompt>('/prompts', { method: 'POST', body: JSON.stringify(data) }),
  updatePrompt: (id: string, data: { name?: string; content?: string }) =>
    req<Prompt>(`/prompts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePrompt: (id: string) => req<void>(`/prompts/${id}`, { method: 'DELETE' }),
  getLLMAvailability: () => req<LLMInfo[]>('/llm/availability'),
};
