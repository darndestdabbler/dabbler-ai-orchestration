// Renders a component contract as something a developer can actually read.
//
// A signature list is not a contract. Everything a signature cannot carry --
// what must be true going in, what is guaranteed coming out, what is kept on
// purpose, how it fails -- is written here, and each of those becomes a test.
//
// Generated from the contract definition, never maintained beside it. A black
// box with drifted documentation is worse than one with none, because people
// trust it.

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";

import { EcosystemError, ecosystemOf, type SurfaceEntry } from "./ecosystem.ts";
import { consumersOf, type ModuleEntry, type SolutionShape } from "./modules.ts";
import { readText } from "./textfile.ts";

/**
 * Where a contract's module sits in the graph: what it depends on and who
 * uses it. Derived from `docs/modules.yaml` by the caller (`dependsOn` as
 * declared, `usedBy` as derived) and never written into the contract, for
 * the reason `usedBy` is derived everywhere: two homes for one edge drift.
 */
export interface ContractGraph {
  readonly dependsOn: readonly string[];
  readonly usedBy: readonly string[];
}

export const EXIT_OK = 0;
export const EXIT_REFUSED = 1;

/** Order matters: this is the order a reader needs them in. */
export const SECTIONS: readonly (readonly [string, string, string])[] = [
  [
    "preconditions",
    "Must be true going in",
    "What the caller guarantees before the call.",
  ],
  [
    "postconditions",
    "Guaranteed coming out",
    "What the component guarantees when it returns.",
  ],
  [
    "retained",
    "Kept on purpose",
    "Deliberately *not* removed or altered. The part people forget.",
  ],
  ["sideEffects", "Side effects", "Anything that changes besides the return value."],
  ["errors", "How it fails", "Including whether failure is a normal outcome."],
];

export const NOT_PROMISED = "notPromised";

export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Python's truthiness for the values a contract holds. */
function truthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (value === "" || value === 0) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

export function load(path: string): Record<string, unknown> {
  let isFile = false;
  try {
    isFile = statSync(path).isFile();
  } catch {
    isFile = false;
  }
  if (!isFile) throw new ContractError(`no contract at ${path}`);
  let doc: unknown;
  try {
    doc = parseYaml(readText(path));
  } catch (error) {
    throw new ContractError(`${path}: ${(error as Error).message}`);
  }
  if (!isRecord(doc)) throw new ContractError(`${path}: contract must be a mapping`);
  for (const required of ["component", "operations"]) {
    if (!truthy(doc[required])) {
      throw new ContractError(`${path}: '${required}' is required`);
    }
  }
  if (!Array.isArray(doc.operations)) {
    throw new ContractError(`${path}: 'operations' must be a list`);
  }
  for (let i = 0; i < doc.operations.length; i += 1) {
    const op: unknown = doc.operations[i];
    if (!isRecord(op) || !truthy(op.name)) {
      throw new ContractError(`${path}: operations[${i}] needs a 'name'`);
    }
  }
  return doc;
}

/** List items into one table cell. Empty says so, rather than being blank. */
function cell(items: unknown): string {
  if (!truthy(items)) return "*none stated*";
  const list = typeof items === "string" ? [items] : (items as unknown[]);
  return list.map((s) => String(s)).join("<br>");
}

/**
 * What proves this row, named. Never a bare tick.
 *
 * An unconditional checkmark is the failure this module exists to prevent: it
 * asserts coverage that nothing supplies, and a contract people trust is
 * worse than one they check. A clause with no test says so, in the column
 * where a reader is already looking.
 */
function proof(clauses: unknown, tests: unknown): string {
  if (!truthy(clauses)) return "*nothing to prove*";
  if (!truthy(tests)) return "**not proved**";
  const list = typeof tests === "string" ? [tests] : (tests as unknown[]);
  return list.map((t) => `\`${String(t)}\``).join("<br>");
}

/**
 * Where this module sits. Generated from the graph, so it cannot drift; a
 * module with no edges, or none the manifest knows, gets no diagram -- an
 * arrowless diagram is noise.
 */
export function diagram(
  contract: Record<string, unknown>,
  graph: ContractGraph | null = null,
): string {
  if (graph === null || (graph.dependsOn.length === 0 && graph.usedBy.length === 0)) {
    return "";
  }
  const name = String(contract.component);
  const lines = ["```mermaid", "graph LR"];
  const safe = (s: string): string => s.split("-").join("_");
  lines.push(`  ${safe(name)}["${name}"]`);
  for (const dep of graph.dependsOn) {
    lines.push(`  ${safe(name)} --> ${safe(dep)}["${dep}"]`);
  }
  for (const user of graph.usedBy) {
    lines.push(`  ${safe(user)}["${user}"] --> ${safe(name)}`);
  }
  lines.push(`  style ${safe(name)} stroke-width:3px`);
  lines.push("```");
  return lines.join("\n");
}

