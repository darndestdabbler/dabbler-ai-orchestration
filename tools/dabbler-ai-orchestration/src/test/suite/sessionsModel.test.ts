import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
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

  test("every status icon is sixteen PIXELS, which is what a tree row draws", () => {
    // csv-model's first feedback item: the eight SVGs declared `width="16mm"`
    // -- Inkscape's default unit -- and a tree row drew them at sixty pixels,
    // cropped to a line through the row. The unit is the whole defect, and
    // nothing downstream can notice it: the row asks for a 16px slot and the
    // renderer scales whatever it is handed.
    for (const theme of ["dark", "light"]) {
      for (const file of Object.values(ICON_FILES)) {
        const svg = fs.readFileSync(
          path.resolve(__dirname, "..", "..", "..", "media", theme, file),
          "utf8",
        );
        const width = /\bwidth="([^"]+)"/.exec(svg)?.[1];
        const height = /\bheight="([^"]+)"/.exec(svg)?.[1];
        assert.strictEqual(width, "16", `${theme}/${file} declares width="${width}"`);
        assert.strictEqual(height, "16", `${theme}/${file} declares height="${height}"`);
        assert.ok(
          /viewBox="0 0 16 16"/.test(svg),
          `${theme}/${file} has no 16x16 viewBox to scale from`,
        );
      }
    }
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

  test("a repository whose sessions came from its plan says nothing has run", () => {
    // "0/2" would be true of a repository mid-sequence too. What the
    // operator needs from a freshly bootstrapped one is that the router
    // has never written here at all.
    const text = progressText(
      makeRepository({
        sessionsSource: "plan",
        totalSessions: 2,
        sessions: [
          makeSession({ number: 1, status: "not-started" }),
          makeSession({ number: 2, status: "not-started" }),
        ],
      }),
    );
    assert.strictEqual(text, "2 planned · nothing has run here yet");
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
