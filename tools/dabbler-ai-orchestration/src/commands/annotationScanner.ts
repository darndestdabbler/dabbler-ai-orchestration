/**
 * Pure helpers backing `dabbler.scanAnnotationsForActiveSet`. No vscode
 * import so the scanning/dedup/toggle logic can be unit-tested via
 * plain mocha + ts-node.
 *
 * The vscode wiring lives in `./scanAnnotationsForActiveSet.ts`.
 */
import * as fs from "fs";
import * as path from "path";
import {
  Annotation,
  findAnnotations,
} from "../configEditor/annotationParser";
import { QueueEntry, QUEUE_FILENAME } from "./decisionReviewQueue";

/**
 * File extensions we walk by default. Limited to text-source extensions
 * so a workspace with thousands of binaries doesn't blow up the scan.
 * Comment-marker recognition itself is style-based (#, //) not
 * extension-based, so a `.txt` file with a `#` annotation still works
 * if its extension falls in this set.
 */
export const SCAN_EXTENSIONS = [
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "rb", "go", "rs", "java", "cs", "kt", "swift",
  "c", "cc", "cpp", "h", "hpp",
  "sh", "bash", "zsh", "ps1",
  "yaml", "yml", "toml",
];

/** Glob matching files in `SCAN_EXTENSIONS`. */
export const SCAN_GLOB = `**/*.{${SCAN_EXTENSIONS.join(",")}}`;

/**
 * Default ignore glob — node_modules, dist/, out/, .venv/, etc. Mirrors
 * the conventions a typical .gitignore enforces so a workspace without
 * an explicit ignore file still skips obvious noise.
 */
export const SCAN_EXCLUDE_GLOB =
  "{**/node_modules/**,**/dist/**,**/out/**,**/build/**,**/.venv/**,**/venv/**,**/__pycache__/**,**/.git/**}";

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
export function toPosixPath(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Walk `files` (absolute paths), apply `findAnnotations` to each, and
 * return the combined list. Returned annotations carry `file` as a
 * workspace-relative POSIX path; `workspaceRoot` is the prefix that
 * gets stripped.
 *
 * Files that fail to read are skipped silently — the caller's
 * notification surface reports the aggregate, not per-file errors.
 */
export function scanFilesForAnnotations(
  files: string[],
  workspaceRoot: string,
  now: () => string = () => new Date().toISOString(),
  readFile: FileReader = (p) => fs.readFileSync(p, "utf8"),
): Annotation[] {
  const out: Annotation[] = [];
  for (const abs of files) {
    let text: string;
    try {
      text = readFile(abs);
    } catch {
      continue;
    }
    // Normalize at this layer (belt-and-suspenders against the parser
    // someday changing behavior). path.relative returns host-native
    // separators; toPosixPath rewrites them so the Annotation.file is
    // canonical POSIX before it ever reaches dedup or disk.
    const rel = toPosixPath(path.relative(workspaceRoot, abs));
    const anns = findAnnotations(text, rel, now);
    for (const a of anns) out.push(a);
  }
  return out;
}

/**
 * Read the `decision_review.honor_annotations` toggle from
 * `<workspaceRoot>/ai_router/local-overrides.yaml`. Missing file or
 * missing field → defaults to `true` per Set 025 wireframes §4.
 *
 * `readYaml` is the test seam. Production callers pass a YAML reader
 * that returns the parsed object or null on absent / unparseable input.
 */
export function loadHonorAnnotationsToggle(
  workspaceRoot: string,
  readYaml: (p: string) => Record<string, unknown> | null,
): boolean {
  const candidate = path.join(workspaceRoot, "ai_router", "local-overrides.yaml");
  const parsed = readYaml(candidate);
  if (parsed == null) return true;
  const dr = parsed["decision_review"];
  if (dr == null || typeof dr !== "object") return true;
  const v = (dr as Record<string, unknown>)["honor_annotations"];
  if (typeof v === "boolean") return v;
  return true;
}

/**
 * Read the active set's queue file into a deduplication seed.
 * Returns one entry per parseable queue line that carries `file`,
 * `line`, and `reason` — exactly the shape `deduplicateAnnotations`
 * keys on. Malformed lines are skipped; lines from
 * `dabbler.flagDecisionForReview` (with `file: null`) are also skipped
 * (they have nothing to collide with).
 */
export function loadExistingQueueEntries(
  sessionSetDir: string,
  readFile: FileReader = (p) => fs.readFileSync(p, "utf8"),
): { file: string; line: number; reason: string }[] {
  const queuePath = path.join(sessionSetDir, QUEUE_FILENAME);
  if (!fs.existsSync(queuePath)) return [];
  let text: string;
  try {
    text = readFile(queuePath);
  } catch {
    return [];
  }
  const out: { file: string; line: number; reason: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as Partial<QueueEntry>;
      if (
        typeof obj.reason === "string" &&
        typeof obj.file === "string" &&
        typeof obj.line === "number"
      ) {
        // Canonicalize the dedup key — a queue entry written on Windows
        // (with backslashes) must collide with the same file scanned on
        // POSIX. Without this, a re-scan on a different host would
        // double-append every annotation.
        out.push({ file: toPosixPath(obj.file), line: obj.line, reason: obj.reason });
      }
    } catch {
      // Skip malformed line — same defensive posture as the Python reader.
    }
  }
  return out;
}
