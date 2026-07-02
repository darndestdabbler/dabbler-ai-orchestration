# S1 Review Findings — Set 077 (Comprehensive review baseline and triage)

> Authored by the S1 orchestrator (Claude Code, claude-fable-5) on
> 2026-07-02. This is the structured findings artifact S1's spec requires;
> it consolidates the three-layer baseline, the pinned-finding triage, the
> six routed code-review bundles (`s1-code-review-*.md`, raw and unedited),
> and the owed second planning-critique leg
> (`planning-critique-2-architecture.md`). The spec was amended in this
> session wherever a fold moved scope — every amendment is marked
> "(Critique-2 Mn, folded in S1)" or "(S1 review, bundle X)" in `spec.md`.

---

## 1. Three-layer baseline (conventions block for later verifications)

| Layer | Command | Result |
|---|---|---|
| L1 (pytest) | `python -m pytest` | **2268 passed / 5 skipped / 0 failed** (pre-fix); identical shape re-run green after S1's Python inline fixes |
| L2 (typecheck) | `npx tsc --noEmit` | clean |
| L2 (unit) | `npm run test:unit` (mocha, full glob) | pre-fix **906 passing / 4 failing**; post-fix **910 passing / 0 failing** |
| L3 (Playwright) | `npm run test:playwright` | 18 specs; local parallel run flaked 7 (Electron contention — all 7 pass in isolation/serial re-runs); **CI green on all 3 OSes** at the same commit |

**CI state discovered and repaired in-flight:** the `Test` run for the
set-authoring commit `6fc81da` (run 28569747256) was **RED** — the commit
landed the getting-started template appendix without regenerating the
cold-start golden fixtures, and the "Consumer-bootstrap template snapshot"
job (the only mocha subset CI runs) failed. S1 regenerated the goldens
(`UPDATE_GOLDEN=1`; diff is exactly the 61-line appendix ×2 tiers) and the
Python cold-start acceptance test passes against them. The spec's
"starts from a fully green suite" claim was true for pytest only.

**The other two L2 failures were standing local-only rot** (the full mocha
glob is not part of any CI job — the L-064-12 pattern): a missing
`ViewColumn`/`createWebviewPanel` surface in `vscode-stub.js` (the
configEditor panel-lifecycle test died on TypeError before asserting), and
a stale `notificationsSection` assertion still expecting the pre-Set-026-S7
disabled placeholder button. Both fixed inline.

## 2. Pinned-finding triage (A1–A12): all CONFIRMED

