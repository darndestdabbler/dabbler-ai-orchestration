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

import {
  PROVENANCE_HAND_EDITED,
  PROVENANCE_MACHINE_WRITTEN,
  PROVENANCE_UNSTAMPED,
} from "../src/lockfile.ts";
import { ASSET_DIR } from "../src/paths.ts";
import { isOk, type APIResult } from "../src/transports/base.ts";
import {
  CopilotCliTransport,
  ERROR_CLASS_INVALID_MODEL,
  HANDOFF_THRESHOLD_UTF16_UNITS,
  PREMIUM_SOURCE_IN_BAND,
  PREMIUM_SOURCE_USAGE_FILE,
  PROVIDER_SOURCE_HEURISTIC,
  REFRESH_COMMAND,
  readVendorUsage,
  SCOPE_ALL,
  SCOPE_MODELS,
  SCOPE_QUORUM,
  SCOPE_STALE,
  catalogMeta,
  catalogProvenance,
  confirmedModels,
  discoverModels,
  dumpsCatalog,
  formatPlan,
  knownPremiumRequests,
  loadCatalog,
  mergeCatalog,
  modelEntry,
  needsConfirmation,
  planModelIds,
  planRefresh,
  providerOf,
  renderedUtf16Units,
  resolveRoleCandidates,
  runRefresh,
  unknownCostIds,
  validateCatalog,
  validateTransportTimeouts,
  writeCatalog,
  type Catalog,
  type ModelEntry,
  type ProcessHandle,
  type RefreshPlan,
} from "../src/transports/copilot.ts";
import { tempDir } from "./support/answers.ts";

const V1_LOCK = join(import.meta.dirname, "fixtures", "seat-catalog.lock");

// The operator's live seat record, which a real refresh rewrites. Only the
// contracts that must hold for ANY lockfile are asserted against it; a test
// that pinned its values would fail on the next honest refresh, and a test
// that fails when the record is updated is pressure to edit the record.
const SHIPPED_LOCK = join(ASSET_DIR, "copilot-catalog.lock");

/**
 * The file as Python's `read_text` yields it.
 *
 * These locks are committed and this checkout has `core.autocrlf` on, so they
 * are CRLF on disk while the writer emits LF on every platform -- deliberately,
 * because the content digest covers the bytes and a CRLF rewrite would convict
 * a clean file.
 */
