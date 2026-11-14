// Typed action registry for the Work Explorer's row context menus. Each
// entry mints a `contextValue` token (see actionToken in the tree
// model); package.json's `when` clauses match those tokens, and the
// registry check in the test suite keeps the two in lockstep.
//
// Two lists, because the two row kinds answer to different questions. A
// repository owns the files and the lifecycle launchers; a session owns
// what can be done to that session. Widening one `when` to cover both
// would make every entry's signature lie about what it reads.

import type { ProgressProjectionSession as SessionRecord } from "dabbler-ai-router";
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
// There is no approve-over entry: the framework has no approval anywhere.
// What a person may do at a stop is go past it on their own authority, on
// the record, after reading the card -- Review exception, which is
// `dabbler session waive` and writes what was unmet as unmet. Check this
// stop is the independent check beside it, advice and never a gate.
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

/**
 * Whose funds a session is waiting for, off the router's own wait sentence
 * ("waiting for funds: <vendor>. ..."), or null where it is not that wait.
 */
export function fundsVendor(session: SessionRecord): string | null {
  if (session.waiting?.owner !== "person") return null;
  const said = /waiting for funds:\s*([^.]+)/i.exec(session.waiting.for);
  return said === null ? null : said[1].trim();
}

/** The session in flight, with a stop standing over it. */
const hasStandingStop = (repository: SessionsRepository, session: SessionRecord): boolean =>
  repository.currentSession === session.number && session.status === "in-progress" && session.stopActor !== undefined;

export const SESSION_ACTIONS: SessionAction[] = [
  {
    id: "dabblerSessionSets.continueSession",
    label: "Continue Session",
    group: 899,
    // A wait for funds is the person's, and its one way on is to carry on
    // once the account is paid: the same start Start Session runs.
    when: (repository, session) =>
      repository.currentSession === session.number &&
      session.status === "in-progress" &&
      fundsVendor(session) !== null,
  },
  {
    id: START_SESSION,
    label: "Start Session",
    group: 900,
    when: isTheNextRow,
  },
  {
    id: "dabblerSessionSets.stopSession",
    label: "Stop Session",
    group: 905,
    // The person asking for the machine back, on the row of the session
    // actually in flight -- there is one, and `session interrupt` writes
    // its request for the framework to read. Offered whether or not the
    // framework is working at that moment: a request written while it is not
    // is read when the AI's next answer arrives, and a person who cannot find
    // the stop button reaches for the one thing that always works, which is
    // killing something.
    when: (repository, session) =>
      repository.currentSession === session.number && session.status === "in-progress",
  },
  { id: CONSULT_WITH_AI, label: "Consult with AI", group: 904, when: () => true },
  {
    id: "dabbler.openMechanic",
    label: "Open a Mechanic",
    group: 906,
    // The session a Mechanic would diagnose: the one in flight, stopped or not.
    when: (repository, session) =>
      repository.currentSession === session.number && session.status === "in-progress",
  },
  {
    id: "dabbler.checkStop",
    label: "Check this stop",
    group: 908,
    // A stop standing over the session in flight: `stopActor` is projected
    // only then, so a row without one has nothing to check.
    when: hasStandingStop,
  },
  {
    id: "dabbler.reviewException",
    label: "Review exception",
    group: 909,
    when: hasStandingStop,
  },
  {
    id: "dabbler.reportStop",
    label: "Report this stop to Dabbler",
    group: 911,
    // A stop the framework recorded, standing now: the report is of it, and
    // the person reads and sends what is written.
    when: hasStandingStop,
  },
  {
    id: "dabbler.openTranscript",
    label: "Open Transcript at its Exceptions",
    group: 910,
    // A closed session that went past a stop on a person's authority: its
    // committed page says what was unmet and who authorised going on.
    when: (_repository, session) => session.status === "complete" && (session.exceptions?.length ?? 0) > 0,
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
  {
    id: "dabblerSessionSets.rollback",
    label: "Rollback to Start of This Session",
    group: 903,
    // The third way to end a session, for an implementation that went
    // wrong or a problem that spans several: back to where this session
    // started, it and every session after it discarded. The router takes a
    // session in flight or completed and refuses the rest, so the item is
    // on those rows and on no other.
    when: (_repository, session) => session.status === "in-progress" || session.status === "complete",
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
