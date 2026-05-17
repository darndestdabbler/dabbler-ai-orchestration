// Set 027 Session 3 (Layer 2): force-close lifecycle against
// `SessionSetsProvider`. The Python layer's test_force_close_path.py
// pins the writer behavior — `--force` flips status to complete and
// stamps `forceClosed: true` regardless of session number. This file
// pins the reader-side view.
//
// Bucket placement under force is SCENARIO-DEPENDENT and not
// uniformly "Done":
//   * Force-close on the final session (currentSession == totalSessions
//     and completedSessions includes currentSession): buckets to Done.
//   * Force-close on a non-final session (currentSession <
//     totalSessions): downgraded to In Progress by
//     `isMidSetComplete` (utils/fileSystem.ts:87) which defends
//     against pre-0.2.1 "flipped to complete after every session"
//     drift. The truthful-display invariant from
//     SessionSetsProvider.ts:36 ("an N/N annotation here would hide
//     the fact that session 3 never ran") is the design goal.
//
// In every force scenario the `[FORCED]` badge surfaces in the
// description and the tooltip carries the `closeout_force_used`
// diagnostic line.

import * as assert from "assert";
import * as vscode from "vscode";
import {
  buildProvider,
  childrenOfGroup,
  cleanupTmpDir,
  closeSession,
  makeActivity,
  makeChangeLog,
  makeDisposition,
  makeSet,
  makeTmpDir,
  replaceWorkspaceFolders,
  startSession,
} from "./e2eHarness";

