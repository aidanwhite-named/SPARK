import {
  ClaimPart,
  ClaimTree,
  ParsedClaim,
  ParsedDependentClaim,
  ParsedIndependentClaim,
  PatentParseResult,
} from './patent.types.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// 단순 구성으로 간주하는 키워드 (단어 1개 수준)
const SIMPLE_KEYWORDS = new Set([
  '프로세서', '메모리', '저장부', '저장장치', '입력부', '출력부', '통신부', '제어부',
  '네트워크', '센서', '디스플레이', '카메라', '버퍼', '레지스터', '코덱', '인터페이스',
  '타이머', '클럭', '버스', '포트', '안테나', '모듈', '드라이버', '인코더', '디코더',
  '스위치', '릴레이', '필터', '증폭기', '변환기', '수신기', '송신기', '트랜시버',
  '데이터베이스', '서버', '클라이언트', '게이트웨이', '라우터', '배터리', '전원부',
  'CPU', 'GPU', 'RAM', 'ROM', 'SSD', 'HDD', 'MCU', 'DSP',
]);

function isSimple(text: string): boolean {
  const t = text.trim().replace(/[;,.]$/, '').trim();
  // 키워드 직접 매치
  if (SIMPLE_KEYWORDS.has(t)) return true;
  // 10자 이하이고 서술 어미가 없으면 단순 명사구로 간주
  if (t.length <= 10 && !/(?:하는|되는|있는|없는|하여|되어|하고|되고|하며|되며|포함|처리|수행|생성|전송|수신|저장|분석|판단|결정)/.test(t)) {
    return true;
  }
  return false;
}

// 어두(preamble) 추출: "~에 있어서," 또는 "~에 관한 [장치/방법]에 있어서,"
function extractPreamble(text: string): { preamble: string | null; rest: string } {
  const match = text.match(/^([\s\S]*?(?:에\s*있어서|에\s*관한\s*(?:장치|방법|시스템|것))[\s,.:]*)/);
  if (match) {
    return {
      preamble: match[1].trim(),
      rest: text.slice(match[0].length).trim(),
    };
  }
  return { preamble: null, rest: text };
}

// 어미(tail) 추출: "[를] 포함하는 [명사]." 또는 "[를] 특징으로 하는 [명사]."
// 탐욕적 매칭으로 마지막 전이구+명사 패턴을 찾음
function extractTail(text: string): { tail: string | null; body: string } {
  const TAIL_NOUNS = '장치|방법|시스템|프로그램|매체|기기|서버|단말|모듈|컴퓨터|기록\\s*매체|저장\\s*매체|회로|장비|기술|구조|수단|유닛|디바이스';
  // 탐욕적 첫 그룹 → 마지막 전이구 패턴을 찾아냄
  const tailRegex = new RegExp(
    `^([\\s\\S]*)\\s*([를을이가]?\\s*(?:포함하[는며]|특징으로\\s*하[는며]|이루어[지진]는|구성되[는는]|로\\s*구성되[는는]|수행하[는는])\\s*[가-힣\\s]*(?:${TAIL_NOUNS})[가-힣]*[.!?]?)\\s*$`
  );
  const match = text.match(tailRegex);
  if (match && match[2] && match[2].trim().length > 2) {
    return {
      body: match[1].trim(),
      tail: match[2].trim(),
    };
  }
  return { body: text, tail: null };
}

// 구성 목록에 (A)(B)(C) 라벨 부여
function buildComponents(chunks: string[]): ClaimPart[] {
  const parts: ClaimPart[] = [];
  let labelIdx = 0;
  for (const chunk of chunks) {
    // "및", "또는", 선행 쉼표 제거
    const clean = chunk.replace(/^(?:및|또는|,)\s*/, '').trim();
    if (!clean) continue;
    const simple = isSimple(clean);
    parts.push({
      kind: 'component',
      label: simple ? undefined : ALPHABET[labelIdx++],
      text: clean,
      isSimple: simple,
    });
  }
  return parts;
}

function parseIndependent(number: number, rawText: string): ParsedIndependentClaim {
  const parts: ClaimPart[] = [];
  let needsLLM = false;

  // 1. 어두 추출
  const { preamble, rest: afterPreamble } = extractPreamble(rawText);
  if (preamble) {
    parts.push({ kind: 'preamble', text: preamble, isSimple: false });
  }

  // 2. 세미콜론으로 분리 시도
  const bySemicolon = afterPreamble.split(';').map(s => s.trim()).filter(Boolean);

  if (bySemicolon.length > 1) {
    const lastChunk = bySemicolon.at(-1)!;
    const { body: lastBody, tail } = extractTail(lastChunk);

    const chunks = [...bySemicolon.slice(0, -1)];
    if (lastBody) chunks.push(lastBody);

    parts.push(...buildComponents(chunks));
    if (tail) parts.push({ kind: 'tail', text: tail, isSimple: false });
  } else {
    // 3. 줄바꿈으로 분리 시도
    const byNewline = afterPreamble.split('\n').map(s => s.trim()).filter(Boolean);

    if (byNewline.length > 1) {
      const lastLine = byNewline.at(-1)!;
      const { body: lastBody, tail } = extractTail(lastLine);

      const lines = [...byNewline.slice(0, -1)];
      if (lastBody) lines.push(lastBody);

      parts.push(...buildComponents(lines));
      if (tail) parts.push({ kind: 'tail', text: tail, isSimple: false });
    } else {
      // 4. 단일 블록 → LLM 분석 필요
      needsLLM = true;
      const { body, tail } = extractTail(afterPreamble);
      if (body) {
        parts.push({ kind: 'component', label: 'A', text: body, isSimple: false });
      }
      if (tail) {
        parts.push({ kind: 'tail', text: tail, isSimple: false });
      }
      if (!body && !tail && afterPreamble) {
        parts.push({ kind: 'component', label: 'A', text: afterPreamble, isSimple: false });
      }
    }
  }

  return { number, type: 'independent', rawText, parts, needsLLM };
}

