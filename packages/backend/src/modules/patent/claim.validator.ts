import { countRule } from './rules/count.rule.js';
import { referenceRule } from './rules/reference.rule.js';
import { textRule } from './rules/text.rule.js';
import { RuleFn, ValidationResult } from './validator.types.js';

const RULES: RuleFn[] = [
  countRule,
  textRule,
  referenceRule,
];

/**
 * 추출된 청구항 목록을 정적 규칙으로 검증한다.
 *
 * @param claims  extractClaimsFromText()가 반환한 { number, text }[] 배열
 * @param pdfText PDF에서 추출한 전체 텍스트 (메타데이터 파싱에 사용)
 */
export function validateClaims(
  claims: { number: number; text: string }[],
  pdfText: string,
): ValidationResult {
  const issues = RULES.flatMap(rule => rule(claims, pdfText));
  return {
    valid: issues.every(i => i.severity !== 'error'),
    issues,
  };
}
