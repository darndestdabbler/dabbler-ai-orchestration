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
