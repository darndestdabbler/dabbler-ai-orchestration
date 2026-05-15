# Router-config editor spec (for Set 026 implementation)

> **Purpose:** This set is **doc-only**. It produces the
> implementation spec, schema example, and wireframes that
> Set 026 will execute against. No code in this set.
>
> **Session Set:** `docs/session-sets/025-router-config-editor-spec/`
> **Created:** 2026-05-15
> **Workflow:** Full
> **Prerequisite:** Cross-provider design audit at
> `docs/proposals/2026-05-15-router-config-editor-design-audit/`
> with synthesis at that folder's `audit-summary.md`.

---

## Session Set Configuration

```yaml
totalSessions: 1
requiresUAT: false
requiresE2E: false
uatStyle: ad-hoc
uatScope: none
effort: normal
```

> Rationale: single-session doc-authoring set. No new code, no UAT,
> no E2E. The design has already been locked across three frontier
> models; this session's job is to capture the locked decisions in
> a form Set 026 can build to.

---

## Decisions locked from the audit (do not re-litigate)

The cross-provider audit at
`docs/proposals/2026-05-15-router-config-editor-design-audit/`
produced eight gating decisions. All eight are locked. The
audit's raw verdicts (`gpt-5-4-result.json` and
`gemini-pro-result.json`) and synthesis (`audit-summary.md`) are
the canonical record.

