# Change Log — Set 068 (Cadence Study + Contract-Test Gate)

## Session 1 of 6 — `run_test` disposable-worktree sandbox + tool (+ ReDoS isolation)

**Status:** CLOSED, VERIFIED (gpt-5.4 R1→R3). No release (Session 6 ships the
PyPI bump). Full `ai_router` suite green.

### Shipped

- **`ai_router/run_test_sandbox.py`** — the execution cage:
  - `run_subprocess_capped()` — shared `shell=False` subprocess primitive: hard
    wall-clock timeout that **kills the process tree** on overrun (Windows
    `taskkill /T`, POSIX `killpg`), temp-file-bounded per-stream output cap with
    raw head-slice elision (bounded memory even under a flood).
  - `run_test_in_cage()` — creates a **disposable, detached** git worktree from a
    pinned ref (raw `git worktree add` — the intentional escape hatch from the
    worktree-layout doc — under the system temp dir, never the canonical
    container), runs the operator-configured argv with `cwd` = the throwaway
    checkout, and tears the worktree down on **every** exit path (success /
    failed command / timeout-kill / exception) via `finally`:
    `remove --force` → `rmtree` → `git worktree prune --expire now` → verify no
    registration leaked. A teardown leak (`worktree_removed=False`) renders as a
    leading raw `ERROR:` (flagged as an error probe) while **preserving** the raw
    exit + output for diagnosis.
  - `run_test_caps_from_config()` — reads the new `pull_verifier.run_test.caps`
    block.
- **`ai_router/regex_worker.py`** + **`isolated_regex_search()`** — the relocated
  `grep` ReDoS defense: an `re2` inline fast path when available, else the regex
  evaluation runs in a **killable subprocess** bounded by the cage's hard timeout,
  so a catastrophic pattern that **defeats** the 0.21.1 nesting-aware heuristic is
  killed, not hung. The heuristic is demoted to a cheap **pre-filter** only; the
  walk + sandbox confinement stay in `_canonical_grep` (only the regex eval is
  isolated).
- **`pull_verifier.py` wiring** — `RunTestConfig`, `_run_test_tool_schema()`,
  `_dispatch_run_test()`. `run_test` is **offered only when a `RunTestConfig` is
  passed** to `pull_route()`; absent that, the offered tools are byte-for-byte the
  Set 067 read-only set (additive). It is dispatched to the cage **outside** the
  byte-equality guard (execution is non-re-derivable) and recorded as a real
  probe (so a verdict informed by it is not a `zero_tool_calls` run).
- **`router-config.yaml`** — `pull_verifier.run_test.caps` (wall-clock + output
  cap). **`__init__.py`** — exports for the new surface.
- **`run-test-contract.md`** — the pinned design contract.

### Scope correction (verification-driven)

