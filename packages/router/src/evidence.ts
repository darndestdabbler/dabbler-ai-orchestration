// Evidence primitives: git tree snapshots, output hashing, replay
// transcripts, out-of-band-write detection, and critique quote provenance.
//
// The concerns share this module because they answer one question -- "can
// this claim be trusted?" -- with the same tools:
//
// - Tree snapshots pin what the working tree actually contained at a
//   moment, tracked and untracked alike, without touching the real index.
// - Transcripts make a verifier's REPRODUCED claim checkable: a trusted
//   probe id (never model-authored argv), a pristine checkout, and a replay
//   whose output hash must byte-match.
// - Write records make a hand-edit to `sessions.json` visible: every
//   sanctioned write appends the file's content hash to a machine-side
//   ledger; a state file whose hash matches no record was written by
//   something else.
// - Critique provenance makes a worker's evidence checkable by the
//   framework rather than by the worker: a quote is re-read out of the
//   reviewed tree and re-hashed here, and a declared absence search is
//   re-executed here. What the worker says it saw is an input, never a
//   result.
//
// The filenames at the sessions root are constants because nothing chooses
// where a record lands. A caller that could name the file could name a
// second one, and the record's whole claim is that there is one.

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { readChecks, readWorkerResults, appendWorkerResult } from "./critique.ts";
import type { Row } from "./ledger.ts";
import {
  RUNS_DIRNAME,
  platformNewlines,
  repoRootFor,
  runGit,
  runGitBinary,
} from "./journal.ts";
import { dumps, pythonRepr } from "./pythonJson.ts";
import { workingDirectory } from "./workdir.ts";

// The router spawns git in exactly one function, `journal.runGit`, and the
// tree snapshot and tree diff exist once, beside it. `journal` sits below
// this module; this module is the name the lifecycle callers use, so the
// slice is re-exported here rather than reached for twice.
export {
  changedPathsBetween,
  isMachineStatePath,
  repoRootFor,
  runGit,
  snapshotWorktreeTree,
} from "./journal.ts";

export const SESSIONS_DIRNAME = "sessions";
const SESSIONS_PARENT = "docs";

/** The files that live at the sessions root. */
export const STATE_FILENAME = "sessions.json";
export const ACTIVITY_LOG_FILENAME = "activity-log.json";
export const SESSION_PLAN_FILENAME = "session-plan.md";

export function sessionsDirFor(repoRoot: string): string {
  return join(repoRoot, SESSIONS_PARENT, SESSIONS_DIRNAME);
}

/**
 * The inverse of `sessionsDirFor`, here so the two directions of one rule
 * cannot disagree.
 *
 * A caller holding a sessions root needs the repository root to reach
 * `.dabbler/runs/`, and asking git for it would make the answer depend on
 * the tree being a checkout -- which the projection's own fixtures are not.
 */
export function repoRootFromSessionsDir(sessionsDir: string): string {
  return resolve(sessionsDir, "..", "..");
}

/** No sessions root could be derived from where the caller stood. */
export class SessionsRootNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionsRootNotFoundError";
  }
}

/**
 * The sessions root for the repository the caller is standing in.
 *
 * An explicit path wins so a caller outside the tree can still address a
 * repository; otherwise the root is derived from the working directory.
 * Nothing here selects *which* sessions to act on -- that is the session
 * number's job.
 */
export function resolveSessionsDir(explicit?: string | null, start?: string): string {
  if (explicit) return String(explicit);
  const from = start ?? workingDirectory();
  const root = repoRootFor(from);
  if (root === null) {
    throw new SessionsRootNotFoundError(
      `not inside a git repository: ${from}. Run from the repository, or ` +
        "pass --sessions-dir.",
    );
  }
  return sessionsDirFor(root);
}

// --- Round anchors -----------------------------------------------------------
//
// A round's completion tree is reachable from refs/dabbler/rounds/s<N>/r<R>,
// through a framework-authored commit, from the moment the round is
// recorded. A ref cannot usefully name a bare tree (most servers refuse it
// on push), so the commit is the object the ref names and the tree it
// carries hashes identically to the row's completion_tree.
//
// Retention: one ref per round per session, kept for good. Nothing here
// deletes a round ref -- a baseline that can be pruned is a baseline that
// can go missing again.
//
// The refs live outside refs/heads and refs/tags, so a clone's default
// refspecs neither push nor fetch them; `ensureRoundRefspecs` is what
// teaches a clone to carry them both ways.

// The anchor plumbing lives at the git seam (`journal.ts`); re-exported so
// every existing consumer keeps its import. The move is what freed the
// ledger from importing up into this layer to write its own anchor.
import {
  ROUND_REFSPEC,
  ROUND_REF_NAMESPACE,
  anchorRoundTree,
  objectExists,
  roundRef,
} from "./journal.ts";
export { ROUND_REFSPEC, ROUND_REF_NAMESPACE, anchorRoundTree, objectExists, roundRef };

