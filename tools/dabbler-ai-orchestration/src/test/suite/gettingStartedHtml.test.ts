// Set 060 Session 3 — unit tests for the pure Getting Started HTML
// builders (media/session-sets-tree/gettingStartedHtml.js, the UMD-lite
// module the webview loads before client.js).
//
// Set 094: the form shrank to TWO sections — (1) Build project structure
// (seat-profile / budget sub-choices + the no-prompt scaffold) and (2) Define modules (optional) — the "Open
// modules.yaml" button + SAVE copy. The old plan / session-set steps, the
// New-module button, and the parallel-worktree checkbox/note left the form
// (Set 093's per-module row actions + the palette own them now).
//
// The module is plain JS by design (the webview loads it raw, outside
// the esbuild bundle), so the test requires it straight off disk.

import * as assert from "assert";
import * as path from "path";
import { createRequire } from "module";

// Mocha 10 is import-first; use `createRequire` so this stays compatible
// with both the ts-node unit runner and the compiled Extension Host runner.
// Resolve from this test file rather than process.cwd(), which the Extension
// Development Host changes before loading the suite.
const requireFromPackageRoot = createRequire(
  path.join(
    process.env.DABBLER_EXTENSION_ROOT ?? process.cwd(),
    "package.json",
  ),
);
// Set 063 S2: budget controls ride the webview control state. Optional
// here because most pre-063 assertions don't exercise them; the module
// treats absent budget fields as empty input / no zero-rule pick.
interface GsControls {
  budget?: string;
  zeroMethod?: string | null;
  // Set 079 S1: the seat-profile pick.
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
  COPY_DECOMPOSITION_BUTTON_LABEL: string;
  BUDGET_LABEL_TEXT: string;
  BUDGET_HELP_TEXT: string;
  BUDGET_ZERO_CHOICE_TEXT: string;
  // Set 079 S1: the seat-profile block (Set 092 S2: the
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
  // Pure teardown-restore narrowing for gsState.
  restoreGsState(
    persisted?: unknown,
    rootId?: unknown,
    profileSeed?: unknown,
  ): {
    budget: string;
    zeroMethod: string | null;
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

const API = { transportProfile: "api" as const };
const COPILOT = { transportProfile: "copilot-cli" as const };

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
    const html = gsHtml.renderGettingStarted(gs(), API);
    assert.strictEqual(
      (html.match(/gs-step-head/g) || []).length,
      2,
      "exactly two sections",
    );
    for (const action of [
      "build-structure",
      "open-modules",
      "copy-decomposition-prompt",
    ]) {
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
    assert.ok(!html.includes('name="gs-tier"'), "tier radio removed");
    assert.ok(!html.includes('name="gs-parallel"'), "parallel checkbox removed");
  });

  test("the Define-modules section carries the open-modules + copy-decomposition buttons + SAVE copy", () => {
    const html = gsHtml.renderGettingStarted(gs(), API);
    assert.ok(html.includes("Define modules (optional)"), "section title");
    assert.ok(html.includes('data-gs-action="open-modules"'), "open-modules button");
    assert.ok(html.includes(gsHtml.OPEN_MODULES_BUTTON_LABEL));
    // Set 094 S2 (spec D6): the decomposition-prompt button + its label.
    assert.ok(
      html.includes('data-gs-action="copy-decomposition-prompt"'),
      "copy-decomposition-prompt button",
    );
    assert.ok(html.includes(gsHtml.COPY_DECOMPOSITION_BUTTON_LABEL));
    assert.ok(html.includes(gsHtml.DEFINE_MODULES_INTRO_TEXT), "intro copy");
    assert.ok(html.includes(gsHtml.DEFINE_MODULES_SAVE_TEXT), "save copy");
    // The save copy names the file AND instructs the human to SAVE (spec D1),
    // and references the decomposition-prompt button (spec D6).
    assert.ok(gsHtml.DEFINE_MODULES_SAVE_TEXT.includes("docs/modules.yaml"));
    assert.ok(/SAVE/.test(gsHtml.DEFINE_MODULES_SAVE_TEXT));
    assert.ok(
      gsHtml.DEFINE_MODULES_SAVE_TEXT.includes(gsHtml.COPY_DECOMPOSITION_BUTTON_LABEL),
      "the SAVE copy references the decomposition-prompt button (D6)",
    );
    // Define modules follows Build in the flow.
    const buildIdx = html.indexOf('data-gs-action="build-structure"');
    const openIdx = html.indexOf('data-gs-action="open-modules"');
    assert.ok(buildIdx !== -1 && buildIdx < openIdx, "Define modules follows Build");
  });

