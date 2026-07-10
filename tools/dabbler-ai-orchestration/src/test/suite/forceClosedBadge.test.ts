import * as assert from "assert";
import { forceClosedBadge } from "../../providers/SessionSetsModel";
import { LiveSession, SessionSet } from "../../types";

// Set 9 Session 3 (D-2 hard-scoping of ``--force``): the [FORCED]
// description badge surfaces sets that closed via ``close_session
// --force`` / ``mark_session_complete(force=True)``. It reads the
// ``forceClosed`` flag written by ``_flip_state_to_closed(forced=True)``
// in ``ai_router/session_state.py``. The flag is absent or false on
// every snapshot written by a normal close-out.

function fakeLive(over: Partial<LiveSession> = {}): LiveSession {
  return {
    currentSession: 1,
    status: "complete",
    orchestrator: null,
    startedAt: null,
    completedAt: null,
    verificationVerdict: "VERIFIED",
    forceClosed: null,
    completedSessions: null,
    ...over,
  };
}

function fakeSet(liveSession: LiveSession | null): SessionSet {
  return {
    name: "x",
    module: null,
    moduleTitle: null,
    moduleOrder: null,
    dir: "/x",
    specPath: "/x/spec.md",
    activityPath: "/x/activity-log.json",
    changeLogPath: "/x/change-log.md",
    statePath: "/x/session-state.json",
    aiAssignmentPath: "/x/ai-assignment.md",
    uatChecklistPath: "/x/x-uat-checklist.json",
    state: "complete",
    totalSessions: null,
    sessionsCompleted: 0,
    lastTouched: null,
    liveSession,
    config: {
      requiresUAT: false,
      requiresE2E: false,
      uatScope: "none",
      tier: "full",
      verificationMode: "out-of-band-or-none",
      module: null,
    },
    uatSummary: null,
    root: "/x",
    needsMigration: false,
    migrationTargetSchemaVersion: null,
    schemaVersionOnDisk: null,
    prerequisites: null,
    blockedByPrereqs: false,
    unsatisfiedPrereqs: [],
    plusFraction: false,
    externalVerificationNoteExists: false,
    completedVerification: null,
    verificationMarker: "",
    workspaceTierMarker: null,
  };
}

suite("SessionSetsProvider — forceClosedBadge", () => {
  test("renders [FORCED] when forceClosed is true", () => {
    assert.strictEqual(
      forceClosedBadge(fakeSet(fakeLive({ forceClosed: true }))),
      "[FORCED]",
    );
  });

  test("renders nothing when forceClosed is false", () => {
    assert.strictEqual(
      forceClosedBadge(fakeSet(fakeLive({ forceClosed: false }))),
      "",
    );
  });

  test("renders nothing when forceClosed is null (legacy snapshot)", () => {
    // Sets closed before Set 9 Session 3 don't carry the field at all;
    // fileSystem.ts maps the missing field to null. The badge must
    // remain hidden so retroactively triaging a legacy set does not
    // light up the explorer with false [FORCED] markers.
    assert.strictEqual(
      forceClosedBadge(fakeSet(fakeLive({ forceClosed: null }))),
      "",
    );
  });

  test("renders nothing when liveSession itself is null", () => {
    // not-started / cancelled sets have liveSession=null. The badge
    // is meaningful only on closed sets, so the null guard short-
    // circuits cleanly to the empty string rather than reading
    // through null.
    assert.strictEqual(forceClosedBadge(fakeSet(null)), "");
  });
});
