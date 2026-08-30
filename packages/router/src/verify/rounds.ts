// One verification round, and the two terminal states a capped session can
// end in.
//
// Round 1 evidence is the full session: spec excerpt, `git status`, the
// complete diff, and untracked file contents. Rounds >=2 see only the
// fix-delta -- a tree-to-tree diff from the previous round's recorded
// snapshot -- plus the prior rounds' unresolved findings, so a verifier
// reviews the remediation instead of re-reviewing the world.
//
// The verifier is picked by `route` under a hard provider exclusion: the
// orchestrator's effective provider (derived by `identity`, never trusted
// from a label) is excluded, so verification is always cross-provider, on
// either transport. One retry excludes a failed provider too; when nothing
// survives, the close stays blocked and only the operator can resolve it.
//
// No round opens on unproved work. The tests a change makes necessary cost
// nothing next to a model, so they run first: a round is refused until an
// accepted `preverify-targeted` record exists for the surfaces as they
// currently stand. The same economy governs the declared controls: `facts`
// settles compile, typecheck, lint and analyzer before dispatch, and a red
// required one returns to the author instead of being bought a verifier's
// opinion.

import {
  applyWrites,
  grantForTransport,
  recordForRound,
  recordRow,
  sessionScope,
  summaryLine,
  DEFAULT_READ_BUDGET,
  type AgencyGrant,
} from "../agency.ts";
import {
  loadSelectionConfig,
  preverifyGate,
  preverifyRecipe,
  remediationRecipe,
  workingTreeChanges,
  type PreverifyGate,
} from "../affected.ts";
import { writeErr, writeOut } from "../cli/output.ts";
import {
  loadConfig,
  resolveTransport,
  verificationRoundCap,
  type RouterConfig,
} from "../config.ts";
import {
  changedPathsBetween,
  repoRootFor,
  runGit,
  snapshotWorktreeTree,
} from "../evidence.ts";
import {
  EvidenceEmptyError,
  EvidenceTooLargeError,
  FactsError,
  appendFacts,
  assembleEvidence,
  assembleFixDeltaEvidence,
  collectFacts,
  redFactsRefusal,
} from "../facts.ts";
import {
  IdentityResolutionError,
  resolveSessionOrchestratorIdentity,
  type OrchestratorIdentity,
} from "../identity.ts";
import { nowIso } from "../journal.ts";
import {
  ROW_REMEDIATED_AT_CAP,
  TERMINAL_ROW_TYPES,
  appendRound,
  effectiveBaseline,
  readDisputes,
  readRounds,
  saveRawOutput,
  type Row,
} from "../ledger.ts";
import { readSessionState } from "../progress.ts";
import { NoCandidateError, RouterError, type RouteResult } from "../route.ts";
import {
  VERDICT_REMEDIATED_AT_CAP,
  classifyBlocking,
  normalizeSeverity,
  type Finding,
  parseVerificationResponse,
  unremediatedFindings,
} from "../verdict.ts";
import { buildVerificationPrompt } from "../verifyjob.ts";
import { appendChangeLogBlock, recordSessionVerification } from "../writers.ts";
import {
  EXIT_BLOCKING,
  EXIT_CALL_FAILED,
  EXIT_OK,
  EXIT_STATE,
  EXIT_UNAVAILABLE,
  EXIT_USAGE,
  VerifyError,
} from "./errors.ts";
import { buildTaskBlock, sliceCodePoints } from "./prompts.ts";
import { undisputedBlockingIndices } from "./disputes.ts";

/**
 * Two attempts, one exclusion accumulator: a fallback can never re-cross the
 * caller's constraint. `NoCandidateError` propagates -- that is the
 * operator-only "verification unavailable" state.
 */
export async function dispatchVerification(
  prompt: string,
  options: {
    excludeProviders: readonly string[];
    sessionNumber: number | null;
    transport?: string | null;
  },
): Promise<RouteResult> {
  const { DispatchError, route } = await import("../route.ts");
  const { ROLE_VERIFIER } = await import("../selection.ts");

  const excluded = [...options.excludeProviders];
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await route(prompt, {
        taskType: "session-verification",
        role: ROLE_VERIFIER,
        sessionNumber: options.sessionNumber,
        excludeProviders: excluded,
        transport: options.transport ?? null,
      });
    } catch (error) {
      if (!(error instanceof DispatchError)) throw error;
      lastError = error;
      const failed = error.provider;
      if (attempt === 0 && failed && !excluded.includes(failed)) {
        excluded.push(failed);
        continue;
      }
      throw error;
    }
  }
  throw lastError; // unreachable; defensive
}

