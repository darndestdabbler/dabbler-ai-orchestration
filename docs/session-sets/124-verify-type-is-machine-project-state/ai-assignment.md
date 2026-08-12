# AI assignment — Set 124

One block per session, appended at that session's Step 3.5.

---

## Session 1 — The file is machine/project state

**Orchestrator:** github-copilot / anthropic / claude-opus-5, effort high.

**Why this session sits here.** The work is implementation plus a scoping
correction to a module shipped one set ago: a `.gitignore` rule with
falsifiers, a vocabulary retirement inside `verify_type.py`, and this
repo's own setup resolution. The constitution's Delegation Discipline
pointer assigns implementation, architecture and test authoring to the
active orchestrator; only `session-verification` is routed, and it must
land on a different effective provider than `anthropic`.

**How this set came to exist, because the provenance matters.** The
session opened as "start the next session of Set 122". Step 0's key check
found no `DABBLER_*` provider keys and `python -m ai_router.verify_type`
exiting 3 — the canonical repo that shipped verify-type resolution had
never resolved its own. Surfacing that produced the operator's ruling that
Set 123 had a design flaw (the file should be excluded from git), then the
sharpening that matters most: *"It isn't machine state per se, it is
machine/project state."*

That second sentence is what made this a set rather than a `.gitignore`
line. Machine/project scope is **exactly** the scope
`ai_router/local-overrides.yaml` already occupies, so gitignoring the file
does not remove a duplicate mechanism — it creates one, in the same slot
Set 123's own config comment calls a defect class this repo has hit three
times. Session 2 exists only because of that consequence.

**What the operator decided versus what was derived.** The operator
decided the scope (gitignored; machine/project). Everything downstream —
that `local-overrides.yaml`'s `transport.profile` must therefore be
retired, that "committed" is a code semantic and not a wording nit, that
guided setup is promoted from fallback to the normal first run on every
machine — was derived here and is journaled rather than assumed. Session
2 Step 3 explicitly re-opens the refuse-vs-warn half of it for a
tiebreak-driven decision, because that one changes behaviour on a seat
that is currently working.

**Next orchestrator: continue.** Session 2 retires the duplicate
mechanism and needs the live context of what Session 1's renamed
resolution property now guarantees — specifically which surfaces still
answer "what verifies this project" after the vocabulary change. No
blocker, no cost pressure, no capability gap.

**Next set: Set 122, unchanged in content but now correctly sequenced
behind this one.** The operator chose to run this correction first on the
grounds that it is a defect in the startup path everything else depends
on, including Set 122's own sessions. Set 122's spec needs no edit; only
its start order moved.

---

## Session 2 — One mechanism for the machine/project fact

**Orchestrator:** github-copilot / anthropic / claude-opus-5, effort high.
Block appended retroactively in Session 3 (S2 closed without one; the
constitution's Step 3.5 owes one block per session, and a missing block is a
gap in the record, not a licence to skip it).

**Why this session sat here.** Session 1 made `project-verify-type.txt`
gitignored machine/project state. That is the *identical* scope
`ai_router/local-overrides.yaml` occupies, so S1 did not remove a duplicate
mechanism — it created one, in the slot `router-config.yaml:86` calls a defect
class this repo has hit three times. S2 existed only to close that.

**Next orchestrator: continue.** Session 3 propagates the corrected claim to
every echo, and needed the live context of which surfaces S2 had just made
false.

---

## Session 3 — Every echo, and the first run that is now normal

**Orchestrator:** github-copilot / anthropic / claude-opus-5, effort high.

**Why this session sits here.** The work the spec named is a consistency pass
plus a dogfood: grep the old phrasing, fix every echo in one pass, then walk
branch 3 from a genuinely cold checkout. Both are orchestrator-owned under the
Delegation Discipline pointer; only `session-verification` is routed, and it
must land on a different effective provider than `anthropic`.

**What the session actually found, and why that matters more than the plan.**
The spec scoped Step 3 as *operator-facing strings*. The strings turned out to
be describing a write that Session 2 had turned into poison:
`performCopilotSeatSetup` still rendered `transport.profile: copilot-cli` into
`ai_router/local-overrides.yaml`, the exact key S2 made a hard refusal — so a
**successful** `Dabbler: Set Up Copilot Seat` handed the operator a project
whose every `load_config` raised. Reproduced in a throwaway fixture before
anything was decided, then brought to the operator as an education-mode brief
rather than fixed unilaterally, because it expanded the session's scope.

The operator's constraint — *"We can't break the Direct API option, but we need
to support COPILOT_CLI"* — is what selected the fix: retarget the write to the
one sanctioned entry point (`verify_type --set`, spawned through the scaffolded
venv) rather than teach the extension to write the file itself. The Direct API
path is untouched by construction; an `"api"` pick was always a no-op there.

**Then the required cold-start walk earned its keep.** `L-079-3` asks for a
walk from genuinely unprovisioned state, and this one immediately exposed a
second defect no grep would have found: the written file's own header says
*"Gitignored on purpose"* while nothing gitignored it, so the documented first
run left the answer untracked and committable. The writer now establishes its
own precondition — and that, in turn, made the guarantee this session had just
added to the extension a duplicate, so it was deleted. The set's own thesis
applied to the set's own output.

**Next set: the operator's call.** This is the set's last session. Two
candidates are named in `disposition.json`'s deferred items rather than
asserted here.
