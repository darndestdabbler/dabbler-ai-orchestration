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
import { PROJECT_CONFIG_FILENAME } from "../config.ts";
import {
  ID_TESTING_SUITES,
  ID_TESTING_SUITES_NOW_TESTS_EXIST,
  OwedDecisionError,
  SEVERITY_BLOCKING,
  STATE_ANSWERED,
  STATE_OPEN,
  answerOwed,
  currentDecisions,
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
  const state = String(row["state"]);
  const blocking = String(row["severity"]) === SEVERITY_BLOCKING;
  lines.push(
    `${String(row["id"])}  [${String(row["class"])}]` +
      (state === STATE_OPEN ? (blocking ? "  -- holds the close" : "") : `  -- ${state}`),
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
  if (state === STATE_OPEN && row["onNoAnswer"]) {
    lines.push(`  if nobody answers: ${String(row["onNoAnswer"])}`);
  }
  if (state === STATE_ANSWERED) {
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

  let folded: Row[];
  try {
    folded = currentDecisions(root);
  } catch (error) {
    writeErr(`owed: ${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT_REFUSED;
  }

  if (command === "list") {
    const all = switches.has("--all");
    const rows = folded.filter(
      (row) => all || row["state"] === STATE_OPEN,
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

  // The act the answer authorises happens BEFORE the answer is recorded, and
  // the order is the whole safety property. Recording first and acting second
  // means a failed act leaves a decision that reads as settled while nothing
  // was settled -- and for a verification-reducing question, that is a close
  // that stops being refused without the gap being closed. So: act, and only
  // then write the row that stops the gate refusing.
  let acted = "";
  const declaresSuite =
    (id === ID_TESTING_SUITES || id === ID_TESTING_SUITES_NOW_TESTS_EXIST) &&
    choice === "declare";
  if (declaresSuite) {
    const written = appendSuitesToProjectConfig(root, detectEcosystems(root));
    if (written === null) {
      writeErr(
        "owed: refused -- the suite block could not be written, so the " +
          `answer is not recorded and '${id}' is still open. Either ` +
          `${PROJECT_CONFIG_FILENAME} already declares suites, or it could ` +
          "not be read. Nothing was changed.\n",
      );
      return EXIT_REFUSED;
    }
    acted = written;
  }

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
  if (acted) {
    writeOut(`owed: wrote the suite declaration into ${acted}.\n`);
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
