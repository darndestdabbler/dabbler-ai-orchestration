// The module boundary, held: no import cycle beyond the frozen baseline.
//
// Nodes are `src`'s top-level modules (a subdirectory collapses to one
// node); an edge is an import. Every strongly-connected component bigger
// than one module is a knot, and every edge inside one must appear in
// `boundary-baseline.json` -- the named remainder of the 2026-09-02
// untangle (52 back-edges cut to 2). A NEW knot edge fails the lint
// control; retiring one from the baseline is welcome any time.
//
// Runs inside the existing lint control (`workspace-check.ts lint`), so the
// boundary needs no plugin, no new gate, and no second place to look.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const ROUTER_ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const SRC = join(ROUTER_ROOT, "src");
const BASELINE_PATH = join(ROUTER_ROOT, "boundary-baseline.json");

function nodeOf(path: string): string {
  const rel = relative(SRC, path).split(sep).join("/");
  const seg = rel.split("/");
  return seg.length > 1 ? seg[0] : seg[0].replace(/\.ts$/, "");
}

const files: string[] = [];
const walk = (dir: string): void => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith(".ts")) files.push(path);
  }
};
walk(SRC);

const nodes = new Set<string>();
const edges = new Map<string, Set<string>>();
for (const file of files) {
  const from = nodeOf(file);
  nodes.add(from);
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    const to = nodeOf(resolve(dirname(file), match[1]));
    if (to === from) continue;
    nodes.add(to);
    if (!edges.has(from)) edges.set(from, new Set());
    edges.get(from)!.add(to);
  }
}

// Tarjan: components bigger than one are the knots.
let index = 0;
const stack: string[] = [];
const onStack = new Set<string>();
const low = new Map<string, number>();
const num = new Map<string, number>();
const knots: string[][] = [];
const strong = (v: string): void => {
  num.set(v, index);
  low.set(v, index);
  index += 1;
  stack.push(v);
  onStack.add(v);
  for (const w of edges.get(v) ?? []) {
    if (!num.has(w)) {
      strong(w);
      low.set(v, Math.min(low.get(v)!, low.get(w)!));
    } else if (onStack.has(w)) {
      low.set(v, Math.min(low.get(v)!, num.get(w)!));
    }
  }
  if (low.get(v) === num.get(v)) {
    const component: string[] = [];
    let w: string;
    do {
      w = stack.pop()!;
      onStack.delete(w);
      component.push(w);
    } while (w !== v);
    if (component.length > 1) knots.push(component);
  }
};
for (const v of nodes) if (!num.has(v)) strong(v);

const baseline: ReadonlyArray<readonly [string, string]> = JSON.parse(
  readFileSync(BASELINE_PATH, "utf8"),
).edges;
const allowed = new Set(baseline.map(([a, b]) => `${a}->${b}`));

const violations: string[] = [];
for (const knot of knots) {
  const members = new Set(knot);
  for (const from of knot) {
    for (const to of edges.get(from) ?? []) {
      if (!members.has(to)) continue;
      const key = `${from}->${to}`;
      if (!allowed.has(key)) violations.push(key);
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(
    "boundary: new import-cycle edge(s) beyond the frozen baseline:\n" +
      violations.sort().map((edge) => `  ${edge}\n`).join("") +
      "Break the cycle, or -- only with the reason recorded -- add the edge " +
      "to boundary-baseline.json beside the boundary it violates.\n",
  );
  process.exit(1);
}
process.exit(0);
