// Set 132 S1 — Layer 3 for the sidebar caption.
//
// The caption is COMPOSED, not stored, and that is the whole reason this
// test exists at this layer. `package.json` contributes a view-container
// `title` and a view `name`; VS Code decides what the sidebar header says
// from the pair of them. Asserting the manifest fields would assert the
// input to a rule this repo does not own — it would have passed happily
// for the defect below.
//
// The rule, established by probing a real workbench rather than by
// reading VS Code's source (Set 132 S1):
//
//   container "AI Orch"          + view "Work Explorer"     -> "AI Orch: Work Explorer"
//   container "AI Work Explorer" + view "Work Explorer"     -> "AI Work Explorer: Work Explorer"
//   container "AI Work Explorer" + view "AI Work Explorer"  -> "AI Work Explorer"
//
// A single-view container MERGES its one view into the sidebar title, and
// joins the two names with `: ` UNLESS they are identical. Set 123 S3 met
// the middle row of that table — the header read the same words twice —
// and fixed it by changing the container title to `AI Orch`, which traded
// the duplication for a header that no longer said what the panel was.
// Making the two strings EQUAL is what actually collapses the join, and
// only a rendered assertion can tell that outcome from the other two.
//
// This also guards `openDabblerContainer`, which finds the activity-bar
// icon by an `aria-label*=` substring of the container title. That
// selector is how every other Layer 3 spec opens the sidebar at all, so a
// rename that missed it would not fail here loudly — it would fail
// everywhere, as a timeout.

import { expect, test } from "@playwright/test";
import {
  cleanupTmpDir,
  closeVSCode,
  LaunchedVSCode,
  launchVSCode,
  makeSet,
  makeTmpDir,
  openDabblerContainer,
} from "./electronLaunch";

const CAPTION = "AI Work Explorer";

interface PerTest {
  tmpPath?: string;
  launch?: LaunchedVSCode;
}

test.describe("Set 132 S1 — the sidebar caption", () => {
  const per: PerTest = {};

  test.afterEach(async () => {
    if (per.launch) {
      try {
        await closeVSCode(per.launch);
      } catch {
        /* best effort */
      }
    }
    if (per.tmpPath) cleanupTmpDir(per.tmpPath);
    per.tmpPath = undefined;
    per.launch = undefined;
  });

  test("the header reads 'AI Work Explorer' exactly once", async () => {
    per.tmpPath = makeTmpDir("dabbler-caption");
    const h = makeSet(per.tmpPath, "132-caption", 2);

    per.launch = await launchVSCode(h.repo_root);
    // Uses the aria-label substring selector, so this line fails first if
    // the container title and the harness ever disagree again.
    await openDabblerContainer(per.launch.page);

    const title = per.launch.page.locator(".part.sidebar .title-label");
    await expect(title).toHaveText(CAPTION, { timeout: 30_000 });

    // The falsifiers, spelled out rather than implied by the equality
    // above, because each names a DIFFERENT wrong outcome that has
    // actually shipped from this manifest.
    const rendered = (await title.textContent())?.trim() ?? "";
    // `AI Orch: Work Explorer` — the join survives whenever the two
    // contributed strings differ, whatever they are.
    expect(rendered, "the container and view names are still joined").not.toContain(":");
    // `AI Work Explorer: Work Explorer` — the Set 123 S3 defect. Counting
    // occurrences catches it however the second copy is spelled around.
    expect(
      rendered.match(/Work Explorer/g)?.length ?? 0,
      "the caption says 'Work Explorer' more than once",
    ).toBe(1);

    // The activity-bar icon carries the same words, since that tooltip is
    // the only place the container title shows when the sidebar is shut.
    await expect(
      per.launch.page.locator(`.activitybar .action-label[aria-label*="${CAPTION}"]`),
    ).toHaveCount(1);
  });
});
