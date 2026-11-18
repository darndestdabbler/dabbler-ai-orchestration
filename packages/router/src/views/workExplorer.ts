// The Work Explorer's rows, for every interface that shows them.
//
// PURE of any editor: the router's progress reading of each repository in,
// plain rows out -- a label, a description, a tooltip, an icon by name,
// whether the row opens, and the actions it offers. The rules that decide a
// row live here once, so a second interface renders them rather than
// working them out again; `dabbler view work-explorer` prints them as JSON.

import * as fs from "node:fs";
import * as path from "node:path";

import { mechanicMemoPath } from "../drive.ts";
import {
  ACTIVITY_LOG_FILENAME,
  SESSION_PLAN_FILENAME,
  SESSIONS_DIRNAME,
  STATE_FILENAME,
  planSection,
} from "../evidence.ts";
import type {
  ProgressProjection,
  ProgressProjectionOrchestrator as OrchestratorInfo,
  ProgressProjectionRepository,
  ProgressProjectionSession as SessionRecord,
  ProgressProjectionSessionStatus as SessionStatus,
  ProgressProjectionVerification as SessionVerification,
  ProgressProjectionTask as TaskRecord,
  ProgressProjectionFinding as VerificationFinding,
} from "../generated/progress-projection.ts";
import type {
  WorkExplorer,
  WorkExplorerAction,
  WorkExplorerConfirmation,
  WorkExplorerIcon,
  WorkExplorerOpens,
  WorkExplorerReason,
  WorkExplorerRow,
} from "../generated/work-explorer.ts";
import type { RollbackFacts } from "../contracts/router.ts";
import { TRANSCRIPTS_DIRNAME } from "../journal.ts";
import { EXCEPTIONS_ANCHOR, humanizeStepKey, sessionTranscriptName } from "../transcript.ts";
import { type Activity, currentActivity, uncollectedWords } from "./terminalLines.ts";

// ===========================================================================
// The verdict words
// ===========================================================================

// The reader side of the `verificationVerdict` vocabulary.
//
// Set 112 S2: this module is what survived `utils/tierLegibility.ts`.
// That file hosted the Lightweight tier's Explorer signals — the `lw`
// marker, the tier-mismatch advisory, the `N/M+` fraction, the `v?`/`v+`
// verification-posture markers, the durable `verificationMode` reader and
// the seven-state workflow ladder — every one of which existed only to
// make the Lightweight tier legible. The tier is gone, so they are gone.
// The verdict vocabulary below is tier-independent (the Work Explorer
// renders it on every row) and moved here rather than dying with its old
// host.

// Set 086 S2: the reader-recognized verdict vocabulary. Readers are
// deliberately PREFIX-lenient (docs/session-state-schema.md → the
// `verificationVerdict` contract): an intentionally-shipped extension token
// like `ISSUES_FOUND_RESOLVED_IN_FLIGHT` classifies via its canonical prefix
// without a schema bump. This mirrors the STRICT (exact-allowlist) writer side
// of the same asymmetry (ai_router/session_state.py `_CANONICAL_VERDICT_TOKENS`):
// the sanctioned writer refuses to persist a non-verdict, and this reader refuses
// to render an unrecognized one as if it were a clean verdict.
export const RECOGNIZED_VERDICT_PREFIXES = [
  "VERIFIED",
  "ISSUES_FOUND",
  "REMEDIATED_AT_CAP",
  // Retired: no writer emits WAIVED any more, and the Python writer
  // refuses it. Historical records carry it, and a reader that stopped
  // recognizing it would render the past as a confabulation.
  "WAIVED",
] as const;

// True iff `verdict`, normalized (trimmed, upper-cased), begins with a
// recognized canonical prefix. A free-form non-verdict — e.g. the confabulated
// `manual-override-development` the Set-086 root-cause incident persisted —
// returns false, which is what lets the display flag it instead of laundering
// it into a legitimate-looking status.
export function isRecognizedVerdictToken(
  verdict: string | null | undefined,
): boolean {
  if (typeof verdict !== "string") return false;
  const normalized = verdict.trim().toUpperCase();
  if (!normalized) return false;
  return RECOGNIZED_VERDICT_PREFIXES.some((p) => normalized.startsWith(p));
}

// ===========================================================================
// Row rules
// ===========================================================================

// Row-level rules the platform does not make for us, pure and
// unit-testable, shared by the native row command and the context menu.

/**
 * Whether *session* is in flight AND unresolved at the cap — the one
 * state the lifecycle cannot close out of. The router refuses to cancel a
 * session in flight without `--force`, and that refusal is right for live
 * work; here it would leave the session with no exit at all, so cancel is
 * the sanctioned one and the flag is passed on the record's say-so.
 */
export function sessionCannotClose(session: SessionRecord): boolean {
  return (
    session.status === "in-progress" &&
    session.verification !== null &&
    session.verification.terminal === "ISSUES_FOUND"
  );
}

// ===========================================================================
// Session naming, progress text and icons
// ===========================================================================

// Pure data-layer helpers shared by the tree model: the status icon map,
// row naming, progress text, and the verdict-cleanliness rule. No vscode
// import.

/**
 * The operator's authored status glyphs, resolved BY NAME out of
 * media/light/ and media/dark/ and handed to TreeItem.iconPath as a
 * { light, dark } pair.
 *
 * Do not consolidate these into one `fill:currentColor` asset. A
 * `contributes.viewsContainers` icon and a TreeItem.iconPath are not
 * rendered by the same mechanism — VS Code paints a tree icon as a
 * background-image with no mask, so the SVG renders exactly as authored
 * and inherits no colour from the row. The light/dark split exists
 * because the as-authored glyphs carry a hardcoded `#ffffff` that makes
 * `not-started` nearly invisible on a light theme. See
 * media/status-icon-theming.md.
 */
export const ICON_FILES: Record<SessionStatus, string> = {
  complete: "done.svg",
  "in-progress": "in-progress.svg",
  "not-started": "not-started.svg",
  cancelled: "cancelled.svg",
};

/**
 * How a session number is WRITTEN — three digits, zero-padded — as the
 * projection already wrote it.
 *
 * The padding rule has ONE owner and it is Python's
 * `progress.session_display_number`, which the CLI's human output calls
 * and the projection carries here. This function does not re-implement
 * it: a payload that carries no name degrades to the plain number rather
 * than growing a second copy of the rule that could disagree with the
 * first. TypeScript renders; Python decides.
 */
export function sessionDisplayNumber(session: SessionRecord): string {
  return session.displayNumber || String(session.number);
}

/** The row label: the session's written number, then its own title. */
export function sessionRowLabel(session: SessionRecord): string {
  const title = session.title.trim() || `Session ${session.number}`;
  return `${sessionDisplayNumber(session)} · ${title}`;
}

/** Sessions in ledger order — ascending by number, the order they run. */
export function sessionsInOrder(
  sessions: readonly SessionRecord[],
): SessionRecord[] {
  return [...sessions].sort((a, b) => a.number - b.number);
}

/**
 * The repository row's description. Always X/total: an "X/X" shape on a
 * finished repository would mask a count that ran ahead of the ledger.
 *
 * A repository whose sessions came from its plan says so instead of
 * counting. "0/2" on a repository the router has never written to reads
 * as two sessions that have not run YET, which is true of a repository
 * mid-sequence too; the distinction the operator needs is that nothing
 * has run here at all.
 */
export function progressText(repository: SessionsRepository): string {
  if (repository.sessionsSource === "plan") {
    return `${repository.sessions.length} planned · nothing has run here yet`;
  }
  const total = repository.totalSessions;
  const base =
    total && total > 0
      ? `${repository.sessionsCompleted}/${total}`
      : repository.sessionsCompleted > 0
        ? `${repository.sessionsCompleted} complete`
        : "";
  const current = repository.currentSession;
  if (current === null) return base;
  // The in-flight session's own written number, so the repository row
  // and the row beneath it name it identically.
  const inFlight = repository.sessions.find((s) => s.number === current);
  const written = inFlight ? sessionDisplayNumber(inFlight) : String(current);
  // A heartbeat, and only a heartbeat. It says the record has stopped
  // MOVING; it does not say the thinking has stopped being useful, and a
  // row that implied the second would be making a judgment it cannot make.
  const annotation = repository.possiblyStalled
    ? `session ${written} in flight · nothing written for a while`
    : `session ${written} in flight`;
  return base ? `${base} · ${annotation}` : annotation;
}

/** A verdict that must not render as a pass: unrecognized, or a failure
 * token. REMEDIATED_AT_CAP is unclean on purpose — the work landed, but
 * no verifier reviewed the repair, and a row that reads as a pass would
 * hide that. */
export function verdictIsUnclean(verdict: string | null | undefined): boolean {
  if (typeof verdict !== "string" || verdict.trim() === "") return false;
  if (!isRecognizedVerdictToken(verdict)) return true;
  const normalized = verdict.trim().toUpperCase();
  return (
    normalized.startsWith("ISSUES_FOUND") ||
    normalized.startsWith("WAIVED") ||
    normalized.startsWith("REMEDIATED_AT_CAP")
  );
}

// ===========================================================================
// The actions a row offers
// ===========================================================================

