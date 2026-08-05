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
import { ROW_ACTIONS } from "../../providers/ActionRegistry";
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
    views: Record<string, { id: string; name: string; visibility?: string; when?: string }[]>;
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

  test("the webview is a conditionally-present Setup & Status surface above it", () => {
    assert.strictEqual(views[0].id, "dabblerSessionSets", "setup/status stacks above the tree");
    assert.strictEqual(views[0].name, "Setup & Status");
    // The presence rule. A view hidden by a `when` clause is never resolved,
    // so its own provider cannot decide to bring it back — the key is
    // computed in `extension.ts` via `providers/systemStatus.ts`, which
    // fails toward VISIBLE so a fault is never invisible.
    assert.strictEqual(views[0].when, "dabblerSessionSets.setupNeeded");
    assert.strictEqual(views[1].id, VIEW, "the tree is the second, and last, view");
    assert.strictEqual(views.length, 2);
  });

  test("every title-bar action is gated on the tree, not on the conditional view", () => {
    // The failure this catches is quiet and total: an action gated on the
    // webview disappears with it, so on a healthy repo the operator would
    // lose Refresh, the cost dashboard, Get Started, the manifest opener and
    // the bulk upgrade — with nothing on screen to say why.
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
        `${entry.command} is still gated on the conditional webview`,
      );
    }
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
    const known = new Set(ROW_ACTIONS.map(actionToken));
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

  test("no menu entry targets bucket or session rows — neither has actions yet", () => {
    // Stated so a future addition is a DECISION rather than a leak. The
    // operator confirmed a mapping for module and set rows only; bucket
    // and session rows are display-only in this session.
    for (const entry of allNativeEntries) {
      const when = entry.when ?? "";
      assert.ok(
        !when.includes(tokenMatcher("dabblerBucket")),
        `unexpected bucket-row action: ${entry.command}`,
      );
      assert.ok(
        !when.includes(tokenMatcher("dabblerSession")),
        `unexpected session-row action: ${entry.command}`,
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
