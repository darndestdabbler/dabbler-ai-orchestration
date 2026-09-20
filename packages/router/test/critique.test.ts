// The critique subtree: machine-owned records under the run, validated at
// the write boundary, with a refused payload kept beside the subtree rather
// than dropped. Files in a temp directory; no git.
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

import {
  appendWorkerResult,
  quarantineDir,
  readReviewRuns,
  validateReviewRun,
  writeReviewRun,
} from "../src/critique.ts";
import { LedgerError } from "../src/ledger.ts";
import { tempDir } from "./support/answers.ts";

describe("the critique subtree", () => {
  it("validates a review run at the write boundary and refuses a shape the schema does not allow", () => {
    assert.throws(() => validateReviewRun({ schema_version: 1 }), LedgerError);
    assert.throws(() => validateReviewRun({ schema_version: 2, change_id: "abc1234", session_number: 1, attempts: [], opened_at: "2026-01-01T00:00:00+00:00" }), LedgerError);
  });

  it("keeps a refused payload beside the subtree rather than dropping it", () => {
    // A refusal with no way to see what was rejected is how a bad writer
    // gets blamed on a bad reader.
    const repo = tempDir();
    assert.throws(
      () => writeReviewRun(repo, 1, { schema_version: 1, change_id: "abc1234", session_number: 1, attempts: "not a list", opened_at: "2026-01-01T00:00:00+00:00" }),
      /quarantined at/,
    );
    assert.equal(existsSync(quarantineDir(repo, 1)), true);
    assert.ok(readdirSync(quarantineDir(repo, 1)).length > 0);
  });

  it("refuses a change-id that is not a derived digest, which is a path guard as much as a format one", () => {
    assert.throws(
      () => appendWorkerResult(tempDir(), 1, { schema_version: 1, change_id: "../escape", check_id: "c1", attempt: 1, result: "pass", recorded_at: "2026-01-01T00:00:00+00:00" }),
      LedgerError,
    );
  });

  it("reads no runs from a session that has no subtree", () => {
    assert.deepEqual(readReviewRuns(tempDir(), 1), []);
  });
});
