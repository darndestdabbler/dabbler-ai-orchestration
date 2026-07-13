# Changelog — `dabbler-ai-router`

All notable changes to the `ai_router` Python package are documented
here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.33.0] — Unreleased (Set 096 — consequence-graded severity + the phased verification loop)

> Makes the Set 095 verification-churn fix durable and framework-level.
> Evidence: Set 095's loop (17 non-converging rounds / 39 fresh Majors under
> the ungraded prompt; VERIFIED on the first round graded by the operator's
> consequence rubric, replicated), the Set 096 S1 fan-out experiment
> (same-model pairwise finding overlap Jaccard 0.13–0.31 → K=2 harvests
> ~81% of the observable pool vs ~50% for one call), and the S2 convergence
> replay (the frozen 095 corpus through the phased loop end-to-end: 4
> rounds / $0.85 / VERIFIED with 6/6 fix verdicts accepted, vs the 095
> baseline's 17 non-converging rounds / $4.88 — the set's falsifier).
> The replay demonstrates the loop's SHAPE — bounded convergence, up-front
> harvest, fix-delta scoping — on the remediated 095 corpus and its latent
> findings; it is NOT a defect-for-defect A/B against the original
> 39-Major workload (the memo's qualifications section states the
> comparison's limits:
> `docs/session-sets/096-consequence-graded-phased-verification/s2-convergence-replay.md`).
> Publish stays operator-gated.

### Added

- **(Set 096 S2) The phased verification loop: `verify_session --phase
  discovery | supplementary | remediation-review`.** Omitting `--phase`
  keeps the classic single-call behavior byte-for-byte (compat); every
  phase framing rides in the Original Task slot, so the canonical template
  file — and the Set 084 F3 template pin — stay untouched.
  - `--phase discovery` (INITIAL_DISCOVERY): exhaustive-enumeration
    framing at ALL severities, fanned out `verification.discovery.fan_out`
    ways (default 2, clamped to [1, 4]; the S1-measured sizing) with
    byte-identical bundles and per-call stamps/artifacts (call 1 owns the
    canonical round artifact; call k writes the `-fanout-<k>` sibling,
    invisible to the round counter). Finding sets merge into ONE round
    envelope (per-issue `discoveryCall`); the merged verdict token is
    ISSUES_FOUND when any call said so; blocking classification runs on
    the merged set. Sibling-call failures and truncations degrade LOUDLY
    to a reduced fan-out (call 1 keeps the existing hard exits). The
    round records a `discoveryBaselineTree` working-tree snapshot (tracked
    + untracked, via a throwaway index) for the later fix-delta review.
  - `--phase supplementary` (SUPPLEMENTARY_DISCOVERY, run BEFORE any
    remediation when discovery found Critical/Major): a completeness-critic
    pass over the SAME evidence, fed the prior rounds' findings with a
    do-not-re-report instruction (prompt decorrelation — the S1-measured
    default; it replaces the auto-ledger for this round, whose re-raise
    framing would contradict it). With
    `verification.discovery.provider_diversity: cross-provider`, the
    round-1 verifier's provider (resolved from the metrics log via the
    registry) is ALSO excluded as a *preference* — degrading loudly to the
    base orchestrator-only exclusion when nothing survives, and failing
    open on unresolvable round-1 identity.
  - `--phase remediation-review`: the evidence is the FIX DELTA ONLY — a
    tree-to-tree diff from the recorded discovery baseline to a fresh
    working-tree snapshot (tree-to-tree so files added during remediation
    appear with content instead of reading as deleted) — plus the
    auto-assembled ledger. Per-finding verdicts `fix-accepted /
    fix-rejected / accepted-with-modification` are requested by the
    framing and parsed tolerantly (`verification.parse_fix_verdicts`,
    observability-only — blocking still reads the re-stated Issue blocks)
    into the envelope's `fixVerdicts`. New defects are admissible only
    within the fix hunks; refusal (fail-closed) when no prior round
    recorded a baseline.
  - Phased rounds default to `complexity_hint=85` (an explicit
    `--complexity-hint` always wins); phase-aware next-action text walks
    the loop (supplementary before remediation; ≤2 remediation-review
    cycles before operator adjudication).
  - **Hardening from this session's own phased verification round**
    (the loop dogfooding itself): the merged verdict fails CLOSED
    (VERIFIED only when every call's token is exactly VERIFIED); a
    blocking call whose findings do not parse synthesizes an
    unknown-severity finding so the envelope (and the fix-delta
    baseline) always exist; an explicit `fix-rejected` verdict is
    blocking evidence even without a restated Issue block
    (anti-laundering); **fix-verdict coverage is machine-checked** —
    the auto-ledger numbers every blocking finding (`ledger id: L1..Ln`,
    deterministic over the immutable envelopes), the framing requires
    one `Fix verdict: L<n> ...` line per NON-EXEMPT id, and a missing id
    (or an id-less under-count) escalates an otherwise-clean round to
    blocking instead of warning — while an id a prior review cycle
    already fix-accepted renders EXEMPT and drops out of the required
    set, so a growing ledger never demands redundant re-verdicts of
    already-validated points; phased evidence excludes the set's own loop
    bookkeeping (`WORK_DIFF_SET_BOOKKEEPING`, disclosed — the fix delta
    stays fixes-only and the classic path is untouched); a CLEAN
    supplementary round patches the SESSION disposition ISSUES_FOUND
    (exit 4) while prior discovery blockers stand — a fresh stamped
    VERIFIED row from the critic pass can never settle a close over
    unremediated Majors; and the remediation-review next-action
    SUSPENDS to the operator at the 2-cycle bound instead of printing
    another re-run command.
- **(Set 096 S2) Config: `verification.discovery` block** in
  `router-config.yaml` — `fan_out: 2`, `provider_diversity: same-model`,
  seeded verbatim from the S1 experiment memo and documented inline;
  `load_discovery_phase_config` fails open to those defaults on any
  malformed value.
- **(Set 096 S2) Envelope machinery fields** (omit-null, tolerant readers;
  `schemaVersion` unchanged): envelope-level `phase`,
  `discoveryBaselineTree`, `fixVerdicts`; per-issue `discoveryCall`.
  `docs/session-issues.schema.json` + `docs/session-issues-schema.md`
  extended in parity (L-066-1).

### Changed

- **(Set 096 S2) Step 6/7 loop policy restructured around the phases.**
  `docs/ai-led-session-workflow.md` Step 6 gained *The phased loop (Set
  096)* — the default Full-tier procedure with bounded totals (≤2
  discovery passes; ≤2 remediation-review cycles, then operator
  adjudication); the Materiality discipline's ledger item now describes
  the auto-assembled settlement-evidence ledger; Step 7's blocking flow
  runs supplementary-before-remediation and reviews the fix delta. The
  severity gate and the operator's round-cap authority are preserved
  verbatim; the classic path keeps the max-2-automatic-rounds rule and
  the Lightweight Mode-B loop keeps its 1–2 automatic / 3+ human bound.
  Echo sweep (L-065-1): overview diagram, `docs/session-constitution.md`
  Step 6/7 + Recovery bounded-round language,
  `docs/verification-surface-strategy.md` Set-071 recap note.

- **(Set 096) The verification template grades severity by EXPECTED
  CONSEQUENCE.** `ai_router/prompt-templates/verification.md`'s "Severity
  anchoring" section now carries the operator's consequence rubric (L-095-1,
  2026-07-12): severity = probability the stated failure scenario materializes
  for a real user × material impact on the deliverable's objectives;
  low-probability OR low-impact = Minor even when technically correct; **a
  finding with no stated, plausible failure scenario is Minor by definition**.
  Every blocking Issue must now carry a mandatory **`Failure scenario:`** line
  with a probability justification. The merge-decision anchor and the
  anti-laundering escalation are preserved, subordinated to (and scoped by)
  the rubric; the adversarial framing, materiality triad, and NITS grammar are
  untouched. Template version bumped: `TEMPLATE_ID = session-verification-v3`,
  new pinned hash in `TEMPLATE_HASHES` (v1/v2 retained for historical rows).
- **(Set 096) The parser recognizes the optional `failureScenario` field.**
  `parse_verification_response` tolerantly extracts the `Failure scenario:`
  line of an Issue block into `issue["failureScenario"]`; the field flows
  verbatim into `sN-issues*.json` (schema + doc updated, both schema versions,
  additive). `classify_blocking` semantics are unchanged by design.
