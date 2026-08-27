"""The sanctioned writers for the per-set artifacts.

Every byte written to ``session-state.json``, ``activity-log.json``,
``change-log.md``, ``decisions-log.md``, ``project-work-plan.md`` and the
cancel/restore audit markers goes through this module. The writers
validate against the schema, enforce the closed verdict and step
vocabularies, and record a content hash so an out-of-band edit is
detectable. Lifecycle FLOW logic (boundary triad, locking, gates, CLI)
lives in ``session.py``; this module owns the write discipline and
nothing else.

The two prose files are projections, not records. ``activity-log.json``
holds the decision and declaration rows; the markdown is folded from it on
every append and may be deleted and rebuilt at any time. That is what
lets a model supply content while the framework keeps structure,
filename, ordering and identity out of its reach.
"""

from __future__ import annotations

import datetime
import json
import os
import re
import tempfile
import time
from pathlib import Path
from typing import Optional

import jsonschema

from .evidence import record_state_write
from .progress import (
    SessionStateInvariantError,
    STATUS_COMPLETE,
    STATUS_IN_PROGRESS,
    STATUS_NOT_STARTED,
    TOP_LEVEL_STATUSES,
    canonicalize_status,
    extract_session_titles_from_spec,
    get_progress,
    heal_title,
    normalize_to_v4_shape,
    read_raw_session_state,
)
from .verdict import validate_session_verdict

SCHEMA_VERSION = 4
_STATE_SCHEMA_PATH = Path(__file__).parent / "schemas" / "session-state.schema.json"
_state_schema_cache: dict | None = None

STEP_STATUSES = ("pending", "in-progress", "complete", "blocked")

CANCELLED_FILENAME = "CANCELLED.md"
RESTORED_FILENAME = "RESTORED.md"
_CANCEL_HISTORY_HEADER = "# Cancellation history"

# The two files of the specification. The names are constants because the
# model that supplies their content never chooses where it lands.
DECISIONS_LOG_FILENAME = "decisions-log.md"
WORK_PLAN_FILENAME = "project-work-plan.md"

# Activity-log row kinds. ``plan-step`` predates these three and is written
# by ``seed_session_plan``/``log_step``.
KIND_DECISION = "decision"
KIND_TASK_DECLARATION = "task-declaration"
KIND_PROJECT_PLAN = "project-plan"

# Who decided. Closed, because "who made it" is only answerable against a
# fixed set of roles -- a free-text author lets a model attribute its own
# decision to a human.
DECIDER_OPERATOR = "operator"
DECIDER_ORCHESTRATOR = "orchestrator"
DECIDER_VERIFIER = "verifier"
DECIDER_FRAMEWORK = "framework"
DECIDERS = (DECIDER_OPERATOR, DECIDER_ORCHESTRATOR, DECIDER_VERIFIER,
            DECIDER_FRAMEWORK)


def _state_schema() -> dict:
    global _state_schema_cache
    if _state_schema_cache is None:
        _state_schema_cache = json.loads(
            _STATE_SCHEMA_PATH.read_text(encoding="utf-8")
        )
    return _state_schema_cache


def _now_iso() -> str:
    return datetime.datetime.now().astimezone().isoformat()


def _now_iso_seconds() -> str:
    """Second precision with timezone — the marker-file timestamp shape
    legacy readers parse."""
    return (
        datetime.datetime.now().astimezone().replace(microsecond=0)
        .isoformat()
    )


# --- session-state.json ------------------------------------------------------