export function blockingFindings(row: Row): Row[] {
  const findings = Array.isArray(row["findings"]) ? (row["findings"] as Row[]) : [];
  return findings.filter((finding) => finding["blocking"] !== false);
}

/**
 * The close is two steps away from a verified tree, and this names them. A
 * malformed or suite-less config says nothing rather than guessing a
 * command: a wrong command here is what the message exists to prevent.
 */
export async function runOfRecordLines(
  sessionsDir: string,
  config: RouterConfig,
): Promise<string> {
  const { loadSuitesChecked, runOfRecordRecipe } = await import("../testEvidence.ts");

  const loaded = loadSuitesChecked(config);
  const suite = loaded.suites.find((entry) => entry.expensive);
  if (loaded.errors.length > 0 || suite === undefined) {
    return (
      "The run of record and the push remain before " +
      "`dabbler session close`."
    );
  }
  return runOfRecordRecipe(sessionsDir, suite.name, suite.command);
}

function preverifyRefusalTail(sessionsDir: string, gate: PreverifyGate): string {
  return gate.command
    ? preverifyRecipe(sessionsDir, gate.suite, gate.command)
    : "There is no targeted command to offer you: declare the " +
        "missing mapping under testing.selection so the selector can " +
        "answer for these paths.";
}

/**
 * The cap is reached, so no further round opens. Which of the two
 * cap-terminal states this is is decided from the record, never asked of
 * anyone.
 *
 * A contested finding still goes to adjudication first: consensus precedes
 * termination, and a dispute says the finding is wrong rather than fixed.
 * Otherwise the tree answers it -- a tree that moved since the reviewed
 * round carries the repair, and one that did not carries nothing. The repair
 * must also have passed its own targeted tests, which is the same bar a
 * round would have had to clear.
 */
