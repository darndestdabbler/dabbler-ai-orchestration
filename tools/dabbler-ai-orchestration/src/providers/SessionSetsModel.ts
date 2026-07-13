import * as vscode from "vscode";
import { SessionSet, SessionState } from "../types";
import {
  LEGACY_ROOT_PLAN_REL,
  resolveModulePlanRelPath,
} from "../utils/moduleAuthoring";
import type { ModulesManifestClassification } from "../utils/moduleAuthoring";
import {
  BucketPayload,
  ModulePayload,
  RowPayload,
} from "../types/sessionSetsWebviewProtocol";
import { listInProgressSets } from "./inProgressSetsService";
import {
  PLUS_FRACTION_TOOLTIP,
  TIER_MISMATCH_MARKER,
  isRecognizedVerdictToken,
  tierMarkerFor,
  tierMismatch,
  tierMismatchTooltipFor,
  tierTooltipFor,
  verificationMarkerTooltipFor,
} from "../utils/tierLegibility";

// Set 029 Session 3: data-layer extraction from SessionSetsProvider so
// both the existing native `TreeView` (S3 ship) and the future custom
// webview tree (S4) can consume the same scan/bucket/sort/predicates
// without duplicating logic. The exported functions below are PURE —
// they take `SessionSet` records and return TreeItem chrome or text.
// The provider becomes a thin shim that calls into the model and the
// shared `fileSystem.readAllSessionSets()` scan.

// Set 050 Session 4 (Explorer UX revision): the old intrusive
// "(needs migration)" row label is retired (operator non-goal: "Old
// schema is acceptable; no per-row nag"). A set on a sub-current schema
// now carries only an unobtrusive asterisk next to its name; the detail
// lives in the asterisk's hover tooltip. Upgrading is offered as a
// single repo-level title-bar action, never a per-row obligation.
//
// `migrationMarker` is the visible glyph ("*" or ""); `migrationTooltip`
// is the hover text ("Ran under schema v<N>"). Both are pure functions
// of the SessionSet so the renderer and tests share one source.
export function migrationMarker(set: SessionSet): string {
  return set.needsMigration ? "*" : "";
}

export function migrationTooltip(set: SessionSet): string {
  if (!set.needsMigration) return "";
  const v = set.schemaVersionOnDisk;
  return typeof v === "number"
    ? `Ran under schema v${v}`
    : "Ran under an older schema";
}

// Set 050 S4: drives the `dabblerSessionSets.hasSubCurrentSets` context
// key that gates the title-bar "Upgrade older session sets" icon. True
// iff at least one scanned set is on a sub-current schema. Pure +
// exported so the gating logic is unit-tested without launching VS Code
// (the package.json `when` clause that consumes the key is declarative).
export function hasSubCurrentSets(allSets: SessionSet[]): boolean {
  return allSets.some((s) => s.needsMigration);
}

// Set 061 Session 1 (spec D2): the quiet per-row "lw" tier marker.
// Same shape as migrationMarker/migrationTooltip above — pure
// functions of the SessionSet so the renderer and tests share one
// source. Full rows get no marker (Full is the default and the
// majority; marking the exception keeps rows quiet).
//
// Set 077 Session 2 (Feature 1): the same slot carries the
// tier-mismatch advisory ("t!") when the workspace's durable
// `.dabbler/tier` marker disagrees with the set's declared tier on a
// non-terminal row. Two ways to get there: a manual spec edit (drift —
// the advisory's target) or a sanctioned per-set tier override (the
// decomposition prompt allows a plan to pick a different tier for a
// specific set). The marker slot stays quiet-styled and the tooltip
// names both readings, closing with "if intentional, no action is
// needed" — an advisory, never a nag.
export function tierMarker(set: SessionSet): string {
  const specTier = set.config?.tier ?? "full";
  if (tierMismatch(specTier, set.workspaceTierMarker, set.state)) {
    return TIER_MISMATCH_MARKER;
  }
  return tierMarkerFor(specTier);
}

