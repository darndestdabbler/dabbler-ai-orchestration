// The dispute channel, and the adjudication that ends a capped impasse.
//
// A contested finding has a channel: `verify dispute` records an
// evidence-backed rebuttal (never prose alone), and the next round presents
// it beside the finding it contests for UPHOLD-or-WITHDRAW -- so a scope
// dispute converges instead of being re-raised until the cap.
//
// When the cap is reached with every blocking finding disputed, `verify
// adjudicate` routes the disputes to a third provider -- one excluded harder
// than any verifier: the orchestrator's provider AND every provider that
// verified a round are all ineligible. The adjudicator judges each dispute
// (UPHOLD or OVERRULE; it may not raise new findings) and its outcome lands
// as one terminal `type: "adjudication"` ledger row the existing close gate
// reads unchanged. One adjudication per session, ever; no verification round
// may open after it.

import { statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import { writeErr, writeOut } from "../output.ts";
import { loadConfig, verificationRoundCap } from "../config.ts";
import { repoRootFor, runGit, snapshotWorktreeTree } from "../evidence.ts";
import { buildDiffPathspecs, checkEvidenceCap } from "../facts.ts";
import {
  IdentityResolutionError,
  resolveSessionOrchestratorIdentity,
  type OrchestratorIdentity,
} from "../identity.ts";
import { nowIso } from "../journal.ts";
import {
  LedgerError,
  TERMINAL_ROW_TYPES,
  appendDispute,
  appendRound,
  readDisputes,
  readRounds,
  saveRawOutput,
  type Row,
} from "../ledger.ts";
import { readSessionState } from "../progress.ts";
import { pythonRepr } from "../pythonJson.ts";
import { NoCandidateError, RouterError, type RouteResult } from "../route.ts";
import {
  OUTCOME_OVERRULED,
  VERDICT_ISSUES_FOUND,
  VERDICT_VERIFIED,
  parseAdjudicationResponse,
} from "../verdict.ts";
import { appendChangeLogBlock, recordSessionVerification } from "../writers.ts";
import {
  EXIT_BLOCKING,
  EXIT_CALL_FAILED,
  EXIT_OK,
  EXIT_STATE,
  EXIT_UNAVAILABLE,
  EXIT_USAGE,
} from "./errors.ts";
import {
  DISPUTE_EVIDENCE_INLINE_CAP,
  adjudicationPrompt,
  sliceCodePoints,
  splitEvidenceRange,
  type DisputedFinding,
} from "./prompts.ts";

/**
 * `[repo-relative-posix-path, null]` for an existing path inside the repo,
 * else `[null, "outside" | "missing"]`. Relative and absolute forms get the
 * same containment check -- `../elsewhere` may exist, but it is not the
 * repo's record.
 */
export function resolveRepoRelative(
  root: string,
  token: string,
): readonly [string | null, string | null] {
  let rel: string;
  try {
    const resolved = isAbsolute(token)
      ? resolve(token)
      : resolve(root, token);
    rel = relative(resolve(root), resolved);
    // Python's `Path.relative_to` raises when the target is not under the
    // root; `path.relative` answers with a `..` prefix instead, so the
    // escape is detected rather than reported as a path.
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
      return [null, "outside"];
    }
  } catch {
    return [null, "missing"];
  }
  try {
    if (!statSync(resolve(root, rel)).isFile()) return [null, "missing"];
  } catch {
    return [null, "missing"];
  }
  return [rel.replace(/\\/g, "/"), null];
}

/**
 * Record the orchestrator's rebuttal of one recorded finding. The dispute is
 * immutable and rides into the next round's prompt beside the finding it
 * contests, where the verifier must engage it -- UPHOLD or WITHDRAW --
 * instead of re-raising it unanswered.
 */
