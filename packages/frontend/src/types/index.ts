export type LLMType = 'claude' | 'gemini';

export interface Prompt {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  isStreaming?: boolean;
}

export interface LLMInfo {
  type: LLMType;
  name: string;
  models: string[];
  available: boolean;
}

export type SSEEvent =
  | { type: 'chunk'; content: string }
  | { type: 'done'; messageId?: string }
  | { type: 'error'; error: string };
