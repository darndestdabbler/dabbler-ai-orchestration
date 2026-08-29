// Load and validate router-config.yaml; resolve transport preference and
// effective generation params.
//
// Structural validation runs through the JSON schema at
// `schemas/router-config.schema.json`. Semantic rules a schema cannot
// express (cross-references between blocks) run here, all at load time so a
// bad config fails at startup rather than mid-call. A role's preference
// order is deliberately not cross-referenced: it is ordering only, so a name
// that matches no model is a stale line rather than an error.
//
// Configuration resolves in three layers, and each one owns a different kind
// of fact:
//
// 1. The bundled `router-config.yaml` is package data and therefore the
//    *published* default: providers, models, roles and transports. It must
//    stay correct for a fresh install that has provider API keys and no seat.
// 2. `dabbler.yaml` at the repository root is **tracked**, and carries what
//    the repository owns -- its suites, its selection rules, how it
//    publishes, which of its paths are sensitive. CI reads these and so does
//    the next machine, which is precisely why they cannot live in a
//    gitignored file.
// 3. `local-overrides.yaml` is machine facts only, deep-merged last and
//    never published. It is refused a key the repository owns, because an
//    overlay nobody can see must not be able to replace a suite command that
//    the run of record will then attribute to the repository.
//
// Config is the only layer that is client-independent, model-independent and
// transport-independent -- an instruction file cannot carry a machine fact
// because which instruction files load at all is a property of the client,
// and an env var reaches only processes started after it was written.
//
// The YAML is parsed as **1.1**, which is the version PyYAML implements:
// under 1.2 an unquoted `off` is the string "off" rather than false, and a
// config that means one thing to each router is the drift the port exists to
// remove.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";

import { parse as parseYaml } from "yaml";

import { AI_ROUTER_DIR, SCHEMA_DIR } from "./paths.ts";
import { repoRootFor } from "./journal.ts";
import { schemaFailure } from "./schema/validate.ts";
import { readText } from "./textfile.ts";
import { validateTransportTimeouts } from "./transports/copilot.ts";

/** The loaded config: schema-shaped data plus the `_`-prefixed provenance. */
export type RouterConfig = Record<string, unknown>;

/** Every refusal this module raises. Python spells them ValueError. */
export class ConfigError extends Error {}

/** The named config does not exist. Python spells it FileNotFoundError. */
export class ConfigNotFoundError extends ConfigError {}

const SCHEMA_PATH = join(SCHEMA_DIR, "router-config.schema.json");
const PROJECT_SCHEMA_PATH = join(SCHEMA_DIR, "dabbler.schema.json");
const BUNDLED_CONFIG_PATH = join(AI_ROUTER_DIR, "router-config.yaml");

export const LOCAL_OVERRIDES_FILENAME = "local-overrides.yaml";
export const PROJECT_CONFIG_FILENAME = "dabbler.yaml";

/**
 * The blocks a repository owns. They are declared in the tracked
 * `dabbler.yaml` and refused in the machine-local overlay: the split is what
 * keeps a gitignored file from rewriting a fact the record attributes to the
 * repository.
 */
export const REPOSITORY_OWNED_BLOCKS: ReadonlySet<string> = new Set([
  "testing",
  "packaging",
  "paths",
]);

export const TRANSPORT_API = "api";
export const TRANSPORT_COPILOT_CLI = "copilot-cli";
// Scripted responses from disk: no network, no credentials, no spend. It
// answers from a directory the operator names, so it cannot be reached by
// default or by accident.
export const TRANSPORT_OFFLINE = "offline";
export const VALID_TRANSPORTS = [
  TRANSPORT_API,
  TRANSPORT_COPILOT_CLI,
  TRANSPORT_OFFLINE,
] as const;

export const TRANSPORT_ENV_VAR = "DABBLER_TRANSPORT";
export const CONFIG_ENV_VAR = "AI_ROUTER_CONFIG";

/** The backstop every review loop shares when the config names no bound. */
export const DEFAULT_VERIFICATION_ROUNDS = 3;

