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
| `verification_verdict` | string or omitted | recommended | **Should be set on the `api` verification path** to the verifier's pass/fail outcome: `"VERIFIED"` or `"ISSUES_FOUND"`. Set to the value returned by `parse_verification_response()` in Step 6 of the workflow. `close_session` reads this via `resolve_close_verdict()` (explicit field wins; api-path fallback derives from `status` for backward compat with pre-Set-054 dispositions; otherwise `null`). Normally omit (not `null`) on manual / skipped / `--no-router` paths — `close_session` records `verificationVerdict: null` in those cases. An explicit value on any path is still persisted verbatim. Non-canonical extension tokens are accepted but trigger a stderr warning. |

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
| `"skipped"` | Verification was skipped under the **operator-declared zero-budget tier only** (`ai_router/budget.yaml`, `threshold_usd: 0`, matching `verification_method`). The per-session Set 068 routed-gate SKIP shape is **retired** (Set 083): per-session cross-provider verification is mandatory on Full tier, and the verification-integrity gate refuses any `"skipped"` close — with or without a verdict — that the zero-budget declaration does not cover. |

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
> verification is mandatory on Full tier, and the verification-integrity
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
- [`ai_router/session_state.py`](../ai_router/session_state.py) — `NextOrchestrator`, `NextOrchestratorReason`, `validate_next_orchestrator`, `NEXT_ORCHESTRATOR_REASON_CODES`.
- [`ai_router/close_session.py`](../ai_router/close_session.py) — the gate that validates presence (`run_gate_checks` → `disposition_present`).
- [`ai_router/docs/close-out.md`](../ai_router/docs/close-out.md) — the close-out CLI reference, `--force` contract, and operational recipes.