  test("structureBuilt greys/checks the Build section; the optional section never completes", () => {
    const built = gsHtml.renderGettingStarted(gs({ structureBuilt: true }), API);
    assert.ok(built.includes("gs-step gs-step-complete"));
    assert.ok(built.includes("✓"));
    // Exactly one section is ever complete (the Build one) — the
    // Define-modules section is optional and carries no completion flag.
    assert.strictEqual(
      (built.match(/gs-step-complete/g) || []).length,
      1,
      "only the Build section can be complete",
    );
    const notBuilt = gsHtml.renderGettingStarted(gs({ structureBuilt: false }), API);
    assert.ok(!notBuilt.includes("gs-step-complete"));
  });

  test("no-folder surface renders the open-folder CTA", () => {
    const html = gsHtml.renderNoFolder();
    assert.ok(html.includes('data-gs-action="open-folder"'));
  });

  test("the form renders no form-local environment warnings (relocated to System Status, Set 092 S2)", () => {
    for (const controls of [API, COPILOT]) {
      const html = gsHtml.renderGettingStarted(gs(), controls);
      assert.ok(!html.includes("data-gs-warning"), "no inline warning surface");
    }
  });
});

// ---------- Set 063 S2 (spec D1): the budget / NTE step ----------

suite("gettingStartedHtml — budget block rendering (Set 063 S2)", () => {
  test("api profile renders the budget input inside step 1, before the Build button", () => {
    const html = gsHtml.renderGettingStarted(gs(), API);
    assert.strictEqual(isVisible(html, "data-gs-budget"), true);
    assert.ok(html.includes('name="gs-budget"'));
    assert.ok(html.includes('placeholder="25"'));
    assert.ok(html.includes(gsHtml.BUDGET_LABEL_TEXT));
    const profileIdx = html.indexOf("data-gs-transport-profile");
    const budgetIdx = html.indexOf("data-gs-budget");
    const buildIdx = html.indexOf('data-gs-action="build-structure"');
    const step2Idx = html.indexOf("2. Define modules (optional)");
    assert.ok(
      profileIdx < budgetIdx && budgetIdx < buildIdx && buildIdx < step2Idx,
      "budget block must sit in section 1 between the profile control and the Build button",
    );
  });

  test("control state survives re-render (input value + zero-rule pick)", () => {
    const html = gsHtml.renderGettingStarted(gs(), {
      budget: "0",
      zeroMethod: "skipped",
    });
    assert.ok(/name="gs-budget"[^>]*value="0"/.test(html));
    assert.ok(/value="skipped" checked/.test(html));
  });

  test("$0 input reveals the zero-rule radio pair with the locked copy", () => {
    const zero = gsHtml.renderGettingStarted(gs(), {
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
        budget,
        zeroMethod: null,
      });
      assert.strictEqual(isVisible(html, "data-gs-zero-choice"), false, budget);
    }
  });

  test("the validation element renders hidden and empty initially", () => {
    const html = gsHtml.renderGettingStarted(gs(), API);
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
      budget: "25",
      zeroMethod: null,
    });
    assert.deepStrictEqual(r, { ok: true, budgetUsd: 25, zeroMethod: null });
  });

  test("validateBudgetControls: $0 blocks until a zero-rule is picked", () => {
    const blocked = gsHtml.validateBudgetControls({
      budget: "0",
      zeroMethod: null,
    });
    assert.strictEqual(blocked.ok, false);
    assert.ok(!blocked.ok && blocked.error === gsHtml.BUDGET_ZERO_CHOICE_TEXT);
    for (const method of ["manual-via-other-engine", "skipped"]) {
      const r = gsHtml.validateBudgetControls({
        budget: "0",
        zeroMethod: method,
      });
      assert.deepStrictEqual(r, { ok: true, budgetUsd: 0, zeroMethod: method }, method);
    }
  });

  test("validateBudgetControls: invalid input blocks with the parse message", () => {
    for (const budget of ["", "abc", "-3"]) {
      const r = gsHtml.validateBudgetControls({
        budget,
        zeroMethod: null,
      });
      assert.strictEqual(r.ok, false, budget);
    }
  });
});

