// Typed action registry for the Work Explorer's row context menus. Each
// entry mints a `contextValue` token (see actionToken in the tree
// model); package.json's `when` clauses match those tokens, and the
// registry check in the test suite keeps the two in lockstep.
//
// Two lists, because the two row kinds answer to different questions. A
// repository owns the files and the lifecycle launchers; a session owns
// what can be done to that session. Widening one `when` to cover both
// would make every entry's signature lie about what it reads.

import type {
  ProgressProjectionSession as SessionRecord,
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

/**
 * Whether the next session may start in THIS folder. In the repository
 * itself, always. In a module's focused folder, only when the next session
 * is focused on that module: a global session runs in the repository, and a
 * focused one runs in its own module's folder -- `session start` refuses
 * either anywhere else, by name, and the launcher is withheld rather than
 * offered for a refusal.
 */
export const startableHere = (r: SessionsRepository): boolean => {
  if (r.checkoutModule === null) return true;
  const next = r.sessions.find((s) => s.number === r.nextSession);
  return next?.kind === "focused" && next.module === r.checkoutModule;
};

const canStart = (r: SessionsRepository): boolean => hasNextSession(r) && startableHere(r);

// Ordered list; `group` bands: 1xx Open File submenu, 3xx Copy Prompt
// submenu, 9xx lifecycle.
export const REPOSITORY_ACTIONS: RepositoryAction[] = [
  { id: "dabblerSessionSets.openSpec", label: "Session Plan", group: 101, when: () => true },
  { id: "dabblerSessionSets.openActivityLog", label: "Activity Log", group: 102, when: () => true },
  { id: "dabblerSessionSets.openChangeLog", label: "Change Log", group: 103, when: () => true },
  { id: "dabblerSessionSets.openSessionState", label: "Sessions Ledger", group: 104, when: () => true },
  { id: "dabblerSessionSets.startSession", label: "Start Session", group: 905, when: canStart },
  // The unattended half sits beside Start rather than replacing it: one
  // opens the person's own CLI, the other runs the session with nobody
  // watching, and which of those you want is not something a flag on one
  // launcher can ask.
  {
    id: "dabbler.startUnattendedSession",
    label: "Start Unattended Session",
    group: 907,
    when: canStart,
  },
  { id: "dabblerSessionSets.closeSession", label: "Close Session", group: 906,
    when: (r) => r.currentSession !== null },
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

export const SESSION_ACTIONS: SessionAction[] = [
  {
    id: "dabblerSessionSets.startSession",
    label: "Start Session",
    group: 900,
    // On the row for the session that would actually be registered, and
    // only while nothing is in flight. Both halves matter and neither is
    // decided here: `session start` registers the NEXT session and takes no
    // number, so an entry on any other planned row would start a different
    // session than the one it was clicked on -- and `nextSession` is the
    // router's own answer to which that is, carried through the projection
    // rather than recomputed beside it.
    when: (repository, session) =>
      repository.currentSession === null &&
      repository.nextSession !== null &&
      session.number === repository.nextSession &&
      startableHere(repository),
  },
  {
    id: "dabblerSessionSets.resumeSession",
    label: "Resume Session",
    group: 903,
    // The AI's terminal back, for the session in flight in this workspace:
    // the proof of 2026-09-08 lost the engine's editor tab and had no way
    // to bring it back. Only on the in-flight row, because `session run`
    // drives the session the record says is in flight and no other.
    when: (repository, session) =>
      repository.currentSession === session.number && session.status === "in-progress",
  },
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
