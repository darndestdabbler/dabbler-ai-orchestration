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
// either transport. A call that fails to be delivered is retried against
// the SAME reviewer -- the one the operator chose -- and only a failure
// that repeats ends the attempt; when no reviewer survives the authoring
// exclusion at all, the close stays blocked and only the operator can
// resolve it.
//
// What a round requires of the tree is what the round itself does: the
// verifier's authored tests run inside it, and the complete suite remains
// the run of record after the final verified tree. The declared controls
// still run first -- `facts` settles compile, typecheck, lint and analyzer
// before dispatch, and a red required one returns to the author instead of
// being bought a verifier's opinion.
import {
  applyWrites,
  deliverFileRequests,
  grantForTransport,
  recordForRound,
  recordRow,
  sessionScope,
  summaryLine,
  DEFAULT_READ_BUDGET,
  type AgencyGrant,
  type AgencyOperation,
  type DeliveredFile,
} from "../agency.ts";
import {
  loadSelectionConfig,
  selectTests,
  workingTreeChanges,
} from "../affected.ts";
import { writeErr, writeOut } from "../output.ts";
import {
  EVIDENCE_SERVED,
  FIDELITY_SUBSTITUTED,
  modelFidelity,
} from "../selection.ts";
import {
  loadConfig,
  explainReviewingTransport,
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
import { DRIVEN_MARKER } from "../jobs.ts";
import { nowIso } from "../journal.ts";
import {
  ROW_ADJUDICATION,
  ROW_REMEDIATED_AT_CAP,
  TERMINAL_ROW_TYPES,
  appendRound,
  effectiveBaseline,
  readDisputes,
  readRounds,
  standingReopen,
  type ReopenGrant,
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
  sessionVerdict,
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
  EXIT_UNRESOLVED,
  EXIT_USAGE,
  VerifyError,
} from "./errors.ts";
import { buildTaskBlock, sliceCodePoints } from "./prompts.ts";
import { undisputedBlockingIndices } from "./disputes.ts";

/**
 * Two attempts at the reviewer the operator CHOSE, under the caller's own
 * exclusion and no other. `NoCandidateError` propagates -- that is the
 * operator-only "verification unavailable" state.
 *
 * The retry used to exclude the provider that failed, and where that
 * provider was the chosen reviewer the exclusion left nothing: the second
 * attempt refused with the ladder's vendor-conflict sentence -- "'x' is
 * OpenAI's, and so is the authoring model" -- which was false, the original
 * failure was written nowhere, and a service that was briefly unavailable
 * reached a person as a configuration error they had to resolve. It
 * happened in the second beta test and again while driving session 213, and
 * running the loop again was the whole cure both times.
 *
 * So a call that failed to be DELIVERED is made again to the same reviewer,
 * the failure is reported in the transport's own words on the way past, and
 * only a failure that repeats ends the attempt.
 */
export async function dispatchVerification(
  prompt: string,
  options: {
    excludeProviders: readonly string[];
    /**
     * The first failure, as the transport said it, so a caller can put it
     * on the round's record and in front of whoever is watching. A retry
     * that succeeds must not swallow the fact that one was needed.
     */
    onFailed?: ((message: string, provider: string | null) => void) | null;
    /** The model the work was authored by, so the one rule holds at dispatch. */
    authorModel?: string | null;
    /**
     * Which reviewing role is speaking. The default is the Primary Reviewer,
     * which is every round; the adjudication names the Auxiliary Reviewer,
     * because the two roles are defined differently and a dispatch that
     * borrowed the primary's role would resolve against the primary's
     * preference order and the primary's selection.
     */
    role?: string;
    sessionNumber: number | null;
    transport?: string | null;
    /** The repository under review, whose configuration decides the vehicle. */
    repoRoot?: string | null;
    followUp?: ((answer: string) => string | null) | null;
  },
): Promise<RouteResult> {
  const { DispatchError, route } = await import("../route.ts");
  const { ROLE_PRIMARY_REVIEWER } = await import("../selection.ts");
  const role = options.role ?? ROLE_PRIMARY_REVIEWER;

  const excluded = [...options.excludeProviders];
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await route(prompt, {
        taskType: "session-verification",
        role,
        sessionNumber: options.sessionNumber,
        excludeProviders: excluded,
        authorModel: options.authorModel ?? null,
        transport: options.transport ?? null,
        repoRoot: options.repoRoot ?? null,
        followUp: options.followUp ?? null,
      });
    } catch (error) {
      if (!(error instanceof DispatchError)) throw error;
      lastError = error;
      if (attempt === 0) {
        options.onFailed?.(error.message, error.provider ?? null);
        continue;
      }
      throw error;
    }
  }
  throw lastError; // unreachable; defensive
}

