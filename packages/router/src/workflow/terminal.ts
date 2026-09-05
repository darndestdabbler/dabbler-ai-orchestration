// Where a loop stands, and when it has ended.
//
// **The review loop is bounded and ends by itself.** A step gets at most
// `verification.settings.max_rounds` review rounds, resolved against the
// workspace under discussion rather than the process's working directory. It
// stops early the moment no blocking finding remains, and it then reaches
// exactly one of the three terminal states of the session framework's code
// review loop -- verified, unresolved, or remediated at the cap. The terminal
// state is computed from the log and the artifacts on disk; no event asserts
// it and no caller can type one. Only rounds that reached a vendor are
// counted, because the bound exists to stop an unattended loop spending on
// vendors.
//
// **The tests loop is the same shape and a different meter.** The verifier
// authors the tests and the framework runs them, so a test round is judged by
// an exit code rather than by an opinion, and its bound is
// `verification.settings.max_test_rounds`. It lands on the same three
// terminal states, computed the same way.

import { isAbsolute, join } from "node:path";

import {
  DEFAULT_TEST_ROUNDS,
  DEFAULT_VERIFICATION_ROUNDS,
  loadConfig,
  runRoundCap,
  verificationRoundCap,
} from "../config.ts";
import { snapshotWorktreeTree } from "../journal.ts";
import { pythonStr } from "../pythonJson.ts";
import { STEP_TITLES } from "../solution.ts";
import { digestText } from "../stepreview.ts";
import { readText } from "../textfile.ts";
import {
  type Finding,
  isBlockingIssue,
  TERMINAL_HEADLINES,
  unremediatedFindings,
  validateSessionVerdict,
  VERDICT_ISSUES_FOUND,
  VERDICT_REMEDIATED_AT_CAP,
  VERDICT_VERIFIED,
} from "../verdict.ts";
import type { TargetState, WorkflowEvent } from "./log.ts";

/**
 * How each terminal state of the review loop reads. Owned by the verdict
 * vocabulary, beside the closed token set it is keyed on, and shared with the
 * session projection so both describe a terminal state in one voice.
 */
export { TERMINAL_HEADLINES };

/**
 * The bound configured for `root`, resolved through the one resolver every
 * loop uses.
 *
 * The workspace is passed rather than assumed. `--workspace-root` and
 * `project(root)` are first-class entrypoints, so reading the overlay from
 * whatever directory the process happens to be sitting in would let a
 * repository's configured cap be enforced against a different repository's
 * number -- and displayed as that number too.
 *
 * A config that cannot be loaded falls back to the shipped default rather
 * than to no bound, because the projection is a view and a config problem
 * must not make it unreadable.
 */
export function reviewCap(root: string): number {
  try {
    return verificationRoundCap(loadConfig(undefined, String(root)));
  } catch {
    return DEFAULT_VERIFICATION_ROUNDS;
  }
}

/**
 * How many times the tests phase may run before its loop terminates, resolved
 * on the same terms as `reviewCap` and from the same workspace.
 */
export function runCap(root: string): number {
  try {
    return runRoundCap(loadConfig(undefined, String(root)));
  } catch {
    return DEFAULT_TEST_ROUNDS;
  }
}

/**
 * The findings of a round that block, decided by `verdict.ts`. There is one
 * implementation of "does this finding block" and this module is not it.
 */
export function blockingFindings(event: WorkflowEvent): Finding[] {
  return ((event.findings ?? []) as Finding[]).filter((f) => isBlockingIssue(f));
}

/**
 * The reviewed artifacts whose content is no longer what the round read.
 *
 * An artifact that has gone counts as changed, on the same terms a diff would
 * report a deletion: the thing the round looked at is not there any more.
 * What that proves is decided per finding by `unremediatedFindings`, not here.
 */
export function changedArtifacts(
  root: string,
  digests: Readonly<Record<string, unknown>> | null | undefined,
): string[] {
  const changed: string[] = [];
  for (const [path, recorded] of Object.entries(digests ?? {})) {
    const full = isAbsolute(path) ? path : join(root, path);
    let current: string;
    try {
      current = digestText(readText(full));
    } catch {
      changed.push(path);
      continue;
    }
    if (current !== (recorded as string)) changed.push(path);
  }
  return changed;
}

/**
 * Which terminal state this target's current step has reached, or `null`
 * while its loop is still open.
 *
 * Derived from the folded log and the artifacts on disk. Nothing writes it,
 * no event asserts it, and the answer goes back through the closed verdict
 * vocabulary on the way out -- so there is no terminal state a caller can
 * type and no fourth one this module can invent.
 *
 * The three, and how each is decided:
 *
 * - **Verified** -- the last live round left no blocking finding. Minor-only
 *   lands here, which is the early stop: prose review has no bottom and
 *   grinding rounds against wording is what the severity vocabulary exists to
 *   prevent.
 * - **Remediated at the cap** -- the cap is reached, and every blocking
 *   finding of the last round cited an artifact that has changed since that
 *   round read it. The work stands, labelled unreviewed. It is not a waiver:
 *   nothing was accepted over a finding that still stood, and what is
 *   unproved is the repair rather than the complaint.
 * - **Unresolved** -- the cap is reached and at least one blocking finding
 *   cannot be shown answered. A round that blocked without naming a single
 *   parseable finding lands here too, because there is nothing to have fixed
 *   and a clean-looking exit off an unreadable round is the laundering route
 *   the fail-closed rule exists to shut.
 */
