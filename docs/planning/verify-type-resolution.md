# Verify-type resolution — operator design, 2026-08-11

> **Status:** operator design, **implemented by Set 123 Session 1** in
> [`ai_router/verify_type.py`](../../ai_router/verify_type.py) (branches
> 1-3, plus the `transport.profile` derivation) with falsifiers in
> `ai_router/tests/test_verify_type_resolution.py`. Run
> `python -m ai_router.verify_type` to see which branch answers for a
> given project. The `DIRECT_API` precondition and the qualified verdict
> below are **implemented by Session 2** in
> [`ai_router/verification.py`](../../ai_router/verification.py) and
> [`ai_router/verification_stamp.py`](../../ai_router/verification_stamp.py),
> with falsifiers in `ai_router/tests/test_qualified_verdict.py`;
> retiring the webview is **Session 3**.
> This replaced the "detect → confirm → persist" placeholder that was R3
> in [`the target-state proposal`](../proposals/2026-08-10-smaller-framework-target-state.md#3-3-both-transports-r3),
> and it is the operator's design, not an inferred one.
>
> **Why it matters beyond configuration:** this is also a proposed
> *replacement* for the Getting Started / setup webview
> (`configEditor/` 2,671 lines + `wizard/` 583 + `dashboard/` 322). A
> resolution rule this small does not need a UI.

## The rule

At **session start**, in order:

### 1. Project file wins

Read `project-verify-type.txt` — location declared in the engine
bootstrap files (`AGENTS.md` / `CLAUDE.md` / `GEMINI.md`, whichever the
running engine reads).

If it exists and contains exactly `DIRECT_API` or `COPILOT_CLI`, **that
is the session's verify type. Proceed silently.** No prompt, no
confirmation — a configured project must not interrogate the user every
session.

### 2. Environment default, confirmed once

If the file is absent or unparseable, read the environment variable
`AI_ORCHESTRATION_VERIFY_TYPE`.

If it holds `DIRECT_API` or `COPILOT_CLI`, **tell the user the default
was detected and ask them to confirm it for this project.** On
confirmation, write it to `project-verify-type.txt`. The project is now
in case 1 forever.

### 3. Guided setup

If neither exists, the agent works with the user to set the project up
for whichever type they want — including, where relevant, making sure API
key environment variables are present and **making a test call to prove
the key works before declaring setup complete.**

**Setup is not finished until both of these are true:**

- `AI_ORCHESTRATION_VERIFY_TYPE` is set in the environment, and
- `project-verify-type.txt` exists, in the place the bootstrap files name, carrying the same value.

## The `DIRECT_API` precondition, and the warning that is not a block

When the resolved type is `DIRECT_API`, at least one provider must have
an API key available **and be a different provider from the current
orchestrator** — the cross-provider rule the whole verification model
rests on.

**If that cannot be satisfied, warn — do not block.** The operator's
ruling, verbatim:

> *"Sure. Verification with the same provider is better than no
> verification at all, but the results should be flagged with this
> limitation."*

**Two consequences, and the second is the important one:**

1. The session proceeds.
2. **The verdict must carry the limitation.** A same-provider verification
   is a weaker claim than a cross-provider one, and the record has to say
   so — otherwise a later reader cannot tell the two apart. This is the
   same discipline as `verification_integrity`'s existing refusal to let
   an uncorroborated verdict pass as a corroborated one; here the verdict
   is real but *qualified*, and the qualification travels with it.

Not a new gate (Set 116's standing rule) — a **field on the record**.

### How Session 2 implemented it

`ai_router.verification.check_direct_api_precondition` answers the
question; `route()` acts on it. Three things the design did not anticipate,
each settled during implementation:

- **The status quo was not "no verification."** When no different-provider
  verifier existed, `verify_session` hard-blocked with
  `verification_unavailable`, whose only exit was
  `close_session --manual-verify` with an operator attestation naming a
  different-provider surface — and `verification_stamp.validate_stamped_row`
  check 5 *machine-rejected* any row whose verifier resolved to the
  orchestrator's provider. Proceeding therefore meant relaxing a close
  gate, not merely skipping a warning. The operator re-ruled on that
  sharper question in session (2026-08-11) and chose the automatic path;
  the decision is journaled in Set 123's `decisions.jsonl` with
  `verification_effect: reduces` and an operator attestation, because
  reducing verification is never self-authorized.
- **The permission is derived inside `route()`, never passed to it.** A
  parameter would have re-opened `I-084-S1-3` (a caller-supplied exclusion
  list that omits the orchestrator's provider). No caller can *ask* for a
  same-provider verification; only the project's committed answer plus the
  machine's actual key set can produce one, and it warns on stderr when it
  does. An **uncommitted** `AI_ORCHESTRATION_VERIFY_TYPE` cannot trigger it
  — a suggestion that could weaken every verdict on a machine would be the
  action-at-a-distance branch 2 exists to avoid.
- **The flag is enforced as a bijection.** The close gate accepts a
  same-provider row only when it carries
  `verification_qualification: "same-provider"`, *and* rejects a
  cross-provider row that carries it. A one-way check would let the flag be
  attached unconditionally, at which point it would distinguish nothing —
  and distinguishing is its only job (`L-112-1`).

Scope stayed narrow: a Copilot seat keeps its fail-closed
`ProvenanceUnavailable` contract (Sets 083/084) untouched, because the
operator's ruling was about `DIRECT_API` key availability, not about seats.

## What already exists, and must be reused rather than rebuilt

A future set should audit these before writing anything:

| module | lines | relevance |
| :--- | ---: | :--- |
| `ai_router/config.py` | 681 | already resolves `transport.profile`, defaulting to `api` (`config.py:504`), and validates the `copilot-cli` block (`:232`) |
| `ai_router/copilot_preflight.py` | 314 | Copilot seat readiness checks |
| `ai_router/transport_diagnostics.py` | 270 | transport-level diagnosis |
| `ai_router/orchestrator_identity.py` | 393 | resolves the orchestrator's **effective** provider — the value the cross-provider check compares against |

**The gap is not detection. It is the resolution order, the
confirm-once-and-remember step, and the qualified-verdict field.** Most
of the machinery is present and scattered; this rule gives it one
entry point.

## Why this can replace the setup webview

The webview surface is **3,576 lines** (`configEditor/` 2,671 + `wizard/`
583 + `dashboard/` 322) plus its Playwright coverage
(`getting-started-surface` 4 scenarios, `system-status` 3,
`vsix-first-run-walkthrough` 1, `overlay-click-swallow` 1 — **9 of the
suite's 35**).

What it does that this rule does not: nothing that a three-branch
resolution and one confirmation prompt cannot do in the terminal, where
the agent already is.

**Retiring it removes 9 Layer 3 scenarios**, which is the operator's
stated preference for sizing Layer 3 — *eliminate on functionality that
is not helpful*, rather than picking a target number.

## Open questions for the authoring set

1. **Where does `project-verify-type.txt` live?** **Settled (Set 123 S1):**
   the project root, found by walking up from the working directory and
   **stopping at the repository boundary** (the first ancestor holding
   `.git`), so a project never inherits an unrelated parent directory's
   answer. It is committed — project configuration, not machine state.
   Session 3 names it in the three bootstrap files.
2. **How does the qualified verdict surface?** **Settled (Set 123 S2):** as
   an omit-null field on the three **router-owned** verdict records — the
   metrics stamp row (`verification_qualification`, the machine-checked
   copy the close gate enforces), the findings envelope
   (`verificationQualification`), and `disposition.json`
   (`verification_qualification`, actively *removed* when a later
   unqualified round supersedes a qualified one, so a stale weaker claim
   cannot outlive the verdict it described). `verify_session` prints a
   warning on stderr naming the round as qualified.

   It is deliberately **not** written to `session-state.json`, and the Work
   Explorer does not show it: that file is the Explorer's surface, and
   operator decision **P4** keeps orchestrator/verifier provenance out of
   the Explorer. Promoting it there is a later set's call if the P4 line
   ever moves — the placement decision is journaled in Set 123's
   `decisions.jsonl`.
3. **What happens when the file and the environment disagree?**
   **Settled (Set 123 S1):** the file wins, silently, and the
   implementation says so rather than leaving it implicit —
   `resolve_verify_type` returns on branch 1 without consulting the
   environment for the answer, and
   `test_project_file_wins_silently_over_the_environment` plants the
   disagreement. One refinement the design did not anticipate: an
   **invalid** project file does *not* fall through to the environment
   either. Falling through would answer a question the project already
   tried to answer, and answer it differently; both invalid branches are
   reported, never guessed at.
4. **Does `router-config.yaml`'s `transport.profile` remain the source of
   truth, or become derived from this file?** **Settled (operator,
   2026-08-11; implemented Set 123 S1):** derived. `config.load_config`
   calls `verify_type.derive_transport_profile`, so where a project file
   exists it *is* the profile — over the tracked config and over a
   seat-local `local-overrides.yaml` both. The `api` default survives as
   the last step of that resolution rather than as a parallel answer
   beside it. The environment variable is deliberately **not** part of the
   derivation: it feeds the confirm-once branch only, so an unconfirmed
   machine default can never silently re-route dispatch.
