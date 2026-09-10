// Model discovery on the direct-API path: enumeration, what a record keeps
// when a vendor goes quiet, how old the evidence is, and the diff between
// what the roles name and what the records carry.
//
// The vendor call is a seam the caller passes in (`HttpGet`), the age of a
// record and the drift between two are functions over facts, and the two
// tests that use the network use LOOPBACK only -- because what they assert
// is what Node itself throws, which a hand-built error cannot prove.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { PROVENANCE_HAND_EDITED } from "../src/lockfile.ts";
import {
  ENUMERATE_COMMAND,
  ENUMERATION_ERRORS,
  ERROR_HTTP_STATUS,
  ERROR_NETWORK,
  ERROR_NO_API_KEY,
  ERROR_PARSE,
  ERROR_TIMEOUT,
  ERROR_UNKNOWN,
  RECORD_API,
  RECORD_SEAT,
  apiRecordAge,
  checkFreshness,
  computeDrift,
  driftBetween,
  dumpsRecord,
  emptyRecord,
  enumerateProvider,
  freshnessMessage,
  freshnessWarnings,
  inFlightSessions,
  isStale,
  loadRecord,
  mergeRecord,
  recordProvenance,
  refreshStaleRecords,
  retiredModels,
  roleNames,
  writeRecord,
  type ApiModelEntry,
  type FreshnessRow,
  type HttpGet,
  type ModelRecord,
  type ProviderResult,
} from "../src/discovery.ts";
import { HttpStatusError, HttpTimeoutError } from "../src/transports/api.ts";
import { loadCatalog, seatModel, type SeatEnumeration } from "../src/transports/copilot.ts";
import { seed, tempDir } from "./support/answers.ts";

const KEYS = ["TEST_ANTHROPIC_KEY", "TEST_GOOGLE_KEY", "TEST_OPENAI_KEY"];
const clearKeys = (): void => {
  for (const name of KEYS) delete process.env[name];
};
beforeEach(clearKeys);
afterEach(clearKeys);

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
    retired_at: null,
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

function providerConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

