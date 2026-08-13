// Set 087 Session 3, trimmed to READ-ONLY by Set 122 Session 2.
//
// This module used to be both the module-authoring WRITERS (scaffold,
// rename, delete, assign-sets, lifecycle-set scaffolding) and the shared
// read/validate/pick helpers. The writers are gone: every transactional
// module operation now runs through `python -m ai_router.modules`
// (multi-module verdict §4, operator-confirmed), reached from
// `utils/moduleLifecycleCli.ts`. Keeping a TypeScript copy would restore
// the two-implementations defect the port exists to remove — and the
// TypeScript delete path was what reached the `session-state.json` writer
// that only the router's sanctioned writers may be.
//
// What remains is everything the extension must do SYNCHRONOUSLY, in
// process, without spawning anything: validate a slug while the operator
// types it, classify the manifest for the tree, resolve a module's plan
// path, pick a module, and classify a module's sets so the delete confirm
// can enumerate what will happen BEFORE the CLI is asked to do it.
// `ensureModulesManifest` also stays: it creates the empty manifest
// template as part of repo bootstrap and never writes an entry, so it is
// not part of the lifecycle the router owns.
//
// Invariants carried from the operator-approved design (recommendation
// §2.4/§2.5): `module` is a GROUPING attribute, never identity —
// session-set names stay globally unique across all modules; `codeRoots`
// may legitimately be [] (an integration module); Phase 1 ships no
// enforcement machinery.

import * as fs from "fs";
import * as path from "path";
import {
  MODULES_MANIFEST_REL,
  SESSION_SETS_REL,
  listSessionSetDirNames,
  parseSessionSetConfig,
  readModulesManifest,
  writeFileExclusiveSync,
} from "./fileSystem";
import { isCancelled, readCancellationState } from "./cancelLifecycle";
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
 * Set 091 S2 (verdict amendment 2, legacy root-plan mapping): the
 * repo-level project plan is the PSEUDO-module's plan — the default
 * `planPath` for the module that holds unstamped sets — so the Set 093
 * `Plan` node state and the Set 094 form semantics inherit one rule.
 * Always carried on the pseudo-module's `VisibleModule` element; whether
 * the file exists is the consumer's separate present/missing check
 * (routed ruling Q7, s2-visible-module-architecture-2.json). The wizard
 * flows (`planImport.ts`, `sessionGenPrompt.ts`) predate this constant
 * and keep equal local literals; unifying them onto this export is Set
 * 093's interaction-model work, not this set's (no behavior seam here —
 * the strings are identical).
 */
export const LEGACY_ROOT_PLAN_REL = "docs/planning/project-plan.md";

/**
 * S3 verification round 1 (Major): the authoring flows must distinguish a
 * truly ABSENT manifest (the designed repo-level fallback) from a PRESENT
 * but unusable one (a config error that must fail loud — silently
 * producing unstamped, repo-level output in a module-organized repo is
 * exactly the wrong-destination hazard). `readModulesManifest` returns
 * null for both, so this classifier re-checks the directory entry the
 * same way the reader does (lstat, so a dangling symlink still counts as
 * present).
 *
 * Set 091 S1 (verdict amendment 3): a VALID EMPTY manifest — flow-style
 * `modules: []` or a bare `modules:` (YAML null) — classifies
 * `{ kind: "present", entries: [] }`, and every authoring flow treats
 * zero entries exactly like an absent manifest (single pseudo-module, no
 * QuickPick, no `module:` stamp). Whether the empty form is *textually
 * replaceable* is the appender's separate concern (routed architecture
 * ruling, s1-empty-manifest-architecture.json — no distinct
 * "present-empty" union member).
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
 * The Set 087 header comment block — the purpose + syntax explainer that
 * opens every scaffolded docs/modules.yaml (shared by the append-path
 * header and the Set 091 canonical template).
 */
const MODULES_YAML_HEADER_COMMENTS = `# docs/modules.yaml — the module manifest (Dabbler module-organized projects).
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
#
# To have an AI assistant decompose this project into modules and fill this
# file in, run the "Dabbler: Copy Module Decomposition Prompt" command
# (Command Palette) — then paste the copied prompt into your assistant.
#
# Renaming, deleting, splitting, or merging modules later (and adopting
# modules in an older repo) is covered in the module reorganization guide:
# https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/module-reorganization.md
`;