def _atomic_write_json(path: Path, payload: dict) -> None:
    fd, tmp = tempfile.mkstemp(
        prefix=path.name + ".", dir=str(path.parent)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
            f.write("\n")
        for attempt in range(3):
            try:
                os.replace(tmp, path)
                return
            except PermissionError:
                if attempt == 2:
                    raise
                time.sleep(0.05)
    finally:
        if os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except OSError:
                pass


def build_orchestrator_block(
    engine: str, provider=None, model=None, effort=None
) -> dict:
    """Omit-null: missing keys are valid, null placeholders are not.
    identityProvenance is derived from the engine, never a free choice."""
    from .identity import classify_identity_provenance

    block = {"engine": engine}
    for key, value in (("provider", provider), ("model", model),
                       ("effort", effort)):
        if isinstance(value, str) and value.strip():
            block[key] = value.strip()
    provenance = classify_identity_provenance(engine)
    if provenance:
        block["identityProvenance"] = provenance
    return block


def _validate_and_write_state(set_dir, state: dict) -> None:
    try:
        jsonschema.validate(state, _state_schema())
    except jsonschema.ValidationError as exc:
        location = "/".join(str(p) for p in exc.absolute_path) or "(root)"
        raise SessionStateInvariantError(
            2, f"refusing to write invalid session-state at {location}: "
               f"{exc.message}"
        ) from exc
    if "sessions" in state:
        get_progress(state)  # invariants, fail loud before I/O
    _atomic_write_json(Path(set_dir) / "session-state.json", state)
    record_state_write(set_dir)


def _build_sessions_array(
    total: int, completed, in_progress_number, prior_sessions, spec_titles
) -> list:
    prior_by_number = {
        s.get("number"): s for s in (prior_sessions or [])
        if isinstance(s, dict)
    }
    sessions = []
    for n in range(1, total + 1):
        prior = prior_by_number.get(n, {})
        title = heal_title(prior.get("title"), n, spec_titles) or f"Session {n}"
        if n == in_progress_number:
            status = STATUS_IN_PROGRESS
        elif n in completed:
            status = STATUS_COMPLETE
        else:
            status = STATUS_NOT_STARTED
        record = {"number": n, "title": title, "status": status}
        # "verification" (the summary block: verifier identity, rounds,
        # cost) must ride along with the verdict — dropping it here erased
        # every earlier session's summary at each registration.
        for key in ("startedAt", "completedAt", "orchestrator",
                    "verificationVerdict", "verification"):
            if prior.get(key) is not None:
                record[key] = prior[key]
        record.setdefault("startedAt", None)
        record.setdefault("completedAt", None)
        record.setdefault("orchestrator", None)
        record.setdefault("verificationVerdict", None)
        if prior.get("type") in ("verification", "remediation"):
            record["type"] = prior["type"]
        sessions.append(record)
    return sessions


def _completed_numbers(state: Optional[dict]) -> set:
    if not state:
        return set()
    return {
        s.get("number") for s in state.get("sessions") or []
        if isinstance(s, dict) and s.get("status") == STATUS_COMPLETE
        and isinstance(s.get("number"), int)
    }


def register_session_start(
    set_dir, session_number: int, *, engine: str, provider=None,
    model=None, effort=None, total_sessions: Optional[int] = None,
) -> dict:
    """The one writer for a session start. Re-opening a closed session is
    refused HERE, not only at the CLI — a direct API caller must hit the
    same wall."""
    set_path = Path(set_dir)
    raw = read_raw_session_state(set_path)
    normalized = (
        normalize_to_v4_shape(raw, set_path / "spec.md") if raw else None
    )
    completed = _completed_numbers(normalized)
    if session_number in completed:
        raise SessionStateInvariantError(
            4,
            f"register_session_start refused: session {session_number} is "
            f"already in completedSessions {sorted(completed)!r}. "
            "Re-opening a closed session would erase its close-out record; "
            "start the next session instead."
        )

    spec_titles = dict(
        extract_session_titles_from_spec(set_path / "spec.md")
    )
    total = total_sessions or 0
    if not total and normalized:
        total = len(normalized.get("sessions") or [])
    if not total and spec_titles:
        total = max(spec_titles)
    if not total:
        total = max([session_number] + sorted(completed), default=1)

    prior_sessions = (normalized or {}).get("sessions")
    sessions = _build_sessions_array(
        total, completed, session_number, prior_sessions, spec_titles
    )
    now = _now_iso()
    for record in sessions:
        if record["number"] == session_number:
            record["startedAt"] = record.get("startedAt") or now
            record["completedAt"] = None
            record["orchestrator"] = build_orchestrator_block(
                engine, provider, model, effort
            )
            record["verificationVerdict"] = None
            # The session being (re)started owes fresh verification; a
            # leftover summary beside a null verdict would be a lie.
            record.pop("verification", None)

    state = {
        "schemaVersion": SCHEMA_VERSION,
        "sessionSetName": set_path.name,
        "status": STATUS_IN_PROGRESS,
        "sessions": sessions,
    }
    for passthrough in ("forceClosed", "preCancelStatus"):
        if raw and passthrough in raw:
            state[passthrough] = raw[passthrough]
    _validate_and_write_state(set_path, state)
    return state


def record_session_verification(
    set_dir, session_number: int, verdict: str, summary: Optional[dict] = None
) -> None:
    """Stamp the final verdict (closed vocabulary, exact allowlist) and an
    additive verification summary onto the session record."""
    verdict = validate_session_verdict(str(verdict).strip().upper())
    set_path = Path(set_dir)
    raw = read_raw_session_state(set_path)
    if not raw or not isinstance(raw.get("sessions"), list):
        raise SessionStateInvariantError(
            1, f"no writable v4 session-state under {set_dir}"
        )
    hit = False
    for record in raw["sessions"]:
        if isinstance(record, dict) and record.get("number") == session_number:
            record["verificationVerdict"] = verdict
            if summary:
                record["verification"] = summary
            hit = True
    if not hit:
        raise SessionStateInvariantError(
            2, f"session {session_number} not present in {set_dir}"
        )
    _validate_and_write_state(set_path, raw)


def flip_state_to_closed(
    set_dir, *, verdict=None, forced: bool = False
) -> dict:
    """Close the in-flight session: complete it, stamp the verdict, and
    flip the set to complete when it was the last session (or when forced,
    which promotes every session — a forensic marker, not a shortcut)."""
    if verdict is not None:
        verdict = validate_session_verdict(str(verdict).strip().upper())
    set_path = Path(set_dir)
    raw = read_raw_session_state(set_path)
    normalized = (
        normalize_to_v4_shape(raw, set_path / "spec.md") if raw else None
    )
    if not normalized:
        raise SessionStateInvariantError(
            1, f"no readable session-state under {set_dir}"
        )
    current = normalized.get("currentSession")
    if current is None:
        raise SessionStateInvariantError(
            3, f"no session is in flight under {set_dir}"
        )
    completed = _completed_numbers(normalized) | {current}
    sessions = normalized.get("sessions") or []
    total = len(sessions)
    now = _now_iso()
    new_sessions = []
    for record in sessions:
        record = dict(record)
        if record.get("number") == current:
            record["status"] = STATUS_COMPLETE
            record["completedAt"] = now
            if verdict is not None:
                record["verificationVerdict"] = verdict
        elif forced and record.get("status") != STATUS_COMPLETE:
            record["status"] = STATUS_COMPLETE
            if record.get("completedAt") is None:
                record["completedAt"] = now
        for key in ("startedAt", "completedAt", "orchestrator",
                    "verificationVerdict"):
            record.setdefault(key, None)
        new_sessions.append(record)

    all_done = forced or len(completed) == total
    state = {
        "schemaVersion": SCHEMA_VERSION,
        "sessionSetName": set_path.name,
        "status": STATUS_COMPLETE if all_done else STATUS_IN_PROGRESS,
        "sessions": new_sessions,
    }
    if forced:
        state["forceClosed"] = True
    elif raw and "forceClosed" in raw:
        state["forceClosed"] = raw["forceClosed"]
    if raw and "preCancelStatus" in raw:
        state["preCancelStatus"] = raw["preCancelStatus"]
    _validate_and_write_state(set_path, state)
    return state


def _v4_on_disk_state(set_path: Path, raw: dict) -> dict:
    """Project any historical on-disk shape to the canonical v4 write
    shape: ledger normalized, derived top-level keys dropped, the plan-less
    carve-out and passthrough keys preserved."""
    normalized = normalize_to_v4_shape(raw, set_path / "spec.md")
    state = {
        "schemaVersion": SCHEMA_VERSION,
        "sessionSetName": normalized.get("sessionSetName") or set_path.name,
        "status": canonicalize_status(normalized.get("status")),
    }
    normalized_sessions = normalized.get("sessions")
    if isinstance(raw.get("sessions"), list) or normalized_sessions:
        state["sessions"] = normalized_sessions or []
    else:
        for key in ("startedAt", "orchestrator"):  # plan-less carve-out
            if raw.get(key) is not None:
                state[key] = raw[key]
    for key in ("forceClosed", "nextOrchestrator"):
        if key in raw:
            state[key] = raw[key]
    if "preCancelStatus" in raw:
        pre = canonicalize_status(raw["preCancelStatus"])
        # A drifted value is dropped, not written: restore then falls back
        # to ledger derivation instead of trusting a token nothing owns.
        if pre is None or pre in TOP_LEVEL_STATUSES:
            state["preCancelStatus"] = pre
    return state


# --- activity-log.json (seed once, log steps) --------------------------------

_PLAN_KEY_MAX_WORDS = 6
_PLAN_KEY_MAX_CHARS = 48


def plan_step_key(text: str, ordinal: int) -> str:
    head = re.split(r"[.:;]", text, maxsplit=1)[0]
    head = re.sub(r"[*`_]", "", head).lower()
    words = re.split(r"[^a-z0-9]+", head)
    key = "-".join(w for w in words if w)[:_PLAN_KEY_MAX_CHARS].strip("-")
    key = "-".join(key.split("-")[:_PLAN_KEY_MAX_WORDS])
    return key or f"step-{ordinal}"


def _read_or_create_activity_log(set_dir, total_sessions=None) -> dict:
    path = Path(set_dir) / "activity-log.json"
    try:
        log = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(log, dict):
            return log
    except (OSError, json.JSONDecodeError, UnicodeError):
        pass
    return {
        "sessionSetName": Path(set_dir).name,
        "createdDate": _now_iso(),
        "totalSessions": total_sessions or 0,
        "entries": [],
    }


def _write_activity_log(set_dir, log: dict) -> None:
    _atomic_write_json(Path(set_dir) / "activity-log.json", log)


def seed_session_plan(set_dir, session_number: int, total_sessions=None) -> int:
    """Seed spec steps as plan rows — once per session, never re-applied.
    A spec edited mid-flight shows new work only when it is logged."""
    # The spec parser lives with the lifecycle flows; imported lazily so
    # the writer module carries no import-time edge back to session.py.
    from .session import (
        DuplicateSlugError, parse_session_plans, split_slug_marker,
    )

    spec_path = Path(set_dir) / "spec.md"
    try:
        spec_text = spec_path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return 0
    plan = next(
        (p for p in parse_session_plans(spec_text)
         if p["number"] == session_number),
        None,
    )
    if plan is None or not plan["steps"]:
        return 0
    log = _read_or_create_activity_log(set_dir, total_sessions)
    entries = log.setdefault("entries", [])
    if any(
        isinstance(e, dict) and e.get("sessionNumber") == session_number
        and e.get("kind") == "plan-step"
        for e in entries
    ):
        return 0

    # Resolve every step's key before writing anything: an authored
    # `(slug: xxx)` marker is the step's one identity, shared with the
    # plan's step_id, and declaring the same one twice is refused rather
    # than silently renamed. The six-word truncation is only the fallback
    # for a step that declares none.
    resolved = []
    seen_authored: set = set()
    seen_keys: set = set()
    for ordinal, text in enumerate(plan["steps"], start=1):
        clean_text, slug = split_slug_marker(text)
        if slug is not None:
            if slug in seen_authored:
                raise DuplicateSlugError(
                    f"{set_dir}: step slug {slug!r} is declared more than "
                    f"once in session {session_number}"
                )
            seen_authored.add(slug)
            key = slug
        else:
            key = plan_step_key(clean_text, ordinal)
            if key in seen_keys:
                key = f"{key}-{ordinal}"
        seen_keys.add(key)
        resolved.append((key, clean_text))

    now = _now_iso()
    for ordinal, (key, clean_text) in enumerate(resolved, start=1):
        entries.append({
            "sessionNumber": session_number,
            "stepNumber": ordinal,
            "stepKey": key,
            "dateTime": now,
            "description": clean_text,
            "status": "pending",
            "kind": "plan-step",
        })
    _write_activity_log(set_dir, log)
    return len(plan["steps"])


def log_step(
    set_dir, session_number: int, step_key: str, description: str,
    status: str, step_number=None,
) -> None:
    """Closed step vocabulary at the writer; drifted synonyms are read-
    tolerated but never written."""
    if status not in STEP_STATUSES:
        raise ValueError(
            f"step status must be one of {STEP_STATUSES}, got {status!r}"
        )
    log = _read_or_create_activity_log(set_dir)
    log.setdefault("entries", []).append({
        "sessionNumber": session_number,
        "stepNumber": step_number,
        "stepKey": step_key,
        "dateTime": _now_iso(),
        "description": description,
        "status": status,
    })
    _write_activity_log(set_dir, log)


# --- change-log.md -----------------------------------------------------------

def append_change_log_block(set_dir, text: str) -> None:
    path = Path(set_dir) / "change-log.md"
    existing = ""
    try:
        existing = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        pass
    with open(path, "w", encoding="utf-8", newline="") as f:
        if existing:
            f.write(existing.rstrip("\n") + "\n\n" + text.rstrip("\n") + "\n")
        else:
            f.write(text.rstrip("\n") + "\n")


# --- the two files: decisions-log.md and project-work-plan.md ----------------

class SanctionedWriteError(ValueError):
    """A caller reached for something the framework owns.

    Identity, ordering, timestamps, filenames and layout are not content.
    Refusing here rather than at the CLI means a direct API caller -- an
    engine importing the module -- hits the same wall an operator does.
    """


def _require_text(value, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise SanctionedWriteError(f"{field} must be non-empty text")
    return value.strip()


def _require_session_number(value) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 1:
        raise SanctionedWriteError(
            f"sessionNumber must be a positive integer, got {value!r}"
        )
    return value


def _entries_of_kind(log: dict, kind: str) -> list:
    return [
        e for e in log.get("entries") or []
        if isinstance(e, dict) and e.get("kind") == kind
    ]


def _session_records(set_dir) -> dict:
    """number -> {title, status} from the state file, or {} when there is
    none yet. The state owns titles; the log never restates them."""
    raw = read_raw_session_state(Path(set_dir))
    if not isinstance(raw, dict):
        return {}
    records = {}
    for entry in raw.get("sessions") or []:
        if isinstance(entry, dict) and isinstance(entry.get("number"), int):
            records[entry["number"]] = {
                "title": entry.get("title") or f"Session {entry['number']}",
                "status": canonicalize_status(entry.get("status")),
            }
    return records


def append_decision(
    set_dir, *, session_number: int, decider: str, headline: str, body: str,
    model=None, provider=None, decided_on=None, backfill_reason=None,
) -> dict:
    """Append one decision and re-render the log.

    The caller supplies what was decided and why. The writer supplies the
    identifier, the position in the sequence and the time -- so a decision
    cannot be renumbered, backdated, or slipped in between two others.

    A historical entry is possible and is never silent: *decided_on* and
    *backfill_reason* are required together, and the rendered entry says
    it was transcribed. Without that pair a backdated decision would be
    indistinguishable from one recorded as it happened, which is the only
    claim this file makes.
    """
    number = _require_session_number(session_number)
    if decider not in DECIDERS:
        raise SanctionedWriteError(
            f"decider must be one of {DECIDERS}, got {decider!r}"
        )
    headline_text = _require_text(headline, "headline")
    body_text = _require_text(body, "body")
    if (decided_on is None) != (backfill_reason is None):
        raise SanctionedWriteError(
            "decided_on and backfill_reason are supplied together or not at "
            "all: a decision dated by its author without saying it is a "
            "transcription reads exactly like one recorded as it happened."
        )
    recorded_at = _now_iso()
    if decided_on is None:
        decided = recorded_at[:10]
        reason = None
    else:
        decided = _require_text(decided_on, "decided_on")
        try:
            datetime.date.fromisoformat(decided)
        except ValueError as exc:
            raise SanctionedWriteError(
                f"decided_on must be an ISO date (YYYY-MM-DD), got "
                f"{decided_on!r}"
            ) from exc
        reason = _require_text(backfill_reason, "backfill_reason")

    log = _read_or_create_activity_log(set_dir)
    ordinal = len(_entries_of_kind(log, KIND_DECISION)) + 1
    entry = {
        "kind": KIND_DECISION,
        "decisionId": f"D{ordinal}",
        "ordinal": ordinal,
        "sessionNumber": number,
        "decidedOn": decided,
        "recordedAt": recorded_at,
        "decider": decider,
        "headline": headline_text,
        "body": body_text,
    }
    for key, value in (("model", model), ("provider", provider)):
        if isinstance(value, str) and value.strip():
            entry[key] = value.strip()
    if reason is not None:
        entry["backfillReason"] = reason
    log.setdefault("entries", []).append(entry)
    _write_activity_log(set_dir, log)
    render_decisions_log(set_dir)
    return entry


def declare_session_task(
    set_dir, *, session_number: int, task: str, releasable: bool,
) -> dict:
    """Declare what a session will do, and whether it may publish.

    Spec §3.a puts this before development, and the framework enforces the
    order rather than asking for it: the declaration is refused once the
    working tree carries the session's work, refused a second time, and
    refused after the session closes. A declaration made after the code
    exists is a model deciding in hindsight what may be published.
    """
    number = _require_session_number(session_number)
    task_text = _require_text(task, "task")
    if not isinstance(releasable, bool):
        raise SanctionedWriteError(
            "releasable must be True or False -- an undeclared session is "
            "not releasable, and no third value means anything here"
        )
    log = _read_or_create_activity_log(set_dir)
    if any(e.get("sessionNumber") == number
           for e in _entries_of_kind(log, KIND_TASK_DECLARATION)):
        raise SanctionedWriteError(
            f"session {number} has already declared its task list; a "
            "declaration is made once, before the work"
        )
    record = _session_records(set_dir).get(number)
    if record and record["status"] == STATUS_COMPLETE:
        raise SanctionedWriteError(
            f"session {number} is complete; its task list can no longer be "
            "declared, because the declaration is what the work is measured "
            "against"
        )
    # Imported here: ``gates`` reads the ledger and the state, and a
    # top-level edge would make the write discipline depend on the gates
    # that read what it wrote.
    from .gates import material_worktree_changes, preview_paths

    changed, error = material_worktree_changes(set_dir)
    if error:
        raise SanctionedWriteError(
            f"cannot tell whether session {number}'s work has begun: {error}"
        )
    if changed:
        raise SanctionedWriteError(
            f"session {number} cannot declare its task list now: the working "
            f"tree already carries {len(changed)} change(s) "
            f"({preview_paths(changed)}). The declaration comes before the "
            "work -- one made after it is a model deciding in hindsight what "
            "may be published. Commit or revert, then declare."
        )
    entry = {
        "kind": KIND_TASK_DECLARATION,
        "sessionNumber": number,
        "dateTime": _now_iso(),
        "task": task_text,
        "releasable": releasable,
    }
    log.setdefault("entries", []).append(entry)
    _write_activity_log(set_dir, log)
    render_project_work_plan(set_dir)
    return entry


def record_project_plan(set_dir, body: str) -> dict:
    """Record the plan prose the session list hangs off. Appended, not
    overwritten -- the newest is rendered and the earlier ones stay in the
    log, so a plan that changed can be seen to have changed."""
    body_text = _require_text(body, "body")
    log = _read_or_create_activity_log(set_dir)
    entry = {
        "kind": KIND_PROJECT_PLAN,
        "dateTime": _now_iso(),
        "body": body_text,
    }
    log.setdefault("entries", []).append(entry)
    _write_activity_log(set_dir, log)
    render_project_work_plan(set_dir)
    return entry


def read_task_declaration(set_dir, session_number: int):
    """The session's declaration, or None. None is the answer for a
    session that never declared, and callers must read it as "not
    releasable" rather than as "unknown"."""
    log = _read_or_create_activity_log(set_dir)
    for entry in _entries_of_kind(log, KIND_TASK_DECLARATION):
        if entry.get("sessionNumber") == session_number:
            return entry
    return None


def session_is_releasable(set_dir, session_number: int) -> bool:
    """Fails closed. Packaging asks this question, and the absence of a
    declaration is a refusal, never a default yes."""
    declaration = read_task_declaration(set_dir, session_number)
    return bool(declaration and declaration.get("releasable") is True)


def _decider_label(entry: dict) -> str:
    label = str(entry.get("decider", "")).capitalize() or "Unknown"
    model = entry.get("model")
    provider = entry.get("provider")
    if model and provider:
        return f"{label} ({model}/{provider})"
    if model:
        return f"{label} ({model})"
    if provider:
        return f"{label} ({provider})"
    return label


_PROJECTION_NOTE = (
    "**Written by `ai_router.writers` as a fold of `activity-log.json`.**\n"
    "Hand edits are overwritten by the next append. The record is the log;\n"
    "this page is one view of it."
)


def render_decisions_log(set_dir) -> str:
    """Fold the decision rows into `decisions-log.md`, strictly in the
    order they were appended.

    Session headings are emitted where the session changes rather than
    used to group, so a session that receives a later decision appears
    again further down. Grouping would have read better and would have
    put D38 above D10; the file's whole claim is "in order".
    """
    set_path = Path(set_dir)
    log = _read_or_create_activity_log(set_path)
    decisions = sorted(
        _entries_of_kind(log, KIND_DECISION),
        key=lambda e: e.get("ordinal") or 0,
    )
    records = _session_records(set_path)
    lines = [
        f"# Decisions log — {set_path.name}",
        "",
        "Every decision, human or AI, in order, with who made it and what "
        "it was.",
        "",
        _PROJECTION_NOTE,
        "",
        "---",
    ]
    if not decisions:
        lines += ["", "_No decisions recorded yet._"]
    current = None
    seen = set()
    for entry in decisions:
        number = entry.get("sessionNumber") or 0
        if number != current:
            title = (records.get(number) or {}).get("title") \
                or f"Session {number}"
            suffix = " (continued)" if number in seen else ""
            lines += ["", f"## Session {number} — {title}{suffix}"]
            seen.add(number)
            current = number
        lines += [
            "",
            f"### {entry.get('decisionId')} · {entry.get('decidedOn')} · "
            f"{_decider_label(entry)} · {entry.get('headline')}",
            "",
            str(entry.get("body", "")).strip(),
        ]
        if entry.get("backfillReason"):
            lines += [
                "",
                f"*Backfilled on {str(entry.get('recordedAt', ''))[:10]} "
                f"— {entry['backfillReason']}*",
            ]
    text = "\n".join(lines).rstrip("\n") + "\n"
    _write_text_lf(set_path / DECISIONS_LOG_FILENAME, text)
    return text


def render_project_work_plan(set_dir) -> str:
    """Fold the plan prose and the task declarations into
    `project-work-plan.md`: the plan, then every numbered session beside
    what it declared and whether it may publish."""
    set_path = Path(set_dir)
    log = _read_or_create_activity_log(set_path)
    plans = _entries_of_kind(log, KIND_PROJECT_PLAN)
    declarations = {
        e.get("sessionNumber"): e
        for e in _entries_of_kind(log, KIND_TASK_DECLARATION)
    }
    records = _session_records(set_path)
    numbers = sorted(
        n for n in set(records) | set(declarations) if isinstance(n, int)
    )
    lines = [
        f"# Project work plan — {set_path.name}",
        "",
        _PROJECTION_NOTE,
        "",
        "---",
        "",
        "## The plan",
        "",
        plans[-1]["body"].strip() if plans else "_No plan recorded yet._",
        "",
        "## Sessions",
        "",
        "| # | Session | Releasable | Declared |",
        "| ---: | --- | --- | --- |",
    ]
    if not numbers:
        lines.append("| — | _no sessions yet_ | — | — |")
    for number in numbers:
        title = (records.get(number) or {}).get("title") or f"Session {number}"
        declared = declarations.get(number)
        releasable = "—" if declared is None else (
            "yes" if declared.get("releasable") else "no"
        )
        when = "not declared" if declared is None else str(
            declared.get("dateTime", "")
        )[:10]
        lines.append(f"| {number} | {title} | {releasable} | {when} |")
    for number in numbers:
        declared = declarations.get(number)
        if declared is None:
            continue
        title = (records.get(number) or {}).get("title") or f"Session {number}"
        lines += [
            "",
            f"### Session {number} — {title}",
            "",
            "**Releasable: "
            + ("yes" if declared.get("releasable") else "no")
            + ".**",
            "",
            str(declared.get("task", "")).strip(),
        ]
    text = "\n".join(lines).rstrip("\n") + "\n"
    _write_text_lf(set_path / WORK_PLAN_FILENAME, text)
    return text


# --- cancel/restore audit markers --------------------------------------------

def _prepend_history_entry(existing, verb: str, reason: str,
                           when: str) -> str:
    """New entry above prior ones, one accumulated history per marker file.
    Malformed prior content (manual edits) is preserved verbatim below a
    fresh header — filename presence is the signal that must survive."""
    entry = f"{verb} on {when}\n{reason}\n\n"
    if existing is None:
        return f"{_CANCEL_HISTORY_HEADER}\n\n{entry}"
    if existing.startswith(_CANCEL_HISTORY_HEADER):
        tail = existing[len(_CANCEL_HISTORY_HEADER):].lstrip("\n")
        return f"{_CANCEL_HISTORY_HEADER}\n\n{entry}{tail}"
    return f"{_CANCEL_HISTORY_HEADER}\n\n{entry}{existing}"


def _write_text_lf(path: Path, content: str) -> None:
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(content)
