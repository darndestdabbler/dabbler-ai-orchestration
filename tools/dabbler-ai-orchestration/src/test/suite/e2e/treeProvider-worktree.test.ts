// Set 027 Session 3 (Layer 2): sibling-worktree discovery against
// `SessionSetsProvider`. The Python layer's
// test_worktree_discovery.py pins ai_router.worktree.enumerate_worktrees;
// this layer pins `discoverRoots()` (utils/fileSystem.ts:30) — the
// reader that fans out workspace-folders + git-worktrees into the
// roots `readAllSessionSets` iterates. A regression here would
// silently hide session sets in sibling worktrees from the tree view.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import {
  buildProvider,
  childrenOfGroup,
  cleanupTmpDir,
  makeAdditionalSet,
  makeSet,
  makeSiblingWorktree,
  makeTmpDir,
  replaceWorkspaceFolders,
  startSession,
} from "./e2eHarness";

// `make_sibling_worktree` requires its slug to match an existing
// session-set slug — git creates a *branch* named ``session-set/<slug>``
// pointing at HEAD, and the worktree starts there. The helper does NOT
// also seed a session set inside the worktree; the test seeds one
// after the worktree exists by writing the spec.md + state directly
// (cheaper than spawning another make-set call and re-establishing a
// bare remote).
function seedSetInWorktree(
  worktreeDir: string,
  slug: string,
  totalSessions: number,
): void {
  const setDir = path.join(worktreeDir, "docs", "session-sets", slug);
  fs.mkdirSync(setDir, { recursive: true });
  fs.writeFileSync(
    path.join(setDir, "spec.md"),
    `# ${slug}\n\n` +
      "> Worktree fixture for the e2e harness. Not a real session set.\n\n" +
      "## Session Set Configuration\n\n" +
      "```yaml\n" +
      `totalSessions: ${totalSessions}\n` +
      "requiresUAT: false\n" +
      "requiresE2E: false\n" +
      "uatStyle: ad-hoc\n" +
      "effort: normal\n" +
      "```\n",
    "utf8",
  );
  // Minimal not-started state in v2 schema. The provider's read path
  // tolerates a slim shape — it derives `state` from file presence and
  // the schema-strict reader's bucketing rules.
  fs.writeFileSync(
    path.join(setDir, "session-state.json"),
    JSON.stringify(
      {
        schemaVersion: 2,
        sessionSetName: slug,
        currentSession: null,
        totalSessions,
        status: "not-started",
        lifecycleState: "not_started",
        startedAt: null,
        completedAt: null,
        verificationVerdict: null,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  // Stage + commit so the worktree's git state is clean (matches what
  // an operator would see after a session-set scaffolding commit).
  // Verifier (Round C): assert each spawnSync result and pass
  // deterministic identity config — without it, hosts where
  // user.name / user.email are unset will silently fail the commit
  // and the test will assert against a dirty worktree.
  const addProc = cp.spawnSync("git", ["add", "-A"], { cwd: worktreeDir });
  if (addProc.status !== 0) {
    throw new Error(
      `git add failed in worktree ${worktreeDir}: status=${addProc.status} ` +
        `stderr=${addProc.stderr?.toString() || ""}`,
    );
  }
  const commitProc = cp.spawnSync(
    "git",
    [
      "-c", "user.name=Harness",
      "-c", "user.email=harness@example.invalid",
      "-c", "commit.gpgsign=false",
      "commit", "-m", `seed worktree fixture ${slug}`,
    ],
    { cwd: worktreeDir },
  );
  if (commitProc.status !== 0) {
    throw new Error(
      `git commit failed in worktree ${worktreeDir}: status=${commitProc.status} ` +
        `stderr=${commitProc.stderr?.toString() || ""}`,
    );
  }
}

suite("Layer 2 e2e — sibling-worktree discovery", function () {
  this.timeout(120_000);

  let tmpPath: string;

  setup(() => {
    tmpPath = makeTmpDir("e2e-worktree");
  });

  teardown(() => {
    cleanupTmpDir(tmpPath);
  });

  test("session sets in a canonical sibling worktree appear in the tree", async () => {
    // Primary worktree gets one set; sibling worktree gets another.
    // `discoverRoots()` fans out via `listGitWorktrees`, and the
    // provider iterates both — so both sets should appear.
    const primary = makeSet(tmpPath, "wt-primary", 3);

    // The sibling worktree's branch is `session-set/<wt-slug>`. The
    // slug here is a new logical session-set name; we then seed a set
    // INSIDE that worktree (separate from the worktree's branch name).
    const wtPath = makeSiblingWorktree(primary, "feature-branch");
    seedSetInWorktree(wtPath, "wt-sibling", 4);

    await replaceWorkspaceFolders(primary.repo_root);
    const provider = buildProvider();

    // Verifier (Round C): assert PRESENCE without claiming sort
    // coverage — the not-started bucket sorts alphabetically per
    // SessionSetsProvider.getChildren:241, but the sibling-worktree
    // test's purpose is "both roots discovered," not "sort order
    // preserved across roots."
    const notStarted = childrenOfGroup(provider, "not-started");
    const labels = new Set(notStarted.map((it) => String(it.label)));
    assert.deepStrictEqual(
      labels,
      new Set(["wt-primary", "wt-sibling"]),
      `both sets should surface (presence only — sort coverage is in multiset suite); got ${JSON.stringify([...labels])}`,
    );
  });

  test("a set present in BOTH worktrees deduplicates by name AND state-rank precedence wins", async () => {
    // `readAllSessionSets` deduplicates by set name across roots with
    // a state-rank tie-break (utils/fileSystem.ts:23 STATE_RANK and
    // line ~469 merge logic). Without dedup, the tree would show two
    // rows with the same name. Without the rank check, the merge
    // could pick the wrong state (e.g., a stale not-started in one
    // root could override an active in-progress in the other).
    //
    // Verifier (Round C): the original test seeded BOTH copies as
    // not-started so it only covered the dedup count, not the rank
    // precedence. Now we drive the primary copy to in-progress
    // (state-rank=2) while leaving the sibling as not-started
    // (rank=1). The merge must keep the in-progress row and the
    // tree must reflect it.
    const primary = makeSet(tmpPath, "wt-dup", 3);
    startSession(primary, 1);
    const wtPath = makeSiblingWorktree(primary, "feature-branch-2");
    // Sibling worktree starts from HEAD-of-primary at this point.
    // The state-file commits on `main` carry the in-progress shape
    // there already; for the sibling we OVERWRITE the seeded state
    // back to not-started shape on a separate branch so the two
    // roots disagree on the set's state and exercise the merge.
    seedSetInWorktree(wtPath, "wt-dup", 3);

    await replaceWorkspaceFolders(primary.repo_root);
    const provider = buildProvider();

    // Dedup: exactly one row with this slug.
    const allLabels = [
      ...childrenOfGroup(provider, "in-progress"),
      ...childrenOfGroup(provider, "not-started"),
      ...childrenOfGroup(provider, "complete"),
      ...childrenOfGroup(provider, "cancelled"),
    ].map((it) => String(it.label));
    const dupCount = allLabels.filter((l) => l === "wt-dup").length;
    assert.strictEqual(
      dupCount,
      1,
      `set 'wt-dup' must appear exactly once across all buckets; saw ${dupCount}: ${JSON.stringify(allLabels)}`,
    );

    // Precedence: the in-progress copy (state-rank=2) must win over
    // the sibling's not-started copy (state-rank=1).
    const inProgress = childrenOfGroup(provider, "in-progress");
    const inProgressLabels = inProgress.map((it) => String(it.label));
    assert.ok(
      inProgressLabels.includes("wt-dup"),
      `STATE_RANK tie-break must surface the in-progress copy; ` +
        `got in-progress=${JSON.stringify(inProgressLabels)}`,
    );
    const notStartedLabels = childrenOfGroup(provider, "not-started")
      .map((it) => String(it.label));
    assert.ok(
      !notStartedLabels.includes("wt-dup"),
      `not-started copy must NOT win; got not-started=${JSON.stringify(notStartedLabels)}`,
    );
  });

  test("primary-only sets still surface when no sibling worktrees exist", async () => {
    // Negative control: confirm the worktree-enumeration path doesn't
    // somehow gate primary visibility on the presence of a sibling.
    const primary = makeSet(tmpPath, "wt-primary-only", 2);
    const b = makeAdditionalSet(primary, "wt-primary-second", 3);
    void b;

    await replaceWorkspaceFolders(primary.repo_root);
    const provider = buildProvider();

    // Verifier (Round C): not-started sorts alphabetically per
    // SessionSetsProvider.getChildren:241. With our two slugs
    // ("wt-primary-only", "wt-primary-second"), the alphabetical
    // order matches the assertion order — exercise it directly.
    const notStarted = childrenOfGroup(provider, "not-started");
    const labels = notStarted.map((it) => String(it.label));
    assert.deepStrictEqual(
      labels,
      ["wt-primary-only", "wt-primary-second"],
      `primary sets must surface in alphabetical not-started order; got ${JSON.stringify(labels)}`,
    );
  });
});

export {};
