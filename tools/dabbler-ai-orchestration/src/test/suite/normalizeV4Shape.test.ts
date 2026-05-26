// Set 047 Session 2 — TS mirror of ai_router/tests/test_normalize_v4_shape.py.
//
// Covers v3 input → v4, v4 input → v4 (per-session metadata wins),
// v2 input → v4 (via synthesizeV3FromV2 first), error/edge handling,
// and the routing-through-shim guarantee in readProgress. Test
// groupings mirror the Python tests so a future reader can compare
// them side-by-side and spot drift quickly.

import * as assert from "assert";
import {
  SCHEMA_VERSION_V3,
  SCHEMA_VERSION_V4,
  SESSION_STATUS_COMPLETE,
  SESSION_STATUS_IN_PROGRESS,
  SESSION_STATUS_NOT_STARTED,
  SessionStateInvariantError,
  normalizeToV4Shape,
  readProgress,
} from "../../utils/progress";

const ORCH = {
  engine: "claude",
  provider: "anthropic",
  model: "claude-opus-4-7",
  effort: "high",
  chatSessionId: "abc-123",
};

function v3State(sessions: any[], overrides: Record<string, any> = {}): any {
  return {
    schemaVersion: SCHEMA_VERSION_V3,
    sessionSetName: "047-test-set",
    status: "in-progress",
    lifecycleState: "work_in_progress",
    sessions,
    ...overrides,
  };
}

function v4State(sessions: any[], overrides: Record<string, any> = {}): any {
  return {
    schemaVersion: SCHEMA_VERSION_V4,
    sessionSetName: "047-test-set",
    status: "in-progress",
    sessions,
    ...overrides,
  };
}

function sess(number: number, status: string, extra: Record<string, any> = {}): any {
  return {
    number,
    title: `Session ${number}`,
    status,
    ...extra,
  };
}

const MISSING_PATH = "/tmp/this-file-does-not-exist-spec.md";

// ---------------------------------------------------------------------------
// v3 input → v4 normalize
// ---------------------------------------------------------------------------

