// 청구항 텍스트에서 인용 번호를 추출 — "제N항" 및 "청구항 N" 형식 모두 지원
const REF_RE = /(?:제\s*(\d+)\s*항|청구항\s*(\d+))/g;

export function extractRefNumbers(text: string): number[] {
  const nums: number[] = [];
  REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_RE.exec(text)) !== null) {
    const n = parseInt(m[1] ?? m[2], 10);
    if (!isNaN(n)) nums.push(n);
  }
  return [...new Set(nums)];
}
