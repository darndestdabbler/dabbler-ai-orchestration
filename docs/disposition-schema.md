# `disposition.json` schema

> **What this is.** The structured per-session outcome record the
> close-out gate validates and the close-out machinery consumes.
> One `disposition.json` per session, written to the root of the
> session-set folder before `python -m ai_router.close_session`
> runs.
>
> **Authoritative source.** This document rephrases the
> [`Disposition` dataclass](../ai_router/disposition.py) and its
> validator (`validate_disposition`). The dataclass is the source
> of truth; this doc is the orchestrator-facing reference. If the
> two ever disagree, the dataclass wins — update this doc.

---

## When to author it

In the Step 8 sequence ([`docs/ai-led-session-workflow.md`](ai-led-session-workflow.md)
§Step 8), the orchestrator writes `disposition.json` **after** the
verifier returns a verdict and **before** invoking
`python -m ai_router.close_session`:

1. Verification round completes (Step 6 / 7).
2. Orchestrator authors `disposition.json` recording what
   happened, how it was verified, and what the next orchestrator
   should be.
3. Orchestrator commits and pushes the session's work (including
   the disposition).
4. Orchestrator invokes `python -m ai_router.close_session`. The
   gate validates the disposition's presence; the dataclass
   validator (`validate_disposition`) validates its shape.
5. On success, the orchestrator fires the session-complete
   notification.