/**
 * The backstop for the test loop. Higher than the review bound because the
 * rounds are different things: a review round buys a vendor's opinion, a test
 * round runs a suite the framework already has. What both bounds stop is an
 * unattended loop that never converges.
 */
export const DEFAULT_TEST_ROUNDS = 7;

export const CRITIQUE_PIPELINE_DEFAULT = "off";
export const CRITIQUE_PIPELINE_SHADOW = "shadow";
export const CRITIQUE_PIPELINE_ENFORCE = "enforce";
// The set that implements enforcement. Named in the refusal so an operator
// who sets 'enforce' early learns what they are waiting for.
export const CRITIQUE_ENFORCE_SET = "145-lite-enforcement-and-projection";

// Keys required in transports.copilot-cli when that transport is selected.
// Roles are not among them: selection is by role on both transports, so the
// declaration is top-level and a seat block does not own it.
const COPILOT_CLI_REQUIRED_KEYS = ["lockfile"];

// --- Small helpers over untyped YAML ----------------------------------------

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/** Python's `type(x).__name__`, for a refusal that names what it got. */
function typeName(value: unknown): string {
  if (value === null || value === undefined) return "NoneType";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  if (typeof value === "string") return "str";
  if (Array.isArray(value)) return "list";
  return "dict";
}

function deepCopy<T>(value: T): T {
  return structuredClone(value);
}

export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const out = deepCopy(base);
  for (const [key, value] of Object.entries(override ?? {})) {
    const existing = out[key];
    if (isRecord(existing) && isRecord(value)) {
      out[key] = deepMerge(existing, value);
    } else {
      out[key] = deepCopy(value);
    }
  }
  return out;
}

function readYaml(path: string): unknown {
  // 1.1 is PyYAML's version; see the module header.
  return parseYaml(readText(path), { version: "1.1" }) ?? null;
}

// --- Schemas ----------------------------------------------------------------

let schemaCache: Record<string, unknown> | undefined;
let projectSchemaCache: Record<string, unknown> | undefined;
let overlaySchemaCache: Record<string, unknown> | undefined;

function loadSchema(): Record<string, unknown> {
  schemaCache ??= JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as Record<
    string,
    unknown
  >;
  return schemaCache;
}

function projectSchema(): Record<string, unknown> {
  projectSchemaCache ??= JSON.parse(
    readFileSync(PROJECT_SCHEMA_PATH, "utf8"),
  ) as Record<string, unknown>;
  return projectSchemaCache;
}

/**
 * The vocabulary a machine-local overlay may use: the router-config schema
 * with the repository-owned blocks removed.
 *
 * Removed rather than merely checked, so "the overlay may not say this" is
 * one statement in one place. Anything the schema still declares is a machine
 * fact and stays overridable, including the provider key names that make a
 * checkout its own cost center.
 */
function overlaySchema(): Record<string, unknown> {
  if (overlaySchemaCache === undefined) {
    const schema = deepCopy(loadSchema());
    const properties = record(schema["properties"]);
    for (const block of REPOSITORY_OWNED_BLOCKS) delete properties[block];
    overlaySchemaCache = schema;
  }
  return overlaySchemaCache;
}

function validateAgainst(
  data: unknown,
  schema: Record<string, unknown>,
  subject: string,
): void {
  const failure = schemaFailure(data, schema, subject);
  if (failure) throw new ConfigError(failure);
}

// --- Where the three layers live --------------------------------------------

/** Explicit path > `AI_ROUTER_CONFIG` env var > bundled default. */
function resolveConfigPath(path?: string): string {
  if (path !== undefined) return path;
  const override = process.env[CONFIG_ENV_VAR];
  if (override) return override;
  return BUNDLED_CONFIG_PATH;
}

interface ConfigSources {
  readonly base: string;
  readonly project: string | null;
  readonly overrides: string | null;
}

