**Verdict up front:** Not ready to start Session 1. Three CRITICALs turn on the *same underlying gap* — the spec models the catalog-refresh as if it were a cheap pre-flight check (like the Python probe) when it is actually a heavy, install-dependent, quota-burning subprocess whose only viable audience cannot fall back to `api`. Resolve those before any UI/state is designed. The radio/persistence/copy work is genuinely sound and well-precedented.

---

## CRITICAL — resolve before Session 1

### C1. Seat-id / seat-label mechanism is load-bearing on Session 1 but deferred to Session 2
**Issue.** Session 2 step 3 calls seat-id "the one genuinely open design question" and defers it. But the answer determines Session 1's deliverables: if the operator is *prompted inline*, Session 1 must render, persist (`gsState`/`restoreGsState`), and test a **text field** — which is *not* the already-proven radio pattern (no validation, no free-text precedent in the tier/verification-mode work). If it's a build-time `showInputBox` or auto-generated, Session 1's UI is untouched. You cannot design Session 1's state machine without this. Separately, `--seat-label` is required by the real command (`--seat-id <id> --seat-label <label>`) but is *never* addressed in the "prompt or auto-generate" framing — its origin is fully unspecified.
**Location.** Feature 1 Scope step 2; Session 1 step 4; Session 2 step 3.
**Fix.** Decide the *mechanism* now (recommend build-time `showInputBox` or auto-gen so Session 1 stays a pure radio-group change). Specify seat-label origin. The exact auto-gen algorithm can still be a Session 2 detail; the surface shape cannot.

### C2. Catalog-refresh is not a pre-flight; it consumes the scaffold's output, so the stated ordering invariant is impossible
**Issue.** `python -m ai_router.copilot_catalog --refresh` requires `ai_router` **already installed in the scaffolded venv**. Yet the spec asserts the refresh runs as a "pre-flight, before any durable write, the same ordering invariant `buildProjectStructureNoPrompt` already enforces for the Python probe." That analogy is wrong: the Python probe is a cheap presence check; the refresh is a 1–2 min operation that *depends on* the venv + `ai_router` install having already happened. The spec's Session 2 sequence (copilot-CLI probe → refresh → write config) never establishes that scaffold/venv/install precede the refresh. If the operator hasn't installed `ai_router`, the "happy path" dies with `ModuleNotFoundError`, gets surfaced "verbatim" as a "friendly" failure, and silently falls to `api`. Also: the command uses bare `python`, but it must be the *venv* interpreter where `ai_router` lives — a second interpreter-resolution the pre-flight doesn't cover.
**Location.** Feature 1 Scope steps 1–3; Session 2 step 1.
**Fix.** Make the real dependency chain explicit: scaffold → venv → `ai_router` install → *then* catalog-refresh → *then* config write. Drop the "mirrors the Python pre-flight ordering" claim; the durable writes (venv/install) are a **prerequisite** of the refresh, not something the refresh precedes. Pin which interpreter runs it.

### C3. The "fall back to `api`, finish scaffolding, switch later" failure story is incoherent (and dishonest) for the only audience this feature serves
**Issue.** Set 078's audience is shops where "no `DABBLER_*` key is possible." The `api` profile *is* the direct-HTTPS path that requires those keys. So when Copilot setup fails and the spec "leaves `transport.profile` at the default `api` and lets the rest of the scaffold complete," the exact target operator is left with a **non-functional router** — a Full tier on `api` with zero provider keys will fail at first `route()`. Telling them they "can still finish scaffolding on the `api` profile and switch later" is false comfort: there is nothing usable to finish, and this directly undercuts Set 078's stated "presented honestly / degraded guarantees" ethos.
**Location.** Feature 1 Scope step 4; Session 2 step 2.
**Fix.** Reframe the failure UX to tell the truth: "Scaffold completed, but the Copilot seat setup did not — the router is **not yet functional**; re-run seat setup before routing." Before silently landing `api`, check for `DABBLER_*` presence and warn if absent. Consider whether `api` should be offered as a fallback *at all* for an operator who explicitly chose Copilot. This also affects Session 1's radio/warning copy, so it must be settled now.

---

## MAJOR — resolve at/before the relevant session

