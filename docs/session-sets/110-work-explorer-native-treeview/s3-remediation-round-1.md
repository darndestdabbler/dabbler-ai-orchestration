# Session 3 — remediation of round 1's blocking Major

> **Discovery round 1** (fan-out 2, both `gpt-5-6-sol`, anthropic auto-excluded,
> $2.0296) returned **ISSUES_FOUND**: 1 blocking Major, 0 minor.
> **Supplementary round 2** ($0.9877) — the completeness critic over the same
> evidence, run BEFORE any remediation as the loop requires — returned
> **VERIFIED with zero findings**, so nothing joins the merge.
>
> One finding, accepted in full. Nothing disputed, nothing dismissed.

---

## The finding

> **The new environment-fault Layer 3 test does not deterministically create
> an environment fault.** *Severity: Major.*
>
> *Failure scenario (verifier's words):* "A maintainer runs the mandatory full
> Playwright suite in the normal configured development environment, where a
> provider key and system Python are available. The fixture then has no status
> fault, so `dabblerSessionSets.setupNeeded` remains false and
> `openSessionSetsView()` times out waiting for a pane that correctly does not
> exist."

**Accepted, and it is sharper than "the test is flaky".** Two things were
wrong, and the second is the one that matters:

1. **The test's stated reason was false.** Its comment claimed a repo with no
   engine files and no venv "fails the workspace-initialization probe". It
   cannot: `systemStatus.buildSystemStatus` computes
   `workspaceInitialized = hasAnySets || detectCompletion(...).structureBuilt`,
   and the fixture creates a session set, so `hasAnySets` is `true`
   unconditionally. That is L-064-8 exactly — a claim about current behaviour
   written into a new file and not checked against the code.
2. **The test passed anyway, for a reason it did not state and does not
   control.** The fault that actually fired was the PROVIDER KEY one, and it
   fired only because `electronLaunch._electronEnv()` uses an allowlist that
   happens not to include `DABBLER_*`. That is an unrelated harness detail. On
   a runner that passed those keys through — or under a different tier or
   transport profile — the mandatory full-suite gate would have failed on the
   ENVIRONMENT rather than on the product.

The verifier's own suggested fix ("use an empty workspace so `hasAnySets ===
false`") is not taken, and the reason is worth recording: an empty workspace
makes `isSetupNeeded` return `true` on the `!hasAnySets` branch, so the test
would stop exercising the FAULT path at all. The point of the test is the
fault branch.

## The fix

`dabblerSessionSets.pythonPath` is written into the fixture's
`.vscode/settings.json` pointing at a file that does not exist.
`probePythonPresenceCore` short-circuits on an explicit setting, so the Python
probe fails **deterministically** — no dependence on credentials, tier,
transport profile, or what is installed on the box. The fixture also now calls
`scaffoldEnvironment(...)`, which clears every other fault, and the assertion
names the exact fault code:

```ts
await expect(strip.locator('[data-status-code="python"]')).toHaveCount(1);
```

So the test can no longer pass on a fault it did not cause.

### Acceptance check 1 — the false claim (executable)

The claim was that the workspace-initialization probe fails for this fixture.

**Against the pre-fix state — FAILS:**

```
$ node -e "const hasAnySets=true, structureBuilt=false;
           const workspaceInitialized = hasAnySets || structureBuilt;
           console.log('workspaceInitialized =', workspaceInitialized);
           process.exit(workspaceInitialized === false ? 0 : 1);"
workspaceInitialized = true
the spec claims the workspace-initialization probe FAILS -> expected false
exit=1
```

**Against the fixed state — PASSES:** the claim is gone. The spec no longer
asserts anything about `workspaceInitialized`; it causes and names a Python
fault instead. Verified by check 2.

### Acceptance check 2 — the fault is under the test's control (executable)

```
$ node -e "<reads the spec body and checks three properties>"
spec CAUSES the fault under its own control: true
spec ASSERTS the exact fault code          : true
spec still makes the false workspace-init claim: false
exit=0
```

**Against the pre-fix state — FAILS:** `grep -n "pythonPath|data-status-code"
src/test/playwright/system-status.spec.ts` returned no hit in the scenario
body; the spec set nothing that would cause a fault and asserted only the
generic strip.

### Acceptance check 3 — the specs themselves

```
$ npx playwright test system-status --reporter=list
  ok 1 ... an invalid manifest explains itself, retains the last-known-good tree, and clears on repair (14.5s)
  ok 2 ... a repo with sets and no scaffolded router package shows no environment fault (12.9s)
  ok 3 ... an environment fault brings the status pane back (14.0s)
  3 passed
```

---

## A second defect the full suite found, fixed in the same round

Not a verifier finding — the **full Layer 3 run of record** caught it, which
is the operator's stated reason for making that run non-negotiable. Recorded
here because it is a defect in code this session wrote.

**`openDabblerContainer` clicked the activity-bar icon unconditionally.** VS
Code's activity-bar icons TOGGLE: clicking one whose container is already
active HIDES the sidebar. `vsix-first-run-walkthrough` opens the Getting
Started webview, drives a real venv + pip install, and only then reaches for
the tree — so by the time it called the helper the container was already open,
the second click closed the sidebar, and the walkthrough waited out a
five-minute timeout for a row that could not be visible. **It was the only
failure in an otherwise-green 33-test suite.**

**The first fix attempt made it worse, and that is worth recording rather than
quietly reverting.** It tried to DETECT the open state from the workbench's
own `.checked` markers, got the reading backwards, and turned one failure into
three — the two previously-green `system-status` scenarios started failing
because the container was never opened at all. Guessing at another product's
internal DOM state to avoid a parameter was a bad trade. `workExplorerPane`
now takes an explicit `{ reveal?: boolean }`; callers know whether they have
already opened the container, so they say so.

**A third, separate race surfaced once the sidebar stayed open:** the scaffold
writes `docs/modules.yaml` BEFORE it creates the lifecycle sets, so the
`Default` row appears reading `"Default0 sets"` while the install is still
running and only later becomes `"2 sets"`. Waiting on the row and then
asserting the count with a short timeout raced that gap. The **set count is
the completion signal**, not the row — the webview never exposed this seam
because it rebuilt the whole tree per snapshot. Fixed at all three module
checkpoints (Default / Greeter / Payments).

```
$ npx playwright test vsix-first-run-walkthrough --reporter=list
  ok 1 ... REAL first-run walkthrough: Build -> Default -> rename -> delete -> re-add ... (23.4s)
  1 passed
```

---

## Suite state after remediation

| gate | result |
| --- | --- |
| typecheck | clean |
| Layer 2 | **1866 passing / 0 failing** |
| Layer 3 — full run of record | **32 passed / 1 failed** (the walkthrough, fixed above) |
| Layer 3 — post-fix targeted | `system-status` 3/3, `vsix-first-run-walkthrough` 1/1 |
| discovery rounds used | 2 of 2 permitted (discovery + supplementary) — no third |

**One disclosure about coverage, stated rather than hidden.** The full Layer 3
run of record predates these three test-only fixes. Per the operator's
2026-08-05 test-run policy the full suite runs **once, after the last code
change**, and re-running a 23-minute suite to re-confirm four specs that were
just run targeted and green is precisely the waste that policy exists to
prevent. The targeted runs above are the per-round evidence the policy names;
**no product code changed** in this remediation — every edit is inside
`src/test/playwright/`. Session 4 runs the whole matrix once against the final
build regardless.
