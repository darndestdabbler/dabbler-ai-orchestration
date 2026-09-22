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
// - `test_run_fresh`'s suite rule: csv-model, 2026-08-30 -- session 1 closed
//   at a clean 5/5 in a repository that declared no suite, and nothing would
//   have changed when the work became code. The row refuses code with no
//   suite, and nobody is asked:
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
//
// Shape (session 83): each gate is a thin READER that asks git, the disk or
// the ledger and returns facts, and a pure JUDGE over those facts that
// returns the row. The `check*` predicates compose the two and keep their
// signatures. The judges are what the unit tests call, with literal facts
// and no repository; the readers are exercised once, in the git-states
// walkthrough.

import { realpathSync } from "node:fs";
import { resolve } from "node:path";

import {
  type WorktreeGateOptions,
  isSetBookkeeping,
  materialPaths,
} from "./checks.ts";
import type { RouterConfig } from "./config.ts";
import { PROJECT_CONFIG_FILENAME, loadConfig, projectRoot } from "./config.ts";
import { readRun } from "./driver.ts";
import { detectEcosystems } from "./bootstrap/detect.ts";
import { changedPathsBetween, detectOutOfBandWrite } from "./evidence.ts";
import { changeIsEmpty } from "./facts.ts";
import {
  repoRelativePath,
  repoRootFor,
  runGit,
  snapshotWorktreeTree,
} from "./journal.ts";
import {
  LIFECYCLE_WRITTEN_FILES,
  LedgerError,
  OUTCOME_PUBLISHED,
  ROW_REMEDIATED_AT_CAP,
  readPackaging,
  readRounds,
  standingReopen,
} from "./ledger.ts";
import { releasabilityOf } from "./writers.ts";
import { readSessionState } from "./progress.ts";
import { pythonRepr, pythonStr } from "./pythonJson.ts";
import {
  evaluateFreshness,
  loadSuitesChecked,
  type FreshnessVerdict,
  type SuiteLoadResult,
} from "./testEvidence.ts";
import { SESSION_VERDICTS } from "./verdict.ts";

/**
 * Session-directory files the close itself commits after the flip.
 *
 * The lifecycle lock is deliberately absent from the commit list: it is
 * still held during the close commit and deleted on release, so committing
 * it leaves every close behind a tracked-deletion dirty tree.
 */
export const SET_BOOKKEEPING_COMMIT_BASENAMES = LIFECYCLE_WRITTEN_FILES;

/**
 * The gate that asks whether packaging has run, named once.
 *
 * `packaging` omits it from its own precondition check and nothing else
 * ever omits anything; the name is a constant so that the one caller does
 * not spell it, and so that renaming the gate cannot leave a string behind
 * that silently matches nothing and re-creates the circularity.
 */
export const GATE_PUBLISHED_WHEN_RELEASABLE = "published_when_releasable";

/**
 * The gates `--force` may never skip.
 *
 * Evidence, not bookkeeping: whether the tree was verified, whether the
 * verdict is a word the framework knows, and -- for a session that declared
 * itself releasable -- whether the one artifact it exists to produce was
 * produced. That last one was skippable, which made `--force` a way to
 * close a session VERIFIED having shipped nothing; forcing past a fact is
 * different from forcing past a formality, and only the second is what
 * `--force` is for.
 */
