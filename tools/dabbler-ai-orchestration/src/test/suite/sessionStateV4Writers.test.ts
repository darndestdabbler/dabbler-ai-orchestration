import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  inferStateInMemory,
  readStatus,
  synthesizeNotStartedState,
} from "../../utils/sessionState";

// Set 047 Session 5 — TS writer-flip phase part 2.
//
// The writer surfaces flipped that session must emit canonical v4 on-disk
// shape per spec §3.1: schemaVersion=4, sessions[] carries per-session
// metadata, derived top-level keys are dropped. The plan-less carve-out
// (no spec totalSessions, no headings) preserves absent-sessions[].
//
// Set 115 S1: `ensureSessionStateFile` is gone — the read path no longer
// writes. Its shape assertions live on against `inferStateInMemory`, which
// returns exactly what it used to write.
//
// Set 122 S2: the `cancelSessionSet` / `restoreSessionSet` suites are gone
// with the TypeScript writers themselves. Those invariants did not lapse —
// they are pinned in `ai_router/tests/test_session_state_v4_writers.py`
// against the one remaining implementation. This file existed partly to
// police shape drift between two writers of the same file, and there is
// now only one.

const V4_TOP_LEVEL_DROPPED_KEYS = [
  "lifecycleState",
  "currentSession",
  "totalSessions",
  "completedSessions",
  "startedAt",
  "completedAt",
  "orchestrator",
  "verificationVerdict",
];

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-ssv4-test-"));
}

function writeSpec(
  dir: string,
  body: string,
): void {
  fs.writeFileSync(path.join(dir, "spec.md"), body, "utf8");
}

function specWithTotal(total: number, name = "Test Set"): string {
  return [
    `# ${name}`,
    "",
    "## Session Set Configuration",
    "",
    "```yaml",
    `totalSessions: ${total}`,
    "requiresUAT: false",
    "requiresE2E: false",
    "```",
    "",
  ].join("\n");
}

function readState(dir: string): Record<string, unknown> {
  return JSON.parse(
    fs.readFileSync(path.join(dir, "session-state.json"), "utf8"),
  );
}

function writeRawState(dir: string, state: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(dir, "session-state.json"),
    JSON.stringify(state, null, 2) + "\n",
    "utf8",
  );
}

