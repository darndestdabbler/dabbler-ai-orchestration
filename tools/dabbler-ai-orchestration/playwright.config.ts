// Playwright config for Layer 3 of the orchestrator e2e harness
// (Set 027 Session 4). Scoped to ``src/test/playwright/`` so it does
// not collide with the @vscode/test-electron Mocha suite under
// ``src/test/suite/``.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./src/test/playwright",
  testMatch: /.*\.spec\.ts$/,
  // Per spec § Session 4: text-only assertions (Option B). The launch
  // itself is the long tail (~30s cold start), so a per-test timeout
  // of 90s gives the test body ~60s after activation.
  timeout: 90_000,
  // 2026-08-11 (ad-hoc PR): raised from 1. The old comment read "single
  // worker because each test launches a full VS Code Electron instance
  // — running them in parallel hammers the host and tends to fight over
  // user-data-dir locks." That justification was STALE: Set 117 S1 moved
  // the launch onto a shared seam where every call gets a fresh
  // user-data-dir, a fresh extensions-dir AND a fresh platform state
  // root (APPDATA / LOCALAPPDATA / HOME) via mkdtemp, and
  // `launchVSCode`'s own docstring now says the launch is "fully
  // isolated ... so concurrent test invocations cannot fight over
  // profile state." The contention the config was avoiding had already
  // been engineered away; only the config had not caught up.
  //
  // Measured before this change: 23.3 min for 40 scenarios on one
  // worker, of which the great majority is 40 cold VS Code launches.
  // `fullyParallel: false` is kept deliberately, so the unit of
  // parallelism is the FILE and a file's tests still run in order in
  // one worker — parallel workers, each running a sequence.
  //
  // If this ever proves flaky, the cause to check first is memory:
  // four Electron instances at roughly 0.5–1 GB each against a 7–16 GB
  // runner. Drop to 2 before dropping the isolation.
  workers: 4,
  fullyParallel: false,
  // Set 110 S4: add the `github` reporter in CI so each failure becomes a
  // workflow ANNOTATION carrying the spec file, line and message.
  //
  // Why it matters beyond tidiness: the macOS leg had been red for days and
  // nobody could say WHICH test failed, because job logs and the uploaded
  // results artifact both require repo authentication to read, while
  // annotations are readable from the public API. The failure was therefore
  // diagnosable only by someone with both credentials and a Mac. With this,
  // the run itself names the failing spec — the same reasoning as the macOS
  // binary-lookup repair, which made the error report what it actually found
  // instead of costing a CI round-trip per guess.
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    actionTimeout: 15_000,
  },
});
