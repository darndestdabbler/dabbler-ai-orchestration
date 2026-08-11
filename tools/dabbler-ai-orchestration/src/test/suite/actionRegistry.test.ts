import * as assert from "assert";
import {
  ROW_ACTIONS,
  applicableActions,
  categorizedActions,
  ActionSupports,
} from "../../providers/ActionRegistry";
import { SessionSet, SessionState } from "../../types";

// Set 029 Session 4 — ActionRegistry covers what `view/item/context`
// rules USED to declaratively gate in package.json before the custom-
// tree pivot. Per audit GPT-5.4 M2: one typed registry drives every
// menu entrypoint — right-click QuickPick, Shift+F10, Context Menu
// key, and any future inline overflow button. This suite exercises
// every action's applicability + category across every relevant state
// combination so drift between menu surfaces is impossible.
//
// Set 048 Session 3: the registry gained an `ActionCategory`
// discriminator (`openFile` / `copyEval` / `flat`) so the two-step
// QuickPick rebuild can group items without inferring from id
// prefixes. L3 removed `dabblerSessionSets.openAiAssignment` and the
// `view/item/context` mirror; the four copy-prompt commands moved into
// the `copyEval` submenu and "Open AI Assignment" is gone entirely.

function fakeSet(
  state: SessionState,
  over: Partial<SessionSet> = {},
): SessionSet {
  return {
    name: over.name ?? "fixture",
    module: null,
    moduleTitle: null,
    moduleOrder: null,
    dir: "/x",
    specPath: "/x/spec.md",
    activityPath: "/x/activity-log.json",
    changeLogPath: "/x/change-log.md",
    statePath: "/x/session-state.json",
    aiAssignmentPath: "/x/ai-assignment.md",
    uatChecklistPath: "/x/x-uat-checklist.json",
    state,
    totalSessions: null,
    sessionsCompleted: 0,
    lastTouched: null,
    liveSession: null,
    config: {
      requiresUAT: false,
      requiresE2E: false,
      uatScope: "none",
      module: null,
    },
    uatSummary: null,
    root: "/x",
    needsMigration: false,
    migrationTargetSchemaVersion: null,
    schemaVersionOnDisk: null,
    prerequisites: null,
    blockedByPrereqs: false,
    unsatisfiedPrereqs: [],
    ...over,
  };
}

const ALL_SUPPORTED: ActionSupports = { uat: true, e2e: true };

function ids(set: SessionSet, supports: ActionSupports): string[] {
  return applicableActions(set, supports).map((a) => a.id);
}

