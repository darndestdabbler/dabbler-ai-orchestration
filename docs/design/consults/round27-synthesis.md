# Round 27 synthesis: is this the right remediation

Asked 2026-11-16 of `gpt-6.1-sol` and `gemini-4-carbon`, direct API, the
same brief (`round27-brief.md`) with the investigation report (the staff
repository's name removed), the plan text of sessions 334 to 337, what
the orchestrator found for each defect, and the source by excerpt. Their
answers are `round27-sol.md` and `round27-carbon.md`.

Both gave the same verdict: **start with changes.** Neither asked for a
session to be added, removed or reordered.

## The five calls

| Call | Sol | Carbon |
|---|---|---|
| 1. Replacing a declared work plan is not planned | Agree | Agree |
| 2. A mid-session plan edit is shown, not frozen out | Agree, rule incomplete | Disagree as worded |
| 3. Rollback's cancelled pages are left alone | Agree | Agree |
| 4. The reviewer keeps both plans | Agree | Agree |
| 5. `sessions.json` is not written at a plan commit | Agree | Agree |

On call 3 both read the excerpt and reached what the orchestrator had:
the stale page was put back by a revert made by hand.

## Where they agree, and it changes the plan

- **Showing two versions of a section is not enough: the reviewer must be
  told which one binds (session 335, step 3).** As first written, the
  second version was only "labelled as changed during the session", and
  an author who softened a requirement it had not met would have put its
  own text in front of the reviewer on equal footing. Taken. The start
  text is what the session is held to; a difference relaxes nothing by
  being there; a removed or weakened requirement is a finding, decided by
  the ways a finding already has; nothing shown grants a contract change.
- **A modification time is a weak guard (session 334, step 2).** Sol: a
  coarse or rounded timestamp can refuse a good answer, and a copied file
  is fresh. Carbon: two clocks can disagree, and `stampAnswer` already
  refuses a file whose `session_number` is another session's, so asking
  for the number costs almost nothing. Checked: `stampAnswer` does refuse
  a disagreeing member and lets an agreeing one through. Taken, and taken
  further than either asked: the clock comparison is dropped, and the
  answer file is required to say whose it is (the session, and for
  dispositions the round). That is one rule where there would have been
  two, and it has no boundary to test.

## Taken from one of them

- **A heading-looking line inside a fenced block (Carbon; Sol in
  passing).** Checked: this plan has one today, at line 6061. The one
  reader does not treat it as a heading.
- **The one reader changes the contract control (Sol).** A
  `**Contract change.**` paragraph under a level-three heading of its own
  would stop granting. That is the direction of refusing, and the
  transcript already read it that way. Kept, said in the plan and owed to
  the changelog.
- **The author is given the same baseline as the reviewer (Sol).** The
  plan ask reads the section at the start commit too.
- **Consumption follows a successful write (Sol).** A refused answer's
  file stays; a removal that fails does not fail the answer; a link out
  of the scratch folder is not followed.
- **Session 336's words (Sol).** "Nothing is sent to the maintainers",
  since the same dialog makes a provider call; and a test that the report
  still opens when the rollback after it fails. The report already says
  the person chose to roll back, not that a rollback happened.

## Not taken

- **Stop planning when a session has no section (Sol).** A session's row
  comes from its heading, and step 3 reads the section at the start
  commit, so a section cannot go missing under a running session. What is
  left is a repository with no plan section at all, which the plan ask
  has words for today. Not changed on no evidence.
- **A router-issued correlation value for an answer (Sol, offered and
  not pressed).** Requiring the session's number does the work the
  staff repository needed. Proving a plan's content is right is the
  reviewer's, and stays so.
- **Asserting `startCommit` is always populated (Carbon).** The fallback
  to HEAD is the contract control's existing rule and is not this
  session's to change.

## What still gets through, said plainly

Both named it: a file written now, for this session, with the wrong
session's steps in it. Nothing mechanical can know. The reviewer is given
the session's section and the declared work plan together, and their
disagreement is the catch, as it was in the staff repository.

## If session 336 slips

Sol: do not hold the two fixes for the report. Agreed as a fallback and
not written into the plan: the stamp is session 336's, and if that
session cannot finish, the operator moves the stamp to 335 and releases
334 and 335 alone.
