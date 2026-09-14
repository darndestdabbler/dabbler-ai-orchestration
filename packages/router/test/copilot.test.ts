// The Copilot seat: one turn through the CLI, the catalog it dispatches
// against, and the refresh that keeps that catalog honest.
//
// The spawner is the one seam, and it is filled with a real in-process
// stream rather than a stub -- so the line pump, the queue, the three
// deadlines and the parser that ship are the ones under test. Nothing here
// spawns a process, reaches a network or replaces a module.
import assert from "node:assert/strict";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, it } from "node:test";

import { type StandIn } from "../src/acp.ts";
import { isOk, type APIResult } from "../src/transports/base.ts";
import {
  CopilotCliTransport,
  HANDOFF_THRESHOLD_UTF16_UNITS,
  PREMIUM_SOURCE_IN_BAND,
  PREMIUM_SOURCE_USAGE_FILE,
  PROVIDER_SOURCE_HEURISTIC,
  SEAT_ENUMERATION_SOURCE,
  enumerateSeatModels,
  readVendorUsage,
  renderedUtf16Units,
  resolveRoleCandidates,
  validateTransportTimeouts,
  type ProcessHandle,
} from "../src/transports/copilot.ts";
import { type CatalogModel } from "../src/catalog.ts";
import { tempDir } from "./support/answers.ts";


// --- The fake seat -----------------------------------------------------------

/**
 * A process the state machine can read to EOF. `Readable.from` gives real
 * stream events, so the line pump, the queue and the deadlines are the ones
 * that ship rather than a stub of them.
 */
function fakeProcess(
  options: { stdout?: string; stderr?: string; exitCode?: number } = {},
): ProcessHandle & { killed: boolean } {
  const handle = {
    stdout: Readable.from([options.stdout ?? ""]),
    stderr: Readable.from([options.stderr ?? ""]),
    killed: false,
    kill(): void {
      handle.killed = true;
    },
    wait: (): Promise<number> => Promise.resolve(options.exitCode ?? 0),
  };
  return handle;
}

/** A stdout that never ends, so a deadline is what resolves the call. */
function blockingProcess(lines: readonly string[] = []): ProcessHandle & { killed: boolean } {
  const stream = new Readable({
    read() {
      /* nothing more is ever pushed */
    },
  });
  for (const line of lines) stream.push(line);
  const handle = {
    stdout: stream as NodeJS.ReadableStream,
    stderr: Readable.from([""]) as NodeJS.ReadableStream,
    killed: false,
    kill(): void {
      handle.killed = true;
      stream.push(null);
    },
    wait: (): Promise<number> => Promise.resolve(0),
  };
  return handle;
}

interface RecordingSpawner {
  (argv: readonly string[], env: Record<string, string> | null): ProcessHandle;
  argv: string[];
  env: Record<string, string> | null;
}

function spawnerFor(process: ProcessHandle | null): RecordingSpawner {
  const spawner = ((argv: readonly string[], env: Record<string, string> | null) => {
    spawner.argv = [...argv];
    spawner.env = env;
    return process!;
  }) as RecordingSpawner;
  spawner.argv = [];
  spawner.env = null;
  return spawner;
}

function eventLines(...events: ReadonlyArray<Record<string, unknown>>): string {
  return events.map((event) => JSON.stringify(event) + "\n").join("");
}

const OK_STDOUT = eventLines(
  {
    type: "assistant.message",
    data: { content: "hello from seat", model: "claude-sonnet-4.6", outputTokens: 42 },
  },
  { type: "result", sessionId: "conv-123", usage: { premiumRequests: 1 } },
);

function dispatch(
  transport: CopilotCliTransport,
  overrides: { model_id?: string; system_prompt?: string; user_message?: string } = {},
): Promise<APIResult> {
  return transport.dispatch({
    model_id: overrides.model_id ?? "m",
    system_prompt: overrides.system_prompt ?? "",
    user_message: overrides.user_message ?? "u",
  });
}

// --- Dispatch ----------------------------------------------------------------

