// The Work Explorer's native-tree view model.
//
// PURE. No vscode import: everything here is a plain data transform from
// the projection-backed repository scan onto row DESCRIPTORS, which
// WorkExplorerTreeProvider converts into real TreeItems. Status facts
// (glyph keys, the active step) are the projection's — this module
// arranges them and never re-derives them.
//
// Three load-bearing display constraints:
//   1. Sessions render as ONE ordered list, never bucketed by status.
//      They are a numbered sequence, and the zero-padded number down the
//      left edge is how the operator reads it; grouping by status would
//      put session 015 above session 001 and destroy exactly that.
//   2. Row icons consistently communicate lifecycle status; severity (an
//      unclean verdict, an invariant violation) lives in the tooltip and
//      contextValue.
//   3. At most two inline actions per row, enforced in package.json and
//      asserted by the menu-registry test.

import {
  SessionRecord,
  SessionStatus,
  SessionsRepository,
  StepRecord,
} from "../types";
import {
  REPOSITORY_ACTIONS,
  RepositoryAction,
  SESSION_ACTIONS,
  SessionAction,
} from "./ActionRegistry";
import {
  ICON_FILES,
  progressText,
  sessionRowLabel,
  sessionsInOrder,
  verdictIsUnclean,
} from "./sessionsModel";
import { isRecognizedVerdictToken } from "../utils/verdictTokens";

// ---------------------------------------------------------------------------
// Nodes: repository -> session -> step
// ---------------------------------------------------------------------------

/**
 * SessionNode and StepNode both expose a `repository` property ON
 * PURPOSE: every row command reads its target off the node, and a node
 * shaped this way is accepted by the whole command surface with no
 * adapter.
 */
export type WorkExplorerNode = RepositoryNode | SessionNode | StepNode;

export interface RepositoryNode {
  readonly kind: "repository";
  readonly repository: SessionsRepository;
}

export interface SessionNode {
  readonly kind: "session";
  readonly repository: SessionsRepository;
  readonly session: SessionRecord;
}

/**
 * One step of the in-flight session. `position` is the row's index in
 * the projected list and makes the TreeItem.id unique: two steps can
 * legitimately share a stepKey (a logged step that claimed no planned
 * row appends alongside one that did).
 */
