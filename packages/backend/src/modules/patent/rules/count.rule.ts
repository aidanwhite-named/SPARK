import { RuleFn, ValidationIssue } from '../validator.types.js';

/**
 * PDF 메타데이터의 "전체 청구항 수 : 총 N 항"과
 * 실제 추출된 청구항 수를 비교한다.
 */
export const countRule: RuleFn = (claims, pdfText): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  // "전체 청구항 수 : 총 N 항" 또는 "총 N항" 형태 파싱
  const match = pdfText.match(/전체\s*청구항\s*수\s*[:：]\s*총\s*(\d+)\s*항/);
  if (!match) {
    issues.push({
      severity: 'warning',
      code: 'COUNT_METADATA_NOT_FOUND',
      message: 'PDF에서 전체 청구항 수 메타데이터를 찾을 수 없어 수량 검증을 건너뜁니다.',
    });
    return issues;
  }

  const expected = parseInt(match[1], 10);
  const actual = claims.length;

  if (actual !== expected) {
    issues.push({
      severity: 'error',
      code: 'COUNT_MISMATCH',
      message: `PDF 메타데이터상 청구항 수(${expected}항)와 추출된 수(${actual}항)가 다릅니다.`,
    });
  }

  return issues;
};