describe("dispatching one turn through the seat", () => {
  it("parses the content, the tokens and the conversation id", async () => {
    const result = await dispatch(
      new CopilotCliTransport({ spawner: spawnerFor(fakeProcess({ stdout: OK_STDOUT })) }),
      { model_id: "claude-sonnet-4.6", system_prompt: "sys", user_message: "user" },
    );
    assert.equal(isOk(result), true);
    assert.equal(result.content, "hello from seat");
    assert.equal(result.output_tokens, 42);
    assert.equal(result.input_tokens, 0); // never reported by the CLI
    assert.equal(result.served_model_id, "claude-sonnet-4.6");
    assert.equal(result.metadata["session_id"], "conv-123");
    assert.equal(result.metadata["premium_requests"], 1);
  });

  it("asks the seat for its own usage number, and says which number it used", async () => {
    // The transport inferred a call's premium cost from a probe sample in
    // the catalog lockfile -- an estimate standing in for a number the
    // vendor will state on request. An estimate presented as a measurement
    // is what made 364 premium requests invisible until the bill.
    const spawner = spawnerFor(fakeProcess({ stdout: OK_STDOUT }));
    const asked = await dispatch(new CopilotCliTransport({ spawner }));
    const flagAt = spawner.argv.indexOf("--usage-output-file");
    assert.ok(flagAt >= 0, "the seat is asked for its usage file");
    assert.ok(spawner.argv[flagAt + 1]?.endsWith(".json"));
    // Nothing wrote the file here, so the in-band figure stands and the
    // record says so rather than implying the vendor confirmed it.
    assert.equal(asked.metadata["premium_requests"], 1);
    assert.equal(asked.metadata["premium_requests_source"], PREMIUM_SOURCE_IN_BAND);

    // A CLI that DOES write the file is believed over the in-band figure,
    // which is the whole point: the result event said 1 and the vendor says
    // 14, and 14 is what the seat will bill.
    const writing = (argv: readonly string[]): ProcessHandle => {
      writeFileSync(
        String(argv[argv.indexOf("--usage-output-file") + 1]),
        JSON.stringify({ premiumRequests: 14 }),
        "utf8",
      );
      return fakeProcess({ stdout: OK_STDOUT });
    };
    const measured = await dispatch(new CopilotCliTransport({ spawner: writing }));
    assert.equal(measured.metadata["premium_requests"], 14);
    assert.equal(measured.metadata["premium_requests_source"], PREMIUM_SOURCE_USAGE_FILE);
  });

  it("prefers the file the vendor wrote over the figure carried in-band", async () => {
    const path = join(tempDir(), "usage.json");
    writeFileSync(path, JSON.stringify({ premiumRequests: 14 }), "utf8");
    // The vendor's final word wins, and the file is cleaned up behind it.
    assert.equal(readVendorUsage(path), 14);
    assert.equal(existsSync(path), false);

    // Every way there is no vendor number reads the same, because the
    // caller does the same thing in all of them.
    assert.equal(readVendorUsage(null), null);
    assert.equal(readVendorUsage(join(tempDir(), "never-written.json")), null);
    const notJson = join(tempDir(), "broken.json");
    writeFileSync(notJson, "{ not json", "utf8");
    assert.equal(readVendorUsage(notJson), null);
    const noCount = join(tempDir(), "empty.json");
    writeFileSync(noCount, JSON.stringify({ somethingElse: 1 }), "utf8");
    assert.equal(readVendorUsage(noCount), null);
    // A shape that is not a finite number is not a count.
    const nonsense = join(tempDir(), "nonsense.json");
    writeFileSync(nonsense, JSON.stringify({ premiumRequests: "fourteen" }), "utf8");
    assert.equal(readVendorUsage(nonsense), null);
  });

  it("carries the read-only grant, the auto-update pin and one joined prompt", async () => {
    // The CLI has one prompt flag, so the system and user text are joined;
    // the workspace's custom instructions are disabled because a routed call
    // is not an orchestrator session -- the CLI would otherwise load
    // AGENTS.md into the system prompt and tell a routed verifier it is
    // running the session it was asked to judge.
    const spawner = spawnerFor(fakeProcess({ stdout: OK_STDOUT }));
    await dispatch(new CopilotCliTransport({ spawner }), {
      system_prompt: "SYS",
      user_message: "USER",
    });
    assert.equal(spawner.argv[spawner.argv.indexOf("--available-tools") + 1], "view,grep,glob");
    assert.ok(spawner.argv.includes("--no-auto-update"));
    assert.ok(spawner.argv.includes("--allow-all-tools"));
    assert.ok(spawner.argv.includes("--no-custom-instructions"));
    assert.equal(spawner.argv[spawner.argv.indexOf("-p") + 1], "SYS\n\nUSER");
    assert.deepEqual(spawner.env, { COPILOT_AUTO_UPDATE: "false" });
  });

  it("reports the tools the CLI ran, paired from its own events", async () => {
    const stdout = eventLines(
      {
        type: "tool.execution_start",
        data: { toolCallId: "t1", toolName: "view", arguments: { path: "a.py" } },
      },
      {
        type: "tool.execution_complete",
        data: {
          toolCallId: "t1",
          success: true,
          result: { content: "shown", detailedContent: "@@ -1,1 +1,1 @@\n shown" },
        },
      },
      { type: "assistant.message", data: { content: "done", outputTokens: 1 } },
      { type: "result", sessionId: "s", usage: {} },
    );
    const result = await dispatch(
      new CopilotCliTransport({ spawner: spawnerFor(fakeProcess({ stdout })) }),
    );
    // Both halves travel: the text the model saw, and the CLI's own diff of
    // the file, which is the only line-numbered framing a fidelity
    // comparison can use.
    assert.deepEqual(result.metadata["tool_calls"], [
      {
        tool: "view",
        arguments: { path: "a.py" },
        success: true,
        result: { content: "shown", detailedContent: "@@ -1,1 +1,1 @@\n shown" },
      },
    ]);
  });

  for (const [label, stdout] of [
    ["the data key is absent entirely", eventLines({ type: "assistant.message", content: "flat" })],
    ["content is the wrong type", eventLines({ type: "assistant.message", data: { content: 0 } })],
    [
      "outputTokens is a numeric string",
      eventLines({ type: "assistant.message", data: { content: "x", outputTokens: "7" } }),
    ],
    ["there is no assistant.message at all", eventLines({ type: "result", sessionId: "s" })],
    ["a line of no readable type poisons the response", OK_STDOUT + "not json\n"],
    [
      "a corrupt line is of an event it reads",
      '{"type":"tool.execution_complete","data":{"result":"f\\"******" was shown"}}\n' + OK_STDOUT,
    ],
    [
      "content is null rather than absent",
      eventLines({ type: "assistant.message", data: { content: null } }),
    ],
  ] as const) {
    it(`fails closed when ${label}`, async () => {
      const result = await dispatch(
        new CopilotCliTransport({ spawner: spawnerFor(fakeProcess({ stdout })) }),
      );
      assert.equal(isOk(result), false);
      assert.equal(result.metadata["error_class"], "generic-unknown");
      assert.equal(result.content, "");
    });
  }

  it("tolerates a corrupt line of an event it never reads", async () => {
    // The CLI scrubs credential-shaped text after serialising the event, and
    // the rewrite can eat the backslash escaping the next quote. The prompt
    // echo below is what a prompt quoting a bearer header comes back as --
    // the bare quote after the asterisks ends the string early; the answer
    // lines are intact, and the answer is what the caller gets.
    const echo = '{"type":"user.message","data":{"content":"f\\"******" can arrive"}}\n';
    const result = await dispatch(
      new CopilotCliTransport({ spawner: spawnerFor(fakeProcess({ stdout: echo + OK_STDOUT })) }),
    );
    assert.equal(isOk(result), true);
    assert.equal(result.content, "hello from seat");
    assert.equal(result.metadata["unread_lines_corrupt"], 1);
  });

  for (const [stderr, expected] of [
    ["The model from --model flag is not available", "invalid-model"],
    ["Error: not logged in (401)", "auth-class"],
    ["429 too many requests", "quota-rate-class"],
    ["something inscrutable", "generic-unknown"],
  ] as const) {
    it(`classifies '${expected}' from a non-zero exit's stderr`, async () => {
      const result = await dispatch(
        new CopilotCliTransport({
          spawner: spawnerFor(fakeProcess({ stderr: stderr + "\n", exitCode: 1 })),
          versionProbe: () => "v1.0.69",
        }),
      );
      assert.equal(isOk(result), false);
      assert.equal(result.metadata["error_class"], expected);
      assert.equal(result.metadata["retryable"], false);
    });
  }

  it("re-probes the CLI version on an auth-class failure only", async () => {
    // The cheap, unbilled question an auth failure raises: is the whole CLI
    // down, or did this one call fail?
    const auth = await dispatch(
      new CopilotCliTransport({
        spawner: spawnerFor(fakeProcess({ stderr: "unauthorized\n", exitCode: 1 })),
        versionProbe: () => "GitHub Copilot CLI 1.0.69.",
      }),
    );
    assert.equal(auth.metadata["reprobe_cli_version"], "GitHub Copilot CLI 1.0.69.");
    const quota = await dispatch(
      new CopilotCliTransport({
        spawner: spawnerFor(fakeProcess({ stderr: "429\n", exitCode: 1 })),
        versionProbe: () => "should not be asked",
      }),
    );
    assert.equal(quota.metadata["reprobe_cli_version"], null);
  });

  it("classifies a spawn that never returns as a spawn timeout", async () => {
    const result = await dispatch(
      new CopilotCliTransport({
        spawner: () =>
          new Promise<ProcessHandle>(() => {
            /* never settles */
          }),
        timeouts: { spawn_seconds: 0.05, first_byte_seconds: 0.1, total_seconds: 0.2 },
      }),
    );
    assert.equal(result.metadata["error_class"], "spawn-timeout");
  });

  it("kills the child when no first byte arrives", async () => {
    const child = blockingProcess();
    const result = await dispatch(
      new CopilotCliTransport({
        spawner: spawnerFor(child),
        timeouts: { spawn_seconds: 1.0, first_byte_seconds: 0.05, total_seconds: 5.0 },
      }),
    );
    assert.equal(result.metadata["error_class"], "first-byte-timeout");
    assert.equal(child.killed, true);
  });

  it("discards partial output at the total timeout rather than parsing it", async () => {
    const child = blockingProcess(['{"type":"other"}\n']);
    const result = await dispatch(
      new CopilotCliTransport({
        spawner: spawnerFor(child),
        timeouts: { spawn_seconds: 1.0, first_byte_seconds: 2.0, total_seconds: 0.2 },
      }),
    );
    assert.equal(result.metadata["error_class"], "total-timeout");
    assert.equal(result.metadata["partial_output_discarded"], true);
    assert.equal(child.killed, true);
  });

  it("trips the invocation breaker without spawning", async () => {
    let spawns = 0;
    const transport = new CopilotCliTransport({
      spawner: () => {
        spawns += 1;
        return fakeProcess({ stdout: OK_STDOUT });
      },
      maxInvocations: 2,
    });
    assert.equal(isOk(await dispatch(transport)), true);
    assert.equal(isOk(await dispatch(transport)), true);
    const blocked = await dispatch(transport);
    assert.equal(blocked.metadata["error_class"], "invocation-breaker");
    assert.equal(spawns, 2); // a breaker-blocked call never spawns
    assert.equal(transport.invocationCount, 2);
  });

  it("classifies a spawner failure rather than letting it escape", async () => {
    const result = await dispatch(
      new CopilotCliTransport({
        spawner: () => {
          throw new Error("copilot not found");
        },
      }),
    );
    assert.equal(result.metadata["error_class"], "generic-unknown");
    assert.match(String(result.metadata["stderr_tail"]), /not found/);
  });

  it("gives the OS's size refusal its own error class", async () => {
    // It spent a year wearing the generic-unknown mask, so it is named --
    // and read from the error CODE, never the localized message.
    const tooLong = Object.assign(new Error("command line too long"), {
      code: "ENAMETOOLONG",
    });
    const result = await dispatch(
      new CopilotCliTransport({
        spawner: () => {
          throw tooLong;
        },
      }),
    );
    assert.equal(result.metadata["error_class"], "argv-too-large");
    assert.equal(result.metadata["retryable"], false);
  });
});

