# Session 3 verification conventions — Set 122

Read this before the evidence. It states the baseline, the release
contract, and the by-design exclusions, so a round is spent on real
defects rather than on the agreed starting position.

## What this session shipped

Session 3 of 4, *"Guarantee the router the launchers require."* Session 2
made every module command shell out to `python -m ai_router.modules`.
Nothing guaranteed that module was present or new enough. This session
closes that, and it is the **release gate**: the operator publishes
`dabbler-ai-router` to PyPI and the extension to the Marketplace
immediately after this set lands.

Three deliverables:

1. **A version floor declared once.** `MINIMUM_ROUTER_VERSION` +
   `PYPI_REQUIREMENT` in `utils/aiRouterInstall.ts`. The install
   requirement and the capability precondition both derive from it
   (L-069-1: two independently-maintained version constants is the drift
   defect this repo keeps re-finding). `mode: "install"` now passes
   `--upgrade`, so an existing older installation is upgraded rather than
   reported already-satisfied.
2. **A capability precondition.** `probeRouterCapability` imports
   `ai_router.modules` using the venv interpreter the launchers use, and
   the result gates the install outcome (`ok: false` when the probe
   fails). Success is the import, never pip's exit code (L-125-1).
3. **A retryable scaffold.** `decideDefaultModuleScaffold` gates
   default-module creation on the module being **absent** rather than on
   whether that call created `docs/modules.yaml`.

## Session set numbering — read this before flagging it

The two remaining sessions **swapped numbers** on 2026-08-13 by operator
decision, journaled in `decisions.jsonl`. This session is **Session 3**
and is the router guarantee; the append-file partitioning is now Session
4. Prior artifacts (Session 2's `disposition.json`, the earlier decision
entry, residual `S122-S2-R3`) say *"Session 4"* where they mean this
work. Those are raw records and are deliberately **not** rewritten; the
spec carries an amendment note explaining how to read them. This is
settled — not a finding.

`start_session` refuses to skip ahead (contiguous closure is a structural
assumption of two readers), which is why renumbering, not a gap, was the
only way to honour the operator's ordering.

## Suite baseline

- **Layer 2** (`npm run test:unit`): **1448 passing, 2 pending, 0
  failing.** Baseline entering the session was 1421 passing; the 27 new
  tests are this session's. The 2 pending are pre-existing.
- **New lane** (`npm run test:dogfood`): **4 passing.** Real venv, real
  network `pip install`, real install code path.
- **Layer 1** (pytest) and **Layer 3** (Playwright): run at Step 6, after
  the last code change, and reported there. `covers` is by path; this
  session touched no `ai_router/` source, but it DID edit
  `package.json` (a `test:dogfood` script), and `package.json` is the
  extension MANIFEST, so **L-064-12 applies and full Layer 3 is owed**.
- Layer 3 on this hardware is worker-count sensitive (residual
  `S122-S2-R2`): the run of record is taken at 2 workers, the count CI
  uses. Failures that pass in isolation at 4 workers are that known
  flake, not new behaviour.

## Falsifier evidence (L-112-1)

The new guarantees were **mutation-checked**, not merely asserted. Three
mutations were applied together — dropping `--upgrade`, making a failed
capability probe stop failing the install, and reverting the scaffold gate
to refusing any pre-existing manifest — and the suite went from 0 failing
to **20 failing**, including `RETRYABILITY: a manifest that already exists
but declares NO modules still scaffolds`. The mutations were reverted and
the suite is green again.

The dogfood lane also caught a real defect in its own first draft: passing
a venv-shaped `pythonPath` made `ensureVenv` provision into **this repo's**
venv, so the cold-start scenario had been passing vacuously (13s vs 38s
once fixed). It now resolves `sys.base_prefix` and asserts the venv lands
under the temp project.

## By-design, not defects

- **`DABBLER_ROUTER_INSTALL_SPEC` points the dogfoods at this repo, not
  PyPI.** Harness-only override from Session 2. A pre-release test cannot
  assert against a wheel that has not been published; "is the PUBLISHED
  wheel compatible?" is a release-time question, answered by the spec's
  mandated ordering (publish the router, confirm it is live, then publish
  the extension) and carried as residual **`S122-S2-R3`**. Do not report
  the absence of a published-wheel assertion as a new finding.
- **No version bump in `package.json`.** The operator ruled on 2026-08-11
  that the next Marketplace push is a single folded release; changelog
  entries go under `[Unreleased]`. Deliberate.
- **No `ai_router/` changes.** This session is extension-side only. The
  floor names `>=1.0.0`, which is the version `pyproject.toml` already
  stages.
- **The dogfoods are scripted, not an operator walk.** The set declares
  `requiresUAT: false` and that flag is immutable at runtime.

## What is genuinely worth finding

Failure modes in the upgrade path or the probe that would still let a
developer end up with a router that cannot run `ai_router.modules`;
fail-open branches in provisioning (L-079-3); ways the retry gate could
scaffold a module it should not, or refuse one it should create; and any
place the floor is effectively restated rather than derived.
