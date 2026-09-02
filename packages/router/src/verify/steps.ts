// Step execution: the session's approved plan, one step at a time, at a
// granularity below the round.
//
// A step is in flight or it is not, exactly one at a time, and
// `step-execution.jsonl` says which. A step answers for its own work and no
// one else's: its change set starts at the snapshot the previous step closed
// on, or at the commit the session opened on when it is the first. A closed
// step's work stays in the working tree until the session commits, so
// anchoring every step to that commit would charge each one for its
// predecessors -- and dropping those paths by name instead would let a later
// step edit them again, outside its own envelope, unremarked.
//
// The order is the economy. Git decides whether the work stayed inside the
// declared envelope, and a path outside it is refused as an amendment
// requirement rather than reported as a warning -- an envelope nothing
// enforces is a comment. Then the declared controls and the step's own
// targeted tests run, free, and a red one returns to the author. Only what
// survives both is worth a model.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { loadSelectionConfig, selectTests, targetedCommand } from "../affected.ts";
import {
  PlanImmutableError,
  PlanIntegrityError,
  compareToEnvelope,
  effectivePlan,
  findStep,
  needsAmendment,
  planPath,
  readPlan,
  type EnvelopeComparison,
  type Plan,
} from "../approvedPlan.ts";
import { writeErr, writeOut } from "../output.ts";
import { loadConfig, type RouterConfig } from "../config.ts";
import {
  SESSION_PLAN_FILENAME,
  repoRootFor,
  runGit,
  snapshotWorktreeTree,
} from "../evidence.ts";
import {
  KIND_TESTS,
  STATUS_NOT_APPLICABLE,
  collectControlFacts,
  controlFact,
  controlFactToDict,
  controlSpec,
  factRecord,
  loadControlsChecked,
  redFactsRefusal,
  runControl,
  type ControlFact,
} from "../facts.ts";
import { nowIso } from "../journal.ts";
import {
  LedgerError,
  STEP_EVENT_CLOSED,
  STEP_EVENT_OPENED,
  STEP_SCHEMA_VERSION,
  appendStepEvent,
  closedStepIds,
  lastClosedTree,
  openStep,
  openStepsInRepo,
  sessionRunDir,
  type Row,
} from "../ledger.ts";
import { PlanReviewError, reviewAmendment } from "../planReview.ts";
import { readSessionState } from "../progress.ts";
import { pythonRepr } from "../pythonJson.ts";
import { loadSuitesChecked } from "../testEvidence.ts";
import {
  EXIT_BLOCKING,
  EXIT_CALL_FAILED,
  EXIT_OK,
  EXIT_USAGE,
  StepRefusal,
  refusalCode,
} from "./errors.ts";
import { headCommit } from "./rounds.ts";

function stepCommand(verb: string, sessionsDir: string, suffix = ""): string {
  return (
    `dabbler verify step ${verb} --sessions-dir ` +
    `${sessionsDir}${suffix}`
  );
}

function stepSession(sessionsDir: string): readonly [string, number] {
  const repoRoot = repoRootFor(sessionsDir);
  if (repoRoot === null) {
    throw new StepRefusal(`not inside a git repository: ${sessionsDir}`);
  }
  const current = (readSessionState(sessionsDir) ?? {})["currentSession"] as
    | number
    | null
    | undefined;
  if (current === null || current === undefined) {
    throw new StepRefusal(
      `no session is in flight under ${sessionsDir}; register the session ` +
        "first:\n" +
        `  dabbler session start --sessions-dir ${sessionsDir}` +
        " --engine <engine> --provider <provider>",
    );
  }
  return [repoRoot, current];
}

function approvedPlanFor(
  repoRoot: string,
  _sessionsDir: string,
  sessionNumber: number,
): Plan {
  if (!existsSync(planPath(repoRoot, sessionNumber))) {
    throw new StepRefusal(
      `session ${sessionNumber} has no plan. A step executes ` +
        "against a plan pre-registered and approved before the code was " +
        "seen; there is nothing to execute without one.",
    );
  }
  let plan: Plan;
  try {
    plan = readPlan(sessionRunDir(repoRoot, sessionNumber));
  } catch (error) {
    if (error instanceof PlanIntegrityError || error instanceof Error) {
      throw new StepRefusal((error as Error).message);
    }
    throw error;
  }
  if (!plan["approved"]) {
    throw new StepRefusal(
      `the plan for session ${sessionNumber} is not approved. ` +
        "An unapproved plan is still being written, and an envelope that " +
        "can still move measures nothing.",
    );
  }
  return plan;
}

