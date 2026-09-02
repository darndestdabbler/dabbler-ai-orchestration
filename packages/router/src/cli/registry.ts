// Which verbs the `dabbler` command can actually run.
//
// It is the second half of `contracts/verbs.ts`: the table says what the
// command offers and this says what answers. `contracts.test.ts` holds the
// two to each other in both directions, so a verb cannot be advertised
// without a handler or reachable without being listed.

import { affectedVerb } from "./affected.ts";
import { bootstrapVerb } from "./bootstrap.ts";
import { contractdocVerb } from "./contractdoc.ts";
import { copilotVerb } from "./copilot.ts";
import { depsVerb } from "./deps.ts";
import { workspaceVerb } from "./workspace.ts";
import { releaseVerb } from "./release.ts";
import { discoveryVerb } from "./discovery.ts";
import { factsVerb } from "./facts.ts";
import { metricsVerb } from "./metrics.ts";
import { modulesVerb } from "./modules.ts";
import { owedVerb } from "./owed.ts";
import { packagingVerb } from "./packaging.ts";
import { statusVerb } from "./status.ts";
import { seatCostVerb } from "./seatCost.ts";
import { sessionVerb } from "./session.ts";
import { solutionVerb } from "./solution.ts";
import { testEvidenceVerb } from "./testEvidence.ts";
import { triageVerb } from "./triage.ts";
import { verifyVerb } from "./verify.ts";
import { workflowVerb } from "./workflow.ts";

/** argv after the verb; the process's exit code comes back. */
export type VerbHandler = (argv: string[]) => Promise<number>;

export const HANDLERS: Readonly<Record<string, VerbHandler>> = {
  affected: affectedVerb,
  bootstrap: bootstrapVerb,
  contractdoc: contractdocVerb,
  copilot: copilotVerb,
  deps: depsVerb,
  workspace: workspaceVerb,
  release: releaseVerb,
  discovery: discoveryVerb,
  facts: factsVerb,
  metrics: metricsVerb,
  modules: modulesVerb,
  owed: owedVerb,
  packaging: packagingVerb,
  "seat-cost": seatCostVerb,
  session: sessionVerb,
  solution: solutionVerb,
  status: statusVerb,
  "test-evidence": testEvidenceVerb,
  triage: triageVerb,
  verify: verifyVerb,
  workflow: workflowVerb,
};
