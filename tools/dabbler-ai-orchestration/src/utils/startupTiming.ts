// Set 110 Session 2 — host-side startup instrumentation.
//
// WHY THIS EXISTS. Session 1 was asked to measure startup in four
// buckets (module load, `activate()`, `resolveWebviewView()`, first
// paint) inside a real extension host, and could not: separating them
// requires emitting timestamps from inside product code, and S1's own
// plan forbade touching shipping code ("Touches: nothing shipping").
// S1 recorded that conflict rather than resolving it unilaterally and
// assigned the instrumentation here, because Session 2 is building the
// native provider anyway and can emit the SAME marks from both
// implementations — which is the only way Session 4's before/after can
// be per-bucket rather than one aggregate number.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not try to observe FIRST
// PAINT. The host cannot see when a row becomes visible; only the
// renderer can, and asking the renderer would mean instrumenting a
// webview Session 3 deletes. Layer 3 already observes paint end-to-end
// by waiting on the DOM (`real-host-baseline.spec.ts`), which is both
// more honest and implementation-agnostic — the same harness can time
// the webview's first row and the native tree's first row through the
// same protocol. So: the host buckets are measured here, first paint
// stays measured there, and neither claims to be the other.
//
// COST WHEN UNUSED. Six `Date.now()` calls and a small object. The file
// write happens only when `DABBLER_STARTUP_TIMING_PATH` is set, which
// is how the harness harvests without driving the UI — Session 1 lost
// two real-host attempts to a flaky command palette, and a measurement
// path that depends on the thing being measured is not one to repeat.

import * as fs from "fs";
import * as path from "path";

export interface StartupMarks {
  /**
   * Milliseconds since the extension-host PROCESS started, captured when
   * this module was first imported. That import happens as part of
   * loading `dist/extension.js`, so it is the closest the extension can
   * stand to "how long before my code began running".
   */
  moduleLoadedAtUptimeMs: number | null;
  /** Epoch ms for each mark. Absent marks stay null so a gap is visible rather than implied. */
  moduleLoadedAt: number | null;
  activateStart: number | null;
  activateEnd: number | null;
  webviewResolveStart: number | null;
  webviewResolveEnd: number | null;
  /** First `getChildren(undefined)` served by the native tree — i.e. VS Code asked for roots. */
  treeFirstChildrenServed: number | null;
  /** How many root modules that first call returned; 0 is a legitimate answer, not a failure. */
  treeFirstChildrenCount: number | null;
}

export interface StartupDurations {
  activateMs: number | null;
  webviewResolveMs: number | null;
  /**
   * `activate()` end -> the tree's first root request.
   *
   * READ THIS BEFORE QUOTING IT. VS Code does not ask a `TreeDataProvider`
   * for anything until its view becomes VISIBLE, so this is
   * "activation-end to the moment the operator first opened the Work
   * Explorer" — which is a startup number only when the view was already
   * open at launch. If the operator opens the view ten minutes in, this
   * reads ten minutes. It is here because the delta IS meaningful under
   * the Layer-3 harness (which opens the view immediately) and because
   * omitting it would leave the tree's own first-work moment unmeasured;
   * it is not a figure to put in a CHANGELOG.
   *
   * Null when either mark is missing.
   */
  activateEndToTreeRootsMs: number | null;
}

const marks: StartupMarks = {
  moduleLoadedAtUptimeMs: null,
  moduleLoadedAt: null,
  activateStart: null,
  activateEnd: null,
  webviewResolveStart: null,
  webviewResolveEnd: null,
  treeFirstChildrenServed: null,
  treeFirstChildrenCount: null,
};

// Captured at import. `process.uptime()` is seconds since this process
// started, so this is genuinely "module load", not "activation".
try {
  marks.moduleLoadedAt = Date.now();
  marks.moduleLoadedAtUptimeMs = Math.round(process.uptime() * 1000);
} catch {
  // A host without `process` (never today, but the reader should not
  // assume) simply gets null marks rather than a failed activation.
}

