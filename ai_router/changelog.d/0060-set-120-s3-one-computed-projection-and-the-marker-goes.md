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

