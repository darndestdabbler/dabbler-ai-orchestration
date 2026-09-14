// The atomic land: the judge of whether the tested bytes are the landed
// bytes, from facts alone.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type LandFacts, judgeLandReadiness } from "../src/land.ts";

const GREEN = { outcome: "passed", treeDigest: "tree-a", surfaceDigest: "surface-a", recordedAt: "2026-09-07T00:00:00Z" };

describe("the land", () => {
  it("refuses a tree that moved after a green run of record, naming the path, and lands the tree the run tested", () => {
    const moved: LandFacts = {
      treeNow: "tree-b",
      suites: [{ name: "persister-unit", latest: GREEN, surfaceNow: "surface-a" }],
      moved: ["modules/persister/src/CsvPersister/Store.cs"],
    };
    const refusal = judgeLandReadiness(moved);
    assert.match(refusal ?? "", /the tree moved after persister-unit's run of record/);
    assert.match(refusal ?? "", /modules\/persister\/src\/CsvPersister\/Store\.cs/);

    // The same facts with the digest matching: nothing to refuse.
    assert.equal(judgeLandReadiness({ ...moved, treeNow: "tree-a", moved: [] }), null);

    // A red or missing run refuses too, and a stale surface says so.
    assert.match(judgeLandReadiness({ ...moved, treeNow: "tree-a", suites: [{ name: "x", latest: null, surfaceNow: null }] }) ?? "", /x has no run of record/);
    assert.match(
      judgeLandReadiness({ ...moved, treeNow: "tree-a", suites: [{ name: "x", latest: { ...GREEN, surfaceDigest: "old" }, surfaceNow: "new" }] }) ?? "",
      /x is stale/,
    );
  });
});
