# Set 116 Session 1 — remediation, round 1

Discovery (2 lenses, spec-conformance + failure-scenario) found 3 Major
findings, all Completeness. All three are accepted as correct; none is
disputed.

---

## I-116-S1-1 (Major, Completeness) — the e2e-command timing was never measured

**The finding is correct.** CONTRIBUTING.md's Layer 1 section shows
`python -m pytest -m e2e` and, right beneath it, cited only the
**full-suite** figure (~14 min serial / ~4 min parallel). A contributor
who runs the documented `-m e2e` command specifically still has no idea
what it costs — the exact gap the session existed to close, reproduced
in the fix itself.

**Fix.** Measured the actual command: `python -m pytest -m e2e` selects
8 tests. **113.69s serial (`-n 0`) / 63.47s parallel (`-n auto`)**,
2026-08-10. CONTRIBUTING.md now states this number directly under the
command, and keeps the full-suite figure as a separate, clearly
distinguished paragraph for "Running everything."

**Acceptance criterion** — *"Does CONTRIBUTING.md state a measured
timing for the documented `python -m pytest -m e2e` command, with a
reviewable measurement source, rather than substituting the full-suite
timing?"* — judgment-based; met by inspection of the edited
CONTRIBUTING.md (Layer 1 section now names the 8-test count and both
timings, dated, with the exact re-derivation command).

---

## I-116-S1-2 (Major, Completeness) — parity evidence wasn't proven on the tree under review

**The finding is correct, and sharper than it first reads.** The
original evidence cited `docs/test-suite-benchmark-DENICI.txt`, measured
at a **pre-session commit** (`9277e104`), while the session's own diff
(pytest.ini, pyproject.toml, run_of_record.py, verification_stamp.py)
was uncommitted. The benchmark's *substance* — does xdist change pytest
behavior — is unaffected by those files (none of them touch test
collection or execution), but the finding is right that citing a
different tree's numbers as proof for this tree is not durable,
independently-auditable evidence.

**Fix.** Recorded a **same-tree** serial/parallel pair after all of this
session's code changes (including this round's remediation): both runs
share the identical `surfaceDigest` in
[`test-runs.jsonl`](test-runs.jsonl) (`b5db7d2d776d...`) — cryptographic
proof, not a commit-hash claim, that they cover the same bytes.

- Serial (`-n 0`): 3,813 passed / 5 skipped in 647.01s (0:10:47)
- Parallel (`-n auto`): 3,813 passed / 5 skipped in 240.56s (0:04:00) —
  2.69x speedup, identical counts

CONTRIBUTING.md's "Running everything" section now cites this pair by
digest prefix and file path, alongside (not instead of) the original
DENICI benchmark, which remains the source for the slowest-25/collection
breakdown this session's own numbers don't re-derive.

**Acceptance criterion** — *"Checked-in evidence must show the serial
and parallel commands, durations, and complete passed/skipped results
from the same precisely identified tree, and the documentation must
cite that evidence."* — met by the two `test-runs.jsonl` rows (matching
`surfaceDigest`) and the CONTRIBUTING.md citation naming them.

---

## I-116-S1-3 (Major, Completeness) — `durationSeconds` was optional, so it would go on being absent

**The finding is correct.** `record_run()` and the `record` CLI both
defaulted `duration_seconds` to `None`. Every existing call site in the
codebase (tests aside) goes through the CLI per the documented workflow
(`session-constitution.md` Step 5, the authoring guide), so an optional
flag at that one real writer boundary reproduces exactly the "sometimes
there is no measurement" condition this session exists to fix.

**Fix.** `--duration-seconds` is now **required** on the `record` CLI
subcommand — omitting it is a usage error (`argparse` exit 2), not a
silently-incomplete record. The Python `record_run()` API keeps the
keyword optional, because its only direct callers outside the CLI are
gate-behavior tests (`test_set111_close_gates.py`) that are not
recording a real suite run and have nothing to measure. `test_run_of_record.py`
gained `test_record_requires_duration_seconds` asserting the CLI usage
error, and the freshness-gate CLI test
(`test_record_rejects_an_unknown_suite`) was updated to supply a
duration so it still reaches the suite-lookup logic it's actually
testing.

**Also fixed (round-1 nit, both fanout calls raised the same one
independently):** `duration_seconds <= 0` is `False` for `NaN` and does
not reject `+Infinity`, so both would have passed validation and then
produced non-standard `NaN`/`Infinity` tokens in `json.dumps()` output;
a `bool` (`True`/`False`) is an `int` subclass in Python and would have
silently recorded 1.0/0.0 seconds. `record_run()` now requires
`math.isfinite()` and rejects `bool` explicitly, on both the write path
and the read path (`read_records()` drops a non-finite or boolean
`durationSeconds` to `None` rather than propagating it).
`test_rejects_non_finite_or_boolean_durations` (parametrized: NaN, +inf,
-inf, `True`) covers the write path.

**Acceptance criterion** — *"Every newly written test-run record must
contain a finite positive `durationSeconds`, while reading legacy
records without the field remains backward-compatible."* — met by
`test_record_requires_duration_seconds` (CLI refuses to write without
it) and the existing `TestReadRecords` coverage (a record missing the
field, or carrying a non-numeric one, still reads back with
`duration_seconds=None` rather than raising).

---

## What was NOT changed, and why

- **`record_run()`'s Python-level default stays optional.** Making it
  required would break every test in this file that constructs a
  fixture run to test something else (freshness, gate behavior) and has
  no suite duration to report. The CLI — the actual orchestrator-facing
  writer boundary named in the constitution and the authoring guide — is
  where the requirement belongs, and that is where it now lives.
- **The pre-session DENICI benchmark file was not deleted or
  superseded.** It remains the only source for the collection-cost and
  slowest-25 breakdown; this round's same-tree pair is additional
  evidence for the parity claim specifically, not a replacement.
