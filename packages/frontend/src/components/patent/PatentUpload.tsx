import React, { useCallback, useRef, useState } from 'react';
import { Upload, FileText, AlertCircle, Link, PenLine, X } from 'lucide-react';
import { usePatentStore } from '../../store/patentStore';
import { PatentParseResult } from '../../types/patent';
import { cn } from '../../lib/utils';

type InputMode = 'pdf' | 'text';
type ContextType = 'pdf' | 'url';

export function PatentUpload() {
  const { setResult, setUploading, setError, isUploading } = usePatentStore();
  const [mode, setMode] = useState<InputMode>('pdf');

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 px-8">
      <div className="w-16 h-16 bg-violet-50 border border-violet-200 rounded-2xl flex items-center justify-center">
        <FileText size={28} className="text-violet-500" />
      </div>

      <div className="text-center">
        <h2 className="text-lg font-bold text-gray-800 mb-1">선행발명 검색</h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          출원발명의 청구항을 입력하여 선행발명 검색을 시작하세요
        </p>
      </div>

      {/* 탭 */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1 w-full max-w-md">
        <button
          onClick={() => setMode('pdf')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all',
            mode === 'pdf'
              ? 'bg-white text-violet-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <Upload size={14} />
          PDF 업로드
        </button>
        <button
          onClick={() => setMode('text')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all',
            mode === 'text'
              ? 'bg-white text-violet-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <PenLine size={14} />
          직접 입력
        </button>
      </div>

      {mode === 'pdf'
        ? <PdfUploadPanel setResult={setResult} setUploading={setUploading} setError={setError} isUploading={isUploading} />
        : <TextInputPanel setResult={setResult} setUploading={setUploading} setError={setError} isUploading={isUploading} />
      }

      <ErrorMessage />
    </div>
  );
}

// ── PDF 업로드 패널 ──────────────────────────────────────────
interface PanelProps {
  setResult: (r: PatentParseResult, pdfText: string, contextText?: string, contextSource?: 'pdf' | 'url') => void;
  setUploading: (v: boolean) => void;
  setError: (e: string | null) => void;
  isUploading: boolean;
}

function PdfUploadPanel({ setResult, setUploading, setError, isUploading }: PanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('PDF 파일만 지원합니다');
      return;
    }
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append('pdf', file);
    try {
      const res = await fetch('/api/patent/parse', { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? '파싱 실패');
      }
      const data: PatentParseResult & { pdfText?: string } = await res.json();
      setResult(data, data.pdfText ?? '');
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
    }
  }, [setResult, setUploading, setError]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f); }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'w-full max-w-md border-2 border-dashed rounded-xl p-8',
        'flex flex-col items-center gap-3 cursor-pointer transition-all',
        isDragging
          ? 'border-violet-400 bg-violet-50'
          : 'border-gray-300 hover:border-violet-400 hover:bg-violet-50'
      )}
    >
      <Upload size={24} className={isDragging ? 'text-violet-500' : 'text-gray-400'} />
      <div className="text-center">
        <p className="text-sm font-medium text-gray-700">
          {isUploading ? '분석 중...' : 'PDF 파일을 드래그하거나 클릭하여 업로드'}
        </p>
        <p className="text-xs text-gray-400 mt-1">한국어 특허 PDF 권장</p>
      </div>
      <input ref={inputRef} type="file" accept=".pdf" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
    </div>
  );
}