export function tierTooltip(set: SessionSet): string {
  const specTier = set.config?.tier ?? "full";
  if (tierMismatch(specTier, set.workspaceTierMarker, set.state)) {
    // Narrowed non-null by the predicate above.
    return tierMismatchTooltipFor(specTier, set.workspaceTierMarker as NonNullable<typeof set.workspaceTierMarker>);
  }
  return tierTooltipFor(specTier);
}

// Set 061 Session 1 (spec D1): hover text for the `N/M+` fraction.
// Non-empty only when the row's fraction carries the `+` suffix.
export function fractionTooltip(set: SessionSet): string {
  return set.plusFraction ? PLUS_FRACTION_TOOLTIP : "";
}

// Set 062 Session 1 (spec D1): the quiet verification-posture marker
// (`v?` / `v+`) + tooltip. Same shape as migrationMarker/tierMarker —
// pure functions of the SessionSet so the renderer and tests share one
// source. The glyph itself is derived at scan time in fileSystem.ts
// (it needs the ledger, which the SessionSet record does not carry).
export function verificationMarker(set: SessionSet): string {
  return set.verificationMarker ?? "";
}

export function verificationTooltip(set: SessionSet): string {
  return verificationMarkerTooltipFor(set.verificationMarker ?? "");
}

// Set 062 Session 1 (spec D1): fraction-tooltip enrichment on verified
// rows. A completed `type: "verification"` session suppresses the
// marker (quiet is success); the persisted verdict surfaces here
// instead, on the fraction the typed session grew. Empty when no
// completed verification session exists or its verdict was never
// persisted.
export function verdictFractionTooltip(set: SessionSet): string {
  const cv = set.completedVerification;
  if (!cv || !cv.verdict) return "";
  const suffix = cv.sessionNumber != null ? ` (session ${cv.sessionNumber})` : "";
  // Set 086 S2 guardrail: a persisted verdict the reader does not recognize —
  // e.g. the confabulated `manual-override-development` the Set-086 root-cause
  // incident wrote — must NEVER render as if it were a clean verdict. Flag it
  // as unrecognized so the reader surfaces the anomaly instead of laundering a
  // non-verdict into a legitimate-looking status. (The blessed writer now
  // rejects such tokens outright; this reader guards data that predates the
  // writer enforcement or was hand-authored around it.)
  if (!isRecognizedVerdictToken(cv.verdict)) {
    return `Verification: "${cv.verdict}" is not a recognized verdict${suffix}`;
  }
  return `Verification: ${cv.verdict}${suffix}`;
}

export const ICON_FILES: Record<SessionState, string> = {
  complete: "done.svg",
  "in-progress": "in-progress.svg",
  "not-started": "not-started.svg",
  cancelled: "cancelled.svg",
};

export function iconUriFor(
  extensionUri: vscode.Uri,
  state: SessionState,
): vscode.Uri | undefined {
  const file = ICON_FILES[state];
  return file ? vscode.Uri.joinPath(extensionUri, "media", file) : undefined;
}

// Set 030 Session 3: the v3 "in-flight" predicate is a direct read of
// the canonical `liveSession.currentSession` field, which `fileSystem.ts`
// populates from `readProgress` as the single in-progress session's
// number (or null when no session is in flight). v2's
// "currentSession not in completedSessions[]" predicate is gone — the
// v3 reader resolves the ambiguity at the source rather than letting
// it propagate into a downstream invariant check.
export function isCurrentSessionInFlight(set: SessionSet): boolean {
  return set.liveSession?.currentSession != null;
}

