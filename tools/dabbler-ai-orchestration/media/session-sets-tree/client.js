// Webview-side client for the Set 029 Session 4 custom Session Sets
// view. Owns: ARIA tree rendering (roving tabindex), keyboard nav,
// contextmenu / Shift+F10 / Context Menu key dispatch (signals the
// host to open a `vscode.window.showQuickPick`), manual expand /
// collapse, postMessage protocol with monotonic-version drop per
// S4 audit GPT-5.4 M3.
//
// Set 048 S3 (spec §3.3, Bias 3 flip): the Set 034 cursor-anchored
// HTML popup is gone. The webview no longer renders or manages a
// context-menu DOM element — the host opens native QuickPick(s)
// instead, which is more accessible (keyboard nav + theme honoring)
// and dismisses naturally on click-outside / Escape.
//
// All dynamic text from the host snapshot is HTML-escaped here on the
// webview side too (defense-in-depth) before any innerHTML
// assignment, per S4 R13 mitigation / GPT-5.4 M5.
//
// TODO: type-ahead search (WAI-ARIA tree pattern). Deferred to v1.1
// per S4 audit Gemini M10 — today's set counts are small enough that
// arrow nav is fine; the affordance ships when set counts grow.

(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById("root");
  let currentVersion = -1;
  let scanState = "loading";
  let lastSnapshot = null;
  let suppressed = {}; // slug -> marker.updatedAt
  // Manually toggled slugs in the current session (added on every
  // user click). Persists across re-renders so a fresh snapshot
  // doesn't snap-back an operator's manual collapse / expand.
  const manualToggles = {};
  // Set 034: bucket-level collapse state. Keyed by the bucket element's
  // data-bucket-key attribute; value true = expanded, false = collapsed.
  // Persists across re-renders for the session so a watcher tick doesn't
  // snap a user-collapsed bucket back open.
  //
  // Set 087 Session 2: in the multi-module view the attribute is the
  // composite "<module-slug>/<bucket-key>" so collapse state is scoped
  // per (module, bucket); the implicit-only view keeps today's bare
  // bucket.key (routed ruling Q4 — that DOM stays byte-identical).
  const bucketCollapsed = {};
  // Set 087 Session 2: module-level collapse state, keyed by module
  // slug ("" = the implicit module). Same persistence semantics as
  // bucketCollapsed. Only consulted in the multi-module view — the
  // implicit-only view renders no module group.
  const moduleCollapsed = {};
  // Set 060 Session 3: the Getting Started surface HTML builders moved
  // to gettingStartedHtml.js (a UMD-lite module loaded as a second
  // <script> before this file) so the rendering — including the D7
  // worktree note — is unit-testable without a webview. This file keeps
  // the wiring only. (Set 092 S2: the form-local environment warnings
  // moved to the System Status strip, systemStatusHtml.js.)
  const gsHtml = window.DabblerGettingStartedHtml;
  const systemStatusHtml = window.DabblerSystemStatusHtml;
  // Set 060 Session 2: the Getting Started form's control state. Kept
  // here (like bucketCollapsed) so a snapshot re-render — which happens
  // after every action and on every watcher tick — doesn't snap the
  // tier radio back to Full or untick the parallel checkbox. Set 063
  // S2: `budget` (raw input string) and `zeroMethod` (the $0 zero-rule
  // radio pick) ride along for the same reason.
  //
  // Set 077 S2 (A1/A11): the state now also survives webview TEARDOWN —
  // hiding the view, collapsing the sidebar, or reloading the window
  // re-runs this script, and the in-memory object alone re-checked the
  // Full radio (and re-showed the Full-tier key warning) over a
  // Lightweight pick. `vscode.getState()`/`setState()` round-trips the
  // whole control state (tier AND the same-family budget / zeroMethod /
  // parallel fields); `persistGsState()` runs after every mutation. The
  // host's durable tier seed (`.dabbler/tier` marker → router-config
  // inference) is applied ONCE per script load when the first
  // getting-started snapshot arrives — it outranks an UNTOUCHED
  // persisted radio (Feature 1 precedence: marker → inference →
  // volatile UI) but never a radio the operator explicitly flipped
  // after the last seed (`tierDirty`, S2 review Major 1).
  // Restoration/narrowing is the pure `gsHtml.restoreGsState` so the
  // contract is unit-tested at Layer 2.
  const persistedState = vscode.getState();
  let gsState = gsHtml.restoreGsState(
    persistedState ? persistedState.gsState : undefined,
    null,
    null,
    null,
    null,
  );
  // The (rootId, tierSeed, verificationModeSeed, transportProfileSeed)
  // tuple last applied this script-lifetime. Sentinels (not null) so the
  // first getting-started snapshot always seeds; a later snapshot whose
  // rootId OR any seed differs re-runs the restore — the once-per-load
  // boolean missed a mid-life root switch (S077-S2-V1-001) and a
  // rootId-only key missed a same-root seed change, e.g. the marker
  // written by a scaffold action while the webview stays alive
  // (S077-S2-V1-002, round 2). Set 077 S3: the verification-mode marker
  // seed joins the tuple with identical semantics. Set 079 S1: the
  // seat-profile seed joins too (null from the host until Session 2
  // wires the durable source).
  let lastSeedRootId = { unseeded: true };
  let lastSeedValue = { unseeded: true };
  let lastSeedMode = { unseeded: true };
  let lastSeedProfile = { unseeded: true };
  // Merge-preserving write (S2 review, Minor 2): never clobber other
  // keys a future consumer may persist alongside gsState.
  function persistGsState() {
    var prior = vscode.getState();
    vscode.setState(
      Object.assign({}, prior && typeof prior === "object" ? prior : {}, {
        gsState: {
          tier: gsState.tier,
          parallel: gsState.parallel,
          budget: gsState.budget,
          zeroMethod: gsState.zeroMethod,
          tierDirty: gsState.tierDirty,
          lastSeed: gsState.lastSeed,
          verificationMode: gsState.verificationMode,
          modeDirty: gsState.modeDirty,
          lastModeSeed: gsState.lastModeSeed,
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
      case "suppressionEcho":
        suppressed = msg.suppressed || {};
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
    // Set 060 Session 1 (spec D1/D5): dual-mode surface. The host ships
    // a `gettingStarted` block with a `mode`. "no-folder" and
    // "getting-started" replace the old viewsWelcome empty state; "list"
    // falls through to the bucket tree below. Session 2 wires the form
    // actions onto the `data-gs-action` hooks (wireGettingStarted).
    // Set 063 S2 (spec D2): `gettingStarted` is required on the snapshot
    // now — the pre-Set-060 welcome-HTML fallback branch is retired with
    // the rest of the adoption-bootstrap path.
    var gs = lastSnapshot.gettingStarted;
    var status = lastSnapshot.systemStatus;
    if (gs && gs.mode !== "list") {
      // Set 077 S2 (A1): the host's durable tier seed rides the
      // snapshot. Applied once per (script load, root) — before the
      // first form paint, and again if the detection root changes
      // mid-life (S077-S2-V1-001). All precedence lives in the pure
      // restoreGsState: the seed outranks an UNTOUCHED persisted radio
      // (the Set 076 leak), a post-seed explicit flip survives the
      // SAME seed (tierDirty, S2 review Major 1), and a CHANGED seed —
      // a newer sanctioned choice — re-applies and clears the flag
      // (S077-S2-V1-002). A root switch discards the other root's
      // persisted state entirely.
      if (
        gs.mode === "getting-started" &&
        (lastSeedRootId !== gs.rootId ||
          lastSeedValue !== gs.tierSeed ||
          lastSeedMode !== gs.verificationModeSeed ||
          lastSeedProfile !== gs.transportProfileSeed)
      ) {
        lastSeedRootId = gs.rootId;
        lastSeedValue = gs.tierSeed;
        lastSeedMode = gs.verificationModeSeed;
        lastSeedProfile = gs.transportProfileSeed;
        gsState = gsHtml.restoreGsState(
          gsState,
          gs.tierSeed,
          gs.rootId,
          gs.verificationModeSeed,
          gs.transportProfileSeed,
        );
        persistGsState();
      }
      // Set 092 S2 (verification R1): the strip is computed only AFTER
      // the durable seed lands in gsState, so the first paint's strip
      // and form read the same finalized tier/profile controls — a
      // pre-seed strip could show a provider-key fault the seeded tier
      // suppresses (or hide a Copilot fault it implies).
      var statusHtml = systemStatusHtml.renderSystemStatus(
        status,
        gs.mode === "getting-started"
          ? gsState
          : {
              tier: status && status.tier,
              transportProfile: status && status.transportProfile,
            },
      );
      root.innerHTML =
        statusHtml + (gs.mode === "no-folder"
          ? gsHtml.renderNoFolder()
          : gsHtml.renderGettingStarted(gs, gsState));
      wireGettingStarted();
      return;
    }

    // List mode has no form controls; the strip follows the host's
    // durable tier/profile snapshot fields.
    const parts = [
      systemStatusHtml.renderSystemStatus(status, {
        tier: status && status.tier,
        transportProfile: status && status.transportProfile,
      }),
    ];
    // Set 033 Session 2: ambiguity banner retired. Multi-in-progress
    // is the supported case — every in-progress row carries its own
    // accordion below.
    //
    // Set 092 Session 1: one rendering dialect for every repo state.
    // Every snapshot renders module → status-bucket → row; the sole
    // pseudo-module arrives as `Default` and is visually de-emphasized.
    const modules = lastSnapshot.modules || [];
    parts.push('<div role="tree" aria-label="Work Explorer" class="tree" data-testid="work-explorer-tree">');
    for (const mod of modules) {
      parts.push(renderModule(mod));
    }
    parts.push('</div>');
    root.innerHTML = parts.join("");

    wireInteraction();
    initRovingFocus();
  }

  // ----- Set 060 dual-mode Getting Started surfaces -----
  //
  // Rendering lives in gettingStartedHtml.js (Session 3 extraction);
  // this section owns only the event wiring.

  // Set 060 Session 2: wire the Getting Started surfaces. Buttons post a
  // typed `gettingStartedAction` message carrying the relevant form
  // state (tier for build-structure, parallel for build-session-sets);
  // the clicked button disables until the host's post-action snapshot
  // re-renders the surface (double-click guard). Radio / checkbox
  // changes update gsState and toggle the D7 note / System Status
  // faults in place — no host round-trip.
  function wireGettingStarted() {
    Array.from(root.querySelectorAll('input[name="gs-tier"]')).forEach(function (input) {
      input.addEventListener("change", function () {
        if (input.checked) {
          gsState.tier = input.value === "lightweight" ? "lightweight" : "full";
          // Explicit operator intent: later seeds must not revert it.
          gsState.tierDirty = true;
        }
        persistGsState();
        // Set 063 S2 (R1 Minor fix): the budget block is OMITTED from
        // the Lightweight render (not hidden), so a tier flip
        // re-renders the form surface locally. gsState carries every
        // control value, so nothing is lost; no host round-trip.
        render();
      });
    });
    Array.from(root.querySelectorAll('input[name="gs-parallel"]')).forEach(function (input) {
      input.addEventListener("change", function () {
        gsState.parallel = !!input.checked;
        persistGsState();
        syncWorktreeNote();
      });
    });
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
    // Set 079 S1 (Feature 1): the Full-only seat-profile radios. A flip
    // is explicit operator intent (profileDirty), so later seeds never
    // silently revert it — the tierDirty contract. Unlike the
    // verification-mode radios this DOES re-render: the System Status
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
    // Set 077 S3 (Feature 2): the Lightweight-only verification-mode
    // radios. A flip is explicit operator intent (modeDirty), so later
    // marker seeds never silently revert it — the same contract as the
    // tier radio's tierDirty. No re-render needed: block visibility
    // depends only on the tier, and the radios update themselves.
    Array.from(root.querySelectorAll('input[name="gs-verification-mode"]')).forEach(function (input) {
      input.addEventListener("change", function () {
        if (input.checked) {
          gsState.verificationMode =
            input.value === "dedicated-sessions"
              ? "dedicated-sessions"
              : "out-of-band-or-none";
          gsState.modeDirty = true;
        }
        persistGsState();
      });
    });
    Array.from(root.querySelectorAll("[data-gs-action]")).forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var action = btn.getAttribute("data-gs-action");
        if (!action) return;
        var msg = { type: "gettingStartedAction", action: action };
        if (action === "build-structure") {
          msg.tier = gsState.tier;
          if (gsState.tier !== "lightweight") {
            // Set 079 S2 (Feature 1): the Full-tier seat-profile pick
            // rides the build so the host can run the guided Copilot
            // seat setup after the scaffold succeeds. Omitted on
            // Lightweight (the sub-choice block is not rendered there).
            msg.transportProfile = gsState.transportProfile;
            // Set 063 S2 (spec D1) → scoped by Set 081 S1: on Full,
            // Build is blocked until the budget validates (required
            // amount; $0 additionally needs the zero-rule pick) — but
            // ONLY while the budget block is live (the Direct-API
            // sub-option selected). Under the Copilot seat the block
            // is not rendered and Build posts no budget riders — a
            // hidden input must never trip Build validation.
            // Lightweight never renders the input either.
            if (gsState.transportProfile !== "copilot-cli") {
              var check = gsHtml.validateBudgetControls(gsState);
              if (!check.ok) {
                showBudgetError(check.error);
                return; // button stays enabled; the operator fixes and retries
              }
              msg.budgetUsd = check.budgetUsd;
              if (check.budgetUsd === 0) msg.zeroBudgetMethod = check.zeroMethod;
            }
          } else {
            // Set 077 S3 (Feature 2): the verification-mode pick rides
            // the Lightweight build so the scaffold seeds the durable
            // marker + generated docs with the operator's choice. Full
            // posts no mode rider (the field is inert on Full).
            msg.verificationMode = gsState.verificationMode;
          }
        }
        if (action === "build-session-sets") {
          msg.parallel = gsState.parallel;
          // Set 060 S4: the tier radio also rides build-session-sets so
          // the copied decomposition prompt steers the planner to the
          // operator's tier. Set 077 S3: on Lightweight the
          // verification-mode pick rides too, so the decomposition
          // prompt's exemplar declares the operator's mode.
          msg.tier = gsState.tier;
          if (gsState.tier === "lightweight") {
            msg.verificationMode = gsState.verificationMode;
          }
        }
        btn.disabled = true;
        vscode.postMessage(msg);
      });
    });
  }

  // D6 note (Set 060 S3 → Set 063 S2 → Set 092 S2): the provider-key
  // fault now renders in the System Status strip; its visibility is
  // computed in renderSystemStatus from the tier / seat-profile
  // controls. Tier and profile radio changes re-render the surface
  // (see the listeners above), so no standalone visibility-flip helper
  // remains.

  // D7 (Set 060 S3): show the worktree note only while the parallel
  // checkbox is checked.
  function syncWorktreeNote() {
    var note = root.querySelector('[data-gs-note="worktree"]');
    if (!note) return;
    note.hidden = !gsState.parallel;
  }

  // Set 063 S2 (spec D1): the nested $0 zero-rule pair shows only
  // while the parsed value is exactly 0. Pure visibility flip on input
  // events (re-rendering per keystroke would drop input focus). The
  // block itself is omitted from the Lightweight render entirely, so
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

  function moduleWarningText(warning) {
    if (!warning) return "";
    if (warning.code === "undeclared-slug") {
      return 'Module "' + warning.rawSlug + '" is not declared in docs/modules.yaml.';
    }
    if (warning.code === "manifest-invalid") {
      return "docs/modules.yaml is invalid; showing recoverable work groups.";
    }
    if (warning.code === "manifest-missing") {
      return "docs/modules.yaml is missing; work remains visible under fallback groups.";
    }
    return "Some session sets are not assigned to a declared module.";
  }

  // One collapsible module node of the sole 3-level tree dialect. The
  // module is
  // a `role="treeitem"` carrying aria-level="1" + aria-expanded, its
  // children live in a nested `role="group"`, and the node is
  // keyboard-focusable/operable (roving tabindex; Enter/Space toggle;
  // ArrowLeft/Right collapse/expand — see the root keydown handler).
  // aria-labelledby points at the header (the chevron is aria-hidden)
  // so the accessible name is the module title, not the concatenated
  // descendant text.
  function renderModule(mod) {
    const slug = mod.slug;
    const kind = mod.kind || (slug ? "declared" : "pseudo");
    const label = mod.title || mod.slug || "Default";
    const moduleKey = kind + "-" + (slug || "default");
    const expanded = moduleCollapsed[moduleKey] !== false;
    const chevronGlyph = expanded ? "▾" : "▸";
    const headerId = "module-" + moduleKey;
    const warningText = moduleWarningText(mod.warning);
    const warning = warningText
      ? '<span class="module-warning" title="' + escAttr(warningText) +
          '" aria-label="' + escAttr(warningText) + '">!</span>'
      : "";
    const moduleClasses = "module module-" + kind +
      (kind === "pseudo" && label === "Default" ? " module-default" : "");
    // Set 093 S1 (verdict amendment 4): every module ALWAYS renders two
    // persistent semantic child nodes — `Plan` and `Session sets` — at
    // aria-level 2. The status buckets nest UNDER the `Session sets` node
    // (level 3, rows level 4) and never replace the checklist; a module
    // with no sets still shows both children with their empty/blocked
    // states. Children are semantic treeitems only — state text, no
    // embedded controls (WAI-ARIA tree keyboard semantics, amendment 1).
    const children =
      renderPlanNode(mod, moduleKey) + renderSessionSetsNode(mod, moduleKey);
    return (
      '<div role="treeitem" tabindex="-1" aria-level="1"' +
        ' aria-selected="false" aria-expanded="' + (expanded ? "true" : "false") + '"' +
        ' aria-labelledby="' + escAttr(headerId) + '" class="' + moduleClasses + '"' +
        ' data-module-key="' + escAttr(moduleKey) + '"' +
        ' data-module-kind="' + escAttr(kind) + '"' +
        ' data-testid="module-' + escAttr(moduleKey) + '">' +
        '<div id="' + escAttr(headerId) + '" class="module-header" data-collapsible="true">' +
          '<span class="module-chevron" aria-hidden="true">' + chevronGlyph + '</span>' +
          '<span class="module-title">' + escHtml(label) + '</span>' +
          warning +
        '</div>' +
        '<div class="module-body" role="group">' + children + '</div>' +
      '</div>'
    );
  }

  // Set 093 S1: the persistent `Plan` child node — a semantic LEAF
  // treeitem at aria-level 2 (one of two fixed siblings, aria-setsize=2).
  // State ("present" / "missing") is derived host-side from the module's
  // planPath existence; a fallback group has no planPath and is always
  // "missing". No embedded controls — the accessible name is
  // "Plan <state>" via aria-labelledby (amendment 1: children are
  // purely semantic; the Set 093 S2 action strip owns Open/Import Plan).
  function renderPlanNode(mod, moduleKey) {
    const state = mod.plan === "present" ? "present" : "missing";
    const headerId = "plan-" + moduleKey;
    return (
      '<div role="treeitem" tabindex="-1" aria-level="2"' +
        ' aria-setsize="2" aria-posinset="1" aria-selected="false"' +
        ' aria-labelledby="' + escAttr(headerId) + '"' +
        ' class="module-child module-plan module-plan-' + escAttr(state) + '"' +
        ' data-module-child="plan" data-plan-state="' + escAttr(state) + '"' +
        ' data-testid="module-' + escAttr(moduleKey) + '-plan">' +
        '<div id="' + escAttr(headerId) + '" class="child-header">' +
          '<span class="child-chevron" aria-hidden="true"></span>' +
          '<span class="child-label">Plan</span>' +
          '<span class="child-state">' + escHtml(state) + '</span>' +
        '</div>' +
      '</div>'
    );
  }

  // Set 093 S1: the persistent `Session sets` child node at aria-level 2.
  // When "bucketed" it is an EXPANDABLE treeitem whose nested group holds
  // the status buckets (level 3, rows level 4) — buckets nest here, never
  // replacing the checklist. When "empty" or "blocked-until-plan" it is a
  // semantic LEAF stating that (still visible forever). Collapse state
  // rides the shared bucketCollapsed map under a "<module>/sessionsets"
  // key so toggleCollapsible handles it with no new wiring.
  function sessionSetsStateText(state) {
    if (state === "empty") return "empty";
    if (state === "blocked-until-plan") return "blocked — add a plan first";
    return "";
  }
  function renderSessionSetsNode(mod, moduleKey) {
    // NEVER HIDE WORK (verdict posture; Round 3 Major fix): if any bucket
    // actually carries rows, render "bucketed" REGARDLESS of the state
    // field — a type-valid legacy/pre-093 payload (or the test-only
    // buildModulePayloads) can omit `sessionSets` while still carrying
    // rows, and degrading that to a leaf would silently drop existing
    // session sets from the tree. The field only decides the empty vs
    // blocked-until-plan distinction, and only when there is nothing to
    // show. In the shipping path (buildVisibleModulePayloads) the field
    // and the row count always agree, so this is a pure robustness guard.
    const hasRows = (mod.buckets || []).some(function (b) {
      return (
        b &&
        (b.count > 0 || (Array.isArray(b.rows) && b.rows.length > 0))
      );
    });
    const state = mod.sessionSets === "bucketed" || hasRows
      ? "bucketed"
      : mod.sessionSets === "empty"
        ? "empty"
        : "blocked-until-plan";
    const headerId = "sessionsets-" + moduleKey;
    const common =
      ' aria-setsize="2" aria-posinset="2" aria-selected="false"' +
      ' aria-labelledby="' + escAttr(headerId) + '"' +
      ' data-module-child="session-sets"' +
      ' data-session-sets-state="' + escAttr(state) + '"' +
      ' data-testid="module-' + escAttr(moduleKey) + '-session-sets"';
    if (state !== "bucketed") {
      // Leaf node — no aria-expanded (APG end node), state said out loud.
      return (
        '<div role="treeitem" tabindex="-1" aria-level="2"' + common +
          ' class="module-child module-session-sets module-session-sets-' + escAttr(state) + '">' +
          '<div id="' + escAttr(headerId) + '" class="child-header">' +
            '<span class="child-chevron" aria-hidden="true"></span>' +
            '<span class="child-label">Session sets</span>' +
            '<span class="child-state">' + escHtml(sessionSetsStateText(state)) + '</span>' +
          '</div>' +
        '</div>'
      );
    }
    const collapseKey = moduleKey + "/sessionsets";
    const expanded = bucketCollapsed[collapseKey] !== false;
    const chevronGlyph = expanded ? "▾" : "▸";
    const buckets = (mod.buckets || [])
      .map(function (bucket) { return renderBucket(bucket, moduleKey); })
      .join("");
    return (
      '<div role="treeitem" tabindex="-1" aria-level="2"' + common +
        ' aria-expanded="' + (expanded ? "true" : "false") + '"' +
        ' class="module-child module-session-sets module-session-sets-bucketed"' +
        ' data-bucket-key="' + escAttr(collapseKey) + '">' +
        '<div id="' + escAttr(headerId) + '" class="child-header" data-collapsible="true">' +
          '<span class="child-chevron" aria-hidden="true">' + chevronGlyph + '</span>' +
          '<span class="child-label">Session sets</span>' +
        '</div>' +
        '<div class="child-body" role="group">' + buckets + '</div>' +
      '</div>'
    );
  }

  // Set 093 S1: the bucket is a `role="treeitem"` at aria-level="3" now
  // (module 1 / Plan & Session sets 2 / bucket 3 / row 4 — the persistent
  // child nodes inserted a level). aria-expanded on the treeitem when it
  // has rows; an empty bucket is a leaf node with no aria-expanded, per
  // the APG. Children in a nested `role="group"`, composite
  // "<module>/<key>" collapse key, rows at aria-level 4. Buckets nest
  // UNDER the module's `Session sets` child node (never replacing it).
  function renderBucket(bucket, moduleKey) {
    const labelText = bucket.label + "  (" + bucket.count + ")";
    const idSuffix = moduleKey + "-" + bucket.key;
    const groupId = "group-" + idSuffix;
    const collapseKey = moduleKey + "/" + bucket.key;
    if (bucket.count === 0) {
      // Leaf tree node: no children, no aria-expanded (APG end node).
      return (
        '<div role="treeitem" tabindex="-1" aria-level="3"' +
          ' aria-selected="false" aria-labelledby="' + escAttr(groupId) + '"' +
          ' class="bucket bucket-empty" data-testid="bucket-' + escAttr(idSuffix) + '">' +
          '<div id="' + escAttr(groupId) + '" class="bucket-header">' +
            '<span class="bucket-chevron" aria-hidden="true"></span>' +
            '<span>' + escHtml(labelText) + '</span>' +
          '</div>' +
        '</div>'
      );
    }
    // Set 034: bucket-level collapse. Default expanded; respect
    // manual operator toggles via `bucketCollapsed[collapseKey] === false`.
    const expanded = bucketCollapsed[collapseKey] !== false;
    const chevronGlyph = expanded ? "▾" : "▸";
    const rows = bucket.rows
      .map(function (row) { return renderRow(row, 4); })
      .join("");
    return (
      '<div role="treeitem" tabindex="-1" aria-level="3"' +
        ' aria-selected="false" aria-expanded="' + (expanded ? "true" : "false") + '"' +
        ' aria-labelledby="' + escAttr(groupId) + '" class="bucket"' +
        ' data-bucket-key="' + escAttr(collapseKey) + '"' +
        ' data-testid="bucket-' + escAttr(idSuffix) + '">' +
        '<div id="' + escAttr(groupId) + '" class="bucket-header" data-collapsible="true">' +
          '<span class="bucket-chevron" aria-hidden="true">' + chevronGlyph + '</span>' +
          '<span>' + escHtml(labelText) + '</span>' +
        '</div>' +
        '<div class="bucket-body" role="group">' + rows + '</div>' +
      '</div>'
    );
  }

  // Set 093 Session 1: rows render at aria-level 4 — the persistent
  // `Plan` / `Session sets` child nodes inserted a level (module 1 /
  // Plan & Session sets 2 / bucket 3 / row 4). `ariaLevel` is threaded
  // from renderBucket so the contract stays single-sourced.
  function renderRow(row, ariaLevel) {
    // Set 034: row layout simplified. Per-row chevron + state-badge
    // icon retired; the bold color-coded `row.fraction` is the
    // right-aligned list-icon on the LEFT (fixed-width column). The
    // per-row orchestrator-tracking accordion is also retired (gauges
    // + model description + smart CTA all gone). Rows are never
    // expandable in this view — `accordionHtml` is always null from
    // the host.
    //
    // Set 049 S4 (rip-out): the Set 045 harvested-signal badges and
    // coordination-conflict pills are gone — the row layout reverts
    // to name + fraction + description only.
    const fractionCls = "row-fraction row-fraction-" + escAttr(row.state);
    const descSpan = row.description
      ? '<span class="row-description">' + escHtml(row.description) + '</span>'
      : "";
    // Set 050 S4: unobtrusive schema-drift marker. A single asterisk
    // after the row name, carrying the "Ran under schema v<N>" tooltip
    // as its title attribute. Replaces the old intrusive
    // "(needs migration)" description label. Empty marker → no span.
    const migrationSpan = row.migrationMarker
      ? '<span class="row-migration-marker" title="' +
          escAttr(row.migrationTooltip || "") + '" aria-label="' +
          escAttr(row.migrationTooltip || "") + '">' +
          escHtml(row.migrationMarker) + '</span>'
      : "";
    // Set 061 S1 (D2): quiet "lw" tier marker on Lightweight rows —
    // same unobtrusive pattern as the Set 050 migration asterisk.
    // Empty marker → no span (Full rows stay unmarked).
    const tierSpan = row.tierMarker
      ? '<span class="row-tier-marker" title="' +
          escAttr(row.tierTooltip || "") + '" aria-label="' +
          escAttr(row.tierTooltip || "") + '">' +
          escHtml(row.tierMarker) + '</span>'
      : "";
    // Set 061 S2 (D3): quiet blocked-by-prerequisites marker — the
    // tooltip names each unsatisfied prerequisite and its current
    // state. Replaces the old all-caps blocked-by-prereqs description
    // badge. Empty marker → no span (unblocked + terminal stay quiet).
    const blockedSpan = row.blockedMarker
      ? '<span class="row-blocked-marker" title="' +
          escAttr(row.blockedTooltip || "") + '" aria-label="' +
          escAttr(row.blockedTooltip || "") + '">' +
          escHtml(row.blockedMarker) + '</span>'
      : "";
    // Set 062 S1 (D1): quiet verification-posture marker ("v?" / "v+")
    // — same quiet treatment as the markers above, but clickable: a
    // click posts the existing showRowContextMenu message (see
    // wireInteraction), opening the same QuickPick the row's
    // right-click opens. role=button + tabindex so the affordance is
    // keyboard-reachable; the click never mutates state. Empty marker
    // → no span (Full / terminal / note-bearing / verified rows stay
    // quiet — absence is the signal).
    const verificationSpan = row.verificationMarker
      ? '<span class="row-verification-marker" role="button" tabindex="0" title="' +
          escAttr(row.verificationTooltip || "") + '" aria-label="' +
          escAttr(row.verificationTooltip || "") + '">' +
          escHtml(row.verificationMarker) + '</span>'
      : "";
      const duplicateNameSpan = row.duplicateNameBadge
        ? '<span class="row-duplicate-name-marker" title="' +
          escAttr(row.duplicateNameTooltip || "") + '" aria-label="' +
          escAttr(row.duplicateNameTooltip || "") + '">' +
          escHtml(row.duplicateNameBadge) + '</span>'
        : "";
    // Set 061 S1 (D1): when the fraction carries the `+` suffix, the
    // host ships a tooltip explaining why the denominator can grow.
    // It rides the fraction span's title attribute; the marker stays
    // aria-hidden (the tooltip duplicates, not replaces, the signal).
    const fractionTitle = row.fractionTooltip
      ? ' title="' + escAttr(row.fractionTooltip) + '"'
      : "";
    return (
      '<div role="treeitem" tabindex="-1" aria-level="' + (ariaLevel || 2) + '"' +
      ' aria-selected="false" data-slug="' + escAttr(row.slug) + '"' +
      ' data-testid="session-set-' + escAttr(row.slug) + '"' +
      ' data-state="' + escAttr(row.state) + '"' +
      ' data-context-value="' + escAttr(row.contextValue) + '"' +
      ' class="row row-' + escAttr(row.state) + '">' +
        '<div class="row-header" role="presentation">' +
          '<span class="' + fractionCls + '" aria-hidden="true"' + fractionTitle + '>' + escHtml(row.fraction || "") + '</span>' +
          '<span class="row-text">' +
            '<span class="row-name">' + escHtml(row.name) + '</span>' +
            tierSpan +
            migrationSpan +
            blockedSpan +
            verificationSpan +
            duplicateNameSpan +
            descSpan +
          '</span>' +
        '</div>' +
      '</div>'
    );
  }


  function isSuppressedForRow(row) {
    // Set 033 Session 2: row payload now carries `accordionUpdatedAt`
    // (orchestrator.lastActivityAt). A row is suppressed iff the
    // host's suppression record for the slug exactly matches the
    // current accordion's updatedAt. New orchestrator activity bumps
    // lastActivityAt, the key mismatches, and the row auto-expands
    // on the next paint without the operator having to intervene.
    if (!row.accordionUpdatedAt) return false;
    return suppressed[row.slug] === row.accordionUpdatedAt;
  }

  // ----- Roving tabindex + kbd nav -----
  //
  // Set 087 Session 2 (R2 fix): module and bucket nodes in the
  // multi-module dialect are treeitems now, so the roving tabindex and
  // arrow navigation include them. Navigation walks VISIBLE nodes only
  // — a treeitem inside a collapsed ancestor (aria-expanded="false")
  // is skipped, per the WAI-ARIA tree pattern. In the single-implicit
  // dialect rows remain the only treeitems, so behavior there is
  // unchanged.
  function visibleTreeItems() {
    return Array.from(root.querySelectorAll('[role="treeitem"]')).filter(function (el) {
      let p = el.parentElement;
      while (p && p !== root) {
        if (p.getAttribute("aria-expanded") === "false") return false;
        p = p.parentElement;
      }
      return true;
    });
  }

  function initRovingFocus() {
    const items = Array.from(root.querySelectorAll('[role="treeitem"]'));
    if (items.length === 0) return;
    // The first node owns the single tabstop into the tree.
    items.forEach(function (el, idx) {
      el.setAttribute("tabindex", idx === 0 ? "0" : "-1");
    });
  }

  function focusItem(item) {
    if (!item) return;
    const all = Array.from(root.querySelectorAll('[role="treeitem"]'));
    all.forEach(function (el) {
      el.setAttribute("tabindex", "-1");
      el.setAttribute("aria-selected", "false");
    });
    item.setAttribute("tabindex", "0");
    item.setAttribute("aria-selected", "true");
    item.focus();
  }

  function moveFocus(current, delta) {
    const all = visibleTreeItems();
    const i = all.indexOf(current);
    if (i === -1) return;
    const next = all[Math.min(all.length - 1, Math.max(0, i + delta))];
    focusItem(next);
  }

  function focusFirst() {
    const all = visibleTreeItems();
    if (all.length) focusItem(all[0]);
  }
  function focusLast() {
    const all = visibleTreeItems();
    if (all.length) focusItem(all[all.length - 1]);
  }

  // Set 087 Session 2 (R2 fix): one collapse/expand toggler for module
  // and bucket nodes, shared by header clicks (both dialects) and the
  // keyboard handlers (multi-module dialect, where the node itself is
  // the treeitem). `nodeEl` is the element carrying aria-expanded — a
  // treeitem in the multi-module dialect, the role="group" wrapper in
  // the byte-identical single-implicit dialect.
  function toggleCollapsible(nodeEl, forceExpanded) {
    if (!nodeEl || !nodeEl.hasAttribute("aria-expanded")) return;
    const wasExpanded = nodeEl.getAttribute("aria-expanded") === "true";
    const next = typeof forceExpanded === "boolean" ? forceExpanded : !wasExpanded;
    if (next === wasExpanded) return;
    nodeEl.setAttribute("aria-expanded", next ? "true" : "false");
    // The first chevron in document order is the node's OWN header chevron
    // (its header precedes its nested body): module → .module-chevron,
    // Session sets → .child-chevron, bucket → .bucket-chevron.
    const chev = nodeEl.querySelector(
      ".module-chevron, .child-chevron, .bucket-chevron",
    );
    if (chev) chev.textContent = next ? "▾" : "▸";
    const moduleKey = nodeEl.getAttribute("data-module-key");
    const bucketKey = nodeEl.getAttribute("data-bucket-key");
    if (moduleKey !== null) moduleCollapsed[moduleKey] = next;
    else if (bucketKey) bucketCollapsed[bucketKey] = next;
  }

  function toggleRow(item, expand) {
    const slug = item.getAttribute("data-slug");
    const isExpandable = item.getAttribute("data-expandable") === "1";
    if (!slug || !isExpandable) return;
    const desired =
      typeof expand === "boolean"
        ? expand
        : item.getAttribute("aria-expanded") !== "true";
    manualToggles[slug] = desired;
    const accordionUpdatedAt = item.getAttribute("data-accordion-updated-at") || null;
    vscode.postMessage({
      type: "toggleRow",
      slug: slug,
      expanded: desired,
      accordionUpdatedAt: accordionUpdatedAt,
    });
    render();
    // Re-focus the same row after re-render.
    const refreshed = root.querySelector('[data-slug="' + cssEscape(slug) + '"]');
    if (refreshed) focusItem(refreshed);
  }

  // ----- Interaction wiring (after each render) -----
  function wireInteraction() {
    // Set 087 Session 2 (R2 fix): module + bucket collapse share one
    // toggler. In the multi-module dialect the header's parent is the
    // treeitem (which also takes focus on click, per the tree
    // pattern); in the single-implicit dialect it is the pre-087
    // role="group" wrapper — toggleCollapsible handles both, keyed by
    // whichever of data-module-key / data-bucket-key the node carries.
    Array.from(
      root.querySelectorAll(
        '.module-header[data-collapsible="true"], .child-header[data-collapsible="true"], .bucket-header[data-collapsible="true"]',
      ),
    ).forEach(function (header) {
      header.addEventListener("click", function (ev) {
        ev.stopPropagation();
        const nodeEl = header.parentElement;
        if (!nodeEl) return;
        if (nodeEl.getAttribute("role") === "treeitem") focusItem(nodeEl);
        toggleCollapsible(nodeEl);
      });
    });

    // Set 034: per-row chevron retired, accordion retired. Click on
    // the row header activates (default = openSpec). No expand/
    // collapse toggle path because there's nothing to expand.
    Array.from(root.querySelectorAll('.row-header')).forEach(function (header) {
      header.addEventListener("click", function (ev) {
        const item = ev.currentTarget.closest('[role="treeitem"]');
        if (!item) return;
        focusItem(item);
        const slug = item.getAttribute("data-slug");
        if (slug) {
          vscode.postMessage({ type: "activateRow", slug: slug });
        }
      });
    });

    // Set 062 S1 (D1): the verification-posture marker is an action
    // surface — click (or Enter/Space, via the keydown handler below)
    // opens the SAME row QuickPick the right-click opens. It posts the
    // existing showRowContextMenu message; no new mutation path.
    // stopPropagation keeps the row-header activation (openSpec) from
    // also firing.
    Array.from(root.querySelectorAll(".row-verification-marker")).forEach(function (marker) {
      function openMenu(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        const item = marker.closest('[role="treeitem"]');
        if (!item) return;
        focusItem(item);
        const slug = item.getAttribute("data-slug");
        if (slug) {
          vscode.postMessage({ type: "showRowContextMenu", slug: slug });
        }
      }
      marker.addEventListener("click", openMenu);
      marker.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") openMenu(ev);
      });
    });

    // Right-click → context menu. Set 034: capture cursor position
    // so the cursor-anchored popup (rendered when host responds with
    // showQuickPick lives in the extension host and opens centered
    // on the VS Code window — no cursor position to capture.
    Array.from(root.querySelectorAll('[role="treeitem"]')).forEach(function (item) {
      item.addEventListener("contextmenu", function (ev) {
        // Set 087 S2 (R2 fix): treeitems nest now (module ⊃ bucket ⊃
        // row), so a bubbled event must only be handled by the
        // INNERMOST treeitem — otherwise the ancestors' handlers would
        // re-focus the module after the row already took focus.
        if (ev.target.closest('[role="treeitem"]') !== item) return;
        ev.preventDefault();
        focusItem(item);
        const slug = item.getAttribute("data-slug");
        if (slug) {
          vscode.postMessage({ type: "showRowContextMenu", slug: slug });
        }
      });
    });

    // Buttons inside accordion / banner with data-command. Optional
    // data-command-args is a JSON-encoded array of args appended to
    // the executeCommand call (Session 5 — used by the smart CTA to
    // pass `prefillProvider` to dabbler.checkOutOrchestrator).
    Array.from(root.querySelectorAll('[data-command]')).forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        const commandId = btn.getAttribute("data-command");
        if (!commandId) return;
        const argsAttr = btn.getAttribute("data-command-args");
        let args;
        if (argsAttr) {
          try {
            const parsed = JSON.parse(argsAttr);
            args = Array.isArray(parsed) ? parsed : undefined;
          } catch (_e) {
            args = undefined;
          }
        }
        vscode.postMessage({
          type: "executeCommand",
          commandId: commandId,
          args: args,
        });
      });
    });
  }

  // Root-level keydown — captures keys regardless of which node has
  // focus. Implements the WAI-ARIA single-select tree pattern. Set 087
  // S2 (R2 fix): module/bucket nodes are expandable treeitems in the
  // multi-module dialect — Enter/Space toggles them, ArrowRight expands
  // (or steps into the first child), ArrowLeft collapses (or steps to
  // the parent treeitem). Rows keep their pre-087 behavior: Enter/Space
  // activates, ArrowRight/Left stay consumed no-ops in the
  // single-implicit dialect (no parent treeitem exists there).
  document.addEventListener("keydown", function (ev) {
    const item = ev.target.closest && ev.target.closest('[role="treeitem"]');
    if (!item) return;
    const expandable = item.hasAttribute("aria-expanded");
    switch (ev.key) {
      case "ArrowDown":
        ev.preventDefault();
        moveFocus(item, 1);
        return;
      case "ArrowUp":
        ev.preventDefault();
        moveFocus(item, -1);
        return;
      case "Home":
        ev.preventDefault();
        focusFirst();
        return;
      case "End":
        ev.preventDefault();
        focusLast();
        return;
      case "ArrowRight":
        ev.preventDefault();
        if (expandable) {
          if (item.getAttribute("aria-expanded") === "false") {
            toggleCollapsible(item, true);
          } else {
            // Already open → focus the first child treeitem.
            const firstChild = item.querySelector('[role="treeitem"]');
            if (firstChild) focusItem(firstChild);
          }
        }
        return;
      case "ArrowLeft":
        ev.preventDefault();
        if (expandable && item.getAttribute("aria-expanded") === "true") {
          toggleCollapsible(item, false);
          return;
        }
        {
          // Closed node or leaf → focus the parent treeitem (rows in
          // the single-implicit dialect have none; key stays consumed).
          const parent = item.parentElement &&
            item.parentElement.closest('[role="treeitem"]');
          if (parent) focusItem(parent);
        }
        return;
      case "Enter":
      case " ":
        ev.preventDefault();
        {
          const slug = item.getAttribute("data-slug");
          if (slug) {
            vscode.postMessage({ type: "activateRow", slug: slug });
          } else if (expandable) {
            toggleCollapsible(item);
          }
        }
        return;
      case "F10":
        if (ev.shiftKey) {
          ev.preventDefault();
          const s = item.getAttribute("data-slug");
          if (s) vscode.postMessage({ type: "showRowContextMenu", slug: s });
        }
        return;
      case "ContextMenu":
        ev.preventDefault();
        const slugCm = item.getAttribute("data-slug");
        if (slugCm) vscode.postMessage({ type: "showRowContextMenu", slug: slugCm });
        return;
    }
  });

  // Minimal CSS.escape polyfill for attribute-selector use.
  function cssEscape(s) {
    if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, function (c) {
      return "\\" + c.charCodeAt(0).toString(16) + " ";
    });
  }

  // Handshake: tell host we're ready for the first snapshot.
  vscode.postMessage({ type: "ready" });
})();
