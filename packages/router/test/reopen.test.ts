// Buying rounds past a cap terminal: what a grant reaches, what it refuses
// to reach, and that it buys rounds rather than a verdict.
//
// The control these exist against is session 137, 2026-09-09: `verify` said
// close the session, the close's `verification_clean` gate said re-run
// `verify`, `close --force` could not help because that gate is evidence
// rather than bookkeeping, and `session plan amend --max-rounds` was
// accepted, recorded and inert. The first test below is that deadlock, and
// it is written as the loop rather than as one refusal, because either verb
// alone looked correct.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appendDispute,
  appendReopen,
  appendRound,
  readReopens,
  standingReopen,
} from "../src/ledger.ts";
import { amendRoundCap, writeRun } from "../src/driver.ts";
import {
  NO_ROUND_CAP_CLEAN,
  NO_ROUND_TERMINAL,
  noRoundReason,
  standingTerminal,
} from "../src/verify/rounds.ts";
import { classifyStuck } from "../src/verify/reopen.ts";
import { gitAnswers, tempDir } from "./support/answers.ts";

gitAnswers([[(args) => args[0] === "cat-file" && args[1] === "-e", { code: 128 }]]);

/** A terminal row of the kind a spent cap writes. */
const cappedAt = (n: number) => ({
  round: n,
  type: "remediated_at_cap",
  verdict: "REMEDIATED_AT_CAP",
  blocking: false,
  findings: [],
  previous_tree: "b".repeat(40),
  completion_tree: "a".repeat(40),
  recorded_at: "2026-09-09T06:37:01.264000-04:00",
  remediated: { reviewed_round: n - 1, findings: [] },
});

const grant = (afterRound: number, cap: number) => ({
  schema_version: 1,
  session_number: 137,
  after_round: afterRound,
  terminal: "remediated_at_cap",
  cap,
  reason: "the fix to the release path landed unreviewed",
  approver: "operator",
  recorded_at: "2026-09-09T07:40:00.000000-04:00",
});

describe("a grant of further rounds", () => {
  it("reopens the loop a spent cap ended, where raising the cap alone cannot", () => {
    const repo = tempDir();
    const rows = [{ round: 3, blocking: true, findings: [] }, cappedAt(4)];
    // The deadlock, stated: the terminal is read before the cap, so no
    // number reopens this.
    assert.equal(noRoundReason(repo, 137, rows, 3), NO_ROUND_TERMINAL);
    assert.equal(noRoundReason(repo, 137, rows, 99), NO_ROUND_TERMINAL);
    appendReopen(repo, 137, grant(4, 5));
    assert.equal(noRoundReason(repo, 137, rows, 3), null);
  });

  it("buys named rounds rather than switching the cap off", () => {
    const repo = tempDir();
    appendReopen(repo, 137, grant(4, 5));
    // Round 5 is bought and opens; the terminal round 5 then writes stands
    // beyond the grant, and stops the session again.
    assert.equal(noRoundReason(repo, 137, [cappedAt(4)], 3), null);
    assert.equal(
      noRoundReason(repo, 137, [cappedAt(4), cappedAt(5)], 3),
      NO_ROUND_TERMINAL,
    );
  });

  it("wins over the configured cap, which a config edit must not undo", () => {
    const repo = tempDir();
    appendReopen(repo, 137, grant(4, 6));
    // Rounds 5 and 6 are bought; a cap of 1 in the configuration does not
    // take back a number an operator signed for.
    assert.equal(noRoundReason(repo, 137, [cappedAt(4)], 1), null);
    assert.equal(
      noRoundReason(repo, 137, [cappedAt(4), { round: 6, blocking: false, findings: [] }], 1),
      NO_ROUND_CAP_CLEAN,
    );
  });

  it("never reaches an adjudication, whatever a grant row claims", () => {
    const repo = tempDir();
    const judged = [cappedAt(2), { round: 3, type: "adjudication", blocking: false }];
    // Written straight to the ledger, as an older or patched build could:
    // the rule holds at the reader, not only at the verb.
    appendReopen(repo, 137, { ...grant(3, 4), terminal: "remediated_at_cap" });
    assert.equal(noRoundReason(repo, 137, judged, 3), NO_ROUND_TERMINAL);
    assert.equal(
      standingTerminal(judged, standingReopen(repo, 137))?.["type"],
      "adjudication",
    );
  });

  it("is immutable: one grant per terminal, ever", () => {
    const repo = tempDir();
    appendReopen(repo, 137, grant(4, 5));
    assert.throws(() => appendReopen(repo, 137, grant(4, 9)), /already been reopened once/);
    assert.equal(readReopens(repo, 137).length, 1);
    assert.equal(standingReopen(repo, 137)?.cap, 5);
  });

  it("reads the newest grant, so a stale one cannot raise the cap again", () => {
    const repo = tempDir();
    appendReopen(repo, 137, grant(4, 5));
    appendReopen(repo, 137, { ...grant(5, 6), after_round: 5, cap: 6 });
    assert.equal(standingReopen(repo, 137)?.afterRound, 5);
    assert.equal(standingReopen(repo, 137)?.cap, 6);
  });
});