/**
 * Set 091 S1 (verdict amendment 3): the canonical always-present
 * modules.yaml template — the Set 087 header comments, commented-out
 * example entries, and a valid EMPTY \`modules: []\` list (gpt-5-4's
 * adopted shape). It classifies as a valid empty manifest and the
 * appender grows it into its first block-style entry (round-trip
 * test-pinned). Defined and tested here; Set 094 wires it into the
 * scaffold / ensure-write triggers (adjudication A: explicit user
 * action only, never activation).
 */
export const MODULES_YAML_TEMPLATE = `${MODULES_YAML_HEADER_COMMENTS}#
# Example entries (copy below \`modules:\`, uncommented, to declare this
# repo's modules — or leave the list empty for a single-module repo):
#
# - slug: payment-api
#   title: "Payment API"
#   codeRoots:
#     - src/payment
#   planPath: docs/modules/payment-api/project-plan.md
# - slug: integration
#   title: "Cross-Module Integration"
#   codeRoots: []
#   planPath: docs/modules/integration/project-plan.md
#   touches:
#     - payment-api

modules: []
`;

/**
 * Set 094 (adjudication A): the injectable fs surface {@link
 * ensureModulesManifest} needs. `writeFileExclusive` MUST fail with an
 * `EEXIST`-coded error when a directory entry already exists at the path — a
 * file, a directory, or a symlink (including a DANGLING one, never followed) —
 * so the ensure-write can never overwrite an existing / invalid / symlinked
 * manifest (the Set 092 guardrails keep owning a present-but-invalid one). The
 * real implementations use the cross-platform {@link writeFileExclusiveSync}:
 * a hard-link publish (temp-write → `link()`) is the safety mechanism — it
 * fails `EEXIST` on any existing destination entry without following a symlink,
 * even one that races in — with a no-follow `lstat` fast-path so an existing
 * manifest is recognized without staging a temp beside it (round-4/6 verifier
 * catches: an O_EXCL `wx` write follows reparse points on Windows; a
 * temp-write-before-check breaks on a read-only `docs/`).
 */
export interface EnsureManifestIo {
  /** Create the parent directory (recursive; no-op when present). */
  mkdirp(absDir: string): void;
  /**
   * Create `abs` with `data`, or throw an `EEXIST`-coded error when a
   * directory entry already exists there (a symlink counts, never followed).
   */
  writeFileExclusive(abs: string, data: string): void;
}

const NODE_ENSURE_MANIFEST_IO: EnsureManifestIo = {
  mkdirp: (dir) => fs.mkdirSync(dir, { recursive: true }),
  writeFileExclusive: (abs, data) => writeFileExclusiveSync(abs, data),
};

export interface EnsureModulesManifestResult {
  /** True iff this call CREATED docs/modules.yaml (false: it already existed). */
  created: boolean;
  /** Repo-relative manifest path (forward-slashed, for display). */
  manifestRel: string;
}

/**
 * Set 094 (adjudication A): create `docs/modules.yaml` from the canonical
 * {@link MODULES_YAML_TEMPLATE} IFF it does not already exist — the
 * idempotent, skip-existing "ensure" the explicit-action sites share (the
 * scaffold, the form's + toolbar's *Open modules.yaml*, and the
 * copy-decomposition prompt), mirroring the Set 077 S4
 * `ensureCrossProviderVerificationDoc` precedent.
 *
 * NEVER inspects validity: a present-but-invalid manifest is left untouched
 * (the Set 092 guardrails own it) — the exclusive create fails `EEXIST` on
 * ANY existing entry (valid, invalid, or symlink) and the call reports
 * `created: false`. It is an EXPLICIT-ACTION primitive: no activation,
 * watcher, or tree-render path may call it (the never-write-on-activation
 * invariant, adjudication A).
 */
