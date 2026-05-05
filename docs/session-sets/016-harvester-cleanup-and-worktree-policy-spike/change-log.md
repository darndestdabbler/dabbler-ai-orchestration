# Change log — Set 016 (harvester cleanup + worktree policy spike)

> **Status at close-out:** Session 1 of 1 complete. Spike delivered an
> operator-approved technical proposal plus a published case study;
> queues a stack of downstream work (Set 015 re-plan, layout-doc edit,
> 4–5 tooling sets). No code or repo state changes outside this set's
> own folder + `docs/case-studies/` + a small README link.

## What landed in this commit

### Inside the set folder (`docs/session-sets/016-.../`)

- `spec.md` — set-level plan
- `session-state.json` — set status (will flip to `complete` on close-out)
- `session-events.jsonl` — `work_started` for Session 1; `closeout_*` events appended on close-out
- `findings.md` — empirical audit of the harvester's current state (canonical comparison + per-anomaly disposition probe)
- `questions.md` — verbatim prompt sent to both providers (preserved for reproducibility)
- `provider-responses/gemini-2.5-pro.md` — Gemini's response (succeeded via raw API)
- `provider-responses/codex.md` — GPT-5.4 Medium's response (run by operator via Codex after raw-API attempts timed out)
- `provider-responses/route-results.json` — audit record of all routing attempts including the failed API runs
- `proposal.md` — full technical synthesis driving downstream work
- `executive-summary.md` — small stub redirecting to the canonical case-study location
- `change-log.md` — this file

### Outside the set folder

