# Harvester cleanup + worktree-policy spike

> **Purpose:** `dabbler-access-harvester` has accumulated cruft that
> doesn't match the canonical bare-repo + flat-worktree layout: a
> stranded worktree nested inside `.claude/worktrees/`, plus
> top-level `docs/` and `tmp/` directories that the canonical
> standard explicitly forbids ("the container has no source files at
> its top level"). The operator has flagged the state as
> confusing-to-navigate and surfaced an adjacent question — should
> there be a simple way to "deactivate worktree mode" and collapse
> back to a sequential single-tree workflow when the multi-worktree
> overhead isn't paying off? This spike documents the harvester
> mess, asks GPT-5 and Gemini-2.5 Pro for independent
> recommendations on cleanup + future policy, and synthesizes the
> answers into a proposal that informs Set 015 Session 3 (harvester
> alignment) and the canonical layout doc.
> **Created:** 2026-05-05
> **Session Set:** `docs/session-sets/016-harvester-cleanup-and-worktree-policy-spike/`
> **Prerequisite:** None. Set 015 stays `not-started` until this spike completes; its Session 3 (harvester alignment) gets re-planned in light of this spike's output.
> **Workflow:** Single session. Document → consult → synthesize.

---

## Session Set Configuration

```yaml
totalSessions: 1
requiresUAT: false
requiresE2E: false
effort: normal
outsourceMode: first
```

> Rationale: spike, not migration. Output is a proposal document; no
> code or repo state changes this set. Synchronous per-call routing
> for the consultation; no daemon needed.

---

## Project Overview

### What the set delivers

A reasoned proposal for two related questions:

1. **Harvester-specific cleanup recipe.** Concrete sequence of git +
   filesystem operations to bring `dabbler-access-harvester` back to
   the canonical layout: dispose of the stranded
   `.claude/worktrees/vba-symbol-resolution-session-1` worktree,
   resolve the top-level `docs/` and `tmp/` directories, leave the
   container in spec-compliant shape.
2. **Forward-looking layout policy.** Updates (or planned updates)
   to `docs/planning/repo-worktree-layout.md` covering: regression
   guardrails so this kind of drift is caught early; an explicit
   "deactivate worktree mode" recipe for collapsing a bare-repo
   container back to a single working tree when the operator wants
   sequential workflow; criteria for choosing bare-repo + flat-worktree
   vs sequential single-tree per repo.

The proposal is *advisory* — it doesn't itself execute the
cleanup. Set 015 Session 3 (harvester alignment) consumes the
proposal and executes against it after operator approval.

### Motivation

The harvester topology as of 2026-05-05:

```
dabbler-access-harvester/
  .bare/                                                    # canonical
  .git                                                      # canonical
  main/                                                     # canonical, on migrate/dabbler-ai-router-pip
  .claude/worktrees/vba-symbol-resolution-session-1/        # stranded worktree, branch worktree-vba-symbol-resolution-session-1 @ 8ccabf0
  docs/session-sets/workflow-package-pilot/                 # legacy top-level dir
  tmp/feedback/                                             # legacy top-level dir
```

The canonical standard
(`docs/planning/repo-worktree-layout.md`) requires:

```
<container>/
  .bare/
  .git
  main/
  <session-set-slug>/   # active worktrees as siblings of main/
```

And explicitly: *"The container has no source files at its top
level — every working tree is a subdirectory."* Three of the four
deviations above violate that rule.

These aren't theoretical bugs:

- The stranded worktree is registered with git (`git worktree list`
  shows it) but lives in a non-canonical path. Any tooling that
  enumerates worktrees and assumes the canonical sibling layout
  will either miss it or trip on it.
- The top-level `docs/` and `tmp/` directories are not tracked by
  any worktree's working tree (the bare repo doesn't have a working
  copy and `main/` has its own `docs/`); they're orphaned filesystem
  state with no obvious owner.
- The operator reports the topology is confusing to navigate even
  for the person who created it, which means future-self or future
  agents will navigate it worse.

