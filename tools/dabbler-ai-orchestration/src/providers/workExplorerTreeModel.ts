// Set 110 Session 2 — the Work Explorer's native-tree view model.
//
// PURE. No `vscode` import: everything here is a plain data transform
// from the existing `SessionSet` scan onto row DESCRIPTORS, which
// `WorkExplorerTreeProvider` converts into real `vscode.TreeItem`s.
// That split is what makes the interesting logic — the four-level
// shape, the icon-precedence rule, and the `contextValue` vocabulary
// the menus gate on — testable at Layer 2 without launching VS Code,
// which the webview renderer it replaces never was.
//
// The mapping below is NOT a design: it is the operator-confirmed
// table in `docs/session-sets/110-work-explorer-native-treeview/
// s1-migration-decision.md` §4, transcribed. Read that document before
// changing anything here; several rows in it reverse an earlier
// assumption on the strength of spike evidence, and the reversals are
// deliberate.
//
// Three constraints from Session 1 are load-bearing:
//
//   1. The FRACTION IS GONE from set rows. `TreeItem.description` is
//      dropped entirely when the label truncates, and every real set
//      name truncates at the width the operator works at, so a
//      `description`-borne fraction would be invisible exactly when it
//      mattered. The operator chose removal over a value that renders
//      only on a wide panel. Progress is read from the session rows.
//   2. THE ICON SLOT IS RANKED, not "the most severe marker" as prose.
//      A set can be blocked AND migration-required AND WAIVED at once;
//      without a total order the worst-case row rendered as a generic
//      in-progress dot and every actionable state lived on hover.
//   3. AT MOST TWO INLINE ACTIONS. Four erased the module label at
//      minimum panel width — the operator's original complaint,
//      reproduced natively. Enforced in `package.json` and asserted by
//      `workExplorerMenuParity.test.ts`, not by memory.

import {
  SessionRecord,
  SessionSet,
  SessionState,
  SessionStatus,
} from "../types";
import { ActionSupports, ROW_ACTIONS, RowAction } from "./ActionRegistry";
import {
  ICON_FILES,
  VisibleModule,
  blockedMarker,
  blockedTooltip,
  forceClosedBadge,
  kindTooltip,
  migrationTooltip,
  orderedBuckets,
  touchedDate,
  uatBadge,
} from "./SessionSetsModel";
import { isRecognizedVerdictToken } from "../utils/verdictTokens";
import {
  StepRow,
  buildStepRows,
  glyphStatusOf,
  stepRowLabel,
} from "./sessionStepModel";

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

/**
 * The four levels, in order: module -> status bucket -> session set ->
 * session. Operator ask 1 (2026-08-04) added the fourth; it is free
 * because `SessionSet.sessions` is carried by the scan that already
 * parsed the ledger, and it is only built on expand.
 *
 * `SetNode` and `SessionNode` both expose a `set` property ON PURPOSE.
 * Every existing row command reads `item.set` (see `commands/openFile.ts`
 * — `openIfExists(item?.set?.specPath, …)`), so a node shaped this way
 * is accepted by the whole command surface with no adapter and no
 * re-registration. Renaming that property would silently break every
 * context-menu action while still compiling.
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
  /** Identifies the owning module so sibling buckets in other modules stay distinct. */
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
 * Set 114 Session 3 — the FIFTH level: one step of the in-flight session,
 * exactly as `python -m ai_router.session_checklist` renders it.
 *
 * This is the half Set 111 S4 recorded and deliberately did not build: a
 * terminal command you must remember to run is a worse surface than a
 * panel already open on screen.
 *
 * It carries `set` for the same reason `SessionNode` does — every existing
 * row command reads `item.set` — even though no menu targets a step row.
 * `position` is the row's index in the rendered list and exists only to
 * make the node's `TreeItem.id` unique: two steps can legitimately share a
 * `stepKey` (a logged step that claimed no planned row appends alongside
 * one that did), and a colliding id would tie their selection state
 * together.
 */
export interface StepNode {
  readonly kind: "step";
  readonly set: SessionSet;
  readonly session: SessionRecord;
  readonly row: StepRow;
  readonly position: number;
}

/** Stable identity for a module across refreshes (declared slug, or the pseudo sentinel). */
export function moduleKeyOf(module: VisibleModule): string {
  return `${module.kind}:${module.slug ?? ""}`;
}

