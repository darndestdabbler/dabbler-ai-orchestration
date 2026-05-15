# Complexity Critical Review

> **Purpose:** Audit the current orchestration surface — workflow
> doc, ai_router modules, close-out machinery, gate stack,
> task-type taxonomy, adoption/budget-tier matrix, extension
> surfaces, and config-block flags — and produce a written
> simplification proposal. Score each piece on (a) load-bearing
> vs. ornamental, (b) cost to a Lightweight-tier consumer, (c)
> cost to a no-UAT/no-E2E consumer. Two independent verifiers
> (GPT-5.4 and Gemini 2.5 Pro) review the inventory with a "what
> would you cut?" framing; their independent opinions are
> synthesized into a single proposal. **This set produces a
> proposal, not implementation.** Cuts approved by the operator
> land in a follow-on implementation set.
>
> **Why now (operator-stated rationale, 2026-05-11):** "I just
> want to make sure that the AI Orchestration hasn't become too
> complicated. I think that we should do a separate session-set
> / session in which we critically evaluate the current
> functionality to determine if it should be simplified a bit.
> We should get opinions from GPT 5.4 and Gemini Pro."
>
> **Why an independent set (not bundled with Set 019):** Set 019
> just shipped a non-trivial addition to the config block
> (`uatStyle`), the workflow doc, and the rules list. An audit
> bundled with that work would pull punches because the same
> session authored the surface. Set 020 is intentionally adversarial
> — it asks two external reviewers "what would you cut?" without
> the orchestrator getting to defend its prior decisions
> in-prompt.
>
> **Created:** 2026-05-11
> **Session Set:** `docs/session-sets/020-complexity-critical-review/`
> **Prerequisite:** Set 019 closed (commits `94260a6`, `f1001a7`, `73b826d`, `e93f6f5`).
> **Workflow:** 1 session. Inventory → categorize → dual cross-provider review → synthesis → proposal. No implementation.

---

## Session Set Configuration

```yaml
totalSessions: 1
requiresUAT: false
requiresE2E: false
uatStyle: ad-hoc
uatScope: none
effort: normal
```

> Rationale: pure documentation / analysis work — no code edits,
> no UI surface. Cross-provider verification is the deliverable,
> not an end-of-set check. Two verifier routes
> (GPT-5.4 + Gemini 2.5 Pro) plus optional synthesis-round routes
> are the metered cost. `uatStyle: "ad-hoc"` declared explicitly
> as the first set authored after Set 019 introduced the field —
> documenting the convention by example.

---

## Audit surface (inventory by bucket)

Per-bucket line counts as of 2026-05-11 (post-Set-019):

| Bucket | Primary artifacts | Approximate size |
|---|---|---|
| **A. Workflow doc** | `docs/ai-led-session-workflow.md` | 1752 lines, 10 steps, ~16 rules |
| **B. Authoring guide** | `docs/planning/session-set-authoring-guide.md` | 489 lines, 4 spec-config flags (requiresUAT/requiresE2E/uatStyle/uatScope) |
| **C. Adoption bootstrap** | `docs/adoption-bootstrap.md` | 465 lines, 9 steps + Step 4.5 + abstract pattern catalog |
| **D. close-out machinery** | `ai_router/close_session.py` (1677), `gate_checks.py` (630), `close_lock.py`, `disposition.py` (391) | ~2700 lines + 5 gates + 5 invocation modes (--force / --manual-verify / --repair [--apply] / queue-mediated) |
| **E. Session-state machinery** | `ai_router/session_state.py` (1293), `session_events.py`, `backfill_session_state.py`, `dump_session_state_schema.py` | ~1500+ lines; v2 schema; lifecycle states + reconciler |
| **F. Router + task-type taxonomy** | `ai_router/__init__.py` (`route()`), `router-config.yaml` (587 lines), `models.py`, `providers.py`, `prompting.py`, `cost_report.py`, `metrics.py`, `capacity.py` | 13 task types; tier-1/2/3 split; queue/api modes; verifier fallback; adjudication; tiebreaker |
| **G. Adoption × budget tier matrix** | `docs/adoption-bootstrap.md` Step 4.5 (Lightweight/Full); Step 5 (budget tiers $0/limited/middle/ample) | 2 dimensions × multiple values; documented in bootstrap + workflow doc |
| **H. UAT/E2E gate stack** | workflow doc §UAT Checklist Rule + DSL subsection + Ad-hoc subsection + Choosing-uatStyle; authoring guide same | Newly split in Set 019 |
| **I. Extension surfaces** | `tools/dabbler-ai-orchestration/src/` — wizard (sessionGenPrompt, copyAdoptionBootstrapPrompt), dashboard, providers, commands | Multiple commands, Session Set Explorer tree, Cost Dashboard, mode badges |
| **J. Memory system** | `~/.claude/projects/<repo>/memory/` (user-level, not in repo) | Currently 15 entries; 4 memory types |

