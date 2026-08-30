// What the machine already knows about a change, before a model sees it.
//
// Three kinds of fact live here, and they share a module because they share
// a deadline: all of them are settled before the first token is bought.
//
// - **The changed surface.** The diff, the untracked files the diff only
//   names, and the rendered bundle a verifier reviews. It is a rendering of
//   a fact, not a judgement about one.
// - **The declared controls.** Compile, typecheck, lint, analyzer --
//   normalized into one closed vocabulary so a reader never has to know
//   which tool spoke.
// - **The changed lines.** Which lines the change adds, per path. Context
//   for whoever reads the record; nothing is judged by it.
//
// The vocabulary is closed at four words and the missing one is the point: a
// control this repository does not declare reads `not_applicable`, a control
// that could not be executed reads `unknown`, and neither is ever `pass`. An
// absent tool that reports success is worse than no tool at all, because the
// record then carries a green row nobody ran.
//
// Facts are cheap and models are not, so a red *required* fact returns to
// the author here rather than riding into a verification round as something
// for a verifier to discover.

import { spawnSync } from "node:child_process";
import { appendFileSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { shlexSplit } from "./checks.ts";
import {
  nowIso,
  repoRootFor,
  runGit,
  snapshotWorktreeTree,
  RUNS_DIRNAME,
} from "./journal.ts";
import { LIFECYCLE_WRITTEN_FILES } from "./ledger.ts";
import { dumps } from "./pythonJson.ts";

export const DEFAULT_EVIDENCE_CHAR_CAP = 600 * 1024;
const UNTRACKED_INLINE_CAP = 64 * 1024;

export const DEFAULT_DIFF_EXCLUDES: readonly string[] = [
  "dist",
  "out",
  "node_modules",
  ".venv",
  "__pycache__",
  "*.vsix",
  ".dabbler",
];

/**
 * A deleted file is named, not reproduced.
 *
 * git's own flag, with git's own rationale: the patch stops being one
 * `git apply` could use, and is "solely for people who want to just
 * concentrate on reviewing the text after the change". That is exactly a
 * verifier. What it needs from a deletion is WHICH file went and whether
 * anything still reaches for it, and neither of those is in the removed
 * lines -- while the removed lines are the whole of the cost. The session
 * that retired the reference implementation would have sent 2 MB of
 * deleted Python to a model that must then find the twenty lines that were
 * not a deletion, and the cap would have refused it first.
 *
 * The deletion stays visible: every `deleted file mode` header is in the
 * bundle, and `git status --short` above it lists them again.
 */
const IRREVERSIBLE_DELETE = "--irreversible-delete";

export const FACTS_FILENAME = "deterministic-facts.jsonl";

// A control gets one word, and the four are not interchangeable. "pass" is
// reserved for a control that ran and was green; nothing else may borrow it.
export const STATUS_PASS = "pass";
export const STATUS_FAIL = "fail";
export const STATUS_NOT_APPLICABLE = "not_applicable";
export const STATUS_UNKNOWN = "unknown";
export const STATUSES: readonly string[] = [
  STATUS_PASS,
  STATUS_FAIL,
  STATUS_NOT_APPLICABLE,
  STATUS_UNKNOWN,
];

// Declared once each. A second lint control would need a name to be told
// apart, and a name is a thing to get wrong; the kind is the identity.
export const CONTROL_KINDS: readonly string[] = [
  "compile",
  "typecheck",
  "lint",
  "analyzer",
];
export const CONTROL_FIELDS: ReadonlySet<string> = new Set([
  "kind",
  "command",
  "required",
]);

export const CONTROL_TIMEOUT_SECONDS = 600;

/**
 * How much of a control's own output the record keeps, on a pass and on a
 * failure alike. The record is read by a person and by a verifier's context
 * budget; a control that prints a whole build log does not get to fill
 * either.
 */
export const CONTROL_DETAIL_LIMIT = 1500;

export const KIND_TESTS = "tests";

const BOOKKEEPING_BASENAMES: ReadonlySet<string> = new Set(
  LIFECYCLE_WRITTEN_FILES,
);

export class FactsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FactsError";
  }
}

/**
 * Nothing to review: a bundle a verifier cannot review must never be routed
 * -- a session that already committed its work once verified nothing and
 * nearly closed clean.
 */
