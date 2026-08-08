# Session 4 — remediation round 1

Fixes for the merged Critical/Major findings from **both** discovery
passes (round 1 discovery K=2 across the spec-conformance and
failure-scenario lenses, round 2 supplementary). Both discovery passes
are spent. One fix pass, per the loop discipline.

Eight blocking findings were raised. They collapse to **seven distinct
defects** — findings 2 and 4 are the same macOS resolver bug seen through
both lenses — of which **six are accepted and fixed** and **one is
rejected on evidence**.

A theme worth naming before the itemised list: five of the six accepted
defects are in the walk stager, and four of those exist because the
commit that created `scripts/vscode-launch.js` *to remove* duplication
introduced a second, worse copy of the thing it was deduplicating. The
module's own header claimed its binary discovery was "unchanged from the
Set 027 harness". It was not — it was a re-typing of that harness from
several versions ago, and it silently dropped everything the harness had
learned since.

---

## Finding 1 (round 1, call 1, spec-conformance lens) — Major

> The walk stager does not actually make the walk start itself.

**Accepted in full, and it is the sharpest finding in the round.** The
reveal could never have fired.

**Why, precisely.** The reveal lived in the product extension's
`activate()`, gated on `DABBLER_WALK=1`. `package.json` declares
`"activationEvents": []` and contributes views, so VS Code generates
`onView:` activation — the extension activates when the Dabbler view
becomes **visible**. A fresh window opens on the file Explorer, the view
is not visible, the extension does not activate, and the code that would
have revealed the view never runs. **The reveal was waiting on the event
it was supposed to cause.** The session shipped this and asserted it
worked, and the only tests were source-text greps asserting the string
`process.env.DABBLER_WALK === "1"` appeared in a file — a test that a
line of code exists, not that it does anything.

**Fix.** The startup activation moves to a development-only companion
extension, `scripts/walk-companion/`, which declares
`"activationEvents": ["onStartupFinished"]` and executes the reveal
command. The stager loads it with a **second**
`--extensionDevelopmentPath` alongside the product extension.

The rejected alternative was adding `onStartupFinished` to the product
extension. That buys a dev-only convenience by making every user's window
activate the extension at startup — the exact cost Set 110 spent a
session measuring and reducing. The companion keeps the product's
activation profile untouched and leaves **no walk-specific code in the
product at all**, which is what the portability rule asks for anyway.
`scripts/**` is already excluded by `.vscodeignore`, so the companion
cannot reach the VSIX; a test pins that.

**Executable proof, because the claim is exactly the kind that was
asserted falsely last time.** The companion writes a marker file *after*
the reveal command resolves, carrying its outcome. `npm run walk:smoke`
(`scripts/walk-smoke.js`) launches the real stager, waits for that
marker, and fails unless it reads `revealed`. Observed on this machine:

```
[walk-smoke] PASS: revealed workbench.view.extension.dabblerSessionSetsContainer 2026-08-08T09:06:20.494Z
```

Run against the pre-fix tree the same check times out with "the walk
companion did not activate, so the walk would open on the file
Explorer" — the marker is written by a file that does not exist there.

**Regression tests** (`walkStager.test.ts`, suite *the walk actually
starts itself*):

- `the stager loads the walk companion as a second dev extension`
- `launchArgs emits one --extensionDevelopmentPath per extension`
- `the companion activates at startup, not on view visibility`
- `the companion reveals this extension's view container` — resolves the
  container id out of the real `package.json`, so renaming the container
  breaks the walk loudly instead of silently
- `the product extension carries no walk-specific code`
- `the companion is excluded from the VSIX`

---

## Findings 2 and 4 (round 1, call 1 and call 2 — both lenses) — Major

> The stager duplicates, and regresses, Playwright VS Code binary
> discovery; the shared resolver does not support the macOS `.app`
> layout the existing harness already handles.

**Accepted in full.** Two lenses found the same defect independently,
which is the fan-out working as designed.

**Why it mattered.** `scripts/vscode-launch.js` searched exactly three
fixed relative paths per version directory, including
`<versionDir>/Contents/MacOS/Electron`. The real
`@vscode/test-electron` macOS cache is
`<versionDir>/Visual Studio Code.app/Contents/MacOS/Electron` — a bundle
**child**. So on every Mac, `npm run walk` threw "No VS Code binary
found" even with a perfectly good cache sitting there. The Playwright
harness had already been through this exact bug (its own comment records
CI red on macOS "for at least twelve commits") and had grown a bundle
search, a four-name preference order, and a diagnostic
`describeVersionDir`. The new module reproduced the old bug in a file
whose stated purpose was ending duplication.

**Fix.** `scripts/vscode-launch.js` is now genuinely the single
definition: `resolveCodeExecutable`, `describeVersionDir`, `realProbeIo`
and the darwin preference order move there verbatim, and
`electronLaunch.ts` **requires and re-exports them** rather than keeping
a copy. `findCodeBinary` in the shared module now delegates to
`resolveCodeExecutable` per platform and reports what it inspected on
failure. `electronBinaryLookup.test.ts` — 14 assertions that already
covered the macOS branch with injected IO — now exercises the shared
implementation through those re-exports without a line changed.

