import React from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { LLMType } from '../../types';
import { cn } from '../../lib/utils';

const LLM_META: Record<LLMType, { label: string; dot: string }> = {
  claude: { label: 'Claude', dot: 'bg-orange-400' },
  gemini: { label: 'Gemini', dot: 'bg-blue-500' },
  gpt:    { label: 'GPT',    dot: 'bg-green-500' },
};

export function LLMSelector() {
  const { selectedLLM, selectedModel, llmInfos, setLLM, setModel } = useSettingsStore();
  const currentInfo = llmInfos.find((i) => i.type === selectedLLM);

  // 백엔드 응답 전이거나 없으면 → 상태 미확인으로 모두 활성화
  // available=false 가 명시적으로 확인된 경우에만 비활성화
  const isKnownUnavailable = (type: LLMType) => {
    const info = llmInfos.find((i) => i.type === type);
    return info !== undefined && info.available === false;
  };

  return (
    <div className="flex items-center gap-2">
      {/* LLM 탭 */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg border border-gray-200">
        {(Object.keys(LLM_META) as LLMType[]).map((type) => {
          const meta = LLM_META[type];
          const isSelected = selectedLLM === type;
          const unavailable = isKnownUnavailable(type);

          return (
            <button
              key={type}
              onClick={() => !unavailable && setLLM(type)}
              title={unavailable ? `${meta.label} CLI가 설치되지 않았습니다` : undefined}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                isSelected
                  ? 'bg-white shadow-sm text-gray-900 border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700',
                unavailable && 'opacity-40 cursor-not-allowed'
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* 모델 선택 */}
      {currentInfo && currentInfo.models.length > 0 && (
        <select
          value={selectedModel ?? ''}
          onChange={(e) => setModel(e.target.value || undefined)}
          className="text-xs bg-white border border-gray-200 text-gray-600
            rounded-lg px-2 py-1.5 outline-none focus:border-violet-400 cursor-pointer"
        >
          <option value="">기본 모델</option>
          {currentInfo.models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      )}
    </div>
  );
}
