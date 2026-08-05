// Set 110 Session 2 — the visible-module assembly, extracted from
// `CustomSessionSetsView.buildModules` so the webview and the native
// tree compute one module list.
//
// The extraction is only worth anything if it PRESERVES behaviour, so
// these tests pin the two properties that were previously locked inside
// a private method and therefore untested at Layer 2: cross-root
// merging, and the last-known-good retention that stops an invalid
// `docs/modules.yaml` from blanking the view.

import * as assert from "assert";
import { SessionSet } from "../../types";
import { ModulesManifestClassification } from "../../utils/moduleAuthoring";
import { VisibleModule } from "../../providers/SessionSetsModel";
import {
  INVALID_MANIFEST_MESSAGE,
  ModuleAssemblyIo,
  assembleVisibleModules,
} from "../../providers/moduleAssembly";

function fakeSet(over: Partial<SessionSet> = {}): SessionSet {
  return {
    name: "001-set",
    module: null,
    moduleTitle: null,
    moduleOrder: null,
    dir: "/r/001-set",
    specPath: "/r/001-set/spec.md",
    activityPath: "/r/001-set/activity-log.json",
    changeLogPath: "/r/001-set/change-log.md",
    statePath: "/r/001-set/session-state.json",
    aiAssignmentPath: "/r/001-set/ai-assignment.md",
    uatChecklistPath: "/r/001-set/uat.json",
    state: "not-started",
    totalSessions: 1,
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
    root: "/r",
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
    sessions: [],
    ...over,
  };
}

const present = (
  ...entries: { slug: string; title: string }[]
): ModulesManifestClassification => ({
  kind: "present",
  entries: entries.map((e) => ({
    slug: e.slug,
    title: e.title,
    codeRoots: [],
    planPath: null,
    touches: [],
  })),
});

function io(over: Partial<ModuleAssemblyIo> = {}): ModuleAssemblyIo {
  return {
    workspaceRoots: () => ["/r"],
    classify: () => ({ kind: "absent" }),
    legacyRootPlanExists: () => false,
    rootLabel: (root) => root.split("/").pop() ?? root,
    ...over,
  };
}

suite("Set 110 S2 — module assembly (shared by both Explorer surfaces)", () => {
  test("declared modules render in manifest order, pseudo last", () => {
    const sets = [
      fakeSet({ name: "a", config: { ...fakeSet().config, module: "beta" } }),
      fakeSet({ name: "b", config: { ...fakeSet().config, module: "alpha" } }),
      fakeSet({ name: "c" }),
    ];
    const { modules } = assembleVisibleModules(
      sets,
      io({ classify: () => present({ slug: "alpha", title: "Alpha" }, { slug: "beta", title: "Beta" }) }),
      new Map(),
    );
    assert.deepStrictEqual(
      modules.map((m) => m.displayName),
      ["Alpha", "Beta", "Unassigned"],
    );
  });

  test("a root with no sets still contributes its declared modules", () => {
    // The workspace root is unioned with every set's root, so an empty
    // repo still renders its manifest rather than an empty tree.
    const { modules } = assembleVisibleModules(
      [],
      io({ classify: () => present({ slug: "core", title: "Core" }) }),
      new Map(),
    );
    assert.deepStrictEqual(modules.map((m) => m.displayName), ["Core"]);
  });

  test("an INVALID manifest keeps the last good tree and reports a fault", () => {
    const good = new Map<string, readonly VisibleModule[]>();
    const sets = [fakeSet({ config: { ...fakeSet().config, module: "core" } })];

    // First pass: healthy manifest primes the cache.
    const first = assembleVisibleModules(
      sets,
      io({ classify: () => present({ slug: "core", title: "Core" }) }),
      good,
    );
    assert.deepStrictEqual(first.modules.map((m) => m.displayName), ["Core"]);
    assert.deepStrictEqual(first.manifestFaults, []);

    // Second pass: the operator breaks the YAML mid-edit.
    const second = assembleVisibleModules(
      sets,
      io({ classify: () => ({ kind: "invalid" }) }),
      good,
    );
    assert.deepStrictEqual(
      second.modules.map((m) => m.displayName),
      ["Core"],
      "an invalid manifest must not blank the view",
    );
    assert.strictEqual(second.manifestFaults.length, 1);
    assert.strictEqual(second.manifestFaults[0].retainedLastKnownGood, true);
    assert.strictEqual(second.manifestFaults[0].message, INVALID_MANIFEST_MESSAGE);
    assert.strictEqual(second.manifestFaults[0].rootLabel, "r");
  });

  test("an invalid manifest with NO prior good tree still fails loud", () => {
    const { modules, manifestFaults } = assembleVisibleModules(
      [fakeSet({ config: { ...fakeSet().config, module: "core" } })],
      io({ classify: () => ({ kind: "invalid" }) }),
      new Map(),
    );
    assert.strictEqual(manifestFaults.length, 1);
    assert.strictEqual(manifestFaults[0].retainedLastKnownGood, false);
    // The work is still visible — never hide work. An undeclared stamp
    // becomes a fallback group rather than vanishing.
    assert.ok(modules.length > 0);
  });

  test("sets discovered in a second root merge into the same declared module", () => {
    const sets = [
      fakeSet({ name: "a", root: "/r", config: { ...fakeSet().config, module: "core" } }),
      fakeSet({ name: "b", root: "/worktree", config: { ...fakeSet().config, module: "core" } }),
    ];
    const { modules } = assembleVisibleModules(
      sets,
      io({
        workspaceRoots: () => ["/r"],
        classify: () => present({ slug: "core", title: "Core" }),
      }),
      new Map(),
    );
    const core = modules.filter((m) => m.slug === "core");
    assert.strictEqual(core.length, 1, "one module row per slug across roots");
    assert.strictEqual(core[0].sets.length, 2);
  });
});