function baselineTreeOf(repoRoot: string, commit: string): string {
  const result = runGit(repoRoot, ["rev-parse", `${commit}^{tree}`]);
  const tree = (result.stdout || "").trim();
  if (result.code !== 0 || !tree) {
    throw new StepRefusal(
      `git could not resolve the tree of ${commit.slice(0, 12)}, the commit ` +
        "this step opened against; the step's own change set cannot be " +
        "measured.",
      EXIT_CALL_FAILED,
    );
  }
  return tree;
}

function envelopeRefusal(
  sessionsDir: string,
  stepId: string,
  comparison: EnvelopeComparison,
  note = "",
): string {
  if (!comparison.measured) {
    return (
      `step ${pythonRepr(stepId)} cannot be closed -- ${comparison.unmeasuredReason}` +
      '. An unmeasurable change set is never "inside the plan".'
    );
  }
  const rows = comparison.outside
    .map((item) => `  ${item.path}  (${item.reason})`)
    .join("\n");
  return (
    `step ${pythonRepr(stepId)} wrote outside its declared envelope:\n${rows}\n` +
    (note ? `${note}\n` : "") +
    "This is an amendment requirement, not a warning. The envelope was " +
    "declared before the code was seen, and widening it after the fact " +
    "without a record is how a plan stops meaning anything. Either move " +
    "the change back inside the envelope, or amend the plan -- the " +
    "amendment carries the widening and is re-reviewed against the risk " +
    "the wider envelope earns:\n" +
    `  ${stepCommand("amend", sessionsDir)} --add-file <path> --reason ` +
    '"<why the envelope was wrong>"'
  );
}

/**
 * The declared controls plus the step's own targeted tests, run here rather
 * than recorded by their author.
 *
 * Pre-verification asks the author to run and record; a step does not,
 * because the framework is what closes it and a fact it collected itself
 * needs no evidence protocol to be trusted.
 *
 * Every declaration is read before anything runs. A misdeclared suite or
 * selection rule narrows what the pass executes without saying so, and a
 * green row from a pass that silently skipped the step's tests is worse than
 * no row -- so the errors come back with nothing run.
 */
export function stepDeterministicFacts(
  repoRoot: string,
  config: RouterConfig,
  changedPaths: readonly string[],
): { controls: readonly ControlFact[]; errors: readonly string[] } {
  const selection = loadSelectionConfig(config);
  const suites = loadSuitesChecked(config);
  const errors = [
    ...loadControlsChecked(config).errors,
    ...selection.errors,
    ...suites.errors,
  ];
  if (errors.length > 0) return { controls: [], errors };

  let controls: ControlFact[] = [...collectControlFacts(repoRoot, config).facts];
  const result = selectTests(repoRoot, changedPaths, selection.config);
  for (const suite of suites.suites) {
    const command = targetedCommand(suite.command, result.forSuite(suite.name), {
      runsWhole: suite.runsWhole,
    });
    if (!command) {
      controls = [
        ...controls,
        controlFact(
          KIND_TESTS,
          STATUS_NOT_APPLICABLE,
          "",
          false,
          `${suite.name}: this step's paths map to no test`,
        ),
      ];
      continue;
    }
    controls = [
      ...controls,
      runControl(repoRoot, controlSpec(KIND_TESTS, command, true)),
    ];
  }
  return { controls, errors: [] };
}

function declarationRefusal(errors: readonly string[]): string {
  const rows = errors.map((error) => `  ${error}`).join("\n");
  return (
    "the deterministic pass cannot be trusted to have run this step's " +
    `evidence -- its declarations do not parse:\n${rows}\n` +
    "A dropped suite and no suite at all look identical once the pass " +
    "has finished, so a step does not close on a declaration nobody " +
    "could read. Fix the declaration in router-config.yaml and close " +
    "the step again."
  );
}

