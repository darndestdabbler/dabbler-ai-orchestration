/**
 * End-to-end smoke for the config editor: load three YAMLs, derive section
 * state, render all six sections, apply a multi-section patch, write,
 * re-load, confirm values persisted. Exercises the panel + section +
 * patch + yaml-read-write pipeline end-to-end without a real webview.
 */
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { readYamlFile, writeYamlFile } from "../../configEditor/yamlReadWrite";
import { validateBatch } from "../../configEditor/schemaValidator";
import { applyPatch, emptyLocalOverridesDoc, SavePayload } from "../../configEditor/patch";
import { render as renderRouting } from "../../configEditor/sections/routingAndVerificationSection";
import { render as renderBudget } from "../../configEditor/sections/budgetSection";
import { render as renderProviders } from "../../configEditor/sections/providersTableSection";
import { render as renderSignificance } from "../../configEditor/sections/significanceFlaggingSection";
import { render as renderNotifications } from "../../configEditor/sections/notificationsSection";
import { render as renderLocalOverrides } from "../../configEditor/sections/localOverridesSummarySection";
import { SectionState } from "../../configEditor/sections/types";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-e2e-test-"));
}

function deriveState(routerObj: Record<string, unknown> | null, budgetObj: Record<string, unknown> | null, localObj: Record<string, unknown> | null, fileExists: boolean): SectionState {
  return {
    routerConfig: routerObj,
    budget: budgetObj,
    localOverrides: localObj,
    envVarPresence: {},
    localOverridesFileExists: fileExists,
  };
}

