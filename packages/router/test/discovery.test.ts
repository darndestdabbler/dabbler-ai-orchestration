import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ENUMERATE_COMMAND,
  ERROR_NO_API_KEY,
  RECORD_API,
  RECORD_SEAT,
  checkFreshness,
  computeDrift,
  dumpsRecord,
  emptyRecord,
  enumerateProvider,
  freshnessMessage,
  isStale,
  loadRecord,
  mergeRecord,
  recordProvenance,
  sessionsInFlight,
  writeRecord,
  type ApiModelEntry,
  type HttpGet,
  type ModelRecord,
  type ProviderResult,
} from "../src/discovery.ts";
import { PROVENANCE_HAND_EDITED } from "../src/lockfile.ts";
import { clearProviderKeys, makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);
beforeEach(clearProviderKeys);
afterEach(clearProviderKeys);

const NOW = Date.UTC(2026, 7, 27, 12, 0, 0);

function stamp(hoursAgo: number): string {
  return new Date(NOW - hoursAgo * 3_600_000).toISOString().replace(/\.\d+Z$/, "Z");
}

function entry(fields: Partial<ApiModelEntry> & { id: string; provider: string }): ApiModelEntry {
  return {
    provider_source: "vendor-enumeration",
    display_name: null,
    created_at: null,
    max_context_tokens: null,
    max_output_tokens: null,
    capabilities: [],
    enumerated_at: null,
    raw: {},
    ...fields,
  };
}

/** Every modelled field, and none of the unmodelled remainder. */
function withoutRaw(recordValue: ModelRecord): unknown {
  const strip = (value: object): unknown =>
    Object.fromEntries(Object.entries(value).filter(([key]) => key !== "raw"));
  return {
    meta: strip(recordValue.meta),
    providers: recordValue.providers.map(strip),
    models: recordValue.models.map(strip),
  };
}

function answered(provider: string, entries: ApiModelEntry[] = []): ProviderResult {
  return { provider, entries, error: null };
}

function failed(provider: string, error: string): ProviderResult {
  return { provider, entries: [], error };
}

function providerConfig(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    providers: {
      anthropic: {
        api_key_env: "TEST_ANTHROPIC_KEY",
        base_url: "https://api.anthropic.com/v1/messages",
        api_version: "2023-06-01",
        timeout_seconds: 30,
      },
      google: {
        api_key_env: "TEST_GOOGLE_KEY",
        base_url: "https://generativelanguage.googleapis.com/v1beta",
        timeout_seconds: 30,
      },
      openai: {
        api_key_env: "TEST_OPENAI_KEY",
        base_url: "https://api.openai.com/v1",
        timeout_seconds: 30,
      },
    },
    ...overrides,
  };
}

/** A models endpoint that answers from a script and remembers the calls. */
class RecordingGet {
  readonly calls: Array<{
    url: string;
    headers: Record<string, string>;
    params: Record<string, string | number> | null;
  }> = [];
  private readonly pages: Array<Record<string, unknown>>;

  constructor(...pages: Array<Record<string, unknown>>) {
    this.pages = [...pages];
  }

  readonly get: HttpGet = (url, headers, params) => {
    this.calls.push({ url, headers, params });
    return Promise.resolve(this.pages.shift() ?? {});
  };
}

// --- Enumeration -------------------------------------------------------------