export function progressText(set: SessionSet): string {
  // Always show X/total. The earlier "X/X" shape on done sets assumed
  // completed === total, which masks bugs like a SET-level flip to
  // "complete" that fires before all sessions ran. Truthful display
  // surfaces the discrepancy at a glance.
  //
  // Set 022 Session 2 added two annotations to disambiguate the row.
  // Set 030 Session 3 renamed the terminal annotation to "Complete"
  // so the display vocabulary matches the JSON status glossary:
  //   * `N/N Complete` on complete rows — operator-facing "yes this
  //     really reached terminal state" cue.
  //   * `0/N · session 1 in flight` on rows where session N has
  //     started but not yet closed.
  // Set 077 Session 5 (S1 bundle B): the `+` suffix mirrors
  // `fractionFor` in CustomSessionSetsView — a Lightweight
  // dedicated-sessions set whose typed sessions are still pending
  // renders `N/M+` on BOTH fraction surfaces, so this text no longer
  // contradicts the row's fraction column.
  const plus = set.plusFraction ? "+" : "";
  const base = set.totalSessions && set.totalSessions > 0
    ? `${set.sessionsCompleted}/${set.totalSessions}${plus}`
    : set.sessionsCompleted > 0
      ? `${set.sessionsCompleted} complete`
      : "";

  if (set.state === "complete" && base) {
    return `${base} Complete`;
  }
  if (set.state === "in-progress" && isCurrentSessionInFlight(set)) {
    const n = set.liveSession?.currentSession;
    const annotation = `session ${n} in flight`;
    return base ? `${base} · ${annotation}` : annotation;
  }
  return base;
}

// Set 077 Session 5 (Feature 5, A9): the owed-state WORDS for the row
// description — the derived workflow state said out loud instead of
// compressed into the `v+` glyph (which drops after the first completed
// verification round, exactly when "remediation owed" matters most).
// Pure function of the derived state; empty everywhere the ladder is
// quiet. `awaiting-human` deliberately stays out of this surface: it
// has no auto-routable next prompt (a human decides), and its signal
// remains the marker/tooltip channel.
export function verificationOwedText(set: SessionSet): string {
  // Terminal-row suppression (the same rule every Set 061/062 marker
  // follows): a cancelled set's owed verification is not actionable —
  // and "cancelled" is non-terminal to the derivation ladder (only
  // "complete" is), so without this guard an abandoned Mode-B set
  // would nag "verification owed" forever. (S5 code-review
  // adjudication catch.)
  if (set.state === "cancelled") return "";
  if (set.workflowState === "awaiting-verification") return "verification owed";
  if (set.workflowState === "awaiting-remediation") return "remediation owed";
  return "";
}

export function touchedDate(set: SessionSet): string {
  if (!set.lastTouched) return "";
  return new Date(set.lastTouched).toLocaleDateString("en-CA");
}

export function uatBadge(set: SessionSet): string {
  if (!set.config?.requiresUAT || !set.uatSummary) return "";
  if (set.uatSummary.pendingItems > 0) return `[UAT ${set.uatSummary.pendingItems}]`;
  if (set.uatSummary.totalItems > 0) return "[UAT done]";
  return "";
}

// Set 9 Session 3 (D-2 hard-scoping of ``--force``): the badge surfaces
// the rare case where a session set was closed via the hard-scoped
// ``--force`` bypass instead of the deterministic gate.
export function forceClosedBadge(set: SessionSet): string {
  return set.liveSession?.forceClosed === true ? "[FORCED]" : "";
}

// Set 061 Session 2 (spec D3): the quiet blocked-by-prerequisites
// marker that replaces the Set 047 all-caps blocked-by-prereqs
// description badge. Same shape as migrationMarker/tierMarker above — pure
// functions of the SessionSet so the renderer and tests share one
// source. The terminal-state suppression rule is unchanged: once a set
// is itself ``complete`` or ``cancelled``, the dependency status is no
// longer actionable (an operator viewing a closed row doesn't need to
// start work behind a now-irrelevant prereq).
//
// Glyph: U+26D3 CHAINS with U+FE0E (text presentation selector) so the
// marker renders as a theme-colored text glyph, not a colored emoji.
export const BLOCKED_MARKER = "⛓︎";

