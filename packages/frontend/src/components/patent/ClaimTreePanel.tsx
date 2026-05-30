import React, { useState } from 'react';
import { ChevronRight, ChevronDown, GitBranch, Equal, Layers, AlertCircle, CalendarClock } from 'lucide-react';
import { usePatentStore } from '../../store/patentStore';
import { ClaimTree, CompareResult, EquivalenceGroup, DependentEquivalence, EquivType, ParsedDependentClaim } from '../../types/patent';
import { cn } from '../../lib/utils';

const GROUP_PALETTE: Record<number, { bg: string; border: string; text: string; dot: string }> = {
  1: { bg: 'bg-violet-50',  border: 'border-violet-400', text: 'text-violet-700', dot: 'bg-violet-400' },
  2: { bg: 'bg-blue-50',    border: 'border-blue-400',   text: 'text-blue-700',   dot: 'bg-blue-400'   },
  3: { bg: 'bg-green-50',   border: 'border-green-400',  text: 'text-green-700',  dot: 'bg-green-400'  },
  4: { bg: 'bg-amber-50',   border: 'border-amber-400',  text: 'text-amber-700',  dot: 'bg-amber-400'  },
  5: { bg: 'bg-rose-50',    border: 'border-rose-400',   text: 'text-rose-700',   dot: 'bg-rose-400'   },
  6: { bg: 'bg-teal-50',    border: 'border-teal-400',   text: 'text-teal-700',   dot: 'bg-teal-400'   },
  7: { bg: 'bg-orange-50',  border: 'border-orange-400', text: 'text-orange-700', dot: 'bg-orange-400' },
  8: { bg: 'bg-pink-50',    border: 'border-pink-400',   text: 'text-pink-700',   dot: 'bg-pink-400'   },
};

const EQUIV_LABEL: Record<EquivType, string> = {
  identical:      '동일',
  category_only:  '카테고리만 상이',
  similar:        '유사',
};

function findGroup(num: number, groups: EquivalenceGroup[]): EquivalenceGroup | null {
  return groups.find(g => g.claimNumbers.includes(num)) ?? null;
}

function findDepGroup(num: number, depEquivs: DependentEquivalence[]): DependentEquivalence | null {
  return depEquivs.find(g => g.claimNumbers.includes(num)) ?? null;
}