/**
 * Translate a command argument into the `preselectedSlug` option the
 * Set 093 module flows already accept.
 *
 * `undefined` when the argument is not a module node — which is exactly
 * the Command Palette case, where every one of those flows keeps its own
 * module QuickPick. So a palette invocation is byte-identical to its
 * pre-110 behaviour, and only a tree-row invocation carries a target.
 *
 * A PSEUDO module maps to `""`, the established repo-level sentinel
 * (`openModulePlan("")` opens the legacy root plan). A FALLBACK module —
 * a slug stamped on sets but absent from the manifest — maps to its raw
 * slug, so a flow that needs a manifest entry fails LOUD with "unknown
 * module" rather than silently retargeting. In practice the menus never
 * offer those items on a fallback row (it carries no capability token),
 * so this is the belt to that braces.
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

/**
 * A module's status buckets, in the same order and with the same
 * emptiness rule the webview uses — `orderedBuckets` is shared with
 * `buildBucketPayloads`, so the two surfaces cannot drift on ordering.
 */
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
 * The fourth level. Ordered by session number ascending — the order the
 * ledger is written and the order an operator reads a set's history in.
 * A set whose state file is absent or unreadable yields no session rows,
 * which is why `SetNode` still reports itself collapsible only when it
 * has sessions (an expandable row that opens onto nothing is a bug the
 * operator would report as a stall).
 */
export function sessionNodes(node: SetNode): SessionNode[] {
  return [...(node.set.sessions ?? [])]
    .sort((a, b) => a.number - b.number)
    .map((session) => ({ kind: "session", set: node.set, session }));
}

/**
 * The fifth level (Set 114 S3). The in-flight session's steps, built from
 * the ledger the scan carried — the plan `start_session` seeded, reconciled
 * against what the orchestrator has actually logged.
 *
 * Empty in four cases, all of which make the session row a LEAF rather
 * than a twisty that opens onto nothing:
 *
 *   1. the session is not in flight — the checklist answers "where is THIS
 *      session", and a finished one is answered by its own status glyph
 *      (decisions.jsonl, session 3);
 *   2. the set carries no step ledger — no activity log, an unreadable
 *      one, or one that says nothing about this session. **Degrading to no
 *      children is the requirement**: a stale or invented list is worse
 *      than an empty one;
 *   3. the ledger belongs to a different session than this row (a state
 *      file and an activity log that disagree — the ledger wins for its
 *      own session and says nothing about any other);
 *   4. the rows come back empty anyway.
 */
