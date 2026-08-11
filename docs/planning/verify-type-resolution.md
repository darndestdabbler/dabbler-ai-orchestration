# Verify-type resolution — operator design, 2026-08-11

> **Status:** design decision, recorded for a future set. **Not built.**
> This replaces the "detect → confirm → persist" placeholder that was R3
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

1. **Where does `project-verify-type.txt` live?** The bootstrap files must name it, and all three (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) are kept in lockstep by policy. Repo root is the obvious candidate; it must be committed, since it is project configuration rather than machine state.
2. **How does the qualified verdict surface?** A field on the verdict record is the cheap answer; whether `close_session` prints it, and whether the Work Explorer shows it, is a separate call.
3. **What happens when the file and the environment disagree?** The rule above says the file wins silently. That is deliberate — a project's committed choice should not be overridden by whatever machine it is checked out on — but it should be *stated* in the implementation, not left implicit.
4. **Does `router-config.yaml`'s `transport.profile` remain the source of truth, or become derived from this file?** Two mechanisms for one fact is the defect class this repo has hit three times. **Pick one.**
