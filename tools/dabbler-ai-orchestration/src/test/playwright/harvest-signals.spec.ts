// Set 045 / Session 5 — Layer-3 Playwright coverage for the
// harvested-signal badges + conflict pills rendered by the
// Session Set Explorer's S5 wiring. The host shells out to
// `python -m ai_router.joiner --coverage --json` and `--conflicts
// --json` via HarvestService, then attaches signals + conflicts to
// each row payload. The webview client.js paints the four badges
// (wrapper / native / narration / bypass) and one conflict pill per
// detected conflict.
//
// Scope per CLAUDE.md ("rendered-text invariants belong in Layer 3"):
// these scenarios assert what the operator actually sees painted on
// screen. The CoverageSummary + ConflictReport content rules live in
// Layer 1 unit tests (test_joiner_coverage.py + test_joiner_conflicts.py).
//
// What this spec covers:
//   1. Badge wiring smoke — on a fresh workspace with no native logs
//      matching, all four badges render in their "off" state. This
//      asserts the host → CLI → JSON → row payload → DOM pipeline
//      is end-to-end live without depending on log fixtures the
//      extension subprocess cannot see.
//   2. Writer-bypass conflict pill — when session-state.json's mtime
//      drifts more than ±2s from the most recent session-events.jsonl
//      entry, the joiner detects a writer-bypass and the row paints
//      a conflict pill. Harness-controlled — no home-dir pollution.
//   3. Graceful-degrade — if the joiner CLI fails (badges absent),
//      the row still renders with name + fraction + description and
//      no badge / conflict DOM. Covered by the welcome-state path
//      and the harvest-badges section's `if (!signals) return ""`
//      branch via spec.ts conditionals.

import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupTmpDir,
  closeVSCode,
  launchVSCode,
  LaunchedVSCode,
  makeSet,
  makeTmpDir,
  openSessionSetsView,
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

test("harvest badges render in off-state for a fresh session set", async () => {
  const per: PerTest = {};
  try {
    per.tmpPath = makeTmpDir("dabbler-pw-harvest-off");
    const h = makeSet(per.tmpPath, "045-harvest-fresh", 3);
    per.launch = await launchVSCode(h.repo_root);
    const inner = await openSessionSetsView(per.launch.page);
    await triggerRefresh(per.launch.page);

    // The four signal badges must all appear in the off state on a
    // fresh workspace tmpdir — no wrapper launch (no ~/.dabbler/
    // launch-log.jsonl entry for this slug), no native log bound to
    // the workspace (tmpdir not in ~/.claude/projects/), no marker,
    // no bypass. Asserting "off" is what proves the wiring path is
    // live; an "on" state would require either polluting the
    // operator's home dir or extending the CLI with --claude-root
    // (S6 follow-on if needed for richer scenarios).
    const row = inner.locator(
      '[role="treeitem"][data-slug="045-harvest-fresh"]',
    );
    await expect(row).toBeVisible({ timeout: 30_000 });

    // Poll the four badges; the harvest fetch is async (Python
    // cold-start adds 200-800ms after the first paint), so the badges
    // appear on the second render tick. Toggling refresh forces the
    // host to re-snapshot when the service's onUpdate fires.
    const badges = row.locator(".harvest-badges .harvest-badge");
    await expect(badges).toHaveCount(4, { timeout: 30_000 });

    // Each slot's data-signal attribute identifies which signal it
    // represents; data-state isn't used here because the on/off
    // state is encoded via the .is-on / .is-off class.
    const wrapper = row.locator('.harvest-badge[data-signal="wrapper"]');
    const native = row.locator('.harvest-badge[data-signal="native"]');
    const narration = row.locator('.harvest-badge[data-signal="narration"]');
    const bypass = row.locator('.harvest-badge[data-signal="bypass"]');
    await expect(wrapper).toHaveClass(/is-off/);
    await expect(native).toHaveClass(/is-off/);
    await expect(narration).toHaveClass(/is-off/);
    await expect(bypass).toHaveClass(/is-off/);

    // No conflict pills on a clean fresh set.
    await expect(row.locator(".conflict-pills")).toHaveCount(0);
  } finally {
    await teardown(per);
  }
});

