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

36 tests passed under both. **The isolation already works** —
`electronLaunch.ts` gives every launch a fresh `user-data-dir`, a fresh
extensions-dir and a tmpdir-scoped `HOME`/`USERPROFILE`, which is normally
the hard part of parallel Electron testing. No flakiness appeared.

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

**CI runs everything again, three times.** `.github/workflows/test.yml`
matrices both pytest and Playwright across `ubuntu-latest`, `macos-latest`
and `windows-latest`. Those jobs run in parallel, so CI *wall clock* is the
slowest job, not the sum — but CI wall clock gates **releases** through the
`require-green-test` action, not sessions.

## Decisions already made — do not reopen

1. **Parallelism is bounded by measurement, never by `auto`.** A worker
   count is chosen because it was measured on the target machine, and the
   config records the number *and the reason*. "Use all the cores" is how
   this becomes a problem again.
2. **The baseline-measurement test is quarantined, not deleted.** Its number
   is the only real-host cold-launch datum the repo has. It runs alone.
3. **No test deletion, and no test-selection tooling.** Same as Set 116:
   measured payoff is near zero and the risk is shipping a regression.

## Non-goals

- **No new Playwright tests.**
- **No change to what the tests assert.** This set changes how they are
  scheduled, and nothing else.
- **No sharding across machines.** One machine, bounded workers.

---

## Sessions

### Session 1 of 2: Quarantine the measurement, parallelize the rest

**Steps:**

1. Register.
2. **Quarantine `real-host-baseline`.** Give it its own Playwright project
   (or `describe.serial`) pinned to **one worker with nothing else running**,
   so the cold-launch number it exists to produce is measured under the
   conditions it claims. Record the isolated figure (1.9 min measured
   2026-08-10) beside it, so a future contended reading is visibly wrong.
3. **Parallelize the remaining 35** with a bounded worker count, chosen by
   sweeping 2 / 4 / 6 on the session machine and keeping the best that
   leaves the desktop usable. Expected ~2.5 min against ~8 min serial;
   **record the sweep, not just the winner.**
4. **Prove it is not flaky before trusting it.** Run the full suite **three
   times** at the chosen setting. An intermittently-failing UI suite is
   worse than a slow one, and "it passed once" is not evidence. Any shared
   fixed path (port, lock, shared `test-fixtures/` tree) surfaces here — that
   is a finding, not a reason to abandon the change.
5. Full suite at close after freeze; verify, close.

**Creates:** the quarantined baseline project, the bounded worker setting, the sweep record, the triple-run evidence
**Touches:** `tools/dabbler-ai-orchestration/playwright.config.ts`, `src/test/playwright/`
**Ends with:** Layer 3 costs ~4.5 minutes instead of ~10, and the one test that measures performance is measured under conditions that make its number true.
**Progress keys:** `baselineQuarantined`, `workerSweep`, `flakinessTripleRun`

---

### Session 2 of 2: One bounded-parallelism policy, including CI

**Steps:**

1. Register.
2. **Audit what Set 116 S1 chose for pytest.** If it adopted `-n auto`,
   replace it with a bounded count that leaves headroom on a 14-core
   machine, and **write the reason into the config comment** — otherwise the
   next reader "optimizes" it back to `auto` and re-creates the unusable
   desktop. If S1 already bounded it, confirm the number against a sweep on
   the session machine rather than inheriting it untested.
3. **State the policy once, in one place**: parallel by default, bounded by
   measurement, headroom preserved, and any test that *measures performance*
   runs alone. Put it where the test-run policy already lives so it is found
   by someone reading about tests, not buried in a set folder.
4. **Adopt bounded parallelism in CI**, with its own expectation stated:
   GitHub-hosted runners are small (2-4 cores), so the gain is roughly 2x
   rather than the 3.6x seen locally, and CI wall clock gates **releases**
   via `require-green-test`, not sessions. Measure one run before and after
   rather than assuming the local number transfers.
5. Full suite at close after freeze; verify, close; `change-log.md`,
   Step 9 review, advisory path-aware critique.

**Creates:** the pytest worker audit, the written policy, the CI change, `change-log.md`
**Touches:** `pyproject.toml`, `CONTRIBUTING.md`, `docs/planning/session-set-authoring-guide.md`, `.github/workflows/test.yml`
**Ends with:** one rule for parallelism that a reader can apply without re-deriving it, and CI that benefits without anyone claiming the local speedup applies there.
**Progress keys:** `pytestWorkersAudited`, `policyWritten`, `ciParallelized`, `changeLog`

---

## End-of-set deliverables

- Layer 3 at roughly 4.5 minutes, proven non-flaky over three consecutive
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