**Regression tests** (`walkStager.test.ts`, suite *binary discovery is
shared with the Playwright harness*):

- `a macOS .app bundle cache resolves` — drives the darwin branch from
  Windows with a fake IO tree, so the macOS-only bug is catchable by
  everyone who develops here
- `electronLaunch.ts delegates rather than keeping a second copy` —
  fails if a second `_DARWIN_EXEC_PREFERENCE` ever reappears

---

## Finding 5 (round 1, call 2, failure-scenario lens) — Major

> The walk stager inherits the full parent environment instead of the
> Playwright harness's sanitized Electron environment.

**Accepted in full.** `stage-walk.js` spawned Code with
`{ ...process.env, DABBLER_WALK: "1" }`.

**Why it mattered.** The normal way an operator starts a walk is from
VS Code's integrated terminal, whose environment carries VS Code's own
IPC variables (`ELECTRON_RUN_AS_NODE`, `VSCODE_*`). The harness has
guarded against exactly this since Set 027 with an explicit allowlist,
whose comment explains that inheriting them flips the child into
CLI-arg-parsing mode. The stager reintroduced the failure the harness
documents at length, one file away.

**Fix.** The allowlist moves into `scripts/vscode-launch.js` as
`electronEnv(extra, sourceEnv, platform)` — one definition, used by both
consumers. `electronLaunch.ts`'s `_electronEnv()` delegates to it. The
stager passes only `DABBLER_WALK_MARKER` (the smoke-check hook) as an
extra. An allowlist rather than a blocklist stays the right shape: new
IDE variables (`CURSOR_*`, `APPCODE_*`) are excluded by default.

**Regression tests** (suite *the child environment is an allowlist, not
an inheritance*): `VS Code's own IPC variables are not inherited`,
`unknown variables are excluded by default, not by blocklist`,
`launch-specific extras are applied after filtering`, and
`the stager uses the allowlist rather than spreading process.env`.

---

## Finding 3 (round 1, call 2, failure-scenario lens) — Major

> `session_touched()` fails the repo's own Windows-path test on
> Ubuntu/macOS.

**Accepted in full.** This one was red in CI the moment it was pushed.

**Why, precisely.** `run_of_record.session_touched` normalised paths with
`raw.replace(os.sep, "/")`. On Windows that rewrites backslashes; on
Linux and macOS `os.sep` is **already** `"/"`, so the replace is a no-op
and a Windows-authored `files_changed` entry like `src\nested\a.ts`
passes through untouched and matches nothing. The repo's own
`test_normalises_windows_separators` asserts that exact case, and the
required `python-tests` matrix runs `ubuntu-latest` and `macos-latest`.
The bug is invisible from the developer machine by construction — the
same shape as the `drift-guards` job the spec's own CI section describes.

**Fix.** A `_posix()` helper that replaces `"\\"` unconditionally on
every platform, applied at all three normalisation sites
(`session_touched`, `load_suites`, `surface_digest`). A disposition is
authored on one machine and evaluated on another, so the separator a path
was *written* with must never decide whether it is recognised.

**Regression tests** (`test_run_of_record.py`):
`test_normalises_windows_separators_on_every_platform` and
`test_normalises_windows_separators_in_covers_too`, both of which
monkeypatch `os.sep` to `"/"` so a Windows host reproduces the posix
runner's failure.

---

## Finding 6 (round 2, supplementary) — Major

> The UAT close gate silently bypasses `requiresUAT: true` when
> `uatScope` is omitted.

**Accepted in full.** The gate had a hole shaped like its own purpose.

**Why, precisely.** `spec_config` collapsed an omitted `uatScope` to the
string `"none"`, and `_uat_policy` returned early on `scope == "none"`.
So `requiresUAT: true` with no `uatScope` — the likeliest shape for a
hand-authored or carried-forward spec — disarmed the gate entirely. The
gate exists because "the walk just did not happen" must be impossible,
and the one spec most likely to be written by hand was the one it could
not see.

**Fix, in two parts.**

1. `SessionSetConfig.uat_scope` is now `Optional[str]`, `None` when the
   field is **omitted**. Collapsing "omitted" into "none" destroyed the
   only signal a gate could use, and no other consumer existed.
2. `_uat_policy` treats scope as choosing *which sessions* owe a walk,
   never *whether any does*. Under `requiresUAT: true`, anything that is
   not `per-set` or `per-session` — omitted, `none`, or a typo — resolves
   to `per-set`. Disarming happens where it is visible: `requiresUAT:
   false` or `"suggested"`, both still inert.

