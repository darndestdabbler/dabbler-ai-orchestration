// route(): one dispatch body over the Transport seam.
//
// Both transports run the same loop -- resolve the role, prompt, dispatch,
// escalate, record -- with two seams that differ per transport: which models
// the transport can enumerate (the model registry on the direct-API path,
// the confirmed seat catalog on the Copilot path), and how a call is
// dispatched. The role itself is applied by `./selection.ts` for both, so
// the ordering rule has one implementation.
//
// Nothing here computes a dollar. Tokens are recorded; reconciliation
// happens out of band against the vendor's own console.
//
// Prompt rendering lives here rather than in its own module because `route`
// is its only caller and the size decision it makes -- refuse an over-budget
// prompt, never trim one -- belongs to the dispatch path that would
// otherwise ship the truncated result.
//
// **This is async where Python is synchronous**, and that is the whole of
// the shape difference. `fetch` and a child process are the two ways a
// transport reaches a model under Node, and neither has a blocking form; a
// synchronous facade over either would stall the only thread the process
// has. `checks.execute` took the same shape in session 27 for the same
// reason.

import {
  TRANSPORT_COPILOT_CLI,
  TRANSPORT_OFFLINE,
  explainReviewingTransport,
  explainRoleTransport,
  loadConfig,
  providerDefaults,
  resolveGenerationParams,
  truthy,
  type RouterConfig,
} from "./config.ts";
import { apiBlock, apiSelectableModels } from "./discovery.ts";
import { recordCall, type CallRecord } from "./metrics.ts";
import { isNoRouterMode } from "./runtimeMode.ts";
import {
  REVIEWING_ROLES,
  fellThroughWarning,
  reviewerRefusal,
  type Candidate as RoleCandidate,
  type RoleResolution,
} from "./selection.ts";
import { isOk, type APIResult } from "./transports/base.ts";
import { DirectApiTransport } from "./transports/api.ts";
import {
  PROVIDER as OFFLINE_PROVIDER,
  OfflineTransport,
  resolveResponsesDir,
} from "./transports/offline.ts";
import { type CatalogModel } from "./catalog.ts";
import {
  CopilotCliTransport,
  REFRESH_COMMAND,
  explainRoleCandidates,
  resolveTransportTimeouts,
  seatModels,
} from "./transports/copilot.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/**
 * Base class for routing failures. Fail-loud by design -- never a silent
 * fallback to another transport or provider.
 */
export class RouterError extends Error {}

/**
 * No enabled model survives the provider exclusion. The caller's fail-closed
 * case, never a silent same-provider pick.
 */
export class NoCandidateError extends RouterError {}

/**
 * A candidate reached the call site with an excluded provider.
 *
 * Selection already filters on the exclusion, and this asserts it again
 * immediately before the wire. Cross-provider verification is the invariant
 * the whole framework rests on: a filter can be bypassed by a future
 * preference path, and an assertion at the call site cannot.
 */
export class ExcludedProviderError extends RouterError {}

/**
 * The transport reported a classified failure. Carries the failing provider
 * so a caller can retry excluding it.
 *
 * **Only the Copilot path raises this**, and its Python twin's docstring
 * claiming "exhausted retries on the API path" overstates what either
 * router does: the API transport throws its own plain error out of
 * `callModel` after the last retry, and neither `route` wraps it. A caller
 * that needs the provider and model of a failed API call therefore has to
 * carry them itself. Stated rather than changed, because changing it would
 * make the two routers disagree about which class a failed API call raises.
 */
export class DispatchError extends RouterError {
  readonly provider: string | null;
  readonly model: string | null;

  constructor(message: string, provider: string | null = null, model: string | null = null) {
    super(message);
    this.provider = provider;
    this.model = model;
  }
}

/**
 * The rendered prompt exceeds the model's input budget. Refused, not
 * trimmed: tail-chopping a review bundle drops the end of the diff while the
 * handoff acknowledgement -- appended by the transport after prompting --
 * still validates, so a truncated review returns a clean-looking verdict.
 */
export class PromptTooLargeError extends RouterError {}

// --- Prompt rendering -------------------------------------------------------

const DEFAULT_SYSTEM_PROMPT =
  "You are an expert software engineer. Be direct and precise.";

// Input share of the context window; the remainder is reserved for output.
const INPUT_BUDGET_FRACTION = 0.8;
const DEFAULT_MAX_CONTEXT_TOKENS = 200000;
const CHARS_PER_TOKEN = 4;

/**
 * Returns `[systemPrompt, userMessage]`. Applies the task-type template when
 * one exists, otherwise raw content + context. Throws `PromptTooLargeError`
 * when the message exceeds the model's input budget -- no code path returns
 * a silently truncated prompt.
 */
