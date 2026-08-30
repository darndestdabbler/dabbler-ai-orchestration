// Recovering a round's diff base when the tree it recorded is not in this
// object store -- the case a session that moved between machines arrives in.
//
// Every refusal here exists so this cannot become a way to choose one's own
// review scope. It is refused while the recorded tree resolves, it is refused
// a second time for the same round, and the substitute must be the single
// commit `legalAnchor` allows.

import { writeErr, writeOut } from "../cli/output.ts";
import { objectExists, repoRootFor, runGit } from "../evidence.ts";
import { nowIso } from "../journal.ts";
import { LedgerError, appendReanchor, readRounds, type Row } from "../ledger.ts";
import { readSessionState } from "../progress.ts";
import { pythonRepr } from "../pythonJson.ts";
import { EXIT_STATE, EXIT_USAGE } from "./errors.ts";

/**
 * The one commit a round may be re-anchored onto: the last one made at or
 * before the round, or `[null, reason]`.
 *
 * Only one, and deliberately the conservative one. The tempting second
 * candidate is the first commit made *after* the round, on the reasoning
 * that a round reviews an uncommitted working tree and that commit is what
 * the tree became. But nothing here can check that reasoning. Remediation
 * normally begins the moment a round reports, so the first post-round commit
 * is at least as likely to *contain* fixes as to materialize the reviewed
 * tree -- and accepting it would drop those fixes out of the next round,
 * which is the exact defect this rule exists to prevent. A timestamp cannot
 * tell the two apart, and the only evidence that could is the recorded
 * completion tree, which by definition is missing whenever this path runs.
 *
 * So the baseline lands before the round and the next round re-reviews the
 * session's own work. That is expensive and it is the point: on a recovery
 * path taken only when a session changes machines, paying a wider review is
 * the right trade against silently narrowing one.
 */
export function legalAnchor(
  repoRoot: string,
  head: string,
  recordedAt: unknown,
  roundHead: string | null = null,
): readonly [string | null, string] {
  if (roundHead) {
    // The round told us where it stood. Nothing to infer: that commit is the
    // last one it could not have reported on, and no date is consulted.
    // Older rows predate this field and fall through to the timestamp walk
    // below.
    const ancestry = runGit(repoRoot, [
      "merge-base",
      "--is-ancestor",
      roundHead,
      head,
    ]);
    if (ancestry.code !== 0) {
      return [
        null,
        `the round recorded HEAD as ${roundHead.slice(0, 12)}, which is not ` +
          "an ancestor of the current HEAD. This history has been " +
          "rewritten since the round, and no baseline can be placed " +
          "on it (failing closed).",
      ];
    }
    return [
      roundHead,
      `Round HEAD was ${roundHead.slice(0, 12)}, so that commit is the last ` +
        "one the round could not have reported on.",
    ];
  }

  const log = runGit(repoRoot, [
    "log",
    "--first-parent",
    "--format=%H %cI",
    head,
  ]);
  if (log.code !== 0 || log.stdout.trim() === "") {
    return [null, "the commit history could not be read (failing closed)"];
  }
  const moment = parseIsoMoment(recordedAt);
  if (moment === null) {
    return [
      null,
      `the round records an unreadable timestamp ${pythonRepr(recordedAt)}, so ` +
        "no anchor can be placed against it (failing closed)",
    ];
  }
  const history: Array<readonly [string, number]> = []; // newest first
  for (const line of log.stdout.split("\n")) {
    const space = line.indexOf(" ");
    const sha = space === -1 ? line : line.slice(0, space);
    const when = space === -1 ? "" : line.slice(space + 1);
    const stamped = parseIsoMoment(when.trim());
    if (stamped === null) {
      return [null, `commit ${sha.slice(0, 12)} has an unreadable date`];
    }
    history.push([sha, stamped]);
  }
  // Oldest first, and the anchor is the newest commit of the unbroken run of
  // pre-round commits from the root. Scanning newest-first for the first
  // "date <= moment" would trust a committer date to mean commit order, and
  // it does not: that field is user-controlled to the second, so a
  // remediation commit dated backwards would be picked as a baseline that
  // predates the fixes sitting underneath it. Stopping at the first
  // post-round commit means a backdated one lands beyond the boundary and
  // can never be selected, whatever it claims about when it happened.
  let anchor: string | null = null;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const [sha, stamped] = history[index] as readonly [string, number];
    if (stamped > moment) break;
    anchor = sha;
  }
  if (anchor !== null) {
    return [
      anchor,
      `The round was recorded at ${String(recordedAt)}, so ${anchor.slice(0, 12)} is ` +
        "the newest commit reachable without crossing anything the " +
        "round could have reported.",
    ];
  }
  return [
    null,
    `every commit in this history postdates the round (${String(recordedAt)}), ` +
      "so all of them may carry remediation and none can serve as a " +
      "baseline. There is nothing to re-anchor onto.",
  ];
}

