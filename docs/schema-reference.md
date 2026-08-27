# Schema reference

The four per-set artifacts live in `docs/session-sets/<NNN-slug>/` in
the consumer project. Two ledgers live outside the set directory: the
verification round ledger under `.dabbler/runs/` (gitignored) and the
router metrics ledger `router-metrics.jsonl`. Two more files are
machine-scoped rather than per-set: the config overlay
`local-overrides.yaml` and the seat catalog lockfile.

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
| `verification` | object | summary stamped when the loop finishes: `rounds`, `verifierModel`, `verifierProvider`, `transport`; carried across later registrations like the verdict |

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
- Progress entries are written by `python -m ai_router.session log
  --session-set-dir <dir> --step <stepKey|stepNumber> --status <s>`,
  the only sanctioned writer. The step must resolve against a seeded
  `plan-step` row: an unresolvable `--step` is **refused**, listing the
  valid addresses, rather than appending an orphan row nobody planned.
  The status vocabulary is enforced at the CLI boundary as well as at
  the writer, and re-logging an identical status and description is a
  noop, so the command is safe to repeat after a context reset.
  `--session-number` overrides the target; with no session in flight it
  defaults to the last closed one, which is where a close-out step
  belongs.
- Session start also logs the `register` plan step complete itself —
  registration is the fact the start call established, not something
  the engine reports afterward.

## change-log.md

Human-readable, append-only markdown. The verification loop appends one
summary block per session (verdict, verifier provider, rounds); the close
appends its close-out block. Presence of this file is also the
completeness signal for legacy spec-only folders with no state file.

## Rounds ledger — `.dabbler/runs/<set>/s<N>/rounds.jsonl`

One JSON object per line, one line per completed verification round.
Written **only** by `ai_router.verify`; schema-validated on read
(`ai_router/schemas/rounds.schema.json`). A line that fails parsing or
validation blocks the close — a bad line is evidence of tampering, not
noise to skip. Duplicate round numbers are refused; rounds are
immutable history.

Row fields (required: `round`, `verdict`, `blocking`, `findings`,
`completion_tree`, `recorded_at`; `verifier_model` and
`verifier_provider` are required on every row except `type: "waive"`):

| Field | Type | Meaning |
|---|---|---|
| `round` | integer ≥ 1 | |
| `phase` | enum | `full` (round 1) or `fix-delta` (rounds ≥ 2) |
| `verdict` | enum | `VERIFIED` / `ISSUES_FOUND`; `WAIVED` on waive rows only |
| `blocking` | boolean | any `critical`/`major` finding outstanding |
| `verifier_model`, `verifier_provider` | string | who verified (on an adjudication row: the adjudicator) |
| `orchestrator_provider` | string | the excluded provider |
| `findings` | array | each: `description`, `severity` (`critical`/`major`/`minor`, closed vocabulary), optional `category`, `failureScenario`, `evidencePaths`, `blocking` |
| `cost_usd` | number \| null | **historical only** — dollars are not computed anywhere and no writer emits this key; older ledgers carry it |
| `baseline_tree` | string \| null | tree-SHA before the session's work |
| `completion_tree` | string | worktree tree-SHA at this round |
| `previous_tree` | string | previous round's tree-SHA; **required for rounds ≥ 2** (the fix-delta base) |
| `recorded_at` | string | timestamp |
| `transport` | string | `api` or `copilot-cli` |
| `type` | enum | absent on plain rounds; `adjudication` or `waive` — both terminal: no later round may open |

Raw verifier output is saved beside the ledger as
`round-<N>-verifier-output.md`, byte-identical to the response.

**The adjudication row** (`type: "adjudication"`, written by
`ai_router.verify adjudicate`, one per session ever) additionally
requires:

| Field | Type | Meaning |
|---|---|---|
| `outcomes` | array | one per disputed finding: `finding_index`, `outcome` (`UPHELD`/`OVERRULED`, fail-closed to UPHELD on any parse ambiguity or reason-less overrule), `reasons` |
| `excluded_providers` | array | the exclusion superset: the orchestrator's provider plus every provider that verified a round |

