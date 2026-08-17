# Schema reference

The four per-set artifacts live in `docs/session-sets/<NNN-slug>/` in
the consumer project. Two ledgers live outside the set directory: the
verification round ledger under `.dabbler/runs/` (gitignored) and the
router metrics ledger `router-metrics.jsonl`.

Writers emit only the canonical shapes below. Readers are more
tolerant: schema v3 state files, status aliases (`completed`, `done`),
and drifted step statuses normalize on read and are never written back.

## spec.md

Human-reviewed plan, produced by the decomposition session. Layout the
step parser expects: one `# <Title>` heading; a `## Sessions` section;
one `### Session K of N: <title>` heading per session; each session's
steps as a top-level ordered list. Session start seeds those steps into
`activity-log.json`.

## session-state.json (schema v4)

Machine-written by `ai_router` only. JSON Schema:
`ai_router/schemas/session-state.schema.json`. Readers tolerate v3
files on disk via a normalize shim; writers only emit v4.

Top level (required: `schemaVersion`, `sessionSetName`, `status`):

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | const `4` | older versions read-normalized, never written |
| `sessionSetName` | string | basename of the set directory |
| `status` | enum | `not-started` / `in-progress` / `complete` / `cancelled` |
| `sessions` | array | per-session ledger (absent only in the plan-less carve-out) |
| `startedAt`, `orchestrator` | — | plan-less carve-out passthrough only; the canonical shape carries both per session |
| `nextOrchestrator` | object \| null | recommendation for the next session, written at close |
| `forceClosed` | boolean | set by `session close --force`; preserved across rewrites |
| `preCancelStatus` | enum \| null | status captured at cancel; restore returns the set to it |

Each `sessions[]` record (required: `number`, `title`, `status`):

| Field | Type | Meaning |
|---|---|---|
| `number` | integer ≥ 1 | |
| `title` | string | healed from spec.md when a v3 file lacks it |
| `status` | enum | `not-started` / `in-progress` / `complete` (per-session `cancelled` is rejected in v4) |
| `type` | enum | `verification` or `remediation`; absent means work |
| `startedAt`, `completedAt` | string \| null | timestamps |
| `orchestrator` | object \| null | see below |
| `verificationVerdict` | string \| null | canonical `VERIFIED` / `ISSUES_FOUND` (plus `WAIVED`); the writer fails closed against an exact allowlist, readers prefix-match leniently |

The `orchestrator` block (required: `engine`; omit-null — missing keys
are valid, `null` values are not):

| Field | Type | Meaning |
|---|---|---|
| `engine` | string | e.g. `claude-code`, `codex`, `copilot`, `gemini` |
| `provider` | string | seat descriptor; the *effective* provider is derived by registry lookup on `model` (`ai_router/identity.py`) |
| `model` | string | registry alias or catalog id |
| `effort` | string | |
| `identityProvenance` | enum | `direct` (single-vendor engine) or `asserted` (multi-provider seat) — derived by the writer, never a free choice |
| `seatSessionIds` | array of strings | Copilot seat conversation ids that produced the session (the join key `seat_cost` prices from); accumulates across idempotent re-starts; omitted entirely when not captured |

## activity-log.json

Machine-written step log. Shape:

```json
{
  "sessionSetName": "<slug>",
  "createdDate": "<ISO timestamp>",
  "totalSessions": 3,
  "entries": [
    {
      "sessionNumber": 1,
      "stepNumber": 2,
      "stepKey": "run-the-tests",
      "dateTime": "<ISO timestamp>",
      "description": "Run the tests ...",
      "status": "pending",
      "kind": "plan-step"
    }
  ]
}
```

- Session start seeds one `"kind": "plan-step"` entry per spec step,
  status `pending`, exactly once per session (never re-applied).
- Progress entries append with the same fields minus `kind`. The writer
  enforces the closed status vocabulary `pending` / `in-progress` /
  `complete` / `blocked`; drifted synonyms are read-tolerated.
