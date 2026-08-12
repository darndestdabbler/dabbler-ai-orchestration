# Changelog — `dabbler-ai-router`

All notable changes to the `ai_router` Python package are documented
here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

> **Set 102 notation (2026-07-14):** the `102-git-workflow-automation` set
> shipped **extension-only** (extension `0.45.0` staged) — zero `ai_router/`
> changes accrued, so the router stays `0.33.0` and that set has no entries
> below. Recorded here so the release walk has an explicit router-side
> notation, not just the extension changelog's cross-reference.

## [Unreleased] — one computed projection, and the marker goes (Set 120 S3)

### Security

- **(Set 125) A routed call can no longer mutate the workspace on the
  `copilot-cli` transport.** `route()` is one contract, but its two
  transports did not honour it equally. On `api` a routed call is a plain
  HTTPS completion — `providers.py` sends model/max_tokens/system/messages
  and **no `tools` key** — so the provider returns text and the call cannot
  touch the filesystem by construction. On `copilot-cli` the same call
  dispatches an **agentic** CLI, and `--allow-all-tools` alone handed the
  model the entire tool universe against the live working tree: arbitrary
  shell (`powershell`), file creation and editing (`create`, `edit`), and
  sub-agent spawning (`task`, `write_agent`).

  This was not theoretical. On 2026-08-12, routed calls fired from the test
  suite modified **23 files** in this repo with no human in the loop —
  including two production modules, extension source, the built `dist`
  bundle, a JSON schema, six docs, and one 150-line document the model
  invented outright — and wrote two spurious rounds into a live
  verification ledger. The deeper hazard is independent of that trigger: a
  verifier that can edit the code it is judging can fix a finding and then
  report VERIFIED on its own edit, which dissolves the cross-provider
  guarantee the workflow rests on.

  `cli_transport.py` now passes `--available-tools` with a read-only
  allowlist (`view`, `grep`, `glob`) on **both** dispatch paths — the inline
  path and the Set 104 large-prompt handoff — from one shared
  `_tool_grant_argv()` helper so the two cannot drift.

  Notes on the shape of the fix: an **allowlist**, because
  `--available-tools` removes a tool from the model's view while
  `--deny-tool` only withholds permission, and a denylist fails open on any
  tool a future CLI release adds. `--allow-all-tools` is **retained** — it
  governs auto-approval without prompting, which headless dispatch
  requires; once the universe is read-only, "allow all" allows only
  read-only tools. `view` is **required**, not incidental: the Set 104
  handoff instructs the model to pull its payload from a temp file with a
  file-read tool. Temp-dir access is likewise retained.

  Verified by a matched pair on an identical prompt (`--allow-all-tools`
  alone rewrote the target file, `filesModified: ["sample.txt"]`; with the
  allowlist, `filesModified: []`) and by a live end-to-end `route()` call in
  which the model tried to comply, reported *"I can't write files directly
  with my tools"*, fell back to shell, was blocked there too, and left the
  target unchanged. Note that an earlier blunt "create breach.txt" prompt
  was *declined by the model* while a benign "bring this file into line
  with the convention" framing wrote immediately — **refusal is not a
  control; the grant is.**

### Added