**Total audit surface:** ~10k lines of Python + ~3k lines of canonical docs + the extension's TS surfaces + the router config.

---

## What "complexity" means here

The audit is not "fewer lines of code." Surfaces that are
**genuinely load-bearing** are not candidates for cuts. The
audit specifically looks for:

1. **Branches that only fire in rare/never paths.**
   `--repair`, `--apply`, the queue-mediated path for repos that
   only use outsource-first, the manual-verify path, etc.
2. **Flags whose configuration matrix is too wide.** Four UAT-
   related spec flags (`requiresUAT`, `requiresE2E`, `uatStyle`,
   `uatScope`) plus mode (`outsourceMode`), effort, and
   `totalSessions` = 7 spec flags. Are all of them earning their
   complexity?
3. **Doc surface that's grown beyond what a fresh orchestrator
   can absorb in one read.** 1752 lines of workflow doc per
   Step 0's pre-session-context read. Are sections like the
   verifier-disagreement adjudication ladder (Step 7) and the
   delegation discipline section actually consulted, or do they
   silt up the read?
4. **Overlapping concerns.** `--force` and `--repair --apply` and
   `--manual-verify` — three escape hatches with overlapping
   semantics. `outsourceMode: last` queue-mediated verification
   with a daemon + lifecycle events + lock files — load-bearing
   for the platform's two-CLI workflow, but is it justified for
   solo-orchestrator repos?
5. **Carried-forward decisions that no longer apply.** The Set
   011/012 marketplace work, the Set 017 worktree CLI, the Set
   018 lightweight-tier work — each landed real value, but did
   any of them leave behind scaffolding (helper modules,
   migration shims, dead-code branches) that can now be pruned?
6. **Cost to a Lightweight-tier consumer.** Per Set 018, a
   Lightweight consumer uses *only* the Explorer + `spec.md`
   files. Every line of close-out machinery, router config,
   gate-check Python is dead weight for that consumer. The audit
   asks: how much *visible* dead weight remains in core docs that
   a Lightweight consumer is forced to read past?
7. **Cost to a no-UAT/no-E2E consumer.** Same question, applied
   to the UAT/E2E gate stack. Set 019's split was deliberately
   gated on `requiresUAT: true` so non-UAT consumers skip the
   rule entirely — but is the rule visible to them in pre-session
   reads of the workflow doc, and is that cost worth it?

---

## What the set delivers

1. **`audit-inventory.md`** — categorized inventory of the audit
   surface (A through J above) with per-bucket structural
   summaries: what it does, key flags/modes/branches, current
   line counts, who depends on it. Authoritative artifact for
   the two verifier prompts.
2. **`provider-responses/gpt-5-4-cuts.md`** — GPT-5.4's
   independent "what would you cut?" pass. Per-bucket cuts
   proposed, defenses noted, simplifications suggested. No
   synthesis with the other verifier's view at this stage —
   independence is the value.
3. **`provider-responses/gemini-2-5-pro-cuts.md`** — Gemini 2.5
   Pro's independent pass. Same structure.
4. **`simplification-proposal.md`** — **the primary deliverable.**
   Synthesis of the two verifier passes. Sections:
   - **High-confidence cuts** — items both verifiers flagged
     (with rationale and concrete next-step).
   - **Split-opinion items** — items one verifier flagged but
     the other defended (with both arguments quoted, and an
     orchestrator note on which way to lean).
   - **Defended-as-load-bearing** — items the audit looked at
     and concluded should stay (with the reason recorded so
     future audits don't re-litigate).
   - **Deferred items** — items worth simplifying but where the
     cost of the cut exceeds the value (with notes on what would
     unlock them later).
   - **Implementation roadmap** — the operator-approved cuts,
     ordered by independence / risk, for a follow-on Set 021
     implementation set.
5. **Memory updates if anything surprising surfaces** — typically
   one new memory recording the audit's date and key conclusions
   so the next complexity-related conversation can reference it.

### Non-goals

- **No implementation.** Cuts proposed here land in a follow-on
  set (Set 021 candidate slug: `complexity-cuts-round-1` or
  similar) after operator review. Mixing the two would make the
  audit pull punches.
- **No router config changes.** The router-config.yaml is part
  of the audit surface but not part of the deliverable. If the
  proposal recommends config-level changes, those land in the
  follow-on set with the doc/code cuts.
- **No instruction-file rewrites.** CLAUDE.md / AGENTS.md /
  GEMINI.md are read by the verifiers as context but not edited
  by this set.
- **No memory pruning.** The memory system is one audit bucket
  (J) but the audit's deliverable about memory is a proposal,
  not a prune.
- **No verifier-disagreement adjudication via voting.** The two
  verifiers exist to surface independent opinions, not to vote.
  Operator adjudicates split-opinion items.

---

## Sessions
### Session 1 of 1: Inventory → dual review → synthesis → proposal

**Goal:** Land `audit-inventory.md` + both `provider-responses/*.md` +
the synthesized `simplification-proposal.md` in one session. End
state: operator has a written proposal listing high-confidence
cuts, split-opinion items, defended-as-load-bearing items, and a
suggested implementation roadmap.

**Steps:**

1. **Register Session 1 start.**
2. **Read prerequisites:** Set 019's `change-log.md` (just-shipped
   surface; latest state of the UAT/E2E gate stack); the workflow
   doc; the authoring guide; the adoption bootstrap doc; spot-read
   the largest `ai_router/` modules (`close_session.py`,
   `session_state.py`, `gate_checks.py`) for structural shape
   (not every line — the audit is about complexity surfaces, not
   bug-hunting).