// restoreGsState is the pure narrowing that turns whatever came back from
// vscode.setState()/getState() — possibly undefined, stale, or malformed —
// into a well-formed gsState.
suite("gettingStartedHtml.js — restoreGsState", () => {
  const defaults = {
    budget: "",
    zeroMethod: null,
    transportProfile: "api",
    profileDirty: false,
    lastProfileSeed: null,
    rootId: null,
  };

  test("returns defaults for absent or junk persisted input", () => {
    assert.deepStrictEqual(gsHtml.restoreGsState(undefined, null, null), defaults);
    assert.deepStrictEqual(gsHtml.restoreGsState(null, null, null), defaults);
    assert.deepStrictEqual(gsHtml.restoreGsState("foo", null, null), defaults);
    assert.deepStrictEqual(gsHtml.restoreGsState(42, null, null), defaults);
    assert.deepStrictEqual(gsHtml.restoreGsState({}, null, null), defaults);
  });

  test("round-trips a valid persisted state (simulated teardown/re-init)", () => {
    const persisted = {
      budget: "25",
      zeroMethod: "skipped",
      transportProfile: "copilot-cli",
      profileDirty: true,
      lastProfileSeed: "api",
      rootId: "/repo-a",
    };
    assert.deepStrictEqual(gsHtml.restoreGsState(persisted, "/repo-a", null), persisted);
  });

  test("malformed fields fall back individually, valid siblings survive", () => {
    assert.deepStrictEqual(
      gsHtml.restoreGsState({ transportProfile: "invalid", zeroMethod: "nope" }, null, null),
      defaults,
    );
    assert.deepStrictEqual(
      gsHtml.restoreGsState({ budget: 123, transportProfile: "copilot-cli" }, null, null),
      { ...defaults, transportProfile: "copilot-cli" },
    );
    assert.deepStrictEqual(
      gsHtml.restoreGsState({ zeroMethod: "unknown-method" }, null, null),
      defaults,
    );
  });

  test("persisted state from ANOTHER root is discarded before seeding (S077-S2-V1-001)", () => {
    const restored = gsHtml.restoreGsState(
      { budget: "25", transportProfile: "copilot-cli", rootId: "/repo-a" },
      "/repo-b",
      "api",
    );
    assert.deepStrictEqual(restored, {
      ...defaults,
      lastProfileSeed: "api",
      rootId: "/repo-b",
    });
    const same = gsHtml.restoreGsState(
      { budget: "25", transportProfile: "copilot-cli", rootId: "/repo-a" },
      "/repo-a",
      null,
    );
    assert.strictEqual(same.transportProfile, "copilot-cli");
    assert.strictEqual(same.budget, "25");
    assert.strictEqual(same.rootId, "/repo-a");
  });
});

// ---------------------------------------------------------------------
// Set 079 Session 1 — the seat-profile sub-choice, and the
// seat-profile seed semantics in restoreGsState. Cases generated via routed
// test-generation (gemini-pro) and adapted.
// ---------------------------------------------------------------------

