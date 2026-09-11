// Selection by role: the one rule both transports resolve candidates
// through. Two fields and no third -- `selected` is what the operator chose
// and `prefer` is the order tried where nobody chose.
//
// Every rule here is a function of a configuration, a candidate list and
// this machine's preferences, so the tests hand it all three. The only
// environment they touch is the provider keys, because a provider whose key
// does not resolve is not a candidate anywhere.
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { normalizeModelToken } from "../src/contracts/models.ts";
import {
  EVIDENCE_ECHO,
  EVIDENCE_SERVED,
  FIDELITY_HONOURED,
  FIDELITY_SUBSTITUTED,
  FIDELITY_UNKNOWN,
  REMOVED_EXCLUDED_PROVIDER,
  REMOVED_NOT_SELECTED,
  ROLE_AUXILIARY_REVIEWER,
  ROLE_PRIMARY_REVIEWER,
  reviewerExclusions,
  explainRole,
  modelFidelity,
  roundObservations,
  reviewerRefusal,
  resolveRole,
  roleDeclaration,
  type Candidate,
} from "../src/selection.ts";
import { writePreferences } from "../src/preferences.ts";
import { makeConfig, setProviderKeys } from "./support/answers.ts";

const KEYS = ["TEST_ANTHROPIC_KEY", "TEST_GOOGLE_KEY", "TEST_OPENAI_KEY"];

/**
 * What this machine chose, for one role, in the file where choices live.
 *
 * Written through the preferences module rather than into a config, which
 * is the point of this step: a selection is a fact about who is at this
 * keyboard, so it does not travel inside a repository.
 */
function withSelection(selected: Readonly<Record<string, string>>): void {
  for (const [role, model] of Object.entries(selected)) {
    writePreferences({ role, selected: model });
  }
}

beforeEach(setProviderKeys);
afterEach(() => {
  for (const name of KEYS) delete process.env[name];
  // Every test here starts from a machine that has chosen nothing.
  writePreferences({ role: ROLE_PRIMARY_REVIEWER, selected: "" });
});

const CANDIDATES: ReadonlyArray<readonly [string, string]> = [
  ["a-one", "anthropic"],
  ["o-one", "openai"],
  ["g-one", "google"],
];

function ids(candidates: ReadonlyArray<Candidate>): string[] {
  return candidates.map((candidate) => candidate[0]);
}

describe("what a role declares", () => {
  it("reads a preference order, and nothing about which providers it may draw from", () => {
    // Two fields and no third. `require_provider_in` listed the three
    // vendors, which is a second inventory beside the catalog -- and the
    // catalog already says what this machine reaches.
    const declaration = roleDeclaration(
      makeConfig({ roles: { r: { prefer: ["g-one"] } } }),
      "r",
    );
    assert.deepEqual(declaration.prefer, ["g-one"]);
    assert.equal(declaration.selected, null);
  });

  it("gives an undeclared role no preference and no selection", () => {
    // Refusing here would make a role a thing that has to be declared before
    // it can be asked for, and the preference order is an optimisation
    // rather than a permission.
    const declaration = roleDeclaration(makeConfig(), "nobody-declared-me");
    assert.deepEqual(declaration.prefer, []);
    assert.equal(declaration.selected, null);
  });
});

