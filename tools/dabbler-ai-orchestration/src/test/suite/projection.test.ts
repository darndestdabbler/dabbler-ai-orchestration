import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  ProjectionCache,
  ProjectionResult,
  projectionCacheKey,
} from "../../utils/projection";
import { parseProjectionPayload } from "../../router/projectionPayload";
import {
  makeProjection,
  makeSession,
  makeTempDir,
  makeVerification,
  rmrf,
} from "./helpers";

suite("projection: payload narrowing", () => {
  test("a valid payload round-trips with sessions and steps", () => {
    const payload = makeProjection({
      sessions: [
        {
          number: 1,
          displayNumber: "001",
          title: "S1",
          status: "in-progress",
          iconKey: "in-progress",
          inFlight: true,
          startedAt: "2026-08-17T09:00:00-04:00",
          completedAt: null,
          verificationVerdict: null,
          tasks: [
            {
              position: 0,
              stepId: "implement",
              intent: "Do it.",
              state: "in flight",
              iconKey: "in-progress",
              isOpen: true,
              startedAt: null,
            },
          ],
          tasksRefused: null,
          verification: null,
          verificationRefused: null,
        },
      ],
    });
    const parsed = parseProjectionPayload(JSON.stringify(payload));
    assert.ok(parsed);
    assert.strictEqual(parsed!.repository.totalSessions, 2);
    assert.strictEqual(parsed!.sessions[0].tasks[0].stepId, "implement");
  });

  test("the verification view round-trips, and `clean` fails closed", () => {
    const view = makeVerification({
      agency: {
        ...makeVerification().agency,
        mode: "tools",
        reads: 2,
        transformedReads: 1,
        operations: [
          { kind: "read", target: "ai_router/checks.py", fidelity: "transformed", inScope: true },
        ],
      },
    });
    const p = makeProjection({
      sessions: [makeSession({ number: 1, verification: view })],
    });
    const parsed = parseProjectionPayload(JSON.stringify(p))!;
    assert.deepStrictEqual(parsed.sessions[0].verification, view);

    // A router that never said "clean" has not said the session is
    // verified: the missing field narrows to unclean, so a stopped
    // session cannot read as a pass through an older payload.
    const raw = JSON.parse(JSON.stringify(p)) as {
      sessions: Array<{ verification: Record<string, unknown> }>;
    };
    delete raw.sessions[0].verification.clean;
    assert.strictEqual(
      parseProjectionPayload(JSON.stringify(raw))!.sessions[0].verification!.clean,
      false,
    );
    // And a view with no headline is no view at all.
    delete raw.sessions[0].verification.headline;
    assert.strictEqual(
      parseProjectionPayload(JSON.stringify(raw))!.sessions[0].verification,
      null,
    );
  });

  test("the sessions source is carried, and defaults to the ledger", () => {
    // Only a projection that SAYS "plan" unlocks the never-run copy. A
    // router too old to send the field has a ledger by construction, so
    // the default must not announce a fresh repository.
    const planned = parseProjectionPayload(
      JSON.stringify(makeProjection({ repository: { sessionsSource: "plan" } })),
    );
    assert.strictEqual(planned!.repository.sessionsSource, "plan");

    const older = JSON.parse(JSON.stringify(makeProjection())) as Record<
      string,
      Record<string, unknown>
    >;
    delete older.repository.sessionsSource;
    assert.strictEqual(
      parseProjectionPayload(JSON.stringify(older))!.repository.sessionsSource,
      "ledger",
    );
  });

  test("non-JSON fails closed to null", () => {
    assert.strictEqual(parseProjectionPayload("Traceback (most recent call)"), null);
  });

  test("a missing repository block fails closed", () => {
    assert.strictEqual(parseProjectionPayload(JSON.stringify({ sessions: [] })), null);
  });

  test("a missing sessions list fails closed rather than reading as empty", () => {
    // An empty tree and a payload that never mentioned sessions are
    // different claims, and only one of them is a repository with no work.
    const p = makeProjection() as unknown as Record<string, unknown>;
    delete p.sessions;
    assert.strictEqual(parseProjectionPayload(JSON.stringify(p)), null);
  });

  test("extra fields are tolerated — the schema is additive", () => {
    const p = makeProjection() as unknown as Record<string, unknown>;
    p.futureField = { anything: true };
    (p.repository as Record<string, unknown>).futureFlag = 1;
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

  test("the orchestrator block survives the narrowing", () => {
    const p = makeProjection({
      repository: { orchestrator: { engine: "claude-code", provider: "anthropic" } },
    });
    const parsed = parseProjectionPayload(JSON.stringify(p));
    assert.strictEqual(parsed!.repository.orchestrator?.engine, "claude-code");
  });
});

suite("projection: cache", () => {
  let dir: string;
  setup(() => {
    dir = makeTempDir("dabbler-proj-");
    fs.writeFileSync(path.join(dir, "sessions.json"), "{}");
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

  test("an unchanged repository is served from cache", async () => {
    const { runner, calls } = countingRunner();
    const cache = new ProjectionCache(runner);
    await cache.get(dir, dir);
    await cache.get(dir, dir);
    assert.strictEqual(calls(), 1);
  });

  test("touching a derivation input re-projects", async () => {
    const { runner, calls } = countingRunner();
    const cache = new ProjectionCache(runner);
    await cache.get(dir, dir);
    const ledger = path.join(dir, "sessions.json");
    fs.writeFileSync(ledger, '{"changed": true}');
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(ledger, future, future);
    await cache.get(dir, dir);
    assert.strictEqual(calls(), 2);
  });

  test("a failed projection is cached until the ledger changes or a hard clear", async () => {
    let calls = 0;
    const cache = new ProjectionCache(async () => {
      calls += 1;
      return { payload: null, error: "boom" };
    });
    await cache.get(dir, dir);
    await cache.get(dir, dir);
    assert.strictEqual(calls, 1);
    cache.clear();
    await cache.get(dir, dir);
    assert.strictEqual(calls, 2);
  });

  test("the cache key covers every derivation input file", () => {
    const before = projectionCacheKey(dir, dir);
    fs.writeFileSync(path.join(dir, "session-plan.md"), "# plan");
    assert.notStrictEqual(before, projectionCacheKey(dir, dir));
  });

  test("the cache key moves when a step opens, so a watcher tick re-projects", () => {
    // The execution record lives under the repository root, not the
    // sessions root. A key blind to it would hand the watcher back the
    // very payload the step's opening invalidated.
    const runDir = path.join(dir, ".dabbler", "runs", "s3");
    fs.mkdirSync(runDir, { recursive: true });
    const before = projectionCacheKey(dir, dir);
    fs.writeFileSync(path.join(runDir, "step-execution.jsonl"), "{}");
    assert.notStrictEqual(before, projectionCacheKey(dir, dir));
  });

  test("the cache key moves when a round lands, so the verification row is not a poll behind", () => {
    const runDir = path.join(dir, ".dabbler", "runs", "s3");
    fs.mkdirSync(runDir, { recursive: true });
    const before = projectionCacheKey(dir, dir);
    fs.writeFileSync(path.join(runDir, "rounds.jsonl"), "{}");
    assert.notStrictEqual(before, projectionCacheKey(dir, dir));
  });
});