### M1. Async UX robustness is under-designed for a 1–2 min, state-mutating, gating subprocess
**Issue.** "An indeterminate progress notification is sufficient" ignores: (a) **cancellation** — operators *will* cancel a 2-min bar; kill the child? leave a partial `copilot-catalog.lock`? (b) **window close / reload mid-refresh** — the extension host is torn down; the child is orphaned (may finish and write a valid lock) while the config write never happens → **valid lockfile + `api` profile**, a silent contradiction; (c) **two-step non-atomicity** — refresh-succeeds-then-config-write-fails is unhandled (the failure matrix only covers refresh failing); (d) **partial lockfile cleanup** — does `--refresh` overwrite a corrupt/partial lock, or does stale state persist for a later manual `copilot-cli` switch?
**Location.** Feature 1 Scope steps 2–4; Session 2 steps 1–2.
**Fix.** Specify: cancellation semantics (kill + clean partial lock), dispose/reload handling (kill child on host teardown), the refresh-then-write atomicity gap, and lockfile-cleanup-on-failure. Prefer `withProgress` in the notification area with `cancellable: true` over a fire-and-forget toast.

### M2. Session 2 is ~two sessions of work and concentrates all the risk
**Issue.** Session 2 carries: novel subprocess wiring + progress + cancellation/reload/orphan handling, the config-write, the full failure matrix, the seat-id design decision, a real-seat dogfood, *and* the E2E judgment call. Sessions 1, 3, 4 are precedented/mechanical; Session 2 is the entire hard core of the set. The spec itself admits it holds "the one genuinely open design question." Overloading the one risky session with the open question and the external seat dependency is a scheduling trap.
**Location.** Session 2.
**Fix.** Pull the seat-id decision out to pre-Session-1 (see C1). Split the remainder: 2a = subprocess wiring + progress/cancel/reload + config-write (atomic); 2b = failure matrix + real-seat dogfood + E2E decision.

### M3. Building team onboarding on a single-personal-seat evidence base — the justification depends on a scenario Set 078 explicitly did not validate
**Issue.** The Purpose justifies the set by "the operator's own team needs it (they are Copilot-locked and will use this path)" — i.e., **multiple seats**. But Set 078's recorded posture is single operator, single personal seat, with "a second, representative target-team seat and a GitHub Models enterprise-availability check … never completed [and] dropped … by an explicit operator override." Enterprise seats are precisely where the ≥2-distinct-providers fail-closed rule is most likely to trip (a locked-down enterprise seat may expose only one provider family), which — combined with C3 — means the whole target team could hit friendly-failure into a DOA `api` config. The spec's non-goal "no change to Set 078's single-seat evidence posture" does not absolve the docs/UAT from carrying that limitation forward.
**Location.** Purpose; Non-goals; Session 4 steps 1–2, 4.
**Fix.** Session 4 must carry Set 078's honesty forward verbatim (multi-seat + enterprise-availability unvalidated) into `tier-model.md` and the READMEs, and add an explicit risk note that enterprise seat model-availability determines whether onboarding succeeds. Confirm the Session 2 dogfood seat is representative — if it's the *same* personal seat as 078, say so; it does not close the team gap.

### M4. The config write is a *replace*, not the "additive field write" the spec claims
**Issue.** `router-config.yaml`'s template must already carry `transport.profile: api` (that's the documented default). Writing `copilot-cli` is therefore a **field replacement** or a template-variable choice — not an append. Appending a second `transport.profile` yields invalid/last-wins YAML. Calling it "an additional field write, not a new file" understates the correctness requirement.
**Location.** Feature 1 Scope step 3; Standards; Session 2 step 1.
**Fix.** Decide: render the profile as a template variable at scaffold time (clean, preferred) vs. post-write YAML surgery (must locate-and-replace, preserve comments/structure). Confirm whether `transport.max_invocations_per_session` should also be written or left to the code default.

### M5. Real CLI-contract coupling to Set 078 despite "no DAG edge"
**Issue.** "Cross-set dependencies: None declared" is defensible for the build DAG, but Set 079 hard-depends on Set 078's *unversioned CLI contract*: arg names (`--seat-id`/`--seat-label`), exit codes, and stderr text (which you plan to surface "verbatim" and to distinguish the `<2 providers` case from a generic error). If that contract drifts, the wiring silently breaks.
**Location.** Cross-set dependencies; Session 2 step 2.
**Fix.** Pin the exact CLI contract (args, exit codes, the fail-closed message you parse) relied upon, and note it as a read-only contract dependency even without a `prerequisites:` entry.

