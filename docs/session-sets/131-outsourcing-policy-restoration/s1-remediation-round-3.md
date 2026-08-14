# Session 1 — Round 3 remediation (remediation-review cycle 1)

**Round:** 3 (remediation-review over the round-1 fix delta)
**Verifier:** `gpt-5.5` (`anthropic` excluded)
**Fix verdicts:** 0 accepted, **1 rejected**, 0 accepted-with-modification
**Findings:** 1 blocking (Major, Correctness), 0 minor

The round-1 fix was **rejected, and correctly so.**

---

## The finding

Widening the independence guard from `session-verification` to the whole
floor also widened something I did not intend to touch: the `DIRECT_API`
degradation branch.

That branch exists because a `DIRECT_API` project holding only its own
orchestrator's provider key cannot verify cross-provider at all. The operator
ruled on 2026-08-11 that such a session **proceeds** and carries
`verification_qualification=same-provider` on its record — and that ruling is
journaled to Set 123's `decisions.jsonl` **as a verification-reduction**.

Because the branch keyed off `_precondition.degraded` alone, my round-1 fix
let `code-review` and `security-review` inherit the permission. On a
single-key Anthropic machine, `route()` would enter the independence branch,
clear the exclusion, and `pick_model()` would then honour the
`code-review: sonnet` pin — a successful same-provider "independent" review.

**This is the hard carve-out.** The operator authorized a verification
reduction for one task type. Extending it to two more is the orchestrator
authorizing a verification reduction, which rule 1 of the very section this
session is writing forbids, and which `decision_journal.py` refuses to
record. The reviewer found the policy violating itself.

The reviewer also noted, correctly, that my round-1 tests monkeypatched
`_direct_api_precondition` to `None` — so they could not have caught this.
A gate that never sees the input it guards is L-112-1's exact failure shape.

---

## The fix

`ai_router/__init__.py`: the degradation permission is now computed once as

```python
_degradation_authorized = (
    _precondition is not None
    and _precondition.degraded
    and task_type == SESSION_VERIFICATION_TASK_TYPE
)
```

and **both** branches that previously tested `_precondition.degraded`
(clearing `_verifier_exclusion`, and stripping the orchestrator from
`exclude_providers`) now test that flag. For `code-review` and
`security-review` the exclusion stands, no candidate survives, and the call
raises `VerificationUnavailableError` with the task-type-appropriate remedy
added in round 1.

Removed as now-dead: the task-type-aware degraded warning text from round 1.
Only `session-verification` reaches that branch, so the original wording is
restored and the branch is simpler than before the finding.

`docs/ai-led-session-workflow.md` rule 2 now names the exception explicitly
instead of promising an unqualified fail-closed — the doc-overclaims-the-code
defect that started this whole loop, caught in my own correction of it.

---

## Falsifier evidence (L-112-1)

Three tests added, exercising the branch round 1 patched out.

| test | planted (degradation ungated) | fixed |
| :--- | :--- | :--- |
| `…degradation_does_not_relax_the_floor_for_review_tasks[code-review]` | **FAILED** | passed |
| `…degradation_does_not_relax_the_floor_for_review_tasks[security-review]` | **FAILED** | passed |
| `…degradation_still_applies_to_session_verification` | passed | passed |

The third is the look-alike: the Set 123 S2 operator ruling is still in
force, and scoping the carve-out must not quietly revoke it. It stayed green
under both trees, which is what proves the fix is a narrowing rather than a
removal.

## Suite

319 passed across the affected selection
(`test_independence_provider_exclusion`, `test_config_delegation_policy`,
`test_routing_exclusion_integrity`, `test_orchestrator_identity`,
`test_verify_session_phases`, `test_verify_type_resolution`). No regression.