// --- Timeout validation ------------------------------------------------------

describe("the timeout contract config validates at load", () => {
  it("accepts an ordered trio", () => {
    assert.doesNotThrow(() =>
      validateTransportTimeouts({
        spawn_seconds: 5,
        first_byte_seconds: 20,
        total_seconds: 600,
      }),
    );
  });

  it("rejects an unknown key rather than silently keeping the default", () => {
    assert.throws(() => validateTransportTimeouts({ total_second: 300 }), /total_second/);
  });

  it("rejects a boolean, which Python would read as one second", () => {
    assert.throws(() => validateTransportTimeouts({ total_seconds: true }), /must be a number/);
  });

  it("rejects an out-of-order trio, where an inner ceiling can never fire", () => {
    assert.throws(
      () => validateTransportTimeouts({ spawn_seconds: 100, first_byte_seconds: 30 }),
      /spawn_seconds </,
    );
  });
});

describe("resolving a role against the seat", () => {
  const CONFIG = {
    roles: {
      generator: {
        prefer: ["claude-x", "gpt-x"],
      },
    },
  };

  /** A catalog entry, as the seat's own free reading records one. */
  function seatEntry(
    id: string,
    provider: string | null,
    overrides: Partial<CatalogModel> = {},
  ): CatalogModel {
    return {
      id,
      provider,
      provider_source: PROVIDER_SOURCE_HEURISTIC,
      display_name: id,
      enabled: true,
      price_category: null,
      cost: null,
      listed_at: "2026-09-11T00:00:00Z",
      ...overrides,
    };
  }

  const SEAT: readonly CatalogModel[] = [
    seatEntry("claude-x", "anthropic"),
    seatEntry("gpt-x", "openai"),
    seatEntry("gemini-x", "google"),
    // The seat lists it and declines to call it enabled; its word is taken
    // as readily when it withholds a model as when it offers one.
    seatEntry("blocked-x", "openai", { enabled: false }),
  ];

  it("orders by the role's preference list and never offers what the seat withheld", () => {
    const candidates = resolveRoleCandidates(CONFIG, SEAT, "generator");
    assert.deepEqual(candidates[0], ["claude-x", "anthropic"]);
    assert.deepEqual(candidates[1], ["gpt-x", "openai"]);
    assert.ok(candidates.every(([id]) => id !== "blocked-x"));
    // An entry the preference list does not name is kept, sorted last.
    assert.deepEqual(candidates[candidates.length - 1], ["gemini-x", "google"]);
  });

  it("offers a model the seat lists without waiting for a turn to be spent on it", () => {
    // A model the seat began serving this morning is selectable this
    // morning. Withholding it until a billed probe restated what the seat
    // already said is what kept an operator's own models out of their own
    // pane -- and that probe no longer exists to wait for.
    assert.deepEqual(
      resolveRoleCandidates(
        CONFIG,
        [seatEntry("claude-x", "anthropic"), seatEntry("gpt-x", "openai")],
        "generator",
      ),
      [
        ["claude-x", "anthropic"],
        ["gpt-x", "openai"],
      ],
    );
  });

  it("keeps the provider-trust boundary over an entry that names no provider", () => {
    // An entry whose provider the name heuristic could not place is
    // unplaceable, and a role that drew on it could not honour a
    // cross-provider exclusion.
    assert.deepEqual(
      resolveRoleCandidates(
        CONFIG,
        [seatEntry("grok-x", null), seatEntry("gpt-x", "openai")],
        "generator",
      ),
      [["gpt-x", "openai"]],
    );
  });

  it("leaves the rest of the catalog after an exclusion", () => {
    assert.deepEqual(
      resolveRoleCandidates(CONFIG, SEAT, "generator", ["anthropic", "openai"]),
      [["gemini-x", "google"]],
    );
    assert.deepEqual(
      resolveRoleCandidates(CONFIG, SEAT, "generator", ["anthropic", "openai", "google"]),
      [],
    );
  });

  it("applies the caller's provider exclusion", () => {
    // The role carries no provider set any more: the catalog already says
    // what this machine reaches, and a filter listing the three vendors was
    // a second inventory beside it. What remains is the CALLER's exclusion,
    // which is a fact about this call rather than about the role.
    const config = { roles: { generator: { prefer: ["claude-x", "gpt-x"] } } };
    assert.deepEqual(
      resolveRoleCandidates(config, SEAT, "generator", ["anthropic", "google"]),
      [["gpt-x", "openai"]],
    );
  });
});