---

## MINOR — resolve during the relevant session

- **m1. "Show the real error verbatim" vs "fail friendly."** Raw Python stderr/tracebacks are not friendly. Ensure at minimum the `<2-providers` fail-closed message is operator-legible; wrap unknown errors. *(Session 2)*
- **m2. Prefer determinate progress.** If `--refresh` emits parseable per-call output (18 calls), show "N of 18" rather than an indeterminate spinner — directly addresses the "must not read as a hang" requirement. *(Session 2)*
- **m3. Feature 2 copy accuracy.** "Automatic hand-off" may overstate automation if the dedicated mode still requires operator action. Standards say "same meaning, no behavior change" — verify against actual dedicated-mode behavior before locking. *(Session 3)*
- **m4. Release-scope ambiguity.** The "thin CLI-invocation wrapper" plus the hedge "core logic … not touched" leaves room for non-core Python edits. Confirm the wrapper is extension-side TS and that *zero* `ai_router` code changes, else Session 4's "extension-only" release is wrong. *(Session 4, but confirm early)*
- **m5. Onboarding burns unmeterable premium quota.** ~18 real premium requests per refresh, un-metered (Set 078), multiplied by every re-run on failure and every team member. The "just re-run" failure advice compounds it. Note it and minimize needless re-runs. *(Session 2 / docs)*
- **m6. Feature 1 + Feature 2 bundling = release coupling, not code coupling.** They share one file but no logic; the risk is that a trivial, shippable copy fix (F2) is held hostage by a risky feature (F1). Acceptable as bundled, but keep F2 (Session 3) independently landable/revertable if F1 stalls. *(planning)*

---

## Blessed as sound

- Reusing Set 077's `gsState`/`persistGsState`/`restoreGsState` seed/dirty precedence and the `verificationModeBlockHtml` conditional-render pattern **for the radio group** — genuinely well-precedented (the caveat is only if seat-id becomes an inline field; see C1).
- `requiresUAT: true`, UAT in-set (Session 4, not deferred), fresh checklist authored from scratch — correct anti-pattern avoidance, correctly justified.
- Feature 2's grep-sweep discipline (grep distinctive fragments repo-wide, don't rely on memory, verify by grep not assumption) — exactly right for a copy change with verbatim quotes in tests/READMEs.
- Treating Set 078's `route()`/`verify()`/fail-closed logic as strictly read-only, and respecting the ≥2-providers rule rather than re-implementing it — correct scoping (modulo pinning the contract, M5).
- The non-goals list is clear and mostly correct.

---

## Direct answers to your 7 focus questions

| # | Question | Answer |
|---|----------|--------|
| 1 | Indeterminate notification sufficient? | **No.** Under-designed — cancellation, window-close/reload orphaning, two-step non-atomicity, partial-lock cleanup all unhandled. See C2, M1. |
| 2 | Defer seat-id to Session 2? | **No — decide the mechanism now.** Inline-field vs build-time prompt vs auto-gen changes Session 1's UI/state/tests. seat-label is entirely unspecified. See C1. |
| 3 | Bundle F1+F2? | **Acceptable** — minimal code coupling (shared file, different constants). Real risk is **release coupling**: keep F2 extractable if F1 stalls. See m6. |
| 4 | Is the failure design safe? | **No.** The `api` fallback is DOA for the keyless target audience (C3), and the refresh-succeeds-then-write-fails / orphaned-child / partial-lock states are unhandled (M1). |
| 5 | Conflicts with Set 078? | **Fail-closed rules are respected (blessed).** But the set operationalizes a team/multi-seat/enterprise path Set 078 explicitly left unvalidated (M3), and the `api`-fallback breaks 078's honesty posture (C3). Confirm circuit-breaker write + CLI contract (M4/M5, m5). |
| 6 | Is 4 sessions the right cut? | **No — Session 2 is ~two sessions** and holds all the novelty, the open question, the failure matrix, and the external seat dependency. Split it. See M2. |
| 7 | Asserted-settled-but-actually-open? | seat-id/label (C1), pre-flight ordering + install dependency (C2), `api`-fallback safety (C3), "additive field write" (M4), release scope (m4), and the "well-precedented, so a lighter single critique sufficed" framing — the novel parts (subprocess UX, install sequencing, keyless fallback, multi-seat) were *not* precedented, which is likely why C1–C3 survived to this draft. |