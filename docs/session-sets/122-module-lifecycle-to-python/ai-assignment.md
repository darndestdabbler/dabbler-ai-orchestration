# AI assignment — Set 122 (module lifecycle to Python)

## Session 1: The lifecycle CLI

**Orchestrator:** github-copilot / claude-opus-5, effort high (Copilot CLI
transport; `project-verify-type.txt` = `COPILOT_CLI`).
**Verifier:** gpt-5.5 (cross-provider; anthropic excluded as the
orchestrator's own effective provider).
**Verdict:** VERIFIED at round 3 (remediation-review), after two blocking
Major findings in rounds 1–2.

**Why this assignment fit.** The session is a *port*, and the risk is not
invention but fidelity: the deliverable had to reproduce an on-disk contract
spread across 2,601 lines of TypeScript without changing a byte of the format.
That rewards an orchestrator that can hold the whole source surface in
context and diff it against a new implementation, which is what this one did.
The two findings it missed were both *omissions* relative to the TypeScript
source (a refusal gated one branch too narrowly, and one of the five adopted
capabilities not ported at all) — exactly the failure mode a cross-provider
reader with the spec in hand catches cheaply, and it did.

**What the verification cost bought.** The discovery round's Major finding
(title-only rename skipped the running-session refusal) was a real
spec-conformance gap. The supplementary round's Major finding (`create` never
ported the lifecycle-set scaffolding or its numbering) was worth the whole
stage on its own: without it, Session 2 would have wired the extension's
**New Module** command to a CLI that silently dropped a main-path behaviour.
Writing the falsifier for that fix then exposed two further defects in the
rollback transaction that no verifier had flagged and no amount of reading
would have surfaced.

**One fan-out call failed.** Discovery ran 1/2 (a `gpt-5.5` Copilot CLI
dispatch returned `handoff-incomplete`); the round stands as a reduced-fan-out
discovery round, and the supplementary pass covered the same evidence with a
completeness lens.

## Session 2: Thin launchers, and the command made visible

**Recommended:** github-copilot / claude-opus-5, effort high —
continue-current-trajectory.

The session's core risk is knowing which TypeScript call sites depend on
which Python guarantee, and branching the launchers on the exit-code and JSON
contract Session 1 defined. That is continuity work, not fresh-eyes work.
Independence is supplied where it belongs — in verification, which excludes
the orchestrator's provider.

Two carry-ins for whoever runs it:

1. **Residual `S122-S1-R1`** (see `disposition.json`): `_existing_lifecycle_slug`
   matches by basename suffix, so module `api` would reuse `payment-api`'s
   lifecycle sets. Session 2 already edits this surface; fix it there.
2. **`gitScaffold.ts` is in scope whether or not the spec names it.** Session 2
   deletes `scaffoldNewModule`, and `scaffoldDefaultModuleAndLifecycleSets`
   calls it. The default-module scaffold therefore becomes Python-backed in
   this session.

## Session 4 (added mid-set): guarantee the required router

Added by operator decision on 2026-08-13 (journaled in `decisions.jsonl`,
authority `human`, trigger `external-consequence`). See that entry for the
full rationale; in short, Session 2 makes the extension depend on
`python -m ai_router.modules`, live PyPI is `0.34.0`, and the setup flow's
plain `pip install` reports an existing 0.34.0 venv as already-satisfied — so
every existing project would take the Marketplace update and then fail every
module command. The operator publishes both registries immediately after Set
122 lands, which makes this a release blocker rather than a follow-up.