| # | Decision | Locked value |
|---|---|---|
| G1 | `outsourceMode` cleanup scope | **Clean-sweep.** Delete the flag, ~10 Python modules, the workflow doc, and the step-6/step-8 mode-aware branches. Operator confirmed three Marketplace downloads (all suspected to be theirs) — no external users to grandfather. |
| G2 | Provider schema | **Extend the existing `providers:` block** at `router-config.yaml:24–57`. Add `display_label` and `enabled`. The existing `api_key_env` and `base_url` fields already match the audit's "api_key_env_var" / "api_base_url" recommendation — no rename needed. Each `models:` entry already references its provider via `provider: <key>`; no `provider_id` migration is required. (The audit reviewers worked from incomplete info; the existing schema is closer to GPT's recommendation than the audit summary captured.) |
| G3 | "Significance" flagging | **Operator-invoked only.** Two surfaces: (a) a VS Code command `Dabbler: Flag Decision for Cross-Provider Review`; (b) a recognized code-annotation pattern `# @dabbler:outsource-review("reason")` that the orchestrator picks up during session work. No silent heuristic. |
| G4 | Verification UX | **Two decoupled dropdowns.** Routing: `Whenever helpful` / `Verification only` / `Disabled`. Verification method: `Automatic via API` / `Manual via portable markdown` / `None`. The API option is greyed out when routing = Disabled. Surfaces `budget.yaml`'s existing `verification_method` field. |
| G5 | Shared-vs-local config | **`.gitignore`-d `ai_router/local-overrides.yaml`** for operator-machine-local fields (notification env-var names, Pushover keys, optional API-key env-var overrides). Webview clearly labels which fields are shared-canonical vs. local-overridden. |
| G6 | secretStorage | **Resolver abstraction in v1, secretStorage backend later.** Every key lookup goes through a `resolve_secret(name, source)` indirection. Env-var is the only backend Set 026 ships; secretStorage / keyring backends added in a future set on demand. |
| G7 | Budget scope default | **Per session-set** (matches the operator's `feedback_budget_question_scope` memory). Per-project is the second option. **Per-session is removed from the user-facing UI entirely** — schema-validator accepts it for hand-edited YAML but the webview dropdown only offers `per-session-set` (default) and `per-project`. |
| G8 | Sequencing | **Two session-sets.** Set 025 (this one) is doc-only. Set 026 is the implementation. |

---

## Set 026 implementation plan

Set 026 — **`router-config-editor-implementation`** — runs against
this spec once the operator starts it. Proposed session breakdown
(Set 026's own spec.md will refine these; this is the scaffolding
shape):

### Session 1: `outsourceMode` clean-sweep

**Goal:** Remove the queue-mediated daemon (`outsourceMode: last`)
infrastructure end-to-end. No new code.

**Deletes:**

- Python: `ai_router/queue_status.py`, `ai_router/heartbeat_status.py`,
  `ai_router/queue_db.py`, `ai_router/queue_verification.py`,
  `ai_router/daemon_pid.py`, `ai_router/orchestrator_role.py`,
  `ai_router/restart_role.py`, `ai_router/role_status.py`,
  `ai_router/capacity.py` (≈9 modules — verify with `grep -l outsource_mode\|queue_db\|daemon` after deletion).
- Docs: `ai_router/docs/two-cli-workflow.md`.
- Workflow doc: every reference to `outsourceMode: last`,
  `subscription CLI`, `verifier daemon`, queue-related step-6/step-8
  branches, the `outsource-last` row in the budget-tier table.
- Close-out doc: every mode-aware branch in `close_session`
  invocation flow and gate descriptions.
- Spec authoring guide: the `outsourceMode:` config-block row.
- Existing session-set spec.md files: scrub the `outsourceMode:`
  line. (Use `git grep outsourceMode docs/session-sets` to find
  them all.)

**Edits:**

- `ai_router/close_session.py`, `start_session.py`: remove
  `outsource_mode` parameter / case branches; collapse to the
  outsource-first path.
- `ai_router/gate_checks.py`: drop queue-related gate predicates.
- `ai_router/router-config.yaml`: drop the `queue_db_path` and any
  daemon-related config rows.
- CHANGELOG: reversal note acknowledging v0.13.14's "the CLIs stay"
  promise; explain operator decision (zero observed external usage
  per Marketplace download metrics).

**Test surface:** strictly shrinks. No new tests.

**Release:** extension `v0.13.15` (or whatever Set 026 lands on)
ships the operator-facing cleanup; ai_router package gets a minor
version bump (e.g., `0.3.0`) since this is a breaking change for
any hypothetical outsource-last user.

---

### Session 2: Extend `providers:` schema + `budget.yaml` migration + resolver abstraction

**Goal:** Bring the YAML schema into the shape the webview needs.
No webview yet; pure Python-side schema + reader changes.

**Schema changes** (see `schema-examples.md` for the full
before/after):

- `router-config.yaml` `providers:` block gains two new optional
  fields: `display_label` (default: title-cased provider key) and
  `enabled` (default: `true`). Existing `api_key_env` and `base_url`
  fields stay as-is; no renames.
- `models:` block is **unchanged at the schema level**. Each entry's
  existing `provider:` field already references the `providers:`
  block by key. Set 026 adds validation that the referenced key
  exists at write time.
- `budget.yaml` gains `warn_at_percent: <NUMBER>` (default 80) and
  renames `threshold_scope` → `scope` with expanded values
  (`per-session-set` / `per-project` / `per-session`). Legacy
  `threshold_scope` still loads with a deprecation warning.
- New file `ai_router/local-overrides.yaml`: `.gitignore`-d.
  Schema is a strict optional subset of `router-config.yaml` +
  `budget.yaml` + a `notifications:` block + a `decision_review:`
  block. See `schema-examples.md` File 3 for the full shape.

**Resolver abstraction** (G6): introduce
`ai_router/secret_resolver.py` exporting `resolve_secret(name:
str, source: str = "env") -> str | None`. Env-var backend is the
only implementation in this session. Future backends
(`secretStorage`, `keyring`) plug in via a registry.

**Reader updates:**

- `ai_router/config.py`: parse new optional fields with
  default-tolerant handling (older files load cleanly; readers
  inject defaults for missing `display_label` / `enabled`).
- `ai_router/providers.py`: existing `api_key_env` read path is
  unchanged.
- Migration script `ai_router/migrate_router_config.py`: idempotent
  forward migration that injects `display_label` + `enabled` into
  existing `providers:` entries, renames `budget.yaml`'s
  `threshold_scope` → `scope` (with value translation), and injects
  `warn_at_percent: 80` if absent. Re-running on a freshly-migrated
  file is a no-op.

**Test surface grows:**
`test_secret_resolver_env_backend.py`,
`test_config_reads_new_providers_fields.py`,
`test_migrate_router_config_idempotent.py`,
`test_budget_yaml_scope_rename.py`,
`test_local_overrides_merge.py`.

---

### Session 3: Webview implementation (extension side)

**Goal:** Ship the custom-webview config editor that reads + writes
the YAML files. This is the bulk of the user-facing work.

**Deliverables:**

- `tools/dabbler-ai-orchestration/src/configEditor/ConfigEditorPanel.ts`
  — webview panel registration + HTML/CSS/JS scaffolding.
- `tools/dabbler-ai-orchestration/src/configEditor/yamlReadWrite.ts`
  — round-trip-safe YAML reader/writer (preserves comments and
  formatting; uses `yaml` npm package's AST mode, not the default
  parse-and-restringify).
- `tools/dabbler-ai-orchestration/src/configEditor/schemaValidator.ts`
  — JSON-schema validator that runs on every load + every write.
  Surfaces errors in the webview UI; refuses to write invalid YAML.
- `tools/dabbler-ai-orchestration/src/configEditor/sections/` —
  one file per webview section. **Six files total**, matching the
  six wireframed sections:
  `routingAndVerificationSection.ts`,
  `budgetSection.ts`,
  `providersTableSection.ts`,
  `significanceFlaggingSection.ts`,
  `notificationsSection.ts`,
  `localOverridesSummarySection.ts`.
- New command `dabbler.openConfigEditor` registered in
  `package.json` (title: "Open Dabbler Config Editor").

**Deferred to Session 5** (do not implement in Session 3):

- Wizard integration (the project-setup wizard's "Configure AI
  Router" step routing into the config editor).
- The "Send a test notification now" button in Section 5
  Notifications — backend wiring + Pushover-API call.

**Layout** (per `wireframes.md`):

- **Section 1: Routing & Verification.** Two decoupled dropdowns
  (G4). Heads-up text describing the constraint
  ("API verification disabled when routing is Disabled").
- **Section 2: Budget.** Scope dropdown (G7), threshold input,
  `warn_at_percent` slider, three-state preview of the
  optimally-intrusive UX.
- **Section 3: Providers table.** Variable-length table with
  add/remove/edit-row controls. Each row corresponds to one entry
  in `router-config.yaml`'s `providers:` block. Columns:
  `enabled` (checkbox), `display_label`, provider ID (read-only
  after creation), `api_key_env` (env var name), and a "..."
  button that opens a per-row popover for the less-common fields
  (`base_url`, `rate_limit`, `timeout_seconds`, `retry`). Per row,
  show "env var is set" / "env var is not set" badge
  (read at panel open + on demand).
- **Section 4: Significance flagging.** Read-only documentation
  of the `Dabbler: Flag Decision for Cross-Provider Review`
  command + `# @dabbler:outsource-review("reason")` annotation
  syntax. Toggle for "honor annotations in the current session
  set" (default on).
- **Section 5: Notifications.** Pushover enabled toggle +
  env-var-name inputs (Pushover API Key env var, Pushover User
  Key env var). All Section-5 fields live in
  `local-overrides.yaml`.
- **Section 6: Local overrides.** Read-only summary of which
  fields are currently overridden in `local-overrides.yaml` vs.
  inherited from `router-config.yaml` / `budget.yaml`. Links to
  open the override file directly.

**Test surface:**
`yamlReadWrite.test.ts` (comment preservation, multi-line strings,
unicode), `schemaValidator.test.ts` (every validation rule),
`configEditor-rendering.test.ts` (webview-host tests via Electron).

---

### Session 4: Significance-flagging command + annotation handling

**Goal:** Ship the explicit operator-invoked significance-flag
surfaces (G3).

**Deliverables:**

- `tools/dabbler-ai-orchestration/src/commands/flagDecisionForReview.ts`
  — registers `dabbler.flagDecisionForReview`. When invoked: prompts
  the operator for a reason (single-line input), appends a structured
  entry to `docs/session-sets/<active-slug>/decision-review-queue.jsonl`
  (one JSON line per flag), surfaces an info notification, returns.
- `ai_router/decision_review_queue.py` — Python reader for the queue
  file. Loaded by the orchestrator at session start; flagged items
  are surfaced in the orchestrator's initial planning checklist.
- Annotation parser: when the orchestrator opens a file during
  session work, comments matching
  `# @dabbler:outsource-review\("(.+?)"\)`
  are detected. Each match is appended to the queue with the
  containing file/line as context.
- Workflow doc updates: a new "Significance flagging" section in
  `docs/ai-led-session-workflow.md` documenting both surfaces.
- Setting in `local-overrides.yaml`: `decision_review.honor_annotations:
  <BOOL>` (default true; operator can disable annotation scanning).

**Test surface:**
`flagDecisionForReview.test.ts` (queue file append + idempotency),
`test_decision_review_queue_reader.py`,
`test_annotation_parser_extracts_correctly.py`.

---

### Session 5: Wizard integration + test-notification + end-to-end + release

**Goal:** Wire everything together; release as a single
operator-facing version.

**Deliverables:**

- **Wizard integration:** the project-setup wizard's "Configure
  AI Router" step opens the config editor instead of (or in
  addition to) writing `router-config.yaml` programmatically.
- **Test-notification button wiring:** Section 5 Notifications'
  "Send a test notification now" button fires a single Pushover
  message via the configured env vars; surfaces the API response
  inline.
- Update adoption-bootstrap doc to point new operators at the
  config editor (`Dabbler: Open Config Editor`) as the canonical
  setup surface, with the wizard as a backup.
- Update `quick-start.md` with a section on the config editor.
- End-to-end smoke test: open the editor, edit each section,
  verify YAML files round-trip correctly, verify Python reader
  picks up new values without restart.
- CHANGELOG entry covering the whole set (extension version bump +
  ai_router version bump).
- Marketplace + Open VSX release via existing tag-driven workflow.

---

## Risks (and the audit-derived mitigations)

- **Webview is the extension's largest UI surface to date.** Mitigation:
  yaml `read+validate+write` round-trip with schema validation is the
  most-tested piece (both audit reviewers flagged this as
  non-negotiable).
- **YAML migration breaks an existing operator's `router-config.yaml`.**
  Mitigation: forward migration is idempotent (Session 2); old shape
  still loads with deprecation warnings; old hardcoded env-var names
  still resolve at the resolver layer.
- **Multi-orchestrator concurrency on the YAML files.** Mitigation:
  Gemini called this YAGNI ("single-user editor"); GPT recommended
  last-write detection. Set 026 ships **last-write detection**
  (mtime check + content hash on write; warn before overwrite); no
  file locking.
- **`secretStorage` operator demand materializes mid-implementation.**
  Mitigation: resolver abstraction (G6) means adding the backend is
  a small follow-up set, not a refactor of every key-reading site.
- **Reversing v0.13.14's "the CLIs stay" promise.** Mitigation:
  CHANGELOG explains the operator decision and cites the Marketplace
  download count. Operators upgrading from v0.13.14 → v0.13.15 see
  the migration note.

---

## Sessions (this set, 025)

### Session 1 of 1: Author the implementation spec, schema example, and wireframes

**Goal:** Produce the three doc deliverables for Set 026 to build
against. All locked decisions captured; no new design work — this
is synthesis of the audit verdicts into operationalizable form.

**Steps:**

1. Author `docs/session-sets/025-router-config-editor-spec/spec.md`
   (this file).
2. Author `docs/session-sets/025-router-config-editor-spec/schema-examples.md`
   showing current vs. proposed `router-config.yaml` /
   `budget.yaml` / new `local-overrides.yaml` side-by-side.
3. Author `docs/session-sets/025-router-config-editor-spec/wireframes.md`
   with ASCII layouts for every webview section described in
   "Session 3: Webview implementation."
4. Cross-provider verification (single route call,
   `task_type='session-verification'`) of the three docs together
   — looking for: gating-decision capture accuracy, schema sanity,
   wireframe consistency with the dropdown semantics, anything
   missing.
5. Apply any non-blocking refinements the verifier raises.
6. Close out.

**Creates:**

- `docs/session-sets/025-router-config-editor-spec/spec.md` (this file)
- `docs/session-sets/025-router-config-editor-spec/schema-examples.md`
- `docs/session-sets/025-router-config-editor-spec/wireframes.md`
- `docs/session-sets/025-router-config-editor-spec/session-reviews/session-001/`
  (verification artifacts)
- `docs/session-sets/025-router-config-editor-spec/activity-log.json`
- `docs/session-sets/025-router-config-editor-spec/disposition.json`
- `docs/session-sets/025-router-config-editor-spec/ai-assignment.md`
- `docs/session-sets/025-router-config-editor-spec/change-log.md`

**Touches:** none outside the session set folder.

**Ends with:** Set 025 closes complete; Set 026 has a spec to build
against; operator can spin up Set 026's Session 1 (the
outsourceMode clean-sweep) in a fresh conversation when ready.