/** A loopback port the OS has just released, so a connect is refused. */
async function closedLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** Every `code` down an error's `cause` chain. */
function codesInChain(error: unknown): string[] {
  const codes: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    const code = (current as NodeJS.ErrnoException).code;
    if (typeof code === "string" && code !== "") codes.push(code);
    current = (current as { cause?: unknown }).cause;
  }
  return codes;
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
    const result = await enumerateProvider(providerConfig(), "anthropic", recorder.get);

    assert.deepEqual(
      result.entries.map((model) => model.id),
      ["claude-opus-5", "claude-sonnet-5"],
    );
    assert.equal(recorder.calls[0]!.url, "https://api.anthropic.com/v1/models");
    assert.equal(recorder.calls[1]!.params!["after_id"], "claude-opus-5");
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

    assert.equal(model.id, "gemini-3.1-pro-preview");
    assert.equal(model.max_context_tokens, 1048576);
    assert.deepEqual(model.capabilities, ["generateContent"]);
    // The key travels in a header and never the query string.
    assert.deepEqual(recorder.calls[0]!.headers, { "x-goog-api-key": "k" });
    assert.ok(!Object.keys(recorder.calls[0]!.params ?? {}).includes("key"));
  });

  it("reports a missing key as a result rather than raising", async () => {
    const result = await enumerateProvider(providerConfig(), "openai");
    assert.equal(result.error, ERROR_NO_API_KEY);
    assert.deepEqual(result.entries, []);
  });

  it("turns OpenAI's epoch creation stamp into a dated field", async () => {
    process.env["TEST_OPENAI_KEY"] = "k";
    const recorder = new RecordingGet({ data: [{ id: "gpt-5.5", created: 1767225600 }] });
    const result = await enumerateProvider(providerConfig(), "openai", recorder.get);

    assert.equal(result.entries[0]!.id, "gpt-5.5");
    assert.equal(result.entries[0]!.created_at, "2026-01-01T00:00:00Z");
    assert.equal(recorder.calls[0]!.url, "https://api.openai.com/v1/models");
  });

  it("records a vendor failure in the shared vocabulary", async () => {
    // Never the message: a vendor error body can echo the request headers
    // back, and the string is written to a committed record. Never the
    // failure's own class either: that names whichever HTTP library threw
    // it, on a field both routers must write identically.
    process.env["TEST_OPENAI_KEY"] = "k";
    const refused = Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
    });
    const cases: Array<readonly [unknown, string]> = [
      [new HttpTimeoutError("timed out after 30s"), ERROR_TIMEOUT],
      [Object.assign(new Error("aborted"), { name: "TimeoutError" }), ERROR_TIMEOUT],
      [new HttpStatusError("HTTP 500 for url 'x'"), ERROR_HTTP_STATUS],
      [refused, ERROR_NETWORK],
      [new SyntaxError("Unexpected token < in JSON"), ERROR_PARSE],
      [new RangeError("something new"), ERROR_UNKNOWN],
    ];
    for (const [thrown, expected] of cases) {
      const explode: HttpGet = () => {
        throw thrown;
      };
      const result = await enumerateProvider(providerConfig(), "openai", explode);
      assert.equal(result.error, expected, String(thrown));
      assert.ok(ENUMERATION_ERRORS.includes(String(result.error)));
    }
  });

  it("calls a refused connection a network error, on the real fetch", async () => {
    // The classifier reads what Node actually throws, so a hand-built error
    // is not proof. The port is allocated and released rather than picked: a
    // hard-coded one proves nothing if something is listening on it.
    //
    // It must also not be a port `fetch` refuses on sight -- 1, 7, 9, 21, 25,
    // 53 and eighty more are on the WHATWG bad-port list, and Node rejects
    // those before opening a socket. That is NOT the event this asserts, and
    // it once passed here while proving nothing. So the syscall code is
    // asserted first, and the vocabulary term second.
    process.env["TEST_OPENAI_KEY"] = "k";
    const port = await closedLoopbackPort();

    const raw = await fetch(`http://127.0.0.1:${port}/v1/models`).then(
      () => null,
      (error: unknown) => error,
    );
    assert.ok(codesInChain(raw).includes("ECONNREFUSED"));

    const config = providerConfig();
    (config["providers"] as Record<string, Record<string, unknown>>)["openai"]["base_url"] =
      `http://127.0.0.1:${port}/v1`;
    const result = await enumerateProvider(config, "openai");
    assert.equal(result.error, ERROR_NETWORK);
  });

  it("does not mistake fetch's own bad-port refusal for a refused connection", async () => {
    // The other half of the same lesson: a port fetch will not dial reaches
    // no network at all, and nothing in the chain carries a syscall code.
    const raw = await fetch("http://127.0.0.1:1/v1/models").then(
      () => null,
      (error: unknown) => error,
    );
    assert.deepEqual(codesInChain(raw), []);
    assert.match(String((raw as Error).cause), /bad port/);
  });
});

// --- Unknown is never unsupported --------------------------------------------

