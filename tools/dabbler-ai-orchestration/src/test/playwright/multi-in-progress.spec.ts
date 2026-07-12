// Set 033 Session 4 — Layer-3 Playwright coverage for the
// multi-in-progress rendering invariant introduced by S2's resolver
// pivot (`resolveActiveSet` → `listInProgressSets`). The Set 029 S4
// custom-tree already covered the "two accordions render" case in
// `session-sets-tree.spec.ts`; this spec adds the bucket-count and
// gauge-rendering invariants the S4 spec calls out explicitly:
// "both accordions render with their own gauges + bucket counts".
//
// Rendered-text invariants live at Layer 3 per CLAUDE.md
// ("rendered-text invariants belong in Layer 3"); data-only
// assertions stay in Layer 1.

import { expect, test } from "@playwright/test";
import {
  cleanupTmpDir,
  closeVSCode,
  launchVSCode,
  LaunchedVSCode,
  makeAdditionalSet,
  makeSet,
  makeTmpDir,
  openSessionSetsView,
  seedOrchestratorBlock,
  startSession,
  triggerRefresh,
} from "./electronLaunch";

interface PerTest {
  tmpPath?: string;
  launch?: LaunchedVSCode;
}

async function teardown(per: PerTest): Promise<void> {
  const errs: unknown[] = [];
  if (per.launch) {
    try { await closeVSCode(per.launch); } catch (e) { errs.push(e); }
  }
  if (per.tmpPath) {
    try { cleanupTmpDir(per.tmpPath); } catch (e) { errs.push(e); }
  }
  if (errs.length > 0) {
    // eslint-disable-next-line no-console
    console.warn("teardown errors:", errs);
  }
}

test("In Progress bucket header shows the multi-in-progress count", async () => {
  const per: PerTest = {};
  try {
    per.tmpPath = makeTmpDir("dabbler-pw-multi-bucket");
    const a = makeSet(per.tmpPath, "033-set-a", 2);
    const b = makeAdditionalSet(a, "033-set-b", 2);
    startSession(a, 1);
    seedOrchestratorBlock(a, {
      engine: "claude",
      provider: "anthropic",
      model: "claude-opus-4-7",
      effort: "high",
    });
    startSession(b, 1);
    seedOrchestratorBlock(b, {
      engine: "gpt-5-4",
      provider: "openai",
      model: "gpt-5",
      effort: "medium",
    });
    per.launch = await launchVSCode(a.repo_root);
    const inner = await openSessionSetsView(per.launch.page);
    await triggerRefresh(per.launch.page);

    // Bucket headers carry the live count: "In Progress  (2)".
    // Asserting on the count parenthetical is more robust than a
    // visible-row count because the rows can collapse/expand
    // independently of the bucket header text.
    // Set 036 Session 6: dropped the leading `^` anchor from the
    // regex. Set 034 prepended a chevron glyph (▾/▸) to the bucket
    // header, which lands at position 0 of the group's textContent
    // and broke the anchor; the orphan-test sweep caught it.
    // Set 093 S1: scope the filter to `.bucket-header` — the persistent
    // Session sets child node added a second role="group" (child-body)
    // whose text now also spans the bucket label, so the old
    // `[role="group"]` filter matched two elements (strict-mode
    // violation). The bucket header is the single source of the count.
    const inProgressHeader = inner
      .locator(".bucket-header")
      .filter({ hasText: /In Progress\s*\(2\)/ });
    await expect(inProgressHeader).toBeVisible({ timeout: 30_000 });
  } finally {
    await teardown(per);
  }
});

// Set 036 Session 6: the test.skip'd "each in-progress row paints its
// own gauge SVG" scenario was deleted alongside the source modules it
// asserted against (OrchestratorAccordion.renderAccordionLoaded). The
// FIXME from Set 033 S4 noted accordionHtml shipped as null on every
// row — Set 034 made that the explicit design. With the gauge-
// rendering code and the .accordion-body CSS now deleted, the
// scenario has no surface to un-skip against. Bucket-count coverage
// (the test above) is the surviving in-progress-row invariant; the
// orchestrator block on session-state.json continues to be written
// by start_session for coordination + audit purposes.
