# Contract-Test / CDC Gate (Set 068 S5)

> The deterministic **verification floor** of the dabbler verification-surface
> model. A per-set, opt-in gate that confirms a set's **contract / falsifier
> tests** actually ran and passed at close, and that they **cover every probeable
> defect class the set declares** — reserving the (expensive) path-aware critique
> agent for the **non-probeable residual**. Built in Set 068 S5; it is the
> replacement floor the Set 068 S4 routed keep/demote/retire decision's transition
> guard waits on (`docs/session-sets/068-cadence-study-and-contract-gate/routed-fate-decision.md`).

## Why it exists

Experiment A's **H4** finding (Set 067 `experiment-a-results.md`, tightened in Set
068 `experiment-a-regrade.md`) is that **~95% of seeded defects are
deterministically falsifiable** — a cheap, reproducible contract test can catch
them. The verification-surface model the experiments settled is therefore layered:

- **Floor (this gate):** deterministic contract tests carry the probeable bulk.
  No model in the loop; cheap and reproducible.
- **Ceiling (path-aware critique, Set 066/067):** the agent is reserved for the
  non-probeable residual and for *authoring* the falsifiers.

This gate is the floor. It is **not** a CI runner or a general test harness (Set
068 spec non-goal): it runs **one** operator-declared contract command in the Set
068 S1 disposable `run_test` cage, hard-capped and crash-safe.

## The per-set policy attribute — `contractGate`

`contractGate: none | advisory | required` — declared in spec.md's Session Set
Configuration block, captured **once at set start** to `activity-log.json` (its
own `kind`, immutable thereafter), default `none`. This mirrors `pathAwareCritique`
(Set 066) and `verificationMode` (Set 057) exactly, so an operator who knows one
knows the others. Reader/writer/resolver:
`ai_router.contract_gate.read_contract_gate` /
`record_contract_gate` / `resolve_and_record_contract_gate`.

## The two artifacts

A set that opts in declares a **manifest** and the producer writes a **floor
result**, both beside `spec.md` at the session-set root:

| File | Written by | Purpose |
|---|---|---|
| `contract-manifest.json` | the operator | the contract command + the seeded/known defect classes and how each is covered |
| `contract-floor-result.json` | the producer (`contract_gate run`) | the raw result of running the contract command in the S1 cage |

Structural contracts: `docs/contract-manifest.schema.json` and
`docs/contract-floor-result.schema.json`. The runtime gate uses the pure-Python
validators (`validate_contract_manifest`, `validate_contract_floor_result`) so
`close_session` works with only the runtime deps installed; per **L-066-1** the
validators type-check the optional fields the schemas constrain and guard `int`
vs `bool` for `schemaVersion`.

### The manifest

```jsonc
{
  "schemaVersion": 1,
  "sessionSetName": "<set slug>",
  "contractGate": "required",
  "command": ["python", "-m", "pytest", "-q", "tests/contract"],
  "defectClasses": [
    { "id": "DC1", "description": "...", "probeable": true,  "coveredBy": ["test_dc1"] },
    { "id": "DC2", "description": "...", "probeable": false, "coveredBy": [] }
  ]
}
```

- `command` — the operator-authored argv, passed verbatim (`shell=False`) to the
  cage. The model never authors it (bounded command surface, `run-test-contract.md` §3).
- `defectClasses[]`:
  - `probeable: true` ⇒ a deterministic contract test **can** falsify the class,
    so it **must** name ≥1 covering test in `coveredBy` (the floor carries it).
    An uncovered probeable class **fails** the gate.
  - `probeable: false` ⇒ the **residual** reserved for the path-aware agent;
    `coveredBy` is expected empty and is **reported**, never a failure.

### The floor result

The producer runs `command` in the S1 cage and records the **raw** outcome (exit
code + captured output, never summarized). See
`docs/contract-floor-result.schema.json`. The floor **passed** iff `ran` AND
`exitCode == 0` AND not `timedOut` AND `worktreeRemoved` (a failing, timed-out, or
worktree-leaking run is **not** a deterministic floor).

## Running the floor — the producer

```
python -m ai_router.contract_gate run \
  --session-set-dir docs/session-sets/<set> \
  --repo-root . [--ref HEAD]
```

This validates the manifest, runs its `command` in a disposable, detached git
worktree of `--repo-root` at `--ref` (crash-safe, capped by the router-config
`pull_verifier.run_test.caps` block), and writes `contract-floor-result.json`.
Exit `0` if the floor passed, `1` if it did not, `2` on a manifest error. The
floor is the S1 `run_test` cage's first production consumer.

## The close-out gate

`validate_contract_gate(session_set_dir)` (posture-agnostic, never raises). The
gate is `ok` iff **all** hold:

1. a valid `contract-manifest.json` whose `sessionSetName` / `contractGate` match
   this set (identity check — a stale/copied manifest must not satisfy the gate);
2. every `probeable: true` defect class names ≥1 covering test;
3. a valid `contract-floor-result.json` whose `sessionSetName` matches this set and
   whose `command` matches the manifest's (the floor that ran is the floor that
   was declared);
4. that floor **passed**.

The **non-probeable residual** is reported (`residual_ids` + the `reason` line),
never a failure. Inspect ad hoc with `python -m ai_router.contract_gate validate
--session-set-dir <dir>`.

### Posture (the caller's decision)

Wired into `close_session` at the **set-terminal** close, mirroring the Set 066
path-aware gate:

| Level | Interactive TTY | Headless / `--accept-suggestions` |
|---|---|---|
| `required` | **HARD-block** | soft-warn |
| `advisory` | soft-warn | soft-warn |
| `none` | skip (no-op) | skip (no-op) |

The gate is **fail-open** in the non-block direction — any internal error never
wedges close-out — and a corrupt `activity-log.json` (which would silently
collapse the policy to `none`) is surfaced as a loud, non-blocking warning rather
than disarming the gate in silence.

## Relationship to the routed-verification decision

The Set 068 S4 decision **DEMOTE**d per-session routed verification but with a
**transition guard**: the demotion did not take effect until this contract-test
gate was "live and stable." S5 built the gate; **S6 cleared the guard** — it
wired the blast-radius gating predicate (`ai_router/routed_gate.py`) that flipped
per-session routed verification from mandatory to **gated**.

> **Set 083 reversed the demote.** Per-session cross-provider verification is
> mandatory again on every Full-tier session (no skip); this contract-test
> gate remains an **additional** deterministic surface, not a replacement
> floor (see [`docs/verification-surface-strategy.md`](verification-surface-strategy.md)
> and `docs/ai-led-session-workflow.md` → *Verification-surface policy*).
