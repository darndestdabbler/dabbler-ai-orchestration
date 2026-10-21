// The direct-API transport's answer to a generation setting the model refuses:
// asked again without it, as many times as the vendor names one it was sent.
// And to an exhausted balance: never retried, and told apart from a rate limit.
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { callModel, FundsError, setHttpSource, type ProviderConfig } from "../src/transports/api.ts";
import { makeConfig, setProviderKeys } from "./support/answers.ts";

const ANTHROPIC_OK = {
  content: [{ type: "text", text: "hello" }],
  usage: { input_tokens: 12, output_tokens: 34 },
  stop_reason: "end_turn",
  model: "a-haiku",
};

const KEYS = ["TEST_ANTHROPIC_KEY", "TEST_GOOGLE_KEY", "TEST_OPENAI_KEY"];
let restoreHttp: (() => void) | null = null;

/** Answer each request in turn from `responses`, and keep each body sent. */
function answerWith(...responses: Array<[number, unknown]>): Array<Record<string, unknown>> {
  const bodies: Array<Record<string, unknown>> = [];
  restoreHttp = setHttpSource((_url, init) => {
    bodies.push(JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>);
    const [status, body] = responses[Math.min(bodies.length, responses.length) - 1]!;
    return Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
    );
  });
  return bodies;
}

function anthropic(): ProviderConfig {
  return (makeConfig()["providers"] as Record<string, ProviderConfig>)["anthropic"] as ProviderConfig;
}

describe("callModel", () => {
  beforeEach(setProviderKeys);
  afterEach(() => {
    restoreHttp?.();
    restoreHttp = null;
    for (const name of KEYS) delete process.env[name];
  });

  it("asks once more without a thinking param the vendor says the model does not support", async () => {
    const refusal = "adaptive thinking is not supported on this model";
    const bodies = answerWith(
      [400, { error: { type: "invalid_request_error", message: refusal } }],
      [200, ANTHROPIC_OK],
    );
    const result = await callModel("anthropic", "a-haiku", "s", "u", 100, anthropic(), {
      thinking: { enabled: true, type: "adaptive" },
    });
    assert.equal(result.content, "hello");
    assert.equal(bodies.length, 2);
    assert.ok("thinking" in bodies[0]!);
    assert.ok(!("thinking" in bodies[1]!));
    const dropped = result.metadata["dropped_params"] as Array<{ param: string; reason: string }>;
    assert.equal(dropped.length, 1);
    assert.equal(dropped[0]!.param, "thinking");
    assert.ok(dropped[0]!.reason.includes(refusal));
  });

  it("drops every param the vendor refuses, one per refusal, and records each", async () => {
    const effort = "This model does not support the effort parameter.";
    const thinking = "adaptive thinking is not supported on this model";
    const bodies = answerWith(
      [400, { error: { type: "invalid_request_error", message: effort } }],
      [400, { error: { type: "invalid_request_error", message: thinking } }],
      [200, ANTHROPIC_OK],
    );
    const result = await callModel("anthropic", "a-haiku", "s", "u", 100, anthropic(), {
      effort: "medium",
      thinking: { enabled: true, type: "adaptive" },
    });
    assert.equal(result.content, "hello");
    assert.equal(bodies.length, 3);
    assert.ok("output_config" in bodies[0]! && "thinking" in bodies[0]!);
    assert.ok(!("output_config" in bodies[2]!) && !("thinking" in bodies[2]!));
    const dropped = result.metadata["dropped_params"] as Array<{ param: string; reason: string }>;
    assert.deepEqual(
      dropped.map((entry) => entry.param),
      ["effort", "thinking"],
    );
    assert.ok(dropped[0]!.reason.includes(effort));
    assert.ok(dropped[1]!.reason.includes(thinking));
  });

  it("drops the longest carried param the vendor named, not a shorter one inside it", async () => {
    const google = (makeConfig()["providers"] as Record<string, ProviderConfig>)["google"] as ProviderConfig;
    const bodies = answerWith(
      [400, { error: { status: "INVALID_ARGUMENT", message: "thinking_budget is not supported for this model" } }],
      [200, { candidates: [{ content: { parts: [{ text: "hello" }] }, finishReason: "STOP" }], usageMetadata: {} }],
    );
    const result = await callModel("google", "gemini-2.5-flash", "s", "u", 100, google, {
      thinking: { enabled: true },
      thinking_budget: 5,
    });
    const budgets = bodies.map(
      (body) => ((body["generationConfig"] as Record<string, unknown>)["thinkingConfig"] as Record<string, unknown> | undefined)?.["thinkingBudget"],
    );
    assert.deepEqual(budgets, [5, undefined]);
    const dropped = result.metadata["dropped_params"] as Array<{ param: string }>;
    assert.deepEqual(
      dropped.map((entry) => entry.param),
      ["thinking_budget"],
    );
  });

  it("does not drop a param over any other 400", async () => {
    const bodies = answerWith([400, { error: { type: "invalid_request_error", message: "max_tokens: too large" } }]);
    await assert.rejects(
      () =>
        callModel("anthropic", "a-haiku", "s", "u", 100, anthropic(), {
          thinking: { enabled: true, type: "adaptive" },
        }),
      /HTTP 400/,
    );
    assert.ok(bodies.every((body) => "thinking" in body));
  });

  const providers = (): Record<string, ProviderConfig> =>
    makeConfig()["providers"] as Record<string, ProviderConfig>;

  for (const [vendor, model, error] of [
    ["openai", "gpt-x", { code: "insufficient_quota", type: "insufficient_quota", message: "You exceeded your current quota." }],
    ["openai", "gpt-x", { code: "credit_balance_exhausted", message: "Your credit balance is exhausted." }],
    ["anthropic", "a-haiku", { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." }],
    ["google", "gemini-x", { code: 429, status: "RESOURCE_EXHAUSTED", message: "Your prepayment credits are depleted. Check your plan and billing details." }],
  ] as const) {
    it(`does not retry ${vendor}'s funds refusal and names it as funds`, async () => {
      const status = vendor === "anthropic" ? 400 : 429;
      const bodies = answerWith([status, { error }]);
      await assert.rejects(
        () => callModel(vendor, model, "s", "u", 100, providers()[vendor] as ProviderConfig),
        (thrown: unknown) =>
          thrown instanceof FundsError &&
          thrown.vendor === vendor &&
          thrown.message.startsWith(`waiting for funds: ${vendor}`),
      );
      assert.equal(bodies.length, 1);
    });
  }

  it("still retries a Google rate limit, which shares the funds refusal's status", async () => {
    const bodies = answerWith(
      [429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Resource has been exhausted (e.g. check quota)." } }],
      [200, { candidates: [{ content: { parts: [{ text: "hello" }] }, finishReason: "STOP" }], usageMetadata: {} }],
    );
    const result = await callModel("google", "gemini-x", "s", "u", 100, providers()["google"] as ProviderConfig);
    assert.equal(result.content, "hello");
    assert.equal(bodies.length, 2);
  });
});