3. **Author `audit-inventory.md`** — categorized inventory of all
   10 buckets (A-J). Per bucket: structural summary (what it
   does), key flags/modes/branches, line counts, dependency
   relationships, current consumers (which repos and what they
   use it for).
4. **Operator approval gate** on `audit-inventory.md`. If the
   inventory is missing something material or mis-frames a
   bucket, fix it before routing — the inventory is the input to
   both verifier prompts, and bias in the input cascades.
5. **Author the verifier prompt template.** One prompt; two
   routes; structured JSON response schema asking for
   per-bucket: cuts (with severity), defenses, simplifications,
   and overall complexity score (1-10). The prompt names the
   universal-core / gated-extensions philosophy from CLAUDE.md
   so the verifiers have the philosophical frame.
6. **Route to GPT-5.4** via
   `route(task_type="architecture", complexity_hint=80)` —
   `architecture` is the right task type for "score this surface
   on complexity." Save response to
   `provider-responses/gpt-5-4-cuts.md`. Dump RouteResult to JSON
   first per memory rule.
7. **Route to Gemini 2.5 Pro** with the same prompt. The router
   will need either a different task type (since `architecture`
   defaults to Opus and cross-provider rule may steer to Gemini
   automatically anyway) or an explicit-engine override. Per
   memory `feedback_routing_surface_choice`, IDE-agent routing
   (Gemini Code Assist) is an alternative if the operator
   prefers that path. **Default plan: synchronous API route via
   `route()` with engine override if available, otherwise
   `task_type="planning"` which defaults to Gemini Pro.**
8. **Compare independent passes.** Identify per-bucket overlap
   (both verifiers flagged X), divergence (one flagged, one
   defended), and unanimous defenses (both said leave alone).
9. **Author `simplification-proposal.md`** with the five sections
   named under "What the set delivers" above. Each high-
   confidence cut has a one-paragraph rationale + a concrete
   next-step. Each split-opinion item quotes both verifiers
   verbatim.
10. **Optional synthesis route.** If the two passes disagree
    materially on philosophical direction (not just per-bucket
    items), route the comparison itself to a third tiebreaker
    model for a "which architecture position better serves the
    universal-core / gated-extensions philosophy?" pass. Budget
    permitting only.
11. **Author close-out artifacts:** `change-log.md`,
    `disposition.json` (status: completed, verification_method:
    api, next_orchestrator: null since final session of set),
    `activity-log.json`, snapshot flip via `close_session`.
12. **Commit, push, run close-out.**

**Creates:**
- `docs/session-sets/020-complexity-critical-review/spec.md` (this file)
- `docs/session-sets/020-complexity-critical-review/ai-assignment.md`
- `docs/session-sets/020-complexity-critical-review/audit-inventory.md`
- `docs/session-sets/020-complexity-critical-review/verifier-prompt-template.md`
- `docs/session-sets/020-complexity-critical-review/provider-responses/gpt-5-4-cuts.md`
- `docs/session-sets/020-complexity-critical-review/provider-responses/gemini-2-5-pro-cuts.md`
- `docs/session-sets/020-complexity-critical-review/simplification-proposal.md`
- `docs/session-sets/020-complexity-critical-review/change-log.md`
- `docs/session-sets/020-complexity-critical-review/disposition.json`
- `docs/session-sets/020-complexity-critical-review/activity-log.json`
- `docs/session-sets/020-complexity-critical-review/session-state.json`
- `docs/session-sets/020-complexity-critical-review/session-events.jsonl`

**Touches:** none (analysis-only).

