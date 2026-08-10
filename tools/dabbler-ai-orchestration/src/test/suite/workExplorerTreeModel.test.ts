// Set 110 Session 2 — the native Work Explorer tree's view model.
//
// These assertions are the behavioural contract Session 3 will re-express
// the old DOM suite against, and several of them pin decisions that
// REVERSED an earlier assumption on spike evidence. Where that is so, the
// test says which reversal it is protecting, because a future reader who
// does not know will read them as arbitrary and "fix" them back:
//
//   * a set row has NO description. The fraction was removed outright,
//     not moved — `TreeItem.description` is dropped when the label
//     truncates, and every real set name truncates at working width.
//   * status rows use the operator's supplied lifecycle icons consistently;
//     marker severity remains in the tooltip and context value.
//   * a session set reports Collapsed, never Expanded, so the fourth
//     level costs nothing until it is opened.

import * as assert from "assert";
import { SessionRecord, SessionSet } from "../../types";
import { ActionSupports, ROW_ACTIONS } from "../../providers/ActionRegistry";
import { VisibleModule } from "../../providers/SessionSetsModel";
import {
  MODULE_TOKEN,
  NODE_TOKEN,
  actionToken,
  bucketDescriptor,
  bucketNodes,
  childrenOf,
  hasToken,
  moduleDescriptor,
  moduleNodes,
  preselectFromTreeNode,
  sessionDescriptor,
  sessionNodes,
  setDescriptor,
  setNodes,
  setTooltip,
  severityOf,
  setIcon,
  stepDescriptor,
  stepNodes,
  verdictIsUnclean,
} from "../../providers/workExplorerTreeModel";

const SUPPORTS: ActionSupports = { uat: true, e2e: true };

function fakeSet(over: Partial<SessionSet> = {}): SessionSet {
  return {
    name: "001-example-set",
    module: null,
    moduleTitle: null,
    moduleOrder: null,
    dir: "/x/001-example-set",
    specPath: "/x/001-example-set/spec.md",
    activityPath: "/x/001-example-set/activity-log.json",
    changeLogPath: "/x/001-example-set/change-log.md",
    statePath: "/x/001-example-set/session-state.json",
    aiAssignmentPath: "/x/001-example-set/ai-assignment.md",
    uatChecklistPath: "/x/001-example-set/uat.json",
    state: "not-started",
    totalSessions: 4,
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
    sessions: [],
    ...over,
  };
}

function ledger(...statuses: SessionRecord["status"][]): SessionRecord[] {
  return statuses.map((status, i) => ({
    number: i + 1,
    title: `Session ${i + 1}`,
    status,
  }));
}

function fakeModule(over: Partial<VisibleModule> = {}): VisibleModule {
  return {
    kind: "declared",
    slug: "core",
    displayName: "Orchestration Core",
    warning: null,
    planPath: "docs/planning/core-plan.md",
    sets: [],
    ...over,
  };
}

