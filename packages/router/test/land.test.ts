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
      moved: [],
    };
    const refusal = judgeLandReadiness(moved);
    assert.match(refusal?.reason ?? "", /the tree moved after persister-unit's run of record/);
    assert.equal(refusal?.rewindTo, "run-of-record");

    // The same facts with the digest matching: nothing to refuse.
    assert.equal(judgeLandReadiness({ ...moved, treeNow: "tree-a" }), null);
    // A targeted run of record that selected nothing is not red, and lands the tree it was bound to.
    assert.equal(
      judgeLandReadiness({ ...moved, treeNow: "tree-a", suites: [{ name: "persister-unit", latest: { ...GREEN, outcome: "none-selected" }, surfaceNow: "surface-a" }] }),
      null,
    );

    // A red or missing run refuses too, and a stale surface says so.
    assert.match(judgeLandReadiness({ ...moved, treeNow: "tree-a", suites: [{ name: "x", latest: null, surfaceNow: null }] })?.reason ?? "", /x has no run of record/);
    assert.match(
      judgeLandReadiness({ ...moved, treeNow: "tree-a", suites: [{ name: "x", latest: { ...GREEN, surfaceDigest: "old" }, surfaceNow: "new" }] })?.reason ?? "",
      /x is stale/,
    );
  });

  it("refuses a path that moved since the verified tree, naming it, and sends it back to verification; a session record alone does not", () => {
    // The run of record was taken after the path appeared, so its digest matches.
    const facts: LandFacts = {
      treeNow: "tree-a",
      suites: [{ name: "unit", latest: GREEN, surfaceNow: "surface-a" }],
      moved: ["assets/logo.png"],
    };
    const refusal = judgeLandReadiness(facts);
    assert.match(refusal?.reason ?? "", /assets\/logo\.png/);
    assert.equal(refusal?.rewindTo, "verify");

    assert.equal(judgeLandReadiness({ ...facts, moved: ["docs/transcripts/session-001.html"] }), null);
  });
});
