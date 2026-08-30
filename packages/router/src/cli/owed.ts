// `dabbler owed list|answer` -- read what is owed, and settle one.
//
// The brief is printed rather than summarised. Its whole purpose is that an
// operator arriving cold, possibly watching several projects, can decide
// without reading the code -- so the question, what the framework already
// worked out, the options with their consequences, the recommendation and the
// default all reach the screen. A list that printed only ids would put the
// context-rebuilding back on the person it was written for.

import { repoRootFor, resolveSessionsDir, SessionsRootNotFoundError } from "../evidence.ts";
import {
  appendPackagingToProjectConfig,
  appendSuitesToProjectConfig,
  detectEcosystems,
  detectPackaging,
} from "../bootstrap/detect.ts";
import { PROJECT_CONFIG_FILENAME } from "../config.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runGit } from "../journal.ts";
import {
  ID_GIT_REMOTE,
  ID_PACKAGING_FEED,
  NOT_PUBLISHED,
  ID_PACKAGING_SECRET,
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
    "  --value TEXT             the datum an answer carries, when its option",
    "                           says it needs one (a remote URL, say)",
    "  --note TEXT              optional commentary, recorded beside the answer",
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
  // Both packaging answers are executed, not returned as instructions: the
  // operator decides where the release goes and what the credential is
  // called, and the framework does the typing. They behave as a PAIR --
  // half a packaging block is a configuration error rather than a partial
  // feature, and "publishes nothing" is a decision about the repository
  // rather than about one of two fields.
  if (id === ID_PACKAGING_FEED || id === ID_PACKAGING_SECRET) {
    const other = id === ID_PACKAGING_FEED ? ID_PACKAGING_SECRET : ID_PACKAGING_FEED;
    if (choice === NOT_PUBLISHED) {
      // Settles both. Leaving the sibling open is what let a later answer
      // combine with this one and write a block whose feed was the words
      // "publishes nothing" -- the opposite of the decision just made.
      try {
        if (answeredChoice(root, other) === null) {
          answerOwed(root, other, NOT_PUBLISHED, typeof current === "number" ? current : null);
        }
      } catch (error) {
        if (!(error instanceof OwedDecisionError)) throw error;
      }
      acted = "no packaging block; this repository publishes to no feed";
    } else {
      const value = values.get("--value")?.trim() ?? "";
      if (value === "") {
        writeErr(
          `owed: refused -- '${id}' needs the value itself. Nothing was ` +
            "changed. Answer with --value <the feed URL or variable name>.\n",
        );
        return EXIT_REFUSED;
      }
      const answered = answeredValue(root, other);
      if (answered === NOT_PUBLISHED) {
        writeErr(
          "owed: refused -- this repository has already been declared as " +
            "publishing nothing. Nothing was changed; raise the question " +
            "again if that has changed.\n",
        );
        return EXIT_REFUSED;
      }
      if (answered === null) {
        acted = "recorded; the block is written once the other answer is in";
      } else {
        const reading = detectPackaging(root);
        if (reading.recipe === null) {
          writeErr(
            `owed: refused -- ${reading.reason} Nothing was changed, and ` +
              `'${id}' is still open.\n`,
          );
          return EXIT_REFUSED;
        }
        const written = appendPackagingToProjectConfig(
          root,
          reading.recipe,
          id === ID_PACKAGING_FEED ? value : answered,
          id === ID_PACKAGING_FEED ? answered : value,
        );
        if (written === null) {
          writeErr(
            "owed: refused -- the packaging block could not be written, so " +
              `the answer is not recorded and '${id}' is still open. Either ` +
              `${PROJECT_CONFIG_FILENAME} already declares packaging, or it ` +
              "could not be read. Nothing was changed.\n",
          );
          return EXIT_REFUSED;
        }
        acted = written;
      }
    }
  }

  if (id === ID_GIT_REMOTE && choice === "attach") {
    const url = values.get("--value");
    if (url === undefined || url.trim() === "") {
      writeErr(
        "owed: refused -- 'attach' needs the remote URL. Nothing was " +
          "changed. Answer with --value <url>.\n",
      );
      return EXIT_REFUSED;
    }
    const attached = attachRemote(root, url.trim());
    if (attached) {
      writeErr(`owed: refused -- ${attached} Nothing was changed.\n`);
      return EXIT_REFUSED;
    }
    acted = url.trim();
  }
  if (id === ID_GIT_REMOTE && choice === "stay-local") {
    const marked = markLocalOnly(root);
    if (marked) {
      writeErr(`owed: refused -- ${marked} Nothing was changed.\n`);
      return EXIT_REFUSED;
    }
    acted = "local-only";
  }

  try {
    answerOwed(
      root,
      id,
      choice,
      typeof current === "number" ? current : null,
      values.get("--note") ?? null,
      values.get("--value") ?? null,
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

/**
 * Add the remote the operator named, and push the branch with an upstream.
 *
 * Returns a sentence on failure and the empty string on success. The
 * operator supplies the URL, which is the part only they know; the framework
 * runs `git remote add` and `git push --set-upstream`, which is the part it
 * was previously printing at them.
 */
function attachRemote(repoRoot: string, url: string): string {
  if (runGit(repoRoot, ["remote", "get-url", "origin"]).code === 0) {
    return "this repository already has an 'origin' remote.";
  }
  const added = runGit(repoRoot, ["remote", "add", "origin", url]);
  if (added.code !== 0) {
    return `git remote add failed: ${added.stderr.trim() || "unknown error"}.`;
  }
  const head = runGit(repoRoot, ["symbolic-ref", "--short", "HEAD"]);
  if (head.code !== 0) {
    return "HEAD is detached, so there is no branch to push.";
  }
  const pushed = runGit(repoRoot, [
    "push",
    "--set-upstream",
    "origin",
    head.stdout.trim(),
  ]);
  if (pushed.code !== 0) {
    // Put the repository back. A first push fails for entirely routine
    // reasons -- no credentials to hand, an initial commit on the far side,
    // a network that is briefly not there -- and leaving `origin` behind
    // would make the honest message ("nothing was changed") a lie AND make
    // the retry impossible, because the next attempt refuses a remote that
    // already exists. Either the attach happened or it did not.
    const removed = runGit(repoRoot, ["remote", "remove", "origin"]);
    if (removed.code !== 0) {
      return (
        `the push failed (${pushed.stderr.trim() || "unknown error"}) and the ` +
        "remote it had just added could not be removed, so this repository " +
        "now has an 'origin' that was never pushed to. Remove it, or push it " +
        "yourself."
      );
    }
    return `the push failed: ${pushed.stderr.trim() || "unknown error"}.`;
  }
  return "";
}

/**
 * Record that this repository is deliberately local.
 *
 * The marker lives under `.dabbler/`, which is gitignored -- and that is
 * right rather than a compromise: a repository with no remote has nowhere to
 * share the fact through, and the statement is about this checkout.
 * `checkPushedToRemote` already reads it; nothing until now wrote it.
 */
function markLocalOnly(repoRoot: string): string {
  if (runGit(repoRoot, ["remote"]).stdout.trim() !== "") {
    return "this repository has a remote configured, so it is not local-only.";
  }
  const path = join(repoRoot, ".dabbler", "local-only");
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      "This repository is deliberately local. Recorded by `dabbler owed " +
        "answer --id git-remote --choice stay-local`; the close reads it and " +
        "stops asking for a push.\n",
      "utf8",
    );
  } catch (error) {
    return `the local-only marker could not be written: ${
      error instanceof Error ? error.message : String(error)
    }.`;
  }
  return "";
}

/**
 * The answer already given to another decision, when there is one.
 *
 * Read from the folded record rather than remembered, because the two
 * packaging questions are answered in separate commands, minutes or days
 * apart, and the second one is what completes the block.
 */
function answeredChoice(repoRoot: string, id: string): string | null {
  for (const row of currentDecisions(repoRoot)) {
    if (String(row["id"]) !== id) continue;
    const answer = row["answer"];
    return typeof answer === "string" && answer ? answer : null;
  }
  return null;
}

/**
 * The VALUE behind an answer, which is what the block is written from.
 *
 * The offered labels are placeholders -- `<the feed's index URL>` is not a
 * URL -- so reading `answer` and writing it into a configuration file
 * produces a feed nobody can reach. The real string arrives as `--value` and
 * is persisted beside the choice; this reads that, and falls back to the
 * choice only for an answer that IS its own value.
 */
function answeredValue(repoRoot: string, id: string): string | null {
  for (const row of currentDecisions(repoRoot)) {
    if (String(row["id"]) !== id) continue;
    const answer = row["answer"];
    if (typeof answer !== "string" || !answer) return null;
    if (answer === NOT_PUBLISHED) return NOT_PUBLISHED;
    const value = row["value"];
    return typeof value === "string" && value.trim() ? value.trim() : answer;
  }
  return null;
}
