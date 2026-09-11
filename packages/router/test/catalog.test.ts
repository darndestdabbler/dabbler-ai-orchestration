// The one user-level catalog: where it lives, what it may be believed for,
// and what happens to a model the transport stops listing.
//
// Nothing here reaches a network or a seat. The catalog is a file and a set
// of rules about reading it, and both are exercised on a real file under the
// suite's own temp root -- the path resolver included, because the record
// this replaces was written into an install directory that the next update
// overwrote.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  CATALOG_DIR_NAME,
  CATALOG_FILENAME,
  PLATFORM_COPILOT_USAGE,
  SOURCE_API,
  SOURCE_SEAT,
  TRANSPORT_API,
  TRANSPORT_SEAT,
  type CatalogModel,
  type TransportBlock,
  blockFor,
  catalogPath,
  foldListing,
  readCatalog,
  writeBlock,
} from "../src/catalog.ts";
import { PROVIDER_SOURCE_ENUMERATION, apiCatalogBlock } from "../src/discovery.ts";
import { seatCatalogBlock, seatModel } from "../src/transports/copilot.ts";
import { tempDir } from "./support/answers.ts";

const SEAT_SCOPE = { seat_id: "op-personal", cli_version: "GitHub Copilot CLI 1.0.83." };
const API_SCOPE = { providers: ["anthropic", "google", "openai"] };

function model(id: string, overrides: Partial<CatalogModel> = {}): CatalogModel {
  return {
    id,
    provider: "anthropic",
    provider_source: "name-prefix-heuristic",
    display_name: id,
    enabled: true,
    price_category: null,
    cost: null,
    listed_at: "2026-09-11T00:00:00Z",
    ...overrides,
  };
}

function block(overrides: Partial<TransportBlock> = {}): TransportBlock {
  return {
    refreshed_at: "2026-09-11T00:00:00Z",
    source: SOURCE_SEAT,
    scope: SEAT_SCOPE,
    models: [model("claude-sonnet-5")],
    retired: [],
    ...overrides,
  };
}

