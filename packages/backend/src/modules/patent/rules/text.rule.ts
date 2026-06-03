import { RuleFn, ValidationIssue } from '../validator.types.js';

// 정상 청구항 어미 패턴 (독립항 기준)
const VALID_ENDING_RE = /(?:포함하[는며]|특징으로\s*하[는며]|이루어[지진]는|구성되[는는]|수행하[는며])[^.]*[.。]?\s*$/;

// 명세서 단락 번호 오염 패턴 (<17>, <18> 등)
const SPEC_PARAGRAPH_RE = /<\d{2,}>/;

// 청구항 텍스트 최대 허용 길이 (이 이상이면 명세서가 섞인 것으로 의심)
const MAX_CLAIM_LENGTH = 1500;

// 청구항 텍스트 최소 길이
const MIN_CLAIM_LENGTH = 10;

export const textRule: RuleFn = (claims): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  for (const claim of claims) {
    const { number, text } = claim;

    // 1. 너무 짧음
    if (text.length < MIN_CLAIM_LENGTH) {
      issues.push({
        severity: 'error',
        code: 'TEXT_TOO_SHORT',
        message: `청구항 ${number}의 텍스트가 너무 짧습니다(${text.length}자). 추출이 불완전할 수 있습니다.`,
        claimNumber: number,
      });
      continue; // 짧으면 이후 검사 의미 없음
    }

    // 2. 명세서 단락 번호 오염
    if (SPEC_PARAGRAPH_RE.test(text)) {
      issues.push({
        severity: 'error',
        code: 'TEXT_SPEC_CONTAMINATION',
        message: `청구항 ${number}에 명세서 단락 번호(<N>)가 포함되어 있습니다. 청구범위 섹션이 잘못 추출됐을 수 있습니다.`,
        claimNumber: number,
      });
    }

    // 3. 비정상적으로 긴 텍스트 (명세서 통째 포함 의심)
    if (text.length > MAX_CLAIM_LENGTH) {
      issues.push({
        severity: 'warning',
        code: 'TEXT_TOO_LONG',
        message: `청구항 ${number}의 텍스트가 ${text.length}자로 비정상적으로 깁니다. 명세서 내용이 포함됐을 수 있습니다.`,
        claimNumber: number,
      });
    }

    // 4. 어미 패턴 미일치 (종속항은 어미가 짧을 수 있어 warning으로만)
    if (!VALID_ENDING_RE.test(text)) {
      issues.push({
        severity: 'warning',
        code: 'TEXT_INVALID_ENDING',
        message: `청구항 ${number}이 정상적인 청구항 어미 패턴으로 끝나지 않습니다.`,
        claimNumber: number,
      });
    }
  }

  return issues;
};
