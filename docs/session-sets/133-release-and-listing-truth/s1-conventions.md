# Round conventions — Set 133 Session 1

Read this before the work. It states the agreed baseline so the round
spends its findings on real defects rather than on things already settled.

## What this session is

The release set for **`dabbler-ai-router 1.0.0`** and **extension
`0.51.0`**. Both artifacts have been staged and operator-gated since
2026-08-09/10. This set does not decide whether to publish — the operator
has. It makes the thing being published **describe itself truthfully**.

**No session may push a tag.** The operator tags after this session
closes, pushes, and CI goes green. Nothing here publishes anything.

## Release contract

- `pyproject.toml` version is `1.0.0`; `package.json` version is
  `0.51.0`. **Neither is bumped by this session** — both were set
  earlier and are correct.
- `1.0.0` is **breaking**: a spec declaring `tier: lightweight` fails to
  load. The remedy shipped here is **documentation, not detection**, on
  purpose (it reaches every consumer of a public package; a sweep of
  known checkouts cannot).
- Consumer repositories are **not swept**, and that is not a gap to
  close. The extension is used by government employees and accessing
  their repositories is prohibited. This is a legal constraint, not a
  scheduling one. Do not raise it as a finding.

## Suite baseline

- **No full suite has run yet, deliberately** (test-run policy A2: no
  full suite before a cross-provider stage, because a Step 7 remediation
  would invalidate it). The required portion — pytest, mocha, playwright,
  all three matched by `run_of_record affected` — runs after this round,
  before close.
- Targeted run of the directly affected module at the time of writing:
  `ai_router/tests/test_changelog_partition.py` — **48 passed, 1
  xfailed**. The xfail is deliberate and described below.

## By-design exclusions — settled, do not re-litigate

1. **No product code change.** The spec's Non-goals forbid it: *"a
   release set that starts changing code invalidates the very artifact it
   is describing."* A code finding outside the five release artifacts is
   recorded as a residual with a named owner, not fixed here. The diff
   contains **no `ai_router/` runtime change** — only `CHANGELOG.md`,
   `changelog.d/` (folded away), two READMEs, `package.json` metadata,
   and one test module.

2. **The `check()` post-fold gap is a KNOWN, JOURNALED residual.**
   `ai_router.changelog.check()` returns `[]` from its empty-corpus
   branch as soon as `foldedAt` is stamped, without comparing the
   `originalSha256` that `fold` recorded for the whole document — so
   between a release and the next contribution the round-trip guard
   verifies nothing. This session **found** that defect (by running
   `fold` on the live repo for the first time), **pinned** it with a
   `xfail(strict=True)` falsifier, and **deliberately did not fix it**
   under exclusion 1. The operator ruled on it 2026-08-15; see
   `decisions.jsonl`. Re-reporting it as a finding is welcome as
   corroboration, but *"you should have fixed it"* is already adjudicated.

3. **The 30 deleted files under `changelog.d/` are not lost content.**
   `python -m ai_router.changelog fold` is the sanctioned release-time
   act: it writes the rendered view back into `CHANGELOG.md` and removes
   the fragments it folded. Every byte is in `CHANGELOG.md`. `changelog
   check --target all` passes.

4. **Two `## [1.0.0]` headings (and two `## [0.51.0]`) are intentional.**
   The second of each pair is the tranche that was staged earlier under
   the same version number; both are explicitly labelled as one release
   rather than two, following this repo's existing *"folded into"*
   precedent (`0.43.0`/`0.44.0` in `0.45.0`).

## The claims policy this listing is written to

This is the criterion the README rework must be judged against, and it
is the most useful thing to attack:

- **Claim auditability, never efficacy.** Supported and claimable: the
  verifier is chosen by excluding the orchestrator's own provider
  (resolved from the model id, not a self-reported label); a session
  blocks rather than passing when no different-provider verifier exists;
  a close with no cross-provider evidence runs the verification itself; a
  finding closes only when its criterion fails before the fix and passes
  after; rounds are bounded and only the operator may authorize another;
  full suites run before commit, push and close.
- **Not supported and not to be claimed:** any defect-catch rate, or
  "catches bugs before they ship". The framework has never measured what
  fraction of real defects it finds. **A finding that the listing claims
  efficacy anywhere is a real defect and should be raised.**
- **The candour register is load-bearing.** *"It is containment, not a
  sandbox, and the docs must not claim otherwise"* is kept on purpose. A
  marketing pass that sands it off is a regression, not an improvement.

## Severity rubric for this round

Grade by **consequence**: probability the stated failure scenario reaches
a real user × impact. Low probability **or** low impact is Minor. No
nameable failure scenario is a nit, not an Issue.

A false statement that a **user reads at install time** (the Marketplace
listing, the root README's prerequisites, the release notes' migration
instructions) is the highest-consequence class in this diff — that is the
entire point of the session. A stylistic preference about changelog
prose is a nit.