export async function terminateAtCap(
  repoRoot: string,
  sessionsDir: string,
  config: RouterConfig,
  current: number,
  priorRounds: readonly Row[],
  cap: number,
): Promise<number> {
  const latest = priorRounds[priorRounds.length - 1] as Row;
  if (!latest["blocking"]) {
    writeErr(
      `verify: refused -- round ${String(latest["round"])} left no blocking ` +
        `finding and the cap (${cap}) is reached; there is nothing ` +
        "left to verify. Close the session:\n" +
        `  dabbler session close --sessions-dir ` +
        `${sessionsDir}\n`,
    );
    return EXIT_USAGE;
  }

  const disputes = readDisputes(repoRoot, current);
  if (
    undisputedBlockingIndices(latest, disputes).length <
    blockingFindings(latest).length
  ) {
    writeErr(
      `verify: refused -- the cap (${cap}) is reached and round ` +
        `${String(latest["round"])} carries disputed blocking finding(s). A ` +
        "dispute says a finding is wrong, not that it was fixed, so it " +
        "is judged rather than terminated. Route the disputes to a " +
        "third provider:\n" +
        `  dabbler verify adjudicate --sessions-dir ` +
        `${sessionsDir}\n`,
    );
    return EXIT_USAGE;
  }

  const unreviewed = blockingFindings(latest);
  const completionTree = snapshotWorktreeTree(repoRoot);
  if (completionTree === null) {
    writeErr(
      "verify: could not snapshot the working tree; nothing recorded " +
        "(failing closed).\n",
    );
    return EXIT_CALL_FAILED;
  }

  const fixPaths = changedPathsBetween(
    repoRoot,
    String(latest["completion_tree"]),
    completionTree,
  );
  if (fixPaths === null) {
    writeErr(
      "verify: could not diff the working tree against round " +
        `${String(latest["round"])}; nothing recorded (failing closed).\n`,
    );
    return EXIT_CALL_FAILED;
  }
  const unshown = unremediatedFindings(unreviewed as Finding[], fixPaths) as Row[];
  if (unshown.length > 0 || unreviewed.length === 0) {
    const shown = unshown.length > 0 ? unshown : unreviewed;
    const listing = shown
      .map(
        (finding) =>
          `  - [${String(finding["severity"])}] ` +
          `${sliceCodePoints(String(finding["description"] ?? ""), 160)}\n` +
          `    cited: ` +
          (((finding["evidencePaths"] as string[]) ?? []).join(", ") ||
            "(no path cited)") +
          "\n",
      )
      .join("");
    const count = unshown.length || unreviewed.length;
    writeErr(
      `verify: UNRESOLVED -- the cap (${cap}) is reached and ` +
        `${count} blocking finding(s) from ` +
        `round ${String(latest["round"])} cannot be shown remediated:\n` +
        `${listing}` +
        "REMEDIATED AT THE CAP lands work no verifier reviewed, so it " +
        "is granted only when the fix delta touches a path each " +
        "finding itself cited. A changed tree is not that: it says " +
        "something moved, not that this finding was answered. Nothing " +
        "lands but the record; the close stays BLOCKED and these " +
        "findings are read at the next planning session.\n",
    );
    return EXIT_BLOCKING;
  }

  const gate = preverifyGate(repoRoot, sessionsDir, config);
  if (!gate.ok) {
    writeErr(
      "verify: refused -- the fix has no valid targeted selection " +
        `evidence for this tree: ${gate.reason}.\n` +
        "REMEDIATED AT THE CAP lands work no verifier reviewed, so the " +
        "one thing it does prove is that the repair passed the tests " +
        "it makes necessary. Run them first:\n" +
        `${preverifyRefusalTail(sessionsDir, gate)}\n`,
    );
    return EXIT_BLOCKING;
  }

  const row: Row = {
    round: Number(latest["round"]) + 1,
    type: ROW_REMEDIATED_AT_CAP,
    verdict: VERDICT_REMEDIATED_AT_CAP,
    blocking: false,
    findings: [],
    remediated: {
      reviewed_round: latest["round"],
      findings: unreviewed,
      fix_paths: [...fixPaths].sort(),
    },
    completion_tree: completionTree,
    previous_tree: latest["completion_tree"],
    recorded_at: nowIso("microseconds"),
  };
  appendRound(repoRoot, current, row);
  recordSessionVerification(sessionsDir, current, VERDICT_REMEDIATED_AT_CAP, {
    rounds: latest["round"],
    verifierModel: latest["verifier_model"] ?? null,
    verifierProvider: latest["verifier_provider"] ?? null,
    transport: latest["transport"] ?? null,
    unreviewedFindings: unreviewed.length,
  });
  const findingLines = unreviewed
    .map(
      (finding) =>
        `- Fixed, unreviewed: [${String(finding["severity"])}] ` +
        `${sliceCodePoints(String(finding["description"] ?? ""), 200)}\n`,
    )
    .join("");
  appendChangeLogBlock(
    sessionsDir,
    `## Session ${current} verification — REMEDIATED AT THE CAP after ` +
      `${cap} round(s)\n\n` +
      `- Every blocking finding of round ${String(latest["round"])} was fixed; ` +
      "the cap left the fix unreviewed.\n" +
      `${findingLines}` +
      "- This work lands UNREVIEWED. It is not a waiver: nothing was " +
      "accepted over a standing finding — what is unproved is the " +
      "repair.\n",
  );
  writeOut(
    `verify: REMEDIATED AT THE CAP -- the ${unreviewed.length} blocking ` +
      `finding(s) of round ${String(latest["round"])} were fixed and the cap ` +
      `(${cap}) left the fix unreviewed. The work lands labelled ` +
      "UNREVIEWED; no verifier saw the repair.\n" +
      (await runOfRecordLines(sessionsDir, config)) +
      "\n",
  );
  return EXIT_OK;
}

/** The commit HEAD stands at, or null. */
export function headCommit(repoRoot: string): string | null {
  const result = runGit(repoRoot, ["rev-parse", "--verify", "HEAD"]);
  return result.code === 0 && result.stdout ? result.stdout : null;
}

