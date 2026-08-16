# Session 4 verification conventions

Read this before the diff. It states the agreed baseline so Round 1 spends
its findings on real defects rather than on things already settled.

## What this session is

Set 113 Session 4 of 4 — the **bounded Windows OS-capture pilot**, and the
set-terminal session. The spec budgets it to **end in a measurement either
way**: a documented failure is a successful session, and only a pass ships
a recorder. It is not a session about building a media subsystem, and the
operator's standing complexity note ("this could quickly become dozens of
sets with thousands of lines of code") binds hardest here.

## Suite baseline

**No full suite has run at the time this verification round is assembled,
and that is deliberate**, not an omission. Policy A2 forbids a full suite
before any cross-provider stage, because remediation is a code change that
would invalidate it. The three expensive suites this session's change set
affects — `pytest`, `mocha`, `playwright` — run **after** verification,
after any remediation, and after the advisory path-aware critique, and are
recorded then.

Baselines they will be measured against:

- **mocha** (`npm run test:unit`, ts-node over `src/**/*.ts`): ~1821
  passing / 0 failing before this session. This session adds
  `src/test/suite/osCaptureRecorder.test.ts`.
- **pytest** (`ai_router/tests`): ~3143 tests, roughly 49 minutes on this
  machine at near-idle. Slow is normal here, not hung.
- **playwright** (Layer 3): 28 specs. Owed because this session touches
  `tools/dabbler-ai-orchestration/scripts/` and `package.json`.

## Release contract

- `ai_router/changelog.d/0013-set-113-s4-os-capture-pilot.md` is an
  **`[Unreleased]`** fragment. **No version is bumped** in this session, and
  **nothing is published** to PyPI or the Marketplace. Publication is
  operator-gated and always has been.
- No extension changelog fragment. Session 3 set the precedent for this
  same situation: the recorder lives under the extension package's
  `scripts/`, which is repo tooling rather than shipped extension surface,
  and its entry goes in the router changelog.

## By design, not oversight

- **No CI recording.** A spec non-goal, stated outright: "a headless runner
  records a different thing than the operator's machine shows." The
  recorder is run on demand by a human. Tests therefore cover the *pure*
  half — driver-block refusals and the measuring instruments — and not the
  capture.
- **OBS Studio is never bundled.** It is a documented optional
  prerequisite. "OBS absent, or running without its websocket reachable" is
  a first-class supported outcome, not an error to engineer around, and the
  walkthrough must still complete and write a manifest with no video.
- **Windows-only, internal, explicitly unstable.** The portable path is the
  browser recorder Session 3 shipped, which serves every target that
  reaches a browser. This exists only because Playwright's `recordVideo`
  was measured to break the VS Code workbench, so the one product this
  framework cannot record portably is its own.
- **`.walkthrough-runs/` is gitignored output.** No video binary is ever
  committed. A ten-run pilot leaves roughly 430 MB there.
- **The pilot's criteria file is the authority for its verdict.** It was
  committed **before the first capture**; the harness reads it, refuses to
  run without it, and stamps its SHA-256 into every measurement. The verdict
  is computed from that file by a separate pure module, so no number in the
  evaluator can move the bar it judges against.

## Findings already known, and deliberately not resolved in this session's favour

Please do challenge the reasoning, but these are recorded positions rather
than oversights:

1. **Three criteria are reported UNMET.** They were not reworded after the
   fact. C7's no-audio-track clause cannot be satisfied through OBS
   configuration (four configurations tried); C2's *detector control* came
   in at 0.44 against a 0.50 bar because the occluder doubles as C1's
   structured decoy and includes browser chrome — deliberately **not**
   retuned, since adjusting the instrument to pass is the same sin as
   moving the threshold. Both are analysed in `s4-os-capture-outcome.md`.
2. **The recorder ships provisionally.** Adjudicating a criterion as
   non-blocking reduces verification, which is inside the decision-rights
   hard carve-out, so this session does **not** self-authorize that waiver.
   It is put to the operator as item A of the guided look.
3. **One display scale (100%) was exercised.** Changing the operator's live
   display scaling would disrupt the desktop they are working on. A
   window-resize variant covers the same dimension-blindness failure mode.
   Recorded as a residual rather than claimed as coverage.
4. **The UAT accounting records `none` for every component.** No human has
   reviewed anything yet. AI activity is not a human reviewer — Session 1's
   schema closes the reviewer-type vocabulary to `developer` and
   `business-user` precisely so this cannot be fudged — and committing the
   operator's time is not this session's call. The guided-look document is
   written and offered.

## Severity rubric

Grade by **consequence**: probability the stated failure scenario reaches a
real user, times impact. Low probability **or** low impact is Minor. A
finding with no nameable failure scenario is a nit. Please state the
scenario concretely; "this could be fragile" without a path to a user is a
nit by this rubric.
