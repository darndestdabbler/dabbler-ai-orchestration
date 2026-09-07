// Checking an approved plan before it becomes one: free mechanical checks
// first, then a cheap model against a fixed checklist.
//
// The order is the whole economy of this module. The mechanical checks cost
// nothing and settle a round on their own, so a plan with a missing goal or
// undrived risk flags never reaches a model. Only a plan that survives them is
// worth paying to read, and then the cheapest model that can do the job reads
// it against fixed text -- not free-form critique -- and answers approve,
// amend, or send it to a human, per step.
//
// Two rules keep a supervisor from resubmitting its way to an approval. A
// revision that does not touch the fields the previous round objected to is
// refused without a model call, by comparing digests the previous round
// recorded. And a plan that has been rejected twice stops being the cheap
// model's problem: it routes to the premium model, as does any plan whose
// derived risk flags say a mistake here is expensive.
//
// Every round lands in `plan-review.jsonl` under the run directory,
// schema-validated and append-only, bound to the exact plan content it judged.
//
// An amendment to an approved plan runs the same machinery, scoped: the free
// checks, the prompt and the verdicts cover the changed step and nothing else.
// Re-approving a step the amendment did not touch would buy an answer the
// record already holds.

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  PlanImmutableError,
  type Plan,
  RISK_DEPENDENCY_CHANGE,
  RISK_SENSITIVE_PATH,
  appendAmendment,
  computePlanHash,
  deriveRiskFlags,
  effectivePlan,
  readPlan,
} from "./approvedPlan.ts";
import { hashBytes } from "./evidence.ts";
import { nowIso, platformNewlines } from "./journal.ts";
import { dumps, pythonRepr } from "./pythonJson.ts";
import { type RouteResult, route } from "./route.ts";
import { allSchemaFailures, loadSchemaFile, schemaFailure } from "./schema/validate.ts";
import { parseSessionPlans, splitSlugMarker } from "./session.ts";
import { readText } from "./textfile.ts";
import { planStepKey } from "./writers.ts";

export const SCHEMA_VERSION = 1;
export const REVIEW_FILENAME = "plan-review.jsonl";

export const OUTCOME_APPROVED = "approved";
export const OUTCOME_AMEND = "amend";
export const OUTCOME_HUMAN = "human";
export const OUTCOME_BOUNCED = "bounced";

export const VERDICT_APPROVE = "approve";
export const VERDICT_AMEND = "amend";
export const VERDICT_HUMAN = "human";
const VERDICTS: ReadonlySet<string> = new Set([
  VERDICT_APPROVE,
  VERDICT_AMEND,
  VERDICT_HUMAN,
]);

/**
 * The fields a reviewer may object to, and therefore the only fields a
 * revision can answer an objection by changing.
 */
export const OBJECTABLE_FIELDS: readonly string[] = [
  "intent",
  "file_envelope",
  "evidence_contract",
];

export const TRIGGER_HIGH_RISK = "high-risk-flag";
export const TRIGGER_REPEAT_OBJECTION = "repeat-objection";

// Only two of the four derived flags route to the premium model. The other two
// -- public-interface and integration-module -- fire on nearly every step in a
// codebase of any size, and a trigger that always fires is not a trigger, it
// is the default. These two are narrow and expensive to get wrong: they mark a
// step reaching for the machinery that decides what a session may do, or for
// the dependency set underneath all of it.
export const HIGH_RISK_FLAGS: ReadonlySet<string> = new Set([
  RISK_SENSITIVE_PATH,
  RISK_DEPENDENCY_CHANGE,
]);

// Two rejected revisions is where the cheap model stops being the right
// reader: it has now failed twice to get an answer it will accept.
export const ESCALATE_AFTER_REJECTIONS = 2;

// The two roles a plan review draws from. The escalated one is a stronger
// reader, not a higher tier: which models fill either role is declared in
// router-config.yaml, and this module only decides which of the two to ask.
export const ROLE_PLAN_REVIEW = "plan-review";
export const ROLE_PLAN_REVIEW_ESCALATED = "plan-review-escalated";