The gate refuses to close a session whose folder is missing
`disposition.json`. `--force` bypasses the gate for incident
recovery only — see [§`--force` is not a substitute](#force-is-not-a-substitute) below.

---

## File location

```
docs/session-sets/<slug>/disposition.json
```

Where `<slug>` is the session-set directory name (e.g.,
`019-feedback-disposition-and-uat-two-options`). One file per
session-set; rewritten at the close-out of each session — the
session-state machinery preserves prior-session history through
the events ledger, not through retained dispositions.

---

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | string | always | One of `"completed"`, `"failed"`, `"requires_review"`. |
| `summary` | string | always | Non-empty narrative of what landed in the session. Typically mirrors `change-log.md`'s opening paragraph on the final session. |
| `verification_method` | string | always | `"api"` (synchronous cross-provider verification), `"manual-via-other-engine"` (operator-run cross-provider review — zero-budget tier only), or `"skipped"` (zero-budget choice). The pre-Set-083 `"manual"` token and the retired `"queue"` token are rejected with naming messages. |
| `files_changed` | list of strings | always | Paths created or modified during the session. May be empty for sessions that produced only artifacts the gate writes itself (rare). |
| `verification_message_ids` | list of strings | always | Empty list for every legal verification path (`api`, `manual-via-other-engine`, `skipped`). |
| `next_orchestrator` | object or null | conditional | **Required when `status == "completed"` AND the closing session is not the final session of the set.** Specifies who runs the next session and why. Null for the final session of a set, or for `status: "failed"` / `status: "requires_review"` outcomes that block the set's progress. |
| `blockers` | list of strings | conditional | **Non-empty when `next_orchestrator.reason.code == "switch-due-to-blocker"`**. Empty in all other cases. |
| `verification_verdict` | string or omitted | recommended |**Should be set on the `api` verification path** to the verifier's pass/fail outcome: `"VERIFIED"`, `"ISSUES_FOUND"`, or `"WAIVED"`. Set to the value returned by `parse_verification_response()` in Step 6 of the workflow. `close_session` reads this via `resolve_close_verdict()` (explicit field wins; api-path fallback derives from `status` for backward compat with pre-Set-054 dispositions; otherwise `null`). Normally omit (not `null`) on manual / skipped / `--no-router` paths — `close_session` records `verificationVerdict: null` in those cases. **Set 086 (S1): the value is no longer persisted "verbatim, anything goes."** When `close_session` writes it into `session-state.json`'s `verificationVerdict`, the sanctioned writer enforces an **exact allowlist** — the three canonical tokens plus the shipped extension token `"ISSUES_FOUND_RESOLVED_IN_FLIGHT"` — and **hard-rejects** a free-form non-verdict (the `"manual-override-development"` confabulation) or a prefix look-alike (`"VERIFIED_NOT_REALLY"`). The disposition-file validator itself still only *warns* on a non-canonical token (it does not block authoring the disposition), but a close that carries a rejected token now fails loud at the state write rather than silently persisting it. See `docs/session-state-schema.md` → `verificationVerdict` for the full writer/reader asymmetry. |
| `lessons_cited` | list of strings | omit-empty | Set 064 D3 — ids of the guidance lessons that were instrumental this session. Recorded in the `closeout_succeeded` event; run `cite_lessons` in the final commit so the usage signal drives archival. |
| `verification_qualification` | string or omitted | conditional | Set 123 S2, omit-null. Present **only** when the verdict beside it is real but weaker than the cross-provider standard: `"same-provider"` means every verifier call resolved to the orchestrator's own effective provider, so the verdict is **not independently corroborated**. Written by `verify_session` for a project whose committed verify type is `DIRECT_API` and which holds no usable API key outside its orchestrator's provider — the operator's ruling (2026-08-11) that same-provider verification beats no verification, provided the result is flagged. It is **not a gate** (Set 116's standing rule): the close proceeds, the record just stops a later reader mistaking the weaker claim for the stronger one. The vocabulary is **closed** and fails closed — unlike `verification_verdict`, whose non-canonical tokens are warned-but-accepted, an unrecognized qualification is a validation error, because a token nobody can interpret does this field's only job worse than no token at all. An unqualified round actively **removes** the key, so a stale qualification cannot outlive the verdict it described. The authoritative copy is the paired metrics stamp row, where the close gate enforces a bijection against the verifier's registry-resolved provider. Deliberately **not** mirrored into `session-state.json`: that is the Work Explorer's surface, and operator decision P4 keeps orchestrator/verifier provenance out of it. |
| `uat` | object or omitted | conditional | Set 113 S1 — the UAT **accounting**, per component. See [§`uat` shape](#uat-shape) below. Replaces Set 111 S4's binary `status: "walked" \| "waived"`, which the operator retired on 2026-08-10; a block still carrying `status` is refused with a message naming the replacement. The `uat_walk_recorded` close gate reads it against the spec's `uatComponents` inventory — a declared component with no record does not close, while method `"none"` with an attestation **passes**. Omit-null on sets that declare no UAT. |
| `checklist` | object or omitted | conditional | Set 114 S1 — the **operator-attested waiver** for a step-checklist post that was missed. `{"status": "waived", "attestation": "..."}`; the attestation must be non-empty. A post window that has closed cannot be re-entered, so this is the only exit from the `checklist_posted` gate short of `--force` (which bypasses every *other* gate too). It never excuses a session that posted **nothing**, and it is omitted entirely by the overwhelming majority of sessions, which simply post on cadence. |
| `cost` | object or omitted | omit-null | Set 130 S3 — what the session cost, by component, with a per-component status. See [§`cost` shape](#cost-shape) below. Produced by `python -m ai_router.seat_cost --session-set-dir <dir> --cost-block`; [`ai_router/docs/seat-cost.md`](../ai_router/docs/seat-cost.md) is canonical for the three measurements and for the rule this field encodes. Omitted when the session measured nothing — an absent field claims nothing, whereas a zero would claim a measurement. |

### <a id="uat-shape"></a>`uat` shape

**The gate demands an accounting, not a walk.** Set 111 S4 shipped a
binary `walked | waived`; the operator retired it on 2026-08-10 because a
flag that can always be bypassed — and always should be, to prevent
impasses — is not a requirement. The honest question is what **each
component** got and from whom, since a session touching five components
may legitimately have five different answers.

```json
"uat": {
  "attestation": "operator reviewed the accounting 2026-08-15",
  "components": [
    {
      "component": "Work Explorer tree",
      "method": "manual-walkthrough",
      "reviewers": [{ "type": "developer", "count": 1 }],
      "evidence": ["s4-uat-walk.md"],
      "findings": ["chapter markers drift about a second on the last step"]
    },
    {
      "component": "Static walkthrough index",
      "method": "none",
      "attestation": "no reviewer available before the release; low risk"
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `attestation` | always | Non-empty. What the operator said about the accounting as a whole. |
| `components` | always | One record per component the spec declares in `uatComponents`. `[]` only when that inventory is explicitly `[]`. |
| `components[].component` | always | Must name a component from the spec's inventory. Coverage is the close gate's check; shape is the validator's. |
| `components[].method` | always | `watched`, `watched-and-partially-repeated`, `manual-walkthrough`, `systematic-exploration`, `none`, `not-applicable`. |
| `components[].reviewers` | conditional | Required and non-empty for a performed method; forbidden for `none` / `not-applicable`. Each entry is `{"type", "count"}`, `count` being **distinct humans, not sittings**. |
| `components[].attestation` | conditional | Required for `none` / `not-applicable`: why that was the right answer. |
| `components[].evidence` | optional | List of strings. Path-shaped entries are checked for existence on disk; URLs and free-text locations (SharePoint, Teams) are not. |
| `components[].findings` | optional | List of strings — what the review turned up. |

**Two closed vocabularies, both closed on purpose.**

- **Reviewer types** are `developer` and `business-user` only. Consult
  round 3 refused to reserve an `ai-agent` type — *"it bakes in the
  category error the operator has already avoided"* — and spec decision 9
  says agent-driven exploration must never count as a human reviewer. A
  closed enum is the only form of that rule a schema can enforce.
- **Component keys** are exactly the six above. An open shape is how
  `confidence: 0.8` or `debt: "high"` gets in later without anyone
  deciding to add it, and a self-assessed score is the one thing all
  three consult rounds and the operator agreed to keep out. Risk is what
  the facts *imply*, not a number someone types. There is no parallel
  debt ledger either.

**`none` and `not-applicable` PASS.** Nothing blocks on how much UAT was
done. The one thing the gate refuses is an in-scope component with **no
answer at all**, because silence is how UAT evaporated in the first
place. `none` means review was possible and nobody did it;
`not-applicable` means review would have bought nothing here.

**Migrating from the Set 111 shape.** A former `walked` becomes a
component record with the performed method and its reviewers, with the
old `walkArtifact` moved into `evidence`. A former `waived` becomes
`method: "none"` with the waiver text as that component's `attestation`.

### <a id="cost-shape"></a>`cost` shape

There is no single "the cost of a session". There are three measurements
(`orchestrator_seat`, `routed_seat`, `routed_api`), they are paid to
different places, and **a report must say which one it is showing and name
the components it could not measure**. This field makes that structural
rather than advisory.

```json
"cost": {
  "measured_at": "close",
  "store_schema_version": 6,
  "components": [
    {
      "component": "orchestrator_seat",
      "status": "lower_bound",
      "credits": 735.3,
      "usd": 7.353,
      "event_count": 64,
      "session_ids": ["8c80156b-..."],
      "measured_session_ids": ["8c80156b-..."],
      "unmeasured_session_ids": [],
      "reason": "a conversation in this component is still in flight; its closing turns are not in the store yet, so this is a floor"
    },
    {
      "component": "routed_seat",
      "status": "unknown",
      "credits": null,
      "usd": null,
      "event_count": 0,
      "session_ids": [],
      "measured_session_ids": [],
      "unmeasured_session_ids": [],
      "reason": "no conversation ids supplied; nothing to measure (this is not zero)"
    }
  ],
  "total_status": "unknown",
  "total_credits": null,
  "total_usd": null,
  "unmeasured": ["routed_seat"]
}
```

| Key | Meaning |
|---|---|
| `measured_at` | `"close"` (the session measuring itself — always a floor) or `"retrospective"` (after the fact — exact). |
| `store_schema_version` | The local usage store's `schema_version` the number was read against, or `null`. The store **path** is deliberately not carried: it is an absolute path on one operator's machine, and this artifact is committed. |
| `components[].status` | One of `measured`, `lower_bound`, `unknown`, `unavailable`, `schema_unrecognized`, `not_applicable`. Closed vocabulary, sourced from `seat_cost.STATUSES`. |
| `components[].credits` / `usd` | The number, or `null`. |
| `total_*` / `unmeasured` | The total, when one legitimately exists, and the components that cost it when one does not. |

Three rules are enforced by **both** `validate_disposition` and the JSON
Schema (the parity contract in `project-guidance.md` → Code Style), so a
schema-validating consumer and the runtime path agree:

1. **An unmeasured component carries no number.** `credits` and `usd` are
   `null` for every non-numeric status. `0.0` beside `status: "unknown"`
   reads as a measurement and no reader can tell it from a real zero
   (L-112-1). The mirror also holds: a numeric status must carry a number.
2. **A report containing an unmeasured component has no total.**
   `total_credits` and `total_usd` are `null`. A total that quietly drops
   one reports unmeasured spend as zero — the same defect, one addition
   further along.
3. **An as-of-close figure cannot claim to be exact.** `measured_at:
   "close"` may not carry `total_status: "measured"`: the turns that author
   the disposition and run the close are not in the store while the session
   is closing. Set 118 Session 1 recorded 4,266.6 credits at close and
   measures 4,743.2 retrospectively — nothing was wrong except that it was
   early.

One further rule is validator-only, because JSON Schema draft 2020-12
cannot express it: **a component name may not appear twice.**

`close_session` prints the block (and, when it is absent, says so out loud —
"UNMEASURED, not zero"), and carries both in its `--json` output under
`cost` / `cost_note`.


### `status` values

| Value | Meaning |
|---|---|
| `"completed"` | Verification passed; the session's work is shippable as-is. The expected happy-path value. |
| `"failed"` | The session could not produce verifiable work (verifier returned ISSUES_FOUND with unresolvable Major/Critical findings, build broke, etc.). Set typically pauses; recovery is operator-mediated. |
| `"requires_review"` | Verifier returned an UNKNOWN-style finding the orchestrator disagrees with. Human adjudication required before set proceeds. See `ai-led-session-workflow.md` §"Disagreement With A Verifier Finding". |

### `verification_method` values

| Value | When to use |
|---|---|
| `"api"` | The verifier returned synchronously via the AI router's API call (the canonical path: `python -m ai_router.verify_session`). The verdict is already on disk by the time disposition is authored. The default. |
| `"manual-via-other-engine"` | The operator performed cross-provider verification out of band (a different AI assistant + the verification template) and recorded the verdict. Legal only when `ai_router/budget.yaml` declares the zero-budget tier; the verification-integrity gate (Set 083) enforces that declaration on any close claiming a verdict under this method. |
| `"skipped"` | Verification was skipped under the **operator-declared zero-budget tier only** (`ai_router/budget.yaml`, `threshold_usd: 0`, matching `verification_method`). The per-session Set 068 routed-gate SKIP shape is **retired** (Set 083): per-session cross-provider verification is mandatory, and the verification-integrity gate refuses any `"skipped"` close — with or without a verdict — that the zero-budget declaration does not cover. |

> **Retired / renamed tokens (Set 083).** `"queue"` (retired Set 026)
> and `"manual"` (renamed to `"manual-via-other-engine"`; the bare
> token was the 2026-07-06 live bypass incident's vector) fail
> disposition validation with a message naming the replacement.
> Historical closed-set artifacts carrying them at rest are unaffected —
> validation runs at close time on the active set.

### `next_orchestrator` shape

```json
{
  "engine": "claude-code",
  "provider": "anthropic",
  "model": "claude-opus-4-7",
  "effort": "high",
  "reason": {
    "code": "continue-current-trajectory",
    "specifics": "Session 2 continues the UAT split designed in Session 1; same provider keeps continuity of architectural context."
  }
}
```

- `engine` / `provider` / `model` / `effort` — identify the
  recommended next orchestrator. Validated by
  `validate_next_orchestrator` in
  [`ai_router/session_state.py`](../ai_router/session_state.py).
- `reason.code` — one of:
  - `"continue-current-trajectory"` — keep the same orchestrator;
    no change of provider/model warranted.
  - `"switch-due-to-blocker"` — current orchestrator hit a
    blocker (capability, context exhaustion, model-specific
    failure mode). **`blockers` must be non-empty.**
  - `"switch-due-to-cost"` — switching to a cheaper or more
    appropriate provider for the next session's work.
  - `"other"` — any other rationale; explain in `specifics`.
- `reason.specifics` — free-form prose, **≥ 30 characters**. The
  validator rejects one-word boilerplate ("n/a", "tbd") so the
  ledger always has a real sentence.

---

## Invariants the gate enforces

The close-out gate validates these three relationships:

1. **`verification_method` ↔ `verification_message_ids` pairing.**
   - `verification_method == "api"` ⇒ `verification_message_ids`
     must be empty. (The `"queue"` non-empty rule died with the queue
     path in Set 026; the token itself is now rejected outright.)
2. **`status == "completed"` AND not final session ⇒
   `next_orchestrator` required.** The set's next session needs a
   pickup point; an absent `next_orchestrator` on a mid-set
   completion is a structural bug.
3. **`switch-due-to-blocker` ⇒ non-empty `blockers`.** If the
   reason for switching is a blocker, the ledger must record what
   the blocker was.

`cost`, when present, additionally satisfies the three rules in
[§`cost` shape](#cost-shape). It is **not** gated: nothing refuses a close
for its absence (this set measures; it does not budget). The close output
names the absence instead.

---

## Minimal viable template

The common case: outsource-first verification (synchronous API),
status completed, mid-set continuation.

```json
{
  "status": "completed",
  "summary": "Session N: <one-sentence description of what landed>.",
  "verification_method": "api",
  "files_changed": [
    "path/to/file1.py",
    "path/to/file2.md"
  ],
  "verification_message_ids": [],
  "next_orchestrator": {
    "engine": "claude-code",
    "provider": "anthropic",
    "model": "claude-opus-4-7",
    "effort": "high",
    "reason": {
      "code": "continue-current-trajectory",
      "specifics": "Session N+1 continues the same effort; no provider switch warranted."
    }
  },
  "blockers": []
}
```

Substitute the actual file paths, the actual session number, the
actual continuation rationale (≥ 30 chars of `specifics`), and an
accurate `next_orchestrator` recommendation.

---

## Common variations

### Zero-budget skip (operator-declared, the only legal skip)

> **Retired shape (Set 083):** the per-session routed-gate SKIP variation
> that used to live here (Set 068 DEMOTE; `"skipped"` + null verdict on the
> gate's say-so) is no longer legal — per-session cross-provider
> verification is mandatory, and the verification-integrity
> gate refuses a null-verdict close. `"skipped"` is now legal **only** when
> `ai_router/budget.yaml` declares the zero-budget tier (`threshold_usd: 0`
> with a matching `verification_method`) — an operator declaration, never a
> per-session choice:

```json
{
  "status": "completed",
  "summary": "Session N: <description>. Zero-budget tier declared in ai_router/budget.yaml; verification per that declaration.",
  "verification_method": "skipped",
  "files_changed": ["..."],
  "verification_message_ids": [],
  "next_orchestrator": { "...": "..." },
  "blockers": []
}
```

(The queue-mediated "outsource-last" variation that used to live here
was retired with the queue path in Set 026; `"queue"` is now rejected
at validation.)

### Final session of the set

```json
{
  "status": "completed",
  "summary": "Set <slug>: final session. <one-sentence summary of the set's end state>.",
  "verification_method": "api",
  "files_changed": ["..."],
  "verification_message_ids": [],
  "next_orchestrator": null,
  "blockers": []
}
```

`next_orchestrator: null` is valid here because there is no next
session in this set. Cross-set continuation is a separate
mechanism (the parent or sibling set's spec / `ai-assignment.md`).

### Session blocked, switching orchestrator

```json
{
  "status": "completed",
  "summary": "Session N: partial work landed; remaining scope blocked by <X>. Switching orchestrator for Session N+1.",
  "verification_method": "api",
  "files_changed": ["..."],
  "verification_message_ids": [],
  "next_orchestrator": {
    "engine": "codex",
    "provider": "openai",
    "model": "gpt-5-4-medium",
    "effort": "high",
    "reason": {
      "code": "switch-due-to-blocker",
      "specifics": "Current orchestrator's context budget is exhausted on this surface; fresh-eyes orchestrator with broader code context will fare better on the remaining decomposition work."
    }
  },
  "blockers": [
    "Current orchestrator hit context-budget limit on the cross-file refactor surface; remaining work requires a fresh-eyes pass."
  ]
}
```

`status: "completed"` here means *the session itself* completed —
landed verifiable partial work. The blocker is on what comes
*next*, not on what the session produced.

---

## <a id="force-is-not-a-substitute"></a>`--force` is not a substitute

`python -m ai_router.close_session --force` exists for **incident
recovery only**. It bypasses the entire gate (including the
disposition-present check), emits a `closeout_force_used` event
into the session-events ledger with the operator's narrative
reason, and writes `forceClosed: true` into `session-state.json`
so a forensic walk can grep for the bypass.

Reaching for `--force` to skip writing a disposition dilutes the
audit signal `--force` is supposed to carry. Routine close-outs
must author `disposition.json`. The full `--force` contract lives
at [`ai_router/docs/close-out.md`](../ai_router/docs/close-out.md)
§Section 5.

---

## Cross-references

- [`docs/ai-led-session-workflow.md`](ai-led-session-workflow.md) §Step 8 — where in the workflow the disposition is authored.
- [`ai_router/disposition.py`](../ai_router/disposition.py) — the `Disposition` dataclass and `validate_disposition` (authoritative).
- [`ai_router/docs/seat-cost.md`](../ai_router/docs/seat-cost.md) — the three cost measurements, the rule `cost` encodes, and how to produce the block.
- [`ai_router/session_state.py`](../ai_router/session_state.py) — `NextOrchestrator`, `NextOrchestratorReason`, `validate_next_orchestrator`, `NEXT_ORCHESTRATOR_REASON_CODES`.
- [`ai_router/close_session.py`](../ai_router/close_session.py) — the gate that validates presence (`run_gate_checks` → `disposition_present`).
- [`ai_router/docs/close-out.md`](../ai_router/docs/close-out.md) — the close-out CLI reference, `--force` contract, and operational recipes.
