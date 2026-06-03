import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Sparkles, Search, ChevronDown, Settings, AlertTriangle,
  Send, RotateCcw, ChevronUp, Loader2, Scale,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { usePatentStore } from '../../store/patentStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePromptStore } from '../../store/promptStore';
import { ClaimPart, PatentChatMessage, WeightItem } from '../../types/patent';
import { cn } from '../../lib/utils';

// 검색 단계: idle → weighting → confirming → (idle + streaming)
type SearchPhase = 'idle' | 'weighting' | 'confirming' | 'fastReview';
type ErrorKind = 'weight' | 'search' | null;
type SearchMode = 'fast' | 'precise';

const WEIGHT_STARS: Record<string, string> = { '핵심': '★★★', '보조': '★★☆', '관용': '★☆☆' };
const WEIGHT_COLOR: Record<string, string> = {
  '핵심': 'text-rose-600 bg-rose-50 border-rose-200',
  '보조': 'text-amber-600 bg-amber-50 border-amber-200',
  '관용': 'text-gray-500 bg-gray-50 border-gray-200',
};

export function ClaimDetail() {
  const {
    selectedTree, selectedDependent,
    pdfText, contextText, contextSource, priorityDate, priorityDateLabel, purposeAndEffect,
    searchPromptId, setSearchPromptId,
    isAnalyzing, streamingClaimNumber,
    setAnalyzing, setError, error,
    addMessage, startStreaming, appendStreamChunk, finalizeStreaming,
    updateClaimParts, clearChat, chatHistories,
    weightResults, setWeights, updateWeight, clearWeights,
  } = usePatentStore();
  const { selectedLLM, selectedModel } = useSettingsStore();
  const { prompts, openManager } = usePromptStore();
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<SearchPhase>('idle');
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [structureOpen, setStructureOpen] = useState(true);
  const [purposeOpen, setPurposeOpen] = useState(false);
  const [fastResult, setFastResult] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const claimNumber = selectedDependent?.number ?? selectedTree?.root.number ?? 0;
  const messages = chatHistories[claimNumber] ?? [];
  const isStreaming = streamingClaimNumber === claimNumber;
  const weights = weightResults[claimNumber] ?? [];
  const selectedPrompt = prompts.find(p => p.id === searchPromptId) ?? null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isStreaming, phase]);

  useEffect(() => {
    setInput('');
    setPhase('idle');
    setErrorKind(null);
    setFastResult('');
    setError(null);
  }, [claimNumber]);

  const getHistoryForSend = useCallback(
    (withNewUserMsg?: string) => {
      const base = messages
        .filter(m => !m.isStreaming)
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      if (withNewUserMsg) base.push({ role: 'user', content: withNewUserMsg });
      return base;
    },
    [messages]
  );

  // 검색 SSE 스트리밍
  const streamSearch = useCallback(async (
    historyForSend: { role: 'user' | 'assistant'; content: string }[],
    searchWeights?: WeightItem[],
    mode: SearchMode = 'precise',
    priorFastResult?: string
  ): Promise<string> => {
    if (!selectedTree) return '';
    startStreaming(claimNumber);
    let accumulated = '';
    let errorMsg: string | null = null;

    try {
      setErrorKind('search');
      const res = await fetch('/api/patent/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimNumber,
          parts: selectedTree.root.parts,
          dependentClaimText: selectedDependent?.rawText,
          llmType: selectedLLM ?? 'claude',
          model: selectedModel,
          pdfText: mode === 'precise' ? (pdfText ?? '').slice(0, 40000) : '',
          promptContent: searchWeights ? undefined : selectedPrompt?.content,
          messages: historyForSend,
          contextText: mode === 'precise' ? contextText ?? undefined : undefined,
          contextSource: mode === 'precise' ? contextSource ?? undefined : undefined,
          priorityDate: priorityDate ?? undefined,
          priorityDateLabel: priorityDateLabel ?? undefined,
          weights: searchWeights,
          mode,
          fastResult: priorFastResult,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`검색 오류 (${res.status}): ${errText}`);
      }
      if (!res.body) throw new Error('스트림 없음');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      const processLine = (line: string) => {
        if (!line.startsWith('data: ')) return;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === 'chunk' && evt.content) {
            accumulated += evt.content;
            appendStreamChunk(claimNumber, evt.content);
          }
          else if (evt.type === 'done') finalizeStreaming(claimNumber);
          else if (evt.type === 'error') {
            errorMsg = evt.error;
            setError(evt.error);
            finalizeStreaming(claimNumber);
          }
        } catch { /* skip */ }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const l of lines) processLine(l);
      }
      if (buf.trim()) buf.split('\n').forEach(processLine);

      if (errorMsg) {
        throw new Error(errorMsg);
      }

      finalizeStreaming(claimNumber);
      return accumulated;
    } catch (e) {
      setError(String(e));
      finalizeStreaming(claimNumber);
      throw e;
    }
  }, [selectedTree, selectedDependent, claimNumber, selectedLLM, selectedModel, pdfText, contextText,
      contextSource, selectedPrompt, startStreaming, appendStreamChunk, finalizeStreaming, setError]);

  const hasHighSimilarityCandidate = (content: string) => {
    if (/85%\s*이상\s*후보\s*없음|85%\s*이상.*없음|후보\s*없음/i.test(content)) return false;
    const scores = [...content.matchAll(/(\d{1,3})\s*%/g)]
      .map(m => Number(m[1]))
      .filter(n => Number.isFinite(n) && n <= 100);
    return scores.some(score => score >= 85);
  };

  // 1단계: 빠른검색 (LLM 1회)
  const handleFastSearchStart = useCallback(async () => {
    if (isStreaming || (phase !== 'idle' && phase !== 'confirming') || !selectedTree) return;
    clearChat(claimNumber);
    clearWeights(claimNumber);
    setFastResult('');
    setError(null);
    setErrorKind(null);

    const displayLabel = selectedPrompt
      ? `빠른검색 시작 · ${selectedPrompt.name}`
      : '빠른검색 시작';

    addMessage(claimNumber, {
      id: crypto.randomUUID(),
      role: 'user',
      content: '__FAST_SEARCH_START__',
      displayLabel,
    });

    try {
      const result = await streamSearch([{ role: 'user', content: '__FAST_SEARCH_START__' }], undefined, 'fast');
      setFastResult(result);
      setPhase(hasHighSimilarityCandidate(result) ? 'idle' : 'fastReview');
    } catch (e) {
      setPhase('idle');
    }
  }, [isStreaming, phase, selectedTree, selectedPrompt, claimNumber, selectedLLM,
      clearChat, clearWeights, addMessage, streamSearch, setError]);

  // 정밀검색: 가중치 분석 후 빠른검색 결과를 재사용해 검색
  const handlePreciseSearchStart = useCallback(async () => {
    if (isStreaming || !selectedTree) return;
    setError(null);
    setErrorKind(null);
    setPhase('weighting');
    try {
      setErrorKind('weight');
      const res = await fetch('/api/patent/weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimNumber,
          parts: selectedTree.root.parts,
          dependentClaimText: selectedDependent?.rawText,
          llmType: selectedLLM ?? 'claude',
          model: selectedModel,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { weights: newWeights } = await res.json();
      setWeights(claimNumber, newWeights);

      const displayLabel = '정밀검색 시작 (빠른검색 결과 재사용)';
      addMessage(claimNumber, {
        id: crypto.randomUUID(),
        role: 'user',
        content: '__PRECISE_SEARCH_START__',
        displayLabel,
      });

      setPhase('idle');
      await streamSearch(
        [{ role: 'user', content: '__PRECISE_SEARCH_START__' }],
        newWeights,
        'precise',
        fastResult
      );
    } catch (e) {
      setError(String(e));
      setPhase('idle');
    }
  }, [isStreaming, phase, selectedTree, selectedDependent, claimNumber, selectedLLM, selectedModel,
      fastResult, setWeights, addMessage, streamSearch, setError]);

  // 2단계: 가중치 확정 후 검색
  const handleSearchWithWeights = useCallback(async () => {
    if (!selectedTree || weights.length === 0) return;
    setPhase('idle');

    const displayLabel = selectedPrompt
      ? `선행발명 검색 시작 — ${selectedPrompt.name}`
      : '선행발명 검색 시작 (가중치 분석 완료)';

    const userMsg: PatentChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: '__SEARCH_START__',
      displayLabel,
    };
    addMessage(claimNumber, userMsg);

    try {
      await streamSearch([{ role: 'user', content: '__SEARCH_START__' }], weights, 'precise', fastResult);
    } catch (e) {
      setPhase('idle');
    }
  }, [selectedTree, weights, selectedPrompt, claimNumber, addMessage, streamSearch, fastResult]);

  // 멀티턴 추가 질문
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');

    const userMsg: PatentChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    };
    addMessage(claimNumber, userMsg);
    const history = getHistoryForSend(text);
    try {
      await streamSearch(history, undefined, 'precise', fastResult);
    } catch (e) {
      setPhase('idle');
    }
  }, [input, isStreaming, addMessage, claimNumber, getHistoryForSend, streamSearch, fastResult]);

  const handleLLMAnalyze = useCallback(async () => {
    if (!selectedTree) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch('/api/patent/analyze-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimNumber, rawText: selectedTree.root.rawText }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { parts } = await res.json();
      updateClaimParts(claimNumber, parts);
    } catch (e) {
      setError(String(e));
    } finally {
      setAnalyzing(false);
    }
  }, [selectedTree, claimNumber, setAnalyzing, setError, updateClaimParts]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!selectedTree) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        좌측에서 독립항을 선택하세요
      </div>
    );
  }

  const { root } = selectedTree;
  const isActive = (phase !== 'idle' && phase !== 'fastReview') || isStreaming;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── 헤더 ─────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center gap-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5 mr-auto">
          <span className="text-xs font-semibold text-violet-700 bg-violet-100 px-2 py-0.5 rounded">
            제{claimNumber}항 독립항
          </span>
          {selectedDependent && (
            <span className="text-xs font-semibold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
              › 제{selectedDependent.number}항 종속항
            </span>
          )}
        </div>

        {root.needsLLM && (
          <button
            onClick={handleLLMAnalyze}
            disabled={isAnalyzing || isActive}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg
              bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 transition-colors"
          >
            <Sparkles size={11} />
            {isAnalyzing ? '분석 중…' : 'LLM 구성 분석'}
          </button>
        )}

        {/* 프롬프트 드롭다운은 가중치 확정 전에만 표시 */}
        {phase !== 'confirming' && (
          <PromptDropdown
            prompts={prompts}
            selectedId={searchPromptId}
            onSelect={setSearchPromptId}
            onOpenManager={openManager}
          />
        )}

        {/* 검색 시작 / 재검색 버튼 */}
        {phase === 'idle' && (
          <button
            onClick={handleFastSearchStart}
            disabled={isStreaming}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg
              bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 transition-colors"
          >
            <Scale size={11} />
            {messages.length > 0 ? '빠른 재검색' : '빠른검색'}
          </button>
        )}

        {phase === 'weighting' && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-violet-600">
            <Loader2 size={12} className="animate-spin" />
            가중치 분석 중…
          </div>
        )}

        {phase === 'confirming' && (
          <button
            onClick={handleFastSearchStart}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg
              border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
          >
            <RotateCcw size={11} />
            빠른 재검색
          </button>
        )}

        {messages.length > 0 && phase === 'idle' && (
          <button
            onClick={() => { clearChat(claimNumber); clearWeights(claimNumber); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
            title="대화 초기화"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>

      {/* ── 청구항 구조 (접기 가능) ───────────────────────────── */}
      <div className="shrink-0 border-b border-gray-100">
        <button
          onClick={() => setStructureOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2 text-xs
            text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <span className="font-medium">청구항 구조</span>
          {structureOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {structureOpen && (
          <div className="px-4 pb-3 space-y-1.5">
            {root.parts.map((part, i) => (
              <ClaimPartRow key={i} part={part} />
            ))}
          </div>
        )}
      </div>

      {/* ── 목적 및 효과 ─────────────────────────────────────── */}
      {purposeAndEffect && (
        <div className="shrink-0 border-b border-gray-100">
          <button
            onClick={() => setPurposeOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs
              text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <span className="font-medium text-emerald-700">목적 및 효과</span>
            {purposeOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {purposeOpen && (
            <div className="px-4 pb-3">
              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                {purposeAndEffect}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── 종속항 원문 ──────────────────────────────────────── */}
      {selectedDependent && (
        <div className="shrink-0 border-b border-gray-100 px-4 py-3 bg-indigo-50/40">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold text-indigo-600">
              제{selectedDependent.number}항 종속항
            </span>
            <span className="text-xs text-gray-400">
              (제{selectedDependent.refersTo.join('·')}항 인용)
            </span>
          </div>
          <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
            {selectedDependent.rawText}
          </p>
        </div>
      )}

      {/* ── 채팅 / 가중치 영역 ───────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

        {/* 에러 표시 */}
        {error && phase === 'idle' && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-500" />
            <div>
              <p className="font-semibold mb-0.5">
                {errorKind === 'search' ? '선행발명 검색 오류' : '가중치 분석 오류'}
              </p>
              <p className="text-red-600 break-all">{error}</p>
            </div>
          </div>
        )}

        {/* 가중치 분석 중 스피너 */}
        {phase === 'weighting' && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-violet-600">
            <Loader2 size={28} className="animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium">구성 가중치 분석 중</p>
              <p className="text-xs text-gray-400 mt-1">
                {selectedLLM === 'gemini' ? 'Gemini Flash' : 'Claude Haiku'}
                가 각 구성의 핵심도를 판단하고 있습니다
              </p>
            </div>
          </div>
        )}

        {/* 가중치 확인 테이블 */}
        {phase === 'confirming' && weights.length > 0 && (
          <WeightTable
            weights={weights}
            claimNumber={claimNumber}
            llmName={selectedLLM === 'gemini' ? 'Gemini Flash' : 'Claude Haiku'}
            onWeightChange={(i, w) => updateWeight(claimNumber, i, w)}
            onSearch={handleSearchWithWeights}
          />
        )}

        {/* 가중치가 비어있는 경우 */}
        {phase === 'confirming' && weights.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            <AlertTriangle size={24} className="text-amber-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-600">가중치를 분석하지 못했습니다</p>
              <p className="text-xs mt-1">청구항 구성이 분리되지 않았을 수 있습니다.<br/>
                LLM 구성 분석 후 다시 시도하거나, 재분석을 눌러보세요.</p>
            </div>
          </div>
        )}

        {/* 빈 상태 안내 */}
        {phase === 'idle' && messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-sm text-gray-400 space-y-1">
              <Search size={24} className="mx-auto text-gray-300 mb-2" />
              <p>위 <span className="text-violet-600 font-medium">검색 시작</span> 버튼을 눌러</p>
              <p>선행발명 검색을 시작하세요.</p>
              <p className="text-xs text-gray-300 mt-2">
                경량 모델이 구성 가중치를 먼저 분석한 뒤<br />
                강력한 모델이 선행발명을 검색합니다.
              </p>
            </div>
          </div>
        )}

        {/* 채팅 메시지 */}
        {messages.map(msg => (
          <ChatBubble key={msg.id} message={msg} />
        ))}

        {phase === 'fastReview' && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-500" />
              <div className="flex-1">
                <p className="font-semibold">85% 이상 유사 후보가 뚜렷하게 검색되지 않았습니다.</p>
                <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                  빠른검색 결과를 캐시로 재사용해서 PDF/참고자료/가중치 분석까지 포함한 정밀검색을 수행할까요?
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handlePreciseSearchStart}
                    disabled={isStreaming}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    정밀검색 수행
                  </button>
                  <button
                    onClick={() => setPhase('idle')}
                    disabled={isStreaming}
                    className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white hover:bg-amber-50 text-amber-700 text-xs font-medium disabled:opacity-50"
                  >
                    빠른검색 결과로 충분
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── 입력창 (멀티턴 추가 질문) ───────────────────────── */}
      {messages.length > 0 && phase === 'idle' && (
        <div className="shrink-0 border-t border-gray-200 px-4 py-3">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder={isStreaming ? '응답 중…' : '추가 설명이나 질문을 입력하세요 (Enter 전송)'}
              rows={2}
              className="flex-1 resize-none text-sm rounded-lg border border-gray-200
                px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300
                disabled:bg-gray-50 disabled:text-gray-400 leading-relaxed"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="p-2.5 rounded-lg bg-violet-600 hover:bg-violet-700
                text-white disabled:opacity-40 transition-colors shrink-0"
            >
              <Send size={15} />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Enter 전송 · Shift+Enter 줄바꿈
          </p>
        </div>
      )}
    </div>
  );
}

// ── 가중치 확인 테이블 ───────────────────────────────────────────
function WeightTable({
  weights, claimNumber, llmName, onWeightChange, onSearch,
}: {
  weights: WeightItem[];
  claimNumber: number;
  llmName: string;
  onWeightChange: (index: number, weight: '핵심' | '보조' | '관용') => void;
  onSearch: () => void;
}) {
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-violet-100/60 border-b border-violet-200">
        <div className="flex items-center gap-2">
          <Scale size={13} className="text-violet-600" />
          <span className="text-xs font-semibold text-violet-700">구성 가중치 분석 결과</span>
          <span className="text-xs text-violet-400">({llmName})</span>
        </div>
        <span className="text-xs text-violet-500">필요 시 가중치를 수정하세요</span>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-violet-100">
              <th className="px-3 py-2 text-left text-gray-500 font-medium w-12">구성</th>
              <th className="px-3 py-2 text-left text-gray-500 font-medium">내용</th>
              <th className="px-3 py-2 text-left text-gray-500 font-medium w-32">가중치</th>
              <th className="px-3 py-2 text-left text-gray-500 font-medium">판단 이유</th>
            </tr>
          </thead>
          <tbody>
            {/* 독립항 구성 */}
            {weights.filter(w => !w.isDep).map((item, i) => (
              <WeightRow
                key={i}
                item={item}
                globalIndex={weights.indexOf(item)}
                onWeightChange={onWeightChange}
              />
            ))}
            {/* 종속항 고유 구성 — 구분선 + 강조 */}
            {weights.some(w => w.isDep) && (
              <>
                <tr>
                  <td colSpan={4} className="px-3 py-1.5 bg-indigo-50 border-y border-indigo-200">
                    <span className="text-xs font-semibold text-indigo-600">
                      종속항 고유 구성 — 검색 핵심 타겟
                    </span>
                  </td>
                </tr>
                {weights.filter(w => w.isDep).map((item) => (
                  <WeightRow
                    key={`dep-${weights.indexOf(item)}`}
                    item={item}
                    globalIndex={weights.indexOf(item)}
                    onWeightChange={onWeightChange}
                    highlight
                  />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* 검색 버튼 */}
      <div className="px-4 py-3 border-t border-violet-100 flex justify-end">
        <button
          onClick={onSearch}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg
            bg-violet-600 hover:bg-violet-700 text-white transition-colors shadow-sm"
        >
          <Search size={12} />
          이 가중치로 검색 시작
        </button>
      </div>
    </div>
  );
}

// ── 가중치 행 ───────────────────────────────────────────────
function WeightRow({
  item, globalIndex, onWeightChange, highlight = false,
}: {
  item: WeightItem;
  globalIndex: number;
  onWeightChange: (index: number, weight: '핵심' | '보조' | '관용') => void;
  highlight?: boolean;
}) {
  return (
    <tr className={cn(
      'border-b last:border-0',
      highlight
        ? 'bg-indigo-50/60 border-indigo-100 hover:bg-indigo-50'
        : 'border-violet-50 hover:bg-violet-50/60'
    )}>
      <td className="px-3 py-2 text-center">
        <span className={cn(
          'font-mono font-bold',
          highlight ? 'text-indigo-600' : 'text-violet-600'
        )}>
          {item.label ? `(${item.label})` : '—'}
        </span>
      </td>
      <td className={cn(
        'px-3 py-2 leading-relaxed max-w-[240px]',
        highlight ? 'text-indigo-800 font-medium' : 'text-gray-700'
      )}>
        {item.text}
      </td>
      <td className="px-3 py-2">
        <select
          value={item.weight}
          onChange={e => onWeightChange(globalIndex, e.target.value as '핵심' | '보조' | '관용')}
          className={cn(
            'text-xs font-medium rounded-md border px-2 py-1 appearance-none cursor-pointer',
            'focus:outline-none focus:ring-1 focus:ring-violet-400',
            WEIGHT_COLOR[item.weight]
          )}
        >
          <option value="핵심">★★★ 핵심</option>
          <option value="보조">★★☆ 보조</option>
          <option value="관용">★☆☆ 관용</option>
        </select>
      </td>
      <td className="px-3 py-2 text-gray-500 leading-relaxed">
        {item.reason}
      </td>
    </tr>
  );
}

// ── 채팅 말풍선 ──────────────────────────────────────────────
function ChatBubble({ message }: { message: PatentChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-2.5', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center shrink-0 mt-0.5">
          <Search size={12} className="text-violet-600" />
        </div>
      )}

      <div className={cn(
        'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
        isUser
          ? 'bg-violet-600 text-white rounded-tr-sm'
          : 'bg-gray-100 text-gray-800 rounded-tl-sm'
      )}>
        {isUser ? (
          <p className="leading-relaxed whitespace-pre-wrap">
            {message.displayLabel ?? message.content}
          </p>
        ) : (
          <div className={cn(
            'prose prose-sm max-w-none',
            'prose-headings:text-gray-800 prose-p:text-gray-800',
            'prose-strong:text-gray-900 prose-code:text-violet-700',
            message.isStreaming && 'after:content-["▋"] after:animate-pulse after:ml-0.5'
          )}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content || ' '}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 프롬프트 드롭다운 ────────────────────────────────────────
interface PromptDropdownProps {
  prompts: { id: string; name: string; content: string }[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenManager: () => void;
}

function PromptDropdown({ prompts, selectedId, onSelect, onOpenManager }: PromptDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = prompts.find(p => p.id === selectedId);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all',
          selected
            ? 'bg-violet-50 border-violet-300 text-violet-700'
            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
        )}
      >
        <Sparkles size={11} className={selected ? 'text-violet-500' : 'text-gray-400'} />
        {selected ? selected.name : '프롬프트'}
        <ChevronDown size={10} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 w-72 bg-white border border-gray-200
          rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-600">검색 프롬프트</span>
            <button
              onClick={() => { setOpen(false); onOpenManager(); }}
              className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700"
            >
              <Settings size={11} /> 관리
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <button
              onClick={() => { onSelect(null); setOpen(false); }}
              className={cn(
                'w-full text-left px-3 py-2 text-sm transition-colors',
                !selectedId ? 'bg-violet-50 text-violet-700' : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              <span className="font-medium">기본 프롬프트</span>
              <p className="text-xs text-gray-400 mt-0.5">step별 선행발명 검색·비교 분석</p>
            </button>

            {prompts.length === 0 && (
              <div className="px-3 py-4 text-xs text-gray-400 text-center">
                저장된 프롬프트가 없습니다<br />
                <button onClick={() => { setOpen(false); onOpenManager(); }}
                  className="text-violet-500 mt-1 underline">추가하기</button>
              </div>
            )}

            {prompts.map(p => (
              <button key={p.id}
                onClick={() => { onSelect(p.id); setOpen(false); }}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm transition-colors',
                  selectedId === p.id ? 'bg-violet-50 text-violet-700' : 'text-gray-700 hover:bg-gray-50'
                )}
              >
                {p.name}
                {p.content.includes('{{claim}}') && (
                  <span className="ml-2 text-xs text-gray-400">{'{{claim}}'}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 청구항 구조 행 ───────────────────────────────────────────
function ClaimPartRow({ part }: { part: ClaimPart }) {
  if (part.kind === 'preamble') {
    return (
      <div className="flex gap-2.5 items-start">
        <span className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200
          px-1.5 py-0.5 rounded shrink-0 mt-0.5 min-w-[2rem] text-center">(전제부)</span>
        <p className="text-xs text-gray-700 leading-relaxed">{part.text}</p>
      </div>
    );
  }
  if (part.kind === 'tail') {
    return (
      <div className="flex gap-2.5 items-start">
        <span className="text-xs font-bold text-green-600 bg-green-50 border border-green-200
          px-1.5 py-0.5 rounded shrink-0 mt-0.5 min-w-[2rem] text-center">(어미)</span>
        <p className="text-xs text-gray-700 leading-relaxed">{part.text}</p>
      </div>
    );
  }
  return (
    <div className="flex gap-2.5 items-start">
      {part.label ? (
        <span className="text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200
          px-1.5 py-0.5 rounded shrink-0 mt-0.5 min-w-[2rem] text-center">({part.label})</span>
      ) : (
        <span className="text-xs text-gray-400 border border-gray-200
          px-1.5 py-0.5 rounded shrink-0 mt-0.5 min-w-[2rem] text-center">—</span>
      )}
      <p className={cn('text-xs leading-relaxed', part.isSimple ? 'text-gray-500' : 'text-gray-700')}>
        {part.text}
      </p>
    </div>
  );
}
