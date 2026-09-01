// The six-step driver's record: where work is, and every time it moved.
//
// State is folded from an append-only event log rather than stored, so "how
// did this get here" is always answerable and no field can be quietly
// corrected.
//
// **Going backwards is ordinary.** There is no seventh step for it. Every
// step can return work to an earlier one, and `returned` events are
// first-class: they carry the reason and name the components affected. A
// process that models only forward motion is one people work around the
// moment reality disagrees with it.
//
// **The log is judged, not merely recorded.** One `validateTransition`
// decides whether a move is legal and both the writer and the reader call it,
// so an impossible move cannot be written and one that arrived by some other
// route cannot be read back as history.
//
// **The bound binds the writer, not the reader.** `validateTransition` does
// not refuse a round for being over the cap: an operator who lowers the cap
// would otherwise make yesterday's log unreadable, and a record the machine
// cannot read back is the failure this log exists to prevent.

import { appendFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { platformNewlines } from "../journal.ts";
import { dumps, pythonStr } from "../pythonJson.ts";
import { APPROVAL_STEPS, STEP_TITLES, STEPS } from "../solution.ts";
import { readText } from "../textfile.ts";

export const EXIT_OK = 0;
export const EXIT_REFUSED = 1;

export const LOG_RELPATH = join(".dabbler", "solution", "events.jsonl");
export const PROJECTION_RELPATH = join(".dabbler", "solution", "projection.json");
export const REVIEWS_RELDIR = join(".dabbler", "solution", "reviews");

export const EVENTS: readonly string[] = [
  "entered",
  "reviewed",
  "approved",
  "returned",
  "contract-changed",
  "tests-authored",
  "tested",
  "suite-run",
  "fixed",
];

export const SCOPES: readonly string[] = ["solution", "component"];

/**
 * How much of a red run's output the loop echoes. Enough to name what failed;
 * the whole run is in the record either way.
 */
export const TEST_OUTPUT_TAIL_LINES = 40;

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

/** One row of the log. Open-ended: a reader takes the keys it knows. */
export type WorkflowEvent = Record<string, unknown>;

/** A target's folded position, and what it is waiting on. */
export interface TargetState {
  step: string;
  reviewed: boolean;
  approved: boolean;
  returns: number;
  history: WorkflowEvent[];
  waitingOn: string | null;
  findings: unknown[];
  reviewers: unknown[];
  reviewRounds: number;
  lastLiveReview: WorkflowEvent | null;
  reviewWaitingOn: string | null;
  testsAuthored: string[];
  testRounds: number;
  lastTestRun: WorkflowEvent | null;
  suiteRounds: number;
  lastSuiteRun: WorkflowEvent | null;
  fixRounds: number;
}

export function logPath(root: string): string {
  return join(root, LOG_RELPATH);
}

export function projectionPath(root: string): string {
  return join(root, PROJECTION_RELPATH);
}

export function reviewsDir(root: string): string {
  return join(root, REVIEWS_RELDIR);
}

/** `datetime.now(timezone.utc).isoformat(timespec="seconds")`. */
export function now(): string {
  return `${new Date().toISOString().slice(0, 19)}+00:00`;
}

function stepIndex(step: unknown, where: string): number {
  const index = typeof step === "string" ? STEPS.indexOf(step) : -1;
  if (index < 0) {
    // `pythonStr` because an event with no `step` reaches here, and the
    // refusal a reader diffs says `None` on both sides or it says nothing.
    throw new WorkflowError(
      `${where}: '${pythonStr(step)}' is not one of ${STEPS.join(", ")}`,
    );
  }
  return index;
}

function truthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (value === "" || value === 0) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/**
 * The one judge of whether a move is legal -- on the write side and the read
 * side both.
 *
 * `append` calls it so an impossible move is never written, and `fold` calls
 * it so an impossible move that reached the file by some other route cannot
 * be read back as history. A log the writer guards and the reader trusts is a
 * log that can be edited by hand.
 *
 * `state` is the folded state of this event's target, or `null` when the
 * target has no history yet. A target with no history has not entered
 * anything, so its first `entered` event is held to the first step: a log
 * that may open at any step is a target recorded at the end with no history
 * of getting there.
 */
export function validateTransition(
  state: TargetState | null | undefined,
  event: WorkflowEvent,
): void {
  const kind = event.event;
  if (typeof kind !== "string" || !EVENTS.includes(kind)) {
    throw new WorkflowError(`unknown event '${pythonStr(kind)}'`);
  }

  const target = truthy(event.target) ? String(event.target) : "solution";
  const current = state?.step ?? STEPS[0];
  const currentIndex = stepIndex(current, `${target}: current step`);

  if (kind === "entered") {
    const to = event.step;
    const toIndex = stepIndex(to, `${target}: entered`);
    if (state === null || state === undefined) {
      if (toIndex !== 0) {
        throw new WorkflowError(
          `${target}: cannot begin at ${STEP_TITLES[String(to)]} — work ` +
            `begins at ${STEP_TITLES[STEPS[0]]} ('${STEPS[0]}') and ` +
            `reaches ${STEP_TITLES[String(to)]} one step at a time. The ` +
            "manifest's `step:` says where a target is shown before it has " +
            "a log; it does not open one partway through.",
        );
      }
      return;
    }
    if (toIndex < currentIndex) {
      throw new WorkflowError(
        `${target}: cannot enter ${STEP_TITLES[String(to)]} from ` +
          `${STEP_TITLES[current]} — entering only moves forward. Going ` +
          `back is \`send-back --to ${String(to)} --reason ...\`, which ` +
          "records why it went back and what else it affects.",
      );
    }
    if (toIndex > currentIndex + 1) {
      const next = STEPS[currentIndex + 1];
      throw new WorkflowError(
        `${target}: cannot enter ${STEP_TITLES[String(to)]} from ` +
          `${STEP_TITLES[current]} — steps are entered in order and the ` +
          `next one is ${STEP_TITLES[next]} ('${next}'). A skipped step is ` +
          "work nobody did and nobody reviewed.",
      );
    }
    return;
  }

  if (kind === "returned") {
    const to = event.toStep;
    const toIndex = stepIndex(to, `${target}: returned`);
    if (toIndex >= currentIndex) {
      throw new WorkflowError(
        `${target}: cannot return to ${STEP_TITLES[String(to)]} from ` +
          `${STEP_TITLES[current]} — a return moves work backwards, and ` +
          "forward is `enter`.",
      );
    }
    return;
  }

  if (kind === "approved") {
    if (!APPROVAL_STEPS.includes(current)) {
      throw new WorkflowError(
        `${target}: ${STEP_TITLES[current]} is not a step a developer signs ` +
          "off. The approval steps are " +
          `${APPROVAL_STEPS.map((s) => STEP_TITLES[s]).join(", ")}.`,
      );
    }
    if (!state?.reviewed) {
      throw new WorkflowError(
        `${target}: nothing live has been reviewed at ${STEP_TITLES[current]}, ` +
          "so there is no reading to approve over. A scripted review does " +
          "not count as one.",
      );
    }
    return;
  }

  const step = event.step;
  if (step !== undefined && step !== null) {
    stepIndex(step, `${target}: ${kind}`);
    if (String(step) !== current) {
      throw new WorkflowError(
        `${target}: a '${kind}' event names ${STEP_TITLES[String(step)]} but ` +
          `the work is at ${STEP_TITLES[current]}. An event about a step the ` +
          "work is not in is an event about other work.",
      );
    }
  }

  if (kind === "tested" && !truthy(state?.testsAuthored)) {
    throw new WorkflowError(
      `${target}: no test has been authored at ${STEP_TITLES[current]}, so ` +
        "there is nothing here the verifier wrote. The tests phase runs " +
        "tests the author did not write — a run of the author's own tests " +
        "recorded as this phase would prove the one thing the split exists " +
        "to stop it proving. Run `workflow author-tests` first.",
    );
  }

  if (kind === "suite-run" && !truthy(state?.testsAuthored)) {
    throw new WorkflowError(
      `${target}: no test has been authored at ${STEP_TITLES[current]}, so ` +
        "this would be the suite as it stood before the verifier read " +
        "anything. The complete suite runs against the tree including the " +
        "tests it wrote. Run `workflow author-tests` first.",
    );
  }

  if (kind === "fixed") {
    const last = state?.lastSuiteRun ?? null;
    if (!truthy(last) || truthy(last?.green)) {
      throw new WorkflowError(
        `${target}: no failing suite run at ${STEP_TITLES[current]}, so this ` +
          "round would have no named failure to answer. A fix round without " +
          "one is a model invited to revise whatever it notices, which is " +
          "the one thing the envelope exists to prevent. Run `workflow " +
          "suite` first.",
      );
    }
  }
}

/** Machine-written only. Never edited, never corrected in place. */
export function append(root: string, event: WorkflowEvent): WorkflowEvent {
  const target = truthy(event.target) ? String(event.target) : "solution";
  validateTransition(fold(read(root)).get(target) ?? null, event);
  const path = logPath(root);
  mkdirSync(dirname(path), { recursive: true });
  const written: WorkflowEvent = { ...event };
  if (written.at === undefined) written.at = now();
  appendFileSync(path, platformNewlines(`${dumps(written, { sortKeys: true })}\n`), {
    encoding: "utf8",
  });
  return written;
}

export function read(root: string): WorkflowEvent[] {
  const path = logPath(root);
  let isFile = false;
  try {
    isFile = statSync(path).isFile();
  } catch {
    isFile = false;
  }
  if (!isFile) return [];
  const out: WorkflowEvent[] = [];
  const lines = readText(path).split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as WorkflowEvent);
    } catch (error) {
      throw new WorkflowError(
        `${path}:${i + 1} is not valid JSON: ${(error as Error).message}`,
      );
    }
  }
  return out;
}

