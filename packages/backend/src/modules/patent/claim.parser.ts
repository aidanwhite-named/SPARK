import {
  ClaimPart,
  ClaimTree,
  ParsedClaim,
  ParsedDependentClaim,
  ParsedIndependentClaim,
  PatentParseResult,
} from './patent.types.js';
import { extractRefNumbers } from './claim.refs.js';

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

// 어두(preamble) 추출
// 지원 패턴:
//   1. 첫 줄이 "~으로서," / "~로서," 로 끝나는 경우
//      예) "로봇을 이용하여 배송을 지원하기 위한 방법으로서,"
//          "데이터를 처리하기 위한 시스템으로서,"
//   2. "~에 있어서" (종속항 스타일 독립항, 기존 패턴 유지)
//   3. "~에 관한 [장치/방법/시스템/것]" (기존 패턴 유지)
function extractPreamble(text: string): { preamble: string | null; rest: string } {
  // 1. 첫 줄 단독으로 어두 여부 판정 — 줄이 "~으로서" / "~로서" + 쉼표로 끝나는 경우
  const firstLineEnd = text.indexOf('\n');
  if (firstLineEnd > 0) {
    const firstLine = text.slice(0, firstLineEnd).trim();
    if (/[가-힣](?:으로서|로서)[,\s]*$/.test(firstLine)) {
      return {
        preamble: firstLine,
        rest: text.slice(firstLineEnd + 1).trim(),
      };
    }
  }

  // 2. 기존 패턴: "~에 있어서" / "~에 관한 장치·방법·시스템"
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
const TRANSITION_RE = /^(?:[를을이가]?\s*)?(?:포함하[는며]|특징으로\s*하[는며]|이루어[지진]는|구성되[는는]|로\s*구성되[는는]|수행하[는는])/;

function extractTail(text: string): { tail: string | null; body: string } {
  const trimmed = text.trim();

  // 1. 청크 자체가 전이구로 시작하면 전체가 어미 (예: "을 포함하는 블럭식 학습교구.")
  if (TRANSITION_RE.test(trimmed)) {
    return { body: '', tail: trimmed };
  }

  // 2. 본문 뒤에 어미가 붙은 경우 — 도메인 특화 명사까지 허용
  const TAIL_NOUNS = '장치|방법|시스템|프로그램|매체|기기|서버|단말|모듈|컴퓨터|기록\\s*매체|저장\\s*매체|회로|장비|기술|구조|수단|유닛|디바이스';
  const tailRegexStrict = new RegExp(
    `^([\\s\\S]*)\\s*([를을이가]?\\s*(?:포함하[는며]|특징으로\\s*하[는며]|이루어[지진]는|구성되[는는]|로\\s*구성되[는는]|수행하[는는])\\s*[가-힣\\s]*(?:${TAIL_NOUNS})[가-힣]*[.!?]?)\\s*$`
  );
  const strictMatch = trimmed.match(tailRegexStrict);
  if (strictMatch && strictMatch[2] && strictMatch[2].trim().length > 2) {
    return { body: strictMatch[1].trim(), tail: strictMatch[2].trim() };
  }

  // 3. 목록에 없는 명사(예: "블럭식 학습교구", "조립체")도 어미로 인식
  const tailRegexGeneral = new RegExp(
    `^([\\s\\S]*)\\s*([를을이가]?\\s*(?:포함하[는며]|특징으로\\s*하[는며]|이루어[지진]는|구성되[는는]|로\\s*구성되[는는]|수행하[는는])\\s*[가-힣a-zA-Z0-9\\s()·-]+[.!?]?)\\s*$`
  );
  const generalMatch = trimmed.match(tailRegexGeneral);
  if (generalMatch && generalMatch[2]) {
    const potentialTail = generalMatch[2].trim();
    if (potentialTail.length > 2 && potentialTail.length < 100 && !potentialTail.includes(';')) {
      return { body: generalMatch[1].trim(), tail: potentialTail };
    }
  }

  return { body: text, tail: null };
}

// 구성 목록에 (A)(B)(C) 라벨 부여
function buildComponents(chunks: string[]): ClaimPart[] {
  const parts: ClaimPart[] = [];
  let labelIdx = 0;
  for (const chunk of chunks) {
    // 선두의 "및"/"또는"/"," 만 제거 (후행 "및"은 구성 간 연결자이므로 보존)
    const clean = chunk
      .replace(/^(?:및|또는|,)\s*/, '')
      .trim();
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

function parseClaims(claimTexts: { number: number; text: string }[]): ParsedClaim[] {
  return claimTexts.map(({ number, text }) => {
    // 종속항 판별 — "제N항에 있어서" 및 "청구항 N에 있어서" 형식 모두 지원
    const isDependent =
      /제\s*\d+\s*항(?:\s*내지\s*제\s*\d+\s*항)?(?:\s*또는\s*제\s*\d+\s*항)?(?:\s*중\s*어느\s*한\s*항)?\s*에\s*있어서/.test(text) ||
      /청구항\s*\d+[^.]*에\s*있어서/.test(text) ||
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
  // "청구범위" / "특허청구범위" / "특허청구의 범위" (구형 등록특허) 모두 처리
  const sectionRegex = /(?:【?\s*(?:특허\s*)?청구(?:의\s*)?범위\s*】?|【?\s*특허청구범위\s*】?)([\s\S]*?)(?=【|명\s*세\s*서|발명의\s*(?:상세한\s*)?설명|요약|도면의?\s*간단한\s*설명|도면|$)/;
  const sectionMatch = pdfText.match(sectionRegex);
  const claimsSection = sectionMatch ? sectionMatch[1] : pdfText;

  // 청구항 헤더 패턴
  // "청구항 N" / "[청구항 N]" 뒤에 반드시 공백·개행만 있어야 진짜 헤더로 인정
  // → "청구항 1에 있어서," 같은 종속항 참조를 헤더로 오인하지 않음
  // "제N항." / "제N항:" 형식도 지원
  const HEADER_RE = /(?:\[?청구항\s*제?\s*(\d+)\s*항?\]?[ \t]*(?:\n|$)|제\s*(\d+)\s*항[ \t]*[.:][ \t]*(?:\n|$))/gm;

  // 헤더의 번호와 시작/끝 위치를 한 번의 스캔으로 수집
  const headers: { number: number; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = HEADER_RE.exec(claimsSection)) !== null) {
    const num = parseInt(m[1] ?? m[2], 10);
    if (!isNaN(num)) {
      headers.push({ number: num, start: m.index, end: m.index + m[0].length });
    }
  }

  if (headers.length === 0) return [];

  return headers.map((h, i) => {
    const textStart = h.end;
    // 다음 청구항 헤더의 '시작' 위치까지를 이번 청구항 텍스트로 사용
    const textEnd = i + 1 < headers.length ? headers[i + 1].start : claimsSection.length;
    const rawText = claimsSection.slice(textStart, textEnd).trim();
    return { number: h.number, text: normalizeClaimText(rawText) };
  }).filter(c => c.text.length > 0 && !/^삭제\s*$/.test(c.text));
}

export function normalizeClaimText(text: string): string {
  // NULL 문자(\x00)를 구성 경계 보호용 임시 마커로 사용 (특허 텍스트에는 존재하지 않음)
  const BOUNDARY = '\x00';

  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // PDF 페이지 헤더/바닥글 제거 — "공개특허 10-XXXX-XXXXXXX" / "등록특허 XX-XXXXXX"
    .replace(/^[ \t]*(?:공개|등록|공표)특허(?:공보)?\s+[\d-]+[ \t]*$/gm, '')
    // 페이지 번호 행 제거 — "- 2 -" / "— 3 —" / "--2--" 형태
    .replace(/^[ \t]*-{1,3}\s*\d+\s*-{1,3}[ \t]*$/gm, '')
    // 페이지 범위 표시 제거 — "-- 2 of 17 --" / "- 2 of 17 -"
    .replace(/^[ \t]*-+\s*\d+\s+of\s+\d+\s*-+[ \t]*$/gm, '')
    // 줄바꿈 앞뒤의 불필요한 공백 제거
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    // 빈 줄 정리 (연속 빈 줄을 단일 개행으로 축소하여 정규 표현식 매칭 정확도 향상)
    .replace(/\n{2,}/g, '\n')
    // ① 쉼표(또는 ", 및" / ", 또는" 등) 또는 세미콜론으로 끝나는 줄 뒤의 줄바꿈 → 구성 경계 보호
    //    예) "획득하는 단계,\n상기"  → 경계 보존
    //        "단계, 및\n상기"        → 경계 보존
    .replace(/([,;][ \t]*(?:및|또는|혹은)?[ \t]*)\n([가-힣a-zA-Z0-9])/g, `$1${BOUNDARY}$2`)
    // ② 조사/어미로 시작하는 줄은 앞 줄과 공백 없이 붙임 (PDF 행 분리)
    //    (명사(번호) 형태의 지칭이 줄바꿈된 경우도 매칭할 수 있도록 숫자/닫는괄호 허용)
    .replace(/([가-힣0-9)])\n((?:의|에서?|에게|으로|로|이(?=[가-힣,)\s])|가(?=[가-힣,)\s])|은|는|을|를|와|과|도|만|부터|까지|아|어|여|며))/g, '$1$2')
    // ③ 한국어-한국어 줄바꿈 처리 (PDF 행 분리)
    //    - 다음 글자가 바로 공백으로 이어지면 단어 중간 분리 → 공백 없이 붙임
    //      예) "상\n기 건물" → "상기 건물" (상기가 한 단어)
    //    - 그 외 경우는 단어 경계 → 공백 삽입
    .replace(/([가-힣])\n([가-힣])( )/g, '$1$2$3')
    .replace(/([가-힣])\n([가-힣])/g, '$1 $2')
    // ④ 구성 경계 복원
    .replace(new RegExp(BOUNDARY, 'g'), '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
