// Renders a component contract as something a developer can actually read.
//
// A signature list is not a contract. Everything a signature cannot carry --
// what must be true going in, what is guaranteed coming out, what is kept on
// purpose, how it fails -- is written here, and each of those becomes a test.
//
// Generated from the contract definition, never maintained beside it. A black
// box with drifted documentation is worse than one with none, because people
// trust it.

import { statSync } from "node:fs";

import { parse as parseYaml } from "yaml";

import { type Component, componentNamed, type Solution } from "./solution.ts";
import { readText } from "./textfile.ts";

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

/** Where this component sits. Generated, so it cannot drift. */
export function diagram(
  contract: Record<string, unknown>,
  solution: Solution | null = null,
): string {
  const name = String(contract.component);
  const lines = ["```mermaid", "graph LR"];
  const safe = (s: string): string => s.split("-").join("_");
  lines.push(`  ${safe(name)}["${name}"]`);
  if (solution !== null) {
    const comp: Component | undefined = componentNamed(solution, name);
    if (comp !== undefined) {
      for (const dep of comp.dependsOn) {
        lines.push(`  ${safe(name)} --> ${safe(dep)}["${dep}"]`);
      }
      for (const user of comp.usedBy) {
        lines.push(`  ${safe(user)}["${user}"] --> ${safe(name)}`);
      }
      lines.push(`  style ${safe(name)} stroke-width:3px`);
    }
  }
  lines.push("```");
  // Nothing to show; an arrowless diagram is noise.
  if (solution !== null && lines.length === 4) return "";
  return lines.join("\n");
}

export function render(
  contract: Record<string, unknown>,
  solution: Solution | null = null,
): string {
  const name = String(contract.component);
  const out: string[] = [`# Contract — \`${name}\``, ""];
  if (truthy(contract.version)) {
    out.push(`**Version ${String(contract.version)}**  `);
  }
  if (truthy(contract.summary)) out.push(String(contract.summary));
  out.push("");

  const d = diagram(contract, solution);
  if (d) {
    out.push("## Where it sits", "", d, "");
    if (solution !== null) {
      const comp = componentNamed(solution, name);
      if (comp !== undefined) {
        const users =
          comp.usedBy.map((u) => `\`${u}\``).join(", ") || "nothing yet";
        out.push(
          `**Used by:** ${users} — these break if this contract changes.`,
          "",
        );
      }
    }
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
