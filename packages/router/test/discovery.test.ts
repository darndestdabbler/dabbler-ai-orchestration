// Model discovery on the direct-API path: enumeration, what a record keeps
// when a vendor goes quiet, how old the evidence is, and the diff between
// what the roles name and what the records carry.
//
// The vendor call is a seam the caller passes in (`HttpGet`), the age of a
// record and the drift between two are functions over facts, and the two
// tests that use the network use LOOPBACK only -- because what they assert
// is what Node itself throws, which a hand-built error cannot prove.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  ENUMERATION_ERRORS,
  ERROR_HTTP_STATUS,
  ERROR_NETWORK,
  ERROR_NO_API_KEY,
  ERROR_PARSE,
  ERROR_TIMEOUT,
  ERROR_UNKNOWN,
  CATALOG_REFRESH_COMMAND,
  RECORD_CATALOG,
  checkFreshness,
  computeDrift,
  currentApiScope,
  driftBetween,
  enumerateProvider,
  formatDrift,
  freshnessMessage,
  freshnessWarnings,
  inFlightSessions,
  isStale,
  refreshRefusal,
  refreshStaleRecords,
  roleNames,
  setSeatSource,
  transportPresence,
  type FreshnessRow,
  type HttpGet,
} from "../src/discovery.ts";
import {
  CATALOG_FILENAME,
  SOURCE_API,
  SOURCE_SEAT,
  TRANSPORT_API,
  TRANSPORT_SEAT,
  readCatalog,
  setCatalogPath,
  writeBlock,
  type CatalogModel,
  type TransportBlock,
} from "../src/catalog.ts";
import { HttpStatusError, HttpTimeoutError } from "../src/transports/api.ts";
import { seatModel, seatScope, type SeatEnumeration } from "../src/transports/copilot.ts";
import { gitAnswers, makeConfig, seed, setProviderKeys, tempDir } from "./support/answers.ts";
import { resetProjectRootCache } from "../src/config.ts";
import { discoveryVerb } from "../src/cli/discovery.ts";
import { standIn } from "../src/workdir.ts";

/**
 * What a block holds on disk, whatever scope it was written for.
 *
 * The framework has no such reader, deliberately -- a consumer may only
 * believe a block recorded for this machine. These tests are asking a
 * different question: what did the writer put there.
 */
function writtenBlock(
  catalog: ReturnType<typeof readCatalog>,
  transport: string,
): TransportBlock | null {
  return catalog?.transports[transport] ?? null;
}

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