suite("Set 110 S2 — Work Explorer tree shape", () => {
  test("four levels, each resolved from its parent", () => {
    const set = fakeSet({ name: "007-thing", state: "in-progress", sessions: ledger("complete", "in-progress") });
    const modules = moduleNodes([fakeModule({ sets: [set] })]);
    assert.strictEqual(modules.length, 1);
    assert.strictEqual(modules[0].kind, "module");

    const buckets = childrenOf(modules[0]);
    // The three default buckets always render; Cancelled only when non-empty.
    assert.deepStrictEqual(
      buckets.map((b) => (b.kind === "bucket" ? b.label : "?")),
      ["In Progress", "Not Started", "Complete"],
    );

    const inProgress = buckets[0];
    assert.strictEqual(inProgress.kind, "bucket");
    const sets = childrenOf(inProgress);
    assert.strictEqual(sets.length, 1);
    assert.strictEqual(sets[0].kind, "set");

    const sessions = childrenOf(sets[0]);
    assert.strictEqual(sessions.length, 2);
    assert.deepStrictEqual(
      sessions.map((s) => (s.kind === "session" ? s.session.number : -1)),
      [1, 2],
    );
    // A COMPLETE session is a leaf: the fifth level (Set 114 S3) belongs
    // to the session in flight, which is session 2 here.
    assert.deepStrictEqual(childrenOf(sessions[0]), []);
  });

  test("session rows sort by number even when the ledger does not", () => {
    const set = fakeSet({
      sessions: [
        { number: 3, title: "Third", status: "not-started" },
        { number: 1, title: "First", status: "complete" },
        { number: 2, title: "Second", status: "in-progress" },
      ],
    });
    assert.deepStrictEqual(
      sessionNodes({ kind: "set", set }).map((n) => n.session.number),
      [1, 2, 3],
    );
  });

  test("a set node is Collapsed when it has sessions and a LEAF when it does not", () => {
    // Operator-notes wrinkle 5: Collapsed, never Expanded — otherwise the
    // fourth level is rebuilt on every refresh, which is the cost the
    // whole migration exists to remove.
    const withSessions = setDescriptor(fakeSet({ sessions: ledger("complete") }), SUPPORTS);
    assert.strictEqual(withSessions.collapsible, "collapsed");

    // A set with no readable ledger must not offer a twisty that opens
    // onto nothing — an operator would report that as a stall.
    const withoutSessions = setDescriptor(fakeSet({ sessions: [] }), SUPPORTS);
    assert.strictEqual(withoutSessions.collapsible, "none");
  });

  test("a set record with no `sessions` field at all reads as a leaf, not a crash", () => {
    // The field is optional so Layer-2 fixtures need no update; absent
    // must behave exactly like empty.
    const legacyShaped = fakeSet();
    delete (legacyShaped as Partial<SessionSet>).sessions;
    assert.deepStrictEqual(sessionNodes({ kind: "set", set: legacyShaped }), []);
    assert.strictEqual(setDescriptor(legacyShaped, SUPPORTS).collapsible, "none");
  });

  test("bucket nodes carry their module key so identical buckets stay distinct", () => {
    const a = moduleNodes([
      fakeModule({ slug: "alpha", sets: [fakeSet({ name: "a" })] }),
      fakeModule({ slug: "beta", sets: [fakeSet({ name: "b" })] }),
    ]);
    const keysA = bucketNodes(a[0]).map((b) => b.moduleKey);
    const keysB = bucketNodes(a[1]).map((b) => b.moduleKey);
    assert.notStrictEqual(keysA[0], keysB[0]);
  });
});

suite("Set 110 S2 — stable row identity", () => {
  // VS Code preserves selection and EXPANSION state by `TreeItem.id`, and
  // derives one from the label when it is absent. Both failure modes are
  // invisible to every other gate in the build and present to an operator
  // as the tree folding itself up — this extension refreshes on every
  // watcher tick AND polls every 30 seconds.
  const tree = () => {
    const setA = fakeSet({ name: "001-a", state: "in-progress", sessions: ledger("complete", "in-progress") });
    const setB = fakeSet({ name: "002-b", state: "in-progress" });
    const modules = moduleNodes([
      fakeModule({ slug: "core", displayName: "Core", sets: [setA] }),
      fakeModule({ slug: "ui", displayName: "UI", sets: [setB] }),
    ]);
    const ids: string[] = [];
    for (const m of modules) {
      ids.push(moduleDescriptor(m).id);
      for (const b of bucketNodes(m)) {
        ids.push(bucketDescriptor(b).id);
        for (const s of setNodes(b)) {
          ids.push(setDescriptor(s.set, SUPPORTS).id);
          for (const sess of sessionNodes(s)) ids.push(sessionDescriptor(sess).id);
        }
      }
    }
    return ids;
  };

  test("every row id is unique across the whole tree", () => {
    const ids = tree();
    assert.strictEqual(
      new Set(ids).size,
      ids.length,
      `duplicate row ids: ${ids.filter((v, i) => ids.indexOf(v) !== i).join(", ")}`,
    );
  });

  test("identical bucket labels under different modules do NOT collide", () => {
    // "In Progress" exists under every module. A label-derived id would
    // tie their expansion state together.
    const ids = tree().filter((id) => id.startsWith("bucket:"));
    const inProgress = ids.filter((id) => id.endsWith("/in-progress"));
    assert.strictEqual(inProgress.length, 2);
    assert.notStrictEqual(inProgress[0], inProgress[1]);
  });

  test("ids are stable across rebuilds — the property expansion state depends on", () => {
    assert.deepStrictEqual(tree(), tree());
  });
});