| # | Verdict | Evidence (verified directly by the orchestrator, corroborated by bundles) |
|---|---|---|
| A1 | CONFIRMED (one leg re-characterized) | `client.js:45` in-memory `gsState` `tier:"full"`; zero `setState`/`getState` in `client.js`; `extension.ts:121` registration without `retainContextWhenHidden`; `gettingStartedHtml.js:233-234` derives the checked radio from `controls.tier` on every render. **Re-characterization (bundle A):** the "fabricated rationale" leg is imprecise — `tierGuidance` is gated on `options.tier` being defined, so the fallback path emits Full exemplars with **no** tier guidance at all (silently steering the planner to Full), not a fabricated "per the operator's selection" sentence. The fix direction (S2 marker-first truth chain) is unchanged. |
| A2 | CONFIRMED | Three prompt builders (`copyPromptCommands.ts:87-161`) instruct flagging in chat only; `externalVerification.ts:38-57` writes `""` by design ("intentionally free-form — no templated header"); no prompt references the artifact path. |
| A3 | CONFIRMED + **ENLARGED** | Gate keys off `getattr(args, "no_router", False)` (`close_session.py:1657`). Root cause (bundle D, Critical): `main()` calls `resolve_no_router_mode(...)` and **discards the return value**, so all **three** `no_router` branches in `run()` (soft gate, manual attestation, `method="manual"`) are dead for spec/env-activated Lightweight sets. Folded into Feature 3 / S4 step 3. |
| A4 | CONFIRMED | `os.path.exists` only (`close_session.py:1661`); empty file passes. |
| A5 | CONFIRMED (absence) | No pending/owed/`derive_workflow_state` reference anywhere in `start_session.py`; the only verification-aware code is `_capture_verification_mode` (records, never audits). |
| A6 | CONFIRMED | `validate_dedicated_verification` unpacks `v_engine, _v_provider = _engine_provider(vs)` and discards the provider; comparison is engine-set-only. Fail-closed no-baseline posture already present. Bundle E supplies the tuple-comparison design detail (engine-only fallback when provider absent on the verification session but engine differs) — S5 input. |
| A7 | CONFIRMED | `fileSystem.ts` parses `verificationMode` from the spec config block only; `readSessionSets` feeds it to `verificationMarkerFor`. Three downstream gates key on it (bundle B): `kickoffEligible`, `setupVerificationEligible` (ActionRegistry ~88/~97), and the `v?` marker — all can disagree with the durable record after a failed seed-alignment. Python's `read_verification_mode` reads activity-log only (bundle E) — the TS mirror is exactly the S5 fix. |
| A8 | CONFIRMED | Both gates fire independently on a `--no-router` + `dedicated-sessions` terminal close, with **contradictory correctives** ("paste a reply here" vs "run a typed session"). |
| A9 | CONFIRMED | `buildVerificationKickoffPrompt` = 6-step inline procedure (~35 lines) while the Evaluate prompts (~10 lines) omit the artifact instruction. |
| A10 | CONFIRMED | `resolveExplicitPythonPath` returns bare `"python"`, no existence check (`pythonInterpreter.ts:93-96`); D6 probe covers provider keys only. |
| A11 | CONFIRMED (all four) | `asTier` exact-match narrowing (`gitScaffold.ts:153-156`; the default-to-full happens at `?? "full"` call sites); `consumerBootstrap.ts:478` hardcodes `verificationMode: DEFAULT_VERIFICATION_MODE`; `switchTier.ts` writes `set.specPath` (line 72) while the guardrail probes `set.root` (lines ~88-89); `budget`/`zeroMethod` share the `gsState` persistence gap. |
| A12 | CONFIRMED | `ensure_session_state_file` → `_backfill_payload` gates on `os.path.isfile(activity-log.json)` only; `_earliest_activity_log_timestamp` (None for empty entries) is used only for `startedAt`, not classification. Fix direction (entries-length check) validated by bundle F, with the nuance that legacy logs with entries but no `dateTime` must still classify in-progress. |

**Hard-confirm (S1 gate for the A6/S5 plan):** `orchestrator.provider` IS
persisted per session by all three writers (`register_session_start`
~837-838, `register_typed_session_start` ~1004-1005,
`register_typed_session_handoff` ~1211-1212), omit-null. CLI: `--engine`
required, `--provider` optional (default None ⇒ key absent). Consequence:
S5's missing-provider-fails-the-provider-arm-closed design is **required**,
and legacy null-provider baselines keep the engine-difference arm as their
fallback (Critique-2 M5, folded). **S5's scope does not grow to record
provider — it is already recorded when declared.**

## 3. Owed second critique leg — discharged

`planning-critique-2-architecture.md` (GPT-5.4, `task_type: architecture`,
$0.34, raw). Verdict **SOUND-WITH-CHANGES**; 7 material findings, all
adjudicated and folded into `spec.md` in this session:

| Finding | Disposition |
|---|---|
| M1 three-way choice has no durable schema | FOLDED — `.dabbler/verification-mode` sibling marker, owned by S2's helper (Feature 1 + S2 step 2) |
| M2 marker truth not kept aligned | FOLDED — marker is a write-through cache on sanctioned paths (`switchTier` updates it, S2 step 4); advisory covers manual edits |
| M3 opt-out state not representable | FOLDED — verdict grammar gains `WAIVED` (+reason); banner derives opt-out from the latest round (Features 3+4) |
| M4 artifact needs round semantics | FOLDED — parser returns `(round, verdict, outstanding)`; latest dated round wins; gate + banner share it (Feature 3) |
| M5 legacy null-provider brittleness | FOLDED — explicit legacy posture + corrective message naming both remedies (Feature 5) |
| M6 mixed-version release skew | FOLDED — extension surfaces the >=0.27.0 router need gracefully; S6 UAT walks one mixed-version case |
| M7 fail-before-durable-writes | FOLDED — Python pre-flight is the first side-effect-free step; no-artifacts-on-failure regression test (Feature 2 + S3 step 2) |
| Nits (6) | Recorded; the shared-fixture-corpus nit is satisfied by S5 step 2's fixture coverage; the "open the canonical doc alongside the prompt" nit is an S4 option; the rest are noted, no scope change |