suite("ActionRegistry", () => {
  test("ROW_ACTIONS exposes the 11 menu-surface actions (Set 048 S3 reshape + Set 049 S4 rip-out + Set 061 S2 prereq spec + 2026-08-11 menu trim)", () => {
    // Set 048 S3 reshape:
    //   - L3 removed `dabblerSessionSets.openAiAssignment`.
    //   - L2 narrowed the Open File submenu to exactly 4 entries
    //     (Spec / Activity Log / Change Log / Session State). The
    //     pre-existing openUatChecklist / revealPlaywrightTests /
    //     openFolder commands remain registered (Command Palette
    //     accessible) but no longer surface on the right-click menu.
    //   - copyStartCommand.default and copySlug are kept in
    //     copyCommand.ts (palette-accessible) but the right-click
    //     menu surfaces the new dabbler.copy*Prompt commands instead.
    //   - copyEval entry: copyStartNextSessionPrompt.
    // Set 049 S4 rip-out:
    //   - `dabbler.checkOutOrchestrator` ("Set Orchestrator…") retired
    //     alongside the check-out / check-in coordination layer.
    // Set 061 S2 (spec D3):
    //   - dabblerSessionSets.openPrerequisiteSpec — flat companion to
    //     the blocked marker, gated to non-terminal rows with at least
    //     one unsatisfied prerequisite.
    // 2026-08-11 operator decision (menu trim):
    //   - The three "Evaluate" review prompts (spec / session- /
    //     set-accomplishments) retired: they served manual verification
    //     that the routed cross-provider round now owns.
    //   - copyStartNextParallelSessionPrompt and
    //     copyStartCommand.parallel retired: superseded by the
    //     worktree-per-session model, where "the next session" is
    //     started in its own worktree.
    //   - openOrchestratorWriterLog retired as a troubleshooting-only
    //     surface.
    const expected = new Set([
      "dabblerSessionSets.openSpec",
      "dabblerSessionSets.openActivityLog",
      "dabblerSessionSets.openChangeLog",
      "dabblerSessionSets.openSessionState",
      "dabbler.copyStartNextSessionPrompt",
      "dabblerSessionSets.copySlug",
      "dabblerSessionSets.openPrerequisiteSpec",
      "dabblerSessionSets.migrate",
      "dabblerSessionSets.migrateToV4",
      "dabblerSessionSets.cancel",
      "dabblerSessionSets.restore",
    ]);
    const got = new Set(ROW_ACTIONS.map((a) => a.id));
    assert.deepStrictEqual(got, expected);
    assert.strictEqual(ROW_ACTIONS.length, 11);
  });

  test("openAiAssignment fully removed (L3)", () => {
    for (const a of ROW_ACTIONS) {
      assert.notStrictEqual(a.id, "dabblerSessionSets.openAiAssignment",
        "openAiAssignment must not appear in ROW_ACTIONS — L3 operator-locked removal");
    }
  });

  test("category discriminator partitions actions for the two-step QuickPick", () => {
    const cats = new Set(ROW_ACTIONS.map((a) => a.category));
    assert.deepStrictEqual(
      cats,
      new Set(["openFile", "copyEval", "flat"]),
      "every action must declare one of the three menu categories",
    );
  });

  test("Open File submenu locked to exactly four entries (L2)", () => {
    const openFile = ROW_ACTIONS.filter((a) => a.category === "openFile").map((a) => a.id);
    assert.deepStrictEqual(
      openFile,
      [
        "dabblerSessionSets.openSpec",
        "dabblerSessionSets.openActivityLog",
        "dabblerSessionSets.openChangeLog",
        "dabblerSessionSets.openSessionState",
      ],
      "L2 locks Open File ▸ to [Spec | Activity Log | Change Log | Session State]",
    );
  });

  test("always-available openFile entries appear for any state", () => {
    const states: SessionState[] = ["in-progress", "not-started", "complete", "cancelled"];
    for (const st of states) {
      const got = ids(fakeSet(st), ALL_SUPPORTED);
      for (const id of [
        "dabblerSessionSets.openSpec",
        "dabblerSessionSets.openActivityLog",
        "dabblerSessionSets.openChangeLog",
        "dabblerSessionSets.openSessionState",
      ]) {
        assert.ok(got.includes(id), `expected ${id} for state=${st}; got ${got.join(",")}`);
      }
    }
  });

  test("copyEval submenu — start-next-session gated on non-terminal rows (L5)", () => {
    for (const st of ["in-progress", "not-started"] as SessionState[]) {
      assert.ok(
        ids(fakeSet(st), ALL_SUPPORTED).includes("dabbler.copyStartNextSessionPrompt"),
        `start-next-session missing for state=${st}`,
      );
    }
    for (const st of ["complete", "cancelled"] as SessionState[]) {
      assert.ok(
        !ids(fakeSet(st), ALL_SUPPORTED).includes("dabbler.copyStartNextSessionPrompt"),
        `start-next-session leaked onto terminal state=${st}`,
      );
    }
  });

  test("checkOutOrchestrator fully retired (Set 049 S4 rip-out)", () => {
    for (const st of ["in-progress", "not-started", "complete", "cancelled"] as SessionState[]) {
      assert.ok(
        !ids(fakeSet(st), ALL_SUPPORTED).includes("dabbler.checkOutOrchestrator"),
        `checkOutOrchestrator must not appear in any state (retired Set 049 S4); leaked onto state=${st}`,
      );
    }
    for (const a of ROW_ACTIONS) {
      assert.notStrictEqual(a.id, "dabbler.checkOutOrchestrator",
        "dabbler.checkOutOrchestrator must not appear in ROW_ACTIONS — Set 049 S4 rip-out");
    }
  });

  // 2026-08-11 operator menu trim. One guard for all five retirements,
  // in the same shape as the checkOutOrchestrator guard above: a
  // retired id must not reappear in ROW_ACTIONS OR surface in any
  // state. Written as a loop so re-adding one costs one failure with
  // the offending id named, not a hunt through five near-identical
  // tests.
  test("2026-08-11 menu trim — retired commands surface in no state", () => {
    const retired = [
      "dabbler.copySpecReviewPrompt",
      "dabbler.copySessionAccomplishmentsPrompt",
      "dabbler.copySetAccomplishmentsPrompt",
      "dabbler.copyStartNextParallelSessionPrompt",
      "dabbler.openOrchestratorWriterLog",
    ];
    for (const id of retired) {
      for (const a of ROW_ACTIONS) {
        assert.notStrictEqual(a.id, id, `${id} must not appear in ROW_ACTIONS — retired 2026-08-11`);
      }
      for (const st of ["in-progress", "not-started", "complete", "cancelled"] as SessionState[]) {
        assert.ok(
          !ids(fakeSet(st, { sessionsCompleted: 5 }), ALL_SUPPORTED).includes(id),
          `${id} leaked onto state=${st} — retired 2026-08-11`,
        );
      }
    }
  });

  test("cancel appears for in-progress / not-started / complete, not for cancelled", () => {
    for (const st of ["in-progress", "not-started", "complete"] as SessionState[]) {
      assert.ok(ids(fakeSet(st), ALL_SUPPORTED).includes("dabblerSessionSets.cancel"),
        `cancel missing for ${st}`);
    }
    assert.ok(!ids(fakeSet("cancelled"), ALL_SUPPORTED).includes("dabblerSessionSets.cancel"),
      "cancel leaked onto a cancelled row");
  });

  test("restore appears only for cancelled rows", () => {
    assert.ok(ids(fakeSet("cancelled"), ALL_SUPPORTED).includes("dabblerSessionSets.restore"));
    for (const st of ["in-progress", "not-started", "complete"] as SessionState[]) {
      assert.ok(!ids(fakeSet(st), ALL_SUPPORTED).includes("dabblerSessionSets.restore"),
        `restore leaked onto ${st}`);
    }
  });

  test("migrate (v3) appears only when needsMigration + target=3 (v1/v2 or broken-v3)", () => {
    const needsV3 = fakeSet("complete", {
      needsMigration: true,
      migrationTargetSchemaVersion: 3,
    });
    const needsV4 = fakeSet("complete", {
      needsMigration: true,
      migrationTargetSchemaVersion: 4,
    });
    const ok = fakeSet("complete");
    assert.ok(ids(needsV3, ALL_SUPPORTED).includes("dabblerSessionSets.migrate"));
    assert.ok(!ids(needsV3, ALL_SUPPORTED).includes("dabblerSessionSets.migrateToV4"),
      "v3-target row should not surface the v4 migrator");
    assert.ok(!ids(needsV4, ALL_SUPPORTED).includes("dabblerSessionSets.migrate"),
      "v4-target row should not surface the v3 migrator");
    assert.ok(!ids(ok, ALL_SUPPORTED).includes("dabblerSessionSets.migrate"));
    assert.ok(!ids(ok, ALL_SUPPORTED).includes("dabblerSessionSets.migrateToV4"));
  });

  test("migrateToV4 appears only when needsMigration + target=4 (canonical v3 with sessions[])", () => {
    const needsV4 = fakeSet("complete", {
      needsMigration: true,
      migrationTargetSchemaVersion: 4,
    });
    const needsV3 = fakeSet("complete", {
      needsMigration: true,
      migrationTargetSchemaVersion: 3,
    });
    const ok = fakeSet("complete");
    assert.ok(ids(needsV4, ALL_SUPPORTED).includes("dabblerSessionSets.migrateToV4"));
    assert.ok(!ids(needsV3, ALL_SUPPORTED).includes("dabblerSessionSets.migrateToV4"));
    assert.ok(!ids(ok, ALL_SUPPORTED).includes("dabblerSessionSets.migrateToV4"));
  });

  test("v3 and v4 migrate entries are mutually exclusive — never both at once", () => {
    for (const target of [3, 4, null] as const) {
      const set = fakeSet("complete", {
        needsMigration: target !== null,
        migrationTargetSchemaVersion: target,
      });
      const got = ids(set, ALL_SUPPORTED);
      const both =
        got.includes("dabblerSessionSets.migrate") &&
        got.includes("dabblerSessionSets.migrateToV4");
      assert.ok(!both, `both migrate entries appeared for target=${target}`);
    }
  });

  test("result is sorted by group ascending so menu order is deterministic", () => {
    const got = applicableActions(
      fakeSet("in-progress", {
        config: {
          requiresUAT: true,
          requiresE2E: true,
          uatScope: "",
          module: null,
        },
        sessionsCompleted: 2,
        needsMigration: true,
        migrationTargetSchemaVersion: 4,
      }),
      ALL_SUPPORTED,
    );
    const groups = got.map((a) => a.group);
    const sorted = [...groups].sort((a, b) => a - b);
    assert.deepStrictEqual(groups, sorted, "applicableActions should pre-sort by group");
  });

  test("categorizedActions partitions and pre-sorts within each category", () => {
    const cats = categorizedActions(
      fakeSet("in-progress", { sessionsCompleted: 2 }),
      ALL_SUPPORTED,
    );
    assert.ok(cats.openFile.length === 4, "openFile should hold exactly the four L2 entries");
    assert.ok(cats.copyEval.length >= 1, "copyEval should hold at least the spec-review entry");
    assert.ok(cats.flat.length >= 1, "flat should hold at least one flat action");

    for (const cat of [cats.openFile, cats.copyEval, cats.flat]) {
      const groups = cat.map((a) => a.group);
      const sorted = [...groups].sort((a, b) => a - b);
      assert.deepStrictEqual(groups, sorted);
    }
  });

  test("openPrerequisiteSpec appears only on non-terminal rows with unsatisfied prereqs (Set 061 S2)", () => {
    const unsatisfied = [
      { slug: "044-prereq", condition: "complete" as const, targetState: "in-progress" as const },
    ];
    for (const st of ["in-progress", "not-started"] as SessionState[]) {
      assert.ok(
        ids(fakeSet(st, { blockedByPrereqs: true, unsatisfiedPrereqs: unsatisfied }), ALL_SUPPORTED)
          .includes("dabblerSessionSets.openPrerequisiteSpec"),
        `openPrerequisiteSpec missing for blocked state=${st}`,
      );
      assert.ok(
        !ids(fakeSet(st), ALL_SUPPORTED).includes("dabblerSessionSets.openPrerequisiteSpec"),
        `openPrerequisiteSpec leaked onto unblocked state=${st}`,
      );
    }
    for (const st of ["complete", "cancelled"] as SessionState[]) {
      assert.ok(
        !ids(fakeSet(st, { blockedByPrereqs: true, unsatisfiedPrereqs: unsatisfied }), ALL_SUPPORTED)
          .includes("dabblerSessionSets.openPrerequisiteSpec"),
        `openPrerequisiteSpec leaked onto terminal state=${st} (same suppression as the marker)`,
      );
    }
  });

  test("categorizedActions on a complete set surfaces no copyEval start actions", () => {
    const cats = categorizedActions(
      fakeSet("complete", { sessionsCompleted: 5 }),
      ALL_SUPPORTED,
    );
    const ids = cats.copyEval.map((a) => a.id);
    assert.ok(!ids.includes("dabbler.copyStartNextSessionPrompt"),
      "start-next-session must not surface on complete (terminal) state");
  });

});
