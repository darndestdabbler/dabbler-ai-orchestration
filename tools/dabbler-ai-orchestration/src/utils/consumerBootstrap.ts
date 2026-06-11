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
// (D4/D8): the Get Started wizard, ``dabbler.setupNewProject``
// (``gitScaffold``), and ``dabbler.generateSessionSetPrompt``
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
// ``tier:`` and ``verificationMode:`` values carried into ``spec.md``.
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
}

/** The raw template strings, as loaded from the bundle directory. */
export interface TemplateBundle {
  specTemplate: string;
  sessionStateTemplate: string;
  startHereTemplate: string;
  sharedBody: string;
  claudeTail: string;
  agentsTail: string;
  geminiTail: string;
}

/** Filenames inside ``docs/templates/consumer-bootstrap/``. */
const BUNDLE_FILES = {
  specTemplate: "spec.md.template",
  sessionStateTemplate: "session-state.json.template",
  startHereTemplate: "start-here.md.template",
  sharedBody: "engine-file.shared-body.md",
  claudeTail: "engine-file.claude-tail.md",
  agentsTail: "engine-file.agents-tail.md",
  geminiTail: "engine-file.gemini-tail.md",
} as const;

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
 * Read all seven template files from a bundle directory. Line endings are
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
    sharedBody: read(BUNDLE_FILES.sharedBody),
    claudeTail: read(BUNDLE_FILES.claudeTail),
    agentsTail: read(BUNDLE_FILES.agentsTail),
    geminiTail: read(BUNDLE_FILES.geminiTail),
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

/** Map a {@link BootstrapContext} to its ``{{TOKEN}}`` -> value table. */
function tokenTable(ctx: BootstrapContext): Record<string, string> {
  return {
    REPO_NAME: ctx.repoName,
    SET_TITLE: ctx.setTitle,
    PURPOSE: ctx.purpose,
    SLUG: ctx.slug,
    CREATED: ctx.created,
    TIER: ctx.tier,
    VERIFICATION_MODE: ctx.verificationMode || DEFAULT_VERIFICATION_MODE,
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
    [specRelPath(ctx)]: renderSpec(bundle, ctx),
    [sessionStateRelPath(ctx)]: renderSessionState(bundle, ctx),
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
 * Render ONLY the project-structure artifacts — the three engine files +
 * the cold-start ``docs/dabbler/start-here.md`` — with NO starter session
 * set (Set 060 S2, spec D5). The Getting Started form's "Build project
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
 */
export function structureOnlyContext(repoName: string, tier: Tier, created: string): BootstrapContext {
  return {
    repoName,
    setTitle: "(no starter set — created via the Getting Started decomposition prompt)",
    purpose: "(no starter set)",
    slug: "000-placeholder-unused",
    created,
    tier,
    verificationMode: DEFAULT_VERIFICATION_MODE,
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
