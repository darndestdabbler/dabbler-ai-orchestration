# Set 122 Session 2 — remediation, round 1

Both findings from the discovery round were **accepted and fixed**. Both
attacked the same promise, which is the one the operator actually asked for
on 2026-08-11: *"echoed… so developers know what commands are being
executed"* — a line you can select, paste, and get the same result from.
Neither was a style objection; each broke that promise in a different way,
and each is now pinned by a falsifier that a mutation probe confirms can
fail.

`src/test/suite/routerCli.test.ts` is new (12 tests).

---

## Finding 1 (Major) — the echoed command was not shell-correct

> On Windows, a workspace/interpreter path containing spaces is common.
> `buildCommandLine()` emits a quoted executable path, but in PowerShell a
> quoted command path must be invoked with `&`; arguments containing `"`,
> `$`, or backticks are also not escaped for PowerShell.

**Accepted.** The finding is exactly right, and it was worse than stated.

The original quoting escaped embedded quotes as `\"`, which is the POSIX
habit and wrong for PowerShell twice over:

1. PowerShell does not treat `\` as an escape character inside double
   quotes — the escape character is the **backtick**. So `\"` did not
   escape anything.
2. Windows paths end in a backslash routinely, so `"C:\some dir\"` would
   have swallowed its own closing quote and produced an unterminated
   string.

And the leading-quote problem the finding names is the more likely one to
bite: PowerShell parses a leading quoted token as a **string expression**,
not a command, so pasting `"C:\Users\Some One\repo\.venv\Scripts\python.exe"
-m ai_router.modules` echoes the path and runs nothing at all. A silent
no-op is a worse outcome than an error.

**Fix** (`src/utils/routerCli.ts`):

- `quoteForDisplay` now escapes `"`, `` ` `` and `$` with a backtick, and
  never touches backslashes. Its trigger set also widened to the characters
  PowerShell actually treats specially (`{}`, `[]`, `@`, `#`).
- `buildCommandLine` prefixes the call operator `& ` **when, and only when,
  the interpreter token ended up quoted**. `& python -m …` would be valid
  but noisy, and the operator asked for a line a developer can read.

PowerShell is the stated target because it is what the extension's docs,
its scaffold and this repo all use on Windows, and because it is the
strictest of the plausible targets — the produced line is also readable
under `cmd.exe` and POSIX shells.

**Falsifier:** *"a quoted interpreter path is prefixed with PowerShell's
call operator"* and *"quoting escapes PowerShell's specials with a BACKTICK,
never a backslash"* (which pins the trailing-backslash case explicitly).
Mutation probe: dropping the `&` fails 1 test; reverting to backslash
escaping fails 2.

## Finding 2 (Major) — the visible line carried a `> ` prompt glyph

> Every router-backed command writes the only visible command line as
> `> <python> -m …`; a developer copying what the output channel shows gets
> a leading shell redirection token, not the command that was spawned.

**Accepted, without reservation.** The glyph was there to make the command
scannable in a log of mixed output, and it defeated the single reason the
line exists. On PowerShell `>` is redirection, so the pasted text would not
merely fail — it could **truncate a file** named by the next token. That is
a data-loss shape, not a cosmetic one.

**Fix:** the command now occupies a line of its own, bare — no glyph, no
indent, nothing else on it. The label moved to the line above
(`[10:14:22] Running:`), where it costs nothing and still gives the log its
scannable structure.

**Falsifier:** *"the command occupies a bare line of its own, with no prompt
glyph"* asserts both halves — that some line equals `commandLine` exactly,
and that **no** echoed line starts with a prompt-like glyph, so the defect
cannot come back wearing `$ ` or `# ` instead. Paired with *"the echo
happens even when the interpreter cannot be found"*, because the case a
developer most needs the command is the case where it did not run.
Mutation probe: restoring the `> ` prefix fails 2 tests.

---

## Also added while here (not findings)

The round's acceptance criteria asked for a launcher test asserting the
echo. Writing it made two neighbouring gaps obvious, and both are now
covered:

- **"the displayed line and the spawned argv carry the SAME values"** —
  the two are built from one input, but *built from one input* is not the
  claim that matters. The test strips the display quoting back off and
  compares token-for-token against `buildArgv`, so a future change to
  either side that breaks the correspondence fails.
- **"a non-zero exit can never classify as ok"** — swept across exit codes
  `1, 2, 3, 4, 5, 127, null`. This is the one classification mistake that
  would silently discard a refusal and report success for a call that wrote
  nothing.

## Suite state after remediation

`npx tsc --noEmit` clean; `routerCli.test.ts` 12/12; the full Layer 2 and
Layer 3 runs of record follow at Step 6, per policy A2.
