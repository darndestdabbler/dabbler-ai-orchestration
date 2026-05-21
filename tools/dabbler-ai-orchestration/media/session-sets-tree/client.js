// Webview-side client for the Set 029 Session 4 custom Session Sets
// view. Owns: ARIA tree rendering (roving tabindex), keyboard nav,
// contextmenu / Shift+F10 / Context Menu key dispatch, manual expand/
// collapse, postMessage protocol with monotonic-version drop per
// S4 audit GPT-5.4 M3.
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
  // Set 034: cursor-anchored context menu state. The contextmenu
  // event captures the cursor position; when the host responds with
  // `renderContextMenu`, the popup is painted at that position. One
  // popup element is appended to the body lazily on first use.
  let lastContextMenuPos = { x: 0, y: 0 };
  let contextMenuEl = null;

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
      case "renderContextMenu":
        // Set 034: cursor-anchored context menu. Host computed
        // applicable actions from ActionRegistry; paint the popup at
        // the cursor position we captured on the contextmenu event.
        showCursorContextMenu(msg.slug, msg.items || []);
        return;
    }
  });

  // ----- Cursor-anchored context menu (Set 034) -----
  function ensureContextMenuEl() {
    if (contextMenuEl) return contextMenuEl;
    contextMenuEl = document.createElement("div");
    contextMenuEl.className = "context-menu";
    document.body.appendChild(contextMenuEl);
    return contextMenuEl;
  }
  function hideContextMenu() {
    if (contextMenuEl) {
      contextMenuEl.classList.remove("is-open");
      contextMenuEl.innerHTML = "";
    }
  }
  function showCursorContextMenu(slug, items) {
    if (!items || items.length === 0) return;
    const menu = ensureContextMenuEl();
    let html = "";
    let lastBand = -1;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      // Group-band separators are implicit in ActionRegistry's group
      // numbering (100s = open, 200s = navigate, 300s = copy command,
      // 400s = copy meta, 800s = migrate, 900s = lifecycle). The host
      // ships items pre-sorted; insert separators on band transitions.
      // We can't know the band from {label, commandId} alone, so derive
      // by commandId prefix as a best-effort.
      const band = bandForCommandId(it.commandId);
      if (lastBand !== -1 && band !== lastBand) {
        html += '<div class="context-menu-separator"></div>';
      }
      lastBand = band;
      html +=
        '<div class="context-menu-item" data-command="' + escAttr(it.commandId) +
        '" data-slug="' + escAttr(slug) + '">' + escHtml(it.label) + '</div>';
    }
    menu.innerHTML = html;
    menu.style.left = lastContextMenuPos.x + "px";
    menu.style.top = lastContextMenuPos.y + "px";
    menu.classList.add("is-open");
    // Flip if overflowing the viewport's right or bottom edge.
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth - 4) {
      menu.style.left = Math.max(4, lastContextMenuPos.x - rect.width) + "px";
    }
    if (rect.bottom > window.innerHeight - 4) {
      menu.style.top = Math.max(4, lastContextMenuPos.y - rect.height) + "px";
    }
  }
  function bandForCommandId(id) {
    if (id.indexOf("open") >= 0 || id.indexOf("revealPlaywright") >= 0) return 1;
    if (id.indexOf("openFolder") >= 0) return 2;
    if (id.indexOf("copyStartCommand") >= 0) return 3;
    if (id.indexOf("copySlug") >= 0) return 4;
    if (id.indexOf("migrate") >= 0) return 8;
    if (id.indexOf("cancel") >= 0 || id.indexOf("restore") >= 0) return 9;
    return 0;
  }
  // Clicks on menu items dispatch to the host; clicks elsewhere close.
  document.addEventListener("click", function (ev) {
    if (!contextMenuEl || !contextMenuEl.classList.contains("is-open")) return;
    const item = ev.target.closest(".context-menu-item");
    if (item && contextMenuEl.contains(item)) {
      const commandId = item.getAttribute("data-command");
      const slug = item.getAttribute("data-slug");
      if (commandId && slug) {
        vscode.postMessage({ type: "executeRowCommand", slug: slug, commandId: commandId });
      }
      hideContextMenu();
      return;
    }
    hideContextMenu();
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && contextMenuEl && contextMenuEl.classList.contains("is-open")) {
      hideContextMenu();
    }
  });
  // Close on resize / scroll so the menu doesn't float untethered.
  window.addEventListener("resize", hideContextMenu);
  window.addEventListener("scroll", hideContextMenu, true);

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
    if (!lastSnapshot.hasAnySets) {
      // viewsWelcome equivalent — render the welcome HTML provided
      // by the host (it parses package.json viewsWelcome contents).
      // welcomeHtml is host-escaped via the renderWelcomeMarkdown
      // pipeline, safe to insert.
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
    const fractionCls = "row-fraction row-fraction-" + escAttr(row.state);
    const descSpan = row.description
      ? '<span class="row-description">' + escHtml(row.description) + '</span>'
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
    // `renderContextMenu`) appears AT the cursor instead of at the
    // top of the window.
    Array.from(root.querySelectorAll('[role="treeitem"]')).forEach(function (item) {
      item.addEventListener("contextmenu", function (ev) {
        ev.preventDefault();
        focusItem(item);
        const slug = item.getAttribute("data-slug");
        if (slug) {
          lastContextMenuPos = { x: ev.clientX, y: ev.clientY };
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
