// Pure data-layer helpers shared by the tree model: bucketing, sorting,
// row markers, and the visible-module computation. No vscode import.

import { SessionSet, SessionState } from "../types";
import {
  LEGACY_ROOT_PLAN_REL,
  resolveModulePlanRelPath,
} from "../utils/moduleAuthoring";
import type { ModulesManifestClassification } from "../utils/moduleAuthoring";
import { listInProgressSets } from "./inProgressSetsService";
import { isRecognizedVerdictToken } from "../utils/verdictTokens";

export const ICON_FILES: Record<SessionState, string> = {
  complete: "done.svg",
  "in-progress": "in-progress.svg",
  "not-started": "not-started.svg",
  cancelled: "cancelled.svg",
};

export function isCurrentSessionInFlight(set: SessionSet): boolean {
  return set.currentSession != null;
}

export function progressText(set: SessionSet): string {
  // Always show X/total: an "X/X" shape on done rows would mask a
  // set-level flip to complete that fired before all sessions ran.
  const base =
    set.totalSessions && set.totalSessions > 0
      ? `${set.sessionsCompleted}/${set.totalSessions}`
      : set.sessionsCompleted > 0
        ? `${set.sessionsCompleted} complete`
        : "";
  if (set.state === "complete" && base) {
    return `${base} Complete`;
  }
  if (set.state === "in-progress" && isCurrentSessionInFlight(set)) {
    const annotation = `session ${set.currentSession} in flight`;
    return base ? `${base} · ${annotation}` : annotation;
  }
  return base;
}

export function touchedDate(set: SessionSet): string {
  if (!set.lastTouched) return "";
  return new Date(set.lastTouched).toLocaleDateString("en-CA");
}

/** Surfaces the rare close that bypassed the gates via --force. */
export function forceClosedBadge(set: SessionSet): string {
  return set.forceClosed ? "[FORCED]" : "";
}

// Quiet blocked-by-prerequisites marker. Suppressed on terminal rows:
// a closed set's dependency status is no longer actionable.
// U+26D3 CHAINS + U+FE0E so it renders as a theme-colored text glyph.
export const BLOCKED_MARKER = "⛓︎";

function targetStateLabel(state: string): string {
  switch (state) {
    case "in-progress":
      return "in progress";
    case "not-started":
      return "not started";
    case "unknown":
      return "unknown set — check the slug";
    default:
      return state;
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

/** A verdict that must not render as a pass: unrecognized, or a failure token.
 * REMEDIATED_AT_CAP is unclean on purpose — the work landed, but no verifier
 * reviewed the repair, and a row that reads as a pass would hide that. */
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

// In-progress / complete / cancelled sort by lastTouched desc;
// not-started by name asc (fresh rows in a stable order).
export function sortBucket(subset: SessionSet[], groupKey: SessionState): SessionSet[] {
  const out = subset.slice();
  if (groupKey === "not-started") {
    out.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    out.sort((a, b) => (b.lastTouched || "").localeCompare(a.lastTouched || ""));
  }
  return out;
}

/**
 * Which buckets exist, in what order, with their sets sorted. The three
 * default buckets always render (empty ones included); Cancelled only
 * when non-empty; in-progress ordered oldest-in-flight first.
 */
export interface OrderedBucket {
  key: SessionState;
  label: string;
  sets: SessionSet[];
}

export function orderedBuckets(subset: SessionSet[]): OrderedBucket[] {
  const buckets = bucketSets(subset);
  const groups: OrderedBucket[] = [
    {
      key: "in-progress",
      label: "In Progress",
      sets: listInProgressSets(buckets.inProgress),
    },
    {
      key: "not-started",
      label: "Not Started",
      sets: sortBucket(buckets.notStarted, "not-started"),
    },
    {
      key: "complete",
      label: "Complete",
      sets: sortBucket(buckets.complete, "complete"),
    },
  ];
  if (buckets.cancelled.length > 0) {
    groups.push({
      key: "cancelled",
      label: "Cancelled",
      sets: sortBucket(buckets.cancelled, "cancelled"),
    });
  }
  return groups;
}

// ---------------------------------------------------------------------------
// The visible-module computation: declared modules in manifest order (all
// of them — zero-set modules still render), then one fallback group per
// undeclared stamped slug (alphabetical, warning-flagged, never hidden),
// then the pseudo-module holding unstamped sets.
// ---------------------------------------------------------------------------

/** The pseudo-module's label when it is the only visible module. */
export const PSEUDO_MODULE_SOLE_NAME = "Default";
/** The pseudo-module's label once any other module group coexists. */
export const PSEUDO_MODULE_COEXIST_NAME = "Unassigned";

export type VisibleModuleWarning =
  | { code: "manifest-missing" }
  | { code: "manifest-invalid" }
  | { code: "unstamped-sets" }
  | { code: "undeclared-slug"; rawSlug: string };

export interface VisibleModule {
  /**
   * `declared` = a docs/modules.yaml entry (even with zero sets);
   * `fallback` = an observed stamp slug the manifest does not declare;
   * `pseudo` = the module of unstamped sets.
   */
  kind: "declared" | "fallback" | "pseudo";
  slug: string | null;
  displayName: string;
  warning: VisibleModuleWarning | null;
  planPath: string | null;
  sets: readonly SessionSet[];
}

export interface VisibleModulesOptions {
  /**
   * Whether the repo-level docs/planning/project-plan.md exists — the
   * legacy root plan keeps the pseudo-module visible even when every
   * set is stamped.
   */
  legacyRootPlanExists: boolean;
}

export interface RenderableModuleSnapshot {
  modules: readonly VisibleModule[];
  retainedLastKnownGood: boolean;
}

/**
 * Keep the last usable module tree while a present manifest is invalid.
 * Absent and valid-empty manifests are healthy states and always replace
 * the prior snapshot.
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
 * classification plus the scanned sets. Attribution is re-derived from
 * each set's raw declared stamp (`config.module`) so this is a total
 * function of its declared inputs — and correct for the absent/invalid
 * classifications, where the scan stamps null on every set and the raw
 * value is the only record of an observed slug.
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
    // unstamped-sets advisory. manifest-missing fires only when sets
    // exist (a pristine repo's sole Default module is the designed
    // starting point, not a fault); unstamped-sets fires only when
    // other groups coexist.
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

/**
 * Merge root-scoped visible-module computations into the global module
 * list. Declared modules share identity by slug; fallback modules stay
 * distinct so their warning cannot disappear; one pseudo-module combines
 * all unstamped work and renders last.
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
  out.push(
    ...Array.from(fallback.values()).sort((a, b) =>
      a.slug!.localeCompare(b.slug!),
    ),
  );
  const mergedPseudo = pseudo as VisibleModule | null;
  if (mergedPseudo) {
    out.push({
      ...mergedPseudo,
      displayName:
        out.length === 0 ? PSEUDO_MODULE_SOLE_NAME : PSEUDO_MODULE_COEXIST_NAME,
    });
  }
  return out;
}