export class EvidenceEmptyError extends FactsError {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceEmptyError";
  }
}

export class EvidenceTooLargeError extends FactsError {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceTooLargeError";
  }
}

// --- The changed surface ----------------------------------------------------

export function evidenceCharCap(): number {
  const raw = process.env["AI_ROUTER_VERIFY_MAX_EVIDENCE_CHARS"];
  if (!raw) return DEFAULT_EVIDENCE_CHAR_CAP;
  // Python's `int()` takes surrounding whitespace and a sign and nothing
  // else; a float string raises and falls back to the default.
  return /^[+-]?\d+$/.test(raw.trim())
    ? Number.parseInt(raw.trim(), 10)
    : DEFAULT_EVIDENCE_CHAR_CAP;
}

/**
 * Depth-agnostic exclusions: the anchored form missed nested `tools/x/dist`.
 *
 * The lifecycle's own files are excluded too. They are the record of the
 * session, not its work, and a session that rewrites or relocates them would
 * otherwise spend the reviewer's whole evidence budget showing the reviewer
 * its own bookkeeping. Their paths are still listed, so the exclusion is
 * visible rather than silent.
 */
export function buildDiffPathspecs(
  excludes: readonly string[] = DEFAULT_DIFF_EXCLUDES,
): string[] {
  const pathspecs = ["."];
  for (const pattern of excludes) {
    pathspecs.push(`:(exclude,glob)**/${pattern}`);
    if (!pattern.includes("*")) {
      pathspecs.push(`:(exclude,glob)**/${pattern}/**`);
    }
  }
  for (const basename of LIFECYCLE_WRITTEN_FILES) {
    pathspecs.push(`:(exclude,glob)**/${basename}`);
  }
  return pathspecs;
}

/** The lifecycle files this change touches, by path only. */
function trackedBookkeeping(repoRoot: string): string[] {
  const result = runGit(repoRoot, [
    "diff",
    "--name-only",
    "-z",
    "HEAD",
    "--",
    ...LIFECYCLE_WRITTEN_FILES.map((name) => `**/${name}`),
  ]);
  if (result.code !== 0) return [];
  return result.stdout.split("\0").filter((path) => path !== "");
}

interface UntrackedContents {
  readonly inlined: ReadonlyArray<readonly [string, string]>;
  readonly omitted: ReadonlyArray<readonly [string, string]>;
  readonly bookkeeping: readonly string[];
}

/**
 * git diff shows only names for new files, so their contents ride
 * separately. Exclusion is never silent -- omitted files are listed with the
 * reason.
 */
function untrackedContents(
  repoRoot: string,
  pathspecs: readonly string[],
): UntrackedContents {
  const result = runGit(repoRoot, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    ...pathspecs,
  ]);
  if (result.code !== 0) return { inlined: [], omitted: [], bookkeeping: [] };

  const inlined: Array<readonly [string, string]> = [];
  const omitted: Array<readonly [string, string]> = [];
  const bookkeeping: string[] = [];
  for (const rel of result.stdout.split("\0").filter((path) => path !== "")) {
    const parts = rel.replace(/\\/g, "/").split("/");
    const basename = parts[parts.length - 1] ?? rel;
    if (BOOKKEEPING_BASENAMES.has(basename)) {
      bookkeeping.push(rel);
      continue;
    }
    const full = join(repoRoot, ...rel.split("/"));
    let raw: Buffer;
    try {
      // `lstat` first, because `Path.is_symlink` does not follow either and
      // a symlink to an absent target would otherwise read as unreadable.
      if (lstatSync(full).isSymbolicLink()) {
        omitted.push([rel, "symlink (not followed)"]);
        continue;
      }
      const size = lstatSync(full).size;
      if (size > UNTRACKED_INLINE_CAP) {
        omitted.push([rel, `oversized (${size} bytes)`]);
        continue;
      }
      raw = readFileSync(full);
    } catch {
      omitted.push([rel, "unreadable"]);
      continue;
    }
    const text = raw.toString("utf8");
    // Node's UTF-8 decoder substitutes U+FFFD where Python's `bytes.decode`
    // raises, so the refusal is re-derived rather than caught: a file that
    // does not round-trip was not UTF-8.
    if (!Buffer.from(text, "utf8").equals(raw)) {
      omitted.push([rel, "binary / non-UTF-8"]);
      continue;
    }
    inlined.push([rel, text]);
  }
  return { inlined, omitted, bookkeeping };
}

