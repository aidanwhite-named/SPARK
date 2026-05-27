import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save } from 'lucide-react';
import { usePromptStore } from '../../store/promptStore';
import { Prompt } from '../../types';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';

const EMPTY = { name: '', content: '' };

export function PromptManager() {
  const { prompts, isManagerOpen, closeManager, addPrompt, updatePrompt, removePrompt } = usePromptStore();
  const [editing, setEditing] = useState<Prompt | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editing) setForm({ name: editing.name, content: editing.content });
    else setForm(EMPTY);
    setError('');
  }, [editing]);

  const startNew = () => { setEditing(null); setForm(EMPTY); setError(''); };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('이름을 입력해주세요'); return; }
    if (!form.content.trim()) { setError('내용을 입력해주세요'); return; }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        const updated = await api.updatePrompt(editing.id, form);
        updatePrompt(updated);
        setEditing(updated);
      } else {
        const created = await api.createPrompt(form);
        addPrompt(created);
        setEditing(created);
      }
    } catch (e) {
      setError('저장 실패: 백엔드 서버가 실행 중인지 확인하세요');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Prompt) => {
    if (!confirm(`"${p.name}" 을 삭제하시겠습니까?`)) return;
    try {
      await api.deletePrompt(p.id);
      removePrompt(p.id);
      if (editing?.id === p.id) startNew();
    } catch {
      setError('삭제 실패');
    }
  };

  if (!isManagerOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-[820px] max-h-[80vh] bg-white border border-gray-200 rounded-2xl
        shadow-xl flex overflow-hidden">

        {/* 좌측 목록 */}
        <div className="w-56 border-r border-gray-100 flex flex-col bg-gray-50">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-200">
            <span className="text-sm font-semibold text-gray-700">프롬프트</span>
            <button onClick={startNew}
              className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 font-medium">
              <Plus size={12} /> 추가
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {prompts.length === 0 && (
              <div className="px-4 py-6 text-xs text-gray-400 text-center">
                프롬프트가 없습니다<br />추가 버튼을 눌러 만들어보세요
              </div>
            )}
            {prompts.map((p) => (
              <div key={p.id}
                onClick={() => setEditing(p)}
                className={cn(
                  'flex items-center justify-between px-3 py-2.5 cursor-pointer group transition-colors',
                  editing?.id === p.id
                    ? 'bg-violet-50 border-r-2 border-violet-500'
                    : 'hover:bg-gray-100'
                )}
              >
                <span className={cn('text-sm truncate', editing?.id === p.id ? 'text-violet-700 font-medium' : 'text-gray-700')}>
                  {p.name}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 ml-1 flex-shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 우측 편집 */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">
              {editing ? '프롬프트 편집' : '새 프롬프트'}
            </h3>
            <button onClick={closeManager} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
            {/* 이름 */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">이름</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder=""
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800
                  outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 placeholder-gray-300"
              />
            </div>

            {/* 내용 */}
            <div className="flex-1 flex flex-col">
              <label className="text-xs font-medium text-gray-500 mb-1.5">내용</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder=""
                className="flex-1 min-h-[260px] border border-gray-200 rounded-lg px-3 py-2.5
                  text-sm text-gray-800 font-mono leading-relaxed resize-none
                  outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
            </div>

            {error && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>

          <div className="px-5 py-3.5 border-t border-gray-100 flex justify-end gap-2">
            <button onClick={closeManager}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
              닫기
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700
                text-white text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
