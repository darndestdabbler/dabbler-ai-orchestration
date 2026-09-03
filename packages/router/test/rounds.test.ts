// The round's own rules: which findings block, when no further round may
// open, and what the run of record asks for. Rows in a temp directory.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { appendDispute } from "../src/ledger.ts";
import {
  NO_ROUND_CAP_CLEAN,
  NO_ROUND_CAP_DISPUTED,
  NO_ROUND_TERMINAL,
  blockingFindings,
  noRoundReason,
  runOfRecordLines,
} from "../src/verify/rounds.ts";
import { tempDir } from "./support/answers.ts";

const finding = (blocking: boolean) => ({ severity: blocking ? "major" : "minor", description: "d", blocking });

describe("which findings block", () => {
  it("counts every finding not marked non-blocking, and none of an empty or absent list", () => {
    assert.equal(blockingFindings({ findings: [finding(true), finding(false), { description: "unmarked" }] }).length, 2);
    assert.deepEqual(blockingFindings({}), []);
  });
});

describe("whether another round may open", () => {
  const round = (n: number, blocking: boolean, extra: Record<string, unknown> = {}) => ({ round: n, blocking, findings: blocking ? [finding(true)] : [], ...extra });

  it("opens the first round and any round under the cap", () => {
    assert.equal(noRoundReason(tempDir(), 1, [], 3), null);
    assert.equal(noRoundReason(tempDir(), 1, [round(1, true)], 3), null);
  });

  it("stops at a terminal row, and at the cap when the last round left nothing blocking", () => {
    assert.equal(noRoundReason(tempDir(), 1, [round(1, true), { round: 2, type: "adjudication", blocking: false }], 3), NO_ROUND_TERMINAL);
    assert.equal(noRoundReason(tempDir(), 1, [round(1, true), round(2, true), round(3, false)], 3), NO_ROUND_CAP_CLEAN);
  });

  it("at the cap with blocking findings, terminates when they were fixed and adjudicates when every one is disputed", () => {
    const rows = [round(1, true), round(2, true), round(3, true)];
    assert.equal(noRoundReason(tempDir(), 1, rows, 3), null);
    const repo = tempDir();
    appendDispute(repo, 1, { round: 3, finding_index: 0, filed_after_round: 3, grounds: "wrong", evidence_paths: ["a.py"], recorded_at: "2026-01-01T00:00:00+00:00" });
    assert.equal(noRoundReason(repo, 1, rows, 3), NO_ROUND_CAP_DISPUTED);
  });
});

describe("what stands between a verified tree and a close", () => {
  it("names the declared suite's run of record, and only the push when no expensive suite is declared", async () => {
    const generic = await runOfRecordLines("docs/sessions", { testing: {} } as never);
    assert.match(generic, /The run of record and the push remain before `dabbler session close`/);
    const named = await runOfRecordLines("docs/sessions", { testing: { suites: [{ name: "unit", command: "npm test", expensive: true, covers: ["."] }] } } as never);
    assert.ok(named.includes("npm test") && named.includes("unit"));
  });
});