suite("Set 110 S2 — the density trade, as rendered", () => {
  test("a set row carries NO description — the fraction was removed, not moved", () => {
    // s1-migration-decision.md §4: `TreeItem.description` is dropped
    // entirely when the label truncates, and every real dabbler set name
    // truncates at the operator's working panel width. The operator chose
    // removal over a value that only appears on a wide panel. Restoring a
    // description here would reinstate an invisible field.
    const d = setDescriptor(fakeSet({ sessionsCompleted: 3, totalSessions: 5 }), SUPPORTS);
    assert.strictEqual(d.description, undefined);
  });

  test("the label keeps the numeric prefix — labels truncate from the right", () => {
    const d = setDescriptor(fakeSet({ name: "110-work-explorer-native-treeview" }), SUPPORTS);
    assert.strictEqual(d.label, "110-work-explorer-native-treeview");
  });

  test("progress survives in the tooltip even though the row does not show it", () => {
    const tip = setTooltip(fakeSet({ sessionsCompleted: 3, totalSessions: 5 }));
    assert.ok(tip.includes("3/5"), tip);
  });

  test("the tooltip carries EVERY marker the webview showed inline", () => {
    const set = fakeSet({
      name: "087-worst-case",
      state: "in-progress",
      needsMigration: true,
      schemaVersionOnDisk: 3,
      unsatisfiedPrereqs: [{ slug: "086-prior", condition: "complete", targetState: "in-progress" }],
      blockedByPrereqs: true,
      duplicateNameError: {
        name: "087-worst-case",
        chosenDir: "/a/087-worst-case",
        conflictingDirs: ["/a/087-worst-case", "/b/087-worst-case"],
      },
      liveSession: {
        currentSession: 2,
        status: "in-progress",
        orchestrator: null,
        startedAt: null,
        completedAt: null,
        verificationVerdict: "WAIVED",
        forceClosed: null,
        completedSessions: [1],
      },
    });
    const tip = setTooltip(set);
    for (const fragment of ["086-prior", "schema v3", "WAIVED", "Duplicate session-set name"]) {
      assert.ok(tip.includes(fragment), `tooltip missing "${fragment}":\n${tip}`);
    }
  });

  test("an unrecognized verdict is flagged in the tooltip, never laundered", () => {
    // Set 086: the confabulated `manual-override-development` verdict must
    // not read as a clean pass on any surface.
    const tip = setTooltip(
      fakeSet({
        liveSession: {
          currentSession: null,
          status: "complete",
          orchestrator: null,
          startedAt: null,
          completedAt: null,
          verificationVerdict: "manual-override-development",
          forceClosed: null,
          completedSessions: [1],
        },
      }),
    );
    assert.ok(tip.includes("is not a recognized verdict"), tip);
  });

  test("session rows: status glyph plus an `in flight` note only on the live one", () => {
    // Operator ask 2 is a REMOVAL: the session-level glyph makes the
    // webview's `session N in flight` description clause redundant, and
    // only the in-progress row says anything at all.
    const set = fakeSet({ sessions: ledger("complete", "in-progress", "not-started") });
    const [done, live, todo] = sessionNodes({ kind: "set", set }).map(sessionDescriptor);
    assert.strictEqual(done.description, undefined);
    assert.strictEqual(live.description, "in flight");
    assert.strictEqual(todo.description, undefined);
    assert.deepStrictEqual(done.icon, { kind: "file", slug: "done.svg" });
    assert.deepStrictEqual(live.icon, { kind: "file", slug: "in-progress.svg" });
    assert.deepStrictEqual(todo.icon, { kind: "file", slug: "not-started.svg" });
  });

  test("bucket rows carry a set count", () => {
    const d = bucketDescriptor({
      kind: "bucket",
      moduleKey: "declared:core",
      bucketKey: "complete",
      label: "Complete",
      sets: [fakeSet({ name: "a" }), fakeSet({ name: "b" })],
    });
    assert.strictEqual(d.description, "2 sets");
    // Singular, because "1 sets" is the kind of thing an operator notices
    // every single day.
    const one = bucketDescriptor({
      kind: "bucket",
      moduleKey: "declared:core",
      bucketKey: "complete",
      label: "Complete",
      sets: [fakeSet()],
    });
    assert.strictEqual(one.description, "1 set");
  });

  test("an EMPTY bucket still renders but is a leaf", () => {
    // The three default buckets always render, including empty ones — a
    // declared module with no work yet must still show where work will
    // land. But an empty bucket must not offer a twisty that opens onto
    // nothing; the same rule a session-less set row follows.
    const empty = bucketDescriptor({
      kind: "bucket",
      moduleKey: "declared:core",
      bucketKey: "cancelled",
      label: "Cancelled",
      sets: [],
    });
    assert.strictEqual(empty.description, "0 sets");
    assert.strictEqual(empty.collapsible, "none");
  });
});

