import { ClaudeAdapter } from '../../adapters/claude.adapter.js';
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

interface LLMAnalysisResult {
  preamble?: string;
  components: { label: string | null; text: string; simple: boolean }[];
  tail?: string;
}

export async function analyzeClaimWithLLM(rawText: string): Promise<ClaimPart[]> {
  const adapter = new ClaudeAdapter();

  const result = await adapter.complete({
    prompt: '',
    userInput: ANALYZE_PROMPT + rawText,
    stream: false,
  });

  // 응답에서 JSON 블록 추출
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

// 청구항 구조를 텍스트로 포맷 (프롬프트 주입용)
export function formatClaimStructure(claimParts: ClaimPart[], claimNumber: number): string {
  const lines = [`[분석 대상 청구항 — 제${claimNumber}항 독립항]`];
  for (const part of claimParts) {
    if (part.kind === 'preamble') lines.push(`어두: ${part.text}`);
    else if (part.kind === 'tail') lines.push(`어미: ${part.text}`);
    else {
      const prefix = part.label ? `(${part.label})` : '   ';
      lines.push(`${prefix} ${part.text}`);
    }
  }
  return lines.join('\n');
}

// 검색 지시문 (step -1 ~ step -4)
export const SEARCH_INSTRUCTIONS = `[목표] 특허 전문과 청구항을 이해하여 중요도를 평가하고, 실제 선행문헌을 찾아보기

#[작업 지시]
##step -1
청구항을 이해하라. 특허 전문에 청구항을 뒷받침하는 상세한 설명이 있으니 함께 참고하라.
##step -2
청구항의 내용이 모호하거나 중의적인 부분이 있다면 사용자에게 질문하라. 없다면 step -3으로 진행하라.
#step -3
각 구성에 가중치(핵심★★★, 보조★★☆, 관용★☆☆)를 부여하고, "검색을 수행하겠습니까?"라고 사용자에게 확인하라.
#step -4
사용자가 확인하면 '핵심★★★' 구성을 우선하여 구글 검색으로 '실제 존재하는' 특허/논문을 찾고 반드시 링크를 포함하라.
이후 아래 [출력 형식]으로 비교 분석하라. 불필요한 서론/결론은 생략하라.

[출력 형식: 선행발명 X]
• 문헌/출처(링크):
• 유사도: 🟠 91% 이상 / 🟢 85~90% / 🟡 80~84% / ⚪ 80% 미만
• 구성 대응표: (구성 a → 단락 번호[0000]와 내용 발췌 — 동일 / 실질적 동일 / 일부 차이 / 차이)
• 심사 의견: 신규성/진보성 거절 가능 여부 및 짧은 사유`;

// 멀티턴 대화 프롬프트 빌더
// pdfText: 전체 특허 원문, claimStructure: 청구항 구조, messages: 전체 대화 이력
export function buildMultiTurnPrompt(
  pdfText: string,
  claimStructure: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  context?: { contextText?: string; contextSource?: 'pdf' | 'url' }
): string {
  const sections: string[] = [
    '다음은 특허 분석 대화 세션입니다. 특허 전문과 청구항을 참고하여 대화를 이어가세요.',
  ];

  // 특허 원문 (40,000자로 제한)
  if (pdfText) {
    const truncated = pdfText.length > 40000
      ? pdfText.slice(0, 40000) + '\n\n[이하 생략]'
      : pdfText;
    sections.push(`## 특허 전문\n${truncated}`);
  }

  // 참고 자료 — 직접 입력 시 청구항 해석을 보조하는 외부 문서
  if (context?.contextText) {
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

  // 청구항 구조
  sections.push(`## ${claimStructure}`);

  // 대화 이력
  if (messages.length > 0) {
    const history = messages
      .map(m => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`)
      .join('\n\n');
    sections.push(`## 대화 이력\n${history}`);
  }

  sections.push('위 대화 이력의 맥락을 유지하며 마지막 사용자 메시지에 답하세요.');
  return sections.join('\n\n========\n\n');
}

// 하위 호환: buildSearchPrompt는 초기 사용자 메시지 텍스트를 반환
export function buildSearchPrompt(claimParts: ClaimPart[], claimNumber: number): string {
  return SEARCH_INSTRUCTIONS;
}
