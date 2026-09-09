// Direct-API transport: HTTPS callers for Anthropic, Google, and OpenAI.
//
// `generation_params` controls per-call reasoning behaviour (any subset):
//
//     Anthropic:  {"effort": "low|medium|high|xhigh",
//                  "thinking": {"enabled": true, "type": "adaptive"}}
//     Gemini 2.5: {"thinking_budget": -1 | 0 | <positive int>}
//     Gemini 3.x: {"thinking_level": "MINIMAL|LOW|MEDIUM|HIGH"}
//     OpenAI:     {"reasoning_effort": "none|minimal|low|medium|high|xhigh"}
//
// `fetch` replaces `httpx`, which makes every caller async where Python's is
// synchronous. That is the one shape difference: there is no blocking HTTP
// under Node, and a transport that pretended otherwise would stall the only
// thread the process has. The retry ladder, what is retried and what is not,
// and every field read off a response body are the same.

import { writeErr } from "../output.ts";
import { resolveSecret } from "../secretResolver.ts";
import type { APIResult, DispatchRequest } from "./base.ts";

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Json {
  return isRecord(value) ? value : {};
}

/**
 * Read the served-model id out of a response body, defensively: the
 * "provider omitted it" and "provider sent a non-string" cases both resolve
 * to null. Recording a served model must never break a call that already
 * succeeded and was already paid for.
 */
function servedModelId(data: Json, key: string): string | null {
  const value = data[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * A vendor answered with an error status.
 *
 * `httpx.HTTPStatusError` and `httpx.TimeoutException` are the two classes
 * Python retries; every other failure -- DNS, connection refused, a body
 * that is not JSON -- propagates on the first attempt. These two carry that
 * distinction so the ladder retries the same things and no others.
 */
export class HttpStatusError extends Error {}
export class HttpTimeoutError extends Error {}

export type ProviderConfig = Record<string, unknown>;

type ProviderCaller = (
  modelId: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  config: ProviderConfig,
  genParams: Json,
) => Promise<APIResult>;

function sleep(seconds: number): Promise<void> {
  return new Promise((done) => {
    setTimeout(done, seconds * 1000);
  });
}

/**
 * How a request reaches the wire: the one seam between this transport and
 * the network, and the counterpart of the seat transport's spawner.
 *
 * The default is `fetch` and production never swaps it. A test answers with
 * a recorded response, so the request this module BUILDS and the response it
 * READS are the shipping code rather than a stand-in for it.
 */
export type HttpSource = (url: string, init: RequestInit) => Promise<Response>;

let httpSource: HttpSource = (url, init) => fetch(url, init);

/** Swap the source of HTTP answers; the returned function restores the previous one. */
export function setHttpSource(source: HttpSource): () => void {
  const previous = httpSource;
  httpSource = source;
  return () => {
    httpSource = previous;
  };
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

/**
 * `raise_for_status()` then `.json()`.
 *
 * The URL and the status, and never the body: a vendor error body can echo
 * the request headers, and this string reaches operator-visible output.
 */
async function readJson(response: Response, url: string): Promise<Json> {
  if (!response.ok) {
    // Drain the body so the socket is released; nothing reads it.
    await response.text().catch(() => "");
    throw new HttpStatusError(
      `HTTP ${response.status} ${response.statusText} for url '${url}'`,
    );
  }
  const data: unknown = await response.json();
  return record(data);
}

/**
 * One request, with the provider block's `timeout_seconds` as a whole-request
 * deadline -- where httpx applies that number per connect/read/write phase.
 * A single deadline is the stricter reading of the same number, and the
 * alternative would let a vendor that trickles bytes hold a mandatory
 * verification call open past every ceiling the config states.
 */
async function request(
  url: string,
  init: RequestInit,
  timeoutSeconds: number,
): Promise<Json> {
  let response: Response;
  try {
    response = await httpSource(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutSeconds * 1000),
    });
  } catch (error) {
    if (isTimeout(error)) {
      throw new HttpTimeoutError(`timed out after ${timeoutSeconds}s: ${url}`);
    }
    throw error;
  }
  return readJson(response, url);
}

function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutSeconds: number,
): Promise<Json> {
  return request(
    url,
    { method: "POST", headers: { ...headers }, body: JSON.stringify(body) },
    timeoutSeconds,
  );
}

/** The models endpoint's GET; `discovery`'s enumeration is its other caller. */
export function httpGetJson(
  url: string,
  headers: Record<string, string>,
  timeoutSeconds: number,
): Promise<Json> {
  return request(url, { headers: { ...headers } }, timeoutSeconds);
}

/**
 * Call a provider API, with retries. `config` is the provider's block from
 * router-config.yaml (api_key_env, base_url, timeout_seconds, retry).
 */