export function recordDispute(
  sessionsDir: string,
  options: {
    roundNumber: number;
    findingIndex: number;
    grounds: string;
    evidence: readonly string[];
  },
): number {
  const repoRoot = repoRootFor(sessionsDir);
  if (repoRoot === null) {
    writeErr(`verify dispute: not inside a git repository: ${sessionsDir}\n`);
    return EXIT_STATE;
  }
  const state = readSessionState(sessionsDir);
  const current = (state ?? {})["currentSession"] as number | null | undefined;
  if (current === null || current === undefined) {
    writeErr(
      `verify dispute: no session is in flight under ${sessionsDir}; a ` +
        "dispute belongs to the session whose round it contests.\n",
    );
    return EXIT_STATE;
  }

  if ((options.grounds || "").trim() === "") {
    writeErr("verify dispute: --grounds must be non-empty\n");
    return EXIT_USAGE;
  }
  if (options.evidence.length === 0) {
    writeErr(
      "verify dispute: refused -- a dispute is an argument from the " +
        "record, not a complaint; prose-only disputes are refused. Cite " +
        "at least one existing repo path with --evidence.\n",
    );
    return EXIT_USAGE;
  }

  const cited: string[] = [];
  for (const raw of options.evidence) {
    let [rel, why] = resolveRepoRelative(repoRoot, raw);
    let suffix = "";
    if (rel === null && why === "missing") {
      // Not a bare path: accept `path:START[-END]` line-range cites, so a
      // passage deep in a large file can be cited precisely.
      const range = splitEvidenceRange(raw);
      if (
        range.start !== null &&
        range.end !== null &&
        range.start >= 1 &&
        range.start <= range.end
      ) {
        [rel, why] = resolveRepoRelative(repoRoot, range.path);
        if (rel !== null) suffix = `:${range.start}-${range.end}`;
      }
    }
    if (rel === null) {
      const reason =
        why === "outside"
          ? "is outside the repository"
          : "does not name a file in the repository";
      writeErr(
        `verify dispute: refused -- evidence path ${pythonRepr(raw)} ` +
          `${reason}; a dispute cites the repo's own record.\n`,
      );
      return EXIT_USAGE;
    }
    if (!suffix) {
      // A bare cite of an oversized file would silently drop its tail at
      // render time; refuse it now, naming the exit.
      const size = statSync(resolve(repoRoot, rel)).size;
      if (size > DISPUTE_EVIDENCE_INLINE_CAP) {
        writeErr(
          `verify dispute: refused -- ${rel} is ${size} bytes, ` +
            "over the inline cap " +
            `(${DISPUTE_EVIDENCE_INLINE_CAP}); cite the relevant ` +
            `passage as ${rel}:START-END so it rides the prompt ` +
            "whole instead of being truncated.\n",
        );
        return EXIT_USAGE;
      }
    }
    cited.push(rel + suffix);
  }

  const rounds = readRounds(repoRoot, current);
  const target = rounds.find((row) => row["round"] === options.roundNumber);
  if (target === undefined) {
    const recorded = rounds.map((row) => row["round"]);
    writeErr(
      `verify dispute: round ${options.roundNumber} is not recorded for ` +
        `session ${current} (recorded rounds: ` +
        `${recorded.length > 0 ? `[${recorded.join(", ")}]` : "none"}).\n`,
    );
    return EXIT_STATE;
  }
  const findings = Array.isArray(target["findings"])
    ? (target["findings"] as Row[])
    : [];
  if (!(options.findingIndex >= 0 && options.findingIndex < findings.length)) {
    const listing = findings
      .map(
        (finding, index) =>
          `  ${index}. [${String(finding["severity"])}] ` +
          `${sliceCodePoints(String(finding["description"] ?? ""), 120)}`,
      )
      .join("\n");
    writeErr(
      `verify dispute: finding ${options.findingIndex} does not exist in ` +
        `round ${options.roundNumber}. Its findings, by 0-based index:\n` +
        `${listing || "  (none)"}\n`,
    );
    return EXIT_STATE;
  }

  const row: Row = {
    round: options.roundNumber,
    finding_index: options.findingIndex,
    // The latest round at filing time: the first round recorded after this
    // presents the rebuttal, and later rounds treat the dispute as settled
    // by that round's findings instead of re-litigating it.
    filed_after_round: (rounds[rounds.length - 1] as Row)["round"],
    grounds: options.grounds.trim(),
    evidence_paths: cited,
    recorded_at: nowIso("microseconds"),
  };
  try {
    appendDispute(repoRoot, current, row);
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    writeErr(`verify dispute: ${error.message}\n`);
    return EXIT_STATE;
  }
  writeOut(
    `verify dispute: recorded against round ${options.roundNumber} finding ` +
      `${options.findingIndex}. The next verification round presents the ` +
      "rebuttal beside the finding for UPHOLD-or-WITHDRAW.\n",
  );
  return EXIT_OK;
}


