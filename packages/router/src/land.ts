// The atomic land: the bytes the run of record tested are the bytes that
// land, and nothing else does.
//
// The judgment here is pure -- facts in, a refusal out -- so the land and
// its tests read one rule. The land asks three things of the tree it is
// about to commit: that nothing in it moved since the tree a round verified,
// that every suite it owes has a green run of record taken against exactly
// this tree, and that nothing it owes went stale.

import { isSessionRecordPath } from "./journal.ts";

export class LandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LandError";
  }
}

// --- Tested bytes are the landed bytes ------------------------------------------

/** One suite the land owes, with its latest run of record and its surface now. */
export interface LandSuiteFact {
  readonly name: string;
  readonly latest: {
    readonly outcome: string;
    readonly treeDigest: string;
    readonly surfaceDigest: string;
    readonly recordedAt: string;
  } | null;
  /** The digest of the suite's covered surfaces now; null when it could not be taken. */
  readonly surfaceNow: string | null;
}

export interface LandFacts {
  /** The whole tree's digest now; null when it could not be taken. */
  readonly treeNow: string | null;
  readonly suites: readonly LandSuiteFact[];
  /**
   * The paths that moved since the verified tree, the session's bookkeeping
   * left out; null when there is no verified tree or the diff could not be
   * taken. Any of them that is not a session record was never reviewed.
   */
  readonly moved: readonly string[] | null;
}

/**
 * Why the land must not happen, and the phase that cures it. A path that
 * moved since the verified tree goes back to verification, because what
 * lands must be what a round saw; a suite's reasons go back to the run of
 * record.
 */
export interface LandRefusal {
  readonly reason: string;
  readonly rewindTo: "verify" | "run-of-record";
}

function namePaths(paths: readonly string[]): string {
  return paths.slice(0, 8).join(", ") + (paths.length > 8 ? ` (+${paths.length - 8} more)` : "");
}

/**
 * Why the land must not happen, or null. Every reason is given, joined,
 * because a land refused for one reason and refused again for the next is
 * two trips for one fact.
 */
export function judgeLandReadiness(facts: LandFacts): LandRefusal | null {
  const reasons: string[] = [];
  if (facts.treeNow === null) {
    return { reason: "the tree could not be digested (failing closed)", rewindTo: "run-of-record" };
  }
  const unverified = (facts.moved ?? []).filter((path) => !isSessionRecordPath(path));
  if (unverified.length > 0) {
    reasons.push(`moved since the verified tree, and never reviewed: ${namePaths(unverified)}`);
  }
  const movedText =
    facts.moved === null
      ? "the paths that moved could not be measured"
      : facts.moved.length === 0
        ? "no path could be named"
        : namePaths(facts.moved);
  for (const suite of facts.suites) {
    if (suite.latest === null) {
      reasons.push(`${suite.name} has no run of record`);
      continue;
    }
    // A targeted run of record that selected nothing ran nothing, and is not red.
    if (suite.latest.outcome !== "passed" && suite.latest.outcome !== "none-selected") {
      reasons.push(`${suite.name}'s run of record is ${suite.latest.outcome}, not green`);
      continue;
    }
    if (suite.surfaceNow !== null && suite.latest.surfaceDigest !== suite.surfaceNow) {
      reasons.push(`${suite.name} is stale: its covered surfaces changed after its run of record`);
      continue;
    }
    if (suite.latest.treeDigest !== facts.treeNow) {
      reasons.push(
        `the tree moved after ${suite.name}'s run of record (recorded ${suite.latest.recordedAt || "at an unknown time"}): ${movedText}`,
      );
    }
  }
  if (reasons.length === 0) return null;
  return { reason: reasons.join("; "), rewindTo: unverified.length > 0 ? "verify" : "run-of-record" };
}