// Typed action registry for the Work Explorer's row context menus. Each
// entry mints a `contextValue` token (see actionToken in the tree
// model); package.json's `when` clauses match those tokens, and the
// registry check in the test suite keeps the two in lockstep.
//
// Two lists, because the two row kinds answer to different questions. A
// repository owns the files and the lifecycle launchers; a session owns
// what can be done to that session. Widening one `when` to cover both
// would make every entry's signature lie about what it reads.

// The shapes an action is written in are the rows' schema's
// (schemas/work-explorer.schema.json), generated, so the Visual Studio
// extension's types and these are written from one file.

/** A confirmation a person gives before an action runs, in the words they are shown. */
export type ActionConfirmation = WorkExplorerConfirmation;

/**
 * A reason a person types before an action runs; it reaches the command as
 * `--reason <text>` after its other arguments.
 */
export type ActionReason = WorkExplorerReason;

/** A file an action opens rather than a verb it runs. */
export type ActionOpens = WorkExplorerOpens;

/** One action as offered on one row. */
export type OfferedAction = WorkExplorerAction;

/**
 * What an action is, for an interface to show and run: the `dabbler` verb it
 * stands for with its arguments filled in from the row, or the file it opens,
 * and what it needs from a person first. Nothing about it is left for the
 * interface to work out -- Cancel's `--force` included.
 */
export type ActionEffect = Omit<WorkExplorerAction, "id" | "title">;

const NOTHING_ASKED = { opens: null, preview: null, confirm: null, reason: null } as const;

/** `dabbler <verb...> --sessions-dir <the repository's sessions root>`. */
function dabbler(repository: SessionsRepository, ...verb: string[]): string[] {
  return ["dabbler", ...verb, "--sessions-dir", repository.sessionsDir];
}

function runs(argv: string[]): ActionEffect {
  return { ...NOTHING_ASKED, argv };
}

function opens(file: string, line: number | null = 1, fragment: string | null = null): ActionEffect {
  return { ...NOTHING_ASKED, argv: null, opens: { file, line, fragment } };
}

/** How a session in flight is named in the words that ask about it. */
const threeDigits = (sessionNumber: number): string => String(sessionNumber).padStart(3, "0");

// ---------------------------------------------------------------------------
// The words each action asks with, one copy, for every interface
// ---------------------------------------------------------------------------

export function cancelConfirmation(sessionNumber: number, name: string, force: boolean): ActionConfirmation {
  // The button label is the full phrase rather than "Cancel": an editor's
  // own Esc/cancel already means "abort this dialog", so a button labeled
  // "Cancel" reads as abort rather than as the action.
  return {
    title: `Cancel session ${sessionNumber} "${name}"?`,
    detail: force
      ? "This session is unresolved at the cap and cannot close, so it is " +
        "cancelled in flight. Nothing it built lands; its record stays. " +
        "The reason is recorded on the session, which can be restored later."
      : "The reason is recorded on the session, which can be restored later.",
    accept: "Cancel Session",
    keep: "Keep",
  };
}

export function cancelReason(name: string): ActionReason {
  return {
    prompt: `Reason for cancelling "${name}" (optional)`,
    placeholder: "e.g. scope rolled into another session",
    blank: "",
    // Optional: a dismissed box goes on as an empty one, as the CLI's own
    // contract allows.
    dismissed: "blank",
  };
}

export function restoreConfirmation(sessionNumber: number, name: string): ActionConfirmation {
  return {
    title: `Restore session ${sessionNumber} "${name}"?`,
    detail: "This returns the session to the status it held before it was cancelled.",
    accept: "Restore",
    keep: "Keep Cancelled",
  };
}

export function restoreReason(name: string): ActionReason {
  return {
    prompt: `Reason for restoring "${name}" (optional)`,
    placeholder: "e.g. scope is back in plan",
    blank: "",
    dismissed: "blank",
  };
}

/** The reason every rollback from a row is recorded with. */
export const ROLLBACK_REASON = "Rollback to Start of This Session from the Work Explorer";

/** A rollback's question; its detail is `rollbackDetail` over the dry run's facts. */
export function rollbackConfirmation(sessionNumber: number, name: string): ActionConfirmation {
  return {
    title: `Roll back to the start of session ${sessionNumber} "${name}"?`,
    detail: null,
    accept: "Roll Back",
    keep: "Keep",
  };
}

export type { RollbackFacts };

// The dry run prints it, so it lives beside the facts it reads.
export { rollbackDetail } from "../session.ts";

/** The reason a stop is recorded with when the person typed none. */
export const STOP_REASON_BLANK = "the operator stopped the session";

export function stopReason(sessionNumber: number): ActionReason {
  // Dismissing the box aborts: a stop nobody typed a reason into is a stop
  // nobody meant.
  return {
    prompt: `Why stop session ${threeDigits(sessionNumber)}? The reason is recorded on the stop.`,
    placeholder: "e.g. I need the machine back",
    blank: STOP_REASON_BLANK,
    dismissed: "abort",
  };
}

export function checkStopConfirmation(sessionNumber: number): ActionConfirmation {
  // Said first to be one provider call and advice only, because it is a
  // button that spends one; the person's yes runs it.
  return {
    title:
      `Check session ${threeDigits(sessionNumber)}'s stop? This is one provider call: a model that is not the author's reads the ` +
      "record and says whose the stop is, naming a way within the rules where it finds one. It is advice only " +
      "and is kept in the run's exceptions.jsonl; it decides nothing.",
    detail: null,
    accept: "Check this stop",
    keep: null,
  };
}

export function waiveReason(sessionNumber: number): ActionReason {
  // The card is read first, whether or not a check was run; a dismissed or
  // empty box changes nothing.
  return {
    prompt: `Why may session ${threeDigits(sessionNumber)} go past this stop? Your reason and your name are recorded beside what was unmet.`,
    placeholder: "e.g. the clock test is flaky on this host; the fix is planned",
    blank: null,
    dismissed: "abort",
  };
}

export function reportStopConfirmation(sessionNumber: number): ActionConfirmation {
  return {
    title:
      `Write a report of session ${threeDigits(sessionNumber)}'s stop for Dabbler's maintainers? This is one provider call: the Primary ` +
      "Reviewer reads the report's two short passages for anything of your repository's. The report opens for you " +
      "to read; nothing is sent.",
    detail: null,
    accept: "Write the report",
    keep: null,
  };
}

// ---------------------------------------------------------------------------
// The two lists
// ---------------------------------------------------------------------------

