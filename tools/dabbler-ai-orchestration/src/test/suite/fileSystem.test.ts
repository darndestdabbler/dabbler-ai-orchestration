import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  countDistinctCloseoutSessions,
  isMidSetComplete,
  parseSessionSetConfig,
  parseUatChecklist,
  readSessionSets,
} from "../../utils/fileSystem";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-test-"));
}

suite("fileSystem — parseSessionSetConfig", () => {
  test("returns safe defaults when spec is missing", () => {
    const cfg = parseSessionSetConfig("/nonexistent/spec.md");
    assert.strictEqual(cfg.requiresUAT, false);
    assert.strictEqual(cfg.requiresE2E, false);
    assert.strictEqual(cfg.uatScope, "none");
  });

  test("parses requiresUAT and requiresE2E from yaml block", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(specPath, `## Session Set Configuration\n\`\`\`yaml\nrequiresUAT: true\nrequiresE2E: false\n\`\`\``);
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.requiresUAT, true);
    assert.strictEqual(cfg.requiresE2E, false);
    fs.rmSync(dir, { recursive: true });
  });

  test("falls back to scanning plain text when no yaml block", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(specPath, "# My Spec\n\nrequiresUAT: true\n");
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.requiresUAT, true);
    fs.rmSync(dir, { recursive: true });
  });

  // Regression test for Set 015 Session 3 (2026-05-06): platform specs
  // that put the config yaml block under a non-canonical heading like
  // `## UAT scope` AND have enough upstream prose to push the yaml past
  // 4000 bytes were silently treated as `requiresUAT: false`. The parser
  // now scans the whole file when the canonical heading is absent.
  test("detects requiresUAT in yaml block past 4000 bytes when canonical heading absent", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    const padding = "x".repeat(4500);  // push the yaml block past the old cutoff
    const content = `# Some Spec\n\n${padding}\n\n## UAT scope\n\n\`\`\`yaml\nrequiresUAT: true\nrequiresE2E: false\nuatScope: full\n\`\`\`\n`;
    fs.writeFileSync(specPath, content);
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.requiresUAT, true);
    assert.strictEqual(cfg.requiresE2E, false);
    assert.strictEqual(cfg.uatScope, "full");
    fs.rmSync(dir, { recursive: true });
  });

  // Negative case: spec that doesn't declare requiresUAT anywhere remains
  // false. Guards against an over-broad fix that might match prose
  // mentions of "requiresUAT" that aren't on their own line.
  test("returns false when requiresUAT is not declared anywhere", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    const content = `# Some Spec\n\nThis spec does not declare requiresUAT or requiresE2E.\nIt mentions them in prose but never on a standalone line.\n`;
    fs.writeFileSync(specPath, content);
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.requiresUAT, false);
    assert.strictEqual(cfg.requiresE2E, false);
    fs.rmSync(dir, { recursive: true });
  });

  // Set 048 Session 2: tri-state requiresUAT/E2E.

  test("Set 048: tri-state requiresUAT='suggested' (unquoted)", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(specPath, "## Session Set Configuration\n```yaml\nrequiresUAT: suggested\nrequiresE2E: false\n```");
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.requiresUAT, "suggested");
    assert.strictEqual(cfg.requiresE2E, false);
    fs.rmSync(dir, { recursive: true });
  });

  test("Set 048: tri-state requiresUAT='suggested' (quoted)", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(specPath, "## Session Set Configuration\n```yaml\nrequiresUAT: \"suggested\"\nrequiresE2E: false\n```");
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.requiresUAT, "suggested");
    fs.rmSync(dir, { recursive: true });
  });

  test("Set 048: tri-state requiresE2E='suggested'", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(specPath, "## Session Set Configuration\n```yaml\nrequiresUAT: false\nrequiresE2E: suggested\n```");
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.requiresE2E, "suggested");
    fs.rmSync(dir, { recursive: true });
  });

  test("Set 048: inline YAML comments tolerated", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(specPath, "## Session Set Configuration\n```yaml\nrequiresUAT: \"suggested\"  # Set 048 D4\n```");
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.requiresUAT, "suggested");
    fs.rmSync(dir, { recursive: true });
  });

  test("Set 048: mixed tri-state flags", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(specPath, "## Session Set Configuration\n```yaml\nrequiresUAT: true\nrequiresE2E: suggested\n```");
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.requiresUAT, true);
    assert.strictEqual(cfg.requiresE2E, "suggested");
    fs.rmSync(dir, { recursive: true });
  });
});

suite("fileSystem — parseUatChecklist", () => {
  test("returns null when file is missing", () => {
    const result = parseUatChecklist("/nonexistent/checklist.json");
    assert.strictEqual(result, null);
  });

  test("counts pending items", () => {
    const dir = makeTmpDir();
    const checklistPath = path.join(dir, "checklist.json");
    fs.writeFileSync(checklistPath, JSON.stringify({
      items: [
        { Result: "" },
        { Result: "pass" },
        { Result: "pending" },
      ],
    }));
    const result = parseUatChecklist(checklistPath);
    assert.ok(result);
    assert.strictEqual(result.pendingItems, 2);
    assert.strictEqual(result.totalItems, 3);
    fs.rmSync(dir, { recursive: true });
  });
});

