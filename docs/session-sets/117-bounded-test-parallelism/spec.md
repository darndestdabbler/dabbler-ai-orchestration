# Bounded Test Parallelism Spec

> **Purpose:** Set 116 Session 1 makes the pytest suite parallel. This set
> finishes the job on the other half — Playwright, which becomes the
> dominant test cost the moment pytest drops — and replaces "use all the
> cores" with a **measured, bounded** worker policy, because on this
> hardware unbounded parallelism costs the operator their machine and, in
> one measured case, makes the suite *slower*.
>
> **Created:** 2026-08-10, from measurement.
> **Prerequisites:** Set 116 complete — its Session 1 chooses the pytest
> worker configuration this set audits.
> **Session Set:** `docs/session-sets/117-bounded-test-parallelism/`
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false        # No UI surface changes. The deliverable is how the suites RUN, not what they render.
requiresE2E: true         # The entire deliverable is Layer 3 behaviour; it can only be judged by running it, repeatedly.
uatStyle: ad-hoc
pathAwareCritique: advisory
prerequisites:
  - slug: 116-session-latency-and-verification-integrity
    condition: complete
```

---

## The measurements this set acts on

Measured 2026-08-10 on the **operator's session machine** (14 logical CPUs,
31.5 GB) — deliberately not the faster 20-core/64 GB machine, because
Electron workers are memory-bound and the binding constraint is the machine
sessions actually run on.

| Playwright config | Time | Speedup |
| :--- | ---: | ---: |
| `workers: 1` (today) | **10.1 min** | — |
| `workers: 4` | **7.08 min** | **1.43x** |

36 tests passed under both. **Isolation is PARTIAL — the first draft of this
spec overstated it.** `electronLaunch.ts:613-620` does create a fresh
`user-data-dir` and a fresh extensions-dir per launch, but
`scripts/vscode-launch.js:60,69` **inherits `HOME`, `USERPROFILE`,
`APPDATA` and `LOCALAPPDATA`** — they are *not* tmpdir-scoped. Shared
`APPDATA`/`LOCALAPPDATA` is where VS Code writes state, and is a live
candidate cause of the two 8-worker failures. **Do not assume those
failures were CPU starvation; that was never verified.**

**Runner capabilities differ, and the difference matters.** Playwright 1.60
natively supports percentage workers (`workers: '50%'`) and built-in
`retries`. **`pytest-xdist` does NOT support percentages**: it accepts
`auto` (**physical** cores, not logical), `logical` (needs `psutil`), an
explicit integer, or `0`. It also exposes `--maxprocesses=N`, the
`PYTEST_XDIST_AUTO_NUM_WORKERS` environment variable, and a
`pytest_xdist_auto_num_workers` hook a `conftest.py` may implement to
compute the count itself — which is the portable place to put this logic,
since `conftest.py` ships to PyPI consumers who have no extension.

**`local-overrides.yaml` will not accept a `testing:` block as it stands.**
`ai_router/config.py::_apply_local_overrides` raises on paths outside
`_LOCAL_OVERRIDE_ALLOWED` and **silently warns-and-ignores unknown
top-level keys**. Using it for worker settings requires adding the key to
that allowlist in the same change, or the setting is written and never read.

**The first draft's projections were wrong.** It claimed ~2.5 min for the
parallel pool and ~4.5 min total. The measured 8-worker run of 35 tests took
**5.08 min and went red**, so the realistic target after quarantine is
**~7 min against 10.1 today**. Session 1 records what it measures; it must
not inherit these numbers.

**One test explains the entire poor speedup.**
`real-host-baseline.spec.ts` — *"measures cold launch-to-first-row for the
shipping native tree"*:

- **alone: 1.9 min**
- **under 4 workers: 4.2 min**
- **= 60% of the whole 7.08-minute parallel run**

Two distinct defects, not one:

1. **It sets the floor.** Nothing can finish faster than the longest test,
   so 4.2 min bounds the suite no matter how many workers are added.
2. **Parallelism corrupts what it measures.** The test exists to record a
   real-host **cold launch** baseline. Run against three competing VS Code
   instances it measures contention instead. Its number becomes wrong, and
   wrong quietly — the test still passes.

**Unbounded pytest parallelism costs the operator the machine.** On the
20-core machine `-n auto` spawns 20 workers and the operator reported being
*"barely able to use my desktop."* The last workers buy the least: the
speedup curve flattens long before core count, so the final few cores trade
a usable machine for seconds.

**The operator observed NO machine slowdown at 8 workers.** That is the
decisive datum. If the machine was not saturated, the 2 failures were not
CPU starvation — and the poor speedup (35 tests, 8 workers, only ~1.6x over
serial) is not saturation either. Both point at the same suspect: **shared
`APPDATA` / `LOCALAPPDATA` serializing and colliding across launches.**
Shared state would explain the failures *and* the missing speedup, which
CPU contention alone does not.

**CI runs everything again, three times.** `.github/workflows/test.yml`
matrices both pytest and Playwright across `ubuntu-latest`, `macos-latest`
and `windows-latest`. Those jobs run in parallel, so CI *wall clock* is the
slowest job, not the sum — but CI wall clock gates **releases** through the
`require-green-test` action, not sessions.

## Decisions already made — do not reopen

1. **Isolation is fixed before the worker ceiling is chosen.** The ceiling
   is a consequence of how well launches are isolated, so choosing it first
   would cap the suite at a number that only reflects a bug.
2. **Parallelism is bounded by measurement, never by `auto`.** A worker
   count is chosen because it was measured on the target machine, and the
   config records the number *and the reason*.
3. **The baseline-measurement test is quarantined, not deleted.** Its number
   is the only real-host cold-launch datum the repo has. It runs alone.
4. **Retries never turn red into green.** A failure that passes in isolation
   is a *diagnostic*, not a pass.
5. **No test deletion, and no test-selection tooling.** Same as Set 116:
   measured payoff is near zero and the risk is shipping a regression.
6. **Probe-and-adjust is refused for now.** Both consulted reviewers priced
   it at 250-500 lines for under a minute of typical benefit, and it needs a
   custom two-invocation runner that partitions the suite and stitches two
   reports together. Revisit only if telemetry later shows load-driven
   variance actually costing time.
7. **The `Dabbler: Adjust Test Workers` command is deferred**, not refused.
   Tuning should be rare once the default is safe. If it ships later it only
   shows/sets/resets, writing through a shared CLI so PyPI consumers keep
   parity.

## Non-goals

- **No new Playwright tests.**
- **No change to what the tests assert.** This set changes how they are
  scheduled and isolated, and nothing else.
- **No sharding across machines.** One machine, bounded workers.
- **No fixing of product races**, if that is what Session 1 finds. Recording
  them precisely is in scope; repairing them is a later set.

---

## Sessions

### Session 1 of 3: Isolate the launch, then re-test the ceiling

The hypothesis this session exists to settle: **the failures and the poor
speedup have one cause, and it is shared state, not CPU.**

**Steps:**

1. Register.
2. **Give every launch its own `APPDATA` / `LOCALAPPDATA`** (and
   `HOME` / `USERPROFILE`) pointing at a fresh tmpdir.
   `vscode-launch.js::electronEnv` merges its `extra` argument **after**
   allowlist filtering, and `electronLaunch.ts` already has a
   `homeOverride` path for `HOME`/`USERPROFILE` — so this extends an
   existing seam rather than inventing one. Keep the allowlist discipline
   intact: the point is to *scope* these variables, not to widen what is
   inherited.
3. **Re-test the ceiling.** Re-run the 8-worker configuration that
   previously failed. If isolation fixes both the failures and the speedup,
   the ceiling is far above 4 and the whole "bounded workers" framing
   relaxes. Sweep upward from the last known-good rather than assuming a cap.
4. **Record the outcome either way.** If failures persist under full
   isolation, they are **product races** exposed by a schedule this suite
   has never run — a real finding, out of scope to fix, and it must be
   written down rather than relabelled as flakiness.
5. Full Layer 3 and pytest at close after freeze; verify, close.

**Creates:** per-launch env isolation, the re-measured ceiling, the race-vs-contention verdict
**Touches:** `tools/dabbler-ai-orchestration/scripts/vscode-launch.js`, `src/test/playwright/electronLaunch.ts`
**Ends with:** launches no longer share machine-wide state, and the worker ceiling is a measurement rather than a guess.
**Progress keys:** `envIsolated`, `ceilingRetested`, `raceVerdict`

---

### Session 2 of 3: Quarantine the measurement, and make retries loud

**Steps:**

1. Register.
2. **Quarantine `real-host-baseline`.** Give it its own Playwright project
   pinned to one worker **with nothing else running** — a `describe.serial`
   alone does not guarantee that, so use a project dependency or a separate
   invocation. Record the isolated figure (1.9 min, 2026-08-10) beside it so
   a later contended reading is visibly wrong.
3. **Set the worker count from Session 1's re-measurement**, sweeping around
   it and keeping the best that leaves the desktop usable. **Record the
   sweep, not just the winner**, and the reason in the config comment.
4. **Loud retries, never forgiving ones.** Primary run at `retries: 0`; on
   failure, re-run `--last-failed --workers=1 --retries=0`; **preserve the
   original red exit regardless of isolated success**; report either
   `FAILED; PASSED IN ISOLATION — RACE/CONTENTION CANDIDATE` or
   `FAILED AGAIN IN ISOLATION`. Keep both attempts' artifacts. A green
   "flaky" annotation that hides a race is the outcome this framework exists
   to prevent.
5. **Three consecutive green runs** at the chosen setting before it is
   trusted; then full Layer 3 at close after freeze; verify, close.

**Creates:** the quarantined baseline project, the worker setting and its sweep, the loud-retry path
**Touches:** `tools/dabbler-ai-orchestration/playwright.config.ts`, `src/test/playwright/`, `package.json` scripts
**Ends with:** Layer 3 is fast, its performance test is measured honestly, and a failure can never become a silent pass.
**Progress keys:** `baselineQuarantined`, `workerSweep`, `loudRetries`, `tripleGreen`

---

### Session 3 of 3: One bounded-parallelism policy, including CI

**Steps:**

1. Register.
2. **Audit what Set 116 S1 chose for pytest.** If it adopted bare `-n auto`,
   bound it. Note `-n auto` means **physical** cores, not logical, and
   xdist has **no percentage form** — the portable mechanism is the
   `pytest_xdist_auto_num_workers` hook in `conftest.py`, which ships to
   PyPI consumers who have no extension, plus
   `PYTEST_XDIST_AUTO_NUM_WORKERS` and `--maxprocesses` for overrides.
3. **State the policy once, where the test-run policy already lives:**
   parallel by default, bounded by measurement, headroom preserved, and any
   test that *measures performance* runs alone.
4. **Adopt bounded parallelism in CI**, with its expectation stated:
   runners are small (2-4 cores), so expect roughly 2x rather than the
   local figure, and CI wall clock gates **releases** via
   `require-green-test`, not sessions. Measure one run before and after.
5. Full suite at close after freeze; verify, close; `change-log.md`,
   Step 9 review, advisory path-aware critique.

**Creates:** the pytest worker audit, the written policy, the CI change, `change-log.md`
**Touches:** `ai_router/conftest.py`, `pyproject.toml`, `CONTRIBUTING.md`, `docs/planning/session-set-authoring-guide.md`, `.github/workflows/test.yml`
**Ends with:** one rule for parallelism a reader can apply without re-deriving it, and CI that benefits without anyone claiming the local speedup transfers.
**Progress keys:** `pytestWorkersAudited`, `policyWritten`, `ciParallelized`, `changeLog`

---

## End-of-set deliverables

- Layer 3 at roughly 7 minutes, proven non-flaky over three consecutive
  runs at the chosen setting.
- A cold-launch baseline measured alone, so its number means what it says.
- A bounded worker count for each suite, each recorded with the sweep that
  justified it and the headroom it preserves.
- CI parallelized with a stated, measured expectation.

## Risks this set should expect

- **Flakiness is the real danger, not slowness.** Per-launch isolation
  already exists, which is why 36 tests passed at 4 workers — but a shared
  port, lock or fixture path would appear as an intermittent failure. The
  triple run in Session 1 step 4 is the control; do not weaken it because
  the first run was green.
- **Memory, not cores, bounds Electron workers.** Each worker is a full VS
  Code instance. A count that works on 64 GB may thrash on 31.5 GB, so the
  number must be measured on the session machine and not inherited from the
  faster one.
- **The quarantine can be silently undone.** A future reader may see one
  test excluded from the parallel pool and "fix" it. The reason belongs in a
  comment next to the exclusion, in terms of the measurement it protects
  (1.9 min alone against 4.2 min contended), not as a style preference.
- **This set does not reach 20-minute sessions on its own.** With Set 116 it
  takes test cost from roughly 55 minutes per session to under 10. What
  remains is orchestrator reasoning time, which no scheduling change
  touches.
