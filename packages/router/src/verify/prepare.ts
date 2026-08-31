// The critique pipeline's entry point: `verify prepare`.
//
// Additive and off by default. It derives the `change-id` from the reviewed
// tree, records the author's claims as the canonical `review-claims.json`,
// and opens the review run. It decides nothing -- no round, no verdict and
// no gate reads what it writes.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { writeErr, writeOut } from "../cli/output.ts";
import {
  CRITIQUE_PIPELINE_DEFAULT,
  CRITIQUE_PIPELINE_SHADOW,
  loadConfig,
} from "../config.ts";
import {
  readReviewClaims,
  readReviewRuns,
  screenReviewClaims,
  writeReviewClaims,
  writeReviewClaimsTwin,
  writeReviewRun,
} from "../critique.ts";
import { repoRootFor, runGit, snapshotWorktreeTree } from "../evidence.ts";
import { nowIso } from "../journal.ts";
import { LedgerError, type Row } from "../ledger.ts";
import { readSessionState } from "../progress.ts";
import { pythonRepr } from "../pythonJson.ts";
import { dirname } from "node:path";
import {
  ChangeIdSuppliedError,
  EXIT_CALL_FAILED,
  EXIT_OK,
  EXIT_STATE,
  EXIT_USAGE,
  VerifyError,
} from "./errors.ts";

export const CHANGE_ID_LENGTH = 16;

/**
 * The reviewed change's identity: a digest over the two tree objects that
 * bound it. Pure and reproducible -- the same reviewed tree always yields
 * the same id, and nothing outside this function produces one.
 */
export function deriveChangeId(
  baselineTree: string | null,
  completionTree: string,
): string {
  if (!completionTree) {
    throw new VerifyError(
      "cannot derive a change-id: the working tree could not be snapshotted",
    );
  }
  const payload = `baseline=${baselineTree ?? ""}\ncompletion=${completionTree}`;
  // `evidence.hashBytes` carries a `sha256:` prefix, and the id is the
  // bare hex prefix Python takes -- so the digest is spelled out here.
  return createHash("sha256")
    .update(Buffer.from(payload, "utf8"))
    .digest("hex")
    .slice(0, CHANGE_ID_LENGTH);
}

function headTree(repoRoot: string): string | null {
  const result = runGit(repoRoot, ["rev-parse", "HEAD^{tree}"]);
  return result.code === 0 && result.stdout ? result.stdout : null;
}

/**
 * The author's claims, as a list. A missing path is no claims at all, which
 * is a valid input and is not the same as a missing claims file.
 */
export function loadAuthorClaims(claimsPath: string | null): unknown[] {
  if (claimsPath === null) return [];
  let payload: unknown;
  let text: string;
  try {
    text = readFileSync(claimsPath, "utf8");
  } catch (error) {
    throw new VerifyError(
      `claims file unreadable: ${(error as Error).message}`,
    );
  }
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new VerifyError(
      `claims file is not valid JSON: ${(error as Error).message}`,
    );
  }
  let claims: unknown = payload;
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    const object = payload as Record<string, unknown>;
    if ("change_id" in object) {
      throw new ChangeIdSuppliedError(
        `${claimsPath} supplies a change_id. The change-id is derived from ` +
          "the reviewed tree by this command and cannot be supplied; " +
          "remove the key and re-run.",
      );
    }
    if (!("claims" in object)) {
      throw new VerifyError(
        `${claimsPath} is an object with no 'claims' key. Supply ` +
          '{"claims": [...]} — an explicit empty list is the way to ' +
          "say the author claims nothing. A bare claim object is not " +
          "read as a claims file, because reading it as zero claims " +
          "would silently discard what the author wrote.",
      );
    }
    claims = object["claims"];
  }
  if (!Array.isArray(claims)) {
    throw new VerifyError(
      `${claimsPath} must hold a list of claims, or an object with a ` +
        "'claims' list",
    );
  }
  return claims;
}

/**
 * The human-readable twin of review-claims.json. Decorative: nothing parses
 * it, and deleting it changes no behavior.
 */
export function renderClaimsMarkdown(record: Row): string {
  const lines = [
    `# Review claims — change ${String(record["change_id"])}`,
    "",
    "Generated from `review-claims.json`, which is the artifact code " +
      "reads. This rendering is for people; nothing parses it.",
    "",
    `- Attempt: ${String(record["attempt"] ?? 1)}`,
    `- Recorded: ${String(record["recorded_at"])}`,
    "",
  ];
  const claims = (record["claims"] as Row[] | undefined) ?? [];
  if (claims.length === 0) {
    lines.push("The author claims nothing about this change.");
  }
  for (const claim of claims) {
    lines.push(`## ${String(claim["claim_id"])}`);
    lines.push("");
    lines.push(String(claim["statement"]));
    if (claim["kind"]) {
      lines.push("");
      lines.push(`- Kind: ${String(claim["kind"])}`);
    }
    for (const path of (claim["paths"] as string[] | undefined) ?? []) {
      lines.push(`- Path: \`${path}\``);
    }
    lines.push("");
  }
  return lines.join("\n").replace(/\s+$/, "") + "\n";
}

