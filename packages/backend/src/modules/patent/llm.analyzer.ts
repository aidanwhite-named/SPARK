import { adapterFactory } from '../../adapters/adapter.factory.js';
import { LLMType } from '../../adapters/base.adapter.js';
import { ClaimPart } from './patent.types.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const ANALYZE_PROMPT = `당신은 한국 특허 전문가입니다. 아래 특허 독립항의 구성요소를 분석해주세요.

분석 규칙:
1. 어두(preamble): "~에 있어서" 등으로 끝나는 도입부. 없으면 null.
2. 어미(tail): "를 특징으로 하는 [명사]." 또는 "를 포함하는 [명사]." 같은 마지막 결론 구절. 없으면 null.
3. 구성요소(component): 어두와 어미 사이의 각 기술적 구성을 의미 단위로 분리.
4. 단순 구성(simple=true): '프로세서', '메모리' 등 단어 1~2개짜리 명사구. 복잡한 설명이 있으면 simple=false.
5. 라벨: simple=false인 구성에만 순서대로 A, B, C... 부여. simple=true이면 label=null.

JSON만 응답 (다른 텍스트 없이):
{
  "preamble": "...",
  "components": [
    {"label": "A", "text": "...", "simple": false},
    {"label": null, "text": "메모리", "simple": true}
  ],
  "tail": "..."
}

독립항 텍스트:
`;

// ── 모델 선택 상수 ──────────────────────────────────────────────
// 가중치 판단: 경량 모델 (빠른 분류)
export const WEIGHT_MODELS: Record<string, string> = {
  claude: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-3.1-flash-lite',
};

// 선행발명 검색: 웹검색이 필요하므로 더 강력한 모델
export const SEARCH_MODELS: Record<string, string> = {
  claude: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-3.5-flash',
};

export const FAST_SEARCH_MODELS: Record<string, string> = {
  claude: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-3.5-flash',
};

// ── 가중치 분석 타입 ────────────────────────────────────────────
export interface WeightItem {
  label: string | null;
  text: string;
  weight: '핵심' | '보조' | '관용';
  stars: 1 | 2 | 3;
  reason: string;
  isDep?: boolean; // 종속항 고유 구성 여부
}

const WEIGHT_ANALYSIS_PROMPT = `당신은 한국 특허 전문가입니다. 아래 청구항의 각 구성요소에 선행발명 검색 관점의 가중치를 부여하라.

가중치 기준:
- 핵심★★★: 이 발명만의 핵심 기술 특징. 없으면 다른 발명이 됨. 선행발명에서 반드시 대응 여부를 확인해야 함
- 보조★★☆: 핵심 구성을 한정하거나 보완하는 구성. 선행발명 비교 시 참고 기준
- 관용★☆☆: 해당 분야에서 통상적으로 사용되는 수단. 신규성·진보성 판단에 영향이 거의 없음

규칙:
- "어두:" 및 "어미:" 로 표시된 항목은 분석 제외
- (A), (B) 등 label이 있는 component는 반드시 포함
- label 없이 들여쓰기만 된 단순 구성(프로세서, 메모리 등)도 반드시 포함
- 분석할 구성이 없으면 빈 배열 대신 가장 의미 있는 구성을 골라 포함할 것

JSON만 출력 (다른 텍스트 없이):
{"weights":[{"label":"A","text":"구성 내용 원문 그대로","weight":"핵심","stars":3,"reason":"핵심인 이유 1~2줄"},{"label":null,"text":"메모리","weight":"관용","stars":1,"reason":"관용인 이유"}]}

