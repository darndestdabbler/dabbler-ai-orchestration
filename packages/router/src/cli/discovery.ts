// `dabbler discovery` -- what currently exists, how old the evidence is, and
// where the roles and the records disagree.
//
// `status` and `drift` read; `enumerate` reads three vendor endpoints and
// writes the record. Only `enumerate` reaches a network, and only it can be
// refused: a session that changed its own verifier pool while running would
// have edited the conditions of its own review. Staleness never blocks
// anything -- a warning that turns into an outage is a warning people learn
// to suppress.

import { loadConfig } from "../config.ts";
import {
  ADAPTER_COUNT,
  checkFreshness,
  computeDrift,
  discoverySettings,
  emptyRecord,
  enumerateAll,
  formatDrift,
  freshnessMessage,
  isStale,
  loadRecord,
  mergeRecord,
  resolveRecordPath,
  resultOk,
  sessionsInFlight,
  writeRecord,
} from "../discovery.ts";
import { writeErr, writeOut } from "./output.ts";
import { existsSync } from "node:fs";

const EXIT_OK = 0;
const EXIT_USAGE = 2;
/** `enumerate` refused because a session is in flight. */
const EXIT_REFUSED = 2;

const COMMANDS = ["enumerate", "status", "drift"] as const;

function usage(): string {
  return [
    "usage: dabbler discovery [-h] {enumerate,status,drift} ...",
    "",
    "direct-API model discovery: enumeration, freshness, drift",
    "",
    "positional arguments:",
    "  {enumerate,status,drift}",
    "    enumerate           read each vendor's models endpoint and write the",
    "                        record",
    "    status              report both records' freshness",
    "    drift               the record-against-roles diff",
    "",
    "options:",
    "  -h, --help            show this help message and exit",
    "",
  ].join("\n");
}

function enumerateUsage(): string {
  return [
    "usage: dabbler discovery enumerate [-h] [--dry-run]",
    "",
    "options:",
    "  -h, --help  show this help message and exit",
    "  --dry-run   report what would be read and written, and call nothing",
    "",
  ].join("\n");
}

/** One freshness row as `status` and the dry run both print it. */
function freshnessLine(row: Parameters<typeof freshnessMessage>[0]): string {
  return `${isStale(row) ? "STALE" : "fresh"}  ${freshnessMessage(row)}`;
}

export async function discoveryVerb(argv: string[]): Promise<number> {
  const [subcommand, ...rest] = argv;
  if (subcommand === undefined || subcommand === "--help" || subcommand === "-h") {
    writeOut(usage());
    return subcommand === undefined ? EXIT_USAGE : EXIT_OK;
  }
  if (!(COMMANDS as readonly string[]).includes(subcommand)) {
    writeErr(
      `dabbler discovery: argument command: invalid choice: '${subcommand}' ` +
        `(choose from ${COMMANDS.map((name) => `'${name}'`).join(", ")})\n`,
    );
    return EXIT_USAGE;
  }

  let dryRun = false;
  for (const token of rest) {
    if (token === "-h" || token === "--help") {
      writeOut(subcommand === "enumerate" ? enumerateUsage() : usage());
      return EXIT_OK;
    }
    if (subcommand === "enumerate" && token === "--dry-run") {
      dryRun = true;
      continue;
    }
    writeErr(`dabbler discovery ${subcommand}: unrecognized arguments: ${token}\n`);
    return EXIT_USAGE;
  }

  const config = loadConfig();
  if (subcommand === "drift") {
    writeOut(formatDrift(computeDrift(config)) + "\n");
    return EXIT_OK;
  }
  if (subcommand === "status") {
    // Never blocks: a stale record with confirmed entries still verifies
    // correctly, and an outage here would only teach people to suppress it.
    for (const row of checkFreshness(config)) writeOut(freshnessLine(row) + "\n");
    return EXIT_OK;
  }
  return commandEnumerate(config, dryRun);
}

async function commandEnumerate(
  config: ReturnType<typeof loadConfig>,
  dryRun: boolean,
): Promise<number> {
  const inFlight = sessionsInFlight();
  if (inFlight.length > 0 && !dryRun) {
    writeErr(
      "enumerate: refused -- a session is in flight (" +
        inFlight.join("; ") +
        "). Discovery runs between sessions: a session that changes " +
        "its own verifier pool while running has edited the conditions " +
        "of its own review.\n",
    );
    return EXIT_REFUSED;
  }
  const path = resolveRecordPath(config);
  const current = existsSync(path)
    ? loadRecord(path)
    : emptyRecord(discoverySettings(config).key_set_id);
  if (dryRun) {
    writeOut(
      `enumerate: would read ${ADAPTER_COUNT} vendor endpoint(s) ` +
        `and write ${path}\n`,
    );
    for (const row of checkFreshness(config)) writeOut(`  ${freshnessLine(row)}\n`);
    return EXIT_OK;
  }
  const results = await enumerateAll(config);
  const merged = mergeRecord(current, results);
  writeRecord(path, merged);
  for (const result of results) {
    const detail = resultOk(result)
      ? `${result.entries.length} model(s)`
      : `FAILED (${String(result.error)}); prior entries kept`;
    writeOut(`  ${result.provider}: ${detail}\n`);
  }
  writeOut(
    `enumerate: ${merged.models.length} model(s) recorded in ${path}. ` +
      "No tokens were billed: a models endpoint is a metadata request.\n",
  );
  return EXIT_OK;
}
