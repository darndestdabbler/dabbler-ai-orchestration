# `path-aware-critique.json` schema

> **What this is.** The canonical root-level, machine-readable
> persistence of a session set's **multi-provider path-aware critique** —
> the operator-run review (today GitHub Copilot driving GPT-5.4 +
> Gemini-Pro over the repo) that the Set 066 `pathAwareCritique` policy
> institutionalizes. One file per session set, written beside `spec.md`
> at the session-set root as `path-aware-critique.json`.
>
> **Authoritative source.** The JSON Schema at
> [`docs/path-aware-critique.schema.json`](path-aware-critique.schema.json)
> is the machine-readable **structural** contract; this document is the
> orchestrator-facing reference. A concrete instance lives at
> [`docs/path-aware-critique-schema-example.json`](path-aware-critique-schema-example.json)
> and is validated against the schema by
> `ai_router/tests/test_path_aware_critique_schema.py`. If the doc and the
> schema ever disagree, the schema wins — update this doc.
>
> **Runtime validator.** The Set 066 S2 close-out gate does **not** call
> `jsonschema` (a test-only optional dependency). It uses the pure-Python
> `ai_router.path_aware_critique.validate_path_aware_critique_artifact`,
> which enforces the same structure **plus** the multi-provider semantic
> rule that JSON Schema cannot express (at least **two distinct
> providers**). The shipped example fixture is checked against **both** the
> JSON Schema and the Python validator so they cannot silently diverge.
>
> **Locked by** Set 066
> (`docs/session-sets/066-path-aware-critique-policy/`).
> The design source is the Set 065 proposal
> ([`docs/proposals/2026-06-14-verification-surface-empirics/proposal.md`](proposals/2026-06-14-verification-surface-empirics/proposal.md))
> Candidate 1 + section 7, and its 2026-06-15 Erratum.

---

## Why this exists

The Set 065 bake-off proved a **path-aware**, **multi-provider** critique
catches a class of real, high-severity defects that a snippet-fed
single-shot verifier structurally cannot see (fabricated data, index
undercounts, cross-artifact contract drift): 12 unique real defects
including two Criticals. The **010-vs-C3 split** in that evidence proves a
single provider is insufficient — the two catch-classes imply opposite
single-provider fixes — so the load-bearing property is path-aware **AND**
multi-provider.

`path-aware-critique.json` is the durable, queryable record of that review.
It lives at the session-set root, is writable by any orchestrator that can
emit plain JSON (Claude / Codex / Gemini / Copilot / a human on a manual
flow), and has a single runtime reader: the Set-066 close-out gate, which
consults it only when the recorded `pathAwareCritique` policy is
`required`.

---

## The policy attribute it backs

`pathAwareCritique` is a **tier-orthogonal** per-set policy attribute —
valid on both Full and Lightweight tiers — declared in `spec.md`'s Session
Set Configuration block and recorded once at set start (immutable
thereafter), exactly mirroring the `verificationMode` attribute:

| Value | Meaning | Close-out behavior |
|---|---|---|
| `none` (default) | No path-aware critique gate. | Skipped — no artifact required. Preserves the walk-away promise on both tiers. |
| `advisory` | A critique is recommended. | Non-blocking: a missing/invalid artifact **warns**, never blocks. |
| `required` | A critique is required. | The set-terminal close confirms a **valid multi-provider** artifact exists and is content-non-trivial. Hard-blocks in an interactive TTY; soft-warns headless. |

The `none` default makes the feature **strictly opt-in**: a set that
declares nothing pays no gate. The durable record is an `activity-log.json`
entry (`kind: "path_aware_critique"`) written once at the first
`start_session` — from the spec seed or an explicit
`start_session --path-aware-critique <level>`. (The close-out gate itself
is Set 066 **Session 2**; Session 1 ships the attribute, the artifact
contract, and the blast-radius predicate.)

### The blast-radius predicate that recommends a value

`ai_router.blast_radius` implements the proposal's core predicate
`P_set = any(P_task)`: it classifies a set's changed/planned surface
(cross-artifact / shared-schema / wiring / index changes) and
**recommends** a value — `required` when `P_set` holds, `advisory` for
low-blast-radius code changes, `none` when no code is touched (a
documentation/whitespace change) or the surface is empty. It is
**advisory only**: the operator confirms the value at set start; the
predicate is **not** a hard auto-set.

```bash
python -m ai_router.blast_radius ai_router/close_session.py docs/foo-schema.json
python -m ai_router.blast_radius --json <path> ...
```