export function buildPrompt(
  content: string,
  context: string,
  taskType: string,
  modelConfig: Record<string, unknown>,
  config: RouterConfig,
): [string, string] {
  const systemPrompt = String(modelConfig["_system_prompt"] ?? DEFAULT_SYSTEM_PROMPT);

  const templates = record(config["_task_templates"]);
  let userMessage: string;
  if (taskType in templates) {
    userMessage = String(templates[taskType])
      .split("{content}")
      .join(content)
      .split("{context}")
      .join(context || "(no additional context)");
  } else if (context) {
    userMessage = `${content}\n\n---\n\nContext:\n${context}`;
  } else {
    userMessage = content;
  }

  const maxInputRaw = modelConfig["max_context_tokens"];
  const maxInput =
    maxInputRaw === undefined ? DEFAULT_MAX_CONTEXT_TOKENS : Number(maxInputRaw);
  const budgetTokens = Math.trunc(maxInput * INPUT_BUDGET_FRACTION);
  const estimatedTokens = Math.floor(userMessage.length / CHARS_PER_TOKEN);
  if (estimatedTokens > budgetTokens) {
    throw new PromptTooLargeError(
      `the rendered '${taskType}' prompt is ${userMessage.length} chars ` +
        `(~${estimatedTokens} tokens) against an input budget of ` +
        `${budgetTokens} tokens (${budgetTokens * CHARS_PER_TOKEN} ` +
        `chars, ${Math.trunc(INPUT_BUDGET_FRACTION * 100)}% of the model's ` +
        `${maxInput}-token window) -- an overrun of ` +
        `${estimatedTokens - budgetTokens} tokens. Map the session to ` +
        "a module in docs/modules.yaml so verification builds a bounded " +
        "scope instead of a whole-session bundle, split the session, or " +
        "route to a model with a larger window. The prompt is never " +
        "silently truncated to fit.",
    );
  }

  return [systemPrompt, userMessage];
}

export interface RouteResult {
  content: string;
  /**
   * What the model was known by, which is the id the source listed: there is
   * no alias on either transport. Kept beside `model_id` because it is the
   * name the record carries into `reviewer_model` and every sentence a
   * reader sees.
   */
  model_name: string;
  /** The id put on the wire. */
  model_id: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  escalated: boolean;
  /** `[model, reason]` pairs, in the order the ladder took them. */
  escalation_history: Array<readonly [string, string]>;
  elapsed_seconds: number;
  transport: string;
  /**
   * True when the response appears cut off: the provider reports
   * max_tokens, or a syntactic-completeness heuristic fires. The heuristic
   * exists because providers have returned end_turn on visibly truncated
   * output; the stop reason alone is not sufficient.
   */
  truncated: boolean;
  /**
   * The CLI conversation id on the Copilot path -- the join key that makes
   * this call's real seat cost recoverable via `seat_cost`.
   */
  transport_session_id: string | null;
  served_model_id: string | null;
  metadata: Record<string, unknown>;
}

const NO_ROUTER_MODEL = "no-router-mode";

/**
 * Zero-cost stub for --no-router invocations: no config load, no credential
 * check, no network.
 */
function buildNoRouterStub(): RouteResult {
  return {
    content: "",
    model_name: NO_ROUTER_MODEL,
    model_id: NO_ROUTER_MODEL,
    provider: NO_ROUTER_MODEL,
    input_tokens: 0,
    output_tokens: 0,
    escalated: false,
    escalation_history: [],
    elapsed_seconds: 0.0,
    transport: "none",
    truncated: false,
    transport_session_id: null,
    served_model_id: null,
    metadata: {},
  };
}

// --- Escalation triggers ----------------------------------------------------

const DEFAULT_MIN_OUTPUT_TOKENS = 30;

function minOutputTokens(escalationConfig: Record<string, unknown>): number {
  const triggers = record(escalationConfig["triggers"]);
  return "min_output_tokens" in triggers
    ? Number(triggers["min_output_tokens"])
    : DEFAULT_MIN_OUTPUT_TOKENS;
}

function refusalPhrases(escalationConfig: Record<string, unknown>): string[] {
  const phrases = escalationConfig["refusal_phrases"];
  return (Array.isArray(phrases) ? phrases : []).map((phrase) => String(phrase));
}

/** True when a response indicates the model couldn't handle the task. */
export function shouldEscalate(
  result: APIResult,
  escalationConfig: Record<string, unknown>,
): boolean {
  const triggers = record(escalationConfig["triggers"]);

  if (truthy(triggers["empty_response"]) && result.content.trim() === "") return true;
  if (truthy(triggers["max_tokens_hit"]) && result.stop_reason === "max_tokens") {
    return true;
  }
  // Only when tokens were actually reported: the Copilot CLI omits the count
  // on some events, and an unmeasured count is not a short response.
  if (result.output_tokens && result.output_tokens < minOutputTokens(escalationConfig)) {
    return true;
  }
  if (truthy(triggers["refusal_detection"])) {
    const lower = result.content.toLowerCase();
    for (const phrase of refusalPhrases(escalationConfig)) {
      if (lower.includes(phrase)) return true;
    }
  }
  return false;
}

