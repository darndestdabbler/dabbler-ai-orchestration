// Shared consumer-bootstrap template writer (Set 058 S2).
//
// One module renders the canonical scaffolding artifacts a new consumer
// repo needs — the templated ``spec.md``, its ``session-state.json``
// (schemaVersion 4, ``status: not-started``), the three engine files
// (``CLAUDE.md`` / ``AGENTS.md`` / ``GEMINI.md`` = one shared body + a
// short per-engine tail), and the generated ``docs/dabbler/start-here.md``
// cold-start operative doc — from the durable template bundle at
// ``docs/templates/consumer-bootstrap/`` (the Set 058 S1 deliverable).
//
// Three creation paths consume this writer so they cannot drift apart
// (D4/D8): the Getting Started form's "Build project structure" (Set
// 060 — the Set 021 wizard it replaced is retired), ``dabbler.
// setupNewProject`` (``gitScaffold``, converged on the same no-prompt
// scaffold), and ``dabbler.generateSessionSetPrompt``
// (``sessionGenPrompt``). The writer is pure — it takes the raw template
// strings plus a context object and returns ``{ relPath: content }`` — so
// the test suite can render against the canonical bundle with no VS Code,
// no filesystem writes, and no subprocess. ``loadTemplateBundle`` is the
// only fs-touching surface; ``resolveBundledTemplateDir`` resolves where
// the templates were copied inside the packaged extension (see esbuild.js).
//
// The one tier divergence the design lock allows lives in the *caller*
// (gitScaffold writes ``ai_router/router-config.yaml`` on Full only); the
// rendered artifacts here are identical across tiers except for the
// ``tier:`` value carried into ``spec.md`` and the Lightweight-only
// ``verificationMode:`` line (Set 082: Full-tier scaffolds omit the field
// entirely — it is Lightweight-only, and absence means the default).
// Lightweight is router-off, not Python-off — see the tier-model SSoT.

import * as fs from "fs";
import * as path from "path";

/** Default Lightweight verification mode; inert on Full (see spec schema). */
export const DEFAULT_VERIFICATION_MODE = "out-of-band-or-none";

export type Tier = "full" | "lightweight";

/** The values the writer substitutes into the template bundle. */
export interface BootstrapContext {
  /** Consumer repo name, e.g. ``my-app``. */
  repoName: string;
  /** Human-readable session-set title, e.g. ``User authentication``. */
  setTitle: string;
  /** One-sentence purpose of the set. */
  purpose: string;
  /** Full ``NNN-``-prefixed set slug, e.g. ``001-user-authentication``. */
  slug: string;
  /** ISO date the set was created (``YYYY-MM-DD``). */
  created: string;
  /** ``full`` or ``lightweight``. */
  tier: Tier;
  /** Lightweight verification mode; defaults to {@link DEFAULT_VERIFICATION_MODE}. */
  verificationMode: string;
  /** Planned session count (>= 1). */
  totalSessions: number;
  /**
   * Set 087 S3 (ruling Q2): the module slug the rendered set belongs to
   * (its ``docs/modules.yaml`` identity). Optional — absent renders no
   * ``module:`` line at all (the single-module / no-manifest case), so
   * pre-087 output is byte-identical. ``module`` is a grouping attribute
   * only: set names stay globally unique across all modules.
   */
  module?: string;
}

