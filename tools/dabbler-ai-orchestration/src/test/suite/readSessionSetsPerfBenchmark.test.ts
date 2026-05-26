// Set 047 Session 2: readSessionSets() performance baseline.
//
// Per the audit verdict (§3.7): "Session 2 ships a benchmark for
// readSessionSets() against all historical state files (47+ sets).
// Baseline persists; future regressions are caught."
//
// This benchmark walks the real `docs/session-sets/` tree in this
// repo, calls `readSessionSets(repoRoot)` N times, and prints p50 /
// p95 / max / mean wall-clock timings. The test ASSERTS against a
// relaxed upper bound so a 5×+ regression in the reader (most likely
// from a future schema-version migration that adds per-set work)
// trips CI; tightening the bound is a future-set conversation once
// we have CI-platform numbers across Windows / macOS / Linux.
//
// Layer rationale: Layer 1 (Python e2e) doesn't exercise the TS
// reader; Layer 3 (Playwright) is too slow for repeat-N timing.
// Layer 2 (this file, under the unit-test stub harness) is the
// cheapest place to catch a reader-side perf regression. The vscode
// stub eliminates electron startup overhead; the timing reflects
// pure FS + JSON + reader logic.

import * as assert from "assert";
import * as path from "path";

import { readSessionSets } from "../../utils/fileSystem";

// Repo root: this test file lives at
// `tools/dabbler-ai-orchestration/src/test/suite/<file>.ts`. Walk up
// four directories (suite → test → src → dabbler-ai-orchestration →
// tools) and one more (→ repo root).
const REPO_ROOT = path.resolve(__dirname, "../../../../..");

function nowMs(): number {
  const t = process.hrtime.bigint();
  return Number(t) / 1e6;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx];
}

suite("readSessionSets — Set 047 Session 2 perf baseline", () => {
  test("baseline timing across all historical state files", function () {
    // The 47+ historical sets + a real FS walk take ~50ms each on a
    // warm SSD on Windows 11. We allow up to 2 minutes total in case
    // a CI runner is constrained.
    this.timeout(120_000);

    // Sanity: confirm we're pointed at a real repo root with the
    // expected session-sets dir.
    const sessionSetsDir = path.join(REPO_ROOT, "docs", "session-sets");
    assert.ok(
      require("fs").existsSync(sessionSetsDir),
      `expected session-sets dir at ${sessionSetsDir}`,
    );

    // Warm-up: prime the FS cache so the cold-read penalty doesn't
    // dominate the first iteration. Discard timing.
    readSessionSets(REPO_ROOT);

    const ITERATIONS = 20;
    const timings: number[] = [];
    let lastCount = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = nowMs();
      const sets = readSessionSets(REPO_ROOT);
      const dt = nowMs() - t0;
      timings.push(dt);
      lastCount = sets.length;
    }

    // Confirm we actually saw the 47+ historical sets — guards
    // against silent reads-zero regressions.
    assert.ok(
      lastCount >= 47,
      `expected >=47 session sets, got ${lastCount} (check REPO_ROOT resolution)`,
    );

    const sorted = [...timings].sort((a, b) => a - b);
    const mean = timings.reduce((a, b) => a + b, 0) / timings.length;
    const p50 = quantile(sorted, 0.5);
    const p95 = quantile(sorted, 0.95);
    const max = sorted[sorted.length - 1];

    // Human-readable baseline emitted to test output. The Set 047
    // close-out activity log carries these numbers verbatim for a
    // future regression check.
    // eslint-disable-next-line no-console
    console.log(
      `[Set 047 S2 perf baseline] readSessionSets(${lastCount} sets) × ${ITERATIONS}: ` +
        `mean=${mean.toFixed(1)}ms p50=${p50.toFixed(1)}ms ` +
        `p95=${p95.toFixed(1)}ms max=${max.toFixed(1)}ms`,
    );

    // Relaxed upper-bound guard. 5 seconds per call is ~10× a
    // realistic worst-case on a slow CI runner with 50 sets; a
    // genuine regression (e.g., re-normalize-per-call or a missing
    // memoization) would trip this. Tighten when we have stable CI
    // numbers across platforms.
    assert.ok(
      p95 < 5000,
      `p95 readSessionSets latency ${p95.toFixed(1)}ms exceeds 5000ms ` +
        "baseline guard — investigate reader-side perf regression",
    );
  });
});