All disputes overruled → `verdict: "VERIFIED"`, `blocking: false`, and
the close gate passes unchanged. Any upheld → `ISSUES_FOUND`, still
blocked.

**The waive row** (`type: "waive"`, written by `ai_router.verify
waive` — interactive-only, operator-attested) has no verifier fields;
it requires `verdict: "WAIVED"`, `blocking: false`, and:

| Field | Type | Meaning |
|---|---|---|
| `attestation` | string | the operator's typed attestation, verbatim |
| `waived` | object | `exhausted_via` (`upheld-adjudication` / `adjudication-unavailable`) and `findings` — the blocking findings being waived, copied verbatim |

WAIVED means the operator accepted **unverified** work; it is not a
verification. The command is permitted only when the machine path is
exhausted, and refuses when stdin is not a TTY.

## Disputes ledger — `.dabbler/runs/<set>/s<N>/disputes.jsonl`

One row per disputed finding, written **only** by `ai_router.verify
dispute`; schema-validated on read
(`ai_router/schemas/disputes.schema.json`). One dispute per finding,
ever — rows are immutable, and a second dispute of the same finding is
refused. The next round's prompt presents the rebuttal beside the
finding exactly once (UPHOLD-or-WITHDRAW); the adjudicator reads it
verbatim.

Row fields (all required):

| Field | Type | Meaning |
|---|---|---|
| `round` | integer ≥ 1 | the recorded round the finding belongs to |
| `finding_index` | integer ≥ 0 | 0-based index into that round's `findings` |
| `filed_after_round` | integer ≥ 1 | latest round at filing time; the first later round presents the rebuttal, after which the dispute is settled by that round's findings |
| `grounds` | string | the rebuttal's argument |
| `evidence_paths` | array, min 1 | repo-relative cites, optionally `path:START-END`; prose-only disputes are refused at the CLI |
| `recorded_at` | string | timestamp |

## Step execution ledger — `.dabbler/runs/<set>/s<N>/step-execution.jsonl`

Two rows per step of the session's approved plan — one `opened`, one
`closed` — written **only** by `ai_router.verify step`; schema-validated
on read (`ai_router/schemas/step-execution.schema.json`). This file is
what says whether a step is in flight: the last `opened` row with no
`closed` row after it is the open step, and there is never more than one.
A row that fails validation is a refusal, not a skip — a framework that
cannot tell what is open cannot tell whether work escaped a plan.

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | `1` | frozen; any other value is refused, not interpreted |
| `event` | `opened` \| `closed` | there is no third word |
| `recorded_at` | string | timestamp |
| `set_slug`, `session_number` | string, integer ≥ 1 | the row names its own session, so a hook with no arguments can still answer "is a step open?" |
| `step_id` | slug | a `step_id` the session's `approved-plan.json` declares |
| `base_commit` | 40-hex | HEAD when the step opened; both required |
| `envelope` | object | `closed` only: `inside` and `outside` repo-relative paths |
| `deterministic` | array | `closed` only: one row per control and per targeted test run — `kind`, `status` (`pass`/`fail`/`not_applicable`/`unknown`), `required`, `command`, `detail` |

Everything a step is judged by is anchored to `base_commit`: the envelope
comparison and the deterministic pass both diff the working tree against
that commit's tree. `verify step close` therefore refuses outright when
HEAD has moved — a commit landed mid-step, and both measurements would
otherwise be describing someone else's change.

## Packaging ledger — `.dabbler/runs/<set>/s<N>/packaging.jsonl`

One row per attempt at step (f), written **only** by
`ai_router.packaging`; schema-validated on read
(`ai_router/schemas/packaging.schema.json`). Append-only, and **refusals
append beside publications**: "this session was not allowed to publish"
is a fact about the session, and a ledger holding only the successes
cannot be read as a history of what was released.