/**
 * With `remote.<name>.push` set at all, a bare `git push` sends only what
 * the refspecs name, so the current branch has to be named beside the
 * rounds. HEAD pushes it to the branch of the same name, which is what
 * `push.default: simple` does on the trunk-based layout every session runs
 * on.
 */
export const ROUND_PUSH_BRANCH_REFSPEC = "HEAD";


/** Every round ref this session has, ascending by round. */
export function sessionRoundRefs(repoRoot: string, sessionNumber: number): string[] {
  const prefix = `${ROUND_REF_NAMESPACE}/s${Math.trunc(sessionNumber)}/`;
  const result = runGit(repoRoot, ["for-each-ref", "--format=%(refname)", prefix]);
  if (result.code !== 0 || !result.stdout) return [];
  const refs = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const round = (ref: string): number => {
    const tail = ref.slice(ref.lastIndexOf("/") + 1).slice(1);
    return /^\d+$/.test(tail) ? Number.parseInt(tail, 10) : 0;
  };
  // A stable sort by round, which is what Python's `sorted(key=...)` is.
  return refs
    .map((ref, index) => ({ ref, index, key: round(ref) }))
    .sort((left, right) => left.key - right.key || left.index - right.index)
    .map((entry) => entry.ref);
}

/**
 * The remote the current branch pushes to, or `origin` when the branch
 * names none.
 */
export function upstreamRemote(repoRoot: string): string {
  const head = runGit(repoRoot, ["symbolic-ref", "--short", "-q", "HEAD"]);
  const branch = head.stdout.trim();
  if (head.code === 0 && branch) {
    const configured = runGit(repoRoot, [
      "config",
      "--get",
      `branch.${branch}.remote`,
    ]);
    const remote = configured.stdout.trim();
    if (configured.code === 0 && remote) return remote;
  }
  return "origin";
}

export interface PushedRoundRefs {
  readonly pushed: readonly string[];
  /** Null on success. A push that silently left the rounds behind is the
   * defect this exists to close, so a failure is returned, never swallowed. */
  readonly error: string | null;
}

/** Push the session's round refs to the branch's remote. No refs is not an error. */
export function pushRoundRefs(
  repoRoot: string,
  sessionNumber: number,
): PushedRoundRefs {
  const refs = sessionRoundRefs(repoRoot, sessionNumber);
  if (refs.length === 0) return { pushed: [], error: null };
  const pushed = runGit(repoRoot, [
    "push",
    upstreamRemote(repoRoot),
    ...refs.map((ref) => `${ref}:${ref}`),
  ]);
  if (pushed.code !== 0) {
    return { pushed: [], error: pushed.stderr || `git push exited ${pushed.code}` };
  }
  return { pushed: refs, error: null };
}

/**
 * Teach the clone to carry round refs both ways; returns the config values
 * added (empty when it already did).
 *
 * Fetching is what makes a round recorded elsewhere resolve here; pushing is
 * what lets the operator's own mid-session push move a session without
 * stranding its baselines. Any push refspec the clone already had is kept as
 * it is, and the branch entry is added only when there was none, because a
 * clone that chose its own push refspecs chose what a bare push sends.
 */
export function ensureRoundRefspecs(
  repoRoot: string,
  remote?: string | null,
): string[] {
  const name = remote || upstreamRemote(repoRoot);
  if (runGit(repoRoot, ["remote", "get-url", name]).code !== 0) {
    return []; // no remote, nothing to carry the refs to or from
  }
  const added: string[] = [];
  for (const [key, value] of [
    [`remote.${name}.fetch`, ROUND_REFSPEC],
    [`remote.${name}.push`, ROUND_REFSPEC],
  ] as const) {
    const existing = runGit(repoRoot, ["config", "--get-all", key]);
    const current =
      existing.code === 0
        ? existing.stdout
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line !== "")
        : [];
    if (current.includes(value)) continue;
    if (key.endsWith(".push") && current.length === 0) {
      runGit(repoRoot, ["config", "--add", key, ROUND_PUSH_BRANCH_REFSPEC]);
      added.push(`${key}=${ROUND_PUSH_BRANCH_REFSPEC}`);
    }
    if (runGit(repoRoot, ["config", "--add", key, value]).code === 0) {
      added.push(`${key}=${value}`);
    }
  }
  return added;
}

/**
 * The file's exact bytes as `tree` recorded them, or null.
 *
 * The reviewed tree, never the working tree. The tree is pinned and the
 * worktree keeps moving, so a quote checked against the worktree says
 * nothing about what was reviewed -- and would start passing again the
 * moment an author re-typed the line it failed on. Bytes, not text: the
 * newline framing that is noise in porcelain is content in a blob, so this
 * asks the one git call for bytes rather than spawning around it.
 */
