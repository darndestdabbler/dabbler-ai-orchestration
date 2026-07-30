# S2 remediation — round 4 (close backstop)

`close_session` ran its own in-process verification round (Set 084) against the
**pushed** diff and failed the `verification_backstop` gate with one Major:
*"The tutorial-fidelity gate remains materially fail-open despite claiming the
earlier gate defect was fully fixed."*

**Accepted on four of its five points; the fifth re-raises a settled
adjudication and is held.** The finding is uncomfortable and correct: round 3's
sidecar said the round-1 gate finding was "accepted in full", and it was not —
that finding explicitly asked for validated shell commands and a starter line
bound in *both* tutorials, and I delivered neither while writing that it was
done. The gate was better than it had been and worse than I claimed.

The single most damning specific: **the gate would not have caught this
session's own Windows-only step 4.** The defect round 1 found in the tutorial
was invisible to the tool built in the same session to prevent that class.

## Accepted and fixed

| # | Gap | Fix |
| --- | --- | --- |
| 1 | Nothing validated the interpreter commands, so a dropped or typo'd platform alternative stayed green — the exact defect round 1 found. | New **`platform-pairs`** check: every argument list shown for `.venv\Scripts\python.exe` must also be shown for `.venv/bin/python`, and vice versa. Compares **arguments**, not whole lines, so rewording the surrounding prose cannot break it and a typo cannot pass it. |
| 2 | `check_bundle_test_count` required ≥1 `Ran N tests` plus `FAILED` plus `OK`. Deleting one of the two tally blocks still passed — the endpoints *looked* covered while the reader had nothing to compare against. | Both tally blocks now required (`len(found) < 2` is a violation). |
| 3 | `_STARTER_LINE_TEMPLATE` was hard-coded and never checked against `buildSampleStarterLine`. Hard-coding it only moved the drift up a level: if the product reworded the line, the gate would keep enforcing the old form and report green. | The template is now pinned to the shipped source; a reworded `buildSampleStarterLine` fails the gate and names both tutorials as needing the update. |
| 4 | The starter line was pinned in `hello-world.md` only. Round 3's adjudication *named* this residual — "pinned only by the command-title check" — which round 4 rightly points out is not the same as closing it. | `adopt-dabbler.md` is now pinned on the **prefix** (`Start the next session of`), since its slugs are the reader's own rather than the sample's. |

Four new falsification tests, including two that assert the gate fires on
exactly this session's own defect (`test_windows_only_command_is_flagged`,
`test_mistyped_platform_alternative_is_flagged`). The suite went 67 → **73**.

## Held, with the reason

**"The duplicate procedure remains concrete in both documents, despite the
required end state of 'zero duplicated procedure.'"**

This is the finding adjudicated in
`s2-duplicate-procedure-adjudication.md` and listed as settled in
`s2-conventions.md`. The constitution is explicit that a settled point does not
reopen under fresh wording, and no new argument accompanies it here. The
reasons stand:

1. The two passages do different work — `hello-world.md` teaches *what a session
   is*; `adopt-dabbler.md` adds the **scope line** and the CLI as the paste
   target, neither of which belongs in a 15-minute first run.
2. The proposed fix (remove the procedure from `adopt-dabbler.md` in favour of a
   link) would strand a reader entering at adoption, which is a real entry
   point.
3. The spec relocates `adopt-dabbler.md` **"unchanged in substance"**. Removing
   a step's procedure is a substance change this session is not authorised to
   make.

What the finding is right about is the **drift risk**, and that half is now
closed by fix #4 above: the two documents are enforced against the same
canonical source. That is the part a gate can honestly do; deciding whether the
adoption tutorial should teach the mechanic at all is a documentation-structure
question for Step 9, and it is recorded there alongside the concept-ownership
table correction.

## Gates after remediation

`tutorial_gate.py` exit 0, `drift_guard.py` exit 0, `test_tutorial_gate.py`
73 passed. Full suite re-run and recorded in the disposition.
