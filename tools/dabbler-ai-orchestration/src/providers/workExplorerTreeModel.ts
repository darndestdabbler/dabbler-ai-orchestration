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
  CloseObligation,
  CloseObligations,
  SessionRecord,
  SessionSet,
  SessionState,
  SessionStatus,
} from "../types";
import {
  ActionSupports,
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
  migrationTooltip,
  orderedBuckets,
  touchedDate,
  uatBadge,
} from "./SessionSetsModel";
import { isRecognizedVerdictToken } from "../utils/verdictTokens";
import {
  StepRow,
  buildStepRows,
  effectiveStatusOf,
  glyphStatusOf,
  humanizeStepKey,
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
  | StepNode
  | CloseOutNode
  | ObligationNode;

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

/**
 * Set 115 Session 4 — the close-out group row under an in-flight session.
 *
 * ONE row, not fourteen. The obligations are what a close actually fails
 * on (122 of 295 sessions failed at least once, mean 1.6 attempts), and
 * the operator watches the expanded session while work is in flight — so
 * the summary belongs where they are already looking and the detail
 * belongs one twisty further in. It is also the only sensible home for
 * the projection's own state: `stale` is a fact about the whole recorded
 * answer, not about any single row.
 */
export interface CloseOutNode {
  readonly kind: "closeout";
  readonly set: SessionSet;
  readonly session: SessionRecord;
  readonly obligations: CloseObligations;
}

/**
 * One recorded close-out obligation. `position` disambiguates the row id
 * for the same reason `StepNode.position` does.
 */
export interface ObligationNode {
  readonly kind: "obligation";
  readonly set: SessionSet;
  readonly session: SessionRecord;
  readonly obligation: CloseObligation;
  /** Carried so a row can label itself "as of" when the answer is old. */
  readonly projection: CloseObligations;
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
    ledger.flight,
  ).map((row, position) => ({
    kind: "step",
    set: node.set,
    session: node.session,
    row,
    position,
  }));
}

/**
 * The close-out group row (Set 115 S4) — at most one, under the in-flight
 * session and after its steps.
 *
 * Present whenever the session is in flight, INCLUDING when no projection
 * has been written: "nobody has computed this yet" is a state the operator
 * is told about, with the command to fix it in the tooltip, because the
 * alternative is a feature that is invisible until it happens to be
 * populated. Every other session gets nothing — a closed session's
 * obligations are answered by the fact that it closed.
 */
export function closeOutNodes(node: SessionNode): CloseOutNode[] {
  if (node.session.status !== "in-progress") return [];
  const obligations = node.set.closeObligations;
  if (!obligations) return [];
  // A projection about a DIFFERENT session says nothing about this one.
  // Rendering it here would attach one session's obligations to another's
  // row, which is worse than showing nothing: it is showing something
  // false. It reads as `absent` because that is what it is for this row.
  if (
    obligations.sessionNumber !== null &&
    obligations.sessionNumber !== node.session.number
  ) {
    return [
      {
        kind: "closeout",
        set: node.set,
        session: node.session,
        obligations: {
          state: "absent",
          sessionNumber: null,
          verdict: null,
          generatedAt: null,
          obligations: [],
        },
      },
    ];
  }
  return [
    { kind: "closeout", set: node.set, session: node.session, obligations },
  ];
}