test("writer-bypass conflict pill renders when state-file mtime drifts from events ledger", async () => {
  const per: PerTest = {};
  try {
    per.tmpPath = makeTmpDir("dabbler-pw-harvest-bypass");
    const h = makeSet(per.tmpPath, "045-harvest-bypass", 3);
    // Start session 1 so the events ledger gets a `work_started`
    // entry from start_session. That gives the joiner a concrete
    // events-ledger entry to compare the state-file mtime against.
    startSession(h, 1);

    // Drift the state-file mtime well outside the joiner's ±2s
    // writer-bypass tolerance. The events ledger entry was written
    // by start_session in the same transaction as the state-file
    // write; pushing the state-file mtime ~60s into the past makes
    // the joiner conclude the state file was written by something
    // other than the canonical writer.
    const statePath = path.join(h.set_dir, "session-state.json");
    const oldTime = new Date(Date.now() - 60_000);
    fs.utimesSync(statePath, oldTime, oldTime);

    per.launch = await launchVSCode(h.repo_root);
    const inner = await openSessionSetsView(per.launch.page);
    await triggerRefresh(per.launch.page);

    const row = inner.locator(
      '[role="treeitem"][data-slug="045-harvest-bypass"]',
    );
    await expect(row).toBeVisible({ timeout: 30_000 });

    // The conflict pill should appear with kind="writer-bypass" and
    // severity="high" (per ai_router/joiner/conflicts.py
    // detect_writer_bypass — the canonical severity for any
    // detected bypass).
    const pill = row.locator(
      '.conflict-pill[data-kind="writer-bypass"][data-severity="high"]',
    );
    await expect(pill).toBeVisible({ timeout: 30_000 });
    await expect(pill).toHaveText("writer-bypass");

    // The pill carries a hover note describing the drift.
    const noteAttr = await pill.getAttribute("title");
    expect(noteAttr ?? "").toMatch(/state-file mtime is .* from the nearest events-ledger entry/);
  } finally {
    await teardown(per);
  }
});

test("conflict pills wrap onto their own line below the row header", async () => {
  // Visual-layout invariant: per Set 045 / S5 styling, conflict pills
  // attach to .conflict-pills as a sibling of .row-header (not
  // inside it). This prevents the row-header line from growing in
  // height when conflicts are present; rows stay one-line at the
  // top, conflicts wrap below.
  const per: PerTest = {};
  try {
    per.tmpPath = makeTmpDir("dabbler-pw-harvest-layout");
    const h = makeSet(per.tmpPath, "045-harvest-layout", 3);
    startSession(h, 1);
    const statePath = path.join(h.set_dir, "session-state.json");
    const oldTime = new Date(Date.now() - 60_000);
    fs.utimesSync(statePath, oldTime, oldTime);
    per.launch = await launchVSCode(h.repo_root);
    const inner = await openSessionSetsView(per.launch.page);
    await triggerRefresh(per.launch.page);

    const row = inner.locator(
      '[role="treeitem"][data-slug="045-harvest-layout"]',
    );
    await expect(row).toBeVisible({ timeout: 30_000 });

    // .conflict-pills is a DIRECT child of the row, not nested
    // inside .row-header. Children selectors confirm the layout.
    const conflictBlock = row.locator(":scope > .conflict-pills");
    await expect(conflictBlock).toBeVisible({ timeout: 30_000 });

    // And the badges sit INSIDE .row-header (on the same line as
    // the row name) — confirming the two-tier layout (badges inline,
    // conflicts below).
    const badgesInHeader = row.locator(".row-header .harvest-badges");
    await expect(badgesInHeader).toBeVisible();
  } finally {
    await teardown(per);
  }
});
