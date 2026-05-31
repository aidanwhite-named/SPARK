import { create } from 'zustand';
import {
  ClaimTree,
  CompareResult,
  ParsedDependentClaim,
  ParsedIndependentClaim,
  PatentChatMessage,
  PatentParseResult,
  WeightItem,
} from '../types/patent';

interface PatentState {
  result: PatentParseResult | null;
  fileName: string | null;
  pdfText: string | null;
  // 직접 입력 시 참고 자료 (PDF 또는 URL에서 추출한 텍스트)
  contextText: string | null;
  contextSource: 'pdf' | 'url' | null;
  priorityDate: string | null;       // YYYY-MM-DD
  priorityDateLabel: string | null;  // 화면 표시용 레이블
  purposeAndEffect: string | null;   // 발명의 목적 및 효과
  selectedTree: ClaimTree | null;
  selectedDependent: ParsedDependentClaim | null;
  searchPromptId: string | null;
  compareResult: CompareResult | null;
  isComparing: boolean;
  isUploading: boolean;
  isAnalyzing: boolean;
  error: string | null;

  // 청구항 번호별 채팅 이력
  chatHistories: Record<number, PatentChatMessage[]>;
  // 스트리밍 중인 청구항 번호 (null이면 미스트리밍)
  streamingClaimNumber: number | null;
  // 청구항 번호별 가중치 분석 결과
  weightResults: Record<number, WeightItem[]>;

  setFileName: (name: string | null) => void;
  setResult: (r: PatentParseResult, pdfText: string, contextText?: string, contextSource?: 'pdf' | 'url', priorityDate?: string, priorityDateLabel?: string, purposeAndEffect?: string) => void;
  selectTree: (tree: ClaimTree | null) => void;
  selectDependent: (dep: ParsedDependentClaim | null) => void;
  setSearchPromptId: (id: string | null) => void;
  setCompareResult: (r: CompareResult | null) => void;
  setComparing: (v: boolean) => void;
  setUploading: (v: boolean) => void;
  setAnalyzing: (v: boolean) => void;
  updateClaimParts: (claimNumber: number, parts: ParsedIndependentClaim['parts']) => void;
  setError: (e: string | null) => void;
  reset: () => void;

  // 채팅 액션
  addMessage: (claimNumber: number, msg: PatentChatMessage) => void;
  startStreaming: (claimNumber: number) => void;
  appendStreamChunk: (claimNumber: number, text: string) => void;
  finalizeStreaming: (claimNumber: number) => void;
  clearChat: (claimNumber: number) => void;
  // 가중치 액션
  setWeights: (claimNumber: number, weights: WeightItem[]) => void;
  updateWeight: (claimNumber: number, index: number, weight: '핵심' | '보조' | '관용') => void;
  clearWeights: (claimNumber: number) => void;
}

