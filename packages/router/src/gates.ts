// The six close gates. Each one paid for by a concrete incident, and no gate
// guards another gate:
//
// - `verification_clean`: the 2026-07-06 bypass (a hand-written `manual`
//   method plus a self-attested VERIFIED closed a session with no real
//   verification) and the 84 firings of v1's backstop stack. v2 reads the
//   machine-only ledger instead of corroborating a hand-writable record.
// - `working_tree_clean`: 41 real firings -- "forgot to git add".
// - `pushed_to_remote`: 29 real firings -- work stranded local.
// - `test_run_fresh`: 5 firings -- a close on code the suite never saw.
// - `owed_decisions`: csv-model, 2026-08-30 -- session 1 closed at a clean
//   5/5 in a repository that declared no suite, and nothing would have
//   changed when the work became code. It does NOT guard `test_run_fresh`:
//   that gate answers "did the declared suite run against this tree", and
//   this one answers "is something unanswered that would make the answer
//   meaningless". A gate cannot see its own missing precondition, which is
//   why the sixth exists and why the fifth now reports SKIP instead of
//   claiming a pass. It is also not suite-specific -- every
//   verification-reducing question routes through it, including the
//   source-resolution switch a later session adds.
// - `verdict_vocabulary`: the 2026-07-08 incident -- a confabulated
//   `manual-override-development` persisted and every reader rendered it.
//
// A predicate that throws is recorded as a failed gate carrying the error
// text -- a buggy gate must not wedge every close in the repository.
// `--force` skips the bookkeeping gates, never the evidence gates.
//
// Every remediation string here is compared byte for byte against its
// Python twin by the parity control, em dashes included: a gate's wording
// is what an operator reads when a close is refused.

import { existsSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import type { RouterConfig } from "./config.ts";
import { PROJECT_CONFIG_FILENAME, loadConfig, projectRoot } from "./config.ts";
import { changedPathsBetween, detectOutOfBandWrite } from "./evidence.ts";
import {
  isMachineStatePath,
  repoRootFor,
  runGit,
  snapshotWorktreeTree,
} from "./journal.ts";
import {
  LIFECYCLE_WRITTEN_FILES,
  LedgerError,
  ROW_REMEDIATED_AT_CAP,
  readRounds,
} from "./ledger.ts";
import { readSessionState } from "./progress.ts";
import { pythonRepr, pythonStr } from "./pythonJson.ts";
import { blockingDecisions } from "./owedDecisions.ts";
import { evaluateFreshness, loadSuitesChecked } from "./testEvidence.ts";
import { SESSION_VERDICTS } from "./verdict.ts";

/** Editor and platform droppings, plus the close machinery's own lock. */
const IGNORE_BASENAME_PATTERNS: readonly string[] = [
  ".DS_Store",
  "*.swp",
  "*~",
  "Thumbs.db",
  "desktop.ini",
  ".lifecycle.lock",
];

/**
 * Session-directory files the close itself commits after the flip.
 *
 * The lifecycle lock is deliberately absent from the commit list: it is
 * still held during the close commit and deleted on release, so committing
 * it leaves every close behind a tracked-deletion dirty tree.
 */
export const SET_BOOKKEEPING_COMMIT_BASENAMES = LIFECYCLE_WRITTEN_FILES;

/**
 * What may legitimately be dirty in the session directory at close time:
 * the files the close will commit, plus the lock the close is holding.
 */
const SET_BOOKKEEPING_BASENAMES: ReadonlySet<string> = new Set([
  ...SET_BOOKKEEPING_COMMIT_BASENAMES,
  ".lifecycle.lock",
]);

/** The two gates `--force` may never skip. */
export const EVIDENCE_GATES: ReadonlySet<string> = new Set([
  "verification_clean",
  "verdict_vocabulary",
]);

/** One gate's row: the name, the answer, and what to do about a `false`. */
export interface GateResult {
  readonly name: string;
  readonly passed: boolean;
  readonly remediation: string;
  /**
   * The gate could not see its own precondition, so it judged nothing.
   *
   * Distinct from passing, and the distinction is the point: a gate that
   * reports PASS for a check it never performed grows quieter as the work
   * grows more consequential, which is how a repository with no declared
   * suite closed a clean 5/5 having run nothing. An inapplicable gate does
   * not block -- what blocks is an owed decision in the verification-reduction
   * class -- but it never claims to have proved anything.
   */
  readonly inapplicable: boolean;
}

/** A predicate's answer, before it becomes a row. */
export type Check = readonly [
  passed: boolean,
  remediation: string,
  inapplicable?: boolean,
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Python truthiness for the record's values: `0`, `""`, `[]` are false. */
function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

/** `int(text)`, which refuses anything but an optionally signed integer. */
function pythonInt(text: string): number {
  return /^[+-]?\d+$/.test(text.trim()) ? Number(text.trim()) : 0;
}

/** `fnmatch` over a basename: `*` and `?`, and nothing else these need. */
function matchesPattern(basename: string, pattern: string): boolean {
  const source =
    "^" +
    pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".") +
    "$";
  return new RegExp(source).test(basename);
}

/** `os.path.relpath`, with the same fall back to the absolute path. */
function sessionsRel(root: string, sessionsDir: string): string {
  try {
    return relative(root, sessionsDir).replace(/\\/g, "/");
  } catch {
    return sessionsDir;
  }
}

/** `Path(x).resolve()`: absolute, with symlinks followed where they can be. */
function resolvedPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function verifyCommand(sessionsDir: string): string {
  return `dabbler verify --sessions-dir ${sessionsDir}`;
}

function currentSession(sessionsDir: string): unknown {
  const state = readSessionState(sessionsDir);
  if (!state) return null;
  const current = state["currentSession"];
  return current === undefined ? null : current;
}

// --- The five predicates ------------------------------------------------------

/**
 * The run ledger says the latest round is non-blocking, the worktree has
 * not changed since that round (outside the session's own bookkeeping),
 * and `sessions.json` was written only by the sanctioned writers.
 *
 * A blocking latest round is the *unresolved* terminal state: nothing lands
 * but the record. A `remediated_at_cap` row is the other cap terminal -- it
 * is non-blocking, so it passes here, and the gate says so out loud rather
 * than letting unreviewed work read as verified.
 */
export function checkVerificationClean(sessionsDir: string): Check {
  const root = repoRootFor(sessionsDir);
  if (root === null) {
    return [false, `not inside a git repository: ${sessionsDir}`];
  }

  // The integrity axis runs first and short-circuits: a hand-edited state
  // file must surface as itself, not as whatever downstream confusion it
  // causes.
  const oob = detectOutOfBandWrite(sessionsDir, root, { requireRecord: true });
  if (oob) {
    return [
      false,
      `session-state integrity: ${oob}. State files are written by ` +
        "the router, never by hand.",
    ];
  }

  const current = currentSession(sessionsDir);
  if (current === null) {
    return [false, `no session is in flight under ${sessionsDir}`];
  }

  let rounds: Record<string, unknown>[];
  try {
    rounds = readRounds(root, current as number);
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    return [
      false,
      `the run ledger is unreadable or invalid (${error.message}); failing ` +
        "closed rather than trusting a tampered record",
    ];
  }
  if (rounds.length === 0) {
    return [
      false,
      "no verification round is recorded for session " +
        `${pythonStr(current)}. Cross-provider verification is mandatory; run: ` +
        verifyCommand(sessionsDir),
    ];
  }
  const latest = rounds[rounds.length - 1];
  if (truthy(latest["blocking"])) {
    return [
      false,
      `round ${pythonStr(latest["round"])} ended with blocking findings ` +
        `(${pythonStr(latest["verdict"])}); remediate and re-run: ` +
        verifyCommand(sessionsDir) +
        " — at the round cap that same command records the terminal " +
        "state instead of opening a round, and an unresolved session " +
        "lands nothing but its record",
    ];
  }

  const currentTree = snapshotWorktreeTree(root);
  if (currentTree === null) {
    return [false, "could not snapshot the working tree (failing closed)"];
  }
  // Deliberately the recorded tree, never `effectiveBaseline`: a re-anchored
  // baseline is safe for a fix delta, which only changes what the next round
  // is shown, and fatal here, where the question is whether the tree still IS
  // the verified one. Without that object there is no answer, and the diff
  // below fails closed rather than substituting a tree nobody verified.
  const changed = changedPathsBetween(
    root,
    pythonStr(latest["completion_tree"]),
    currentTree,
  );
  if (changed === null) {
    return [
      false,
      "could not diff the working tree against the verified round " +
        "(failing closed)",
    ];
  }
  const setRel = sessionsRel(root, sessionsDir);
  const material = changed.filter((path) => {
    const forward = path.replace(/\\/g, "/");
    const basename = forward.split("/").pop() ?? forward;
    return !(
      forward.startsWith(`${setRel}/`) && SET_BOOKKEEPING_BASENAMES.has(basename)
    );
  });
  if (material.length > 0) {
    const preview = material.slice(0, 5).join(", ");
    const suffix = material.length > 5 ? ` (+${material.length - 5} more)` : "";
    return [
      false,
      "the working tree changed after verification round " +
        `${pythonStr(latest["round"])}: ${preview}${suffix}. Re-run: ` +
        verifyCommand(sessionsDir),
    ];
  }
  if (latest["type"] === ROW_REMEDIATED_AT_CAP) {
    const remediated = isObject(latest["remediated"]) ? latest["remediated"] : {};
    const findings = remediated["findings"];
    const count = Array.isArray(findings) ? findings.length : 0;
    return [
      true,
      `remediated at the cap: ${count} blocking finding(s) from ` +
        `round ${pythonStr(remediated["reviewed_round"])} each had their ` +
        "cited site changed, and the cap left the fix unreviewed. THIS " +
        "WORK LANDS UNREVIEWED — no verifier saw the repair. It is not " +
        "a waiver: nothing was accepted over a standing finding",
    ];
  }
  return [true, ""];
}

export interface WorktreeChanges {
  readonly paths: readonly string[];
  /** Empty when the question was answerable; a sentence when it was not. */
  readonly error: string;
}

/**
 * The working-tree changes that are the session's work rather than the
 * record of it.
 *
 * Editor noise, the run ledger and the session's own lifecycle bookkeeping
 * are not work. Two callers ask this: the close, which refuses to land
 * uncommitted work, and the task declaration, which refuses to be made
 * after work exists.
 */
export function materialWorktreeChanges(sessionsDir: string): WorktreeChanges {
  const root = repoRootFor(sessionsDir);
  if (root === null) {
    return { paths: [], error: `not inside a git repository: ${sessionsDir}` };
  }
  // `-uall` expands collapsed untracked directories to per-file entries; a
  // single umbrella row would defeat the ignore filter.
  const status = runGit(root, ["status", "--porcelain", "-uall"]);
  if (status.code !== 0) {
    return {
      paths: [],
      error: `git status failed: ${status.stderr || "unknown error"}`,
    };
  }
  const setRel = sessionsRel(root, sessionsDir);

  const blocking: string[] = [];
  for (const line of status.stdout.split("\n")) {
    if (line.length < 4) continue;
    let path = line.slice(3);
    if (path.includes(" -> ")) path = path.split(" -> ", 2)[1];
    // `strip('"')` takes every quote off both ends, not one: git quotes a
    // path that needs escaping, and a name ending in a quote would leave one
    // behind if only the outermost came off.
    path = path.trim().replace(/^"+/, "").replace(/"+$/, "").replace(/\\/g, "/");
    const basename = path.split("/").pop() ?? path;
    if (IGNORE_BASENAME_PATTERNS.some((pattern) => matchesPattern(basename, pattern))) {
      continue;
    }
    if (path.startsWith(`${setRel}/`) && SET_BOOKKEEPING_BASENAMES.has(basename)) {
      continue; // the close commits its own bookkeeping after the flip
    }
    if (isMachineStatePath(path)) {
      continue; // the run ledger is the record, not the work
    }
    blocking.push(path);
  }
  return { paths: blocking, error: "" };
}

/** The first five paths, and how many more there are. */
export function previewPaths(paths: readonly string[]): string {
  const preview = paths.slice(0, 5).join(", ");
  return preview + (paths.length > 5 ? ` (+${paths.length - 5} more)` : "");
}

export function checkWorkingTreeClean(sessionsDir: string): Check {
  const { paths, error } = materialWorktreeChanges(sessionsDir);
  if (error) return [false, error];
  if (paths.length === 0) return [true, ""];
  return [false, `working tree has uncommitted changes: ${previewPaths(paths)}`];
}

const PUSH_FAILURE_SIGNALS: readonly (readonly [string, string])[] = [
  ["non-fast-forward", "non-fast-forward; rebase or pull --rebase first"],
  ["rejected", "remote rejected the push (branch protection or non-FF)"],
  ["protected branch", "remote rejected the push (branch protected)"],
  ["denied", "remote denied the push (permissions or branch protection)"],
];

/** A failed `git remote` is not an answer: the waiver needs an affirmative no. */
function hasRemote(repoRoot: string): boolean {
  const result = runGit(repoRoot, ["remote"]);
  if (result.code !== 0) return true;
  return result.stdout.trim().length > 0;
}

export function checkPushedToRemote(sessionsDir: string): Check {
  const root = repoRootFor(sessionsDir);
  if (root === null) {
    return [false, `not inside a git repository: ${sessionsDir}`];
  }
  const head = runGit(root, ["symbolic-ref", "--short", "HEAD"]);
  if (head.code !== 0) {
    return [false, "HEAD is detached; check out a branch before close-out"];
  }
  const upstream = runGit(root, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{u}",
  ]);
  if (upstream.code !== 0) {
    if (existsSync(join(root, ".dabbler", "local-only")) && !hasRemote(root)) {
      return [
        true,
        "local-only repo: push gate waived (.dabbler/local-only " +
          "marker present, no remote configured)",
      ];
    }
    return [
      false,
      `branch ${pythonRepr(head.stdout)} has no upstream; run: ` +
        `git push --set-upstream <remote> ${head.stdout}`,
    ];
  }
  const count = runGit(root, ["rev-list", "--count", "@{u}..HEAD"]);
  const ahead = count.code === 0 ? pythonInt(count.stdout) : 0;
  if (ahead === 0) return [true, ""];
  const dryRun = runGit(root, ["push", "--dry-run", "--porcelain"]);
  if (dryRun.code !== 0) {
    const lowered = (dryRun.stderr || "").toLowerCase();
    for (const [signal, remediation] of PUSH_FAILURE_SIGNALS) {
      if (lowered.includes(signal)) return [false, remediation];
    }
    const first = dryRun.stderr ? dryRun.stderr.split("\n")[0] : "unknown error";
    return [false, `git push --dry-run failed: ${first}`];
  }
  return [
    false,
    `branch ${pythonRepr(head.stdout)} is ${ahead} commit(s) ahead of ` +
      `${upstream.stdout}; run: git push`,
  ];
}

