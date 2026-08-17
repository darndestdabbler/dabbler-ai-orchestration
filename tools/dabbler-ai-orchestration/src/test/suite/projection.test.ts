import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  ProjectionCache,
  ProjectionResult,
  parseProjectionPayload,
  projectAll,
  projectionCacheKey,
} from "../../utils/projection";
import { makeProjection, makeTempDir, rmrf } from "./helpers";

suite("projection: payload narrowing", () => {
  test("a valid payload round-trips with sessions and steps", () => {
    const payload = makeProjection({
      sessions: [
        {
          number: 1,
          title: "S1",
          status: "in-progress",
          iconKey: "in-progress",
          inFlight: true,
          startedAt: "2026-08-17T09:00:00-04:00",
          completedAt: null,
          verificationVerdict: null,
          steps: [
            {
              position: 0,
              stepNumber: 1,
              stepKey: "implement",
              description: "do it",
              status: "in-progress",
              state: "in progress",
              box: "[~]",
              iconKey: "in-progress",
              isPlanned: true,
              isActive: false,
              startedAt: null,
            },
          ],
        },
      ],
    });
    const parsed = parseProjectionPayload(JSON.stringify(payload));
    assert.ok(parsed);
    assert.strictEqual(parsed!.set.slug, "001-fixture-set");
    assert.strictEqual(parsed!.sessions[0].steps[0].stepKey, "implement");
  });

  test("non-JSON fails closed to null", () => {
    assert.strictEqual(parseProjectionPayload("Traceback (most recent call)"), null);
  });

  test("a missing set block fails closed", () => {
    assert.strictEqual(parseProjectionPayload(JSON.stringify({ sessions: [] })), null);
  });

  test("a foreign set status fails closed rather than rendering as truth", () => {
    const p = makeProjection();
    (p.set as { status: string }).status = "archived";
    assert.strictEqual(parseProjectionPayload(JSON.stringify(p)), null);
  });

  test("extra fields are tolerated — the schema is additive", () => {
    const p = makeProjection() as unknown as Record<string, unknown>;
    p.futureField = { anything: true };
    (p.set as Record<string, unknown>).futureFlag = 1;
    assert.ok(parseProjectionPayload(JSON.stringify(p)));
  });

  test("a malformed session entry is dropped, not invented", () => {
    const p = makeProjection() as unknown as { sessions: unknown[] };
    p.sessions.push({ number: "three", status: "complete" });
    const parsed = parseProjectionPayload(JSON.stringify(p));
    assert.strictEqual(parsed!.sessions.length, 2);
  });

  test("an unknown session iconKey degrades to not-started", () => {
    const p = makeProjection();
    (p.sessions[0] as { iconKey: string }).iconKey = "sparkles";
    const parsed = parseProjectionPayload(JSON.stringify(p));
    assert.strictEqual(parsed!.sessions[0].iconKey, "not-started");
  });

  test("preCancelStatus and orchestrator survive the narrowing", () => {
    const p = makeProjection({
      set: {
        status: "cancelled",
        iconKey: "cancelled",
        preCancelStatus: "in-progress",
        orchestrator: { engine: "claude", provider: "anthropic" },
      },
    });
    const parsed = parseProjectionPayload(JSON.stringify(p));
    assert.strictEqual(parsed!.set.preCancelStatus, "in-progress");
    assert.strictEqual(parsed!.set.orchestrator?.engine, "claude");
  });
});

suite("projection: cache", () => {
  let dir: string;
  setup(() => {
    dir = makeTempDir("dabbler-proj-");
    fs.writeFileSync(path.join(dir, "session-state.json"), "{}");
  });
  teardown(() => rmrf(dir));

  function countingRunner(): { runner: () => Promise<ProjectionResult>; calls: () => number } {
    let calls = 0;
    return {
      runner: async () => {
        calls += 1;
        return { payload: makeProjection(), error: null };
      },
      calls: () => calls,
    };
  }

  test("an unchanged set is served from cache", async () => {
    const { runner, calls } = countingRunner();
    const cache = new ProjectionCache(runner);
    await cache.get("python", dir, dir);
    await cache.get("python", dir, dir);
    assert.strictEqual(calls(), 1);
  });

  test("touching a derivation input re-projects", async () => {
    const { runner, calls } = countingRunner();
    const cache = new ProjectionCache(runner);
    await cache.get("python", dir, dir);
    const state = path.join(dir, "session-state.json");
    fs.writeFileSync(state, "{\"changed\": true}");
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(state, future, future);
    await cache.get("python", dir, dir);
    assert.strictEqual(calls(), 2);
  });

  test("a failed projection is cached until the set changes or a hard clear", async () => {
    let calls = 0;
    const cache = new ProjectionCache(async () => {
      calls += 1;
      return { payload: null, error: "boom" };
    });
    await cache.get("python", dir, dir);
    await cache.get("python", dir, dir);
    assert.strictEqual(calls, 1);
    cache.clear();
    await cache.get("python", dir, dir);
    assert.strictEqual(calls, 2);
  });

  test("the cache key covers every derivation input file", () => {
    const before = projectionCacheKey(dir);
    fs.writeFileSync(path.join(dir, "CANCELLED.md"), "cancelled");
    const after = projectionCacheKey(dir);
    assert.notStrictEqual(before, after);
  });
});

suite("projection: projectAll", () => {
  test("projects every set and keys results by directory", async () => {
    const seen: string[] = [];
    const cache = new ProjectionCache(async (_py, setDir) => {
      seen.push(setDir);
      return { payload: makeProjection(), error: null };
    });
    const dirs = ["a", "b", "c", "d"].map((n) => path.join("D:", "ws", n));
    const out = await projectAll(cache, "python", dirs, "D:\\ws", 2);
    assert.strictEqual(out.size, 4);
    assert.deepStrictEqual([...seen].sort(), [...dirs].sort());
  });

  test("an empty set list resolves without spawning workers", async () => {
    const cache = new ProjectionCache(async () => {
      throw new Error("must not run");
    });
    const out = await projectAll(cache, "python", [], "D:\\ws");
    assert.strictEqual(out.size, 0);
  });
});
