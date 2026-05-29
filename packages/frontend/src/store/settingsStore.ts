import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LLMType, LLMInfo } from '../types';

interface SettingsState {
  selectedLLM: LLMType;
  selectedModel: string | undefined;
  llmInfos: LLMInfo[];
  theme: 'dark' | 'light';

  setLLM: (type: LLMType) => void;
  setModel: (model: string | undefined) => void;
  setLLMInfos: (infos: LLMInfo[]) => void;
  toggleTheme: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      selectedLLM: 'claude',
      selectedModel: 'claude-haiku-4-5-20251001',
      llmInfos: [],
      theme: 'dark',

      setLLM: (selectedLLM) => set({ selectedLLM, selectedModel: undefined }),
      setModel: (selectedModel) => set({ selectedModel }),
      setLLMInfos: (llmInfos) => set({ llmInfos }),
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
    }),
    {
      name: 'ai-workspace-settings',
      partialize: (state) => ({
        selectedLLM: state.selectedLLM,
        selectedModel: state.selectedModel,
        theme: state.theme,
      }),
    }
  )
);