suite("normalizeToV4Shape — v3 input", () => {
  test("v3 input gets schemaVersion 4", () => {
    const out = normalizeToV4Shape(
      v3State([sess(1, SESSION_STATUS_NOT_STARTED)], { status: "not-started" }),
      MISSING_PATH,
    );
    assert.strictEqual(out.schemaVersion, SCHEMA_VERSION_V4);
  });

  test("v3 input preserves sessionSetName", () => {
    const out = normalizeToV4Shape(
      v3State([sess(1, SESSION_STATUS_NOT_STARTED)], { status: "not-started" }),
      MISSING_PATH,
    );
    assert.strictEqual(out.sessionSetName, "047-test-set");
  });

  test("v3 sessions get v4 default metadata", () => {
    const out = normalizeToV4Shape(
      v3State([sess(1, SESSION_STATUS_NOT_STARTED)], { status: "not-started" }),
      MISSING_PATH,
    );
    const s = out.sessions[0];
    for (const k of ["startedAt", "completedAt", "orchestrator", "verificationVerdict"]) {
      assert.strictEqual(s[k], null, `${k} should default to null on v3 input`);
    }
  });

  test("v3 promotes top orchestrator to in-progress session", () => {
    const out = normalizeToV4Shape(
      v3State(
        [
          sess(1, SESSION_STATUS_COMPLETE),
          sess(2, SESSION_STATUS_IN_PROGRESS),
          sess(3, SESSION_STATUS_NOT_STARTED),
        ],
        { orchestrator: ORCH, startedAt: "2026-05-26T10:00:00-04:00" },
      ),
      MISSING_PATH,
    );
    const ip = out.sessions.find((s: any) => s.status === "in-progress");
    assert.deepStrictEqual(ip.orchestrator, ORCH);
    assert.strictEqual(ip.startedAt, "2026-05-26T10:00:00-04:00");
  });

  test("v3 promotes top completedAt to last completed session", () => {
    const out = normalizeToV4Shape(
      v3State(
        [
          sess(1, SESSION_STATUS_COMPLETE),
          sess(2, SESSION_STATUS_COMPLETE),
          sess(3, SESSION_STATUS_IN_PROGRESS),
        ],
        {
          completedAt: "2026-05-26T12:00:00-04:00",
          verificationVerdict: "VERIFIED",
        },
      ),
      MISSING_PATH,
    );
    const lastComplete = out.sessions.filter((s: any) => s.status === "complete").pop();
    assert.strictEqual(lastComplete.number, 2);
    assert.strictEqual(lastComplete.completedAt, "2026-05-26T12:00:00-04:00");
    assert.strictEqual(lastComplete.verificationVerdict, "VERIFIED");
  });

  test("v3 between-sessions orchestrator goes to last completed", () => {
    const out = normalizeToV4Shape(
      v3State(
        [sess(1, SESSION_STATUS_COMPLETE), sess(2, SESSION_STATUS_NOT_STARTED)],
        { status: "in-progress", orchestrator: ORCH },
      ),
      MISSING_PATH,
    );
    assert.deepStrictEqual(out.sessions[0].orchestrator, ORCH);
  });

  test("v3 top-level status canonicalized", () => {
    const out = normalizeToV4Shape(
      v3State([sess(1, SESSION_STATUS_COMPLETE)], { status: "completed" }),
      MISSING_PATH,
    );
    assert.strictEqual(out.status, "complete");
  });

  test("v3 derives totalSessions / completedSessions / currentSession from sessions[]", () => {
    const out = normalizeToV4Shape(
      v3State([
        sess(1, SESSION_STATUS_COMPLETE),
        sess(2, SESSION_STATUS_COMPLETE),
        sess(3, SESSION_STATUS_NOT_STARTED),
      ]),
      MISSING_PATH,
    );
    assert.strictEqual(out.totalSessions, 3);
    assert.deepStrictEqual(out.completedSessions, [1, 2]);
    assert.strictEqual(out.currentSession, null);
  });

  test("v3 preserves preCancelStatus passthrough", () => {
    const out = normalizeToV4Shape(
      v3State([sess(1, SESSION_STATUS_NOT_STARTED)], {
        status: "cancelled",
        preCancelStatus: "in-progress",
      }),
      MISSING_PATH,
    );
    assert.strictEqual(out.status, "cancelled");
    assert.strictEqual(out.preCancelStatus, "in-progress");
  });

  test("v3 preserves forceClosed passthrough", () => {
    const out = normalizeToV4Shape(
      v3State([sess(1, SESSION_STATUS_COMPLETE)], {
        status: "complete",
        forceClosed: true,
      }),
      MISSING_PATH,
    );
    assert.strictEqual(out.forceClosed, true);
  });
});

// ---------------------------------------------------------------------------
// v4 input → v4 normalize
// ---------------------------------------------------------------------------