suite("Set 110 S2 — icon precedence", () => {
  const blocked = fakeSet({
    state: "in-progress",
    blockedByPrereqs: true,
    unsatisfiedPrereqs: [{ slug: "p", condition: "complete", targetState: "not-started" }],
  });

  test("marker severity does not replace the lifecycle icon", () => {
    const worstCase = fakeSet({
      ...blocked,
      needsMigration: true,
      duplicateNameError: { name: "x", chosenDir: "/a", conflictingDirs: ["/a", "/b"] },
      liveSession: {
        currentSession: null,
        status: "complete",
        orchestrator: null,
        startedAt: null,
        completedAt: null,
        verificationVerdict: "WAIVED",
        forceClosed: null,
        completedSessions: [1],
      },
    });
    assert.strictEqual(severityOf(worstCase), "blocked");
    assert.deepStrictEqual(setIcon(worstCase), { kind: "file", slug: "in-progress.svg" });
  });

  test("ranks remaining severities, each when nothing more severe applies", () => {
    assert.strictEqual(severityOf(fakeSet({ needsMigration: true })), "migration");
    assert.strictEqual(
      severityOf(
        fakeSet({
          liveSession: {
            currentSession: null,
            status: "complete",
            orchestrator: null,
            startedAt: null,
            completedAt: null,
            verificationVerdict: "ISSUES_FOUND",
            forceClosed: null,
            completedSessions: [1],
          },
        }),
      ),
      "verification",
    );
    assert.strictEqual(
      severityOf(
        fakeSet({
          duplicateNameError: { name: "x", chosenDir: "/a", conflictingDirs: ["/a", "/b"] },
        }),
      ),
      "duplicate-name",
    );
  });

  test("a plain row uses the operator's run-state glyph", () => {
    assert.strictEqual(severityOf(fakeSet({ state: "complete" })), null);
    assert.deepStrictEqual(setIcon(fakeSet({ state: "complete" })), {
      kind: "file",
      slug: "done.svg",
    });
  });

  test("marker-bearing rows still use the operator's lifecycle glyphs", () => {
    assert.deepStrictEqual(setIcon(blocked), { kind: "file", slug: "in-progress.svg" });
    for (const set of [
      fakeSet({ needsMigration: true }),
      fakeSet({ duplicateNameError: { name: "x", chosenDir: "/a", conflictingDirs: ["/a", "/b"] } }),
    ]) {
      assert.deepStrictEqual(setIcon(set), { kind: "file", slug: "not-started.svg" });
    }
  });

  test("a VERIFIED verdict is not a severity; ISSUES_FOUND / WAIVED / gibberish are", () => {
    assert.strictEqual(verdictIsUnclean("VERIFIED"), false);
    assert.strictEqual(verdictIsUnclean("verified"), false);
    assert.strictEqual(verdictIsUnclean("ISSUES_FOUND"), true);
    assert.strictEqual(verdictIsUnclean("ISSUES_FOUND_RESOLVED_IN_FLIGHT"), true);
    assert.strictEqual(verdictIsUnclean("WAIVED"), true);
    assert.strictEqual(verdictIsUnclean("manual-override-development"), true);
    assert.strictEqual(verdictIsUnclean(null), false);
    assert.strictEqual(verdictIsUnclean(""), false);
    assert.strictEqual(verdictIsUnclean("   "), false);
  });
});

