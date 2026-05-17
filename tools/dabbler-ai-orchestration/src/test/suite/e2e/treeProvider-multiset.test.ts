// Set 027 Session 3 (Layer 2): multi-set workspace against
// `SessionSetsProvider`. The Python layer's
// test_multiset_sequential.py pins the writer's boundary-isolation:
// closing set A does not touch set B's state file. This layer pins
// the reader's grouping behavior: three sets in different lifecycle
// states must bucket into the three appropriate groups, with
// per-bucket sort order respected (in-progress / done / cancelled by
// most-recent-touch descending; not-started alphabetically).

import * as assert from "assert";
import {
  buildProvider,
  cancelSet,
  childrenOfGroup,
  cleanupTmpDir,
  driveHappyPath,
  makeActivity,
  makeAdditionalSet,
  makeDisposition,
  makeSet,
  makeTmpDir,
  replaceWorkspaceFolders,
  startSession,
  closeSession,
} from "./e2eHarness";

suite("Layer 2 e2e — multi-set workspace", function () {
  this.timeout(180_000);

  let tmpPath: string;

  setup(() => {
    tmpPath = makeTmpDir("e2e-multiset");
  });

  teardown(() => {
    cleanupTmpDir(tmpPath);
  });

  test("three sets in lifecycle-distinct states bucket into the right groups", async () => {
    // Build three sets sharing one repo, then drive each to a distinct
    // lifecycle state:
    //   * set A — fully closed (Done)
    //   * set B — session 1 closed, session 2 mid-flight (In Progress)
    //   * set C — never started (Not Started)
    const a = makeSet(tmpPath, "alpha-done", 3);
    const b = makeAdditionalSet(a, "bravo-active", 3);
    const c = makeAdditionalSet(a, "charlie-untouched", 3);

    driveHappyPath(a, 3);

    startSession(b, 1);
    makeActivity(b, 1);
    makeDisposition(b, 1, false);
    const closeRes = closeSession(b, 1);
    assert.strictEqual(closeRes.exit, 0);
    startSession(b, 2);

    void c; // c is intentionally left untouched

    await replaceWorkspaceFolders(a.repo_root);
    const provider = buildProvider();

    const done = childrenOfGroup(provider, "complete");
    assert.strictEqual(done.length, 1, "exactly one set should be Done");
    assert.strictEqual(done[0].label, "alpha-done");

    const inProgress = childrenOfGroup(provider, "in-progress");
    assert.strictEqual(inProgress.length, 1, "exactly one set should be In Progress");
    assert.strictEqual(inProgress[0].label, "bravo-active");
    const bravoDesc = String(inProgress[0].description ?? "");
    assert.ok(
      bravoDesc.includes("1/3 · session 2 in flight"),
      `expected bravo in-flight label; got '${bravoDesc}'`,
    );

    const notStarted = childrenOfGroup(provider, "not-started");
    assert.strictEqual(notStarted.length, 1, "exactly one set should be Not Started");
    assert.strictEqual(notStarted[0].label, "charlie-untouched");

    // Cancelled bucket must not surface at all (no cancelled sets).
    const cancelled = childrenOfGroup(provider, "cancelled");
    assert.strictEqual(cancelled.length, 0);
  });

  test("Not Started sets sort alphabetically by name", async () => {
    // `SessionSetsProvider.getChildren` sorts the not-started bucket by
    // name (line 241), distinct from the in-progress / done / cancelled
    // buckets which sort by lastTouched DESC. The sort key is easy to
    // refactor away inadvertently when consolidating logic; pin it.
    const z = makeSet(tmpPath, "zeta", 2);
    const a = makeAdditionalSet(z, "alpha", 2);
    const m = makeAdditionalSet(z, "mu", 2);
    void a;
    void m;

    await replaceWorkspaceFolders(z.repo_root);
    const provider = buildProvider();

    const notStarted = childrenOfGroup(provider, "not-started");
    const labels = notStarted.map((it) => String(it.label));
    assert.deepStrictEqual(
      labels,
      ["alpha", "mu", "zeta"],
      "Not Started sets must sort alphabetically",
    );
  });

  test("in-progress bucket sorts by lastTouched DESC (real cross-set ordering)", async () => {
    // Verifier (Round C): the multiset suite previously had only
    // single-item buckets in non-not-started states, so the
    // "in-progress / done / cancelled sort by lastTouched DESC"
    // contract from SessionSetsProvider.getChildren:237 was never
    // exercised end-to-end. Drive sessions on multiple sets in
    // explicit order so each set's `startedAt` (the lastTouched
    // source for in-progress rows) is monotonically increasing,
    // then assert the bucket order is the REVERSE of that
    // chronology.
    const oldest = makeSet(tmpPath, "in-progress-oldest", 3);
    startSession(oldest, 1);

    const middle = makeAdditionalSet(oldest, "in-progress-middle", 3);
    startSession(middle, 1);

    const newest = makeAdditionalSet(oldest, "in-progress-newest", 3);
    startSession(newest, 1);

    await replaceWorkspaceFolders(oldest.repo_root);
    const provider = buildProvider();

    const inProgress = childrenOfGroup(provider, "in-progress");
    const labels = inProgress.map((it) => String(it.label));
    assert.deepStrictEqual(
      labels,
      ["in-progress-newest", "in-progress-middle", "in-progress-oldest"],
      `in-progress bucket must sort by lastTouched DESC; got ${JSON.stringify(labels)}`,
    );
  });

  test("three sets, one cancelled: Cancelled bucket appears alongside others", async () => {
    // Boundary case for the Cancelled-renders-when-nonempty rule
    // (SessionSetsProvider.ts:223). A workspace with three sets where
    // exactly one is cancelled must surface all four buckets'
    // non-empty members.
    const a = makeSet(tmpPath, "alpha-cancelled", 3);
    const b = makeAdditionalSet(a, "bravo-in-progress", 3);
    const c = makeAdditionalSet(a, "charlie-not-started", 3);

    cancelSet(a, "test fixture");
    startSession(b, 1);
    void c;

    await replaceWorkspaceFolders(a.repo_root);
    const provider = buildProvider();

    const cancelled = childrenOfGroup(provider, "cancelled");
    assert.strictEqual(cancelled.length, 1);
    assert.strictEqual(cancelled[0].label, "alpha-cancelled");

    const inProgress = childrenOfGroup(provider, "in-progress");
    assert.strictEqual(inProgress.length, 1);
    assert.strictEqual(inProgress[0].label, "bravo-in-progress");

    const notStarted = childrenOfGroup(provider, "not-started");
    assert.strictEqual(notStarted.length, 1);
    assert.strictEqual(notStarted[0].label, "charlie-not-started");

    const done = childrenOfGroup(provider, "complete");
    assert.strictEqual(done.length, 0);
  });
});

export {};