export function readTreeBlob(
  repoRoot: string,
  tree: string,
  path: string,
): Buffer | null {
  const result = runGitBinary(repoRoot, ["cat-file", "blob", `${tree}:${path}`]);
  return result.code === 0 ? result.stdout : null;
}

/**
 * Every path in `tree`, repo-relative. The closed universe an absence
 * search may range over.
 */
export function treePaths(repoRoot: string, tree: string): string[] {
  const result = runGit(repoRoot, ["ls-tree", "-r", "--name-only", "-z", tree]);
  if (result.code !== 0) return [];
  return result.stdout.split("\0").filter((path) => path !== "");
}

// --- Digests -----------------------------------------------------------------

export function hashBytes(raw: Buffer | Uint8Array): string {
  return "sha256:" + createHash("sha256").update(raw).digest("hex");
}

/**
 * `sha256:<hex>` of the raw, unsummarized text -- no normalization, no
 * trimming; the prefix is part of the value.
 */
export function hashOutput(raw: unknown): string {
  const text = typeof raw === "string" ? raw : raw === null || raw === undefined ? "" : String(raw);
  return hashBytes(Buffer.from(text, "utf8"));
}

// --- Replay transcripts --------------------------------------------------------

export const EVIDENCE_REPRODUCED = "REPRODUCED";
export const EVIDENCE_ASSERTED = "ASSERTED";
export const EVIDENCE_HYPOTHESIS = "HYPOTHESIS";
export const EVIDENCE_TIERS: readonly string[] = [
  EVIDENCE_REPRODUCED,
  EVIDENCE_ASSERTED,
  EVIDENCE_HYPOTHESIS,
];
export const DEFAULT_EVIDENCE_TIER = EVIDENCE_ASSERTED;

export const PUBLIC_ENTRYPOINT_KINDS: readonly string[] = [
  "public_command",
  "public_api",
  "cli",
  "test_entrypoint",
];
export const ENTRYPOINT_AGENT_HARNESS = "agent_harness";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateEntrypoint(entrypoint: unknown, reasons: string[]): void {
  if (!isObject(entrypoint)) {
    reasons.push("transcript needs an entrypoint object");
    return;
  }
  const kind = entrypoint["kind"];
  if (kind === ENTRYPOINT_AGENT_HARNESS) {
    reasons.push(
      "an agent-built harness cannot be the oracle for its own finding; " +
        "drive a public entrypoint instead",
    );
  } else if (typeof kind !== "string" || !PUBLIC_ENTRYPOINT_KINDS.includes(kind)) {
    reasons.push(`entrypoint.kind must be one of ${pythonRepr(PUBLIC_ENTRYPOINT_KINDS)}`);
  }
  const ref = entrypoint["ref"];
  if (typeof ref !== "string" || ref.trim() === "") {
    reasons.push("entrypoint.ref must be a non-empty string");
  }
}

/** Python's `isinstance(v, int) and not isinstance(v, bool)`. */
function isPythonInt(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value);
}

function validateExitCode(value: unknown, label: string, reasons: string[]): void {
  if (value !== null && value !== undefined && !isPythonInt(value)) {
    reasons.push(`${label} must be an integer or null`);
  }
}

export interface TranscriptCheck {
  readonly ok: boolean;
  readonly reasons: readonly string[];
}

/**
 * Every reason a transcript is not trustworthy, accumulated.
 *
 * The trust rules: a trusted probe identifier (commandId XOR templateId,
 * never model-authored argv), a pristine checkout, raw output with its hash,
 * a public entrypoint, and a pristine replay whose hash byte-matches.
 *
 * What is deliberately NOT checked, stated so a reader does not assume it:
 * `outputHash` is not re-derived from `rawOutput`. Both are claims -- the
 * framework never observed the process -- so deriving one from the other
 * would catch an *inconsistent* fabrication and not a consistent one, and
 * the trust actually rests on the operator-authored probe id and the replay.
 * Python does not derive it either, and adding the derivation on one side
 * only is the drift the parity control exists to catch. If it is wanted, it
 * goes into Python first (D173's route); nothing calls this function on
 * either side today.
 */
