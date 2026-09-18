// The direct-API transport's answer to a thinking setting the model refuses:
// asked once more without it, and only for that refusal.
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { callModel, setHttpSource, type ProviderConfig } from "../src/transports/api.ts";
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
    const dropped = result.metadata["dropped_param"] as { param: string; reason: string };
    assert.equal(dropped.param, "thinking");
    assert.ok(dropped.reason.includes(refusal));
  });

  it("drops only the param the vendor named, once, and spends no retry on it", async () => {
    const google = (makeConfig()["providers"] as Record<string, ProviderConfig>)["google"] as ProviderConfig;
    const bodies = answerWith([400, { error: { status: "INVALID_ARGUMENT", message: "thinking_budget is not supported for this model" } }]);
    await assert.rejects(
      () =>
        callModel("google", "gemini-2.5-flash", "s", "u", 100, google, {
          thinking: { enabled: true },
          thinking_budget: 5,
        }),
      /HTTP 400/,
    );
    const budgets = bodies.map(
      (body) => ((body["generationConfig"] as Record<string, unknown>)["thinkingConfig"] as Record<string, unknown> | undefined)?.["thinkingBudget"],
    );
    // The first call, then the ordinary two attempts without the named param.
    assert.deepEqual(budgets, [5, undefined, undefined]);
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
});
