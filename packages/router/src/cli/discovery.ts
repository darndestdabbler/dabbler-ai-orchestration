// `dabbler discovery` -- what currently exists, how old the evidence is, and
// where the roles and the records disagree.
//
// `status` and `drift` read; `refresh` re-reads every transport this
// machine has and writes the catalog. Only `refresh` reaches a vendor or a
// seat, and only it can be refused: a session that changed its own verifier
// pool while running would have edited the conditions of its own review.
// Staleness never blocks anything -- a warning that turns into an outage is
// a warning people learn to suppress.

import { currentCatalogPath } from "../catalog.ts";
import { loadConfig } from "../config.ts";
import {
  ADAPTER_COUNT,
  checkFreshness,
  computeDrift,
  formatDrift,
  freshnessMessage,
  isStale,
  refreshCatalog,
  sessionsInFlight,
} from "../discovery.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;
/** `refresh` refused because a session is in flight. */
const EXIT_REFUSED = 2;

const COMMANDS = ["refresh", "status", "drift"] as const;

function usage(): string {
  return [
    "usage: dabbler discovery [-h] {refresh,status,drift} ...",
    "",
    "the model catalog: what exists, how old the reading is, and drift",
    "",
    "positional arguments:",
    "  {refresh,status,drift}",
    "    refresh             re-read every transport this machine has and",
    "                        write the catalog",
    "    status              report how old the catalog is",
    "    drift               the record-against-roles diff",
    "",
    "options:",
    "  -h, --help            show this help message and exit",
    "",
  ].join("\n");
}

function refreshUsage(): string {
  return [
    "usage: dabbler discovery refresh [-h] [--dry-run]",
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
      writeOut(subcommand === "refresh" ? refreshUsage() : usage());
      return EXIT_OK;
    }
    if (subcommand === "refresh" && token === "--dry-run") {
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
  return commandRefresh(config, dryRun);
}

async function commandRefresh(
  config: ReturnType<typeof loadConfig>,
  dryRun: boolean,
): Promise<number> {
  const inFlight = sessionsInFlight();
  if (inFlight.length > 0 && !dryRun) {
    writeErr(
      "refresh: refused -- a session is in flight (" +
        inFlight.join("; ") +
        "). Discovery runs between sessions: a session that changes " +
        "its own verifier pool while running has edited the conditions " +
        "of its own review.\n",
    );
    return EXIT_REFUSED;
  }
  const path = currentCatalogPath();
  if (dryRun) {
    writeOut(
      `refresh: would read ${ADAPTER_COUNT} vendor endpoint(s) ` +
        `and write ${path}\n`,
    );
    for (const row of checkFreshness(config)) writeOut(`  ${freshnessLine(row)}\n`);
    return EXIT_OK;
  }
  for (const line of await refreshCatalog(config)) writeOut(`  ${line}\n`);
  writeOut(
    `refresh: the catalog at ${path} has been re-read for every transport ` +
      "this machine has. No tokens were billed: a models endpoint is a " +
      "metadata request, and a seat states its own list in a protocol reply.\n",
  );
  return EXIT_OK;
}
