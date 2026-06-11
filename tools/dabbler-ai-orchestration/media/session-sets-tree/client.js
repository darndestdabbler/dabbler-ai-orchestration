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
  // Set 034: bucket-level collapse state. Keyed by bucket.key
  // ("in-progress" / "not-started" / "complete" / "cancelled");
  // value true = expanded, false = collapsed. Persists across
  // re-renders for the session so a watcher tick doesn't snap a
  // user-collapsed bucket back open.
  const bucketCollapsed = {};
  // Set 060 Session 2: the Getting Started form's control state. Kept
  // here (like bucketCollapsed) so a snapshot re-render — which happens
  // after every action and on every watcher tick — doesn't snap the
  // tier radio back to Full or untick the parallel checkbox.
  const gsState = { tier: "full", parallel: false };

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
    var gs = lastSnapshot.gettingStarted;
    if (gs && gs.mode !== "list") {
      root.innerHTML =
        gs.mode === "no-folder"
          ? renderNoFolder()
          : renderGettingStarted(gs);
      wireGettingStarted();
      return;
    }
    if (!gs && !lastSnapshot.hasAnySets) {
      // Backward-compat fallback for a pre-Set-060 host that did not
      // ship `gettingStarted`: render the welcome HTML (host-escaped via
      // renderWelcomeMarkdown, safe to insert).
      root.innerHTML = '<div class="welcome">' + lastSnapshot.welcomeHtml + '</div>';
      return;
    }

    const parts = [];
    // Set 033 Session 2: ambiguity banner retired. Multi-in-progress
    // is the supported case — every in-progress row carries its own
    // accordion below.
    parts.push('<div role="tree" aria-label="Session Sets" class="tree">');
    for (const bucket of lastSnapshot.buckets) {
      parts.push(renderBucket(bucket));
    }
    parts.push('</div>');
    root.innerHTML = parts.join("");

    wireInteraction();
    initRovingFocus();
  }

  // ----- Set 060 dual-mode Getting Started surfaces -----

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
  // flag is set (gs.structureBuilt / gs.planPresent /
  // gs.sessionSetsPresent). Live state lives ONLY here (D2).
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

  function renderGettingStarted(gs) {
    // Control state (tier radio / parallel checkbox) comes from gsState
    // so re-renders keep the operator's picks (Set 060 S2).
    var fullChecked = gsState.tier === "lightweight" ? "" : " checked";
    var lightChecked = gsState.tier === "lightweight" ? " checked" : "";
    var parallelChecked = gsState.parallel ? " checked" : "";
    var step1 = gsStep(
      1,
      "Build project structure",
      gs.structureBuilt,
      '<div class="gs-radio-group" role="radiogroup" aria-label="Project tier">' +
        '<label class="gs-radio"><input type="radio" name="gs-tier" value="full"' + fullChecked + '> Full</label>' +
        '<label class="gs-radio"><input type="radio" name="gs-tier" value="lightweight"' + lightChecked + '> Lightweight</label>' +
      '</div>' +
      '<button class="gs-button" type="button" data-gs-action="build-structure">' +
        'Build project structure' +
      '</button>',
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
      '</label>',
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

  // Set 060 Session 2: wire the Getting Started surfaces. Buttons post a
  // typed `gettingStartedAction` message carrying the relevant form
  // state (tier for build-structure, parallel for build-session-sets);
  // the clicked button disables until the host's post-action snapshot
  // re-renders the surface (double-click guard). Radio / checkbox
  // changes only update gsState — no host round-trip.
  function wireGettingStarted() {
    Array.from(root.querySelectorAll('input[name="gs-tier"]')).forEach(function (input) {
      input.addEventListener("change", function () {
        if (input.checked) gsState.tier = input.value === "lightweight" ? "lightweight" : "full";
      });
    });
    Array.from(root.querySelectorAll('input[name="gs-parallel"]')).forEach(function (input) {
      input.addEventListener("change", function () {
        gsState.parallel = !!input.checked;
      });
    });
    Array.from(root.querySelectorAll("[data-gs-action]")).forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var action = btn.getAttribute("data-gs-action");
        if (!action) return;
        var msg = { type: "gettingStartedAction", action: action };
        if (action === "build-structure") msg.tier = gsState.tier;
        if (action === "build-session-sets") msg.parallel = gsState.parallel;
        btn.disabled = true;
        vscode.postMessage(msg);
      });
    });
  }

  function renderBucket(bucket) {
    const labelText = bucket.label + "  (" + bucket.count + ")";
    const groupId = "group-" + bucket.key;
    const bodyId = "body-" + bucket.key;
    if (bucket.count === 0) {
      return (
        '<div role="group" aria-labelledby="' + groupId + '" class="bucket bucket-empty">' +
          '<div id="' + groupId + '" class="bucket-header">' +
            '<span class="bucket-chevron" aria-hidden="true"></span>' +
            '<span>' + escHtml(labelText) + '</span>' +
          '</div>' +
        '</div>'
      );
    }
    // Set 034: bucket-level collapse. Default expanded; respect
    // manual operator toggles via `bucketCollapsed[key] === false`.
    const expanded = bucketCollapsed[bucket.key] !== false;
    const chevronGlyph = expanded ? "▾" : "▸";
    const rows = bucket.rows.map(function (row) { return renderRow(row); }).join("");
    return (
      '<div role="group" aria-labelledby="' + groupId + '" class="bucket"' +
        ' aria-expanded="' + (expanded ? "true" : "false") + '"' +
        ' data-bucket-key="' + escAttr(bucket.key) + '">' +
        '<div id="' + groupId + '" class="bucket-header" data-collapsible="true"' +
        ' aria-controls="' + bodyId + '">' +
          '<span class="bucket-chevron" aria-hidden="true">' + chevronGlyph + '</span>' +
          '<span>' + escHtml(labelText) + '</span>' +
        '</div>' +
        '<div class="bucket-body" id="' + bodyId + '">' + rows + '</div>' +
      '</div>'
    );
  }

  function renderRow(row) {
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
    return (
      '<div role="treeitem" tabindex="-1" aria-level="2"' +
      ' aria-selected="false" data-slug="' + escAttr(row.slug) + '"' +
      ' data-state="' + escAttr(row.state) + '"' +
      ' data-context-value="' + escAttr(row.contextValue) + '"' +
      ' class="row row-' + escAttr(row.state) + '">' +
        '<div class="row-header" role="presentation">' +
          '<span class="' + fractionCls + '" aria-hidden="true">' + escHtml(row.fraction || "") + '</span>' +
          '<span class="row-text">' +
            '<span class="row-name">' + escHtml(row.name) + '</span>' +
            migrationSpan +
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
  function initRovingFocus() {
    const items = Array.from(root.querySelectorAll('[role="treeitem"]'));
    if (items.length === 0) return;
    // The first row owns the single tabstop into the tree.
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
    const all = Array.from(root.querySelectorAll('[role="treeitem"]'));
    const i = all.indexOf(current);
    if (i === -1) return;
    const next = all[Math.min(all.length - 1, Math.max(0, i + delta))];
    focusItem(next);
  }

  function focusFirst() {
    const all = Array.from(root.querySelectorAll('[role="treeitem"]'));
    if (all.length) focusItem(all[0]);
  }
  function focusLast() {
    const all = Array.from(root.querySelectorAll('[role="treeitem"]'));
    if (all.length) focusItem(all[all.length - 1]);
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
    // Set 034: bucket-level collapse. Click on a collapsible
    // bucket-header toggles aria-expanded on the bucket; CSS hides
    // the .bucket-body when aria-expanded="false".
    Array.from(root.querySelectorAll('.bucket-header[data-collapsible="true"]')).forEach(function (header) {
      header.addEventListener("click", function (ev) {
        ev.stopPropagation();
        const bucket = header.parentElement;
        if (!bucket) return;
        const key = bucket.getAttribute("data-bucket-key");
        const wasExpanded = bucket.getAttribute("aria-expanded") === "true";
        const next = !wasExpanded;
        bucket.setAttribute("aria-expanded", next ? "true" : "false");
        const chev = header.querySelector(".bucket-chevron");
        if (chev) chev.textContent = next ? "▾" : "▸";
        if (key) bucketCollapsed[key] = next;
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

    // Right-click → context menu. Set 034: capture cursor position
    // so the cursor-anchored popup (rendered when host responds with
    // showQuickPick lives in the extension host and opens centered
    // on the VS Code window — no cursor position to capture.
    Array.from(root.querySelectorAll('[role="treeitem"]')).forEach(function (item) {
      item.addEventListener("contextmenu", function (ev) {
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

  // Root-level keydown — captures keys regardless of which row has
  // focus. Implements WAI-ARIA single-select tree pattern.
  document.addEventListener("keydown", function (ev) {
    const item = ev.target.closest && ev.target.closest('[role="treeitem"]');
    if (!item) return;
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
      case "ArrowLeft":
        // Set 034: per-row accordion is retired; ArrowRight/Left no
        // longer expand/collapse anything. Keep the keys consumed so
        // they don't bubble to the editor unexpectedly.
        ev.preventDefault();
        return;
      case "Enter":
      case " ":
        ev.preventDefault();
        const slug = item.getAttribute("data-slug");
        if (slug) {
          vscode.postMessage({ type: "activateRow", slug: slug });
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