/** One catalog entry, with only the fields a reading of the ids needs. */
function catalogRow(id: string, provider = "openai"): CatalogModel {
  return {
    id,
    provider,
    provider_source: "test",
    display_name: null,
    enabled: true,
    price_category: null,
    cost: null,
    listed_at: stamp(1),
  };
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

describe("judging a freshness row", () => {
  function row(overrides: Partial<FreshnessRow> = {}): FreshnessRow {
    return {
      record: RECORD_CATALOG,
      path: "/repo/.dabbler/api-models.lock",
      threshold_hours: 24,
      command: CATALOG_REFRESH_COMMAND,
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
    assert.match(message, new RegExp(CATALOG_REFRESH_COMMAND));
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

describe("how old this machine's reading is", () => {
  /**
   * A catalog under the suite's temp root holding exactly these blocks.
   *
   * Each block carries the scope its transport actually has, because that is
   * what makes it THIS machine's reading: age is read through `blockFor` like
   * every other reader, so a block written under a scope nobody is on is
   * unread and contributes no date. Writing `{}` for both was how these cases
   * passed while the age reading was the one unscoped reader left.
   */
  function catalogOf(blocks: Record<string, string>, config = providerConfig()): void {
    const path = join(tempDir("fresh-"), CATALOG_FILENAME);
    setCatalogPath(path);
    for (const [transport, refreshedAt] of Object.entries(blocks)) {
      const seat = transport === TRANSPORT_SEAT;
      writeBlock(
        transport,
        {
          refreshed_at: refreshedAt,
          source: seat ? SOURCE_SEAT : SOURCE_API,
          scope: seat ? seatScope(null) : currentApiScope(config),
          models: [],
          retired: [],
        },
        { path },
      );
    }
  }

  it("reads a block recorded for another machine as unread rather than fresh", () => {
    // `catalog.ts` binds four readers to scope and names this one among them.
    // It was the one that walked `transports` directly, so a catalog carried
    // over from another seat aged as this machine's own and reported FRESH --
    // the single word that stops an operator refreshing, told to the one
    // machine whose whole record belongs to somebody else.
    const path = join(tempDir("fresh-"), CATALOG_FILENAME);
    setCatalogPath(path);
    writeBlock(
      TRANSPORT_SEAT,
      {
        refreshed_at: stamp(1),
        source: SOURCE_SEAT,
        scope: { seat_host: "https://github.com", seat_login: "somebody-else" },
        models: [],
        retired: [],
      },
      { path },
    );

    const row = checkFreshness(providerConfig(), NOW)[0]!;
    assert.equal(row.present, true);
    // Unread, not stale: no date, because there is no reading to be old.
    assert.equal(row.dated_at, null);
    assert.equal(isStale(row), true);
    // And it says WHICH transport, because "your record is old" and "your
    // record is somebody else's" have the same remedy and are not the same
    // fact.
    assert.match(freshnessMessage(row), /copilot-cli block it holds was read for a different/);
  });

  it("is one row, whichever transports this machine has", () => {
    // Three rows, and each was named for its implementation: `seat-catalog`
    // and `seat-list` were two dates on one file, and `api-enumeration` was
    // a file that never exists without provider keys -- so a seat-only
    // laptop read one row permanently stale about a record it was never
    // going to have. One catalog, one row.
    setCatalogPath(join(tempDir("fresh-"), CATALOG_FILENAME));
    const unread = checkFreshness(providerConfig(), NOW);
    assert.deepEqual(unread.map((entry) => entry.record), [RECORD_CATALOG]);
    assert.equal(unread[0]?.present, false);
    assert.equal(isStale(unread[0]!), true);
    assert.match(freshnessMessage(unread[0]!), new RegExp(CATALOG_REFRESH_COMMAND));

    // A seat and no keys: one row, current, dated by the one block there
    // is -- and no second row reporting on a transport this machine has not
    // got and is never going to read.
    catalogOf({ [TRANSPORT_SEAT]: stamp(1) });
    const seatOnly = checkFreshness(providerConfig(), NOW);
    assert.equal(seatOnly.length, 1);
    assert.equal(isStale(seatOnly[0]!), false);
    assert.equal(seatOnly[0]?.dated_at, stamp(1));

    // Both, and the row ages against the older of them: a machine is only
    // as current as the transport it has not re-read.
    catalogOf({ [TRANSPORT_SEAT]: stamp(1), [TRANSPORT_API]: stamp(100) });
    const both = checkFreshness(providerConfig(), NOW);
    assert.equal(both.length, 1);
    assert.equal(both[0]?.dated_at, stamp(100));
    assert.equal(isStale(both[0]!), true);
  });

  it("keeps a catalog that was never read out of the per-session warnings", () => {
    // One that exists and has aged is one free command from current and is
    // worth saying every time; one that was never read is a machine that has
    // not run discovery, and saying so at every session start forever is a
    // warning nothing ever answers. `bootstrap` says that one, once.
    setCatalogPath(join(tempDir("fresh-"), CATALOG_FILENAME));
    assert.ok(freshnessWarnings(providerConfig(), NOW, true).length > 0);
    assert.deepEqual(freshnessWarnings(providerConfig(), NOW, false), []);
  });
});

describe("the catalog a session start brings up to date", () => {
  /** The api scope the three test keys produce, and one seat to be on. */
  const SCOPE = { providers: ["anthropic", "google", "openai"] };
  const SEAT = { host: "https://github.com", login: "someone" };
  const SEAT_SCOPE = { seat_host: SEAT.host, seat_login: SEAT.login };

  /** A catalog under the suite's temp root, with the blocks a test wants. */
  function catalogAt(blocks: Record<string, Partial<TransportBlock>>): string {
    const path = join(tempDir("refresh-"), CATALOG_FILENAME);
    for (const [transport, block] of Object.entries(blocks)) {
      writeBlock(
        transport,
        {
          refreshed_at: stamp(1),
          source: transport === TRANSPORT_SEAT ? SOURCE_SEAT : SOURCE_API,
          scope: {},
          models: [],
          retired: [],
          ...block,
        },
        { path },
      );
    }
    setCatalogPath(path);
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
        source: SOURCE_SEAT,
        reason: null,
      });
  }

  /** A seat nothing may reach: this path must not open one. */
  const noSeat = (): Promise<SeatEnumeration> => {
    assert.fail("the seat was read for a block that is not stale");
  };

  it("re-reads both transports before the work, and nothing that costs", async () => {
    const path = catalogAt({
      [TRANSPORT_API]: { refreshed_at: stamp(100) },
      [TRANSPORT_SEAT]: { refreshed_at: stamp(168) },
    });
    for (const name of KEYS) process.env[name] = "k";
    const vendor = new RecordingGet(
      { data: [{ id: "claude-new" }] },
      { models: [{ name: "models/gemini-new" }] },
      { data: [{ id: "gpt-new" }] },
    );

    const lines = await refreshStaleRecords(providerConfig(), {
      now: NOW,
      get: vendor.get,
      enumerateSeat: seatSays("gpt-seat", "claude-seat"),
    });

    // One free metadata call per enabled vendor, and the catalog says so.
    assert.equal(vendor.calls.length, 3);
    assert.match(lines.join("\n"), /the seat block has been re-read/);
    assert.match(lines.join("\n"), /the api block has been re-read/);
    assert.match(lines.join("\n"), /no tokens billed/);
    assert.match(lines.join("\n"), /no prompt sent/);

    const catalog = readCatalog(path);
    assert.deepEqual(
      writtenBlock(catalog, TRANSPORT_API)?.models.map((model) => model.id).sort(),
      ["claude-new", "gemini-new", "gpt-new"],
    );
    // The seat's list is the seat's own statement, recorded free, with the
    // cost it stated and no figure anybody bought.
    assert.deepEqual(
      writtenBlock(catalog, TRANSPORT_SEAT)?.models.map((model) => [model.id, model.cost?.stated_as]),
      [
        ["gpt-seat", "1x"],
        ["claude-seat", "1x"],
      ],
    );
  });

  it("runs once on the first session of a day, and not again that day", async () => {
    // The operator's own cadence, and a day rather than an age: an age lands
    // the refresh at a different hour every day -- twenty-five hours after
    // the last, then fifty -- while the question a developer has is whether
    // this is today's reading.
    for (const name of KEYS) process.env[name] = "k";
    // A local noon, so "an hour ago" and "yesterday evening" are the same
    // two days whatever zone this suite runs in.
    const noon = new Date(2026, 7, 27, 12, 0, 0).getTime();
    const at = (hoursAgo: number): string =>
      new Date(noon - hoursAgo * 3_600_000).toISOString().replace(/\.\d+Z$/, "Z");

    catalogAt({
      [TRANSPORT_API]: { refreshed_at: at(1), scope: SCOPE },
      [TRANSPORT_SEAT]: { refreshed_at: at(1), scope: SEAT_SCOPE },
    });
    const quiet = new RecordingGet();
    assert.deepEqual(
      await refreshStaleRecords(providerConfig(), {
        now: noon,
        get: quiet.get,
        enumerateSeat: noSeat,
        identity: SEAT,
      }),
      [],
    );
    assert.equal(quiet.calls.length, 0);

    // Yesterday evening: thirteen hours, an age a 24-hour threshold would
    // still call fresh. It is a different day, so the first session of this
    // one re-reads.
    catalogAt({
      [TRANSPORT_API]: { refreshed_at: at(13), scope: SCOPE },
      [TRANSPORT_SEAT]: { refreshed_at: at(13), scope: SEAT_SCOPE },
    });
    const today = new RecordingGet({ data: [] }, { models: [] }, { data: [] });
    assert.ok(
      (
        await refreshStaleRecords(providerConfig(), {
          now: noon,
          get: today.get,
          enumerateSeat: seatSays("gpt-seat"),
          identity: SEAT,
        })
      ).length > 0,
    );
    assert.equal(today.calls.length, 3);
  });

  it("does not reopen the seat all day for a transport this machine has not got", async () => {
    // Round 1's nit, and it is a cadence defect: a seat-only machine has an
    // `api` block scoped to keys it no longer holds, no refresh can replace
    // it because no vendor answers, and asking "is that block current" at
    // every session start reopened the seat every time. A transport with no
    // credentials is not a reading that has gone stale; it is one this
    // machine does not have, and the block it left behind is already not
    // believed by anything.
    for (const name of KEYS) delete process.env[name];
    catalogAt({
      [TRANSPORT_API]: { refreshed_at: stamp(400), scope: SCOPE },
      [TRANSPORT_SEAT]: { refreshed_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"), scope: SEAT_SCOPE },
    });
    const vendor = new RecordingGet();
    assert.deepEqual(
      await refreshStaleRecords(providerConfig(), {
        get: vendor.get,
        enumerateSeat: noSeat,
        identity: SEAT,
      }),
      [],
    );
    assert.equal(vendor.calls.length, 0);
  });

  it("re-reads a block recorded for another machine, whatever the date says", async () => {
    // The one guard this file has already needed. A catalog that arrived
    // from somebody else's seat -- a roamed profile, a re-login as another
    // account -- is not a reading of THIS machine, and no date makes it one.
    for (const name of KEYS) process.env[name] = "k";
    catalogAt({
      [TRANSPORT_SEAT]: { refreshed_at: stamp(1), scope: { seat_login: "op-personal" } },
    });
    const vendor = new RecordingGet({ data: [] }, { models: [] }, { data: [] });
    const lines = await refreshStaleRecords(providerConfig(), {
      now: NOW,
      get: vendor.get,
      enumerateSeat: seatSays("gpt-seat"),
      identity: { host: "https://github.com", login: "someone-else" },
    });
    assert.match(lines.join("\n"), /the seat block has been re-read/);
  });

  it("leaves each block standing when its source cannot be reached, and says which", async () => {
    const path = catalogAt({
      [TRANSPORT_API]: {
        refreshed_at: stamp(100),
        models: [
          {
            id: "held",
            provider: "anthropic",
            provider_source: "vendor-enumeration",
            display_name: null,
            enabled: true,
            price_category: null,
            cost: null,
            listed_at: stamp(100),
          },
        ],
      },
      [TRANSPORT_SEAT]: { refreshed_at: stamp(168) },
    });
    const seatBefore = JSON.stringify(writtenBlock(readCatalog(path), TRANSPORT_SEAT));
    process.env["TEST_ANTHROPIC_KEY"] = "k";
    const exploding: HttpGet = () => Promise.reject(new HttpTimeoutError("too slow"));

    const lines = await refreshStaleRecords(providerConfig(), {
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
          source: SOURCE_SEAT,
          reason: "'copilot' is not on PATH",
        }),
    });

    assert.match(lines.join("\n"), /could not be read/);
    assert.match(lines.join("\n"), /not on PATH/);
    assert.match(lines.join("\n"), /nothing was spent/);
    // An outage at one end retires nothing at the other.
    assert.deepEqual(
      writtenBlock(readCatalog(path), TRANSPORT_API)?.models.map((model) => model.id),
      ["held"],
    );
    assert.equal(JSON.stringify(writtenBlock(readCatalog(path), TRANSPORT_SEAT)), seatBefore);
  });
});

// --- Drift -------------------------------------------------------------------

describe("the record-against-roles diff", () => {
  it("reports both directions", () => {
    const roles = roleNames({ roles: { reviewer: { prefer: ["gpt-ranked", "gpt-gone"] } } });
    const known = new Map([
      ["gpt-ranked", [TRANSPORT_API]],
      ["gpt-unranked", [TRANSPORT_API]],
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
      roles: { reviewer: { prefer: ["gone"] }, generator: { prefer: ["gone"] } },
    });
    const known = new Map([["seat-only", [TRANSPORT_SEAT, TRANSPORT_API, TRANSPORT_SEAT]]]);
    const drift = driftBetween(roles, known, []);
    assert.deepEqual(drift.unnamed, [["seat-only", "api,copilot-cli"]]);
    assert.deepEqual(drift.unavailable, [["gone", "generator,reviewer"]]);
  });

  it("leaves out what no role could resolve to, and says so when no role names a model", () => {
    // Two ways this report outlived the registry it was written against.
    //
    // It listed every id in the record as one that "still qualifies and
    // simply sorts last" -- 202 of them on this machine, of which 71 were
    // embeddings, speech, image and video models that qualify for nothing.
    // The chat rule belongs here for the same reason it belongs where a role
    // resolves: a report that contradicts the offer teaches its reader to
    // skip it.
    const path = join(tempDir("drift-"), CATALOG_FILENAME);
    setCatalogPath(path);
    setProviderKeys();
    try {
      writeBlock(
        TRANSPORT_API,
        {
          refreshed_at: stamp(1),
          source: SOURCE_API,
          scope: currentApiScope(providerConfig()),
          models: [
            catalogRow("gpt-5.5"),
            catalogRow("text-embedding-3-small"),
            catalogRow("whisper-1"),
          ],
          retired: [],
        },
        { path },
      );
      const drift = computeDrift(providerConfig(), NOW);
      assert.deepEqual(
        drift.unnamed.map(([model]) => model),
        ["gpt-5.5"],
      );
    } finally {
      clearKeys();
    }

    // And the other half: with the registry gone, a configuration whose roles
    // name no model cannot have anything MISSING from the record, so a count
    // of zero there is vacuous rather than clean. The two read identically on
    // a screen, which is why the report says which one it means.
    const vacuous = formatDrift({ unnamed: [], unavailable: [], freshness: [] }, false);
    assert.match(vacuous, /no role in this configuration names a model/);
    assert.doesNotMatch(vacuous.split("\n")[1] ?? "", /\(0\)/);
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

  it("states the refusal once, so both doors into the catalog read the same rule", () => {
    // `dabbler discovery refresh` refused mid-session and `dabbler copilot
    // refresh` did not, while both write the seat block of the same catalog:
    // in one session, on one machine, the first said a session that changes
    // its own verifier pool has edited the conditions of its own review, and
    // the second did it and reported success. The rule had one statement and
    // one of its two doors; this is the statement, and both doors call it.
    const root = tempDir("refusal-");
    seed(root, {
      "docs/sessions/sessions.json": JSON.stringify({
        schemaVersion: 5,
        sessions: [{ number: 7, status: "in-progress" }],
      }),
    });
    assert.match(String(refreshRefusal(join(root, "docs", "sessions"))), /session 7/);
    assert.match(String(refreshRefusal(join(root, "docs", "sessions"))), /verifier pool/);

    const idle = tempDir("refusal-idle-");
    seed(idle, {
      "docs/sessions/sessions.json": JSON.stringify({
        schemaVersion: 5,
        sessions: [{ number: 7, status: "complete" }],
      }),
    });
    assert.equal(refreshRefusal(join(idle, "docs", "sessions")), null);
  });
});

describe("which vehicles this machine can reach", () => {
  it("reads each kind for what it actually is, and names the reason an absent one is absent", () => {
    // A vehicle nothing can reach is a way to fail rather than a choice, so
    // presence is READ per kind: a key for the direct-API path, an answered
    // seat for the seat, a named-and-existing directory for the scripted
    // one. One test applied to all three would have to be wrong about two.
    setCatalogPath(join(tempDir("presence-"), CATALOG_FILENAME));
    const keyless = transportPresence(makeConfig());
    const byName = (rows: ReturnType<typeof transportPresence>, id: string) =>
      rows.find((row) => row.transport === id);
    assert.equal(byName(keyless, TRANSPORT_API)?.present, false);
    // Every absent one carries what would make it present, because "not
    // offered" with no reason reads as a broken surface.
    assert.ok(keyless.every((row) => row.present || row.note !== null));
    // The seat's remedy is free, and says so: this repository has answered
    // "what does reading the list cost" wrongly four times.
    assert.match(String(byName(keyless, "copilot-cli")?.note), /free/);
    // And the scripted transport is never present by accident: it is opted
    // into by saying where the script lives.
    assert.equal(byName(keyless, "offline")?.present, false);

    setProviderKeys();
    try {
      assert.equal(byName(transportPresence(makeConfig()), TRANSPORT_API)?.present, true);
      assert.equal(byName(transportPresence(makeConfig()), TRANSPORT_API)?.note, null);
    } finally {
      clearKeys();
    }
  });
});

describe("what a refresh leaves behind", () => {
  it("re-derives the projection the pane reads, so the reading it asked for is the one on the screen", async () => {
    // The defect one layer down from the pane's. A refresh changes what this
    // machine can reach, and the surface renders a DERIVED file -- so
    // without this the reading the operator asked for is the one thing the
    // pane does not show until something unrelated moves a declaration.
    // Nothing here reaches a vendor OR a seat, and both are arranged rather
    // than assumed: the seat is a seam, and this machine's provider keys are
    // taken out of the environment for the duration. A test that left either
    // to what the machine happens to have would read the machine it runs on
    // -- and would enumerate three vendors for real on the developer's.
    // The seat is a SEAM here, and armed on purpose: a suite that let this
    // fall through to `enumerateSeatModels` would open a conversation on
    // whatever seat the machine running it happens to have.
    setSeatSource(() =>
      Promise.resolve({
        known: false,
        models: [],
        current_model_id: null,
        modes: [],
        reasoning_efforts: [],
        cli_version: null,
        read_at: stamp(0),
        source: SOURCE_SEAT,
        reason: "no seat in this test",
      }),
    );
    const keys = ["DABBLER_ANTHROPIC_API_KEY", "DABBLER_OPENAI_API_KEY", "DABBLER_GEMINI_API_KEY"];
    const held = keys.map((name) => [name, process.env[name]] as const);
    for (const name of keys) delete process.env[name];
    const root = tempDir("refresh-projection-");
    // Where the repository is, answered from a table: loading a config asks
    // git, and a suite that spawned it would be reading the machine.
    const ungit = gitAnswers([
      [["rev-parse", "--show-toplevel"], { stdout: root.split("\\").join("/") }],
    ]);
    resetProjectRootCache();
    const path = join(tempDir("refresh-projection-catalog-"), CATALOG_FILENAME);
    const dated = stamp(1);
    writeBlock(
      TRANSPORT_API,
      {
        refreshed_at: dated,
        source: SOURCE_API,
        // The scope this machine is on with its keys taken away: the empty
        // provider set, which is a scope and not an absent one. Age is read
        // through `blockFor` now, so a block written under a scope nobody is
        // on carries no date to report.
        scope: { providers: [] },
        models: [],
        retired: [],
      },
      { path },
    );
    setCatalogPath(path);
    const projectionFile = join(root, ".dabbler", "solution", "projection.json");
    assert.equal(existsSync(projectionFile), false, "precondition: nothing derived yet");

    let code: number;
    try {
      code = await standIn(root, () => discoveryVerb(["refresh"]));
    } finally {
      setSeatSource(null);
      ungit();
      resetProjectRootCache();
      for (const [name, value] of held) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
    assert.equal(code, 0);

    assert.ok(existsSync(projectionFile), "the refresh left the pane reading nothing");
    const projection = JSON.parse(readFileSync(projectionFile, "utf8")) as {
      configuration: { records: { record: string; path: string; datedAt: string | null }[] };
    };
    const [record] = projection.configuration.records;
    assert.equal(record?.record, RECORD_CATALOG);
    // The catalog THIS machine reads, as it stands after the refresh. No
    // vendor could answer, so the block stands as it was -- and the pane
    // reads that, from a projection there was none of before the verb ran.
    assert.equal(record?.path, path);
    assert.equal(record?.datedAt, writtenBlock(readCatalog(path), TRANSPORT_API)?.refreshed_at);
    assert.equal(record?.datedAt, dated);
  });
});