// --- The large-prompt handoff ------------------------------------------------

const BIG_PROMPT = "x".repeat(30_000);

/** The handoff payload path the bootstrap points the model at. */
function payloadPathFrom(argv: readonly string[]): string {
  const bootstrap = argv[argv.indexOf("-p") + 1]!;
  for (const line of bootstrap.split("\n")) {
    if (line.endsWith(".txt")) return line.trim();
  }
  throw new Error(`no payload path in bootstrap: ${bootstrap}`);
}

function nonceOf(payloadText: string): string {
  const lines = payloadText.trim().split("\n");
  return lines[lines.length - 2]!.split(" ").pop()!;
}

function ackStdout(nonce: string, body = "answer body"): string {
  return eventLines(
    {
      type: "assistant.message",
      data: { content: `${body}\n\nHANDOFF-ACK ${nonce}`, model: "m", outputTokens: 7 },
    },
    { type: "result", sessionId: "s1", usage: { premiumRequests: 1 } },
  );
}

/**
 * Reads the payload at spawn time -- which is what proves the write handle
 * was closed -- then answers with whatever the test asked for.
 */
class HandoffSpawner {
  argv: string[] = [];
  payloadText = "";
  payloadPath = "";

  // Declared and assigned, not a constructor parameter property: Node runs
  // these sources by stripping types, and a parameter property is syntax it
  // would have to compile rather than erase.
  private readonly options: { respond?: (nonce: string) => string; mutatePayload?: boolean };

