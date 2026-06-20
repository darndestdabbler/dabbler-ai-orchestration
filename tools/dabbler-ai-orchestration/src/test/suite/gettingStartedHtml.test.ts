// Set 060 Session 3 — unit tests for the pure Getting Started HTML
// builders (media/session-sets-tree/gettingStartedHtml.js, the UMD-lite
// module the webview loads before client.js). Covers:
//
//   - the D6 Full-tier provider-key warning under the Build button
//     (visible only when tier=full AND providerKeyPresent=false), and
//   - the D7 parallel-worktree note under the checkbox — the
//     checked-vs-unchecked rendering test verifier issue
//     S060-S2-V1-001 asked for, shipping with the note itself.
//
// The module is plain JS by design (the webview loads it raw, outside
// the esbuild bundle), so the test requires it straight off disk.

import * as assert from "assert";
import * as path from "path";
import { createRequire } from "module";

// mocha 10 is import-first; under Node >=22 native type-stripping a
// test file with no relative TS imports loads as native ESM, where the
// CJS `require` / `__dirname` globals don't exist. `createRequire`
// anchored at the package root (the npm script's cwd) works in BOTH
// load modes. Do not switch this to a bare `require` or `__dirname`.
const requireFromPackageRoot = createRequire(
  path.join(process.cwd(), "package.json"),
);
// Set 063 S2: budget controls ride the webview control state. Optional
// here because most pre-063 assertions don't exercise them; the module
// treats absent budget fields as empty input / no zero-rule pick.
interface GsControls {
  tier: "full" | "lightweight";
  parallel: boolean;
  budget?: string;
  zeroMethod?: string | null;
}

const gsHtml = requireFromPackageRoot(
  "./media/session-sets-tree/gettingStartedHtml.js",
) as {
  renderNoFolder(): string;
  renderGettingStarted(
    gs: {
      mode: string;
      structureBuilt: boolean;
      planPresent: boolean;
      sessionSetsPresent: boolean;
      providerKeyPresent: boolean;
    },
    controls: GsControls,
  ): string;
  envWarningHtml(visible: boolean): string;
  worktreeNoteHtml(visible: boolean): string;
  budgetBlockHtml(controls: GsControls): string;
  parseBudgetInput(raw: unknown):
    | { ok: true; value: number }
    | { ok: false; error: string };
  validateBudgetControls(controls: GsControls):
    | { ok: true; budgetUsd: number; zeroMethod: string | null }
    | { ok: false; error: string };
  ENV_WARNING_TEXT: string;
  WORKTREE_NOTE_TEXT: string;
  BUDGET_LABEL_TEXT: string;
  BUDGET_HELP_TEXT: string;
  BUDGET_ZERO_CHOICE_TEXT: string;
};

function gs(overrides: Partial<{
  structureBuilt: boolean;
  planPresent: boolean;
  sessionSetsPresent: boolean;
  providerKeyPresent: boolean;
}> = {}) {
  return {
    mode: "getting-started",
    structureBuilt: false,
    planPresent: false,
    sessionSetsPresent: false,
    providerKeyPresent: true,
    ...overrides,
  };
}

const FULL = { tier: "full" as const, parallel: false };
const LIGHT = { tier: "lightweight" as const, parallel: false };

// The warning/note are always rendered and toggled via the `hidden`
// attribute (so client.js can flip visibility without re-rendering).
// "Visible" = the element exists WITHOUT `hidden`.
function isVisible(html: string, dataAttr: string): boolean {
  const idx = html.indexOf(dataAttr);
  assert.notStrictEqual(idx, -1, `element ${dataAttr} not rendered at all`);
  const tagStart = html.lastIndexOf("<div", idx);
  const tagEnd = html.indexOf(">", idx);
  const openTag = html.slice(tagStart, tagEnd + 1);
  return !/\shidden[\s>]/.test(openTag);
}

suite("gettingStartedHtml — form structure (Set 060 S1/S2 parity)", () => {
  test("renders the three steps with their action buttons", () => {
    const html = gsHtml.renderGettingStarted(gs(), FULL);
    for (const action of [
      "build-structure",
      "import-plan",
      "copy-plan-prompt",
      "build-session-sets",
    ]) {
      assert.ok(
        html.includes(`data-gs-action="${action}"`),
        `missing action button ${action}`,
      );
    }
    assert.ok(html.includes('name="gs-tier"'));
    assert.ok(html.includes('name="gs-parallel"'));
  });

  test("completion flags grey/check the steps (D2/D3)", () => {
    const html = gsHtml.renderGettingStarted(
      gs({ structureBuilt: true }),
      FULL,
    );
    assert.ok(html.includes("gs-step gs-step-complete"));
    assert.ok(html.includes("✓"));
  });

  test("control state survives re-render (radio + checkbox checked attrs)", () => {
    const html = gsHtml.renderGettingStarted(gs(), {
      tier: "lightweight",
      parallel: true,
    });
    assert.ok(/value="lightweight" checked/.test(html));
    assert.ok(/name="gs-parallel" checked/.test(html));
  });

  test("no-folder surface renders the open-folder CTA", () => {
    const html = gsHtml.renderNoFolder();
    assert.ok(html.includes('data-gs-action="open-folder"'));
  });
});

