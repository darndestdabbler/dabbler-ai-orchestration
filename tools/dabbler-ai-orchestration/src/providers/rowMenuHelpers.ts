// The left-click dual-action and the run-prompt gate, pure and
// unit-testable.
//
// These are the decisions the platform does NOT make for us: what
// activating a row should DO, and which session row may offer to start
// a session. They are rules, not renderings, so they live in one place
// and the native row command and the context menu share them.

import { SessionRecord, SessionsRepository } from "../types";

// ----- left-click dual-action decision -----

export interface LeftClickPlan {
  // Always non-null — left-click ALWAYS opens the session plan.
  openCommand: { commandId: string };
  // Present iff the repository still has a session to start.
  clipboardWrite: { text: string; toast: string } | null;
}

/**
 * The framework's trigger phrase. It names no repository, because a
 * session is numbered directly in the one the operator is standing in
 * and there is nothing to disambiguate.
 */
export const START_NEXT_SESSION_PROMPT = "Start the next session.";

export function planLeftClickActivation(
  repository: SessionsRepository,
): LeftClickPlan {
  const openCommand = { commandId: "dabblerSessionSets.openSpec" };
  if (nextRunnableSessionNumber(repository.sessions) === null) {
    return { openCommand, clipboardWrite: null };
  }
  return {
    openCommand,
    clipboardWrite: {
      text: START_NEXT_SESSION_PROMPT,
      toast: `Copied: ${START_NEXT_SESSION_PROMPT}`,
    },
  };
}

/**
 * The number of the session a run prompt would actually start, or `null`
 * when no session in *sessions* is runnable.
 *
 * The ledger is walked in ascending number order. `complete` and
 * `cancelled` sessions are behind us; the FIRST session that is neither
 * is the candidate, because the lifecycle is strictly sequential —
 * `start_session` infers `max(closed) + 1`, so nothing later can be
 * next. The candidate is runnable only if its status is one of the two
 * the framework can act on.
 *
 * FAILS CLOSED in two directions, and the second is the one that is easy
 * to get wrong:
 *
 *   1. an UNRECOGNISED status on or before the candidate — `"completed"`,
 *      `"done"`, a paragraph of prose — says nothing about whether that
 *      session is finished, so treating the next one as runnable would be
 *      a guess;
 *   2. a NUMBER GAP. The projection does not pass unreadable entries
 *      through — it DROPS them (an unrecognised status, a non-integer or
 *      non-positive number), so by the time a ledger reaches this
 *      function the corrupt session may simply be absent, and rule 1
 *      alone would never fire. What a drop leaves behind is a hole in the
 *      numbering: `[1 complete, 3 not-started]` is a ledger whose session
 *      2 the scan refused to render. Sessions are written `1..N` by every
 *      sanctioned writer, so a gap is never legitimate — it means
 *      something was dropped, and the honest answer is that "which
 *      session is next" is unknowable.
 *
 * Only corruption at or BEFORE the candidate matters: a broken session 5
 * has no bearing on whether session 2 is next.
 */
export function nextRunnableSessionNumber(
  sessions: readonly SessionRecord[] | undefined,
): number | null {
  const ordered = [...(sessions ?? [])].sort((a, b) => a.number - b.number);
  let expected = 1;
  for (const session of ordered) {
    if (session.number !== expected) return null;
    expected += 1;
    if (session.status === "complete" || session.status === "cancelled") continue;
    if (session.status === "in-progress" || session.status === "not-started") {
      return session.number;
    }
    return null;
  }
  return null;
}

/**
 * Whether *session* is the one row that may offer the run prompt.
 *
 * The copied text is the framework's trigger phrase, which starts
 * whichever session the router says is next. A prompt offered on session
 * 4 while session 3 is next would start a DIFFERENT session than the row
 * it came from, so only the next runnable row carries it.
 */
export function sessionOffersRunPrompt(
  repository: SessionsRepository,
  session: SessionRecord,
): boolean {
  return nextRunnableSessionNumber(repository.sessions) === session.number;
}

/**
 * Whether *session* is one the operator acts on at planning time: its
 * rounds ledger folded to a TERMINAL state that is not clean. Python
 * decided both; this only asks. A loop still open (no terminal yet) is
 * rendered but not acted on — offering "send back" against a round the
 * engine is still answering would race the engine. A refused ledger does
 * not qualify either: there is nothing readable to send back or respecify
 * against, and the refusal row already says what is wrong.
 */
export function sessionNeedsReading(session: SessionRecord): boolean {
  const view = session.verification;
  return view !== null && view.terminal !== null && !view.clean;
}

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
