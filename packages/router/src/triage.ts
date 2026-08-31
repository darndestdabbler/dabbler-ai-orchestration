// `dabbler triage`: a second opinion on a stopped session.
//
// A stop is a detected impasse, and detecting one is not the same as
// knowing whose it is. This assembles what the record already holds about
// the stop -- the outstanding instruction, the report that was refused, the
// reasons with the rule slugs they cite, the source of those rules, the run
// with its stop and its stop history, and the tail of the transcript -- and
// asks a provider that is NOT the working engine's to classify it.
//
// **One verb, both modes.** An attended engine calls it when it is stuck; an
// unattended `session drive` calls it on a deadlock-class stop. There is one
// implementation because there is one question, and two would drift into two
// answers to it.
//
// **It is an opinion, and it acts on nothing.** Nothing here writes to
// `.dabbler/runs/`, amends a plan, moves a gate or clears a stop. The caller
// decides what to do with the answer, and where that decision relaxes
// anything the framework checks, a person makes it on the record.
//
// The exclusion is the same one verification runs under: the orchestrator's
// effective provider, resolved by `identity` from the record rather than
// trusted from a label, is excluded at the call, and asserted again here
// against the provider that actually answered. Both halves are needed --
// the offline transport builds its one candidate without consulting the
// exclusion, so a scripted run would otherwise read as cross-provider.

import { existsSync } from "node:fs";
import { join } from "node:path";

import type { DriverInstruction, DriverReport, DriverRun, Triage } from "./generated/index.ts";
import {
  readInstruction,
  readReport,
  readRun,
  readWorkPlan,
  transcriptPath,
} from "./driver.ts";
import { repoRootFromSessionsDir } from "./evidence.ts";
import { resolveSessionOrchestratorIdentity } from "./identity.ts";
import { readSessionState } from "./progress.ts";
import { PACKAGE_ROOT } from "./paths.ts";
import { NoCandidateError, route } from "./route.ts";
import { loadSchemaFile, schemaFailure } from "./schema/validate.ts";
import { ROLE_VERIFIER } from "./selection.ts";
import { readText } from "./textfile.ts";

export const TRIAGE_SCHEMA = "triage.schema.json";

/** How much of the transcript an adviser is shown: the end, where it stopped. */
const TRANSCRIPT_TAIL_CHARS = 6000;
/** How far either side of a rule's use site is quoted as its source. */
const RULE_CONTEXT_LINES = 6;

/**
 * Triage could not be run. Never a classification -- an absent second
 * opinion and an inconclusive one are different facts, and the ladder that
 * calls this treats them differently.
 */
export class TriageError extends Error {
  /**
   * The provider that answered, where one did.
   *
   * A caller climbing a ladder needs it: an adviser that answered badly has
   * still been asked, and the next rung is somebody else. Null when nobody
   * answered at all.
   */
  readonly provider: string | null;

  constructor(message: string, provider: string | null = null) {
    super(message);
    this.name = "TriageError";
    this.provider = provider;
  }
}

/** No provider outside the working engine's could be reached at all. */
export class TriageUnavailableError extends TriageError {}

// --- the artifacts -----------------------------------------------------------

export interface TriageArtifacts {
  readonly sessionNumber: number;
  readonly instruction: DriverInstruction | null;
  readonly report: DriverReport | null;
  readonly run: DriverRun | null;
  /** The refusals the outstanding instruction carries, verbatim. */
  readonly reasons: readonly string[];
  /** The rule slugs those reasons cite, in the order they first appear. */
  readonly rules: readonly string[];
  /** Each cited rule as the driver's own source states it, by slug. */
  readonly ruleSource: Readonly<Record<string, string>>;
  /** The step the plan declares, if the stop is on one. */
  readonly step: { id: string; ask: string; files: readonly string[]; checks: unknown } | null;
  readonly transcriptTail: string;
}

/** `[files-changed-omits] ...` -- the rule a refusal opens with. */
const SLUG = /^\[([a-z0-9-]+)\]/;