/**
 * Open (or extend) the review run for the current working tree and record
 * the author's claims under the machine-owned run directory.
 *
 * A remediation does not open a second review run: it links a new attempt
 * onto the one already open for this session, so the prior attempt's
 * evidence stays exactly where it was recorded.
 */
export function runPrepare(
  sessionsDir: string,
  options: { claimsPath?: string | null } = {},
): number {
  const claimsPath = options.claimsPath ?? null;
  const repoRoot = repoRootFor(sessionsDir);
  if (repoRoot === null) {
    writeErr(`verify prepare: not inside a git repository: ${sessionsDir}\n`);
    return EXIT_STATE;
  }
  const state = readSessionState(sessionsDir);
  const current = (state ?? {})["currentSession"] as number | null | undefined;
  if (current === null || current === undefined) {
    writeErr(
      `verify prepare: no session is in flight under ${sessionsDir}; run ` +
        "start_session first.\n",
    );
    return EXIT_STATE;
  }

  const config = loadConfig();
  const critique = config["critique"];
  const mode =
    critique !== null && typeof critique === "object"
      ? ((critique as Record<string, unknown>)["pipeline"] ??
        CRITIQUE_PIPELINE_DEFAULT)
      : CRITIQUE_PIPELINE_DEFAULT;
  if (mode !== CRITIQUE_PIPELINE_SHADOW) {
    writeErr(
      `verify prepare: refused -- critique.pipeline is ${pythonRepr(mode)}, which ` +
        "writes nothing. Set it to " +
        `${pythonRepr(CRITIQUE_PIPELINE_SHADOW)} in router-config.yaml (or in the ` +
        "project-local local-overrides.yaml) to record critique " +
        "artifacts without letting them decide anything.\n",
    );
    return EXIT_USAGE;
  }

  let claims: unknown[];
  try {
    claims = loadAuthorClaims(claimsPath);
  } catch (error) {
    if (!(error instanceof VerifyError)) throw error;
    writeErr(`verify prepare: ${error.message}\n`);
    return EXIT_USAGE;
  }

  const completionTree = snapshotWorktreeTree(repoRoot);
  if (completionTree === null) {
    writeErr(
      "verify prepare: could not snapshot the working tree; nothing recorded.\n",
    );
    return EXIT_CALL_FAILED;
  }
  const baselineTree = headTree(repoRoot);
  const now = nowIso("microseconds");

  let run: Row;
  let changeId: string;
  let attempt: number;
  let claimsRecord: Row;
  try {
    const existing = readReviewRuns(repoRoot, current);
    if (existing.length > 0) {
      const open = existing[existing.length - 1] as Row;
      changeId = String(open["change_id"]);
      const attempts = [...(open["attempts"] as Row[])];
      const previous = attempts[attempts.length - 1] as Row;
      attempt = Number(previous["attempt"]) + 1;
      attempts.push({
        attempt,
        opened_at: now,
        baseline_tree: baselineTree,
        completion_tree: completionTree,
        previous_attempt: previous["attempt"],
        status: "open",
      });
      run = { ...open, attempts };
      if (claimsPath === null) {
        // Silence on a remediation means the claims are unchanged, not that
        // the author has withdrawn them. Only an explicit --claims replaces
        // what is on the record.
        const prior = readReviewClaims(repoRoot, current, changeId);
        claims = ((prior ?? {})["claims"] as unknown[] | undefined) ?? claims;
      }
    } else {
      changeId = deriveChangeId(baselineTree, completionTree);
      attempt = 1;
      run = {
        schema_version: 1,
        change_id: changeId,
        session_number: current,
        opened_at: now,
        attempts: [
          {
            attempt: 1,
            opened_at: now,
            baseline_tree: baselineTree,
            completion_tree: completionTree,
            previous_attempt: null,
            status: "open",
          },
        ],
      };
    }

    claimsRecord = {
      schema_version: 1,
      change_id: changeId,
      attempt,
      recorded_at: now,
      claims,
    };
  } catch (error) {
    if (error instanceof LedgerError) {
      writeErr(`verify prepare: ${error.message}\n`);
      return EXIT_STATE;
    }
    if (error instanceof VerifyError) {
      writeErr(`verify prepare: ${error.message}\n`);
      return EXIT_CALL_FAILED;
    }
    throw error;
  }

  // Author-supplied content is screened before any machine state moves: a
  // refusal must leave no opened attempt behind for the retry to stumble
  // over, and must still preserve what it rejected.
  try {
    screenReviewClaims(repoRoot, current, claimsRecord);
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    writeErr(
      `verify prepare: ${error.message} No attempt was opened. Correct the ` +
        "claims file and re-run.\n",
    );
    return EXIT_USAGE;
  }

  let runPath: string;
  try {
    runPath = writeReviewRun(repoRoot, current, run);
    writeReviewClaims(repoRoot, current, claimsRecord);
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    writeErr(`verify prepare: ${error.message}\n`);
    return EXIT_STATE;
  }
  writeReviewClaimsTwin(
    repoRoot,
    current,
    changeId,
    renderClaimsMarkdown(claimsRecord),
  );

  writeOut(
    `verify prepare: change ${changeId}, attempt ${attempt} ` +
      `(${claims.length} claim(s)) recorded under ${dirname(runPath)}\n`,
  );
  return EXIT_OK;
}