/**
 * The configuration that actually governs `sessionsDir`'s repository.
 *
 * The ambient config describes the repository the router was invoked in. A
 * session set living in a different repository never made those
 * declarations, and gating it against them would demand a run of record for
 * suites that repository does not have. Only the alternative is worse: a
 * repository silently gated by another's testing policy.
 */
export function governingConfig(sessionsDir: string): RouterConfig | null {
  const setRoot = repoRootFor(sessionsDir);
  const ambient = projectRoot();
  if (setRoot === null || ambient === null) return null;
  try {
    if (resolvedPath(setRoot) !== resolvedPath(ambient)) return null;
    return loadConfig();
  } catch {
    return null;
  }
}

export function checkTestRunFresh(
  sessionsDir: string,
  config: RouterConfig | null = null,
): Check {
  const governing = config ?? governingConfig(sessionsDir);
  const loaded = loadSuitesChecked(governing);
  if (loaded.errors.length > 0) {
    // "No expensive suites declared" and "every declared suite was a typo
    // and got dropped" must never be indistinguishable.
    return [
      false,
      "the test-suite declaration is malformed, so the suites this " +
        "session owes cannot be determined; fix testing.suites in " +
        // The repository's own file, which is the one the operator edits. It
        // named `router-config.yaml` -- the packaged layer beneath it in the
        // precedence chain, and a file no project should be opening.
        `${PROJECT_CONFIG_FILENAME} - ` +
        loaded.errors.join("; "),
    ];
  }
  if (!loaded.suites.some((suite) => suite.expensive)) {
    // Inapplicable, not passed. Nothing here can be proved and nothing here is
    // claimed. What refuses the close is the owed decision that says a suite
    // is undeclared, not this row.
    return [true, "no suite is declared, so nothing was measured", true];
  }
  const verdicts = evaluateFreshness(sessionsDir, null, loaded.suites);
  const failures = verdicts.filter((verdict) => verdict.required && !verdict.passed);
  if (failures.length === 0) return [true, ""];
  return [false, failures.map((v) => `${v.suite}: ${v.reason}`).join("; ")];
}

