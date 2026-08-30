import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";

import { afterAll, describe, expect, it } from "vitest";

import {
  CopilotCliTransport,
  ERROR_CLASS_INVALID_MODEL,
  HANDOFF_THRESHOLD_UTF16_UNITS,
  PROVIDER_SOURCE_HEURISTIC,
  REFRESH_COMMAND,
  SCOPE_ALL,
  SCOPE_MODELS,
  SCOPE_QUORUM,
  SCOPE_STALE,
  type Catalog,
  type ModelEntry,
  type ProcessHandle,
  type RefreshPlan,
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
} from "../src/transports/copilot.ts";
import { isOk, type APIResult } from "../src/transports/base.ts";
import {
  PROVENANCE_HAND_EDITED,
  PROVENANCE_MACHINE_WRITTEN,
  PROVENANCE_UNSTAMPED,
} from "../src/lockfile.ts";
import { ASSET_DIR } from "../src/paths.ts";
import { makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

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
 * a clean file. Python's universal newlines erase that difference for its own
 * tests; Node's `readFileSync` does not, so the erasure is done here instead of
 * being smuggled into the reader, where it would be a second answer about what
 * a line is.
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
  const stream = new Readable({ read() { /* nothing more is ever pushed */ } });
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
    expect(isOk(result)).toBe(true);
    expect(result.content).toBe("hello from seat");
    expect(result.output_tokens).toBe(42);
    expect(result.input_tokens).toBe(0); // never reported by the CLI
    expect(result.served_model_id).toBe("claude-sonnet-4.6");
    expect(result.metadata["session_id"]).toBe("conv-123");
    expect(result.metadata["premium_requests"]).toBe(1);
  });

  it("carries the read-only tool grant and the auto-update pin in its argv", async () => {
    const spawner = spawnerFor(fakeProcess({ stdout: OK_STDOUT }));
    await dispatch(new CopilotCliTransport({ spawner }));
    expect(spawner.argv).toContain("--available-tools");
    expect(spawner.argv[spawner.argv.indexOf("--available-tools") + 1]).toBe(
      "view,grep,glob",
    );
    expect(spawner.argv).toContain("--no-auto-update");
    expect(spawner.argv).toContain("--allow-all-tools");
    expect(spawner.env).toEqual({ COPILOT_AUTO_UPDATE: "false" });
  });

  it("joins the system and user text, because the CLI has one prompt flag", async () => {
    const spawner = spawnerFor(fakeProcess({ stdout: OK_STDOUT }));
    await dispatch(new CopilotCliTransport({ spawner }), {
      system_prompt: "SYS",
      user_message: "USER",
    });
    expect(spawner.argv[spawner.argv.indexOf("-p") + 1]).toBe("SYS\n\nUSER");
  });

  it("disables the workspace's custom instructions", async () => {
    // A routed call is not an orchestrator session. The CLI would otherwise
    // load AGENTS.md/CLAUDE.md into the system prompt -- text the API
    // transport never sends, and which tells a routed verifier it is running
    // the session it was asked to judge.
    const spawner = spawnerFor(fakeProcess({ stdout: OK_STDOUT }));
    await dispatch(new CopilotCliTransport({ spawner }));
    expect(spawner.argv).toContain("--no-custom-instructions");
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
    expect(result.metadata["tool_calls"]).toEqual([
      {
        tool: "view",
        arguments: { path: "a.py" },
        success: true,
        result: { content: "shown" },
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
    ["one malformed line poisons the response", OK_STDOUT + "not json\n"],
    [
      "content is null rather than absent",
      eventLines({ type: "assistant.message", data: { content: null } }),
    ],
  ] as const) {
    it(`fails closed when ${label}`, async () => {
      const result = await dispatch(
        new CopilotCliTransport({ spawner: spawnerFor(fakeProcess({ stdout })) }),
      );
      expect(isOk(result)).toBe(false);
      expect(result.metadata["error_class"]).toBe("generic-unknown");
      expect(result.content).toBe("");
    });
  }

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
      expect(isOk(result)).toBe(false);
      expect(result.metadata["error_class"]).toBe(expected);
      expect(result.metadata["retryable"]).toBe(false);
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
    expect(auth.metadata["reprobe_cli_version"]).toBe("GitHub Copilot CLI 1.0.69.");
    const quota = await dispatch(
      new CopilotCliTransport({
        spawner: spawnerFor(fakeProcess({ stderr: "429\n", exitCode: 1 })),
        versionProbe: () => "should not be asked",
      }),
    );
    expect(quota.metadata["reprobe_cli_version"]).toBeNull();
  });

  it("classifies a spawn that never returns as a spawn timeout", async () => {
    const result = await dispatch(
      new CopilotCliTransport({
        spawner: () => new Promise<ProcessHandle>(() => { /* never settles */ }),
        timeouts: { spawn_seconds: 0.05, first_byte_seconds: 0.1, total_seconds: 0.2 },
      }),
    );
    expect(result.metadata["error_class"]).toBe("spawn-timeout");
  });

  it("kills the child when no first byte arrives", async () => {
    const process = blockingProcess();
    const result = await dispatch(
      new CopilotCliTransport({
        spawner: spawnerFor(process),
        timeouts: { spawn_seconds: 1.0, first_byte_seconds: 0.05, total_seconds: 5.0 },
      }),
    );
    expect(result.metadata["error_class"]).toBe("first-byte-timeout");
    expect(process.killed).toBe(true);
  });

  it("discards partial output at the total timeout rather than parsing it", async () => {
    const process = blockingProcess(['{"type":"other"}\n']);
    const result = await dispatch(
      new CopilotCliTransport({
        spawner: spawnerFor(process),
        timeouts: { spawn_seconds: 1.0, first_byte_seconds: 2.0, total_seconds: 0.2 },
      }),
    );
    expect(result.metadata["error_class"]).toBe("total-timeout");
    expect(result.metadata["partial_output_discarded"]).toBe(true);
    expect(process.killed).toBe(true);
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
    expect(isOk(await dispatch(transport))).toBe(true);
    expect(isOk(await dispatch(transport))).toBe(true);
    const blocked = await dispatch(transport);
    expect(blocked.metadata["error_class"]).toBe("invocation-breaker");
    expect(spawns).toBe(2); // a breaker-blocked call never spawns
    expect(transport.invocationCount).toBe(2);
  });

  it("classifies a spawner failure rather than letting it escape", async () => {
    const result = await dispatch(
      new CopilotCliTransport({
        spawner: () => {
          throw new Error("copilot not found");
        },
      }),
    );
    expect(result.metadata["error_class"]).toBe("generic-unknown");
    expect(String(result.metadata["stderr_tail"])).toContain("not found");
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
    expect(result.metadata["error_class"]).toBe("argv-too-large");
    expect(result.metadata["retryable"]).toBe(false);
  });
});

