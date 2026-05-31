import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';
import { LLMType } from '../../types';
import { cn } from '../../lib/utils';

const LLM_META: Record<LLMType, { label: string; dot: string; defaultModels: string[] }> = {
  claude: {
    label: 'Claude',
    dot: 'bg-orange-400',
    defaultModels: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001'],
  },
  gemini: {
    label: 'Gemini',
    dot: 'bg-blue-500',
    defaultModels: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  },
  gpt: {
    label: 'GPT',
    dot: 'bg-green-500',
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-mini', 'o1-preview'],
  },
};

// 모델명 축약: "claude-sonnet-4-6" → "sonnet-4-6"
function shortModel(model: string): string {
  return model
    .replace(/^claude-/, '')
    .replace(/^gemini-/, '')
    .replace(/-\d{8}$/, ''); // 날짜 suffix 제거 (haiku-4-5-20251001 → haiku-4-5)
}

export function LLMSelector() {
  const { selectedLLM, selectedModel, llmInfos, setLLM, setModel } = useSettingsStore();
  const [openMenu, setOpenMenu] = useState<LLMType | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const getInfo = (type: LLMType) => llmInfos.find((i) => i.type === type);
  const getModels = (type: LLMType) => {
    const fromServer = getInfo(type)?.models;
    return fromServer && fromServer.length > 0 ? fromServer : LLM_META[type].defaultModels;
  };
  // null=확인중, true=연결됨, false=오프라인
  const availability = (type: LLMType): boolean | null => {
    if (llmInfos.length === 0) return null;
    const info = getInfo(type);
    return info === undefined ? false : info.available;
  };

  const handleLLMClick = (type: LLMType) => {
    if (selectedLLM !== type) {
      setLLM(type);
      setModel(getModels(type)[0]);
    }
    setOpenMenu(openMenu === type ? null : type);
  };

  const handleModelSelect = (model: string) => {
    setModel(model);
    setOpenMenu(null);
  };

  const currentModel = selectedModel ?? getModels(selectedLLM)[0] ?? '';

  return (
    <div className="relative flex items-center gap-1" ref={menuRef}>
      {/* LLM 탭들 */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg border border-gray-200">
        {(Object.keys(LLM_META) as LLMType[]).map((type) => {
          const meta = LLM_META[type];
          const isSelected = selectedLLM === type;
          const avail = availability(type);
          const unavailable = avail === false;
          const checking = avail === null;

          return (
            <button
              key={type}
              onClick={() => handleLLMClick(type)}
              title={
                checking
                  ? `${meta.label} — 연결 확인 중`
                  : `${meta.label} 모델 선택`
              }
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                isSelected
                  ? 'bg-white shadow-sm text-gray-900 border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/60',
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', meta.dot)} />

              <span className="flex flex-col items-start leading-tight">
                <span>{meta.label}</span>
                {/* 선택된 탭에 현재 모델명 표시 */}
                {isSelected && currentModel && (
                  <span className="text-[9px] text-gray-400 font-normal max-w-[80px] truncate">
                    {shortModel(currentModel)}
                  </span>
                )}
              </span>

              {isSelected && (
                <ChevronDown
                  size={11}
                  className={cn(
                    'ml-0.5 text-gray-400 transition-transform flex-shrink-0',
                    openMenu === type && 'rotate-180'
                  )}
                />
              )}

              {/* 연결 상태 아이콘 (비선택 상태에서만) */}
              {!isSelected && avail === true && (
                <Wifi size={9} className="text-green-400 ml-0.5" />
              )}
              {!isSelected && unavailable && (
                <WifiOff size={9} className="text-red-400 ml-0.5 opacity-60" />
              )}
              {!isSelected && checking && (
                <Loader2 size={9} className="text-gray-300 ml-0.5 animate-spin" />
              )}
            </button>
          );
        })}
      </div>

      {/* 모델 드롭다운 메뉴 */}
      {openMenu !== null && (
        <div
          className="absolute top-full left-0 mt-1 z-50 min-w-[220px]
            bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 overflow-hidden"
        >
          {/* 헤더 */}
          <div className="px-3 py-1.5 border-b border-gray-100 mb-1">
            <div className="flex items-center gap-2">
              <span className={cn('w-2 h-2 rounded-full', LLM_META[openMenu].dot)} />
              <span className="text-xs font-semibold text-gray-700">{LLM_META[openMenu].label} 모델</span>
              {availability(openMenu) === true && (
                <span className="ml-auto text-[10px] text-green-600 flex items-center gap-0.5">
                  <Wifi size={9} /> 연결됨
                </span>
              )}
            </div>
          </div>

          {/* 모델 목록 */}
          {getModels(openMenu).map((model) => {
            const isCurrentModel =
              (selectedModel ?? getModels(selectedLLM)[0]) === model && openMenu === selectedLLM;
            return (
              <button
                key={model}
                onClick={() => handleModelSelect(model)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors',
                  isCurrentModel
                    ? 'bg-violet-50 text-violet-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                <Check
                  size={12}
                  className={cn('flex-shrink-0', isCurrentModel ? 'text-violet-500' : 'invisible')}
                />
                {model}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
