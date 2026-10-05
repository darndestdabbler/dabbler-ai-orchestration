# Consult round 21 — synthesis

2026-09-22. Two briefs in one round: `round21-brief.md` (the proposal
mechanism) and `round21b-brief.md` (the corollary: the reviewer before the
human). Answers: `round21-gemini.md` / `round21b-gemini.md`
(`gemini-3.1-pro-preview`, direct API) and `round21-sol.md` /
`round21b-sol.md` (`gpt-5.6-sol` through the Copilot seat). Claims were
checked against the tree before they were repeated.

The question, from the operator, after a consumer repository's AI could not
get past `published_when_releasable` and a sibling repository commented the
packaging block out of `dabbler.yaml` to close: every impasse must have a
way out, no rule stands above the developer finishing the work, plans must
be modifiable at any time with the operator's approval, and none of it may
be over-engineered. Proposed: one `propose` verb; a modal for the person.
Corollary: before the person, the Primary Reviewer endorses or counters;
the operator also floated a per-model score that requested exceptions
reduce.

## Where the two agree

- **One mechanism, concrete proposals, one record.** Both: a proposal is an
  executable change (a plan amendment or a hold) with a reason, never free
  text; the existing stop menus become the same dialog; show a before/after
  diff, not prose. Gemini: "a lightweight pull request against the plan".
- **A verified step may be changed.** It and what depends on it re-open and
  are reviewed again; unrelated verified work stays verified; the screen
  says which steps before the click (Sol).
- **Only the affected session waits.** Never the loop. An unattended run
  that reaches a person's decision stops cleanly.
- **The AI may propose a hold.** Sol: refusing to let it *propose* does not
  remove the escape hatch, it makes the model guess at flags and edit
  configuration outside the record -- which is what happened. Approval is
  the trust boundary, not authorship.
- **Approval fatigue is the one thing that gets this rejected.** Both,
  unprompted. The operator's later ruling -- a proposal is a LAST RESORT --
  is the answer: the dialog is rare by construction.
- **Drop the counter → agree → test → revert rung.** Both called it
  over-engineering, for the same reason: it already exists. A reviewer's
  alternative is an ordinary finding; the author disposes of it; the tests
  and remediation rounds are the ones that run today. Nothing to build.
- **Ride on the existing verification round.** The proposal is a labelled
  finding the reviewer rules on. Both said this is by far the least code.
- **No score. Count and show.** Both: a penalty for asking guarantees the
  model hides problems or hacks configuration to protect its score -- the
  field behaviour this exists to end. Sol: even scoring rejected asks and
  "workarounds" is gameable and breeds concealment. Put the count in the
  close summary and metrics and tell the model it is visible.

## Where they split

**Whether two AIs may change a session's promised OUTCOME** (close as held,
go past a gate) with the person only informed afterwards.

- Gemini: yes. Author and reviewer are different vendors; git and the
  record are the safety net; a click for something two models agreed on
  defeats unattended runs. On the modal itself Gemini would use a badged
  side panel rather than a modal at all.
- Sol: no. "No rule stands above finishing" justifies an explicit human
  exception, not two correlated model judgments standing in for the owner's
  consent. Reviewer endorsement filters and pre-vets; for an outcome change
  the person still clicks, with the reviewer's verdict attached. Modal only
  when a person's authority is genuinely needed: agreed scope, verified
  work, a gate or verdict, the promised outcome. "Ship reviewer triage, not
  AI authorization."

## Recommendation, and what session 229 takes

Sol's side, on both splits. The modal stays -- the operator asked for it
and a session waiting on a person must not be missable -- and it is rare
because a proposal is the last resort and only four kinds of change reach
it. The split is drawn where the operator would draw it:

- **Engineering changes** (SQLite → H2, a step rewritten, a non-goal
  dropped): reviewer endorses → applied, reported at the close, nobody
  asked. The common case, and the one that stranded the operator.
- **Outcome changes** (nothing ships, close without a verdict): reviewer
  triage runs first and may find the alternative that makes the exception
  unnecessary; an exception that survives triage opens the modal,
  pre-vetted. The rare case, and the one the operator would want to see.

Cut from the framework's own first draft, per the no-over-engineering
directive: no per-wall menu mapping, no `awaiting-operator` state (a stop
already is one), no free-text proposals, no score.

One line: author proposes (last resort) → reviewer endorses or returns one
finding, on the ordinary round → engineering change: applied and reported;
outcome change: modal with the reviewer's verdict → proposals counted and
shown, never scored.