describe("resolving a role", () => {
  it("sorts the models the preference order names ahead of the rest", () => {
    const config = makeConfig({ roles: { r: { prefer: ["g-one", "o-one"] } } });
    assert.deepEqual(ids(resolveRole(config, "r", CANDIDATES)), ["g-one", "o-one", "a-one"]);
  });

  it("keeps a candidate the preference order does not name", () => {
    // A preference list is an order, never the candidate universe: a list
    // that has gone stale costs a slightly older model, never a candidate.
    const config = makeConfig({ roles: { r: { prefer: ["g-one"] } } });
    assert.deepEqual(ids(resolveRole(config, "r", CANDIDATES)), ["g-one", "a-one", "o-one"]);
  });

  it("treats a preference naming nothing as inert", () => {
    const config = makeConfig({ roles: { r: { prefer: ["retired-model", "o-one"] } } });
    assert.deepEqual(ids(resolveRole(config, "r", CANDIDATES)), ["o-one", "a-one", "g-one"]);
  });

  it("removes a provider the exclusion names even when a preference names it", () => {
    const config = makeConfig({ roles: { r: { prefer: ["g-one", "o-one"] } } });
    // Cased and untrimmed, as a caller may pass it.
    assert.deepEqual(ids(resolveRole(config, "r", CANDIDATES, ["Google"])), ["o-one", "a-one"]);
  });

  it("keeps every candidate, in declared order, for an undeclared role", () => {
    assert.deepEqual(resolveRole(makeConfig(), "nobody-declared-me", CANDIDATES), CANDIDATES);
  });

  it("says how the chosen candidate was reached, and what it passed on the way", () => {
    // The 364-request session could not be explained from its record: a
    // weight-14 model no preference order names verified a session that had
    // named a weight-1 one, and `rounds.jsonl` could only say which model
    // answered. `resolveRole` knew and discarded it.
    const named = explainRole(
      makeConfig({ roles: { r: { prefer: ["g-one", "o-one"] } } }),
      "r",
      CANDIDATES,
    );
    assert.equal(named.rank, 0);
    assert.equal(named.fellThrough, false);
    assert.equal(named.preferenceDeclared, true);

    // The order names one model, and it is on the excluded provider: what
    // answers is a stranger, and that is the fact worth carrying.
    const strayed = explainRole(
      makeConfig({ roles: { r: { prefer: ["g-one"] } } }),
      "r",
      CANDIDATES,
      ["google"],
    );
    assert.equal(strayed.candidates[0]?.[0], "a-one");
    assert.equal(strayed.rank, null);
    assert.equal(strayed.fellThrough, true);
    assert.deepEqual(strayed.removed, [
      { model: "g-one", provider: "google", rule: REMOVED_EXCLUDED_PROVIDER },
    ]);

    // Falling past the end of an order is NOT the same as there being no
    // order: an undeclared role expresses no expectation to fall past.
    const unrestricted = explainRole(makeConfig(), "nobody-declared-me", CANDIDATES);
    assert.equal(unrestricted.preferenceDeclared, false);
    assert.equal(unrestricted.fellThrough, false);
    assert.equal(unrestricted.rank, null);

    // Nothing survives: no chosen candidate, so nothing fell through either.
    const empty = explainRole(makeConfig(), "r", CANDIDATES, [
      "anthropic",
      "openai",
      "google",
    ]);
    assert.deepEqual(empty.candidates, []);
    assert.equal(empty.fellThrough, false);
    assert.deepEqual(new Set(empty.removed.map((row) => row.rule)), new Set([REMOVED_EXCLUDED_PROVIDER]));
  });

  it("carries the transport's own handle through untouched", () => {
    const config = makeConfig({ roles: { r: { prefer: ["o-one"] } } });
    const resolved = resolveRole(config, "r", [
      ["a-one", "anthropic", "alias-a"],
      ["o-one", "openai", "alias-o"],
    ] as const);
    assert.deepEqual(
      resolved.map((candidate) => candidate[2]),
      ["alias-o", "alias-a"],
    );
  });

  it("keeps a model nothing has ever said anything about eligible", () => {
    // Absent metadata is unknown, never unsupported: a filter on it would
    // end cross-vendor verification the day a vendor ships a model no
    // preference order names yet.
    assert.deepEqual(
      resolveRole(makeConfig(), ROLE_PRIMARY_REVIEWER, [["brand-new-model", "google"]] as const),
      [["brand-new-model", "google"]],
    );
  });
});

