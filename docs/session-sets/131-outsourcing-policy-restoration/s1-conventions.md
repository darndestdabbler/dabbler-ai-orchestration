# Conventions for this round (read before reporting findings)

## What this session is

Set 131 Session 1 of 3, "The pin comes out, and the rule that replaces it".

On 2026-08-05 the operator narrowed outsourcing to `verification-only` as a
**temporary** measure, naming Set 111 as the owner of its removal. Set 111
shipped the decision-rights rubric and never lifted the pin; twenty sets
later it was still in force. This session removes it and installs a
precedence-ordered delegation model in its place.

This session **widens what may be routed**. It authorizes no verification
skip, and every widening is gated behind a rule that fails closed to
"orchestrator does it".

## Suite baseline

- 455 passed, 1 skipped across the targeted selection covering every changed
  surface (config, local overrides, transport/verify-type resolution,
  guidance preload manifest, drift guard, routing-exclusion integrity,
  router-config migration, orchestrator identity, doc-only cap).
- 22 of those are the new `ai_router/tests/test_config_delegation_policy.py`.
- The single skip is pre-existing and not related to this change.
- No test was deleted, weakened, or marked xfail in this session.
- The full required-portion run happens at Step 8, after every code-changing
  stage, per the repo's test-run policy (A2). An early full run would be
  invalidated by any remediation this round produces.

## Release contract

Nothing is version-bumped in this session. The changelog fragment and
`change-log.md` are **Session 3's** declared deliverables, not omissions
here.

## By-design exclusions — please do not report these as findings

1. **`AGENTS.md`, `CLAUDE.md`, `GEMINI.md` still describe the retired
   verification-only window.** They are Session 3's assigned `Touches` in
   `spec.md`, and their replacement text cites a *"Rotation, and the trade we
   declined"* section that Session 3 creates. Fixing them here would produce
   a dangling cross-reference. This is a **known, spec-scheduled** two-session
   inconsistency window, not an oversight. It is called out in the session
   disposition.
2. **No "Rotation" section exists in `docs/ai-led-session-workflow.md` yet.**
   Session 3 authors it. Session 1 deliberately states the declined-downgrade
   reasoning inline instead of forward-referencing a section that does not
   exist.
3. **`premium_request_weight` and `ai_router/copilot-catalog.lock` are
   untouched.** That defect (a probe-derived consumption count misread as a
   price) is **Session 2's** entire subject.
4. **No cost gating, no budget enforcement, no orchestrator model change.**
   All three are explicit `Non-goals` in `spec.md`. `child_budget` is
   advisory by design and says so in its own comment.
5. **`requiresUAT: false`, `requiresE2E: false`, `pathAwareCritique` absent
   (defaults to `none`).** No UI surface is touched; nothing rendered
   changes.

## Two things I want adversarial attention on

1. **The independence floor.** `config.INDEPENDENCE_REQUIRED_TASK_TYPES` is
   unioned into `delegation.always_route_task_types` at load, so a config
   cannot delete `code-review` or `security-review`. I chose union-at-load
   over raise-on-missing because raising breaks every config written before
   the key had a floor (including this repo's own `[]` fixture in
   `test_local_overrides_merge.py`). **Is the silent union defensible, or
   does an effective config that differs from the file on disk create a
   worse failure than the one it prevents?** The shipped YAML is asserted to
   state all three explicitly so a reader is not misled.

2. **Rule 3's verifier-synthesis carve-out.** It permits routing the
   *synthesis* of verifier feedback while forbidding synthesis from erasing a
   finding, changing a verdict, or closing a round. **Is that genuinely not a
   verification reduction?** I believe the gate is untouched and the
   carve-out only moves who drafts a recommendation. If you disagree, say so
   plainly — the verification-reduction carve-out is a hard, human-only class
   in this repo and I cannot self-authorize it.

## Severity rubric (L-095-1)

Grade by **consequence**: probability the stated failure scenario reaches a
real user, times impact. Low probability **or** low impact is Minor. No
nameable failure scenario is a nit, not a finding. Please state the concrete
failure scenario for anything you rate Critical or Major.
