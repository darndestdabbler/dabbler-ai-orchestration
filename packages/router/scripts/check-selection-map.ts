// The selection map, held to what its named tests actually import.
//
// `testing.selection.rules` in dabbler.yaml says which tests a change to a
// path makes necessary. Nothing verified it: session 91 repaired every
// rule that named a deleted file, and session 93 then found a rule that
// was WRONG rather than dangling and had survived that repair --
// `src/selection.ts` selected `selection.test.ts`, which proves the test
// selector in `checks.ts` and never imports the role selector at all. Both
// files existed, so nothing looked broken. A map nothing verifies drifts
// the moment a file is renamed, which is the same failure as a gate keyed
// to a flag nobody re-reads, one layer up.
//
// Two checks. Every path a rule names -- its `when`, each test it selects,
// and the `smoke` and `repo_wide` lists -- must exist. And for a `when`
// under a CODE root (the router's sources, its test support, the
// extension's sources) every selected test must import a module under it,
// transitively through the TypeScript sources: static imports, re-exports
// and dynamic imports, the same specifiers the boundary scanner reads.
// Transitively, not directly, because "a change there can reach that
// test" is what a mapping claims: the loop's test reaches the driver
// through the loop, and that is exactly the mapping a walkthrough is for.
// Measured when this was written, the direct reading refused 28 rules,
// most of them right; the transitive one refused 6, all of them wrong. A
// `when` that names data -- schemas, prompt templates, a manifest, the
// catalog lock, the packaged configuration -- is checked for existence
// only: a test reaches those by reading them, and this cannot see that.
//
// Runs inside the existing lint control (`workspace-check.ts lint`) beside
// the boundary check, so the map needs no plugin, no new gate, and no
// second place to look.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";

import { loadSelectionConfig } from "../src/checks.ts";

const ROUTER_ROOT = resolve(
  dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  "..",
);
const REPO_ROOT = resolve(ROUTER_ROOT, "..", "..");
const DECLARATION = join(REPO_ROOT, "dabbler.yaml");

/** Where TypeScript modules live; a `when` under one of these is held to imports. */
const CODE_ROOTS: readonly string[] = [
  "packages/router/src/",
  "packages/router/test/support/",
  "tools/dabbler-ai-orchestration/src/",
];
/** Where the import graph is read from: the code roots plus every test. */
const GRAPH_ROOTS: readonly string[] = [
  "packages/router/src",
  "packages/router/test",
  "tools/dabbler-ai-orchestration/src",
];

function posix(path: string): string {
  return path.split(sep).join("/");
}

function rel(path: string): string {
  return posix(relative(REPO_ROOT, path));
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// --- the import graph -------------------------------------------------------------

const files: string[] = [];
const walk = (dir: string): void => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith(".ts")) files.push(path);
  }
};
for (const root of GRAPH_ROOTS) {
  const dir = join(REPO_ROOT, ...root.split("/"));
  if (isDirectory(dir)) walk(dir);
}

/** A relative specifier as the file it names, or null when nothing is there. */
function resolveSpecifier(from: string, specifier: string): string | null {
  const base = resolve(dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, join(base, "index.ts")]) {
    if (existsSync(candidate) && !isDirectory(candidate)) return candidate;
  }
  return null;
}

const imports = new Map<string, Set<string>>();
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const specifiers = [
    ...text.matchAll(/from\s+["'](\.[^"']+)["']/g),
    ...text.matchAll(/import\(\s*["'](\.[^"']+)["']\s*\)/g),
  ];
  const edges = new Set<string>();
  for (const match of specifiers) {
    const target = resolveSpecifier(file, match[1] as string);
    if (target !== null) edges.add(target);
  }
  imports.set(file, edges);
}

/** Every module a file reaches through its imports, itself excluded. */
function reachable(file: string): Set<string> {
  const seen = new Set<string>();
  const queue = [file];
  while (queue.length > 0) {
    const next = queue.pop() as string;
    for (const edge of imports.get(next) ?? []) {
      if (seen.has(edge)) continue;
      seen.add(edge);
      queue.push(edge);
    }
  }
  return seen;
}

// --- the declaration --------------------------------------------------------------

const declared = parseYaml(readFileSync(DECLARATION, "utf8")) as unknown;
const selection = loadSelectionConfig(declared);
const failures: string[] = [];
if (!selection.ok) {
  for (const error of selection.errors) failures.push(`declaration: ${error}`);
}

function mustExist(path: string, where: string): boolean {
  if (existsSync(join(REPO_ROOT, ...path.split("/")))) return true;
  failures.push(`${where}: ${path} does not exist`);
  return false;
}

function isCode(when: string): boolean {
  return CODE_ROOTS.some((root) => when === root || when.startsWith(root));
}

/** Whether `file` (absolute) is the `when` path, or lies under it. */
function under(file: string, when: string): boolean {
  const path = rel(file);
  const prefix = when.endsWith("/") ? when : `${when}/`;
  return path === when || path.startsWith(prefix);
}

for (const path of selection.config.smoke) mustExist(path, "smoke");
for (const path of selection.config.repoWide) mustExist(path, "repo_wide");

selection.config.rules.forEach(([when, selected], index) => {
  const where = `rules[${index}] (when: ${when})`;
  if (!mustExist(when, where)) return;
  for (const test of selected) {
    if (!mustExist(test, where)) continue;
    if (!isCode(when)) continue;
    const file = join(REPO_ROOT, ...test.split("/"));
    if (!imports.has(file)) {
      failures.push(`${where}: ${test} is not a TypeScript file this audit can read`);
      continue;
    }
    if ([...reachable(file)].some((module) => under(module, when))) continue;
    failures.push(
      `${where}: selects ${test}, which imports nothing under ${when} -- ` +
        "a change there cannot reach that test",
    );
  }
});

if (failures.length > 0) {
  process.stderr.write(
    "selection-map: dabbler.yaml's testing.selection does not match what its tests import:\n" +
      failures.map((line) => `  ${line}\n`).join("") +
      "Point each rule at the tests that import the path it names, or at none " +
      "(an empty select is the declaration that a path affects no test).\n",
  );
  process.exit(1);
}
process.exit(0);