/** Put one plan step in flight, anchored to the commit it opens on. */
export function runStepOpen(sessionsDir: string, stepId: string): number {
  let step: Row;
  let baseCommit: string;
  try {
    const [repoRoot, current] = stepSession(sessionsDir);
    const plan = approvedPlanFor(repoRoot, sessionsDir, current);

    const inFlight = openStep(repoRoot, current);
    if (inFlight !== null) {
      throw new StepRefusal(
        `step ${pythonRepr(inFlight["step_id"])} is already in flight. Two ` +
          "open steps share one working tree, and neither one's diff " +
          "is then its own. Close it first:\n" +
          `  ${stepCommand("close", sessionsDir)}`,
        EXIT_USAGE,
      );
    }
    const found = findStep(plan, stepId);
    if (found === null) {
      const declared = (effectivePlan(plan)["steps"] as Row[])
        .map((entry) => String(entry["step_id"]))
        .join(", ");
      throw new StepRefusal(
        `step ${pythonRepr(stepId)} is not declared in the approved plan for ` +
          `session ${current}. The plan declares: ${declared}.`,
        EXIT_USAGE,
      );
    }
    step = found;
    if (closedStepIds(repoRoot, current).includes(stepId)) {
      throw new StepRefusal(
        `step ${pythonRepr(stepId)} is already closed. A step executes once: ` +
          "re-opening one would put a second change against an " +
          "envelope that was reviewed for the first.",
        EXIT_USAGE,
      );
    }
    const head = headCommit(repoRoot);
    if (head === null) {
      throw new StepRefusal(
        "git could not resolve HEAD, so the step has nothing to " +
          "anchor its change set to.",
        EXIT_CALL_FAILED,
      );
    }
    baseCommit = head;
    appendStepEvent(repoRoot, current, {
      schema_version: STEP_SCHEMA_VERSION,
      event: STEP_EVENT_OPENED,
      recorded_at: nowIso("microseconds"),
      session_number: current,
      step_id: stepId,
      base_commit: baseCommit,
    });
  } catch (error) {
    if (!(error instanceof StepRefusal) && !(error instanceof LedgerError)) throw error;
    writeErr(`verify step open: ${(error as Error).message}\n`);
    return refusalCode(error);
  }

  const envelope = (step["file_envelope"] as string[])
    .map((path) => `  ${path}`)
    .join("\n");
  const contract = (step["evidence_contract"] as Row[])
    .map((item) => `  [${String(item["kind"])}] ${String(item["description"])}`)
    .join("\n");
  writeOut(
    `step open: ${stepId} is in flight, anchored to ` +
      `${baseCommit.slice(0, 12)}.\n` +
      `${String(step["intent"])}\n` +
      `Envelope -- nothing outside these paths:\n${envelope}\n` +
      `Evidence contract:\n${contract}\n` +
      `When the work is done:\n  ${stepCommand("close", sessionsDir)}\n`,
  );
  return EXIT_OK;
}

/**
 * Close the step in flight: the envelope first, then the deterministic
 * evidence, and neither costs a model call.
 */