- **(Set 096) The cross-round settled-points ledger is now machinery.**
  `verify_session` auto-assembles the ledger from prior rounds' immutable
  `sN-issues*.json` plus a new per-round orchestrator remediation-note sidecar
  (`sN-remediation-round-<R>.md`) and prepends it to the verification prompt —
  retiring the hand-carried ledger file for the no-resurrection function
  (`--conventions-file` remains for the suite baseline / release contract /
  by-design scope). **No-resurrection framing is earned, never assumed**
  (this session's own round-1 verification Major, fixed fail-closed): a
  prior finding renders as SETTLED only with settlement evidence — a
  settling per-issue `resolution_status`, or a non-empty remediation
  sidecar for the round — and every other prior finding renders under an
  UNRESOLVED block instructing the verifier to re-evaluate it (re-raising
  an unsettled point is not resurrection). Unreadable artifacts are
  reported explicitly under the UNRESOLVED framing; oversized entries
  truncate with an explicit marker. The sidecar
  joins `WORK_DIFF_SET_BOOKKEEPING` (loop bookkeeping, like the issues
  envelopes it annotates), so a note recorded after a clean final round cannot
  stale the close evidence.

## [Unreleased] — verifier pre-close review scope (Set 090)

> Stacks on Sets 089/0.32.0. Retires a recurring verifier **category error**
> that blocked two consecutive closes (088, 089), each needing an operator
> override. Publish stays operator-gated.

### Changed

- **(Set 090) The verification prompt now scopes the verifier to pre-close
  work.** `ai_router/prompt-templates/verification.md` gains a **"Review scope"**
  section, and `build_prompt` a matching context note: `verify_session` runs at
  Step 6, *before* close-out, so not-yet-created close-out state (a
  `close_session` success, `change-log.md`, the final disposition verdict, a
  committed/pushed/`complete` tree) is **never** a completeness defect, and the
  review's own immutable append-only `sN-verification*.md` / `sN-issues*.json`
  are not "stale/false" when a later round supersedes them. The carve-out is
  narrow — a genuinely missing spec-promised code/test/doc deliverable stays in
  scope — so adversarial rigor, materiality, and anti-laundering are untouched.
  Section-anchored regression tests pin the guidance.

## [Unreleased] — verification evidence completeness (Set 089)

> Stacks on the 0.32.0 remediation. An **upstream** evidence-*completeness* gap
> the SS1–SS3 work (decision logic + evidence *integrity*) did not cover: it let
> broken evidence keep producing unrated findings that the anti-laundering rule
> (correctly) treats as blocking → real 6-round churn. Publish stays
> operator-gated; renumber/fold at publish time.

### Fixed

- **(Set 089) Generated-bundle excludes are now depth-agnostic.**
  `build_diff_pathspecs` emitted the root-anchored `:(exclude)<name>`, which
  excluded a top-level `dist/` but NOT a **nested** bundle
  (`tools/dabbler-ai-orchestration/dist`) — that then flooded the evidence diff
  (~4,400 lines) and truncated the real source. Each default exclude
  (`dist` / `out` / `node_modules` / `.venv` / `__pycache__` / `*.vsix`) now
  becomes a `glob`-magic pathspec matching at ANY depth (`**/<p>` plus
  `**/<p>/**` for directories), fixing both the main diff and the untracked
  collector (they share the function) and **retiring the per-repo
  `--exclude tools/dabbler-ai-orchestration/dist` workaround**. The exact
  pathspec is proven against a real `git` in the test suite. Exclusion is never
  **silent**: excluded **tracked** files are now reported as an explicit
  "Excluded tracked paths -- review directly" section (the same honesty SS3 gave
  excluded *untracked* files), and every changed path also stays visible in the
  unfiltered `git status --short`. So a source dir that happens to match a
  generated pattern (e.g. `src/dist`) is surfaced for direct review, not
  dropped without a trace -- this preserves the SS3 completeness guarantee while
  extending the exclusion to nested bundles.

### Added

- **(Set 089) Oversized-INPUT evidence guard.** The mirror of SS3's
  output-truncation guard, applied to the INPUT: when the assembled prompt
  exceeds a cap (`AI_ROUTER_VERIFY_MAX_EVIDENCE_CHARS`, default 600 KiB), the
  verifier would truncate it and review PARTIAL evidence with no signal it is
  partial. `verify_session` now **fails closed** before any metered call
  (`EXIT_VERIFICATION_UNAVAILABLE`, writing nothing) with actionable guidance
  (exclude generated files / split the change / raise the cap).

## [0.32.0] — Unreleased (out-of-band verification-loop remediation)

> Prepared **out of band** — NOT through the framework's own verification loop,
> which this work repairs — on branches `fix/critical-eval-ss1..ss3`, reviewed
> across multiple rounds by an independent, different-provider reviewer (which
> caught nine real defects the builder missed). The PyPI publish stays
> operator-gated (tag `v0.32.0`); the version number is provisional — fold into
> `0.31.0` or renumber at publish time as preferred. Fixes the runaway
> verification loop: it now exits deterministically on minor-only findings,
> cannot be talked into a self-release, binds its severity decision to hash-bound
> evidence, and reviews complete, non-truncated, non-rolled-back evidence.
> Per-session-set detail lives in the remediation workspace `ssN-summary.md`
> files (the raw material for a forthcoming documentation session set).

### Changed

- **(SS1) Severity-anchored loop exit.** A single `is_blocking_issue()` predicate
  now backs `is_blocking_verdict`, `classify_blocking`, AND the dedicated
  `derive_state`, so the loop layer and the workflow layer can no longer disagree
  about what "blocking" means. A Minor-only round closes as "verified with
  observations" instead of churning; Critical/Major/unknown-severity still opens
  a round.

### Fixed

- **(SS1) Self-release paths closed.** `derive_state` no longer short-circuits to
  `closed-verified` on a bare `VERIFIED` token before inspecting issues (a
  structured Major under a mislabeled VERIFIED → `awaiting-human`); an
  unknown/unauthorized `resolution_status` is invalid evidence → `awaiting-human`
  (checked above both the verification and remediation branches);
  `accepted-risk` / `accepted-consequence` / `not-reproducible` are human-stops,
  not self-service terminal closes (only `fixed` stays terminal). The push parser
  surfaces a genuinely structured Critical/Major/unknown-severity block under a
  `VERIFIED` token (line-anchored marker; never scans prose — the Set-071
  false-positive guard is preserved).
- **(SS2) Severity laundering closed.** The close settle-logic (`close_backstop`)
  derives severities by reparsing the HASH-BOUND raw verification artifact, not
  the editable `sN-issues.json` envelope, so a hand-edited severity can no longer
  launder a Major into a non-blocking close. No stamp-schema migration — the
  validator already reparsed the artifact for the verdict; SS2 stops discarding
  its issues.
- **(SS3) Incomplete / rolled-back evidence closed.** The evidence bundle now
  inlines untracked-file CONTENT (file-level `git ls-files --others`; binary /
  oversized / symlink / generated-bundle-excluded files reported as explicitly
  uncovered, never silently dropped); a truncated verifier response is invalid
  evidence → `EXIT_VERIFICATION_UNAVAILABLE` writing nothing; and the LATEST
  verification attempt governs — `check_verification_integrity` and the close
  backstop fail closed when the newest stamped row is invalid, so a newer
  failed/truncated attempt can no longer be discarded in favor of an older
  favorable valid row.

### Documented

- The Lightweight/dedicated tier's engine-arm cross-provider check remains an
  **accepted weaker-model boundary** (the Full tier already enforces
  effective-provider difference via `resolve_orchestrator_exclusion`); documented
  in the `cross_provider_satisfied` docstring rather than tightened, to avoid
  breaking backward-compatible multi-engine/same-provider configs for marginal
  value.

### Deferred (documented, revive on telemetry)

- A `derive_evaluation_decision()` refactor (redundant — SS1/SS2 already made the
  decisions correct), an attempt-history round budget (needs a durable attempt
  ledger), and honest machine-verified vs operator-waived release labels.

## [0.31.0] — Unreleased (Set 086 — Copilot-seat verification integrity)

> Prepared in Set 086; **not yet published**. The PyPI publish is an
> operator-gated action (tag `v0.31.0`). Until then the registry-live
> router remains `0.30.0`. Ships the router half of Set 086 — the
> prevention + fail-loud + legibility layer so a Full-tier session on an
> **unauthenticated Copilot-CLI seat** either verifies for real or stops
> loudly, never silently accepts a confabulated result.

### Added

- **(Set 086 S1) Auth-preflight** (`ai_router/copilot_preflight.py`, CLI
  `python -m ai_router.copilot_preflight`): staged binary → credential →
  live-probe check classified through the transport's existing
  `error_class` taxonomy, wired into `start_session` so a mis-authed
  copilot-cli seat is **blocked from starting** a session it could never
  honestly verify (the live probe runs on every start, including
  idempotent re-entry — repo state is not proof of current seat auth).
  No-op on the direct-API path and under `--no-router`. Injectable
  `which` / credential-dir / spawner so the real CLI is never touched in
  tests.
- **(Set 086 S1) Close fail-loud on missing evidence.**
  `writer_discipline.detect_writer_bypass` gains an opt-in
  `require_ledger=True`, and `gate_checks.check_verification_integrity`
  runs a ledger sub-check first on the Full, non-manual path: an
  **absent** (or empty / unreadable) `session-events.jsonl` is now a
  high-severity finding that hard-blocks the close, not a silent skip.
- **(Set 086 S1) Verdict-token validation at the blessed writer**
  (`session_state.validate_verification_verdict` /
  `is_tolerated_verdict_token` / `normalize_verification_verdict`): an
  exact, case-insensitively-normalized allowlist (canonical `VERIFIED` /
  `ISSUES_FOUND` / `WAIVED` + the shipped extension token
  `ISSUES_FOUND_RESOLVED_IN_FLIGHT`) applied on the active-set close
  path across all verdict-writer siblings. A free-form non-verdict
  (`manual-override-development`) or a prefix look-alike
  (`VERIFIED_NOT_REALLY`) is **rejected**; readers stay prefix-lenient.
- **(Set 086 S2) Togglable transport diagnostics**
  (`ai_router/transport_diagnostics.py`): every failed copilot-cli
  dispatch on the `route()` / `verify()` path emits a structured JSONL
  record (`error_class`, `exit_code`, argv with the `-p` prompt redacted,
  auth-reprobe result, stderr tail) to a config/env-gated log
  (`transports.copilot-cli.diagnostics.enabled`, env
  `DABBLER_COPILOT_DIAGNOSTICS` / `DABBLER_COPILOT_DIAGNOSTICS_LOG`);
  a compact prompt-free summary is embedded in the raised
  `CopilotCliRoutingError` regardless of the toggle, so a dispatch
  failure is never swallowed. The write is best-effort and never masks
  the transport failure itself; the transport stays pure.

## [0.30.0] — 2026-07-07 (Set 085 — preload manifest + ratcheting ceiling gate; guidance slimming)

The router half of the Set 085 guidance-slimming release: the preload
manifest machinery consumer repos need to adopt
`docs/guidance-slimming-playbook.md`.

### Added

- **Preload manifest in the `guidance:` config block**
  (`guidance_config.py`): an optional `preload:` mapping — `files:` (a
  list of `{path, ceiling_tokens, stamp}` entries, repo-root-relative)
  plus `total_ceiling_tokens` — declaring every file the workflow
  requires in context at session start, each with a per-file token
  ceiling. Absent manifest → exactly the two-file Set-064 behavior
  (legacy keys keep working; back-compat is byte-identical, including
  the `--json` shape).
- **`guidance_report` reports and gates the manifest.** Every entry is
  reported per-file and in total against its ceiling
  (`ceil(chars / 4)` proxy); `--check` exits non-zero on any per-file
  or total breach with a remediation line naming the file and overage,
  and treats a listed-but-missing file as a hard failure. Fail-closed
  throughout: a declared-but-malformed manifest, an unparseable config,
  a misplaced top-level `preload:` key, or a config that fails env-key
  validation for unrelated reasons (raw-parse recovery) all fail
  `--check` rather than silently reverting to legacy. Manifest paths
  are containment-checked (no escape above the repo root) and resolve
  from any working directory. Ceilings **ratchet down only** — raising
  one is an operator-authorized config edit with a stated reason
  (`docs/guidance-lifecycle.md`).
- **`--write-headers` is opt-in per entry** (`stamp: true`, default
  false): canonical docs and the engine bootstrap files are never
  machine-stamped.
- **CI gate:** the repo test workflow and the documented pre-commit
  pass run `guidance_report --check`, making the ceiling the
  anti-rebloat mechanism — at ceiling, adding prose requires removing
  prose.

### Fixed

- **The package-bundled default config is never a manifest source**
  (S3, found in release prep). The packaged `router-config.yaml` is the
  orchestration repo's own file and now declares that repo's preload
  manifest; without a guard, a pip-installed consumer with **no**
  workspace config would inherit it via the bundled-default fallback
  and `guidance_report --check` would hard-fail on files that exist
  only in the orchestration repo. Bundled-default resolution is now
  treated as "no config" for guidance purposes (fail-open legacy);
  workspace / `--repo-root` / `AI_ROUTER_CONFIG` sources keep
  enforcing.

### Rollback

- Pin `dabbler-ai-router==0.29.0` (confirmed live on PyPI, published
  2026-07-07). No state-file or config migration is involved: a repo
  that has not declared a `preload:` block is unaffected in both
  directions; a repo that has declared one simply loses the gate
  (0.29.0 ignores the unknown key) until re-upgrade.

## [0.29.0] — 2026-07-07 (Sets 083 + 084 — verify_session CLI, verification-integrity gate, mandatory verification; identity + dynamic exclusion, stamped evidence, the close backstop)

> Combined release. Set 083's changes below never reached PyPI on their own
> (its release was superseded by Set 084, per 083 spec Revision 2); both sets
> ship under `0.29.0`. The Set 084 section follows the Set 083 section.

### Set 083 — verify_session CLI, verification-integrity gate, mandatory verification

### Added

- **`python -m ai_router.verify_session` — Step 6 as a first-class CLI.**
  Resolves the in-progress session, assembles the evidence bundle (spec
  excerpt, `git status --short`, the complete unfiltered working-tree diff
  vs `--diff-base`, generated-bundle exclusions on by default), fills the
  adversarial `prompt-templates/verification.md` verbatim, routes
  `task_type="session-verification"` cross-provider, writes the raw
  `sN-verification*.md` / `sN-issues*.json` artifacts before display,
  classifies blockingness, patches `disposition.json`, and prints the next
  action. `--dry-run`, `--round`, `--max-tier` (with the L-064-7 tier-pin
  refusal) supported.
- **Verification-integrity close gate** (sixth deterministic gate).
  Layer 1: `verification_method` must be a legal token (`api`,
  `manual-via-other-engine`, `skipped`; the 2026-07-06 incident's bare
  `"manual"` and the retired `"queue"` are rejected with naming messages on
  every close path, `--manual-verify` and `--force` included). Layer 2: an
  `api` close requires a cross-provider `session-verification` metrics row
  for this (set, session) — verifier provider resolved via the model
  registry, orchestrator identity from the session-state block, missing
  identity fails closed — plus a root `sN-verification*.md` artifact;
  `manual-via-other-engine` / `skipped` require the operator's zero-budget
  declaration in `ai_router/budget.yaml`. Hard-block in BOTH interactive
  and headless modes; every refusal prints the exact `verify_session`
  remediation. `--manual-verify` (attested, logged) bypasses the evidence
  layer only; `--force` bypasses neither layer.

### Changed

- **Per-session cross-provider verification is MANDATORY on every
  Full-tier session (operator decision, reversing the Set 068 DEMOTE).**
  The routed-gate SKIP path is retired: the 2026-07-06 UAT incident showed
  the gating predicate's verdict is only as honest as the path list the
  policed actor feeds it (an empty argument list evaluated as a zero-file
  diff and printed SKIP). Concretely:
  - `python -m ai_router.routed_gate` always answers REQUIRED (exit 0) and
    names the `verify_session` command; the historical exit 10 is never
    returned, and `--json` reports `"required": true` unconditionally with
    the predicate's verdict preserved as `"predicate_required"`. The module
    and its exports remain importable for pre-083 scaffolds.
  - The verification-integrity gate refuses a **null-verdict** Full-tier
    close: `skipped` / `manual-via-other-engine` closes — with or without a
    verdict — are legal only under the zero-budget declaration; the Set 068
    "skipped + no verdict" shape (Set 080 S1) no longer passes.
  - `start_session` (Full tier) prints a mandatory-verification advisory
    (stderr, non-blocking, fail-open) naming the `verify_session` command;
    the scaffolded `start-here.md` teaches `verify_session` →
    `close_session` with no gate step and no skip branch; "automatic"
    claims about Full verification are removed from all instruction
    surfaces.

### Set 084 — identity is the underlying model, dynamic verifier exclusion, stamped evidence, the close backstop

Closes the identity/provenance holes behind the third live verification
bypass (2026-07-06). Verifier identity, verifier selection, evidence, and
the last word at close are all moved out of the orchestrator's self-report.

#### Added

- **`ai_router/orchestrator_identity.py` — one shared identity resolver
  (F1).** Given a session-state orchestrator block it returns the
  **effective provider** by model-registry lookup on `model` (never the
  free-text `provider` seat label), classifies `identityProvenance`
  (`direct` for single-vendor engines, `asserted` for `github-copilot` /
  `copilot` seats), and fails closed on a missing / registry-unknown model
  for a multi-provider engine. The close gate, verifier selection, and
  `start_session` validation all consume this one helper (L-069-1).
- **`identityProvenance` orchestrator-block field** (additive, omit-null;
  enum `direct | asserted`) — writer-validated and mirrored in the schema,
  JSON schema, and pure-Python validator (L-066-1). Absent on every pre-084
  block.
- **`ai_router/verification_stamp.py` — the evidence stamp (F3).**
  `record_call` writes additive, null-on-historical-rows stamp fields to
  each `session-verification` row: `source`
  (`verify_session_cli` / `close_session_backstop`), `evidence_sha256`,
  `template_id` + pinned normalized `template_sha256`, `verifier_model`,
  `orchestrator_effective_provider`, artifact path + byte-exact
  `artifact_sha256`, `package_version`, `evidence_base`, `work_diff_sha256`,
  and the `verdict` (re-derived from the hash-validated artifact bytes on
  read). Template ids are minted in code with immutable pinned hashes so the
  canonical adversarial template stays byte-identical (L-069-2) and an
  operator template change is an explicit version bump, never an accidental
  pass. Documented as **drift/affordance control, not cryptography.**
- **`ai_router/close_backstop.py` — the close backstop (the structural
  move).** On a Full-tier close with no valid stamped evidence,
  `close_session` runs the verification itself **in-process** through the
  same F1/F2/F3 machinery (evidence assembled against the last commit before
  the session's `startedAt`, canonical template, registry-resolved provider
  exclusion, stamped row, raw artifacts, disposition patch), then proceeds
  on `VERIFIED` / Minor-only, refuses with the findings on blocking
  `ISSUES_FOUND`, and blocks explicitly on `verification_unavailable` or a
  double transport failure — never a pass. Respects `budget.yaml`
  (zero-budget passthrough untouched), the two-attempt ladder, and the close
  lock (idempotent); `verify_session` pre-empts it; `--manual-verify`
  remains the attested bypass; `--force` gets no special treatment (an
  unverified force-close receives the same in-process verification).

#### Changed

- **`start_session` requires `--model` for multi-provider engines (F1).**
  `--engine github-copilot` / `--engine copilot` is refused (exit non-zero,
  remediation names the flag) without a registry-known `--model`; any
  supplied model is registry-validated for every engine; a model whose
  resolved provider contradicts `--provider` prints a "model wins" advisory.
  Single-vendor engines keep `--model` optional.
- **Verifier selection dynamically excludes the orchestrator's effective
  provider (F2).** `verify_session` and `route(task_type="session-verification")`
  (given session context) pass the resolved effective provider as
  `exclude_providers`. The static `session-verification:` model pin in
  `router-config.yaml` is demoted to a preference that can never override the
  exclusion. When the exclusion leaves no different-provider verifier
  (e.g. a single-family Copilot catalog), the outcome is
  **`verification_unavailable`** — a hard blocked state (no verdict written),
  resolvable only by the operator-attested `--manual-verify` path.
- **The verification-integrity close gate accepts only stamped evidence
  (F3).** A `session-verification` row corroborates a close only if it
  carries a valid, internally consistent stamp; a bare `route()` row (the
  incident-3 shape), a template-hash mismatch, an edited artifact, a copied
  stamp, or a same-effective-provider verifier all fail closed with named
  reasons. Shared `find_session_verification_evidence` /
  `validate_stamped_row` serve both the gate and the backstop (one path,
  L-069-1).
- **Docs:** `docs/session-state-schema.md`, `ai_router/docs/close-out.md`
  (the backstop contract, the stamp in the evidence gate, and the
  `--manual-verify` attestation contents), `docs/ai-led-session-workflow.md`
  (Step 6 identity/exclusion/stamp/backstop, Step 8), `docs/concepts/tier-model.md`
  (Copilot-seat `--model` requirement + backstop), and the consumer-bootstrap
  template bundle (`start-here.md`, `AGENTS.md` Copilot guidance,
  `getting-started.md`) describe the new machinery; cold-start fixtures and
  the extension dist bundle regenerated.

#### Fixed

- **Windows drive-letter case-sensitivity in the close/verification path
  (Set 084 S3 UAT).** A real Copilot orchestrator passing
  `--session-set-dir c:\...` (lowercase drive) while git reports `C:\...`
  (uppercase) hit spurious refusals: the stamp's artifact-path check
  (`verification_stamp.validate_stamped_row`) rejected a legitimate stamp
  ("does not sit at the session-set root"), and the working-tree-clean gate
  mis-scoped in-session-set files — together forcing the close backstop to
  re-run redundant verification rounds. Every two-source path comparison in
  the close/verify path now case-folds both sides with `os.path.normcase`
  (a no-op on POSIX, which is correctly case-sensitive): the stamp
  artifact-dir check, the working-tree in-scope match, the `cost_report`
  metrics-row match, and the metrics-row slug reducers. Regression tests in
  `test_windows_path_case.py`.

### Rollback

If a hotfix-grade defect surfaces in the verification-identity / dynamic
exclusion / stamp / close-backstop machinery, pin back to the last version
without any of it: `pip install dabbler-ai-router==0.28.0` (confirmed live on
PyPI at this writing — see `docs/repository-reference.md`). **Effect:** `0.28.0`
predates Sets 083 and 084, so it has no `verify_session` CLI, no
verification-integrity close gate, and no close backstop — a consumer rolled
back to it returns to the pre-083 routed-gate flow and loses mandatory
Full-tier verification. Prefer a forward fix; use this only as an incident
escape. (There is no config-level escape for this release: the identity /
exclusion / backstop behavior is code, not a `transport:` toggle.)

## [0.28.0] — 2026-07-04 (Set 078 — Copilot CLI hybrid tier)

### Added

- **`copilot-cli` transport profile.** A new `transport.profile` field in
  `router-config.yaml` (`api` | `copilot-cli`, default `api`) selects *how*
  every routed call is dispatched, independent of *which* model is picked.
  Under `copilot-cli`, `ai_router/cli_transport.py`'s `Transport` interface
  dispatches every call through the GitHub Copilot CLI's headless mode via an
  injected-spawner invocation state machine: enforced noninteractive flags
  (incl. `--no-auto-update`, since the CLI silently self-updates mid-run
  otherwise), spawn/first-byte/total timeouts (10s/30s/300s), typed error
  classes (`invalid-model`, `auth-class`, `quota-class`, `generic-unknown`,
  each non-retryable), no retry after any content has been emitted, and
  discarded (never patched-together) partial output. The `api` profile's
  dispatch path is unchanged and regression-tested identical.
- **Seat-local Copilot model catalog.** `ai_router/copilot_catalog.py` +
  `python -m ai_router.copilot_catalog --refresh` discover the seat's
  dispatchable models and write `ai_router/copilot-catalog.lock` (not
  checked in as picker strings): CLI version, each model's asserted
  provider (a name-prefix heuristic — `claude-*`/`gpt-*`/`gemini-*` — since
  the CLI has no first-party provenance field or discovery command),
  enablement state, and capture metadata. Every routed call validates the
  lockfile against the live CLI and fails closed on version drift, missing
  provenance, or fewer than two distinct providers among confirmed entries.
- **Catalog-role resolution for `route()`/`verify()`.** Under the
  `copilot-cli` profile, generator and verifier model choices resolve
  through late-bound role aliases (`transports.copilot-cli.roles`) against
  the seat's lockfile; the verifier role enforces
  `cross_role_provider_diversity` and fails closed to a non-blocking,
  operator-visible `verdict="verification_unavailable"` rather than ever
  silently verifying same-provider.
- **Honest seat accounting.** New additive `record_call` metrics fields —
  `transport`, `local_invocations`, `attempts`, `billed_usage_unavailable`
  — null on every historical line; `cost_report` renders a separate
  "Recorded copilot-cli calls (unbilled)" count instead of folding `$0.00`
  copilot-cli records into total cost. Dollar/token-cost/price-table/
  quota-preflight guards are excluded under `billed_usage_unavailable:
  true` (every skip logged); a hard, non-cost-keyed circuit breaker
  (`transport.max_invocations_per_session`, default 200) caps local
  invocations per process.

### Fixed (live-dogfood defects the hermetic fake-spawner suite could not see)

- The lockfile's TOML writer/loader silently produced an unparseable
  `cli_version` when the real CLI's multi-line `--version` banner was
  stored verbatim (an unescaped literal newline inside a quoted TOML
  string) — now only the first line is kept.
- `_success_result()` read `content`/`model`/`outputTokens` directly off the
  assistant-message envelope, but the real CLI nests every message-type
  payload field under a `data` key — every real dispatch silently returned
  `content=""` as a false success. Fixed by unwrapping the `data` key before
  field extraction. A required end-of-set path-aware critique (Session 5)
  found one remaining gap in this fix: an assistant-message event with the
  `data` key **absent entirely** still defaulted to an empty-dict success
  instead of failing closed. `data` is now required to be present (a
  missing key raises the same malformed/generic-unknown classification as
  every other unexpected wire shape).
- `default_spawner` used `Popen(text=True)` with no explicit encoding, so
  stdout/stderr decoded as `cp1252` on Windows; the real CLI's UTF-8 JSONL
  routinely contains bytes `cp1252` cannot decode (e.g. an em dash in
  ordinary model prose), crashing the reader thread mid-stream and
  misclassifying the resulting hang as a "total-timeout" instead of a local
  decode bug. Fixed with `encoding="utf-8", errors="replace"` explicit.

### Rollback

If a hotfix-grade defect surfaces in the `copilot-cli` profile, the escape
is entirely config-level — no code rollback needed:

1. Set `transport.profile: api` in `router-config.yaml` (or delete the
   `transport:` block entirely — `api` is the default).
2. Ignore or delete `ai_router/copilot-catalog.lock` — it is seat-local,
   safe to discard and regenerate later.
3. To roll back the package itself, pin to the last version without the
   `copilot-cli` transport surface at all: `pip install
   dabbler-ai-router==0.27.0`. **Note:** as of this writing `0.27.0` is
   itself still publish-pending (see `docs/repository-reference.md`); this
   step is only reachable once `0.27.0` has actually published. Until then,
   step 1 (`transport.profile: api`) is the available escape.

Every consumer keeps working under the `api` profile with zero data loss —
the lockfile and the profile flag are the only new moving parts, and both
are seat-local/config-only, never data migrations.

## [0.27.0] — 2026-07-03 (Set 077 — lightweight-tier UX and Copilot hardening)

### Added

- **Pending-verification banner at work-session start.** When a set owes
  verification (Mode B `awaiting-*` states, or out-of-band with no recorded
  verdict), `start_session` now prints a loud, non-blocking ASCII banner
  naming the exact next verification or remediation action. The banner is
  advisory on both tiers (no router config needed), and a latest-round
  `WAIVED` record is honored as a durable opt-out — waived sets are never
  nagged. (`ai_router/pending_verification.py`.)
- **External-verification verdict parser with round semantics and a `WAIVED`
  token.** The new `ai_router.external_verification` parser reads the dated
  round sections of `external-verification.md`; the latest round's verdict
  wins, and it returns the round, verdict, and outstanding-remediation view
  consumed by both the soft gate and the pending-verification banner. A
  `WAIVED` verdict (with a required one-line reason) durably records a
  deliberate "no verification for this set" decision.
- **Start-time guardrail for dedicated verification sessions.**
  `start_session --type verification` (and the `--handoff` path) now refuses
  at start — fail-loud, before any write — when the declared
  `(engine, provider)` pair matches every work session's pair and could not
  possibly pass the close gate. The corrective prints the sanctioned
  single-engine model-picker pattern inline.

### Changed

- **Mode B close gate now accepts provider-only difference.**
  `validate_dedicated_verification` passes when the verification session's
  `orchestrator` differs from every work session by engine **or by model
  provider** — a Copilot-locked shop passes by switching the model picker
  (`--engine copilot --provider openai` verifying work done under
  `--engine copilot --provider anthropic`). Same engine + same provider
  still fails, and missing identity data fails closed: a verification
  session with no recorded `--provider` cannot satisfy the provider arm,
  and pre-0.27.0 work sessions without provider data fall back to the
  engine-difference arm. The corrective message names both remedies.
- **External-verification soft gate is keyed to the resolved runtime mode.**
  The gate now fires for spec- or env-activated Lightweight sets (not only
  the raw `--no-router` flag), is content-aware but still soft (an empty or
  verdict-less file warns the same as an absent one), and stands down
  entirely when the set's recorded `verificationMode` is
  `dedicated-sessions` — the typed-session gate is the authority there, so
  the redundant double-gate is gone.
- **Typed-session start paths now seed the set-start policy captures.**
  Starting or handing off a typed session now records the path-aware
  critique, contract-gate, and verification-mode policies (idempotently)
  when no record exists yet, so a set whose first boundary call is a typed
  session no longer silently disarms the Set 066/070 close gates.

### Fixed

- **`close_session` mechanics hardened.** `aborted_at_soft_gate` is mapped
  in `RESULT_TO_EXIT_CODE`; the already-closed check is re-run inside the
  lock (TOCTOU); the terminal-close predicate is computed once for the gate
  chain; and corrective guidance prints before the interactive `[y/N]`
  soft-gate prompt instead of after.
- **`session_state` writes are atomic and more robust.** The boundary
  writers route through atomic writes with a Windows `os.replace`
  `PermissionError` retry; `read_raw_session_state` no longer swallows
  `PermissionError`; the API writer refuses to re-start a session already
  in `completedSessions` (the CLI already did); and finalization uses
  `max(sessions)` instead of `len(sessions)`.
- **`dedicated_verification` robustness.** A shared `_write_json_atomic`
  helper protects `seed_issues_envelope` (whose never-overwrite guard would
  otherwise entomb a partial write forever) and the minimal-activity-log
  creation; corrective strings quote the set-dir path; and a completed
  verification round with no findings envelope and no verdict now derives
  `awaiting-human` pre-terminally instead of silently reading as verified.
- **Freshly-authored sets no longer misclassify as in-progress.** The lazy
  state synthesis (`ensure_session_state_file` / `_backfill_payload`) now
  treats an activity log with an empty `entries: []` as not-started; only a
  log with entries infers in-progress. This closes the A12 defect where any
  router entry point materialized a bogus in-progress state file for an
  authored-but-unstarted set.

> **Rollback:** if a hotfix-grade defect surfaces during the
> mission-critical week, pin back to the coordinated pair — extension
> `0.33.1` + `dabbler-ai-router==0.26.2` (both remain published).

## [0.26.2] — 2026-06-23 (Set 076 — local-only close-out mode)

### Added

- **`.dabbler/local-only` marker waives the close-out push gate for a
  deliberately remote-less repo.** `gate_checks.check_pushed_to_remote` now
  consults a repo-root marker file. When the marker is present **and no git
  remote is configured**, the missing-upstream case becomes a
  *pass-with-note* (`local-only repo: push gate waived ...`, surfaced in the
  passing gate's `gate_results` remediation slot) instead of a
  configuration-error failure — so a repo that is remote-less *by design*
  closes cleanly without `--force` every session. The waiver is gated on
  there being **no remote at all**, so it can never mask a real
  "forgot to push to an existing remote" miss; with a remote present the
  marker is ignored. A marker-absent repo is unchanged in every case. The
  waiver is a branch inside the existing gate — no new `GATE_CHECKS` entry,
  and the `gate_results` JSON shape is unchanged. New pure helper
  `gate_checks.is_local_only(repo_root)` (presence-only; no git call).
- **`ai_router.local_only` CLI** — a blessed, idempotent
  `python -m ai_router.local_only --enable | --disable | --status` (with
  optional `--reason` and `--repo-root`). `--enable` records an audit note
  *inside the marker file* (timestamp, provenance, reason) so the audit trail
  explains why a later close passes-with-note; `--status` reports whether the
  marker is present and whether it would actually fire (it warns when a remote
  is configured). Re-enabling is a no-op that preserves the original note.

### Fixed

- **`drift_guard` no longer false-positives on identifiers that contain a banned
  tier label as a sub-token.** The stale-tier-framing scanner matched the banned
  tier labels as bare substrings, so the legitimate Set 075 telemetry identifiers
  `docs-only-excluded` and `targetClass=docs-only` tripped the guard and held the
  default-branch `Test` workflow red (which blocks the release-publish gate). The
  scanner now matches each banned label with identifier-boundary lookarounds: a
  compound identifier is exempt, but a bare label (in prose or backtick-quoted) is
  still caught, so the ban is not weakened.
  (`ai_router/scripts/drift_guard.py`.)

### Documentation

- `ai_router/docs/close-out.md` gains *Section 6 — The sanctioned local-only
  close path* (behavior matrix, CLI, and the contrast with incident-recovery
  `--force`); Troubleshooting is renumbered to Section 7. The Step 8 close-out
  pointer in `docs/ai-led-session-workflow.md` and the
  `check_pushed_to_remote` docstring point at it.

## [0.26.1] — 2026-06-20 (Set 074 — Dabbler-prefixed provider API key environment variables)

### Changed

- **Default provider API key environment variables are now Dabbler-prefixed.**
  Built-in provider defaults moved from `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`,
  and `OPENAI_API_KEY` to `DABBLER_ANTHROPIC_API_KEY`,
  `DABBLER_GEMINI_API_KEY`, and `DABBLER_OPENAI_API_KEY`. The key values are
  still the normal provider-issued Anthropic, Google, and OpenAI API keys;
  only the environment variable names changed so provider-owned IDE extensions
  cannot accidentally auto-detect and consume Dabbler's routing credentials.
- Updated the shipped `router-config.yaml`, Windows user-env loading helper,
  missing-credential diagnostics, CI dummy envs, VS Code extension Full-tier key
  detection/warnings, current README/user docs, consumer-bootstrap templates,
  cold-start fixtures, and tests to use the new default names.

## [0.26.0] — 2026-06-19 (Set 072 — the provider×surface matrix instrument + verification-only application mode)

> Set 070 built the dual-surface instrument to **hold provider equal across arms** —
> by design, to isolate *surface* as the only variable. An independent operator-run
> field study (`kick-the-orchestrator-tires`, 18 push-vs-pull runs) found what that
> design cannot measure: **provider and surface interact**, and the live default
> pairing (`push = gpt-5-4` / `pull = gemini-2.5-pro`) is the study's *single weakest
> pull configuration*. Set 072 adds the **opt-in matrix seam** (without weakening the
> equal-arms steelman default), a **verification-only application mode** that points a
> configured provider×surface matrix at an **already-built** target repo — emitting
> per-cell telemetry **and** a consolidated fixer-facing remediation report as a
> byproduct of real verification work — and a **cross-run aggregator** that rolls many
> runs over one target into a single corroboration-annotated remediation backlog. It
> also folds in the deferred **L-069-1** sibling-reader hardening.

### Added

- **Opt-in matrix-mode seam in `dual_surface_verify.run_dual_surface` (S1).** New
  optional per-arm `push_provider` / `pull_provider` / `push_model` / `pull_model`
  params. When any is set, `matrix_mode` is on: each arm resolves its provider/model
  independently, the strong **adversarial framing gate stays on both arms** (L-069-2 —
  the matrix varies *provider*, not framing), and the provider/model **equality refusal
  is skipped** (divergence is recorded as intentional, not raised). With none set, the
  equal-arms steelman default is **byte-for-byte unchanged** and still raises
  `UnequalArmsError` on accidental divergence. The attestation gains
  `mode` (`"equal-arms"` | `"matrix"`), `intentionalDivergence`, and
  `requestedPush/PullProvider/Model`; `DualSurfaceRun.mode` threads through
  `to_dict()` / `build_comparison_artifact`; `COMPARISON_SCHEMA_VERSIONS → (1, 2)`
  (schema `1` still accepted; `2` requires `mode`). `_arms_held_equal` is
  **strengthened** to reject a matrix artifact as RETIRE evidence (a matrix run is a
  per-cell instrument, never the equal-arms RETIRE-telemetry path).
- **`ai_router/verification_only_app.py` — the verification-only application mode
  (S2).** A thin orchestration over `run_dual_surface` (matrix mode) — no arm logic of
  its own — pointable at an **external** built target via the runner's `sandbox_dir`
  seam. `run_verification_matrix(target_repo, *, base_ref, head_ref, matrix, …)` runs
  one matrix-mode `run_dual_surface` call per `MatrixCell` (push×pull cross-product), a
  failing cell recorded as a `SkippedCell` so one provider failure never aborts the
  matrix (L-067-1). `CellTelemetry` stamps every confound this set does **not** vary —
  orchestrator provider/model, push & pull provider/model, per-arm framing strength,
  surfaces run, diff size/shape, and `push_broker` / `pull_broker = "none"` — so later
  data stays comparable. Writes `verification-matrix-report.json` + a pure-Python
  `validate_matrix_report` at **L-066-1 parity** (never raises; int-not-bool guards).
- **The consolidated fixer-facing remediation report (S2).**
  `build_remediation_report(report)` consolidates the run's per-cell findings via the
  Set 070 `merge_findings` provenance merge (`push-only` / `pull-only` / `both`),
  dedups by stable finding key, severity-ranks, and writes `remediation-report.json` +
  `remediation-report.md` (file/location / impact / evidence / provenance retained;
  experiment metadata dropped). This is the artifact a target repo remediates from
  **without re-running verification** — the consumer-handoff model. `validate_remediation_report`
  holds L-066-1 parity.
- **The cross-run remediation aggregator (S3).**
  `aggregate_remediation_reports(reports, *, generated_at)` rolls up N per-run
  remediation reports over **one** target into `remediation-backlog.json` + `.md`,
  re-running `merge_findings` across runs keyed by stable `defectKey` (max severity,
  union provenance/surfaces). Each finding is annotated with **corroboration = the
  count of *distinct* runs** that surfaced it (a cross-config confidence/priority
  signal); an unkeyed finding is its own single-run group and never corroborates (safe
  over-split). A `MixedTargetError` guard refuses to merge reports from different
  targets. `validate_remediation_backlog` holds L-066-1 parity (distinct + member run
  refs; `corroboration == distinct count`).
- **CLI** `python -m ai_router.verification_only_app run --target … --base … --cell
  push:anthropic --cell pull:google --out report.json` (writes both the matrix report
  and the consolidated remediation report) and `… aggregate --report a.json --report
  b.json --out backlog.json`. ASCII-only status; returns an int.
- **Schema docs:** `docs/verification-matrix-report-schema.md`,
  `docs/remediation-report-schema.md`, `docs/remediation-backlog-schema.md`.

### Fixed

- **Cross-run aggregator preserves finding-level severity when a contributor omits
  it (caught by the S4 path-aware dogfood).** A per-run `remediation-report`
  contributor's `severity` / `category` are schema-optional (the merged finding's
  `severity` is authoritative). `aggregate_remediation_reports` reconstructs raw
  findings from contributors to re-run the cross-run merge; previously
  `_raw_from_contributor` read only contributor-local fields, so a **valid** report
  whose contributor omitted `severity` (with the authoritative value at the finding
  level) was re-merged as *unspecified* and **down-ranked** in the backlog — a Major
  a fixer should prioritize could sort below a Minor. The reconstruction now falls
  back to the parent finding's `severity` / `category` (the parent severity is the
  max across contributors, so the fallback can only preserve, never under-state, the
  re-merged severity) + a regression test.

