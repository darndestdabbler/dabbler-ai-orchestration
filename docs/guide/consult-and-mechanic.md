# Consult with AI, and the Mechanic

What happens when it gets stuck? Two things a person can reach for, and
neither one is the AI that was doing the work. **Consult with AI** opens an
AI to talk to about the plan, a question or a decision, and it drives
nothing. **The Mechanic** is a fresh AI brought in to get a stuck session
moving again, with the person or without them, inside limits it is told
before it starts.

This page says what each one may do. The full account of stops and the
exceptions to them is in [Driving a session](../driving-a-session.md),
under *When the framework stops*.

## Consult with AI

**Consult with AI** is on every session's menu in the Work Explorer and on
the repository's own, whatever state the work is in.

![The Work Explorer's menu on a planned session, csv-parser-dotnet's
session 001: Start Session, Start Session with Different Models, Consult
with AI, and Cancel Session.](media/session-menu.png)

It asks the same two questions Start Session does, which engine and which
model, and refuses a model Start would refuse. Then it opens that engine's
own CLI in a terminal, in the repository, and gives it one sentence: run
`dabbler consult` and read what it prints before anything else, then ask
the person what they need. Nothing is registered and no session is started.

What `dabbler consult` prints is the **brief**: where the plan files and the
record are, what is true now (which session is in progress, or how many are
complete), how a planned session is written and what the next free number
is, and the licence. The licence says:

- answer questions and read anything;
- edit and commit the plan files when asked, but only while no session is
  in progress -- with one in progress, draft the text in the chat and write
  it once that session has closed, because an edit would move the tree its
  checks are proving;
- commit and push every file it changes before the consultation ends,
  since Start Session refuses a tree with uncommitted changes;
- change no code, no record under `.dabbler/` or the router's files, and no
  verdict;
- turn work that changes code, a fix the framework needs included, into a
  planned session, never its own edit.

So a consult is for three things: **a question** (why did this stop, what
does this session do, what would a rollback keep), **a change to the
plan** (insert a session, split one, add testing), and **a decision at a
stop**, where it reads what the person reads before choosing a way on. It
runs no session, answers no instruction and starts no waiter.

![A Consult terminal running Claude Code on csv-parser-dotnet. It has read
the brief and says it is there to consult, not orchestrate: no session is in
progress, 5 of 7 are complete, the next free number is 8, and it may edit
the plan files but no code. The person asks it to insert a session before
006 for more testing of the work so far, and to make sure 006 and 007 plan
ample testing.](media/consult-request.png)

No session was in progress, so the consult wrote the new session into
`session-plan.md` and, as its brief requires, committed the change for the
person to review. The sessions after it moved up one number.

![The Work Explorer afterwards: csv-parser-dotnet at 5 of 8, with 006 "Test
hardening for the model and the CSV reader", 007 "Database layer" and 008
"Console application" not started, and five
complete.](media/consult-result.png)

`dabbler consult --sessions-dir docs/sessions` prints the same brief in any
terminal, and changes nothing.

## The Mechanic

When a session stops and the AI working it cannot get past, a developer
would ask someone else to take a look. The Mechanic is that: **a fresh
instance** of the session's own engine, at least as capable as the author,
that has not been reasoning inside the problem. It is not the author and
not a reviewer, and it drives nothing.

It is reached two ways.

- **Attended.** **Open a Mechanic** is on the menu of the session in
  flight, and every stop's ways on name it, ahead of ending the session.
  It opens the session's engine on the Mechanic Model (any of that
  engine's models may be picked instead) and has it read `dabbler consult
  --mechanic`. It diagnoses, recommends, and acts only when the person
  agrees.
- **Unattended.** With the Mechanic's delegation at `unattended`, the
  default, the framework calls it in on a stop by itself before handing the
  stop to the person: one attempt per stop, two per session, twenty minutes
  each, and never a Mechanic calling a Mechanic. A wait for funds, a stop
  the person asked for, an unreachable provider and a release session's
  stops go straight to the person. The delegation is set in
  [the Configuration](configuration.md); `attended` keeps it to the menu,
  and `off` names it nowhere.

**What it reads.** The brief quotes the stop as the framework recorded it:
its kind, code and time, the rule that refused in its own words, the ways
on, earlier stops and rewinds, and the latest verification round and
packaging run. It names where the rest of the record is -- `run.json`, the
framework's own log, each job's log, the transcripts -- and the session
plan, so it reads what happened rather than what anyone remembers.

**What it does.** It makes the smallest change that lets the framework
carry on and keeps the author's work as it is, at least in large part, and
it writes what it did and why as an entry in `mechanic-log.md` under the
sessions root. It commits nothing and pushes nothing. The framework takes
the uncommitted change as the fix, and the Primary Reviewer reviews it with
the rest of the session's diff; a fix with no log entry is refused, and an
unattended fix that does not clear the stop is undone. The close names
every fix the session took.

**What an unattended Mechanic may never do.** The brief prints this list
word for word:

- cancel, rollback, close or hold-release the session;
- waive a stop (going past one is `session waive`, which is the person's);
- change the session plan or what counts as done;
- make a significant design choice or add a dependency the plan did not
  approve;
- touch credentials, spend money, or reach anything outside this
  repository;
- weaken a test or a gate;
- write the record or a verdict.

A fix that needs any of those is diagnosed and handed back with no edit.
Unattended, it always ends with a memo for the person, at
`.dabbler/scratch/mechanic-memo-s<N>.md`: the cause and its evidence, what
it tried, how far it got, and one recommendation.

**Where the wall is a rule, it asks.** If no fix within the rules clears
the stop, the Mechanic does not work around the rule. It writes a request
instead, as its `mechanic-log.md` entry: the stop it is about, the rule in
the way, why the rule is wrong here, what going past it lets through, what
was tried within the rules, and two lines for Dabbler's maintainers that
name nothing of the repository. Unattended, that request is all it does
about such a wall.

## Check this stop

**Check this stop** (`dabbler triage`) is on the session in flight while a
stop stands. It is one provider call, and the menu says so before it runs:
a model from a provider that is not the author's reads the record and any
request, and says whether there is a way past within the rules (as the
exact commands, or "none found"), whether the request's account of the
stop matches the record, and whether someone who was not there could
follow it. The answer is kept as advice and decides nothing. See
*An exception is requested, checked and authorised* in
[Driving a session](../driving-a-session.md).

## Review exception

**Review exception** shows the card a person reads before going past a
stop: the rule and what was unmet, from the record; the Mechanic's request
in its words; the advice in the adviser's words; and what the record will
say afterwards. Closing it changes nothing. Typing a reason runs `dabbler
session waive --reason "<why>"`, which takes the session past that one stop
on the person's authority; what was unmet stays written as unmet, and no
verdict is changed. See *Going past a stop with `session waive`* in
[Driving a session](../driving-a-session.md).

## Report this stop to Dabbler

**Report this stop to Dabbler** (`dabbler session defect-report`) is for a
stop where the framework itself is what is wrong. It writes a short report
under `.dabbler/reports/`: the versions, engine, vehicles and the stop's
rule; the Mechanic's two lines for the maintainers, with anything of the
repository replaced by placeholders and checked by the Primary Reviewer;
and an example section left for the person. Nothing is sent: the person
reads it, and sends it if they choose. See *When the framework itself is the
wall* in [Driving a session](../driving-a-session.md).
