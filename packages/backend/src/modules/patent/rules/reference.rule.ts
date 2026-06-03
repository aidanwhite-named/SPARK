import { RuleFn, ValidationIssue } from '../validator.types.js';
import { extractRefNumbers } from '../claim.refs.js';

export const referenceRule: RuleFn = (claims): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const claimNumbers = new Set(claims.map(c => c.number));

  // 1. 청구항 번호 중복 검사
  const seen = new Set<number>();
  for (const { number } of claims) {
    if (seen.has(number)) {
      issues.push({
        severity: 'error',
        code: 'REF_DUPLICATE_NUMBER',
        message: `청구항 번호 ${number}이 중복 추출되었습니다.`,
        claimNumber: number,
      });
    }
    seen.add(number);
  }

  // 2. 종속항의 참조 번호 유효성 검사
  for (const claim of claims) {
    const refs = extractRefNumbers(claim.text).filter(n => n !== claim.number);
    for (const ref of refs) {
      if (!claimNumbers.has(ref)) {
        issues.push({
          severity: 'error',
          code: 'REF_MISSING_TARGET',
          message: `청구항 ${claim.number}이 인용하는 제${ref}항이 추출 결과에 없습니다.`,
          claimNumber: claim.number,
        });
      }
      // 자기 자신 이후 번호 참조 (논리 오류)
      if (ref >= claim.number) {
        issues.push({
          severity: 'warning',
          code: 'REF_FORWARD_REFERENCE',
          message: `청구항 ${claim.number}이 자신보다 뒤에 있는 제${ref}항을 인용합니다.`,
          claimNumber: claim.number,
        });
      }
    }
  }

  // 3. 번호 연속성 검사 (중간에 건너뛴 번호 감지)
  const sorted = [...claimNumbers].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap > 1) {
      const missing = Array.from({ length: gap - 1 }, (_, k) => sorted[i - 1] + k + 1);
      issues.push({
        severity: 'warning',
        code: 'REF_NUMBER_GAP',
        message: `청구항 번호에 공백이 있습니다: ${missing.join(', ')}항이 없습니다. 삭제 청구항이거나 추출 누락일 수 있습니다.`,
      });
    }
  }

  return issues;
};