suite("Set 047 / S5 — synthesizeNotStartedState emits v4", () => {
  test("schemaVersion=4 and dropped top-level keys absent", () => {
    const dir = makeTmpDir();
    try {
      writeSpec(dir, specWithTotal(3));
      synthesizeNotStartedState(dir);
      const state = readState(dir);
      assert.strictEqual(state.schemaVersion, 4);
      assert.strictEqual(state.status, "not-started");
      for (const key of V4_TOP_LEVEL_DROPPED_KEYS) {
        assert.ok(
          !(key in state),
          `top-level key "${key}" should be dropped under v4`,
        );
      }
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("sessions[] carries per-session metadata defaulted to null", () => {
    const dir = makeTmpDir();
    try {
      writeSpec(dir, specWithTotal(2));
      synthesizeNotStartedState(dir);
      const state = readState(dir);
      const sessions = state.sessions as Array<Record<string, unknown>>;
      assert.strictEqual(sessions.length, 2);
      for (const entry of sessions) {
        assert.strictEqual(entry.status, "not-started");
        assert.strictEqual(entry.startedAt, null);
        assert.strictEqual(entry.completedAt, null);
        assert.strictEqual(entry.orchestrator, null);
        assert.strictEqual(entry.verificationVerdict, null);
      }
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("plan-less spec produces no sessions[] (preserved across v4)", () => {
    const dir = makeTmpDir();
    try {
      // Spec without Session Set Configuration block and without any
      // ### Session N headings.
      writeSpec(dir, "# Stub spec\n\nTo be authored.\n");
      synthesizeNotStartedState(dir);
      const state = readState(dir);
      assert.strictEqual(state.schemaVersion, 4);
      assert.ok(!("sessions" in state));
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("idempotent — does not rewrite an existing state file", () => {
    const dir = makeTmpDir();
    try {
      writeSpec(dir, specWithTotal(1));
      // Plant an existing v3 file; the synth should not touch it.
      writeRawState(dir, {
        schemaVersion: 3,
        sessionSetName: "preserved",
        status: "in-progress",
        sessions: [{ number: 1, title: "S1", status: "in-progress" }],
      });
      synthesizeNotStartedState(dir);
      const state = readState(dir);
      assert.strictEqual(state.schemaVersion, 3, "existing file untouched");
      assert.strictEqual(state.sessionSetName, "preserved");
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("headings fallback materializes sessions[] without Session Set Configuration", () => {
    // Mirrors the S4 verifier Critical-2 fix on the Python side: a
    // spec with ### Session N headings but no totalSessions field is
    // still a known plan; the writer must materialize sessions[] from
    // the heading count.
    const dir = makeTmpDir();
    try {
      writeSpec(
        dir,
        [
          "# Set with headings only",
          "",
          "### Session 1: First",
          "Body...",
          "",
          "### Session 2: Second",
          "Body...",
          "",
        ].join("\n"),
      );
      synthesizeNotStartedState(dir);
      const state = readState(dir);
      const sessions = state.sessions as Array<Record<string, unknown>>;
      assert.ok(Array.isArray(sessions));
      assert.strictEqual(sessions.length, 2);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});

suite("Set 047 / S5 — the file-absent inference emits v4", () => {
  // Set 115 S1: the lazy-synth path no longer WRITES — `readStatus`
  // derives the same shape in memory via `inferStateInMemory`, and
  // creating the file belongs to the router's sanctioned writers. The
  // shape assertions below are unchanged; the file-write assertion is
  // replaced by its opposite (see "writes nothing" at the end).
  test("change-log branch → status=complete with all sessions complete", () => {
    const dir = makeTmpDir();
    try {
      writeSpec(dir, specWithTotal(2));
      fs.writeFileSync(path.join(dir, "change-log.md"), "# Set close-out\n");
      const state = inferStateInMemory(dir);
      assert.strictEqual(state.schemaVersion, 4);
      assert.strictEqual(state.status, "complete");
      const sessions = state.sessions as Array<Record<string, unknown>>;
      assert.strictEqual(sessions.length, 2);
      for (const entry of sessions) {
        assert.strictEqual(entry.status, "complete");
        // Per-session completedAt left null per Python parity — the
        // change-log mtime is a set-level heuristic, not a per-session
        // boundary.
        assert.strictEqual(entry.completedAt, null);
      }
      for (const key of V4_TOP_LEVEL_DROPPED_KEYS) {
        assert.ok(!(key in state), `dropped key ${key} must be absent`);
      }
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("activity-log branch → status=in-progress with per-session startedAt promoted to session 1", () => {
    const dir = makeTmpDir();
    try {
      writeSpec(dir, specWithTotal(3));
      const iso = "2026-05-26T08:00:00-04:00";
      fs.writeFileSync(
        path.join(dir, "activity-log.json"),
        JSON.stringify(
          {
            sessionSetName: "x",
            createdDate: "2026-05-26",
            totalSessions: 3,
            entries: [
              { sessionNumber: 1, dateTime: iso, description: "started", status: "complete" },
            ],
          },
          null,
          2,
        ),
        "utf8",
      );
      const state = inferStateInMemory(dir);
      assert.strictEqual(state.schemaVersion, 4);
      assert.strictEqual(state.status, "in-progress");
      const sessions = state.sessions as Array<Record<string, unknown>>;
      assert.strictEqual(sessions[0].status, "in-progress");
      assert.strictEqual(sessions[0].startedAt, iso);
      assert.strictEqual(sessions[1].status, "not-started");
      assert.strictEqual(sessions[1].startedAt, null);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("change-log without spec plan → falls back to not-started shape", () => {
    // Rule-1 guard: cannot emit a reader-valid `complete` snapshot
    // without sessions[]; preserves operator intent via file presence
    // and waits for the next boundary write with a plan to promote.
    const dir = makeTmpDir();
    try {
      writeSpec(dir, "# Stub\n\nTo be authored.\n");
      fs.writeFileSync(path.join(dir, "change-log.md"), "# Set close-out\n");
      const state = inferStateInMemory(dir);
      assert.strictEqual(state.status, "not-started");
      assert.ok(!("sessions" in state));
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("no markdown markers → not-started shape", () => {
    const dir = makeTmpDir();
    try {
      writeSpec(dir, specWithTotal(1));
      const state = inferStateInMemory(dir);
      assert.strictEqual(state.status, "not-started");
      const sessions = state.sessions as Array<Record<string, unknown>>;
      assert.strictEqual(sessions.length, 1);
      assert.strictEqual(sessions[0].status, "not-started");
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("Set 115 S1: inference writes nothing — the read path is not a writer", () => {
    // The whole ownership decision in one assertion. The extension used
    // to create `session-state.json` from `readStatus`, which raced the
    // router's writer and put a generic `Session N` ledger on disk first.
    const dir = makeTmpDir();
    try {
      writeSpec(dir, specWithTotal(2));
      fs.writeFileSync(path.join(dir, "change-log.md"), "# Set close-out\n");
      inferStateInMemory(dir);
      readStatus(dir);
      assert.ok(
        !fs.existsSync(path.join(dir, "session-state.json")),
        "no state file may be created by a read",
      );
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("Set 115 S1: readStatus still infers status from file presence", () => {
    const dir = makeTmpDir();
    try {
      writeSpec(dir, specWithTotal(2));
      fs.writeFileSync(path.join(dir, "change-log.md"), "# Set close-out\n");
      assert.strictEqual(readStatus(dir), "complete");
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});

suite("Set 115 S1 — session titles come from spec.md, not `Session N`", () => {
  test("synthesized sessions[] carries the spec's heading titles", () => {
    const dir = makeTmpDir();
    try {
      writeSpec(
        dir,
        [
          "# Titled set",
          "",
          "### Session 1 of 2: The titles both writers already know",
          "Body...",
          "",
          "### Session 2 of 2: Left-click a session, land on its plan",
          "Body...",
          "",
        ].join("\n"),
      );
      synthesizeNotStartedState(dir);
      const state = readState(dir);
      const sessions = state.sessions as Array<Record<string, unknown>>;
      assert.deepStrictEqual(
        sessions.map((s) => s.title),
        [
          "The titles both writers already know",
          "Left-click a session, land on its plan",
        ],
      );
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("a spec with no headings still falls back to `Session N`", () => {
    const dir = makeTmpDir();
    try {
      writeSpec(dir, specWithTotal(2));
      const state = inferStateInMemory(dir);
      const sessions = state.sessions as Array<Record<string, unknown>>;
      assert.deepStrictEqual(
        sessions.map((s) => s.title),
        ["Session 1", "Session 2"],
      );
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});