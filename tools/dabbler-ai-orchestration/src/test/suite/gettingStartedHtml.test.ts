// Set 060 Session 3 — unit tests for the pure Getting Started HTML
// builders (media/session-sets-tree/gettingStartedHtml.js, the UMD-lite
// module the webview loads before client.js).
//
// Set 094: the form shrank to TWO sections — (1) Build project structure
// (tier radio + seat-profile / budget / verification-mode sub-choices +
// the no-prompt scaffold) and (2) Define modules (optional) — the "Open
// modules.yaml" button + SAVE copy. The old plan / session-set steps, the
// New-module button, and the parallel-worktree checkbox/note left the form
// (Set 093's per-module row actions + the palette own them now).
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
  budget?: string;
  zeroMethod?: string | null;
  // Set 077 S3: the Lightweight verification-mode pick.
  verificationMode?: string | null;
  // Set 079 S1: the Full-tier seat-profile pick.
  transportProfile?: string | null;
}

const gsHtml = requireFromPackageRoot(
  "./media/session-sets-tree/gettingStartedHtml.js",
) as {
  renderNoFolder(): string;
  renderGettingStarted(
    gs: { mode: string; structureBuilt: boolean },
    controls: GsControls,
  ): string;
  budgetBlockHtml(controls: GsControls): string;
  parseBudgetInput(raw: unknown):
    | { ok: true; value: number }
    | { ok: false; error: string };
  validateBudgetControls(controls: GsControls):
    | { ok: true; budgetUsd: number; zeroMethod: string | null }
    | { ok: false; error: string };
  // Set 094: the Define-modules section copy.
  DEFINE_MODULES_INTRO_TEXT: string;
  DEFINE_MODULES_SAVE_TEXT: string;
  OPEN_MODULES_BUTTON_LABEL: string;
  BUDGET_LABEL_TEXT: string;
  BUDGET_HELP_TEXT: string;
  BUDGET_ZERO_CHOICE_TEXT: string;
  // Set 077 S3: the Lightweight-only verification-mode block.
  verificationModeBlockHtml(controls: GsControls): string;
  VERIFICATION_MODE_LABEL_TEXT: string;
  VERIFICATION_MODE_OUT_OF_BAND_TEXT: string;
  VERIFICATION_MODE_DEDICATED_TEXT: string;
  // Set 079 S1: the Full-only seat-profile block (Set 092 S2: the
  // missing-CLI warning moved to the System Status strip).
  transportProfileBlockHtml(controls: GsControls): string;
  // Set 080 S1: the shared sub-choice option row (radio | name | desc).
  optionRowHtml(
    groupName: string,
    value: string,
    checked: boolean,
    text: string,
  ): string;
  TRANSPORT_PROFILE_LABEL_TEXT: string;
  TRANSPORT_PROFILE_API_TEXT: string;
  TRANSPORT_PROFILE_COPILOT_TEXT: string;
  // Set 077 S2 (A1/A11): pure teardown-restore narrowing for gsState.
  // S3 adds the 4th param (the verification-mode marker seed) and the
  // mode fields, mirroring the tier contract.
  restoreGsState(
    persisted?: unknown,
    tierSeed?: unknown,
    rootId?: unknown,
    modeSeed?: unknown,
    profileSeed?: unknown,
  ): {
    tier: "full" | "lightweight";
    budget: string;
    zeroMethod: string | null;
    tierDirty: boolean;
    lastSeed: "full" | "lightweight" | null;
    verificationMode: "dedicated-sessions" | "out-of-band-or-none";
    modeDirty: boolean;
    lastModeSeed: "dedicated-sessions" | "out-of-band-or-none" | null;
    transportProfile: "api" | "copilot-cli";
    profileDirty: boolean;
    lastProfileSeed: "api" | "copilot-cli" | null;
    rootId: string | null;
  };
};

// Set 094: the two-section form payload the render consumes is just
// `{ mode, structureBuilt }`. (The env probe fields moved to the System
// Status strip and left the payload.)
function gs(overrides: Partial<{ structureBuilt: boolean }> = {}) {
  return {
    mode: "getting-started",
    structureBuilt: false,
    ...overrides,
  };
}

