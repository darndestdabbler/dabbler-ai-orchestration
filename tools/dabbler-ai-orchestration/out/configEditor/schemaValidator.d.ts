export interface ValidationError {
    file: "router-config.yaml" | "budget.yaml" | "local-overrides.yaml";
    path: string;
    message: string;
}
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}
export interface ValidateBatchInput {
    routerConfig: Record<string, unknown> | null;
    budget: Record<string, unknown> | null;
    localOverrides: Record<string, unknown> | null;
}
export declare function validateBatch(input: ValidateBatchInput): ValidationResult;
export declare function isValidEnvVarName(name: string): boolean;
