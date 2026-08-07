# Operator notes — Set 111

Notes captured from the operator outside a session. Sessions read this file
at their start alongside the spec; nothing here is settled design unless it
says so.

---

## 2026-08-07 — Unaccounted verification work: treat as third-party, do not chase

Recorded at the start of Session 2, on the operator's direction.

**The observation.** A previous session detected verification work in this
set's folder that it did not itself produce — it appeared to have been
spawned somehow behind the scenes, possibly in parallel. Session 1's
disposition records the same thing independently: `s1-verification.md` and a
VERIFIED disposition appeared mid-session, written by something other than
that session, with **no stamped row in `router-metrics.jsonl`**.

**The standing instruction, until it is understood:**

1. **Treat it as a third-party verification.** It is evidence like any other
   third-party opinion — read it, act on substantive points if they are
   right, but it is *not* this session's own verification record.
2. **Never edit it.** Verification artifacts are raw records
   (constitution, *Source of truth*). If it occupies round 1, this session's
   own rounds start at 2 — that is the correct outcome, not drift to repair.
3. **Close only on your own stamped evidence.** A round you did not dispatch
   and cannot find in `router-metrics.jsonl` does not satisfy the no-skip
   verification mandate, whatever verdict it carries.
4. **Disclose it** in the session's `disposition.notes` — one entry naming
   the artifact, the missing stamp, and what (if anything) you acted on.

**Operator's read for now: not problematic.** It has not produced a wrong
outcome, and no session should spend time investigating it inline. But this
is **unexplained behaviour in the verification path**, and the verification
path is the one thing this whole set exists to make trustworthy — so it is
owed an explanation eventually, not a permanent workaround. The leading
hypothesis from S1 is a path-aware CLI process launching verification in
parallel. When someone does look at it, `router-metrics.jsonl` absence is the
sharpest signal available: whatever wrote the artifact did not go through the
stamped route.

---

## 2026-08-07 — Copilot-seat usage IS billed, and the router cannot see it

Operator correction, recorded because an orchestrator got it wrong in this
very set and the mistake is easy to repeat.

**The mistake.** `verify_session` and the close backstop print
`cost: $0.0000` on this machine, and the orchestrator read that as "these
rounds are free." They are not. The operator's account is **GitHub Copilot
Enterprise**, and CLI usage consumes real premium-request budget.

**Why the zero appears.** `transports.copilot-cli.billed_usage_unavailable:
true` in `router-config.yaml` — commented there as *"honest
non-accounting"*. The transport **cannot observe** what a dispatch cost, so
it records zero rather than inventing a number. **Unmeasured is not
unbilled.** Never quote a Copilot-seat cost figure as evidence that
something was cheap.

**The consequence that matters, and it is structural.** Every cost control
in the router keys off *recorded* cost:

- `ai_router/budget.yaml` thresholds,
- `verification.max_cost_multiplier`,
- any per-session or per-set spend report.

On the `copilot-cli` transport all of those see zero, always. **They cannot
bind.** The only guard that still bites is
`transports.copilot-cli.max_invocations_per_session` (200), which the
config itself describes as *"a hard circuit breaker, not a budget"* — and
200 invocations is far above the point at which a human would have wanted
to stop.

So on a Copilot seat, an unbounded loop is unbounded in **spend** as well
as in rounds, and no automated guard can see it happening. This set's
Session 2 is the worked example: the close backstop refused six
consecutive close attempts, each round a real metered dispatch, every one
recorded as `$0.0000`.

