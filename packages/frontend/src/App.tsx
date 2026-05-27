import React, { useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { MainPanel } from './components/layout/MainPanel';
import { PromptManager } from './components/prompt/PromptManager';
import { usePromptStore } from './store/promptStore';
import { useSettingsStore } from './store/settingsStore';
import { api } from './lib/api';

export default function App() {
  const { setPrompts } = usePromptStore();
  const { setLLMInfos } = useSettingsStore();

  useEffect(() => {
    // 프롬프트 로드 (백엔드 파일 기반)
    api.getPrompts().then(setPrompts).catch(console.error);
    // LLM 가용성 확인
    api.getLLMAvailability().then(setLLMInfos).catch(console.error);
  }, []);

  return (
    <div className="flex h-screen bg-white overflow-hidden font-sans">
      <Sidebar />
      <MainPanel />
      <PromptManager />
    </div>
  );
}
