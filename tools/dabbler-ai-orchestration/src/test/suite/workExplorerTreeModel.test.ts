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
import { CloseObligations, SessionRecord, SessionSet } from "../../types";
import { ActionSupports, ROW_ACTIONS } from "../../providers/ActionRegistry";
import { VisibleModule } from "../../providers/SessionSetsModel";
import * as treeModel from "../../providers/workExplorerTreeModel";
import {
  CLOSE_OUT_GROUP_LABEL,
  MODULE_TOKEN,
  NODE_TOKEN,
  actionToken,
  asOfLabel,
  bucketDescriptor,
  bucketNodes,
  childrenOf,
  closeOutDescriptor,
  closeOutGlyph,
  closeOutNodes,
  closeOutSummary,
  hasToken,
  moduleDescriptor,
  moduleNodes,
  obligationDescriptor,
  obligationNodes,
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
  stepStartLabel,
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
    { sessionNumber: 2, stepNumber: 1, stepKey: "registration", description: "Registered.", status: "complete", dateTime: "2026-08-11T12:06:00-04:00" },
  ];
  const SPEC_STEPS = ["Register.", "Build it."];
  // Set 127 S2: the flight facts the scan lifts from `session-state.json`
  // for this same session. They belong in every fixture ledger because
  // the real one always carries them — session 2 IS in flight in this
  // set's `sessions` ledger above, so a fixture claiming otherwise would
  // be testing a shape that cannot occur.
  const FLIGHT = { inFlight: true, startedAt: "2026-08-11T11:58:00-04:00" };

  function inFlightSet(over: Partial<SessionSet> = {}): SessionSet {
    return fakeSet({
      name: "114-live",
      state: "in-progress",
      sessions: ledger("complete", "in-progress", "not-started"),
      stepLedger: {
        sessionNumber: 2,
        entries: [...PLAN, ...LOGGED],
        specSteps: SPEC_STEPS,
        flight: FLIGHT,
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

  // Set 127 S2: a THREE-step plan, so there is still a purely-planned row
  // behind the one the derivation claims. With a two-step plan every
  // unlogged row is the active one, and the tests that are about the rows
  // BEHIND it would have nothing to assert on.
  const THREE_PLAN = [
    ...PLAN,
    { sessionNumber: 2, stepNumber: 3, stepKey: "verify-close", description: "Verify, close.", status: "pending", kind: "plan-step" },
  ];
  const THREE_SPEC = [...SPEC_STEPS, "Verify, close."];

  function threePlanSet(flight = FLIGHT): SessionSet {
    return inFlightSet({
      stepLedger: {
        sessionNumber: 2,
        entries: [...THREE_PLAN, ...LOGGED],
        specSteps: THREE_SPEC,
        flight,
      },
    });
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
      stepLedger: { sessionNumber: 1, entries: [...PLAN, ...LOGGED], specSteps: SPEC_STEPS, flight: FLIGHT },
    });
    assert.deepStrictEqual(stepNodes(sessionNode(set, 2)), []);
  });

  test("a ledger whose rows come back empty leaves the row a leaf", () => {
    const set = inFlightSet({
      stepLedger: { sessionNumber: 2, entries: [], specSteps: SPEC_STEPS, flight: FLIGHT },
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

  test("the step in flight is named by its ICON, not by a marker in the description", () => {
    // Set 115 S4, finishing Set 120 S3's operator ruling in the second
    // language. `<- here` is gone; what an operator reads instead is the
    // recorded `in-progress` status reaching the glyph.
    //
    // Planted in the arrangement the removed rule existed to handle — an
    // untouched planned row ABOVE the step actually in flight — because
    // a glyph that came from row order rather than from the ledger would
    // land on "Register" here and look entirely plausible.
    //
    // Set 127 S2 keeps this case as the DERIVATION's falsifier too: the
    // session is genuinely in flight, so the active-step rule is armed,
    // and it must still stand down because the record has answered. Two
    // rows claiming to be current is precisely the defect the marker
    // produced.
    const set = inFlightSet({
      stepLedger: {
        sessionNumber: 2,
        entries: [
          ...PLAN,
          {
            sessionNumber: 2,
            stepNumber: 2,
            stepKey: "build-it",
            description: "Halfway through building the thing.",
            status: "in-progress",
          },
        ],
        specSteps: SPEC_STEPS,
        flight: FLIGHT,
      },
    });
    const nodes = childrenOf(sessionNode(set, 2));
    const descriptors = nodes.map((n) =>
      n.kind === "step" ? stepDescriptor(n) : null,
    );
    assert.deepStrictEqual(
      descriptors.map((d) => d?.icon),
      [
        { kind: "file", slug: "not-started.svg" },
        { kind: "file", slug: "in-progress.svg" },
      ],
    );
    // Exactly one row is current, and it is the one the LEDGER named.
    assert.deepStrictEqual(
      nodes.map((n) => (n.kind === "step" ? n.row.isActive : "?")),
      [false, false],
    );
    // The description column carries a START TIME now, never a marker —
    // and only on a row that has one. Nothing started here (step 1 was
    // never logged, so it never finished, and the chain breaks there), so
    // the slot is as empty as it has been since Set 115 S4.
    assert.deepStrictEqual(
      descriptors.map((d) => d?.description),
      [undefined, undefined],
    );
  });

  test("nothing in the tree model still spells the removed marker", () => {
    // The anti-resurrection guard (L-112-1), mirroring
    // `test_session_checklist.py`'s `assert not hasattr(sc, "HERE_MARKER")`
    // on the Python side. A re-added export would compile and quietly put
    // an inferred row back on screen.
    assert.strictEqual("HERE_MARKER" in treeModel, false);
    const set = inFlightSet();
    const rendered = childrenOf(sessionNode(set, 2))
      .map((n) => (n.kind === "step" ? stepDescriptor(n) : null))
      .flatMap((d) => [d?.description ?? "", d?.tooltip ?? ""])
      .join("\n");
    assert.strictEqual(rendered.includes("<- here"), false, rendered);
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
    // Set 127 S2: the second row is the step this session is ON — nothing
    // is logged against it and the record is silent — so it carries the
    // in-progress glyph even though the ledger still says `pending`.
    assert.deepStrictEqual(icons, [
      { kind: "file", slug: "done.svg" },
      { kind: "file", slug: "in-progress.svg" },
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
    //
    // Asserted on the LAST planned row rather than the first, because Set
    // 127 S2 derives the first unlogged planned row into the in-progress
    // state and this test is about the ones behind it.
    const set = threePlanSet();
    const [, , third] = childrenOf(sessionNode(set, 2));
    const d = stepDescriptor(third as never);
    assert.ok(hasToken(d.contextValue, "step-planned"), d.contextValue);
    assert.ok(hasToken(d.contextValue, "step-not-started"), d.contextValue);
    assert.ok(!hasToken(d.contextValue, "step-active"), d.contextValue);
    assert.ok(d.tooltip?.includes("planned — not started"), d.tooltip);
    // A row that has not started shows no time — a seeded row's own
    // `dateTime` is REGISTRATION time, and rendering it as a start would
    // be the fresh wrong signal operator ruling 3 forbids.
    assert.strictEqual(d.description, undefined);
  });

  test("the tooltip agrees with the glyph on the derived active step", () => {
    // Set 127 S2, step 2's real requirement: `stepDescriptor` has TWO
    // consumers of a row's status, and the tooltip's planned branch would
    // otherwise call the running step "planned — not started" in prose
    // while the icon beside it showed it running (L-069-1 — enumerate
    // every consumer, do not fix the reported one).
    const set = threePlanSet();
    const [, second] = childrenOf(sessionNode(set, 2));
    assert.strictEqual(second.kind === "step" ? second.row.isActive : false, true);
    const d = stepDescriptor(second as never);
    assert.deepStrictEqual(d.icon, { kind: "file", slug: "in-progress.svg" });
    assert.ok(d.tooltip?.includes("in progress"), d.tooltip);
    assert.ok(!d.tooltip?.includes("not started"), d.tooltip);
    // Both facts are true of this row and both are offered to `when`
    // clauses: it is a planned row, and it is the one in flight.
    assert.ok(hasToken(d.contextValue, "step-planned"), d.contextValue);
    assert.ok(hasToken(d.contextValue, "step-active"), d.contextValue);
    assert.ok(hasToken(d.contextValue, "step-in-progress"), d.contextValue);
  });

  test("a started row shows when it started, in the dimmed description slot", () => {
    // The operator's follow-up question — how long has it been running —
    // answered in the slot the `<- here` marker vacated, so nothing is
    // displaced. Local, 24-hour, hour and minute, trailing dash to mark it
    // a START rather than a completion.
    const set = threePlanSet();
    const descriptions = childrenOf(sessionNode(set, 2)).map((n) =>
      n.kind === "step" ? stepDescriptor(n).description : "?",
    );
    assert.deepStrictEqual(descriptions, [
      stepStartLabel("2026-08-11T11:58:00-04:00"),
      stepStartLabel("2026-08-11T12:06:00-04:00"),
      undefined,
    ]);
    // Computed from the local clock, not asserted as a literal, because a
    // fixed string would pin the test to one machine's timezone. What IS
    // asserted literally is the SHAPE.
    assert.match(descriptions[0] as string, /^\d{2}:\d{2}-$/);
  });

  test("the start-time label formats, and refuses to guess", () => {
    // A local-clock helper, so the hour is asserted through the same
    // `Date` the renderer uses; the FORMAT is what this pins.
    const iso = "2026-08-11T12:06:00-04:00";
    const when = new Date(iso);
    const hh = String(when.getHours()).padStart(2, "0");
    assert.strictEqual(stepStartLabel(iso), `${hh}:06-`);
    // No derived start: the slot stays as empty as it was before Set 127.
    assert.strictEqual(stepStartLabel(null), "");
    // An unparseable timestamp renders NOTHING here rather than
    // "Invalid Date" or a raw ISO string in a slot a few characters wide.
    // It is not lost: the tooltip carries the raw value.
    assert.strictEqual(stepStartLabel("not a date"), "");
  });

  test("the full timestamp is in the tooltip, where width is free", () => {
    const set = threePlanSet();
    const [first] = childrenOf(sessionNode(set, 2));
    const d = stepDescriptor(first as never);
    assert.ok(d.tooltip?.includes("2026-08-11T11:58:00-04:00"), d.tooltip);
    // And nothing is claimed for a row that has no start.
    const [, , third] = childrenOf(sessionNode(set, 2));
    assert.ok(!stepDescriptor(third as never).tooltip?.includes("Started"));
  });

  test("nothing is derived once the session is no longer in flight", () => {
    // The negative direction, at the rendering surface: the same ledger
    // with `session-state.json` no longer calling this session current.
    // An in-progress glyph on a session that finished is strictly worse
    // than the silence it replaced, because an operator would have a
    // reason to believe it.
    const set = threePlanSet({ inFlight: false, startedAt: "2026-08-11T11:58:00-04:00" });
    const nodes = childrenOf(sessionNode(set, 2));
    assert.deepStrictEqual(
      nodes.map((n) => (n.kind === "step" ? n.row.isActive : "?")),
      [false, false, false],
    );
    assert.deepStrictEqual(
      nodes.map((n) => (n.kind === "step" ? stepDescriptor(n).icon : "?")),
      [
        { kind: "file", slug: "done.svg" },
        { kind: "file", slug: "not-started.svg" },
        { kind: "file", slug: "not-started.svg" },
      ],
    );
    // The start time that WAS recorded still shows: "when did step 1
    // start" is as good a question on a session that closed as on the
    // live one.
    assert.strictEqual(
      nodes[0].kind === "step" ? stepDescriptor(nodes[0]).description : "?",
      stepStartLabel("2026-08-11T11:58:00-04:00"),
    );
  });

  test("the session tooltip says how many steps are under it", () => {
    const set = inFlightSet();
    assert.ok(sessionDescriptor(sessionNode(set, 2)).tooltip?.includes("2 steps"));
    // A leaf session row says nothing about steps it does not have.
    assert.ok(!sessionDescriptor(sessionNode(set, 1)).tooltip?.includes("step"));
  });
});

suite("Set 115 S4 — the close-out obligations under the in-flight session", () => {
  // The rows are RENDERED here, never computed: `close_preflight` costs
  // 2-7 seconds and this model runs on every watcher tick. What is
  // asserted is the honesty contract around a recorded answer — that a
  // projection which cannot be shown to be current never renders as
  // truth, in any of the three ways it can fail to be current (absent,
  // unreadable, stale) plus the fourth that no digest can detect at all
  // (a git-backed row in a projection that IS fresh).

  const PLAN = [
    { sessionNumber: 2, stepNumber: 1, stepKey: "register", description: "Register.", status: "pending", kind: "plan-step" },
  ];

  function obligations(over: Partial<CloseObligations> = {}): CloseObligations {
    return {
      state: "fresh",
      sessionNumber: 2,
      verdict: "would-refuse",
      generatedAt: "2026-08-11T13:42:00-04:00",
      obligations: [
        {
          check: "working_tree_clean",
          met: false,
          blocking: true,
          detail: "working tree has uncommitted changes in scope",
          action: "commit the listed paths",
          cost_warning: "",
          volatile: true,
        },
        {
          check: "activity_log_entry",
          met: false,
          blocking: false,
          detail: "no logged step for session 2",
          action: "log what this session did",
          cost_warning: "",
          volatile: false,
        },
        {
          check: "disposition_present",
          met: true,
          blocking: true,
          detail: "",
          action: "",
          cost_warning: "",
          volatile: false,
        },
      ],
      ...over,
    };
  }

  function liveSet(over: Partial<SessionSet> = {}): SessionSet {
    return fakeSet({
      name: "115-live",
      state: "in-progress",
      sessions: ledger("complete", "in-progress", "not-started"),
      stepLedger: {
        sessionNumber: 2,
        entries: PLAN,
        specSteps: ["Register."],
        flight: { inFlight: true, startedAt: "2026-08-11T13:00:00-04:00" },
      },
      closeObligations: obligations(),
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

  function closeOut(set: SessionSet, number = 2) {
    const [node] = closeOutNodes(sessionNode(set, number));
    assert.ok(node, "expected a close-out node");
    return node;
  }

  test("the close-out row sits under the in-flight session, after its steps", () => {
    const children = childrenOf(sessionNode(liveSet(), 2));
    assert.deepStrictEqual(
      children.map((n) => n.kind),
      ["step", "closeout"],
    );
  });

  test("no other session gets one, however the set is configured", () => {
    // A closed session's obligations are answered by the fact that it
    // closed; a not-started one has no close to preflight.
    const set = liveSet();
    for (const n of [1, 3]) {
      assert.deepStrictEqual(closeOutNodes(sessionNode(set, n)), []);
    }
  });

  test("a projection about ANOTHER session is not shown as this one's", () => {
    // The same rule the step ledger follows: a record about session 1
    // says nothing about session 2, and attaching it here would be worse
    // than silence — it would be a false answer to the exact question
    // this row exists to answer.
    const set = liveSet({ closeObligations: obligations({ sessionNumber: 1 }) });
    const d = closeOutDescriptor(closeOut(set));
    assert.strictEqual(d.description, "not computed");
    assert.strictEqual(d.collapsible, "none");
  });

  test("the group row summarizes unmet obligations by blocking-ness", () => {
    const d = closeOutDescriptor(closeOut(liveSet()));
    assert.strictEqual(d.label, "Close-out readiness");
    assert.strictEqual(d.description, "1 blocking, 1 advisory");
    assert.strictEqual(d.collapsible, "collapsed");
  });

  test("the group row is not named after the close-out STEP", () => {
    // Set 128 S1 made a step literally named `Close-out` part of the
    // skeleton every session declares, so a group row called `Close-out`
    // put two identically-named rows under one session and the operator
    // reported them as a duplicate. The two answer different questions:
    // the step says whether close-out has been executed, this row says
    // what still stands in its way.
    const d = closeOutDescriptor(closeOut(liveSet()));
    assert.notStrictEqual(d.label, "Close-out");
    assert.strictEqual(d.label, CLOSE_OUT_GROUP_LABEL);
  });

  test("a fresh projection whose CLOSE IS SETTLED is the only way to read done", () => {
    const clean = obligations({
      obligations: obligations().obligations.map((o) => ({ ...o, met: true })),
      verdict: "would-close",
    });
    const d = closeOutDescriptor(closeOut(liveSet({ closeObligations: clean })));
    assert.ok(d.description?.startsWith("nothing outstanding"), d.description);
    // Dated even so: two of the rows behind it read git, which nothing
    // here can re-check.
    assert.ok(d.description?.includes("as of 13:42"), d.description);
    assert.deepStrictEqual(d.icon, { kind: "file", slug: "done.svg" });

    // ...and the falsifiers. The same all-met rows, one state worse, must
    // NOT read as done. A list that says "nothing remains" while
    // something does is the failure this whole feature is built against.
    for (const state of ["stale", "absent", "unreadable"] as const) {
      const g = closeOutGlyph({ ...clean, state });
      assert.notStrictEqual(g, "complete", `${state} rendered as complete`);
    }
  });

  test("all rows met but the close undecided is NOT an all-clear", () => {
    // Found by an end-of-set path-aware critic. `close_preflight` reports
    // three verdicts, not two: when every hand-fixable row is met but no
    // settling verification evidence exists, the close turns on a routed
    // round that has not run — `would_close` is null, not true. Counting
    // only unmet rows painted the tick there and told the operator they
    // were done.
    const undecided = obligations({
      obligations: obligations().obligations.map((o) => ({ ...o, met: true })),
      verdict: "undecided-backstop-would-route",
    });
    const d = closeOutDescriptor(
      closeOut(liveSet({ closeObligations: undecided })),
    );
    assert.deepStrictEqual(d.icon, { kind: "file", slug: "not-started.svg" });
    assert.ok(d.description?.includes("not decided"), d.description);
    assert.ok(d.description?.includes("backstop"), d.description);
  });

  test("an unrecognised verdict never reads as settled either", () => {
    // The Set 086 posture: an unrecognised token is treated as severe
    // rather than clean, so a hand-edited or future verdict cannot buy a
    // tick it did not earn.
    const odd = obligations({
      obligations: obligations().obligations.map((o) => ({ ...o, met: true })),
      verdict: "probably-fine",
    });
    assert.strictEqual(closeOutGlyph(odd), "not-started");
    assert.strictEqual(closeOutGlyph({ ...odd, verdict: null }), "not-started");
  });

  test("stale is said first, and never omitted", () => {
    const d = closeOutDescriptor(
      closeOut(liveSet({ closeObligations: obligations({ state: "stale" }) })),
    );
    assert.ok(d.description?.startsWith("stale"), d.description);
    assert.ok(d.description?.includes("1 blocking"), d.description);
    assert.ok(d.tooltip?.includes("close_preflight"), d.tooltip);
  });

  test("absent is a state the operator is told about, not an empty row", () => {
    // "Nobody has computed this" and "there is nothing to compute" are
    // opposite facts. The row names the command that resolves it.
    const set = liveSet({
      closeObligations: {
        state: "absent",
        sessionNumber: null,
        verdict: null,
        generatedAt: null,
        obligations: [],
      },
    });
    const d = closeOutDescriptor(closeOut(set));
    assert.strictEqual(d.description, "not computed");
    assert.strictEqual(d.collapsible, "none", "a twisty onto nothing");
    assert.ok(d.tooltip?.includes("--write"), d.tooltip);
    assert.ok(hasToken(d.contextValue, "closeout-absent"), d.contextValue);
  });

  test("an unreadable projection takes the fault glyph, not the quiet one", () => {
    // `step-ledger-findings.md` §4 records the tree concealing a
    // data-quality fault the CLI showed as `[?]`. This row does not
    // repeat that: unreadable is visibly wrong, not silently empty.
    const set = liveSet({
      closeObligations: obligations({ state: "unreadable", obligations: [] }),
    });
    const d = closeOutDescriptor(closeOut(set));
    assert.deepStrictEqual(d.icon, { kind: "file", slug: "cancelled.svg" });
    assert.ok(d.description?.includes("regenerate"), d.description);
  });

  test("a session with no steps but a projection is still expandable", () => {
    const set = liveSet({ stepLedger: null });
    assert.deepStrictEqual(stepNodes(sessionNode(set, 2)), []);
    assert.strictEqual(
      sessionDescriptor(sessionNode(set, 2)).collapsible,
      "collapsed",
    );
  });

  test("obligation rows are leaves with stable, unique ids", () => {
    const rows = obligationNodes(closeOut(liveSet()));
    const ids = rows.map((n) => obligationDescriptor(n).id);
    assert.strictEqual(new Set(ids).size, ids.length);
    for (const id of ids) assert.ok(id.startsWith("obligation:115-live/2/"), id);
    assert.deepStrictEqual(childrenOf(rows[0]), []);
    assert.strictEqual(obligationDescriptor(rows[0]).collapsible, "none");
  });

  test("an unmet row says whether it can refuse the close", () => {
    const [blocking, advisory, met] = obligationNodes(closeOut(liveSet())).map(
      obligationDescriptor,
    );
    assert.strictEqual(blocking.label, "Working tree clean");
    assert.ok(blocking.description?.includes("blocking"), blocking.description);
    assert.ok(advisory.description?.includes("advisory"), advisory.description);
    assert.deepStrictEqual(met.icon, { kind: "file", slug: "done.svg" });
    // A met row makes no claim about blocking-ness: there is nothing to
    // refuse, so the qualifier would be noise on the row that needs none.
    assert.strictEqual(met.description, undefined);
  });

  test("a git-backed row is dated even when the projection is fresh", () => {
    // The property `volatile` exists for. Committing changes no byte this
    // projection digested, so "fresh" cannot speak for these two rows and
    // the row says so itself rather than borrowing the parent's verdict.
    const [gitRow, fileRow] = obligationNodes(closeOut(liveSet())).map(
      obligationDescriptor,
    );
    assert.ok(gitRow.description?.includes("as of 13:42"), gitRow.description);
    assert.ok(gitRow.tooltip?.includes("git"), gitRow.tooltip);
    assert.ok(!fileRow.description?.includes("as of"), fileRow.description);
  });

  test("a stale projection dates EVERY row, not only the volatile ones", () => {
    const set = liveSet({ closeObligations: obligations({ state: "stale" }) });
    const rows = obligationNodes(closeOut(set)).map(obligationDescriptor);
    for (const row of rows) {
      assert.ok(row.description?.includes("as of 13:42"), row.description);
    }
  });

  test("an unparseable timestamp degrades to what was written", () => {
    assert.strictEqual(asOfLabel(null), "as of an unrecorded time");
    assert.strictEqual(asOfLabel("not a date"), "as of not a date");
  });

  test("close-out rows carry their own tokens and no session token", () => {
    const group = closeOutDescriptor(closeOut(liveSet()));
    assert.ok(hasToken(group.contextValue, NODE_TOKEN.closeout));
    assert.ok(!hasToken(group.contextValue, NODE_TOKEN.session));
    assert.ok(hasToken(group.contextValue, "closeout-fresh"));

    const [row] = obligationNodes(closeOut(liveSet())).map(obligationDescriptor);
    assert.ok(hasToken(row.contextValue, NODE_TOKEN.obligation));
    assert.ok(!hasToken(row.contextValue, NODE_TOKEN.step));
    assert.ok(hasToken(row.contextValue, "obligation-unmet"));
    assert.ok(hasToken(row.contextValue, "obligation-blocking"));
    assert.ok(hasToken(row.contextValue, "obligation-volatile"));
  });

  test("a routed-round cost is surfaced with the vocabulary the CLI uses", () => {
    const withCost = obligations({
      obligations: [
        {
          check: "verification_backstop",
          met: true,
          blocking: true,
          detail: "this close carries no settling verification evidence",
          action: "",
          cost_warning: "closing now SPENDS a routed verification round",
          volatile: false,
        },
      ],
    });
    const [row] = obligationNodes(
      closeOut(liveSet({ closeObligations: withCost })),
    ).map(obligationDescriptor);
    assert.ok(row.description?.includes("$"), row.description);
    assert.ok(row.tooltip?.includes("routed verification round"), row.tooltip);
  });

  test("summary counting is driven by the rows, not by the verdict token", () => {
    // The verdict is recorded prose; the counts are what the operator
    // acts on. Deriving one from the other would let a stale or
    // hand-edited verdict silently contradict the list under it.
    const contradicting = obligations({ verdict: "would-close" });
    assert.strictEqual(closeOutSummary(contradicting), "1 blocking, 1 advisory");
  });
});
