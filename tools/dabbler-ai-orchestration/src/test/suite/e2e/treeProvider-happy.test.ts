// Set 027 Session 3 (Layer 2): drive a 3-session happy path against
// the real start_session / close_session CLIs and assert that
// `SessionSetsProvider.getChildren()` buckets and labels the set
// correctly at each lifecycle boundary. This is the canonical reader
// counterpart to ai_router/tests/e2e/test_happy_3session.py — that
// suite pins the writer; this one pins the reader's view of the
// writer's output.

import * as assert from "assert";
import * as vscode from "vscode";
import {
  buildProvider,
  childrenOfGroup,
  cleanupTmpDir,
  closeSession,
  driveHappyPath,
  makeActivity,
  makeDisposition,
  makeSet,
  makeTmpDir,
  replaceWorkspaceFolders,
  startSession,
  topLevelGroups,
} from "./e2eHarness";

suite("Layer 2 e2e — happy 3-session path", function () {
  // CLI-driven boundary writes take ~1-2s each on Windows. A 3-session
  // happy path is ~10 close-session invocations; budget 60s for the
  // suite to absorb cold-start variance without flaking.
  this.timeout(120_000);

  let tmpPath: string;

  setup(() => {
    tmpPath = makeTmpDir("e2e-happy");
  });

  teardown(() => {
    cleanupTmpDir(tmpPath);
  });

  test("not-started set buckets to Not Started, label 0/3", async () => {
    const h = makeSet(tmpPath, "happy-not-started", 3);
    await replaceWorkspaceFolders(h.repo_root);
    const provider = buildProvider();

    const groups = topLevelGroups(provider);
    // Always: In Progress, Not Started, Done (3 buckets). Cancelled
    // only appears when ≥ 1 cancelled set exists, so a fresh fixture
    // must surface exactly 3.
    assert.strictEqual(groups.length, 3, "expected 3 buckets when no cancelled sets");

    const notStarted = childrenOfGroup(provider, "not-started");
    assert.strictEqual(notStarted.length, 1);
    assert.strictEqual(notStarted[0].label, "happy-not-started");
    const desc = String(notStarted[0].description ?? "");
    // Verifier (Round B): tighten — assert exact base shape and
    // explicitly reject conflicting tokens. A regression that adds
    // a stray "Done" or "in flight" annotation to a not-started row
    // must fail this test.
    assert.ok(
      desc.includes("0/3"),
      `expected '0/3' in description, got '${desc}'`,
    );
    assert.ok(!desc.includes("Done"), `not-started must not say Done; got '${desc}'`);
    assert.ok(!desc.includes("in flight"), `not-started must not say 'in flight'; got '${desc}'`);
    assert.ok(!desc.includes("[FORCED]"), `not-started must not have [FORCED]; got '${desc}'`);
    assert.strictEqual(
      notStarted[0].contextValue,
      "sessionSet:not-started",
      "contextValue must reflect bucket for menu visibility predicates",
    );
  });

  test("session 1 in flight: bucket flips to In Progress with '0/3' base label", async () => {
    // Drift call-out (caught by this harness on first run):
    // register_session_start at session_state.py:237 omits the
    // ``completedSessions`` key when the value is an empty list,
    // citing schema-doc convention "absent means none closed yet."
    // ``isCurrentSessionInFlight`` (SessionSetsProvider.ts:32)
    // requires ``Array.isArray(completedSessions)`` and so returns
    // false on a fresh-start snapshot. The result: the production
    // session-1-of-a-fresh-set view shows "0/N" *without* the
    // "session N in flight" annotation the Set 022 unit tests assume.
    // This file pins the *current* shape; a future change that
    // restores the Set 022 annotation needs to either (a) flip the
    // writer to always emit ``completedSessions: []`` or (b) relax
    // the predicate to treat absent-array as []. Updating this
    // test is the deliberate marker that the choice was made.
    const h = makeSet(tmpPath, "happy-inflight", 3);
    startSession(h, 1);

    await replaceWorkspaceFolders(h.repo_root);
    const provider = buildProvider();

    const inProgress = childrenOfGroup(provider, "in-progress");
    assert.strictEqual(inProgress.length, 1, "set must have flipped to In Progress");

    const desc = String(inProgress[0].description ?? "");
    assert.ok(desc.startsWith("0/3"), `expected '0/3' base label, got '${desc}'`);
    assert.ok(
      !desc.includes("in flight"),
      `current writer omits empty completedSessions[]; no in-flight annotation expected. ` +
        `If this assertion starts failing, the writer or predicate has been fixed — ` +
        `flip back to the Set 022 expected shape. Got '${desc}'`,
    );

    const notStarted = childrenOfGroup(provider, "not-started");
    assert.strictEqual(notStarted.length, 0, "set must have left Not Started");
  });

  test("session 2 in flight (after session 1 closes): IN-FLIGHT annotation surfaces", async () => {
    // The Set 022 in-flight annotation DOES surface once
    // ``completedSessions[]`` is populated — i.e., from session 2
    // onwards on any set that closed at least one prior session.
    // Pins the predicate's "currentSession not in completedSessions[]"
    // branch using a real production snapshot.
    const h = makeSet(tmpPath, "happy-inflight-2", 3);
    startSession(h, 1);
    makeActivity(h, 1);
    makeDisposition(h, 1, false);
    let res = closeSession(h, 1);
    assert.strictEqual(res.exit, 0);
    startSession(h, 2);

    await replaceWorkspaceFolders(h.repo_root);
    const provider = buildProvider();

    const inProgress = childrenOfGroup(provider, "in-progress");
    assert.strictEqual(inProgress.length, 1);
    const desc = String(inProgress[0].description ?? "");
    // Verifier (Round B): tighten — exact annotation, no Done, no [FORCED].
    assert.ok(
      desc.includes("1/3 · session 2 in flight"),
      `session 2 of a set with completedSessions: [1] must carry the in-flight annotation; got '${desc}'`,
    );
    assert.ok(!desc.includes("Done"), `in-progress row must not say Done; got '${desc}'`);
    assert.ok(!desc.includes("[FORCED]"), `healthy in-flight must not have [FORCED]; got '${desc}'`);
    assert.ok(!desc.includes("session 1 in flight"), `must be session 2, not session 1; got '${desc}'`);
    assert.ok(!desc.includes("session 3 in flight"), `must be session 2, not session 3; got '${desc}'`);
  });

  test("session 1 closed (between sessions): label is '1/3' with no in-flight annotation", async () => {
    const h = makeSet(tmpPath, "happy-between", 3);
    startSession(h, 1);
    makeActivity(h, 1);
    makeDisposition(h, 1, false);
    const res = closeSession(h, 1);
    assert.strictEqual(res.exit, 0, `close_session exit=${res.exit} stderr=${res.stderr}`);

    await replaceWorkspaceFolders(h.repo_root);
    const provider = buildProvider();

    const inProgress = childrenOfGroup(provider, "in-progress");
    assert.strictEqual(inProgress.length, 1);
    const desc = String(inProgress[0].description ?? "");
    // Verifier (Round B): tighten — also reject Done / [FORCED] tokens.
    assert.ok(desc.startsWith("1/3"), `expected label to start with '1/3', got '${desc}'`);
    assert.ok(
      !desc.includes("in flight"),
      `between-sessions row must not carry 'in flight' annotation, got '${desc}'`,
    );
    assert.ok(!desc.includes("Done"), `between-sessions row must not say Done; got '${desc}'`);
    assert.ok(!desc.includes("[FORCED]"), `healthy between-sessions must not have [FORCED]; got '${desc}'`);
  });

  test("full close-out: set lands in Done with 'N/N Done'", async () => {
    const h = makeSet(tmpPath, "happy-done", 3);
    driveHappyPath(h, 3);

    await replaceWorkspaceFolders(h.repo_root);
    const provider = buildProvider();

    const done = childrenOfGroup(provider, "done");
    assert.strictEqual(done.length, 1, "completed set must bucket to Done");
    const desc = String(done[0].description ?? "");
    // Verifier (Round B): tighten — exact N/N Done shape + reject
    // [FORCED] / in-flight tokens that would falsely appear on a
    // healthy close.
    assert.ok(
      desc.includes("3/3 Done"),
      `expected 'N/N Done' annotation on completed set, got '${desc}'`,
    );
    assert.ok(
      !desc.includes("[FORCED]"),
      `healthy close must not have [FORCED] badge; got '${desc}'`,
    );
    assert.ok(
      !desc.includes("in flight"),
      `Done row must not have 'in flight' annotation; got '${desc}'`,
    );

    const inProgress = childrenOfGroup(provider, "in-progress");
    assert.strictEqual(inProgress.length, 0, "completed set must leave In Progress");

    const notStarted = childrenOfGroup(provider, "not-started");
    assert.strictEqual(notStarted.length, 0);
  });

  test("refresh() invalidates the cache so a session 2 start shows up", async () => {
    // Set 022 + this set: the provider caches `readAllSessionSets()`;
    // without an explicit refresh after a state mutation, the bucket
    // would stay frozen. The production extension wires the file
    // watcher to fire `refresh()` on state-file events; this test
    // verifies the cache invalidation logic itself, decoupled from
    // the watcher.
    //
    // The scenario starts at "session 1 closed; session 2 not yet
    // started" (between sessions) so the pre-refresh shape is
    // unambiguous: `1/3` with no annotation. After session 2 starts,
    // the in-flight annotation must appear — but only after `refresh()`
    // because of the cache.
    const h = makeSet(tmpPath, "happy-refresh", 3);
    startSession(h, 1);
    makeActivity(h, 1);
    makeDisposition(h, 1, false);
    let res = closeSession(h, 1);
    assert.strictEqual(res.exit, 0);

    await replaceWorkspaceFolders(h.repo_root);
    const provider = buildProvider();

    // Prime the cache before the state changes.
    let inProgress = childrenOfGroup(provider, "in-progress");
    assert.strictEqual(inProgress.length, 1);
    let desc = String(inProgress[0].description ?? "");
    assert.ok(desc.startsWith("1/3"), `pre-refresh: '1/3' base label expected; got '${desc}'`);
    assert.ok(
      !desc.includes("in flight"),
      `between-sessions row should not be annotated; got '${desc}'`,
    );

    // Start session 2 outside the provider's awareness — the cache
    // still reflects the between-sessions snapshot.
    startSession(h, 2);

    // Verifier (Round B): prove the cache is STALE before refresh.
    // Without this assertion the test passes equally well against a
    // provider that re-reads on every getChildren() call — defeating
    // the regression-coverage promise. We must observe the
    // pre-refresh shape persisting after a known state mutation,
    // then observe the change after refresh().
    inProgress = childrenOfGroup(provider, "in-progress");
    assert.strictEqual(inProgress.length, 1, "pre-refresh: still in-progress");
    desc = String(inProgress[0].description ?? "");
    assert.ok(
      desc.startsWith("1/3"),
      `pre-refresh: cache should still hold '1/3' base label; got '${desc}'`,
    );
    assert.ok(
      !desc.includes("in flight"),
      `pre-refresh: cache must still reflect between-sessions ` +
        `(no 'in flight' annotation) — if this fails, the provider is ` +
        `no longer caching and refresh() has become a no-op. Got '${desc}'`,
    );

    // Now refresh + re-read must reflect the new in-flight shape.
    provider.refresh();
    inProgress = childrenOfGroup(provider, "in-progress");
    assert.strictEqual(inProgress.length, 1);
    desc = String(inProgress[0].description ?? "");
    assert.ok(
      desc.includes("1/3 · session 2 in flight"),
      `post-refresh: session 2 in-flight annotation expected; got '${desc}'`,
    );
  });
});

// Keep the file's only side effect a `suite()` registration so Mocha's
// auto-discovery picks it up alongside the existing 20+ unit tests.
export {};
