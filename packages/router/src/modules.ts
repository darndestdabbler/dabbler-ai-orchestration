// Module manifest: the one declaration of what a module is.
//
// The manifest is a YAML mapping with a `modules` list; each entry is
// `{slug, title?, planPath?, codeRoots?, touches?, specSections?,
// contextAssets?}`. `codeRoots` bounds the module on disk, `specSections`
// maps reference spec sections to it, and `contextAssets` names its
// schemas/config/migrations. The extension's reader takes the keys it knows
// and ignores the rest, so it keeps rendering entries carrying newer keys.
//
// An unknown key is rejected rather than ignored: a misspelled `codeRoot`
// that is silently dropped leaves the module bounded by something other than
// what was written, which is the failure this manifest exists to prevent.
//
// Create-only by design: rename, delete, and reorganization stay manual
// edits to the file. `list` and `retire` are named by no command line on
// either side and are not invented here.

import { mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { writeErr, writeOut } from "./cli/output.ts";
import { writeTextLf } from "./journal.ts";
import { dumps, pythonRepr } from "./pythonJson.ts";
import { readText } from "./textfile.ts";

export const EXIT_OK = 0;
export const EXIT_REFUSED = 1;
export const EXIT_USAGE = 2;

export const MANIFEST_RELPATH = join("docs", "modules.yaml");

export const KNOWN_ENTRY_KEYS: readonly string[] = [
  "slug",
  "title",
  "planPath",
  "codeRoots",
  "touches",
  "specSections",
  "contextAssets",
];

const LIST_KEYS = ["codeRoots", "touches", "specSections", "contextAssets"] as const;

/** One validated manifest entry. */
export interface ModuleEntry {
  readonly slug: string;
  readonly title: string;
  readonly planPath: string | null;
  readonly codeRoots: readonly string[];
  readonly touches: readonly string[];
  readonly specSections: readonly string[];
  readonly contextAssets: readonly string[];
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

/**
 * Validated entries in file order.
 *
 * Rejects an unknown key, a non-mapping entry, a missing slug, a duplicate
 * slug, and a mistyped list -- never silently drops one.
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
    entries.push({
      slug,
      title: (typeof title === "string" ? title : "").trim() || slug,
      planPath: (typeof planPath === "string" ? planPath : "").trim() || null,
      codeRoots: lists.codeRoots,
      touches: lists.touches,
      specSections: lists.specSections,
      contextAssets: lists.contextAssets,
    });
  }
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
  for (const [key, values] of [
    ["codeRoots", options.codeRoots],
    ["specSections", options.specSections],
    ["contextAssets", options.contextAssets],
  ] as const) {
    if (values && values.length > 0) entry[key] = [...values];
  }
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
