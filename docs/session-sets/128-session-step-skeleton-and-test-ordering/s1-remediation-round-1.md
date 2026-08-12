# Remediation — Set 128, Session 1, Round 1 (discovery, 2-lens fan-out)

Three Major findings, all accepted, all fixed. None re-opened a ratified
decision; every one was a gap between what the shape check was *supposed*
to refuse and what its recognisers actually matched.

## Finding 1 — `full suites` (plural) defeated the compression rule

**Accepted.** `_INTENT_RE[FULL_SUITE]`'s first pattern ended in
`\bsuite\b`, and the `\b` after `suite` fails on `suites`. So a tail step
reading *"Run the full suites, then cross-provider verification"* named
only VERIFICATION to the checker, no second tail intent was seen, and the
exact compression this set exists to refuse passed.

The finding's own evidence is the sharpest part of it: **this set's spec
describes the malformation as "full suites; verify; close"** — the plural
is the wording the source-of-record note uses, and the recogniser could
not see it.

**Fix:** `\bsuites?\b` and `\bfull\s+(?:pytest|playwright|tests?)\b`.

## Finding 2 — `all tests` was not a full suite

**Accepted.** *"Run all tests, then verify with a different provider"* is
ordinary engine prose for the same obligation and matched nothing.

**Fix:** three more patterns — `all (the) test(s)`, `every test|suite`,
`whole|entire (test) suite(s)`. Together with finding 1 these are one
class: the recogniser was written from the canonical phrasings rather
than from the phrasings an author would actually reach for, which is the
opposite of the "recognise by intent, not by prose" rule it claims.

## Finding 3 — a status alias could block a set that had finished

**Accepted, and it is a duplicate-notion defect (L-069-1).**
`resolve_set_status` compared the raw `status` string against a private
frozenset. This repo already canonicalizes `done` / `completed` to
`complete` on read (`progress.canonicalize_status`, with a comment saying
hand-written past-participle tokens are drift that has happened before).
A set whose state file carried one would have read as *never started* and
been told to restructure a spec whose sessions are closed — precisely the
outcome the operator's ratification excludes.

**Fix:** `resolve_set_status` now passes the status through
`progress.canonicalize_status`, with the same import-fallback shape the
module already uses for `load_config`. One canonicalizer, used
everywhere.

## Falsifiers added

| test | direction |
|---|---|
| `test_the_full_suite_intent_is_not_defeated_by_ordinary_wording` (5 cases) | FIRES — plural, "all tests", "every test", "whole suite", "entire test suite" |
| `test_a_past_participle_status_alias_still_reads_as_started` (2 cases) | DOES NOT FIRE — `completed` / `done` read as `complete` |

The structural assertion still holds: this set's own three sessions have
zero shape findings, and the corpus sweep is unchanged at 4 unstarted
specs requiring restructuring.

## Acceptance harness — finding 3's criterion is itself broken

`s1-acceptance-round-1.json` records finding 3 as `still-failing`. It is
not. The verifier's criterion is a `python -c "exec('...')"` one-liner
whose inner string is not terminated, so it raises

```
File "<string>", line 12
    (root / "spec.md").write_text("# X
SyntaxError: unterminated string literal (detected at line 12)
```

**identically on the pre-fix and the post-fix tree** — same exit code 1,
same 1731 output characters. A criterion that fails the same way before
and after discriminates nothing, so it can neither auto-close a finding
nor refute a fix. (Finding 1's criterion is `JUDGMENT` by declaration and
was never executable either; finding 2's ran and auto-closed.)

The criterion's **intent** is unambiguous, and it is satisfied. An
intent-equivalent script — same fixture spec, same
`status: "completed"` state file, same `result.set_started and
result.passed` assertion, written so it parses — was run against the
fixed tree and against a targeted mutation that restores the raw-status
read:

| tree | `completed` | `done` | exit |
|---|---|---|---|
| fixed | `set_started=True`, `passed=True`, `restructuring_required=0` | same | **0** |
| mutated (raw status, i.e. the defect) | `set_started=False`, `passed=False`, `restructuring_required=1` | same | **1** |

That is the discrimination the harness was trying to make. The mutation
was reverted and the file carries no probe residue; the permanent
regression guard is
`test_a_past_participle_status_alias_still_reads_as_started`, which
asserts the same thing on both aliases inside the suite.
