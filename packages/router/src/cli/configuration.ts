// `dabbler configuration` -- what may be chosen, and what decided each
// value that is.
//
// **Two subcommands and no third.** `options` answers "what could I put
// here", and it carries LOCAL AVAILABILITY with each choice so there is no
// second command asking the same question a different way. `explain` answers
// "why is it this", by naming the layer that decided each value -- read off
// the layer list `explainTransport` already returns, so a value and its
// reason cannot come apart.
//
// **Neither reads anything twice.** Both render `configurationNode`, which
// is the one reading of what a session would be run with; a verb that folded
// the catalog and the preferences again would be a second implementation of
// it, and the two would disagree the first time one of them changed.
//
// **Nothing here writes, and nothing here reaches a vendor.** `configure`
// writes; a refresh is asked for. A verb that enumerated a vendor to answer
// "what could I choose" would charge a question for being asked.

import { repoRootFor } from "../journal.ts";
import { configurationNode } from "../projection.ts";
import { workingDirectory } from "../workdir.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;

const COMMANDS = ["options", "explain"] as const;

function usage(): string {
  return [
    "usage: dabbler configuration [-h] {options,explain} [--repo-root PATH]",
    "",
    "what the next session may be run with, and what decided what it is",
    "",
    "commands:",
    "  options     every choice each participant could be given, with whether",
    "              this machine can actually reach it. A vehicle nothing here",
    "              can reach is listed with the reason and never silently",
    "              dropped, because a list that hid it reads as a broken pane",
    "  explain     each resolved value with the LAYER that decided it, in",
    "              precedence order: a typed flag, this checkout's",
    "              .vscode/settings.json, the user-level preferences.json, then",
    "              the configuration the distribution ships",
    "",
    "options:",
    "  --repo-root PATH  the repository; derived from the cwd when absent",
    "  -h, --help        show this message",
    "",
  ].join("\n");
}

type Node = Record<string, unknown>;

function node(value: unknown): Node {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Node)
    : {};
}

