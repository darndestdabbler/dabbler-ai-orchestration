// Solution manifest: the one declaration of what a solution is made of.
//
// A *module* (`modules.ts`) groups work inside one repository. A *component*
// is a different thing: something with its own contract, its own version, and
// consumers that break when it changes. The two manifests coexist
// deliberately and do not overlap -- a module answers "whose work is this", a
// component answers "what does this promise and who depends on it".
//
// The manifest is a YAML mapping with `solution` and `components`. Every
// component declares what it depends on; nothing declares what depends on
// *it*. `usedBy` is derived, never written, because two directions maintained
// by hand disagree eventually and the disagreement is silent.

import { statSync } from "node:fs";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";

import { readText } from "./textfile.ts";

export const EXIT_OK = 0;
export const EXIT_REFUSED = 1;
export const EXIT_USAGE = 2;

export const MANIFEST_RELPATH = "solution.yaml";

export const KINDS: readonly string[] = ["library", "integration"];

/**
 * The six steps. There is no seventh: feedback loops run all along the way,
 * and a step moving backwards is an ordinary event, not an exception.
 */
export const STEPS: readonly string[] = [
  "plan",
  "decompose",
  "contracts",
  "mocks",
  "integration",
  "build",
];

export const STEP_TITLES: Readonly<Record<string, string>> = {
  plan: "Plan and design",
  decompose: "Break it into components",
  contracts: "Write down the promises",
  mocks: "Build stand-ins",
  integration: "Build the whole thing on stand-ins",
  build: "Replace the stand-ins for real",
};

/**
 * What a step owes, in the words a reviewer is given. Declared here so the
 * review prompt and the tree cannot describe the same step differently.
 */
export const STEP_DELIVERABLES: Readonly<Record<string, string>> = {
  plan:
    "A statement of the objective a reader can act on: what the solution " +
    "is for, who uses it, what it must do, and what is deliberately out " +
    "of scope. Vagueness that would let two people build different " +
    "things is the defect to look for.",
  decompose:
    "More than one candidate decomposition, each in plain language, with " +
    "one recommended and the reasoning given. Components should hide " +
    "decisions likely to change rather than mirror processing steps. A " +
    "single candidate presented as the only option is a defect.",
  contracts:
    "A contract per component carrying what a signature cannot: what must " +
    "be true going in, what is guaranteed coming out, what is kept on " +
    "purpose, side effects, how it fails, and what callers must not " +
    "depend on. A promise nothing can prove is the defect to look for.",
  mocks:
    "A stand-in per component that satisfies its contract and nothing " +
    "more. A mock that is right by accident, or that promises behaviour " +
    "the contract does not, is the defect to look for.",
  integration:
    "The whole solution running on stand-ins alone, end to end. What it " +
    "proves is that the contracts compose. A gap the integration papers " +
    "over is a contract that is wrong.",
  build:
    "A real component replacing its stand-in and passing the same " +
    "contract checks the stand-in passed. A real component held to a " +
    "weaker bar than its mock is the defect to look for.",
};

/**
 * The two steps a developer signs off. Derived from the step, never set per
 * call: an approval gate a caller can switch off is one a caller switches
 * off. Step 3 is deliberately absent -- the developer sees the contracts and
 * may object, but the objection does not hold the work.
 */
export const APPROVAL_STEPS: readonly string[] = ["plan", "decompose"];

/**
 * The generated, readable form of a contract sits beside its source. Derived,
 * never declared, for the reason `usedBy` is derived: two paths kept by hand
 * disagree eventually and the disagreement is silent.
 */
export const CONTRACT_DOC_SUFFIX = ".md";

/**
 * `components/x/contract.yaml` -> `components/x/contract.md`.
 *
 * `null` when no contract is declared, and unchanged when the declared path
 * is already the generated form.
 */
export function contractDocPath(contract: string | null): string | null {
  if (!contract) return null;
  const slash = contract.lastIndexOf("/");
  const stem = slash < 0 ? contract : contract.slice(slash + 1);
  const dot = stem.lastIndexOf(".");
  // A leading dot names the whole file rather than a suffix; PurePosixPath
  // agrees, so `.gitignore` keeps its name and gains the suffix.
  const suffix = dot > 0 ? stem.slice(dot) : "";
  if (suffix === CONTRACT_DOC_SUFFIX) return contract;
  const base =
    suffix === "" ? contract : contract.slice(0, contract.length - suffix.length);
  return `${base}${CONTRACT_DOC_SUFFIX}`;
}

