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
`;

/**
 * Header comment written when the scaffold CREATES docs/modules.yaml
 * (ruling Q1: an absent manifest is created with a purpose + syntax
 * explainer before the first entry).
 */
export const MODULES_YAML_HEADER = `${MODULES_YAML_HEADER_COMMENTS}modules:
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
 * Set 091 S1 (verdict amendment 3): an EMPTY `modules:` line —
 * flow-style `modules: []` or a `modules:` that parses to YAML null. The
 * null alternation mirrors the YAML 1.2 core-schema spellings the reader
 * accepts (S1 verification R3: bare, `~`, `null`, `Null`, `NULL` — the
 * accepted and appendable domains must match; other casings like `nUll`
 * parse as strings and stay invalid on both sides). YAML permits the
 * root mapping to be indented, so leading whitespace is captured (S1
 * verification R1: a root-indented `  modules: []` classifies valid-empty
 * and must grow like the column-0 form) — commented examples still never
 * match. An optional trailing comment on the line is captured (and
 * preserved by the replacement). A NESTED `modules:` key under another
 * mapping can also match (S1 verification R2), which is why the caller
 * receives one candidate per match and validates each against the
 * parse-after-append guard before selecting a write. A quoted key
 * (`"modules":` / `'modules':`) matches too, quote style preserved (S1
 * R4 third-provider adjudication: quoted keys are the cheap hardening;
 * remaining exotic serializations — multiline flow lists, tags, anchors
 * — are an adjudicated-minor residual that refuses loudly by design).
 */
const EMPTY_MODULES_LINE_RE =
  /^([ \t]*)(["']?)modules\2:[ \t]*(?:\[[ \t]*\]|~|null|Null|NULL)?[ \t]*(#[^\r\n]*)?\r?$/gm;

/**
 * Candidate rewrites that replace an empty `modules:` list marker with
 * its first block-style entry — one candidate per matching line, in file
 * order. Each is format-preserving (every other byte of the file
 * survives; a trailing comment on the `modules:` line is kept; an
 * indented key keeps its indentation, with the entry block re-indented
 * to nest under it). The caller MUST validate a candidate with the
 * parse-after-append guard before writing it: a matching line may be a
 * nested `modules:` key under another mapping (S1 verification R2), and
 * only the guard can tell whether the ROOT modules list gained the entry
 * (routed architecture ruling, s1-empty-manifest-architecture.json).
 * Empty array = no empty-form line exists; the caller falls back to the
 * plain append.
 */
export function replaceEmptyModulesList(
  text: string,
  entryBlock: string,
): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(EMPTY_MODULES_LINE_RE)) {
    const indent = m[1];
    const quote = m[2];
    const comment = m[3] ? ` ${m[3]}` : "";
    const after = text.slice(m.index! + m[0].length);
    const block = (entryBlock.endsWith("\n") ? entryBlock.slice(0, -1) : entryBlock)
      .split("\n")
      .map((line) => indent + line)
      .join("\n");
    out.push(
      text.slice(0, m.index) +
        `${indent}${quote}modules${quote}:${comment}\n` +
        block +
        (after === "" ? "\n" : after),
    );
  }
  return out;
}

/**
 * Scaffold one new module: write the plan stub (skip-existing — an
 * operator's real plan is never clobbered), then append the manifest
 * entry. The stub is written FIRST: an orphan stub is harmless, while a
 * manifest entry pointing at a missing plan would dangle.
 *
 * A valid EMPTY manifest (`modules: []` or a bare `modules:` — Set 091
 * S1, verdict amendment 3) is grown by replacing the empty-list marker
 * with the first block-style entry; populated manifests keep the plain
 * text append.
 *
 * Fail-loud contract (ruling Q1 + the repo's untrusted-input posture):
 * throws an operator-readable Error — never writes — when the slug fails
 * validation, when a PRESENT docs/modules.yaml is not a valid module
 * manifest (appending to a broken file would compound the damage), or
 * when the appended candidate text does not parse back to the expected
 * entry list (e.g. a populated flow-style `modules: [...]`, or
 * `modules:` not being the last top-level key — YAML shapes a plain
 * append cannot extend).
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
  let candidate: string | null = null;
  const manifestCreated = classified.kind === "absent";
  if (manifestCreated) {
    candidate = MODULES_YAML_HEADER + entryBlock;
  } else {
    const current = fs.readFileSync(manifestAbs, "utf8");
    // Set 091 S1: a valid-empty manifest (zero parsed entries) grows by
    // replacing the empty `modules:` marker with the first block-style
    // entry — a plain text append cannot extend either empty form. S1
    // verification R2: several lines can look like the empty form (e.g.
    // a NESTED modules: key under another mapping earlier in the file),
    // so each candidate is checked against the parse guard and the first
    // one that lands the entry in the ROOT modules list wins.
    if (existing.length === 0) {
      for (const replaced of replaceEmptyModulesList(current, entryBlock)) {
        try {
          assertAppendedManifestParses(
            replaced,
            slug,
            existing.length + 1,
            entryBlock,
          );
          candidate = replaced;
          break;
        } catch {
          // Wrong site (nested key) or unappendable — try the next line.
        }
      }
    }
    if (candidate === null) {
      // No empty-form line produced a valid result: plain append, with
      // the guard below as the loud refusal path (e.g. an
      // all-dropped-entries manifest must refuse on the entry-count
      // check, never write).
      candidate =
        (current.endsWith("\n") ? current : current + "\n") + entryBlock;
    }
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
 * else (parse error, populated flow-style list, `modules:` not last, the
 * entry attaching to a different key, an all-dropped-entries list the
 * empty-form replacement mistook for empty) is a refusal with the
 * copyable entry block so the operator can place it by hand. Set 091 S1:
 * this guard now PASSES on the empty→first-entry transition it
 * previously refused, because the empty form is replaced upstream rather
 * than appended past.
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
        "is probably flow-style, holds entries the manifest reader " +
        "dropped, or is not the last top-level key",
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
  | { kind: "invalid-manifest"; entry: null };

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