## 4. Routed code-review results (bundles A–F, raw in `s1-code-review-*.md`)

All six bundles: model sonnet (tier 2), auto-verified by gemini-pro,
zero truncation. Total routed cost this session ≈ **$1.58–$1.90** incl.
verifiers (see cost report at close).

### Fixed inline in S1 (mechanical, <50 lines each, all suites green after)

| Fix | File(s) | Source |
|---|---|---|
| Regenerated cold-start golden fixtures (CI red repaired) | `test-fixtures/cold-start/**` | baseline |
| `ViewColumn` enum + `createWebviewPanel` fake in the vscode stub | `src/test/vscode-stub.js` | baseline rot |
| Stale disabled-button assertion updated to post-Set-026-S7 reality | `src/test/suite/notificationsSection.test.ts` | baseline rot |
| try/catch + actionable error around `mkdirSync`/`copyFileSync` | `src/wizard/planImport.ts` | bundle A [Major] |
| Set-dir quoting in both kickoff-prompt command lines (+ test expectation) | `src/commands/copyPromptCommands.ts`, its test | bundle A [Major] |
| CSP nonce → `crypto.randomBytes(16)` | `src/providers/CustomSessionSetsView.ts` | bundle B [Major] |
| Case-sensitive dedup key on non-win32/darwin in `discoverRoots` | `src/utils/fileSystem.ts` | bundle B verifier [Major] |
| `Number.isInteger + > 0` guard in `countDistinctCloseoutSessions` | `src/utils/fileSystem.ts` | bundle B [Minor] |
| Dead `r === null` branch removed; inner `ledgerSessions` shadow renamed | `src/utils/fileSystem.ts` | bundle B [Minor] |
| `void` on three floating dialog promises | `src/wizard/sessionGenPrompt.ts` | bundle A [Minor] |
| Dead try/catch around `fs.existsSync` removed | `src/commands/copyPromptCommands.ts` | bundle A [Minor] |
| Lazy-import bare→relative fallback in `is_no_router_mode` (pip-install mode returned False silently) | `ai_router/runtime_mode.py` | bundle C [Major] |
| `UnicodeError` sibling-site closure ×3 (L-069-1 class re-opening) | `ai_router/dedicated_verification.py` | bundle E [Major] |

### Folded into S2–S5 (spec amended in place)

| Item | Session | Source |
|---|---|---|
| `resolve_no_router_mode` return-value capture + thread through all 3 `no_router` branches (A3 root cause) | S4 (Feature 3 gate-correctness, enlarged) | bundle D [Critical] |
| `RESULT_TO_EXIT_CODE["aborted_at_soft_gate"]` + docstring; TOCTOU `_is_already_closed` re-check inside lock; `_close_is_terminal` compute-once; corrective guidance before the interactive `[y/N]` | S4 step 3 | bundle D [Major]×3 + [Minor] |
| `session_state.py` atomic-write class (4 boundary writers + 2 helpers) **with** Windows `os.replace` retry; `read_raw_session_state` → `(FileNotFoundError, JSONDecodeError)`; writer-level re-open refuse; backfill TOCTOU re-check; `_finalize` `max()` not `len()` | S4 step 5 (secondary; defer-with-reason allowed) | bundle F [Major]×3 + [Minor]×2 + F-verifier [Major] |
| `_write_json_atomic` extraction; `seed_issues_envelope` + Gate-3 minimal-log atomic writes (envelope stub is entombed by the `FileExistsError` guard); corrective path quoting; `derive_state` blank-verdict ambiguity adjudication | S5 step 6 (secondary) | bundle E [Critical] + E-verifier [Major] + [Minor]s |
| Typed-session paths missing `_capture_path_aware_critique` / `_capture_contract_gate` (handoff also missing `_capture_verification_mode`) | S5 step 1 | bundle C [Major] |
| A6 tuple-comparison design (engine-only fallback when verification session lacks provider but engine differs; distinguish "no work sessions" from "providers unrecorded" in the corrective) | S5 step 1 | bundle E [Major] |
| `SessionSetsModel.progressText` missing `plusFraction` `+` suffix | S5 step 4 | bundle B [Minor] |
| `client.js` innerHTML sink audit for set names (webview XSS surface with `enableCommandUris: true`) | S2 step 4 | bundle B hardening |
| Review-prompt size guard on `docs/review-criteria/*` embed; cost-hint staleness in the copy toast | S4 / S3 copy work (incidental) | bundle A [Minor]×2 |
| Python-existence pre-check before `cp.spawn` in `setupVerification.runChangeWriter` | S3 step 2 (A10 family) | bundle A hardening |