describe("what the reopen verb refuses", () => {
  it("refuses a session that is not stuck, so it cannot become the way a cap is raised", () => {
    const repo = tempDir();
    const stuck = classifyStuck(repo, 137, [{ round: 1, blocking: false, findings: [] }], 3);
    assert.equal(stuck.kind, "refused");
    assert.match(stuck.kind === "refused" ? stuck.message : "", /is not stuck/);
    assert.match(stuck.kind === "refused" ? stuck.message : "", /plan amend --max-rounds/);
  });

  it("refuses an adjudication, and says a judgment is not a budget", () => {
    const repo = tempDir();
    const stuck = classifyStuck(repo, 137, [{ round: 1, type: "adjudication", blocking: false }], 3);
    assert.equal(stuck.kind, "refused");
    assert.match(stuck.kind === "refused" ? stuck.message : "", /judgment/);
  });

  it("routes a cap reached with disputed findings to adjudication instead", () => {
    const repo = tempDir();
    appendRound(repo, 137, {
      round: 1,
      verdict: "ISSUES_FOUND",
      blocking: true,
      verifier_model: "m",
      verifier_provider: "p",
      findings: [{ severity: "major", description: "d", blocking: true }],
      completion_tree: "a".repeat(40),
      recorded_at: "2026-09-09T06:00:00.000000-04:00",
    });
    appendDispute(repo, 137, {
      round: 1,
      finding_index: 0,
      filed_after_round: 1,
      grounds: "wrong",
      evidence_paths: ["a.ts"],
      recorded_at: "2026-09-09T06:10:00.000000-04:00",
    });
    const stuck = classifyStuck(repo, 137, [
      { round: 1, blocking: true, findings: [{ severity: "major", description: "d", blocking: true }] },
    ], 1);
    assert.equal(stuck.kind, "refused");
    assert.match(stuck.kind === "refused" ? stuck.message : "", /verify adjudicate/);
  });

  it("is what the cap amendment now points at, instead of being accepted and inert", () => {
    const repo = tempDir();
    writeRun(repo, 137, {
      schema_version: 1,
      session_number: 137,
      engine: "claude-code",
      phase: "verify",
      seq: 1,
      invocations: 0,
      max_invocations: 24,
      accepted_steps: [] as string[],
      baseline_tree: null,
      stop: null,
      started_at: "2026-09-09T04:57:20.266-04:00",
      updated_at: "2026-09-09T04:57:20.266-04:00",
    });
    // Before the terminal the amendment is the right verb and still works.
    assert.equal(
      amendRoundCap(repo, 137, { cap: 5, reason: "r", approver: "operator" }, "2026-09-09T06:00:00-04:00")
        .verification?.max_rounds,
      5,
    );
    appendRound(repo, 137, {
      ...cappedAt(4),
      remediated: {
        reviewed_round: 3,
        findings: [{ severity: "major", description: "the tag was matched by name", blocking: true }],
      },
    });
    // After it, the number would change nothing, so it is refused rather
    // than recorded -- session 137 raised 3 to 5 twenty seconds after the
    // terminal was written and never opened round 5.
    assert.throws(
      () =>
        amendRoundCap(repo, 137, { cap: 9, reason: "r", approver: "operator" }, "2026-09-09T06:37:21-04:00"),
      /a cap raised past a terminal changes nothing[\s\S]*verify reopen/,
    );
  });

  it("names the terminal it would reopen, and the round it comes after", () => {
    const repo = tempDir();
    const stuck = classifyStuck(repo, 137, [cappedAt(4)], 3);
    assert.deepEqual(stuck, { kind: "reopenable", afterRound: 4, terminal: "remediated_at_cap" });
  });

  it("offers a cap-clean end the same exit, because a moved tree deadlocks there too", () => {
    const repo = tempDir();
    const rows = [{ round: 3, blocking: false, findings: [] }];
    assert.equal(noRoundReason(repo, 137, rows, 3), NO_ROUND_CAP_CLEAN);
    assert.deepEqual(classifyStuck(repo, 137, rows, 3), {
      kind: "reopenable",
      afterRound: 3,
      terminal: "cap-clean",
    });
  });
});
