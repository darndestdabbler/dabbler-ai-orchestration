import * as assert from "assert";
import {
  NODE_TOKEN,
  actionToken,
  bucketDescriptor,
  bucketNodes,
  childrenOf,
  descriptorFor,
  hasToken,
  humanizeStepKey,
  moduleDescriptor,
  moduleKeyOf,
  moduleNodes,
  preselectFromTreeNode,
  sessionDescriptor,
  sessionNodes,
  setDescriptor,
  setNodes,
  setTooltip,
  severityOf,
  stepDescriptor,
  stepNodes,
  stepRowLabel,
  stepStartLabel,
  tokenString,
} from "../../providers/workExplorerTreeModel";
import { VisibleModule } from "../../providers/SessionSetsModel";
import { ROW_ACTIONS } from "../../providers/ActionRegistry";
import { makeSession, makeSet, makeStep } from "./helpers";

function declaredModule(overrides: Partial<VisibleModule> = {}): VisibleModule {
  return {
    kind: "declared",
    slug: "greeter",
    displayName: "Greeter",
    warning: null,
    planPath: "docs/modules/greeter/project-plan.md",
    sets: [],
    ...overrides,
  };
}

suite("workExplorerTreeModel: nodes", () => {
  test("moduleNodes flags declared-module existence for every node", () => {
    const nodes = moduleNodes([
      declaredModule(),
      { ...declaredModule(), kind: "pseudo", slug: null, displayName: "Unassigned" },
    ]);
    assert.strictEqual(nodes.length, 2);
    assert.ok(nodes.every((n) => n.declaredModulesExist));
  });

  test("bucketNodes carries the owning module key so sibling buckets stay distinct", () => {
    const [node] = moduleNodes([declaredModule({ sets: [makeSet()] })]);
    const buckets = bucketNodes(node);
    assert.ok(buckets.every((b) => b.moduleKey === moduleKeyOf(node.module)));
  });

  test("setNodes wraps each set of the bucket", () => {
    const sets = [makeSet({ name: "001-a" }), makeSet({ name: "002-b" })];
    const [node] = moduleNodes([declaredModule({ sets })]);
    const bucket = bucketNodes(node).find((b) => b.bucketKey === "not-started")!;
    assert.deepStrictEqual(setNodes(bucket).map((n) => n.set.name), ["001-a", "002-b"]);
  });

  test("sessionNodes sorts by session number ascending", () => {
    const set = makeSet({
      sessions: [makeSession({ number: 3 }), makeSession({ number: 1 })],
    });
    const numbers = sessionNodes({ kind: "set", set }).map((n) => n.session.number);
    assert.deepStrictEqual(numbers, [1, 3]);
  });

  test("stepNodes mirrors the projection's step list verbatim", () => {
    const session = makeSession({
      status: "in-progress",
      steps: [makeStep({ position: 0 }), makeStep({ position: 1, stepKey: "verify" })],
    });
    const nodes = stepNodes({ kind: "session", set: makeSet(), session });
    assert.deepStrictEqual(nodes.map((n) => n.row.stepKey), ["implement", "verify"]);
  });

  test("a session without projected steps yields no step children", () => {
    const session = makeSession({ status: "complete", steps: [] });
    assert.deepStrictEqual(stepNodes({ kind: "session", set: makeSet(), session }), []);
  });

  test("childrenOf covers every level and terminates at steps", () => {
    const step = makeStep();
    const session = makeSession({ status: "in-progress", steps: [step] });
    const set = makeSet({ state: "in-progress", sessions: [session] });
    const [moduleNode] = moduleNodes([declaredModule({ sets: [set] })]);
    const bucket = childrenOf(moduleNode).find(
      (n) => n.kind === "bucket" && n.sets.length > 0,
    )!;
    const setNode = childrenOf(bucket).find(
      (n) => n.kind === "set",
    )!;
    const sessionNode = childrenOf(setNode)[0];
    const stepNode = childrenOf(sessionNode)[0];
    assert.strictEqual(stepNode.kind, "step");
    assert.deepStrictEqual(childrenOf(stepNode), []);
  });

  test("preselectFromTreeNode maps a pseudo module to the repo-level sentinel", () => {
    const [node] = moduleNodes([
      declaredModule({ kind: "pseudo", slug: null, displayName: "Default" }),
    ]);
    assert.deepStrictEqual(preselectFromTreeNode(node), { preselectedSlug: "" });
  });

  test("preselectFromTreeNode rejects non-module arguments", () => {
    assert.strictEqual(preselectFromTreeNode({ kind: "set" }), undefined);
    assert.strictEqual(preselectFromTreeNode(null), undefined);
  });
});