An explicit `uatScope: none` therefore no longer disarms. That is a
deliberate widening beyond the literal finding, and it is what the
authoring guide already said: `none` is "invalid here (use `requiresUAT:
false` instead)". Honouring an invalid value as a disarm let the
contradiction win silently. The guide is updated to state the runtime
consequence in all three places it described the old behaviour.

**Regression tests** (`test_set111_close_gates.py`):
`test_an_explicit_scope_of_none_no_longer_disarms`,
`test_an_omitted_scope_still_arms_the_gate`,
`test_an_unrecognised_scope_arms_rather_than_disarms`, and — so the fix
cannot make the gate unsatisfiable —
`test_an_omitted_scope_still_lets_a_recorded_walk_pass`. The fixture
helper gained the ability to **omit** the field rather than only set it,
which is what the old test file structurally could not express.

---

## Finding 7 (round 2, supplementary) — Major

> The freshness gate does not cover the policy's named Layer 3 trigger
> surfaces.

**Accepted in full.** The prose and the executable check disagreed, and
the whole point of Step 4 was that prose does not survive end-of-session
pressure.

**Why, precisely.** The authoring guide names four non-negotiable Layer 3
triggers: the Explorer rendering surface, **a state-file writer**, the
extension manifest, and **the fixture harness**. `DEFAULT_SUITES`
playwright `covers` carried only the first and third. A session that
changed a blessed writer or the fixture harness would be told "session
touched none of this suite's surfaces" and could close without the run
the policy calls mandatory.

**Fix.** The map now spells the policy out: the extension `src/`,
`package.json` and `media/`; the fixture and walk harness
(`tools/dabbler-ai-orchestration/scripts/`,
`tools/dabbler-ai-orchestration/test-fixtures/`,
`ai_router/tests/e2e/`); and the blessed writers
(`session_state.py`, `start_session.py`, `close_session.py`) named
file-by-file rather than as `ai_router/`. Arming a 13-minute suite for
every router change would produce a gate that sessions route around
instead of satisfy.

This finding immediately bound on **this** session: the fixes above touch
`tools/dabbler-ai-orchestration/scripts/`, so the widened map requires a
fresh full Layer 3 before close, where the old map would not have.

**Regression tests** (`test_run_of_record.py`, class
`TestDefaultSuiteCoverage`): nine parametrised cases asserting each
policy-named surface requires Layer 3, three asserting unrelated surfaces
do **not** (so the widening cannot quietly become "everything is
expensive"), and one pinning playwright as the expensive suite.

---

## Finding 8 (round 2, supplementary) — Major — **REJECTED on evidence**

> The PyPI publish action is annotated as `v1.14.2` but pinned to the
> moving `release/v1` branch head, not the release tag.

**Rejected. The premise is factually wrong**, and the reasoning is
checkable rather than a matter of judgment.

`dc37677b2e1c63e2034f94d8a5b11f265b73ba33` **is** the commit that the
`v1.14.2` tag points to. `v1.14.2` is an *annotated* tag, so it
dereferences in two hops:

```
GET /repos/pypa/gh-action-pypi-publish/git/refs/tags/v1.14.2
  -> object.sha  a892a5a61159132606e93a2fa6f4358831b04d26  (type: tag)
GET /repos/pypa/gh-action-pypi-publish/git/tags/a892a5a6...
  -> object.sha  dc37677b2e1c63e2034f94d8a5b11f265b73ba33  (type: commit)
```

The verifier appears to have observed that the same SHA is *also* the
current head of `release/v1` and concluded the pin was taken from the
branch. Both are true and the coincidence is expected: `release/v1` is
the branch the maintainers move to each release, so it points at the
newest release tag's commit until the next release. The pin is correct,
the comment is accurate, and it is immutable — a later push to
`release/v1` moves the branch, not this SHA.

**Verified all six pins the same way** rather than only the contested
one, since the finding's second half asks for SHA/comment integrity:

| action | comment | tag resolves to |
| :--- | :--- | :--- |
| `actions/checkout` | v4.4.0 | `11d5960a…` MATCH |
| `actions/setup-python` | v5.6.0 | `a26af69b…` MATCH |
| `actions/setup-node` | v4.4.0 | `49933ea5…` MATCH |
| `actions/upload-artifact` | v4.6.2 | `ea165f8d…` MATCH |
| `actions/download-artifact` | v4.3.0 | `d3f86a10…` MATCH |
| `pypa/gh-action-pypi-publish` | v1.14.2 | `dc37677b…` MATCH |

No workflow change is warranted. **What the finding is right about** is
that nothing in the repo can *catch* a SHA/comment mismatch — the
`drift_guard` check verifies pins are 40-char SHAs, not that the trailing
comment names the tag they resolve to. Closing that needs a network
lookup, which is the wrong dependency for an offline drift guard that
gates every commit. Recorded as a residual for the release-hygiene owner
rather than bolted on at close under remediation pressure.

---

## What was NOT changed, and why

- **No workflow edits.** See finding 8.
- **The 32 pre-existing Layer 2 failures were left alone.** A clean-tree
  baseline run (`git stash push -u -- tools/`) reports **1866 passing /
  32 failing** before any of this session's changes; the run after them
  reports **1876 passing / 32 failing**. The failures are two
  environmental classes — `Cannot set property workspaceFolders of
  #<Object> which has only a getter` (the cached VS Code 1.132.0 made
  that property getter-only, breaking the suite's stubs) and
  `watcherInventory` resolving `src` relative to the Electron host's cwd.
  Neither is caused by, nor related to, this session's diff, and
  repairing a VS Code-version break is its own piece of work rather than
  something to smuggle into a remediation round. Recorded as a residual.
