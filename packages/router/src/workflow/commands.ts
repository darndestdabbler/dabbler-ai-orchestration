// The five commands that call something: review, author-tests, test, suite,
// fix.
//
// Each one refuses first against the loop's terminal state, then spends, then
// records what came back. The order is the point: a round that has already
// been paid for cannot be refused, so every bound is checked before the call
// rather than after it.

import { writeAccepted } from "../agency.ts";
import { checkRunGreen, type CheckRun } from "../checks.ts";
import { loadConfig } from "../config.ts";
import { writeOut } from "../output.ts";
import * as fixloop from "../fixloop.ts";
import { APPROVAL_STEPS, STEP_TITLES } from "../solution.ts";
import * as stepreview from "../stepreview.ts";
import * as testphase from "../testphase.ts";
import { readText } from "../textfile.ts";
import {
  append,
  fileReview,
  fold,
  read,
  requireState,
  type TargetState,
  TEST_OUTPUT_TAIL_LINES,
  validateTransition,
  WorkflowError,
} from "./log.ts";
import { tryWriteProjection } from "./project.ts";
import {
  reviewCap,
  reviewTerminal,
  runCap,
  runTerminal,
  runTerminalRefusal,
  suiteTerminal,
  TERMINAL_HEADLINES,
  terminalRefusal,
} from "./terminal.ts";

export const EXIT_OK = 0;

/**
 * The three calls the step driver makes out of itself: a routed review, a
 * run of the tests a verifier authored, and a run of the declared suite.
 *
 * One seam for the three, because what this module decides is what it
 * RECORDS -- and a test of that has no business arranging a model or a
 * runner. Production never swaps them; the returned function restores what
 * stood, the way the git and router seams do.
 */
export interface WorkSources {
  readonly review: typeof stepreview.review;
  readonly runAuthored: typeof testphase.runAuthored;
  readonly runSuite: typeof fixloop.runSuite;
}

let sources: WorkSources = {
  review: (options) => stepreview.review(options),
  runAuthored: (root, config, paths) => testphase.runAuthored(root, config, paths),
  runSuite: (root, config, paths) => fixloop.runSuite(root, config, paths),
};

export function setWorkSources(replacements: Partial<WorkSources>): () => void {
  const previous = sources;
  sources = { ...sources, ...replacements };
  return () => {
    sources = previous;
  };
}

/** What every command needs to know about which target it is acting on. */
export interface TargetArgs {
  readonly component?: string | null;
  readonly workspaceRoot: string;
}

export function targetOf(args: TargetArgs): string {
  return args.component || "solution";
}

/**
 * One line per suite that ran. Named per suite rather than summarised: a
 * repository with two ecosystems has two commands, and a reader told only the
 * aggregate cannot tell which runner said what.
 */
function printRuns(target: string, step: string, runs: readonly CheckRun[]): void {
  for (const run of runs) {
    writeOut(`${target} — ${STEP_TITLES[step]}: ${run.command}\n`);
    writeOut(
      `  exit ${run.exitCode} in ${run.durationSeconds}s ` +
        `(${checkRunGreen(run) ? "green" : "red"})\n`,
    );
    if (run.treeMutated) {
      writeOut(
        "  the run changed the tree it was measuring, so it did not measure " +
          "the tree anyone is about to commit\n",
      );
    }
  }
}

/**
 * One event's worth of fields from however many suite runs it took.
 *
 * A repository running two ecosystems has two runners, so a round is a list
 * of runs rather than one. The scalars are the aggregate and say so: green is
 * every run green, and the exit code and command are the first failing run's,
 * because that is the one a reader has to go and look at. `postTreeDigest` is
 * the tree the *last* run left, which is what the terminal-state comparison
 * means by "the tree the run left behind". `runs` carries each suite's own
 * row, so nothing is summarised away.
 */