**Progress keys:** `session-001/spec`, `session-001/schema-examples`,
`session-001/wireframes`, `session-001/verification`,
`session-001/close-out`.

**Release:** None. Doc-only set.

---

## Appendix B: Canonical control-to-YAML mapping (normative)

This is the single source of truth for every webview control's
persistence target. When `schema-examples.md`, `wireframes.md`, or
Set 026's implementation conflicts with this table, **this table
wins**. Edit this table first; the other docs follow.

| Webview control | File | YAML path | Type / enum | Local-override allowed? | Notes |
|---|---|---|---|---|---|
| **§1 Routing dropdown** | `router-config.yaml` | `routing.outsourcing_mode` | `"whenever-helpful" \| "verification-only" \| "disabled"` | Yes (override in `local-overrides.yaml`) | New top-level `routing.outsourcing_mode` field added by Session 2 migration; default = `"whenever-helpful"` |
| **§1 Verification dropdown** | `budget.yaml` | `verification_method` | `"api" \| "manual-via-other-engine" \| "skipped"` | No (project-canonical) | Field already exists; webview just surfaces it |
| **§2 Budget threshold** | `budget.yaml` | `threshold_usd` | number ≥ 0 | Yes (per-operator personal cap) | Existing field |
| **§2 Budget scope** | `budget.yaml` | `scope` | `"per-session-set" \| "per-project"` | No | Webview offers only these two; `"per-session"` accepted by validator for hand-edits but not in UI |
| **§2 Warn-at-percent** | `budget.yaml` | `warn_at_percent` | integer in [0, 100] | Yes (per-operator) | New field, default 80 |
| **§3 Provider enabled** | `router-config.yaml` | `providers.<id>.enabled` | boolean | Yes (disable on local machine only) | New field, default true |
| **§3 Provider display label** | `router-config.yaml` | `providers.<id>.display_label` | string | No | New field, default = title-cased id |
| **§3 Provider env var name** | `router-config.yaml` | `providers.<id>.api_key_env` | string (env-var name shape) | Yes (point at different env var) | Existing field |
| **§3 Provider API URL** | `router-config.yaml` | `providers.<id>.base_url` | URL string | Yes (personal proxy) | Existing field |
| **§4 Honor annotations toggle** | `local-overrides.yaml` | `decision_review.honor_annotations` | boolean | Yes (local-only by design) | Default true |
| **§5 Pushover enabled** | `local-overrides.yaml` | `notifications.pushover.enabled` | boolean | Yes (local-only by design) | Default false |
| **§5 Pushover API key env** | `local-overrides.yaml` | `notifications.pushover.api_key_env` | string | Yes (local-only by design) | Default `"PUSHOVER_API_KEY"` |
| **§5 Pushover user key env** | `local-overrides.yaml` | `notifications.pushover.user_key_env` | string | Yes (local-only by design) | Default `"PUSHOVER_USER_KEY"` |