/**
 * The base config plus the two layers, the latter null when they do not
 * apply.
 *
 * An explicitly-named config -- by argument or by `AI_ROUTER_CONFIG` -- is the
 * whole answer and takes neither layer: a caller that named a file means that
 * file. The layers apply only over the bundled default, which is the one
 * config nobody on this machine chose. This is also why `AI_ROUTER_CONFIG` is
 * not the way a foreign repository declares itself -- pointing it at a
 * hand-written file forks the provider list and the model registry in order to
 * say how to run a test suite, which is the drift the layering exists to
 * prevent. `dabbler.yaml` is that way.
 */
function resolveConfigSources(path?: string, projectDir?: string): ConfigSources {
  const base = resolveConfigPath(path);
  if (path !== undefined || process.env[CONFIG_ENV_VAR]) {
    return { base, project: null, overrides: null };
  }
  return {
    base,
    project: projectConfigPath(projectDir),
    overrides: localOverridesPath(projectDir),
  };
}

// Resolved once per working directory: the overlay's location is a property
// of the project, and re-shelling out to git on every config load is not.
const projectRootCache = new Map<string, string | null>();

/**
 * The git toplevel of `projectDir`, or of the working directory when none is
 * named, or null outside a repository. The router already discovers the
 * project this way for evidence and gates; a second notion of "the project"
 * would be a second thing to disagree.
 */
export function projectRoot(projectDir?: string): string | null {
  const start = resolvePath(projectDir ?? process.cwd());
  if (!projectRootCache.has(start)) {
    projectRootCache.set(start, repoRootFor(start));
  }
  return projectRootCache.get(start) ?? null;
}

/** Discard the memoized project roots. The cache is per-process, and a test
 *  that moves the working directory between repositories needs it gone. */
export function resetProjectRootCache(): void {
  projectRootCache.clear();
}

