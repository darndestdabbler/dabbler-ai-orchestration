import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  IdentityResolutionError,
  classifyIdentityProvenance,
  resolveModelProvider,
  resolveOrchestratorIdentity,
  resolveSessionOrchestratorIdentity,
} from "../src/identity.ts";
import { makeSandboxRepo, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

const REGISTRY = {
  sonnet: { provider: "anthropic", model_id: "claude-sonnet-5" },
  "gpt-5-4": { provider: "openai", model_id: "gpt-5.4" },
  "gemini-pro": { provider: "google", model_id: "gemini-2.5-pro" },
};

describe("resolving a model to its provider", () => {
  it("matches an exact registry key", () => {
    expect(resolveModelProvider("sonnet", REGISTRY)).toBe("anthropic");
  });

  it("matches an exact model id", () => {
    expect(resolveModelProvider("gpt-5.4", REGISTRY)).toBe("openai");
  });

  it("strips a date suffix from a claude id", () => {
    expect(resolveModelProvider("claude-sonnet-5-20260101", REGISTRY)).toBe(
      "anthropic",
    );
  });

  it("does not strip a date suffix off another provider's id", () => {
    // An invented dated variant must NOT normalize onto a real entry.
    expect(resolveModelProvider("gpt-5.4-20251001", REGISTRY)).toBeNull();
  });

  it("resolves nothing for a model nobody declares", () => {
    expect(resolveModelProvider("mystery-9000", REGISTRY)).toBeNull();
  });
});

describe("resolving the orchestrator's identity", () => {
  it("takes the model over the provider label", () => {
    const identity = resolveOrchestratorIdentity(
      { engine: "claude-code", provider: "openai", model: "sonnet" },
      { modelsRegistry: REGISTRY },
    );
    expect(identity.effectiveProvider).toBe("anthropic");
    expect(identity.source).toBe("model-registry");
  });

  it("never trusts a Copilot seat's label", () => {
    expect(() =>
      resolveOrchestratorIdentity(
        { engine: "github-copilot", provider: "openai", model: "mystery-9000" },
        { modelsRegistry: REGISTRY },
      ),
    ).toThrow(/multi-provider/);
  });

  it("fails closed on a seat that recorded no model", () => {
    expect(() =>
      resolveOrchestratorIdentity(
        { engine: "copilot", provider: "openai" },
        { modelsRegistry: REGISTRY },
      ),
    ).toThrow(IdentityResolutionError);
  });

  it("lets a single-vendor engine fall back to its label", () => {
    const identity = resolveOrchestratorIdentity(
      { engine: "gemini", provider: "Google" },
      { modelsRegistry: REGISTRY },
    );
    expect(identity.effectiveProvider).toBe("google");
    expect(identity.source).toBe("provider-field");
  });

  it("refuses a missing or empty orchestrator block", () => {
    expect(() =>
      resolveOrchestratorIdentity(null, { modelsRegistry: REGISTRY }),
    ).toThrow(IdentityResolutionError);
    expect(() =>
      resolveOrchestratorIdentity({}, { modelsRegistry: REGISTRY }),
    ).toThrow(IdentityResolutionError);
  });

  it("derives provenance from the engine", () => {
    expect(classifyIdentityProvenance("github-copilot")).toBe("asserted");
    expect(classifyIdentityProvenance("claude-code")).toBe("direct");
    expect(classifyIdentityProvenance("")).toBeNull();
  });
});

// --- The session-level path ---------------------------------------------------
//
// The one function in `identity` that reads a repository rather than a
// block. It waited for session 31 because it reads the record through
// `progress` -- writing a second reader of `sessions.json` here to reach it
// early is the drift the port exists to remove (D164).

describe("resolving whose session this is", () => {
  function withSessions(sessions: unknown[]): string {
    const { sessionsDir } = makeSandboxRepo();
    writeFileSync(
      join(sessionsDir, "sessions.json"),
      JSON.stringify({ schemaVersion: 5, sessions }),
      "utf8",
    );
    return sessionsDir;
  }

  it("takes the session in flight when no number is given", () => {
    const sessionsDir = withSessions([
      {
        number: 1,
        title: "One",
        status: "complete",
        orchestrator: { engine: "gemini", model: "gemini-pro" },
      },
      {
        number: 2,
        title: "Two",
        status: "in-progress",
        orchestrator: { engine: "claude-code", model: "sonnet" },
      },
    ]);
    const identity = resolveSessionOrchestratorIdentity(sessionsDir, null, {
      modelsRegistry: REGISTRY,
    });
    expect(identity.effectiveProvider).toBe("anthropic");
  });

  it("takes the session the caller names over the one in flight", () => {
    const sessionsDir = withSessions([
      {
        number: 1,
        title: "One",
        status: "complete",
        orchestrator: { engine: "gemini", model: "gemini-pro" },
      },
      {
        number: 2,
        title: "Two",
        status: "in-progress",
        orchestrator: { engine: "claude-code", model: "sonnet" },
      },
    ]);
    const identity = resolveSessionOrchestratorIdentity(sessionsDir, 1, {
      modelsRegistry: REGISTRY,
    });
    expect(identity.effectiveProvider).toBe("google");
  });

  it("falls back to the last session carrying a block when none is in flight", () => {
    // Between two sessions the question is still answerable, and answering
    // it is what lets the next verifier be chosen against a real identity.
    const sessionsDir = withSessions([
      {
        number: 1,
        title: "One",
        status: "complete",
        orchestrator: { engine: "claude-code", model: "sonnet" },
      },
      { number: 2, title: "Two", status: "not-started" },
    ]);
    const identity = resolveSessionOrchestratorIdentity(sessionsDir, null, {
      modelsRegistry: REGISTRY,
    });
    expect(identity.effectiveProvider).toBe("anthropic");
  });

  it("refuses when no session carries a block at all", () => {
    const sessionsDir = withSessions([{ number: 1, title: "One", status: "not-started" }]);
    expect(() =>
      resolveSessionOrchestratorIdentity(sessionsDir, null, { modelsRegistry: REGISTRY }),
    ).toThrow(IdentityResolutionError);
  });

  it("refuses a repository with no readable record rather than guessing", () => {
    const { sessionsDir } = makeSandboxRepo();
    expect(() =>
      resolveSessionOrchestratorIdentity(sessionsDir, null, { modelsRegistry: REGISTRY }),
    ).toThrow(/no readable session-state\.json/);
  });
});
