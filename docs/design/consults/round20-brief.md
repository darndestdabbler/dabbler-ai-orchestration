# Consult round 20 — simplify the post-213 recovery plan

2026-09-20. You are advising on a release decision in an AI-led coding-session
framework. The staff handoff is tomorrow morning. Answer only from this brief;
do not ask for repository access. Be concrete and brief, and use the fixed
answer shape at the end.

## Product requirements

1. Do not over-engineer. The simplest reliable design wins.
2. A developer should experience no more friction than telling an AI to build
   something. A Resume or Reconnect button is unacceptable as a routine step.
3. A session should continue autonomously unless it genuinely needs information
   only a person has, an AI service is unavailable, or the person chooses to
   intervene.
4. Reliability is the priority. Four soak tests must pass: Claude Code and
   Copilot CLI on each of two Windows machines.
5. Time and AI spend should target at most twice a direct-AI baseline and must
   remain below three times it.

## What Sessions 213 and 214 changed

Session 213:

- made the accepted plan the single release decision;
- made the loop re-read session status before phases, add, commit, and push;
- made `session next` refuse to steal a live loop's lease;
- made cancellation leave authored files uncommitted;
- classified a caller as person or AI from environment markers, terminal
  interactivity, and an in-process click counter;
- requires `--force` to cancel an in-flight session, but refuses an AI caller
  permission to use `cancel --force`.

The last two rules mean the Authoring AI cannot cancel its own current
in-flight session. `session interrupt --stop` only pauses the loop and leaves
the session in flight.

Session 214:

- records who or what the loop is waiting for and for how long;
- checks the loop lease while waiting;
- can interrupt a framework job;
- validates that planned check executables exist;
- bounds framework jobs;
- retries the reviewer the operator selected;
- automatically rewinds gates whose evidence the framework knows how to
  rebuild;
- records whether a one-shot waiter has read an author instruction and warns
  when an answer is overdue.

## The Session 215 failure

The extension currently starts:

    dabbler session run --mailbox

It also opens an interactive AI terminal and tells the AI to:

1. run `dabbler session wait` in the background;
2. act on the one instruction it prints;
3. run that instruction's answer command;
4. start `session wait` again.

`session wait` is one-shot: it prints one instruction and exits.

In Session 215:

- planning completed at 14:45:24;
- work step 1 was issued at 14:45:29;
- zero work steps were accepted;
- no report or AI output arrived for 55 minutes;
- the loop logged quiet and overdue events;
- the operator stopped and cancelled the session.

The framework loop was alive. The Authoring AI did not re-arm the waiter after
answering the plan, so it never collected step 1. Session 214 diagnosed the
missing answer but could not deliver the instruction.

## An existing alternative

The router already implements:

    dabbler session run

Without `--mailbox`, it:

1. reads the registered engine and model from the session record;
2. writes the next instruction;
3. directly invokes that engine's CLI with the instruction;
4. receives its process result and report;
5. invokes it again for the next instruction;
6. preserves the engine's conversation id when the CLI supplies one.

The direct path therefore has no separate interactive AI terminal and no
one-shot waiter to re-arm. Dabbler owns the author subprocess and can observe
or interrupt it. The mailbox path remains available as an explicit CLI
fallback.

## Current recommendation

Do not restore Session 215. Defer Session 216's dispute redesign until a real
soak or staff run reaches that dead end. Drop Session 217's generic AI
governor.

Plan one corrective patch session:

1. Change the extension's Start Session path from `session run --mailbox` to
   the existing direct `session run`.
2. Do not open the second interactive Authoring AI terminal on Start.
3. Keep mailbox mode only as an explicit CLI fallback.
4. Permit the Authoring AI to run `session cancel --force` for the current
   in-flight session. Cancellation records the reason, preserves the working
   tree, and the loop's existing status checks prevent later add, commit, or
   push.
5. Do not change `close --force`.
6. Add no new schema, lifecycle state, role, record, command, setting, button,
   environment marker, recovery protocol, or UAT harness.

The four soaks use one packaged artifact. Each must close with no human action
after Start, no unexplained stop, no duplicate loop or orphan process, and no
false success. One additional personal-machine check has the Authoring AI
cancel its own session while working; it must finish cancelled, preserve its
files, and leave no process running.

## Questions

1. Is switching the extension's default from mailbox mode to the existing
   direct `session run` the simplest reliable fix for the Session 215 failure?
   Identify any concrete regression that makes it unsafe for tomorrow.
2. What developer-experience capability is lost when the separate interactive
   AI terminal is removed? Is that loss acceptable for the normal Start-to-done
   path, and what is the smallest way to preserve necessary human intervention?
3. Is allowing the Authoring AI to cancel its current in-flight session safe
   under the stated status checks and preservation behavior? If not, name one
   specific additional condition, not a caller-detection system.
4. Should Sessions 215, 216, or 217 be restored before the handoff? Judge each
   separately.
5. Are the four soak criteria sufficient to ship to staff? Name at most two
   missing release blockers.
6. State the exact smallest patch you recommend.

## Answer shape

```
VERDICT: adopt | adopt with changes | do not adopt
1. ... (at most 5 sentences)
2. ... (at most 5 sentences)
3. ... (at most 5 sentences)
4. 215: ...; 216: ...; 217: ...
5. ...
6. ...
BIGGEST RISK: one sentence
```
