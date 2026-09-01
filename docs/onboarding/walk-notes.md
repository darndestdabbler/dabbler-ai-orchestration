# The walk behind the deck's two terminal screenshots

What was run, what the pictures show, and the verdict on the terminal
placement session 62 repaired at its remediation cap and closed unreviewed.

Walked 2026-08-31 on Windows 11, VS Code 1.135.0, the extension at 2.7.0
loaded from source (`--extensionDevelopmentPath`), the router built from
this tree, Claude Code 2.1.252 as the engine.

## What was run

The scratch repository is `C:\temp\s64-walk` — never this one. It was
staged by hand once and is kept, so the shots can be retaken:

```
git init                                  (in C:\temp\s64-walk)
dabbler bootstrap --project-dir . --no-transport-detect
```

`--no-transport-detect` matters: bootstrap otherwise persists
`DABBLER_TRANSPORT` in the operator's own environment, and a walk must not
change the machine it is walking on. Then a `testing.suites` entry was
added to `dabbler.yaml` (one suite, `node tests/run.mjs`), a two-session
plan replaced the scaffolded one, `src/widget.mjs` plus
`tests/{run.mjs,test_widget.mjs}` were written — one function, one test,
one runner — and a `.claude/settings.json` allows the engine's tools, the
way a person settles that once in a repository they own. All of it
committed, because a session's declaration is refused while the
repository it describes is dirty.

Then, from this repository:

```
npm run build
npm run compile -w dabbler-ai-orchestration
node docs/onboarding/capture-walk.mjs
```

The build first is not ceremony: session 63 changed the driver, and a
stale `dist/` would have been a walk of last week's framework.

**Run it from PowerShell, not Git Bash.** The launched editor inherits the
parent's `PATH`, and Git Bash's does not carry `C:\Users\<you>\.local\bin`
— so the engine's CLI is not found, and Start opens a terminal that dies
with "The terminal process … terminated with exit code: 1". That cost an
hour; it is in the script's header now.

## The pictures

**`media/terminals.png`** — one window, two terminals, the Explorer beside
them, and **the engine driving**.

- Left: the CLI **Start** opened — Claude Code, launched at the repository
  root with the opening sentence already in its argv, working the session
  it was handed. On screen: *"Plan accepted. Step add-greet is in hand —
  adding the function now,"* the `Update(src\widget.mjs)` diff it wrote,
  *"Ran 2 shell commands,"* and its own status line, `accept edits on
  (shift+tab to cycle) · esc to interrupt`. The Esc that interrupts is the
  CLI's, not the framework's.
- Right: the **Dabbler** terminal, split beside it, carrying the
  framework's own lines with the band behind them —
  `phase session=001 phase=plan`, `waiting`, `phase=steps`,
  `phase=preverify`, `phase=verify`,
  `job-started name=verification log=.dabbler/runs/s1/driver/jobs/verification.log`,
  `working` — and then that job's own output with no band. Two surfaces,
  one session: the chat on the left, the framework on the right, and not a
  line of one in the other.
- Left pane: `s64-walk 0/2 · session 001 in flight`, the liveness row
  reading *working*, and the in-flight session under **In Progress**.

**`media/stop.png`** — the same repository after
`dabbler session interrupt --stop`, in a window opening on it fresh.

- The toast: *"Session 001 stopped (interrupted) in phase 'verify'. Run it
  again, or cancel it?"* with **Run `next` again** offered as the
  recommended answer, **Other…**, and **Later**.
- The attention row above the buckets, carrying the same sentence.
- The activity-bar badge, at 1.

## Who typed what

**Two keystrokes are the operator's; everything else is the engine's.**
`capture-walk.mjs` answers the two questions the CLI asks its *person* and
nothing after them:

1. *Do you trust this folder?* — asked the first time a CLI opens in one.
   Its default is **No, exit**, which is why a blind Enter kills the
   terminal instead of starting a session. Down, then Enter.
2. *This command requires approval* — the engine's first move is `dabbler
   session next`, and running a command is a question. Option 2, *Yes, and
   don't ask again for `dabbler session *`*, which is what a person picks
   in a repository they own rather than answering it at every step.

After those, the engine registered the session, wrote the work plan, did
the step, reported it, and the framework ran the affected tests and opened
a verification round — all of it in the CLI on the left of the picture.

This is the second cut of these shots. The first was **staged**: the
script made the `session next` calls itself while the CLI sat idle at its
trust prompt. Every part of that picture was true and the whole of it was
not — it showed a script driving beside an engine, which is not the
lifecycle anyone will meet. Verification round 1 called it out as blocking
and was right to.

The scratch repository carries a `.claude/settings.json` allowing the
engine's tools, which is what a person does once in a repository they own.
Without it the engine stops at every tool call and the session never
starts.

The stop is photographed in a **second window** for two reasons that are
worth knowing: `interrupt` only *queues* the request — the next call
through the loop is what lands `stop` on `run.json` — and the toast is
raised for a decision the window has not seen before, so a window that has
already announced this repository's decisions announces nothing when it is
reopened.

## Terminal placement — the session 62 repair

Three Starts in the one window. The terminal tab list after each, read
straight off the workbench (`┌` and `└` mark a split pair):

| After    | Terminals                                                            |
| -------- | -------------------------------------------------------------------- |
| Start #1 | `┌ Claude Code`, `└ Dabbler — s64-walk`                               |
| Start #2 | `Claude Code`, `┌ Claude Code`, `└ Dabbler — s64-walk`                |
| Start #3 | `Claude Code`, `Claude Code`, `┌ Claude Code`, `└ Dabbler — s64-walk` |

Each Start creates a new CLI terminal. There is never a second Dabbler
terminal: the one that exists is reused, and it is re-split so that it
sits beside the CLI the newest Start created. The earlier CLIs drop out of
the split and stand alone, which is right — they are finished terminals,
and the framework's terminal belongs next to the session someone is
actually starting.

Verdict: the repair holds. Across three Starts in one window the cached
Dabbler terminal moved beside each newly created CLI, exactly one Dabbler
terminal was ever created, and no Start left it stranded beside a terminal
the person had moved on from. That is what session 62 landed at its
remediation cap without a review; this is the review, and it stands.

## Three things the walk found, none of them defects in the repair

1. **Start Session works from the repository row's context menu and
   nowhere else.** The command takes the repository node as its argument
   and returns silently without one, so invoking it from the command
   palette does nothing at all — no terminal, no message. A person who
   reaches for the palette first concludes the extension is broken.
2. **Start asks for a model after it asks for an engine**, and that box is
   optional to *answer*, not optional to *dismiss*. A Start left waiting
   on it opens no terminal.
3. **Under `session next`, the affected tests' output does not reach the
   Dabbler terminal.** The framework runs them in the caller's own
   process, so the runner's colours land in the engine's CLI; the Dabbler
   terminal carries the phase lines and the output of work run as a *job*
   — the verification round, and the complete suite. The deck's slide says
   what the picture shows and does not promise otherwise.

None of the three is a stop, and none of them is this session's to fix:
they are noted here so that the session that does fix them has the
evidence, and so the slides do not describe a window that behaves
differently.
