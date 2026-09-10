// What a seat call cost: the arithmetic and the measured-set rule over what
// the store held, and the shape check that decides whether a number out of
// it may be trusted at all.
//
// The judgement is a function of the ids asked for and one reading, so most
// of this file hands it both. The reader itself is exercised against a small
// SQLite file shaped like the CLI's own store -- that one is a claim about a
// private schema, and only a real store can make it.
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  STATUS_FLOOR,
  STATUS_MEASURED,
  STATUS_UNMEASURED,
  checkStoreShape,
  judgeUsage,
  measureConversations,
  normalizeIds,
  readUsage,
  resolveStorePath,
  toDict,
  usd,
  type UsageReading,
} from "../src/seatCost.ts";
import { tempDir } from "./support/answers.ts";

// The same fetch the module under test uses, and for the same reason: a
// static `node:sqlite` import is a specifier several tools resolve by
// dropping the prefix and hunting for a package called `sqlite`.
const { DatabaseSync } = process.getBuiltinModule("node:sqlite")!;

/** A minimal seat store shaped like the CLI's `session-store.db`. */
function store(options: { version?: number } = {}): string {
  const path = join(tempDir("seat-"), "session-store.db");
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE schema_version (version INTEGER)");
  db.exec(`INSERT INTO schema_version VALUES (${options.version ?? 6})`);
  db.exec("CREATE TABLE assistant_usage_events (session_id TEXT, total_nano_aiu INTEGER)");
  db.exec("CREATE TABLE sessions (id TEXT PRIMARY KEY)");
  // conv-a: 1.5 credits over two events; conv-b: known with zero usage.
  db.exec(
    "INSERT INTO assistant_usage_events VALUES " +
      "('conv-a', 1000000000), ('conv-a', 500000000)",
  );
  db.exec("INSERT INTO sessions VALUES ('conv-a'), ('conv-b')");
  db.close();
  return path;
}

function reading(overrides: Partial<UsageReading> = {}): UsageReading {
  return {
    totalNano: 1_500_000_000,
    eventCount: 2,
    known: new Set(["conv-a"]),
    ...overrides,
  };
}

describe("the ids a measurement was asked for", () => {
  it("trims, de-duplicates and keeps the order first seen", () => {
    assert.deepEqual(normalizeIds([" conv-b ", "conv-a", "conv-b", "", null]), [
      "conv-b",
      "conv-a",
    ]);
    assert.deepEqual(normalizeIds(null), []);
    // A bare string is one id, not a sequence of characters.
    assert.deepEqual(normalizeIds("conv-a"), ["conv-a"]);
  });
});

describe("judging what the store held", () => {
  it("measures an exact number when every id is present", () => {
    const cost = judgeUsage(["conv-a"], reading());
    assert.equal(cost.status, STATUS_MEASURED);
    assert.equal(cost.credits, 1.5);
    assert.equal(usd(cost), 0.015);
    assert.equal(cost.event_count, 2);
  });

  it("reads a known conversation with no usage rows as a genuine zero", () => {
    // Present in the store and costing nothing is a measurement; absent is
    // not, and 0.0 must never stand in for "could not tell".
    const cost = judgeUsage(["conv-b"], {
      totalNano: 0,
      eventCount: 0,
      known: new Set(["conv-b"]),
    });
    assert.equal(cost.status, STATUS_MEASURED);
    assert.equal(cost.credits, 0);
  });

  it("calls a measurement missing an id a floor, not a total", () => {
    const cost = judgeUsage(["conv-a", "conv-nope"], reading());
    assert.equal(cost.status, STATUS_FLOOR);
    assert.equal(cost.credits, 1.5);
    assert.deepEqual(cost.missing_session_ids, ["conv-nope"]);
    assert.match(String(cost.reason), /1 of 2 conversation id\(s\) not in the store/);
  });

  it("calls measuring its own live conversation a floor", () => {
    // A session cannot measure itself: its closing turns are not in the
    // store yet, so the number is real and incomplete.
    const cost = judgeUsage(["conv-a"], reading(), { ownConversationId: "conv-a" });
    assert.equal(cost.status, STATUS_FLOOR);
    assert.match(String(cost.reason), /own live conversation/);
  });

  it("reports unmeasured when the store knows none of the requested ids", () => {
    const cost = judgeUsage(["conv-x"], reading({ known: new Set() }));
    assert.equal(cost.status, STATUS_UNMEASURED);
    assert.equal(cost.credits, null);
    assert.equal(usd(cost), null);
  });

  it("renders a measurement with the dollar figure derived, never stored", () => {
    assert.deepEqual(toDict(judgeUsage(["conv-a"], reading())), {
      status: STATUS_MEASURED,
      credits: 1.5,
      usd: 0.015,
      event_count: 2,
      session_ids: ["conv-a"],
      measured_session_ids: ["conv-a"],
      missing_session_ids: [],
      reason: null,
    });
  });
});

describe("looking at the store before trusting a number out of it", () => {
  it("accepts a store of a supported shape", () => {
    assert.deepEqual(checkStoreShape(store()), [true, null]);
  });

  it("refuses a schema version it has not been verified against", () => {
    // The columns belong to a private store and can change without notice.
    const [ok, reason] = checkStoreShape(store({ version: 99 }));
    assert.equal(ok, false);
    assert.match(String(reason), /schema_version 99/);
    assert.match(String(reason), /\(6,\)/);
  });

  it("refuses a store that is not there rather than pricing against nothing", () => {
    const [ok, reason] = checkStoreShape(null);
    assert.equal(ok, false);
    assert.equal(reason, "no local usage store found");
  });
});

describe("reading the store", () => {
  it("sums the usage rows and knows a conversation with none", () => {
    const held = readUsage(store(), ["conv-a", "conv-b", "conv-x"]);
    assert.equal(held.totalNano, 1_500_000_000);
    assert.equal(held.eventCount, 2);
    assert.deepEqual([...held.known].sort(), ["conv-a", "conv-b"]);
  });
});

describe("pricing conversation ids end to end", () => {
  it("measures against a real store", () => {
    const cost = measureConversations([" conv-a ", "conv-a"], { storePath: store() });
    assert.equal(cost.status, STATUS_MEASURED);
    assert.deepEqual(cost.session_ids, ["conv-a"]);
    assert.equal(cost.credits, 1.5);
  });

  it("reports no store as unmeasured rather than as zero", () => {
    // An absent measurement is never 0.0; that distinction is the point.
    const cost = measureConversations(["conv-a"], {
      storePath: join(tempDir("seat-"), "absent.db"),
    });
    assert.equal(cost.status, STATUS_UNMEASURED);
    assert.equal(cost.credits, null);
    assert.deepEqual(cost.missing_session_ids, ["conv-a"]);
  });

  it("has nothing to say when handed no ids at all", () => {
    const cost = measureConversations([], { storePath: store() });
    assert.equal(cost.status, STATUS_UNMEASURED);
    assert.equal(cost.reason, "no conversation ids to measure");
  });

  it("prefers an explicit store path and resolves the default under home", () => {
    const explicit = store();
    assert.equal(resolveStorePath(explicit), explicit);
    // The default is `<home>/.copilot/session-store.db`, and a home with no
    // store resolves nothing rather than a path that is not there.
    assert.equal(resolveStorePath(null, { home: tempDir("home-") }), null);
  });
});
