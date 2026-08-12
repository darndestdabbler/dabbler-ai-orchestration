// Set 110 Session 2 — parity between the native tree's `contextValue`
// vocabulary and the `package.json` menu contributions that gate on it.
//
// The step-3.5 analyst named this as the session's second risk:
//
//   "an imprecise `when` clause in `package.json` (e.g. `viewItem =~
//    /session/`) could cause actions to appear on incorrect node types."
//
// Care is not a control for that. This is. A declarative `when` clause
// and a computed `contextValue` are two halves of one contract living in
// two files that no compiler relates, which is the same failure shape
// this repo already has a convention for — `project-guidance.md` ->
// Conventions -> Code Style, "a pure-Python validator that mirrors a
// JSON Schema must hold parity in BOTH directions". The same discipline
// applies here, so these tests check both directions:
//
//   forward  — every applicable registry action reaches a menu;
//   backward — every menu entry is reachable by some real row.
//
// Plus the two constraints Session 1 proved with spike evidence and that
// nothing else in the codebase would notice being violated: at most TWO
// inline actions, and every command a menu names must actually exist.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { ROW_ACTIONS, SESSION_ACTIONS } from "../../providers/ActionRegistry";
import { actionToken, tokenMatcher } from "../../providers/workExplorerTreeModel";

const PKG_PATH = path.resolve(__dirname, "..", "..", "..", "package.json");
const VIEW = "dabblerWorkExplorerTree";
const SUBMENU_OPEN = "dabblerWorkExplorer.openFile";
const SUBMENU_COPY = "dabblerWorkExplorer.copyPrompt";

interface MenuEntry {
  command?: string;
  submenu?: string;
  when?: string;
  group?: string;
}

interface Pkg {
  contributes: {
    commands: { command: string; title: string; icon?: string }[];
    submenus?: { id: string; label: string }[];
    views: Record<
      string,
      { id: string; name: string; type?: string; visibility?: string; when?: string }[]
    >;
    menus: Record<string, MenuEntry[]>;
  };
}

const pkg: Pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf-8"));
const menus = pkg.contributes.menus;
const forThisView = (entries: MenuEntry[] | undefined): MenuEntry[] =>
  (entries ?? []).filter((e) => (e.when ?? "").includes(`view == ${VIEW}`));

const nativeItemContext = forThisView(menus["view/item/context"]);
const openFileItems = menus[SUBMENU_OPEN] ?? [];
const copyPromptItems = menus[SUBMENU_COPY] ?? [];
const allNativeEntries = [...nativeItemContext, ...openFileItems, ...copyPromptItems];

