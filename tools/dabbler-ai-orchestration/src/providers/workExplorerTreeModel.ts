// The Work Explorer's native-tree view model.
//
// PURE. No vscode import: everything here is a plain data transform from
// the projection-backed SessionSet scan onto row DESCRIPTORS, which
// WorkExplorerTreeProvider converts into real TreeItems. Status facts
// (buckets, glyph keys, active step) are the projection's — this module
// arranges them and never re-derives them.
//
// Three load-bearing display constraints:
//   1. Set rows carry NO description — every real set name truncates at
//      working panel width, so a description-borne fraction would be
//      invisible exactly when it mattered. Progress reads from the
//      session rows and the tooltip.
//   2. Row icons consistently communicate lifecycle status; marker
//      severity (blocked, unclean verdict, duplicate name) lives in the
//      tooltip and contextValue.
//   3. At most two inline actions per row, enforced in package.json and
//      asserted by the menu-registry test.

import {
  SessionRecord,
  SessionSet,
  SessionState,
  SessionStatus,
  StepRecord,
} from "../types";
import {
  ROW_ACTIONS,
  RowAction,
  SESSION_ACTIONS,
  SessionAction,
} from "./ActionRegistry";
import {
  ICON_FILES,
  VisibleModule,
  blockedMarker,
  blockedTooltip,
  forceClosedBadge,
  kindTooltip,
  orderedBuckets,
  touchedDate,
  verdictIsUnclean,
} from "./SessionSetsModel";
import { isRecognizedVerdictToken } from "../utils/verdictTokens";

// ---------------------------------------------------------------------------
// Nodes: module -> status bucket -> session set -> session -> step
// ---------------------------------------------------------------------------

/**
 * SetNode, SessionNode and StepNode all expose a `set` property ON
 * PURPOSE: every row command reads `item.set`, so a node shaped this way
 * is accepted by the whole command surface with no adapter.
 */
export type WorkExplorerNode =
  | ModuleNode
  | BucketNode
  | SetNode
  | SessionNode
  | StepNode;

export interface ModuleNode {
  readonly kind: "module";
  readonly module: VisibleModule;
  /** True when at least one DECLARED module is visible anywhere in the tree. */
  readonly declaredModulesExist: boolean;
}

export interface BucketNode {
  readonly kind: "bucket";
  /** Identifies the owning module so sibling buckets stay distinct. */
  readonly moduleKey: string;
  readonly bucketKey: SessionState;
  readonly label: string;
  readonly sets: readonly SessionSet[];
}

export interface SetNode {
  readonly kind: "set";
  readonly set: SessionSet;
}

export interface SessionNode {
  readonly kind: "session";
  readonly set: SessionSet;
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
  readonly set: SessionSet;
  readonly session: SessionRecord;
  readonly row: StepRecord;
}

/** Stable identity for a module across refreshes. */
export function moduleKeyOf(module: VisibleModule): string {
  return `${module.kind}:${module.slug ?? ""}`;
}

/**
 * Translate a command argument into the `preselectedSlug` option the
 * module flows accept. `undefined` when the argument is not a module
 * node (the Command Palette case — those flows keep their own QuickPick).
 */
export function preselectFromTreeNode(
  arg: unknown,
): { preselectedSlug: string } | undefined {
  if (arg === null || typeof arg !== "object") return undefined;
  const node = arg as Partial<ModuleNode>;
  if (node.kind !== "module" || !node.module) return undefined;
  return { preselectedSlug: node.module.slug ?? "" };
}

// ---------------------------------------------------------------------------
// Children — one function per level, each called only on expand
// ---------------------------------------------------------------------------

export function moduleNodes(modules: readonly VisibleModule[]): ModuleNode[] {
  const declaredModulesExist = modules.some((m) => m.kind === "declared");
  return modules.map((module) => ({ kind: "module", module, declaredModulesExist }));
}

export function bucketNodes(node: ModuleNode): BucketNode[] {
  return orderedBuckets([...node.module.sets]).map((bucket) => ({
    kind: "bucket",
    moduleKey: moduleKeyOf(node.module),
    bucketKey: bucket.key,
    label: bucket.label,
    sets: bucket.sets,
  }));
}

export function setNodes(node: BucketNode): SetNode[] {
  return node.sets.map((set) => ({ kind: "set", set }));
}

/**
 * The fourth level, ordered by session number ascending — the order the
 * ledger is written. A set whose projection was unavailable yields no
 * session rows, which is why SetNode reports itself collapsible only
 * when it has sessions.
 */
export function sessionNodes(node: SetNode): SessionNode[] {
  return [...node.set.sessions]
    .sort((a, b) => a.number - b.number)
    .map((session) => ({ kind: "session", set: node.set, session }));
}

/**
 * The fifth level: the in-flight session's steps, exactly as the
 * projection lists them. Empty for every session that is not in flight
 * and whenever the projection carried no steps — degrading to no
 * children is the requirement; a stale or invented list is worse than an
 * empty one.
 */
