export interface ClaimPart {
  kind: 'preamble' | 'component' | 'tail';
  label?: string;     // (A), (B) 등 - 단순 구성 및 어두/어미에는 없음
  text: string;
  isSimple: boolean;  // 단어 1개 수준의 단순 구성
}

export interface ParsedIndependentClaim {
  number: number;
  type: 'independent';
  rawText: string;
  parts: ClaimPart[];
  needsLLM: boolean;  // 규칙 기반으로 구성 분리 불가 → LLM 분석 필요
}

export interface ParsedDependentClaim {
  number: number;
  type: 'dependent';
  rawText: string;
  refersTo: number[];  // 인용 청구항 번호 목록
}

export type ParsedClaim = ParsedIndependentClaim | ParsedDependentClaim;

export interface ClaimTree {
  root: ParsedIndependentClaim;
  dependents: ParsedDependentClaim[];
}

export interface PatentParseResult {
  title?: string;
  totalClaims: number;
  trees: ClaimTree[];
}