### Changed

- **L-069-1 sibling-reader hardening.** The proven non-list-`entries` guard
  (`entries = log.get("entries"); if not isinstance(entries, list): return <no-record
  default>`) now lands at all four unguarded sibling readers —
  `read_path_aware_critique` / `has_path_aware_critique_record`
  (`path_aware_critique.py`) and `read_verification_mode` /
  `has_verification_mode_record` (`dedicated_verification.py`) — and `UnicodeError`
  was added to the two `dedicated_verification.py` readers' `except`. The whole class
  of malformed-activity-log close-out crashes (Set 068/069 lineage) is now closed
  across every reader site.
- **Commentary-only `verification_only:` block under `pull_verifier` in
  `router-config.yaml`** documenting the shipped best-guess matrix defaults. **No new
  behavioral knob; the live default pull provider is unchanged.**
- **`routedApiCalls` is omitted from activity-log entries when empty.**
  `SessionLog.log_step` and the operator-choice capture writers
  (`path_aware_critique`, `contract_gate`, `dedicated_verification`,
  `dual_surface_verify`, `suggestion_disposition`) no longer emit an
  always-empty `"routedApiCalls": []`. The canonical source of routed-call
  cost is `router-metrics.jsonl` (written by `record_call`); an empty `[]`
  on every entry read as "no routed calls happened" when in fact none were
  ever logged to this field. The key is now written **only when there are
  calls to record**, so its absence is honest. Both readers
  (`SessionLog.get_cost_summary`, `session_events`) already tolerate a
  missing key. Existing `docs/session-sets/*/activity-log.json` history was
  backfilled (empty `[]` entries stripped; the 52 files with genuinely
  recorded calls were preserved untouched). No extension / schema change.

## [0.25.0] — 2026-06-18 (Set 071 — the verifier materiality gate + nitpick-churn loop discipline)

> Set 070 gave **both** reviewer surfaces their strongest devil's-advocate framing
> (steelman push, L-069-2); the operator's field test confirmed it works **and**
> surfaced its predicted side effect — strong framing with **no materiality bar**
> manufactures **Minor / false-positive** findings, and the re-verify loop **churns
> rounds on them** (the canonical case: three rounds on `pytest` vs `python -m pytest
> -v`, a distinction with no behavioural difference, on correct work). Set 071 adds
> the **calibration layer** — a materiality "so what?" gate in both templates, a
> severity-anchored blocking classifier, the Minor-non-blocking re-verify loop
> discipline, a cross-round issue ledger, and a merge-impact / plausible-path-to-harm
> anti-laundering guardrail — **additively, never a framing weakening** (L-069-2 is a
> hard constraint; the strong-framing pins stay green and `classify_framing_strength`
> still returns `ADVERSARIAL` for both templates). The verdict grammar stays
> **binary** (no third `VERIFIED_WITH_NITS` token — cross-provider-confirmed at S2);
> blocking-ness is a derived, first-class predicate. No extension / Marketplace
> change. Strategy synthesis: `docs/verification-surface-strategy.md` § 7; lesson
> L-071-1.

### Added

