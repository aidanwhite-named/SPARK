import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Sparkles, Search, ChevronDown, Settings, AlertTriangle,
  Send, RotateCcw, ChevronUp,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { usePatentStore } from '../../store/patentStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePromptStore } from '../../store/promptStore';
import { ClaimPart, PatentChatMessage } from '../../types/patent';
import { cn } from '../../lib/utils';

export function ClaimDetail() {
  const {
    selectedTree, selectedDependent,
    pdfText, contextText, contextSource, priorityDate, priorityDateLabel,
    searchPromptId, setSearchPromptId,
    isAnalyzing, streamingClaimNumber,
    setAnalyzing, setError,
    addMessage, startStreaming, appendStreamChunk, finalizeStreaming,
    updateClaimParts, clearChat, chatHistories,
  } = usePatentStore();
  const { selectedLLM } = useSettingsStore();
  const { prompts, openManager } = usePromptStore();
  const [input, setInput] = useState('');
  const [structureOpen, setStructureOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── 선택된 항 관련 값 (null-safe) ──────────────────────────
  const claimNumber = selectedTree?.root.number ?? 0;
  const messages = chatHistories[claimNumber] ?? [];
  const isStreaming = streamingClaimNumber === claimNumber;
  const selectedPrompt = prompts.find(p => p.id === searchPromptId) ?? null;

  // ── 훅은 조건부 리턴 이전에 모두 선언 ──────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isStreaming]);

  useEffect(() => {
    setInput('');
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

  const streamSearch = useCallback(async (
    historyForSend: { role: 'user' | 'assistant'; content: string }[]
  ) => {
    if (!selectedTree) return;
    startStreaming(claimNumber);

    try {
      const res = await fetch('/api/patent/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimNumber,
          parts: selectedTree.root.parts,
          llmType: selectedLLM ?? 'claude',
          pdfText: pdfText ?? '',
          promptContent: selectedPrompt?.content,
          messages: historyForSend,
          contextText: contextText ?? undefined,
          contextSource: contextSource ?? undefined,
          priorityDate: priorityDate ?? undefined,
          priorityDateLabel: priorityDateLabel ?? undefined,
        }),
      });

      if (!res.body) throw new Error('스트림 없음');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      const processLine = (line: string) => {
        if (!line.startsWith('data: ')) return;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === 'chunk' && evt.content) appendStreamChunk(claimNumber, evt.content);
          else if (evt.type === 'done') finalizeStreaming(claimNumber);
          else if (evt.type === 'error') { setError(evt.error); finalizeStreaming(claimNumber); }
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
      finalizeStreaming(claimNumber);
    } catch (e) {
      setError(String(e));
      finalizeStreaming(claimNumber);
    }
  }, [selectedTree, claimNumber, selectedLLM, pdfText, contextText, contextSource, selectedPrompt,
      startStreaming, appendStreamChunk, finalizeStreaming, setError]);

  const handleSearchStart = useCallback(async () => {
    if (isStreaming || !selectedTree) return;
    clearChat(claimNumber);

    const displayLabel = selectedPrompt
      ? `선행발명 검색 시작 — ${selectedPrompt.name}`
      : '선행발명 검색 시작 (기본 프롬프트)';

    const userMsg: PatentChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: '__SEARCH_START__',
      displayLabel,
    };
    addMessage(claimNumber, userMsg);

    await streamSearch([{ role: 'user', content: '__SEARCH_START__' }]);
  }, [isStreaming, selectedTree, clearChat, claimNumber, selectedPrompt, addMessage, streamSearch]);

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
    await streamSearch(history);
  }, [input, isStreaming, addMessage, claimNumber, getHistoryForSend, streamSearch]);

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

  // ── 독립항 미선택 시 안내 ────────────────────────────────────
  if (!selectedTree) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        좌측에서 독립항을 선택하세요
      </div>
    );
  }

  const { root } = selectedTree;

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
            disabled={isAnalyzing}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg
              bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 transition-colors"
          >
            <Sparkles size={11} />
            {isAnalyzing ? '분석 중…' : 'LLM 구성 분석'}
          </button>
        )}

        <PromptDropdown
          prompts={prompts}
          selectedId={searchPromptId}
          onSelect={setSearchPromptId}
          onOpenManager={openManager}
        />

        <button
          onClick={handleSearchStart}
          disabled={isStreaming}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg
            bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 transition-colors"
        >
          <Search size={11} />
          {messages.length > 0 ? '재검색' : '검색 시작'}
        </button>

        {messages.length > 0 && (
          <button
            onClick={() => clearChat(claimNumber)}
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

      {/* ── 채팅 메시지 영역 ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-sm text-gray-400 space-y-1">
              <Search size={24} className="mx-auto text-gray-300 mb-2" />
              <p>위 <span className="text-violet-600 font-medium">검색 시작</span> 버튼을 눌러</p>
              <p>LLM과 대화를 시작하세요.</p>
              <p className="text-xs text-gray-300 mt-2">
                PDF 전문을 참고하여 청구항을 분석하고<br />
                선행발명을 찾아드립니다.
              </p>
            </div>
          </div>
        )}

        {messages.map(msg => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* ── 입력창 ───────────────────────────────────────────── */}
      {messages.length > 0 && (
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
          px-1.5 py-0.5 rounded shrink-0 mt-0.5 min-w-[2rem] text-center">어두</span>
        <p className="text-xs text-gray-700 leading-relaxed">{part.text}</p>
      </div>
    );
  }
  if (part.kind === 'tail') {
    return (
      <div className="flex gap-2.5 items-start">
        <span className="text-xs font-bold text-green-600 bg-green-50 border border-green-200
          px-1.5 py-0.5 rounded shrink-0 mt-0.5 min-w-[2rem] text-center">어미</span>
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