describe("a field a vendor stops reporting", () => {
  it("keeps its last known value rather than being blanked", () => {
    const known = mergeRecord(emptyRecord(), [
      answered("google", [
        entry({
          id: "gemini-x",
          provider: "google",
          max_context_tokens: 1000,
          capabilities: ["generateContent"],
        }),
      ]),
    ]);
    const quiet = mergeRecord(known, [
      answered("google", [entry({ id: "gemini-x", provider: "google" })]),
    ]);

    assert.equal(quiet.models[0]!.max_context_tokens, 1000);
    assert.deepEqual(quiet.models[0]!.capabilities, ["generateContent"]);
  });

  it("is written by omission, because a placeholder would read as a measurement", () => {
    const path = join(tempDir("record-"), "api-models.lock");
    writeRecord(
      path,
      mergeRecord(emptyRecord(), [
        answered("anthropic", [entry({ id: "claude-x", provider: "anthropic" })]),
      ]),
    );
    const text = readFileSync(path, "utf8");

    assert.ok(!text.includes("max_context_tokens"));
    assert.ok(!text.includes("capabilities"));
    assert.equal(loadRecord(path).models[0]!.max_context_tokens, null);
  });

  it("does not empty a provider whose attempt failed", () => {
    const known = mergeRecord(emptyRecord(), [
      answered("openai", [entry({ id: "gpt-x", provider: "openai" })]),
    ]);
    const after = mergeRecord(known, [failed("openai", "TimeoutError")]);

    assert.deepEqual(
      after.models.map((model) => model.id),
      ["gpt-x"],
    );
    assert.equal(after.providers.find((row) => row.name === "openai")!.last_error, "TimeoutError");
  });

  it("marks a model the answering vendor no longer returns, and keeps it", () => {
    // Marked, never deleted: a deletion is indistinguishable from a model
    // that was never there, and one bad enumeration could take the only
    // verifier a role had. The entry stays, says when it was last seen and
    // when it went, stops being offered, and shows up as drift.
    const known = mergeRecord(
      emptyRecord(),
      [
        answered("openai", [
          entry({ id: "gpt-old", provider: "openai" }),
          entry({ id: "gpt-new", provider: "openai" }),
        ]),
      ],
      stamp(100),
    );
    const after = mergeRecord(
      known,
      [answered("openai", [entry({ id: "gpt-new", provider: "openai" })])],
      stamp(1),
    );

    const old = after.models.find((model) => model.id === "gpt-old")!;
    assert.equal(old.retired_at, stamp(1));
    assert.equal(old.enumerated_at, stamp(100));
    assert.equal(after.models.find((model) => model.id === "gpt-new")?.retired_at, null);

    // A model that comes back has the mark cleared rather than a second
    // entry written.
    const back = mergeRecord(
      after,
      [
        answered("openai", [
          entry({ id: "gpt-old", provider: "openai" }),
          entry({ id: "gpt-new", provider: "openai" }),
        ]),
      ],
      stamp(0),
    );
    assert.equal(back.models.filter((model) => model.id === "gpt-old").length, 1);
    assert.equal(back.models.find((model) => model.id === "gpt-old")?.retired_at, null);
  });

  it("keeps a retired entry out of what the records are known to carry", () => {
    // The one reading both the drift diff and the pane's offer go through:
    // the file still has the model, and the record no longer vouches for it.
    const directory = tempDir("retired-");
    const settings = providerConfig({
      discovery: { record: join(directory, "api-models.lock") },
    });
    const record = mergeRecord(
      mergeRecord(
        emptyRecord(),
        [answered("openai", [entry({ id: "gpt-old", provider: "openai" }), entry({ id: "gpt-new", provider: "openai" })])],
        stamp(100),
      ),
      [answered("openai", [entry({ id: "gpt-new", provider: "openai" })])],
      stamp(1),
    );
    writeRecord(join(directory, "api-models.lock"), record);

    const retired = retiredModels(settings);
    assert.deepEqual([...retired.keys()], ["gpt-old"]);
    assert.equal(retired.get("gpt-old")?.lastSeenAt, stamp(100));
    // A role still naming it is drift, which is where a withdrawn model is
    // supposed to become visible.
    assert.deepEqual(
      computeDrift({ ...settings, roles: { verifier: { prefer: ["gpt-old"] } } }, NOW).unavailable,
      [["gpt-old", "verifier"]],
    );
  });

  it("retires nothing from a record it cannot read", () => {
    const directory = tempDir("retired-");
    writeFileSync(join(directory, "api-models.lock"), "not toml at all\n", "utf8");
    assert.deepEqual(
      [
        ...retiredModels(
          providerConfig({ discovery: { record: join(directory, "api-models.lock") } }),
        ).keys(),
      ],
      [],
    );
  });
});