/**
 * What `verify` says when no reviewer can be dispatched.
 *
 * The ladder's own message carries the cause that holds and the ways forward
 * that fix it, so nothing here restates a remedy -- and nothing points at
 * `router-config.yaml`, which is packaged data and not the operator's to edit.
 */
export function verificationUnavailable(
  sessionsDir: string,
  authorProvider: string,
  error: Error,
): string {
  return (
    "verify: VERIFICATION UNAVAILABLE -- no reviewer can be dispatched outside " +
    `the authoring vendor (${authorProvider}): ${error.message}\n` +
    "No verdict was written; the close stays BLOCKED. This state is resolvable " +
    "only by the operator (never the engine). Once it is, re-run:\n" +
    `  dabbler verify --sessions-dir ${sessionsDir}\n`
  );
}

// --- What a round says it cost ----------------------------------------------
//
// Three small readings, pure and separate from the append, because each one
// exists to keep an unknown from being written as a number. Round 1 of
// session 93's own verification found two of them being got wrong.

/** A reported cost, or null. Anything that is not a finite number is unknown. */
export function costNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Agentic turns in one round.
 *
 * The seat reports its turns as the LIST of tool calls it made, and what a
 * cost record wants is the count -- 26 billed calls across 3 rounds is a
 * length, not a figure anyone stated. A transport that reports a number is
 * taken at its word; anything else is unknown rather than zero.
 */
export function turnCount(value: unknown): number | null {
  return Array.isArray(value) ? value.length : costNumber(value);
}

/**
 * The generation params the transport dropped because the vendor refused
 * them for this model, each with the vendor's sentence, in the order dropped.
 */
export function droppedParams(
  metadata: Record<string, unknown>,
): Array<{ readonly param: string; readonly reason: string }> {
  const dropped = metadata["dropped_params"];
  if (!Array.isArray(dropped)) return [];
  return dropped.flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { param, reason } = entry as Record<string, unknown>;
    return typeof param === "string" ? [{ param, reason: String(reason ?? "") }] : [];
  });
}

/**
 * What to say when the model that answered is not the model that was asked
 * for, or null when there is nothing to say.
 *
 * The round has recorded both since the 364-request session and has said
 * nothing about them ever since: the only place a substitution surfaced was
 * a NOTE on stderr from inside one transport, which reaches whoever was
 * watching that process and nobody else. The round is where both facts are
 * already in hand, so it is where the operator hears it.
 *
 * **It is a note and never a refusal.** A provider substituting a model is a
 * fact about what was bought, not a verification failure, and stopping the
 * round would cost the operator the round they had already paid for while
 * telling them nothing they could act on until it finished.
 *
 * The rule is `modelFidelity`'s and not a second one: a dated snapshot pin
 * is the model that was asked for, and a round that warned about one would
 * make the warning that matters routine.
 */
export function substitutionNote(requested: string, served: string | null): string | null {
  if (served === null || served === "") return null;
  // A round's served id is the provider's own statement, which is the strong
  // kind; the note would be equally right on an echo, since an echo naming a
  // DIFFERENT model is the only thing an echo can prove.
  const seen = { requested, served, evidence: EVIDENCE_SERVED } as const;
  if (modelFidelity(requested, [seen]) !== FIDELITY_SUBSTITUTED) return null;
  return (
    `verify: NOTE -- this round asked for '${requested}' and '${served}' answered. ` +
    "Both are on the round; the verdict stands, and what it cost is what the " +
    "model that answered costs.\n"
  );
}

/**
 * Prompt tokens, or null where the transport counts none.
 *
 * `APIResult.input_tokens` must be a number, so a transport that reports no
 * prompt count carries 0 -- the type's floor, not a measurement. The Copilot
 * seat is exactly that case, and recording its 0 would read as a round that
 * sent no prompt.
 */
