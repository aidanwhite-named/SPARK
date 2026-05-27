import { create } from 'zustand';
import { Prompt } from '../types';

interface PromptState {
  prompts: Prompt[];
  selectedPromptId: string | null;
  isManagerOpen: boolean;
  setPrompts: (p: Prompt[]) => void;
  selectPrompt: (id: string | null) => void;
  openManager: () => void;
  closeManager: () => void;
  addPrompt: (p: Prompt) => void;
  updatePrompt: (p: Prompt) => void;
  removePrompt: (id: string) => void;
}

export const usePromptStore = create<PromptState>((set) => ({
  prompts: [],
  selectedPromptId: null,
  isManagerOpen: false,
  setPrompts: (prompts) => set({ prompts }),
  selectPrompt: (id) => set({ selectedPromptId: id }),
  openManager: () => set({ isManagerOpen: true }),
  closeManager: () => set({ isManagerOpen: false }),
  addPrompt: (p) => set((s) => ({ prompts: [...s.prompts, p] })),
  updatePrompt: (p) => set((s) => ({ prompts: s.prompts.map((x) => (x.id === p.id ? p : x)) })),
  removePrompt: (id) => set((s) => ({
    prompts: s.prompts.filter((p) => p.id !== id),
    selectedPromptId: s.selectedPromptId === id ? null : s.selectedPromptId,
  })),
}));