// Operator-facing label for a prereq target's bucketed state inside the
// blocked tooltip. The "unknown" sentinel names the typo case loudly —
// an unresolvable slug still blocks (Set 047 rule) and the tooltip says
// why instead of leaving the operator to guess.
function targetStateLabel(state: string): string {
  switch (state) {
    case "in-progress": return "in progress";
    case "not-started": return "not started";
    case "unknown": return "unknown set — check the slug";
    default: return state; // "complete" / "cancelled" pass through
  }
}

export function blockedMarker(set: SessionSet): string {
  if (set.unsatisfiedPrereqs.length === 0) return "";
  if (set.state === "complete" || set.state === "cancelled") return "";
  return BLOCKED_MARKER;
}

export function blockedTooltip(set: SessionSet): string {
  if (blockedMarker(set) === "") return "";
  const parts = set.unsatisfiedPrereqs.map(
    (p) => `${p.slug} (${targetStateLabel(p.targetState)})`,
  );
  return `Blocked by prerequisites: ${parts.join(", ")} — all must complete first.`;
}

// modeBadge kept as a no-op stub for existing imports / tests. Set 026
// Session 1 removed the outsource-last path; there is no longer any
// mode distinction to badge.
export function modeBadge(_set: SessionSet): string {
  return "";
}

// Set 100 Session 1: the kind-aware row badge (verdict: presentation
// only — no new node types, no new states). Same shape as
// migrationMarker/tierMarker above — pure functions of the SessionSet
// so the renderer and tests share one source. `set.kind` is the
// Set 098 validated enum: absent (undefined) on every ordinary work
// set and on declared-but-unknown values, which warned at scan time
// and degrade to ordinary work sets — both render badge-less.
export function kindBadge(set: SessionSet): string {
  return set.kind ?? "";
}

export function kindTooltip(set: SessionSet): string {
  if (set.kind === "plan") {
    return "Module lifecycle set: creates or imports this module's project plan.";
  }
  if (set.kind === "decomposition") {
    return "Module lifecycle set: decomposes the module's plan into session sets.";
  }
  return "";
}

// Set 087 Session 2: one module group of the Explorer's module →
// status-bucket → row tier. `slug` / `title` are null for the implicit
// module (sets with no validated `module` attribution); the host maps
// null onto the protocol's `""` sentinel. Pure grouping only — module
// is never identity (the Set 087 invariant).
export interface ModuleGroup {
  slug: string | null;
  title: string | null;
  sets: SessionSet[];
}

// Set 087 Session 2: group the scanned sets by their validated module
// attribution, BEFORE the existing bucketSets pass (which then runs per
// module). Pure function of the SessionSet records: the display order
// rides in on `set.moduleOrder` (the manifest file index, stamped at
// scan time — routed ruling Q3, saved raw at
// docs/session-sets/087-.../s2-explorer-render-architecture.json), so
// labeled modules sort by manifest order and the implicit module —
// when any of its sets exist — always comes last. Only modules with at
// least one set produce a group (an empty manifest module renders
// nothing). Sets keep their input order within each group; per-bucket
// sorting stays downstream in sortBucket.
export function groupByModule(all: SessionSet[]): ModuleGroup[] {
  const labeled = new Map<string, { group: ModuleGroup; order: number }>();
  const implicit: ModuleGroup = { slug: null, title: null, sets: [] };
  for (const s of all) {
    if (s.module === null) {
      implicit.sets.push(s);
      continue;
    }
    const existing = labeled.get(s.module);
    if (existing) {
      existing.group.sets.push(s);
      // A cross-root merge can theoretically carry differing manifest
      // indexes for one slug; the smallest wins so ordering stays
      // deterministic.
      const order = s.moduleOrder ?? Number.POSITIVE_INFINITY;
      if (order < existing.order) existing.order = order;
    } else {
      labeled.set(s.module, {
        group: { slug: s.module, title: s.moduleTitle, sets: [s] },
        order: s.moduleOrder ?? Number.POSITIVE_INFINITY,
      });
    }
  }
  const groups = Array.from(labeled.values())
    .sort((a, b) => a.order - b.order)
    .map((e) => e.group);
  if (implicit.sets.length > 0) groups.push(implicit);
  return groups;
}