export function stepNodes(node: SessionNode): StepNode[] {
  return node.session.steps.map((row) => ({
    kind: "step",
    set: node.set,
    session: node.session,
    row,
  }));
}

export function childrenOf(node: WorkExplorerNode): WorkExplorerNode[] {
  switch (node.kind) {
    case "module":
      return bucketNodes(node);
    case "bucket":
      return setNodes(node);
    case "set":
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
   * poll) would fold the tree up under the operator, and repeated
   * bucket labels would collide.
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
  module: "dabblerModule",
  bucket: "dabblerBucket",
  set: "dabblerSet",
  session: "dabblerSession",
  step: "dabblerStep",
} as const;

/** Module-row capability tokens. */
export const MODULE_TOKEN = {
  declared: "module-declared",
  fallback: "module-fallback",
  pseudo: "module-pseudo",
} as const;

/**
 * The contextValue token for one registry action, derived from the
 * command id so a new registry entry cannot be added without the
 * registry test noticing that no menu contribution matches it.
 */
export function actionToken(action: RowAction | SessionAction): string {
  return `act-${action.id.replace(/^dabbler(SessionSets)?\./, "").replace(/\./g, "-")}`;
}

// ---------------------------------------------------------------------------
// Severity (tooltip + contextValue only; the icon slot stays lifecycle)
// ---------------------------------------------------------------------------

export type SetSeverity =
  | "blocked"
  | "verification"
  | "invariant"
  | "duplicate-name"
  | null;

export { verdictIsUnclean } from "./SessionSetsModel";

export function severityOf(set: SessionSet): SetSeverity {
  if (blockedMarker(set) !== "") return "blocked";
  if (verdictIsUnclean(set.verificationVerdict)) return "verification";
  if (set.invariantViolation) return "invariant";
  if (set.duplicateNameError) return "duplicate-name";
  return null;
}

export function setIcon(set: SessionSet): IconSpec {
  return { kind: "file", slug: ICON_FILES[set.state] };
}

export function sessionIcon(status: SessionStatus): IconSpec {
  return { kind: "file", slug: ICON_FILES[status] };
}

// ---------------------------------------------------------------------------
// Descriptors, one per node kind
// ---------------------------------------------------------------------------

const MODULE_WARNING_TEXT: Record<string, string> = {
  "manifest-missing": "No `docs/modules.yaml` in this root — these sets are ungrouped.",
  "manifest-invalid":
    "`docs/modules.yaml` is invalid; showing the last good module tree. Fix the file by hand.",
  "unstamped-sets": "Some sets carry no `module:` attribution.",
  "undeclared-slug": "This module is stamped on sets but is not declared in `docs/modules.yaml`.",
};

export function moduleDescriptor(node: ModuleNode): RowDescriptor {
  const { module } = node;
  const setCount = module.sets.length;
  const warning = module.warning;
  const tokens: string[] = [NODE_TOKEN.module];
  if (module.kind === "declared") {
    tokens.push(MODULE_TOKEN.declared);
  } else if (module.kind === "pseudo") {
    tokens.push(MODULE_TOKEN.pseudo);
  } else {
    // Fallback: an undeclared slug observed on sets. It renders (never
    // hide work) but offers no target-specific actions — there is no
    // manifest entry behind it.
    tokens.push(MODULE_TOKEN.fallback);
  }

  const tooltipLines = [
    `**${module.displayName}**`,
    "",
    `${setCount} session set${setCount === 1 ? "" : "s"}`,
  ];
  if (warning) {
    tooltipLines.push("", `$(warning) ${MODULE_WARNING_TEXT[warning.code] ?? warning.code}`);
  }

  return {
    id: `module:${moduleKeyOf(module)}`,
    label: module.displayName,
    description: `${setCount} set${setCount === 1 ? "" : "s"}`,
    tooltip: tooltipLines.join("\n"),
    // Module rows are structural; lifecycle glyphs belong to buckets,
    // sets and sessions rather than competing with the module name.
    icon: undefined,
    contextValue: tokenString(tokens),
    collapsible: "collapsed",
  };
}

export function bucketDescriptor(node: BucketNode): RowDescriptor {
  const count = node.sets.length;
  return {
    // Scoped by module: "In Progress" exists under every module row.
    id: `bucket:${node.moduleKey}/${node.bucketKey}`,
    label: node.label,
    description: `${count} set${count === 1 ? "" : "s"}`,
    icon: { kind: "file", slug: ICON_FILES[node.bucketKey] },
    contextValue: tokenString([NODE_TOKEN.bucket, `bucket-${node.bucketKey}`]),
    // The three default buckets render even when EMPTY — a declared
    // module with no work yet still shows where that work will land.
    // But an empty one is a LEAF: a twisty that opens onto nothing is a
    // dead affordance.
    collapsible: count > 0 ? "collapsed" : "none",
  };
}

