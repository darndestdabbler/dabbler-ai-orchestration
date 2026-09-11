// Which verbs the `dabbler` command can actually run.
//
// It is the second half of `contracts/verbs.ts`: the table says what the
// command offers and this says what answers. `contracts.test.ts` holds the
// two to each other in both directions, so a verb cannot be advertised
// without a handler or reachable without being listed.

import { affectedVerb } from "./affected.ts";
import { agentVerb } from "./agent.ts";
import { bootstrapVerb } from "./bootstrap.ts";
import { configureVerb } from "./configure.ts";
import { contractdocVerb } from "./contractdoc.ts";
import { copilotVerb } from "./copilot.ts";
import { depsVerb } from "./deps.ts";
import { workspaceVerb } from "./workspace.ts";
import { releaseVerb } from "./release.ts";
import { discoveryVerb } from "./discovery.ts";
import { factsVerb } from "./facts.ts";
import { metricsVerb } from "./metrics.ts";
import { moduleVerb } from "./module.ts";
import { modulesVerb } from "./modules.ts";
import { owedVerb } from "./owed.ts";
import { packagingVerb } from "./packaging.ts";
import { repoVerb } from "./repo.ts";
import { statusVerb } from "./status.ts";
import { seatCostVerb } from "./seatCost.ts";
import { sessionVerb } from "./session.ts";
import { testEvidenceVerb } from "./testEvidence.ts";
import { triageVerb } from "./triage.ts";
import { verifyVerb } from "./verify.ts";
import { versionVerb } from "./version.ts";

/** argv after the verb; the process's exit code comes back. */
export type VerbHandler = (argv: string[]) => Promise<number>;

export const HANDLERS: Readonly<Record<string, VerbHandler>> = {
  affected: affectedVerb,
  agent: agentVerb,
  bootstrap: bootstrapVerb,
  configure: configureVerb,
  contractdoc: contractdocVerb,
  copilot: copilotVerb,
  deps: depsVerb,
  workspace: workspaceVerb,
  release: releaseVerb,
  discovery: discoveryVerb,
  facts: factsVerb,
  metrics: metricsVerb,
  module: moduleVerb,
  modules: modulesVerb,
  owed: owedVerb,
  packaging: packagingVerb,
  repo: repoVerb,
  "seat-cost": seatCostVerb,
  session: sessionVerb,
  status: statusVerb,
  "test-evidence": testEvidenceVerb,
  triage: triageVerb,
  verify: verifyVerb,
  version: versionVerb,
};