export interface RoundOptions {
  readonly maxRounds?: number | null;
  readonly transport?: string | null;
}

/**
 * One verification round: assemble evidence, dispatch cross-provider, record
 * the outcome. Returns a CLI exit code; re-invoking after remediation
 * continues the loop automatically. `transport` overrides the resolved
 * transport preference for this round's dispatch.
 *
 * A round never opens on unproved work: the affected tests come first, and a
 * full-suite run is not a substitute for them.
 */
export async function runRound(
  sessionsDir: string,
  options: RoundOptions = {},
): Promise<number> {
  const repoRoot = repoRootFor(sessionsDir);
  if (repoRoot === null) {
    writeErr(`verify: not inside a git repository: ${sessionsDir}\n`);
    return EXIT_STATE;
  }
  const state = readSessionState(sessionsDir);
  const current = (state ?? {})["currentSession"] as number | null | undefined;
  if (current === null || current === undefined) {
    writeErr(
      `verify: no session is in flight under ${sessionsDir}; run ` +
        "start_session first.\n",
    );
    return EXIT_STATE;
  }

  let orchestrator: OrchestratorIdentity;
  try {
    orchestrator = resolveSessionOrchestratorIdentity(sessionsDir, current);
  } catch (error) {
    if (!(error instanceof IdentityResolutionError)) throw error;
    writeErr(`verify: ${error.message}\n`);
    return EXIT_STATE;
  }

  const config = loadConfig();
  const cap = options.maxRounds || verificationRoundCap(config);
  const priorRounds = readRounds(repoRoot, current);
  if (priorRounds.some((row) => row["type"] === "adjudication")) {
    writeErr(
      `verify: refused -- session ${current} already carries its ` +
        "adjudication row. Adjudication is terminal: one per session, " +
        "ever, and no further verification rounds may open after it.\n",
    );
    return EXIT_USAGE;
  }
  const terminal = priorRounds.find((row) =>
    TERMINAL_ROW_TYPES.has(String(row["type"])),
  );
  if (terminal !== undefined) {
    writeErr(
      `verify: refused -- session ${current} already carries its ` +
        `terminal '${String(terminal["type"])}' row ` +
        `(${String(terminal["verdict"])}); no further verification round ` +
        "may open after it. Close the session:\n" +
        `  dabbler session close --sessions-dir ` +
        `${sessionsDir}\n`,
    );
    return EXIT_USAGE;
  }
  const roundNumber =
    priorRounds.length > 0
      ? Number((priorRounds[priorRounds.length - 1] as Row)["round"]) + 1
      : 1;
  if (roundNumber > cap) {
    return terminateAtCap(repoRoot, sessionsDir, config, current, priorRounds, cap);
  }

  let evidence: string;
  try {
    if (roundNumber === 1) {
      evidence = assembleEvidence(repoRoot, sessionsDir, current);
    } else {
      const baseline = String(
        effectiveBaseline(
          repoRoot,
          current,
          priorRounds[priorRounds.length - 1] as Row,
        ),
      );
      evidence = assembleFixDeltaEvidence(
        repoRoot,
        sessionsDir,
        current,
        baseline,
      );
    }
  } catch (error) {
    if (
      error instanceof EvidenceEmptyError ||
      error instanceof EvidenceTooLargeError ||
      error instanceof FactsError ||
      error instanceof VerifyError
    ) {
      writeErr(`verify: ${error.message}\n`);
      return EXIT_UNAVAILABLE;
    }
    throw error;
  }

  // After the bundle exists and before any model sees it: there is something
  // to review, so the tests that review costs nothing must have run first.
  const gate = preverifyGate(repoRoot, sessionsDir, config);
  if (!gate.ok) {
    writeErr(
      "verify: refused -- no valid targeted selection evidence for " +
        `this tree: ${gate.reason}.\n` +
        "Verification is not the first thing a change meets; the tests " +
        "the change affects are. The full suite is neither required nor " +
        "accepted here -- it is the run of record, and it comes AFTER " +
        `the final verified tree.\n${preverifyRefusalTail(sessionsDir, gate)}\n` +
        "`dabbler affected` prints the selection and the " +
        "reason behind each row.\n",
    );
    return EXIT_USAGE;
  }

  // Still before any model sees the bundle: everything the machine can
  // settle by itself, settled. A red required control is the author's to
  // fix, and a verification round spent rediscovering it buys nothing the
  // exit code already said.
  const facts = await collectFacts(repoRoot, sessionsDir, config, {
    gate,
    roundNumber,
    sessionNumber: current,
  });
  appendFacts(repoRoot, facts);
  const refusal = redFactsRefusal(facts);
  if (refusal) {
    writeErr(`${refusal}\n`);
    return EXIT_USAGE;
  }

  const disputes = readDisputes(repoRoot, current);
  const scope = sessionScope(
    repoRoot,
    sessionsDir,
    workingTreeChanges(
      repoRoot,
      roundNumber === 1
        ? null
        : String(
            effectiveBaseline(
              repoRoot,
              current,
              priorRounds[priorRounds.length - 1] as Row,
            ),
          ),
    ) ?? [],
  );
  const verificationSettings = settingsBlock(config);
  const readBudget =
    (verificationSettings["read_budget"] as number | undefined) ||
    DEFAULT_READ_BUDGET;
  const selection = loadSelectionConfig(config).config;

  // A code review round grants no write. The tests phase of spec 3.c.ii is
  // where the verifier authors tests, and a surface offered in every round
  // is a surface used in every round -- a review that quietly edits the tree
  // it is reviewing is not a review.
  const grantFor = (forTransport: string): AgencyGrant =>
    grantForTransport(forTransport, {
      scope,
      readBudget,
      testScopes: selection.scopes,
      allowWrite: false,
    });

  const grant = grantFor(resolveTransport(config, options.transport ?? null));

  const promptBody = buildVerificationPrompt(
    String(config["_verification_template"] ?? ""),
    buildTaskBlock(
      sessionsDir,
      current,
      roundNumber,
      priorRounds,
      disputes,
      repoRoot,
      grant,
    ),
    "session-verification",
    evidence,
  );

  const exclude = [orchestrator.effectiveProvider];
  let result: RouteResult;
  try {
    result = await dispatchVerification(promptBody, {
      excludeProviders: exclude,
      sessionNumber: current,
      transport: options.transport ?? null,
    });
  } catch (error) {
    if (error instanceof NoCandidateError) {
      writeErr(
        "verify: VERIFICATION UNAVAILABLE -- no eligible verifier " +
          "exists outside the orchestrator's effective provider " +
          `(${orchestrator.effectiveProvider}). Reason: ${error.message}\n` +
          "No verdict was written; the close stays BLOCKED. This state " +
          "is resolvable only by the operator (never the engine).\n" +
          "Operator exit: enable a model from another provider in " +
          "router-config.yaml (or set its API key env var), then " +
          "re-run:\n" +
          `  dabbler verify --sessions-dir ${sessionsDir}\n`,
      );
      return EXIT_UNAVAILABLE;
    }
    if (error instanceof RouterError) {
      writeErr(
        `verify: routed verification call failed: ${error.message}\n` +
          "Nothing was written. Retry once; if the second provider also " +
          "fails, escalate to the operator.\n",
      );
      return EXIT_CALL_FAILED;
    }
    throw error;
  }

  if (result.truncated) {
    writeErr(
      "verify: the verifier response is truncated — invalid " +
        "evidence; nothing was written.\n",
    );
    return EXIT_UNAVAILABLE;
  }

  // Raw output first, before any parsing or display.
  const rawPath = saveRawOutput(repoRoot, current, roundNumber, result.content);

  const [verdict, issues] = parseVerificationResponse(result.content);
  const classification = classifyBlocking(verdict, issues);
  const findings: Row[] = issues.map((issue) => ({
    description: sliceCodePoints(String(issue.description ?? ""), 2000),
    severity: normalizeSeverity(issue.severity),
  }));
  // Carry the optional fields without inventing values.
  issues.forEach((issue, index) => {
    const finding = findings[index] as Row;
    if (issue.category) {
      finding["category"] = sliceCodePoints(String(issue.category), 1000);
    }
    if (issue.failureScenario) {
      finding["failureScenario"] = sliceCodePoints(
        String(issue.failureScenario),
        1000,
      );
    }
    if (issue.evidencePaths && issue.evidencePaths.length > 0) {
      finding["evidencePaths"] = [...issue.evidencePaths].slice(0, 20);
    }
    finding["blocking"] = classification.blockingIssues.includes(issue);
    finding["section"] = issue.section === "nits" ? "nits" : "body";
  });

  const completionTree = snapshotWorktreeTree(repoRoot);
  if (completionTree === null) {
    writeErr("verify: could not snapshot the working tree; nothing recorded.\n");
    return EXIT_CALL_FAILED;
  }

  // The grant was predicted from the resolved preference; the record is
  // built from the transport the round actually ran on, because a round that
  // fell back to the API path could not look however it was briefed.
  //
  // Proposals are read on every round, including the ones that grant no
  // write: a boundary that silently ignores what it turns away leaves no
  // evidence it was ever crossed.
  const actualGrant = grantFor(result.transport);
  const writes = applyWrites(repoRoot, actualGrant, result.content);
  const agencyRecord = recordForRound(
    repoRoot,
    actualGrant,
    result.metadata,
    writes,
  );

  const row: Row = {
    round: roundNumber,
    phase: roundNumber === 1 ? "full" : "fix-delta",
    verdict,
    blocking: classification.blocking,
    verifier_model: result.model_name,
    verifier_provider: result.provider,
    orchestrator_provider: orchestrator.effectiveProvider,
    findings,
    completion_tree: completionTree,
    head_commit: headCommit(repoRoot),
    recorded_at: nowIso("microseconds"),
    transport: result.transport,
    agency: recordRow(agencyRecord),
  };
  if (roundNumber >= 2) {
    // previous_tree stays the tree the prior round actually completed at.
    // When that object is gone and a re-anchor supplied the diff base, the
    // row says so: a reader must not have to infer that this round was
    // measured from somewhere other than where the last one ended.
    const previous = priorRounds[priorRounds.length - 1] as Row;
    row["previous_tree"] = previous["completion_tree"];
    const recovered = effectiveBaseline(repoRoot, current, previous);
    if (recovered !== previous["completion_tree"]) {
      row["baseline_reanchor"] = {
        recorded_tree: previous["completion_tree"],
        anchor_tree: recovered,
      };
    }
  }
  appendRound(repoRoot, current, row);

  if (classification.blocking) {
    writeOut(
      `verify: round ${roundNumber} — ${verdict} with ` +
        `${classification.blockingIssues.length} blocking finding(s) ` +
        `(verifier ${result.model_name}/${result.provider}). Raw output: ` +
        `${rawPath}\n` +
        `${summaryLine(agencyRecord)}\n` +
        remediationRecipe(sessionsDir, gate.suite) +
        "\n",
    );
    return EXIT_BLOCKING;
  }

  // Loop finished: stamp the session record and the change-log summary.
  recordSessionVerification(sessionsDir, current, verdict, {
    rounds: roundNumber,
    verifierModel: result.model_name,
    verifierProvider: result.provider,
    transport: result.transport,
  });
  appendChangeLogBlock(
    sessionsDir,
    `## Session ${current} verification — ${verdict} after ` +
      `${roundNumber} round(s)\n\n` +
      `- Verifier: ${result.model_name} (${result.provider}) over ` +
      `${result.transport}\n` +
      `- Orchestrator provider (excluded): ` +
      `${orchestrator.effectiveProvider}\n` +
      `- Verifier's read surface: ${summaryLine(agencyRecord)}\n` +
      `- Raw round output: \`.dabbler/runs/s${current}/\`\n`,
  );
  writeOut(
    `verify: round ${roundNumber} — ${verdict} ` +
      `(verifier ${result.model_name}/${result.provider}); ` +
      `session ${current} is verified.\n` +
      (await runOfRecordLines(sessionsDir, config)) +
      "\n",
  );
  return EXIT_OK;
}

function settingsBlock(config: RouterConfig): Record<string, unknown> {
  const verification = config["verification"];
  if (verification === null || typeof verification !== "object") return {};
  const settings = (verification as Record<string, unknown>)["settings"];
  if (settings === null || typeof settings !== "object") return {};
  return settings as Record<string, unknown>;
}
