import * as assert from "assert";
// Set 029 Session 3: tests target the extracted data-layer module
// directly. SessionSetsProvider re-exports these for backwards
// compatibility, but the model is the canonical home — the future
// custom webview tree (S4) will consume the same exports.
import {
  isCurrentSessionInFlight,
  progressText,
} from "../../providers/SessionSetsModel";
import { LiveSession, SessionSet } from "../../types";

function fakeLive(over: Partial<LiveSession> = {}): LiveSession {
  return {
    currentSession: null,
    status: null,
    orchestrator: null,
    startedAt: null,
    completedAt: null,
    verificationVerdict: null,
    forceClosed: null,
    completedSessions: null,
    ...over,
  };
}

function fakeSet(over: Partial<SessionSet> = {}): SessionSet {
  return {
    name: "x",
    dir: "/x",
    specPath: "/x/spec.md",
    activityPath: "/x/activity-log.json",
    changeLogPath: "/x/change-log.md",
    statePath: "/x/session-state.json",
    aiAssignmentPath: "/x/ai-assignment.md",
    uatChecklistPath: "/x/x-uat-checklist.json",
    state: "not-started",
    totalSessions: null,
    sessionsCompleted: 0,
    lastTouched: null,
    liveSession: null,
    config: {
      requiresUAT: false,
      requiresE2E: false,
      uatScope: "none",
      tier: "full",
      verificationMode: "out-of-band-or-none",
    },
    uatSummary: null,
    root: "/x",
    needsMigration: false,
    migrationTargetSchemaVersion: null,
    schemaVersionOnDisk: null,
    prerequisites: null,
    blockedByPrereqs: false,
    plusFraction: false,
    ...over,
  };
}

suite("SessionSetsProvider — isCurrentSessionInFlight", () => {
  // Set 030 Session 3: the v3 in-flight predicate is a direct read of
  // the canonical `liveSession.currentSession` field, which fileSystem.ts
  // populates from `readProgress` as the single in-progress session's
  // number (or null when no session is in flight). The v2-era predicate
  // (`currentSession not in completedSessions[]`) is gone — the v3
  // reader resolves the ambiguity at source so the downstream check is
  // a simple null-check.

  test("returns false when liveSession is null", () => {
    assert.strictEqual(isCurrentSessionInFlight(fakeSet({ liveSession: null })), false);
  });

  test("returns false when currentSession is null (between sessions or complete)", () => {
    // The v3 reader sets currentSession=null when no session is
    // in-progress. This is the canonical signal for "between sessions"
    // OR "set complete"; both render without the in-flight annotation.
    assert.strictEqual(
      isCurrentSessionInFlight(fakeSet({
        liveSession: fakeLive({ currentSession: null, completedSessions: [1] }),
      })),
      false,
    );
  });

  test("returns true when currentSession is a number (session in-progress)", () => {
    assert.strictEqual(
      isCurrentSessionInFlight(fakeSet({
        liveSession: fakeLive({ currentSession: 2, completedSessions: [1] }),
      })),
      true,
    );
  });

  test("returns true for session 1 of a fresh set", () => {
    // The endpoint the Set 022 spec called out specifically: "0/4
    // stuck displayed while session 1 is in flight." With v3, the
    // currentSession=1 signal directly drives the annotation — no
    // dependence on the legacy completedSessions[] array.
    assert.strictEqual(
      isCurrentSessionInFlight(fakeSet({
        liveSession: fakeLive({ currentSession: 1, completedSessions: [] }),
      })),
      true,
    );
  });
});

suite("SessionSetsProvider — progressText", () => {
  // Set 022 Session 2: the two new annotations make the lifecycle
  // visible at a glance without operator hover.

  test("renders 'N/total' for an in-progress row between sessions (no annotation)", () => {
    // Just-closed session 1; session 2 not yet started. Under v3,
    // between-sessions state means currentSession=null and
    // completedSessions=[1]. No in-flight annotation.
    const text = progressText(fakeSet({
      state: "in-progress",
      sessionsCompleted: 1,
      totalSessions: 4,
      liveSession: fakeLive({ currentSession: null, completedSessions: [1], status: "in-progress" }),
    }));
    assert.strictEqual(text, "1/4");
  });

  test("appends 'session N in flight' annotation when currentSession not in completedSessions[]", () => {
    const text = progressText(fakeSet({
      state: "in-progress",
      sessionsCompleted: 0,
      totalSessions: 4,
      liveSession: fakeLive({ currentSession: 1, completedSessions: [], status: "in-progress" }),
    }));
    assert.strictEqual(text, "0/4 · session 1 in flight");
  });

  test("appends 'session N in flight' on a mid-set in-flight row", () => {
    // Sessions 1-2 closed, session 3 in flight.
    const text = progressText(fakeSet({
      state: "in-progress",
      sessionsCompleted: 2,
      totalSessions: 4,
      liveSession: fakeLive({ currentSession: 3, completedSessions: [1, 2], status: "in-progress" }),
    }));
    assert.strictEqual(text, "2/4 · session 3 in flight");
  });

  test("appends 'Complete' annotation on a complete row", () => {
    const text = progressText(fakeSet({
      state: "complete",
      sessionsCompleted: 4,
      totalSessions: 4,
      liveSession: fakeLive({
        currentSession: null,
        completedSessions: [1, 2, 3, 4],
        status: "complete",
      }),
    }));
    assert.strictEqual(text, "4/4 Complete");
  });

  test("not-started rows render as '0/N' with no annotation", () => {
    const text = progressText(fakeSet({
      state: "not-started",
      sessionsCompleted: 0,
      totalSessions: 4,
      liveSession: null,
    }));
    assert.strictEqual(text, "0/4");
  });

  test("renders empty string when totalSessions is missing and no progress", () => {
    const text = progressText(fakeSet({
      state: "not-started",
      sessionsCompleted: 0,
      totalSessions: null,
      liveSession: null,
    }));
    assert.strictEqual(text, "");
  });

  test("v2-shape liveSession (currentSession set, completedSessions null) still renders the annotation", () => {
    // Set 030 Session 3: under v3, currentSession is strictly the
    // in-progress session's number, so a non-null value unambiguously
    // means "in flight" regardless of whether completedSessions[] was
    // populated. This replaces the v2-era "no array → no annotation"
    // guard, which existed only because v2's currentSession could
    // also mean "most recently closed."
    const text = progressText(fakeSet({
      state: "in-progress",
      sessionsCompleted: 1,
      totalSessions: 3,
      liveSession: fakeLive({
        currentSession: 2,
        completedSessions: null,
        status: "in-progress",
      }),
    }));
    assert.strictEqual(text, "1/3 · session 2 in flight");
  });
});
