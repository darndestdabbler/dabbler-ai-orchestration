# Session 3 — the pre-walk automation floor

> **What this is.** The operator bar in `project-guidance.md` says *any step
> automation can verify must be verified by automation BEFORE the checklist is
> offered to the human*, because human UAT time is the most expensive
> verification resource in the workflow. This file records what was run, what it
> settled, and — the part that matters more — what it did **not** settle.
>
> **Run:** 2026-07-30, before the checklist was handed over.

## 1. The suites

| Layer | Command | Result |
| :--- | :--- | :--- |
| 1 — pytest | `.venv/Scripts/python.exe -m pytest` | **3149 passed, 6 skipped** (625s) |
| Preload ceiling gate | `python -m ai_router.guidance_report --check` | **OK** — 10,895 / 12,000 tokens |
| Tutorial literal gate | `python ai_router/scripts/tutorial_gate.py` | **OK — tutorials match the product and the bundle** |
| 3 — Playwright | `npm run test:playwright` | **red locally, green in CI** — see §3 |

## 2. The walk-specific check: is the published build the right one to measure?

The spec requires the walk to run on a **released VSIX**, never this repo's
editable install. `0.47.0` is published to the Marketplace, but its tag landed on
`7f2f2f8` — Session 1's last commit — so what shipped is S1's tree, not S2's.
That makes "is the published build still the one this tutorial describes?" a real
question rather than a formality.

```
git diff --stat vsix-v0.47.0..HEAD -- tools/dabbler-ai-orchestration/src \
                                       tools/dabbler-ai-orchestration/package.json \
                                       tools/dabbler-ai-orchestration/dist
 .../dist/templates/consumer-bootstrap/getting-started.md.template | 3 +++
 .../dist/templates/consumer-bootstrap/monorepo-ci.yml.template    | 2 +-
 2 files changed, 4 insertions(+), 1 deletion(-)
```

Two files, both consumer-bootstrap templates whose tutorial links S2 repointed.
**Neither is on the walk path**: `hello-world.md` never scaffolds a repo, so no
template is rendered at any point in it. The sample bundle and every command
string the tutorial quotes are byte-identical between the published tag and HEAD.

**Therefore the walk needs no new tag and no new publish.** `package.json` is
still `0.47.0`, so a tag would additionally require a version bump first — which
is cutting `0.48.0` for a link description, the release the operator already
declined earlier the same day when that CHANGELOG entry moved to `[Unreleased]`.

## 3. Layer 3 — green in CI, red on this machine, and why that is not a regression

Every one of the **28 Layer-3 specs fails locally**, all at the same place:

```
Error: electronApplication.firstWindow: Target page, context or browser has been closed
   at electronLaunch.ts:762
```

They fail **before any spec assertion runs** — the Electron process never comes
up, so nothing about the Work Explorer's rendering is being reported at all.

**CI is green on this session's own commit.** Run for `7112b8c`, all three legs:

```
Playwright Layer 3 (macos-latest):   success
Playwright Layer 3 (ubuntu-latest):  success
Playwright Layer 3 (windows-latest): success
```

Windows included — so this is not a Windows-vs-Linux rendering difference.

### What was ruled out, and how

Four hypotheses were tested rather than assumed, because "the harness is broken"
is exactly the conclusion that hides a real regression:

1. **IDE env pollution (`ELECTRON_RUN_AS_NODE=1`).** This shell inherits it from
   the VS Code extension host Claude Code runs inside, and it does flip a bare
   `Code.exe` into Node mode — `Code.exe --version` prints `v24.17.0`, a Node
   version, not VS Code's. But `electronLaunch.ts` already defends against
   exactly this with an explicit allowlist, and a minimal probe launching with
   **the harness's own scrubbed env** (asserting `ELECTRON_RUN_AS_NODE` is absent
   from the child env) fails identically. **Ruled out — the existing defence
   works.**
2. **A VS Code version regression.** `findCodeBinary` resolves the highest cached
   version, `1.128.0`. Forcing `VSCODE_BIN` at the cached `1.124.2` fails
   identically. **Ruled out.**
3. **The orchestrator's sandboxed shell.** Re-run with the sandbox disabled;
   fails identically. **Ruled out.**
4. **A stale bundle (the Set 045 rebuild trap).** The failing runs went through
   `npm run test:playwright`, which compiles first. **Ruled out.**

The minimal probe reduces the failure past Playwright's test runner to
`playwright-core`'s launcher:

```
Error: Process failed to launch!
    at waitForLine (playwright-core/lib/coreBundle.js:42440:21)
    at Electron.launch (...)
```

i.e. the spawned Electron never emits the line Playwright waits for.

### The remaining hypothesis, named as a hypothesis

**Node version.** CI pins **Node 20** in all three Layer-3 jobs
(`.github/workflows/test.yml`); this machine has **Node v25.8.1**, five majors
newer, and `@playwright/test` is `^1.60.0`. A launcher-level "process failed to
launch" under a much newer Node than the one the toolchain is tested against is
the best-supported remaining explanation. It was **not confirmed** — there is no
`nvm` on this machine and only one Node installed, so the falsifying experiment
(run the same spec under Node 20) could not be performed. It is recorded as
unproven.

### What this costs, and what is owed

For this session: **nothing in the deliverable**. Session 3 changes no extension
code, no state writer and no fixture — the surfaces `L-064-12` arms Layer 3 for —
and CI exercised the suite on the exact commit. The checklist's Walk 8 cites
Layer 3 for the Work Explorer's completed-set rendering, and that citation is
honest: the suite passed in CI on this tree.

What is owed is a **follow-on**, because `L-064-12`'s whole point is that a test
layer nobody can run locally rots silently, and "it works in CI" is how that rot
starts. The fix is small and belongs to whoever picks it up: either pin the
local toolchain to the Node major CI tests, or have `launchVSCode` fail with
*"Electron did not start — this is an environment problem, not a rendering
regression"* plus the Node version it saw, instead of a `firstWindow` timeout
that reads like 28 broken features. **Out of scope here** — Session 3's touches
are the tutorial, S1's command, and this set's artifacts.

## 4. What the automation floor does NOT settle

Named explicitly so the walk's evidence cannot be confused with it:

- Whether a stranger can **follow** the document.
- Whether a wait is long enough to **look** broken.
- Whether step N assumes something step N−1 never established.
- **How long it actually takes.** No suite can answer the criterion; that is the
  entire reason Session 3 exists and the reason `requiresUAT: true` was set at
  authoring time.
