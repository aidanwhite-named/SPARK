import { ClaudeAdapter } from '../../adapters/claude.adapter.js';
import { PatentParseResult, ParsedIndependentClaim, ParsedDependentClaim } from './patent.types.js';

export type EquivType = 'category_only' | 'similar' | 'identical';

export interface EquivalenceGroup {
  groupId: number;
  claimNumbers: number[];       // 독립항 번호들
  type: EquivType;
  description: string;          // 설명
  sameComponents?: string[];    // 유사한 구성 (similar 타입)
  diffComponents?: {
    text: string;
    significance: 'high' | 'medium' | 'low';
    note: string;
  }[];
}

export interface DependentEquivalence {
  groupId: number;              // 색상 공유용 ID
  claimNumbers: number[];       // 종속항 번호들
  description: string;
}

export interface CompareResult {
  equivalenceGroups: EquivalenceGroup[];
  dependentEquivalences: DependentEquivalence[];
}

// 청구항을 LLM에 전달할 텍스트로 포맷
function formatClaimForPrompt(claim: ParsedIndependentClaim): string {
  const parts = claim.parts.map(p => {
    if (p.kind === 'preamble') return `  어두: ${p.text}`;
    if (p.kind === 'tail') return `  어미: ${p.text}`;
    return `  ${p.label ? `(${p.label})` : ' -'} ${p.text}`;
  }).join('\n');
  return `제${claim.number}항 (독립항):\n${parts}`;
}

function formatDepClaimForPrompt(claim: ParsedDependentClaim): string {
  return `제${claim.number}항 (종속항, 제${claim.refersTo.join('·')}항 인용): ${claim.rawText.slice(0, 200)}`;
}

const COMPARE_PROMPT = `당신은 한국 특허 전문가입니다. 아래 특허 청구항들을 비교 분석하여 실질적 동일성/유사성을 판단해주세요.

판단 기준:
1. **category_only**: 기술 내용이 실질적으로 동일하고 카테고리(방법/장치/단말/시스템/프로그램 등)만 다른 경우
2. **identical**: 카테고리도 동일하고 기술 내용도 동일한 경우
3. **similar**: 일부 구성이 유사하지만 완전히 동일하지 않은 경우

종속항 분석:
- 독립항들이 category_only 또는 identical 관계라면, 그 종속항들도 대응 비교
- 대응 종속항끼리 기술적 특징이 동일하면 동일 그룹으로 분류

JSON만 응답 (다른 텍스트 없이):
{
  "equivalenceGroups": [
    {
      "groupId": 1,
      "claimNumbers": [1, 6],
      "type": "category_only",
      "description": "제1항(방법)과 제6항(장치)은 카테고리만 상이, 기술 내용 실질적 동일",
      "sameComponents": [],
      "diffComponents": []
    },
    {
      "groupId": 2,
      "claimNumbers": [1, 10],
      "type": "similar",
      "description": "...",
      "sameComponents": ["구성 A (입력 수신)", "구성 B (데이터 분석)"],
      "diffComponents": [
        { "text": "구성 C (출력 방식)", "significance": "high", "note": "목적·효과 차이 큼" }
      ]
    }
  ],
  "dependentEquivalences": [
    {
      "groupId": 1,
      "claimNumbers": [3, 9],
      "description": "제3항과 제9항은 각 독립항(제1항·제6항)의 동일 기술특징 종속항"
    }
  ]
}

독립항이 1개뿐이거나 비교 대상이 없으면 두 배열 모두 빈 배열로 응답.

분석 대상 청구항:
`;

export async function compareClaims(result: PatentParseResult): Promise<CompareResult> {
  const independents = result.trees.map(t => t.root);
  const dependents = result.trees.flatMap(t => t.dependents);

  if (independents.length < 2) {
    return { equivalenceGroups: [], dependentEquivalences: [] };
  }

  // 프롬프트 구성
  const indSection = independents.map(formatClaimForPrompt).join('\n\n');
  const depSection = dependents.length > 0
    ? '\n\n[종속항]\n' + dependents.map(formatDepClaimForPrompt).join('\n')
    : '';

  const prompt = COMPARE_PROMPT + indSection + depSection;

  const adapter = new ClaudeAdapter();
  const result2 = await adapter.complete({ prompt: '', userInput: prompt, stream: false });

  const jsonMatch = result2.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { equivalenceGroups: [], dependentEquivalences: [] };

  try {
    return JSON.parse(jsonMatch[0]) as CompareResult;
  } catch {
    return { equivalenceGroups: [], dependentEquivalences: [] };
  }
}
