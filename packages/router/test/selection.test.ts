import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ROLE_VERIFIER,
  providerReachable,
  registryCandidates,
  resolveRole,
  type Candidate,
} from "../src/selection.ts";
import {
  classifyEscalationReason,
  detectTruncation,
  shouldEscalate,
} from "../src/route.ts";
import type { APIResult } from "../src/transports/base.ts";
import { clearProviderKeys, makeConfig, setProviderKeys } from "./support/fixtures.ts";

beforeEach(setProviderKeys);
afterEach(clearProviderKeys);

// --- The role rule, transport-independent ------------------------------------

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
    provider: "openai", model_id: "o-mini",
    max_context_tokens: 272000, max_output_tokens: 32000,
    is_enabled_as_verifier: false,
  };
  models["ghost"] = {
    provider: "anthropic", model_id: "a-ghost",
    max_context_tokens: 200000, max_output_tokens: 16000,
    is_enabled: false, is_enabled_as_verifier: false,
  };
  return config;
}

function ids(candidates: ReadonlyArray<Candidate>): string[] {
  return candidates.map((candidate) => candidate[0]);
}

describe("resolving a role", () => {
  it("sorts the models the preference order names ahead of the rest", () => {
    const config = makeConfig({ roles: { r: { prefer: ["g-one", "o-one"] } } });
    expect(ids(resolveRole(config, "r", CANDIDATES))).toEqual([
      "g-one", "o-one", "a-one",
    ]);
  });

  it("keeps a candidate the preference order does not name", () => {
    // A preference list is an order, never the candidate universe: a list
    // that has gone stale costs a slightly older model, never a candidate.
    const config = makeConfig({ roles: { r: { prefer: ["g-one"] } } });
    expect(ids(resolveRole(config, "r", CANDIDATES))).toEqual([
      "g-one", "a-one", "o-one",
    ]);
  });

  it("treats a preference naming nothing as inert", () => {
    const config = makeConfig({ roles: { r: { prefer: ["retired-model", "o-one"] } } });
    expect(ids(resolveRole(config, "r", CANDIDATES))).toEqual([
      "o-one", "a-one", "g-one",
    ]);
  });

  it("treats require_provider_in as a hard filter", () => {
    const config = makeConfig({ roles: { r: { require_provider_in: ["openai"] } } });
    expect(resolveRole(config, "r", CANDIDATES)).toEqual([["o-one", "openai"]]);
  });

  it("removes a provider the exclusion names even when a preference names it", () => {
    const config = makeConfig({ roles: { r: { prefer: ["g-one", "o-one"] } } });
    // Cased and untrimmed, as a caller may pass it.
    const resolved = resolveRole(config, "r", CANDIDATES, ["Google"]);
    expect(ids(resolved)).toEqual(["o-one", "a-one"]);
  });

  it("keeps every candidate, in declared order, for an undeclared role", () => {
    // Refusing here would make a role a thing that has to be declared before
    // it can be asked for, and the preference order is an optimisation
    // rather than a permission.
    expect(resolveRole(makeConfig(), "nobody-declared-me", CANDIDATES)).toEqual(
      CANDIDATES,
    );
  });

  it("carries the transport's own handle through untouched", () => {
    const config = makeConfig({ roles: { r: { prefer: ["o-one"] } } });
    const resolved = resolveRole(config, "r", [
      ["a-one", "anthropic", "alias-a"],
      ["o-one", "openai", "alias-o"],
    ] as const);
    expect(resolved.map((candidate) => candidate[2])).toEqual(["alias-o", "alias-a"]);
  });

  it("refuses a model the registry distrusts as a verifier, however it is spelled", () => {
    // Trust is a property of the model, so it has to hold on the seat too --
    // the catalog carries no such flag and spells ids differently.
    const config = registryConfig();
    (config["roles"] as Record<string, Record<string, unknown>>)["verifier"] = {
      prefer: ["o-mini"],
    };
    const resolved = resolveRole(config, ROLE_VERIFIER, [
      ["O-Mini", "openai"],
      ["a-sonnet", "anthropic"],
    ] as const);
    expect(ids(resolved)).toEqual(["a-sonnet"]);
  });

  it("keeps a model the registry has never heard of eligible", () => {
    // Absent metadata is unknown, never unsupported: filtering on it would
    // end cross-vendor verification the day a seat ships a model the
    // registry has not heard of.
    expect(
      resolveRole(registryConfig(), ROLE_VERIFIER, [["brand-new-model", "google"]] as const),
    ).toEqual([["brand-new-model", "google"]]);
  });
});

// --- The direct-API path's enumeration ---------------------------------------

