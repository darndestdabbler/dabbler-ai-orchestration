// Layer 3 rendering smoke for the orchestrator indicator gauges
// (Set 029 Session 2).
//
// Strategy: redirect USERPROFILE (Windows) / HOME (mac+linux) to a per-
// test tmpdir so the marker file the extension reads lives under our
// control. Seed the marker, launch VS Code, open the activity bar, and
// inspect the orchestrator indicator webview iframe.
//
// Webview content lives in a nested iframe rendered by VS Code; we
// reach it via page.frameLocator and assert on the inner HTML's
// rendered text + CSS class hooks. We deliberately don't pixel-diff —
// gauge color is a function of the theme and isn't worth the maintenance.
//
// Scenarios:
//   1. seed Opus current → flagship needle + solid fill + provider/model label
//   2. seed Haiku current → low-tier needle position
//   3. seed model=unknown confidence=low → "low confidence" tooltip phrasing
//   4. seed effort.signalKind=last-observed → clock-icon + "(last /think Xm ago)"
//   5. seed signalKind=configured-default → dashed-rim hook + DEFAULT pill
//   6. seed updatedAt 9h ago → stale class on .gauges + "last updated 9h ago"
//   7. empty (no marker) → "No signal — install hook" CTA
//
// The webview is registered as a non-tree view (`type: "webview"`) and
// pinned above the Session Sets tree per audit D4 / Session 2 step 1.
// We assert orchestrator-above-session-sets ordering via a DOM index
// check on the side-bar viewlets.

import { expect, test } from "@playwright/test";
import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  cleanupTmpDir,
  closeVSCode,
  launchVSCode,
  LaunchedVSCode,
  makeSet,
  makeTmpDir,
} from "./electronLaunch";

interface PerTest {
  workspaceTmp?: string;
  fakeHome?: string;
  launch?: LaunchedVSCode;
  prevUserprofile?: string | undefined;
  prevHome?: string | undefined;
}

function seedMarker(fakeHome: string, marker: Record<string, unknown>): void {
  const dir = path.join(fakeHome, ".dabbler");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "current-orchestrator.json"),
    JSON.stringify(marker, null, 2) + "\n",
    "utf8",
  );
}

