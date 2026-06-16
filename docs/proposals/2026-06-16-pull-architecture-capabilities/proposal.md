# Proposal — Capabilities for the automated pull-critique process

> **Status:** Design synthesis (pre-Set-069), **operator-reviewed 2026-06-16**.
> The §3 sandbox resolution is **operator-adopted (Podman, surgical, spike-first)**;
> the §1 capability ladder is the agreed direction, **gated behind the §3.6 Podman
> feasibility spike** before it is marketed as the standard process.
> **Date:** 2026-06-16.
> **Method:** generate-diverse -> adversarial cross-critique -> synthesize, per
> [`docs/planning/orchestration-strategy.md`](../../planning/orchestration-strategy.md).
> Three independent engines (a **fresh** `claude-opus-4-8`, `gpt-5.4`,
> `gemini-2.5-pro`), each a clean context, two rounds. Raw outputs in
> [`raw/`](raw/) (`r1_*` independent designs, `r2_*` cross-critiques); panel
> spend ~$0.83.
> **Motivation:** on the 0.22.0 release, the **automated** pull-critique producer
> ran read-only and missed 2 Major correctness bugs the **manual** pull run caught
> by executing code. Why, and what capabilities close the gap?

---

## 0. Headline

The automated ceiling underperformed the manual ceiling for one reason: it is a
**read-only commentator while the manual critic is an evidence-producing probe
runner**. The fix is a **constrained evidence-generation lane**, not arbitrary
power. All three engines converged (after cross-critique) on the same ladder and
the same hard line; the disagreements that remained are real cruxes for the
operator, and all three left the same deeper risks unaddressed.

**The operator's falsification thesis is right on leverage, wrong on safety — and
the panel found a stronger version of it the original framing missed (§2).**

## 1. The convergent capability ladder (what to ship, in order)

Each rung's guardrail is load-bearing; the ordering is cheapest-safest-first.

1. **One execution-evidence protocol for *both* manual and automated critics.**
   A servant-captured artifact bundle is the *only* thing that can mark a finding
   `REPRODUCED`: pinned ref, command/template id + typed args, pristine-checkout
   status, raw stdout/stderr, exit code, artifact hashes, **and a replay on a
   second pristine checkout**. The **orchestrator** applies the tag, never the
   agent. *Why first (GPT):* more execution without this just enlarges the bluff
   surface, and it fixes the **two-standards** problem — a human-watched terminal
   must not mint stronger claims than automated evidence.
2. **Wire trusted-command execution into `pull_critique.py` (trigger-only).**
   The producer can trigger **operator-authored command ids** (declared
   falsifiers, vetted validation commands, small test entrypoints) in the existing
   `run_test` cage. *Guardrail:* no free-form shell, **no model-authored argv**,
   fresh checkout per run, stripped env / no secrets, hard caps. This closes the
   literal 0.22.0 gap.
3. **Diff-awareness + bounded multi-turn read->run->read probing.** Raw
   `get_diff` (changed paths + unified diff via the byte-equality servant; **not**
   a model-summarized "changed-symbol map" — too non-deterministic in Python) and
   a deeper but **blast-radius-budgeted** loop. *Why:* much of the manual edge was
   **thoroughness**, not execution — this is the cheapest catch-up lever.
4. **Probe-template lane (the missing middle).** Operator-authored, **versioned
   probe harnesses** the agent invokes with **typed, validated args** — e.g.
   "invoke validator on this malformed-bytes artifact", "call function X with a
   bad parent dir". The *harness is human-authored* (stays inside the
   trusted-command model); the model only supplies typed inputs. This is the
   narrowest lane that finds **novel-but-local** edge cases — it would have caught
   **both** 0.22.0 bugs — without arbitrary code execution. *This is the panel's
   key constructive find:* the real ladder is trigger -> **parameterized template**
   -> (later) authored-code, not trigger -> authored-code.
5. **Ceiling -> floor promotion ratchet — quality-gated.** A reproduced probeable
   defect produces a **candidate falsifier artifact** (never auto-merged).
   Admission requires: fails-on-old, passes-on-fixed, **drives a public
   contract/entrypoint (not an incidental string or wall-clock), survives an
   N-run flake check, has an owner, and carries human sign-off.** Mandatory for
   reproduced probeable bugs *or* an explicit waiver. *Why:* without this the
   system re-discovers the same classes at agent prices forever; *with it ungated*
   it **poisons the cheap floor** with brittle agent-authored tests — the worst
   outcome, since the whole architecture rests on the floor being trustworthy.