export function reportedInputTokens(
  tokens: number,
  metadata: Record<string, unknown>,
): number | null {
  return metadata["input_tokens_reported"] === false ? null : tokens;
}

export function blockingFindings(row: Row): Row[] {
  const findings = Array.isArray(row["findings"]) ? (row["findings"] as Row[]) : [];
  return findings.filter((finding) => finding["blocking"] !== false);
}

// --- May another round open? -------------------------------------------------
//
// Asked twice: by `runRound`, which refuses when the answer is no, and by
// the driver, which must not spend a verification job to be told. It is one
// question and it is answered here, because the reason a session cannot
// verify again decides what happens next -- two of the three answers mean
// ADVANCE, and a caller that only saw the refusal treated all three as a
// wall. A second statement of it in `drive.ts` is the drift ground rule 3
// exists against.

/** A terminal row already stands: adjudication, remediation at the cap, a waiver. */
export const NO_ROUND_TERMINAL = "terminal-row";
/** The cap is reached and the last round left no blocking finding. */
export const NO_ROUND_CAP_CLEAN = "cap-clean";
/** The cap is reached and blocking findings are disputed rather than fixed. */
export const NO_ROUND_CAP_DISPUTED = "cap-disputed";

export type NoRoundReason =
  | typeof NO_ROUND_TERMINAL
  | typeof NO_ROUND_CAP_CLEAN
  | typeof NO_ROUND_CAP_DISPUTED
  | null;

/**
 * The cap in force: a standing grant's, or the one the caller resolved.
 *
 * The grant wins outright rather than by `max`, and that is the whole of its
 * authority: a number an operator signed for, which a config file edited
 * afterwards must not quietly undo. It can only ever raise, because the verb
 * refuses to record a grant that buys no round.
 */
export function effectiveCap(repoRoot: string, current: number, baseCap: number): number {
  return standingReopen(repoRoot, current)?.cap ?? baseCap;
}

/**
 * A terminal row that no grant has reopened, or null.
 *
 * A grant neutralises every terminal at or before the round it names, and
 * nothing after it: a session that spends its bought rounds and reaches the
 * cap again writes a new terminal beyond the grant, and stops again. There
 * is no state in which the cap has been switched off.
 *
 * Adjudication is never in the neutralised set whatever a grant says. The
 * verb refuses to write such a grant, and this refuses to honour one -- two
 * statements of one rule, deliberately, because the ledger is append-only
 * and a row written by an older or patched build must not become authority
 * over a judgment.
 */
export function standingTerminal(
  priorRounds: readonly Row[],
  grant: ReopenGrant | null,
): Row | undefined {
  return priorRounds.find((row) => {
    const type = String(row["type"]);
    if (!TERMINAL_ROW_TYPES.has(type)) return false;
    if (type === ROW_ADJUDICATION) return true;
    return grant === null || Number(row["round"]) > grant.afterRound;
  });
}

/**
 * Why no further verification round may open, or null when one may.
 *
 * Null covers both the ordinary case and the one terminal path that still
 * has work to do: the cap reached with undisputed blocking findings, which
 * `terminateAtCap` may still resolve into a `REMEDIATED_AT_CAP` row or an
 * UNRESOLVED refusal. That decision needs the tree, so it is not asked here
 * -- this answers only what the ledger alone can settle.
 *
 * `cap` is what the caller resolved; an operator's grant is read here rather
 * than by the caller, so no call site can ask this question having missed
 * one. Session 137, 2026-09-09: the terminal check ran BEFORE the cap and
 * returned unconditionally, so `plan amend --max-rounds` was accepted,
 * recorded, and could not reopen the loop it was raised to reopen -- and
 * `verify` then named `close` while `close` named `verify`.
 */