function readAsPython(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

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
          result: { content: "shown", detailedContent: "dropped" },
        },
      },
      { type: "assistant.message", data: { content: "done", outputTokens: 1 } },
      { type: "result", sessionId: "s", usage: {} },
    );
    const result = await dispatch(
      new CopilotCliTransport({ spawner: spawnerFor(fakeProcess({ stdout })) }),
    );
    assert.deepEqual(result.metadata["tool_calls"], [
      { tool: "view", arguments: { path: "a.py" }, success: true, result: { content: "shown" } },
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

// --- The catalog -------------------------------------------------------------

function catalog(
  entries: readonly ModelEntry[],
  options: { seat?: string; version?: string; pin?: boolean } = {},
): Catalog {
  return {
    meta: catalogMeta({
      cli_version: options.version ?? "v1",
      cli_version_pin_required: options.pin ?? false,
      seat_id: options.seat ?? "test-seat",
    }),
    models: [...entries],
  };
}

function entry(id: string, provider: string, enablement = "confirmed"): ModelEntry {
  return modelEntry({ id, provider, enablement });
}

const DIVERSE = [entry("a", "anthropic"), entry("b", "openai")];

describe("the seat catalog as a record", () => {
  it("reads a v1 lockfile, legacy probe key and all", () => {
    const loaded = loadCatalog(V1_LOCK);
    assert.equal(confirmedModels(loaded).length, 15);
    const sonnet = loaded.models.find((model) => model.id === "claude-sonnet-4.6")!;
    assert.equal(sonnet.probe_premium_requests, 1); // the legacy key still reads
    assert.equal(loaded.meta.seat_id, "op-personal");
    assert.equal(providerOf(loaded, "gpt-5.5"), "openai");
  });

  it("resolves no provider for an unconfirmed entry", () => {
    assert.equal(providerOf(catalog([entry("m1", "openai", "unconfirmed")]), "m1"), null);
  });

  it("passes a diverse confirmed catalog", () => {
    assert.equal(validateCatalog(catalog(DIVERSE)).ok, true);
  });

  it("fails version drift only when the lockfile pinned strictly", () => {
    const strict = validateCatalog(catalog(DIVERSE, { pin: true }), { liveCliVersion: "v2" });
    assert.equal(strict.ok, false);
    assert.match(String(strict.reasons[0]), /drift/);
  });

  it("warns about drift by default, because the seat CLI auto-updates", () => {
    // Refusing the seat for a routine auto-update stranded working seats and
    // taught people to hand-edit the pin, destroying the signal.
    const result = validateCatalog(catalog(DIVERSE), { liveCliVersion: "v2" });
    assert.equal(result.ok, true);
    assert.deepEqual(result.reasons, []);
    assert.ok(result.warnings.some((warning) => warning.includes("drift")));
  });

  it("says nothing about drift when the versions match", () => {
    const result = validateCatalog(catalog(DIVERSE), { liveCliVersion: "v1" });
    assert.ok(!result.warnings.some((warning) => warning.includes("drift")));
  });

  it("fails a confirmed entry with no trustworthy provider", () => {
    const result = validateCatalog(catalog([entry("a", ""), entry("b", "openai")]));
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((reason) => reason.includes("provenance")));
  });

  it("fails a catalog that could only verify against itself", () => {
    const result = validateCatalog(catalog([entry("a", "openai"), entry("b", "openai")]));
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((reason) => reason.includes("Same-provider-only")));
  });

  it("names the refresh command in every message about a wrong file", () => {
    // The absence of that verb is the incident: an operator told the file is
    // wrong, and handed no command, edits the file.
    const results = [
      validateCatalog(catalog(DIVERSE), { liveCliVersion: "v9" }),
      validateCatalog(catalog([entry("a", ""), entry("b", "openai")])),
      validateCatalog(catalog([entry("a", "openai"), entry("b", "openai")])),
    ];
    for (const result of results) {
      const messages = [...result.reasons, ...result.warnings];
      assert.ok(messages.length > 0);
      assert.ok(messages.every((message) => message.includes(REFRESH_COMMAND)));
    }
  });

  it("declares every id it carries in the shipped lockfile's universe", () => {
    // The CLI cannot enumerate models, so the universe is data in the file
    // rather than a list in code.
    const shipped = loadCatalog(SHIPPED_LOCK);
    assert.deepEqual(
      [...shipped.meta.candidate_universe],
      shipped.models.map((model) => model.id),
    );
  });

  it("refuses a malformed candidate universe at load", () => {
    const path = join(tempDir("catalog-"), "c.lock");
    writeFileSync(
      path,
      '[meta]\ncli_version = "v1"\nseat_id = "s"\ncandidate_universe = [1, 2]\n',
      "utf8",
    );
    assert.throws(() => loadCatalog(path), /candidate_universe/);
  });
});

// --- The writer --------------------------------------------------------------

/** Rendered `[[models]]` blocks keyed by their id line. */
function modelBlocks(text: string): Record<string, string> {
  const blocks: Record<string, string> = {};
  for (const chunk of text.split("\n\n")) {
    if (chunk.startsWith("[[models]]")) blocks[chunk.split("\n")[1]!] = chunk;
  }
  return blocks;
}