suite("fileSystem — readSessionSets", () => {
  test("returns empty array when docs/session-sets does not exist", () => {
    const sets = readSessionSets("/nonexistent");
    assert.deepStrictEqual(sets, []);
  });

  // Set 7: state is read directly from session-state.json's `status`,
  // not derived from file presence. Each fixture writes the canonical
  // not-started / in-progress / complete status string and asserts the
  // tree-view label maps it correctly. The "spec.md only" fixture
  // exercises the lazy-synth fallback (Set 115 S1: inferred in memory —
  // the read no longer writes the file).

  test("reads a not-started set via lazy-synth (spec.md only)", () => {
    const dir = makeTmpDir();
    const slug = "my-feature";
    const setDir = path.join(dir, "docs", "session-sets", slug);
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# my-feature\n");
    const sets = readSessionSets(dir);
    assert.strictEqual(sets.length, 1);
    assert.strictEqual(sets[0].name, slug);
    assert.strictEqual(sets[0].state, "not-started");
    // Set 115 S1: the inference is in memory. Creating the file belongs
    // to the router's writers, so scanning a folder leaves it untouched.
    assert.ok(
      !fs.existsSync(path.join(setDir, "session-state.json")),
      "a read must not create the state file",
    );
    fs.rmSync(dir, { recursive: true });
  });

  test("reads in-progress from session-state.json status", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "feature-a");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# feature-a\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({ schemaVersion: 2, status: "in-progress" })
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "in-progress");
    fs.rmSync(dir, { recursive: true });
  });

  test("reads complete from session-state.json status='complete' (with per-session evidence)", () => {
    // Set 030 Session 3: v3 invariants require positive per-session
    // evidence (sessions[] or completedSessions[]) for top-level
    // status=complete to validate. A bare {status: "complete"} now
    // downgrades to in-progress under the default-to-not-started rule.
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "feature-b");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# feature-b\n");
    fs.writeFileSync(path.join(setDir, "change-log.md"), "# Changes\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 2,
        status: "complete",
        currentSession: 3,
        totalSessions: 3,
        completedSessions: [1, 2, 3],
      })
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "complete");
    fs.rmSync(dir, { recursive: true });
  });

  test("canonicalizes pre-Set-7 'completed' alias to complete", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "feature-c");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# feature-c\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 2,
        status: "completed",
        currentSession: 3,
        totalSessions: 3,
        completedSessions: [1, 2, 3],
      })
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "complete");
    fs.rmSync(dir, { recursive: true });
  });

  // Defensive: pre-0.2.1 ai_router flipped status to "complete" after
  // every session's close-out, not just the last. Stale snapshots and
  // consumer repos that haven't upgraded yet still produce that shape,
  // which would briefly render the set as Done between sessions. The
  // extension cross-checks currentSession vs totalSessions and treats
  // a mid-set "complete" as in-progress instead.
  test("status='complete' with currentSession < totalSessions reads as in-progress", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "mid-set-stale");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# mid-set-stale\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 2,
        status: "complete",
        currentSession: 3,
        totalSessions: 5,
      })
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "in-progress");
    fs.rmSync(dir, { recursive: true });
  });

  // Authoritative source for sessionsCompleted in schema v2:
  // `completedSessions` array. The earlier `currentSession - 1`
  // fallback was wrong whenever the latest session was itself
  // complete (off-by-one low). Lightweight-tier repos that
  // hand-maintain session-state.json rely on this field.
  test("sessionsCompleted reads completedSessions.length from state file", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "completed-array");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# completed-array\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 2,
        status: "in-progress",
        currentSession: 3,
        totalSessions: 4,
        completedSessions: [1, 2, 3],
      })
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].sessionsCompleted, 3);
    fs.rmSync(dir, { recursive: true });
  });

  test("status='complete' with full completedSessions[] resolves to N/N", () => {
    // Set 030 Session 3: v3 requires per-session evidence; the
    // pre-Set-022 "no completedSessions array" → fallback path now
    // downgrades to in-progress instead of escalating to N/N. The
    // bulk migrator (Session 4) heals legacy snapshots.
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "complete-with-array");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# complete-with-array\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 2,
        status: "complete",
        currentSession: 4,
        totalSessions: 4,
        completedSessions: [1, 2, 3, 4],
      })
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].sessionsCompleted, 4);
    fs.rmSync(dir, { recursive: true });
  });

  // Regression for ctelr-spec drift (2026-05-12): a Lightweight-tier
  // consumer hand-wrote `status: "completed"` (past participle) instead
  // of the canonical `"complete"`. readStatus() aliased it for bucketing
  // (so the set landed in Done), but the count-derivation branch used
  // raw `sd.status` and missed the alias, falling through to
  // currentSession-1 and displaying N-1/N. Using `state` (already
  // canonicalized via readStatus) keeps both reads in lockstep.
  test("status='completed' alias resolves to complete with full completedSessions[]", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "completed-alias");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# completed-alias\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 2,
        status: "completed",
        currentSession: 3,
        totalSessions: 3,
        completedSessions: [1, 2, 3],
      })
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "complete");
    assert.strictEqual(sets[0].sessionsCompleted, 3);
    fs.rmSync(dir, { recursive: true });
  });

  test("status='complete' with full completedSessions[] reads as complete", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "real-done");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# real-done\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 2,
        status: "complete",
        currentSession: 5,
        totalSessions: 5,
        completedSessions: [1, 2, 3, 4, 5],
      })
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "complete");
    fs.rmSync(dir, { recursive: true });
  });

  // Regression for unified-master-details-composite drift (2026-05-12):
  // snapshot claimed `status: complete` with `verificationVerdict:
  // VERIFIED` at currentSession=5/totalSessions=5, yet
  // `session-events.jsonl` had `closeout_succeeded` events for sessions
  // 1-4 only — session 5 never actually closed. The pre-existing
  // currentSession<totalSessions guard didn't catch this (5 is not <5);
  // the set rendered as Done with no real evidence the final session
  // ran. The expanded guard cross-checks the events ledger: if the
  // ledger exists and has no closeout event for `currentSession`, the
  // snapshot drifted from the authoritative ledger and we downgrade
  // bucketing to in-progress.
  test("status='complete' with no closeout event for final session reads as in-progress", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "ledger-gap");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# ledger-gap\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 2,
        status: "complete",
        currentSession: 5,
        totalSessions: 5,
        verificationVerdict: "VERIFIED",
      })
    );
    // Closeouts logged for sessions 1-4 only; session 5 never closed.
    const events = [
      { timestamp: "2026-05-12T00:41:53Z", session_number: 1, event_type: "closeout_succeeded" },
      { timestamp: "2026-05-12T07:04:10Z", session_number: 2, event_type: "closeout_succeeded" },
      { timestamp: "2026-05-12T08:26:28Z", session_number: 3, event_type: "closeout_succeeded" },
      { timestamp: "2026-05-12T11:40:49Z", session_number: 4, event_type: "closeout_succeeded" },
    ].map((e) => JSON.stringify(e)).join("\n") + "\n";
    fs.writeFileSync(path.join(setDir, "session-events.jsonl"), events);
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "in-progress");
    fs.rmSync(dir, { recursive: true });
  });

  // Sibling to the previous test: when the events ledger DOES record a
  // closeout for the final session, the bucketing is Done. Locks in
  // that the guard is reading the ledger for a real signal, not just
  // any presence of the file.
  test("status='complete' with closeout event for final session reads as done", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "ledger-complete");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# ledger-complete\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 2,
        status: "complete",
        currentSession: 3,
        totalSessions: 3,
      })
    );
    const events = [
      { timestamp: "2026-05-12T01:00:00Z", session_number: 1, event_type: "closeout_succeeded" },
      { timestamp: "2026-05-12T02:00:00Z", session_number: 2, event_type: "closeout_succeeded" },
      { timestamp: "2026-05-12T03:00:00Z", session_number: 3, event_type: "closeout_succeeded" },
    ].map((e) => JSON.stringify(e)).join("\n") + "\n";
    fs.writeFileSync(path.join(setDir, "session-events.jsonl"), events);
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "complete");
    fs.rmSync(dir, { recursive: true });
  });

  // Set 7: the canonical contract is "status beats file presence."
  // These contradictory fixtures lock that in — without them, the old
  // file-presence implementation could still pass the basic in-progress
  // and done tests above (they have both the legacy presence signal AND
  // a matching status). Round-1 verifier flagged this gap.

  test("status='complete' beats activity-log.json presence (with per-session evidence)", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "contradict-1");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# contradict-1\n");
    fs.writeFileSync(path.join(setDir, "activity-log.json"), JSON.stringify({ entries: [] }));
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 2,
        status: "complete",
        currentSession: 1,
        totalSessions: 1,
        completedSessions: [1],
      })
    );
    const sets = readSessionSets(dir);
    // Old file-presence rule: change-log absent + activity-log present
    // = "in-progress". Set 7 rule: status overrides → "complete".
    // Set 030 Session 3: status needs per-session evidence to escalate.
    assert.strictEqual(sets[0].state, "complete");
    fs.rmSync(dir, { recursive: true });
  });

  test("status='in-progress' beats change-log.md presence", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "contradict-2");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# contradict-2\n");
    fs.writeFileSync(path.join(setDir, "change-log.md"), "# Changes\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({ schemaVersion: 2, status: "in-progress" })
    );
    const sets = readSessionSets(dir);
    // Old file-presence rule: change-log present = "done". Set 7 rule:
    // status overrides → "in-progress". The contradiction itself is
    // unusual (it would mean a new session was opened after a previous
    // one's change-log was authored); this test locks in the precedence.
    assert.strictEqual(sets[0].state, "in-progress");
    fs.rmSync(dir, { recursive: true });
  });

  // Verifier round 2 regression: lazy-synth on a legacy folder with
  // change-log.md or activity-log.json but no session-state.json must
  // infer the right initial state from those files (not regress to
  // not-started).
  //
  // Set 115 S1: that inference is now IN MEMORY. `readStatus` no longer
  // creates the file — the router's sanctioned writers own creation, so
  // scanning a folder in the Explorer cannot race them onto disk with a
  // generic `Session N` ledger. Each test below therefore asserts the
  // rendered set AND that nothing was written.

  test("lazy-synth infers 'complete' from legacy change-log.md presence (with spec totalSessions)", () => {
    // Set 030 Session 3: lazy-synth derives sessions[] when the spec
    // declares totalSessions.
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "legacy-done");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(
      path.join(setDir, "spec.md"),
      "# legacy-done\n\n## Session Set Configuration\n\n```yaml\ntotalSessions: 2\n```\n",
    );
    fs.writeFileSync(path.join(setDir, "change-log.md"), "# Changes\n");
    // Deliberately no session-state.json — exercises the lazy-synth path.
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "complete");
    assert.ok(
      !fs.existsSync(path.join(setDir, "session-state.json")),
      "Set 115 S1: a read must not create the state file",
    );
    const sessions = sets[0].sessions ?? [];
    assert.strictEqual(sessions.length, 2);
    for (const entry of sessions) {
      assert.strictEqual(entry.status, "complete");
    }
    fs.rmSync(dir, { recursive: true });
  });

  test("lazy-synth with change-log.md but NO spec totalSessions stays not-started (Round A fix)", () => {
    // Round-A regression (Set 030 Session 3 verifier): without a
    // known plan, the reader cannot claim a complete snapshot. The
    // inference falls through to not-started.
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "plan-less");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# plan-less\n");
    fs.writeFileSync(path.join(setDir, "change-log.md"), "# Changes\n");
    const sets = readSessionSets(dir);
    // Without a plan, the snapshot can't claim complete — bucket as
    // not-started.
    assert.strictEqual(sets[0].state, "not-started");
    assert.ok(!fs.existsSync(path.join(setDir, "session-state.json")));
    fs.rmSync(dir, { recursive: true });
  });

  test("lazy-synth infers 'in-progress' from legacy activity-log.json (with spec totalSessions)", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "legacy-active");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(
      path.join(setDir, "spec.md"),
      "# legacy-active\n\n## Session Set Configuration\n\n```yaml\ntotalSessions: 3\n```\n",
    );
    fs.writeFileSync(
      path.join(setDir, "activity-log.json"),
      JSON.stringify({
        entries: [{ sessionNumber: 1, dateTime: "2026-01-01T00:00:00-04:00" }],
      })
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "in-progress");
    assert.ok(!fs.existsSync(path.join(setDir, "session-state.json")));
    const sessions = sets[0].sessions ?? [];
    assert.strictEqual(sessions.length, 3);
    assert.strictEqual(sessions[0].status, "in-progress");
    fs.rmSync(dir, { recursive: true });
  });

  test("skips directories starting with underscore", () => {
    const dir = makeTmpDir();
    const archivedDir = path.join(dir, "docs", "session-sets", "_archived");
    fs.mkdirSync(archivedDir, { recursive: true });
    fs.writeFileSync(path.join(archivedDir, "spec.md"), "# archived\n");
    const sets = readSessionSets(dir);
    assert.strictEqual(sets.length, 0);
    fs.rmSync(dir, { recursive: true });
  });

  // Set 022 Session 2: the events ledger is the Full-tier fallback
  // for `sessionsCompleted` when `completedSessions[]` is absent. A
  // pre-Set-022 set whose snapshot hasn't been healed by a boundary
  // write yet should still render the correct fraction from the
  // ledger's closeout_succeeded events. Distinct session_numbers are
  // counted so a session with multiple closeout_succeeded events
  // (the dedupe path under register_session_start) doesn't inflate
  // the count.
  test("sessionsCompleted falls back to distinct closeout_succeeded events when completedSessions[] absent", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "ledger-fallback");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# ledger-fallback\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 2,
        status: "in-progress",
        currentSession: 4,
        totalSessions: 5,
        // Note: no completedSessions array.
      })
    );
    const events = [
      { timestamp: "2026-05-12T01:00:00Z", session_number: 1, event_type: "closeout_succeeded" },
      { timestamp: "2026-05-12T02:00:00Z", session_number: 2, event_type: "closeout_succeeded" },
      { timestamp: "2026-05-12T03:00:00Z", session_number: 3, event_type: "closeout_succeeded" },
      // Duplicate event for session 3 — must not inflate the count.
      { timestamp: "2026-05-12T03:01:00Z", session_number: 3, event_type: "closeout_succeeded" },
    ].map((e) => JSON.stringify(e)).join("\n") + "\n";
    fs.writeFileSync(path.join(setDir, "session-events.jsonl"), events);
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].sessionsCompleted, 3);
    fs.rmSync(dir, { recursive: true });
  });

  // Set 022 Session 2: the `currentSession - 1` fallback was removed
  // because it produced off-by-one displays at both endpoints of the
  // session lifecycle. With it gone, an in-flight set that has neither
  // `completedSessions[]` nor a Full-tier events ledger renders as
  // `0/N` (truthful — we have no evidence any session closed). This
  // is the path Lightweight-tier sets that pre-date the Set 022
  // protocol fall through, and the schema doc now requires those sets
  // to hand-maintain `completedSessions[]`. Locking the new behavior
  // in: a fresh-shape set with currentSession=2 but no array and no
  // ledger no longer inflates to 1/4.
  test("sessionsCompleted is 0 (not currentSession-1) when no completedSessions[] and no ledger", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "no-array-no-ledger");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# no-array-no-ledger\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 2,
        status: "in-progress",
        currentSession: 3,
        totalSessions: 4,
      })
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].sessionsCompleted, 0);
    assert.strictEqual(sets[0].totalSessions, 4);
    fs.rmSync(dir, { recursive: true });
  });

  // Set 022 Session 2: confirm activity-log is no longer a count
  // source. A set whose activity-log records steps for sessions 1-3
  // (3 distinct sessionNumbers) but whose state file has empty
  // `completedSessions: []` should render `0/4`, not the old `3/4`
  // the activity-log path would have produced. The Lightweight-tier
  // contract is now: maintain `completedSessions[]` or accept a
  // truthful `0/N` display.
  test("sessionsCompleted is 0 when activity-log has entries but completedSessions[] is empty", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "activity-log-ignored");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# activity-log-ignored\n");
    fs.writeFileSync(
      path.join(setDir, "activity-log.json"),
      JSON.stringify({
        totalSessions: 4,
        entries: [
          { sessionNumber: 1, dateTime: "2026-05-12T01:00:00-04:00" },
          { sessionNumber: 2, dateTime: "2026-05-12T02:00:00-04:00" },
          { sessionNumber: 3, dateTime: "2026-05-12T03:00:00-04:00" },
        ],
      })
    );
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 2,
        status: "in-progress",
        currentSession: 4,
        totalSessions: 4,
        completedSessions: [],
      })
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].sessionsCompleted, 0);
    assert.strictEqual(sets[0].totalSessions, 4);
    fs.rmSync(dir, { recursive: true });
  });

  // Set 022 Session 2 round-1 verifier finding: when both
  // activity-log.json and session-state.json declare `totalSessions`,
  // the state file wins. The pre-fix path took the activity-log
  // value first and only fell back to the state file when the
  // activity-log was absent, which silently mis-displayed the
  // fraction whenever a Lightweight-tier consumer hand-edited one
  // file but not the other.
  test("totalSessions: state-file value beats activity-log value", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "totals-conflict");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# totals-conflict\n");
    // Activity-log lies (stale value) — state file should beat it.
    fs.writeFileSync(
      path.join(setDir, "activity-log.json"),
      JSON.stringify({ totalSessions: 99, entries: [] }),
    );
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 2,
        status: "complete",
        currentSession: 3,
        totalSessions: 3,
        completedSessions: [1, 2, 3],
      }),
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].totalSessions, 3);
    // Plus: done fallback should compute 3, not 99.
    assert.strictEqual(sets[0].sessionsCompleted, 3);
    fs.rmSync(dir, { recursive: true });
  });

  // Set 022 Session 2: surface `completedSessions[]` through the
  // LiveSession model so the tree-view's in-flight predicate can
  // compute without re-reading the state file.
  test("liveSession.completedSessions is surfaced from the state snapshot", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "in-flight");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# in-flight\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 2,
        status: "in-progress",
        currentSession: 2,
        totalSessions: 3,
        completedSessions: [1],
      })
    );
    const sets = readSessionSets(dir);
    assert.deepStrictEqual(sets[0].liveSession?.completedSessions, [1]);
    assert.strictEqual(sets[0].liveSession?.currentSession, 2);
    fs.rmSync(dir, { recursive: true });
  });
});