### Verification dropdown — explicit enum mapping

UI label → YAML value:

- `"Automatic via API"` → `verification_method: api`
- `"Manual via portable markdown"` → `verification_method: manual-via-other-engine`
- `"None"` → `verification_method: skipped`

### Local-override precedence rules

1. **Precedence:** `local-overrides.yaml` > shared YAML (`router-config.yaml` / `budget.yaml`) > schema default.

2. **Override path allowlist.** Only the paths marked
   "Local-override allowed? Yes" in the table above accept an
   override. Hand-editing an override for a path marked "No" is a
   **validation error** at load time; the reader rejects the
   override and uses the shared value.

3. **Local-only sections** (`notifications.*`, `decision_review.*`)
   have no shared analog and live exclusively in
   `local-overrides.yaml`. Absent → falls back to the schema
   default.

4. **Providers and models existing only in `local-overrides.yaml`.**
   An entry in `providers.<id>` or `models.<id>` that has no
   corresponding entry in the shared YAML is a **validation
   error**, not an implicit add. Local overrides modify shared
   entries; they do not create new entries.

5. **Unknown keys in `local-overrides.yaml`.** Warn-and-ignore.
   The webview's "Local overrides summary" section lists unknown
   keys so the operator can decide whether to remove or migrate
   them.

