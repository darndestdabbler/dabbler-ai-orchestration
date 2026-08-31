import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isOk, type APIResult } from "../src/transports/base.ts";
import {
  ENV_RESPONSES_DIR,
  OfflineTransport,
  OfflineTransportError,
  resolveResponsesDir,
} from "../src/transports/offline.ts";
import { HttpStatusError, callModel } from "../src/transports/api.ts";
import {
  confirmedCatalogEntries,
  confirmedModels,
  loadCatalog,
} from "../src/transports/copilot.ts";
import { TRANSPORT_OFFLINE, VALID_TRANSPORTS } from "../src/config.ts";
import {
  clearProviderKeys,
  makeConfig,
  makeTempDir,
  removeTempDirs,
  setProviderKeys,
} from "./support/fixtures.ts";

afterAll(removeTempDirs);

// --- The offline transport ---------------------------------------------------

function scripted(): OfflineTransport {
  const directory = join(makeTempDir(), "responses");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "01-first.md"), "first response\n", "utf8");
  writeFileSync(join(directory, "02-second.md"), "second response\n", "utf8");
  writeFileSync(join(directory, "notes.json"), "ignored\n", "utf8");
  return new OfflineTransport(directory);
}

async function dispatch(transport: OfflineTransport): Promise<APIResult> {
  return transport.dispatch({ model_id: "any", system_prompt: "", user_message: "" });
}

describe("the scripted response queue", () => {
  it("serves responses in lexical order, one per dispatch", async () => {
    const transport = scripted();
    expect((await dispatch(transport)).content).toBe("first response\n");
    expect((await dispatch(transport)).content).toBe("second response\n");
  });

  it("keeps the cursor on disk, because every verb is a separate process", async () => {
    const transport = scripted();
    await dispatch(transport);
    // A second transport over the same directory is what a second process is.
    const next = new OfflineTransport(transport.responsesDir);
    expect((await dispatch(next)).content).toBe("second response\n");
  });

  it("rewinds to the first response on reset", async () => {
    const transport = scripted();
    await dispatch(transport);
    transport.reset();
    expect((await dispatch(transport)).content).toBe("first response\n");
  });

  it("refuses to replay once the queue is exhausted", async () => {
    // A round 2 that quietly re-served round 1's response would make the
    // record claim something that did not happen.
    const transport = scripted();
    await dispatch(transport);
    await dispatch(transport);
    await expect(dispatch(transport)).rejects.toThrow(/exhausted: 2 scripted/);
  });

  it("refuses an empty response, which is an escalation trigger", async () => {
    const transport = scripted();
    writeFileSync(join(transport.responsesDir, "01-first.md"), "   \n", "utf8");
    await expect(dispatch(transport)).rejects.toThrow(/is empty/);
  });

  it("names a missing response directory", async () => {
    const transport = new OfflineTransport(join(makeTempDir(), "absent"));
    await expect(dispatch(transport)).rejects.toThrow(/does not exist/);
  });

  it("names a directory that holds no response files", async () => {
    const directory = join(makeTempDir(), "empty");
    mkdirSync(directory, { recursive: true });
    await expect(dispatch(new OfflineTransport(directory))).rejects.toThrow(
      /holds no \.md or \.txt files/,
    );
  });
});

describe("what an offline result claims", () => {
  it("never claims to be a provider", async () => {
    const transport = scripted();
    const result = await dispatch(transport);
    expect(result.served_model_id).toBe("offline:01-first.md");
    expect(result.metadata["simulated"]).toBe(true);
    expect(result.metadata["response_file"]).toBe("01-first.md");
    expect(isOk(result)).toBe(true);
  });

  it("meters nothing, because nothing was spent", async () => {
    // Zero here means unmeasured, and the escalation triggers read it that
    // way -- a zero token count never fires the short-response trigger.
    const result = await dispatch(scripted());
    expect([result.input_tokens, result.output_tokens]).toEqual([0, 0]);
    expect(result.stop_reason).toBe("end_turn");
  });
});