### Refuted / false positives (no action)

| Claim | Why refuted | Refuted by |
|---|---|---|
| [Critical] plan-less `view.total_sessions > 0` TypeError in `start_session` | `ProgressView.total_sessions` is always `len(sessions)` (int); plan-less states raise rule-1 inside `read_progress` and are caught to `view=None` (`start_session.py:672-674`) — the nullable field is the shim dict's `totalSessions`, not the dataclass's | orchestrator (code) |
| [Major] `*_record_unreadable` warnings fire for absent `activity-log.json` | The predicate returns `False` on an absent file by documented design; it fires only on existing-but-corrupt files (which is the intended loud-warning case even at level `none`) | orchestrator (code) |
| [Minor] `_run_repair` Case 4 lacks `not case1_drift` guard | Case 1 requires `state_says_closed`, Case 4 requires `not state_says_closed` — mutually exclusive | bundle D auto-verifier |
| Hardening: `importPlanFromFile` should route `vscode.Uri.file` through the `ui` abstraction | `Uri.file` is a pure data constructor; the abstraction mocks host interactions — no testability gap | bundle A auto-verifier |

### Deferred with reason

| Item | Reason |
|---|---|
| `record_verification_mode` read/append/write TOCTOU (bundle E [Minor]) | Guarded by `has_verification_mode_record` once-at-set-start in production; document single-writer assumption instead of adding a lock; revisit if parallel `start_session` on one set becomes a real flow |
| Double filesystem scan on null cache in `showContextMenu` (bundle B [Minor]) | Perf-only, no correctness impact; the S5 Explorer session may pick it up incidentally |
| `'unsafe-inline'` in webview `style-src` (bundle B hardening) | Needs webview regression coverage to remove safely; not in this set's critical path — candidate for a future CSP-review pass |
| Sync `fs.*` scanning on the extension host thread (bundle B hardening) | Architecture change (async scan + debounce); out of this set's scope |
| `_infer_next_session` dead code + `closed` vs `closed_set` inconsistency (bundle C [Minor]×2), `_derive_legacy_fields` dead code + duplicate status constants (bundle F [Minor]×2) | Dead-code/consistency hygiene with no runtime effect; batch into a future hygiene pass rather than churning S1's diff further |
| `--total-sessions 0` silent fall-through (bundle C [Minor]) | Behavior change needing a usage-error decision; note left here for a future stability set |
| `--force` + `--no-router` incompatibility check (bundle D [Minor]) | Interaction semantics need an operator decision (which flag wins); S4 may address if adjacent |

## 5. S2–S5 scope confirmation

- **S2** stands, plus: verification-mode marker joins the helper contract
  (M1), `switchTier` write-through (M2), `client.js` innerHTML audit.
- **S3** stands, plus: pre-flight ordered before any durable write with a
  no-artifact regression test (M7); `setupVerification` spawn pre-check.
- **S4** stands, plus: the enlarged A3 fix (resolved-mode threading), the
  close_session mechanical hardening batch, the parser round-semantics +
  `WAIVED` grammar (M3/M4), and the secondary session_state robustness
  class (defer-with-reason allowed).
- **S5** stands, plus: typed-path capture calls, legacy-provider posture
  (M5), dedicated_verification atomic writes + `derive_state` ambiguity
  (secondary), `progressText` suffix, version-skew message (M6).
- **S6** stands, plus one mixed-version UAT case (M6). `VSCE_PAT` renewal
  and `metadata.pricing_reviewed` refresh (warning observed live at every
  S1 router call) remain S6 operator items.

## 6. Baseline for the next verification round

Suite state at S1 close: pytest 2268/5/0 expected green (post-fix run
below), tsc clean, mocha 910/0, Playwright CI-green (local parallel runs
flake on Electron contention — run serially or per-spec locally). Release
contract: nothing bumped in S1; extension 0.33.1 / router 0.26.2 pending
S6's 0.34.0 / 0.27.0. By-design exclusions: S1 ships review artifacts,
inline mechanical fixes, and spec amendments only — no feature work.
