// `dabbler facts` -- what the machine knows about this change already.
//
// Read-only: it runs the declared controls and folds the change set, and
// writes nothing. The appending writer is `verify`'s, because the record is
// a round's, not a reader's.

import { loadConfig } from "../config.ts";
import { repoRootFor, resolveSessionsDir } from "../evidence.ts";
import { type FactRecord, STATUS_FAIL, STATUS_UNKNOWN, collectFacts, factRecordToDict } from "../facts.ts";
import { dumps } from "../pythonJson.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;

function usage(): string {
  return [
    "usage: dabbler facts [-h] [--sessions-dir SESSIONS_DIR] [--json]",
    "",
    "what the machine knows about this change already",
    "",
    "options:",
    "  -h, --help            show this help message and exit",
    "  --sessions-dir SESSIONS_DIR",
    "                        the repository's sessions root; derived from the",
    "                        working directory when omitted",
    "  --json",
    "",
  ].join("\n");
}

export async function factsVerb(argv: string[]): Promise<number> {
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
        writeErr(`dabbler facts: argument ${token}: expected one argument\n`);
        return EXIT_USAGE;
      }
      sessionsDirArg = next;
      index += 1;
      continue;
    }
    writeErr(`dabbler facts: unrecognized arguments: ${token}\n\n${usage()}`);
    return EXIT_USAGE;
  }

  const repoRoot = repoRootFor(".");
  if (repoRoot === null) {
    writeErr("facts: no git repository here\n");
    return EXIT_USAGE;
  }
  const record = await collectFacts(
    repoRoot,
    resolveSessionsDir(sessionsDirArg ?? null, repoRoot),
    loadConfig(),
  );
  if (json) {
    writeOut(dumps(factRecordToDict(record), { indent: 2, sortKeys: true }) + "\n");
    return EXIT_OK;
  }
  writeOut(renderFacts(record));
  for (const error of record.errors) {
    writeErr(`  DECLARATION ERROR ${error}\n`);
  }
  return EXIT_OK;
}

/**
 * The record as a person reads it: one row per control, and under a red or
 * unknown one its detail, which is the reason -- a `contract fail` row alone
 * says that a target moved and not which, or where.
 */
export function renderFacts(record: FactRecord): string {
  const rows: string[] = [];
  for (const fact of record.controls) {
    rows.push(`  ${fact.kind.padEnd(10)} ${fact.status.padEnd(15)} ${fact.command}`);
    if (fact.status === STATUS_FAIL || fact.status === STATUS_UNKNOWN) {
      rows.push(...fact.detail.split("\n").filter((line) => line.trim() !== "").map((line) => `      ${line}`));
    }
  }
  if (record.changed === null) {
    rows.push("  changed lines: the change set could not be determined");
  } else {
    const total = Object.values(record.changed).reduce((sum, lines) => sum + lines.length, 0);
    rows.push(`  changed lines: ${total} added across ${Object.keys(record.changed).length} file(s)`);
  }
  return rows.join("\n") + "\n";
}
