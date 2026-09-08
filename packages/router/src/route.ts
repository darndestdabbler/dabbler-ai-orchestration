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
  loadConfig,
  resolveGenerationParams,
  resolveTransport,
  truthy,
  type RouterConfig,
} from "./config.ts";
import { recordCall, type CallRecord } from "./metrics.ts";
import { isNoRouterMode } from "./runtimeMode.ts";
import {
  ROLE_GENERATOR,
  explainRegistryCandidates,
  fellThroughWarning,
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
import {
  CopilotCliTransport,
  REFRESH_COMMAND,
  getCliVersion,
  loadCatalog,
  resolveLockfilePath,
  explainRoleCandidates,
  resolveTransportTimeouts,
  validateCatalog,
  type Catalog,
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
  /** Registry alias (API) or catalog id (Copilot). */
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
  copilotCatalog: Catalog | null;
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
  catalog: Catalog,
): void {
  state.copilotTransport = transport;
  state.copilotCatalog = catalog;
}

/**
 * Load and fail-closed-validate the seat catalog, and build the CLI
 * transport, once per process.
 *
 * An unreadable or invalid lockfile STOPS dispatch with an actionable
 * message. Never a silent fallback to the API transport: that would put a
 * cross-provider verification on the provider the operator was routing away
 * from, and nothing downstream could tell.
 *
 * The transport is cached because its invocation breaker is a per-process
 * count of billed spawns; a fresh transport per call would reset the ceiling
 * every time it mattered.
 */
function getCopilot(config: RouterConfig): [CopilotCliTransport, Catalog] {
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
  const lockfile = resolveLockfilePath(config);
  let catalog: Catalog;
  try {
    catalog = loadCatalog(lockfile);
  } catch (error: unknown) {
    throw new RouterError(
      `the copilot-cli catalog lockfile at '${lockfile}' could ` +
        `not be loaded (${error instanceof Error ? error.message : String(error)}). ` +
        `Rebuild it with \`${REFRESH_COMMAND} --all\`, or switch the transport ` +
        "back to 'api'.",
    );
  }

  const binary = String(cliConfig["binary"] ?? "copilot");
  const validation = validateCatalog(catalog, {
    liveCliVersion: getCliVersion({ binary }),
  });
  if (!validation.ok) {
    throw new RouterError(
      "the copilot-cli catalog lockfile failed fail-closed validation: " +
        validation.reasons.join("; "),
    );
  }
  for (const warning of validation.warnings) {
    process.stderr.write(`ai_router: copilot-cli catalog: ${warning}\n`);
  }

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
  /** Registry alias (API) or catalog id (Copilot). */
  readonly alias: string;
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
    `'${candidate.alias}' resolved to provider ` +
      `'${candidate.provider}', which this call excludes ` +
      `(${renderList(exclude)}). Refusing to dispatch.`,
  );
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
  const models = record(config["models"]);
  const resolution = explainRegistryCandidates(config, role, exclude);
  warnIfFellThrough(resolution, role);
  const ladder: Candidate[] = resolution.candidates.map(([, , alias]) => ({
    alias,
    model_id: String(record(models[alias])["model_id"]),
    provider: String(record(models[alias])["provider"]),
  }));
  if (ladder.length === 0) {
    throw new NoCandidateError(
      "no enabled model in router-config.yaml survives the " +
        `provider exclusion ${renderList(exclude)} for the '${role}' role ` +
        `(task_type='${taskType}'). Enable a model from a surviving ` +
        "provider, or set its API key.",
    );
  }
  return ladder;
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
  catalog: Catalog,
  role: string,
  exclude: readonly string[],
): Candidate[] {
  const resolution = explainRoleCandidates(config, catalog, role, exclude);
  warnIfFellThrough(resolution, role);
  const ladder: Candidate[] = resolution.candidates.map(
    ([modelId, provider]) => ({ alias: modelId, model_id: modelId, provider }),
  );
  if (ladder.length === 0) {
    throw new NoCandidateError(
      "copilot-cli: no confirmed catalog entry survives the " +
        `provider exclusion ${renderList(exclude)} for the '${role}' role`,
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
    model_name: candidate.alias,
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
    model: outcome.candidate.alias,
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
  readonly transport?: string | null;
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
  const role = options.role ?? ROLE_GENERATOR;

  if (isNoRouterMode()) return buildNoRouterStub();

  const config = getConfig();
  const transportName = resolveTransport(config, options.transport ?? null);
  const exclude = normalizeExclusions(options.excludeProviders);

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
        current.alias,
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
      escalationHistory.push([current.alias, step.reason as string]);
      index += 1;
      current = path.ladder[index] as Candidate;
      continue;
    }
    break;
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
          alias: OFFLINE_PROVIDER,
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

  const models = record(config["models"]);
  const providers = record(config["providers"]);
  return {
    ladder: apiLadder(config, role, taskType, exclude),
    escalates: true,
    dispatch: (candidate, systemPrompt, userMessage, genParams) => {
      const entry = record(models[candidate.alias]);
      const api = new DirectApiTransport(
        candidate.provider,
        record(providers[candidate.provider]),
      );
      return api.dispatch({
        model_id: candidate.model_id,
        system_prompt: systemPrompt,
        user_message: userMessage,
        max_tokens: Number(entry["max_output_tokens"]),
        generation_params: genParams,
      });
    },
    modelConfig: (candidate) => record(models[candidate.alias]),
    generationParams: (candidate) =>
      resolveGenerationParams(candidate.alias, taskType, config),
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