export function noRoundReason(
  repoRoot: string,
  current: number,
  priorRounds: readonly Row[],
  cap: number,
): NoRoundReason {
  const grant = standingReopen(repoRoot, current);
  if (standingTerminal(priorRounds, grant) !== undefined) return NO_ROUND_TERMINAL;
  if (priorRounds.length === 0) return null;
  const latest = priorRounds[priorRounds.length - 1] as Row;
  if (Number(latest["round"]) + 1 <= (grant?.cap ?? cap)) return null;
  if (!latest["blocking"]) return NO_ROUND_CAP_CLEAN;
  const disputes = readDisputes(repoRoot, current);
  return undisputedBlockingIndices(latest, disputes).length < blockingFindings(latest).length
    ? NO_ROUND_CAP_DISPUTED
    : null;
}

/**
 * Why no further round opens over a standing dispute, said once.
 *
 * `verify` refuses in these words when a person runs it, and the driver
 * stops in them when it reads the same state off the record before spawning
 * anything. Written twice they would drift, and the two readers of a state
 * disagreeing about what it is is exactly what sent one session between two
 * verbs that each named the other.
 */
export function capDisputedRefusal(
  sessionsDir: string,
  cap: number,
  round: unknown,
): string {
  return (
    `verify: refused -- the cap (${cap}) is reached and round ` +
    `${String(round)} carries disputed blocking finding(s). A ` +
    "dispute says a finding is wrong, not that it was fixed, so it " +
    "is judged rather than terminated. Route the disputes to a " +
    "third provider:\n" +
    `  dabbler verify adjudicate --sessions-dir ${sessionsDir}`
  );
}

/** What a verdict is followed by when the driver spawned this verb. */
export const DRIVER_RUNS_THE_REST = "The driver runs the rest.";

/**
 * The close is two steps away from a verified tree, and this names them. A
 * malformed or suite-less config says nothing rather than guessing a
 * command: a wrong command here is what the message exists to prevent.
 *
 * Under the driver's mark it names nothing at all: the run of record, the
 * commit and the push are the driver's next phases, and a recipe printed
 * into a job log that the managed body tells the engine to read was four
 * sessions' worth of engines told to run verbs the pull forbids.
 */
