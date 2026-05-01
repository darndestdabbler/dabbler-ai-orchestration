# `session-state.json` schema example

The committed example at
[`session-state-schema-example.json`](./session-state-schema-example.json)
is the canonical reference for the `session-state.json` schema written by
each session set under `docs/session-sets/<slug>/`.

The file is **generated**, not hand-edited. The source of truth is the
schema in [`ai-router/session_state.py`](../ai-router/session_state.py); the
generator at
[`ai-router/dump_session_state_schema.py`](../ai-router/dump_session_state_schema.py)
emits a fully-populated v2 example by reading the live schema constants
(`SCHEMA_VERSION`, `SessionLifecycleState`).

This indirection is deliberate. A static, hand-edited example drifts
silently every time a field is added, renamed, or has its semantics
changed. A generated example fails a CI / pre-commit drift check
loudly the moment the schema and the documented example disagree.

## Lifecycle shapes

A `session-state.json` cycles through three shapes during a set's
lifetime. The committed example in
`session-state-schema-example.json` is the **closed** shape. The
other two — **not-started** (written when the folder is first
scaffolded) and **in-progress** (written by `register_session_start`
at Step 1 of each session) — are documented inline below because they
are the entry points consumers and hand-authors most often need to
reproduce.

### Not-started

Written when a session-set folder is first scaffolded — by the
extension's "Generate Session-Set Prompt" template (which instructs
the AI to create the file alongside `spec.md`), by the
`backfill_session_state_files` walker, or by the lazy-synthesis
fallback in `read_status` / `readStatus` for any folder that slipped
through. `currentSession`, `startedAt`, `lifecycleState`, and
`orchestrator` are all `null`; `totalSessions` is parsed from the
spec's `Session Set Configuration` block when available.

```json
{
  "schemaVersion": 2,
  "sessionSetName": "<slug>",
  "currentSession": null,
  "totalSessions": 4,
  "status": "not-started",
  "lifecycleState": null,
  "startedAt": null,
  "completedAt": null,
  "verificationVerdict": null,
  "orchestrator": null
}
```

### In-progress

Written by `register_session_start()` at Step 1 of each session.
`currentSession` is the 1-based index of the session being run,
`status` flips to `in-progress`, `lifecycleState` is
`work_in_progress`, `startedAt` is populated with an ISO 8601
timestamp, and `orchestrator` carries the engine/provider/model/effort
of the driver. `completedAt`, `verificationVerdict`, and
`nextOrchestrator` (when applicable) remain `null` until close-out.

The closed shape — populated by `mark_session_complete()` at Step 8 —
is the form rendered in `session-state-schema-example.json`.

## Regenerating

```bash
# Overwrite the committed reference with a fresh emit
python ai-router/dump_session_state_schema.py --write docs/session-state-schema-example.json

# Print to stdout instead
python ai-router/dump_session_state_schema.py

# JSONC form (JSON with // comments per top-level field) for human reading
python ai-router/dump_session_state_schema.py --include-comments
```

The pure-JSON form is the canonical form. The JSONC form annotates each
top-level field with a one-line comment from the generator's
`_FIELD_COMMENTS` table; strict JSON parsers will reject it.

## Drift check

```bash
python ai-router/dump_session_state_schema.py --check
```

Exits `0` when the regenerated output matches `docs/session-state-schema-example.json`
byte-for-byte; exits `1` and prints a one-line operator hint pointing
at the regeneration command otherwise.

This is intended to be wired into CI and pre-commit hooks. To wire as a
pre-commit hook, add to `.pre-commit-config.yaml`:

```yaml
- repo: local
  hooks:
    - id: session-state-schema-drift
      name: session-state.json schema drift
      entry: python ai-router/dump_session_state_schema.py --check
      language: system
      pass_filenames: false
      files: ^(ai-router/session_state\.py|ai-router/dump_session_state_schema\.py|docs/session-state-schema-example\.json)$
```

For GitHub Actions, run the same command in a step. The exit code is
the signal — no parsing required.

## Workflow when the schema legitimately changes

1. Edit `ai-router/session_state.py` (and the generator's
   `build_example_state()` and `_FIELD_COMMENTS` if a new field is added).
2. Regenerate: `python ai-router/dump_session_state_schema.py --write docs/session-state-schema-example.json`.
3. Commit the schema change, the generator change, and the regenerated
   reference in the same PR.

The drift check catches step 2 being skipped — it cannot tell whether
the regeneration is intentional or accidental, only that the example
no longer matches the schema.
