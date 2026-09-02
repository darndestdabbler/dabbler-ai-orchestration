import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONFIG_ENV_VAR } from "../src/config.ts";
import { loadMetrics } from "../src/metrics.ts";
import {
  NoCandidateError,
  PromptTooLargeError,
  RouterError,
  buildPrompt,
  installCopilotForTests,
  resetForTests,
  route,
} from "../src/route.ts";
import {
  CopilotCliTransport,
  REFRESH_COMMAND,
  catalogMeta,
  modelEntry,
} from "../src/transports/copilot.ts";
import { resetForTests as resetRuntimeMode } from "../src/runtimeMode.ts";
import {
  clearProviderKeys,
  makeConfig,
  makeTempDir,
  removeTempDirs,
  setProviderKeys,
  writeConfig,
} from "./support/fixtures.ts";

afterAll(removeTempDirs);

let configPath = "";

/**
 * The config on disk with `AI_ROUTER_CONFIG` pointing at it, so `route`'s
 * lazy load resolves hermetically -- and the metrics land beside it.
 */
function configOnDisk(config: Record<string, unknown> = makeConfig()): string {
  const directory = makeTempDir();
  configPath = writeConfig(directory, config);
  process.env[CONFIG_ENV_VAR] = configPath;
  return configPath;
}

function metricRows(): Array<Record<string, unknown>> {
  return loadMetrics({ _config_path: configPath });
}