export const EVIDENCE_GATES: ReadonlySet<string> = new Set([
  "verification_clean",
  "verdict_vocabulary",
  GATE_PUBLISHED_WHEN_RELEASABLE,
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
   * not block -- code with no suite is refused by the row itself -- but it
   * never claims to have proved anything.
   */
  readonly inapplicable: boolean;
}

/** A predicate's answer, before it becomes a row. */
export type Check = readonly [
  passed: boolean,
  remediation: string,
  inapplicable?: boolean,
];

/** The mark a gate that judged and passed carries. */
export const GATE_PASS_MARK = "✓";
/** The mark a gate that judged and failed carries. */
export const GATE_FAIL_MARK = "✗";
/** What a gate that judged nothing says of itself, after its name. */
export const GATE_NOT_APPLICABLE = "(N/A)";
/**
 * The mark a gate that judged nothing carries: neither the pass mark nor
 * the fail mark. The sample closed two sessions VERIFIED behind nine ticks
 * with no test run, because the gate that would have run one wore the same
 * mark as the eight that judged.
 */
export const GATE_NOT_APPLICABLE_MARK = "-";

/**
 * One gate as a line, for whoever is showing it.
 *
 * **One renderer, because a gate reads the same wherever it is shown or the
 * two screens disagree about the same fact.** The close and the packaging
 * run each spelled their own marks -- `- <name>  PASS` against
 * `[PASS] <name>` -- under a comment in the second one claiming they were
 * already the same three marks. They were not, and the operator read two
 * formats for one fact.
 *
 * **A gate that judged nothing wears neither mark, says `(N/A)` and stops
 * there.** A dash where the tick would be, because a column of ticks with
 * one that judged nothing among them reads as nine gates passed. The
 * sentence explaining why its precondition was invisible is the longest
 * text on the busiest screen and it explains something that did not happen;
 * it belongs to whoever is debugging the gate. **A remediation on a gate that DID judge
 * is kept**: on a failure it is the operator's next action, and on a pass it
 * appears only under `--force`, where it is the forensic note saying a
 * bookkeeping gate was stepped over. Neither is an explanation of a
 * non-event.
 *
 * The caller supplies its own indent and may pad the name to a column; what
 * a gate row SAYS is settled here.
 */
export function renderGateRow(gate: GateResult, nameWidth = 0): string {
  const name = gate.name.padEnd(nameWidth);
  if (gate.inapplicable) return `${GATE_NOT_APPLICABLE_MARK} ${name} ${GATE_NOT_APPLICABLE}`;
  const mark = gate.passed ? GATE_PASS_MARK : GATE_FAIL_MARK;
  return gate.remediation
    ? `${mark} ${name}  ${gate.remediation}`
    : `${mark} ${name}`.trimEnd();
}

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

/**
 * The sessions root as the repository sees it, and the reason it is not a
 * bare `relative()`.
 *
 * `root` is git's spelling and `sessionsDir` is the caller's, and Windows
 * hands out more than one spelling for the same directory. The unresolved
 * comparison answered `..\alias\docs\sessions` on every CI runner -- whose
 * `os.tmpdir()` is the 8.3 short form -- so the prefix below never matched
 * and the ledger's own file counted as the session's work.
 */
function sessionsRel(root: string, sessionsDir: string): string {
  try {
    return repoRelativePath(root, sessionsDir);
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

// --- verification_clean -------------------------------------------------------

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
  return judgeVerification(readVerificationFacts(sessionsDir), sessionsDir);
}

/** What the verification gate reads, in the order it needs the answers. */
export interface VerificationFacts {
  /** Null outside a git repository. */
  readonly root: string | null;
  /** A hand edit the sanctioned writers cannot account for, or null. */
  readonly outOfBand: string | null;
  /** The session in flight, or null. */
  readonly current: unknown;
  /** The ledger's rounds; null when the ledger could not be read. */
  readonly rounds: readonly Record<string, unknown>[] | null;
  readonly ledgerError: string | null;
  /** The worktree snapshot; null when it could not be taken (or was not needed). */
  readonly currentTree: string | null;
  /** Paths changed since the latest round's tree; null when the diff failed. */
  readonly changedSinceLatest: readonly string[] | null;
  /**
   * An operator's grant of further rounds that no round has yet spent, or
   * null. The grant reopened a cap terminal, so that terminal's own "this is
   * as reviewed as it gets" no longer holds and the gate must not read it.
   */
  readonly unspentGrant: { readonly afterRound: number; readonly by: string } | null;
  readonly setRel: string;
}

/** Ask the record, the ledger and git, stopping where a judge would have. */
export function readVerificationFacts(sessionsDir: string): VerificationFacts {
  const facts: {
    -readonly [K in keyof VerificationFacts]: VerificationFacts[K];
  } = {
    root: repoRootFor(sessionsDir),
    outOfBand: null,
    current: null,
    rounds: null,
    ledgerError: null,
    currentTree: null,
    changedSinceLatest: null,
    unspentGrant: null,
    setRel: sessionsDir,
  };
  const root = facts.root;
  if (root === null) return facts;
  facts.setRel = sessionsRel(root, sessionsDir);
  // The integrity axis runs first and short-circuits: a hand-edited state
  // file must surface as itself, not as whatever downstream confusion it
  // causes.
  facts.outOfBand = detectOutOfBandWrite(sessionsDir, root, { requireRecord: true }) || null;
  if (facts.outOfBand !== null) return facts;
  facts.current = currentSession(sessionsDir);
  if (facts.current === null) return facts;
  try {
    facts.rounds = readRounds(root, facts.current as number);
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    facts.ledgerError = error.message;
    return facts;
  }
  const grant = standingReopen(root, facts.current as number);
  if (grant !== null && facts.rounds.length > 0) {
    const latestRound = Number(
      (facts.rounds[facts.rounds.length - 1] as Record<string, unknown>)["round"],
    );
    if (latestRound <= grant.afterRound) {
      facts.unspentGrant = { afterRound: grant.afterRound, by: grant.by };
      return facts;
    }
  }
  if (judgeLatestRound(facts.rounds, facts.current, sessionsDir) !== null) return facts;
  const latest = facts.rounds[facts.rounds.length - 1];
  facts.currentTree = snapshotWorktreeTree(root);
  if (facts.currentTree === null) return facts;
  // Deliberately the recorded tree, never `effectiveBaseline`: a re-anchored
  // baseline is safe for a fix delta, which only changes what the next round
  // is shown, and fatal here, where the question is whether the tree still IS
  // the verified one. Without that object there is no answer, and the diff
  // fails closed rather than substituting a tree nobody verified.
  facts.changedSinceLatest = changedPathsBetween(root, pythonStr(latest["completion_tree"]), facts.currentTree);
  return facts;
}

/** The verification gate's row, from the facts alone. */
export function judgeVerification(facts: VerificationFacts, sessionsDir: string): Check {
  if (facts.root === null) {
    return [false, `not inside a git repository: ${sessionsDir}`];
  }
  if (facts.outOfBand !== null) {
    return [
      false,
      `session-state integrity: ${facts.outOfBand}. State files are written by ` +
        "the router, never by hand.",
    ];
  }
  if (facts.current === null) {
    return [false, `no session is in flight under ${sessionsDir}`];
  }
  if (facts.rounds === null) {
    return [
      false,
      `the run ledger is unreadable or invalid (${facts.ledgerError ?? ""}); failing ` +
        "closed rather than trusting a tampered record",
    ];
  }
  // Before the rounds are judged at all. The newest row is still the cap
  // terminal a grant reopened, and reading it would answer with the very
  // "remediated at the cap" line the operator spent a grant to get past.
  if (facts.unspentGrant !== null) {
    return [
      false,
      `${facts.unspentGrant.by} reopened verification after round ` +
        `${facts.unspentGrant.afterRound} and no round has run since. The ` +
        "grant bought a review; it is not one. Run it: " +
        verifyCommand(sessionsDir),
    ];
  }
  const standing = judgeLatestRound(facts.rounds, facts.current, sessionsDir);
  if (standing !== null) return standing;
  if (facts.currentTree === null) {
    return [false, "could not snapshot the working tree (failing closed)"];
  }
  if (facts.changedSinceLatest === null) {
    return [
      false,
      "could not diff the working tree against the verified round " +
        "(failing closed)",
    ];
  }
  const latest = facts.rounds[facts.rounds.length - 1];
  return judgeTreeSinceRound(latest, facts.changedSinceLatest, facts.setRel, sessionsDir);
}

/**
 * What the ledger's rounds say before the tree is even looked at: no round
 * at all, or a latest round that is blocking, refuse; otherwise null and
 * the tree is next.
 */
export function judgeLatestRound(
  rounds: readonly Record<string, unknown>[],
  current: unknown,
  sessionsDir: string,
): Check | null {
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
  return null;
}

/**
 * Whether the paths that changed since the latest round's tree are the
 * session's work (refuse) or only its bookkeeping (pass), and what a cap
 * remediation says about itself.
 */
export function judgeTreeSinceRound(
  latest: Record<string, unknown>,
  changed: readonly string[],
  setRel: string,
  sessionsDir: string,
): Check {
  const material = changed.filter((path) => !isSetBookkeeping(path.replace(/\\/g, "/"), setRel));
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

// --- working_tree_clean -------------------------------------------------------

export interface WorktreeChanges {
  readonly paths: readonly string[];
  /** Empty when the question was answerable; a sentence when it was not. */
  readonly error: string;
}

/** `git status --porcelain -uall` as text, or the sentence for why not. */
export function readWorktreeStatus(root: string): { text: string; error: string } {
  // `-uall` expands collapsed untracked directories to per-file entries; a
  // single umbrella row would defeat the ignore filter.
  const status = runGit(root, ["status", "--porcelain", "-uall"]);
  if (status.code !== 0) {
    return { text: "", error: `git status failed: ${status.stderr || "unknown error"}` };
  }
  return { text: status.stdout, error: "" };
}

/** `git rev-list --count` output as a number; anything but an integer is 0. */
export function parseRevListCount(text: string): number {
  return pythonInt(text);
}

/** Whether the in-flight session's row records that its registration removed the hook. */
export function hookRemovedFor(sessionsDir: string): boolean {
  const current = currentSession(sessionsDir);
  const rows = readSessionState(sessionsDir)?.["sessions"];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) continue;
    const record = row as Record<string, unknown>;
    if (record["number"] !== current) continue;
    const orchestrator = record["orchestrator"];
    return (
      typeof orchestrator === "object" &&
      orchestrator !== null &&
      (orchestrator as Record<string, unknown>)["hookRemoved"] === true
    );
  }
  return false;
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
export function materialWorktreeChanges(
  sessionsDir: string,
  options: WorktreeGateOptions = {},
): WorktreeChanges {
  return judgeWorktree(readWorktreeFacts(sessionsDir), sessionsDir, {
    ...options,
    ...(options.beforeWork ? { hookRemoved: options.hookRemoved ?? hookRemovedFor(sessionsDir) } : {}),
  });
}

/** What the working-tree gate reads: the porcelain, and where the record lives. */
export interface WorktreeFacts {
  readonly root: string | null;
  readonly porcelain: string;
  /** The sentence for why the porcelain could not be read, or empty. */
  readonly error: string;
  readonly setRel: string;
}

export function readWorktreeFacts(sessionsDir: string): WorktreeFacts {
  const root = repoRootFor(sessionsDir);
  if (root === null) return { root, porcelain: "", error: "", setRel: sessionsDir };
  const status = readWorktreeStatus(root);
  return { root, porcelain: status.text, error: status.error, setRel: sessionsRel(root, sessionsDir) };
}

/** The work in the tree, from the facts alone. */
export function judgeWorktree(
  facts: WorktreeFacts,
  sessionsDir: string,
  options: WorktreeGateOptions = {},
): WorktreeChanges {
  if (facts.root === null) {
    return { paths: [], error: `not inside a git repository: ${sessionsDir}` };
  }
  if (facts.error) return { paths: [], error: facts.error };
  return { paths: materialPaths(facts.porcelain, facts.setRel, options), error: "" };
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

// --- pushed_to_remote ---------------------------------------------------------

const PUSH_FAILURE_SIGNALS: readonly (readonly [string, string])[] = [
  ["non-fast-forward", "non-fast-forward; rebase or pull --rebase first"],
  ["rejected", "remote rejected the push (branch protection or non-FF)"],
  ["protected branch", "remote rejected the push (branch protected)"],
  ["denied", "remote denied the push (permissions or branch protection)"],
];

/** What a push dry-run's stderr says went wrong, in the operator's words. */
export function classifyPushFailure(stderr: string): string {
  const lowered = (stderr || "").toLowerCase();
  for (const [signal, remediation] of PUSH_FAILURE_SIGNALS) {
    if (lowered.includes(signal)) return remediation;
  }
  const first = stderr ? stderr.split("\n")[0] : "unknown error";
  return `git push --dry-run failed: ${first}`;
}

/** The facts the push gate judges, as git and the disk answered them. */
export interface PushFacts {
  /** The checked-out branch, or null when HEAD is detached. */
  readonly branch: string | null;
  /** The upstream's name, or null when the branch tracks nothing. */
  readonly upstream: string | null;
  /** Read only when there is no upstream: a repository with no remote is local-only by that fact. */
  readonly hasRemote: boolean;
  /** Commits the upstream has not seen; 0 when unknown. */
  readonly ahead: number;
  /** Read only when ahead: null means the dry run succeeded. */
  readonly dryRunError: string | null;
}

/** A failed `git remote` is not an answer: the waiver needs an affirmative no. */
function hasRemote(repoRoot: string): boolean {
  const result = runGit(repoRoot, ["remote"]);
  if (result.code !== 0) return true;
  return result.stdout.trim().length > 0;
}

/** Ask git, in the order the judge needs the answers and no further. */
export function readPushFacts(root: string): PushFacts {
  const facts = {
    branch: null as string | null,
    upstream: null as string | null,
    hasRemote: true,
    ahead: 0,
    dryRunError: null as string | null,
  };
  const head = runGit(root, ["symbolic-ref", "--short", "HEAD"]);
  if (head.code !== 0) return facts;
  facts.branch = head.stdout;
  const upstream = runGit(root, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{u}",
  ]);
  if (upstream.code !== 0) {
    facts.hasRemote = hasRemote(root);
    return facts;
  }
  facts.upstream = upstream.stdout;
  const count = runGit(root, ["rev-list", "--count", "@{u}..HEAD"]);
  facts.ahead = count.code === 0 ? parseRevListCount(count.stdout) : 0;
  if (facts.ahead === 0) return facts;
  const dryRun = runGit(root, ["push", "--dry-run", "--porcelain"]);
  if (dryRun.code !== 0) facts.dryRunError = dryRun.stderr || "";
  return facts;
}

/** The push gate's row, from the facts alone. */
export function judgePushState(facts: PushFacts): Check {
  if (facts.branch === null) {
    return [false, "HEAD is detached; check out a branch before close-out"];
  }
  if (facts.upstream === null) {
    if (!facts.hasRemote) {
      return [
        true,
        "no remote is configured, so this repository is local-only and nothing is pushed; " +
          "`git remote add origin <url>` makes the land push",
      ];
    }
    return [
      false,
      `branch ${pythonRepr(facts.branch)} has no upstream; run: ` +
        `git push --set-upstream <remote> ${facts.branch}`,
    ];
  }
  if (facts.ahead === 0) return [true, ""];
  if (facts.dryRunError !== null) return [false, classifyPushFailure(facts.dryRunError)];
  return [
    false,
    `branch ${pythonRepr(facts.branch)} is ${facts.ahead} commit(s) ahead of ` +
      `${facts.upstream}; run: git push`,
  ];
}

export function checkPushedToRemote(sessionsDir: string): Check {
  const root = repoRootFor(sessionsDir);
  if (root === null) {
    return [false, `not inside a git repository: ${sessionsDir}`];
  }
  return judgePushState(readPushFacts(root));
}

// --- test_run_fresh -----------------------------------------------------------

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

/**
 * What the suite declaration alone decides: malformed refuses, no expensive
 * suite is inapplicable, otherwise null and the freshness verdicts are next.
 */
export function judgeSuiteDeclaration(
  loaded: SuiteLoadResult,
  code: readonly string[] = [],
): Check | null {
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
    // Code with no suite is refused here, in the row that judges suites: a
    // session cannot call its work verified while nothing runs the tests
    // of a repository that builds something. A repository of documents has
    // nothing to run and is inapplicable, not passed.
    if (code.length > 0) {
      return [
        false,
        `no suite is declared, and this repository builds ${code.join(", ")} code: declare one ` +
          `in ${PROJECT_CONFIG_FILENAME} under testing.suites, or nothing measures the work`,
      ];
    }
    return [true, "no suite is declared, so nothing was measured", true];
  }
  return null;
}

/** The freshness row: every required suite's verdict, the failures named. */
export function judgeFreshness(verdicts: readonly FreshnessVerdict[]): Check {
  const failures = verdicts.filter((verdict) => verdict.required && !verdict.passed);
  if (failures.length === 0) return [true, ""];
  return [false, failures.map((v) => `${v.suite}: ${v.reason}`).join("; ")];
}

/** The ecosystems whose build files say this repository builds code; empty for a repository of documents. */
export function codeEcosystems(root: string): string[] {
  try {
    return detectEcosystems(root).map((eco) => eco.key);
  } catch {
    return [];
  }
}

export function checkTestRunFresh(
  sessionsDir: string,
  config: RouterConfig | null = null,
): Check {
  const governing = config ?? governingConfig(sessionsDir);
  const loaded = loadSuitesChecked(governing);
  const root = repoRootFor(sessionsDir);
  const declared = judgeSuiteDeclaration(loaded, root === null ? [] : codeEcosystems(root));
  if (declared !== null) return declared;
  const current = currentSession(sessionsDir);
  const inFlight = root !== null && typeof current === "number";
  // Driven: the framework runs the suite itself after verification, so the
  // row inside a session states what it measured and no way to satisfy it.
  const driven = inFlight && readRun(root, current) !== null;
  return judgeFreshness(evaluateFreshness(sessionsDir, null, loaded.suites, { driven }));
}

// --- published_when_releasable ------------------------------------------------

/**
 * The packaging row for a session that declared itself releasable: a
 * `published` outcome passes; a record of trying, or no record, refuses.
 */
export function judgePackagingRecord(rows: readonly Record<string, unknown>[]): Check {
  // A row is not an answer: `dabbler packaging` records every non-dry run
  // it makes, `refused` and `failed` among them, so an attempt that shipped
  // nothing used to satisfy the gate that exists to prove something
  // shipped. And the way past a publish stop is `session close`, where this
  // printed PASS -- the csv-model gap reached from the other side. The
  // predicate is packaging's own, so "what counts as published" is stated
  // once.
  if (rows.some((row) => row["outcome"] === OUTCOME_PUBLISHED)) return [true, ""];
  const attempted = rows.length > 0;
  return [
    false,
    "this session declared itself releasable and " +
      (attempted
        ? `its packaging record holds ${rows.length} run(s) and none of them ` +
          "published -- a refusal or a failure is a record of trying, not of " +
          "shipping. Read the last row's refusal and answer it"
        : "no packaging run is on its record") +
      ", so closing it would report a session that shipped its " +
      "artifact when nothing was built or pushed. The publish phase runs " +
      "between the land and the close and writes that record; if it did " +
      "not run, find out why rather than closing past this. Declaring the " +
      "session not-releasable is a change to what the session IS and is " +
      "made at step (a), never here.",
  ];
}

/**
 * A session that declared it may publish has a packaging run on the record.
 *
 * csv-model, 2026-09-01: session 6 declared `releasable=true`, held a valid
 * packaging declaration, passed all six gates, landed and closed `VERIFIED`
 * -- and published nothing. The driven lifecycle had no publish phase, so
 * nothing ever called packaging, and no gate asked. The one deliverable the
 * session existed for was missing and the framework's own account showed no
 * discrepancy anywhere.
 *
 * The phase is the fix; this is what stops the fix being quietly undone. A
 * phase can be skipped, disabled, or fail to be reached by a path nobody
 * anticipated, and without this gate every one of those returns to closing
 * `VERIFIED` in silence.
 *
 * **It asks whether the framework tried and recorded it, not whether a feed
 * said yes.** A feed that refuses the artifact has already stopped the
 * session in the `publish` phase, so the close does not run at all; asking
 * about the outcome here would make the close a second judge of one fact,
 * and two judges of one fact disagree eventually. What this gate catches is
 * the case with no judge: a releasable session reaching the close with no
 * packaging run recorded at all, which is exactly what csv-model did.
 *
 * A session that declared `not-releasable` passes trivially -- there is
 * nothing it was supposed to publish.
 */
export function checkPublishedWhenReleasable(sessionsDir: string): Check {
  const root = repoRootFor(sessionsDir);
  if (root === null) return [true, ""];
  const current = currentSession(sessionsDir);
  if (typeof current !== "number") return [true, ""];
  const releasability = releasabilityOf(sessionsDir, current);
  // A session held by its declaration passes and SAYS so; one that never
  // declared passes with nothing to say.
  if (!releasability.declared) return [true, releasability.hold ?? ""];
  let rows;
  try {
    rows = readPackaging(root, current);
  } catch (error) {
    // Unreadable is a fault, not an absence -- the same rule the owed-decision
    // gate applies, and for the same reason.
    return [
      false,
      `the packaging record could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`,
    ];
  }
  // Held by its verdict: nothing was published and the row says why, so a
  // close after a cap terminal reads as held rather than as shipped.
  if (releasability.hold !== null && !rows.some((row) => row["outcome"] === OUTCOME_PUBLISHED)) {
    return [true, `${releasability.hold}. Nothing was published.`];
  }
  return judgePackagingRecord(rows);
}

// --- verdict_vocabulary -------------------------------------------------------

/** Every persisted token, named by its source, is in the closed allowlist. */
export function judgeVerdictTokens(tokens: readonly (readonly [string, unknown])[]): Check {
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
  return judgeVerdictTokens(tokens);
}

// --- a session that changed nothing -------------------------------------------

/** What deciding that a session changed nothing reads. */
export interface NoChangeFacts {
  /** How many verification rounds the session has; null when none could be read. */
  readonly rounds: number | null;
  /** The commit the driver recorded when it accepted the plan, or null. */
  readonly planHead: string | null;
  /** The commit HEAD is at now, or null. */
  readonly head: string | null;
  /** Whether the working tree differs from HEAD in nothing but the framework's own files. */
  readonly empty: boolean;
}

/**
 * A driven session changed nothing: no round was ever opened, HEAD is still
 * the commit its plan was accepted on, and the tree adds nothing to HEAD.
 *
 * test-dabbler-orchestration-terminals session 3: a session whose work was
 * already done accepted every step, found nothing to review, and stopped at
 * a verification that refuses an empty change -- with no way forward. All
 * three facts are needed: a round means something was reviewed, a moved HEAD
 * means something was committed, and a non-empty tree means something is
 * about to be.
 */
export function judgeNoChange(facts: NoChangeFacts): boolean {
  return (
    facts.rounds === 0 &&
    facts.planHead !== null &&
    facts.planHead === facts.head &&
    facts.empty
  );
}

/** Ask the ledger, the run and git, stopping where the judge would have. */
export function readNoChangeFacts(sessionsDir: string): NoChangeFacts {
  const none: NoChangeFacts = { rounds: null, planHead: null, head: null, empty: false };
  const root = repoRootFor(sessionsDir);
  const current = currentSession(sessionsDir);
  if (root === null || typeof current !== "number") return none;
  let rounds: number;
  try {
    rounds = readRounds(root, current).length;
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    return none;
  }
  const planHead = readRun(root, current)?.plan_head ?? null;
  if (rounds !== 0 || planHead === null) return { ...none, rounds, planHead };
  const headRun = runGit(root, ["rev-parse", "HEAD"]);
  const head = headRun.code === 0 ? headRun.stdout.trim() : null;
  if (head !== planHead) return { rounds, planHead, head, empty: false };
  return { rounds, planHead, head, empty: changeIsEmpty(root) };
}

/** The in-flight session changed nothing, by `judgeNoChange`. */
export function sessionChangedNothing(sessionsDir: string): boolean {
  return judgeNoChange(readNoChangeFacts(sessionsDir));
}

/**
 * The gates a session that changed nothing passes without their evidence:
 * there was nothing to verify or to run the suite against. Publishing is not
 * among them: a release session changes nothing by design, and what it
 * exists to produce is exactly the packaging run that gate asks for.
 */
export const NO_CHANGE_GATES: ReadonlySet<string> = new Set([
  "verification_clean",
  "test_run_fresh",
]);

/** The remediation a gate passed for a session that changed nothing carries. */
export const NO_CHANGE_REMEDIATION = "no change";

// --- Driver -------------------------------------------------------------------

export type Predicate = (sessionsDir: string, config?: RouterConfig | null) => Check;

export const GATE_CHECKS: readonly (readonly [string, Predicate])[] = [
  ["verification_clean", checkVerificationClean],
  ["working_tree_clean", checkWorkingTreeClean],
  ["pushed_to_remote", checkPushedToRemote],
  ["test_run_fresh", checkTestRunFresh],
  [GATE_PUBLISHED_WHEN_RELEASABLE, checkPublishedWhenReleasable],
  ["verdict_vocabulary", checkVerdictVocabulary],
];

/**
 * Which phase of the driven lifecycle MAKES each gate's evidence.
 *
 * Stated here, beside the gates, because it is a property of the gate and
 * not of the loop -- the loop reads it, and a second copy of it there would
 * be the same one-rule-twice this session exists to close.
 *
 * The driver uses it to rewind. `packageSession` runs the close's gates as
 * its own preconditions, so a publish can be refused for evidence made five
 * phases earlier; before session 138 the driver stayed at `publish` from
 * there, `rebaseline` moved the baseline and explicitly not the phase, and
 * no verb returned a stopped run to verification. Session 137 was recovered
 * by hand -- `verify`, both suites, `test-evidence record` twice, commit,
 * push -- which is precisely the set of things the managed body tells an
 * engine are not its to run. Either the framework owns those phases or the
 * guidance is wrong about whose they are; this map is the framework owning
 * them.
 *
 * A gate absent from this map is one no phase can remake -- an owed
 * decision is a person's to answer, a verdict's vocabulary is the
 * verifier's -- and a publish refused on one of those stops, correctly.
 */
export type EvidencePhase = "verify" | "run-of-record" | "land";

/** The phases in the order the loop runs them, which is the rewind's order too. */
const EVIDENCE_PHASE_ORDER: readonly EvidencePhase[] = ["verify", "run-of-record", "land"];

export const GATE_EVIDENCE_PHASE: ReadonlyMap<string, EvidencePhase> = new Map([
  ["verification_clean", "verify"],
  ["test_run_fresh", "run-of-record"],
  ["working_tree_clean", "land"],
  ["pushed_to_remote", "land"],
]);

/**
 * The earliest phase among the gates that failed, or null when none of them
 * is a phase's to remake.
 *
 * Earliest, because the phases run in order and re-entering the earliest
 * one runs the others after it: a tree that moved after verification also
 * invalidates the suite and the push, and rewinding only as far as the land
 * would carry the stale round forward into the close.
 */
export function rewindPhaseFor(
  gates: readonly { readonly name: string; readonly passed?: boolean }[],
): EvidencePhase | null {
  let earliest: number | null = null;
  for (const gate of gates) {
    if (gate.passed === true) continue;
    const phase = GATE_EVIDENCE_PHASE.get(gate.name);
    if (phase === undefined) continue;
    const rank = EVIDENCE_PHASE_ORDER.indexOf(phase);
    if (earliest === null || rank < earliest) earliest = rank;
  }
  return earliest === null ? null : (EVIDENCE_PHASE_ORDER[earliest] as EvidencePhase);
}

export interface RunGatesOptions {
  readonly forced?: boolean;
  readonly config?: RouterConfig | null;
  /**
   * Gates to leave unasked, by name.
   *
   * There is exactly one caller and one reason. `packaging` asks the close's
   * gates as its own preconditions -- deliberately the same set, so the two
   * can never disagree about whether a session was ready -- and
   * `published_when_releasable` asks whether packaging has already run. Asked
   * of packaging by packaging, it is a question that answers itself wrongly:
   * the first run would be refused for not having run, and no session could
   * ever publish.
   *
   * It is an omission and never a pass: the row is absent from the result
   * rather than present and green, so nothing downstream can read it as
   * evidence that the question was asked and answered.
   */
  readonly omit?: readonly string[];
  /** The gates to run; `GATE_CHECKS` unless a test hands in its own. */
  readonly gates?: readonly (readonly [string, Predicate])[];
  /**
   * The session changed nothing (`sessionChangedNothing`), so the gates in
   * `NO_CHANGE_GATES` pass saying so rather than asking for evidence no
   * change could produce. The rest are asked as always.
   */
  readonly noChange?: boolean;
}

/**
 * Every gate's row (or only the evidence gates under `forced` -- force
 * bypasses bookkeeping, never evidence). A predicate that throws becomes a
 * failed row carrying the error text.
 */
export function runGates(
  sessionsDir: string,
  options: RunGatesOptions = {},
): GateResult[] {
  const forced = options.forced === true;
  const config = options.config ?? null;
  const omit = new Set(options.omit ?? []);
  const results: GateResult[] = [];
  for (const [name, predicate] of options.gates ?? GATE_CHECKS) {
    if (omit.has(name)) continue;
    if (options.noChange === true && NO_CHANGE_GATES.has(name)) {
      results.push({ name, passed: true, remediation: NO_CHANGE_REMEDIATION, inapplicable: false });
      continue;
    }
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