### `threshold_scope` → `scope` migration rule

The migration script (Session 2) treats the legacy field as
follows:

- `threshold_scope: project-lifetime` → `scope: per-project` (clean rename; no period semantics).
- `threshold_scope: monthly` → keep as `scope: per-project, period: monthly`; emit a one-line deprecation warning that period-based reset is not yet implemented (it will land in a future set). Reader proceeds with cumulative tracking; the `period:` field is preserved on disk so a future migration can wire it without data loss.
- If both `threshold_scope` and `scope` are present: `scope` wins; warn that `threshold_scope` should be removed.
- If `scope` has an unrecognized value: reject with a clear message naming the valid set.

### Write atomicity (clarified)

The webview performs **per-file atomic writes** (tmp file +
rename) **after pre-validating the full batch in memory**. This
gives:

- Each individual file write is atomic on the filesystem.
- A validation error blocks ALL writes (no partial-batch state).
- A filesystem failure mid-batch can leave one file written and
  another not. The webview detects this on retry (mtime mismatch
  on the un-written file) and offers a best-effort recovery
  dialog. **True cross-file atomicity is not provided** —
  operators editing the config files concurrently with the
  webview need to coordinate manually.

### Validation timing

Schema validation runs at **both** load and save:

- **On load** (panel open): the webview parses each YAML, runs
  the validator, and surfaces drift / unknown keys / parse errors
  before letting the operator edit. A failed-validation file
  opens in a read-only "drift detected" state with a side panel
  showing the validator's complaints.
- **On save** (operator hits Save): the validator runs on the
  proposed batch in memory. Any error aborts the save with
  inline field highlights; no file is touched.

---

## Success criteria

After Set 025 closes:

1. `spec.md`, `schema-examples.md`, `wireframes.md` are in place and
   internally consistent.
2. All eight gating decisions from the audit are explicitly captured.
3. Set 026's session-1-through-5 shape is sketched concretely enough
   that Set 026's own spec authoring is mostly mechanical filling-in.
4. The cross-provider verifier's verdict is captured in
   `session-reviews/session-001/`.
5. Sets 023, 024, 025 form a coherent narrative: 023 (writer/reader
   alignment) → 024 (UI surface cleanup) → 025 (next-feature spec
   informed by what 024 surfaced about underused infrastructure).