export async function callModel(
  providerName: string,
  modelId: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  config: ProviderConfig,
  generationParams: Json | null = null,
): Promise<APIResult> {
  const caller = PROVIDER_CALLERS[providerName];
  if (caller === undefined) {
    // Python indexes `_PROVIDER_CALLERS` and raises KeyError; the id is what
    // that carries, and the caller that guessed a provider is the bug.
    throw new Error(`'${providerName}'`);
  }

  const retry = record(config["retry"]);
  const maxRetries = Number(retry["max_retries"]);
  const backoffBase = Number(retry["backoff_base_seconds"]);
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const result = await caller(
        modelId,
        systemPrompt,
        userMessage,
        maxTokens,
        config,
        generationParams ?? {},
      );
      if (
        result.served_model_id !== null &&
        result.served_model_id !== undefined &&
        result.served_model_id !== modelId
      ) {
        writeErr(
          `[dabbler] NOTE: requested model '${modelId}' but ` +
            `${providerName} served '${result.served_model_id}'. ` +
            "A dated-snapshot pin is routine; a change of model family " +
            "changes the price. Both ids are recorded in the metrics row.\n",
        );
      }
      return result;
    } catch (error) {
      if (!(error instanceof HttpStatusError || error instanceof HttpTimeoutError)) {
        throw error;
      }
      lastError = error;
      if (attempt < maxRetries) await sleep(backoffBase * 2 ** attempt);
    }
  }

  throw new Error(
    `API call failed after ${maxRetries + 1} attempts: ` +
      `${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

/**
 * A field Python reads by subscript, so a vendor that omits it raises there.
 *
 * `String(undefined)` is `"undefined"` and `Number(undefined)` is `NaN`, and
 * both would travel: a fabricated word passes every escalation trigger, and a
 * NaN token count reaches the metrics row as a measurement. A body missing
 * one of these is a vendor behaving unexpectedly, which is the case to fail
 * on rather than to smooth over.
 */
function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`the response body has no string at '${field}'`);
  }
  return value;
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`the response body has no number at '${field}'`);
  }
  return value;
}

function missingKey(config: ProviderConfig, vendor: string): Error {
  return new Error(
    `Missing environment variable ${String(config["api_key_env"])} for ${vendor}`,
  );
}

async function callAnthropic(
  modelId: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  config: ProviderConfig,
  genParams: Json,
): Promise<APIResult> {
  const apiKey = resolveSecret(String(config["api_key_env"] ?? ""));
  if (!apiKey) throw missingKey(config, "Anthropic");

  const body: Json = {
    model: modelId,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  };

  const thinking = record(genParams["thinking"]);
  if (thinking["enabled"]) {
    body["thinking"] = { type: thinking["type"] ?? "adaptive" };
  }
  const effort = genParams["effort"];
  if (effort) body["output_config"] = { effort };

  const headers: Record<string, string> = {
    "x-api-key": apiKey,
    "anthropic-version": String(config["api_version"] ?? "2023-06-01"),
    "content-type": "application/json",
  };
  const betas = genParams["betas"] ?? config["betas"];
  if (betas) {
    headers["anthropic-beta"] = Array.isArray(betas)
      ? betas.join(",")
      : String(betas);
  }

  const data = await postJson(
    String(config["base_url"] ?? "https://api.anthropic.com/v1/messages"),
    headers,
    body,
    Number(config["timeout_seconds"]),
  );

  const blocks = Array.isArray(data["content"]) ? data["content"] : [];
  const content = blocks
    .filter((block) => record(block)["type"] === "text")
    .map((block) => requiredString(record(block)["text"], "content[].text"))
    .join("");
  const usage = record(data["usage"]);
  return {
    content,
    input_tokens: requiredNumber(usage["input_tokens"], "usage.input_tokens"),
    output_tokens: requiredNumber(usage["output_tokens"], "usage.output_tokens"),
    stop_reason: String(data["stop_reason"] ?? "unknown"),
    served_model_id: servedModelId(data, "model"),
    metadata: {},
  };
}

async function callGoogle(
  modelId: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  config: ProviderConfig,
  genParams: Json,
): Promise<APIResult> {
  const apiKey = resolveSecret(String(config["api_key_env"] ?? ""));
  if (!apiKey) throw missingKey(config, "Google");

  const base = String(
    config["base_url"] ?? "https://generativelanguage.googleapis.com/v1beta",
  );
  // The key travels in the x-goog-api-key header, never the query string: an
  // error renders the full URL into operator-visible output, and a `?key=`
  // URL would leak a live credential.
  const url = `${base}/models/${modelId}:generateContent`;

  const generationConfig: Json = { maxOutputTokens: maxTokens };

  // Gemini 3.x uses thinkingLevel; 2.5 uses thinkingBudget. Mutually
  // exclusive shapes.
  const thinkingConfig: Json = {};
  if (modelId.startsWith("gemini-3")) {
    const level = genParams["thinking_level"];
    if (level) thinkingConfig["thinkingLevel"] = String(level).toUpperCase();
  } else {
    const budget = genParams["thinking_budget"];
    if (budget !== undefined && budget !== null) {
      thinkingConfig["thinkingBudget"] = Math.trunc(Number(budget));
    }
  }
  if (Object.keys(thinkingConfig).length > 0) {
    generationConfig["thinkingConfig"] = thinkingConfig;
  }

  const data = await postJson(
    url,
    { "x-goog-api-key": apiKey },
    {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userMessage }] }],
      generationConfig,
    },
    Number(config["timeout_seconds"]),
  );

  const candidates = data["candidates"];
  if (!Array.isArray(candidates) || candidates.length === 0) {
    // Python indexes `data["candidates"][0]` and raises. A safety-blocked
    // 200 answers with no candidate at all, and BOTH ways of papering over
    // that are worse than failing: a coerced `"undefined"` is fabricated
    // content that passes every escalation trigger, and an empty string is
    // a real escalation the record cannot tell from a model that answered
    // with nothing.
    throw new Error("google returned no candidate to read");
  }
  const first = record(candidates[0]);
  const parts = record(first["content"])["parts"];
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error("google returned a candidate with no content parts");
  }
  const content = requiredString(record(parts[0])["text"], "candidates[0].text");
  const usage = record(data["usageMetadata"]);
  const finish = String(first["finishReason"] ?? "STOP");
  const stopReason =
    finish === "MAX_TOKENS"
      ? "max_tokens"
      : finish === "STOP"
        ? "end_turn"
        : finish.toLowerCase();
  return {
    content,
    input_tokens: Number(usage["promptTokenCount"] ?? 0),
    output_tokens: Number(usage["candidatesTokenCount"] ?? 0),
    stop_reason: stopReason,
    served_model_id: servedModelId(data, "modelVersion"),
    metadata: {},
  };
}

/**
 * Call OpenAI via the Responses API (POST /v1/responses).
 *
 * Reasoning tokens are billed as output tokens and are already included in
 * the API's own output_tokens accounting -- no double-add.
 */
async function callOpenai(
  modelId: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  config: ProviderConfig,
  genParams: Json,
): Promise<APIResult> {
  const apiKey = resolveSecret(String(config["api_key_env"] ?? ""));
  if (!apiKey) throw missingKey(config, "OpenAI");

  const base = String(config["base_url"] ?? "https://api.openai.com/v1");
  const body: Json = {
    model: modelId,
    instructions: systemPrompt,
    input: userMessage,
    max_output_tokens: maxTokens,
  };
  const effort = genParams["reasoning_effort"];
  if (effort) body["reasoning"] = { effort };

  const data = await postJson(
    `${base}/responses`,
    { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body,
    Number(config["timeout_seconds"]),
  );

  let content = data["output_text"];
  if (!content) {
    const parts: string[] = [];
    for (const item of Array.isArray(data["output"]) ? data["output"] : []) {
      if (record(item)["type"] !== "message") continue;
      const blocks = record(item)["content"];
      for (const block of Array.isArray(blocks) ? blocks : []) {
        const type = record(block)["type"];
        if (type === "output_text" || type === "text") {
          parts.push(String(record(block)["text"] ?? ""));
        }
      }
    }
    content = parts.join("");
  }

  const usage = record(data["usage"]);
  const inputTokens = usage["input_tokens"] || usage["prompt_tokens"] || 0;
  const outputTokens = usage["output_tokens"] || usage["completion_tokens"] || 0;

  const status = String(data["status"] ?? "completed");
  let stopReason = "end_turn";
  if (status === "incomplete") {
    const reason = record(data["incomplete_details"])["reason"];
    stopReason =
      reason === "max_output_tokens"
        ? "max_tokens"
        : reason
          ? String(reason)
          : "incomplete";
  }

  return {
    content: content ? String(content) : "",
    input_tokens: Math.trunc(Number(inputTokens)),
    output_tokens: Math.trunc(Number(outputTokens)),
    stop_reason: stopReason,
    served_model_id: servedModelId(data, "model"),
    metadata: {},
  };
}

const PROVIDER_CALLERS: Readonly<Record<string, ProviderCaller>> = {
  anthropic: callAnthropic,
  google: callGoogle,
  openai: callOpenai,
};

/** Transport wrapper over `callModel` for one provider. */
export class DirectApiTransport {
  private readonly provider: string;
  private readonly config: ProviderConfig;

  constructor(providerName: string, providerConfig: ProviderConfig) {
    this.provider = providerName;
    this.config = providerConfig;
  }

  dispatch(request_: DispatchRequest): Promise<APIResult> {
    return callModel(
      this.provider,
      request_.model_id,
      request_.system_prompt,
      request_.user_message,
      Number(request_.max_tokens),
      this.config,
      request_.generation_params ?? null,
    );
  }
}