export function stepNodes(node: SessionNode): StepNode[] {
  if (node.session.status !== "in-progress") return [];
  const ledger = node.set.stepLedger;
  if (!ledger || ledger.sessionNumber !== node.session.number) return [];
  return buildStepRows(
    ledger.entries,
    ledger.sessionNumber,
    ledger.specSteps,
  ).map((row, position) => ({
    kind: "step",
    set: node.set,
    session: node.session,
    row,
    position,
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
 * How the adapter should build `TreeItem.iconPath`.
 *
 * `theme` -> `new ThemeIcon(id, color && new ThemeColor(color))`, which
 * recolours correctly in every theme for free. `file` -> the operator's
 * own authored SVG under `media/`, resolved per theme by the adapter.
 *
 * The distinction is not cosmetic: Session 1 found the four authored
 * status SVGs carry hardcoded `#ffffff` / `#000000`, leaving
 * `not-started.svg` nearly invisible on a light theme. The operator's
 * light/dark asset pairs now provide the consistent lifecycle language for
 * every status-bearing row; marker severity remains in tooltips.
 */
export type IconSpec =
  | { kind: "theme"; id: string; color?: string }
  | { kind: "file"; slug: string };

export interface RowDescriptor {
  /**
   * Stable across refreshes, unique across the whole tree.
   *
   * NOT optional, and not cosmetic. VS Code uses `TreeItem.id` to
   * preserve selection and EXPANSION STATE, and when it is absent it
   * generates one from the label. Two things go wrong without it:
   *
   *   1. every refresh serves freshly-constructed node objects, so an
   *      expanded module would collapse on each watcher tick — and this
   *      extension also polls every 30 seconds, so the tree would fold
   *      itself up under an operator roughly twice a minute;
   *   2. bucket labels are NOT unique — "In Progress" appears under
   *      every module — so a label-derived id would collide and VS Code
   *      would tie those rows' state together.
   *
   * The webview solved (1) with its own persistence layer. Going native
   * replaces that layer with one string per row.
   */
  id: string;
  label: string;
  description?: string;
  /** Markdown source for the tooltip; the adapter wraps it in a MarkdownString. */
  tooltip?: string;
  icon?: IconSpec;
  contextValue: string;
  collapsible: "none" | "collapsed";
}

// ---------------------------------------------------------------------------
// contextValue — the vocabulary every `when` clause in package.json reads
// ---------------------------------------------------------------------------

// Tokens are wrapped in `;` on BOTH sides, and the whole string is
// `;`-delimited, so a `when` clause matches `viewItem =~ /;token;/` with
// no word-boundary ambiguity. A bare `\btoken\b` would let a short token
// match inside a longer kebab-case one (`;spec;` inside `;act-open-spec;`
// has a word boundary on each side of `spec`), which is exactly the
// "imprecise `when` clause leaks an action onto the wrong node type"
// failure the step-3.5 analyst named as this session's second risk.
export const TOKEN_SEP = ";";

export function tokenString(tokens: readonly string[]): string {
  return TOKEN_SEP + tokens.join(TOKEN_SEP) + TOKEN_SEP;
}

/** The `when`-clause fragment for one token. Used by the parity test. */
export function tokenMatcher(token: string): string {
  return `${TOKEN_SEP}${token}${TOKEN_SEP}`;
}

export function hasToken(contextValue: string, token: string): boolean {
  return contextValue.includes(tokenMatcher(token));
}

/** Node-kind discriminators. Every menu contribution starts by matching one. */
export const NODE_TOKEN = {
  module: "dabblerModule",
  bucket: "dabblerBucket",
  set: "dabblerSet",
  session: "dabblerSession",
  step: "dabblerStep",
} as const;

/**
 * The current-step marker, in the vocabulary
 * `python -m ai_router.session_checklist` already prints. Shared so the
 * panel and the terminal cannot name the same signal two ways.
 */
export const HERE_MARKER = "<- here";

/** Module-row capability tokens. */
export const MODULE_TOKEN = {
  declared: "module-declared",
  fallback: "module-fallback",
  pseudo: "module-pseudo",
  canOpenPlan: "can-open-plan",
  canManage: "can-manage-module",
  canAssignLegacy: "can-assign-legacy",
} as const;

/**
 * The `contextValue` token for one registry action. Derived from the
 * command id so a new `ROW_ACTIONS` entry cannot be added without the
 * parity test noticing that no menu contribution matches it.
 */
export function actionToken(action: RowAction): string {
  return `act-${action.id.replace(/^dabbler(SessionSets)?\./, "").replace(/\./g, "-")}`;
}

// ---------------------------------------------------------------------------
// The icon precedence table (s1-migration-decision.md §4)
// ---------------------------------------------------------------------------

/**
 * A set's most severe state, most severe first. The FIRST match wins the
 * icon slot; every other marker still appears in the tooltip, so nothing
 * is lost — only simultaneous visibility, which is the trade the whole
 * migration makes and the operator confirmed twice.
 *
 * Rank 3 ("verification failed / WAIVED") is the one rank Session 1's
 * table named without naming its field, so the reading is recorded here
 * rather than buried: the signal is `liveSession.verificationVerdict`,
 * which the v4 normalizer derives as the MOST RECENTLY COMPLETED
 * session's verdict. That self-heals — an `ISSUES_FOUND` on session 1
 * stops flagging once a later session closes `VERIFIED` — and it treats
 * an UNRECOGNIZED token as severe rather than clean, which is the
 * Set 086 rule (a confabulated verdict must never render as a pass).
 */
export type SetSeverity =
  | "blocked"
  | "migration"
  | "verification"
  | "duplicate-name"
  | null;

export function verdictIsUnclean(verdict: string | null | undefined): boolean {
  if (typeof verdict !== "string" || verdict.trim() === "") return false;
  if (!isRecognizedVerdictToken(verdict)) return true;
  const normalized = verdict.trim().toUpperCase();
  return normalized.startsWith("ISSUES_FOUND") || normalized.startsWith("WAIVED");
}

export function severityOf(set: SessionSet): SetSeverity {
  if (blockedMarker(set) !== "") return "blocked";
  if (set.needsMigration) return "migration";
  if (verdictIsUnclean(set.liveSession?.verificationVerdict)) return "verification";
  if (set.duplicateNameError) return "duplicate-name";
  return null;
}

export function setIcon(set: SessionSet): IconSpec {
  // Marker severity remains discoverable in the tooltip and context value;
  // the row icon consistently communicates lifecycle status.
  return { kind: "file", slug: ICON_FILES[set.state] };
}

/** Session rows always carry the operator's status glyph (operator ask 2). */
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
    tokens.push(MODULE_TOKEN.declared, MODULE_TOKEN.canOpenPlan, MODULE_TOKEN.canManage);
  } else if (module.kind === "pseudo") {
    tokens.push(MODULE_TOKEN.pseudo, MODULE_TOKEN.canOpenPlan);
    // The `Assign legacy sets…` affordance rides the pseudo module only
    // when a declared module exists to assign INTO — the same condition
    // that renames it from `Default` to `Unassigned` (Set 093 ruling D2).
    if (node.declaredModulesExist) tokens.push(MODULE_TOKEN.canAssignLegacy);
  } else {
    // Fallback: an undeclared slug observed on sets. It renders (never
    // hide work) but offers no TARGET-SPECIFIC actions — there is no
    // manifest entry to rename, delete, or resolve a plan path against.
    // The global `New Module` action still applies, because it ignores
    // the carried slug and creates a brand-new module; the row is just
    // where the affordance sits. The shipping webview reaches the same
    // end by dropping every fallback-sourced action message in
    // `narrowModuleAction`; here it is simply an absent capability
    // token, which is the stronger form of the rule.
    tokens.push(MODULE_TOKEN.fallback);
  }

  const tooltipLines = [`**${module.displayName}**`, "", `${setCount} session set${setCount === 1 ? "" : "s"}`];
  if (warning) {
    tooltipLines.push("", `$(warning) ${MODULE_WARNING_TEXT[warning.code] ?? warning.code}`);
  }

  return {
    id: `module:${moduleKeyOf(module)}`,
    label: module.displayName,
    description: `${setCount} set${setCount === 1 ? "" : "s"}`,
    tooltip: tooltipLines.join("\n"),
    // Module rows are structural; lifecycle glyphs belong to buckets, sets,
    // and sessions rather than competing with the module name.
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
    // Session 1 recorded this as PROPOSED, not operator-confirmed:
    // bucket labels are short, so `description` survives truncation
    // where a set row's does not. Session 4's walk confirms or drops it.
    description: `${count} set${count === 1 ? "" : "s"}`,
    icon: { kind: "file", slug: ICON_FILES[node.bucketKey] },
    contextValue: tokenString([NODE_TOKEN.bucket, `bucket-${node.bucketKey}`]),
    // The three default buckets render even when EMPTY — a declared
    // module with no work yet still shows where that work will land
    // (never hide work). But an empty one is a LEAF: offering a twisty
    // that opens onto nothing is the same dead affordance a
    // session-less set row would be, and the count in `description`
    // already says why it will not expand.
    collapsible: count > 0 ? "collapsed" : "none",
  };
}

/**
 * Everything the webview rendered as an inline marker, in full, as
 * markdown. This is where the density trade is paid: the row shows one
 * icon, and the tooltip shows all of it.
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
  if (set.needsMigration) markers.push(migrationTooltip(set));
  const verdict = set.liveSession?.verificationVerdict;
  if (typeof verdict === "string" && verdict.trim() !== "") {
    markers.push(
      isRecognizedVerdictToken(verdict)
        ? `Verification: ${verdict}`
        : `Verification: "${verdict}" is not a recognized verdict`,
    );
  }
  if (set.duplicateNameError) {
    markers.push(
      `Duplicate session-set name in ${set.duplicateNameError.conflictingDirs.length} ` +
        `locations. Showing ${set.duplicateNameError.chosenDir}; rename one copy.`,
    );
  }
  const kind = kindTooltip(set);
  if (kind) markers.push(kind);
  const uat = uatBadge(set);
  if (uat) markers.push(`UAT: ${uat.replace(/^\[|\]$/g, "")}`);
  const forced = forceClosedBadge(set);
  if (forced) markers.push("Closed via the --force bypass, not the deterministic gate.");

  if (markers.length > 0) {
    lines.push("", ...markers.map((m) => `- ${m}`));
  }
  const touched = touchedDate(set);
  if (touched) lines.push("", `_last touched ${touched}_`);
  return lines.join("\n");
}

/**
 * `label` carries the set name verbatim, numeric prefix included — the
 * operator scans that prefix down the left edge, and a `TreeItem` label
 * truncates from the RIGHT, so the prefix survives every panel width.
 *
 * NO `description`. See constraint 1 at the top of this file.
 */
export function setDescriptor(set: SessionSet, supports: ActionSupports): RowDescriptor {
  const tokens: string[] = [NODE_TOKEN.set, `state-${set.state}`];
  const severity = severityOf(set);
  if (severity) tokens.push(`severity-${severity}`);
  for (const action of ROW_ACTIONS) {
    if (action.when(set, supports)) tokens.push(actionToken(action));
  }
  const sessionCount = (set.sessions ?? []).length;
  return {
    // Set names are globally unique by repo invariant (Set 087), which
    // is exactly why they are also the identity every row action keys on.
    id: `set:${set.name}`,
    label: set.name,
    tooltip: setTooltip(set),
    icon: setIcon(set),
    contextValue: tokenString(tokens),
    // Operator-notes wrinkle 5: a set node MUST report Collapsed, never
    // Expanded, or the fourth level is paid on every refresh — the exact
    // cost the migration exists to remove. A set with no readable ledger
    // is a leaf, so expanding never opens onto nothing.
    collapsible: sessionCount > 0 ? "collapsed" : "none",
  };
}

/**
 * Session rows (operator ask 1). The status glyph replaces the
 * `session N in flight` clause the webview carried in its description —
 * ask 2 is a REMOVAL, and this is where it is paid for.
 */
export function sessionDescriptor(node: SessionNode): RowDescriptor {
  const { session } = node;
  // Set 114 S3: computed here as well as in `childrenOf`, deliberately.
  // It is a pure transform over data the scan already carried, it runs
  // only for the at-most-one in-flight session per set, and the
  // alternative — reporting Collapsed unconditionally — is the dead
  // twisty the bucket and set rows both refuse.
  const steps = stepNodes(node);
  return {
    id: `session:${node.set.name}/${session.number}`,
    label: session.title || `Session ${session.number}`,
    // Short labels, so `description` survives truncation here. Only the
    // in-flight session says anything — quiet is the default state.
    description: session.status === "in-progress" ? "in flight" : undefined,
    tooltip: sessionTooltip(node, steps.length),
    icon: sessionIcon(session.status),
    contextValue: tokenString([NODE_TOKEN.session, `session-${session.status}`]),
    // Collapsed only when there is something under it. A session with no
    // steps to show — every session that is not in flight, and an
    // in-flight one whose activity log is absent or unreadable — is a
    // leaf, which is the same rule an empty bucket and a ledger-less set
    // already follow.
    collapsible: steps.length > 0 ? "collapsed" : "none",
  };
}

function sessionTooltip(node: SessionNode, stepCount: number): string {
  const { session } = node;
  const title = session.title || `Session ${session.number}`;
  const lines = [`**${title}** — ${session.status.replace("-", " ")}`];
  if (stepCount > 0) {
    lines.push("", `${stepCount} step${stepCount === 1 ? "" : "s"}`);
  }
  return lines.join("\n");
}

/**
 * A step row (Set 114 S3).
 *
 * The LABEL is the humanized `stepKey`, not the description: descriptions
 * are audit-trail prose written for close-out review and routinely run to
 * several sentences, and a tree row that wraps is not a tree row. The full
 * text is in the tooltip. This is the same trade
 * `session_checklist._summarize` makes for the terminal.
 *
 * The DESCRIPTION slot carries the current-step marker and nothing else.
 * `<- here` is the vocabulary the CLI already uses for this exact signal,
 * so the two surfaces name the same thing the same way; and keeping every
 * other row's description empty is what makes the marked one findable at a
 * glance, which is the whole point of the surface.
 *
 * The ICON is the same authored lifecycle glyph the session and set rows
 * use, mapped from the step's status by `glyphStatusOf` — "the same status
 * glyphs" is the spec's phrase, and it is met by reusing the assets rather
 * than by inventing a fifth-level vocabulary.
 */
export function stepDescriptor(node: StepNode): RowDescriptor {
  const { row } = node;
  const glyph = glyphStatusOf(row.status);
  const tooltipLines = [`**${stepRowLabel(row)}**`];
  const state = row.isPlanned
    ? "planned — not started"
    : String(row.status || "unknown").replace(/[-_]/g, " ");
  tooltipLines.push("", state);
  if (row.isHere) tooltipLines.push("", "_the session is here_");
  const description = String(row.description || "").trim();
  if (description) tooltipLines.push("", description);

  return {
    // `position` disambiguates: an unplanned logged step can append
    // alongside a planned row that carries the same key.
    id: `step:${node.set.name}/${node.session.number}/${node.position}`,
    label: stepRowLabel(row),
    description: row.isHere ? HERE_MARKER : undefined,
    tooltip: tooltipLines.join("\n"),
    icon: { kind: "file", slug: ICON_FILES[glyph] },
    contextValue: tokenString([
      NODE_TOKEN.step,
      `step-${glyph}`,
      row.isPlanned ? "step-planned" : "step-logged",
    ]),
    collapsible: "none",
  };
}

export function descriptorFor(
  node: WorkExplorerNode,
  supports: ActionSupports,
): RowDescriptor {
  switch (node.kind) {
    case "module":
      return moduleDescriptor(node);
    case "bucket":
      return bucketDescriptor(node);
    case "set":
      return setDescriptor(node.set, supports);
    case "session":
      return sessionDescriptor(node);
    case "step":
      return stepDescriptor(node);
  }
}
