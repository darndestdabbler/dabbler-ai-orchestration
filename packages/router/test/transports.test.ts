// The three transports other than the seat: the shared result vocabulary,
// the offline transport that answers from files, and the direct-API path.
//
// The API path reaches the wire through one named seam (`setHttpSource`),
// the counterpart of the seat's spawner. A test answers it with a recorded
// response, so the request this module BUILDS and the response it READS are
// the shipping code -- no module is replaced, and no request leaves the
// process.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { TRANSPORT_OFFLINE, VALID_TRANSPORTS } from "../src/config.ts";
import {
  HttpStatusError,
  callModel,
  setHttpSource,
  type ProviderConfig,
} from "../src/transports/api.ts";
import { isOk, type APIResult } from "../src/transports/base.ts";
import {
  ENV_RESPONSES_DIR,
  OfflineTransport,
  resolveResponsesDir,
} from "../src/transports/offline.ts";
import { makeConfig, seed, setProviderKeys, tempDir } from "./support/answers.ts";

// --- The shared vocabulary ---------------------------------------------------

describe("what a transport result says about itself", () => {
  const base: APIResult = {
    content: "x",
    input_tokens: 1,
    output_tokens: 1,
    stop_reason: "end_turn",
    metadata: {},
  };

  it("calls a result with no error class a landed call", () => {
    assert.equal(isOk(base), true);
    assert.equal(isOk({ ...base, metadata: { error_class: null } }), true);
    assert.equal(isOk({ ...base, metadata: { error_class: "spawn-timeout" } }), false);
  });
});

// --- The offline transport ---------------------------------------------------

function scripted(): OfflineTransport {
  const directory = join(tempDir("offline-"), "responses");
  seed(directory, {
    "01-first.md": "first response\n",
    "02-second.md": "second response\n",
    "notes.json": "ignored\n",
  });
  return new OfflineTransport(directory);
}

function dispatch(transport: OfflineTransport): Promise<APIResult> {
  return transport.dispatch({ model_id: "any", system_prompt: "", user_message: "" });
}

describe("the scripted response queue", () => {
  it("serves responses in lexical order, one per dispatch", async () => {
    const transport = scripted();
    assert.equal((await dispatch(transport)).content, "first response\n");
    assert.equal((await dispatch(transport)).content, "second response\n");
  });

  it("keeps the cursor on disk, because every verb is a separate process", async () => {
    const transport = scripted();
    await dispatch(transport);
    // A second transport over the same directory is what a second process is.
    const next = new OfflineTransport(transport.responsesDir);
    assert.equal((await dispatch(next)).content, "second response\n");
  });

  it("rewinds to the first response on reset", async () => {
    const transport = scripted();
    await dispatch(transport);
    transport.reset();
    assert.equal((await dispatch(transport)).content, "first response\n");
  });

  it("refuses to replay once the queue is exhausted", async () => {
    // A round 2 that quietly re-served round 1's response would make the
    // record claim something that did not happen.
    const transport = scripted();
    await dispatch(transport);
    await dispatch(transport);
    await assert.rejects(() => dispatch(transport), /exhausted: 2 scripted/);
  });

  it("refuses an empty response, which is an escalation trigger", async () => {
    const transport = scripted();
    seed(transport.responsesDir, { "01-first.md": "   \n" });
    await assert.rejects(() => dispatch(transport), /is empty/);
  });

  it("names a missing response directory and an empty one", async () => {
    await assert.rejects(
      () => dispatch(new OfflineTransport(join(tempDir("offline-"), "absent"))),
      /does not exist/,
    );
    await assert.rejects(
      () => dispatch(new OfflineTransport(tempDir("empty-"))),
      /holds no \.md or \.txt files/,
    );
  });

  it("reads a response written on Windows the way its Python twin does", async () => {
    const transport = scripted();
    seed(transport.responsesDir, { "01-first.md": "a\r\nb\r\n" });
    assert.equal((await dispatch(transport)).content, "a\nb\n");
    // The file itself is untouched; only the read translates.
    assert.equal(
      readFileSync(join(transport.responsesDir, "01-first.md"), "utf8"),
      "a\r\nb\r\n",
    );
  });
});

describe("what an offline result claims", () => {
  it("never claims to be a provider", async () => {
    const result = await dispatch(scripted());
    assert.equal(result.served_model_id, "offline:01-first.md");
    assert.equal(result.metadata["simulated"], true);
    assert.equal(result.metadata["response_file"], "01-first.md");
    assert.equal(isOk(result), true);
  });

  it("meters nothing, because nothing was spent", async () => {
    // Zero here means unmeasured, and the escalation triggers read it that
    // way -- a zero token count never fires the short-response trigger.
    const result = await dispatch(scripted());
    assert.deepEqual([result.input_tokens, result.output_tokens], [0, 0]);
    assert.equal(result.stop_reason, "end_turn");
  });
});

