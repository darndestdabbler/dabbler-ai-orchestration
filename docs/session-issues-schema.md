# `sN-issues.json` schema

> **What this is.** The canonical root-level, machine-readable
> persistence for a verification round's structured findings. One file
> per **findings-bearing** verification round, written beside
> `sN-verification.md` at the root of the session-set folder.
>
> **Authoritative source.** The JSON Schema at
> [`docs/session-issues.schema.json`](session-issues.schema.json) is the
> machine-readable contract; this document is the orchestrator-facing
> reference. A concrete instance lives at
> [`docs/session-issues-schema-example.json`](session-issues-schema-example.json)
> and is validated against the schema by
> `ai_router/tests/test_session_issues_schema.py`. If the doc and the
> schema ever disagree, the schema wins — update this doc.
>
> **Locked by** Set 055
> (`docs/session-sets/055-structured-verification-issue-artifacts/`).
> The authoritative design record is
> [`docs/proposals/2026-06-02-structured-verification-issue-artifacts/verdict.md`](proposals/2026-06-02-structured-verification-issue-artifacts/verdict.md).
>
> **Extended by** Set 057
> (`docs/session-sets/057-lightweight-dedicated-verification-sessions/`):
> `schemaVersion: 2` promotes four optional finding fields and tightens
> `resolution_status` (and the new `issueType`) into validator-enforced
> enums **when present**. v1 files stay valid unchanged. The Set 057
> design record is
> [`docs/proposals/2026-06-05-lightweight-dedicated-verification-sessions/verdict.md`](proposals/2026-06-05-lightweight-dedicated-verification-sessions/verdict.md)
> → Q2.
>
> **Extended by** Set 096
> (`docs/session-sets/096-consequence-graded-phased-verification/`):
> the optional verifier-emitted `failureScenario` field is recognized on
> the base issue object under **both** schema versions (additive; no
> version bump — the issue object is open and the field is tolerant).

---

## Why this exists

The live workflow already preserves a verifier's **prose** in
`sN-verification.md` and the session outcome in `disposition.json`. The
verifier parser (`ai_router.verification.parse_verification_response`)
also produces a structured `{"verdict": ..., "issues": [...]}` list, but
that machine-readable list was previously transient — it existed only in
memory at verification time and was never persisted in the modern
root-level layout. The legacy `issue-logs/` directory is **retired** and
must not be revived.

`sN-issues.json` restores durable, queryable issue persistence without
bringing back the nested folder contract. It lives at the session-set
root, is writable by any orchestrator that can emit plain JSON
(Claude / Codex / Gemini / Copilot / a human on a manual flow), and has
**no runtime reader** — `close_session`, the gate checks, metrics, and
the Explorer all ignore it in the current contract.

---

## The locked invariant

> **The presence of an `sN-issues*.json` file means that verification
> round found issues.**

This is why there is **no empty issue file for `VERIFIED` rounds** and
**no overwrite / latest-only mode**. A clean round is already recorded
in `sN-verification.md`; it produces no issue artifact. A consumer or
future tool can therefore treat artifact presence as "this round had
structured findings" without opening a second file or replaying round
history.

---

## When to author it

In the Step 6 / Step 7 verification flow
([`docs/ai-led-session-workflow.md`](ai-led-session-workflow.md)):

1. The verifier returns `{"verdict", "issues"}`.
2. The raw prose is written to `sN-verification.md` (never edited).
3. **If, and only if, the verdict is not `VERIFIED`** (the `issues`
   list is non-empty), write the structured list to `sN-issues.json`
   for round 1, or `sN-issues-round-<M>.json` for a later
   findings-bearing retry.
4. The orchestrator may, while resolving findings, append advisory
   `resolution_*` annotations to the issue objects (see below). This is
   optional.

A clean round writes nothing here. A round that returns issues writes
exactly one file and never overwrites a prior one.

---

## File location and naming

```
docs/session-sets/<slug>/sN-issues.json            # round 1 findings
docs/session-sets/<slug>/sN-issues-round-2.json    # round 2 findings
docs/session-sets/<slug>/sN-issues-round-3.json    # round 3 findings
```

Where `N` is the 1-based session number and `<slug>` is the session-set
directory name. The round-1 file omits the `-round-1` suffix to match
the `sN-verification.md` / `sN-verification-round-2.md` precedent. Never
overwrite an existing findings file; each findings-bearing round gets
its own.

---

## Envelope shape

The artifact is a small **envelope**, not a bare array. The v1
top-level contract:

| Field | Type | Required | Notes |
|---|---|---|---|
| `schemaVersion` | integer | yes | `1` (Set 055 v1 contract) or `2` (Set 057 v2 contract). v1 keeps loose advisory strings; v2 enum-enforces `resolution_status` / `issueType` and recognizes the promoted finding fields. |
| `sessionNumber` | integer ≥ 1 | yes | The session this round belongs to. |
| `verificationRound` | integer ≥ 1 | yes | Round 1 → `sN-issues.json`; round M → `sN-issues-round-<M>.json`. |
| `verificationVerdict` | string | yes | The verifier verdict, preserved verbatim (e.g. `"ISSUES_FOUND"`). Makes the artifact self-describing. |
| `issues` | array (≥ 1) | yes | The structured findings. At least one — the file would not exist otherwise. |