function runRows(runs: readonly CheckRun[]): Record<string, unknown> {
  const failed = runs.find((r) => !checkRunGreen(r));
  const speaker = failed ?? runs[runs.length - 1];
  const first = runs[0];
  const last = runs[runs.length - 1];
  return {
    green: runs.every((r) => checkRunGreen(r)),
    exitCode: speaker.exitCode,
    outcome: speaker.outcome,
    command: speaker.command,
    suite: speaker.check.name,
    treeDigest: first.treeDigest,
    postTreeDigest: last.postTreeDigest,
    treeMutated: runs.some((r) => r.treeMutated),
    timedOut: runs.some((r) => r.timedOut),
    durationSeconds: runs.reduce((sum, r) => sum + (r.durationSeconds || 0), 0),
    runs: runs.map((r) => ({
      suite: r.check.name,
      command: r.command,
      green: checkRunGreen(r),
      exitCode: r.exitCode,
      outcome: r.outcome,
      treeDigest: r.treeDigest,
      postTreeDigest: r.postTreeDigest,
      treeMutated: r.treeMutated,
      timedOut: r.timedOut,
      durationSeconds: r.durationSeconds,
    })),
  };
}

/**
 * Where a loop stands, whether or not it has opened or closed.
 *
 * Shown unconditionally. A count is most useful before the loop ends -- it is
 * what says how much room is left -- so hiding it until the first round or
 * until the loop closes withholds it exactly when it is worth reading.
 */
export function loopLabel(
  node: Record<string, unknown>,
  prefix = "review",
): string {
  const position = `${String(node[`${prefix}Rounds`])}/${String(node[`${prefix}Cap`])} rounds`;
  if (node[`${prefix}Terminal`]) {
    return `${String(node[`${prefix}TerminalLabel`])}, ${position}`;
  }
  return `open, ${position}`;
}

function testsPosition(root: string, target: string, cap: number): void {
  const after = fold(read(root)).get(target);
  const reached = runTerminal(root, after, cap);
  const spent = after?.testRounds ?? 0;
  if (reached !== null) {
    writeOut(
      `  loop closed: tests ${TERMINAL_HEADLINES[reached]} (${spent}/${cap} rounds)\n`,
    );
  } else {
    writeOut(`  round ${spent} of ${cap}\n`);
  }
}

function suitePosition(root: string, target: string, cap: number): void {
  const after = fold(read(root)).get(target);
  const reached = suiteTerminal(root, after, cap);
  const spent = after?.suiteRounds ?? 0;
  if (reached !== null) {
    writeOut(
      `  loop closed: suite ${TERMINAL_HEADLINES[reached]} (${spent}/${cap} rounds)\n`,
    );
  } else {
    writeOut(`  round ${spent} of ${cap}\n`);
  }
}

function refuseIfTestsLoopClosed(
  root: string,
  target: string,
  state: TargetState,
  cap: number,
): void {
  const terminal = runTerminal(root, state, cap);
  if (terminal !== null) {
    throw new WorkflowError(
      runTerminalRefusal(target, state.step, state, terminal, cap),
    );
  }
}

function refuseIfSuiteLoopClosed(
  root: string,
  target: string,
  state: TargetState,
  cap: number,
): void {
  const terminal = suiteTerminal(root, state, cap);
  if (terminal !== null) {
    throw new WorkflowError(
      runTerminalRefusal(target, state.step, state, terminal, cap, {
        what: "suite",
        roundsKey: "suiteRounds",
        runKey: "lastSuiteRun",
      }),
    );
  }
}

export interface ReviewArgs extends TargetArgs {
  readonly artifact: readonly string[];
  readonly authorProvider?: string | null;
  readonly transport?: string | null;
}