export const KNOWN_SOLUTION_KEYS: readonly string[] = ["name", "title", "step"];
export const KNOWN_COMPONENT_KEYS: readonly string[] = [
  "name",
  "kind",
  "title",
  "source",
  "contract",
  "artifact",
  "version",
  "step",
  "dependsOn",
  "owner",
];

/** The manifest cannot be trusted. Always names the offending entry. */
export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

export interface Component {
  readonly name: string;
  readonly kind: string;
  readonly title: string;
  readonly source: string | null;
  readonly contract: string | null;
  readonly artifact: string | null;
  readonly version: string | null;
  readonly step: string;
  readonly owner: string | null;
  readonly dependsOn: readonly string[];
  /** Derived from every other component's `dependsOn`. */
  readonly usedBy: readonly string[];
}

export interface Solution {
  readonly name: string;
  readonly title: string;
  readonly step: string;
  readonly components: readonly Component[];
}

/** The named component, or undefined -- the caller decides what a miss means. */
export function componentNamed(
  solution: Solution,
  name: string,
): Component | undefined {
  return solution.components.find((c) => c.name === name);
}

export function integrationComponents(solution: Solution): Component[] {
  return solution.components.filter((c) => c.kind === "integration");
}

export function manifestPath(workspaceRoot: string): string {
  return join(workspaceRoot, MANIFEST_RELPATH);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Python's truthiness, for the fields this manifest tests that way. */
function truthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (value === "" || value === 0) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

/**
 * An unknown key is rejected rather than ignored.
 *
 * A misspelled `dependsOn` that is silently dropped leaves a component
 * looking like it depends on nothing, which is exactly the answer this
 * manifest exists to get right.
 */
function rejectUnknown(
  entry: Record<string, unknown>,
  known: readonly string[],
  where: string,
): void {
  const unknown = Object.keys(entry).filter((k) => !known.includes(k));
  if (unknown.length > 0) {
    throw new ManifestError(
      `${where}: unknown key(s) ${[...unknown].sort().join(", ")}. ` +
        `Known keys: ${known.join(", ")}`,
    );
  }
}

/** Depth-first, reporting the actual cycle rather than just its existence. */
function checkCycles(edges: Map<string, readonly string[]>): void {
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map<string, number>();
  for (const node of edges.keys()) colour.set(node, WHITE);

  const walk = (node: string, trail: readonly string[]): void => {
    colour.set(node, GREY);
    for (const next of edges.get(node) ?? []) {
      if (colour.get(next) === GREY) {
        const loop = [...trail.slice(trail.indexOf(next)), next];
        throw new ManifestError(
          `dependency cycle: ${loop.join(" -> ")}. Components form a ` +
            "directed graph; a cycle means two of these are really one " +
            "component.",
        );
      }
      if (colour.get(next) === WHITE) walk(next, [...trail, next]);
    }
    colour.set(node, BLACK);
  };

  for (const node of edges.keys()) {
    if (colour.get(node) === WHITE) walk(node, [node]);
  }
}

function asString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

export function parse(document: unknown): Solution {
  if (!isRecord(document)) throw new ManifestError("manifest must be a mapping");

  const head = document.solution;
  if (!isRecord(head)) throw new ManifestError("manifest needs a 'solution' mapping");
  rejectUnknown(head, KNOWN_SOLUTION_KEYS, "solution");
  for (const required of ["name", "title"]) {
    if (!truthy(head[required])) {
      throw new ManifestError(`solution: '${required}' is required`);
    }
  }
  const step = head.step === undefined ? "plan" : String(head.step);
  if (!STEPS.includes(step)) {
    throw new ManifestError(
      `solution: step '${step}' is not one of ${STEPS.join(", ")}`,
    );
  }

  const raw = document.components;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ManifestError("manifest needs a non-empty 'components' list");
  }

  interface Parsed {
    readonly name: string;
    readonly kind: string;
    readonly title: string;
    readonly source: string | null;
    readonly contract: string | null;
    readonly artifact: string | null;
    readonly version: string | null;
    readonly step: string;
    readonly owner: string | null;
    readonly dependsOn: readonly string[];
  }

  const parsed: Parsed[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i += 1) {
    const entry: unknown = raw[i];
    const where = `components[${i}]`;
    if (!isRecord(entry)) throw new ManifestError(`${where}: must be a mapping`);
    rejectUnknown(entry, KNOWN_COMPONENT_KEYS, where);
    if (!truthy(entry.name)) throw new ManifestError(`${where}: 'name' is required`);
    const name = String(entry.name);
    if (seen.has(name)) {
      throw new ManifestError(`${where}: duplicate component '${name}'`);
    }
    seen.add(name);
    const kind = entry.kind === undefined ? "library" : String(entry.kind);
    if (!KINDS.includes(kind)) {
      throw new ManifestError(
        `${where} (${name}): kind '${kind}' is not one of ${KINDS.join(", ")}`,
      );
    }
    const cstep = entry.step === undefined ? "plan" : String(entry.step);
    if (!STEPS.includes(cstep)) {
      throw new ManifestError(
        `${where} (${name}): step '${cstep}' is not one of ${STEPS.join(", ")}`,
      );
    }
    const deps: unknown = truthy(entry.dependsOn) ? entry.dependsOn : [];
    if (!Array.isArray(deps)) {
      throw new ManifestError(`${where} (${name}): dependsOn must be a list`);
    }
    parsed.push({
      name,
      kind,
      title: truthy(entry.title) ? String(entry.title) : name,
      source: asString(entry.source),
      contract: asString(entry.contract),
      artifact: asString(entry.artifact),
      version: asString(entry.version),
      step: cstep,
      owner: asString(entry.owner),
      dependsOn: deps.map((d: unknown) => String(d)),
    });
  }

  const edges = new Map<string, readonly string[]>(
    parsed.map((c) => [c.name, c.dependsOn] as const),
  );
  for (const c of parsed) {
    for (const dep of c.dependsOn) {
      if (!seen.has(dep)) {
        throw new ManifestError(
          `${c.name}: depends on '${dep}', which is not a component in this ` +
            "solution",
        );
      }
    }
  }
  checkCycles(edges);

  const usedBy = new Map<string, string[]>();
  for (const name of seen) usedBy.set(name, []);
  for (const c of parsed) {
    for (const dep of c.dependsOn) usedBy.get(dep)?.push(c.name);
  }

  return {
    name: String(head.name),
    title: String(head.title),
    step,
    components: parsed.map((c) => ({
      ...c,
      dependsOn: [...c.dependsOn],
      usedBy: [...(usedBy.get(c.name) ?? [])].sort(),
    })),
  };
}

