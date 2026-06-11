import * as assert from "assert";
import { extractRecommendation, listInProgressSets } from "../../providers/inProgressSetsService";
import { SessionSet } from "../../types";

// extractRecommendation parses ai-assignment.md for a per-session
// recommendation paragraph. Renamed in Set 033 Session 2 — same
// regex contract; the surrounding `MarkerWatchService` class +
// per-set marker reader / watcher were retired per H2.

suite("extractRecommendation", () => {
  test("parses a well-formed `## Session N: title` + ### Recommended orchestrator block", () => {
    const text = [
      "# Set 029 — ai-assignment",
      "",
      "## Session 4: Custom-tree pivot",
      "",
      "### Recommended orchestrator",
      "",
      "Claude Opus 4.7 @ effort=high. Rationale text follows.",
      "",
      "## Session 5: Non-Claude provider detection",
      "",
      "### Recommended orchestrator",
      "",
      "Claude Sonnet 4.6 @ effort=medium",
    ].join("\n");
    const rec = extractRecommendation(text, 4, "029-orchestrator");
    assert.ok(rec, "should extract for session 4");
    assert.strictEqual(rec!.providerName, "Claude");
    assert.strictEqual(rec!.modelName, "Opus 4.7");
    assert.strictEqual(rec!.effort, "high");
    assert.strictEqual(rec!.sessionLabel, "Session 4: Custom-tree pivot");
    assert.strictEqual(rec!.setName, "029-orchestrator");
  });

  test("supports `## Session N of M: title` heading form", () => {
    const text = [
      "## Session 3 of 6: Per-session-set identity",
      "### Recommended orchestrator",
      "Claude Opus 4.7 @ effort=high",
    ].join("\n");
    const rec = extractRecommendation(text, 3, "set");
    assert.ok(rec);
    assert.strictEqual(rec!.sessionLabel, "Session 3: Per-session-set identity");
  });

  test("returns null when the session heading is absent", () => {
    const text = "## Session 1: Foo\n### Recommended orchestrator\nClaude Opus 4.7 @ effort=high";
    assert.strictEqual(extractRecommendation(text, 4, "set"), null);
  });

  test("returns null when the Recommended orchestrator subheading is absent", () => {
    const text = "## Session 4: Custom-tree pivot\n\nSome other content but no recommendation.";
    assert.strictEqual(extractRecommendation(text, 4, "set"), null);
  });

  test("returns null when the recommendation paragraph is malformed (no @ effort=)", () => {
    const text = [
      "## Session 4: Custom-tree pivot",
      "### Recommended orchestrator",
      "Just some prose without the canonical format.",
    ].join("\n");
    assert.strictEqual(extractRecommendation(text, 4, "set"), null);
  });

  test("does not bleed into the next session's recommendation block", () => {
    const text = [
      "## Session 4: Custom-tree pivot",
      "",
      "Lots of prose but no Recommended orchestrator subheading here.",
      "",
      "## Session 5: Next",
      "### Recommended orchestrator",
      "Claude Sonnet 4.6 @ effort=medium",
    ].join("\n");
    assert.strictEqual(extractRecommendation(text, 4, "set"), null,
      "session 4 has no rec; must NOT pick up session 5's rec");
  });

  test("trims trailing punctuation off the model name", () => {
    const text = [
      "## Session 1: x",
      "### Recommended orchestrator",
      "Claude Opus 4.7. @ effort=high",
    ].join("\n");
    const rec = extractRecommendation(text, 1, "set");
    assert.ok(rec);
    assert.strictEqual(rec!.modelName, "Opus 4.7");
  });
});

// Set 033 Session 2 — listInProgressSets is the H2 replacement for
// MarkerWatchService.resolveActiveSet. Returns the array of session
// sets in the in-progress bucket sorted by startedAt ascending. The
// pre-Set-033 ambiguity banner is gone; multi-in-progress is the
// supported case and the array can be any length.

function fakeSet(
  name: string,
  state: SessionSet["state"],
  startedAt: string | null,
): SessionSet {
  return {
    name,
    dir: `/tmp/${name}`,
    specPath: `/tmp/${name}/spec.md`,
    activityPath: `/tmp/${name}/activity-log.json`,
    changeLogPath: `/tmp/${name}/change-log.md`,
    statePath: `/tmp/${name}/session-state.json`,
    aiAssignmentPath: `/tmp/${name}/ai-assignment.md`,
    uatChecklistPath: `/tmp/${name}/uat-checklist.json`,
    state,
    totalSessions: 3,
    sessionsCompleted: 0,
    lastTouched: startedAt,
    liveSession: {
      currentSession: null,
      status: state,
      orchestrator: null,
      startedAt,
      completedAt: null,
      verificationVerdict: null,
      forceClosed: null,
      completedSessions: [],
    },
    config: { requiresUAT: false, requiresE2E: false, uatScope: "none", tier: "full", verificationMode: "out-of-band-or-none" },
    uatSummary: null,
    root: "/tmp",
    needsMigration: false,
    migrationTargetSchemaVersion: null,
    schemaVersionOnDisk: null,
    prerequisites: null,
    blockedByPrereqs: false,
    unsatisfiedPrereqs: [],
    plusFraction: false,
  };
}

suite("listInProgressSets", () => {
  test("returns only in-progress sets, sorted by startedAt asc", () => {
    const sets: SessionSet[] = [
      fakeSet("032-newer-in-progress", "in-progress", "2026-05-19T10:00:00Z"),
      fakeSet("030-complete", "complete", "2026-05-15T08:00:00Z"),
      fakeSet("033-oldest-in-progress", "in-progress", "2026-05-19T08:00:00Z"),
      fakeSet("034-not-started", "not-started", null),
    ];
    const out = listInProgressSets(sets);
    assert.deepStrictEqual(
      out.map((s) => s.name),
      ["033-oldest-in-progress", "032-newer-in-progress"],
      "oldest-checked-out set ranks first",
    );
  });

  test("returns empty array when no sets are in progress", () => {
    const sets: SessionSet[] = [
      fakeSet("030-complete", "complete", "2026-05-15T08:00:00Z"),
      fakeSet("031-not-started", "not-started", null),
    ];
    assert.deepStrictEqual(listInProgressSets(sets), []);
  });

  test("tolerates missing startedAt — null sorts ahead of dated entries", () => {
    const sets: SessionSet[] = [
      fakeSet("with-date", "in-progress", "2026-05-19T08:00:00Z"),
      fakeSet("no-date", "in-progress", null),
    ];
    const out = listInProgressSets(sets);
    // "" < any ISO date string in lexicographic order — the dateless
    // set ranks first. That matches the spec's "oldest-in-flight
    // ranks first" intent: a missing startedAt is treated as the
    // earliest possible time rather than dropped.
    assert.deepStrictEqual(out.map((s) => s.name), ["no-date", "with-date"]);
  });
});