export function validateTranscript(transcript: unknown): TranscriptCheck {
  if (!isObject(transcript)) {
    return { ok: false, reasons: ["transcript is missing or not an object"] };
  }
  const reasons: string[] = [];

  const pinned = transcript["pinnedRef"];
  if (typeof pinned !== "string" || pinned.trim() === "") {
    reasons.push("pinnedRef must be a non-empty string");
  }

  const hasCommand = "commandId" in transcript;
  const hasTemplate = "templateId" in transcript;
  if (hasCommand && hasTemplate) {
    reasons.push(
      "transcript carries both commandId and templateId; exactly one trusted-probe " +
        "identifier is required",
    );
  } else if (!hasCommand && !hasTemplate) {
    reasons.push(
      "transcript needs a commandId OR a templateId (a trusted, operator-authored " +
        "probe identifier - never model-authored argv)",
    );
  }

  const args = transcript["args"];
  if (args !== null && args !== undefined && !isObject(args) && !Array.isArray(args)) {
    reasons.push("args must be an object or an array");
  }
  if (transcript["pristineCheckout"] !== true) {
    reasons.push("pristineCheckout must be true");
  }
  if (!("exitCode" in transcript)) {
    reasons.push("exitCode is required (null means killed/timed out)");
  } else {
    validateExitCode(transcript["exitCode"], "exitCode", reasons);
  }
  if (typeof transcript["rawOutput"] !== "string") {
    reasons.push("rawOutput must be the raw, unsummarized text");
  }
  const outputHash = transcript["outputHash"];
  if (typeof outputHash !== "string" || outputHash === "") {
    reasons.push("outputHash must be a non-empty string");
  }

  validateEntrypoint(transcript["entrypoint"], reasons);

  const replay = transcript["replay"];
  if (!isObject(replay)) {
    reasons.push("replay (a second, fresh checkout) is required");
  } else {
    if (replay["pristineCheckout"] !== true) {
      reasons.push("replay.pristineCheckout must be true");
    }
    if ("exitCode" in replay) {
      validateExitCode(replay["exitCode"], "replay.exitCode", reasons);
    }
    const replayHash = replay["outputHash"];
    if (typeof replayHash !== "string" || replayHash === "") {
      reasons.push("replay.outputHash must be a non-empty string");
    } else if (typeof outputHash === "string" && replayHash !== outputHash) {
      reasons.push(
        "the replay did not reproduce the same raw result, so the finding is not " +
          "a re-runnable falsifier",
      );
    }
  }
  return { ok: reasons.length === 0, reasons };
}

export interface EvidenceResult {
  readonly ok: boolean;
  readonly code: string;
  readonly tier: string;
  readonly reasons: readonly string[];
}

export function validateFindingEvidence(finding: unknown): EvidenceResult {
  if (!isObject(finding)) {
    return {
      ok: false,
      code: "evidence-not-an-object",
      tier: DEFAULT_EVIDENCE_TIER,
      reasons: [],
    };
  }
  const tier = finding["evidenceTier"];
  if (tier === null || tier === undefined) {
    return { ok: true, code: "evidence-ok", tier: DEFAULT_EVIDENCE_TIER, reasons: [] };
  }
  if (typeof tier !== "string" || !EVIDENCE_TIERS.includes(tier)) {
    return {
      ok: false,
      code: "evidence-unknown-tier",
      tier: DEFAULT_EVIDENCE_TIER,
      reasons: [`unknown evidenceTier ${pythonRepr(tier)}`],
    };
  }
  if (tier !== EVIDENCE_REPRODUCED) {
    return { ok: true, code: "evidence-ok", tier, reasons: [] };
  }
  const transcript = finding["transcript"];
  if (transcript === null || transcript === undefined) {
    return {
      ok: false,
      code: "reproduced-no-transcript",
      tier: EVIDENCE_ASSERTED,
      reasons: ["REPRODUCED claims require a transcript"],
    };
  }
  const checked = validateTranscript(transcript);
  if (checked.ok) {
    return { ok: true, code: "evidence-ok", tier: EVIDENCE_REPRODUCED, reasons: [] };
  }
  return {
    ok: false,
    code: "reproduced-bad-transcript",
    tier: EVIDENCE_ASSERTED,
    reasons: checked.reasons,
  };
}

/**
 * The trust rule: a valid transcript earns REPRODUCED; otherwise the claim
 * collapses to HYPOTHESIS (when proposed) or ASSERTED. The tier is stamped
 * by the orchestrator post-hoc, never self-awarded.
 */
export function authoritativeTier(proposedTier: unknown, transcript: unknown): string {
  if (
    transcript !== null &&
    transcript !== undefined &&
    validateTranscript(transcript).ok
  ) {
    return EVIDENCE_REPRODUCED;
  }
  if (proposedTier === EVIDENCE_HYPOTHESIS) return EVIDENCE_HYPOTHESIS;
  return EVIDENCE_ASSERTED;
}

// --- state-writes.jsonl ------------------------------------------------------

const STATE_WRITES_FILENAME = "state-writes.jsonl";

function stateWritesPath(repoRoot: string): string {
  return join(repoRoot, ...RUNS_DIRNAME.split("/"), STATE_WRITES_FILENAME);
}

/**
 * The digest of `sessions.json` as it stands, or null when it cannot be
 * read.
 *
 * The file is read as TEXT, the way Python reads it, so a CRLF checkout
 * and an LF one hash the same -- the digest is over what the record says,
 * not over how a checkout spelled its line endings.
 */