describe("reading a vendor's models endpoint", () => {
  it("paginates Anthropic to exhaustion", async () => {
    process.env["TEST_ANTHROPIC_KEY"] = "k";
    const recorder = new RecordingGet(
      {
        data: [{ id: "claude-opus-5", display_name: "Opus 5" }],
        has_more: true,
        last_id: "claude-opus-5",
      },
      { data: [{ id: "claude-sonnet-5" }], has_more: false },
    );
    const result = await enumerateProvider(
      providerConfig(), "anthropic", recorder.get,
    );

    expect(result.entries.map((model) => model.id)).toEqual([
      "claude-opus-5", "claude-sonnet-5",
    ]);
    expect(recorder.calls[0]!.url).toBe("https://api.anthropic.com/v1/models");
    expect(recorder.calls[1]!.params!["after_id"]).toBe("claude-opus-5");
  });

  it("keeps the fields one vendor reports and the other does not", async () => {
    // The unequal-reporting case the record has to survive: one vendor
    // returns a capability tree, the other returns a name.
    process.env["TEST_GOOGLE_KEY"] = "k";
    const recorder = new RecordingGet({
      models: [
        {
          name: "models/gemini-3.1-pro-preview",
          displayName: "Gemini 3.1 Pro",
          inputTokenLimit: 1048576,
          outputTokenLimit: 65536,
          supportedGenerationMethods: ["generateContent"],
        },
      ],
    });
    const result = await enumerateProvider(providerConfig(), "google", recorder.get);
    const model = result.entries[0]!;

    expect(model.id).toBe("gemini-3.1-pro-preview");
    expect(model.max_context_tokens).toBe(1048576);
    expect(model.capabilities).toEqual(["generateContent"]);
    // The key travels in a header and never the query string.
    expect(recorder.calls[0]!.headers).toEqual({ "x-goog-api-key": "k" });
    expect(Object.keys(recorder.calls[0]!.params ?? {})).not.toContain("key");
  });

  it("reports a missing key as a result rather than raising", async () => {
    const result = await enumerateProvider(providerConfig(), "openai");
    expect(result.error).toBe(ERROR_NO_API_KEY);
    expect(result.entries).toEqual([]);
  });

  it("turns OpenAI's epoch creation stamp into a dated field", async () => {
    process.env["TEST_OPENAI_KEY"] = "k";
    const recorder = new RecordingGet({
      data: [{ id: "gpt-5.5", created: 1767225600 }],
    });
    const result = await enumerateProvider(providerConfig(), "openai", recorder.get);

    expect(result.entries[0]!.id).toBe("gpt-5.5");
    expect(result.entries[0]!.created_at).toBe("2026-01-01T00:00:00Z");
    expect(recorder.calls[0]!.url).toBe("https://api.openai.com/v1/models");
  });

  it("records a vendor error's class and never its message", async () => {
    // The string is written to a committed record, and a vendor error body
    // can echo the request headers back.
    process.env["TEST_OPENAI_KEY"] = "k";
    const explode: HttpGet = (url, headers) => {
      throw new TypeError(`failed calling ${url} with ${JSON.stringify(headers)}`);
    };
    const result = await enumerateProvider(providerConfig(), "openai", explode);
    expect(result.error).toBe("TypeError");
  });
});

// --- Unknown is never unsupported --------------------------------------------

describe("a field a vendor stops reporting", () => {
  it("keeps its last known value rather than being blanked", () => {
    const known = mergeRecord(emptyRecord(), [
      answered("google", [
        entry({
          id: "gemini-x", provider: "google",
          max_context_tokens: 1000, capabilities: ["generateContent"],
        }),
      ]),
    ]);
    const quiet = mergeRecord(known, [
      answered("google", [entry({ id: "gemini-x", provider: "google" })]),
    ]);

    expect(quiet.models[0]!.max_context_tokens).toBe(1000);
    expect(quiet.models[0]!.capabilities).toEqual(["generateContent"]);
  });

  it("is written by omission, because a placeholder would read as a measurement", () => {
    const path = join(makeTempDir(), "api-models.lock");
    writeRecord(
      path,
      mergeRecord(emptyRecord(), [
        answered("anthropic", [entry({ id: "claude-x", provider: "anthropic" })]),
      ]),
    );
    const text = readFileSync(path, "utf8");

    expect(text).not.toContain("max_context_tokens");
    expect(text).not.toContain("capabilities");
    expect(loadRecord(path).models[0]!.max_context_tokens).toBeNull();
  });

  it("does not empty a provider whose attempt failed", () => {
    const known = mergeRecord(emptyRecord(), [
      answered("openai", [entry({ id: "gpt-x", provider: "openai" })]),
    ]);
    const after = mergeRecord(known, [failed("openai", "TimeoutError")]);

    expect(after.models.map((model) => model.id)).toEqual(["gpt-x"]);
    const status = after.providers.find((row) => row.name === "openai");
    expect(status!.last_error).toBe("TimeoutError");
  });
});

// --- The record --------------------------------------------------------------