  constructor(options: { respond?: (nonce: string) => string; mutatePayload?: boolean } = {}) {
    this.options = options;
  }

  readonly spawn = (argv: readonly string[]): ProcessHandle => {
    this.argv = [...argv];
    this.payloadPath = payloadPathFrom(argv);
    this.payloadText = readFileSync(this.payloadPath, "utf8");
    if (this.options.mutatePayload) writeFileSync(this.payloadPath, "clobbered", "utf8");
    const respond = this.options.respond ?? ackStdout;
    return fakeProcess({ stdout: respond(nonceOf(this.payloadText)) });
  };
}

function dispatchBig(spawner: HandoffSpawner): Promise<APIResult> {
  return new CopilotCliTransport({ spawner: spawner.spawn }).dispatch({
    model_id: "m",
    system_prompt: "sys",
    user_message: BIG_PROMPT,
  });
}

// A stand-in seat that speaks ACP: it answers `initialize`, `session/new`
// (with the model list the real seat carries), and `session/close`. A
// `session/prompt` would be a billed turn, so it writes its arrival to
// FAKE_PROMPTED and the test fails on the file existing. With FAKE_NO_MODELS
// the reply carries an id and nothing else, which is the seat this framework
// must call unknown rather than empty.
const FAKE_SEAT = `
const fs = require("node:fs");
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
const model = (id, name, usage) => usage === null
  ? { modelId: id, name }
  : { modelId: id, name, _meta: { copilotUsage: usage, copilotEnablement: "enabled", copilotPriceCategory: "low" } };
let buf = "";
process.stdin.on("data", (chunk) => {
  buf += chunk.toString("utf8");
  let i;
  while ((i = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.method === "initialize") {
      out({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: 1, agentCapabilities: {}, agentInfo: { name: "fake-seat", version: "0" } } });
    } else if (m.method === "session/new") {
      const result = { sessionId: "conv-list" };
      if (!process.env.FAKE_NO_MODELS) {
        result.models = {
          currentModelId: "gpt-5.6-sol",
          availableModels: [
            model("auto", "Auto", null),
            model("gpt-5.6-sol", "GPT-5.6 Sol", "1x"),
            model("claude-haiku-4.5", "Claude Haiku 4.5", "0.33x"),
          ],
        };
        result.modes = { currentModeId: "x#agent", availableModes: [{ id: "x#agent" }, { id: "x#plan" }] };
        result.configOptions = [
          { type: "select", id: "model", currentValue: "gpt-5.6-sol" },
          { type: "select", id: "reasoning_effort", currentValue: "medium", options: [{ value: "low" }, { value: "high" }] },
        ];
      }
      out({ jsonrpc: "2.0", id: m.id, result });
    } else if (m.method === "session/prompt") {
      fs.writeFileSync(process.env.FAKE_PROMPTED, JSON.stringify(m.params));
      out({ jsonrpc: "2.0", id: m.id, result: { stopReason: "end_turn" } });
    } else if (m.method === "session/close") {
      out({ jsonrpc: "2.0", id: m.id, result: {} });
    } else if (m.id !== undefined) {
      out({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "no" } });
    }
  }
});
process.stdin.on("end", () => process.exit(0));
`;