/** The review record could not be read or written as the machine owns it. */
export class PlanReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanReviewError";
  }
}

type Row = Record<string, unknown>;

function schema(): Record<string, unknown> {
  return loadSchemaFile("plan-review.schema.json");
}

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stepsOf(plan: Plan): Row[] {
  const raw = plan["steps"];
  if (!Array.isArray(raw)) return [];
  return raw.map((step) => (isRecord(step) ? step : {}));
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

// --- Goals: the session's own work, never the ceremony around it -------------

// The framework's own lifecycle steps, recognized by the framework rather than
// flagged by a supervisor: a step kind a supervisor sets is a step kind a
// supervisor sets wrong. These six phrases open every session's ceremony rows
// in every spec, and a plan never carries them.
const LIFECYCLE_PATTERNS: readonly RegExp[] = [
  /^register\b/i,
  /^affected[- ]tests?\b/i,
  /^cross-provider verification\b/i,
  /^full test suite\b/i,
  /^close[- ]?out\b/i,
  /^technical\/educational documentation\b/i,
];

/**
 * True for the fixed ceremony every session pays. Those steps have no file
 * envelope and no evidence of their own to declare, so they are not plan steps
 * and are not goals a plan must cover.
 */
export function isLifecycleStep(text: unknown): boolean {
  const cleaned = String(text ?? "")
    .replace(/[*`_]/g, "")
    .trim();
  return LIFECYCLE_PATTERNS.some((pattern) => pattern.test(cleaned));
}

/** One unit of a session's own declared work, as the spec states it. */
export interface Goal {
  readonly key: string;
  readonly text: string;
}

/**
 * The session's non-ceremony steps from `spec.md`, each keyed by the same
 * identity the plan's `step_id` and the activity log's `stepKey` use -- the
 * authored `(slug: xxx)` marker when the step declares one, the six-word
 * truncation when it does not.
 */
export function sessionGoals(specText: string, sessionNumber: number): Goal[] {
  const plan = parseSessionPlans(specText).find((entry) => entry.number === sessionNumber);
  if (plan === undefined) return [];
  const goals: Goal[] = [];
  let ordinal = 0;
  for (const text of plan.steps) {
    ordinal += 1;
    const [cleanText, slug] = splitSlugMarker(text);
    if (isLifecycleStep(cleanText)) continue;
    goals.push({ key: slug ?? planStepKey(cleanText, ordinal), text: cleanText });
  }
  return goals;
}

// --- The free checks ---------------------------------------------------------

export const CHECK_SCHEMA = "schema";
export const CHECK_GOAL_WITHOUT_STEP = "goal-without-step";
export const CHECK_STEP_WITHOUT_GOAL = "step-without-goal";
export const CHECK_ENVELOPE_OMITS_NAMED_FILE = "envelope-omits-named-file";
export const CHECK_RISK_FLAGS_NOT_DERIVED = "risk-flags-not-derived";

export interface Finding {
  readonly check: string;
  readonly detail: string;
  readonly stepId: string | null;
}

export function findingRow(finding: Finding): Row {
  return { check: finding.check, detail: finding.detail, step_id: finding.stepId };
}

// A backticked token that names a file: it carries a path separator or a known
// source/config extension. Prose in backticks (`step_id`, `verify`) is not a
// path and must not be read as one.
const NAMED_FILE = /`([^`\s]+(?:\/[^`\s]+|\.(?:py|ts|js|json|ya?ml|md|toml|cfg))[^`\s]*)`/g;

/**
 * Repo paths the spec names literally in a goal's own wording. A file the spec
 * asks for by name and no envelope declares is the cheapest omission there is
 * to catch.
 */
export function namedFiles(text: unknown): string[] {
  const out: string[] = [];
  for (const match of String(text ?? "").matchAll(NAMED_FILE)) {
    const token = match[1].replace(/[.,;:]+$/, "").replace(/\\/g, "/");
    if (token && !out.includes(token)) out.push(token);
  }
  return out;
}

function envelopeUnion(plan: Plan): Set<string> {
  const paths = new Set<string>();
  for (const step of stepsOf(plan)) {
    for (const path of stringList(step["file_envelope"])) {
      paths.add(path.replace(/\\/g, "/").replace(/^\/+/, ""));
    }
  }
  return paths;
}

/**
 * The schema is the one implementation of "a step declares an evidence
 * contract" and "a step declares a file envelope" -- it refuses both at write
 * time. Here the same schema is asked to *report* rather than raise, so a plan
 * under review is told everything at once instead of one exception at a time.
 * Re-stating those rules as hand-written checks would be a second
 * implementation of a rule that already has one.
 *
 * The message text is `ajv`'s and is not claimed to be `jsonschema`'s (D165);
 * what is claimed is which member is wrong and that the plan is refused.
 */
function schemaFindings(plan: Plan): Finding[] {
  const steps = stepsOf(plan);
  return allSchemaFailures(plan, loadSchemaFile("approved-plan.schema.json")).map(
    (failure) => {
      let stepId: string | null = null;
      const segments = failure.location === "(root)" ? [] : failure.location.split("/");
      if (segments.length >= 2 && segments[0] === "steps") {
        const index = Number(segments[1]);
        if (Number.isInteger(index) && index < steps.length) {
          const value = steps[index]["step_id"];
          stepId = typeof value === "string" ? value : null;
        }
      }
      return {
        check: CHECK_SCHEMA,
        detail: `${failure.location}: ${failure.message}`,
        stepId,
      };
    },
  );
}

/**
 * Every check that costs nothing, run before any model.
 *
 * A non-empty result settles the round on its own: there is no reason to pay a
 * model to read a plan that a free check already refused.
 *
 * `onlySteps` scopes the result to an amendment's changed steps. Findings that
 * name no step -- a plan document that is malformed as a whole -- always
 * survive the scope, because a plan nobody can read is not one step's problem.
 */
export function freeChecks(
  plan: Plan,
  specText: string,
  sessionNumber: number,
  workspaceRoot: string | null = null,
  onlySteps: readonly string[] | null = null,
): Finding[] {
  const findings: Finding[] = [...schemaFindings(plan)];

  const goals = sessionGoals(specText, sessionNumber);
  const steps = stepsOf(plan);
  const stepIds = new Set(
    steps.map((step) => step["step_id"]).filter((id): id is string => Boolean(id)),
  );
  const goalKeys = new Set(goals.map((goal) => goal.key));

  for (const goal of goals) {
    if (!stepIds.has(goal.key)) {
      findings.push({
        check: CHECK_GOAL_WITHOUT_STEP,
        detail:
          `the spec's goal ${pythonRepr(goal.key)} has no step in the plan: ` +
          `${pythonRepr(goal.text.slice(0, 120))}`,
        stepId: goal.key,
      });
    }
  }

  for (const step of steps) {
    const stepId = step["step_id"];
    if (typeof stepId === "string" && stepId && !goalKeys.has(stepId)) {
      findings.push({
        check: CHECK_STEP_WITHOUT_GOAL,
        detail:
          `step ${pythonRepr(stepId)} answers no goal in the spec for session ` +
          `${sessionNumber} -- it is either ceremony, which never enters a ` +
          "plan, or work nobody asked for",
        stepId,
      });
    }
  }

  const envelope = envelopeUnion(plan);
  for (const goal of goals) {
    if (!stepIds.has(goal.key)) continue; // already reported as an uncovered goal
    for (const path of namedFiles(goal.text)) {
      if (!envelope.has(path)) {
        findings.push({
          check: CHECK_ENVELOPE_OMITS_NAMED_FILE,
          detail:
            `goal ${pythonRepr(goal.key)} names ${pythonRepr(path)} but no step's ` +
            "file envelope declares it",
          stepId: goal.key,
        });
      }
    }
  }

  for (const step of steps) {
    const declared = stringList(step["risk_flags"]);
    const actual = deriveRiskFlags(stringList(step["file_envelope"]), workspaceRoot);
    if (dumps(declared) !== dumps(actual)) {
      const stepId = step["step_id"];
      findings.push({
        check: CHECK_RISK_FLAGS_NOT_DERIVED,
        detail:
          `step ${pythonRepr(stepId)} carries risk_flags ${pythonRepr(declared)}, ` +
          `but its file envelope derives ${pythonRepr(actual)} -- risk is ` +
          "derived, never declared",
        stepId: typeof stepId === "string" ? stepId : null,
      });
    }
  }

  if (onlySteps === null) return findings;
  const scope = new Set(onlySteps);
  return findings.filter(
    (finding) => finding.stepId === null || scope.has(finding.stepId),
  );
}

// --- The fixed checklist -----------------------------------------------------

export const CHECKLIST = `1. Would the declared evidence actually tell us this step worked? Could the
   step be done wrong and every evidence item still pass? If so, the
   evidence is the defect, not the intent.
2. Is each evidence item's type honest? An item typed \`deterministic\` must
   be something a command can decide with no model reading anything.
3. Does the file envelope hold the files this intent needs, and nothing it
   does not?
4. Is the intent one concrete action a reader could check, rather than a
   bundle of several?
`;

const RESPONSE_FORMAT = `Answer every step, in this exact block form and nothing else:

STEP: <step_id>
VERDICT: approve | amend | human
FIELDS: <comma-separated: intent, file_envelope, evidence_contract>
WHY: <one sentence>

VERDICT approve means the evidence would genuinely prove the step; leave
FIELDS empty. VERDICT amend means a listed field must change before this
plan is approved. VERDICT human means the call needs a person, not a
bigger model. Judge the proof, not the prose.`;

/**
 * The reviewer's whole input: fixed checklist, fixed response form, and the
 * plan. The checklist is fixed text on purpose -- a reviewer inventing its own
 * criteria each round is the free-form critique this design replaced.
 *
 * `onlySteps` narrows the prompt to an amendment's changed steps. The
 * unchanged ones are not shown, because a reviewer shown a step it is not
 * being asked about is a reviewer that may object to it -- and re-approving
 * what was already approved is the ceremony this design is spending less of.
 */
export function buildReviewPrompt(
  plan: Plan,
  goals: readonly Goal[],
  onlySteps: readonly string[] | null = null,
): string {
  const scope = onlySteps === null ? null : new Set(onlySteps);
  const steps = stepsOf(plan).filter(
    (step) => scope === null || scope.has(String(step["step_id"])),
  );
  const lines: string[] = [
    "You are reviewing a pre-registered plan for one coding session.",
    "The plan is not code. It declares, per step, what will be done, " +
      "which files it may touch, and what evidence will prove it worked.",
    "",
  ];
  if (scope !== null) {
    lines.push(
      "This is an amendment to a plan that was already approved. " +
        "Only the amended step(s) are shown, and only they are yours " +
        "to judge.",
      "",
    );
  }
  lines.push(
    "Your assignment is the evidence. Work this checklist and nothing else:",
    "",
    CHECKLIST,
    "",
    RESPONSE_FORMAT,
    "",
    "--- The session's goals, as its spec states them ---",
  );
  for (const goal of goals) lines.push(`- ${goal.key}: ${goal.text}`);
  lines.push("");
  lines.push("--- The plan under review ---");
  for (const step of steps) {
    lines.push("");
    lines.push(`STEP: ${pyStr(step["step_id"])}`);
    lines.push(`  intent: ${pyStr(step["intent"])}`);
    lines.push(`  file_envelope: ${stringList(step["file_envelope"]).join(", ")}`);
    lines.push("  evidence_contract:");
    const contract = Array.isArray(step["evidence_contract"]) ? step["evidence_contract"] : [];
    for (const raw of contract) {
      const item = isRecord(raw) ? raw : {};
      lines.push(`    - [${pyStr(item["kind"])}] ${pyStr(item["description"])}`);
    }
    const flags = stringList(step["risk_flags"]);
    lines.push(`  derived risk flags: ${flags.join(", ") || "none"}`);
  }
  return lines.join("\n");
}

/** `str(x)` as an f-string interpolates it; `None` for a missing member. */
function pyStr(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  return String(value);
}

export interface StepVerdict {
  readonly stepId: string;
  readonly verdict: string;
  readonly objectedFields: readonly string[];
  readonly reason: string;
}

export function stepVerdictRow(verdict: StepVerdict): Row {
  return {
    step_id: verdict.stepId,
    verdict: verdict.verdict,
    objected_fields: [...verdict.objectedFields],
    reason: verdict.reason,
  };
}

const STEP_LINE = /^\s*STEP:\s*(\S+)/i;
const FIELD_LINE = /^\s*(VERDICT|FIELDS|WHY):\s*(.*)$/i;

/**
 * Parse the reviewer's blocks into one verdict per step.
 *
 * Fails closed in every direction: a step the reviewer did not answer, and a
 * verdict that is not exactly one of the three tokens, both become `human`. An
 * unanswered step is not an approval, and a reviewer that answered in a shape
 * nobody asked for has not approved anything either.
 */
export function parseReviewResponse(
  response: unknown,
  stepIds: readonly string[],
): StepVerdict[] {
  const blocks = new Map<string, Map<string, string>>();
  let current: string | null = null;
  for (const line of String(response ?? "").split("\n")) {
    const stepMatch = STEP_LINE.exec(line);
    if (stepMatch) {
      current = stepMatch[1].trim().replace(/^[`*]+|[`*]+$/g, "");
      if (!blocks.has(current)) blocks.set(current, new Map());
      continue;
    }
    if (current === null) continue;
    const fieldMatch = FIELD_LINE.exec(line);
    if (fieldMatch) {
      const key = fieldMatch[1].toUpperCase();
      const block = blocks.get(current)!;
      if (!block.has(key)) block.set(key, fieldMatch[2].trim());
    }
  }

  const verdicts: StepVerdict[] = [];
  for (const stepId of stepIds) {
    const raw = blocks.get(stepId);
    if (raw === undefined) {
      verdicts.push({
        stepId,
        verdict: VERDICT_HUMAN,
        objectedFields: [...OBJECTABLE_FIELDS],
        reason: "the reviewer did not answer this step",
      });
      continue;
    }
    // Exact match or nothing. The response format asks for one bare token, so
    // anything else -- "approve/amend", a token trailed by a clause, a hedge
    // -- is a shape nobody asked for, and reading a verdict out of it is how
    // an ambiguous answer becomes an approval.
    const token = (raw.get("VERDICT") ?? "")
      .trim()
      .toLowerCase()
      .replace(/^[*`_ ]+|[*`_ ]+$/g, "")
      .replace(/\.+$/, "");
    if (!VERDICTS.has(token)) {
      verdicts.push({
        stepId,
        verdict: VERDICT_HUMAN,
        objectedFields: [...OBJECTABLE_FIELDS],
        reason: `unreadable verdict ${raw.has("VERDICT") ? pythonRepr(raw.get("VERDICT")) : "None"}`,
      });
      continue;
    }
    let fields = (raw.get("FIELDS") ?? "")
      .toLowerCase()
      .split(/[,\s]+/)
      .filter((field) => OBJECTABLE_FIELDS.includes(field));
    if (token === VERDICT_APPROVE && fields.length > 0) {
      // An approval that also names fields needing change is two answers, not
      // one. Keeping the approval and discarding the fields would throw away
      // the objection the reviewer just made, which is the one direction this
      // parser must not fail.
      verdicts.push({
        stepId,
        verdict: VERDICT_HUMAN,
        objectedFields: fields,
        reason: `approved while naming ${fields.join(", ")} as needing change`,
      });
      continue;
    }
    // An objection that names no field it can be answered by would make every
    // revision a bounce. Objecting to everything is the honest reading: the
    // reviewer must be answerable.
    if (token !== VERDICT_APPROVE && fields.length === 0) {
      fields = [...OBJECTABLE_FIELDS];
    }
    verdicts.push({
      stepId,
      verdict: token,
      objectedFields: token === VERDICT_APPROVE ? [] : fields,
      reason: (raw.get("WHY") ?? "").trim(),
    });
  }
  return verdicts;
}

// --- Anti-grind --------------------------------------------------------------

function fieldDigest(step: Row, name: string): string {
  return hashBytes(
    Buffer.from(
      dumps(step[name] ?? null, { sortKeys: true, separators: [",", ":"] }),
      "utf8",
    ),
  );
}

/**
 * A digest per objected field, so the next round can tell a real revision from
 * a resubmission without reading anything.
 */
export function objectedFieldDigests(
  plan: Plan,
  verdicts: readonly StepVerdict[],
): Record<string, Record<string, string>> {
  const byId = new Map<string, Row>();
  for (const step of stepsOf(plan)) {
    const stepId = step["step_id"];
    if (typeof stepId === "string" && stepId) byId.set(stepId, step);
  }
  const out: Record<string, Record<string, string>> = {};
  for (const verdict of verdicts) {
    const step = byId.get(verdict.stepId);
    if (step === undefined || verdict.objectedFields.length === 0) continue;
    const digests: Record<string, string> = {};
    for (const name of verdict.objectedFields) digests[name] = fieldDigest(step, name);
    out[verdict.stepId] = digests;
  }
  return out;
}

/**
 * True when this plan changed at least one field the previous round objected
 * to. A step the revision deleted outright counts as answered: the objected
 * field is gone.
 *
 * This is the whole anti-grind rule, and it costs nothing -- which is the
 * point. A supervisor cannot resubmit its way to an approval, because a
 * resubmission never reaches the model.
 */
export function revisionAnswersObjections(
  plan: Plan,
  priorDigests: Record<string, unknown> | null,
): boolean {
  if (!priorDigests || Object.keys(priorDigests).length === 0) return true;
  const byId = new Map<string, Row>();
  for (const step of stepsOf(plan)) {
    const stepId = step["step_id"];
    if (typeof stepId === "string" && stepId) byId.set(stepId, step);
  }
  for (const [stepId, fields] of Object.entries(priorDigests)) {
    const step = byId.get(stepId);
    if (step === undefined) return true;
    if (!isRecord(fields)) continue;
    for (const [name, digest] of Object.entries(fields)) {
      if (fieldDigest(step, name) !== digest) return true;
    }
  }
  return false;
}

/**
 * Which triggers, if any, route this round to the premium model.
 *
 * Both are recorded when both fire: a precedence rule would hide one of them
 * from the record, and the record is the point.
 *
 * Rejections are counted since the most recent approval, not since the session
 * began. An approved plan that took two rounds to get there has settled its
 * strikes; carrying them forward would send every later amendment to the
 * premium model for a disagreement that is over.
 */
export function escalationTriggers(
  plan: Plan,
  priorRounds: readonly Row[],
  onlySteps: readonly string[] | null = null,
): string[] {
  const scope = onlySteps === null ? null : new Set(onlySteps);
  const triggers: string[] = [];
  for (const step of stepsOf(plan)) {
    if (scope !== null && !scope.has(String(step["step_id"]))) continue;
    if (stringList(step["risk_flags"]).some((flag) => HIGH_RISK_FLAGS.has(flag))) {
      triggers.push(TRIGGER_HIGH_RISK);
      break;
    }
  }
  let rejections = 0;
  for (const row of priorRounds) {
    if (row["outcome"] === OUTCOME_APPROVED) {
      rejections = 0;
      continue;
    }
    if (row["model_called"]) rejections += 1;
  }
  if (rejections >= ESCALATE_AFTER_REJECTIONS) triggers.push(TRIGGER_REPEAT_OBJECTION);
  return triggers;
}

// --- The record --------------------------------------------------------------

export function reviewPath(runDir: string): string {
  return join(runDir, REVIEW_FILENAME);
}

export function validateRound(record: Row): Row {
  const failure = schemaFailure(record, schema(), `${REVIEW_FILENAME} row`);
  if (failure !== null) throw new PlanReviewError(failure);
  return record;
}

/**
 * Every recorded round, oldest first. A malformed row is refused rather than
 * skipped: a review history with a hole in it is not a history.
 */
export function readRounds(runDir: string): Row[] {
  const path = reviewPath(runDir);
  if (!existsSync(path)) return [];
  const rounds: Row[] = [];
  const lines = readText(path).split("\n");
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch (error) {
      throw new PlanReviewError(
        `${path}: line ${index + 1} is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    rounds.push(validateRound(record as Row));
  }
  return rounds;
}

function appendRound(runDir: string, record: Row): Row {
  validateRound(record);
  const path = reviewPath(runDir);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, platformNewlines(`${dumps(record, { sortKeys: true })}\n`), {
    encoding: "utf8",
  });
  return record;
}

/** What `reviewRound` sends and gets back; `route` is the default. */
export type ReviewDispatch = (
  prompt: string,
  options: { readonly role: string; readonly sessionNumber: number; readonly transport: string | null },
) => Promise<RouteResult>;

const defaultDispatch: ReviewDispatch = (prompt, options) =>
  route(prompt, {
    taskType: "plan-review",
    role: options.role,
    sessionNumber: options.sessionNumber,
    transport: options.transport,
  });

export interface ReviewOptions {
  readonly workspaceRoot?: string | null;
  readonly dispatch?: ReviewDispatch;
  readonly transport?: string | null;
  readonly onlySteps?: readonly string[] | null;
}

/**
 * Review the plan once and record the round.
 *
 * Free first: the mechanical checks run before anything is spent, and a
 * finding among them ends the round with no model call. Then the anti-grind
 * bounce, which is also free. Only what survives both is worth a model, and
 * which model is decided by the derived risk flags and by how many times this
 * plan has already been rejected.
 *
 * `onlySteps` reviews an amendment: the checks, the prompt and the verdicts
 * cover the changed steps and nothing else, and the row records which steps
 * that was.
 */
export async function reviewRound(
  runDir: string,
  plan: Plan,
  specText: string,
  sessionNumber: number,
  options: ReviewOptions = {},
): Promise<Row> {
  const workspaceRoot = options.workspaceRoot ?? null;
  const transport = options.transport ?? null;
  const prior = readRounds(runDir);
  const roundNumber = prior.length + 1;
  const scope = options.onlySteps === null || options.onlySteps === undefined
    ? null
    : [...options.onlySteps];

  const base: Row = {
    schema_version: SCHEMA_VERSION,
    round: roundNumber,
    recorded_at: nowIso("microseconds"),
    plan_core_hash: computePlanHash(plan),
    free_findings: [],
    step_verdicts: [],
    escalation_triggers: [],
    objected_field_digests: {},
    reviewer: null,
  };
  if (scope !== null) base["reviewed_steps"] = scope;

  const findings = freeChecks(plan, specText, sessionNumber, workspaceRoot, scope);
  if (findings.length > 0) {
    return appendRound(runDir, {
      ...base,
      outcome: OUTCOME_AMEND,
      model_called: false,
      free_findings: findings.map(findingRow),
    });
  }

  const last = prior.length > 0 ? prior[prior.length - 1] : null;
  const priorDigests = (last?.["objected_field_digests"] ?? null) as Record<
    string,
    unknown
  > | null;
  if (
    priorDigests &&
    Object.keys(priorDigests).length > 0 &&
    !revisionAnswersObjections(plan, priorDigests)
  ) {
    return appendRound(runDir, {
      ...base,
      outcome: OUTCOME_BOUNCED,
      model_called: false,
      objected_field_digests: priorDigests,
    });
  }

  const triggers = escalationTriggers(plan, prior, scope);
  const role = triggers.length > 0 ? ROLE_PLAN_REVIEW_ESCALATED : ROLE_PLAN_REVIEW;
  const goals = sessionGoals(specText, sessionNumber);
  const prompt = buildReviewPrompt(plan, goals, scope);
  const caller = options.dispatch ?? defaultDispatch;
  const result = await caller(prompt, { role, sessionNumber, transport });

  const stepIds = stepsOf(plan)
    .map((step) => step["step_id"])
    .filter((id): id is string => typeof id === "string" && Boolean(id))
    .filter((id) => scope === null || scope.includes(id));
  const verdicts = parseReviewResponse(result?.content ?? "", stepIds);
  const tokens = new Set(verdicts.map((verdict) => verdict.verdict));
  const outcome = tokens.has(VERDICT_HUMAN)
    ? OUTCOME_HUMAN
    : tokens.has(VERDICT_AMEND)
      ? OUTCOME_AMEND
      : OUTCOME_APPROVED;

  return appendRound(runDir, {
    ...base,
    outcome,
    model_called: true,
    step_verdicts: verdicts.map(stepVerdictRow),
    escalation_triggers: triggers,
    objected_field_digests: objectedFieldDigests(plan, verdicts),
    reviewer: {
      model: result?.model_name || "",
      provider: result?.provider || "",
      role,
      transport: result?.transport || "",
    },
  });
}

// --- Amendments --------------------------------------------------------------

export interface AmendmentReviewOptions extends ReviewOptions {
  readonly stepId: string;
  readonly reason: string;
  readonly addedFiles?: readonly string[];
  readonly evidenceContract?: readonly unknown[];
}

/**
 * Put one proposed amendment through the same checks the plan passed, scoped
 * to the step it changes, and append it only if they approve.
 *
 * Returns `[round, plan]`; the plan is null when the round did not approve,
 * and nothing was appended -- a rejected amendment leaves the approved plan
 * exactly as it was.
 *
 * Only the changed step is re-checked. Re-approving the steps an amendment
 * does not touch would cost a model call per unchanged step to re-derive an
 * answer already on the record.
 */
export async function reviewAmendment(
  runDir: string,
  specText: string,
  sessionNumber: number,
  options: AmendmentReviewOptions,
): Promise<[Row, Plan | null]> {
  const { stepId, reason, addedFiles, evidenceContract } = options;
  const workspaceRoot = options.workspaceRoot ?? null;
  const hasFiles = Boolean(addedFiles && addedFiles.length > 0);
  const hasContract = Boolean(evidenceContract && evidenceContract.length > 0);
  if (!hasFiles && !hasContract) {
    throw new Error(
      "an amendment must carry a change: added_files, an evidence_contract, or both",
    );
  }
  const plan = readPlan(runDir);
  if (!plan["approved"]) {
    throw new PlanImmutableError(
      `${runDir}: cannot amend a plan that has not been approved`,
    );
  }
  if (!stepsOf(plan).some((step) => step["step_id"] === stepId)) {
    throw new Error(
      `${runDir}: step_id ${pythonRepr(stepId)} is not declared in this plan`,
    );
  }

  const amendment: Row = {
    recorded_at: nowIso("microseconds"),
    step_id: stepId,
    reason,
  };
  if (hasFiles) amendment["added_files"] = [...addedFiles!];
  if (hasContract) amendment["evidence_contract"] = [...evidenceContract!];
  const existing = Array.isArray(plan["amendments"]) ? plan["amendments"] : [];
  const proposed: Plan = { ...plan, amendments: [...existing, amendment] };
  const candidate = effectivePlan(proposed, workspaceRoot);

  const record = await reviewRound(runDir, candidate, specText, sessionNumber, {
    workspaceRoot,
    dispatch: options.dispatch,
    transport: options.transport,
    onlySteps: [stepId],
  });
  if (record["outcome"] !== OUTCOME_APPROVED) return [record, null];

  return [
    record,
    appendAmendment(runDir, {
      stepId,
      reason,
      addedFiles,
      evidenceContract,
    }),
  ];
}