describe("what a reviewing role may not be", () => {
  it("keeps the primary off the author and the auxiliary off every prior reviewer", () => {
    // The role's own definition, not a superset a caller assembles: the
    // primary is the first voice, so a prior reviewer is nothing to it; the
    // auxiliary is reached only at a disputed impasse, and a model that
    // reviewed round 1 judging its own disputed finding is a reviewer
    // marking their own homework at the one point with no appeal.
    assert.deepEqual(
      reviewerExclusions(ROLE_PRIMARY_REVIEWER, "anthropic", ["openai"]),
      ["anthropic"],
    );
    assert.deepEqual(
      reviewerExclusions(ROLE_AUXILIARY_REVIEWER, "anthropic", ["openai", "openai"]),
      ["anthropic", "openai"],
    );
  });
});

describe("a model a person selected", () => {
  it("narrows the candidates to it, and never widens past the caller's exclusion", () => {
    // What the deleted bypass actually bought: a selection that overruled
    // the exclusion let a model that reviewed round 1 adjudicate its own
    // disputed finding, which is a reviewer marking their own homework at
    // the one point in the lifecycle with no appeal.
    withSelection({ [ROLE_PRIMARY_REVIEWER]: "o-one" });
    assert.deepEqual(
      ids(resolveRole(makeConfig(), ROLE_PRIMARY_REVIEWER, CANDIDATES)),
      ["o-one"],
    );
    const excluded = explainRole(makeConfig(), ROLE_PRIMARY_REVIEWER, CANDIDATES, ["openai"]);
    assert.deepEqual(excluded.candidates, []);
    assert.equal(excluded.selectedUnmet, "o-one");
  });

  it("resolves to nothing rather than to the next model, and names the selection", () => {
    // Falling from a selected model to the next candidate IS the silent
    // substitution a selection exists to stop, so an unmet selection is
    // empty and the caller turns it into a stop that names the model.
    withSelection({ [ROLE_PRIMARY_REVIEWER]: "nothing-lists-this" });
    const resolution = explainRole(makeConfig(), ROLE_PRIMARY_REVIEWER, CANDIDATES);
    assert.deepEqual(resolution.candidates, []);
    assert.equal(resolution.selectedUnmet, "nothing-lists-this");
    assert.deepEqual(
      new Set(resolution.removed.map((row) => row.rule)),
      new Set([REMOVED_NOT_SELECTED]),
    );
  });

  it("is reported rather than applied when a surface asks what COULD answer", () => {
    // A pane narrowed to the operator's own selection would offer them the
    // choice they already made and no way back out of it.
    withSelection({ [ROLE_PRIMARY_REVIEWER]: "o-one" });
    const surface = explainRole(
      makeConfig(),
      ROLE_PRIMARY_REVIEWER,
      CANDIDATES,
      null,
      { applySelection: false },
    );
    assert.deepEqual(ids(surface.candidates).sort(), ["a-one", "g-one", "o-one"]);
    assert.equal(surface.selected, "o-one");
    assert.equal(surface.selectedUnmet, null);
  });

  it("leaves a role nobody selected resolving by preference, under the exclusion", () => {
    const config = makeConfig();
    assert.ok(!ids(resolveRole(config, ROLE_PRIMARY_REVIEWER, CANDIDATES, ["openai"])).includes("o-one"));
  });
});

describe("spelling a model id", () => {
  it("folds dots and case, and strips a date only off a claude id", () => {
    // An unscoped strip once let an invented dated variant of another
    // provider's id normalize onto a real entry.
    assert.equal(normalizeModelToken("GPT-5.4"), "gpt-5-4");
    assert.equal(normalizeModelToken("claude-sonnet-5-20260101"), "claude-sonnet-5");
    assert.equal(normalizeModelToken("gpt-5.4-20251001"), "gpt-5-4-20251001");
  });
});