export function classifyEscalationReason(
  result: APIResult,
  escalationConfig: Record<string, unknown>,
): string {
  if (result.content.trim().length === 0) return "empty_response";
  if (result.stop_reason === "max_tokens") return "truncated";
  if (result.output_tokens < minOutputTokens(escalationConfig)) return "too_short";
  for (const phrase of refusalPhrases(escalationConfig)) {
    if (result.content.toLowerCase().includes(phrase)) return "refusal";
  }
  return "unknown";
}

const SENTENCE_ENDINGS = ".!?)`\"'";

/**
 * Provider signal plus a conservative syntactic heuristic: an odd count of
 * triple-backtick fences, or more `{` than `}` in output that also STOPS
 * ABRUPTLY. The abrupt-ending condition is what separates cut-off code from
 * prose that merely discusses braces -- a complete review of brace-matching
 * code quoted seven `{` against six `}`, ended in a full sentence, and was
 * discarded as truncated, losing the verdict. Parentheses are deliberately
 * not checked (prose false-positives).
 */
export function detectTruncation(content: string, stopReason: string): boolean {
  if (stopReason === "max_tokens") return true;
  const stripped = content.replace(/\s+$/u, "");
  if (stripped === "") return false; // empty response is a different failure mode
  if (countOf(stripped, "```") % 2 === 1) return true;
  const last = stripped[stripped.length - 1] as string;
  if (SENTENCE_ENDINGS.includes(last)) return false;
  return countOf(stripped, "{") > countOf(stripped, "}");
}

/** Python's `str.count`: non-overlapping occurrences. */
function countOf(text: string, needle: string): number {
  let count = 0;
  let index = text.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(needle, index + needle.length);
  }
  return count;
}

/**
 * Per-provider token-bucket on request count.
 *
 * Python holds a lock across the sleep, so two threads cannot both decide
 * they are under the ceiling. Node has one thread but the same hazard: two
 * awaited `wait()` calls would otherwise interleave inside the window. The
 * promise chain is that lock -- each call waits for the previous one to
 * release before it reads the window.
 */
export class RateLimiter {
  readonly rpm: number;
  readonly tpm: number;
  private requestTimes: number[] = [];
  private tail: Promise<void> = Promise.resolve();

  constructor(requestsPerMinute: number, tokensPerMinute: number) {
    this.rpm = requestsPerMinute;
    this.tpm = tokensPerMinute;
  }

  async wait(): Promise<void> {
    const previous = this.tail;
    let release = (): void => {};
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const now = Date.now() / 1000;
      this.requestTimes = this.requestTimes.filter((time) => time > now - 60.0);
      if (this.requestTimes.length >= this.rpm) {
        const sleepDuration = (this.requestTimes[0] as number) + 60.0 - now;
        if (sleepDuration > 0) {
          await new Promise((done) => setTimeout(done, sleepDuration * 1000));
        }
      }
      this.requestTimes.push(Date.now() / 1000);
    } finally {
      release();
    }
  }
}

// --- Process-level state ----------------------------------------------------

interface RouteState {
  config: RouterConfig | null;
  rateLimiters: Record<string, RateLimiter>;
  copilotTransport: CopilotCliTransport | null;
  copilotCatalog: readonly CatalogModel[] | null;
}

const state: RouteState = {
  config: null,
  rateLimiters: {},
  copilotTransport: null,
  copilotCatalog: null,
};

export function resetForTests(): void {
  state.config = null;
  state.rateLimiters = {};
  state.copilotTransport = null;
  state.copilotCatalog = null;
}

/**
 * Put a seat in the process's hands without a lockfile or a CLI.
 *
 * The seat branch resolves its transport from configuration and its
 * candidates from a file on disk, and a test of the ROUTING has no business
 * arranging either. Everything downstream of this -- the ladder, the
 * exclusion, the escalation, the metrics row -- is the code that ships.
 */
export function installCopilotForTests(
  transport: CopilotCliTransport,
  catalog: readonly CatalogModel[],
): void {
  state.copilotTransport = transport;
  state.copilotCatalog = catalog;
}

/**
 * Read the seat's models from this machine's catalog, and build the CLI
 * transport, once per process.
 *
 * A catalog this machine has not read yet STOPS dispatch with an actionable
 * message, and the action is one free command. Never a silent fallback to
 * the API transport: that would put a cross-provider verification on the
 * provider the operator was routing away from, and nothing downstream could
 * tell.
 *
 * The transport is cached because its invocation breaker is a per-process
 * count of billed spawns; a fresh transport per call would reset the ceiling
 * every time it mattered.
 */