suite("normalizeToV4Shape — v4 input", () => {
  test("v4 per-session orchestrator wins", () => {
    const out = normalizeToV4Shape(
      v4State([
        sess(1, SESSION_STATUS_IN_PROGRESS, {
          orchestrator: ORCH,
          startedAt: "2026-05-26T10:00:00-04:00",
          completedAt: null,
          verificationVerdict: null,
        }),
      ]),
      MISSING_PATH,
    );
    assert.deepStrictEqual(out.sessions[0].orchestrator, ORCH);
    assert.strictEqual(out.sessions[0].startedAt, "2026-05-26T10:00:00-04:00");
  });

  test("v4 derives top orchestrator from in-progress session", () => {
    const out = normalizeToV4Shape(
      v4State([
        sess(1, SESSION_STATUS_COMPLETE, { completedAt: "2026-05-26T11:00:00-04:00" }),
        sess(2, SESSION_STATUS_IN_PROGRESS, {
          orchestrator: ORCH,
          startedAt: "2026-05-26T12:00:00-04:00",
        }),
      ]),
      MISSING_PATH,
    );
    assert.deepStrictEqual(out.orchestrator, ORCH);
    assert.strictEqual(out.startedAt, "2026-05-26T12:00:00-04:00");
    assert.strictEqual(out.completedAt, "2026-05-26T11:00:00-04:00");
    assert.strictEqual(out.currentSession, 2);
    assert.deepStrictEqual(out.completedSessions, [1]);
  });

  test("v4 derives top verdict from last completed session", () => {
    const out = normalizeToV4Shape(
      v4State(
        [
          sess(1, SESSION_STATUS_COMPLETE, { verificationVerdict: "VERIFIED" }),
          sess(2, SESSION_STATUS_COMPLETE, { verificationVerdict: "ISSUES_FOUND" }),
        ],
        { status: "complete" },
      ),
      MISSING_PATH,
    );
    assert.strictEqual(out.verificationVerdict, "ISSUES_FOUND");
  });

  test("v4 ignores stale top-level orchestrator when per-session is present", () => {
    const out = normalizeToV4Shape(
      v4State(
        [sess(1, SESSION_STATUS_IN_PROGRESS, { orchestrator: { engine: "codex", provider: "openai" } })],
        { orchestrator: ORCH }, // stale top-level — should NOT win
      ),
      MISSING_PATH,
    );
    assert.strictEqual(out.sessions[0].orchestrator.engine, "codex");
    assert.strictEqual(out.orchestrator.engine, "codex");
  });
});

// ---------------------------------------------------------------------------
// v2 input → v4 normalize (via synthesizeV3FromV2)
// ---------------------------------------------------------------------------

suite("normalizeToV4Shape — v2 input", () => {
  test("v2 synthesizes then enriches to v4", () => {
    const v2 = {
      schemaVersion: 2,
      sessionSetName: "047-test-set",
      status: "in-progress",
      lifecycleState: "work_in_progress",
      currentSession: 2,
      totalSessions: 3,
      completedSessions: [1],
      orchestrator: ORCH,
      startedAt: "2026-05-26T10:00:00-04:00",
    };
    const out = normalizeToV4Shape(v2, MISSING_PATH);
    assert.strictEqual(out.schemaVersion, SCHEMA_VERSION_V4);
    assert.strictEqual(out.sessions.length, 3);
    assert.strictEqual(out.sessions[0].status, "complete");
    assert.strictEqual(out.sessions[1].status, "in-progress");
    assert.strictEqual(out.sessions[2].status, "not-started");
    assert.deepStrictEqual(out.sessions[1].orchestrator, ORCH);
    assert.strictEqual(out.sessions[1].startedAt, "2026-05-26T10:00:00-04:00");
  });

  test("v2 with no top metadata normalizes cleanly", () => {
    const v2 = {
      schemaVersion: 2,
      sessionSetName: "047-test-set",
      status: "in-progress",
      currentSession: 1,
      totalSessions: 2,
      completedSessions: [],
    };
    const out = normalizeToV4Shape(v2, MISSING_PATH);
    assert.strictEqual(out.sessions.length, 2);
    assert.strictEqual(out.sessions[0].status, "in-progress");
    for (const s of out.sessions) {
      assert.strictEqual(s.orchestrator, null);
    }
  });
});

// ---------------------------------------------------------------------------
// Error / edge handling
// ---------------------------------------------------------------------------

suite("normalizeToV4Shape — errors and edges", () => {
  test("null input throws TypeError", () => {
    assert.throws(() => normalizeToV4Shape(null, MISSING_PATH), TypeError);
  });

  test("sessions not an array raises invariant error", () => {
    const state = {
      schemaVersion: SCHEMA_VERSION_V3,
      sessionSetName: "047-test-set",
      status: "in-progress",
      sessions: "not-a-list",
    };
    assert.throws(
      () => normalizeToV4Shape(state, MISSING_PATH),
      SessionStateInvariantError,
    );
  });

  test("input is not mutated (pure function)", () => {
    const state = v3State([sess(1, SESSION_STATUS_IN_PROGRESS)], {
      orchestrator: ORCH,
      status: "in-progress",
    });
    const originalSessions = state.sessions;
    const originalSession0 = { ...state.sessions[0] };
    const out = normalizeToV4Shape(state, MISSING_PATH);
    assert.strictEqual(state.sessions, originalSessions);
    assert.deepStrictEqual(state.sessions[0], originalSession0);
    assert.notStrictEqual(out.sessions, state.sessions);
  });
});