export function stateFileHash(sessionsDir: string): string | null {
  try {
    const text = readFileSync(join(sessionsDir, STATE_FILENAME), "utf8").replace(
      /\r\n?/g,
      "\n",
    );
    return hashOutput(text);
  } catch {
    return null;
  }
}

/**
 * One row per sanctioned write of `sessions.json`.
 *
 * Best-effort by contract: outside a git repository -- a unit test, a
 * scratch directory -- the record is simply not kept, because there is
 * nowhere it belongs. A write that failed to be recorded must never fail
 * the write it was recording.
 */
export function recordStateWrite(sessionsDir: string, repoRoot?: string | null): void {
  const root = repoRoot ?? repoRootFor(sessionsDir);
  if (!root) return;
  const digest = stateFileHash(sessionsDir);
  if (digest === null) return;
  const path = stateWritesPath(root);
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, platformNewlines(dumps({ hash: digest }) + "\n"), {
      encoding: "utf8",
    });
  } catch {
    // See the docstring: recording is never allowed to fail a write.
  }
}

/**
 * Null when the current `sessions.json` content matches some sanctioned
 * write; otherwise the reason it does not.
 *
 * With `requireRecord` -- the close gate's mode -- an absent or empty record
 * is itself a finding: absence is the signature a fully-simulated session
 * leaves.
 */
export function detectOutOfBandWrite(
  sessionsDir: string,
  repoRoot?: string | null,
  options: { requireRecord?: boolean } = {},
): string | null {
  const requireRecord = options.requireRecord === true;
  const root = repoRoot ?? repoRootFor(sessionsDir);
  if (!root) return requireRecord ? "not inside a git repository" : null;
  const current = stateFileHash(sessionsDir);
  if (current === null) return `${STATE_FILENAME} is unreadable`;

  let text: string;
  try {
    text = readFileSync(stateWritesPath(root), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return requireRecord
        ? `no sanctioned-writer record exists for ${STATE_FILENAME} ` +
            "(state-writes ledger absent)"
        : null;
    }
    return `state-writes ledger unreadable (${String(error)})`;
  }

  const recorded = new Set<string>();
  for (const line of text.split(/\r\n|\r|\n/)) {
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (isObject(row) && typeof row["hash"] === "string") recorded.add(row["hash"]);
  }
  if (recorded.size === 0) {
    return requireRecord ? "the state-writes ledger is empty" : null;
  }
  if (!recorded.has(current)) {
    return (
      `${STATE_FILENAME} content matches no sanctioned write -- it was edited ` +
      "out of band"
    );
  }
  return null;
}

// --- Critique evidence provenance ---------------------------------------------
//
// The framework checks the worker, not the other way round. A worker names
// what it saw and where; every one of those claims is re-derived here from
// the reviewed tree before it can reach the record. Nothing below routes to
// a model, and nothing below reads a verdict.

/**
 * A refusal with a name. The code is the contract -- an operator or a later
 * stage sorts on `code`, never on the prose.
 */
export class EvidenceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "EvidenceError";
    this.code = code;
  }
}

// --- Quote provenance ----------------------------------------------------------
//
// Provenance is the triple that makes a quote checkable regardless of what
// language it was written in: the reviewed tree's digest, the exact line or
// byte range, and a byte-exact match of the quoted text against that tree.
// It proves *where* a quote came from, never *what kind of construct it is*
// -- a check that needs the latter is a check for a deterministic analyzer,
// which the control surface already routes.

export const SPAN_KINDS: readonly string[] = ["byte", "line"];

function lineStartOffsets(blob: Buffer): number[] {
  const starts = [0];
  for (let index = 0; index < blob.length; index += 1) {
    if (blob[index] === 0x0a) starts.push(index + 1);
  }
  return starts;
}

/**
 * `[start, end)` byte offsets for a declared span.
 *
 * `byte` spans are byte offsets; `line` spans are 1-based inclusive line
 * numbers, which is how a human cites a file and how a worker will report
 * one.
 */
function spanBounds(blob: Buffer, span: unknown): [number, number] {
  if (!isObject(span)) {
    throw new EvidenceError("quote-malformed", "span must be an object");
  }
  const kind = span["kind"];
  const start = span["start"];
  const end = span["end"];
  if (
    typeof kind !== "string" ||
    !SPAN_KINDS.includes(kind) ||
    !isPythonInt(start) ||
    !isPythonInt(end)
  ) {
    throw new EvidenceError(
      "quote-malformed",
      `span needs an integer start and end and a kind in ${pythonRepr(SPAN_KINDS)}; ` +
        `got ${dumps(span)}`,
    );
  }
  const from = start as number;
  const to = end as number;
  if (kind === "byte") {
    if (from < 0 || to < from || to > blob.length) {
      throw new EvidenceError(
        "quote-span-out-of-range",
        `bytes ${from}..${to} fall outside a ${blob.length}-byte file`,
      );
    }
    return [from, to];
  }
  const starts = lineStartOffsets(blob);
  if (from < 1 || to < from || to > starts.length) {
    throw new EvidenceError(
      "quote-span-out-of-range",
      `lines ${from}..${to} fall outside a ${starts.length}-line file`,
    );
  }
  const tail = to < starts.length ? (starts[to] as number) : blob.length;
  return [starts[from - 1] as number, tail];
}

