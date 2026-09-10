// Pure data-layer helpers shared by the tree model: the status icon map,
// row naming, progress text, and the verdict-cleanliness rule. No vscode
// import.

import type {
  ProgressProjectionSession as SessionRecord,
  ProgressProjectionSessionStatus as SessionStatus,
} from "dabbler-ai-router";
import type { SessionsRepository } from "../utils/fileSystem";
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

/**
 * Where the session runs, in the row's words: `focused: persister` or
 * `global`, as the projection carries it from the plan's section or the
 * row's checkout; null where the projection says nothing, which is every
 * row of a single-module repository.
 */
export function sessionKindLabel(session: SessionRecord): string | null {
  if (session.kind === "focused") return `focused: ${session.module ?? "?"}`;
  if (session.kind === "global") return "global";
  return null;
}

/** Sessions in ledger order — ascending by number, the order they run. */
export function sessionsInOrder(
  sessions: readonly SessionRecord[],
): SessionRecord[] {
  return [...sessions].sort((a, b) => a.number - b.number);
}

/**
 * The module a session runs on, or null when it runs on the repository.
 *
 * `kind` and `module` are the projection's own answer, computed from the
 * `checkout` the start wrote on the row and from the plan before that.
 * `modules` is a different fact -- everything the session declared it
 * touched -- and reading its first entry as "the module" filed a global
 * planning session that named four of them under whichever came first.
 */
export function moduleOf(session: SessionRecord): string | null {
  return session.kind === "focused" && typeof session.module === "string" && session.module !== ""
    ? session.module
    : null;
}

/**
 * The sessions a root is allowed to show: in the repository, all of them;
 * in a module's focused checkout, the ones that RUN there.
 *
 * A checkout exists to hold one module's work, and `session start` refuses
 * every other session in it -- a global one belongs to the repository, and
 * another module's belongs to another folder. The record stays whole, and
 * only the reading narrows: `startableHere` still needs the next session's
 * row to withhold the launcher for the right reason rather than because it
 * could not find one.
 */
export function sessionsHere(repository: SessionsRepository): SessionRecord[] {
  const slug = repository.checkoutModule;
  if (slug === null) return [...repository.sessions];
  return repository.sessions.filter((session) => moduleOf(session) === slug);
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
 *
 * A module's checkout counts its own work. The projection's totals are the
 * repository's, and "2/6" in a folder that can run one of those six answers
 * a question nobody standing in it asked.
 */
export function progressText(repository: SessionsRepository): string {
  const slug = repository.checkoutModule;
  const mine = sessionsHere(repository);
  if (repository.sessionsSource === "plan") {
    return `${mine.length} planned · nothing has run here yet`;
  }
  if (slug !== null) {
    const done = mine.filter((session) => session.status === "complete").length;
    return mine.length === 0 ? `no session runs on ${slug}` : `${done}/${mine.length} on ${slug}`;
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