export function reviewTerminal(
  root: string,
  state: TargetState | null | undefined,
  cap: number,
): string | null {
  const last = state?.lastLiveReview;
  if (!last) return null;
  if (last.verdict !== "blocked") return validateSessionVerdict(VERDICT_VERIFIED);
  if ((state?.reviewRounds ?? 0) < cap) return null;
  const blocking = blockingFindings(last);
  const changed = changedArtifacts(
    root,
    (last.artifactDigests ?? {}) as Record<string, unknown>,
  );
  const token =
    blocking.length === 0 || unremediatedFindings(blocking, changed).length > 0
      ? VERDICT_ISSUES_FOUND
      : VERDICT_REMEDIATED_AT_CAP;
  return validateSessionVerdict(token);
}

export function terminalRefusal(
  target: string,
  step: string,
  state: TargetState,
  terminal: string,
  cap: number,
): string {
  const rounds = state.reviewRounds || 0;
  let detail = "";
  if (terminal === VERDICT_ISSUES_FOUND) {
    const unshown = blockingFindings(state.lastLiveReview ?? {});
    detail = unshown
      .map(
        (f) =>
          `\n  - [${pythonStr(f.severity)}] ` +
          `${String(f.description ?? "").slice(0, 160)}`,
      )
      .join("");
  }
  return (
    `${target} — ${STEP_TITLES[step]}: ${TERMINAL_HEADLINES[terminal]} ` +
    `after ${rounds} round(s), cap ${cap}. This step's review loop is ` +
    `closed and no further round opens on it.${detail}\n` +
    "Nobody is asked whether it should continue — that is the bound " +
    "doing its job, not a decision waiting on someone. Move the work " +
    "instead: `workflow send-back --to <step> --reason ...` returns it " +
    "to the author, `workflow enter <next step>` carries it forward. " +
    "Either one opens a new loop with its rounds back at zero."
  );
}

/**
 * Which terminal state a run loop has reached, or `null` while it is still
 * open.
 *
 * One implementation for both loops that are decided by an exit code -- the
 * tests phase and the complete suite -- because they differ only in which run
 * they read. A second copy would eventually disagree with this one, and the
 * disagreement would appear as two loops that ended differently on the same
 * facts.
 *
 * The same three states as the review loop and the same closed vocabulary,
 * decided against an exit code instead of an opinion:
 *
 * - **Verified** -- the last run was green. Green is green: there is no
 *   severity to weigh and no early stop to make, because a passing suite is
 *   already the cheapest possible ending.
 * - **Remediated at the cap** -- the cap is reached on a red run, and the
 *   tree has moved since that run finished. Something was repaired and the
 *   bound left the repair unrun. It is not a waiver: no failure was accepted,
 *   and what is unproved is the fix.
 * - **Unresolved** -- the cap is reached, and the tree is the one the run
 *   left behind. Nothing has been done about it, and a run that could not
 *   name the tree it left lands here too: a state that cannot be compared is
 *   not evidence of a repair.
 *
 * The comparison is against the tree **after** the run rather than the one it
 * was measuring, so a suite that dirties the worktree cannot label its own
 * side effect a repair. Such a run is already failed evidence; it must not
 * also be the cheapest way out of an unresolved loop.
 */
export function runTerminal(
  root: string,
  state: TargetState | null | undefined,
  cap: number,
  options: {
    runKey?: "lastTestRun" | "lastSuiteRun";
    roundsKey?: "testRounds" | "suiteRounds";
  } = {},
): string | null {
  const runKey = options.runKey ?? "lastTestRun";
  const roundsKey = options.roundsKey ?? "testRounds";
  const last = state?.[runKey];
  if (!last) return null;
  if (last.green) return validateSessionVerdict(VERDICT_VERIFIED);
  if ((state?.[roundsKey] ?? 0) < cap) return null;

  const left = last.postTreeDigest;
  const current = snapshotWorktreeTree(root);
  const token =
    left && current && current !== left
      ? VERDICT_REMEDIATED_AT_CAP
      : VERDICT_ISSUES_FOUND;
  return validateSessionVerdict(token);
}

/**
 * The complete suite's loop, on the tests loop's own terms. §3.d ends "same
 * cap and same ending as c.ii", so it is the same function.
 */
export function suiteTerminal(
  root: string,
  state: TargetState | null | undefined,
  cap: number,
): string | null {
  return runTerminal(root, state, cap, {
    runKey: "lastSuiteRun",
    roundsKey: "suiteRounds",
  });
}

export function runTerminalRefusal(
  target: string,
  step: string,
  state: TargetState,
  terminal: string,
  cap: number,
  options: {
    what?: string;
    roundsKey?: "testRounds" | "suiteRounds";
    runKey?: "lastTestRun" | "lastSuiteRun";
  } = {},
): string {
  const what = options.what ?? "tests";
  const roundsKey = options.roundsKey ?? "testRounds";
  const runKey = options.runKey ?? "lastTestRun";
  const rounds = state[roundsKey] || 0;
  const last = state[runKey] ?? {};
  let detail = "";
  if (terminal === VERDICT_ISSUES_FOUND) {
    detail =
      `\n  last run: exit ${pythonStr(last.exitCode)} on ` +
      `${pythonStr(last.command)}`;
  }
  return (
    `${target} — ${STEP_TITLES[step]}: ${what} ` +
    `${TERMINAL_HEADLINES[terminal]} after ${rounds} round(s), cap ${cap}. ` +
    `This step's ${what} loop is closed and no further round opens on ` +
    `it.${detail}\n` +
    "Authoring more tests does not reopen it — that would be spending " +
    "past the bound by another name. Move the work instead: " +
    "`workflow send-back --to <step> --reason ...` returns it to the " +
    "author, `workflow enter <next step>` carries it forward."
  );
}