suite("configEditor end-to-end smoke", () => {
  test("all six sections render against a realistic state without throwing", () => {
    const state: SectionState = {
      routerConfig: {
        providers: {
          anthropic: { display_label: "Anthropic", enabled: true, api_key_env: "DABBLER_ANTHROPIC_API_KEY" },
          google: { display_label: "Google", enabled: true, api_key_env: "DABBLER_GEMINI_API_KEY" },
        },
        routing: { outsourcing_mode: "whenever-helpful" },
      },
      budget: { threshold_usd: 15, scope: "per-project", warn_at_percent: 80, verification_method: "api" },
      localOverrides: { notifications: { pushover: { enabled: true, api_key_env: "PUSHOVER_API_KEY", user_key_env: "PUSHOVER_USER_KEY" } } },
      envVarPresence: { DABBLER_ANTHROPIC_API_KEY: true, DABBLER_GEMINI_API_KEY: true, PUSHOVER_API_KEY: false, PUSHOVER_USER_KEY: false },
      localOverridesFileExists: true,
    };
    const s1 = renderRouting(state);
    const s2 = renderBudget(state);
    const s3 = renderProviders(state);
    const s4 = renderSignificance(state);
    const s5 = renderNotifications(state);
    const s6 = renderLocalOverrides(state);
    for (const html of [s1.html, s2.html, s3.html, s4.html, s5.html, s6.html]) {
      assert.ok(typeof html === "string" && html.length > 50);
    }
    // Each section's HTML appears in the combined render
    assert.ok(s1.html.includes("s1-outsourcing-mode"));
    assert.ok(s2.html.includes("s2-threshold-usd"));
    assert.ok(s3.html.includes("provider-row"));
    assert.ok(s4.html.includes("s4-honor-annotations"));
    assert.ok(s5.html.includes("s5-pushover-enabled"));
    assert.ok(s6.html.includes("notifications.pushover.enabled"));
  });

  test("save round-trip: edit one field per section, write, reload, confirm values persisted", () => {
    const dir = makeTmpDir();
    const routerPath = path.join(dir, "router-config.yaml");
    const budgetPath = path.join(dir, "budget.yaml");
    const localPath = path.join(dir, "local-overrides.yaml");

    fs.writeFileSync(
      routerPath,
      `# router-config.yaml
providers:
  anthropic:
    display_label: Anthropic
    enabled: true
    api_key_env: DABBLER_ANTHROPIC_API_KEY
routing:
  outsourcing_mode: whenever-helpful
`,
      "utf8"
    );
    fs.writeFileSync(
      budgetPath,
      `# budget.yaml
threshold_usd: 10
scope: per-project
warn_at_percent: 80
verification_method: api
`,
      "utf8"
    );

    // Load
    const router = readYamlFile(routerPath);
    const budget = readYamlFile(budgetPath);
    assert.ok(router && budget);

    // Patch (apply changes across multiple sections)
    const local = emptyLocalOverridesDoc();
    const payload: SavePayload = {
      outsourcingMode: { value: "verification-only", source: "shared" },
      verificationMethod: "manual-via-other-engine",
      thresholdUsd: { value: 25, source: "shared" },
      providers: [
        { id: "anthropic", enabled: { value: false, source: "local" } },
      ],
      honorAnnotations: false,
      pushoverEnabled: true,
      pushoverApiKeyEnv: "MY_PUSHOVER_TOKEN",
      pushoverUserKeyEnv: "MY_PUSHOVER_USER",
    };
    const applyResult = applyPatch(router.doc, budget.doc, local, payload);
    assert.ok(applyResult.routerConfigChanged);
    assert.ok(applyResult.budgetChanged);
    assert.ok(applyResult.localOverridesChanged);

    // Validate
    const v = validateBatch({
      routerConfig: router.doc.toJSON() as Record<string, unknown>,
      budget: budget.doc.toJSON() as Record<string, unknown>,
      localOverrides: local.toJSON() as Record<string, unknown>,
    });
    assert.ok(v.valid, `validation failed: ${JSON.stringify(v.errors)}`);

    // Write
    writeYamlFile(routerPath, router.doc);
    writeYamlFile(budgetPath, budget.doc);
    writeYamlFile(localPath, local);

    // Reload + re-derive state
    const routerR = readYamlFile(routerPath);
    const budgetR = readYamlFile(budgetPath);
    const localR = readYamlFile(localPath);
    assert.ok(routerR && budgetR && localR);

    const routerObj = routerR.doc.toJSON() as Record<string, unknown>;
    const budgetObj = budgetR.doc.toJSON() as Record<string, unknown>;
    const localObj = localR.doc.toJSON() as Record<string, unknown>;

    // Verify saved values
    assert.strictEqual((routerObj.routing as Record<string, unknown>).outsourcing_mode, "verification-only");
    assert.strictEqual(budgetObj.verification_method, "manual-via-other-engine");
    assert.strictEqual(budgetObj.threshold_usd, 25);
    assert.strictEqual(
      ((localObj.providers as Record<string, unknown>).anthropic as Record<string, unknown>).enabled,
      false
    );
    assert.strictEqual((localObj.decision_review as Record<string, unknown>).honor_annotations, false);
    assert.strictEqual(((localObj.notifications as Record<string, unknown>).pushover as Record<string, unknown>).enabled, true);

    // Re-render sections from reloaded state — verify the operator would see the new values
    const state = deriveState(routerObj, budgetObj, localObj, true);
    assert.ok(renderRouting(state).html.includes('value="verification-only" selected'));
    assert.ok(renderBudget(state).html.includes('value="25.00"'));
    assert.ok(renderLocalOverrides(state).html.includes("decision_review.honor_annotations"));

    fs.rmSync(dir, { recursive: true });
  });

  test("hand-edit introducing invalid value surfaces in next-load validation", () => {
    const dir = makeTmpDir();
    const routerPath = path.join(dir, "router-config.yaml");
    const budgetPath = path.join(dir, "budget.yaml");

    fs.writeFileSync(routerPath, "providers: {}\n", "utf8");
    // Hand-edit introduces lowercase env var name → schema violation
    fs.writeFileSync(budgetPath, "threshold_usd: -50\n", "utf8");

    const router = readYamlFile(routerPath);
    const budget = readYamlFile(budgetPath);
    const v = validateBatch({
      routerConfig: router?.doc.toJSON() as Record<string, unknown>,
      budget: budget?.doc.toJSON() as Record<string, unknown>,
      localOverrides: null,
    });
    assert.ok(!v.valid);
    assert.ok(v.errors.some((e) => e.file === "budget.yaml"));
    fs.rmSync(dir, { recursive: true });
  });
});