The adjacent question — "should there be a simple way to go back to
sequential workflow?" — is a real product question. The bare-repo +
flat-worktree pattern was adopted as canonical on 2026-04-28 to
solve the proliferation problem, but it adds complexity that may
not pay off for repos running 0–1 in-flight session sets at a time.
A clean off-ramp matters.

### Non-goals

- **No execution against the harvester this session.** The
  cleanup recipe is *recorded* here, *executed* in Set 015 Session 3
  (or a successor) after operator approval.
- **No change to the canonical layout standard this session.** The
  spike *proposes* policy edits; actually editing
  `docs/planning/repo-worktree-layout.md` is a follow-up commit
  gated on operator approval of the proposal.
- **No new tooling implementation.** If the proposal recommends a
  `cleanup-stranded-worktrees` or `deactivate-worktree-mode`
  helper, the spec for that helper is captured in the proposal;
  the implementation is a separate set.
- **No audit of other consumer repos for similar drift.** Spike
  focuses on harvester (the diagnosed case); platform and
  healthcare-accessdb are addressed in their own Set 015 sessions
  with the policy this spike produces in hand.

---

## Naming decisions

- **Set slug:** `016-harvester-cleanup-and-worktree-policy-spike`. Numbered after 015 even though 015 is paused — preserves audit-trail ordering.
- **Spike artifact location:** all spike artifacts live in this
  set's folder. The harvester is observed but not modified.
- **Provider routing:** GPT-5 (OpenAI) and Gemini-2.5 Pro (Google)
  both consulted independently. Same prompt, different providers,
  no cross-pollination. Comparison happens in synthesis.

---

## Session Plan

### Session 1 of 1: Document, consult, synthesize

**Goal:** Produce `findings.md`, `questions.md`, and `proposal.md`
in this set's folder. Cross-provider responses captured in
`provider-responses/` subfolder. Operator reviews proposal at end
of session; if approved, the proposal feeds Set 015 Session 3 and
queues a follow-up edit to the canonical layout doc.

**Steps:**

1. **Register Session 1 start.**
2. **Author `findings.md`** — full harvester topology dump,
   per-anomaly disposition hypothesis, comparison to canonical, what
   each anomaly's likely origin is.
3. **Author `questions.md`** — the prompt that gets sent to GPT-5
   and Gemini-2.5 Pro. Same prompt to both. Includes findings
   verbatim plus the four consultation questions:
   - Safest cleanup sequence for THIS specific harvester state
   - When bare-repo+flat-worktree pays off vs sequential single-tree
   - Recipe for "deactivate worktree mode" command/process
   - Guardrails to prevent regression of all three classes of cruft
4. **Operator approval gate.** Show `questions.md` to operator;
   confirm before any provider routing happens. (This is the only
   per-write-prompt-style approval in this session — once the
   prompt is approved, both routes go.)
5. **Cross-provider routing.** Two routes via `ai_router.route()`:
   one targeting GPT-5, one targeting Gemini-2.5 Pro. Responses
   written verbatim to
   `provider-responses/gpt-5.md` and
   `provider-responses/gemini-2.5-pro.md`. Per the standing
   ai-router result-handling rule, the route result objects are
   dumped to JSON before any attribute access; the dump is saved
   to `provider-responses/route-results.json` for audit.
6. **Author `proposal.md`** — synthesis of both responses. Section
   shape:
   - **Harvester cleanup recipe** — ordered steps, rollback notes
   - **Layout policy edits** — proposed edits to
     `docs/planning/repo-worktree-layout.md`
   - **Tooling spec (if recommended)** — what `cleanup-stranded-worktrees`
     and/or `deactivate-worktree-mode` would do; CLI surface; safety
     considerations
   - **Provider divergences** — where GPT-5 and Gemini-2.5 Pro
     disagreed and why the synthesis went one way
   - **Open questions for follow-up** — anything the operator should
     decide before Set 015 Session 3 picks this up
7. **Operator review of proposal.** Operator reads `proposal.md`,
   approves / requests changes / vetoes specific items. Any vetos
   are recorded in the proposal as struck-through with rationale.
8. **Commit, push, run close-out.** Final session of the set;
   `change-log.md` summarizes what landed and points to the followup
   sets that consume this output.

