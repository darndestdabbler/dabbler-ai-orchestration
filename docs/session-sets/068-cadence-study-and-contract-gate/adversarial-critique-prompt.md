# Adversarial critique prompt — Set 068 (cadence study + contract gate + routed DEMOTE)

> **For the operator.** Point a path-aware reviewer (GPT-5.4 and Gemini-2.5-Pro,
> each with **read access to this repository**) at the prompt in the
> `=== PROMPT ===` block below. Run it **once per provider, from a clean
> context**, and save each raw verdict as its own markdown file
> (e.g. `set-068-critique-gpt.md`, `set-068-critique-gemini.md`). This is a
> whole-**set** adversarial review (all six sessions), separate from the
> per-session routed verification and from this set's own
> `path-aware-critique.json` close-out artifact (which the `pathAwareCritique:
> required` gate enforces and which the automated producer `python -m
> ai_router.pull_critique` can generate over the same surface).
>
> **Scope:** the entire Set 068 body of work, at git `master` (S1–S6): the
> `run_test` execution cage + ReDoS isolation, the Experiment A symmetric
> re-grade, Experiment B (the cadence study), the routed keep/demote/retire
> **DEMOTE** decision, the contract-test / CDC gate, and the S6 synthesis +
> routed-gating-predicate cut-over + the `ai_router` PyPI release.

---

=== PROMPT ===

You are an adversarial code-, experiment-, and docs-reviewer with **full read
access to this repository**. A six-session body of work (**Set 068 — the cadence
study and the contract-test gate**) has just finished: it built a write-caged
`run_test` execution sandbox, ran a pre-registered cadence experiment, made and
**cut over** a decision to *demote* per-session routed verification to a gated
check, shipped a deterministic contract-test / CDC gate, and released a new
`ai_router` version to PyPI. Your job is to find what is **wrong, overclaimed,
unsound, incomplete, or internally inconsistent** in it — across code, the
experiments, and the documentation — and to do so **before** anyone trusts the
result. Be a genuine devil's advocate: assume the work is flawed and try to prove
it. A rubber-stamp is a failure.

**Anti-bias instruction (load-bearing).** Do **not** rely on the summaries below.
**Open and read the actual files yourself** and reason from what is on disk. Where
a summary, comment, or doc disagrees with the code or the data, **the repository
wins** — call it out explicitly. For every claim of *current behavior* (what a
function reads/writes/enforces/defaults to; what a test asserts; what a result
file reports; what a release published), verify it against the actual file before
accepting it.

## What this set produced (verify each claim; do not trust this summary)

1. **The `run_test` execution cage (S1, `ai_router/run_test_sandbox.py`).** A
   disposable, **detached** git worktree created from a pinned ref; the
   operator-configured argv runs `shell=False`, write-confined to the worktree,
   with a hard wall-clock timeout (process-tree kill) and a per-stream output
   cap; **crash-safe teardown** in a `finally` (remove → recursive delete →
   prune, then a `git worktree list` leak check). It returns the **raw** exit
   code + captured output (deterministic-servant discipline extended to
   execution). Offered to the Set 067 pull-verifier loop **only** when a
   `RunTestConfig` is passed (else the loop is byte-for-byte the Set 067
   read-only loop). Plus **`grep` ReDoS isolation** relocated onto a killable
   subprocess (heuristic kept as a cheap pre-filter only). Contract:
   `docs/session-sets/068-cadence-study-and-contract-gate/run-test-contract.md`.

2. **Experiment A symmetric re-grade (S2, `experiment-a-regrade.md`).** Applies
   the *same* strict "name the mechanism" audit rule to **path-aware** cross-file
   catches that the Set 067 audit applied only to routed, and recomputes the
   contrasts on the **pre-registered automated primary**. Headline: H1 *direction*
   confirmed (D5 unconditional existence proof; 13/14 vs 2/8 symmetric cross-file
   survival); magnitude metric-sensitive but positive (GPT robust; Gemini masked,
   not absent); the H2 "second routed provider buys nothing" half is robust.

