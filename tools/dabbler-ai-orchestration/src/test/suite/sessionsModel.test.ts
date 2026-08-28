import * as assert from "assert";
import {
  ICON_FILES,
  sessionDisplayNumber,
  progressText,
  sessionRowLabel,
  sessionsInOrder,
  verdictIsUnclean,
} from "../../providers/sessionsModel";
import { makeRepository, makeSession } from "./helpers";

suite("sessionsModel: the operator's status icons", () => {
  test("the four authored filenames resolve by status, unchanged", () => {
    assert.deepStrictEqual(ICON_FILES, {
      complete: "done.svg",
      "in-progress": "in-progress.svg",
      "not-started": "not-started.svg",
      cancelled: "cancelled.svg",
    });
  });
});

suite("sessionsModel: session naming", () => {
  test("the written number is the projection's, never re-derived here", () => {
    // Python owns the padding rule. A payload that carries no name
    // degrades to the plain number rather than growing a second copy of
    // the rule that could disagree with the first.
    assert.strictEqual(
      sessionDisplayNumber(makeSession({ number: 15, displayNumber: "015" })),
      "015",
    );
    assert.strictEqual(
      sessionDisplayNumber(makeSession({ number: 15, displayNumber: "" })),
      "15",
    );
  });

  test("the row label is the written number then the session's own title", () => {
    assert.strictEqual(
      sessionRowLabel(makeSession({ number: 15, title: "The sessions view" })),
      "015 · The sessions view",
    );
  });

  test("sessions come back in ledger order whatever order they arrive in", () => {
    const ordered = sessionsInOrder([
      makeSession({ number: 3 }),
      makeSession({ number: 1 }),
      makeSession({ number: 2 }),
    ]);
    assert.deepStrictEqual(ordered.map((s) => s.number), [1, 2, 3]);
  });
});

suite("sessionsModel: progress text", () => {
  test("the fraction is always X/total, with the in-flight session named", () => {
    assert.strictEqual(
      progressText(
        makeRepository({
          totalSessions: 20,
          sessionsCompleted: 14,
          currentSession: 15,
          sessions: [makeSession({ number: 15, status: "in-progress" })],
        }),
      ),
      "14/20 · session 015 in flight",
    );
    assert.strictEqual(
      progressText(makeRepository({ totalSessions: 20, sessionsCompleted: 20 })),
      "20/20",
    );
  });

  test("an unknown total still reports what completed", () => {
    assert.strictEqual(
      progressText(makeRepository({ totalSessions: null, sessionsCompleted: 3 })),
      "3 complete",
    );
    assert.strictEqual(progressText(makeRepository()), "");
  });
});

suite("sessionsModel: verdict cleanliness", () => {
  test("an unrecognized verdict is unclean; a missing one is not a verdict", () => {
    assert.ok(verdictIsUnclean("manual-override-development"));
    assert.ok(!verdictIsUnclean(null));
    assert.ok(!verdictIsUnclean(""));
  });

  test("remediated-at-the-cap never reads as a pass", () => {
    // The work landed; no verifier reviewed the repair. A row that read
    // as clean would hide exactly that.
    assert.ok(verdictIsUnclean("REMEDIATED_AT_CAP"));
    assert.ok(verdictIsUnclean("ISSUES_FOUND"));
    assert.ok(!verdictIsUnclean("VERIFIED"));
  });
});
