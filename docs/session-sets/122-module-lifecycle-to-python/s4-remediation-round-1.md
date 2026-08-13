# Session 4 — remediation of round 1 (Set 122)

Round 1 (discovery, fan-out 2/2, both lenses) returned **VERIFIED with
zero blocking findings**, so no remediation was owed. Three **nits** were
raised across the two calls, and all three were real. They were fixed
rather than recorded-and-deferred, because each is cheap, each is
strictly responsive to the verifier's own text, and all three landed
before the run of record — so fixing them cost nothing except this note.

This round-1 review is therefore **delta-scoped**: it reviews the fix
hunks below, not the session again.

## Nit 1 — `add --target router` emitted a heading shape that does not exist

*Both calls raised this independently.*

> `ai_router.changelog add --target router --section Added` creates a
> `## Added` stub because the router target's fragment level is 2, while
> `docs/partitioned-append-files.md` says it creates `### Added`.

**Accepted, and it was worse than a doc mismatch.** `add_fragment` built
its stub as `"#" * fragment_heading_level + " " + section`, which is
correct for the extension (`### Added`) and produces `## Added` for the
router — a shape Keep a Changelog does not have, and one that `render`
would place where a *version* heading goes.

**Fix.** The stub now matches the target's own shape rather than deriving
a heading from a number: a level-2 target gets a whole
`## [Unreleased] — <title>` section with `### <Section>` nested under it,
a level-3 target gets the bare `### <Section>` block. `add` gained
`--title` for the headline, defaulting to the slug. The doc was corrected
to describe both shapes rather than only one.

**Falsifiers.** Four new tests: the level-2 stub is a whole Unreleased
section *and re-parses as exactly one level-2 block*; the level-3 stub is
a bare section and carries no `## [Unreleased]`; `--title` defaults to
the slug; and an added stub renders above released history without
disturbing it.

## Nit 2 — the CI gate could skip itself

*Raised by the failure-scenario lens.*

> `drift_guard.check_changelog_partition_round_trips()` silently returns
> clean on any `ai_router.changelog` import exception, so that fast gate
> can skip itself if the new module import breaks.

**Accepted, and graded higher than the verifier did.** This is the silent
fail-open branch `L-079-3` names: a gate that returns clean because its
own code failed to load is byte-for-byte indistinguishable from a gate
that passed. The verifier's mitigation ("pytest should still catch this")
is true but does not repair the gate, and the gate exists precisely to
answer fast, before the suite.

**Fix.** The import guard is no longer fail-open. A repo carrying **no**
`changelog.d/` partition (a consumer repo, or this one before this
session) still reports nothing — there is genuinely nothing to check. A
repo that **has** partitions and cannot import the module now reports a
violation naming the exception. The per-target loop also skips a target
whose fragments directory is absent, so the two conditions stay
independent.

**Falsifiers.** A planted `ai_router/changelog.py` that raises on import,
in a fake repo that has a `changelog.d/`, run in a subprocess so the
planted package wins the import: the gate must return exactly one
`changelog-round-trip` violation. Paired with the legitimate look-alike —
a repo with `ai_router/` and no partition — which must stay silent.

## Nit 3 — a test docstring named a wiring point that does not exist

> `test_set_number_collision.py` says refusal fires at "scaffold," but the
> wired product paths are `start_session` and `drift_guard`; the module
> lifecycle scaffolder intentionally does not call the refusal helper.

**Accepted.** The docstring was stale prose from the first implementation,
which *did* wire the scaffolder before that check was removed for being
one that could only ever pass. Prose that names a wiring point the code
does not have is the `L-064-8` class — it reads authoritative and is
wrong.

**Fix.** The module docstring now names the two real wiring points, says
explicitly that the scaffolder does not call the helper, and points at
the test that proves why it does not need to.

## Verification after the fixes

- `test_changelog_partition.py`: 48 passed (44 → 48).
- `test_drift_guard.py`: 49 passed (47 → 49).
- `python ai_router/scripts/drift_guard.py`: OK.
- `python -m ai_router.changelog check --target all`: round trip OK for
  both targets.
