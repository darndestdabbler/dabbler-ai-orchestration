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

// Ordered list; `group` bands: 1xx Open File submenu, 3xx Copy Prompt
// submenu, 9xx lifecycle.
export const REPOSITORY_ACTIONS: RepositoryAction[] = [
  { id: "dabblerSessionSets.openSpec", label: "Session Plan", group: 101, when: () => true },
  { id: "dabblerSessionSets.openActivityLog", label: "Activity Log", group: 102, when: () => true },
  { id: "dabblerSessionSets.openChangeLog", label: "Change Log", group: 103, when: () => true },
  { id: "dabblerSessionSets.openSessionState", label: "Sessions Ledger", group: 104, when: () => true },
  { id: "dabblerSessionSets.startSession", label: "Start Session", group: 905, when: hasNextSession },
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
