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

import type {
  ProgressProjectionSession as SessionRecord,
  ProgressProjectionSessionStatus as SessionStatus,
  ProgressProjectionVerification as SessionVerification,
  ProgressProjectionTask as TaskRecord,
  ProgressProjectionFinding as VerificationFinding,
} from "dabbler-ai-router";
import type { SessionsRepository } from "../utils/fileSystem";
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
 * Every node exposes a `repository` property ON PURPOSE: every row
 * command reads its target off the node, and a node shaped this way is
 * accepted by the whole command surface with no adapter.
 */
export type WorkExplorerNode =
  | RepositoryNode
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
  return node.session.tasks.map((row) => ({
    kind: "task",
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
      return [...attentionNodes(node), ...sessionNodes(node)];
    case "session":
      // What stopped the session reads above what it was doing: the
      // verification row first, then the tasks.
      return [...verificationNodes(node), ...taskNodes(node)];
    case "verification":
      return findingNodes(node);
    case "finding":
    case "task":
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
export function actionToken(action: RepositoryAction | SessionAction): string {
  return `act-${action.id.replace(/^dabbler(SessionSets)?\./, "").replace(/\./g, "-")}`;
}

// ---------------------------------------------------------------------------
// Severity (tooltip + contextValue only; the icon slot stays lifecycle)
// ---------------------------------------------------------------------------

export type SessionSeverity = "verification" | "record" | null;

export { verdictIsUnclean } from "./sessionsModel";

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
  if (session.verificationRefused) {
    lines.push("", `Rounds ledger unreadable: ${session.verificationRefused}`);
  }
  if (session.tasksRefused) {
    lines.push("", `Execution record unreadable: ${session.tasksRefused}`);
  } else if (session.tasks.length > 0) {
    const done = session.tasks.filter((t) => t.iconKey === "complete").length;
    lines.push("", `${done}/${session.tasks.length} tasks done`);
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
  for (const action of SESSION_ACTIONS) {
    if (action.when(repository, session)) tokens.push(actionToken(action));
  }
  return {
    id: `session:${repository.root}/${session.number}`,
    label: sessionRowLabel(session),
    // Short labels, so a description survives truncation here. Two states
    // say anything at all — quiet is the default. "planned" is a session the
    // plan declares that the ledger has not reached: it shares the
    // not-started glyph deliberately, so the word is the only thing that
    // distinguishes the two and it has to be on the row.
    description:
      session.status === "in-progress"
        ? "in flight"
        : session.status === "planned"
          ? "planned"
          : undefined,
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

/** "verify-changes" / "verify_changes" -> "Verify changes". */
export function humanizeStepKey(key: string): string {
  const words = key.replace(/[-_]+/g, " ").trim();
  if (!words) return key;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The row label: the humanized `step_id`, not the intent — a step_id is
 * the identity the plan, the execution record and the CLI all address
 * the step by, and it is short enough for a tree row. The intent is one
 * imperative sentence and belongs in the tooltip, because a row that
 * wraps is not a tree row.
 */
export function taskRowLabel(row: TaskRecord): string {
  if (row.stepId) return humanizeStepKey(row.stepId);
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
    id: `task:${node.repository.root}/${node.session.number}/${row.position}`,
    label: taskRowLabel(row),
    ...(started ? { description: started } : {}),
    tooltip: tooltipLines.join("\n"),
    icon: { kind: "file", slug: ICON_FILES[row.iconKey] },
    contextValue: tokenString([
      NODE_TOKEN.task,
      `task-${row.iconKey}`,
      ...(row.isOpen ? ["task-open"] : []),
    ]),
    collapsible: "none",
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
 * worth seeing — planned sessions, owed decisions, task rows — and each of
 * them lived somewhere different. Nothing here is derived. Every row restates
 * a fact the projection already carries, in the place the operator is
 * already looking.
 */
export interface AttentionNode {
  readonly kind: "attention";
  readonly repository: SessionsRepository;
  readonly subject: "owed" | "stalled" | "unresolved";
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

  for (const owed of repository.owedDecisions ?? []) {
    rows.push({
      kind: "attention",
      repository,
      subject: "owed",
      label: owed.question,
      // The blocking one says what it costs; the advisory one says what
      // happens if it is never answered, which is the honest reason it is
      // safe to ignore.
      detail: owed.blocking
        ? "Holds the close until you answer it"
        : owed.onNoAnswer || "Waiting on you",
      urgent: owed.blocking,
    });
  }

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
    rows.push({
      kind: "attention",
      repository,
      subject: "stalled",
      label: repository.possiblyStalled
        ? `${named} — nothing written for ${age ?? "a while"}`
        : named,
      // Deliberately never "stalled" or "stuck". It reports that the record
      // stopped moving; it cannot see whether the thinking is still useful,
      // and a row that implied it could would be making that judgment.
      detail: age
        ? `Last written ${age} ago. This is the record moving, not the work.`
        : "Nothing has been written yet.",
      urgent: false,
    });
  }

  for (const session of repository.sessions) {
    const view = session.verification;
    if (!view || view.clean || !view.terminal) continue;
    // An in-flight session that stopped at the cap is the MOST worth saying:
    // suppressing it hid the one case where the operator has to decide what
    // happens next.
    rows.push({
      kind: "attention",
      repository,
      subject: "unresolved",
      label: `Session ${session.displayNumber} — ${view.headline}`,
      detail:
        session.status === "in-progress"
          ? "Still in flight, and its verification stopped. Read it before it closes."
          : "Planning input, not an interruption: read it between sessions.",
      urgent: session.status === "in-progress",
    });
  }

  return rows;
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