- `docs/case-studies/` (new directory) + `cross-provider-collaboration-spike-016.md` — the canonical case-study version, suitable for casual repo browsers and external sharing
- `README.md` — added a one-paragraph "More" entry pointing to `docs/case-studies/`
- Auto-memory entries (in operator's local `~/.claude/projects/...` — not tracked in git):
  - `feedback_routing_surface_choice.md` — routing surface (API vs IDE agent) is a real choice for future cross-provider consultations
  - `project_marketplace_presentation_followups.md` (updated) — added "Testing" as candidate marketplace category
  - `project_uat_dsl.md` — operator's DSL pattern in dabbler-platform that drives both UAT Checklist + E2E

## Decisions ratified during this session

1. **Option B (Nephew-and-Niece) replaces Option D as the canonical worktree layout.** Strong consensus across all three independent takes (Gemini-2.5 Pro, GPT-5.4 Medium via Codex, orchestrator).
2. **"Preserve first" cleanup discipline** — backups before any destructive operation; defer merge-vs-retire decisions until topology is stable. (GPT's recommendation, accepted over Gemini's auto-merge default.)
3. **Clone-and-swap migration** for D → B (not collapse-in-place). Matches existing canonical migration recipe; preserves rollback safety net.
4. **Patch+bundle archive default for cancelled work**, location `<repo>/docs/cancelled-sessions/<timestamp>-<slug>.{bundle,json}` for discoverability. (Operator approved synthesis recommendations, which included this default.)
5. **Tooling-first regression guardrails** — primary defense is `python -m ai_router.worktree open|close` enforcing the canonical path on every worktree creation. Documentation and lint scripts are secondary.
6. **Migration timing: amend Set 015 Session 3** to incorporate the D → B migration recipe (rather than insert a new set). Set 015 stays paused; its Session 3 gets re-planned.

## Open issues NOT resolved this session (operator decisions)

- **Anomaly A's PoC branch disposition** (merge vs retire vs defer) — operator reviews the three commits' diff against the apparent successor session-set folder when next working on harvester parser/resolver topics. Backups in place mean this can sit indefinitely without risk.

## Queued follow-up work

| # | Description | Recommended sequencing | Notes |
|---|---|---|---|
| 1 | **Layout-doc update** — edit `docs/planning/repo-worktree-layout.md` to reflect Option B as canonical, add decision matrix, drift-recovery section, deactivate-worktree-mode recipe, clone-and-swap migration recipe | Should land BEFORE consumer migrations execute (Sessions 2/3/4 of Set 015 will reference it) | Small, focused commit; doesn't need its own session set |
| 2 | **Set 015 Session 3 re-plan** — incorporate this proposal's clone-and-swap D→B migration into the harvester alignment plan; Sessions 2 and 4 (platform + healthcare-accessdb) get parallel D→B treatment | Becomes the work for Set 015 once it un-pauses | Set 015 spec was authored before this spike's output existed; the harvester migration plan in Set 015 will be re-planned when Set 015 Session 1 (audit) runs |
| 3 | **Worktree CLI tooling** — `python -m ai_router.worktree open|close|list` under a new module `ai_router/worktree.py`. Enforces canonical Option B path on every worktree creation. Highest-priority guardrail because it directly fixes the regression class that caused this spike (`.claude/worktrees/...` drift) | After layout-doc update; either inside Set 015 or as its own small tooling set | Spec lives in `proposal.md` §4.1 |
| 4 | **Layout checker** — `python -m ai_router.repo_layout_check` under `ai_router/repo_layout.py`. Runs as part of session close-out gate to detect drift early | After worktree CLI; can pair with it in one tooling set | Spec lives in `proposal.md` §4.3 |
| 5 | **Cancel-and-cleanup CLI** — `python -m ai_router.cancel_session` with synthesized decision tree, patch+bundle archive default, never-auto-delete-remotes safeguard | Lowest priority; can wait until you actually cancel a session set | Spec lives in `proposal.md` §4.2 |
| 6 | **IDE-agent consult tool** — *new follow-up surfaced this session.* A `python -m ai_router.consult` (or similar) that emits a copy-pasteable bundle (prompt + expected output location) for routing through an IDE-integrated agent (Codex CLI, Gemini Code Assist, Claude Code's own consult capability). Formalizes what we did manually for GPT-via-Codex. The current `ai_router.route()` is one-dimensional (picks provider/model only); this would be the second-dimension primitive (picks routing surface). Out of scope for the current proposal; queued as a future set | Standalone; whenever the operator wants to formalize cross-provider consultation patterns | Operator surfaced this 2026-05-05 after observing that GPT-via-Codex's empirical advantages came from file access, not from anything intrinsic to GPT-5.4. See [docs/case-studies/cross-provider-collaboration-spike-016.md → "Surface choice (API vs IDE agent) was load-bearing"](../../case-studies/cross-provider-collaboration-spike-016.md#surface-choice-api-vs-ide-agent-was-load-bearing) for the full reasoning |

## Naming-convention note

The provider-response file for OpenAI is `codex.md` rather than
`gpt-5.md` (which the original spec listed). The chosen filename
reflects the *routing surface* (Codex IDE agent), not just the model
(GPT-5.4 Medium). Given that the surface choice turned out to be
load-bearing — see the case study for the full discussion — the
filename embeds informative provenance that `gpt-5.md` would have
hidden. The case study and proposal both reference `codex.md` by name
deliberately.

## Routing-attempt summary (for the audit trail)

Three routing attempts were made for the GPT-5.4 consultation:

1. **Raw API, `reasoning_effort: high`, default 300s timeout per attempt, 2 retries.** All three attempts hit read timeout. Total wall-clock unknown (script error captured before timing).
2. **Raw API, `reasoning_effort: high`, bumped 1200s (20-min) timeout per attempt, 1 retry.** Both attempts still hit read timeout. ~40 minutes total wall-clock before failure.
3. **Codex (IDE-integrated agent), GPT-5.4 Medium.** Operator-mediated routing. Succeeded with substantive empirical-grounded response.

The Gemini-2.5 Pro consultation succeeded on first attempt via raw API (113 seconds, $0.0592). Total Set 016 routing spend: **$0.0592** (Gemini only; Codex run was on the operator's subscription, not metered through this repo's API spend).

The cp1252 console encoding bug in the routing helper script (`_route_consultation.py`, since deleted) caused the script to crash on Gemini's success-print containing a `→` character — AFTER Gemini's response was already on disk and the metrics record was already written, but BEFORE `route-results.json` was dumped. The route-results.json under `provider-responses/` was reconstructed manually from on-disk state to preserve audit trail.

## Effort and spend

| Phase | Wall-clock | Spend |
|---|---|---|
| Phase A — Document (in-session) | ~45 min | $0 |
| Phase B — Cross-provider consultation | ~90 min including timeouts and Codex re-route | $0.0592 |
| Phase C — Synthesis + case study + cleanup | ~75 min | $0 |
| **Total** | **~3.5 hours** | **$0.0592** |

Well under the spike's $0.40–$0.80 estimate (Gemini was the only metered call; Codex run on operator subscription not metered through this repo). Within high-budget cap by ~50x margin.

## Verification

End-of-session cross-provider verification was satisfied by the spike's structure itself: two independent providers (Gemini + GPT via Codex) reviewed the same input prompt with the same five questions; their responses are preserved verbatim and synthesized in `proposal.md` with explicit divergence tracking. No additional verifier route was needed. (Spec did not mandate a separate verifier route given the spike's nature; the cross-provider consultation IS the verification.)