// Set 030 Session 3: `isMidSetComplete` is now a single-predicate
// probe that asks "does the snapshot satisfy the 8 v3 invariants?"
// instead of the Set 023 multi-signal predicate. For v3 files this is
// a direct invariant check; for v2 files the snapshot is synthesized
// first (legacy completedSessions[] -> per-session status mapping)
// then validated. Drift cases that the Set 023 predicate caught
// (count mismatch, final-session signal gap) now surface as rule 4 or
// rule 7 violations.
//
// Semantic change vs. Set 023: a pre-Set-022 v2 snapshot without
// `completedSessions[]` synthesizes to all-not-started, so a
// `status: "complete"` declaration without per-session evidence now
// downgrades to mid-set even when the events ledger has the closeouts.
// The bulk migrator (Session 4) heals these by writing v3 sessions[]
// directly; until then, the bucketing shows in-progress for the
// affected sets, which is the conservative "default to not-started;
// require positive evidence to escalate" rule.
suite("fileSystem — isMidSetComplete (Set 030 Session 3)", () => {
  function writeState(setDir: string, state: object): string {
    fs.mkdirSync(setDir, { recursive: true });
    const statePath = path.join(setDir, "session-state.json");
    fs.writeFileSync(statePath, JSON.stringify(state));
    return statePath;
  }

  // V3-1: a v3 snapshot whose sessions[] satisfies all invariants
  // returns NOT mid-set. This is the canonical "set is genuinely
  // complete" shape.
  test("v3 snapshot with all sessions complete → not mid-set", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "v3-complete");
    const statePath = writeState(setDir, {
      schemaVersion: 3,
      status: "complete",
      lifecycleState: "closed",
      sessions: [
        { number: 1, title: "Alpha", status: "complete" },
        { number: 2, title: "Beta", status: "complete" },
        { number: 3, title: "Gamma", status: "complete" },
      ],
    });
    assert.strictEqual(isMidSetComplete(statePath), false);
    fs.rmSync(dir, { recursive: true });
  });

  // V3-2: a v3 snapshot whose top-level status disagrees with
  // sessions[] (e.g., top=complete but one session not-started) trips
  // rule 7. Downgrade is the right call — the operator hand-edited
  // one field but not the other.
  test("v3 snapshot with status=complete but a not-started session → mid-set (rule 7)", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "v3-drift");
    const statePath = writeState(setDir, {
      schemaVersion: 3,
      status: "complete",
      lifecycleState: "closed",
      sessions: [
        { number: 1, title: "Alpha", status: "complete" },
        { number: 2, title: "Beta", status: "complete" },
        { number: 3, title: "Gamma", status: "not-started" },
      ],
    });
    assert.strictEqual(isMidSetComplete(statePath), true);
    fs.rmSync(dir, { recursive: true });
  });

  // V2-1: a v2 snapshot with completedSessions covering every session
  // and status=complete synthesizes to all-complete, passes rule 7,
  // returns NOT mid-set. The post-Set-022 / pre-Set-030 happy path.
  test("v2 snapshot with completedSessions covering every session → not mid-set", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "v2-complete");
    const statePath = writeState(setDir, {
      schemaVersion: 2,
      status: "complete",
      currentSession: 3,
      totalSessions: 3,
      completedSessions: [1, 2, 3],
    });
    assert.strictEqual(isMidSetComplete(statePath), false);
    fs.rmSync(dir, { recursive: true });
  });

  // V2-2: v2 snapshot with status=complete but completedSessions
  // partial → synthesize produces an entry that's not "complete";
  // rule 7 fires. Drift downgrade.
  test("v2 snapshot status=complete with partial completedSessions → mid-set", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "v2-partial");
    const statePath = writeState(setDir, {
      schemaVersion: 2,
      status: "complete",
      currentSession: 3,
      totalSessions: 3,
      completedSessions: [1, 2],
    });
    assert.strictEqual(isMidSetComplete(statePath), true);
    fs.rmSync(dir, { recursive: true });
  });

  // V2-3: legacy pre-Set-022 snapshot with no completedSessions[] at
  // all. Synthesize produces all-not-started, rule 7 fires, downgrade.
  // The Set 023 events-ledger fallback that used to keep this case
  // bucketed as Done is intentionally gone — pre-Set-022 snapshots
  // get healed on their next boundary write or via the Session 4
  // bulk migrator.
  test("v2 snapshot status=complete with no completedSessions[] → mid-set (default-to-not-started)", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "v2-bare");
    const statePath = writeState(setDir, {
      schemaVersion: 2,
      status: "complete",
      currentSession: 3,
      totalSessions: 3,
    });
    assert.strictEqual(isMidSetComplete(statePath), true);
    fs.rmSync(dir, { recursive: true });
  });

  // V2-4: count mismatch (currentSession < totalSessions). Under v3
  // synthesis: completed=[1,2,3] (current=2 is in completedSet, so
  // legacy_current_in_progress branch doesn't fire). Sessions become
  // [c,c,c]. Rule 7 passes. The Set 023 explicit guard against
  // currentSession < totalSessions is gone — the count mismatch
  // alone doesn't violate any v3 invariant. The drift surfaces
  // elsewhere (e.g., progressText shows "3/3" when the legacy
  // currentSession=2 suggested mid-set) but it no longer drives
  // the bucketing here.
  test("v2 count mismatch (completedSessions covers all) → not mid-set under v3 semantics", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "v2-count-mismatch");
    const statePath = writeState(setDir, {
      schemaVersion: 2,
      status: "complete",
      currentSession: 2,
      totalSessions: 3,
      completedSessions: [1, 2, 3],
    });
    assert.strictEqual(isMidSetComplete(statePath), false);
    fs.rmSync(dir, { recursive: true });
  });

  // Defensive: parse errors return false (trust the canonical
  // status; don't second-guess on garbled input).
  test("malformed JSON → returns false (trust canonical status)", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "malformed");
    fs.mkdirSync(setDir, { recursive: true });
    const statePath = path.join(setDir, "session-state.json");
    fs.writeFileSync(statePath, "{not-valid-json");
    assert.strictEqual(isMidSetComplete(statePath), false);
    fs.rmSync(dir, { recursive: true });
  });

  // Defensive: a missing file is not a drift signal.
  test("missing file → returns false", () => {
    assert.strictEqual(
      isMidSetComplete("/definitely/does/not/exist/state.json"),
      false,
    );
  });

  // Defensive: a non-object JSON value (e.g., a primitive or array)
  // returns false rather than throwing.
  test("non-object JSON value → returns false", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "primitive");
    fs.mkdirSync(setDir, { recursive: true });
    const statePath = path.join(setDir, "session-state.json");
    fs.writeFileSync(statePath, '"just a string"');
    assert.strictEqual(isMidSetComplete(statePath), false);
    fs.rmSync(dir, { recursive: true });
  });
});

