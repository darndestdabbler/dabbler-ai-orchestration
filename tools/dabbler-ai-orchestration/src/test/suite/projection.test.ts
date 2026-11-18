import * as assert from "assert";
import { ProjectionCache, projectionCacheKey } from "../../utils/projection";
import type { ProjectionResult } from "../../utils/projection";

const slash = (f: string): string => f.replace(/\\/g, "/");

suite("projection: projectionCacheKey", () => {
  test("moves when the current run's driver/run.json moves", () => {
    let runMtime = 1;
    const key = (): string =>
      projectionCacheKey("/repo", 2, (f) => (slash(f).endsWith("runs/s2/driver/run.json") ? runMtime : 1));
    const before = key();
    runMtime = 2;
    assert.notStrictEqual(key(), before);
  });

  test("moves when a run directory is added", () => {
    // The runs directory's own mtime moves when an entry is added, and the
    // current run named does not change: only that mtime can move the key.
    let dirMtime = 1;
    const key = (): string =>
      projectionCacheKey("/repo", 2, (f) => (slash(f).endsWith("/.dabbler/runs") ? dirMtime : 1));
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
