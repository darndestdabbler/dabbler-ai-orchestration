// Buying verification rounds past a cap terminal -- the operator's answer to
// a loop the budget ended while the work still needed reviewing.
//
// The framework decides everything about a verification round except how
// many a repository is willing to pay for, and that last one is a person's.
// Before this verb the cap was answerable only BEFORE it was reached: once
// a cap terminal row was written, `noRoundReason` returned `terminal` ahead
// of every other test, and `session plan amend --max-rounds` was accepted,
// recorded in `amendments.jsonl`, and did nothing. Session 137, 2026-09-09,
// spent its last three rounds finding that out: `verify` said close the
// session, the close's `verification_clean` gate said re-run `verify`, and
// `close --force` could not help because that gate is evidence rather than
// bookkeeping. There was no forward exit at all.
//
// So the grant is a row, and every refusal below is about keeping it a
// grant rather than a bypass. It buys a NAMED number of rounds past ONE
// named terminal; it never suspends the cap. It cannot reach an
// adjudication, because that is a third provider's judgment and not a
// budget. It cannot be written where nothing is stuck, so it can never
// become the ordinary way to raise a cap. And it carries a reason forever,
// with who was working read from the record `start` wrote rather than
// typed, because the whole difference between this and a waiver is that a
// waiver accepted work over a standing finding while this buys the review
// that would settle one.

import { existsSync } from "node:fs";
import { basename, join } from "node:path";

import { writeErr, writeOut } from "../output.ts";
import { STATE_FILENAME, repoRootFor, runGit } from "../evidence.ts";
import { loadConfig, verificationRoundCap } from "../config.ts";
import { EXIT_FUNDS } from "../contracts/exitCodes.ts";
import { EvidenceTooLargeError, FactsError } from "../facts.ts";
import { nowIso, snapshotWorktreeTree } from "../journal.ts";
import {
  LedgerError,
  ROW_ADJUDICATION,
  appendReopen,
  appendRound,
  readRounds,
  saveRawOutput,
  standingReopen,
  type Row,
} from "../ledger.ts";
import { NOBODY_ON_THE_RECORD, readSessionState, whoIsWorking } from "../progress.ts";
import { NoCandidateError, RouterError, type RouteResult } from "../route.ts";
import { FundsError } from "../transports/api.ts";
import {
  VERDICT_ISSUES_FOUND,
  VERDICT_REMEDIATED_AT_CAP,
  VERDICT_VERIFIED,
  classifyBlocking,
  parseVerificationResponse,
  sessionVerdict,
} from "../verdict.ts";
import { buildVerificationPrompt } from "../verifyjob.ts";
import { VERSION } from "../version.ts";
import { recordAmendment, recordClosedSessionVerified, reviewableAfterClose } from "../writers.ts";
import { readRun } from "../driver.ts";
import {
  EXIT_BLOCKING,
  EXIT_CALL_FAILED,
  EXIT_OK,
  EXIT_STATE,
  EXIT_UNAVAILABLE,
  EXIT_USAGE,
  VerifyError,
} from "./errors.ts";
import {
  NO_ROUND_CAP_CLEAN,
  NO_ROUND_CAP_DISPUTED,
  NO_ROUND_CAP_REVIEWED,
  NO_ROUND_TERMINAL,
  closedSessionReview,
  costNumber,
  dispatchVerification,
  findingRows,
  headCommit,
  noRoundReason,
  reportedInputTokens,
  standingTerminal,
  substitutionNote,
  turnCount,
  verificationUnavailable,
} from "./rounds.ts";

export interface ReopenOptions {
  /** How many further rounds this grant buys. */
  readonly rounds: number;
  readonly reason: string;
}

/** What is stuck, and whether a grant may reach it. */
type Stuck =
  | { readonly kind: "reopenable"; readonly afterRound: number; readonly terminal: string }
  | { readonly kind: "refused"; readonly message: string };

/**
 * What the ledger says a grant would be reopening.
 *
 * Deliberately re-derived from `noRoundReason` rather than from the rows
 * directly: the question "is this session stuck, and why" has one answer in
 * this codebase, and a second reading of the rows here would be a rule that
 * drifts from the one every other caller obeys.
 */
