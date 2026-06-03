export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  claimNumber?: number;
}

export interface ValidationResult {
  valid: boolean;       // error가 하나도 없으면 true
  issues: ValidationIssue[];
}

export type RuleFn = (
  claims: { number: number; text: string }[],
  pdfText: string,
) => ValidationIssue[];
