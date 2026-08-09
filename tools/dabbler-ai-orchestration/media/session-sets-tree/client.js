// Webview-side client for the Dabbler "Setup & Status" view.
//
// Set 110 Session 3: this file used to be the Work Explorer's hand-rolled
// tree — ARIA rendering, roving tabindex, keyboard nav, contextmenu
// dispatch, manual expand/collapse — in ~1,200 lines. The tree is a native
// `TreeView` now, and VS Code owns every one of those behaviours. What is
// left is the wiring for the two surfaces a `TreeItem` cannot host:
//
//   - the Getting Started form (radio groups, a validated budget input,
//     buttons that post typed messages to the host);
//   - the System Status strip.
//
// Rendering for both lives in sibling UMD-lite modules
// (`gettingStartedHtml.js`, `systemStatusHtml.js`) loaded before this file,
// so it is unit-testable without a webview. This file keeps the wiring only.
//
// All dynamic text from the host snapshot is still HTML-escaped on this side
// (defense-in-depth) before any innerHTML assignment.

(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById("root");
  let currentVersion = -1;
  let scanState = "loading";
  let lastSnapshot = null;
  // Set 060 Session 3: the Getting Started surface HTML builders moved
  // to gettingStartedHtml.js (a UMD-lite module loaded as a second
  // <script> before this file) so the rendering is unit-testable without
  // a webview. This file keeps the wiring only. (Set 092 S2: the
  // form-local environment warnings moved to the System Status strip,
  // systemStatusHtml.js. Set 094: the form shrank to two sections — Build
  // project structure + Define modules.)
  const gsHtml = window.DabblerGettingStartedHtml;
  const systemStatusHtml = window.DabblerSystemStatusHtml;
  // Set 060 Session 2: the Getting Started form's control state. Kept
  // here so a snapshot re-render — which happens after every action and
  // on every watcher tick — doesn't snap the provider-access radio back
  // to its default. Set 063 S2: `budget` (raw input string) and
  // `zeroMethod` (the $0 zero-rule radio pick) ride along for the same
  // reason.
  //
  // Set 077 S2 (A1/A11): the state also survives webview TEARDOWN —
  // hiding the view, collapsing the sidebar, or reloading the window
  // re-runs this script, and the in-memory object alone would re-check
  // the default radio over the operator's pick.
  // `vscode.getState()`/`setState()` round-trips the whole control
  // state; `persistGsState()` runs after every mutation. The host's
  // durable seat-profile seed is applied ONCE per script load when the
  // first getting-started snapshot arrives — it outranks an UNTOUCHED
  // persisted radio but never a radio the operator explicitly flipped
  // after the last seed (`profileDirty`).
  // Restoration/narrowing is the pure `gsHtml.restoreGsState` so the
  // contract is unit-tested at Layer 2.
  //
  // Set 112 S2: the tier radio and the Lightweight verification-mode
  // radios retired with the tier; provider access is the form's only
  // setup fork now.
  const persistedState = vscode.getState();
  let gsState = gsHtml.restoreGsState(
    persistedState ? persistedState.gsState : undefined,
    null,
    null,
  );
  // The (rootId, transportProfileSeed) pair last applied this
  // script-lifetime. Sentinels (not null) so the first getting-started
  // snapshot always seeds; a later snapshot whose rootId OR the seed
  // differs re-runs the restore — the once-per-load boolean missed a
  // mid-life root switch (S077-S2-V1-001) and a rootId-only key missed a
  // same-root seed change, e.g. a profile written by a scaffold action
  // while the webview stays alive (S077-S2-V1-002, round 2).
  let lastSeedRootId = { unseeded: true };
  let lastSeedProfile = { unseeded: true };
  // Merge-preserving write (S2 review, Minor 2): never clobber other
  // keys a future consumer may persist alongside gsState.
  function persistGsState() {
    var prior = vscode.getState();
    vscode.setState(
      Object.assign({}, prior && typeof prior === "object" ? prior : {}, {
        gsState: {
          budget: gsState.budget,
          zeroMethod: gsState.zeroMethod,
          transportProfile: gsState.transportProfile,
          profileDirty: gsState.profileDirty,
          lastProfileSeed: gsState.lastProfileSeed,
          rootId: gsState.rootId,
        },
      }),
    );
  }

  // ----- Escape helpers (defense-in-depth) -----
  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escAttr(s) {
    return escHtml(s).replace(/"/g, "&quot;");
  }

  // ----- Message receive (host → webview) -----
  window.addEventListener("message", function (event) {
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (typeof msg.version === "number" && msg.version < currentVersion) {
      // Stale snapshot — drop. Monotonic version protects against
      // out-of-order watcher / polling races.
      return;
    }
    if (typeof msg.version === "number") {
      currentVersion = msg.version;
    }
    switch (msg.type) {
      case "rowsSnapshot":
        scanState = msg.scanState || "ready";
        lastSnapshot = msg.payload;
        render();
        return;
      case "scanStateChanged":
        scanState = msg.state;
        render();
        return;
    }
  });

  // ----- Render -----
  function render() {
    if (!root) return;
    if (scanState === "loading") {
      root.innerHTML =
        '<div class="loading-sentinel" role="status" aria-live="polite">' +
          '<div class="loading-title">Setting up your project…</div>' +
          '<div class="loading-subtitle">scanning session sets…</div>' +
        '</div>';
      return;
    }
    if (!lastSnapshot) {
      // Ready but no snapshot yet. Render nothing; host will ship one
      // momentarily.
      root.innerHTML = "";
      return;
    }
    // Set 060 Session 1 (spec D1/D5): dual-mode surface. The host ships a
    // `gettingStarted` block with a `mode`. "no-folder" and
    // "getting-started" render the onboarding surfaces; Session 2 wires the
    // form actions onto the `data-gs-action` hooks (wireGettingStarted).
    // Set 063 S2 (spec D2): `gettingStarted` is required on the snapshot —
    // the pre-Set-060 welcome-HTML fallback branch is retired with the rest
    // of the adoption-bootstrap path.
    //
    // Set 110 S3: "list" no longer means "fall through to the tree below".
    // There is no tree in this view; the native `TreeView` is a separate
    // pane. List mode now renders the System Status strip alone, and on a
    // healthy workspace that strip is empty — which is precisely when the
    // host drops this whole view from the container.
    var gs = lastSnapshot.gettingStarted;
    var status = lastSnapshot.systemStatus;
    if (gs && gs.mode !== "list") {
      // Set 077 S2 (A1): the host's durable seat-profile seed rides the
      // snapshot. Applied once per (script load, root) — before the
      // first form paint, and again if the detection root changes
      // mid-life (S077-S2-V1-001). All precedence lives in the pure
      // restoreGsState: the seed outranks an UNTOUCHED persisted radio,
      // a post-seed explicit flip survives the SAME seed
      // (profileDirty), and a CHANGED seed — a newer sanctioned choice —
      // re-applies and clears the flag (S077-S2-V1-002). A root switch
      // discards the other root's persisted state entirely.
      if (
        gs.mode === "getting-started" &&
        (lastSeedRootId !== gs.rootId ||
          lastSeedProfile !== gs.transportProfileSeed)
      ) {
        lastSeedRootId = gs.rootId;
        lastSeedProfile = gs.transportProfileSeed;
        gsState = gsHtml.restoreGsState(
          gsState,
          gs.rootId,
          gs.transportProfileSeed,
        );
        persistGsState();
      }
      // Set 092 S2 (verification R1): the strip is computed only AFTER
      // the durable seed lands in gsState, so the first paint's strip
      // and form read the same finalized profile control — a pre-seed
      // strip could hide a Copilot fault the seeded profile implies.
      var statusHtml = systemStatusHtml.renderSystemStatus(
        status,
        gs.mode === "getting-started"
          ? gsState
          : { transportProfile: status && status.transportProfile },
      );
      root.innerHTML =
        statusHtml + (gs.mode === "no-folder"
          ? gsHtml.renderNoFolder()
          : gsHtml.renderGettingStarted(gs, gsState));
      wireGettingStarted();
      return;
    }

    // Set 110 Session 3: list mode used to render the whole hand-rolled
    // tree here. The tree is a native `TreeView` now, so what remains in
    // this view is the System Status strip alone — and on a healthy
    // workspace `renderSystemStatus` returns "", which is exactly when the
    // host's `dabblerSessionSets.setupNeeded` context key drops this view
    // from the container entirely. The empty render is therefore a
    // transient state (the tick between a fault clearing and the key being
    // re-evaluated), not the steady state.
    root.innerHTML = systemStatusHtml.renderSystemStatus(status, {
      transportProfile: status && status.transportProfile,
    });
  }

  // ----- Set 060 dual-mode Getting Started surfaces -----
  //
  // Rendering lives in gettingStartedHtml.js (Session 3 extraction);
  // this section owns only the event wiring.

  // Set 060 Session 2: wire the Getting Started surfaces. Buttons post a
  // typed `gettingStartedAction` message; build-structure carries the
  // form state (seat profile / budget), and
  // open-modules carries none (Set 094). The clicked button disables until
  // the host's post-action snapshot re-renders the surface (double-click
  // guard). Radio changes update gsState and re-render / toggle the System
  // Status faults in place — no host round-trip.
  function wireGettingStarted() {
    // Set 063 S2 (spec D1): budget input + the $0 zero-rule radio pair.
    // Typing updates gsState and flips the zero-choice visibility in
    // place; any edit clears a standing validation message (the next
    // Build click re-validates).
    Array.from(root.querySelectorAll('input[name="gs-budget"]')).forEach(function (input) {
      input.addEventListener("input", function () {
        gsState.budget = input.value;
        persistGsState();
        syncBudgetBlock();
        showBudgetError(null);
      });
    });
    Array.from(root.querySelectorAll('input[name="gs-zero-method"]')).forEach(function (input) {
      input.addEventListener("change", function () {
        if (input.checked) gsState.zeroMethod = input.value;
        persistGsState();
        showBudgetError(null);
      });
    });
    // Set 079 S1 (Feature 1): the seat-profile radios. A flip is
    // explicit operator intent (profileDirty), so later seeds never
    // silently revert it. This DOES re-render: the System Status
    // strip's provider-key / Copilot-CLI faults key on the selection,
    // and the re-render recomputes their visibility in one pass (radios
    // carry no typing focus to lose — the budget-input concern doesn't
    // apply).
    // Set 081 S1: the re-render also swaps the budget block in/out under
    // the Direct-API row (omitted while Copilot is selected). gsState
    // keeps the typed budget + zero-rule pick across the swap, so an
    // api → copilot → api round-trip restores the operator's value —
    // hiding never clears it.
    Array.from(root.querySelectorAll('input[name="gs-transport-profile"]')).forEach(function (input) {
      input.addEventListener("change", function () {
        if (input.checked) {
          gsState.transportProfile =
            input.value === "copilot-cli" ? "copilot-cli" : "api";
          gsState.profileDirty = true;
        }
        persistGsState();
        render();
      });
    });
    Array.from(root.querySelectorAll("[data-gs-action]")).forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var action = btn.getAttribute("data-gs-action");
        if (!action) return;
        var msg = { type: "gettingStartedAction", action: action };
        if (action === "build-structure") {
          // Set 079 S2 (Feature 1): the seat-profile pick rides the
          // build so the host can run the guided Copilot seat setup
          // after the scaffold succeeds.
          msg.transportProfile = gsState.transportProfile;
          // Set 063 S2 (spec D1) → scoped by Set 081 S1: Build is
          // blocked until the budget validates (required amount; $0
          // additionally needs the zero-rule pick) — but ONLY while the
          // budget block is live (the Direct-API sub-option selected).
          // Under the Copilot seat the block is not rendered and Build
          // posts no budget riders — a hidden input must never trip
          // Build validation.
          if (gsState.transportProfile !== "copilot-cli") {
            var check = gsHtml.validateBudgetControls(gsState);
            if (!check.ok) {
              showBudgetError(check.error);
              return; // button stays enabled; the operator fixes and retries
            }
            msg.budgetUsd = check.budgetUsd;
            if (check.budgetUsd === 0) msg.zeroBudgetMethod = check.zeroMethod;
          }
        }
        // Set 094: `open-modules` carries no riders — the generic
        // { type, action } message above is all the Define-modules button
        // needs (the host ensures docs/modules.yaml and opens it).
        btn.disabled = true;
        vscode.postMessage(msg);
      });
    });
  }

  // D6 note (Set 060 S3 → Set 063 S2 → Set 092 S2): the provider-key
  // fault now renders in the System Status strip; its visibility is
  // computed in renderSystemStatus from the seat-profile control.
  // Profile radio changes re-render the surface (see the listener
  // above), so no standalone visibility-flip helper remains.

  // Set 063 S2 (spec D1): the nested $0 zero-rule pair shows only
  // while the parsed value is exactly 0. Pure visibility flip on input
  // events (re-rendering per keystroke would drop input focus). The
  // block itself is omitted from the Copilot-seat render entirely, so
  // there is no block-level flip.
  function syncBudgetBlock() {
    var zero = root.querySelector("[data-gs-zero-choice]");
    if (!zero) return;
    var parsed = gsHtml.parseBudgetInput(gsState.budget);
    zero.hidden = !(parsed.ok && parsed.value === 0);
  }

  // Set 063 S2 (spec D1): the inline validation element under the
  // budget input. `message` null hides it; a string reveals it.
  function showBudgetError(message) {
    var el = root.querySelector("[data-gs-budget-error]");
    if (!el) return;
    el.textContent = message || "";
    el.hidden = !message;
  }

  // Handshake: tell host we're ready for the first snapshot.
  vscode.postMessage({ type: "ready" });
})();