suite("gettingStartedHtml — transport-profile block (Set 079 S1)", () => {
  test("renders with 'api' checked by default and both copy texts", () => {
    const html = gsHtml.transportProfileBlockHtml(API);
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
    const html = gsHtml.transportProfileBlockHtml(COPILOT);
    assert.ok(/value="copilot-cli" checked/.test(html));
    assert.ok(!/value="api" checked/.test(html));
  });

  test("sits in step 1 before the budget block", () => {
    const html = gsHtml.renderGettingStarted(gs(), API);
    const profileIdx = html.indexOf("data-gs-transport-profile");
    const budgetIdx = html.indexOf("data-gs-budget");
    assert.ok(
      profileIdx !== -1 && profileIdx < budgetIdx,
      "transport block not before the budget block",
    );
  });
});

suite("gettingStartedHtml — restoreGsState seat-profile seed (Set 079 S1)", () => {
  test("unknown persisted transportProfile narrows to the 'api' default", () => {
    const state = gsHtml.restoreGsState({ transportProfile: "invalid" }, null, null);
    assert.strictEqual(state.transportProfile, "api");
    assert.strictEqual(state.profileDirty, false);
    assert.strictEqual(state.lastProfileSeed, null);
  });

  test("a valid profile seed overrides an UNTOUCHED persisted profile", () => {
    const state = gsHtml.restoreGsState(
      { transportProfile: "api", profileDirty: false },
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
      "/repo-b",
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
        seed,
      );
      assert.strictEqual(state.transportProfile, "copilot-cli", String(seed));
    }
  });
});

// ---------------------------------------------------------------------
// Set 097 (spec D2) — the profile-only first-seed precedence carve-out.
// Defect chain: pre-build there is no router-config.yaml (profileSeed
// null), the operator picks Copilot (profileDirty=true), the build
// completes without a CONFIRMED seat (cancelled / CLI-missing /
// insufficient-providers / install-incomplete) so router-config.yaml
// seeds `transport.profile: api` — the FIRST-EVER non-null seed. Before
// this fix that first seed unconditionally overrode the dirty flip
// (treated as "a newer sanctioned choice"), silently reverting the radio
// to Full/Direct API with no visible explanation.
// ---------------------------------------------------------------------

suite("gettingStartedHtml — restoreGsState profile first-seed carve-out (Set 097 D2)", () => {
  test("a FIRST-EVER seed (null -> value) never overrides a profileDirty flip", () => {
    const state = gsHtml.restoreGsState(
      { transportProfile: "copilot-cli", profileDirty: true, lastProfileSeed: null },
      null,
      "api",
    );
    assert.strictEqual(state.transportProfile, "copilot-cli", "the operator's pick survives");
    assert.strictEqual(state.profileDirty, true, "the flip stays protected");
    assert.strictEqual(state.lastProfileSeed, "api", "the seed still records for future comparisons");
  });

  test("a FIRST-EVER seed that happens to MATCH the dirty pick clears dirty (truth caught up)", () => {
    // The confirmed-seat case: the seed becomes copilot-cli and the form
    // already agrees with the operator — dirty must still clear, this is
    // not an override, just staleness catching up.
    const state = gsHtml.restoreGsState(
      { transportProfile: "copilot-cli", profileDirty: true, lastProfileSeed: null },
      null,
      "copilot-cli",
    );
    assert.strictEqual(state.transportProfile, "copilot-cli");
    assert.strictEqual(state.profileDirty, false);
    assert.strictEqual(state.lastProfileSeed, "copilot-cli");
  });

  test("a SECOND (non-first) seed change still overrides a dirty flip, unchanged behavior", () => {
    // lastProfileSeed is already a KNOWN value ("api") — this is a genuine
    // changed seed, not a first-ever materialization, so today's
    // override-and-clear-dirty rule still applies.
    const state = gsHtml.restoreGsState(
      { transportProfile: "api", profileDirty: true, lastProfileSeed: "api" },
      null,
      "copilot-cli",
    );
    assert.strictEqual(state.transportProfile, "copilot-cli");
    assert.strictEqual(state.profileDirty, false);
    assert.strictEqual(state.lastProfileSeed, "copilot-cli");
  });

  test("a first-ever seed with NO dirty flip still applies normally (the common case)", () => {
    const state = gsHtml.restoreGsState(
      { transportProfile: "api", profileDirty: false, lastProfileSeed: null },
      null,
      "api",
    );
    assert.strictEqual(state.transportProfile, "api");
    assert.strictEqual(state.profileDirty, false);
    assert.strictEqual(state.lastProfileSeed, "api");
  });

  test("full defect-chain replay: null seed, dirty Copilot pick, unconfirmed build seeds api", () => {
    // Step 1: fresh form, no router-config.yaml yet.
    let state = gsHtml.restoreGsState(undefined, "/repo", null);
    assert.strictEqual(state.transportProfile, "api");
    assert.strictEqual(state.lastProfileSeed, null);
    // Step 2: operator selects the Copilot radio (client.js's change
    // listener sets these two fields directly on gsState).
    state.transportProfile = "copilot-cli";
    state.profileDirty = true;
    // Step 3: Build runs; seat setup does not confirm (any of cancelled /
    // CLI-missing / insufficient-providers / install-incomplete), so the
    // scaffold's seeded default lands: transport.profile: api. The next
    // snapshot's seed transitions null -> "api" for the first time.
    state = gsHtml.restoreGsState(state, "/repo", "api");
    assert.strictEqual(
      state.transportProfile,
      "copilot-cli",
      "the operator's Copilot pick must survive the unconfirmed build's re-render",
    );
    assert.strictEqual(state.profileDirty, true);
    // And the re-rendered form actually keeps the Copilot radio checked.
    const html = gsHtml.renderGettingStarted(gs(), state);
    assert.ok(/value="copilot-cli" checked/.test(html));
    assert.ok(!/value="api" checked/.test(html));
  });
});