// Bucket the scanned sets into the four lifecycle groups. The custom
// tree (S4) and the native tree (S3 ship) both consume this.
export interface BucketedSets {
  inProgress: SessionSet[];
  notStarted: SessionSet[];
  complete: SessionSet[];
  cancelled: SessionSet[];
}

export function bucketSets(all: SessionSet[]): BucketedSets {
  return {
    inProgress: all.filter((s) => s.state === "in-progress"),
    notStarted: all.filter((s) => s.state === "not-started"),
    complete: all.filter((s) => s.state === "complete"),
    cancelled: all.filter((s) => s.state === "cancelled"),
  };
}

// Sort within a bucket. In-progress / complete / cancelled rows sort by
// `lastTouched` desc (most recent first); not-started rows sort by name
// asc (operators usually want fresh-state rows in a stable order).
export function sortBucket(subset: SessionSet[], groupKey: SessionState): SessionSet[] {
  const out = subset.slice();
  if (groupKey === "not-started") {
    out.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    out.sort((a, b) => (b.lastTouched || "").localeCompare(a.lastTouched || ""));
  }
  return out;
}

// Set 087 Session 2 (verifier round 1, Major): the snapshot payload
// assembly, extracted from CustomSessionSetsView so the payload SHAPE
// is behavior-testable at Layer 2 (the host class is not importable
// from the unit harness). Pure given `rowFor` — the host passes its
// private `buildRow` (unchanged, per the spec); tests pass a stub.
// Semantics are the pre-087 host logic verbatim: the three default
// buckets always render (empty ones included), Cancelled only when
// non-empty, in-progress ordered by `listInProgressSets`, the other
// buckets by `sortBucket`.
export function buildBucketPayloads(
  subset: SessionSet[],
  rowFor: (set: SessionSet) => RowPayload,
): BucketPayload[] {
  const buckets = bucketSets(subset);
  const build = (
    key: BucketPayload["key"],
    label: string,
    sets: SessionSet[],
    sorted: SessionSet[],
  ): BucketPayload => ({
    key,
    label,
    count: sets.length,
    rows: sorted.map(rowFor),
  });
  const groups: BucketPayload[] = [
    build(
      "in-progress",
      "In Progress",
      buckets.inProgress,
      listInProgressSets(buckets.inProgress),
    ),
    build(
      "not-started",
      "Not Started",
      buckets.notStarted,
      sortBucket(buckets.notStarted, "not-started"),
    ),
    build("complete", "Complete", buckets.complete, sortBucket(buckets.complete, "complete")),
  ];
  if (buckets.cancelled.length > 0) {
    groups.push(
      build("cancelled", "Cancelled", buckets.cancelled, sortBucket(buckets.cancelled, "cancelled")),
    );
  }
  return groups;
}

// Set 087 Session 2: the module tier's full payload — groupByModule
// (manifest order, implicit last) with the bucket pass run per module.
// The implicit module maps its null slug/title onto the protocol's ""
// sentinels. A no-manifest / all-implicit workspace produces exactly
// one implicit ModulePayload (the webview's pixel-compatible case).
export function buildModulePayloads(
  all: SessionSet[],
  rowFor: (set: SessionSet) => RowPayload,
): ModulePayload[] {
  return groupByModule(all).map((group) => ({
    slug: group.slug ?? "",
    title: group.title ?? "",
    buckets: buildBucketPayloads(group.sets, rowFor),
  }));
}

/**
 * Merge root-scoped visible-module computations into the Explorer's global
 * module list. Declared modules share identity by slug; fallback modules stay
 * distinct from declared modules with the same slug so their warning cannot
 * disappear. One pseudo-module combines all unstamped work and renders last.
 */
