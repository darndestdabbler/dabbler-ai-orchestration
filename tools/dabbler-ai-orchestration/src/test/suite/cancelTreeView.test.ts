import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { readSessionSets } from "../../utils/fileSystem";
import { SessionSetsProvider } from "../../providers/SessionSetsProvider";
import { cancelSessionSet, restoreSessionSet } from "../../utils/cancelLifecycle";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-cancel-tree-test-"));
}

function setupSet(
  rootDir: string,
  slug: string,
  files: { activity?: boolean; changeLog?: boolean; status?: string }
): string {
  const setDir = path.join(rootDir, "docs", "session-sets", slug);
  fs.mkdirSync(setDir, { recursive: true });
  fs.writeFileSync(path.join(setDir, "spec.md"), `# ${slug}\n`);
  if (files.activity) {
    fs.writeFileSync(
      path.join(setDir, "activity-log.json"),
      JSON.stringify({
        entries: [{ sessionNumber: 1, dateTime: "2026-04-15T10:00:00-04:00" }],
      })
    );
  }
  if (files.changeLog) {
    fs.writeFileSync(path.join(setDir, "change-log.md"), `# ${slug} change log\n`);
  }
  if (files.status) {
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({ schemaVersion: 2, status: files.status })
    );
  }
  return setDir;
}

suite("readSessionSets — cancelled state mapping", () => {
  test("CANCELLED.md presence maps to state='cancelled'", () => {
    const dir = makeTmpDir();
    const setDir = setupSet(dir, "feature-cancelled", { activity: true, status: "in-progress" });
    fs.writeFileSync(path.join(setDir, "CANCELLED.md"), "# Cancellation history\n\nCancelled on 2026-05-01T10:00:00-04:00\n\n");
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "cancelled");
    fs.rmSync(dir, { recursive: true });
  });

  test("CANCELLED.md beats status='complete' (precedence rule)", () => {
    // Spec: a partially-completed set that is cancelled mid-stream must
    // render as Cancelled, not Done. CANCELLED.md is the highest-
    // precedence signal even if change-log.md and status='complete' are
    // both present.
    const dir = makeTmpDir();
    const setDir = setupSet(dir, "completed-then-cancelled", {
      changeLog: true,
      status: "complete",
    });
    fs.writeFileSync(path.join(setDir, "CANCELLED.md"), "# Cancellation history\n\nCancelled on 2026-05-01T10:00:00-04:00\n\n");
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "cancelled");
    fs.rmSync(dir, { recursive: true });
  });

  test("status='cancelled' without CANCELLED.md falls back to file inference (spec §Detection rules)", () => {
    // The spec's detection-rules table is file-presence-only:
    // `CANCELLED.md exists -> cancelled`, otherwise the next rule fires.
    // A status='cancelled' field without the markdown file is a manual
    // edit that should NOT promote the set into the Cancelled group —
    // the canonical signal is the audit file. Round-2 verifier flagged
    // a belt-and-suspenders branch that violated this rule; this test
    // locks in the corrected behavior.
    const dir = makeTmpDir();
    setupSet(dir, "state-cancelled-no-file", { status: "cancelled" });
    const sets = readSessionSets(dir);
    assert.notStrictEqual(sets[0].state, "cancelled");
    fs.rmSync(dir, { recursive: true });
  });

  test("RESTORED.md (without CANCELLED.md) does not show as cancelled", () => {
    const dir = makeTmpDir();
    const setDir = setupSet(dir, "restored-set", {
      activity: true,
      status: "in-progress",
    });
    fs.writeFileSync(path.join(setDir, "RESTORED.md"), "# Cancellation history\n\nRestored on 2026-05-01T10:00:00-04:00\n\n");
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "in-progress");
    fs.rmSync(dir, { recursive: true });
  });
});

