import * as assert from "assert";
import { parseDocument } from "yaml";
import { applyPatch, SavePayload, emptyLocalOverridesDoc, docContentHash } from "../../configEditor/patch";

function newRouterConfig() {
  return parseDocument(
    `# router-config.yaml
providers:
  anthropic:
    display_label: Anthropic
    enabled: true
    api_key_env: DABBLER_ANTHROPIC_API_KEY
    base_url: https://api.anthropic.com/v1/messages
  google:
    enabled: true
    api_key_env: DABBLER_GEMINI_API_KEY
routing:
  outsourcing_mode: whenever-helpful
models:
  sonnet:
    provider: anthropic
`
  );
}

function newBudget() {
  return parseDocument(
    `# budget.yaml
threshold_usd: 10
scope: per-project
warn_at_percent: 80
verification_method: api
`
  );
}

suite("patch — §1 routing & verification", () => {
  test("writing outsourcing_mode shared updates router-config.yaml", () => {
    const router = newRouterConfig();
    const budget = newBudget();
    const local = emptyLocalOverridesDoc();
    const payload: SavePayload = {
      outsourcingMode: { value: "verification-only", source: "shared" },
    };
    const result = applyPatch(router, budget, local, payload);
    assert.ok(result.routerConfigChanged);
    const json = router.toJSON() as { routing: { outsourcing_mode: string } };
    assert.strictEqual(json.routing.outsourcing_mode, "verification-only");
  });

  test("writing outsourcing_mode local routes to local-overrides + removes from router-config", () => {
    const router = newRouterConfig();
    const budget = newBudget();
    const local = emptyLocalOverridesDoc();
    const payload: SavePayload = {
      outsourcingMode: { value: "disabled", source: "local" },
    };
    const result = applyPatch(router, budget, local, payload);
    assert.ok(result.localOverridesChanged);
    assert.ok(result.routerConfigChanged, "router-config should drop the shared key when promoting to local");
    const localJson = local.toJSON() as { routing: { outsourcing_mode: string } };
    assert.strictEqual(localJson.routing.outsourcing_mode, "disabled");
    const routerJson = router.toJSON() as { routing?: Record<string, unknown> };
    assert.ok(!routerJson.routing || !("outsourcing_mode" in routerJson.routing));
  });

  test("writing verification_method always lands in budget.yaml", () => {
    const router = newRouterConfig();
    const budget = newBudget();
    const local = emptyLocalOverridesDoc();
    const payload: SavePayload = { verificationMethod: "skipped" };
    const result = applyPatch(router, budget, local, payload);
    assert.ok(result.budgetChanged);
    const json = budget.toJSON() as { verification_method: string };
    assert.strictEqual(json.verification_method, "skipped");
  });
});

suite("patch — §2 budget", () => {
  test("threshold_usd shared writes to budget.yaml", () => {
    const router = newRouterConfig();
    const budget = newBudget();
    const local = emptyLocalOverridesDoc();
    const result = applyPatch(router, budget, local, {
      thresholdUsd: { value: 25, source: "shared" },
    });
    assert.ok(result.budgetChanged);
    const json = budget.toJSON() as { threshold_usd: number };
    assert.strictEqual(json.threshold_usd, 25);
  });

  test("scope is shared-only", () => {
    const router = newRouterConfig();
    const budget = newBudget();
    const local = emptyLocalOverridesDoc();
    const result = applyPatch(router, budget, local, { scope: "per-session-set" });
    assert.ok(result.budgetChanged);
    const json = budget.toJSON() as { scope: string };
    assert.strictEqual(json.scope, "per-session-set");
  });

  test("warn_at_percent local writes to local-overrides", () => {
    const router = newRouterConfig();
    const budget = newBudget();
    const local = emptyLocalOverridesDoc();
    const result = applyPatch(router, budget, local, {
      warnAtPercent: { value: 70, source: "local" },
    });
    assert.ok(result.localOverridesChanged);
    const localJson = local.toJSON() as { warn_at_percent: number };
    assert.strictEqual(localJson.warn_at_percent, 70);
    // Warning issued for the project-canonical question
    assert.ok(result.warnings.some((w) => w.toLowerCase().includes("warn_at_percent")));
  });
});