describe("selecting the offline transport", () => {
  const saved = process.env[ENV_RESPONSES_DIR];

  afterEach(() => {
    if (saved === undefined) delete process.env[ENV_RESPONSES_DIR];
    else process.env[ENV_RESPONSES_DIR] = saved;
  });

  it("is a transport the config vocabulary accepts", () => {
    expect(VALID_TRANSPORTS).toContain(TRANSPORT_OFFLINE);
  });

  it("lets the environment variable beat the config", () => {
    const directory = makeTempDir();
    process.env[ENV_RESPONSES_DIR] = directory;
    const resolved = resolveResponsesDir({
      transports: { offline: { responses_dir: "/configured" } },
    });
    expect(resolved).toBe(directory);
  });

  it("takes the directory from the config when the environment is silent", () => {
    delete process.env[ENV_RESPONSES_DIR];
    expect(
      resolveResponsesDir({ transports: { offline: { responses_dir: "/from-config" } } }),
    ).toBe("/from-config");
  });

  it("refuses rather than defaulting when nothing names a directory", () => {
    // There is no default location: the transport is opted into by saying
    // where the script lives, so it can never be selected by accident.
    delete process.env[ENV_RESPONSES_DIR];
    expect(() => resolveResponsesDir({})).toThrow(OfflineTransportError);
  });
});

// --- The direct-API transport ------------------------------------------------

const ANTHROPIC_OK = {
  content: [{ type: "text", text: "hello" }],
  usage: { input_tokens: 12, output_tokens: 34 },
  stop_reason: "end_turn",
  model: "a-sonnet-2026-01-01",
};

const GOOGLE_OK = {
  candidates: [
    { content: { parts: [{ text: "hi from gemini" }] }, finishReason: "STOP" },
  ],
  usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 21 },
  modelVersion: "g-pro-001",
};

const OPENAI_OK = {
  output_text: "hi from gpt",
  usage: { input_tokens: 9, output_tokens: 18 },
  status: "completed",
  model: "o-gpt-2026-03-17",
};

interface Captured {
  readonly url: string;
  readonly headers: Headers;
  readonly body: Record<string, unknown>;
}

/**
 * Every `fetch` the module makes, answered by `handler` -- which exercises
 * the real request-building code rather than a stand-in for it.
 */
function mockFetch(
  handler: (captured: Captured, call: number) => Response,
): Captured[] {
  const captured: Captured[] = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    const entry: Captured = {
      url: String(url),
      headers: new Headers(init.headers),
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
    };
    captured.push(entry);
    return Promise.resolve(handler(entry, captured.length));
  });
  return captured;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function providerConfig(name: string): Record<string, unknown> {
  const providers = makeConfig()["providers"] as Record<string, unknown>;
  return providers[name] as Record<string, unknown>;
}

describe("the Anthropic caller", () => {
  beforeEach(setProviderKeys);
  afterEach(() => {
    vi.unstubAllGlobals();
    clearProviderKeys();
  });

  it("builds the request Anthropic documents and reads its result", async () => {
    const captured = mockFetch(() => jsonResponse(200, ANTHROPIC_OK));
    const result = await callModel(
      "anthropic", "a-sonnet", "sys", "user msg", 1000,
      providerConfig("anthropic"),
      { effort: "high", thinking: { enabled: true } },
    );
    expect(result.content).toBe("hello");
    expect([result.input_tokens, result.output_tokens]).toEqual([12, 34]);
    expect(result.served_model_id).toBe("a-sonnet-2026-01-01");

    const request = captured[0] as Captured;
    expect(request.body["system"]).toBe("sys");
    expect(request.body["thinking"]).toEqual({ type: "adaptive" });
    expect((request.body["output_config"] as Record<string, unknown>)["effort"]).toBe(
      "high",
    );
    expect(request.headers.get("x-api-key")).toBe("test-key");
  });

  it("refuses a missing key before any request is made", async () => {
    delete process.env["TEST_ANTHROPIC_KEY"];
    const captured = mockFetch(() => jsonResponse(200, ANTHROPIC_OK));
    await expect(
      callModel("anthropic", "a-sonnet", "s", "u", 100, providerConfig("anthropic")),
    ).rejects.toThrow(/TEST_ANTHROPIC_KEY/);
    expect(captured).toHaveLength(0);
  });

  it("retries an error status and then succeeds", async () => {
    const captured = mockFetch((_entry, call) =>
      call === 1 ? jsonResponse(500, {}) : jsonResponse(200, ANTHROPIC_OK),
    );
    const result = await callModel(
      "anthropic", "a-sonnet", "s", "u", 100, providerConfig("anthropic"),
    );
    expect(result.content).toBe("hello");
    expect(captured).toHaveLength(2);
  });

  it("raises once the retries are exhausted", async () => {
    mockFetch(() => jsonResponse(500, {}));
    await expect(
      callModel("anthropic", "a-sonnet", "s", "u", 100, providerConfig("anthropic")),
    ).rejects.toThrow(/failed after 2 attempts/);
  });

  it("classifies an error status as retryable and a decode failure as not", async () => {
    // The two httpx classes Python retries are status and timeout, and
    // nothing else. A body that is not JSON must reach the caller on the
    // first attempt rather than being tried twice.
    const captured = mockFetch(
      () => new Response("<html>", { headers: { "content-type": "text/html" } }),
    );
    await expect(
      callModel("anthropic", "a-sonnet", "s", "u", 100, providerConfig("anthropic")),
    ).rejects.not.toBeInstanceOf(HttpStatusError);
    expect(captured).toHaveLength(1);
  });
});

