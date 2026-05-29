import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';
import { LLMType } from '../../types';
import { cn } from '../../lib/utils';

const LLM_META: Record<LLMType, { label: string; dot: string; defaultModels: string[] }> = {
  claude: {
    label: 'Claude',
    dot: 'bg-orange-400',
    // haiku를 기본 모델로 — 토큰 비용 절약
    defaultModels: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7'],
  },
  gemini: {
    label: 'Gemini',
    dot: 'bg-blue-500',
    defaultModels: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  },
  gpt: {
    label: 'GPT',
    dot: 'bg-green-500',
    defaultModels: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'o1-mini', 'o1-preview'],
  },
};

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
  // null=확인중, true=연결됨, false=미설치/오프라인
  const availability = (type: LLMType): boolean | null => {
    if (llmInfos.length === 0) return null;
    const info = getInfo(type);
    return info === undefined ? false : info.available;
  };

  const handleLLMClick = (type: LLMType) => {
    if (availability(type) === false) return;
    if (selectedLLM !== type) {
      setLLM(type);
      setModel(undefined);
    }
    setOpenMenu(openMenu === type ? null : type);
  };

  const handleModelSelect = (model: string) => {
    setModel(model);
    setOpenMenu(null);
  };

  const currentMeta = LLM_META[selectedLLM];
  const currentModel = selectedModel ?? getModels(selectedLLM)[0] ?? '기본 모델';

  return (
    // relative 필수 — 드롭다운이 이 컨테이너 기준으로 절대 위치 잡음
    <div className="relative flex items-center gap-2" ref={menuRef}>
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
              onClick={() => !unavailable && handleLLMClick(type)}
              title={
                unavailable
                  ? `${meta.label} CLI가 설치되지 않았습니다`
                  : checking
                  ? `${meta.label} — 연결 확인 중`
                  : `${meta.label} 모델 선택`
              }
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                isSelected
                  ? 'bg-white shadow-sm text-gray-900 border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/60',
                unavailable && 'opacity-40 cursor-not-allowed'
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
              {meta.label}
              {isSelected && (
                <ChevronDown
                  size={11}
                  className={cn(
                    'ml-0.5 text-gray-400 transition-transform',
                    openMenu === type && 'rotate-180'
                  )}
                />
              )}
              {/* 연결 상태 아이콘 (비선택 상태에서만) */}
              {!isSelected && avail === true && (
                <Wifi size={9} className="text-green-400 ml-0.5" />
              )}
              {!isSelected && unavailable && (
                <WifiOff size={9} className="text-red-400 ml-0.5" />
              )}
              {!isSelected && checking && (
                <Loader2 size={9} className="text-gray-300 ml-0.5 animate-spin" />
              )}
            </button>
          );
        })}
      </div>

      {/* 현재 선택 모델 뱃지 */}
      <button
        onClick={() => availability(selectedLLM) !== false && handleLLMClick(selectedLLM)}
        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 bg-gray-50
          border border-gray-200 rounded-md hover:bg-white hover:border-gray-300 transition-all"
        title="모델 변경"
      >
        <span className={cn('w-1.5 h-1.5 rounded-full', currentMeta.dot)} />
        <span className="max-w-[160px] truncate">{currentModel}</span>
        <ChevronDown size={11} className={cn('text-gray-400 transition-transform', openMenu === selectedLLM && 'rotate-180')} />
      </button>

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
              <span className="text-xs font-semibold text-gray-700">{LLM_META[openMenu].label} 모델 선택</span>
              {/* 연결 상태 */}
              {(() => {
                const av = availability(openMenu);
                if (av === true) return (
                  <span className="ml-auto text-[10px] text-green-600 flex items-center gap-0.5">
                    <Wifi size={9} /> 연결됨
                  </span>
                );
                if (av === false) return (
                  <span className="ml-auto text-[10px] text-red-500 flex items-center gap-0.5">
                    <WifiOff size={9} /> 미설치
                  </span>
                );
                return (
                  <span className="ml-auto text-[10px] text-gray-400 flex items-center gap-0.5">
                    <Loader2 size={9} className="animate-spin" /> 확인 중
                  </span>
                );
              })()}
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