suite("Layer 2 e2e — force-close lifecycle", function () {
  this.timeout(120_000);

  let tmpPath: string;

  setup(() => {
    tmpPath = makeTmpDir("e2e-force");
  });

  teardown(() => {
    cleanupTmpDir(tmpPath);
  });

  test("force-close mid-set: set stays In Progress (isMidSetComplete downgrade) with [FORCED] badge", async () => {
    // Drive session 1 normally, then force-close session 2 of 3.
    // Writer behavior (pinned in Session 2's
    // test_force_close_path.py): force sets is_last_session=True so
    // the snapshot lands with status=complete + forceClosed=true.
    // Reader behavior (this test): `isMidSetComplete`
    // (utils/fileSystem.ts:87) downgrades any
    // currentSession < totalSessions snapshot to in-progress to defend
    // against pre-0.2.1 "flip to complete after every session" drift.
    // Net effect: a mid-set force-close lands the set in *In Progress*
    // with the [FORCED] badge — the truthful display the
    // SessionSetsProvider.ts:36 comment promises ("an N/N annotation
    // here would hide the fact that session 3 never ran").
    const h = makeSet(tmpPath, "force-midset", 3);
    startSession(h, 1);
    makeActivity(h, 1);
    makeDisposition(h, 1, false);
    let res = closeSession(h, 1);
    assert.strictEqual(res.exit, 0);

    startSession(h, 2);
    // change-log only matters because force still walks the same
    // close path; it's idempotent with respect to missing disposition.
    makeChangeLog(h, 2);
    res = closeSession(h, 2, { force: true });
    assert.strictEqual(
      res.exit,
      0,
      `force close should succeed: exit=${res.exit} stderr=${res.stderr}`,
    );

    await replaceWorkspaceFolders(h.repo_root);
    const provider = buildProvider();

    // Set 030 Session 3: under v3, force=True promotes every session
    // in sessions[] to "complete" (incident-recovery semantic from
    // Session 2's writer change), so the snapshot satisfies all
    // invariants and buckets as Complete. The [FORCED] badge — driven
    // by liveSession.forceClosed — remains the operator-facing cue
    // that the gate was bypassed.
    const complete = childrenOfGroup(provider, "complete");
    assert.strictEqual(complete.length, 1, "force-closed set buckets to Complete under v3 (forced promotes all)");
    assert.strictEqual(complete[0].label, "force-midset");

    const inProgress = childrenOfGroup(provider, "in-progress");
    assert.strictEqual(inProgress.length, 0, "force-closed set must not also appear in In Progress");

    const desc = String(complete[0].description ?? "");
    assert.ok(
      desc.includes("[FORCED]"),
      `force-closed set must carry [FORCED] badge in description; got '${desc}'`,
    );
    // The v3 writer promotes all sessions to complete on force, so
    // the count reflects 3/3. The [FORCED] badge — not bucket
    // downgrade — is the visibility cue that session 3 never ran
    // through a normal close.
    assert.ok(
      desc.includes("3/3"),
      `force-closed under v3 reports N/N after rule-7 satisfaction; got '${desc}'`,
    );
    assert.ok(
      !desc.includes("in flight"),
      `force-closed snapshot is CLOSED, not in flight; got '${desc}'`,
    );
  });

  test("force-close on a healthy non-forced set does NOT surface the badge", async () => {
    // The badge has to be specific to force-closed sets. A healthy
    // close should not produce the badge — pinning this guards against
    // an over-eager truthy check that fires on `forceClosed === false`
    // or `forceClosed == null` paths.
    const h = makeSet(tmpPath, "force-control", 2);
    startSession(h, 1);
    makeActivity(h, 1);
    makeDisposition(h, 1, false);
    let res = closeSession(h, 1);
    assert.strictEqual(res.exit, 0);

    startSession(h, 2);
    makeActivity(h, 2);
    makeDisposition(h, 2, true);
    makeChangeLog(h, 2);
    res = closeSession(h, 2);
    assert.strictEqual(res.exit, 0);

    await replaceWorkspaceFolders(h.repo_root);
    const provider = buildProvider();

    const done = childrenOfGroup(provider, "complete");
    assert.strictEqual(done.length, 1);
    const desc = String(done[0].description ?? "");
    assert.ok(
      !desc.includes("[FORCED]"),
      `healthy close must NOT carry [FORCED] badge; got '${desc}'`,
    );
    assert.ok(
      desc.includes("2/2 Complete"),
      `healthy final close should annotate as N/N Complete; got '${desc}'`,
    );
    // Verifier (Round B): tighten — reject any in-flight annotation
    // leaking onto a fully closed set.
    assert.ok(
      !desc.includes("in flight"),
      `Done row must not have 'in flight' annotation; got '${desc}'`,
    );
  });

  test("force-closed set tooltip carries the gate-bypass diagnostic line", async () => {
    // The tooltip's force-closed line (SessionSetsProvider.ts) is
    // the operator-facing breadcrumb explaining how to dig further
    // (closeout_force_used in session-events.jsonl). It's surfaced
    // only on hover, so easy to silently drop in a refactor.
    //
    // Set 030 Session 3: force=True on session 1 of 2 promotes both
    // sessions to "complete" in v3 sessions[], so the snapshot
    // satisfies all invariants and buckets as Complete. The
    // [FORCED] badge plus tooltip remain the operator visibility
    // cues that a gate bypass occurred.
    const h = makeSet(tmpPath, "force-tooltip", 2);
    startSession(h, 1);
    makeChangeLog(h, 1);
    const res = closeSession(h, 1, { force: true });
    assert.strictEqual(res.exit, 0);

    await replaceWorkspaceFolders(h.repo_root);
    const provider = buildProvider();

    const complete = childrenOfGroup(provider, "complete");
    assert.strictEqual(complete.length, 1);

    const tooltip = complete[0].tooltip;
    const tooltipText =
      tooltip instanceof vscode.MarkdownString ? tooltip.value : String(tooltip ?? "");
    assert.ok(
      tooltipText.includes("Force-closed"),
      `tooltip must include 'Force-closed' diagnostic; got '${tooltipText}'`,
    );
    assert.ok(
      tooltipText.includes("closeout_force_used"),
      "tooltip must point at the event-ledger entry for forensic follow-up",
    );
  });
});

export {};
