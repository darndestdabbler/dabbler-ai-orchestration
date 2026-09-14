// The atomic land: the bytes the run of record tested are the bytes that
// land, and nothing else does.
//
// The judgment here is pure -- facts in, a refusal out -- so the land and
// its tests read one rule. The land asks two things of the tree it is about
// to commit: that every suite it owes has a green run of record taken
// against exactly this tree, and that nothing it owes went stale.

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
   * The paths that moved since the verified tree; null when the diff could
   * not be taken. Named in the refusal, never judged: the digests judge.
   */
  readonly moved: readonly string[] | null;
}

/**
 * Why the land must not happen, or null. Every reason is given, joined,
 * because a land refused for one reason and refused again for the next is
 * two trips for one fact.
 */
export function judgeLandReadiness(facts: LandFacts): string | null {
  const reasons: string[] = [];
  if (facts.treeNow === null) {
    return "the tree could not be digested (failing closed)";
  }
  const movedText =
    facts.moved === null
      ? "the paths that moved could not be measured"
      : facts.moved.length === 0
        ? "no path could be named"
        : facts.moved.slice(0, 8).join(", ") + (facts.moved.length > 8 ? ` (+${facts.moved.length - 8} more)` : "");
  for (const suite of facts.suites) {
    if (suite.latest === null) {
      reasons.push(`${suite.name} has no run of record`);
      continue;
    }
    if (suite.latest.outcome !== "passed") {
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
  return reasons.length === 0 ? null : reasons.join("; ");
}
