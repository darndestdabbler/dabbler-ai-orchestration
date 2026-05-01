## Session under verification
Set 9 (`009-alignment-audit-followups`) Session 3 of 5 — drift item D-2 from the combined-design alignment audit. Audit document: `docs/proposals/2026-04-30-combined-design-alignment-audit.md` §5.2 (D-2 — `--force` flag on a deterministic gate).

## Path selected
The spec offered two corrective options:
  (a) hard-scope `--force` to incident-recovery only, with env-var gate + mandatory `--reason-file` + new `closeout_force_used` event + loud WARNING + forensic field in `session-state.json` + Session Set Explorer badge, OR
  (b) remove `--force` entirely.

**The operator selected option (a) — the hard-scope path** — at session start. The audit explicitly accepts either path; the operator's preference for retaining an incident-recovery bypass with strong audit-trail discipline drove the choice.

## Acceptance criteria for this session
- Either: `--force` is hard-scoped (env-var gated + reason-required + ledger event + warning) OR removed entirely
- `ai-router/docs/close-out.md` reflects the resolution
- A new test exercises the chosen path
(Operator selected the **hard-scope** path at session start.)

## Files changed (deliverables)

### 1. `ai-router/session_events.py` — `closeout_force_used` added to `EVENT_TYPES`

Set 1 Session 3 deliberately froze the enum to nine entries; the frozen-enum exception for D-2 is justified inline in the new comment block. Module docstring also updated to list ten event types and describe `closeout_force_used`.

```python
# Event types — exposed as a tuple so callers can validate without
# importing private constants. Set 1 Session 3 deliberately froze the
# enum so manual-verify rode the existing ``verification_completed``
# event (the ``method`` and ``attestation`` fields disambiguate). Set 9
# Session 3 (D-2 hard-scoping of ``--force``) carved a deliberate
# exception by adding ``closeout_force_used``: emergency-bypass
# close-outs are a distinct audit category from the ``forced=True``
# flag inside a ``closeout_succeeded`` payload, and a separate event
# type lets forensic tooling grep them out cleanly. Future additions
# require the same justification — a *new audit category*, not just a
# new variant of an existing one.
EVENT_TYPES = (
    "work_started",
    "verification_requested",
    "verification_claimed",
    "verification_completed",
    "verification_timed_out",
    "work_verified",
    "closeout_requested",
    "closeout_succeeded",
    "closeout_failed",
    "closeout_force_used",
)
_EVENT_TYPES_SET = frozenset(EVENT_TYPES)
```

### 2. `ai-router/close_session.py` — `--force` hard-scoped

Five changes:

  - **argparse `--force` help text** rewritten to describe the new contract:

```python
        "--force",
        action="store_true",
        help=(
            "Bypass all gate checks. Hard-scoped to incident-recovery use "
            "only: requires AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1 in the "
            "environment AND --reason-file naming the operator's narrative. "
            "Emits a closeout_force_used event to the session-events ledger "
            "with the reason text and writes forceClosed=true to "
            "session-state.json so the VS Code Session Set Explorer can "
            "surface a [FORCED] badge for forensic audit. See "
            "ai-router/docs/close-out.md Section 5 for the full contract."
        ),
    )
    
```

  - **`_validate_args` env-var + reason-file gates**:

```python
FORCE_CLOSE_OUT_ENV_VAR = "AI_ROUTER_ALLOW_FORCE_CLOSE_OUT"


def _validate_args(args: argparse.Namespace) -> Optional[str]:
    """Return an error string if *args* is an invalid combination, else None.

    Combination rules:

    * ``--force`` is bypass-everything: incompatible with ``--interactive``
      (which implies a human in the loop is reviewing the gate output)
      and with ``--manual-verify`` (which is a different bypass path with
      its own attestation requirement). Picking one bypass at a time
      keeps the audit trail unambiguous.
    * ``--force`` is also incompatible with ``--repair`` — repair already
      handles its own drift surface; combining the two would let a
      ``--force`` claim cover up the very drift ``--repair`` is meant to
      detect.
    * **``--force`` is hard-scoped to incident-recovery only** (Set 9
      Session 3, D-2). Two additional gates fire even when the
      compatibility rules above pass:
      - The ``AI_ROUTER_ALLOW_FORCE_CLOSE_OUT`` environment variable
        must be set to ``"1"``. Anything else (unset, empty, ``"0"``,
        ``"true"``, etc.) is rejected. The intent is that a normal
        terminal session does NOT have the env var set, so accidental
        ``--force`` invocations during day-to-day operation fail loudly
        before any state is touched.
      - ``--reason-file`` must be supplied with a non-empty narrative.
        The operator's reason becomes the payload of the
        ``closeout_force_used`` event so a forensic walk of the events
        ledger always answers "why was the gate bypassed?" without
        requiring a separate paper-trail. Refusing the silent-bypass
        case here mirrors ``--manual-verify``'s contract.
    * ``--apply`` is meaningful only under ``--repair``; using it alone
      is almost certainly a typo and should fail loudly.
    * ``--manual-verify`` is the bootstrapping-window escape hatch — it
      bypasses queue blocking on the operator's word. The operator's
      attestation must come from somewhere: either ``--interactive``
      (prompt on stdin) or ``--reason-file`` (file contents become the
      attestation). Refusing the silent-bypass case keeps the audit
      trail honest; an operator who genuinely has nothing to say can
      put a one-line reason in a file.
    * ``--timeout`` must be positive (a zero or negative timeout would
      either skip the wait entirely or hang forever depending on
      implementation; both are footguns).
    """
    if args.force and args.interactive:
        return "--force and --interactive are incompatible"
    if args.force and args.manual_verify:
        return "--force and --manual-verify are incompatible"
    if args.force and args.repair:
        return "--force and --repair are incompatible"
    if args.force:
        if os.environ.get(FORCE_CLOSE_OUT_ENV_VAR) != "1":
            return (
                f"--force is hard-scoped to incident-recovery only; set "
                f"{FORCE_CLOSE_OUT_ENV_VAR}=1 in the environment to opt "
                "in. See ai-router/docs/close-out.md Section 5."
            )
        if not args.reason_file:
            return (
                "--force requires --reason-file naming a non-empty "
                "narrative; the operator's reason is recorded in the "
                "closeout_force_used event for forensic audit"
            )
    if args.apply and not args.repair:
        return "--apply requires --repair"
    if args.manual_verify and not args.interactive and not args.reason_file:
        return (
            "--manual-verify requires either --interactive (prompt for "
            "attestation) or --reason-file (file containing attestation)"
        )
    if args.timeout is not None and args.timeout <= 0:
        return f"--timeout must be a positive integer (got {args.timeout})"
    return None



```

  - **`run()` event emission + WARNING** (inside the close-out lock, after `closeout_requested` is emitted):

