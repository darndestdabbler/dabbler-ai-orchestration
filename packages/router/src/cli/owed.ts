// `dabbler owed list|answer` -- read what is owed, and settle one.
//
// The brief is printed rather than summarised. Its whole purpose is that an
// operator arriving cold, possibly watching several projects, can decide
// without reading the code -- so the question, what the framework already
// worked out, the options with their consequences, the recommendation and the
// default all reach the screen. A list that printed only ids would put the
// context-rebuilding back on the person it was written for.

import { repoRootFor, resolveSessionsDir, SessionsRootNotFoundError } from "../evidence.ts";
import { appendSuitesToProjectConfig, detectEcosystems } from "../bootstrap/detect.ts";
import {
  EVENT_ANSWERED,
  EVENT_RAISED,
  OwedDecisionError,
  answerOwed,
  foldOwed,
  readOwed,
} from "../owedDecisions.ts";
import type { Row } from "../ledger.ts";
import { readSessionState } from "../progress.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;
const EXIT_REFUSED = 1;

const COMMANDS = ["list", "answer"] as const;

function usage(): string {
  return [
    "usage: dabbler owed [-h] [--sessions-dir SESSIONS_DIR] {list,answer} ...",
    "",
    "  list      what this repository is waiting on a person for",
    "  answer    settle one, by id and option label",
    "",
    "options:",
    "  --id ID                  which decision (answer)",
    "  --choice LABEL           the option chosen, by its label (answer)",
    "  --note TEXT              optional, recorded beside the answer",
    "  --all                    list settled decisions too (list)",
    "  --sessions-dir PATH      the sessions root; derived from the cwd when absent",
    "  -h, --help               show this message",
    "",
  ].join("\n");
}

function renderDecision(row: Row): string {
  const lines: string[] = [];
  const state = String(row["event"]);
  const blocking = String(row["class"]) === "verification-reduction";
  lines.push(
    `${String(row["id"])}  [${String(row["class"])}]` +
      (state === EVENT_RAISED ? (blocking ? "  -- holds the close" : "") : `  -- ${state}`),
  );
  lines.push(`  ${String(row["question"])}`);
  if (row["determined"]) lines.push(`  what is already known: ${String(row["determined"])}`);
  if (row["file"]) lines.push(`  the answer is written to: ${String(row["file"])}`);
  const options = Array.isArray(row["options"]) ? row["options"] : [];
  for (const option of options) {
    const entry = option as Row;
    const label = String(entry["label"]);
    const mark = label === row["recommendation"] ? " (recommended)" : "";
    lines.push(`    ${label}${mark}: ${String(entry["consequence"])}`);
  }
  if (row["confidence"]) lines.push(`  confidence: ${String(row["confidence"])}`);
  if (state === EVENT_RAISED && row["onNoAnswer"]) {
    lines.push(`  if nobody answers: ${String(row["onNoAnswer"])}`);
  }
  if (state === EVENT_ANSWERED) {
    lines.push(`  answered: ${String(row["answer"])}`);
    if (row["note"]) lines.push(`  note: ${String(row["note"])}`);
  }
  return lines.join("\n");
}

export function owedVerb(argv: string[]): Promise<number> {
  return Promise.resolve(run(argv));
}

function run(argv: string[]): number {
  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    writeOut(usage());
    return argv.length === 0 ? EXIT_USAGE : EXIT_OK;
  }
  const values = new Map<string, string>();
  const switches = new Set<string>();
  let command: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      if (command === null) {
        command = token;
        continue;
      }
      writeErr(`${usage()}dabbler owed: unrecognized arguments: ${token}\n`);
      return EXIT_USAGE;
    }
    if (token === "--all") {
      switches.add(token);
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined) {
      writeErr(`dabbler owed: argument ${token}: expected one argument\n`);
      return EXIT_USAGE;
    }
    values.set(token, next);
    index += 1;
  }
  if (command === null || !(COMMANDS as readonly string[]).includes(command)) {
    writeErr(
      `${usage()}dabbler owed: invalid choice: '${command ?? ""}' ` +
        `(choose from ${COMMANDS.map((c) => `'${c}'`).join(", ")})\n`,
    );
    return EXIT_USAGE;
  }

  let sessionsDir: string;
  try {
    sessionsDir = resolveSessionsDir(values.get("--sessions-dir"));
  } catch (error) {
    if (!(error instanceof SessionsRootNotFoundError)) throw error;
    writeErr(`owed: ${error.message}\n`);
    return EXIT_USAGE;
  }
  const root = repoRootFor(sessionsDir);
  if (root === null) {
    writeErr(`owed: no git repository found above ${sessionsDir}\n`);
    return EXIT_USAGE;
  }

  let folded: Map<string, Row>;
  try {
    folded = foldOwed(readOwed(root));
  } catch (error) {
    writeErr(`owed: ${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT_REFUSED;
  }

  if (command === "list") {
    const all = switches.has("--all");
    const rows = [...folded.values()].filter(
      (row) => all || row["event"] === EVENT_RAISED,
    );
    if (rows.length === 0) {
      writeOut(
        all
          ? "owed: nothing has ever been owed here.\n"
          : "owed: nothing is waiting on you.\n",
      );
      return EXIT_OK;
    }
    for (const row of rows) writeOut(`${renderDecision(row)}\n\n`);
    return EXIT_OK;
  }

  const id = values.get("--id");
  const choice = values.get("--choice");
  if (id === undefined || choice === undefined) {
    writeErr(
      "dabbler owed answer: the following arguments are required: --id, --choice\n",
    );
    return EXIT_USAGE;
  }
  const state = readSessionState(sessionsDir);
  const current = state ? state["currentSession"] : null;
  try {
    answerOwed(
      root,
      id,
      choice,
      typeof current === "number" ? current : null,
      values.get("--note") ?? null,
    );
  } catch (error) {
    if (!(error instanceof OwedDecisionError)) throw error;
    writeErr(`owed: refused -- ${error.message}\n`);
    return EXIT_REFUSED;
  }
  writeOut(`owed: '${id}' answered '${choice}'.\n`);
  // The answer is a decision, and acting on it is not. Principle (e): the
  // operator supplies what only they can, and the framework does the typing.
  if (id === "testing-suites" && choice === "declare") {
    const written = appendSuitesToProjectConfig(root, detectEcosystems(root));
    if (written === null) {
      writeErr(
        "owed: the answer is recorded, but the suite block could not be " +
          `written to ${root}. Declare it by hand and the next close will ` +
          "measure it.\n",
      );
      return EXIT_REFUSED;
    }
    writeOut(`owed: wrote the suite declaration into ${written}.\n`);
    writeOut(
      "Check the command it declares before the next run of record -- a " +
        "detected command is a reading of the repository, not a promise.\n",
    );
    return EXIT_OK;
  }
  writeOut(
    "The framework acts on it from here; you are not asked to run anything.\n",
  );
  return EXIT_OK;
}
