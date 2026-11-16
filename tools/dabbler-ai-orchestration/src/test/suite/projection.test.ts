import * as assert from "assert";
import * as path from "path";
import { ProjectionCache, RUNS_REL, projectionCacheKey, taskRecordInputs } from "../../utils/projection";
import type { ProjectionResult } from "../../utils/projection";

const slash = (f: string): string => f.replace(/\\/g, "/");

suite("projection: taskRecordInputs", () => {
  test("covers the named run's five records, driver/run.json and driver/plan.json among them", () => {
    // The pulled-session pair: buildTaskRows' six lifecycle rows read
    // run.json, and the Work row's own nested steps read plan.json (steps)
    // and run.json again (which are accepted). A cache key blind to either
    // would serve the stale payload back to the watcher tick that fired.
    const inputs = taskRecordInputs("/repo", 3, () => ["s3", "s10"]).map(slash);
    assert.strictEqual(inputs.length, 5);
    assert.ok(inputs.every((f) => f.includes("runs/s3/")), "read a run other than the one named");
    for (const tail of ["driver/run.json", "driver/plan.json", "step-execution.jsonl", "rounds.jsonl"]) {
      assert.ok(inputs.some((f) => f.endsWith(`runs/s3/${tail}`)), `missing ${tail}`);
    }
  });

  test("with no current run it reads the highest-numbered one", () => {
    const inputs = taskRecordInputs("/repo", null, () => ["s3", "not-a-session", "s10", "s9"]).map(slash);
    assert.strictEqual(inputs.length, 5);
    assert.ok(inputs.every((f) => f.includes("runs/s10/")));
  });

  test("nothing under .dabbler/runs yields no inputs", () => {
    assert.deepStrictEqual(taskRecordInputs("/repo", null, () => []), []);
  });
});

suite("projection: projectionCacheKey", () => {
  const runs = (n: number): string[] => Array.from({ length: n }, (_, i) => `s${i + 1}`);

  test("stats the same number of files for three runs as for three hundred", () => {
    const count = (n: number, session: number | null): number => {
      let stats = 0;
      projectionCacheKey("/repo/docs/sessions", "/repo", session, () => {
        stats += 1;
        return 1;
      }, () => runs(n));
      return stats;
    };
    assert.strictEqual(count(3, null), count(300, null));
    assert.strictEqual(count(3, 2), count(300, 200));
  });

  test("moves when the current run's driver/run.json moves", () => {
    let runMtime = 1;
    const key = (): string =>
      projectionCacheKey("/repo/docs/sessions", "/repo", 2, (f) =>
        slash(f).endsWith("runs/s2/driver/run.json") ? runMtime : 1,
      () => runs(3));
    const before = key();
    runMtime = 2;
    assert.notStrictEqual(key(), before);
  });

  test("moves when a run directory is added", () => {
    // The runs directory's own mtime moves when an entry is added, and the
    // current run named does not change: only that mtime can move the key.
    const runsDir = path.join("/repo", RUNS_REL);
    let dirMtime = 1;
    const key = (): string =>
      projectionCacheKey("/repo/docs/sessions", "/repo", 2, (f) => (f === runsDir ? dirMtime : 1),
      () => runs(3));
    const before = key();
    dirMtime = 2;
    assert.notStrictEqual(key(), before);
  });
});

suite("projection: ProjectionCache", () => {
  test("a failed projection then a good one under an unchanged key renders the good one", async () => {
    // Nothing on disk moves between the two calls (the key is built from
    // files that do not exist, so it is the same string both times); only
    // the runner's answer changes. The failure must not be what the second
    // call serves: the router is in-process, a retry costs a read, and a
    // cached failure would hold the degraded row until some other record
    // moved the key.
    const answers: ProjectionResult[] = [
      { payload: null, error: "the record could not be read" },
      { payload: { sessions: [] } as never, error: null },
    ];
    let calls = 0;
    const cache = new ProjectionCache(async () => {
      calls += 1;
      return answers[Math.min(calls, answers.length) - 1];
    });
    const first = await cache.get("/nowhere/docs/sessions", "/nowhere");
    assert.strictEqual(first.payload, null);
    const second = await cache.get("/nowhere/docs/sessions", "/nowhere");
    assert.ok(second.payload, "the good projection was not served");
    assert.strictEqual(calls, 2);
    // And the good one IS kept: a third call under the same key is served
    // from the cache, not re-derived.
    await cache.get("/nowhere/docs/sessions", "/nowhere");
    assert.strictEqual(calls, 2);
  });
});
