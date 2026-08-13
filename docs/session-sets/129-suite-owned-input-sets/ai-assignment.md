# AI Assignment — Set 129

## Session 1 of 2 — The suite declares its inputs

**Orchestrator:** GitHub Copilot CLI (`github-copilot`), Claude Opus 5
(`claude-opus-5`), effort `high`, provider `anthropic`.
**Transport:** `COPILOT_CLI` (`project-verify-type.txt`), so no provider
API keys are carried and none are required.

**Verifier:** `gpt-5.5` (openai) on every round — a different effective
provider from the orchestrator's, resolved by model-registry lookup and
enforced by the exclusion (`excluded providers: anthropic`). The verdict
is independently corroborated; no `verification_qualification` is owed.

**Rounds:** five. Discovery fan-out of 2 (lenses `spec-conformance` and
`failure-scenario`) → 5 Major; supplementary → 1 Major; remediation-review
→ 1 Major; remediation-review cycle 2 → 2 Major; operator-authorized
round 5 → **VERIFIED**, 0 findings, 8 fixes accepted and 1
accepted-with-modification.

Nine Major findings in total. All nine accepted, none disputed, all nine
fixed. Round 5 required the operator's `--operator-authorized-round`
attestation because cycles 1 and 2 were spent settling the *earlier*
rounds' fixes, leaving round 4's two findings fixed but unreviewed —
recorded in `s1-rounds.jsonl`.

**What the routed verification actually bought.** More than a check. The
re-derivation of `covers` was empirical for Layer 1 (a full pytest run
under an audit hook) but derived Layer 2 and Layer 3 from their *commands*
— which name the build inputs and not what the specs read at runtime. The
verifier found that gap, and then found the harder thing underneath it: a
narrowing this session had written down as a *deliberate decision*, with
sound-sounding reasoning, resting on a false premise. Layer 3 does not
exercise the published router; `vsix-first-run-walkthrough.spec.ts` sets
`DABBLER_ROUTER_INSTALL_SPEC` to the repo root and `pip install -e`s this
tree. A same-author review does not catch its own premise.

## Recommendation for Session 2

**Continue with the same orchestrator** (`continue-current-trajectory`).
Session 2 is the doctrine-and-record half: A5's answer and the corrected
safety claim into the authoring guide, eight refusals and six
trigger-gated deferrals recorded where an author meets them, A5 closed in
`session-step-skeleton-and-verification-cost.md`, and `change-log.md`.
Its inputs are `verdict.md` and this session's own reasoning about what
was declared, what was refused, and why — context that is expensive to
rebuild and cheap to carry.

The verifier must remain a non-`anthropic` provider, as it was here.