// ── 직접 입력 패널 ───────────────────────────────────────────
function TextInputPanel({ setResult, setUploading, setError, isUploading }: PanelProps) {
  const [claimText, setClaimText] = useState('');
  const [contextType, setContextType] = useState<ContextType | null>(null);
  const [contextUrl, setContextUrl] = useState('');
  const [contextFile, setContextFile] = useState<File | null>(null);
  const [isDraggingCtx, setIsDraggingCtx] = useState(false);
  const ctxFileRef = useRef<HTMLInputElement>(null);

  const handleContextFileSelect = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('참고 자료는 PDF 파일만 지원합니다');
      return;
    }
    setContextFile(file);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!claimText.trim()) {
      setError('청구항 텍스트를 입력해주세요');
      return;
    }
    setUploading(true);
    setError(null);

    const form = new FormData();
    form.append('claimText', claimText.trim());
    if (contextType === 'url' && contextUrl.trim()) {
      form.append('contextUrl', contextUrl.trim());
    } else if (contextType === 'pdf' && contextFile) {
      form.append('contextPdf', contextFile);
    }

    try {
      const res = await fetch('/api/patent/parse-text', { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? '분석 실패');
      }
      const data: PatentParseResult & { contextText?: string; contextSource?: 'pdf' | 'url' } = await res.json();
      setResult(data, data.pdfText ?? '', data.contextText, data.contextSource);
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-3">
      {/* 청구항 입력 */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">청구항 텍스트</label>
        <textarea
          value={claimText}
          onChange={e => setClaimText(e.target.value)}
          placeholder={"예) 프로세서 및 메모리를 포함하는 장치에 있어서,\n상기 프로세서가 데이터를 처리하고;\n상기 메모리가 처리 결과를 저장하는\n장치."}
          rows={6}
          className="w-full text-sm rounded-xl border border-gray-200 px-3 py-2.5
            focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none leading-relaxed
            placeholder:text-gray-300"
        />
        <p className="text-xs text-gray-400 mt-1">
          청구항 번호(청구항 1, 제1항 등)를 포함하면 다수 항도 분석 가능합니다
        </p>
      </div>

      {/* 참고 자료 (선택) */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
          <p className="text-xs font-semibold text-gray-600">
            참고 자료 추가 <span className="font-normal text-gray-400">(선택) — 청구항 해석 보조</span>
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            청구항 내용이 모호할 때 PDF 또는 URL로 해석 기준을 제공하세요
          </p>
        </div>

        <div className="p-3 space-y-2">
          {/* 타입 선택 */}
          <div className="flex gap-2">
            {(['pdf', 'url'] as ContextType[]).map(type => (
              <button
                key={type}
                onClick={() => setContextType(contextType === type ? null : type)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all',
                  contextType === type
                    ? 'bg-violet-50 border-violet-300 text-violet-700'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                )}
              >
                {type === 'pdf' ? <FileText size={12} /> : <Link size={12} />}
                {type === 'pdf' ? 'PDF 파일' : 'URL'}
              </button>
            ))}
          </div>

          {/* PDF 참고 자료 */}
          {contextType === 'pdf' && (
            contextFile ? (
              <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                <FileText size={14} className="text-violet-500 shrink-0" />
                <span className="text-xs text-violet-700 truncate flex-1">{contextFile.name}</span>
                <button onClick={() => setContextFile(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div
                onDragOver={e => { e.preventDefault(); setIsDraggingCtx(true); }}
                onDragLeave={() => setIsDraggingCtx(false)}
                onDrop={e => {
                  e.preventDefault(); setIsDraggingCtx(false);
                  const f = e.dataTransfer.files[0]; if (f) handleContextFileSelect(f);
                }}
                onClick={() => ctxFileRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-lg p-4 flex flex-col items-center gap-1.5 cursor-pointer transition-all',
                  isDraggingCtx
                    ? 'border-violet-400 bg-violet-50'
                    : 'border-gray-200 hover:border-violet-300 hover:bg-violet-50'
                )}
              >
                <Upload size={16} className="text-gray-400" />
                <p className="text-xs text-gray-500">참고용 PDF 드래그 또는 클릭</p>
                <input ref={ctxFileRef} type="file" accept=".pdf" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleContextFileSelect(f); }} />
              </div>
            )
          )}

          {/* URL 참고 자료 */}
          {contextType === 'url' && (
            <div className="flex gap-2">
              <input
                type="url"
                value={contextUrl}
                onChange={e => setContextUrl(e.target.value)}
                placeholder="https://patents.google.com/..."
                className="flex-1 text-xs rounded-lg border border-gray-200 px-2.5 py-2
                  focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
          )}
        </div>
      </div>

      {/* 제출 버튼 */}
      <button
        onClick={handleSubmit}
        disabled={isUploading || !claimText.trim()}
        className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium
          rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isUploading ? '분석 중...' : '청구항 분석 시작'}
      </button>
    </div>
  );
}

function ErrorMessage() {
  const { error } = usePatentStore();
  if (!error) return null;
  return (
    <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm max-w-md w-full">
      <AlertCircle size={14} className="shrink-0" />
      {error}
    </div>
  );
}