suite("fileSystem — countDistinctCloseoutSessions", () => {
  // Set 022 Session 2: generalization of hasCloseoutEventForSession.
  // Treated as 0 for any read failure (missing file, malformed JSON,
  // permission error) so callers fall through to the next derivation
  // step rather than asserting "no sessions done" on garbled input.
  test("returns 0 when the events file is missing", () => {
    assert.strictEqual(
      countDistinctCloseoutSessions("/nonexistent/session-events.jsonl"),
      0,
    );
  });

  test("counts distinct closeout_succeeded session numbers", () => {
    const dir = makeTmpDir();
    const eventsPath = path.join(dir, "session-events.jsonl");
    const events = [
      { session_number: 1, event_type: "work_started" },
      { session_number: 1, event_type: "closeout_succeeded" },
      { session_number: 2, event_type: "work_started" },
      { session_number: 2, event_type: "closeout_succeeded" },
      // Non-closeout events with the same session_number must not count.
      { session_number: 3, event_type: "work_started" },
    ].map((e) => JSON.stringify(e)).join("\n") + "\n";
    fs.writeFileSync(eventsPath, events);
    assert.strictEqual(countDistinctCloseoutSessions(eventsPath), 2);
    fs.rmSync(dir, { recursive: true });
  });

  test("dedupes duplicate closeout_succeeded events for the same session", () => {
    const dir = makeTmpDir();
    const eventsPath = path.join(dir, "session-events.jsonl");
    const events = [
      { session_number: 1, event_type: "closeout_succeeded" },
      { session_number: 1, event_type: "closeout_succeeded" },
      { session_number: 2, event_type: "closeout_succeeded" },
    ].map((e) => JSON.stringify(e)).join("\n") + "\n";
    fs.writeFileSync(eventsPath, events);
    assert.strictEqual(countDistinctCloseoutSessions(eventsPath), 2);
    fs.rmSync(dir, { recursive: true });
  });

  test("tolerates malformed lines in the append-only ledger", () => {
    const dir = makeTmpDir();
    const eventsPath = path.join(dir, "session-events.jsonl");
    const lines = [
      JSON.stringify({ session_number: 1, event_type: "closeout_succeeded" }),
      "not json",
      JSON.stringify({ session_number: 2, event_type: "closeout_succeeded" }),
    ].join("\n") + "\n";
    fs.writeFileSync(eventsPath, lines);
    assert.strictEqual(countDistinctCloseoutSessions(eventsPath), 2);
    fs.rmSync(dir, { recursive: true });
  });
});