function newState(): TargetState {
  return {
    step: STEPS[0],
    reviewed: false,
    approved: false,
    returns: 0,
    history: [],
    waitingOn: null,
    findings: [],
    reviewers: [],
    reviewRounds: 0,
    lastLiveReview: null,
    reviewWaitingOn: null,
    testsAuthored: [],
    testRounds: 0,
    lastTestRun: null,
    suiteRounds: 0,
    lastSuiteRun: null,
    fixRounds: 0,
  };
}

/**
 * Start this target's tests phase and its suite loop over.
 *
 * Called wherever the work moves, and nowhere else. Tests authored against
 * what the last step produced answer for that step, so carrying them forward
 * would run yesterday's proof against today's code and read the result as
 * this step's. The suite loop goes with them: it is the same tests, run
 * whole.
 */
function openTestLoop(s: TargetState): void {
  s.testsAuthored = [];
  s.testRounds = 0;
  s.lastTestRun = null;
  s.suiteRounds = 0;
  s.lastSuiteRun = null;
  s.fixRounds = 0;
}

/**
 * Whether a `reviewed` event cost anything to produce.
 *
 * The cap exists to stop an unattended loop calling vendors, so a round
 * served entirely from a script is not counted against it -- and a round with
 * one scripted reader and one live one is, because it spent. An event that
 * says neither is counted: a bound a malformed record can decline is not a
 * bound.
 */