export function runStepClose(sessionsDir: string): number {
  let stepId: string;
  let comparison: EnvelopeComparison;
  let controls: readonly ControlFact[];
  try {
    const [repoRoot, current] = stepSession(sessionsDir);
    const stepRow = openStep(repoRoot, current);
    if (stepRow === null) {
      throw new StepRefusal(
        `no step is in flight for session ${current}. Open ` +
          "one:\n" +
          `  ${stepCommand("open", sessionsDir, " --step <step_id>")}`,
        EXIT_USAGE,
      );
    }
    stepId = String(stepRow["step_id"]);
    const baseCommit = String(stepRow["base_commit"]);
    const plan = approvedPlanFor(repoRoot, sessionsDir, current);

    const head = headCommit(repoRoot);
    if (head !== baseCommit) {
      throw new StepRefusal(
        `HEAD moved from ${baseCommit.slice(0, 12)} to ` +
          `${(head ?? "(unknown)").slice(0, 12)} while step ${pythonRepr(stepId)} was ` +
          "open. The step's envelope comparison and its deterministic " +
          "evidence are both measured against the commit it opened on, " +
          "so a commit landed mid-step leaves them describing someone " +
          "else's change. Put the work back in the working tree " +
          `(git reset --soft ${baseCommit.slice(0, 12)}) and close the step ` +
          "again. The framework commits a step, and only once its " +
          "evidence is satisfied.",
        EXIT_BLOCKING,
      );
    }

    const baselineTree =
      (lastClosedTree(repoRoot, current) as string | null) ??
      baselineTreeOf(repoRoot, baseCommit);
    comparison = compareToEnvelope(repoRoot, plan, sessionsDir, baselineTree, stepId);
    if (needsAmendment(comparison)) {
      throw new StepRefusal(
        envelopeRefusal(sessionsDir, stepId, comparison),
        EXIT_BLOCKING,
      );
    }

    const config = loadConfig();
    const collected = stepDeterministicFacts(repoRoot, config, comparison.inside);
    if (collected.errors.length > 0) {
      throw new StepRefusal(declarationRefusal(collected.errors), EXIT_BLOCKING);
    }
    controls = collected.controls;
    const refusal = redFactsRefusal(
      factRecord({ controls }),
      "verify step close",
    );
    if (refusal) {
      writeErr(`${refusal}\n`);
      return EXIT_BLOCKING;
    }

    // The controls and tests just ran against this working tree, and a
    // compile, an analyzer or a test run that drops an artifact writes to it
    // like anything else. Measure again before the snapshot becomes the next
    // step's baseline: a path checked only before the commands ran would let
    // their output into the record unremarked, and the next step would
    // inherit it as already-accounted-for.
    comparison = compareToEnvelope(repoRoot, plan, sessionsDir, baselineTree, stepId);
    if (needsAmendment(comparison)) {
      throw new StepRefusal(
        envelopeRefusal(
          sessionsDir,
          stepId,
          comparison,
          "These appeared while the step's own deterministic " +
            "commands ran, so the write is theirs rather than " +
            "yours -- declare the artifact, or stop the command " +
            "writing it into the repository.",
        ),
        EXIT_BLOCKING,
      );
    }

    const closedTree = snapshotWorktreeTree(repoRoot);
    if (closedTree === null) {
      throw new StepRefusal(
        "git could not snapshot the working tree, so this step " +
          "cannot record where it ended and the next step would have " +
          "no baseline to be measured from.",
        EXIT_CALL_FAILED,
      );
    }
    appendStepEvent(repoRoot, current, {
      schema_version: STEP_SCHEMA_VERSION,
      event: STEP_EVENT_CLOSED,
      recorded_at: nowIso("microseconds"),
      session_number: current,
      step_id: stepId,
      base_commit: baseCommit,
      closed_tree: closedTree,
      envelope: {
        inside: [...comparison.inside],
        outside: comparison.outside.map((item) => item.path),
      },
      deterministic: controls.map(controlFactToDict),
    });
  } catch (error) {
    if (!(error instanceof StepRefusal) && !(error instanceof LedgerError)) throw error;
    writeErr(`verify step close: ${(error as Error).message}\n`);
    return refusalCode(error);
  }

  const rows = controls
    .map(
      (fact) =>
        `  ${fact.kind.padEnd(10)} ${fact.status.padEnd(15)} ${fact.command}`,
    )
    .join("\n");
  writeOut(
    `step close: ${stepId} closed. ${comparison.inside.length} path(s) ` +
      `changed, all inside the declared envelope.\n${rows}\n`,
  );
  return EXIT_OK;
}


/** What is in flight, what is done, and what is left. */
export function runStepStatus(sessionsDir: string): number {
  let plan: Plan;
  let inFlight: Row | null;
  let done: unknown[];
  try {
    const [repoRoot, current] = stepSession(sessionsDir);
    plan = approvedPlanFor(repoRoot, sessionsDir, current);
    inFlight = openStep(repoRoot, current);
    done = closedStepIds(repoRoot, current);
  } catch (error) {
    if (!(error instanceof StepRefusal) && !(error instanceof LedgerError)) throw error;
    writeErr(`verify step status: ${(error as Error).message}\n`);
    return refusalCode(error);
  }

  for (const step of effectivePlan(plan)["steps"] as Row[]) {
    const stepId = String(step["step_id"]);
    let mark = "     ";
    if (inFlight !== null && inFlight["step_id"] === stepId) mark = "OPEN ";
    else if (done.includes(stepId)) mark = "done ";
    writeOut(`  ${mark} ${stepId}  ${String(step["intent"])}\n`);
  }
  if (inFlight === null) {
    writeOut(
      `No step is in flight. ` +
        `${stepCommand("open", sessionsDir, " --step <step_id>")}\n`,
    );
  } else {
    writeOut(
      `Step ${pythonRepr(inFlight["step_id"])} is in flight, anchored to ` +
        `${String(inFlight["base_commit"]).slice(0, 12)}. ` +
        `${stepCommand("close", sessionsDir)}\n`,
    );
  }
  return EXIT_OK;
}

