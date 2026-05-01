# Set 007 — Uniform `session-state.json` Shape (Change Log)

**Status:** complete · 3 of 3 sessions verified
**Started:** 2026-05-01 · **Completed:** 2026-05-01
**Orchestrator:** claude-code (Anthropic, claude-opus-4-7, high) — all sessions
**Verifiers:** gemini-pro (Sessions 1–2) · gpt-5-4 (Session 3)

This set establishes one invariant: **every session-set folder under
`docs/session-sets/` has a `session-state.json`**, and `status` is the
single field every reader consults. The layered file-presence check
that previously drove "what state is this set in?" is gone; readers
now consult `status` directly with a lazy-synthesis fallback for
folders that slipped through backfill.

The set ships **before Set 8** (cancelled status) so cancel/restore can
rely on "the file always exists" — Set 8's `preCancelStatus` capture
needs the file present for not-started sets too.

## Summary of changes

### Session 1 — Schema + synthesizer + backfill CLI

- **`ai-router/session_state.py`** — added
  `synthesize_not_started_state(session_set_dir)`: idempotently writes
  the not-started shape (`status: "not-started"`, `currentSession:
  null`, `startedAt: null`, `orchestrator: null`,
  `lifecycleState: null`, plus `totalSessions` parsed from the spec's
  Session Set Configuration block). Added
  `backfill_session_state_files(base_dir)` which walks the tree,
  classifies folders by file presence (`change-log.md` → complete;
  `activity-log.json` → in-progress; neither → not-started), and
  synthesizes the file for any folder that doesn't have one.
  Pre-existing `session-state.json` files are left untouched.
- **`ai-router/backfill_session_state.py`** — new CLI module
  (`python -m ai_router.backfill_session_state`) with `--base-dir`
  and `--dry-run` flags. Prints the count synthesized and the list
  of paths.
- **Backfill run on this repo** committed `session-state.json` for
  every existing set (001–006, 008).

### Session 2 — Reader collapses

- **`ai-router/session_state.py`** — added `read_status` (Python) and
  the shared `_load_canonical_status` private loader that JSON-loads,
  validates dict + string-status shape, and canonicalizes aliases
  (`"completed"` → `"complete"`, `"done"` → `"complete"`) at the read
  boundary. Lazy-synth fallback now routes through
  `ensure_session_state_file` so a legacy folder that slipped through
  Set 7 Session 1's backfill is classified by current file presence
  rather than being regressed to `"not-started"`.
- **`tools/dabbler-ai-orchestration/src/utils/sessionState.ts`** —
  parallel `readStatus` (TypeScript) plus `loadCanonicalStatus`,
  `notStartedPayload`, `backfillPayload`, and
  `ensureSessionStateFile`. Mirrors the Python contract exactly,
  including the alias canonicalization and the legacy-folder
  inference path.
- **Reader collapses (Python):**
  - `print_session_set_status` (in `ai-router/__init__.py`) — now
    reads `status` directly via `read_status`.
  - `find_active_session_set` (in `ai-router/session_log.py`) —
    same.
- **Reader collapses (TypeScript):** `readSessionSets` in
  `tools/dabbler-ai-orchestration/src/utils/fileSystem.ts` — now
  groups sets by `status` rather than by file presence.
- **Intentional non-collapses** (documented inline in the affected
  files):
  - `current_lifecycle_state` (`ai-router/session_events.py`) —
    operates on the events ledger, which is the authoritative source
    for lifecycle derivation. A coarse `read_status` pre-filter would
    duplicate the events check or mask drift the function exists to
    surface.
  - Close-out gate idempotency check (`_is_already_closed` in
    `ai-router/close_session.py`) — same rationale: events-ledger
    driven by design.
  - Reconciler stranded-session sweep — same rationale.
- **Tests added:** `ai-router/tests/test_read_status.py` covers the
  read-side validation, alias canonicalization, lazy-synth via
  backfill inference (legacy change-log → complete; legacy
  activity-log → in-progress), and the genuine not-started path.
  Extension parity tests added to `fileSystem.test.ts` for the same
  fixtures.
- **Verifier rounds:** Session 2 took three verifier rounds. Round 1
  surfaced a `read_status` validation hole (lazy-synth re-read path
  not reusing the file-present validator) plus missing reader tests.
  Round 2 surfaced the lazy-synth misclassifying legacy folders as
  not-started. Round 3 verified clean with one optional docstring-
  staleness nit acknowledged.

### Session 3 — Bootstrap, docs, cross-provider review