/** The stand-in, and the path it would write if a prompt were ever sent. */
function fakeSeat(noModels = false): { standIn: StandIn; prompted: string } {
  const dir = tempDir("seat-acp-");
  const script = join(dir, "seat.cjs");
  writeFileSync(script, FAKE_SEAT, "utf8");
  const prompted = join(dir, "prompted.json");
  process.env["FAKE_PROMPTED"] = prompted;
  if (noModels) process.env["FAKE_NO_MODELS"] = "1";
  else delete process.env["FAKE_NO_MODELS"];
  return { standIn: { program: process.execPath, leadingArgs: [script] }, prompted };
}

describe("the seat's own model list", () => {
  it("comes from the session/new reply, and sends no prompt to get it", async () => {
    const seat = fakeSeat();
    const enumeration = await enumerateSeatModels({ standIn: seat.standIn });

    assert.equal(enumeration.known, true);
    assert.equal(enumeration.source, SEAT_ENUMERATION_SOURCE);
    assert.deepEqual(
      enumeration.models.map((entry) => [entry.id, entry.provider, entry.usage]),
      [
        // The seat's router alias carries no cost and no provider: named
        // because the seat names it, and a guess about it would be a guess
        // about which model answers.
        ["auto", "", null],
        ["gpt-5.6-sol", "openai", "1x"],
        ["claude-haiku-4.5", "anthropic", "0.33x"],
      ],
    );
    assert.equal(enumeration.models[1]?.provider_source, PROVIDER_SOURCE_HEURISTIC);
    assert.equal(enumeration.current_model_id, "gpt-5.6-sol");
    assert.deepEqual(enumeration.modes, ["agent", "plan"]);
    assert.deepEqual(enumeration.reasoning_efforts, ["low", "high"]);
    // The assertion this session exists to keep: enumerating is free, and it
    // is free because no turn is ever taken.
    assert.equal(existsSync(seat.prompted), false);
  });

  it("calls a seat that lists nothing unknown, not empty", async () => {
    const seat = fakeSeat(true);
    const enumeration = await enumerateSeatModels({ standIn: seat.standIn });

    assert.equal(enumeration.known, false);
    assert.deepEqual(enumeration.models, []);
    assert.match(String(enumeration.reason), /availableModels/);
    assert.equal(existsSync(seat.prompted), false);
  });
});