export function mergeVisibleModules(
  roots: readonly (readonly VisibleModule[])[],
): VisibleModule[] {
  type RankedModule = {
    module: VisibleModule;
    order: number;
    firstSeen: number;
  };
  const declared = new Map<string, RankedModule>();
  const fallback = new Map<string, VisibleModule>();
  let pseudo: VisibleModule | null = null;
  let firstSeen = 0;

  const warningRank = (warning: VisibleModuleWarning | null): number => {
    if (!warning) return 0;
    if (warning.code === "manifest-invalid") return 3;
    if (warning.code === "manifest-missing") return 2;
    return 1;
  };

  for (const modules of roots) {
    let declaredOrder = 0;
    for (const module of modules) {
      if (module.kind === "declared") {
        const slug = module.slug!;
        const existing = declared.get(slug);
        if (existing) {
          existing.module = {
            ...existing.module,
            sets: [...existing.module.sets, ...module.sets],
          };
          existing.order = Math.min(existing.order, declaredOrder);
        } else {
          declared.set(slug, {
            module: { ...module, sets: [...module.sets] },
            order: declaredOrder,
            firstSeen: firstSeen++,
          });
        }
        declaredOrder++;
        continue;
      }
      if (module.kind === "fallback") {
        const slug = module.slug!;
        const existing = fallback.get(slug);
        fallback.set(
          slug,
          existing
            ? { ...existing, sets: [...existing.sets, ...module.sets] }
            : { ...module, sets: [...module.sets] },
        );
        continue;
      }
      if (!pseudo) {
        pseudo = { ...module, sets: [...module.sets] };
      } else {
        const existingPseudo = pseudo as VisibleModule;
        pseudo = {
          ...existingPseudo,
          warning:
            warningRank(module.warning) > warningRank(existingPseudo.warning)
              ? module.warning
              : existingPseudo.warning,
          sets: [...existingPseudo.sets, ...module.sets],
        };
      }
    }
  }

  const out = Array.from(declared.values())
    .sort((a, b) => a.order - b.order || a.firstSeen - b.firstSeen)
    .map((entry) => entry.module);
  out.push(...Array.from(fallback.values()).sort((a, b) => a.slug!.localeCompare(b.slug!)));
  const mergedPseudo = pseudo as VisibleModule | null;
  if (mergedPseudo) {
    out.push({
      ...mergedPseudo,
      displayName: out.length === 0
        ? PSEUDO_MODULE_SOLE_NAME
        : PSEUDO_MODULE_COEXIST_NAME,
    });
  }
  return out;
}

export function buildVisibleModulePayloads(
  modules: readonly VisibleModule[],
  rowFor: (set: SessionSet) => RowPayload,
): ModulePayload[] {
  return modules.map((module) => ({
    slug: module.slug ?? "",
    title: module.displayName,
    kind: module.kind,
    warning: module.warning,
    buckets: buildBucketPayloads([...module.sets], rowFor),
  }));
}

// ---------------------------------------------------------------------------
// Set 091 S2 — the visible-module computation (verdict amendment 2 + the
// Q8 compat matrix; routed rulings saved raw at
// docs/session-sets/091-.../s2-visible-module-architecture.json + -2.json).
//
// This is the ordered module list the shipping renderer consumes (since
// Set 092): declared modules in manifest order (ALL of them — a declared
// module with zero sets still renders — its row and empty status buckets
// are where the scaffolded lifecycle sets land), then one FALLBACK group
// per undeclared stamped slug (alphabetical, warning-flagged, never
// hidden — fail loud, never hide work), then the PSEUDO-module holding
// unstamped sets. The host feeds it through `buildVisibleModulePayloads`;
// the legacy `groupByModule` / `buildModulePayloads` pair above is no
// longer on the shipping render path (test-only since Set 092).

/** The pseudo-module's label when it is the only visible module. */
export const PSEUDO_MODULE_SOLE_NAME = "Default";
/** The pseudo-module's label once any other module group coexists. */
export const PSEUDO_MODULE_COEXIST_NAME = "Unassigned";