suite("Set 110 S2 — contextValue vocabulary", () => {
  test("tokens are delimited so a short token cannot match inside a longer one", () => {
    const cv = setDescriptor(fakeSet(), SUPPORTS).contextValue;
    assert.ok(cv.startsWith(";"), cv);
    assert.ok(cv.endsWith(";"), cv);
    // `;spec;` must NOT match inside `;act-openSpec;` — the whole reason
    // the delimiter exists rather than a \b word boundary.
    assert.strictEqual(hasToken(cv, "spec"), false);
    assert.strictEqual(hasToken(cv, "act-openSpec"), true);
  });

  test("each node kind is discriminated", () => {
    const set = fakeSet({ sessions: ledger("complete") });
    const moduleNode = moduleNodes([fakeModule({ sets: [set] })])[0];
    assert.ok(hasToken(moduleDescriptor(moduleNode).contextValue, NODE_TOKEN.module));
    assert.ok(hasToken(bucketNodes(moduleNode).map(bucketDescriptor)[0].contextValue, NODE_TOKEN.bucket));
    assert.ok(hasToken(setDescriptor(set, SUPPORTS).contextValue, NODE_TOKEN.set));
    assert.ok(
      hasToken(
        sessionDescriptor(sessionNodes({ kind: "set", set })[0]).contextValue,
        NODE_TOKEN.session,
      ),
    );
  });

  test("a set row's tokens are exactly the actions the registry says apply", () => {
    const set = fakeSet({ state: "not-started" });
    const cv = setDescriptor(set, SUPPORTS).contextValue;
    for (const action of ROW_ACTIONS) {
      assert.strictEqual(
        hasToken(cv, actionToken(action)),
        action.when(set, SUPPORTS),
        `token mismatch for ${action.id} on a not-started set`,
      );
    }
  });

  test("a cancelled row offers Restore and not Cancel; a live one, the reverse", () => {
    const cancelled = setDescriptor(fakeSet({ state: "cancelled" }), SUPPORTS).contextValue;
    assert.ok(hasToken(cancelled, "act-restore"));
    assert.strictEqual(hasToken(cancelled, "act-cancel"), false);

    const live = setDescriptor(fakeSet({ state: "in-progress" }), SUPPORTS).contextValue;
    assert.ok(hasToken(live, "act-cancel"));
    assert.strictEqual(hasToken(live, "act-restore"), false);
  });

  test("the two migrate actions are mutually exclusive", () => {
    const v3 = setDescriptor(
      fakeSet({ needsMigration: true, migrationTargetSchemaVersion: 3 }),
      SUPPORTS,
    ).contextValue;
    assert.ok(hasToken(v3, "act-migrate"));
    assert.strictEqual(hasToken(v3, "act-migrateToV4"), false);

    const v4 = setDescriptor(
      fakeSet({ needsMigration: true, migrationTargetSchemaVersion: 4 }),
      SUPPORTS,
    ).contextValue;
    assert.ok(hasToken(v4, "act-migrateToV4"));
    assert.strictEqual(hasToken(v4, "act-migrate"), false);
  });
});