// ---------------------------------------------------------------------
// Set 080 Session 1 — the row-structured option layout the sub-choice
// group uses: each option is a gs-option-row label carrying the radio,
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

  test("transport profile renders exactly two option rows", () => {
    const countRows = (html: string) =>
      (html.match(/class="gs-option-row"/g) || []).length;
    assert.strictEqual(
      countRows(gsHtml.transportProfileBlockHtml(API)),
      2,
    );
  });

  test("the radio sits inside its row label so the whole row stays clickable", () => {
    for (const [html, name] of [
      [gsHtml.transportProfileBlockHtml(API), "gs-transport-profile"],
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

  test("form render carries the row structure for the profile group", () => {
    const html = gsHtml.renderGettingStarted(gs(), API);
    assertOptionCopy(html, gsHtml.TRANSPORT_PROFILE_API_TEXT);
    assertOptionCopy(html, gsHtml.TRANSPORT_PROFILE_COPILOT_TEXT);
  });
});

// ---------- Set 081 S1: budget block scoped to the Direct-API ----------
// sub-choice. The budget governs metered provider-API verification
// spend, which the Copilot seat profile excludes by design — so the
// block nests as an indented child of the "Direct provider API keys"
// option row and is present ONLY while api is selected. The block is
// OMITTED, not hidden:
// sub-choice flips re-render the form surface and gsState preserves
// the typed value, so hiding never clears it.

suite("gettingStartedHtml — budget block scoped to Direct-API (Set 081 S1)", () => {
  const FULL_API = {
    transportProfile: "api",
  };
  const FULL_COPILOT = {
    transportProfile: "copilot-cli",
  };

  test("api: budget block nests inside the transport block, under the Direct-API row", () => {
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

  test("copilot-cli: budget block absent entirely (omitted, not hidden)", () => {
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

  test("legacy callers without a transportProfile field still render the block", () => {
    // The gate keys on the explicit "copilot-cli" value; restoreGsState
    // guarantees the live form always carries "api" | "copilot-cli", so
    // this render-open posture only affects direct/legacy callers.
    assert.ok(gsHtml.budgetBlockHtml(API).includes("data-gs-budget"));
  });

  test("persistence: typed value survives an api → copilot → api flip", () => {
    const controls = {
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