function rows(value: unknown): Node[] {
  return Array.isArray(value) ? (value as Node[]) : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** The three participants, in the order the pane shows them. */
const PARTICIPANTS: ReadonlyArray<readonly [string, string]> = [
  ["authoring", "Authoring AI"],
  ["primaryReviewer", "Primary Reviewer"],
  ["auxiliaryReviewer", "Auxiliary Reviewer"],
];

/**
 * What each participant could be given, with what reaching it would take.
 *
 * Availability travels WITH each choice rather than in a separate listing,
 * because the two questions -- what exists and what works here -- are asked
 * together every time and answered from one reading.
 */
function renderOptions(configuration: Node): string {
  const lines: string[] = [];
  const unavailable = text(configuration["unavailable"]);
  if (unavailable !== null) {
    return `configuration: this configuration could not be read: ${unavailable}\n`;
  }
  for (const [key, label] of PARTICIPANTS) {
    const participant = node(configuration[key]);
    lines.push(`${label}`);
    const vehicle = node(participant["vehicle"]);
    const chosenVehicle = text(vehicle["chosen"]) ?? "nothing chosen";
    lines.push(`  vehicle: ${chosenVehicle}`);
    for (const option of rows(vehicle["options"])) {
      const id = text(option["id"]) ?? "";
      lines.push(`    ${id === chosenVehicle ? "*" : "-"} ${id} — ${text(option["means"]) ?? ""}`);
    }
    // Named, with the reason. "Not offered" with no reason is how an
    // operator comes to believe the pane is broken rather than honest.
    for (const held of rows(vehicle["withheld"])) {
      lines.push(
        `    x ${text(held["id"]) ?? ""} — not reachable here: ${text(held["note"]) ?? "no reason recorded"}`,
      );
    }
    const chosenModel = text(node(participant["chosen"])["model"]);
    lines.push(`  model: ${chosenModel ?? "nothing resolves"}`);
    const candidates = rows(participant["candidates"]);
    if (candidates.length === 0) {
      lines.push(`    (none: ${text(participant["unavailable"]) ?? "no model qualifies here"})`);
    }
    for (const candidate of candidates) {
      const id = text(candidate["model"]) ?? "";
      const price = text(candidate["priceCategory"]);
      lines.push(
        `    ${id === chosenModel ? "*" : "-"} ${id} (${text(candidate["provider"]) ?? "provider unknown"}` +
          `${price === null ? "" : `, ${price} price`})`,
      );
    }
    for (const held of rows(participant["withheld"])) {
      const since = text(node(held["retired"])["since"]) ?? "unknown";
      lines.push(`    x ${text(held["model"]) ?? ""} — withdrawn by its vendor, gone since ${since}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

/** One resolved value, with every layer that named one and which decided. */
function layerLines(label: string, reading: Node): string[] {
  const lines = [
    `${label}: ${text(reading["chosen"]) ?? text(reading["effective"]) ?? "nothing chosen"}` +
      ` (decided by ${text(reading["decidedBy"]) ?? "the built-in default"})`,
  ];
  const layers = rows(reading["layers"]);
  layers.forEach((layer, index) => {
    // The shadowed ones are the point: a value alone cannot tell an operator
    // that the setting they are looking at is outranked by one above it.
    lines.push(
      `  ${index === 0 ? "decides" : "shadowed"}: ${text(layer["source"]) ?? ""} = ${text(layer["value"]) ?? ""}`,
    );
  });
  return lines;
}

function renderExplain(configuration: Node): string {
  const unavailable = text(configuration["unavailable"]);
  if (unavailable !== null) {
    return `configuration: this configuration could not be read: ${unavailable}\n`;
  }
  const lines: string[] = [];
  lines.push(...layerLines("machine vehicle", node(configuration["transport"])));
  const engines = node(configuration["engines"]);
  lines.push(
    `engine: ${text(engines["chosen"]) ?? "none installed"} — ${text(engines["reason"]) ?? ""}`,
  );
  for (const [key, label] of PARTICIPANTS) {
    const participant = node(configuration[key]);
    lines.push(...layerLines(`${label} vehicle`, node(participant["vehicle"])));
    const selected = text(participant["selected"]);
    const chosen = text(node(participant["chosen"])["model"]);
    // **The authoring role has no preference order and no `selected`.** A
    // model there is chosen or it is not: the choice is this checkout's
    // setting or this person's default, and `chosen` reports it. Reading
    // the reviewing roles' fields for it printed two false sentences on one
    // line -- "nobody chose one" beside the model they had just chosen, and
    // "the preference order decides" about an order that does not exist.
    const authoring = key === "authoring";
    const why = authoring
      ? chosen === null
        ? " (nobody has chosen one, so the engine's own default runs and no --model is passed)"
        : " (you chose it; it is what the engine's CLI is launched on)"
      : selected === null
        ? " (nobody chose one, so the preference order decides)"
        : ` (you chose '${selected}'; it is used and never silently substituted)`;
    lines.push(`${label} model: ${chosen ?? "nothing resolves"}${why}`);
  }
  for (const record of rows(configuration["records"])) {
    lines.push(
      `record ${text(record["record"]) ?? ""}: ${text(record["path"]) ?? "no path"}` +
        ` — ${record["stale"] === true ? "stale" : "current"}, ${text(record["command"]) ?? ""}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export async function configurationVerb(argv: string[]): Promise<number> {
  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    writeOut(usage());
    return argv.length === 0 ? EXIT_USAGE : EXIT_OK;
  }
  const [command, ...rest] = argv as [string, ...string[]];
  if (!(COMMANDS as readonly string[]).includes(command)) {
    writeErr(`dabbler configuration: unknown command '${command}'\n\n${usage()}`);
    return EXIT_USAGE;
  }
  let root: string | null = null;
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] !== "--repo-root") {
      writeErr(`dabbler configuration: unexpected argument '${rest[index]}'\n\n${usage()}`);
      return EXIT_USAGE;
    }
    const value = rest[index + 1];
    if (value === undefined) {
      writeErr(`dabbler configuration: --repo-root needs a value\n\n${usage()}`);
      return EXIT_USAGE;
    }
    root = value;
    index += 1;
  }
  const here = workingDirectory();
  const repoRoot = root ?? repoRootFor(here) ?? here;
  // Never throws: a configuration this router cannot load is a real state,
  // and it carries its own sentence saying how to fix it.
  const configuration = node(configurationNode(repoRoot));
  writeOut(command === "options" ? renderOptions(configuration) : renderExplain(configuration));
  return EXIT_OK;
}
