// `dabbler triage`: a second opinion on a stopped session.
//
// A stop is a detected impasse, and detecting one is not the same as
// knowing whose it is. This assembles what the record already holds about
// the stop -- the outstanding instruction, the report that was refused, the
// reasons with the rule slugs they cite, the source of those rules, the run
// with its stop and its stop history, and the tail of the transcript -- and
// asks a provider that is NOT the working engine's to classify it.
//
// **Asked for, never automatic.** An engine or a person calls it when a
// session is stuck; no loop calls it on its own.
//
// **It is an opinion, and it acts on nothing.** Nothing here amends a plan,
// moves a gate or clears a stop. What it writes is one advice row in the
// run's `exceptions.jsonl` -- the answer with the adviser named, or that
// nobody could be reached -- marked as advice, which no gate reads. The
// caller decides what to do with the answer, and where that decision relaxes
// anything the framework checks, a person makes it on the record.
//
// Where the Mechanic has requested an exception (`mechanic-log.md`), the
// request is read with the stop and checked: a within-rules path or "none
// found", whether its account matches the record, and whether a person who
// was not there could follow it.
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
import { appendAdvice, readExceptionRequest } from "./ledger.ts";
import { readSessionState } from "./progress.ts";
import { PACKAGE_ROOT } from "./paths.ts";
import { DispatchError, NoCandidateError, RouterError, route } from "./route.ts";
import { loadSchemaFile, schemaFailure } from "./schema/validate.ts";
import { ROLE_PRIMARY_REVIEWER } from "./selection.ts";
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
  /** The Mechanic's standing request for an exception, verbatim, or null. */
  readonly request?: string | null;
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
export function collectArtifacts(repoRoot: string, sessionNumber: number, sessionsDir: string): TriageArtifacts {
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
    request: run?.stop ? readExceptionRequest(sessionsDir, sessionNumber, run.stop.at) : null,
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

/**
 * What is asked more where a Mechanic has requested an exception: a check of
 * the request, never a verdict on it. The person decides; this is advice.
 */
const ASK_OF_A_REQUEST =
  "A request for an exception to the rule that stopped the session stands, in the Mechanic's words, " +
  "below. Check it, and add three members to your JSON object:\n" +
  '"within_rules": the exact commands that would clear the stop WITHIN the rules, or exactly "none found". ' +
  "It is never your verdict on the request: finding no alternative is not agreeing with it.\n" +
  '"account": {"matches": true|false, "differences": "<where the request\'s account of the stop differs ' +
  'from the record above, or empty>"}\n' +
  '"plain": {"followable": true|false, "unclear": "<what a person who was not there could not follow, ' +
  'or empty>"}';

export function buildTriagePrompt(artifacts: TriageArtifacts): string {
  const request = artifacts.request ?? null;
  const parts: string[] = [ASK, ...(request === null ? [] : ["", ASK_OF_A_REQUEST]), "", "--- the stop ---"];
  const stop = artifacts.run?.stop ?? null;
  parts.push(
    stop === null
      ? "The run record carries no stop."
      : `kind: ${stop.kind}\nstep: ${
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
  if (request !== null) parts.push("", "--- the request for an exception, from mechanic-log.md ---", request);
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
export function parseTriageAnswer(content: string, request = false): Triage {
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
  const answer = parsed as Triage;
  if (request) {
    const missing = (["within_rules", "account", "plain"] as const).filter((member) => answer[member] === undefined);
    if (missing.length > 0) {
      throw new TriageError(`a request for an exception stands, and the answer omits ${missing.join(", ")}`);
    }
  }
  return answer;
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
 * One provider call, and no retry: the person is told the check is one
 * call before they ask for it. An answer that does not fit the shape is
 * refused, naming the adviser, and asking again is the person's to do.
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
  const artifacts = collectArtifacts(repoRoot, sessionNumber, sessionsDir);
  if (artifacts.run === null) {
    throw new TriageError(
      `session ${sessionNumber} has no run record; there is no stop here to classify`,
    );
  }
  // A stop is what this verb classifies. A run still going, or one that
  // finished, has nothing here to be a second opinion about -- and asking
  // anyway would spend a provider call on a question with no subject.
  if (artifacts.run.stop === null) {
    throw new TriageError(
      `session ${sessionNumber}'s run has not stopped (phase '${artifacts.run.phase}'); ` +
        "triage classifies a stop, and there is none to classify",
    );
  }
  const stop = artifacts.run.stop as NonNullable<DriverRun["stop"]>;
  const excluded = [
    ...new Set([identity.effectiveProvider, ...(options.alsoExclude ?? [])].map((p) => p.toLowerCase())),
  ];
  const prompt = buildTriagePrompt(artifacts);

  let result;
  try {
    result = await route(prompt, {
      taskType: "session-triage",
      role: ROLE_PRIMARY_REVIEWER,
      sessionNumber,
      excludeProviders: excluded,
      transport: options.transport ?? null,
    });
  } catch (error) {
    if (error instanceof NoCandidateError) {
      const unavailable = new TriageUnavailableError(
        `no adviser exists outside ${excluded.join(", ")}: ${error.message}`,
      );
      keepAdvice(repoRoot, sessionNumber, stop, { unreachable: unavailable.message });
      throw unavailable;
    }
    // Every way the router itself can fail arrives as a TriageError, so a
    // caller climbing a ladder sees "this rung did not answer" rather than
    // an exception it has no rung for. An outage, an expired key and a
    // rate limit are routine, and a ladder that fell over on one would
    // skip the human it is supposed to end at. A DispatchError names the
    // provider that failed, so the next rung asks somebody else.
    if (error instanceof RouterError) {
      const unreached = new TriageError(
        `the adviser could not be reached: ${error.message}`,
        error instanceof DispatchError ? error.provider : null,
      );
      keepAdvice(repoRoot, sessionNumber, stop, { unreachable: unreached.message });
      throw unreached;
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
  let outcome: TriageOutcome;
  try {
    outcome = {
      answer: parseTriageAnswer(result.content, artifacts.request !== null),
      adviser: { model: result.model_name, provider: result.provider },
      excluded,
      simulated: result.metadata["simulated"] === true,
    };
  } catch (error) {
    if (!(error instanceof TriageError)) throw error;
    // A check was asked for and the adviser answered: kept, so no view says
    // no check ran, and kept as no answer, because it could not be read.
    keepAdvice(repoRoot, sessionNumber, stop, {
      adviser: { model: result.model_name, provider: result.provider },
      unusable: error.message,
    });
    throw new TriageError(error.message, result.provider);
  }
  keepAdvice(repoRoot, sessionNumber, stop, { outcome });
  return outcome;
}

/**
 * The answer kept as an advice row in the run's `exceptions.jsonl`, the
 * adviser named -- or the fact that nobody could be reached, or that the
 * adviser's answer could not be used. Advice authorises nothing: no gate
 * reads it, and the card shows it in the adviser's words.
 */
function keepAdvice(
  repoRoot: string,
  sessionNumber: number,
  stop: NonNullable<DriverRun["stop"]>,
  said: {
    readonly outcome?: TriageOutcome;
    readonly unreachable?: string;
    readonly adviser?: { readonly model: string; readonly provider: string };
    readonly unusable?: string;
  },
): void {
  const unanswered =
    said.unusable !== undefined ? `the adviser's answer could not be used: ${said.unusable}` : (said.unreachable ?? null);
  appendAdvice(repoRoot, sessionNumber, {
    schema_version: 1,
    session_number: sessionNumber,
    advice: true,
    stop: { kind: stop.kind, code: stop.code ?? null, step_id: stop.step_id ?? null, reason: stop.reason, at: stop.at },
    adviser: said.outcome?.adviser ?? said.adviser ?? null,
    simulated: said.outcome?.simulated ?? false,
    answer: said.outcome?.answer ?? null,
    unreachable: unanswered,
    recorded_at: new Date().toISOString(),
  });
}

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
