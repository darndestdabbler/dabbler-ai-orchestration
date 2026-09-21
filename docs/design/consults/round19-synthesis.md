# Consult round 19 — synthesis

2026-09-20. Brief: `round19-brief.md`. Answers: `round19-gemini.md`
(`gemini-3.1-pro-preview`, direct API, 26 s) and `round19-sol.md`
(`gpt-5.6-sol` through the Copilot seat, 26 s). Claims were checked against
the tree before they were repeated.

The question, from the operator: a dispute should be resolved inside the
session. Instead of the Auxiliary Reviewer ruling UPHOLD or OVERRULE on a
finding, require the Primary Reviewer to state an alternative resolution, and
have the Auxiliary choose one resolution or the other. Would that prevent
prolonged sessions?

## Where both advisors agree, and so does the orchestrator

1. **Adopt it.** A choice between two concrete resolutions ends in something
   the author can carry out. UPHOLD only says who was right, and leaves the
   author guessing at a fix the primary may refuse again.
2. **Call the Auxiliary early, not at the cap.** The impasse exists the moment
   the primary UPHOLDS a finding the author disputed with evidence -- round 2
   or 3. Today nothing is asked until the cap, and the default cap is 7
   (`DEFAULT_VERIFICATION_ROUNDS`, `config.ts`). This, more than the choice
   itself, is what shortens a session: up to four reviewer rounds are bought
   to repeat an argument neither side can end.
3. **The primary states its resolution only when it upholds a disputed
   finding**, in that same answer. No extra call, and no cost on the ordinary
   finding that is simply fixed.
4. **A resolution is scope plus how one can tell it is done** (Sol). The
   biggest risk both name is a "concrete" resolution that is not: prose that
   sounds right and binds the author to something ambiguous.
5. **What follows the ruling is about conformity only.** The primary may say
   the ruling was not carried out; it may not reopen the argument, and the
   author may not dispute the ruling.

## Where they split, and the call

**A third option.** Gemini: strictly two-way; a write-in from the Auxiliary
is an unreviewed third design. Sol: a narrow NEITHER with a binding
replacement, because two wrong proposals would force a known-bad choice.

*The call: two-way.* The forced-bad-choice case is weaker here than in
arbitration generally, because one of the two is always the tree as it
stands, which already builds and passes its tests -- choosing the author can
never break the build. And a model offered a compromise takes it: NEITHER
would become the usual answer, and the usual answer would be the one design
nobody reviewed. 216 already has the rule that covers the rare real case: an
answer outside the closed menu is an escalation, at once, and is recorded as
a defect report.

**When the conformity round fails.** Gemini: halt for a person. Sol: the gaps
become mandatory corrections and the session closes with no further review.

*The call: neither -- it is an ordinary round.* A halt breaks the operator's
goal, and closing on a fix nobody reviewed breaks the no-skip mandate. No new
kind of round is needed: after a ruling the loop goes on under its ordinary
cap, with the ruled finding marked settled. "Not carried out" is a blocking
finding like any other and goes back to the author; the argument cannot
return because neither side may raise it. What is left over at the cap is
what 216's governor is for.

**One adjudication a session** (Sol would keep it). With an early call it
becomes a dead end the first time a second finding is disputed in a later
round. *The call:* a finding is ruled on once, ever; and rulings draw on the
same budget as the governor's decisions -- two a session, then the person.
One role, one budget.

## The recommendation

Adopt the operator's proposal, as the way a dispute ends:

1. When the primary UPHOLDS a disputed finding, the same answer states the
   resolution it would accept: what changes, and how one can tell it is done.
   An uphold without one is a malformed answer, retried as such.
2. The Auxiliary Reviewer is called then -- once for all of that round's
   upheld disputes -- and chooses AUTHOR or PRIMARY for each. Anything else
   is an escalation.
3. AUTHOR: the finding is withdrawn for good. PRIMARY: the author is
   instructed to carry out that resolution and cannot dispute it.
4. The loop goes on as it always does, the ruled finding settled. The
   adjudication row stays the record of who ruled.
5. Two Auxiliary decisions a session, of either kind, then the person.

This is a session of its own, not an item inside the governor's: it changes
the primary's answer shape, when the Auxiliary is called, what it is asked,
and what a ruling becomes. **Proposed: it is session 216, and the governor
becomes 217.** The dispute comes first because it is the one impasse known to
have no exit today (`runAdjudication` writes a terminal row on an uphold and
no round may open after it), and the governor's item 5 is then already done.

*Approved by the operator, 2026-09-20 -- "keep it as simple as possible" --
and planned as session 216, with the governor as 217. Made smaller in the
planning: the record keeps the two words it has (OVERRULED is the author's
position standing, UPHELD is the primary's resolution to be carried out), so
there is no new vocabulary, no new verb and no new kind of round.*