/**
 * Everything the row cannot show inline, in full, as markdown: the row
 * shows one icon, the tooltip shows all of it.
 */
export function setTooltip(set: SessionSet): string {
  const lines: string[] = [`**${set.name}**`];

  const progress =
    set.totalSessions && set.totalSessions > 0
      ? `${set.sessionsCompleted}/${set.totalSessions}`
      : `${set.sessionsCompleted}/?`;
  const state = set.state.replace("-", " ");
  lines.push("", `${state} · ${progress} sessions complete`);

  const markers: string[] = [];
  const blocked = blockedTooltip(set);
  if (blocked) markers.push(blocked);
  const verdict = set.verificationVerdict;
  if (typeof verdict === "string" && verdict.trim() !== "") {
    markers.push(
      isRecognizedVerdictToken(verdict)
        ? `Verification: ${verdict}`
        : `Verification: "${verdict}" is not a recognized verdict`,
    );
  }
  if (set.invariantViolation) {
    markers.push(`State invariant violation: ${set.invariantViolation}`);
  }
  if (set.duplicateNameError) {
    markers.push(
      `Duplicate session-set name in ${set.duplicateNameError.conflictingDirs.length} ` +
        `locations. Showing ${set.duplicateNameError.chosenDir}; rename one copy.`,
    );
  }
  const kind = kindTooltip(set);
  if (kind) markers.push(kind);
  const forced = forceClosedBadge(set);
  if (forced) markers.push("Closed via the --force bypass, not the deterministic gate.");
  if (set.schemaVersionOnDisk !== null && set.schemaVersionOnDisk < 4) {
    markers.push(`Ran under schema v${set.schemaVersionOnDisk} (readers normalize on read).`);
  }

  if (markers.length > 0) {
    lines.push("", ...markers.map((m) => `- ${m}`));
  }
  const touched = touchedDate(set);
  if (touched) lines.push("", `_last touched ${touched}_`);
  return lines.join("\n");
}

/**
 * `label` carries the set name verbatim, numeric prefix included — the
 * operator scans that prefix down the left edge, and a TreeItem label
 * truncates from the RIGHT. NO description (constraint 1).
 */
export function setDescriptor(set: SessionSet): RowDescriptor {
  const tokens: string[] = [NODE_TOKEN.set, `state-${set.state}`];
  const severity = severityOf(set);
  if (severity) tokens.push(`severity-${severity}`);
  for (const action of ROW_ACTIONS) {
    if (action.when(set)) tokens.push(actionToken(action));
  }
  const sessionCount = set.sessions.length;
  return {
    // Set names are globally unique by invariant, which is why they are
    // also the identity every row action keys on.
    id: `set:${set.name}`,
    label: set.name,
    tooltip: setTooltip(set),
    icon: setIcon(set),
    contextValue: tokenString(tokens),
    // A set node MUST report Collapsed, never Expanded, or the fourth
    // level is paid on every refresh. A set with no sessions is a leaf.
    collapsible: sessionCount > 0 ? "collapsed" : "none",
  };
}

export function sessionDescriptor(node: SessionNode): RowDescriptor {
  const { session } = node;
  const steps = session.steps;
  const tokens: string[] = [NODE_TOKEN.session, `session-${session.status}`];
  for (const action of SESSION_ACTIONS) {
    if (action.when(node.set, session)) tokens.push(actionToken(action));
  }
  return {
    id: `session:${node.set.name}/${session.number}`,
    label: session.title || `Session ${session.number}`,
    // Short labels, so description survives truncation here. Only the
    // in-flight session says anything — quiet is the default state.
    description: session.status === "in-progress" ? "in flight" : undefined,
    tooltip: sessionTooltip(node),
    icon: sessionIcon(session.iconKey),
    contextValue: tokenString(tokens),
    // Collapsed only when there is something under it: every session
    // that is not in flight (and an in-flight one whose activity log is
    // absent) is a leaf.
    collapsible: steps.length > 0 ? "collapsed" : "none",
  };
}

function sessionTooltip(node: SessionNode): string {
  const { session } = node;
  const title = session.title || `Session ${session.number}`;
  const lines = [`**${title}** — ${session.status.replace("-", " ")}`];
  if (session.verificationVerdict) {
    lines.push("", `Verification: ${session.verificationVerdict}`);
  }
  if (session.steps.length > 0) {
    lines.push(
      "",
      `${session.steps.length} step${session.steps.length === 1 ? "" : "s"}`,
    );
  }
  return lines.join("\n");
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
 * authored lifecycle assets the session and set rows use; the projection
 * already resolved the effective status (including the derived active
 * step), so this renderer never re-derives it.
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
    id: `step:${node.set.name}/${node.session.number}/${row.position}`,
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
    case "module":
      return moduleDescriptor(node);
    case "bucket":
      return bucketDescriptor(node);
    case "set":
      return setDescriptor(node.set);
    case "session":
      return sessionDescriptor(node);
    case "step":
      return stepDescriptor(node);
  }
}