function getCopilot(config: RouterConfig): [CopilotCliTransport, readonly CatalogModel[]] {
  if (state.copilotTransport !== null && state.copilotCatalog !== null) {
    return [state.copilotTransport, state.copilotCatalog];
  }

  const cliConfig = record(config["transports"])[TRANSPORT_COPILOT_CLI];
  if (!isRecord(cliConfig)) {
    throw new RouterError(
      "the copilot-cli transport is selected but router-config.yaml " +
        "has no transports.copilot-cli block",
    );
  }
  const catalog = seatModels();
  if (catalog === null || catalog.length === 0) {
    throw new RouterError(
      "the copilot-cli transport is selected and this machine's model " +
        "catalog holds nothing for it. Read the seat's own list with " +
        `\`${REFRESH_COMMAND}\` -- it costs nothing and sends no prompt -- ` +
        "or switch the transport back to 'api'.",
    );
  }

  const binary = String(cliConfig["binary"] ?? "copilot");
  const maxInvocations = cliConfig["max_invocations_per_session"];
  state.copilotCatalog = catalog;
  state.copilotTransport = new CopilotCliTransport({
    binary,
    timeouts: resolveTransportTimeouts(cliConfig),
    maxInvocations: typeof maxInvocations === "number" ? maxInvocations : null,
  });
  return [state.copilotTransport, catalog];
}

function getConfig(): RouterConfig {
  if (state.config === null) {
    const config = loadConfig();
    state.config = config;
    state.rateLimiters = {};
    for (const [name, providerConfig] of Object.entries(record(config["providers"]))) {
      const limits = record(record(providerConfig)["rate_limit"]);
      state.rateLimiters[name] = new RateLimiter(
        Number(limits["requests_per_minute"]),
        Number(limits["tokens_per_minute"]),
      );
    }
  }
  return state.config;
}

// --- The one dispatch body --------------------------------------------------

export interface Candidate {
  /**
   * The id that goes on the wire, which is the id the source listed.
   *
   * There is no second name for it. This carried an `alias` beside it while
   * a registry sat in front of the vendors' own lists; the registry is gone,
   * both ladders set the two from the same string, and a field that is
   * always equal to its neighbour is a field two readers will eventually
   * disagree about.
   */
  readonly model_id: string;
  readonly provider: string;
}

/**
 * The exclusion as the dispatch reads it: trimmed, lowercased, de-duplicated
 * and ordered, so a caller's spelling cannot decide whether a provider is
 * excluded.
 */
export function normalizeExclusions(
  excludeProviders: readonly string[] | null | undefined,
): string[] {
  return [
    ...new Set(
      (excludeProviders ?? [])
        .filter((provider) => Boolean(provider))
        .map((provider) => String(provider).trim().toLowerCase()),
    ),
  ].sort();
}

/**
 * The exclusion asserted at the CALL SITE, not only where candidates were
 * filtered.
 *
 * Cross-provider review is the one invariant a later preference path must
 * not be able to undo, so it is checked again immediately before the wire.
 * No current path can reach this refusal, which is exactly why it is a
 * function rather than a line inside the loop: the day a preference path
 * does reach it, this is what stops the dispatch.
 */
export function assertNotExcluded(
  candidate: Candidate,
  exclude: readonly string[],
): void {
  if (!exclude.includes(candidate.provider)) return;
  throw new ExcludedProviderError(
    `'${candidate.model_id}' resolved to provider ` +
      `'${candidate.provider}', which this call excludes ` +
      `(${renderList(exclude)}). Refusing to dispatch.`,
  );
}

/**
 * The one rule, asserted where a dispatch cannot get past it.
 *
 * A pin is honoured over the caller's provider exclusion, deliberately: a
 * default does not overrule a person. But a pin outlives the session that
 * set it, and `configure` can only check it against the author of the day it
 * was written -- so the next session declares a different model, the pin is
 * still honoured, and the model reviews its own literal output. Checked
 * again here, against the author this call actually has, because a rule the
 * surface keeps and the runtime does not is not a rule.
 *
 * The words are `reviewerRefusal`'s, so the operator reads one sentence
 * wherever this is refused.
 */
export function assertNotTheAuthor(
  candidate: Candidate,
  authorModel: string | null | undefined,
): void {
  if (!authorModel) return;
  const refusal = reviewerRefusal(authorModel, candidate.model_id);
  if (refusal === null) return;
  throw new ExcludedProviderError(`${refusal} Refusing to dispatch.`);
}

/**
 * The direct-API ladder for a role: every enabled, reachable, unexcluded
 * registry entry in the role's order. Empty is not a ladder -- a call with
 * nothing to dispatch to fails closed here rather than silently picking a
 * provider the caller ruled out.
 */
export function apiLadder(
  config: RouterConfig,
  role: string,
  taskType: string,
  exclude: readonly string[],
): Candidate[] {
  // The catalog is the inventory on this path as it already is on the seat's:
  // what this machine's own vendors listed, scoped to the keys that read them,
  // so a block recorded for a different key set reads as unread rather than
  // believed. There is no alias -- the id the vendor lists is the id that goes
  // on the wire.
  const block = apiBlock(config);
  // Reachability is the direct-API path own guard, applied here and not in
  // the shared enumeration rule: a seat has no provider keys at all.
  const resolution = explainRoleCandidates(config, apiSelectableModels(config, block), role, exclude);
  warnIfFellThrough(resolution, role);
  const ladder: Candidate[] = resolution.candidates.map(([modelId, provider]) => ({
    model_id: modelId,
    provider,
  }));
  if (ladder.length === 0) {
    throw new NoCandidateError(unreachableLadder(resolution, role, taskType, exclude, block === null));
  }
  return ladder;
}