6. **A measured replacement gate.** A seeded **plus holdout** (recent real misses)
   defect benchmark scoring recall / precision / replay-success / false-`REPRODUCED`
   rate. The **manual run is not retired** until thresholds are met, and stays a
   periodic backstop thereafter. "Design arguments should lose to scoreboards."

## 2. The falsification thesis, adjudicated (operator-confirm)

All three engines, independently, reached the same verdict and the same
correction:

- **Right on leverage.** The deterministic floor genuinely (a) **narrows the
  search** to the characterized residual and the diff hotspots, (b) makes
  execution **economical** (cheap checks absorb the obvious), and (c) enables
  **compounding** (reproduced bugs promote into the floor).
- **Wrong on safety — a category error.** "Small, well-described *defect* residual
  ⇒ expanded *capability* is safe" does not follow. **Safety comes from
  containment (the cage/sandbox), not from the floor.** A model-authored script
  run through a "trusted" `python` is arbitrary code execution no matter how small
  the defect domain — and the current `run_test` cage is explicitly *not* an OS
  sandbox.
- **The stronger version (Opus, sharpened by all).** What the floor really buys
  the ceiling is **epistemic, not safety**: it extends the *deterministic-servant
  discipline to the agent's claims*. A finding that ships as a **re-runnable
  falsifier** requires the human to trust the agent *not at all* — the servant
  re-executes it. So the right north star for the executable ceiling is not "find
  bugs" but **"produce re-runnable falsifiers for the residual, run them to
  confirm they fail on current code, and hand them to the floor."** That is your
  falsification instinct — located one level up from where the thesis put it:
  falsification governs **trust in the agent's claims**, not the **safety of its
  actions**.

So: your instinct that falsification is central was correct; the panel just
re-seated it. "Reproduced by running" is **not** intrinsically trustworthy — naive
automation turns it into a *hallucinated-reproduction* surface stronger-looking
than a read-only assertion but backed by nothing. It is trustworthy **iff**
artifact-backed and independently replayed (rung 1).

## 3. Adopted resolution (operator decision, 2026-06-16): Podman, surgical + spike-first

CRUX 1 is **resolved, not deferred.** The hard line stands — **no model-authored
code in the current `run_test` cage** (that cage isolates a *trusted* command; net
of network-off + timeout those are resource caps, not isolation). But the boundary
for model-authored code is now a concrete, license-clean choice: **rootless
Podman**, applied **surgically** to the one lane that needs it. No VDI; the
host-side worktree cage still serves the trusted lane (read tools +
operator-authored tests) unchanged.

### 3.1 Why Podman
Apache-2.0, rootless, daemonless — **no Docker Desktop subscription**. A real
namespace boundary the worktree cage is not: the harness pins `--network=none`,
`--read-only` rootfs, a **read-only** repo-snapshot bind-mount, writable tmpfs
scratch, `--cap-drop=ALL`, `--memory` / `--pids-limit` / `--cpus`, hard timeout.
This *is* the OS sandbox the panel said autonomous author-and-run requires — the
lean version. **Windows reality:** Podman runs via a WSL2-backed `podman machine`
(needs virtualization; one-time, persists — start once, reuse for many
`podman run`). CI is Linux, so containers are native / near-free.

### 3.2 The container design (token-frugal by construction)
- A pinned, **operator-authored** base image (Containerfile, **digest-pinned, no
  embedded secrets**, project runtime deps only). Built once; the model never
  touches it.
- A **pre-scripted harness** — `run_test_sandbox`'s sibling (same crash-safe
  teardown / raw capture / caps / evidence protocol), with `podman run` as the
  isolation mechanism instead of `git worktree add`.
- The model-facing surface stays **tiny**: it emits a small probe (script body or
  `template_id` + typed args) and one tool call; it never authors `podman` flags
  or orchestration. **Token cost is low by construction; runtime cost is capped
  separately.**

### 3.3 The execution ladder (what the verifier may do beyond existing tests)
- **(a) Propose tests/changes via a markdown file** — cheapest, zero execution
  risk; the default for anything confirmable by reading or by existing
  operator-authored tests.
- **(b) Run a model-authored probe in a Podman container** — the **autonomous**
  model-authored lane (*the container is the boundary*, so no human approval for
  (b) itself). **Severity-gated:** fire only when the verifier asserts a
  **critical / major** issue it cannot confirm via (a) or existing tests. Rare,
  cheap-in-tokens.
