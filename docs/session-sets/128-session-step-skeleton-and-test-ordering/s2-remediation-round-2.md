# Session 2, remediation — rounds 1 and 2

Both discovery passes are merged here and fixed once, per Step 7.

## Round 1, findings 1 and 2 (Major, duplicate) — A4.2 was only reported

Two independent discovery lenses raised the same defect, which is the
strongest possible signal: **the ratified decision was not implemented.**
The operator ratified "the close backstop consults the classifier … a
shipped-code delta runs the delta-scoped remediation-review phase
instead of an unphased full round", and the implementation shipped
`_a4_obligation_note`, which explicitly "Reports; never decides".

**The verifiers were right and my reasoning for the scope-back was
wrong.** I argued that reaching the backstop means A4.2 was skipped, so
a narrower round would be "bought on an assumption". That is false: the
baseline is *recorded*, not assumed — `worktreeTreeAtCompletion` is
written by every completed round, which is the change this same session
made. A delta-scoped review against a recorded baseline is exactly as
well-founded as the one `verify_session --phase remediation-review`
runs by hand. And the prose I wrote in the authoring guide asserted the
behaviour the code did not have, which is worse than either choice: a
reader would have believed A4.2 was mechanized.

**Fixed** in `close_backstop.py`:

- `_a4_obligation_note` → `_a4_phase_for_close`, which *decides*:
  it returns `(phase, fix_delta_baseline, note)` for a shipped-code
  delta with a recorded anchor, and `(None, None, None)` for everything
  else (test-only cannot reach it — that path settles earlier; an
  unclassifiable delta or a missing anchor falls back to the classic
  unphased round, which is the conservative direction).
- The phase is resolved in `decide_backstop` **before** the bound
  check, because a phased round is bounded by its own family. Getting
  this backwards would have been a silent bounds defect: the round
  would run as a remediation-review and be counted as a classic one.
- `run_close_backstop` assembles `assemble_fix_delta_evidence` against
  that baseline, carries `build_phase_framing(PHASE_REMEDIATION_REVIEW)`
  into the prompt, and records the ledger row with
  `phase="remediation-review"` instead of `None`.
- The authoring guide's claim was rewritten to describe what the code
  now does, arm by arm.

**Falsifier** (`test_close_backstop.py::TestA4PostRoundDelta`): plants a
post-round shipped-code fix, runs the real close, and asserts the round
is bought, its prompt carries `FIX DELTA ONLY` and the anchor sha, and
the ledger row records `phase: remediation-review`. Its sibling plants a
test-only fix and asserts **no** round is bought and an
`a4-test-only-exemption` row is written.

## Round 2, finding 1 (Major) — unchanged untracked files misclassified

A real bug, and the more valuable of the two findings because nothing in
the session's own use would have surfaced it.

`classify_delta` reused `verification_stamp.work_diff_binding_paths`,
whose path selection unions `git diff <base>` with **every** currently
untracked file. That is correct for its own purpose, where the base is a
commit and an untracked file is always new work. It is wrong against a
*tree snapshot* anchor, which already contains those untracked files: an
untracked file present at the round and never touched afterwards was
re-reported as a post-round change.

The consequence was precisely backwards: a session that creates a file
and leaves it untracked until the close-out commit — the common shape,
and the shape of this very session — would be denied A4.1 even when its
only post-suite fix was a test.

**Fixed** by making the delta a **tree-to-tree** diff, the same
mechanism `assemble_fix_delta_evidence` uses and the reason
`snapshot_worktree_tree` exists at all: the anchor tree against a fresh
snapshot of the current tree, with the freshness exclusions applied as
pathspecs. Untracked files are then captured symmetrically at both ends.

**Falsifiers** (`test_post_round_delta.py`), planted in both directions
so the fix cannot have been a blanket exemption for untracked files:

- an unchanged untracked shipped file captured in the anchor, plus a
  test-only edit → `test-only`;
- that same untracked shipped file *edited* after the anchor →
  `shipped-code`.

## Verification

`test_post_round_delta.py` 15 cases, `test_close_backstop.py` including
the two new A4 tests, plus `test_verification_stamp.py`,
`test_run_of_record.py`, `test_gate_checks.py`, `test_verify_session.py`,
`test_verification_integrity_gate.py` and `test_close_preflight.py`:
**443 passed**.