- **(Set 123 S2) The `DIRECT_API` precondition, and the qualified
  verdict.** `verification.check_direct_api_precondition()` answers whether
  a project can verify cross-provider *right now*: it compares the
  providers whose `api_key_env` actually resolves against the
  orchestrator's **effective** provider (registry-resolved via
  `orchestrator_identity`, never a configured seat label — a
  `github-copilot` seat labelled `anthropic` may be running an OpenAI
  model, and the cross-provider claim rests on the effective one).

  When a project whose committed verify type is `DIRECT_API` holds no
  usable key outside its own orchestrator's provider, `route()` **warns on
  stderr and proceeds** with a same-provider verifier rather than
  hard-blocking into the operator-attested manual path. This is the
  operator's ruling — *"verification with the same provider is better than
  no verification at all, but the results should be flagged with this
  limitation"* — re-confirmed in session on 2026-08-11 against the sharper
  question (the change relaxes a close gate), and journaled with
  `verification_effect: reduces` plus an operator attestation, because
  reducing verification is never self-authorized.

  **The permission is derived inside `route()`, never passed to it.** A
  parameter would re-open `I-084-S1-3` (a caller-supplied exclusion list
  that omits the orchestrator's provider). No caller can ask for a
  same-provider verification, and an **uncommitted**
  `AI_ORCHESTRATION_VERIFY_TYPE` cannot trigger one: a machine-level
  suggestion that could weaken every verdict on that machine is exactly the
  action-at-a-distance Session 1's branch 2 exists to prevent. The
  Copilot-seat path keeps its fail-closed `ProvenanceUnavailable` contract
  (Sets 083/084) untouched.

  **The qualification travels with the verdict, omit-null**, on the three
  router-owned records: the metrics stamp row
  (`verification_qualification`), the findings envelope
  (`verificationQualification`), and `disposition.json`
  (`verification_qualification`, *removed* when a later unqualified round
  supersedes a qualified one). `classify_verification_qualification()` is
  the single mechanism that decides, so the three cannot disagree.

  **The close gate enforces it as a bijection** (`validate_stamped_row`
  check 5): a same-provider row passes only when it declares the
  qualification, *and* a cross-provider row declaring it is refused. A
  one-way check would let the flag be attached unconditionally, at which
  point it would distinguish nothing — and distinguishing is its only job
  (`L-112-1`). The vocabulary is closed and fails closed, unlike
  `verification_verdict`'s warned-but-accepted extension tokens: a token
  nobody can interpret does this field's job worse than no token at all.

  Not written to `session-state.json` — that is the Work Explorer's
  surface, and operator decision **P4** keeps orchestrator/verifier
  provenance out of it.

- **(Set 115 S4) `close_preflight --write` / `--check` — the close-out
  obligations, serialized where a renderer can read them.** The preflight
  costs 2-7 seconds (git-backed predicates plus interpreter startup), so
  nothing that redraws may call it. `--write` runs the report as usual —
  same output, same exit code — and additionally serializes it to
  `<set>/.dabbler/close-obligations.json`, which the Work Explorer renders
  as a **Close-out** row under the in-flight session. `--check` compares
  the file against its inputs without evaluating anything: exit `0` fresh,
  `3` stale, absent or unreadable.

  **The report is embedded verbatim.** The file carries
  `PreflightReport.to_dict()` unchanged rather than a shape a renderer
  might prefer, because this module has already shipped two surfaces of
  one report that disagreed (`would_close` said `true` while the human
  report said "NOT yet decided"), and one spelling is the fix that holds.

  **The digest map is the whole session-set directory**, not a curated
  filename list. Obligations derive from `disposition.json`,
  `session-state.json`, `activity-log.json`, `spec.md`, `change-log.md`,
  the run-of-record and checklist-post ledgers, and every
  `s<N>-verification*.md` / `s<N>-issues*.json` artifact the backstop and
  the integrity gate look for. A set that grows an artifact grows an
  input, with nothing to remember to add (L-069-1).

  **Two obligations cannot be digested at all**, and the file says so
  rather than averaging over it. Five checks read state that lives
  outside the session-set directory — `working_tree_clean` and
  `pushed_to_remote` call git directly; `verification_integrity`
  validates an evidence stamp that binds the repo-wide work diff;
  `test_run_fresh` compares a `run_of_record` freshness digest over the
  source files a suite covers; and the backstop reads both. Committing,
  or editing a module anywhere in the repo, changes those answers while
  every file in the session-set directory stays byte-identical. Those
  rows carry `volatile: true` and the file records a git fingerprint
  under `volatileInputs`, so `projection_state(..., include_volatile=False)`
  is the honest answer for a reader that will not spawn git. The Work
  Explorer uses exactly that, and labels those rows "as of" the
  projection's timestamp.

  **The classification fails safe.** `SET_LOCAL_CHECKS` names the checks
  that are a pure function of files inside the set directory and
  *everything else is volatile*, so a check added later is over-labelled
  "as of" (noise) rather than silently rendered as current truth (a lie).
  Both end-of-set path-aware critics independently found the first cut
  the other way round: it listed the two checks that call git directly
  and rendered the two stamp/digest-backed ones as re-checkable. Two
  tests hold the line — an AST walk (through function-local imports,
  which is how these predicates actually reach outside) that refuses a
  set-local check reaching a repo-wide helper, and its falsifier proving
  the walk can see one.

  **It is never committed.** `.dabbler/` is git-ignored and the writer
  drops a self-protecting `.gitignore` inside the directory it creates, so
  a consumer repo is covered without editing its root ignore file. That is
  what keeps a mid-session write out of the verification stamp's work diff
  — structurally, rather than by adding one more filename to an exemption
  list — and off `working_tree_clean`. The cost is that the projection is
  per-machine: a fresh clone reads `absent`, which is a designed state.

  `Obligation.volatile` also appears in `--json`. Consumers that pin the
  exact key set of an obligation row will see one new key.

### Fixed

- **(Set 115 S1) A generic `Session N` title no longer sticks.** Title
  resolution puts the stored `sessions[]` ledger first so titles survive
  boundary writes — which also meant one `Session N` on disk was copied
  forward by every later write, and nothing self-healed. 130 rows across
  this repo were in that state. `progress.heal_title` adds the missing
  carve-out: a `spec.md` heading beats a **generic-shaped** stored title
  (exactly `Session <that entry's own number>`, or empty), while a
  genuinely operator-authored title is still never overwritten —
  `Session 5` stored on session 3 is authored, not the fallback.

  The rule runs in two places for one reason. `_build_sessions_array`
  applies it at every boundary write, so the fix persists; and
  `normalize_to_v4_shape` applies it in the read view, because a
  **closed set gets no further boundary write** — the read view is the
  only place its labels can heal, and healing there rewrites no closed
  history (the spec asked for healing *without* a migration script). The
  reader's `spec.md` read is conditional on `needs_title_heal`, so a
  healthy set costs no additional disk read on the tree scan.

  New public helpers in `ai_router.progress`: `is_generic_title`,
  `heal_title`, `heal_generic_titles`, `needs_title_heal`. The extension
  mirrors them in `utils/progress.ts`, and
  `ai_router/tests/fixtures/session-title-parity.json` pins the two
  implementations to one corpus that neither language owns.

### Added

- **(Set 120 S3) `ai_router.session_projection` — the session progress
  projection, computed once and serialized.** One Python answer for a
  session set's steps, their states, what is in flight and what remains,
  written to `session-progress.json` beside the artifacts it derives
  from. Canonical shape: `docs/session-progress-schema.md`.

  It does **not** re-implement the row derivation.
  `session_checklist.build_rows` stays the one Python computation and
  this module serializes what it returns, so "computed once" is
  structural rather than asserted — there is no second Python derivation
  that could drift. The read-side leniency is likewise *derived* from
  `session_checklist.STATUS_BOXES` by box glyph rather than re-spelled as
  a second alias table, so the projection cannot recognise a token the
  renderer does not (L-069-1).

  **Derived and regenerable — a cache, never a source.** Every file
  carries `derived: true`, the exact regenerate command, and the SHA-256
  of each input (`activity-log.json`, `session-state.json`, `spec.md`),
  so `projection_state()` can always answer `fresh` / `stale` / `absent`
  / `unreadable` and `--check` exits `3` on anything but fresh. A
  `schemaVersion` newer than the reading code reads as `unreadable`
  rather than being guessed at.

  `close_session` regenerates it after flipping the state snapshot. That
  write is declared through the Set 119 S3 `CLOSE_MANDATED_WRITES`
  mechanism rather than by adding a filename to a list in
  `verification_stamp`, so a close-time write cannot stale the
  verification stamp it is written after — the failure Sets 111 S2, 112
  S3 and 114 S1 each paid a metered round for.

- **(Set 120 S3) The states absence used to hide.** `unknown` for a
  status token no reader can name — which is where 11 of the 15 entries
  Set 120 S2 deliberately preserved now surface, with their raw token
  intact rather than laundered. `unreadable` beside `absent` and `read`
  for the ledger itself, so "no work" and "cannot read the evidence" stop
  being the same empty session row (a defect both Set 115 reviewers named
  independently). `stale` for the projection against its own inputs. And
  `orphanEntries`, a top-level count of ledger entries with no integer
  `sessionNumber` — every reader in both languages silently drops them,
  which is where the other 4 preserved entries (Set 028's absent-status
  population) had gone. Reported as a count rather than as rows, because
  inventing rows for entries that name no session would break the parity
  the projection has to hold.

### Removed

- **(Set 120 S3, operator ruling 2026-08-11) The `<- here` marker.**
  `session_checklist.HERE_MARKER`, both of its rendering sites,
  `_mark_here`, and **`ChecklistRow.is_here`** are gone. The marker
  inferred a single current row (first non-terminal logged step, falling
  back to the first pending planned row, falling back to the last row) —
  and that inference is what pointed confidently at step 1 of Set 119 S2
  while the real work was four steps further on. Since Set 120 S1 the
  `in-progress` token carries the fact directly, so nothing needs to be
  derived; and because the fact is per-row, two steps may now be in
  flight at once, which a single-valued marker could not represent.

  **(Set 115 S4) The TypeScript half went with it**, finishing a removal
  that stood half-done for one set: `workExplorerTreeModel.HERE_MARKER`
  and its render site, `sessionStepModel.markHere`, its `TERMINAL_STATUSES`
  table and the `StepRow.isHere` field. `grep`ping both languages before
  declaring the class closed is the rule that was skipped the first time
  (L-069-1).

  **Breaking for callers that construct `ChecklistRow` positionally with
  five arguments, or read `row.is_here`.** `is_planned` is now the fifth
  field. Read what is in flight from the row's `box`
  (`session_checklist.IN_PROGRESS_BOX`) or from the projection's
  `current`.

- **(Set 120 S3) The post ledger's `hereStepKey` / `hereStepNumber` /
  `hereStatus` triple**, replaced by `inProgressStepKeys` — a list,
  always present, possibly empty. The old fields recorded a rule's
  output; this records a fact the ledger already carries. Empty is a real
  answer (nothing started yet), which the marker had to fake.

### Changed

- **(Set 120 S3, closed by Set 115 S4) The cross-language step-row parity
  corpus's declared divergence is over.**
  `ai_router/tests/fixtures/session-step-parity.json` kept its `cases`
  byte-identical through Set 120 S3 — the extension still computed
  `isHere`, that set could not touch it (standing decision 3), and the
  corpus was the only coverage the behaviour had — so the Python half
  compared the five shared fields and projected `isHere` out of the
  expectation. **Set 115 S4 deleted the extension's derivation**, so the
  field is gone from the corpus, both halves compare the same whole row
  again, and the `_readme`'s divergence note is replaced by the history
  of its removal. `SHARED_ROW_FIELDS` is still asserted against
  `ChecklistRow`'s own dataclass fields; the guard that *required*
  `isHere` in the corpus is replaced by its inverse — a test that refuses
  any expectation field the two halves do not both compare — plus one
  that pins a real in-progress row, which is what the icon that replaced
  the marker is drawn from.

## [Unreleased] — the drift inventory and the scoped history migration (Set 120 S2)

### Added

- **(Set 120 S2) `ai_router.step_status_drift` — the drift inventory
  command, and the migration that executes the operator's ruling about
  the history already on disk.** Set 120 S1 stopped *new* drift; this
  measures and repairs what was already written. The command has three
  read-only modes and one writing one:

  - default — the inventory: every `activity-log.json` under
    `docs/session-sets`, per file, per token, with the session and step
    each occurrence belongs to, sorted into the two populations the
    ruling treats oppositely. `--json` for machine output, `--verbose`
    for per-entry detail, `--only <slug>` to narrow.
  - `--check-premise` — the falsifier for the ruling's premise, that
    `completed` and `done` are *pure* synonyms wherever they appear.
    Three independent signals: the owning session never completed, the
    same step was re-logged later as non-terminal, and the step's own
    description asserts it did not finish. Exits `2` on any
    **unadjudicated** flag.
  - `--migrate` — the migration plan (dry run, no writes).
  - `--migrate --in-place` — apply. Idempotent and re-runnable.

  **The premise check is an enforced precondition of the write path, not
  a companion command you are trusted to remember.** One unadjudicated
  premise flag anywhere in the scan refuses the whole run and writes
  nothing, and `migrate_file()` checks for its own set when called
  directly, so a library caller is equally fail-closed. There is no
  `--force`: the way past a flag is to read it and record the reading,
  because the operator authorised a lossless rename and not a judgement
  call about outcomes.

  **Scope is enforced structurally, not left to the default scan root.**
  Any activity log under a `test-fixtures/` tree
  (`EXCLUDED_PATH_SEGMENTS`) is test data rather than a record of a real
  session: it is reported, kept out of the drift totals, and never
  migrated whatever `--scan` says. This repo's pinned UAT fixture is the
  case that forced it — `--scan .` would otherwise have rewritten an
  extension test fixture from inside a Python-only history migration.

- **(Set 120 S2) The 271 lossless synonyms in this repo's history are
  now canonical.** Measured from the command rather than a one-off
  query: 286 drifted entries of 2,805 (10.2%) across 24 files, split
  271 lossless (`completed` 229, `done` 42) and 15 semantically loaded.
  The lossless population was rewritten to `complete` across 21 files;
  the 15 loaded entries — 4 with no status field, 8 prose blobs, 1 JSON
  array, 1 `skipped`, 1 `complete-with-known-failures` — are byte-for-byte
  untouched, because normalising them would launder meaning that
  Set 120 S3's projection will instead render as an explicit `unknown`.

  **The rewrite is byte-surgical, not a re-serialize**, and that is not
  a stylistic choice. These logs were written by several tools over a
  year: 108 of 109 use CRLF, 39 carry a trailing newline and 69 do not,
  and Set 028's was written `ensure_ascii=False` so it holds a literal
  `→` that a default `json.dump` would escape. A parse-mutate-dump
  migration would have rewritten bytes in files it was asked not to
  touch, and would have made the ruling's own acceptance condition — the
  loaded entries come out byte-identical — impossible to check. The
  migrator locates each `"status"` member as a span of raw text,
  cross-checks those spans against what the JSON parser sees (a file the
  scan cannot explain is **refused**, never rewritten blind), replaces
  only the ruled ones, and then asserts both that no byte outside those
  spans moved and that the re-parsed document differs by exactly those
  statuses.

### Changed

- **(Set 120 S2) Nothing in the public API changed.** The migration is a
  one-time repair of this repo's own records plus a standing inventory
  command; no reader, writer, or gate behaviour is altered. Consumer
  repos carrying their own drifted history can run
  `python -m ai_router.step_status_drift --check-premise` and then
  `--migrate --in-place` against their own `docs/session-sets` — the
  write path enforces that ordering itself and refuses while any flag is
  unadjudicated — but nothing obliges them to; readers stay lenient by
  standing decision 1.

## [Unreleased] — the step-status vocabulary, enforced at the writer (Set 120 S1)

### Added

- **(Set 120 S1) A closed step-status vocabulary, and a writer that fails
  closed on anything outside it.** `ai_router.session_log` now defines
  the four tokens that are both measured in use across every
  `activity-log.json` in the repo **and** nameable by every reader —
  `complete`, `in-progress`, `pending`, `blocked` — and exports
  `CANONICAL_STEP_STATUSES`, `ALLOWED_STEP_STATUSES`,
  `is_valid_step_status`, `validate_step_status`, `require_step_status`,
  `suggest_step_status` and `InvalidStepStatusError`. Nothing was
  invented; the vocabulary is a confirmation of practice.

  **`skipped` is deliberately excluded** (operator ruling, 2026-08-11)
  even though it appears once on disk. It has no entry in
  `session_checklist.STATUS_BOXES`, so it renders as `[?]` — the
  corrupt-data glyph — and neither `_mark_here` nor the Work Explorer's
  mirrored `markHere` counts it as terminal, so a skipped step steals the
  current-step marker from real work. Admitting a token the readers
  cannot name is the exact defect this change exists to prevent, so the
  vocabulary is the *intersection* of what was measured and what the
  readers understand. Teaching both readers is a two-language change that
  belongs with the extension carve.

  This follows the Set 086 S1 pattern for verification verdicts:
  **readers stay lenient, the writer is strict.** Every reader keeps
  rendering whatever it finds on disk — history is a record, not a bug to
  crash on — while nothing a reader cannot name may be written from here
  on.

### Changed

- **(Set 120 S1) `SessionLog.log_step()` raises `InvalidStepStatusError`
  on a status outside the vocabulary.** Previously it accepted arbitrary
  strings, and roughly 10% of the step entries on disk carry a token no
  reader recognises: "done" is spelled four ways, and prose up to ~1,500
  characters had been written into the status field. The consequence was
  visible — Set 119 S2 wrote `completed`, and the whole session rendered
  as not-started with the `<- here` marker stranded on step 1, because
  `session_checklist` selects the first *non-terminal* row and an
  unparseable row is never terminal.

  **Breaking for library consumers** that log a non-canonical status.
  `InvalidStepStatusError` subclasses `ValueError`, so existing
  `except ValueError` handlers still catch it. Near-misses the readers
  happen to tolerate (`completed`, `done`, `Complete`, `" complete"`) are
  refused too, and the refusal names both the legal set and the token the
  caller most likely meant.

- **(Set 120 S1) `SessionLog.append_entry()` validates a `status` when
  one is present.** Absence is still accepted: "no status recorded" is a
  different defect from "a status no reader can name", and Set 120 S3
  owns it explicitly.

- **(Set 120 S1) The four writers that bypass `SessionLog` now route
  through the same chokepoint.** `contract_gate`,
  `path_aware_critique`, `dual_surface_verify` and
  `suggestion_disposition` each do their own read-modify-write of
  `activity-log.json`. All four already hard-coded `"complete"`, so none
  could drift at runtime — but an allowlist at one entry point is
  worthless if another path writes the file directly (`L-069-1`). Each
  now spells the token from the shared `STEP_STATUS_COMPLETE` constant
  and passes it through `require_step_status`, and a structural `ast`
  scan over every production module enforces the rule for writers that do
  not exist yet.

## [Unreleased] — close-mandated writes, the backstop's recovery path, and what nothing reached (Set 119 S3)

### Removed

- **(Set 119 S3) Four modules nothing reached: `floor_ratchet.py` (914),
  `routed_gate.py` (437), `pricing_proposal.py` (1,581) and
  `cost_report.py` (551) — 3,483 LOC plus 3,012 lines of tests (235
  tests).** Unreachability was PROVEN before anything was deleted, with a
  static import graph over all 78 `ai_router/*.py` modules (`ast`, no
  execution), against the spec's three criteria: no import from a close
  path, no console-script entry point, no reference in
  `router-config.yaml`. `routed_gate` was retired as a skip authority by
  Set 083 and answered `REQUIRED` unconditionally thereafter; the cost
  surface could not be populated at all on a Copilot seat, where all 83
  routed calls record `billed_usage_unavailable: true` and
  `cost_usd: 0.0`.

  **Breaking for library consumers:** `ai_router.get_costs` and
  `ai_router.print_cost_report` are gone, as are the `routed_gate`
  re-exports (`evaluate_routed_gate`, `RoutedGateDecision`,
  `ROUTED_GATE_TRIGGERS`, `BREADTH_THRESHOLD`, `TRIGGER_*`).
  `python -m ai_router.report` still summarises `router-metrics.jsonl`
  and the extension's cost dashboard is unchanged. The dead
  `output.cost_report_on_exit` and `verification.routed_gate`
  `router-config.yaml` keys went with them — neither had a reader.

  **`pricing.py` STAYS**, as does `contract_gate.py`, `spec_admission.py`
  and `replacement_gate.py`: the last three turned out to be REACHABLE
  and are reported rather than forced. `close_session.run` calls
  `validate_contract_gate` as a live close gate, `session_checklist`
  calls `spec_admission.parse_session_plans` to seed the plan the
  `checklist_posted` gate reads, and `dual_surface_verify` imports
  `replacement_gate.validate_benchmark_registration` at module scope. The
  line: a module is reachable when a surviving module CALLS it; an
  `__init__` re-export is publication, not use.

### Added

- **(Set 119 S3) Close-mandated writes are a declared CATEGORY, so a
  close-out artifact no longer stales the verification it just passed.**
  A writer declares a module-level `CLOSE_MANDATED_WRITES` literal;
  `verification_stamp.discover_close_mandated_writes` finds it by parsing
  the source with `ast` — no import, no side effects, safe on the close
  path — so a fifth close-mandated writer is exempt the moment it says
  so, **in either scope**, with no list here to edit.

  Two `bound` values, because the honesty matters. A per-set ledger is
  close output end to end (`whole-file`, a pathspec exclusion). A
  guidance file is only PARTLY close output: `cite_lessons` owns one
  `last-used-set` trailer field and the lesson prose around it is session
  WORK. So `cite_lessons` declares a normalizer
  (`guidance_meta.normalize_close_mandated_metadata`) and the freshness
  digest compares normalized-current against normalized-at-base, dropping
  the file entirely when only the mandated field moved. Exempting the
  file wholesale would have let a post-verification rewrite of a
  **preload** document ride a passed round — a verification reduction, so
  not an option.

  Why it mattered: the constitution MANDATES `cite_lessons` in the final
  commit, so every citing session staled its own stamp between verifying
  and closing, and the backstop quietly bought a metered round to
  re-verify a byte-identical tree. It surfaced in Set 119 S2 only because
  the round budget was already spent, so the backstop refused instead of
  paying.

- **(Set 119 S3) Every round now records the baseline it reviewed, so the
  backstop's own recovery path is reachable.**
  `verify_session.record_round_completed` takes an omit-null
  `discovery_baseline_tree` and `find_discovery_baseline_tree` reads the
  `sN-rounds.jsonl` ledger as well as the `sN-issues*.json` envelopes.
  The envelope is written only on a findings-bearing round, so the two
  states that most need a baseline left none — a **clean** discovery
  round, and **every close-backstop round** (which is unphased) — and
  `--phase remediation-review` refused with `EXIT_USAGE`, forcing a full
  ~$0.88 discovery round to reach a ~$0.07 fix-delta review.
  `verify_session` now snapshots for every round except a
  remediation-review itself, which must never become a baseline or a
  second cycle would diff from the first fix instead of from the original
  discovery baseline.

### Changed

- **(Set 119 S3) `EvidenceTooLargeError` now inherits from
  `VerifySessionError`.** They were siblings, and `close_backstop`
  catches the parent at four sites while catching this one at exactly
  one — so an oversized evidence bundle took the close down with an
  unhandled traceback on four paths: the gate gone, no remediation line,
  on the most expensive path there is. Fixing the TYPE fixes all four
  (L-069-1: the class, not the instance). The exit-code distinction never
  lived in the class relationship, only in handler ORDER, so the
  `verify_session` CLI's clauses were reordered — it caught the parent
  first, and a subclass caught after its parent is unreachable code.

- **(Set 119 S3) The backstop's blocking refusal names the phase, and the
  command it names now works.** It said "re-verify with `verify_session`
  (the sanctioned remediation loop)" while `--phase remediation-review`
  failed closed from exactly that state.
  `gate_checks._verify_session_command` takes an optional `phase`, and a
  test PARSES the refusal text and executes the command it names from the
  state it was printed in.



## [Unreleased] — finding provenance and the doc-only severity cap (Set 119 S1)

### Added

- **Every finding now carries `evidencePaths` — the repo-relative paths
  the verifier actually read.** It is contract on **both** verification
  surfaces: the markdown parse (`verification._parse_issue_blocks` reads a
  tolerant `Evidence paths:` line) and the structured `submit_verdict`
  tool (`pull_verifier` gains an ungated `evidencePaths` array offered on
  every configuration, parsed into `Finding.evidence_paths` and serialized
  as `evidencePaths`). Both reviewer templates make it **mandatory on a
  Critical/Major finding**; `verification.normalize_evidence_path` strips
  the decoration reviewers add (backticks, emphasis, `./`, `\`,
  `:<line>`, `#anchor`) so the same file compares equal across rounds.
  Declared optional in `docs/session-issues.schema.json` and
  `docs/path-aware-critique.schema.json` — optional **by design**, because
  its absence must not launder a blocking finding.

  `TEMPLATE_ID` is bumped to `session-verification-v8` with its pinned
  hash, per the verification-integrity protocol.

### Changed

- **A finding whose cited evidence is entirely documentation prose is
  capped at Minor and opens no verification round.** Applied in
  `verification.is_blocking_issue` — the one predicate both surfaces
  already consult — so the push and pull surfaces inherit it identically.
  `classify_blocking` reports the demoted findings in a new
  `doc_capped_issues` list and names the count in its `reason`, so the cap
  is auditable rather than silent.

  This is an **operator-attested verification reduction** (Set 119 S1
  `decisions.jsonl`: `authority=human`,
  `rubric_line=verification-reduction`, `verification_effect=reduces`),
  authorized on measurement: 520 of 572 findings in this repo's history
  are Major (91% — a scale on which almost everything blocks is not a
  scale), and Set 116 S3 spent 13 routed calls and $4.75 on a session
  whose code was clean at round 1, where every Critical/Major after round 1
  concerned the wording of one markdown document and two of the three were
  *created by fixing the previous one*.

  Three properties keep it from being the anti-laundering rule in reverse:

  - **Doc-ness is derived from paths, never self-declared.** The only
    input is `evidencePaths`. A verifier asserting "this is only a doc
    issue" in its description or free-text `category` changes nothing.
  - **Absence is not doc-ness.** A finding citing no paths is unchanged:
    Critical, Major and unknown severity all still block, so an uncited
    blocking finding is never the cheaper option.
  - **Behaviour-bearing markdown is not documentation.**
    `ai_router/prompt-templates/**` are the verifier's own instructions —
    a defect there changes what every routed call does, so it keeps its
    declared severity. Doc-ness is extension-based (`.md`, `.markdown`,
    `.rst`, `.txt`) and never directory-based, so a machine contract that
    lives under `docs/` (a JSON schema) is not prose either.

  Shipped with the falsifier pairs `L-112-1` requires (30 test functions
  in `ai_router/tests/test_doc_only_cap.py`): each rule is planted both
  ways — the defect the cap must fire on, and the legitimate look-alike it
  must not touch.

## [Unreleased] — the close preflight (Set 119 S2)

### Added

- **`python -m ai_router.close_preflight` — every close-out obligation,
  knowable before the close runs.** Runnable at any time against a
  session set, with **no side effects and no routed call**: no lock, no
  ledger event, no file written. It prints every obligation in one pass
  — met and unmet, blocking and advisory — each with the predicate's own
  remediation and the action that satisfies it. Exit `0` when nothing
  blocking is unmet, `1` when something is, `2` on an invalid
  invocation; `--json` emits the same report for a script.

  Authorized by measurement: close-out is not slow (median 0.1 min) — it
  **fails**. 122 of 295 sessions failed at least once, mean 1.6 attempts,
  max 9, and every failure is an obligation nobody knew they had until a
  gate refused.

  It **reports; it never refuses** (this set's spec forbids a new gate).
  Its blocking/advisory split is read from `gate_checks.is_blocking_check`
  rather than re-derived, so it cannot refuse something the close allows,
  and a check demoted to advisory is advisory here automatically. Every
  verdict comes from **calling** the predicate `close_session` calls —
  a preflight that disagrees with the gate is worse than no preflight.

- **The expensive question, answered for free.**
  `close_backstop.decide_backstop` (+ `BackstopDecision`) is **extracted**
  from `run_close_backstop`, which now consumes it, so there is one
  spelling of "will the backstop spend a routed call" with two readers.
  Every branch of that sequence is a pure read — the method token,
  `budget.yaml`, the orchestrator identity, the stamped rows and their
  hash-bound artifacts, the round ledger, and the git diff base — so the
  preflight predicts it without buying it. `verification_backstop` is 79
  of 214 recorded check-failures and each firing spends a routed call at
  close time.

  Three answers, and the middle one is the point: the backstop **will not
  run** (settling evidence, zero-budget tier, or an illegal method token);
  it **will refuse before routing** (unresolvable identity, spent round
  budget, unresolvable diff base) — reported unmet and blocking with the
  backstop's own remediation; or it **will route**, reported as a **cost
  warning, not a refusal**, because a backstop round returning VERIFIED
  closes fine. Only `EvidenceTooLargeError` stays unpredicted: it is
  raised by the evidence assembly *after* the decision.

- **`--replay-history` — the tool's reach, measured rather than
  asserted.** Replays coverage over every `closeout_failed` event in the
  corpus and reports how many still-blocking failures the preflight would
  have named first. Measured at Set 119 S2: 186 events, 214 recorded
  check-failures, 64 belonging to checks Set 116 S3 demoted (worth
  nothing to pre-empt now), **150 still blocking, of which the preflight
  covers 150**. Filtering to before `2026-08-10T20:28Z` reproduces the
  spec's prediction to the digit (184 events, 212 failures, 148
  still-blocking, 78 backstop, 122 sessions); the delta is exactly Set
  117 Session 1's two close-out failures, recorded after the spec was
  written. The prediction was right and history grew.

  It counts **coverage, not outcomes**, and says so: the working trees
  that produced those failures are gone, so it answers "would the
  preflight have named this obligation first?" — which for a
  deterministic read-only predicate is the same question.

### Fixed

- **A legacy `"session_number": 0` event no longer counts as a session.**
  Set 047's first close attempt recorded one; session numbers are 1-based
  everywhere here, so counting it inflated the replay's per-session tally
  by one (123 vs the spec's 122). Its check-failures still count — a close
  really did fail and really did name them — and the discarded events are
  reported separately as `unnumbered_events` rather than vanishing.

- **`docs/path-aware-critique.schema.json` no longer accepts a
  whitespace-only `evidencePaths` entry** (the owed residual from Set 119
  S1's own verification). The item constraint was `minLength: 1`, which a
  single space satisfies, while `path_aware_critique` rejects it via
  `p.strip()` — the sibling `description` property in the same file
  already carried the non-whitespace `pattern` and the array item did not.
  Fail-closed is not the same as in-parity (L-066-1): nothing invalid was
  ever accepted at runtime, but a schema-only consumer would have accepted
  an artifact the runtime rejects. Both directions are now pinned by
  falsifier pairs in `test_path_aware_critique_schema.py`.

## [1.0.0] — 2026-08-09 (Set 112 — the Lightweight tier is removed; staged, publish operator-gated)

> **BREAKING. A session set can no longer declare `tier: lightweight`.**
> This is the release the version number is for: `1.0.0` says the package
> now has exactly one tier and one verification story, and that the
> workflow no longer has a mode in which cross-provider verification is
> substituted rather than performed. If any `spec.md` in your repo
> declares the tier, read
> [`docs/cross-repo-lightweight-removal-notice.md`](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/cross-repo-lightweight-removal-notice.md)
> **before upgrading** — the fix is one line, and the failure is loud and
> immediate rather than silent.
>
> The release also carries the router-side work of Sets 105, 107, 109,
> 110, 111 and 114, none of which had been published: the phased
> verification loop's enforced bounds, the decision journal, the
> acceptance harness, the run-of-record and UAT close gates, the session
> checklist and its recorded posting cadence, the spec-admission cap, and
> dispatch-time provider-key validation.
>
> **Publish is deferred until Set 114 completes** (operator decision,
> 2026-08-09, at the Set 112 UAT walk). The artifact is staged and green;
> it is held, not blocked. The version number `1.0.0` was confirmed by the
> operator at the same walk.
>
> **Not yet published.** No tag, no PyPI run: the version is staged and
> the gates are green; the publish is the operator's.

### Removed

- **(Set 112 S1) The Lightweight tier is gone — this is a BREAKING
  change.** A session set can no longer declare `tier: lightweight`; a
  spec that does fails to load with a one-line migration message
  (`spec_config.LightweightTierRemovedError`) naming both remedies: set
  `tier: full` (or drop the line) and give the router a provider —
  `DABBLER_*` API keys for the Direct APIs transport, or an
  authenticated GitHub Copilot CLI seat with `transport: {profile:
  copilot-cli}`. It is never converted silently, because a silent
  conversion would run a set under discipline its author did not choose
  and did not configure a provider for. Consumer-repo migration:
  `docs/cross-repo-lightweight-removal-notice.md`.

  The tier existed to serve users who had no provider access. The
  Copilot-seat profile (Sets 078/079/084/086/104) replaced it: a keyless
  seat was measured on 2026-08-05 to expose **three** provider families
  (`anthropic`, `google`, `openai`), so excluding the orchestrator's own
  family still leaves two independent verifier families. Every known
  user is now covered by one tier whose cross-provider verification
  story is true without asterisks. Probe evidence is archived at
  `docs/session-sets/112-remove-lightweight-tier/probe-evidence-copilot-catalog.lock`.

  Deleted with it (2,581 lines of production code plus 8 test modules):

  - `dedicated_verification.py` — Mode B: the `dedicated-sessions` typed
    verification/remediation flow, its bounded re-verification loop, and
    its content-aware close gate.
  - `external_verification.py` — Mode A: the `external-verification.md`
    hand-recorded-verdict parser, and with it the framework's last
    sanctioned zero-verification path.
  - `pending_verification.py` — the owed-verification start banner.
  - `change_verification_mode.py` — the Mode A→B writer.
  - `migrate_lightweight_to_canonical_v4.py` — the Lightweight-shape
    state-file migrator, and its `lightweight-to-v4` slot in the
    `check_migrations` bulk chain and the shipped
    `docs/schema-current.json` manifest. The surviving chain is
    `v2-to-v3` then `v3-to-v4`.
  - `start_session --type verification|remediation`, `--handoff`,
    `--handoff-verdict`, `--title`, and `--verification-mode`, plus the
    `session_state.register_typed_session_start` /
    `register_typed_session_handoff` writers behind them. Typed sessions
    can no longer be CREATED; the per-session `type` field remains READ
    vocabulary so archived sets still parse and render.
  - The `verificationMode` spec field and every reader of it.
  - `runtime_mode` precedence step 3 (the spec's `tier:` field). The
    resolver now names exactly two sources.
  - `test-fixtures/cold-start/lightweight/`.

### Changed

- **(Set 112 S1) `--no-router` is a test affordance, not a tier and not
  a gate escape.** The flag and the `DABBLER_NO_ROUTER` env var survive
  for CI and hermetic tests, with exactly one meaning: **suppress routed
  API calls**. They no longer buy any close-gate relief. Three escapes
  closed:

  - `gate_checks._set_is_lightweight` is deleted. It returned True on the
    **env var alone**, and it gated both `check_verification_integrity`
    and the expensive-suite run-of-record freshness check — so a single
    environment variable, with no tier and no attestation behind it,
    disarmed two verification gates. Removing the tier while leaving that
    in place would have converted a documented tier escape into an
    undocumented back door.
  - `--no-router` no longer writes a stock manual attestation on the
    operator's behalf, nor records `verification_method="manual"`. The
    recorded method now reflects the disposition's own claim, and the
    deterministic evidence gate checks it. `--manual-verify` remains the
    one attested bypass.
  - The close backstop is still skipped under `--no-router`, for the one
    honest reason: it *dispatches* a routed verification, and a
    suppressed-dispatch invocation cannot run one.

  **Consumer impact:** a CI job that relied on `DABBLER_NO_ROUTER=1` to
  close a session without verification evidence now fails the
  verification-integrity gate. Use `--manual-verify` with an attestation,
  or produce real evidence.

- **(Set 112 S1) `tier: full` and unknown `tier:` values are tolerated,
  not errors.** Consumer repos hold hundreds of legacy `tier: full`
  lines; refusing them would turn an inert field into a migration chore
  for no safety gain. Only `lightweight` refuses. Prose that merely
  *mentions* the removed value, and yaml fences outside the canonical
  `Session Set Configuration` block, stay inert — which is what keeps
  archived session sets, proposals, and the migration notice readable by
  every tool that walks a repo.

### Added

- **(Set 114 S3) `session_checklist`'s row builder now has a second
  implementation, and a corpus that keeps the two honest.** The Work
  Explorer renders an in-flight session's steps, and it is TypeScript —
  so `_collapse_by_step_key`, `is_logged_step`, `_reconcile`,
  `_mark_here`, `plan_matches_spec` and the `spec_admission` step parse
  are mirrored in `tools/dabbler-ai-orchestration/src/providers/
  sessionStepModel.ts`.

  **If you change any of those functions, run
  `ai_router/tests/test_step_row_parity.py`.** It drives the real
  `build_rows` / `read_spec_steps` against
  `ai_router/tests/fixtures/session-step-parity.json`, a twelve-case
  corpus the extension's own Layer 2 suite asserts against as well.
  Changing this package alone fails that test, which is the point: the
  panel and the terminal must not disagree about where a session is.

  No `ai_router` runtime behaviour changes in this session — the corpus
  is a record of what the current implementation already does.

- **(Set 114 S2) The step checklist shows what is coming, sourced from
  the record.** `start_session` now parses the session's numbered steps
  out of `spec.md` and writes them into `activity-log.json` as `pending`
  entries carrying `kind: "plan-step"`, so an operator sees the whole
  session on the first post rather than one row that grows.

  This does **not** reverse Set 111 S4's decision that the renderer never
  synthesizes plan rows — it is that decision's own remedy. A checklist
  invented at render time would disagree with the file close-out gates
  on; a plan written *into* the record leaves the renderer with exactly
  one rule.

  Step texts come from `spec_admission.parse_step_texts`, the parser that
  already enforces the session-size cap, so the size a spec is admitted
  at and the plan an operator is shown cannot disagree (L-069-1: the
  duplicate-parser bug is this repo's most repeated defect). That parser
  gained the step **text** alongside the count, and a slicing fix:
  `_STEP_RE`'s leading `\s{0,3}` can consume the newline before a marker,
  so the first step of every session sliced empty — invisible to
  counting, fatal to seeding.

  **Reconciliation: the plan owns each row's position, the logged step
  owns its content.** A logged step claims the planned row with the same
  `stepKey` first — identity — and only then by `stepNumber`; only
  ordinary `log_step` entries can claim, so a `path_aware_critique` /
  `contract_gate` / `suggestion_disposition` record written by machinery
  never marks a planned step done. Nothing is dropped in either
  direction: an unplanned step appears (appended after the plan), and a
  planned step nobody logged stays a visible `[ ]`. Logging out of order
  does not reorder the plan. The `<- here` marker now prefers the
  unfinished **logged** step over an earlier still-pending planned row —
  otherwise a session on step 3 would point the operator at step 2.

  **The ordinal half is an inference, so it is gated on the spec.**
  "Logged step 2 is planned step 2" holds only while the numbers the
  orchestrator logs are the numbers the plan was seeded with. Edit the
  spec mid-session to *insert* a step and it stops holding, and an
  ordinal claim then relabels one planned row and evicts the last one —
  a planned step nobody executed, silently dropped. Inside the ledger
  the intact and renumbered cases have the identical shape, so there is
  nothing to detect; `plan_matches_spec` looks **outside** it, comparing
  the seeded step texts against `spec.md` now. An intact plan reconciles
  as before; an edited, missing, or unparseable spec withdraws the
  ordinal pass, so unmatched steps append and no planned row can be
  evicted. No row ever comes from `spec.md` — Set 111 S4's rule that the
  renderer renders the record is untouched; the spec answers one
  question, and the answer only decides whether an inference is
  trustworthy. **Stated limit:** an orchestrator that renumbers its
  `log_step` calls *without* editing the spec leaves no signal anywhere,
  and the ordinal pass will mislabel a row.

  **Seeded once, never re-seeded.** A re-registration after a context
  reset writes nothing, so no mid-session write can stale a verification
  evidence stamp (the risk the spec named, and the one Set 111 S4 lost a
  round to with `cite_lessons`), and a spec edited mid-flight cannot
  mutate the plan under an operator who read it an hour ago — its new
  work appears when that work is logged, as an unplanned row.

  **The plan is not work, and neither is writer bookkeeping.** One
  predicate — `session_checklist.is_logged_step`, an entry with no
  `kind` — now decides this for `_reconcile`,
  `check_activity_log_entry` (which gained its own refusal message
  naming the kinds it found) and `check_checklist_posted`'s "the work
  moved on" transition. Without it, every session would satisfy those
  checks at registration: seeding writes plan entries, and the
  `pathAwareCritique` / `contractGate` policy captures write their own
  `kind`-bearing entries at the same moment. A gate that can no longer
  fail is worse than no gate, because it still reads like coverage. Set
  114 S1 predicted this exact failure when it rejected an activity-log
  entry kind for the post ledger; seeding is spec-directed, so the
  predicted consequence is paid rather than inherited.

  A spec the parser cannot read costs nothing: no `spec.md`, no
  `### Session N of M:` headings, no numbered steps, or a session the
  spec does not describe, and seeding is a no-op with the checklist
  rendering exactly as before — which is what a consumer repo with older
  specs gets. A seeding failure never blocks the boundary write, and
  names itself on stderr rather than leaving a silently absent plan that
  looks like a session which has not started (L-079-1).

  `SessionLog.append_entry` is the new writer for a pre-built entry, so
  `activity-log.json` keeps one writer instead of a fourth hand-rolled
  read-modify-write; `SessionLog`'s own reads and writes now pin
  `encoding="utf-8"` rather than inheriting the Windows `cp1252` default.

- **(Set 114 S1) The step checklist is now recorded by the act of posting
  it, and a close gate checks the cadence.** Set 111 S4 shipped
  `session_checklist` and wrote the obligation to post it "at every
  transitional boundary" as prose — then ran for many hours across dozens
  of transitions and posted **once**. Nothing noticed, because a close
  gate cannot observe a chat window.

  So rendering is recording: every CLI render appends one line to
  `checklist-posts.jsonl` in the session-set directory (session,
  timestamp, step count, which step carried `<- here`). Nothing is
  self-attested. The new `checklist_posted` close gate compares that
  ledger against the transitions the session's **own** records already
  show — `startedAt` in `session-state.json`, each `test-runs.jsonl`
  record, each completed round in `sN-rounds.jsonl`, and the newest
  `activity-log.json` entry — and requires a post per transition,
  consumed in time order, so one post at the very end cannot cover a
  whole session. The gate is appended to `GATE_CHECKS`, so index-based
  consumers keep their positions.

  A **sibling** ledger rather than a new `activity-log.json` entry kind:
  an entry would be rendered by the checklist itself, making its content
  a function of how many times it had been shown, and would satisfy the
  existing `activity_log_entry` gate for a session that logged no real
  step at all. `test-runs.jsonl` is the same record-then-gate shape.

  The ledger is **freshness-exempt but evidence-visible** — named in both
  `verification_stamp.WORK_DIFF_SET_BOOKKEEPING` and
  `EVIDENCE_VISIBLE_BOOKKEEPING`. Exempt because a post written after a
  stamped round would otherwise stale that round, and a stale row sends
  the close backstop into a fresh metered round: posting would cost
  money, and the obligation would decay exactly as the prose one did
  (Set 111 S4 lost a round to this with `cite_lessons`). Still visible
  because freshness-exemption and evidence-exclusion are different
  questions (Set 111 S3), and hiding the cadence record from the verifier
  reviewing the set that ships the cadence would be a self-authorized
  reduction in verifier visibility.

  Two limits stated rather than hidden: a post proves a render, not a
  reader; and transitions older than the ledger's first post are
  unobservable and are not failed, so a session already in flight when
  this ships can still close — but a session that posted **nothing** is
  refused outright. `--no-record` renders without recording, for scripted
  or repeated reads; it can only weaken the caller's own position at
  close. The cadence itself (five transitions: session start, either side
  of a long-running command, every operator stop, after each verification
  round, before close) is defined in `docs/session-constitution.md`
  Step 4 and `docs/planning/session-set-authoring-guide.md`, which also
  names the one transition the gate cannot see.

- **(Set 112 S3) An anti-resurrection gate: the tier cannot come back one
  plausible commit at a time.** `ai_router/scripts/lightweight_resurrection_guard.py`
  fails the build if any live file *declares* the removed tier — a
  `tier: lightweight` spec entry, a `verificationMode` /
  `verification_mode` field, either mode value, or a reference to one of
  the five deleted modules — and separately asserts that the deleted
  module files and both Lightweight fixture trees are still absent. It
  runs in the `Drift guards` CI job and in pytest.

  It classifies by **position**, not by an allowlist of blessed files:
  comments, Python docstrings, markdown prose and inline backticks are
  narration and are never scanned; code outside comments, fenced code
  blocks, and YAML/JSON bodies are declaration territory and always are.
  That distinction is what lets the removal stay documented — the
  migration message, its tests, the historical note, the cross-repo
  notice and these changelog entries all name the tier freely — while
  still failing on anything that would actually take effect. Two escapes
  exist, both pinned by tests and both reported on every run: the gate's
  own two files, and an opt-in frozen-history marker for a superseded
  notice kept verbatim as a record.

  The gate paid for itself on its first run: `cross-repo-migration-guard-notice.md`,
  a notice whose banner says everything in it still applies, told
  consumers to run `ai_router.migrate_lightweight_to_canonical_v4` as
  step 2 of a 3-step bulk migration chain. Set 112 S1 deleted that
  module. The chain is two steps, and the notice now says so.

- **(Set 111 S4 remediation) `session_touched` normalises path separators
  on every platform.** `run_of_record` normalised with `os.sep`, which is
  a no-op on Linux and macOS — so a Windows-authored `files_changed` entry
  like `src\nested\a.ts` matched nothing there and the package's own
  `test_normalises_windows_separators` failed on the required
  `ubuntu-latest` / `macos-latest` matrix while passing on the developer
  machine. A disposition is authored on one machine and evaluated on
  another, so the separator a path was *written* with must never decide
  whether it is recognised. Applied at all three normalisation sites
  (`session_touched`, `load_suites`, `surface_digest`).

- **(Set 111 S4 remediation) The Layer 3 freshness map now covers every
  surface the test policy names.** The authoring guide's non-negotiable
  Layer 3 triggers are four — the Explorer rendering surface, a
  state-file writer, the extension manifest, and the fixture harness —
  but `DEFAULT_SUITES` carried only the first and third, so a session
  that changed a blessed writer or the fixture harness was told
  "session touched none of this suite's surfaces" and could close
  without the run the policy calls mandatory. The map now also covers
  `tools/dabbler-ai-orchestration/scripts/`,
  `tools/dabbler-ai-orchestration/test-fixtures/`, `ai_router/tests/e2e/`,
  and the blessed writers (`session_state.py`, `start_session.py`,
  `close_session.py`) named file-by-file — deliberately not `ai_router/`
  wholesale, since arming a 13-minute suite for every router change
  produces a gate sessions route around instead of satisfy.

- **(Set 111 S4, operator-directed) `ai_router.session_checklist` — the
  step-level progress surface.** The framework had a good **set**-level
  surface (the Work Explorer tree, `print_session_set_status`) and **none**
  at the step level: once a session was in flight, the operator could not
  see where in the process it was — even though `activity-log.json`'s
  `log_step` entries are exactly that data, written as the session runs and
  rendered nowhere. Set 111 S3 recorded the gap and deliberately did not
  build it; the operator directed it into the orchestrator during S4, so
  every repo using the framework gets it.

  ```
  python -m ai_router.session_checklist            # plain text, cp1252-safe
  python -m ai_router.session_checklist --markdown # table for a chat surface
  python -m ai_router.session_checklist --verbose  # full logged descriptions
  ```

  It resolves the in-progress set and the session in flight from
  `session-state.json` (never from file presence), and marks the step
  actually in flight with `<- here` — a checklist that shows only what is
  done answers half the question. Rows are labelled from `stepKey`, because
  descriptions are audit-trail prose and a checklist whose rows wrap is not
  a checklist.

  **It renders logged steps, not planned ones.** Synthesizing rows from the
  spec would produce a checklist that disagrees with the record, and the
  record is what close-out gates on. If the checklist looks short, the fix
  is to call `log_step` more faithfully — which also makes the checklist a
  live incentive to keep the activity log honest, something the existing
  `activity_log_entry` close gate already depends on.

  The companion obligation is in `session-constitution.md` Step 4: post the
  checklist at every transitional boundary.

- **(Set 111 S4) `ai_router.spec_admission` — the session-size cap, enforced
  at authoring time.** The operator target is 15–20 minutes of work per
  session; Sets 047–074 already met it (24 min work median) and by Sets
  106–110 the median session had reached 115 minutes. The guide had carried
  sizing prose since Set 015 and sessions kept growing anyway, because a
  session's real size is only discovered at hour three, by which point
  splitting costs a context reset.

  **The threshold is measured, not asserted.** Across the 172 schema-v4
  sessions carrying both a parseable spec plan and start/complete timestamps,
  crossing from 5 declared steps to 6 doubles the median session (42 → 84
  min), triples the p90 (110 → 386 min), and nearly triples the share running
  past two hours (10% → 28%). Hence `authoring.max_steps_per_session: 5`.

  **Stated limit, so a green result is not over-read:** step count predicts
  the MEDIAN, not the TAIL. The longest sessions on record (591/562/544/509
  min) all declared 5–8 steps. This is a floor on obvious oversizing, nothing
  more. An author who must exceed the cap declares
  `sessionSizeException: <N> - <reason>` **in the spec**, so the
  justification survives review; an exception with no reason is not honoured,
  being indistinguishable from a typo. `--check` exits non-zero for CI.

- **(Set 111 S4) `ai_router.run_of_record` + the `test_run_fresh` close
  gate — the test-run policy, made executable.** The policy (piloted in Set
  110's operator notes) is that an expensive suite runs fully **once per
  session, after the last code change**. Set 110 S3 tried to close on a full
  run that predated three test fixes, *disclosed it in the sidecar*, and was
  correctly refused by the backstop — the orchestrator agreed with the policy
  and slipped anyway. Prose does not survive end-of-session pressure.

  Freshness is a **content digest** over the surfaces a suite covers, not an
  mtime: `git checkout`, a stash pop, or a no-op save all rewrite mtimes
  without changing a byte, and both directions of that error (a stale run
  that looks fresh, a fresh run that looks stale) are unacceptable in a gate.
  Same idea as `verification_stamp.compute_work_diff_sha256`, applied to the
  testing question. `test-runs.jsonl` is append-only, so a session that had
  to run its suite twice keeps that honest history.

  Inert where it should be: a suite whose covered surfaces the session did
  not touch is not required, and a set declaring no expensive suites passes
  trivially. Suites are declared under `testing.suites` (`name`, `command`,
  `covers`, `expensive`); an explicitly empty list disarms rather than
  silently resurrecting the defaults.

- **(Set 111 S4) `disposition.uat` + the `uat_walk_recorded` close gate —
  UAT can no longer evaporate.** Set 110 S2 closed without its walk, part of
  a long pattern the operator named directly: *"We often bypass UAT. I
  haven't complained because it totally sucks, but we shouldn't bypass it."*
  The failure mode is not a decision to skip; it is a walk simply not
  happening and nothing noticing.

  A `requiresUAT: true` session now closes only with `disposition.uat`
  recording `status: "walked"` (plus a `walkArtifact` that **exists on
  disk** — a recorded walk must point at the walk actually presented) or
  `status: "waived"`, each with a non-empty `attestation`. There is
  deliberately no third value. Scope follows the config block (`per-set` →
  the final session; `per-session` → every session; anything else —
  omitted, `none`, or a typo → `per-set`, because scope chooses WHICH
  sessions owe a walk and never cancels the requirement), and
  `requiresUAT: "suggested"` stays advisory and ungated, because arming an
  advisory flag would be a policy change this work was not asked to make.
  Opting out is done visibly, with `requiresUAT: false`.

  **(S4 remediation)** `uatScope` originally had a hole shaped like the
  gate's own purpose: an omitted scope parsed to `"none"` and disarmed the
  gate entirely, so `requiresUAT: true` with no scope — the likeliest
  hand-authored shape — was exactly the spec that could close with no walk
  and no complaint. `SessionSetConfig.uat_scope` is now `Optional[str]`
  (`None` when omitted, which is not the same statement as `none`), and
  scope no longer disarms an armed flag.

- **(Set 111 S4) `drift_guard` check `actions-sha-pinned`, plus
  `.github/dependabot.yml`.** Every workflow `uses:` is pinned to a
  40-character commit SHA (31 references across three workflows), including
  `pypa/gh-action-pypi-publish`, which was on a moving **branch**
  (`@release/v1`) on the PyPI publish path; the stray
  `actions/setup-python@v4` / `@v5` split converged on v5.6.0. A tag is
  mutable, so a compromise of an action reaches every workflow referencing
  it. Local `./.github/actions/...` composite actions are exempt — they
  resolve in-repo at the workflow's own commit. Dependabot is the declared
  bump path (it rewrites the SHA and its trailing `# vX.Y.Z` comment
  together, so the comment cannot drift from the pin); a SHA pin nothing
  maintains rots invisibly, which is worse than the tag it replaced.

- **(Set 111 S3) `ai_router.decision_journal` — decision rights, routed by
  authority, journaled for audit.** Operator-gated adjudication assumes an
  operator who can responsibly decide; in an AI-led workflow the operator
  usually lacks the surfaced context and will not rebuild it, so a stop that
  asks them to adjudicate a *judgment* call is a context transfer they did
  not ask for. The rubric therefore routes by **whose authority a decision
  needs**, not by how much judgment it takes — difficulty is not a routing
  signal.

  **Four classes stay human**: external or hard-to-reverse consequences,
  underivable value trade-offs, accountability sign-offs, and — the hard
  carve-out — **anything that reduces verification**. Everything else that
  is judgment-shaped (spec-vs-reality conflicts, waiver adjudications,
  severity disputes, placement / layout / scoping) is the orchestrator's
  call under **ordered tiebreaks**: goal over letter → prefer reversible →
  simpler code / fewer tests → defer to an existing gate → cross-provider
  consensus → human.

  **The carve-out is enforced, not advised.** `record_decision()` refuses
  to write a record whose `verification_effect` is `reduces` under
  `authority="ai"` (`VerificationReductionRefused`), and the operator's own
  record additionally requires a non-empty `operator_attestation`. Stated
  precisely, because a docstring that overclaims is its own defect class
  (L-064-8): `verification_effect` is **mandatory with no default**, so the
  conscious declaration is the primary control; the phrase screen behind it
  is a backstop that **can only ever escalate** — it refuses a careless
  `none`, it never permits a write — and it is expressed as one
  verb-near-noun proximity rule rather than a literal phrase list,
  because S2 spent six verification rounds proving that such lists grow one
  spelling per round forever (L-069-1).

  **The artifact** is a per-set `decisions.jsonl` (append-only, git-tracked)
  carrying the question, the decision, the authority, the **rubric line that
  fired**, the **options considered** with each one's consequence and
  reversibility, the overall reversibility, and the declared verification
  effect. UX-preference deferrals are tagged `uat_decide: true` at the
  moment they are deferred, so the UAT walk's *Decide* section is a query
  (`--uat-decide-only`) rather than a memory exercise. CLI:
  `python -m ai_router.decision_journal --rubric | --session-set-dir <dir>
  [--uat-decide-only] [--append-json -]` (exit 5 = refused).

  `decisions.jsonl` joins `verification_stamp.WORK_DIFF_SET_BOOKKEEPING`:
  the rubric makes waiver adjudications AI-decidable and those happen after
  a round by definition, so without it the sanctioned flow would stale its
  own stamp and send the close backstop into a fresh, unbounded metered
  round. **Freshness-exemption is not evidence-exclusion**, and this
  session's own supplementary round caught the author conflating them — the
  first draft suppressed the journal from a `--phase` round's evidence,
  which is a verification reduction no orchestrator may self-authorize. The
  two consumers now have two constants: the journal is freshness-exempt
  (`EVIDENCE_VISIBLE_BOOKKEEPING`) but stays visible in the evidence bundle
  (`PHASED_EVIDENCE_SET_EXCLUDES`, derived from the freshness list minus
  those entries so shared entries cannot drift).

  Cross-field coherence is validated too, because `authority`,
  `rubric_line` and `verification_effect` describe one decision from three
  angles and a hand-assembled record can be individually well-formed and
  jointly false: a `verification-reduction` line must declare
  `reduces` (or it slips past the attestation requirement), an
  `escalate-to-human` line must carry `authority="human"` (or an operator
  stop is recorded as an AI call), and `authority="human"` must cite a line
  that routes to the operator.

  Docs: `docs/ai-led-session-workflow.md` gains **Decision rights — the
  rubric** and **Education-mode briefs** (the required five-part format for
  every operator stop: where the set stands / the question in one sentence /
  options with consequences / recommendation with confidence / default on no
  answer), and *Decision-time consensus* is re-drawn as **tiebreak 5** of
  that rubric rather than a parallel mechanism with its own eligibility
  split — a consult can never move a decision from human to AI authority.
  `docs/session-constitution.md`, `AGENTS.md`, `CLAUDE.md` and `GEMINI.md`
  carry the pointer; `router-config.yaml`'s `delegation.decision_consensus`
  comments now say the category list is a **cost** control on tiebreak 5,
  not a second authority split.

- **(Set 111 S2) Provider API keys are validated at DISPATCH, not at config
  load.** Operator decision, 2026-08-07. The framework has **two supported
  populations**, and a machine with no `DABBLER_*` keys is healthy in one of
  them:

  - **Copilot CLI** — a GitHub Copilot seat with *no provider API keys at
    all*; every call dispatches through the CLI.
  - **Direct APIs** — provider keys, no Copilot seat.

  `load_config()` used to raise `EnvironmentError` for a missing key on any
  `api`-profile config, which meant every **read-only** consumer — drift
  guards, guidance reports, registry checks that touch no provider and make
  no network call — failed on a perfectly healthy Copilot seat, complaining
  about credentials nothing in that code path would have used. The
  repository's own `check_model_registry_matches_providers` guard is the
  worked example: its docstring says it "reads only local files ... and
  never probes a provider", yet it could not run without an OpenAI key.

  `load_config(path, *, require_api_keys=False)` now defaults to **not**
  validating, and the router's dispatch entry point (`_init()`) passes
  `require_api_keys=True` — so the complaint fires exactly where the
  operator's rule puts it: when something is actually attempting a
  direct-API dispatch. The validation itself is now a named, testable
  function, `config.validate_provider_api_keys()`, and the `copilot-cli`
  exemption still applies inside it. `providers.call_model` continues to
  raise its own missing-key error at the true point of use, so the
  direct-API path is not weakened — only the false alarms are gone. Docs
  (`quick-start.md`, `session-constitution.md`, `CLAUDE.md`, `GEMINI.md`)
  now state the two transports side by side instead of presenting keys as
  universally required.

- **(Set 111 S2) `ai_router.acceptance_harness` — verifier-authored acceptance
  criteria, gated by baseline discrimination.** Fix-checking was an open-ended
  re-review (*"look at this again"*), which is why a salience-limited reviewer
  keeps returning fresh findings and why the orchestrator ended up writing its
  own falsifier for its own fix. The verification template now asks for one
  **acceptance criterion** per Critical/Major finding — a single backticked
  command where possible, `JUDGMENT - <sentence>` where not — parsed tolerantly
  into the round envelope's new optional per-issue `acceptance` block
  (`kind` / `command` / `expectedExitCode` / `expectedOutputContains` /
  `statement`; `docs/session-issues.schema.json`).

  A criterion is **not evidence until it discriminates**:

  ```
  python -m ai_router.acceptance_harness --session-set-dir <set> --round <R>
  ```

  runs each **unchanged** criterion against the round's
  `discoveryBaselineTree` (pre-fix) and a fresh working-tree snapshot
  (fixed), and auto-closes a finding **only when it fails before and passes
  after**. Every other outcome — `not-discriminating` (the criterion already
  passed pre-fix, i.e. vacuous), `still-failing`, `test-asset-modified` (the
  remediation edited the ruler), `criterion-changed`, `refused-unsafe`,
  `judgment`, `no-criterion`, `error` — leaves the finding blocking and
  judgment-based. Results are written to `sN-acceptance-round-<R>.json`.

  **Containment:** verifier-authored shell is untrusted input, so a
  criterion's ordinary relative reads and writes land in a throwaway
  checkout rather than the live working tree. Each criterion gets its
  **own fresh pair** of disposable git worktrees checked out from the
  captured tree objects, with **no shell** (shell operators refused rather
  than interpreted; a shell or fetch tool as `argv[0]` refused outright),
  a credential-stripped process environment, a wall-clock timeout, and
  cleanup on every path including errors. It is **containment, not a
  sandbox**, and the docs say so narrowly: the network is not blocked,
  OS-level credential stores remain reachable, and the disposable checkout
  is a working DIRECTORY rather than a filesystem confinement — an
  absolute-path write is not prevented. A venv or bare `python`
  in `argv[0]` is rewritten to the harness's own interpreter, so the
  documented `.venv/Scripts/python.exe` form works inside a checkout where
  `.venv/` is gitignored.

  **"Unchanged" is bound to the raw artifact.** A finding is judged by the
  criterion in the immutable `sN-verification*.md` — not the one in the
  envelope (a derived artifact the orchestrator is invited to annotate),
  and not one carried over from a previous harness run, which would leave
  the FIRST run unguarded. Two further fail-closed guards: a result whose
  recorded `fixedTree` is no longer the tree under review is rendered as
  **stale** rather than as settled evidence, and criteria from a round
  that did not record its own pre-fix baseline (only discovery-family
  rounds do) return **`baseline-mismatch`** rather than being compared
  against a tree that predates the fix. A criterion's **scope** for test-asset
  invalidation is its path tokens' subtrees, or the whole repo for a test
  runner named without a path, so `pytest` with no arguments no longer
  slips past.

  Template version bumped: `TEMPLATE_ID = session-verification-v5`, with the
  new normalized hash pinned in `TEMPLATE_HASHES` (an edited-but-unbumped
  template still fails closed at stamp time). `sN-acceptance-round-*.json` is
  added to `WORK_DIFF_SET_BOOKKEEPING`, so a harness run between rounds cannot
  stale an earlier round's stamped evidence.

  Exactly one `--phase remediation-review` is retained as the final holistic
  look: baseline discrimination proves a criterion is *related* to the defect,
  never that it is *sufficient*. That round now reads the harness artifact, so
  criteria-closed findings arrive with both runs' evidence attached and its
  attention goes to what the fixes **broke** and what the criteria **missed**.
  Fix-verdict coverage is unchanged — every ledger id still gets its line
  every cycle.

- **(Set 110 S4) `transport.profile` is a supported `local-overrides.yaml`
  key.** The transport profile is a per-**seat** fact, but `router-config.yaml`
  is package data (`pyproject.toml` ships it) and the profile had no local home,
  so the only way to run on a Copilot seat was to edit and commit the tracked,
  shipped file. Doing so makes the wheel unusable for API-key-only consumers:
  the `copilot-cli` profile skips provider API-key validation and then requires
  a `copilot-catalog.lock` that is deliberately never tracked. A seat now
  selects its transport locally:

  ```yaml
  # ai_router/local-overrides.yaml  (gitignored)
  transport:
    profile: copilot-cli
  ```

  The override is merged **before** validation, so selecting `copilot-cli`
  locally still has to satisfy the `transports.copilot-cli` block check — a
  local override buys a different default, not a way around validation. Only
  `transport.profile` is overridable; any other `transport.*` key is rejected
  with the same Appendix B error as every other disallowed path. A test pins the
  shipped `router-config.yaml` to `api` so the seat-local value cannot be
  committed again.

- **(Set 109 S1) `ai_router.model_inventory` — provider model enumeration and a
  registry drift gate.** `--refresh` probes OpenAI's, Anthropic's, and Google's
  model-list endpoints and writes `ai_router/model-inventory.lock`, a snapshot
  of the ids each provider offers plus a per-provider probe timestamp.
  `--check` compares every `model_id` in `router-config.yaml` against that
  snapshot and fails loud (exit 1) on **any** entry naming an id the provider
  does not offer — there is no carve-out, because an exit 0 that tolerated a
  known miss would certify an invariant that does not hold. The report still
  separates a *routable* miss (an id that can be put on the wire) from an
  *identity-only* one (`is_enabled: false`, a record of what an orchestrator
  IS), since they differ in urgency; they do not differ in the exit code.

  `--check` reads only local files — it never probes — so it adds no
  session-start latency and is deterministic in CI. A provider that has never
  been enumerated is a **fatal** condition (exit 2), not drift: "we could not
  ask" and "the provider does not offer it" are different facts, and conflating
  them would report every model of that provider as missing. A `--refresh` that
  fails for one provider keeps that provider's previous snapshot rather than
  downgrading it, and reports the failure with a non-zero exit.

  "Routable" is deliberately **not** `is_enabled` alone: any alias named in
  `task_type_overrides` or `tier_assignments` is a declared routing
  destination and is treated as routable regardless of its flag, because this
  gate must never under-report. (When S1 shipped, such an entry could also
  literally reach the wire while disabled; **Set 109 S2 closed that** — see
  below — and the conservative treatment was kept on the "declared
  destination" ground rather than the reachability one.)

  When S1 shipped it the gate was **deliberately unwired**, for one reason: the
  repository's own registry failed it — `router-config.yaml` sent
  `model_id: gpt-5.6`, an id OpenAI does not list — so arming it would have
  turned the committed suite red on the day it landed. **Set 109 S4 corrected
  the registry and wired the check into `ai_router/scripts/drift_guard.py`**
  (see below).

- **(Set 109 S1) Metrics rows now record the model the provider actually
  served, and flag a substitution.** `router-metrics.jsonl` gains three
  additive columns: `requested_model_id` (the string sent on the wire),
  `served_model_id` (the id in the response body — Anthropic/OpenAI `model`,
  Google `modelVersion`), and `served_model_mismatch`. The pre-existing
  `model` column holds the local registry *alias*, so neither the substitution
  nor the comparison was recoverable from a row before this. The flag is
  tri-state: `true`/`false` when both ids are present, and `null` — not
  `false` — when either is absent, since an uncaptured id does not establish
  that the provider served what was asked for. All three are `null` on
  historical rows and on any caller that does not supply the ids.
  `print_metrics_report` gained a *Requested vs served model* section that
  groups substitutions by `requested -> served` with counts. Read the flag as
  a pointer rather than an alarm: OpenAI routinely pins a dated snapshot
  (`gpt-5.4-mini` → `gpt-5.4-mini-2026-03-17`), which is a true mismatch and
  entirely ordinary; the costly kind is a change of model *family*
  (`gpt-5.6` → `gpt-5.6-sol`), and the two ids beside the flag are what tell
  them apart. The Copilot CLI transport lands its already-parsed echoed model
  on the same column.

- **(Set 109 S2) `ai_router.call_trace` — a scoped count of real provider HTTP
  requests.** `trace_provider_calls()` is a context manager collecting every
  POST issued inside it, tagged with provider and the model id put **on the
  wire**:

  ```python
  with trace_provider_calls() as calls:
      route(..., exclude_providers=["anthropic"])
  assert [c.provider for c in calls] == ["openai"]
  ```

  Requests are announced *inside* each provider caller rather than in
  `call_model`, which wraps the retry loop — counting above it would
  undercount exactly the requests most worth seeing. Outside a trace scope it
  is a ContextVar read and a `None` test: no list, no lock, no accumulating
  state on the production path. This exists because a metrics row is a claim
  the recorder makes about itself, and nothing below the recorder could
  distinguish "one `route()` made two requests" from "one request was written
  down twice" — readings with opposite consequences.

  Note that requests and rows are **not** one-to-one, by design: an escalation
  issues a second request and records one row, and so does a retry. The
  invariant the suite pins is directional — every provider a row names must be
  one the router actually called.

- **(Set 109 S3) `ai_router.pricing` — rates that can express what providers
  actually charge.** A model entry declares its rates **either** as the two
  flat `input_cost_per_1m` / `output_cost_per_1m` scalars (unchanged, and
  still right for the single-rate majority) **or** as a `pricing:` list of
  rate rows — never both on one entry, because two declarations that can drift
  apart is the original defect wearing a new hat. A row carries two optional
  keys: `max_input_tokens` (inclusive upper bound; the row applies when the
  call's input token count is at or below it) and `effective_from` (the first
  day it applies). Rows sharing an `effective_from` form a period, so tiers
  and dates compose without nesting:

  ```yaml
  gemini-pro:                       #  $1.25/$10.00 at <=200k, $2.50/$15.00 above
    pricing:
      - max_input_tokens: 200000
        input_cost_per_1m: 1.25
        output_cost_per_1m: 10.00
      - input_cost_per_1m: 2.50
        output_cost_per_1m: 15.00
  ```

  Validation runs at **config load** and fails closed. Notably a period with
  no unbounded row is rejected outright: without one, a prompt larger than the
  largest bound would have no rate at all and cost nothing, which is the exact
  class of silent under-reporting this set exists to end. `true` is rejected
  as a rate (`True == 1` in Python), unknown row keys are rejected rather than
  ignored (a typo'd `max_input_token` would silently widen a tier), and each
  period is checked independently.

  Per-call cost now resolves the row from the call's own `input_tokens` and
  today's date — all five `_calculate_cost` call sites already passed
  `input_tokens`, so no signature changed. The model-**selection** paths
  (verifier tiebreak in `verification.py`, escalation fallback in `models.py`
  and `utils.py`) instead rank candidates by `worst_case_output_cost_per_1m`:
  they choose before the output length or a future billing date is known, and
  "cheapest available" would make a tiered model look cheaper than it can
  bill while "the rate in force today" would silently reorder the candidate
  list on a calendar boundary with no code change.
  `pull_verifier._pricing_for` and `report._opus_pricing` take the worst case
  for the same reason — both resolve one rate pair before any token count
  exists, and a cost **cap** that reads low is the one direction that must not
  happen.

- **(Set 109 S3) Per-model `confirmed_on`, replacing a global date that could
  not say what it had checked.** `confirmed_on: "YYYY-MM-DD"` records the day
  a human last confirmed **that entry's** rates against the provider's page.
  Its absence is the honest state for a rate nobody has checked, so absence is
  never an error — it is what the load-time warning names. That warning is now
  one line listing the unconfirmed and stale entries by name rather than a
  count, because a count tells an operator something is wrong without telling
  them where to look.

  `metadata.pricing_reviewed` is deliberately **kept**: the VS Code extension's
  Cost Dashboard renders its own staleness banner from that field, and
  extension work is an explicit non-goal of this set — deleting it would have
  broken a shipped surface this work is not allowed to touch. It is now a
  maintained rollup (the oldest per-model stamp) written by `--apply`, so it
  cannot drift away from the stamps it summarises.

- **(Set 109 S3) `ai_router.pricing_proposal` — scrape to PROPOSE, never to
  write.** `--fetch` fetches all three published pricing pages, parses them,
  diffs against `router-config.yaml`, and writes `pricing-proposal.json` with
  every change marked `"decision": "pending"`. The YAML is not touched.
  `--apply` reads the proposal back, **refuses while any change is still
  pending**, writes only the ones marked `accept`, and stamps `confirmed_on`
  on exactly those entries. Accepting is an edit to the proposal file, which
  needs no TTY — so both halves of the flow are exercised by the hermetic
  suite rather than only by the operator who walks them. `ruamel.yaml` is
  lazily required at `--apply` only (mirroring `migrate_router_config`), since
  `router-config.yaml`'s comments are load-bearing documentation a plain
  round-trip would delete; fetching, parsing, diffing, and reporting all work
  without it.

  **All or nothing across providers.** If one page fails to fetch or parse,
  no proposal is written at all — a proposal covering two of three providers
  reads as "prices checked" while the third silently rots. A page whose
  *structure* changed is therefore fatal (exit 2), while a page whose *price*
  changed is the success case (exit 1, a proposal; exit 0 when nothing
  differs). The structural assertions are deliberately narrow — the header and
  row-label text the extraction depends on, and nothing else; row counts and
  CSS class names are not asserted, because an assertion that fires on
  harmless churn trains an operator to ignore it.

  Parsing is stdlib `html.parser`, adding no dependency. That is not a
  stylistic choice: Google emits **unescaped** `<= 200k tokens` inside table
  cells, and the obvious `<[^>]+>` strip swallows the tier boundary as though
  it were an open tag — leaving a plausible-looking single price. Scope is
  narrow by design: standard per-token input and output rates only, never the
  cached-input, cache-write, batch, flex, or priority columns. On Google that
  exclusion is load-bearing rather than cosmetic — the Batch section is
  exactly half the Standard rate, so reading the wrong one would understate by
  2×, the same magnitude and shape as the defect that started this.

  Identity binds without fuzzy matching: by `model_id` where the page prints
  an api id (OpenAI's first column, the `<code>` span under each Google
  heading), and for Anthropic — whose table prints only display names — by a
  derivation rule (`claude-sonnet-4-6` → `Claude Sonnet 4.6`) rather than a
  hand-kept lookup table, since a second registry mapping ids to names is one
  more thing to drift. A configured model the page never mentions is reported
  loudly as **not checked** rather than skipped silently; page rows no entry
  claims are listed too, which is how the tool surfaces a model worth adding.

  One rate the page states is deliberately **not** proposed: OpenAI publishes
  short- and long-context columns but never says where the boundary falls, so
  the long-context pair is carried as an observation for a human to encode
  with an explicit `max_input_tokens`. Manufacturing that number would be
  inventing the one thing the page does not state.

  An unchanged rate still reaches a stamp. It appears as a `confirm` entry
  going through the same accept/reject machinery, writing **only**
  `confirmed_on` and never a rate — without which a registry whose prices are
  all *correct* could never become one whose prices are all *confirmed*, and
  every stamp would age out at `review_frequency_days` with no sanctioned way
  to refresh it. Confirm entries appear only while an entry is unstamped or
  stale, so a freshly confirmed model stays out of the way.

  Classification of a section the parser cannot read is the part six rounds of
  verification concentrated on, and it settles three-way. A **configured**
  model whose section is on the page but unreadable is **fatal** — no proposal,
  any previous proposal moved aside to `pricing-proposal.stale.json`, exit 2 —
  because "no silent partial" cannot mean a line an operator skims past on the
  way to applying eleven other changes. A configured model **absent from the
  page entirely** stays reported-but-not-fatal: that is a *registry* defect
  (`gpt-5.6`, which OpenAI does not list) for a later session, not a parser
  failure. A model **nobody configured** is ignored, since roughly a hundred of
  Google's sections price video, images, TTS and robotics that no run cares
  about. Crucially, a parse failure can no longer *masquerade* as absence: all
  three parsers now record a row they could not read rather than skipping past
  it, so "absent" means absent.


- **(Set 109 S4) `route(prefer_model=...)` — a call-level model preference, so
  the verification discovery fan-out can run on a cheap model.** Consulted by
  `pick_model` **before** the `task_type_overrides` pin and under the identical
  guard, which makes it a preference in exactly the sense the pin is: an
  excluded provider still overrides it, and an alias that is unknown, disabled,
  or above `max_tier` is ignored — each case falling through to the pin.

  It exists as an argument rather than as a new task type on purpose, and the
  reason is load-bearing. `route()` gates the **dynamic orchestrator
  exclusion** on `task_type == "session-verification"`, and that exclusion is
  the only thing guaranteeing a session is not verified by its own provider. A
  `session-verification-discovery` task type would have looked correct, passed
  every existing test, and silently dropped it — along with the
  `verification_stamp` legality check and the `session_verification_started`
  metrics event. An independently routed design review (Anthropic excluded)
  reached the same conclusion unprompted.

  `verification.discovery.model` wires it: `verify_session` passes the
  preference on **discovery** calls only. The supplementary and
  remediation-review passes adjudicate — they decide whether a finding is real
  and whether a fix landed — and that is the wrong place to economise, so they
  keep the pinned verifier.

  > **The mechanism ships; the pin does not.** `verification.discovery.model`
  > is committed **unset**. S4 armed it on price alone, and its own
  > verification round caught that the set's risk register requires evidence
  > of finding *quality* before the fan-out moves to a cheaper variant — *"the
  > pin should move only with evidence, not with the price list."* No such
  > evidence exists, and what little S4 produced points the other way: on the
  > same session diff, Luna's two discovery calls returned one Major while
  > Sol's single supplementary call returned three more, two of them ordinary
  > correctness bugs. The framings differ, so that is a data point rather than
  > an experiment — but it is not grounds for arming the pin. The code path is
  > shipped, tested, and inert; uncommenting one line enables it.

- **(Set 109 S4) The model-registry drift check is wired into
  `ai_router/scripts/drift_guard.py`.** A commit naming a `model_id` no
  provider offers now turns CI red, instead of waiting for someone to remember
  `model_inventory --check`. The check reads only `router-config.yaml` and the
  committed lockfile and never probes, so it is deterministic and goes red on a
  commit rather than on a provider's release schedule; a checkout carrying
  neither file reports nothing rather than failing.

- **(Set 109 S4) `cost_report.HISTORICAL_RATE_CORRECTIONS` and the disclosure
  it drives.** `print_cost_report` prints a `[!] HISTORICAL RATE CORRECTION`
  block naming only the affected models **present in that report**, with the
  correction date, the measured factor, and the reason; the JSON report carries
  the same lines under `historical_rate_corrections`, so a programmatic
  consumer cannot read a total as clean. A report containing no affected model
  carries no caveat, because a notice that fires on every report is one an
  operator learns to scroll past.

### Changed

- **(Set 116 S3) Ten close-out checks became three gates, two
  transactional preconditions, and five warnings. Nothing was deleted.**
  Operator ruling of 2026-08-10, attested at the time of implementation
  in Set 116's `decisions.jsonl` (`authority: human`,
  `rubric_line: verification-reduction` — this is inside the
  decision-rights hard carve-out and cannot be self-authorized).

  - **Gates, which refuse a close:** `verification_integrity`,
    `uat_walk_recorded`, `test_run_fresh`.
  - **Transactional preconditions, which also refuse but for a
    different reason:** `working_tree_clean`, `pushed_to_remote`. They
    protect the *write* — a close computed against a dirty or unpushed
    tree records something that was never true. Calling them gates is
    what made "ten gates" sound like ten pieces of ceremony when two of
    them are data integrity.
  - **Advisory, which run and print and cannot refuse:**
    `activity_log_entry`, `next_orchestrator_present`,
    `change_log_fresh`, `checklist_posted`, and
    `verification_method_vocabulary`.

  `gate_checks.ADVISORY_CHECKS` is the executable form of the table and
  `is_blocking_check()` is the single predicate every consumer asks, so
  re-arming a demoted check is a one-line edit rather than a hunt
  through the places that spell `not passed`. **Consumer-visible:**
  every `gate_results` row in `close_session --json` now carries a
  `blocking` boolean, and human-readable output prints `[WARN]` beside
  a failed advisory check instead of `[FAIL]`. A close that reports a
  warning and succeeds is now a normal outcome. (`--force` is unchanged
  and remains narrower than the whole chain: it runs
  `verification_integrity` alone, so a forced close prints no advisory
  warnings — they were never run on that path.)

  Two consequences are stated rather than discovered:

  1. **There is no longer a close-time check that
     `verification_method` is a legal token.** `validate_disposition`'s
     rule 4 is not run at close, and this check was its only
     enforcement point. The Set 083 bypass incident is still refused —
     by `check_verification_integrity`'s evidence layer, which is
     unchanged, and on an ordinary repo even an unknown token cannot
     pass it, because the token *selects* the corroboration path and a
     token with no path falls through to the zero-budget arm. The
     demotion bites in two places: under `--manual-verify`, and on a
     repo that has declared the zero-budget tier and written the same
     non-standard token into `budget.yaml`. The education-mode brief
     that preceded the attestation described the residual in its
     *broader* form ("a corroborated close can persist an illegal
     token"), which overstates the exposure rather than understating
     it — so the attestation covers strictly more than the code does
     and needs no revisiting. The narrower statement above is the one
     the tests assert.
  2. **`checklist_posted` was ruled for deletion and revised to
     demotion**, once it emerged that Set 114 S1 had shipped it that
     same morning. A demoted check that never surfaces anything worth
     acting on is a deletion candidate later, **on evidence**; six
     hours of hindsight is not evidence.

- **(Set 116 S3) `test_run_fresh` now governs every layer, and the full
  run moved from Step 5 to Step 8.** Two halves of one defect.

  `pytest` and `mocha` carried `expensive: false`, and `expensive` is
  the flag that decides whether the gate has an *opinion* — not a claim
  about the clock. So the once-per-session-after-the-last-code-change
  rule never governed the suite that cost the time: Set 112 S3 ran 15
  suites across 186 minutes, 59% of the session, entirely unremarked,
  and Set 114 shipped two close-gate regressions into its own sample
  project while Layer 2 sat unrun for two sessions. All three layers
  are now `expensive`, and pytest's recorded command picked up Set 116
  S1's `-n auto` default (a run of record naming the serial command
  records a run nobody performs). The path-level scoping is unchanged,
  so a docs-only session still owes nothing — which is what makes the
  widening affordable.

  And "after the last code change" now names **Step 8**, after
  remediation. Step 7 remediation *is* a code change and verification
  finds something in nearly every session, so the Step 5 instruction
  was unsatisfiable wherever it mattered rather than merely ignored.
  This depends on Set 116 S2's staleness fix: recording a run no longer
  stales the verification that just passed, which is what lets the full
  run be a last step instead of a loop.

  **Consumer-visible:** a session that changes `ai_router/` (or the
  extension's `src/`) now owes a green, digest-fresh recorded run of
  that suite before `close_session` will proceed. Repos that declare
  their own `testing.suites` are unaffected — the change is to this
  repo's bundled defaults.

- **(Set 111 S1) The Copilot CLI transport's dispatch ceilings are
  configurable, and the total one is raised.** `cli_transport.py` hardcoded
  `spawn` / `first_byte` / `total` timeouts (10s / 30s / **300s**) with no
  config key and no env override, and `__init__.py` constructed the transport
  with the defaults. The 300s total is **seat-dependent**: a Copilot seat
  dispatching a full `session-verification` evidence bundle (~116 KB — the
  largest prompt this system sends, and it goes over the Set 104 file-handoff
  path, so the verifier must read the whole file before emitting anything)
  cannot finish inside it. The observed failure was two consecutive
  `error_class='total-timeout'` dispatches with **nothing written**, while a
  trivial prompt through the same CLI returned in 13s — i.e. a **mandatory**
  gate the transport could not complete. That is the same class, and the same
  reasoning, as Set 109 S3 raising `providers.google.timeout_seconds` from 300
  to 900: a correctness knob, not a comfort one.

  ```yaml
  transports:
    copilot-cli:
      timeouts:
        spawn_seconds: 10
        first_byte_seconds: 30
        total_seconds: 1200   # was a hardcoded 300
  ```

  Additive and default-preserving: an absent `timeouts:` block resolves to the
  shipped constants exactly as before. Validated at **load** — unknown keys are
  rejected rather than ignored (a typo'd `total_second` that silently kept 300s
  is precisely the failure this ends), non-numeric and non-positive values are
  refused, `True` is not accepted as `1`, and design lock Section 3's
  `spawn < first_byte < total` ordering is now enforced instead of merely
  commented (out of order, an inner ceiling can never fire and a stall is
  misclassified at the outer one).

- **(Set 111 S1) The verification loop's bounds are ENFORCED, not printed.**
  `verify_session` documented "at most 2 discovery passes and 2
  remediation-review cycles" and then only *printed* an advisory line —
  `count_phase_rounds` fed the "Next action" message and nothing refused a
  run past it. Measured result: the cap was routinely exceeded after it
  shipped (one session ran 13 verification calls over 379 minutes; a Set 110
  session ran 9 rounds). The numbers are unchanged; the CLI now **refuses**
  the round that would pass one, before any metered call.

  - Bounded units: **2 discovery-family passes** (`discovery` +
    `supplementary` share one budget — they are the two discovery passes),
    **2 `remediation-review` cycles**, and **2 classic no-`--phase` rounds**.
    The classic bound counts *any* prior findings-bearing round, so dropping
    `--phase` at the phased bound is not a one-flag bypass.
  - Only **findings-bearing** rounds consume a budget: a clean round ends the
    loop on its own, and `--wording-only` re-collects a prior round's verdict
    FORMAT rather than opening a cycle. Neither counts. (See the ledger note
    below for the one clean round that *does* count.)
  - Passing a bound requires the **operator's** attestation:
    `--operator-authorized-round "<reason>"`. The flag alone is not an
    authorization — an empty value is refused, the same contract as
    `close_session --manual-verify` — and it is appended to the session's
    append-only round ledger `sN-rounds.jsonl` **before** the call it
    authorizes, so an authorization survives a provider failure. The ledger
    joins `WORK_DIFF_SET_BOOKKEEPING`, so writing it mid-loop cannot stale an
    earlier round's stamped evidence.
  - **The ledger, not the findings envelopes, is what the bound counts.** A
    round consumes its family's budget unless it ENDED the loop, and the
    envelopes cannot express that: a **clean `supplementary` round whose prior
    discovery blockers still stand** is the second discovery pass and the loop
    continues to remediation, yet it writes no envelope. Counting envelopes
    alone let a third discovery-family pass through unauthorized — found by
    this session's own supplementary verification round, which reproduced it.
    `sN-rounds.jsonl` records every completed round's phase, verdict and
    `endedLoop`; the count is the union (by round number) of the ledger and the
    envelopes, so sessions predating the ledger keep their enforcement and no
    round is counted twice. The reader is tolerant: a torn final line never
    voids the records before it (failing open there would unlock the loop).
  - The printed next action is now consistent with the refusal: at a bound the
    CLI names the suspension and the operator/adjudication path, and never
    prints a re-run command the next invocation would reject.
  - **An exhausted budget can never deadlock a close.** The close backstop
    composes `verify_session`'s helpers but does not go through `run()`, so
    the gate's own corroboration round is not refusable — enforcement binds
    the orchestrator's rounds, not the close-out's.

- **(Set 111 S1) The K=2 discovery fan-out sends differently-framed prompts,
  not identical ones.** Same K, same cost, same loop position, same envelope
  merge — the calls now carry a per-call **lens**: `spec-conformance` (plan →
  diff: unmet deliverables, silent scope changes, docs that drifted from the
  code) and `failure-scenario` (code → the ways it breaks: error paths,
  partial failure, concurrency, platform/encoding, cleanup, untrusted input),
  cycled by call index. Neither lens narrows scope and the severity rubric is
  untouched. The merged envelope records `discoveryLens` beside
  `discoveryCall`, and each call's evidence stamp now hashes **its own** filled
  prompt (previously one shared hash, correct only while the bundles were
  byte-identical). This is the only surviving residue of the parallel-lens
  proposal, which was otherwise dropped for charging every clean session a full
  parallel wave.

- **(Set 111 S1) A Minor-only round is a structural STOP.** The exit path used
  to print a generic "non-blocking (effectively VERIFIED)" line, which left
  "one more round to polish the nits" available. A Minor-only round is now
  named as such, with its finding count, an explicit instruction not to open
  another round, and **only** the `close_session` command — no re-run command
  is offered. A round with no Critical/Major says exactly that (a `VERIFIED`
  token drops the NITS section at the parser, so the line points at the raw
  artifact for nits rather than claiming the round had no findings at all).

- **(Set 109 S4) The model registry now matches what the providers actually
  offer, and every routable rate is confirmed rather than assumed.**
  `python -m ai_router.model_inventory --check` **passes for the first time**:
  all 15 configured `model_id`s are offered by their provider.

  - The bare `gpt-5.6` alias is **retired**. OpenAI never listed it and served
    it from `gpt-5.6-sol` at twice the recorded rate. It is replaced by three
    explicit entries — `gpt-5-6-sol` (the pinned `session-verification`
    verifier, unchanged in behaviour and now honest about its price),
    `gpt-5-6-luna` (the discovery fan-out, $0.20/$1.20), and `gpt-5-6-terra`
    (registered, priced, `is_enabled: false` — it has no assigned role, and an
    enabled tier-3 entry with no role can win a tiebreak nobody reasoned
    about).
  - `opus` → `claude-opus-5` (bills the same $5.00/$25.00 as 4.8: a newer model
    at no extra cost) and `sonnet` → `claude-sonnet-5` ($2.00/$10.00 against
    4.6's $3.00/$15.00, with the 2026-08-31 lapse recorded as a dated row so
    the calendar boundary needs no future edit).
  - **Fable 5 added** (`claude-fable-5`), which the registry did not contain at
    all. Registered and priced, `is_enabled: false`.
  - `gpt-5-5` corrected from $2.50/$15.00 to **$5.00/$30.00** — understated 2×
    for a different reason than `gpt-5-6`: a real id whose rates were copied
    from `gpt-5.4` at authoring time, so the drift gate passes it.
  - `gemini-3-1-pro` corrected to **$2.00/$12.00 ≤200k, $4.00/$18.00 above**;
    `gemini-pro` gains its previously-unrepresentable **>200k tier**.
  - The identity-only `gemini-3-pro` id corrected to `gemini-3-pro-preview`.
  - `gemini-pro`'s pin to 2.5 Pro was **re-checked and deliberately left**, with
    the reasoning recorded in the entry: 3.1 Pro costs *more*, the only 3.x id
    available is a preview, and the registry's own convention calibrates a new
    model as a generator before trusting it to verify. A proposal, not a switch.

  **Every rate was written by `pricing_proposal --apply` from the providers'
  published pages. None was hand-typed** — 12 changes accepted, 2 rejected, and
  each accepted entry carries `confirmed_on: "2026-08-04"`.

- **(Set 109 S4) A routable model entry that declares no rates now fails config
  load.** Absence of rates stays valid for an identity-only record
  (`is_enabled: false`) and is a defect for a routable one. `resolve_rates`
  reads a missing rate as `0.0` and `worst_case_output_cost_per_1m` returns
  `0.0` — and the selection paths **rank candidates by that scalar**, so a
  rate-less routable entry does not merely under-report: it sorts cheapest and
  wins the verifier tiebreak outright while billing an unknown amount. The
  error names both ways out (add rates, or mark it `is_enabled: false`) and the
  command that fills them in.

  > **Migration — this is the one breaking change in the set.** Consumer repos
  > run their own `router-config.yaml`, and a config that loaded before will
  > now raise `PricingError` at load if any entry is routable
  > (`is_enabled` absent or true) and declares neither the flat scalars nor a
  > `pricing:` list. Note that `is_enabled` **defaults to true when omitted**,
  > so an entry that never set the flag counts as routable. The fix is one of
  > two lines per entry — real rates, or `is_enabled: false` — and
  > `python -m ai_router.pricing_proposal --fetch` proposes the rates from the
  > provider's published page. This repo's own registry needed both kinds of
  > fix during Set 109 S4 and is the worked example.

### Fixed

- **(Set 116 S3) A set-terminal close with no `change-log.md` raised
  instead of closing.** Found by this session's own test suite while
  demoting `change_log_fresh`, and it is the more interesting half of
  that change. `_flip_state_to_closed` required `change-log.md` to be
  **present** before it would judge a session the last one — a
  belt-and-suspenders mirror of the gate. While the gate refused such a
  close, the mirror was unreachable. The moment the gate became a
  warning, a final session without a change log passed the whole gate
  chain, arrived at the writer, was judged mid-set, and wrote
  `status: in-progress` over a `sessions[]` in which every session was
  complete — which the writer's own invariant validator rejects. The
  close raised `SessionStateInvariantError`, so demoting a gate to a
  warning had converted a clean refusal into a crash.

  The redundant condition is removed: `is_last_session` is the
  completion arithmetic (or `forced`), and the gate remains the
  place "the orchestrator wrapped the set up" is checked and reported
  (advisory since the same ruling, so it warns rather than refuses). The
  regression test asserts the resulting **state**, not merely that the
  close succeeded — "succeeded" alone does not catch a writer that
  produced a valid-looking outcome from an invalid snapshot.

- **(Set 116 S2) The verification round cap was bypassed by a second code
  path: the close backstop.** `verify_session` has refused past the bounded
  totals since Set 111 S1, but `close_backstop` resolved a round and routed
  with **no bound at all** — so the cap the workflow documented did not exist
  on the path that runs at every close without stamped evidence. Router
  metrics show the backstop reaching rounds **5–10** (Set 111 S2), **5–12**
  (Set 112 S3) and **5–7** (Set 114 S1): none requiring
  `--operator-authorized-round`, none appearing in `sN-rounds.jsonl`, and none
  visible to the arithmetic meant to be capping them at 2.

  The backstop now evaluates the same bound through the same function
  (`evaluate_phase_bound`) **before any metered call**. Carrying no `--phase`,
  its round is a classic round and consumes the classic budget — one budget,
  not a second allowance. At the cap it refuses deterministically with a new
  `round_bound_reached` outcome and the close **blocks**, naming the two exits
  that already exist rather than inventing a third: `close_session
  --manual-verify` when nothing material is left, or the operator adjudicating
  / authorizing one more round via `verify_session
  --operator-authorized-round`. The check sits **after** the settling-evidence
  skip, so a session that ran a long loop and then verified clean still closes
  normally.

  **Consumer-visible:** a close that previously ground through unbounded
  metered rounds now stops and asks. If a close begins failing with
  `round_bound_reached`, the loop was already past its cap — the resolution is
  an operator decision, not a retry.

- **(Set 116 S2) Backstop rounds are now in the ledger.** Every round the
  backstop runs is appended to `sN-rounds.jsonl` like any other, tagged
  `source: "close_session_backstop"` (the F3 stamp's existing producer
  vocabulary, not a second one), so the ledger is the true round count instead
  of something reconstructed from router metrics after the fact. The ledger is
  declared as mid-close bookkeeping on both the run and the rerun-after-a-
  later-gate-failure path, so it cannot trip `working_tree_clean`
  (the I-084-S2-9 sibling). A backstop round is deliberately **not** a
  step-checklist transition: it is written during the close, so its "post
  after this" window would open after the last moment the orchestrator could
  post into it.

- **(Set 109 S3) The Google, OpenAI, and Anthropic request timeouts could not
  complete a mandatory verification.** `providers.google` and
  `providers.openai` carried `timeout_seconds: 300` while `anthropic` has
  always carried 600. A tier-3 model reasoning at high effort over a large
  evidence bundle exceeds 300s routinely, and the transport gave out before
  the model did. That is not a comfort setting: cross-provider verification is
  mandatory on every Full-tier session, and Set 109 S3 lost two routed
  architecture calls **and two whole verification rounds** to it — three
  attempts × 300s each, paid for, returning nothing but `The read operation
  timed out`. Both raised to 900s.

- **(Set 109 S2) An excluded provider could still receive a real request.**
  `route()` enforced `exclude_providers` on its own model pick and then
  dropped it when dispatching the **secondary** calls it makes on the caller's
  behalf. Traced live, one `route(task_type="architecture",
  exclude_providers=["anthropic"])` issued two HTTPS POSTs — the second to
  `api.anthropic.com` for `claude-opus-4-8`, at 4.9× the cost of the call it
  was verifying. Three sites, one shape:

  - `route()` → `_run_verification` (no `exclude_providers` parameter at all);
  - `_route_via_copilot_cli` → `_run_verification_via_copilot_cli` →
    `pick_copilot_cli_verifier` (the seat profile resolved its *generator*
    against the exclusion and its *verifier* against nothing);
  - `route()` → `_tiebreaker_reroute` (read `settings.tiebreaker_model`,
    default `opus`, with no exclusion check — latent, since no configured
    `on_disagreement` is `re-route`).

  Both verifier selectors already accepted and correctly applied an exclusion;
  nothing was missing from the selection logic. The fixes thread the caller's
  list through, seeding it into the accumulator `_run_verification`'s retry
  path already used, so a *fallback* attempt cannot re-cross it either. An
  excluded tiebreaker degrades into the branch that already existed for "the
  configured tiebreaker is not in the registry" — merge the verifier's
  feedback — rather than gaining a second candidate ladder.

  **Behaviour change:** when the exclusion leaves no eligible verifier,
  `_run_verification` returns `None` and `route()` proceeds unverified (the
  contract it already had for "no eligible verifier"). On the current registry
  a tier-3 generator with `anthropic` excluded has no surviving verifier at
  all, so such calls now come back unverified rather than Anthropic-verified.
  Declining is the safer outcome: the auto-verify pass is a courtesy on an
  ordinary routed call.

  **Verification was never affected.** `verify_session` and the `close_session`
  backstop both route `task_type="session-verification"`, which is not in
  `verification.auto_verify_task_types`, so neither ever entered the leaking
  branch. Two tests now assert this rather than leaving it as a reading of the
  config — including one that fails if `session-verification` is ever added to
  that list.

- **(Set 109 S2) Routing could send work to a model the registry disables.**
  Four sites. Three were short-circuits returning a routing-table entry without
  its `_survives()` check whenever no provider exclusion applied:
  `models.pick_model`'s `task_type_overrides` branch (pinned task types),
  `models.pick_model`'s `tier_assignments` branch four lines below (every
  non-pinned call), and `utils.get_escalation_model`'s next-tier assignment
  (every escalation). Since `_survives` reduces to `is_enabled` when nothing is
  excluded, each did one thing: bypass `is_enabled`. The fourth,
  `_tiebreaker_reroute`, never consulted the flag at all and now takes its
  existing merge fallback when the configured tiebreaker is disabled.

  That contradicts the meaning Set 109 S1 gave the flag — *identity registry
  only*, the record of what an orchestrator **is**, never a destination for
  work — and `claude-opus-5` / `claude-sonnet-5` sit in the registry on those
  terms. The escalation site was the sharpest: the initial pick and the
  escalation must agree about what the registry permits, or escalation becomes
  a way around it.

  The three short-circuits are **removed** rather than guarded: honouring a
  routing table only when the registry says the model is routable is the whole
  rule, and one rule needs one code path. A disabled entry now falls through to
  the surviving-candidates search each site already had. No entry in the
  shipping config is affected today.

- **(Set 109 S1) The Google API key no longer travels in the query string.**
  Both `model_inventory.fetch_google` and `providers._call_google` built a
  `?key=<API_KEY>` URL, and `httpx` renders the full request URL into
  `HTTPStatusError` — which `model_inventory`'s `--refresh` prints to stderr
  and `providers`' retry loop re-raises. A routine 401/429/5xx therefore put a
  live credential into terminal history and CI logs. Both now send
  `x-goog-api-key` as a header (L-069-1: the reported site and its sibling
  fixed in one pass). `model_inventory` additionally redacts the secret value
  and any credential-shaped query parameter out of its failure messages, and
  suppresses the exception cause so a chained traceback cannot leak what the
  message no longer prints.

- **(Set 107 S1) `close_session` no longer exits with a raw traceback when
  stdin has no tty.** The `external-verification.md` soft gate (Set 048 §3.5)
  called `input()` unguarded, so an AI coding agent or a CI runner invoking
  close-out non-interactively got an `EOFError` stack trace with the actual
  remediation buried above it. EOF and keyboard interrupt are now treated as
  the safe "no" answer, which surfaces the existing operator-facing abort
  message — the one that names `--accept-suggestions`. The sibling prompt in
  the same module (`_prompt_manual_attestation`) already guarded both
  exceptions; this closes the class (L-069-1).

  **Delivery note:** this fix reaches users only when `dabbler-ai-router` is
  next published. The Set 107 extension release (`0.47.0`) does **not** carry
  it — its `Dabbler: Try a sample project` command pip-installs the currently
  published router, so a sample created by that VSIX has the old behavior
  until the router is republished. The sample's own instructions therefore
  pass `--accept-suggestions`, which avoids the prompt entirely on both the
  old and the new router.

- **(Set 105) `verify_session` no longer false-positives on lazily-synthesized
  state files.** Any all-sets status scan / Work Explorer refresh calls
  `read_status` → `ensure_session_state_file` for every spec folder lacking a
  `session-state.json` (the Set 7 "every spec folder carries a state file"
  invariant), materializing **untracked** `not-started` state files out of
  band. `verify_session._collect_untracked_contents` previously inlined their
  content as session deliverables, and the cross-provider verifier — correctly
  applying the "blessed writers only, never hand-author `session-state.json`"
  discipline — flagged them as violations. The finding never cleared (observed:
  3 rounds, same finding) because the files re-synth between rounds. The
  collector now classifies `session-state.json` / `session-events.jsonl` /
  `activity-log.json` (new `FRAMEWORK_BOOKKEEPING_FILES` set, matched by
  **basename**, covering own + sibling sets at any depth) into a **third
  partition** — neither inlined nor placed in the "review directly / do not
  assume clean" bucket. `EvidenceBundle` grows an `untracked_bookkeeping` field
  rendered under a new *"Expected framework bookkeeping (blessed-writer /
  lazy-synth output — NOT reviewed work)"* section: the paths stay visible
  (honesty preserved — never a silent exclusion), but the machine-written
  content is not graded. **Deliberately NOT a `DEFAULT_DIFF_EXCLUDES` entry** —
  a blanket pathspec exclude would also drop **tracked** changes to these files
  from the diff, blinding the verifier to legitimate state-machinery work
  (schema/meta sets, committed fixtures). Only the untracked-content inlining is
  reclassified; the tracked diff is untouched. Mirrors Set 089's
  evidence-layer approach. New `TestFrameworkBookkeepingReclassification`
  covers the three buckets against a real-git fixture.


- **(Set 109 S4) `pricing_proposal --fetch` no longer proposes deleting a
  hand-encoded context tier.** This is the Major that Session 3 closed
  **WAIVED** over.

  OpenAI publishes a Short and a Long context rate for every model and states
  the boundary between them nowhere on the page, so `parse_openai` proposes the
  short pair and reports the long pair as an observation advising the operator
  to *"add a `pricing:` row with an explicit `max_input_tokens`"*. An operator
  who took that advice then had an entry saying more than the page does — and
  the next `--fetch` diffed its flat short-context rate against their two-row
  schedule, found them different, and proposed **replacing** it, silently
  deleting the expensive tier and under-reporting every long prompt by the
  margin between them.

  Such an entry is now held in `not_comparable_entries`: both rate sets are
  printed side by side for the operator to compare by eye, no change is
  generated, and `--apply` has nothing it could write. The condition is written
  on the **data** — the entry prices by prompt size and the page states one
  rate with no size boundary — not on the provider name, so a page that stops
  publishing bounds is covered without an edit and there is no per-entry
  "operator-curated" flag anyone can forget to set. Preserving the schedule
  while writing the page's rate into its lowest-bounded row was the richer
  option and was deliberately not taken: it assumes that row corresponds to the
  page's unbounded rate, and a wrong write there is the plausible-wrong-number
  failure the refusal exists to prevent.

- **(Set 109 S4) A purely date-tiered rate is no longer labelled as a size
  tier.** `_render_declaration` printed `(all other prompts)` — the label for
  the unbounded row of a *context-tiered* model — beside every unbounded row,
  including on a model whose rows differ only by date. On the one screen whose
  job is that a human understands a price before accepting it, that invited the
  reader to hunt for a boundary that does not exist. It now says it only when
  some other row in the same period actually claims a size range.

### Disclosed

- **(Set 109 S4) The historical cost record is understated by $51.15 (28.8%),
  and the raw ledger was deliberately not rewritten.** Recomputed row by row
  from each row's own token counts under the confirmed rates: the ledger
  reports **$177.4150** against a true **$228.5689** across 1,237 rows.

  `gpt-5-6` is **99.8% of it** — 254 rows, $51.0383 reported, ~$102.0766 true,
  at a factor of exactly 2.000. `gpt-5-5` (1 row) and `gemini-3-1-pro` (7 rows)
  account for twelve cents between them. **`gemini-pro` cost nothing**: its
  missing >200k tier was a real schema defect, but not one of its 366 rows ever
  exceeded 200,000 input tokens, so it is deliberately absent from the
  disclosure rather than caveating 366 correct rows.

  The figure is a **floor**, not an estimate: OpenAI short-context rates are
  used throughout because a long-context row cannot be identified from the
  ledger. The spec cited a much smaller number — Set 108 S4's single-session
  slice, "$0.5916 reported, ~$1.18 true" — which was correct for that session
  and roughly eighty-five times too small as a characterisation of the problem.

  Full reconciliation, including the reproduction snippet:
  `docs/session-sets/109-model-registry-and-pricing-truth/s4-cost-reconciliation.md`.

### Known residuals (Set 109 S4, named rather than quietly carried)

- `pull_verifier._pricing_for` falls back to `(0.0, 0.0)` for a `model_id`
  absent from the registry — the same fail-open class this session closed in
  the registry, on a cost **cap** rather than a cost report. Not reached today:
  the registry lookup precedes it and covers every id in use. Deferred as
  out-of-plan (the pull verifier is an agentic seam, not a routed model), and
  recorded here so the residual is a decision rather than an oversight.
- `pull_verifier.models`' per-provider pins are a `model_id` surface that
  `model_inventory --check` does not cover. All three pins name ids the
  providers do offer, so there is no live drift.
- `route()` still does not validate a recommended model id against the registry
  before returning it — owed since Session 1 and named in three consecutive
  sessions' `ai-assignment.md`.
- The identity-only `claude-opus-5` and `claude-sonnet-5` entries are redundant
  now that `opus` / `sonnet` carry those `model_id`s. Kept and flagged for
  retirement rather than deleted: removing a registry key is a change a
  consumer repo could be pinned to.
- `--apply` appends rate keys at the end of an entry's mapping, leaving a blank
  line and separating the rates from the fields above them. Cosmetic; the write
  path was left alone rather than re-engineered for field ordering on the one
  file every consumer reads. (The whole-file list re-indentation the same
  round-trip caused **was** treated as a defect and is fixed.)
- **`pull_critique` builds its prompt from `disposition.json`, so running it
  before the disposition is authored critiques the PREVIOUS session's claims.**
  Set 109 S4 hit this: both critics returned VERIFIED against Session 3's
  summary, and one "confirmed" that no registry entry used the `pricing:` key —
  true of S3, false of the tree it was reading. The artifact looks equally valid
  either way. Ordering the disposition before the critique fixes it; nothing in
  `docs/ai-led-session-workflow.md` currently says so.
- **A critic that declines to review still satisfies the path-aware-critique
  artifact validator.** On one run `openai/gpt-5.4` returned a Major reading
  *"unable to complete a grounded review ... conflicting developer
  instructions"* — a non-review — and that is content-non-trivial by the
  validator's rule (a finding with a description), so it counts toward the
  `>= 2 distinct providers` property a `required` set gates on. The multi-provider
  guarantee is therefore shape-checked, not substance-checked. Out of plan for
  this set and recorded rather than fixed.

## [0.34.0] — 2026-07-15 (Set 104 — Copilot CLI large-prompt file handoff)

> **Published 2026-07-15** to PyPI (tag `v0.34.0`, operator-authorized
> 2026-07-15), superseding the live `0.33.0`. Session 2 bumped `pyproject.toml`
> to `0.34.0` and ran the live >32 KiB probe (below): the handoff transport
> works live. The probe ran on Copilot CLI **1.0.69** (the installed seat) while
> `ai_router/copilot-catalog.lock` still pins **1.0.68** — a **pre-existing**
> catalog drift, not introduced here, that only bites the `copilot-cli`
> transport profile (this repo defaults to `api`). Operator decision (Set 104
> S2): **ship 0.34.0 now** — the transport code is proven and version-agnostic
> — and **reconcile the catalog pin as part of Set 103's seat prep**, alongside
> its other unmet preconditions (ADO org, Copilot seat, parallel-jobs grant),
> since a `copilot-cli`-profile `route()` fail-closes on the drift and Set 103
> is what first exercises that path. See the **Known issue** entry below. Once
> `0.34.0` is live on PyPI, **restore Set 103** (`restore_session_set`) per its
> `CANCELLED.md` pause record — this release is that set's resume condition.

### Added

- **(Set 104 S1) Threshold-gated large-prompt file handoff for the
  Copilot CLI transport.** The whole system+user prompt travels as one `-p`
  argv element, and Windows `CreateProcessW` caps the entire command line at
  32,767 UTF-16 code units — so a large dispatch (session-verification
  bundles especially) could not spawn at all, and the failure was
  misclassified as generic. `ai_router/cli_transport.py` now measures the
  **rendered** inline command line in UTF-16 units
  (`subprocess.list2cmdline(argv)`, so quoting expansion and astral chars are
  counted correctly) and, at or above **24,000 units**, switches to a **pull**:
  the composed prompt is written to a per-request UTF-8 (no-BOM) temp file,
  closed before spawn (an open handle blocks the child read on Windows), and a
  short `-p` bootstrap points the agentic CLI at the file in **POSIX
  forward-slash form** with read-completely / execute-don't-summarize
  instructions. The same rule runs on every OS (predictable, and protects
  against the Linux `MAX_ARG_STRLEN` per-arg limit too). Inline stays primary
  and byte-identical below the threshold. Design consult-locked
  (openai:gpt-5-6 + google:gemini-3-1-pro, aligned;
  `docs/session-sets/104-copilot-cli-large-prompt-handoff/authoring-consult-synthesis.md`).
- **(Set 104 S1) Nonce EOF acknowledgement + the `handoff-incomplete` error
  class.** A random per-request 128-bit nonce (`secrets.token_hex(16)`)
  appears **only** in the payload file's transport-control footer — never in
  argv — so echoing it proves the model read to EOF. The transport validates
  the final response line is exactly `HANDOFF-ACK <nonce>`, **strips it** from
  the returned content, and on absence/mismatch classifies
  `ERROR_CLASS_HANDOFF_INCOMPLETE` — **fail-closed and NON-retryable** (the
  call is billed and tools may already have run; the class stays out of
  `RETRYABLE_ERROR_CLASSES`). Honest framing, kept in the code: this is a
  gross under-read detector, **not** proof of comprehension.
- **(Set 104 S1) Additive `transport_metadata` handoff fields:** `handoff`
  (bool, `False` on the inline path), `payload_bytes`, `handoff_ack`
  (`validated` / `missing` / `mismatch`), and `payload_file_modified` (sha256
  of the payload file before spawn vs. after exit — the agent holds write
  tools, so a mutation is **recorded, not gated**). The Set 086 diagnostics
  `-p` redaction posture is unchanged: under handoff the `-p` value is the
  small bootstrap, and the payload never appears in argv or diagnostics.

### Changed

- **(Set 104 S1) Payload-file lifecycle: deleted on every path by default.**
  The per-request temp file is removed in a `finally` covering success, spawn
  failure, both timeout classes, and malformed-output classification — no
  default retention (retention would weaken the transport's `-p` redaction
  posture). Retaining the file and logging its path is permitted **only** when
  the Set 086 diagnostics toggle (`DABBLER_COPILOT_DIAGNOSTICS`) is enabled, as
  an explicit debug affordance.

### Docs

- **(Set 104 S1) The cancel-to-pause recipe** is documented in
  `docs/ai-led-session-workflow.md` (→ *The cancel-to-pause recipe*): the
  framework's answer to the set-blocks-its-own-fix impasse, using the existing
  blessed `cancel_session_set` / `restore_session_set` writers with a
  structured reason, an explicit **no-`paused`-enum** decision record, the
  session-boundary-only guard, and the "paused sets don't count against D6, so
  review the Cancelled bucket at set selection" discipline. Set 103's
  `CANCELLED.md` is the first worked example. A pointer is added from
  `ai_router/docs/close-out.md`.

### Verified

- **(Set 104 S2) Live >32 KiB handoff dispatch works on Windows (Copilot CLI
  1.0.69).** A real 81,829-char composed prompt (rendered inline command line
  81,925 UTF-16 units — far past Windows' 32,767 ceiling, where an inline
  dispatch cannot spawn at all) went through the handoff pull path via
  `CopilotCliTransport.dispatch` with model `claude-sonnet-4.6`: three
  unguessable facts placed at the beginning, the exact middle, and immediately
  before the footer were **all** fused into the single required answer line,
  proving the agentic CLI read the whole 82,231-byte payload file end-to-end;
  the nonce EOF ack validated and was stripped; `handoff: true`,
  `payload_file_modified: false`; 1 premium request. A below-threshold control
  dispatch confirmed the inline path is untouched (`handoff: false`). The
  transport surfaced no defects (the fix loop was a no-op — S1 had already
  baked in the Set 078 S4 wire-shape fixes the live path depends on). Evidence:
  `docs/session-sets/104-copilot-cli-large-prompt-handoff/s2-live-probe.md`.

### Known issue (blocks the copilot-cli profile, deferred to Set-103 seat prep)

- **(Set 104 S2) Catalog version-pin drift.** The probe ran on
  `GitHub Copilot CLI 1.0.69` while `ai_router/copilot-catalog.lock` pins
  `1.0.68` (`cli_version_pin_required = true`, probed 2026-07-04 — a
  pre-existing drift, not introduced by this release). `validate_catalog` is
  fail-closed on this drift and runs during `route()` setup for the
  `copilot-cli` profile, so a real profile dispatch on a 1.0.69 seat raises
  `CLI version drift` before the handoff runs (the S2 probe bypassed the gate
  by calling `CopilotCliTransport` directly, which is why it worked). This does
  **not** affect the default `api` profile or the router-package publish. It
  **does** block Set 103's `copilot-cli`-profile walk. Per the Set 104 S2
  operator decision, the pin is reconciled as part of **Set 103 seat prep** —
  downgrade the seat to 1.0.68 and reprobe, or repin to 1.0.69 via
  `python -m ai_router.copilot_catalog --refresh` and reconfirm — bundled with
  Set 103's other unmet seat preconditions.
  - **Interim workaround applied post-release (2026-07-15, operator-authorized
    during a time-critical staff release):** `ai_router/copilot-catalog.lock`
    `cli_version` was manually bumped `1.0.68 → 1.0.69` to match the seat and
    clear the drift gate so the `copilot-cli` route runs on this machine. This
    is **not** a full re-probe — per-model entries still carry
    `confirmed_on_cli_version = 1.0.68` and only `claude-sonnet-4.6` was
    live-confirmed on 1.0.69 (the S2 probes). The proper
    `copilot_catalog --refresh` reconciliation remains owed as Set 103 seat
    prep (see the lock's `manual_pin_bump_note`). This lock is seat-scoped
    (`op-personal`) and does not govern other seats.

## [0.33.0] — 2026-07-14 (Set 096 — consequence-graded severity + the phased verification loop)

> **Published 2026-07-14** to PyPI (tag `v0.33.0`, operator-authorized 2026-07-14 as a coordinated release
> before the operator's vacation),
> **superseding the live `0.32.0`** (`v0.32.0`, published 2026-07-10; the
> Set-086 Copilot-seat `copilot_preflight` shipped there and remains live).
> Co-released with extension `0.45.0`.


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
    one `Fix verdict: L<n> ...` line per id EVERY cycle, and a missing
    id (or an id-less under-count) escalates an otherwise-clean round
    to blocking instead of warning. A reviewer marks same-point
    occurrences (fan-out siblings, reworded restatements) with
    `Fix verdict: L<m> -- duplicate-of L<n>` — the duplicate's
    disposition follows its target's, and a duplicate chain must
    TERMINATE in a real verdict (cycles, self-references, and dangling
    targets are machine-rejected as missing coverage). A
    prior-acceptance exemption was tried and REMOVED by operator
    decision (removal-over-addition): it structurally forfeited the
    regression check — a later cycle's edit could silently revert an
    accepted fix — while saving the reviewer only a one-line
    restatement per settled id; phased evidence excludes the set's own loop
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
  malformed value. Plus `min_output_tokens: 32000` — the discovery
  output-budget FLOOR: every routed call already runs at its model's
  configured `max_output_tokens` (a provider-limit-bound, operator-owned
  ceiling), so the implementable half of the spec's "raised output
  budget" is loud visibility — `verify_session` warns when a discovery
  call is answered by a model whose configured ceiling sits below the
  floor (a truncated response was already fail-closed invalid evidence).
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

## [0.32.0] — 2026-07-10 (out-of-band verification-loop remediation)

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

## [0.31.0] — folded into 0.32.0, 2026-07-10 (Set 086 — Copilot-seat verification integrity)

> Prepared in Set 086; **not yet published**. The PyPI publish is an
> operator-gated action (tag `v0.31.0`). Until then the registry-live
> router was `0.30.0` at authoring time; this Set-086 work shipped inside `0.32.0` (published 2026-07-10) and remains live. Ships the router half of Set 086 — the
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