// --- Timeout validation ------------------------------------------------------

describe("the timeout contract config validates at load", () => {
  it("accepts an ordered trio", () => {
    expect(() =>
      validateTransportTimeouts({
        spawn_seconds: 5,
        first_byte_seconds: 20,
        total_seconds: 600,
      }),
    ).not.toThrow();
  });

  it("rejects an unknown key rather than silently keeping the default", () => {
    expect(() => validateTransportTimeouts({ total_second: 300 })).toThrow(
      /total_second/,
    );
  });

  it("rejects a boolean, which Python would read as one second", () => {
    expect(() => validateTransportTimeouts({ total_seconds: true })).toThrow(
      /must be a number/,
    );
  });

  it("rejects an out-of-order trio, where an inner ceiling can never fire", () => {
    expect(() =>
      validateTransportTimeouts({ spawn_seconds: 100, first_byte_seconds: 30 }),
    ).toThrow(/spawn_seconds </);
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

describe("the seat catalog as a record", () => {
  it("reads a v1 lockfile, legacy probe key and all", () => {
    const loaded = loadCatalog(V1_LOCK);
    expect(confirmedModels(loaded)).toHaveLength(15);
    const sonnet = loaded.models.find((model) => model.id === "claude-sonnet-4.6")!;
    expect(sonnet.probe_premium_requests).toBe(1); // the legacy key still reads
    expect(loaded.meta.seat_id).toBe("op-personal");
    expect(providerOf(loaded, "gpt-5.5")).toBe("openai");
  });

  it("resolves no provider for an unconfirmed entry", () => {
    expect(providerOf(catalog([entry("m1", "openai", "unconfirmed")]), "m1")).toBeNull();
  });

  it("passes a diverse confirmed catalog", () => {
    expect(validateCatalog(catalog([entry("a", "anthropic"), entry("b", "openai")])).ok)
      .toBe(true);
  });

  it("fails version drift only when the lockfile pinned strictly", () => {
    const pinned = catalog([entry("a", "anthropic"), entry("b", "openai")], {
      pin: true,
    });
    const strict = validateCatalog(pinned, { liveCliVersion: "v2" });
    expect(strict.ok).toBe(false);
    expect(strict.reasons[0]).toContain("drift");
  });

  it("warns about drift by default, because the seat CLI auto-updates", () => {
    // Refusing the seat for a routine auto-update stranded working seats and
    // taught people to hand-edit the pin, destroying the signal.
    const result = validateCatalog(catalog([entry("a", "anthropic"), entry("b", "openai")]), {
      liveCliVersion: "v2",
    });
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.warnings.some((warning) => warning.includes("drift"))).toBe(true);
  });

  it("says nothing about drift when the versions match", () => {
    const result = validateCatalog(catalog([entry("a", "anthropic"), entry("b", "openai")]), {
      liveCliVersion: "v1",
    });
    expect(result.warnings.some((warning) => warning.includes("drift"))).toBe(false);
  });

  it("fails a confirmed entry with no trustworthy provider", () => {
    const result = validateCatalog(catalog([entry("a", ""), entry("b", "openai")]));
    expect(result.ok).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("provenance"))).toBe(true);
  });

  it("fails a catalog that could only verify against itself", () => {
    const result = validateCatalog(catalog([entry("a", "openai"), entry("b", "openai")]));
    expect(result.ok).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("Same-provider-only"))).toBe(
      true,
    );
  });

  it("names the refresh command in every message about a wrong file", () => {
    // The absence of that verb is the incident: an operator told the file is
    // wrong, and handed no command, edits the file.
    const results = [
      validateCatalog(catalog([entry("a", "anthropic"), entry("b", "openai")]), {
        liveCliVersion: "v9",
      }),
      validateCatalog(catalog([entry("a", ""), entry("b", "openai")])),
      validateCatalog(catalog([entry("a", "openai"), entry("b", "openai")])),
    ];
    for (const result of results) {
      const messages = [...result.reasons, ...result.warnings];
      expect(messages.length).toBeGreaterThan(0);
      expect(messages.every((message) => message.includes(REFRESH_COMMAND))).toBe(true);
    }
  });

  it("declares every id it carries in the shipped lockfile's universe", () => {
    // The CLI cannot enumerate models, so the universe is data in the file
    // rather than a list in code.
    const shipped = loadCatalog(SHIPPED_LOCK);
    expect([...shipped.meta.candidate_universe]).toEqual(
      shipped.models.map((model) => model.id),
    );
  });

  it("refuses a malformed candidate universe at load", () => {
    const path = join(makeTempDir(), "c.lock");
    writeFileSync(
      path,
      '[meta]\ncli_version = "v1"\nseat_id = "s"\ncandidate_universe = [1, 2]\n',
      "utf8",
    );
    expect(() => loadCatalog(path)).toThrow(/candidate_universe/);
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
    expect(dumpsCatalog(loadCatalog(SHIPPED_LOCK))).toBe(readAsPython(SHIPPED_LOCK));
  });

  it("keeps a key this version does not model", () => {
    const path = join(makeTempDir(), "c.lock");
    writeFileSync(
      path,
      '[meta]\ncli_version = "v1"\nseat_id = "s"\n\n' +
        '[[models]]\nid = "a"\nprovider = "anthropic"\n' +
        'enablement = "confirmed"\nfuture_key = "keep me"\n',
      "utf8",
    );
    expect(dumpsCatalog(loadCatalog(path))).toContain('future_key = "keep me"');
  });

  it("refuses a value it cannot represent instead of mangling it", () => {
    const broken = catalog([
      modelEntry({
        id: "a",
        provider: "anthropic",
        raw: { probe_detail: { nested: "table" } },
      }),
    ]);
    expect(() => dumpsCatalog(broken)).toThrow(/cannot represent/);
  });

  it("writes unknown by omission, never as a placeholder zero", () => {
    // TOML has no null, and an absent key already means unknown.
    const text = dumpsCatalog(catalog([entry("a", "anthropic")]));
    expect(text).not.toContain("echoed_model");
    expect(text).not.toContain("probe_premium_requests");
  });

  it("writes a lockfile its own reader accepts", () => {
    const path = join(makeTempDir(), "seat.lock");
    writeCatalog(path, catalog([entry("a", "anthropic"), entry("b", "openai")]));
    expect(validateCatalog(loadCatalog(path)).ok).toBe(true);
  });
});