describe("the record and its writer", () => {
  it("round-trips through the writer, byte for byte", () => {
    const path = join(makeTempDir(), "api-models.lock");
    const written = writeRecord(
      path,
      mergeRecord(emptyRecord("keys-a"), [
        answered("anthropic", [
          entry({ id: "claude-x", provider: "anthropic", display_name: "X" }),
        ]),
        // A vendor that answered and listed nothing: zero is a measurement,
        // and must not read back as never-enumerated.
        answered("google"),
      ]),
    );

    // `raw` is `compare=False` on the Python dataclass and is left out here
    // for the same reason: it is the unmodelled remainder a reader picked up
    // and a writer must not drop, and the claim about it is byte-identity of
    // the rendered text -- which is the assertion below.
    expect(withoutRaw(loadRecord(path))).toEqual(withoutRaw(written));
    expect(dumpsRecord(loadRecord(path))).toBe(readFileSync(path, "utf8"));
  });

  it("reports an edit made after the write as hand-edited", () => {
    const path = join(makeTempDir(), "api-models.lock");
    writeRecord(
      path,
      mergeRecord(emptyRecord(), [
        answered("anthropic", [entry({ id: "claude-x", provider: "anthropic" })]),
      ]),
    );
    writeFileSync(path, readFileSync(path, "utf8").replace("claude-x", "claude-y"), {
      encoding: "utf8",
    });

    expect(recordProvenance(loadRecord(path))).toBe(PROVENANCE_HAND_EDITED);
  });

  it("creates the record's home on the first write", () => {
    // The default lives under `.dabbler/`, which does not exist on a fresh
    // checkout; the sanctioned writer is the only way to make the record, so
    // it has to be able to make it the first time.
    const path = join(makeTempDir(), ".dabbler", "api-models.lock");
    writeRecord(path, emptyRecord());
    expect(loadRecord(path).meta.key_set_id).toBe("default");
  });

  it("drops a model the answering vendor no longer returns", () => {
    // Enumeration is authoritative about existence on this path, unlike a
    // probe: a role naming the departed model becomes drift, not a silent
    // candidate.
    const known = mergeRecord(emptyRecord(), [
      answered("openai", [
        entry({ id: "gpt-old", provider: "openai" }),
        entry({ id: "gpt-new", provider: "openai" }),
      ]),
    ]);
    const after = mergeRecord(known, [
      answered("openai", [entry({ id: "gpt-new", provider: "openai" })]),
    ]);
    expect(after.models.map((model) => model.id)).toEqual(["gpt-new"]);
  });
});

// --- Freshness ---------------------------------------------------------------

function freshnessConfig(
  directory: string,
  discovery: Record<string, unknown> = {},
): Record<string, unknown> {
  return providerConfig({
    discovery: { record: join(directory, "api-models.lock"), ...discovery },
  });
}

function writeAgedRecord(directory: string, hours: number): ModelRecord {
  return writeRecord(
    join(directory, "api-models.lock"),
    mergeRecord(
      emptyRecord(),
      ["anthropic", "google", "openai"].map((name) => answered(name)),
      stamp(hours),
    ),
  );
}

function rowFor(rows: ReturnType<typeof checkFreshness>, name: string) {
  return rows.find((row) => row.record === name)!;
}

