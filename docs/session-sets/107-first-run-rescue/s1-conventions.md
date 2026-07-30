# Up-front conventions for this verification round — Set 107, Session 1

Read this before the evidence. It states the agreed baseline so the round
spends its findings on real defects rather than on things already settled.

## What this session is

Set 107 exists because staff called the shipped Hello World tutorial "way too
complicated" and some abandoned it. Four review rounds across two engines
converged on one diagnosis: **first-run cognitive load, not raw git**. Session 1
of 3 builds the path that skips the load: a `Dabbler: Try a sample project`
command, a canonical sample bundle, and the executable acceptance floor for
both. Session 2 rewrites `hello-world.md` around it. Session 3 walks it with a
stopwatch.

The direction is **settled and out of scope for this round**. It was fixed
across `docs/planning/git-transparency-proposal-v3.md` (authoritative) and its
§12 corrections, which are binding on the spec. Findings that re-litigate the
increment's scope, the four-document split, the Lightweight-first choice, or
the decision to defer `Start work` / `Send for review` to increment B are
out of scope. Findings about whether the code **does what the spec says** are
exactly in scope.

## Suite baseline (exact, at the time this evidence was assembled)

- **Layer 2 (extension unit suite, `npm run test:unit` via the shipped
  vscode-stub):** 1806 passing, 0 failing. This is green — the repo's
  `@vscode/test-electron` harness is separately known-broken on VS Code
  1.128.0 and is not the suite being reported.
- **Layer 1 (`python -m pytest`):** 3060 passed, 6 skipped — green. Six of
  those are new: unit coverage for the `sample-dist-in-sync` drift check this
  session adds.
- **Layer 3 (Playwright):** **could not run on this machine — environment, not
  a regression.** All 28 specs fail identically inside
  `_electron.launch` / `app.firstWindow` ("Target page, context or browser has
  been closed"), before any window opens and therefore before any extension
  code or assertion runs. Diagnostics performed:
  - reproduces on **all four** cached VS Code builds (1.118.1, 1.124.2,
    1.128.0 via `VSCODE_BIN`) — so it is not version rot introduced here;
  - the **same binary with the same harness flags launches fine and stays
    running** when started outside Playwright, with no stderr — so the binary,
    the flags, and the workspace fixture are all sound;
  - clearing the inherited `ELECTRON_RUN_AS_NODE` / `VSCODE_*` host variables
    does not change it (the harness's own allowlist already strips them).

  This session changed **no** Explorer-rendering surface, no state-file
  writer, and no fixture harness, so L-064-12's local-Layer-3 trigger does not
  fire for it. The authoritative Layer-3 signal for these changes is CI's
  `playwright-tests` job, which runs on push across ubuntu / macos / windows
  with a freshly downloaded binary. **Do not treat Layer 3 as green here.** It
  is unrun, and it is named as a residual in `disposition.json`.
- **`ai_router/scripts/drift_guard.py`:** green.

**The drift-guard job was RED on `master` before this session**, from six
occurrences of the banned stale-tier label in frozen proposal/review records
committed by the previous set. This session fixed that inherited failure via
the guard's own auditable allow-region mechanism. That fix is deliberate and
in scope; it is not drive-by scope creep.

## Release contract

- The extension version is bumped **0.46.0 → 0.47.0** with a CHANGELOG entry.
  **No tag was pushed and no publish was run** — the Marketplace click is the
  operator's, every time. A finding that the release is "incomplete" because
  nothing was published is expected behavior, not a defect.
- `dabbler-ai-router` carries one fix (the `close_session` EOF guard) and is
  **not** version-bumped here. Publishing it is likewise operator-gated.

## By-design exclusions — do not report these as defects

1. **The smoke test stubs step 5's `pip install`.** Deliberate: the test's
   interpreter already has `ai_router` importable, and a live network install
   would make the acceptance floor flaky without adding signal. Everything
   else in the walk — render, `git init`, the repo-local identity, both
   commits, the local-only marker, `start_session`, the unittest runs before
   and after, the program's stdout, and `close_session` — is real.
2. **The smoke test writes the `shout` implementation itself** rather than the
   bundle shipping an answer key. Proposal v3 §6 forbids a second
   hand-maintained copy of the sample; the implementation's shape is already
   pinned by the test the bundle ships.
3. **`.dabbler/local-only` is written from TypeScript**, not by
   `python -m ai_router.local_only --enable`. At step 4 there is no venv to run
   the Python CLI in — step 5 is what creates it. `gate_checks.is_local_only`
   reads the marker's **presence only** and never parses its contents
   (documented in `ai_router/local_only.py`), so the body is free-form context.
4. **The sample's tests are stdlib `unittest`, not pytest.** Step 5 installs
   exactly one package (`dabbler-ai-router`, which does not depend on pytest),
   so a pytest-shaped sample could not run at all.
5. **`azure-pipelines.yml` is rendered into every scaffolded repo**, including
   GitHub-hosted ones, symmetrically with the existing `monorepo-ci.yml`. This
   is a dual-host product; both files are inert until adapted.
6. **Steps 6-7 of the contract straddle a window reload.** `vscode.openFolder`
   restarts the extension host, so the landing is recorded in `globalState`
   before the open and replayed on the next activation. This is the mechanism,
   not an oversight.
7. **The tutorial rewrite is Session 2's job.** `docs/tutorials/hello-world.md`
   is deliberately untouched here.

## Severity rubric for this round (L-095-1)

Grade by **consequence**: probability the stated failure scenario materializes
for a real user, times impact on the deliverable's objectives.

- **Critical / Major** — a defect that would break, mislead, or strand a
  developer on their first fifteen minutes with the product, or that ships a
  wrong claim into a user-facing contract three things pin.
- **Minor** — technically correct but low-probability OR low-impact.
- No plausible failure scenario ⇒ **Minor by definition**.

State the concrete failure scenario for every Critical/Major: the inputs or
state, and the wrong output or crash that follows. A finding without one is a
Minor.

## Where to look hardest

The two most consequential surfaces are:

1. **`createSampleProject`'s resume path.** Proposal v3 §12.3 found the
   original design would refuse the project it had just half-made. Does the
   marker/resume mechanism actually close that, including when the marker
   write itself fails, when the bundle version differs, and when every step is
   already done?
2. **The sample bundle as a contract.** `bundle.json` is pinned by the
   command, by Session 2's tutorial, and by the smoke test. Is anything in the
   rendered sample capable of drifting from it silently?