분석 대상 청구항:
`;

interface LLMAnalysisResult {
  preamble?: string;
  components: { label: string | null; text: string; simple: boolean }[];
  tail?: string;
}

export async function analyzeClaimWithLLM(rawText: string): Promise<ClaimPart[]> {
  const adapter = adapterFactory.get('claude');

  const result = await adapter.complete({
    prompt: '',
    userInput: ANALYZE_PROMPT + rawText,
    stream: false,
  });

  const jsonMatch = result.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('LLM이 유효한 JSON을 반환하지 않았습니다');
  }

  const parsed: LLMAnalysisResult = JSON.parse(jsonMatch[0]);
  const parts: ClaimPart[] = [];
  let labelIdx = 0;

  if (parsed.preamble) {
    parts.push({ kind: 'preamble', text: parsed.preamble, isSimple: false });
  }

  for (const c of parsed.components ?? []) {
    const label = c.simple ? undefined : (c.label ?? ALPHABET[labelIdx++]);
    parts.push({
      kind: 'component',
      label,
      text: c.text,
      isSimple: c.simple,
    });
  }

  if (parsed.tail) {
    parts.push({ kind: 'tail', text: parsed.tail, isSimple: false });
  }

  return parts;
}

// 가중치 분석 — 경량 모델 사용
export async function analyzeWeights(
  parts: ClaimPart[],
  claimNumber: number,
  llmType: string,
  dependentClaimText?: string,
  selectedModel?: string
): Promise<WeightItem[]> {
  const adapter = adapterFactory.get((llmType as LLMType) ?? 'claude');
  const model = selectedModel ?? WEIGHT_MODELS[llmType] ?? WEIGHT_MODELS.claude;
  const claimStructure = formatClaimStructure(parts, claimNumber);

  let prompt = WEIGHT_ANALYSIS_PROMPT + claimStructure;
  if (dependentClaimText) {
    prompt += `\n\n[종속항 고유 구성 — 이번 검색의 핵심 타겟]
${dependentClaimText}

위 종속항 고유 구성도 JSON weights 배열에 포함하라:
- label은 "종1", "종2" 등으로 부여
- isDep: true 필드 반드시 추가
- 종속항 고유 구성은 이 검색의 핵심 타겟이므로 관용 기술이 아닌 한 핵심★★★ 또는 보조★★☆ 부여
- 전제부("제X항에 있어서" 등)는 제외하고 실질 한정 사항만 분리하여 포함`;
  }

  const result = await adapter.complete({
    prompt: '',
    userInput: prompt,
    model,
    stream: false,
  });

  const jsonMatch = result.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[WEIGHT] LLM raw output:', result.content.slice(0, 500));
    throw new Error('가중치 분석 결과를 파싱할 수 없습니다 (JSON 없음)');
  }

  let parsed: { weights?: unknown };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('[WEIGHT] JSON parse error:', e, '| raw:', jsonMatch[0].slice(0, 300));
    throw new Error('가중치 분석 결과 JSON 파싱 실패');
  }

  if (!Array.isArray(parsed.weights)) {
    console.error('[WEIGHT] weights not array:', parsed);
    throw new Error('가중치 분석 결과 형식이 올바르지 않습니다');
  }

  return parsed.weights as WeightItem[];
}

// 청구항 구조를 텍스트로 포맷 (프롬프트 주입용)
export function formatClaimStructure(claimParts: ClaimPart[], claimNumber: number): string {
  const lines = [`[분석 대상 청구항 — 제${claimNumber}항 독립항]`];
  for (const part of claimParts) {
    if (part.kind === 'preamble') lines.push(`(전제부) ${part.text}`);
    else if (part.kind === 'tail') lines.push(`(어미) ${part.text}`);
    else {
      // label 있는 구성: (A) 텍스트 / label 없는 단순 구성: [단순구성] 텍스트
      const prefix = part.label ? `(${part.label})` : '[단순구성]';
      lines.push(`${prefix} ${part.text}`);
    }
  }
  return lines.join('\n');
}

// 가중치 표를 마크다운 테이블로 포맷
function formatWeightTable(weights: WeightItem[]): string {
  const STARS: Record<number, string> = { 3: '★★★', 2: '★★☆', 1: '★☆☆' };
  const indep = weights.filter(w => !w.isDep);
  const dep = weights.filter(w => w.isDep);

  const rows = (items: WeightItem[]) =>
    items.map(w => `| ${w.label ? `(${w.label})` : '—'} | ${w.text} | ${STARS[w.stars]} ${w.weight} | ${w.reason} |`).join('\n');

  let table = `| 구성 | 내용 | 가중치 | 판단 이유 |\n|------|------|--------|----------|\n${rows(indep)}`;
  if (dep.length > 0) {
    table += `\n| **[종속항 고유 구성 — 검색 핵심 타겟]** | | | |\n${rows(dep)}`;
  }
  return table;
}

// 검색 지시문 빌더 — 가중치 사전 제공 여부에 따라 분기
export function buildSearchInstructions(weights?: WeightItem[]): string {
  if (!weights || weights.length === 0) return SEARCH_INSTRUCTIONS;

  return `[목표] 제공된 가중치 표를 활용하여 실제 선행문헌을 검색하기