describe("measuring the rendered command line", () => {
  for (const [argv, expected] of [
    [["a"], 2], // "a" plus the terminating NUL
    [["a b"], 6], // quoting adds two characters
    [["a\\b"], 4], // a lone backslash is not escaped
    [["\u{1F600}"], 3], // one astral character is two UTF-16 units
  ] as const) {
    it(`counts ${JSON.stringify(argv)} as ${expected} UTF-16 units`, () => {
      assert.equal(renderedUtf16Units(argv), expected);
    });
  }
});

describe("choosing between the inline argv and the pull", () => {
  it("stays inline below the threshold", async () => {
    const spawner = spawnerFor(fakeProcess({ stdout: OK_STDOUT }));
    const result = await dispatch(new CopilotCliTransport({ spawner }), {
      system_prompt: "sys",
      user_message: "small",
    });
    assert.equal(spawner.argv[spawner.argv.indexOf("-p") + 1], "sys\n\nsmall");
    assert.equal(result.metadata["handoff"], false);
    assert.ok(!Object.hasOwn(result.metadata, "payload_bytes"));
  });

  it("takes the pull exactly at the threshold, and not one unit below", async () => {
    const transport = new CopilotCliTransport({ spawner: spawnerFor(null) });
    // Overhead measured against a one-character prompt, so an empty string's
    // own quoting does not skew the arithmetic -- and WITH a usage path on
    // it, because `dispatch` measures the command line it will really
    // spawn. The flag is fixed-width for a given machine, so this is the
    // same overhead every dispatch carries; leaving it out would test a
    // command line shorter than the one that reaches the CLI, which is the
    // whole failure the 32k argv ceiling exists to prevent.
    const usagePath = transport.usageFilePath();
    const overhead = renderedUtf16Units(transport.buildArgv("z", "m", usagePath)) - 1;
    const exact = "z".repeat(HANDOFF_THRESHOLD_UTF16_UNITS - overhead);
    assert.equal(
      renderedUtf16Units(transport.buildArgv(exact, "m", usagePath)),
      HANDOFF_THRESHOLD_UTF16_UNITS,
    );

    const below = await new CopilotCliTransport({
      spawner: spawnerFor(fakeProcess({ stdout: OK_STDOUT })),
    }).dispatch({ model_id: "m", system_prompt: "", user_message: exact.slice(0, -1) });
    assert.equal(below.metadata["handoff"], false);

    const at = new HandoffSpawner();
    const result = await new CopilotCliTransport({ spawner: at.spawn }).dispatch({
      model_id: "m",
      system_prompt: "",
      user_message: exact,
    });
    assert.equal(result.metadata["handoff"], true);
  });

  it("names a POSIX path in the bootstrap and keeps the nonce out of argv", async () => {
    const spawner = new HandoffSpawner();
    await dispatchBig(spawner);
    const bootstrap = spawner.argv[spawner.argv.indexOf("-p") + 1]!;
    assert.ok(!payloadPathFrom(spawner.argv).includes("\\"));
    assert.ok(!bootstrap.includes(BIG_PROMPT));
    assert.ok(!spawner.argv.join(" ").includes(nonceOf(spawner.payloadText)));
  });

  it("puts the exact prompt plus the footer in the payload", async () => {
    const spawner = new HandoffSpawner();
    await dispatchBig(spawner);
    assert.ok(spawner.payloadText.startsWith(`sys\n\n${BIG_PROMPT}`));
    assert.match(spawner.payloadText, /HANDOFF-ACK /);
  });

  it("builds an otherwise identical argv on both branches", async () => {
    const inline = spawnerFor(fakeProcess({ stdout: OK_STDOUT }));
    await dispatch(new CopilotCliTransport({ spawner: inline }), {
      system_prompt: "sys",
      user_message: "small",
    });
    const pull = new HandoffSpawner();
    await dispatchBig(pull);
    // The two per-dispatch values are dropped: what `-p` carries, and the
    // usage file, which is a fresh temp path every call and must be --
    // two dispatches sharing one would race to overwrite each other's
    // numbers. Everything else has to match, which is the invariant.
    const withoutPerCall = (argv: readonly string[]): string[] => {
      let out = [...argv];
      for (const flag of ["-p", "--usage-output-file"]) {
        const index = out.indexOf(flag);
        if (index >= 0) out = [...out.slice(0, index), ...out.slice(index + 2)];
      }
      return out;
    };
    assert.deepEqual(withoutPerCall(pull.argv), withoutPerCall(inline.argv));
    // And both branches really did ask for one.
    assert.ok(pull.argv.includes("--usage-output-file"));
    assert.ok(inline.argv.includes("--usage-output-file"));
  });
});

