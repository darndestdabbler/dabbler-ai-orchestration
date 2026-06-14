"""Disposition artifact — per-session structured outcome record.

A ``disposition.json`` file lives at the root of a session-set folder
once a session has produced a verifiable outcome (post-verification,
pre-closeout). It is the structured handoff between the verifier and
the close-out machinery and between consecutive sessions: it records
what happened, which files were touched, how the work was verified,
what the next orchestrator should be, and any blockers that prevented
a clean ``completed`` outcome.

Set 026 Session 1 removed the queue-mediated daemon path
(``verification_method: "queue"``). The surviving methods are
``"api"`` (synchronous per-call providers), ``"manual"`` (manual
cross-provider review via the IDE-agent paste path), and ``"skipped"``
(explicit zero-budget opt-out recorded in ``budget.yaml``).
``verification_message_ids`` is preserved as a list field but is
expected to be empty in every surviving path.

This module is data + atomic I/O only. It does not enforce close-out
gates and does not mutate ``session-state.json``.

Atomic writes
-------------
``write_disposition`` writes to a sibling temp file in the same
directory and ``os.replace``s it into place. ``os.replace`` is atomic
on POSIX and on Windows (it uses ``MoveFileEx`` with replace-existing),
so a mid-write crash either leaves the temp file (which a fresh write
overwrites) or leaves the prior good file untouched — never a partial
``disposition.json``.
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

# Dual-mode import: relative when loaded as a submodule via the
# importlib spec_from_file_location pattern (production); absolute
# when loaded as a top-level module via the test conftest (which adds
# ai_router/ to sys.path so submodules are importable by bare filename).
try:
    from .session_state import (  # type: ignore[import-not-found]
        NextOrchestrator,
        NextOrchestratorReason,
        validate_next_orchestrator,
    )
except ImportError:
    from session_state import (  # type: ignore[no-redef]
        NextOrchestrator,
        NextOrchestratorReason,
        validate_next_orchestrator,
    )


DISPOSITION_FILENAME = "disposition.json"

DISPOSITION_STATUSES = ("completed", "failed", "requires_review")
VERIFICATION_METHODS = ("api", "manual", "skipped")
CANONICAL_VERDICTS = ("VERIFIED", "ISSUES_FOUND")

SWITCH_DUE_TO_BLOCKER = "switch-due-to-blocker"


@dataclass
class Disposition:
    """Per-session structured outcome record.

    Fields
    ------
    - ``status``: one of :data:`DISPOSITION_STATUSES`. ``completed``
      means verification passed; ``failed`` means the session could
      not produce verifiable work; ``requires_review`` means a human
      decision is required (e.g., an UNKNOWN verifier finding the
      orchestrator wants to challenge).
    - ``summary``: short narrative describing what landed.
    - ``files_changed``: list of file paths created or modified during
      the session.
    - ``verification_method``: one of :data:`VERIFICATION_METHODS`.
      ``api`` is the synchronous per-call provider path; ``manual`` is
      cross-provider review via the IDE-agent paste path; ``skipped``
      is the explicit zero-budget opt-out recorded in ``budget.yaml``.
    - ``verification_message_ids``: kept as a list field for schema
      stability; expected to be empty for every surviving method
      (validated by :func:`validate_disposition`).
    - ``next_orchestrator``: which orchestrator should run the next
      session. Required when ``status == "completed"`` and the closing
      session is not the final one in the set. Validated via
      :func:`session_state.validate_next_orchestrator`.
    - ``blockers``: list of blocker descriptions. Required to be
      non-empty when ``next_orchestrator.reason.code ==
      "switch-due-to-blocker"``.
    - ``verification_verdict``: the verifier's pass/fail outcome for
      this session.  One of :data:`CANONICAL_VERDICTS` on the auto
      path; ``None`` (omitted) when the session was closed without a
      routed verifier (manual / skipped / --no-router).  Non-canonical
      extension tokens are accepted but trigger a stderr warning via
      :func:`validate_disposition`.  Written to ``session-state.json``
      by ``close_session`` when non-null.
    - ``lessons_cited``: Set 064 (D3, citation-at-close keystone) — the
      ids of the guidance lessons (``L-<set>-<seq>``) that were
      instrumental in this session. The work agent populates it and runs
      ``python -m ai_router.cite_lessons`` so the markdown ``last-used-set``
      edit lands inside the committed work; ``close_session`` reads this
      field only to record a ``lessons_cited`` entry in the
      ``closeout_succeeded`` event (and to flag unknown ids as a
      non-blocking mismatch). Omit-empty: absent when no lessons were
      cited, so older readers never see an unexpected key. An
      empty/absent list is fully inert — silence never auto-evicts.
    """

    status: str
    summary: str
    verification_method: str
    files_changed: List[str] = field(default_factory=list)
    verification_message_ids: List[str] = field(default_factory=list)
    next_orchestrator: Optional[NextOrchestrator] = None
    blockers: List[str] = field(default_factory=list)
    verification_verdict: Optional[str] = None
    lessons_cited: List[str] = field(default_factory=list)


def _disposition_path(session_set_dir: str) -> str:
    return os.path.join(session_set_dir, DISPOSITION_FILENAME)


def _next_orchestrator_to_dict(value: Optional[NextOrchestrator]) -> Optional[dict]:
    if value is None:
        return None
    if isinstance(value, NextOrchestrator):
        reason = value.reason
        if isinstance(reason, NextOrchestratorReason):
            reason_dict = {"code": reason.code, "specifics": reason.specifics}
        elif isinstance(reason, dict):
            reason_dict = dict(reason)
        else:
            reason_dict = reason  # type: ignore[assignment]
        return {
            "engine": value.engine,
            "provider": value.provider,
            "model": value.model,
            "effort": value.effort,
            "reason": reason_dict,
        }
    if isinstance(value, dict):
        return dict(value)
    raise TypeError(
        f"next_orchestrator must be NextOrchestrator, dict, or None "
        f"(got {type(value).__name__})"
    )


def _next_orchestrator_from_dict(value: Optional[dict]) -> Optional[NextOrchestrator]:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise TypeError(
            f"next_orchestrator dict expected, got {type(value).__name__}"
        )
    reason_value = value.get("reason")
    if isinstance(reason_value, dict):
        reason = NextOrchestratorReason(
            code=reason_value.get("code"),  # type: ignore[arg-type]
            specifics=reason_value.get("specifics", ""),
        )
    else:
        # Preserve whatever was on disk; validate_next_orchestrator
        # will catch a non-dict reason at validation time.
        reason = reason_value  # type: ignore[assignment]
    return NextOrchestrator(
        engine=value.get("engine", ""),
        provider=value.get("provider", ""),
        model=value.get("model", ""),
        effort=value.get("effort", ""),
        reason=reason,  # type: ignore[arg-type]
    )


def disposition_to_dict(disposition: Disposition) -> dict:
    """Return a JSON-serializable dict representation of *disposition*.

    Field order is fixed (status, summary, files_changed,
    verification_method, verification_message_ids, next_orchestrator,
    blockers) so the on-disk file is deterministic. ``next_orchestrator``
    is always present, with ``null`` when unset, so consumers do not
    need to test for the key. ``verification_verdict`` uses omit-null:
    the key is absent when the verdict is not known, so older readers
    that pre-date this field never see an unexpected key.
    """
    d: dict = {
        "status": disposition.status,
        "summary": disposition.summary,
        "files_changed": list(disposition.files_changed),
        "verification_method": disposition.verification_method,
        "verification_message_ids": list(disposition.verification_message_ids),
        "next_orchestrator": _next_orchestrator_to_dict(disposition.next_orchestrator),
        "blockers": list(disposition.blockers),
    }
    if disposition.verification_verdict is not None:
        d["verification_verdict"] = disposition.verification_verdict
    # Omit-empty (Set 064 D3): the key is absent when no lessons were
    # cited, so readers that pre-date this field never see it.
    if disposition.lessons_cited:
        d["lessons_cited"] = list(disposition.lessons_cited)
    return d


def disposition_from_dict(data: dict) -> Disposition:
    """Reconstruct a :class:`Disposition` from its dict form.

    Missing list fields default to empty lists so the round-trip is
    tolerant of older files that omitted optional list keys. Type
    mismatches surface at validation time rather than here, so a
    malformed file can be loaded for inspection without raising.
    """
    return Disposition(
        status=data.get("status", ""),
        summary=data.get("summary", ""),
        files_changed=list(data.get("files_changed") or []),
        verification_method=data.get("verification_method", ""),
        verification_message_ids=list(data.get("verification_message_ids") or []),
        next_orchestrator=_next_orchestrator_from_dict(data.get("next_orchestrator")),
        blockers=list(data.get("blockers") or []),
        verification_verdict=data.get("verification_verdict"),
        lessons_cited=list(data.get("lessons_cited") or []),
    )


def write_disposition(session_set_dir: str, disposition: Disposition) -> str:
    """Atomically write *disposition* to ``<session_set_dir>/disposition.json``.

    Uses a sibling temp file plus ``os.replace`` so a mid-write crash
    cannot leave a truncated ``disposition.json``. Returns the absolute
    path written. Idempotent: writing the same disposition twice
    produces identical file contents.
    """
    if not isinstance(disposition, Disposition):
        raise TypeError(
            f"write_disposition expects a Disposition (got "
            f"{type(disposition).__name__})"
        )
    if not os.path.isdir(session_set_dir):
        raise FileNotFoundError(
            f"session_set_dir does not exist or is not a directory: "
            f"{session_set_dir}"
        )

    path = _disposition_path(session_set_dir)
    payload = disposition_to_dict(disposition)
    serialized = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"

    # PID-suffixed temp name so concurrent writers from different
    # processes don't trample each other's temp file. os.replace at
    # the end serializes the visible swap regardless.
    tmp_path = f"{path}.tmp.{os.getpid()}"
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write(serialized)
        f.flush()
        try:
            os.fsync(f.fileno())
        except OSError:
            # Some filesystems (older Windows network shares, tmpfs in
            # CI) don't support fsync. The os.replace below is the
            # atomicity guarantee; fsync is just extra durability.
            pass

    os.replace(tmp_path, path)
    return path


def read_disposition(session_set_dir: str) -> Optional[Disposition]:
    """Return the parsed :class:`Disposition` from disk, or ``None`` if absent.

    Returns ``None`` (rather than raising) when the file is missing or
    cannot be parsed as JSON. Callers that need to distinguish
    "missing" from "malformed" should check the file existence first
    and call :func:`json.load` directly.
    """
    path = _disposition_path(session_set_dir)
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    return disposition_from_dict(data)


def _is_str_list(value: object) -> bool:
    return isinstance(value, list) and all(isinstance(x, str) for x in value)


def validate_disposition(
    disposition: object,
    is_final_session: bool = False,
) -> Tuple[bool, List[str]]:
    """Return ``(passed, errors)`` for a :class:`Disposition` or dict.

    Cross-field rules:

    1. ``status`` must be one of :data:`DISPOSITION_STATUSES`.
    2. ``summary`` must be a non-empty string.
    3. ``files_changed`` must be a list of strings.
    4. ``verification_method`` must be one of :data:`VERIFICATION_METHODS`.
    5. ``verification_message_ids`` must be a list of strings, and
       must be **empty** for every surviving ``verification_method``.
       The list field is kept for schema stability; populating it has
       no consumer since Set 026 Session 1 removed the queue path.
    6. ``next_orchestrator``, when present, must satisfy
       :func:`validate_next_orchestrator`. It is **required** when
       ``status == "completed"`` and ``is_final_session`` is False.
    7. ``blockers`` must be a list of strings, and must be **non-empty**
       when ``next_orchestrator.reason.code == "switch-due-to-blocker"``.

    Errors are agent-readable strings — short enough to surface in a
    verifier prompt without further wrangling.
    """
    errors: List[str] = []

    if isinstance(disposition, Disposition):
        # Build the dict view manually rather than via
        # disposition_to_dict — the latter raises on a malformed
        # next_orchestrator, which would defeat validation.
        data = {
            "status": disposition.status,
            "summary": disposition.summary,
            "files_changed": disposition.files_changed,
            "verification_method": disposition.verification_method,
            "verification_message_ids": disposition.verification_message_ids,
            "next_orchestrator": disposition.next_orchestrator,
            "blockers": disposition.blockers,
            "verification_verdict": disposition.verification_verdict,
            "lessons_cited": disposition.lessons_cited,
        }
    elif isinstance(disposition, dict):
        data = disposition
    else:
        return False, [
            f"disposition must be a Disposition or dict, "
            f"got {type(disposition).__name__}"
        ]

    status = data.get("status")
    if status not in DISPOSITION_STATUSES:
        allowed = ", ".join(DISPOSITION_STATUSES)
        errors.append(
            f"status must be one of: {allowed} (got {status!r})"
        )

    summary = data.get("summary")
    if not isinstance(summary, str) or summary.strip() == "":
        errors.append("summary must be a non-empty string")

    files_changed = data.get("files_changed")
    if not _is_str_list(files_changed):
        errors.append("files_changed must be a list of strings")

    verification_method = data.get("verification_method")
    if verification_method not in VERIFICATION_METHODS:
        allowed = ", ".join(VERIFICATION_METHODS)
        errors.append(
            f"verification_method must be one of: {allowed} "
            f"(got {verification_method!r})"
        )

    message_ids = data.get("verification_message_ids")
    if not _is_str_list(message_ids):
        errors.append(
            "verification_message_ids must be a list of strings"
        )
    else:
        if verification_method == "queue" and len(message_ids) == 0:
            errors.append(
                "verification_message_ids must be non-empty when "
                "verification_method == 'queue'"
            )
        if verification_method == "api" and len(message_ids) > 0:
            errors.append(
                "verification_message_ids must be empty when "
                "verification_method == 'api' (queue references are "
                "only meaningful for the queue-mediated path)"
            )

    next_orc = data.get("next_orchestrator")
    if status == "completed" and not is_final_session and next_orc is None:
        errors.append(
            "next_orchestrator is required when status == 'completed' "
            "and the session is not the final one in the set"
        )
    if next_orc is not None:
        no_passed, no_errors = validate_next_orchestrator(next_orc)
        if not no_passed:
            errors.extend(f"next_orchestrator.{e}" for e in no_errors)

    blockers = data.get("blockers")
    if not _is_str_list(blockers):
        errors.append("blockers must be a list of strings")

    # Blocker-required rule fires only when next_orchestrator parses to a
    # dict with a recognizable switch-due-to-blocker reason code. If
    # next_orchestrator is malformed, the validate_next_orchestrator
    # errors above are already reported and this rule doesn't pile on.
    no_dict = next_orc if isinstance(next_orc, dict) else None
    if no_dict is None and isinstance(next_orc, NextOrchestrator):
        no_dict = _next_orchestrator_to_dict(next_orc)
    if no_dict is not None:
        reason = no_dict.get("reason")
        reason_code = (
            reason.get("code") if isinstance(reason, dict) else None
        )
        if reason_code == SWITCH_DUE_TO_BLOCKER:
            if not _is_str_list(blockers) or len(blockers) == 0:
                errors.append(
                    "blockers must be non-empty when "
                    "next_orchestrator.reason.code == "
                    "'switch-due-to-blocker'"
                )

    verdict = data.get("verification_verdict")
    if verdict is not None:
        if not isinstance(verdict, str) or verdict == "":
            errors.append(
                "verification_verdict must be a non-empty string or null "
                f"(got {verdict!r})"
            )
        elif verdict not in CANONICAL_VERDICTS:
            # Non-canonical tokens (e.g. ISSUES_FOUND_RESOLVED_IN_FLIGHT)
            # are accepted but flagged so operators notice the drift from
            # the VERIFIED/ISSUES_FOUND domain. Never added to errors —
            # the :219 prefix-match / enum-non-enforcement reader contract
            # is preserved.
            print(
                f"WARNING: disposition.verification_verdict {verdict!r} is "
                f"non-canonical (expected one of {CANONICAL_VERDICTS}); "
                "accepted but consider using the canonical token",
                file=sys.stderr,
            )

    # Set 064 D3: lessons_cited, when present, must be a list of strings.
    # Whether each id actually exists in a guidance file is a non-blocking
    # check done by close_session (a typo'd id is a mismatch warning, not a
    # disposition error), so this stays a shape check only.
    lessons_cited = data.get("lessons_cited")
    if lessons_cited is not None and not _is_str_list(lessons_cited):
        errors.append("lessons_cited must be a list of strings")

    return (len(errors) == 0), errors
