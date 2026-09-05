// The router's dispatch: which candidates a call may take, when the ladder
// takes another step, what the answer and the telemetry row say, and the
// refusals that fail closed.
//
// Every decision here is a function of facts, so most of the file hands it
// literals. The two dispatches that run end to end take the transports that
// need no network and no process: the offline transport, which answers from
// scripted files, and the seat with its spawner seam filled by a fake
// process. Nothing is mocked.
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, it } from "node:test";

import { stringify } from "yaml";

import { CONFIG_ENV_VAR } from "../src/config.ts";
import { loadMetrics } from "../src/metrics.ts";
import {
  ExcludedProviderError,
  NoCandidateError,
  PromptTooLargeError,
  apiLadder,
  assertNotExcluded,
  buildPrompt,
  classifyEscalationReason,
  detectTruncation,
  escalationStep,
  installCopilotForTests,
  normalizeExclusions,
  resetForTests,
  route,
  routeCallRecordOf,
  routeResultOf,
  seatLadder,
  shouldAutoVerify,
  shouldEscalate,
  type Candidate,
  type DispatchOutcome,
} from "../src/route.ts";
import { resetForTests as resetRuntimeMode } from "../src/runtimeMode.ts";
import {
  CopilotCliTransport,
  catalogMeta,
  modelEntry,
  type Catalog,
} from "../src/transports/copilot.ts";
import { setHttpSource } from "../src/transports/api.ts";
import type { APIResult } from "../src/transports/base.ts";
import { makeConfig, seed, setProviderKeys, tempDir } from "./support/answers.ts";

const KEYS = ["TEST_ANTHROPIC_KEY", "TEST_GOOGLE_KEY", "TEST_OPENAI_KEY"];

let configPath = "";

/**
 * The config on disk with `AI_ROUTER_CONFIG` pointing at it, so `route`'s
 * lazy load resolves hermetically -- and the metrics land beside it.
 */
function configOnDisk(config: Record<string, unknown> = makeConfig()): void {
  const directory = tempDir("route-");
  seed(directory, { "router-config.yaml": stringify(config) });
  configPath = `${directory}/router-config.yaml`;
  process.env[CONFIG_ENV_VAR] = configPath;
}

function metricRows(): Array<Record<string, unknown>> {
  return loadMetrics({ _config_path: configPath });
}

beforeEach(() => {
  setProviderKeys();
  // `bootstrap` persists this at user scope on a seat machine, and it
  // outranks the config a test writes.
  delete process.env["DABBLER_TRANSPORT"];
  delete process.env["DABBLER_NO_ROUTER"];
  resetForTests();
  resetRuntimeMode();
});

afterEach(() => {
  for (const name of KEYS) delete process.env[name];
  delete process.env[CONFIG_ENV_VAR];
  delete process.env["DABBLER_NO_ROUTER"];
  delete process.env["DABBLER_TRANSPORT"];
  resetForTests();
  resetRuntimeMode();
});

function apiResult(overrides: Partial<APIResult> = {}): APIResult {
  return {
    content: "a fine, sufficiently long answer ".repeat(4),
    input_tokens: 10,
    output_tokens: 100,
    stop_reason: "end_turn",
    metadata: {},
    ...overrides,
  };
}

function escalationConfig(): Record<string, unknown> {
  return makeConfig()["escalation"] as Record<string, unknown>;
}

describe("normalizing the exclusion", () => {
  it("folds spelling, drops blanks and duplicates, and orders what is left", () => {
    // A caller's spelling must not decide whether a provider is excluded.
    assert.deepEqual(normalizeExclusions([" Google ", "google", "", "anthropic"]), [
      "anthropic",
      "google",
    ]);
    assert.deepEqual(normalizeExclusions(null), []);
  });
});