// ---------------------------------------------------------------------------
// readProgress routes through the shim
// ---------------------------------------------------------------------------

suite("normalizeToV4Shape — readProgress routing", () => {
  test("v3 file still reads through readProgress", () => {
    const state = v3State([
      sess(1, SESSION_STATUS_COMPLETE),
      sess(2, SESSION_STATUS_IN_PROGRESS),
      sess(3, SESSION_STATUS_NOT_STARTED),
    ]);
    const view = readProgress(state, MISSING_PATH);
    assert.strictEqual(view.totalSessions, 3);
    assert.deepStrictEqual(view.completedSessions, [1]);
    assert.strictEqual(view.currentSession, 2);
  });

  test("v4 file (per-session metadata only) reads through readProgress", () => {
    const state = v4State([
      sess(1, SESSION_STATUS_COMPLETE, { completedAt: "2026-05-26T11:00:00-04:00" }),
      sess(2, SESSION_STATUS_IN_PROGRESS, {
        orchestrator: ORCH,
        startedAt: "2026-05-26T12:00:00-04:00",
      }),
      sess(3, SESSION_STATUS_NOT_STARTED),
    ]);
    const view = readProgress(state, MISSING_PATH);
    assert.strictEqual(view.totalSessions, 3);
    assert.deepStrictEqual(view.completedSessions, [1]);
    assert.strictEqual(view.currentSession, 2);
  });

  test("strict v4 file (only schemaVersion/sessionSetName/sessions/status) reads", () => {
    const state = {
      schemaVersion: SCHEMA_VERSION_V4,
      sessionSetName: "047-test-set",
      status: "in-progress",
      sessions: [
        { number: 1, title: "First", status: "complete" },
        { number: 2, title: "Second", status: "in-progress" },
      ],
    };
    const view = readProgress(state, MISSING_PATH);
    assert.strictEqual(view.totalSessions, 2);
    assert.deepStrictEqual(view.completedSessions, [1]);
    assert.strictEqual(view.currentSession, 2);
    assert.strictEqual(view.isBetweenSessions, false);
  });
});

// ---------------------------------------------------------------------------
// Regression: cross-provider verifier flagged issues 1 and 2 in S2 review
// ---------------------------------------------------------------------------

suite("normalizeToV4Shape — verifier fix 1: per-session status aliases", () => {
  test("v3 session with completed alias lands in derived completedSessions", () => {
    const out = normalizeToV4Shape(
      v3State(
        [
          sess(1, "completed"),
          sess(2, SESSION_STATUS_IN_PROGRESS),
        ],
        { status: "in-progress" },
      ),
      MISSING_PATH,
    );
    assert.strictEqual(out.sessions[0].status, "complete");
    assert.deepStrictEqual(out.completedSessions, [1]);
  });

  test("v3 session with done alias lands in derived completedSessions", () => {
    const out = normalizeToV4Shape(
      v3State(
        [
          sess(1, "done"),
          sess(2, SESSION_STATUS_IN_PROGRESS),
        ],
        { status: "in-progress" },
      ),
      MISSING_PATH,
    );
    assert.strictEqual(out.sessions[0].status, "complete");
    assert.deepStrictEqual(out.completedSessions, [1]);
  });

  test("v4 session with completed alias canonicalizes", () => {
    const out = normalizeToV4Shape(
      v4State(
        [sess(1, "completed", { completedAt: "2026-05-26T11:00:00-04:00" })],
        { status: "complete" },
      ),
      MISSING_PATH,
    );
    assert.strictEqual(out.sessions[0].status, "complete");
    assert.deepStrictEqual(out.completedSessions, [1]);
    assert.strictEqual(out.completedAt, "2026-05-26T11:00:00-04:00");
  });
});