suite("workExplorerTreeModel: tokens", () => {
  test("tokenString wraps every token in separators on both sides", () => {
    assert.strictEqual(tokenString(["a", "b"]), ";a;b;");
  });

  test("hasToken never matches a token inside a longer kebab token", () => {
    const cv = tokenString(["act-open-spec"]);
    assert.ok(!hasToken(cv, "spec"));
    assert.ok(hasToken(cv, "act-open-spec"));
  });

  test("actionToken strips the command prefix and dots", () => {
    assert.strictEqual(
      actionToken({ id: "dabblerSessionSets.openSpec", label: "", group: 0, when: () => true }),
      "act-openSpec",
    );
    assert.strictEqual(
      actionToken({ id: "dabbler.copySessionRunPrompt", label: "", group: 0, when: () => true }),
      "act-copySessionRunPrompt",
    );
  });
});

suite("workExplorerTreeModel: severity", () => {
  test("blocked outranks everything", () => {
    const set = makeSet({
      state: "in-progress",
      unsatisfiedPrereqs: [{ slug: "x", condition: "complete", targetState: "unknown" }],
      verificationVerdict: "ISSUES_FOUND",
      duplicateNameError: { name: "n", chosenDir: "d", conflictingDirs: ["d", "e"] },
    });
    assert.strictEqual(severityOf(set), "blocked");
  });

  test("an unrecognized verdict is severe, never clean", () => {
    const set = makeSet({ verificationVerdict: "manual-override-development" });
    assert.strictEqual(severityOf(set), "verification");
  });

  test("a VERIFIED verdict carries no severity", () => {
    assert.strictEqual(severityOf(makeSet({ verificationVerdict: "VERIFIED" })), null);
  });

  test("an invariant violation surfaces when nothing worse applies", () => {
    assert.strictEqual(
      severityOf(makeSet({ invariantViolation: "rule 7" })),
      "invariant",
    );
  });
});

suite("workExplorerTreeModel: module and bucket descriptors", () => {
  test("module rows carry no icon and stay collapsible", () => {
    const [node] = moduleNodes([declaredModule()]);
    const d = moduleDescriptor(node);
    assert.strictEqual(d.icon, undefined);
    assert.strictEqual(d.collapsible, "collapsed");
    assert.ok(hasToken(d.contextValue, NODE_TOKEN.module));
  });

  test("a fallback module offers no declared capability token", () => {
    const [node] = moduleNodes([
      declaredModule({ kind: "fallback", warning: { code: "undeclared-slug", rawSlug: "x" } }),
    ]);
    const d = moduleDescriptor(node);
    assert.ok(hasToken(d.contextValue, "module-fallback"));
    assert.ok(!hasToken(d.contextValue, "module-declared"));
  });

  test("a module warning lands in the tooltip", () => {
    const [node] = moduleNodes([
      declaredModule({ kind: "pseudo", slug: null, warning: { code: "manifest-missing" } }),
    ]);
    assert.ok(moduleDescriptor(node).tooltip!.includes("docs/modules.yaml"));
  });

  test("an empty bucket renders as a leaf, not a dead twisty", () => {
    const [node] = moduleNodes([declaredModule({ sets: [] })]);
    const buckets = bucketNodes(node);
    assert.ok(buckets.every((b) => bucketDescriptor(b).collapsible === "none"));
  });

  test("bucket ids are scoped by module so labels can repeat", () => {
    const [a] = moduleNodes([declaredModule({ slug: "a", sets: [makeSet()] })]);
    const [b] = moduleNodes([declaredModule({ slug: "b", sets: [makeSet()] })]);
    const idA = bucketDescriptor(bucketNodes(a)[0]).id;
    const idB = bucketDescriptor(bucketNodes(b)[0]).id;
    assert.notStrictEqual(idA, idB);
  });
});

