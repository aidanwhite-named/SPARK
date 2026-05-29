import React from 'react';
import { RotateCcw, GitCompare, Loader2, FileSearch } from 'lucide-react';
import { usePatentStore } from '../../store/patentStore';
import { PatentUpload } from './PatentUpload';
import { ClaimTreePanel } from './ClaimTreePanel';
import { ClaimDetail } from './ClaimDetail';
import { LLMSelector } from '../llm/LLMSelector';
import { CompareResult } from '../../types/patent';

export function PatentPanel() {
  const { result, compareResult, isComparing, reset, setCompareResult, setComparing, setError } = usePatentStore();

  const handleCompare = async () => {
    if (!result) return;
    if (result.trees.length < 2) {
      setError('독립항이 2개 이상이어야 비교 분석이 가능합니다');
      return;
    }
    setComparing(true);
    setError(null);
    try {
      const res = await fetch('/api/patent/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: CompareResult = await res.json();
      setCompareResult(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setComparing(false);
    }
  };

  return (
    <main className="flex flex-col flex-1 h-full overflow-hidden bg-white">
      {/* ── 상단 바 — 항상 표시 ────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white shrink-0 gap-3">
        {/* LLM 선택기 */}
        <LLMSelector />

        {/* 특허 로드된 경우에만 오른쪽 액션 버튼 표시 */}
        {result && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-gray-400 hidden sm:inline truncate max-w-[180px]">
              {result.title
                ? result.title
                : `독립항 ${result.trees.length}개 · 총 ${result.totalClaims}항`}
            </span>

            {result.trees.length >= 2 && (
              <button
                onClick={handleCompare}
                disabled={isComparing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                  border border-violet-300 text-violet-700 hover:bg-violet-50
                  disabled:opacity-50 transition-colors"
              >
                {isComparing
                  ? <><Loader2 size={12} className="animate-spin" /> 비교 중…</>
                  : <><GitCompare size={12} /> {compareResult ? '재비교' : '청구항 비교'}</>
                }
              </button>
            )}

            <button
              onClick={reset}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500
                hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RotateCcw size={12} />
              새 파일
            </button>
          </div>
        )}

        {/* 특허 미로드 시 아이콘 */}
        {!result && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 shrink-0">
            <FileSearch size={13} />
            선행발명 검색
          </div>
        )}
      </div>

      {/* ── 컨텐츠 영역 ──────────────────────────────────── */}
      {!result ? (
        <PatentUpload />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* 좌: 청구항 트리 */}
          <div className="w-72 shrink-0 overflow-hidden">
            <ClaimTreePanel />
          </div>
          {/* 우: 청구항 상세 + 검색 */}
          <div className="flex-1 overflow-hidden">
            <ClaimDetail />
          </div>
        </div>
      )}
    </main>
  );
}