function renderEvidence(
  status: string,
  diff: string,
  diffHeading: string,
  inlined: ReadonlyArray<readonly [string, string]>,
  omitted: ReadonlyArray<readonly [string, string]>,
  bookkeeping: readonly string[],
): string {
  const parts = [
    "The session's work, as the working tree presents it.",
    "",
    "#### git status --short",
    "```",
    status || "(clean -- no changes reported)",
    "```",
    "",
    `#### ${diffHeading}`,
    "",
    "```diff",
    diff || "(empty diff)",
    "```",
  ];
  if (inlined.length > 0) {
    parts.push(
      "\n#### Untracked file contents (new files, absent from the diff)",
    );
    for (const [rel, text] of inlined) {
      parts.push(`\n**${rel}**`, "```", text, "```");
    }
  }
  if (omitted.length > 0) {
    parts.push("\n#### Untracked paths NOT inlined");
    for (const [rel, reason] of omitted) parts.push(`- ${rel} — ${reason}`);
  }
  if (bookkeeping.length > 0) {
    parts.push("\n#### Expected framework bookkeeping (paths only)");
    for (const rel of bookkeeping) parts.push(`- ${rel}`);
  }
  return parts.join("\n");
}

/** Round 1: full working-tree evidence vs HEAD. */
export function assembleEvidence(
  repoRoot: string,
  _sessionsDir: string,
  _sessionNumber: number,
): string {
  const pathspecs = buildDiffPathspecs();
  const statusRun = runGit(repoRoot, ["status", "--short"]);
  if (statusRun.code !== 0) {
    throw new FactsError(`git status failed: ${statusRun.stderr}`);
  }
  const diffRun = runGit(repoRoot, [
    "diff",
    "--no-color",
    IRREVERSIBLE_DELETE,
    "HEAD",
    "--",
    ...pathspecs,
  ]);
  if (diffRun.code !== 0) {
    throw new FactsError(`git diff failed: ${diffRun.stderr}`);
  }
  const { inlined, omitted, bookkeeping } = untrackedContents(
    repoRoot,
    pathspecs,
  );
  const allBookkeeping = [...bookkeeping, ...trackedBookkeeping(repoRoot)];
  if (diffRun.stdout.trim() === "" && inlined.length === 0) {
    throw new EvidenceEmptyError(
      "the evidence bundle is empty (no diff vs HEAD, no untracked " +
        "files). If the session's work is already committed, verify " +
        "against the commit range instead of routing an empty review.",
    );
  }
  const heading =
    "Complete diff (working tree vs `HEAD`; a deleted file is its header " +
    "alone, contents omitted; generated-bundle " +
    `exclusions: ${DEFAULT_DIFF_EXCLUDES.join(", ")})`;
  const rendered = renderEvidence(
    statusRun.stdout,
    diffRun.stdout,
    heading,
    inlined,
    omitted,
    allBookkeeping,
  );
  checkEvidenceCap(rendered);
  return rendered;
}

/**
 * Rounds >=2: tree-to-tree fix delta only. The untracked collector is
 * deliberately absent -- the tree diff already carries new files as added
 * hunks.
 */
export function assembleFixDeltaEvidence(
  repoRoot: string,
  _sessionsDir: string,
  _sessionNumber: number,
  baselineTree: string,
): string {
  const currentTree = snapshotWorktreeTree(repoRoot);
  if (currentTree === null) {
    throw new FactsError(
      "could not snapshot the working tree for the fix delta (failing closed)",
    );
  }
  const pathspecs = buildDiffPathspecs();
  const statusRun = runGit(repoRoot, ["status", "--short"]);
  const diffRun = runGit(repoRoot, [
    "diff",
    "--no-color",
    IRREVERSIBLE_DELETE,
    baselineTree,
    currentTree,
    "--",
    ...pathspecs,
  ]);
  if (diffRun.code !== 0) {
    throw new FactsError(`fix-delta diff failed: ${diffRun.stderr}`);
  }
  const heading =
    `FIX DELTA ONLY (tree-to-tree: previous round ${baselineTree.slice(0, 12)}` +
    ` -> current working tree ${currentTree.slice(0, 12)}). This is NOT the ` +
    "full session diff — new defects are admissible only within these " +
    "hunks. A deleted file is its header alone, contents omitted.";
  const rendered = renderEvidence(
    statusRun.stdout,
    diffRun.stdout,
    heading,
    [],
    [],
    [],
  );
  checkEvidenceCap(rendered);
  return rendered;
}