export function reachedAVendor(event: WorkflowEvent): boolean {
  if ("live" in event) return Boolean(event.live);
  const reviewers = event.reviewers;
  if (truthy(reviewers)) {
    return (reviewers as Array<Record<string, unknown>>).some((r) => !r.simulated);
  }
  return !(event.simulated ?? false);
}

/** Current state per target, plus what is waiting on a person. */
export function fold(events: readonly WorkflowEvent[]): Map<string, TargetState> {
  const state = new Map<string, TargetState>();
  for (const e of events) {
    const key = truthy(e.target) ? String(e.target) : "solution";
    validateTransition(state.get(key) ?? null, e);
    let s = state.get(key);
    if (s === undefined) {
      s = newState();
      state.set(key, s);
    }
    const kind = String(e.event);
    s.history.push(e);
    if (kind === "entered") {
      if (e.step === s.step) {
        // Re-entering the step the work is already in moves nothing, so it
        // changes nothing. Clearing the review here while the round that
        // produced it still stood left the step unable to be approved (no
        // live review) and unable to be reviewed again (the loop had
        // closed) -- refused twice, for opposite reasons. The event stays in
        // the history; it just is not a move.
        continue;
      }
      s.step = String(e.step);
      s.reviewed = false;
      s.approved = false;
      s.waitingOn = null;
      s.findings = [];
      s.reviewers = [];
      // A step change opens a new loop: the rounds spent on what the last
      // step produced are not spent against this one.
      s.reviewRounds = 0;
      s.lastLiveReview = null;
      s.reviewWaitingOn = null;
      openTestLoop(s);
    } else if (kind === "reviewed") {
      // A scripted review is a rehearsal, not a reading. It is recorded in
      // full and it satisfies nothing a live review satisfies -- the flag was
      // written here and never read, so a response served from a file cleared
      // the same gate two vendors clear.
      s.reviewed = !(e.simulated ?? false);
      s.findings = (e.findings ?? []) as unknown[];
      s.reviewers = (e.reviewers ?? []) as unknown[];
      if (reachedAVendor(e)) {
        s.reviewRounds += 1;
        s.lastLiveReview = e;
      }
      // The gate outranks the block. A step the developer signs off reaches
      // the developer even when the reviewers are still objecting -- that is
      // the whole reason the gate exists. Left the other way round, a
      // reviewer that keeps finding new Major issues holds the work forever
      // and the human who could settle it is never asked.
      if (truthy(e.needsApproval)) {
        s.waitingOn = "developer";
      } else if (e.verdict === "blocked") {
        s.waitingOn = "author";
      } else {
        s.waitingOn = null;
      }
      // Kept so a green test round can hand the work back to whoever the
      // review left it with, instead of clearing a gate the tests know
      // nothing about.
      s.reviewWaitingOn = s.waitingOn;
    } else if (kind === "approved") {
      s.approved = true;
      s.waitingOn = null;
      s.reviewWaitingOn = null;
    } else if (kind === "returned") {
      s.step = String(e.toStep);
      s.reviewed = false;
      s.approved = false;
      s.returns += 1;
      s.waitingOn = "author";
      s.findings = [];
      s.reviewers = [];
      s.reviewRounds = 0;
      s.lastLiveReview = null;
      s.reviewWaitingOn = "author";
      openTestLoop(s);
    } else if (kind === "tests-authored") {
      // Accumulated, never replaced: a second hand-off adds files, and a file
      // the first round wrote still has to pass.
      s.testsAuthored = [
        ...new Set([...s.testsAuthored, ...((e.written ?? []) as string[])]),
      ].sort();
    } else if (kind === "tested") {
      s.testRounds += 1;
      s.lastTestRun = e;
      // A red run leaves the work with the author. A green one is not an
      // answer about who is waited on: the review's own answer, gate or
      // block, still stands, and clearing it here would make an approval a
      // developer owes disappear because a suite passed.
      s.waitingOn = truthy(e.green) ? s.reviewWaitingOn : "author";
    } else if (kind === "suite-run") {
      s.suiteRounds += 1;
      s.lastSuiteRun = e;
      s.waitingOn = truthy(e.green) ? s.reviewWaitingOn : "author";
    } else if (kind === "fixed") {
      // Counted, not judged. A fix round proves nothing by itself -- the
      // suite run after it does -- but a step that took six fixes to go green
      // reads differently at planning time than one that took one, and the
      // count is what says so.
      s.fixRounds += 1;
    } else if (kind === "contract-changed") {
      s.waitingOn = truthy(e.needsApproval) ? "developer" : null;
    }
  }
  return state;
}