export async function runReview(args: ReviewArgs, root: string): Promise<number> {
  const target = targetOf(args);
  const state = requireState(root, target);
  const step = state.step;
  const cap = reviewCap(root);
  const terminal = reviewTerminal(root, state, cap);
  if (terminal !== null) {
    throw new WorkflowError(terminalRefusal(target, step, state, terminal, cap));
  }

  const [outcome, raws] = await sources.review({
    target,
    step,
    artifactPaths: args.artifact,
    authorProvider: args.authorProvider ?? null,
    transport: args.transport ?? null,
  });
  const filed = fileReview(root, target, step, raws);

  const findings = stepreview.reviewFindings(outcome);
  const live = stepreview.reviewLive(outcome);
  const simulated = stepreview.reviewSimulated(outcome);
  const blocked = stepreview.reviewBlocked(outcome);
  append(root, {
    event: "reviewed",
    target,
    step,
    verdict: stepreview.reviewVerdict(outcome),
    reviewers: outcome.reviewers.map((r) => stepreview.reviewerRow(r)),
    findings,
    artifacts: [...outcome.artifacts],
    // What each artifact contained when this round read it. The next terminal
    // decision compares against these rather than asking anyone whether a
    // finding was addressed.
    artifactDigests: { ...outcome.artifactDigests },
    records: filed,
    simulated,
    // Whether this round reached a vendor, and so whether it counts against
    // the cap. Recorded rather than inferred later.
    live,
    needsApproval: APPROVAL_STEPS.includes(step),
  });
  tryWriteProjection(root);

  if (simulated) {
    writeOut(
      "  SCRIPTED REVIEW — served from a response file, not a vendor. This " +
        "round is not cross-vendor evidence.\n",
    );
  }
  for (const r of outcome.reviewers) {
    writeOut(`  ${r.model}/${r.provider}: ${r.verdict} (${r.blocking ? "blocks" : "clear"})\n`);
  }
  writeOut(`${target} — ${STEP_TITLES[step]}: ${stepreview.reviewVerdict(outcome)}\n`);
  if (findings.length > 0) {
    writeOut(`  ${findings.length} finding(s) recorded, every severity kept\n`);
  }
  for (const path of filed) writeOut(`  filed ${path}\n`);

  const after = fold(read(root)).get(target);
  const reached = reviewTerminal(root, after, cap);
  const spent = after?.reviewRounds ?? 0;
  if (reached !== null) {
    writeOut(
      `  loop closed: ${TERMINAL_HEADLINES[reached]} (${spent}/${cap} rounds)\n`,
    );
  } else if (live) {
    writeOut(`  round ${spent} of ${cap}\n`);
  }

  if (APPROVAL_STEPS.includes(step)) {
    writeOut(
      blocked
        ? "  waiting on you: approve over these, or send it back\n"
        : "  waiting on you to approve\n",
    );
  } else if (blocked) {
    writeOut("  back with the author\n");
  }
  return EXIT_OK;
}

/**
 * The hand-off. The verifier is asked for files and nothing else, and the
 * framework is what opens one.
 */
export async function runAuthorTests(
  args: ReviewArgs,
  root: string,
): Promise<number> {
  const target = targetOf(args);
  const state = requireState(root, target);
  const step = state.step;
  const cap = runCap(root);
  refuseIfTestsLoopClosed(root, target, state, cap);

  let authoring: testphase.Authoring;
  let raw: string;
  try {
    [authoring, raw] = await testphase.author(
      root,
      target,
      step,
      args.artifact,
      loadConfig(undefined, String(root)),
      {
        authorProvider: args.authorProvider ?? null,
        transport: args.transport ?? null,
      },
    );
  } catch (error) {
    if (error instanceof testphase.PhaseError) throw new WorkflowError(error.message);
    throw error;
  }

  const filed = fileReview(root, target, step, [raw], "tests");
  const written = testphase.authoringWritten(authoring);
  append(root, {
    event: "tests-authored",
    target,
    step,
    written,
    author: testphase.authoringRow(authoring),
    records: filed,
    simulated: authoring.simulated,
  });
  tryWriteProjection(root);

  if (authoring.simulated) {
    writeOut(
      "  SCRIPTED AUTHORING — served from a response file, not a vendor. " +
        "These tests were not written by another vendor.\n",
    );
  }
  writeOut(
    `${target} — ${STEP_TITLES[step]}: tests authored by ` +
      `${authoring.model}/${authoring.provider}\n`,
  );
  for (const write of authoring.writes) {
    if (writeAccepted(write)) {
      writeOut(`  ${write.action} ${write.path} (${write.bytesWritten} bytes)\n`);
    } else {
      writeOut(`  refused ${write.path}: ${write.reason}\n`);
    }
  }
  for (const path of filed) writeOut(`  filed ${path}\n`);
  if (written.length === 0) {
    writeOut(
      "  nothing was written, so there is nothing to run. The record carries " +
        "every refusal above.\n",
    );
  }
  return EXIT_OK;
}