export function checkEvidenceCap(rendered: string): void {
  const cap = evidenceCharCap();
  // Python measures a str in code points; JavaScript's `.length` counts
  // UTF-16 units, so an astral character would be charged twice.
  const length = [...rendered].length;
  if (length > cap) {
    throw new EvidenceTooLargeError(
      `evidence bundle is ${length} chars (cap ${cap}). Split ` +
        "the session or raise AI_ROUTER_VERIFY_MAX_EVIDENCE_CHARS.",
    );
  }
}

// --- Changed lines ----------------------------------------------------------

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

function posix(path: string): string {
  return String(path).replace(/\\/g, "/").trim();
}

/**
 * `{path: [line number, ...]}` for the lines the diff ADDS, numbered in the
 * post-image.
 *
 * Deletions are deliberately absent: the added lines are the ones a reader
 * can go and look at in the tree as it now stands.
 */
export function parseChangedLines(diff: string): Record<string, number[]> {
  const out = new Map<string, Set<number>>();
  let path: string | null = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const target = line.slice(4).trim();
      path = null;
      if (target !== "/dev/null") {
        path = posix(target.slice(1, 2) === "/" ? target.slice(2) : target);
      }
      continue;
    }
    if (path === null || !line.startsWith("@@")) continue;
    const match = HUNK.exec(line);
    if (!match) continue;
    const start = Number.parseInt(match[1] as string, 10);
    const count = match[2] === undefined ? 1 : Number.parseInt(match[2], 10);
    if (count === 0) continue; // a pure deletion hunk adds nothing
    let lines = out.get(path);
    if (lines === undefined) {
      lines = new Set<number>();
      out.set(path, lines);
    }
    for (let n = start; n < start + count; n += 1) lines.add(n);
  }
  const sorted: Record<string, number[]> = {};
  for (const key of [...out.keys()].sort(compareCodePoints)) {
    sorted[key] = [...(out.get(key) as Set<number>)].sort((a, b) => a - b);
  }
  return sorted;
}

/** Python sorts strings by code point; JavaScript's default is UTF-16 units. */
function compareCodePoints(left: string, right: string): number {
  const a = [...left];
  const b = [...right];
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const one = (a[index] as string).codePointAt(0) as number;
    const two = (b[index] as string).codePointAt(0) as number;
    if (one !== two) return one - two;
  }
  return a.length - b.length;
}

/**
 * The lines this working tree adds against `baselineTree`, or against HEAD
 * when none is given. `null` when git cannot answer -- an unmeasurable
 * change is never "no change".
 */
export function changedLines(
  repoRoot: string,
  baselineTree: string | null = null,
): Record<string, number[]> | null {
  const current = snapshotWorktreeTree(repoRoot);
  if (current === null) return null;
  let baseline = baselineTree;
  if (!baseline) {
    const head = runGit(repoRoot, ["rev-parse", "HEAD^{tree}"]);
    if (head.code !== 0 || !head.stdout) return null;
    baseline = head.stdout;
  }
  const diff = runGit(repoRoot, [
    "-c",
    "core.quotepath=false",
    "diff",
    "--no-color",
    "--no-ext-diff",
    "--unified=0",
    baseline,
    current,
    "--",
    ...buildDiffPathspecs(),
  ]);
  if (diff.code !== 0) return null;
  return parseChangedLines(diff.stdout);
}

// --- The declared controls --------------------------------------------------

export interface ControlSpec {
  readonly kind: string;
  readonly command: string;
  readonly required: boolean;
}

export function controlSpec(
  kind: string,
  command: string,
  required = false,
): ControlSpec {
  return { kind, command, required };
}

export interface ControlLoadResult {
  readonly controls: readonly ControlSpec[];
  readonly errors: readonly string[];
}

export function controlLoadOk(result: ControlLoadResult): boolean {
  return result.errors.length === 0;
}

export interface ControlFact {
  readonly kind: string;
  readonly status: string;
  readonly command: string;
  readonly required: boolean;
  readonly detail: string;
}