suite("normalizeToV4Shape — verifier fix 2: startedAt promotion/derivation", () => {
  test("v3 between-sessions promotes startedAt to last completed", () => {
    const out = normalizeToV4Shape(
      v3State(
        [
          sess(1, SESSION_STATUS_COMPLETE),
          sess(2, SESSION_STATUS_NOT_STARTED),
        ],
        {
          status: "in-progress",
          startedAt: "2026-05-26T10:00:00-04:00",
          orchestrator: ORCH,
        },
      ),
      MISSING_PATH,
    );
    assert.strictEqual(out.sessions[0].startedAt, "2026-05-26T10:00:00-04:00");
  });

  test("v3 all-complete promotes startedAt to last completed", () => {
    const out = normalizeToV4Shape(
      v3State(
        [sess(1, SESSION_STATUS_COMPLETE), sess(2, SESSION_STATUS_COMPLETE)],
        {
          status: "complete",
          startedAt: "2026-05-26T09:00:00-04:00",
          completedAt: "2026-05-26T15:00:00-04:00",
        },
      ),
      MISSING_PATH,
    );
    assert.strictEqual(out.sessions[1].startedAt, "2026-05-26T09:00:00-04:00");
  });

  test("v4 derives top startedAt from last completed, not first session", () => {
    const out = normalizeToV4Shape(
      v4State(
        [
          sess(1, SESSION_STATUS_COMPLETE, {
            startedAt: "2026-05-26T09:00:00-04:00",
            completedAt: "2026-05-26T10:00:00-04:00",
          }),
          sess(2, SESSION_STATUS_COMPLETE, {
            startedAt: "2026-05-26T11:00:00-04:00",
            completedAt: "2026-05-26T12:00:00-04:00",
          }),
        ],
        { status: "complete" },
      ),
      MISSING_PATH,
    );
    assert.strictEqual(out.startedAt, "2026-05-26T11:00:00-04:00");
    assert.strictEqual(out.completedAt, "2026-05-26T12:00:00-04:00");
  });
});

suite("normalizeToV4Shape — idempotence", () => {
  test("idempotent on v3 input", () => {
    const state = v3State(
      [
        sess(1, SESSION_STATUS_COMPLETE),
        sess(2, SESSION_STATUS_IN_PROGRESS),
        sess(3, SESSION_STATUS_NOT_STARTED),
      ],
      {
        orchestrator: ORCH,
        startedAt: "2026-05-26T10:00:00-04:00",
        completedAt: "2026-05-26T11:00:00-04:00",
        verificationVerdict: "VERIFIED",
      },
    );
    const once = normalizeToV4Shape(state, MISSING_PATH);
    const twice = normalizeToV4Shape(once, MISSING_PATH);
    assert.deepStrictEqual(once, twice);
  });

  test("idempotent on v4 input", () => {
    const state = v4State([
      sess(1, SESSION_STATUS_COMPLETE, {
        startedAt: "2026-05-26T09:00:00-04:00",
        completedAt: "2026-05-26T10:00:00-04:00",
        verificationVerdict: "VERIFIED",
      }),
      sess(2, SESSION_STATUS_IN_PROGRESS, {
        orchestrator: ORCH,
        startedAt: "2026-05-26T11:00:00-04:00",
      }),
    ]);
    const once = normalizeToV4Shape(state, MISSING_PATH);
    const twice = normalizeToV4Shape(once, MISSING_PATH);
    assert.deepStrictEqual(once, twice);
  });

  test("idempotent preserves passthrough fields", () => {
    const state = v3State([sess(1, SESSION_STATUS_NOT_STARTED)], {
      status: "cancelled",
      preCancelStatus: "in-progress",
      forceClosed: false,
    });
    const once = normalizeToV4Shape(state, MISSING_PATH);
    const twice = normalizeToV4Shape(once, MISSING_PATH);
    assert.deepStrictEqual(once, twice);
    assert.strictEqual(twice.preCancelStatus, "in-progress");
    assert.strictEqual(twice.forceClosed, false);
  });
});