suite("SessionSetsProvider — cancelled group", () => {
  // The provider reads from vscode.workspace.workspaceFolders to discover
  // roots. We rebind the cache after pointing the provider at a fixture
  // directory by calling readAllSessionSets-equivalent logic ourselves and
  // setting `_cache` directly. The vscode test harness has a real
  // workspaceFolders set to the extension's dev folder, so a clean
  // assertion path is to seed `_cache` and then drive getChildren.
  const extensionUri = vscode.Uri.file(path.resolve(__dirname, "..", "..", ".."));

  function makeProviderWithFixture(setStates: Array<"cancelled" | "in-progress" | "not-started" | "done">): SessionSetsProvider {
    // SessionSetsProvider returns [] when no workspace folders are set,
    // because that is the "no project loaded" early-exit. The vscode
    // stub leaves workspaceFolders undefined by default; tests that
    // drive getChildren must populate it. The test harness provides
    // real folders, so this stub-only branch is skipped there.
    const ws = (vscode as unknown as { workspace: { workspaceFolders?: unknown } }).workspace;
    if (ws.workspaceFolders === undefined) {
      ws.workspaceFolders = [{ uri: extensionUri, name: "stub", index: 0 }];
    }
    const provider = new SessionSetsProvider(extensionUri);
    const fakeSets = setStates.map((state, i) => ({
      name: `set-${i}-${state}`,
      dir: `/tmp/${i}`,
      specPath: `/tmp/${i}/spec.md`,
      activityPath: `/tmp/${i}/activity-log.json`,
      changeLogPath: `/tmp/${i}/change-log.md`,
      statePath: `/tmp/${i}/session-state.json`,
      aiAssignmentPath: `/tmp/${i}/ai-assignment.md`,
      uatChecklistPath: `/tmp/${i}/x-uat-checklist.json`,
      state,
      totalSessions: null,
      sessionsCompleted: 0,
      lastTouched: null,
      liveSession: null,
      config: { requiresUAT: false, requiresE2E: false, uatScope: "none", outsourceMode: "first" as const },
      uatSummary: null,
      root: "/tmp",
    }));
    provider._cache = fakeSets;
    return provider;
  }

  test("Cancelled group is hidden when there are no cancelled sets", async () => {
    const provider = makeProviderWithFixture(["in-progress", "done", "not-started"]);
    const groups = await provider.getChildren();
    const labels = (groups ?? []).map((g) => String(g.label));
    assert.ok(!labels.some((l) => l.startsWith("Cancelled")), `unexpected Cancelled group in ${labels.join(", ")}`);
    assert.strictEqual(labels.length, 3);
  });

  test("Cancelled group appears when ≥ 1 cancelled set exists", async () => {
    const provider = makeProviderWithFixture(["in-progress", "cancelled"]);
    const groups = await provider.getChildren();
    const labels = (groups ?? []).map((g) => String(g.label));
    const cancelledLabel = labels.find((l) => l.startsWith("Cancelled"));
    assert.ok(cancelledLabel, `expected Cancelled group in ${labels.join(", ")}`);
    assert.ok(/\(1\)$/.test(cancelledLabel!), `expected count of 1 in label "${cancelledLabel}"`);
  });

  test("Cancelled group renders set items via getChildren(group)", async () => {
    const provider = makeProviderWithFixture(["cancelled", "cancelled", "done"]);
    const groups = await provider.getChildren();
    const cancelledGroup = (groups ?? []).find((g) => String(g.label).startsWith("Cancelled"));
    assert.ok(cancelledGroup);
    const items = await provider.getChildren(cancelledGroup);
    assert.strictEqual(items?.length, 2);
    for (const item of items ?? []) {
      assert.ok(
        String(item.contextValue).startsWith("sessionSet:cancelled"),
        `unexpected contextValue ${String(item.contextValue)}`
      );
    }
  });
});

suite("Cancel/restore round-trip via readSessionSets", () => {
  test("cancelling a not-started set moves it to the cancelled group", () => {
    const dir = makeTmpDir();
    const setDir = setupSet(dir, "ns-set", {});
    // Force lazy-synth so session-state.json is on disk before cancel.
    readSessionSets(dir);

    // cancelSessionSet is async — mocha test allows promise return.
    return cancelSessionSet(setDir, "scope rolled into another set").then(() => {
      const sets = readSessionSets(dir);
      assert.strictEqual(sets[0].state, "cancelled");
      fs.rmSync(dir, { recursive: true });
    });
  });

  test("cancelling an in-progress set moves it to cancelled", () => {
    const dir = makeTmpDir();
    const setDir = setupSet(dir, "ip-set", {
      activity: true,
      status: "in-progress",
    });
    return cancelSessionSet(setDir, "").then(() => {
      const sets = readSessionSets(dir);
      assert.strictEqual(sets[0].state, "cancelled");
      fs.rmSync(dir, { recursive: true });
    });
  });

  test("cancelling a done set moves it to cancelled", () => {
    const dir = makeTmpDir();
    const setDir = setupSet(dir, "done-set", {
      changeLog: true,
      status: "complete",
    });
    return cancelSessionSet(setDir, "").then(() => {
      const sets = readSessionSets(dir);
      assert.strictEqual(sets[0].state, "cancelled");
      fs.rmSync(dir, { recursive: true });
    });
  });

  test("restoring a previously-done set returns to done (not in-progress)", async () => {
    const dir = makeTmpDir();
    const setDir = setupSet(dir, "done-then-cancel-then-restore", {
      changeLog: true,
      status: "complete",
    });
    await cancelSessionSet(setDir, "");
    await restoreSessionSet(setDir, "");
    const sets = readSessionSets(dir);
    // change-log.md is still present so the inferred fallback is "done";
    // the captured preCancelStatus on the state file is "complete" so the
    // primary path also returns to done. Either way the tree-view label
    // is "done".
    assert.strictEqual(sets[0].state, "done");
    fs.rmSync(dir, { recursive: true });
  });

  test("restoring an in-progress-only set returns to in-progress", async () => {
    const dir = makeTmpDir();
    const setDir = setupSet(dir, "ip-then-cancel-then-restore", {
      activity: true,
      status: "in-progress",
    });
    await cancelSessionSet(setDir, "");
    await restoreSessionSet(setDir, "");
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "in-progress");
    fs.rmSync(dir, { recursive: true });
  });

  test("restoring a not-started-only set returns to not-started", async () => {
    const dir = makeTmpDir();
    const setDir = setupSet(dir, "ns-then-cancel-then-restore", {});
    // Force lazy-synth so a state file with status='not-started' exists
    // before cancel — otherwise the first cancel writes the file via its
    // own path and preCancelStatus is null, which inferStatusFromFiles
    // resolves to "not-started" anyway.
    readSessionSets(dir);
    await cancelSessionSet(setDir, "");
    await restoreSessionSet(setDir, "");
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "not-started");
    fs.rmSync(dir, { recursive: true });
  });
});
