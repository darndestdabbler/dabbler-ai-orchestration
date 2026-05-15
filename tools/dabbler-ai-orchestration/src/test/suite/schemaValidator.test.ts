import * as assert from "assert";
import { validateBatch, ValidationResult } from "../../configEditor/schemaValidator";

const VALID_ROUTER_CONFIG = {
  providers: {
    anthropic: {
      display_label: "Anthropic (Claude)",
      enabled: true,
      api_key_env: "ANTHROPIC_API_KEY",
      base_url: "https://api.anthropic.com/v1/messages",
    },
    google: {
      display_label: "Google (Gemini)",
      enabled: true,
      api_key_env: "GEMINI_API_KEY",
      base_url: "https://generativelanguage.googleapis.com/v1beta",
    },
  },
  routing: {
    outsourcing_mode: "whenever-helpful",
  },
  models: {
    "gemini-pro": {
      provider: "google",
    },
    sonnet: {
      provider: "anthropic",
    },
  },
};

const VALID_BUDGET = {
  threshold_usd: 10,
  scope: "per-project",
  warn_at_percent: 80,
  verification_method: "api",
};

suite("schemaValidator — validateBatch: valid inputs", () => {
  test("accepts a fully valid batch", () => {
    const result = validateBatch({
      routerConfig: VALID_ROUTER_CONFIG as Record<string, unknown>,
      budget: VALID_BUDGET as Record<string, unknown>,
      localOverrides: null,
    });
    assert.ok(result.valid, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
    assert.strictEqual(result.errors.length, 0);
  });

  test("accepts null localOverrides", () => {
    const result = validateBatch({
      routerConfig: VALID_ROUTER_CONFIG as Record<string, unknown>,
      budget: VALID_BUDGET as Record<string, unknown>,
      localOverrides: null,
    });
    assert.ok(result.valid);
  });

  test("accepts null routerConfig and null budget (no files present)", () => {
    const result = validateBatch({ routerConfig: null, budget: null, localOverrides: null });
    assert.ok(result.valid);
  });
});

suite("schemaValidator — budget.yaml required fields", () => {
  test("rejects budget missing threshold_usd", () => {
    const budget = { scope: "per-project", warn_at_percent: 80 };
    const result = validateBatch({
      routerConfig: null,
      budget: budget as Record<string, unknown>,
      localOverrides: null,
    });
    assert.ok(!result.valid);
    const hasThresholdError = result.errors.some((e) =>
      e.file === "budget.yaml" && e.message.toLowerCase().includes("threshold_usd")
    );
    assert.ok(hasThresholdError, `Expected threshold_usd error, got: ${JSON.stringify(result.errors)}`);
  });

  test("rejects threshold_usd below 0", () => {
    const budget = { threshold_usd: -5, scope: "per-project", warn_at_percent: 80 };
    const result = validateBatch({
      routerConfig: null,
      budget: budget as Record<string, unknown>,
      localOverrides: null,
    });
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.file === "budget.yaml"));
  });

  test("rejects warn_at_percent above 100", () => {
    const budget = { threshold_usd: 10, warn_at_percent: 150 };
    const result = validateBatch({
      routerConfig: null,
      budget: budget as Record<string, unknown>,
      localOverrides: null,
    });
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.file === "budget.yaml"));
  });

  test("rejects warn_at_percent below 0", () => {
    const budget = { threshold_usd: 10, warn_at_percent: -10 };
    const result = validateBatch({
      routerConfig: null,
      budget: budget as Record<string, unknown>,
      localOverrides: null,
    });
    assert.ok(!result.valid);
  });

  test("rejects invalid verification_method enum", () => {
    const budget = { threshold_usd: 10, verification_method: "queue" };
    const result = validateBatch({
      routerConfig: null,
      budget: budget as Record<string, unknown>,
      localOverrides: null,
    });
    assert.ok(!result.valid);
  });

  test("accepts all valid scope values", () => {
    for (const scope of ["per-session-set", "per-project", "per-session"] as const) {
      const budget = { threshold_usd: 10, scope };
      const result = validateBatch({
        routerConfig: null,
        budget: budget as Record<string, unknown>,
        localOverrides: null,
      });
      assert.ok(result.valid, `scope "${scope}" should be valid`);
    }
  });
});

