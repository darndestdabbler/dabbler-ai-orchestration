// The dispute channel's rules: which cited paths a dispute may name, which
// providers an adjudication excludes, and which blocking findings stand
// undisputed. Path arithmetic against a temp directory; no git.
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import { adjudicationExclusions, resolveRepoRelative, undisputedBlockingIndices } from "../src/verify/disputes.ts";
import { loadConfig } from "../src/config.ts";
import { writePreferences } from "../src/preferences.ts";
import { seatLadder } from "../src/route.ts";
import { ROLE_AUXILIARY_REVIEWER } from "../src/selection.ts";
import { seed, tempDir } from "./support/answers.ts";
import type { CatalogModel } from "../src/catalog.ts";

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
  it("excludes the author's provider and every reviewer that has spoken, in either spelling, sorted, once each", () => {
    // Both spellings, because archived rows are not rewritten: a ledger
    // that predates the rename still names a provider that must not review
    // this session again, and a reader that took only the new key would let
    // it back in at the one point with no appeal.
    const identity = { effectiveProvider: "anthropic", provenance: null, source: "record", model: null, engine: "claude-code" };
    assert.deepEqual(adjudicationExclusions(identity, [{ reviewer_provider: "openai" }, { verifier_provider: "openai" }, { verifier_provider: "google" }, {}]), ["anthropic", "google", "openai"]);
  });
});

describe("an adjudication over a chosen third voice", () => {
  function catalogRow(id: string, provider: string): CatalogModel {
    return {
      id,
      provider,
      provider_source: "name-prefix-heuristic",
      display_name: id,
      enabled: true,
      price_category: null,
      cost: null,
      listed_at: "2026-09-11T00:00:00Z",
    };
  }

  it("stops on a selection the round excludes rather than adjudicating with the provider that already reviewed", () => {
    // Both halves of one rule, composed the way the adjudication composes
    // them. An operator may now choose the Auxiliary Reviewer, and a
    // selection NARROWS: it decides which of the eligible models answers,
    // and it can never put back a provider this round has already heard
    // from. A selection that overruled the exclusion would be a reviewer
    // marking their own homework at the one point in the lifecycle with no
    // appeal -- so what it buys is a stop that names the model, never a
    // quiet fall to the next candidate.
    const repo = tempDir();
    const models = [catalogRow("gpt-5.6-terra", "openai"), catalogRow("claude-opus-5", "anthropic")];
    const identity = {
      effectiveProvider: "google",
      provenance: null,
      source: "record",
      model: "gemini-3.1-pro-preview",
      engine: "gemini",
    };
    try {
      writePreferences({ role: ROLE_AUXILIARY_REVIEWER, selected: "gpt-5.6-terra" });
      const config = loadConfig(undefined, repo);
      // Nothing has reviewed yet: the author's provider is out, and the
      // chosen model is what the round reaches.
      assert.deepEqual(
        seatLadder(config, models, ROLE_AUXILIARY_REVIEWER, adjudicationExclusions(identity, [])).map(
          (entry) => entry.model_id,
        ),
        ["gpt-5.6-terra"],
      );
      // Round 1 was OpenAI's: the selection is unmet and the round stops.
      assert.throws(
        () =>
          seatLadder(
            config,
            models,
            ROLE_AUXILIARY_REVIEWER,
            adjudicationExclusions(identity, [{ reviewer_provider: "openai" }]),
          ),
        /you chose 'gpt-5.6-terra'/,
      );
    } finally {
      writePreferences({ role: ROLE_AUXILIARY_REVIEWER, selected: "" });
    }
  });
});

describe("which blocking findings stand undisputed", () => {
  it("indexes the blocking findings of the round no dispute names, by round and index", () => {
    const latest = { round: 2, findings: [{ blocking: true }, { blocking: false }, { blocking: true }, {}] };
    assert.deepEqual(undisputedBlockingIndices(latest, []), [0, 2, 3]);
    assert.deepEqual(undisputedBlockingIndices(latest, [{ round: 2, finding_index: 0 }, { round: 1, finding_index: 2 }]), [2, 3]);
  });
});
