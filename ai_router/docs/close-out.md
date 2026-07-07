# `close_session` — Close-Out Reference

Canonical operational reference for the close-out script. This is the
single source of truth: `python -m ai_router.close_session --help`
echoes Section 2 of this document verbatim, and Step 8 of
`docs/ai-led-session-workflow.md` collapses to one paragraph that
points here.

Contents:

- [Section 0 — Session-boundary writes (start and close)](#section-0--session-boundary-writes-start-and-close)
- [Section 1 — When close-out runs](#section-1--when-close-out-runs)
- [Section 2 — How to run close-out](#section-2--how-to-run-close-out)
- [Section 3 — What the script does](#section-3--what-the-script-does)
- [Section 4 — Common failures and remediation](#section-4--common-failures-and-remediation)
- [Section 5 — Manual close-out flags](#section-5--manual-close-out-flags)
- [Section 6 — The sanctioned local-only close path](#section-6--the-sanctioned-local-only-close-path)
- [Section 7 — Troubleshooting](#section-7--troubleshooting)

---

## Section 0 — Session-boundary writes (start and close)

Set 022 made `close_session` half of a symmetric pair. Every session
in a Full-tier set has exactly two router-driven boundary writes:
`start_session` at the beginning, `close_session` at the end. Both
share `compute_effective_completed_sessions(session_set_dir)` from
`ai_router.session_state` as the single source of truth for "how many
sessions are closed," so the two writers cannot disagree about the
set's current shape.

### Why two writers

The Session Set Explorer extension reads `session-state.json` and
`session-events.jsonl` and surfaces the result as a fraction
(`1/4`, `2/4`, `4/4 Done`) plus an "in flight" annotation
(`· session 2 in flight`) on the row. For this UI to track reality,
two transitions must land **on disk** at the right moment:

- **Set first becomes active**, or a between-sessions set's next
  session begins — the moment `start_session` runs.
- **Set advances its fraction**, or hits Done — the moment
  `close_session` returns success.

Before Set 022, the start side was a Python call (`register_session_start`)
embedded inside the orchestrator's automation script, and the close
side already had this contract. Promoting the start side to a CLI
makes the protocol uniform across engines (any orchestrator can
shell out, even if it can't import `ai_router`) and gives the
v0.13.11 defensive guards a writer-side mate so they only ever
have to recover, never prevent.

### Field-by-field protocol

**At session start** (`python -m ai_router.start_session` — see
[`ai_router/start_session.py`](../start_session.py)):

| Field                  | Value at start                                       |
|------------------------|------------------------------------------------------|
| `currentSession`       | inferred via `compute_effective_completed_sessions`  |
| `status`               | `"in-progress"`                                      |
| `lifecycleState`       | `"work_in_progress"`                                 |
| `startedAt`            | now (only if previously null)                        |
| `completedAt`          | null (cleared if was set)                            |
| `verificationVerdict`  | null (cleared if was set)                            |
| `completedSessions[]`  | preserved (or backfilled from events on legacy sets) |
| `orchestrator`         | refreshed for this session                           |
| Events ledger          | append exactly one `work_started` (deduped)          |
| Activity log           | nothing — first real step adds the first entry       |

**At session close** (`python -m ai_router.close_session`, this doc):

| Field                  | Non-final close                              | Final close                                  |
|------------------------|----------------------------------------------|----------------------------------------------|
| `completedSessions[]`  | append `currentSession` (sorted, unique)     | append `currentSession` (sorted, unique)     |
| `currentSession`       | unchanged (= just-closed session)            | unchanged (= `totalSessions`)                |
| `status`               | `"in-progress"`                              | `"complete"`                                 |
| `lifecycleState`       | `"work_in_progress"`                         | `"closed"`                                   |
| `completedAt`          | unchanged (null)                             | now                                          |
| `verificationVerdict`  | `resolve_close_verdict()`: explicit `disposition.verification_verdict` first; else api-status-derived fallback for `api` method; else `null` | same |
| `orchestrator`         | preserved (Set 049 — historical attribution; no longer cleared at close) | preserved |
| Events ledger          | `closeout_requested` + `closeout_succeeded`  | `closeout_requested` + `closeout_succeeded`  |

The `closeout_succeeded` event payload (Set 036 Q4 audit-trail
extension) carries the holder identity that was just released —
`chatSessionId`, `engine`, `provider`, and `model` — snapshotted
from the orchestrator block before the block-clear runs. Legacy
state files with no orchestrator block degrade gracefully: the
payload omits the four identity fields rather than emitting
empty-string values, so a forensic walk of the events ledger can
tell "pre-Set-036 close" from "Set-036+ close with no chat ID
recorded" (the latter emits `chatSessionId: null`). See
[`docs/session-state-schema.md`](../../docs/session-state-schema.md)
"Check-out / check-in (Set 033)" for the chatSessionId source-of-
truth contract.

Final-session detection uses
`len(completedSessions) == totalSessions` post-append; `change-log.md`
presence remains a belt-and-suspenders signal so a drift case in
either direction is caught.

### Idempotency

Both writers are idempotent and safe to re-run:

- `start_session` re-running for the in-flight session is a no-op.
  The event ledger dedupes `work_started`; the snapshot fields are
  already correct. Re-running asking for a different session number
  exits 3 (boundary violation) — close the in-flight one first.
- `close_session` re-running on an already-closed session exits 0
  with `result: "noop_already_closed"` (see Section 3 step 4).

### Tier symmetry

The protocol applies tier-symmetrically: Full-tier projects use the
two CLIs; Lightweight-tier projects hand-write the same fields. See
[`docs/session-state-schema.md`](../../docs/session-state-schema.md)
for the canonical field list and worked examples, and Step 1 of
[`docs/ai-led-session-workflow.md`](../../docs/ai-led-session-workflow.md)
for the orchestrator-facing pseudo-code.

---

## Section 1 — When close-out runs

Close-out is the **sole synchronization barrier** between session work
and the session being marked complete. It runs once per session, after
all of the following are true:

1. The session's work agent has produced a `disposition.json` whose
   `status` field is `"completed"` (see
   [`docs/disposition-schema.md`](../../docs/disposition-schema.md)
   for the full schema, field-level invariants, and a copy-paste
   template).
2. End-of-session verification (Step 6) has returned a verdict
   (`VERIFIED` or `ISSUES_FOUND`), and any ISSUES_FOUND retries are
   exhausted.
3. **The orchestrator (or its fresh close-out turn — see Set 006
   Session 2) has already committed and pushed the session's work.**
   See "Ownership of commit / push / notification" below for why this
   is a precondition rather than something close-out does itself.

If any of these is not true, close-out refuses to run and emits a gate
failure with concrete remediation instead of producing a half-closed
session. The script is idempotent: running it twice on a session that
is already `complete` exits 0 with `result: "noop_already_closed"` and
no events emitted.

The orchestration layer invokes close-out as a fresh routed turn after
work verification terminates, so the close-out agent encounters
`ai_router/docs/close-out.md` (this file) at the moment the instructions
are needed — which sidesteps the GPT-5.4-flagged risk that collapsing
Step 8 in the workflow doc could lower agent compliance.

### Ownership of commit / push / notification

Close-out's responsibilities are deliberately narrow:

- Lifecycle gate checks (`gate_checks.GATE_CHECKS`), including the Set 083
  verification-integrity gate that corroborates claimed verdicts
- Verification-result inspection from `disposition.json` (`api`,
  `manual-via-other-engine`, or `skipped`; `--manual-verify` is the attested
  operator override)
- Idempotent state writes (`mark_session_complete`, ledger events,
  `change-log.md` and the next-orchestrator recommendation in
  `ai-assignment.md`)

Close-out **does not** run `git commit`, `git push`, or
`send_session_complete_notification`. Those are the
**orchestrator's** (or the fresh close-out turn agent's)
responsibility, and they straddle the close-out call:

- **`git commit` and `git push`** run **before** invoking
  `close_session`. The boundary is enforced by
  `gate_checks.check_pushed_to_remote`: a session whose work was not
  pushed fails the gate at Section 3 step 7 and never reaches the
  state flip — so the gate guarantees the precondition rather than
  performing it.
- **`send_session_complete_notification(...)`** (from
  `ai_router/notifications.py`) runs **after** `close_session`
  returns `succeeded`. Firing it before close-out succeeds would
  notify the human about a session that may still gate-fail; firing
  it from inside `close_session` would re-introduce the
  side-effect-as-state-flip coupling that GPT-5.4 flagged in the
  original proposal review (§5 of
  `docs/proposals/2026-04-30-combined-design-alignment-audit.md`,
  drift item D-3).

This is a deliberate revision to the original close-out reliability
proposal (`docs/proposals/2026-04-29-session-close-out-reliability.md`
§3, items 4 and 6), which named close-out as the holder of commit,
push, and notification. The revision is documented in that proposal's
post-implementation revision section. Future audits should treat the
revised contract — close-out owns the gate; the caller owns the side
effects — as canonical.

---

## Section 2 — How to run close-out

```
python -m ai_router.close_session [--session-set-dir PATH] [options]
```

Default invocation:

```bash
.venv/Scripts/python.exe -m ai_router.close_session \
    --session-set-dir docs/session-sets/<slug>
```

Exit codes:

- `0` — close-out succeeded (gates passed; verifications terminal),
  or the session was already closed (idempotent no-op).
- `1` — gate failure (one or more deterministic gates rejected).
- `2` — invalid invocation (incompatible flags; missing
  `disposition.json` outside `--force` / `--repair`).
- `3` — lock contention (another close-out is running on the same
  session set).
- `4` — timeout waiting on a verification path that still uses the legacy
  wait loop.
- `5` — repair drift detected and not applied (`--repair` without
  `--apply`).

JSON output (`--json`) shape — stable across exit codes so callers
parse it without branching on success:

```json
{
  "result": "succeeded | noop_already_closed | gate_failed | invalid_invocation | lock_contention | verification_timeout | repair_drift",
  "exit_code": 0,
  "session_set_dir": "<absolute path>",
  "session_number": 3,
  "messages": ["<human-readable line>", "..."],
  "gate_results": [
    {"check": "<name>", "passed": true, "remediation": ""}
  ],
  "verification": {
    "method": "api | manual | manual-via-other-engine | skipped",
    "message_ids": ["<id>"],
    "wait_outcome": "completed | failed | timed_out"
  },
  "events_emitted": ["closeout_requested", "closeout_succeeded"]
}
```

Flag summary:

| Flag | Purpose |
|---|---|
| `--session-set-dir PATH` | Path to the session set directory. Defaults to active session set in CWD. |
| `--json` | Emit a single JSON object on stdout instead of human-readable lines. |
| `--interactive` | Opt in to interactive prompts. Default is non-interactive — never blocks on stdin. |
| `--force` | Bypass bookkeeping gate checks, but **not** verification integrity. **Hard-scoped to incident recovery only**: requires `AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1` in the environment AND `--reason-file`. Emits `closeout_force_used` to the events ledger and writes `forceClosed: true` to `session-state.json`. See Section 5. |
| `--allow-empty-commit` | Permit close-out for a session that produced no commits. |
| `--reason-file PATH` | File containing narrative fields (close-out reason, manual-verify attestation). |
| `--manual-verify` | Attested operator override for the verification-evidence layer. Requires `--interactive` or `--reason-file`. Method vocabulary is still enforced; illegal disposition tokens still fail. |
| `--repair` | Diagnostic mode: walk the session set's state and report drift. |
| `--apply` | When combined with `--repair`, apply corrections to detected drift. |
| `--timeout MINUTES` | Maximum minutes for legacy verification wait loops (default 60). The canonical `verify_session` path is synchronous before close-out. |

Flag combination rules (validated up front; failure exits 2):

- `--force` is bypass-everything; it is incompatible with
  `--interactive`, `--manual-verify`, and `--repair`. Pick one bypass
  at a time so the audit trail stays unambiguous.
- **`--force` is hard-scoped to incident recovery** (Set 9 Session 3,
  D-2). On top of the compatibility rules above, two additional gates
  fire: the environment must export `AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1`,
  AND a `--reason-file` must be supplied with a non-empty narrative.
  Both rejections exit 2 before any state is touched. See Section 5.
- `--apply` requires `--repair`. Using it alone is almost certainly a
  typo and fails loudly.
- `--manual-verify` requires either `--interactive` or `--reason-file`.
  An operator who genuinely has nothing to say can put a one-line
  reason in a file; silent bypass is refused so the audit trail stays
  honest.
- `--timeout` must be positive.

Orchestrator attribution (post-Set-049). On every successful close,
`close_session` **preserves** the `orchestrator` block on the
per-session `sessions[N]` record as historical attribution — it is no
longer cleared. The Set 033 check-in / check-out layer was fully
retired in Set 049 (hard-coordination removal). Any holder can claim
the next session via `start_session` without `--force`; there is no
block-level exclusion on top of the within-set sequential enforcement.
See
[`docs/session-state-schema.md`](../../docs/session-state-schema.md)
"Orchestrator identity and concurrency (post-Set-049)" for the
current contract.

---

## Section 3 — What the script does

Close-out runs in this order. Each phase is fail-fast: a phase that
rejects emits its `closeout_failed` event with a remediation string and
returns the corresponding exit code without touching downstream state.

1. **Parse and validate args.** Combination rules above. Failure → 2.
2. **Resolve session-set directory** — explicit `--session-set-dir`,
   else discover from CWD via `find_active_session_set`.
3. **Acquire lifecycle lock** via `ai_router.close_lock.acquire_lock`
   (or the `close_session_lock` context-manager helper that wraps it).
   The lock dual-acquires `<session-set-dir>/.lifecycle.lock` (the
   Set 036 canonical name) **and** `<session-set-dir>/.close_session.lock`
   (legacy-interop mutex honored for one release per the R1
   migration contract). Both files carry `pid`, `worker_id`, and
   `acquired_at`. A stale lock on either path (dead PID, or
   acquired more than the stale-window ago) is reaped automatically.
   A live lock fails closed with exit 3.

   Both `start_session` and `close_session` now acquire the same
   lock (Set 036 Q5 — hybrid migration safety): `start_session` polls
   for up to 30s before giving up with `EXIT_LOCK_CONTENTION=5`;
   `close_session` keeps its existing immediate-failure contract
   (exit 3) so a stuck close-out surfaces fast rather than blocking
   under the same poll window.
4. **Idempotency check.** Read `session-state.json` (see
   [`docs/session-state-schema.md`](../../docs/session-state-schema.md)
   for the full schema, canonical status values, and the alias map
   applied at the read boundary). If the current session's lifecycle
   state is already `complete`, exit 0 with `noop_already_closed` —
   emit nothing, write nothing, release the lock cleanly.
5. **Read `disposition.json`** (`ai_router.disposition.read_disposition`).
   Must exist with `status: "completed"`. Missing or non-`completed`
   → gate failure unless `--force` or `--repair` is set.
6. **Emit `closeout_requested`** to `session-events.jsonl`.
6b. **The close backstop** (Set 084 — the structural move; implemented
    in `ai_router/close_backstop.py`, wired here before the gate
    chain). On a Full-tier close with **no valid stamped verification
    evidence** for the session, `close_session` does not merely refuse
    — it **runs the verification itself**, in-process, through the
    same machinery the `verify_session` CLI uses: the same evidence
    assembly (diffed against the last commit **before the session's
    `startedAt`**, since the caller has already committed and pushed),
    the same canonical adversarial template, the same registry-resolved
    orchestrator-provider exclusion (F1/F2), the same raw
    `sN-verification*.md` / `sN-issues*.json` artifacts, the same
    disposition patch, and a metrics row stamped
    `source: "close_session_backstop"` (F3). Then:
    - **VERIFIED / Minor-only** → the close proceeds; the fresh stamped
      row satisfies the evidence gate below. The backstop's own
      artifacts are close-out bookkeeping written mid-close (the
      `session-events.jsonl` precedent): the working-tree gate
      tolerates them for this one close and the operator commits them
      in the close-out commit. The verification cost is printed.
    - **Blocking ISSUES_FOUND** → the close is refused with the
      findings (`gate_failed`, `failed_checks:
      ["verification_backstop"]`); the disposition now records the
      TRUE verdict. Remediate, then re-verify with `verify_session`
      (the sanctioned remediation loop) and close again.
    - **`verification_unavailable`** (the exclusion leaves no
      different-provider verifier) or a **double transport failure**
      (the two-attempt ladder is preserved) → the close BLOCKS
      explicitly — never a pass. The only sanctioned resolution for
      the unavailable state is the operator-attested `--manual-verify`
      path.
    Scope and skips: `verify_session` **pre-empts** the backstop (valid
    stamped evidence with a `VERIFIED` — or Minor-only-settled
    `ISSUES_FOUND` — claim stands it down); the operator-declared
    zero-budget tier (`ai_router/budget.yaml`, `threshold_usd: 0`)
    keeps its existing manual/attested flow with no metered call;
    `--manual-verify` is the attested bypass; `--force` triggers **no**
    metered call and still cannot pass unverified (the
    verification-integrity check below refuses); Lightweight closes
    keep their own per-set gates; an illegal `verification_method`
    token skips the backstop because the vocabulary gate refuses that
    close anyway. The backstop runs inside the close lock and is
    idempotent: a re-run after a backstop-verified close finds the
    stamped evidence and skips.
7. **Run deterministic gate checks** (`ai_router.gate_checks`):
   - `check_working_tree_clean` — `git status` is clean (or only
     ignored patterns remain). Catches "agent forgot to commit".
   - `check_pushed_to_remote` — local HEAD has been pushed to the
     remote tracking branch. Catches "committed but never pushed".
   - `check_activity_log_entry` — the current session has an
     `activity-log.json` entry whose `session_number` matches.
   - `check_next_orchestrator_present` — every session except the
     last has a routed next-orchestrator recommendation. Catches
     drift from the workflow's "always route, never self-opine" rule.
   - `check_change_log_fresh` — last-session-only: the change log was
     updated in the same commit window (timestamp within tolerance).
   - `check_verification_method_vocabulary` / `check_verification_integrity`
     — Set 083: `verification_method` must be a legal disposition token
     (`api`, `manual-via-other-engine`, `skipped`), and per-session
     cross-provider verification is **mandatory** on every Full-tier close
     (the Set 068 routed-gate SKIP path is retired; a null-verdict close no
     longer passes). On `api`, close-out requires a non-null verdict backed
     by both a cross-provider `session-verification` row in
     `router-metrics.jsonl` for this set/session and a root
     `sN-verification*.md` artifact — and, Set 084 (F3), the row must
     carry a **valid evidence stamp** (sanctioned `source`
     — `verify_session_cli` or `close_session_backstop` — evidence
     hash, canonical-template id + normalized hash, verifier-model
     consistency, the applied orchestrator-provider exclusion, artifact
     path + byte-exact content hash, package version; any missing or
     inconsistent field fails closed). A bare `route()` row no longer
     corroborates a close. The stamp is **drift/affordance control,
     not cryptography** — it raises the floor from "lazy shortcut" to
     "deliberate multi-artifact forgery" and must never be described
     as tamper-proof. On `manual-via-other-engine` or
     `skipped` — with or without a claimed verdict — the project
     `ai_router/budget.yaml` must declare the zero-budget tier and the
     matching method (the operator-authorized exception; never an engine's
     own call). The refusal message names the exact venv-qualified
     `.venv/Scripts/python.exe -m ai_router.verify_session
     --session-set-dir ...` remediation.
   Each gate returns `(passed: bool, remediation: str)`. The first
   failing gate stops the phase; the script emits `closeout_failed`
   with the remediation and exits 1.
7b. **Content-aware close-out gates** (run after the deterministic gates,
    before the state flip; each fires only on the **set-terminal** close
    and never on a non-terminal work-session close):
   - **External-verification soft gate** (Set 048 §3.5) — `--no-router`
     mode only; warns when `external-verification.md` is missing.
   - **Dedicated-verification gate** (Set 057 Q6) — fires when the durable
     `verificationMode == dedicated-sessions` (**Lightweight only**);
     confirms a different-engine verification session ran.
   - **Path-aware-critique gate** (Set 066) — **tier-orthogonal** (Full
     *and* Lightweight). Fires when the durable `pathAwareCritique` record
     (an `activity-log.json` entry written once at set start; default
     `none`) is `advisory` or `required`. It confirms a valid
     **multi-provider** `path-aware-critique.json` artifact exists at the
     session-set root (`>=2` distinct providers, each content-non-trivial;
     validated by `ai_router.path_aware_critique`). Fail posture:
     `required` **hard-blocks** in an interactive TTY (`gate_failed` +
     `closeout_failed`, `failed_checks: ["path_aware_critique_gate"]`) and
     **soft-warns** in non-TTY / headless / under `--accept-suggestions`;
     `advisory` **always soft-warns** and never blocks; `none` skips. The
     wiring is **net-new** on the Full-tier close path — the
     dedicated-verification gate above is Lightweight-only, so the
     attribute could not reuse it. Fail-open in the non-block direction:
     any internal error never wedges close-out.
   - **Contract-test / CDC gate** (Set 068 S5) — **tier-orthogonal**. Fires
     when the durable `contractGate` record (an `activity-log.json` entry
     written once at set start; default `none`) is `advisory` or `required`.
     It validates the saved `contract-floor-result.json` + `contract-manifest.json`
     at the set root: the floor command **ran and passed** in the disposable
     `run_test` cage, the result matches this set and the manifest, and **every
     probeable defect class names a covering test** (the non-probeable residual
     is reported as agent-reserved, never a failure; validated by
     `ai_router.contract_gate.validate_contract_gate`). The floor is **produced
     out-of-band** (`python -m ai_router.contract_gate run`) and only
     *validated* here, so close-out never runs a multi-minute suite. Fail
     posture mirrors the path-aware gate: `required` **hard-blocks** in an
     interactive TTY (`failed_checks: ["contract_gate"]`) and **soft-warns**
     headless / `--accept-suggestions`; `advisory` always soft-warns; `none`
     skips. Fail-open in the non-block direction.
8. **Resolve verification outcome**:
   - **API mode** — `verify_session` has already run synchronously and patched
     the disposition (or the Set 084 close backstop just produced the same
     evidence in-process at step 6b); the verification-integrity gate
     corroborates the stamped metrics row and artifact before state changes.
   - **Manual-via-other-engine / skipped** — legal only under the zero-budget
     declaration, with or without a claimed verdict (Set 083: a null-verdict
     Full-tier close is no longer legal outside that declaration).
   - **Manual override** (`--manual-verify`) — record the attestation text from
     stdin or `--reason-file` and proceed through the evidence layer. The
     disposition method vocabulary still runs, so the retired `"manual"` and
     `"queue"` tokens cannot be laundered by attestation.
9. **Idempotent writes.** Each of these is safe to retry:
   - `_flip_state_to_closed(session_set_dir, verification_verdict=verdict)` —
     flips `session-state.json` from `in-progress` to `complete`,
     records `completedAt` ISO timestamp and the resolved verdict.
     The verdict is resolved by `resolve_close_verdict()`: explicit
     `disposition.verification_verdict` wins first; for `api`-method
     dispositions without an explicit field, status derives the fallback
     (`completed`→`"VERIFIED"`, `failed`/`requires_review`→`"ISSUES_FOUND"`);
     otherwise `null` (manual / skipped / `--no-router` / missing
     disposition). The `orchestrator` block is **preserved** on the
     per-session record as historical attribution (Set 049 — the check-in
     clear was retired when the hard-coordination layer was removed; the
     block is no longer cleared at session close).
   - Append the next-orchestrator recommendation to `ai-assignment.md`
     (every session except the last).
   - Last session only: write `change-log.md` and append the
     next-session-set recommendation.
10. **Emit `closeout_succeeded`** to `session-events.jsonl`,
    release the lock, exit 0.

The caller (orchestrator or fresh close-out turn agent) fires
`send_session_complete_notification(...)` from `ai_router/notifications.py`
**after** `close_session` returns `succeeded`. The script does not
perform the notification itself — see Section 1 "Ownership of commit
/ push / notification" for the rationale and `git` precondition.
Notification failure is non-fatal: the work is preserved in git
regardless and the human can re-fire the notification by hand if
needed.

The cost report (`print_cost_report(SESSION_SET)`) prints during
the close-out turn before step 9. It reads `router-metrics.jsonl` for
this session set and is dual-sourced (Set 4 Session 1) — both per-call
metrics and provider-side aggregation cross-check each other.

---

## Section 4 — Common failures and remediation

Close-out is designed so every failure mode produces a single concrete
remediation string in `messages` (and in `gate_results[].remediation`
for gate failures). The patterns below are the ones operators have
hit during Sets 1–5; new patterns should be added here as the failure
inventory grows.

**`No module named ai_router…` — wrong interpreter, NOT missing keys.**
This fails *before* any gate runs, so there is no `gate_results` entry —
just an import error on stderr. It almost always means close-out was
launched with a bare `python` that resolved to a system interpreter
without `ai_router` installed. A config-only `ai_router/` folder in the
cwd makes it worse: it shadows as an empty namespace package, so the
error names the submodule (`No module named ai_router.close_session`)
rather than the package. **Do not interpret this as "missing API keys"
and stop to ask the human** — the keys can be perfectly present.
Remediation: run close-out through the workspace venv interpreter
(`.venv/Scripts/python.exe -m ai_router.close_session …` on Windows,
`.venv/bin/python …` on POSIX), or `pip install dabbler-ai-router` into
the interpreter you are using. Only after the venv interpreter loads the
router will a genuine missing-key error (`Missing environment variable
DABBLER_ANTHROPIC_API_KEY ...`) be trustworthy.

**Uncommitted files in working tree** — `check_working_tree_clean`
fails with the list of dirty paths. The agent typically forgot to
`git add` a generated file, or a tool wrote to a temp file inside the
repo. Remediation: `git status` to see what's there, `git add` and
re-commit if intentional, `git restore` if scratch. Then re-run
close-out.

**Push rejected (non-fast-forward)** — `check_pushed_to_remote` shows
the local HEAD is ahead of `origin/<branch>` *and* a `git push`
attempt would be rejected. Remediation: `git fetch && git rebase
origin/<branch>` (or `git pull --rebase`), resolve conflicts if any,
push again, re-run close-out. Do not `--force` push to shared branches.

**Missing `nextOrchestrator` recommendation** —
`check_next_orchestrator_present` fails on a non-last session because
the orchestrator forgot to route the recommendation. Remediation: route
it now (`route(content=..., task_type="analysis")`), append to
`ai-assignment.md`, commit, push, re-run close-out. The check enforces
"always route, never self-opine"; do not satisfy it by hand-writing
the recommendation.

**Disposition file missing** — exit 2 with `invalid_invocation`. The
work agent never produced `disposition.json`, which usually means the
session crashed mid-step or the agent ran a partial close-out by
hand. Do not bypass with `--force` reflexively. Investigate first:
read `activity-log.json` to see how far the session got, decide
whether the work is genuinely complete, then either resume the session
(re-run) or run `--repair` to inspect drift.

**Stale lock** — exit 3 with `lock_contention`, but the lock holder
PID is dead. The lock file should be reaped automatically on the next
attempt; if it isn't (clock skew, exotic kill paths), inspect
`<session-set-dir>/.lifecycle.lock` (Set 036 rename — `.close_session.lock`
on legacy state still in flight) and remove it manually only after
confirming no other close-out is running.

**Manual-verify silent bypass refused** — exit 2 with the validation
message `"--manual-verify requires either --interactive ... or
--reason-file ..."`. By design: an operator who uses the attested
verification override must record *why* somewhere durable. Either add
`--interactive` (prompted on stdin) or write a one-line reason to a
file and pass `--reason-file <path>`.

**Verification-integrity gate failed** — exit 1 with a remediation that names
the venv-qualified `.venv/Scripts/python.exe -m ai_router.verify_session
--session-set-dir <set>` (POSIX: `.venv/bin/python …`). Common causes:
`disposition.verification_method` uses a retired token (`"manual"` or
`"queue"`), `verification_verdict` claims `VERIFIED` / `ISSUES_FOUND` without
the corresponding `sN-verification*.md` artifact, the metrics row is missing,
or the verifier provider matches the orchestrator provider. Remediation: run
the printed `verify_session` command, fix any blocking findings, commit and
push the resulting artifacts, then re-run close-out. If an operator truly
performed out-of-band review, use the legal `"manual-via-other-engine"` token
and ensure the project's `ai_router/budget.yaml` declares the zero-budget
manual path; otherwise use `--manual-verify` with a reason file for the
sanctioned attested override.

**Stranded check-out (Set 033 Session 6).** A session set whose
holder crashed, lost network, or abandoned the workstation BEFORE
running `close_session` ends up with an `orchestrator` block on
`session-state.json` that no live process is claiming. This is NOT a
close-out gate failure — `close_session` never even started — but it
shows up at the next `start_session` call from a different
orchestrator, which refuses with the H3 hard-coordination error
naming the now-stranded holder. The same recovery applies whether
the stranded composite differs from the would-be next holder on
`engine + provider` OR on just the `chatSessionId` (Set 036 Q1) —
a stale chatSessionId (e.g., a Claude chat that was force-killed
mid-session) blocks the slot just as a stranded `engine + provider`
does. Two recovery paths, both audit-trail preserving:

- **`start_session --force`** from the would-be next holder. The
  H3 refusal message itself names this path. The writer appends a
  single line to `~/.dabbler/orchestrator-writer.log` recording the
  prior holder, the new holder, an ISO timestamp, AND both
  composites' chatSessionIds (or `<no chat session ID recorded>`
  for legacy state); `checkedOutAt` is rewritten to now. Use this
  when the new holder is at the command line and ready to start
  the next session immediately. When the only difference is the
  chatSessionId and the would-be holder is on an interactive TTY,
  `start_session` also surfaces an inline Take Over / Read-Only /
  Cancel prompt before falling through to refusal — the CLI mirror
  of the extension's takeover modal (Set 036 Q3).
- **"Release Check-Out" Command Palette action** (extension v0.18.x
  onward). Wraps the same `--force` invocation with a confirmation
  prompt; appropriate when an operator is in VS Code and wants to
  release the check-out without immediately taking it. The block
  ends up `null` and the next `start_session` from any holder runs
  without `--force`.

If the holder who originally took the check-out comes back online
later, their `start_session` re-invocation on the same set is a
fresh check-out (the H4 identity check sees `null` and treats it as
an unheld set); no special "reclaim" path is needed.

---

## Section 5 — Manual close-out flags

Three flags exist for cases where the deterministic close-out path
cannot run. Each leaves a distinct, audit-able trail.

**`--interactive`** — opts in to stdin prompts. Without it, the
script never blocks on input; the orchestrator's automation path runs
in the default non-interactive mode. Use this when an operator is
running close-out from a terminal and wants to confirm sensitive
actions.

**`--force`** — bypass bookkeeping gate checks, but not the Set 083
verification-integrity check. **Hard-scoped to incident recovery only** (Set 9
Session 3, drift item D-2 in
`docs/proposals/2026-04-30-combined-design-alignment-audit.md`). The
flag is rejected by default; opting in requires both:

- **Environment gate.** Export `AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1` in
  the shell that runs `close_session`. A normal terminal session does
  not have this set, so an accidental `--force` invocation during
  day-to-day operation fails fast with a clear `invalid_invocation`
  message before any state is touched.
- **Reason file.** Pass `--reason-file <path>` to a non-empty
  narrative explaining the incident. The file's contents become the
  payload of the `closeout_force_used` event in
  `session-events.jsonl`, so a forensic walk of the ledger always
  answers "why was the gate bypassed?" without requiring a separate
  paper trail.

When both gates pass, close-out:

- emits a loud `WARNING` line to stderr (operator can't miss it,
  even in `--json` mode where stdout is JSON);
- appends a `closeout_force_used` event to `session-events.jsonl`
  with the reason as a payload field;
- writes `forceClosed: true` to `session-state.json` so the VS Code
  Session Set Explorer surfaces a `[FORCED]` description badge on
  the affected set's row.

The badge persists until the session set is restarted from scratch —
that's the point. A force-closed set stays visibly force-closed in
the explorer view so reviewers triaging incidents can spot it
immediately.

`mark_session_complete(force=True)` (the function-level entry point)
does not consult the env-var gate — it trusts callers (tests, the
repair path) to use `force=True` deliberately. The CLI's
`--force` is the operator-facing entry point and carries the gates;
the function-level path is for internal use only and is exercised by
`test_mark_session_complete_gate.py`.

**`--manual-verify`** — record a human attestation that verification happened
out of band and bypass only the verification-evidence layer. Requires
`--interactive` or `--reason-file` so the attestation lands in the audit trail.
The disposition method vocabulary is still enforced: `"manual"` remains an
illegal disposition token; use `"manual-via-other-engine"` for the zero-budget
manual path. Method `"manual"` is recorded only in close-out's JSON/event
output to mark that the operator override was used.

**`--repair`** — diagnostic mode. Walks the session set's state
(`session-state.json`, `activity-log.json`, `session-events.jsonl`,
`disposition.json`) and reports drift between them without touching
anything. Add `--apply` to actually fix detectable drift. `--repair`
without `--apply` exits 5 if drift is found, so it's safe to script as
a pre-flight check.

The drift shapes the walk detects:

1. **State-says-closed-but-no-closeout-event-for-`currentSession`.**
   `session-state.json` reports `lifecycleState: closed` (or v1
   `status: complete`) but `session-events.jsonl` has no
   `closeout_succeeded` event for the session number that state
   claims is closed. Two real-world variants both reduce to this
   check:
     - *Bootstrapping-window drift.* The old Step 8 path committed
       without emitting terminal lifecycle events at all.
     - *Mixed-mode drift.* Earlier sessions in the set ran through
       `close_session` (events ledger has their closeouts) but a
       later session was hand-authored directly — `session-state.json`
       was edited to `currentSession: N` / `status: complete`
       without anyone invoking `close_session` for session `N`, so
       no `closeout_succeeded` event for `N` exists. Until the
       extension's tree-view guard shipped in v0.13.11, this
       displayed as Done; the tracker now downgrades to In Progress,
       and `--repair --apply` will backfill the missing event.
   Repair: with `--apply`, append a synthetic `closeout_requested`
   (if missing) and `closeout_succeeded` for the claimed-closed
   session so the events ledger becomes internally consistent and
   the tree view stops downgrading. **Set 022 extension:** the
   apply path also backfills `completedSessions[]` in
   `session-state.json` using the events ledger directly (post-
   synthesis). **Set 023 refinement (`ai_router 0.2.4`):** the
   backfill is now the **union** of (a) the snapshot's existing
   `completedSessions[]` (sanitized — non-positive-int entries,
   booleans, and duplicates are dropped from the union math) and
   (b) the distinct `closeout_succeeded` session numbers in the
   now-repaired ledger. The union is **monotone-up only** —
   repair appends session numbers to bring the snapshot up to
   ledger reality but never removes a session number the operator
   hand-authored. Four apply outcomes are distinguished in the
   `messages` line:
     - *Backfilled* (snapshot's array was empty, absent, or
       null): the repair writes the events-ledger reconstruction
       in full — `repair applied: backfilled completedSessions=[...]`.
     - *Merged* (snapshot's array is a clean sorted-int list that
       differs from the union view): the repair writes the union
       and reports both sources — `repair applied: merged
       completedSessions=[...] (union of snapshot [...] and
       events [...])`.
     - *Normalized* (snapshot's array exists but has malformed,
       duplicate, or unsorted entries): the repair cleans the
       array while applying the union — `repair applied:
       normalized completedSessions=[...] (raw snapshot [...]
       cleaned + unioned with events [...])`. This branch ensures
       a typo like `[1, -1, 2]` does not survive a repair pass.
     - *Preserved* (snapshot's raw on-disk array already equals
       the canonical merged form): no snapshot rewrite happens;
       the message line reports `repair preserved
       completedSessions=[...] (snapshot already a superset of the
       events-ledger reconstruction)` so the operator sees the
       no-op explicitly.
   This eliminates the pre-Set-023 regression where a hand-migrated
   snapshot with `completedSessions: [1, 2, 3, 4]` would be
   overwritten back to a partial subset whenever the events ledger
   only recorded a later session's closeout (Set 004 on this repo
   hit this on 2026-05-15).

   **Attestation model (Set 023 Session 4 / Session 2 audit — GPT on
   (a)).** `completedSessions[]` is **operator-attested** for migrated
   sets (the operator hand-adds the array to encode their stated
   ground truth) and **tool-maintained** for sets that ran the
   close-out gate end-to-end (every `--apply` close-out writes the
   union). The repair preserves the operator's stated truth and uses
   the events ledger only to add what the operator missed; it never
   removes a session number the operator authored. Mirrors the
   sharpened invariant phrasing in `docs/session-state-schema.md`:
   `completedSessions[]` is authoritative for *whether* a session is
   closed; the events ledger is authoritative for *when* each
   closeout was recorded. The extension's `isMidSetComplete` guard
   (v0.13.13, Set 023 Session 4) consults the array as an
   alternative whether-closed signal to the ledger, so a migrated
   set displays correctly without needing both signals to agree.

2. **Closeout-succeeded-but-state-not-closed.** The reverse drift:
   events ledger says the session closed but `session-state.json`
   is still `work_in_progress` / `work_verified`. Repair: with
   `--apply`, call `_flip_state_to_closed` so the snapshot tracks
   the ledger.

3. **Stranded mid-closeout** (`closeout_requested` without a
   terminal companion). Reported only; recovery is the reconciler's
   job. `--repair` does not re-run the gate from inside itself.

---

## Section 6 — The sanctioned local-only close path

A repository that is **deliberately remote-less** — no git remote, by
operator decision, and never will have one — used to fail the
`check_pushed_to_remote` gate on every close, forcing the operator to
`--force` past it each session. That conflated a steady-state close with
incident recovery. The local-only marker fixes that: it is a **sanctioned,
non-incident** close path for a repo that has no actual problem.

**The marker.** A repo opts in by carrying a marker file at
`.dabbler/local-only` in its root (beside the extension's
`.dabbler/install-method`). Only the marker's *presence* matters —
`gate_checks.is_local_only(repo_root)` reads presence only and never parses
the contents.

**Behavior matrix** (a branch inside the existing missing-upstream case of
`check_pushed_to_remote` — not a new gate, and the `GATE_CHECKS` order and
`gate_results` JSON shape are unchanged):

- **Marker present AND no git remote configured** → the gate
  **passes-with-note**. The note (`local-only repo: push gate waived
  (.dabbler/local-only marker present, no remote configured)`) is surfaced in
  the passing gate's remediation slot, so the close-out audit trail records
  *why* the push gate passed without a push.
- **Marker present BUT a git remote exists** → the marker is **ignored**; the
  normal missing-upstream / ahead-of-upstream failures apply unchanged. The
  waiver can never mask a real "forgot to push to an existing remote" miss.
- **Marker absent** → behavior is **unchanged** in every case.

The other four gates (`working_tree_clean`, `activity_log_entry`,
`next_orchestrator_present`, `change_log_fresh`) still apply unchanged on a
local-only repo.

**Managing the marker.** The marker is just a file, so an operator *could*
create it by hand — but the blessed CLI removes the guesswork and records an
audit note inside the marker file on enable (an `enabled_at` timestamp, the
provenance, and an optional reason):

```bash
# Enable (idempotent; re-enable is a no-op that preserves the original note).
# --reason is recorded inside the marker for the audit trail.
.venv/Scripts/python.exe -m ai_router.local_only --enable --reason "<why>"

# Disable (idempotent).
.venv/Scripts/python.exe -m ai_router.local_only --disable

# Status: reports presence AND whether the waiver would actually fire
# (it warns when a git remote is configured, since the marker is ignored then).
.venv/Scripts/python.exe -m ai_router.local_only --status
```

`--repo-root PATH` targets a specific tree on any action; the default is the
git toplevel of the current directory (else the current directory).

**Contrast with `--force` (Section 5).** `--force` is hard-scoped to
**incident recovery** — it requires `AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1` plus a
`--reason-file`, bypasses **all** gates, and stamps `forceClosed: true` /
`[FORCED]` so the set stays visibly flagged. The local-only path is the
opposite: a steady-state configuration for a repo that is remote-less by
design. It affects **only** the `pushed_to_remote` gate, **only** when no
remote is configured, and leaves no incident badge. Reach for local-only — not
`--force` — when a repo is intentionally remote-less.

---

## Section 7 — Troubleshooting

**Stranded sessions.** A session is "stranded" when `session-state.json`
says `in-progress` but no further events have been written in a long
time and no daemon is processing it. The reconciler
(`ai_router.reconciler`, registered as a sweeper hook by
`register_sweeper_hook` at orchestrator startup — see Set 3 Session 3)
sweeps stranded sessions periodically and either re-attempts
close-out (if the session looks complete) or files a diagnostic
record (if it does not). To inspect manually:

```bash
.venv/Scripts/python.exe -m ai_router.reconciler --dry-run \
    --session-set docs/session-sets/<slug>
```

The reconciler emits `format_summary(...)` output describing what it
would do. If the dry-run looks right, drop `--dry-run` to apply.

**Lock contention without an obvious holder.** If `--repair` shows a
lock file but `pid_file_path` does not point to a live daemon,
something killed the previous close-out hard. Read the lock file:

```bash
cat docs/session-sets/<slug>/.lifecycle.lock
# Or, for legacy state still in flight (Set 036 rename window):
cat docs/session-sets/<slug>/.close_session.lock
```

The `acquired_at` field plus the stale-window constant in
`close_lock.py` tell you whether the lock should already have been
reaped. If the lock is genuinely stale and reaping is failing,
remove the file by hand — but only after confirming no other
close-out is running and no daemon process owns the PID.

**Reconciler behavior at orchestrator startup.** The reconciler's
sweeper hook runs once at orchestrator-role daemon startup and then
on a schedule. The startup pass catches sessions stranded across a
restart; the schedule catches sessions that strand mid-run. Both
re-use the same `_evaluate_one(session_set_dir, ...)` predicate so
the two paths cannot disagree about what "stranded" means.

**Mixed-mode drift (hand-authored session in a router-driven set).**
The supported tiers are Full (every session runs through
`close_session`; events ledger is authoritative) and Lightweight
(no router writer; the human or orchestrator hand-maintains
`session-state.json`). Mixing the two within a single set is **not
supported** but does happen in practice — earlier sessions run
through `close_session` and a later session (often a "quick bug
fix" or "wrap up" session) is authored directly:
`session-state.json` is edited to `currentSession: N` /
`status: "complete"` / `lifecycleState: "closed"`, possibly with a
hand-typed `completedAt`, but `session-events.jsonl` never gets a
`work_started` or `closeout_succeeded` event for session `N`.

Symptoms:

- The tree view shows the set as Done even though session `N`'s
  work didn't actually run through the gate. The extension's
  v0.13.11 guard downgrades the bucket to In Progress when it
  detects this exact shape (snapshot claims `complete` for the
  final session but the ledger has no closeout event for it).
- `--repair` walks emit a "state says closed but no closeout event
  for session N" drift message (drift case 1 in Section 5).
- The cost dashboard misses session `N`'s spend because the
  router never recorded the calls.

Telltale signs in the file itself: hand-typed timestamps with
six trailing zeros (`2026-05-12T15:20:00.000000-04:00`) — the
router's `_now_iso()` always emits microsecond precision. A real
router-written timestamp looks like
`2026-05-12T15:23:47.342195-04:00`.

Recovery:

- **If the work was actually done** and you just want the ledger
  to reflect it, run `python -m ai_router.close_session --repair
  --apply --session-set docs/session-sets/<slug>`. Drift case 1
  fires and appends synthetic `closeout_requested` +
  `closeout_succeeded` events for `currentSession`. The tree view
  recovers on next refresh. Optionally add a manual
  `completedSessions[]` array to `session-state.json` so
  consumers don't have to derive the count.
- **If the work was NOT done** (the state file was over-eagerly
  flipped to complete), roll the snapshot back by hand: set
  `status: "in-progress"`, `lifecycleState: "work_in_progress"`,
  clear `completedAt` and `verificationVerdict`. The set returns
  to In Progress and the work can resume through `close_session`
  normally.

Prevention: the orchestrator instruction file should either commit
the set to Lightweight tier (no router writes, no events ledger,
maintain `completedSessions[]` manually per
`docs/session-state-schema.md`) or Full tier (every session
through `close_session`). Don't switch mid-set.

**Cross-set parallelism on the same `(repo, branch)`.** The
per-set lifecycle lock at `<session-set-dir>/.lifecycle.lock` (Set 036
Q5 — renamed from `.close_session.lock`; both `start_session` and
`close_session` now acquire it) serializes **same-set lifecycle
re-entry** only. It does not scope to the `(repo, branch)` pair, so
two session sets pointing at the same branch can still race during
their work phase. The shipping operating model assumes parallel
sessions use distinct `session-set/<slug>` branches via the sibling-
worktrees-folder layout (see `docs/planning/repo-worktree-layout.md`),
which makes the cross-set-on-same-branch case rare; when it does
occur, the deterministic gate is the residual safety net rather than
admission-time exclusion.

Concretely, if two sets racing on the same branch both commit and one
pushes first, the loser's `git push` would be rejected non-fast-forward.
`check_pushed_to_remote` surfaces that rejection verbatim with a
`run: git pull --rebase` (or equivalent) remediation, and `close_session`
exits 1 (gate failure) without flipping the lifecycle state. The loser
rebases onto the winner's commit, re-pushes, and re-runs close-out.
The gate's rejection-and-remediation behavior on the loser of the
push race is exercised directly by
`TestScenario7CrossSetParallelRejection` in
`ai_router/tests/test_failure_injection.py`. The downstream
"`close_session` exits 1 without flipping lifecycle state" property is
not asserted by Scenario 7 itself — it is an established invariant of
the close-out flow already covered by the gate-failure tests in
`test_mark_session_complete_gate.py` and the close-out integration
tests; Scenario 7 proves the gate's response in the
specific cross-set push-race scenario.

If the parallel-on-same-branch pattern becomes routine rather than
incidental, reopen the question — a `(repo, branch)`-scoped advisory
lock acquired at session admission is a viable add-on (see drift item
D-1 in `docs/proposals/2026-04-30-combined-design-alignment-audit.md`
§5.2 for the original corrective options). The current contract
deliberately does not include one because the new failure mode it
introduces (a corrupt or stranded admission lock blocking all sessions
on a branch until the TTL elapses) is judged worse than the
rare-but-loud push race the gate already catches.