export interface StepNode {
  readonly kind: "step";
  readonly repository: SessionsRepository;
  readonly session: SessionRecord;
  readonly row: StepRecord;
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
 * The second level, ordered by session number ascending — the order the
 * ledger is written and the order the work runs. A repository whose
 * projection was unavailable yields no session rows, which is why
 * RepositoryNode reports itself collapsible only when it has sessions.
 */
export function sessionNodes(node: RepositoryNode): SessionNode[] {
  return sessionsInOrder(node.repository.sessions).map((session) => ({
    kind: "session",
    repository: node.repository,
    session,
  }));
}

/**
 * The third level: the in-flight session's steps, exactly as the
 * projection lists them. Empty for every session that is not in flight
 * and whenever the projection carried no steps — degrading to no
 * children is the requirement; a stale or invented list is worse than an
 * empty one.
 */
export function stepNodes(node: SessionNode): StepNode[] {
  return node.session.steps.map((row) => ({
    kind: "step",
    repository: node.repository,
    session: node.session,
    row,
  }));
}

export function childrenOf(node: WorkExplorerNode): WorkExplorerNode[] {
  switch (node.kind) {
    case "repository":
      return sessionNodes(node);
    case "session":
      return stepNodes(node);
    case "step":
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
export type IconSpec =
  | { kind: "theme"; id: string; color?: string }
  | { kind: "file"; slug: string };

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
  collapsible: "none" | "collapsed";
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
  session: "dabblerSession",
  step: "dabblerStep",
} as const;

/**
 * The contextValue token for one registry action, derived from the
 * command id so a new registry entry cannot be added without the
 * registry test noticing that no menu contribution matches it.
 */
export function actionToken(action: RepositoryAction | SessionAction): string {
  return `act-${action.id.replace(/^dabbler(SessionSets)?\./, "").replace(/\./g, "-")}`;
}

// ---------------------------------------------------------------------------
// Severity (tooltip + contextValue only; the icon slot stays lifecycle)
// ---------------------------------------------------------------------------

export type SessionSeverity = "verification" | null;

export { verdictIsUnclean } from "./sessionsModel";

/**
 * What a session row must not render as clean. A verdict the framework
 * never issued, or one that issued and did not pass, outranks the row's
 * lifecycle glyph in the tooltip — a complete session with an unclean
 * verdict is still complete, and still not proof of anything.
 */
export function severityOf(session: SessionRecord): SessionSeverity {
  return verdictIsUnclean(session.verificationVerdict) ? "verification" : null;
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
  const orchestrator = repository.orchestrator;
  if (orchestrator && (orchestrator.engine || orchestrator.model)) {
    markers.push(
      `Driven by ${[orchestrator.engine, orchestrator.model]
        .filter(Boolean)
        .join(" / ")}.`,
    );
  }
  if (repository.invariantViolation) {
    markers.push(`State invariant violation: ${repository.invariantViolation}`);
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
  for (const action of REPOSITORY_ACTIONS) {
    if (action.when(repository)) tokens.push(actionToken(action));
  }
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
  };
}

function sessionTooltip(node: SessionNode): string {
  const { session } = node;
  const lines = [
    `**${sessionRowLabel(session)}**`,
    "",
    session.status.replace("-", " "),
  ];
  const verdict = session.verificationVerdict;
  if (typeof verdict === "string" && verdict.trim() !== "") {
    lines.push(
      "",
      isRecognizedVerdictToken(verdict)
        ? `Verification: ${verdict}`
        : `Verification: "${verdict}" is not a recognized verdict`,
    );
  }
  if (session.completedAt) {
    lines.push("", `_closed ${session.completedAt}_`);
  } else if (session.startedAt) {
    lines.push("", `_started ${session.startedAt}_`);
  }
  if (session.steps.length > 0) {
    lines.push(
      "",
      `${session.steps.length} step${session.steps.length === 1 ? "" : "s"}`,
    );
  }
  return lines.join("\n");
}

export function sessionDescriptor(node: SessionNode): RowDescriptor {
  const { repository, session } = node;
  const tokens: string[] = [NODE_TOKEN.session, `session-${session.status}`];
  const severity = severityOf(session);
  if (severity) tokens.push(`severity-${severity}`);
  for (const action of SESSION_ACTIONS) {
    if (action.when(repository, session)) tokens.push(actionToken(action));
  }
  return {
    id: `session:${repository.root}/${session.number}`,
    label: sessionRowLabel(session),
    // Short labels, so a description survives truncation here. Only the
    // in-flight session says anything — quiet is the default state.
    description: session.status === "in-progress" ? "in flight" : undefined,
    tooltip: sessionTooltip(node),
    icon: sessionIcon(session.iconKey),
    contextValue: tokenString(tokens),
    // Collapsed only when there is something under it: every session
    // that is not in flight (and an in-flight one whose activity log is
    // absent) is a leaf.
    collapsible: session.steps.length > 0 ? "collapsed" : "none",
  };
}

/** "verify-changes" / "verify_changes" -> "Verify changes". */
export function humanizeStepKey(key: string): string {
  const words = key.replace(/[-_]+/g, " ").trim();
  if (!words) return key;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The row label: the humanized stepKey, not the description —
 * descriptions are audit-trail prose that routinely runs to several
 * sentences, and a tree row that wraps is not a tree row. The full text
 * is in the tooltip.
 */
export function stepRowLabel(row: StepRecord): string {
  if (row.stepKey) return humanizeStepKey(row.stepKey);
  const description = row.description.trim();
  if (description) {
    return description.length > 60 ? `${description.slice(0, 57)}…` : description;
  }
  return typeof row.stepNumber === "number"
    ? `Step ${row.stepNumber}`
    : `Step ${row.position + 1}`;
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
 * A step row. The ICON is the projection's own glyph key — the same
 * authored lifecycle assets the session rows use; the projection already
 * resolved the effective status (including the derived active step), so
 * this renderer never re-derives it.
 */
export function stepDescriptor(node: StepNode): RowDescriptor {
  const { row } = node;
  const tooltipLines = [`**${stepRowLabel(row)}**`];
  const state = row.isActive
    ? "in progress — derived from the plan, not yet logged"
    : row.isPlanned && row.iconKey === "not-started"
      ? "planned — not started"
      : row.state || String(row.status || "unknown").replace(/[-_]/g, " ");
  tooltipLines.push("", state);
  // The full timestamp goes here, where width is free. A derived-active
  // row's time is when it became the current step (inferred), not a
  // logged start.
  if (row.startedAt) {
    tooltipLines.push(
      "",
      row.isActive
        ? `Current since ${row.startedAt}`
        : `Started ${row.startedAt}`,
    );
  }
  const description = row.description.trim();
  if (description) tooltipLines.push("", description);

  const started = stepStartLabel(row.startedAt);
  return {
    id: `step:${node.repository.root}/${node.session.number}/${row.position}`,
    label: stepRowLabel(row),
    ...(started ? { description: started } : {}),
    tooltip: tooltipLines.join("\n"),
    icon: { kind: "file", slug: ICON_FILES[row.iconKey] },
    contextValue: tokenString([
      NODE_TOKEN.step,
      `step-${row.iconKey}`,
      row.isPlanned ? "step-planned" : "step-logged",
      ...(row.isActive ? ["step-active"] : []),
    ]),
    collapsible: "none",
  };
}

export function descriptorFor(node: WorkExplorerNode): RowDescriptor {
  switch (node.kind) {
    case "repository":
      return repositoryDescriptor(node);
    case "session":
      return sessionDescriptor(node);
    case "step":
      return stepDescriptor(node);
  }
}