/**
 * Why a ladder is empty, in words the person who has to act can act on.
 *
 * A SELECTION nobody can dispatch to is its own situation and is named as
 * one: the operator chose that model, and telling them "no candidate
 * survived the exclusion" would leave out the half of the sentence they can
 * act on. It never falls to the next model, because falling through is the
 * silent substitution a selection exists to stop.
 */
function unreachableLadder(
  resolution: RoleResolution<readonly [string, string]>,
  role: string,
  taskType: string,
  exclude: readonly string[],
  unread: boolean,
): string {
  if (resolution.selectedUnmet !== null) {
    return (
      `you chose '${resolution.selectedUnmet}' for the '${role}' role, and ` +
      "this call cannot dispatch to it: " +
      (unread
        ? "this machine has not read its model lists yet, or holds a " +
          "reading taken for a different seat or set of keys"
        : "the transport in force does not list that model, its provider " +
          `has no key here, or this call excludes its provider ` +
          `(${renderList(exclude)})`) +
      `. Nothing was substituted for it. Refresh the catalog with \`${REFRESH_COMMAND}\`, ` +
      "or choose a model this call can reach with `dabbler configure " +
      "--reviewer-model <id>`."
    );
  }
  return (
    (unread
      ? "this machine has not read its providers' model lists yet, or it " +
        "holds a reading taken for a different set of keys -- " +
        `\`${REFRESH_COMMAND}\` reads them, free. `
      : "no model this machine's providers list survives the ") +
    `provider exclusion ${renderList(exclude)} for the '${role}' role ` +
    `(task_type='${taskType}'). Set a surviving provider's API key, or ` +
    "refresh the catalog."
  );
}

/**
 * Say it before the round is spent, not only in the ledger afterwards.
 *
 * One line on stderr, through the same channel the catalog's own warnings
 * use, so it reaches the Dabbler terminal and the session transcript while
 * there is still a person who could stop it. The 364-request session had
 * this fact available at selection time and printed nothing.
 */
function warnIfFellThrough<T extends RoleCandidate>(
  resolution: RoleResolution<T>,
  role: string,
): void {
  const warning = fellThroughWarning(resolution, role);
  if (warning !== null) process.stderr.write(`ai_router: ${warning}\n`);
}

/** The same, over the seat's confirmed catalog. */
export function seatLadder(
  config: RouterConfig,
  catalog: readonly CatalogModel[],
  role: string,
  exclude: readonly string[],
): Candidate[] {
  const resolution = explainRoleCandidates(config, catalog, role, exclude);
  warnIfFellThrough(resolution, role);
  const ladder: Candidate[] = resolution.candidates.map(
    ([modelId, provider]) => ({ model_id: modelId, provider }),
  );
  if (ladder.length === 0) {
    throw new NoCandidateError(
      unreachableLadder(resolution, role, "seat", exclude, catalog.length === 0),
    );
  }
  return ladder;
}

/**
 * Whether the ladder takes another step, and what to record for the one it
 * leaves.
 *
 * Two independent limits bound it -- how many models remain, and how many
 * escalations the config allows -- and a run that escalated past either
 * would spend a call the operator capped.
 */
export function escalationStep(
  result: APIResult,
  escalationConfig: Record<string, unknown>,
  position: {
    readonly escalates: boolean;
    readonly index: number;
    readonly ladderLength: number;
    readonly escalationsSoFar: number;
    readonly maxEscalations: number;
  },
): { escalate: boolean; reason: string | null } {
  const escalate =
    position.escalates &&
    truthy(escalationConfig["enabled"]) &&
    shouldEscalate(result, escalationConfig) &&
    position.escalationsSoFar < position.maxEscalations &&
    position.index + 1 < position.ladderLength;
  return {
    escalate,
    reason: escalate ? classifyEscalationReason(result, escalationConfig) : null,
  };
}

/**
 * Whether this task type's answer is reviewed before it is returned.
 *
 * A verification is never itself verified: the recursion would bill a
 * vendor for every level of it.
 */
export function shouldAutoVerify(config: RouterConfig, taskType: string): boolean {
  const verification = record(config["verification"]);
  const autoTypes = verification["auto_verify_task_types"];
  return (
    truthy(verification["enabled"]) &&
    (Array.isArray(autoTypes) ? autoTypes : []).includes(taskType) &&
    taskType !== "verification" &&
    taskType !== "session-verification"
  );
}

/** One completed dispatch, as both the answer and the telemetry row read it. */
export interface DispatchOutcome {
  readonly candidate: Candidate;
  readonly result: APIResult;
  readonly elapsedSeconds: number;
  readonly generationParams: Record<string, unknown>;
  readonly escalationHistory: ReadonlyArray<readonly [string, string]>;
  readonly transport: string;
  readonly taskType: string;
  readonly sessionNumber?: number | null;
}