suite("Set 110 S3 — the native tree is the shipping Work Explorer", () => {
  // This is the ONE place the shipping identity is asserted. Every Layer 3
  // spec locates the tree pane by the presence of a `.monaco-list` rather
  // than by title, precisely so that none of them quietly re-assert this
  // and none of them had to change in the commit that flipped it.
  const views = pkg.contributes.views.dabblerSessionSetsContainer;

  test("the tree is named Work Explorer and is unconditionally present", () => {
    const native = views.find((v) => v.id === VIEW);
    assert.ok(native, "the native tree view is not contributed");
    assert.strictEqual(native.name, "Work Explorer");
    // No `visibility: collapsed` (Session 2's preview posture) and no `when`
    // clause: the tree is the surface, and it is always there.
    assert.strictEqual(native.visibility, undefined);
    assert.strictEqual(native.when, undefined);
  });

  test("the tree is the ONLY view in the container — no webview stacks above it", () => {
    // Set 123 S3: the "Setup & Status" webview (`dabblerSessionSets`, gated on
    // `dabblerSessionSets.setupNeeded`) is deleted. Setup resolves in the
    // terminal now, so there is no second surface to stack, no presence rule
    // to compute, and no way for the two to disagree about one workspace.
    //
    // Asserted as an EXACT set rather than "the webview is absent": a
    // never-matching absence check would go on passing if some third view
    // were contributed later, which is the failure mode this file exists to
    // prevent.
    assert.deepStrictEqual(
      views.map((v) => v.id),
      [VIEW],
    );
    assert.strictEqual(
      views.filter((v) => v.type === "webview").length,
      0,
      "the extension contributes no webview views at all",
    );
  });

  test("every title-bar action is gated on the tree, not on the conditional view", () => {
    // The failure this catches is quiet and total: an action gated on a
    // conditionally-present view disappears with it, so the operator would
    // lose Refresh, Get Started, the manifest opener and the bulk upgrade —
    // with nothing on screen to say why.
    const titleEntries = menus["view/title"] ?? [];
    assert.ok(titleEntries.length > 0, "no view/title contributions found");
    for (const entry of titleEntries) {
      const when = entry.when ?? "";
      assert.ok(
        when.includes(`view == ${VIEW}`),
        `${entry.command} is gated on "${when}" — title actions belong on the ` +
          `always-present tree view`,
      );
      assert.ok(
        !when.includes("view == dabblerSessionSets "),
        `${entry.command} is still gated on the retired webview`,
      );
    }
  });

  test("every contributed command has a registration in shipping source", () => {
    // Set 123 S3, from cross-provider verification round 1 (found by BOTH
    // discovery lenses independently). This session deleted `wizard/`, whose
    // `registerPlanImportCommand` registered TWO commands, not one:
    // `dabbler.importPlan` — retired on purpose — and `dabbler.openModulePlan`,
    // the Work Explorer's `Open Plan` row action, which is emphatically NOT
    // retired. The manifest still contributed it and module rows still emitted
    // `;can-open-plan;`, so the inline action stayed visible and would have
    // failed with command-not-found on the main module workflow.
    //
    // Nothing caught it: `tsc` is happy (no import dangles — the whole import
    // went), the menu-parity tests above check menu -> contributes, not
    // contributes -> registration, and the Layer 3 tree specs never click
    // Open Plan. This closes that direction, which is the one a DELETION
    // breaks: a command loses its backing while every declaration that
    // advertises it survives.
    //
    // Two registration shapes must both count as registered, or the guard
    // fails on correct code: `regenerateNarrationTemplates.ts` registers via a
    // `COMMAND_ID` constant, and `copyCommand.ts` registers a family from a
    // template literal. So the check is "the id is reachable as a literal, or
    // as the literal prefix of a template" rather than "it is spelled inside
    // registerCommand(".
    const srcDir = path.resolve(__dirname, "..", "..");
    const sources: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "test") continue; // shipping source only
          walk(p);
        } else if (entry.name.endsWith(".ts")) {
          sources.push(fs.readFileSync(p, "utf8"));
        }
      }
    };
    walk(srcDir);
    const all = sources.join("\n");

    const templatePrefixes = [...all.matchAll(/`([^`$]*)\$\{/g)].map((m) => m[1]);
    const backed = (id: string): boolean =>
      all.includes(`"${id}"`) ||
      templatePrefixes.some((prefix) => prefix.length > 0 && id.startsWith(prefix));

    const orphans = pkg.contributes.commands
      .map((c) => c.command)
      .filter((id) => !backed(id));
    assert.deepStrictEqual(
      orphans,
      [],
      `these commands are contributed in package.json but nothing in shipping ` +
        `source registers them, so invoking them fails with command-not-found: ` +
        `${orphans.join(", ")}`,
    );
  });
});

