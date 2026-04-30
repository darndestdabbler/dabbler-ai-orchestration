"""Session-state file management.

Writes and updates ``session-state.json`` in a session-set folder so external
tools (the Session Set Explorer VS Code extension, ``find_active_session_set``,
``print_session_set_status``) can detect that a set is in-progress before the
first ``activity-log.json`` entry has been written.

The file is written once at the start of each session (overwriting any prior
contents) and updated once at the end to flip ``status`` from ``in-progress``
to ``complete``. The committed state at the end of session N reflects the
completed-and-verified state of session N; the start of session N+1 overwrites
it again.

Schema versions
---------------

- v1 (legacy): tracked progress via the binary ``status`` field
  (``"in-progress" | "complete"``). Did not carry per-session lifecycle
  granularity — work-verified vs closeout-pending vs closed all collapsed
  to ``"complete"``.
- v2 (current): adds ``lifecycleState`` from :class:`SessionLifecycleState`
  for explicit lifecycle granularity. Keeps ``status`` for backward
  compatibility with consumers (VS Code Session Set Explorer, dashboards)
  that have not yet been updated. New writes always set both. v1 files
  are migrated lazily on read — the in-memory dict gets ``schemaVersion``
  bumped and ``lifecycleState`` derived from ``status``; the file on disk
  is rewritten as v2 on the next ``register_session_start`` or
  ``mark_session_complete`` call.
"""

import json
import os
import re
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import List, Literal, Optional, Tuple

import yaml


SESSION_STATE_FILENAME = "session-state.json"
SCHEMA_VERSION = 2


class SessionLifecycleState(str, Enum):
    """Lifecycle stages a session passes through.

    Stored in ``session-state.json`` (v2+) under ``lifecycleState``. Values are
    the JSON-serialized form (the enum is a ``str`` subclass for that reason).

    - ``work_in_progress``: the session's primary work is underway. Set at
      ``register_session_start``.
    - ``work_verified``: cross-provider verification has produced a VERIFIED
      verdict for this session. Reserved for the close-out machinery
      (Set 3); not written by Set 1 mechanics.
    - ``closeout_pending``: verification has succeeded but the close-out
      script (commit / push / mark-complete / notify) has not yet run.
      Reserved for Set 3.
    - ``closeout_blocked``: close-out cannot proceed (e.g., unresolved
      Critical/Major issues, pending human UAT). Reserved for Set 3.
    - ``closed``: the session is fully complete — verified, committed,
      pushed, marked complete. Set at ``mark_session_complete``.
    """

    WORK_IN_PROGRESS = "work_in_progress"
    WORK_VERIFIED = "work_verified"
    CLOSEOUT_PENDING = "closeout_pending"
    CLOSEOUT_BLOCKED = "closeout_blocked"
    CLOSED = "closed"


# v1 status -> v2 lifecycle state. Only the two v1 status values exist; this
# mapping is the entire migration contract.
_V1_STATUS_TO_LIFECYCLE = {
    "in-progress": SessionLifecycleState.WORK_IN_PROGRESS,
    "complete": SessionLifecycleState.CLOSED,
}


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat()


def _state_path(session_set_dir: str) -> str:
    return os.path.join(session_set_dir, SESSION_STATE_FILENAME)