// --- The record --------------------------------------------------------------

describe("the record and its writer", () => {
  it("round-trips through the writer, byte for byte", () => {
    const path = join(tempDir("record-"), "api-models.lock");
    const written = writeRecord(
      path,
      mergeRecord(emptyRecord("keys-a"), [
        answered("anthropic", [entry({ id: "claude-x", provider: "anthropic", display_name: "X" })]),
        // A vendor that answered and listed nothing: zero is a measurement,
        // and must not read back as never-enumerated.
        answered("google"),
      ]),
    );

    // `raw` is the unmodelled remainder a reader picked up and a writer must
    // not drop; the claim about it is byte-identity of the rendered text,
    // which is the second assertion.
    assert.deepEqual(withoutRaw(loadRecord(path)), withoutRaw(written));
    assert.equal(dumpsRecord(loadRecord(path)), readFileSync(path, "utf8"));
  });

  it("reports an edit made after the write as hand-edited", () => {
    const path = join(tempDir("record-"), "api-models.lock");
    writeRecord(
      path,
      mergeRecord(emptyRecord(), [
        answered("anthropic", [entry({ id: "claude-x", provider: "anthropic" })]),
      ]),
    );
    writeFileSync(path, readFileSync(path, "utf8").replace("claude-x", "claude-y"), "utf8");

    assert.equal(recordProvenance(loadRecord(path)), PROVENANCE_HAND_EDITED);
  });

  it("creates the record's home on the first write", () => {
    // The default lives under `.dabbler/`, which does not exist on a fresh
    // checkout; the sanctioned writer is the only way to make the record, so
    // it has to be able to make it the first time.
    const path = join(tempDir("record-"), ".dabbler", "api-models.lock");
    writeRecord(path, emptyRecord());
    assert.equal(loadRecord(path).meta.key_set_id, "default");
  });
});

// --- Freshness ---------------------------------------------------------------

const PROVIDERS = ["anthropic", "google", "openai"];

function aged(hours: number, providers: readonly string[] = PROVIDERS): ModelRecord {
  return mergeRecord(
    emptyRecord(),
    providers.map((name) => answered(name)),
    stamp(hours),
  );
}

describe("how old a record's evidence is", () => {
  it("takes the record's age from its stalest enabled vendor", () => {
    // Three endpoints this project does not control: one key expiring while
    // the others answer is an operational path, not an edge case, and
    // `meta.enumerated_at` advances whenever ANY vendor answers.
    const record = mergeRecord(aged(100), [answered("anthropic"), answered("google")], stamp(1));
    assert.equal(apiRecordAge(record, PROVIDERS).datedAt, stamp(100));
  });

  it("names a vendor the record has never carried", () => {
    const age = apiRecordAge(aged(1, ["anthropic", "openai"]), PROVIDERS);
    assert.match(age.notes.join(" "), /google has never been enumerated/);
  });

  it("says an entry is older than its date when the last attempt failed", () => {
    const record = mergeRecord(aged(1), [failed("openai", ERROR_TIMEOUT)], stamp(1));
    assert.match(apiRecordAge(record, PROVIDERS).notes.join(" "), /last attempt failed/);
  });

  it("falls back to the record-level date when no vendor is enumerable", () => {
    // With no enumerable provider configured there is no per-vendor evidence
    // to be conservative about.
    const age = apiRecordAge(aged(5), []);
    assert.equal(age.datedAt, stamp(5));
    assert.deepEqual(age.notes, []);
  });
});

