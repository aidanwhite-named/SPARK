import { create } from 'zustand';
import { Message, LLMType, SSEEvent } from '../types';

interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  addMessage: (msg: Message) => void;
  appendStreaming: (text: string) => void;
  finalizeStreaming: (id: string) => void;
  setStreaming: (v: boolean) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  streamingContent: '',

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  appendStreaming: (text) => set((s) => ({ streamingContent: s.streamingContent + text })),
  finalizeStreaming: (id) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === '__streaming__' ? { ...m, id, content: s.streamingContent, isStreaming: false } : m
      ),
      streamingContent: '',
      isStreaming: false,
    })),
  setStreaming: (v) => set({ isStreaming: v }),
  reset: () => set({ messages: [], streamingContent: '', isStreaming: false }),
}));

// ── SSE 스트리밍 전송 ────────────────────────────────────────
export async function sendMessage(params: {
  llmType: LLMType;
  model?: string;
  promptContent?: string;
  userInput: string;
}) {
  const { addMessage, appendStreaming, finalizeStreaming, setStreaming } = useChatStore.getState();

  // 사용자 메시지
  addMessage({
    id: crypto.randomUUID(),
    role: 'user',
    content: params.userInput,
    createdAt: new Date().toISOString(),
  });

  // 스트리밍 플레이스홀더
  addMessage({ id: '__streaming__', role: 'assistant', content: '', isStreaming: true, createdAt: new Date().toISOString() });
  setStreaming(true);

  try {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, stream: true }),
    });

    if (!res.body) throw new Error('No stream');
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6)) as SSEEvent;
          if (evt.type === 'chunk' && evt.content) appendStreaming(evt.content);
          else if (evt.type === 'done') finalizeStreaming((evt as any).messageId ?? crypto.randomUUID());
          else if (evt.type === 'error') { setStreaming(false); break; }
        } catch { /* skip */ }
      }
    }
  } catch (err) {
    setStreaming(false);
    addMessage({ id: crypto.randomUUID(), role: 'assistant', content: `오류: ${String(err)}`, createdAt: new Date().toISOString() });
  }
}