describe("the writer stamp", () => {
  const STAMP = "2026-08-19T00:00:00Z";

  function written(entries: readonly ModelEntry[], writtenAt?: string): string {
    const path = join(makeTempDir(), "seat.lock");
    writeCatalog(path, catalog(entries), writtenAt ? { writtenAt } : {});
    return path;
  }

  it("records what wrote the file and when", () => {
    const path = written([entry("a", "anthropic"), entry("b", "openai")], STAMP);
    const meta = loadCatalog(path).meta;
    expect(meta.written_at).toBe(STAMP);
    expect(meta.written_by).toMatch(/^dabbler\.copilot/);
    expect(catalogProvenance(loadCatalog(path))).toBe(
      PROVENANCE_MACHINE_WRITTEN,
    );
  });

  it("reports an edit after the write as hand-edited, and still loads", () => {
    // The rule this repo holds for `.dabbler/runs/` -- never hand-repaired --
    // made checkable rather than aspirational. Two people hand-edited this
    // file's pin, which is exactly what it must report. Detection, not
    // enforcement: the seat still loads, and says so.
    const path = written([entry("a", "anthropic"), entry("b", "openai")]);
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace('cli_version = "v1"', 'cli_version = "v2"'),
      "utf8",
    );
    const loaded = loadCatalog(path);
    expect(catalogProvenance(loaded)).toBe(PROVENANCE_HAND_EDITED);
    const result = validateCatalog(loaded);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("hand-edited"))).toBe(true);
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
    expect(catalogProvenance(loadCatalog(path))).toBe(
      PROVENANCE_HAND_EDITED,
    );
  });

  it("reads a lockfile no writer ever touched as unstamped", () => {
    const loaded = loadCatalog(V1_LOCK);
    expect(catalogProvenance(loaded)).toBe(PROVENANCE_UNSTAMPED);
    expect(
      validateCatalog(loaded).warnings.some((warning) =>
        warning.includes("no writer stamp"),
      ),
    ).toBe(true);
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
const STAMP = "2026-08-19T00:00:00Z";

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
    expect(only!.enablement).toBe("confirmed");
    expect(only!.confirmed_at).toBe(STAMP);
    expect(only!.confirmed_on_cli_version).toBe("GitHub Copilot CLI 1.0.80.");
    expect(only!.echoed_model).toBe("claude-sonnet-4.6");
    expect(only!.probe_premium_requests).toBe(1);
  });

  it("records a failed probe's own error class without confirming it", async () => {
    const [only] = await probe(["ghost-1"], { "ghost-1": PROBE_REFUSED });
    expect(only!.enablement).toBe("unconfirmed");
    expect(only!.last_probe_error).toBe(ERROR_CLASS_INVALID_MODEL);
    expect(only!.last_probe_at).toBe(STAMP);
    expect(only!.confirmed_at).toBeNull();
  });

  it("keeps a fractional sample, which is a measurement and not malformation", async () => {
    // The seat reports 0.33 for sub-premium models. Discarding that files the
    // cheapest models on the seat as the most uncertain, since unknown sorts
    // after every known sample.
    const [only] = await probe(["claude-haiku-4.5"], {
      "claude-haiku-4.5": probeOk("claude-haiku-4.5", { premiumRequests: 0.33 }),
    });
    expect(only!.probe_premium_requests).toBe(0.33);
    const path = join(makeTempDir(), "seat.lock");
    writeCatalog(path, catalog([only!, entry("o", "openai")]));
    expect(loadCatalog(path).models[0]!.probe_premium_requests).toBe(0.33);
  });

  it("reads anything that is not a count as unknown, never as free", async () => {
    for (const wire of ["1", [1], true, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const [only] = await probe(["gpt-5.5"], {
        "gpt-5.5": probeOk("gpt-5.5", { premiumRequests: wire }),
      });
      expect(only!.probe_premium_requests, String(wire)).toBeNull();
    }
  });

  it("infers a provider by prefix and declares that it guessed", async () => {
    const [guessed] = await probe(["gemini-3.5-flash"], {
      "gemini-3.5-flash": probeOk("gemini-3.5-flash"),
    });
    expect(guessed!.provider).toBe("google");
    expect(guessed!.provider_source).toBe(PROVIDER_SOURCE_HEURISTIC);
    const [unknown] = await probe(["mystery-1"], { "mystery-1": probeOk("mystery-1") });
    expect(unknown!.provider).toBe("");
    expect(unknown!.provider_source).toBe("");
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
    const changed = Object.keys(before).filter((key) => before[key] !== after[key]);
    expect(changed).toEqual(['id = "gpt-5.5"']);
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
    expect(merged.models[0]!.enablement).toBe("confirmed");
    expect(merged.models[0]!.confirmed_at).toBe("2026-07-04T16:17:00Z");
    expect(merged.models[0]!.last_probe_error).toBe(ERROR_CLASS_INVALID_MODEL);
    expect(merged.models[0]!.last_probe_at).toBe(STAMP);
  });

  it("appends an id the catalog did not carry", async () => {
    const merged = mergeCatalog(
      catalog([entry("a", "anthropic")]),
      await probe(["gpt-5.5"], { "gpt-5.5": probeOk("gpt-5.5") }),
    );
    expect(merged.models.map((model) => model.id)).toEqual(["a", "gpt-5.5"]);
  });

  it("re-dates the CLI version and the probe time", () => {
    const merged = mergeCatalog(catalog([entry("a", "anthropic")]), [], {
      cliVersion: "v2",
      probedAt: STAMP,
    });
    expect(merged.meta.cli_version).toBe("v2");
    expect(merged.meta.probed_at).toBe(STAMP);
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
    expect(merged.models[0]!.probe_premium_requests).toBe(15);
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
    expect(planModelIds(plan)).toEqual([
      "claude-sonnet-4.6",
      "gemini-3.1-pro-preview",
      "gpt-5.5",
    ]);
    expect(knownPremiumRequests(plan)).toBe(2);
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
    expect(planModelIds(plan)).toEqual(["a-measured", "o-1"]);
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
    expect(planModelIds(plan)).toEqual(["cheap", "dear"]);
  });

  it("prices the whole declared universe from the file", () => {
    const loaded = loadCatalog(V1_LOCK);
    const plan = planRefresh(loaded, { scope: SCOPE_ALL });
    expect(planModelIds(plan)).toEqual([...loaded.meta.candidate_universe]);
    expect(knownPremiumRequests(plan)).toBe(39);
    expect(unknownCostIds(plan)).toHaveLength(5);
  });

  it("bounds what may be probed by the declared universe", () => {
    // The CLI has no list-models command, so the universe in the file is the
    // only list there is: a probe costs a premium request a typo must not buy.
    expect(() =>
      planRefresh(loadCatalog(V1_LOCK), {
        scope: SCOPE_MODELS,
        models: ["claude-opus-9"],
      }),
    ).toThrow(/candidate universe/);
    expect(() =>
      planRefresh(catalog([entry("a", "anthropic")]), { scope: SCOPE_ALL }),
    ).toThrow(/candidate_universe/);
  });

  it("names an unknown cost rather than costing it zero", () => {
    const text = formatPlan(
      planRefresh(
        catalog([sampled("a", "anthropic"), sampled("b", "openai", { sample: 1 })]),
        { scope: SCOPE_QUORUM },
      ),
    );
    expect(text).toContain("projected cost: 1 premium request(s)");
    expect(text).toContain("unknown is not zero");
    expect(text).toContain("floor");
  });

  it("never asks for the quorum and always asks for the universe", () => {
    // Friction on the cheap path is what made v1's writer unrunnable.
    const loaded = loadCatalog(V1_LOCK);
    expect(needsConfirmation(planRefresh(loaded, { scope: SCOPE_QUORUM }))).toBe(false);
    expect(needsConfirmation(planRefresh(loaded, { scope: SCOPE_ALL }))).toBe(true);
  });
});

