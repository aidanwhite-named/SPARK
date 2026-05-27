import React, { useRef, useState, useCallback } from 'react';
import { Send, Square } from 'lucide-react';
import { useChatStore, sendMessage } from '../../store/chatStore';
import { usePromptStore } from '../../store/promptStore';
import { useSettingsStore } from '../../store/settingsStore';
import { cn } from '../../lib/utils';

export function ChatInput() {
  const [input, setInput] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const { isStreaming } = useChatStore();
  const { selectedPromptId, prompts } = usePromptStore();
  const { selectedLLM, selectedModel } = useSettingsStore();
  const selectedPrompt = prompts.find((p) => p.id === selectedPromptId);

  const autoHeight = useCallback(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = Math.min(ref.current.scrollHeight, 200) + 'px';
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    if (ref.current) ref.current.style.height = 'auto';
    await sendMessage({
      llmType: selectedLLM,
      model: selectedModel,
      promptContent: selectedPrompt?.content,
      userInput: text,
    });
  };

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      {selectedPrompt && (
        <div className="flex items-center gap-1.5 mb-2 px-1">
          <span className="text-xs text-violet-600 font-medium">📌 {selectedPrompt.name}</span>
          <span className="text-xs text-gray-400">프롬프트 적용 중</span>
        </div>
      )}

      <div className="flex items-end gap-2 border border-gray-200 rounded-xl px-3 py-2.5
        bg-white focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 transition-all">
        <textarea
          ref={ref}
          value={input}
          onChange={(e) => { setInput(e.target.value); autoHeight(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="질문을 입력하세요... (Shift+Enter 줄바꿈)"
          rows={1}
          disabled={isStreaming}
          className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400
            resize-none outline-none leading-relaxed disabled:opacity-50 min-h-[22px] max-h-[200px]"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() && !isStreaming}
          className={cn(
            'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all',
            isStreaming ? 'bg-red-500 hover:bg-red-400'
              : input.trim() ? 'bg-violet-600 hover:bg-violet-700'
              : 'bg-gray-100 cursor-not-allowed'
          )}
        >
          {isStreaming
            ? <Square size={13} className="text-white" fill="white" />
            : <Send size={13} className={input.trim() ? 'text-white' : 'text-gray-400'} />
          }
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1.5 text-center">Enter 전송 · Shift+Enter 줄바꿈</p>
    </div>
  );
}
