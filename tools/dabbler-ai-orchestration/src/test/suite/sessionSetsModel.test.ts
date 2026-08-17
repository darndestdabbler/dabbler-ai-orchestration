import * as assert from "assert";
import {
  BLOCKED_MARKER,
  PSEUDO_MODULE_COEXIST_NAME,
  PSEUDO_MODULE_SOLE_NAME,
  blockedMarker,
  blockedTooltip,
  bucketSets,
  chooseRenderableModuleSnapshot,
  computeVisibleModules,
  forceClosedBadge,
  kindBadge,
  kindTooltip,
  mergeVisibleModules,
  orderedBuckets,
  progressText,
  sortBucket,
  verdictIsUnclean,
} from "../../providers/SessionSetsModel";
import { listInProgressSets } from "../../providers/inProgressSetsService";
import { makeSet } from "./helpers";

suite("SessionSetsModel: row text", () => {
  test("progressText shows X/total with the Complete annotation", () => {
    const set = makeSet({ state: "complete", totalSessions: 3, sessionsCompleted: 3 });
    assert.strictEqual(progressText(set), "3/3 Complete");
  });

  test("progressText surfaces a mid-set completion discrepancy truthfully", () => {
    const set = makeSet({ state: "complete", totalSessions: 5, sessionsCompleted: 3 });
    assert.strictEqual(progressText(set), "3/5 Complete");
  });

  test("progressText names the in-flight session", () => {
    const set = makeSet({
      state: "in-progress",
      totalSessions: 4,
      sessionsCompleted: 1,
      currentSession: 2,
    });
    assert.strictEqual(progressText(set), "1/4 · session 2 in flight");
  });

  test("forceClosedBadge marks only forced closes", () => {
    assert.strictEqual(forceClosedBadge(makeSet({ forceClosed: true })), "[FORCED]");
    assert.strictEqual(forceClosedBadge(makeSet()), "");
  });

  test("kind badge and tooltip render only for lifecycle sets", () => {
    assert.strictEqual(kindBadge(makeSet({ kind: "plan" })), "plan");
    assert.strictEqual(kindBadge(makeSet()), "");
    assert.ok(kindTooltip(makeSet({ kind: "decomposition" })).includes("decomposes"));
    assert.strictEqual(kindTooltip(makeSet()), "");
  });
});

suite("SessionSetsModel: blocked marker", () => {
  const prereq = { slug: "001-a", condition: "complete" as const, targetState: "in-progress" as const };

  test("renders on non-terminal rows with unsatisfied prereqs", () => {
    const set = makeSet({ state: "not-started", unsatisfiedPrereqs: [prereq] });
    assert.strictEqual(blockedMarker(set), BLOCKED_MARKER);
    assert.ok(blockedTooltip(set).includes("001-a (in progress)"));
  });

  test("suppressed on terminal rows — a closed set's dependency is not actionable", () => {
    const set = makeSet({ state: "complete", unsatisfiedPrereqs: [prereq] });
    assert.strictEqual(blockedMarker(set), "");
    assert.strictEqual(blockedTooltip(set), "");
  });

  test("the unknown-slug case is named loudly in the tooltip", () => {
    const set = makeSet({
      state: "in-progress",
      unsatisfiedPrereqs: [{ slug: "typo", condition: "complete", targetState: "unknown" }],
    });
    assert.ok(blockedTooltip(set).includes("unknown set — check the slug"));
  });
});

suite("SessionSetsModel: verdict hygiene", () => {
  test("recognized failure tokens are unclean", () => {
    assert.ok(verdictIsUnclean("ISSUES_FOUND: 2 major"));
    assert.ok(verdictIsUnclean("WAIVED"));
  });

  test("a confabulated token is unclean, never a pass", () => {
    assert.ok(verdictIsUnclean("manual-override-development"));
  });

  test("VERIFIED and absent verdicts are clean", () => {
    assert.ok(!verdictIsUnclean("VERIFIED"));
    assert.ok(!verdictIsUnclean(null));
    assert.ok(!verdictIsUnclean("  "));
  });
});