**Ends with:** `simplification-proposal.md` exists with operator-
reviewable cuts, defenses, and roadmap; the audit is closed; a
follow-on implementation set is scaffolded (or explicitly
deferred to operator's schedule).

---

## Acceptance criteria for the set

- [ ] `audit-inventory.md` exists; covers all 10 buckets (A-J); each bucket has structural summary + key flags/modes + line counts + dependency notes.
- [ ] `provider-responses/gpt-5-4-cuts.md` exists; per-bucket cuts/defenses/simplifications + overall complexity score.
- [ ] `provider-responses/gemini-2-5-pro-cuts.md` exists with the same structure.
- [ ] `simplification-proposal.md` exists with five sections (high-confidence cuts, split-opinion, defended-as-load-bearing, deferred, implementation roadmap).
- [ ] Each high-confidence cut names a concrete next-step (file path + nature of edit).
- [ ] Each split-opinion item quotes both verifiers verbatim and notes the orchestrator's read.
- [ ] All five close-out gates pass.
- [ ] No code or canonical-doc edits land in this set (analysis-only).

---

## Risks

- **Verifier "what would you cut?" bias toward more cuts.** Both
  verifiers may default to "yes, cut things" because that's what
  the prompt invites. Mitigation: the prompt explicitly asks for
  defenses too, and the synthesis flags any cut not backed by
  concrete rationale.
- **Audit overwhelming the verifier context.** ~10k lines of
  Python + 3k lines of canonical docs is more than one prompt
  can absorb usefully. Mitigation: the audit-inventory.md is
  the primary input; verifiers see structural summaries + key
  excerpts, not full file contents. They can request specific
  excerpts if they need them (the prompt notes this).
- **Operator disagreement with verifier passes.** Both verifiers
  may flag something the operator considers load-bearing.
  Mitigation: split-opinion section captures it; operator
  adjudicates; the audit logs the decision so future audits
  inherit it.
- **Cost overrun.** Two big verifier prompts (~50k chars each
  with inventory excerpts) at architecture-tier pricing could
  hit $0.80-$1.00. Optional synthesis route adds more.
  Mitigation: spec budget is $0.50-$1.00; the optional
  synthesis route is gated on operator approval at the
  comparison step.
- **"Implementation roadmap" creating implicit commitments.**
  The proposal lists cuts in an ordered roadmap; operator could
  read that as a commitment to do all of them. Mitigation: the
  proposal explicitly says "operator picks which cuts land in a
  follow-on set; the roadmap is a suggested order if all
  approved, not a contract."
- **Set 019 freshness bias.** Set 019 just shipped the
  `uatStyle` split. A complexity reviewer reading that surface
  may flag it as "new and untested" rather than evaluating its
  actual complexity contribution. Mitigation: the audit prompt
  notes Set 019 just shipped and asks the verifier to evaluate
  the *steady-state* surface, not the diff.

---

## References

- `docs/session-sets/019-feedback-disposition-and-uat-two-options/change-log.md` — most recent surface change (the uatStyle split). Audit subject.
- `CLAUDE.md` (repo root) — universal-core / gated-extensions philosophy. The audit's philosophical anchor.
- `docs/planning/project-guidance.md` — durable conventions; audit should not propose cutting these without operator say-so.
- `docs/planning/lessons-learned.md` — lessons accumulated; audit may flag stale ones for the Step 9 reorganization process.
- Memory: `project_uat_dsl.md` (just updated to reflect the uatStyle two-path support); `project_consumer_repos.md` (three consumer shapes — informs which surfaces are load-bearing for whom); `feedback_routing_surface_choice.md` (API vs IDE-agent routing — informs verifier-route choice).

---

## Cost projection

| Phase | Estimated cost | Notes |
|---|---|---|
| Phase A — Author audit-inventory.md (in-session) | $0 | No routes |
| Phase B — Author verifier prompt template (in-session) | $0 | No routes |
| Phase C — Route to GPT-5.4 (architecture, complexity 80, ~50k char prompt) | $0.20–$0.35 | First independent pass |
| Phase D — Route to Gemini 2.5 Pro (same prompt) | $0.15–$0.30 | Second independent pass |
| Phase E — Synthesis (in-session) | $0 | No routes |
| Phase F — Optional tiebreaker (if material philosophical disagreement) | $0.10–$0.20 | Gated on operator approval |
| **Set total (metered)** | **$0.35–$1.00** | Median: ~$0.55. Cumulative-with-019 across both audit + delivery sets: ~$0.55–$1.25 |

Cumulative spend through Sets 016–019 was $0.21 (Set 019 was the
only metered set in that range). Set 020's projection raises the
running multi-set total to ~$0.55–$1.25 — well within the
limited-tier envelope for sets that produce reviewable
deliverables.