/**
 * The exclusion superset: the orchestrator's effective provider AND every
 * provider that verified any round. The adjudicator is a third voice, never
 * a repeat one.
 */
export function adjudicationExclusions(
  orchestrator: OrchestratorIdentity,
  rounds: readonly Row[],
): string[] {
  const providers = new Set<string>([orchestrator.effectiveProvider]);
  for (const row of rounds) {
    const provider = row["verifier_provider"];
    if (provider) providers.add(String(provider));
  }
  return [...providers].sort();
}

/**
 * Indices of the latest round's blocking findings that carry no recorded
 * dispute -- the machine path is not exhausted while any remain.
 */
export function undisputedBlockingIndices(
  latest: Row,
  disputes: readonly Row[],
): number[] {
  const disputed = new Set(
    disputes.map((row) => `${String(row["round"])}:${String(row["finding_index"])}`),
  );
  const findings = Array.isArray(latest["findings"])
    ? (latest["findings"] as Row[])
    : [];
  const indices: number[] = [];
  findings.forEach((finding, index) => {
    if (
      finding["blocking"] !== false &&
      !disputed.has(`${String(latest["round"])}:${index}`)
    ) {
      indices.push(index);
    }
  });
  return indices;
}

/**
 * Route the session's recorded disputes to a third provider for judgment.
 * Machine-checked preconditions, each refusal naming the unmet one; the
 * outcome is one terminal ledger row the existing `verification_clean` gate
 * already knows how to read.
 */
