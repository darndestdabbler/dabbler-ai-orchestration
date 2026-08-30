// `dabbler affected` -- the tests this working tree makes necessary, and why.
//
// The runner it prints is whatever the repository declared, never this
// module's guess: a printed command an orchestrator cannot paste teaches it to
// improvise one, and the run of record would then cite the improvisation.

import { loadConfig } from "../config.ts";
import {
  ROUND_REFSPEC,
  SessionsRootNotFoundError,
  objectExists,
  repoRootFor,
  resolveSessionsDir,
  upstreamRemote,
} from "../evidence.ts";
import { loadSelectionConfig, selectTests } from "../checks.ts";
import { loadSuitesChecked } from "../testEvidence.ts";
import { preverifyBaseline, runnableCommands, workingTreeChanges } from "../affected.ts";
import { dumps } from "../pythonJson.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;

function usage(): string {
  return [
    "usage: dabbler affected [-h] [--json] [--sessions-dir SESSIONS_DIR]",
    "",
    "the tests this working tree makes necessary, and why",
    "",
    "options:",
    "  -h, --help            show this help message and exit",
    "  --json",
    "  --sessions-dir SESSIONS_DIR",
    "                        the repository's sessions root; derived from the",
    "                        working directory when omitted",
    "",
  ].join("\n");
}

/** Left-justified to `width`, which is what `f"{value:22}"` does. */
function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

export async function affectedVerb(argv: string[]): Promise<number> {
  let json = false;
  let sessionsDirArg: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;
    if (token === "-h" || token === "--help") {
      writeOut(usage());
      return EXIT_OK;
    }
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token.startsWith("--sessions-dir=")) {
      sessionsDirArg = token.slice("--sessions-dir=".length);
      continue;
    }
    if (token === "--sessions-dir") {
      const next = argv[index + 1];
      if (next === undefined) {
        writeErr(`dabbler affected: argument ${token}: expected one argument\n`);
        return EXIT_USAGE;
      }
      sessionsDirArg = next;
      index += 1;
      continue;
    }
    writeErr(`dabbler affected: unrecognized arguments: ${token}\n\n${usage()}`);
    return EXIT_USAGE;
  }

  const repoRoot = repoRootFor(".");
  if (repoRoot === null) {
    writeErr("affected: no git repository here\n");
    return EXIT_USAGE;
  }
  const config = loadConfig();
  const loaded = loadSelectionConfig(config);
  if (!loaded.ok) {
    writeErr(
      "affected: testing.selection is malformed: " + loaded.errors.join("; ") + "\n",
    );
    return EXIT_USAGE;
  }

  let sessionsDir: string;
  try {
    sessionsDir = resolveSessionsDir(sessionsDirArg, repoRoot);
  } catch (error) {
    if (!(error instanceof SessionsRootNotFoundError)) throw error;
    writeErr(`affected: ${error.message}\n`);
    return EXIT_USAGE;
  }

  // Selection is scoped the way verification will scope it: once a round
  // exists, a remediation is measured against that round's snapshot rather
  // than HEAD.
  const baseline = preverifyBaseline(repoRoot, sessionsDir);
  const changed = workingTreeChanges(repoRoot, baseline);
  if (changed === null) {
    // "git could not answer" is not a useful thing to be told. The one cause
    // that is not a broken repository is a baseline object this store does not
    // hold, which is what a session moved between machines arrives with -- so
    // say that, and name the recovery.
    if (baseline && !objectExists(repoRoot, baseline)) {
      writeErr(
        `affected: the recorded baseline tree ${baseline.slice(0, 12)} is not ` +
          "in this repository, so the change set cannot be measured. A round's " +
          "snapshot travels as a ref under refs/dabbler/rounds/, which a clone " +
          "fetches only when its refspec says so. Fetch them first, and let " +
          "bootstrap make that permanent:\n" +
          `  git fetch ${upstreamRemote(repoRoot)} '${ROUND_REFSPEC}'\n` +
          "  dabbler bootstrap --no-transport-detect\n" +
          "If the round was recorded before rounds were anchored, or its ref " +
          "was never pushed, re-anchor it onto a commit this history passed " +
          "through:\n" +
          '  dabbler verify reanchor --commit <sha> --reason ' +
          '"<why the recorded tree is unreachable>"\n',
      );
      return EXIT_USAGE;
    }
    writeErr("affected: could not determine the change set\n");
    return EXIT_USAGE;
  }

  const result = selectTests(repoRoot, changed, loaded.config);
  if (json) {
    writeOut(dumps(result.toDict(), { indent: 2 }) + "\n");
    return EXIT_OK;
  }

  // Which baseline produced this, always: a selection measured against HEAD
  // and one measured against the last round look identical as a list of files,
  // and only one of them is what verification will require.
  const lines: string[] = [`scope: ${baseline ? "the last round" : "HEAD"}\n`];
  const suites = loadSuitesChecked(config).suites.filter((suite) => suite.expensive);
  const commands = (): string => "\n" + runnableCommands(suites, result).join("\n") + "\n";

  if (result.allTestsAffected) {
    lines.push(`all tests affected: ${result.allAffectedReason}\n`, commands());
    writeOut(lines.join(""));
    return EXIT_OK;
  }
  for (const risk of result.risks) lines.push(`  RISK ${risk.kind}: ${risk.path}\n`);
  for (const choice of result.selected) {
    lines.push(`  ${pad(choice.reason, 22)} ${choice.path}  <- ${choice.selectedBy}\n`);
  }
  if (result.selected.length === 0) {
    lines.push("no tests affected by this change set\n");
    writeOut(lines.join(""));
    return EXIT_OK;
  }
  lines.push(commands());
  writeOut(lines.join(""));
  return EXIT_OK;
}
