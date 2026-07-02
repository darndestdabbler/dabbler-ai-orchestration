import * as assert from "assert";
import { render } from "../../configEditor/sections/notificationsSection";
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

suite("notificationsSection — rendering", () => {
  test("renders all three controls", () => {
    const { html } = render(baseState());
    assert.ok(html.includes('id="s5-pushover-enabled"'));
    assert.ok(html.includes('id="s5-pushover-api-key-env"'));
    assert.ok(html.includes('id="s5-pushover-user-key-env"'));
  });

  // Set 026 Session 7 wired the button (the pre-wiring assertion expected
  // a disabled placeholder); Set 077 S1 caught the stale expectation — the
  // suite is not part of the CI mocha subset, so the drift sat unnoticed.
  test("test-notification button is rendered enabled (wired in Set 026 Session 7)", () => {
    const { html } = render(baseState());
    assert.ok(html.includes('id="s5-test-notification"'));
    assert.ok(!/id="s5-test-notification"[^>]*disabled/.test(html));
  });

  test("env var inputs default to PUSHOVER_API_KEY / PUSHOVER_USER_KEY", () => {
    const { html } = render(baseState());
    assert.ok(html.includes('value="PUSHOVER_API_KEY"'));
    assert.ok(html.includes('value="PUSHOVER_USER_KEY"'));
  });

  test("env-var presence badge: set → ✓; unset → (unset)", () => {
    const setState = baseState({
      localOverrides: {
        notifications: { pushover: { api_key_env: "MY_PUSHOVER_TOKEN", user_key_env: "MY_PUSHOVER_USER" } },
      },
      envVarPresence: { MY_PUSHOVER_TOKEN: true, MY_PUSHOVER_USER: false },
    });
    const { html } = render(setState);
    // Find ✓ next to api_key_env input
    const apiKeyIdx = html.indexOf('id="s5-pushover-api-key-env"');
    const userKeyIdx = html.indexOf('id="s5-pushover-user-key-env"');
    const apiSlice = html.slice(apiKeyIdx, userKeyIdx);
    const userSlice = html.slice(userKeyIdx);
    assert.ok(/&#10003;/.test(apiSlice), "set env var should show ✓ badge");
    assert.ok(userSlice.includes("(unset)"), "unset env var should show (unset) badge");
  });

  test("(local override) indicator shows for enabled when explicitly set in local-overrides", () => {
    const state = baseState({
      localOverrides: { notifications: { pushover: { enabled: true } } },
    });
    const { html } = render(state);
    assert.ok(html.includes("(local override)"));
  });

  test("(default) indicator shows for enabled when no local-overrides value", () => {
    const { html } = render(baseState());
    assert.ok(html.includes("(default)"));
  });

  test("env var pattern validation attribute on inputs", () => {
    const { html } = render(baseState());
    assert.ok(/pattern="\^\[A-Z_\]\[A-Z0-9_\]\*\$"/.test(html));
  });
});
