import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Sparkles, Settings } from 'lucide-react';
import { usePromptStore } from '../../store/promptStore';
import { cn } from '../../lib/utils';

export function PromptSelector() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { prompts, selectedPromptId, selectPrompt, openManager } = usePromptStore();
  const selected = prompts.find((p) => p.id === selectedPromptId);

  // 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
          selected
            ? 'bg-violet-50 border-violet-300 text-violet-700'
            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
        )}
      >
        <Sparkles size={12} className={selected ? 'text-violet-500' : 'text-gray-400'} />
        {selected ? selected.name : '프롬프트 선택'}
        <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {/* 드롭다운 — 아래 방향으로 열림 */}
      {open && (
        <div className="absolute top-full mt-1 right-0 w-72 bg-white border border-gray-200
          rounded-xl shadow-lg z-50 overflow-hidden">

          {/* 헤더 */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-600">프롬프트 선택</span>
            <button
              onClick={() => { setOpen(false); openManager(); }}
              className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700"
            >
              <Settings size={11} /> 관리
            </button>
          </div>

          {/* 목록 */}
          <div className="max-h-60 overflow-y-auto py-1">
            {/* 없음 옵션 */}
            <button
              onClick={() => { selectPrompt(null); setOpen(false); }}
              className={cn(
                'w-full text-left px-3 py-2 text-sm transition-colors',
                !selectedPromptId
                  ? 'bg-violet-50 text-violet-700'
                  : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              프롬프트 없음
            </button>

            {prompts.length === 0 && (
              <div className="px-3 py-4 text-xs text-gray-400 text-center">
                저장된 프롬프트가 없습니다<br />
                <button onClick={() => { setOpen(false); openManager(); }} className="text-violet-500 mt-1 underline">
                  프롬프트 추가하기
                </button>
              </div>
            )}

            {prompts.map((p) => (
              <button
                key={p.id}
                onClick={() => { selectPrompt(p.id); setOpen(false); }}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm transition-colors',
                  selectedPromptId === p.id
                    ? 'bg-violet-50 text-violet-700'
                    : 'text-gray-700 hover:bg-gray-50'
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