function rootRelativeFile(
  projectDir: string | undefined,
  filename: string,
): string | null {
  const root = projectRoot(projectDir);
  if (root === null) return null;
  const candidate = join(root, filename);
  try {
    return statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

/** The machine-local overlay, when the project has one. */
export function localOverridesPath(projectDir?: string): string | null {
  return rootRelativeFile(projectDir, LOCAL_OVERRIDES_FILENAME);
}

/** The repository's own tracked config, when it has one. */
export function projectConfigPath(projectDir?: string): string | null {
  return rootRelativeFile(projectDir, PROJECT_CONFIG_FILENAME);
}

// --- The overlay's vocabulary ------------------------------------------------

/**
 * Refuse an overlay key the schema declares no vocabulary for.
 *
 * A dropped override is the failure this file exists to prevent: the operator
 * states a machine fact, the router ignores it, and the symptom surfaces
 * somewhere else entirely. Where the schema names its properties, that list is
 * the vocabulary and a key outside it is refused; where it declares an open
 * object -- a provider or model name, or a block the schema deliberately
 * leaves unstructured -- anything goes and recursion stops. The seat transport
 * block therefore has to be *declared* in the schema rather than left opaque,
 * because it is the block a seat-only machine most needs to override and a
 * typo there would be silent.
 */
function rejectUnknownOverlayKeys(
  overlay: Record<string, unknown>,
  schema: unknown,
  source: string,
  trail: readonly string[] = [],
): void {
  if (!isRecord(schema)) return;
  const properties = isRecord(schema["properties"])
    ? (schema["properties"] as Record<string, unknown>)
    : undefined;
  const additional = schema["additionalProperties"];

  for (const [key, value] of Object.entries(overlay)) {
    let subschema: unknown;
    if (properties !== undefined && key in properties) {
      subschema = properties[key];
    } else if (isRecord(additional)) {
      subschema = additional;
    } else if (properties !== undefined) {
      const dotted = [...trail, key].join(".");
      if (trail.length === 0 && REPOSITORY_OWNED_BLOCKS.has(key)) {
        throw new ConfigError(
          `${source} sets '${dotted}', which the repository owns. ` +
            `Declare it in ${PROJECT_CONFIG_FILENAME} at the ` +
            "repository root, where it is tracked. A suite command " +
            "or a packaging feed coming from a gitignored file " +
            "would be attributed by the run of record to a " +
            "repository that never declared it.",
        );
      }
      throw new ConfigError(
        `${source} sets unknown key '${dotted}': ` +
          "router-config.schema.json declares no such setting. An " +
          "override the router would silently drop is refused instead.",
      );
    } else {
      continue;
    }
    if (isRecord(value)) {
      rejectUnknownOverlayKeys(value, subschema, source, [...trail, key]);
    }
  }
}

// --- Loading ------------------------------------------------------------------

export function loadConfig(path?: string, projectDir?: string): RouterConfig {
  const sources = resolveConfigSources(path, projectDir);
  if (!existsSync(sources.base)) {
    throw new ConfigNotFoundError(
      `Router config not found: ${sources.base}. Create it from the ` +
        "bundled ai_router/router-config.yaml.",
    );
  }

  let config = record(readYaml(sources.base));

  // Tracked first, machine-local second: a machine may disagree with the
  // distribution, and never with the repository.
  if (sources.project !== null) {
    config = applyProjectConfig(config, sources.project);
  }
  if (sources.overrides !== null) {
    config = applyLocalOverrides(config, sources.overrides);
  }

  validateAgainst(config, loadSchema(), "router-config.yaml");

  for (const provider of Object.values(record(config["providers"]))) {
    if (isRecord(provider) && !("enabled" in provider)) provider["enabled"] = true;
  }

  const providerNames = Object.keys(record(config["providers"]));
  for (const [modelName, modelConfig] of Object.entries(
    record(config["models"]),
  )) {
    const provider = record(modelConfig)["provider"];
    if (!providerNames.includes(String(provider))) {
      throw new ConfigError(
        `Model '${modelName}' references unknown provider ` +
          `'${String(provider)}'. Available: ${renderList([...providerNames].sort())}`,
      );
    }
  }

  validateCopilotBlock(config);
  applyRunCoreDefaults(config);
  resolveCritiqueBlock(config);
  loadPromptTemplates(config, dirname(resolvePath(sources.base)));

  config["_config_path"] = resolvePath(sources.base);
  config["_project_config_path"] =
    sources.project === null ? null : resolvePath(sources.project);
  config["_local_overrides_path"] =
    sources.overrides === null ? null : resolvePath(sources.overrides);
  return config;
}

function renderList(items: readonly string[]): string {
  return `[${items.map((item) => `'${item}'`).join(", ")}]`;
}

/**
 * Resolve the critique pipeline's authority, refusing a mode no code honours.
 *
 * `enforce` is declared in the schema so the vocabulary lives in one place,
 * and refused here because nothing yet reads critique artifacts to decide
 * anything. Downgrading it silently to `shadow` would leave an operator
 * believing their work is being gated when it is not, which is the failure
 * this refusal exists to prevent.
 */
function resolveCritiqueBlock(config: RouterConfig): void {
  const block = record(config["critique"]);
  const mode = "pipeline" in block ? block["pipeline"] : CRITIQUE_PIPELINE_DEFAULT;
  if (mode === CRITIQUE_PIPELINE_ENFORCE) {
    throw new ConfigError(
      `critique.pipeline: '${CRITIQUE_PIPELINE_ENFORCE}' is refused at ` +
        `load. Enforcement arrives with set ${CRITIQUE_ENFORCE_SET}; ` +
        "until then the accepted values are " +
        `'${CRITIQUE_PIPELINE_DEFAULT}' (the default, which writes ` +
        `nothing) and '${CRITIQUE_PIPELINE_SHADOW}', which records ` +
        "critique artifacts without letting them decide anything.",
    );
  }
  config["critique"] = { ...block, pipeline: mode };
}

/**
 * Merge the repository's own tracked config over the packaged default.
 *
 * The file is validated against its own schema rather than against the
 * router's, because the two declare different things: this one is a short,
 * closed list of what a repository owns, and a key outside that list is a
 * repository trying to fork a distribution fact. `schema_version` is stripped
 * after validation -- it describes the file, not the router.
 */
function applyProjectConfig(
  config: Record<string, unknown>,
  projectPath: string,
): Record<string, unknown> {
  const declared = readYaml(projectPath);
  if (declared === null) {
    throw new ConfigError(
      `${projectPath} is empty. A repository with nothing to declare ` +
        `has no ${PROJECT_CONFIG_FILENAME}; an empty one cannot state ` +
        "its schema_version and so cannot be read at all.",
    );
  }
  if (!isRecord(declared)) {
    throw new ConfigError(
      `${projectPath} must be a mapping of config blocks, got ` +
        typeName(declared),
    );
  }
  validateAgainst(declared, projectSchema(), projectPath);
  const blocks: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(declared)) {
    if (key !== "schema_version") blocks[key] = value;
  }
  return deepMerge(config, blocks);
}

/**
 * Deep-merge the machine-local overlay on last.
 *
 * The overlay is partial -- only the keys it changes -- and the merged result
 * goes through the same schema and semantic checks as any config, so an
 * overlay cannot produce a config the router would have refused. It is refused
 * the blocks the repository owns before anything is merged: it wins over the
 * distribution, never over `dabbler.yaml`.
 */
function applyLocalOverrides(
  config: Record<string, unknown>,
  overridesPath: string,
): Record<string, unknown> {
  const overrides = readYaml(overridesPath);
  if (overrides === null) return config;
  if (!isRecord(overrides)) {
    throw new ConfigError(
      `${overridesPath} must be a mapping of config keys to override, got ` +
        typeName(overrides),
    );
  }
  rejectUnknownOverlayKeys(overrides, overlaySchema(), overridesPath);
  return deepMerge(config, overrides);
}

export const RUN_CORE_DEFAULTS: Record<string, Record<string, unknown>> = {
  run_policy: {
    default: "fast",
    verification_rounds: 3,
    diff_limit_lines: 1500,
    check_timeout_seconds: 1800,
    budgets: {
      // Null, not a figure: dollars are not computed on either transport,
      // so a dollar ceiling could only ever compare against zero and would
      // read as an assurance nothing enforces. The knob survives for a
      // deployment that reintroduces pricing; the dispatch ceiling below is
      // what actually bounds spend.
      model_usd: null,
      model_dispatches: 3,
      elapsed_minutes: 120,
    },
  },
  // A repository fact, so it is declared in dabbler.yaml and defaulted here
  // rather than sitting in run_policy where the machine-local overlay could
  // have quietly emptied it.
  paths: { sensitive_paths: [] },
  git: {
    push_on_finish: false,
    worktree_per_run: false,
    remote: "origin",
  },
  explorer: { stale_after_minutes: 5 },
  worktree: { root: null, init: [] },
};

/**
 * Fill the run-core blocks so every reader sees the same shape.
 *
 * An existing repository needs no new configuration for `fast`: an absent
 * block is the documented default, not an unconfigured feature. The schema has
 * already refused unknown keys and out-of-range limits, so the only rule left
 * here is the one a range check cannot express -- a null dollar ceiling
 * disables the dollar ceiling and nothing else.
 */
function applyRunCoreDefaults(config: RouterConfig): void {
  for (const [block, defaults] of Object.entries(RUN_CORE_DEFAULTS)) {
    config[block] = deepMerge(deepCopy(defaults), record(config[block]));
  }
  const budgets = record(record(config["run_policy"])["budgets"]);
  if (budgets["model_dispatches"] === null || budgets["model_dispatches"] === undefined) {
    throw new ConfigError(
      "run_policy.budgets.model_dispatches has no 'unlimited' value: " +
        "a dispatch ceiling is what bounds framework model calls, " +
        "because no transport reports a dollar figure to cap.",
    );
  }
}

/**
 * When the copilot-cli transport is configured, its block must be complete --
 * selecting the seat transport and silently falling back to a keyless API path
 * is a worse failure than refusing to load.
 */
function validateCopilotBlock(config: RouterConfig): void {
  const transports = record(config["transports"]);
  if (!(TRANSPORT_COPILOT_CLI in transports)) return;
  const block = transports[TRANSPORT_COPILOT_CLI];
  if (block === null || block === undefined) return;
  if (!isRecord(block)) {
    throw new ConfigError("transports.copilot-cli must be a mapping");
  }
  const missing = COPILOT_CLI_REQUIRED_KEYS.filter((key) => !(key in block)).sort();
  if (missing.length > 0) {
    throw new ConfigError(
      `transports.copilot-cli is missing required key(s): ${renderList(missing)}`,
    );
  }
  try {
    validateTransportTimeouts(block["timeouts"]);
  } catch (error) {
    throw new ConfigError(error instanceof Error ? error.message : String(error));
  }
}

// --- Round caps ---------------------------------------------------------------

/**
 * A loop bound from `verification.settings`, or the shipped default.
 *
 * A missing, unparseable or non-positive setting falls back to the default
 * rather than to no cap -- a bound that a malformed config can switch off is
 * not a bound.
 */
function roundCap(config: RouterConfig, key: string, fallback: number): number {
  const settings = record(record(config["verification"])["settings"]);
  const raw = key in settings ? settings[key] : fallback;
  const cap = toInteger(raw);
  if (cap === null) return fallback;
  return cap >= 1 ? cap : fallback;
}

/** Python's `int(x)`: exact for numbers and numeric strings, else nothing. */
function toInteger(value: unknown): number | null {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^[+-]?\d+$/.test(trimmed)) return null;
    return Number.parseInt(trimmed, 10);
  }
  return null;
}

