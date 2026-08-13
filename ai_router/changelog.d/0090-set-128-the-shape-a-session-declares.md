## [Unreleased] — the shape a session declares (Set 128)

### Added

- **(Set 122 S2) `python -m ai_router.session_lifecycle cancel | restore` —
  an entry point for the cancel/restore writers.** The functions were
  complete and had been since Set 047; they simply could not be reached
  from outside Python, so the extension carried its own TypeScript port of
  them in `src/utils/cancelLifecycle.ts` — and that port wrote
  `session-state.json` directly, which only the router's sanctioned writers
  may do. Set 122 exists to remove exactly that violation. Session 2 added
  the entry point and the extension deleted its writer, so there is now one
  implementation of cancel/restore rather than two mirrors held in sync by
  a parity test. Exit codes match `ai_router.modules` deliberately, so both
  surfaces read the same way: `0` ok, `3` refused with nothing written
  (restoring a set that was never cancelled reaches this), `4` write
  failure. `--json` for machine callers. Operator decision of 2026-08-13,
  journalled: severing only the module-delete path was considered and
  rejected, because it leaves a second writer shipping and the two
  implementations drifting.

- **(Set 122 S1) `python -m ai_router.modules create | rename | delete |
  assign-sets` — the module lifecycle, in Python, transactional.** The
  verdict-adopted port (`docs/proposals/2026-08-11-multi-module-architecture/
  verdict.md` §4) of the lifecycle logic that lived in the extension's
  `moduleAuthoring.ts`. The **on-disk contract is unchanged**: the same
  `docs/modules.yaml` shape, the same header template, the same
  format-preserving text splices (never a re-serialization, which would
  destroy the operator's comments and entry order) and the same
  parse-after-write guards, because a format change would strand every repo
  that already has a manifest.

  Two things are genuinely new. **Refusals**: `rename` and `delete` refuse
  while any affected set has a running session — including a legacy set with
  no `session-state.json`, whose status is inferred from file presence rather
  than read as "not started". **Rollback**: every writer runs through one
  transaction that records each effect and undoes all of them on failure, so
  a create that scaffolds a directory and then fails to append the manifest
  entry leaves neither behind (the TypeScript scaffold wrote the stub first
  and stranded it). `delete` is the exception by design — its cancels and
  scaffold removals are idempotent and the manifest entry is written last, so
  an interrupted run leaves the module still declared and is simply re-run.

  `create` also carries the **numbering** half of the adopted surface: it
  scaffolds the module's `kind: plan` and `kind: decomposition` set pair at
  the next two free set numbers, cross-linked by `prerequisites:`, and
  skip-existing by identity so a re-run never mints a duplicate. Unlike the
  TypeScript flow — which scaffolded them after the manifest write and
  downgraded a failure to a warning, because it could not undo the entry it
  had just written — the scaffold runs inside the same transaction, so a
  create either fully happened or did not happen at all. The two spec
  templates now ship as package data under `ai_router/templates/`, since a
  pip-installed router has no repo checkout to read
  `docs/templates/consumer-bootstrap/` from; a parity test pins the two
  copies byte-identical.

  Every `session-state.json` mutation goes through
  `session_lifecycle.cancel_session_set`, the sanctioned writer. That is the
  point of the port: `src/utils/cancelLifecycle.ts:296` writes the state file
  from TypeScript today, reached through `deleteModule`, and the framework
  believed it had already stopped doing that. The test suite asserts the
  invariant behaviorally — neutralize the sanctioned writer and every state
  file is byte-identical — with a planted direct write proving the assertion
  can fail.

  Exit codes are stable for the extension's launchers: `3` = refused
  (nothing written), `4` = write failure (rolled back, or still-declared and
  re-runnable). `--json` for a machine read.

- **(Set 128 S2) `python -m ai_router.post_round_delta` — what a fix made
  after the full suite owes, decided mechanically.** Classifies everything
  that changed since the session's recorded verification round as
  `no-change`, `test-only` (A4.1 — owes nothing), `shipped-code` (A4.2 —
  owes one delta-scoped remediation-review) or `unknown` (fails closed,
  owes one). Exit 1 when a review is owed, `--json` for a machine read.
  Neither half of "what changed" is invented: the path list is
  `verification_stamp.work_diff_binding_paths` (the same set whose digest
  decides stamp freshness, already excluding round bookkeeping) and the
  test classification is `run_of_record`'s declared suite surfaces — a
  second notion of either would drift silently, because both directions
  still produce an answer (L-069-1). `record_round_completed` now snapshots
  `worktreeTreeAtCompletion` on **every** completed round, including
  remediation-review and backstop rounds; `discoveryBaselineTree` is taken
  *before* a round assembles evidence, so it over-reports and is used only
  as a named fallback that says so.

- **(Set 128 S1) A spec can no longer declare its steps in the shape that
  produced two verification-ordering incidents.** The canonical order —
  targeted tests → verify → remediate → full suites → close — already lived
  in `session-constitution.md`, and was violated anyway, because nothing
  checked the shape a spec declared its steps in. Set 127 Session 2 compressed
  three canonical stages into one numbered instruction in the wrong internal
  order (`5. Full pytest and the Layer 3 run recorded as runs of record;
  verify; close.`), and the orchestrator followed the spec's letter over the
  policy that outranks it: a 752-second pytest run and a 350-second Playwright
  run, both taken before a verification round that returned a blocking
  finding, so both were staled by the remediation that followed. Set 112 S3
  had done the same into 15 runs and 186 minutes.

  `spec_admission.check_step_shape()` now checks the **shape** beside the
  **count**, reading the step texts it already parses. Every session declares
  `Register` + its authored work + a fixed three-step tail (cross-provider
  verification → required portion of the full test suite → close-out), and a
  tail step that names more than one of those stages — in **either** internal
  order — is refused as a compression. The four are recognised by **intent**,
  not exact prose: "Close out" and "Close-out" both pass, and rewording cannot
  slip the retired ordering through. Scope stops at the tail: a work step that
  *describes* verification is prose, and a work step that *orders* an early
  full suite is an ordering question owned by the constitution.

  **Requires restructuring, or an informational note** (operator ratification,
  2026-08-12): blocking for a set that has not started — no `session-state.json`,
  or status `not-started`, where restructuring is still a text edit — and an
  informational note for a set already started, complete, or cancelled. Those
  specs were authored at a different time under a different approach; nothing
  about them is wrong and none will be rewritten. Four unstarted specs fail on
  day one, which is the point: a gate nothing can fail proves nothing
  (`L-112-1`). Shipped with 12 falsifiers that plant the malformation —
  including the Set 127 S2 step verbatim — rather than read the regexes; a
  mutation probe gutting the checker fails 12 of its 19 cases.

### Fixed

- **(Set 122 S2) `start_session` now ticks the `register` step it just
  performed.** `start_session` *is* the registration, so seeding that row
  `pending` published a step checklist that was wrong the instant it was
  written, and it stayed wrong until an orchestrator remembered to log a
  step the framework had performed. That tax was real, not theoretical:
  Set 122 Session 1 logged four of its seven steps "retroactively at
  close-out", `register` among them. `session_checklist.
  complete_register_step` closes the one case that needs no judgement, and
  deliberately touches **no other step** — every other one describes work
  only the orchestrator can know it finished, and a writer that guessed
  would replace an honestly-empty checklist with a confidently-wrong one.
  Idempotent (a re-registration after a context reset writes nothing),
  best-effort, and NAMED on stderr when it skips (L-079-1).
  Operator-directed 2026-08-13 as a release blocker for the Set 122
  publish. Shipped with falsifiers that plant each failure — tick any
  step, tick twice, invent a row where the spec has no `register` step —
  and a mutation probe confirms removing each guard fails its own case
  (L-112-1).

- **(Set 122 S2) `_existing_lifecycle_slug` matched a module's lifecycle
  sets by basename suffix.** Creating module `api` reused `payment-api`'s
  `-api-plan` / `-api-decomposition` sets instead of minting its own. The
  identity test is now the set name minus its numeric prefix equalling
  `<slug>-<kind>` **exactly**. Inherited from the TypeScript
  `findExistingLifecycleSetSlug` rather than introduced by the port, and
  carried as residual `S122-S1-R1` from Session 1's disposition.

- **(Set 128 S2) A one-line test fix after the full suite no longer buys a
  fresh metered verification round.** Operator ruling of 2026-08-12,
  journalled as an **operator-attested verification-reduction** (the
  constitution's hard carve-out): **A4.1** — a post-suite fix to tests only
  triggers no re-verification; **A4.2** — a post-suite fix to shipped code
  triggers a targeted `--phase remediation-review`, not an open
  re-verification. This is the other half of A2, not a saving bolted onto it:
  once every full suite runs *after* every cross-verification stage, a late
  suite failure strands a stale verdict **by construction**.

  The rule was contradicted by the machinery, not merely unwritten. Any
  post-verification change — including a one-line test fix — moved
  `work_diff_sha256`, so the stamped row went stale and `close_session`'s
  backstop bought a full round. `validate_stamped_row`'s freshness check now
  consults the new `post_round_delta` classifier and exempts a delta whose
  every path is a **declared test surface** (`SuiteSpec.tests`, an allowlist
  beside `covers`; `test-fixtures/` and `scripts/` are deliberately absent
  because they stage what Layer 3 asserts). Reached only on a digest
  mismatch, it relaxes freshness and nothing else: source, template,
  verifier identity, the cross-provider exclusion, the artifact hash and the
  verdict re-derivation all still refuse, and the round bounds and
  no-resurrection arithmetic are untouched. Every exemption is reported and
  ledgered (`a4-test-only-exemption`), so a close that settled under A4.1 is
  distinguishable in the record from one that re-verified.

  **The rule is keyed on what changed, never on how much.** An earlier
  "less than two lines" formulation is superseded and must not return: Set
  127 S2 planted eight defects against its finished suite and **six were two
  lines or fewer** — `if (false)`, `const status = row.status`, one inverted
  ternary — every one a real correctness bug. Size does not track blast
  radius.

  Shipped with 11 falsifiers that plant real edits in a real repo. Two
  mutation probes: widening the classifier fails 6 of 13 cases, and a probe
  pinning the exemption predicate to "granted" initially survived all of
  them — the gap was real and closed with a both-directions assertion before
  the change shipped.

- **(Set 128 S1) `session_checklist.build_rows` no longer renders a
  gate-policy record as a step.** A `path_aware_critique` /
  `contract_gate` / `dual_surface_mode` / `suggestion_disposition` entry
  is written at **registration**, before any work exists, and rendered as
  a `complete` row in the step list — so both the CLI checklist and the
  Work Explorer said the path-aware critique, a stage that runs once at
  the **end of a set**, had already finished minutes after the session
  began. The operator reported it from a live session. The step list now
  renders only steps, using `is_logged_step` — the same predicate that
  already refused such an entry a planned row, so the two answers cannot
  diverge — and the record stays untouched in `activity-log.json`, where
  the close gates read it. The start-time chain already treated the
  record as transparent, which is what makes the removal safe rather than
  merely tidy: the step below it is still dated from the previous
  **step's** completion, not from when a policy was recorded. Mirrored in
  `sessionStepModel.ts` with the parity corpus updated in both
  directions, and falsified for all four kinds (L-069-1: the reported
  kind is the one 50 sets happen to carry; the others are the same bug).

### Changed

- **(Set 128 S1) `authoring.max_steps_per_session` re-baselined 5 → 7, and the  number now counts something else.** Under the skeleton a session declares
  four baked-in ceremony steps plus `N` authored work steps, and the operator
  ratified **N = 3** — rejecting their own opening suggestion of N = 4 as a
  deliberate loosening rather than an artifact of re-counting. The Set 111 S4
  measurement (172 schema-v4 sessions: 1–5 declared steps ran a 42-min median,
  6–8 ran 84 with a 386-min p90) was taken on specs whose declared steps
  *already absorbed* the ceremony — Set 127 S1 spent three of six on it — so a
  historical "5 declared" was roughly 3–4 real work steps and the old bands do
  not transfer. 7 is not a loosening of 5; compare a spec's **N** to 3, not its
  total to 5. `DEFAULT_MAX_STEPS` is now derived as `CEREMONY_STEPS +
  WORK_STEP_BUDGET` so the two cannot drift, and the authoring guide carries
  the table with the re-reading beside it.