describe("the ladder a call may take", () => {
  it("is the role's order over the registry", () => {
    assert.deepEqual(
      apiLadder(makeConfig(), "generator", "general", []).map((entry) => entry.alias),
      ["flash", "pro", "opus", "sonnet", "gpt"],
    );
  });

  it("carries the id that goes on the wire beside the alias", () => {
    const [first] = apiLadder(makeConfig(), "generator", "general", []);
    assert.deepEqual([first?.alias, first?.model_id, first?.provider], [
      "flash",
      "g-flash",
      "google",
    ]);
  });

  it("fails closed when the exclusion leaves no candidate", () => {
    // Never a silent same-provider pick: cross-provider review depends on
    // this refusal being louder than the fallback.
    assert.throws(
      () => apiLadder(makeConfig(), "generator", "general", ["google", "openai", "anthropic"]),
      NoCandidateError,
    );
  });

  it("fails closed on a keyless machine rather than dispatching to nothing", () => {
    for (const name of KEYS) delete process.env[name];
    assert.throws(() => apiLadder(makeConfig(), "generator", "general", []), NoCandidateError);
  });

  it("names the remedy in the refusal", () => {
    assert.throws(
      () => apiLadder(makeConfig(), "generator", "formatting", ["google", "openai", "anthropic"]),
      /Enable a model from a surviving provider, or set its API key/,
    );
  });

  it("says out loud when the role fell past its own preference order", () => {
    // The 364-request session had this fact at selection time and printed
    // nothing: a model no order named answered, and the first anyone could
    // have known was the bill. Said BEFORE the round is spent, on the same
    // channel the catalog's own warnings use, so it reaches the Dabbler
    // terminal while there is still someone who could stop it.
    const written: string[] = [];
    const original = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      // The order names google models only -- by model id, which is what it
      // ranks on -- and google is the excluded provider, so what answers is
      // a model the order never mentions.
      const config = makeConfig({ roles: { generator: { prefer: ["g-flash", "g-pro"] } } });
      const ladder = apiLadder(config, "generator", "general", ["google"]);
      assert.ok(ladder.length > 0, "a stranger is still reachable, which is the point");
      const warning = written.join("");
      assert.match(warning, /fell past its preference order/);
      // What answered, and why the named ones did not.
      assert.match(warning, new RegExp(ladder[0]!.alias));
      assert.match(warning, /excluded-provider/);

      // Silence on an ordinary round: the order's own first choice answers.
      written.length = 0;
      apiLadder(config, "generator", "general", []);
      assert.strictEqual(written.join(""), "");
    } finally {
      process.stderr.write = original;
    }
  });
});

describe("the seat's ladder", () => {
  const CATALOG: Catalog = {
    meta: catalogMeta({ cli_version: "v", seat_id: "t" }),
    models: [
      modelEntry({ id: "claude-x", provider: "anthropic", enablement: "confirmed" }),
      modelEntry({ id: "gpt-x", provider: "openai", enablement: "confirmed" }),
      modelEntry({ id: "unconfirmed-x", provider: "google", enablement: "unconfirmed" }),
    ],
  };

  it("draws only on confirmed entries", () => {
    // An unconfirmed entry is a claim nobody probed; dispatching to one
    // would make the catalog's confirmation meaningless.
    assert.deepEqual(
      seatLadder(makeConfig(), CATALOG, "generator", []).map((entry) => entry.alias),
      ["claude-x", "gpt-x"],
    );
  });

  it("walks past the preferred provider when it is excluded", () => {
    assert.deepEqual(
      seatLadder(makeConfig(), CATALOG, "generator", ["anthropic"]).map((entry) => entry.alias),
      ["gpt-x"],
    );
  });

  it("fails closed when the exclusion leaves no confirmed entry", () => {
    assert.throws(
      () => seatLadder(makeConfig(), CATALOG, "generator", ["anthropic", "openai", "google"]),
      NoCandidateError,
    );
  });
});

describe("the exclusion at the call site", () => {
  it("refuses a candidate the call excludes, wherever it came from", () => {
    // Asserted again immediately before the wire, because cross-provider
    // review is the one invariant a later preference path must not be able
    // to undo. No current path reaches it, which is the point.
    const candidate: Candidate = { alias: "flash", model_id: "g-flash", provider: "google" };
    assert.throws(() => assertNotExcluded(candidate, ["google"]), ExcludedProviderError);
    assert.doesNotThrow(() => assertNotExcluded(candidate, ["openai"]));
  });
});

