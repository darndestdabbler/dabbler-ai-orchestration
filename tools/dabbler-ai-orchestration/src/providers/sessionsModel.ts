// Pure data-layer helpers shared by the tree model: the status icon map,
// row naming, progress text, and the verdict-cleanliness rule. No vscode
// import.

import { SessionRecord, SessionStatus, SessionsRepository } from "../types";
import { isRecognizedVerdictToken } from "../utils/verdictTokens";

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
 */
export function progressText(repository: SessionsRepository): string {
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
  const annotation = `session ${written} in flight`;
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
