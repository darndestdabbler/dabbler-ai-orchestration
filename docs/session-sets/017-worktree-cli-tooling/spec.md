# Worktree CLI tooling

> **Purpose:** Build `python -m ai_router.worktree open|close|list`
> as the primary regression guardrail for the canonical worktree
> layout adopted in Set 016. The CLI enforces the canonical path and
> branch naming on every worktree creation, removing the class of
> drift (worktrees at `.claude/worktrees/...`, mixed-layout
> containers, stranded directories) that caused Set 016 in the first
> place. Documentation alone cannot prevent regression; tooling that
> makes the canonical path the *only* easily-reachable path can.
> **Created:** 2026-05-05
> **Session Set:** `docs/session-sets/017-worktree-cli-tooling/`
> **Prerequisite:** Set 016 closed; layout-doc edit landed (commit `7ab982a`).
> **Workflow:** Single session. Design review (cross-provider) → synthesis → implementation → tests → close-out.

---

## Session Set Configuration

```yaml
totalSessions: 1
requiresUAT: false
requiresE2E: false
effort: normal
outsourceMode: first
```

> Rationale: pure backend Python CLI. No UI surface for UAT; tests
> are the canonical verification surface. Synchronous per-call
> routing for the design-review consultation only (operator-mediated
> via IDE agents).

---

## Project Overview

### What the set delivers

A new module `ai_router/worktree.py` plus tests, providing:

```text
python -m ai_router.worktree open <slug> [--base <branch>]
python -m ai_router.worktree close <slug> [--keep-branch] [--delete-remote]
python -m ai_router.worktree list [--json]
```

**`open`** — creates a worktree at the canonical Option B path
(`<repo-parent>/<repo>-worktrees/<slug>/`) with branch
`session-set/<slug>` (or a branch derived from `--base`). Refuses to
create a worktree at any non-canonical path. Creates the
`<repo>-worktrees/` container on demand.

**`close`** — removes the worktree at the canonical path, deletes
the local branch (default; opt-out via `--keep-branch`), optionally
deletes the remote branch with explicit confirmation. **Refuses to
close if the worktree is dirty / has unmerged commits / has unpushed
work**, pointing the operator to `cancel_session` for the messy
path. Removes empty `<repo>-worktrees/` container after the last
worktree closes.

**`list`** — enumerates worktrees with classification: `main`,
`canonical session-set worktree`, or `drift`. Optional `--json`
output.

### Motivation

Set 016 demonstrated that documentation alone doesn't prevent
worktree-layout drift. The harvester accumulated three drift cases
(non-canonical worktree path, two stranded top-level dirs) within
one week of the bare-repo pattern's adoption. The next pattern
adopted (sibling-worktrees-folder) is simpler and less prone to
drift, but the underlying cause — humans and agents inventing paths
when speed matters more than reading docs — still applies.

The structural fix is to make the canonical path the *easiest* path:
- An operator who runs `python -m ai_router.worktree open <slug>` gets the canonical worktree at the canonical path with the canonical branch name. No path arithmetic, no mental load.
- An agent that needs a worktree calls the same CLI, which refuses to create non-canonical paths. Drift becomes impossible-by-default rather than discouraged-by-doc.

The `list` subcommand serves a complementary role: it surfaces drift
that already exists (e.g., for repos partway through migration), so
operators see the cruft instead of having it silently accumulate.

### Non-goals

- **No interactive workflow.** This is a non-interactive CLI; everything is flag-driven. The cancel-and-cleanup CLI (`cancel_session`, queued separately) is the right surface for interactive prompts.
- **No session-state.json integration.** The CLI is layout-aware, not session-set-aware. It doesn't read or write `session-state.json` files. Session-set tooling that creates worktrees calls this CLI as a primitive.
- **No automatic remote-delete on close.** `--delete-remote` is opt-in and prompts for confirmation. Per Set 016's consensus: never auto-delete remote branches.
- **No GitPython dependency.** Subprocess invocation of `git` only. Matches existing `ai_router/utils.py` style.
- **No D→B migration logic in the CLI.** Migration is a one-time manual recipe (in [docs/planning/repo-worktree-layout.md](../../planning/repo-worktree-layout.md)). The CLI assumes the canonical layout already exists.

---

## Naming decisions

