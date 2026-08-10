# AI assignment log — Set 117

Per-session orchestrator assignment and the next-session recommendation.
Under the temporary verification-only routing policy (2026-08-05), the
active orchestrator records these directly rather than routing the
analysis; only `session-verification` goes through `route()`.

---

## Session 1 — Isolate the launch, then re-test the ceiling

**Orchestrator:** `claude` / `anthropic` / `claude-opus-5`, effort `high`
(Direct APIs transport).

**Verification:** routes to a non-anthropic effective provider, as the
cross-provider rule requires.

**Part of this session's step 2 already landed, before the session
started.** Commit `5388c3d1` ("Layer 3: give every Electron launch its own
APPDATA/LOCALAPPDATA", 2026-08-10, work seat + Copilot) shipped the
APPDATA/LOCALAPPDATA scoping inline in `electronLaunch.ts` and named what
it deliberately left to this session: *"tests for the isolation, the worker
count, and a decision on whether HOME/USERPROFILE need the same
treatment."* This session does not re-do that work and does not claim it.
It does three things the commit could not: puts the isolation on the
**shared seam** so the sibling launch site gets it too (L-069-1), gives it
**falsifiable tests** (L-112-1 — the isolation currently has none, and an
env-scoping fix that silently stops scoping looks identical to one that
works), and settles HOME/USERPROFILE **by measurement** rather than by
assertion.

**The machine is not the machine the spec measured on, and that changes
the deliverable.** Every Layer 3 figure in the spec — `workers: 1` at
10.1 min, `workers: 4` at 7.08 min, the 8-worker failures, the
`real-host-baseline` 1.9-vs-4.2 min contention finding — was measured on
the operator's **work machine (14 logical CPUs, 31.5 GB)**, which the spec
calls "the operator's session machine" and deliberately preferred over the
faster one. This session is running on **DENICI (20 logical CPUs, 63.8
GB)** — the machine the pytest benchmark
(`docs/test-suite-benchmark-DENICI.txt`) came from.

Sessions demonstrably run on both. So the honest reading of spec decision 2
("parallelism is bounded by measurement, never by `auto`") is that a single
hard-coded integer measured on one machine cannot be the deliverable: it
is either unsafe on the smaller machine or leaves the larger one idle.
Session 1 therefore measures the ceiling **here**, records it as a DENICI
sweep that stands beside the 14-core one rather than replacing it, and
hands Sessions 2 and 3 two measured points instead of one. Choosing the
*form* of the setting (a literal, or a bounded expression over core count)
is Session 2's and Session 3's call, and this session states the
constraint rather than pre-empting it.

**The operator's standing cap is 8, and it governs adoption, not
measurement.** The 2026-08-10 directive caps parallelism at 8 on this
machine — never `auto`, never all 20 — because unbounded parallelism
starves the desktop. Nothing this session *adopts* will exceed it. The
sweep still probes above 8, because spec step 3 asks where the ceiling is
and "we never looked" is not a measurement; those runs are recorded as
ceiling data explicitly marked non-adoptable on this machine.

**What Session 2 must not inherit uncritically:** the spec's own
`real-host-baseline` figures (1.9 min alone / 4.2 min under 4 workers)
predate commit `5388c3d1`. A cold launch against a **fresh** APPDATA is not
the same measurement as one against the operator's warm shared profile, as
that commit's own caveat says. Session 2 re-baselines after the isolation
rather than comparing across it.

**What Session 2 inherits, and must discharge before it adopts anything:**

1. **The 14-core re-run, as a precondition** — an owed residual with
   Session 2 named as its owner, by operator adjudication on 2026-08-10
   after verification raised it twice and rejected the first fix. Session 2
   must not adopt a worker count for the 14-core host until it has run the
   final-isolation 8-worker configuration there. If Session 2 also runs on
   DENICI, the residual carries to Session 3 and must be restated, not
   dropped.
2. **`vsix-first-run-walkthrough` is an open product-race candidate**, not
   a known flake. Its Mode 1 failure persisted under full isolation at
   w=8. Session 2's "three consecutive green runs" control is weaker than
   it looks against a test that failed 2 of 9 full-suite runs, and the
   spec's own diagnostic (a failure that passes in isolation is a race
   candidate) does not discriminate here, because this test has failed
   both in parallel and alone.
3. **The knee is at 4, not at the ceiling.** Marginal wall clock per added
   worker on DENICI: 105.7s (1→4), 6.3s (4→8), 4.3s (8→12). Past 4, extra
   workers buy seconds and cost the desktop.

**Recommended next orchestrator (Session 2):** recorded at close in
`disposition.json`, not pre-committed here.

---