export function render(
  contract: Record<string, unknown>,
  graph: ContractGraph | null = null,
): string {
  const name = String(contract.component);
  const out: string[] = [`# Contract — \`${name}\``, ""];
  if (truthy(contract.version)) {
    out.push(`**Version ${String(contract.version)}**  `);
  }
  if (truthy(contract.summary)) out.push(String(contract.summary));
  out.push("");

  const d = diagram(contract, graph);
  if (d && graph !== null) {
    out.push("## Where it sits", "", d, "");
    const users = graph.usedBy.map((u) => `\`${u}\``).join(", ") || "nothing yet";
    out.push(`**Used by:** ${users} — these break if this contract changes.`, "");
  }

  out.push("## What it promises", "");
  for (const raw of contract.operations as unknown[]) {
    const op = raw as Record<string, unknown>;
    out.push(`### \`${String(op.name)}\``);
    out.push("");
    if (truthy(op.signature)) out.push("```", String(op.signature), "```", "");
    if (truthy(op.summary)) out.push(String(op.summary), "");
    const tests: Record<string, unknown> = truthy(op.tests)
      ? (op.tests as Record<string, unknown>)
      : {};
    out.push("| | | Proved by |");
    out.push("| --- | --- | --- |");
    for (const [key, label, why] of SECTIONS) {
      out.push(
        `| **${label}**<br><sub>${why}</sub> ` +
          `| ${cell(op[key])} | ${proof(op[key], tests[key])} |`,
      );
    }
    out.push("");
    const np = op[NOT_PROMISED];
    out.push(
      "> **Not promised.** " +
        (truthy(np) ? cell(np).split("<br>").join(" · ") : "*nothing stated*"),
      ">",
      "> Callers must not depend on any of this. Pinning it in a test " +
        "freezes an implementation detail, so an improvement then looks " +
        "like a break — and a check that cries wolf gets switched off.",
      "",
    );
  }
  out.push(
    "---",
    "",
    // Names `python -m` deliberately: the string has a byte-identical form
    // and it is the one it has. Every recipe the router PRINTS is swept at
    // the cutover, when there is one router for it to be true about.
    "*Generated from the contract definition. Do not edit by hand — " +
      "regenerate with `dabbler contractdoc`.*",
  );
  return `${out.join("\n")}\n`;
}

// --- The module form ------------------------------------------------------------

/** Where a module's contract bundle lives, relative to the root. */
export function contractDirOf(slug: string): string {
  return `modules/${slug}/contract`;
}

/** The notes page: the human half of the bundle, always. */
export function notesPageOf(slug: string): string {
  return `${contractDirOf(slug)}/README.md`;
}

/** The surface page, for a designed or generated contract. */
export function apiPageOf(slug: string, packageId: string): string {
  return `${contractDirOf(slug)}/${packageId}.api.md`;
}

/**
 * The markers around the part of the notes page that is rendered from
 * `contract.yaml`. Everything outside them is the author's -- the
 * examples, what callers must not depend on, the prose a definition cannot
 * carry -- and is kept across every regeneration; the block between them
 * is replaced whole.
 */
export const CONTRACT_BEGIN =
  "<!-- dabbler:contract begin -- rendered from contract.yaml beside this page; edit the yaml, not this block -->";
export const CONTRACT_END = "<!-- dabbler:contract end -->";

/**
 * The notes page with the rendering of `contract.yaml` composed into it:
 * between the markers when the page already carries them, appended when it
 * does not, and as the whole page under a heading when there is no page.
 */
export function composeNotes(existing: string | null, rendered: string, packageId: string): string {
  const block = `${CONTRACT_BEGIN}\n${rendered.trimEnd()}\n${CONTRACT_END}`;
  if (existing !== null) {
    const begin = existing.indexOf(CONTRACT_BEGIN);
    const end = existing.indexOf(CONTRACT_END);
    if (begin >= 0 && end > begin) {
      return `${existing.slice(0, begin)}${block}${existing.slice(end + CONTRACT_END.length)}`;
    }
    return `${existing.trimEnd()}\n\n${block}\n`;
  }
  return `# ${packageId} — what it promises\n\n${block}\n`;
}

export interface ModuleContractOptions {
  /** `modules.<slug>.contract.generate` from dabbler.yaml, for the generated fallback. */
  readonly generate?: readonly string[] | null;
  /** How the generator runs; a test hands in a scripted one. */
  readonly runGenerate?: (argv: readonly string[], cwd: string) => string;
}

export interface ModuleContract {
  readonly slug: string;
  readonly mode: "designed" | "package" | "generated";
  /**
   * The notes page. Rendered from a `contract.yaml` beside it when the
   * module keeps one -- the file form's renderer, so the page cannot drift
   * from its definition -- and read as written otherwise.
   */
  readonly notes: string;
  readonly notesPath: string;
  /** True when `notes` was rendered from `contract.yaml` and is to be written back. */
  readonly notesRendered: boolean;
  /** The surface page, for `designed` and `generated`; null for `package`. */
  readonly api: string | null;
  readonly apiPath: string | null;
}

