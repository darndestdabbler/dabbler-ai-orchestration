Set 111 Session 2 — operator-attested close (2026-08-07)

CLOSE-OUT REASON
================

Session 2 delivered acceptance criteria with baseline discrimination
(Proposal B): the acceptance block in the verifier envelope, the
`ai_router.acceptance_harness` runner with per-criterion disposable
worktrees, and the retained single `remediation-review` that reads the
harness results. All spec Ends-with items are satisfied, the work is
committed and pushed, and the full suite is green — 3,593 passed / 0
failed / 10 skipped, run after the last code change, with NOTHING
deselected or excused.

MANUAL-VERIFY ATTESTATION
=========================

The verification evidence layer is attested by the operator rather than
satisfied by a fresh close-backstop round. The record this attestation
rests on:

Verification actually ran, cross-provider, ten rounds in total, verifier
`gpt-5.5` with the orchestrator's provider (anthropic) excluded
throughout:

  - Round 1  discovery, K=2, both lenses      ISSUES_FOUND, 5 blocking
  - Round 2  supplementary completeness pass  ISSUES_FOUND, 3 blocking
  - Round 3  remediation-review cycle 1       6 accepted, 1 rejected
  - Round 4  remediation-review cycle 2       7 accepted, 1 rejected
  - Rounds 5-10  close-backstop rounds        1 blocking finding each

Every finding was read, judged on its merits, and FIXED — six distinct
defects from discovery/supplementary plus six more from the backstop
rounds — each with a named regression test, and several with end-to-end
reproductions of the reviewer's exact scenario. Nothing was argued down
and nothing was waived as immaterial. The final two (rounds 9 and 10)
were fixed after the operator explicitly asked whether they were Major;
both were, and both were fixed.

WHY THE BACKSTOP IS BEING ATTESTED PAST, AND WHAT IS OWED
=========================================================

The close backstop refused six consecutive close attempts. Each refusal
carried a correct finding, and each was narrower than the one before —
five of the six were successive spellings of a single class ("what a test
runner collects" / "what counts as a test asset"), which was ultimately
closed by REMOVING the category rather than enumerating it a seventh
time.

The operator's judgment, recorded here as the basis of this attestation:
this deliverable is itself a verification mechanism, and its correctness
claim is universally quantified — *no criterion can falsely close*. A
target of that shape has an effectively unbounded supply of true
counterexamples, so an unbounded reviewer will keep producing them. That
is a property of the target, not evidence of a defective deliverable.

`verify_session`'s enforced 2-cycle bound worked exactly as designed: it
stopped the loop and the operator adjudicated. The close backstop has no
such bound, never runs in GitHub CI (`.github/workflows/test.yml` runs
pytest and Playwright only, with `ci-dummy` provider keys), and therefore
reopened the loop the bound had closed — six more real metered dispatches
on the operator's machine.

An adjudication settles the STOP, not the truth. The owed residual is
stated plainly: **no routed round has reviewed the fixes for backstop
rounds 9 and 10.** Both carry executable regression tests and a green
full suite; neither has a cross-provider verdict. Owner: Session 3, as a
first-item look at `acceptance_evidence_is_stale()` and the
`baseline-mismatch` path in `ai_router/acceptance_harness.py`.

COST NOTE (operator correction, 2026-08-07)
===========================================

Each of those rounds printed `cost: $0.0000`. That figure means
`transports.copilot-cli.billed_usage_unavailable: true` — the transport
cannot observe its own cost — NOT that the round was free. The operator's
account is GitHub Copilot Enterprise and this usage consumes real
premium-request budget. Consequently every router cost control keys off
recorded cost (`budget.yaml` thresholds, `verification.max_cost_multiplier`,
all spend reporting) and none of them can bind on this transport; the only
guard still biting is `max_invocations_per_session: 200`, which the config
itself calls "a hard circuit breaker, not a budget". Recorded because it
makes the unbounded backstop a spend problem, not merely a time problem,
and because it is the strongest argument for Session 4 giving the backstop
a bound.

Attested by the operator; recorded by the orchestrator (copilot /
claude-opus-5 / high, effective provider anthropic).
