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

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as YAML from "yaml";
import {
  MODULES_MANIFEST_REL,
  SESSION_SETS_REL,
  listSessionSetDirNames,
  parsePrerequisites,
  parseSessionSetConfig,
  readModulesManifest,
  writeFileExclusiveSync,
} from "./fileSystem";
import { nextSessionSetNumberFrom, numericPrefix } from "./resolveSetNumber";
import { cancelSessionSet, isCancelled, readCancellationState } from "./cancelLifecycle";
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
# (Command Palette) — or the "Copy AI decomposition prompt" button in the
# Getting Started form — then paste the copied prompt into your assistant.
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
  const manifestCreated = classified.kind === "absent";
  // Set 094 (adjudication A): a CREATED manifest starts from the canonical
  // MODULES_YAML_TEMPLATE — the SAME shape the ensure-write sites (scaffold,
  // Open modules.yaml, copy prompt) write — so `New module` on an empty repo
  // produces the identical starting file, then grows it. Otherwise the source
  // is the existing file. Both go through ONE append primitive that differs
  // only in this source string.
  const sourceText = manifestCreated
    ? MODULES_YAML_TEMPLATE
    : fs.readFileSync(manifestAbs, "utf8");

  let candidate: string | null = null;
  // Set 091 S1: a valid-empty manifest (zero parsed entries) — and the
  // created template, which is exactly that shape — grows by replacing the
  // empty `modules:` marker with the first block-style entry (a plain text
  // append cannot extend either empty form). S1 verification R2: several
  // lines can look like the empty form (e.g. a NESTED modules: key under
  // another mapping earlier in the file), so each candidate is checked
  // against the parse guard and the first one that lands the entry in the
  // ROOT modules list wins.
  if (existing.length === 0) {
    for (const replaced of replaceEmptyModulesList(sourceText, entryBlock)) {
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
    // No empty-form line produced a valid result: plain append (a populated
    // manifest), with the guard below as the loud refusal path (e.g. an
    // all-dropped-entries manifest must refuse on the entry-count check,
    // never write).
    candidate =
      (sourceText.endsWith("\n") ? sourceText : sourceText + "\n") + entryBlock;
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

// ---------- Set 093 S2: the spec.md `module:` stamp writer ----------
//
// The `Assign legacy sets to module…` flow (verdict amendment 2) stamps
// `module: <slug>` into each chosen legacy (unstamped) set's spec.md via a
// FORMAT-PRESERVING splice (routed ruling D4): a regex insert as the first
// line after the "Session Set Configuration" block's opening ```yaml fence,
// guarded by a parse-after check — never a YAML round-trip, which would
// destroy the operator's comments and formatting (the S3 modules.yaml
// appender posture, extended here to N files). `module` is a GROUPING
// attribute, never identity: the set's globally-unique NAME is untouched.

/** Where in the spec.md the config block heading + yaml fence live. */
const CONFIG_HEADING_RE = /^##[ \t]+Session Set Configuration[ \t]*$/im;
/** The block's opening yaml fence line (```yaml / ```yml), consumed whole. */
const CONFIG_YAML_FENCE_OPEN_RE = /^```ya?ml[ \t]*\r?\n/im;
/** A closing fence line (```), the block's terminator. */
const CONFIG_FENCE_CLOSE_RE = /^```[ \t]*$/m;
/** A TOP-LEVEL (column-0) `module:` key in a plain fenced block — used only
 * as the duplicate-key defense-in-depth count. Indented `module:` lines (a
 * block scalar / nested mapping) are NOT top-level keys and are excluded. */
const CONFIG_TOP_LEVEL_MODULE_RE = /^module[ \t]*:/gm;

export type StampModuleRefusal =
  | { code: "no-config-block" }
  | { code: "no-yaml-fence" }
  | { code: "already-assigned"; existing: string };

export type StampModuleResult =
  | { kind: "written"; text: string; inserted: string; insertAt: number }
  | { kind: "noop" }
  | { kind: "refused"; reason: StampModuleRefusal };

/**
 * PURE format-preserving splice of `module: <slug>` into a spec.md's
 * "Session Set Configuration" YAML block (routed ruling D4-i). Inserts as
 * the FIRST line after the opening ```yaml fence (col 0 — a plain fenced
 * block's key column), touching no existing key, comment, or byte. Refuses
 * loudly when there is no safe anchor. Idempotent: a set already stamped to
 * `slug` is a `noop`; a set stamped to a DIFFERENT module refuses
 * (`already-assigned`) — a differing stamp on a supposedly-legacy set is a
 * stale snapshot, never silently overwritten.
 */
export function stampModuleIntoSpecText(
  text: string,
  slug: string,
): StampModuleResult {
  const heading = CONFIG_HEADING_RE.exec(text);
  if (!heading) return { kind: "refused", reason: { code: "no-config-block" } };
  const afterHeading = heading.index + heading[0].length;
  // Bound to before the next `## ` heading — the config block's yaml fence
  // must live inside the Session Set Configuration section, not a later one.
  const rest = text.slice(afterHeading);
  const nextHeadingRel = rest.search(/^##[ \t]/m);
  const sectionEnd =
    nextHeadingRel === -1 ? text.length : afterHeading + nextHeadingRel;
  const section = text.slice(afterHeading, sectionEnd);

  const fenceOpen = CONFIG_YAML_FENCE_OPEN_RE.exec(section);
  if (!fenceOpen) return { kind: "refused", reason: { code: "no-yaml-fence" } };
  const blockContentStart = afterHeading + fenceOpen.index + fenceOpen[0].length;

  // R2 fix (Major): bound the closing-fence search to WITHIN this section
  // (before the next `## ` heading) — an UNTERMINATED config fence must
  // refuse loud, never borrow a closing fence from a later section (which
  // would let a malformed block be mutated instead of rejected).
  const boundedTail = text.slice(blockContentStart, sectionEnd);
  const closeRel = boundedTail.search(CONFIG_FENCE_CLOSE_RE);
  if (closeRel === -1) return { kind: "refused", reason: { code: "no-yaml-fence" } };
  const blockContent = boundedTail.slice(0, closeRel);

  // R9 fix (Major): decide "already stamped" from the PARSED top-level
  // `module` property — NOT a raw-text regex, which mistook an indented
  // `module:` inside a block scalar or a nested mapping (e.g. `notes: |` /
  // `parent:\n  module: greeter`) for a real stamp and wrongly returned noop
  // / already-assigned. A truly top-level `module` key that already equals
  // the slug is a no-op; a different one refuses; anything else (no key /
  // nested only) splices our top-level key at the fence top.
  let parsedBlock: unknown;
  try {
    parsedBlock = YAML.parse(blockContent);
  } catch {
    parsedBlock = undefined; // unparseable → splice; the parse-after guard refuses
  }
  if (
    parsedBlock !== null &&
    typeof parsedBlock === "object" &&
    !Array.isArray(parsedBlock) &&
    "module" in (parsedBlock as Record<string, unknown>)
  ) {
    const existingModule = (parsedBlock as Record<string, unknown>).module;
    if (existingModule === slug) return { kind: "noop" };
    return {
      kind: "refused",
      reason: {
        code: "already-assigned",
        existing:
          typeof existingModule === "string" ? existingModule : String(existingModule),
      },
    };
  }

  const inserted = `module: ${slug}\n`;
  const newText =
    text.slice(0, blockContentStart) + inserted + text.slice(blockContentStart);
  return { kind: "written", text: newText, inserted, insertAt: blockContentStart };
}

/** Extract the "Session Set Configuration" YAML block content (for the
 * parse-after guard). Null when no block/fence — the guard treats that as
 * a failure. */
function extractConfigBlock(text: string): string | null {
  const heading = CONFIG_HEADING_RE.exec(text);
  if (!heading) return null;
  const afterHeading = heading.index + heading[0].length;
  const rest = text.slice(afterHeading);
  const nextHeadingRel = rest.search(/^##[ \t]/m);
  const sectionEnd =
    nextHeadingRel === -1 ? text.length : afterHeading + nextHeadingRel;
  const section = text.slice(afterHeading, sectionEnd);
  const fenceOpen = CONFIG_YAML_FENCE_OPEN_RE.exec(section);
  if (!fenceOpen) return null;
  const blockContentStart = afterHeading + fenceOpen.index + fenceOpen[0].length;
  // R2 fix (Major): the closing fence must live within THIS section — an
  // unterminated block never borrows a later section's fence (parity with
  // stampModuleIntoSpecText, so the parse-after guard re-extracts the same
  // block the splice targeted).
  const boundedTail = text.slice(blockContentStart, sectionEnd);
  const closeRel = boundedTail.search(CONFIG_FENCE_CLOSE_RE);
  if (closeRel === -1) return null;
  return boundedTail.slice(0, closeRel);
}

/**
 * The parse-after-write guard (routed ruling D4-iii). Throws an
 * operator-readable Error unless ALL hold: (4) the new text is EXACTLY the
 * canonical single-line splice of the original — nothing else changed; plus
 * defense in depth on the resulting block — (1) it re-parses as valid YAML,
 * (2) parsed `module` === the target slug, (3) exactly ONE `module:` line.
 * Any failure is a loud refusal — a splice that mutated anything else is a
 * bug, and the caller rolls the file back from its in-memory original.
 *
 * R6 fix (Major): the exact-content check RECOMPUTES the canonical splice
 * via {@link stampModuleIntoSpecText} and requires byte-for-byte equality —
 * the previous longest-common-prefix/suffix heuristic mis-identified the
 * inserted line when the first block key ALSO started with `m` (e.g.
 * `model:` / `mode:`), wrongly refusing a correct splice and — because phase
 * one gates the whole batch — blocking every selected set.
 */
export function assertStampedTextValid(
  originalText: string,
  newText: string,
  slug: string,
): void {
  const refuse = (why: string): never => {
    throw new Error(`Refusing the module stamp (${why}).`);
  };
  // (4) the ONLY acceptable result is the deterministic canonical splice of
  // the original — recompute it and require exact equality (insertion-safe,
  // unlike a common-prefix/suffix diff).
  const expected = stampModuleIntoSpecText(originalText, slug);
  if (expected.kind !== "written") {
    return refuse(
      expected.kind === "noop"
        ? "the original is already stamped to this module"
        : "the original has no spliceable config block",
    );
  }
  if (newText !== expected.text) {
    return refuse("the result is not the exact canonical single-line splice");
  }
  // (1)+(2)+(3): defense in depth on the resulting block.
  const block = extractConfigBlock(newText);
  if (block === null) return refuse("the config block no longer parses");
  let doc: unknown;
  try {
    doc = YAML.parse(block);
  } catch {
    return refuse("the config block is not valid YAML after the stamp");
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return refuse("the config block is not a YAML mapping");
  }
  const parsedModule = (doc as Record<string, unknown>).module;
  if (parsedModule !== slug) {
    return refuse(`module resolved to ${JSON.stringify(parsedModule)}, not ${JSON.stringify(slug)}`);
  }
  const moduleLineCount = (block.match(CONFIG_TOP_LEVEL_MODULE_RE) || []).length;
  if (moduleLineCount !== 1) {
    return refuse(`${moduleLineCount} top-level module: lines in the block`);
  }
}

/** One set the assign flow was asked to stamp (absolute spec.md path). */
export interface AssignSetTarget {
  name: string;
  specAbs: string;
}

/**
 * The spec.md read/write surface the batch writer uses — injectable so the
 * atomic-write path (write temp → verify → rename) is unit-testable. Defaults
 * to node fs. `renameSync` MUST be atomic on the target (a same-directory
 * rename — node's uv_fs_rename replaces the destination atomically on both
 * POSIX and Windows), so the operator's spec.md is never left partially
 * written: on any failure the temp is discarded and the original is intact.
 */
export interface SpecFileIo {
  readFileSync(specAbs: string): string;
  writeFileSync(specAbs: string, data: string): void;
  renameSync(fromAbs: string, toAbs: string): void;
  rmSync(specAbs: string): void;
}

const NODE_SPEC_IO: SpecFileIo = {
  readFileSync: (p) => fs.readFileSync(p, "utf8"),
  writeFileSync: (p, d) => fs.writeFileSync(p, d, { encoding: "utf8" }),
  renameSync: (from, to) => fs.renameSync(from, to),
  rmSync: (p) => fs.rmSync(p, { force: true }),
};

/** The report the assign flow surfaces (routed ruling D4-ii). */
export interface LegacyAssignmentReport {
  /** Sets whose spec.md gained the `module:` stamp. */
  stamped: string[];
  /** Sets already stamped to the target — skipped, not refused. */
  alreadyAssigned: string[];
  /** Present iff the WHOLE batch was refused before any write (phase 1). */
  refused?: { reason: string; setName?: string };
  /**
   * Present iff phase 2 aborted (a disk I/O failure, or a concurrent
   * modification detected pre-write). `written` names the sets stamped
   * before the abort. Because each write is ATOMIC (temp → verify → rename),
   * `setName`'s own file is ALWAYS left intact on failure — there is no
   * partial-write / rollback-failure state — so the only files that changed
   * are those in `written` (refresh iff `written.length > 0`).
   */
  writeFailed?: { setName: string; reason: string; written: string[] };
}

/**
 * Stamp `module: <targetSlug>` into every chosen legacy set's spec.md —
 * two-phase, format-preserving, fail-loud (routed ruling D4-ii). Phase 1
 * validates the ENTIRE batch (target manifest-declared and non-pseudo; every
 * set has a spliceable config block, is not stamped to a different module);
 * any predictable refusal aborts the whole batch with NOTHING written. Phase
 * 2 writes each queued splice, re-reads, and runs the parse-after guard; a
 * post-write anomaly rolls THAT file back from its in-memory original and
 * aborts. A disk I/O throw stops and reports which files were written.
 *
 * Guards (routed ruling D4-iv): never writes `""` / `default` / any
 * pseudo/fallback slug; the target is validated against the CURRENT manifest
 * at call time (not a stale picker snapshot); a set already stamped to the
 * SAME target is a no-op (counted `alreadyAssigned`, never a refusal).
 */
export function assignLegacySetsToModule(
  root: string,
  targetSlug: string,
  sets: readonly AssignSetTarget[],
  io: SpecFileIo = NODE_SPEC_IO,
): LegacyAssignmentReport {
  const slug = (targetSlug ?? "").trim();
  // D4-iv: never stamp the pseudo sentinel.
  if (slug === "" || slug.toLowerCase() === "default") {
    return {
      stamped: [],
      alreadyAssigned: [],
      refused: { reason: `"${targetSlug}" is not a valid module target.` },
    };
  }
  // D4-iv: target MUST be declared in the CURRENT manifest.
  const classified = classifyModulesManifest(root);
  if (classified.kind === "invalid") {
    return { stamped: [], alreadyAssigned: [], refused: { reason: INVALID_MANIFEST_MESSAGE } };
  }
  const declaredSlugs =
    classified.kind === "present" ? classified.entries.map((e) => e.slug) : [];
  if (!declaredSlugs.includes(slug)) {
    return {
      stamped: [],
      alreadyAssigned: [],
      refused: { reason: unknownModuleMessage(slug) },
    };
  }

  // ----- Phase 1: validate ALL. Read each spec, compute the splice, hold
  // originals + new texts in memory. Any predictable refusal aborts.
  const queued: { name: string; specAbs: string; original: string; next: string }[] = [];
  const alreadyAssigned: string[] = [];
  for (const set of sets) {
    let original: string;
    try {
      original = io.readFileSync(set.specAbs);
    } catch (err) {
      return {
        stamped: [],
        alreadyAssigned: [],
        refused: {
          reason: `could not read ${set.name}'s spec.md: ${err instanceof Error ? err.message : String(err)}`,
          setName: set.name,
        },
      };
    }
    const result = stampModuleIntoSpecText(original, slug);
    if (result.kind === "noop") {
      alreadyAssigned.push(set.name);
      continue;
    }
    if (result.kind === "refused") {
      const why =
        result.reason.code === "already-assigned"
          ? `${set.name} is already stamped module: ${result.reason.existing} — reassigning is not a legacy stamp`
          : result.reason.code === "no-config-block"
            ? `${set.name}'s spec.md has no "Session Set Configuration" block to stamp`
            : `${set.name}'s Session Set Configuration block has no ` + "```yaml" + ` fence to stamp`;
      return {
        stamped: [],
        alreadyAssigned: [],
        refused: { reason: why, setName: set.name },
      };
    }
    // Guard the computed text BEFORE queueing — a bad splice fails the whole
    // batch in phase 1 (nothing written), not mid-write.
    try {
      assertStampedTextValid(original, result.text, slug);
    } catch (err) {
      return {
        stamped: [],
        alreadyAssigned: [],
        refused: {
          reason: `${set.name}: ${err instanceof Error ? err.message : String(err)}`,
          setName: set.name,
        },
      };
    }
    queued.push({ name: set.name, specAbs: set.specAbs, original, next: result.text });
  }

  // ----- Phase 2: ATOMIC write each queued splice. R9 resolution: write the
  // spliced text to a temp file, verify the temp bytes, then atomically
  // rename it over the target. A rename replaces the destination in one step,
  // so the operator's spec.md is NEVER left partially written — on ANY
  // failure the temp is discarded and the original is intact. This collapses
  // the whole write-safety class (partial writes, mis-placed splices,
  // rollback-vs-preserve) that the non-atomic write model kept re-surfacing:
  // there is no post-write mismatch to reconcile, so no rollback that could
  // clobber a concurrent edit.
  const stamped: string[] = [];
  const fail = (setName: string, reason: string): LegacyAssignmentReport => ({
    stamped,
    alreadyAssigned,
    writeFailed: { setName, reason, written: [...stamped] },
  });
  // R8 fix (Major): the manifest can change during the (potentially lengthy)
  // phase-1 reads. Re-validate the TARGET against the CURRENT manifest
  // immediately before each write (D4-iv: validated at WRITE time, not the
  // phase-1 snapshot). A removed/renamed target or a now-invalid manifest
  // must refuse before any spec.md is written — and, if earlier sets were
  // already stamped, report a partial state rather than stamp an obsolete slug.
  const revalidateTarget = (): string | null => {
    const c = classifyModulesManifest(root);
    if (c.kind === "invalid") return INVALID_MANIFEST_MESSAGE;
    const slugs = c.kind === "present" ? c.entries.map((e) => e.slug) : [];
    return slugs.includes(slug) ? null : unknownModuleMessage(slug);
  };
  for (const item of queued) {
    const manifestErr = revalidateTarget();
    if (manifestErr) {
      return stamped.length > 0
        ? fail(
            item.name,
            `the target module "${slug}" is no longer declared in the manifest after ${stamped.length} set(s) were already stamped — ${manifestErr}`,
          )
        : {
            stamped: [],
            alreadyAssigned,
            refused: { reason: manifestErr, setName: item.name },
          };
    }
    // R4 fix (Major, TOCTOU): re-read immediately BEFORE writing and require
    // byte-for-byte equality with the phase-1 original. A file that changed
    // after validation (a concurrent editor / tool) must NOT be overwritten
    // with `item.next` — spliced from the now-stale original — which would
    // silently delete the intervening edits. Refuse and leave it untouched.
    let current: string;
    try {
      current = io.readFileSync(item.specAbs);
    } catch (err) {
      return fail(
        item.name,
        `could not re-read ${item.name}'s spec.md before writing: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (current !== item.original) {
      return fail(
        item.name,
        `${item.name}'s spec.md changed after it was validated (a concurrent edit) — refused to overwrite it`,
      );
    }

    // R11 fix: a UNIQUE staging path per operation (pid + random) — a fixed
    // temp path let a second process's stage overwrite this one's between the
    // temp-verify and the rename. Cross-instance serialization of the same
    // target (file-locking) is an adjudicated residual: portable Node fs has
    // no atomic conditional-replace, and OS-level locking is disproportionate
    // for a user-initiated single-line stamp — the pre-rename target re-check
    // (R10) plus a unique stage covers realistic use.
    const tmp = `${item.specAbs}.${process.pid}.${crypto
      .randomBytes(6)
      .toString("hex")}.dabbler-assign-tmp`;
    let staged = false;
    try {
      io.writeFileSync(tmp, item.next);
      staged = true;
      // Verify the TEMP (a partial temp write throws here, never touching the
      // target) before the atomic swap.
      if (io.readFileSync(tmp) !== item.next) {
        throw new Error("the staged temp file did not verify");
      }
      // R10 fix (Major): re-read the TARGET immediately before the rename and
      // abort if it changed since the pre-write check — the rename replaces
      // the destination unconditionally, so a concurrent editor saving during
      // the staging window would otherwise be silently clobbered. This
      // narrows the concurrent-edit window to the atomic rename itself (Node
      // fs has no portable conditional/versioned replace; this is the
      // tightest practical guard).
      if (io.readFileSync(item.specAbs) !== item.original) {
        io.rmSync(tmp);
        return fail(
          item.name,
          `${item.name}'s spec.md changed during the staged write (a concurrent edit) — refused to overwrite it`,
        );
      }
      io.renameSync(tmp, item.specAbs);
    } catch (err) {
      // The atomic rename never ran (or threw) — the target is untouched.
      // Best-effort cleanup of the temp; the original spec.md is intact.
      if (staged) {
        try {
          io.rmSync(tmp);
        } catch {
          /* leftover temp is harmless; the target is what matters */
        }
      }
      return fail(
        item.name,
        `writing ${item.name}'s spec.md failed; the original was left intact (${err instanceof Error ? err.message : String(err)})`,
      );
    }
    stamped.push(item.name);
  }

  return { stamped, alreadyAssigned };
}

// ---------- Set 099 S1: the transactional module RENAME writer ----------
//
// Rename a declared module (verdict decision 1: slug stays identity — no
// moduleId / tombstones / registry). A rename is a PREFLIGHTED, all-or-
// nothing rewrite: the docs/modules.yaml entry (format-preserving, the Set
// 091 appender posture) AND, when the slug changes, a restamp of
// `module: <old>` -> `module: <new>` in EVERY affected set's spec.md (the
// same top-level-key splice the Set 093 assign writer uses, extended from
// insert to value-rewrite). A title-only rename skips the restamp entirely
// (manifest-only edit — the stamp value is unchanged). Any failure in the
// apply phase rolls every touched file back to its pre-transaction bytes, so
// a refusal or a mid-write error leaves the workspace exactly as it was.

/**
 * PURE format-preserving REWRITE of the top-level `module:` value in a
 * spec.md's "Session Set Configuration" YAML block: `module: <oldSlug>` ->
 * `module: <newSlug>`, touching no other byte (the leading `module:` +
 * spacing and any trailing comment survive). Refuses when the block has no
 * top-level `module` key, or when it is stamped to a DIFFERENT slug than
 * expected (a stale snapshot — never silently overwritten). Idempotent: a
 * block already stamped to `newSlug` is a `noop`. Mirrors the anchoring of
 * {@link stampModuleIntoSpecText} (bounded to the config section, unterminated
 * fence refuses loud), and decides "which module" from the PARSED top-level
 * property, never a raw-text regex (an indented `module:` inside a block
 * scalar / nested mapping is not a stamp).
 */
export type RestampModuleResult =
  | { kind: "written"; text: string }
  | { kind: "noop" }
  | { kind: "refused"; reason: string };

export function restampModuleInSpecText(
  text: string,
  expectedOldSlug: string,
  newSlug: string,
): RestampModuleResult {
  const heading = CONFIG_HEADING_RE.exec(text);
  if (!heading) {
    return { kind: "refused", reason: 'no "Session Set Configuration" block' };
  }
  const afterHeading = heading.index + heading[0].length;
  const rest = text.slice(afterHeading);
  const nextHeadingRel = rest.search(/^##[ \t]/m);
  const sectionEnd =
    nextHeadingRel === -1 ? text.length : afterHeading + nextHeadingRel;
  const section = text.slice(afterHeading, sectionEnd);

  const fenceOpen = CONFIG_YAML_FENCE_OPEN_RE.exec(section);
  if (!fenceOpen) {
    return { kind: "refused", reason: "the config block has no ```yaml fence" };
  }
  const blockContentStart = afterHeading + fenceOpen.index + fenceOpen[0].length;
  const boundedTail = text.slice(blockContentStart, sectionEnd);
  const closeRel = boundedTail.search(CONFIG_FENCE_CLOSE_RE);
  if (closeRel === -1) {
    return { kind: "refused", reason: "the config block has no closing fence" };
  }
  const blockContent = boundedTail.slice(0, closeRel);

  let parsed: unknown;
  try {
    parsed = YAML.parse(blockContent);
  } catch {
    return { kind: "refused", reason: "the config block is not valid YAML" };
  }
  const parsedModule =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).module
      : undefined;
  if (parsedModule === undefined) {
    return { kind: "refused", reason: "no top-level module: key to rewrite" };
  }
  if (parsedModule === newSlug) return { kind: "noop" };
  if (parsedModule !== expectedOldSlug) {
    return {
      kind: "refused",
      reason: `stamped module: ${JSON.stringify(parsedModule)}, not ${JSON.stringify(expectedOldSlug)}`,
    };
  }

  // Rewrite ONLY the value token of the top-level (column-0) module: line.
  const lineRe = /^(module[ \t]*:[ \t]*)([^\r\n]*?)([ \t]*(?:#[^\r\n]*)?)$/m;
  const lm = lineRe.exec(blockContent);
  if (!lm) {
    return { kind: "refused", reason: "could not locate the module: line to rewrite" };
  }
  const valueAbs = blockContentStart + lm.index + lm[1].length;
  const valueLen = lm[2].length;
  const newText = text.slice(0, valueAbs) + newSlug + text.slice(valueAbs + valueLen);
  return { kind: "written", text: newText };
}

/**
 * The parse-after-write guard for a restamp (mirrors
 * {@link assertStampedTextValid}): the ONLY acceptable result is the
 * deterministic canonical value-rewrite of the original — recompute it and
 * require byte-for-byte equality — plus defense in depth on the resulting
 * block (re-parses, parsed `module` === newSlug, exactly one top-level
 * `module:` line). Any failure is a loud refusal; the caller rolls the file
 * back from its in-memory original.
 */
export function assertRestampedTextValid(
  originalText: string,
  newText: string,
  oldSlug: string,
  newSlug: string,
): void {
  const refuse = (why: string): never => {
    throw new Error(`Refusing the module restamp (${why}).`);
  };
  const expected = restampModuleInSpecText(originalText, oldSlug, newSlug);
  if (expected.kind !== "written") {
    return refuse(
      expected.kind === "noop"
        ? "the original is already stamped to the new module"
        : `the original cannot be restamped (${expected.reason})`,
    );
  }
  if (newText !== expected.text) {
    return refuse("the result is not the exact canonical single-value rewrite");
  }
  // Defense in depth on the resulting config block.
  const heading = CONFIG_HEADING_RE.exec(newText);
  const afterHeading = heading ? heading.index + heading[0].length : -1;
  if (afterHeading < 0) return refuse("the config block no longer parses");
  const restText = newText.slice(afterHeading);
  const nextHeadingRel = restText.search(/^##[ \t]/m);
  const sectionEnd =
    nextHeadingRel === -1 ? newText.length : afterHeading + nextHeadingRel;
  const section = newText.slice(afterHeading, sectionEnd);
  const fenceOpen = CONFIG_YAML_FENCE_OPEN_RE.exec(section);
  if (!fenceOpen) return refuse("the config block no longer parses");
  const blockContentStart = afterHeading + fenceOpen.index + fenceOpen[0].length;
  const boundedTail = newText.slice(blockContentStart, sectionEnd);
  const closeRel = boundedTail.search(CONFIG_FENCE_CLOSE_RE);
  if (closeRel === -1) return refuse("the config block no longer parses");
  const block = boundedTail.slice(0, closeRel);
  let doc: unknown;
  try {
    doc = YAML.parse(block);
  } catch {
    return refuse("the config block is not valid YAML after the restamp");
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return refuse("the config block is not a YAML mapping");
  }
  if ((doc as Record<string, unknown>).module !== newSlug) {
    return refuse(
      `module resolved to ${JSON.stringify((doc as Record<string, unknown>).module)}, not ${JSON.stringify(newSlug)}`,
    );
  }
  const moduleLineCount = (block.match(CONFIG_TOP_LEVEL_MODULE_RE) || []).length;
  if (moduleLineCount !== 1) {
    return refuse(`${moduleLineCount} top-level module: lines in the block`);
  }
}

/** A normalized manifest entry parsed straight from text (mirrors
 * {@link readModulesManifest}'s per-entry normalization: no-slug dropped,
 * first duplicate kept, title defaults to slug, planPath null when absent,
 * codeRoots/touches keep only trimmed string members). Used by the rename
 * guard so the semantic comparison matches what the Explorer reader sees. */
interface NormalizedManifestEntry {
  slug: string;
  title: string;
  codeRoots: string[];
  planPath: string | null;
  touches: string[];
}

function parseManifestEntriesFromText(
  text: string,
): NormalizedManifestEntry[] | null {
  let doc: unknown;
  try {
    doc = YAML.parse(text);
  } catch {
    return null;
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return null;
  const rawModules = (doc as Record<string, unknown>).modules;
  if (rawModules === null) return [];
  if (!Array.isArray(rawModules)) return null;
  const stringList = (v: unknown): string[] =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === "string" && x.trim() !== "")
          .map((s) => s.trim())
      : [];
  const out: NormalizedManifestEntry[] = [];
  const seen = new Set<string>();
  for (const raw of rawModules) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const obj = raw as Record<string, unknown>;
    const slug = typeof obj.slug === "string" ? obj.slug.trim() : "";
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const title =
      typeof obj.title === "string" && obj.title.trim() !== ""
        ? obj.title.trim()
        : slug;
    const planPath =
      typeof obj.planPath === "string" && obj.planPath.trim() !== ""
        ? obj.planPath.trim()
        : null;
    out.push({
      slug,
      title,
      codeRoots: stringList(obj.codeRoots),
      planPath,
      touches: stringList(obj.touches),
    });
  }
  return out;
}

function entriesEqual(
  a: NormalizedManifestEntry,
  b: NormalizedManifestEntry,
): boolean {
  return (
    a.slug === b.slug &&
    a.title === b.title &&
    a.planPath === b.planPath &&
    a.codeRoots.length === b.codeRoots.length &&
    a.codeRoots.every((v, i) => v === b.codeRoots[i]) &&
    a.touches.length === b.touches.length &&
    a.touches.every((v, i) => v === b.touches[i])
  );
}

/** Unquote a YAML scalar value token (double / single quoted), else trim. */
function unquoteScalar(raw: string): string {
  const t = raw.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Format-preserving rewrite of ONE manifest entry's `slug:` and/or `title:`
 * value (the Set 091 appender posture: never re-serialize the operator's
 * manifest, which would destroy comments and entry order). Returns the new
 * text, or `null` when the entry cannot be edited safely in place (the caller
 * refuses loudly and asks the operator to edit by hand — the same
 * exotic-shape residual the appender declares). Assumes the entry's `slug:`
 * lives on its list-item (`- slug:`) line, the shape the scaffold writes;
 * an entry whose slug is a bare indented key on its own line is treated as
 * un-editable here (guard refuses).
 */
function rewriteManifestEntryText(
  text: string,
  oldSlug: string,
  opts: { newSlug?: string; newTitle?: string },
): string | null {
  const markerRe =
    /^([ \t]*)-([ \t]+)slug([ \t]*:[ \t]*)("[^"\r\n]*"|'[^'\r\n]*'|[^#\r\n \t][^#\r\n]*?)([ \t]*(?:#[^\r\n]*)?)$/gm;
  let target: RegExpExecArray | null = null;
  for (const m of text.matchAll(markerRe)) {
    if (unquoteScalar(m[4]) === oldSlug) {
      target = m as unknown as RegExpExecArray;
      break;
    }
  }
  if (target === null) return null;

  const entryIndent = target[1].length;
  const keyIndent = target[1].length + 1 + target[2].length;
  const slugValueStart =
    target.index! + target[1].length + 1 + target[2].length + 4 + target[3].length;
  const slugValueEnd = slugValueStart + target[4].length;
  const slugLineEnd = target.index! + target[0].length;

  // The entry span ends at the next list marker AT THE SAME indent, or a
  // dedent to a column-0 key, or EOF — so the title edit stays inside THIS
  // entry (a nested codeRoots/touches `- ` member is deeper-indented and
  // never mistaken for the next entry).
  let spanEnd = text.length;
  const boundaryRe = /\r?\n([ \t]*)(?:-[ \t]|[^ \t\r\n#])/g;
  boundaryRe.lastIndex = slugLineEnd;
  let bm: RegExpExecArray | null;
  while ((bm = boundaryRe.exec(text)) !== null) {
    if (bm[1].length <= entryIndent) {
      spanEnd = bm.index; // before the newline that starts the boundary line
      break;
    }
  }

  const edits: { start: number; end: number; replacement: string }[] = [];
  if (opts.newSlug !== undefined && opts.newSlug !== oldSlug) {
    edits.push({ start: slugValueStart, end: slugValueEnd, replacement: opts.newSlug });
  }
  if (opts.newTitle !== undefined) {
    const titleRe =
      /^([ \t]+)title([ \t]*:[ \t]*)("[^"\r\n]*"|'[^'\r\n]*'|[^#\r\n]*?)([ \t]*(?:#[^\r\n]*)?)$/m;
    const span = text.slice(slugLineEnd, spanEnd);
    const tm = titleRe.exec(span);
    if (tm) {
      const titleValueStart =
        slugLineEnd + tm.index + tm[1].length + 5 + tm[2].length; // 5 = "title".length
      const titleValueEnd = titleValueStart + tm[3].length;
      edits.push({
        start: titleValueStart,
        end: titleValueEnd,
        replacement: JSON.stringify(opts.newTitle),
      });
    } else {
      // No explicit title line — insert one right after the slug line, at the
      // entry's key indent (title defaults to slug when absent, so adding it
      // is the only way to make a title-only rename take effect here). Reuse
      // the manifest's own newline convention so a CRLF file stays CRLF.
      const nl = text.includes("\r\n") ? "\r\n" : "\n";
      const insertion = `${nl}${" ".repeat(keyIndent)}title: ${JSON.stringify(opts.newTitle)}`;
      edits.push({ start: slugLineEnd, end: slugLineEnd, replacement: insertion });
    }
  }
  if (edits.length === 0) return text;
  // Apply from the latest offset to the earliest so earlier offsets stay valid.
  edits.sort((a, b) => b.start - a.start);
  let out = text;
  for (const e of edits) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  }
  return out;
}

/**
 * The parse-after-write guard for the manifest rewrite: the candidate must
 * parse to the SAME entry set as the original in the SAME order, with only
 * the target entry's slug/title changed to the expected values, no entry
 * count change, no duplicate of the new slug, and (on a slug change) no
 * lingering old slug. A semantic comparison (not a text diff) so it holds
 * regardless of formatting — comments and order are the writer's separate
 * concern, verified by the format-preservation test.
 */
export function assertRenamedManifestParses(
  originalEntries: readonly ModuleManifestEntry[],
  candidateText: string,
  oldSlug: string,
  expected: { newSlug: string; newTitle: string | null },
): void {
  const refuse = (why: string): never => {
    throw new Error(`Could not rename the module entry (${why}).`);
  };
  const arrEq = (a: string[], b: string[]): boolean =>
    a.length === b.length && a.every((v, i) => v === b[i]);
  const candidate = parseManifestEntriesFromText(candidateText);
  if (candidate === null) return refuse("the result is not a valid module manifest");
  if (candidate.length !== originalEntries.length) {
    return refuse(
      `entry count changed (${originalEntries.length} -> ${candidate.length})`,
    );
  }
  const targetIndex = originalEntries.findIndex((e) => e.slug === oldSlug);
  if (targetIndex < 0) return refuse(`the original had no "${oldSlug}" entry`);
  for (let i = 0; i < originalEntries.length; i++) {
    const before = originalEntries[i] as NormalizedManifestEntry;
    const after = candidate[i];
    if (i === targetIndex) {
      // slug + non-slug/title fields must be exactly the target rename.
      if (after.slug !== expected.newSlug) {
        return refuse(
          `entry ${i} slug is ${JSON.stringify(after.slug)}, expected ${JSON.stringify(expected.newSlug)}`,
        );
      }
      if (
        after.planPath !== before.planPath ||
        !arrEq(after.codeRoots, before.codeRoots) ||
        !arrEq(after.touches, before.touches)
      ) {
        return refuse(`entry ${i} changed a field other than slug/title`);
      }
      if (expected.newTitle !== null) {
        // Title explicitly changed — must land exactly.
        if (after.title !== expected.newTitle) {
          return refuse(
            `entry ${i} title is ${JSON.stringify(after.title)}, expected ${JSON.stringify(expected.newTitle)}`,
          );
        }
      } else if (after.title !== before.title && after.title !== expected.newSlug) {
        // Slug-only rename: the title line is untouched, so the parsed title is
        // EITHER the preserved explicit title OR — when the entry had no
        // explicit title — the slug-derived default, which now follows the new
        // slug. Any OTHER value means the splice corrupted the title.
        return refuse(
          `entry ${i} title changed unexpectedly to ${JSON.stringify(after.title)}`,
        );
      }
    } else if (!entriesEqual(after, before)) {
      return refuse(`entry ${i} (${before.slug}) changed unexpectedly`);
    }
  }
  const newSlugCount = candidate.filter((e) => e.slug === expected.newSlug).length;
  if (newSlugCount !== 1) {
    return refuse(`the new slug appears ${newSlugCount} times`);
  }
  if (expected.newSlug !== oldSlug && candidate.some((e) => e.slug === oldSlug)) {
    return refuse(`the old slug "${oldSlug}" still appears`);
  }
}

/** The injectable read/write surface the rename transaction uses (node fs by
 * default). `writeFileSync` MUST make `data` the complete on-disk content of
 * `abs` (the node impl publishes atomically via a unique temp + rename, so a
 * crash never leaves a half-written file); the transaction layers all-or-
 * nothing rollback on top by re-writing in-memory originals. */
export interface RenameFileIo {
  readFileSync(abs: string): string;
  writeFileSync(abs: string, data: string): void;
}

const NODE_RENAME_IO: RenameFileIo = {
  readFileSync: (p) => fs.readFileSync(p, "utf8"),
  writeFileSync: (p, data) => {
    const tmp = `${p}.${process.pid}.${crypto
      .randomBytes(6)
      .toString("hex")}.dabbler-rename-tmp`;
    try {
      fs.writeFileSync(tmp, data, { encoding: "utf8" });
      fs.renameSync(tmp, p);
    } catch (err) {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        /* leftover temp is harmless */
      }
      throw err;
    }
  },
};

/** Non-mutating "is a session actively in flight?" probe: reads the set's
 * session-state.json (never writes — unlike `readStatus`, which seeds a state
 * file) and reports true iff a top-level or per-session `status` is
 * "in-progress". Absent / unparseable state reads as not-running. */
function hasRunningSessionAt(setDir: string, io: RenameFileIo): boolean {
  let raw: string;
  try {
    raw = io.readFileSync(path.join(setDir, "session-state.json"));
  } catch {
    return false;
  }
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return false;
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return false;
  const d = doc as Record<string, unknown>;
  if (d.status === "in-progress") return true;
  if (Array.isArray(d.sessions)) {
    return d.sessions.some(
      (s) =>
        s !== null &&
        typeof s === "object" &&
        (s as Record<string, unknown>).status === "in-progress",
    );
  }
  return false;
}

/** The report the rename writer returns (the command surfaces it). */
export interface RenameModuleResult {
  oldSlug: string;
  /** Resolved target slug (=== oldSlug for a title-only rename). */
  newSlug: string;
  /** Resolved new title when the title changed, else null. */
  newTitle: string | null;
  slugChanged: boolean;
  titleChanged: boolean;
  /** Names of the sets whose spec.md was restamped (empty for title-only). */
  restamped: string[];
  /** Present iff a preflight refused the whole transaction — nothing written. */
  refused?: { reason: string };
  /** Present iff the apply phase failed — every touched file was rolled back
   * (`rolledBack: false` iff a rollback write itself failed — operator must
   * reconcile from git). */
  writeFailed?: { reason: string; rolledBack: boolean };
}

/**
 * Transactionally rename a declared module (verdict decision 1). Preflight
 * (all refusals leave every file byte-identical):
 *   - the manifest is present + valid and declares `oldSlug`;
 *   - on a slug change: `newSlug` validates (shape) and is unique among
 *     declared slugs; refuse a target that collides with an UNDECLARED slug
 *     already carrying stamped sets (silent history merge is the failure
 *     mode); refuse while any affected set has a running session.
 * Then the all-or-nothing apply: restamp every affected set's spec.md (slug
 * change only) + rewrite the manifest entry (slug and/or title), each guarded
 * by a parse-after-write check computed BEFORE any byte is written; the writes
 * publish atomically and, on any failure, every already-written file is rolled
 * back to its pre-transaction bytes. A title-only rename skips the restamp
 * entirely (manifest-only edit).
 */
export function renameModule(
  root: string,
  oldSlugRaw: string,
  changes: { newSlug?: string; newTitle?: string },
  io: RenameFileIo = NODE_RENAME_IO,
): RenameModuleResult {
  const oldSlug = (oldSlugRaw ?? "").trim();
  const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
  const refuse = (reason: string): RenameModuleResult => ({
    oldSlug,
    newSlug: oldSlug,
    newTitle: null,
    slugChanged: false,
    titleChanged: false,
    restamped: [],
    refused: { reason },
  });

  const classified = classifyModulesManifest(root);
  if (classified.kind === "invalid") return refuse(INVALID_MANIFEST_MESSAGE);
  const entries = classified.kind === "present" ? classified.entries : [];
  const targetEntry = entries.find((e) => e.slug === oldSlug);
  if (!targetEntry) {
    return refuse(
      `Module "${oldSlug}" is not declared in ${MODULES_MANIFEST_DISPLAY}.`,
    );
  }

  const requestedSlug =
    changes.newSlug === undefined ? undefined : changes.newSlug.trim();
  const requestedTitle =
    changes.newTitle === undefined ? undefined : changes.newTitle.trim();

  const slugChanging =
    requestedSlug !== undefined && requestedSlug !== "" && requestedSlug !== oldSlug;
  const newSlug = slugChanging ? (requestedSlug as string) : oldSlug;
  const currentTitle = targetEntry.title;
  const titleChanging =
    requestedTitle !== undefined &&
    requestedTitle !== "" &&
    requestedTitle !== currentTitle;
  const newTitle = titleChanging ? (requestedTitle as string) : null;

  if (!slugChanging && !titleChanging) {
    return refuse(
      "no change requested — the new slug and title match the current module.",
    );
  }

  if (slugChanging) {
    const declaredSlugs = entries.map((e) => e.slug);
    const slugErr = validateNewModuleSlug(newSlug, declaredSlugs);
    if (slugErr) return refuse(slugErr);
  }

  // One scan of every set: collect the affected (old-slug) sets and detect an
  // undeclared new-slug history collision.
  const setsRoot = path.join(root, SESSION_SETS_REL);
  const affected: { name: string; dir: string; specAbs: string }[] = [];
  const newSlugCollisions: string[] = [];
  for (const name of listSessionSetDirNames(root)) {
    const dir = path.join(setsRoot, name);
    const specAbs = path.join(dir, "spec.md");
    const mod = parseSessionSetConfig(specAbs).module;
    if (mod === oldSlug) affected.push({ name, dir, specAbs });
    else if (slugChanging && mod === newSlug) newSlugCollisions.push(name);
  }

  if (slugChanging && newSlugCollisions.length > 0) {
    return refuse(
      `Renaming to "${newSlug}" would merge histories: ${newSlugCollisions.length} ` +
        `set(s) already declare module: ${newSlug}, which is not a declared module ` +
        `(${newSlugCollisions.join(", ")}). Pick a different name.`,
    );
  }

  if (slugChanging) {
    const running = affected.filter((a) => hasRunningSessionAt(a.dir, io));
    if (running.length > 0) {
      return refuse(
        `Refusing to rename "${oldSlug}" while ${running.length} affected set(s) ` +
          `have a running session (${running.map((r) => r.name).join(", ")}). ` +
          `Finish or close them first.`,
      );
    }
  }

  // ----- Compute + guard EVERY write before touching disk (a bad splice
  // fails the whole transaction here, nothing written).
  const writes: { abs: string; original: string; next: string; label: string }[] = [];
  const restampedNames: string[] = [];

  if (slugChanging) {
    for (const a of affected) {
      let original: string;
      try {
        original = io.readFileSync(a.specAbs);
      } catch (e) {
        return refuse(`could not read ${a.name}'s spec.md: ${msg(e)}`);
      }
      const res = restampModuleInSpecText(original, oldSlug, newSlug);
      if (res.kind === "noop") continue; // already newSlug — nothing to write
      if (res.kind === "refused") return refuse(`${a.name}: ${res.reason}`);
      try {
        assertRestampedTextValid(original, res.text, oldSlug, newSlug);
      } catch (e) {
        return refuse(`${a.name}: ${msg(e)}`);
      }
      writes.push({ abs: a.specAbs, original, next: res.text, label: a.name });
      restampedNames.push(a.name);
    }
  }

  // Manifest LAST (a failed run never half-renames: specs restamp first, the
  // manifest flips the declaration only once every spec is safely staged).
  const manifestAbs = path.join(root, MODULES_MANIFEST_REL);
  let manifestOriginal: string;
  try {
    manifestOriginal = io.readFileSync(manifestAbs);
  } catch (e) {
    return refuse(`could not read ${MODULES_MANIFEST_DISPLAY}: ${msg(e)}`);
  }
  const manifestNext = rewriteManifestEntryText(manifestOriginal, oldSlug, {
    newSlug: slugChanging ? newSlug : undefined,
    newTitle: titleChanging ? (newTitle as string) : undefined,
  });
  if (manifestNext === null) {
    return refuse(
      `could not rewrite the ${MODULES_MANIFEST_DISPLAY} entry for "${oldSlug}" ` +
        `while preserving formatting — edit the slug/title by hand.`,
    );
  }
  try {
    assertRenamedManifestParses(entries, manifestNext, oldSlug, {
      newSlug,
      // null = title not explicitly changed — the guard then tolerates a
      // slug-derived implicit default (a title-less entry's display name
      // follows its slug), so a slug-only rename of a title-less entry is not
      // spuriously refused.
      newTitle: titleChanging ? (newTitle as string) : null,
    });
  } catch (e) {
    return refuse(`${MODULES_MANIFEST_DISPLAY}: ${msg(e)}`);
  }
  writes.push({
    abs: manifestAbs,
    original: manifestOriginal,
    next: manifestNext,
    label: MODULES_MANIFEST_DISPLAY,
  });

  // ----- Apply: write each file; on ANY failure roll every written file back.
  const written: { abs: string; original: string }[] = [];
  for (const w of writes) {
    try {
      io.writeFileSync(w.abs, w.next);
      written.push({ abs: w.abs, original: w.original });
      if (io.readFileSync(w.abs) !== w.next) {
        throw new Error("did not verify after write");
      }
    } catch (e) {
      let rolledBack = true;
      for (const done of written) {
        try {
          io.writeFileSync(done.abs, done.original);
        } catch {
          rolledBack = false;
        }
      }
      return {
        oldSlug,
        newSlug,
        newTitle,
        slugChanged: false,
        titleChanged: false,
        restamped: [],
        writeFailed: { reason: `writing ${w.label} failed: ${msg(e)}`, rolledBack },
      };
    }
  }

  return {
    oldSlug,
    newSlug,
    newTitle,
    slugChanged: slugChanging,
    titleChanged: titleChanging,
    restamped: restampedNames,
  };
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
 * spec.md). Deliberately does NOT include `session-state.json`: the
 * Session Set Explorer's own reader (`readStatus` -> `ensureSessionStateFile`)
 * lazily SYNTHESIZES a `not-started` session-state.json onto any spec-only
 * folder the moment it is scanned, so the file's mere presence is not a
 * "this was touched" signal — only these real artifacts (or a non-
 * `not-started` status inside the state file, checked separately) are. */
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

/** Non-mutating raw-status read (mirrors {@link hasRunningSessionAt}): never
 * calls the Explorer's `readStatus` (which would synthesize a state file as
 * a side effect). Absent/unparseable/no-string-status all read as
 * "not-started" — the same fallback the synthesizer itself would produce,
 * just without writing it. */
function rawSessionSetStatus(dir: string): "not-started" | "in-progress" | "complete" {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(dir, "session-state.json"), "utf8");
  } catch {
    return "not-started";
  }
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return "not-started";
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return "not-started";
  const status = (doc as Record<string, unknown>).status;
  if (typeof status !== "string") return "not-started";
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

/**
 * Format-preserving REMOVAL of one manifest entry (the Set 091 appender /
 * Set 099 S1 rename posture: never re-serialize the operator's manifest).
 * Deletes the `- slug: <slug>` entry's entire block — its slug line through
 * its last nested field — plus exactly the one trailing newline that
 * separated it from whatever followed, so no blank line is left behind (or
 * trims cleanly to EOF when it was the last entry). Returns `null` when the
 * entry cannot be located safely — the same exotic-manifest-shape residual
 * {@link rewriteManifestEntryText} declares; the caller refuses loud and
 * asks the operator to edit by hand.
 */
function removeManifestEntryText(text: string, slug: string): string | null {
  const markerRe =
    /^([ \t]*)-([ \t]+)slug([ \t]*:[ \t]*)("[^"\r\n]*"|'[^'\r\n]*'|[^#\r\n \t][^#\r\n]*?)([ \t]*(?:#[^\r\n]*)?)$/gm;
  let target: RegExpExecArray | null = null;
  for (const m of text.matchAll(markerRe)) {
    if (unquoteScalar(m[4]) === slug) {
      target = m as unknown as RegExpExecArray;
      break;
    }
  }
  if (target === null) return null;

  const entryIndent = target[1].length;
  const slugLineEnd = target.index! + target[0].length;

  // Same entry-span boundary walk as rewriteManifestEntryText: the next
  // list marker at the same (or shallower) indent, or a column-appropriate
  // dedent, or EOF.
  let spanEnd = text.length;
  const boundaryRe = /\r?\n([ \t]*)(?:-[ \t]|[^ \t\r\n#])/g;
  boundaryRe.lastIndex = slugLineEnd;
  let bm: RegExpExecArray | null;
  while ((bm = boundaryRe.exec(text)) !== null) {
    if (bm[1].length <= entryIndent) {
      spanEnd = bm.index;
      break;
    }
  }

  const nlMatch = /^\r?\n/.exec(text.slice(spanEnd));
  const deleteEnd = spanEnd + (nlMatch ? nlMatch[0].length : 0);
  return text.slice(0, target.index!) + text.slice(deleteEnd);
}

/**
 * The parse-after-write guard for the manifest removal (mirrors
 * {@link assertRenamedManifestParses}): the candidate must parse to exactly
 * the original entry set minus the removed slug, every remaining entry
 * unchanged and in the same relative order. A semantic comparison, not a
 * text diff, so it holds regardless of formatting.
 */
function assertManifestEntryRemoved(
  originalEntries: readonly ModuleManifestEntry[],
  candidateText: string,
  slug: string,
): void {
  const refuse = (why: string): never => {
    throw new Error(`Could not remove the module entry (${why}).`);
  };
  const candidate = parseManifestEntriesFromText(candidateText);
  if (candidate === null) return refuse("the result is not a valid module manifest");
  if (candidate.length !== originalEntries.length - 1) {
    return refuse(
      `entry count changed (${originalEntries.length} -> ${candidate.length}, expected ${originalEntries.length - 1})`,
    );
  }
  if (candidate.some((e) => e.slug === slug)) {
    return refuse(`the removed slug "${slug}" still appears`);
  }
  const remainingOriginal = originalEntries.filter(
    (e) => e.slug !== slug,
  ) as NormalizedManifestEntry[];
  for (let i = 0; i < remainingOriginal.length; i++) {
    if (!entriesEqual(remainingOriginal[i], candidate[i])) {
      return refuse(`entry ${i} (${remainingOriginal[i].slug}) changed unexpectedly`);
    }
  }
}

/** The report the delete writer returns (the command surfaces it). */
export interface DeleteModuleResult {
  slug: string;
  /** Names of sets cancelled via `cancelSessionSet`. */
  cancelled: string[];
  /** Names of unstarted lifecycle-scaffold sets whose directory was removed. */
  removed: string[];
  /** Names of completed/already-cancelled sets left untouched. */
  terminal: string[];
  /** Present iff a preflight refused the whole operation — nothing written. */
  refused?: { reason: string };
  /**
   * Present iff the apply phase stopped partway. `cancelled` / `removed`
   * above already list what succeeded before the stop; every one of those
   * steps is idempotent, so re-invoking `deleteModule` with the same slug
   * picks up exactly where it left off (already-cancelled sets classify
   * `"terminal"` on the retry; already-removed directories are simply gone).
   * The manifest entry is NEVER removed until every cancel/removal has
   * succeeded, so a partial failure always leaves the module still declared.
   */
  partialFailure?: { reason: string };
}

/**
 * Delete a declared module (operator's adjudicated disposition rule).
 * Preflight (refusals leave every file byte-identical): the manifest is
 * present + valid and declares `slug`; refuse while any affected set has a
 * running session (checked BEFORE anything is touched, mirroring
 * {@link renameModule}). Every affected set (the raw `module: <slug>`
 * stamp scan, matching {@link renameModule}'s own scan) is then classified
 * by {@link classifyModuleSetsForDeletion} and the manifest removal is
 * computed + guarded up front — a bad splice refuses the whole operation
 * before any set is touched. Apply order: cancel non-terminal sets, then
 * remove scaffold directories (both idempotent, safely re-runnable), then
 * the manifest entry LAST — so an interrupted run never half-deletes the
 * module.
 */
export async function deleteModule(
  root: string,
  slugRaw: string,
  io: RenameFileIo = NODE_RENAME_IO,
): Promise<DeleteModuleResult> {
  const slug = (slugRaw ?? "").trim();
  const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
  const refuse = (reason: string): DeleteModuleResult => ({
    slug,
    cancelled: [],
    removed: [],
    terminal: [],
    refused: { reason },
  });

  const classified = classifyModulesManifest(root);
  if (classified.kind === "invalid") return refuse(INVALID_MANIFEST_MESSAGE);
  const entries = classified.kind === "present" ? classified.entries : [];
  if (!entries.some((e) => e.slug === slug)) {
    return refuse(`Module "${slug}" is not declared in ${MODULES_MANIFEST_DISPLAY}.`);
  }

  const classifications = classifyModuleSetsForDeletion(root, slug);

  const running = classifications.filter((c) => hasRunningSessionAt(c.dir, io));
  if (running.length > 0) {
    return refuse(
      `Refusing to delete "${slug}" while ${running.length} affected set(s) have a ` +
        `running session (${running.map((r) => r.name).join(", ")}). Finish or close them first.`,
    );
  }

  const terminalNames = classifications
    .filter((c) => c.disposition === "terminal")
    .map((c) => c.name)
    .sort();
  const toCancel = classifications.filter((c) => c.disposition === "cancel");
  const toRemove = classifications.filter((c) => c.disposition === "remove");

  // Compute + guard the manifest removal BEFORE touching any set — an
  // unspliceable manifest refuses the whole operation up front.
  const manifestAbs = path.join(root, MODULES_MANIFEST_REL);
  let manifestOriginal: string;
  try {
    manifestOriginal = io.readFileSync(manifestAbs);
  } catch (e) {
    return refuse(`could not read ${MODULES_MANIFEST_DISPLAY}: ${msg(e)}`);
  }
  const manifestNext = removeManifestEntryText(manifestOriginal, slug);
  if (manifestNext === null) {
    return refuse(
      `could not remove the ${MODULES_MANIFEST_DISPLAY} entry for "${slug}" while ` +
        `preserving formatting — remove it by hand.`,
    );
  }
  try {
    assertManifestEntryRemoved(entries, manifestNext, slug);
  } catch (e) {
    return refuse(`${MODULES_MANIFEST_DISPLAY}: ${msg(e)}`);
  }

  // ----- Apply: cancels + scaffold removals first (each idempotent and
  // safely re-runnable); the manifest edit lands last.
  const cancelled: string[] = [];
  const removed: string[] = [];
  const reason = `module ${slug} deleted`;
  for (const c of toCancel) {
    try {
      await cancelSessionSet(c.dir, reason);
      cancelled.push(c.name);
    } catch (e) {
      return {
        slug,
        cancelled,
        removed,
        terminal: terminalNames,
        partialFailure: { reason: `cancelling ${c.name} failed: ${msg(e)}` },
      };
    }
  }
  for (const c of toRemove) {
    try {
      fs.rmSync(c.dir, { recursive: true, force: true });
      removed.push(c.name);
    } catch (e) {
      return {
        slug,
        cancelled,
        removed,
        terminal: terminalNames,
        partialFailure: { reason: `removing ${c.name} failed: ${msg(e)}` },
      };
    }
  }

  try {
    io.writeFileSync(manifestAbs, manifestNext);
  } catch (e) {
    return {
      slug,
      cancelled,
      removed,
      terminal: terminalNames,
      partialFailure: {
        reason:
          `${cancelled.length} set(s) cancelled and ${removed.length} scaffold(s) removed, ` +
          `but writing ${MODULES_MANIFEST_DISPLAY} failed: ${msg(e)} — re-run to finish ` +
          `removing the manifest entry.`,
      },
    };
  }

  return { slug, cancelled, removed, terminal: terminalNames };
}

// ---------- Set 098 S2: module-lifecycle set templates + scaffold writer ----------
//
// The two module-lifecycle set KINDS (verdict decision 5, Set 098 S1): a
// `kind: plan` set creates or imports a module's `project-plan.md`; a
// `kind: decomposition` set reads that plan plus the module's existing sets
// and authors the next batch of session sets, `prerequisites:`-linked back
// to its sibling plan set (verdict decision 6 — reuses the existing
// machinery, no new gating code). Not wired to any UI yet — Sets 100/101 are
// the callers.

/** The inputs a lifecycle spec's render needs (both kinds share these). */
interface ModuleLifecycleSetContext {
  /** This set's own full slug, e.g. `102-greeter-plan`. */
  slug: string;
  moduleSlug: string;
  moduleTitle: string;
  /** ISO `YYYY-MM-DD`. */
  created: string;
  /** Repo-relative, forward-slashed (from {@link modulePlanRelPath}). */
  planRelPath: string;
}

/** The `kind: decomposition` set's render context — its sibling plan slug too. */
interface ModuleDecompositionSetContext extends ModuleLifecycleSetContext {
  /** The sibling `kind: plan` set's full slug (the `prerequisites:` target). */
  planSlug: string;
}

const MODULE_PLAN_SET_TEMPLATE_FILENAME = "module-plan-set.spec.md.template";
const MODULE_DECOMPOSITION_SET_TEMPLATE_FILENAME =
  "module-decomposition-set.spec.md.template";

/**
 * Resolve the directory the two module-lifecycle spec templates live in —
 * the SAME durable files at `docs/templates/consumer-bootstrap/` that
 * `docs/planning/session-set-authoring-guide.md` documents, so there is
 * exactly one source of truth (verification round 1, finding 2: two
 * hand-synced copies with no parity test is a real drift risk). Mirrors
 * `consumerBootstrap.ts`'s bundle-directory precedent (Set 058): esbuild
 * copies `docs/templates/consumer-bootstrap` next to the packaged
 * `dist/extension.js` at compile time; running against the TS source
 * directly (unit tests, ts-node) resolves the checked-in repo-root copy
 * instead — both candidates sit the same number of directory levels below
 * the extension root, so one resolver covers `src/utils`, `out/utils`
 * (plain-tsc test host), and `dist` alike. Whichever candidate actually
 * holds the plan template wins; a genuinely missing bundle throws a plain
 * ENOENT from the caller's `fs.readFileSync`, not a guess here.
 */
function resolveModuleLifecycleTemplatesDir(): string {
  const candidates = [
    path.join(__dirname, "templates", "consumer-bootstrap"),
    path.join(__dirname, "..", "..", "..", "..", "docs", "templates", "consumer-bootstrap"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, MODULE_PLAN_SET_TEMPLATE_FILENAME))) return c;
  }
  return candidates[candidates.length - 1];
}

function loadModuleLifecycleTemplate(filename: string): string {
  const dir = resolveModuleLifecycleTemplatesDir();
  return fs.readFileSync(path.join(dir, filename), "utf8").replace(/\r\n/g, "\n");
}

/** Substitute every `{{TOKEN}}` the table knows about (unknown ones are left as-is). */
function substituteLifecycleTokens(text: string, table: Record<string, string>): string {
  return text.replace(/{{([A-Z_]+)}}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(table, key) ? table[key] : whole,
  );
}

/** Fail loud on a template/token-table mismatch rather than shipping a literal `{{TOKEN}}`. */
function assertNoUnsubstitutedTokens(rendered: string, filename: string): void {
  const leftover = rendered.match(/{{[A-Z_]+}}/g);
  if (leftover) {
    throw new Error(
      `${filename}: unsubstituted token(s) ${leftover.join(", ")} — a template/writer token-table mismatch.`,
    );
  }
}

/**
 * Render the `kind: plan` set's spec.md from the canonical on-disk template
 * ({@link MODULE_PLAN_SET_TEMPLATE_FILENAME}). Single session:
 * create-or-import the module's project plan — both paths are in-session
 * work (this set replaces the retired AI-Plan / Import-Plan clipboard
 * flows, Set 100). A later plan revision is just another `kind: plan` set
 * targeting the same module and file — nothing here is one-shot or frozen.
 */
export function renderModulePlanSetSpec(ctx: ModuleLifecycleSetContext): string {
  const rendered = substituteLifecycleTokens(
    loadModuleLifecycleTemplate(MODULE_PLAN_SET_TEMPLATE_FILENAME),
    {
      MODULE_TITLE: ctx.moduleTitle,
      MODULE_SLUG: ctx.moduleSlug,
      SLUG: ctx.slug,
      CREATED: ctx.created,
      PLAN_REL_PATH: ctx.planRelPath,
    },
  );
  assertNoUnsubstitutedTokens(rendered, MODULE_PLAN_SET_TEMPLATE_FILENAME);
  return rendered;
}

/**
 * Render the `kind: decomposition` set's spec.md from the canonical on-disk
 * template ({@link MODULE_DECOMPOSITION_SET_TEMPLATE_FILENAME}). Single
 * session: read the current plan plus the module's existing sets (avoid
 * duplication), author the next batch — `prerequisites:` pre-linked to the
 * sibling plan set (`condition: complete`, verdict decision 6: the existing
 * gating machinery, no new mechanism). A later continuation is just
 * another `kind: decomposition` set.
 */
export function renderModuleDecompositionSetSpec(
  ctx: ModuleDecompositionSetContext,
): string {
  const rendered = substituteLifecycleTokens(
    loadModuleLifecycleTemplate(MODULE_DECOMPOSITION_SET_TEMPLATE_FILENAME),
    {
      MODULE_TITLE: ctx.moduleTitle,
      MODULE_SLUG: ctx.moduleSlug,
      SLUG: ctx.slug,
      CREATED: ctx.created,
      PLAN_REL_PATH: ctx.planRelPath,
      PLAN_SLUG: ctx.planSlug,
    },
  );
  assertNoUnsubstitutedTokens(rendered, MODULE_DECOMPOSITION_SET_TEMPLATE_FILENAME);
  return rendered;
}

/**
 * Find an already-scaffolded lifecycle set of the given kind for this
 * module (a slug ending \`-<moduleSlug>-plan\` / \`-<moduleSlug>-decomposition\`
 * with a numeric prefix) — the skip-existing identity check: re-running the
 * scaffold for a module that already has one must reuse it, never mint a
 * duplicate. Deterministic pick (sorted ascending) on the pathological case
 * of more than one match.
 */
function findExistingLifecycleSetSlug(
  dirNames: string[],
  moduleSlug: string,
  kind: "plan" | "decomposition",
): string | null {
  const suffix = `-${moduleSlug}-${kind}`;
  const matches = dirNames
    .filter((n) => n.endsWith(suffix) && numericPrefix(n) !== null)
    .sort();
  return matches.length > 0 ? matches[0] : null;
}

/** Write `text` to `abs` unless it already exists (skip-existing); returns
 * whether a write happened. Re-reads the written bytes back before
 * returning (defense against a concurrent writer racing in). */
function writeSpecSkipExisting(abs: string, text: string): boolean {
  if (fs.existsSync(abs)) return false;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, { encoding: "utf8" });
  if (fs.readFileSync(abs, "utf8") !== text) {
    throw new Error(`${abs} did not verify after writing (concurrent modification?).`);
  }
  return true;
}

/**
 * Parse-after-write guard (the Set 091 appender posture): re-parse the
 * written spec.md with the REAL parsers and confirm the declared `kind` and
 * (for `decomposition`) the `prerequisites:` cross-link actually landed.
 * Throws — never silently — on a mismatch; the caller has already written
 * by this point, so a throw here signals a template/parser drift bug to fix,
 * not a recoverable runtime condition.
 */
function assertLifecycleSpecWritten(
  abs: string,
  expectedKind: "plan" | "decomposition",
  expectedPrereqSlug: string | null,
): void {
  const config = parseSessionSetConfig(abs);
  if (config.kind !== expectedKind) {
    throw new Error(
      `${abs}: expected kind "${expectedKind}", parsed "${config.kind}" — refusing (template/parser drift).`,
    );
  }
  if (expectedPrereqSlug !== null) {
    const prereqs = parsePrerequisites(abs);
    const ok =
      prereqs !== null &&
      prereqs.some(
        (p) => p.slug === expectedPrereqSlug && p.condition === "complete",
      );
    if (!ok) {
      throw new Error(
        `${abs}: expected a prerequisites: entry for "${expectedPrereqSlug}" — refusing (template/parser drift).`,
      );
    }
  }
}

export interface ModuleLifecycleScaffoldResult {
  planSlug: string;
  planSpecRel: string;
  /** False when a lifecycle plan set for this module already existed (skip-existing) — `planSlug` names the existing one. */
  planCreated: boolean;
  decompositionSlug: string;
  decompositionSpecRel: string;
  /** False when a lifecycle decomposition set for this module already existed (skip-existing) — `decompositionSlug` names the existing one. */
  decompositionCreated: boolean;
}

/**
 * Scaffold a module's two lifecycle sets (Set 098 S2 — the Session 1
 * `kind` contract's first real writer): resolves the next two free set
 * numbers (mirrors `ai_router.resolve_set.next_session_set_number`), renders
 * both templates into `docs/session-sets/NNN-<module>-plan/` and
 * `docs/session-sets/NNN-<module>-decomposition/` (spec.md only — state
 * files are the blessed runtime writers' job, per `start_session`), and
 * cross-links the decomposition set's `prerequisites:` to its sibling plan.
 *
 * Skip-existing (identity, not merely path): a module that already has a
 * scaffolded lifecycle set of a given kind keeps it — the writer never
 * mints a duplicate on a re-run, and reuses the existing slug for the
 * `prerequisites:` cross-link. Fail-loud: an invalid module slug throws
 * before any write (the tree is left untouched); the parse-after-write
 * guard throws if a freshly-written file does not parse back as expected.
 * Not wired to any UI yet — Sets 100/101 are the callers.
 */
export function scaffoldModuleLifecycleSets(
  root: string,
  module: ModuleManifestEntry,
): ModuleLifecycleScaffoldResult {
  const moduleSlug = (module.slug ?? "").trim();
  if (!MODULE_SLUG_RE.test(moduleSlug)) {
    throw new Error(
      `Cannot scaffold lifecycle sets: "${module.slug}" is not a valid module slug.`,
    );
  }

  const dirNames = listSessionSetDirNames(root);
  const existingPlanSlug = findExistingLifecycleSetSlug(dirNames, moduleSlug, "plan");
  const existingDecompositionSlug = findExistingLifecycleSetSlug(
    dirNames,
    moduleSlug,
    "decomposition",
  );

  const planSlug =
    existingPlanSlug ?? `${nextSessionSetNumberFrom(dirNames).padded}-${moduleSlug}-plan`;
  // Reserve the freshly-minted plan slug (when it's new) so the
  // decomposition number advances past it too.
  const reservedDirNames =
    existingPlanSlug || dirNames.includes(planSlug) ? dirNames : [...dirNames, planSlug];
  const decompositionSlug =
    existingDecompositionSlug ??
    `${nextSessionSetNumberFrom(reservedDirNames).padded}-${moduleSlug}-decomposition`;

  const created = new Date().toISOString().slice(0, 10);
  const planRelPath = modulePlanRelPath(module);
  const moduleTitle = (module.title ?? "").trim() || moduleSlug;

  const planAbs = path.join(root, SESSION_SETS_REL, planSlug, "spec.md");
  const decompositionAbs = path.join(
    root,
    SESSION_SETS_REL,
    decompositionSlug,
    "spec.md",
  );

  let planCreated = false;
  if (!existingPlanSlug) {
    const planText = renderModulePlanSetSpec({
      slug: planSlug,
      moduleSlug,
      moduleTitle,
      created,
      planRelPath,
    });
    planCreated = writeSpecSkipExisting(planAbs, planText);
    if (planCreated) assertLifecycleSpecWritten(planAbs, "plan", null);
  }

  let decompositionCreated = false;
  if (!existingDecompositionSlug) {
    const decompositionText = renderModuleDecompositionSetSpec({
      slug: decompositionSlug,
      moduleSlug,
      moduleTitle,
      created,
      planRelPath,
      planSlug,
    });
    decompositionCreated = writeSpecSkipExisting(decompositionAbs, decompositionText);
    if (decompositionCreated) {
      assertLifecycleSpecWritten(decompositionAbs, "decomposition", planSlug);
    }
  }

  return {
    planSlug,
    planSpecRel: `${SESSION_SETS_REL.replace(/\\/g, "/")}/${planSlug}/spec.md`,
    planCreated,
    decompositionSlug,
    decompositionSpecRel: `${SESSION_SETS_REL.replace(/\\/g, "/")}/${decompositionSlug}/spec.md`,
    decompositionCreated,
  };
}
