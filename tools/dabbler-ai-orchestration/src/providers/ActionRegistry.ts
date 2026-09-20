// Typed action registry for the Work Explorer's row context menus. Each
// entry mints a `contextValue` token (see actionToken in the tree
// model); package.json's `when` clauses match those tokens, and the
// registry check in the test suite keeps the two in lockstep.
//
// Two lists, because the two row kinds answer to different questions. A
// repository owns the files and the lifecycle launchers; a session owns
// what can be done to that session. Widening one `when` to cover both
// would make every entry's signature lie about what it reads.

import {
  loopAlive,
  type ProgressProjectionSession as SessionRecord,
} from "dabbler-ai-router";
import type { SessionsRepository } from "../utils/fileSystem";

export interface RepositoryAction {
  id: string;
  label: string;
  group: number;
  when: (repository: SessionsRepository) => boolean;
}

/** A repository with work left to start. */
const hasNextSession = (r: SessionsRepository): boolean =>
  r.sessions.some(
    (s) =>
      s.status === "in-progress" ||
      s.status === "not-started" ||
      // A session the plan declares and the ledger has not reached is still
      // work left to start — it is exactly what `session start` registers
      // next. Omitting it would hide the launcher on the repository that
      // most needs it: one whose planning session just added the sessions.
      s.status === "planned",
  );

const START_SESSION = "dabblerSessionSets.startSession";
const CONSULT_WITH_AI = "dabbler.consultWithAi";

// Ordered list; `group` bands: 1xx Open File submenu, 3xx Copy Prompt
// submenu, 9xx lifecycle.
export const REPOSITORY_ACTIONS: RepositoryAction[] = [
  { id: "dabblerSessionSets.openSpec", label: "Session Plan", group: 101, when: () => true },
  { id: "dabblerSessionSets.openActivityLog", label: "Activity Log", group: 102, when: () => true },
  { id: "dabblerSessionSets.openChangeLog", label: "Change Log", group: 103, when: () => true },
  { id: "dabblerSessionSets.openSessionState", label: "Sessions Ledger", group: 104, when: () => true },
  { id: START_SESSION, label: "Start Session", group: 905, when: hasNextSession },
  { id: "dabblerSessionSets.closeSession", label: "Close Session", group: 906,
    when: (r) => r.currentSession !== null },
  // Whatever state the work is in: a consult drives nothing.
  { id: CONSULT_WITH_AI, label: "Consult with AI", group: 908, when: () => true },
];

export function applicableRepositoryActions(
  repository: SessionsRepository,
): RepositoryAction[] {
  return REPOSITORY_ACTIONS.filter((a) => a.when(repository)).sort(
    (a, b) => a.group - b.group,
  );
}

// Band: 6xx prompts and the plan, 9xx lifecycle. Cancellation is a
// decision about one session, so it lives here rather than on the
// repository.
//
// The two 60x entries after the run prompt are the planning-time reading
// of a session that stopped at the cap: send it back, respecify it. The
// third of that trio is cancel, which already exists. There is NO
// approve-over entry and none may be added: the framework has no approval
// anywhere, and a menu item that accepted work over a standing finding
// would be the retired waiver wearing a click.
export interface SessionAction {
  id: string;
  label: string;
  group: number;
  when: (repository: SessionsRepository, session: SessionRecord) => boolean;
}

// On the row for the session that would actually be registered, and only
// while nothing is in flight. Both halves matter and neither is decided
// here: `session start` registers the NEXT session and takes no number, so
// an entry on any other planned row would start a different session than
// the one it was clicked on -- and `nextSession` is the router's own answer
// to which that is, carried through the projection rather than recomputed
// beside it.
const isTheNextRow = (repository: SessionsRepository, session: SessionRecord): boolean =>
  repository.currentSession === null &&
  repository.nextSession !== null &&
  session.number === repository.nextSession;

export const SESSION_ACTIONS: SessionAction[] = [
  {
    id: START_SESSION,
    label: "Start Session",
    group: 900,
    when: isTheNextRow,
  },
  {
    id: "dabblerSessionSets.resumeSession",
    label: "Resume Session",
    group: 903,
    // The AI's terminal back, for the session in flight in this workspace:
    // the proof of 2026-09-08 lost the engine's editor tab and had no way
    // to bring it back. Only on the in-flight row, because `session run`
    // drives the session the record says is in flight and no other.
    //
    // And not while the standing stop is the ENGINE's to clear AND a loop
    // is beating: a live loop hands that stop back to the engine, and a
    // click would make a second driver on it. A stop ends the mailbox loop
    // and its heartbeat, though, and with no loop nothing drives -- so there
    // the action is offered, and it restarts the loop.
    when: (repository, session) =>
      repository.currentSession === session.number &&
      session.status === "in-progress" &&
      (session.stopActor !== "engine" || !loopAlive(repository.root, session.number)),
  },
  {
    id: "dabblerSessionSets.stopSession",
    label: "Stop Session",
    group: 905,
    // The person asking for the machine back, on the row of the session
    // actually in flight -- there is one, and `session interrupt` writes
    // its request for whichever loop is driving it. Offered whether or not
    // a loop is beating: a request written with none is read by the next
    // one, and a person who cannot find the stop button reaches for the
    // one thing that always works, which is killing something.
    when: (repository, session) =>
      repository.currentSession === session.number && session.status === "in-progress",
  },
  { id: CONSULT_WITH_AI, label: "Consult with AI", group: 904, when: () => true },
  {
    id: "dabblerSessionSets.cancel",
    label: "Cancel Session",
    group: 901,
    // A cancelled session restores; anything else can be cancelled,
    // including a complete one — the reason is recorded either way.
    when: (_repository, session) => session.status !== "cancelled",
  },
  {
    id: "dabblerSessionSets.restore",
    label: "Restore Session",
    group: 902,
    when: (_repository, session) => session.status === "cancelled",
  },
];

export function applicableSessionActions(
  repository: SessionsRepository,
  session: SessionRecord,
): SessionAction[] {
  return SESSION_ACTIONS.filter((a) => a.when(repository, session)).sort(
    (a, b) => a.group - b.group,
  );
}
