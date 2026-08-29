// Which verbs the `dabbler` command can actually run.
//
// A verb is available when a handler is registered here, not when a
// constant says the port has reached its session. There is nothing to
// bump: porting a module adds its handler, and every reader -- the CLI,
// the parity control -- sees the same fact at the same moment.

import { affectedVerb } from "./affected.ts";
import { bootstrapVerb } from "./bootstrap.ts";
import { contractdocVerb } from "./contractdoc.ts";
import { copilotVerb } from "./copilot.ts";
import { discoveryVerb } from "./discovery.ts";
import { factsVerb } from "./facts.ts";
import { metricsVerb } from "./metrics.ts";
import { modulesVerb } from "./modules.ts";
import { packagingVerb } from "./packaging.ts";
import { progressVerb, statusVerb } from "./progress.ts";
import { seatCostVerb } from "./seatCost.ts";
import { sessionVerb } from "./session.ts";
import { solutionVerb } from "./solution.ts";
import { testEvidenceVerb } from "./testEvidence.ts";
import { verifyVerb } from "./verify.ts";
import { workflowVerb } from "./workflow.ts";

/** argv after the verb; the process's exit code comes back. */
export type VerbHandler = (argv: string[]) => Promise<number>;

/**
 * `VERBS` in `../contracts/verbs.ts` is the full list; a verb declared
 * there and absent here is announced and refused, which is what "not yet"
 * looks like from a command line.
 */
export const HANDLERS: Readonly<Record<string, VerbHandler>> = {
  affected: affectedVerb,
  bootstrap: bootstrapVerb,
  contractdoc: contractdocVerb,
  copilot: copilotVerb,
  discovery: discoveryVerb,
  facts: factsVerb,
  metrics: metricsVerb,
  modules: modulesVerb,
  packaging: packagingVerb,
  progress: progressVerb,
  "seat-cost": seatCostVerb,
  session: sessionVerb,
  solution: solutionVerb,
  status: statusVerb,
  "test-evidence": testEvidenceVerb,
  verify: verifyVerb,
  workflow: workflowVerb,
};

export function isImplemented(verb: string): boolean {
  return Object.prototype.hasOwnProperty.call(HANDLERS, verb);
}
