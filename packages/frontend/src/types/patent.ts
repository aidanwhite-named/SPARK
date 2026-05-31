export interface ClaimPart {
  kind: 'preamble' | 'component' | 'tail';
  label?: string;
  text: string;
  isSimple: boolean;
}

export interface ParsedIndependentClaim {
  number: number;
  type: 'independent';
  rawText: string;
  parts: ClaimPart[];
  needsLLM: boolean;
}

export interface ParsedDependentClaim {
  number: number;
  type: 'dependent';
  rawText: string;
  refersTo: number[];
}

export interface ClaimTree {
  root: ParsedIndependentClaim;
  dependents: ParsedDependentClaim[];
}

export interface PatentParseResult {
  title?: string;
  totalClaims: number;
  trees: ClaimTree[];
  pdfText?: string;  // 전체 특허 원문 (채팅 컨텍스트용)
  priorityDate?: string;       // YYYY-MM-DD
  priorityDateLabel?: string;  // 화면 표시용 레이블
  purposeAndEffect?: string;   // 발명의 목적 및 효과 섹션
}

export interface WeightItem {
  label: string | null;
  text: string;
  weight: '핵심' | '보조' | '관용';
  stars: 1 | 2 | 3;
  reason: string;
  isDep?: boolean; // 종속항 고유 구성 여부
}

export interface PatentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  // 화면 표시용 레이블 (실제 전송 내용과 다를 수 있음)
  displayLabel?: string;
}

// ── 청구항 비교 결과 ─────────────────────────────────────────

export type EquivType = 'category_only' | 'similar' | 'identical';

export interface EquivalenceGroup {
  groupId: number;
  claimNumbers: number[];
  type: EquivType;
  description: string;
  sameComponents?: string[];
  diffComponents?: {
    text: string;
    significance: 'high' | 'medium' | 'low';
    note: string;
  }[];
}

export interface DependentEquivalence {
  groupId: number;
  claimNumbers: number[];
  description: string;
}

export interface CompareResult {
  equivalenceGroups: EquivalenceGroup[];
  dependentEquivalences: DependentEquivalence[];
}