export function controlFact(
  kind: string,
  status: string,
  command = "",
  required = false,
  detail = "",
): ControlFact {
  return { kind, status, command, required, detail };
}

/**
 * A required control is red on anything but green. `unknown` is red on
 * purpose: the author is the only one who can turn "the tool did not run"
 * into an answer, and a verifier cannot.
 */
export function controlFactRed(fact: ControlFact): boolean {
  return (
    fact.required &&
    (fact.status === STATUS_FAIL || fact.status === STATUS_UNKNOWN)
  );
}

export function controlFactToDict(fact: ControlFact): Record<string, unknown> {
  const out: Record<string, unknown> = {
    kind: fact.kind,
    status: fact.status,
    required: fact.required,
  };
  if (fact.command) out["command"] = fact.command;
  if (fact.detail) out["detail"] = fact.detail;
  return out;
}

/**
 * The declared controls plus every declaration error. A control lost to a
 * typo and a control never declared both end up `not_applicable`, and only
 * the error list tells them apart.
 */
export function loadControlsChecked(config: unknown): ControlLoadResult {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    return { controls: [], errors: [] };
  }
  const testing = (config as Record<string, unknown>)["testing"];
  const raw =
    testing !== null && typeof testing === "object"
      ? (testing as Record<string, unknown>)["controls"]
      : undefined;
  if (raw === undefined || raw === null) return { controls: [], errors: [] };
  if (!Array.isArray(raw)) {
    return { controls: [], errors: ["testing.controls must be a list"] };
  }
  const controls: ControlSpec[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, index) => {
    const label = `testing.controls[${index}]`;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${label} must be a mapping`);
      return;
    }
    const fields = entry as Record<string, unknown>;
    const unknown = Object.keys(fields)
      .filter((key) => !CONTROL_FIELDS.has(key))
      .sort(compareCodePoints);
    if (unknown.length > 0) {
      errors.push(
        `${label} has unknown key(s) [${unknown
          .map((key) => `'${key}'`)
          .join(", ")}]`,
      );
    }
    const kind = fields["kind"];
    const command = fields["command"];
    if (typeof kind !== "string" || !CONTROL_KINDS.includes(kind)) {
      errors.push(
        `${label}.kind must be one of [${CONTROL_KINDS.map(
          (name) => `'${name}'`,
        ).join(", ")}]`,
      );
      return;
    }
    if (seen.has(kind)) {
      errors.push(`${label}.kind '${kind}' is declared more than once`);
      return;
    }
    if (typeof command !== "string" || command.trim() === "") {
      errors.push(`${label}.command must be a non-empty string`);
      return;
    }
    seen.add(kind);
    controls.push(
      controlSpec(kind, command.trim(), Boolean(fields["required"])),
    );
  });
  return { controls, errors };
}

/**
 * The router's own interpreter, for a control that names one.
 *
 * Python rewrites `python`/`python3` to `sys.executable`, so a control runs
 * in the environment the router runs in rather than in whatever PATH
 * resolves. That rule cannot be translated by copying it: this router's
 * interpreter is Node, and there is no Python beneath it to substitute --
 * after the cutover there is no Python in the product at all. So the RULE is
 * ported rather than the substitution, and it names the runtime that is
 * actually here.
 *
 * The record cannot see the difference: `ControlFact.command` carries the
 * DECLARED command, never the resolved argv, so both routers write the same
 * bytes for the same declaration.
 */
function resolveInterpreter(argv: readonly string[]): string[] {
  const resolved = [...argv];
  if (resolved[0] === "node" || resolved[0] === "node.exe") {
    resolved[0] = process.execPath;
  }
  return resolved;
}

/**
 * One control, normalized. A tool that exits non-zero FAILED; a tool that
 * could not be launched at all is UNKNOWN, never a quiet pass.
 */
export function runControl(repoRoot: string, spec: ControlSpec): ControlFact {
  let argv: string[];
  try {
    argv = shlexSplit(spec.command);
  } catch (error) {
    return controlFact(
      spec.kind,
      STATUS_UNKNOWN,
      spec.command,
      spec.required,
      `the declared command could not be parsed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (argv.length === 0) {
    return controlFact(
      spec.kind,
      STATUS_UNKNOWN,
      spec.command,
      spec.required,
      "the declared command is empty",
    );
  }
  const resolved = resolveInterpreter(argv);
  const proc = spawnSync(resolved[0] as string, resolved.slice(1), {
    cwd: repoRoot,
    encoding: "buffer",
    timeout: CONTROL_TIMEOUT_SECONDS * 1000,
  });
  if (proc.error !== undefined) {
    const code = (proc.error as NodeJS.ErrnoException).code;
    if (code === "ETIMEDOUT") {
      return controlFact(
        spec.kind,
        STATUS_UNKNOWN,
        spec.command,
        spec.required,
        `no result within ${CONTROL_TIMEOUT_SECONDS}s`,
      );
    }
    return controlFact(
      spec.kind,
      STATUS_UNKNOWN,
      spec.command,
      spec.required,
      `could not be executed: ${proc.error.message}`,
    );
  }
  // A signalled child has a null status and is not a timeout; Python's
  // `returncode` is negative there, so anything that is not zero fails.
  const tail = (
    (proc.stdout?.toString("utf8") ?? "") + (proc.stderr?.toString("utf8") ?? "")
  ).trim();
  if (proc.status === 0) {
    // A green row says what the control PROVED, not merely that it passed.
    // An analyzer that compared seven record paths and one that compared
    // nothing both exit 0, and from the record alone they were
    // indistinguishable -- so a control that reports its own work has that
    // report kept, and one that reports nothing says so rather than leaving
    // a reader to assume there was something to report.
    return controlFact(
      spec.kind,
      STATUS_PASS,
      spec.command,
      spec.required,
      tail ? tail.slice(-CONTROL_DETAIL_LIMIT) : "exit 0, and the control printed nothing",
    );
  }
  const status = proc.status === null ? -1 : proc.status;
  return controlFact(
    spec.kind,
    STATUS_FAIL,
    spec.command,
    spec.required,
    tail
      ? `exit ${status}: ${tail.slice(-CONTROL_DETAIL_LIMIT)}`
      : `exit ${status}`,
  );
}