export interface RepositoryAction {
  id: string;
  label: string;
  group: number;
  when: (repository: SessionsRepository) => boolean;
  does: (repository: SessionsRepository) => ActionEffect;
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

// `session start` registers the next session and opens the engine on it; it
// takes no number, so the same command stands on every row that offers it.
const startSession = (repository: SessionsRepository): ActionEffect => runs(dabbler(repository, "session", "start"));

// Ordered list; `group` bands: 1xx Open File submenu, 3xx Copy Prompt
// submenu, 9xx lifecycle.
export const REPOSITORY_ACTIONS: RepositoryAction[] = [
  { id: "dabblerSessionSets.openSpec", label: "Session Plan", group: 101, when: () => true,
    does: (r) => opens(r.planPath) },
  { id: "dabblerSessionSets.openActivityLog", label: "Activity Log", group: 102, when: () => true,
    does: (r) => opens(r.activityPath) },
  { id: "dabblerSessionSets.openChangeLog", label: "Change Log", group: 103, when: () => true,
    does: (r) => opens(r.changeLogPath) },
  { id: "dabblerSessionSets.openSessionState", label: "Sessions Ledger", group: 104, when: () => true,
    does: (r) => opens(r.ledgerPath) },
  { id: START_SESSION, label: "Start Session", group: 905, when: hasNextSession, does: startSession },
  // No confirmation because no decision exists: the gates decide, and a
  // refusal is information rather than something a person authorises.
  { id: "dabblerSessionSets.closeSession", label: "Close Session", group: 906,
    when: (r) => r.currentSession !== null, does: (r) => runs(dabbler(r, "session", "close")) },
  // Whatever state the work is in: a consult drives nothing. The engine it
  // opens is told to run this first.
  { id: CONSULT_WITH_AI, label: "Consult with AI", group: 908, when: () => true,
    does: (r) => runs(dabbler(r, "consult")) },
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
  does: (repository: SessionsRepository, session: SessionRecord) => ActionEffect;
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
export const hasStandingStop = (repository: SessionsRepository, session: SessionRecord): boolean =>
  repository.currentSession === session.number && session.status === "in-progress" && session.stopActor !== undefined;

/** `--session-number N`: the verbs that act on one session take it so. */
const numbered = (session: SessionRecord): string[] => ["--session-number", String(session.number)];

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
    does: (repository) => startSession(repository),
  },
  {
    id: START_SESSION,
    label: "Start Session",
    group: 900,
    when: isTheNextRow,
    does: (repository) => startSession(repository),
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
    does: (repository, session) => ({
      ...runs([...dabbler(repository, "session", "interrupt"), ...numbered(session), "--stop"]),
      reason: stopReason(session.number),
    }),
  },
  {
    id: CONSULT_WITH_AI,
    label: "Consult with AI",
    group: 904,
    when: () => true,
    does: (repository, session) => runs([...dabbler(repository, "consult"), "--session", String(session.number)]),
  },
  {
    id: "dabbler.openMechanic",
    label: "Open a Mechanic",
    group: 906,
    // The session a Mechanic would diagnose: the one in flight, stopped or not.
    when: (repository, session) =>
      repository.currentSession === session.number && session.status === "in-progress",
    does: (repository) => runs([...dabbler(repository, "consult"), "--mechanic"]),
  },
  {
    id: "dabbler.checkStop",
    label: "Check this stop",
    group: 908,
    // A stop standing over the session in flight: `stopActor` is projected
    // only then, so a row without one has nothing to check.
    when: hasStandingStop,
    does: (repository, session) => ({
      ...runs(dabbler(repository, "triage")),
      confirm: checkStopConfirmation(session.number),
    }),
  },
  {
    id: "dabbler.reviewException",
    label: "Review exception",
    group: 909,
    when: hasStandingStop,
    // Without a reason the verb prints the card and writes nothing; the
    // card is what the person reads before they give one.
    does: (repository, session) => ({
      ...runs(dabbler(repository, "session", "waive")),
      preview: dabbler(repository, "session", "waive"),
      reason: waiveReason(session.number),
    }),
  },
  {
    id: "dabbler.reportStop",
    label: "Report this stop to Dabbler",
    group: 911,
    // A stop the framework recorded, standing now: the report is of it, and
    // the person reads and sends what is written.
    when: hasStandingStop,
    does: (repository, session) => ({
      ...runs(dabbler(repository, "session", "defect-report")),
      confirm: reportStopConfirmation(session.number),
    }),
  },
  {
    id: "dabbler.openTranscript",
    label: "Open Transcript at its Exceptions",
    group: 910,
    // A closed session that went past a stop on a person's authority: its
    // committed page says what was unmet and who authorised going on.
    when: (_repository, session) => session.status === "complete" && (session.exceptions?.length ?? 0) > 0,
    does: (repository, session) =>
      opens(path.join(repository.root, TRANSCRIPTS_DIRNAME, sessionTranscriptName(session.number)), null, EXCEPTIONS_ANCHOR),
  },
  {
    id: "dabblerSessionSets.cancel",
    label: "Cancel Session",
    group: 901,
    // A cancelled session restores; anything else can be cancelled,
    // including a complete one — the reason is recorded either way.
    when: (_repository, session) => session.status !== "cancelled",
    // `--force` is the record's say-so, never the person's: the one state
    // the lifecycle cannot close out of is cancelled in flight.
    does: (repository, session) => {
      const force = sessionCannotClose(session);
      return {
        ...runs([...dabbler(repository, "session", "cancel"), ...numbered(session), ...(force ? ["--force"] : [])]),
        confirm: cancelConfirmation(session.number, sessionRowLabel(session), force),
        reason: cancelReason(sessionRowLabel(session)),
      };
    },
  },
  {
    id: "dabblerSessionSets.restore",
    label: "Restore Session",
    group: 902,
    when: (_repository, session) => session.status === "cancelled",
    does: (repository, session) => ({
      ...runs([...dabbler(repository, "session", "restore"), ...numbered(session)]),
      confirm: restoreConfirmation(session.number, sessionRowLabel(session)),
      reason: restoreReason(sessionRowLabel(session)),
    }),
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
    // The dry run's facts are the confirmation's detail, and its `head` is
    // passed back as `--as-of`, so the rollback refuses a repository that
    // moved while the person was reading.
    does: (repository, session) => {
      const argv = [...dabbler(repository, "session", "rollback"), ...numbered(session), "--reason", ROLLBACK_REASON];
      return {
        ...runs(argv),
        preview: [...argv, "--dry-run"],
        confirm: rollbackConfirmation(session.number, sessionRowLabel(session)),
      };
    },
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

/** The actions a repository row offers, in menu order, each as an interface runs it. */
export function offeredRepositoryActions(repository: SessionsRepository): OfferedAction[] {
  return applicableRepositoryActions(repository).map((action) => ({
    id: action.id,
    title: action.label,
    ...action.does(repository),
  }));
}

/** The actions a session row offers, in menu order, each as an interface runs it. */
export function offeredSessionActions(repository: SessionsRepository, session: SessionRecord): OfferedAction[] {
  return applicableSessionActions(repository, session).map((action) => ({
    id: action.id,
    title: action.label,
    ...action.does(repository, session),
  }));
}

// ===========================================================================
// The tree: nodes, children and descriptors
// ===========================================================================

// The Work Explorer's native-tree view model.
//
// PURE. No vscode import: everything here is a plain data transform from
// the projection-backed repository scan onto row DESCRIPTORS, which
// WorkExplorerTreeProvider converts into real TreeItems. Status facts
// (glyph keys, the active step) are the projection's — this module
// arranges them and never re-derives them.
//
// Three load-bearing display constraints:
//   1. Sessions render under STATUS BUCKETS, and each bucket is a numbered
//      sequence. In Progress and Not Started run ascending — the order the
//      work runs; Complete and Cancelled run descending, so the latest
//      finished session sits under its header instead of at the bottom of
//      a scroll. An empty bucket is not rendered. The operator ruled the
//      buckets back once the flat list of D104 became the long scroll D104
//      itself predicted; the zero-padded number still reads down the left
//      edge, within each bucket.
//   2. Row icons consistently communicate lifecycle status; severity (an
//      unclean verdict, an invariant violation) lives in the tooltip and
//      contextValue.
//   3. At most two inline actions per row, enforced in package.json and
//      asserted by the menu-registry test.

// ---------------------------------------------------------------------------
// Nodes: repository -> bucket -> session -> step
// ---------------------------------------------------------------------------

/**
 * Every node exposes a `repository` property ON PURPOSE: every row
 * command reads its target off the node, and a node shaped this way is
 * accepted by the whole command surface with no adapter.
 */
export type WorkExplorerNode =
  | RepositoryNode
  | BucketNode
  | SessionNode
  | VerificationNode
  | FindingNode
  | TaskNode
  | AttentionNode
  | RefusalNode;

export interface RepositoryNode {
  readonly kind: "repository";
  readonly repository: SessionsRepository;
}

/**
 * The four lifecycle buckets, plus Information — the closed-session notes
 * that used to sit above the sessions as attention rows.
 */
export type BucketKey = SessionStatus | "information";

/**
 * A bucket holds either sessions (the lifecycle buckets) or notes
 * (Information); the other list is empty. Members are computed once, when
 * the repository expands, so the header's count and its children agree.
 */
export interface BucketNode {
  readonly kind: "bucket";
  readonly repository: SessionsRepository;
  readonly bucket: BucketKey;
  readonly sessions: readonly SessionRecord[];
  readonly notes: readonly AttentionNode[];
}

export interface SessionNode {
  readonly kind: "session";
  readonly repository: SessionsRepository;
  readonly session: SessionRecord;
}

/**
 * One task of the in-flight session: an approved-plan step, in plan
 * order, carrying the state the execution record folded onto it.
 * `position` is that plan order and makes the TreeItem.id unique.
 */
export interface TaskNode {
  readonly kind: "task";
  readonly repository: SessionsRepository;
  readonly session: SessionRecord;
  readonly row: TaskRecord;
}

/**
 * The unresolved-session view: a session's rounds ledger, folded by the
 * projection, read at planning time rather than as an interruption. One
 * per session whose fold is not clean; a verified session gets none,
 * because its tooltip already says so and a row under every session
 * would bury the ones that need reading.
 */
export interface VerificationNode {
  readonly kind: "verification";
  readonly repository: SessionsRepository;
  readonly session: SessionRecord;
  readonly view: SessionVerification;
}

/** One finding of the round that stopped the session, in record order. */
export interface FindingNode {
  readonly kind: "finding";
  readonly repository: SessionsRepository;
  readonly session: SessionRecord;
  readonly finding: VerificationFinding;
  readonly index: number;
}

/**
 * The only child a session gets for a record it cannot read — the
 * execution record, or the rounds ledger. It exists so the tree can say
 * it cannot tell (which step is open; what stopped the session) — the
 * alternative, showing the last row that did parse, is the
 * stale-but-plausible failure this level was built to end.
 */
export interface RefusalNode {
  readonly kind: "refusal";
  readonly repository: SessionsRepository;
  readonly session: SessionRecord;
  readonly subject: "execution record" | "rounds ledger";
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Children — one function per level, each called only on expand
// ---------------------------------------------------------------------------

export function repositoryNodes(
  repositories: readonly SessionsRepository[],
): RepositoryNode[] {
  return repositories.map((repository) => ({ kind: "repository", repository }));
}

/**
 * The bucket order, top to bottom, and each one's sort. The live work
 * reads first and runs ascending — the order it runs; the finished work
 * runs descending so the most recent close is one row under its header.
 * `planned` sessions (declared by the plan, not yet in the ledger) share
 * Not Started with the registered ones; they sort last there by number.
 */
export const BUCKETS: readonly {
  key: BucketKey;
  label: string;
  order: "ascending" | "descending";
}[] = [
  { key: "in-progress", label: "In Progress", order: "ascending" },
  { key: "not-started", label: "Not Started", order: "ascending" },
  { key: "complete", label: "Complete", order: "descending" },
  { key: "cancelled", label: "Cancelled", order: "descending" },
  { key: "information", label: "Information", order: "ascending" },
];

function bucketFor(session: SessionRecord): SessionStatus {
  return session.status === "planned" ? "not-started" : session.status;
}

/**
 * The second level: one row per NON-EMPTY bucket. A fresh repository shows
 * only Not Started; Complete appears when the first session closes. A
 * repository whose projection was unavailable yields no buckets, which is
 * why RepositoryNode reports itself collapsible only when it has sessions.
 */
export function bucketNodes(node: RepositoryNode): BucketNode[] {
  const ordered = sessionsInOrder(node.repository.sessions);
  const notes = informationNodes(node);
  const buckets: BucketNode[] = [];
  for (const spec of BUCKETS) {
    if (spec.key === "information") {
      if (notes.length > 0) {
        buckets.push({
          kind: "bucket",
          repository: node.repository,
          bucket: spec.key,
          sessions: [],
          notes,
        });
      }
      continue;
    }
    const members = ordered.filter((session) => bucketFor(session) === spec.key);
    if (members.length === 0) continue;
    if (spec.order === "descending") members.reverse();
    buckets.push({
      kind: "bucket",
      repository: node.repository,
      bucket: spec.key,
      sessions: members,
      notes: [],
    });
  }
  return buckets;
}

/** The third level: a lifecycle bucket's sessions, in the bucket's order. */
export function sessionNodes(node: BucketNode): SessionNode[] {
  return node.sessions.map((session) => ({
    kind: "session",
    repository: node.repository,
    session,
  }));
}

/**
 * The third level: the in-flight session's tasks, exactly as the
 * projection lists them. A refusal outranks the list — the projection
 * refuses an unreadable execution record rather than emitting rows, and
 * that refusal is rendered as the session's one child. Otherwise empty
 * is empty: a session with no approved plan has no tasks, and inventing
 * rows for it is what this level exists not to do.
 */
export function taskNodes(node: SessionNode): (TaskNode | RefusalNode)[] {
  if (node.session.tasksRefused) {
    return [
      {
        kind: "refusal",
        repository: node.repository,
        session: node.session,
        subject: "execution record",
        reason: node.session.tasksRefused,
      },
    ];
  }
  return node.session.tasks.filter((row) => !isWorkStepRow(row)).map((row) => ({
    kind: "task",
    repository: node.repository,
    session: node.session,
    row,
  }));
}

/**
 * The prefix that makes a task row a step of the Work phase.
 *
 * The projection emits its rows flat and in reading order, and the parent
 * relationship travels in the id — `work:<step-id>`, derived from the
 * approved plan. Nesting on the prefix means the renderer adds no structure
 * the record does not already carry: a row is a child because of what it is
 * called, not because this file decided where to put it.
 */
export const WORK_STEP_PREFIX = "work:";

function isWorkStepRow(row: TaskRecord): boolean {
  return (row.stepId ?? "").startsWith(WORK_STEP_PREFIX);
}

/**
 * The steps of the Work row, in plan order.
 *
 * Empty for every other row, and empty for Work itself before a plan is
 * accepted — which is the placeholder state: the phase is real and the steps
 * under it are not declared yet.
 */
export function workStepNodes(node: TaskNode): TaskNode[] {
  if (node.row.stepId !== "work") return [];
  return node.session.tasks
    .filter(isWorkStepRow)
    .map((row) => ({
      kind: "task" as const,
      repository: node.repository,
      session: node.session,
      row,
    }));
}

/**
 * The verification row, when there is one to read. A refused ledger
 * outranks the fold for the same reason a refused execution record
 * outranks the task list; a clean fold yields nothing, because a verified
 * session has nothing to read at planning time. Python decided `clean`.
 */
export function verificationNodes(
  node: SessionNode,
): (VerificationNode | RefusalNode)[] {
  if (node.session.verificationRefused) {
    return [
      {
        kind: "refusal",
        repository: node.repository,
        session: node.session,
        subject: "rounds ledger",
        reason: node.session.verificationRefused,
      },
    ];
  }
  const view = node.session.verification;
  if (!view || view.clean) return [];
  return [{ kind: "verification", repository: node.repository, session: node.session, view }];
}

/** The findings of the stopping round, exactly as the record lists them. */
export function findingNodes(node: VerificationNode): FindingNode[] {
  return node.view.findings.map((finding, index) => ({
    kind: "finding",
    repository: node.repository,
    session: node.session,
    finding,
    index,
  }));
}

export function childrenOf(node: WorkExplorerNode): WorkExplorerNode[] {
  switch (node.kind) {
    case "repository":
      // Attention above the work: what is waiting on the operator is the
      // reason they opened the view, and it reads first.
      return [...attentionNodes(node), ...bucketNodes(node)];
    case "bucket":
      return node.bucket === "information" ? [...node.notes] : sessionNodes(node);
    case "session":
      // What stopped it, above what it was doing: the verification row,
      // then the tasks.
      return [...verificationNodes(node), ...taskNodes(node)];
    case "verification":
      return findingNodes(node);
    case "task":
      return workStepNodes(node);
    case "finding":
    case "attention":
    case "refusal":
      return [];
  }
}

// ---------------------------------------------------------------------------
// Row descriptors
// ---------------------------------------------------------------------------

/**
 * How the adapter should build TreeItem.iconPath. `file` icons are the
 * operator's authored status SVGs under media/{light,dark}/, resolved
 * per theme by the adapter.
 */
export type IconSpec = WorkExplorerIcon;

export interface RowDescriptor {
  /**
   * Stable across refreshes, unique across the whole tree. NOT
   * cosmetic: VS Code uses TreeItem.id to preserve selection and
   * EXPANSION state; without it every watcher tick (and the 30-second
   * poll) would fold the tree up under the operator.
   */
  id: string;
  label: string;
  description?: string;
  /** Markdown source; the adapter wraps it in a MarkdownString. */
  tooltip?: string;
  icon?: IconSpec;
  contextValue: string;
  /**
   * `expanded` is reserved for the In Progress bucket: the row the operator
   * came to see should not be behind a twisty. Everything else that has
   * children starts collapsed.
   */
  collapsible: "none" | "collapsed" | "expanded";
  /**
   * What activating the row does, for a row whose whole purpose is to be
   * acted on. Repository and session rows get theirs in the provider,
   * which knows the node; this is for rows that carry their own argument.
   */
  command?: { command: string; title: string; arguments: unknown[] };
  /**
   * The actions the row offers, in menu order, each as the `dabbler` command
   * it stands for or the file it opens, with what it asks first. The same
   * rule mints the row's action tokens, so the two cannot disagree.
   */
  actions?: OfferedAction[];
}

// Tokens are `;`-wrapped on both sides so a `when` clause can match
// `viewItem =~ /;token;/` with no word-boundary ambiguity.
export const TOKEN_SEP = ";";

export function tokenString(tokens: readonly string[]): string {
  return TOKEN_SEP + tokens.join(TOKEN_SEP) + TOKEN_SEP;
}

/** The `when`-clause fragment for one token. Used by the registry test. */
export function tokenMatcher(token: string): string {
  return `${TOKEN_SEP}${token}${TOKEN_SEP}`;
}

export function hasToken(contextValue: string, token: string): boolean {
  return contextValue.includes(tokenMatcher(token));
}

/** Node-kind discriminators. Every menu contribution matches one. */
export const NODE_TOKEN = {
  repository: "dabblerRepository",
  bucket: "dabblerBucket",
  session: "dabblerSession",
  verification: "dabblerVerification",
  finding: "dabblerFinding",
  task: "dabblerTask",
  attention: "dabblerAttention",
  refusal: "dabblerRefusal",
} as const;

/**
 * The contextValue token for one registry action, derived from the
 * command id so a new registry entry cannot be added without the
 * registry test noticing that no menu contribution matches it.
 */
export function actionToken(action: { readonly id: string }): string {
  return `act-${action.id.replace(/^dabbler(SessionSets)?\./, "").replace(/\./g, "-")}`;
}

// ---------------------------------------------------------------------------
// Severity (tooltip + contextValue only; the icon slot stays lifecycle)
// ---------------------------------------------------------------------------

export type SessionSeverity = "verification" | "record" | null;

/**
 * What a session row must not render as clean. A verdict the framework
 * never issued, or one that issued and did not pass, outranks the row's
 * lifecycle glyph in the tooltip — a complete session with an unclean
 * verdict is still complete, and still not proof of anything.
 */
export function severityOf(session: SessionRecord): SessionSeverity {
  if (verdictIsUnclean(session.verificationVerdict)) return "verification";
  // An unreadable record is a severity of its own: the session may be
  // perfectly clean and the framework still cannot say which of its
  // steps is open, or what its verifier said.
  return session.tasksRefused || session.verificationRefused ? "record" : null;
}

export function sessionIcon(status: SessionStatus): IconSpec {
  return { kind: "file", slug: ICON_FILES[status] };
}

// ---------------------------------------------------------------------------
// Descriptors, one per node kind
// ---------------------------------------------------------------------------

/**
 * Everything the repository row cannot show inline: the fraction, the
 * driving engine, and any fault the projection reported.
 */
export function repositoryTooltip(repository: SessionsRepository): string {
  const lines: string[] = [`**${repository.label}**`];
  const total = repository.totalSessions;
  const progress =
    total && total > 0
      ? `${repository.sessionsCompleted}/${total}`
      : `${repository.sessionsCompleted}/?`;
  lines.push("", `${progress} sessions complete`);

  const markers: string[] = [];
  if (repository.sessionsSource === "plan") {
    markers.push(
      "These sessions come from the session plan. The router has not " +
        "written a ledger here yet — starting session 1 is what writes it.",
    );
  }
  const orchestrator = repository.orchestrator;
  if (orchestrator && (orchestrator.engine || orchestrator.model)) {
    markers.push(
      `Driven by ${[orchestrator.engine, orchestrator.model]
        .filter(Boolean)
        .join(" / ")}.`,
    );
  }
  if (repository.invariantViolation) {
    // The projection reports two kinds of fault here -- a record that
    // breaks an invariant, and one that could not be read at all -- and
    // the message says which. The label must not claim the first.
    markers.push(`Record fault: ${repository.invariantViolation}`);
  }
  if (repository.forceClosed) {
    markers.push("A session here closed via the --force bypass, not the gate.");
  }
  if (
    repository.schemaVersionOnDisk !== null &&
    repository.schemaVersionOnDisk < 5
  ) {
    markers.push(
      `Ledger on disk is schema v${repository.schemaVersionOnDisk} ` +
        `(readers normalize on read).`,
    );
  }
  if (repository.sessions.length === 0) {
    markers.push(
      "No sessions were projected — the router could not be run here.",
    );
  }
  if (markers.length > 0) lines.push("", ...markers.map((m) => `- ${m}`));
  return lines.join("\n");
}

export function repositoryDescriptor(node: RepositoryNode): RowDescriptor {
  const { repository } = node;
  const tokens: string[] = [NODE_TOKEN.repository];
  const actions = offeredRepositoryActions(repository);
  for (const action of actions) tokens.push(actionToken(action));
  return {
    // The root path is the identity: two worktrees of one repository are
    // two rows, and only the path tells them apart.
    id: `repository:${repository.root}`,
    label: repository.label,
    description: progressText(repository),
    tooltip: repositoryTooltip(repository),
    // The repository row is structural. Lifecycle glyphs belong to the
    // session rows rather than competing with the repository's name, and
    // a repository holds no lifecycle state of its own to glyph.
    icon: undefined,
    contextValue: tokenString(tokens),
    collapsible: repository.sessions.length > 0 ? "collapsed" : "none",
    actions,
  };
}

/**
 * What a passed session's reviewer noted, beside its verdict -- ` (1 minor,
 * 2 nits)` -- read from the counts the projection carries, and nothing when
 * it noted nothing.
 */
function notedCounts(verdict: string, view: SessionVerification | null): string {
  if (verdict !== "VERIFIED" || view === null) return "";
  const parts: string[] = [];
  const minor = view.minor ?? 0;
  const nits = view.nits ?? 0;
  if (minor > 0) parts.push(`${minor} minor`);
  if (nits > 0) parts.push(`${nits} nit${nits === 1 ? "" : "s"}`);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function sessionTooltip(node: SessionNode): string {
  const { session } = node;
  const lines = [
    `**${sessionRowLabel(session)}**`,
    "",
    session.status.replace("-", " "),
  ];
  const verdict = session.verificationVerdict;
  // A session that changed nothing had nothing to verify: it says so where a
  // verdict would be, rather than reading as a session nobody verified.
  if (session.noChange === true) {
    lines.push("", "Verification: no change");
  } else if (typeof verdict === "string" && verdict.trim() !== "") {
    lines.push(
      "",
      isRecognizedVerdictToken(verdict)
        ? `Verification: ${verdict}${notedCounts(verdict, session.verification)}`
        : `Verification: "${verdict}" is not a recognized verdict`,
    );
  }
  if (session.completedAt) {
    lines.push("", `_closed ${session.completedAt}_`);
  } else if (session.startedAt) {
    lines.push("", `_started ${session.startedAt}_`);
  }
  if (session.verificationRefused) {
    lines.push("", `Rounds ledger unreadable: ${session.verificationRefused}`);
  }
  if (session.tasksRefused) {
    lines.push("", `Execution record unreadable: ${session.tasksRefused}`);
  } else if (session.tasks.length > 0) {
    const done = session.tasks.filter((t) => t.iconKey === "complete").length;
    lines.push("", `${done}/${session.tasks.length} tasks done`);
  }
  // A stop the Mechanic worked and handed back: its memo is what the person
  // reads next, so it is where they are already looking.
  const memo = node.repository.mechanicMemo ?? null;
  if (
    memo !== null &&
    node.repository.currentSession === session.number &&
    session.waiting?.owner === "person"
  ) {
    lines.push("", "**The Mechanic's memo**", "", memo);
  }
  return lines.join("\n");
}

/** Whether the session row has anything beneath it. */
function sessionHasChildren(session: SessionRecord): boolean {
  return Boolean(
    session.tasksRefused ||
      session.tasks.length > 0 ||
      session.verificationRefused ||
      (session.verification && !session.verification.clean),
  );
}

export function sessionDescriptor(node: SessionNode): RowDescriptor {
  const { repository, session } = node;
  const tokens: string[] = [NODE_TOKEN.session, `session-${session.status}`];
  const severity = severityOf(session);
  if (severity) tokens.push(`severity-${severity}`);
  const actions = offeredSessionActions(repository, session);
  for (const action of actions) tokens.push(actionToken(action));
  return {
    actions,
    id: `session:${repository.root}/${session.number}`,
    label: sessionRowLabel(session),
    // Short labels, so a description survives truncation here. Three states
    // say anything at all — quiet is the default. "planned" is a session the
    // plan declares that the ledger has not reached: it shares the
    // not-started glyph deliberately, so the word is the only thing that
    // distinguishes the two and it has to be on the row. A finished session
    // carries the date it closed, so "when was that done" is read at a
    // glance rather than from the tooltip.
    //
    // An in-flight session says who it is waiting on, in the router's own
    // sentence off the projection: "in flight" was true of a session
    // working and of one that waited six hours on nobody, and telling
    // those apart is the whole of what this row is for.
    description:
      session.status === "in-progress"
        ? fundsVendor(session) !== null
          ? `Waiting for funds: ${fundsVendor(session)}`
          : (session.waiting?.says ?? "in flight")
        : session.status === "planned"
          ? "planned"
          : withExceptionMark(closeDateLabel(session.completedAt), session),
    tooltip: sessionTooltip(node),
    icon: sessionIcon(session.iconKey),
    contextValue: tokenString(tokens),
    // Collapsed only when there is something under it: the verification
    // row of a session that stopped at the cap, the task rows, or the one
    // row that says why a record could not be read. A verified session
    // that is not in flight is a leaf, and so is an in-flight one that
    // declared no plan.
    collapsible: sessionHasChildren(session) ? "collapsed" : "none",
  };
}

/**
 * A closed session that went past a stop on a person's authority carries a
 * small mark with the count, so the record that says so is one look away.
 */
function withExceptionMark(date: string | undefined, session: SessionRecord): string | undefined {
  const count = session.exceptions?.length ?? 0;
  if (count === 0) return date;
  const mark = `${count} exception${count === 1 ? "" : "s"}`;
  return date === undefined ? mark : `${date} · ${mark}`;
}

/** "unresolved at the cap" -> "Unresolved at the cap". */
function sentenceCase(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * What the terminal state means for the operator, in one sentence each.
 * Which state it is was Python's decision; this is only what to do about
 * it, and none of the three answers is "approve it".
 */
function terminalNote(view: SessionVerification): string {
  switch (view.terminal) {
    case "REMEDIATED_AT_CAP":
      return (
        "Every blocking finding of the last round was fixed and the cap " +
        "left the fix unreviewed. Not a waiver: nothing was accepted over a " +
        "finding that still stood; what is unproved is the repair."
      );
    case "ISSUES_FOUND":
      return (
        "Blocking findings still stand and nothing landed but the record. " +
        "Send it back, respecify it, or cancel it — there is no approval " +
        "to give."
      );
    case null:
      return "The review loop is still open; these findings await a fix.";
    default:
      return "";
  }
}

/**
 * The agency line: what the verifier looked at, and whether what it was
 * shown was what is on disk. A round without agency is not equivalent to
 * one that could look, and a transformed read is named as such — session 1
 * of the framework's own build took a confident Major against correct
 * code because a scrubbed read went unmarked.
 */
export function agencyLines(view: SessionVerification): string[] {
  const a = view.agency;
  if (a.mode === null) {
    return ["Agency: not recorded for this round."];
  }
  if (a.mode === "none") {
    return [
      "Agency: none — this round's verifier could not look at the tree" +
        (a.reason ? ` (${a.reason}).` : "."),
    ];
  }
  const lines = [
    `Agency: ${a.reads} read(s), ${a.searches} search(es), ${a.listings} listing(s).`,
  ];
  if (a.transformedReads > 0) {
    lines.push(
      `${a.transformedReads} read(s) were transformed — what the verifier ` +
        "was shown is not the bytes on disk.",
    );
  }
  if (a.outOfScope > 0) lines.push(`${a.outOfScope} not confined to scope.`);
  if (a.overBudget > 0) lines.push(`${a.overBudget} past the read budget.`);
  // The operations themselves, target by target. Counts say how much the
  // verifier looked; only the targets say whether it looked at the thing
  // its finding is about, and that is what the operator weighs a Major
  // against. A transformed or out-of-scope read is marked on its line.
  if (a.operations.length > 0) {
    lines.push("", "Looked at:");
    for (const op of a.operations.slice(0, OPERATIONS_SHOWN)) {
      const marks = [
        op.fidelity === "transformed" ? "transformed" : null,
        op.fidelity === "unverified" ? "unverified" : null,
        op.inScope ? null : "out of scope",
      ].filter(Boolean);
      lines.push(
        `- ${op.kind} ${op.target}${marks.length ? ` (${marks.join(", ")})` : ""}`,
      );
    }
    const more = a.operations.length - OPERATIONS_SHOWN;
    if (more > 0) lines.push(`- …and ${more} more, in the round ledger`);
  } else {
    lines.push("The verifier looked at nothing it was granted.");
  }
  return lines;
}

/** How many agency operations a tooltip lists before pointing at the ledger. */
export const OPERATIONS_SHOWN = 20;

export function verificationDescriptor(node: VerificationNode): RowDescriptor {
  const { view } = node;
  // "round 3 of 3" while the stopping round fits the cap; a session whose
  // ledger outran a cap that was lowered since is not squeezed into
  // "round 6 of 3" — the cap is named as the repository's current one.
  const round =
    view.stoppedAtRound !== null
      ? view.cap === null
        ? `round ${view.stoppedAtRound}`
        : view.stoppedAtRound <= view.cap
          ? `round ${view.stoppedAtRound} of ${view.cap}`
          : `round ${view.stoppedAtRound} (cap now ${view.cap})`
      : `${view.rounds} round(s)`;
  const verifier = [view.verifierModel, view.verifierProvider]
    .filter(Boolean)
    .join("/");
  const tally = (disposition: string): number =>
    view.findings.filter((f) => f.disposition === disposition).length;
  const counts = [
    ["outstanding", tally("outstanding")],
    ["fixed, unreviewed", tally("fixed, unreviewed")],
    ["noted", tally("noted")],
  ]
    .filter(([, n]) => (n as number) > 0)
    .map(([word, n]) => `${n} ${word}`)
    .join(", ");

  const lines = [
    `**${sentenceCase(view.headline)}**`,
    "",
    `Stopped at ${round}` +
      (verifier ? `, reviewed by ${verifier}` : "") +
      (view.transport ? ` over ${view.transport}` : "") +
      ".",
    "",
    terminalNote(view),
    "",
    ...agencyLines(view),
  ];
  if (view.findings.length > 0) {
    lines.push("", `${view.findings.length} finding(s): ${counts}.`);
  }
  if (view.fixPaths.length > 0) {
    lines.push("", `Fix touched: ${view.fixPaths.join(", ")}`);
  }

  const tokens = [
    NODE_TOKEN.verification,
    `terminal-${(view.terminal ?? "open").toLowerCase()}`,
    `agency-${view.agency.mode ?? "unknown"}`,
    ...(view.agency.transformedReads > 0 ? ["transformed-reads"] : []),
  ];
  return {
    id: `verification:${node.repository.root}/${node.session.number}`,
    label: sentenceCase(view.headline),
    description: `${round}${verifier ? ` · ${verifier}` : ""}`,
    tooltip: lines.filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n"),
    // A read surface, not a lifecycle state: the glyph says "look here"
    // and stays out of the status vocabulary the session rows own.
    icon: { kind: "theme", id: "eye" },
    contextValue: tokenString(tokens),
    collapsible: view.findings.length > 0 ? "collapsed" : "none",
  };
}

/**
 * A finding row. The label leads with the severity the verifier wrote,
 * the description slot carries the record's word for how it stands, and
 * the tooltip holds the failure scenario and the cited paths — the two
 * things a reader needs to weigh it, and the one thing (a cited path)
 * that decides whether it can ever be shown remediated.
 */
export function findingDescriptor(node: FindingNode): RowDescriptor {
  const { finding } = node;
  const text = finding.description.trim() || "(no description)";
  const label = `[${finding.severity || "?"}] ${
    text.length > 80 ? `${text.slice(0, 77)}…` : text
  }`;
  const lines = [
    `**[${finding.severity || "?"}] ${text}**`,
    "",
    [
      finding.round !== null ? `Round ${finding.round}` : null,
      finding.category || null,
      finding.disposition || null,
    ]
      .filter(Boolean)
      .join(" · "),
  ];
  if (finding.failureScenario.trim()) {
    lines.push("", finding.failureScenario.trim());
  }
  lines.push(
    "",
    finding.evidencePaths.length > 0
      ? `Cited: ${finding.evidencePaths.join(", ")}`
      : "No path cited — a finding with no site can never be shown remediated.",
  );
  return {
    id: `finding:${node.repository.root}/${node.session.number}/${node.index}`,
    label,
    description: finding.disposition || undefined,
    tooltip: lines.join("\n"),
    contextValue: tokenString([
      NODE_TOKEN.finding,
      `finding-${finding.severity || "unknown"}`,
      ...(finding.blocking ? ["finding-blocking"] : []),
    ]),
    collapsible: "none",
  };
}

/**
 * What a reader sees for each of the six lifecycle rows.
 *
 * The ids on disk are untouched — they are what the plan, the execution
 * record, the CLI and every gate address a phase by, and renaming them to
 * improve a label would be renaming the record to improve the view. This is
 * the operator's own vocabulary over them (csv-model feedback item 16).
 *
 * Two of the six say something the humanized id did not. `Plan` rather
 * than `Declare`, because that is what the row asks for and what a
 * developer looks for; it was `Plan declared` for a while, on the argument
 * that the row ends when the declaration is appended, and the operator
 * ruled (2026-09-06) that the precision confused more than it told. `Test`
 * rather than `Run of record`, because what the row is waiting for is the
 * suite; "run of record" is what the evidence is CALLED, which is a thing
 * the record needs to say and a reader does not.
 */
const LIFECYCLE_ROW_LABELS: Record<string, string> = {
  register: "Register",
  declare: "Plan",
  work: "Work",
  verify: "Verify",
  "run-of-record": "Test",
  close: "Close",
};

/**
 * The row label: the humanized `step_id`, not the intent — a step_id is
 * the identity the plan, the execution record and the CLI all address
 * the step by, and it is short enough for a tree row. The intent is one
 * imperative sentence and belongs in the tooltip, because a row that
 * wraps is not a tree row.
 */
export function taskRowLabel(row: TaskRecord): string {
  if (row.stepId) {
    // A step of the Work phase reads as its own step id: `work:` is how the
    // row says who its parent is, and under that parent it would be a
    // prefix repeated on every child. The lifecycle vocabulary is NOT
    // consulted for one — a plan may legitimately name a step `close`, and
    // it would not mean the lifecycle's Close.
    if (isWorkStepRow(row)) return humanizeStepKey(row.stepId.slice(WORK_STEP_PREFIX.length));
    return LIFECYCLE_ROW_LABELS[row.stepId] ?? humanizeStepKey(row.stepId);
  }
  const intent = row.intent.trim();
  if (intent) {
    return intent.length > 60 ? `${intent.slice(0, 57)}…` : intent;
  }
  return `Step ${row.position + 1}`;
}

/**
 * A derived start time as the row shows it: `12:06-`, local, 24-hour,
 * with a trailing dash marking it a START rather than a completion. No
 * end time (a finished step's end is the next row's start), no date, and
 * nothing at all when there is no parseable start — a raw ISO string in
 * a few-characters-wide slot would be noise; the tooltip carries it.
 */
export function stepStartLabel(startedAt: string | null): string {
  if (!startedAt) return "";
  const when = new Date(startedAt);
  if (Number.isNaN(when.getTime())) return "";
  const hh = String(when.getHours()).padStart(2, "0");
  const mm = String(when.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}-`;
}

/**
 * A task row. Every fact on it is the projection's: the glyph key, the
 * state phrase, and which step is open. Nothing here recomputes the
 * fold — if two rows ever read as in flight for one session, that is a
 * defect in `ledger.open_step`, not a state this renderer can produce.
 */
export function taskDescriptor(node: TaskNode): RowDescriptor {
  const { row } = node;
  const tooltipLines = [`**${taskRowLabel(row)}**`, "", row.state];
  // The full timestamp goes here, where width is free.
  if (row.startedAt) {
    tooltipLines.push(
      "",
      row.isOpen ? `Opened ${row.startedAt}` : `Started ${row.startedAt}`,
    );
  }
  const intent = row.intent.trim();
  if (intent) tooltipLines.push("", intent);

  const started = stepStartLabel(row.startedAt);
  return {
    // Keyed on the step id, which is the row's stable identity — the same
    // one the plan, the execution record and the CLI address it by. It was
    // keyed on `position`, and session 92 made positions move: the lifecycle
    // rows after Work are renumbered as its steps are inserted, so Verify,
    // Test and Close changed identity the moment a work plan was accepted
    // and VS Code dropped the tree's expansion and selection state under the
    // operator mid-session. The position remains the fallback for a row that
    // carries no step id, which is the only case where it is the identity.
    id: `task:${node.repository.root}/${node.session.number}/${row.stepId ?? `#${row.position}`}`,
    label: taskRowLabel(row),
    ...(started ? { description: started } : {}),
    tooltip: tooltipLines.join("\n"),
    icon: { kind: "file", slug: ICON_FILES[row.iconKey] },
    contextValue: tokenString([
      NODE_TOKEN.task,
      `task-${row.iconKey}`,
      ...(row.isOpen ? ["task-open"] : []),
    ]),
    // Collapsed, never expanded, and only when there is something under it:
    // an expander on a Work row with no accepted plan is an invitation to
    // open a row that will say nothing.
    collapsible: workStepNodes(node).length > 0 ? "collapsed" : "none",
  };
}

/**
 * The row that stands in place of a task list the framework could not
 * read. It carries no lifecycle glyph of the plan's — there is no state
 * to show — and says what failed, so the operator repairs the record
 * rather than wondering why a session has no steps.
 */
export function refusalDescriptor(node: RefusalNode): RowDescriptor {
  const tasks = node.subject === "execution record";
  const title = `${sentenceCase(node.subject)} unreadable`;
  return {
    id: `refusal:${node.repository.root}/${node.session.number}/${
      tasks ? "tasks" : "verification"
    }`,
    label: title,
    description: tasks
      ? "cannot tell which step is open"
      : "cannot tell what stopped this session",
    tooltip: [
      `**${title}**`,
      "",
      node.reason,
      "",
      (tasks ? "No task rows are shown. " : "No verification row is shown. ") +
        "A row that failed validation is a refusal, not a skip: showing " +
        "the last row that did parse would present a stale " +
        (tasks ? "step as the current one." : "round as the one that stopped it."),
    ].join("\n"),
    icon: { kind: "file", slug: ICON_FILES.cancelled },
    contextValue: tokenString([NODE_TOKEN.refusal]),
    collapsible: "none",
  };
}

export function descriptorFor(node: WorkExplorerNode): RowDescriptor {
  switch (node.kind) {
    case "repository":
      return repositoryDescriptor(node);
    case "bucket":
      return bucketDescriptor(node);
    case "attention":
      return attentionDescriptor(node);
    case "session":
      return sessionDescriptor(node);
    case "verification":
      return verificationDescriptor(node);
    case "finding":
      return findingDescriptor(node);
    case "task":
      return taskDescriptor(node);
    case "refusal":
      return refusalDescriptor(node);
  }
}

/**
 * One row of what is waiting on the operator, above the sessions.
 *
 * The attention view is the answer to "three new things to look at, in three
 * places, is not an improvement": sessions 38, 39 and 40 each added something
 * worth seeing — planned sessions, stalled runs, task rows — and each of
 * them lived somewhere different. Nothing here is derived. Every row restates
 * a fact the projection already carries, in the place the operator is
 * already looking.
 */
export interface AttentionNode {
  readonly kind: "attention";
  readonly repository: SessionsRepository;
  readonly subject: "stalled" | "unresolved";
  readonly label: string;
  readonly detail: string;
  /** Blocking work, as opposed to merely worth knowing. */
  readonly urgent: boolean;
}

/**
 * What the operator is being waited on for, in the order it costs them.
 *
 * Empty is the ordinary state and renders nothing: a view that always has a
 * row teaches people that its rows mean nothing.
 */
export function attentionNodes(node: RepositoryNode): AttentionNode[] {
  const repository = node.repository;
  const rows: AttentionNode[] = [];

  // The liveness row renders whenever something is in flight, not only when
  // it has gone quiet: "what happened while I was away" is a question about
  // a running session, and answering it only once the session looks stuck
  // leaves the ordinary case blank.
  if (repository.currentSession !== null) {
    const inFlight = repository.sessions.find(
      (session) => session.number === repository.currentSession,
    );
    const named = inFlight
      ? `Session ${inFlight.displayNumber} is in flight`
      : `Session ${repository.currentSession} is in flight`;
    const age = elapsedSince(repository.lastActivityAt);
    // Working or waiting, from the run record: the framework running a
    // verification round or a suite is a fact the row can state, and "last
    // written N ago" alone made a ten-minute round look like a silence.
    // What it still does NOT claim is anything about the thinking -- a
    // waiting session is one the framework is not running, not one that
    // has stopped being useful.
    const working = repository.activity === "working";
    // A job that finished and nobody collected: the row says so in the
    // router's words, which are the same words `dabbler status` and the
    // terminal use, because a wording of the Explorer's own would be a
    // second statement of a rule the driver already owns.
    const finished = repository.activity === "uncollected";
    const state = finished ? "finished, waiting to be collected" : working ? "working" : "waiting";
    rows.push({
      kind: "attention",
      repository,
      subject: "stalled",
      label: repository.possiblyStalled
        ? `${named} — nothing written for ${age ?? "a while"}`
        : `${named} — ${state}`,
      // Deliberately never "stalled" or "stuck". It reports that the record
      // stopped moving; it cannot see whether the thinking is still useful,
      // and a row that implied it could would be making that judgment.
      detail:
        (finished
          ? `${repository.uncollected ?? "The framework's job has finished and nothing has collected its result; the AI's next `dabbler session next` does."} `
          : working
            ? "The framework is running something. "
            : "Nothing is running; the session is between calls. ") +
        (age
          ? `Last written ${age} ago. This is the record moving, not the work.`
          : "Nothing has been written yet."),
      urgent: false,
    });
  }

  // Only the in-flight case is an attention row. It is the one where the
  // operator has to decide what happens next, and suppressing it once hid
  // exactly that. A CLOSED session that stopped at the cap is a note, and
  // notes live under Information (see informationNodes): flagging every
  // closed REMEDIATED_AT_CAP session at the top of the tree read as a
  // standing fault and invited reopening work that later sessions had
  // already built on.
  for (const session of repository.sessions) {
    const view = session.verification;
    if (!view || view.clean || !view.terminal) continue;
    if (session.status !== "in-progress") continue;
    rows.push({
      kind: "attention",
      repository,
      subject: "unresolved",
      label: `Session ${session.displayNumber} — ${view.headline}`,
      detail: "Still in flight, and its verification stopped. Read it before it closes.",
      urgent: true,
    });
  }

  return rows;
}

/**
 * The Information bucket's rows: closed sessions whose verification stopped
 * short of clean. Planning input, read between sessions — never a flag, and
 * never rendered when there are none.
 */
export function informationNodes(node: RepositoryNode): AttentionNode[] {
  const repository = node.repository;
  const rows: AttentionNode[] = [];
  for (const session of sessionsInOrder(repository.sessions).reverse()) {
    const view = session.verification;
    if (!view || view.clean || !view.terminal) continue;
    if (session.status === "in-progress") continue;
    rows.push({
      kind: "attention",
      repository,
      subject: "unresolved",
      label: `Session ${session.displayNumber} — ${view.headline}`,
      detail: "Planning input, not an interruption: read it between sessions.",
      urgent: false,
    });
  }
  return rows;
}

/**
 * The date a finished session closed, as the row shows it: the local
 * calendar date, nothing more. The full timestamp is in the tooltip; a
 * time of day in a few-characters-wide slot would be noise. Empty when
 * there is no parseable close — a not-started session has nothing to say.
 */
export function closeDateLabel(completedAt: string | null): string | undefined {
  if (!completedAt) return undefined;
  const when = new Date(completedAt);
  if (Number.isNaN(when.getTime())) return undefined;
  const yyyy = when.getFullYear();
  const mm = String(when.getMonth() + 1).padStart(2, "0");
  const dd = String(when.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * A bucket row: the label, the count in the description slot (VS Code
 * renders it dimmed, after the label), and the lifecycle glyph the bucket's
 * sessions share. In Progress opens expanded — it is what the operator came
 * to see; the rest open collapsed, which is the whole reason the buckets
 * came back.
 */
export function bucketDescriptor(node: BucketNode): RowDescriptor {
  const spec = BUCKETS.find((b) => b.key === node.bucket);
  const label = spec ? spec.label : node.bucket;
  const count =
    node.bucket === "information" ? node.notes.length : node.sessions.length;
  const noun = node.bucket === "information" ? "note" : "session";
  return {
    id: `bucket:${node.repository.root}/${node.bucket}`,
    label,
    description: String(count),
    tooltip: `**${label}**\n\n${count} ${noun}${count === 1 ? "" : "s"}`,
    icon:
      node.bucket === "information"
        ? { kind: "theme", id: "info" }
        : { kind: "file", slug: ICON_FILES[node.bucket] },
    contextValue: tokenString([NODE_TOKEN.bucket, `bucket-${node.bucket}`]),
    // Never a leaf: an empty bucket is not rendered at all (bucketNodes).
    collapsible: node.bucket === "in-progress" ? "expanded" : "collapsed",
  };
}

/** An attention row, which is a leaf and carries no menu of its own. */
export function attentionDescriptor(node: AttentionNode): RowDescriptor {
  return {
    id: `attention:${node.repository.root}/${node.subject}/${node.label}`,
    label: node.label,
    description: node.detail,
    tooltip: `**${node.label}**\n\n${node.detail}`,
    icon: {
      kind: "theme",
      // Urgency is the icon's whole job here: an operator scanning several
      // projects needs "this one is blocked" to survive peripheral vision.
      id: node.urgent ? "error" : "info",
      color: node.urgent ? "charts.yellow" : undefined,
    },
    contextValue: tokenString([NODE_TOKEN.attention, `attention-${node.subject}`]),
    collapsible: "none",
  };
}

/**
 * How long ago, in the words a person uses.
 *
 * Coarse on purpose: an operator watching several projects wants "about two
 * hours", and a row that said "2h 14m 09s" would be reporting a precision
 * the question does not have.
 */
export function elapsedSince(
  at: string | null,
  now: Date = new Date(),
): string | null {
  if (!at) return null;
  const then = Date.parse(at);
  if (!Number.isFinite(then)) return null;
  const seconds = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (seconds < 90) return "less than 2 minutes";
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hours`;
  return `${Math.round(hours / 24)} days`;
}

// ===========================================================================
// The repository a tree is built from
// ===========================================================================

/**
 * Where a repository's sessions came from. `ledger` is the
 * machine-written record; `plan` is a repository that has been set up
 * and never run, whose sessions are the ones its plan declares — the
 * two setup sessions bootstrap scaffolds, before the first registration
 * writes anything.
 */
export type SessionsSource = ProgressProjectionRepository["sessionsSource"];

/**
 * One repository and the sessions it holds — the Work Explorer's root row.
 *
 * Everything it carries about SESSIONS is the progress reading's answer,
 * typed by its generated types; `workExplorerRepository` is the one place
 * that assembles one.
 *
 * The four file paths are the sessions root's own artifacts. They are
 * the whole Open File surface: a repository has one plan, one activity
 * log, one change log and one ledger, so there is nothing to select
 * between.
 */
export interface SessionsRepository {
  /** Repository root — the spawn cwd. */
  root: string;
  /** `<root>/docs/sessions`. */
  sessionsDir: string;
  /** Display name; `path.basename(root)`. */
  label: string;
  planPath: string;
  activityPath: string;
  changeLogPath: string;
  ledgerPath: string;
  totalSessions: number | null;
  sessionsCompleted: number;
  currentSession: number | null;
  /**
   * What the next `session start` would register, by the router's own rule.
   *
   * Carried rather than recomputed: the rule is "the session in flight if
   * there is one, else the lowest-numbered row that has not run", it spans
   * the ledger AND the plan's rows, and a second reading of it here would
   * offer to start a session the framework would refuse to start.
   */
  nextSession: number | null;
  forceClosed: boolean;
  schemaVersionOnDisk: number | null;
  sessionsSource: SessionsSource;
  invariantViolation: string | null;
  /** Derived liveness: when the record last moved, and whether it stopped. */
  lastActivityAt: string | null;
  possiblyStalled: boolean;
  /**
   * Whether the framework is running something right now.
   *
   * Read from the driven run record through the one rule that answers it,
   * so the Explorer's liveness row and the Dabbler terminal's indicator
   * cannot disagree. Optional because a repository built by hand -- a test,
   * a fixture -- has no run to read.
   */
  activity?: Activity;
  /**
   * The router's words for a job that finished and nobody collected, when
   * `activity` is `uncollected`; the row's detail is these and no wording
   * of the Explorer's own.
   */
  uncollected?: string | null;
  /**
   * The memo the Mechanic left on the session in flight, or null where it
   * left none. Optional for the reason `activity` is.
   */
  mechanicMemo?: string | null;
  orchestrator: OrchestratorInfo | null;
  /**
   * The progress reading's sessions, with tasks populated on the in-flight
   * session only. Empty when the reading was unavailable — the repository
   * row still renders, and the interface says the rendering is degraded
   * rather than guessing statuses that only the router decides.
   */
  sessions: SessionRecord[];
}

export const CHANGE_LOG_FILENAME = "change-log.md";

/** `<root>/docs/sessions`, whether or not it exists. */
export function sessionsDirOf(root: string): string {
  return path.join(root, "docs", SESSIONS_DIRNAME);
}

/**
 * Whether *root* is a repository the Work Explorer has anything to say
 * about: its sessions root holds a machine-written ledger, or a session plan.
 *
 * The plan counts because a bootstrapped repository has one and nothing
 * else — its two setup sessions exist there until the first registration
 * writes a ledger — and a view that showed nothing until then would hide
 * project setup from every repository that most needs it. Presence decides
 * only whether to ASK for the progress reading; which sessions exist and
 * what state each is in are the reading's answers.
 */
export function hasSessionsRoot(root: string): boolean {
  const dir = sessionsDirOf(root);
  return fs.existsSync(path.join(dir, STATE_FILENAME)) || fs.existsSync(path.join(dir, SESSION_PLAN_FILENAME));
}

/** The Mechanic's memo on this session, where the router says it leaves one; null where there is none. */
export function readMechanicMemo(root: string, sessionNumber: number): string | null {
  try {
    const memo = fs.readFileSync(path.join(root, mechanicMemoPath(sessionNumber)), "utf8").trim();
    return memo === "" ? null : memo;
  } catch {
    return null;
  }
}

/**
 * The repository at *root*, from its progress reading -- or from none, where
 * the reading failed: a failed reading is not a fresh repository, so every
 * field is the reading's answer or nothing, and there is no file-presence
 * fallback beside it.
 */
export function workExplorerRepository(
  root: string,
  reading: ProgressProjection | null,
): SessionsRepository {
  const sessionsDir = sessionsDirOf(root);
  const p = reading;
  return {
    root,
    sessionsDir,
    label: path.basename(root),
    planPath: path.join(sessionsDir, SESSION_PLAN_FILENAME),
    activityPath: path.join(sessionsDir, ACTIVITY_LOG_FILENAME),
    changeLogPath: path.join(sessionsDir, CHANGE_LOG_FILENAME),
    ledgerPath: path.join(sessionsDir, STATE_FILENAME),
    totalSessions: p ? p.repository.totalSessions : null,
    sessionsCompleted: p ? p.repository.sessionsCompleted : 0,
    currentSession: p ? p.repository.currentSession : null,
    nextSession: p ? p.repository.nextSession : null,
    lastActivityAt: p ? p.repository.lastActivityAt : null,
    possiblyStalled: p ? p.repository.possiblyStalled : false,
    activity: currentActivity(root),
    uncollected: uncollectedWords(root),
    mechanicMemo: p?.repository.currentSession != null ? readMechanicMemo(root, p.repository.currentSession) : null,
    forceClosed: p ? p.repository.forceClosed : false,
    schemaVersionOnDisk: p ? p.repository.schemaVersionOnDisk : null,
    // "ledger" is what a row with no reading claims, so the never-run copy
    // is only ever shown on a reading that actually said so.
    sessionsSource: p ? p.repository.sessionsSource : "ledger",
    invariantViolation: p ? p.repository.invariantViolation : null,
    orchestrator: p ? p.repository.orchestrator : null,
    sessions: p ? p.sessions : [],
  };
}

// ===========================================================================
// The whole tree, as rows an interface is handed
// ===========================================================================

/** One repository to print: its assembly, and why its reading failed where it did. */
export interface WorkExplorerEntry {
  repository: SessionsRepository;
  error: string | null;
}

/**
 * Each session's line in the session plan, 1-based, by the router's own
 * reading of a section: the line its section starts on. Read once per
 * repository, when the tree is printed, and never on a scan.
 */
function sessionPlanLines(repository: SessionsRepository): Map<number, number> {
  const lines = new Map<number, number>();
  let text: string;
  try {
    text = fs.readFileSync(repository.planPath, "utf8");
  } catch {
    return lines;
  }
  const planLines = text.split(/\r?\n/);
  for (const session of repository.sessions) {
    const heading = planSection(text, session.number)?.split("\n")[0];
    const index = heading === undefined ? -1 : planLines.indexOf(heading);
    if (index >= 0) lines.set(session.number, index + 1);
  }
  return lines;
}

/** Activating a repository row opens its plan; a session row opens it at the session's own section. */
function clickOf(node: WorkExplorerNode, planLines: Map<number, number>): WorkExplorerAction | null {
  if (node.kind !== "repository" && node.kind !== "session") return null;
  const line = node.kind === "session" ? (planLines.get(node.session.number) ?? null) : null;
  return {
    id: node.kind === "repository" ? "dabblerWorkExplorer.activateRepository" : "dabblerWorkExplorer.activateSession",
    title: "Open Session Plan",
    ...opens(node.repository.planPath, line),
  };
}

function rowOf(node: WorkExplorerNode, planLines: Map<number, number>): WorkExplorerRow {
  const descriptor = descriptorFor(node);
  return {
    id: descriptor.id,
    kind: node.kind,
    label: descriptor.label,
    description: descriptor.description ?? null,
    tooltip: descriptor.tooltip ?? null,
    icon: descriptor.icon ?? null,
    collapsible: descriptor.collapsible,
    contextValue: descriptor.contextValue,
    click: clickOf(node, planLines),
    actions: descriptor.actions ?? [],
    children: childrenOf(node).map((child) => rowOf(child, planLines)),
  };
}

/** The whole Work Explorer tree, every level present, for the repositories given. */
export function workExplorerTree(entries: readonly WorkExplorerEntry[]): WorkExplorer {
  const repositories = repositoryNodes(entries.map((entry) => entry.repository)).map((node, index) => {
    const row = rowOf(node, sessionPlanLines(node.repository));
    const error = entries[index]?.error ?? null;
    return error === null ? row : { ...row, error };
  });
  return { schemaVersion: 1, repositories };
}