export interface VerifiedQuote {
  readonly path: string;
  readonly content_hash: string;
  readonly span: Record<string, unknown>;
}

/**
 * Re-derive a quote from the reviewed tree and return the framework's own
 * record of it. Throws `EvidenceError` on any mismatch.
 *
 * The returned `content_hash` is the one computed here. The worker's value
 * is only ever an assertion to be tested against the tree. Path, span and
 * hash are the whole contract: they prove where a quote came from and that
 * its bytes match, in any file the tree contains, and nothing here asks what
 * kind of construct those bytes form.
 */
export function verifyQuote(
  repoRoot: string,
  reviewedTree: string,
  quote: unknown,
): VerifiedQuote {
  if (!isObject(quote)) {
    throw new EvidenceError("quote-malformed", "quote must be an object");
  }
  const path = quote["path"];
  const declaredHash = quote["content_hash"];
  if (typeof path !== "string" || path === "") {
    throw new EvidenceError("quote-malformed", "quote needs a path");
  }
  if (typeof declaredHash !== "string" || declaredHash === "") {
    throw new EvidenceError("quote-malformed", `quote for ${path} needs a content_hash`);
  }

  const blob = readTreeBlob(repoRoot, reviewedTree, path);
  if (blob === null) {
    throw new EvidenceError(
      "quote-path-missing",
      `${path} is not in the reviewed tree ${reviewedTree}`,
    );
  }
  // Python indexes `quote["span"]` and raises KeyError when there is none.
  // A language-level lookup error has no counterpart here, so an absent span
  // reaches `spanBounds` and earns this module's own refusal instead. Both
  // raise; only the class differs, and nothing catches on it.
  const [start, end] = spanBounds(blob, quote["span"]);
  const actual = hashBytes(blob.subarray(start, end));
  if (actual !== declaredHash) {
    throw new EvidenceError(
      "quote-hash-mismatch",
      `the quoted span of ${path} hashes to ${actual}, not the ${declaredHash} ` +
        "the worker recorded -- the quote does not come from the reviewed tree",
    );
  }

  return {
    path,
    content_hash: actual,
    span: { ...(quote["span"] as Record<string, unknown>) },
  };
}

// --- Framework-executed absence search ------------------------------------------

export const ABSENCE_QUERY_KINDS: readonly string[] = ["literal", "regex"];

/**
 * What produced an absence count, written onto every measured row.
 *
 * The field's job is not to name a regex engine but to overwrite whatever
 * the reviewer claimed: a worker can say it searched and report a number,
 * and this function re-runs the search and stamps its own answer. Any
 * framework-owned constant does that, and a constant is what this is.
 *
 * Both routers used to name their own engine -- `python-re/<version>` there,
 * `node-regexp/<node>` here -- which cost two things. Neither could write
 * the other's truthfully, so the same row differed between two routers
 * required to write identical bytes; and the Python value moved whenever the
 * interpreter's PATCH version moved, so it was never stable inside one
 * router either. Naming the framework fixes both and loses nothing a reader
 * used: when two engines genuinely disagree the COUNT differs, and the count
 * is what is compared.
 */
export const ABSENCE_TOOL = "dabbler-absence-search/1";

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `**` crosses directories, `*` and `?` do not.
 *
 * A plain fnmatch would let a bare `*.py` swallow the whole repository,
 * which turns a declared narrow scope into an undeclared wide one.
 */
function globToRegExp(pattern: string): RegExp {
  const out: string[] = [];
  let index = 0;
  while (index < pattern.length) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern.slice(index + 1, index + 2) === "*") {
        out.push(".*");
        index += 2;
        continue;
      }
      out.push("[^/]*");
    } else if (char === "?") {
      out.push("[^/]");
    } else {
      out.push(escapeForRegExp(char as string));
    }
    index += 1;
  }
  return new RegExp("^" + out.join("") + "$");
}

/**
 * The paths a declared scope actually resolves to in the reviewed tree,
 * sorted. The scope is closed: what is not in the tree is not searched, and
 * what is not matched is not silently included.
 */