/**
 * No unanswered question is standing that would make this close a lie.
 *
 * Only the verification-reduction class refuses, and the refusal is the
 * resolution of two rules that look contradictory until they are ordered:
 * nothing in this framework blocks on a person, AND anything that reduces
 * verification is reserved to one. Both hold, because the first is about
 * judgment calls and verification reduction is not a judgment call. So the
 * work proceeds, the session runs to the end, and what stops is the record
 * claiming to be verified.
 *
 * A repository with no owed record has nothing owed, which is the ordinary
 * case and must stay free.
 */
export function checkOwedDecisions(sessionsDir: string): Check {
  const root = repoRootFor(sessionsDir);
  if (root === null) return [true, ""];
  let blocking;
  try {
    blocking = blockingDecisions(root);
  } catch (error) {
    // An unreadable record is a fault, not an absence: answering it with
    // "nothing is owed" is how a corrupt file becomes a clean close.
    return [
      false,
      `the owed-decision record could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`,
    ];
  }
  if (blocking.length === 0) return [true, ""];
  const names = blocking.map((row) => String(row["id"])).join(", ");
  return [
    false,
    `${blocking.length} unanswered decision(s) would reduce what verification ` +
      `proves: ${names}. The work is done and the record cannot call it ` +
      "verified until they are answered -- run `dabbler owed list` to read " +
      "them, and `dabbler owed answer` to settle one.",
  ];
}

