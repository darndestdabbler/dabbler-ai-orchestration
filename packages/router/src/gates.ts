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
//
// Shape (session 83): each gate is a thin READER that asks git, the disk or
// the ledger and returns facts, and a pure JUDGE over those facts that
// returns the row. The `check*` predicates compose the two and keep their
// signatures. The judges are what the unit tests call, with literal facts
// and no repository; the readers are exercised once, in the git-states
// walkthrough.

import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  type WorktreeGateOptions,
  isSetBookkeeping,
  materialPaths,
} from "./checks.ts";
import type { RouterConfig } from "./config.ts";
import { PROJECT_CONFIG_FILENAME, loadConfig, projectRoot } from "./config.ts";
import { EcosystemError, ecosystemOf } from "./ecosystem.ts";
import { changedPathsBetween, detectOutOfBandWrite } from "./evidence.ts";
import { readExposure } from "./exposure.ts";
import { type PackageReferenceFact, candidatesFromRecord, judgeExposure, judgePins } from "./land.ts";
import { ManifestError, type ModuleEntry, consumersOf, solutionShape } from "./modules.ts";
import {
  type ImpactPlan,
  candidatePathsAsWritten,
  demandedByPlan,
  readCandidateRecord,
  readImpactPlan,
} from "./impact.ts";
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
import { blockingDecisions, suitesOwedElsewhere } from "./owedDecisions.ts";
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
  // The wall and the pins are evidence of what landed, not bookkeeping.
  "pins_current",
  "exposure_within_ceiling",
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
  readonly unspentGrant: { readonly afterRound: number; readonly approver: string } | null;
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
      facts.unspentGrant = { afterRound: grant.afterRound, approver: grant.approver };
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
  const changed = changedPathsBetween(root, pythonStr(latest["completion_tree"]), facts.currentTree);
  // The candidate a module session's run of record tested against -- the
  // packages, their records, the central pins, the contract pages -- is
  // written after verification by design and recorded beside the run by
  // the job that wrote it. Those paths are the framework's derivation of
  // the verified source, not a change to it, and the land binds them to
  // the run of record; everything else that moved is still a move.
  // Only while its bytes are the candidate's: a candidate path edited since
  // is a change to the verified tree like any other, and is not set aside.
  const candidate = candidatePathsAsWritten(root, readCandidateRecord(root, facts.current as number));
  facts.changedSinceLatest =
    changed === null ? null : changed.filter((path) => !candidate.has(path.split("\\").join("/")));
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
      `${facts.unspentGrant.approver} reopened verification after round ` +
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
  /** Read only when there is no upstream: the waiver's two conditions. */
  readonly localOnlyMarker: boolean;
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
    localOnlyMarker: false,
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
    facts.localOnlyMarker = existsSync(join(root, ".dabbler", "local-only"));
    facts.hasRemote = facts.localOnlyMarker ? hasRemote(root) : true;
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
    if (facts.localOnlyMarker && !facts.hasRemote) {
      return [
        true,
        "local-only repo: push gate waived (.dabbler/local-only " +
          "marker present, no remote configured)",
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
export function judgeSuiteDeclaration(loaded: SuiteLoadResult): Check | null {
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
  return null;
}

/** The freshness row: every required suite's verdict, the failures named. */
export function judgeFreshness(verdicts: readonly FreshnessVerdict[]): Check {
  const failures = verdicts.filter((verdict) => verdict.required && !verdict.passed);
  if (failures.length === 0) return [true, ""];
  return [false, failures.map((v) => `${v.suite}: ${v.reason}`).join("; ")];
}

export function checkTestRunFresh(
  sessionsDir: string,
  config: RouterConfig | null = null,
): Check {
  const governing = config ?? governingConfig(sessionsDir);
  const loaded = loadSuitesChecked(governing);
  const declared = judgeSuiteDeclaration(loaded);
  if (declared !== null) return declared;
  // A module session's run of record ran the suites its impact plan reached
  // and no other; the gate demands the same ones, from the same plan. A
  // session with no plan -- a single-module solution -- is demanded every
  // required suite, as it always was.
  const root = repoRootFor(sessionsDir);
  const current = currentSession(sessionsDir);
  return judgeFreshness(
    demandedByPlan(
      evaluateFreshness(sessionsDir, null, loaded.suites),
      planForGate(sessionsDir),
      root !== null && typeof current === "number" ? suitesOwedElsewhere(root, current) : new Set(),
    ),
  );
}

function planForGate(sessionsDir: string): ImpactPlan | null {
  const root = repoRootFor(sessionsDir);
  const current = currentSession(sessionsDir);
  if (root === null || typeof current !== "number") return null;
  return readImpactPlan(root, current);
}

// --- pins_current and exposure_within_ceiling ---------------------------------------

/**
 * Every consumer on the candidate's pin, and pinning nowhere else. Read for
 * the changed modules the session's impact plan names that carry a package
 * and were packed this session; a single-module solution, or a session that
 * packed nothing, has no pin to hold and the row says so rather than
 * passing in silence.
 */
export function checkPinsCurrent(sessionsDir: string): Check {
  const root = repoRootFor(sessionsDir);
  const current = currentSession(sessionsDir);
  if (root === null || typeof current !== "number") return [true, "no session in flight: no pins to hold", true];
  let shape;
  try {
    shape = solutionShape(root);
  } catch (error) {
    if (!(error instanceof ManifestError)) throw error;
    return [false, `docs/modules.yaml is refused: ${error.message}`];
  }
  if (!shape.multi) return [true, "single-module solution: the repository is the module, and there is no pin to hold", true];
  const plan = readImpactPlan(root, current);
  if (plan === null || !plan.multi) return [true, "no impact plan on the record: nothing was packed this session", true];
  // What this session packed, from the candidate job's own record of what
  // it wrote: the correspondence records under packages/ name the version.
  const packed = candidatesFromRecord(readCandidateRecord(root, current).paths.map((entry) => entry.path));
  const candidates = plan.changedModules
    .map((slug) => shape.modules.find((entry) => entry.slug === slug))
    .filter((entry): entry is ModuleEntry => entry !== undefined && entry.package !== null)
    .map((entry) => {
      const record = packed.filter((row) => row.package === entry.package).at(-1);
      return record === undefined ? null : { package: entry.package as string, version: record.version, slug: entry.slug };
    })
    .filter((candidate): candidate is { package: string; version: string; slug: string } => candidate !== null);
  if (candidates.length === 0) return [true, "this session packed no candidate: no pin to hold", true];
  // The pins and the references through the seam of the candidate's own
  // ecosystem: where the pin lives and what a consumer's reference looks
  // like are its to say, and a consumer's project files are listed by the
  // same seam whether or not the consumer's source is on this disk.
  const pins = new Map<string, string>();
  const references: PackageReferenceFact[] = [];
  for (const candidate of candidates) {
    const packed = shape.modules.find((module) => module.slug === candidate.slug);
    if (packed === undefined) continue;
    let ecosystem;
    try {
      ecosystem = ecosystemOf(root, packed);
    } catch (error) {
      if (!(error instanceof EcosystemError)) throw error;
      return [false, `the ecosystem of module '${candidate.slug}' cannot be told: ${error.message}`];
    }
    for (const [id, version] of ecosystem.centralPins(root)) pins.set(id, version);
    for (const consumer of consumersOf(shape.modules, candidate.slug)) {
      const entry = shape.modules.find((module) => module.slug === consumer);
      if (entry === undefined) continue;
      for (const project of ecosystem.projectFiles(root, entry)) {
        try {
          references.push(...ecosystem.packageReferences(root, project));
        } catch {
          // A project file that cannot be read pins nothing this gate can see.
        }
      }
    }
  }
  const refusal = judgePins({ candidates, pins, references });
  return refusal === null ? [true, ""] : [false, refusal];
}

/**
 * The wall held: the closing exposure manifest shows nothing of a sibling
 * that nobody signed for, and nothing changed outside the scope. Read for a
 * module session's manifest; a session with none -- a single-module
 * solution, or a session not started on a module -- has no wall to measure
 * and the row says so.
 */
export function checkExposureWithinCeiling(sessionsDir: string): Check {
  const root = repoRootFor(sessionsDir);
  const current = currentSession(sessionsDir);
  if (root === null || typeof current !== "number") return [true, "no session in flight: no exposure to measure", true];
  const manifest = readExposure(root, current);
  if (manifest === null) {
    // No manifest is either a single-module repository or a global session
    // of a multi-module one, and the row says which: a global session is
    // the whole repository, and its close runs no exposure gate.
    let multi = false;
    try {
      multi = solutionShape(root).multi;
    } catch {
      multi = false;
    }
    return [
      true,
      multi
        ? "a global session: the whole repository, no wall to measure"
        : "no exposure manifest: not a module session, so there is no wall to measure",
      true,
    ];
  }
  const refusal = judgeExposure(manifest);
  if (refusal !== null) return [false, refusal];
  // Held, and what the wall let through is said beside the row: the
  // manifest records it, the row names it, nothing refuses on it.
  const noted = manifest.siblingBytes ?? [];
  return [true, noted.length === 0 ? "" : `held; noted, not refused: ${noted.join("; ")}`];
}

// --- owed_decisions -----------------------------------------------------------

/** The owed-decision row, from the blocking rows alone. */
export function judgeOwedDecisions(blocking: readonly Record<string, unknown>[]): Check {
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
  return judgeOwedDecisions(blocking);
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
  // A session that declared `not-releasable` passes with nothing to say.
  if (!releasability.declared) return [true, ""];
  // A withdrawn one passes and is REPORTED. Absorbing it -- passing the way
  // a not-releasable session passes -- would make the close's account of a
  // session that was supposed to ship and did not identical to its account
  // of one that never was, which is the whole thing this gate exists to
  // keep apart.
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
  // The record is read BEFORE the withdrawal is reported, so this gate can
  // never say "nothing was published" over a record that says a version
  // shipped. `withdraw-release` refuses after a publication for the same
  // reason, and the two together mean the contradiction has to be
  // hand-written into the ledger to exist at all -- at which point what the
  // close reports is the packaging record, which is the one that describes
  // something that actually left this machine.
  const withdrawn = releasability.withdrawn;
  if (withdrawn !== null && !rows.some((row) => row["outcome"] === OUTCOME_PUBLISHED)) {
    return [
      true,
      `declared releasable, and its releasability was WITHDRAWN by ${withdrawn.approver} ` +
        `on ${withdrawn.recordedAt}: ${withdrawn.reason}. Nothing was published, and the ` +
        "declaration stands on the record beside the withdrawal rather than being " +
        "rewritten by it.",
    ];
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

// --- Driver -------------------------------------------------------------------

export type Predicate = (sessionsDir: string, config?: RouterConfig | null) => Check;

export const GATE_CHECKS: readonly (readonly [string, Predicate])[] = [
  ["verification_clean", checkVerificationClean],
  ["working_tree_clean", checkWorkingTreeClean],
  ["pushed_to_remote", checkPushedToRemote],
  ["test_run_fresh", checkTestRunFresh],
  ["pins_current", checkPinsCurrent],
  ["exposure_within_ceiling", checkExposureWithinCeiling],
  ["owed_decisions", checkOwedDecisions],
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
