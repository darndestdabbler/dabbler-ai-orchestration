// Set 087 Session 3: shared module-authoring logic — the "New module"
// scaffold (append a docs/modules.yaml entry + create the module's
// project-plan stub) and the module-target picker the authoring flows
// (plan prompt, plan import, decomposition prompt) share. One
// unit-testable module invoked by both the `dabbler.newModule` palette
// command and the Getting Started form's `new-module` action (routed
// architecture ruling, saved raw at docs/session-sets/087-.../
// s3-authoring-scaffold-architecture.json, Q1/Q2/Q4).
//
// Invariants carried from the operator-approved design (recommendation
// §2.4/§2.5): `module` is a GROUPING attribute, never identity —
// session-set names stay globally unique across all modules; `codeRoots`
// may legitimately be [] (an integration module); Phase 1 ships no
// enforcement machinery.

import * as fs from "fs";
import * as path from "path";
import * as YAML from "yaml";
import { MODULES_MANIFEST_REL, readModulesManifest } from "./fileSystem";
import { ModuleManifestEntry } from "../types";

/** The manifest path as shown to operators (forward-slashed on every OS). */
export const MODULES_MANIFEST_DISPLAY = MODULES_MANIFEST_REL.replace(/\\/g, "/");

/** The kebab-case shape a module slug must match (ruling Q1). */
export const MODULE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validate a prospective module slug against the shape rule and the
 * manifest's existing slugs. Returns an operator-readable error message,
 * or null when the slug is acceptable — the exact contract
 * `vscode.window.showInputBox`'s `validateInput` wants, so the palette
 * flow and the scaffold's own fail-loud re-check share one rule.
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
 * S3 verification round 1 (Major): the authoring flows must distinguish a
 * truly ABSENT manifest (the designed repo-level fallback) from a PRESENT
 * but unusable one (a config error that must fail loud — silently
 * producing unstamped, repo-level output in a module-organized repo is
 * exactly the wrong-destination hazard). `readModulesManifest` returns
 * null for both, so this classifier re-checks the directory entry the
 * same way the reader does (lstat, so a dangling symlink still counts as
 * present).
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

/** The operator-facing invalid-manifest refusal, shared by every flow. */
export const INVALID_MANIFEST_MESSAGE =
  `${MODULES_MANIFEST_DISPLAY} exists but is not a valid module manifest ` +
  `(expected a YAML mapping with a "modules:" list). Fix the file by hand ` +
  `before using the module-aware flows.`;

/**
 * Header comment written when the scaffold CREATES docs/modules.yaml
 * (ruling Q1: an absent manifest is created with a purpose + syntax
 * explainer before the first entry).
 */
export const MODULES_YAML_HEADER = `# docs/modules.yaml — the module manifest (Dabbler module-organized projects).
#
# Each entry declares one module of this repo:
#   slug:      machine identity (kebab-case). Session sets declare
#              \`module: <slug>\` in their spec.md configuration block and the
#              Session Set Explorer groups them under this module.
#   title:     the display name the Explorer shows for the group.
#   codeRoots: the code paths this module owns ([] for an integration
#              module that only composes other modules).
#   planPath:  the module's project plan (decomposed into session sets).
#   touches:   optional — the modules an integration module is sanctioned
#              to work across; owners of every touched module review its PRs.
#
# Explorer display order = this file's order. Session-set NAMES stay
# globally unique across ALL modules — \`module\` is a grouping attribute,
# never part of a set's identity.
modules:
`;

/**
 * The statically formatted YAML block for one new module entry — appended
 * verbatim (format-preserving append, ruling Q1: never re-serialize the
 * operator's manifest, which would destroy comments and formatting).
 * `title` is emitted JSON-quoted (valid YAML double-quoted scalar) so free
 * text can never break the document; `slug` is shape-validated upstream.
 */
export function renderModuleManifestEntry(
  slug: string,
  title: string,
  planRelPath: string,
): string {
  return (
    `  - slug: ${slug}\n` +
    `    title: ${JSON.stringify(title)}\n` +
    `    codeRoots: []                # TODO: the code paths this module owns, e.g. [src/${slug}]\n` +
    `    planPath: ${planRelPath}\n`
  );
}

/** The minimal module project-plan stub (ruling Q1: H1 + TODO body). */
export function renderModulePlanStub(slug: string, title: string): string {
  return `# ${title} — module project plan

> Module: \`${slug}\` (declared in \`docs/modules.yaml\`)
> Owner: TODO — name the developer(s) who own this module.

TODO: describe this module's goals, phases, and key deliverables. When the
plan is ready, decompose it into session sets: run "Dabbler: Generate
Session-Set Prompt" and pick this module — each generated set is stamped
\`module: ${slug}\` and grouped under this module in the Session Set
Explorer. Session-set names stay globally unique across all modules; we
recommend including \`${slug}\` in each set's name.
`;
}

