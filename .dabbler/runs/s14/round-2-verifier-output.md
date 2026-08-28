# ISSUES FOUND

## Issue 1: Existing set-based run journals become unreadable instead of being migrated

- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `ai_router/schemas/run-event.schema.json`, `ai_router/runcore.py`, `ai_router/runproject.py`
- **Failure scenario:** A repository that used the previous run-core version already has schema-version-1 `run.created` events containing `set_slug`, plus cancellation events containing `target` and `set_slug`. After upgrading, journal validation rejects those fields because the same schema version now has `additionalProperties: false` without them. Even if validation were bypassed, the fold has no mapping from legacy `(set_slug, session_number)` identities to repository-wide numbers. Existing run-core users necessarily have such events, making `status`, registration, and projection rebuilding fail on the normal upgrade path.
- **Acceptance criterion:** `JUDGMENT - A schema-version-1 journal containing legacy run.created and organization events with set_slug must remain readable or be deterministically migrated to repository-wide session identities, after which status and registration for the migrated sessions succeed.`
- **Details:**  
  **Violation:** The plan requires, “**Migrate this set's own state rather than abandoning it. Sessions 15 through 17 must register, verify and close under whatever this session builds.**” Instead, `run-event.schema.json` removes legacy fields without a schema-version transition or migration.  
  **Impact:** Existing durable run history bricks the converted run core, directly preventing continued operation after the collapse. This changes the merge decision because the migration requirement is the session’s explicit completion condition.  
  **Evidence:** `run-event.schema.json` removes `set_slug` and legacy organization fields while retaining the existing event shape/version and `additionalProperties: false`; `RunView` and `apply_event()` remove `set_slug`; `build_projection()` groups solely by the old local `session_number`. No compatibility reader or identity migration is present.

## Issue 2: The prior cancelled-session defect remains, with cancellation split across two independent authorities

- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `ai_router/runcli.py`, `ai_router/runproject.py`, `docs/run-core-blueprint.md`
- **Failure scenario:** An operator cancels abandoned session N through the lifecycle session CLI and then starts the next session. The unchanged lifecycle next-session calculation still selects N from completed sessions only and registration can rewrite it to `not-started`. Meanwhile, the new run-core cancellation path records cancellation only as an `organization.cancelled` journal event and consults only `runproject.organization_states()`, so it neither consumes nor preserves lifecycle cancellation in `docs/sessions/sessions.json`. Cancellation of abandoned work is an advertised normal operation, so users who invoke it are likely to hit inconsistent registration behavior.
- **Acceptance criterion:** `JUDGMENT - After session N is cancelled through the lifecycle CLI, lifecycle start selects N+1, run-core registration of N refuses it as cancelled, registration of later sessions does not alter N's cancelled state, and restoring N explicitly is the only operation that reopens it.`
- **Details:**  
  **Violation:** The new planning contract says, “**Numbers are never reused and never renumbered, including for cancelled sessions.**” The prior-round finding established that lifecycle registration rewrites cancelled sessions; this fix delta does not change that lifecycle start/registration path. It instead adds a separate cancellation authority in the run journal.  
  **Impact:** Operators cannot reliably skip abandoned sessions, and the two shipped CLIs can disagree about whether a session is cancelled. That materially breaks repository-wide session sequencing and the required migration into sessions 15–17.  
  **Evidence:** `cmd_organize_cancel()` appends only a run-journal event; `_require_session_open()` reads only `runproject.organization_states()`. The blueprint simultaneously states that lifecycle writers own `docs/sessions/sessions.json` and that the run core reads it for nothing. Thus neither cancellation authority synchronizes with the other, and no remediation of the previously identified lifecycle rewrite is present.

## Issue 3: Re-anchoring allows the author to omit part of the remediation from the next review

- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `ai_router/verify.py`, `ai_router/ledger.py`, `ai_router/affected.py`, `ai_router/schemas/baseline-reanchor.schema.json`
- **Failure scenario:** After transferring a session whose dangling completion tree is unavailable, remediation spans several commits. The operator supplies the newest commit immediately before `HEAD` as `--commit`. That commit is a strict ancestor and is therefore accepted, even if it already contains remediation made after the previous review. `effective_baseline()` then causes the next verification round to diff only from that late commit, omitting earlier remediation. Selecting the newest ancestor is a likely recovery choice because the command provides no binding to the previous reviewed point.
- **Acceptance criterion:** `JUDGMENT - Re-anchoring must reject any commit that may postdate the prior round's reviewed completion, and the next round must conservatively include every change that could have occurred since that completion rather than accepting an arbitrary strict ancestor of HEAD.`
- **Details:**  
  **Violation:** `run_reanchor()` claims its checks ensure re-anchoring “**cannot become a way to choose one's own review scope**.” The implementation verifies only that the commit differs from `HEAD` and is an ancestor of it. It does not relate the commit to the prior round’s `baseline_tree`, reviewed completion, or remediation boundary.  
  **Impact:** A verification round can report on a deliberately or accidentally narrowed fix delta while missing changes made in response to findings. That undermines the independent-verification guarantee and can permit materially unreviewed code to close.  
  **Evidence:** `run_reanchor()` accepts any strict ancestor; `ledger.effective_baseline()` blindly substitutes its tree; both `verify.run_round()` and `affected.preverify_baseline()` consume that substitute as the diff base.

The prior set-based run-core surface finding is resolved for newly written CLI arguments, projections, and events, but the legacy journal migration defect above prevents that remediation from working for existing state.