// --- Running a refresh -------------------------------------------------------

function lockCopy(): string {
  const path = join(makeTempDir(), "copilot-catalog.lock");
  writeFileSync(path, readAsPython(V1_LOCK), "utf8");
  return path;
}

function writeLock(metaLines: readonly string[], ...entries: ReadonlyArray<readonly string[]>): string {
  const tables = ["[meta]\n" + metaLines.join("\n")];
  for (const lines of entries) tables.push("[[models]]\n" + lines.join("\n"));
  const path = join(makeTempDir(), "small.lock");
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
    expect(code).toBe(0);
    expect(out.text()).toContain("refresh plan: scope=all");
    expect(readFileSync(path)).toEqual(before);
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
    expect(code).toBe(1);
    expect(out.text()).toContain("declined");
    expect(readFileSync(path)).toEqual(before);
  });

  it("writes its merge and reports it as a diff", async () => {
    const path = lockCopy();
    const before = modelBlocks(readAsPython(path));
    const out = collector();
    expect(
      await runRefresh({
        catalogPath: path,
        transport: quorumSeat(),
        liveCliVersion: SEAT_VERSION,
        clock: () => STAMP,
        out: out.sink,
      }),
    ).toBe(0);
    expect(loadCatalog(path).meta.cli_version).toBe(SEAT_VERSION);
    expect(out.text()).toContain("cli version re-dated");
    expect(out.text()).toContain("re-confirmed: claude-sonnet-4.6");
    // Merge, never clobber: the 15 entries this run did not probe are
    // byte-identical, provenance included.
    const after = modelBlocks(readAsPython(path));
    expect(Object.keys(before).filter((key) => before[key] !== after[key]).sort()).toEqual(
      ['id = "claude-sonnet-4.6"', 'id = "gemini-3.1-pro-preview"', 'id = "gpt-5.5"'],
    );
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
    expect(code).toBe(0);
    expect(out.text()).toContain(`probe failed: gpt-5.5 (${ERROR_CLASS_INVALID_MODEL})`);
    expect(out.text()).toContain("stands, visibly stale");
    expect(providerOf(loadCatalog(path), "gpt-5.5")).toBe("openai");
  });

  it("says so when nothing moved", async () => {
    const path = writeLock(
      ['cli_version = "v1"', 'seat_id = "s"', 'candidate_universe = [\n    "a",\n    "o",\n]'],
      ['id = "a"', 'provider = "anthropic"', 'enablement = "confirmed"',
        'confirmed_on_cli_version = "v1"', "probe_premium_requests = 1"],
      ['id = "o"', 'provider = "openai"', 'enablement = "confirmed"',
        'confirmed_on_cli_version = "v1"', "probe_premium_requests = 0"],
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
    expect(code).toBe(0);
    expect(out.text()).toContain("no change");
    expect(out.text()).not.toContain("changed:");
  });

  it("leaves a refreshed lockfile reading back as machine-written", async () => {
    const path = lockCopy();
    await runRefresh({
      catalogPath: path,
      transport: quorumSeat(),
      liveCliVersion: SEAT_VERSION,
      clock: () => STAMP,
      out: () => { /* the diff is asserted elsewhere */ },
    });
    const loaded = loadCatalog(path);
    expect(catalogProvenance(loaded)).toBe(PROVENANCE_MACHINE_WRITTEN);
    expect(loaded.meta.written_at).toBe(STAMP);
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

  it("orders by the role's preference list", () => {
    const candidates = resolveRoleCandidates(CONFIG, seatCatalog(), "generator");
    expect(candidates[0]).toEqual(["claude-x", "anthropic"]);
    expect(candidates[1]).toEqual(["gpt-x", "openai"]);
  });

  it("never offers an unconfirmed entry", () => {
    const candidates = resolveRoleCandidates(CONFIG, seatCatalog(), "generator");
    expect(candidates.every(([id]) => id !== "blocked-x")).toBe(true);
  });

  it("keeps a confirmed entry the preference list does not name, sorted last", () => {
    const candidates = resolveRoleCandidates(CONFIG, seatCatalog(), "generator");
    expect(candidates[candidates.length - 1]).toEqual(["gemini-x", "google"]);
  });

  it("leaves the rest of the confirmed catalog after an exclusion", () => {
    expect(
      resolveRoleCandidates(CONFIG, seatCatalog(), "generator", ["anthropic", "openai"]),
    ).toEqual([["gemini-x", "google"]]);
    expect(
      resolveRoleCandidates(CONFIG, seatCatalog(), "generator", [
        "anthropic",
        "openai",
        "google",
      ]),
    ).toEqual([]);
  });

  it("applies the role's provider filter", () => {
    const config = {
      roles: {
        generator: { prefer: ["claude-x", "gpt-x"], require_provider_in: ["openai"] },
      },
    };
    expect(resolveRoleCandidates(config, seatCatalog(), "generator")).toEqual([
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
 * Reads the payload at spawn time -- which is what proves the write handle was
 * closed -- then answers with whatever the test asked for.
 */
class HandoffSpawner {
  argv: string[] = [];
  payloadText = "";
  payloadPath = "";

  constructor(
    private readonly options: {
      respond?: (nonce: string) => string;
      mutatePayload?: boolean;
    } = {},
  ) {}

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
      expect(renderedUtf16Units(argv)).toBe(expected);
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
    expect(spawner.argv[spawner.argv.indexOf("-p") + 1]).toBe("sys\n\nsmall");
    expect(result.metadata["handoff"]).toBe(false);
    expect(result.metadata).not.toHaveProperty("payload_bytes");
  });

  it("takes the pull exactly at the threshold, and not one unit below", async () => {
    const transport = new CopilotCliTransport({ spawner: spawnerFor(null) });
    // Overhead measured against a one-character prompt, so an empty string's
    // own quoting does not skew the arithmetic.
    const overhead = renderedUtf16Units(transport.buildArgv("z", "m")) - 1;
    const exact = "z".repeat(HANDOFF_THRESHOLD_UTF16_UNITS - overhead);
    expect(renderedUtf16Units(transport.buildArgv(exact, "m"))).toBe(
      HANDOFF_THRESHOLD_UTF16_UNITS,
    );

    const below = await new CopilotCliTransport({
      spawner: spawnerFor(fakeProcess({ stdout: OK_STDOUT })),
    }).dispatch({ model_id: "m", system_prompt: "", user_message: exact.slice(0, -1) });
    expect(below.metadata["handoff"]).toBe(false);

    const at = new HandoffSpawner();
    const result = await new CopilotCliTransport({ spawner: at.spawn }).dispatch({
      model_id: "m",
      system_prompt: "",
      user_message: exact,
    });
    expect(result.metadata["handoff"]).toBe(true);
  });

  it("names a POSIX path in the bootstrap and keeps the nonce out of argv", async () => {
    const spawner = new HandoffSpawner();
    await dispatchBig(spawner);
    const bootstrap = spawner.argv[spawner.argv.indexOf("-p") + 1]!;
    expect(payloadPathFrom(spawner.argv)).not.toContain("\\");
    expect(bootstrap).not.toContain(BIG_PROMPT);
    expect(spawner.argv.join(" ")).not.toContain(nonceOf(spawner.payloadText));
  });

  it("puts the exact prompt plus the footer in the payload", async () => {
    const spawner = new HandoffSpawner();
    await dispatchBig(spawner);
    expect(spawner.payloadText.startsWith(`sys\n\n${BIG_PROMPT}`)).toBe(true);
    expect(spawner.payloadText).toContain("HANDOFF-ACK ");
  });

  it("builds an otherwise identical argv on both branches", async () => {
    const inline = spawnerFor(fakeProcess({ stdout: OK_STDOUT }));
    await dispatch(new CopilotCliTransport({ spawner: inline }), {
      system_prompt: "sys",
      user_message: "small",
    });
    const pull = new HandoffSpawner();
    await dispatchBig(pull);
    const withoutPrompt = (argv: readonly string[]): string[] => {
      const index = argv.indexOf("-p");
      return [...argv.slice(0, index), ...argv.slice(index + 2)];
    };
    expect(withoutPrompt(pull.argv)).toEqual(withoutPrompt(inline.argv));
  });
});

describe("the handoff acknowledgement", () => {
  it("strips a valid ack from the content it returns", async () => {
    const spawner = new HandoffSpawner();
    const result = await dispatchBig(spawner);
    expect(isOk(result)).toBe(true);
    expect(result.content).toBe("answer body");
    expect(result.metadata["handoff_ack"]).toBe("validated");
    expect(result.metadata["payload_bytes"]).toBe(
      Buffer.byteLength(spawner.payloadText, "utf8"),
    );
  });

  it("discards the content when the ack is missing", async () => {
    const result = await dispatchBig(
      new HandoffSpawner({
        respond: () =>
          eventLines(
            { type: "assistant.message", data: { content: "answer with no ack", model: "m" } },
            { type: "result", sessionId: "s1", usage: {} },
          ),
      }),
    );
    expect(isOk(result)).toBe(false);
    expect(result.metadata["error_class"]).toBe("handoff-incomplete");
    expect(result.metadata["handoff_ack"]).toBe("missing");
    expect(result.content).toBe("");
  });

  it("tells a mismatched ack from a missing one", async () => {
    const result = await dispatchBig(
      new HandoffSpawner({ respond: () => ackStdout("deadbeef".repeat(4)) }),
    );
    expect(result.metadata["error_class"]).toBe("handoff-incomplete");
    expect(result.metadata["handoff_ack"]).toBe("mismatch");
  });

  it("records a payload mutation rather than gating on it", async () => {
    const result = await dispatchBig(new HandoffSpawner({ mutatePayload: true }));
    expect(isOk(result)).toBe(true);
    expect(result.metadata["payload_file_modified"]).toBe(true);
  });
});

describe("the payload file's lifetime", () => {
  it("is deleted after a successful call", async () => {
    const spawner = new HandoffSpawner();
    await dispatchBig(spawner);
    expect(existsSync(spawner.payloadPath)).toBe(false);
  });

  it("is deleted after a malformed answer too", async () => {
    const spawner = new HandoffSpawner({ respond: () => "not json\n" });
    const result = await dispatchBig(spawner);
    expect(result.metadata["error_class"]).toBe("generic-unknown");
    expect(result.metadata["handoff"]).toBe(true);
    expect(existsSync(spawner.payloadPath)).toBe(false);
  });

  it("is retained only under the explicit diagnostics toggle", async () => {
    const previous = process.env["DABBLER_COPILOT_DIAGNOSTICS"];
    process.env["DABBLER_COPILOT_DIAGNOSTICS"] = "1";
    const spawner = new HandoffSpawner();
    try {
      await dispatchBig(spawner);
      expect(existsSync(spawner.payloadPath)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env["DABBLER_COPILOT_DIAGNOSTICS"];
      else process.env["DABBLER_COPILOT_DIAGNOSTICS"] = previous;
      // The toggle's whole point is that the transport does not delete it, so
      // the test that proved that has to.
      if (existsSync(spawner.payloadPath)) unlinkSync(spawner.payloadPath);
    }
  });
});

// A refresh plan is a value, and the readings it is asked for are its
// whole interface.
describe("what a plan can say about itself", () => {
  it("separates a priced projection from an unpriced one", () => {
    const priced: RefreshPlan = {
      scope: SCOPE_QUORUM,
      samples: [["a", 1], ["b", 2]],
      threshold: 5,
    };
    expect(knownPremiumRequests(priced)).toBe(3);
    expect(unknownCostIds(priced)).toEqual([]);
    expect(needsConfirmation(priced)).toBe(false);
    // A plan that cannot bound its own spend has not been priced, whatever
    // the known part adds up to.
    expect(
      needsConfirmation({ scope: SCOPE_QUORUM, samples: [["a", null]], threshold: 5 }),
    ).toBe(true);
  });
});
