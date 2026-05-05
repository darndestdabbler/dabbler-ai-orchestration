# Change log — Set 017 (worktree CLI tooling)

> **Status at close-out:** Session 1 of 1 complete. Worktree CLI
> shipped at `ai_router/worktree.py` with 39 passing tests. Layout
> doc updated to reference the CLI as the canonical lifecycle path
> (replacing manual recipes). The regression class that caused
> Set 016 (`.claude/worktrees/...` drift) is now structurally
> prevented going forward.

## What landed in this commit

### Implementation
- `ai_router/worktree.py` (~610 lines) — CLI module with three subcommands (`open`, `close`, `list`) plus public helpers (`find_primary_worktree_root`, `canonical_worktree_path`, `default_branch`, `enumerate_worktrees`, `assess_closeability`).
- `ai_router/tests/test_worktree.py` (~600 lines, 39 tests, all passing) — comprehensive coverage following the GPT-5.4-Medium tests-must-cover checklist from the design synthesis.
- `docs/planning/repo-worktree-layout.md` — "Worktree lifecycle" section rewritten to reference the CLI as the canonical path; removed "(CLI not yet shipped, follow manual recipes)" framing.

### Set 017 artifacts
- `spec.md`, `session-state.json`, `session-events.jsonl` — set lifecycle records
- `questions.md` — verbatim consultation prompt for both providers
- `provider-responses/codex.md` — GPT-5.4 Medium via Codex
- `provider-responses/gemini-code-assist.md` — Gemini-2.5 Pro via Gemini Code Assist
- `design.md` — synthesis of cross-provider feedback with explicit decisions on each pushback question
- `change-log.md`, `disposition.json`, `activity-log.json` — close-out artifacts

## Decisions ratified during this session

The six pushback questions resolved as follows (full rationale in [design.md](design.md)):