export interface NewModuleScaffoldResult {
  /** Repo-relative manifest path (forward-slashed, for display). */
  manifestRel: string;
  /** Repo-relative plan-stub path (forward-slashed). */
  planRel: string;
  /** True when docs/modules.yaml was created (vs appended to). */
  manifestCreated: boolean;
  /** True when the plan stub was written (false: existing plan kept). */
  planCreated: boolean;
}

/**
 * Scaffold one new module: write the plan stub (skip-existing — an
 * operator's real plan is never clobbered), then append the manifest
 * entry. The stub is written FIRST: an orphan stub is harmless, while a
 * manifest entry pointing at a missing plan would dangle.
 *
 * Fail-loud contract (ruling Q1 + the repo's untrusted-input posture):
 * throws an operator-readable Error — never writes — when the slug fails
 * validation, when a PRESENT docs/modules.yaml is not a valid module
 * manifest (appending to a broken file would compound the damage), or
 * when the appended candidate text does not parse back to the expected
 * entry list (e.g. a flow-style `modules: []`, or `modules:` not being
 * the last top-level key — YAML shapes a plain append cannot extend).
 */
export function scaffoldNewModule(
  root: string,
  rawSlug: string,
  rawTitle: string,
): NewModuleScaffoldResult {
  const slug = (rawSlug ?? "").trim();
  const classified = classifyModulesManifest(root);
  const existing = classified.kind === "present" ? classified.entries : [];
  const slugError = validateNewModuleSlug(
    slug,
    existing.map((e) => e.slug),
  );
  if (slugError) throw new Error(slugError);

  const manifestAbs = path.join(root, MODULES_MANIFEST_REL);
  if (classified.kind === "invalid") {
    throw new Error(INVALID_MANIFEST_MESSAGE);
  }

  const title = (rawTitle ?? "").trim() || slug;
  const planRel = defaultModulePlanPath(slug);
  const entryBlock = renderModuleManifestEntry(slug, title, planRel);

  // Build + validate the manifest candidate BEFORE any write, so a
  // refusal leaves the workspace untouched.
  let candidate: string;
  const manifestCreated = classified.kind === "absent";
  if (manifestCreated) {
    candidate = MODULES_YAML_HEADER + entryBlock;
  } else {
    const current = fs.readFileSync(manifestAbs, "utf8");
    candidate = (current.endsWith("\n") ? current : current + "\n") + entryBlock;
  }
  assertAppendedManifestParses(
    candidate,
    slug,
    existing.length + 1,
    entryBlock,
  );

  // Plan stub (skip-existing).
  const planAbs = path.join(root, ...planRel.split("/"));
  let planCreated = false;
  if (!fs.existsSync(planAbs)) {
    fs.mkdirSync(path.dirname(planAbs), { recursive: true });
    fs.writeFileSync(planAbs, renderModulePlanStub(slug, title), {
      encoding: "utf8",
    });
    planCreated = true;
  }

  fs.writeFileSync(manifestAbs, candidate, { encoding: "utf8" });
  return {
    manifestRel: MODULES_MANIFEST_DISPLAY,
    planRel,
    manifestCreated,
    planCreated,
  };
}

/**
 * The parse-after-append guard: the candidate text must parse to a
 * mapping whose `modules:` list gained exactly the new entry. Anything
 * else (parse error, flow-style empty list, `modules:` not last, the
 * entry attaching to a different key) is a refusal with the copyable
 * entry block so the operator can place it by hand.
 */
function assertAppendedManifestParses(
  candidate: string,
  slug: string,
  expectedCount: number,
  entryBlock: string,
): void {
  const refuse = (why: string): never => {
    throw new Error(
      `Could not append the module entry to ${MODULES_MANIFEST_DISPLAY} ` +
        `automatically (${why}). Add this entry to the "modules:" list by ` +
        `hand:\n${entryBlock}`,
    );
  };
  let doc: unknown;
  try {
    doc = YAML.parse(candidate);
  } catch {
    return refuse(
      'appending requires the "modules:" block list to be the last ' +
        "top-level key",
    );
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return refuse("the result is not a YAML mapping");
  }
  const modules = (doc as Record<string, unknown>).modules;
  if (!Array.isArray(modules)) return refuse('no "modules:" list survived');
  const slugs = modules
    .filter(
      (m): m is Record<string, unknown> =>
        m !== null && typeof m === "object" && !Array.isArray(m),
    )
    .map((m) => (typeof m.slug === "string" ? m.slug.trim() : ""))
    .filter((s) => s !== "");
  if (modules.length !== expectedCount || !slugs.includes(slug)) {
    return refuse(
      'the appended entry did not land in the "modules:" list — the list ' +
        "is probably flow-style ([]) or not the last top-level key",
    );
  }
}