describe("deciding whether to escalate", () => {
  it("leaves a healthy response alone", () => {
    assert.equal(shouldEscalate(apiResult(), escalationConfig()), false);
  });

  it("escalates an empty response, a max_tokens stop, and a short answer", () => {
    const config = escalationConfig();
    assert.equal(shouldEscalate(apiResult({ content: "  \n" }), config), true);
    assert.equal(shouldEscalate(apiResult({ stop_reason: "max_tokens" }), config), true);
    assert.equal(shouldEscalate(apiResult({ output_tokens: 5 }), config), true);
  });

  it("does not treat an unreported token count as a short response", () => {
    // The Copilot CLI omits the count on some events, and unmeasured is not
    // "short".
    assert.equal(shouldEscalate(apiResult({ output_tokens: 0 }), escalationConfig()), false);
  });

  it("escalates a refusal phrase", () => {
    assert.equal(
      shouldEscalate(
        apiResult({ content: "I can't help with that request here today, sorry" }),
        escalationConfig(),
      ),
      true,
    );
  });

  it("names the trigger that fired", () => {
    const config = escalationConfig();
    assert.equal(classifyEscalationReason(apiResult({ content: "" }), config), "empty_response");
    assert.equal(
      classifyEscalationReason(apiResult({ stop_reason: "max_tokens" }), config),
      "truncated",
    );
    assert.equal(classifyEscalationReason(apiResult({ output_tokens: 3 }), config), "too_short");
    assert.equal(
      classifyEscalationReason(
        apiResult({ content: "i'm unable to comply with this ".repeat(3) }),
        config,
      ),
      "refusal",
    );
  });
});

describe("the ladder's next step", () => {
  const POSITION = {
    escalates: true,
    index: 0,
    ladderLength: 3,
    escalationsSoFar: 0,
    maxEscalations: 2,
  };

  it("takes the next model and records why it left the last one", () => {
    assert.deepEqual(escalationStep(apiResult({ content: "" }), escalationConfig(), POSITION), {
      escalate: true,
      reason: "empty_response",
    });
  });

  it("stops at max_escalations even with candidates left", () => {
    // Two independent limits bound the ladder, and a run that escalated past
    // either would spend a call the operator capped.
    const step = escalationStep(apiResult({ content: "" }), escalationConfig(), {
      ...POSITION,
      escalationsSoFar: 2,
    });
    assert.deepEqual(step, { escalate: false, reason: null });
  });

  it("stops at the end of the ladder", () => {
    const step = escalationStep(apiResult({ content: "" }), escalationConfig(), {
      ...POSITION,
      index: 2,
    });
    assert.equal(step.escalate, false);
  });

  it("stops on a path that does not escalate at all", () => {
    // The offline transport is one: escalating between scripted responses
    // would consume the queue to hide a script the operator wrote on
    // purpose.
    const step = escalationStep(apiResult({ content: "" }), escalationConfig(), {
      ...POSITION,
      escalates: false,
    });
    assert.equal(step.escalate, false);
  });

  it("stops when escalation is switched off in the config", () => {
    const step = escalationStep(
      apiResult({ content: "" }),
      { ...escalationConfig(), enabled: false },
      POSITION,
    );
    assert.equal(step.escalate, false);
  });
});

describe("detecting a truncated response", () => {
  it("takes the provider's own signal as authoritative", () => {
    assert.equal(detectTruncation("complete text.", "max_tokens"), true);
  });

  it("flags an unclosed code fence and an abrupt brace imbalance", () => {
    assert.equal(detectTruncation("```python\nprint(1)", "end_turn"), true);
    assert.equal(detectTruncation('var sql = {"SELECT Reports', "end_turn"), true);
  });

  it("does not flag prose about braces that ends in a full sentence", () => {
    // A complete review of brace-matching code: unbalanced braces in prose,
    // but it stops at a full stop. The abrupt-ending condition is what
    // separates the two, and without it a real verdict was discarded.
    assert.equal(
      detectTruncation(
        "`_opens_a_body` treats any `{` following `):` as a body, but " +
          "the file has an inline object return type `{ path: string } " +
          "before the real body, so the body is not elided.",
        "end_turn",
      ),
      false,
    );
  });
});

