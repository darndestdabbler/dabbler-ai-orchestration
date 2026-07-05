# Session 3 close reason — Set 079

Session 3 of 5 ("Failure matrix, honest failure UX, and E2E judgment")
completed with a clean cross-provider verification on round 2 (round 1
found two test-coverage gaps; both fixed and re-verified).

## What landed

- **Honest failure UX (critique C3 — the set's most consequential
  correctness requirement).** `describeSeatSetupOutcome(outcome,
  providerKeysPresent, rerunHint)` — a pure, Layer-2-pinnable composer in
  `copilotSeatSetup.ts` — now produces every seat-setup message,
  replacing the inline switch in `gitScaffold.ts`. It is keyed on
  `providerKeyPresent(process.env)`, the same `DABBLER_*` probe the
  Full-tier inline key warning uses. The two honest states, enforced by
  tests in both directions (positive AND negative assertions):
  - **keyless** (the target audience — a Copilot-locked shop where no
    `DABBLER_*` key is possible): every failure says plainly the router
    is **not yet functional**, plus reason-specific fix guidance. No
    message implies `api` "still works."
  - **keys present**: `api` is affirmed as a genuinely working fallback.
  Reason-specific guidance inside `insufficient-providers`:
  `confirmed == 0` → the CLI may be missing / not signed in / blocked
  (re-run can help); exactly one provider family → the
  enterprise-locked-seat shape (a plain re-run will NOT change the
  result — the multi-seat honesty stance carried forward to S5's docs).
  `config-write-failed` instructs the one-field hand edit ("no re-probe
  is needed"); `skip-install-incomplete` carries the same honesty suffix
  via `describeSkipInstallIncompleteHonesty`.
- **S2 residual 1 — atomic config write.** `writeConfigAtomically`
  stages `<config>.dabbler-seat-setup.tmp` and renames over the target
  (new optional `FileOps.rename`; the real ops implement
  `fs.renameSync`; ops without `rename` fall back to the plain write; a
  failed rename cleans its temp and surfaces as `config-write-failed`).
  The guarantee is deliberately scoped to **process-crash atomic
  replacement** — power-loss durability (fsync) is out of scope, and the
  code comment says so.
- **S2 residual 2 — POSIX process-tree kill.** The refresh child spawns
  `detached` on POSIX (its own process-group leader;
  `spawnDetached(platform)`), and cancel-kill dispatches through the
  extracted, exported `dispatchKill(platform, pid, KillEffects)`:
  win32 `taskkill /pid <pid> /T /F`, POSIX `process.kill(-pid,
  "SIGTERM")`, sync-throw fallback to the plain kill. The real effects
  live in the exported `makeRealKillEffects(child, spawnFn)` factory,
  whose async taskkill-`error`-event fallback to `child.kill()` is
  unit-pinned via the `TaskkillSpawn` seam.
- **requiresE2E "suggested" — decision recorded: NO new Playwright
  Layer-3 spec.** The async-progress surface is a native
  `vscode.window.withProgress` notification, not webview DOM — the
  Layer-3 harness renders the webview in a browser and cannot drive
  native notifications. Everything behind the surface is pinned at
  Layer 2 through the S2 seams against the real code paths; Sessions
  2–3 added no new webview DOM. (Full reasoning in the activity log,
  step `s3.e2e-decision`.)
- **Tests:** 31 new Layer-2 tests (suite 1206 → 1237 passing): the
  honesty matrix (5 outcome kinds × keyed/keyless, both halves of the
  invariant), atomic-write unit + `performCopilotSeatSetup` integration
  (rename-throws ⇒ `config-write-failed`, original intact),
  `dispatchKill` dispatch + fallbacks, `makeRealKillEffects` async
  taskkill fallback, kill-strategy/detach selectors.

## Real induced-failure dogfood (spec step 3)

Driver: session-scratchpad `s3_dogfood.js` (real venv python + real
GitHub Copilot CLI 1.0.68, scratch project, 2026-07-05):

- **Run A — missing binary** (`--binary` pointed at a nonexistent
  executable, the "CLI missing after selection" defense): completed in
  0.3 s, 0/18 confirmed, `providers=[]` → `insufficient-providers`;
  lockfile kept (the CLI's own valid artifact); config stayed `api`;
  the keyless message said "not yet functional" + "the Copilot CLI may
  be missing from PATH".
- **Run B — REAL mid-run cancel** at 15 s: the python child (pid 14948)
  had two live descendant processes at cancel time; after cancel the
  outcome was `cancelled`, the python pid was dead, **both descendants
  were dead** (taskkill /T tree-kill verified against the real process
  tree), and **no partial lockfile** remained (restored to the pre-run
  absent state).
- **Run C — real-NTFS atomic write**: temp + rename replaced an
  existing `router-config.yaml` (`profile: api` → `copilot-cli`) with
  no tmp file left behind.

## Verification

- Routed gate: REQUIRED (blast-radius, multi-module, breadth).
- Routed code-review (opus → gpt-5-4 auto-verify VERIFIED): 1 Major
  (POSIX kill dispatch had zero unit coverage → extracted injectable
  `dispatchKill` + 5 tests) + 2 Minors + 3 suggestions — all fixed
  in-session.
- Session verification (gpt-5-4, OpenAI): R1 returned two findings with
  **no verdict token and no severities** — treated as blocking per the
  L-071-1 anti-laundering rule; ledger ids S3-V-001 (async
  taskkill-error fallback untested) and S3-V-002 (skip-install honesty
  tests missing the negative half), both fixed. R2 (narrow, fixes-only)
  **VERIFIED**, both ledger ids resolved, no regression. Artifacts:
  `s3-verification.md`, `s3-verification-round-2.md`, `s3-issues.json`.
- Suites at close: Layer-2 mocha 1237 passing; `tsc --noEmit` clean;
  changed-files eslint clean (6 pre-existing `no-var-requires` errors in
  5 test files untouched since Set 077 are baseline, not S3
  regressions); pytest 2483 passed / 5 skipped; Playwright Layer 3
  19 passed (belt-and-suspenders — no rendering surface changed).

## Knowingly accepted residuals / limitations (for S5's docs honesty)

- The POSIX process-group kill is **unit-pinned but not live-dogfooded**
  — this session ran on a win32 host, so the real-CLI cancel dogfood
  exercised the taskkill /T branch only. The POSIX branch's mechanism
  (detached spawn + `kill(-pid)`) is standard and fully covered by the
  `dispatchKill` tests, but no real POSIX process tree has been killed
  by it yet.
- `writeConfigAtomically` guarantees process-crash atomic replacement,
  not power-loss durability (no fsync of the temp fd or directory) —
  deliberate scope, recorded in the code comment (S3 review finding 5).
- The 6 pre-existing eslint `no-var-requires` errors in Set-077-era test
  files remain; out of S3 scope, worth a cleanup pass in some future
  housekeeping session.