export function ClaimTreePanel() {
  const { result, selectedTree, selectTree, selectedDependent, selectDependent, compareResult, priorityDate, priorityDateLabel } = usePatentStore();
  if (!result) return null;

  const groups = compareResult?.equivalenceGroups ?? [];
  const depEquivs = compareResult?.dependentEquivalences ?? [];

  return (
    <div className="flex flex-col h-full border-r border-gray-200">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-violet-500" />
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">청구항 트리</span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          총 {result.totalClaims}항 · 독립항 {result.trees.length}개
        </p>

        {priorityDate && (
          <div className="mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-blue-50 border border-blue-200">
            <CalendarClock size={11} className="text-blue-500 shrink-0" />
            <div className="min-w-0">
              <span className="text-xs font-semibold text-blue-700">
                {priorityDateLabel ?? '기준일'}
              </span>
              <span className="text-xs text-blue-600 ml-1.5">{priorityDate}</span>
            </div>
            <span className="text-[10px] text-blue-400 ml-auto shrink-0">선행발명 기준</span>
          </div>
        )}

        {groups.length > 0 && (
          <div className="mt-2 space-y-1">
            {groups.map(g => {
              const color = GROUP_PALETTE[g.groupId] ?? GROUP_PALETTE[1];
              return (
                <div key={g.groupId} className="flex items-center gap-1.5">
                  <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', color.dot)} />
                  <span className={cn('text-xs font-medium', color.text)}>
                    그룹{g.groupId}
                  </span>
                  <span className="text-xs text-gray-400">
                    — 제{g.claimNumbers.join('·')}항 ({EQUIV_LABEL[g.type]})
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 독립항 목록 — 스크롤 없이 전부 표시 */}
      <div className="flex-1 overflow-y-auto py-1">
        {result.trees.map(tree => (
          <TreeNode
            key={tree.root.number}
            tree={tree}
            isSelected={selectedTree?.root.number === tree.root.number}
            selectedDepNumber={selectedDependent?.number ?? null}
            onSelect={selectTree}
            onSelectDep={(dep) => { selectTree(tree); selectDependent(dep); }}
            groups={groups}
            depEquivs={depEquivs}
          />
        ))}
      </div>
    </div>
  );
}

function TreeNode({
  tree, isSelected, selectedDepNumber, onSelect, onSelectDep, groups, depEquivs,
}: {
  tree: ClaimTree;
  isSelected: boolean;
  selectedDepNumber: number | null;
  onSelect: (t: ClaimTree) => void;
  onSelectDep: (dep: ParsedDependentClaim) => void;
  groups: EquivalenceGroup[];
  depEquivs: DependentEquivalence[];
}) {
  const [depsOpen, setDepsOpen] = useState(true);
  const { root, dependents } = tree;
  const group = findGroup(root.number, groups);
  const color = group ? (GROUP_PALETTE[group.groupId] ?? GROUP_PALETTE[1]) : null;
  const hasDeps = dependents.length > 0;

  return (
    <div>
      {/* 독립항 행 */}
      <div className={cn(
        'flex items-stretch border-l-2 transition-all',
        isSelected
          ? color ? cn(color.bg, color.border) : 'bg-violet-50 border-violet-500'
          : color ? cn(color.bg, 'border-transparent') : 'border-transparent'
      )}>
        {/* 선택 버튼 (클릭 → 우측 상세 패널) */}
        <button
          onClick={() => onSelect(tree)}
          className={cn(
            'flex items-start gap-2 px-3 py-2.5 text-left flex-1 min-w-0',
            isSelected ? '' : 'hover:bg-black/5'
          )}
        >
          {/* 번호 뱃지 */}
          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            {color && <span className={cn('w-2 h-2 rounded-full', color.dot)} />}
            <span className={cn(
              'text-xs font-bold px-1.5 py-0.5 rounded',
              isSelected
                ? color ? cn(color.text, 'bg-white/60') : 'bg-violet-100 text-violet-700'
                : 'bg-gray-100 text-gray-600'
            )}>
              {root.number}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className={cn(
                'text-xs font-semibold',
                isSelected ? (color ? color.text : 'text-violet-700') : 'text-gray-700'
              )}>
                독립항
              </p>
              {group && <EquivBadge type={group.type} colorText={color!.text} />}
            </div>
            <p className="text-xs text-gray-400 truncate mt-0.5">
              {root.rawText.slice(0, 38)}…
            </p>
            {group?.type === 'similar' && group.diffComponents && group.diffComponents.length > 0 && (
              <div className="mt-1 flex items-center gap-1">
                <AlertCircle size={10} className="text-amber-500 shrink-0" />
                <span className="text-xs text-amber-600 truncate">
                  차이: {group.diffComponents.map(d => d.text).join(', ')}
                </span>
              </div>
            )}
          </div>
        </button>

        {/* 종속항 토글 버튼 */}
        {hasDeps && (
          <button
            onClick={() => setDepsOpen(v => !v)}
            className={cn(
              'flex items-center justify-center w-8 shrink-0 transition-colors',
              isSelected ? 'hover:bg-black/10' : 'hover:bg-black/5'
            )}
            title={depsOpen ? '종속항 접기' : `종속항 ${dependents.length}개 펼치기`}
          >
            <span className="flex flex-col items-center gap-0.5">
              {depsOpen
                ? <ChevronDown size={11} className="text-gray-400" />
                : <ChevronRight size={11} className="text-gray-400" />
              }
              <span className="text-[9px] text-gray-400 leading-none">{dependents.length}</span>
            </span>
          </button>
        )}
      </div>

      {/* 종속항 목록 — 접기/펼치기 */}
      {hasDeps && depsOpen && (
        <div className="ml-4 border-l-2 border-gray-200 py-0.5">
          {dependents.map(dep => {
            const depGroup = findDepGroup(dep.number, depEquivs);
            const depColor = depGroup ? (GROUP_PALETTE[depGroup.groupId] ?? GROUP_PALETTE[1]) : null;
            const isDepSelected = selectedDepNumber === dep.number;

            return (
              <button
                key={dep.number}
                onClick={() => onSelectDep(dep)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 mx-1 rounded-sm text-left transition-colors',
                  isDepSelected
                    ? 'bg-violet-100 border border-violet-300'
                    : depColor ? depColor.bg : 'hover:bg-gray-50'
                )}
              >
                <div className="flex items-center gap-1 shrink-0">
                  {depColor && (
                    <span className={cn('w-1.5 h-1.5 rounded-full', depColor.dot)} />
                  )}
                  <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded',
                    isDepSelected ? 'bg-violet-200 text-violet-700 font-bold' : 'bg-gray-100 text-gray-500'
                  )}>
                    {dep.number}
                  </span>
                </div>
                <p className={cn(
                  'text-xs truncate flex-1',
                  isDepSelected ? 'text-violet-600 font-medium' : 'text-gray-400'
                )}>
                  ↳ 제{dep.refersTo.join('·')}항 인용
                </p>
                {depGroup && (
                  <span className={cn('text-xs font-medium shrink-0', depColor!.text)}>≡</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EquivBadge({ type, colorText }: { type: EquivType; colorText: string }) {
  const icons: Record<EquivType, React.ReactNode> = {
    identical:     <Equal size={9} />,
    category_only: <Layers size={9} />,
    similar:       <AlertCircle size={9} />,
  };
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', colorText)}>
      {icons[type]}
      {EQUIV_LABEL[type]}
    </span>
  );
}
