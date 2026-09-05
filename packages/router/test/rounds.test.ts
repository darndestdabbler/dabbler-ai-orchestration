// The round's own rules: which findings block, when no further round may
// open, and what the run of record asks for. Rows in a temp directory.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { appendDispute, appendRound, readRounds } from "../src/ledger.ts";
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

describe("what a round says it cost", () => {
  const base = {
    round: 1,
    verdict: "VERIFIED",
    blocking: false,
    findings: [],
    completion_tree: "a".repeat(40),
    recorded_at: "2026-09-05T12:00:00.000000-04:00",
  };

  it("carries what was asked for, what answered, and what it cost", () => {
    // The 364-request session charged a personal seat and its record could
    // say only which model answered: no requested id, no escalation
    // history, no turn count. Each of these was in the dispatch result and
    // was dropped at the append.
    const repo = tempDir();
    appendRound(repo, 7, {
      ...base,
      verifier_model: "gemini-3.5-flash",
      verifier_provider: "google",
      requested_model: "gemini-3.5-flash",
      served_model: null,
      escalation_history: [["gpt-5.4", "empty_response"]],
      input_tokens: 12000,
      output_tokens: 900,
      premium_requests: 14,
      tool_calls: 26,
    });
    const [row] = readRounds(repo, 7);
    assert.equal(row["requested_model"], "gemini-3.5-flash");
    // The provider said nothing, which is not the same as "it served what
    // was asked" and must stay distinguishable.
    assert.equal(row["served_model"], null);
    assert.deepEqual(row["escalation_history"], [["gpt-5.4", "empty_response"]]);
    assert.equal(row["premium_requests"], 14);
    // The multiplier a round count cannot show.
    assert.equal(row["tool_calls"], 26);
  });

  it("still reads a round from before it counted, and does not call its silence zero", () => {
    // A row without these is not a free round; it is a round from before
    // the framework counted, and reading absence as 0 would understate
    // exactly the sessions this record exists to explain.
    const repo = tempDir();
    appendRound(repo, 7, { ...base, verifier_model: "gpt-5.4", verifier_provider: "openai" });
    const [row] = readRounds(repo, 7);
    assert.equal(row["premium_requests"], undefined);
    assert.equal(row["tool_calls"], undefined);
    assert.equal(row["escalation_history"], undefined);
  });

  it("refuses a cost that is not a number, rather than storing whatever arrived", () => {
    const repo = tempDir();
    assert.throws(() =>
      appendRound(repo, 7, { ...base, premium_requests: "fourteen" }),
    );
  });
});

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