- **The materiality + anti-nitpick layer in both reviewer templates (S1).**
  `prompt-templates/verification.md` (push) and `prompt-templates/path-aware-critique.md`
  (pull) gained the three-part "so what?" blocking test (exact requirement violated +
  concrete impact + evidence), the anti-nitpick clause (semantic-equivalence-not-
  textual-identity, with the `pytest` case named as a worthless finding; manufacturing
  a Minor to dodge a rubber-stamp is itself a false-positive failure), the severity
  anchor (Major = *would change a reasonable reviewer's merge decision*) +
  plausible-path-to-harm escalation, and a non-blocking **`NITS`** output section. The
  Set 070 `_ADVERSARIAL_MARKERS` phrases, the template placeholders, and the
  `VERIFIED` / `ISSUES FOUND` tokens are preserved verbatim.
- **The severity-anchored blocking classifier (`verification.py`, S2).**
  `is_blocking_verdict(verdict, issues)` and `classify_blocking(verdict, issues)`
  (→ `BlockingClassification`) derive the blocking decision from the **severity of the
  findings given, not the bare verdict token**: a list with ≥1 Critical/Major (or any
  unknown/missing-severity) finding blocks regardless of the token passed alongside it;
  Minor-only / nits-only is recorded but non-blocking. The push parser
  `parse_verification_response` **trusts a `VERIFIED` token and returns no findings**
  (it does not re-mine a clean review's prose for a hidden Major — operator-adjudicated
  in S2, to avoid reintroducing churn), so on the push surface the anti-laundering net
  bites on the `ISSUES_FOUND` path; the pull surface passes structured
  `pull_verifier.Finding` severities, where the net is always live.
  `reconcile_issue_ledger(...)` (→ `LedgerReconciliation`) tracks prior blocker ids
  RESOLVED/UNRESOLVED and flags resurrection for the no-reopen-under-fresh-wording
  rule. `parse_nits(...)` reads the `NITS` section for observability only (nits never
  enter the issues list). The classifier itself is **surface-agnostic** (one decision
  over any severity-bearing findings).
- **`VerificationResult` wiring (`__init__.py`, S2).** Gained `blocking`
  (= `is_blocking_verdict`) and `nits` (= `parse_nits`) fields (defaulted, backward-
  compatible), populated in `_run_verification`, so the re-verify loop reads
  `result.verification.blocking` instead of the bare token. New symbols exported.
- **The re-verify loop discipline (`docs/ai-led-session-workflow.md` Step 6, S2).**
  New subsection *Materiality and the re-verify loop discipline (Set 071)*: Minor-only
  ⇒ effectively VERIFIED, opens no round; a round continues only on new/unresolved
  Critical/Major; the cross-round issue ledger; surface-agnostic; the 1–2-automatic /
  3+-human bound unchanged (only narrows what counts as a round-justifying finding).
  Wired into the Step-7 `ISSUES_FOUND` branch, the max-2-retries item, and the Mode-B
  bounded-round item (L-065-1 echo discipline).
- **Tests (`tests/test_blocking_classifier.py`, S1–S2).** The `is_blocking_verdict`
  matrix, the `classify_blocking` partition, the **verbatim** three-round
  `pytest`-vs-`python -m pytest -v` churn pinned as a regression that must classify
  **non-blocking** end-to-end, verdict-grammar variants, severity-derived-not-token,
  push-parser-trusts-VERIFIED-token, NITS-no-bleed, `parse_nits`, surface-agnostic
  over `pull_verifier.Finding`, the `VerificationResult` wiring, and the
  `reconcile_issue_ledger` tests. `test_verification_framing.py` extended with the
  materiality-language presence checks and the `classify_framing_strength` == ADVERSARIAL
  additivity proof for both edited templates.

### Fixed

- **`parse_verification_response` robustness (S2)**, surfaced by the churn fixture and
  the verification loop: the `ISSUES FOUND` header self-matching as a spurious
  severity-less finding; a markdown-bold `**Severity:** Minor` the old regex could not
  read (so Minor was read as unknown → blocking — the exact churn this set kills); the
  canonical underscored `ISSUES_FOUND` header not being stripped (L-069-1 class-
  completion: `_` is not whitespace); a `VERDICT:`-prefixed verdict falling through to
  `ISSUES_FOUND`; and a trailing `NITS` section bleeding into the last issue's
  description. The `(verdict, issues)` public contract is unchanged.

## [0.24.0] — 2026-06-16 (Set 070 — the dual-surface mode + the steelman-push upgrade)

> *Changelog entry backfilled in Set 071 S3 — the 0.24.0 release (Set 070, tag
> `v0.24.0` on `c71df65`) bumped the package version and wrote the set-level
> `docs/session-sets/070-dual-surface-verification-telemetry/change-log.md` but did
> not add this package-level section. Content reconstructed from that set change-log
> and the strategy doc § 5.2.*
>
> The **push** (routed, snippet-fed) verification surface now gets a **fair shake**
> before any RETIRE decision, and the framework has the systematic instrument that
> turns keep/demote/retire from faith into measurement. Two honesty gaps Set 065→069
> left: production push shipped at **weak** framing (weaker than the *moderate*
> Experiment A instrument that demoted it, weaker than its *strong* pull counterpart),
> so push had never been measured at its adversarial best; and nothing ran **both**
> surfaces head-to-head recording which surface uniquely caught which high-severity
> defect. The dual-surface mode is **additive** (absent a recorded `dualSurfaceMode`,
> default `off`, `route` / `pull_route` / `produce_path_aware_critique` are byte-for-
> byte unchanged) — the one intended behavioral change is the steelman-push upgrade.
> No extension / Marketplace change. Rationale: `docs/verification-surface-strategy.md`
> § 5.1–5.2 (operator directive 2026-06-16) and L-069-2.

### Added

- **Steelman push (S1).** `prompt-templates/verification.md` upgraded from *"evaluate
  objectively"* (weak) to the devil's-advocate framing pull already uses (strong),
  preserving the `build_verification_prompt` / `parse_verification_response` machine
  contract. `test_verification_framing.py` pins the strong-framing phrases.
- **The `contractGate`-seed fix (S1).** `start_session.py` gained
  `--contract-gate {none,advisory,required}` + `_capture_contract_gate` (mirroring
  `_capture_path_aware_critique`, delegating to the existing
  `contract_gate.resolve_and_record_contract_gate`), closing the Set 069 S6 gap where
  the `contractGate` seed was not recorded at set start.
- **`dual_surface_verify.py` — the dual-surface ("overdetermined") mode (S1–S2).**
  `run_dual_surface` runs the **push** arm (snippet-fed `route`/`call_model` over the
  committed diff, repo-blind) and the **pull** arm (`pull_route` repo-reading agentic
  loop) over the same committed state, **provider/model/framing held equal across
  arms** (equality measured from each arm's reported identity; framing classified by
  `dual_surface_verify.classify_framing_strength` over each template's single-source
  body, which is rendered through a new `template_text` seam in `pull_critique.py`).
  `merge_findings` labels each finding `push-only`/`pull-only`/
  `both` (`both` only on a shared explicit `defectKey`, never free-text; unkeyed →
  safe over-split + `provenanceComplete=false`). `build_comparison_artifact` /
  `validate_comparison_artifact` write + check `dual-surface-comparison.json`
  (`dual-surface-comparison.schema.json`; pure-Python validator at L-066-1 parity).
  `score_comparison` / `score_against_benchmark` (Set 069 benchmark; underpowered →
  `INCONCLUSIVE`; push never retired here) + `aggregate_retire_telemetry` (refuses to
  pool `sampled` with `opt-in`). `dualSurfaceMode` (`off`/`sampled`/`opt-in`) recorded
  once at set start + immutable; `should_run_dual_surface` takes an injected draw.
  CLI: `python -m ai_router.dual_surface_verify record-mode | read-mode | score`.

## [0.23.0] — 2026-06-16 (Set 069 — the execution-backed evidence layer)

> Carries the whole of Set 069 (S1–S6): the automated pull-critique producer is no
> longer a read-only commentator — it can now generate **execution-backed,
> replayable** evidence, and reproduced probeable defects can be promoted into the
> deterministic floor under a quality gate. This closes the automated-vs-manual
> gap the 0.22.x release exposed (the automated run missed two Major bugs the
> manual run reproduced by executing code). All additive — absent the new config a
> critique is byte-for-byte the read-only Set 067/068 loop. No extension /
> Marketplace change this set. Design rationale:
> `docs/proposals/2026-06-16-pull-architecture-capabilities/proposal.md`
> (**now BUILT**); full strategy: `docs/verification-surface-strategy.md` § 6.

### Added

- **Single execution-evidence protocol (`evidence_protocol.py`, S1).** Findings
  carry an evidence tier — `REPRODUCED` / `ASSERTED` / `HYPOTHESIS` (default
  `ASSERTED`, additive) — that the **orchestrator** applies, never the agent.
  `REPRODUCED` requires a servant-captured transcript (trusted `commandId` XOR
  `templateId` + typed args, pinned ref, exit, raw output, output hash) that
  **replays on a second pristine checkout** with a matching hash; the meta-oracle
  rule (drive a real public entrypoint, not an agent harness) holds by
  construction. The Set 066 validator/schema enforce it
  (`ARTIFACT_INVALID_EVIDENCE`): a `REPRODUCED` finding lacking a valid replayed
  transcript is invalid.
- **Trusted-command execution + `get_diff` in the producer (`pull_critique.py`,
  S2).** Pass a `RunTestConfig` and each critic may **trigger** an
  operator-authored command id in the disposable-worktree `run_test` cage (never
  author argv, fresh checkout, hard caps); pass a `DiffConfig` and the critics get
  a read-only `get_diff` (raw unified diff + changed paths). Loop depth is
  **blast-radius-budgeted** (`budget_caps_for_paths`), not a magic constant. CLI:
  `--run-test-cmd` / `--run-test-named` / `--exec-ref` / `--diff-base` /
  `--diff-head`.
- **The probe-template lane (`probe_templates.py`, S3).** Operator-authored,
  **versioned** probe harnesses the critic invokes with **typed, validated args**
  (`validate_template_args` never raises) — the narrowest lane that finds
  *novel-but-local* edge cases without authoring code. The seed library
  (`BUILTIN_PROBE_TEMPLATES`) drives `ai_router`'s own public entrypoints and would
  have caught the two 0.22.x bug classes; dogfooding it found a **still-latent
  instance of the 0.22.x `UnicodeError` class** (four readers in
  `path_aware_critique.py`), now fixed (L-069-1). Tool: `run_probe_template`; CLI:
  `--probe-templates`.
- **The Podman model-authored-probe lane (`podman_sandbox.py`,
  `podman/Containerfile`, S4).** The one lane where the model authors the probe
  body — so it runs **only inside a real Podman container** (`--network=none`,
  read-only repo, tmpfs scratch, `--cap-drop=ALL`, crash-safe teardown,
  lane-labeled disk hygiene). Shipped **only because the Podman feasibility spike
  came back GREEN** (6/6, podman 4.9.3). Autonomous + severity-gated; the AI safety
  check is **triage-only** (reject/escalate, never approve). **A model-authored
  probe can never mint `REPRODUCED`** — the finding is capped at `HYPOTHESIS` (a
  container-backed suspicion a human verifies); only the S5 ratchet promotes it.
  Tool: `run_authored_probe`; CLI: `--podman-lane` / `--podman-image`. (The
  real-podman cage regressions run on Linux CI / WSL and skip on the Windows host.)
- **Ceiling→floor ratchet (`floor_ratchet.py`, S5).** A reproduced probeable
  defect yields a candidate falsifier (`candidate-falsifiers.json`) that is
  **never auto-merged**: five mechanical admission gates (fails-on-old,
  passes-on-fixed on a different ref, drives-a-public-contract, flake-check,
  has-owner) **AND** human sign-off, with a **rubber-stamp guard** so a human
  approval can never override a failing gate. `check_floor_ratchet_coverage`
  enforces the mandatory-coverage rule. Schema:
  `docs/candidate-falsifier.schema.json`; CLI:
  `python -m ai_router.floor_ratchet`.
- **Measured replacement gate (`replacement_gate.py`, S5).** A pre-registered
  seeded + holdout benchmark (`benchmark-registration.json`) and a raw scoreboard
  (`replacement-scoreboard.json`) whose verdict is **derived, never hand-asserted**
  (recall / precision / replay-success / false-`REPRODUCED` + the gated-surface
  telemetry the Set 068 DEMOTE said RETIRE reopens on). Underpowered forces
  `meets_thresholds = False`; **the manual run is never retired**. Schemas:
  `docs/benchmark-registration.schema.json`,
  `docs/replacement-scoreboard.schema.json`; CLI:
  `python -m ai_router.replacement_gate`.

### Fixed (Set 069 S6 dogfood — the new execution-capable producer, run over this
set's own diff, caught two defects the S5 per-session routed verification missed)

- **Floor-ratchet coverage could be under-enforced by a free-text description
  match (Major).** `check_floor_ratchet_coverage` matched a candidate to a
  reproduced finding on the stable `<provider>:<index>` ref **OR** the finding's
  free-text `description`. Descriptions are not unique (two providers can report
  the same defect, or two findings can share wording), so one description-keyed
  candidate could satisfy coverage for several distinct reproduced defects. Removed
  the description fallback — coverage now matches only the stable ref (which the
  canonical `build_candidate_from_finding` always records). +regression test.
- **`falseReproduced` schema prose drifted from the metric (Minor).** The
  scoreboard schema described `falseReproduced` as "wrongly tagged REPRODUCED
  without a valid replay", implying it derives from `replayed == false`, but
  `score_benchmark` (correctly) records it as an **independent** integrity flag — a
  replay can run yet validate the wrong entrypoint (a meta-oracle failure). Clarified
  the schema description; the code is unchanged (the independent flag is the
  correct design).

## [0.22.1] — 2026-06-16 (post-0.22.0 fixes — Set 068 whole-set critique)

> **Why 0.22.1 exists.** The `v0.22.0` tag was pushed at commit `32874dd`, which
> was **before** the Set 068 manual whole-set path-aware critique (GPT-5.4 +
> Gemini-2.5-Pro) landed its fixes (`23c705e`). So PyPI **0.22.0 shipped without
> the fixes below** — they ride in 0.22.1. (PyPI versions are immutable, hence a
> patch release rather than a re-tag.)

### Fixed (Set 068 whole-set path-aware critique)

The operator's manual whole-set critique found defects the per-session routed
verification AND the automated dogfood both missed:

- **`run_test` temp-dir creation could escape the cage contract (Major).**
  `run_test_in_cage` created the temp parent with `tempfile.mkdtemp` *before* the
  protected `try`/`finally`, so a failing `worktrees_parent` raised instead of
  returning the contracted raw `error` result. Moved under a guard
  (`run_test_sandbox.py`). +regression test.
- **Contract-gate validators could raise on invalid UTF-8 (Major).**
  `_load_json_artifact` caught only `OSError` / `json.JSONDecodeError`, so a
  non-UTF-8 `contract-manifest.json` / `contract-floor-result.json` raised
  `UnicodeDecodeError` through validators that promise never-raising — crashing
  close-out. Now also catches `UnicodeError` (`contract_gate.py`). +regression test.
- **Stale cut-over echoes (Major/Minor).** `docs/contract-gate.md`, the
  `router-config.yaml` `contractGate` comment, and the `__init__.py` `run_test`
  export note still described the demotion as pending / overstated the cage's
  containment; updated to the live gated policy and the bounded
  (not-an-OS-sandbox) guarantee.

## [0.22.0] — 2026-06-16 (Set 068 — the cadence study + the contract-test gate)

> Released from commit `32874dd`. **Note:** the Set 068 whole-set critique fixes
> are in **0.22.1**, not this release (see above).

> Carries the whole of Set 068 (S1–S6): the `run_test` execution cage + ReDoS
> isolation, the contract-test / CDC gate, and the per-session routed-verification
> **DEMOTE** cut-over. No extension / Marketplace change this set. Full strategy:
> `docs/verification-surface-strategy.md`.

### Added

- **`run_test` disposable-worktree execution cage (`run_test_sandbox.py`, S1).**
  The first **write-capable but caged** tool for the Set 067 pull-verifier
  adapter: an operator-configured argv runs `shell=False`, write-confined to a
  detached, disposable git worktree created from a pinned ref, with a hard
  wall-clock timeout (process-tree kill), a per-stream output cap, and
  **crash-safe teardown** (remove → recursive delete → prune, then a
  `git worktree list` leak check that surfaces a surviving registration as a hard
  `ERROR:`). It returns the **raw** exit code + captured output (the
  deterministic-servant discipline extended to execution; the real tree is never
  mutated). Offered to the loop **only** when a `RunTestConfig` is passed — absent
  that, the loop is byte-for-byte the 0.21.x read-only loop. It is a bounded
  verification cage, **not** a CI runner and **not** an adversarial OS sandbox
  (scope + threat model in `run-test-contract.md`).
- **Contract-test / CDC gate (`contract_gate.py`, `docs/contract-gate.md`, S5).**
  A per-set, opt-in `contractGate` (`none|advisory|required`) deterministic
  **floor** that confirms a set's contract/falsifier tests ran and **passed** in
  the `run_test` cage and cover every probeable defect class, reserving the
  path-aware agent for the non-probeable residual. Mirrors the Set 066 path-aware
  gate shape (produce-then-validate: `python -m ai_router.contract_gate run`
  produces the raw `contract-floor-result.json`; the close-out gate validates it).
  Posture: `required` hard-blocks TTY / soft-warns headless; `advisory` always
  soft-warns; `none` skips; fail-open in the non-block direction. Pure-Python
  validators with L-066-1 parity discipline + the `contract-manifest.schema.json`
  / `contract-floor-result.schema.json` references.
- **Per-session routed-verification gating predicate (`routed_gate.py`, S6).**
  `evaluate_routed_gate` / `python -m ai_router.routed_gate` — the deterministic
  predicate that implements the DEMOTE cut-over: per-session routed verification
  now fires only when a blast-radius / coupling predicate trips on the session
  diff. Built on `blast_radius.classify_paths` (the Set 066 core predicate) plus
  session-level triggers (multi-module span, diff breadth, build/CI/config
  surface) and three operator overrides that can only **raise** the verdict to
  REQUIRED. CLI exit-code contract: `0` REQUIRED / `10` SKIP (`--json` exits 0).

### Changed

- **Per-session routed verification is DEMOTED from mandatory to gated.** On the
  evidence of Experiment A (capability — the lever is repository context-access,
  which a snippet-fed routed call structurally lacks) and Experiment B (cadence —
  the defense does not hold under the pre-registered rule, though the mechanism is
  real and narrow), cross-provider consensus + operator confirmation chose
  **DEMOTE**. The Set 068 S4 transition guard held the cut-over until the S5
  contract-test floor shipped; S6 executed it. `docs/ai-led-session-workflow.md`
  (Step 6 + the *Verification-surface policy* section) and the
  `router-config.yaml` `verification:` anchor are flipped accordingly. The
  end-of-set path-aware critique + the contract-test gate are now the primary
  verification surface; routed is **gated, not gone** (RETIRE rejected as
  premature, reopenable only on telemetry).
- **`grep` ReDoS defense relocated onto a killable subprocess (S1).** The 0.21.1
  portable heuristic is now a cheap **pre-filter** only; a pattern that defeats it
  is bounded by a hard subprocess timeout (raw `ERROR:` returned, parent never
  hangs) rather than relying on the heuristic as the sole defense.

### Docs

- New canonical `docs/verification-surface-strategy.md` synthesis (supersedes the
  Set 065 proposal's open questions); `ai_router/docs/close-out.md` documents the
  contract-test gate; `ai_router/docs/pull-verifier.md` records what Set 068 added.

## [0.21.1] — 2026-06-15 (Set 067 follow-up — whole-set adversarial-critique fixes)

> Published to PyPI 2026-06-15 (tag `v0.21.1`, `release.yml` run `27566067021`,
> all jobs success incl. the green-`Test` gate; OIDC).

A post-release whole-set path-aware critique (GPT-5.4 + Gemini-2.5-Pro via the
`adversarial-critique-prompt.md` flow) found defects in the 0.21.0 adapter +
producer that the per-session and per-set reviews missed. All fixed; no API
surface change.

### Fixed

- **Unrecognized tool calls no longer break the loop (Critical).** `pull_route`
  dispatched only `read_file`/`grep`/`list_dir` and silently dropped any other
  tool name, leaving the model's `tool_use` unanswered — which Anthropic/OpenAI
  reject with a `400` on the next turn (and made the servant's "unknown tool"
  error branch dead code). Every non-`submit_verdict` tool call is now dispatched
  to the servant, which returns a raw `ERROR: unknown tool …` the model can
  recover from.
- **A malformed/truncated verdict no longer crashes the run (Major).**
  `_parse_verdict` is now caught inside the loop: the error is fed back to the
  model to resubmit; if a forced final turn still can't produce a valid verdict
  the run ends with `ok=False` rather than raising `VerdictSchemaError`.
- **Budget-aware forced verdict now has a backstop (Major).** The adaptive
  reserve could still be defeated by a single over-sized call (no reserve on the
  first turn; a later call much larger than the previous), exiting with no
  verdict. The loop now spends exactly **one** forced-verdict call once a ceiling
  is crossed before honoring the stop (caps remain post-hoc; overshoot bounded
  to one output-capped call). The 0.21.0 "commit a verdict instead of stopping
  empty" claim is corrected: it greatly reduces — does not eliminate — empty
  stops.
- **`grep` ReDoS guard (Major).** The model-authored regex is now screened for
  over-long patterns and the nested-quantifier catastrophic-backtracking shape
  (`(a+)+`, `(.*)*`) and rejected as a raw `ERROR` rather than compiled. A
  portable heuristic, not full isolation — re2/subprocess caging is tracked for
  Set 068.
- **Producer default sandbox is the repo root, not `cwd` (Major).**
  `produce_path_aware_critique` defaulted `sandbox_dir` to `Path.cwd()`, so an
  invocation from a subdirectory silently under-scoped the review while the
  artifact still passed the gate. It now defaults to the git repo root
  containing the session-set dir.
- **Removed dead `seen_providers` accumulator** in the producer (distinctness is
  enforced by `validate_path_aware_critique_artifact`).

### Docs

- `docs/session-sets/067-…/experiment-a-results.md` gains an **erratum**: the
  Experiment A audit was one-directional and the headline H1 *magnitude* /
  "H2 resolved" used the audited-union metric, not the pre-registered automated
  primary (under which the Gemini contrast is within the noise band). H1's
  *direction* still holds on the D5/D9 Critical existence proofs; magnitude is
  downgraded to exploratory and a symmetric re-grade is carried to Set 068.

## [0.21.0] — 2026-06-15 (Set 067 — first-party pull-verifier adapter + path-aware-critique producer)

Ships the first-party, multi-provider **tool-loop "pull" verifier adapter**
(`pull_route`) with Anthropic + OpenAI + Gemini bindings, and — after Set 067's
Experiment A **confirmed** the path-aware capability — the **opt-in automated
producer** that uses it to write the Set 066 `path-aware-critique.json`
artifact. The manual GitHub-Copilot flow stays the default; routed per-session
verification is unchanged. The disposable-worktree `run_test` tool, the
contract-test gate, Experiment B (cadence), and the routed keep/demote/retire
decision are deferred to Set 068.

### Added (Set 067 S1–S2 — adapter core + three provider bindings)

- **`pull_route()` agentic-executor seam** (`ai_router/pull_verifier.py`): a
  `route()`-**parallel** tool-use loop in which the verifier drives the loop and
  the orchestrator is a **deterministic servant** returning raw ground truth via
  read-only `read_file` / `grep` / `list_dir` tools — never a model-summarized
  view (a summarizing servant raises `DeterministicServantViolation`). The loop
  is sandbox-confined (`_safe`, symlink-safe), turn/token/cost capped, and
  instrumented (a tool-call trace; a zero-probe run is a failed run). The forced
  `submit_verdict` is shaped to the Set 066 critique-entry. Exposes
  `pull_route`, `PullResult`, `PullCritique`, `PullCaps`, `PullTrace`,
  `Finding`, `DeterministicServant`, and the adapter exceptions.
- **Anthropic / OpenAI / Gemini bindings** behind one provider-agnostic driver
  (OpenAI uses the Responses API with `previous_response_id` reasoning chaining;
  Gemini uses positional `function_declarations` with a bounded thinking
  budget).
- **`pull_verifier:` executor block** in `router-config.yaml` (per-provider
  model pins, shared caps, per-provider reasoning knobs) — distinct from the
  single-shot routing table.

### Changed (Set 067 S4 — adapter robustness from the dogfood)

- **Budget-aware forced verdict in `pull_route`.** The S4 path-aware dogfood
  found that frontier reasoning models (GPT-5.4 / Sonnet) over-probe and exhaust
  the token/cost budget **without submitting a verdict** — the final-turn force
  never fired because the hard ceiling broke the loop first. `pull_route` now
  forces `submit_verdict` once one more call of the **last call's measured size**
  would breach either ceiling (an adaptive headroom reserve), so a verbose
  prober commits a verdict instead of stopping empty. Caps remain post-hoc.
- **`validate_path_aware_critique_gate` canonicalizes the set path.** The gate's
  identity check now resolves `session_set_dir` before taking `.name`, matching
  the Set 067 producer (which resolves before stamping `sessionSetName`), so a
  non-canonical invocation (`.`, trailing slash, symlink) can no longer make the
  producer write an artifact the gate would reject. The cross-set / wrong-level
  rejection is unchanged.

### Added (Set 067 S4 — path-aware-critique producer)

- **`produce_path_aware_critique()` + `python -m ai_router.pull_critique
  <session-set-dir>`** (`ai_router/pull_critique.py`): the opt-in automated
  producer. Drives `pull_route` once per provider (default GPT-5.4 + Gemini-Pro)
  over a read-only repo sandbox, reuses the manual `path-aware-critique.md`
  template as the critique instruction, and assembles + writes the Set 066
  `path-aware-critique.json` envelope. **Refuses to write a gate-failing
  artifact**: requires `>= 2` distinct providers with usable verdicts (a failing
  provider is skipped, not fatal), stamps `sessionSetName` + the recorded
  `pathAwareCritique` level for the gate's identity check, and validates the
  envelope with the same runtime validator the gate uses before writing.
  Exposed as `produce_path_aware_critique`, `build_instruction`,
  `ProducerResult`, `PullCritiqueError`, `DEFAULT_PROVIDERS`.

### Docs

- **`ai_router/docs/pull-verifier.md`** — the adapter + producer reference
  (invariants, the three bindings, config, CLI/programmatic use, Set 068
  deferrals).
- The Set 066 manual-flow docs (`docs/path-aware-critique-schema.md` and the
  `path-aware-critique.md` template) gain an **"automated alternative
  (opt-in)"** note pointing at the new producer.

### Capability evidence

- Experiment A (S3, cross-provider verified) confirmed path-aware capability:
  on identical frozen code the adapter caught 5 cross-file defects (incl. 2
  Criticals) routed single-shot missed, while routed caught nothing path-aware
  missed; the edge is context-access, not a second provider. See
  `docs/session-sets/067-pull-verifier-adapter-experiment-a/experiment-a-results.md`.

## [0.20.0] — 2026-06-15 (Set 066 — Path-Aware Critique policy)

Ships the **tier-orthogonal** Path-Aware Critique policy: a per-set attribute,
a saved multi-provider critique artifact contract, a blast-radius predicate, and
a net-new content-aware close-out gate that institutionalizes the manual
operator-run path-aware review (GitHub Copilot driving GPT-5.4 + Gemini-Pro over
the repo). The automated tool-loop adapter is deferred to Set 067; routed
per-session verification is unchanged.

### Added (Set 066 S1 — policy surface + artifact contract)

- **`pathAwareCritique` per-set attribute** (`none` | `advisory` | `required`,
  default `none`), parsed from the spec's Session Set Configuration block and
  recorded **once at set start and immutable thereafter** as an
  `activity-log.json` entry (`kind: "path_aware_critique"`). Tier-orthogonal —
  valid on both Full and Lightweight. Mirrors the Set 057 `verificationMode`
  machinery. `start_session --path-aware-critique <level>` seeds/records it.
  (`ai_router/path_aware_critique.py`.)
- **Multi-provider critique-artifact contract + validator.** A saved
  `path-aware-critique.json` (`docs/path-aware-critique.schema.json` +
  `docs/path-aware-critique-schema.md`) with a pure-Python runtime validator
  `validate_path_aware_critique_artifact` (no `jsonschema` dependency at
  runtime): requires `>= 2` **distinct** providers and content-non-trivial
  entries; never raises on a malformed/missing artifact.
- **Blast-radius predicate** `python -m ai_router.blast_radius <paths…>`
  (`ai_router/blast_radius.py`): the `P_set = any(P_task)` heuristic that
  classifies a set's surface (cross-artifact / shared-schema / wiring / index)
  and **recommends** a level — advisory only; never a hard auto-set.

### Added (Set 066 S2 — net-new content-aware close-out gate)

- **`validate_path_aware_critique_gate`** + `close_session` wiring: on the
  set-terminal close, when the recorded policy is `advisory` or `required`,
  confirms a valid multi-provider artifact exists. `required` **hard-blocks in
  an interactive TTY / soft-warns headless** (the Set 057 Q6 fail-posture);
  `advisory` always soft-warns; `none` skips. Net-new on the Full-tier close
  path (the Lightweight-only `dedicated-verification` gate could not be reused —
  a verified erratum to the Set 065 proposal). Fail-open in the non-block
  direction; emits `closeout_failed` with
  `failed_checks: ["path_aware_critique_gate"]` on a hard block.

### Added (Set 066 S3 — manual workflow + reusable prompt template)

- **Reusable prompt template** `ai_router/prompt-templates/path-aware-critique.md`
  — the canonical operator prompt for the end-of-set, multi-provider,
  path-aware critique (Copilot driving GPT-5.4 + Gemini-Pro), generalized from
  the Set 066 design-critique prompts.
- **Workflow docs.** New *end-of-set Path-Aware Critique stage* in
  `docs/ai-led-session-workflow.md`; pointers in
  `docs/planning/session-set-authoring-guide.md` and
  `docs/planning/project-guidance.md`.
- **Dogfood.** This set declares `pathAwareCritique: required` and is gated by
  its own close-out gate — the first real instance of the practice.

### Fixed (Set 066 S3 — hardening from the dogfood critique)

The set's own multi-provider path-aware critique (GPT-5.4 + Gemini-Pro) caught
four real defects, all fixed before release:

- **Corrupt `activity-log.json` could silently disarm the gate.** A policy of
  `required` collapsed to `none` on an unreadable log, skipping the gate. The
  set-terminal close now emits a loud, non-blocking warning instead of
  disarming silently (new `path_aware_critique_record_unreadable` helper).
- **A stale/copied artifact from another set satisfied the gate.** The gate now
  enforces **artifact identity** — the artifact's `sessionSetName` must match
  the set and its `pathAwareCritique` must match the recorded policy level.
- **Validator/JSON-Schema parity gaps.** The pure-Python validator now
  type-checks optional fields (`critiquedAt`, `blastRadius`, finding
  `severity` / `category`) and rejects a non-integer `schemaVersion` (float
  `1.0` / boolean `True`), matching strict JSON Schema evaluation.
- **Regression tests** added for all four failure modes.

## [0.19.0] — 2026-06-14 (Set 064 — guidance lifecycle & pruning)

### Added (Set 064 — steady-state lifecycle D1–D5)

- **Guidance cost reporter** (`python -m ai_router.guidance_report`,
  `ai_router/guidance_report.py`). Prints the recurring overhead of the
  always-loaded guidance files — bytes and an estimated token count
  (`ceil(chars/4)` proxy), per file and combined — against the ceilings.
  Read-only by default; `--write-headers` stamps an auto-generated
  `<!-- guidance-overhead: ... -->` header into each capped file and
  `--check` exits non-zero when over ceiling. ASCII-only terminal output
  (cp1252).
- **Per-lesson metadata schema + round-trip parser**
  (`ai_router/guidance_meta.py`) and a validator
  (`python -m ai_router.validate_guidance_meta`). Lessons carry a
  one-line HTML-comment trailer (`id`, `added-set`, `last-used-set`,
  `status`, optional `superseded-by` / `encoded-in` / `scope`) that the
  parser round-trips while preserving human readability.
- **Citation-at-close keystone.** `close_session` records
  `disposition.lessons_cited` into the close-out event, and
  `python -m ai_router.cite_lessons --set <N> <id> …` updates each cited
  lesson's `last-used-set` inside the pushed work. The no-citation
  default is inert (silence never auto-evicts).
- **Active/archive split.** `python -m ai_router.guidance_search
  --archive` greps the never-auto-loaded `lessons-archive.md`; the move
  rule is "never delete; move active → archive".
- **Guidance config** (`ai_router/guidance_config.py`, optional
  `guidance:` block in `router-config.yaml`): `active_lessons_ceiling_tokens`
  (10,000), `project_guidance_ceiling_tokens` (6,000), `disuse_window_sets`
  (20). Ceilings are a hard backstop (sweep-before-add), not the archive
  trigger; archival is evidence-based and operator-reviewed.

### Added (Set 064 — backlog remediation D6)

- **Routed bulk-triage helper** (`ai_router/guidance_triage.py`):
  classifies each heading-delimited block of an over-budget lessons file
  as `keep-active | archive | promote | merge | drop`, projects the
  post-remediation active-tier size against the ceiling, and writes an
  operator-reviewed proposal without editing the target file. The
  deterministic surface (byte-exact offset-slice extraction, projection,
  truncation-aware batching) is pure and unit-tested with an injected
  `route_fn`; raw routed output is persisted UTF-8 before any display.

> Canonical reference: `docs/guidance-lifecycle.md` (steady-state) and
> `docs/guidance-backlog-remediation.md` (one-time over-budget recipe).

## [0.18.0] — 2026-06-12 (metrics session-set normalization)

### Changed

- Metrics: `session_set` is normalized to the bare session-set folder
  name at the write boundary (`record_call` / `record_adjudication`)
  and on read in the report's per-set breakdown. Callers historically
  passed three shapes — the slug, `docs/session-sets/<slug>`, and an
  absolute set-dir path — which fragmented per-set cost aggregation
  across multiple keys and leaked machine-specific paths into
  `router-metrics.jsonl`. Existing log lines are untouched; the
  extension's Cost Dashboard (≥0.31) normalizes on read as well, so
  historical mixed-shape lines aggregate correctly everywhere.

## [0.17.0] — 2026-06-12 (Set 062 — Lightweight verification affordance)

### Added (Set 062 S3 — sanctioned Mode A -> Mode B transition)

- **`python -m ai_router.change_verification_mode <session-set-dir-or-slug>`**
  — the blessed writer for the sanctioned `out-of-band-or-none` ->
  `dedicated-sessions` transition on a Lightweight set that has already
  started (Set 062 D4). Appends a superseding
  `kind: "verification_mode_change"` record to `activity-log.json`,
  gated fail-loud: Lightweight tier; effective recorded mode
  `out-of-band-or-none`; no `type: verification`/`remediation` session
  in the ledger; nothing in flight; target `dedicated-sessions` only
  (A->B — B->A is refused; the locked rationale: A->B is purely
  additive, so it does not violate why the Set 057 capture is
  immutable, but it must be **recorded, not snuck past** the capture).
  Exit 0 on success, 3 on gate refusal; `--json` emits a machine
  envelope (`{ok, code, reason, record}`) for programmatic consumers
  (the VS Code extension's `Set Up Dedicated Verification…` action on
  completed Mode-A rows spawns this CLI).
- **`dedicated_verification.change_verification_mode(...)`** /
  **`VerificationModeChangeResult`** — the library surface behind the
  CLI, with stable `refused-*` reason codes per gate.
- **`VERIFICATION_MODE_CHANGE_ENTRY_KIND`** (`"verification_mode_change"`)
  — the new activity-log record kind.

### Changed

- **`read_verification_mode(...)`** now honors the latest valid record
  of either kind (`verification_mode` or `verification_mode_change`,
  file order, last wins) — so the Q6 set-terminal close gate, the
  seven-state derivation, and the content-aware validator all follow a
  sanctioned transition with no other change. (`start_session --type …`
  never reads the mode — audited empirically in Set 062 S3 — so typed
  sessions work immediately after the transition.)
- **`has_verification_mode_record(...)`** recognizes both kinds, so the
  once-at-set-start capture stays a no-op after a blessed transition —
  closing the audit-found hazard where a later `start_session` on a set
  whose only record is a `verification_mode_change` could re-record a
  stale spec seed after it and silently revert the transition.

### Fixed (Set 062 S5)

- The migrator CLIs (`migrate_v3_to_v4`, `migrate_session_state`,
  `migrate_lightweight_to_canonical_v4`) and `check_migrations` printed
  Unicode arrows / em-dashes in console output, crashing with
  `UnicodeEncodeError` under Windows `cp1252` consoles — the encoding
  the VS Code extension's spawn pipes inherit, so the Explorer's
  **Migrate to v4 schema** / **Upgrade older session sets** actions
  reported failure (exit 1) even though the in-place write had already
  succeeded. Output is now ASCII-only per the repo CLI convention.

## [0.16.0] — 2026-06-05 (Set 057 — Lightweight dedicated verification sessions)

Replaces the Lightweight tier's semi-manual copy/paste review-prompt step
with an optional, bounded **dedicated verification/remediation-session**
workflow (`verificationMode: dedicated-sessions`): a blessed verification
session runs on a different engine, a hand-off close chains an optional
remediation session and a bounded re-verification loop, and a
content-aware close-out gate confirms the cross-provider path actually
ran. Reuses the existing `sN-issues.json` / `disposition.json` /
`session-state.json` artifacts rather than inventing a parallel
vocabulary. Audit-locked in Set 057 S1 (cross-provider consensus);
schema + writer landed in S2; this release wires the operator-choice
capture, the Q6 close-out gate strength, and the verification->remediation
hand-off. Additive and backward-compatible: Full tier is untouched
(`verificationMode` is inert there) and the new session `type` defaults
to `work` / is absent on every existing entry.

### Added

- **`register_typed_session_handoff(...)`** in `session_state.py` — the
  **hand-off close** writer. Atomically marks the in-flight typed
  (`verification` / `remediation`) session complete and opens the
  follow-on typed session in-progress, so a non-terminal verification
  close never leaves `sessions[]` all-complete-while-in-progress (which
  the rule-6 invariant rejects) and `close_session` never mis-reads it as
  a set-terminal close. Grows the runtime `totalSessions` by one; emits
  `closeout_succeeded` (with `handoff: true`) + `work_started` events.
- **`start_session --verification-mode {dedicated-sessions,out-of-band-or-none}`**
  — records the operator's per-set choice once at set start (the durable
  record is an `activity-log.json` `kind: "verification_mode"` entry).
  CLI flag wins; otherwise a spec.md Session Set Configuration
  `verificationMode:` field seeds it (recorded only when no choice exists
  yet). Omitting both leaves the default `out-of-band-or-none` implicit
  (strictly opt-in).
- **`dedicated_verification.resolve_and_record_verification_mode(...)`,
  `read_spec_verification_mode(...)`, `has_verification_mode_record(...)`**
  — the capture helpers behind that flag (CLI choice > spec.md seed >
  nothing; creates a minimal `activity-log.json` when one is absent).
- **Set 057 Q6 close-out gate in `close_session`** — when
  `verificationMode == dedicated-sessions`, the content-aware close-time
  validator runs on the **set-terminal** close. If it cannot confirm a
  *different-engine* verification session ran, the gate **hard-blocks in
  an interactive TTY** (exits `gate_failed`, prints the corrective, emits
  `closeout_failed` with `dedicated_verification_gate`) and **soft-warns
  in non-TTY / headless** (or under `--accept-suggestions`). Fires only on
  the set-terminal close; non-terminal work-session closes are never
  blocked. Fail-open in the non-block direction.

### Changed

- **`validate_dedicated_verification(...)`** gained an optional
  `closing_session_number` keyword. The terminal close of a single-round
  happy path closes the verification session itself, which is still
  in-progress at gate time; passing its number lets the validator count
  it as the just-completed verification it is. Default `None` preserves
  the S2 "completed sessions only" semantics for every other caller.

### Docs

- `docs/ai-led-session-workflow.md` Step 6 — Lightweight verification
  rewritten as **per-set** (Set 057 L1) with two modes
  (`out-of-band-or-none` copyable prompts; `dedicated-sessions` typed
  sessions), the generic typed-session procedure, bounded rounds (1-2
  automatic, 3+ human), re-verify-only-after-real-changes, narrow later
  rounds, remediation-evaluates-the-verification-method-first,
  Critical/Major-non-fix -> `awaiting-human`, the seven derived states,
  the close-out gate, and the operator-initiated `second-opinion`
  tie-breaker (L4).
- `docs/planning/session-set-authoring-guide.md` — `verificationMode`
  field semantics + capture mechanism, and the session `type` values.

## [0.15.0] — 2026-06-02 (Set 054 — verificationVerdict persistence)

Wires the cross-provider verifier's pass/fail outcome through to
`session-state.json`'s per-session `verificationVerdict` field, which
has been null on every router-closed session since the field was
introduced in Set 047. Audit-first (Set 054 S1 cross-provider design
consensus, `docs/proposals/2026-06-02-verification-verdict-persistence/`):
three-layer root-cause confirmed (caller drops arg + no field in
Disposition + no source at all); verdict domain locked before
implementation.

### Added

- **`Disposition.verification_verdict`** — new optional field on the
  `Disposition` dataclass (and the on-disk `disposition.json` artifact).
  On the `api` verification path, the orchestrator sets this to the
  verifier's `"VERIFIED"` or `"ISSUES_FOUND"` value after Step 6.
  Omit-null: the key is absent from disk when verdict is not set (older
  readers that pre-date this field never see an unexpected key).
- **`CANONICAL_VERDICTS = ("VERIFIED", "ISSUES_FOUND")`** — module-level
  constant in `disposition.py`; `validate_disposition` warns to stderr
  on non-canonical explicit values but never drops or errors (preserves
  the documented enum-non-enforcement reader contract).
- **`resolve_close_verdict(disposition)`** in `close_session.py` —
  three-level precedence: (1) explicit `disposition.verification_verdict`
  verbatim, wins even under `--force`; (2) `api`-status-derived fallback
  (`completed`→`VERIFIED`, `failed`/`requires_review`→`ISSUES_FOUND`),
  with a soft stderr note; (3) `None` (manual / skipped / `--no-router` /
  missing disposition). The fallback preserves backward compatibility for
  dispositions written before this field existed.
- **`closeout_succeeded` event now carries `verdict`** (omit-null) —
  the resolved verdict is threaded into the event payload so forensic
  walks of `session-events.jsonl` can see the outcome without reading
  the state file.
- **`verification_completed` event drops the hardcoded
  `"manual_attestation"` payload** — previously the event always carried
  the string `"manual_attestation"` regardless of what the verifier
  returned; now it carries the resolved verdict (or is omitted when null).

### Changed

- **`close_session.run()`** now calls
  `_flip_state_to_closed(..., verification_verdict=verdict)` on the
  success path, persisting the resolved verdict to the per-session
  `sessions[N].verificationVerdict` field in `session-state.json`.
  Previously the argument was always omitted, leaving the field null.
- **`disposition_to_dict` / `disposition_from_dict`** updated to
  include the new field with omit-null serialization.
- **`disposition.schema.json`** updated with the new optional
  `verification_verdict` field.

### Docs

- `docs/session-state-schema.md` — `verificationVerdict` description
  updated to note the source (`disposition.verification_verdict` via
  `resolve_close_verdict()`); the false `--no-router` claim of recording
  `"manual"` corrected to `null`.
- `docs/disposition-schema.md` — new `verification_verdict` field row
  added with usage guidance.
- `docs/ai-led-session-workflow.md` — Step 6 gains item 6 (record the
  verdict in `disposition.json`); Step 8 disposition-authoring section
  updated to list `verification_verdict` as a required field on the api
  path; Lightweight Step 6 corrected (`null`, not `"manual"`); Rule 16
  updated to name `start_session` / `close_session` CLIs and drop the
  stale `register_session_start` / `mark_session_complete` references.
- `ai_router/docs/close-out.md` — `verificationVerdict` and
  `orchestrator` rows in the Section 0 field table corrected (verdict
  now sourced from disposition; orchestrator preserved, not cleared —
  Set 049 retired the check-in clear); Section 2 orchestrator-check-in
  paragraph updated to reflect the Set 049 state; Section 3 step 9
  updated from stale `mark_session_complete` / orchestrator-clear to
  the actual `_flip_state_to_closed` call.

## [0.14.0] — 2026-05-30 (Set 051 — ai_router hygiene & dead-code audit)

Pure internal cleanup: removes a stranded subsystem, fixes packaging
hygiene, and relocates misplaced tests — no behavior change to any live
`ai_router` code path. Audit-first (Set 051 S1 cross-provider verdict,
`docs/proposals/2026-05-29-ai-router-hygiene/`): every removal cites a
zero-live-caller finding. Companion VS Code Marketplace release:
`dabbler-ai-orchestration 0.26.0` (the superseded Claude `SessionStart`
hook retirement — extension-only). The intervening `0.13.0` (Set 053)
was never tagged/published to PyPI; this release supersedes it and the
single `0.12.0 → 0.14.0` PyPI release carries both sets' changes.

### Removed

- **The orphaned `ai_router/joiner/` subpackage** (`__init__`, `__main__`,
  `cli`, `coverage`, `parsers`, `schema`, `conflicts`) **and
  `ai_router/dabbler_launch.py`**, plus their 7 dead tests (~3,700 LOC).
  The joiner CLI's only live caller was the extension's `HarvestService`,
  deleted in Set 049 when the harvest UI was reverted (P4); the island
  then referenced only itself. Reachability was re-verified (no reflective
  load, no `__init__` re-export, no consumer/entry-point caller). The
  removal commit's parent is tagged **`pre-joiner-removal`** for zero-cost
  recovery.
- **The long-broken `backfill_session_state` console-script entry point.**
  It pointed at a top-level `ai_router.backfill_session_state` module that
  has never existed (the file lives at
  `ai_router/scripts/backfill_session_state.py`), so the installed script
  always `ModuleNotFoundError`'d. Retired rather than repointed: `scripts/`
  has no `__init__.py` and is excluded from the wheel, so the target is not
  importable from an installed package either. The utility remains runnable
  from a source checkout via `python ai_router/scripts/backfill_session_state.py`.

### Added

- **`ai_router/writer_discipline.py`** — the D3 writer-bypass detector
  (`detect_writer_bypass`), salvaged out of the deleted
  `joiner/conflicts.py` before the island was removed. Set 049 deliberately
  retained this check; it is preserved here as a self-contained module with
  the needed island symbols inlined (`SessionStateView`,
  `scan_session_states`, `canonicalize_cwd`, `parse_iso`) so it has **no
  residual `joiner` import**. Covered by `test_writer_discipline.py`.
- **`test_packaging_hygiene.py`** — wheel-contents regression assertion: the
  built package contains no `test_*` module and none of the removed dead
  modules, guarding against regrowth.
- **`test_entry_points.py`** — import/acceptance test for every declared
  `[project.scripts]` target, so a broken entry-point path cannot ship
  again.
- **`MIGRATIONS.md`** — documents the v2→v3→v4 migrator order so the
  "how do I migrate?" question is answerable from the names; each
  migrator's docstring states its from→to versions. No migrator logic was
  consolidated (the four-way split is correct as-is; distinct shapes +
  047/050 regression history make a merge high-risk, low-reward).

### Fixed

- **Relocated the two stray `test_*` files** from `ai_router/scripts/` to
  `ai_router/tests/` (`test_session_state_backfill.py`,
  `test_dump_session_state_schema.py`) — they previously shipped to PyPI
  consumers and ran from neither location (`pytest.ini` `testpaths`
  excluded `scripts/`). Fixing them surfaced and corrected three latent
  bugs in the live `scripts/` utilities: `dump_session_state_schema.py`'s
  `_FIELD_COMMENTS` still listed 7 legacy top-level keys dropped in v4
  (trimmed to the 5 canonical); both utilities' standalone `sys.path`
  bootstrap inserted the script's own dir instead of its parent, so the
  pyproject "runnable from a source checkout" claim was false until fixed
  (`parent` → `parent.parent`).
- **Dependency audit** (V9): confirmed no `pyproject.toml` dependency was
  used **only** by the deleted island — `httpx`/`pyyaml` etc. are used
  broadly; nothing to drop.

## [0.13.0] — 2026-05-29 (Set 053 — Lifecycle-embedded schema-drift advisory)

Moves the schema-drift warning out of the Claude-Code-only `SessionStart`
editor hook (Set 050) and into the **script-driven session lifecycle**, so
it fires for every orchestrator (Claude, GitHub Copilot, Codex, human) at
every boundary on every host — with no editor hook, CI job, or git hook
required. No Marketplace extension release this set (`ai_router`-only).

### Added

- **`check_migrations.summarize_drift(scan_root=None)`** — returns a terse,
  ASCII-only one-line warning when any session set under `scan_root` is on
  an older schema than this install supports, or `None` when clean. Reuses
  `detect_drift`; **non-blocking and fail-open** (swallows its own errors
  and returns `None` so a scan failure can never disrupt a session
  boundary).

### Changed

- **`start_session`** now runs `summarize_drift` after the boundary write
  and prints any warning to **stderr**. The warning **never** changes the
  exit status. This is the primary lifecycle trigger — because every
  orchestrator runs `start_session` regardless of editor/host/CI, the
  drift advisory now reaches GitHub Copilot and other non-Claude
  workflows that the Set 050 editor hook never covered.
- **`close_session`** emits the same advisory as a soft note to stderr
  after a close, under the identical non-blocking/fail-open contract.

`check_migrations` itself is unchanged and remains the optional, richer
manual tool; nothing about this set mandates CI. Design rationale and the
audit record (including why a CI-centric design was proposed and then
rejected in favor of the lifecycle approach) are in
`docs/proposals/2026-05-29-ci-agnostic-drift-enforcement/`.

## [0.12.0] — 2026-05-29 (Set 050 — Schema-drift guard + number-prefix addressing)

Ships the Python side of Set 050: a detect-only schema-drift scanner, a
declarative advisory manifest, and a number→slug resolver. The pure-JS
hot-path drift scan (the guard the incident actually required) lives in
the extension's `claude-session-start-invoker.js`, not this package —
it deliberately has **no `ai_router` dependency** so it still runs on a
repo with an ancient pinned router. Companion VS Code Marketplace
release: `DarndestDabbler.dabbler-ai-orchestration 0.25.0`.

### Added (Set 050 S4 — number→slug resolver, Feature 2)

- **`python -m ai_router.resolve_set`** — resolve a bare session-set
  number to its full slug within `./docs/session-sets`. Exact
  integer-prefix match with leading zeros normalized; collision names
  both candidates; no-match lists the available numbers (no fuzzy
  "nearest"). `<n>` resolves a number; `--next` prints the next
  monotonic `NNN-` prefix (`max(existing)+1`, zero-padded to
  `max(3, widest existing prefix)`, `001` if none); `--json` for
  machine consumers. Backed by `resolve_slug` / `resolve_set` /
  `next_session_set_number` / `resolve_session_set_dir` helpers.
- **`start_session --session-set-dir <n>`** now accepts a bare number
  (e.g. `50`) that resolves within `./docs/session-sets`; a path
  argument passes through unchanged.

### Added (Set 050 S2 — schema-drift detection, detect-only)

- **`python -m ai_router.check_migrations`** — a detect-only schema-drift
  scanner. Walks `<scan>/*/session-state.json`, compares each
  `schemaVersion` to the version this installation supports
  (`SESSION_STATE_SCHEMA_VERSION`), and reports any set on an older schema
  with the bulk-upgrade command. Never writes state files. Exits non-zero on
  drift/ahead/unreadable for CI use (`--exit-zero` suppresses). Flags:
  `--scan`, `--target`, `--verbose`, `--json`, `--manifest-url`,
  `--strict-manifest`. Output is ASCII-only (Windows cp1252 consoles cannot
  encode non-ASCII glyphs).
- **`docs/schema-current.json`** — a declarative, advisory schema manifest
  (manifest version, current schema version, minimum router version, doc
  URLs, and symbolic migrator IDs + version ranges). Consulted **off the
  hot path** via `check_migrations --manifest-url` (cached, fail-open);
  `--strict-manifest` flips it to fail-loud for CI. Carries **no executable
  shell strings** — migrator-ID→command resolution lives in local code. A CI
  test pins `manifest.currentSchemaVersion == SESSION_STATE_SCHEMA_VERSION`.

  **Bulk-upgrade chain correction (deviation from the S1 verdict).** The S1
  audit (verdict Q7) locked the bulk sequence as two migrators
  (`lightweight-to-v4` then `v3-to-v4`) and claimed it handled "a v2 set
  that needs both steps." The S2 carried-risk-#2 test falsified that
  empirically: a genuine v2 file (explicit `schemaVersion: 2` with the
  legacy currentSession/totalSessions/completedSessions triple) is **skipped
  by both** of those migrators. The v2→v3 step belongs to a third existing
  migrator, `migrate_session_state`, which the verdict omitted. The corrected,
  test-verified bulk chain (adds no new migrator logic — orchestrates an
  existing one) is: `migrate_session_state` → `migrate_lightweight_to_canonical_v4`
  → `migrate_v3_to_v4`, each `--in-place`, each idempotent. Flagged for the
  S5 cross-provider verifier.

## [0.11.0] — 2026-05-27 (Set 049 — Orchestrator coordination removal)

Rips out the hard-coordination layer shipped in Set 033 (0.6.0) and
refined in Set 036 (0.7.0). The `orchestrator` block on the per-session
ledger reshapes from 7 fields to 4 (`engine`, `provider`, `model`,
`effort`) with an omit-null writer pattern. The `new_chat_id` CLI is
retired; vestigial flags survive as accept-with-warning for backward
compatibility. Companion VS Code Marketplace release:
`DarndestDabbler.dabbler-ai-orchestration 0.24.0`.

### Breaking

- **`python -m ai_router.new_chat_id` CLI removed.** The module is
  gone; consumers calling it directly will get `ModuleNotFoundError`.
  No replacement — the chatSessionId concept it served is retired.
- **Orchestrator block fields `chatSessionId`, `checkedOutAt`,
  `lastActivityAt` no longer written.** The on-disk shape drops these
  3 fields. Readers ignore them on legacy files; the
  `migrate_v3_to_v4` migrator strips them from historical files on
  invocation.
- **Exit code `EXIT_CHECKOUT_CONFLICT` retired.** `start_session` no
  longer emits this code. The two-different-holders case that it
  guarded against is no longer a refusal scenario.
- **Holder-identity / takeover-prompt / Read-Only-Mode contracts
  retired.** `start_session` no longer interrogates the prior
  orchestrator block; any caller can claim a not-in-flight session
  regardless of who ran the previous one. Within-set sequential
  (one in-progress session per set) is still enforced.

### Changed

- **`start_session` writer reduced.** Removed
  `EXIT_CHECKOUT_CONFLICT`, `prior_engine_provider` matching, takeover
  modal / TTY prompt, `_coordination_enforced()` gate, and the
  `orchestrator_chat_session_id` writer parameter. The orchestrator
  block emitter applies omit-null on the 4-field result.
- **CLI backward compatibility — accept-with-warning (T2).**
  `start_session --chat-session-id <id>` (and any other vestigial
  flag) is accepted by argparse and ignored by the writer with a
  single stderr line per invocation:

  ```
  start_session: --chat-session-id is no longer used (Set 049); ignoring
  ```

  Consumer-repo hooks that still pass the flag keep working without
  modification. The flag will be removed in a future major release.
- **`close_session` simplified.** Check-in branch removed. The
  per-session orchestrator block stays attached to its `sessions[i]`
  entry as a historical record (no top-level clearing).
- **`migrate_v3_to_v4` extended with T4 sweep+normalize.** Strips
  `chatSessionId`, `checkedOutAt`, `lastActivityAt` from all
  orchestrator blocks (top-level legacy + per-session ledger) during
  the migration pass. Idempotent on already-clean v4 files. `.bak`
  rollback preserved.
- **`writer-bypass` detector (D3) kept, decoupled.** Survives in
  `ai_router/joiner/conflicts.py` as a general writer-discipline
  check, documented as engine-independent. Its sibling detectors
  (`bare-touch` / `engine-mismatch` / `stale-checkout-touch`) are
  retired — see Removed below.

### Removed

- **`ai_router/new_chat_id.py`** — whole CLI retired.
- **`ai_router/joiner/conflicts.py` D1/D2 detectors** —
  `bare-touch` (incompatible with omit-null engine field),
  `engine-mismatch` and `stale-checkout-touch` (both depended on
  `lastActivityAt`). `ConflictKind` Literal narrowed to
  `"writer-bypass"` only.
- **`session_events.py` holder_change + checkout_conflict
  emission** — event-type-emission calls deleted; existing JSONL
  entries in legacy ledgers are left intact (audit history).
- **Tests retired (whole-file):**
  `test_chatsessionid_writer.py`, `test_checkout_writer.py`,
  `test_start_session_takeover_prompt.py`, `test_new_chat_id.py`.
  `test_joiner_conflicts.py` reduced to writer-bypass coverage only.

### Kept

- `~/.dabbler/orchestrator-writer.log` — retained as a generic
  "start_session ran" audit appender. May be retired in a future
  stability set if it proves dead.

## [0.10.0] — 2026-05-27 (Set 048 — Lightweight-tier parity)

End-to-end Lightweight parity with Full shipped across 5 sessions.
Adds `--no-router` mode with three-knob precedence (CLI flag >
`DABBLER_NO_ROUTER` env > spec.md `tier: lightweight` > default Full).
`route()` / `verify()` prologues short-circuit to zero-cost stubs
without `_init()` (no config load, no credentials needed).
`close_session` gains a manual-attestation block + soft gate for
`external-verification.md` with TTY/non-TTY branching and
`--accept-suggestions` non-interactive flag. Tri-state `requiresUAT` /
`requiresE2E` schema (`true | false | "suggested"`) on both Full and
Lightweight. `spec.md` `tier: full | lightweight` field with
backwards-compat default to `full`. New
`python -m ai_router.migrate_lightweight_to_canonical_v4` CLI handles
three Lightweight non-canonical shapes (`sessionLog[]` → `sessions[]`,
`done`/`completed` status aliases, missing schemaVersion) with
`.lwbak.json` backup. S5 UAT discovered and fixed a Critical
bare-import bug: production-code bare imports of `runtime_mode` /
`spec_config` (left over from S2's test-conftest convention) raised
`ModuleNotFoundError` under pip-install consumers, silently no-op'ing
`--no-router` across the entire CLI surface; the fix uses relative
imports and the bug is locked out by a new static-analysis test.
Companion VS Code Marketplace release:
`DarndestDabbler.dabbler-ai-orchestration 0.23.0`.

## [0.9.0] — 2026-05-26 (Set 047 — state-file schema v4 audit)

v4 evolution of `session-state.json` shipped end-to-end across 6
sessions. Derives every legacy top-level lifecycle field
(`currentSession` / `totalSessions` / `completedSessions` /
`lifecycleState` / `startedAt` / `completedAt` / `orchestrator` /
`verificationVerdict`) from a per-session `sessions[]` ledger where
each entry carries its own `startedAt` / `completedAt` /
`orchestrator` / `verificationVerdict`. Reader-first migration via
`normalize_to_v4_shape(state, spec_md_path)` shim that accepts
v1/v2/v3/v4 input transparently. New `python -m ai_router.migrate_v3_to_v4`
CLI with `.bak` rollback contract and documented rollback procedure
at `docs/v3-to-v4-rollback-procedure.md`. All Python writers
(`register_session_start` / `_flip_state_to_closed` /
`cancel_session_set` / `restore_session_set`) emit canonical v4
on-disk shape. New `spec.md` `prerequisites:` field surfaced via the
extension's `[BLOCKED BY PREREQS]` badge. Companion VS Code
Marketplace release:
`DarndestDabbler.dabbler-ai-orchestration 0.22.0`.

## [0.8.0] — 2026-05-25 (Set 045 — log-harvest implementation)

Dual-primary observability surface per Set 044's consensus-locked
proposal v1 shipped end-to-end across 6 sessions. New
`python -m ai_router.joiner` CLI is the async-shell-out the
extension calls to populate Session Set Explorer harvested-signal
badges (W / N / M / B for wrapper-launched / native-log /
narration-marker / writer-bypass) plus coordination-conflict pills
(engine-mismatch / bare-touch / stale-checkout-touch / writer-bypass).
Wrapper-launched detection and native-log parsing serve as co-equal
channels (Pass B framing-bias correction). Joiner output schema
documented for cross-tier consumer-repo paste-in. Companion VS Code
Marketplace release:
`DarndestDabbler.dabbler-ai-orchestration 0.21.0`.

> Note: The Set 045 Explorer surface (harvest badges + conflict pills)
> was reverted in Set 049 per operator-locked P4. The joiner CLI and
> its `writer-bypass` detector survive; the badge/pill rendering does
> not.

## [0.7.0] — 2026-05-24 (Set 036 — chatSessionId identity refinement + watcher-scope discipline)

Refines the Set 033 H4 holder-identity composite from
`engine + provider` to `engine + provider + chatSessionId` so two
distinct chats on the same engine are recognized as different holders.
Ships the per-set lifecycle lock (Q5 prerequisite) that serializes
`start_session` and `close_session` against each other across the
migration window. Ships the `new_chat_id` CLI as the agent-facing
token source for orchestrators with no native per-chat metadata
surface. Adds the `closeout_succeeded` event payload's Q4 audit-trail
extension. Companion VS Code Marketplace release:
`DarndestDabbler.dabbler-ai-orchestration 0.20.0`.

### Added

- **`chatSessionId` field on the `orchestrator` block.** New nested
  field, `string | null`. Strict-on-write (every new write populates
  the key; `--chat-session-id` arg, `$CHAT_SESSION_ID` env, or
  None). Tolerant-on-read for legacy state (key absent OR value
  None is treated as same-holder for engine + provider matches).
- **`start_session --chat-session-id <value>` CLI argument.**
  Defaults to `$CHAT_SESSION_ID` env when unset. Refines the H3
  holder-identity predicate to the H4 triple composite. Refusal
  stderr names both holders' chatSessionIds (or "no chat session ID
  recorded" for legacy).
- **`start_session` TTY-interactive takeover prompt (Q3).** When
  stdin AND stderr are both TTYs, a chatSessionId-only mismatch
  surfaces a 3-line menu (Take Over / Open in Read-Only Mode /
  Cancel) on stderr instead of refusing outright. Engine+provider
  mismatches stay on the non-interactive refusal path.
  - New exit code `EXIT_LOCK_CONTENTION = 5` (lifecycle lock
    contention; 30s default poll).
  - New exit code `EXIT_READ_ONLY = 6` (operator chose Read-Only
    Mode at the TTY prompt).
- **`ai_router.new_chat_id` CLI (Q1 fallback).** Mints a UUID v4
  per chat for orchestrators with no native session-id surface
  (Codex CLI, Gemini Code Assist, GitHub Copilot, manual Lightweight
  tier). Plain mode prints the UUID; `--export` emits a shell-eval-
  able line; `--shell bash|powershell|fish` selects syntax (default:
  detect via `$SHELL` first, then platform fallback). Idempotent
  within a shell session: existing non-empty `$CHAT_SESSION_ID`
  short-circuits the mint.
- **Per-set lifecycle lock (Q5).** `close_lock.py` renamed
  `.close_session.lock` → `.lifecycle.lock`; both `start_session`
  and `close_session` dual-acquire it (legacy `.close_session.lock`
  alias survives one release on read). `start_session` polls 30s
  before exiting `EXIT_LOCK_CONTENTION = 5`; `close_session` keeps
  its existing immediate exit-3 contract on contention.
- **`closeout_succeeded` event payload extension (Q4).** Now carries
  `chatSessionId`, `engine`, `provider`, `model` snapshotted from
  the orchestrator block BEFORE block-clear. Legacy state files
  without a block degrade gracefully by omitting the four identity
  fields rather than emitting empty strings.

### Changed

- **Holder-identity equality** is now the
  `engine + provider + chatSessionId` triple composite. Two chats
  with the same engine + provider but different chatSessionIds are
  now recognized as different holders (they would have silently
  collapsed onto a single holder under the Set 033 base composite).
- **`start_session` refusal message** names the existing
  chatSessionId (or "no chat session ID recorded" for legacy) and
  the two release paths.
- **Force-override audit log** carries both holders' chatSessionIds
  (or sentinels for legacy).

### Migration

- **Pre-0.7.0 state files** (no `chatSessionId` key in the
  orchestrator block) are tolerated on read. The first new write
  from any caller populates the field strictly. Legacy data is
  also tolerated when the field is present but value is `null`
  (Set 036+ writer's no-ID-at-write-time shape).
- **Lock-file path migration.** `.lifecycle.lock` is the new name;
  `.close_session.lock` survives as a read-only alias for one
  release window (`LEGACY_LOCK_FILENAME` in `close_lock.py`).
  External scripts that monitored the old lock filename should be
  updated to consult either name. Schedule for alias retirement
  TBD in a follow-on patch.

### Release notes

- **No breaking changes** to consumers that don't read the
  `orchestrator.chatSessionId` field. The field is additive; the
  tolerant-on-read contract preserves Set 033 behavior for state
  files written before 0.7.0.
- **Schema version unchanged** (still v3). The `chatSessionId`
  nests under the existing `orchestrator` block; no top-level
  structural change.

## [0.6.0] — 2026-05-21 (Set 033 — orchestrator check-out / check-in)

Ships the writer side of the check-out / check-in coordination
model anchored in `session-state.json`'s `orchestrator` block, per
the Set 032 audit verdicts. Companion VS Code Marketplace release:
`DarndestDabbler.dabbler-ai-orchestration 0.18.0`.

### Added

- **`start_session` hard-coordination gate (H3 + H4).** New exit
  code `EXIT_CHECKOUT_CONFLICT = 4` fires when the existing
  `orchestrator` block on `session-state.json` names a different
  `engine + provider` (H4 identity composite) than the caller and
  `--force` is not set. The refusal stderr names both the current
  holder and the two release paths (`--force`, "Release Check-Out"
  Command Palette action) so the operator can act without consulting
  external docs.
- **`--force` flag on `start_session` CLI.** Authority handoff;
  rewrites `checkedOutAt` to now and appends an audit line to
  `~/.dabbler/orchestrator-writer.log` (best-effort; failure to
  write the log does not block the override).
- **Nested timestamps on the `orchestrator` block (OQ1).**
  - `checkedOutAt` — set on fresh check-out / preserved across
    same-holder re-attach.
  - `lastActivityAt` — bumped on every write.
- **Cross-tier check-in.** `close_session` (via
  `_flip_state_to_closed`) clears the `orchestrator` block to
  `null` on every successful close, mid-set and final alike. The
  session boundary IS the release point. **Idempotent** — a close
  on a set whose block is already `null` lands the same write and
  reports `succeeded`.

### Changed

- **Holder-identity equality** is the `engine + provider` composite
  (H4). Two orchestrators with the same `engine + provider` but
  different `model` (e.g., `claude-opus-4-7` vs.
  `claude-sonnet-4-6` both on `claude + anthropic`) are treated as
  the same holder; model and effort update in place on a same-
  holder re-attach without resetting `checkedOutAt`.
- **Documentation aliases (OQ2).** In operator-facing prose,
  `work_checked_out` ↔ `work_started` and `work_checked_in` ↔
  `closeout_succeeded`. The ledger event names in
  `session-events.jsonl` are unchanged (no schema break).

### Migration

- **In-flight sets without `checkedOutAt`** (state files written by
  pre-0.6.0 writers that are still mid-set when 0.6.0 lands) are
  tolerated on read. The next `start_session` call from the same
  holder populates `checkedOutAt` with the current time — a one-
  time loss of fidelity (the actual original check-out moment is
  unknown) in exchange for not forcing a synchronous migration of
  every in-flight set across consumer repos.
- **Stranded check-outs** (state file says held but the holder is
  gone): use `start_session --force` from the would-be next holder,
  or "Release Check-Out" from the VS Code Command Palette. Both
  log the authority handoff to
  `~/.dabbler/orchestrator-writer.log`. See
  [`ai_router/docs/close-out.md`](docs/close-out.md) Section 4.

### Release notes

- **No breaking changes** to consumers that don't read the
  `orchestrator` block directly. The block grew two new nested
  fields and is now cleared on close (was: stayed populated
  between sessions). Consumers that scanned `session-state.json`
  to derive the current holder will start seeing `null` between
  sessions; if that breaks anything, the holder identity is
  derived from `session-events.jsonl` (`work_started` for the
  highest open session number).
- **Schema version unchanged** (still v3). The two new fields nest
  under the existing `orchestrator` block; no top-level structural
  change.
- **Tier symmetry preserved.** Full tier writers do the check-in
  automatically; Lightweight tier humans write `orchestrator: null`
  by hand at the same boundary alongside the manual
  `completedSessions[]` update.

### Reference

- [`docs/session-state-schema.md`](../docs/session-state-schema.md)
  "Check-out / check-in (Set 033)" — full schema + holder identity
  + invariants
- [`ai_router/docs/close-out.md`](docs/close-out.md) Section 4 —
  stranded-check-out recovery; Section 2 — check-in side effect
- [`docs/ai-led-session-workflow.md`](../docs/ai-led-session-workflow.md)
  "Orchestrator check-out / check-in (Set 033)" — workflow-level
  invariants
- [`docs/cross-repo-checkout-notice.md`](../docs/cross-repo-checkout-notice.md)
  — one-time consumer-repo CLAUDE.md insertion text

## [0.5.1] — 2026-05-19

### Fixed

- **`ruamel.yaml` packaging gap (pre-existing since Set 026 Session 3).**
  `ai_router/migrate_router_config.py` has imported `ruamel.yaml`
  at module load time since commit `fc2d117` (2026-05-12), but the
  dep was never declared in `pyproject.toml`. A fresh
  `pip install dabbler-ai-router` would `ModuleNotFoundError` on any
  attempt to `import ai_router.migrate_router_config` (including the
  three `test_migrate_router_config_*` test modules at collection
  time, and the supported `python -m ai_router.migrate_router_config`
  CLI invocation). 0.5.1 fixes both surfaces:
  - `migrate_router_config.py` now imports `ruamel.yaml` lazily via
    `_require_ruamel()`, called at the top of `migrate()`. The
    module itself imports cleanly without `ruamel.yaml` installed;
    users who actually invoke the migrator without the dep get a
    clear remediation message pointing at the `[migration]` extras
    group below.
  - `pyproject.toml` declares a new
    `[project.optional-dependencies].migration = ["ruamel.yaml>=0.17"]`
    extras group (install via `pip install dabbler-ai-router[migration]`).
    The `[tests]` group also picks up `ruamel.yaml>=0.17` so the
    test suite works on a clean `pip install -e .[tests]`.

### Release notes

- **Bug-only patch release.** No new features, no schema changes —
  the `decision_consensus` V1 schema from 0.5.0 ships unchanged.
- **Backwards compatibility.** The lazy-import refactor preserves the
  module's public API (`migrate()`, `main()`); only the import-time
  side-effects change. No consumer code calling
  `from ai_router.migrate_router_config import migrate` is affected.
- **Why this didn't fix 0.4.0 retroactively.** PyPI doesn't allow
  re-uploading the same version. `0.4.0` (and earlier) ship the
  pre-existing bug; users on those versions can either upgrade to
  0.5.1 or `pip install ruamel.yaml` manually as a workaround.

## [0.5.0] — 2026-05-19

### Added — Set 031 deliverables

- **`delegation.decision_consensus` config sub-block** in
  `ai_router/router-config.yaml`. Opt-in (default `enabled: false`,
  every existing repo unchanged) routing of in-session design /
  architecture / process decisions through cross-provider consensus
  *before* falling back to `AskUserQuestion`. V1 default categories
  are the four mechanical, high-convergence ones
  (`refactor-placement`, `file-layout`, `scoping`,
  `spec-clarification`); V1.5 adds `testing-strategy` + `api-surface`;
  V2 adds `design` + `architecture` once convergence on the narrower
  set has been observed. `unresolved_action` (`ask_user` |
  `proceed_with_orchestrator_judgment`) controls the fallback when
  the consult engines do not agree. `engines` is independent of
  `verification.preferred_pairings` — the two roles (verify vs.
  consult) may want different model pairings.
- **Schema validation in the config loader.** `_validate_decision_consensus`
  is invoked at the `load_config` boundary and rejects: invalid engine
  strings (`provider:model` parse + cross-check against the configured
  `models:` table, with model entries that omit `provider` rejected per
  the S1 Round-A finding), unrecognized category slugs (whitelist
  covers V1 + V1.5 + V2), bad `unresolved_action` enum values, and
  non-writable `journal_path` / `journal_full_payloads_dir` values.
  Unknown sub-keys are tolerated with a one-time warning per load,
  matching the existing config loader's forward-compatibility posture.
- **`ai_router/consensus_journal.py`** — JSONL writer for the
  per-decision audit trail. `ConsensusRecord` dataclass + atomic
  append (`append_record`: POSIX append + flush + best-effort fsync),
  `compute_question_hash` (sha256:-prefixed digest over
  question + category + ISO timestamp), `write_full_payload`
  (Markdown sibling file via temp+rename, one file per call,
  named `<ISO timestamp>-<hash>.md`), and a one-shot
  `write_consensus_record` convenience that combines the two. Input
  validation via `validate_record_inputs` (enum guards for category
  + unresolved_action).
- **AJV schema mirror** in
  `tools/dabbler-ai-orchestration/src/configEditor/schemaValidator.ts`
  so the visual config editor accepts the new sub-block alongside the
  Python loader — keeps the two implementations in parity.
- **`docs/ai-led-session-workflow.md` → "Decision-time consensus"
  section** documents the 6-step decision tree, the human-only vs
  consensus-eligible category split (table format), the journal
  record schema, the opt-in path, and three explicit limits-of-
  consensus guardrails.
- **Per-agent instruction-file pointers.** `CLAUDE.md`, `AGENTS.md`,
  and `GEMINI.md` each gained a byte-identical "Decision-time
  consensus (pointer)" section directing the orchestrator to the
  new workflow doc section.
- **33 new tests** (17 schema + 16 journal). Full `ai_router` suite
  was 599 passed before Set 031; now 633 passed + 1 skipped.

### Changed

- **`.gitignore`** now excludes `ai_router/consensus-decisions/` (the
  full-payload Markdown sibling directory, default-on but
  disk-heavy). The journal JSONL itself (`ai_router/consensus-decisions.jsonl`)
  stays committed, following the `router-metrics.jsonl` precedent so
  cross-conversation continuity for the audit summary is preserved.

### Release notes

- **`0.5.0` ships the V1 schema only.** The orchestrator-side wiring
  (the code that actually invokes `route(task_type='decision-consensus')`
  on hitting a consensus-eligible decision, synthesizes the
  recommendation, and routes the journal write) is not in this
  release — that lands in a follow-on session set. `enabled: true`
  in a consumer repo's `router-config.yaml` does not change behavior
  until the orchestrator-side wiring ships. The default is opt-out so
  this asymmetry is invisible to every existing consumer.
- **Backwards compatibility:** an existing `router-config.yaml` with no
  `decision_consensus` block continues to load and behave exactly as
  before. The schema is purely additive.
- **Consumer-repo notification.** As an operator-gated step alongside
  this release, `dabbler-access-harvester`, `dabbler-platform`, and
  `dabbler-homehealthcare-accessdb` CLAUDE.md files each get a one-liner
  pointer to the new workflow section. Those edits live outside this
  repo's working tree; consumers can adopt the feature without them by
  setting `delegation.decision_consensus.enabled: true` in their own
  `router-config.yaml` once the orchestrator-side wiring ships.

## [0.4.0] — 2026-05-17 (GA)

### Added — Session 5 deliverables

- **AI title-extraction strategy (`--strategy ai`) in the bulk
  migrator.** The Session 4 RC reserved the flag and raised
  `NotImplementedError`; this release wires it. Routes via
  `ai_router.route(task_type='spec-title-extraction')` and validates
  the response: exact JSON shape, count match against the spec's
  expected session count, numbered 1..N in order. Each failure mode
  has a distinct ``ACTION_FAILED_AI_*`` action code
  (`no-creds` / `provider-error` / `bad-output` / `count-mismatch`)
  so the in-extension lazy migrator can surface kind-specific
  notifications. ``RouteResult`` is dumped via ``dataclasses.asdict
  → json.dumps`` before any attribute access (per memory
  `feedback_ai_router_route_result_handling`). Per cross-provider
  design audit (2026-05-17, Option A locked): the route() call site
  lives in Python so the extension subprocesses the same migrator
  for all three strategies.
- **Structured exception classes** (`AiTitleResolutionError` and
  four subclasses) re-exported from `ai_router.migrate_session_state`
  for library callers.
- **10 new pytest cases** under `TestAIStrategy` covering each
  failure mode (missing credentials, 401 unauthorized, 429 rate
  limit, non-JSON output, truncated response, wrong-shape JSON,
  count mismatch with no silent truncate, out-of-order numbering,
  zero-count-state never-calls-route, plus a happy path + markdown
  code-fence stripping). All hermetic — mock `ai_router.route` via
  `sys.modules` injection; no real provider calls.

### Release notes

- **`0.4.0` is the Session 5 GA release.** Published to PyPI in
  lockstep with the dabbler-ai-orchestration extension v0.14.0 so
  operators upgrading the extension see the migration UX (which
  consumes this AI path) at the same time as the AI strategy
  becomes available.
- Schema v3, the bulk migrator, dual-write writers, and the eight
  invariants (all shipped in Sessions 1-4 of Set 030 under the
  0.4.0rc1 RC) are GA in this release.

## [0.4.0rc1] — 2026-05-17 (release candidate, not published)

### Added

- **`session-state.json` schema v3 (Set 030).** Replaces the v2
  progress triple (`currentSession` / `totalSessions` /
  `completedSessions`) with a single canonical `sessions[]` ledger.
  Status terminology unified on `"complete"` at both session and set
  level (the v2 `"done"` / `"completed"` aliases are tolerated on
  read, canonicalized on write). New writes carry `schemaVersion: 3`;
  read-side tolerates v2 indefinitely via `synthesize_v3_from_v2()`.
- **Single normalized progress helper (`ai_router/progress.py`,
  Session 1).** `get_progress()` is the canonical reader path; every
  application reader in `ai_router/` was migrated to it in Session 3
  (close-out gates, the reconciler, `start_session` preflight, the
  cost reporter). Direct reads of the legacy triple are forbidden in
  source under a pytest grep guard (D13 lint rule, also Session 3).
- **8 v3 invariants enforced by writers and readers (Sessions 1-2).**
  `register_session_start` and `_flip_state_to_closed` raise
  `SessionStateInvariantError` (re-exported from `progress`) on every
  rule violation — no silent recovery, no force-close fallback (spec
  D6).
- **Dual-write writers (Session 2).** Writers emit BOTH the v3
  `sessions[]` and the legacy triple (derived, never independently
  maintained) so consumer repos still on v2 readers see no
  disruption. The legacy emission stays in place for the entire
  Set 030 release window (spec D5); a future set may flip "stop
  writing legacy" once consumers confirm v3-reader migration.
- **Bulk migrator CLI (`python -m ai_router.migrate_session_state`,
  Session 4).** One-shot v2→v3 migration. Inferential (force-promote
  closed sets even when `completedSessions[]` was never populated).
  Strategies: `regex` (spec.md headings, default), `generic`
  (`Session N` labels), `ai` (reserved for Session 5),
  `interactive`. Idempotent. Dry-run default; `--in-place` to
  write. JSON output for CI hooks. See
  [`docs/migration-v3-dry-run.md`](../docs/migration-v3-dry-run.md).
- **`spec-title-extraction` task type registered in
  `router-config.yaml` (Session 1, per spec D14).** Pinned to
  `gemini-flash`; not auto-routed; the Session 5 in-extension AI
  fallback consumes it. Landing the task type early removes a
  Session 5 dependency risk.

### Schema

- `session-state.json` now carries `sessions[]` (required, non-empty,
  contiguous from 1, max one `"in-progress"`). The legacy
  `currentSession` / `totalSessions` / `completedSessions` are
  retained as derived dual-write fields.
- See [`docs/session-state-schema.md`](../docs/session-state-schema.md)
  for the canonical v3 reference (rewritten in Session 1).

### Release notes

- **`0.4.0rc1` is the Session 4 release candidate.** Not published to
  PyPI. The GA build (`0.4.0`) ships with Session 5, after the
  in-extension migration UX lands so operators never see broken v2
  state on first contact with the new release. The RC version exists
  so this repo can pin tests against the same wheel shape consumers
  will see after GA.
- Internal smoke test only: `python -m build` + `pip install
  dist/dabbler_ai_router-0.4.0rc1-py3-none-any.whl` from a clean
  venv; do NOT `twine upload`.

## [0.3.2] — 2026-05-16

### Fixed

- **`register_session_start()` now always emits `completedSessions[]` on fresh sets.** Previously, the function omitted the `completedSessions` key entirely when no prior sessions were closed (keeping the snapshot "clean"). This created schema inconsistency: Lightweight-tier orchestrators maintain this array by hand and could not append to a pre-existing `[]` when starting a fresh set. Now the key is unconditionally written (as an empty array on fresh sets), ensuring consistent schema across all sets and tiers. Set 028 Session 1.

### Behavior notes

- 0.3.2 is functionally identical to 0.3.1 for PyPI consumers. The patch bump clarifies that the schema is now normalized; no runtime code path changes.
- Backwards compatible: existing consumers that read `completedSessions` already handle its absence (defaulting to 0 done sessions). Adding an explicit `[]` is semantic no-op for those readers.

## [0.3.1] — 2026-05-16

### Added — repo-only test infrastructure (not in published wheel)
- **Python e2e harness (`ai_router/tests/e2e/`, Set 027).** Three
  modules under the repo's test tree: `fixtures.py` (tmpdir-scoped
  session-set generator with real git working tree + bare remote),
  `harness_cli.py` (thin JSON-over-stdout dispatcher used by the
  TS-side Layer 2 and Layer 3 harnesses), and seven scenario files
  covering happy-path, cancel/restore, force-close, sibling
  worktree, multiset-sequential, and the `register_session_start`
  `completedSessions[]`-loss regression that pinned the v0.1.1
  dabbler-platform incident shut. **These files are excluded from
  the published wheel** by `[tool.setuptools.packages.find]
  exclude = ["ai_router.tests", "ai_router.tests.*"]` — PyPI
  consumers get the same public API as 0.3.0; the harness is only
  available to contributors cloning the repo.
- **`e2e` pytest marker** registered in `pytest.ini` — partition the
  suite via `pytest -m e2e` (full harness) or
  `pytest -m "not e2e"` (fast pre-commit subset). Also repo-only;
  consumers running the wheel see no behavior change.

### Behavior notes (no API change)

- 0.3.1 is functionally identical to 0.3.0 for PyPI consumers. The
  patch bump exists to let the consuming extension declare a
  matching floor; there are no runtime changes between 0.3.0 and
  0.3.1.
- The harness depends on `register_session_start` preserving
  `completedSessions[]` across rewrites. The current writer at
  `session_state.py:148` does so when the field is present; the
  Layer 2 harness pinned a discrepancy on fresh-set writes where
  the key is omitted entirely (downstream readers' `Array.isArray`
  predicate then returns false). Fix deserves a targeted writer
  change in a follow-up set, not 0.3.1.

## [0.3.0] — 2026-05-15

### Removed — BREAKING

- **`outsourceMode: last` daemon infrastructure (Set 026 Session 1).**
  The queue-mediated verifier daemon path is gone end-to-end. Modules
  deleted: `queue_status`, `heartbeat_status`, `queue_db`,
  `queue_verification`, `daemon_pid`, `orchestrator_role`,
  `restart_role`, `role_status`, `capacity`, `verifier_role`.
- **Mode-config public surface:** `ModeConfig`, `OUTSOURCE_MODES`,
  `ROLE_VALUES`, `DEFAULT_OUTSOURCE_MODE`, `parse_mode_config`,
  `read_mode_config`, `validate_mode_config`.
- **Queue/daemon public surface:** `QueueDB`, `QueueMessage`,
  `DuplicateIdempotencyKeyError`, `VerifierDaemon`,
  `OrchestratorDaemon`, `FollowUpRequested`,
  `ORCHESTRATOR_TASK_TYPES`, `TASK_VERIFICATION_FOLLOWUP`,
  `TASK_VERIFICATION_REJECTED`, `UnknownTaskTypeError`,
  `make_dispatch_verifier`, `make_worker_id`, `process_one_message`,
  `run_verification`, `HEARTBEAT_INTERVAL_SECONDS`,
  `DEFAULT_POLL_INTERVAL_SECONDS`, the `daemon_pid` PID-file helpers,
  and `QUEUE_DEFAULT_BASE_DIR`.
- **`route()` parameters:** `mode=` and `queue_base_dir=` are gone.
  `route()` is now synchronous-only. `RouteResult` no longer has
  `pending`, `message_id`, or `queue_provider` fields.
  `VerificationResult` no longer has those fields either.
- **`close_session` CLI:** `--timeout` flag removed; exit code 4
  (`verification_timeout`) removed; queue-message-citation repair
  case removed; `_wait_for_verifications` no longer called.
- **`disposition.verification_method`:** value `"queue"` removed.
  Surviving methods are `"api"`, `"manual"`, and `"skipped"`.
  `verification_message_ids` is now required to be empty for every
  method (kept as a list field for schema stability).
- **`ai_router/docs/two-cli-workflow.md`** removed.
- **`reconciler.py`:** `rerun_verification_timeout` action removed.

### Changed

- **`cost_report.py`** simplified — removed the subscription-utilization
  block (`_build_subscription_utilization`, `_print_outsource_last_report`)
  and the mode-aware branch in `get_costs` / `print_cost_report`. JSON
  output no longer carries the `outsource_mode` or
  `subscription_utilization` keys.
- **`close_out.py`** simplified — single-path implementation that
  routes a fresh turn via `route_fn`. The mode-aware
  outsource-last-skip-route branch is gone; `close_session_runner`
  injection point is gone.

### Notes — Partial state (Session 1)

Set 026 Session 1 scrubbed the code surface and all active docs.
The acceptance criterion
`git grep -i 'outsourcemode\|queue_db\|verifier daemon\|subscription cli'`
returning zero hits is satisfied as of the Session 1 close commit.

### Added (Session 2 — budget-dialog simplification)

- **`verification_nte_usd` field in `budget.yaml`** — operator-stated
  not-to-exceed ceiling for cumulative API verification spend.
  Defaults to `threshold_usd` if absent. The orchestrator reports
  running spend against this ceiling at every session stop; if the
  ceiling is reached mid-session it switches to
  `manual-via-other-engine` rather than failing.
- **`ai_router/budget.yaml`** created for this repo with
  `threshold_usd: 10`, `verification_nte_usd: 10`,
  `verification_method: "api"`.

### Changed (Session 2 — budget-dialog simplification)

- **`docs/adoption-bootstrap.md` Step 5** — the four-tier budget
  dialog (less-than-$20 / $20–$99 / $100+, each with a different
  explanation) is replaced by a single NTE ask backed by empirical
  range data ($0.05–$0.80/call; 3-session set $0.15–$2.50). The
  $0 special case (manual vs. skipped) is unchanged. The
  tier-to-mode mapping comment in the field reference is preserved
  for backward compatibility.
- **`docs/ai-led-session-workflow.md`** — the four-row budget tier
  table collapses to two rows (zero-budget / non-zero budget);
  the 50%-of-threshold tier-upgrade prompt row is gone; the
  "What this means at session execution time" section now documents
  `verification_nte_usd` behavior.

### Added (Session 3 — YAML schema + Python reader + resolver abstraction)

- **`ai_router/secret_resolver.py`** — new module exporting
  `resolve_secret(name, source="env") -> str | None` and
  `register_backend(name, fn)`. The env-var backend is the only
  backend in Set 026; additional backends (secretStorage, keyring,
  etc.) can be registered by future sets without touching callers.
  Exported from the package public surface alongside `register_backend`.
- **`ai_router/migrate_router_config.py`** — idempotent forward
  migration script for `router-config.yaml` and `budget.yaml`. Injects
  `display_label`, `enabled` per provider, `routing.outsourcing_mode`,
  renames `threshold_scope` → `scope`, and injects `warn_at_percent: 80`.
  Preserves YAML comments via `ruamel.yaml` AST round-trip. Exit codes:
  0 = success/no-op, 1 = parse error. Run with
  `python -m ai_router.migrate_router_config`.
- **`ruamel.yaml>=0.18`** added to `requirements.txt`.

### Changed (Session 3)

- **`ai_router/router-config.yaml`** — `display_label` and `enabled`
  added to each provider block (`anthropic`, `google`, `openai`);
  `routing.outsourcing_mode: whenever-helpful` added to the `routing:`
  block. These fields are consumed by the Set 026 Session 4 config
  editor webview.
- **`ai_router/budget.yaml`** — `threshold_scope: project-lifetime`
  renamed to `scope: per-project`; `warn_at_percent: 80` injected (via
  migration script).
- **`ai_router/config.py`** — now applies Set-026 field defaults on
  load (`display_label`, `enabled`, `routing.outsourcing_mode`);
  validates `models.<id>.provider` against the `providers:` block;
  reads `ai_router/local-overrides.yaml` if present and merges per
  Appendix B precedence rules (local > shared > default). API-key
  validation now goes through `resolve_secret` instead of direct
  `os.environ.get`.
- **`ai_router/providers.py`** — all three provider callers
  (`_call_anthropic`, `_call_google`, `_call_openai`) now look up API
  keys via `resolve_secret` instead of `os.environ[...]`.

### Added (Session 6 — significance flagging)

- **`ai_router/decision_review_queue.py`** — reader for the per-session-set
  `decision-review-queue.jsonl`. Exports `read_queue(session_set_dir)
  -> list[dict]` and `clear_queue(session_set_dir) -> int`. The queue is
  populated by two VS Code extension surfaces (`dabbler.flagDecisionForReview`
  and `dabbler.scanAnnotationsForActiveSet`); orchestrators consume it
  at session start to surface flagged decisions in the planning
  checklist. Schema is intentionally open — callers look up fields
  defensively rather than assuming a fixed shape.
- **`DECISION_REVIEW_QUEUE_FILENAME`** constant (`"decision-review-queue.jsonl"`)
  exported alongside the read/clear surface.

## [0.2.x] and earlier

Prior versions of `ai_router` did not maintain a CHANGELOG.md. The
0.3.0 entry above is the first formal release-notes entry. Refer to
`docs/session-sets/0NN-*/change-log.md` for the per-set narrative
history.