3. **Experiment B — the cadence study (S2–S3, `experiment-b-*.md` +
   `experiment-b/`).** A pre-registered staged-snapshot intervention study (numkit,
   5 monotone snapshots, 12 seeded defects across 4 taxonomy classes; arms R / Q /
   E; K=3; two providers). Verdict read off the **fixed** decision rule: **cadence
   defense DOES NOT HOLD (clause B3)** — R's edge over end-of-set is confounded by
   surface-coverage + earliness — **but** the cadence *mechanism* is real (R
   catches migrating coupling defects at introduction, 5/5). Capability at close:
   E (11–12/12) ≫ R (10/12) ≫ Q (4/12).

4. **Routed keep/demote/retire decision (S4, `routed-fate-decision.md`).**
   **DEMOTE**, transition-guarded, via decision-time cross-provider consensus
   (the two non-orchestrator providers, devil's-advocate two-pass) + operator
   confirmation. The demotion does **not** cut over until the S5 contract-test
   gate is live; RETIRE rejected as premature, reopenable only on telemetry.

5. **Contract-test / CDC gate (S5, `ai_router/contract_gate.py`,
   `docs/contract-gate.md`).** A per-set, opt-in `contractGate` (none/advisory/
   required) mirroring the Set 066 path-aware gate shape: a producer runs the
   operator-declared contract command in the S1 cage and saves a raw
   `contract-floor-result.json`; the close-out gate validates it ran, passed,
   matches the set + manifest, and **covers every probeable defect class**.
   Posture: hard-TTY / soft-headless on `required`. Pure-Python validators
   (L-066-1 discipline).

6. **S6 — synthesis + cut-over + release.** The `docs/verification-surface-strategy.md`
   synthesis (supersedes the Set 065 proposal's open questions); the
   **routed-gating predicate** (`ai_router/routed_gate.py`) that flips per-session
   routed verification from mandatory to **gated** (built on
   `blast_radius.classify_paths` + session-level triggers); the workflow-doc +
   `router-config.yaml` cut-over; and the `ai_router` PyPI release.

## Load-bearing claims to check against the code and data (prove or disprove each)

- **The `run_test` cage cannot leak or escape silently.** Is teardown truly run
  on **every** path (success, failed command, timeout-kill, exception in
  create/run)? Is a surviving worktree registration (`worktree_removed=False`)
  raised as a hard `ERROR:`, not downgraded to metadata? Does the timeout kill
  the **process tree** (not just the parent)? Is the cage correctly **not**
  offered when no `RunTestConfig` is passed (Set 067 loop unchanged)? The contract
  is explicit that this is **not** an OS sandbox — does the code's actual
  guarantee match the contract's stated (bounded) threat model, with no doc
  overclaiming containment of hostile commands?
- **ReDoS isolation actually bounds a pathological pattern.** Does a pattern that
  *defeats the heuristic pre-filter* get killed by the subprocess timeout and
  return a raw error, rather than hanging the parent? Is sandbox confinement still
  enforced in the parent (the walk), with only the regex eval isolated?
- **The contract gate cannot pass a bogus floor.** Trace `validate_contract_gate`:
  can it pass when the floor **did not run**, **timed out**, **failed**
  (`exitCode != 0`), **leaked** a worktree, has a **command that disagrees with
  the manifest**, belongs to **another set**, or leaves a **probeable defect
  class with no covering test**? Is the non-probeable residual correctly reported
  (never a failure)? Are the pure-Python validators **parity** with the JSON
  schemas (optional fields type-checked; `schemaVersion` integer-not-bool/float —
  L-066-1)? Is the close-out gate fail-open in the non-block direction and correct
  on the TTY/headless posture split?
- **The routed-gating predicate is sound and biased-toward-review.** Read
  `ai_router/routed_gate.py`. Does `evaluate_routed_gate` trip REQUIRED on the
  cases the S4 decision named (multi-file/module, blast-radius core, build/CI/
  config, contract-uncovered/high-blast/post-failed-loop) and bypass only a
  genuinely small, single-module, probe-covered diff? Can the three operator
  override flags ever **lower** the verdict (they must only raise it)? Does it
  correctly reuse `blast_radius.classify_paths` as its core? Is the CLI exit-code
  contract (0 REQUIRED / 10 SKIP; `--json` exits 0) as documented? Crucially:
  **does the S6 cut-over leave any session able to skip verification that should
  not** — i.e. is the bypass set too wide?
- **The cut-over is consistent everywhere.** The DEMOTE went from
  "transition-guarded, NOT in effect, MANDATORY" (S4) to "cut over, gated" (S6).
  Grep `docs/ai-led-session-workflow.md`, `ai_router/router-config.yaml`,
  `ai_router/docs/`, and `docs/verification-surface-strategy.md` for **stale
  echoes** that still say per-session routed verification is mandatory/unchanged,
  or that the transition guard is still pending (L-065-1: a consistency claim is
  rarely local).
- **Experiment B's inference is sound and pre-registered.** Read
  `experiment-b-preregistration.md` (S2), `experiment-b/{catalogue,audit}.json`,
  `cost_model.py`, `grade.py`, and the `raw/` outputs. Is the verdict read off the
  **pre-committed** decision rule (clause B3), or chosen after seeing the numbers?
  Is the B3-not-B1 gloss faithfully applied (the cadence mechanism is real; only
  the clean attribution fails)? Are the controls (no-coupling, always-visible)
  doing the work the analysis claims? Is any effect over-read at n=1 unit / K=3?
  Did `run_test` genuinely run in arm E (not hand the answers to E)?
- **The re-grade is symmetric, not outcome-driven.** Does
  `experiment-a-regrade/audit-symmetric.json` apply the **identical** rule to both
  arms? Spot-check `B1:D12` (the one path-aware reject) and a sample of the 13
  keeps against the Set 067 `experiment-a/raw/`. Does the Gemini "masked, not
  absent" claim follow from removing routed's wrong-mechanism credit, or is it the
  author re-grading toward a desired result?
- **The DEMOTE decision was actually routed, not self-opined.** Does
  `routed-fate-consensus-journal.jsonl` + the four raw outputs show two
  non-orchestrator providers, a devil's-advocate two-pass, and a KEEP steelman
  that was honestly found not decisive — or is the consensus a rubber stamp?
- **The release is real and honest.** Does `pyproject.toml` carry the bumped
  version, does `ai_router/CHANGELOG.md` describe exactly what shipped (no API
  overclaim; routed-status change stated), and is the green-`Test`-on-the-tagged-
  SHA prerequisite respected? Does `docs/verification-surface-strategy.md` state
  the capability/limitations honestly (direction-not-magnitude; small-n; E not a
  perfect ceiling), or overstate what the experiments establish?

## What to attack

1. **Correctness.** Logic errors, wrong conditionals, off-by-one, mishandled edge
   cases, fail-open/fail-closed mistakes, ordering/atomicity bugs (especially the
   cage teardown order and the gate validators). Name the exact `file:line`.
2. **Security / confinement.** Any write that escapes the `run_test` worktree by a
   path the contract does *not* already disclaim; any way the cage leaks a
   registration silently; any ReDoS shape that still hangs the parent.
3. **Experimental validity.** Pre-registration violations, grading subjectivity, an
   audit rule applied unevenly, an effect over-read at this n/K, leakage between
   arms, a control that does not isolate what the analysis claims.
4. **Policy-cut-over soundness.** A bypass that drops verification on a session
   that needed it; an override that can lower the verdict; a stale doc/config echo
   that contradicts the new gated policy.
5. **Contract / cross-artifact drift.** Schema vs. validator vs. producer vs. docs
   disagreement; a doc claiming behavior the code does not implement; the
   strategy doc inheriting a claim that is no longer true.
6. **Completeness.** A claimed deliverable with no implementation; a wired-but-
   untested path; a stated invariant nothing enforces; a test that passes without
   exercising the behavior it names; a release artifact gap.
7. **Anything unforeseen** — cost/perf blowups, ASCII/encoding hazards on Windows
   `cp1252`, a wrong default, a stale reference.

## Output format

Begin with a one-line **VERDICT**: `VERIFIED` (no significant issues) or
`ISSUES_FOUND`. Then:

- If `VERIFIED`: 2–4 sentences on **what you actually read** (which files, which
  claims, which data) and why you are confident. A bare "looks good" is a failed
  review.
- If `ISSUES_FOUND`: a **Findings** list. For each finding give:
  - **Severity:** Critical / Major / Minor
  - **Category:** correctness / security / experimental-validity / policy-cutover
    / contract-drift / completeness / false-confidence / other
  - **Location:** the exact `file:line` (or file + symbol, or the result file)
  - **Description:** what is wrong, the ground truth you read (or the data point)
    that proves it, and the concrete fix.

Do NOT re-do the work. Only evaluate what was produced. Report only defects you
can substantiate from files you actually opened.