/**
 * Structured, renderer-agnostic warning on a visible module (ruling Q1:
 * semantic codes, not prose — Set 092's diagnostics strip owns the
 * operator-facing wording). Module-level warnings COMPLEMENT the
 * classification-level diagnostics the renderer derives from the
 * manifest classification it already holds; when the pseudo-module is
 * not visible (e.g. an invalid manifest over fully-stamped sets), the
 * manifest-level fault still reaches the operator through that
 * classification surface plus the per-fallback-group warnings.
 */
export type VisibleModuleWarning =
  | { code: "manifest-missing" }
  | { code: "manifest-invalid" }
  | { code: "unstamped-sets" }
  | { code: "undeclared-slug"; rawSlug: string };

export interface VisibleModule {
  /**
   * `declared` = a docs/modules.yaml entry (even with zero sets);
   * `fallback` = an observed stamp slug the manifest does not declare;
   * `pseudo` = the module of unstamped sets (never persisted — sets
   * authored under it carry NO `module:` field, verdict amendment 2).
   */
  kind: "declared" | "fallback" | "pseudo";
  /**
   * declared: the manifest slug; fallback: the raw stamped value
   * (`config.module`), verbatim; pseudo: null.
   */
  slug: string | null;
  /**
   * declared: the manifest title; fallback: the raw slug (bare — the
   * warning field carries the anomaly, ruling Q5); pseudo: `Default`
   * when it is the only visible module, `Unassigned` once any declared
   * or fallback group coexists (ruling Q3 — fallback groups count). A
   * user-declared literal `default` slug therefore always forces
   * `Unassigned`: the declared module renders unconditionally, so the
   * pseudo-module is never sole beside it.
   */
  displayName: string;
  warning: VisibleModuleWarning | null;
  /**
   * declared: the manifest planPath resolved through the PURE
   * {@link resolveModulePlanRelPath} (safe-degraded, defaulted, no
   * logging — verification R4: this model function must stay
   * side-effect-free; the interactive flows' `modulePlanRelPath` wrapper
   * owns the warning); fallback: null (an undeclared slug has no
   * manifest entry to read); pseudo: always {@link LEGACY_ROOT_PLAN_REL}
   * — existence is the consumer's separate present/missing check
   * (ruling Q7).
   */
  planPath: string | null;
  /** Input order preserved; per-bucket sorting stays downstream. */
  sets: readonly SessionSet[];
}

// Set 100 Session 1: the 093-era `deriveModuleChildren` (and the
// host-populated `planExists` field that fed it) retired with the
// persistent `Plan` / `Session sets` child nodes — plan/decomposition
// state is visible as the kind-typed sets themselves, and the status
// buckets are the module's direct children. `planPath` stays: the
// wizard flows and the module-row `Open Plan` action resolve it at
// action time.

export interface VisibleModulesOptions {
  /**
   * Whether the repo-level `docs/planning/project-plan.md` exists. A
   * caller-supplied fact so the computation stays pure (ruling Q1); the
   * legacy root plan keeps the pseudo-module visible even when every
   * set is stamped (gpt-5-4 Critical #1 — the plan must not vanish).
   */
  legacyRootPlanExists: boolean;
}

export interface RenderableModuleSnapshot {
  modules: readonly VisibleModule[];
  retainedLastKnownGood: boolean;
}

/**
 * Keep the last usable module tree while a present manifest is invalid.
 * Absent and valid-empty manifests are healthy compatibility states and
 * therefore always replace the prior snapshot.
 */
export function chooseRenderableModuleSnapshot(
  classification: ModulesManifestClassification,
  current: readonly VisibleModule[],
  lastKnownGood: readonly VisibleModule[] | undefined,
): RenderableModuleSnapshot {
  if (classification.kind === "invalid" && lastKnownGood) {
    return { modules: lastKnownGood, retainedLastKnownGood: true };
  }
  return { modules: current, retainedLastKnownGood: false };
}