export function scopePaths(
  repoRoot: string,
  reviewedTree: string,
  scope: unknown,
): string[] {
  if (!Array.isArray(scope) || scope.length === 0) {
    throw new EvidenceError(
      "absence-declaration-malformed",
      "an absence search needs a non-empty scope",
    );
  }
  const matchers = scope.map((pattern) => globToRegExp(String(pattern)));
  return treePaths(repoRoot, reviewedTree)
    .filter((path) => matchers.some((matcher) => matcher.test(path)))
    .sort();
}

export interface AbsenceSearchRow {
  readonly query: string;
  readonly query_kind: string;
  readonly scope: readonly string[];
  readonly tool_version: string;
  readonly matches: number;
}

/**
 * Re-run a declared search here and return the framework's row.
 *
 * A worker's assertion that it searched is not evidence that it searched, so
 * the count in the returned row is this function's, and the tool that
 * produced it is named. A scope that resolves to no file is refused:
 * absence over nothing is the cheapest false proof there is.
 */
export function runAbsenceSearch(
  repoRoot: string,
  reviewedTree: string,
  declaration: unknown,
): AbsenceSearchRow {
  if (!isObject(declaration)) {
    throw new EvidenceError(
      "absence-declaration-malformed",
      "an absence search must be an object",
    );
  }
  const query = declaration["query"];
  const queryKind = declaration["query_kind"];
  if (typeof query !== "string" || query === "") {
    throw new EvidenceError(
      "absence-declaration-malformed",
      "the query must be a string",
    );
  }
  if (typeof queryKind !== "string" || !ABSENCE_QUERY_KINDS.includes(queryKind)) {
    throw new EvidenceError(
      "absence-declaration-malformed",
      `query_kind must be one of ${pythonRepr(ABSENCE_QUERY_KINDS)}`,
    );
  }
  const scope = declaration["scope"];
  const selected = scopePaths(repoRoot, reviewedTree, scope);
  if (selected.length === 0) {
    throw new EvidenceError(
      "absence-scope-empty",
      `scope ${pythonRepr((scope as unknown[]).map(String))} matches nothing ` +
        `searchable in the reviewed tree ${reviewedTree}; an absence proved ` +
        "over an empty scope proves nothing",
    );
  }

  let pattern: RegExp;
  if (queryKind === "regex") {
    try {
      pattern = new RegExp(query, "g");
    } catch (error) {
      throw new EvidenceError(
        "absence-query-invalid",
        `${pythonRepr(query)} is not a regex (${
          error instanceof Error ? error.message : String(error)
        })`,
      );
    }
  } else {
    pattern = new RegExp(escapeForRegExp(query), "g");
  }

  let matches = 0;
  for (const path of selected) {
    const blob = readTreeBlob(repoRoot, reviewedTree, path);
    if (blob === null) {
      throw new EvidenceError(
        "absence-scope-unreadable",
        `${path} is in the declared scope but unreadable from the reviewed ` +
          `tree ${reviewedTree}`,
      );
    }
    // `toString("utf8")` substitutes U+FFFD for an invalid sequence, which is
    // what Python's `decode("utf-8", "replace")` does: a binary file in scope
    // is searched rather than refused.
    matches += [...blob.toString("utf8").matchAll(pattern)].length;
  }

  return {
    query,
    query_kind: queryKind,
    scope: (scope as unknown[]).map(String),
    tool_version: ABSENCE_TOOL,
    matches,
  };
}

// --- The unprovable-absence ladder, and the one-way door out of blocked ---------

export const UNPROVABLE_ABSENCE_LADDER: readonly string[] = [
  "deterministic-test-or-analyzer",
  "narrower-positive-counterexample",
  "blocked-with-manager-adjudication",
  "human-review",
];

/**
 * Blocked for one of these means the worker ran out of reach, not that the
 * code is clean. The next attempt may have a bigger budget; a bigger budget
 * is not evidence, so it cannot move the result on its own.
 */
export const UNDISCHARGEABLE_BLOCKED_REASONS: readonly string[] = [
  "unprovable-absence",
  "authorized-pulls-insufficient",
  "bounds-exhausted",
  "tooling-unavailable",
];

/**
 * The next rung for a claim that cannot be proved by search, in the plan's
 * order. Null means human review has already been reached -- which is the
 * end of the ladder, never a licence to pass.
 */
export function nextAbsenceFallback(exhausted: readonly unknown[] = []): string | null {
  for (const rung of UNPROVABLE_ABSENCE_LADDER) {
    if (!exhausted.includes(rung)) return rung;
  }
  return null;
}

/**
 * The framework's version of a worker's result row.
 *
 * Every quote is re-read from the reviewed tree, re-hashed, and matched
 * byte-for-byte against the span it claims; every declared absence search is
 * re-executed and its count replaced by the one measured here. A worker that
 * reported a different count reported something untrue, and the row is
 * refused rather than corrected -- a silently corrected row would let a
 * fabricated search be indexed as a real one.
 *
 * `priorResults` closes the one-way door. A check already recorded `blocked`
 * for a reason that means "out of reach" has no `pass` in its future at all:
 * the exits are the ladder's, and none of them is this check passing.
 * Anything weaker would make "run it again with more context" the exit,
 * which is the one route the plan forbids.
 */