export function classifyStuck(
  repoRoot: string,
  current: number,
  priorRounds: readonly Row[],
  cap: number,
): Stuck {
  const terminal = standingTerminal(priorRounds, standingReopen(repoRoot, current));
  if (terminal !== undefined) {
    if (String(terminal["type"]) === ROW_ADJUDICATION) {
      return {
        kind: "refused",
        message:
          `session ${current} carries an adjudication row. That is a third ` +
          "provider's judgment of the disputed findings, not a spent round " +
          "budget, and no grant reaches it: one adjudication per session, " +
          "ever. Nothing here can buy a different answer to a question that " +
          "has been judged.",
      };
    }
    return {
      kind: "reopenable",
      afterRound: Number(terminal["round"]),
      terminal: String(terminal["type"]),
    };
  }
  const reason = noRoundReason(repoRoot, current, priorRounds, cap);
  if (reason === NO_ROUND_CAP_CLEAN) {
    const latest = priorRounds[priorRounds.length - 1] as Row;
    return {
      kind: "reopenable",
      afterRound: Number(latest["round"]),
      terminal: "cap-clean",
    };
  }
  if (reason === NO_ROUND_CAP_REVIEWED) {
    // The round past the cap still holds findings: a spent budget, which a
    // person may buy past, and the findings go back to the author.
    const latest = priorRounds[priorRounds.length - 1] as Row;
    return {
      kind: "reopenable",
      afterRound: Number(latest["round"]),
      terminal: NO_ROUND_CAP_REVIEWED,
    };
  }
  if (reason === NO_ROUND_CAP_DISPUTED) {
    return {
      kind: "refused",
      message:
        `session ${current} reached the cap with blocking finding(s) still ` +
        "DISPUTED. A dispute says a finding is wrong, not that it was fixed, " +
        "and it is judged rather than re-reviewed -- another round of the " +
        "same two providers is the argument this repository routes to a " +
        "third. Route them:\n  dabbler verify adjudicate",
    };
  }
  if (reason === NO_ROUND_TERMINAL) {
    // Unreachable while `standingTerminal` and `noRoundReason` agree, and
    // stated rather than assumed: a future edit that parts them must fail
    // loudly here rather than write a grant against nothing.
    return {
      kind: "refused",
      message: `session ${current} is terminal for a reason this verb cannot read`,
    };
  }
  return {
    kind: "refused",
    message:
      `session ${current} is not stuck: a verification round may open right ` +
      "now, so there is no budget to buy past. This verb exists for a cap " +
      "that has already ended a loop; the cap itself moves before it is " +
      'reached with `dabbler session plan amend --max-rounds <N> --reason ' +
      '"<why>"`. Run the round:\n  dabbler verify',
  };
}

/**
 * Grant further verification rounds past the cap terminal that stands.
 */
export function runReopen(sessionsDir: string, options: ReopenOptions): number {
  const repoRoot = repoRootFor(sessionsDir);
  if (repoRoot === null) {
    writeErr(`verify reopen: not inside a git repository: ${sessionsDir}\n`);
    return EXIT_STATE;
  }
  const state = readSessionState(sessionsDir);
  const current = (state ?? {})["currentSession"] as number | null | undefined;
  if (current === null || current === undefined) {
    writeErr(`verify reopen: no session is in flight under ${sessionsDir}.\n`);
    return EXIT_STATE;
  }
  if (!Number.isInteger(options.rounds) || options.rounds < 1) {
    writeErr(
      "verify reopen: refused -- --rounds is a whole number of rounds, at " +
        `least one; '${String(options.rounds)}' is not. A grant that buys no ` +
        "round is not a grant.\n",
    );
    return EXIT_USAGE;
  }
  const reason = options.reason.trim();
  if (reason === "") {
    writeErr(
      "verify reopen: refused -- a grant carries a reason. Rounds bought for no " +
        "stated reason are the bare override this row exists to replace.\n",
    );
    return EXIT_USAGE;
  }
  const by = whoIsWorking(sessionsDir, current);

  const priorRounds = readRounds(repoRoot, current);
  // The cap this run verifies under, which the driver passes to every round.
  const cap = readRun(repoRoot, current)?.verification?.max_rounds || verificationRoundCap(loadConfig());
  const stuck = classifyStuck(repoRoot, current, priorRounds, cap);
  if (stuck.kind === "refused") {
    writeErr(`verify reopen: refused -- ${stuck.message}\n`);
    return EXIT_USAGE;
  }

  const record: Row = {
    schema_version: 1,
    session_number: current,
    after_round: stuck.afterRound,
    terminal: stuck.terminal,
    cap: stuck.afterRound + options.rounds,
    reason,
    by,
    recorded_at: nowIso(),
    framework_version: VERSION,
  };
  const tree = snapshotWorktreeTree(repoRoot);
  if (tree !== null) record["tree_at_grant"] = tree;

  try {
    appendReopen(repoRoot, current, record);
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    writeErr(`verify reopen: refused -- ${error.message}\n`);
    return EXIT_USAGE;
  }
  recordAmendment(sessionsDir, {
    sessionNumber: current,
    what:
      `verification reopened after round ${stuck.afterRound}: ${options.rounds} round(s) ` +
      `bought, cap ${String(record["cap"])}`,
    reason,
    by,
  });

  writeOut(
    `Reopened session ${current}'s verification after round ` +
      `${stuck.afterRound} (${stuck.terminal}).\n` +
      `  ${options.rounds} further round(s) bought; the cap is now ` +
      `${record["cap"] as number}.\n` +
      `  By: ${by}\n` +
      `  Reason: ${reason}\n` +
      "\nThe grant is on the record and buys rounds, never a verdict: " +
      "nothing is verified until a round says so, and reaching the new cap " +
      "stops the session again. Run the round:\n" +
      `  dabbler verify --sessions-dir ${sessionsDir}\n`,
  );
  return EXIT_OK;
}

