import * as assert from "assert";
import { render } from "../../configEditor/sections/providersTableSection";
import { SectionState } from "../../configEditor/sections/types";

function baseState(over: Partial<SectionState> = {}): SectionState {
  return {
    routerConfig: {
      providers: {
        anthropic: {
          display_label: "Anthropic (Claude)",
          enabled: true,
          api_key_env: "DABBLER_ANTHROPIC_API_KEY",
          base_url: "https://api.anthropic.com/v1/messages",
        },
        google: {
          enabled: false,
          api_key_env: "DABBLER_GEMINI_API_KEY",
        },
      },
    },
    budget: null,
    localOverrides: null,
    envVarPresence: { DABBLER_ANTHROPIC_API_KEY: true, DABBLER_GEMINI_API_KEY: false },
    localOverridesFileExists: false,
    ...over,
  };
}

suite("providersTableSection — rendering", () => {
  test("renders one row per provider in router-config", () => {
    const { html } = render(baseState());
    const rowCount = (html.match(/class="provider-row"/g) ?? []).length;
    assert.strictEqual(rowCount, 2);
    assert.ok(html.includes('data-provider-id="anthropic"'));
    assert.ok(html.includes('data-provider-id="google"'));
  });

  test("env-var-set provider shows ✓ badge; unset provider shows (unset) badge", () => {
    const { html } = render(baseState());
    const anthropicRowStart = html.indexOf('data-provider-id="anthropic"');
    const googleRowStart = html.indexOf('data-provider-id="google"');
    const anthropicSlice = html.slice(anthropicRowStart, googleRowStart);
    const googleSlice = html.slice(googleRowStart);

    assert.ok(/&#10003;/.test(anthropicSlice), "anthropic env var is set → ✓ badge");
    assert.ok(googleSlice.includes("(unset)"), "google env var is unset → (unset) badge");
  });

  test("display label defaults to title-cased id when missing", () => {
    const { html } = render(baseState({
      routerConfig: { providers: { "my-custom-provider": { api_key_env: "MY_KEY" } } },
      envVarPresence: { MY_KEY: false },
    }));
    assert.ok(html.includes('value="My Custom Provider"'));
  });

  test("provider ID column is rendered as <code>", () => {
    const { html } = render(baseState());
    assert.ok(/<code>anthropic<\/code>/.test(html));
    assert.ok(/<code>google<\/code>/.test(html));
  });

  test("popover toggle button + hidden popover row per provider", () => {
    const { html } = render(baseState());
    const popoverButtons = (html.match(/class="secondary popover-toggle"/g) ?? []).length;
    assert.strictEqual(popoverButtons, 2);
    const popoverRows = (html.match(/class="provider-popover"/g) ?? []).length;
    assert.strictEqual(popoverRows, 2);
    assert.ok(html.includes('id="popover-anthropic"'));
    assert.ok(html.includes('id="popover-google"'));
    // hidden by default
    assert.ok(/id="popover-anthropic"[^>]*style="display:none;"/.test(html));
  });

  test("local override on api_key_env surfaces (local override) indicator and uses local value", () => {
    const { html } = render(baseState({
      localOverrides: {
        providers: { anthropic: { api_key_env: "MY_PERSONAL_ANTHROPIC_KEY" } },
      },
      envVarPresence: { DABBLER_ANTHROPIC_API_KEY: true, MY_PERSONAL_ANTHROPIC_KEY: false, DABBLER_GEMINI_API_KEY: false },
    }));
    const anthropicRow = html.slice(
      html.indexOf('data-provider-id="anthropic"'),
      html.indexOf('data-provider-id="google"')
    );
    assert.ok(anthropicRow.includes("MY_PERSONAL_ANTHROPIC_KEY"), "input value should reflect local override");
    assert.ok(anthropicRow.includes("(local override)"), "indicator should reflect local source");
  });

  test("empty providers block renders placeholder row", () => {
    const { html } = render(baseState({ routerConfig: { providers: {} } }));
    assert.ok(html.includes("No providers configured"));
  });

  test("env var input has uppercase-pattern validation attribute", () => {
    const { html } = render(baseState());
    assert.ok(/pattern="\^\[A-Z_\]\[A-Z0-9_\]\*\$"/.test(html));
  });
});