suite("Set 110 S2 — module rows and their capability gating", () => {
  test("a declared module can be planned, renamed and deleted", () => {
    const node = moduleNodes([fakeModule({ sets: [fakeSet()] })])[0];
    const cv = moduleDescriptor(node).contextValue;
    assert.ok(hasToken(cv, MODULE_TOKEN.declared));
    assert.ok(hasToken(cv, MODULE_TOKEN.canOpenPlan));
    assert.ok(hasToken(cv, MODULE_TOKEN.canManage));
    assert.strictEqual(hasToken(cv, MODULE_TOKEN.canAssignLegacy), false);
  });

  test("a FALLBACK module renders but offers nothing — there is no manifest entry to act on", () => {
    const node = moduleNodes([
      fakeModule({
        kind: "fallback",
        slug: "ghost",
        displayName: "ghost",
        planPath: null,
        warning: { code: "undeclared-slug", rawSlug: "ghost" },
        sets: [fakeSet()],
      }),
    ])[0];
    const cv = moduleDescriptor(node).contextValue;
    assert.ok(hasToken(cv, MODULE_TOKEN.fallback));
    for (const t of [MODULE_TOKEN.canOpenPlan, MODULE_TOKEN.canManage, MODULE_TOKEN.canAssignLegacy]) {
      assert.strictEqual(hasToken(cv, t), false, `fallback module must not offer ${t}`);
    }
  });

  test("the pseudo module gets Assign-legacy only when a declared module exists to assign INTO", () => {
    const alone = moduleNodes([
      fakeModule({ kind: "pseudo", slug: null, displayName: "Default", sets: [fakeSet()] }),
    ])[0];
    assert.strictEqual(
      hasToken(moduleDescriptor(alone).contextValue, MODULE_TOKEN.canAssignLegacy),
      false,
    );

    const coexisting = moduleNodes([
      fakeModule({ sets: [] }),
      fakeModule({ kind: "pseudo", slug: null, displayName: "Unassigned", sets: [fakeSet()] }),
    ])[1];
    assert.ok(hasToken(moduleDescriptor(coexisting).contextValue, MODULE_TOKEN.canAssignLegacy));
    // …and it never offers rename/delete, which target manifest entries.
    assert.strictEqual(
      hasToken(moduleDescriptor(coexisting).contextValue, MODULE_TOKEN.canManage),
      false,
    );
  });

  test("a module warning stays in the tooltip without a module icon", () => {
    const node = moduleNodes([
      fakeModule({ warning: { code: "manifest-invalid" }, sets: [fakeSet()] }),
    ])[0];
    const d = moduleDescriptor(node);
    assert.strictEqual(d.icon, undefined);
    assert.ok(d.tooltip && d.tooltip.includes("invalid"), d.tooltip);
  });

  test("status buckets use their matching lifecycle glyph", () => {
    for (const bucketKey of ["in-progress", "not-started", "complete", "cancelled"] as const) {
      const d = bucketDescriptor({
        kind: "bucket",
        moduleKey: "declared:core",
        bucketKey,
        label: bucketKey,
        sets: [],
      });
      const expectedSlug = bucketKey === "complete" ? "done.svg" : `${bucketKey}.svg`;
      assert.deepStrictEqual(d.icon, { kind: "file", slug: expectedSlug });
    }
  });
});

suite("Set 110 S2 — module targeting from a tree row", () => {
  test("a module node supplies its slug; the pseudo module supplies the repo-level sentinel", () => {
    const declared = moduleNodes([fakeModule({ slug: "core" })])[0];
    assert.deepStrictEqual(preselectFromTreeNode(declared), { preselectedSlug: "core" });

    const pseudo = moduleNodes([fakeModule({ kind: "pseudo", slug: null })])[0];
    assert.deepStrictEqual(preselectFromTreeNode(pseudo), { preselectedSlug: "" });
  });

  test("a Command Palette invocation carries no node and keeps its own picker", () => {
    // This is the property that makes reusing the existing command ids
    // safe: no argument means unchanged pre-110 behaviour.
    for (const arg of [undefined, null, "core", 7, {}, { kind: "set" }]) {
      assert.strictEqual(preselectFromTreeNode(arg), undefined, `unexpected preselect for ${JSON.stringify(arg)}`);
    }
  });
});

suite("Set 110 S2 — bucket ordering is shared with the webview, not re-implemented", () => {
  test("in-progress ordering comes from listInProgressSets, not from the node builder", () => {
    // If this ever diverges, the two surfaces Session 2 ships side by
    // side would disagree about row order, which would make the
    // comparison they exist for meaningless.
    //
    // The shared rule is `startedAt` ASCENDING — oldest in-flight set
    // first. Note it is NOT `lastTouched`, which is what the other three
    // buckets sort on; the assertion is written against the real rule
    // rather than the plausible one, because a test that agreed with a
    // guess would have passed while the tree diverged.
    const live = (name: string, startedAt: string) =>
      fakeSet({
        name,
        state: "in-progress",
        lastTouched: "2026-08-01",
        liveSession: {
          currentSession: 1,
          status: "in-progress",
          orchestrator: null,
          startedAt,
          completedAt: null,
          verificationVerdict: null,
          forceClosed: null,
          completedSessions: [],
        },
      });
    const buckets = bucketNodes(
      moduleNodes([
        fakeModule({ sets: [live("newer", "2026-08-01T00:00:00Z"), live("older", "2026-01-01T00:00:00Z")] }),
      ])[0],
    );
    assert.deepStrictEqual(
      setNodes(buckets[0]).map((n) => n.set.name),
      ["older", "newer"],
    );
  });

  test("Cancelled renders only when it has content", () => {
    const withoutCancelled = bucketNodes(moduleNodes([fakeModule({ sets: [fakeSet()] })])[0]);
    assert.strictEqual(withoutCancelled.length, 3);

    const withCancelled = bucketNodes(
      moduleNodes([fakeModule({ sets: [fakeSet(), fakeSet({ name: "z", state: "cancelled" })] })])[0],
    );
    assert.strictEqual(withCancelled.length, 4);
    assert.strictEqual(withCancelled[3].label, "Cancelled");
  });
});