/**
 * How many review rounds any loop may open before it must terminate.
 *
 * One resolver for every loop that calls a vendor per round, because a cap
 * read through two code paths is a cap two loops eventually disagree about.
 * The closed severity vocabulary is the primary control and this is the
 * backstop: an unattended loop that never converges still stops calling
 * vendors.
 */
export function verificationRoundCap(config: RouterConfig): number {
  return roundCap(config, "max_rounds", DEFAULT_VERIFICATION_ROUNDS);
}

/**
 * How many times the framework runs the authored tests before the loop must
 * terminate.
 *
 * Separate from the review bound because the two loops meter different things
 * -- a review round buys a vendor's opinion and a test round runs a suite --
 * and one number serving both would tune each against the other's cost.
 */
export function runRoundCap(config: RouterConfig): number {
  return roundCap(config, "max_test_rounds", DEFAULT_TEST_ROUNDS);
}

// --- Transport and generation params -----------------------------------------

/**
 * The effective transport for routine dispatch.
 *
 * Precedence: CLI flag > `DABBLER_TRANSPORT` env var (the operator's standing
 * preference) > `transport.profile` in the loaded config > default `api`. The
 * config value may come from the bundled `router-config.yaml` or from a
 * project-local `local-overrides.yaml` merged over it -- the overlay is a
 * config source, not a precedence tier, so nothing above it changes its
 * answer. An unknown value fails loud at whichever level supplied it. This
 * selects the transport for routine dispatch; verifier selection may still use
 * the other transport when provider independence requires it.
 */