| Field | Type | Meaning |
|---|---|---|
| `outcome` | `published` \| `refused` \| `failed` | `refused` means a gate said no and nothing ran; `failed` means a declared command ran and did not succeed |
| `session_number` | integer ≥ 1 | the session that attempted it |
| `releasable` | boolean | what step (a) declared, read from `activity-log.json`. False includes the session that never declared: `session_is_releasable` fails closed |
| `refusal` | string | required when `outcome` is `refused` |
| `feed` | string | the feed that was substituted into the command that ran, not a caption beside it |
| `secret_name` | string | the **name** of the credential, never its value |
| `tree_digest` | string \| null | the worktree tree the artifacts were built from |
| `post_tree_digest`, `tree_mutated` | string \| null, boolean | present when a declared command changed the repository while it ran |
| `artifacts` | array | what `pack` produced, relative to the run's own output directory |
| `gates` | array | the five close gates as packaging found them: `name`, `passed`, `remediation` |
| `steps` | array | `pack` once then `push` per artifact: `step`, `command`, `artifact`, `exit_code`, `duration_seconds`, `timed_out`, `output` |
| `recorded_at` | string | timestamp |

**No field here ever holds a credential.** `command` is recorded with the
`{secret}` placeholder still in it, and `output` is scrubbed of the
resolved value before it is written, so the value exists only in the argv
of a process that has already exited. A dry run is never filed: a
rehearsal of the gates is not an attempt.

`pack` writes into `.dabbler/runs/<set>/s<N>/package/`, which is emptied
first — so every artifact is one this run built. The worktree is compared
against its own tree id after every command: a build that leaves
intermediates in the repository fails the attempt whatever its exit code
said, and nothing is pushed. The schema enforces the same thing from the
other side — a row cannot be `published` and `tree_mutated` at once.

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
| `task_type`, `model`, `provider` | selection facts |
| `requested_model_id`, `served_model_id`, `served_model_mismatch` | mismatch is tri-state: true/false only when both ids are known, else null |
| `effort`, `thinking_on` | per-provider reasoning params |
| `input_tokens`, `output_tokens` | integers. **Tokens are the record; dollars are not computed anywhere**, and reconciliation happens against the vendor's own console |
| `elapsed_seconds`, `escalated`, `stop_reason` | call outcome |
| `transport`, `billed_usage_unavailable`, `transport_session_id` | Copilot rows carry `billed_usage_unavailable: true`; the conversation id is what `python -m ai_router.seat_cost` prices them by |
| `verifier_of`, `verdict`, `issue_count` | verification calls only |

`python -m ai_router.metrics` prints the report: token totals, per-model /
per-task / per-set volume, and requested-vs-served mismatches.

## Config overlay — `local-overrides.yaml`

Project-root YAML, deep-merged over the packaged
`ai_router/router-config.yaml`. **Never committed and never packaged**:
`.gitignore` reserves the name and it is not listed as package data, so
it can state a fact about one machine that would be wrong for anyone
else.

| Rule | Behaviour |
|---|---|
| Partial | carries only the keys it changes; everything else comes from the packaged base |
| Validated | the *merged* result goes through the same schema and semantic checks as any config, so an overlay cannot produce a config the router would have refused |
| Unknown keys | **refused at load**, not ignored — where the schema names its properties, that list is the vocabulary; where it declares an open object, recursion stops |
| Scope | applies only to the packaged default; an explicit `--config` or `AI_ROUTER_CONFIG` path takes no overlay |
| Location | the git toplevel of the working directory, resolved with the same root discovery the evidence and gate paths use |

It is a config *source*, not a precedence tier: it changes what
`transport.profile` says, and `--transport` and `DABBLER_TRANSPORT`
still outrank it. The loaded config records it as
`_local_overrides_path` (null when there is none).

The worked case — a machine with provider API keys and no Copilot seat,
where the packaged default's `profile: copilot-cli` would fail on a
missing `copilot` binary and must not be edited because it is what ships:

```yaml
transport:
  profile: api
```

The second worked case is the feed. A packaged default cannot name one
repository's Azure DevOps feed, so `packaging` is declared in the schema
and absent from the shipped config; the overlay is where a machine states
its own. `secret` names the credential's environment variable and never
holds a value:

```yaml
packaging:
  pack:
    argv: ["dotnet", "pack", "-c", "Release", "-o", "{output}"]
  push:
    argv: ["dotnet", "nuget", "push", "{artifact}",
           "--source", "{feed}", "--api-key", "{secret}"]
    feed: https://pkgs.dev.azure.com/<org>/_packaging/<feed>/nuget/v3/index.json
    secret: DABBLER_FEED_PAT
```

