// `dabbler metrics` -- the per-call telemetry summary.
//
// It takes no options: the verb loads the config and prints the report,
// and there is nothing to narrow that the report does not already carry a
// column for.

import { loadConfig } from "../config.ts";
import { printMetricsReport } from "../metrics.ts";
import { EXIT_OK } from "../contracts/router.ts";
import { writeErr } from "./output.ts";

const EXIT_USAGE = 2;

export async function metricsVerb(argv: string[]): Promise<number> {
  if (argv.length > 0) {
    writeErr(`dabbler metrics: takes no arguments, got ${argv.join(" ")}\n`);
    return EXIT_USAGE;
  }
  printMetricsReport(loadConfig());
  return EXIT_OK;
}