/**
 * The framework's half: run what the verifier wrote and record what the exit
 * code said. No opinion is solicited and none is recorded.
 */
export async function runTests(args: TargetArgs, root: string): Promise<number> {
  const target = targetOf(args);
  const state = requireState(root, target);
  const step = state.step;
  const cap = runCap(root);
  refuseIfTestsLoopClosed(root, target, state, cap);
  // The same judge the log is read back through. A run with nothing authored
  // is refused here rather than after it has already happened.
  validateTransition(state, { event: "tested", target, step });

  const authored = [...state.testsAuthored];
  let runs: CheckRun[];
  try {
    runs = await sources.runAuthored(
      root,
      loadConfig(undefined, String(root)),
      authored,
    );
  } catch (error) {
    if (error instanceof testphase.PhaseError) throw new WorkflowError(error.message);
    throw error;
  }

  // The tree the runs measured, and the one they left behind. Whether a later
  // fix is unrun is decided against the second: a suite that dirtied the
  // worktree must not be able to call its own side effect a repair.
  append(root, {
    event: "tested",
    target,
    step,
    tests: authored,
    ...runRows(runs),
  });
  tryWriteProjection(root);

  printRuns(target, step, runs);
  if (!runs.every((r) => checkRunGreen(r))) {
    const tail = runs.flatMap((r) =>
      (r.output || "").split(/\r\n|\r|\n/).filter((line) => line.trim()),
    );
    for (const line of tail.slice(-TEST_OUTPUT_TAIL_LINES)) {
      writeOut(`  | ${line}\n`);
    }
    writeOut("  back with the author\n");
  }
  testsPosition(root, target, cap);
  return EXIT_OK;
}

/**
 * The complete suite against the tree the verifier's tests are in, and what
 * its exit code said. No opinion is solicited and none is recorded.
 */
export async function runSuite(args: TargetArgs, root: string): Promise<number> {
  const target = targetOf(args);
  const state = requireState(root, target);
  const step = state.step;
  const cap = runCap(root);
  refuseIfSuiteLoopClosed(root, target, state, cap);
  // The same judge the log is read back through, applied before the suite
  // runs rather than after it has already been paid for.
  validateTransition(state, { event: "suite-run", target, step });

  const config = loadConfig(undefined, String(root));
  const authored = [...state.testsAuthored];
  let selection;
  let runs: CheckRun[];
  try {
    selection = fixloop.selectionFor(config);
    runs = await sources.runSuite(root, config, authored);
  } catch (error) {
    if (error instanceof fixloop.FixLoopError) throw new WorkflowError(error.message);
    throw error;
  }

  // Every suite's output, in order. A fix round reads all of it: a failure in
  // the second ecosystem is not less of a failure for arriving second.
  const output = runs.map((r) => r.output || "").join("\n");
  const failing = fixloop.failures(output, selection, root);
  // Filed verbatim: the fix round reads this, and a summary is not a record
  // of what a runner said.
  const filed = fileReview(root, target, step, [output], "suite");
  append(root, {
    event: "suite-run",
    target,
    step,
    tests: authored,
    failures: failing.map((f) => ({ name: f.name, path: f.path })),
    records: filed,
    ...runRows(runs),
  });
  tryWriteProjection(root);

  printRuns(target, step, runs);
  for (const failure of failing) writeOut(`  failed ${failure.name}\n`);
  if (!runs.every((r) => checkRunGreen(r)) && failing.length === 0) {
    writeOut(
      "  the run failed and named no test this parser recognised, so no fix " +
        "round can be scoped to a failure\n",
    );
  }
  for (const path of filed) writeOut(`  filed ${path}\n`);
  suitePosition(root, target, cap);
  return EXIT_OK;
}