/**
 * An ISO-8601 instant as milliseconds, or null.
 *
 * `Date.parse` accepts a superset of what Python's `fromisoformat` does, so
 * the shapes this reads -- a router-written `recorded_at` and git's `%cI` --
 * are the ones both agree on. A value neither can read is the refusal above.
 */
function parseIsoMoment(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}


/**
 * Recover the diff base of the latest round when its recorded tree is
 * unreachable here, by naming a commit-reachable tree to measure from
 * instead.
 */
export function runReanchor(
  sessionsDir: string,
  commit: string,
  reason: string,
): number {
  const repoRoot = repoRootFor(sessionsDir);
  if (repoRoot === null) {
    writeErr(`verify reanchor: not inside a git repository: ${sessionsDir}\n`);
    return EXIT_STATE;
  }
  const state = readSessionState(sessionsDir);
  const current = (state ?? {})["currentSession"] as number | null | undefined;
  if (current === null || current === undefined) {
    writeErr(`verify reanchor: no session is in flight under ${sessionsDir}.\n`);
    return EXIT_STATE;
  }

  const priorRounds = readRounds(repoRoot, current);
  if (priorRounds.length === 0) {
    writeErr(
      `verify reanchor: refused -- session ${current} has no recorded ` +
        "round, so there is no baseline to recover. Round 1 measures " +
        "against HEAD and needs no snapshot.\n",
    );
    return EXIT_USAGE;
  }
  const latest = priorRounds[priorRounds.length - 1] as Row;
  const recorded = String(latest["completion_tree"]);

  if (objectExists(repoRoot, recorded)) {
    writeErr(
      `verify reanchor: refused -- round ${String(latest["round"])}'s recorded ` +
        `tree ${recorded.slice(0, 12)} resolves in this repository. The fix ` +
        "delta is computable as recorded, and re-anchoring a baseline " +
        "that is present would let the author choose what the next " +
        "round sees.\n",
    );
    return EXIT_USAGE;
  }

  const named = runGit(repoRoot, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${commit}^{commit}`,
  ]);
  if (named.code !== 0 || !named.stdout) {
    writeErr(
      `verify reanchor: refused -- ${pythonRepr(commit)} does not name a commit ` +
        "in this repository.\n",
    );
    return EXIT_USAGE;
  }
  const resolved = named.stdout;
  const headRun = runGit(repoRoot, ["rev-parse", "--verify", "HEAD"]);
  if (headRun.code !== 0 || !headRun.stdout) {
    writeErr("verify reanchor: refused -- HEAD does not resolve.\n");
    return EXIT_STATE;
  }
  const [legal, why] = legalAnchor(
    repoRoot,
    headRun.stdout,
    latest["recorded_at"],
    (latest["head_commit"] as string | undefined) ?? null,
  );
  if (legal === null) {
    writeErr(`verify reanchor: refused -- ${why}\n`);
    return EXIT_STATE;
  }
  if (resolved !== legal) {
    writeErr(
      `verify reanchor: refused -- ${resolved.slice(0, 12)} is not the legal ` +
        `anchor for round ${String(latest["round"])}. ${why}\n` +
        "Any later commit may carry remediation this round has not " +
        "seen, and no timestamp can prove otherwise, so the baseline " +
        "lands before the round even though that re-reviews work " +
        `already reviewed. Use:\n  --commit ${legal.slice(0, 12)}\n`,
    );
    return EXIT_USAGE;
  }

  const treeRun = runGit(repoRoot, [
    "rev-parse",
    "--verify",
    `${resolved}^{tree}`,
  ]);
  if (treeRun.code !== 0 || !treeRun.stdout) {
    writeErr(
      `verify reanchor: refused -- ${resolved.slice(0, 12)} has no readable ` +
        "tree.\n",
    );
    return EXIT_USAGE;
  }
  const anchorTree = treeRun.stdout;

  const row: Row = {
    round: latest["round"],
    session_number: current,
    recorded_tree: recorded,
    anchor_tree: anchorTree,
    anchor_commit: resolved,
    reason,
    recorded_at: nowIso("microseconds"),
  };
  try {
    appendReanchor(repoRoot, current, row);
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    writeErr(`verify reanchor: refused -- ${error.message}\n`);
    return EXIT_USAGE;
  }

  writeOut(
    `verify reanchor: round ${String(latest["round"])} of session ${current} ` +
      "re-anchored.\n" +
      `  recorded tree ${recorded.slice(0, 12)} -- absent from this object store\n` +
      `  diffing instead from ${anchorTree.slice(0, 12)} ` +
      `(commit ${resolved.slice(0, 12)})\n` +
      `  reason: ${reason}\n` +
      "The next round is measured from a substitute baseline, so it is a " +
      "weaker record than one measured from the tree the last round " +
      "actually completed at. The ledger carries that fact permanently, " +
      "and the round it produces will say so too.\n",
  );
  return 0;
}
