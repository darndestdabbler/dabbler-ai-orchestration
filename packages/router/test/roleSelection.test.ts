// Selection by role: the one rule both transports resolve candidates
// through. A role declares the provider set it may draw from -- a hard
// filter -- and a preference order, which is ordering only.
//
// Every rule here is a function of a configuration and a candidate list, so
// the tests hand it both. The only environment they touch is the provider
// keys, because a provider whose key does not resolve is not a candidate
// anywhere.
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { normalizeModelToken } from "../src/contracts/models.ts";
import {
  REMOVED_EXCLUDED_PROVIDER,
  REMOVED_NOT_PERMITTED,
  REMOVED_UNTRUSTED_VERIFIER,
  ROLE_VERIFIER,
  explainRole,
  providerReachable,
  registryCandidates,
  resolveRole,
  roleDeclaration,
  type Candidate,
} from "../src/selection.ts";
import { makeConfig, setProviderKeys } from "./support/answers.ts";

const KEYS = ["TEST_ANTHROPIC_KEY", "TEST_GOOGLE_KEY", "TEST_OPENAI_KEY"];

beforeEach(setProviderKeys);
afterEach(() => {
  for (const name of KEYS) delete process.env[name];
});

const CANDIDATES: ReadonlyArray<readonly [string, string]> = [
  ["a-one", "anthropic"],
  ["o-one", "openai"],
  ["g-one", "google"],
];

/**
 * The fixture registry plus the two entries the trust rule needs: one model
 * the registry refuses as a verifier, and one it disables outright.
 */
function registryConfig(): Record<string, unknown> {
  const config = makeConfig();
  const models = config["models"] as Record<string, unknown>;
  models["gpt-mini"] = {
    provider: "openai",
    model_id: "o-mini",
    max_context_tokens: 272000,
    max_output_tokens: 32000,
    is_enabled_as_verifier: false,
  };
  models["ghost"] = {
    provider: "anthropic",
    model_id: "a-ghost",
    max_context_tokens: 200000,
    max_output_tokens: 16000,
    is_enabled: false,
    is_enabled_as_verifier: false,
  };
  return config;
}

function ids(candidates: ReadonlyArray<Candidate>): string[] {
  return candidates.map((candidate) => candidate[0]);
}

describe("what a role declares", () => {
  it("reads a preference order and a permitted provider set", () => {
    const declaration = roleDeclaration(
      makeConfig({ roles: { r: { prefer: ["g-one"], require_provider_in: ["Google"] } } }),
      "r",
    );
    assert.deepEqual(declaration.prefer, ["g-one"]);
    assert.deepEqual([...declaration.permitted], ["google"]);
  });

  it("gives an undeclared role no preference and no restriction", () => {
    // Refusing here would make a role a thing that has to be declared before
    // it can be asked for, and the preference order is an optimisation
    // rather than a permission.
    const declaration = roleDeclaration(makeConfig(), "nobody-declared-me");
    assert.deepEqual(declaration.prefer, []);
    assert.equal(declaration.permitted.size, 0);
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

  it("treats require_provider_in as a hard filter", () => {
    const config = makeConfig({ roles: { r: { require_provider_in: ["openai"] } } });
    assert.deepEqual(resolveRole(config, "r", CANDIDATES), [["o-one", "openai"]]);
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
    const empty = explainRole(
      makeConfig({ roles: { r: { require_provider_in: ["openai"] } } }),
      "r",
      CANDIDATES,
      ["openai"],
    );
    assert.deepEqual(empty.candidates, []);
    assert.equal(empty.fellThrough, false);
    assert.deepEqual(
      empty.removed.map((row) => row.rule).sort(),
      [REMOVED_EXCLUDED_PROVIDER, REMOVED_NOT_PERMITTED, REMOVED_NOT_PERMITTED].sort(),
    );
  });

  it("names the rule that removed each candidate, not merely that one was", () => {
    // "No trusted verifier was reachable" and "every candidate was on the
    // excluded provider" are different problems with different answers.
    const resolved = explainRole(registryConfig(), ROLE_VERIFIER, [
      ["o-mini", "openai"],
      ["a-one", "anthropic"],
    ] as const);
    assert.deepEqual(resolved.candidates.map((c) => c[0]), ["a-one"]);
    assert.deepEqual(resolved.removed, [
      { model: "o-mini", provider: "openai", rule: REMOVED_UNTRUSTED_VERIFIER },
    ]);
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

  it("refuses a model the registry distrusts as a verifier, however it is spelled", () => {
    // Trust is a property of the model, not of the path that reaches it, so
    // it has to hold on the seat too -- the catalog carries no such flag and
    // spells ids differently.
    const config = registryConfig();
    (config["roles"] as Record<string, Record<string, unknown>>)["verifier"] = {
      prefer: ["o-mini"],
    };
    const resolved = resolveRole(config, ROLE_VERIFIER, [
      ["O-Mini", "openai"],
      ["a-sonnet", "anthropic"],
    ] as const);
    assert.deepEqual(ids(resolved), ["a-sonnet"]);
  });

  it("keeps a model the registry has never heard of eligible", () => {
    // Absent metadata is unknown, never unsupported: filtering on it would
    // end cross-vendor verification the day a seat ships a model the
    // registry has not heard of.
    assert.deepEqual(
      resolveRole(registryConfig(), ROLE_VERIFIER, [["brand-new-model", "google"]] as const),
      [["brand-new-model", "google"]],
    );
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

describe("enumerating the model registry", () => {
  it("resolves against the registry in the role's order", () => {
    assert.deepEqual(registryCandidates(registryConfig(), "generator").slice(0, 3), [
      "flash",
      "pro",
      "opus",
    ]);
  });

  it("never lets a disabled model survive", () => {
    assert.ok(!registryCandidates(registryConfig(), "generator").includes("ghost"));
  });

  it("drops every model of a provider whose key does not resolve", () => {
    // Selection can never land on a model the process could not call.
    delete process.env["TEST_GOOGLE_KEY"];
    const config = registryConfig();
    assert.equal(providerReachable(config, "google"), false);
    const names = registryCandidates(config, "generator");
    assert.ok(!names.includes("flash") && !names.includes("pro"));
    assert.ok(names.includes("sonnet"));
  });

  it("drops every model of a disabled provider", () => {
    const config = registryConfig();
    (config["providers"] as Record<string, Record<string, unknown>>)["openai"]["enabled"] =
      false;
    assert.ok(!registryCandidates(config, "generator").includes("gpt"));
  });

  it("drops the entries the registry does not trust to verify", () => {
    const names = registryCandidates(registryConfig(), ROLE_VERIFIER);
    assert.ok(!names.includes("gpt-mini"));
    assert.ok(names.includes("sonnet"));
  });

  it("is empty when every provider is excluded", () => {
    assert.deepEqual(
      registryCandidates(registryConfig(), "generator", ["google", "openai", "anthropic"]),
      [],
    );
  });
});
