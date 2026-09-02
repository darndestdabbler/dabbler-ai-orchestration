// Row-level rules the platform does not make for us, pure and
// unit-testable, shared by the native row command and the context menu.

import type {
  ProgressProjectionSession as SessionRecord,
} from "dabbler-ai-router";

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