- `stepKey` is a slug derived from the step's first clause; a logged
  entry claims a planned row by exact `stepKey` match, or failing that
  by `stepNumber` (latest entry wins). Unclaimed logged steps append,
  unclaimed planned rows stay pending. Nothing is dropped either way.
  `session start` prints the seeded keys and numbers so the logger
  never has to re-derive the slug.
- Session start also logs the `register` plan step complete itself —
  registration is the fact the start call established, not something
  the engine reports afterward.

## change-log.md

Human-readable, append-only markdown. The verification loop appends one
summary block per session (verdict, verifier provider, rounds, cost);
the close appends its close-out block. Presence of this file is also
the completeness signal for legacy spec-only folders with no state
file.

## Rounds ledger — `.dabbler/runs/<set>/s<N>/rounds.jsonl`

One JSON object per line, one line per completed verification round.
Written **only** by `ai_router.verify`; schema-validated on read
(`ai_router/schemas/rounds.schema.json`). A line that fails parsing or
validation blocks the close — a bad line is evidence of tampering, not
noise to skip. Duplicate round numbers are refused; rounds are
immutable history.

Row fields (required: `round`, `verdict`, `blocking`, `verifier_model`,
`verifier_provider`, `findings`, `completion_tree`, `recorded_at`):

| Field | Type | Meaning |
|---|---|---|
| `round` | integer ≥ 1 | |
| `phase` | enum | `full` (round 1) or `fix-delta` (rounds ≥ 2) |
| `verdict` | enum | `VERIFIED` / `ISSUES_FOUND` |
| `blocking` | boolean | any `critical`/`major` finding outstanding |
| `verifier_model`, `verifier_provider` | string | who verified |
| `orchestrator_provider` | string | the excluded provider |
| `findings` | array | each: `description`, `severity` (`critical`/`major`/`minor`, closed vocabulary), optional `category`, `failureScenario`, `evidencePaths`, `blocking` |
| `cost_usd` | number \| null | null on seat transport, never 0.0 |
| `baseline_tree` | string \| null | tree-SHA before the session's work |
| `completion_tree` | string | worktree tree-SHA at this round |
| `previous_tree` | string | previous round's tree-SHA; **required for rounds ≥ 2** (the fix-delta base) |
| `recorded_at` | string | timestamp |
| `transport` | string | `api` or `copilot-cli` |

Raw verifier output is saved beside the ledger as
`round-<N>-verifier-output.md`, byte-identical to the response.

## Metrics ledger — `router-metrics.jsonl`

Append-only JSONL, one object per routed or verification call, additive
schema, written best-effort (a metrics failure never breaks a paid
call). Location: `AI_ROUTER_METRICS_PATH` env var, else alongside the
loaded `router-config.yaml`, else the package directory; filename from
`metrics.log_filename` (default `router-metrics.jsonl`).

Row fields (from `metrics.record_call`):

| Field | Notes |
|---|---|
| `timestamp` | UTC ISO |
| `session_set`, `session_number` | set name normalized to bare folder name; nullable |
| `call_type` | `route` or `verify` |
| `task_type`, `model`, `provider`, `tier`, `complexity_score` | selection facts |
| `requested_model_id`, `served_model_id`, `served_model_mismatch` | mismatch is tri-state: true/false only when both ids are known, else null |
| `effort`, `thinking_on` | per-provider reasoning params |
| `input_tokens`, `output_tokens` | integers |
| `cost_usd` | rounded to 6 places; **null = not priced here, never 0.0** |
| `elapsed_seconds`, `escalated`, `stop_reason` | call outcome |
| `transport`, `billed_usage_unavailable`, `transport_session_id` | Copilot rows carry `cost_usd: null` + `billed_usage_unavailable: true`; the conversation id prices them later via `python -m ai_router.seat_cost` |
| `verifier_of`, `verdict`, `issue_count` | verification calls only |

`python -m ai_router.metrics` prints the report: totals, per-model /
per-task / per-set spend, requested-vs-served mismatches, and
Opus-equivalent savings (what the priced calls would have cost at the
tier-3 rate, minus actual). Unpriced groups render `-`, mixed groups a
`+` suffix — never $0.00.