Both commands are `argv`, never shell strings, so nothing can re-split
the element the credential lands in; both are spawned with the child
environment allowlist, so the credential is inherited by nothing.

## Seat catalog lockfile — `copilot-catalog.lock`

Seat-scoped, empirically-probed TOML: the load-bearing record of what a
Copilot seat can dispatch, named by
`transports.copilot-cli.lockfile`. The CLI has no `list-models` command
and no first-party provider field, so every value here was earned by a
real billed call. `ai_router.transports.copilot` is its only writer —
see `refresh` in the quick start.

A restricted TOML subset: one flat `[meta]` table, then repeated flat
`[[models]]` tables, scalars and flat string arrays only. Keys the
reader does not model survive a rewrite in place, so a newer writer
never silently drops them.

`[meta]`:

| Key | Notes |
|---|---|
| `cli_version` | required; the CLI build these entries were probed on. Provenance, not a gate |
| `cli_version_pin_required` | default **false**. True makes drift a refusal; false makes it a warning |
| `seat_id`, `seat_label` | required / optional seat identity |
| `probed_at` | last refresh timestamp |
| `candidate_universe` | array of ids a refresh may probe — a **maintained list**, not an enumeration, because the CLI cannot enumerate. An id absent here is unprobed, not unavailable, and a refresh refuses to probe one, so a typo cannot buy a premium request |
| `written_by`, `written_at`, `content_digest` | the writer stamp (below) |

`[[models]]`, one per entry:

| Key | Notes |
|---|---|
| `id` | required |
| `provider` | `anthropic` \| `openai` \| `google`, inferred from the id prefix |
| `provider_source` | always `name-prefix-heuristic` — a declared guess, never presented as first-party truth |
| `enablement` | `confirmed` \| `unconfirmed`. Strictly empirical: an invalid model name and a policy-blocked one return the identical CLI error, so nothing is inferred from a name |
| `confirmed_at`, `confirmed_on_cli_version` | provenance of the last successful probe |
| `echoed_model` | the model id the CLI reported serving |
| `probe_premium_requests` | a **one-call sample**, not a price. An integer for premium models and a **fraction** for sub-premium ones (`claude-haiku-4.5` measures `0.33`). Absent means unknown and **never free**. It funds the refresh cost preview and never feeds selection; real spend is measured by `python -m ai_router.seat_cost`. v1 lockfiles spell it `premium_request_weight`, which still reads and is written back under the name it was read under |
| `last_probe_error`, `last_probe_at` | the most recent *failed* probe, by its own error class. It annotates rather than replaces the confirmation above it: a transient CLI failure is not a withdrawn model |

Fail-closed rules (`validate_catalog`), which refuse the seat:
provenance on every confirmed entry, and ≥2 distinct confirmed
providers — cross-provider verification has no meaning without them.
Warnings, which do not: CLI version drift (the seat CLI auto-updates on
its own schedule; refusing a working seat for that is what taught two
people to hand-edit the pin) and hand-edited provenance. Every one of
these messages names the exact `refresh` invocation that resolves it.

### The writer stamp

The writer records what wrote the file, when, and a SHA-256 over what it
wrote:

```toml
written_by = "ai_router.transports.copilot 1.1.0"
written_at = "2026-08-19T11:42:07Z"
content_digest = "sha256:…"
```

The digest covers the catalog **as rendered with the digest key itself
elided** — content, not the file's mtime, because the lockfile is
committed and every checkout rewrites mtime. Three states on load:

| State | Meaning |
|---|---|
| `machine-written` | the digest matches; the file is what the writer wrote |
| `hand-edited` | a stamp is present and the contents disagree with it — including a stamp whose `content_digest` line was deleted, since removing the line that would convict is itself the edit |
| `unstamped` | no stamp at all; the file predates the writer |

Detection, not enforcement. The seat still loads; the record says what
happened. This is the rule `.dabbler/runs/` already holds — machine
written, never hand-repaired — made checkable here rather than
aspirational, because a hand-written value is not evidence and this file
carries nothing but evidence.
