import { Annotation } from "../configEditor/annotationParser";
/**
 * File extensions we walk by default. Limited to text-source extensions
 * so a workspace with thousands of binaries doesn't blow up the scan.
 * Comment-marker recognition itself is style-based (#, //) not
 * extension-based, so a `.txt` file with a `#` annotation still works
 * if its extension falls in this set.
 */
export declare const SCAN_EXTENSIONS: string[];
/** Glob matching files in `SCAN_EXTENSIONS`. */
export declare const SCAN_GLOB: string;
/**
 * Default ignore glob — node_modules, dist/, out/, .venv/, etc. Mirrors
 * the conventions a typical .gitignore enforces so a workspace without
 * an explicit ignore file still skips obvious noise.
 */
export declare const SCAN_EXCLUDE_GLOB = "{**/node_modules/**,**/dist/**,**/out/**,**/build/**,**/.venv/**,**/venv/**,**/__pycache__/**,**/.git/**}";
export type FileReader = (absPath: string) => string;
/**
 * Normalize a path to POSIX forward slashes regardless of host OS.
 *
 * `path.sep`-based splits only rewrite the current OS's separator, which
 * means Windows-style backslashes pass through unchanged on Linux/macOS.
 * That breaks dedup when a queue entry written on Windows is read on a
 * POSIX host (or vice versa). Always rewrite `\` to `/` — it's safe
 * because `\` is not a valid path character on POSIX.
 *
 * Defense-in-depth: the annotationParser already POSIX-normalizes the
 * file it puts in each Annotation, but the scanner's dedup seed comes
 * from `loadExistingQueueEntries` which reads externally-written queue
 * lines (could be hand-edited, could be written by older code). Always
 * normalize so the dedup key is canonical regardless of provenance.
 */
export declare function toPosixPath(p: string): string;
/**
 * Walk `files` (absolute paths), apply `findAnnotations` to each, and
 * return the combined list. Returned annotations carry `file` as a
 * workspace-relative POSIX path; `workspaceRoot` is the prefix that
 * gets stripped.
 *
 * Files that fail to read are skipped silently — the caller's
 * notification surface reports the aggregate, not per-file errors.
 */
export declare function scanFilesForAnnotations(files: string[], workspaceRoot: string, now?: () => string, readFile?: FileReader): Annotation[];
/**
 * Read the `decision_review.honor_annotations` toggle from
 * `<workspaceRoot>/ai_router/local-overrides.yaml`. Missing file or
 * missing field → defaults to `true` per Set 025 wireframes §4.
 *
 * `readYaml` is the test seam. Production callers pass a YAML reader
 * that returns the parsed object or null on absent / unparseable input.
 */
export declare function loadHonorAnnotationsToggle(workspaceRoot: string, readYaml: (p: string) => Record<string, unknown> | null): boolean;
/**
 * Read the active set's queue file into a deduplication seed.
 * Returns one entry per parseable queue line that carries `file`,
 * `line`, and `reason` — exactly the shape `deduplicateAnnotations`
 * keys on. Malformed lines are skipped; lines from
 * `dabbler.flagDecisionForReview` (with `file: null`) are also skipped
 * (they have nothing to collide with).
 */
export declare function loadExistingQueueEntries(sessionSetDir: string, readFile?: FileReader): {
    file: string;
    line: number;
    reason: string;
}[];