suite("gettingStartedHtml — D6 provider-key warning (Set 060 S3)", () => {
  test("Full tier + no key → warning VISIBLE under the Build button", () => {
    const html = gsHtml.renderGettingStarted(
      gs({ providerKeyPresent: false }),
      FULL,
    );
    assert.strictEqual(isVisible(html, 'data-gs-warning="env"'), true);
    // Placement: inside step 1's body, after the Build button.
    const buildIdx = html.indexOf('data-gs-action="build-structure"');
    const warnIdx = html.indexOf('data-gs-warning="env"');
    const step2Idx = html.indexOf("2. Create or import a project plan");
    assert.ok(buildIdx < warnIdx && warnIdx < step2Idx, "warning not under the Build button");
    // The copy carries the two load-bearing instructions.
    assert.ok(html.includes("DABBLER_ANTHROPIC_API_KEY"));
    assert.ok(html.includes("reload the VS Code window"));
  });

  test("Full tier + key present → warning hidden", () => {
    const html = gsHtml.renderGettingStarted(
      gs({ providerKeyPresent: true }),
      FULL,
    );
    assert.strictEqual(isVisible(html, 'data-gs-warning="env"'), false);
  });

  test("Lightweight tier shows NO warning regardless of keys (D6)", () => {
    const noKey = gsHtml.renderGettingStarted(
      gs({ providerKeyPresent: false }),
      LIGHT,
    );
    assert.strictEqual(isVisible(noKey, 'data-gs-warning="env"'), false);
    const withKey = gsHtml.renderGettingStarted(
      gs({ providerKeyPresent: true }),
      LIGHT,
    );
    assert.strictEqual(isVisible(withKey, 'data-gs-warning="env"'), false);
  });

  test("envWarningHtml escapes its copy and carries role=alert", () => {
    const visible = gsHtml.envWarningHtml(true);
    assert.ok(visible.includes('role="alert"'));
    assert.ok(!/\shidden[\s>]/.test(visible));
    const hidden = gsHtml.envWarningHtml(false);
    assert.ok(/\shidden>/.test(hidden));
  });
});

suite("gettingStartedHtml — D7 worktree note (S060-S2-V1-001)", () => {
  test("checkbox CHECKED → worktree note visible with the git-worktrees copy", () => {
    const html = gsHtml.renderGettingStarted(gs(), {
      tier: "full",
      parallel: true,
    });
    assert.strictEqual(isVisible(html, 'data-gs-note="worktree"'), true);
    assert.ok(html.includes("git worktrees"));
    assert.ok(html.includes("merged back to the main branch"));
  });

  test("checkbox UNCHECKED → worktree note rendered but hidden", () => {
    const html = gsHtml.renderGettingStarted(gs(), {
      tier: "full",
      parallel: false,
    });
    assert.strictEqual(isVisible(html, 'data-gs-note="worktree"'), false);
  });

  test("note sits inside step 3, after the parallel checkbox", () => {
    const html = gsHtml.renderGettingStarted(gs(), {
      tier: "full",
      parallel: true,
    });
    const checkboxIdx = html.indexOf('name="gs-parallel"');
    const noteIdx = html.indexOf('data-gs-note="worktree"');
    assert.ok(checkboxIdx < noteIdx, "note not after the checkbox");
  });
});

// ---------- Set 063 S2 (spec D1): the budget / NTE step ----------