// 종속항 인용 번호 추출
function extractRefNumbers(text: string): number[] {
  const nums: number[] = [];
  const re = /제\s*(\d+)\s*항/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    nums.push(parseInt(m[1], 10));
  }
  return [...new Set(nums)];
}

function parseClaims(claimTexts: { number: number; text: string }[]): ParsedClaim[] {
  return claimTexts.map(({ number, text }) => {
    // 종속항 판별: 타 항을 "에 있어서"로 인용
    const isDependent =
      /제\s*\d+\s*항(?:\s*내지\s*제\s*\d+\s*항)?(?:\s*또는\s*제\s*\d+\s*항)?(?:\s*중\s*어느\s*한\s*항)?\s*에\s*있어서/.test(text) ||
      /제\s*\d+\s*항을?\s*인용/.test(text);

    if (isDependent) {
      const refs = extractRefNumbers(text).filter(n => n !== number);
      return {
        number,
        type: 'dependent' as const,
        rawText: text,
        refersTo: refs,
      };
    }

    return parseIndependent(number, text);
  });
}

// 독립항까지 참조 체인을 추적
function findRootNumber(num: number, claimMap: Map<number, ParsedClaim>): number {
  const c = claimMap.get(num);
  if (!c || c.type === 'independent') return num;
  if (c.refersTo.length === 0) return num;
  return findRootNumber(c.refersTo[0], claimMap);
}

export function buildClaimTrees(claimTexts: { number: number; text: string }[]): PatentParseResult {
  const parsed = parseClaims(claimTexts);
  const claimMap = new Map(parsed.map(c => [c.number, c]));

  const independents = parsed.filter((c): c is ParsedIndependentClaim => c.type === 'independent');
  const dependents = parsed.filter((c): c is ParsedDependentClaim => c.type === 'dependent');

  const trees: ClaimTree[] = independents.map(root => ({
    root,
    dependents: dependents.filter(d =>
      d.refersTo.some(ref => findRootNumber(ref, claimMap) === root.number)
    ),
  }));

  return { totalClaims: parsed.length, trees };
}

// PDF 텍스트에서 청구항 섹션 추출 및 개별 청구항 분리
export function extractClaimsFromText(pdfText: string): { number: number; text: string }[] {
  // 청구범위 섹션 찾기
  const sectionRegex = /(?:【?\s*청구범위\s*】?|【?\s*특허청구범위\s*】?)([\s\S]*?)(?=【|발명의\s*설명|요약|도면|$)/;
  const sectionMatch = pdfText.match(sectionRegex);
  const claimsSection = sectionMatch ? sectionMatch[1] : pdfText;

  // 청구항 헤더와 그 위치를 모두 수집
  // 패턴: "청구항 1", "청구항 제1항", "[청구항 1]", "제1항." 등
  const headerRegex = /(?:\[?청구항\s*제?\s*(\d+)\s*항?\]?|제\s*(\d+)\s*항\s*[.\n:])/g;

  const headers: { number: number; headerEnd: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRegex.exec(claimsSection)) !== null) {
    const num = parseInt(m[1] ?? m[2], 10);
    if (!isNaN(num)) {
      headers.push({ number: num, headerEnd: m.index + m[0].length });
    }
  }

  if (headers.length === 0) return [];

  // 각 청구항의 텍스트: 현재 헤더 끝 ~ 다음 헤더 시작
  const headerStarts = headers.map(h => h.headerEnd);

  // 다음 헤더의 시작 위치를 역으로 구함 (헤더 시작 = 헤더 끝 - 매치 길이)
  const headerRegex2 = /(?:\[?청구항\s*제?\s*(\d+)\s*항?\]?|제\s*(\d+)\s*항\s*[.\n:])/g;
  const headerRanges: { start: number; end: number }[] = [];
  while ((m = headerRegex2.exec(claimsSection)) !== null) {
    headerRanges.push({ start: m.index, end: m.index + m[0].length });
  }

  return headers.map((h, i) => {
    const textStart = h.headerEnd;
    // 다음 청구항 헤더의 '시작' 위치까지를 이번 청구항 텍스트로 사용
    const textEnd = i + 1 < headerRanges.length ? headerRanges[i + 1].start : claimsSection.length;
    const rawText = claimsSection.slice(textStart, textEnd).trim();
    return { number: h.number, text: normalizeClaimText(rawText) };
  }).filter(c => c.text.length > 0);
}

function normalizeClaimText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
