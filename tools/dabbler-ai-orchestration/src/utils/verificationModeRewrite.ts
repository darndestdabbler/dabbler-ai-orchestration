// Set 062 Session 2 (spec D3): pure spec-rewrite helper for the
// `Set up dedicated verification…` action — a sibling of
// `tierRewrite.ts` built on the same config-block regex machinery.
//
// `rewriteSpecVerificationMode` takes the full spec.md text and a
// target mode and rewrites ONLY the `verificationMode:` scalar inside
// the Session Set Configuration YAML block — every other byte of the
// document (indentation, key spacing, quote style, trailing comment,
// CRLF terminator) is preserved verbatim. `verificationMode` strings
// outside the configuration block are never touched, and a
// commented-out `# verificationMode: …` line inside the block does not
// match.
//
// The seed rewrite is only authoritative while NO durable
// `verification_mode` activity-log record exists (the Set 057 capture
// is a one-way silent gate: after first record, spec edits are ignored
// by Python but honored by the Explorer — silent drift).
// `verificationModeRecordExists` is the TS mirror of
// `dedicated_verification.has_verification_mode_record`, so the
// command can refuse the rewrite once the seed has lost authority.
//
// The module is intentionally VS Code-free and filesystem-free (the
// record check takes the raw activity-log text) so the D3 rewrite
// matrix and gating are unit-testable without a host.

import { VerificationMode } from "../types";

