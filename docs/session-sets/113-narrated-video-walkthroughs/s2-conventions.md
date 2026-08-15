# Round conventions — Set 113, Session 2

Read this before the work. It states the baseline, the release contract
and the by-design exclusions, so the round spends its findings on real
defects rather than on facts already settled (G-010).

## What this session is

Session 2 of 4: **Portable scenario source and standalone rendering.**
It authors the platform-neutral scenario model, quarantines
target-specific driver detail behind a seam, renders four documents from
that one source, and adds the test that fails if they can diverge. It
authors **exactly one** exemplary scenario.

Session 1 (VERIFIED, closed) replaced the binary `disposition.uat` with
a per-component accounting gated on a spec-declared `uatComponents`
inventory. Sessions 3 and 4 are not in this diff.

## Suite baseline

`python -m pytest -m "not e2e"` is the pre-commit run. The three new
test modules and the guards they interact with were run targeted and are
green: 176 passed, 1 xfailed (the xfail is pre-existing, in
`test_changelog_partition.py`). The full required run is recorded at
Step 8, after every code-changing stage — the repo's test-run policy
(A2) forbids a full run before a cross-provider stage.

## Release contract

Nothing is published by this session. The router changelog fragment
`ai_router/changelog.d/0011-set-113-s2-scenario-model.md` targets
`[Unreleased]`; the release boundary for Set 113 is at the end of the
set, and publishing is operator-gated in this repo. No version is
bumped here, deliberately.

## By-design exclusions — do NOT report these as defects

1. **No recorder, no driver, no video.** Session 2 builds neither. The
   `drivers:` block in the exemplar carries `status: proposed` and is
   consumed by nothing in this repo. Session 3 builds the first driver,
   against a **web fixture**, not against this exemplar's target. "The
   driver block is not wired up" is the stated scope, not a gap.
2. **`drivers:` contents are deliberately unvalidated.** Consult round 3
   rejected a published recorder-plugin contract as premature
   abstraction. Only the shape is checked (a mapping, kebab-case driver
   names). Proposing a schema for driver blocks is re-opening a settled
   decision.
3. **One exemplar only.** The spec's non-goals: *"This builds the
   capability and exactly one exemplary scenario, not a library."* A
   second scenario is out of scope.
4. **No JSON Schema beside the Python validator.** Session 1 spent three
   Majors on `disposition.schema.json` and its Python validator
   disagreeing about one file. This session ships **one** validator on
   purpose. Recommending a parallel JSON Schema is recommending that
   defect class back.
5. **`scenario_lint` is advisory, never a refusal.** A pattern gate over
   free prose has a false-positive surface (the exemplar hit one on its
   first pass and was reworded — see the module docstring). The
   committed corpus is asserted clean by pytest, which is where the rule
   bites. "The lint should block rendering" contradicts this set's
   central finding that a gate forcing an unpleasant outcome gets routed
   around rather than satisfied.
6. **Authored length above 60s warns and does not refuse** — same
   reason. It is a design check matching the operator's sub-minute
   hosting convention.
7. **The exemplar targets the AI Work Explorer (an Electron surface).**
   The operator's note of 2026-08-10 says Electron is the odd platform
   out and the real audience is (a)–(d) web. That is honoured by the
   *quarantine*, which is what makes the model portable; the exemplar is
   the only human-observable surface that exists in this repo today, and
   Session 3's Creates already names the web scenario it will author
   against the fixture web app it builds. Recorded as a scoping decision
   in `decisions.jsonl`.
8. **Generated documents are committed.** That is required for the
   byte-compare gate to have anything to compare. The non-goal is
   committed **video binaries**, which this session produces none of.

## Grade severity by consequence (G-013)

Probability the stated failure scenario reaches a real user, times
impact. Low probability **or** low impact is Minor. A finding with no
nameable failure scenario is a nit. Please state the scenario.

## What is worth attacking

- Can the four renderings drift in a way the check does not catch?
- Can a driver-only edit move any rendering, or a portable edit fail to?
- Do the documents anywhere imply random access to a stateful UI?
- Are the exemplar's `expect` lines actually true of the shipped
  extension? (`tools/dabbler-ai-orchestration/src/providers/`,
  `test-fixtures/uat-matrix/`, `scripts/stage-walk.js`.)
- Is anything in the walkthrough unfollowable by a reader with no
  context?