```python
# Hard-scoped --force path (Set 9 Session 3, D-2): emit the
        # forensic ``closeout_force_used`` event with the operator's
        # reason so a forensic walk of the ledger can grep these
        # without inspecting every ``closeout_succeeded`` payload's
        # ``forced`` field. ``_validate_args`` guarantees ``args.force``
        # is True only when both the env-var gate and ``--reason-file``
        # are satisfied, so ``reason_text`` is always populated here.
        if args.force:
            outcome.messages.append(
                "WARNING: --force bypassed all close-out gates "
                "(incident-recovery only). The closeout_force_used "
                "event has been emitted with the operator's reason; "
                "session-state.json will record forceClosed=true on "
                "the next snapshot flip."
            )
            _logger.warning(
                "close_session --force used on %s (reason=%r). "
                "closeout_force_used event emitted; gate bypassed.",
                session_set_dir,
                reason_text,
            )
            _emit_event(
                session_set_dir,
                "closeout_force_used",
                outcome.session_number,
                outcome,
                reason=reason_text,
            )

        
```

### 3. `ai-router/session_state.py` — `forced` flag plumbing

  - `_flip_state_to_closed(forced=False)` writes `forceClosed: True` when called with `forced=True`:

```python
def _flip_state_to_closed(
    session_set: str,
    verification_verdict: Optional[str] = None,
    *,
    forced: bool = False,
) -> Optional[str]:
    """Internal: flip ``session-state.json`` to closed without running the gate.

    Used by :func:`mark_session_complete` after the gate passes (or is
    bypassed via ``force=True``), and by ``close_session._run_repair``
    when it needs to catch up a snapshot to an events ledger that
    already records ``closeout_succeeded``. Callers that must enforce
    the gate use the public :func:`mark_session_complete` entry point.

    When ``forced`` is True, write ``forceClosed: True`` to the
    snapshot (Set 9 Session 3, D-2). The flag is the forensic marker
    the VS Code Session Set Explorer reads to surface a ``[FORCED]``
    badge so reviewers can spot emergency-bypass close-outs at a
    glance. Repair-driven flips leave the flag at its default
    (``False``) — the snapshot is being resynced to a ledger event
    that may pre-date the hard-scoping change, so repair never claims
    forensic authority over close-outs it did not perform.

    Returns the file path if it existed and was updated, ``None`` if no
    state file existed.
    """
    path = _state_path(session_set)
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        state = json.load(f)
    # Migrate v1 → v2 in-memory before rewriting, so the on-disk file
    # comes out as v2 on the next write (per the schema migration contract).
    state = _migrate_v1_to_v2_inplace(state)
    state["status"] = "complete"
    state["lifecycleState"] = SessionLifecycleState.CLOSED.value
    state["completedAt"] = _now_iso()
    if verification_verdict is not None:
        state["verificationVerdict"] = verification_verdict
    if forced:
        state["forceClosed"] = True
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)
        f.write("\n")

    # If the orchestrator just authored change-log.md (this is the last
    # session of the set) and the activity log's totalSessions is still
    # missing or zero, finalize it from the unique sessionNumbers
    # recorded in entries. Catches the "spec said 4-5 sessions; we ended
    # at 4" case where no earlier register_session_start had a definitive
    # total to propagate.
    if os.path.isfile(os.path.join(session_set, "change-log.md")):
        _finalize_total_sessions_from_entries(session_set)

    return path



```

  - `mark_session_complete(force=False)` records `forced=` only when the bypass actually mattered (gates would have failed) and appends `closeout_force_used` to the events ledger from the snapshot-flip path:

```python
def mark_session_complete(
    session_set: str,
    verification_verdict: Optional[str] = None,
    *,
    force: bool = False,
) -> Optional[str]:
    """Run the close-out gate, then flip ``session-state.json`` to ``complete``.

    Called at the end of Step 8, just before ``git commit``, so the
    committed file reflects the completed-and-verified state. Returns
    the path if updated, ``None`` if no state file existed.

    Gate enforcement (Set 4 Session 3 wiring)
    -----------------------------------------
    Before flipping, the deterministic gate from Set 3 runs via
    :func:`close_session.run_gate_checks`. The contract:

    * **All gates pass** → flip the snapshot, append a
      ``closeout_succeeded`` event to ``session-events.jsonl`` (with
      ``forced=False``), return the path.
    * **One or more gates fail and ``force=False``** → raise
      :class:`CloseoutGateFailure` carrying the structured failure list.
      The snapshot is NOT flipped. No event is appended (the close-out
      didn't succeed, and emitting ``closeout_failed`` here would
      duplicate what a future ``close_session`` invocation would emit
      against the same set of failures).
    * **One or more gates fail and ``force=True``** → log a loud
      WARNING, append ``closeout_succeeded`` with ``forced=True`` and
      the failed-check names, append the forensic
      ``closeout_force_used`` event (Set 9 Session 3, D-2), and
      proceed with the flip. The ``forceClosed: true`` marker is
      written to ``session-state.json`` so the VS Code Session Set
      Explorer surfaces a ``[FORCED]`` badge on the affected set.
      ``force=True`` is hard-scoped to incident-recovery use only;
      callers that route through the CLI also need
      ``AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1``. The function-level
      contract here trusts callers (tests, the repair path) to use
      ``force=True`` deliberately.

    The event-emission step is best-effort with respect to a missing
    session-set directory or a transient I/O hiccup: a write failure
    raises out of ``append_event`` and the flip itself does not happen,
    so the snapshot and the ledger never disagree on success.
    """
    if not os.path.isfile(_state_path(session_set)):
        return None

    state_before = read_session_state(session_set)
    session_number = (
        state_before.get("currentSession")
        if isinstance(state_before, dict)
        else None
    )
    if not isinstance(session_number, int):
        session_number = 0

    # Run the gate. Lazy import to avoid a top-level cycle: close_session
    # imports session_state for read_session_state and (in the repair
    # path) for _flip_state_to_closed.
    try:
        from close_session import run_gate_checks  # type: ignore[import-not-found]
    except ImportError:
        from .close_session import run_gate_checks  # type: ignore[no-redef]

    gate_results = run_gate_checks(session_set)
    failures = [
        GateCheckFailure(check=g.check, remediation=g.remediation)
        for g in gate_results
        if not g.passed
    ]

    if failures and not force:
        raise CloseoutGateFailure(failures)

    if failures and force:
        bullets = "; ".join(
            f"{f.check}: {f.remediation}" for f in failures
        )
        _logger.warning(
            "WARNING: mark_session_complete(force=True) bypassed "
            "%d failing gate(s) on %s — %s. --force / force=True is "
            "hard-scoped to incident-recovery only (Set 9 Session 3, "
            "D-2); session-state.json will record forceClosed=true "
            "and a closeout_force_used event will be appended.",
            len(failures), session_set, bullets,
        )

    # Append the audit-trail event before the flip so that a failure
    # appending the event leaves the snapshot un-flipped — that way the
    # snapshot and the ledger never disagree on success. Lazy import
    # again to keep session_state import-light at module load time.
    try:
        from session_events import append_event  # type: ignore[import-not-found]
    except ImportError:
        from .session_events import append_event  # type: ignore[no-redef]

    event_fields = {
        "forced": bool(failures and force),
        "method": "snapshot_flip",
    }
    if failures and force:
        event_fields["failed_checks"] = [f.check for f in failures]
    if verification_verdict is not None:
        event_fields["verdict"] = verification_verdict
    if os.path.isdir(session_set):
        # session-events.jsonl lives under the session set; if the
        # directory doesn't exist we can't write the event. The flip
        # itself reads/writes session-state.json which we already
        # confirmed exists, so the flip is still safe to attempt.
        append_event(
            session_set,
            "closeout_succeeded",
            session_number,
            **event_fields,
        )
        # Forensic marker (Set 9 Session 3, D-2): the dedicated
        # ``closeout_force_used`` event makes emergency-bypass
        # close-outs cleanly greppable from the events ledger without
        # requiring callers to walk every ``closeout_succeeded``
        # payload's ``forced`` field. Emit only when ``force=True``
        # actually mattered (gates would have failed without it) — a
        # ``force=True`` invocation against a passing gate adds no
        # forensic value because the close-out would have succeeded
        # either way. Same idempotency story as ``closeout_succeeded``
        # above: the flip below is what marks the session closed, so
        # if this append raises mid-flight the snapshot stays
        # un-flipped and the ledger and snapshot never disagree.
        if failures and force:
            append_event(
                session_set,
                "closeout_force_used",
                session_number,
                method="snapshot_flip",
                failed_checks=[f.check for f in failures],
            )

    return _flip_state_to_closed(
        session_set,
        verification_verdict,
        forced=bool(failures and force),
    )



```

### 4. `ai-router/docs/close-out.md` Section 5 + Section 2 row

  - **Section 2 flag-summary row**:

    `| `--force` | Bypass all gate checks. **Hard-scoped to incident recovery only**: requires `AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1` in the environment AND `--reason-file`. Emits `closeout_force_used` to the events ledger and writes `forceClosed: true` to `session-state.json`. See Section 5. |`

  - **Section 5 — `--force` entry** (full rewrite):

```markdown
## Section 5 — Manual close-out flags

Three flags exist for cases where the deterministic close-out path
cannot run. Each leaves a distinct, audit-able trail.

**`--interactive`** — opts in to stdin prompts. Without it, the
script never blocks on input; the orchestrator's automation path runs
in the default non-interactive mode. Use this when an operator is
running close-out from a terminal and wants to confirm sensitive
actions.

**`--force`** — bypass all gate checks. **Hard-scoped to incident
recovery only** (Set 9 Session 3, drift item D-2 in
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

**`--manual-verify`** — skip queue verification blocking and record a
human attestation that verification happened out of band. Designed for
the bootstrapping window when outsource-last is being stood up and
verifier daemons are not yet reliable. Requires `--interactive` or
`--reason-file` so the attestation lands in the audit trail. Method
`"manual"` is recorded in the JSON output and the
`closeout_succeeded` event payload.

**`--repair`** — diagnostic mode. Walks the session set's state
(`session-state.json`, `activity-log.json`, `session-events.jsonl`,
`disposition.json`, `queue.db` rows) and reports drift between them
without touching anything. Add `--apply` to actually fix detectable
drift (e.g., a `session-events.jsonl` missing a `closeout_succeeded`
event for a session whose `session-state.json` says `complete`).
`--repair` without `--apply` exits 5 if drift is found, so it's safe
to script as a pre-flight check.

---


```