/** The raw template strings, as loaded from the bundle directory. */
export interface TemplateBundle {
  specTemplate: string;
  sessionStateTemplate: string;
  startHereTemplate: string;
  /**
   * Set 060 S3 (spec D8): the static Getting Started teaching doc.
   * Deliberately token-free so the BUNDLED copy can be opened in the
   * editor before any scaffold has run (the no-folder / pre-build
   * states) — the same bytes are also written to the consumer repo at
   * {@link GETTING_STARTED_REL_PATH} by both scaffold paths.
   */
  gettingStartedTemplate: string;
  sharedBody: string;
  claudeTail: string;
  agentsTail: string;
  geminiTail: string;
  /**
   * Set 064 (D7): the metadata-aware guidance-lifecycle starters a new repo
   * inherits under ``docs/planning/`` — the always-loaded active
   * ``lessons-learned.md``, the ``project-guidance.md`` skeleton, and the
   * never-auto-loaded ``lessons-archive.md`` (seeded empty). They carry the
   * per-lesson metadata trailer convention and point at the canonical
   * lifecycle doc so a fresh repo starts the lifecycle on day one.
   */
  lessonsLearnedTemplate: string;
  projectGuidanceTemplate: string;
  lessonsArchiveTemplate: string;
  /**
   * Set 077 S4 (Feature 3): the canonical engine-facing out-of-band
   * verification instructions, rendered to
   * {@link CROSS_PROVIDER_VERIFICATION_REL_PATH}. Also ensure-written
   * idempotently by the extension before any Evaluate pointer prompt is
   * emitted (critique M2 — the installed base gets the doc without a
   * re-bootstrap).
   */
  crossProviderVerificationTemplate: string;
  /**
   * Set 087 S3 (ruling Q3): the module-ownership CODEOWNERS teaching
   * template — a worked three-person example plus the integration
   * `touches` review rule, written to {@link CODEOWNERS_REL_PATH}.
   * Token-free and comment-only, so committing it unadapted is inert.
   */
  codeownersTemplate: string;
  /**
   * Set 087 S3 (ruling Q3): the monorepo CI teaching template —
   * commented path-scoped per-module jobs plus the ACTIVE all-module
   * guardrail job on every merge to main (its placeholder step succeeds,
   * so the unadapted file never breaks a build). Written to
   * {@link MONOREPO_CI_REL_PATH}. Token-free.
   */
  monorepoCiTemplate: string;
}

/** Filenames inside ``docs/templates/consumer-bootstrap/``. */
const BUNDLE_FILES = {
  specTemplate: "spec.md.template",
  sessionStateTemplate: "session-state.json.template",
  startHereTemplate: "start-here.md.template",
  gettingStartedTemplate: "getting-started.md.template",
  sharedBody: "engine-file.shared-body.md",
  claudeTail: "engine-file.claude-tail.md",
  agentsTail: "engine-file.agents-tail.md",
  geminiTail: "engine-file.gemini-tail.md",
  lessonsLearnedTemplate: "lessons-learned.md.template",
  projectGuidanceTemplate: "project-guidance.md.template",
  lessonsArchiveTemplate: "lessons-archive.md.template",
  crossProviderVerificationTemplate: "cross-provider-verification.md.template",
  codeownersTemplate: "CODEOWNERS.template",
  monorepoCiTemplate: "monorepo-ci.yml.template",
} as const;

/**
 * Filename of the Getting Started template inside the bundle dir —
 * exported so the editor-open path (gettingStartedDoc.ts) can resolve
 * the bundled copy without re-deriving the name.
 */
export const GETTING_STARTED_TEMPLATE_FILENAME =
  BUNDLE_FILES.gettingStartedTemplate;

/**
 * Resolve the directory the template bundle was copied into inside the
 * packaged extension. esbuild copies ``docs/templates/consumer-bootstrap``
 * (repo root) to ``dist/templates/consumer-bootstrap`` at compile time, so
 * the canonical bundle remains the single source of truth and the runtime
 * read never reaches outside the installed extension.
 */
export function resolveBundledTemplateDir(extensionPath: string): string {
  return path.join(extensionPath, "dist", "templates", "consumer-bootstrap");
}

/**
 * Read all template files from a bundle directory. Line endings are
 * normalized to LF on read: the marker-matching in {@link expandSpecSessions}
 * keys off literal ``\n`` sequences, so a CRLF checkout (Windows
 * ``core.autocrlf``) would otherwise silently skip session expansion. Render
 * output is therefore LF — correct for generated files.
 */