1. **Q1 Helper-factoring + module boundary.** Single module `ai_router/worktree.py` (Gemini's recommendation) acting as both CLI entry and public library — matches `session_state.py`/`disposition.py` pattern. Adopt GPT's renames (`find_primary_worktree_root`, `assess_closeability` returning `CloseabilityReport`).
2. **Q2 `--keep-branch` opt-in.** Both providers agreed; pre-flight covers the data-loss case; clutter risk > recovery friction risk.
3. **Q3 Hard refusal on canonical-path enforcement.** Both providers agreed; no flag, no env var. Raw `git worktree add` IS the existing escape hatch for legitimate non-canonical needs.
4. **Q4 Close sequence: GPT's reordering.** `worktree-remove → remote-delete → local-branch-delete`. On failed remote-delete, local branch preserved as recovery anchor (exit code 2 signals partial completion).
5. **Q5 List output: relative paths in human, absolute in JSON.** Gemini's path framing for human readability; combined GPT+Gemini schema for `--json` (versioned, includes `repo` metadata block, `counts`, `issues` array per worktree for `repo_layout_check` consumption).
6. **Q6 Skip end-of-session verification route.** Both providers agreed tests are the canonical verification surface for tooling. Used GPT's focus list as a tests-must-cover checklist (primary-worktree resolution from inside linked worktree, Windows path handling, destructive ordering, error-message clarity, edge states).

Operator confirmed the synthesis with: *"When in doubt, choose the option that would likely be best received by developers for its clarity. Otherwise, my best judgment."* — applied as the tiebreaker for Q1 (single module wins on clarity) and Q5 (relative paths win on clarity).

## Test coverage

39 tests across 9 classes:

| Test class | What it covers |
|---|---|
| `TestFindPrimaryWorktreeRoot` (4 tests) | Resolution from primary, canonical linked worktree, drift worktree, outside-of-repo error |
| `TestCanonicalWorktreePath` (2 tests) | Path computation, repo-name preservation |
| `TestDefaultBranch` (4 tests) | `origin/HEAD` resolution, fallback to `main`/`master`, error when neither resolves |
| `TestEnumerateWorktrees` (4 tests) | Main classification, canonical, drift, branch-name-mismatch flagging |
| `TestAssessCloseability` (5 tests) | Clean / dirty / unmerged / unpushed-with-upstream / fail-open-on-no-upstream |
| `TestOpenCommand` (6 tests) | Canonical creation, container-on-demand, refuse-existing-path, refuse-existing-slug, --base, attach-existing-branch |
| `TestCloseCommand` (7 tests) | Clean close, container removal, --keep-branch, refuse-dirty, refuse-unmerged, refuse-unregistered, **partial-failure ordering preserves local branch on remote-delete failure** |
| `TestListCommand` (5 tests) | Human output (main only / relative paths / drift summary), JSON schema v1, forward-slash normalization |
| `TestErrorMessageClarity` (2 tests) | Error messages contain `cancel_session` pointer + actionable recovery commands |

Notable: the `test_close_ordering_preserves_local_branch_on_remote_failure` test exercises the most contested design decision (Q4) — verifies that a failed remote-delete leaves the local branch intact, exits with code 2, prints the partial-completion message with the exact follow-up command.

## Routing-attempt summary

Both providers via IDE-agent routing this set (no raw API calls):

| Provider | Surface | Latency | Cost |
|---|---|---|---|
| Gemini-2.5 Pro | Gemini Code Assist (free tier) | manual paste | $0 metered |
| GPT-5.4 Medium | Codex (operator subscription) | manual paste | $0 metered |

Operator note: Initial paste attempts had clipboard issues — the same response (Set 016's GPT response) was pasted twice labeled as different providers; the orchestrator caught the duplicate before treating either as Set 017 input. After a fresh round-trip through both IDE agents with Set 017's prompt, distinct responses came back as expected.

## Queued follow-up work

The Set 016 change-log queued six follow-ups; Set 017 closes one (worktree CLI). The remaining queue, with this set's contributions integrated:

| # | Description | Status |
|---|---|---|
| 1 | Layout-doc update | **Closed** (commit `7ab982a` from prior layout-doc edit; refined again in this set's commit) |
| 2 | Set 015 Session 3 re-plan with D→B migration | Open |
| 3 | **Worktree CLI tooling** | **Closed in this set** |
| 4 | Layout checker (`python -m ai_router.repo_layout_check`) | Open. Now significantly easier to implement: it can consume `python -m ai_router.worktree list --json` output (schema v1 with `issues` array) without re-deriving classification logic. |
| 5 | Cancel-and-cleanup CLI (`python -m ai_router.cancel_session`) | Open. Worktree CLI's `assess_closeability` and `enumerate_worktrees` helpers are usable by `cancel_session` directly. |
| 6 | IDE-agent consult tool (from Set 016 routing-surface insight) | Open |

## Effort and spend

| Phase | Wall-clock | Spend |
|---|---|---|
| Phase A — Author consultation prompt + scaffolding | ~30 min | $0 |
| Phase B — Cross-provider consultation (IDE-agent paste round-trip) | ~30 min | $0 metered |
| Phase C — Synthesis (design.md) | ~30 min | $0 |
| Phase D — Implementation + tests + iteration to green | ~75 min | $0 |
| Phase E — Layout-doc update + close-out artifacts | ~20 min | $0 |
| **Total** | **~3 hours** | **$0** |

Cumulative spend across Set 016 + Set 017 + layout-doc edit: **$0.06** (Set 016 only, Gemini API call). Set 017's IDE-agent routing was free under existing subscriptions.

## Verification

Spec did not mandate a separate end-of-session verification route given the spike's nature. The verification was satisfied by:

1. **Up-front cross-provider design review** (Q1-Q6 routed BEFORE implementation) — caught structural design issues that a post-hoc diff review would have surfaced as code-change requests.
2. **39 passing tests** with explicit coverage of the GPT-recommended focus areas (primary-worktree resolution from linked worktree, Windows path handling, destructive ordering, error-message clarity, edge states).
3. **End-to-end smoke test** of `python -m ai_router.worktree list` and `--json` against the actual orchestration repo, confirming JSON schema and human output formats.

Per the design.md decision on Q6 (skip the route), the design-review consultation IS the verification budget; tests are the canonical correctness gate for tooling code.
