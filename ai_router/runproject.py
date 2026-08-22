"""Projections: the run projection and the four per-set documents.

Everything here is derived and disposable. The journal plus the tracked
``spec.md`` files are the only inputs, so any process can rebuild every byte
of this and get the same answer — which is what makes it safe for the
Explorer to read a file instead of interrogating the journal on every frame.

Two authorities are joined and neither is edited: authored intent comes from
``spec.md`` (what work was declared) and execution truth comes from the
journal (what actually happened). A spec that cannot be parsed produces a
diagnostic and still never hides a run the journal recorded.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Optional

import jsonschema

from . import journal, runcore
from .journal import run_git

SCHEMA_VERSION = 1
SET_DOC_SCHEMA_VERSION = 5

SESSION_SETS_DIRNAME = "docs/session-sets"

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
_SET_DIRNAME = re.compile(r"^(\d{3})-([a-z0-9]+(?:-[a-z0-9]+)*)$")
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

def session_sets_dir(root) -> Path:
    return Path(root) / SESSION_SETS_DIRNAME


def parse_spec(text: str, slug: str, position: int, spec_path: str):
    """``(set, diagnostics)`` for one authored ``spec.md``.

    Minimal by design: a title, an objective, and ordered
    ``### Session N: Title`` sections with an optional ``Policy:`` line.
    Anything else beneath a session is a visible note, never a gate.
    """
    diagnostics = []
    lines = text.splitlines()

    title = ""
    objective_lines: list = []
    sessions: list = []
    section = None
    current = None

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("# ") and not stripped.startswith("##"):
            title = stripped[2:].strip()
            section = None
            continue
        if stripped.startswith("## "):
            heading = stripped[3:].strip().lower()
            section = "objective" if heading.startswith("objective") else (
                "sessions" if heading.startswith("session") else None
            )
            continue
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
        if current is not None:
            policy = _POLICY_LINE.match(stripped)
            if policy:
                current["policy"] = policy.group(1).lower()
                continue
            current["notes"].append(line)
        elif section == "objective":
            objective_lines.append(line)

    if not title:
        diagnostics.append("no '# <title>' heading")
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

    return {
        "slug": slug,
        "position": position,
        "title": title or slug,
        "objective": "\n".join(objective_lines).strip(),
        "spec_path": spec_path,
        "sessions": ordered,
    }, diagnostics


def read_organization(root) -> tuple:
    """``(organization, digest)`` from one pass over the spec files.

    The digest and the parsed content come from the *same bytes*. Reading
    the specs twice — once to parse, once to hash — lets an edit that lands
    between the two passes publish old content under the new digest, which
    is precisely the "this view is current" claim the digest exists to make.
    So the bytes are read once and both answers are derived from them.
    """
    sets, diagnostics, hashed = [], [], hashlib.sha256()
    base = session_sets_dir(root)
    for entry in sorted(
        (p for p in base.glob("*") if p.is_dir() and _SET_DIRNAME.match(p.name)),
        key=lambda p: p.name,
    ):
        match = _SET_DIRNAME.match(entry.name)
        spec = entry / "spec.md"
        rel = f"{SESSION_SETS_DIRNAME}/{entry.name}/spec.md"
        try:
            raw = spec.read_bytes()
        except OSError as exc:
            raw = b""
            diagnostics.append({
                "set_slug": entry.name,
                "detail": f"{rel} is missing or unreadable: {exc}",
            })
        hashed.update(entry.name.encode("utf-8"))
        hashed.update(b"\0")
        hashed.update(str(len(raw)).encode("ascii"))
        hashed.update(b"\0")
        hashed.update(raw)
        if not raw:
            continue
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            diagnostics.append({
                "set_slug": entry.name, "detail": f"{rel} is not UTF-8: {exc}",
            })
            continue
        parsed, problems = parse_spec(
            text, entry.name, int(match.group(1)), rel
        )
        sets.append(parsed)
        diagnostics.extend(
            {"set_slug": entry.name, "detail": p} for p in problems
        )

    sets.sort(key=lambda s: (s["position"], s["slug"]))
    organization = _validate(
        {"schema_version": SCHEMA_VERSION, "sets": sets,
         "diagnostics": diagnostics},
        "session-organization", "session organization",
    )
    return organization, "sha256:" + hashed.hexdigest()


def load_organization(root) -> dict:
    return read_organization(root)[0]


def organization_digest(root) -> str:
    """SHA-256 of the ordered set slugs and the exact ``spec.md`` bytes.

    Byte-exact so a spec edit that appends no journal event still moves the
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
        "set_slug": view.set_slug,
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
    """``{(set_slug, session_number|None): (sequence, state)}`` — the latest
    cancel/restore per target, with the sequence that decided it."""
    latest: dict = {}
    for event in events:
        if event["event_type"] not in (
            "organization.cancelled", "organization.restored"
        ):
            continue
        payload = event["payload"]
        key = (
            payload["set_slug"],
            payload.get("session_number")
            if payload["target"] == "session" else None,
        )
        latest[key] = (
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
    by_session: dict = {}
    for run_id, view in views.items():
        by_session.setdefault(
            (view.set_slug, view.session_number), []
        ).append({
            "view": view, "created_sequence": created_sequence[run_id],
        })
    for entries in by_session.values():
        entries.sort(key=lambda e: e["created_sequence"])

    session_sets = []
    for declared in organization["sets"]:
        sessions = []
        any_activity = False
        for session in declared["sessions"]:
            key = (declared["slug"], session["number"])
            runs = by_session.get(key, [])
            state, current, attention = _session_state(
                runs, cancellations.get(key)
            )
            if runs:
                any_activity = True
            sessions.append({
                "number": session["number"],
                "title": session["title"],
                "policy": session["policy"] or "fast",
                "state": state,
                "run_ids": [r["view"].run_id for r in runs],
                "current_run_id": current,
                "needs_attention": attention,
            })
        session_sets.append({
            "slug": declared["slug"],
            "title": declared["title"],
            "objective": declared["objective"],
            "state": _set_state(
                sessions, any_activity,
                cancellations.get((declared["slug"], None)),
            ),
            "position": declared["position"],
            "sessions": sessions,
        })

    projection = {
        "schema_version": SCHEMA_VERSION,
        "projection_revision": events[-1]["sequence"] if events else 0,
        "organization_digest": digest,
        "generated_at": events[-1]["occurred_at"] if events else None,
        "diagnostics": organization["diagnostics"],
        "session_sets": session_sets,
        "runs": [
            _run_row(views[run_id], per_run_events[run_id])
            for run_id in sorted(views)
        ],
    }
    return _validate(projection, "run-projection", "run projection")


def _set_state(sessions, any_activity, cancellation) -> str:
    if cancellation is not None and cancellation[1] == STATE_CANCELLED:
        return STATE_CANCELLED
    if not any_activity:
        return STATE_NOT_STARTED
    live = [s for s in sessions if s["state"] != STATE_CANCELLED]
    if live and all(s["state"] == STATE_COMPLETE for s in live):
        return STATE_COMPLETE
    return STATE_IN_PROGRESS


def write_projection(root, events=None) -> dict:
    projection = build_projection(root, events)
    journal.atomic_write_json(journal.projection_path(root), projection)
    write_documents(root, projection)
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
    or the exact spec bytes. A stale view is never returned as current."""
    stored = None if rebuild else read_projection(root)
    if stored is not None:
        _, digest = read_organization(root)
        if (
            stored["projection_revision"] == journal.tail_sequence(root)
            and stored["organization_digest"] == digest
        ):
            return stored
    return write_projection(root)


# --- The four documents (§6.2) ----------------------------------------------

_v4_cache: dict = {}


def _is_v4_set(root, slug: str) -> bool:
    """A tracked ``session-state.json`` marks a historical v4 set. Those
    files are inputs to the hierarchy and are never rewritten here.

    Cached per process: whether a path is tracked cannot change without a
    commit, and this otherwise costs one git subprocess per set on every
    projection write.
    """
    key = (str(root), slug)
    if key not in _v4_cache:
        rc, _, _ = run_git(
            root, "ls-files", "--error-unmatch",
            f"{SESSION_SETS_DIRNAME}/{slug}/session-state.json",
        )
        _v4_cache[key] = rc == 0
    return _v4_cache[key]


def write_documents(root, projection: dict) -> list:
    written = []
    runs = {r["run_id"]: r for r in projection["runs"]}
    for declared in projection["session_sets"]:
        slug = declared["slug"]
        if _is_v4_set(root, slug):
            continue
        directory = session_sets_dir(root) / slug
        if not directory.is_dir():
            continue
        journal.atomic_write_json(
            directory / "session-state.json",
            _session_state_document(declared, runs, projection),
        )
        journal.atomic_write_json(
            directory / "activity-log.json",
            _activity_log_document(declared, runs, projection),
        )
        written.extend([
            f"{SESSION_SETS_DIRNAME}/{slug}/session-state.json",
            f"{SESSION_SETS_DIRNAME}/{slug}/activity-log.json",
        ])
        changelog = _change_log_document(declared, runs)
        if changelog is not None:
            journal.atomic_write_text(
                directory / "change-log.md", changelog
            )
            written.append(f"{SESSION_SETS_DIRNAME}/{slug}/change-log.md")
    return written


def _session_state_document(declared, runs, projection) -> dict:
    sessions = []
    for session in declared["sessions"]:
        linked = [runs[r] for r in session["run_ids"] if r in runs]
        latest = linked[-1] if linked else None
        sessions.append({
            "number": session["number"],
            "title": session["title"],
            "policy": session["policy"],
            "status": session["state"],
            "runIds": session["run_ids"],
            "currentRunId": session["current_run_id"],
            "needsAttention": session["needs_attention"],
            "startedAt": linked[0]["started_at"] if linked else None,
            "completedAt": (
                latest["last_activity_at"]
                if latest and latest["outcome"] == "completed" else None
            ),
            "verification": latest["verification"] if latest else None,
            "cost": latest["cost"] if latest else None,
            "commit": latest["commit"] if latest else None,
        })
    return _validate({
        "schemaVersion": SET_DOC_SCHEMA_VERSION,
        "sessionSetName": declared["slug"],
        "title": declared["title"],
        "objective": declared["objective"],
        "status": declared["state"],
        "projectionRevision": projection["projection_revision"],
        "organizationDigest": projection["organization_digest"],
        "sessions": sessions,
    }, "session-state-v5", "v5 set state")


def _activity_log_document(declared, runs, projection) -> dict:
    entries = []
    for session in declared["sessions"]:
        for run_id in session["run_ids"]:
            run = runs.get(run_id)
            if run is None:
                continue
            entries.append({
                "sessionNumber": session["number"],
                "runId": run_id,
                "attempt": run["attempt"],
                "policy": run["policy"],
                "state": run["state"],
                "firstStartedAt": run["started_at"],
                "lastActivityAt": run["last_activity_at"],
                "tasks": run["tasks"],
                "checks": run["checks"],
                "escalations": run["escalations"],
            })
    return {
        "schemaVersion": SET_DOC_SCHEMA_VERSION,
        "sessionSetName": declared["slug"],
        "projectionRevision": projection["projection_revision"],
        "entries": entries,
    }


def _change_log_document(declared, runs) -> Optional[str]:
    blocks = []
    for session in declared["sessions"]:
        for run_id in session["run_ids"]:
            run = runs.get(run_id)
            if run is None or run["outcome"] != "completed":
                continue
            cost = run["cost"]
            spend = (
                f"${cost['model_usd']:.2f}" if cost["model_usd"] else "$0.00"
            )
            if cost["unpriced_calls"]:
                spend += f" + {cost['unpriced_calls']} unpriced"
            blocks.append(
                f"## Session {session['number']}: {session['title']}\n\n"
                f"- Run: `{run_id}` (attempt {run['attempt']}, "
                f"policy {run['policy']})\n"
                f"- Ask: {run['ask']}\n"
                f"- Checks: " + (
                    ", ".join(
                        f"{c['check_id']} {c['outcome']} ({c['stage']})"
                        for c in run["checks"]
                    ) or "none declared"
                ) + "\n"
                f"- Verification: {run['verification']['rounds']} round(s), "
                f"verdict {run['verdict'] or 'n/a'}\n"
                f"- Cost: {spend}\n"
                f"- Commit: `{run['commit']}`\n"
            )
    if not blocks:
        return None
    return (
        f"# {declared['title']} — change log\n\n"
        "Generated from the run journal. Do not hand-edit.\n\n"
        + "\n".join(blocks)
    )