/**
 * One row per kind, always all four. A kind nobody declared is
 * `not_applicable` -- the record says the control does not apply here rather
 * than leaving a reader to infer it from an absence.
 */
export function collectControlFacts(
  repoRoot: string,
  config: unknown,
): { facts: readonly ControlFact[]; errors: readonly string[] } {
  const loaded = loadControlsChecked(config);
  const declared = new Map(loaded.controls.map((spec) => [spec.kind, spec]));
  const facts: ControlFact[] = [];
  for (const kind of CONTROL_KINDS) {
    const spec = declared.get(kind);
    if (spec === undefined) {
      facts.push(
        controlFact(
          kind,
          STATUS_NOT_APPLICABLE,
          "",
          false,
          "no control of this kind is declared",
        ),
      );
      continue;
    }
    facts.push(runControl(repoRoot, spec));
  }
  return { facts, errors: loaded.errors };
}

// --- The record -------------------------------------------------------------

export interface FactRecord {
  readonly controls: readonly ControlFact[];
  /** `{path: [line, ...]}`, null when unknown. */
  readonly changed: Record<string, number[]> | null;
  readonly sessionNumber: number | null;
  readonly roundNumber: number | null;
  readonly recordedAt: string;
  readonly errors: readonly string[];
}

export function factRecord(fields: Partial<FactRecord> = {}): FactRecord {
  return {
    controls: fields.controls ?? [],
    changed: fields.changed ?? null,
    sessionNumber: fields.sessionNumber ?? null,
    roundNumber: fields.roundNumber ?? null,
    recordedAt: fields.recordedAt ?? "",
    errors: fields.errors ?? [],
  };
}

export function redRequired(record: FactRecord): readonly ControlFact[] {
  return record.controls.filter(controlFactRed);
}

export function factRecordToDict(record: FactRecord): Record<string, unknown> {
  const changedLineCounts =
    record.changed === null
      ? null
      : Object.fromEntries(
          Object.entries(record.changed).map(([path, lines]) => [
            path,
            lines.length,
          ]),
        );
  const out: Record<string, unknown> = {
    recordedAt: record.recordedAt,
    controls: record.controls.map(controlFactToDict),
    changedLines: changedLineCounts,
  };
  if (record.sessionNumber !== null) out["sessionNumber"] = record.sessionNumber;
  if (record.roundNumber !== null) out["round"] = record.roundNumber;
  if (record.errors.length > 0) out["declarationErrors"] = [...record.errors];
  return out;
}