describe("what one dispatch becomes", () => {
  const CANDIDATE: Candidate = { alias: "claude-x", model_id: "claude-x", provider: "anthropic" };

  function outcome(overrides: Partial<DispatchOutcome> = {}): DispatchOutcome {
    return {
      candidate: CANDIDATE,
      result: apiResult({ served_model_id: "claude-x-2026", metadata: { session_id: "conv-42" } }),
      elapsedSeconds: 1.5,
      generationParams: {},
      escalationHistory: [],
      transport: "api",
      taskType: "general",
      sessionNumber: 3,
      ...overrides,
    };
  }

  it("answers with the model that actually served it", () => {
    const result = routeResultOf(outcome());
    assert.deepEqual([result.model_name, result.model_id, result.provider], [
      "claude-x",
      "claude-x",
      "anthropic",
    ]);
    assert.equal(result.served_model_id, "claude-x-2026");
    assert.equal(result.escalated, false);
  });

  it("reports an escalation and the ladder it walked", () => {
    const result = routeResultOf(outcome({ escalationHistory: [["flash", "empty_response"]] }));
    assert.equal(result.escalated, true);
    assert.deepEqual(result.escalation_history, [["flash", "empty_response"]]);
  });

  it("carries the seat's conversation id only on the seat", () => {
    // It is the join key that makes a seat call's real cost recoverable, and
    // on the API path there is no such thing to carry.
    assert.equal(routeResultOf(outcome({ transport: "copilot-cli" })).transport_session_id, "conv-42");
    assert.equal(routeResultOf(outcome()).transport_session_id, null);
  });

  it("writes a telemetry row that says whether the spend is visible here", () => {
    const seat = routeCallRecordOf(outcome({ transport: "copilot-cli" }));
    assert.equal(seat.billedUsageUnavailable, true);
    assert.equal(seat.transportSessionId, "conv-42");
    // On the API path the spend is attributable, so the flag is not raised
    // and the tri-state stays null rather than false.
    const api = routeCallRecordOf(outcome());
    assert.equal(api.billedUsageUnavailable, null);
    assert.deepEqual([api.model, api.requestedModelId, api.sessionNumber], [
      "claude-x",
      "claude-x",
      3,
    ]);
  });
});

describe("whether an answer is reviewed before it is returned", () => {
  it("verifies a listed task type when verification is on", () => {
    const config = { verification: { enabled: true, auto_verify_task_types: ["code-review"] } };
    assert.equal(shouldAutoVerify(config, "code-review"), true);
    assert.equal(shouldAutoVerify(config, "formatting"), false);
  });

  it("never verifies a verification, which would recurse", () => {
    const config = {
      verification: {
        enabled: true,
        auto_verify_task_types: ["verification", "session-verification"],
      },
    };
    assert.equal(shouldAutoVerify(config, "verification"), false);
    assert.equal(shouldAutoVerify(config, "session-verification"), false);
  });

  it("verifies nothing when verification is off", () => {
    assert.equal(
      shouldAutoVerify(
        { verification: { enabled: false, auto_verify_task_types: ["code-review"] } },
        "code-review",
      ),
      false,
    );
  });
});

describe("a prompt over the model's input budget", () => {
  it("is refused with the overrun and the remedy, never trimmed", () => {
    // Tail-chopping a review bundle drops the end of the diff while the
    // handoff acknowledgement still validates, so a truncated review returns
    // a clean-looking verdict.
    const failing = (): unknown =>
      buildPrompt("x".repeat(5000), "", "code-review", { max_context_tokens: 1000 }, {});
    assert.throws(failing, PromptTooLargeError);
    assert.throws(failing, /an overrun of 450 tokens/);
    assert.throws(failing, /split the session/);
  });

  it("stops the call before anything is dispatched", async () => {
    // The budget is checked where the prompt is built, which is before the
    // transport is reached at all.
    configOnDisk(
      makeConfig({
        models: {
          tiny: {
            provider: "google",
            model_id: "g-tiny",
            max_context_tokens: 1000,
            max_output_tokens: 100,
          },
        },
        roles: { generator: { prefer: ["g-tiny"] } },
      }),
    );
    await assert.rejects(() => route("x".repeat(5000)), PromptTooLargeError);
  });
});