describe("the Google caller", () => {
  beforeEach(setProviderKeys);
  afterEach(() => {
    vi.unstubAllGlobals();
    clearProviderKeys();
  });

  it("puts the key in a header and never in the URL", async () => {
    // An error renders the full URL into operator-visible output, and a
    // `?key=` URL would leak a live credential into a log.
    const captured = mockFetch(() => jsonResponse(200, GOOGLE_OK));
    const result = await callModel(
      "google", "g-pro", "sys", "user", 500, providerConfig("google"),
      { thinking_budget: -1 },
    );
    const request = captured[0] as Captured;
    expect(request.headers.get("x-goog-api-key")).toBe("test-key");
    expect(request.url).not.toContain("key=");
    expect(result.content).toBe("hi from gemini");
    expect(result.served_model_id).toBe("g-pro-001");

    const generationConfig = request.body["generationConfig"] as Record<string, unknown>;
    expect(
      (generationConfig["thinkingConfig"] as Record<string, unknown>)["thinkingBudget"],
    ).toBe(-1);
  });

  it("sends a thinking LEVEL for Gemini 3 and a budget for 2.5", async () => {
    const captured = mockFetch(() => jsonResponse(200, GOOGLE_OK));
    await callModel(
      "google", "gemini-3-pro", "s", "u", 500, providerConfig("google"),
      { thinking_level: "high", thinking_budget: -1 },
    );
    const generationConfig = (captured[0] as Captured)["body"][
      "generationConfig"
    ] as Record<string, unknown>;
    expect(generationConfig["thinkingConfig"]).toEqual({ thinkingLevel: "HIGH" });
  });

  it("fails on a 200 that carries no candidate, rather than inventing one", async () => {
    // A safety block answers 200 with no candidate. Python indexes and
    // raises; coercing the absence would put the literal word "undefined"
    // through every escalation trigger as if it were an answer.
    mockFetch(() => jsonResponse(200, { usageMetadata: {} }));
    await expect(
      callModel("google", "g-pro", "s", "u", 500, providerConfig("google")),
    ).rejects.toThrow(/no candidate/);
  });

  it("maps MAX_TOKENS onto the stop reason the escalation triggers read", async () => {
    const payload = structuredClone(GOOGLE_OK);
    payload.candidates[0]!.finishReason = "MAX_TOKENS";
    mockFetch(() => jsonResponse(200, payload));
    const result = await callModel(
      "google", "g-pro", "s", "u", 500, providerConfig("google"),
    );
    expect(result.stop_reason).toBe("max_tokens");
  });
});

describe("the OpenAI caller", () => {
  beforeEach(setProviderKeys);
  afterEach(() => {
    vi.unstubAllGlobals();
    clearProviderKeys();
  });

  it("builds a Responses-API request and reads its result", async () => {
    const captured = mockFetch(() => jsonResponse(200, OPENAI_OK));
    const result = await callModel(
      "openai", "o-gpt", "sys", "user", 800, providerConfig("openai"),
      { reasoning_effort: "high" },
    );
    const request = captured[0] as Captured;
    expect(request.body["instructions"]).toBe("sys");
    expect(request.body["reasoning"]).toEqual({ effort: "high" });
    expect(request.body["max_output_tokens"]).toBe(800);
    expect(request.headers.get("authorization")).toBe("Bearer test-key");
    expect(result.content).toBe("hi from gpt");
    expect(result.served_model_id).toBe("o-gpt-2026-03-17");
  });

  it("walks the output blocks when there is no output_text", async () => {
    mockFetch(() =>
      jsonResponse(200, {
        output: [
          {
            type: "message",
            content: [
              { type: "output_text", text: "part1 " },
              { type: "text", text: "part2" },
            ],
          },
        ],
        usage: { input_tokens: 1, output_tokens: 2 },
        status: "completed",
      }),
    );
    const result = await callModel(
      "openai", "o-gpt", "s", "u", 100, providerConfig("openai"),
    );
    expect(result.content).toBe("part1 part2");
    // Absent, not empty: "the provider did not say" is a different fact from
    // "it served something unnamed", and the metrics keep them apart.
    expect(result.served_model_id).toBeNull();
  });

  it("maps an incomplete status onto max_tokens", async () => {
    mockFetch(() =>
      jsonResponse(200, {
        ...OPENAI_OK,
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
      }),
    );
    const result = await callModel(
      "openai", "o-gpt", "s", "u", 100, providerConfig("openai"),
    );
    expect(result.stop_reason).toBe("max_tokens");
  });
});