describe("judging a freshness row", () => {
  function row(overrides: Partial<FreshnessRow> = {}): FreshnessRow {
    return {
      record: RECORD_API,
      path: "/repo/.dabbler/api-models.lock",
      threshold_hours: 24,
      command: ENUMERATE_COMMAND,
      present: true,
      dated_at: stamp(2),
      age_hours: 2,
      notes: [],
      ...overrides,
    };
  }

  it("calls absent, undated, overdue and partial all stale", () => {
    // All four mean the same thing to a reader: the record does not
    // currently establish what exists.
    assert.equal(isStale(row()), false);
    assert.equal(isStale(row({ present: false })), true);
    assert.equal(isStale(row({ age_hours: null })), true);
    assert.equal(isStale(row({ age_hours: 25 })), true);
    assert.equal(isStale(row({ notes: ["google has never been enumerated"] })), true);
  });

  it("says what is lost while a record is absent, not only that it is", () => {
    // A bare "run this" repeated at every session start is what an operator
    // learns to scroll past.
    const message = freshnessMessage(row({ present: false }));
    assert.match(message, new RegExp(ENUMERATE_COMMAND));
    assert.match(message, /drift/);
    assert.match(message, /Nothing is blocked/);
  });

  it("rounds the age the way Python formats it", () => {
    // The message is compared against the Python router's, and `f"{x:.0f}"`
    // rounds half to EVEN -- 2.5 hours is "2", not "3".
    assert.match(
      freshnessMessage(row({ age_hours: 2.5, threshold_hours: 1 })),
      /2h old \(threshold 1h\)/,
    );
  });
});

describe("dating both records together", () => {
  function config(directory: string, discovery: Record<string, unknown> = {}): Record<string, unknown> {
    return providerConfig({
      discovery: { record: join(directory, "api-models.lock"), ...discovery },
    });
  }

  it("calls an absent record stale and names the invocation that fixes it", () => {
    const rows = checkFreshness(config(tempDir("fresh-")), NOW);
    const api = rows.find((entry) => entry.record === RECORD_API)!;
    assert.equal(api.present, false);
    assert.equal(isStale(api), true);
  });

  it("keeps a record that was never made out of the per-session warnings", () => {
    // A record that exists and has aged is one command from current and is
    // worth saying every time; one that was never made is a repository that
    // has not run discovery, and saying so at every session start for the
    // life of the repository is a warning nothing ever answers. `bootstrap`
    // says that one, once, where a project is set up.
    const settings = config(tempDir("fresh-"));
    assert.ok(freshnessWarnings(settings, NOW, true).length > 0);
    assert.deepEqual(freshnessWarnings(settings, NOW, false), []);
  });

  it("ages each record against its own threshold", () => {
    // The seat is not on the API's clock: a probe costs premium requests, so
    // the same age that is stale for a free metadata call is not.
    const directory = tempDir("fresh-");
    const settings = config(directory, { max_age_hours: 24, seat_max_age_hours: 720 });
    writeRecord(join(directory, "api-models.lock"), aged(100));
    seed(directory, {
      "copilot-catalog.lock": `[meta]\ncli_version = "x"\nseat_id = "s"\nprobed_at = "${stamp(100)}"\n`,
    });
    settings["_config_path"] = join(directory, "router-config.yaml");
    settings["transports"] = { "copilot-cli": { lockfile: "copilot-catalog.lock" } };

    const rows = checkFreshness(settings, NOW);
    assert.equal(isStale(rows.find((row) => row.record === RECORD_API)!), true);
    assert.equal(isStale(rows.find((row) => row.record === RECORD_SEAT)!), false);
  });
});

