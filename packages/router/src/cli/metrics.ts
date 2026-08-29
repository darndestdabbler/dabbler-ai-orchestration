// `dabbler metrics` -- the per-call telemetry summary.
//
// The first verb the port makes real. It takes no options, because the
// Python command it replaces takes none: `python -m ai_router.metrics`
// loads the config and prints the report. An argument here would be a verb
// the two routers do not share.

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
