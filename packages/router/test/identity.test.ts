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

const CATALOG: ReadonlyArray<{ id: string; provider: string }> = [
  { id: "claude-sonnet-5", provider: "anthropic" },
  { id: "gpt-5.4", provider: "openai" },
  { id: "gemini-2.5-pro", provider: "google" },
];

function identity(block: unknown): ReturnType<typeof resolveOrchestratorIdentity> {
  return resolveOrchestratorIdentity(block, { catalog: CATALOG });
}

describe("resolving a model to its provider", () => {
  it("reads this machine's catalog, on either transport, under one spelling", () => {
    // The registry that used to answer first is gone: it named fourteen
    // models a repository had been edited with and could say nothing about
    // any other. The catalog is what the machine's own vendors and seat
    // listed, so an id neither of them lists resolves nothing.
    assert.equal(resolveModelProvider("claude-sonnet-5", CATALOG), "anthropic");
    assert.equal(resolveModelProvider("gpt-5.4", CATALOG), "openai");
    assert.equal(resolveModelProvider("mystery-9000", CATALOG), null);
  });

  it("strips a date suffix from a claude id and from nothing else", () => {
    // An invented dated variant of another provider's id must NOT normalize
    // onto a real entry.
    assert.equal(resolveModelProvider("claude-sonnet-5-20260101", CATALOG), "anthropic");
    assert.equal(resolveModelProvider("gpt-5.4-20251001", CATALOG), null);
  });

  it("matches case-insensitively, and refuses a provider it does not route to", () => {
    assert.equal(resolveModelProvider("Claude-X", [{ id: "claude-x", provider: "anthropic" }]), "anthropic");
    assert.equal(resolveModelProvider("claude-x", [{ id: "claude-x", provider: "acme" }]), null);
  });
});

describe("resolving the orchestrator's identity", () => {
  it("takes the model over the provider label", () => {
    const resolved = identity({
      engine: "claude-code",
      provider: "openai",
      model: "claude-sonnet-5",
    });
    assert.equal(resolved.effectiveProvider, "anthropic");
    assert.equal(resolved.source, "model-catalog");
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
