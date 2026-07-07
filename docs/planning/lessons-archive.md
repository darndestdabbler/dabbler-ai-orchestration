# Lessons Archive

> **Purpose:** The preserved, **never-auto-loaded** tier of the guidance
> lifecycle (Set 064). When a lesson in `lessons-learned.md` is archived —
> superseded, encoded into a live test/lint/guard/template, its subsystem
> retired, or unused for the disuse window **and** unreferenced by active
> guidance — its **full text** is moved here, never deleted. Archived
> knowledge stays grep-able on demand (`python -m ai_router.guidance_search
> --archive <regex>`); it is simply not part of the recurring
> tokens-read-per-session tax that the active files pay at every session
> start.
>
> **NOT in the always-load set.** Do **not** read this file at session
> start. The always-load set is `project-guidance.md` +
> `lessons-learned.md` (+ `session-set-authoring-guide.md`). This archive
> is consulted only when searching for prior knowledge.
>
> **Reactivation.** If `python -m ai_router.cite_lessons` is run for an id
> that lives here, the tool updates the entry's `last-used-set` in place
> and prints a `[reconsider]` line so an operator can move the lesson back
> into the active tier. Archival is reversible; nothing here is lost.

---

## Archived Lessons

Archived by Set 073 (promoted-lesson sweep): each lesson below was promoted to
`project-guidance.md` / the authoring guide (its canonical rule), so its active-tier
copy was redundant. Full text preserved here; reactivate with `cite_lessons`.

## ASCII-Only Glyphs In Cross-Platform Terminal Output
<!-- lesson: id="L-064-4" last-used-set="064" status="archived" scope="portable" -->

- **Context:** Any helper that prints status to the terminal.
- **Failure or friction:** Emoji glyphs crash Windows `cp1252` consoles.
- **Lesson:** Use ASCII-only: `[~]` in-progress, `[ ]` not-started, `[x]`
  done. Reserve Unicode for files written with `encoding="utf-8"`.
- **Action for future sessions:** Follow `print_session_set_status()` in
  `ai_router/__init__.py` as the pattern.
- **Promoted to `project-guidance.md` → Conventions → Code Style on
  2026-05-01** after consistent application across five+ CLI surfaces
  (`print_session_set_status`, `print_metrics_report`, `queue_status`,
  `heartbeat_status`, `close_session`).

## Session-State.json Is The Single Source Of Truth For In-Progress Detection
<!-- lesson: id="L-064-5" added-set="007" status="archived" scope="portable" -->

- **Promoted.** This lesson now lives at `project-guidance.md` →
  Conventions → Workflow Expectations: *"Session-state.json is the
  single source of truth for in-progress detection. Call
  `register_session_start()` at Step 1 before the first `log_step()`,
  and `mark_session_complete()` at Step 8."* Set 7
  (`007-uniform-session-state-file`) extended the invariant
  repo-wide: every session-set folder carries a `session-state.json`
  from creation, and readers consult `status` directly via
  `read_status` / `readStatus`. Collapsed to this pointer on
  2026-05-01 to avoid duplicate guidance drifting in two places.

## State The Suite Baseline And Release Contract Up Front In Verification Round 1
<!-- lesson: id="L-064-10" added-set="062" last-used-set="084" status="archived" scope="portable" -->

- **Promoted.** This lesson now lives at `project-guidance.md` →
  Conventions → Workflow Expectations: *"Open every session-verification
  prompt with an up-front conventions block."* Confirmed across Sets 062
  (S5 R1 clean), 063 (S2/S3 narrow R1s), 064, and 065 (S3 R1 focused on
  real consistency defects, not the deliberate proposal-only scope).
  Collapsed to this pointer on 2026-06-15 after the fourth-plus
  confirming context.

## Per-Session-Set E2E/UAT Configuration Is Spec-Declared, Not Inferred
<!-- lesson: id="L-064-11" status="archived" scope="portable" -->

- **Promoted.** The operational rule lives authoritatively in
  `docs/planning/session-set-authoring-guide.md` (Session Set
  Configuration block + the When-UAT-Is-Required and
  When-E2E-Is-Required heuristics) and is reinforced by
  `project-guidance.md` → Conventions → Workflow Expectations:
  *"Obey the spec's Session Set Configuration block at runtime."*
  Collapsed to this pointer on 2026-05-01 to avoid three places
  (authoring guide, project-guidance, lessons-learned) holding
  the same rule.

## A Pure-Python Validator Mirroring A JSON Schema Drifts Looser — Type-Check Optional Fields And Guard Numeric Equivalence
<!-- lesson: id="L-066-1" added-set="066" last-used-set="084" status="archived" scope="portable" -->

- **Promoted to `project-guidance.md` → Conventions → Code Style on 2026-06-16**
  after instrumental application across Sets 066, 069, and 070. The detailed
  failure-mode record is retained below for reference; the durable rule (incl. the
  Set 070 addition that *cross-field/cross-array invariants which JSON Schema CAN
  express must be encoded in the schema too*, and that dogfooding the gate under its
  own policy is what surfaces parity gaps) now lives in the Convention.