describe("writing the seat catalog back", () => {
  it("round-trips the shipped lockfile byte for byte", () => {
    // The contract that makes a partial refresh honest: a catalog nothing
    // touched renders back to the bytes it was read from.
    assert.equal(dumpsCatalog(loadCatalog(SHIPPED_LOCK)), readAsPython(SHIPPED_LOCK));
  });

  it("keeps a key this version does not model", () => {
    const path = join(tempDir("catalog-"), "c.lock");
    writeFileSync(
      path,
      '[meta]\ncli_version = "v1"\nseat_id = "s"\n\n' +
        '[[models]]\nid = "a"\nprovider = "anthropic"\n' +
        'enablement = "confirmed"\nfuture_key = "keep me"\n',
      "utf8",
    );
    assert.match(dumpsCatalog(loadCatalog(path)), /future_key = "keep me"/);
  });

  it("refuses a value it cannot represent instead of mangling it", () => {
    const broken = catalog([
      modelEntry({ id: "a", provider: "anthropic", raw: { probe_detail: { nested: "table" } } }),
    ]);
    assert.throws(() => dumpsCatalog(broken), /cannot represent/);
  });

  it("writes unknown by omission, never as a placeholder zero", () => {
    // TOML has no null, and an absent key already means unknown.
    const text = dumpsCatalog(catalog([entry("a", "anthropic")]));
    assert.ok(!text.includes("echoed_model"));
    assert.ok(!text.includes("probe_premium_requests"));
  });

  it("writes a lockfile its own reader accepts", () => {
    const path = join(tempDir("catalog-"), "seat.lock");
    writeCatalog(path, catalog(DIVERSE));
    assert.equal(validateCatalog(loadCatalog(path)).ok, true);
  });
});

const STAMP = "2026-08-19T00:00:00Z";

describe("the writer stamp", () => {
  function written(entries: readonly ModelEntry[], writtenAt?: string): string {
    const path = join(tempDir("catalog-"), "seat.lock");
    writeCatalog(path, catalog(entries), writtenAt ? { writtenAt } : {});
    return path;
  }

  it("records what wrote the file and when", () => {
    const path = written(DIVERSE, STAMP);
    const meta = loadCatalog(path).meta;
    assert.equal(meta.written_at, STAMP);
    assert.match(String(meta.written_by), /^dabbler\.copilot/);
    assert.equal(catalogProvenance(loadCatalog(path)), PROVENANCE_MACHINE_WRITTEN);
  });

  it("reports an edit after the write as hand-edited, and still loads", () => {
    // The rule this repo holds for `.dabbler/runs/` -- never hand-repaired --
    // made checkable rather than aspirational. Two people hand-edited this
    // file's pin, which is exactly what it must report. Detection, not
    // enforcement: the seat still loads, and says so.
    const path = written(DIVERSE);
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace('cli_version = "v1"', 'cli_version = "v2"'),
      "utf8",
    );
    const loaded = loadCatalog(path);
    assert.equal(catalogProvenance(loaded), PROVENANCE_HAND_EDITED);
    const result = validateCatalog(loaded);
    assert.equal(result.ok, true);
    assert.ok(result.warnings.some((warning) => warning.includes("hand-edited")));
  });

  it("reads a deleted digest as hand-edited, not as unstamped", () => {
    // Removing the line that would convict is itself the edit.
    const path = written([entry("a", "anthropic")]);
    writeFileSync(
      path,
      readFileSync(path, "utf8")
        .split("\n")
        .filter((line) => !line.startsWith("content_digest"))
        .join("\n"),
      "utf8",
    );
    assert.equal(catalogProvenance(loadCatalog(path)), PROVENANCE_HAND_EDITED);
  });

  it("reads a lockfile no writer ever touched as unstamped", () => {
    const loaded = loadCatalog(V1_LOCK);
    assert.equal(catalogProvenance(loaded), PROVENANCE_UNSTAMPED);
    assert.ok(
      validateCatalog(loaded).warnings.some((warning) => warning.includes("no writer stamp")),
    );
  });
});

// --- Probing -----------------------------------------------------------------

