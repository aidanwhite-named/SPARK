import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Copy, Check, Bot, User } from 'lucide-react';
import { Message } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  message: Message;
  streamingContent?: string;
}

export function ChatMessage({ message, streamingContent }: Props) {
  const [copied, setCopied] = useState(false);
  const isAI = message.role === 'assistant';
  const content = message.isStreaming ? (streamingContent ?? '') : message.content;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveFile = () => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `response-${Date.now()}.md`;
    a.click();
  };

  return (
    <div className={cn('group flex gap-3 px-6 py-4', isAI ? 'bg-gray-50' : 'bg-white')}>
      {/* 아바타 */}
      <div className={cn(
        'flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5',
        isAI ? 'bg-violet-100' : 'bg-gray-100'
      )}>
        {isAI
          ? <Bot size={14} className="text-violet-600" />
          : <User size={14} className="text-gray-500" />
        }
      </div>

      {/* 내용 */}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">
          {isAI ? 'AI' : '나'}
        </span>

        <div className="prose prose-sm max-w-none
          prose-headings:text-gray-900 prose-headings:font-semibold
          prose-p:text-gray-700 prose-p:leading-relaxed
          prose-code:text-violet-700 prose-code:bg-violet-50 prose-code:px-1 prose-code:rounded
          prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-200
          prose-a:text-violet-600 prose-strong:text-gray-900
          prose-blockquote:border-violet-400 prose-blockquote:text-gray-500
          prose-li:text-gray-700">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              pre: ({ children, ...props }) => (
                <div className="relative group/code">
                  <pre {...props} className="overflow-x-auto rounded-lg p-4 text-sm !bg-gray-900">
                    {children}
                  </pre>
                  <CopyCodeBtn text={String(children)} />
                </div>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
          {message.isStreaming && (
            <span className="inline-block w-0.5 h-4 bg-violet-500 animate-pulse ml-0.5 align-middle" />
          )}
        </div>

        {/* 액션 버튼 */}
        {!message.isStreaming && isAI && content && (
          <div className="flex gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600
                px-2 py-1 rounded-md hover:bg-gray-100 transition-colors">
              {copied ? <><Check size={11} className="text-green-500" /> 복사됨</> : <><Copy size={11} /> 복사</>}
            </button>
            <button onClick={saveFile}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors">
              저장
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CopyCodeBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 2000);
      }}
      className="absolute top-2 right-2 opacity-0 group-hover/code:opacity-100
        text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600
        px-2 py-0.5 rounded transition-all"
    >
      {ok ? '✓' : '복사'}
    </button>
  );
}