- **`tools/dabbler-ai-orchestration/src/wizard/sessionGenPrompt.ts`**
  — extended the prompt template that the extension's "Generate
  Session-Set Prompt" command copies to the clipboard. The prompt
  now instructs the AI scaffolding new session-set folders to
  create `session-state.json` with `status: "not-started"`
  alongside `spec.md`, and embeds the full not-started shape so
  there is no ambiguity. The lazy-synthesis fallback is mentioned
  as a robustness measure, not as a license to skip.
- **`docs/ai-led-session-workflow.md`** — new "Session-Set Lifecycle
  and State File" subsection under Key Concepts. Documents the
  canonical `status` values (`not-started`, `in-progress`,
  `complete`, `cancelled`-reserved-for-Set-8), the `lifecycleState`
  enum's complementary role, the three writers that converge on the
  file invariant (extension prompt template,
  `register_session_start`, the backfill CLI), and the
  lazy-synthesis fallback contract.
- **`docs/session-state-schema-example.md`** — added a Lifecycle
  shapes section documenting the **not-started** and **in-progress**
  shapes inline (the closed shape remains the generated
  `session-state-schema-example.json`). Each shape has a
  fully-specified JSON example and a one-paragraph note on what
  populates each field and when.
- **`tools/dabbler-ai-orchestration/README.md`** — replaced the
  file-presence state-detection table (which described the inference
  pattern Set 7 just collapsed) with a status-driven table. Added a
  paragraph on the legacy-folder fallback and a pointer to
  `python -m ai_router.backfill_session_state` for consumer-repo
  pulls.
- **Cross-provider verification:** GPT-5.4 (cross-provider, OpenAI vs
  Anthropic orchestrator). Two findings — both meta — were surfaced
  to the human and adjudicated as `accept-dismissal` via
  `record_adjudication`:
  - F1: verifier flagged that `session-003.md` was missing from the
    bundle. Self-referential — the bundle is the work-under-review,
    and the verifier itself produces `session-003.md`. Workflow-
    ordering misread, not a real defect.
  - F2: verifier flagged that the extension-host integration suite
    didn't pass. Pre-existing environment breakage — the bundled
    `vscode-test` Code.exe rejects all launcher flags; the failure
    pattern is identical against an unmodified tree. Logged for a
    separate cleanup follow-up.

## Build & test status (Session 3)

- `python ai-router/dump_session_state_schema.py --check` — exit 0
  (schema file unchanged this session; only the documentation
  describing it was extended).
- `pytest` (repo root, `pytest.ini` testpaths) — 647 passed.
- `npx tsc --noEmit -p tools/dabbler-ai-orchestration` — clean.
- `npx vsce package` (in `tools/dabbler-ai-orchestration`) —
  produces `dabbler-ai-orchestration-0.11.0.vsix` (17 files,
  296.19 KB).
- Extension-host integration tests (`npm test`) — did not launch.
  Pre-existing infra issue (vscode-test Code.exe rejects all
  launcher flags); unrelated to this set's edits.

## Acceptance criteria — final checklist

- [x] Every folder under `docs/session-sets/` with a `spec.md` has a
      `session-state.json` after backfill (Session 1 deliverable;
      verified Sessions 2 and 3).
- [x] `status` is the single field every reader consults; no reader
      branches on file presence as the primary signal (lazy-synth
      fallback is a robustness measure, not the primary path).
      Reconciler / close-out gate idempotency / `current_lifecycle_state`
      remain events-ledger driven by deliberate design.
- [x] New session-set folders created via the extension's
      "Generate Session-Set Prompt" flow include the file from the
      start (the prompt template now embeds the full not-started
      shape and the AI is instructed to write it).
- [x] `register_session_start` keeps working unchanged for active
      sessions (only the file's pre-existence is new).
- [x] No reader regresses: every state-reading test still passes.
      647-test pytest run; tsc clean; vsce package builds.
- [x] Workflow doc explicitly tells human authors and AI agents to
      create the file when scaffolding by hand.
- [x] Cross-provider review filed (GPT-5.4 review at
      `session-reviews/session-003.md`; both findings adjudicated and
      logged via `record_adjudication`).

## Known divergences

- **No `ai-assignment.md` was authored for this set.** Step 3.5 /
  Rule #17 of the workflow doc require the orchestrator to author
  `ai-assignment.md` (and per-session next-orchestrator
  recommendations) via routed `analysis` calls. The user has issued
  a standing cost-containment directive restricting ai-router usage
  to end-of-session verification only. The orchestrator obeyed the
  user directive over the workflow doc; flagged here so the
  divergence is auditable.
