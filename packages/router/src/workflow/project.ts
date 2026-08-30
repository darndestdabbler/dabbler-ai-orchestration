// The projection the Explorer reads: the manifest, joined to live state.
//
// TypeScript renders; Python decides -- and once there is one router, the
// projection is still the seam. The extension never folds the event log
// itself, because two implementations of one rule disagree eventually and the
// disagreement shows up as a wrong status nobody can explain.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { platformNewlines } from "../journal.ts";
import { dumps } from "../pythonJson.ts";
import {
  asDict,
  load as loadSolution,
  ManifestError,
  STEP_TITLES,
  STEPS,
} from "../solution.ts";
import {
  fold,
  projectionPath,
  read,
  type TargetState,
  WorkflowError,
} from "./log.ts";
import {
  reviewCap,
  reviewTerminal,
  runCap,
  runTerminal,
  suiteTerminal,
  TERMINAL_HEADLINES,
} from "./terminal.ts";

type Node = Record<string, unknown>;

/**
 * Publish the loop's position, decided here.
 *
 * The extension is handed the round count, the bound and the terminal token
 * rather than the events, because a second implementation of "has this loop
 * finished" disagrees with the first eventually, and the disagreement shows
 * up as a status nobody can explain.
 */
function projectReviewLoop(
  node: Node,
  root: string,
  state: TargetState | undefined,
  cap: number,
): void {
  const terminal = reviewTerminal(root, state, cap);
  node.reviewRounds = state?.reviewRounds ?? 0;
  node.reviewCap = cap;
  node.reviewTerminal = terminal;
  node.reviewTerminalLabel = terminal ? TERMINAL_HEADLINES[terminal] : null;
}

/** The tests phase's position, on the same terms and for the same reason. */
function projectTestLoop(
  node: Node,
  root: string,
  state: TargetState | undefined,
  cap: number,
): void {
  const terminal = runTerminal(root, state, cap);
  node.testsAuthored = [...(state?.testsAuthored ?? [])];
  node.testRounds = state?.testRounds ?? 0;
  node.testCap = cap;
  node.testTerminal = terminal;
  node.testTerminalLabel = terminal ? TERMINAL_HEADLINES[terminal] : null;
}

/**
 * The complete suite's position, and how many fix rounds it cost.
 *
 * The fix count is published beside the round count because the two answer
 * different questions: how close the loop came to its bound, and how much
 * repair the step needed to get there.
 */
function projectSuiteLoop(
  node: Node,
  root: string,
  state: TargetState | undefined,
  cap: number,
): void {
  const terminal = suiteTerminal(root, state, cap);
  node.suiteRounds = state?.suiteRounds ?? 0;
  node.suiteCap = cap;
  node.fixRounds = state?.fixRounds ?? 0;
  node.suiteTerminal = terminal;
  node.suiteTerminalLabel = terminal ? TERMINAL_HEADLINES[terminal] : null;
}

/** What the Explorer reads: the manifest, joined to live state. */
export function project(root: string): Record<string, unknown> {
  let solution;
  try {
    solution = loadSolution(root);
  } catch (error) {
    if (error instanceof ManifestError) throw new WorkflowError(error.message);
    throw error;
  }

  const state = fold(read(root));
  const cap = reviewCap(root);
  const tcap = runCap(root);
  const doc = asDict(solution);
  const head = doc.solution as Node;
  const solState = state.get("solution");
  head.waitingOn = solState?.waitingOn ?? null;
  head.returns = solState?.returns ?? 0;
  head.reviewers = solState?.reviewers ?? [];
  head.findings = solState?.findings ?? [];
  projectReviewLoop(head, root, solState, cap);
  projectTestLoop(head, root, solState, tcap);
  projectSuiteLoop(head, root, solState, tcap);
  if (solState?.step) {
    head.step = solState.step;
    head.stepTitle = STEP_TITLES[solState.step];
    head.stepNumber = STEPS.indexOf(solState.step) + 1;
  }

  const components = doc.components as Node[];
  for (const c of components) {
    const cs = state.get(String(c.name));
    if (cs?.step) {
      c.step = cs.step;
      c.stepTitle = STEP_TITLES[cs.step];
      c.stepNumber = STEPS.indexOf(cs.step) + 1;
    }
    c.waitingOn = cs?.waitingOn ?? null;
    c.returns = cs?.returns ?? 0;
    c.reviewed = cs?.reviewed ?? false;
    c.approved = cs?.approved ?? false;
    c.reviewers = cs?.reviewers ?? [];
    c.findings = cs?.findings ?? [];
    projectReviewLoop(c, root, cs, cap);
    projectTestLoop(c, root, cs, tcap);
    projectSuiteLoop(c, root, cs, tcap);
  }

  const waiting = components
    .filter((c) => c.waitingOn === "developer")
    .map((c) => c.name);
  if (head.waitingOn === "developer") waiting.unshift(head.name);
  doc.needsYou = waiting;
  return doc;
}

/** Publish the projection the extension renders. */
export function writeProjection(root: string): string {
  const path = projectionPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    platformNewlines(`${dumps(project(root), { indent: 2 })}\n`),
    { encoding: "utf8" },
  );
  return path;
}

/**
 * Write the projection, or leave the event that was just recorded standing.
 *
 * A manifest problem must not swallow an event that is already on the log;
 * `status` surfaces the manifest error plainly when someone asks for it.
 */
export function tryWriteProjection(root: string): void {
  try {
    writeProjection(root);
  } catch (error) {
    if (error instanceof WorkflowError || error instanceof ManifestError) return;
    throw error;
  }
}