/**
 * Every persisted verdict token is exactly in the closed allowlist.
 *
 * Absence of rounds is `verification_clean`'s finding, not this gate's --
 * double-reporting one root cause is worse than silence.
 */
export function checkVerdictVocabulary(sessionsDir: string): Check {
  const root = repoRootFor(sessionsDir);
  const current = currentSession(sessionsDir);
  const tokens: (readonly [string, unknown])[] = [];
  if (root !== null && current !== null) {
    let rounds: Record<string, unknown>[] = [];
    try {
      rounds = readRounds(root, current as number);
    } catch (error) {
      if (!(error instanceof LedgerError)) throw error;
      rounds = [];
    }
    if (rounds.length > 0) {
      tokens.push(["run ledger", rounds[rounds.length - 1]["verdict"]]);
    }
  }
  const state = readSessionState(sessionsDir);
  if (state) {
    const sessions = state["sessions"];
    for (const record of Array.isArray(sessions) ? sessions : []) {
      if (!isObject(record)) continue;
      const verdict = record["verificationVerdict"];
      if (record["number"] === current && verdict !== null && verdict !== undefined) {
        tokens.push(["session-state", verdict]);
      }
    }
  }
  for (const [source, token] of tokens) {
    if (!SESSION_VERDICTS.has(pythonStr(token).trim())) {
      const vocabulary = [...SESSION_VERDICTS].sort();
      return [
        false,
        `${source} carries verdict ${pythonRepr(token)}, which is not in the ` +
          `closed vocabulary ${pythonRepr(vocabulary)}. Verdicts ` +
          "are written by the router, never invented — a free-form " +
          "token (the v1 'manual-override-development' incident) or " +
          "a prefix look-alike never closes a session.",
      ];
    }
  }
  return [true, ""];
}

// --- Driver -------------------------------------------------------------------

type Predicate = (sessionsDir: string, config?: RouterConfig | null) => Check;

export const GATE_CHECKS: readonly (readonly [string, Predicate])[] = [
  ["verification_clean", checkVerificationClean],
  ["working_tree_clean", checkWorkingTreeClean],
  ["pushed_to_remote", checkPushedToRemote],
  ["test_run_fresh", checkTestRunFresh],
  ["owed_decisions", checkOwedDecisions],
  ["verdict_vocabulary", checkVerdictVocabulary],
];

export interface RunGatesOptions {
  readonly forced?: boolean;
  readonly config?: RouterConfig | null;
}

/**
 * All five gate rows (or only the evidence gates under `forced` -- force
 * bypasses bookkeeping, never evidence). A predicate that throws becomes a
 * failed row carrying the error text.
 */
export function runGates(
  sessionsDir: string,
  options: RunGatesOptions = {},
): GateResult[] {
  const forced = options.forced === true;
  const config = options.config ?? null;
  const results: GateResult[] = [];
  for (const [name, predicate] of GATE_CHECKS) {
    if (forced && !EVIDENCE_GATES.has(name)) {
      results.push({
        name,
        passed: true,
        remediation: "skipped by --force (bookkeeping gate)",
        inapplicable: false,
      });
      continue;
    }
    let row: Check;
    try {
      row =
        name === "test_run_fresh"
          ? predicate(sessionsDir, config)
          : predicate(sessionsDir);
    } catch (error) {
      // A buggy gate must not wedge every close in the repository.
      const kind = error instanceof Error ? error.name : typeof error;
      const text = error instanceof Error ? error.message : String(error);
      row = [false, `gate crashed (${kind}: ${text}); failing closed`];
    }
    results.push({
      name,
      passed: Boolean(row[0]),
      remediation: row[1],
      inapplicable: row[2] === true,
    });
  }
  return results;
}