// Set 047 Session 3: extend the needsMigration detector so canonical
// v3 files flag for the new v3 → v4 migrator. The earlier detector
// only flagged v1/v2 (or broken v3); the new behavior surfaces a
// migration affordance on every canonical v3 file so the (needs
// migration) badge stays accurate after the migrator ships.
suite("fileSystem — readSessionSets needsMigration + migrationTargetSchemaVersion", () => {
  test("canonical v3 with sessions[] flags needsMigration target=4", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "canonical-v3");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# canonical-v3\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 3,
        sessionSetName: "canonical-v3",
        status: "in-progress",
        sessions: [
          { number: 1, title: "t1", status: "in-progress" },
          { number: 2, title: "t2", status: "not-started" },
        ],
        currentSession: 1,
        totalSessions: 2,
        completedSessions: [],
      }),
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].needsMigration, true);
    assert.strictEqual(sets[0].migrationTargetSchemaVersion, 4);
    fs.rmSync(dir, { recursive: true });
  });

  test("v4 file does NOT flag (already current)", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "already-v4");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# already-v4\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 4,
        sessionSetName: "already-v4",
        status: "in-progress",
        sessions: [
          {
            number: 1,
            title: "t1",
            status: "in-progress",
            startedAt: null,
            completedAt: null,
            orchestrator: null,
            verificationVerdict: null,
          },
        ],
      }),
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].needsMigration, false);
    assert.strictEqual(sets[0].migrationTargetSchemaVersion, null);
    fs.rmSync(dir, { recursive: true });
  });

  test("v2 file flags needsMigration target=3", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "v2-set");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# v2-set\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 2,
        sessionSetName: "v2-set",
        status: "in-progress",
        currentSession: 1,
        totalSessions: 2,
        completedSessions: [],
      }),
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].needsMigration, true);
    assert.strictEqual(sets[0].migrationTargetSchemaVersion, 3);
    fs.rmSync(dir, { recursive: true });
  });

  test("broken v3 (schemaVersion=3, no sessions[]) flags needsMigration target=3", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "broken-v3");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# broken-v3\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 3,
        sessionSetName: "broken-v3",
        status: "in-progress",
        // sessions[] intentionally missing
      }),
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].needsMigration, true);
    assert.strictEqual(sets[0].migrationTargetSchemaVersion, 3);
    fs.rmSync(dir, { recursive: true });
  });

  test("schemaVersion missing flags needsMigration target=3", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "no-schema");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# no-schema\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        sessionSetName: "no-schema",
        status: "not-started",
      }),
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].needsMigration, true);
    assert.strictEqual(sets[0].migrationTargetSchemaVersion, 3);
    fs.rmSync(dir, { recursive: true });
  });

  test("future schema (> 4) does NOT flag — refuses to downgrade", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "future");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# future\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 99,
        sessionSetName: "future",
        status: "in-progress",
        sessions: [{ number: 1, title: "t1", status: "in-progress" }],
      }),
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].needsMigration, false);
    assert.strictEqual(sets[0].migrationTargetSchemaVersion, null);
    fs.rmSync(dir, { recursive: true });
  });
});