function seatSpawner(
  byModel: Record<string, readonly [string, string, number]>,
): (argv: readonly string[]) => ProcessHandle {
  return (argv: readonly string[]) => {
    const [stdout, stderr, exitCode] = byModel[argv[argv.indexOf("--model") + 1]!]!;
    return fakeProcess({ stdout, stderr, exitCode });
  };
}

function probeOk(
  model: string,
  usage: Record<string, unknown> = {},
): readonly [string, string, number] {
  return [
    eventLines(
      { type: "assistant.message", data: { content: "OK", model, outputTokens: 2 } },
      { type: "result", sessionId: "conv-1", usage },
    ),
    "",
    0,
  ];
}

const PROBE_REFUSED: readonly [string, string, number] = [
  "",
  "model from --model flag is not available",
  1,
];

function probe(
  modelIds: readonly string[],
  byModel: Record<string, readonly [string, string, number]>,
  cliVersion?: string,
): Promise<ModelEntry[]> {
  return discoverModels(modelIds, {
    transport: new CopilotCliTransport({ spawner: seatSpawner(byModel) }),
    clock: () => STAMP,
    cliVersion: cliVersion ?? null,
  });
}

describe("probing the seat", () => {
  it("records the provenance a successful probe earned", async () => {
    const [only] = await probe(
      ["claude-sonnet-4.6"],
      { "claude-sonnet-4.6": probeOk("claude-sonnet-4.6", { premiumRequests: 1 }) },
      "GitHub Copilot CLI 1.0.80.",
    );
    assert.equal(only!.enablement, "confirmed");
    assert.equal(only!.confirmed_at, STAMP);
    assert.equal(only!.confirmed_on_cli_version, "GitHub Copilot CLI 1.0.80.");
    assert.equal(only!.echoed_model, "claude-sonnet-4.6");
    assert.equal(only!.probe_premium_requests, 1);
  });

  it("records a failed probe's own error class without confirming it", async () => {
    const [only] = await probe(["ghost-1"], { "ghost-1": PROBE_REFUSED });
    assert.equal(only!.enablement, "unconfirmed");
    assert.equal(only!.last_probe_error, ERROR_CLASS_INVALID_MODEL);
    assert.equal(only!.last_probe_at, STAMP);
    assert.equal(only!.confirmed_at, null);
  });

  it("keeps a fractional sample, which is a measurement and not malformation", async () => {
    // The seat reports 0.33 for sub-premium models. Discarding that files the
    // cheapest models on the seat as the most uncertain, since unknown sorts
    // after every known sample.
    const [only] = await probe(["claude-haiku-4.5"], {
      "claude-haiku-4.5": probeOk("claude-haiku-4.5", { premiumRequests: 0.33 }),
    });
    assert.equal(only!.probe_premium_requests, 0.33);
    const path = join(tempDir("catalog-"), "seat.lock");
    writeCatalog(path, catalog([only!, entry("o", "openai")]));
    assert.equal(loadCatalog(path).models[0]!.probe_premium_requests, 0.33);
  });

  it("reads anything that is not a count as unknown, never as free", async () => {
    for (const wire of ["1", [1], true, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const [only] = await probe(["gpt-5.5"], {
        "gpt-5.5": probeOk("gpt-5.5", { premiumRequests: wire }),
      });
      assert.equal(only!.probe_premium_requests, null, String(wire));
    }
  });

  it("infers a provider by prefix and declares that it guessed", async () => {
    const [guessed] = await probe(["gemini-3.5-flash"], {
      "gemini-3.5-flash": probeOk("gemini-3.5-flash"),
    });
    assert.equal(guessed!.provider, "google");
    assert.equal(guessed!.provider_source, PROVIDER_SOURCE_HEURISTIC);
    const [unknown] = await probe(["mystery-1"], { "mystery-1": probeOk("mystery-1") });
    assert.equal(unknown!.provider, "");
    assert.equal(unknown!.provider_source, "");
  });
});

describe("folding probe results back into the file", () => {
  it("leaves every unprobed entry byte for byte", async () => {
    const merged = dumpsCatalog(
      mergeCatalog(
        loadCatalog(V1_LOCK),
        await probe(
          ["gpt-5.5"],
          { "gpt-5.5": probeOk("gpt-5.5", { premiumRequests: 0 }) },
          "GitHub Copilot CLI 1.0.80.",
        ),
        { cliVersion: "GitHub Copilot CLI 1.0.80.", probedAt: STAMP },
      ),
    );
    const before = modelBlocks(readAsPython(V1_LOCK));
    const after = modelBlocks(merged);
    assert.deepEqual(
      Object.keys(before).filter((key) => before[key] !== after[key]),
      ['id = "gpt-5.5"'],
    );
  });

  it("keeps a prior confirmation when a probe fails", async () => {
    // A transient CLI failure is not a withdrawn model -- the entry goes
    // visibly stale rather than silently unconfirmed.
    const before = catalog([
      modelEntry({
        id: "a",
        provider: "anthropic",
        enablement: "confirmed",
        confirmed_at: "2026-07-04T16:17:00Z",
      }),
    ]);
    const merged = mergeCatalog(before, await probe(["a"], { a: PROBE_REFUSED }));
    assert.equal(merged.models[0]!.enablement, "confirmed");
    assert.equal(merged.models[0]!.confirmed_at, "2026-07-04T16:17:00Z");
    assert.equal(merged.models[0]!.last_probe_error, ERROR_CLASS_INVALID_MODEL);
    assert.equal(merged.models[0]!.last_probe_at, STAMP);
  });

  it("appends an id the catalog did not carry", async () => {
    const merged = mergeCatalog(
      catalog([entry("a", "anthropic")]),
      await probe(["gpt-5.5"], { "gpt-5.5": probeOk("gpt-5.5") }),
    );
    assert.deepEqual(
      merged.models.map((model) => model.id),
      ["a", "gpt-5.5"],
    );
  });

  it("re-dates the CLI version and the probe time", () => {
    const merged = mergeCatalog(catalog([entry("a", "anthropic")]), [], {
      cliVersion: "v2",
      probedAt: STAMP,
    });
    assert.equal(merged.meta.cli_version, "v2");
    assert.equal(merged.meta.probed_at, STAMP);
  });

  it("keeps the prior sample when a run reported none", async () => {
    // The sample is a one-call observation the cost preview depends on;
    // dropping it on a silent run would blind the next refresh.
    const before = catalog([
      modelEntry({
        id: "a",
        provider: "anthropic",
        enablement: "confirmed",
        probe_premium_requests: 15,
      }),
    ]);
    const merged = mergeCatalog(before, await probe(["a"], { a: probeOk("a") }));
    assert.equal(merged.models[0]!.probe_premium_requests, 15);
  });
});

// --- Refresh scope and cost --------------------------------------------------

function sampled(
  id: string,
  provider: string,
  options: { sample?: number; onVersion?: string; enablement?: string } = {},
): ModelEntry {
  return modelEntry({
    id,
    provider,
    enablement: options.enablement ?? "confirmed",
    probe_premium_requests: options.sample ?? null,
    confirmed_on_cli_version: options.onVersion ?? null,
  });
}

describe("what a refresh selects", () => {
  it("takes the cheapest confirmed model of each provider for a quorum", () => {
    // The 2-request common case. A refresh that costs 39 to answer "did my
    // seat survive the auto-update?" is one nobody runs, which is what left
    // hand-editing as the only remedy.
    const plan = planRefresh(loadCatalog(V1_LOCK), { scope: SCOPE_QUORUM });
    assert.deepEqual(planModelIds(plan), [
      "claude-sonnet-4.6",
      "gemini-3.1-pro-preview",
      "gpt-5.5",
    ]);
    assert.equal(knownPremiumRequests(plan), 2);
  });

  it("prefers a measured sample to an unmeasured one", () => {
    // Unknown is never free, so an unmeasured entry is not the cheap one --
    // picking it would make the projection meaningless.
    const plan = planRefresh(
      catalog([
        sampled("a-unmeasured", "anthropic"),
        sampled("a-measured", "anthropic", { sample: 3 }),
        sampled("o-1", "openai", { sample: 0 }),
      ]),
      { scope: SCOPE_QUORUM },
    );
    assert.deepEqual(planModelIds(plan), ["a-measured", "o-1"]);
  });

  it("treats an unprobed entry as unprobed rather than stale", () => {
    // Sweeping it in would turn a targeted re-confirmation into a universe
    // probe, which is the cost blowout the whole command exists to avoid.
    const plan = planRefresh(
      catalog([
        sampled("dear", "anthropic", { sample: 15, onVersion: "v1" }),
        sampled("cheap", "anthropic", { sample: 1, onVersion: "v1" }),
        sampled("current", "openai", { sample: 0, onVersion: "v2" }),
        sampled("never-probed", "google", { enablement: "unconfirmed" }),
      ]),
      { scope: SCOPE_STALE, liveCliVersion: "v2" },
    );
    assert.deepEqual(planModelIds(plan), ["cheap", "dear"]);
  });

  it("prices the whole declared universe from the file", () => {
    const loaded = loadCatalog(V1_LOCK);
    const plan = planRefresh(loaded, { scope: SCOPE_ALL });
    assert.deepEqual(planModelIds(plan), [...loaded.meta.candidate_universe]);
    assert.equal(knownPremiumRequests(plan), 39);
    assert.equal(unknownCostIds(plan).length, 5);
  });

  it("bounds what may be probed by the declared universe", () => {
    // The CLI has no list-models command, so the universe in the file is the
    // only list there is: a probe costs a premium request a typo must not buy.
    assert.throws(
      () => planRefresh(loadCatalog(V1_LOCK), { scope: SCOPE_MODELS, models: ["claude-opus-9"] }),
      /candidate universe/,
    );
    assert.throws(
      () => planRefresh(catalog([entry("a", "anthropic")]), { scope: SCOPE_ALL }),
      /candidate_universe/,
    );
  });

  it("names an unknown cost rather than costing it zero", () => {
    const text = formatPlan(
      planRefresh(catalog([sampled("a", "anthropic"), sampled("b", "openai", { sample: 1 })]), {
        scope: SCOPE_QUORUM,
      }),
    );
    assert.match(text, /projected cost: 1 premium request\(s\)/);
    assert.match(text, /unknown is not zero/);
    assert.match(text, /floor/);
  });

  it("never asks for the quorum and always asks for the universe", () => {
    // Friction on the cheap path is what made v1's writer unrunnable.
    const loaded = loadCatalog(V1_LOCK);
    assert.equal(needsConfirmation(planRefresh(loaded, { scope: SCOPE_QUORUM })), false);
    assert.equal(needsConfirmation(planRefresh(loaded, { scope: SCOPE_ALL })), true);
  });

  it("separates a priced projection from an unpriced one", () => {
    const priced: RefreshPlan = {
      scope: SCOPE_QUORUM,
      samples: [
        ["a", 1],
        ["b", 2],
      ],
      threshold: 5,
    };
    assert.equal(knownPremiumRequests(priced), 3);
    assert.deepEqual(unknownCostIds(priced), []);
    assert.equal(needsConfirmation(priced), false);
    // A plan that cannot bound its own spend has not been priced, whatever
    // the known part adds up to.
    assert.equal(
      needsConfirmation({ scope: SCOPE_QUORUM, samples: [["a", null]], threshold: 5 }),
      true,
    );
  });
});

// --- Running a refresh -------------------------------------------------------

function lockCopy(): string {
  const path = join(tempDir("refresh-"), "copilot-catalog.lock");
  writeFileSync(path, readAsPython(V1_LOCK), "utf8");
  return path;
}

function writeLock(
  metaLines: readonly string[],
  ...entries: ReadonlyArray<readonly string[]>
): string {
  const tables = ["[meta]\n" + metaLines.join("\n")];
  for (const lines of entries) tables.push("[[models]]\n" + lines.join("\n"));
  const path = join(tempDir("refresh-"), "small.lock");
  writeFileSync(path, tables.join("\n\n") + "\n", "utf8");
  return path;
}

function refuseToSpawn(argv: readonly string[]): never {
  throw new Error(`a plan that was not approved spawned the CLI: ${argv.join(" ")}`);
}

const SEAT_VERSION = "GitHub Copilot CLI 1.0.80.";

function collector(): { sink: (text: string) => void; text: () => string } {
  const lines: string[] = [];
  return { sink: (text: string) => lines.push(text), text: () => lines.join("\n") };
}

function quorumSeat(
  overrides: Record<string, readonly [string, string, number]> = {},
): CopilotCliTransport {
  return new CopilotCliTransport({
    spawner: seatSpawner({
      "claude-sonnet-4.6": probeOk("claude-sonnet-4.6", { premiumRequests: 1 }),
      "gemini-3.1-pro-preview": probeOk("gemini-3.1-pro-preview", { premiumRequests: 1 }),
      "gpt-5.5": probeOk("gpt-5.5", { premiumRequests: 0 }),
      ...overrides,
    }),
  });
}

describe("a refresh run end to end", () => {
  it("prints the plan and probes nothing on a dry run", async () => {
    const path = lockCopy();
    const before = readFileSync(path);
    const out = collector();
    const code = await runRefresh({
      catalogPath: path,
      transport: new CopilotCliTransport({ spawner: refuseToSpawn }),
      scope: SCOPE_ALL,
      dryRun: true,
      out: out.sink,
    });
    assert.equal(code, 0);
    assert.match(out.text(), /refresh plan: scope=all/);
    assert.deepEqual(readFileSync(path), before);
  });

  it("spends nothing on a plan nobody approved", async () => {
    // The unattended case is the one that matters: no terminal means fail
    // closed, never prompt into the void and never assume yes.
    const path = lockCopy();
    const before = readFileSync(path);
    const out = collector();
    const code = await runRefresh({
      catalogPath: path,
      transport: new CopilotCliTransport({ spawner: refuseToSpawn }),
      scope: SCOPE_ALL,
      confirm: () => false,
      out: out.sink,
    });
    assert.equal(code, 1);
    assert.match(out.text(), /declined/);
    assert.deepEqual(readFileSync(path), before);
  });

  it("writes its merge and reports it as a diff", async () => {
    const path = lockCopy();
    const before = modelBlocks(readAsPython(path));
    const out = collector();
    assert.equal(
      await runRefresh({
        catalogPath: path,
        transport: quorumSeat(),
        liveCliVersion: SEAT_VERSION,
        clock: () => STAMP,
        out: out.sink,
      }),
      0,
    );
    assert.equal(loadCatalog(path).meta.cli_version, SEAT_VERSION);
    assert.match(out.text(), /cli version re-dated/);
    assert.match(out.text(), /re-confirmed: claude-sonnet-4\.6/);
    // Merge, never clobber: the entries this run did not probe are
    // byte-identical, provenance included.
    const after = modelBlocks(readAsPython(path));
    assert.deepEqual(Object.keys(before).filter((key) => before[key] !== after[key]).sort(), [
      'id = "claude-sonnet-4.6"',
      'id = "gemini-3.1-pro-preview"',
      'id = "gpt-5.5"',
    ]);
    // And the file it left reads back as machine-written.
    assert.equal(catalogProvenance(loadCatalog(path)), PROVENANCE_MACHINE_WRITTEN);
    assert.equal(loadCatalog(path).meta.written_at, STAMP);
  });

  it("reports a failed probe and leaves the confirmation standing", async () => {
    const path = lockCopy();
    const out = collector();
    const code = await runRefresh({
      catalogPath: path,
      transport: quorumSeat({ "gpt-5.5": PROBE_REFUSED }),
      liveCliVersion: SEAT_VERSION,
      clock: () => STAMP,
      out: out.sink,
    });
    assert.equal(code, 0);
    assert.match(out.text(), new RegExp(`probe failed: gpt-5\\.5 \\(${ERROR_CLASS_INVALID_MODEL}\\)`));
    assert.match(out.text(), /stands, visibly stale/);
    assert.equal(providerOf(loadCatalog(path), "gpt-5.5"), "openai");
  });

  it("says so when nothing moved", async () => {
    const path = writeLock(
      ['cli_version = "v1"', 'seat_id = "s"', 'candidate_universe = [\n    "a",\n    "o",\n]'],
      [
        'id = "a"',
        'provider = "anthropic"',
        'enablement = "confirmed"',
        'confirmed_on_cli_version = "v1"',
        "probe_premium_requests = 1",
      ],
      [
        'id = "o"',
        'provider = "openai"',
        'enablement = "confirmed"',
        'confirmed_on_cli_version = "v1"',
        "probe_premium_requests = 0",
      ],
    );
    const out = collector();
    const code = await runRefresh({
      catalogPath: path,
      transport: new CopilotCliTransport({
        spawner: seatSpawner({
          a: probeOk("a", { premiumRequests: 1 }),
          o: probeOk("o", { premiumRequests: 0 }),
        }),
      }),
      liveCliVersion: "v1",
      clock: () => STAMP,
      out: out.sink,
    });
    assert.equal(code, 0);
    assert.match(out.text(), /no change/);
    assert.ok(!out.text().includes("changed:"));
  });
});

// --- Role resolution ---------------------------------------------------------

describe("resolving a role against the seat", () => {
  const CONFIG = {
    roles: {
      generator: {
        prefer: ["claude-x", "gpt-x"],
        require_provider_in: ["anthropic", "openai", "google"],
      },
    },
  };

  function seatCatalog(): Catalog {
    return catalog([
      entry("claude-x", "anthropic"),
      entry("gpt-x", "openai"),
      entry("gemini-x", "google"),
      entry("blocked-x", "openai", "unconfirmed"),
    ]);
  }

  it("orders by the role's preference list and never offers an unconfirmed entry", () => {
    const candidates = resolveRoleCandidates(CONFIG, seatCatalog(), "generator");
    assert.deepEqual(candidates[0], ["claude-x", "anthropic"]);
    assert.deepEqual(candidates[1], ["gpt-x", "openai"]);
    assert.ok(candidates.every(([id]) => id !== "blocked-x"));
    // A confirmed entry the preference list does not name is kept, sorted last.
    assert.deepEqual(candidates[candidates.length - 1], ["gemini-x", "google"]);
  });

  it("leaves the rest of the confirmed catalog after an exclusion", () => {
    assert.deepEqual(
      resolveRoleCandidates(CONFIG, seatCatalog(), "generator", ["anthropic", "openai"]),
      [["gemini-x", "google"]],
    );
    assert.deepEqual(
      resolveRoleCandidates(CONFIG, seatCatalog(), "generator", [
        "anthropic",
        "openai",
        "google",
      ]),
      [],
    );
  });

  it("applies the role's provider filter", () => {
    const config = {
      roles: { generator: { prefer: ["claude-x", "gpt-x"], require_provider_in: ["openai"] } },
    };
    assert.deepEqual(resolveRoleCandidates(config, seatCatalog(), "generator"), [
      ["gpt-x", "openai"],
    ]);
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
