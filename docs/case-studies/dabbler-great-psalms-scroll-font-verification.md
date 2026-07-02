# Case study — single-surface vs. dual-surface verification (`great-psalms-scroll-font`, set 001)

> Captured from an orchestration session on 2026-06-20, immediately after
> closing session 2/2 of `001-foundation-and-asset-import`. The exchange
> clarifies the distinction between the **push** and **pull** verification
> surfaces (Set 070 dual-surface / "overdetermined" verification) and documents
> what actually ran when neither a `pathAwareCritique` record nor a dual-surface
> `verificationMode` is configured.

---

## Operator question

> When you did cross-provider verification, did you do a pull (path-aware)
> verification at the end of the set? And did you do push verification after
> set 001?

---

## Orchestrator response

Good distinction to draw — and the honest answer is **no to the pull arm, yes to
the push arm**. Let me be precise, because these map to specific machinery
(Set 070 dual-surface verification):

### What I actually ran

My Step 6 cross-provider verification (both rounds, routed `session-verification`
→ `gpt-5-4`) **was the PUSH arm**, by definition:

> **PUSH arm** — snippet-fed, single-shot, **no repository access**. The
> committed diff/work-report is fed inline under the `verification.md` template.
> This is the routed `session-verification` surface.

That's exactly what I did: I handed the verifier a written work-report + git
evidence inline; it never read the repo itself.

I did **not** run the **PULL (path-aware) arm**:

> **PULL arm** — repository-reading, agentic tool loop (`pull_route`) over the
> repo at the committed state under the `path-aware-critique.md` template.

### Was the pull arm required here? No.

I checked the durable records, and nothing in this set asked for it:

- **No `pathAwareCritique` record** in `activity-log.json` → it defaults to
  `none`, so close-out's path-aware-critique gate (Set 066) **skipped**. That's
  consistent with the close_session output, which showed only the 5
  deterministic gates and no `path_aware_critique_gate` line.
- **No `path-aware-critique.json` artifact** at the set root, and no
  dual-surface `verificationMode` was configured. The spec's
  `verificationMode: out-of-band-or-none` is the Full-tier-inert default.
- There's also **no separate "end-of-set" verification** in the standard Full
  flow — set close *is* the final session's close, and its verification is the
  per-session one I ran. So "after set 001" there was no additional verification
  pass beyond the final session's.

### Bottom line

| Surface | Ran it? | Why |
|---|---|---|
| Push (snippet-fed `session-verification`) | ✅ yes — rounds 1 & 2, gpt-5-4 | Standard Full-tier Step 6 |
| Pull (path-aware, repo-reading) | ❌ no | Not configured/required (`pathAwareCritique` = none; no dual-surface mode) |

So the set was verified on a **single surface**, not overdetermined across both.

If you'd like the dual-surface coverage retroactively, I can run the **pull /
path-aware critique now** against the committed state (`2232ba7`) as an
out-of-band check — it reads the repo agentically and would independently
confirm `data/letters-all.xlsx` carries no embedded imagery and that the
guidance principles landed. Want me to run it? And separately, if you intend
future sets to always exercise both arms, I can wire a
`pathAwareCritique: advisory|required` record at set start so the gate enforces
it.

---

## Reference notes

- **Push arm** = the routed `session-verification` task type. In this repo's
  `router-config.yaml` it pins to `gpt-5-4` for a Claude/Anthropic orchestrator
  (a different provider = cross-provider). Snippet/diff-fed, single-shot, no
  repository access; uses `prompt-templates/verification.md`.
- **Pull arm** = `pull_route` over the repo at the committed state, agentic
  tool loop, uses `path-aware-critique.md`. Gated by the durable
  `pathAwareCritique` record (Set 066), which defaults to `none` (gate skips).
- **Dual-surface runner** = `ai_router.dual_surface_verify` (Set 070): runs
  **both** arms over the **same committed state** with the same generator output,
  isolating *surface* as the only variable ("overdetermined" verification). It
  is an opt-in `verificationMode`-pattern lever, not the Full-tier default.
- **What closed set 001:** five deterministic close-out gates
  (`working_tree_clean`, `pushed_to_remote`, `activity_log_entry`,
  `next_orchestrator_present`, `change_log_fresh`) + the push-arm
  `session-verification` verdict (round 1 ISSUES_FOUND on a commit-ordering
  artifact; round 2 VERIFIED with git evidence). No path-aware/pull gate fired.
