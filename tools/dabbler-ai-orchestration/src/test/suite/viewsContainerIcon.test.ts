// Set 110 Session 4 — the activity-bar container icon, and why it is a
// STRING while the status icons are a {light, dark} PAIR.
//
// WHY THIS TEST EXISTS. Session 4's UAT remediation "fixed" an operator
// complaint that the activity-bar mark looked too dark on a light theme by
// contributing `icon: { light, dark }` — the idiom that is correct for
// `TreeItem.iconPath` and is used by the four status glyphs next door.
// Applied to `contributes.viewsContainers` it is not a cosmetic mistake, it
// is fatal:
//
//   src/vs/workbench/api/browser/viewsExtensionPoint.ts
//     if (typeof descriptor.icon !== 'string') {
//       collector.error("property `icon` is mandatory and must be of type `string`");
//       return false;   // <- and the caller then skips the WHOLE array
//     }
//
// `isValidViewsContainer` returning false makes VS Code refuse to register
// the container at all, so the Dabbler activity-bar entry disappears and its
// views fall back into Explorer. Nothing in a build, a typecheck or a Layer 2
// run notices, because the manifest is still well-formed JSON.
//
// The two contribution points differ because they are PAINTED differently,
// which is the fact `media/status-icon-theming.md` records from a real
// Extension Development Host:
//
//   TreeItem.iconPath      -> CSS `background-image`, `mask-image: none`.
//                             The SVG renders AS AUTHORED, so its own colours
//                             matter and a {light, dark} pair is meaningful.
//   viewsContainers icon   -> CSS `mask`. VS Code generates
//                             `mask: url(...) no-repeat 50% 50%` and paints
//                             the silhouette with the theme's activity-bar
//                             foreground. The SVG's own colours are DISCARDED.
//
// So the pair was doubly wrong: illegal, and incapable of changing a single
// pixel even if it had been legal — the two files it contributed carried
// byte-identical path data and differed only in a `fill` the mask throws away.
// The operator's contrast complaint is therefore still open; it cannot be
// answered from the asset at all, only from the theme's activity-bar colours.
//
// This gate is deliberately about SHAPE, not about which file is named: any
// container, any string, is fine. What must never come back is a non-string.
//
// Root resolution follows the convention costDashboardGate.test.ts established:
// `DABBLER_EXTENSION_ROOT` when the Extension Host launcher sets it, otherwise
// the current directory. Deliberately NOT `__dirname` — this file imports only
// node builtins, so Node's native TypeScript loader can pick it up as an ES
// module, where `__dirname` does not exist.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

const EXTENSION_ROOT = process.env.DABBLER_EXTENSION_ROOT ?? process.cwd();

const manifest = JSON.parse(
  fs.readFileSync(path.join(EXTENSION_ROOT, "package.json"), "utf-8"),
) as {
  contributes?: {
    viewsContainers?: Record<string, { id: string; title: string; icon: unknown }[]>;
  };
};

const containersByLocation = manifest.contributes?.viewsContainers ?? {};
const allContainers = Object.entries(containersByLocation).flatMap(
  ([location, entries]) => (entries ?? []).map((entry) => ({ location, entry })),
);

suite("Set 110 S4 — viewsContainers icon contract", () => {
  test("the extension contributes at least one view container", () => {
    // Guards the gate itself: every assertion below is a for-loop, so an
    // empty manifest would make this suite pass while contributing nothing.
    assert.ok(
      allContainers.length > 0,
      "no contributes.viewsContainers entries found — the gate below would be vacuous",
    );
  });

  test("every container icon is a STRING — VS Code rejects any other shape", () => {
    for (const { location, entry } of allContainers) {
      assert.strictEqual(
        typeof entry.icon,
        "string",
        `contributes.viewsContainers.${location}["${entry.id}"].icon is ` +
          `${Array.isArray(entry.icon) ? "an array" : typeof entry.icon} — ` +
          "VS Code's isValidViewsContainer requires a string and drops the " +
          "entire container when it is not. A {light, dark} pair is correct " +
          "for TreeItem.iconPath and fatal here; see the header comment and " +
          "media/status-icon-theming.md.",
      );
    }
  });

  test("every container icon resolves to a file that exists and is non-empty", () => {
    for (const { location, entry } of allContainers) {
      // The shape test above owns non-strings; skipping them here keeps a
      // single bad manifest from cascading into a TypeError in every other
      // test, which would bury the one assertion that names the real cause.
      if (typeof entry.icon !== "string") continue;
      const icon = entry.icon;
      // A `$(codicon)` reference is resolved by ThemeIcon.fromString and has
      // no file behind it, so it is legal and simply not a path to check.
      if (/^\$\([a-z0-9-]+\)$/i.test(icon)) continue;

      const resolved = path.join(EXTENSION_ROOT, icon);
      assert.ok(
        fs.existsSync(resolved),
        `contributes.viewsContainers.${location}["${entry.id}"].icon points at ` +
          `"${icon}", which does not exist. VS Code renders a blank slot rather ` +
          "than failing, so nothing else would catch this.",
      );
      assert.ok(
        fs.statSync(resolved).size > 0,
        `container icon "${icon}" is an empty file`,
      );
    }
  });

  test("no container icon is contributed from a per-theme directory", () => {
    // The narrower trap behind the same mistake: contributing
    // `media/dark/foo.svg` as the single string is legal JSON and legal
    // VS Code, but it silently ships one theme's artwork through a mask that
    // ignores colour — i.e. someone still believing the pair story, now
    // expressing it in a way the type check above cannot see.
    for (const { location, entry } of allContainers) {
      if (typeof entry.icon !== "string") continue;
      const icon = entry.icon;
      if (/^\$\([a-z0-9-]+\)$/i.test(icon)) continue;

      const segments = icon.split(/[\\/]/);
      const themed = segments.find((s) => s === "light" || s === "dark");
      assert.ok(
        themed === undefined,
        `contributes.viewsContainers.${location}["${entry.id}"].icon is ` +
          `"${icon}", which reaches into a "${themed}" directory. The activity ` +
          "bar masks this icon and takes its colour from the theme, so a " +
          "per-theme asset is meaningless here — use one shared file.",
      );
    }
  });
});