describe("dating the records", () => {
  it("calls an absent record stale and names the invocation that fixes it", () => {
    const rows = checkFreshness(freshnessConfig(makeTempDir()), NOW);
    const api = rowFor(rows, RECORD_API);

    expect(isStale(api)).toBe(true);
    expect(api.present).toBe(false);
    expect(freshnessMessage(api)).toContain(ENUMERATE_COMMAND);
  });

  it("ages each record against its own threshold", () => {
    // The seat is not on the API's clock: a probe costs premium requests, so
    // the same age that is stale for a free metadata call is not.
    const directory = makeTempDir();
    const config = freshnessConfig(directory, {
      max_age_hours: 24, seat_max_age_hours: 720,
    });
    writeAgedRecord(directory, 100);
    writeFileSync(
      join(directory, "copilot-catalog.lock"),
      `[meta]\ncli_version = "x"\nseat_id = "s"\nprobed_at = "${stamp(100)}"\n`,
      { encoding: "utf8" },
    );
    config["_config_path"] = join(directory, "router-config.yaml");
    config["transports"] = { "copilot-cli": { lockfile: "copilot-catalog.lock" } };

    const rows = checkFreshness(config, NOW);
    expect(isStale(rowFor(rows, RECORD_API))).toBe(true);
    expect(isStale(rowFor(rows, RECORD_SEAT))).toBe(false);
  });

  it("does not let one vendor's success date the whole record", () => {
    // Three endpoints this project does not control: one key expiring while
    // the others answer is an operational path, not an edge case, and the
    // record is only as current as its stalest enabled vendor.
    const directory = makeTempDir();
    const config = freshnessConfig(directory, { max_age_hours: 24 });
    let recordValue = mergeRecord(
      emptyRecord(),
      ["anthropic", "openai", "google"].map((name) => answered(name)),
      stamp(100),
    );
    recordValue = mergeRecord(
      recordValue,
      [answered("anthropic"), answered("google")],
      stamp(1),
    );
    writeRecord(join(directory, "api-models.lock"), recordValue);

    const api = rowFor(checkFreshness(config, NOW), RECORD_API);
    expect(isStale(api)).toBe(true);
    expect(api.age_hours).toBeCloseTo(100, 0);
  });

  it("names a vendor the record has never carried", () => {
    const directory = makeTempDir();
    const config = freshnessConfig(directory, { max_age_hours: 24 });
    writeRecord(
      join(directory, "api-models.lock"),
      mergeRecord(
        emptyRecord(),
        [answered("anthropic"), answered("openai")],
        stamp(1),
      ),
    );

    const api = rowFor(checkFreshness(config, NOW), RECORD_API);
    expect(isStale(api)).toBe(true);
    expect(api.notes.join(" ")).toContain("google has never been enumerated");
  });

  it("rounds the age the way Python formats it", () => {
    // The message is compared byte for byte against the Python router's, and
    // `f"{x:.0f}"` rounds half to EVEN -- 2.5 hours is "2", not "3".
    const directory = makeTempDir();
    const config = freshnessConfig(directory, { max_age_hours: 1 });
    writeAgedRecord(directory, 2.5);
    const api = rowFor(checkFreshness(config, NOW), RECORD_API);
    expect(freshnessMessage(api)).toContain("2h old (threshold 1h)");
  });
});

// --- Drift -------------------------------------------------------------------

describe("the record-against-roles diff", () => {
  it("reports both directions", () => {
    const directory = makeTempDir();
    const config = freshnessConfig(directory);
    config["roles"] = { verifier: { prefer: ["gpt-ranked", "gpt-gone"] } };
    writeRecord(
      join(directory, "api-models.lock"),
      mergeRecord(emptyRecord(), [
        answered("openai", [
          entry({ id: "gpt-ranked", provider: "openai" }),
          entry({ id: "gpt-unranked", provider: "openai" }),
        ]),
      ]),
    );
    const drift = computeDrift(config, NOW);

    expect(drift.unavailable.map(([model]) => model)).toEqual(["gpt-gone"]);
    expect(drift.unnamed.map(([model]) => model)).toEqual(["gpt-unranked"]);
  });
});

// --- Refresh never happens inside a session ----------------------------------

describe("reading what is in flight", () => {
  it("takes it from the state file and from nothing else", () => {
    const directory = makeTempDir();
    writeFileSync(
      join(directory, "sessions.json"),
      JSON.stringify({
        schemaVersion: 5,
        sessions: [
          { number: 1, status: "complete" },
          { number: 2, status: "in-progress" },
        ],
      }),
      { encoding: "utf8" },
    );
    expect(sessionsInFlight(directory)).toEqual(["session 2"]);
  });

  it("reports nothing in flight for an idle repository", () => {
    const directory = makeTempDir();
    writeFileSync(
      join(directory, "sessions.json"),
      JSON.stringify({
        schemaVersion: 5,
        sessions: [{ number: 1, status: "not-started" }],
      }),
      { encoding: "utf8" },
    );
    expect(sessionsInFlight(directory)).toEqual([]);
  });
});