function deleteMarker(fakeHome: string): void {
  const file = path.join(fakeHome, ".dabbler", "current-orchestrator.json");
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function setHomeEnv(fakeHome: string, per: PerTest): void {
  per.prevUserprofile = process.env.USERPROFILE;
  per.prevHome = process.env.HOME;
  process.env.USERPROFILE = fakeHome;
  process.env.HOME = fakeHome;
}

function restoreHomeEnv(per: PerTest): void {
  if (per.prevUserprofile === undefined) {
    delete process.env.USERPROFILE;
  } else {
    process.env.USERPROFILE = per.prevUserprofile;
  }
  if (per.prevHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = per.prevHome;
  }
}

function makeWorkspace(per: PerTest): string {
  // The extension activates on `workspaceContains:docs/session-sets` —
  // we need at least a real session set so the activation actually
  // fires under the existing electronLaunch harness. The orchestrator
  // indicator view is registered unconditionally, so the seed set's
  // contents don't matter for this smoke.
  per.workspaceTmp = makeTmpDir("dabbler-pw-orchestrator");
  const seed = makeSet(per.workspaceTmp, "orchestrator-seed", 1);
  return seed.repo_root;
}

async function openIndicatorFrame(launch: LaunchedVSCode): Promise<import("@playwright/test").Frame> {
  const page = launch.page;
  // Click the activity bar icon to open the side bar.
  const activityIcon = page.locator(
    '.activitybar .action-label[aria-label*="Dabbler AI Orchestration"]',
  );
  await activityIcon.waitFor({ state: "visible", timeout: 30_000 });
  await activityIcon.click();
  // VS Code's webview view layout (verified via diagnostic dump
  // 2026-05-18 against VS Code 1.119): the outer `iframe.webview` host
  // contains a service-worker bootstrap script that creates a
  // *programmatic* child frame loading `vscode-webview://.../fake.html`
  // — that child is where the WebviewView provider's HTML actually
  // renders. The child has NO `<iframe>` element in the outer DOM
  // because it's added at the browser level by the bootstrap, not by
  // a DOM mutation. So `frameLocator("iframe.webview").frameLocator("iframe")`
  // never resolves. The fix is to use the lower-level Frame API:
  // grab the outer iframe's contentFrame, then pick the first
  // childFrame (which is the fake.html one).
  // Wait + retry loop because the child frame is added asynchronously.
  const deadline = Date.now() + 30_000;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const outerHandle = await page.locator("iframe.webview").first().elementHandle();
      if (outerHandle) {
        const outerFrame = await outerHandle.contentFrame();
        if (outerFrame) {
          const children = outerFrame.childFrames();
          for (const child of children) {
            // Check the child for our .container element.
            try {
              await child.locator(".container").waitFor({ timeout: 1000 });
              return child;
            } catch {
              // not this one — fall through to the next child or retry
            }
          }
        }
      }
    } catch (err) {
      lastErr = err;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(
    `openIndicatorFrame timed out waiting for .container in any child frame of iframe.webview. ` +
    `Last error: ${(lastErr as Error | null)?.message ?? "none"}`,
  );
}

async function teardown(per: PerTest): Promise<void> {
  if (per.launch) {
    try { await closeVSCode(per.launch); } catch { /* best effort */ }
  }
  if (per.workspaceTmp) {
    try { cleanupTmpDir(per.workspaceTmp); } catch { /* best effort */ }
  }
  if (per.fakeHome) {
    try { fs.rmSync(per.fakeHome, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  restoreHomeEnv(per);
}

// -----------------------------------------------------------------------
// Scenario A: current Claude Opus → flagship gauge classes + label.
// -----------------------------------------------------------------------
test("renders current Opus marker with flagship tier classes + label", async () => {
  const per: PerTest = {};
  try {
    per.fakeHome = makeTmpDir("dabbler-pw-fakehome-A");
    setHomeEnv(per.fakeHome, per);
    seedMarker(per.fakeHome, {
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      writer: "test",
      signalKind: "current",
      confidence: "high",
      provider: "anthropic",
      providerDisplayName: "Claude",
      model: "claude-opus-4-7",
      modelDisplayName: "Opus 4.7",
      tier: "flagship",
      effort: {
        normalized: "medium",
        native: "default",
        thinking: false,
        signalKind: "current",
        confidence: "high",
      },
      stalenessMaxSec: 28800,
    });
    const workspace = makeWorkspace(per);
    per.launch = await launchVSCode(workspace);
    const frame = await openIndicatorFrame(per.launch);
    await expect(frame.locator(".gauge-cell.tier-flagship.signal-current")).toBeVisible();
    // Scoped to the model gauge sublabel (the table description also
    // contains "Claude Opus 4.7" — strict-mode requires a unique match).
    await expect(frame.locator(".gauge-cell.tier-flagship .gauge-sublabel")).toContainText(/Claude\s+Opus 4\.7/);
    // Stale stripe overlay should NOT be present on a fresh marker.
    await expect(frame.locator(".gauges.stale")).toHaveCount(0);
  } finally {
    await teardown(per);
  }
});

// -----------------------------------------------------------------------
// Scenario B: low-tier Haiku marker → low-tier classes + Haiku label.
// -----------------------------------------------------------------------
test("renders Haiku marker with low-tier classes", async () => {
  const per: PerTest = {};
  try {
    per.fakeHome = makeTmpDir("dabbler-pw-fakehome-B");
    setHomeEnv(per.fakeHome, per);
    seedMarker(per.fakeHome, {
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      writer: "test",
      signalKind: "current",
      confidence: "high",
      provider: "anthropic",
      providerDisplayName: "Claude",
      model: "claude-haiku-4-5-20251001",
      modelDisplayName: "Haiku 4.5",
      tier: "low",
      effort: {
        normalized: "medium",
        native: "default",
        thinking: false,
        signalKind: "current",
        confidence: "high",
      },
      stalenessMaxSec: 28800,
    });
    const workspace = makeWorkspace(per);
    per.launch = await launchVSCode(workspace);
    const frame = await openIndicatorFrame(per.launch);
    await expect(frame.locator(".gauge-cell.tier-low.signal-current")).toBeVisible();
    // Scoped to the model gauge sublabel (the table description also
    // contains "Claude Haiku 4.5" — strict-mode requires a unique match).
    await expect(frame.locator(".gauge-cell.tier-low .gauge-sublabel")).toContainText(/Claude\s+Haiku 4\.5/);
  } finally {
    await teardown(per);
  }
});

// -----------------------------------------------------------------------
// Scenario C: low-confidence marker → tooltip phrasing reflects it.
// -----------------------------------------------------------------------
test("renders confidence-low marker with explicit low-confidence tooltip", async () => {
  const per: PerTest = {};
  try {
    per.fakeHome = makeTmpDir("dabbler-pw-fakehome-C");
    setHomeEnv(per.fakeHome, per);
    seedMarker(per.fakeHome, {
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      writer: "claude-code-session-start-hook",
      signalKind: "current",
      confidence: "low",
      provider: "anthropic",
      providerDisplayName: "Claude",
      model: "unknown",
      modelDisplayName: "Claude (model unknown)",
      tier: "unknown",
      effort: {
        normalized: "medium",
        native: "default",
        thinking: false,
        signalKind: "current",
        confidence: "low",
      },
      stalenessMaxSec: 28800,
    });
    const workspace = makeWorkspace(per);
    per.launch = await launchVSCode(workspace);
    const frame = await openIndicatorFrame(per.launch);
    // The tooltip lives in the title attribute; assert via element selector.
    const cell = frame.locator(".gauge-cell.tier-unknown.signal-current").first();
    await expect(cell).toBeVisible();
    const tip = await cell.getAttribute("title");
    expect(tip || "").toContain("low confidence");
    expect(tip || "").toContain("hook payload missing model");
  } finally {
    await teardown(per);
  }
});

// -----------------------------------------------------------------------
// Scenario D: effort.signalKind = last-observed → clock overlay + time-elapsed suffix.
// -----------------------------------------------------------------------
test("renders last-observed effort with clock overlay and elapsed time suffix", async () => {
  const per: PerTest = {};
  try {
    per.fakeHome = makeTmpDir("dabbler-pw-fakehome-D");
    setHomeEnv(per.fakeHome, per);
    const observed = new Date(Date.now() - 12 * 60 * 1000).toISOString(); // 12m ago
    seedMarker(per.fakeHome, {
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      writer: "test",
      signalKind: "current",
      confidence: "high",
      provider: "anthropic",
      providerDisplayName: "Claude",
      model: "claude-opus-4-7",
      modelDisplayName: "Opus 4.7",
      tier: "flagship",
      effort: {
        normalized: "high",
        native: "/think",
        thinking: true,
        signalKind: "last-observed",
        confidence: "high",
        observedAt: observed,
      },
      stalenessMaxSec: 28800,
    });
    const workspace = makeWorkspace(per);
    per.launch = await launchVSCode(workspace);
    const frame = await openIndicatorFrame(per.launch);
    const effortCell = frame.locator(".gauge-cell.signal-last-observed").first();
    await expect(effortCell).toBeVisible();
    await expect(effortCell.locator(".clock-overlay")).toBeVisible();
    // Round 9: descriptive text moved from the round-7 table to a
    // vertical-stack of sections. The first .model-section-text
    // element (the actual model description) carries the
    // "(last /think 12m ago)" clause.
    await expect(frame.locator(".model-section-text").first()).toContainText(/last \/think 12m ago/);
  } finally {
    await teardown(per);
  }
});

// -----------------------------------------------------------------------
// Scenario E: signalKind=configured-default → dashed rim + (default) suffix
//             line. (Stripes are NOT used for configured-default per the
//             REVISED 2026-05-18 audit decision — stripes are stale-only.
//             The DEFAULT pill badge was replaced with a (default) suffix
//             line per operator feedback 2026-05-18 round 3 item 6 —
//             more compact, matches the effort gauge's parenthetical
//             style.)
// -----------------------------------------------------------------------
test("renders configured-default marker with (default) suffix (no stripes)", async () => {
  const per: PerTest = {};
  try {
    per.fakeHome = makeTmpDir("dabbler-pw-fakehome-E");
    setHomeEnv(per.fakeHome, per);
    seedMarker(per.fakeHome, {
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      writer: "codex-config-watcher",
      signalKind: "configured-default",
      confidence: "medium",
      provider: "openai",
      providerDisplayName: "Codex",
      model: "gpt-5-codex",
      modelDisplayName: "gpt-5-codex",
      tier: "flagship",
      effort: {
        normalized: "high",
        native: "high",
        thinking: false,
        signalKind: "configured-default",
        confidence: "medium",
      },
      stalenessMaxSec: 28800,
    });
    const workspace = makeWorkspace(per);
    per.launch = await launchVSCode(workspace);
    const frame = await openIndicatorFrame(per.launch);
    await expect(frame.locator(".gauge-cell.signal-configured-default").first()).toBeVisible();
    // Round 9: the "(configured default)" annotation lives in the
    // .model-section-text (vertical stack replaced the round-7 table).
    await expect(frame.locator(".model-section-text").first()).toContainText("configured default");
    // Critical: this is configured-default — stripes overlay class
    // must NOT be present on .gauges (stripes are stale-only).
    await expect(frame.locator(".gauges.stale")).toHaveCount(0);
    // No legacy chrome remaining: .default-pill dropped in round 3;
    // .gauge-suffix dropped in round 7; .model-table dropped in round 9.
    await expect(frame.locator(".default-pill")).toHaveCount(0);
    await expect(frame.locator(".gauge-suffix")).toHaveCount(0);
    await expect(frame.locator(".model-table")).toHaveCount(0);
  } finally {
    await teardown(per);
  }
});

// -----------------------------------------------------------------------
// Scenario F: 9h-old marker → stale class + "last updated 9h ago".
// -----------------------------------------------------------------------
test("renders stale state with diagonal-stripe class and last-updated annotation", async () => {
  const per: PerTest = {};
  try {
    per.fakeHome = makeTmpDir("dabbler-pw-fakehome-F");
    setHomeEnv(per.fakeHome, per);
    const nineHoursAgo = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
    seedMarker(per.fakeHome, {
      schemaVersion: 2,
      updatedAt: nineHoursAgo,
      writer: "test",
      signalKind: "current",
      confidence: "high",
      provider: "anthropic",
      providerDisplayName: "Claude",
      model: "claude-opus-4-7",
      modelDisplayName: "Opus 4.7",
      tier: "flagship",
      effort: {
        normalized: "medium",
        native: "default",
        thinking: false,
        signalKind: "current",
        confidence: "high",
      },
      stalenessMaxSec: 28800,
    });
    const workspace = makeWorkspace(per);
    per.launch = await launchVSCode(workspace);
    const frame = await openIndicatorFrame(per.launch);
    await expect(frame.locator(".gauges.stale")).toBeVisible();
    await expect(frame.getByText(/last updated 9h ago — stale/)).toBeVisible();
  } finally {
    await teardown(per);
  }
});

// -----------------------------------------------------------------------
// Scenario G: no marker → "No signal — install hook" CTA.
// -----------------------------------------------------------------------
test("renders empty-state CTA when marker file is absent", async () => {
  const per: PerTest = {};
  try {
    per.fakeHome = makeTmpDir("dabbler-pw-fakehome-G");
    setHomeEnv(per.fakeHome, per);
    deleteMarker(per.fakeHome); // ensure absence
    const workspace = makeWorkspace(per);
    per.launch = await launchVSCode(workspace);
    const frame = await openIndicatorFrame(per.launch);
    await expect(frame.locator(".empty-state")).toBeVisible();
    await expect(frame.getByText(/No signal/)).toBeVisible();
    await expect(frame.locator(".install-cta")).toContainText(/install hook/);
  } finally {
    await teardown(per);
  }
});

// -----------------------------------------------------------------------
// Scenario H: helper-script multi-writer precedence (non-Electron).
//             Tests the helper directly because the precedence skip is
//             a marker-writer concern, not a rendering concern.
// -----------------------------------------------------------------------
test("helper script skips configured-default write when current signal exists", async () => {
  const per: PerTest = {};
  try {
    per.fakeHome = makeTmpDir("dabbler-pw-fakehome-H");
    const helper = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "scripts",
      "write-orchestrator-marker.js",
    );
    expect(fs.existsSync(helper)).toBe(true);

    function runHelper(modeArgs: string[], payload: Record<string, unknown>): { exit: number; logEntries: number } {
      const result = cp.spawnSync(
        process.execPath,
        [helper, ...modeArgs],
        {
          input: JSON.stringify(payload),
          env: {
            ...process.env,
            USERPROFILE: per.fakeHome,
            HOME: per.fakeHome,
          },
          encoding: "utf8",
        },
      );
      const logPath = path.join(per.fakeHome!, ".dabbler", "orchestrator-writer.log");
      const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
      return {
        exit: result.status ?? -1,
        logEntries: log.split("\n").filter((l) => l.trim().length > 0).length,
      };
    }

    // Write a current Claude marker.
    let r = runHelper(["--mode", "session-start"], {
      hook_event_name: "SessionStart",
      source: "startup",
      model: "claude-opus-4-7",
    });
    expect(r.exit).toBe(0);
    expect(r.logEntries).toBe(0);

    // Try to write a configured-default Codex marker — should be skipped.
    r = runHelper(["--mode", "configured-default", "--writer", "codex-config-watcher"], {
      provider: "openai",
      model: "gpt-5-codex",
      effort: { normalized: "high", native: "high" },
    });
    expect(r.exit).toBe(0);
    expect(r.logEntries).toBe(1);

    // Marker should still be the Claude current signal.
    const marker = JSON.parse(
      fs.readFileSync(
        path.join(per.fakeHome, ".dabbler", "current-orchestrator.json"),
        "utf8",
      ),
    );
    expect(marker.signalKind).toBe("current");
    expect(marker.model).toBe("claude-opus-4-7");
  } finally {
    if (per.fakeHome) {
      try { fs.rmSync(per.fakeHome, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
});