export async function runAdjudication(
  sessionsDir: string,
  options: { maxRounds?: number | null; transport?: string | null } = {},
): Promise<number> {
  const { dispatchVerification } = await import("./rounds.ts");

  const repoRoot = repoRootFor(sessionsDir);
  if (repoRoot === null) {
    writeErr(`verify adjudicate: not inside a git repository: ${sessionsDir}\n`);
    return EXIT_STATE;
  }
  const state = readSessionState(sessionsDir);
  const current = (state ?? {})["currentSession"] as number | null | undefined;
  if (current === null || current === undefined) {
    writeErr(`verify adjudicate: no session is in flight under ${sessionsDir}.\n`);
    return EXIT_STATE;
  }

  let orchestrator: OrchestratorIdentity;
  try {
    orchestrator = resolveSessionOrchestratorIdentity(sessionsDir, current);
  } catch (error) {
    if (!(error instanceof IdentityResolutionError)) throw error;
    writeErr(`verify adjudicate: ${error.message}\n`);
    return EXIT_STATE;
  }

  const config = loadConfig();
  const cap = options.maxRounds || verificationRoundCap(config);
  const rounds = readRounds(repoRoot, current);
  if (rounds.some((row) => row["type"] === "adjudication")) {
    writeErr(
      "verify adjudicate: refused -- unmet precondition: session " +
        `${current} already carries its adjudication row. One ` +
        "adjudication per session, ever.\n",
    );
    return EXIT_STATE;
  }
  const terminal = rounds.find((row) => TERMINAL_ROW_TYPES.has(String(row["type"])));
  if (terminal !== undefined) {
    writeErr(
      `verify adjudicate: refused -- session ${current} already ` +
        `carries its terminal '${String(terminal["type"])}' row ` +
        `(${String(terminal["verdict"])}); there is nothing left to ` +
        "adjudicate. Close the session:\n" +
        `  dabbler session close --sessions-dir ` +
        `${sessionsDir}\n`,
    );
    return EXIT_STATE;
  }
  const latest = rounds.length > 0 ? (rounds[rounds.length - 1] as Row) : null;
  if (latest === null || Number(latest["round"]) < cap) {
    const reached = latest !== null ? latest["round"] : 0;
    writeErr(
      "verify adjudicate: refused -- unmet precondition: the round " +
        `cap (${cap}) is not reached (recorded rounds: ${String(reached)}). ` +
        "Adjudication is the exit from a capped impasse, not a " +
        "shortcut around remediation.\n",
    );
    return EXIT_STATE;
  }
  if (!latest["blocking"]) {
    writeErr(
      "verify adjudicate: refused -- unmet precondition: the latest " +
        `round (${String(latest["round"])}) is not blocking; there is no ` +
        "impasse to adjudicate. Close the session.\n",
    );
    return EXIT_STATE;
  }

  const disputes = readDisputes(repoRoot, current);
  const byKey = new Map(
    disputes.map((row) => [
      `${String(row["round"])}:${String(row["finding_index"])}`,
      row,
    ]),
  );
  const findings = Array.isArray(latest["findings"])
    ? (latest["findings"] as Row[])
    : [];
  const blockingIndices: number[] = [];
  findings.forEach((finding, index) => {
    if (finding["blocking"] !== false) blockingIndices.push(index);
  });
  const undisputed = undisputedBlockingIndices(latest, disputes);
  if (undisputed.length > 0) {
    writeErr(
      "verify adjudicate: refused -- unmet precondition: blocking " +
        `finding(s) ${undisputed.join(", ")} of round ${String(latest["round"])} ` +
        "carry no recorded dispute. Adjudication judges disputes; record one " +
        "per finding first:\n" +
        `  dabbler verify dispute --sessions-dir ` +
        `${sessionsDir} --round ${String(latest["round"])} --finding <F> ` +
        '--grounds "..." --evidence <path>\n',
    );
    return EXIT_STATE;
  }

  const currentTree = snapshotWorktreeTree(repoRoot);
  if (currentTree === null) {
    writeErr(
      "verify adjudicate: could not snapshot the working tree " +
        "(failing closed).\n",
    );
    return EXIT_CALL_FAILED;
  }
  const diff = runGit(repoRoot, [
    "diff",
    "--no-color",
    String(latest["completion_tree"]),
    currentTree,
    "--",
    ...buildDiffPathspecs(),
  ]);
  if (diff.code !== 0) {
    writeErr(`verify adjudicate: fix-delta diff failed: ${diff.stderr}\n`);
    return EXIT_CALL_FAILED;
  }

  const disputed: DisputedFinding[] = blockingIndices.map((index) => ({
    round: Number(latest["round"]),
    index,
    finding: findings[index] as Row,
    dispute: byKey.get(`${String(latest["round"])}:${index}`) as Row,
  }));
  const prompt = adjudicationPrompt(disputed, diff.stdout, repoRoot);
  checkEvidenceCap(prompt);

  const excluded = adjudicationExclusions(orchestrator, rounds);
  let result: RouteResult;
  try {
    result = await dispatchVerification(prompt, {
      excludeProviders: excluded,
      sessionNumber: current,
      transport: options.transport ?? null,
    });
  } catch (error) {
    if (error instanceof NoCandidateError) {
      writeErr(
        "verify adjudicate: VERIFICATION UNAVAILABLE -- no eligible " +
          "adjudicator exists outside the excluded providers " +
          `(${excluded.join(", ")}). Reason: ${error.message}\n` +
          "No verdict was written; the close stays BLOCKED and the " +
          "session is UNRESOLVED — its disputed findings stand unjudged " +
          "and nothing lands but the record.\n" +
          "The one exit is a third provider: enable a model from outside " +
          "the exclusions and re-run:\n" +
          `  dabbler verify adjudicate --sessions-dir ` +
          `${sessionsDir}\n` +
          "There is no verdict a person can type in its place.\n",
      );
      return EXIT_UNAVAILABLE;
    }
    if (error instanceof RouterError) {
      writeErr(
        `verify adjudicate: routed adjudication call failed: ${error.message}\n` +
          "Nothing was written. Retry once; if the second provider also " +
          "fails, escalate to the operator.\n",
      );
      return EXIT_CALL_FAILED;
    }
    throw error;
  }

  if (result.truncated) {
    writeErr(
      "verify adjudicate: the adjudicator response is truncated — " +
        "invalid evidence; nothing was written.\n",
    );
    return EXIT_UNAVAILABLE;
  }

  const roundNumber = Number(latest["round"]) + 1;
  const rawPath = saveRawOutput(repoRoot, current, roundNumber, result.content);

  const judged = parseAdjudicationResponse(result.content, disputed.length);
  const outcomes = disputed.map((entry, position) => ({
    finding_index: entry.index,
    outcome: (judged[position] as { outcome: string }).outcome,
    reasons: (judged[position] as { reasons: string }).reasons,
  }));
  const allOverruled = outcomes.every(
    (outcome) => outcome.outcome === OUTCOME_OVERRULED,
  );
  const verdict = allOverruled ? VERDICT_VERIFIED : VERDICT_ISSUES_FOUND;

  const row: Row = {
    round: roundNumber,
    type: "adjudication",
    verdict,
    blocking: !allOverruled,
    verifier_model: result.model_name,
    verifier_provider: result.provider,
    orchestrator_provider: orchestrator.effectiveProvider,
    findings: [],
    outcomes,
    excluded_providers: excluded,
    completion_tree: currentTree,
    previous_tree: latest["completion_tree"],
    recorded_at: nowIso("microseconds"),
    transport: result.transport,
  };
  appendRound(repoRoot, current, row);

  const outcomeLines = outcomes
    .map(
      (outcome) =>
        `- Dispute on round ${String(latest["round"])} finding ` +
        `${outcome.finding_index}: ${outcome.outcome}` +
        (outcome.reasons ? ` — ${outcome.reasons}` : ""),
    )
    .join("\n");
  if (!allOverruled) {
    const upheld = outcomes.filter(
      (outcome) => outcome.outcome !== OUTCOME_OVERRULED,
    ).length;
    writeOut(
      `verify adjudicate: ${verdict} — the adjudicator ` +
        `(${result.model_name}/${result.provider}) upheld ${upheld} of ` +
        `${outcomes.length} disputed finding(s); the session is ` +
        `UNRESOLVED and the close stays BLOCKED. Raw output: ` +
        `${rawPath}\n${outcomeLines}\n` +
        "Nothing lands but the record. The upheld finding(s) stand, " +
        "and no further verification round may open this session, so " +
        "remediation is a follow-up session's work — read this record " +
        "at the next planning session.\n",
    );
    return EXIT_BLOCKING;
  }

  recordSessionVerification(sessionsDir, current, verdict, {
    rounds: roundNumber,
    verifierModel: result.model_name,
    verifierProvider: result.provider,
    transport: result.transport,
  });
  appendChangeLogBlock(
    sessionsDir,
    `## Session ${current} adjudication — ${verdict} (every disputed ` +
      `finding OVERRULED)\n\n` +
      `- Adjudicator: ${result.model_name} (${result.provider}) over ` +
      `${result.transport}\n` +
      `- Excluded providers: ${excluded.join(", ")}\n` +
      `${outcomeLines}\n` +
      `- Raw round output: \`.dabbler/runs/s${current}/\`\n`,
  );
  writeOut(
    `verify adjudicate: ${verdict} — the adjudicator ` +
      `(${result.model_name}/${result.provider}) overruled every ` +
      `disputed finding; session ${current} is clear to close.\n` +
      `${outcomeLines}\n`,
  );
  return EXIT_OK;
}