#[작업 지시]
##step 1
청구항을 이해하라. 특허 전문에 청구항을 뒷받침하는 상세한 설명이 있으니 함께 참고하라.
##step 2 — 가중치 표 (사전 분석 완료 · 수정 금지)
${formatWeightTable(weights)}

##step 3
사용자 확인 없이 즉시 '핵심★★★' 구성을 우선하여 구글 검색으로 '실제 존재하는' 특허/논문을 찾고 반드시 링크를 포함하라.
이후 아래 [출력 형식]으로 비교 분석하라. 불필요한 서론/결론은 생략하라.

[출력 형식: 선행발명 X]
• 문헌/출처(링크):
• 유사도: 🟠 91% 이상 / 🟢 85~90% / 🟡 80~84% / ⚪ 80% 미만
• 구성 대응표: (구성 a → 단락 번호[0000]와 내용 발췌 — 동일 / 실질적 동일 / 일부 차이 / 차이)
• 심사 의견: 신규성/진보성 거절 가능 여부 및 짧은 사유`;
}

export function buildFastSearchPrompt(params: {
  claimStructure: string;
  dependentClaimText?: string;
  promptContent?: string;
  priorityDate?: string;
  priorityDateLabel?: string;
}): string {
  const {
    claimStructure,
    dependentClaimText,
    promptContent,
    priorityDate,
    priorityDateLabel,
  } = params;

  const baseInstruction = promptContent
    ? (promptContent.includes('{{claim}}')
        ? promptContent.replace(/\{\{claim\}\}/g, claimStructure)
        : `${promptContent}\n\n${claimStructure}`)
    : `아래 청구항과 유사한 공개 특허/논문/기술문헌을 웹에서 빠르게 검색하라.

목표:
- 85% 이상 유사한 선행발명 후보가 있으면 최대 3개만 제시한다.
- 85% 이상 후보가 없으면 반드시 "85% 이상 후보 없음"이라고 명시한다.
- 각 후보마다 문헌명/출처 링크, 공개일, 유사도(%), 핵심 대응 구성, 차이점을 간결하게 작성한다.
- 확실하지 않은 후보를 억지로 85% 이상으로 올리지 않는다.`;

  const sections = [baseInstruction];

  if (priorityDate) {
    const label = priorityDateLabel ?? '기준일';
    sections.push(`${label}: ${priorityDate}\n이 날짜 이전에 공개/등록된 문헌만 선행발명 후보로 본다.`);
  }

  if (!promptContent) {
    sections.push(`청구항:\n${claimStructure}`);
  }

  if (dependentClaimText) {
    sections.push(`종속항 추가 구성:\n${dependentClaimText}`);
  }

  sections.push(`출력 형식:
1. 결론: 85% 이상 후보 있음/없음
2. 후보 표: 문헌명 | 링크 | 공개일 | 추정 유사도 | 대응 구성 | 차이점
3. 다음 단계: 정밀검색이 필요한지 한 문장으로 판단`);

  return sections.join('\n\n---\n\n');
}

// 검색 지시문 (step 1 ~ step 3) — 가중치 자체 분석 버전
export const SEARCH_INSTRUCTIONS = `[목표] 특허 전문과 청구항을 이해하여 중요도를 평가하고, 실제 선행문헌을 찾아보기