describe("the handoff acknowledgement", () => {
  it("strips a valid ack from the content it returns", async () => {
    const spawner = new HandoffSpawner();
    const result = await dispatchBig(spawner);
    assert.equal(isOk(result), true);
    assert.equal(result.content, "answer body");
    assert.equal(result.metadata["handoff_ack"], "validated");
    assert.equal(
      result.metadata["payload_bytes"],
      Buffer.byteLength(spawner.payloadText, "utf8"),
    );
  });

  it("discards the content when the ack is missing", async () => {
    // A truncated review whose handoff acknowledgement still validated would
    // return a clean-looking verdict over half a diff.
    const result = await dispatchBig(
      new HandoffSpawner({
        respond: () =>
          eventLines(
            { type: "assistant.message", data: { content: "answer with no ack", model: "m" } },
            { type: "result", sessionId: "s1", usage: {} },
          ),
      }),
    );
    assert.equal(isOk(result), false);
    assert.equal(result.metadata["error_class"], "handoff-incomplete");
    assert.equal(result.metadata["handoff_ack"], "missing");
    assert.equal(result.content, "");
  });

  it("tells a mismatched ack from a missing one", async () => {
    const result = await dispatchBig(
      new HandoffSpawner({ respond: () => ackStdout("deadbeef".repeat(4)) }),
    );
    assert.equal(result.metadata["error_class"], "handoff-incomplete");
    assert.equal(result.metadata["handoff_ack"], "mismatch");
  });

  it("records a payload mutation rather than gating on it", async () => {
    const result = await dispatchBig(new HandoffSpawner({ mutatePayload: true }));
    assert.equal(isOk(result), true);
    assert.equal(result.metadata["payload_file_modified"], true);
  });
});

describe("the payload file's lifetime", () => {
  it("is deleted after a successful call and after a malformed answer", async () => {
    const good = new HandoffSpawner();
    await dispatchBig(good);
    assert.equal(existsSync(good.payloadPath), false);

    const bad = new HandoffSpawner({ respond: () => "not json\n" });
    const result = await dispatchBig(bad);
    assert.equal(result.metadata["error_class"], "generic-unknown");
    assert.equal(result.metadata["handoff"], true);
    assert.equal(existsSync(bad.payloadPath), false);
  });

  it("is retained only under the explicit diagnostics toggle", async () => {
    const previous = process.env["DABBLER_COPILOT_DIAGNOSTICS"];
    process.env["DABBLER_COPILOT_DIAGNOSTICS"] = "1";
    const spawner = new HandoffSpawner();
    try {
      await dispatchBig(spawner);
      assert.equal(existsSync(spawner.payloadPath), true);
    } finally {
      if (previous === undefined) delete process.env["DABBLER_COPILOT_DIAGNOSTICS"];
      else process.env["DABBLER_COPILOT_DIAGNOSTICS"] = previous;
      // The toggle's whole point is that the transport does not delete it, so
      // the test that proved that has to.
      if (existsSync(spawner.payloadPath)) unlinkSync(spawner.payloadPath);
    }
  });
});
