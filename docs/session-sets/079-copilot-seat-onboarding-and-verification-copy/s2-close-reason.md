# Session 2 close reason — Set 079

Session 2 of 5 ("Wire the happy path — sequencing, subprocess, progress,
config write") completed with a clean cross-provider verification on
round 3 (rounds 1–2 found and drove out a single ledger issue; see below).

## What landed

- `src/utils/copilotSeatSetup.ts` — the VS Code-free seat-setup core:
  - **Seat identity (C1):** `deriveSeatId` = `seat-` +
    sha256(hostname|username)[:12] (trimmed/lowercased inputs);
    `deriveSeatLabel` = workspace basename with a `workspace` fallback.
    Zero operator typing.
  - **Refresh runner (M1):** cancellable child process with pre-run
    lockfile snapshot; every non-completed path (cancel, teardown, spawn
    error, non-zero exit) restores the snapshot (delete-if-absent-before
    / rewrite-prior-content). Teardown hook re-runs the restore from the
    child's `close` event so a racing final truncate-write cannot
    survive the exit; a completed run (exit 0 + parseable summary) wins
    over a late cancel; a killed-but-hung child force-settles after a
    bounded timeout.
  - **Result parsing (provider-count check):** the CLI's own stdout line
    (`Wrote <path>: N/M models confirmed, providers=[...]`) is the only
    success signal — exit code is never trusted (the CLI exits 0 even on
    <2 providers, per the pinned M5 contract).
  - **Config write (M4):** `renderTransportProfile` — an anchored
    DIRECT-CHILD field replacement inside the `transport:` block; fails
    loud on a missing anchor or an operator-edited value; never appends;
    a nested sub-block `profile:` key can never match (cross-verifier
    Major, fixed with a pinning test). `readTransportProfile` is the
    durable `transportProfileSeed` source the S1 close-out asked for.
- `gitScaffold.ts` — the sequencing gate as a pure decision
  (`decideCopilotSeatSetup`, consuming the completed scaffold's
  `installOk` + `venvPath`), the seat setup awaited strictly after the
  scaffold step (and before any `vscode.openFolder` reload), the
  cancellable INDETERMINATE notification (the CLI emits no per-model
  output — determinate progress is not parseable; critique-m2 fallback
  recorded), win32 `taskkill /T` tree-kill, subscriptions push/splice
  hygiene, per-outcome honest messaging with a copy-pasteable
  "re-run seat setup, no re-scaffold" hint (incl. `--binary` when an
  explicit `copilotCliPath` is set).
- Protocol/webview: `transportProfile` rider on `build-structure`
  (Full-only; fail-loud narrowing `asTransportProfileRider` /
  `resolveTransportProfile`), client.js posts it, the seed thunk in
  `CustomSessionSetsView` reads the workspace router-config.
- Tests: 72 new Layer-2 tests (copilotSeatSetup.test.ts 54,
  gitScaffoldSeatSetup.test.ts 18); full suite 1206 passing.

## Real-seat dogfood (happy path, spec "Ends with")

`performCopilotSeatSetup` run with the real venv python + real GitHub
Copilot CLI 1.0.68 against a scratch project (2026-07-05): SUCCESS in
102 s — 15/18 models confirmed, providers = [anthropic, google, openai],
`transport.profile: copilot-cli` written by the anchored render, valid
lockfile round-trips. Same seat as Set 078's dogfood (single personal
seat; the multi-seat honesty caveat stays for S5's docs).

## Verification

- Routed gate: REQUIRED (blast-radius, multi-module, breadth).
- Routed code-review (opus → gpt-5-4 auto-verify): 2 Majors
  (teardown-restore race; late-cancel-after-completed race) + 1
  cross-verifier Major (nested-profile locator) — all fixed in-session
  with pinning tests; Minors 3/4/6/8 fixed.
- Session verification (gpt-5-4, OpenAI): R1 ISSUES_FOUND (1 Major —
  integration wiring unpinned), R2 held the same ledger issue
  (S2-V-001) as partially fixed, R3 **VERIFIED**. Artifacts:
  `s2-verification.md`, `-round-2.md`, `-round-3.md`, `s2-issues.json`,
  `s2-issues-round-2.json`.
- Suites at close: Layer-2 mocha 1206 passing; `tsc --noEmit` clean;
  eslint clean; pytest 2483 passed / 5 skipped; Playwright Layer 3
  19 passed (re-run after the final dist rebuild).

## Knowingly accepted residuals (named for Session 3's failure matrix)

- The `router-config.yaml` write is not atomic (no temp+rename); a
  mid-write crash is caught and reported as `config-write-failed` but
  could leave a damaged file. S3 failure-matrix scope.
- POSIX cancel kills only the python child; an in-flight `copilot`
  grandchild is bounded by its own per-probe timeout but not
  tree-killed (win32 does taskkill /T). Revisit in S3's induced-failure
  dogfood.
- The full failure UX (DABBLER_* presence check before offering `api`
  as a fallback, the keyless honest messaging) is Session 3 by design.