export function ensureModulesManifest(
  root: string,
  io: EnsureManifestIo = NODE_ENSURE_MANIFEST_IO,
): EnsureModulesManifestResult {
  const abs = path.join(root, MODULES_MANIFEST_REL);
  io.mkdirp(path.dirname(abs));
  try {
    io.writeFileExclusive(abs, MODULES_YAML_TEMPLATE);
    return { created: true, manifestRel: MODULES_MANIFEST_DISPLAY };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      return { created: false, manifestRel: MODULES_MANIFEST_DISPLAY };
    }
    throw err;
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
 * S3 verification R2 (Major): a manifest `planPath` is a WRITE
 * destination (`importPlanFromFile` copies onto it), so a
 * repository-controlled value must never escape the workspace. True iff
 * the (already forward-slashed) path is non-empty, not absolute, not
 * drive-qualified, and free of `..` / empty segments.
 */
export function isSafeRepoRelativePath(p: string): boolean {
  if (p === "") return false;
  if (p.startsWith("/")) return false; // absolute (and "//" UNC)
  if (/^[A-Za-z]:/.test(p)) return false; // drive-qualified
  return p.split("/").every((seg) => seg !== ".." && seg !== "");
}

/**
 * PURE resolution of a module's plan path (forward-slashed,
 * repo-relative): the manifest's explicit `planPath` when present AND
 * safely repo-relative, the canonical default otherwise. `degraded`
 * reports that an unsafe manifest value (absolute, drive-qualified, or
 * traversal — S3 verification R2) was replaced by the default, so a
 * boundary caller can surface the diagnostic. No side effects — Set 091
 * S2 verification R4: `computeVisibleModules` is a pure model function
 * and must not log; warning emission stays in {@link modulePlanRelPath},
 * the interactive flows' wrapper.
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

/**
 * A module's plan path, with the unsafe-value degradation logged
 * (mirroring the S1 tolerant-reader posture) — the wrapper the
 * interactive authoring flows call. `importPlanFromFile` additionally
 * refuses any resolved destination outside the workspace before touching
 * the filesystem (defense in depth — e.g. a hostile `slug` composed into
 * the default).
 */
export function modulePlanRelPath(entry: ModuleManifestEntry): string {
  const resolved = resolveModulePlanRelPath(entry);
  if (resolved.degraded) {
    console.warn(
      `[dabblerSessionSets] module "${entry.slug}" declares planPath ` +
        `${JSON.stringify(entry.planPath)}, which is not a safe ` +
        `repo-relative path — using the default ${resolved.path} instead.`,
    );
  }
  return resolved.path;
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
  | { kind: "invalid-manifest"; entry: null }
  /** Set 093 S2 (routed ruling D1): a row/context invocation carried an
   * explicit module slug that no longer resolves in the manifest (a stale
   * snapshot — the module was removed between render and click). Fails
   * LOUD (the picker shows {@link unknownModuleMessage}) and aborts;
   * callers treat it like a cancel and NEVER fall back to the repo-level
   * plan — silently misdirecting a module-targeted action to the repo
   * plan is exactly the wrong-destination hazard. */
  | { kind: "unknown-module"; entry: null };

/** The operator-facing refusal when a preselected module no longer
 * resolves (Set 093 S2 routed ruling D1): distinct from the
 * invalid-manifest message (corrupt file) — this is a deleted / renamed
 * module the stale webview row still referenced. */
export function unknownModuleMessage(slug: string): string {
  return (
    `Module "${slug}" is no longer declared in ${MODULES_MANIFEST_DISPLAY} ` +
    `(it may have been removed or renamed). Refresh the Work Explorer and ` +
    `try again.`
  );
}

/** Set 093 S2 (routed ruling D1): options for a row/context invocation
 * that already knows its module target. */
export interface PickModuleForAuthoringOptions {
  /**
   * An EXPLICIT module target from a row/context action — the module is
   * implied by the clicked row, so NO module QuickPick and NO auto-select
   * notice fires (amendment 1's QuickPick retirement). Resolution:
   *   - `""` (empty)     → repo-level flow, exactly `{kind:"none"}` (a
   *                        pseudo row: `Default`/`Unassigned` targets the
   *                        legacy root plan / module-less decomposition).
   *                        A ≥2-module manifest NEVER QuickPicks here.
   *   - `"<declared>"`   → `{kind:"picked", entry}` for that manifest module.
   *   - `"<unresolvable>"`→ `{kind:"unknown-module"}` (stale row — the
   *                        module was removed) with a loud refusal.
   * A PRESENT-but-invalid manifest still aborts FIRST (a config error is
   * fixed before either path). Absent options → today's interactive
   * behavior (the palette paths keep their QuickPick / auto-select notice).
   */
  preselectedSlug?: string;
}

/**
 * Resolve the module an authoring flow should target. Reads the manifest
 * itself so every caller shares one precedence: truly ABSENT manifest →
 * repo-level flow (a valid EMPTY manifest — `modules: []` or a bare
 * `modules:`, Set 091 S1 — resolves identically: single pseudo-module,
 * no QuickPick, no notice); PRESENT-but-invalid manifest → error + abort (S3
 * verification R1 — a config error must never silently produce
 * unstamped repo-level output in a module-organized repo); one module →
 * auto-selected with a notice (ruling Q2 — the operator must see which
 * module the flow silently targeted); many → QuickPick (Esc cancels the
 * whole flow, never falls back silently).
 *
 * Set 093 S2 (routed ruling D1): when `opts.preselectedSlug` is provided
 * — a row/context invocation whose module is implied by the clicked row —
 * the manifest QuickPick and the auto-select notice are BOTH skipped; the
 * slug resolves directly (see {@link PickModuleForAuthoringOptions}). The
 * invalid-manifest abort still fires first: a stale slug against a broken
 * manifest is "invalid", never "unknown".
 */
export async function pickModuleForAuthoring(
  root: string,
  ui: ModulePickUi,
  opts?: PickModuleForAuthoringOptions,
): Promise<ModulePickOutcome> {
  const classified = classifyModulesManifest(root);
  if (classified.kind === "invalid") {
    ui.showErrorMessage(INVALID_MANIFEST_MESSAGE);
    return { kind: "invalid-manifest", entry: null };
  }
  // Set 093 S2 (routed ruling D1): explicit module target from a
  // row/context path — resolve without a QuickPick or a notice.
  if (opts && opts.preselectedSlug !== undefined) {
    const slug = opts.preselectedSlug;
    if (slug === "") return { kind: "none", entry: null }; // pseudo → repo-level
    const entries = classified.kind === "present" ? classified.entries : [];
    const entry = entries.find((e) => e.slug === slug);
    if (!entry) {
      ui.showErrorMessage(unknownModuleMessage(slug));
      return { kind: "unknown-module", entry: null };
    }
    return { kind: "picked", entry };
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



// ---------- Set 099 S2: the module DELETE writer ----------
//
// Delete a declared module (operator's adjudicated rule, spec "Delete
// semantics"): remove the docs/modules.yaml entry; cancel every NON-TERMINAL
// affected set via the existing `cancelSessionSet` writer (audit preserved,
// restorable); remove OUTRIGHT only an unstarted `kind: plan|decomposition`
// scaffold with no execution artifacts (the Set 098/100/101 placeholder);
// completed (and already-cancelled) sets are never touched and reappear in
// the undeclared-slug fallback group if the slug is later re-declared. The
// manifest entry is removed LAST: cancels and scaffold removals are each
// idempotent and safely re-runnable, so a run that stops partway can simply
// be re-invoked — it never leaves the module half-deleted.

/** Session-set artifact filenames that prove REAL execution happened (as
 * opposed to a bare `kind: plan|decomposition` scaffold that only has a
 * spec.md). Deliberately does NOT include `session-state.json`: the file
 * is created by the router's writers (`start_session` /
 * `ensure_session_state_file`) and, before Set 115 S1, was also
 * lazily synthesized onto any spec-only folder the Explorer scanned — so
 * the file's mere presence is not a "this was touched" signal. Only these
 * real artifacts (or a non-`not-started` status inside the state file,
 * checked separately) are. */
const EXECUTION_ARTIFACT_FILENAMES = [
  "activity-log.json",
  "session-events.jsonl",
  "change-log.md",
  "ai-assignment.md",
  "disposition.json",
  "CANCELLED.md",
  "RESTORED.md",
] as const;

function hasExecutionArtifacts(dir: string): boolean {
  return EXECUTION_ARTIFACT_FILENAMES.some((f) => fs.existsSync(path.join(dir, f)));
}

/** File-presence status inference (the Set 7 backfill rules), used when a
 * set has no readable `session-state.json`. Kept here so this module's
 * deletion classification does not depend on the Explorer reader's shape
 * work — and, unlike `readStatus`, it never writes a state file as a side
 * effect. */
function inferLegacyStatus(dir: string): "not-started" | "in-progress" | "complete" {
  if (fs.existsSync(path.join(dir, "change-log.md"))) return "complete";
  if (fs.existsSync(path.join(dir, "activity-log.json"))) return "in-progress";
  return "not-started";
}

/** Non-mutating raw-status read: never calls the Explorer's `readStatus` on
 * the pre-Set-115 path (which would synthesize a state file as a side
 * effect). Absent/unparseable/no-string-status all fall back to
 * {@link inferLegacyStatus}. */
function rawSessionSetStatus(dir: string): "not-started" | "in-progress" | "complete" {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(dir, "session-state.json"), "utf8");
  } catch {
    return inferLegacyStatus(dir);
  }
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return inferLegacyStatus(dir);
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return inferLegacyStatus(dir);
  const status = (doc as Record<string, unknown>).status;
  if (typeof status !== "string") return inferLegacyStatus(dir);
  const canon = status === "completed" || status === "done" ? "complete" : status;
  return canon === "complete" || canon === "in-progress" ? canon : "not-started";
}

/** One set's deletion disposition (spec "Delete semantics"):
 * `"terminal"` — complete, or already cancelled — never touched;
 * `"cancel"` — non-terminal and NOT a removable scaffold — cancelled via
 * `cancelSessionSet`;
 * `"remove"` — an unstarted `kind: plan|decomposition` scaffold with no
 * execution artifacts — its directory is removed outright. */
export type ModuleSetDisposition = "terminal" | "cancel" | "remove";

export interface ModuleSetDeletionClassification {
  name: string;
  dir: string;
  disposition: ModuleSetDisposition;
}

function classifyOneSetForDeletion(
  dir: string,
  kind: string | undefined,
): ModuleSetDisposition {
  // Mirrors readSessionSets' own state-file-first-with-legacy-fallback
  // cancellation read (fileSystem.ts): a set cancelled before it ever had a
  // session-state.json (cancelSessionSet only touches the state file when
  // one already exists) leaves CANCELLED.md as the ONLY signal —
  // readCancellationState alone reports "unknown" for it, which would
  // wrongly re-classify an already-cancelled set as "cancel" and re-cancel
  // it.
  const cancellation = readCancellationState(dir);
  if (cancellation === "cancelled" || (cancellation === "unknown" && isCancelled(dir))) {
    return "terminal";
  }
  const status = rawSessionSetStatus(dir);
  if (status === "complete") return "terminal";
  if (status === "not-started") {
    const k = (kind ?? "").toLowerCase();
    const isLifecycleScaffold = k === "plan" || k === "decomposition";
    if (isLifecycleScaffold && !hasExecutionArtifacts(dir)) return "remove";
  }
  return "cancel";
}

/**
 * Classify every set stamped `module: <slug>` (the same raw-stamp scan
 * {@link renameModule} uses) by its deletion disposition. Exported so the
 * palette command's two-step confirm and the writer itself share ONE
 * classification — the confirm dialog's enumeration is guaranteed to match
 * what the writer actually does, never a second independently-computed
 * guess.
 */
export function classifyModuleSetsForDeletion(
  root: string,
  slug: string,
): ModuleSetDeletionClassification[] {
  const setsRoot = path.join(root, SESSION_SETS_REL);
  const out: ModuleSetDeletionClassification[] = [];
  for (const name of listSessionSetDirNames(root)) {
    const dir = path.join(setsRoot, name);
    const specAbs = path.join(dir, "spec.md");
    const config = parseSessionSetConfig(specAbs);
    if (config.module !== slug) continue;
    out.push({ name, dir, disposition: classifyOneSetForDeletion(dir, config.kind) });
  }
  return out;
}
