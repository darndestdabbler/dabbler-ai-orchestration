// Buying verification rounds past a cap terminal -- the operator's answer to
// a loop the budget ended while the work still needed reviewing.
//
// The framework decides everything about a verification round except how
// many a repository is willing to pay for, and that last one is a person's.
// Before this verb the cap was answerable only BEFORE it was reached: once
// `terminateAtCap` wrote its row, `noRoundReason` returned `terminal` ahead
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
// become the ordinary way to raise a cap. And it carries a reason and an
// approver forever, because the whole difference between this and a waiver
// is that a waiver accepted work over a standing finding while this buys
// the review that would settle one.

import { writeErr, writeOut } from "../output.ts";
import { repoRootFor } from "../evidence.ts";
import { loadConfig, verificationRoundCap } from "../config.ts";
import { nowIso, snapshotWorktreeTree } from "../journal.ts";
import {
  LedgerError,
  ROW_ADJUDICATION,
  appendReopen,
  readRounds,
  standingReopen,
  type Row,
} from "../ledger.ts";
import { readSessionState } from "../progress.ts";
import { VERSION } from "../version.ts";
import { EXIT_OK, EXIT_STATE, EXIT_USAGE } from "./errors.ts";
import {
  NO_ROUND_CAP_CLEAN,
  NO_ROUND_CAP_DISPUTED,
  NO_ROUND_TERMINAL,
  noRoundReason,
  standingTerminal,
} from "./rounds.ts";

export interface ReopenOptions {
  /** How many further rounds this grant buys. */
  readonly rounds: number;
  readonly reason: string;
  readonly approver: string;
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
      '"<why>" --approver <who>`. Run the round:\n  dabbler verify',
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
  const approver = options.approver.trim();
  if (reason === "" || approver === "") {
    writeErr(
      "verify reopen: refused -- a grant carries a reason and an approver. " +
        "Rounds bought by nobody, for no stated reason, are the bare " +
        "override this row exists to replace.\n",
    );
    return EXIT_USAGE;
  }

  const priorRounds = readRounds(repoRoot, current);
  const cap = verificationRoundCap(loadConfig());
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
    approver,
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

  writeOut(
    `Reopened session ${current}'s verification after round ` +
      `${stuck.afterRound} (${stuck.terminal}).\n` +
      `  ${options.rounds} further round(s) bought; the cap is now ` +
      `${record["cap"] as number}.\n` +
      `  Approved by: ${approver}\n` +
      `  Reason: ${reason}\n` +
      "\nThe grant is on the record and buys rounds, never a verdict: " +
      "nothing is verified until a round says so, and reaching the new cap " +
      "stops the session again. Run the round:\n" +
      `  dabbler verify --sessions-dir ${sessionsDir}\n`,
  );
  return EXIT_OK;
}