describe("--no-router mode", () => {
  it("short-circuits before the config is even loaded", async () => {
    // No config, no keys, no network -- and it must still answer.
    process.env["DABBLER_NO_ROUTER"] = "1";
    resetRuntimeMode();
    const result = await route("anything");
    assert.equal(result.model_name, "no-router-mode");
    assert.equal(result.transport, "none");
  });
});

describe("dispatching over the direct-API transport", () => {
  // The seam is the wire (`setHttpSource`), so everything above it is the
  // shipping path: the ladder built from the registry, the rate limiter
  // looked up per provider, the generation params resolved per task type,
  // the escalation walked, and the telemetry row written. The pure tests
  // above cover each decision; this covers that the loop composes them.
  let restoreHttp: (() => void) | null = null;

  afterEach(() => {
    restoreHttp?.();
    restoreHttp = null;
  });

  /** A Google answer, which is what `roles.generator.prefer` reaches first. */
  function googleAnswer(text: string, outputTokens = 100): Response {
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: outputTokens },
        modelVersion: "g-served",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  it("records the tokens and the telemetry row end to end", async () => {
    configOnDisk();
    const urls: string[] = [];
    restoreHttp = setHttpSource((url) => {
      urls.push(String(url));
      return Promise.resolve(googleAnswer("the answer"));
    });

    const result = await route("say hi", { taskType: "formatting", sessionNumber: 3 });
    assert.equal(result.content, "the answer");
    assert.equal(result.model_name, "flash"); // roles.generator.prefer[0]
    assert.equal(result.transport, "api");
    assert.deepEqual([result.input_tokens, result.output_tokens], [10, 100]);
    assert.equal(result.served_model_id, "g-served");

    const [row] = metricRows();
    assert.equal(row?.["session_number"], 3);
    assert.equal(row?.["transport"], "api");
    // The spend is attributable here, so the seat's flag stays unraised.
    assert.equal(row?.["billed_usage_unavailable"], null);
    assert.equal(row?.["requested_model_id"], "g-flash");
    assert.equal(row?.["served_model_id"], "g-served");
  });

  it("walks the role order on an escalation and records the history", async () => {
    configOnDisk();
    restoreHttp = setHttpSource((url) =>
      Promise.resolve(
        String(url).includes("g-flash")
          ? googleAnswer("", 0) // empty -> escalate
          : googleAnswer("recovered ".repeat(20), 200),
      ),
    );

    const result = await route("say hi", { taskType: "formatting" });
    assert.equal(result.escalated, true);
    assert.deepEqual(result.escalation_history, [["flash", "empty_response"]]);
    assert.equal(result.model_name, "pro");
    const [row] = metricRows();
    assert.equal(row?.["escalated"], true);
    assert.equal(row?.["model"], "pro");
  });

  it("stops at max_escalations even with candidates left", async () => {
    // The ladder is bounded by two independent limits -- how many models
    // remain, and how many escalations the config allows -- and a run that
    // escalated past the second would spend a call the operator capped.
    configOnDisk(
      makeConfig({
        escalation: {
          enabled: true,
          max_escalations: 1,
          triggers: { empty_response: true, min_output_tokens: 30 },
          refusal_phrases: [],
        },
      }),
    );
    const urls: string[] = [];
    restoreHttp = setHttpSource((url) => {
      urls.push(String(url));
      return Promise.resolve(googleAnswer("", 0)); // every model empties
    });

    const result = await route("say hi");
    assert.equal(result.escalation_history.length, 1);
    assert.equal(urls.length, 2);
  });

  it("honours an exclusion end to end, and fails closed when it leaves nothing", async () => {
    configOnDisk();
    const urls: string[] = [];
    restoreHttp = setHttpSource((url) => {
      urls.push(String(url));
      return Promise.resolve(
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: "from anthropic ".repeat(5) }],
            usage: { input_tokens: 5, output_tokens: 50 },
            stop_reason: "end_turn",
            model: "a-sonnet",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    });

    const result = await route("say hi", { excludeProviders: ["google", "openai"] });
    assert.equal(result.provider, "anthropic");
    assert.ok(!urls.join(" ").includes("google"));

    await assert.rejects(
      () => route("say hi", { excludeProviders: ["google", "openai", "anthropic"] }),
      NoCandidateError,
    );
  });
});

