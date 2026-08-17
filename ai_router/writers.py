"""The sanctioned writers for the per-set artifacts.

Every byte written to ``session-state.json``, ``activity-log.json``,
``change-log.md`` and the cancel/restore audit markers goes through this
module. The writers validate against the schema, enforce the closed
verdict and step vocabularies, and record a content hash so an
out-of-band edit is detectable. Lifecycle FLOW logic (boundary triad,
locking, gates, CLI) lives in ``session.py``; this module owns the write
discipline and nothing else.
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
        for key in ("startedAt", "completedAt", "orchestrator",
                    "verificationVerdict"):
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
    from .session import parse_session_plans

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
    now = _now_iso()
    seen_keys: set = set()
    for ordinal, text in enumerate(plan["steps"], start=1):
        key = plan_step_key(text, ordinal)
        if key in seen_keys:
            key = f"{key}-{ordinal}"
        seen_keys.add(key)
        entries.append({
            "sessionNumber": session_number,
            "stepNumber": ordinal,
            "stepKey": key,
            "dateTime": now,
            "description": text,
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