suite("SessionSetsModel: bucketing and order", () => {
  test("bucketSets splits on the four lifecycle states", () => {
    const sets = [
      makeSet({ name: "a", state: "complete" }),
      makeSet({ name: "b", state: "in-progress" }),
      makeSet({ name: "c", state: "cancelled" }),
      makeSet({ name: "d", state: "not-started" }),
    ];
    const buckets = bucketSets(sets);
    assert.deepStrictEqual(
      [buckets.complete.length, buckets.inProgress.length, buckets.cancelled.length, buckets.notStarted.length],
      [1, 1, 1, 1],
    );
  });

  test("not-started sorts by name; other buckets by lastTouched descending", () => {
    const fresh = [makeSet({ name: "b" }), makeSet({ name: "a" })];
    assert.deepStrictEqual(sortBucket(fresh, "not-started").map((s) => s.name), ["a", "b"]);
    const done = [
      makeSet({ name: "old", state: "complete", lastTouched: "2026-01-01" }),
      makeSet({ name: "new", state: "complete", lastTouched: "2026-08-01" }),
    ];
    assert.deepStrictEqual(sortBucket(done, "complete").map((s) => s.name), ["new", "old"]);
  });

  test("in-progress orders oldest in-flight first", () => {
    const sets = [
      makeSet({ name: "late", state: "in-progress", startedAt: "2026-08-10" }),
      makeSet({ name: "early", state: "in-progress", startedAt: "2026-08-01" }),
    ];
    assert.deepStrictEqual(listInProgressSets(sets).map((s) => s.name), ["early", "late"]);
  });

  test("the three default buckets always render; Cancelled only when non-empty", () => {
    const withoutCancelled = orderedBuckets([makeSet()]);
    assert.deepStrictEqual(
      withoutCancelled.map((b) => b.key),
      ["in-progress", "not-started", "complete"],
    );
    const withCancelled = orderedBuckets([makeSet({ state: "cancelled" })]);
    assert.strictEqual(withCancelled.length, 4);
    assert.strictEqual(withCancelled[3].key, "cancelled");
  });
});

suite("SessionSetsModel: visible modules", () => {
  const entry = (slug: string, title = slug) => ({
    slug,
    title,
    codeRoots: [],
    planPath: null,
    touches: [],
  });

  test("declared modules render in manifest order, even with zero sets", () => {
    const modules = computeVisibleModules(
      { kind: "present", entries: [entry("beta"), entry("alpha")] },
      [],
      { legacyRootPlanExists: false },
    );
    assert.deepStrictEqual(
      modules.filter((m) => m.kind === "declared").map((m) => m.slug),
      ["beta", "alpha"],
    );
  });

  test("an undeclared stamp becomes a warning-flagged fallback group", () => {
    const set = makeSet({ config: { module: "ghost" } });
    const modules = computeVisibleModules(
      { kind: "present", entries: [entry("real")] },
      [set],
      { legacyRootPlanExists: false },
    );
    const fallback = modules.find((m) => m.kind === "fallback")!;
    assert.strictEqual(fallback.slug, "ghost");
    assert.deepStrictEqual(fallback.warning, { code: "undeclared-slug", rawSlug: "ghost" });
  });

  test("a pristine no-manifest workspace renders the sole Default pseudo-module without a fault", () => {
    const modules = computeVisibleModules({ kind: "absent" }, [], {
      legacyRootPlanExists: false,
    });
    assert.strictEqual(modules.length, 1);
    assert.strictEqual(modules[0].displayName, PSEUDO_MODULE_SOLE_NAME);
    assert.strictEqual(modules[0].warning, null);
  });

  test("manifest-missing fires only when sets exist", () => {
    const modules = computeVisibleModules({ kind: "absent" }, [makeSet()], {
      legacyRootPlanExists: false,
    });
    assert.deepStrictEqual(modules[0].warning, { code: "manifest-missing" });
  });

  test("the pseudo-module renames to Unassigned once other groups coexist", () => {
    const modules = computeVisibleModules(
      { kind: "present", entries: [entry("real")] },
      [makeSet({ config: { module: null } })],
      { legacyRootPlanExists: false },
    );
    const pseudo = modules.find((m) => m.kind === "pseudo")!;
    assert.strictEqual(pseudo.displayName, PSEUDO_MODULE_COEXIST_NAME);
    assert.deepStrictEqual(pseudo.warning, { code: "unstamped-sets" });
  });

  test("the legacy root plan keeps the pseudo-module visible with every set stamped", () => {
    const modules = computeVisibleModules(
      { kind: "present", entries: [entry("real")] },
      [makeSet({ config: { module: "real" } })],
      { legacyRootPlanExists: true },
    );
    assert.ok(modules.some((m) => m.kind === "pseudo"));
  });

  test("an invalid manifest keeps the last-known-good tree", () => {
    const lastGood = computeVisibleModules(
      { kind: "present", entries: [entry("real")] },
      [],
      { legacyRootPlanExists: false },
    );
    const snapshot = chooseRenderableModuleSnapshot({ kind: "invalid" }, [], lastGood);
    assert.strictEqual(snapshot.retainedLastKnownGood, true);
    assert.strictEqual(snapshot.modules, lastGood);
  });

  test("mergeVisibleModules unions declared slugs and keeps one pseudo-module last", () => {
    const rootA = computeVisibleModules(
      { kind: "present", entries: [entry("shared")] },
      [makeSet({ name: "001-a", config: { module: "shared" } })],
      { legacyRootPlanExists: false },
    );
    const rootB = computeVisibleModules(
      { kind: "present", entries: [entry("shared")] },
      [makeSet({ name: "002-b", config: { module: "shared" } }), makeSet({ name: "003-c" })],
      { legacyRootPlanExists: false },
    );
    const merged = mergeVisibleModules([rootA, rootB]);
    const shared = merged.find((m) => m.slug === "shared")!;
    assert.strictEqual(shared.sets.length, 2);
    assert.strictEqual(merged[merged.length - 1].kind, "pseudo");
  });
});