export function load(workspaceRoot: string): Solution {
  const path = manifestPath(workspaceRoot);
  let isFile = false;
  try {
    isFile = statSync(path).isFile();
  } catch {
    isFile = false;
  }
  if (!isFile) throw new ManifestError(`no solution manifest at ${path}`);
  let document: unknown;
  try {
    document = parseYaml(readText(path));
  } catch (error) {
    throw new ManifestError(`${path}: ${(error as Error).message}`);
  }
  return parse(document);
}

/** The shape the extension reads. Derived fields included. */
export function asDict(solution: Solution): Record<string, unknown> {
  return {
    solution: {
      name: solution.name,
      title: solution.title,
      step: solution.step,
      stepTitle: STEP_TITLES[solution.step],
      stepNumber: STEPS.indexOf(solution.step) + 1,
      stepCount: STEPS.length,
    },
    components: solution.components.map((c) => ({
      name: c.name,
      kind: c.kind,
      title: c.title,
      source: c.source,
      contract: c.contract,
      contractDoc: contractDocPath(c.contract),
      artifact: c.artifact,
      version: c.version,
      step: c.step,
      stepTitle: STEP_TITLES[c.step],
      stepNumber: STEPS.indexOf(c.step) + 1,
      owner: c.owner,
      dependsOn: [...c.dependsOn],
      usedBy: [...c.usedBy],
    })),
  };
}