export function citedRules(reasons: readonly string[]): string[] {
  const seen: string[] = [];
  for (const reason of reasons) {
    const found = SLUG.exec(reason.trim());
    if (found && !seen.includes(found[1] as string)) seen.push(found[1] as string);
  }
  return seen;
}

/**
 * Where the driver's source can be read from, in the layouts this package
 * runs in: a development checkout, and the bundle that ships. A rule quoted
 * from the code that enforces it cannot be out of date with it; a rule
 * described in a table here would be a second copy of the rule.
 */
function driverSourcePaths(): string[] {
  return [join(PACKAGE_ROOT, "src", "drive.ts"), join(PACKAGE_ROOT, "dist", "dabbler.cjs")];
}

/**
 * The lines of the driver's own source that define and use a rule.
 *
 * The table is read out of the source rather than restated: the slug gives
 * the constant's name, and the name gives the use sites. A build that does
 * not carry readable source says so plainly instead of inventing a gloss.
 */
export function ruleSourceFor(slugs: readonly string[]): Record<string, string> {
  const path = driverSourcePaths().find((candidate) => existsSync(candidate));
  const out: Record<string, string> = {};
  if (path === undefined) {
    for (const slug of slugs) out[slug] = "(the driver's source is not readable in this build)";
    return out;
  }
  const lines = readText(path).split("\n");
  for (const slug of slugs) {
    const declaration = lines.findIndex((line) => line.includes(`"${slug}"`));
    const constant =
      declaration >= 0
        ? (/(\w+)\s*:\s*"/.exec(lines[declaration] as string)?.[1] ?? null)
        : null;
    const windows: string[] = [];
    if (declaration >= 0) windows.push((lines[declaration] as string).trim());
    if (constant !== null) {
      lines.forEach((line, index) => {
        if (!line.includes(`RULE.${constant}`)) return;
        const from = Math.max(0, index - 1);
        const to = Math.min(lines.length, index + RULE_CONTEXT_LINES);
        windows.push(lines.slice(from, to).join("\n"));
      });
    }
    out[slug] =
      windows.length > 0
        ? windows.join("\n...\n")
        : "(no rule of that name is in the driver's source)";
  }
  return out;
}

/** What the record holds about this stop, gathered and nothing more. */
export function collectArtifacts(repoRoot: string, sessionNumber: number): TriageArtifacts {
  const instruction = readInstruction(repoRoot, sessionNumber);
  const run = readRun(repoRoot, sessionNumber);
  const reasons = instruction?.reasons ?? [];
  const rules = citedRules(reasons);
  const plan = readWorkPlan(repoRoot, sessionNumber);
  const stepId = run?.stop?.step_id ?? instruction?.step_id ?? null;
  const declared = stepId === null ? undefined : plan?.steps.find((step) => step.id === stepId);
  return {
    sessionNumber,
    instruction,
    report: readReport(repoRoot, sessionNumber),
    run,
    reasons,
    rules,
    ruleSource: ruleSourceFor(rules),
    step:
      declared === undefined
        ? null
        : { id: declared.id, ask: declared.ask, files: declared.files, checks: declared.checks },
    transcriptTail: transcriptTail(repoRoot, sessionNumber, run?.invocations ?? 0),
  };
}

/**
 * The end of the most recent transcript there is.
 *
 * Transcripts are numbered by invocation, and the count on the run is the
 * last one written -- but a pull-mode session invokes nobody, so there may
 * be none at all. An absent transcript is an empty tail and not an error:
 * a stop with no engine behind it is exactly the case triage is for.
 */
function transcriptTail(repoRoot: string, sessionNumber: number, invocations: number): string {
  for (let invocation = invocations; invocation >= 1; invocation -= 1) {
    const path = transcriptPath(repoRoot, sessionNumber, invocation);
    if (!existsSync(path)) continue;
    const text = readText(path);
    return text.length > TRANSCRIPT_TAIL_CHARS ? text.slice(-TRANSCRIPT_TAIL_CHARS) : text;
  }
  return "";
}

// --- the question ------------------------------------------------------------

const ASK =
  "A driven coding session has stopped. Classify the stop and say what should happen next.\n" +
  "\n" +
  "`engine-error` -- the engine did the wrong thing and the framework was right to " +
  "refuse it; the next attempt can succeed with the plan and the framework unchanged.\n" +
  "`framework-defect` -- the framework refused work that should have passed, or could " +
  "not carry out its own step. The fix is to the framework.\n" +
  "`plan-defect` -- the step cannot be satisfied as written: its files or its checks are " +
  "wrong, and no amount of engine effort fixes that.\n" +
  "\n" +
  "Answer with ONE JSON object and nothing else, of exactly this shape:\n" +
  '{"classification": "engine-error|framework-defect|plan-defect", "reasoning": "<why, ' +
  'against the artifacts>", "recommendation": "<one sentence>", "amendment": null}\n' +
  "\n" +
  "`amendment` is the MINIMAL change to the step that would let the session continue, or " +
  "null when none would help. When you propose one it is " +
  '{"step_id": "<the step>", "files": [...], "checks": [{"argv": [...]}], "reason": ' +
  '"<why this is minimal>", "relaxes_a_gate": true|false} -- give `files` or `checks` ' +
  "only where they should change, whole. Set `relaxes_a_gate` true when your amendment " +
  "weakens what the framework checks. Nothing you propose is applied by the framework: a " +
  "person decides, and `relaxes_a_gate` is what they are told first.";

export function buildTriagePrompt(artifacts: TriageArtifacts): string {
  const parts: string[] = [ASK, "", "--- the stop ---"];
  const stop = artifacts.run?.stop ?? null;
  parts.push(
    stop === null
      ? "The run record carries no stop."
      : `kind: ${stop.kind}\nclass: ${stop.class ?? "(unclassified)"}\nstep: ${
          stop.step_id ?? "(not on a step)"
        }\nreason: ${stop.reason}`,
  );
  const history = artifacts.run?.stop_history ?? [];
  if (history.length > 0) {
    parts.push("", "--- the stops before it, oldest first ---");
    parts.push(history.map((row) => `${row.kind} on ${row.step_id ?? "-"}: ${row.reason}`).join("\n"));
  }
  parts.push("", "--- the outstanding instruction ---");
  parts.push(artifacts.instruction === null ? "(none)" : jsonBlock(artifacts.instruction));
  if (artifacts.reasons.length > 0) {
    parts.push("", "--- why the last answer was refused ---");
    parts.push(artifacts.reasons.join("\n"));
  }
  for (const slug of artifacts.rules) {
    parts.push("", `--- the rule '${slug}', as the driver's source states it ---`);
    parts.push(artifacts.ruleSource[slug] ?? "");
  }
  if (artifacts.step !== null) {
    parts.push("", "--- the step the plan declares ---");
    parts.push(jsonBlock(artifacts.step));
  }
  parts.push("", "--- the report, if one was written ---");
  parts.push(artifacts.report === null ? "(none)" : jsonBlock(artifacts.report));
  parts.push("", "--- the tail of the engine's transcript ---");
  parts.push(artifacts.transcriptTail.trim() === "" ? "(none)" : artifacts.transcriptTail);
  return parts.join("\n");
}

function jsonBlock(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

// --- the answer --------------------------------------------------------------

/**
 * The adviser's answer, as JSON.
 *
 * A fenced block is unwrapped and nothing else is: the fence is how models
 * mark code and says nothing about the content, while anything else that
 * needed removing would be content this call did not ask for. What is
 * inside the fence is taken exactly as written and validated as it stands.
 */
export function parseTriageAnswer(content: string): Triage {
  let text = content.trim();
  if (text.startsWith("```")) {
    const firstBreak = text.indexOf("\n");
    const closing = text.lastIndexOf("```");
    if (firstBreak >= 0 && closing > firstBreak) text = text.slice(firstBreak + 1, closing).trim();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new TriageError(
      `the adviser's answer is not JSON: ${(error as Error).message}. It is refused ` +
        "rather than repaired -- an answer nobody can read is not a classification.",
    );
  }
  const failure = schemaFailure(parsed, loadSchemaFile(TRIAGE_SCHEMA), "triage answer");
  if (failure) throw new TriageError(failure);
  return parsed as Triage;
}

export interface TriageOutcome {
  readonly answer: Triage;
  /** Who answered, and which provider they were reached on. */
  readonly adviser: { readonly model: string; readonly provider: string };
  /** The providers this call refused to route to, the working engine's first. */
  readonly excluded: readonly string[];
  /** Served by a script rather than a vendor. Never inferred downstream. */
  readonly simulated: boolean;
}

export interface TriageOptions {
  readonly sessionNumber?: number | null;
  /** Excluded in addition to the working engine's; a ladder's earlier rung. */
  readonly alsoExclude?: readonly string[];
  readonly transport?: string | null;
}

/**
 * Ask a provider that is not the working engine's to classify the stop.
 *
 * One attempt and one retry, and the retry is for a malformed answer only:
 * a schema that did not fit once may fit when the shape is said again, and
 * anything else -- an unreachable provider, an excluded one -- is a fact
 * about this rung that the caller above needs, not something to spend a
 * second call on.
 */
export async function triage(
  sessionsDir: string,
  options: TriageOptions = {},
): Promise<TriageOutcome> {
  const repoRoot = repoRootFromSessionsDir(sessionsDir);
  const sessionNumber = options.sessionNumber ?? currentSession(sessionsDir);
  if (sessionNumber === null) {
    throw new TriageError(`no session is in flight under ${sessionsDir}; there is nothing to triage`);
  }
  const identity = resolveSessionOrchestratorIdentity(sessionsDir, sessionNumber);
  const artifacts = collectArtifacts(repoRoot, sessionNumber);
  if (artifacts.run === null) {
    throw new TriageError(
      `session ${sessionNumber} has no run record; there is no stop here to classify`,
    );
  }
  const excluded = [
    ...new Set([identity.effectiveProvider, ...(options.alsoExclude ?? [])].map((p) => p.toLowerCase())),
  ];
  const prompt = buildTriagePrompt(artifacts);

  let last: TriageError | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let result;
    try {
      result = await route(attempt === 0 ? prompt : `${prompt}\n\n${RESHAPE}`, {
        taskType: "session-triage",
        role: ROLE_VERIFIER,
        sessionNumber,
        excludeProviders: excluded,
        transport: options.transport ?? null,
      });
    } catch (error) {
      if (error instanceof NoCandidateError) {
        throw new TriageUnavailableError(
          `no adviser exists outside ${excluded.join(", ")}: ${error.message}`,
        );
      }
      throw error;
    }
    // Asserted here as well as at the call: the offline transport builds its
    // one candidate without consulting the exclusion.
    if (excluded.includes(result.provider.toLowerCase())) {
      throw new TriageError(
        `the adviser answered on '${result.provider}', which this call excludes ` +
          `(${excluded.join(", ")}); the answer is discarded rather than used.`,
      );
    }
    try {
      return {
        answer: parseTriageAnswer(result.content),
        adviser: { model: result.model_name, provider: result.provider },
        excluded,
        simulated: result.metadata["simulated"] === true,
      };
    } catch (error) {
      if (!(error instanceof TriageError)) throw error;
      last = new TriageError(error.message, result.provider);
    }
  }
  throw last as TriageError;
}

const RESHAPE =
  "Your previous answer did not fit the shape asked for. Answer again with ONE JSON " +
  "object and no prose around it.";

/**
 * The session in flight, as the lifecycle records it.
 *
 * Read from the ledger rather than from the run directory: the most recent
 * `s<N>` on disk is whichever ran last, and that is not the same question.
 */
function currentSession(sessionsDir: string): number | null {
  const current = readSessionState(sessionsDir)?.["currentSession"];
  return typeof current === "number" ? current : null;
}
