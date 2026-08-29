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
import { recordCall } from "./metrics.ts";
import { isNoRouterMode } from "./runtimeMode.ts";
import { ROLE_GENERATOR, registryCandidates } from "./selection.ts";
import { isOk, type APIResult } from "./transports/base.ts";
import { DirectApiTransport } from "./transports/api.ts";
import {
  PROVIDER as OFFLINE_PROVIDER,
  OfflineTransport,
  resolveResponsesDir,
} from "./transports/offline.ts";

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
}

const state: RouteState = { config: null, rateLimiters: {} };

export function resetForTests(): void {
  state.config = null;
  state.rateLimiters = {};
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

interface Candidate {
  /** Registry alias (API) or catalog id (Copilot). */
  readonly alias: string;
  readonly model_id: string;
  readonly provider: string;
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
  const taskType = options.taskType ?? "general";
  const context = options.context ?? "";
  const role = options.role ?? ROLE_GENERATOR;

  if (isNoRouterMode()) return buildNoRouterStub();

  const config = getConfig();
  const transportName = resolveTransport(config, options.transport ?? null);
  const exclude = [
    ...new Set(
      (options.excludeProviders ?? [])
        .filter((provider) => Boolean(provider))
        .map((provider) => String(provider).trim().toLowerCase()),
    ),
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
    // The exclusion is asserted here and not only where candidates were
    // filtered: this is the call site, and cross-provider review is the one
    // invariant a later preference path must not be able to undo.
    if (exclude.includes(current.provider)) {
      throw new ExcludedProviderError(
        `'${current.alias}' resolved to provider ` +
          `'${current.provider}', which this call excludes ` +
          `(${renderList(exclude)}). Refusing to dispatch.`,
      );
    }

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

    if (
      path.escalates &&
      truthy(escalationConfig["enabled"]) &&
      shouldEscalate(result, escalationConfig) &&
      escalationHistory.length < maxEscalations &&
      index + 1 < path.ladder.length
    ) {
      escalationHistory.push([
        current.alias,
        classifyEscalationReason(result, escalationConfig),
      ]);
      index += 1;
      current = path.ladder[index] as Candidate;
      continue;
    }
    break;
  }

  const onCopilot = transportName === TRANSPORT_COPILOT_CLI;
  const sessionId = onCopilot
    ? ((result.metadata["session_id"] ?? null) as string | null)
    : null;

  recordCall(config, {
    callType: "route",
    taskType,
    model: current.alias,
    provider: current.provider,
    generationParams: genParams,
    inputTokens: result.input_tokens,
    outputTokens: result.output_tokens,
    elapsedSeconds: elapsed,
    escalated: escalationHistory.length > 0,
    stopReason: result.stop_reason,
    sessionNumber: options.sessionNumber ?? null,
    requestedModelId: current.model_id,
    servedModelId: result.served_model_id ?? null,
    transport: transportName,
    billedUsageUnavailable: onCopilot ? true : null,
    transportSessionId: sessionId,
  });

  const routeResult: RouteResult = {
    content: result.content,
    model_name: current.alias,
    model_id: current.model_id,
    provider: current.provider,
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    escalated: escalationHistory.length > 0,
    escalation_history: escalationHistory,
    elapsed_seconds: elapsed,
    transport: transportName,
    truncated: detectTruncation(result.content, result.stop_reason),
    transport_session_id: sessionId,
    served_model_id: result.served_model_id ?? null,
    metadata: { ...result.metadata },
  };

  const verificationConfig = record(config["verification"]);
  const autoTypes = verificationConfig["auto_verify_task_types"];
  if (
    truthy(verificationConfig["enabled"]) &&
    (Array.isArray(autoTypes) ? autoTypes : []).includes(taskType) &&
    taskType !== "verification" &&
    taskType !== "session-verification"
  ) {
    // `verifyjob.auto_verify` lands in session 32. Refused by name rather
    // than skipped: a router that quietly dropped the auto-verification a
    // config asked for would return an unverified result that looks
    // verified, and this is the one branch where silence is the failure.
    throw new RouterError(
      `verification.auto_verify_task_types names '${taskType}', and the ` +
        "auto-verification job it asks for is ported in session 32 of the " +
        "port plan (ai_router.verifyjob). Until then this router refuses " +
        "the call rather than returning a result that was never verified.",
    );
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
    // The seat's dispatch state machine -- spawn, the three timeouts, the
    // temp-file handoff, the stderr taxonomy -- is session 30. Refused by
    // name, the way `session close` was until the lifecycle landed: a
    // transport that silently fell back to the API would put a
    // cross-provider verification on the provider the operator was
    // routing away from.
    throw new RouterError(
      "the copilot-cli transport is ported in session 30 of the port plan " +
        "(ai_router.transports.copilot). Route over the 'api' or 'offline' " +
        "transport, or run this call through the Python router.",
    );
  }

  const models = record(config["models"]);
  const providers = record(config["providers"]);
  const ladder: Candidate[] = registryCandidates(config, role, exclude).map((alias) => ({
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
  return {
    ladder,
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
