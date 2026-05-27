import React from 'react';
import { Plus, MessageSquare, Settings, Zap } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { usePromptStore } from '../../store/promptStore';
import { cn } from '../../lib/utils';

export function Sidebar() {
  const { reset } = useChatStore();
  const { openManager } = usePromptStore();

  return (
    <aside className="w-56 bg-gray-50 border-r border-gray-200 flex flex-col h-full">
      {/* 로고 */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-gray-200">
        <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center">
          <Zap size={14} className="text-white" />
        </div>
        <span className="text-sm font-bold text-gray-800 tracking-tight">SPARK</span>
      </div>

      {/* 새 대화 */}
      <div className="px-3 py-3">
        <button
          onClick={reset}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg
            border border-gray-300 hover:border-violet-400 hover:bg-violet-50
            text-sm text-gray-600 hover:text-violet-700 transition-all group"
        >
          <Plus size={14} className="text-gray-400 group-hover:text-violet-500 transition-colors" />
          새 대화
        </button>
      </div>

      <div className="flex-1" />

      {/* 프롬프트 관리 */}
      <div className="border-t border-gray-200 p-3">
        <button
          onClick={openManager}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg
            text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-colors"
        >
          <Settings size={14} />
          프롬프트 관리
        </button>
      </div>
    </aside>
  );
}