describe("a served model that is not the one asked for", () => {
  beforeEach(setProviderKeys);
  afterEach(() => {
    vi.unstubAllGlobals();
    clearProviderKeys();
  });

  it("is announced on stderr and still returned", async () => {
    // OpenAI has resolved a bare id to a differently-priced variant with
    // nothing else able to see it, so the note is the only warning there is.
    mockFetch(() => jsonResponse(200, ANTHROPIC_OK));
    const written: string[] = [];
    const write = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk: unknown) => {
        written.push(String(chunk));
        return true;
      });
    try {
      const result = await callModel(
        "anthropic", "a-sonnet", "s", "u", 100, providerConfig("anthropic"),
      );
      expect(result.content).toBe("hello");
    } finally {
      write.mockRestore();
    }
    expect(written.join("")).toContain("but anthropic served 'a-sonnet-2026-01-01'");
  });
});

describe("a provider with no caller", () => {
  it("is a programmer error, not a routing decision", async () => {
    await expect(
      callModel("mystery", "m", "s", "u", 10, providerConfig("openai")),
    ).rejects.toThrow("'mystery'");
  });
});

// A read of the file the offline transport does NOT touch, kept here because
// it is the transports' own fixture rule: text mode on the way in.
describe("a canned response written on Windows", () => {
  it("reaches the prompt with the endings its Python twin sees", async () => {
    const transport = scripted();
    writeFileSync(join(transport.responsesDir, "01-first.md"), "a\r\nb\r\n", "utf8");
    const result = await dispatch(transport);
    expect(result.content).toBe("a\nb\n");
    // The file itself is untouched; only the read translates.
    expect(readFileSync(join(transport.responsesDir, "01-first.md"), "utf8")).toBe(
      "a\r\nb\r\n",
    );
  });
});

// --- The seat catalog, as far as a reader sees it ----------------------------

function writeCatalog(body: string): string {
  const path = join(makeTempDir(), "copilot-catalog.lock");
  writeFileSync(path, body, { encoding: "utf8" });
  return path;
}

describe("reading the seat catalog", () => {
  it("reads the probe date and the confirmed entries, and leaves the rest", () => {
    // The two things the ported modules ask of the seat: `discovery` dates
    // its own record against `probed_at`, and `identity` resolves a provider
    // through the confirmed universe -- an unconfirmed entry is not one.
    const catalog = loadCatalog(
      writeCatalog(
        [
          "[meta]",
          'cli_version = "0.0.1"',
          'seat_id = "seat-a"',
          'probed_at = "2026-08-19T12:13:37Z"',
          "",
          "[[models]]",
          'id = "claude-x"',
          'provider = "anthropic"',
          'enablement = "confirmed"',
          "",
          "[[models]]",
          'id = "gpt-x"',
          'provider = "openai"',
          'enablement = "unconfirmed"',
          "",
        ].join("\n"),
      ),
    );
    expect(catalog.meta.probed_at).toBe("2026-08-19T12:13:37Z");
    // Off by default: the seat CLI updates itself, so a pin that defaulted
    // to strict would turn every routine auto-update into a dead seat.
    expect(catalog.meta.cli_version_pin_required).toBe(false);
    expect(confirmedModels(catalog).map((entry) => entry.id)).toEqual(["claude-x"]);
  });

  it("refuses a lock missing a required meta key", () => {
    expect(() => loadCatalog(writeCatalog('[meta]\nseat_id = "seat-a"\n'))).toThrow(
      /missing required key 'cli_version'/,
    );
  });

  it("resolves nothing at all from a malformed lock", () => {
    // A bare model id with no trustworthy provenance is what the caller must
    // fail closed on, and a lock with one broken entry says nothing reliable
    // about the others -- so the best-effort reader yields none rather than
    // the ones it happened to parse.
    const path = writeCatalog(
      [
        "[meta]",
        'cli_version = "0.0.1"',
        'seat_id = "seat-a"',
        "",
        "[[models]]",
        'id = "claude-x"',
        'enablement = "confirmed"',
        'provider = "anthropic"',
        "",
        "[[models]]",
        'provider = "openai"',
        'enablement = "confirmed"',
        "",
      ].join("\n"),
    );
    expect(() => loadCatalog(path)).toThrow(/malformed \[\[models\]\] entry/);
    expect(confirmedCatalogEntries(path)).toEqual([]);
  });
});