export async function runOfRecordLines(
  sessionsDir: string,
  config: RouterConfig,
): Promise<string> {
  if (process.env[DRIVEN_MARKER] === "1") return DRIVER_RUNS_THE_REST;
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
  const noRound = noRoundReason(repoRoot, current, priorRounds, cap);
  if (noRound === NO_ROUND_CAP_CLEAN) {
    writeErr(
      `verify: refused -- round ${String(latest["round"])} left no blocking ` +
        `finding and the cap (${cap}) is reached; there is nothing ` +
        "left to verify. Close the session:\n" +
        `  dabbler session close --sessions-dir ${sessionsDir}\n` +
        "\n\"Nothing left to verify\" is true of the tree that round saw. If " +
        "the tree has moved since, the close refuses it and this is the verb " +
        "that buys the round the cap will not:\n" +
        `  dabbler verify reopen --rounds 1 --reason "<why>" --sessions-dir ${sessionsDir}\n`,
    );
    return EXIT_USAGE;
  }

  if (noRound === NO_ROUND_CAP_DISPUTED) {
    writeErr(`${capDisputedRefusal(sessionsDir, cap, latest["round"])}\n`);
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
    // Its own code, never BLOCKING: no round is written here, so there is
    // nothing to dispose of. An orchestrator told "blocking" sends the
    // engine back to the disposition set it already acted on, then to the
    // same fix and the same suite, and arrives here again -- a cycle that
    // reads as ordinary progress and cannot break, because a finding citing
    // no path can never be shown remediated by any amount of work.
    return EXIT_UNRESOLVED;
  }

  // The targeted-evidence gate that stood here went with the selection it
  // demanded; what REMEDIATED AT THE CAP now rests on is the run of record
  // against the final tree, which the close still requires.

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
    // Both spellings, because archived rows are not rewritten: a round
    // recorded before the rename carries the old key and is still the round
    // this terminal is about.
    verifierModel: latest["reviewer_model"] ?? latest["verifier_model"] ?? null,
    verifierProvider: latest["reviewer_provider"] ?? latest["verifier_provider"] ?? null,
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
  const cap = effectiveCap(repoRoot, current, options.maxRounds || verificationRoundCap(config));
  const priorRounds = readRounds(repoRoot, current);
  if (priorRounds.some((row) => row["type"] === "adjudication")) {
    writeErr(
      `verify: refused -- session ${current} already carries its ` +
        "adjudication row. Adjudication is terminal: one per session, " +
        "ever, and no further verification rounds may open after it.\n",
    );
    return EXIT_USAGE;
  }
  const terminal =
    noRoundReason(repoRoot, current, priorRounds, cap) === NO_ROUND_TERMINAL
      ? standingTerminal(priorRounds, standingReopen(repoRoot, current))
      : undefined;
  if (terminal !== undefined) {
    // Two exits, and the message names both because naming only the close
    // is what made session 137's deadlock: the close's own gate refuses a
    // tree that moved since the round and says "re-run verify", and verify
    // said "close the session", and neither sentence mentioned the verb
    // that breaks the tie.
    const reopenable = String(terminal["type"]) !== ROW_ADJUDICATION;
    writeErr(
      `verify: refused -- session ${current} already carries its ` +
        `terminal '${String(terminal["type"])}' row ` +
        `(${String(terminal["verdict"])}); no further verification round ` +
        "may open after it. Close the session:\n" +
        `  dabbler session close --sessions-dir ${sessionsDir}\n` +
        (reopenable
          ? "\nThat terminal is a spent round budget, not a judgment. If the " +
            "tree has moved since it was written -- so the close refuses it " +
            "too -- an operator may buy the review neither verb can give " +
            "you:\n" +
            `  dabbler verify reopen --rounds 1 --reason "<why>" --sessions-dir ${sessionsDir}\n`
          : ""),
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

  // No targeted-evidence gate stands here any more: the selection it
  // demanded measured 353-625 s per session and twice cost more than the
  // full suite it approximates. What a round requires of the tree is what
  // the round itself does -- the verifier's authored tests inside it -- and
  // the complete suite remains the run of record after the final verified
  // tree.

  // Still before any model sees the bundle: everything the machine can
  // settle by itself, settled. A red required control is the author's to
  // fix, and a verification round spent rediscovering it buys nothing the
  // exit code already said.
  const facts = await collectFacts(repoRoot, sessionsDir, config, {
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
  // The verifier's scope: the session's changed files, what they import, and
  // the sessions root.
  const changed =
    workingTreeChanges(
      repoRoot,
      roundNumber === 1
        ? null
        : String(effectiveBaseline(repoRoot, current, priorRounds[priorRounds.length - 1] as Row)),
    ) ?? [];
  const scope = sessionScope(repoRoot, sessionsDir, changed);
  const verificationSettings = settingsBlock(config);
  const readBudget =
    (verificationSettings["read_budget"] as number | undefined) ||
    DEFAULT_READ_BUDGET;
  const selection = loadSelectionConfig(config).config;
  // Shown to the reviewer, never judged here.
  const untested = selectTests(repoRoot, changed, selection).unknownPaths;

  // A code review round grants no write. The tests phase of spec 3.c.ii is
  // where the verifier authors tests, and a surface offered in every round
  // is a surface used in every round -- a review that quietly edits the tree
  // it is reviewing is not a review.
  // Off unless the repository says otherwise, and off is what every
  // repository says until an operator changes it: a verifier that can ask
  // for a file is a second turn nobody has measured yet.
  const apiFileRequests = verificationSettings["api_file_requests"] === true;
  const grantFor = (forTransport: string): AgencyGrant =>
    grantForTransport(forTransport, {
      scope,
      readBudget,
      testScopes: selection.scopes,
      allowWrite: false,
      allowFileRequests: apiFileRequests,
    });

  // The ROLE's vehicle, because that is the transport the round is actually
  // dispatched on and the grant is a property of the transport: a seat round
  // holds three tools and a direct-API round holds none, so a grant resolved
  // from the machine's transport would describe a round that is not this one.
  // THIS repository's, named rather than left to the working directory: a
  // round reviews the repository it was asked about, and a vehicle read from
  // wherever the process happens to stand is a reading of another checkout.
  const grant = grantFor(
    explainReviewingTransport(config, options.transport ?? null, repoRoot).transport,
  );

  // The reads happen exactly once, inside the dispatch, and what they
  // produced is what the round records: a second pass over the same answer
  // would open the same files again and could disagree with the first about
  // a tree that moved in between.
  //
  // The grant here is the predicted one, because the follow-up is decided
  // before any answer says which transport served it. That is safe in both
  // directions -- a briefing that described tools does not produce a request
  // block, and one that described the block does not produce a tool call --
  // and the RECORD below is built from the transport that actually answered.
  let requested: readonly AgencyOperation[] = [];
  const followUp = (answer: string): string | null => {
    const outcome = deliverFileRequests(repoRoot, grant, answer);
    requested = outcome.operations;
    return outcome.files.length === 0 ? null : deliveredFilesMessage(outcome.files);
  };

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
      untested,
    ),
    "session-verification",
    evidence,
  );

  const exclude = [orchestrator.effectiveProvider];
  // What failed on the way to this round's reviewer, in the transport's own
  // words. It goes on the round's row, so a call that had to be made twice
  // is readable afterwards rather than lost behind the one that worked.
  const dispatchFailures: string[] = [];
  let result: RouteResult;
  try {
    result = await dispatchVerification(promptBody, {
      excludeProviders: exclude,
      authorModel: orchestrator.model,
      sessionNumber: current,
      transport: options.transport ?? null,
      repoRoot,
      followUp,
      onFailed: (message, provider) => {
        const said = `the call to ${provider ?? "the chosen reviewer"} failed: ${message}`;
        dispatchFailures.push(said);
        writeErr(
          `verify: ${said}\nRetrying the same reviewer once: a service that did not ` +
            "answer is not a reason to review with somebody else.\n",
        );
      },
    });
  } catch (error) {
    if (error instanceof NoCandidateError) {
      writeErr(verificationUnavailable(sessionsDir, orchestrator.effectiveProvider, error));
      return EXIT_UNAVAILABLE;
    }
    if (error instanceof RouterError) {
      // Twice, to the reviewer the operator chose. What is said is what
      // failed: nothing here suggests the choice is wrong, because a
      // service that did not answer says nothing about the choice.
      writeErr(
        `verify: the reviewer call failed twice: ${error.message}\n` +
          (dispatchFailures.length > 0 ? `The first attempt: ${dispatchFailures[0]}\n` : "") +
          "Nothing was written and no round was spent. Run verification again once the " +
          "service answers.\n",
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
    requested,
  );

  const row: Row = {
    round: roundNumber,
    phase: roundNumber === 1 ? "full" : "fix-delta",
    verdict,
    blocking: classification.blocking,
    reviewer_model: result.model_name,
    reviewer_provider: result.provider,
    orchestrator_provider: orchestrator.effectiveProvider,
    findings,
    completion_tree: completionTree,
    head_commit: headCommit(repoRoot),
    recorded_at: nowIso("microseconds"),
    transport: result.transport,
    agency: recordRow(agencyRecord),
    // What was asked for, what answered, and what the round cost. Every one
    // of these was already in the dispatch result and was dropped here, so
    // a round could say which model answered and nothing else -- which is
    // why the 364-request session cannot be explained from its own record.
    //
    // `served_model` stays null when the provider did not say. That is a
    // different fact from "it served what was asked", and collapsing the
    // two would hide exactly the case the field exists for.
    requested_model: result.model_id,
    served_model: result.served_model_id ?? null,
    escalation_history: result.escalation_history.map((step) => [...step]),
    // A transport that does not count a thing says so, and the round writes
    // null rather than the zero its result type has to carry. The seat never
    // reports prompt tokens; recording that as 0 would read as a round that
    // sent no prompt, which is the unknown-as-zero mistake this whole record
    // exists to stop making.
    input_tokens: reportedInputTokens(result.input_tokens, result.metadata),
    output_tokens: result.output_tokens,
    premium_requests: costNumber(result.metadata["premium_requests"]),
    tool_calls: turnCount(result.metadata["tool_calls"]),
  };
  // A round whose reviewer had to be called twice says so on its row, in
  // the transport's words: the retry that worked must not erase the failure
  // that made it necessary.
  if (dispatchFailures.length > 0) row["dispatch_failures"] = [...dispatchFailures];
  // A review that ran without a setting the vendor refused says so on its row.
  const dropped = droppedParams(result.metadata);
  if (dropped.length > 0) row["dropped_params"] = dropped;
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

  // Said whatever the verdict turned out to be: what was bought is a fact
  // about this round either way, and a note that only appeared on a blocking
  // round would be absent from every round an operator was happy with.
  const substituted = substitutionNote(
    String(row["requested_model"] ?? ""),
    (row["served_model"] as string | null) ?? null,
  );
  if (substituted !== null) writeErr(substituted);

  if (classification.blocking) {
    writeOut(
      `verify: round ${roundNumber} — ${verdict} with ` +
        `${classification.blockingIssues.length} blocking finding(s) ` +
        `(verifier ${result.model_name}/${result.provider}). Raw output: ` +
        `${rawPath}\n` +
        `${summaryLine(agencyRecord)}\n` +
        "Fix what the findings cite, then re-run " +
        `\`dabbler verify --sessions-dir ${sessionsDir}\`: the next round ` +
        "reviews the fix delta, and the complete suite remains the run of " +
        "record after the final verified tree.\n",
    );
    return EXIT_BLOCKING;
  }

  // Loop finished: stamp the session record and the change-log summary with
  // the gate's decision. Nothing blocked, so the session is VERIFIED
  // whatever word the reviewer wrote; the row above keeps that word.
  const passed = sessionVerdict(verdict, false);
  recordSessionVerification(sessionsDir, current, passed, {
    rounds: roundNumber,
    verifierModel: result.model_name,
    verifierProvider: result.provider,
    transport: result.transport,
  });
  appendChangeLogBlock(
    sessionsDir,
    `## Session ${current} verification — ${passed} after ` +
      `${roundNumber} round(s)\n\n` +
      `- Verifier: ${result.model_name} (${result.provider}) over ` +
      `${result.transport}\n` +
      `- Orchestrator provider (excluded): ` +
      `${orchestrator.effectiveProvider}\n` +
      `- Verifier's read surface: ${summaryLine(agencyRecord)}\n` +
      `- Raw round output: \`.dabbler/runs/s${current}/\`\n`,
  );
  writeOut(
    `verify: round ${roundNumber} — ${passed} ` +
      `(verifier ${result.model_name}/${result.provider}); ` +
      `session ${current} is verified.\n` +
      (await runOfRecordLines(sessionsDir, config)) +
      "\n",
  );
  return EXIT_OK;
}

/**
 * A fence long enough to hold `body` whole.
 *
 * A source file that itself contains a fence would otherwise close the block
 * around it early, and the verifier would be shown a file that appears to end
 * where it does not.
 */
function fenceFor(body: string): string {
  const longest = [...body.matchAll(/`+/g)].reduce(
    (most, run) => Math.max(most, run[0].length),
    0,
  );
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * The one further turn's message: the files the framework opened, and the
 * instruction that this turn is the verdict.
 *
 * Said plainly rather than implied, because the alternative to "answer now"
 * is a verifier that asks again into a turn that does not exist.
 */
function deliveredFilesMessage(files: readonly DeliveredFile[]): string {
  const parts = files.map((file) => {
    const fence = fenceFor(file.content);
    // The contents as they are, and never trimmed: a file that ends in two
    // blank lines ends in two here. The one thing a fenced block cannot
    // express is the absence of a final newline, so one is added where the
    // file has none -- and the briefing says so rather than claiming a
    // fidelity the format does not have.
    const body = file.content.endsWith("\n") ? file.content : `${file.content}\n`;
    return `### ${file.path}\n\n${fence}\n${body}${fence}`;
  });
  return (
    `## The files you asked for\n\n${files.length} file(s), read from disk ` +
    "by the framework: the contents as they are on disk, with a final " +
    "newline added where a file had none, because a fenced block cannot " +
    "show its absence.\n\n" +
    `${parts.join("\n\n")}\n\n---\n\n` +
    "That is the whole of what you asked for. **This turn is your verdict** " +
    "— there is no further turn, and another request block will not be " +
    "answered. Reply in the response format the instructions above give."
  );
}

function settingsBlock(config: RouterConfig): Record<string, unknown> {
  const verification = config["verification"];
  if (verification === null || typeof verification !== "object") return {};
  const settings = (verification as Record<string, unknown>)["settings"];
  if (settings === null || typeof settings !== "object") return {};
  return settings as Record<string, unknown>;
}