### 5. VS Code Session Set Explorer — `[FORCED]` badge

  - `tools/dabbler-ai-orchestration/src/types.ts` — added `forceClosed: boolean | null` to `LiveSession`:

```typescript
export type SessionState = "done" | "in-progress" | "not-started" | "cancelled";

export type OutsourceMode = "first" | "last";

export interface SessionSetConfig {
  requiresUAT: boolean;
  requiresE2E: boolean;
  uatScope: string;
  outsourceMode: OutsourceMode;
}

export interface UatSummary {
  totalItems: number;
  pendingItems: number;
  e2eRefs: string[];
}

export interface OrchestratorInfo {
  engine?: string;
  model?: string;
  effort?: string;
}

export interface LiveSession {
  currentSession: number | null;
  status: string | null;
  orchestrator: OrchestratorInfo | null;
  startedAt: string | null;
  completedAt: string | null;
  verificationVerdict: string | null;
  // Set 9 Session 3 (D-2 hard-scoping): true when the close-out path
  // was bypassed via ``--force`` / ``mark_session_complete(force=True)``.
  // Surfaced as a ``[FORCED]`` badge on the Session Set Explorer row so
  // reviewers can spot emergency-bypass close-outs at a glance. Absent
  // or false on every snapshot written by a normal close-out.
  forceClosed: boolean | null;
}

export interface SessionSet {
  name: string;
  dir: string;
  specPath: string;
  activityPath: string;
  changeLogPath: string;
  statePath: string;
  aiAssignmentPath: string;
  uatChecklistPath: string;
  state: SessionState;
  totalSessions: number | null;
  sessionsCompleted: number;
  lastTouched: string | null;
  liveSession: LiveSession | null;
  config: SessionSetConfig;
  uatSummary: UatSummary | null;
  root: string;
}

export interface MetricsEntry {
  session_set: string;
  session_num: number;
  model: string;
  effort: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  timestamp: string;
}

export interface CostSummary {
  totalCost: number;
  bySessionSet: Record<string, { sessions: number; cost: number; lastRun: string }>;
  byModel: Record<string, number>;
  dailyCosts: Array<{ date: string; cost: number }>;
}

```

  - `src/providers/SessionSetsProvider.ts` — exported `forceClosedBadge`, added it to the description bits, and added a tooltip line. Full provider file is large; the relevant additions are:

```typescript
(set: SessionSet): string {
  if (!set.config?.requiresUAT || !set.uatSummary) return "";
  if (set.uatSummary.pendingItems > 0) return `[UAT ${set.uatSummary.pendingItems}]`;
  if (set.uatSummary.totalItems > 0) return "[UAT done]";
  return "";
}

// Set 9 Session 3 (D-2 hard-scoping of ``--force``): the badge surfaces
// the rare case where a session set was closed via the hard-scoped
// ``--force`` bypass instead of the deterministic gate. The flag is
// written by ``_flip_state_to_closed(forced=True)`` in
// ``ai-router/session_state.py``; absent or false on every snapshot
// written by a normal close-out, so the badge never appears for
// healthy sets.
export function forceClosedBadge(set: SessionSet): string {
  return set.liveSession?.forceClosed === true ? "[FORCED]" : "";
}

// Outsource-first vs. outsource-last is a routing choice that lives in
// each spec.md's `Session Set Configuration` block. The badge surfaces it
// on the session-set tree row so the operator can tell at a glance which
// path a set's verifications take without opening the spec.
export function modeBadge(set: SessionSet): string {
  const mode = set.config?.outsourceMode;
  if (mode === "last") return "[LAST]";
  if (mode === "first") return "[FIRST]";
  return "";
}


...
 {
    lines.push(`Verifier: ${ls.verificationVerdict}`);
  }
  if (ls.forceClosed === true) {
    lines.push(
      "Force-closed: gate bypassed via --force (incident recovery). " +
        "See closeout_force_used in session-events.jsonl for the operator's reason."
    );
  }
  return lines;
...

      progressText(set),
      touchedDate(set),
      modeBadge(set),
      uatBadge(set),
      forceClosedBadge(set),
    ].filter(Boolean);
```

### 6. New tests

  - `tests/test_close_session_skeleton.py` — updated `test_force_bypass_without_disposition` to opt in via env-var + `--reason-file`; added `test_force_rejected_without_env_var`, `test_force_rejected_with_non_one_env_var`, `test_force_rejected_without_reason_file`, and `test_force_force_closed_flag_written_via_mark_session_complete`:

```python
def test_force_bypass_without_disposition(
    started_session_set, tmp_path, monkeypatch
):
    """``--force`` accepts a missing disposition once the hard-scope
    gates pass (Set 9 Session 3, D-2: env-var + --reason-file).
    """
    monkeypatch.setenv("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", "1")
    reason_path = tmp_path / "reason.md"
    reason_path.write_text(
        "incident-recovery: gate stuck on stale push lockfile\n",
        encoding="utf-8",
    )
    args = _ns(
        session_set_dir=started_session_set,
        force=True,
        reason_file=str(reason_path),
    )
    outcome = run(args)
    assert outcome.result == "succeeded"
    assert outcome.exit_code == 0
    # Force emits a loud WARNING (no longer a DEPRECATION line) so the
    # operator sees the gate was bypassed even when --json hides
    # outcome.messages inside the JSON payload.
    assert any("WARNING" in m and "force" in m.lower() for m in outcome.messages)
    # And the gate-results list is empty under force.
    assert outcome.gate_results == []
    # The forensic ``closeout_force_used`` event landed in the ledger
    # alongside ``closeout_requested`` / ``closeout_succeeded``.
    events = [e.event_type for e in read_events(started_session_set)]
    assert "closeout_force_used" in events
    # And it carries the operator's reason as a payload field.
    force_events = [
        e for e in read_events(started_session_set)
        if e.event_type == "closeout_force_used"
    ]
    assert len(force_events) == 1
    assert "stale push lockfile" in force_events[0].fields["reason"]


def test_force_rejected_without_env_var(started_session_set, tmp_path, monkeypatch):
    """Without ``AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1``, ``--force`` exits 2.

    The env-var gate fires before any state mutation: no events are
    written, no lock acquired, no disposition read. A normal terminal
    session that does not have the variable exported will fail loudly
    on accidental ``--force`` invocations.
    """
    monkeypatch.delenv("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", raising=False)
    reason_path = tmp_path / "reason.md"
    reason_path.write_text("test reason\n", encoding="utf-8")
    args = _ns(
        session_set_dir=started_session_set,
        force=True,
        reason_file=str(reason_path),
    )
    outcome = run(args)
    assert outcome.result == "invalid_invocation"
    assert outcome.exit_code == 2
    assert any(
        "AI_ROUTER_ALLOW_FORCE_CLOSE_OUT" in m for m in outcome.messages
    )
    # No ledger events were emitted because validation fired before lock.
    events = [e.event_type for e in read_events(started_session_set)]
    assert "closeout_requested" not in events
    assert "closeout_force_used" not in events


def test_force_rejected_with_non_one_env_var(
    started_session_set, tmp_path, monkeypatch
):
    """Values like ``"true"``, ``"yes"``, ``"0"``, or ``""`` are rejected.

    The opt-in token is exactly ``"1"`` — anything else trips the gate.
    A loose check (e.g. truthy-ness) would let a stale ``=0`` in a
    process-environment template silently accept ``--force``, which is
    exactly the footgun the hard-scope is meant to close.
    """
    reason_path = tmp_path / "reason.md"
    reason_path.write_text("test reason\n", encoding="utf-8")
    for bad_value in ("0", "true", "yes", "", "TRUE"):
        monkeypatch.setenv("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", bad_value)
        args = _ns(
            session_set_dir=started_session_set,
            force=True,
            reason_file=str(reason_path),
        )
        outcome = run(args)
        assert outcome.result == "invalid_invocation", (
            f"value {bad_value!r} should be rejected"
        )


def test_force_rejected_without_reason_file(
    started_session_set, monkeypatch
):
    """``--force`` without ``--reason-file`` exits 2 even with the env var.

    The reason becomes the ``closeout_force_used`` event's payload, so
    refusing the silent-bypass case keeps the forensic audit trail
    honest. (Mirrors the ``--manual-verify`` contract.)
    """
    monkeypatch.setenv("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", "1")
    args = _ns(session_set_dir=started_session_set, force=True)
    outcome = run(args)
    assert outcome.result == "invalid_invocation"
    assert outcome.exit_code == 2
    assert any("--reason-file" in m for m in outcome.messages)
    events = [e.event_type for e in read_events(started_session_set)]
    assert "closeout_force_used" not in events


def test_force_force_closed_flag_written_via_mark_session_complete(
    tmp_path, monkeypatch
):
    """``mark_session_complete(force=True)`` writes ``forceClosed: true``.

    The CLI emits the ``closeout_force_used`` event from
    ``close_session.run``; the snapshot flip happens via
    ``mark_session_complete``. The forensic flag in
    ``session-state.json`` is the bridge the VS Code Session Set
    Explorer reads — without it, a force-closed set looks
    indistinguishable from a normally-closed one in the tree view.
    """
    from session_state import (
        mark_session_complete,
        register_session_start,
        read_session_state,
    )
    set_dir = tmp_path / "set"
    set_dir.mkdir()
    register_session_start(
        session_set=str(set_dir),
        session_number=1,
        total_sessions=1,
        orchestrator_engine="claude-code",
        orchestrator_model="claude-opus-4-7",
        orchestrator_effort="high",
        orchestrator_provider="anthropic",
    )
    # Stub the gate to a deliberate failure so force=True actually
    # matters — without a failure the bypass adds no forensic value
    # and forceClosed stays False (this is the documented behavior in
    # mark_session_complete: forced=True is recorded only when the
    # bypass actually fires).
    monkeypatch.setattr(
        close_session, "run_gate_checks",
        lambda *_a, **_kw: [
            GateResult(check="working_tree_clean", passed=False, remediation="dirty"),
        ],
    )
    mark_session_complete(
        str(set_dir),
        verification_verdict="VERIFIED",
        force=True,
    )
    state = read_session_state(str(set_dir))
    assert state["forceClosed"] is True
    # And a closeout_force_used event landed alongside closeout_succeeded.
    events = [e.event_type for e in read_events(str(set_dir))]
    assert "closeout_succeeded" in events
    assert "closeout_force_used" in events



```

  - `tests/test_mark_session_complete_gate.py` — `TestGateFailWithForce` updated for the new WARNING wording, added `test_force_emits_closeout_force_used_event` and extended `test_force_flips_the_snapshot` to assert `forceClosed: True`:

```python
class TestGateFailWithForce:
    def test_force_logs_warning(
        self, started_session_set, monkeypatch,
    ):
        _stub_gate(monkeypatch, [
            close_session.GateResult(
                check="working_tree_clean", passed=False,
                remediation="commit pending edits",
            ),
        ])

        # session_state's logger has propagate=False (loud WARNING
        # records shouldn't bubble into the parent logging tree of an
        # embedding application), so caplog can't see the record without
        # an explicit handler attached. Add one for the test, then
        # detach in finally.
        records: List[logging.LogRecord] = []

        class _Capture(logging.Handler):
            def emit(self, record):
                records.append(record)

        ss_logger = logging.getLogger("ai_router.session_state")
        handler = _Capture(level=logging.WARNING)
        ss_logger.addHandler(handler)
        try:
            mark_session_complete(
                started_session_set,
                verification_verdict="VERIFIED",
                force=True,
            )
        finally:
            ss_logger.removeHandler(handler)

        warning_records = [
            r for r in records if "WARNING" in r.getMessage()
        ]
        assert len(warning_records) == 1
        msg = warning_records[0].getMessage()
        assert "force=True" in msg
        assert "1 failing gate" in msg
        assert "working_tree_clean" in msg
        # Set 9 Session 3 (D-2): the warning must signal that the
        # bypass is hard-scoped, not a transitional flag.
        assert "hard-scoped" in msg or "incident-recovery" in msg

    def test_force_emits_event_with_forced_true_and_failed_checks(
        self, started_session_set, monkeypatch,
    ):
        _stub_gate(monkeypatch, [
            close_session.GateResult(
                check="working_tree_clean", passed=False,
                remediation="commit pending edits",
            ),
            close_session.GateResult(
                check="pushed_to_remote", passed=False,
                remediation="push to origin/main",
            ),
        ])

        mark_session_complete(
            started_session_set,
            verification_verdict="VERIFIED",
            force=True,
        )

        events = read_events(started_session_set)
        succeeded = [e for e in events if e.event_type == "closeout_succeeded"]
        assert len(succeeded) == 1
        assert succeeded[0].fields.get("forced") is True
        assert succeeded[0].fields.get("failed_checks") == [
            "working_tree_clean",
            "pushed_to_remote",
        ]
        assert succeeded[0].fields.get("verdict") == "VERIFIED"

    def test_force_flips_the_snapshot(
        self, started_session_set, monkeypatch,
    ):
        _stub_gate(monkeypatch, [
            close_session.GateResult(
                check="working_tree_clean", passed=False,
                remediation="commit pending edits",
            ),
        ])

        path = mark_session_complete(
            started_session_set,
            verification_verdict="VERIFIED",
            force=True,
        )

        assert path is not None
        state = read_session_state(started_session_set)
        assert state["lifecycleState"] == SessionLifecycleState.CLOSED.value
        assert state["status"] == "complete"
        assert state["completedAt"] is not None
        # Set 9 Session 3 (D-2 hard-scoping): the forensic ``forceClosed``
        # flag is written when ``force=True`` actually mattered (gates
        # failed). The VS Code Session Set Explorer reads this flag to
        # surface a [FORCED] badge.
        assert state["forceClosed"] is True

    def test_force_emits_closeout_force_used_event(
        self, started_session_set, monkeypatch,
    ):
        """Set 9 Session 3 (D-2): the dedicated ``closeout_force_used``
        event makes emergency-bypass close-outs greppable from the
        events ledger without walking ``closeout_succeeded`` payloads.
        """
        _stub_gate(monkeypatch, [
            close_session.GateResult(
                check="working_tree_clean", passed=False,
                remediation="commit pending edits",
            ),
            close_session.GateResult(
                check="pushed_to_remote", passed=False,
                remediation="push to origin/main",
            ),
        ])
        mark_session_complete(
            started_session_set,
            verification_verdict="VERIFIED",
            force=True,
        )
        events = read_events(started_session_set)
        force_used = [
            e for e in events if e.event_type == "closeout_force_used"
        ]
        assert len(force_used) == 1
        # Carries the failed-checks list for the same forensic purpose
        # as the closeout_succeeded event's ``failed_checks`` field.
        assert force_used[0].fields.get("failed_checks") == [
            "working_tree_clean",
            "pushed_to_remote",
        ]
        assert force_used[0].fields.get("method") == "snapshot_flip"

    def test_force_on_passing_gate_records_forced_false(
        self, started_session_set, monkeypatch,
    ):
        """``force=True`` is harmless on a passing gate — the event records
        ``forced=False`` because nothing was actually bypassed."""
        _stub_gate(monkeypatch, [
            close_session.GateResult(check="working_tree_clean", passed=True),
        ])

        mark_session_complete(
            started_session_set,
            verification_verdict="VERIFIED",
            force=True,
        )

        events = read_events(started_session_set)
        succeeded = [e for e in events if e.event_type == "closeout_succeeded"]
        assert len(succeeded) == 1
        assert succeeded[0].fields.get("forced") is False
        assert "failed_checks" not in succeeded[0].fields
        # Set 9 Session 3 (D-2): force=True against a passing gate is a
        # no-op for forensic purposes — no ``closeout_force_used`` event,
        # no ``forceClosed`` flag. The bypass adds no value when the
        # gate would have passed anyway, so we don't pollute the
        # forensic surface with non-events.
        assert not [
            e for e in events if e.event_type == "closeout_force_used"
        ]
        state = read_session_state(started_session_set)
        assert "forceClosed" not in state or state["forceClosed"] is False



```

  - `tools/dabbler-ai-orchestration/src/test/suite/forceClosedBadge.test.ts` — new TS test (4 cases: true, false, null, liveSession=null):

