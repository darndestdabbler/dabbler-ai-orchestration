import * as assert from "assert";
import { render } from "../../configEditor/sections/significanceFlaggingSection";
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

suite("significanceFlaggingSection — rendering", () => {
  test("renders the command name + annotation syntax + queue file path", () => {
    const { html } = render(baseState());
    assert.ok(html.includes("Dabbler: Flag Decision for Cross-Provider Review"));
    assert.ok(html.includes("@dabbler:outsource-review"));
    assert.ok(html.includes("decision-review-queue.jsonl"));
  });

  test("describes the actual annotation surface (workspace scan command, not auto-on-session-start)", () => {
    // Verifier-flagged stale copy: Session 5 said "orchestrator scans open
    // files at session start" but the shipped behavior is a manual
    // workspace-walk command. The section must name the command and the
    // dedup behavior, and must NOT promise automatic / session-start scanning
    // that doesn't exist.
    const { html } = render(baseState());
    assert.ok(
      html.includes("Dabbler: Scan Workspace for @dabbler:outsource-review Annotations"),
      "section must name the scan command verbatim",
    );
    assert.ok(html.includes("deduplicated"), "section must mention dedup behavior");
    assert.ok(
      !/scans? open files at session start/i.test(html),
      "section must NOT promise automatic session-start scanning",
    );
    assert.ok(
      !/queued automatically/i.test(html),
      "section must NOT imply automatic queue population",
    );
  });

  test("documents both # and // comment styles in the code-sample", () => {
    const { html } = render(baseState());
    assert.ok(html.includes('# @dabbler:outsource-review'));
    assert.ok(html.includes('// @dabbler:outsource-review'));
  });

  test('includes "Run command now..." button bound to s4-run-flag-command', () => {
    const { html } = render(baseState());
    assert.ok(html.includes('id="s4-run-flag-command"'));
    assert.ok(html.includes("Run command now"));
  });

  test("honor-annotations checkbox defaults to checked when absent from local-overrides", () => {
    const { html } = render(baseState());
    assert.ok(/id="s4-honor-annotations"[^>]*checked/.test(html));
  });

  test("honor-annotations checkbox unchecked when local-overrides explicitly sets false", () => {
    const { html } = render(baseState({
      localOverrides: { decision_review: { honor_annotations: false } },
    }));
    assert.ok(!/id="s4-honor-annotations"[^>]*checked/.test(html));
  });

  test("(local override) indicator surfaces when honor_annotations is set locally", () => {
    const { html } = render(baseState({
      localOverrides: { decision_review: { honor_annotations: false } },
    }));
    assert.ok(html.includes("(local override)"));
  });

  test("(default) indicator when honor_annotations is absent", () => {
    const { html } = render(baseState());
    assert.ok(html.includes("(default)"));
  });
});