/**
 * The whole spec, not an excerpt: the plan reviewer derives a session's
 * goals by parsing every session heading, so a slice of one session reads as
 * a spec with no sessions in it.
 */
function specText(sessionsDir: string): string {
  try {
    return readFileSync(join(sessionsDir, SESSION_PLAN_FILENAME), "utf8");
  } catch (error) {
    throw new StepRefusal(
      `${sessionsDir}/${SESSION_PLAN_FILENAME} could not be read, so the ` +
        `amendment has ` +
        `nothing to be reviewed against: ${(error as Error).message}`,
    );
  }
}

/**
 * Widen the open step's envelope through the plan reviewer.
 *
 * The amendment carries the widening rather than a note about it, and it is
 * re-reviewed against the risk the wider envelope derives -- so an author
 * cannot amend past the review its own work earns.
 */
export async function runStepAmend(
  sessionsDir: string,
  options: { reason: string; addedFiles?: readonly string[] },
): Promise<number> {
  const addedFiles = options.addedFiles ?? [];
  let stepRow: Row;
  try {
    const [repoRoot, current] = stepSession(sessionsDir);
    const found = openStep(repoRoot, current);
    if (found === null) {
      throw new StepRefusal(
        `no step is in flight for session ${current}; an ` +
          "amendment amends the step that needs it, not the plan at " +
          "large.",
        EXIT_USAGE,
      );
    }
    stepRow = found;
    approvedPlanFor(repoRoot, sessionsDir, current);
    const runDir = sessionRunDir(repoRoot, current);
    let record: Row;
    let plan: Plan | null;
    try {
      [record, plan] = await reviewAmendment(
        runDir,
        specText(sessionsDir),
        current,
        {
          stepId: String(stepRow["step_id"]),
          reason: options.reason,
          addedFiles: [...addedFiles],
          workspaceRoot: repoRoot,
        },
      );
    } catch (error) {
      if (
        error instanceof PlanImmutableError ||
        error instanceof PlanReviewError ||
        error instanceof Error
      ) {
        throw new StepRefusal((error as Error).message, EXIT_USAGE);
      }
      throw error;
    }
    if (plan === null) {
      throw new StepRefusal(
        `the amendment to ${pythonRepr(stepRow["step_id"])} was not approved ` +
          `(${String(record["outcome"])}). The approved plan is unchanged.`,
        EXIT_BLOCKING,
      );
    }
  } catch (error) {
    if (!(error instanceof StepRefusal) && !(error instanceof LedgerError)) throw error;
    writeErr(`verify step amend: ${(error as Error).message}\n`);
    return refusalCode(error);
  }

  writeOut(
    `step amend: ${String(stepRow["step_id"])} amended; the envelope now ` +
      `covers ${addedFiles.join(", ")}.\n` +
      `  ${stepCommand("close", sessionsDir)}\n`,
  );
  return EXIT_OK;
}

/**
 * The pre-commit guard: refuse a manual commit while a step is open.
 *
 * The framework commits a step, after its evidence is satisfied. A commit
 * made while a step is open leaves the step with no diff of its own to be
 * judged by, which is why this is a refusal and not advice.
 */
export function runStepGuardCommit(cwd = "."): number {
  const repoRoot = repoRootFor(cwd);
  if (repoRoot === null) return EXIT_OK;
  let openRows: Row[];
  try {
    openRows = openStepsInRepo(repoRoot);
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    writeErr(`verify step guard-commit: ${error.message}\n`);
    return refusalCode(error);
  }
  if (openRows.length === 0) return EXIT_OK;
  const rows = openRows
    .map(
      (row) =>
        `  ${String(row["step_id"])} (session ${String(row["session_number"])})`,
    )
    .join("\n");
  writeErr(
    "commit refused -- a step is open:\n" +
      `${rows}\n` +
      "The framework commits a step, and it does so once the step's " +
      "evidence is satisfied. Close the step and let it:\n" +
      "  dabbler verify step close\n",
  );
  return EXIT_BLOCKING;
}