suite("Set 114 S3 — the fifth level: an in-flight session's steps", () => {
  // The half Set 111 S4 recorded and deliberately did not build. The row
  // CONTENT is proven against the cross-language corpus in
  // `sessionStepModel.test.ts`; what is asserted here is the tree-shape
  // contract around it — which rows expand, which stay leaves, and what
  // an unreadable ledger degrades to.

  const PLAN = [
    { sessionNumber: 2, stepNumber: 1, stepKey: "register", description: "Register.", status: "pending", kind: "plan-step" },
    { sessionNumber: 2, stepNumber: 2, stepKey: "build-it", description: "Build it.", status: "pending", kind: "plan-step" },
  ];
  const LOGGED = [
    { sessionNumber: 2, stepNumber: 1, stepKey: "registration", description: "Registered.", status: "complete" },
  ];
  const SPEC_STEPS = ["Register.", "Build it."];

  function inFlightSet(over: Partial<SessionSet> = {}): SessionSet {
    return fakeSet({
      name: "114-live",
      state: "in-progress",
      sessions: ledger("complete", "in-progress", "not-started"),
      stepLedger: {
        sessionNumber: 2,
        entries: [...PLAN, ...LOGGED],
        specSteps: SPEC_STEPS,
      },
      ...over,
    });
  }

  function sessionNode(set: SessionSet, number: number) {
    const node = sessionNodes({ kind: "set", set }).find(
      (n) => n.session.number === number,
    );
    assert.ok(node, `no session ${number} on ${set.name}`);
    return node;
  }

  test("the in-flight session expands to its reconciled steps", () => {
    const set = inFlightSet();
    const steps = childrenOf(sessionNode(set, 2));
    assert.deepStrictEqual(
      steps.map((s) => (s.kind === "step" ? [s.row.stepKey, s.row.status, s.row.isPlanned] : ["?"])),
      [
        ["registration", "complete", false],
        ["build-it", "pending", true],
      ],
    );
    // The fifth level is the last one.
    assert.deepStrictEqual(childrenOf(steps[0]), []);
  });

  test("a session that is not in flight is a leaf, however full the ledger", () => {
    // The checklist answers "where is THIS session". A finished session is
    // answered by its own status glyph, and its steps stay one click away
    // in the activity log (decisions.jsonl, session 3).
    const set = inFlightSet();
    for (const n of [1, 3]) {
      assert.deepStrictEqual(stepNodes(sessionNode(set, n)), []);
      assert.strictEqual(sessionDescriptor(sessionNode(set, n)).collapsible, "none");
    }
    assert.strictEqual(sessionDescriptor(sessionNode(set, 2)).collapsible, "collapsed");
  });

  test("an absent or unreadable activity log degrades to NO children", () => {
    // Spec step 3, stated as the failure to avoid: no children is the
    // right answer; a stale or invented list is not.
    for (const ledgerValue of [undefined, null]) {
      const set = inFlightSet({ stepLedger: ledgerValue });
      assert.deepStrictEqual(stepNodes(sessionNode(set, 2)), []);
      assert.strictEqual(sessionDescriptor(sessionNode(set, 2)).collapsible, "none");
    }
  });

  test("a ledger about a DIFFERENT session says nothing about this one", () => {
    // A state file and an activity log that disagree. The ledger is
    // authoritative for its own session and silent about every other, so
    // the row must not borrow another session's steps.
    const set = inFlightSet({
      stepLedger: { sessionNumber: 1, entries: [...PLAN, ...LOGGED], specSteps: SPEC_STEPS },
    });
    assert.deepStrictEqual(stepNodes(sessionNode(set, 2)), []);
  });

  test("a ledger whose rows come back empty leaves the row a leaf", () => {
    const set = inFlightSet({
      stepLedger: { sessionNumber: 2, entries: [], specSteps: SPEC_STEPS },
    });
    assert.deepStrictEqual(stepNodes(sessionNode(set, 2)), []);
    assert.strictEqual(sessionDescriptor(sessionNode(set, 2)).collapsible, "none");
  });

  test("step row ids are unique and stable across a refresh", () => {
    // Without a stable, unique id VS Code derives one from the label, and
    // two steps can legitimately share a label — the tree would then tie
    // their expansion/selection state together, and the 30-second poll
    // would fold rows under the operator.
    const set = inFlightSet();
    const ids = childrenOf(sessionNode(set, 2)).map((n) =>
      n.kind === "step" ? stepDescriptor(n).id : "?",
    );
    assert.strictEqual(new Set(ids).size, ids.length);
    // A second scan builds fresh node objects; the ids must not move.
    const again = childrenOf(sessionNode(inFlightSet(), 2)).map((n) =>
      n.kind === "step" ? stepDescriptor(n).id : "?",
    );
    assert.deepStrictEqual(again, ids);
    for (const id of ids) assert.ok(id.startsWith("step:114-live/2/"), id);
  });

  test("exactly one step row carries the current-step marker", () => {
    const set = inFlightSet();
    const descriptors = childrenOf(sessionNode(set, 2)).map((n) =>
      n.kind === "step" ? stepDescriptor(n) : null,
    );
    const marked = descriptors.filter((d) => d?.description === "<- here");
    assert.strictEqual(marked.length, 1);
    // Quiet everywhere else: the marker is only findable at a glance if
    // it is the only thing in the description column.
    assert.strictEqual(
      descriptors.filter((d) => d?.description !== undefined).length,
      1,
    );
  });

  test("a step row's label is the humanized key and its tooltip carries the prose", () => {
    const set = inFlightSet();
    const [first] = childrenOf(sessionNode(set, 2));
    assert.strictEqual(first.kind, "step");
    const d = stepDescriptor(first as never);
    assert.strictEqual(d.label, "Registration");
    assert.ok(d.tooltip?.includes("Registered."), d.tooltip);
    assert.strictEqual(d.collapsible, "none");
  });

  test("step rows carry the same authored lifecycle glyphs the other rows use", () => {
    const set = inFlightSet();
    const icons = childrenOf(sessionNode(set, 2)).map((n) =>
      n.kind === "step" ? stepDescriptor(n).icon : undefined,
    );
    assert.deepStrictEqual(icons, [
      { kind: "file", slug: "done.svg" },
      { kind: "file", slug: "not-started.svg" },
    ]);
  });

  test("step rows carry their own node token and no set/session token", () => {
    // The token vocabulary is what every `when` clause gates on; a step
    // row inheriting `dabblerSession` would leak session actions onto it
    // the moment any are added.
    const set = inFlightSet();
    const [first] = childrenOf(sessionNode(set, 2));
    const cv = stepDescriptor(first as never).contextValue;
    assert.ok(hasToken(cv, NODE_TOKEN.step), cv);
    assert.ok(!hasToken(cv, NODE_TOKEN.session), cv);
    assert.ok(!hasToken(cv, NODE_TOKEN.set), cv);
    assert.ok(hasToken(cv, "step-logged"), cv);
    assert.ok(hasToken(cv, "step-complete"), cv);
  });

  test("a planned row is distinguishable from a step logged `pending`", () => {
    // `isPlanned` is carried rather than re-derived (Set 114 S2's
    // assignment note 2): "the spec promised this" and "the orchestrator
    // logged it as pending" are different facts.
    const set = inFlightSet();
    const [, second] = childrenOf(sessionNode(set, 2));
    const cv = stepDescriptor(second as never).contextValue;
    assert.ok(hasToken(cv, "step-planned"), cv);
    assert.ok(stepDescriptor(second as never).tooltip?.includes("planned"));
  });

  test("the session tooltip says how many steps are under it", () => {
    const set = inFlightSet();
    assert.ok(sessionDescriptor(sessionNode(set, 2)).tooltip?.includes("2 steps"));
    // A leaf session row says nothing about steps it does not have.
    assert.ok(!sessionDescriptor(sessionNode(set, 1)).tooltip?.includes("step"));
  });
});