suite("Set 110 S2 — menu parity, forward: every action reaches a menu", () => {
  test("each ROW_ACTION appears exactly once across the native menus", () => {
    for (const action of ROW_ACTIONS) {
      const hits = allNativeEntries.filter((e) => e.command === action.id);
      assert.strictEqual(
        hits.length,
        1,
        `${action.id} appears ${hits.length} time(s) in the native menus; expected exactly 1`,
      );
    }
  });

  test("each entry gates on its OWN action token, delimited", () => {
    for (const action of ROW_ACTIONS) {
      const entry = allNativeEntries.find((e) => e.command === action.id);
      assert.ok(entry, `${action.id} has no menu entry`);
      const expected = tokenMatcher(actionToken(action));
      assert.ok(
        (entry.when ?? "").includes(expected),
        `${action.id} gates on "${entry.when}" but should match ${expected}`,
      );
    }
  });

  test("categories land in the right place — submenus are submenus", () => {
    const inSubmenu = (id: string, items: MenuEntry[]) =>
      items.some((e) => e.command === id);
    for (const action of ROW_ACTIONS) {
      if (action.category === "openFile") {
        assert.ok(inSubmenu(action.id, openFileItems), `${action.id} should be under Open File`);
      } else if (action.category === "copyEval") {
        assert.ok(inSubmenu(action.id, copyPromptItems), `${action.id} should be under Copy Prompt`);
      } else {
        assert.ok(
          nativeItemContext.some((e) => e.command === action.id),
          `${action.id} should be a top-level context item`,
        );
      }
    }
  });

  test("both submenus are declared and anchored on set rows", () => {
    const declared = new Set((pkg.contributes.submenus ?? []).map((s) => s.id));
    for (const id of [SUBMENU_OPEN, SUBMENU_COPY]) {
      assert.ok(declared.has(id), `submenu ${id} is not declared in contributes.submenus`);
      const anchor = nativeItemContext.find((e) => e.submenu === id);
      assert.ok(anchor, `submenu ${id} is never anchored into view/item/context`);
      assert.ok(
        (anchor.when ?? "").includes(tokenMatcher("dabblerSet")),
        `submenu ${id} must be anchored on set rows, not "${anchor.when}"`,
      );
    }
  });
});

suite("Set 110 S2 — menu parity, backward: no menu entry is unreachable", () => {
  test("every command named by a native menu is declared in contributes.commands", () => {
    const declared = new Set(pkg.contributes.commands.map((c) => c.command));
    for (const entry of allNativeEntries) {
      if (!entry.command) continue;
      assert.ok(
        declared.has(entry.command),
        `menu names undeclared command "${entry.command}"`,
      );
    }
  });

  test("every `act-` token a menu gates on belongs to a real registry action", () => {
    // Backward direction: a stale entry left behind by a retired action
    // would otherwise sit in the menu forever, gated on a token nothing
    // can ever produce, and look like a feature nobody can reach.
    //
    // Both registries, one namespace (Set 115 S3): set actions and session
    // actions mint tokens through the same `actionToken`, so a token that
    // belongs to neither list is unreachable either way.
    const known = new Set([...ROW_ACTIONS, ...SESSION_ACTIONS].map(actionToken));
    for (const entry of allNativeEntries) {
      const found = (entry.when ?? "").match(/;(act-[A-Za-z0-9-]+);/);
      if (!found) continue;
      assert.ok(
        known.has(found[1]),
        `menu entry for "${entry.command}" gates on unknown action token ${found[1]}`,
      );
    }
  });

  test("every module token a menu gates on is one the model can emit", () => {
    const emittable = new Set([
      "dabblerModule",
      "dabblerBucket",
      "dabblerSet",
      "dabblerSession",
      "dabblerStep",
      "module-declared",
      "module-fallback",
      "module-pseudo",
      "can-open-plan",
      "can-manage-module",
      "can-assign-legacy",
    ]);
    for (const entry of allNativeEntries) {
      for (const m of (entry.when ?? "").matchAll(/;([A-Za-z0-9-]+);/g)) {
        const token = m[1];
        if (token.startsWith("act-")) continue;
        assert.ok(
          emittable.has(token),
          `menu entry for "${entry.command ?? entry.submenu}" gates on ` +
            `"${token}", which no descriptor emits`,
        );
      }
    }
  });
});

