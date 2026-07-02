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
  // Set 077 S3: the Lightweight verification-mode pick.
  verificationMode?: string | null;
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
  // Set 077 S3: the Lightweight-only verification-mode block + the A10
  // missing-Python warning.
  verificationModeBlockHtml(controls: GsControls): string;
  pythonWarningHtml(visible: boolean): string;
  PYTHON_WARNING_TEXT: string;
  VERIFICATION_MODE_LABEL_TEXT: string;
  // Set 077 S2 (A1/A11): pure teardown-restore narrowing for gsState.
  // S3 adds the 4th param (the verification-mode marker seed) and the
  // mode fields, mirroring the tier contract.
  restoreGsState(
    persisted?: unknown,
    tierSeed?: unknown,
    rootId?: unknown,
    modeSeed?: unknown,
  ): {
    tier: "full" | "lightweight";
    parallel: boolean;
    budget: string;
    zeroMethod: string | null;
    tierDirty: boolean;
    lastSeed: "full" | "lightweight" | null;
    verificationMode: "dedicated-sessions" | "out-of-band-or-none";
    modeDirty: boolean;
    lastModeSeed: "dedicated-sessions" | "out-of-band-or-none" | null;
    rootId: string | null;
  };
};

function gs(overrides: Partial<{
  structureBuilt: boolean;
  planPresent: boolean;
  sessionSetsPresent: boolean;
  providerKeyPresent: boolean;
  pythonPresent: boolean;
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

// Set 077 Session 2 (Feature 1, A1/A11): the form's control state now
// survives webview teardown via vscode.setState()/getState();
// restoreGsState is the pure narrowing that turns whatever came back —
// possibly undefined, stale, or malformed — into a well-formed gsState,
// with the host's durable tier seed outranking the persisted radio per
// the read-precedence contract (marker → inference → volatile UI).
// Routed test-generation (gemini-pro) drafted this suite; adapted here.
suite("gettingStartedHtml.js — restoreGsState (Set 077 S2)", () => {
  const defaults = {
    tier: "full",
    parallel: false,
    budget: "",
    zeroMethod: null,
    tierDirty: false,
    lastSeed: null,
    // Set 077 S3: the verification-mode family joins the state shape.
    verificationMode: "out-of-band-or-none",
    modeDirty: false,
    lastModeSeed: null,
    rootId: null,
  };

  test("returns defaults for absent or junk persisted input", () => {
    assert.deepStrictEqual(gsHtml.restoreGsState(undefined, null), defaults);
    assert.deepStrictEqual(gsHtml.restoreGsState(null, null), defaults);
    assert.deepStrictEqual(gsHtml.restoreGsState("foo", null), defaults);
    assert.deepStrictEqual(gsHtml.restoreGsState(42, null), defaults);
    assert.deepStrictEqual(gsHtml.restoreGsState({}, null), defaults);
  });

  test("round-trips a valid persisted state (simulated teardown/re-init)", () => {
    const persisted = {
      tier: "lightweight",
      parallel: true,
      budget: "25",
      zeroMethod: "skipped",
      tierDirty: true,
      lastSeed: "full",
      // Set 077 S3: the verification-mode family round-trips too.
      verificationMode: "dedicated-sessions",
      modeDirty: true,
      lastModeSeed: "out-of-band-or-none",
      rootId: "/repo-a",
    };
    assert.deepStrictEqual(gsHtml.restoreGsState(persisted, null), persisted);
  });

  test("malformed fields fall back individually, valid siblings survive", () => {
    assert.deepStrictEqual(
      gsHtml.restoreGsState({ tier: "ful", parallel: true }, null),
      { ...defaults, parallel: true },
    );
    assert.deepStrictEqual(
      gsHtml.restoreGsState({ tier: "lightweight", parallel: "yes" }, null),
      { ...defaults, tier: "lightweight" },
    );
    assert.deepStrictEqual(
      gsHtml.restoreGsState({ budget: 123 }, null),
      defaults,
    );
    assert.deepStrictEqual(
      gsHtml.restoreGsState({ zeroMethod: "unknown-method" }, null),
      defaults,
    );
  });

  test("the durable tier seed outranks an UNTOUCHED persisted radio value", () => {
    assert.strictEqual(
      gsHtml.restoreGsState({ tier: "full" }, "lightweight").tier,
      "lightweight",
    );
    assert.strictEqual(
      gsHtml.restoreGsState({ tier: "lightweight" }, "full").tier,
      "full",
    );
  });

  test("a DIRTY persisted radio (explicit operator flip) beats the SAME seed (S2 review, Major 1)", () => {
    // Operator scaffolded full (marker=full, lastSeed=full), then
    // deliberately flipped the radio to lightweight without rebuilding.
    // The unchanged seed must not silently revert the flip on reload.
    const restored = gsHtml.restoreGsState(
      { tier: "lightweight", tierDirty: true, lastSeed: "full" },
      "full",
    );
    assert.strictEqual(restored.tier, "lightweight");
    assert.strictEqual(restored.tierDirty, true);
    // A malformed dirty flag reads false — the seed applies as usual.
    assert.strictEqual(
      gsHtml.restoreGsState(
        { tier: "lightweight", tierDirty: "yes", lastSeed: "full" },
        "full",
      ).tier,
      "full",
    );
  });

  test("a CHANGED seed (newer sanctioned choice) overrides a dirty flip and clears it (S077-S2-V1-002)", () => {
    // Flip happened against a full marker; a later sanctioned change
    // (re-scaffold / Switch Tier) moved the marker — dirty must not be
    // a forever bit.
    const restored = gsHtml.restoreGsState(
      { tier: "full", tierDirty: true, lastSeed: "full" },
      "lightweight",
    );
    assert.strictEqual(restored.tier, "lightweight");
    assert.strictEqual(restored.tierDirty, false);
    assert.strictEqual(restored.lastSeed, "lightweight");
  });

  test("a seed equal to the current tier clears the dirty flag (caught up)", () => {
    const restored = gsHtml.restoreGsState(
      { tier: "lightweight", tierDirty: true, lastSeed: "full" },
      "lightweight",
    );
    assert.strictEqual(restored.tier, "lightweight");
    assert.strictEqual(restored.tierDirty, false);
  });

  test("persisted state from ANOTHER root is discarded before seeding (S077-S2-V1-001)", () => {
    // Repo A's lightweight pick must not drive repo B's form; B's own
    // durable seed (or the defaults) win instead.
    const restored = gsHtml.restoreGsState(
      { tier: "lightweight", parallel: true, budget: "25", rootId: "/repo-a" },
      "full",
      "/repo-b",
    );
    assert.deepStrictEqual(restored, {
      ...defaults,
      tier: "full",
      lastSeed: "full",
      rootId: "/repo-b",
    });
    // Same root: state survives and records the root.
    const same = gsHtml.restoreGsState(
      { tier: "lightweight", parallel: true, rootId: "/repo-a" },
      null,
      "/repo-a",
    );
    assert.strictEqual(same.tier, "lightweight");
    assert.strictEqual(same.parallel, true);
    assert.strictEqual(same.rootId, "/repo-a");
  });

  test("an absent or junk seed leaves the persisted tier untouched", () => {
    assert.strictEqual(gsHtml.restoreGsState({ tier: "lightweight" }, null).tier, "lightweight");
    assert.strictEqual(gsHtml.restoreGsState({ tier: "lightweight" }, undefined).tier, "lightweight");
    assert.strictEqual(gsHtml.restoreGsState({ tier: "lightweight" }, "junk").tier, "lightweight");
  });

  test("Set 076 replay: a Lightweight pick never snaps back to Full", () => {
    // The reported leak: hide/re-expand or reload re-ran client.js and
    // the in-memory default re-checked Full. Post-fix, both the
    // persisted state AND the scaffold-written seed say lightweight.
    const restored = gsHtml.restoreGsState({ tier: "lightweight" }, "lightweight");
    assert.strictEqual(restored.tier, "lightweight");
    // And the re-rendered form actually checks the Lightweight radio.
    const html = gsHtml.renderGettingStarted(gs(), restored);
    assert.ok(/value="lightweight" checked/.test(html));
    assert.ok(!/value="full" checked/.test(html));
  });
});

// ---------------------------------------------------------------------
// Set 077 Session 3 — the three-way setup choice's Lightweight-only
// verification-mode block, the A10 missing-Python warning, and the
// verification-mode seed semantics in restoreGsState. Cases generated
// via routed test-generation (gemini-pro) and adapted to the suite's
// helpers.
// ---------------------------------------------------------------------

suite("gettingStartedHtml — verification-mode block (Set 077 S3)", () => {
  test("returns empty string for the Full tier (block omitted, not hidden)", () => {
    assert.strictEqual(gsHtml.verificationModeBlockHtml(FULL), "");
    const html = gsHtml.renderGettingStarted(gs(), FULL);
    assert.ok(!html.includes("data-gs-verification-mode"));
  });

  test("renders both radios on Lightweight with the default checked", () => {
    const html = gsHtml.verificationModeBlockHtml(LIGHT);
    assert.ok(html.includes("data-gs-verification-mode"));
    assert.ok(html.includes(gsHtml.VERIFICATION_MODE_LABEL_TEXT));
    assert.ok(/value="out-of-band-or-none" checked/.test(html));
    assert.ok(html.includes('value="dedicated-sessions"'));
    assert.ok(!/value="dedicated-sessions" checked/.test(html));
  });

  test("checks dedicated-sessions when the controls say so", () => {
    const html = gsHtml.verificationModeBlockHtml({
      ...LIGHT,
      verificationMode: "dedicated-sessions",
    });
    assert.ok(/value="dedicated-sessions" checked/.test(html));
    assert.ok(!/value="out-of-band-or-none" checked/.test(html));
  });

  test("budget block and verification block are mutually exclusive by tier", () => {
    const light = gsHtml.renderGettingStarted(gs(), LIGHT);
    assert.ok(light.includes("data-gs-verification-mode"));
    assert.ok(!light.includes("data-gs-budget"));
    const full = gsHtml.renderGettingStarted(gs(), FULL);
    assert.ok(full.includes("data-gs-budget"));
    assert.ok(!full.includes("data-gs-verification-mode"));
  });
});

suite("gettingStartedHtml — A10 missing-Python warning (Set 077 S3)", () => {
  test("pythonWarningHtml renders role=alert and flips hidden on visible", () => {
    const visible = gsHtml.pythonWarningHtml(true);
    assert.ok(visible.includes('data-gs-warning="python"'));
    assert.ok(visible.includes('role="alert"'));
    assert.ok(!/\shidden[\s>]/.test(visible));
    const hidden = gsHtml.pythonWarningHtml(false);
    assert.ok(/\shidden>/.test(hidden));
    assert.ok(hidden.includes("python.org"));
  });

  test("warning VISIBLE when pythonPresent is false — on BOTH tiers", () => {
    for (const controls of [FULL, LIGHT]) {
      const html = gsHtml.renderGettingStarted(
        gs({ pythonPresent: false }),
        controls,
      );
      assert.strictEqual(
        isVisible(html, 'data-gs-warning="python"'),
        true,
        `warning not visible on ${controls.tier}`,
      );
    }
  });

  test("warning hidden when pythonPresent is true", () => {
    const html = gsHtml.renderGettingStarted(gs({ pythonPresent: true }), FULL);
    assert.strictEqual(isVisible(html, 'data-gs-warning="python"'), false);
  });

  test("warning hidden when pythonPresent is ABSENT (older host fails quiet)", () => {
    const html = gsHtml.renderGettingStarted(gs(), FULL);
    assert.strictEqual(isVisible(html, 'data-gs-warning="python"'), false);
  });

  test("warning leads step 1 (renders before the tier radios)", () => {
    const html = gsHtml.renderGettingStarted(gs({ pythonPresent: false }), FULL);
    const warnIdx = html.indexOf('data-gs-warning="python"');
    const radioIdx = html.indexOf('name="gs-tier"');
    assert.ok(warnIdx !== -1 && warnIdx < radioIdx, "warning does not lead step 1");
  });
});

suite("gettingStartedHtml — restoreGsState verification-mode seed (Set 077 S3)", () => {
  test("unknown persisted verificationMode narrows to the default", () => {
    const state = gsHtml.restoreGsState({ verificationMode: "invalid-mode" }, null);
    assert.strictEqual(state.verificationMode, "out-of-band-or-none");
    assert.strictEqual(state.modeDirty, false);
    assert.strictEqual(state.lastModeSeed, null);
  });

  test("a valid mode seed overrides an UNTOUCHED persisted mode", () => {
    const state = gsHtml.restoreGsState(
      { verificationMode: "out-of-band-or-none", modeDirty: false },
      null,
      null,
      "dedicated-sessions",
    );
    assert.strictEqual(state.verificationMode, "dedicated-sessions");
    assert.strictEqual(state.modeDirty, false);
    assert.strictEqual(state.lastModeSeed, "dedicated-sessions");
  });

  test("a post-seed explicit flip survives the SAME seed (modeDirty)", () => {
    const state = gsHtml.restoreGsState(
      {
        verificationMode: "dedicated-sessions",
        modeDirty: true,
        lastModeSeed: "out-of-band-or-none",
      },
      null,
      null,
      "out-of-band-or-none",
    );
    assert.strictEqual(state.verificationMode, "dedicated-sessions");
    assert.strictEqual(state.modeDirty, true);
    assert.strictEqual(state.lastModeSeed, "out-of-band-or-none");
  });

  test("a CHANGED seed re-applies over a dirty flip and clears the flag", () => {
    const state = gsHtml.restoreGsState(
      {
        verificationMode: "out-of-band-or-none",
        modeDirty: true,
        lastModeSeed: "dedicated-sessions",
      },
      null,
      null,
      "out-of-band-or-none",
    );
    assert.strictEqual(state.verificationMode, "out-of-band-or-none");
    assert.strictEqual(state.modeDirty, false);
    assert.strictEqual(state.lastModeSeed, "out-of-band-or-none");
  });

  test("modeDirty clears whenever the mode equals the seed", () => {
    const state = gsHtml.restoreGsState(
      { verificationMode: "dedicated-sessions", modeDirty: true },
      null,
      null,
      "dedicated-sessions",
    );
    assert.strictEqual(state.verificationMode, "dedicated-sessions");
    assert.strictEqual(state.modeDirty, false);
    assert.strictEqual(state.lastModeSeed, "dedicated-sessions");
  });

  test("cross-root discard resets the mode fields too (S077-S2-V1-001 parity)", () => {
    const state = gsHtml.restoreGsState(
      {
        rootId: "/repo-a",
        verificationMode: "dedicated-sessions",
        modeDirty: true,
        lastModeSeed: "out-of-band-or-none",
      },
      null,
      "/repo-b",
      null,
    );
    assert.strictEqual(state.verificationMode, "out-of-band-or-none");
    assert.strictEqual(state.modeDirty, false);
    assert.strictEqual(state.lastModeSeed, null);
  });

  test("an absent or junk mode seed leaves the persisted mode untouched", () => {
    for (const seed of [null, undefined, "junk"]) {
      const state = gsHtml.restoreGsState(
        { verificationMode: "dedicated-sessions" },
        null,
        null,
        seed,
      );
      assert.strictEqual(state.verificationMode, "dedicated-sessions");
    }
  });

  test("regression: the tier seed still applies alongside the mode seed", () => {
    const state = gsHtml.restoreGsState(
      { tier: "full", tierDirty: false },
      "lightweight",
      null,
      "dedicated-sessions",
    );
    assert.strictEqual(state.tier, "lightweight");
    assert.strictEqual(state.verificationMode, "dedicated-sessions");
  });
});