function googleResponse(text: string, outTokens = 100): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        { content: { parts: [{ text }] }, finishReason: "STOP" },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: outTokens },
      modelVersion: "g-served",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function openaiResponse(text: string, outTokens = 40): Response {
  return new Response(
    JSON.stringify({
      output_text: text,
      usage: { input_tokens: 12, output_tokens: outTokens },
      model: "o-served",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

/** Every request the route takes, answered by `handler`. */
function mockApi(handler: (url: string) => Response): string[] {
  const urls: string[] = [];
  vi.stubGlobal("fetch", (url: string) => {
    urls.push(String(url));
    return Promise.resolve(handler(String(url)));
  });
  return urls;
}

beforeEach(() => {
  setProviderKeys();
  // `bootstrap` persists this at user scope on a seat machine, and it
  // outranks the config the fixture writes.
  delete process.env["DABBLER_TRANSPORT"];
  delete process.env["DABBLER_NO_ROUTER"];
  resetForTests();
  resetRuntimeMode();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearProviderKeys();
  delete process.env[CONFIG_ENV_VAR];
  delete process.env["DABBLER_NO_ROUTER"];
  delete process.env["DABBLER_TRANSPORT"];
  resetForTests();
  resetRuntimeMode();
});

describe("--no-router mode", () => {
  it("short-circuits before the config is even loaded", async () => {
    // No config, no keys, no network -- and it must still answer.
    process.env["DABBLER_NO_ROUTER"] = "1";
    resetRuntimeMode();
    const result = await route("anything");
    expect(result.model_name).toBe("no-router-mode");
    expect(result.transport).toBe("none");
  });
});

describe("routing over the direct-API transport", () => {
  it("records the tokens and the telemetry row end to end", async () => {
    configOnDisk();
    mockApi(() => googleResponse("the answer"));
    const result = await route("say hi", { taskType: "formatting", sessionNumber: 3 });

    expect(result.content).toBe("the answer");
    expect(result.model_name).toBe("flash"); // roles.generator.prefer[0]
    expect(result.transport).toBe("api");
    expect([result.input_tokens, result.output_tokens]).toEqual([10, 100]);
    expect(result.served_model_id).toBe("g-served");

    const rows = metricRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!["session_number"]).toBe(3);
    expect(rows[0]!["transport"]).toBe("api");
    expect(rows[0]!["billed_usage_unavailable"]).toBeNull();
    expect(rows[0]!["requested_model_id"]).toBe("g-flash");
    expect(rows[0]!["served_model_id"]).toBe("g-served");
  });

  it("walks the role order on an escalation and records the history", async () => {
    configOnDisk();
    mockApi((url) =>
      url.includes("g-flash")
        ? googleResponse("", 0) // empty -> escalate
        : googleResponse("recovered ".repeat(20), 200),
    );
    const result = await route("say hi", { taskType: "formatting" });

    expect(result.escalated).toBe(true);
    expect(result.escalation_history).toEqual([["flash", "empty_response"]]);
    expect(result.model_name).toBe("pro");
    const rows = metricRows();
    expect(rows[0]!["escalated"]).toBe(true);
    expect(rows[0]!["model"]).toBe("pro");
  });

  it("honours an exclusion end to end", async () => {
    configOnDisk();
    const urls = mockApi(
      () =>
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
    const result = await route("say hi", { excludeProviders: ["google", "openai"] });
    expect(result.provider).toBe("anthropic");
    expect(urls.join(" ")).not.toContain("google");
  });

  it("fails closed when the exclusion leaves no candidate", async () => {
    configOnDisk();
    await expect(
      route("say hi", { excludeProviders: ["google", "openai", "anthropic"] }),
    ).rejects.toThrow(NoCandidateError);
  });

  it("fails closed on a keyless machine rather than blowing up on a lookup", async () => {
    configOnDisk();
    clearProviderKeys();
    await expect(route("say hi")).rejects.toThrow(NoCandidateError);
  });

  it("refuses an excluded provider at the call site, not only at selection", async () => {
    // Cross-provider review is the one invariant a later preference path
    // must not be able to undo, so the exclusion is asserted immediately
    // before the wire as well as where candidates were filtered. No current
    // path can reach that assertion, which is the point -- so selection is
    // replaced here with one that ignores the exclusion, as a future
    // preference path might.
    configOnDisk();
    mockApi(() => googleResponse("never sent"));
    vi.resetModules();
    vi.doMock("../src/selection.ts", async () => {
      const actual =
        await vi.importActual<typeof import("../src/selection.ts")>(
          "../src/selection.ts",
        );
      return { ...actual, registryCandidates: () => ["flash"] };
    });
    try {
      const routed = await import("../src/route.ts");
      routed.resetForTests();
      const failure = await routed
        .route("say hi", { excludeProviders: ["google"] })
        .then(() => null)
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(routed.ExcludedProviderError);
      expect(String(failure)).toContain("google");
    } finally {
      vi.doUnmock("../src/selection.ts");
      vi.resetModules();
    }
  });
});

describe("routing over the seat", () => {
  const COPILOT_OK = [
    JSON.stringify({
      type: "assistant.message",
      data: { content: "seat answer", model: "claude-x", outputTokens: 64 },
    }),
    JSON.stringify({
      type: "result",
      sessionId: "conv-42",
      usage: { premiumRequests: 1 },
    }),
    "",
  ].join("\n");

  /** A fake seat and a synthetic catalog, bypassing lockfile discovery. */
  function installFakeSeat(stdout: string): void {
    installCopilotForTests(
      new CopilotCliTransport({
        spawner: () => ({
          stdout: Readable.from([stdout]),
          stderr: Readable.from([""]),
          kill: () => { /* nothing to kill: the streams end on their own */ },
          wait: () => Promise.resolve(0),
        }),
      }),
      {
        meta: catalogMeta({ cli_version: "v", seat_id: "t" }),
        models: [
          modelEntry({ id: "claude-x", provider: "anthropic", enablement: "confirmed" }),
          modelEntry({ id: "gpt-x", provider: "openai", enablement: "confirmed" }),
          modelEntry({ id: "gemini-x", provider: "google", enablement: "confirmed" }),
        ],
      },
    );
  }

  it("records the conversation id and that the spend is not visible here", async () => {
    configOnDisk();
    installFakeSeat(COPILOT_OK);
    const result = await route("do a thing", {
      transport: "copilot-cli",
      sessionNumber: 3,
    });
    expect(result.content).toBe("seat answer");
    expect(result.transport).toBe("copilot-cli");
    expect(result.transport_session_id).toBe("conv-42");
    // No prefer entry names a seat id, so the catalog order stands.
    expect(result.model_name).toBe("claude-x");
    const [row] = metricRows();
    expect(row!["billed_usage_unavailable"]).toBe(true);
    expect(row!["transport"]).toBe("copilot-cli");
    expect(row!["transport_session_id"]).toBe("conv-42");
  });

  it("walks past the preferred provider when it is excluded", async () => {
    configOnDisk();
    installFakeSeat(COPILOT_OK);
    const result = await route("do a thing", {
      transport: "copilot-cli",
      excludeProviders: ["anthropic"],
    });
    expect(result.provider).toBe("openai");
    expect(result.model_name).toBe("gpt-x");
  });

  it("fails closed when the exclusion leaves no confirmed entry", async () => {
    configOnDisk();
    installFakeSeat(COPILOT_OK);
    await expect(
      route("x", {
        transport: "copilot-cli",
        excludeProviders: ["anthropic", "openai", "google"],
      }),
    ).rejects.toBeInstanceOf(NoCandidateError);
  });

  it("raises a dispatch failure rather than returning empty content", async () => {
    configOnDisk();
    installFakeSeat("not json at all\n");
    await expect(route("x", { transport: "copilot-cli" })).rejects.toThrow(
      /generic-unknown/,
    );
  });

  it("stops on an unreadable catalog instead of falling back to the API", async () => {
    // The alternative that looks harmless is the worst option available: it
    // would put a cross-provider verification on the provider the operator
    // was routing away from, and nothing downstream could tell. The message
    // names the command that rebuilds the file, because an operator told a
    // file is wrong and handed no verb edits the file.
    configOnDisk();
    const failure = await route("say hi", { transport: "copilot-cli" })
      .then(() => null)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RouterError);
    expect(String(failure)).toContain("could not be loaded");
    expect(String(failure)).toContain(REFRESH_COMMAND);
  });
});

describe("a prompt over the model's input budget", () => {
  const modelConfig = { max_context_tokens: 1000 };

  it("is refused with the overrun and the remedy, never trimmed", () => {
    // Tail-chopping a review bundle drops the end of the diff while the
    // handoff acknowledgement still validates, so a truncated review returns
    // a clean-looking verdict.
    const failure = (): unknown =>
      buildPrompt("x".repeat(5000), "", "code-review", modelConfig, {});
    expect(failure).toThrow(PromptTooLargeError);
    expect(failure).toThrow(/an overrun of 450 tokens/);
    expect(failure).toThrow(/split the session/);
  });

  it("stops the call before anything is dispatched", async () => {
    configOnDisk(
      makeConfig({
        models: {
          tiny: { provider: "google", model_id: "g-tiny", max_context_tokens: 1000, max_output_tokens: 100 },
        },
        roles: { generator: { prefer: ["g-tiny"] } },
      }),
    );
    const urls = mockApi(() => googleResponse("never sent"));
    await expect(route("x".repeat(5000))).rejects.toThrow(PromptTooLargeError);
    expect(urls).toHaveLength(0);
  });
});

describe("auto-verification", () => {
  const AUTO_VERIFY = {
    verification: { enabled: true, auto_verify_task_types: ["code-review"] },
  };

  /** The generator answers from google; the verifier must not. */
  function twoProviders(verdict: string): string[] {
    return mockApi((url) =>
      url.includes("openai")
        ? openaiResponse(verdict)
        : googleResponse("a review ".repeat(20), 200),
    );
  }

  it("verifies through a different provider and reports the verdict", async () => {
    configOnDisk(makeConfig(AUTO_VERIFY));
    const urls = twoProviders("VERIFIED\n\nNothing to raise.");
    const result = await route("say hi", { taskType: "code-review" });

    expect(urls.some((url) => url.includes("google"))).toBe(true);
    expect(urls.some((url) => url.includes("openai"))).toBe(true);
    expect(result.metadata["verification"]).toEqual({
      verdict: "VERIFIED",
      blocking: false,
      issue_count: 0,
      verifier_model: "gpt",
      verifier_provider: "openai",
    });
  });

  it("records the verifying call against the model it reviewed", async () => {
    configOnDisk(makeConfig(AUTO_VERIFY));
    twoProviders("VERIFIED");
    await route("say hi", { taskType: "code-review" });

    const verify = metricRows().filter((row) => row["call_type"] === "verify");
    expect(verify).toHaveLength(1);
    expect(verify[0]["verifier_of"]).toBe("flash");
    expect(verify[0]["verdict"]).toBe("VERIFIED");
  });

  it("keeps the paid-for answer when no verifier can be reached", async () => {
    // Best-effort by contract: the routed call already succeeded and was
    // billed, so losing the review must not lose the result. The verifier is
    // confined to the one provider that just did the work, so the exclusion
    // leaves no candidate and `route` raises rather than reviewing itself --
    // which is the failure this branch has to swallow.
    configOnDisk(makeConfig(AUTO_VERIFY));
    // Google is the only provider whose key resolves, and it is the one the
    // exclusion removes.
    clearProviderKeys();
    process.env["TEST_GOOGLE_KEY"] = "test-key";
    const urls = mockApi(() => googleResponse("a review ".repeat(20), 200));
    const result = await route("say hi", { taskType: "code-review" });

    expect(result.content).toContain("a review");
    expect(result.metadata["verification"]).toBeUndefined();
    expect(urls.filter((url) => url.includes("openai"))).toHaveLength(0);
  });

  it("does not verify a verification, which would recurse", async () => {
    configOnDisk(
      makeConfig({
        verification: {
          enabled: true,
          auto_verify_task_types: ["code-review", "verification"],
        },
      }),
    );
    const urls = twoProviders("VERIFIED");
    await route("say hi", { taskType: "verification" });
    expect(urls).toHaveLength(1);
  });
});

describe("the offline transport through route()", () => {
  it("dispatches one scripted response and does not escalate", async () => {
    // Escalating between scripted responses would consume the queue to hide
    // a script the operator wrote on purpose.
    const responses = makeTempDir();
    // "short" would escalate on any other path -- it is under the trigger's
    // floor and there is a second response to walk to.
    writeFileSync(join(responses, "01.md"), "short\n", "utf8");
    writeFileSync(join(responses, "02.md"), "the second, never reached\n", "utf8");
    configOnDisk(
      makeConfig({
        transports: { offline: { responses_dir: responses } },
        transport: { profile: "offline" },
      }),
    );
    const result = await route("say hi");
    expect(result.content).toBe("short\n");
    expect(result.provider).toBe("offline");
    expect(result.escalated).toBe(false);
    expect(result.served_model_id).toBe("offline:01.md");
  });
});

describe("the round-trip through the escalation ladder's ceiling", () => {
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
    const urls = mockApi(() => googleResponse("", 0)); // every model empties
    const result = await route("say hi");
    expect(result.escalation_history).toHaveLength(1);
    expect(urls).toHaveLength(2);
  });
});