// Mirrors the block-location regex in `parseSessionSetConfig`
// (fileSystem.ts) and `tierRewrite.ts` — the rewrite must agree with
// the parser about WHICH region of the spec is "the configuration
// block" — restructured into (prefix)(body)(closing fence) groups so
// the body's offset is computable for an in-place splice.
const CONFIG_BLOCK_RE =
  /(##\s*Session Set Configuration[\s\S]*?```ya?ml\s*)([\s\S]*?)(```)/i;

// Mirrors the parser's `stringRe("verificationMode")` (optional
// single/double quotes around the scalar, optional trailing
// `# comment`) but captures the pieces around the value so the
// replacement preserves them. The optional `\r` keeps CRLF specs
// byte-identical outside the value.
const VERIFICATION_MODE_LINE_RE =
  /^([ \t]*verificationMode[ \t]*:[ \t]*)(?:"([\w-]+)"|'([\w-]+)'|([\w-]+))([ \t]*(?:#[^\r\n]*)?\r?)$/im;

// Must match Python's `VERIFICATION_MODES` in
// `ai_router/dedicated_verification.py` — the record check below
// mirrors `has_verification_mode_record`, which only counts entries
// whose `choice` is a recognized mode.
export const VERIFICATION_MODES: readonly VerificationMode[] = [
  "out-of-band-or-none",
  "dedicated-sessions",
];

// Python's `VERIFICATION_MODE_ENTRY_KIND`.
export const VERIFICATION_MODE_ENTRY_KIND = "verification_mode";

export type VerificationModeRewriteOutcome =
  // The value was rewritten (or the key inserted) — `text` differs.
  | "rewritten"
  // The spec already declares (or defaults to) the target mode.
  | "already-target"
  // No Session Set Configuration block — nothing safe to rewrite.
  | "no-config-block";

export interface VerificationModeRewriteResult {
  /** The rewritten document (identical to the input when !changed). */
  text: string;
  changed: boolean;
  outcome: VerificationModeRewriteOutcome;
  /** The effective mode before the rewrite ("out-of-band-or-none" when the key is absent). */
  previousMode: VerificationMode;
}

/**
 * Rewrite the `verificationMode:` value in `specText`'s Session Set
 * Configuration block to `target`, preserving all other content
 * byte-for-byte.
 *
 * Key-absent specs are effectively `out-of-band-or-none` (the parser
 * default, Set 057's strictly-opt-in contract): switching one to
 * `out-of-band-or-none` is a no-op, while switching to
 * `dedicated-sessions` inserts an explicit declaration at the top of
 * the block. An unknown on-disk value (e.g. a typo'd
 * `verificationMode: dedicated`) also parses as the default, so the
 * same default governs `previousMode` / `already-target` there — but
 * the malformed scalar itself is still rewritten to the canonical
 * target so the switch repairs the typo rather than stacking keys.
 */
export function rewriteSpecVerificationMode(
  specText: string,
  target: VerificationMode,
): VerificationModeRewriteResult {
  const block = CONFIG_BLOCK_RE.exec(specText);
  if (!block) {
    return {
      text: specText,
      changed: false,
      outcome: "no-config-block",
      previousMode: "out-of-band-or-none",
    };
  }
  const bodyStart = block.index + block[1].length;
  const body = block[2];

  const line = VERIFICATION_MODE_LINE_RE.exec(body);
  if (!line) {
    // Key absent → effective mode is the parser default.
    if (target === "out-of-band-or-none") {
      return {
        text: specText,
        changed: false,
        outcome: "already-target",
        previousMode: "out-of-band-or-none",
      };
    }
    // Insert an explicit declaration as the block's first line, reusing
    // the block's own newline flavor so CRLF specs stay uniform.
    const newline = body.includes("\r\n") || (!body.includes("\n") && specText.includes("\r\n"))
      ? "\r\n"
      : "\n";
    const insertion = `verificationMode: ${target}${newline}`;
    const text =
      specText.slice(0, bodyStart) + insertion + specText.slice(bodyStart);
    return { text, changed: true, outcome: "rewritten", previousMode: "out-of-band-or-none" };
  }

  const rawValue = (line[2] ?? line[3] ?? line[4] ?? "").toLowerCase();
  // Unknown scalars parse as the default (parseSessionSetConfig's
  // fallback); report that as the previous mode so callers describe the
  // effective state, not the typo.
  const previousMode: VerificationMode =
    rawValue === "dedicated-sessions" ? "dedicated-sessions" : "out-of-band-or-none";
  if (rawValue === target) {
    return { text: specText, changed: false, outcome: "already-target", previousMode };
  }

  // Preserve the original quote style around the replaced value.
  const quote = line[2] !== undefined ? '"' : line[3] !== undefined ? "'" : "";
  const rewrittenLine = `${line[1]}${quote}${target}${quote}${line[5]}`;
  const lineStart = bodyStart + (line.index ?? 0);
  const lineEnd = lineStart + line[0].length;
  const text =
    specText.slice(0, lineStart) + rewrittenLine + specText.slice(lineEnd);
  return { text, changed: true, outcome: "rewritten", previousMode };
}

// ---------- D3 history gate ----------

// The command-level gate (verifier fix S062-S2-V1-001): D3's locked
// language is "B→A is never offered once ANY activity-log record
// exists" — not merely a `verification_mode` record — and a log the
// extension cannot inspect must FAIL LOUD (refuse the rewrite), not
// fail open. The narrower Python-parity check below
// (`verificationModeRecordExists`) is kept as the step-1 helper, but
// the `Set Up Dedicated Verification…` command gates on this broader
// inspection.
export type ActivityLogInspection =
  // Parsed, `entries` is an empty array — a scaffolded log with no
  // history yet; the seed rewrite is safe.
  | "no-records"
  // Parsed, `entries` has at least one entry — the set has history;
  // the seed is no longer safely rewritable.
  | "has-records"
  // Unparseable or shapeless (`entries` missing / not an array) — the
  // history cannot be inspected; the caller must refuse.
  | "unreadable";

/**
 * Inspect raw activity-log.json text for ANY recorded history. Takes
 * the file text (callers handle file-absent themselves — absence is
 * the normal not-started state and is trivially safe). Unlike the
 * tolerant record check below, ambiguity here reads as "unreadable"
 * so the consumer fails loud rather than rewriting a seed whose
 * history it cannot see.
 */
export function inspectActivityLog(activityLogText: string): ActivityLogInspection {
  let parsed: unknown;
  try {
    parsed = JSON.parse(activityLogText);
  } catch {
    return "unreadable";
  }
  if (parsed === null || typeof parsed !== "object") return "unreadable";
  const entries = (parsed as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return "unreadable";
  return entries.length > 0 ? "has-records" : "no-records";
}

// ---------- D3 durable-record gate (Python-parity helper) ----------

/**
 * TS mirror of `dedicated_verification.has_verification_mode_record`:
 * true iff the activity log carries at least one entry with
 * `kind: "verification_mode"` and a recognized `choice`. Takes the raw
 * activity-log.json text (`null` when the file does not exist) so the
 * predicate stays pure; missing / unparseable / shapeless logs read as
 * "no record", matching the Python reader's tolerant posture. NOT the
 * Session 2 command gate (that is `inspectActivityLog` above, which is
 * broader and fail-loud per S062-S2-V1-001) — this parity helper exists
 * for callers that need the specific Set 057 capture signal.
 */
export function verificationModeRecordExists(
  activityLogText: string | null | undefined,
): boolean {
  if (typeof activityLogText !== "string" || activityLogText.length === 0) {
    return false;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(activityLogText);
  } catch {
    return false;
  }
  if (parsed === null || typeof parsed !== "object") return false;
  const entries = (parsed as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return false;
  return entries.some(
    (e) =>
      e !== null &&
      typeof e === "object" &&
      (e as { kind?: unknown }).kind === VERIFICATION_MODE_ENTRY_KIND &&
      VERIFICATION_MODES.includes((e as { choice?: unknown }).choice as VerificationMode),
  );
}