describe("the catalog on this machine", () => {
  it("refreshes one transport's block and leaves the other standing", () => {
    // The path resolver is what is under test alongside the write: a machine
    // told where its own data root is must not be handed somebody else's.
    const home = tempDir("catalog-");
    const windows = catalogPath({ LOCALAPPDATA: home }, "win32", "/unused");
    assert.equal(windows, join(home, CATALOG_DIR_NAME, CATALOG_FILENAME));
    assert.equal(
      catalogPath({ XDG_DATA_HOME: home }, "linux", "/unused"),
      join(home, CATALOG_DIR_NAME, CATALOG_FILENAME),
    );

    // Day zero on a machine that has never refreshed: not read yet, and not
    // an error, because the read that fixes it is free and one step away.
    assert.equal(readCatalog(windows), null);

    writeBlock(TRANSPORT_API, block({ source: SOURCE_API, scope: API_SCOPE }), {
      path: windows,
      at: "2026-09-11T01:00:00Z",
    });
    // A machine with a seat and no provider keys refreshes the seat only.
    writeBlock(
      TRANSPORT_SEAT,
      block({ models: [model("claude-haiku-4.5")], refreshed_at: "2026-09-11T02:00:00Z" }),
      { path: windows, at: "2026-09-11T02:00:00Z" },
    );

    const catalog = readCatalog(windows);
    assert.deepEqual(Object.keys(catalog?.transports ?? {}).sort(), [TRANSPORT_API, TRANSPORT_SEAT]);
    const api = catalog?.transports[TRANSPORT_API];
    assert.equal(api?.source, SOURCE_API);
    assert.deepEqual(api?.models.map((entry) => entry.id), ["claude-sonnet-5"]);
    assert.equal(api?.refreshed_at, "2026-09-11T00:00:00Z");
    assert.deepEqual(
      catalog?.transports[TRANSPORT_SEAT]?.models.map((entry) => entry.id),
      ["claude-haiku-4.5"],
    );
    assert.match(readFileSync(windows, "utf8"), /"schema_version": 1/);
  });

  it("treats a block read for another machine as unread rather than believed", () => {
    const path = catalogPath({ LOCALAPPDATA: tempDir("catalog-") }, "win32", "/unused");
    writeBlock(TRANSPORT_SEAT, block(), { path });
    const catalog = readCatalog(path);

    assert.deepEqual(blockFor(catalog, TRANSPORT_SEAT, SEAT_SCOPE)?.scope, SEAT_SCOPE);
    // Key order is not a difference between two machines.
    assert.notEqual(
      blockFor(catalog, TRANSPORT_SEAT, {
        cli_version: SEAT_SCOPE.cli_version,
        seat_id: SEAT_SCOPE.seat_id,
      }),
      null,
    );
    // A different seat, and a seat on a CLI that has since moved, are both
    // scopes this reading says nothing about. This is the guard the shipped
    // `op-personal` catalog would have failed on every other machine.
    assert.equal(blockFor(catalog, TRANSPORT_SEAT, { ...SEAT_SCOPE, seat_id: "someone-else" }), null);
    assert.equal(blockFor(catalog, TRANSPORT_SEAT, { ...SEAT_SCOPE, cli_version: "1.0.84" }), null);
    assert.equal(blockFor(catalog, TRANSPORT_API, API_SCOPE), null);
    assert.equal(blockFor(null, TRANSPORT_SEAT, SEAT_SCOPE), null);
  });

  it("moves a model the transport stopped listing into an id and a date", () => {
    const before = block({
      models: [
        model("claude-sonnet-5", { listed_at: "2026-09-01T00:00:00Z" }),
        model("claude-sonnet-4.6"),
      ],
      retired: [{ id: "gpt-5.3", retired_at: "2026-08-01T00:00:00Z" }],
    });

    const folded = foldListing(
      before,
      [
        model("claude-sonnet-5", { listed_at: "2026-09-11T03:00:00Z" }),
        model("gpt-5.3", { provider: "openai", listed_at: "2026-09-11T03:00:00Z" }),
      ],
      "2026-09-11T03:00:00Z",
    );

    // Still listed: the date it was first seen survives the refresh.
    assert.deepEqual(folded.models.map((entry) => [entry.id, entry.listed_at]), [
      ["claude-sonnet-5", "2026-09-01T00:00:00Z"],
      // Listed again, so it is a listed model and no longer an archived id.
      ["gpt-5.3", "2026-09-11T03:00:00Z"],
    ]);
    // An id and a date and nothing else: nothing in here can go stale,
    // because nothing in here is a claim about a model still being served.
    assert.deepEqual(folded.retired, [
      { id: "claude-sonnet-4.6", retired_at: "2026-09-11T03:00:00Z" },
    ]);
  });

  it("records the cost and the price category a source stated, and invents neither where it did not", () => {
    const seat = seatCatalogBlock(
      {
        known: true,
        models: [
          seatModel({
            modelId: "claude-haiku-4.5",
            name: "Claude Haiku 4.5",
            _meta: {
              copilotUsage: "0.33x",
              copilotEnablement: "enabled",
              // Read for free on every enumeration, and dropped on the floor
              // before this session: the one ordinal a recommendation could
              // honestly be built from.
              copilotPriceCategory: "low",
            },
          }),
          // The seat's own router alias states nothing, so it is not a model
          // this catalog can say anything about.
          seatModel({ modelId: "auto", name: "Auto" }),
        ],
        current_model_id: "claude-haiku-4.5",
        modes: [],
        reasoning_efforts: [],
        cli_version: "1.0.83",
        read_at: "2026-09-11T00:00:00Z",
        source: SOURCE_SEAT,
        reason: null,
      },
      null,
      { host: "https://github.com", login: "someone" },
    );

    assert.deepEqual(
      seat?.models.map((entry) => [entry.id, entry.price_category, entry.cost]),
      [
        [
          "claude-haiku-4.5",
          "low",
          // The number never travels without the unit it was stated in and
          // the platform that bills it: a bare multiplier has been read as
          // premium requests by four engines in a row.
          { usage_multiplier: 0.33, stated_as: "0.33x", platform: PLATFORM_COPILOT_USAGE },
        ],
      ],
    );
    assert.deepEqual(seat?.scope, {
      seat_host: "https://github.com",
      seat_login: "someone",
      cli_version: "1.0.83",
    });

    // No vendor states either in the metadata this enumeration reads, so the
    // API block carries nulls rather than a figure nobody gave.
    const api = apiCatalogBlock(
      [
        {
          provider: "anthropic",
          entries: [
            {
              id: "claude-fable-5-1",
              provider: "anthropic",
              provider_source: PROVIDER_SOURCE_ENUMERATION,
              display_name: "Claude Fable 5.1",
              created_at: null,
              max_context_tokens: null,
              max_output_tokens: null,
              capabilities: [],
              enumerated_at: "2026-09-11T00:00:00Z",
              retired_at: null,
              raw: {},
            },
          ],
          error: null,
        },
      ],
      null,
      "2026-09-11T00:00:00Z",
    );
    assert.deepEqual(
      api?.models.map((entry) => [entry.id, entry.price_category, entry.cost]),
      [["claude-fable-5-1", null, null]],
    );
    assert.deepEqual(api?.scope, { providers: ["anthropic"] });
  });
});