/** The seat's conversation id, which is the only thing that can price a seat call. */
function seatSessionId(outcome: DispatchOutcome): string | null {
  if (outcome.transport !== TRANSPORT_COPILOT_CLI) return null;
  return (outcome.result.metadata["session_id"] ?? null) as string | null;
}

/** The answer a caller gets back. */
export function routeResultOf(outcome: DispatchOutcome): RouteResult {
  const { candidate, result } = outcome;
  return {
    content: result.content,
    model_name: candidate.model_id,
    model_id: candidate.model_id,
    provider: candidate.provider,
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    escalated: outcome.escalationHistory.length > 0,
    escalation_history: [...outcome.escalationHistory],
    elapsed_seconds: outcome.elapsedSeconds,
    transport: outcome.transport,
    truncated: detectTruncation(result.content, result.stop_reason),
    transport_session_id: seatSessionId(outcome),
    served_model_id: result.served_model_id ?? null,
    metadata: { ...result.metadata },
  };
}

/** The telemetry row the same dispatch writes. */
export function routeCallRecordOf(outcome: DispatchOutcome): CallRecord {
  const onSeat = outcome.transport === TRANSPORT_COPILOT_CLI;
  return {
    callType: "route",
    taskType: outcome.taskType,
    model: outcome.candidate.model_id,
    provider: outcome.candidate.provider,
    generationParams: outcome.generationParams,
    inputTokens: outcome.result.input_tokens,
    outputTokens: outcome.result.output_tokens,
    elapsedSeconds: outcome.elapsedSeconds,
    escalated: outcome.escalationHistory.length > 0,
    stopReason: outcome.result.stop_reason,
    sessionNumber: outcome.sessionNumber ?? null,
    requestedModelId: outcome.candidate.model_id,
    servedModelId: outcome.result.served_model_id ?? null,
    transport: outcome.transport,
    // Real spend on a seat, and not attributable here: the conversation id
    // is what prices it.
    billedUsageUnavailable: onSeat ? true : null,
    transportSessionId: seatSessionId(outcome),
  };
}

/** The four seams a transport fills, so the loop below is written once. */
interface Path {
  readonly ladder: readonly Candidate[];
  readonly escalates: boolean;
  dispatch(
    candidate: Candidate,
    systemPrompt: string,
    userMessage: string,
    genParams: Record<string, unknown>,
  ): Promise<APIResult>;
  modelConfig(candidate: Candidate): Record<string, unknown>;
  generationParams(candidate: Candidate): Record<string, unknown>;
  rateLimit(candidate: Candidate): Promise<void>;
}

export interface RouteOptions {
  readonly taskType?: string;
  readonly context?: string;
  readonly role?: string;
  readonly sessionNumber?: number | null;
  readonly excludeProviders?: readonly string[] | null;
  /**
   * The model this call's work was authored by, where the caller knows it.
   *
   * The one rule is asserted immediately before the wire from this, not only
   * where a choice is written. `configure` refuses a reviewer equal to the
   * author when the pin is SET, and a pin outlives the session it was set
   * in: the next session declares a different model at `session start`, the
   * pin is honoured over the caller's provider exclusion because a default
   * does not overrule a person, and the model reviews its own output. A
   * rule the surface keeps and the runtime does not is the split session 144
   * exists to close.
   */
  readonly authorModel?: string | null;
  readonly transport?: string | null;
  /**
   * Which checkout's configuration decides the vehicle.
   *
   * A vehicle is a property of a REPOSITORY -- one may need the seat while
   * another runs on keys -- so a call about a named repository must read
   * that one. Omitted, it is the project the router is standing in, which is
   * right for a command line and wrong for anything acting on a repository
   * it was handed: a verification round for repository X read whatever
   * checkout the process happened to be in.
   */
  readonly repoRoot?: string | null;
  /**
   * One further turn, decided from the first answer. Return the text to send
   * back, or null to send nothing and let the first answer stand.
   *
   * It is called once and the ceiling is two dispatches per call: the
   * follow-up's own answer is never offered to it again, so there is no loop
   * to bound and no cost to predict beyond twice the payload. The second turn
   * goes to the candidate the first one settled on -- same model, same
   * provider, same transport -- because a continuation that changed models
   * would be a different opinion wearing the first one's record.
   */
  readonly followUp?: ((answer: string) => string | null) | null;
}

/**
 * Route a task to this role's first surviving candidate and dispatch it.
 *
 * `excludeProviders` is a hard constraint no preference can override; an
 * exclusion that leaves no candidate raises `NoCandidateError` (fail closed,
 * never a silent same-provider pick), and it is asserted again at the call
 * site. `transport` overrides the resolved transport preference for this
 * call.
 */
export async function route(
  content: string,
  options: RouteOptions = {},
): Promise<RouteResult> {
  return routeSource(content, options);
}