export function loadTemplateBundle(bundleDir: string): TemplateBundle {
  const read = (name: string): string =>
    fs.readFileSync(path.join(bundleDir, name), "utf8").replace(/\r\n/g, "\n");
  return {
    specTemplate: read(BUNDLE_FILES.specTemplate),
    sessionStateTemplate: read(BUNDLE_FILES.sessionStateTemplate),
    startHereTemplate: read(BUNDLE_FILES.startHereTemplate),
    gettingStartedTemplate: read(BUNDLE_FILES.gettingStartedTemplate),
    sharedBody: read(BUNDLE_FILES.sharedBody),
    claudeTail: read(BUNDLE_FILES.claudeTail),
    agentsTail: read(BUNDLE_FILES.agentsTail),
    geminiTail: read(BUNDLE_FILES.geminiTail),
    lessonsLearnedTemplate: read(BUNDLE_FILES.lessonsLearnedTemplate),
    projectGuidanceTemplate: read(BUNDLE_FILES.projectGuidanceTemplate),
    lessonsArchiveTemplate: read(BUNDLE_FILES.lessonsArchiveTemplate),
    crossProviderVerificationTemplate: read(
      BUNDLE_FILES.crossProviderVerificationTemplate,
    ),
    codeownersTemplate: read(BUNDLE_FILES.codeownersTemplate),
    monorepoCiTemplate: read(BUNDLE_FILES.monorepoCiTemplate),
  };
}

/** Zero-pad a session number to the canonical width-3 form (``001``). */
export function padSessionNumber(n: number): string {
  return String(n).padStart(3, "0");
}

/**
 * Enforce the writer's ``totalSessions >= 1`` contract at the lowest choke
 * points. A non-UI caller passing 0 / a fraction / NaN would otherwise emit a
 * spec with zero session blocks or a state file with an empty ``sessions``
 * array; fail fast instead.
 */
function assertPositiveSessionCount(totalSessions: number): void {
  if (!Number.isInteger(totalSessions) || totalSessions < 1) {
    throw new Error(
      `consumer-bootstrap: totalSessions must be a positive integer, got ${totalSessions}`,
    );
  }
}

/**
 * The whole ``verificationMode:`` config line (text + trailing newline) for
 * the spec template's ``{{VERIFICATION_MODE_LINE}}`` token (Set 082). The
 * field is Lightweight-only, so a Full-tier scaffold omits the line entirely
 * — omission is schema-legal (absence means the documented default) and
 * avoids the phantom "choice" a Full spec would otherwise appear to declare.
 * The ``{{TOKEN}}`` engine has no conditionals, so the tier branch lives
 * here: the full current line on ``lightweight``, the empty string on
 * ``full`` (no blank-line residue — the token sits flush against the next
 * template line).
 */
function verificationModeLine(ctx: BootstrapContext): string {
  if (ctx.tier !== "lightweight") return "";
  const mode = ctx.verificationMode || DEFAULT_VERIFICATION_MODE;
  return `verificationMode: ${mode}  # Lightweight only: out-of-band-or-none (default) | dedicated-sessions; inert on Full\n`;
}

/**
 * The whole ``module:`` config line (text + trailing newline) for the spec
 * template's ``{{MODULE_LINE}}`` token (Set 087 S3, ruling Q2 — the same
 * whole-line-token pattern as {@link verificationModeLine}): the line
 * renders only when the context carries a module slug, so a repo with no
 * module manifest emits byte-identical pre-087 output.
 */
function moduleLine(ctx: BootstrapContext): string {
  if (!ctx.module) return "";
  return `module: ${ctx.module}                      # grouping only — set names stay globally unique\n`;
}

/** Map a {@link BootstrapContext} to its ``{{TOKEN}}`` -> value table. */
function tokenTable(ctx: BootstrapContext): Record<string, string> {
  return {
    REPO_NAME: ctx.repoName,
    SET_TITLE: ctx.setTitle,
    PURPOSE: ctx.purpose,
    SLUG: ctx.slug,
    CREATED: ctx.created,
    TIER: ctx.tier,
    MODULE_LINE: moduleLine(ctx),
    VERIFICATION_MODE_LINE: verificationModeLine(ctx),
    TOTAL_SESSIONS: String(ctx.totalSessions),
  };
}

/**
 * Substitute every ``{{TOKEN}}`` the table knows about. Unknown
 * ``{{...}}`` sequences are left untouched so {@link findUnsubstitutedTokens}
 * can flag a real writer bug (a template token nobody supplies a value for).
 */