suite("workExplorerTreeModel: set descriptor", () => {
  test("set rows have no description; the fraction lives in the tooltip", () => {
    const set = makeSet({ state: "complete", totalSessions: 3, sessionsCompleted: 3 });
    const d = setDescriptor(set);
    assert.strictEqual(d.description, undefined);
    assert.ok(d.tooltip!.includes("3/3"));
  });

  test("a set with sessions is collapsible; without, a leaf", () => {
    assert.strictEqual(
      setDescriptor(makeSet({ sessions: [makeSession()] })).collapsible,
      "collapsed",
    );
    assert.strictEqual(setDescriptor(makeSet({ sessions: [] })).collapsible, "none");
  });

  test("the id is the set name, stable across refreshes", () => {
    assert.strictEqual(setDescriptor(makeSet({ name: "007-x" })).id, "set:007-x");
  });

  test("applicable row actions mint contextValue tokens", () => {
    const set = makeSet({ state: "in-progress" });
    const d = setDescriptor(set);
    for (const action of ROW_ACTIONS.filter((a) => a.when(set))) {
      assert.ok(hasToken(d.contextValue, actionToken(action)), action.id);
    }
  });

  test("a cancelled set offers restore but not cancel", () => {
    const d = setDescriptor(makeSet({ state: "cancelled" }));
    assert.ok(hasToken(d.contextValue, "act-restore"));
    assert.ok(!hasToken(d.contextValue, "act-cancel"));
  });

  test("the icon follows lifecycle state, never marker severity", () => {
    const set = makeSet({
      state: "in-progress",
      unsatisfiedPrereqs: [{ slug: "x", condition: "complete", targetState: "unknown" }],
    });
    const d = setDescriptor(set);
    assert.deepStrictEqual(d.icon, { kind: "file", slug: "in-progress.svg" });
  });

  test("tooltip surfaces the forced-close bypass", () => {
    assert.ok(
      setTooltip(makeSet({ forceClosed: true })).includes("--force bypass"),
    );
  });

  test("tooltip flags an unrecognized verdict instead of laundering it", () => {
    const tip = setTooltip(makeSet({ verificationVerdict: "sounds-fine" }));
    assert.ok(tip.includes("not a recognized verdict"));
  });

  test("tooltip names a sub-current on-disk schema without nagging per row", () => {
    const tip = setTooltip(makeSet({ schemaVersionOnDisk: 3 }));
    assert.ok(tip.includes("schema v3"));
  });

  test("tooltip surfaces a duplicate-name collision with the chosen copy", () => {
    const tip = setTooltip(
      makeSet({
        duplicateNameError: { name: "n", chosenDir: "D:/a", conflictingDirs: ["D:/a", "D:/b"] },
      }),
    );
    assert.ok(tip.includes("Duplicate session-set name"));
    assert.ok(tip.includes("D:/a"));
  });
});

suite("workExplorerTreeModel: session descriptor", () => {
  test("only the in-flight session carries a description", () => {
    const inFlight = sessionDescriptor({
      kind: "session",
      set: makeSet(),
      session: makeSession({ status: "in-progress", iconKey: "in-progress" }),
    });
    const done = sessionDescriptor({
      kind: "session",
      set: makeSet(),
      session: makeSession(),
    });
    assert.strictEqual(inFlight.description, "in flight");
    assert.strictEqual(done.description, undefined);
  });

  test("a session with steps is collapsible; without, a leaf", () => {
    const withSteps = sessionDescriptor({
      kind: "session",
      set: makeSet(),
      session: makeSession({ status: "in-progress", steps: [makeStep()] }),
    });
    const leaf = sessionDescriptor({
      kind: "session",
      set: makeSet(),
      session: makeSession(),
    });
    assert.strictEqual(withSteps.collapsible, "collapsed");
    assert.strictEqual(leaf.collapsible, "none");
  });

  test("the icon comes from the projection's glyph key", () => {
    const d = sessionDescriptor({
      kind: "session",
      set: makeSet(),
      session: makeSession({ iconKey: "cancelled" }),
    });
    assert.deepStrictEqual(d.icon, { kind: "file", slug: "cancelled.svg" });
  });

  test("a session verdict lands in the tooltip", () => {
    const d = sessionDescriptor({
      kind: "session",
      set: makeSet(),
      session: makeSession({ verificationVerdict: "VERIFIED" }),
    });
    assert.ok(d.tooltip!.includes("VERIFIED"));
  });

  test("an untitled session falls back to its number", () => {
    const d = sessionDescriptor({
      kind: "session",
      set: makeSet(),
      session: makeSession({ number: 4, title: "" }),
    });
    assert.strictEqual(d.label, "Session 4");
  });
});