export interface ClosedReviewOptions {
  readonly sessionNumber: number;
  readonly reason: string;
  /** The caller is an engine: the review is refused it. */
  readonly engine: boolean;
}

/**
 * Buy one review of a session that closed REMEDIATED_AT_CAP: the fix its
 * cap left unreviewed, read as the trunk holds it now. A release start
 * refuses such a session, and before this verb the refusal had no exit --
 * `verify reopen` reaches only the session in flight.
 *
 * It buys a round and never a verdict: the grant and the round are appended
 * to the session's own record after the rows already there, and only a
 * round the Primary Reviewer returns decides what follows.
 */
export async function reviewClosedSession(sessionsDir: string, options: ClosedReviewOptions): Promise<number> {
  const n = options.sessionNumber;
  if (options.engine) {
    writeErr(
      "verify reopen: refused -- `verify reopen --session-number` is a person's verb, never the " +
        "engine's: it buys a review of a closed session's work, and that judgement is not the " +
        "engine's to make. Report the step blocked and say why; a person runs it at a terminal of " +
        "their own.\n",
    );
    return EXIT_USAGE;
  }
  const repoRoot = repoRootFor(sessionsDir);
  if (repoRoot === null) {
    writeErr(`verify reopen: not inside a git repository: ${sessionsDir}\n`);
    return EXIT_STATE;
  }
  const state = readSessionState(sessionsDir);
  const current = (state ?? {})["currentSession"];
  if (current !== null && current !== undefined) {
    writeErr(
      `verify reopen: refused -- session ${String(current)} is in flight, and a closed session is ` +
        "reviewed only when none is. Run it again once that session closes.\n",
    );
    return EXIT_STATE;
  }
  const sessions = Array.isArray(state?.["sessions"]) ? (state["sessions"] as Row[]) : [];
  const record = sessions.find((row) => row["number"] === n);
  const verdict = record?.["verificationVerdict"];
  const rounds = record === undefined ? [] : readRounds(repoRoot, n);
  const last = rounds[rounds.length - 1];
  if (record === undefined || record["status"] !== "complete" || !reviewableAfterClose(verdict, last)) {
    const found =
      record === undefined
        ? "there is no such session"
        : record["status"] !== "complete"
          ? `its status is ${String(record["status"])}`
          : last?.["type"] === ROW_ADJUDICATION
            ? "it was ended by an adjudication, a judgment no review reaches"
            : `its verdict is ${verdict === undefined || verdict === null ? "none" : String(verdict)}`;
    writeErr(
      `verify reopen: refused -- session ${n} cannot be reviewed again: ${found}, and only a session ` +
        `that closed ${VERDICT_REMEDIATED_AT_CAP}, or ${VERDICT_ISSUES_FOUND} short of an adjudication, can.\n`,
    );
    return EXIT_USAGE;
  }
  const reason = options.reason.trim();
  if (reason === "") {
    writeErr(
      "verify reopen: refused -- a review carries a reason. A round bought for no stated reason is " +
        "the bare override this row exists to replace.\n",
    );
    return EXIT_USAGE;
  }
  const author =
    [...rounds].reverse().map((row) => row["orchestrator_provider"]).find((value) => typeof value === "string") ??
    (record["orchestrator"] as Row | undefined)?.["provider"];
  const startCommit = record["startCommit"];
  if (last === undefined || typeof author !== "string" || typeof startCommit !== "string") {
    writeErr(
      `verify reopen: refused -- session ${n}'s record does not say ` +
        `${last === undefined ? "what its rounds were" : typeof author !== "string" ? "which provider authored it" : "where it started"}, ` +
        "so a review could not be held to it. Nothing was written.\n",
    );
    return EXIT_STATE;
  }

  let prompt: string;
  try {
    const review = closedSessionReview(repoRoot, sessionsDir, n, startCommit, rounds);
    prompt = buildVerificationPrompt(
      String(loadConfig()["_verification_template"] ?? ""),
      review.task,
      "session-verification",
      review.evidence,
    );
  } catch (error) {
    if (error instanceof VerifyError || error instanceof FactsError || error instanceof EvidenceTooLargeError) {
      writeErr(`verify reopen: ${error.message}\n`);
      return EXIT_UNAVAILABLE;
    }
    throw error;
  }

  let result: RouteResult;
  try {
    result = await dispatchVerification(prompt, {
      excludeProviders: [author],
      authorModel: ((record["orchestrator"] as Row | undefined)?.["model"] as string | undefined) ?? null,
      sessionNumber: n,
      repoRoot,
    });
  } catch (error) {
    if (error instanceof NoCandidateError) {
      writeErr(verificationUnavailable(sessionsDir, author, error));
      return EXIT_UNAVAILABLE;
    }
    if (error instanceof FundsError) {
      writeErr(`verify reopen: nothing was written and no round was spent.\n${error.message}\n`);
      return EXIT_FUNDS;
    }
    if (error instanceof RouterError) {
      writeErr(`verify reopen: the reviewer call failed twice: ${error.message}\nNothing was written.\n`);
      return EXIT_CALL_FAILED;
    }
    throw error;
  }
  if (result.truncated) {
    writeErr("verify reopen: the reviewer's response is truncated; nothing was written.\n");
    return EXIT_UNAVAILABLE;
  }

  const afterRound = Number(last["round"]);
  const round = afterRound + 1;
  const tree = runGit(repoRoot, ["rev-parse", "HEAD^{tree}"]).stdout.trim();
  const rawPath = saveRawOutput(repoRoot, n, round, result.content);
  const [said, issues] = parseVerificationResponse(result.content);
  const classification = classifyBlocking(said, issues);
  const findings = findingRows(issues, classification.blockingIssues);
  appendReopen(repoRoot, n, {
    schema_version: 1,
    session_number: n,
    after_round: afterRound,
    terminal: verdict === VERDICT_REMEDIATED_AT_CAP ? "remediated_at_cap" : "cap-reviewed",
    cap: round,
    reason,
    by: NOBODY_ON_THE_RECORD,
    tree_at_grant: tree,
    recorded_at: nowIso(),
    framework_version: VERSION,
  });
  appendRound(repoRoot, n, {
    round,
    phase: "full",
    verdict: said,
    blocking: classification.blocking,
    reviewer_model: result.model_name,
    reviewer_provider: result.provider,
    orchestrator_provider: author,
    findings,
    completion_tree: tree,
    previous_tree: last["completion_tree"],
    head_commit: headCommit(repoRoot),
    recorded_at: nowIso("microseconds"),
    transport: result.transport,
    requested_model: result.model_id,
    served_model: result.served_model_id ?? null,
    escalation_history: result.escalation_history.map((step) => [...step]),
    input_tokens: reportedInputTokens(result.input_tokens, result.metadata),
    output_tokens: result.output_tokens,
    premium_requests: costNumber(result.metadata["premium_requests"]),
    tool_calls: turnCount(result.metadata["tool_calls"]),
  });
  const substituted = substitutionNote(result.model_id, result.served_model_id ?? null);
  if (substituted !== null) writeErr(substituted);

  if (classification.blocking) {
    writeOut(
      `verify reopen: session ${n}, round ${round} -- ${said} with ` +
        `${classification.blockingIssues.length} blocking finding(s) (reviewer ` +
        `${result.model_name}/${result.provider}). Raw output: ${rawPath}\n` +
        classification.blockingIssues.map((issue) => `  - ${String(issue.description ?? "").split("\n")[0]}\n`).join("") +
        `Session ${n}'s verdict stays ${String(verdict)}. Plan a session that fixes these, ` +
        "then review the session again.\n",
    );
    return EXIT_BLOCKING;
  }
  recordClosedSessionVerified(sessionsDir, n, {
    rounds: round,
    verifierModel: result.model_name,
    verifierProvider: result.provider,
    transport: result.transport,
  });
  writeOut(
    `verify reopen: session ${n}, round ${round} -- ${sessionVerdict(said, false)} (reviewer ` +
      `${result.model_name}/${result.provider}); no blocking finding, so session ${n} is now ` +
      `${VERDICT_VERIFIED}. Raw output: ${rawPath}\n`,
  );
  // Committed and pushed as the close commits its own state: by path, so
  // nothing else in the tree rides along.
  const stateFile = join(sessionsDir, STATE_FILENAME);
  const committed = runGit(repoRoot, ["commit", "-m", `Verify session ${n} of ${basename(sessionsDir)} after its close`, "--", stateFile]);
  if (committed.code !== 0) {
    writeErr(`verify reopen: the verdict is written but the commit failed: ${committed.stderr}\n`);
    return EXIT_STATE;
  }
  if (!existsSync(join(repoRoot, ".dabbler", "local-only"))) {
    const pushed = runGit(repoRoot, ["push"]);
    if (pushed.code !== 0) {
      writeErr(`verify reopen: the verdict is written and committed but the push failed: ${pushed.stderr}. Run \`git push\`.\n`);
      return EXIT_STATE;
    }
  }
  return EXIT_OK;
}