/**
 * What the failing run said, read back from the file it was filed to.
 *
 * The event carries the path rather than the text. A run's output is
 * unbounded and the log is read whole on every fold; the fix round is the
 * only reader that needs the bytes.
 */
function lastSuiteOutput(event: Record<string, unknown>): string {
  for (const path of (event.records ?? []) as string[]) {
    try {
      return readText(path);
    } catch {
      continue;
    }
  }
  return "";
}

export interface FixArgs extends TargetArgs {
  readonly base: string;
  readonly transport?: string | null;
}

/**
 * One fix round, confined to the envelope. The framework decides what may be
 * written; the prompt only describes what it decided.
 */
export async function runFix(args: FixArgs, root: string): Promise<number> {
  const target = targetOf(args);
  const state = requireState(root, target);
  const step = state.step;
  const cap = runCap(root);
  refuseIfSuiteLoopClosed(root, target, state, cap);
  validateTransition(state, { event: "fixed", target, step });

  const config = loadConfig(undefined, String(root));
  const last = state.lastSuiteRun as Record<string, unknown>;
  const output = lastSuiteOutput(last);
  let round: fixloop.FixRound;
  let raw: string;
  let envelope: fixloop.Envelope;
  let failing: fixloop.Failure[];
  try {
    const selection = fixloop.selectionFor(config);
    failing = fixloop.failures(output, selection, root);
    envelope = fixloop.buildEnvelope(root, args.base, output, selection);
    [round, raw] = await fixloop.fix(root, config, {
      failing,
      output,
      envelope,
      transport: args.transport ?? null,
    });
  } catch (error) {
    if (error instanceof fixloop.FixLoopError) throw new WorkflowError(error.message);
    throw error;
  }

  const filed = fileReview(root, target, step, [raw], "fix");
  append(root, {
    event: "fixed",
    target,
    step,
    failures: failing.map((f) => f.name),
    envelope: fixloop.envelopeRow(envelope),
    fixer: fixloop.fixRow(round),
    written: fixloop.fixWritten(round),
    // Recorded and acted on by nobody. An erased observation leaves nothing a
    // human can overrule.
    observations: [...round.observations],
    records: filed,
    simulated: round.simulated,
  });
  tryWriteProjection(root);

  if (round.simulated) {
    writeOut("  SCRIPTED FIX — served from a response file, not a vendor.\n");
  }
  writeOut(
    `${target} — ${STEP_TITLES[step]}: fix round by ` +
      `${round.model}/${round.provider}\n`,
  );
  writeOut(
    `  envelope: ${fixloop.envelopePaths(envelope).length} path(s), ` +
      `${envelope.implicated.length} implicated by the failures\n`,
  );
  for (const write of round.writes) {
    if (writeAccepted(write)) {
      writeOut(`  ${write.action} ${write.path} (${write.bytesWritten} bytes)\n`);
    } else {
      writeOut(`  refused ${write.path}: ${write.reason}\n`);
    }
  }
  for (const note of round.observations) {
    writeOut(`  observed (not acted on): ${note.slice(0, 160)}\n`);
  }
  for (const path of filed) writeOut(`  filed ${path}\n`);
  writeOut(
    "  run `workflow suite` again: what a fix proves is the next run, not " +
      "the fix\n",
  );
  return EXIT_OK;
}
