# Consult round 14 — synthesis and recommendation: what a session still asks of a person

**Recommended 2026-09-14 by the orchestrator**, after `round14-brief.md` was
answered by Sol (`gpt-5.6-sol`, `round14-sol.md`, 247 s) and Gemini
(`gemini-3.1-pro-preview`, `round14-gemini.md`, 55 s). Every claim below
that names the tree was checked against it; two of the advisors' claims
were wrong and are marked. The operator decides; this is one
recommendation, not a menu.

## The verdicts in one table

| proposal | Sol | Gemini | recommendation |
| --- | --- | --- | --- |
| 1. cap 3 → 7 | adopt; keep `verify reopen` | adopt; delete `verify reopen` | **adopt 7; keep reopen** |
| 2. ship by default after the first release | adopt; framework reads "first release" from the packaging record; author names a `version_bump` | adopt; no first-release state; CI's approval is the one consent | **adopt; no first-release state; no version member; a session that did not verify does not ship** |
| 3. delete owed decisions | adopt; per-class replacements | adopt; per-class replacements | **adopt; one replacement corrected** |
| 4. non-goals + anti-over-engineering | adopt; `non_goals` required, non-empty; blocking only under the rubric | adopt; `non_goals` optional; violating one is Major | **adopt; required and non-empty; blocking only when a NAMED non-goal is violated, a nit otherwise** |

Both advisors, independently: no convergence rule beside the cap, no
mechanical simplicity signal (diff size, file counts, dependency counts),
no replacement queue for owed decisions, and no "be simple" text in the
provider-wide system prompts. Those four are settled.

## 1. The cap: 7, one line, and the reopen verb stays

Change `verification.settings.max_rounds: 3` to `7` in
`packages/router/router-config.yaml`. Nothing else moves:
`verificationRoundCap` already reads it, and `max_test_rounds` is already
7, so the two loops now share one number.

The ledger (`docs/sessions/sessions.json`, 159 sessions) says 7 is right:
1 round 38, 2 rounds 61, 3 rounds 44, 4 rounds 9, 5 rounds 4, then one
each at 6, 7 and 8. Every reopen ever granted was granted; every reopened
session reached VERIFIED. At 7 the person is asked about one session in
about 160.

**Keep `verify reopen`** (with Sol, against Gemini). It is the only
forward exit at the cap and it is already built, so deleting it buys
nothing and leaves the 8th-round session with `cancel` as its only way
on. Gemini's replacement — "the operator intervenes via `session plan
amend`" — is the exact move session 137 made that did nothing, because
the terminal is read ahead of the cap (`docs/driving-a-session.md`).

## 2. Ship by default: a hold with a reason, and no new state

**The plan member.** Replace `releasable: boolean` in
`packages/router/schemas/driver-work-plan.schema.json` with an optional
`hold_release: "<reason>"`. Absent means the session publishes. Present
means it does not, and the reason names what the work waits on: a later
session, a sibling module, or the first release's go-live. The plan ask
(`drive.ts` `planAsk`) says exactly that, in the operator's words: once
new or fixed functionality can be delivered, it is delivered. The
declaration `phasePlan` writes carries the hold and its reason; the close
reports it.

**No "first release happened" state** (with Gemini, against Sol). Sol
would have the framework read its own packaging record to know whether a
first release exists. Checked: that record lives under `.dabbler/runs/`,
which is gitignored whole, so it does not survive a clone, a second
machine, or a module's focused checkout; the framework would "forget" the
first release exactly where it matters. The operator's own rule already
makes the state unnecessary: the first release is *discussed as early as
possible*, in the session plan a person approves. The plan's author holds
it like any other hold — `hold_release: "first release; go-live
coordination"` — until the plan says go. Zero framework state, and the
go-live conversation happens where planning happens.

**The publication decision goes.** `raisePublicationDecision`,
`publication:<version>`, `dabbler release --reask`, the `--releasable /
--not-releasable` flags on `session declare`, and `session
withdraw-release` are deleted; `dabbler release` tags without asking. For
THIS repository the `marketplace` environment in CI still asks a person to
approve the job; the framework cannot remove that and should not try. If
the operator wants zero clicks it is a GitHub environment setting, not
code.