/**
 * Compute the ordered visible-module list from the manifest
 * classification plus the scanned sets.
 *
 * Attribution is RE-DERIVED here from each set's raw declared stamp
 * (`config.module`) against the classification's entries, rather than
 * trusting the scan-time `set.module` field: the scanner validates
 * against the same manifest, but re-deriving makes this a total
 * function of its declared inputs (fixture-testable, and correct for
 * the absent/invalid classifications, where the scanner stamps null on
 * every set and the raw value is the ONLY record of an observed slug).
 *
 * Pseudo-module presence (routed ruling Q2, amended by the
 * operator-confirmed Q8 matrix, which outranks it): the pseudo-module
 * appears iff unstamped sets exist, OR the legacy root plan exists, OR
 * no other module group is visible (the Q8 "no manifest, no sets" and
 * "empty manifest, no sets" rows both render the sole `Default`
 * pseudo-module — an empty tree is never the answer). Fallback groups
 * count as visible groups for this predicate and for naming, but never
 * as declared modules.
 */
export function computeVisibleModules(
  classification: ModulesManifestClassification,
  allSets: SessionSet[],
  opts: VisibleModulesOptions,
): VisibleModule[] {
  const declared =
    classification.kind === "present" ? classification.entries : [];
  const declaredSlugs = new Set(declared.map((e) => e.slug));

  const declaredSets = new Map<string, SessionSet[]>();
  const fallbackSets = new Map<string, SessionSet[]>();
  const unstamped: SessionSet[] = [];
  for (const s of allSets) {
    const raw = s.config?.module ?? null;
    if (raw === null) {
      unstamped.push(s);
    } else if (declaredSlugs.has(raw)) {
      const list = declaredSets.get(raw);
      if (list) list.push(s);
      else declaredSets.set(raw, [s]);
    } else {
      const list = fallbackSets.get(raw);
      if (list) list.push(s);
      else fallbackSets.set(raw, [s]);
    }
  }

  const out: VisibleModule[] = declared.map((entry) => ({
    kind: "declared" as const,
    slug: entry.slug,
    displayName: entry.title,
    warning: null,
    planPath: resolveModulePlanRelPath(entry).path,
    sets: declaredSets.get(entry.slug) ?? [],
  }));

  for (const rawSlug of Array.from(fallbackSets.keys()).sort()) {
    out.push({
      kind: "fallback",
      slug: rawSlug,
      displayName: rawSlug,
      warning: { code: "undeclared-slug", rawSlug },
      planPath: null,
      sets: fallbackSets.get(rawSlug)!,
    });
  }

  const otherGroupsVisible = out.length > 0;
  const pseudoVisible =
    unstamped.length > 0 || opts.legacyRootPlanExists || !otherGroupsVisible;
  if (pseudoVisible) {
    // Warning precedence: a manifest-level fault outranks the
    // unstamped-sets advisory. `manifest-missing` fires only when sets
    // exist (Q8 row 1: a pristine repo's sole `Default` module is the
    // designed starting point, not a fault — the create-manifest CTA is
    // Set 094's affordance, not a warning); a valid-empty manifest is
    // never a fault (Q8 rows 4–5: "no warning"). `unstamped-sets` fires
    // only when other groups coexist (Q8 row 7's "Assign legacy sets…"
    // moment) — unstamped is the normal state while the pseudo-module
    // is sole.
    let warning: VisibleModuleWarning | null = null;
    if (classification.kind === "invalid") {
      warning = { code: "manifest-invalid" };
    } else if (classification.kind === "absent" && allSets.length > 0) {
      warning = { code: "manifest-missing" };
    } else if (unstamped.length > 0 && otherGroupsVisible) {
      warning = { code: "unstamped-sets" };
    }
    out.push({
      kind: "pseudo",
      slug: null,
      displayName: otherGroupsVisible
        ? PSEUDO_MODULE_COEXIST_NAME
        : PSEUDO_MODULE_SOLE_NAME,
      warning,
      planPath: LEGACY_ROOT_PLAN_REL,
      sets: unstamped,
    });
  }
  return out;
}
