# What the terminal says now, watched rather than asserted

Session 140 changed what an operator sees and nothing an assertion can
fully judge. This is the walk: the extension built from this tree at
**2.0.20**, installed, and the shipped renderer drawing a real driven
session and this repository's own live record. Walked 2026-09-09 on
Windows 11, Node 22, the router built from this tree.

The VSIX was built with `npm run package` in
`tools/dabbler-ai-orchestration` and installed with

```
code --install-extension tools/dabbler-ai-orchestration/dabbler-ai-orchestration-2.0.20.vsix --force
```

`--force` matters: a same-version republish otherwise leaves the old
install in place. `~/.vscode/extensions/` afterwards held
`darndestdabbler.dabbler-ai-orchestration-2.0.20`, and the bundle inside it
carries `saidSeq`, `firstSentence` and `bannered` — the three symbols the
step line and the banner are built from, and the three the previously
installed build did not have at all.

## Why nobody had seen the step line

The line was not broken. **No installed build had ever contained it.**
`version.json` moved to 2.0.14 at 08:45 on 2026-09-08 and the 2.0.14 VSIX
was built three minutes earlier; session 126, which wrote the step line,
committed at 14:27 the same day and did not bump. One number named two
different extensions six hours apart, the installed one was the earlier,
and no VSIX was built in this tree between then and this session. Every
session from 126 to 136 declared itself not releasable, and 137 to 139
shipped nothing this machine installed. See D270.

The read-once-drop-silently defect fixed alongside is real and was not the
cause: the seq was marked as said before the instruction was read, so a
first look that came back absent or half-written dropped the line for good.

## A real driven session

A scratch repository, the built router spawned as a shell spawns it, and
`DabblerTerminal` polled between calls the way its own interval polls it.
Verbatim, with the colour taken out:

```
──────────────────────────────────────── framework ────────────────────────────────────────
13:29:00 terminal-opened repository=walk140-y4FhxL

═══════════════════════════════════════════════════════════════════════════════════════════
                                        SESSION 001
═══════════════════════════════════════════════════════════════════════════════════════════
13:29:01 global scope=the whole repository, no wall
13:29:01 phase session=001 now=plan
13:29:01 step id=plan ask=Plan session 001 of this repository.
13:29:01 waiting
13:29:03 phase now=work
13:29:03 step id=return-two ask=Change what widget() returns.
13:29:06 step id=say-so ask=Say so in the README.
13:29:07 rejected id=say-so reason=[files-changed-unchanged] files_changed names
         'README.md', which the tree did not change since the last accepted step
```

The calls that produced it, in order: `session start`, then `next`,
`report --answer-file`, `next`, `report --step return-two`, `next`,
`report --step say-so` (naming a file the tree had not moved), `next`.

Three things to read there. **The phase says `work`** — the operator's word
and the record's word, which the terminal prints straight. **Every
instruction announces itself**, with its step id and the first sentence of
its ask, so the stretch between two phase lines is no longer silent.
**A refusal says why**, with its first reason, so a rejection is not an
unexplained pause.

The first sentence is genuinely the first sentence: `Change what widget()
returns.` is cut at the full stop and `Nothing else moves.` is not shown.
An ask long enough to wrap takes the hanging indent, as the rejection above
does.

## This repository's own record, at the moment of the walk

```
──────────────────────────────────────── framework ────────────────────────────────────────
13:29:33 terminal-opened repository=dabbler-ai-orchestration

═══════════════════════════════════════════════════════════════════════════════════════════
                                        SESSION 140
═══════════════════════════════════════════════════════════════════════════════════════════
13:29:33 global scope=the whole repository, no wall
13:29:33 phase session=140 now=steps
13:29:33 step id=terminal-walk ask=Build the VSIX from this tree, install it, and watch one
         real session's steps through the real terminal, then write down what was seen.
13:29:33 waiting
```

**`now=steps`, and that is right.** This run entered its work phase before
the phase gained its new name, and a phase only moves forward: nothing
rewrites a record that already exists, and every reader takes the old name.
So session 140's own run says `steps` to the end, session 141's will say
`work`, and both open. This is the compatibility rule being watched rather
than argued about — the one thing in this session a test could assert and
only a walk could show happening.

## The headings

`divider` and `banner` are now one family. A plain transcript cannot show
it, so the bytes: the voice rule's line and its label both carry
`ESC[38;2;56;116;219m`, the milestone blue, where the line used to be
`38;2;140;140;140` and the label had no colour at all.

```
"[38;2;56;116;219m────────[0m [1m[38;2;56;116;219mframework[0m ..."
```

## Nothing read wrong

The rename reads correctly on a screen as well as in a test, the step lines
arrive one per instruction, the refusal explains itself, and the two
heading weights read as one family at two scales. Nothing in this walk had
to be worked around and nothing is being reported as still broken.

One thing the walk did not exercise, and says so rather than implying
otherwise: it stops before the verification round, so the phase lines for
`verify`, `run-of-record`, `land` and `close` are not quoted here. Those
are the same one line per phase change that this terminal has always drawn,
and this session did not touch them.
