import * as assert from "assert";
import { ROW_ACTIONS, applicableActions, ActionSupports } from "../../providers/ActionRegistry";
import { SessionSet, SessionState } from "../../types";

// Set 029 Session 4 — ActionRegistry covers what `view/item/context`
// rules USED to declaratively gate in package.json before the custom-
// tree pivot. Per audit GPT-5.4 M2: one typed registry drives every
// menu entrypoint — right-click, Shift+F10, Context Menu key, and
// any future inline overflow button. This suite exercises every
// action's applicability across every relevant state combination so
// drift between menu surfaces is impossible.

function fakeSet(
  state: SessionState,
  over: Partial<SessionSet> = {},
): SessionSet {
  return {
    name: over.name ?? "fixture",
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
    config: { requiresUAT: false, requiresE2E: false, uatScope: "none" },
    uatSummary: null,
    root: "/x",
    needsMigration: false,
    ...over,
  };
}

const ALL_SUPPORTED: ActionSupports = { uat: true, e2e: true };
const NEITHER_SUPPORTED: ActionSupports = { uat: false, e2e: false };

function ids(set: SessionSet, supports: ActionSupports): string[] {
  return applicableActions(set, supports).map((a) => a.id);
}

suite("ActionRegistry", () => {
  test("ROW_ACTIONS exposes the 14 non-orchestrator actions (Set 034 retired the orchestrator group)", () => {
    // Set 034: orchestrator group (dabbler.checkOutOrchestrator,
    // dabbler.releaseCheckOut, dabbler.openOrchestratorWriterLog)
    // removed from the right-click menu in lockstep with the per-row
    // orchestrator-tracking accordion retiring. The commands stay
    // registered in extension.ts (Command Palette access preserved)
    // but no longer appear in this typed registry.
    const expected = new Set([
      "dabblerSessionSets.openSpec",
      "dabblerSessionSets.openActivityLog",
      "dabblerSessionSets.openChangeLog",
      "dabblerSessionSets.openAiAssignment",
      "dabblerSessionSets.openUatChecklist",
      "dabblerSessionSets.revealPlaywrightTests",
      "dabblerSessionSets.openSessionState",
      "dabblerSessionSets.openFolder",
      "dabblerSessionSets.copyStartCommand.default",
      "dabblerSessionSets.copyStartCommand.parallel",
      "dabblerSessionSets.copySlug",
      "dabblerSessionSets.migrate",
      "dabblerSessionSets.cancel",
      "dabblerSessionSets.restore",
    ]);
    const got = new Set(ROW_ACTIONS.map((a) => a.id));
    assert.deepStrictEqual(got, expected);
    assert.strictEqual(ROW_ACTIONS.length, 14);
  });

  test("orchestrator group is NOT exposed by the registry (Set 034 retirement)", () => {
    const ids14 = ROW_ACTIONS.map((a) => a.id);
    for (const id of [
      "dabbler.checkOutOrchestrator",
      "dabbler.releaseCheckOut",
      "dabbler.openOrchestratorWriterLog",
    ]) {
      assert.ok(
        !ids14.includes(id),
        `${id} should NOT appear in ROW_ACTIONS — Set 034 retired the orchestrator group`,
      );
    }
  });

  test("always-available actions appear for any state when supports are full", () => {
    const states: SessionState[] = ["in-progress", "not-started", "complete", "cancelled"];
    for (const st of states) {
      const got = ids(fakeSet(st), ALL_SUPPORTED);
      for (const id of [
        "dabblerSessionSets.openSpec",
        "dabblerSessionSets.openActivityLog",
        "dabblerSessionSets.openChangeLog",
        "dabblerSessionSets.openAiAssignment",
        "dabblerSessionSets.openSessionState",
        "dabblerSessionSets.openFolder",
        "dabblerSessionSets.copySlug",
      ]) {
        assert.ok(got.includes(id), `expected ${id} for state=${st}; got ${got.join(",")}`);
      }
    }
  });

  test("UAT entry gated on both supports.uat AND set.config.requiresUAT", () => {
    const uatSet = fakeSet("in-progress", { config: { requiresUAT: true, requiresE2E: false, uatScope: "" } });
    const nonUatSet = fakeSet("in-progress");
    assert.ok(ids(uatSet, ALL_SUPPORTED).includes("dabblerSessionSets.openUatChecklist"));
    assert.ok(!ids(uatSet, NEITHER_SUPPORTED).includes("dabblerSessionSets.openUatChecklist"),
      "supports.uat=false suppresses the menu entry even when set declares requiresUAT");
    assert.ok(!ids(nonUatSet, ALL_SUPPORTED).includes("dabblerSessionSets.openUatChecklist"),
      "set without requiresUAT never shows the menu entry");
  });

  test("E2E entry gated on both supports.e2e AND set.config.requiresE2E", () => {
    const e2eSet = fakeSet("in-progress", { config: { requiresUAT: false, requiresE2E: true, uatScope: "none" } });
    assert.ok(ids(e2eSet, ALL_SUPPORTED).includes("dabblerSessionSets.revealPlaywrightTests"));
    assert.ok(!ids(e2eSet, NEITHER_SUPPORTED).includes("dabblerSessionSets.revealPlaywrightTests"));
    assert.ok(!ids(fakeSet("in-progress"), ALL_SUPPORTED).includes("dabblerSessionSets.revealPlaywrightTests"));
  });

  test("copyStartCommand entries appear only on in-progress / not-started rows", () => {
    for (const st of ["in-progress", "not-started"] as SessionState[]) {
      const got = ids(fakeSet(st), ALL_SUPPORTED);
      assert.ok(got.includes("dabblerSessionSets.copyStartCommand.default"), `default missing for ${st}`);
      assert.ok(got.includes("dabblerSessionSets.copyStartCommand.parallel"), `parallel missing for ${st}`);
    }
    for (const st of ["complete", "cancelled"] as SessionState[]) {
      const got = ids(fakeSet(st), ALL_SUPPORTED);
      assert.ok(!got.includes("dabblerSessionSets.copyStartCommand.default"), `default leaked to ${st}`);
      assert.ok(!got.includes("dabblerSessionSets.copyStartCommand.parallel"), `parallel leaked to ${st}`);
    }
  });

  test("cancel appears for in-progress / not-started / complete, not for cancelled", () => {
    for (const st of ["in-progress", "not-started", "complete"] as SessionState[]) {
      assert.ok(ids(fakeSet(st), ALL_SUPPORTED).includes("dabblerSessionSets.cancel"), `cancel missing for ${st}`);
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

  test("migrate appears only when set.needsMigration is true", () => {
    const needs = fakeSet("complete", { needsMigration: true });
    const ok = fakeSet("complete");
    assert.ok(ids(needs, ALL_SUPPORTED).includes("dabblerSessionSets.migrate"));
    assert.ok(!ids(ok, ALL_SUPPORTED).includes("dabblerSessionSets.migrate"));
  });

  test("result is sorted by group ascending so menu order is deterministic", () => {
    const got = applicableActions(
      fakeSet("in-progress", {
        config: { requiresUAT: true, requiresE2E: true, uatScope: "" },
        needsMigration: true,
      }),
      ALL_SUPPORTED,
    );
    const groups = got.map((a) => a.group);
    const sorted = [...groups].sort((a, b) => a - b);
    assert.deepStrictEqual(groups, sorted, "applicableActions should pre-sort by group");
  });
});