const FULL = { tier: "full" as const };
const LIGHT = { tier: "lightweight" as const };

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

// Set 080 S1: the sub-choice groups render each option as a row —
// radio | bold name | description — splitting the copy CONSTANT at its
// first em-dash for presentation only. This asserts the exact same
// literal copy survives across the new structure: the name part inside
// gs-option-name, the description part inside gs-option-desc.
function assertOptionCopy(html: string, constant: string): void {
  const sep = " — ";
  const idx = constant.indexOf(sep);
  assert.notStrictEqual(idx, -1, `copy constant lost its em-dash: ${constant}`);
  const name = constant.slice(0, idx);
  const desc = constant.slice(idx + sep.length);
  assert.ok(
    html.includes(
      `<span class="gs-option-name">${name}</span>` +
        `<span class="gs-option-desc">${desc}</span>`,
    ),
    `option row does not carry the split copy verbatim: ${constant}`,
  );
}

suite("gettingStartedHtml — two-section form structure (Set 094)", () => {
  test("renders exactly two sections (Build project structure + Define modules)", () => {
    const html = gsHtml.renderGettingStarted(gs(), FULL);
    assert.strictEqual(
      (html.match(/gs-step-head/g) || []).length,
      2,
      "exactly two sections",
    );
    for (const action of ["build-structure", "open-modules"]) {
      assert.ok(
        html.includes(`data-gs-action="${action}"`),
        `missing action button ${action}`,
      );
    }
    // The plan / session-set actions + the parallel checkbox LEFT the form
    // (Set 093's per-module row actions + the palette own them now).
    for (const gone of [
      "import-plan",
      "copy-plan-prompt",
      "new-module",
      "build-session-sets",
    ]) {
      assert.ok(
        !html.includes(`data-gs-action="${gone}"`),
        `retired action ${gone} still rendered`,
      );
    }
    assert.ok(html.includes('name="gs-tier"'), "tier radio present");
    assert.ok(!html.includes('name="gs-parallel"'), "parallel checkbox removed");
  });

  test("the Define-modules section carries the open-modules button + SAVE copy", () => {
    const html = gsHtml.renderGettingStarted(gs(), FULL);
    assert.ok(html.includes("Define modules (optional)"), "section title");
    assert.ok(html.includes('data-gs-action="open-modules"'), "open-modules button");
    assert.ok(html.includes(gsHtml.OPEN_MODULES_BUTTON_LABEL));
    assert.ok(html.includes(gsHtml.DEFINE_MODULES_INTRO_TEXT), "intro copy");
    assert.ok(html.includes(gsHtml.DEFINE_MODULES_SAVE_TEXT), "save copy");
    // The save copy names the file AND instructs the human to SAVE (spec D1).
    assert.ok(gsHtml.DEFINE_MODULES_SAVE_TEXT.includes("docs/modules.yaml"));
    assert.ok(/SAVE/.test(gsHtml.DEFINE_MODULES_SAVE_TEXT));
    // Define modules follows Build in the flow.
    const buildIdx = html.indexOf('data-gs-action="build-structure"');
    const openIdx = html.indexOf('data-gs-action="open-modules"');
    assert.ok(buildIdx !== -1 && buildIdx < openIdx, "Define modules follows Build");
  });

  test("structureBuilt greys/checks the Build section; the optional section never completes", () => {
    const built = gsHtml.renderGettingStarted(gs({ structureBuilt: true }), FULL);
    assert.ok(built.includes("gs-step gs-step-complete"));
    assert.ok(built.includes("✓"));
    // Exactly one section is ever complete (the Build one) — the
    // Define-modules section is optional and carries no completion flag.
    assert.strictEqual(
      (built.match(/gs-step-complete/g) || []).length,
      1,
      "only the Build section can be complete",
    );
    const notBuilt = gsHtml.renderGettingStarted(gs({ structureBuilt: false }), FULL);
    assert.ok(!notBuilt.includes("gs-step-complete"));
  });

  test("tier control survives re-render (radio checked attr; no parallel checkbox)", () => {
    const html = gsHtml.renderGettingStarted(gs(), LIGHT);
    assert.ok(/value="lightweight" checked/.test(html));
    assert.ok(!html.includes('name="gs-parallel"'));
  });

  test("no-folder surface renders the open-folder CTA", () => {
    const html = gsHtml.renderNoFolder();
    assert.ok(html.includes('data-gs-action="open-folder"'));
  });

  test("the form renders no form-local environment warnings (relocated to System Status, Set 092 S2)", () => {
    for (const controls of [FULL, LIGHT]) {
      const html = gsHtml.renderGettingStarted(gs(), controls);
      assert.ok(!html.includes("data-gs-warning"), "no inline warning surface");
    }
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
    const step2Idx = html.indexOf("2. Define modules (optional)");
    assert.ok(
      tierIdx < budgetIdx && budgetIdx < buildIdx && buildIdx < step2Idx,
      "budget block must sit in section 1 between the tier radio and the Build button",
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
      budget: "0",
      zeroMethod: "skipped",
    });
    assert.ok(/name="gs-budget"[^>]*value="0"/.test(html));
    assert.ok(/value="skipped" checked/.test(html));
  });

  test("$0 input reveals the zero-rule radio pair with the locked copy", () => {
    const zero = gsHtml.renderGettingStarted(gs(), {
      tier: "full",
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
      budget: "25",
      zeroMethod: null,
    });
    assert.deepStrictEqual(r, { ok: true, budgetUsd: 25, zeroMethod: null });
  });

  test("validateBudgetControls: $0 blocks until a zero-rule is picked", () => {
    const blocked = gsHtml.validateBudgetControls({
      tier: "full",
      budget: "0",
      zeroMethod: null,
    });
    assert.strictEqual(blocked.ok, false);
    assert.ok(!blocked.ok && blocked.error === gsHtml.BUDGET_ZERO_CHOICE_TEXT);
    for (const method of ["manual-via-other-engine", "skipped"]) {
      const r = gsHtml.validateBudgetControls({
        tier: "full",
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
    budget: "",
    zeroMethod: null,
    tierDirty: false,
    lastSeed: null,
    // Set 077 S3: the verification-mode family joins the state shape.
    verificationMode: "out-of-band-or-none",
    modeDirty: false,
    lastModeSeed: null,
    // Set 079 S1: the seat-profile family joins the state shape.
    transportProfile: "api",
    profileDirty: false,
    lastProfileSeed: null,
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
      budget: "25",
      zeroMethod: "skipped",
      tierDirty: true,
      lastSeed: "full",
      // Set 077 S3: the verification-mode family round-trips too.
      verificationMode: "dedicated-sessions",
      modeDirty: true,
      lastModeSeed: "out-of-band-or-none",
      // Set 079 S1: the seat-profile family round-trips too.
      transportProfile: "copilot-cli",
      profileDirty: true,
      lastProfileSeed: "api",
      rootId: "/repo-a",
    };
    assert.deepStrictEqual(gsHtml.restoreGsState(persisted, null), persisted);
  });

  test("malformed fields fall back individually, valid siblings survive", () => {
    assert.deepStrictEqual(
      gsHtml.restoreGsState({ tier: "ful" }, null),
      defaults,
    );
    assert.deepStrictEqual(
      gsHtml.restoreGsState({ tier: "lightweight", zeroMethod: "nope" }, null),
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
      { tier: "lightweight", budget: "25", rootId: "/repo-a" },
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
      { tier: "lightweight", budget: "25", rootId: "/repo-a" },
      null,
      "/repo-a",
    );
    assert.strictEqual(same.tier, "lightweight");
    assert.strictEqual(same.budget, "25");
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

  // Set 079 S4 (Feature 2): pin the simplified plain-language copy and
  // prove the block renders it. Both READMEs paraphrase these constants
  // (not verbatim copies — the default marker moves to a trailing
  // "— the default" there), so a literal grep for these strings will
  // NOT find the README echoes: any wording change here requires a
  // parallel prose update in both README.md and
  // tools/dabbler-ai-orchestration/README.md.
  // Set 080 S1: the block now splits each constant at its em-dash into
  // a name/description row (presentation only), so the render assertion
  // checks the same literal copy across the two spans instead of one
  // contiguous string.
  test("pins the simplified verification-mode copy (Set 079 S4)", () => {
    assert.strictEqual(
      gsHtml.VERIFICATION_MODE_OUT_OF_BAND_TEXT,
      "Manual review (default) — paste a review prompt into a second AI " +
        "assistant yourself and record what it says.",
    );
    assert.strictEqual(
      gsHtml.VERIFICATION_MODE_DEDICATED_TEXT,
      "Separate verification sessions — a dedicated session on a " +
        "different AI engine or provider reviews the work before the " +
        "set can close.",
    );
    const html = gsHtml.verificationModeBlockHtml(LIGHT);
    assertOptionCopy(html, gsHtml.VERIFICATION_MODE_OUT_OF_BAND_TEXT);
    assertOptionCopy(html, gsHtml.VERIFICATION_MODE_DEDICATED_TEXT);
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

// ---------------------------------------------------------------------
// Set 079 Session 1 — the Full-tier seat-profile sub-choice, its
// missing-CLI warning, the D6 key-warning suppression while Copilot is
// selected, and the seat-profile seed semantics in restoreGsState.
// Cases generated via routed test-generation (gemini-pro) and adapted.
// ---------------------------------------------------------------------

suite("gettingStartedHtml — transport-profile block (Set 079 S1)", () => {
  test("returns empty string for the Lightweight tier (block omitted, not hidden)", () => {
    assert.strictEqual(gsHtml.transportProfileBlockHtml(LIGHT), "");
    const html = gsHtml.renderGettingStarted(gs(), LIGHT);
    assert.ok(!html.includes("data-gs-transport-profile"));
    assert.ok(!html.includes('name="gs-transport-profile"'));
  });

  test("renders on Full with 'api' checked by default and both copy texts", () => {
    const html = gsHtml.transportProfileBlockHtml(FULL);
    assert.ok(html.includes("data-gs-transport-profile"));
    assert.ok(html.includes(gsHtml.TRANSPORT_PROFILE_LABEL_TEXT));
    // Set 080 S1: the copy renders split across the name/description
    // row spans — same literal strings, new structure.
    assertOptionCopy(html, gsHtml.TRANSPORT_PROFILE_API_TEXT);
    assertOptionCopy(html, gsHtml.TRANSPORT_PROFILE_COPILOT_TEXT);
    assert.ok(/value="api" checked/.test(html));
    assert.ok(!/value="copilot-cli" checked/.test(html));
  });

  test("checks 'copilot-cli' when the controls say so", () => {
    const html = gsHtml.transportProfileBlockHtml({
      ...FULL,
      transportProfile: "copilot-cli",
    });
    assert.ok(/value="copilot-cli" checked/.test(html));
    assert.ok(!/value="api" checked/.test(html));
  });

  test("sits in step 1 between the tier radios and the budget block", () => {
    const html = gsHtml.renderGettingStarted(gs(), FULL);
    const tierIdx = html.indexOf('name="gs-tier"');
    const profileIdx = html.indexOf("data-gs-transport-profile");
    const budgetIdx = html.indexOf("data-gs-budget");
    assert.ok(
      tierIdx !== -1 && tierIdx < profileIdx && profileIdx < budgetIdx,
      "transport block not between the tier radios and the budget block",
    );
  });
});

suite("gettingStartedHtml — restoreGsState seat-profile seed (Set 079 S1)", () => {
  test("unknown persisted transportProfile narrows to the 'api' default", () => {
    const state = gsHtml.restoreGsState({ transportProfile: "invalid" }, null);
    assert.strictEqual(state.transportProfile, "api");
    assert.strictEqual(state.profileDirty, false);
    assert.strictEqual(state.lastProfileSeed, null);
  });

  test("a valid profile seed overrides an UNTOUCHED persisted profile", () => {
    const state = gsHtml.restoreGsState(
      { transportProfile: "api", profileDirty: false },
      null,
      null,
      null,
      "copilot-cli",
    );
    assert.strictEqual(state.transportProfile, "copilot-cli");
    assert.strictEqual(state.profileDirty, false);
    assert.strictEqual(state.lastProfileSeed, "copilot-cli");
  });

  test("a post-seed explicit flip survives the SAME seed (profileDirty)", () => {
    const state = gsHtml.restoreGsState(
      {
        transportProfile: "copilot-cli",
        profileDirty: true,
        lastProfileSeed: "api",
      },
      null,
      null,
      null,
      "api",
    );
    assert.strictEqual(state.transportProfile, "copilot-cli");
    assert.strictEqual(state.profileDirty, true);
    assert.strictEqual(state.lastProfileSeed, "api");
  });

  test("a CHANGED seed re-applies over a dirty flip and clears the flag", () => {
    const state = gsHtml.restoreGsState(
      {
        transportProfile: "api",
        profileDirty: true,
        lastProfileSeed: "copilot-cli",
      },
      null,
      null,
      null,
      "api",
    );
    assert.strictEqual(state.transportProfile, "api");
    assert.strictEqual(state.profileDirty, false);
    assert.strictEqual(state.lastProfileSeed, "api");
  });

  test("profileDirty clears whenever the profile equals the seed", () => {
    const state = gsHtml.restoreGsState(
      { transportProfile: "copilot-cli", profileDirty: true },
      null,
      null,
      null,
      "copilot-cli",
    );
    assert.strictEqual(state.transportProfile, "copilot-cli");
    assert.strictEqual(state.profileDirty, false);
    assert.strictEqual(state.lastProfileSeed, "copilot-cli");
  });

  test("cross-root discard resets the profile fields too (S077-S2-V1-001 parity)", () => {
    const state = gsHtml.restoreGsState(
      {
        rootId: "/repo-a",
        transportProfile: "copilot-cli",
        profileDirty: true,
        lastProfileSeed: "api",
      },
      null,
      "/repo-b",
      null,
      null,
    );
    assert.strictEqual(state.transportProfile, "api");
    assert.strictEqual(state.profileDirty, false);
    assert.strictEqual(state.lastProfileSeed, null);
  });

  test("an absent or junk profile seed leaves the persisted profile untouched", () => {
    for (const seed of [null, undefined, "junk"]) {
      const state = gsHtml.restoreGsState(
        { transportProfile: "copilot-cli" },
        null,
        null,
        null,
        seed,
      );
      assert.strictEqual(state.transportProfile, "copilot-cli", String(seed));
    }
  });

  test("regression: tier + mode seeds still apply alongside the profile seed", () => {
    const state = gsHtml.restoreGsState(
      {},
      "lightweight",
      null,
      "dedicated-sessions",
      "copilot-cli",
    );
    assert.strictEqual(state.tier, "lightweight");
    assert.strictEqual(state.verificationMode, "dedicated-sessions");
    assert.strictEqual(state.transportProfile, "copilot-cli");
  });
});

// ---------------------------------------------------------------------
// Set 080 Session 1 — the row-structured option layout both sub-choice
// groups share: each option is a gs-option-row label carrying the radio,
// the bold short name (copy before the em-dash), and the description
// (copy after it). Radio names/values and the block data attributes are
// unchanged — this is presentation only; the persistence and placement
// suites above run against the same markup untouched.
// ---------------------------------------------------------------------

suite("gettingStartedHtml — sub-choice option rows (Set 080 S1)", () => {
  test("optionRowHtml splits its copy at the first em-dash into name/desc spans", () => {
    const html = gsHtml.optionRowHtml(
      "gs-demo",
      "a",
      true,
      "Short name (default) — longer description text.",
    );
    assert.ok(html.startsWith('<label class="gs-option-row">'));
    assert.ok(
      html.includes('<input type="radio" name="gs-demo" value="a" checked>'),
    );
    assert.ok(
      html.includes('<span class="gs-option-name">Short name (default)</span>'),
    );
    assert.ok(
      html.includes(
        '<span class="gs-option-desc">longer description text.</span>',
      ),
    );
  });

  test("optionRowHtml: unchecked omits the checked attr; no em-dash renders whole name", () => {
    const html = gsHtml.optionRowHtml("gs-demo", "b", false, "No dash here");
    assert.ok(html.includes('<input type="radio" name="gs-demo" value="b">'));
    assert.ok(!/ checked/.test(html));
    assert.ok(html.includes('<span class="gs-option-name">No dash here</span>'));
    assert.ok(html.includes('<span class="gs-option-desc"></span>'));
  });

  test("optionRowHtml escapes copy and attribute values", () => {
    const html = gsHtml.optionRowHtml(
      'g"n',
      'v"1',
      false,
      "a <b> & c — d <i>",
    );
    assert.ok(html.includes('name="g&quot;n"'));
    assert.ok(html.includes('value="v&quot;1"'));
    assert.ok(html.includes("a &lt;b&gt; &amp; c"));
    assert.ok(html.includes("d &lt;i&gt;"));
  });

  test("both groups render exactly two option rows in the same pattern", () => {
    const countRows = (html: string) =>
      (html.match(/class="gs-option-row"/g) || []).length;
    assert.strictEqual(
      countRows(gsHtml.transportProfileBlockHtml(FULL)),
      2,
    );
    assert.strictEqual(countRows(gsHtml.verificationModeBlockHtml(LIGHT)), 2);
  });

  test("the radio sits inside its row label so the whole row stays clickable", () => {
    for (const [html, name] of [
      [gsHtml.transportProfileBlockHtml(FULL), "gs-transport-profile"],
      [gsHtml.verificationModeBlockHtml(LIGHT), "gs-verification-mode"],
    ] as const) {
      const rowIdx = html.indexOf('class="gs-option-row"');
      const inputIdx = html.indexOf(`<input type="radio" name="${name}"`);
      const labelClose = html.indexOf("</label>");
      assert.ok(
        rowIdx !== -1 && rowIdx < inputIdx && inputIdx < labelClose,
        `${name}: radio not inside the first gs-option-row label`,
      );
    }
  });

  test("full form render carries the row structure for the active tier's group", () => {
    const full = gsHtml.renderGettingStarted(gs(), FULL);
    assertOptionCopy(full, gsHtml.TRANSPORT_PROFILE_API_TEXT);
    assertOptionCopy(full, gsHtml.TRANSPORT_PROFILE_COPILOT_TEXT);
    const light = gsHtml.renderGettingStarted(gs(), LIGHT);
    assertOptionCopy(light, gsHtml.VERIFICATION_MODE_OUT_OF_BAND_TEXT);
    assertOptionCopy(light, gsHtml.VERIFICATION_MODE_DEDICATED_TEXT);
  });
});

// ---------- Set 081 S1: budget block scoped to the Direct-API ----------
// sub-choice. The budget governs metered provider-API verification
// spend, which the Copilot seat profile excludes by design — so the
// block nests as an indented child of the "Direct provider API keys"
// option row and is present ONLY while Full + api are selected. Like
// the tier gate (Set 063 R1 Minor) the block is OMITTED, not hidden:
// sub-choice flips re-render the form surface and gsState preserves
// the typed value, so hiding never clears it.

suite("gettingStartedHtml — budget block scoped to Direct-API (Set 081 S1)", () => {
  const FULL_API = {
    tier: "full" as const,
    transportProfile: "api",
  };
  const FULL_COPILOT = {
    tier: "full" as const,
    transportProfile: "copilot-cli",
  };

  test("Full+api: budget block nests inside the transport block, under the Direct-API row", () => {
    const html = gsHtml.renderGettingStarted(gs(), FULL_API);
    const blockIdx = html.indexOf("data-gs-transport-profile");
    const apiRowIdx = html.indexOf('value="api"');
    const childIdx = html.indexOf("data-gs-option-child");
    const budgetIdx = html.indexOf("data-gs-budget");
    const copilotRowIdx = html.indexOf('value="copilot-cli"');
    assert.ok(blockIdx !== -1 && apiRowIdx !== -1, "transport block + api row render");
    assert.ok(childIdx !== -1, "the indented child wrapper renders");
    assert.ok(budgetIdx !== -1, "the budget block renders");
    assert.ok(
      blockIdx < apiRowIdx && apiRowIdx < childIdx && childIdx < budgetIdx &&
        budgetIdx < copilotRowIdx,
      "budget must sit between the Direct-API row and the Copilot row, " +
        "inside the child wrapper",
    );
    // The full budget block rides along: input, help, zero pair,
    // validation element (all inside the transport block now).
    assert.ok(html.includes('name="gs-budget"'));
    assert.ok(html.includes(gsHtml.BUDGET_LABEL_TEXT));
    assert.ok(html.includes("data-gs-budget-error"));
  });

  test("Full+copilot: budget block absent entirely (omitted, not hidden)", () => {
    const html = gsHtml.renderGettingStarted(gs(), FULL_COPILOT);
    assert.ok(!html.includes("data-gs-budget"), "budget block must be absent");
    assert.ok(!html.includes('name="gs-budget"'), "budget input must be absent");
    assert.ok(!html.includes('name="gs-zero-method"'), "zero-rule pair must be absent");
    assert.ok(
      !html.includes("gs-option-child"),
      "no empty child wrapper — the option rows stay adjacent so the " +
        "row-separator CSS applies directly",
    );
  });

  test("Lightweight: absent regardless of the sub-choice value", () => {
    const html = gsHtml.renderGettingStarted(gs(), {
      tier: "lightweight",
      transportProfile: "api",
    });
    assert.ok(!html.includes("data-gs-budget"));
    assert.strictEqual(
      gsHtml.budgetBlockHtml({
        tier: "lightweight",
        transportProfile: "api",
      }),
      "",
    );
  });

  test("legacy callers without a transportProfile field still render the block", () => {
    // The gate keys on the explicit "copilot-cli" value; restoreGsState
    // guarantees the live form always carries "api" | "copilot-cli", so
    // this render-open posture only affects direct/legacy callers.
    assert.ok(gsHtml.budgetBlockHtml(FULL).includes("data-gs-budget"));
  });

  test("persistence: typed value survives an api → copilot → api flip", () => {
    const controls = {
      tier: "full" as const,
      budget: "42.5",
      zeroMethod: null,
      transportProfile: "api",
    };
    const before = gsHtml.renderGettingStarted(gs(), controls);
    assert.ok(/name="gs-budget"[^>]*value="42\.5"/.test(before));
    controls.transportProfile = "copilot-cli";
    const hidden = gsHtml.renderGettingStarted(gs(), controls);
    assert.ok(!hidden.includes('name="gs-budget"'), "flipped away: block omitted");
    controls.transportProfile = "api";
    const after = gsHtml.renderGettingStarted(gs(), controls);
    assert.ok(
      /name="gs-budget"[^>]*value="42\.5"/.test(after),
      "flip back must restore the typed value — hiding never clears it",
    );
  });

  test("persistence: the $0 zero-rule pick survives the flip round-trip too", () => {
    const controls = {
      tier: "full" as const,
      budget: "0",
      zeroMethod: "skipped",
      transportProfile: "api",
    };
    controls.transportProfile = "copilot-cli";
    gsHtml.renderGettingStarted(gs(), controls);
    controls.transportProfile = "api";
    const after = gsHtml.renderGettingStarted(gs(), controls);
    assert.ok(/name="gs-budget"[^>]*value="0"/.test(after));
    assert.ok(/value="skipped" checked/.test(after));
  });
});