**Creates:**
- `findings.md`
- `questions.md`
- `provider-responses/gpt-5.md`
- `provider-responses/gemini-2.5-pro.md`
- `provider-responses/route-results.json`
- `proposal.md`
- `change-log.md`
- `activity-log.json`, `session-state.json`, `session-events.jsonl` updates

**Touches:** None outside this set's folder.

**Ends with:** `proposal.md` exists and is operator-approved;
`change-log.md` lists the follow-up actions (Set 015 Session 3
re-plan, possible new tooling set, layout-doc edit commit);
verifier verdict recorded; close-out flips snapshot to closed.

**Progress keys:** all six artifact files exist; `proposal.md`
contains all five required sections; `route-results.json` shows two
successful routes (one per provider) with the full result object
dumped per the standing rule.

---

## Acceptance criteria for the set

- [ ] `findings.md` enumerates all three anomaly classes and the canonical comparison
- [ ] `questions.md` contains the verbatim prompt sent to both providers
- [ ] Both `provider-responses/gpt-5.md` and `provider-responses/gemini-2.5-pro.md` exist and contain the full provider response text
- [ ] `route-results.json` contains the JSON-dumped RouteResult objects for both routes
- [ ] `proposal.md` contains: cleanup recipe, layout policy edits, tooling spec (if recommended), provider divergences, open questions
- [ ] Operator has reviewed `proposal.md` and recorded approval / vetos
- [ ] `change-log.md` lists the follow-up actions (Set 015 re-plan, layout-doc edit, etc.)

---

## Risks

- **Provider responses may be vague or contradictory.** Mitigation:
  the synthesis explicitly captures divergences; the operator
  picks a direction in the proposal review rather than the spike
  forcing a synthesis where one isn't warranted.
- **Cleanup recipe may turn out to need destructive operations
  the spike can't fully reason about.** The
  `.claude/worktrees/vba-symbol-resolution-session-1` worktree
  may hold uncommitted work. Mitigation: `findings.md` probes the
  worktree's git state (clean / dirty / unpushed commits) before
  the recipe gets written; recipe explicitly handles each state.
- **"Deactivate worktree mode" may not be feasible as a one-shot
  command.** The mechanics of going from `<container>/main/` back
  to `~/source/repos/<repo>/` involve moving the working tree out
  of the container, deleting `.bare/`, and restoring a normal
  `.git/` directory. Edge cases (uncommitted work in other
  worktrees, hard-coded absolute paths in IDE state) may force a
  multi-step manual recipe rather than a clean script.
  Mitigation: the proposal is honest about the edge cases and
  says so explicitly; "one-shot command" is a target, not a
  promise.
- **Spike runs over budget.** Each route may be larger than typical
  (findings + four open-ended questions = sizable input + structured
  multi-section response). Mitigation: budget approved as "high"
  ($3–$5 set-level cap); set has only one session so even an outsize
  spend stays within set-level cap.

---

## References

- `docs/planning/repo-worktree-layout.md` — canonical bare-repo + flat-worktree standard
- `docs/session-sets/015-consumer-repo-alignment/spec.md` — the alignment set this spike informs (Session 3)
- Memory entry: `project_consumer_repos.md` — the three consumer repos and their workflow shapes

---

## Cost projection

| Phase | Estimated cost | Notes |
|---|---|---|
| Phase A — Document (in-session) | $0 | Read-and-write only, no provider routes |
| Phase B — Cross-provider consultation | $0.40–$0.80 | Two providers, sizable prompts (findings + four open-ended questions), structured multi-section response per provider |
| Phase C — Synthesis (in-session) | $0 | Operator + orchestrator only, no routes |
| **Set total** | **$0.40–$0.80** | Open-source provider pricing applies; live cost in Cost Dashboard |

Estimate sources: Phase B prompts will be ~3–5 KB input each; expected response ~5–8 KB each. Cost reflects current GPT-5 and Gemini-2.5 Pro published per-token pricing as of 2026-05-05. Actual costs vary with response length and provider rate cards.