- **Context:** Any runtime validator written in plain Python to enforce the
  same contract as a JSON Schema (so the runtime path avoids a `jsonschema`
  dependency), where a fixture is checked against *both* to keep them aligned
  (Set 066 `path-aware-critique.json`).
- **Failure or friction:** The hand-written validator silently accepted values
  strict JSON Schema rejects, because Python's type/equality semantics are
  looser than the schema's. Two gaps the set's own dogfood critique caught:
  (1) **optional fields went unchecked** — the schema typed `critiquedAt` as a
  string, `blastRadius` as an object, finding `severity`/`category` as strings,
  but the Python validator only checked *required* fields, so an integer
  timestamp or a string-typed object passed at runtime and failed schema
  evaluation; (2) **numeric equivalence** — `schemaVersion 1.0` (float) and
  `True` (bool) both pass `version in (1,)` because `1.0 == 1 == True` in
  Python, while the schema's `"type": "integer"` rejects them.
- **Lesson:** A validator that claims parity with a schema must check the
  **optional** fields the schema constrains (not just required ones), and must
  add explicit `isinstance` guards wherever JSON Schema's `"type"` is stricter
  than Python's `in` / `==` — especially `int` vs `bool`/`float`. "All tests
  green" does not prove parity; the failure modes were uncovered, not failing.
- **Action for future sessions:** When a pure-Python validator mirrors a JSON
  Schema, enumerate every schema-constrained field (required AND optional) and
  pin a type check for each; add `isinstance(x, int) and not isinstance(x, bool)`
  for integer fields. Better still, **dogfood the gate by arming the shipping
  set under its own policy** — the self-gating Set 066 dogfood (a multi-provider
  path-aware critique of the set's own changes) caught four real defects the
  per-session routed verification had missed.

## A Bug Is A Bug CLASS — Fix Every Sibling Site, Not Just The Reported One
<!-- lesson: id="L-069-1" added-set="069" last-used-set="084" status="archived" scope="portable" -->

- **Promoted to `project-guidance.md` → Conventions → Code Style on 2026-06-19**
  after application across Sets 068 (origin: the `contract_gate` `UnicodeError` fix),
  069 (a probe-template dogfood reproduced the still-latent `path_aware_critique.py`
  sibling class), and 072 (the four deferred sibling readers + `UnicodeError` folded
  in across both modules). The durable rule — when a fix closes a *class* of defect,
  grep the whole codebase for the pattern and either fix every reachable sibling in
  the same pass or explicitly scope + record the deferred residual; ship a probe that
  drives the public entrypoint where practical — now lives in the Convention.
  Collapsed to this pointer to avoid duplicate guidance and relieve the active-lessons
  ceiling.

## An Iterative Dogfood Keeps Its Own Gate Artifact "Pre-Fix" — Frame It As Evidence, Not A Clean Snapshot
<!-- lesson: id="L-070-1" added-set="070" last-used-set="079" status="archived" scope="portable" -->

- **Promoted to `project-guidance.md` → Conventions → Workflow Expectations on
  2026-06-19** after application across Sets 070 (origin: the path-aware critique
  caught five real defects four single-shot rounds had missed), 071, and 072 (the S4
  path-aware dogfood caught + fixed a real Major in the S3 aggregator, then converged
  on no-new-code). The durable rule — commit the final dogfood round as the gate
  artifact, adjudicate every finding in `disposition.json`, rely on the cross-provider
  session verification (a different surface) for the authoritative `VERIFIED` verdict,
  and converge the dogfood when a round drives no new code change — now lives in the
  Convention. Collapsed to this pointer to avoid duplicate guidance and relieve the
  active-lessons ceiling.


## Dogfood The True Cold Start — A Pre-Seeded Fixture Masks First-Run Defects
<!-- lesson: id="L-079-3" added-set="079" last-used-set="083" status="archived" scope="portable" -->

- **Promoted to `project-guidance.md` → Conventions → Workflow Expectations on
  2026-07-06** after instrumental application across Sets 079 (origin: the
  install-time config-seed defect that survived three sessions of cross-provider
  verification and a path-aware critique, caught only by the operator's
  empty-folder UAT walk), 081 (the `budget.yaml` write-matrix cold-start
  Builds), and 082 (the marker-set cold-start Builds plus the
  Full-over-Lightweight preservation re-Build). The durable rule — any set
  shipping provisioning (scaffold, install, seed, migrate-from-empty) includes
  at least one dogfood/UAT walk starting from the exact cold-start state (fresh
  empty folder, no pre-seeded config), asserting the provisioned artifacts
  afterward and named in the spec's "Ends with" line — now lives in the
  Convention. Collapsed to this pointer to avoid duplicate guidance and relieve
  the active-lessons ceiling.
