import * as assert from "assert";
import { taskRecordInputs } from "../../utils/projection";

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