/**
 * How a routed call becomes an answer: the one seam between the router's
 * callers and the transports. The default is the live dispatch and
 * production code never swaps it; a test feeds scripted replies through here
 * -- with a provider on each, so the cross-vendor rules can be exercised --
 * instead of replacing the module.
 */
export type RouteSource = (content: string, options: RouteOptions) => Promise<RouteResult>;

let routeSource: RouteSource = routeLive;

/** Swap the source of routed answers; the returned function restores the previous one. */
export function setRouteSource(source: RouteSource): () => void {
  const previous = routeSource;
  routeSource = source;
  return () => {
    routeSource = previous;
  };
}

async function routeLive(
  content: string,
  options: RouteOptions = {},
): Promise<RouteResult> {
  const taskType = options.taskType ?? "general";
  const context = options.context ?? "";
  // Named by the caller, always. It used to fall back to a 'generator' role
  // that nothing dispatched -- every one of this function's four callers
  // names a role, and none named that one -- so the fallback's only effect
  // was to give the pane a second author it could filter the wrong list
  // against.
  const role = options.role;
  if (role === undefined || role.trim() === "") {
    throw new RouterError(
      "route() needs the role this call is dispatching as: a role decides " +
        "which models may answer and what generation settings they get, and " +
        "there is no default worth guessing.",
    );
  }

  if (isNoRouterMode()) return buildNoRouterStub();

  const config = getConfig();
  // **The ROLE's vehicle, not the machine's.** Every role is dispatched
  // through something, and it is not always the same something: this module
  // has said since the transport reading was written that reviewer selection
  // may use the other transport when provider independence requires it, and
  // a dispatch that read one global transport was the half of that sentence
  // nothing did. A role that declares none resolves exactly as the machine
  // does, so a repository that never wanted two vehicles has one.
  // **The REVIEWING pair share one vehicle; every other role keeps its own.**
  // The two reviewers differ in what they may not BE and not in how they are
  // reached, and the auxiliary's separate vehicle was state no surface could
  // show or set. A generator that declares its own is still dispatched over
  // it, which is the config-tier answer `explainRoleTransport` gives.
  const vehicle = REVIEWING_ROLES.has(role)
    ? explainReviewingTransport(config, options.transport ?? null, options.repoRoot ?? null)
    : explainRoleTransport(config, role, options.transport ?? null, options.repoRoot ?? null);
  const transportName = vehicle.transport;
  // The caller's exclusion, used both to build the ladder and to re-assert
  // immediately before the wire. It ALWAYS applies: a selection narrows the
  // candidates and never widens them past it, because a selection that
  // bypassed the exclusion let a model that reviewed round 1 adjudicate its
  // own disputed finding.
  const exclude = [
    ...new Set((options.excludeProviders ?? []).map((name) => String(name).trim().toLowerCase())),
  ].sort();

  const path = buildPath(config, transportName, role, taskType, exclude);

  const escalationConfig = record(config["escalation"]);
  const maxEscalations = Number(escalationConfig["max_escalations"]);
  const escalationHistory: Array<readonly [string, string]> = [];
  let index = 0;
  let current = path.ladder[0] as Candidate;
  let result: APIResult;
  let elapsed: number;
  let genParams: Record<string, unknown>;

  for (;;) {
    assertNotExcluded(current, exclude);
    // The pin is honoured over the exclusion; it is not honoured over the
    // one rule. Asserted per candidate, so an escalation cannot step onto
    // the author either.
    assertNotTheAuthor(current, options.authorModel);

    const [systemPrompt, userMessage] = buildPrompt(
      content,
      context,
      taskType,
      path.modelConfig(current),
      config,
    );
    genParams = path.generationParams(current);
    await path.rateLimit(current);
    const start = Date.now();
    result = await path.dispatch(current, systemPrompt, userMessage, genParams);
    elapsed = (Date.now() - start) / 1000;

    if (!isOk(result)) {
      const stderrTail = String(result.metadata["stderr_tail"] ?? "");
      throw new DispatchError(
        `dispatch of '${current.model_id}' over ${transportName} ` +
          `failed: ${String(result.metadata["error_class"])} ` +
          `(${stderrTail.slice(-300)})`,
        current.provider,
        current.model_id,
      );
    }

    const step = escalationStep(result, escalationConfig, {
      escalates: path.escalates,
      index,
      ladderLength: path.ladder.length,
      escalationsSoFar: escalationHistory.length,
      maxEscalations,
    });
    if (step.escalate) {
      escalationHistory.push([current.model_id, step.reason as string]);
      index += 1;
      current = path.ladder[index] as Candidate;
      continue;
    }
    break;
  }

  // The one further turn. Straight-line code rather than another loop,
  // because the ceiling is a property of the shape and not of a counter
  // somebody has to keep correct: `followUp` is asked once, about the first
  // answer, and is never shown the second.
  const continuation = options.followUp ? options.followUp(result.content) : null;
  if (continuation !== null && continuation !== undefined) {
    const [systemPrompt, userMessage] = buildPrompt(
      `${content}\n\n---\n\n## Your previous answer\n\n${result.content}\n\n---\n\n${continuation}`,
      context,
      taskType,
      path.modelConfig(current),
      config,
    );
    await path.rateLimit(current);
    const start = Date.now();
    const second = await path.dispatch(current, systemPrompt, userMessage, genParams);
    elapsed += (Date.now() - start) / 1000;
    if (!isOk(second)) {
      // No falling back to the first answer: it was given before the files
      // arrived, so it is not the answer the second turn was asked for.
      const stderrTail = String(second.metadata["stderr_tail"] ?? "");
      throw new DispatchError(
        `the follow-up turn of '${current.model_id}' over ${transportName} ` +
          `failed: ${String(second.metadata["error_class"])} ` +
          `(${stderrTail.slice(-300)})`,
        current.provider,
        current.model_id,
      );
    }
    // What the call cost is both turns; what it said is the second one.
    result = {
      ...second,
      input_tokens: result.input_tokens + second.input_tokens,
      output_tokens: result.output_tokens + second.output_tokens,
    };
  }

  const outcome: DispatchOutcome = {
    candidate: current,
    result,
    elapsedSeconds: elapsed,
    generationParams: genParams,
    escalationHistory,
    transport: transportName,
    taskType,
    sessionNumber: options.sessionNumber ?? null,
  };
  recordCall(config, routeCallRecordOf(outcome));
  const routeResult = routeResultOf(outcome);

  if (shouldAutoVerify(config, taskType)) {
    // Imported here rather than at module scope because `verifyjob` calls
    // back into `route`; Python defers the same edge the same way.
    const { autoVerify } = await import("./verifyjob.ts");
    const outcome = await autoVerify(routeResult, content, taskType, config);
    if (outcome !== null) routeResult.metadata["verification"] = outcome;
  }

  return routeResult;
}