export function markActivateStart(): void {
  marks.activateStart = Date.now();
}

export function markActivateEnd(): void {
  marks.activateEnd = Date.now();
  emitIfRequested();
}

/**
 * FIRST resolve only. A `WebviewView` is re-resolved whenever the view is
 * recreated (hide, re-expand, window reload), and a later resolve would
 * silently replace the startup figure Session 4 is going to quote —
 * first-wins is the same rule `markFirstChildrenServed` follows, and
 * these two were inconsistent until verification round 1 pointed it out.
 */
export function markWebviewResolveStart(): void {
  if (marks.webviewResolveStart !== null) return;
  marks.webviewResolveStart = Date.now();
}

export function markWebviewResolveEnd(): void {
  // Guard on the END mark, not the start: a start with no end means the
  // first resolve is still in flight and this IS its end.
  if (marks.webviewResolveEnd !== null) return;
  marks.webviewResolveEnd = Date.now();
  emitIfRequested();
}

/** First root request only — later refreshes must not overwrite the startup number. */
export function markFirstChildrenServed(count: number): void {
  if (marks.treeFirstChildrenServed !== null) return;
  marks.treeFirstChildrenServed = Date.now();
  marks.treeFirstChildrenCount = count;
  emitIfRequested();
}

export function readStartupMarks(): StartupMarks {
  return { ...marks };
}

/**
 * Clear every mark. TEST-ONLY, and named so nobody mistakes it for a
 * runtime affordance — the marks are process-lifetime by design.
 *
 * It exists because the first-wins guards above make the module
 * stateful, and without a reset the tests for those guards can only be
 * written in an order-dependent way. Verification round 1 caught exactly
 * that: a "zero root modules" test that passed on state a PREVIOUS test
 * had left behind, asserting nothing about zero at all.
 */
export function resetStartupMarksForTests(): void {
  marks.activateStart = null;
  marks.activateEnd = null;
  marks.webviewResolveStart = null;
  marks.webviewResolveEnd = null;
  marks.treeFirstChildrenServed = null;
  marks.treeFirstChildrenCount = null;
}

const delta = (from: number | null, to: number | null): number | null =>
  from === null || to === null ? null : to - from;

export function startupDurations(m: StartupMarks = marks): StartupDurations {
  return {
    activateMs: delta(m.activateStart, m.activateEnd),
    webviewResolveMs: delta(m.webviewResolveStart, m.webviewResolveEnd),
    activateEndToTreeRootsMs: delta(m.activateEnd, m.treeFirstChildrenServed),
  };
}

/**
 * Write the marks to `DABBLER_STARTUP_TIMING_PATH` when it is set.
 *
 * Called after every mark rather than once, because there is no single
 * moment that is reliably "last": a run that never opens the Work
 * Explorer has no tree marks, and a run that never opens the webview
 * has no resolve marks. Rewriting the whole file each time keeps it
 * complete-as-of-now and costs a few hundred bytes on a path nobody
 * takes unless they asked for it.
 *
 * Fail-open, and LOUDLY: a measurement harness that silently wrote
 * nothing would be indistinguishable from a fast startup, which is
 * precisely the confusion Session 1 spent three verification rounds on.
 */
function emitIfRequested(): void {
  const target = process.env.DABBLER_STARTUP_TIMING_PATH;
  if (!target) return;
  const payload = {
    marks: readStartupMarks(),
    durations: startupDurations(),
    note:
      "Host-side buckets only. First paint is NOT here — it is observed " +
      "from the DOM by the Layer 3 harness, because the host cannot see " +
      "when a row becomes visible.",
  };
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(payload, null, 2), { encoding: "utf-8" });
  } catch (err) {
    console.error(
      `[dabbler-ai-orchestration] startup timing: could not write ` +
        `DABBLER_STARTUP_TIMING_PATH (${target}) — the harness will find no ` +
        `file, which must NOT be read as "startup was not instrumented".`,
      err,
    );
  }
}