describe("enumerating the model registry", () => {
  it("resolves against the registry in the role's order", () => {
    expect(registryCandidates(registryConfig(), "generator").slice(0, 3)).toEqual([
      "flash", "pro", "opus",
    ]);
  });

  it("never lets a disabled model survive", () => {
    expect(registryCandidates(registryConfig(), "generator")).not.toContain("ghost");
  });

  it("drops every model of a provider whose key does not resolve", () => {
    // Selection can never land on a model the process could not call.
    delete process.env["TEST_GOOGLE_KEY"];
    const config = registryConfig();
    expect(providerReachable(config, "google")).toBe(false);
    const names = registryCandidates(config, "generator");
    expect(names).not.toContain("flash");
    expect(names).not.toContain("pro");
    expect(names).toContain("sonnet");
  });

  it("drops every model of a disabled provider", () => {
    const config = registryConfig();
    const providers = config["providers"] as Record<string, Record<string, unknown>>;
    (providers["openai"] as Record<string, unknown>)["enabled"] = false;
    expect(registryCandidates(config, "generator")).not.toContain("gpt");
  });

  it("drops the entries the registry does not trust to verify", () => {
    const names = registryCandidates(registryConfig(), ROLE_VERIFIER);
    expect(names).not.toContain("gpt-mini");
    expect(names).toContain("sonnet");
  });

  it("is empty when every provider is excluded", () => {
    expect(
      registryCandidates(registryConfig(), "generator", [
        "google", "openai", "anthropic",
      ]),
    ).toEqual([]);
  });
});

// --- Escalation triggers -----------------------------------------------------

function result(
  overrides: Partial<APIResult> = {},
): APIResult {
  return {
    content: "a fine, sufficiently long answer ".repeat(4),
    input_tokens: 10,
    output_tokens: 100,
    stop_reason: "end_turn",
    metadata: {},
    ...overrides,
  };
}

function escalationConfig(): Record<string, unknown> {
  return makeConfig()["escalation"] as Record<string, unknown>;
}

describe("deciding whether to escalate", () => {
  it("leaves a healthy response alone", () => {
    expect(shouldEscalate(result(), escalationConfig())).toBe(false);
  });

  it("escalates an empty response", () => {
    expect(shouldEscalate(result({ content: "  \n" }), escalationConfig())).toBe(true);
  });

  it("escalates a response the provider says hit max_tokens", () => {
    expect(
      shouldEscalate(result({ stop_reason: "max_tokens" }), escalationConfig()),
    ).toBe(true);
  });

  it("escalates a response shorter than the trigger", () => {
    expect(shouldEscalate(result({ output_tokens: 5 }), escalationConfig())).toBe(true);
  });

  it("does not treat an unreported token count as a short response", () => {
    // The Copilot CLI omits the count on some events, and unmeasured is not
    // "short".
    expect(shouldEscalate(result({ output_tokens: 0 }), escalationConfig())).toBe(false);
  });

  it("escalates a refusal phrase", () => {
    expect(
      shouldEscalate(
        result({ content: "I can't help with that request here today, sorry" }),
        escalationConfig(),
      ),
    ).toBe(true);
  });
});

describe("classifying why a response escalated", () => {
  it("names the trigger that fired", () => {
    const config = escalationConfig();
    expect(classifyEscalationReason(result({ content: "" }), config)).toBe(
      "empty_response",
    );
    expect(classifyEscalationReason(result({ stop_reason: "max_tokens" }), config)).toBe(
      "truncated",
    );
    expect(classifyEscalationReason(result({ output_tokens: 3 }), config)).toBe(
      "too_short",
    );
    expect(
      classifyEscalationReason(
        result({ content: "i'm unable to comply with this ".repeat(3) }),
        config,
      ),
    ).toBe("refusal");
  });
});

describe("detecting a truncated response", () => {
  it("takes the provider's own signal as authoritative", () => {
    expect(detectTruncation("complete text.", "max_tokens")).toBe(true);
  });

  it("flags an unclosed code fence", () => {
    expect(detectTruncation("```python\nprint(1)", "end_turn")).toBe(true);
  });

  it("flags a brace imbalance that also stops abruptly", () => {
    expect(detectTruncation('var sql = {"SELECT Reports', "end_turn")).toBe(true);
  });

  it("does not flag prose about braces that ends in a full sentence", () => {
    // A complete review of brace-matching code: unbalanced braces in prose,
    // but it stops at a full stop. The abrupt-ending condition is what
    // separates the two, and without it a real verdict was discarded.
    expect(
      detectTruncation(
        "`_opens_a_body` treats any `{` following `):` as a body, but " +
          "the file has an inline object return type `{ path: string } " +
          "before the real body, so the body is not elided.",
        "end_turn",
      ),
    ).toBe(false);
  });
});
