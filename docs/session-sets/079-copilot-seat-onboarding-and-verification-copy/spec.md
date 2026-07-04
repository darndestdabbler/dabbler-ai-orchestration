# Copilot Seat-Profile Onboarding and Verification-Mode Copy Spec

> **Purpose:** Set 078 shipped a genuine indirect-Full-tier path for
> Copilot-locked shops (the `copilot-cli` transport profile), but it has
> zero representation in the Getting Started onboarding form — a
> Copilot-only operator has no way to discover it short of reading
> `docs/concepts/tier-model.md`. This set gives it the "fuller" onboarding
> treatment the operator's own team needs (they are Copilot-locked and
> will use this path): a discoverable, guided setup inside the form, not
> just a documentation pointer. Bundled in the same set: the Lightweight
> verification-mode radio descriptions are jargon-dense
> ("structured verification sessions... with a close-out gate") and the
> operator asked for simpler copy while we're in this part of the form.
> **Created:** 2026-07-04 (revised same day after a routed architecture
> critique — see `architecture-critique.md` and *Revision log* below)
> **Session Set:** `docs/session-sets/079-copilot-seat-onboarding-and-verification-copy/`
> **Prerequisite:** None (Set 078 is complete and published; this set only
> reads its CLI surface, `ai_router/copilot_catalog.py` and
> `transport.profile`, never modifies it)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
requiresUAT: true
requiresE2E: suggested
uatScope: full
```

> Rationale: this set's primary deliverable is a new interactive path
> through the Getting Started webview form (a real UI surface with
> persistence-across-reload requirements, exactly the class of behavior
> Sets 077/078 required UAT for) plus copy changes to an existing form
> element. `requiresE2E: suggested` because the new probe/wiring logic is
> the kind of thing Layer 2 (mocha/vscode-stub) can cover directly, but a
> Playwright Layer 3 addition is a judgment call for whoever runs Session
> 2 depending on how much of the async-progress UI specifically needs
> rendered-DOM coverage beyond what Layer 2 already gives.

---

## Revision log

A single routed architecture critique (`architecture-critique.md`) was run
against the first draft of this spec before Session 1 was allowed to
start (proportionate rigor call: extending an existing pattern, not a
novel architecture — see *Design background* below). It returned three
CRITICAL findings, all resolved in this revision:

- **C1 (seat-id/seat-label deferred but load-bearing on Session 1's UI
  shape)** — resolved: seat-id/seat-label are now auto-derived, never an
  operator-typed field. See *Feature 1 → Seat identity*.
- **C2 (catalog-refresh modeled as a cheap pre-flight, when it actually
  depends on the scaffold's own venv + `ai_router` install having already
  happened)** — resolved: the ordering is now explicit — refresh runs
  strictly *after* the existing scaffold/venv/install steps succeed, not
  before or in parallel with them. See *Feature 1 → Sequencing*.
- **C3 (the "fall back to `api`, finish scaffolding, switch later" failure
  story leaves the exact keyless target audience with a non-functional
  router)** — resolved: the failure UX now tells the truth about
  functionality, and `api` is only presented as usable if `DABBLER_*` keys
  are actually already present. See *Feature 1 → Failure UX*.

Five MAJOR findings (async-UX robustness, Session 2 being ~two sessions of
work, the multi-seat/enterprise justification gap, the config write being
a replace not an append, and the unversioned CLI-contract coupling to Set
078) are addressed by splitting the original Session 2 into two sessions
(now Sessions 2 and 3) and the fixes described inline below. MINOR
findings are folded into the relevant session's steps. Nothing was found
that couldn't be resolved by revising the spec — no session has started,
so nothing needed to be un-done.

---

## Project Overview

**Scope.** Two features, bundled because both touch the same Getting
Started webview surface and the operator asked for both together:

1. **Feature 1 — Copilot seat-profile onboarding.** When the operator
   picks **Full** tier, offer a sub-choice for *how* Full's routed calls
   dispatch: **direct provider API keys** (the current, unchanged default)
   or **a GitHub Copilot CLI seat** (Set 078's `copilot-cli` transport
   profile — no `DABBLER_*` keys needed). This mirrors the existing
   Lightweight → verification-mode sub-choice pattern (a second radio
   group that appears conditionally under the parent tier radio) for the
   UI shape only — the underlying wiring is materially different from
   anything Set 077 built, per the sequencing and failure-UX sections
   below.
2. **Feature 2 — simplified verification-mode copy.** Rewrite
   `VERIFICATION_MODE_OUT_OF_BAND_TEXT` and
   `VERIFICATION_MODE_DEDICATED_TEXT` (currently: "Out-of-band or none —
   copy a review prompt into a second AI assistant and record its verdict
   by hand (the default)." / "Dedicated verification sessions — structured
   verification sessions run on a different AI engine or provider, with a
   close-out gate.") in plainer language. This ripples into: the pinned
   Layer 2 tests asserting the exact strings, both README.md files (which
   quote the current copy verbatim as of Set 077), and any other doc that
   quotes it. Land the new copy, then sweep every quoted reference in one
   pass so nothing is left stale. **Release-coupling note (critique m6):**
   Feature 2 has no code coupling to Feature 1 (different constants, same
   file only incidentally) and must stay independently landable — if
   Feature 1 (Sessions 1-3) stalls or is deferred, Feature 2 (Session 4)
   should still be shippable on its own.

**Non-goals.**
- No change to the `copilot-cli` transport's underlying behavior,
  contract, or Set 078's fail-closed rules — this set is onboarding UX
  only, reading that surface, never modifying `ai_router/cli_transport.py`
  or `ai_router/copilot_catalog.py`'s core logic. A thin CLI-invocation
  wrapper (subprocess call + progress reporting) is in scope; the catalog
  discovery logic itself is not touched. **Confirm at Session 5 close**
  that zero `ai_router` files changed, so the release-scope claim below
  (extension-only) holds — if any `ai_router` edit crept in, the release
  section needs revisiting, not assumed away (critique m4).
- No change to the direct-API Full tier's behavior, cost, or defaults —
  `transport.profile: api` remains the unchanged default for every
  existing workspace; this is additive.
- No GitHub Models adapter, no second-seat verification, no change to
  Set 078's explicit single-seat evidence posture. **This set does not
  validate the multi-seat/enterprise scenario it is partly justified by**
  — see *Honesty carried forward* in Session 5. The operator's team seat
  may or may not confirm ≥2 distinct providers; that is unknown until
  someone on that team actually runs the flow, and the docs/UAT must say
  so plainly rather than imply the guided flow guarantees success.
- Feature 2 is copy-only — no change to `VERIFICATION_MODE_DEDICATED` /
  `VERIFICATION_MODE_OUT_OF_BAND` constant *values* (`"dedicated-sessions"`
  / `"out-of-band-or-none"`), schema fields, or gate logic. Only the
  human-facing label/description strings change.

**Design background:** a single routed architecture critique (not the
full two-leg pre-authoring critique Set 078 used) was run before this
spec was finalized, proportionate to this being a well-precedented
extension of an existing UI pattern (the Lightweight verification-mode
sub-choice) — the critique's own conclusion (focus question 7) was that
the *UI shape* is genuinely precedented but the *subprocess/sequencing/
failure-UX* parts are novel and were exactly where the three CRITICAL
findings surfaced. See `architecture-critique.md` for the full review.

---

## Feature 1: Copilot seat-profile onboarding

### Scope

- A new conditional radio group under the **Full** tier radio (parallel
  in UI shape to the existing Lightweight → verification-mode group),
  offering **Direct provider API keys (default)** and **GitHub Copilot
  CLI seat**. Persistence uses the same `tierDirty`-style seed/dirty/
  reload precedence Set 077 established — this part is genuinely
  precedented (critique: "blessed as sound").
- A presence probe for the `copilot` CLI (mirrors
  `pythonInterpreter.ts`'s `probePythonPresenceCore` shape: explicit
  setting → PATH, in that order) surfaced as a step-1 warning when the
  Copilot option is selected but no CLI resolves, with install guidance
  (link to the GitHub Copilot CLI docs) — parallel to `PYTHON_WARNING_TEXT`.
  This probe is cheap (a version check) and *is* legitimately a pre-flight,
  unlike the catalog-refresh below (critique C2's distinction).

#### Seat identity (critique C1 — resolved)

- **`--seat-id` is auto-derived, never operator-typed.** Generate a
  stable, deterministic id from local machine/user identity (e.g. a
  short hash of hostname + OS username), computed at Build time. No text
  field, no validation UI, no new persistence contract — Session 1 stays
  a pure radio-group change with zero new input-field state.
- **`--seat-label` defaults to the workspace folder's basename** (already
  available context at Build time, no new input needed). An operator who
  wants a custom label can still hand-run
  `python -m ai_router.copilot_catalog --refresh --seat-id <id>
  --seat-label <label>` themselves later — the guided flow's job is to
  make the *default* path work with zero typing, not to expose every CLI
  option.

#### Sequencing (critique C2 — resolved)

The catalog-refresh is **not** a pre-flight check — it depends on
`ai_router` already being importable in the scaffolded `.venv`, exactly
the state the existing Build sequence produces *after* venv creation and
`pip install dabbler-ai-router` succeed. The correct order is:

1. Copilot-CLI-presence probe (cheap, genuinely pre-flight — can run
   before any write, same as the Python probe).
2. The existing scaffold sequence runs unchanged: git init, venv
   creation, `pip install dabbler-ai-router`, template rendering, marker
   writes.
3. **Only after step 2 succeeds**, and only if the Copilot sub-choice was
   selected: run the catalog refresh using **the scaffolded venv's own
   interpreter** (not bare `python` — the same interpreter-resolution
   `Dabbler: Install ai-router` already uses to invoke the venv's pip/
   python, reused here, not re-invented).
4. Parse the refresh's result (see *Provider-count check*, below) and
   only then write `transport.profile`.

If the Copilot-CLI presence probe (step 1) fails, the operator is warned
before Build runs at all — mirroring the Python-missing warning exactly
— and the sub-choice cannot proceed (falls back to the API sub-choice
for that Build, same as today's default).

#### Provider-count check (new — the CLI does not fail closed itself)

`copilot_catalog.py --refresh`'s `main()` **always returns exit code 0**,
even when fewer than two distinct providers are confirmed — it only
prints a `WARNING: fewer than 2 distinct providers confirmed...` line to
stderr and still writes the lockfile. The actual fail-closed behavior
lives in `route()`/`verify()` at call time, not in the refresh command.
**The wrapper built in this set must therefore parse the refresh's own
result itself** (either the "providers=[...]" line in stdout, or by
reading the written lockfile's confirmed-provider set) to decide whether
the seat is actually usable — do not treat "exit code 0" as success.

#### Failure UX (critique C3 — resolved)

The prior draft's "fall back to `api`, finish scaffolding, switch later"
story was false comfort for this feature's exact target audience (a
Copilot-locked shop with **no** `DABBLER_*` keys possible under policy) —
`api` is not a usable fallback for them; it is a router that will fail
at the first `route()` call. The corrected failure UX:

- Before offering `api` as if it "still works," **check whether any
  `DABBLER_*` key is actually present** in the environment (the same
  probe the existing Full-tier inline key warning already performs).
  If none are present (the expected case for this audience) and Copilot
  setup failed, say so plainly: *"Scaffold completed, but the Copilot
  seat setup did not — the router is not yet functional. Fix: <reason-
  specific guidance>, then re-run seat setup with `python -m
  ai_router.copilot_catalog --refresh` from the scaffolded `.venv`
  (no need to re-scaffold)."* Do not imply `api` is a working fallback
  when no keys exist.
- If `DABBLER_*` keys **are** present (an operator exploring both paths,
  or a mixed org), `api` genuinely is a working fallback and may be
  offered as such.
- Every failure path (CLI missing after the operator selected Copilot
  anyway, refresh subprocess error, <2-providers warning, refresh-
  succeeds-but-config-write-fails) must land in one of these two honest
  states — never a silent, ambiguous one.

#### Async UX robustness (critique M1 — resolved)

The catalog refresh is a real ~1-2 minute, ~18-call subprocess, not an
instant operation, and it mutates durable state (the lockfile). Use
`vscode.window.withProgress` in the notification area with
`cancellable: true`, and specify explicitly (implement in Session 2):

- **Cancellation:** kill the child process on cancel; delete any partial/
  written lockfile so a cancelled run never leaves a half-written file
  that a later `route()` call might read as valid.
- **Window close / host reload mid-refresh:** register a disposal
  handler that kills the child process when the extension host tears
  down, for the same reason — an orphaned child that finishes after the
  webview is gone must not leave a lockfile with no corresponding
  `transport.profile` write (or vice versa).
- **Two-step non-atomicity:** the refresh and the config write are two
  separate steps; if refresh succeeds but the config write fails (disk
  error, YAML surgery issue), report that specific partial state — do
  not conflate it with "refresh failed."
- **Progress granularity (critique m2):** prefer determinate progress
  ("N of 18 models checked") if the refresh's own output is parseable
  per-call; fall back to indeterminate only if it is not.

#### Config write (critique M4 — resolved)

`router-config.yaml`'s template already renders `transport.profile: api`
as the default — writing `copilot-cli` is a **field replacement**
decided at scaffold-render time, not a post-hoc append (appending a
second `transport.profile:` key would produce invalid/last-wins YAML).
Render `transport.profile` as a template variable at scaffold time
(the same mechanism the tier/verification-mode markers already use),
resolved before the template is written — not a separate YAML-surgery
pass after the fact. Leave `transport.max_invocations_per_session` and
every other `transport:` sub-field at their code defaults; this set does
not add new config surface beyond the one field.

#### CLI contract this set relies on (critique M5 — pin it explicitly)

This set has no `prerequisites:` DAG edge on Set 078 (078 is complete and
published), but it has a real, unversioned **contract dependency** on
078's CLI surface. Pin it here so contract drift is a deliberate,
noticed decision, not a silent break:

- Invocation: `python -m ai_router.copilot_catalog --refresh --seat-id
  <id> --seat-label <label>` (both `--seat-id` and `--refresh` are
  `required=True` per the current argparse definition; `--seat-label`
  defaults to `""` if omitted, but this set always supplies one).
- Exit code: always `0` on a completed probe run, **regardless of
  provider-count outcome** — do not treat exit code as a success signal
  (see *Provider-count check* above).
- Success signal to parse: the CLI's own stdout line, `Wrote <path>:
  <N>/<M> models confirmed, providers=[...]`, and/or the written
  lockfile's confirmed-provider set.
- Fail-closed warning line (stderr, non-fatal to the process):
  `WARNING: fewer than 2 distinct providers confirmed on this seat --
  routed dispatch will fail closed under the copilot-cli profile.`
- A missing `copilot` binary or a subprocess-level failure is *not*
  raised by `copilot_catalog.py` as an uncaught exception in the parts
  reviewed for this spec (`get_cli_version` catches `OSError`/
  `SubprocessError` and returns `None`); confirm this holds for the
  per-model probe path too during Session 2 implementation, and handle
  defensively (catch broadly around the subprocess call) regardless.

### Standards

- Follow the exact webview state-machine conventions Set 077 established
  (`gsState`, `persistGsState`, `restoreGsState`'s seed/dirty precedence)
  for the radio group itself — do not invent a parallel mechanism there.
- The catalog-refresh child process must never block the extension host
  thread; use `withProgress`/async child-process invocation, not a
  synchronous blocking call.
- No new router config is read at Build time beyond the one
  `transport.profile` field — resolved as a template variable, per *Config
  write* above.

---

## Feature 2: Simplified Lightweight verification-mode copy

### Scope

- New copy for `VERIFICATION_MODE_OUT_OF_BAND_TEXT` and
  `VERIFICATION_MODE_DEDICATED_TEXT` in
  `media/session-sets-tree/gettingStartedHtml.js` — plain language, same
  meaning, no schema/behavior change. Draft candidates (finalize in
  Session 4, this is a starting point not a locked string — **verify
  against actual dedicated-mode behavior before locking, critique m3**,
  since "automatic hand-off" may overstate how automatic the dedicated
  flow really is):
  - Out-of-band-or-none: *"Manual review (default) — paste a review
    prompt into a second AI assistant yourself and record what it says."*
  - Dedicated-sessions: *"Separate verification sessions — a dedicated
    session on a different AI engine or provider reviews the work before
    the set can close."*
- Sweep every place the OLD strings are quoted verbatim and update them
  together: `VERIFICATION_MODE_*_TEXT` constants, their pinning tests
  (`gettingStartedHtml.test.ts`), `README.md`, and
  `tools/dabbler-ai-orchestration/README.md` (both quote the current copy
  as of the Set 077 close). Grep for the old strings repo-wide before
  declaring this feature done — do not rely on memory of where they're
  quoted.

### Standards

- The new copy must still make the `(the default)` / equivalent
  distinction clear — Set 077's own UAT walk depended on knowing which
  option is pre-checked.
- Keep both descriptions to roughly the same length as each other (the
  operator's complaint was density/jargon, not length asymmetry).
- Independently landable/revertable from Feature 1 (see *Project
  Overview* release-coupling note).

---

## Sessions

### Session 1 of 5: Copilot CLI presence probe + Full-tier sub-choice UI

**Steps:**
1. Add the `copilot` CLI presence probe (new function, mirrors
   `probePythonPresenceCore`'s shape) and wire it into the same
   `computeGettingStarted` thunk pattern Session 3 of Set 077 used for
   `pythonPresent`.
2. Add the conditional radio group under Full (mirrors the
   `verificationModeBlockHtml` conditional-render pattern under
   Lightweight) with the two options above. No text-input field for
   seat-id/seat-label — those are auto-derived at Build time (Session 2),
   not part of this session's UI.
3. Add the step-1 Copilot-CLI-missing warning (mirrors
   `pythonWarningHtml`), visible only when the Copilot sub-choice is
   selected and the probe fails.
4. Extend `restoreGsState`/`persistGsState`/`gsState` for the new radio
   field only, with the same seed/dirty/reload precedence tests Set 077
   Session 2 wrote for `tierDirty` and Session 3 wrote for
   `verificationModeDirty`.
5. Layer 2 tests for all of the above (new probe, new radio render, new
   persistence contract) — no wiring to Build yet (Sessions 2-3).

**Creates:** probe function + tests, radio-group HTML + tests, state
persistence extension + tests.
**Touches:** `media/session-sets-tree/gettingStartedHtml.js`, `client.js`,
`src/utils/pythonInterpreter.ts` (or a new sibling probe module),
`src/commands/gettingStartedActions.ts`, relevant test files.
**Ends with:** the sub-choice renders, persists across reload, and the
Copilot-missing warning shows/hides correctly — all on the vscode-stub,
no Build wiring yet.
**Progress keys:** `s1.probe`, `s1.radio`, `s1.persistence`, `s1.tests`

---

### Session 2 of 5: Wire the happy path (sequencing, subprocess, progress, config write)

**Steps:**
1. Confirm the existing scaffold sequence's ordering (venv → `pip
   install dabbler-ai-router` → template render) and hook the
   catalog-refresh call strictly *after* that sequence succeeds, using
   the scaffolded venv's own interpreter (reuse the same
   interpreter-resolution `Dabbler: Install ai-router` already uses).
2. Auto-derive `--seat-id` (stable hash of hostname+username) and
   `--seat-label` (workspace folder basename) at Build time — no new UI.
3. Invoke the refresh as an async child process inside
   `vscode.window.withProgress({cancellable: true, ...})`. Implement:
   cancel-kills-child-and-deletes-partial-lockfile; a disposal handler
   that kills the child on extension-host teardown; determinate progress
   if the refresh's own output is parseable per-call, indeterminate
   otherwise.
4. Parse the refresh's actual result (stdout `providers=[...]` line
   and/or the written lockfile) — **do not trust exit code alone**, per
   the pinned CLI contract. On ≥2 confirmed providers, render
   `transport.profile: copilot-cli` as a template variable at scaffold
   time (see *Config write*, Feature 1).
5. Layer 2 tests for the full happy path: sequencing order, seat-id/
   label derivation, progress reporting, and the config write.

**Creates:** seat-id/label derivation, subprocess-invocation wrapper with
cancellation/disposal handling, config-write-as-template-variable, tests.
**Touches:** `src/commands/gitScaffold.ts` (or wherever the Copilot
sub-choice is threaded through), the router-config template, test files.
**Ends with:** a real local run against a genuine Copilot seat produces a
working `transport.profile: copilot-cli` and a real `copilot-catalog.lock`
on the happy path; cancellation and host-teardown mid-refresh leave no
orphaned process or partial lockfile.
**Progress keys:** `s2.sequencing`, `s2.seat-identity`, `s2.subprocess-ux`,
`s2.config-write`, `s2.tests`

---

### Session 3 of 5: Failure matrix, honest failure UX, and E2E judgment

**Steps:**
1. Implement the corrected failure UX (Feature 1 → *Failure UX*): check
   for `DABBLER_*` presence before ever presenting `api` as "still
   works"; the no-keys-and-Copilot-failed case gets the explicit
   "router is not yet functional, here's how to re-run just seat setup"
   messaging.
2. Cover every failure branch: CLI missing after selection (shouldn't
   reach here given Session 1's warning, but defend anyway), subprocess
   error, <2-providers warning, refresh-succeeds-then-config-write-fails.
3. Real induced-failure dogfood: at minimum, one real run where the
   Copilot CLI is temporarily made unavailable (PATH manipulation) or
   the refresh is cancelled mid-run, confirming no orphaned process and
   no partial lockfile.
4. `requiresE2E: suggested` decision point: this session's author judges
   whether a Playwright addition is warranted for the async-progress UI
   specifically, given Layer 2 already covers the logic — record the
   decision and reasoning either way.
5. Layer 2 tests for every failure branch above.

**Creates:** failure-branch handling + tests, one real induced-failure
dogfood record (mirrors Set 078 S4's live-dogfood-evidence pattern).
**Touches:** the same files as Session 2, plus test files.
**Ends with:** every failure path lands in one of the two honest states
defined in Feature 1 → Failure UX; a real dogfooded failure run confirms
no orphaned process, no partial lockfile, no silently-broken router.
**Progress keys:** `s3.failure-ux`, `s3.dogfood`, `s3.e2e-decision`,
`s3.tests`

---

### Session 4 of 5: Simplify verification-mode copy (Feature 2)

**Steps:**
1. Finalize the new copy for both `VERIFICATION_MODE_*_TEXT` constants
   (starting point given above), verifying the "dedicated" description
   against actual dedicated-mode behavior before locking (critique m3 —
   don't overstate automation).
2. Update the constants and every pinning test.
3. Grep repo-wide for the OLD strings (both the full sentences and
   distinctive fragments like "structured verification sessions" /
   "close-out gate" / "copy a review prompt into a second AI assistant")
   and update every hit: both README.md files, any UAT checklist or doc
   that quotes the copy verbatim.
4. Confirm the drift guard and full Layer 2 suite are green.

**Creates:** nothing new — pure edit-in-place.
**Touches:** `media/session-sets-tree/gettingStartedHtml.js`,
`gettingStartedHtml.test.ts`, `README.md`,
`tools/dabbler-ai-orchestration/README.md`, any other file the grep sweep
finds.
**Ends with:** new copy live, zero stale quotes of the old strings
anywhere in the repo (verified by grep, not assumed); independently
shippable even if Sessions 1-3 have not yet released.
**Progress keys:** `s4.copy`, `s4.sweep`, `s4.tests`

---

### Session 5 of 5: Docs, UAT, and release

**Steps:**
1. Update `docs/concepts/tier-model.md`'s "Full tier seat-profile option"
   section to describe the guided in-form setup as the primary path
   (manual `router-config.yaml` editing becomes the documented fallback,
   not the only path).
2. **Honesty carried forward (critique M3).** Explicitly state, in both
   the doc update and the UAT checklist's framing, that this set does
   NOT validate multi-seat or enterprise-seat model availability — Set
   078's evidence base remains a single personal seat. If the operator's
   team's first real run uses a different seat than Set 078's own
   dogfood seat, say so; if it's the same seat, say that too. An
   enterprise-locked seat may expose only one provider family, which
   would fail the ≥2-provider check even though the guided flow "worked."
3. Update both README.md files: the Full-tier onboarding description
   gains the Copilot seat-profile sub-choice (mirroring how Set 077's own
   README pass documented the Lightweight sub-choice), carrying the same
   honesty caveat.
4. Update the auto-opened Getting Started doc and the decomposition
   prompt if either references the tier choice in a way this feature
   changes.
5. Author the UAT checklist to the Set 078 authoring bar established in
   Set 077 Session 6 (literal HumanAction/Expectation, live-dogfooded
   CLI steps for the catalog-refresh wiring, source-re-grounded strings
   for the webview walks) — do not regress to the pre-Set-077 style.
   Cover: the Full/Copilot sub-choice render + persistence, the missing-
   CLI warning, a real catalog-refresh success run (operator has a seat),
   the induced-failure run from Session 3, and the simplified
   verification-mode copy rendering correctly with the right option
   still marked default.
6. Run the required end-of-set path-aware critique.
7. Confirm the non-goals' "zero `ai_router` changes" claim actually held
   (critique m4) — if it didn't, revisit whether this is an
   extension-only release or a coordinated one before bumping versions.
8. Version bump(s), CHANGELOG(s), commit, push, green Test,
   operator-authorized tag push(es).

**Creates:** UAT checklist, `path-aware-critique.json`, `change-log.md`,
release.
**Touches:** `docs/concepts/tier-model.md`, both READMEs, the relevant
CHANGELOG(s), `package.json` (and `pyproject.toml` only if step 7 finds
an actual `ai_router` change).
**Ends with:** UAT attested; release scope confirmed and executed
correctly (extension-only unless step 7 says otherwise).
**Progress keys:** `s5.docs`, `s5.honesty-note`, `s5.uat`, `s5.critique`,
`s5.release`

---

## Cross-set dependencies

No `prerequisites:` entry — Set 078 is complete and published, not
in-progress, so there is no build-DAG edge to declare. There **is** a
real, unversioned CLI-contract dependency on Set 078's
`ai_router/copilot_catalog.py` surface (see Feature 1 → *CLI contract
this set relies on*), which is a read-only coupling, not a scheduling
one.

---

## Anti-patterns avoided

- **Implicit UAT** — declared `requiresUAT: true` since this is
  primarily new interactive webview UI.
- **UAT deferred to a later set** — UAT is Session 5 of *this* set, not
  pushed to a follow-on.
- **Re-using a prior set's UAT checklist** — Session 5 authors a new
  `079-copilot-seat-onboarding-and-verification-copy-uat-checklist.json`
  from scratch.
- **Set too broad / one risky session doing too much** — the critique
  caught the original 4-session cut concentrating all of Feature 1's
  novelty, its one open design question, its failure matrix, and its
  external-seat dependency into a single Session 2; split into Sessions
  2 (happy path) and 3 (failure matrix + dogfood) instead.
