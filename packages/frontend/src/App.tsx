import React, { useEffect } from 'react';
import { PromptManager } from './components/prompt/PromptManager';
import { PatentPanel } from './components/patent/PatentPanel';
import { usePromptStore } from './store/promptStore';
import { useSettingsStore } from './store/settingsStore';
import { api } from './lib/api';
import { LLMInfo } from './types';

export default function App() {
  const { setPrompts } = usePromptStore();
  const { setLLMInfos } = useSettingsStore();

  useEffect(() => {
    api.getPrompts().then(setPrompts).catch(console.error);
    fetchLLMAvailability(setLLMInfos);
  }, []);

  return (
    <div className="flex h-screen bg-white overflow-hidden font-sans">
      <PatentPanel />
      <PromptManager />
    </div>
  );
}

// LLM 가용성 확인 — 8초 타임아웃, 실패 시 4초 후 1회 재시도
function fetchLLMAvailability(setLLMInfos: (infos: LLMInfo[]) => void) {
  const offlineState: LLMInfo[] = [
    { type: 'claude', name: 'Claude', models: [], available: false },
    { type: 'gemini', name: 'Gemini', models: [], available: false },
    { type: 'gpt',    name: 'GPT',    models: [], available: false },
  ];

  const attempt = (): Promise<LLMInfo[]> => {
    return api.getLLMAvailability();
  };

  attempt()
    .then(setLLMInfos)
    .catch(() =>
      new Promise<void>(res => setTimeout(res, 4000))
        .then(attempt)
        .then(setLLMInfos)
        .catch(() => setLLMInfos(offlineState))
    );
}