suite("Set 110 S2 — the two spike-proven constraints", () => {
  test("AT MOST TWO inline actions", () => {
    // s1-migration-decision.md §3(b): with FOUR inline commands the module
    // label is erased at minimum panel width — the operator's original
    // complaint, reproduced inside the native tree. Two render safely.
    // This is a binding constraint, not a preference.
    const inline = nativeItemContext.filter((e) => (e.group ?? "").startsWith("inline"));
    assert.ok(
      inline.length <= 2,
      `${inline.length} inline actions contributed; S1 capped it at 2 ` +
        `(four erased the module label at minimum width)`,
    );
  });

  test("inline actions ride MODULE rows and carry an icon", () => {
    // `"group": "inline"` renders icon-only. A command with no icon
    // renders as a text stub, which is precisely the label-crowding the
    // cap exists to prevent.
    const byId = new Map(pkg.contributes.commands.map((c) => [c.command, c]));
    // Tokens ONLY a module descriptor emits. Gating an inline action on
    // any of these is what confines it to module rows; gating on, say,
    // `dabblerSet` would put icons on every session-set row, which is the
    // hybrid the operator explicitly declined.
    const moduleOnly = [
      "dabblerModule",
      "module-declared",
      "module-fallback",
      "module-pseudo",
      "can-open-plan",
      "can-manage-module",
      "can-assign-legacy",
    ].map(tokenMatcher);
    for (const entry of nativeItemContext.filter((e) => (e.group ?? "").startsWith("inline"))) {
      assert.ok(
        moduleOnly.some((m) => (entry.when ?? "").includes(m)),
        `inline action "${entry.command}" is not gated to module rows: ${entry.when}`,
      );
      const cmd = byId.get(entry.command ?? "");
      assert.ok(cmd?.icon, `inline action "${entry.command}" has no icon and would render as text`);
    }
  });

  test("no menu entry targets bucket or step rows — neither has actions", () => {
    // Set 110 S2 stated this for bucket, session AND step rows, so that a
    // future addition would be a DECISION rather than a leak. Set 115 S3
    // is that decision, for session rows only: see `SESSION_ACTIONS` and
    // the suite below. Bucket and step rows remain display-only, and the
    // assertion stays here for them rather than being dropped.
    for (const entry of allNativeEntries) {
      const when = entry.when ?? "";
      assert.ok(
        !when.includes(tokenMatcher("dabblerBucket")),
        `unexpected bucket-row action: ${entry.command}`,
      );
      assert.ok(
        !when.includes(tokenMatcher("dabblerStep")),
        `unexpected step-row action: ${entry.command}`,
      );
    }
  });
});