// ---------- module-target resolution (the authoring flows' picker) ----------

/**
 * How an authoring flow (plan prompt / plan import / decomposition
 * prompt) resolves its module target from the manifest (ruling Q2/Q4):
 * no usable manifest → today's repo-level behavior, unchanged; exactly
 * one module → auto-target it (with an operator-visible notice); two or
 * more → ask.
 */
export type ModuleTargetResolution =
  | { kind: "none" }
  | { kind: "auto"; entry: ModuleManifestEntry }
  | { kind: "pick"; entries: ModuleManifestEntry[] };

export function resolveModuleTarget(
  entries: ModuleManifestEntry[] | null,
): ModuleTargetResolution {
  if (!entries || entries.length === 0) return { kind: "none" };
  if (entries.length === 1) return { kind: "auto", entry: entries[0] };
  return { kind: "pick", entries };
}

/**
 * A module's plan path (forward-slashed, repo-relative): the manifest's
 * explicit `planPath` when present, the canonical default otherwise.
 */
export function modulePlanRelPath(entry: ModuleManifestEntry): string {
  const p =
    entry.planPath && entry.planPath.trim() !== ""
      ? entry.planPath.trim()
      : defaultModulePlanPath(entry.slug);
  return p.replace(/\\/g, "/");
}

/** One QuickPick row of the module picker. */
export interface ModulePickItem {
  label: string;
  description: string;
  detail: string;
  entry: ModuleManifestEntry;
}

/** The injectable UI surface the picker needs (unit-testable). */
export interface ModulePickUi {
  showQuickPick(
    items: ModulePickItem[],
    options: { placeHolder: string; ignoreFocusOut: boolean },
  ): Thenable<ModulePickItem | undefined>;
  showInformationMessage(message: string): unknown;
  /** S3 verification R1: the invalid-manifest refusal surface. */
  showErrorMessage(message: string): unknown;
}

export type ModulePickOutcome =
  | { kind: "none"; entry: null }
  | { kind: "picked"; entry: ModuleManifestEntry }
  | { kind: "cancelled"; entry: null }
  /** S3 verification R1 (Major): a PRESENT-but-unusable manifest aborts
   * the flow with an error — callers treat it like a cancel, never like
   * the repo-level fallback (which is reserved for a truly absent
   * manifest). */
  | { kind: "invalid-manifest"; entry: null };

/**
 * Resolve the module an authoring flow should target. Reads the manifest
 * itself so every caller shares one precedence: truly ABSENT manifest →
 * repo-level flow; PRESENT-but-invalid manifest → error + abort (S3
 * verification R1 — a config error must never silently produce
 * unstamped repo-level output in a module-organized repo); one module →
 * auto-selected with a notice (ruling Q2 — the operator must see which
 * module the flow silently targeted); many → QuickPick (Esc cancels the
 * whole flow, never falls back silently).
 */
export async function pickModuleForAuthoring(
  root: string,
  ui: ModulePickUi,
): Promise<ModulePickOutcome> {
  const classified = classifyModulesManifest(root);
  if (classified.kind === "invalid") {
    ui.showErrorMessage(INVALID_MANIFEST_MESSAGE);
    return { kind: "invalid-manifest", entry: null };
  }
  const target = resolveModuleTarget(
    classified.kind === "present" ? classified.entries : null,
  );
  if (target.kind === "none") return { kind: "none", entry: null };
  if (target.kind === "auto") {
    ui.showInformationMessage(
      `Using module "${target.entry.title}" (${target.entry.slug}) — the ` +
        `only module in ${MODULES_MANIFEST_DISPLAY}.`,
    );
    return { kind: "picked", entry: target.entry };
  }
  const picked = await ui.showQuickPick(
    target.entries.map((e) => ({
      label: e.title,
      description: e.slug,
      detail: `plan: ${modulePlanRelPath(e)}`,
      entry: e,
    })),
    { placeHolder: "Which module is this for?", ignoreFocusOut: true },
  );
  if (!picked) return { kind: "cancelled", entry: null };
  return { kind: "picked", entry: picked.entry };
}