export function verifyWorkerResult(
  repoRoot: string,
  reviewedTree: string,
  row: unknown,
  options: { priorResults?: readonly unknown[] } = {},
): Row {
  if (!isObject(row)) {
    throw new EvidenceError(
      "worker-result-malformed",
      "a worker result must be an object",
    );
  }
  const result = row["result"];
  const checkId = row["check_id"];
  if (
    (result !== "pass" && result !== "fail" && result !== "blocked") ||
    typeof checkId !== "string" ||
    checkId === ""
  ) {
    throw new EvidenceError(
      "worker-result-malformed",
      "a worker result needs a check_id and a result of pass, fail or blocked; " +
        `got ${pythonRepr(checkId)}/${pythonRepr(result)}`,
    );
  }

  if (result === "pass") {
    const stuck = [
      ...new Set(
        (options.priorResults ?? [])
          .filter(isObject)
          .filter(
            (prior) =>
              prior["check_id"] === checkId &&
              prior["result"] === "blocked" &&
              typeof prior["blocked_reason"] === "string" &&
              UNDISCHARGEABLE_BLOCKED_REASONS.includes(prior["blocked_reason"]),
          )
          .map((prior) => String(prior["blocked_reason"])),
      ),
    ].sort();
    if (stuck.length > 0) {
      throw new EvidenceError(
        "blocked-not-dischargeable",
        `check ${checkId} is on the record as blocked (${stuck.join(", ")}), so ` +
          `it has no pass in its future. The exits are ` +
          `${pythonRepr(UNPROVABLE_ABSENCE_LADDER)}; a later attempt with more ` +
          "context or tools is a bigger budget, which is not evidence about " +
          "the code.",
      );
    }
  }

  const quotes = ((row["quotes"] as unknown[] | null | undefined) ?? []).map((quote) =>
    verifyQuote(repoRoot, reviewedTree, quote),
  );
  const searches: AbsenceSearchRow[] = [];
  for (const declared of (row["absence_searches"] as unknown[] | null | undefined) ??
    []) {
    const measured = runAbsenceSearch(repoRoot, reviewedTree, declared);
    const claimed = isObject(declared) ? declared["matches"] : undefined;
    if (isPythonInt(claimed) && claimed !== measured.matches) {
      throw new EvidenceError(
        "absence-search-disagrees",
        `the worker recorded ${String(claimed)} match(es) for ` +
          `${pythonRepr(measured.query)}; re-running it over the same scope ` +
          `found ${measured.matches}`,
      );
    }
    searches.push(measured);
  }

  const verified: Row = { ...row };
  if (quotes.length > 0 || "quotes" in row) verified["quotes"] = quotes;
  if (searches.length > 0 || "absence_searches" in row) {
    verified["absence_searches"] = searches;
  }
  return verified;
}

/**
 * The one way a worker result reaches the record: verified here against the
 * reviewed tree and against the check it answers, then validated and
 * appended by the ledger.
 *
 * The check must already be on the record. A result for an unregistered
 * `check_id` has no objective, no scope and no evidence contract to be held
 * to, so accepting one would turn the quote contract off exactly when a
 * worker names a check nobody wrote.
 *
 * The declaration is read for REGISTRATION and for nothing else. Its
 * `evidence.pass.requires` contract is not enforced here, so a `pass`
 * carrying no quote is appended: what `verifyWorkerResult` guarantees is
 * that every quote and search the row DOES carry was re-derived from the
 * reviewed tree, not that the row carries the ones the check asked for.
 * Python is the same, and neither router has a caller for this function
 * yet, so the enforcement lands with the pipeline that first drives it
 * (session 32/33) rather than being invented on one side here.
 */
export function recordWorkerResult(
  repoRoot: string,
  sessionNumber: number,
  reviewedTree: string,
  row: Row,
): Row {
  const changeId = String(row["change_id"]);
  const checks = readChecks(repoRoot, sessionNumber, changeId);
  const check = checks.find((entry) => entry["check_id"] === row["check_id"]);
  if (check === undefined) {
    throw new EvidenceError(
      "check-not-registered",
      `no check ${pythonRepr(row["check_id"])} is recorded for change ` +
        `${changeId}; the checks on the record are ` +
        `${pythonRepr(checks.map((entry) => String(entry["check_id"])))}. Write the ` +
        "check down and bound it before recording an answer to it.",
    );
  }
  const verified = verifyWorkerResult(repoRoot, reviewedTree, row, {
    priorResults: readWorkerResults(repoRoot, sessionNumber, changeId),
  });
  appendWorkerResult(repoRoot, sessionNumber, verified);
  return verified;
}
