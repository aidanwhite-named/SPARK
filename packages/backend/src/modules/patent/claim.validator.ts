import { ValidationResult } from './validator.types.js';

interface ClaimText {
  number: number;
  text: string;
}

// 종속항 패턴: "제N항에 따른", "제N항의", "청구항 N에 종속" 등
const DEPENDENT_PATTERN = /제\s*(\d+)\s*항(?:에\s*따른|의|에\s*종속)|청구항\s*(\d+)(?:에\s*따른|에\s*종속)/;

export function validateClaims(claims: ClaimText[], _pdfText: string): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const claimNumbers = new Set(claims.map((c) => c.number));

  let independentCount = 0;
  let dependentCount = 0;

  for (const claim of claims) {
    const match = claim.text.match(DEPENDENT_PATTERN);
    if (match) {
      dependentCount++;
      const parentNum = parseInt(match[1] ?? match[2]);
      if (!isNaN(parentNum) && !claimNumbers.has(parentNum)) {
        errors.push(`청구항 ${claim.number}: 참조하는 청구항 ${parentNum}이 존재하지 않습니다`);
      }
    } else {
      independentCount++;
    }
  }

  if (claims.length === 0) {
    errors.push('청구항을 찾을 수 없습니다');
  }

  if (independentCount === 0 && claims.length > 0) {
    warnings.push('독립항이 없습니다');
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
    claimCount: claims.length,
    independentCount,
    dependentCount,
  };
}
