# S2 remediation — round 5 (remediation-review cycle 2)

Round 5 rejected two of my fixes (L2, L6) and returned two Majors. **Both
accepted without qualification. Both were right, and the second is the one that
matters.**

| Finding | Verdict |
| --- | --- |
| The untagged-YAML detector fails open on ordinary **commented** YAML | **Fixed** |
| The platform-pair check uses **sets**, so it cannot see the very regression it was written for | **Fixed** |

## 1 — commented YAML walked straight through

`_untagged_yaml_blocks` required *every* non-blank line to match either the
`key:` pattern or the list-item pattern. A `# Choose one provider.` line matches
neither, so `all(...)` went false and the block was accepted. Since a real
configuration block copied from anywhere almost always carries comments, the
check was weakest against exactly the input it exists to catch.

**Fix:** comment lines and document markers (`---`, `...`) are now treated as
YAML *furniture* and skipped when classifying. Three tests: a commented mapping
with a list, a block behind a `---` marker, and a negative test that a fence of
pure comments does not become a YAML violation on its own.

## 2 — the platform-pair check could not catch this session's own defect

This is the second time I have claimed this check closes the Windows-only
regression and been wrong, and the reasoning in round 5 is exact:

> `_interpreter_invocations` returns `set[str]` values. Both the initial and
> final test commands have the same arguments, `-m unittest`; therefore deleting
> the final POSIX occurrence leaves `"-m unittest"` present in both sets and
> produces no violation. The new tests remove `main.py`, which appears only
> once, and do not exercise the duplicated test invocation that exposes the
> flaw.

Every clause is true. `-m unittest` is shown **twice** — once before the AI's
change and once after — so removing section 4's POSIX line, which is *precisely*
the defect round 1 found in this tutorial, left the argument string present via
section 2 and the gate reported green. My tests deleted `main.py`, which occurs
once, so they passed while proving nothing about the real failure mode.

**Fix:** `Counter` instead of `set`. The contract is now multiplicity — N
Windows occurrences require N POSIX occurrences — and the violation text names
both counts. The regression test round 5 asked for is written exactly as
specified: it asserts the fixture shows the pair twice, deletes **only the
second** POSIX occurrence with `rpartition`, and requires the gate to fire.

The fixture itself was the deeper problem: it showed the test command once per
platform, while the real tutorial shows it twice. A synthetic fixture simpler
than the artifact it stands for cannot falsify a defect that only exists in the
real shape. The fixture now mirrors the document.

## The honest summary of this gate's history

Three rounds have now found a way past it, and the pattern is consistent: **each
version was strong against the defect I had just seen and weak against the next
one.** The allowlist of git subcommands, the labelled-only YAML check, the
set-based platform comparison — each looked complete when written and each had a
neighbouring case it could not see.

What actually moved it forward was never my own review; it was a verifier
reading the implementation against the claim rather than believing the claim.
Round 3's sidecar said the round-1 gate finding was "accepted in full" when it
was not, and both round 4 and round 5 caught the gap that overstatement hid.
The claim in `s2-conventions.md` that the gate "machine-enforces" the first-run
constraint is the sentence that repeatedly needed earning. It is closer to
earned now — **77 tests, up from 34** — and it should still be read as a claim
about the defects someone has attempted, not about the whole space.

## Bound status

This was **remediation-review cycle 2 of 2**. Per the constitution the loop is
now at its bound and this session will not open another discretionary round.
The fixes above go to `close_session`, whose Set 084 backstop verifies
independently. If that backstop finds a further material Critical/Major, the
session stops to the operator for adjudication rather than grinding.

## Gates

`tutorial_gate.py` exit 0; `drift_guard.py` exit 0; `test_tutorial_gate.py`
**77 passed**. Full suite re-run and recorded in the disposition.