def register_session_start(
    session_set: str,
    session_number: int,
    total_sessions: Optional[int],
    orchestrator_engine: str,
    orchestrator_model: str,
    orchestrator_effort: str = "unknown",
    orchestrator_provider: Optional[str] = None,
) -> str:
    """Write ``session-state.json`` marking *session_number* as in-progress.

    Called at the start of every session. Overwrites any prior state file.
    Returns the absolute path to the written file.

    ``orchestrator_effort`` accepts ``"low"``, ``"medium"``, ``"high"``,
    ``"fast"``, ``"normal"``, or ``"unknown"`` — orchestrators that cannot
    introspect their own effort level pass ``"unknown"`` rather than guess.
    """
    state = {
        "schemaVersion": SCHEMA_VERSION,
        "sessionSetName": os.path.basename(session_set.rstrip("/\\")),
        "currentSession": session_number,
        "totalSessions": total_sessions,
        "status": "in-progress",
        "lifecycleState": SessionLifecycleState.WORK_IN_PROGRESS.value,
        "startedAt": _now_iso(),
        "completedAt": None,
        "verificationVerdict": None,
        "orchestrator": {
            "engine": orchestrator_engine,
            "provider": orchestrator_provider,
            "model": orchestrator_model,
            "effort": orchestrator_effort,
        },
    }
    path = _state_path(session_set)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)
        f.write("\n")

    # Propagate to activity-log.json. Historically, activity-log.json was
    # created with totalSessions=0 by the SessionLog constructor and was
    # never updated, so done sets ended up with totalSessions=0 in the log
    # even though the orchestrator knew the real total. The orchestrator
    # passes total_sessions on every register_session_start call, so this
    # is the natural sync point: if the activity log has 0/null and the
    # caller knows a real total, write it.
    if total_sessions and total_sessions > 0:
        _propagate_total_sessions(session_set, total_sessions)

    return path