suite("Set 115 S3 — menu parity for the session row's own actions", () => {
  test("each SESSION_ACTION appears exactly once, as a top-level context item", () => {
    // Forward direction, and the placement rule in one assertion: session
    // actions are flat entries on `view/item/context`. They are NOT put
    // under the `Open File ▸` / `Copy Prompt ▸` submenus, which are
    // anchored on `;dabblerSet;` and would therefore never render on a
    // session row at all.
    for (const action of SESSION_ACTIONS) {
      const hits = allNativeEntries.filter((e) => e.command === action.id);
      assert.strictEqual(
        hits.length,
        1,
        `${action.id} appears ${hits.length} time(s) in the native menus; expected exactly 1`,
      );
      assert.ok(
        nativeItemContext.some((e) => e.command === action.id),
        `${action.id} should be a top-level context item`,
      );
    }
  });

  test("each entry gates on its OWN action token, delimited", () => {
    for (const action of SESSION_ACTIONS) {
      const entry = allNativeEntries.find((e) => e.command === action.id);
      assert.ok(entry, `${action.id} has no menu entry`);
      const expected = tokenMatcher(actionToken(action));
      assert.ok(
        (entry.when ?? "").includes(expected),
        `${action.id} gates on "${entry.when}" but should match ${expected}`,
      );
    }
  });

  test("session actions mint tokens that collide with no set action", () => {
    // `actionToken` strips the `dabbler.` / `dabblerSessionSets.` prefix,
    // so two commands in different namespaces can produce ONE token — and
    // the collision would be invisible: both rows would light up for
    // whichever menu entry matched first.
    const setTokens = ROW_ACTIONS.map(actionToken);
    for (const action of SESSION_ACTIONS) {
      const token = actionToken(action);
      assert.ok(
        !setTokens.includes(token),
        `${action.id} mints ${token}, which a set action already owns`,
      );
    }
  });

  test("no session action is offered from the Command Palette", () => {
    // Every one of them needs a session node as its argument. Offered in
    // the palette they would be commands that silently do nothing — the
    // same rule `activateSession` follows, and the reason it follows it.
    for (const action of SESSION_ACTIONS) {
      assert.ok(
        pkg.contributes.commands.some((c) => c.command === action.id),
        `${action.id} is not declared in contributes.commands`,
      );
      const hidden = (menus.commandPalette ?? []).find((e) => e.command === action.id);
      assert.ok(hidden, `${action.id} is not hidden from the Command Palette`);
      assert.strictEqual(hidden.when, "false");
    }
  });

  test("no session action is contributed inline", () => {
    // The two-inline cap is a MODULE-row constraint (S1 spike evidence),
    // and the assertion above enforces it by counting. This one keeps
    // session rows out of that budget entirely: an icon-only action on a
    // session row would crowd the very label Session 1 fought to show.
    const inlineIds = nativeItemContext
      .filter((e) => (e.group ?? "").startsWith("inline"))
      .map((e) => e.command);
    for (const action of SESSION_ACTIONS) {
      assert.ok(
        !inlineIds.includes(action.id),
        `${action.id} is contributed inline; session actions belong in the context menu`,
      );
    }
  });
});

suite("Set 110 S2 — the row-activation command", () => {
  test("is declared and hidden from the Command Palette", () => {
    // It needs a tree node as its argument; offered in the palette it
    // would be a command that silently does nothing.
    assert.ok(
      pkg.contributes.commands.some((c) => c.command === "dabblerWorkExplorer.activateSet"),
    );
    const hidden = (menus.commandPalette ?? []).find(
      (e) => e.command === "dabblerWorkExplorer.activateSet",
    );
    assert.ok(hidden, "activateSet is not hidden from the Command Palette");
    assert.strictEqual(hidden.when, "false");
  });
});

suite("Set 115 S2 — the session-activation command", () => {
  test("is declared and hidden from the Command Palette", () => {
    // Same rule as its set-row sibling, and the same reason: without a
    // session node it has no spec to open and no section to open it at.
    assert.ok(
      pkg.contributes.commands.some(
        (c) => c.command === "dabblerWorkExplorer.activateSession",
      ),
      "activateSession is not declared in contributes.commands",
    );
    const hidden = (menus.commandPalette ?? []).find(
      (e) => e.command === "dabblerWorkExplorer.activateSession",
    );
    assert.ok(hidden, "activateSession is not hidden from the Command Palette");
    assert.strictEqual(hidden.when, "false");
  });

  test("rides the row's `command`, not a session-row menu entry", () => {
    // The Set 110 S2 ruling that no menu entry targets session rows still
    // holds — a left-click activation is `TreeItem.command`, which is a
    // different surface from `view/item/context`. Session 3 is where menu
    // entries arrive, as a decision rather than as a side effect of this.
    for (const entry of allNativeEntries) {
      assert.notStrictEqual(
        entry.command,
        "dabblerWorkExplorer.activateSession",
        "activateSession leaked into a context menu",
      );
    }
  });
});