export function substituteTokens(
  text: string,
  ctx: BootstrapContext,
): string {
  const table = tokenTable(ctx);
  return text.replace(/{{([A-Z_]+)}}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(table, key) ? table[key] : whole,
  );
}

/**
 * Return any ``{{TOKEN}}`` placeholders still present in rendered output.
 * A non-empty result is a writer bug (and a Session-3 snapshot failure).
 */
export function findUnsubstitutedTokens(rendered: string): string[] {
  const out = new Set<string>();
  for (const m of rendered.matchAll(/{{[A-Z_]+}}/g)) out.add(m[0]);
  return [...out];
}

/**
 * Expand the single repeated ``### Session K of N`` unit in the spec
 * template to ``totalSessions`` numbered instances.
 *
 * The template on disk shows a representative sample of the unit (two
 * blocks) per the bundle README; the writer emits exactly N, numbered
 * ``1..N`` with progress keys keyed ``session-00K/``. The first sample
 * block is the canonical unit. If the expected markers are absent the
 * text is returned unchanged (defensive — a malformed template is caught
 * by {@link findUnsubstitutedTokens} / the snapshot test, not silently
 * mangled here).
 *
 * Call this AFTER {@link substituteTokens}, so ``{{TOTAL_SESSIONS}}`` in
 * the headers is already the integer and only the literal session number
 * and ``session-001/`` progress-key prefix need re-numbering per block.
 */