describe("dispatching over the offline transport", () => {
  it("takes one scripted response and does not escalate", async () => {
    const responses = tempDir("offline-");
    // "short" would escalate on any other path -- it is under the trigger's
    // floor and there is a second response to walk to.
    seed(responses, { "01.md": "short\n", "02.md": "the second, never reached\n" });
    configOnDisk(
      makeConfig({
        transports: { offline: { responses_dir: responses } },
        transport: { profile: "offline" },
      }),
    );
    const result = await route("say hi");
    assert.equal(result.content, "short\n");
    assert.equal(result.provider, "offline");
    assert.equal(result.escalated, false);
    assert.equal(result.served_model_id, "offline:01.md");
  });
});

describe("dispatching over the seat", () => {
  const SEAT_ANSWER = [
    JSON.stringify({
      type: "assistant.message",
      data: { content: "seat answer", model: "claude-x", outputTokens: 64 },
    }),
    JSON.stringify({ type: "result", sessionId: "conv-42", usage: { premiumRequests: 1 } }),
    "",
  ].join("\n");

  /** A fake seat and a synthetic catalog, bypassing lockfile discovery. */
  function installFakeSeat(stdout: string): void {
    installCopilotForTests(
      new CopilotCliTransport({
        spawner: () => ({
          stdout: Readable.from([stdout]),
          stderr: Readable.from([""]),
          kill: () => {
            /* nothing to kill: the streams end on their own */
          },
          wait: () => Promise.resolve(0),
        }),
      }),
      {
        meta: catalogMeta({ cli_version: "v", seat_id: "t" }),
        models: [
          modelEntry({ id: "claude-x", provider: "anthropic", enablement: "confirmed" }),
          modelEntry({ id: "gpt-x", provider: "openai", enablement: "confirmed" }),
        ],
      },
    );
  }

  it("records the conversation id and that the spend is not visible here", async () => {
    configOnDisk();
    installFakeSeat(SEAT_ANSWER);
    const result = await route("do a thing", { transport: "copilot-cli", sessionNumber: 3 });
    assert.equal(result.content, "seat answer");
    assert.equal(result.transport, "copilot-cli");
    assert.equal(result.transport_session_id, "conv-42");
    // No prefer entry names a seat id, so the catalog order stands.
    assert.equal(result.model_name, "claude-x");
    const [row] = metricRows();
    assert.equal(row?.["billed_usage_unavailable"], true);
    assert.equal(row?.["transport_session_id"], "conv-42");
    assert.equal(row?.["session_number"], 3);
  });

  it("raises a dispatch failure rather than returning empty content", async () => {
    configOnDisk();
    installFakeSeat("not json at all\n");
    await assert.rejects(() => route("x", { transport: "copilot-cli" }), /generic-unknown/);
  });

  it("stops on an unreadable catalog instead of falling back to the API", async () => {
    // The alternative that looks harmless is the worst option available: it
    // would put a cross-provider verification on the provider the operator
    // was routing away from, and nothing downstream could tell. The message
    // names the command that rebuilds the file, because an operator told a
    // file is wrong and handed no verb edits the file.
    configOnDisk();
    await assert.rejects(
      () => route("say hi", { transport: "copilot-cli" }),
      /could not be loaded/,
    );
  });
});
