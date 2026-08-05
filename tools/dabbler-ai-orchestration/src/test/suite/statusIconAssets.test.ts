// Set 110 Session 2 — the status-icon assets themselves.
//
// A missing or mis-themed icon file does not fail a build, fail a type
// check, or fail any other test: VS Code simply renders a blank 16px
// gap, which reads as "this row has no state" rather than as a bug. That
// is exactly how the light-theme defect Session 1 found survived to be
// found by eye in a spike. So the assets get an executable gate.
//
// The rule being pinned is narrow on purpose: the RING is the only
// element painted directly onto the row background, so it is the only
// one whose colour must differ between themes. The disc colours read on
// both, and the `done` check and `cancelled` X sit on those discs, where
// white is correct either way.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { ICON_FILES } from "../../providers/SessionSetsModel";

const MEDIA = path.resolve(__dirname, "..", "..", "..", "media");
const SLUGS = Object.values(ICON_FILES);

suite("Set 110 S2 — status icon assets", () => {
  test("every run state maps to a slug, and no slug is empty", () => {
    assert.deepStrictEqual(
      Object.keys(ICON_FILES).sort(),
      ["cancelled", "complete", "in-progress", "not-started"],
    );
    for (const slug of SLUGS) assert.ok(slug.endsWith(".svg"), `bad slug: "${slug}"`);
  });

  test("both themes carry a file for every state the tree can render", () => {
    // The provider resolves `media/<theme>/<slug>`; a gap here is an
    // invisible row icon in exactly one theme, which is the failure mode
    // nobody notices until an operator mentions it in passing.
    for (const theme of ["light", "dark"]) {
      for (const slug of SLUGS) {
        const p = path.join(MEDIA, theme, slug);
        assert.ok(fs.existsSync(p), `missing status icon: media/${theme}/${slug}`);
      }
    }
  });

  test("light and dark diverge in PAINT, not merely in bytes", () => {
    // The split only buys anything if the two actually look different. An
    // earlier version of this test compared whole files, which a mere
    // difference in Inkscape metadata would satisfy — so a copy saved
    // twice from the editor would have passed while both themes rendered
    // the same glyph. Verification round 1 caught that; comparing the
    // extracted paint declarations is what the invariant actually means.
    for (const slug of SLUGS) {
      const paint = (theme: string) =>
        (fs.readFileSync(path.join(MEDIA, theme, slug), "utf-8")
          .match(/(?:fill|stroke):(?:#[0-9a-fA-F]{3,8}|none|currentColor)/g) ?? []).join("|");
      const light = paint("light");
      const dark = paint("dark");
      assert.ok(light.length > 0, `media/light/${slug} declares no fill or stroke at all`);
      assert.notStrictEqual(
        light,
        dark,
        `media/light/${slug} paints identically to media/dark/${slug} ` +
          `(${light}) — one theme is rendering the other theme's glyph`,
      );
    }
  });

  test("the acute case stays fixed: not-started carries no white on a light row", () => {
    // `not-started.svg` is a bare ring with no disc behind it, so every
    // pixel of it sits on the row background. White here is precisely the
    // Session 1 finding — "nearly invisible, a white fill on a white row"
    // — and it is invisible in both senses: on screen, and to every other
    // gate in the build.
    //
    // Scoped to this one file on purpose. The other three carry a
    // coloured disc, and white ON that disc (the done check, the
    // cancelled X) is correct in both themes, so a blanket "no white in
    // light" rule would be wrong about the operator's actual design.
    const svg = fs.readFileSync(path.join(MEDIA, "light", "not-started.svg"), "utf-8");
    assert.ok(
      !/#ffffff/i.test(svg),
      "media/light/not-started.svg paints white on a light row — the Set 110 S1 defect",
    );
  });

  test("`currentColor` is NOT used — it does not work for a TreeItem icon", () => {
    // Recorded as a gate rather than only as prose, because two separate
    // advisors recommended `currentColor` here at high confidence and a
    // third reader may well do so again. `icon-render-mechanism.spec.ts`
    // measured VS Code painting these as a `background-image` with
    // `mask-image: none`, so an externally-referenced SVG inherits no
    // colour from the row and `currentColor` would resolve to one fixed
    // value on both themes. See `media/status-icon-theming.md`.
    for (const theme of ["light", "dark"]) {
      for (const slug of SLUGS) {
        const svg = fs.readFileSync(path.join(MEDIA, theme, slug), "utf-8");
        assert.ok(
          !svg.includes("currentColor"),
          `media/${theme}/${slug} uses currentColor, which a TreeItem icon ` +
            `cannot resolve — see media/status-icon-theming.md`,
        );
      }
    }
  });
});