/** Python renders a list of strings as `['a', 'b']`. */
function renderList(items: readonly string[]): string {
  return `[${items.map((item) => `'${item}'`).join(", ")}]`;
}

function buildPath(
  config: RouterConfig,
  transportName: string,
  role: string,
  taskType: string,
  exclude: readonly string[],
): Path {
  if (transportName === TRANSPORT_OFFLINE) {
    const transport = new OfflineTransport(resolveResponsesDir(config));
    return {
      // One candidate, no ladder: escalating between scripted responses
      // would consume the queue to hide a script the operator wrote on
      // purpose.
      ladder: [
        {
          model_id: OFFLINE_PROVIDER,
          provider: OFFLINE_PROVIDER,
        },
      ],
      escalates: false,
      dispatch: (candidate, systemPrompt, userMessage) =>
        transport.dispatch({
          model_id: candidate.model_id,
          system_prompt: systemPrompt,
          user_message: userMessage,
        }),
      modelConfig: () => ({}),
      generationParams: () => ({}),
      rateLimit: () => Promise.resolve(),
    };
  }

  if (transportName === TRANSPORT_COPILOT_CLI) {
    const [transport, catalog] = getCopilot(config);
    return {
      ladder: seatLadder(config, catalog, role, exclude),
      escalates: true,
      dispatch: (candidate, systemPrompt, userMessage) =>
        transport.dispatch({
          model_id: candidate.model_id,
          system_prompt: systemPrompt,
          user_message: userMessage,
        }),
      modelConfig: () => ({}),
      // The CLI exposes no generation knobs.
      generationParams: () => ({}),
      // The seat is billed per request, not per token, and the CLI does its
      // own pacing; a limiter here would be a second, invented ceiling.
      rateLimit: () => Promise.resolve(),
    };
  }

  const providers = record(config["providers"]);
  return {
    ladder: apiLadder(config, role, taskType, exclude),
    escalates: true,
    dispatch: (candidate, systemPrompt, userMessage, genParams) => {
      const defaults = providerDefaults(config, candidate.provider);
      const api = new DirectApiTransport(
        candidate.provider,
        record(providers[candidate.provider]),
      );
      return api.dispatch({
        model_id: candidate.model_id,
        system_prompt: systemPrompt,
        user_message: userMessage,
        max_tokens: Number(defaults["max_output_tokens"]),
        generation_params: genParams,
      });
    },
    modelConfig: (candidate) => providerDefaults(config, candidate.provider),
    generationParams: (candidate) =>
      resolveGenerationParams(candidate.provider, taskType, config),
    rateLimit: (candidate) => {
      const limiter = state.rateLimiters[candidate.provider];
      if (limiter === undefined) {
        // Unreachable: a candidate only survives selection if its provider
        // is configured, and every configured provider gets a limiter.
        // Loud rather than silent, because the silent branch here is a rate
        // limit that quietly stopped being applied.
        throw new RouterError(
          `no rate limiter for provider '${candidate.provider}'`,
        );
      }
      return limiter.wait();
    },
  };
}