/** The obligation rows, in the order the preflight reported them. */
export function obligationNodes(node: CloseOutNode): ObligationNode[] {
  return node.obligations.obligations.map((obligation, position) => ({
    kind: "obligation",
    set: node.set,
    session: node.session,
    obligation,
    projection: node.obligations,
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
      return [...stepNodes(node), ...closeOutNodes(node)];
    case "closeout":
      return obligationNodes(node);
    case "step":
    case "obligation":
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
  closeout: "dabblerCloseOut",
  obligation: "dabblerObligation",
} as const;

/**
 * Set 115 S4: the `<- here` marker is GONE, in both languages.
 *
 * `session_checklist.HERE_MARKER`, its rendering and `_mark_here` went in
 * Set 120 S3 under an operator ruling; this file's mirror went with the
 * derivation it mirrored (`markHere`, `isHere`) in the same pass that
 * removed the marker's last rendering site. What the operator reads
 * instead is the in-progress GLYPH on the step whose recorded status is
 * `in-progress` — a fact the ledger carries since Set 120 S1 made the
 * writer strict, rather than an inference that pointed confidently at
 * step 1 of Set 119 S2 when the data was bad.
 */

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
 *
 * Takes the command id alone (Set 115 S3) so set actions and session
 * actions — two lists with different `when` signatures — mint tokens the
 * same way and are held to the same parity assertions.
 */
export function actionToken(action: RowAction | SessionAction): string {
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
 *
 * Set 115 S3: the row now also carries its applicable action tokens, the
 * same way `setDescriptor` has since Set 110. This is a pure transform
 * over data the scan already carried — `sessionOffersRunPrompt` reads the
 * set's own `sessions[]` ledger — so the fourth level still costs no disk
 * read.
 */
export function sessionDescriptor(node: SessionNode): RowDescriptor {
  const { session } = node;
  // Set 114 S3: computed here as well as in `childrenOf`, deliberately.
  // It is a pure transform over data the scan already carried, it runs
  // only for the at-most-one in-flight session per set, and the
  // alternative — reporting Collapsed unconditionally — is the dead
  // twisty the bucket and set rows both refuse.
  const steps = stepNodes(node);
  // Set 115 S4: the close-out row is the other thing that can live under
  // a session, so it counts towards the same question. A session with no
  // steps but a close-out projection is still expandable.
  const closeOut = closeOutNodes(node);
  const tokens: string[] = [NODE_TOKEN.session, `session-${session.status}`];
  for (const action of SESSION_ACTIONS) {
    if (action.when(node.set, session)) tokens.push(actionToken(action));
  }
  return {
    id: `session:${node.set.name}/${session.number}`,
    label: session.title || `Session ${session.number}`,
    // Short labels, so `description` survives truncation here. Only the
    // in-flight session says anything — quiet is the default state.
    description: session.status === "in-progress" ? "in flight" : undefined,
    tooltip: sessionTooltip(node, steps.length),
    icon: sessionIcon(session.status),
    contextValue: tokenString(tokens),
    // Collapsed only when there is something under it. A session with no
    // steps to show — every session that is not in flight, and an
    // in-flight one whose activity log is absent or unreadable — is a
    // leaf, which is the same rule an empty bucket and a ledger-less set
    // already follow.
    collapsible: steps.length + closeOut.length > 0 ? "collapsed" : "none",
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
 * The DESCRIPTION slot carried the `<- here` marker until Set 115 S4, and
 * has been empty on every step row since the operator ruled the marker out
 * (Set 120 S3). Set 127 S2 fills it with the step's derived START TIME
 * (`12:06-`) — the slot vacated by a worse answer to the same question, so
 * nothing is displaced. A row with no derived start renders no description
 * at all, which is what stops a seeded row's registration timestamp being
 * shown as a start.
 *
 * The ICON is the same authored lifecycle glyph the session and set rows
 * use — "the same status glyphs" is the spec's phrase, met by reusing the
 * assets rather than by inventing a fifth-level vocabulary.
 *
 * Everything that reads a status reads `effectiveStatusOf`, not
 * `row.status`: Set 127 derives the in-progress state for the step an
 * in-flight session is actually on, and a surface that read the raw record
 * would call that step "not started" in prose while the icon beside it said
 * it was running (`L-069-1` — one predicate, every consumer).
 */
export function stepDescriptor(node: StepNode): RowDescriptor {
  const { row } = node;
  const status = effectiveStatusOf(row);
  const glyph = glyphStatusOf(status);
  const tooltipLines = [`**${stepRowLabel(row)}**`];
  // A DERIVED active step is still `isPlanned` — nothing has logged against
  // it, which is precisely why it was derived — so the planned branch must
  // not answer first, or the tooltip would read "planned — not started" on
  // the row the icon shows as running.
  const state = row.isActive
    ? "in progress — derived from the plan, not yet logged"
    : row.isPlanned
      ? "planned — not started"
      : String(row.status || "unknown").replace(/[-_]/g, " ");
  tooltipLines.push("", state);
  // The full timestamp goes here, where width is free, and it is shown even
  // when the narrow slot cannot render it (an unparseable value): the
  // description is a convenience, the tooltip is the record.
  if (row.startedAt) tooltipLines.push("", `Started ${row.startedAt}`);
  const description = String(row.description || "").trim();
  if (description) tooltipLines.push("", description);

  const started = stepStartLabel(row.startedAt);
  return {
    // `position` disambiguates: an unplanned logged step can append
    // alongside a planned row that carries the same key.
    id: `step:${node.set.name}/${node.session.number}/${node.position}`,
    label: stepRowLabel(row),
    ...(started ? { description: started } : {}),
    tooltip: tooltipLines.join("\n"),
    icon: { kind: "file", slug: ICON_FILES[glyph] },
    contextValue: tokenString([
      NODE_TOKEN.step,
      `step-${glyph}`,
      row.isPlanned ? "step-planned" : "step-logged",
      // A derived active step is planned AND running; a `when` clause that
      // wants one or the other can say so without re-deriving anything.
      ...(row.isActive ? ["step-active"] : []),
    ]),
    collapsible: "none",
  };
}

/**
 * A derived start time as the row shows it: `12:06-`, local, 24-hour, hour
 * and minute only, with a trailing dash marking it a START rather than a
 * completion (operator rulings, 2026-08-12).
 *
 * Three deliberate absences, all ruled on at spec authoring:
 *
 *   * **no end time** — a finished step's end is the next row's start, one
 *     line below it, so rendering both is duplicate data on every row;
 *   * **no date, and no midnight special case** — it would cost width on
 *     every row to disambiguate a case most sets never hit, and the
 *     giveaway is already free (the next row's hour being SMALLER says the
 *     day rolled over);
 *   * **nothing at all when there is no derived start** — the slot stays as
 *     empty as it is today rather than showing a placeholder.
 *
 * An UNPARSEABLE timestamp also renders nothing here, unlike `asOfLabel`,
 * which falls back to the raw string: this slot is a few characters wide
 * beside a label, and a raw ISO string in it would be noise. The tooltip
 * carries the raw value, so the fact is not lost.
 */
export function stepStartLabel(startedAt: string | null): string {
  if (!startedAt) return "";
  const when = new Date(startedAt);
  if (Number.isNaN(when.getTime())) return "";
  const hh = String(when.getHours()).padStart(2, "0");
  const mm = String(when.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}-`;
}

// ---------------------------------------------------------------------------
// The close-out obligations (Set 115 S4)
// ---------------------------------------------------------------------------

/**
 * The command that produces (or refreshes) the projection. Named in every
 * tooltip that reports a state other than `fresh`, because a surface that
 * says "stale" without saying how to fix it is a complaint, not a tool.
 */
export const CLOSE_PREFLIGHT_COMMAND =
  "python -m ai_router.close_preflight --session-set-dir <set> --write";

/** Local clock time, for the "as of" qualifier. Falls back to the raw
 * string when the recorded timestamp is not parseable — showing what was
 * written beats showing "Invalid Date". */
export function asOfLabel(generatedAt: string | null): string {
  if (!generatedAt) return "as of an unrecorded time";
  const when = new Date(generatedAt);
  if (Number.isNaN(when.getTime())) return `as of ${generatedAt}`;
  const hh = String(when.getHours()).padStart(2, "0");
  const mm = String(when.getMinutes()).padStart(2, "0");
  return `as of ${hh}:${mm}`;
}

/** Unmet rows, split the way the close splits them. */
export function obligationCounts(projection: CloseObligations): {
  blocking: number;
  advisory: number;
  total: number;
} {
  const unmet = projection.obligations.filter((o) => !o.met);
  return {
    blocking: unmet.filter((o) => o.blocking).length,
    advisory: unmet.filter((o) => !o.blocking).length,
    total: projection.obligations.length,
  };
}

/**
 * The verdict `close_preflight` recorded, when it is one this renderer
 * knows. `would-close` is the ONLY one that means the close is settled:
 * `undecided-backstop-would-route` means every hand-fixable row is done
 * and the close is decided by a routed round that has not happened yet.
 * Collapsing that into an all-clear is the same overclaim the Python
 * report's tri-state `would_close` exists to avoid.
 */
export const VERDICT_WOULD_CLOSE = "would-close";
export const VERDICT_UNDECIDED = "undecided-backstop-would-route";

/**
 * The close-out group row's label.
 *
 * Named rather than inlined because the Playwright specs and the unit
 * tests both look the row up by text, and Set 128 S1 changed it once
 * already: a string repeated in four files is a rename waiting to go
 * half-done.
 */
export const CLOSE_OUT_GROUP_LABEL = "Close-out readiness";

/**
 * The group row's one line of text.
 *
 * A state other than `fresh` is said FIRST and is never omitted, because
 * the counts behind it are a claim about a moment that has passed. The
 * spec's rule is exact: a stale projection renders as stale, never as
 * truth — an obligation list that silently lags says "nothing remains"
 * when something does.
 *
 * An all-clear is always DATED and never unqualified. Two of the rows
 * behind it read git, which no digest here can re-check (`volatile`), and
 * a recorded verdict of `undecided` means the close turns on a routed
 * round that has not run — so "nothing outstanding" alone would be an
 * all-clear the projection cannot support.
 */
export function closeOutSummary(projection: CloseObligations): string {
  const { state } = projection;
  if (state === "absent") return "not computed";
  if (state === "unreadable") return "unreadable — regenerate";
  const { blocking, advisory } = obligationCounts(projection);
  const parts: string[] = [];
  if (blocking > 0) parts.push(`${blocking} blocking`);
  if (advisory > 0) parts.push(`${advisory} advisory`);
  if (parts.length === 0) {
    parts.push(
      projection.verdict === VERDICT_UNDECIDED
        ? "not decided — the backstop would route"
        : "nothing outstanding",
    );
    // Dated, because everything recorded is met and two of those answers
    // came from git: this is exactly the case where an undated row would
    // be read as "go ahead and close".
    parts.push(asOfLabel(projection.generatedAt));
  }
  const outstanding = parts.join(", ");
  return state === "stale" ? `stale — ${outstanding}` : outstanding;
}

/**
 * The group row's glyph, which may only read as DONE when the projection
 * is fresh, nothing at all is outstanding, **and** the recorded verdict
 * says the close would actually proceed.
 *
 * That last condition is the one an end-of-set critic caught missing: a
 * report whose rows are all met but whose verdict is
 * `undecided-backstop-would-route` describes a close that is not settled,
 * and painting the tick there tells an operator they are done when a
 * routed round still stands between them and closing.
 *
 * `unreadable` takes the cancelled glyph rather than the not-started one
 * on purpose: it is a data-quality fault, and the Python renderer's `[?]`
 * posture is to surface those rather than conceal them
 * (`step-ledger-findings.md` §4 records the tree doing the opposite for
 * step statuses, and this row does not repeat it).
 */
export function closeOutGlyph(projection: CloseObligations): SessionStatus {
  if (projection.state === "unreadable") return "cancelled";
  if (projection.state !== "fresh") return "not-started";
  const { blocking, advisory } = obligationCounts(projection);
  if (blocking + advisory > 0) return "not-started";
  return projection.verdict === VERDICT_WOULD_CLOSE
    ? "complete"
    : "not-started";
}

function closeOutTooltip(node: CloseOutNode): string {
  const p = node.obligations;
  const lines = ["**Close-out obligations**"];
  switch (p.state) {
    case "absent":
      lines.push(
        "",
        "Nothing has been computed for this session yet. This row is not a "
          + "claim that nothing remains — it is the absence of an answer.",
        "",
        `Run: \`${CLOSE_PREFLIGHT_COMMAND}\``,
      );
      return lines.join("\n");
    case "unreadable":
      lines.push(
        "",
        "The recorded projection could not be read — damaged, or written by "
          + "a newer schema than this extension knows.",
        "",
        `Regenerate: \`${CLOSE_PREFLIGHT_COMMAND}\``,
      );
      return lines.join("\n");
    case "stale":
      lines.push(
        "",
        `**Stale** — the session-set directory has changed since this was `
          + `computed (${asOfLabel(p.generatedAt)}). Rows below were true then.`,
        "",
        `Regenerate: \`${CLOSE_PREFLIGHT_COMMAND}\``,
      );
      break;
    default:
      lines.push("", `Computed ${asOfLabel(p.generatedAt)}.`);
      break;
  }
  const { blocking, advisory, total } = obligationCounts(p);
  lines.push(
    "",
    `${total} obligation${total === 1 ? "" : "s"} — ${blocking} blocking `
      + `unmet, ${advisory} advisory unmet.`,
  );
  if (p.verdict) {
    lines.push("", `close_session would report: \`${p.verdict}\``);
  }
  lines.push(
    "",
    "_These are the same predicates `close_session` runs; nothing here "
      + "refuses a close._",
  );
  return lines.join("\n");
}

/**
 * The close-out group row.
 *
 * A LEAF when there is nothing under it — an absent or unreadable
 * projection has no obligation rows, and a twisty that opens onto nothing
 * is the dead affordance every other level in this tree refuses.
 *
 * The label is `Close-out readiness`, not `Close-out`, since Set 128 S1.
 * That set made a step literally named **Close-out** part of the skeleton
 * every session declares, so the bare label put two rows called
 * `Close-out` side by side under the same session — one a pending plan
 * step, one this obligations summary — and the operator read them as a
 * duplicate. *Readiness* is what this row actually answers: what still
 * stands between here and close, which is a different question from
 * whether the close-out step has been executed.
 */
export function closeOutDescriptor(node: CloseOutNode): RowDescriptor {
  const p = node.obligations;
  return {
    id: `closeout:${node.set.name}/${node.session.number}`,
    label: CLOSE_OUT_GROUP_LABEL,
    description: closeOutSummary(p),
    tooltip: closeOutTooltip(node),
    icon: { kind: "file", slug: ICON_FILES[closeOutGlyph(p)] },
    contextValue: tokenString([NODE_TOKEN.closeout, `closeout-${p.state}`]),
    collapsible: p.obligations.length > 0 ? "collapsed" : "none",
  };
}

/**
 * One obligation row.
 *
 * The description carries an "as of" qualifier whenever the row's answer
 * cannot be shown to be current — either because the projection as a
 * whole is not fresh, or because this particular predicate reads git and
 * NO content digest can speak for it (`volatile`). One rule, two reasons,
 * the same four words: what the operator needs to know in both cases is
 * that this was true at a moment, not that it is true now.
 */
export function obligationDescriptor(node: ObligationNode): RowDescriptor {
  const { obligation: o, projection } = node;
  const stale = projection.state !== "fresh";
  const asOf = stale || o.volatile;

  const parts: string[] = [];
  if (!o.met) parts.push(o.blocking ? "blocking" : "advisory");
  if (o.cost_warning) parts.push("$");
  if (asOf) parts.push(asOfLabel(projection.generatedAt));

  const tooltip = [`**${humanizeStepKey(o.check)}**`, "", o.met ? "met" : "unmet"];
  if (o.detail) tooltip.push("", o.detail);
  if (o.action) tooltip.push("", `→ ${o.action}`);
  if (o.cost_warning) tooltip.push("", `$ ${o.cost_warning}`);
  if (o.volatile) {
    tooltip.push(
      "",
      "_Read from git, not from a file — no digest can tell whether it is "
        + "still true, so this row is only ever as current as the "
        + "projection's timestamp._",
    );
  }
  if (stale) {
    tooltip.push("", `_The projection is ${projection.state}; regenerate it._`);
  }

  return {
    id: `obligation:${node.set.name}/${node.session.number}/${node.position}`,
    label: humanizeStepKey(o.check),
    description: parts.length > 0 ? parts.join(" · ") : undefined,
    tooltip: tooltip.join("\n"),
    // A met row may still read as done: the parent row carries the
    // staleness verdict for the list as a whole, and the description
    // above repeats it per row, so the glyph is not the only thing
    // saying how old the answer is.
    icon: { kind: "file", slug: ICON_FILES[o.met ? "complete" : "not-started"] },
    contextValue: tokenString([
      NODE_TOKEN.obligation,
      o.met ? "obligation-met" : "obligation-unmet",
      o.blocking ? "obligation-blocking" : "obligation-advisory",
      ...(o.volatile ? ["obligation-volatile"] : []),
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
    case "closeout":
      return closeOutDescriptor(node);
    case "obligation":
      return obligationDescriptor(node);
  }
}