describe("the record a session start brings up to date", () => {
  /** A config whose API record and seat catalog are both in `directory`. */
  function config(directory: string): Record<string, unknown> {
    const settings = providerConfig({
      discovery: { record: join(directory, "api-models.lock"), max_age_hours: 24 },
    });
    settings["_config_path"] = join(directory, "router-config.yaml");
    settings["transports"] = { "copilot-cli": { lockfile: "copilot-catalog.lock" } };
    return settings;
  }

  /**
   * The seat catalog: two dates in one file, on two clocks.
   *
   * `probed` is when a model last answered, which is a billed turn each and
   * is never refreshed here. `listed` is when the seat last stated what it
   * has, which is free -- and is the half this path brings up to date.
   */
  function seatCatalog(directory: string, probed: number, listed = 0): string {
    const path = join(directory, "copilot-catalog.lock");
    seed(directory, {
      "copilot-catalog.lock":
        `[meta]\ncli_version = "x"\nseat_id = "s"\n` +
        `probed_at = "${stamp(probed)}"\nenumerated_at = "${stamp(listed)}"\n` +
        'enumeration_source = "acp-session-new"\n',
    });
    return path;
  }

  /** The seat's list, as the free protocol reading returns one. */
  function seatSays(...ids: readonly string[]): () => Promise<SeatEnumeration> {
    return () =>
      Promise.resolve({
        known: true,
        models: ids.map((id) =>
          seatModel({ modelId: id, name: id, _meta: { copilotUsage: "1x", copilotEnablement: "enabled" } }),
        ),
        current_model_id: ids[0] ?? null,
        modes: ["agent"],
        reasoning_efforts: [],
        cli_version: "x",
        read_at: stamp(0),
        source: "acp-session-new",
        reason: null,
      });
  }

  /** A seat nothing may reach: this path must not open one. */
  const noSeat = (): Promise<SeatEnumeration> => {
    assert.fail("the seat was read for a record that is not stale");
  };

  it("re-reads both free records before the work, and nothing that costs", async () => {
    const directory = tempDir("refresh-");
    const recordPath = join(directory, "api-models.lock");
    writeRecord(recordPath, aged(100));
    // The confirmations are a decade old and the list a week: only the free
    // half moves, whatever the priced half's age.
    const seatPath = seatCatalog(directory, 10_000, 168);
    for (const name of KEYS) process.env[name] = "k";
    const vendor = new RecordingGet(
      { data: [{ id: "claude-new" }] },
      { models: [{ name: "models/gemini-new" }] },
      { data: [{ id: "gpt-new" }] },
    );

    const lines = await refreshStaleRecords(config(directory), {
      now: NOW,
      get: vendor.get,
      enumerateSeat: seatSays("gpt-seat", "claude-seat"),
    });

    // One free metadata call per enabled vendor, and the record now says so.
    assert.equal(vendor.calls.length, 3);
    assert.match(lines.join("\n"), /re-read before this session's work/);
    assert.match(lines.join("\n"), /no tokens billed/);
    assert.deepEqual(
      loadRecord(recordPath).models.map((model) => model.id).sort(),
      ["claude-new", "gemini-new", "gpt-new"],
    );
    // The seat's list is the seat's own statement, recorded free.
    assert.match(lines.join("\n"), /no prompt sent/);
    const catalog = loadCatalog(seatPath);
    assert.deepEqual([...catalog.meta.candidate_universe], ["gpt-seat", "claude-seat"]);
    // And the priced half is untouched: not one confirmation was bought.
    assert.equal(catalog.meta.probed_at, stamp(10_000));
    assert.deepEqual(catalog.models.map((model) => model.enablement), [
      "unconfirmed",
      "unconfirmed",
    ]);
  });

  it("reads nothing at all against records that are current", async () => {
    const directory = tempDir("refresh-");
    writeRecord(join(directory, "api-models.lock"), aged(1));
    seatCatalog(directory, 10_000, 1);
    for (const name of KEYS) process.env[name] = "k";
    const vendor = new RecordingGet();

    assert.deepEqual(
      await refreshStaleRecords(config(directory), {
        now: NOW,
        get: vendor.get,
        enumerateSeat: noSeat,
      }),
      [],
    );
    assert.equal(vendor.calls.length, 0);
  });

  it("leaves a record that was never made to bootstrap", async () => {
    const directory = tempDir("refresh-");
    seatCatalog(directory, 1, 1);
    const vendor = new RecordingGet();
    assert.deepEqual(
      await refreshStaleRecords(config(directory), {
        now: NOW,
        get: vendor.get,
        enumerateSeat: noSeat,
      }),
      [],
    );
    assert.equal(vendor.calls.length, 0);
  });

  it("leaves each record standing when its source cannot be reached, and says which", async () => {
    const directory = tempDir("refresh-");
    const recordPath = join(directory, "api-models.lock");
    writeRecord(recordPath, mergeRecord(emptyRecord(), [answered("anthropic", [entry({ id: "held", provider: "anthropic" })])], stamp(100)));
    const seatPath = seatCatalog(directory, 1, 168);
    const seatBefore = readFileSync(seatPath);
    process.env["TEST_ANTHROPIC_KEY"] = "k";
    const exploding: HttpGet = () => Promise.reject(new HttpTimeoutError("too slow"));

    const lines = await refreshStaleRecords(config(directory), {
      now: NOW,
      get: exploding,
      // A seat that could not be read is not a seat with no models.
      enumerateSeat: () =>
        Promise.resolve({
          known: false,
          models: [],
          current_model_id: null,
          modes: [],
          reasoning_efforts: [],
          cli_version: null,
          read_at: stamp(0),
          source: "acp-session-new",
          reason: "'copilot' is not on PATH",
        }),
    });

    assert.match(lines.join("\n"), /could not be read/);
    assert.match(lines.join("\n"), /what the record already held stands/);
    assert.match(lines.join("\n"), /not on PATH/);
    assert.match(lines.join("\n"), /nothing was probed/);
    assert.deepEqual(
      loadRecord(recordPath).models.map((model) => model.id),
      ["held"],
    );
    assert.deepEqual(readFileSync(seatPath), seatBefore);
  });
});

// --- Drift -------------------------------------------------------------------

describe("the record-against-roles diff", () => {
  it("reports both directions", () => {
    const roles = roleNames({ roles: { verifier: { prefer: ["gpt-ranked", "gpt-gone"] } } });
    const known = new Map([
      ["gpt-ranked", [RECORD_API]],
      ["gpt-unranked", [RECORD_API]],
    ]);
    const drift = driftBetween(roles, known, []);
    assert.deepEqual(
      drift.unavailable.map(([model]) => model),
      ["gpt-gone"],
    );
    assert.deepEqual(
      drift.unnamed.map(([model]) => model),
      ["gpt-unranked"],
    );
  });

  it("names every record that carries an unranked model, and every role that ranks it", () => {
    // Both records feed the diff: a name that exists only on the seat is
    // inert on the API path rather than missing, and reporting it as missing
    // would train the reader to ignore the report.
    const roles = roleNames({
      roles: { verifier: { prefer: ["gone"] }, generator: { prefer: ["gone"] } },
    });
    const known = new Map([["seat-only", [RECORD_SEAT, RECORD_API, RECORD_SEAT]]]);
    const drift = driftBetween(roles, known, []);
    assert.deepEqual(drift.unnamed, [["seat-only", "api-enumeration,seat-catalog"]]);
    assert.deepEqual(drift.unavailable, [["gone", "generator,verifier"]]);
  });
});

// --- Refresh never happens inside a session ----------------------------------

describe("reading what is in flight", () => {
  it("takes it from the state record and from nothing else", () => {
    // Not the presence of a lock file or a run directory: those are not the
    // record.
    assert.deepEqual(
      inFlightSessions({
        schemaVersion: 5,
        sessions: [
          { number: 1, status: "complete" },
          { number: 2, status: "in-progress" },
        ],
      }),
      ["session 2"],
    );
  });

  it("reports nothing in flight for an idle repository, or for no record at all", () => {
    assert.deepEqual(
      inFlightSessions({ schemaVersion: 5, sessions: [{ number: 1, status: "not-started" }] }),
      [],
    );
    assert.deepEqual(inFlightSessions(null), []);
  });
});