**For Session 4 (and Set 112's transport-labelling work):** the
verification-loop bound is not only a time control, it is the *only*
effective spend control on the seat profile. Weakening a bound on this
transport removes a guard nothing else replaces. Two follow-ons worth
considering: surface premium-request consumption in the seat profile even
approximately (or state loudly at close that cost is unaccounted), and
## 2026-08-07 — Work Explorer convenience items to consider (not this set)

Two operator-suggested UI enhancements for the "Dabbler AI Orchestration"
extension, recorded so they are not lost. **Neither is in Set 111's scope** —
this set touches `ai_router` verification machinery, decision rights and
ceremony; it ships no Explorer surface (that is why `requiresE2E: false`).
Candidates for a future extension-facing set.

1. **Start the next session from the session node's context menu.** Right-click
   a session row in the Work Explorer → **Start session**, enabled only when
   that session is genuinely the next runnable one (the previous session is
   complete and the set is in progress). Pure convenience — the operator today
   starts each session by hand in a fresh conversation — but the operator
   expects users will want it, and the tree already knows enough to enable it
   correctly: Set 110 put `SessionRecord[]` (`number`, `title`, `status`) in
   memory at the session level, so the enablement predicate needs no new disk
   read. The item that needs deciding is what "start" *means* at the seam
   between the extension and the orchestrator conversation, not whether the
   tree can offer it.

2. **Open session-specific files from the same context menu.** Right-click a
   session → surface the files that belong to that session, when relevant
   (`sN-conventions.md`, `sN-verification*.md`, `sN-remediation-round-*.md`,
   `sN-issues*.json`, …). Also convenience: these are discoverable by path
   convention today, but only if you know the convention.

**Operator framing:** *"just something to consider for a future enhancement."*
Treat both as candidates, not commitments. Note the tension with this set's own
thesis — **adoption dominates rigour, cut ceremony** — cuts both ways here:
convenience that removes steps for a user is adoption work, but per-session
file surfacing only earns its keep if Set 111 Session 4's artifact-necessity
pass leaves those artifacts standing. Sequence accordingly: decide what
artifacts survive S4 before building a UI that lists them.

---

## 2026-08-07 — In-session progress is not visible to the operator

Recorded during Session 3, on the operator's observation: *"Right now, it
isn't clear where we are in the whole process."*

**The gap.** The framework has a good **set-level** progress surface —
`print_session_set_status()` prints `N/M` per set, and the Work Explorer
renders the same tree. It has **no step-level surface**. Once a session is
in flight, the operator can see that session 3 of 4 is in progress but not
that it is, say, past the build and into the verification loop. The
`activity-log.json` `log_step` entries are exactly this data, written as
the session runs — they are simply never rendered anywhere the operator
looks.

**What the engines offer.** Claude Code shows a live to-do checklist.
GitHub Copilot CLI (1.0.78) has no equivalent: `/tasks` lists running
subagents, `/statusline` and `/footer` configure persistent status items,
`/context` and `/usage` report tokens and spend. So this cannot be solved
by picking the right engine feature — it is either an orchestrator
convention or a Work Explorer feature.

**Two candidate fixes, both cheap:**

1. **Convention (zero code).** The orchestrator posts a compact checklist
   at each phase transition — steps done, step in flight, steps remaining.
   Adopted immediately for the rest of Set 111. This is a prompt-level
   habit, so it costs nothing and works on every engine.
2. **Work Explorer step rendering (a real feature).** Expand an in-flight
   session node to show its `activity-log.json` steps, with the last
   entry marked in-flight. Same data the tree already has a path to; no
   new writer, no new artifact. Groups naturally with the two Work
   Explorer convenience items above.

**Sequencing, same caveat as the items above.** Session 4's
artifact-necessity pass may retire or reshape per-session artifacts, and
`activity-log.json` is on the candidate list. Decide what survives S4
before building a UI that renders it. Candidate for the same future
extension-facing set — **not Set 111's scope**.


---

## 2026-08-07 -- Step-level progress checklists at transitional boundaries

**Operator-directed, during Session 4.** The operator supplied a screenshot
of the shape they want -- a compact table titled `Session N step`, one row
per step with a status box, and the row currently in flight marked
`<- here` -- and directed two things:

1. **Use it for the remainder of this session set**, posting it at each
   transitional boundary.
2. **Bake it into the Orchestrator**, so every repo that uses the framework
   in future displays these checklists at transitional boundaries.

This is the discharge of the item Session 3 recorded and explicitly did NOT
build ("in-session progress visibility ... the framework has a good SET-level
surface and NO step-level surface, even though `activity-log.json`'s
`log_step` entries are exactly that data, written as the session runs and
rendered nowhere"). S3 framed it as *either* an orchestrator convention
*or* a Work Explorer feature. The operator's direction resolves it as
**both halves of the convention path**: a shipped renderer plus a stated
obligation to post it.

**What shipped (S4):** `ai_router.session_checklist`.

```
python -m ai_router.session_checklist              # plain text, cp1252-safe
python -m ai_router.session_checklist --markdown   # table for a chat surface
python -m ai_router.session_checklist --verbose    # full logged descriptions
```

It resolves the in-progress set and the session in flight from
`session-state.json` (never from file presence), reads the logged steps from
`activity-log.json`, and renders one row per step using the `stepKey` as the
short label -- because descriptions are audit-trail prose and a checklist
whose rows wrap is not a checklist.

**Design note worth keeping:** it renders **logged** steps, not planned
ones. Synthesizing rows from the spec would produce a checklist that
disagrees with the record, and the record is what close-out gates on. If the
checklist looks short, the fix is to call `log_step` more faithfully, not to
change the renderer. That also makes the checklist a live incentive to keep
the activity log honest, which the `activity_log_entry` close gate already
depends on.

**Still open, deliberately not built here:** the Work Explorer half. An
in-flight session node could expand to show its logged steps, which is the
same data in the surface the operator already has open. That is a
`tools/dabbler-ai-orchestration` change and belongs to a session that is
allowed to touch the rendering surface (and therefore owes a full Layer 3
run). Recorded, not deferred silently.
