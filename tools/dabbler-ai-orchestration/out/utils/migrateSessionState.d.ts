export type MigrationStrategy = "regex" | "generic";
export type MigrationAction = "migrated" | "skipped-v3" | "skipped-no-state" | "skipped-malformed" | "skipped-future-schema" | "would-violate";
export interface MigrationResult {
    setDir: string;
    action: MigrationAction;
    reason: string;
    error?: string;
}
export interface MigrateOneSetOptions {
    /** Strategy for deriving session titles (default: "regex"). */
    strategy?: MigrationStrategy;
    /** When true, validate + report without writing to disk. */
    dryRun?: boolean;
}
export declare function migrateOneSet(setDir: string, options?: MigrateOneSetOptions): MigrationResult;
