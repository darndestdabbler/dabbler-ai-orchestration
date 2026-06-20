import * as assert from "assert";
import { render } from "../../configEditor/sections/localOverridesSummarySection";
import { SectionState } from "../../configEditor/sections/types";

function baseState(over: Partial<SectionState> = {}): SectionState {
  return {
    routerConfig: null,
    budget: null,
    localOverrides: null,
    envVarPresence: {},
    localOverridesFileExists: false,
    ...over,
  };
}

suite("localOverridesSummarySection — rendering", () => {
  test("absent file: shows 'No local overrides' message; no Open button", () => {
    const { html } = render(baseState());
    assert.ok(html.includes("does not exist yet"));
    assert.ok(!html.includes('id="s6-open-local-overrides"'), "open button should be absent when file is absent");
  });

  test("empty local-overrides: shows summary + Open button", () => {
    const { html } = render(baseState({
      localOverrides: {},
      localOverridesFileExists: true,
    }));
    assert.ok(html.includes("no override entries"));
    assert.ok(html.includes('id="s6-open-local-overrides"'));
  });

  test("populated local-overrides: lists each override path side-by-side with shared value", () => {
    const { html } = render(baseState({
      routerConfig: { providers: { google: { api_key_env: "DABBLER_GEMINI_API_KEY" } } },
      localOverrides: {
        providers: { google: { api_key_env: "MY_PERSONAL_GEMINI_KEY" } },
      },
      localOverridesFileExists: true,
    }));
    assert.ok(html.includes("providers.google.api_key_env"), "override path should be listed");
    assert.ok(html.includes("DABBLER_GEMINI_API_KEY"), "shared value should be shown");
    assert.ok(html.includes("MY_PERSONAL_GEMINI_KEY"), "local value should be shown");
  });

  test("notifications.* paths show '(local-only section)' as shared value", () => {
    const { html } = render(baseState({
      localOverrides: {
        notifications: { pushover: { enabled: true } },
      },
      localOverridesFileExists: true,
    }));
    assert.ok(html.includes("notifications.pushover.enabled"));
    assert.ok(html.includes("(local-only section)"));
  });

  test("Open local-overrides button is present when file exists", () => {
    const { html } = render(baseState({
      localOverrides: { decision_review: { honor_annotations: false } },
      localOverridesFileExists: true,
    }));
    assert.ok(html.includes('id="s6-open-local-overrides"'));
  });

  test("scalar override values are rendered as their primitive string form", () => {
    const { html } = render(baseState({
      routerConfig: { routing: { outsourcing_mode: "whenever-helpful" } },
      localOverrides: { routing: { outsourcing_mode: "disabled" } },
      localOverridesFileExists: true,
    }));
    assert.ok(html.includes("routing.outsourcing_mode"));
    assert.ok(html.includes("disabled"));
    assert.ok(html.includes("whenever-helpful"));
  });
});