---

## When to author the artifact

In the end-of-set path-aware critique stage (Set 066): the operator runs
the multi-provider path-aware review over the set's changes, then saves the
per-provider verdicts as `path-aware-critique.json`. A clean review still
produces an artifact (every provider records what it reviewed and its
verdict) — unlike `sN-issues.json`, whose presence *means* issues were
found, this artifact's presence means *the critique ran*.

---

## File location and naming

```
docs/session-sets/<slug>/path-aware-critique.json
```

One file per session set, at the session-set root beside `spec.md`.

---

## Envelope shape

The v1 top-level contract:

| Field | Type | Required | Notes |
|---|---|---|---|
| `schemaVersion` | integer | yes | `1` (Set 066 v1 contract). |
| `sessionSetName` | string | yes | The slug of the session set (the directory basename). |
| `pathAwareCritique` | string | yes | The policy level the artifact was produced under: `none` \| `advisory` \| `required`. (Enum kept aligned with the per-set attribute; in practice an artifact exists only for `advisory` / `required`.) |
| `critiquedAt` | string | no | Optional ISO-8601 timestamp of when the critique ran. |
| `blastRadius` | object | no | Optional echo of the `ai_router.blast_radius` recommendation (`pSet` / `recommended` / `categories`). Advisory metadata; no runtime gate reads it. |
| `critiques` | array (≥ 2) | yes | The per-provider critique entries. At least two; the runtime validator additionally requires at least two **distinct** providers. |

### Critique objects

| Field | Type | Required | Notes |
|---|---|---|---|
| `provider` | string | yes | The provider (`openai` / `google` / `anthropic` / …). Distinctness across entries is what makes the artifact multi-provider. |
| `model` | string | yes | The model id (`gpt-5.4`, `gemini-2.5-pro`, …). |
| `verdict` | string | yes | The critic's verdict, verbatim (`VERIFIED`, `ISSUES_FOUND`, …). |
| `summary` | string | conditional | The critic's prose verdict/reasoning. **Required (non-empty) unless** the entry carries at least one finding. |
| `findings` | array | conditional | Structured findings (each with a non-empty `description`). |

Each critique must be **content-non-trivial**: a non-empty `summary`
**or** at least one finding with a non-empty `description`. A clean
(`VERIFIED`) critique is still expected to carry a `summary` saying what
was reviewed — that is what keeps a two-provider stub of empty entries from
satisfying the gate. Extra provider-emitted keys are tolerated
(`additionalProperties` is open on both the critique and the finding
object).

### Finding objects

| Field | Type | Required | Source |
|---|---|---|---|
| `description` | string | yes | critic |
| `severity` | string | no | critic (loose) |
| `category` | string | no | critic (loose) |

---

## What the validator rejects

`validate_path_aware_critique_artifact` returns a result whose `code` is
one of these stable tokens:

| `code` | Meaning |
|---|---|
| `valid` | Structurally valid, multi-provider, content-non-trivial. `ok` is true. |
| `missing-file` | A path was given and no file exists there. |
| `unreadable` | The file exists but is not readable JSON. |
| `not-an-object` | The top level is not a JSON object. |
| `schema-invalid` | A required field is missing/empty/wrong-typed, or `critiques` has fewer than two entries. |
| `single-provider` | Fewer than two **distinct** providers (two passes of one provider do not count). |
| `trivial-content` | A critique entry has neither a non-empty `summary` nor any finding with a non-empty `description`. |

The function never raises on a malformed or missing artifact — it returns a
result so the close-out gate decides posture rather than crash.

---

## Examples

### Minimal — two distinct providers, mixed content forms

See
[`docs/path-aware-critique-schema-example.json`](path-aware-critique-schema-example.json)
for a concrete instance: one `ISSUES_FOUND` critique carrying a finding
and one `VERIFIED` critique carrying a summary only. Both content forms are
valid.

---

## Non-goals (explicit)

- **No automated adapter in this set.** The artifact records a **manual**
  operator-run critique. The first-party tool-loop adapter that *produces*
  the critique programmatically is deferred to Set 067.
- **No change to routed per-session verification.** Set 066 leaves routed
  verification unchanged; this artifact is an orthogonal, end-of-set
  surface.
- **No Explorer / extension surface.** Surfacing the attribute in the
  Session Set Explorer is deferred.
- **No empty / fabricated artifact.** A manual flow writes the artifact
  only when it genuinely ran a multi-provider critique; it never fabricates
  provider entries to satisfy the gate.