def _propagate_total_sessions(session_set: str, total: int) -> None:
    """Update activity-log.json's totalSessions if it is missing or zero."""
    log_path = os.path.join(session_set, "activity-log.json")
    if not os.path.isfile(log_path):
        return
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return
    current = data.get("totalSessions") or 0
    if current > 0:
        return  # trust the existing value
    data["totalSessions"] = total
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def mark_session_complete(
    session_set: str,
    verification_verdict: Optional[str] = None,
) -> Optional[str]:
    """Flip ``session-state.json`` ``status`` to ``complete`` for the current session.

    Called at the end of Step 8, just before ``git commit``, so the committed
    file reflects the completed-and-verified state. Returns the path if
    updated, ``None`` if no state file existed.
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


def _finalize_total_sessions_from_entries(session_set: str) -> None:
    """If activity-log.json's totalSessions is missing or zero, set it to
    the count of unique sessionNumbers in entries. Idempotent.
    """
    log_path = os.path.join(session_set, "activity-log.json")
    if not os.path.isfile(log_path):
        return
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return
    current = data.get("totalSessions") or 0
    if current > 0:
        return
    sessions = {
        e.get("sessionNumber")
        for e in data.get("entries", [])
        if isinstance(e.get("sessionNumber"), int)
    }
    if not sessions:
        return
    data["totalSessions"] = len(sessions)
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def _migrate_v1_to_v2_inplace(state: dict) -> dict:
    """Transform a v1 state dict to v2 shape in-memory.

    No-op for dicts already at schemaVersion >= 2. v1 files that lack a
    recognized status value get ``lifecycleState=work_in_progress`` as a
    safe default — that mirrors what an orchestrator would have written had
    it been authoring a fresh start, and the next legitimate write (start
    or complete) corrects it.
    """
    schema_version = state.get("schemaVersion")
    if isinstance(schema_version, int) and schema_version >= SCHEMA_VERSION:
        return state
    if "lifecycleState" not in state:
        legacy_status = state.get("status")
        derived = _V1_STATUS_TO_LIFECYCLE.get(
            legacy_status, SessionLifecycleState.WORK_IN_PROGRESS
        )
        state["lifecycleState"] = derived.value
    state["schemaVersion"] = SCHEMA_VERSION
    return state


def read_session_state(session_set_dir: str) -> Optional[dict]:
    """Return parsed ``session-state.json`` contents, or ``None`` if absent or unreadable.

    Lazily migrates v1 files to v2 shape in the returned dict (does not
    rewrite the file — see module docstring).
    """
    path = _state_path(session_set_dir)
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            state = json.load(f)
    except Exception:
        return None
    if not isinstance(state, dict):
        return None
    return _migrate_v1_to_v2_inplace(state)


# ---------------------------------------------------------------------------
# Next-orchestrator rubric
# ---------------------------------------------------------------------------

NextOrchestratorReasonCode = Literal[
    "continue-current-trajectory",
    "switch-due-to-blocker",
    "switch-due-to-cost",
    "other",
]

NEXT_ORCHESTRATOR_REASON_CODES = {
    "continue-current-trajectory",
    "switch-due-to-blocker",
    "switch-due-to-cost",
    "other",
}

NEXT_ORCHESTRATOR_SPECIFICS_MIN_LEN = 30


@dataclass
class NextOrchestratorReason:
    """Why the next session should run on a particular orchestrator.

    ``code`` is one of :data:`NEXT_ORCHESTRATOR_REASON_CODES`. ``specifics``
    is free-form prose explaining the call (≥ 30 chars to force a real
    sentence rather than ``"n/a"`` or one-word boilerplate).

    The ``code`` annotation is a ``Literal`` typed alias rather than ``str`` so
    static type checkers reject unknown codes at construction time. Runtime
    validation in :func:`validate_next_orchestrator` is the source of truth
    when the value originates from JSON (where the type hint can't help).
    """

    code: NextOrchestratorReasonCode
    specifics: str


@dataclass
class NextOrchestrator:
    """Recommendation for which orchestrator runs the next session.

    Mirrors the ``orchestrator`` block in ``session-state.json`` plus a
    structured reason. Validate via :func:`validate_next_orchestrator`
    before persisting.
    """

    engine: str
    provider: str
    model: str
    effort: str
    reason: NextOrchestratorReason


def _is_nonempty_str(value: object) -> bool:
    return isinstance(value, str) and value.strip() != ""


def validate_next_orchestrator(
    candidate: object,
) -> Tuple[bool, List[str]]:
    """Return ``(passed, errors)`` for a NextOrchestrator-shaped value.

    Accepts either a :class:`NextOrchestrator` instance or an equivalent
    dict (the latter is the form encountered when reading from JSON).

    Errors are agent-readable strings — short enough to surface in a
    verifier prompt without further wrangling.
    """
    errors: List[str] = []

    if isinstance(candidate, NextOrchestrator):
        data = {
            "engine": candidate.engine,
            "provider": candidate.provider,
            "model": candidate.model,
            "effort": candidate.effort,
            "reason": (
                {
                    "code": candidate.reason.code,
                    "specifics": candidate.reason.specifics,
                }
                if isinstance(candidate.reason, NextOrchestratorReason)
                else candidate.reason
            ),
        }
    elif isinstance(candidate, dict):
        data = candidate
    else:
        return False, [
            "next_orchestrator must be a NextOrchestrator or dict, "
            f"got {type(candidate).__name__}"
        ]

    for field_name in ("engine", "provider", "model", "effort"):
        if not _is_nonempty_str(data.get(field_name)):
            errors.append(f"{field_name} must be a non-empty string")

    reason = data.get("reason")
    if reason is None:
        errors.append("reason is required")
    elif not isinstance(reason, dict):
        errors.append("reason must be an object with code + specifics")
    else:
        code = reason.get("code")
        if not _is_nonempty_str(code):
            errors.append("reason.code must be a non-empty string")
        elif code not in NEXT_ORCHESTRATOR_REASON_CODES:
            allowed = ", ".join(sorted(NEXT_ORCHESTRATOR_REASON_CODES))
            errors.append(
                f"reason.code must be one of: {allowed} (got {code!r})"
            )

        specifics = reason.get("specifics")
        if not isinstance(specifics, str):
            errors.append("reason.specifics must be a string")
        elif len(specifics.strip()) < NEXT_ORCHESTRATOR_SPECIFICS_MIN_LEN:
            errors.append(
                f"reason.specifics must be at least "
                f"{NEXT_ORCHESTRATOR_SPECIFICS_MIN_LEN} chars "
                f"(got {len(specifics.strip())})"
            )

    return (len(errors) == 0), errors


# ---------------------------------------------------------------------------
# Mode config (parsed from spec.md "Session Set Configuration" block)
# ---------------------------------------------------------------------------

OUTSOURCE_MODES = {"first", "last"}
ROLE_VALUES = {"claude", "openai", "gemini"}
DEFAULT_OUTSOURCE_MODE = "first"


@dataclass
class ModeConfig:
    """Mode-aware configuration declared in spec.md's Session Set Configuration block.

    - ``outsource_mode``: ``"first"`` (default; orchestrator is a frontier
      model, verification routes to a cheaper outsourced model) or
      ``"last"`` (orchestrator and verifier roles swap; the cheap model
      drives, the frontier model verifies).
    - ``orchestrator_role`` / ``verifier_role``: only meaningful when
      ``outsource_mode == "last"``. Identifies which provider drives and
      which verifies. ``None`` when not declared.
    """

    outsource_mode: str = DEFAULT_OUTSOURCE_MODE
    orchestrator_role: Optional[str] = None
    verifier_role: Optional[str] = None


def _extract_session_set_configuration_block(spec_text: str) -> Optional[dict]:
    """Find the YAML config block that follows ``## Session Set Configuration``.

    Tolerates the heading at any indentation level and accepts an ATX
    heading at any depth. Search is bounded to the section between the
    Configuration heading and the next markdown heading or horizontal
    rule, so a YAML fence belonging to a later section can never be
    misread as the configuration. A leading UTF-8 BOM is stripped so a
    BOM-prefixed spec parses normally.

    Returns the parsed YAML mapping, or ``None`` if the block is absent
    or malformed.
    """
    spec_text = spec_text.lstrip("﻿")
    heading_pattern = re.compile(
        r"^\s*#{1,6}\s+Session\s+Set\s+Configuration\s*$",
        re.IGNORECASE | re.MULTILINE,
    )
    match = heading_pattern.search(spec_text)
    if not match:
        return None

    after_heading = spec_text[match.end():]

    # Prefer a YAML-labeled fence over an unlabeled one. If both exist
    # in the configuration section, the labeled fence is unambiguously
    # the configuration; an unlabeled fence is accepted only as a
    # fallback (e.g., for older specs that omitted the label).
    yaml_fence_pattern = re.compile(
        r"```ya?ml\s*\n(.*?)\n```",
        re.DOTALL,
    )
    any_fence_pattern = re.compile(
        r"```[^\n]*\n(.*?)\n```",
        re.DOTALL,
    )
    fence_match = (
        yaml_fence_pattern.search(after_heading)
        or any_fence_pattern.search(after_heading)
    )

    # Section terminator: the next markdown heading or horizontal rule
    # at the start of a line. Computed against the unbounded
    # ``after_heading`` so we can compare its position to the fence
    # position. (A terminator pattern can legitimately appear *inside*
    # a fenced YAML body — e.g. a YAML comment line ``# foo`` or a
    # YAML document separator ``---`` — so it must not be used to bound
    # the search before fence detection.)
    terminator_match = re.search(
        r"\n\s*(?:---\s*\n|#{1,6}\s)",
        after_heading,
    )

    if fence_match and (
        terminator_match is None
        or fence_match.start() < terminator_match.start()
    ):
        # The fence opens before any next-section signal, so it is the
        # configuration block. The fence body itself is delimited by
        # ``` ``` ``` so internal ``#`` comments and ``---`` separators
        # are safe.
        body = fence_match.group(1)
    else:
        # No fence in this section (or the section ends before any fence
        # opens). Treat the bounded section as raw YAML.
        section = (
            after_heading[: terminator_match.start()]
            if terminator_match
            else after_heading
        )
        body = section

    try:
        parsed = yaml.safe_load(body)
    except yaml.YAMLError:
        return None
    if not isinstance(parsed, dict):
        return None
    return parsed


def parse_mode_config(spec_text: str) -> ModeConfig:
    """Parse a :class:`ModeConfig` from raw spec.md text.

    Missing fields fall back to defaults: ``outsource_mode`` defaults to
    ``"first"``, role fields default to ``None``. Values present in the
    spec are preserved as-is (no coercion to default), so invalid
    configurations surface as validation errors via
    :func:`validate_mode_config` rather than being silently masked.

    A spec without a ``Session Set Configuration`` block parses to
    ``ModeConfig()`` — this is the legacy / pre-block path and is valid
    by definition.
    """
    block = _extract_session_set_configuration_block(spec_text) or {}

    outsource_mode = block.get("outsourceMode", DEFAULT_OUTSOURCE_MODE)

    def _role(key: str) -> Optional[str]:
        value = block.get(key)
        if value is None:
            return None
        if isinstance(value, str):
            return value
        # Non-string values (numbers, lists, etc.) are not valid roles.
        # Coerce to a marker string that ``validate_mode_config`` will
        # reject explicitly, rather than dropping it to None silently.
        return str(value)

    return ModeConfig(
        outsource_mode=outsource_mode,
        orchestrator_role=_role("orchestratorRole"),
        verifier_role=_role("verifierRole"),
    )


def read_mode_config(session_set_dir: str) -> ModeConfig:
    """Read and parse the mode config from ``<session_set_dir>/spec.md``.

    A missing spec.md or a missing Session Set Configuration block
    yields the default ``ModeConfig`` rather than an error — older sets
    that pre-date the block are valid by definition (treated as
    ``outsourceMode: first``, no roles).
    """
    spec_path = os.path.join(session_set_dir, "spec.md")
    if not os.path.isfile(spec_path):
        return ModeConfig()
    try:
        with open(spec_path, "r", encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return ModeConfig()
    return parse_mode_config(text)


def validate_mode_config(
    config: ModeConfig,
) -> Tuple[bool, List[str]]:
    """Validate cross-field rules for a :class:`ModeConfig`.

    - ``outsource_mode`` must be one of the known values.
    - When ``outsource_mode == "last"``, both ``orchestrator_role`` and
      ``verifier_role`` are required and must differ (otherwise the
      generator and verifier are the same provider, defeating
      cross-provider verification).
    - When ``outsource_mode == "first"``, role fields are ignored — they
      may be present without raising, but they have no effect.
    """
    errors: List[str] = []

    if config.outsource_mode not in OUTSOURCE_MODES:
        allowed = ", ".join(sorted(OUTSOURCE_MODES))
        errors.append(
            f"outsource_mode must be one of: {allowed} "
            f"(got {config.outsource_mode!r})"
        )

    if config.outsource_mode == "last":
        if config.orchestrator_role is None:
            errors.append(
                "orchestrator_role is required when outsource_mode == 'last'"
            )
        elif config.orchestrator_role not in ROLE_VALUES:
            allowed = ", ".join(sorted(ROLE_VALUES))
            errors.append(
                f"orchestrator_role must be one of: {allowed} "
                f"(got {config.orchestrator_role!r})"
            )

        if config.verifier_role is None:
            errors.append(
                "verifier_role is required when outsource_mode == 'last'"
            )
        elif config.verifier_role not in ROLE_VALUES:
            allowed = ", ".join(sorted(ROLE_VALUES))
            errors.append(
                f"verifier_role must be one of: {allowed} "
                f"(got {config.verifier_role!r})"
            )

        if (
            config.orchestrator_role is not None
            and config.verifier_role is not None
            and config.orchestrator_role == config.verifier_role
        ):
            errors.append(
                "orchestrator_role and verifier_role must differ "
                "(cross-provider verification would collapse otherwise)"
            )

    return (len(errors) == 0), errors
