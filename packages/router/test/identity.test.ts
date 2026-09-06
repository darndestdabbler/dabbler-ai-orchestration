// Orchestrator identity: which provider effectively ran a session.
//
// The independence guarantee rests here -- the verifier must come from a
// different provider than the orchestrator -- so the effective provider is
// DERIVED and never trusted. Every rule is a function of a block, a model
// registry and a seat catalog; which block to ask about is a second pure
// function over the record, so no test needs a repository.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  IdentityResolutionError,
  chooseOrchestratorBlock,
  classifyIdentityProvenance,
  resolveModelProvider,
  resolveOrchestratorIdentity,
} from "../src/identity.ts";

const REGISTRY = {
  sonnet: { provider: "anthropic", model_id: "claude-sonnet-5" },
  "gpt-5-4": { provider: "openai", model_id: "gpt-5.4" },
  "gemini-pro": { provider: "google", model_id: "gemini-2.5-pro" },
};

/** No catalog at all, so the seat fallback cannot answer by accident. */
const NO_CATALOG: ReadonlyArray<{ id: string; provider: string }> = [];

function identity(block: unknown): ReturnType<typeof resolveOrchestratorIdentity> {
  return resolveOrchestratorIdentity(block, {
    modelsRegistry: REGISTRY,
    catalog: NO_CATALOG,
  });
}

describe("resolving a model to its provider", () => {
  it("matches an exact registry key and an exact model id", () => {
    assert.equal(resolveModelProvider("sonnet", REGISTRY, NO_CATALOG), "anthropic");
    assert.equal(resolveModelProvider("gpt-5.4", REGISTRY, NO_CATALOG), "openai");
  });

  it("strips a date suffix from a claude id", () => {
    assert.equal(
      resolveModelProvider("claude-sonnet-5-20260101", REGISTRY, NO_CATALOG),
      "anthropic",
    );
  });

  it("does not strip a date suffix off another provider's id", () => {
    // An invented dated variant must NOT normalize onto a real entry.
    assert.equal(resolveModelProvider("gpt-5.4-20251001", REGISTRY, NO_CATALOG), null);
  });

  it("resolves nothing for a model nobody declares", () => {
    assert.equal(resolveModelProvider("mystery-9000", REGISTRY, NO_CATALOG), null);
  });

  it("falls back to the confirmed seat catalog, which is documented truth", () => {
    // Membership in the seat's confirmed universe is a lookup, never a
    // name-prefix guess.
    assert.equal(
      resolveModelProvider("Claude-X", REGISTRY, [{ id: "claude-x", provider: "anthropic" }]),
      "anthropic",
    );
  });

  it("refuses a catalog entry whose provenance is not a known provider", () => {
    assert.equal(
      resolveModelProvider("claude-x", REGISTRY, [{ id: "claude-x", provider: "acme" }]),
      null,
    );
  });
});

describe("resolving the orchestrator's identity", () => {
  it("takes the model over the provider label", () => {
    const resolved = identity({
      engine: "claude-code",
      provider: "openai",
      model: "sonnet",
    });
    assert.equal(resolved.effectiveProvider, "anthropic");
    assert.equal(resolved.source, "model-registry");
  });

  it("never trusts a Copilot seat's label", () => {
    assert.throws(
      () => identity({ engine: "github-copilot", provider: "openai", model: "mystery-9000" }),
      /multi-provider/,
    );
  });

  it("fails closed on a seat that recorded no model", () => {
    assert.throws(
      () => identity({ engine: "copilot", provider: "openai" }),
      IdentityResolutionError,
    );
  });

  it("lets a single-vendor engine fall back to its label", () => {
    // Read-side legacy tolerance only; `session start` refuses any new
    // unresolvable model.
    const resolved = identity({ engine: "gemini", provider: "Google" });
    assert.equal(resolved.effectiveProvider, "google");
    assert.equal(resolved.source, "provider-field");
  });

  it("refuses a missing or empty orchestrator block", () => {
    assert.throws(() => identity(null), IdentityResolutionError);
    assert.throws(() => identity({}), IdentityResolutionError);
  });

  it("refuses a block that resolves neither a model nor a label", () => {
    assert.throws(() => identity({ engine: "claude-code" }), IdentityResolutionError);
  });

  it("derives provenance from the engine, never from a free choice", () => {
    assert.equal(classifyIdentityProvenance("github-copilot"), "asserted");
    assert.equal(classifyIdentityProvenance("claude-code"), "direct");
    assert.equal(classifyIdentityProvenance(""), null);
  });
});

describe("which session the record answers for", () => {
  const ONE = { engine: "gemini", model: "gemini-pro" };
  const TWO = { engine: "claude-code", model: "sonnet" };

  function state(sessions: unknown[], record: Record<string, unknown> = {}): Record<string, unknown> {
    return { schemaVersion: 5, sessions, ...record };
  }

  it("takes the session in flight when no number is given", () => {
    const block = chooseOrchestratorBlock(
      state([
        { number: 1, status: "complete", orchestrator: ONE },
        { number: 2, status: "in-progress", orchestrator: TWO },
      ]),
      null,
    );
    assert.deepEqual(block, TWO);
  });

  it("takes the session the caller names over the one in flight", () => {
    const block = chooseOrchestratorBlock(
      state([
        { number: 1, status: "complete", orchestrator: ONE },
        { number: 2, status: "in-progress", orchestrator: TWO },
      ]),
      1,
    );
    assert.deepEqual(block, ONE);
  });

  it("falls back to the last session carrying a block when none is in flight", () => {
    // Between two sessions the question is still answerable, and answering
    // it is what lets the next verifier be chosen against a real identity.
    const block = chooseOrchestratorBlock(
      state([
        { number: 1, status: "complete", orchestrator: TWO },
        { number: 2, status: "not-started" },
      ]),
      null,
    );
    assert.deepEqual(block, TWO);
  });

  it("stands a record-level block in for a session that carries none", () => {
    const block = chooseOrchestratorBlock(
      state([{ number: 1, status: "in-progress" }], { orchestrator: ONE }),
      null,
    );
    assert.deepEqual(block, ONE);
  });

  it("answers nothing when no session carries a block at all", () => {
    // A caller that cannot tell whose identity this is must not proceed on a
    // guess: the verifier's independence is decided from this answer.
    assert.equal(chooseOrchestratorBlock(state([{ number: 1, status: "not-started" }]), null), null);
    assert.equal(chooseOrchestratorBlock(state([]), null), null);
  });
});