#[작업 지시]
##step 1
청구항을 이해하라. 특허 전문에 청구항을 뒷받침하는 상세한 설명이 있으니 함께 참고하라.
청구항의 내용이 모호하거나 중의적인 부분이 있어도 문맥에서 최선의 해석을 내리고 다음 단계로 진행하라.
##step 2
각 구성에 가중치(핵심★★★, 보조★★☆, 관용★☆☆)를 부여하고 표로 정리하라.
##step 3
사용자 확인 없이 즉시 '핵심★★★' 구성을 우선하여 구글 검색으로 '실제 존재하는' 특허/논문을 찾고 반드시 링크를 포함하라.
이후 아래 [출력 형식]으로 비교 분석하라. 불필요한 서론/결론은 생략하라.

[출력 형식: 선행발명 X]
• 문헌/출처(링크):
• 유사도: 🟠 91% 이상 / 🟢 85~90% / 🟡 80~84% / ⚪ 80% 미만
• 구성 대응표: (구성 a → 단락 번호[0000]와 내용 발췌 — 동일 / 실질적 동일 / 일부 차이 / 차이)
• 심사 의견: 신규성/진보성 거절 가능 여부 및 짧은 사유`;

// 멀티턴 대화 프롬프트 빌더
export function buildMultiTurnPrompt(
  pdfText: string,
  claimStructure: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  context?: {
    contextText?: string;
    contextSource?: 'pdf' | 'url';
    priorityDate?: string;
    priorityDateLabel?: string;
    dependentClaimText?: string;
    weights?: WeightItem[];
  }
): string {
  const sections: string[] = [
    '다음은 특허 분석 대화 세션입니다. 특허 전문과 청구항을 참고하여 대화를 이어가세요.',
  ];

  const isFirstTurn = !messages.some(m => m.role === 'assistant');

  if (pdfText && isFirstTurn) {
    const truncated = pdfText.length > 40000
      ? pdfText.slice(0, 40000) + '\n\n[이하 생략]'
      : pdfText;
    sections.push(`## 특허 전문\n${truncated}`);
  }

  if (context?.contextText && isFirstTurn) {
    const label = context.contextSource === 'url'
      ? '참고 URL 내용 (청구항 해석 보조 자료)'
      : '참고 PDF 내용 (청구항 해석 보조 자료)';
    const truncated = context.contextText.length > 20000
      ? context.contextText.slice(0, 20000) + '\n\n[이하 생략]'
      : context.contextText;
    sections.push(
      `## ${label}\n${truncated}\n\n` +
      `[참고] 위 자료는 청구항의 모호한 용어나 기술적 개념을 해석하는 데 활용하세요.` +
      ` 청구항에 불명확한 부분이 있다면 이 자료를 바탕으로 해석하고 진행하세요.`
    );
  }

  if (context?.priorityDate) {
    const label = context.priorityDateLabel ?? '기준일';
    sections.push(
      `## 선행발명 검색 날짜 기준\n` +
      `${label}: ${context.priorityDate}\n` +
      `**반드시 이 날짜(${context.priorityDate}) 이전에 공개·등록된 문헌만 선행발명으로 인정하라.** ` +
      `이 날짜 이후에 공개된 문헌은 선행발명으로 인용하지 말 것.`
    );
  }

  sections.push(`## ${claimStructure}`);

  if (context?.dependentClaimText) {
    sections.push(
      `## [분석 대상 종속항]\n${context.dependentClaimText}\n\n` +
      `[지시] 위 종속항은 독립항에 추가 구성을 한정한 항입니다. ` +
      `독립항의 모든 구성에 더해 이 종속항의 추가 한정 구성을 함께 고려하여 선행발명을 검색하라.`
    );
  }

  if (messages.length > 0) {
    const history = messages
      .map(m => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`)
      .join('\n\n');
    sections.push(`## 대화 이력\n${history}`);
  }

  sections.push('위 대화 이력의 맥락을 유지하며 마지막 사용자 메시지에 답하세요.');
  return sections.join('\n\n========\n\n');
}

// 하위 호환
export function buildSearchPrompt(claimParts: ClaimPart[], claimNumber: number): string {
  return SEARCH_INSTRUCTIONS;
}