/** The shape `affected.preverifyGate` answers with, as this module reads it. */
export interface TestsGate {
  readonly reason: string;
  readonly accepted: ReadonlyArray<readonly [string, string, string]>;
}

/**
 * The selected-test run, as a fact rather than a verdict.
 *
 * A refusing gate never reaches here -- the round ends before any fact is
 * collected -- so there is no failing case to write. A gate that accepted
 * nothing accepted nothing *because nothing had to run*: no expensive suite,
 * or a change the selector maps to no test. That is `not_applicable`, and
 * calling it `pass` would put a green test row on a change no test ever saw.
 */
function testsFacts(gate: TestsGate | null): ControlFact[] {
  if (gate === null) return [];
  if (gate.accepted.length === 0) {
    return [
      controlFact(
        KIND_TESTS,
        STATUS_NOT_APPLICABLE,
        "",
        false,
        gate.reason || "no selected test run was required for this change set",
      ),
    ];
  }
  return gate.accepted.map(([suite, command, policy]) =>
    controlFact(
      KIND_TESTS,
      STATUS_PASS,
      command,
      false,
      `${suite}: accepted as ${policy}`,
    ),
  );
}

/**
 * Every deterministic fact about the tree as it now stands, in one record:
 * the declared controls, the pre-verification test command the selector
 * sanctioned, and the lines the change adds.
 *
 * The test row is a record, not a second gate. The refusal that keeps an
 * unproved change out of a round lives in `affected.preverifyGate` and stays
 * there; repeating it here would be a guard guarding a guard. The changed
 * lines are context of the same kind: nothing is judged by them.
 */
export async function collectFacts(
  repoRoot: string,
  sessionsDir: string,
  config: unknown,
  options: {
    gate?: TestsGate | null;
    roundNumber?: number | null;
    sessionNumber?: number | null;
  } = {},
): Promise<FactRecord> {
  const { preverifyBaseline } = await import("./affected.ts");

  const { facts, errors } = collectControlFacts(repoRoot, config);
  return factRecord({
    controls: [...facts, ...testsFacts(options.gate ?? null)],
    changed: changedLines(repoRoot, preverifyBaseline(repoRoot, sessionsDir)),
    sessionNumber: options.sessionNumber ?? null,
    roundNumber: options.roundNumber ?? null,
    recordedAt: nowIso("microseconds"),
    errors,
  });
}

export function factsPath(repoRoot: string): string {
  return join(repoRoot, ...RUNS_DIRNAME.split("/"), FACTS_FILENAME);
}

/** Machine-owned, append-only, one line per collection. */
export function appendFacts(repoRoot: string, record: FactRecord): string {
  const path = factsPath(repoRoot);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(
    path,
    dumps(factRecordToDict(record), { sortKeys: true }) + "\n",
    "utf8",
  );
  return path;
}

/**
 * The message that returns red required facts to their author, or `""` when
 * nothing is red. Deterministic controls are the cheapest reader this work
 * will ever get; spending a verification round to be told the build is
 * broken buys nothing the exit code already said.
 */
export function redFactsRefusal(record: FactRecord, prefix = "verify"): string {
  const red = redRequired(record);
  if (red.length === 0) return "";
  const rows = red
    .map((fact) => {
      const head = `  ${fact.kind.padEnd(10)} ${fact.status
        .toUpperCase()
        .padEnd(14)} ${fact.command}`;
      if (!fact.detail) return head;
      const first = (fact.detail.split("\n")[0] ?? "").slice(0, 200);
      return `${head}\n${"".padEnd(14)}${first}`;
    })
    .join("\n");
  return (
    `${prefix}: refused -- ` +
    `${red.length} required deterministic control(s) are not green:\n` +
    `${rows}\n` +
    "These are facts, not opinions, and they cost nothing to obtain -- " +
    "so they come back to you before a verifier is paid to notice them. " +
    "An UNKNOWN row means the declared tool never ran; that is yours to " +
    "fix too, because a control nobody can execute proves nothing.\n" +
    "Fix them, rerun the affected tests, then re-run this command."
  );
}

export { repoRootFor };