suite("workExplorerTreeModel: step rows", () => {
  test("humanizeStepKey turns kebab and snake case into a sentence word", () => {
    assert.strictEqual(humanizeStepKey("verify-changes"), "Verify changes");
    assert.strictEqual(humanizeStepKey("run_tests"), "Run tests");
  });

  test("stepRowLabel prefers the key, then truncated description, then position", () => {
    assert.strictEqual(stepRowLabel(makeStep({ stepKey: "close-out" })), "Close out");
    const longDescription = "d".repeat(80);
    const noKey = makeStep({ stepKey: null, description: longDescription });
    assert.strictEqual(stepRowLabel(noKey).length, 58);
    const bare = makeStep({ stepKey: null, description: "", stepNumber: null, position: 2 });
    assert.strictEqual(stepRowLabel(bare), "Step 3");
  });

  test("stepStartLabel renders HH:MM- and nothing for unparseable input", () => {
    assert.match(stepStartLabel("2026-08-17T09:06:00-04:00"), /^\d{2}:\d{2}-$/);
    assert.strictEqual(stepStartLabel("not-a-date"), "");
    assert.strictEqual(stepStartLabel(null), "");
  });

  test("a derived active step reads as in progress, not as not started", () => {
    const node = {
      kind: "step" as const,
      set: makeSet(),
      session: makeSession(),
      row: makeStep({ isActive: true, iconKey: "in-progress" }),
    };
    const d = stepDescriptor(node);
    assert.ok(d.tooltip!.includes("derived from the plan"));
    assert.ok(hasToken(d.contextValue, "step-active"));
    assert.deepStrictEqual(d.icon, { kind: "file", slug: "in-progress.svg" });
  });

  test("step ids disambiguate by position so shared keys cannot collide", () => {
    const a = stepDescriptor({
      kind: "step",
      set: makeSet(),
      session: makeSession(),
      row: makeStep({ position: 0 }),
    });
    const b = stepDescriptor({
      kind: "step",
      set: makeSet(),
      session: makeSession(),
      row: makeStep({ position: 1 }),
    });
    assert.notStrictEqual(a.id, b.id);
  });

  test("an unplanned logged step carries the step-logged token", () => {
    const d = stepDescriptor({
      kind: "step",
      set: makeSet(),
      session: makeSession(),
      row: makeStep({ isPlanned: false }),
    });
    assert.ok(hasToken(d.contextValue, "step-logged"));
  });

  test("a started step shows its start time in the description slot", () => {
    const d = stepDescriptor({
      kind: "step",
      set: makeSet(),
      session: makeSession(),
      row: makeStep({ startedAt: "2026-08-17T09:06:00-04:00" }),
    });
    assert.match(d.description ?? "", /^\d{2}:\d{2}-$/);
  });
});

suite("workExplorerTreeModel: descriptorFor dispatch", () => {
  test("every node kind resolves to a descriptor with a stable id", () => {
    const step = makeStep();
    const session = makeSession({ status: "in-progress", steps: [step] });
    const set = makeSet({ state: "in-progress", sessions: [session] });
    const [moduleNode] = moduleNodes([declaredModule({ sets: [set] })]);
    const bucket = childrenOf(moduleNode).find(
      (n) => n.kind === "bucket" && n.sets.length > 0,
    )!;
    const setNode = childrenOf(bucket).find((n) => n.kind === "set")!;
    const sessionNode = childrenOf(setNode)[0];
    const stepNode = childrenOf(sessionNode)[0];
    for (const node of [moduleNode, bucket, setNode, sessionNode, stepNode]) {
      const d = descriptorFor(node);
      assert.ok(d.id.length > 0, node.kind);
      assert.ok(d.contextValue.startsWith(";"), node.kind);
    }
  });
});
