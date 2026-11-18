# Consult: an exception process, so a person can always get a session over the finish line

## What Dabbler is (facts, verified against the source today)

Dabbler is an AI-led coding-session framework: a VS Code extension plus a
Node router (`dabbler <verb>`). A person plans sessions in prose. The
framework drives each session one instruction at a time; an authoring AI
(Claude Code or the GitHub Copilot CLI, in a terminal) makes the edits; the
framework runs each step's checks and the tests named after the changed
files, has a **Primary Reviewer** from a different vendor review the diff,
runs the suites as the run of record, commits, pushes and closes. A disputed
review finding goes to an **Auxiliary Reviewer**, a third model that is
neither the author nor the primary. Rules that matter here:

- **The machine owns the record.** Nothing under `.dabbler/runs/` or the
  ledger is hand-edited; no code path accepts a hand-written verdict.
- **Every stop needs a forward exit** (a standing directive: zero deadlock
  tolerance), and **no rule is sacred**: a human may override any rule.
- **No over-engineering**: try removing before adding; no guard may guard
  another guard; adoption outranks rigour.
- `cancel`, `rollback`, `close` and `hold-release` are a person's verbs; an
  engine that tries them is refused.

When the framework cannot go on it records a **stop** with a kind, a reason
and a short list of ways on. The kinds: `budget`, `rejected-thrice`,
`blocked`, `engine`, `tree`, `tests`, `verification`, `funds`, `land`,
`publish`, `close`, `interrupted`, `crash`. The ways on a person has today:

