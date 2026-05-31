export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
  claimCount: number;
  independentCount: number;
  dependentCount: number;
}