export function expandSpecSessions(
  specText: string,
  totalSessions: number,
): string {
  assertPositiveSessionCount(totalSessions);
  // Defensive: tolerate a CRLF caller even though loadTemplateBundle
  // already normalizes. The marker matching below is LF-keyed.
  specText = specText.replace(/\r\n/g, "\n");
  const SESSIONS_HEADER = "## Sessions\n";
  const DELIVERABLES_HEADER = "## End-of-set deliverables";
  const SEP = "\n\n---\n\n";

  const headerIdx = specText.indexOf(SESSIONS_HEADER);
  const deliverablesIdx = specText.indexOf(DELIVERABLES_HEADER);
  if (headerIdx === -1 || deliverablesIdx === -1 || deliverablesIdx < headerIdx) {
    return specText;
  }

  const preamble = specText.slice(0, headerIdx + SESSIONS_HEADER.length);
  const postamble = specText.slice(deliverablesIdx);

  // The canonical unit is the first ``### Session 1 of`` block, up to the
  // first ``---`` separator that follows it.
  const region = specText.slice(headerIdx + SESSIONS_HEADER.length, deliverablesIdx);
  const blockStart = region.indexOf("### Session 1 of");
  if (blockStart === -1) return specText;
  const afterStart = region.slice(blockStart);
  const sepIdx = afterStart.indexOf(SEP);
  const unit = (sepIdx === -1 ? afterStart : afterStart.slice(0, sepIdx)).trimEnd();

  const blocks: string[] = [];
  for (let k = 1; k <= totalSessions; k++) {
    let block = unit.replace("### Session 1 of", `### Session ${k} of`);
    block = block.replace(/session-001\//g, `session-${padSessionNumber(k)}/`);
    blocks.push(block);
  }

  return `${preamble}\n${blocks.join(SEP)}${SEP}${postamble}`;
}

/**
 * Expand the single repeated session object in the state template to
 * ``totalSessions`` not-started entries (``number: K``,
 * ``title: "Session K"``). Call AFTER {@link substituteTokens}.
 */
export function expandSessionState(
  stateText: string,
  totalSessions: number,
): string {
  assertPositiveSessionCount(totalSessions);
  const parsed = JSON.parse(stateText) as {
    sessions: Array<Record<string, unknown>>;
    [k: string]: unknown;
  };
  const unit = parsed.sessions[0];
  parsed.sessions = [];
  for (let k = 1; k <= totalSessions; k++) {
    parsed.sessions.push({
      ...unit,
      number: k,
      title: `Session ${k}`,
      status: "not-started",
      startedAt: null,
      completedAt: null,
      orchestrator: null,
      verificationVerdict: null,
    });
  }
  return JSON.stringify(parsed, null, 2) + "\n";
}

/** Render one engine file: shared body + ``\n`` + that engine's tail. */
export function renderEngineFile(
  sharedBody: string,
  tail: string,
  ctx: BootstrapContext,
): string {
  return substituteTokens(sharedBody, ctx) + "\n" + substituteTokens(tail, ctx);
}

/** Render the templated ``spec.md`` (tokens substituted, sessions expanded). */
export function renderSpec(bundle: TemplateBundle, ctx: BootstrapContext): string {
  return expandSpecSessions(
    substituteTokens(bundle.specTemplate, ctx),
    ctx.totalSessions,
  );
}

/** Render ``session-state.json`` (schemaVersion 4, N not-started sessions). */
export function renderSessionState(
  bundle: TemplateBundle,
  ctx: BootstrapContext,
): string {
  return expandSessionState(
    substituteTokens(bundle.sessionStateTemplate, ctx),
    ctx.totalSessions,
  );
}

/** Render the generated ``docs/dabbler/start-here.md`` cold-start doc. */
export function renderStartHere(
  bundle: TemplateBundle,
  ctx: BootstrapContext,
): string {
  return substituteTokens(bundle.startHereTemplate, ctx);
}

/**
 * The rendered consumer-bootstrap artifacts, keyed by their path relative
 * to the consumer repo root. ``router-config.yaml`` is NOT here — it is
 * the one tier divergence and is materialized by the caller (Full only).
 */
export interface RenderedArtifacts {
  files: Record<string, string>;
}

/** Relative output path of the active set's spec.md for the given context. */
export function specRelPath(ctx: BootstrapContext): string {
  return path.posix.join("docs", "session-sets", ctx.slug, "spec.md");
}

/** Relative output path of the active set's session-state.json. */
export function sessionStateRelPath(ctx: BootstrapContext): string {
  return path.posix.join("docs", "session-sets", ctx.slug, "session-state.json");
}

/** Relative output path of the generated cold-start operative doc. */
export const START_HERE_REL_PATH = path.posix.join("docs", "dabbler", "start-here.md");

/**
 * Relative output path of the static Getting Started instructions doc
 * (Set 060 S3, spec D8). Written by both scaffold paths; also openable
 * straight from the bundle (the template is token-free) before any
 * scaffold has run.
 */
export const GETTING_STARTED_REL_PATH = path.posix.join(
  "docs",
  "dabbler",
  "getting-started.md",
);

/**
 * Set 077 S4 (Feature 3): relative output path of the canonical
 * engine-facing cross-provider verification instructions. Written by both
 * scaffold paths AND ensure-written/refreshed idempotently by the
 * extension before any Evaluate pointer prompt is emitted (see
 * ``ensureCrossProviderVerificationDoc`` in copyPromptCommands.ts), so
 * consumer repos bootstrapped before Set 077 receive it on first use.
 */
export const CROSS_PROVIDER_VERIFICATION_REL_PATH = path.posix.join(
  "docs",
  "dabbler",
  "cross-provider-verification.md",
);

/** Render the canonical cross-provider verification instruction doc. */
export function renderCrossProviderVerification(
  bundle: TemplateBundle,
  ctx: BootstrapContext,
): string {
  return substituteTokens(bundle.crossProviderVerificationTemplate, ctx);
}

/**
 * Set 064 (D7): output paths of the guidance-lifecycle starters. Repo-level
 * ``docs/planning/`` files — part of a fresh repo's structure, so both the
 * full scaffold and the structure-only scaffold emit them. The scaffold's
 * skip-existing guard protects an existing repo's accumulated guidance from
 * being clobbered on a re-run.
 */
export const LESSONS_LEARNED_REL_PATH = path.posix.join("docs", "planning", "lessons-learned.md");
export const PROJECT_GUIDANCE_REL_PATH = path.posix.join("docs", "planning", "project-guidance.md");
export const LESSONS_ARCHIVE_REL_PATH = path.posix.join("docs", "planning", "lessons-archive.md");

/**
 * Set 087 S3 (ruling Q3): output paths of the module-ownership CODEOWNERS
 * and the monorepo-CI teaching templates. Repo structure — both scaffold
 * paths emit them (skip-existing guarded, like every scaffold artifact),
 * so a new project starts with the ownership map and the
 * anti-integration-bomb CI shape in place. Both files are inert until
 * adapted: CODEOWNERS is comment-only, and the CI workflow's single
 * active job runs a succeeding placeholder step.
 */
export const CODEOWNERS_REL_PATH = path.posix.join(".github", "CODEOWNERS");
export const MONOREPO_CI_REL_PATH = path.posix.join(
  ".github",
  "workflows",
  "monorepo-ci.yml",
);

/** Render the three guidance-lifecycle starters (token-substituted). */
function guidanceFiles(
  bundle: TemplateBundle,
  ctx: BootstrapContext,
): Record<string, string> {
  return {
    [LESSONS_LEARNED_REL_PATH]: substituteTokens(bundle.lessonsLearnedTemplate, ctx),
    [PROJECT_GUIDANCE_REL_PATH]: substituteTokens(bundle.projectGuidanceTemplate, ctx),
    [LESSONS_ARCHIVE_REL_PATH]: substituteTokens(bundle.lessonsArchiveTemplate, ctx),
  };
}

/**
 * Render every consumer-bootstrap artifact for ``ctx`` from ``bundle``.
 * Returns a path -> content map (paths relative to the consumer repo root,
 * forward-slashed). Throws if any template leaves a ``{{TOKEN}}``
 * unsubstituted — that is a writer bug, not a recoverable condition.
 */
export function renderConsumerBootstrap(
  bundle: TemplateBundle,
  ctx: BootstrapContext,
): RenderedArtifacts {
  const files: Record<string, string> = {
    "CLAUDE.md": renderEngineFile(bundle.sharedBody, bundle.claudeTail, ctx),
    "AGENTS.md": renderEngineFile(bundle.sharedBody, bundle.agentsTail, ctx),
    "GEMINI.md": renderEngineFile(bundle.sharedBody, bundle.geminiTail, ctx),
    [START_HERE_REL_PATH]: renderStartHere(bundle, ctx),
    [GETTING_STARTED_REL_PATH]: bundle.gettingStartedTemplate,
    // Set 077 S4 (Feature 3): the engine-facing verification doc the
    // Evaluate pointer prompts reference.
    [CROSS_PROVIDER_VERIFICATION_REL_PATH]: renderCrossProviderVerification(
      bundle,
      ctx,
    ),
    [specRelPath(ctx)]: renderSpec(bundle, ctx),
    [sessionStateRelPath(ctx)]: renderSessionState(bundle, ctx),
    // Set 064 (D7): the guidance-lifecycle starters under docs/planning/.
    ...guidanceFiles(bundle, ctx),
    // Set 087 S3 (ruling Q3): the module-ownership + monorepo-CI teaching
    // templates (token-free; inert until adapted).
    [CODEOWNERS_REL_PATH]: bundle.codeownersTemplate,
    [MONOREPO_CI_REL_PATH]: bundle.monorepoCiTemplate,
  };

  const leftovers = new Set<string>();
  for (const content of Object.values(files)) {
    for (const t of findUnsubstitutedTokens(content)) leftovers.add(t);
  }
  if (leftovers.size > 0) {
    throw new Error(
      `consumer-bootstrap render left unsubstituted token(s): ${[...leftovers].sort().join(", ")}`,
    );
  }
  return { files };
}

/**
 * Render ONLY the project-structure artifacts — the three engine files,
 * the cold-start ``docs/dabbler/start-here.md``, the Getting Started doc,
 * and the Set 064 ``docs/planning/`` guidance-lifecycle starters — with NO
 * starter session set (Set 060 S2, spec D5). The Getting Started form's "Build project
 * structure" step must not seed a ``docs/session-sets/...`` set: there is
 * no title prompt to name one, and materializing a set would flip the
 * dual-mode Explorer to "list" mid-form, hiding steps 2 and 3. Session
 * sets are created by step 3's decomposition prompt instead.
 *
 * These templates only consume ``{{REPO_NAME}}``, so the context's
 * set-specific fields (title, slug, sessions) are irrelevant here —
 * callers pass a plain repo-shaped context via
 * {@link structureOnlyContext}. Token validation still applies.
 */
export function renderStructureBootstrap(
  bundle: TemplateBundle,
  ctx: BootstrapContext,
): RenderedArtifacts {
  const files: Record<string, string> = {
    "CLAUDE.md": renderEngineFile(bundle.sharedBody, bundle.claudeTail, ctx),
    "AGENTS.md": renderEngineFile(bundle.sharedBody, bundle.agentsTail, ctx),
    "GEMINI.md": renderEngineFile(bundle.sharedBody, bundle.geminiTail, ctx),
    [START_HERE_REL_PATH]: renderStartHere(bundle, ctx),
    // D8 (Set 060 S3): the static Getting Started teaching doc ships
    // with the structure scaffold too, so the editor-open path can
    // prefer the workspace copy once the structure is built.
    [GETTING_STARTED_REL_PATH]: bundle.gettingStartedTemplate,
    // Set 077 S4 (Feature 3): the verification instruction doc is repo
    // structure — the Lightweight review flow depends on it.
    [CROSS_PROVIDER_VERIFICATION_REL_PATH]: renderCrossProviderVerification(
      bundle,
      ctx,
    ),
    // Set 064 (D7): the guidance-lifecycle starters are repo structure too,
    // so a fresh repo built via "Build project structure" starts the
    // lifecycle with docs/planning/ in place.
    ...guidanceFiles(bundle, ctx),
    // Set 087 S3 (ruling Q3): the ownership + CI teaching templates are
    // repo structure too — a new project starts with them in place.
    [CODEOWNERS_REL_PATH]: bundle.codeownersTemplate,
    [MONOREPO_CI_REL_PATH]: bundle.monorepoCiTemplate,
  };

  const leftovers = new Set<string>();
  for (const content of Object.values(files)) {
    for (const t of findUnsubstitutedTokens(content)) leftovers.add(t);
  }
  if (leftovers.size > 0) {
    throw new Error(
      `structure-only bootstrap render left unsubstituted token(s): ${[...leftovers].sort().join(", ")}`,
    );
  }
  return { files };
}

/**
 * A {@link BootstrapContext} for the structure-only scaffold path. The
 * set-specific fields are deterministic placeholders — they feed no
 * rendered output (the structure templates consume ``{{REPO_NAME}}``
 * only) but keep the context type honest for the shared writer.
 *
 * Set 077 S3 (Feature 2, closing the A11 hardcode): ``verificationMode``
 * carries the operator's three-way-choice pick into the context — the
 * scaffold's durable ``.dabbler/verification-mode`` marker is written
 * from it. Callers without a pick omit it and the documented default
 * applies.
 */
export function structureOnlyContext(
  repoName: string,
  tier: Tier,
  created: string,
  // The closed union, not `string` (S3 code-review Minor 3): the whole
  // point of the fail-loud rider narrowing is that nothing wider can
  // reach the durable marker write.
  verificationMode: "dedicated-sessions" | "out-of-band-or-none" = DEFAULT_VERIFICATION_MODE,
): BootstrapContext {
  return {
    repoName,
    setTitle: "(no starter set — created via the Getting Started decomposition prompt)",
    purpose: "(no starter set)",
    slug: "000-placeholder-unused",
    created,
    tier,
    verificationMode,
    totalSessions: 1,
  };
}

// ---------- slug helpers ----------

const NNN_SLUG_RE = /^\d{3,}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Kebab-case a free-text title (lowercase, alnum runs joined by ``-``). */
export function kebabCase(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Build a canonical ``NNN-slug`` from a session number and a free-text
 * title. Width is 3 (or wider if ``number`` itself needs more digits).
 */
export function buildSlug(setNumber: number, title: string): string {
  const kebab = kebabCase(title) || "session-set";
  return `${padSessionNumber(setNumber)}-${kebab}`;
}

/** True when ``slug`` matches the required ``NNN-kebab`` shape. */
export function isCanonicalSlug(slug: string): boolean {
  return NNN_SLUG_RE.test(slug);
}
