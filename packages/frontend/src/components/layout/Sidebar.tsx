import React from 'react';
import { Settings, Zap } from 'lucide-react';
import { usePromptStore } from '../../store/promptStore';

export function Sidebar() {
  const { openManager } = usePromptStore();

  return (
    <aside className="w-48 bg-gray-50 border-r border-gray-200 flex flex-col h-full shrink-0">
      {/* 로고 */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-gray-200">
        <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center">
          <Zap size={14} className="text-white" />
        </div>
        <div>
          <span className="text-sm font-bold text-gray-800 tracking-tight">SPARK</span>
          <p className="text-[10px] text-gray-400 leading-none mt-0.5">선행발명 검색</p>
        </div>
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
