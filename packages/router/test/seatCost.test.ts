import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  STATUS_FLOOR,
  STATUS_MEASURED,
  STATUS_UNMEASURED,
  measureConversations,
  resolveStorePath,
  usd,
} from "../src/seatCost.ts";
import { makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

// The same fetch the module under test uses, and for the same reason: a
// static `node:sqlite` import is a specifier several tools resolve by dropping
// the prefix and hunting for a package called `sqlite`.
const { DatabaseSync } = process.getBuiltinModule("node:sqlite")!;

/** A minimal seat store shaped like the CLI's `session-store.db`. */
function store(options: { version?: number } = {}): string {
  const path = join(makeTempDir(), "session-store.db");
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE schema_version (version INTEGER)");
  db.exec(`INSERT INTO schema_version VALUES (${options.version ?? 6})`);
  db.exec(
    "CREATE TABLE assistant_usage_events (session_id TEXT, total_nano_aiu INTEGER)",
  );
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

describe("pricing conversation ids against the seat's own store", () => {
  it("measures an exact number when every id is present", () => {
    const result = measureConversations(["conv-a"], { storePath: store() });
    expect(result.status).toBe(STATUS_MEASURED);
    expect(result.credits).toBeCloseTo(1.5, 10);
    expect(usd(result)).toBeCloseTo(0.015, 10);
    expect(result.event_count).toBe(2);
  });

  it("reads a known conversation with no usage rows as a genuine zero", () => {
    const result = measureConversations(["conv-b"], { storePath: store() });
    expect(result.status).toBe(STATUS_MEASURED);
    expect(result.credits).toBe(0.0);
  });

  it("calls a measurement missing an id a floor, not a total", () => {
    const result = measureConversations(["conv-a", "conv-nope"], {
      storePath: store(),
    });
    expect(result.status).toBe(STATUS_FLOOR);
    expect(result.credits).toBeCloseTo(1.5, 10);
    expect(result.missing_session_ids).toEqual(["conv-nope"]);
  });

  it("calls measuring its own live conversation a floor", () => {
    // A session cannot measure itself: its closing turns are not in the store
    // yet, so the number is real and incomplete.
    const result = measureConversations(["conv-a"], {
      storePath: store(),
      env: { COPILOT_AGENT_SESSION_ID: "conv-a" },
    });
    expect(result.status).toBe(STATUS_FLOOR);
    expect(result.reason).toContain("own live conversation");
  });

  it("reports no store as unmeasured rather than as zero", () => {
    // An absent measurement is never 0.0; that distinction is the point.
    const result = measureConversations(["conv-a"], {
      storePath: join(makeTempDir(), "absent.db"),
    });
    expect(result.status).toBe(STATUS_UNMEASURED);
    expect(result.credits).toBeNull();
    expect(usd(result)).toBeNull();
  });

  it("refuses a schema version it has not been verified against", () => {
    // The columns belong to a private store and can change without notice.
    const result = measureConversations(["conv-a"], {
      storePath: store({ version: 99 }),
    });
    expect(result.status).toBe(STATUS_UNMEASURED);
    expect(result.reason).toContain("schema_version 99");
    expect(result.reason).toContain("(6,)");
  });

  it("reports unmeasured when the store knows none of the requested ids", () => {
    const result = measureConversations(["conv-x"], { storePath: store() });
    expect(result.status).toBe(STATUS_UNMEASURED);
    expect(result.credits).toBeNull();
  });

  it("de-duplicates and trims the ids it was handed", () => {
    const result = measureConversations([" conv-a ", "conv-a", "", null], {
      storePath: store(),
    });
    expect(result.session_ids).toEqual(["conv-a"]);
    expect(result.status).toBe(STATUS_MEASURED);
  });

  it("has nothing to say when handed no ids at all", () => {
    const result = measureConversations([], { storePath: store() });
    expect(result.status).toBe(STATUS_UNMEASURED);
    expect(result.reason).toBe("no conversation ids to measure");
  });
});

describe("finding the store", () => {
  it("prefers an explicit path and resolves the default under home", () => {
    const explicit = store();
    expect(resolveStorePath(explicit)).toBe(explicit);
    // The default is `<home>/.copilot/session-store.db`, and a home with no
    // store resolves nothing rather than a path that is not there.
    expect(resolveStorePath(null, { home: makeTempDir() })).toBeNull();
  });
});