export function resolveTransport(
  config: RouterConfig,
  cliFlag?: string | null,
): string {
  const candidates: ReadonlyArray<readonly [string, unknown]> = [
    ["--transport flag", cliFlag ?? null],
    [`${TRANSPORT_ENV_VAR} env var`, process.env[TRANSPORT_ENV_VAR] || null],
    ["transport.profile", record(config["transport"])["profile"] ?? null],
  ];
  for (const [source, value] of candidates) {
    if (value === null || value === undefined) continue;
    const normalized = String(value).trim().toLowerCase();
    if (!(VALID_TRANSPORTS as readonly string[]).includes(normalized)) {
      throw new ConfigError(
        `${source} must be one of ${renderList(VALID_TRANSPORTS)}, ` +
          `got '${String(value)}'`,
      );
    }
    return normalized;
  }
  return TRANSPORT_API;
}

/**
 * Effective generation_params for a (model, task_type) pair: model-level
 * defaults overlaid by `task_type_params[task_type][model_name]`.
 */
export function resolveGenerationParams(
  modelName: string,
  taskType: string,
  config: RouterConfig,
): Record<string, unknown> {
  const modelConfig = record(record(config["models"])[modelName]);
  const params = deepCopy(record(modelConfig["generation_params"]));
  const taskBlock = record(record(config["task_type_params"])[taskType]);
  const overrides = record(taskBlock[modelName]);
  return deepMerge(params, overrides);
}

