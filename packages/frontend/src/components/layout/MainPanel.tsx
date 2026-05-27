import React, { useEffect, useRef } from 'react';
import { useChatStore } from '../../store/chatStore';
import { ChatMessage } from '../chat/ChatMessage';
import { ChatInput } from '../chat/ChatInput';
import { LLMSelector } from '../llm/LLMSelector';
import { PromptSelector } from '../prompt/PromptSelector';
import { Zap } from 'lucide-react';

export function MainPanel() {
  const { messages, streamingContent } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingContent]);

  return (
    <main className="flex flex-col flex-1 h-full overflow-hidden bg-white">
      {/* 상단 툴바 */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 bg-white">
        <LLMSelector />
        <PromptSelector />
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-w-3xl mx-auto">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                streamingContent={msg.isStreaming ? streamingContent : undefined}
              />
            ))}
            <div ref={bottomRef} className="h-4" />
          </div>
        )}
      </div>

      {/* 입력창 */}
      <div className="max-w-3xl mx-auto w-full px-4">
        <ChatInput />
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-14 h-14 bg-violet-50 border border-violet-200 rounded-2xl
        flex items-center justify-center mb-5">
        <Zap size={24} className="text-violet-500" />
      </div>
      <h1 className="text-xl font-bold text-gray-800 mb-2">SPARK</h1>
      <p className="text-gray-500 text-sm max-w-xs leading-relaxed">
        LLM을 선택하고 질문을 입력하세요.<br />
        우측 상단에서 프롬프트를 선택하면<br />
        자동으로 조합되어 전달됩니다.
      </p>
    </div>
  );
}