```typescript
import * as assert from "assert";
import { forceClosedBadge } from "../../providers/SessionSetsProvider";
import { LiveSession, SessionSet } from "../../types";

// Set 9 Session 3 (D-2 hard-scoping of ``--force``): the [FORCED]
// description badge surfaces sets that closed via ``close_session
// --force`` / ``mark_session_complete(force=True)``. It reads the
// ``forceClosed`` flag written by ``_flip_state_to_closed(forced=True)``
// in ``ai-router/session_state.py``. The flag is absent or false on
// every snapshot written by a normal close-out.

function fakeLive(over: Partial<LiveSession> = {}): LiveSession {
  return {
    currentSession: 1,
    status: "complete",
    orchestrator: null,
    startedAt: null,
    completedAt: null,
    verificationVerdict: "VERIFIED",
    forceClosed: null,
    ...over,
  };
}

function fakeSet(liveSession: LiveSession | null): SessionSet {
  return {
    name: "x",
    dir: "/x",
    specPath: "/x/spec.md",
    activityPath: "/x/activity-log.json",
    changeLogPath: "/x/change-log.md",
    statePath: "/x/session-state.json",
    aiAssignmentPath: "/x/ai-assignment.md",
    uatChecklistPath: "/x/x-uat-checklist.json",
    state: "done",
    totalSessions: null,
    sessionsCompleted: 0,
    lastTouched: null,
    liveSession,
    config: {
      requiresUAT: false,
      requiresE2E: false,
      uatScope: "none",
      outsourceMode: "first",
    },
    uatSummary: null,
    root: "/x",
  };
}

suite("SessionSetsProvider — forceClosedBadge", () => {
  test("renders [FORCED] when forceClosed is true", () => {
    assert.strictEqual(
      forceClosedBadge(fakeSet(fakeLive({ forceClosed: true }))),
      "[FORCED]",
    );
  });

  test("renders nothing when forceClosed is false", () => {
    assert.strictEqual(
      forceClosedBadge(fakeSet(fakeLive({ forceClosed: false }))),
      "",
    );
  });

  test("renders nothing when forceClosed is null (legacy snapshot)", () => {
    // Sets closed before Set 9 Session 3 don't carry the field at all;
    // fileSystem.ts maps the missing field to null. The badge must
    // remain hidden so retroactively triaging a legacy set does not
    // light up the explorer with false [FORCED] markers.
    assert.strictEqual(
      forceClosedBadge(fakeSet(fakeLive({ forceClosed: null }))),
      "",
    );
  });

  test("renders nothing when liveSession itself is null", () => {
    // not-started / cancelled sets have liveSession=null. The badge
    // is meaningful only on closed sets, so the null guard short-
    // circuits cleanly to the empty string rather than reading
    // through null.
    assert.strictEqual(forceClosedBadge(fakeSet(null)), "");
  });
});

```

### 7. `docs/session-sets/009-alignment-audit-followups/ai-assignment.md` — Session 3 block appended (with Session 2 actuals)

```markdown
## Session 3: D-2 — `--force` flag resolution

### Recommended orchestrator
claude-code claude-opus-4-7 @ effort=high

### Rationale
Operator selected the **hard-scoping path** at session start (audit-accepted
recommended option a): retain `--force` for incident recovery only,
gated by `AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1`, mandatory `--reason-file`,
new `closeout_force_used` event in the ledger, loud WARNING line, a
`forceClosed` flag on `session-state.json`, and a `[FORCED]` badge on
the VS Code Session Set Explorer. Surface spans Python
(`close_session.py` validation + run flow, `session_state.py` snapshot
flip + `mark_session_complete`, `session_events.py` to admit the new
event type), TypeScript (`types.ts`, `fileSystem.ts`,
`SessionSetsProvider.ts`), `ai-router/docs/close-out.md` Section 5, and
a new failure-injection-style test. Opus high-effort matches the
multi-language surface and the security-relevant contract wording — a
loose hard-scope (e.g. silently accepting the env var) would defeat
the whole point of the hardening.

### Estimated routed cost
None this session — only end-of-session verification routes (per the
standing operator constraint).

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Read prerequisites (D-2 audit detail, close_session.py, session_state.py, session_events.py, Session Set Explorer extension files, existing --force tests, close-out.md §5) | Direct (orchestrator) |
| 2 | Register Session 3 start | Direct (file-write helper, no API call) |
| 3 | Append this Session 3 block to ai-assignment.md (with Session 2 actuals + cost) | Direct (router suspended per operator) |
| 4 | Add `closeout_force_used` to `EVENT_TYPES` in `session_events.py` | Direct (mechanical edit; deliberate frozen-enum addition justified inline) |
| 5 | Add env-var gate + `--reason-file` requirement to `_validate_args` in `close_session.py`; emit `closeout_force_used` event from `run()` when `args.force` is True; upgrade DEPRECATION line to WARNING; rewrite `--force` argparse help text | Direct (mechanical edit) |
| 6 | Thread `forced: bool` through `_flip_state_to_closed` and `mark_session_complete`; write `forceClosed: True` to `session-state.json` when `force=True` | Direct (mechanical edit) |
| 7 | Add `forceClosed` field to TS `LiveSession`; read it in `fileSystem.ts`; surface a `[FORCED]` description badge + tooltip line in `SessionSetsProvider.ts` | Direct (mechanical TS edit; Session Set Explorer is a small surface) |
| 8 | Replace Section 5 `--force` entry in `ai-router/docs/close-out.md` with the hard-scoped contract; update the §2 flag-summary row and the `--force` argparse help to match | Direct (mechanical edit) |
| 9 | Add `TestForceHardScoping` to `test_close_session_skeleton.py` (or a new `test_force_hard_scoping.py`) covering: env-var-missing rejection, missing-reason-file rejection, full happy path emits `closeout_force_used` + WARNING + `forceClosed: True` flip | Direct (test under ~120 lines, mechanical from existing scenarios) |
| 10 | Run full pytest suite | Direct (shell command) |
| 11 | End-of-session cross-provider verification | Routed: `route(task_type="session-verification")` — the only API call this session |
| 12 | Commit, push, run `close_session.py` (gates + closeout_succeeded), then `mark_session_complete` (snapshot flip), send notification | Direct (CLI invocation) |

### Actuals (filled after the session)
- Orchestrator used: claude-code claude-opus-4-7 @ effort=high
- Total routed cost: TBD at close-out (verification call only)
- Deviations from recommendation: ai-assignment authoring and
  next-session recommendation produced directly rather than via
  `route(task_type="analysis")`, per the standing operator
  cost-containment rule. The path-decision (hard-scope vs remove)
  was surfaced to the operator rather than routed for analysis,
  also under the same constraint. No other deviations.
- Notes for next-session calibration: Session 4 is the optional
  follow-ups bundle (F-1 close-out trigger failure scenario, F-2
  heartbeat alerter, D-4 widening of the failure-injection trace).
  None of those are corrective-blocking; the operator may opt to
  skip Session 4 with a written rationale and proceed directly to
  Session 5 (re-audit). If Session 4 runs, workload is similar to
  Session 2's mix (one new module + one or two new tests).

**Next-session orchestrator recommendation (Session 4):**
claude-code claude-opus-4-7 @ effort=high
Rationale: F-1 + F-2 + D-4 each touch test-infrastructure or new
modules where wrong-shape changes propagate poorly. Opus high-effort
is the right match if Session 4 runs; if the operator opts to skip
to Session 5 (re-audit), the recommendation re-targets to that.

```