describe("selecting the offline transport", () => {
  const saved = process.env[ENV_RESPONSES_DIR];
  afterEach(() => {
    if (saved === undefined) delete process.env[ENV_RESPONSES_DIR];
    else process.env[ENV_RESPONSES_DIR] = saved;
  });

  it("is a transport the config vocabulary accepts", () => {
    assert.ok((VALID_TRANSPORTS as readonly string[]).includes(TRANSPORT_OFFLINE));
  });

  it("lets the environment variable beat the config", () => {
    const directory = tempDir("offline-");
    process.env[ENV_RESPONSES_DIR] = directory;
    assert.equal(
      resolveResponsesDir({ transports: { offline: { responses_dir: "/configured" } } }),
      directory,
    );
  });

  it("takes the directory from the config when the environment is silent", () => {
    delete process.env[ENV_RESPONSES_DIR];
    assert.equal(
      resolveResponsesDir({ transports: { offline: { responses_dir: "/from-config" } } }),
      "/from-config",
    );
  });

  it("refuses rather than defaulting when nothing names a directory", () => {
    // There is no default location: the transport is opted into by saying
    // where the script lives, so it can never be selected by accident.
    delete process.env[ENV_RESPONSES_DIR];
    assert.throws(() => resolveResponsesDir({}), /needs a response directory/);
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
  candidates: [{ content: { parts: [{ text: "hi from gemini" }] }, finishReason: "STOP" }],
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

const KEYS = ["TEST_ANTHROPIC_KEY", "TEST_GOOGLE_KEY", "TEST_OPENAI_KEY"];
let restoreHttp: (() => void) | null = null;

/** Answer every request `handler` sees, and keep what was sent. */
function answerWith(handler: (captured: Captured, call: number) => Response): Captured[] {
  const captured: Captured[] = [];
  restoreHttp = setHttpSource((url, init) => {
    const entry: Captured = {
      url: String(url),
      headers: new Headers(init.headers),
      body: JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>,
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

function providerConfig(name: string): ProviderConfig {
  return (makeConfig()["providers"] as Record<string, ProviderConfig>)[name] as ProviderConfig;
}

describe("calling a provider API", () => {
  beforeEach(setProviderKeys);
  afterEach(() => {
    restoreHttp?.();
    restoreHttp = null;
    for (const name of KEYS) delete process.env[name];
  });

  it("builds the request Anthropic documents and reads its result", async () => {
    const captured = answerWith(() => jsonResponse(200, ANTHROPIC_OK));
    const result = await callModel(
      "anthropic",
      "a-sonnet",
      "sys",
      "user msg",
      1000,
      providerConfig("anthropic"),
      { effort: "high", thinking: { enabled: true } },
    );
    assert.equal(result.content, "hello");
    assert.deepEqual([result.input_tokens, result.output_tokens], [12, 34]);
    assert.equal(result.served_model_id, "a-sonnet-2026-01-01");

    const request = captured[0] as Captured;
    assert.equal(request.body["system"], "sys");
    assert.deepEqual(request.body["thinking"], { type: "adaptive" });
    assert.equal(
      (request.body["output_config"] as Record<string, unknown>)["effort"],
      "high",
    );
    assert.equal(request.headers.get("x-api-key"), "test-key");
  });

  it("refuses a missing key before any request is made", async () => {
    delete process.env["TEST_ANTHROPIC_KEY"];
    const captured = answerWith(() => jsonResponse(200, ANTHROPIC_OK));
    await assert.rejects(
      () => callModel("anthropic", "a-sonnet", "s", "u", 100, providerConfig("anthropic")),
      /TEST_ANTHROPIC_KEY/,
    );
    assert.equal(captured.length, 0);
  });

  it("retries an error status and then succeeds", async () => {
    const captured = answerWith((_entry, call) =>
      call === 1 ? jsonResponse(500, {}) : jsonResponse(200, ANTHROPIC_OK),
    );
    const result = await callModel(
      "anthropic",
      "a-sonnet",
      "s",
      "u",
      100,
      providerConfig("anthropic"),
    );
    assert.equal(result.content, "hello");
    assert.equal(captured.length, 2);
  });

  it("raises once the retries are exhausted", async () => {
    answerWith(() => jsonResponse(500, {}));
    await assert.rejects(
      () => callModel("anthropic", "a-sonnet", "s", "u", 100, providerConfig("anthropic")),
      /failed after 2 attempts/,
    );
  });

  it("classifies an error status as retryable and a decode failure as not", async () => {
    // The two httpx classes Python retries are status and timeout, and
    // nothing else. A body that is not JSON must reach the caller on the
    // first attempt rather than being tried twice.
    const captured = answerWith(
      () => new Response("<html>", { headers: { "content-type": "text/html" } }),
    );
    const failure = await callModel(
      "anthropic",
      "a-sonnet",
      "s",
      "u",
      100,
      providerConfig("anthropic"),
    ).then(
      () => null,
      (error: unknown) => error,
    );
    assert.ok(failure !== null && !(failure instanceof HttpStatusError));
    assert.equal(captured.length, 1);
  });

  it("puts Google's key in a header and never in the URL", async () => {
    // An error renders the full URL into operator-visible output, and a
    // `?key=` URL would leak a live credential into a log.
    const captured = answerWith(() => jsonResponse(200, GOOGLE_OK));
    const result = await callModel(
      "google",
      "g-pro",
      "sys",
      "user",
      500,
      providerConfig("google"),
      { thinking_budget: -1 },
    );
    const request = captured[0] as Captured;
    assert.equal(request.headers.get("x-goog-api-key"), "test-key");
    assert.ok(!request.url.includes("key="));
    assert.equal(result.content, "hi from gemini");
    assert.equal(result.served_model_id, "g-pro-001");
    const generationConfig = request.body["generationConfig"] as Record<string, unknown>;
    assert.equal(
      (generationConfig["thinkingConfig"] as Record<string, unknown>)["thinkingBudget"],
      -1,
    );
  });

  it("sends a thinking LEVEL for Gemini 3 and a budget for 2.5", async () => {
    const captured = answerWith(() => jsonResponse(200, GOOGLE_OK));
    await callModel("google", "gemini-3-pro", "s", "u", 500, providerConfig("google"), {
      thinking_level: "high",
      thinking_budget: -1,
    });
    const generationConfig = (captured[0] as Captured).body["generationConfig"] as Record<
      string,
      unknown
    >;
    assert.deepEqual(generationConfig["thinkingConfig"], { thinkingLevel: "HIGH" });
  });

  it("fails on a 200 that carries no candidate, rather than inventing one", async () => {
    // A safety block answers 200 with no candidate. Coercing the absence
    // would put the literal word "undefined" through every escalation
    // trigger as if it were an answer.
    answerWith(() => jsonResponse(200, { usageMetadata: {} }));
    await assert.rejects(
      () => callModel("google", "g-pro", "s", "u", 500, providerConfig("google")),
      /no candidate/,
    );
  });

  it("maps MAX_TOKENS onto the stop reason the escalation triggers read", async () => {
    const payload = structuredClone(GOOGLE_OK);
    payload.candidates[0]!.finishReason = "MAX_TOKENS";
    answerWith(() => jsonResponse(200, payload));
    const result = await callModel(
      "google",
      "g-pro",
      "s",
      "u",
      500,
      providerConfig("google"),
    );
    assert.equal(result.stop_reason, "max_tokens");
  });

  it("builds a Responses-API request for OpenAI and reads its result", async () => {
    const captured = answerWith(() => jsonResponse(200, OPENAI_OK));
    const result = await callModel(
      "openai",
      "o-gpt",
      "sys",
      "user",
      800,
      providerConfig("openai"),
      { reasoning_effort: "high" },
    );
    const request = captured[0] as Captured;
    assert.equal(request.body["instructions"], "sys");
    assert.deepEqual(request.body["reasoning"], { effort: "high" });
    assert.equal(request.body["max_output_tokens"], 800);
    assert.equal(request.headers.get("authorization"), "Bearer test-key");
    assert.equal(result.content, "hi from gpt");
    assert.equal(result.served_model_id, "o-gpt-2026-03-17");
  });

  it("walks the output blocks when there is no output_text", async () => {
    answerWith(() =>
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
    const result = await callModel("openai", "o-gpt", "s", "u", 100, providerConfig("openai"));
    assert.equal(result.content, "part1 part2");
    // Absent, not empty: "the provider did not say" is a different fact from
    // "it served something unnamed", and the metrics keep them apart.
    assert.equal(result.served_model_id, null);
  });

  it("maps an incomplete status onto max_tokens", async () => {
    answerWith(() =>
      jsonResponse(200, {
        ...OPENAI_OK,
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
      }),
    );
    const result = await callModel("openai", "o-gpt", "s", "u", 100, providerConfig("openai"));
    assert.equal(result.stop_reason, "max_tokens");
  });

  it("announces a served model that is not the one asked for, and returns it", async () => {
    // OpenAI has resolved a bare id to a differently-priced variant with
    // nothing else able to see it, so the note is the only warning there is.
    answerWith(() => jsonResponse(200, ANTHROPIC_OK));
    const written: string[] = [];
    const realWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: unknown): boolean => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      const result = await callModel(
        "anthropic",
        "a-sonnet",
        "s",
        "u",
        100,
        providerConfig("anthropic"),
      );
      assert.equal(result.content, "hello");
    } finally {
      process.stderr.write = realWrite;
    }
    assert.match(written.join(""), /but anthropic served 'a-sonnet-2026-01-01'/);
  });

  it("treats a provider with no caller as a programmer error", async () => {
    await assert.rejects(
      () => callModel("mystery", "m", "s", "u", 10, providerConfig("openai")),
      /'mystery'/,
    );
  });
});