// --- Prompt templates ---------------------------------------------------------

const DEFAULT_SYSTEM_PROMPT =
  "You are an expert software engineer. Be direct and precise.";

/**
 * Resolve prompt templates relative to the config file's directory.
 *
 * System prompts: one consolidated file (`system_prompt_file` per model) with
 * an H2 section per provider slug. Task templates:
 * `prompt-templates/task-prompts.md` with an H1 section per task type (H1
 * because template bodies contain their own H2 headers). Verification
 * template: `verification.settings.prompt_template_file`.
 */
function loadPromptTemplates(config: RouterConfig, configDir: string): void {
  const sectionsCache = new Map<string, Record<string, string>>();

  const resolveRelative = (relative: string): string | null => {
    const candidate = join(configDir, relative);
    return existsSync(candidate) ? candidate : null;
  };

  const sectionsOf = (path: string, level: number): Record<string, string> => {
    const key = resolvePath(path);
    let sections = sectionsCache.get(key);
    if (!sections) {
      sections = splitSections(readText(path), level);
      sectionsCache.set(key, sections);
    }
    return sections;
  };

  for (const modelConfig of Object.values(record(config["models"]))) {
    if (!isRecord(modelConfig)) continue;
    const promptFile = modelConfig["system_prompt_file"];
    if (!promptFile || typeof promptFile !== "string") continue;
    const fullPath = resolveRelative(promptFile);
    if (fullPath === null) {
      modelConfig["_system_prompt"] = DEFAULT_SYSTEM_PROMPT;
      continue;
    }
    const sections = sectionsOf(fullPath, 2);
    if (Object.keys(sections).length === 0) {
      modelConfig["_system_prompt"] = readText(fullPath).trim();
      continue;
    }
    const providerSlug = String(modelConfig["provider"] ?? "")
      .trim()
      .toLowerCase();
    modelConfig["_system_prompt"] = sections[providerSlug] ?? DEFAULT_SYSTEM_PROMPT;
  }

  config["_task_templates"] = {};
  const taskFile = join(configDir, "prompt-templates", "task-prompts.md");
  if (existsSync(taskFile)) {
    config["_task_templates"] = sectionsOf(taskFile, 1);
  }

  const templateFile = record(record(config["verification"])["settings"])[
    "prompt_template_file"
  ];
  config["_verification_template"] = "";
  if (templateFile && typeof templateFile === "string") {
    const path = resolveRelative(templateFile);
    if (path !== null) {
      config["_verification_template"] = readText(path).trim();
    }
  }
}

/**
 * Split markdown by `#`-headers of exactly the given level, mapping slugified
 * header text to section body. Content before the first header is preamble and
 * discarded; deeper headers stay inside their section.
 */
export function splitSections(
  text: string,
  headerLevel: number,
): Record<string, string> {
  const prefix = "#".repeat(headerLevel) + " ";
  const sections: Record<string, string> = {};
  let currentSlug: string | null = null;
  let currentLines: string[] = [];

  // Python splits on any line boundary; the callers hand this universal
  // newlines already, and a caller that does not still gets Python's answer.
  for (const line of text.split(/\r\n|[\n\r]/)) {
    if (line.startsWith(prefix)) {
      if (currentSlug !== null) {
        sections[currentSlug] = currentLines.join("\n").trim();
      }
      const headerText = line.slice(prefix.length).trim();
      currentSlug = headerText.toLowerCase().replace(/ /g, "-").replace(/_/g, "-");
      currentLines = [];
    } else if (currentSlug !== null) {
      currentLines.push(line);
    }
  }
  if (currentSlug !== null) {
    sections[currentSlug] = currentLines.join("\n").trim();
  }
  return sections;
}