suite("patch — §3 providers", () => {
  test("update provider enabled (shared) modifies router-config", () => {
    const router = newRouterConfig();
    const budget = newBudget();
    const local = emptyLocalOverridesDoc();
    const result = applyPatch(router, budget, local, {
      providers: [{ id: "google", enabled: { value: false, source: "shared" } }],
    });
    assert.ok(result.routerConfigChanged);
    const json = router.toJSON() as { providers: { google: { enabled: boolean } } };
    assert.strictEqual(json.providers.google.enabled, false);
  });

  test("update provider api_key_env (local) writes to local-overrides + clears shared", () => {
    const router = newRouterConfig();
    const budget = newBudget();
    const local = emptyLocalOverridesDoc();
    const result = applyPatch(router, budget, local, {
      providers: [
        { id: "google", apiKeyEnv: { value: "MY_PERSONAL_GEMINI_KEY", source: "local" } },
      ],
    });
    assert.ok(result.localOverridesChanged);
    const localJson = local.toJSON() as { providers: { google: { api_key_env: string } } };
    assert.strictEqual(localJson.providers.google.api_key_env, "MY_PERSONAL_GEMINI_KEY");
    // router-config.yaml's google.api_key_env should be removed (move-not-copy)
    const routerJson = router.toJSON() as { providers: { google: Record<string, unknown> } };
    assert.ok(!("api_key_env" in routerJson.providers.google), "shared api_key_env should be cleared when promoting to local");
  });

  test("removed provider is deleted from both files", () => {
    const router = newRouterConfig();
    const budget = newBudget();
    const local = emptyLocalOverridesDoc();
    // First add a local override for google so we can verify removal cleans both
    applyPatch(router, budget, local, {
      providers: [{ id: "google", apiKeyEnv: { value: "MY_KEY", source: "local" } }],
    });
    // Now remove google entirely
    const result = applyPatch(router, budget, local, {
      providers: [{ id: "google", removed: true }],
    });
    assert.ok(result.routerConfigChanged);
    const routerJson = router.toJSON() as { providers: Record<string, unknown> };
    assert.ok(!("google" in routerJson.providers));
    const localJson = local.toJSON() as { providers?: Record<string, unknown> };
    assert.ok(!localJson.providers || !("google" in localJson.providers));
  });

  test("display_label is shared-only (no local-overrides routing)", () => {
    const router = newRouterConfig();
    const budget = newBudget();
    const local = emptyLocalOverridesDoc();
    const result = applyPatch(router, budget, local, {
      providers: [{ id: "anthropic", displayLabel: "Claude (Anthropic)" }],
    });
    assert.ok(result.routerConfigChanged);
    const json = router.toJSON() as { providers: { anthropic: { display_label: string } } };
    assert.strictEqual(json.providers.anthropic.display_label, "Claude (Anthropic)");
  });
});

suite("patch — §4 significance flagging", () => {
  test("honor_annotations writes to local-overrides decision_review block", () => {
    const router = newRouterConfig();
    const budget = newBudget();
    const local = emptyLocalOverridesDoc();
    const result = applyPatch(router, budget, local, { honorAnnotations: false });
    assert.ok(result.localOverridesChanged);
    const json = local.toJSON() as { decision_review: { honor_annotations: boolean } };
    assert.strictEqual(json.decision_review.honor_annotations, false);
  });
});

suite("patch — §5 notifications", () => {
  test("pushover fields write to local-overrides notifications.pushover", () => {
    const router = newRouterConfig();
    const budget = newBudget();
    const local = emptyLocalOverridesDoc();
    const result = applyPatch(router, budget, local, {
      pushoverEnabled: true,
      pushoverApiKeyEnv: "PUSHOVER_API_KEY",
      pushoverUserKeyEnv: "PUSHOVER_USER_KEY",
    });
    assert.ok(result.localOverridesChanged);
    const json = local.toJSON() as { notifications: { pushover: Record<string, unknown> } };
    assert.strictEqual(json.notifications.pushover.enabled, true);
    assert.strictEqual(json.notifications.pushover.api_key_env, "PUSHOVER_API_KEY");
    assert.strictEqual(json.notifications.pushover.user_key_env, "PUSHOVER_USER_KEY");
  });
});

suite("patch — comment preservation across applyPatch", () => {
  test("top-level comments survive a save", () => {
    const router = newRouterConfig();
    const budget = newBudget();
    const local = emptyLocalOverridesDoc();
    applyPatch(router, budget, local, {
      thresholdUsd: { value: 99, source: "shared" },
    });
    const serialized = budget.toString();
    assert.ok(serialized.includes("# budget.yaml"), "header comment should survive applyPatch");
    assert.ok(serialized.includes("threshold_usd: 99"));
  });
});