function runGenerator(argv: readonly string[], cwd: string): string {
  const [program, ...args] = argv;
  const result = spawnSync(program as string, args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new ContractError(
      `the surface generator '${argv.join(" ")}' failed` +
        (result.status !== null && result.status !== undefined ? ` (exit ${result.status})` : "") +
        (result.error ? `: ${result.error.message}` : "") +
        (result.stderr ? `\n${result.stderr.trim()}` : ""),
    );
  }
  return result.stdout;
}

function surfacePage(packageId: string, marker: string, body: string): string {
  return [`# ${packageId} — contract surface`, "", marker, "", body.trimEnd(), ""].join("\n");
}

function renderSurface(entries: readonly SurfaceEntry[]): string {
  if (entries.length === 0) return "*No public declaration was found.*";
  const out: string[] = [];
  let current = "";
  for (const entry of entries) {
    if (entry.file !== current) {
      current = entry.file;
      if (out.length > 0) out.push("");
      out.push(`## \`${entry.file}\``, "");
    }
    out.push(`- \`${entry.declaration}\`${entry.summary ? ` — ${entry.summary}` : ""}`);
  }
  return out.join("\n");
}

/**
 * A module's contract bundle, rendered from what the tree holds.
 *
 * The notes page is the human half and must exist for any declared
 * contract -- a module that declares a seam and has no page is refused by
 * path, because the page is what the block's other sessions read instead
 * of a sibling's source. A `contract.yaml` beside it is rendered through
 * the file form and appended. The surface page is the machine half:
 * `designed` reads the abstractions project's source through the
 * ecosystem seam and says so; `generated` runs the declared generator and
 * says what a generated surface is -- shape, not behaviour; `package`
 * has no surface page, the package being its own abstraction.
 */
export function renderModuleContract(
  root: string,
  shape: SolutionShape,
  slug: string,
  options: ModuleContractOptions = {},
): ModuleContract {
  const entry = shape.modules.find((module) => module.slug === slug);
  if (entry === undefined) {
    throw new ContractError(`docs/modules.yaml declares no module '${slug}'`);
  }
  const mode = entry.contract;
  if (mode === null) {
    throw new ContractError(
      `module '${slug}' declares no contract; give it \`contract: designed\`, \`package\` or ` +
        "`generated` in docs/modules.yaml",
    );
  }
  const notesPath = notesPageOf(slug);
  const yamlPath = join(root, contractDirOf(slug), "contract.yaml");
  const packageId = entry.package ?? slug;
  // The notes page is the author's, and when the module keeps a
  // contract.yaml beside it the definition's rendering is composed into it
  // between markers -- the author's prose stays, the block is regenerated.
  // A declared seam with neither page nor definition is refused by path.
  const existing = existsSync(join(root, notesPath)) ? readText(join(root, notesPath)) : null;
  let notes: string;
  let notesRendered = false;
  if (existsSync(yamlPath)) {
    const graph: ContractGraph = {
      dependsOn: [...entry.dependsOn],
      usedBy: consumersOf(shape.modules, slug),
    };
    notes = composeNotes(existing, render(load(yamlPath), graph), packageId);
    notesRendered = true;
  } else if (existing !== null) {
    notes = existing;
  } else {
    throw new ContractError(
      `module '${slug}' declares contract: ${mode} and has no notes page at ${notesPath}; ` +
        "write it, keep a contract.yaml beside it to render it from, or scaffold it with " +
        `\`dabbler module contract ${slug}\``,
    );
  }
  const base = { slug, notes, notesPath, notesRendered };
  if (mode === "package") {
    return { ...base, mode, api: null, apiPath: null };
  }
  const apiPath = apiPageOf(slug, packageId);
  if (mode === "designed") {
    let surface: SurfaceEntry[];
    try {
      surface = ecosystemOf(root, entry).readSurface(root, entry, packageId);
    } catch (error) {
      if (error instanceof EcosystemError) throw new ContractError(error.message);
      throw error;
    }
    return {
      ...base,
      mode,
      apiPath,
      api: surfacePage(
        packageId,
        "*Designed: read from the abstractions project's source, with its doc comments. " +
          "What a consumer compiles against; the behaviour it may rely on is on the notes page.*",
        renderSurface(surface),
      ),
    };
  }
  const generate = options.generate ?? null;
  if (generate === null || generate.length === 0) {
    throw new ContractError(
      `module '${slug}' declares contract: generated and dabbler.yaml names no ` +
        `modules.${slug}.contract.generate to run`,
    );
  }
  const produced = (options.runGenerate ?? runGenerator)(generate, root);
  return {
    ...base,
    mode,
    apiPath,
    api: surfacePage(
      packageId,
      "*Generated from the built assembly — shape, not behaviour. A generated surface " +
        "proves what exists, never what it promises; the notes page carries the promises.*",
      produced,
    ),
  };
}

/** The entry's graph, for a caller that renders the file form for a module. */
export function graphOf(shape: SolutionShape, entry: ModuleEntry): ContractGraph {
  return { dependsOn: [...entry.dependsOn], usedBy: consumersOf(shape.modules, entry.slug) };
}
