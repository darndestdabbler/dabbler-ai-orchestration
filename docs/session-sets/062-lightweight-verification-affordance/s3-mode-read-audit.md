# Session 3 — verification-mode read-path audit (spec step 1)

> Recorded BEFORE any Session 3 code, per the spec's "audit first" step
> and the design lock's "recorded, not snuck past the capture" rationale.
> All findings verified empirically against the working tree at the
> Session 3 start commit (HEAD = 0a0d74e).

## Question

D4 requires that after a blessed `verification_mode_change` record is
appended, the recorded transition is "honored everywhere a mode decision
is read." Where, exactly, is the recorded verification mode read — and
does `start_session --type …` or the close-out gate consume it directly?

## Findings

### F1 — `read_verification_mode` is the single mode-resolution choke point

`ai_router/dedicated_verification.py:138-167`. Scans
`activity-log.json` `entries[]` **in file order** for
`kind == "verification_mode"` entries with a recognized `choice`; the
**last valid entry wins**; missing file / unreadable JSON / no record all
degrade to the default `out-of-band-or-none`. Every runtime consumer of
the mode resolves through this one function:

| Consumer | Site | What it does with the mode |
|---|---|---|
| `validate_dedicated_verification` | `dedicated_verification.py:544` | Returns `applicable=False` (no-op pass) unless mode == `dedicated-sessions`. |
| `derive_workflow_state` → `derive_state` | `dedicated_verification.py:809` / `:729` | Mode != `dedicated-sessions` short-circuits the 7-state ladder to `work-in-progress` / `closed-no-verification`. |
| `close_session` Q6 set-terminal gate | `close_session.py:1692-1700` | Gate armed only when `read_verification_mode(...) == dedicated-sessions` AND `_close_is_terminal(...)`; then runs the content-aware validator (hard-TTY / soft-headless). |

**Implication:** extending `read_verification_mode` to honor the new
`verification_mode_change` kind makes the close gate, the 7-state
derivation, and the cross-provider validator all follow the transition —
with no other call-site changes.

### F2 — `start_session --type …` does NOT gate on the recorded mode

`_run_typed_session` (`start_session.py:717-794`) delegates to
`register_typed_session_start` (`session_state.py:925`), whose fail-loud
contract checks exactly three things: a valid `session_type`, a
`sessions[]` ledger on disk (a known plan), and no session in flight.
The recorded `verificationMode` is never consulted. The same holds for
`--handoff` (`register_typed_session_handoff`).

**Implication:** typed verification/remediation sessions are creatable on
a Mode-A set today — the mode record's runtime effect is confined to the
Q6 close gate, the derived states, and the validator (F1). After the
blessed A→B record, `start_session --type verification` behaves
identically to a from-the-start Mode-B set, and the gates engage because
the F1 read path now resolves to `dedicated-sessions`. No `start_session`
change is required for the transition to be honored.

### F3 — capture-path hazard: `has_verification_mode_record` only counts the original kind

`_capture_verification_mode` runs on **every** `start_session` invocation
(work path `start_session.py:685`, typed path `:772`) →
`resolve_and_record_verification_mode`
(`dedicated_verification.py:225-286`), which no-ops iff
`has_verification_mode_record` returns True — and that helper
(`dedicated_verification.py:201-222`) only counts
`kind == "verification_mode"` entries.

The S3 target population is exactly the implicit-default case: a
completed Mode-A set with **no** `verification_mode` record (nothing was
recorded because the default applied implicitly). After the blessed
writer appends the only durable record (`verification_mode_change`), a
subsequent `start_session --type verification` would still see "no record
exists" and re-capture the spec seed. If the spec seed were still
`out-of-band-or-none` (post-success seed alignment failed, or a CLI-only
flow that never aligned the spec), the capture would append a
`verification_mode: out-of-band-or-none` entry **after** the change
record — and under a naive last-of-either-kind read it would silently
revert the blessed transition and disarm the Q6 gate.

**Implication (implemented this session):** `has_verification_mode_record`
must treat a valid `verification_mode_change` record as "a durable choice
exists" so the once-at-set-start capture stays a no-op after the blessed
transition. With that closed, last-valid-entry-wins across both kinds is
safe, because the blessed writers are the only sanctioned producers of
either kind and the change writer itself refuses when the effective mode
is already `dedicated-sessions` (at most one change record via sanctioned
paths).

### F4 — tier and Explorer reads

- The writer's Lightweight gate reads spec.md's `tier:` via the spec
  config parse (`runtime_mode._spec_tier` pattern,
  `runtime_mode.py:57-88`).
- The Explorer derives `config.verificationMode` from **spec.md only**
  (the 061-consult empirical fact; unchanged by S3). The extension's
  post-writer seed alignment is what keeps the Explorer's view consistent
  with the durable record; on alignment failure the action informs and
  changes nothing further (D3 lock), and the writer's
  "already dedicated-sessions" refusal names the spec-seed misalignment
  so the operator can repair it.
- TS parity helper `verificationModeRecordExists`
  (`verificationModeRewrite.ts:201-223`) mirrors
  `has_verification_mode_record` and must gain the same both-kinds
  recognition to keep the documented parity contract.

## Design consequences locked in before implementation

1. New constant `VERIFICATION_MODE_CHANGE_ENTRY_KIND =
   "verification_mode_change"`; reader + idempotency check recognize both
   kinds, last valid entry in file order wins (F1 + F3).
2. The blessed writer enforces the D4 gates fail-loud, in order:
   target is `dedicated-sessions` (A→B only) → set dir + readable spec +
   `tier: lightweight` → effective recorded mode is `out-of-band-or-none`
   → no typed session in the ledger → no session in flight. Refusals get
   distinct reason codes; CLI exits 3 on refusal (start_session's
   boundary-violation convention), 0 on success, `--json` for the
   extension consumer.
3. No change to `start_session` / `register_typed_session_start` (F2).
4. Extension invokes the writer via the Set 050 spawn pattern
   (`resolvePythonInterpreter` + `cp.spawn` + `isAiRouterNotInstalled`
   stderr detection, the `upgradeOlderSets.ts` precedent); success-only
   seed rewrite + kickoff-prompt copy + toast (D3 lock).
