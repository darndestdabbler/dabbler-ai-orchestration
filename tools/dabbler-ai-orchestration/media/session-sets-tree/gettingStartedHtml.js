// Pure HTML builders for the Set 060 Getting Started surfaces
// (no-folder CTA + the three-step setup form). Extracted from
// client.js in Session 3 so the rendering — including the D6
// provider-key warning and the D7 worktree note — is unit-testable
// from mocha without a webview (the Set 052 dashboardHtml.ts "pure
// builders" pattern, in plain JS because the webview loads this file
// raw, not through the esbuild bundle).
//
// UMD-lite: in the webview this attaches `DabblerGettingStartedHtml`
// to the global scope (client.js consumes it; CustomSessionSetsView
// loads it as a second nonce'd <script> BEFORE client.js); under Node
// (mocha) it exports via module.exports.
//
// Everything here is a pure string function of (gs payload, control
// state) — no DOM, no postMessage, no vscode API. client.js owns the
// wiring (event listeners + show/hide toggling on control changes).
(function (factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    // eslint-disable-next-line no-undef
    (typeof self !== "undefined" ? self : this).DabblerGettingStartedHtml = factory();
  }
})(function () {
  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // D6 (Set 060 S3): the Full-tier provider-key warning, rendered
  // under the Build button. Shown only when the tier radio is on
  // "full" AND the host reported no provider key in its environment;
  // tier-radio changes re-render the form surface locally (Set 063
  // S2), so visibility is computed here on every render — no host
  // round-trip. The copy carries the two load-bearing instructions:
  // set at least one key, then RELOAD THE WINDOW (the extension host
  // captures the merged Windows System + User environment at launch,
  // so a key set afterwards is invisible until reload).
  var ENV_WARNING_TEXT =
    "The Full tier routes work through provider APIs, but no provider " +
    "API key was found. Use your normal Anthropic, Google, or OpenAI " +
    "key value under at least one Dabbler environment variable: " +
    "DABBLER_ANTHROPIC_API_KEY, DABBLER_OPENAI_API_KEY, or " +
    "DABBLER_GEMINI_API_KEY. Then reload the VS Code window (keys set " +
    "after launch are not " +
    "visible until you reload). The Lightweight tier needs no keys.";

  // D7 (Set 060 S3, carries verifier issue S060-S2-V1-001): the
  // parallel-worktree info note under the checkbox. Shown only while
  // the box is checked; client.js toggles `hidden` on checkbox
  // changes.
  var WORKTREE_NOTE_TEXT =
    "Parallel session sets use git worktrees: each parallel set works " +
    "in its own worktree and is merged back to the main branch when " +
    "the sets complete.";

  // Set 063 S2 (spec D1): the Full-tier budget / NTE step inside the
  // Build-project-structure step. The label/help copy frames the value
  // as the project's verification spending cap; the $0 copy is the
  // consult-resolved wording (no silent default — the operator picks
  // the zero-budget verification rule explicitly).
  var BUDGET_LABEL_TEXT = "Verification budget (USD, not-to-exceed)";
  var BUDGET_HELP_TEXT =
    "Spending cap for cross-provider verification, written to " +
    "ai_router/budget.yaml. Enter 0 to opt out of paid verification.";
  var BUDGET_ZERO_CHOICE_TEXT =
    "A $0 budget still needs a verification rule. Choose whether to " +
    "check each session in another engine or skip verification.";

  // Set 077 S3 (Feature 2): the Lightweight-only verification-mode step
  // inside step 1 — the mirror image of the Full-only budget block. The
  // two radios map onto the existing spec-level `verificationMode` field
  // (no new schema): the default keeps the copyable-review-prompt flow;
  // dedicated sessions opt in to typed verification sessions on a
  // different engine or provider. Together with the tier radios this is
  // the operator's three-way setup choice (Full / Lightweight+dedicated /
  // Lightweight+out-of-band).
  var VERIFICATION_MODE_LABEL_TEXT = "Verification (per session set)";
  // Set 079 S4 (Feature 2): plain-language rewrite of both descriptions
  // (same meaning, same radio values — only the human-facing copy).
  var VERIFICATION_MODE_OUT_OF_BAND_TEXT =
    "Manual review (default) — paste a review prompt into a second AI " +
    "assistant yourself and record what it says.";
  var VERIFICATION_MODE_DEDICATED_TEXT =
    "Separate verification sessions — a dedicated session on a different " +
    "AI engine or provider reviews the work before the set can close.";

  // Set 077 S3 (A10): the missing-Python warning at the top of step 1.
  // BOTH tiers need a base interpreter (Lightweight is router-off, not
  // Python-off), so unlike the D6 key warning this one does not key on
  // the tier radio — only on the host's `pythonPresent` probe. The copy
  // carries the same three remedies as the Getting Started doc's
  // Troubleshooting appendix and ends with the reload instruction (the
  // host environment is captured at launch, so a PATH change after an
  // install is invisible until reload).
  var PYTHON_WARNING_TEXT =
    "Python was not found on this machine. Build project structure " +
    "creates a virtual environment, which still needs a base Python " +
    "install. Install Python from python.org (tick \"Add python.exe to " +
    "PATH\"; avoid the Microsoft Store build), or set the " +
    "dabblerSessionSets.pythonPath setting to an installed interpreter. " +
    "Then reload the VS Code window (changes made after launch are not " +
    "visible until you reload).";

  // Set 079 S1 (Feature 1): the Full-tier seat-profile sub-choice — how
  // Full's routed calls dispatch. "api" keeps the current direct
  // provider-key path (the unchanged default); "copilot-cli" is Set
  // 078's GitHub Copilot seat profile (transport.profile: copilot-cli),
  // which needs no DABBLER_* keys. Mirrors the Lightweight
  // verification-mode sub-choice in UI shape only — the Build wiring
  // (Sessions 2-3) is materially different.
  var TRANSPORT_PROFILE_LABEL_TEXT = "Provider access (how routed calls run)";
  var TRANSPORT_PROFILE_API_TEXT =
    "Direct provider API keys — calls use your DABBLER_* provider API " +
    "keys (the default).";
  var TRANSPORT_PROFILE_COPILOT_TEXT =
    "GitHub Copilot CLI seat — calls run through your Copilot " +
    "subscription's command-line tool; no provider API keys needed.";

  // Set 079 S1: the missing-Copilot-CLI warning inside the seat-profile
  // block. Unlike the tier-independent Python warning it keys on the
  // sub-choice: visible only while the Copilot option is selected AND
  // the host's probe found no copilot executable. Same remedy shape as
  // the Python warning (install, or point the setting at an executable,
  // then reload — the host environment is captured at launch).
  var COPILOT_WARNING_TEXT =
    "The GitHub Copilot CLI was not found on this machine. The Copilot " +
    "seat option runs AI calls through the copilot command, which must " +
    "be installed and on PATH. Install the GitHub Copilot CLI (see the " +
    "Copilot CLI guide at docs.github.com/copilot), or set the " +
    "dabblerSessionSets.copilotCliPath setting to the installed copilot " +
    "executable. Then reload the VS Code window (changes made after " +
    "launch are not visible until you reload). Installing is only the " +
    "first step — the full per-machine setup (install, tenant login, " +
    "auth-preflight) is in docs/copilot-seat-setup-checklist.md; an " +
    "unauthenticated seat is blocked at session start.";

  /**
   * Parse the raw budget input. Required dollar amount: numeric and
   * >= 0; empty / non-numeric / negative are rejected with the inline
   * message the validation element shows (D1 lock).
   */
  function parseBudgetInput(raw) {
    var trimmed = String(raw == null ? "" : raw).trim();
    if (trimmed === "") {
      return { ok: false, error: "Enter a budget amount in dollars (0 or more)." };
    }
    var value = Number(trimmed);
    if (!isFinite(value)) {
      return { ok: false, error: "Enter the budget as a plain number, like 25." };
    }
    if (value < 0) {
      return { ok: false, error: "The budget can't be negative." };
    }
    return { ok: true, value: value };
  }

  /**
   * Validate the form's budget control state ahead of the Build action
   * (Full tier only — the caller skips this entirely on Lightweight).
   * Returns `{ ok: true, budgetUsd, zeroMethod }` (zeroMethod null for
   * values > 0) or `{ ok: false, error }` when Build must stay blocked.
   */
  function validateBudgetControls(controls) {
    var parsed = parseBudgetInput(controls.budget);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    if (parsed.value === 0) {
      var method = controls.zeroMethod;
      if (method !== "manual-via-other-engine" && method !== "skipped") {
        return { ok: false, error: BUDGET_ZERO_CHOICE_TEXT };
      }
      return { ok: true, budgetUsd: 0, zeroMethod: method };
    }
    return { ok: true, budgetUsd: parsed.value, zeroMethod: null };
  }

  /**
   * Set 077 S2 (A1/A11): narrow a persisted Getting Started control
   * state — whatever `vscode.getState()` returned across a webview
   * teardown — back to a well-formed `gsState`. Untrusted input: every
   * field is validated and unrecognized values fall back to the
   * defaults (Full radio, unchecked parallel, empty budget, no zero
   * pick). `tierSeed` is the host's durable tier resolution (the
   * `.dabbler/tier` marker → router-config inference chain) and
   * `rootId` is the workspace root that resolution belongs to.
   * Semantics (Set 077 S2 review Major 1 + verification round 1):
   *
   *   - Persisted state belonging to a DIFFERENT root is discarded
   *     outright (S077-S2-V1-001: one repo's form state must never
   *     bleed into another).
   *   - A present seed wins over an UNTOUCHED persisted radio — the
   *     Set 076 leak is the untouched default snapping back to Full.
   *   - `tierDirty` (the operator explicitly flipped the radio after
   *     the last seed) protects that flip — but ONLY against the SAME
   *     seed value it was flipped away from (`lastSeed`). A seed that
   *     has CHANGED since the flip is a newer sanctioned choice
   *     (re-scaffold / Switch Tier…) and re-applies, clearing the flag
   *     (S077-S2-V1-002: dirty means "flipped after the last seed",
   *     never "flipped ever").
   *   - Whenever the tier ends up equal to the seed, the flag clears —
   *     the durable truth caught up, nothing is owed protection.
   *
   * Set 077 S3 (Feature 2): `verificationMode` — the Lightweight
   * three-way choice's second dimension — joins the persisted family
   * with the SAME seed semantics, mirrored field-for-field (`modeSeed`
   * is the host's durable `.dabbler/verification-mode` marker;
   * `modeDirty` / `lastModeSeed` protect a post-seed explicit flip
   * against the same seed value only).
   *
   * Set 079 S1 (Feature 1): `transportProfile` — the Full-tier
   * seat-profile sub-choice ("api" default | "copilot-cli") — joins the
   * family the same way (`profileSeed` is the durable seat-profile
   * resolution the host will wire in Session 2; `profileDirty` /
   * `lastProfileSeed` mirror the mode fields exactly).
   *
   * Pure so the Layer-2 suite replays teardown/re-init without a
   * webview.
   */
  function restoreGsState(persisted, tierSeed, rootId, modeSeed, profileSeed) {
    var p = persisted && typeof persisted === "object" ? persisted : {};
    var persistedRootId = typeof p.rootId === "string" ? p.rootId : null;
    if (
      typeof rootId === "string" &&
      persistedRootId !== null &&
      persistedRootId !== rootId
    ) {
      p = {}; // another root's state — start clean (S077-S2-V1-001)
      persistedRootId = null;
    }
    var state = {
      tier: p.tier === "lightweight" || p.tier === "full" ? p.tier : "full",
      parallel: p.parallel === true,
      budget: typeof p.budget === "string" ? p.budget : "",
      zeroMethod:
        p.zeroMethod === "manual-via-other-engine" || p.zeroMethod === "skipped"
          ? p.zeroMethod
          : null,
      tierDirty: p.tierDirty === true,
      lastSeed:
        p.lastSeed === "full" || p.lastSeed === "lightweight"
          ? p.lastSeed
          : null,
      verificationMode:
        p.verificationMode === "dedicated-sessions" ||
        p.verificationMode === "out-of-band-or-none"
          ? p.verificationMode
          : "out-of-band-or-none",
      modeDirty: p.modeDirty === true,
      lastModeSeed:
        p.lastModeSeed === "dedicated-sessions" ||
        p.lastModeSeed === "out-of-band-or-none"
          ? p.lastModeSeed
          : null,
      transportProfile:
        p.transportProfile === "copilot-cli" || p.transportProfile === "api"
          ? p.transportProfile
          : "api",
      profileDirty: p.profileDirty === true,
      lastProfileSeed:
        p.lastProfileSeed === "api" || p.lastProfileSeed === "copilot-cli"
          ? p.lastProfileSeed
          : null,
      rootId: typeof rootId === "string" ? rootId : persistedRootId,
    };
    if (tierSeed === "full" || tierSeed === "lightweight") {
      var seedChanged = state.lastSeed !== tierSeed;
      if (!state.tierDirty || seedChanged) {
        state.tier = tierSeed;
        state.tierDirty = false;
      }
      if (state.tier === tierSeed) state.tierDirty = false;
      state.lastSeed = tierSeed;
    }
    if (
      modeSeed === "dedicated-sessions" ||
      modeSeed === "out-of-band-or-none"
    ) {
      var modeSeedChanged = state.lastModeSeed !== modeSeed;
      if (!state.modeDirty || modeSeedChanged) {
        state.verificationMode = modeSeed;
        state.modeDirty = false;
      }
      if (state.verificationMode === modeSeed) state.modeDirty = false;
      state.lastModeSeed = modeSeed;
    }
    if (profileSeed === "api" || profileSeed === "copilot-cli") {
      var profileSeedChanged = state.lastProfileSeed !== profileSeed;
      if (!state.profileDirty || profileSeedChanged) {
        state.transportProfile = profileSeed;
        state.profileDirty = false;
      }
      if (state.transportProfile === profileSeed) state.profileDirty = false;
      state.lastProfileSeed = profileSeed;
    }
    return state;
  }

  /**
   * The D6 warning element. `visible` = (tier === "full" &&
   * !gs.providerKeyPresent); rendered hidden (not omitted) so the
   * structure is stable across renders (visibility recomputes on the
   * tier-change re-render).
   */
  function envWarningHtml(visible) {
    return (
      '<div class="gs-warning" data-gs-warning="env" role="alert"' +
      (visible ? "" : " hidden") +
      ">" +
      escHtml(ENV_WARNING_TEXT) +
      "</div>"
    );
  }

  /** The D7 worktree note element. `visible` = the checkbox is checked. */
  function worktreeNoteHtml(visible) {
    return (
      '<div class="gs-note" data-gs-note="worktree" role="note"' +
      (visible ? "" : " hidden") +
      ">" +
      escHtml(WORKTREE_NOTE_TEXT) +
      "</div>"
    );
  }

  function escAttr(s) {
    return escHtml(s).replace(/"/g, "&quot;");
  }

  /**
   * Set 063 S2 (spec D1): the budget / NTE block inside step 1. Full
   * tier ONLY — on Lightweight the block (input, zero-rule pair,
   * validation element) is OMITTED from the DOM entirely, not rendered
   * hidden (S2 verifier R1 Minor: the D1 lock says Lightweight never
   * renders the input). Tier-radio changes therefore re-render the
   * form surface (client.js) instead of visibility-flipping this
   * block; gsState preserves the operator's values across the
   * re-render. The nested $0 zero-rule radio pair keeps its own
   * `hidden` flip (input events are high-frequency; re-rendering on
   * every keystroke would drop focus). The validation element starts
   * hidden; client.js fills and reveals it when a Build click fails
   * validation.
   *
   * Set 081 S1: the block is additionally scoped to the Direct-API
   * sub-choice — the budget governs metered provider-API verification
   * spend, which the Copilot seat profile excludes by design
   * (docs/concepts/tier-model.md). OMITTED (not hidden) while the
   * copilot-cli sub-option is selected, matching the form's existing
   * conditional pattern for this block: sub-choice flips already
   * re-render the form surface (the Set 079 S1 radio listener), and
   * gsState preserves the typed value across the re-render, so hiding
   * never clears it. The gate keys on the explicit "copilot-cli" value
   * — restoreGsState guarantees the live form's transportProfile is
   * always "api" | "copilot-cli", so this is equivalent to requiring
   * "api" while staying render-open for legacy callers that pass no
   * transportProfile field.
   */
  function budgetBlockHtml(controls) {
    if (controls.tier === "lightweight") return "";
    if (controls.transportProfile === "copilot-cli") return "";
    var parsed = parseBudgetInput(controls.budget == null ? "" : controls.budget);
    var zeroVisible = parsed.ok && parsed.value === 0;
    var manualChecked =
      controls.zeroMethod === "manual-via-other-engine" ? " checked" : "";
    var skippedChecked = controls.zeroMethod === "skipped" ? " checked" : "";
    return (
      '<div class="gs-budget" data-gs-budget>' +
        '<label class="gs-budget-label" for="gs-budget-input">' +
          escHtml(BUDGET_LABEL_TEXT) +
        "</label>" +
        '<input class="gs-budget-input" id="gs-budget-input" name="gs-budget"' +
          ' type="text" inputmode="decimal" placeholder="25" value="' +
          escAttr(controls.budget == null ? "" : controls.budget) + '">' +
        '<div class="gs-budget-help">' + escHtml(BUDGET_HELP_TEXT) + "</div>" +
        '<div class="gs-zero-choice" data-gs-zero-choice' +
          (zeroVisible ? "" : " hidden") + ">" +
          '<div class="gs-zero-copy">' + escHtml(BUDGET_ZERO_CHOICE_TEXT) + "</div>" +
          '<label class="gs-radio"><input type="radio" name="gs-zero-method"' +
            ' value="manual-via-other-engine"' + manualChecked +
            "> Check in another engine</label>" +
          '<label class="gs-radio"><input type="radio" name="gs-zero-method"' +
            ' value="skipped"' + skippedChecked +
            "> Skip verification</label>" +
        "</div>" +
        '<div class="gs-validation" data-gs-budget-error role="alert" hidden></div>' +
      "</div>"
    );
  }

  /**
   * Set 080 S1: one option row of a second-level radio group — the
   * shared table-like presentation both sub-choice groups render
   * (radio | short bold name | description, visually separated rows;
   * `.gs-option-row + .gs-option-row` in tree.css draws the light
   * rule). The row REUSES the existing copy constant, split at its
   * first em-dash for presentation only — the constant stays the
   * single source of the copy, and the wording (including the
   * "(default)" marker's position) is unchanged. A constant with no
   * em-dash renders whole as the name, with an empty description.
   */
  function optionRowHtml(groupName, value, checked, text) {
    var sep = " — ";
    var idx = String(text).indexOf(sep);
    var name = idx === -1 ? String(text) : String(text).slice(0, idx);
    var desc = idx === -1 ? "" : String(text).slice(idx + sep.length);
    return (
      '<label class="gs-option-row"><input type="radio" name="' +
        escAttr(groupName) + '" value="' + escAttr(value) + '"' +
        (checked ? " checked" : "") + ">" +
        '<span class="gs-option-name">' + escHtml(name) + "</span>" +
        '<span class="gs-option-desc">' + escHtml(desc) + "</span>" +
      "</label>"
    );
  }

  /**
   * Set 077 S3 (Feature 2): the Lightweight-only verification-mode block
   * inside step 1 — the mirror image of {@link budgetBlockHtml}: on FULL
   * the block is OMITTED from the DOM entirely (tier flips re-render the
   * form surface, so there is no visibility flip to manage). The default
   * radio is out-of-band-or-none, matching the spec-level default.
   * Set 080 S1: options render as {@link optionRowHtml} rows.
   */
  function verificationModeBlockHtml(controls) {
    if (controls.tier !== "lightweight") return "";
    var dedicated = controls.verificationMode === "dedicated-sessions";
    return (
      '<div class="gs-verification-mode" data-gs-verification-mode>' +
        '<div class="gs-verification-mode-label">' +
          escHtml(VERIFICATION_MODE_LABEL_TEXT) +
        "</div>" +
        optionRowHtml(
          "gs-verification-mode",
          "out-of-band-or-none",
          !dedicated,
          VERIFICATION_MODE_OUT_OF_BAND_TEXT,
        ) +
        optionRowHtml(
          "gs-verification-mode",
          "dedicated-sessions",
          dedicated,
          VERIFICATION_MODE_DEDICATED_TEXT,
        ) +
      "</div>"
    );
  }

  /**
   * Set 079 S1 (Feature 1): the missing-Copilot-CLI warning element.
   * Rendered hidden (not omitted) inside the seat-profile block so the
   * Full-tier DOM structure is stable across renders. `visible` =
   * (the Copilot sub-choice is selected AND gs.copilotCliPresent ===
   * false); an absent payload flag (older host) reads as present, so
   * the warning fails quiet, never falsely loud.
   */
  function copilotWarningHtml(visible) {
    return (
      '<div class="gs-warning" data-gs-warning="copilot" role="alert"' +
      (visible ? "" : " hidden") +
      ">" +
      escHtml(COPILOT_WARNING_TEXT) +
      "</div>"
    );
  }

  /**
   * Set 079 S1 (Feature 1): the Full-tier seat-profile block — the
   * second radio group under the Full tier radio, mirroring
   * {@link verificationModeBlockHtml}'s conditional-render shape: on
   * LIGHTWEIGHT the block is OMITTED from the DOM entirely (tier flips
   * re-render the form surface, so there is no visibility flip to
   * manage). The default radio is "api" (direct provider keys),
   * matching Set 078's unchanged transport.profile default. The
   * missing-CLI warning renders inside the block, hidden unless the
   * Copilot option is selected and the probe failed
   * (`copilotCliPresent === false`).
   * Set 080 S1: options render as {@link optionRowHtml} rows.
   * Set 081 S1: the budget block ({@link budgetBlockHtml}) nests as an
   * indented child of the Direct-API option row — present only while
   * that sub-option is selected (the builder returns "" on
   * copilot-cli, and then no child wrapper renders at all, keeping the
   * two option rows adjacent so tree.css's `.gs-option-row +
   * .gs-option-row` separator applies directly).
   */
  function transportProfileBlockHtml(controls, copilotCliPresent) {
    if (controls.tier === "lightweight") return "";
    var copilot = controls.transportProfile === "copilot-cli";
    var warningVisible = copilot && copilotCliPresent === false;
    var budget = budgetBlockHtml(controls);
    return (
      '<div class="gs-transport-profile" data-gs-transport-profile>' +
        '<div class="gs-transport-profile-label">' +
          escHtml(TRANSPORT_PROFILE_LABEL_TEXT) +
        "</div>" +
        optionRowHtml(
          "gs-transport-profile",
          "api",
          !copilot,
          TRANSPORT_PROFILE_API_TEXT,
        ) +
        (budget
          ? '<div class="gs-option-child" data-gs-option-child="api">' +
              budget +
            "</div>"
          : "") +
        optionRowHtml(
          "gs-transport-profile",
          "copilot-cli",
          copilot,
          TRANSPORT_PROFILE_COPILOT_TEXT,
        ) +
        copilotWarningHtml(warningVisible) +
      "</div>"
    );
  }

  /**
   * The A10 missing-Python warning element (Set 077 S3). Like the D6
   * warning it is rendered hidden (not omitted) so the DOM structure is
   * stable across renders; unlike D6 it is tier-independent — both tiers
   * need a base interpreter. `visible` = (gs.pythonPresent === false).
   */
  function pythonWarningHtml(visible) {
    return (
      '<div class="gs-warning" data-gs-warning="python" role="alert"' +
      (visible ? "" : " hidden") +
      ">" +
      escHtml(PYTHON_WARNING_TEXT) +
      "</div>"
    );
  }

  // No workspace folder open (D5). A single CTA to open / create a
  // project folder (showOpenDialog -> vscode.openFolder host-side).
  function renderNoFolder() {
    return (
      '<div class="getting-started">' +
        '<div class="gs-header">' +
          '<div class="gs-title">Getting Started</div>' +
          '<div class="gs-subtitle">Open or create a project folder to begin.</div>' +
        '</div>' +
        '<div class="gs-step">' +
          '<div class="gs-step-body">' +
            '<button class="gs-button" type="button" data-gs-action="open-folder">' +
              'Open or create a project folder…' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  // Folder open, no session sets yet (D1). The three-step setup form.
  // Each step greys out + shows a green check when its D3 completion
  // flag is set. Live state lives ONLY here (D2).
  function gsStep(num, title, complete, bodyHtml) {
    var cls = complete ? "gs-step gs-step-complete" : "gs-step";
    var check = complete ? "✓" : "";
    return (
      '<div class="' + cls + '">' +
        '<div class="gs-step-head">' +
          '<span class="gs-check" aria-hidden="true">' + check + '</span>' +
          '<span class="gs-step-title">' + escHtml(num + ". " + title) + '</span>' +
        '</div>' +
        '<div class="gs-step-body">' + bodyHtml + '</div>' +
      '</div>'
    );
  }

  /**
   * The full Getting Started form. `gs` is the host's
   * GettingStartedPayload (three D3 completion flags +
   * providerKeyPresent); `controls` is the webview-local control
   * state `{ tier: "full"|"lightweight", parallel: boolean,
   * budget: string, zeroMethod: string|null }` so re-renders keep the
   * operator's picks (Set 060 S2; budget controls Set 063 S2). Set 081
   * S1: the budget block renders inside the transport-profile block
   * (nested under the Direct-API option row), not as a sibling.
   */
  function renderGettingStarted(gs, controls) {
    var fullChecked = controls.tier === "lightweight" ? "" : " checked";
    var lightChecked = controls.tier === "lightweight" ? " checked" : "";
    var parallelChecked = controls.parallel ? " checked" : "";
    // Set 079 S1: the D6 key warning is Full-via-API guidance — while
    // the Copilot seat sub-choice is selected it would tell the exact
    // keyless audience the option exists for to go set DABBLER_* keys,
    // so it stays hidden there (the Copilot path needs no keys).
    var envWarningVisible =
      controls.tier !== "lightweight" &&
      controls.transportProfile !== "copilot-cli" &&
      gs.providerKeyPresent === false;
    // Set 077 S3 (A10): the missing-Python warning leads step 1 — it is
    // the prerequisite everything below it depends on. `pythonPresent`
    // absent from the payload (an older host) reads as "present" so the
    // warning fails quiet, never falsely loud.
    var pythonWarningVisible = gs.pythonPresent === false;
    var step1 = gsStep(
      1,
      "Build project structure",
      gs.structureBuilt,
      pythonWarningHtml(pythonWarningVisible) +
      '<div class="gs-radio-group" role="radiogroup" aria-label="Project tier">' +
        '<label class="gs-radio"><input type="radio" name="gs-tier" value="full"' + fullChecked + '> Full</label>' +
        '<label class="gs-radio"><input type="radio" name="gs-tier" value="lightweight"' + lightChecked + '> Lightweight</label>' +
      '</div>' +
      transportProfileBlockHtml(controls, gs.copilotCliPresent) +
      verificationModeBlockHtml(controls) +
      '<button class="gs-button" type="button" data-gs-action="build-structure">' +
        'Build project structure' +
      '</button>' +
      envWarningHtml(envWarningVisible),
    );
    var step2 = gsStep(
      2,
      "Create or import a project plan",
      gs.planPresent,
      '<button class="gs-button" type="button" data-gs-action="import-plan">' +
        'Import project-plan.md…' +
      '</button>' +
      '<button class="gs-button gs-button-secondary" type="button" data-gs-action="copy-plan-prompt">' +
        'Copy prompt for planning' +
      '</button>',
    );
    var step3 = gsStep(
      3,
      "Build session sets",
      gs.sessionSetsPresent,
      '<button class="gs-button" type="button" data-gs-action="build-session-sets">' +
        'Copy prompt to build session sets' +
      '</button>' +
      '<label class="gs-checkbox">' +
        '<input type="checkbox" name="gs-parallel"' + parallelChecked + '> Create parallel session sets where possible' +
      '</label>' +
      worktreeNoteHtml(!!controls.parallel),
    );
    return (
      '<div class="getting-started">' +
        '<div class="gs-header">' +
          '<div class="gs-title">Getting Started</div>' +
          '<div class="gs-subtitle">Complete each step to set up your project, then start your first session.</div>' +
        '</div>' +
        step1 + step2 + step3 +
      '</div>'
    );
  }

  return {
    renderNoFolder: renderNoFolder,
    renderGettingStarted: renderGettingStarted,
    restoreGsState: restoreGsState,
    gsStep: gsStep,
    envWarningHtml: envWarningHtml,
    worktreeNoteHtml: worktreeNoteHtml,
    budgetBlockHtml: budgetBlockHtml,
    optionRowHtml: optionRowHtml,
    verificationModeBlockHtml: verificationModeBlockHtml,
    transportProfileBlockHtml: transportProfileBlockHtml,
    pythonWarningHtml: pythonWarningHtml,
    copilotWarningHtml: copilotWarningHtml,
    parseBudgetInput: parseBudgetInput,
    validateBudgetControls: validateBudgetControls,
    ENV_WARNING_TEXT: ENV_WARNING_TEXT,
    WORKTREE_NOTE_TEXT: WORKTREE_NOTE_TEXT,
    BUDGET_LABEL_TEXT: BUDGET_LABEL_TEXT,
    BUDGET_HELP_TEXT: BUDGET_HELP_TEXT,
    BUDGET_ZERO_CHOICE_TEXT: BUDGET_ZERO_CHOICE_TEXT,
    VERIFICATION_MODE_LABEL_TEXT: VERIFICATION_MODE_LABEL_TEXT,
    VERIFICATION_MODE_OUT_OF_BAND_TEXT: VERIFICATION_MODE_OUT_OF_BAND_TEXT,
    VERIFICATION_MODE_DEDICATED_TEXT: VERIFICATION_MODE_DEDICATED_TEXT,
    PYTHON_WARNING_TEXT: PYTHON_WARNING_TEXT,
    TRANSPORT_PROFILE_LABEL_TEXT: TRANSPORT_PROFILE_LABEL_TEXT,
    TRANSPORT_PROFILE_API_TEXT: TRANSPORT_PROFILE_API_TEXT,
    TRANSPORT_PROFILE_COPILOT_TEXT: TRANSPORT_PROFILE_COPILOT_TEXT,
    COPILOT_WARNING_TEXT: COPILOT_WARNING_TEXT,
  };
});