## Test result
`python -m pytest ai-router/tests` → **675 passed in 54.75s** (670 pre-existing + 5 new force-hard-scoping cases).

Extension TypeScript: `npx tsc --noEmit -p tsconfig.json` → exit 0 (clean typecheck).

## Spec excerpt for Session 3
```markdown
 — `--force` flag resolution

**Goal:** Either remove `--force` from `close_session`, or hard-scope
it to admin/test use only with explicit ledger emission.

**Recommended path (hard-scope, since removal may break in-flight
sessions if the flag has callers):**
- Add `closeout_force_used` event emission to the session events
  ledger when `--force` is used; include a free-text `reason`
  argument that becomes mandatory when `--force` is used
- Add an environment-variable gate: `--force` is rejected unless
  `AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1` is set in the environment
- Add a loud `WARNING` log line to stdout when `--force` succeeds
- Add `closeout_force_used` to `session-state.json`'s
  `verificationVerdict` enum (or analogous field) so VS Code Session
  Set Explorer can surface a "force-closed" badge for forensic
  visibility
- Update `ai-router/docs/close-out.md` §5 (Manual close-out flags) to
  reflect the new contract: `--force` is for incident-recovery only

**Alternative path (remove):** If telemetry or grep confirms no
in-flight session sets rely on `--force`, simply remove it, update
docs and `--help`, and add a deprecation note for one release
covering anyone external to the repo.

**Acceptance:**
- Either: `--force` is hard-scoped (env-var gated + reason-required +
  ledger event + warning) OR removed entirely
- `ai-router/docs/close-out.md` reflects the resolution
- A new test exercises the chosen path


```

## Workflow ordering note
Workflow Step 6 (verification) is mode-aware; this set runs outsource-first and we are routing the verification synchronously. The standing operator constraint restricts ai-router usage to end-of-session verification only — this is the only routed call this session.

## Verification ask
Evaluate whether the deliverables together satisfy the spec's Session 3 acceptance criteria for the hard-scope alternative. Specifically:

  1. Is `--force` **hard-scoped** correctly? Does `_validate_args` reject `--force` (a) when `AI_ROUTER_ALLOW_FORCE_CLOSE_OUT` is unset / set to anything other than `"1"`, and (b) when `--reason-file` is missing? Are both checks applied before any state mutation (no events emitted, no lock acquired)?
  2. Is the `closeout_force_used` ledger event emitted with the operator's reason as a payload field? Is it added to `EVENT_TYPES` deliberately (with rationale for the frozen-enum exception)?
  3. Is the loud `WARNING` line clearly distinct from the old `DEPRECATION` text? Does it reach the operator both via `outcome.messages` (stdout in human mode, JSON payload in `--json` mode) AND via the module logger (stderr)?
  4. Is `forceClosed: true` written to `session-state.json` by `_flip_state_to_closed(forced=True)` and threaded through `mark_session_complete(force=True)` only when the bypass actually mattered (failing gates)?
  5. Does the VS Code Session Set Explorer surface a `[FORCED]` description badge and a tooltip line for force-closed sets, with a null-safe guard so legacy snapshots without the field don't light up the badge?
  6. Does `ai-router/docs/close-out.md` Section 5 reflect the new contract (env-var gate + reason-file requirement + event emission + WARNING + forensic flag), and does the Section 2 flag-summary row + combination-rules list agree?
  7. Are the new Python tests covering the rejection paths (no env-var, bad env-var values, no reason-file) and the happy path (event emitted, reason recorded, forceClosed set)? Is the TypeScript test covering the badge's true/false/null/null-liveSession cases?

Flag any consistency drift between the doc, the code, and the tests (e.g., docs naming a flag the code doesn't accept; tests asserting a message the code doesn't emit; the badge function checking a field the type doesn't carry).