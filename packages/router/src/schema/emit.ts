// Where the generator meets the filesystem: which schemas are read, where
// the modules land, and what "stale" means.
//
// The staleness control and the writer share this code on purpose. Two
// readings of "what the generator would produce" is the drift the control
// exists to catch, so there is one.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  generateIndex,
  generateModule,
  moduleName,
  type SchemaSource,
} from "./generate.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

/** `packages/router` — this file is two directories below it. */
export const PACKAGE_ROOT = join(HERE, "..", "..");
export const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");
export const SCHEMA_DIR = join(REPO_ROOT, "ai_router", "schemas");
export const GENERATED_DIR = join(PACKAGE_ROOT, "src", "generated");

const SCHEMA_SUFFIX = ".schema.json";

/** Every schema, in file-name order, so two runs agree. */
export function readSchemaSources(directory = SCHEMA_DIR): SchemaSource[] {
  const names = readdirSync(directory)
    .filter((name) => name.endsWith(SCHEMA_SUFFIX))
    .sort();
  return names.map((fileName) => ({
    fileName,
    schema: JSON.parse(readFileSync(join(directory, fileName), "utf8")),
  }));
}

/** `{ relative path -> file text }` for the whole generated directory. */
export function renderGenerated(sources: SchemaSource[]): Map<string, string> {
  const files = new Map<string, string>();
  for (const source of sources) {
    files.set(`${moduleName(source.fileName)}.ts`, generateModule(source));
  }
  files.set("index.ts", generateIndex(sources));
  return files;
}

/** What is on disk now, so a file the generator no longer emits is drift too. */
export function readGenerated(directory = GENERATED_DIR): Map<string, string> {
  const files = new Map<string, string>();
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch {
    return files;
  }
  for (const name of names.sort()) {
    if (!name.endsWith(".ts")) continue;
    files.set(name, readFileSync(join(directory, name), "utf8"));
  }
  return files;
}

export interface StaleFile {
  name: string;
  state: "changed" | "missing" | "unexpected";
}

/** Which generated files no longer match the schemas. Empty means fresh. */
export function staleFiles(
  expected: Map<string, string>,
  actual: Map<string, string>,
): StaleFile[] {
  const stale: StaleFile[] = [];
  for (const [name, text] of expected) {
    const found = actual.get(name);
    if (found === undefined) stale.push({ name, state: "missing" });
    else if (found !== text) stale.push({ name, state: "changed" });
  }
  for (const name of actual.keys()) {
    if (!expected.has(name)) stale.push({ name, state: "unexpected" });
  }
  return stale.sort((left, right) => left.name.localeCompare(right.name));
}

export function writeGeneratedTypes(
  schemaDir = SCHEMA_DIR,
  outputDir = GENERATED_DIR,
): { written: string[]; sources: number } {
  const sources = readSchemaSources(schemaDir);
  const files = renderGenerated(sources);
  mkdirSync(outputDir, { recursive: true });
  for (const name of readGenerated(outputDir).keys()) {
    if (!files.has(name)) rmSync(join(outputDir, name));
  }
  const written: string[] = [];
  for (const [name, text] of files) {
    writeFileSync(join(outputDir, name), text, "utf8");
    written.push(name);
  }
  return { written, sources: sources.length };
}