suite("gettingStartedHtml — budget block rendering (Set 063 S2)", () => {
  test("Full tier renders the budget input inside step 1, before the Build button", () => {
    const html = gsHtml.renderGettingStarted(gs(), FULL);
    assert.strictEqual(isVisible(html, "data-gs-budget"), true);
    assert.ok(html.includes('name="gs-budget"'));
    assert.ok(html.includes('placeholder="25"'));
    assert.ok(html.includes(gsHtml.BUDGET_LABEL_TEXT));
    const tierIdx = html.indexOf('name="gs-tier"');
    const budgetIdx = html.indexOf("data-gs-budget");
    const buildIdx = html.indexOf('data-gs-action="build-structure"');
    const step2Idx = html.indexOf("2. Create or import a project plan");
    assert.ok(
      tierIdx < budgetIdx && budgetIdx < buildIdx && buildIdx < step2Idx,
      "budget block must sit in step 1 between the tier radio and the Build button",
    );
  });

  test("Lightweight OMITS the budget block entirely (never renders the input)", () => {
    // S2 verifier R1 Minor: the D1 lock says Lightweight never renders
    // the input — absent from the DOM, not present-but-hidden.
    const html = gsHtml.renderGettingStarted(gs(), LIGHT);
    assert.ok(!html.includes("data-gs-budget"), "budget block must be absent");
    assert.ok(!html.includes('name="gs-budget"'), "budget input must be absent");
    assert.ok(!html.includes('name="gs-zero-method"'), "zero-rule pair must be absent");
  });

  test("control state survives re-render (input value + zero-rule pick)", () => {
    const html = gsHtml.renderGettingStarted(gs(), {
      tier: "full",
      parallel: false,
      budget: "0",
      zeroMethod: "skipped",
    });
    assert.ok(/name="gs-budget"[^>]*value="0"/.test(html));
    assert.ok(/value="skipped" checked/.test(html));
  });

  test("$0 input reveals the zero-rule radio pair with the locked copy", () => {
    const zero = gsHtml.renderGettingStarted(gs(), {
      tier: "full",
      parallel: false,
      budget: "0",
      zeroMethod: null,
    });
    assert.strictEqual(isVisible(zero, "data-gs-zero-choice"), true);
    assert.ok(zero.includes(gsHtml.BUDGET_ZERO_CHOICE_TEXT));
    assert.ok(zero.includes('value="manual-via-other-engine"'));
    assert.ok(zero.includes('value="skipped"'));
  });

  test("non-zero / empty input keeps the zero-rule pair hidden", () => {
    for (const budget of ["25", "", "abc"]) {
      const html = gsHtml.renderGettingStarted(gs(), {
        tier: "full",
        parallel: false,
        budget,
        zeroMethod: null,
      });
      assert.strictEqual(isVisible(html, "data-gs-zero-choice"), false, budget);
    }
  });

  test("the validation element renders hidden and empty initially", () => {
    const html = gsHtml.renderGettingStarted(gs(), FULL);
    assert.ok(html.includes("data-gs-budget-error"));
    assert.strictEqual(isVisible(html, "data-gs-budget-error"), false);
  });
});

suite("gettingStartedHtml — parseBudgetInput / validateBudgetControls (Set 063 S2)", () => {
  test("accepts plain dollar amounts >= 0 (whitespace tolerated)", () => {
    for (const [raw, value] of [
      ["25", 25],
      ["0", 0],
      ["12.5", 12.5],
      [" 100 ", 100],
    ] as const) {
      const r = gsHtml.parseBudgetInput(raw);
      assert.deepStrictEqual(r, { ok: true, value }, String(raw));
    }
  });

  test("rejects empty, non-numeric, and negative input with inline messages", () => {
    for (const raw of ["", "   ", "abc", "$25", "10 dollars", "-1", "-0.5"]) {
      const r = gsHtml.parseBudgetInput(raw);
      assert.strictEqual(r.ok, false, raw);
      assert.ok(!r.ok && r.error.length > 0, raw);
    }
  });

  test("validateBudgetControls: >0 passes with no zero-rule needed", () => {
    const r = gsHtml.validateBudgetControls({
      tier: "full",
      parallel: false,
      budget: "25",
      zeroMethod: null,
    });
    assert.deepStrictEqual(r, { ok: true, budgetUsd: 25, zeroMethod: null });
  });

  test("validateBudgetControls: $0 blocks until a zero-rule is picked", () => {
    const blocked = gsHtml.validateBudgetControls({
      tier: "full",
      parallel: false,
      budget: "0",
      zeroMethod: null,
    });
    assert.strictEqual(blocked.ok, false);
    assert.ok(!blocked.ok && blocked.error === gsHtml.BUDGET_ZERO_CHOICE_TEXT);
    for (const method of ["manual-via-other-engine", "skipped"]) {
      const r = gsHtml.validateBudgetControls({
        tier: "full",
        parallel: false,
        budget: "0",
        zeroMethod: method,
      });
      assert.deepStrictEqual(r, { ok: true, budgetUsd: 0, zeroMethod: method }, method);
    }
  });

  test("validateBudgetControls: invalid input blocks with the parse message", () => {
    for (const budget of ["", "abc", "-3"]) {
      const r = gsHtml.validateBudgetControls({
        tier: "full",
        parallel: false,
        budget,
        zeroMethod: null,
      });
      assert.strictEqual(r.ok, false, budget);
    }
  });
});