**Gemini's safety net does not exist for the customer.** Gemini's design
leans on "the CI environment still requires a human click to push to the
final feed". Checked: that is true only of a `release: tag` repository,
which is this one. A customer's NuGet or Maven module is packed and pushed
**from the session's machine** by the framework's own `pack`/`push` pair
(`packaging.ts`). There is no CI gate there. The safety net is the one the
operator named: cross-provider verification and the run of record.

Which is why one rule stays (with Sol): **a session whose verdict is not
VERIFIED does not publish.** A `REMEDIATED_AT_CAP` close ships nothing and
says so; the fix is owed to the next session, which is case (b) of the
operator's rule. A human team does not release a change with a standing
blocking review comment. One `if` in `phasePublish`.

**Keep the gate, re-read.** `published_when_releasable` becomes "published
unless held": a session with no hold and no `published` row does not
close as one that shipped. Gemini would delete it; but it is one read of
the record and it is what keeps "was supposed to ship and did not" from
reading as "was never going to" — the distinction session 138 was paid
for.

**No `version_bump` member** (against Sol). The engine already bumps the
manifest as part of the work — `packaging` refuses a version that was
released before — and the bump is in the diff the reviewer reads. The plan
ask says: a releasing session bumps the version; patch unless the change
adds a capability (minor) or breaks a consumer (major), and the task
paragraph says which. A schema member for it is a second copy of what the
diff shows.

## 3. Owed decisions: delete the module, and what each question becomes

Delete `packages/router/src/owedDecisions.ts` (1,042 lines),
`cli/owed.ts` (500), the extension's `owedDecisionCommands.ts` and its
test, the Work Explorer and Dabbler Terminal rendering, the five
`package.json` contributions, and the `owed_decisions` close gate.
Decisions stay documented where they already are: `activity-log.json`
(rendered to `decisions-log.md`) and `docs/operator-decisions.md`, neither
of which reads the owed file.

What each class becomes, in the brief's order of preference (default,
refusal, one question):

| decision | becomes |
| --- | --- |
| `testing-suites` (the one blocking class) | a **refusal** at `session start` and at the close's freshness row: "no suite is declared in `dabbler.yaml`; declare one" — the fix named, no row |
| `git-remote` | a **refusal** at `session start`: no origin, and the command that adds one |
| `feed-source`, `packaging-feed`, `packaging-secret` | a **refusal** at the publish, naming the setting and the NAME of the variable — the same shape `session start` already uses (what refused, who acts, the command) |
| `dependency-ownership:<pkg>` | a **default**, recorded: treated as external; `dabbler deps` prints how to declare otherwise |
| `publication:<version>` | gone (proposal 2) |
| `driver-stop-s<N>` | gone. The stop message already carries the reason, and since 163 a triaged stop prints the amendment it proposes; the row added nothing |
| `run-of-record-owed/s<N>/<suite>` | a **default**, recorded in the session's own run: the skip is already logged (`run-of-record-skipped`); the gate's excuse (`suitesOwedElsewhere`) must read the run record instead of the owed file |
| `module-grant:<sibling>` | a **default**, recorded: the grant is made when asked for, the reason goes in the exposure manifest and the activity log, and the log prints the permanent form (add the root to `sharedFiles`) |

**One correction to Sol.** Sol would make `run-of-record-owed` a close
refusal. Checked: a focused checkout holds its own module's tests and no
sibling's by design (`drive.ts`, "tests-not-on-disk"), so a refusal would
make every focused session that reaches a sibling's suite unclosable. It
is a default today and stays one; only where the excuse is recorded moves.

**One change to a standing ruling, which is the operator's to make.** The
2026-09-08 module-wall decision made the grant a person's override
(`--request-grant`, answered on the Work Explorer). Both advisors, and
this recommendation, make it automatic and recorded. The wall's purpose —
keep a session's work and tokens on its own module — is kept: the cone is
still narrow by default, the engine still has to ask with a reason, and
the ask is on the record. What goes is the wait. A developer does not stop
work to ask a lead's permission to read a sibling's code (rule a).

