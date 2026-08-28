"""The run projection.

Everything here is derived and disposable. The journal plus the one tracked
``docs/sessions/session-plan.md`` are the only inputs, so any process can
rebuild every byte of this and get the same answer — which is what makes it
safe for the Explorer to read a file instead of interrogating the journal on
every frame.

Two authorities are joined and neither is edited: authored intent comes from
the session plan (what work was declared) and execution truth comes from the
journal (what actually happened). A plan that cannot be parsed produces a
diagnostic and still never hides a run the journal recorded.

**Nothing here writes a staff-facing record.** The lifecycle writers own
``sessions.json``, ``activity-log.json`` and ``change-log.md``; a second
generator of those names is the drift the set collapse exists to end.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Optional

import jsonschema

from . import journal, runcore

# Deliberately NOT bumped alongside journal.SCHEMA_VERSION when the set
# level was collapsed. Both documents this stamps are derived: the
# organization is rebuilt in memory from the plan on every read, and
# read_projection() returns None on a shape or version mismatch so a stale
# run-projection.json is regenerated rather than misread. A version exists
# to stop durable history being read as a shape it was not written in, and
# neither of these is durable history. The journal is.
SCHEMA_VERSION = 1

SESSIONS_DIRNAME = "docs/sessions"
SESSION_PLAN_FILENAME = "session-plan.md"
SESSION_PLAN_REL = f"{SESSIONS_DIRNAME}/{SESSION_PLAN_FILENAME}"

STATE_NOT_STARTED = "not-started"
STATE_IN_PROGRESS = "in-progress"
STATE_COMPLETE = "complete"
STATE_CANCELLED = "cancelled"

TASK_PENDING = "pending"
TASK_IN_PROGRESS = "in-progress"
TASK_WAITING = "waiting"
TASK_COMPLETE = "complete"
TASK_FAILED = "failed"

_SCHEMA_DIR = Path(__file__).parent / "schemas"
_SESSION_HEADING = re.compile(
    r"^###\s+Session\s+(\d+)(?:\s+of\s+\d+)?\s*[:.\-]\s*(.+?)\s*$"
)
_POLICY_LINE = re.compile(r"^Policy\s*:\s*(fast|verified)\s*$", re.IGNORECASE)

_schema_cache: dict = {}


def _schema(name: str) -> dict:
    if name not in _schema_cache:
        _schema_cache[name] = json.loads(
            (_SCHEMA_DIR / f"{name}.schema.json").read_text(encoding="utf-8")
        )
    return _schema_cache[name]


_validator_cache: dict = {}


def _validator(name: str):
    """Compiled once per process. ``jsonschema.validate`` recompiles its
    schema on every call, which is invisible until it lands on a path that
    runs after every journal append."""
    if name not in _validator_cache:
        _validator_cache[name] = jsonschema.Draft202012Validator(_schema(name))
    return _validator_cache[name]


def _validate(document: dict, name: str, noun: str) -> dict:
    error = next(iter(_validator(name).iter_errors(document)), None)
    if error is not None:
        location = "/".join(str(p) for p in error.absolute_path) or "(root)"
        raise ValueError(f"{noun} invalid at {location}: {error.message}")
    return document


# --- Authored intent (§6.4) -------------------------------------------------

def sessions_dir(root) -> Path:
    return Path(root) / SESSIONS_DIRNAME


def session_plan_path(root) -> Path:
    return sessions_dir(root) / SESSION_PLAN_FILENAME


def parse_plan(text: str):
    """``(sessions, diagnostics)`` for the one authored ``session-plan.md``.

    Minimal by design: ordered ``### Session N: Title`` sections with an
    optional ``Policy:`` line. ``### Session N of M: Title`` is accepted
    because that is how the plans staff write actually read. Anything else
    beneath a session is a visible note, never a gate.
    """
    diagnostics = []
    sessions: list = []
    current = None

    for line in text.splitlines():
        heading = _SESSION_HEADING.match(line)
        if heading:
            current = {
                "number": int(heading.group(1)),
                "title": heading.group(2).strip(),
                "policy": None,
                "notes": [],
            }
            sessions.append(current)
            continue
        if current is None:
            continue
        policy = _POLICY_LINE.match(line.strip())
        if policy:
            current["policy"] = policy.group(1).lower()
            continue
        current["notes"].append(line)

    seen = set()
    ordered = []
    for entry in sessions:
        if entry["number"] in seen:
            diagnostics.append(
                f"session {entry['number']} is declared more than once; "
                "numbers are never reused"
            )
            continue
        seen.add(entry["number"])
        ordered.append({
            "number": entry["number"],
            "title": entry["title"],
            "policy": entry["policy"],
            "notes": "\n".join(entry["notes"]).strip(),
        })
    ordered.sort(key=lambda s: s["number"])

    if not ordered:
        diagnostics.append(
            "no '### Session <N>: <title>' section; the plan declares no work"
        )

    return ordered, diagnostics


def read_organization(root) -> tuple:
    """``(organization, digest)`` from one read of the session plan.

    The digest and the parsed content come from the *same bytes*. Reading
    the plan twice — once to parse, once to hash — lets an edit that lands
    between the two passes publish old content under the new digest, which
    is precisely the "this view is current" claim the digest exists to make.
    So the bytes are read once and both answers are derived from them.
    """
    diagnostics = []
    try:
        raw = session_plan_path(root).read_bytes()
    except OSError as exc:
        raw = b""
        diagnostics.append(
            {"detail": f"{SESSION_PLAN_REL} is missing or unreadable: {exc}"}
        )

    hashed = hashlib.sha256()
    hashed.update(str(len(raw)).encode("ascii"))
    hashed.update(raw)

    sessions = []
    if raw:
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            diagnostics.append(
                {"detail": f"{SESSION_PLAN_REL} is not UTF-8: {exc}"}
            )
        else:
            sessions, problems = parse_plan(text)
            diagnostics.extend({"detail": p} for p in problems)

    organization = _validate(
        {
            "schema_version": SCHEMA_VERSION,
            "plan_path": SESSION_PLAN_REL,
            "sessions": sessions,
            "diagnostics": diagnostics,
        },
        "session-organization", "session organization",
    )
    return organization, "sha256:" + hashed.hexdigest()


def load_organization(root) -> dict:
    return read_organization(root)[0]


def organization_digest(root) -> str:
    """SHA-256 of the exact ``session-plan.md`` bytes.

    Byte-exact so a plan edit that appends no journal event still moves the
    digest, which is the whole mechanism by which the Explorer notices
    authored changes.
    """
    return read_organization(root)[1]


# --- Task rows (§6.1) -------------------------------------------------------

def _phase_for(event: dict):
    """``(id, label)`` for the phase this event belongs to, or ``None`` when
    the event does not open or extend a phase."""
    kind = event["event_type"]
    payload = event["payload"]
    if kind == "run.started":
        return "work", "Implementation"
    if kind in ("check.started", "check.completed"):
        return "checks", "Checks"
    if kind in ("verification.dispatched", "verification.result"):
        return f"verification-{payload['round']}", (
            f"Verification round {payload['round']}"
        )
    if kind == "remediation.started":
        return f"remediation-{payload['round']}", (
            f"Remediation round {payload['round']}"
        )
    return None


def derive_tasks(events) -> list:
    """Stable display rows for one run's phases.

    A projection, not an authority: nothing here can move run state, and a
    short ``fast`` run legitimately produces one or two rows. Entering a new
    phase closes the previous one, which is what makes an interrupted run
    read as interrupted rather than as still working.
    """
    rows: list = []
    current: Optional[dict] = None
    check_attempts = 0
    failed_in_phase = False

    def close(state: str) -> None:
        nonlocal current, failed_in_phase
        if current is not None:
            current["state"] = TASK_FAILED if failed_in_phase else state
        current = None
        failed_in_phase = False

    for event in events:
        kind = event["event_type"]
        stamp = event["occurred_at"]
        if kind == "run.waiting" and current is not None:
            current["state"] = TASK_WAITING
            current["last_activity_at"] = stamp
            continue
        if kind == "run.resumed" and current is not None:
            current["state"] = TASK_IN_PROGRESS
            current["last_activity_at"] = stamp
            continue
        if kind == "run.finished":
            close(
                TASK_COMPLETE
                if event["payload"]["outcome"] == "completed"
                else TASK_FAILED
            )
            continue

        phase = _phase_for(event)
        if phase is None:
            if current is not None:
                current["last_activity_at"] = stamp
            continue
        row_id, label = phase
        if row_id == "checks" and (current is None or not current["id"].startswith("checks-")):
            check_attempts += 1
        if row_id == "checks":
            row_id = f"checks-{check_attempts}"
        if current is None or current["id"] != row_id:
            close(TASK_COMPLETE)
            current = {
                "id": row_id, "label": label, "state": TASK_IN_PROGRESS,
                "started_at": stamp, "last_activity_at": stamp,
            }
            rows.append(current)
        else:
            current["last_activity_at"] = stamp
        if kind == "check.completed" and event["payload"]["outcome"] != "passed":
            failed_in_phase = True

    return rows


# --- The run projection (§6.1) ----------------------------------------------

def _run_row(view: runcore.RunView, events) -> dict:
    return {
        "run_id": view.run_id,
        "policy": view.policy,
        "state": view.state,
        "waiting_reason": view.waiting_reason,
        "waiting_sequence": view.waiting_sequence,
        "ask": view.ask,
        "session_number": view.session_number,
        "engine": view.engine,
        "provider": view.provider,
        "model": view.model,
        "branch": view.branch,
        "worktree_id": view.worktree_id,
        "base_commit": view.base_commit,
        "started_at": view.started_at,
        "last_activity_at": view.last_activity_at,
        "pending_guidance": view.pending_guidance,
        "attempt": view.attempt,
        "escalations": list(view.escalations),
        "tasks": derive_tasks(events),
        "checks": [
            {
                "check_id": c["check_id"],
                "stage": c["stage"],
                "outcome": c["outcome"],
                "duration_seconds": c["duration_seconds"],
                "tree_digest": c["tree_digest"],
                "tree_mutated": c["tree_mutated"],
                "required": bool(c.get("required", True)),
            }
            for c in view.checks
        ],
        "verification": {
            "rounds": view.rounds,
            "last_verdict": view.verdict or view.last_verdict,
            "verifier_provider": view.verifier_provider,
            "transport": view.verifier_transport,
            "accepted_tree_digest": view.accepted_tree_digest,
            "blocking_findings": view.blocking_findings,
            "minor_findings": view.minor_findings,
        },
        "cost": {
            "model_usd": view.model_usd,
            "unpriced_calls": view.unpriced_calls,
            "dispatches": view.dispatches,
        },
        "commit": view.commit,
        "outcome": view.outcome,
        "verdict": view.verdict,
        "checkpoints": [dict(c) for c in view.checkpoints],
    }


def organization_states(events) -> dict:
    """``{session_number: (sequence, state)}`` — the latest cancel/restore
    per session, with the sequence that decided it.

    Events a version 1 migration marked ``legacy_set`` are skipped here and
    not only in the projection's session join. Every set numbered its
    sessions from 1, so a retired set's cancellation of *its* session 1
    carries the number of *this* repository's session 1 and would otherwise
    cancel live work. The filter sits in this function rather than in its
    callers because the run CLI asks the same question when it decides
    whether a session may be started."""
    latest: dict = {}
    for event in events:
        if event["event_type"] not in (
            "organization.cancelled", "organization.restored"
        ):
            continue
        payload = event.get("payload") or {}
        if payload.get("legacy_set"):
            # Also the only records with no session_number at all: a
            # set-level change names a thing that is not a session.
            continue
        latest[payload["session_number"]] = (
            event["sequence"],
            STATE_CANCELLED
            if event["event_type"] == "organization.cancelled"
            else None,
        )
    return latest


def _session_state(runs, cancellation) -> tuple:
    """``(state, current_run_id, needs_attention)`` for one declared session."""
    if cancellation is not None:
        sequence, marker = cancellation
        if marker == STATE_CANCELLED and not any(
            r["created_sequence"] > sequence for r in runs
        ):
            return STATE_CANCELLED, None, False
    if not runs:
        return STATE_NOT_STARTED, None, False
    latest = runs[-1]
    view = latest["view"]
    if not view.terminal:
        return STATE_IN_PROGRESS, view.run_id, False
    if view.state == runcore.STATE_COMPLETED:
        return STATE_COMPLETE, None, False
    # A failed or cancelled attempt leaves the session open for a retry and
    # says so; it never quietly reads as finished work.
    return STATE_IN_PROGRESS, None, True


def build_projection(root, events=None) -> dict:
    """The whole projection, folded from the journal and the spec bytes.

    *events* lets a caller that has already read the journal under the lock
    hand them over rather than paying for a second read and re-validation
    of the same file.
    """
    if events is None:
        events = journal.read_events(root)
    organization, digest = read_organization(root)
    views = runcore.fold_all(events)
    per_run_events: dict = {}
    created_sequence: dict = {}
    for event in events:
        if event["event_type"] in runcore.ORGANIZATION_EVENTS:
            continue  # about a set or a session, and naming no run
        per_run_events.setdefault(event["run_id"], []).append(event)
        if event["event_type"] == "run.created":
            created_sequence[event["run_id"]] = event["sequence"]

    cancellations = organization_states(events)
    # Runs a version 1 migration marked as belonging to a retired set. They
    # stay under `runs`, because they happened; they are never joined to a
    # plan session, because that set numbered its sessions from 1 and so
    # does this repository, so the numbers agreeing means nothing.
    # organization_states() applies the same rule to lifecycle events.
    legacy_runs = {
        event["run_id"] for event in events
        if event["event_type"] == "run.created"
        and (event.get("payload") or {}).get("legacy_set")
    }
    by_session: dict = {}
    for run_id, view in views.items():
        if run_id in legacy_runs:
            continue
        by_session.setdefault(view.session_number, []).append({
            "view": view, "created_sequence": created_sequence[run_id],
        })
    for entries in by_session.values():
        entries.sort(key=lambda e: e["created_sequence"])

    sessions = []
    for declared in organization["sessions"]:
        number = declared["number"]
        runs = by_session.get(number, [])
        state, current, attention = _session_state(
            runs, cancellations.get(number)
        )
        sessions.append({
            "number": number,
            "title": declared["title"],
            "policy": declared["policy"] or "fast",
            "state": state,
            "run_ids": [r["view"].run_id for r in runs],
            "current_run_id": current,
            "needs_attention": attention,
        })

    projection = {
        "schema_version": SCHEMA_VERSION,
        "projection_revision": events[-1]["sequence"] if events else 0,
        "organization_digest": digest,
        "generated_at": events[-1]["occurred_at"] if events else None,
        "diagnostics": organization["diagnostics"],
        "sessions": sessions,
        "runs": [
            _run_row(views[run_id], per_run_events[run_id])
            for run_id in sorted(views)
        ],
    }
    return _validate(projection, "run-projection", "run projection")


def write_projection(root, events=None) -> dict:
    projection = build_projection(root, events)
    journal.atomic_write_json(journal.projection_path(root), projection)
    return projection


def read_projection(root) -> Optional[dict]:
    """The stored projection, or ``None`` if it is absent, unparseable, or
    does not satisfy its own schema.

    §3.4 requires readers to validate before rendering, and this is the one
    document a reader is most tempted to trust on sight: it is written by
    this package, so it "must" be well formed. A truncated or
    hand-meddled-with file would otherwise be served to the Explorer as
    current state. An invalid one is simply not a projection, and the
    caller rebuilds.
    """
    try:
        raw = journal.projection_path(root).read_text(encoding="utf-8")
    except OSError:
        return None
    try:
        stored = json.loads(raw)
    except ValueError:
        return None
    if not isinstance(stored, dict) or stored.get("schema_version") != SCHEMA_VERSION:
        return None
    try:
        return _validate(stored, "run-projection", "stored run projection")
    except ValueError:
        return None


def current_projection(root, *, rebuild: bool = False) -> dict:
    """The projection, rebuilt whenever it does not match the journal tail
    or the exact plan bytes. A stale view is never returned as current."""
    stored = None if rebuild else read_projection(root)
    if stored is not None:
        _, digest = read_organization(root)
        if (
            stored["projection_revision"] == journal.tail_sequence(root)
            and stored["organization_digest"] == digest
        ):
            return stored
    return write_projection(root)