export const usePatentStore = create<PatentState>((set, get) => ({
  result: null,
  fileName: null,
  pdfText: null,
  contextText: null,
  contextSource: null,
  priorityDate: null,
  priorityDateLabel: null,
  purposeAndEffect: null,
  selectedTree: null,
  selectedDependent: null,
  searchPromptId: null,
  compareResult: null,
  isComparing: false,
  isUploading: false,
  isAnalyzing: false,
  error: null,
  chatHistories: {},
  streamingClaimNumber: null,
  weightResults: {},

  setFileName: (fileName) => set({ fileName }),

  setResult: (result, pdfText, contextText, contextSource, priorityDate, priorityDateLabel) =>
    set({
      result, pdfText,
      contextText: contextText ?? null,
      contextSource: contextSource ?? null,
      priorityDate: priorityDate ?? null,
      priorityDateLabel: priorityDateLabel ?? null,
      purposeAndEffect: result.purposeAndEffect ?? null,
      selectedTree: null, selectedDependent: null, compareResult: null, chatHistories: {}, weightResults: {}, error: null,
    }),

  selectTree: (selectedTree) => set({ selectedTree, selectedDependent: null }),
  selectDependent: (selectedDependent) => set({ selectedDependent }),

  setSearchPromptId: (searchPromptId) => set({ searchPromptId }),
  setCompareResult: (compareResult) => set({ compareResult }),
  setComparing: (isComparing) => set({ isComparing }),
  setUploading: (isUploading) => set({ isUploading }),
  setAnalyzing: (isAnalyzing) => set({ isAnalyzing }),

  updateClaimParts: (claimNumber, parts) => {
    const { result, selectedTree } = get();
    if (!result) return;
    const trees = result.trees.map(t =>
      t.root.number === claimNumber
        ? { ...t, root: { ...t.root, parts, needsLLM: false } }
        : t
    );
    const newResult = { ...result, trees };
    const newSelected = selectedTree?.root.number === claimNumber
      ? (trees.find(t => t.root.number === claimNumber) ?? selectedTree)
      : selectedTree;
    set({ result: newResult, selectedTree: newSelected });
  },

  setError: (error) => set({ error }),

  reset: () => set({
    result: null,
    fileName: null,
    pdfText: null,
    contextText: null,
    contextSource: null,
    priorityDate: null,
    priorityDateLabel: null,
    purposeAndEffect: null,
    selectedTree: null,
    selectedDependent: null,
    searchPromptId: null,
    compareResult: null,
    isComparing: false,
    isUploading: false,
    isAnalyzing: false,
    error: null,
    chatHistories: {},
    streamingClaimNumber: null,
    weightResults: {},
  }),

  addMessage: (claimNumber, msg) =>
    set(s => ({
      chatHistories: {
        ...s.chatHistories,
        [claimNumber]: [...(s.chatHistories[claimNumber] ?? []), msg],
      },
    })),

  startStreaming: (claimNumber) =>
    set(s => ({
      streamingClaimNumber: claimNumber,
      chatHistories: {
        ...s.chatHistories,
        [claimNumber]: [
          ...(s.chatHistories[claimNumber] ?? []),
          { id: '__streaming__', role: 'assistant', content: '', isStreaming: true },
        ],
      },
    })),

  appendStreamChunk: (claimNumber, text) =>
    set(s => {
      const msgs = s.chatHistories[claimNumber] ?? [];
      const updated = msgs.map(m =>
        m.id === '__streaming__' ? { ...m, content: m.content + text } : m
      );
      return { chatHistories: { ...s.chatHistories, [claimNumber]: updated } };
    }),

  finalizeStreaming: (claimNumber) =>
    set(s => {
      const msgs = s.chatHistories[claimNumber] ?? [];
      const updated = msgs.map(m =>
        m.id === '__streaming__'
          ? { ...m, id: crypto.randomUUID(), isStreaming: false }
          : m
      );
      return {
        streamingClaimNumber: null,
        chatHistories: { ...s.chatHistories, [claimNumber]: updated },
      };
    }),

  clearChat: (claimNumber) =>
    set(s => ({
      chatHistories: { ...s.chatHistories, [claimNumber]: [] },
    })),

  setWeights: (claimNumber, weights) =>
    set(s => ({ weightResults: { ...s.weightResults, [claimNumber]: weights } })),

  updateWeight: (claimNumber, index, weight) =>
    set(s => {
      const current = s.weightResults[claimNumber] ?? [];
      const stars: 1 | 2 | 3 = weight === '핵심' ? 3 : weight === '보조' ? 2 : 1;
      const updated = current.map((item, i) =>
        i === index ? { ...item, weight, stars } : item
      );
      return { weightResults: { ...s.weightResults, [claimNumber]: updated } };
    }),

  clearWeights: (claimNumber) =>
    set(s => {
      const next = { ...s.weightResults };
      delete next[claimNumber];
      return { weightResults: next };
    }),
}));