**No class needs a toast or a chat question.** Every one is a default or a
refusal that names its fix. That is what makes the module deletable
rather than renamed.

## 4. Non-goals, and the sentence both roles are told

**The plan.** Add `non_goals` to the work-plan schema: required, at least
one item. An engine that cannot name one thing the session will not do has
not understood its scope, and one line of schema costs nothing (with Sol;
Gemini wanted it optional). The plan ask says where they come from: the
session plan's section states scope, and the work plan's non-goals restate
its exclusions or draw the nearest concrete boundary of the task. Note
that the session plan's section already reaches the reviewer verbatim
(`buildTaskBlock`), so a `Non-goals:` paragraph written there today
arrives with no code at all; the schema member is what makes it mandatory
and what carries it when a plan has no section.

**The reviewer.** `buildTaskBlock` adds the plan's task and non-goals to
the round; `verification.md` gains one criterion, *Scope and simplicity*,
with the two halves the advisors split on, resolved:

- Work that a **named non-goal** covers is a blocking finding. Its
  evidence is the non-goal quoted beside the diff hunk; its failure
  scenario is unreviewed surface nobody asked for (Gemini's anchor).
- Work beyond the task that no non-goal names — a needless abstraction, a
  generality nothing uses, an option nobody asked for — is a **nit**,
  unless it clears the existing "so what?" test on its own (Sol). It never
  opens a round by itself.

That keeps the clean-verdict protection the template already has: the
reviewer cannot manufacture an "over-engineering" Major without quoting
the plan's own text.

**The sentence.** The operator's words — over-engineering is forbidden,
and the value AI brings is measured as much by the simplicity and clarity
of its design and implementation as by its alignment with the stated
requirements — go verbatim in two places: the plan ask (the author, once,
before the work) and the verification template (the reviewer, every
round). Each step's ask repeats the non-goals in one line so the author
keeps them during the work. Nowhere else: not the provider system prompts
(they front every routed call, including summarization), not the managed
`AGENTS.md` body (its constraints are this repository's, and both advisors
say a generic "be simple" is either ignored or used to skip necessary
work).

**No mechanical signal.** All three agree: a diff-size or file-count
check fires on every honest refactor and is itself the thing the proposal
warns about.

## Ordering: three sessions

1. **Session 166 — the cap and the non-goals.** One config line;
   `non_goals` in the schema, the plan ask, the step ask, the task block
   and the template criterion. Nothing deleted. Not released.
2. **Session 167 — ship by default.** `hold_release` replaces
   `releasable`; the publication decision, the declare flags,
   `withdraw-release` and `--reask` deleted; the gate re-read; no publish
   without VERIFIED; version guidance in the plan ask. **Released** — it
   is the first session under its own rule, and the last publication a
   person answers by hand.
3. **Session 168 — owed decisions deleted.** The module, the verb, the
   extension command and rendering, the gate; each replacement above.
   Released.

Proposal 2 goes before 3 because the publication decision lives in the
owed module: 167 deletes the one decision, 168 deletes the rest.

## What not to build

- A convergence rule, a "findings shrinking" heuristic, or any second
  reason the loop stops. The number is the rule.
- Any first-release flag, tag convention or state machine.
- A `version_bump` member, or any question about the version.
- A pending-questions inbox, dashboard or answer verb under a new name.
- A diff-size, file-count, dependency-count or complexity score.
- Simplicity text in the provider system prompts or the managed body.

## Where the advisors were wrong, for the record

- Gemini: "the CI environment is the single human consent" — true for this
  repository's tag release only; a customer's module is pushed from the
  session's machine with no CI gate (`packaging.ts`, `readTagRelease` and
  the `pack`/`push` pair).
- Sol: "first release = the first successful packaging run in the
  framework's record" — the record is under gitignored `.dabbler/runs/`
  and does not survive a clone or a focused checkout.
- Sol: `run-of-record-owed` as a close refusal — would make a focused
  session that reaches a sibling's suite unclosable by design.
- Gemini: delete `verify reopen` and use `session plan amend` at the cap
  — that amendment is inert after a terminal, which is why the verb exists.
