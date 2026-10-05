// Generated from driver-disposition.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * driver/dispositions.json (the engine's answer to a verifier's findings)
 */
export type DriverDisposition = {
  /**
   * Frozen at v1. A reader that finds any other value refuses the file rather than interpreting it.
   */
  schema_version: 1;
  session_number: number;
  /**
   * The seq of the rejection instruction that carried the findings.
   */
  seq: number;
  /**
   * The recorded round the findings belong to.
   */
  round: number;
  dispositions: Array<{
    /**
     * 0-based index into that round's `findings`.
     */
    finding_index: number;
    action: "fix" | "reject";
    /**
     * The rebuttal's argument on `reject` -- it becomes the dispute's grounds. Optional on `fix`.
     */
    reason?: string;
    /**
     * Repository-relative cites, optionally `path:START-END`. Required on `reject`: a prose-only dispute is refused, so a prose-only rejection is refused here first.
     */
    evidence_paths?: string[];
  }>;
  recorded_at: string;
};
