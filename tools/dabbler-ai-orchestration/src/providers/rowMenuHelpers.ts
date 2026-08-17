// The L5 left-click dual-action, pure and unit-testable.
//
// Set 110 Session 3: this module used to also hold the two-step QuickPick
// item builders (`buildTopLevelItems` / `buildSubmenuItems`) that the
// webview's hand-drawn right-click menu needed. VS Code renders a real
// hierarchical menu from `contributes.submenus` now, so the item builders
// and their `TopLevelPickItem` / `SubmenuPickItem` types went with it.
//
// What survives is the one decision the platform does NOT make for us: what
// activating a set row should DO. That is shared by the native row command
// so the behaviour cannot drift.
//
// Set 115 Session 3 adds the session-row sibling of that decision — WHICH
// session row may offer the run prompt — for the same reason and in the
// same place: it is a rule, not a rendering, and it has to agree with the
// set row's answer.

import { SessionRecord, SessionSet } from "../types";

// ----- L5 left-click dual-action decision -----

export interface LeftClickPlan {
  // Always non-null when the row resolved — left-click ALWAYS opens
  // spec.md (preserved S4 default).
  openCommand: { commandId: string; setName: string };
  // Present iff the row's state is non-terminal AND the L5 clipboard
  // shortcut should fire (`Start the next session of \`<slug>\`.`).
  clipboardWrite: { text: string; toast: string } | null;
}

// `state` is typed as the closed `SessionState` union in `types.ts`,
// but we use a positive `in-progress | not-started` check rather
// than a negative `complete | cancelled` check so that any future
// state value (a schema migration introducing e.g. "archived") FAILS
// CLOSED — the unknown state would skip the clipboard shortcut
// rather than fire on a bucket the operator never approved for L5.
export function planLeftClickActivation(
  setName: string,
  state: "in-progress" | "not-started" | "complete" | "cancelled",
): LeftClickPlan {
  const openCommand = { commandId: "dabblerSessionSets.openSpec", setName };
  if (state !== "in-progress" && state !== "not-started") {
    return { openCommand, clipboardWrite: null };
  }
  const sanitized = setName.replace(/`/g, "'");
  return {
    openCommand,
    clipboardWrite: {
      text: `Start the next session of \`${sanitized}\`.`,
      toast: `Copied: Start the next session of ${setName}`,
    },
  };
}

// ----- Set 115 S3: which session row may offer the run prompt -----

/**
 * The number of the session a run prompt would actually start, or `null`
 * when no session in *sessions* is runnable.
 *
 * The ledger is walked in ascending number order. `complete` and
 * `cancelled` sessions are behind us; the FIRST session that is neither is
 * the candidate, because the lifecycle is strictly sequential —
 * `start_session` infers `max(closed) + 1`, so nothing later can be next.
 * The candidate is runnable only if its status is one of the two the
 * framework can act on.
 *
 * FAILS CLOSED in two directions, and the second is the one that is easy
 * to get wrong:
 *
 *   1. an UNRECOGNISED status on or before the candidate — `"completed"`,
 *      `"done"`, a paragraph of prose — says nothing about whether that
 *      session is finished, so treating the next one as runnable would be
 *      a guess;
 *   2. a NUMBER GAP. `normalizeLedgerSessions` does not pass unreadable
 *      entries through — it DROPS them (an unrecognised status, a
 *      non-integer or non-positive number), so by the time a ledger
 *      reaches this function the corrupt session may simply be absent, and
 *      rule 1 alone would never fire. What a drop leaves behind is a hole
 *      in the numbering: `[1 complete, 3 not-started]` is a ledger whose
 *      session 2 the scan refused to render. Sessions are written `1..N`
 *      by every sanctioned writer (`_build_sessions_array`, the
 *      extension's `buildSessions`, `inferStateInMemory`), so a gap is
 *      never legitimate — it means something was dropped, and the honest
 *      answer is that "which session is next" is unknowable.
 *
 * Only corruption at or BEFORE the candidate matters: a broken session 5
 * has no bearing on whether session 2 is next.
 *
 * `null` — no row in the set offers the prompt — is the honest answer, and
 * the operator still has the set row's own shortcut.
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
 * Whether *session* is the one row in *set* that may offer the run prompt.
 *
 * Two gates, and the set-level one is BORROWED rather than restated:
 * `planLeftClickActivation` already decides whether a set is in a state
 * worth starting (and fails closed on an unrecognised state), so a
 * complete or cancelled set offers nothing here for the same reason its
 * own row copies nothing. The session-level gate is `this row is the next
 * runnable session`.
 *
 * Why not simply "any non-terminal session": the copied text is the
 * framework's set-scoped trigger phrase, so a prompt offered on session 4
 * while session 3 is next would start a DIFFERENT session than the row it
 * came from. See `decisions.jsonl` (Set 115, session 3).
 */
export function sessionOffersRunPrompt(
  set: SessionSet,
  session: SessionRecord,
): boolean {
  if (planLeftClickActivation(set.name, set.state).clipboardWrite === null) {
    return false;
  }
  return nextRunnableSessionNumber(set.sessions) === session.number;
}
