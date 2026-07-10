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
      tier: "full",
      verificationMode: "out-of-band-or-none",
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
    plusFraction: false,
    externalVerificationNoteExists: false,
    completedVerification: null,
    verificationMarker: "",
    workspaceTierMarker: null,
    ...over,
  };
}

const ALL_SUPPORTED: ActionSupports = { uat: true, e2e: true };

function ids(set: SessionSet, supports: ActionSupports): string[] {
  return applicableActions(set, supports).map((a) => a.id);
}

suite("ActionRegistry", () => {
  test("ROW_ACTIONS exposes the 20 menu-surface actions (Set 048 S3 reshape + Set 049 S1 hygiene + Set 049 S4 rip-out + Set 061 S2 prereq spec + Set 061 S3 switch tier + Set 062 S2 verification affordance)", () => {
    // Set 048 S3 reshape:
    //   - L3 removed `dabblerSessionSets.openAiAssignment`.
    //   - L2 narrowed the Open File submenu to exactly 4 entries
    //     (Spec / Activity Log / Change Log / Session State). The
    //     pre-existing openUatChecklist / revealPlaywrightTests /
    //     openFolder commands remain registered (Command Palette
    //     accessible) but no longer surface on the right-click menu.
    //   - copyStartCommand.default / .parallel and copySlug are kept
    //     in copyCommand.ts (palette-accessible) but the right-click
    //     menu surfaces the new dabbler.copy*Prompt commands instead.
    //   - Four new copyEval entries: copySpecReviewPrompt,
    //     copySessionAccomplishmentsPrompt, copySetAccomplishmentsPrompt,
    //     copyStartNextSessionPrompt.
    //   - Two flat orchestrator entries promoted into the menu
    //     surface: dabbler.checkOutOrchestrator (gated to in-progress)
    //     and dabbler.openOrchestratorWriterLog.
    // Set 049 S1 hygiene addition:
    //   - dabbler.copyStartNextParallelSessionPrompt — the parallel-
    //     session variant surfaces in the submenu under the same
    //     non-terminal gating as "Start Next Session".
    // Set 049 S4 rip-out:
    //   - `dabbler.checkOutOrchestrator` ("Set Orchestrator…") retired
    //     alongside the check-out / check-in coordination layer. The
    //     writer-log opener stays.
    // Set 061 S2 (spec D3):
    //   - dabblerSessionSets.openPrerequisiteSpec — flat companion to
    //     the blocked marker, gated to non-terminal rows with at least
    //     one unsatisfied prerequisite.
    // Set 061 S3 (spec D4):
    //   - dabblerSessionSets.switchTier — rewrites the spec's `tier:`
    //     value; gated to not-started rows only (mid-set switching is
    //     deliberately unsupported).
    // Set 062 S2 (spec D2/D3 + step 4):
    //   - dabbler.copyVerificationKickoffPrompt — agent handoff into
    //     the dedicated-verification flow; Lightweight Mode-B rows with
    //     no completed verification session, cancelled excluded.
    //   - dabblerSessionSets.setupVerification — verification-mode seed
    //     rewrite; not-started Lightweight rows only at this session.
    //   - dabbler.openExternalVerificationDoc — the sanctioned
    //     out-of-band recording path, surfaced exactly on `v?` rows.
    const expected = new Set([
      "dabblerSessionSets.openSpec",
      "dabblerSessionSets.openActivityLog",
      "dabblerSessionSets.openChangeLog",
      "dabblerSessionSets.openSessionState",
      "dabbler.copySpecReviewPrompt",
      "dabbler.copySessionAccomplishmentsPrompt",
      "dabbler.copySetAccomplishmentsPrompt",
      "dabbler.copyStartNextSessionPrompt",
      "dabbler.copyStartNextParallelSessionPrompt",
      "dabblerSessionSets.copySlug",
      "dabbler.openOrchestratorWriterLog",
      "dabblerSessionSets.openPrerequisiteSpec",
      "dabblerSessionSets.switchTier",
      "dabbler.copyVerificationKickoffPrompt",
      "dabblerSessionSets.setupVerification",
      "dabbler.openExternalVerificationDoc",
      "dabblerSessionSets.migrate",
      "dabblerSessionSets.migrateToV4",
      "dabblerSessionSets.cancel",
      "dabblerSessionSets.restore",
    ]);
    const got = new Set(ROW_ACTIONS.map((a) => a.id));
    assert.deepStrictEqual(got, expected);
    assert.strictEqual(ROW_ACTIONS.length, 20);
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

  test("copyEval submenu — spec-review is always enabled", () => {
    for (const st of ["in-progress", "not-started", "complete", "cancelled"] as SessionState[]) {
      assert.ok(
        ids(fakeSet(st), ALL_SUPPORTED).includes("dabbler.copySpecReviewPrompt"),
        `copySpecReviewPrompt missing for state=${st}`,
      );
    }
  });

  test("copyEval submenu — session-accomplishments gated on sessionsCompleted > 0", () => {
    const zero = fakeSet("in-progress", { sessionsCompleted: 0 });
    const one = fakeSet("in-progress", { sessionsCompleted: 1 });
    const three = fakeSet("complete", { sessionsCompleted: 3 });
    assert.ok(
      !ids(zero, ALL_SUPPORTED).includes("dabbler.copySessionAccomplishmentsPrompt"),
      "session-accomplishments should NOT surface before any session completes",
    );
    assert.ok(
      ids(one, ALL_SUPPORTED).includes("dabbler.copySessionAccomplishmentsPrompt"),
      "session-accomplishments should surface once one session is closed",
    );
    assert.ok(
      ids(three, ALL_SUPPORTED).includes("dabbler.copySessionAccomplishmentsPrompt"),
      "session-accomplishments should surface on a completed set too",
    );
  });

  test("copyEval submenu — set-accomplishments gated on state === complete", () => {
    for (const st of ["in-progress", "not-started", "cancelled"] as SessionState[]) {
      assert.ok(
        !ids(fakeSet(st, { sessionsCompleted: 5 }), ALL_SUPPORTED)
          .includes("dabbler.copySetAccomplishmentsPrompt"),
        `set-accomplishments leaked onto state=${st}`,
      );
    }
    assert.ok(
      ids(fakeSet("complete"), ALL_SUPPORTED).includes("dabbler.copySetAccomplishmentsPrompt"),
      "set-accomplishments should surface only on complete state",
    );
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

  test("copyEval submenu — start-next-parallel-session gated on non-terminal rows (Set 049 S1)", () => {
    for (const st of ["in-progress", "not-started"] as SessionState[]) {
      assert.ok(
        ids(fakeSet(st), ALL_SUPPORTED).includes("dabbler.copyStartNextParallelSessionPrompt"),
        `start-next-parallel-session missing for state=${st}`,
      );
    }
    for (const st of ["complete", "cancelled"] as SessionState[]) {
      assert.ok(
        !ids(fakeSet(st), ALL_SUPPORTED).includes("dabbler.copyStartNextParallelSessionPrompt"),
        `start-next-parallel-session leaked onto terminal state=${st}`,
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

  test("openOrchestratorWriterLog stays for all states (writer log preserved per Set 049 T5)", () => {
    for (const st of ["in-progress", "not-started", "complete", "cancelled"] as SessionState[]) {
      assert.ok(
        ids(fakeSet(st), ALL_SUPPORTED).includes("dabbler.openOrchestratorWriterLog"),
        `openOrchestratorWriterLog missing for state=${st}`,
      );
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
          tier: "full",
          verificationMode: "out-of-band-or-none",
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

  test("switchTier appears only on not-started rows (Set 061 S3, spec D4)", () => {
    assert.ok(
      ids(fakeSet("not-started"), ALL_SUPPORTED).includes("dabblerSessionSets.switchTier"),
      "switchTier missing for state=not-started",
    );
    for (const st of ["in-progress", "complete", "cancelled"] as SessionState[]) {
      assert.ok(
        !ids(fakeSet(st), ALL_SUPPORTED).includes("dabblerSessionSets.switchTier"),
        `switchTier leaked onto state=${st} — mid-set / terminal switching is deliberately unsupported`,
      );
    }
    // The gate is state-only: tier, prereqs, and migration flags must
    // not affect applicability on a not-started row.
    const lightweightBlocked = fakeSet("not-started", {
      config: {
        requiresUAT: false,
        requiresE2E: false,
        uatScope: "none",
        tier: "lightweight",
        verificationMode: "dedicated-sessions",
        module: null,
      },
      blockedByPrereqs: true,
      unsatisfiedPrereqs: [
        { slug: "044-prereq", condition: "complete" as const, targetState: "in-progress" as const },
      ],
      needsMigration: true,
      migrationTargetSchemaVersion: 4,
    });
    assert.ok(
      ids(lightweightBlocked, ALL_SUPPORTED).includes("dabblerSessionSets.switchTier"),
      "switchTier should surface on any not-started row regardless of tier/prereq/migration state",
    );
  });

  test("categorizedActions on a complete set surfaces set-accomplishments and NOT start-next", () => {
    const cats = categorizedActions(
      fakeSet("complete", { sessionsCompleted: 5 }),
      ALL_SUPPORTED,
    );
    const ids = cats.copyEval.map((a) => a.id);
    assert.ok(ids.includes("dabbler.copySetAccomplishmentsPrompt"));
    assert.ok(!ids.includes("dabbler.copyStartNextSessionPrompt"),
      "start-next-session must not surface on complete (terminal) state");
    assert.ok(!ids.includes("dabbler.copyStartNextParallelSessionPrompt"),
      "start-next-parallel-session must not surface on complete (terminal) state");
  });

  // ----- Set 062 S2: verification-affordance entries -----

  const lwConfig = (verificationMode: "out-of-band-or-none" | "dedicated-sessions") => ({
    requiresUAT: false as const,
    requiresE2E: false as const,
    uatScope: "none",
    tier: "lightweight" as const,
    verificationMode,
    module: null,
  });

  test("copyVerificationKickoffPrompt — Lightweight Mode-B rows with no completed verification, cancelled excluded (spec D2)", () => {
    // Eligible across every non-terminal-cancelled state.
    for (const st of ["not-started", "in-progress", "complete"] as SessionState[]) {
      assert.ok(
        ids(fakeSet(st, { config: lwConfig("dedicated-sessions") }), ALL_SUPPORTED)
          .includes("dabbler.copyVerificationKickoffPrompt"),
        `kickoff missing for LW Mode-B state=${st}`,
      );
    }
    assert.ok(
      !ids(fakeSet("cancelled", { config: lwConfig("dedicated-sessions") }), ALL_SUPPORTED)
        .includes("dabbler.copyVerificationKickoffPrompt"),
      "kickoff leaked onto a cancelled row — verification on an abandoned set is not actionable",
    );
    // A completed verification session retires the handoff.
    assert.ok(
      !ids(
        fakeSet("in-progress", {
          config: lwConfig("dedicated-sessions"),
          completedVerification: { sessionNumber: 4, verdict: "VERIFIED" },
        }),
        ALL_SUPPORTED,
      ).includes("dabbler.copyVerificationKickoffPrompt"),
      "kickoff must drop once a verification session completed",
    );
    // Mode A and Full tier never offer it.
    assert.ok(
      !ids(fakeSet("complete", { config: lwConfig("out-of-band-or-none") }), ALL_SUPPORTED)
        .includes("dabbler.copyVerificationKickoffPrompt"),
      "kickoff leaked onto Mode A",
    );
    assert.ok(
      !ids(fakeSet("in-progress"), ALL_SUPPORTED)
        .includes("dabbler.copyVerificationKickoffPrompt"),
      "kickoff leaked onto a Full-tier row",
    );
    // It lives in the Copy Prompt submenu.
    const cats = categorizedActions(
      fakeSet("in-progress", { config: lwConfig("dedicated-sessions") }),
      ALL_SUPPORTED,
    );
    assert.ok(
      cats.copyEval.some((a) => a.id === "dabbler.copyVerificationKickoffPrompt"),
      "kickoff must categorize under copyEval (Copy Prompt submenu)",
    );
  });

  test("setupVerification — not-started (both modes) + complete Mode-A Lightweight rows (spec D3, S3 widening)", () => {
    // Both modes are eligible on a not-started Lightweight row (the
    // QuickPick offers both directions while no durable record exists).
    for (const mode of ["out-of-band-or-none", "dedicated-sessions"] as const) {
      assert.ok(
        ids(fakeSet("not-started", { config: lwConfig(mode) }), ALL_SUPPORTED)
          .includes("dabblerSessionSets.setupVerification"),
        `setupVerification missing for not-started LW mode=${mode}`,
      );
    }
    // Session 3: complete Mode-A rows go through the blessed writer —
    // the realistic "work done, now verify it" entry point.
    assert.ok(
      ids(
        fakeSet("complete", { config: lwConfig("out-of-band-or-none") }),
        ALL_SUPPORTED,
      ).includes("dabblerSessionSets.setupVerification"),
      "setupVerification missing on a complete Mode-A LW row (the S3 blessed-writer path)",
    );
    // Complete Mode-B rows have nothing to set up — the kickoff prompt
    // is their affordance (and B->A is never offered).
    assert.ok(
      !ids(
        fakeSet("complete", { config: lwConfig("dedicated-sessions") }),
        ALL_SUPPORTED,
      ).includes("dabblerSessionSets.setupVerification"),
      "setupVerification leaked onto a complete Mode-B row — B->A is never offered",
    );
    // In-flight rows are excluded deliberately (contention with a
    // running session); cancelled rows are terminal.
    for (const st of ["in-progress", "cancelled"] as SessionState[]) {
      assert.ok(
        !ids(fakeSet(st, { config: lwConfig("out-of-band-or-none") }), ALL_SUPPORTED)
          .includes("dabblerSessionSets.setupVerification"),
        `setupVerification leaked onto state=${st}`,
      );
    }
    // Full tier never offers it (verificationMode is inert on Full).
    for (const st of ["not-started", "complete"] as SessionState[]) {
      assert.ok(
        !ids(fakeSet(st), ALL_SUPPORTED)
          .includes("dabblerSessionSets.setupVerification"),
        `setupVerification leaked onto a Full-tier ${st} row`,
      );
    }
  });

  test("openExternalVerificationDoc — surfaced exactly on v? rows (spec step 4)", () => {
    assert.ok(
      ids(
        fakeSet("complete", {
          config: lwConfig("out-of-band-or-none"),
          verificationMarker: "v?",
        }),
        ALL_SUPPORTED,
      ).includes("dabbler.openExternalVerificationDoc"),
      "external-note action missing on a v? row",
    );
    // The derived marker already encodes every suppression rule, so
    // non-v? glyphs hide the action: v+ rows, markerless rows.
    assert.ok(
      !ids(
        fakeSet("in-progress", {
          config: lwConfig("dedicated-sessions"),
          verificationMarker: "v+",
        }),
        ALL_SUPPORTED,
      ).includes("dabbler.openExternalVerificationDoc"),
      "external-note action leaked onto a v+ (Mode-B) row",
    );
    assert.ok(
      !ids(
        fakeSet("complete", {
          config: lwConfig("out-of-band-or-none"),
          externalVerificationNoteExists: true,
          verificationMarker: "",
        }),
        ALL_SUPPORTED,
      ).includes("dabbler.openExternalVerificationDoc"),
      "external-note action should disappear once the note exists (marker cleared)",
    );
    assert.ok(
      !ids(fakeSet("complete"), ALL_SUPPORTED).includes("dabbler.openExternalVerificationDoc"),
      "external-note action leaked onto a Full-tier row",
    );
  });

  test("openExternalVerificationDoc entry carries the marker-clearing detail copy (spec step 4)", () => {
    const entry = ROW_ACTIONS.find((a) => a.id === "dabbler.openExternalVerificationDoc");
    assert.ok(entry, "entry must exist");
    assert.ok(
      entry!.detail && /clears the v\? marker/.test(entry!.detail),
      `detail must name the marker-clearing consequence; got: ${entry!.detail}`,
    );
  });
});