### Issue objects

Verifier-emitted fields are preserved **verbatim**. Only `description`
is reliably present; `category` and `severity` are loose optional
strings (the parser may emit `"unknown"`). Extra verifier-emitted keys
are tolerated (`additionalProperties` is open on the issue object).

| Field | Type | Required | Source |
|---|---|---|---|
| `description` | string | yes | verifier |
| `category` | string | no | verifier (loose) |
| `severity` | string | no | verifier (loose) |
| `failureScenario` | string | no | verifier (Set 096). The concrete failure scenario + probability justification the consequence-graded severity rubric requires per blocking Issue. Parsed tolerantly from the `Failure scenario:` line; valid under both schema versions; its absence never changes blocking classification (`classify_blocking` semantics unchanged). |
| `resolution_status` | string | no | orchestrator annotation (advisory). v1: loose. v2: enum-enforced **when present** (see below). |
| `resolution_notes` | string | no | orchestrator annotation (advisory) |
| `resolved_in_round` | integer ≥ 1 | no | orchestrator annotation (advisory) |

### v2 promoted finding fields (Set 057)

Under `schemaVersion: 2`, four additional **optional** fields are
recognized on the issue object. They are additive and Full-tier-safe —
a v2 file may carry none of them and stay valid. When present, the two
enum fields are validated (spelling-drift guard only; the semantics
remain advisory, no runtime gate reads them).

| Field | Type | Required | Notes |
|---|---|---|---|
| `issueId` | string | no | Stable identifier the verifier assigns so re-verification rounds and remediation sessions can reference the finding unambiguously. |
| `issueType` | string (enum) | no | One of `deterministic-defect` \| `contingent-risk` \| `standards-departure` \| `missing-context`. Enum-enforced when present. |
| `verificationMethod` | string | no | One line on how the verifier reached (or would confirm) the finding. |
| `suggestedTestOrCheck` | string | no | A concrete test/check that would confirm a fix. Often redundant with `verificationMethod`. |

**`resolution_status` enum (v2, enforced when present):** `fixed` \|
`not-reproducible` \| `accepted-risk` \| `accepted-consequence` \|
`advisory-disagreement` \| `needs-more-context` \| `escalate-human`.

> **Flow-layer requirement (NOT in the shared schema).** The Lightweight
> dedicated-verification flow additionally requires a verifier-created
> **open** issue to carry `issueId` + `issueType` + `verificationMethod`
> (`description` is already required by the base envelope;
> `suggestedTestOrCheck` stays optional). That stricter rule is enforced
> by the flow / writer, not by `session-issues.schema.json`, so the
> shared schema stays additive for Full tier and for existing fixtures.

### Resolution fields are advisory only

The `resolution_*` fields are **append-only annotations**, not a second
authoritative workflow state. Specifically:

- The verification narrative (`sN-verification.md`) remains the
  canonical prose record.
- `disposition.json` remains the close-out handoff.
- `sN-issues*.json` `resolution_*` fields are convenience metadata for
  issue-tracking and future automation only.

No runtime reader treats those fields as gate-driving or as the final
source of truth for whether a finding was resolved. A newly-written
artifact carrying **only** the five envelope fields and bare verifier
issues (no `resolution_*` keys) is fully valid.

---

## Examples

### Minimal — bare verifier issues, no annotations

```json
{
  "schemaVersion": 1,
  "sessionNumber": 3,
  "verificationRound": 1,
  "verificationVerdict": "ISSUES_FOUND",
  "issues": [
    { "description": "Step 7 omits the re-run-verification cap.", "category": "completeness", "severity": "Minor" }
  ]
}
```

### Annotated — orchestrator appended resolution metadata

See [`docs/session-issues-schema-example.json`](session-issues-schema-example.json)
for a concrete instance that mixes an annotated issue with a bare one.
Both forms are valid.

---

## Manual / `--no-router` flows

A manual or `--no-router` review **may** write the same envelope when it
genuinely has a structured issue list, but is **not** required to
fabricate JSON from a prose-only review. Therefore:

- A missing `sN-issues*.json` on a manual-flow set is **not an error**.
- The artifact is required only when the workflow actually has a
  structured findings list to persist.

This keeps the contract honest across engines and avoids inventing data
from prose.

---

## Non-goals (explicit)

- **No resurrection of `issue-logs/` or `session-reviews/`.** The
  artifact lives beside `sN-verification.md`, not in a nested folder.
- **No close-out gate dependency.** `close_session` does not block on
  `sN-issues.json`.
- **No empty file for clean rounds.** `VERIFIED` rounds produce no
  artifact.
- **No embedding the issue array into `disposition.json`.** The
  disposition stays the close-out handoff, not the per-round findings
  archive.
- **No runtime readers, Explorer surface, or historical backfill.**
