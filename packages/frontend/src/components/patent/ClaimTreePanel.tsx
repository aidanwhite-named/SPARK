import React from 'react';
import { ChevronRight, GitBranch, Equal, Layers, AlertCircle } from 'lucide-react';
import { usePatentStore } from '../../store/patentStore';
import { ClaimTree, CompareResult, EquivalenceGroup, DependentEquivalence, EquivType } from '../../types/patent';
import { cn } from '../../lib/utils';

// groupId → Tailwind 색상 클래스 매핑 (최대 8그룹)
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

// 특정 청구항 번호가 속한 그룹 찾기
function findGroup(num: number, groups: EquivalenceGroup[]): EquivalenceGroup | null {
  return groups.find(g => g.claimNumbers.includes(num)) ?? null;
}

function findDepGroup(num: number, depEquivs: DependentEquivalence[]): DependentEquivalence | null {
  return depEquivs.find(g => g.claimNumbers.includes(num)) ?? null;
}

export function ClaimTreePanel() {
  const { result, selectedTree, selectTree, compareResult } = usePatentStore();
  if (!result) return null;

  const groups = compareResult?.equivalenceGroups ?? [];
  const depEquivs = compareResult?.dependentEquivalences ?? [];

  return (
    <div className="flex flex-col h-full border-r border-gray-200">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-violet-500" />
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">청구항 트리</span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          총 {result.totalClaims}항 · 독립항 {result.trees.length}개
        </p>

        {/* 색상 범례 */}
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

      {/* 트리 목록 */}
      <div className="flex-1 overflow-y-auto py-2">
        {result.trees.map(tree => (
          <TreeNode
            key={tree.root.number}
            tree={tree}
            isSelected={selectedTree?.root.number === tree.root.number}
            onSelect={selectTree}
            groups={groups}
            depEquivs={depEquivs}
          />
        ))}
      </div>
    </div>
  );
}

function TreeNode({
  tree, isSelected, onSelect, groups, depEquivs,
}: {
  tree: ClaimTree;
  isSelected: boolean;
  onSelect: (t: ClaimTree) => void;
  groups: EquivalenceGroup[];
  depEquivs: DependentEquivalence[];
}) {
  const { root, dependents } = tree;
  const group = findGroup(root.number, groups);
  const color = group ? (GROUP_PALETTE[group.groupId] ?? GROUP_PALETTE[1]) : null;

  return (
    <div>
      {/* 독립항 */}
      <button
        onClick={() => onSelect(tree)}
        className={cn(
          'w-full flex items-start gap-2 px-4 py-2.5 text-left transition-all border-l-2',
          isSelected
            ? color
              ? cn(color.bg, color.border)
              : 'bg-violet-50 border-violet-500'
            : color
              ? cn('hover:opacity-80', color.bg, 'border-transparent hover:' + color.border)
              : 'hover:bg-gray-50 border-transparent'
        )}
      >
        {/* 번호 뱃지 */}
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          {color && (
            <span className={cn('w-2 h-2 rounded-full', color.dot)} />
          )}
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
            {/* 동일성 뱃지 */}
            {group && (
              <EquivBadge type={group.type} colorText={color!.text} />
            )}
          </div>
          <p className="text-xs text-gray-400 truncate mt-0.5">
            {root.rawText.slice(0, 38)}…
          </p>
          {/* 유사 구성 차이 요약 */}
          {group?.type === 'similar' && group.diffComponents && group.diffComponents.length > 0 && (
            <div className="mt-1 flex items-center gap-1">
              <AlertCircle size={10} className="text-amber-500 shrink-0" />
              <span className="text-xs text-amber-600 truncate">
                차이: {group.diffComponents.map(d => d.text).join(', ')}
              </span>
            </div>
          )}
        </div>

        <ChevronRight size={12} className={cn(
          'shrink-0 mt-1',
          isSelected ? (color ? color.text : 'text-violet-400') : 'text-gray-300'
        )} />
      </button>

      {/* 종속항 목록 */}
      {dependents.length > 0 && (
        <div className="ml-4 border-l border-gray-200">
          {dependents.map(dep => {
            const depGroup = findDepGroup(dep.number, depEquivs);
            const depColor = depGroup ? (GROUP_PALETTE[depGroup.groupId] ?? GROUP_PALETTE[1]) : null;

            return (
              <div
                key={dep.number}
                className={cn(
                  'flex items-center gap-2 px-4 py-1.5 rounded-sm mx-1',
                  depColor ? depColor.bg : ''
                )}
              >
                <div className="flex items-center gap-1 shrink-0">
                  {depColor && (
                    <span className={cn('w-1.5 h-1.5 rounded-full', depColor.dot)} />
                  )}
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                    {dep.number}
                  </span>
                </div>
                <p className="text-xs text-gray-400 truncate flex-1">
                  ↳ 제{dep.refersTo.join('·')}항 인용
                </p>
                {depGroup && (
                  <span className={cn('text-xs font-medium shrink-0', depColor!.text)}>
                    ≡
                  </span>
                )}
              </div>
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
