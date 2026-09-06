// Module manifest: the one declaration of what a module is.
//
// The manifest is a YAML mapping with a `modules` list; each entry is
// `{slug, title?, planPath?, codeRoots?, touches?, specSections?,
// contextAssets?, kind?, dependsOn?, package?, contract?}`. `codeRoots`
// bounds the module on disk, `specSections` maps reference spec sections to
// it, and `contextAssets` names its schemas/config/migrations. `kind`,
// `dependsOn`, `package` and `contract` are the module vocabulary: what a
// sibling consumes, in which direction, and what the seam is. Who depends
// on a module is DERIVED from `dependsOn` and never written -- two
// directions kept by hand disagree eventually, and the disagreement is
// silent. The extension's reader takes the keys it knows and ignores the
// rest, so it keeps rendering entries carrying newer keys.
//
// An unknown key is rejected rather than ignored: a misspelled `codeRoot`
// that is silently dropped leaves the module bounded by something other than
// what was written, which is the failure this manifest exists to prevent.
//
// ONE MODULE IS THE DEFAULT SHAPE. An absent manifest, or one with a single
// entry, is a single-module solution whose repository IS the module: no
// focused clone, no packages folder, no contracts, the run of record the
// module's own suites. `solutionShape` is the one function that says which
// shape a repository is in, and every multi-module code path asks it --
// nothing switches on until a second entry is declared.
//
// Create-only by design: rename, delete, and reorganization stay manual
// edits to the file. `retire` is named by no command line on either side
// and is not invented here.

import { mkdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { writeErr, writeOut } from "./output.ts";
import { writeTextLf } from "./journal.ts";
import { dumps, pythonRepr } from "./pythonJson.ts";
import { readText } from "./textfile.ts";

export const EXIT_OK = 0;
export const EXIT_REFUSED = 1;
export const EXIT_USAGE = 2;

export const MANIFEST_RELPATH = join("docs", "modules.yaml");

/**
 * What a module is to the rest of the solution. `shared-types` sits at the
 * bottom of the graph and takes the slowest cadence; `application` composes
 * the libraries and is what a bundle ships.
 */
export const KINDS = ["shared-types", "library", "application"] as const;
export type ModuleKind = (typeof KINDS)[number];

/**
 * Where a module's contract lives. `designed`: an abstractions package and
 * a contract-test package beside the implementation. `package`: the public
 * package is its own abstraction (a value library, shared types).
 * `generated`: the surface is generated from the built assembly and marked
 * as such -- shape, not behaviour.
 */
export const CONTRACT_MODES = ["designed", "package", "generated"] as const;
export type ContractMode = (typeof CONTRACT_MODES)[number];

export const KNOWN_ENTRY_KEYS: readonly string[] = [
  "slug",
  "title",
  "planPath",
  "codeRoots",
  "touches",
  "specSections",
  "contextAssets",
  "kind",
  "dependsOn",
  "package",
  "contract",
];

const LIST_KEYS = ["codeRoots", "touches", "specSections", "contextAssets", "dependsOn"] as const;

/** One validated manifest entry. */
export interface ModuleEntry {
  readonly slug: string;
  readonly title: string;
  readonly planPath: string | null;
  readonly codeRoots: readonly string[];
  readonly touches: readonly string[];
  readonly specSections: readonly string[];
  readonly contextAssets: readonly string[];
  readonly kind: ModuleKind;
  /** Slugs this module consumes, in the order written. Validated to exist. */
  readonly dependsOn: readonly string[];
  /** The artifact id a sibling consumes: a NuGet id, or Maven's `groupId:artifactId`. */
  readonly package: string | null;
  readonly contract: ContractMode | null;
}

/** A manifest that refuses rather than being silently rewritten. */
export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function manifestPath(workspaceRoot: string): string {
  return join(workspaceRoot, MANIFEST_RELPATH);
}

/**
 * The parsed manifest mapping.
 *
 * A missing file is the designed empty state (`{modules: []}`); a bare
 * `modules:` (YAML null) is a valid empty list. Unparseable YAML, a
 * non-mapping document, or a `modules` value that is neither null nor a list
 * throws `ManifestError` -- a config error must refuse loud, never be
 * silently rewritten.
 */
export function loadManifest(path: string): Record<string, unknown> {
  let text: string;
  try {
    if (!statSync(path).isFile()) return { modules: [] };
    text = readText(path);
  } catch {
    return { modules: [] };
  }
  let doc: unknown;
  try {
    doc = parseYaml(text, { version: "1.1" });
  } catch (error) {
    throw new ManifestError(
      `${path} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (doc === null || doc === undefined) doc = {};
  if (!isRecord(doc)) {
    throw new ManifestError(`${path} must be a YAML mapping with a 'modules' list`);
  }
  const modules = doc["modules"];
  if (modules === null || modules === undefined) {
    doc["modules"] = [];
  } else if (!Array.isArray(modules)) {
    throw new ManifestError(`'modules' in ${path} must be a list`);
  }
  return doc;
}

function stringList(value: unknown, where: string, key: string): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new ManifestError(`${where}: '${key}' must be a list of strings`);
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) {
      throw new ManifestError(`${where}: '${key}' must contain only non-empty strings`);
    }
    out.push(item.trim());
  }
  return out;
}

function optionalString(value: unknown, where: string, key: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new ManifestError(`${where}: '${key}' must be a string`);
  return value.trim() || null;
}

function oneOf<T extends string>(
  value: unknown,
  choices: readonly T[],
  where: string,
  key: string,
): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !(choices as readonly string[]).includes(value.trim())) {
    throw new ManifestError(`${where}: '${key}' must be one of ${choices.join(", ")}`);
  }
  return value.trim() as T;
}

/**
 * The dependency graph must be closed and acyclic. A dependency on a slug
 * the manifest does not declare is refused by name, and a cycle is refused
 * with the cycle written out -- a graph that cannot be ordered cannot be
 * built, and the reader should not have to find the loop by hand.
 */
function checkGraph(entries: readonly ModuleEntry[], source: string): void {
  const slugs = new Set(entries.map((entry) => entry.slug));
  for (const entry of entries) {
    for (const dependency of entry.dependsOn) {
      if (dependency === entry.slug) {
        throw new ManifestError(
          `${source}: module ${pythonRepr(entry.slug)} depends on itself`,
        );
      }
      if (!slugs.has(dependency)) {
        throw new ManifestError(
          `${source}: module ${pythonRepr(entry.slug)} depends on ${pythonRepr(dependency)}, ` +
            "which the manifest does not declare",
        );
      }
    }
  }
  const byslug = new Map(entries.map((entry) => [entry.slug, entry] as const));
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (slug: string): void => {
    const seen = state.get(slug);
    if (seen === "done") return;
    if (seen === "visiting") {
      const cycle = [...stack.slice(stack.indexOf(slug)), slug];
      throw new ManifestError(
        `${source}: modules depend on each other in a cycle: ${cycle.join(" -> ")}`,
      );
    }
    state.set(slug, "visiting");
    stack.push(slug);
    for (const dependency of byslug.get(slug)?.dependsOn ?? []) visit(dependency);
    stack.pop();
    state.set(slug, "done");
  };
  for (const entry of entries) visit(entry.slug);
}

/**
 * Validated entries in file order.
 *
 * Rejects an unknown key, a non-mapping entry, a missing slug, a duplicate
 * slug, a mistyped list, a dependency on an undeclared slug and a cycle --
 * never silently drops one.
 */
export function parseEntries(
  doc: Record<string, unknown>,
  source = "docs/modules.yaml",
): ModuleEntry[] {
  const entries: ModuleEntry[] = [];
  const seen = new Set<string>();
  const raws = Array.isArray(doc["modules"]) ? doc["modules"] : [];
  for (const [index, raw] of raws.entries()) {
    const where = `${source}: modules[${index}]`;
    if (!isRecord(raw)) throw new ManifestError(`${where} must be a mapping`);
    const unknown = Object.keys(raw)
      .filter((key) => !KNOWN_ENTRY_KEYS.includes(key))
      .sort();
    if (unknown.length > 0) {
      throw new ManifestError(
        `${where} has unknown key(s) ${unknown.join(", ")}. ` +
          `Known keys: ${KNOWN_ENTRY_KEYS.join(", ")}.`,
      );
    }
    const declared = raw["slug"];
    if (typeof declared !== "string" || !declared.trim()) {
      throw new ManifestError(`${where} needs a non-empty string 'slug'`);
    }
    const slug = declared.trim();
    if (seen.has(slug)) {
      throw new ManifestError(`${source}: duplicate slug ${pythonRepr(slug)}`);
    }
    seen.add(slug);
    const title = raw["title"];
    if (title !== null && title !== undefined && typeof title !== "string") {
      throw new ManifestError(`${where}: 'title' must be a string`);
    }
    const planPath = raw["planPath"];
    if (planPath !== null && planPath !== undefined && typeof planPath !== "string") {
      throw new ManifestError(`${where}: 'planPath' must be a string`);
    }
    const lists = Object.fromEntries(
      LIST_KEYS.map((key) => [key, stringList(raw[key], where, key)]),
    ) as Record<(typeof LIST_KEYS)[number], string[]>;
    const pkg = optionalString(raw["package"], where, "package");
    const contract = oneOf(raw["contract"], CONTRACT_MODES, where, "contract");
    entries.push({
      slug,
      title: (typeof title === "string" ? title : "").trim() || slug,
      planPath: (typeof planPath === "string" ? planPath : "").trim() || null,
      codeRoots: lists.codeRoots,
      touches: lists.touches,
      specSections: lists.specSections,
      contextAssets: lists.contextAssets,
      kind: oneOf(raw["kind"], KINDS, where, "kind") ?? "library",
      dependsOn: lists.dependsOn,
      package: pkg,
      // A declared package is its own abstraction until somebody designs
      // one; a module with no package has no seam to name a contract for.
      contract: contract ?? (pkg === null ? null : "package"),
    });
  }
  checkGraph(entries, source);
  return entries;
}

/**
 * Validated entries for a workspace. An absent manifest is the designed
 * empty state; an invalid one throws.
 */
export function loadEntries(workspaceRoot: string): ModuleEntry[] {
  const path = manifestPath(workspaceRoot);
  return parseEntries(loadManifest(path), path);
}

/**
 * The entry for `slug`, or null when the manifest does not declare it -- an
 * unresolvable slug is the caller's cue to fall back, never to guess at what
 * the module covers.
 */
export function findEntry(workspaceRoot: string, slug: string): ModuleEntry | null {
  if (!slug) return null;
  const wanted = slug.trim();
  for (const entry of loadEntries(workspaceRoot)) {
    if (entry.slug === wanted) return entry;
  }
  return null;
}

// --- The graph, derived ----------------------------------------------------

/**
 * Entries in dependency order: every module after everything it depends
 * on, file order breaking ties. Stable, so two readers list the same order.
 */
export function dependencyOrder(entries: readonly ModuleEntry[]): ModuleEntry[] {
  const remaining = [...entries];
  const placed = new Set<string>();
  const out: ModuleEntry[] = [];
  while (remaining.length > 0) {
    const index = remaining.findIndex((entry) =>
      entry.dependsOn.every((dependency) => placed.has(dependency)),
    );
    // `parseEntries` refused every cycle, so an entry is always ready; the
    // guard only keeps a hand-built list from spinning.
    const next = remaining.splice(index === -1 ? 0 : index, 1)[0]!;
    placed.add(next.slug);
    out.push(next);
  }
  return out;
}

/**
 * Every module that consumes `slug`, directly or through another consumer,
 * in dependency order. Derived on every call and declared nowhere.
 */
export function consumersOf(entries: readonly ModuleEntry[], slug: string): string[] {
  const reached = new Set<string>();
  let frontier = [slug];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const entry of entries) {
      if (reached.has(entry.slug) || entry.slug === slug) continue;
      if (entry.dependsOn.some((dependency) => frontier.includes(dependency))) {
        reached.add(entry.slug);
        next.push(entry.slug);
      }
    }
    frontier = next;
  }
  return dependencyOrder(entries)
    .map((entry) => entry.slug)
    .filter((candidate) => reached.has(candidate));
}

/** Every module `slug` depends on, directly or transitively, in dependency order. */
export function dependenciesOf(entries: readonly ModuleEntry[], slug: string): string[] {
  const bySlug = new Map(entries.map((entry) => [entry.slug, entry] as const));
  const reached = new Set<string>();
  const visit = (current: string): void => {
    for (const dependency of bySlug.get(current)?.dependsOn ?? []) {
      if (reached.has(dependency)) continue;
      reached.add(dependency);
      visit(dependency);
    }
  };
  visit(slug);
  return dependencyOrder(entries)
    .map((entry) => entry.slug)
    .filter((candidate) => reached.has(candidate));
}

// --- The shape ---------------------------------------------------------------

/**
 * Which shape a repository is in, decided once.
 *
 * `multi` is true only when the manifest declares more than one module.
 * `implicit` is true when no manifest declares anything and the repository
 * is taken to be the one module -- the shape of every repository that
 * predates the manifest, and of csv-model.
 */
export interface SolutionShape {
  readonly multi: boolean;
  readonly implicit: boolean;
  /** In dependency order. Exactly one when `multi` is false. */
  readonly modules: readonly ModuleEntry[];
}

/** The one module a repository with no manifest is. */
export function implicitModule(workspaceRoot: string): ModuleEntry {
  const name = basename(resolve(workspaceRoot)) || "solution";
  return {
    slug: name,
    title: name,
    planPath: null,
    codeRoots: ["."],
    touches: [],
    specSections: [],
    contextAssets: [],
    kind: "application",
    dependsOn: [],
    package: null,
    contract: null,
  };
}

/**
 * The shape of the solution at `workspaceRoot`. An invalid manifest throws
 * `ManifestError`, as every reader of it does.
 */
export function solutionShape(workspaceRoot: string): SolutionShape {
  const entries = loadEntries(workspaceRoot);
  if (entries.length === 0) {
    return { multi: false, implicit: true, modules: [implicitModule(workspaceRoot)] };
  }
  return { multi: entries.length > 1, implicit: false, modules: dependencyOrder(entries) };
}

/**
 * `yaml.safe_dump(doc, sort_keys=False, allow_unicode=True,
 * default_flow_style=False)`, as closely as a different emitter reaches it.
 *
 * The three options that matter: sequences sit at their key's indent (PyYAML
 * does not indent them), a scalar needing quotes gets single ones, and the
 * fold width is PyYAML's -- which allows the break at column 81 rather than
 * before 80. `version: "1.1"` is what makes `yes`, `no` and `on` quote
 * themselves, as PyYAML's 1.1 resolver does.
 *
 * Two inputs still emit differently and are recorded rather than papered
 * over: a scalar of exactly `y` or `n`, which this emitter quotes and
 * PyYAML does not, and a title carrying a newline, which this emitter writes
 * as a `|-` block and PyYAML writes single-quoted and folded. Both are legal
 * YAML for the same value; neither appears in a kebab-case slug or an
 * ordinary display name.
 */
function dumpManifest(doc: unknown): string {
  return stringifyYaml(doc, {
    version: "1.1",
    indentSeq: false,
    singleQuote: true,
    lineWidth: 81,
  });
}

export interface CreateOptions {
  readonly planPath?: string | null;
  readonly codeRoots?: readonly string[] | null;
  readonly specSections?: readonly string[] | null;
  readonly contextAssets?: readonly string[] | null;
  readonly kind?: string | null;
  readonly dependsOn?: readonly string[] | null;
  readonly package?: string | null;
  readonly contract?: string | null;
}

/** Append one entry, refusing anything that would make the manifest invalid. */
export function create(
  workspaceRoot: string,
  slug: string,
  title: string,
  options: CreateOptions = {},
): number {
  const path = manifestPath(workspaceRoot);
  let doc: Record<string, unknown>;
  try {
    doc = loadManifest(path);
    parseEntries(doc, path);
  } catch (error) {
    if (!(error instanceof ManifestError)) throw error;
    writeErr(`modules create: refused -- ${error.message}\n`);
    return EXIT_REFUSED;
  }
  const modules = doc["modules"] as unknown[];
  const existing = new Set(
    modules.filter(isRecord).map((entry) => entry["slug"]),
  );
  if (existing.has(slug)) {
    writeErr(
      `modules create: refused -- slug ${pythonRepr(slug)} already exists in ${path}\n`,
    );
    return EXIT_REFUSED;
  }
  const entry: Record<string, unknown> = { slug, title };
  if (options.planPath) entry["planPath"] = options.planPath;
  if (options.kind) entry["kind"] = options.kind;
  for (const [key, values] of [
    ["codeRoots", options.codeRoots],
    ["dependsOn", options.dependsOn],
    ["specSections", options.specSections],
    ["contextAssets", options.contextAssets],
  ] as const) {
    if (values && values.length > 0) entry[key] = [...values];
  }
  if (options.package) entry["package"] = options.package;
  if (options.contract) entry["contract"] = options.contract;
  modules.push(entry);
  try {
    parseEntries(doc, path);
  } catch (error) {
    if (!(error instanceof ManifestError)) throw error;
    writeErr(`modules create: refused -- ${error.message}\n`);
    return EXIT_REFUSED;
  }
  mkdirSync(dirname(path), { recursive: true });
  // `newline=""` on the Python side: the manifest carries LF on every
  // platform, so the file a repository commits does not depend on which
  // router wrote it.
  writeTextLf(path, dumpManifest(doc));
  writeOut(dumps(entry) + "\n");
  return EXIT_OK;
}

/** What `dabbler modules show` prints: the shape, with `usedBy` derived per module. */
export function shown(workspaceRoot: string): Record<string, unknown> {
  const shape = solutionShape(workspaceRoot);
  return {
    multi: shape.multi,
    implicit: shape.implicit,
    modules: shape.modules.map((entry) => ({
      slug: entry.slug,
      title: entry.title,
      kind: entry.kind,
      package: entry.package,
      contract: entry.contract,
      codeRoots: [...entry.codeRoots],
      dependsOn: [...entry.dependsOn],
      usedBy: consumersOf(shape.modules, entry.slug),
    })),
  };
}

/** Print the manifest as the framework reads it, refusing an invalid one by name. */
export function show(workspaceRoot: string): number {
  let doc: Record<string, unknown>;
  try {
    doc = shown(workspaceRoot);
  } catch (error) {
    if (!(error instanceof ManifestError)) throw error;
    writeErr(`modules show: refused -- ${error.message}\n`);
    return EXIT_REFUSED;
  }
  writeOut(dumps(doc, { indent: 2 }) + "\n");
  return EXIT_OK;
}