- `dabbler session next` -- carry on from the stop.
- `dabbler session plan amend --step <id> ... --reason` -- change a step's
  files or checks (a person's; an engine is refused).
- `dabbler verify reopen --rounds N --reason` -- buy review rounds a spent
  cap refused. It buys rounds, never a verdict.
- `dabbler session rollback` / `cancel` -- give the work up.
- `dabbler session close --force` -- bypasses bookkeeping gates, never
  evidence gates, and marks EVERY open session in the plan complete. It is
  a way to abandon a plan, not to pass one gate.
- `dabbler triage` -- asks a provider that is not the author's to classify
  a stopped session as engine-error, framework-defect or plan-defect, with
  a minimal amendment and one recommendation. Reads the record, writes
  nothing. It exists and is rarely used.

There is NO way today for a person to say "I have read this gate, it is
wrong here, let this session past it and write down that I said so."

## The Mechanic, as built

Every stop offers "Open a Mechanic": a fresh AI instance, at least as
capable as the author, briefed by `dabbler consult --mechanic` with the
stop, the record and its licence. Its two instructions: *diagnose,
recommend, and act only when the person agrees*; *make the minimum viable
unblocking fix and record it in `mechanic-log.md`*. It leaves its fix
uncommitted; the framework takes the change, the Primary Reviewer reviews
it with the session's diff, and it lands. Its hard limits: never write the
record or any file the router writes; never weaken a gate, a verdict or a
test so that it passes. Unattended (called in by the framework without the
person) it also may not cancel/rollback/close, change the plan or what
counts as done, make a design choice, spend money, or reach outside the
repository.

## What has happened in practice

- In this repository, 240 recorded session runs, 42 of them stopped at
  least once (72 stops). By kind: 24 `publish`, 29 `verification` (7
  no-verdict, 4 dispute-refused, 2 provider-unreachable, 2 cap-related, 14
  uncoded), 6 `engine`, 3 `blocked`, 3 `close`, 3 `rejected-thrice`, 1 each
  of `funds`, `interrupted`, `land`, `tests`.
- `mechanic-log.md` has **zero entries**, and no run's log carries a
  Mechanic event. The operator's words: "I don't think that I have ever
  had a mechanic that has been able to fix anything."
- What actually clears stops: the operator opens a consulting AI, which
  plans a new session with a framework fix, or uses a person's verb.
  Consumer repositories cannot do that: there the framework is an installed
  package, so a wrong rule is a wall until the next release.
- An example from yesterday, in a consumer repository: a step was reported
  `blocked`; the person cleared the blocker; the stop's own printed way on
  (`dabbler session next`) re-read the same blocked report and stopped
  again. The session moved only because someone guessed that answering the
  step again would overwrite the report. Nothing printed said so.

## The operator's concern

"Developers will abandon this framework, and then all the work that has
been done on it and all the rule integrity will not have mattered at all,
if the framework rules prevent human operators from getting a session over
the finish line. We need an exception process that allows the human to get
the session over the finish line. It should guard the integrity of the
process to prevent AI from cheating or lying to get the human to agree to
things that aren't needed; however, it should allow the human to get the
session over the finish line."

## The operator's proposal

1. The Mechanic identifies that a session is stuck, writes **a script**
   that would let the session proceed, and names **the framework rules that
   must be set aside, and why, in plain language**.
2. The framework has **a reviewer** review the script and the proposed rule
   exceptions. The reviewer is told to GUARD the rules: if there is a valid
   set of steps that lets the session proceed without bending a rule, it
   must name them. If it cannot name such steps, it must assume the
   Mechanic is right.
3. If the reviewer names such steps, the Mechanic may **dispute** and say
   why, and the reviewer gets a second chance to agree.
4. If they still disagree, the **Auxiliary Reviewer** resolves it.
5. If the auxiliary cannot, all three models give the person a
   plain-language statement of their position.
6. The framework gives the person **a recommendation**, and asks whether
   they authorise the script and the rule relaxation. If yes, the framework
   executes the script and **logs each exception as authorised by the
   human**.
7. A successful appeal would usually occasion a framework change to the
   rule.
8. Separately: the framework should detect when a session is stuck and
   always offer the person a way to have the current block checked by a
   reviewer for whether it is a FAIR block.

## Answer in exactly this shape, under about 1500 words, plain language

1. **Is the diagnosis right?** Why has the Mechanic fixed nothing? Rank the
   likely causes (its licence forbids the walls that matter; nobody opens
   it; the stops are mostly outside the repository, like `publish`; other).
   Use the stop counts above.
2. **What may be set aside, and what may never be.** Give the line. Is
   there a difference between WAIVING a rule (the record says "this gate
   was not met; a person authorised going on") and FALSIFYING the record
   (it says the gate was met)? Which rule classes fall where: bookkeeping
   gates, scope/file accounting, a step's checks, a failing test, the
   run of record's freshness, a review verdict, the cap on review rounds,
   a publish, the record files themselves.
3. **The mechanism for an exception.** A free-form script the framework
   executes, or named one-shot waivers the router itself applies and
   records (`rule`, `session`, `stop`, `reason`, `authorised by`), with the
   Mechanic's ordinary file edits beside them? If a script: what may it
   contain, who runs it, and how is the record kept honest when a script
   can write anything?
4. **The review ladder.** The proposal is reviewer -> dispute -> second
   look -> auxiliary -> three positions -> human: up to five model calls
   before a stuck developer may proceed. Keep it, cut it, or reorder it?
   Should a review be a GATE on the human's authority or ADVICE the human
   reads? What is the smallest ladder that still stops an AI talking a
   person into an exception they did not need? When the reviewer names a
   within-rules path, should the Mechanic simply TRY it rather than argue?
5. **Guarding against a lying or lazy AI.** What must the reviewer read for
   itself rather than take from the Mechanic's summary? What must the
   person be shown (the rule's own text? what the exception lets through?
   what the session's record will say afterwards?) so the approval is
   informed and takes under a minute?
6. **What the record says afterwards.** How is a session that closed with
   an authorised exception shown -- in the ledger, the transcript page, the
   Work Explorer -- so that it is honest without being a scarlet letter
   that makes developers avoid the process?
7. **"Is this a fair block?"** Reuse `dabbler triage`, extend it, or build
   something else? And "detect that a session is stuck": what signal, given
   that a stop is already explicit and a stall (no activity for 30 minutes)
   is already flagged?
8. **Consumer repositories.** There the framework is an installed package.
   Does the exception process work unchanged? How does an exception
   authorised in a consumer repository reach the framework's maintainers
   as a defect report?
9. **The simplest plan.** Two to four sessions, each three to six steps.
   Name what to DELETE or REUSE rather than add. Say what you would build
   first if only one session were allowed.
10. **The one thing you would push back on** in the proposal as stated.
