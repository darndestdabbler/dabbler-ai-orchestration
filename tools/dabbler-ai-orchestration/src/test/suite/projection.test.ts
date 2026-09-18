import * as assert from "assert";
import { ProjectionCache, taskRecordInputs } from "../../utils/projection";
import type { ProjectionResult } from "../../utils/projection";

suite("projection: taskRecordInputs", () => {
  test("covers driver/run.json and driver/plan.json for every session entry", () => {
    // The pulled-session pair: buildTaskRows' six lifecycle rows read
    // run.json, and the Work row's own nested steps read plan.json (steps)
    // and run.json again (which are accepted). The extension's watcher
    // fires on both (extension.ts), and a cache key blind to either would
    // serve the stale payload back to that watcher tick -- which is exactly
    // what left a step's row showing stale state until the cache aged out
    // on its own.
    const inputs = taskRecordInputs("/repo", () => ["s3", "not-a-session", "s10"]);
    for (const session of ["s3", "s10"]) {
      assert.ok(
        inputs.some((f) => f.replace(/\\/g, "/").endsWith(`runs/${session}/driver/run.json`)),
        `missing driver/run.json for ${session}`,
      );
      assert.ok(
        inputs.some((f) => f.replace(/\\/g, "/").endsWith(`runs/${session}/driver/plan.json`)),
        `missing driver/plan.json for ${session}`,
      );
      assert.ok(
        inputs.some((f) => f.replace(/\\/g, "/").endsWith(`runs/${session}/step-execution.jsonl`)),
        `missing step-execution.jsonl for ${session}`,
      );
    }
    // A non-session directory entry (does not match /^s\d+$/) contributes nothing.
    assert.ok(!inputs.some((f) => f.includes("not-a-session")));
  });

  test("nothing under .dabbler/runs yields no inputs", () => {
    assert.deepStrictEqual(
      taskRecordInputs("/repo", () => []),
      [],
    );
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