describe("what a verifying model may be", () => {
  it("refuses only the authoring model itself, and says what it does not claim", () => {
    // One rule and one comparison: no capability data, no provider inference,
    // no registry. A different model on the SAME provider is accepted,
    // because whether two models of one family share a blind spot is a
    // judgement this framework has no data to make -- and the refusal says
    // so rather than leaving the developer to assume it was checked.
    assert.equal(reviewerRefusal("claude-opus-5", "gpt-5.6-terra"), null);
    assert.equal(reviewerRefusal("gpt-5.6-sol", "gpt-5.6-terra"), null);
    const refused = String(reviewerRefusal("claude-opus-5", "claude-opus-5"));
    assert.match(refused, /they are the same model/);
    assert.match(refused, /same provider is allowed/);
  });

  it("reads a dated pin and its undated id as the same model", () => {
    // The case the comparison exists for: this is how a person picks the
    // same model twice without noticing they have.
    assert.ok(reviewerRefusal("claude-sonnet-5", "claude-sonnet-5-20260101") !== null);
  });
});

describe("whether the model asked for is the model that answered", () => {
  // The provider's own statement unless a test says otherwise: an echo is
  // the weak kind and every test that uses one says so at the call.
  const seen = (requested: string, served: string | null) =>
    ({ requested, served, evidence: EVIDENCE_SERVED }) as const;
  const echoed = (requested: string, served: string | null) =>
    ({ requested, served, evidence: EVIDENCE_ECHO }) as const;

  it("answers not-known for a model the record says nothing about", () => {
    // The answer this reading exists for. A model nobody has asked for and a
    // model that answered as something else are different facts, and a
    // boolean would have to call one of them the other -- which is how a
    // list gets shown with a confidence nothing earned.
    assert.equal(modelFidelity("gpt-5.4", []), FIDELITY_UNKNOWN);
    assert.equal(modelFidelity("gpt-5.4", [seen("gpt-5.6-terra", "gpt-5.6-terra")]), FIDELITY_UNKNOWN);
    // Probed and silent is not a match: "the provider did not say" collapses
    // into nothing, which is the one thing it must not collapse into.
    assert.equal(modelFidelity("gpt-5.4", [seen("gpt-5.4", null)]), FIDELITY_UNKNOWN);
  });

  it("answers honoured when every observation names the model itself, dated pins included", () => {
    assert.equal(modelFidelity("gpt-5.4", [seen("gpt-5.4", "gpt-5.4")]), FIDELITY_HONOURED);
    // A dated snapshot IS the model that was asked for; the transport's own
    // note calls the pin routine, and calling it a substitution would make
    // the one warning that matters routine too. BOTH spellings vendors use:
    // session 144's probe asked OpenAI for `gpt-5.4-mini` and was answered
    // `gpt-5.4-mini-2026-03-17`, which a bare-digit rule called a
    // substitution.
    assert.equal(modelFidelity("gpt-5.4", [seen("gpt-5.4", "gpt-5.4-20260901")]), FIDELITY_HONOURED);
    assert.equal(
      modelFidelity("gpt-5.4-mini", [seen("gpt-5.4-mini", "gpt-5.4-mini-2026-03-17")]),
      FIDELITY_HONOURED,
    );
    // Date-SHAPED is not a date: no release calendar produces -2026-99-99,
    // and reading it as a pin would let an id that merely looks like one pass
    // as the model asked for.
    assert.equal(
      modelFidelity("gpt-5.4", [seen("gpt-5.4", "gpt-5.4-2026-99-99")]),
      FIDELITY_SUBSTITUTED,
    );
    // But a suffix that is not a date is another model. A bare prefix test
    // would call this one honoured, and it is the case that costs money.
    assert.equal(modelFidelity("gpt-5.4", [seen("gpt-5.4", "gpt-5.4-mini")]), FIDELITY_SUBSTITUTED);
  });

  it("lets one substitution outweigh any number of matches", () => {
    // A model that has once answered as another is a model that can, and the
    // operator deciding what to spend is owed the exception, not the average.
    assert.equal(
      modelFidelity("gpt-5.4", [
        seen("gpt-5.4", "gpt-5.4"),
        seen("gpt-5.4", "gpt-5.4"),
        seen("gpt-5.4", "gpt-5-mini"),
        seen("gpt-5.4", "gpt-5.4"),
      ]),
      FIDELITY_SUBSTITUTED,
    );
  });

  it("never lets an echo establish fidelity, and always lets one establish a substitution", () => {
    // Round 1's second finding, and the rule it bought. A seat that ignored
    // `--model` and echoed the request back prints exactly what an honoured
    // one prints, so a matching echo can only ever mean "not known" -- while
    // an echo naming a DIFFERENT model is the seat testifying against its own
    // interest, which is believed.
    assert.equal(modelFidelity("gpt-5.4", [echoed("gpt-5.4", "gpt-5.4")]), FIDELITY_UNKNOWN);
    assert.equal(modelFidelity("gpt-5.4", [echoed("gpt-5.4", "gpt-5-mini")]), FIDELITY_SUBSTITUTED);
    // Any number of echoes is still no evidence of fidelity; one served id is.
    const manyEchoes = Array.from({ length: 15 }, () => echoed("gpt-5.4", "gpt-5.4"));
    assert.equal(modelFidelity("gpt-5.4", manyEchoes), FIDELITY_UNKNOWN);
    assert.equal(
      modelFidelity("gpt-5.4", [...manyEchoes, seen("gpt-5.4", "gpt-5.4")]),
      FIDELITY_HONOURED,
    );
  });

  it("reads fidelity from a round's own pair, with no catalog echo to draw on", () => {
    // The probe that pre-bought an echo is deleted, and nothing is lost that
    // was ever worth having: an exact catalog echo never established
    // fidelity in the first place, and a round's requested/served pair is
    // recorded as a by-product of work that was happening anyway. This is
    // the whole of the evidence now.
    const rounds = roundObservations([
      { requested_model: "gpt-5.6-terra", served_model: "gpt-5.6-terra", transport: "api" },
      { requested_model: "gpt-5.4", served_model: null, transport: "api" },
      { served_model: "orphan", transport: "api" },
    ]);
    assert.equal(modelFidelity("gpt-5.6-terra", rounds), FIDELITY_HONOURED);
    assert.equal(modelFidelity("gpt-5.4", rounds), FIDELITY_UNKNOWN);
  });

  it("does not launder a seat's echo into a provider's word by wrapping a round around it", () => {
    // Round 2's finding. The two specimens are IDENTICAL but for where they
    // came from: on the direct-API path `served_model` is read out of the
    // provider's response body, and on a Copilot seat the very same field
    // carries the CLI's echo. A reading that called both a provider's
    // statement would make the substitution this whole rule refuses, one
    // level up -- an echo becoming evidence by having a round around it.
    const pair = { requested_model: "gpt-5.4", served_model: "gpt-5.4" };
    const overApi = roundObservations([{ ...pair, transport: "api" }]);
    const overSeat = roundObservations([{ ...pair, transport: "copilot-cli" }]);
    assert.equal(modelFidelity("gpt-5.4", overApi), FIDELITY_HONOURED);
    assert.equal(modelFidelity("gpt-5.4", overSeat), FIDELITY_UNKNOWN);
    // A round that names no transport is read as the weaker kind: unlabelled
    // is old rather than trustworthy.
    assert.equal(modelFidelity("gpt-5.4", roundObservations([pair])), FIDELITY_UNKNOWN);
    // The seat can still testify against itself, whatever the transport.
    assert.equal(
      modelFidelity(
        "gpt-5.4",
        roundObservations([
          { requested_model: "gpt-5.4", served_model: "gpt-5-mini", transport: "copilot-cli" },
        ]),
      ),
      FIDELITY_SUBSTITUTED,
    );
  });
});
