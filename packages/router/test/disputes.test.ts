// The dispute channel's rules: which cited paths a dispute may name, which
// providers an adjudication excludes, and which blocking findings stand
// undisputed. Path arithmetic against a temp directory; no git.
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import { adjudicationExclusions, resolveRepoRelative, undisputedBlockingIndices } from "../src/verify/disputes.ts";
import { seed, tempDir } from "./support/answers.ts";

describe("resolving a cited path", () => {
  it("refuses a path outside the repository even when it exists, a missing one, and a directory, and spells a real one with forward slashes", () => {
    const repo = tempDir();
    seed(repo, { "a.txt": "one\n", "src/a.py": "x\n" });
    assert.deepEqual(resolveRepoRelative(repo, "../elsewhere.py"), [null, "outside"]);
    assert.deepEqual(resolveRepoRelative(repo, "nope.py"), [null, "missing"]);
    assert.deepEqual(resolveRepoRelative(repo, "src"), [null, "missing"]);
    assert.deepEqual(resolveRepoRelative(repo, "a.txt"), ["a.txt", null]);
    assert.deepEqual(resolveRepoRelative(repo, join(repo, "src", "a.py")), ["src/a.py", null]);
  });
});

describe("who an adjudication excludes", () => {
  it("excludes the orchestrator's provider and every verifier that has spoken, sorted, once each", () => {
    const identity = { effectiveProvider: "anthropic", provenance: null, source: "record", model: null, engine: "claude-code" };
    assert.deepEqual(adjudicationExclusions(identity, [{ verifier_provider: "openai" }, { verifier_provider: "openai" }, { verifier_provider: "google" }, {}]), ["anthropic", "google", "openai"]);
  });
});

describe("which blocking findings stand undisputed", () => {
  it("indexes the blocking findings of the round no dispute names, by round and index", () => {
    const latest = { round: 2, findings: [{ blocking: true }, { blocking: false }, { blocking: true }, {}] };
    assert.deepEqual(undisputedBlockingIndices(latest, []), [0, 2, 3]);
    assert.deepEqual(undisputedBlockingIndices(latest, [{ round: 2, finding_index: 0 }, { round: 1, finding_index: 2 }]), [2, 3]);
  });
});
