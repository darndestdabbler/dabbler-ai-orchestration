// Set 027 Session 3 (Layer 2): cancel + restore lifecycle against
// `SessionSetsProvider`. The Python layer (Session 2's
// test_cancel_restore_midset.py) pins the writer; this layer pins the
// reader. The cancelled-bucket-only-renders-when-non-empty rule
// (`SessionSetsProvider.getChildren` line 223) is a particular
// drift target — silently rendering an empty Cancelled bucket would
// be a confusing UX regression but a low-symptom one in unit tests.

import * as assert from "assert";
import * as vscode from "vscode";
import {
  buildProvider,
  cancelSet,
  childrenOfGroup,
  cleanupTmpDir,
  closeSession,
  makeActivity,
  makeDisposition,
  makeSet,
  makeTmpDir,
  replaceWorkspaceFolders,
  restoreSet,
  startSession,
  topLevelGroups,
} from "./e2eHarness";

suite("Layer 2 e2e — cancel + restore lifecycle", function () {
  this.timeout(120_000);

  let tmpPath: string;

  setup(() => {
    tmpPath = makeTmpDir("e2e-cancel");
  });

  teardown(() => {
    cleanupTmpDir(tmpPath);
  });

  test("Cancelled bucket is absent until a set is cancelled", async () => {
    const h = makeSet(tmpPath, "cancel-empty-bucket", 4);
    await replaceWorkspaceFolders(h.repo_root);
    const provider = buildProvider();

    const groups = topLevelGroups(provider);
    const labels = groups.map((g) => String(g.label));
    assert.ok(
      !labels.some((l) => l.startsWith("Cancelled")),
      `Cancelled bucket must not render when no set is cancelled; got groups ${JSON.stringify(labels)}`,
    );
  });

  test("cancelling mid-set moves the set into Cancelled and the bucket appears", async () => {
    const h = makeSet(tmpPath, "cancel-midset", 4);
    // Drive sessions 1 and 2 normally so the cancellation lands on a
    // set that has nonzero progress — the bucket transition shouldn't
    // depend on session count, but the realistic shape verifies the
    // CANCELLED.md detection beats the in-progress signal.
    startSession(h, 1);
    makeActivity(h, 1);
    makeDisposition(h, 1, false);
    let res = closeSession(h, 1);
    assert.strictEqual(res.exit, 0);
    startSession(h, 2);
    makeActivity(h, 2);
    makeDisposition(h, 2, false);
    res = closeSession(h, 2);
    assert.strictEqual(res.exit, 0);

    // Start session 3 then cancel mid-flight — the most diagnostic
    // shape, since both "in progress" and "cancelled" signals are on
    // disk and the reader has to prefer cancelled.
    startSession(h, 3);
    cancelSet(h, "operator decided to refocus");

    await replaceWorkspaceFolders(h.repo_root);
    const provider = buildProvider();

    const cancelled = childrenOfGroup(provider, "cancelled");
    assert.strictEqual(cancelled.length, 1, "set must bucket to Cancelled");
    assert.strictEqual(cancelled[0].label, "cancel-midset");
    assert.strictEqual(
      cancelled[0].contextValue,
      "sessionSet:cancelled",
      "contextValue must drive the Restore menu visibility predicate",
    );

    // Cancelled set must vacate In Progress entirely.
    const inProgress = childrenOfGroup(provider, "in-progress");
    assert.strictEqual(inProgress.length, 0);

    // And the bucket itself must be present in the top-level groups —
    // distinct from the empty-fixture case validated above.
    const groups = topLevelGroups(provider);
    const labels = groups.map((g) => String(g.label));
    assert.ok(
      labels.some((l) => l.startsWith("Cancelled")),
      `Cancelled bucket must render once a set is cancelled; got ${JSON.stringify(labels)}`,
    );
  });

  test("restoring a cancelled set returns it to In Progress and removes the Cancelled bucket", async () => {
    const h = makeSet(tmpPath, "cancel-then-restore", 4);
    startSession(h, 1);
    cancelSet(h, "test cancel");
    restoreSet(h, "test restore");

    await replaceWorkspaceFolders(h.repo_root);
    const provider = buildProvider();

    const cancelled = childrenOfGroup(provider, "cancelled");
    assert.strictEqual(
      cancelled.length,
      0,
      "restored set must leave Cancelled bucket",
    );

    const inProgress = childrenOfGroup(provider, "in-progress");
    assert.strictEqual(
      inProgress.length,
      1,
      "restored set must return to its prior in-progress state",
    );
    assert.strictEqual(inProgress[0].label, "cancel-then-restore");

    // With no cancelled sets left, the bucket header must disappear
    // again — failing this assertion would surface the "Cancelled (0)"
    // ghost-header drift.
    const groups = topLevelGroups(provider);
    const labels = groups.map((g) => String(g.label));
    assert.ok(
      !labels.some((l) => l.startsWith("Cancelled")),
      `Cancelled bucket must disappear once no set is cancelled; got ${JSON.stringify(labels)}`,
    );
  });

  test("cancelling a Not Started set buckets it directly to Cancelled", async () => {
    const h = makeSet(tmpPath, "cancel-not-started", 3);
    cancelSet(h, "abandoned before starting");

    await replaceWorkspaceFolders(h.repo_root);
    const provider = buildProvider();

    const cancelled = childrenOfGroup(provider, "cancelled");
    assert.strictEqual(cancelled.length, 1);
    assert.strictEqual(cancelled[0].label, "cancel-not-started");

    // The Not Started bucket must lose its member — a stale entry
    // there would surface as a duplicate row across buckets.
    const notStarted = childrenOfGroup(provider, "not-started");
    assert.strictEqual(notStarted.length, 0);
  });
});

export {};