- **(c) Human approval** — true last resort, only for a probe that must **escape**
  the container (network, write to the real tree, special privileges). Should
  almost never fire.

### 3.4 The AI safety check — triage only, never a boundary
As a *security boundary* it is mostly false security (foolable; correlated
blind spots). With a real container it is unnecessary for safety. Permitted
**only** as cheap triage — reject an obviously-pathological / pointless probe
before paying a spin-up — and may only **reject / escalate, never approve**.
Optional; skip if not worth the complexity.

### 3.5 What the container does NOT fix (keep these disciplines)
- **Probe-correctness (meta-oracle):** a perfectly contained probe can still
  "prove" a non-bug. A container-confirmed finding must drive a **real public
  entrypoint** (not an agent-built harness) and ship a raw, **replayed** transcript.
- **Image hygiene:** operator-authored, digest-pinned, no secrets, `--network=none`
  by default.

### 3.6 Spike FIRST — validate the tires before marketing the strategy (operator-directed)
Before this is adopted or marketed as the standard process, run a **Podman
feasibility spike**: a small deterministic smoke test proving the harness works
end-to-end on (i) the target **Windows-11 + WSL2** dev fleet and (ii) the **Linux
CI** runner — a known-failing probe returns the contracted raw error/exit *from
inside the container*, `--network=none` holds, the repo snapshot is read-only,
teardown is crash-safe, and per-probe **token + wall-clock cost are measured**.
Also confirm virtualization is available on the dev fleet (the one environmental
risk). **Only a green spike ships the strategy.** Pilot venues already queued —
**two complex projects + the Access Harvester** — but gated *behind* the spike,
not before it.

## 4. What all three missed (the deeper risks — adopt these too)

The cross-critique surfaced risks no single design held:

- **The meta-oracle / probe-correctness problem (deepest).** Containment guarantees
  the *transcript* is real; it does **not** guarantee the *probe tests the right
  thing*. A contained, faithfully-relayed, pristine-tree run can confidently
  demonstrate a **non-bug** if the probe bakes in wrong assumptions or mocks its
  way to a failure. *Mitigation:* an `EXECUTED` finding must demonstrate the
  failure **through an existing public entrypoint / contract**, not an
  agent-constructed harness. (This is also the strongest argument for keeping a
  human in the loop.)
- **Execution flakiness vs. the integrity machinery.** A close-out that "re-runs
  every EXECUTED finding and voids on mismatch" will itself flake and **falsely
  accuse honest critics**. Needs an N-run-majority / quarantine flake policy
  *before* re-run-to-confirm can gate.
- **Whole-stack cost/latency.** Multi-turn loops + per-finding re-runs +
  fresh-checkout-per-repro + sandbox spin-ups can make the executable ceiling
  **cost more than the manual hour** it replaces. Budget execution dynamically by
  blast radius; measure total cost, not per-rung.
- **Cross-provider collusion-of-error.** Two "diverse" critics can share a
  training-induced blind spot and **agree on a wrong reproduction**, manufacturing
  false consensus. Provider count should be set by the §1.6 benchmark, not assumed.
- **Keep the manual backstop.** The incident's only saving grace was a human
  watching a terminal — itself the current defense against the meta-oracle problem.
  Retiring it on faith may be the actual mistake; retire (or set its cadence) only
  on the §1.6 scoreboard.

## 5. Recommendation

Sequence:

0. **Podman feasibility spike (§3.6)** — the gate. Prove the harness end-to-end on
   the Windows-11+WSL2 fleet and Linux CI, measure per-probe token + wall-clock
   cost, confirm virtualization availability. Nothing downstream is marketed until
   this is green.
1. **Rungs 1–4** (evidence protocol → trigger-only execution wiring → diff +
   deeper probing → **probe-template lane**) — close most of the manual/automated
   gap at *trusted-command* risk, no container required for these.
2. **Rung (b) — the Podman model-authored-probe lane (§3)** — autonomous,
   severity-gated, behind a green spike.
3. **Rungs 5–6** — quality-gated ceiling→floor ratchet, then the measured
   replacement gate (seeded + holdout benchmark) that decides if/when the manual
   run's cadence drops.

Throughout, hold the §4 risks as first-class, and **keep the manual whole-set
critique running** until the scoreboard says otherwise. Validation venues: the
two queued complex projects + the Access Harvester — real-workload pilots, gated
behind the spike.

The one-line reframe to carry forward: **the floor doesn't make execution safe —
the cage does; the floor makes the agent's executed claims into re-runnable
falsifiers, so trust never rests on the agent's word.**
