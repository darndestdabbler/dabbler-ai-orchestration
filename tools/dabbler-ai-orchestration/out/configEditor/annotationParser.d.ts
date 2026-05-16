/**
 * Annotation parser for `@dabbler:outsource-review("reason")` markers.
 *
 * Source-code annotations are the second of two surfaces operators use to
 * flag a decision for cross-provider review (the first being the
 * `dabbler.flagDecisionForReview` command). The scanner registered in
 * `commands/scanAnnotationsForActiveSet.ts` walks workspace files, calls
 * `findAnnotations` on each file's text, and appends results to the
 * active session set's `decision-review-queue.jsonl`.
 *
 * Comment styles recognized:
 *   - Python / shell / YAML:    # @dabbler:outsource-review("...")
 *   - JS/TS/Java/C#/C/C++/Go:   // @dabbler:outsource-review("...")
 *
 * Each comment style is honored regardless of file extension — the parser
 * does not assume the caller has filtered files by language. This lets
 * mixed-language repos (Python tests with `// ...` in a comment, or shell
 * scripts with hashbang plus `//`) pick up annotations either way.
 */
export interface Annotation {
    /** ISO timestamp when the annotation was discovered. */
    ts: string;
    /** Operator-supplied reason text from inside the parentheses. */
    reason: string;
    /** Always "annotation" for findAnnotations output. */
    source: "annotation";
    /** Workspace-relative path with forward slashes (POSIX style). */
    file: string;
    /** 1-based line number. */
    line: number;
}
/**
 * Find every annotation in `text`. Returns a list with one entry per
 * occurrence, in file order. The `file` field is the caller-supplied
 * `filePath` normalized to POSIX forward slashes; the `line` field is
 * 1-based.
 *
 * `now` is exposed for tests; production callers omit it and accept
 * `new Date().toISOString()`.
 */
export declare function findAnnotations(text: string, filePath: string, now?: () => string): Annotation[];
/**
 * Deduplicate `incoming` annotations against an existing queue. Two
 * entries collide when their `file`, `line`, and `reason` all match —
 * the queue's `ts` and `source` are ignored. Returns only the entries
 * from `incoming` that are not already present.
 *
 * Used by `scanAnnotationsForActiveSet` so repeated scans append each
 * annotation exactly once.
 */
export declare function deduplicateAnnotations(incoming: Annotation[], existing: ReadonlyArray<Pick<Annotation, "file" | "line" | "reason">>): Annotation[];
