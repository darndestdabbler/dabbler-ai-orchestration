# What an engine's shell carries that a person's does not

Measured 2026-09-20 on the operator's Windows 11 machine, for session 213.
Names only were read; no value of any variable was printed except the two
quoted below, neither of which is a credential.

## Why this was measured

`session cancel --force`, `session close --force` and `session hold-release`
are a person's verbs. The router tells a person from an engine by what the
calling shell's environment carries (`callerIsEngine`, `session.ts`). Until
this session it knew two markers -- `DABBLER_DRIVEN`, which the framework
sets on a driver job, and `CLAUDECODE` -- so a Copilot or Codex AI answering
from its own CLI read as a person, and a forced cancel by one succeeded. A
beta session on the operator's work computer ended that way.

## The readings

| engine | version | how it was read | names its shell carries that a person's shell does not |
| --- | --- | --- | --- |
| Claude Code | 2.1.278 | `env` from the session's own Bash tool | `CLAUDECODE` (`1`), `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_EXECPATH`, `CLAUDE_PID`, `AI_AGENT` (`claude-code_2-1-277_agent`) and other `CLAUDE_CODE_*` names |
| GitHub Copilot CLI | 1.0.86 | `copilot -p` asked to run `(Get-ChildItem Env:).Name -join ','` with its shell tool and return the raw output (6.15 AI credits) | `COPILOT_CLI`, `COPILOT_AGENT_SESSION_ID`, `COPILOT_CLI_BINARY_VERSION`, `COPILOT_CLI_RESOLVED_DIST_DIR` |
| Codex | not installed on this machine | not measured | unknown |

Two cautions the readings carry:

- **A prefix is not a marker.** This machine's own user environment holds
  `COPILOT_OTEL_FILE_EXPORTER_PATH`, which a person set and every shell
  inherits. Matching `COPILOT_*` would call the operator an engine.
- **The Copilot reading was taken from inside a Claude Code session**, so its
  shell also carried every `CLAUDE*` name by inheritance. The four `COPILOT_*`
  names above are the ones absent from the Claude Code shell that launched
  it.

## What `callerIsEngine` reads

- `DABBLER_DRIVEN` -- a driver job, set by the framework (`jobs.ts`).
- `CLAUDECODE` -- Claude Code.
- `COPILOT_CLI` and `COPILOT_AGENT_SESSION_ID` -- GitHub Copilot CLI. Two
  names, either sufficient, because a vendor renames one more readily than
  both.
- `DABBLER_ENGINE_TERMINAL` -- the framework's own.

## Why the framework has a marker of its own

A vendor's marker is a reading, true for the version it was read from, and an
engine nobody measured has none at all -- Codex here. The extension opens the
terminal the AI's CLI runs in, and a terminal's environment is inherited by
everything started inside it. So the extension sets
`DABBLER_ENGINE_TERMINAL=1` on that terminal and on no other: whatever engine
runs there, and whatever it renames its own variables to next month, a
command it spawns says where it came from. The framework's loop terminal and
a person's own terminals do not carry it, and the extension's in-process
calls -- a person's clicks -- never pass through a shell at all.

**The framework sets it too, on every engine it starts itself.** `session
drive` and `session run` without `--mailbox` spawn the engine's CLI
(`spawnOrFail`, `engines.ts`), and the child's environment carries the same
marker. So an engine the framework launched -- Codex included -- is told from
a person inside the editor and out of it, with no vendor variable involved.

## The last case: a person is found by what is there

One case is left after that: a person who launches an engine BY HAND, in
their own terminal, outside the editor, to answer a mailbox loop. Nothing of
the framework's is between that person and their shell, so nothing of the
framework's can mark it, and an engine with no measured marker -- Codex
today -- read there as a person, because nothing said it was not one.
Verification raised exactly this three times. A convention ("remember to
set the variable") was not an answer, and neither was refusing such a shell
the waiter: an engine that cannot take part in a session can still type a
verb.

A list of markers asks what is ABSENT, and an absence cannot cover an engine
nobody has measured. So the verbs that are a person's -- `session cancel
--force`, `session close --force`, `session hold-release` -- ask what is
THERE instead (`personIsPresent`, `session.ts`):

- **a click**: the extension's in-process call, which passes through no
  shell, behind a button and a confirmation; or
- **an interactive terminal**, with no engine marker in it.

An AI's tool runs its commands with no terminal at all. Measured in this
session's own Claude Code shell, 2026-09-20: `process.stdin.isTTY` and
`process.stdout.isTTY` are both `undefined`. That is a property of how a
tool spawns a command and not of any vendor's naming, which is why it
reaches the engine nobody measured. The markers stay, and are read first:
they make a known engine an engine even where its tool does give it a
terminal, and they are what `engines.ts` and the extension set.

What it costs a person: a forced cancel, a forced close or a held release
typed into a shell that is not interactive -- a script, a pipe, or a bare
mintty window, where Node sees no console -- is refused, and the refusal says
where a person does it: the Work Explorer, or an interactive terminal of
their own (the editor's, PowerShell, cmd). Nothing automated in this
repository force-ends a session through the command line; the tests call
the functions.

What this is not is authentication. A command line cannot prove who typed
it: an engine nobody has measured, launched by hand outside the editor,
whose tool ALSO gives its commands a real terminal, would still read as a
person, and so would a process that deliberately forges one. It stops an AI
acting on a sentence it misread -- which is what happened -- and not an
adversary. The guidance says, as well as the guard enforces, that ending a
session by force is never the engine's, and the cancel a stop prints is
worded as the operator's and offered on no stop that is the engine's to
clear. When Codex's own variables are measured they join `ENGINE_MARKERS`.