suite("schemaValidator — router-config.yaml: provider references", () => {
  test("rejects model referencing non-existent provider", () => {
    const routerConfig = {
      providers: {
        anthropic: { api_key_env: "ANTHROPIC_API_KEY" },
      },
      models: {
        "my-model": { provider: "nonexistent" },
      },
    };
    const result = validateBatch({
      routerConfig: routerConfig as Record<string, unknown>,
      budget: null,
      localOverrides: null,
    });
    assert.ok(!result.valid);
    assert.ok(
      result.errors.some((e) => e.file === "router-config.yaml" && e.message.includes("nonexistent")),
      `Expected dangling provider error, got: ${JSON.stringify(result.errors)}`
    );
  });

  test("accepts model referencing existing provider", () => {
    const result = validateBatch({
      routerConfig: VALID_ROUTER_CONFIG as Record<string, unknown>,
      budget: null,
      localOverrides: null,
    });
    assert.ok(result.valid);
  });
});

suite("schemaValidator — router-config.yaml: env var name shape", () => {
  test("rejects lowercase env var name", () => {
    const routerConfig = {
      providers: {
        anthropic: { api_key_env: "anthropic_api_key" },
      },
    };
    const result = validateBatch({
      routerConfig: routerConfig as Record<string, unknown>,
      budget: null,
      localOverrides: null,
    });
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.path.includes("api_key_env")));
  });

  test("rejects env var starting with digit", () => {
    const routerConfig = {
      providers: {
        anthropic: { api_key_env: "1ANTHROPIC_KEY" },
      },
    };
    const result = validateBatch({
      routerConfig: routerConfig as Record<string, unknown>,
      budget: null,
      localOverrides: null,
    });
    assert.ok(!result.valid);
  });

  test("accepts valid uppercase env var name", () => {
    const routerConfig = {
      providers: {
        anthropic: { api_key_env: "ANTHROPIC_API_KEY" },
      },
    };
    const result = validateBatch({
      routerConfig: routerConfig as Record<string, unknown>,
      budget: null,
      localOverrides: null,
    });
    assert.ok(result.valid);
  });

  test("accepts env var starting with underscore", () => {
    const routerConfig = {
      providers: {
        anthropic: { api_key_env: "_PRIVATE_KEY" },
      },
    };
    const result = validateBatch({
      routerConfig: routerConfig as Record<string, unknown>,
      budget: null,
      localOverrides: null,
    });
    assert.ok(result.valid);
  });
});

suite("schemaValidator — local-overrides allowlist", () => {
  test("rejects verification_method override (project-canonical)", () => {
    const localOverrides = { verification_method: "manual-via-other-engine" };
    const result = validateBatch({
      routerConfig: VALID_ROUTER_CONFIG as Record<string, unknown>,
      budget: null,
      localOverrides: localOverrides as Record<string, unknown>,
    });
    assert.ok(!result.valid);
    assert.ok(
      result.errors.some(
        (e) =>
          e.file === "local-overrides.yaml" &&
          e.message.toLowerCase().includes("not locally overridable")
      ),
      `Expected allowlist error, got: ${JSON.stringify(result.errors)}`
    );
  });

  test("rejects scope override (project-canonical)", () => {
    const localOverrides = { scope: "per-session" };
    const result = validateBatch({
      routerConfig: null,
      budget: null,
      localOverrides: localOverrides as Record<string, unknown>,
    });
    assert.ok(!result.valid);
  });

  test("rejects provider that exists only in local-overrides", () => {
    const localOverrides = {
      providers: {
        "ghost-provider": { api_key_env: "GHOST_KEY" },
      },
    };
    const result = validateBatch({
      routerConfig: VALID_ROUTER_CONFIG as Record<string, unknown>,
      budget: null,
      localOverrides: localOverrides as Record<string, unknown>,
    });
    assert.ok(!result.valid);
    assert.ok(
      result.errors.some(
        (e) => e.file === "local-overrides.yaml" && e.message.includes("ghost-provider")
      ),
      `Expected ghost provider error, got: ${JSON.stringify(result.errors)}`
    );
  });

  test("accepts allowed local overrides (routing.outsourcing_mode)", () => {
    const localOverrides = {
      routing: { outsourcing_mode: "disabled" },
    };
    const result = validateBatch({
      routerConfig: VALID_ROUTER_CONFIG as Record<string, unknown>,
      budget: null,
      localOverrides: localOverrides as Record<string, unknown>,
    });
    assert.ok(result.valid, `Expected valid, got: ${JSON.stringify(result.errors)}`);
  });

  test("accepts notifications (local-only section)", () => {
    const localOverrides = {
      notifications: {
        pushover: { enabled: true, api_key_env: "PUSHOVER_API_KEY", user_key_env: "PUSHOVER_USER_KEY" },
      },
    };
    const result = validateBatch({
      routerConfig: null,
      budget: null,
      localOverrides: localOverrides as Record<string, unknown>,
    });
    assert.ok(result.valid, `Expected valid, got: ${JSON.stringify(result.errors)}`);
  });
});
