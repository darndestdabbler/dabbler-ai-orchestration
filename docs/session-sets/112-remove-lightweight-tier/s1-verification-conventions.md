# Conventions for this verification round

## What this session is

Set 112 Session 1 of 3: **the router-side half of deleting the Lightweight
tier**. This is a deliberate, spec-authorised REMOVAL set. Deleted code is
the deliverable, not a regression. The set's spec is at
`docs/session-sets/112-remove-lightweight-tier/spec.md`; its evidence gate,
kill/keep lists, and the four already-settled decisions are in
`docs/proposals/2026-08-05-set-112-reservation-remove-lightweight-tier.md`.

## Suite baseline — both runs of record are GREEN and post-freeze

| suite | result | note |
| :--- | :--- | :--- |
| pytest (full) | **3,565 passed / 0 failed / 9 skipped** (16m18s) | run after the last code change |
| Playwright Layer 3 | **33 passed / 0 failed** (9m0s) | required: this session edited three blessed writers |
| `drift_guard.py` | clean | |
| `tutorial_gate.py` | clean | |
| extension `npm run compile` | clean | |

There are **no known failures, and no tracked/accepted failing tests.** The
9 skips are pre-existing and unrelated.

Test count moved **3,811 -> 3,578** (-233). That drop is the point: 8 test
modules were deleted along with the 5 production modules they covered.

## Release contract

- `dabbler-ai-router` stays at **0.34.0** in this session **by design**.
  Session 3 owns the major-version bump and the CHANGELOG release header;
  the publish itself is operator-gated. A `## [Unreleased]` CHANGELOG entry
  for Set 112 IS present and IS this session's deliverable.
- The extension version is untouched. This session's only extension edit is
  one line in a test file (`coldStartSnapshot.test.ts` renders one tier
  instead of two) because the fixture tree it snapshotted was deleted.

## By-design exclusions — please do not report these as findings

1. **Session 2 and 3 scope is deliberately untouched.** The extension
   `src/` tier machinery (`switchTier.ts`, `tierLegibility.ts`,
   `tierRewrite.ts`, `verificationModeRewrite.ts`, `setupVerification.ts`,
   `externalVerification.ts`, the Getting Started tier fork), all of
   `docs/templates/`, the teaching docs, `docs/ai-led-session-workflow.md`,
   `docs/concepts/tier-model.md`, the tier scan in `drift_guard.py`, and the
   consumer migration notice are **Session 2's**. The CI-wired
   anti-resurrection grep gate is **Session 3's**. `s1-kill-inventory.md`
   names each of these under "Deferred to S2". A finding that says "docs
   still mention the tier" is out of scope unless it identifies a
   *router-side* break.

2. **`test-fixtures/cold-start/full/` still teaches the fork.** It is
   GENERATED output of `docs/templates/consumer-bootstrap`, byte-compared by
   the TS golden-snapshot test. Hand-editing it would break that test until
   S2's template edits land. Journaled as `decisions.jsonl` ->
   generated-fixture deferral.

3. **Archives and proposals keep the word.** `docs/session-sets/**` (399
   files) and `docs/proposals/**` (62) are the historical record; rewriting
   them would falsify it. Likewise the changelogs.

4. **Comments that NARRATE the removal legitimately contain "Lightweight."**
   e.g. `gate_checks.py` "Set 112 deleted the Lightweight tier, and with it
   the `_set_is_lightweight` early-out". A future reader needs to know what
   used to be there and why it is not.

5. **The fail-loud message must contain `tier: lightweight`** to do its job,
   as must its test.

## What I would most like challenged

These are the judgment calls, and I would rather have them contested now
than discovered later. All three are journaled in `decisions.jsonl`.

1. **I closed a verification escape the spec's kill list did not name.**
   `gate_checks._set_is_lightweight` returned True on the
   **`DABBLER_NO_ROUTER` env var alone**, and it gated BOTH
   `check_verification_integrity` AND the expensive-suite run-of-record
   freshness check. So an environment variable — no tier declaration, no
   attestation, no human — disarmed two verification gates. The spec keeps
   `--no-router` as a test affordance (Decisions already made, item 2); I
   read "keep the affordance" as NOT "keep the gate relief," and deleted the
   skips. **Is that the right reading, or is it scope creep?** Note the
   consumer impact, which I recorded in the CHANGELOG: a CI job that relied
   on `DABBLER_NO_ROUTER=1` to close without evidence now fails the gate.

2. **I removed `--no-router`'s self-attestation.** It used to write a stock
   attestation and record `verification_method="manual"` with no human
   involved. Now the recorded method reflects the disposition's own claim.
   **Does anything legitimately depend on the old behavior?** The three
   inverted regression tests are in `test_verification_integrity_gate.py`
   (`TestGateScope`) and the rewritten `test_no_router_close_session.py`.

3. **I deleted the typed-session writers**
   (`session_state.register_typed_session_start` /
   `register_typed_session_handoff`, 399 lines) and the
   `start_session --type/--handoff/--handoff-verdict/--title` CLI surface.
   The spec's kill list says "Mode B verification: `dedicated-sessions`
   typed-session flow" — I judged the writers to be part of that flow, since
   `start_session --help` itself described typed sessions as taking their
   step list from "the Lightweight dedicated-verification procedure."
   I kept the `type` field as READ vocabulary in `progress.py` so archived
   sets that recorded typed sessions still parse and render. **Is the read
   path genuinely intact for those archives?**

## Specific correctness questions

- **The fail-loud loader's blast radius.** `parse_session_set_config` now
  raises `LightweightTierRemovedError` when the canonical config block says
  `tier: lightweight`. Its callers are `gate_checks` (line ~1660) and
  formerly `runtime_mode`. **Is there any code path that walks MANY session
  sets and calls this, where one bad archived spec would now crash the walk
  instead of skipping?** I checked `find_active_session_set` (uses
  `read_status`, not this) and confirmed zero sets in this repo declare the
  tier, but this is the failure mode I am least sure of.

- **`close_session.run` after removing 255 lines of gate blocks.** Two whole
  gate blocks came out between the gate-check chain and the path-aware
  critique gate. `close_is_terminal` is still computed and still consumed by
  the pathAwareCritique and contractGate gates. **Did anything else depend on
  a variable defined inside the removed blocks?**

- **`runtime_mode.resolve_no_router_mode` still accepts `session_set_dir`
  and ignores it** (`del session_set_dir`), for consumer signature
  stability across a major bump. **Is silently ignoring a parameter the
  right call versus removing it outright in a release that is already
  breaking?**

## Severity rubric for this round

Grade by **consequence**: probability the stated failure scenario reaches a
real user, times impact. Low probability **or** low impact is Minor. A
finding with no nameable failure scenario is a nit. "This file still
contains the word Lightweight" is not a finding unless you can name what
breaks.