/**
 * The folded state of a target that has begun, or a refusal.
 *
 * Reviewing work that has not entered a step records a verdict about nothing,
 * so every caller that needs the target's position comes through here and
 * gets the same refusal.
 */
export function requireState(root: string, target: string): TargetState {
  const state = fold(read(root)).get(target);
  if (state === undefined) {
    throw new WorkflowError(
      `'${target}' has not entered a step yet. Run \`workflow enter <step>\` ` +
        "first — reviewing work that has not begun records a verdict about " +
        "nothing.",
    );
  }
  return state;
}

/**
 * Where the target is now, per the log. A review is of the step the work is
 * actually in, never of a step named on the command line -- a caller who can
 * name the step can review the wrong one and file it as the right one.
 */
export function currentStep(root: string, target: string): string {
  return requireState(root, target).step;
}

/**
 * Write each model's reply verbatim. A summary is not a record, and a finding
 * -- or a test file -- that only exists as someone's paraphrase cannot be
 * re-read.
 */
export function fileReview(
  root: string,
  target: string,
  step: string,
  raws: readonly string[],
  kind = "",
): string[] {
  const outDir = reviewsDir(root);
  mkdirSync(outDir, { recursive: true });
  const stamp = now().split(":").join("").split("-").join("");
  const stem = `${target}-${step}${kind ? `-${kind}` : ""}`;
  const written: string[] = [];
  for (let i = 0; i < raws.length; i += 1) {
    const path = join(outDir, `${stem}-${stamp}-r${i + 1}.md`);
    writeFileSync(path, platformNewlines(raws[i]), { encoding: "utf8" });
    written.push(path);
  }
  return written;
}