- **Set slug:** `017-worktree-cli-tooling`. Numbered sequentially after Set 016.
- **Module path:** `ai_router/worktree.py`. Tests at `ai_router/tests/test_worktree.py`. Matches existing `ai_router/utils.py` + `ai_router/tests/test_utils.py` pattern.
- **CLI invocation:** `python -m ai_router.worktree`. Consistent with `python -m ai_router.utils`, `python -m ai_router.close_session`, etc.
- **Branch name convention:** `session-set/<slug>` (matches the layout doc's stated convention).
- **Worktree dir name:** literally the session-set slug (no prefix). Container name `<repo>-worktrees/` already disambiguates.

---

## Session Plan

### Session 1 of 1: Design review, synthesis, implementation, close-out

**Goal:** Land the worktree CLI module + tests in a single session, with cross-provider design review gating the implementation. End state: `ai_router/worktree.py` exists, tests pass, layout-doc references the CLI, the regression class that caused Set 016 is structurally prevented going forward.

**Steps:**

1. **Register Session 1 start.**
2. **Author `questions.md`** — consultation prompt covering the proposed design + six pushback questions for the providers.
3. **Operator approval gate.** Show `questions.md`; confirm before routing.
4. **Cross-provider design-review consultation.** Operator-mediated routing through both IDE agents (Codex for GPT-5.4 Medium, Gemini Code Assist for Gemini-2.5 Pro). Per Set 016's lesson: IDE-agent routing is preferred for state-dependent questions, and design review IS state-dependent (providers should see existing `ai_router/` conventions). Responses saved to `provider-responses/codex.md` and `provider-responses/gemini-code-assist.md`.
5. **Author `design.md`** — synthesis of provider feedback + final design decisions on each pushback question. Where providers diverge, note the divergence and pick a direction.
6. **Implement `ai_router/worktree.py`** per the synthesized design.
7. **Implement `ai_router/tests/test_worktree.py`** covering happy paths and edge cases (drift detection, refuse-to-close-if-dirty, idempotency, container creation/removal).
8. **Run tests; iterate to green.**
9. **Update [docs/planning/repo-worktree-layout.md](../../planning/repo-worktree-layout.md)** — flip the worktree-lifecycle section from "manual recipe (CLI not yet shipped)" to "use this CLI."
10. **Author close-out artifacts** (`change-log.md`, `disposition.json`, `activity-log.json`).
11. **Commit, push, run close-out.**

**Creates:**
- `ai_router/worktree.py`
- `ai_router/tests/test_worktree.py`
- `docs/session-sets/017-worktree-cli-tooling/spec.md` (this file)
- `docs/session-sets/017-worktree-cli-tooling/questions.md`
- `docs/session-sets/017-worktree-cli-tooling/provider-responses/codex.md`
- `docs/session-sets/017-worktree-cli-tooling/provider-responses/gemini-code-assist.md`
- `docs/session-sets/017-worktree-cli-tooling/design.md`
- `docs/session-sets/017-worktree-cli-tooling/change-log.md`
- `docs/session-sets/017-worktree-cli-tooling/disposition.json`
- `docs/session-sets/017-worktree-cli-tooling/activity-log.json`

**Touches:**
- `docs/planning/repo-worktree-layout.md` (flip CLI policy statement to "use this CLI")
- `docs/session-sets/017-worktree-cli-tooling/session-state.json` (snapshot updates)
- `docs/session-sets/017-worktree-cli-tooling/session-events.jsonl` (lifecycle events)

**Ends with:** worktree CLI shipped + tests green; layout doc updated to reference the CLI as the canonical lifecycle path; Set 017 closed.

---

## Acceptance criteria for the set

- [ ] `ai_router/worktree.py` exists with three subcommands (`open`, `close`, `list`) per the synthesized design
- [ ] `python -m ai_router.worktree --help` and per-subcommand `--help` print sensible usage strings
- [ ] `ai_router/tests/test_worktree.py` exists, all tests pass under `python -m pytest ai_router/tests/test_worktree.py`
- [ ] `open` refuses to create a worktree at a non-canonical path
- [ ] `close` refuses to close a dirty / unmerged / unpushed worktree (points to `cancel_session`)
- [ ] `list` correctly classifies worktrees as `main` / `canonical` / `drift`
- [ ] `<repo>-worktrees/` container is created on first `open` and removed on last `close`
- [ ] `design.md` records the synthesis of cross-provider feedback + final decisions on the six pushback questions
- [ ] `docs/planning/repo-worktree-layout.md` updated: worktree lifecycle section references the CLI as the canonical path
- [ ] Close-out artifacts (`change-log.md`, `disposition.json`, `activity-log.json`) authored
- [ ] All five close-out gates pass

---

## Risks

- **Design feedback may trigger major redesign.** The synthesis phase could produce design changes that invalidate parts of the proposal-§4.1 spec. Mitigation: the consultation explicitly invites pushback; if any provider proposes a fundamentally different shape, surface it to operator before implementing.
- **Cross-platform path handling.** Operator is on Windows but the CLI must work on macOS/Linux too (other operators may adopt). Mitigation: use `pathlib.Path` throughout; resist hardcoded path separators; tests should use `tempfile` + relative paths only.
- **Subprocess invocation of git on Windows.** Different behaviors than POSIX in some edge cases (e.g., `git worktree remove` on Windows can hit file locks from VS Code/Defender). Mitigation: tests run on Windows-style paths; document gotchas in the module docstring; refer to `python -m ai_router.utils cleanup-dev-orphans` in the error path when file locks block operations.
- **Idempotency edge cases.** What does `open <slug>` do if the worktree already exists? What about partially-created state (e.g., `<repo>-worktrees/` exists but no worktree under it)? Mitigation: design must address explicitly; tests must cover idempotency.

---

## References

- Set 016 spike: [docs/session-sets/016-harvester-cleanup-and-worktree-policy-spike/proposal.md](../016-harvester-cleanup-and-worktree-policy-spike/proposal.md) §4.1 — the original spec
- [docs/planning/repo-worktree-layout.md](../../planning/repo-worktree-layout.md) — canonical layout this CLI enforces
- [docs/case-studies/cross-provider-collaboration-spike-016.md](../../case-studies/cross-provider-collaboration-spike-016.md) — context for the routing-surface choice
- Memory: `feedback_routing_surface_choice.md` — IDE-agent routing for state-dependent design questions

---

## Cost projection

| Phase | Estimated cost | Notes |
|---|---|---|
| Phase A — Author consultation prompt (in-session) | $0 | No routes |
| Phase B — Cross-provider consultation (IDE-agent routing) | $0 metered | Codex on operator subscription, Gemini Code Assist free tier; no API spend metered through this repo |
| Phase C — Synthesis (in-session) | $0 | No routes |
| Phase D — Implementation + tests (in-session) | $0 | Pure local Python work |
| **Set total (metered)** | **$0** | All consultation runs on operator subscriptions; tests are the canonical verification surface for tooling code (no end-of-session API verification route) |

Cumulative spend across Set 016 + Set 017: $0.06 (Set 016 only). Well under high-budget approval ceiling.