suite("fileSystem — readSessionSets stepLedger (Set 114 S3)", () => {
  // The scan-side half of the fifth tree level. `sessionStepModel.test.ts`
  // proves the ROWS match Python; these prove the scan hands the model the
  // right inputs, and hands it nothing at all when there is nothing honest
  // to hand over.

  const SPEC = [
    "# live-set",
    "",
    "## Session Set Configuration",
    "",
    "```yaml",
    "totalSessions: 2",
    "requiresUAT: false",
    "requiresE2E: false",
    "```",
    "",
    "### Session 1 of 2: The work",
    "",
    "1. Register.",
    "2. Build it.",
    "",
    "**Creates:** a thing",
    "",
  ].join("\n");

  const STATE = JSON.stringify({
    schemaVersion: 4,
    sessionSetName: "live-set",
    status: "in-progress",
    sessions: [
      { number: 1, title: "Session 1", status: "in-progress", startedAt: "2026-08-10T00:00:00-04:00", completedAt: null, orchestrator: null, verificationVerdict: null },
      { number: 2, title: "Session 2", status: "not-started", startedAt: null, completedAt: null, orchestrator: null, verificationVerdict: null },
    ],
  });

  function stage(
    opts: { activity?: unknown; spec?: string; state?: string } = {},
  ): { root: string; setDir: string } {
    const root = makeTmpDir();
    const setDir = path.join(root, "docs", "session-sets", "live-set");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), opts.spec ?? SPEC);
    fs.writeFileSync(path.join(setDir, "session-state.json"), opts.state ?? STATE);
    if (opts.activity !== undefined) {
      fs.writeFileSync(
        path.join(setDir, "activity-log.json"),
        typeof opts.activity === "string"
          ? opts.activity
          : JSON.stringify(opts.activity),
      );
    }
    return { root, setDir };
  }

  const LOG = {
    sessionSetName: "live-set",
    totalSessions: 2,
    entries: [
      { sessionNumber: 1, stepNumber: 1, stepKey: "register", dateTime: "2026-08-10T00:00:00-04:00", description: "Register.", status: "pending", kind: "plan-step" },
      { sessionNumber: 1, stepNumber: 2, stepKey: "build-it", dateTime: "2026-08-10T00:00:00-04:00", description: "Build it.", status: "pending", kind: "plan-step" },
      { sessionNumber: 1, stepNumber: 1, stepKey: "registration", dateTime: "2026-08-10T01:00:00-04:00", description: "Registered.", status: "complete", routedApiCalls: [] },
      { sessionNumber: 2, stepNumber: 1, stepKey: "later", dateTime: "2026-08-10T02:00:00-04:00", description: "A later session's step.", status: "pending" },
    ],
  };

  test("an in-flight set carries its current session's entries and spec steps", () => {
    const { root } = stage({ activity: LOG });
    const [set] = readSessionSets(root);
    assert.ok(set.stepLedger, "no stepLedger on an in-flight set");
    assert.strictEqual(set.stepLedger.sessionNumber, 1);
    assert.deepStrictEqual(set.stepLedger.specSteps, ["Register.", "Build it."]);
    // Only this session's entries, and only the fields the row builder
    // reads — a large `routedApiCalls` payload must not be retained for
    // the lifetime of the scan cache.
    assert.deepStrictEqual(
      set.stepLedger.entries.map((e) => e.stepKey),
      ["register", "build-it", "registration"],
    );
    for (const e of set.stepLedger.entries) {
      assert.deepStrictEqual(
        Object.keys(e).sort(),
        ["description", "kind", "sessionNumber", "status", "stepKey", "stepNumber"],
      );
    }
    fs.rmSync(root, { recursive: true });
  });

  test("a set that is not in flight carries no step ledger at all", () => {
    // The gate that keeps this feature off the startup path: every
    // complete / not-started / cancelled set pays nothing.
    const { root } = stage({
      activity: LOG,
      state: JSON.stringify({
        schemaVersion: 4,
        sessionSetName: "live-set",
        status: "complete",
        sessions: [
          { number: 1, title: "Session 1", status: "complete", startedAt: "2026-08-10T00:00:00-04:00", completedAt: "2026-08-10T03:00:00-04:00", orchestrator: null, verificationVerdict: "VERIFIED" },
          { number: 2, title: "Session 2", status: "complete", startedAt: "2026-08-10T04:00:00-04:00", completedAt: "2026-08-10T05:00:00-04:00", orchestrator: null, verificationVerdict: "VERIFIED" },
        ],
      }),
    });
    const [set] = readSessionSets(root);
    assert.strictEqual(set.state, "complete");
    assert.strictEqual(set.stepLedger ?? null, null);
    fs.rmSync(root, { recursive: true });
  });

  test("an absent activity log yields no step ledger", () => {
    const { root } = stage();
    const [set] = readSessionSets(root);
    assert.strictEqual(set.state, "in-progress");
    assert.strictEqual(set.stepLedger ?? null, null);
    fs.rmSync(root, { recursive: true });
  });

  test("an UNREADABLE activity log yields no step ledger, not a crash", () => {
    // Spec step 3's named failure mode. The scan must survive a truncated
    // or hand-mangled log; the row degrades to no children.
    const { root } = stage({ activity: "{ this is not json" });
    const [set] = readSessionSets(root);
    assert.strictEqual(set.state, "in-progress");
    assert.strictEqual(set.stepLedger ?? null, null);
    fs.rmSync(root, { recursive: true });
  });

  test("a log that says nothing about the current session yields no ledger", () => {
    const { root } = stage({
      activity: { ...LOG, entries: LOG.entries.filter((e) => e.sessionNumber !== 1) },
    });
    const [set] = readSessionSets(root);
    assert.strictEqual(set.stepLedger ?? null, null);
    fs.rmSync(root, { recursive: true });
  });

  test("an unparseable spec still yields a ledger, with no spec steps", () => {
    // Conservative in the failure direction: empty `specSteps` makes
    // `planMatchesSpec` answer false, which costs only the ordinal half of
    // reconciliation. It must NOT cost the rows.
    const { root } = stage({
      activity: LOG,
      spec: "# live-set\n\nNo session headings here at all.\n",
    });
    const [set] = readSessionSets(root);
    assert.ok(set.stepLedger);
    assert.deepStrictEqual(set.stepLedger.specSteps, []);
    assert.strictEqual(set.stepLedger.entries.length, 3);
    fs.rmSync(root, { recursive: true });
  });

  // -------------------------------------------------------------------
  // Set 115 S4 — the close-out obligation projection, on the scan side
  // -------------------------------------------------------------------
  //
  // The reader's whole job is to answer "can this recorded answer still
  // be trusted", so the tests are the four ways it cannot be, plus the
  // one way it can. The CROSS-LANGUAGE half — that this reader's digest
  // map is the same one `close_preflight.input_digests` writes — is
  // proven in the Layer 3 spec, which drives the real Python writer over
  // a real repository; here the writer is simulated so the failure modes
  // can be planted cheaply.

  function projection(over: Record<string, unknown> = {}): string {
    return JSON.stringify({
      schemaVersion: 1,
      derived: true,
      regenerateWith: "python -m ai_router.close_preflight ... --write",
      generatedAt: "2026-08-11T13:42:00-04:00",
      sessionSetDir: "live-set",
      inputs: {},
      volatileInputs: { git: "deadbeef" },
      report: {
        session_set_dir: "docs/session-sets/live-set",
        session_number: 1,
        verdict: "would-refuse",
        would_close: false,
        obligations: [
          {
            check: "working_tree_clean",
            met: false,
            blocking: true,
            detail: "uncommitted changes",
            action: "commit them",
            cost_warning: "",
            volatile: true,
          },
        ],
      },
      ...over,
    });
  }

  /** Digest the set dir exactly as the writer would, then land the file. */
  function landProjection(setDir: string, over: Record<string, unknown> = {}) {
    const crypto = require("crypto") as typeof import("crypto");
    const inputs: Record<string, string> = {};
    for (const entry of fs.readdirSync(setDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      inputs[entry.name] = crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(setDir, entry.name)))
        .digest("hex");
    }
    const dir = path.join(setDir, ".dabbler");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "close-obligations.json"),
      projection({ inputs, ...over }),
    );
  }

  test("a fresh projection is read, with its rows and its verdict", () => {
    const { root, setDir } = stage({ activity: LOG });
    landProjection(setDir);
    const [set] = readSessionSets(root);
    assert.ok(set.closeObligations);
    assert.strictEqual(set.closeObligations.state, "fresh");
    assert.strictEqual(set.closeObligations.sessionNumber, 1);
    assert.strictEqual(set.closeObligations.verdict, "would-refuse");
    assert.strictEqual(set.closeObligations.obligations.length, 1);
    assert.strictEqual(set.closeObligations.obligations[0].volatile, true);
    fs.rmSync(root, { recursive: true });
  });

  test("ANY change to the set directory makes it stale", () => {
    // The digest map is the whole directory, so an artifact nobody named
    // — here a verification envelope — still counts. Every obligation
    // this projection reports is derived from files like it.
    const { root, setDir } = stage({ activity: LOG });
    landProjection(setDir);
    fs.writeFileSync(path.join(setDir, "s1-issues.json"), "[]");
    const [set] = readSessionSets(root);
    assert.strictEqual(set.closeObligations?.state, "stale");
    // Stale still carries its rows: the operator is told the answer is
    // old, not left with nothing.
    assert.strictEqual(set.closeObligations?.obligations.length, 1);
    fs.rmSync(root, { recursive: true });
  });

  test("an edited input makes it stale even when the file count is identical", () => {
    const { root, setDir } = stage({ activity: LOG });
    landProjection(setDir);
    fs.writeFileSync(path.join(setDir, "session-state.json"), STATE + "\n");
    const [set] = readSessionSets(root);
    assert.strictEqual(set.closeObligations?.state, "stale");
    fs.rmSync(root, { recursive: true });
  });

  test("absent and unreadable are different answers", () => {
    // "Nobody computed this" and "the record is damaged" are opposite
    // facts, and collapsing either into an empty row is how a close-out
    // list ends up implying nothing remains.
    const { root, setDir } = stage({ activity: LOG });
    assert.strictEqual(readSessionSets(root)[0].closeObligations?.state, "absent");

    const dir = path.join(setDir, ".dabbler");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "close-obligations.json"), "{not json");
    assert.strictEqual(
      readSessionSets(root)[0].closeObligations?.state,
      "unreadable",
    );
    fs.rmSync(root, { recursive: true });
  });

  test("a projection from a newer schema is unreadable, never guessed at", () => {
    const { root, setDir } = stage({ activity: LOG });
    landProjection(setDir, { schemaVersion: 99 });
    const set = readSessionSets(root)[0];
    assert.strictEqual(set.closeObligations?.state, "unreadable");
    assert.deepStrictEqual(set.closeObligations?.obligations, []);
    fs.rmSync(root, { recursive: true });
  });

  test("a row missing its fields makes the whole projection unreadable", () => {
    // Found by an end-of-set path-aware critic. The first cut filtered
    // malformed rows out and rendered the rest, which turns a damaged
    // record into a shorter CONFIDENT one — and when every row is
    // malformed, into "nothing outstanding" with a tick. Damage is
    // damage: the operator is told to regenerate.
    const { root, setDir } = stage({ activity: LOG });
    landProjection(setDir, {
      report: {
        session_number: 1,
        verdict: "would-refuse",
        obligations: [{ check: "mystery_check" }, { notACheck: true }],
      },
    });
    const read = readSessionSets(root)[0].closeObligations;
    assert.strictEqual(read?.state, "unreadable");
    assert.deepStrictEqual(read?.obligations, []);
    fs.rmSync(root, { recursive: true });
  });

  test("a parseable row with fields missing degrades towards the safe claim", () => {
    // The rows that ARE parseable still degrade rather than assume:
    // unknown blocking-ness reads as blocking and unknown volatility as
    // volatile, because both answer a missing field with the claim that
    // costs the operator least if it is wrong.
    const { root, setDir } = stage({ activity: LOG });
    landProjection(setDir, {
      report: {
        session_number: 1,
        verdict: "would-refuse",
        obligations: [{ check: "mystery_check" }],
      },
    });
    const rows = readSessionSets(root)[0].closeObligations?.obligations ?? [];
    assert.strictEqual(rows.length, 1);
    assert.deepStrictEqual(
      { met: rows[0].met, blocking: rows[0].blocking, volatile: rows[0].volatile },
      { met: false, blocking: true, volatile: true },
    );
    fs.rmSync(root, { recursive: true });
  });

  test("a report with no obligations ARRAY is unreadable, not an empty list", () => {
    const { root, setDir } = stage({ activity: LOG });
    landProjection(setDir, {
      report: { session_number: 1, verdict: "would-close" },
    });
    assert.strictEqual(
      readSessionSets(root)[0].closeObligations?.state,
      "unreadable",
    );
    fs.rmSync(root, { recursive: true });
  });

  test("a read failure that is not ENOENT is unreadable, not absent", () => {
    // "Nobody computed this" and "this machine cannot read it" are
    // different things to tell an operator and different things to fix.
    // A directory standing where the file belongs is the portable way to
    // make the read fail with something other than ENOENT.
    const { root, setDir } = stage({ activity: LOG });
    fs.mkdirSync(path.join(setDir, ".dabbler", "close-obligations.json"), {
      recursive: true,
    });
    assert.strictEqual(
      readSessionSets(root)[0].closeObligations?.state,
      "unreadable",
    );
    fs.rmSync(root, { recursive: true });
  });

  test("a symlinked artifact is digested, exactly as the Python writer does", function () {
    // Found by both end-of-set path-aware critics. Python's
    // `os.path.isfile` FOLLOWS a symlink to a regular file; Node's
    // `Dirent.isFile()` reports false for it. With the first cut's
    // dirent check, one symlinked artifact in a session set meant the
    // writer digested a file the reader never saw, the key sets could
    // never match, and the panel read `stale` forever with nothing the
    // operator could do about it.
    const { root, setDir } = stage({ activity: LOG });
    const target = path.join(root, "linked-artifact.json");
    fs.writeFileSync(target, '{"real": true}');
    try {
      fs.symlinkSync(target, path.join(setDir, "s1-linked.json"), "file");
    } catch {
      // Unprivileged Windows cannot create symlinks; the assertion is
      // about parity, and there is nothing to compare when the OS
      // refuses to make one.
      fs.rmSync(root, { recursive: true });
      this.skip();
      return;
    }
    landProjection(setDir);
    assert.strictEqual(readSessionSets(root)[0].closeObligations?.state, "fresh");
    // And it is genuinely IN the digest, not merely skipped by both
    // sides — otherwise this would pass vacuously (L-112-1).
    fs.writeFileSync(target, '{"real": false}');
    assert.strictEqual(readSessionSets(root)[0].closeObligations?.state, "stale");
    fs.rmSync(root, { recursive: true });
  });

  test("the digest walker resolves through statSync, not dirent types", () => {
    // The structural half of the symlink guard (L-112-1). The runtime
    // test above needs the OS to create a symlink — unprivileged Windows
    // refuses, and Layer 2 as a whole is skipped in CI, so on many
    // machines it never executes. This one always does, and it pins the
    // exact regression: `readdirSync(dir, { withFileTypes: true })` plus
    // `entry.isFile()` reports FALSE for a symlink to a regular file,
    // while the Python writer's `os.path.isfile` follows it. The two
    // digest maps would then never match and the panel would read stale
    // forever.
    const source = fs.readFileSync(
      path.join(__dirname, "..", "..", "utils", "fileSystem.ts"),
      "utf8",
    );
    const walker = source.slice(
      source.indexOf("function digestSetDirectory"),
      source.indexOf("function projectionIsFresh"),
    );
    assert.ok(walker.length > 0, "digestSetDirectory moved; update this guard");
    assert.ok(
      walker.includes("statSync"),
      "the digest walker must stat (and so follow symlinks) to match the writer",
    );
    assert.ok(
      !walker.includes("withFileTypes"),
      "dirent types do not follow symlinks; Python's os.path.isfile does",
    );
  });

  test("a set that is not in flight gets no projection read at all", () => {
    // The read costs a file plus a digest pass over the directory. Every
    // set that cannot close pays nothing, which is the same rule the
    // step ledger follows.
    const closed = JSON.stringify({
      schemaVersion: 4,
      sessionSetName: "live-set",
      status: "complete",
      sessions: [
        { number: 1, title: "Session 1", status: "complete", startedAt: "2026-08-10T00:00:00-04:00", completedAt: "2026-08-10T05:00:00-04:00", orchestrator: null, verificationVerdict: "VERIFIED" },
        { number: 2, title: "Session 2", status: "complete", startedAt: "2026-08-10T06:00:00-04:00", completedAt: "2026-08-10T09:00:00-04:00", orchestrator: null, verificationVerdict: "VERIFIED" },
      ],
    });
    const { root, setDir } = stage({ activity: LOG, state: closed });
    landProjection(setDir);
    assert.strictEqual(readSessionSets(root)[0].closeObligations ?? null, null);
    fs.rmSync(root, { recursive: true });
  });
});
