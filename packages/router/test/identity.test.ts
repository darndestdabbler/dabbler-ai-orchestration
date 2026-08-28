import { describe, expect, it } from "vitest";

import {
  IdentityResolutionError,
  classifyIdentityProvenance,
  resolveModelProvider,
  resolveOrchestratorIdentity,
} from "../src/identity.ts";

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