suite("patch — no-op save (write-on-change)", () => {
  test("no-op when payload values match disk values", () => {
    const router = newRouterConfig();
    const budget = newBudget();
    const local = emptyLocalOverridesDoc();
    // Apply payload that matches the existing doc state exactly
    const result = applyPatch(router, budget, local, {
      outsourcingMode: { value: "whenever-helpful", source: "shared" },
      verificationMethod: "api",
      thresholdUsd: { value: 10, source: "shared" },
      scope: "per-project",
      warnAtPercent: { value: 80, source: "shared" },
      providers: [
        { id: "anthropic", displayLabel: "Anthropic", enabled: { value: true, source: "shared" }, apiKeyEnv: { value: "DABBLER_ANTHROPIC_API_KEY", source: "shared" } },
      ],
    });
    assert.strictEqual(result.routerConfigChanged, false, "router-config should not be marked changed on no-op");
    assert.strictEqual(result.budgetChanged, false, "budget should not be marked changed on no-op");
    assert.strictEqual(result.localOverridesChanged, false, "local-overrides should not be marked changed on no-op");
  });

  test("partial no-op: only the changed field flips its flag", () => {
    const router = newRouterConfig();
    const budget = newBudget();
    const local = emptyLocalOverridesDoc();
    const budgetMissing = budget.toJSON();
    void budgetMissing;
    const result = applyPatch(router, budget, local, {
      verificationMethod: "api", // unchanged
      thresholdUsd: { value: 99, source: "shared" }, // CHANGED
    });
    assert.strictEqual(result.budgetChanged, true, "budget should change because threshold_usd flipped");
    assert.strictEqual(result.routerConfigChanged, false);
    assert.strictEqual(result.localOverridesChanged, false);
  });
});

suite("patch — demote from local to shared", () => {
  test("threshold_usd shared demotes any existing local override", () => {
    const router = newRouterConfig();
    const budget = newBudget();
    const local = parseDocument("threshold_usd: 5\n");
    const result = applyPatch(router, budget, local, {
      thresholdUsd: { value: 25, source: "shared" },
    });
    assert.ok(result.budgetChanged);
    assert.ok(result.localOverridesChanged, "local override must be deleted on demote");
    const localJson = local.toJSON() as Record<string, unknown>;
    assert.ok(!("threshold_usd" in localJson), "threshold_usd should be removed from local-overrides");
    const budgetJson = budget.toJSON() as Record<string, unknown>;
    assert.strictEqual(budgetJson.threshold_usd, 25, "budget should reflect the new value");
  });

  test("warn_at_percent shared demotes any existing local override", () => {
    const router = newRouterConfig();
    const budget = newBudget();
    const local = parseDocument("warn_at_percent: 50\n");
    const result = applyPatch(router, budget, local, {
      warnAtPercent: { value: 70, source: "shared" },
    });
    assert.ok(result.budgetChanged);
    assert.ok(result.localOverridesChanged);
    const localJson = local.toJSON() as Record<string, unknown>;
    assert.ok(!("warn_at_percent" in localJson));
    const budgetJson = budget.toJSON() as Record<string, unknown>;
    assert.strictEqual(budgetJson.warn_at_percent, 70);
  });

  test("outsourcing_mode shared demotes any existing local override", () => {
    const router = newRouterConfig();
    const budget = newBudget();
    const local = parseDocument("routing:\n  outsourcing_mode: disabled\n");
    const result = applyPatch(router, budget, local, {
      outsourcingMode: { value: "verification-only", source: "shared" },
    });
    assert.ok(result.routerConfigChanged);
    assert.ok(result.localOverridesChanged, "local override must be deleted on demote");
    const localJson = local.toJSON() as Record<string, unknown> | null;
    assert.ok(!localJson || !("routing" in localJson), "empty routing container should be pruned");
  });
});

suite("patch — content hash helper", () => {
  test("docContentHash returns null for null doc", () => {
    assert.strictEqual(docContentHash(null), null);
  });

  test("identical docs produce identical hashes", () => {
    const a = parseDocument("foo: 1\n");
    const b = parseDocument("foo: 1\n");
    assert.strictEqual(docContentHash(a), docContentHash(b));
  });

  test("different docs produce different hashes", () => {
    const a = parseDocument("foo: 1\n");
    const b = parseDocument("foo: 2\n");
    assert.notStrictEqual(docContentHash(a), docContentHash(b));
  });
});
