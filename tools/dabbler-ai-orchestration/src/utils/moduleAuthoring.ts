// Read-only module-manifest helpers. Every transactional module
// operation runs through `python -m ai_router.modules` (reached from
// utils/moduleLifecycleCli.ts); what remains here is what the extension
// must do SYNCHRONOUSLY, in process: validate a slug while the operator
// types it, classify the manifest for the tree, and resolve a module's
// plan path.
//
// Invariants: `module` is a GROUPING attribute, never identity —
// session-set names stay globally unique across all modules.

import * as fs from "fs";
import * as path from "path";
import { MODULES_MANIFEST_REL, readModulesManifest } from "./fileSystem";
import { ModuleManifestEntry } from "../types";

/** The manifest path as shown to operators (forward-slashed on every OS). */
export const MODULES_MANIFEST_DISPLAY = MODULES_MANIFEST_REL.replace(/\\/g, "/");

/** The kebab-case shape a module slug must match. */
export const MODULE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validate a prospective module slug against the shape rule and the
 * manifest's existing slugs. Returns an operator-readable error message,
 * or null when the slug is acceptable — the exact contract
 * `showInputBox`'s validateInput wants, so the palette flow and the
 * CLI's own fail-loud re-check share one rule.
 */
export function validateNewModuleSlug(
  raw: string,
  existingSlugs: readonly string[],
): string | null {
  const slug = (raw ?? "").trim();
  if (slug === "") {
    return "Enter a module slug (kebab-case, e.g. greeter).";
  }
  if (!MODULE_SLUG_RE.test(slug)) {
    return (
      "Module slugs are kebab-case: lowercase letters and digits, " +
      'joined by single hyphens (e.g. "greeter", "payment-api").'
    );
  }
  if (existingSlugs.includes(slug)) {
    return `Module "${slug}" already exists in ${MODULES_MANIFEST_DISPLAY}.`;
  }
  return null;
}

/** Canonical plan location for a module (forward-slashed, repo-relative). */
export function defaultModulePlanPath(slug: string): string {
  return `docs/modules/${slug}/project-plan.md`;
}

/**
 * The repo-level project plan is the PSEUDO-module's plan — the default
 * planPath for the module that holds unstamped sets. Whether the file
 * exists is the consumer's separate present/missing check.
 */
export const LEGACY_ROOT_PLAN_REL = "docs/planning/project-plan.md";

/**
 * Distinguish a truly ABSENT manifest (the designed repo-level fallback)
 * from a PRESENT but unusable one (a config error that must fail loud).
 * `readModulesManifest` returns null for both, so this classifier
 * re-checks the directory entry the way the reader does (lstat, so a
 * dangling symlink still counts as present). A valid EMPTY manifest
 * classifies `{ kind: "present", entries: [] }`.
 */
export type ModulesManifestClassification =
  | { kind: "absent" }
  | { kind: "invalid" }
  | { kind: "present"; entries: ModuleManifestEntry[] };

export function classifyModulesManifest(
  root: string,
): ModulesManifestClassification {
  const entries = readModulesManifest(root);
  if (entries !== null) return { kind: "present", entries };
  return manifestEntryExists(path.join(root, MODULES_MANIFEST_REL))
    ? { kind: "invalid" }
    : { kind: "absent" };
}

/** Directory-entry presence via lstat (a dangling symlink IS present). */
function manifestEntryExists(abs: string): boolean {
  try {
    fs.lstatSync(abs);
    return true;
  } catch {
    return false;
  }
}

/**
 * A manifest planPath is a write destination for the plan flows, so a
 * repository-controlled value must never escape the workspace: non-empty,
 * not absolute, not drive-qualified, free of `..` / empty segments.
 */
export function isSafeRepoRelativePath(p: string): boolean {
  if (p === "") return false;
  if (p.startsWith("/")) return false; // absolute (and "//" UNC)
  if (/^[A-Za-z]:/.test(p)) return false; // drive-qualified
  return p.split("/").every((seg) => seg !== ".." && seg !== "");
}

/**
 * PURE resolution of a module's plan path (forward-slashed,
 * repo-relative): the manifest's explicit planPath when present AND
 * safely repo-relative, the canonical default otherwise. `degraded`
 * reports that an unsafe manifest value was replaced by the default. No
 * side effects — computeVisibleModules is a pure model function and must
 * not log.
 */
export function resolveModulePlanRelPath(entry: ModuleManifestEntry): {
  path: string;
  degraded: boolean;
} {
  const fallback = defaultModulePlanPath(entry.slug);
  const raw =
    entry.planPath && entry.planPath.trim() !== ""
      ? entry.planPath.trim().replace(/\\/g, "/")
      : "";
  if (raw === "") return { path: fallback, degraded: false };
  if (!isSafeRepoRelativePath(raw)) return { path: fallback, degraded: true };
  return { path: raw, degraded: false };
}