The cage is **disposable-CWD isolation of a TRUSTED command** (the project's own
test command on its own pinned snapshots — Experiment B's threat model), **not an
OS sandbox**. It does not confine absolute-path writes, committed symlinks,
`git worktree list` main-worktree discovery, or detached children; confining
untrusted code is an explicit non-goal. The module docstring, contract, and tool
description were re-scoped to state this precisely (R1 Critical, per L-064-8).

### Tests

29 new tests (25 in `test_run_test_sandbox.py` + 4 `run_test` wiring tests in
`test_pull_verifier.py`): cage lifecycle + always-teardown (incl. on exception),
timeout-kill, output cap, write-confinement (real tree untouched), teardown-leak
detection + ERROR surfacing + raw-output preservation, caps-from-config, ReDoS
isolation of a heuristic-defeating pattern, elided-output partial-line drop, and
the Windows `\r` multi-match regression. No metered calls in the suite.

### Verification

gpt-5.4 (openai, high effort), cross-provider: **R1** ISSUES_FOUND (Critical
write-confinement overclaim + Major teardown prune-order / leak-surfacing + Minor
elision partial-line; **also** caught a latent Windows `\r` multi-match grep bug
while writing the Minor test) → **R2** ISSUES_FOUND (Critical re-scope echoes
still in two docstrings per L-065-1; Major `prune --expire now`; new Minor
leak-render dropped raw output) → **R3 VERIFIED**. ~$0.436.

### Deferred to later sessions

The live metered build-and-test-per-snapshot use of `run_test` is **Experiment B
(Session 3)**. The symmetric Experiment A re-grade + Experiment B pre-registration
are **Session 2**. No release until **Session 6**.

---

## Session 2 of 6 — Experiment A symmetric re-grade + Experiment B pre-registration

**Status:** CLOSED, VERIFIED (gpt-5.4 R1→R3). No release. Full suite green.

### Shipped

- **`experiment-a-regrade.md`** — the symmetric re-grade settling the H1-magnitude
  / H2 question the 0.21.1 erratum opened: the identical strict "name the
  mechanism" audit applied to **both** arms (not just routed). H1 *direction*
  confirmed (D5 unconditional existence proof; **13/14** path-aware vs **2/8**
  routed symmetric cross-file survival); magnitude metric-sensitive but positive
  everywhere (GPT robust +0.23→+0.29; Gemini within-band on the pre-registered
  automated primary but **masked, not absent** — +0.28 once routed's
  wrong-mechanism credit is removed symmetrically). The "second routed provider
  buys nothing" H2 half is robust and audit-independent.
- **`experiment-b-preregistration.md`** + the Experiment B harness skeleton — the
  staged-snapshot cadence design fixed **before** any data: arms R/Q/E/P, the
  cadence metric, K-repeats, the noise band, the deterministic `cost_model.py`,
  and the decision rule (clauses A1–A3 / B1–B3) that reads as "holds / does not
  hold."

### Verification

gpt-5.4 cross-provider: R1→R3 **VERIFIED**, ~$0.60. Suite 1548.

---

## Session 3 of 6 — Experiment B (the cadence study)

**Status:** CLOSED, VERIFIED (gpt-5.4 R1→R3). No release. Full suite green.

### Shipped

- **`experiment-b-results.md`** + the run harness + raw outputs
  (`experiment-b/raw/numkit/`). The cadence study run blind, K=3, two providers,
  graded against the **fixed** S2 decision rule. **Verdict: the cadence defense
  DOES NOT HOLD (clause B3)** — R's edge over end-of-set is confounded by
  surface-coverage + pure earliness, not cleanly attributable to Q-invisible
  cadence — **but the cadence mechanism is real**: R catches migrating coupling
  defects at introduction (5/5 early window, both providers). Capability at
  close: **E (11–12/12) ≫ R (10/12) ≫ Q (4/12)**, reproducing Experiment A.
- First end-to-end **metered** use of the S1 `run_test` cage (arm E built + tested
  each snapshot; verified in the persisted trace). The pilot caught a real
  seed-label defect before the paid sweep.

### Verification

gpt-5.4 cross-provider, of the analysis: R1→R3 **VERIFIED**, ~$1.41. Suite 1548.

---

## Session 4 of 6 — Routed keep / demote / retire decision

**Status:** CLOSED, VERIFIED (gpt-5.4 R1 CLEAN). No release. Full suite green.

### Shipped

- **`routed-fate-decision.md`** — the decision: **DEMOTE**, transition-guarded.
  Routed through **decision-time cross-provider consensus** (the two
  non-orchestrator providers, bias-preamble + devil's-advocate two-pass — both
  KEEP steelmans found KEEP not decisive; 4/4 converge DEMOTE) **+ operator
  confirmation**. Target state: end-of-set path-aware + the S5 contract gate
  primary, per-session routed **retained but gated** on a programmatic
  blast-radius / coupling predicate. **Transition guard:** no cut-over until the
  S5 gate is live → routed stays MANDATORY through S4/S5 (incl. S4's own
  close-out). RETIRE rejected as premature, reopenable only on telemetry.
- No behavioral flag flipped this session — `routed-fate-decision.md` +
  a workflow-doc *Verification-surface policy* subsection + a comment-only
  `router-config.yaml` anchor.

### Verification

gpt-5.4 cross-provider: R1 CLEAN → **VERIFIED**, ~$0.104. Suite 1548.

---

## Session 5 of 6 — Contract-test / CDC gate

**Status:** CLOSED, VERIFIED (gpt-5.4 R1→R3). No release. Full suite green.

### Shipped

- **`ai_router/contract_gate.py`** — the deterministic verification **floor**: a
  per-set, opt-in `contractGate` (none|advisory|required) that confirms a set's
  contract/falsifier tests ran and **passed** in the S1 cage and **cover every
  probeable defect class**, reserving the path-aware agent for the non-probeable
  residual. Mirrors the Set 066 path-aware gate shape (produce-then-validate:
  `python -m ai_router.contract_gate run` produces the raw
  `contract-floor-result.json`; the close-out gate validates it). The cage's first
  production consumer.
- `docs/contract-manifest.schema.json` + `docs/contract-floor-result.schema.json`
  + `docs/contract-gate.md`; close-out wiring in `ai_router/close_session.py`
  (set-terminal, required hard-TTY / soft-headless, fail-open) + a
  `router-config.yaml` anchor. 93 new tests.

### Verification

gpt-5.4 cross-provider: R1 (1 Maj) → R2 (2 Maj) → **R3 VERIFIED** (all
malformed-activity-log robustness fixed via a shared shape-guard). Suite 1641/1.

---

## Session 6 of 6 — Synthesis + docs + release + dogfood + close

**Status:** CLOSED (this session). Ships **`ai_router` 0.22.0** to PyPI.

### Shipped

- **`ai_router/routed_gate.py`** (+ 27 tests) — the per-session
  routed-verification **gating predicate** that executes the S4 DEMOTE cut-over:
  `evaluate_routed_gate` / `python -m ai_router.routed_gate`. Built on
  `blast_radius.classify_paths` (the Set 066 core predicate) plus the
  session-level triggers the S4 decision named (multi-module span, diff breadth,
  build/CI/config surface) and three operator overrides that can only **raise**
  to REQUIRED. Deterministic and biased-toward-review (the consensus's
  load-bearing requirement: a programmatic heuristic, not a per-session feeling).
  Exported from `__init__.py`. CLI exit-code contract: 0 REQUIRED / 10 SKIP.
- **The cut-over.** `docs/ai-led-session-workflow.md` (Step 6 is now **gated**,
  not mandatory; the *Verification-surface policy* transition guard is **cleared**)
  and the `router-config.yaml` `verification:` anchor (+ a live `routed_gate`
  sub-block) are flipped. Per-session routed verification is **gated, not gone**.
- **`docs/verification-surface-strategy.md`** — the canonical synthesis tying
  Experiment A + the re-grade + Experiment B + the DEMOTE decision + the contract
  gate into one settled strategy; supersedes the Set 065 proposal's open
  questions (a `Superseded` pointer added atop that proposal).
- Docs: `ai_router/docs/close-out.md` documents the contract-test gate;
  `ai_router/docs/pull-verifier.md` records what Set 068 added.
- **`adversarial-critique-prompt.md`** — the whole-set path-aware critique prompt
  (operator-run, GPT-5.4 + Gemini-Pro), for the `pathAwareCritique: required`
  dogfood.
- **Release:** `pyproject.toml` 0.21.1 → **0.22.0**; `ai_router/CHANGELOG.md`
  0.22.0 entry carrying the whole set. Operator pushes tag `v0.22.0`.
- **Dogfood:** this set's own `contract-floor-result.json` + `path-aware-critique.json`.

### Verification

Per-session routed verification REQUIRED for S6's own diff (multi-module +
blast-radius + breadth + build-config); cross-provider verified at close.

---

## Set outcome

A shipped write-caged execution sandbox, an answered cadence question (does not
hold via B3), a decided-and-**cut-over** DEMOTE for per-session routed
verification, and a deterministic contract-test gate — completing the
verification-surface program Set 065 framed and Sets 066–067 began.
`ai_router` **0.22.0** published; no Marketplace change. Next set recommendation:
**Set 069 — instrument the gated verification surface** (telemetry to reopen
RETIRE), routed in `next-set-rec.md`.
