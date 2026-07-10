"""Set 057 — Lightweight dedicated verification/remediation support.

This module ships three Set-057 mechanisms that have **no behavioral
coupling to Full-tier close-out** (the close-out *gate strength* that
consumes the validator is wired in Set 057 Session 3, mirroring how
``suggestion_disposition`` deferred its runtime gate to Set 048 S3):

1. :func:`seed_issues_envelope` — the sanctioned writer for a v2
   ``sN-issues.json`` envelope (the blessed-writer companion for a
   verification session that finds issues).
2. :func:`validate_dedicated_verification` — the **content-aware
   close-time validator** that confirms the dedicated-verification path
   actually ran (a *different-engine* verification session before
   terminal close). This is the mechanism that backs the Set-057 Q6
   close-out gate. It replaces the S1-rejected D3 extension (D3 is
   content-blind and inert on Lightweight; see the S1 Audit Lock →
   Concrete defect).
3. :func:`derive_workflow_state` — the **seven-state derivation** of the
   workflow state from ``sessions[]`` + per-session ``verificationVerdict``
   + the latest ``sN-issues.json`` + the operator ``verificationMode``
   record. States are DERIVED, never persisted (Set 047 derive-top-level
   rule; Set 057 Q3).

Plus the ``verificationMode`` record reader/writer (Set 057 Q5): the
durable record reuses the Set-048 ``suggestion_disposition`` *pattern*
(an activity-log entry written once at set start, read by every step)
under its own ``kind`` so it never collides with the UAT/E2E choice
enum. The default when no record is present is ``out-of-band-or-none``
(opt-in; preserves current Lightweight behavior).

All functions are engine-agnostic: they read/write plain JSON, never
require a Python import from a Copilot/Codex/Gemini flow.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

try:
    from verification import is_blocking_issue  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - package-context import shim
    from .verification import is_blocking_issue  # type: ignore[no-redef]

try:
    from progress import (  # type: ignore[import-not-found]
        SESSION_STATUS_COMPLETE,
        SESSION_STATUS_IN_PROGRESS,
        SESSION_TYPE_REMEDIATION,
        SESSION_TYPE_VERIFICATION,
        SESSION_TYPE_WORK,
        normalize_to_v4_shape,
    )
except ImportError:  # pragma: no cover - import shim
    from .progress import (  # type: ignore[no-redef]
        SESSION_STATUS_COMPLETE,
        SESSION_STATUS_IN_PROGRESS,
        SESSION_TYPE_REMEDIATION,
        SESSION_TYPE_VERIFICATION,
        SESSION_TYPE_WORK,
        normalize_to_v4_shape,
    )


# ---------------------------------------------------------------------------
# verificationMode (Set 057 Q5)
# ---------------------------------------------------------------------------

VERIFICATION_MODE_DEDICATED = "dedicated-sessions"
VERIFICATION_MODE_OUT_OF_BAND = "out-of-band-or-none"
VERIFICATION_MODES = (VERIFICATION_MODE_DEDICATED, VERIFICATION_MODE_OUT_OF_BAND)
# Default when no durable record exists: preserve current Lightweight
# behavior; the dedicated-sessions feature is strictly opt-in (Q5).
DEFAULT_VERIFICATION_MODE = VERIFICATION_MODE_OUT_OF_BAND
# The activity-log entry ``kind`` discriminator. Distinct from Set 048's
# ``suggestion_disposition`` so the dedicated-verification choice never
# overloads the UAT/E2E choice enum.
VERIFICATION_MODE_ENTRY_KIND = "verification_mode"
# Set 062 (D4): the blessed-writer transition record. A superseding
# entry appended by :func:`change_verification_mode` when a completed
# Mode-A set opts in to dedicated verification (A->B only). Kept as its
# own ``kind`` so the once-at-set-start capture record and the sanctioned
# later transition stay distinguishable in the audit trail.
VERIFICATION_MODE_CHANGE_ENTRY_KIND = "verification_mode_change"
# The kinds that carry a durable verification-mode ``choice``. Order in
# the activity log (NOT kind priority) decides precedence: the last
# valid entry of either kind wins in :func:`read_verification_mode`.
_VERIFICATION_MODE_RECORD_KINDS = (
    VERIFICATION_MODE_ENTRY_KIND,
    VERIFICATION_MODE_CHANGE_ENTRY_KIND,
)


# ---------------------------------------------------------------------------
# Seven workflow states (Set 057 Q3) — DERIVED, never persisted
# ---------------------------------------------------------------------------

STATE_WORK_IN_PROGRESS = "work-in-progress"
STATE_AWAITING_VERIFICATION = "awaiting-verification"
STATE_AWAITING_REMEDIATION = "awaiting-remediation"
STATE_AWAITING_HUMAN = "awaiting-human"
STATE_CLOSED_VERIFIED = "closed-verified"
STATE_CLOSED_DISPOSITIONED = "closed-dispositioned"
STATE_CLOSED_NO_VERIFICATION = "closed-no-verification"

WORKFLOW_STATES = (
    STATE_WORK_IN_PROGRESS,
    STATE_AWAITING_VERIFICATION,
    STATE_AWAITING_REMEDIATION,
    STATE_AWAITING_HUMAN,
    STATE_CLOSED_VERIFIED,
    STATE_CLOSED_DISPOSITIONED,
    STATE_CLOSED_NO_VERIFICATION,
)

# resolution_status partition (Set 057 Q2 enum). "Terminal" dispositions
# close a finding without further human action; "human-stop" dispositions
# escalate to a human. An absent resolution_status means the finding is
# still OPEN.
#
# S2 verifier Major #2: ``advisory-disagreement`` is a DISPUTE (the
# orchestrator declined a verifier finding), and the Q3 ladder routes a
# remediation "dispute" to ``awaiting-human`` rather than silently
# closing it. It therefore lives in the human-stop set, NOT the terminal
# set — a disagreement always surfaces to a human, consistent with the
# design's "hard stop to a human whenever it cannot be followed
# mechanically" constraint.
# SS1 disposition-authority interim (item 6): accepting risk/consequence or
# declaring a finding not-reproducible is a RELEASE decision that requires
# operator authority. Until a gated authority record exists (SS-later) the
# framework cannot tell whether the ORCHESTRATOR (the policed actor) or a human
# set these, so it fails closed — they are human-stops, NOT self-service
# terminal closes (the anti-self-release rule: the builder cannot release
# itself). Only "fixed" stays terminal: it is a "remediation worked, RE-VERIFY"
# signal that routes to awaiting-verification, never a silent close. When SS-later
# adds an authorized resolution writer, operator-set accepts move back to a
# terminal close (closed-dispositioned) via that gated path.
_TERMINAL_DISPOSITIONS = frozenset(
    {
        "fixed",
    }
)
_HUMAN_STOP_DISPOSITIONS = frozenset(
    {
        "escalate-human",
        "needs-more-context",
        "advisory-disagreement",
        "accepted-risk",
        "accepted-consequence",
        "not-reproducible",
    }
)
# A verification session at/after this round count escalates to a human
# rather than authoring another automatic remediation round (the bounded-
# rounds rule: rounds 1-2 automatic, 3+ human). Used only when open issues
# remain.
_AUTOMATIC_ROUND_LIMIT = 3


def _now_iso_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_verification_mode(session_set_dir: str | Path) -> str:
    """Return the durable ``verificationMode`` record, or the default.

    Walks ``activity-log.json`` for entries with
    ``kind == "verification_mode"`` (the Set 057 once-at-set-start
    capture) or ``kind == "verification_mode_change"`` (the Set 062
    blessed transition record) and returns the most recent valid
    ``choice`` — the last valid entry of either kind in file order wins,
    so a sanctioned A->B transition supersedes the original capture.
    Returns :data:`DEFAULT_VERIFICATION_MODE` (``out-of-band-or-none``)
    when no record exists or on any read error — the feature is opt-in,
    so "not recorded" means current behavior.

    Note: an optional spec-config ``verificationMode`` field may seed the
    operator prompt's default (Set 057 Q5), but it is NOT the durable
    record — only the activity-log entries are. This reader intentionally
    consults the durable records only.
    """
    log_path = Path(session_set_dir) / "activity-log.json"
    if not log_path.exists():
        return DEFAULT_VERIFICATION_MODE
    try:
        with log_path.open("r", encoding="utf-8") as f:
            log = json.load(f)
    except (OSError, json.JSONDecodeError, UnicodeError):
        # UnicodeError (invalid UTF-8 bytes) is a ValueError subclass but NOT a
        # json.JSONDecodeError, so without it an invalid-UTF-8 activity log would
        # escape this reader's never-raising contract and crash close-out - the
        # L-069-1 bug-class fixed in the path_aware_critique siblings, applied here.
        return DEFAULT_VERIFICATION_MODE
    chosen = DEFAULT_VERIFICATION_MODE
    if not isinstance(log, dict):
        return chosen
    entries = log.get("entries")
    if not isinstance(entries, list):
        # A non-list ``entries`` must NOT be iterated (the L-069-1 bug-class):
        # iterating it would raise TypeError and break the never-raises contract.
        return chosen
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        if entry.get("kind") not in _VERIFICATION_MODE_RECORD_KINDS:
            continue
        choice = entry.get("choice")
        if choice in VERIFICATION_MODES:
            chosen = choice
    return chosen


def read_spec_verification_mode(session_set_dir: str | Path) -> Optional[str]:
    """Return the optional ``verificationMode`` seed from spec.md config.

    Set 057 Q5: a Session Set Configuration ``verificationMode`` field may
    **seed** the operator prompt's default, but it is NOT the durable
    record. Returns the value when it is a recognized mode, else ``None``
    (missing spec, no config block, no field, or an unknown value). Never
    raises — a malformed spec degrades to "no seed".
    """
    spec_path = Path(session_set_dir) / "spec.md"
    if not spec_path.is_file():
        return None
    try:
        text = spec_path.read_text(encoding="utf-8")
    except OSError:
        return None
    try:
        from session_state import (  # type: ignore[import-not-found]
            _extract_session_set_configuration_block,
        )
    except ImportError:  # pragma: no cover - import shim
        from .session_state import (  # type: ignore[no-redef]
            _extract_session_set_configuration_block,
        )
    block = _extract_session_set_configuration_block(text) or {}
    value = block.get("verificationMode")
    if isinstance(value, str) and value in VERIFICATION_MODES:
        return value
    return None


def has_verification_mode_record(session_set_dir: str | Path) -> bool:
    """Return True iff a durable verification-mode record already exists.

    Counts both record kinds — the Set 057 ``verification_mode`` capture
    AND the Set 062 ``verification_mode_change`` blessed transition. Used
    by the start-of-set capture wiring to make recording idempotent: the
    seed-from-spec path records only when no durable choice exists yet.
    Recognizing the change record here is load-bearing (Set 062 S3 audit
    F3): the capture runs on *every* ``start_session`` — including the
    typed-session starts that follow a blessed A->B transition on a set
    that never recorded an original capture — and a re-recorded stale
    spec seed appended *after* the change record would silently revert
    the transition under the reader's last-valid-entry-wins rule.
    """
    log_path = Path(session_set_dir) / "activity-log.json"
    if not log_path.exists():
        return False
    try:
        with log_path.open("r", encoding="utf-8") as f:
            log = json.load(f)
    except (OSError, json.JSONDecodeError, UnicodeError):
        # Invalid UTF-8 (a UnicodeError, not a JSONDecodeError) must not raise
        # here either (the L-069-1 bug-class); an unreadable log means "no record".
        return False
    if not isinstance(log, dict):
        return False
    entries = log.get("entries")
    if not isinstance(entries, list):
        # Same L-069-1 hardening: a non-list ``entries`` must not be iterated. This
        # reader gates the idempotent capture, so a TypeError here would crash the
        # seed-from-spec wiring before the writer could repair the shape.
        return False
    return any(
        isinstance(entry, dict)
        and entry.get("kind") in _VERIFICATION_MODE_RECORD_KINDS
        and entry.get("choice") in VERIFICATION_MODES
        for entry in entries
    )


def resolve_and_record_verification_mode(
    session_set_dir: str | Path,
    *,
    cli_choice: Optional[str] = None,
    session_number: int = 1,
) -> Optional[str]:
    """Capture the operator's ``verificationMode`` choice once at set start.

    Set 057 Q5 wiring (the start_session caller). The choice is recorded
    **once at set start and is immutable thereafter** — Q5 locked the
    durable record as "written once at set start," and
    :func:`read_verification_mode` returns the most-recent entry, so
    allowing a later write would let a mid-set
    ``--verification-mode out-of-band-or-none`` silently disable the
    dedicated-session close gate and derived-state machine after the set
    had already opted in. Once any valid record exists this is a no-op
    (returns ``None``).

    On the first call (no record yet) the resolution precedence is:

    1. ``cli_choice`` (an explicit ``--verification-mode`` flag).
    2. The spec.md config ``verificationMode`` seed.

    Records nothing (returns ``None``) when neither source yields a value —
    the feature stays strictly opt-in and the default
    ``out-of-band-or-none`` continues to apply implicitly. Creates a
    minimal ``activity-log.json`` if one does not exist yet (the durable
    record lives there). Best-effort and self-contained: a bad
    ``cli_choice`` always raises ``ValueError`` (even when a record already
    exists, so the validation surface is stable), but a missing activity
    log is created rather than raising.
    """
    if cli_choice is not None and cli_choice not in VERIFICATION_MODES:
        raise ValueError(
            f"unknown verificationMode {cli_choice!r}; expected one of "
            f"{VERIFICATION_MODES}"
        )
    # Immutable after the first record (Q5: written once at set start).
    if has_verification_mode_record(session_set_dir):
        return None
    chosen: Optional[str] = cli_choice
    if chosen is None:
        chosen = read_spec_verification_mode(session_set_dir)
    if chosen is None:
        return None

    log_path = Path(session_set_dir) / "activity-log.json"
    if not log_path.exists():
        set_name = Path(session_set_dir).name
        minimal = {
            "sessionSetName": set_name,
            "createdDate": _now_iso_utc(),
            "totalSessions": 0,
            "entries": [],
        }
        # Set 077 S5 (S1 bundle E): atomic — a partial minimal log would
        # poison every later reader of the durable record's home.
        _write_json_atomic(log_path, minimal)
    record_verification_mode(
        session_set_dir, chosen, session_number=session_number
    )
    return chosen


def record_verification_mode(
    session_set_dir: str | Path,
    mode: str,
    *,
    session_number: int = 1,
    step_number: Optional[int] = None,
) -> None:
    """Append a ``verification_mode`` entry to ``activity-log.json``.

    The durable record (Set 057 Q5). Mirrors the Set-048
    ``record_suggestion_disposition`` writer (atomic temp-file rename,
    UTC timestamp). Raises ``ValueError`` on unknown mode and
    ``FileNotFoundError`` if the activity log is missing (the set must
    have started first — this helper does not create the file).

    The Set-057 Session-3 operator-choice prompt is the production caller;
    exposed here so the derivation/validator have a sanctioned writer and
    the tests can build fixtures without hand-editing the activity log.
    """
    if mode not in VERIFICATION_MODES:
        raise ValueError(
            f"unknown verificationMode {mode!r}; expected one of "
            f"{VERIFICATION_MODES}"
        )
    log_path = Path(session_set_dir) / "activity-log.json"
    if not log_path.exists():
        raise FileNotFoundError(
            f"activity-log.json not found at {log_path}; the session set "
            "must exist and have started before recording a "
            "verificationMode"
        )
    with log_path.open("r", encoding="utf-8") as f:
        log = json.load(f)
    entries = log.setdefault("entries", [])
    if step_number is None:
        step_number = (
            max(
                (
                    int(e.get("stepNumber", 0))
                    for e in entries
                    if e.get("sessionNumber") == session_number
                ),
                default=0,
            )
            + 1
        )
    entry = {
        "sessionNumber": session_number,
        "stepNumber": step_number,
        "stepKey": f"session-{session_number:03d}/verification-mode",
        "dateTime": _now_iso_utc(),
        "description": f"Operator set verificationMode: {mode}.",
        "status": "complete",
        "kind": VERIFICATION_MODE_ENTRY_KIND,
        "choice": mode,
    }
    entries.append(entry)
    _write_activity_log_atomic(log_path, log)


def _write_json_atomic(path: Path, payload: dict) -> None:
    """Atomic temp-file-rename JSON write (Set 077 S5, S1 bundle E).

    Shared by every writer in this module. The atomicity matters most for
    :func:`seed_issues_envelope`: its ``FileExistsError`` never-overwrite
    guard means a partially-written (crashed mid-write) envelope would be
    permanently entombed — the corrupt stub blocks every retry. Writing
    to a temp file and ``os.replace``-ing means the target either does
    not exist or is complete.
    """
    fd, tmp_path = tempfile.mkstemp(
        suffix=f".{path.name}.tmp", dir=str(path.parent)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as tmp_f:
            json.dump(payload, tmp_f, indent=2)
            tmp_f.write("\n")
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _write_activity_log_atomic(log_path: Path, log: dict) -> None:
    """Atomic temp-file-rename write of ``activity-log.json``."""
    _write_json_atomic(log_path, log)


# ---------------------------------------------------------------------------
# Sanctioned A->B transition writer (Set 062 D4)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class VerificationModeChangeResult:
    """Outcome of :func:`change_verification_mode`.

    ``ok`` is True only when the transition record was appended. ``code``
    is a stable machine token (``"changed"`` on success; a ``refused-*``
    token naming the failed gate otherwise) so CLI/extension consumers can
    branch without parsing prose. ``reason`` is the operator-facing
    explanation; ``record`` carries the appended entry on success.
    """

    ok: bool
    code: str
    reason: str
    record: Optional[dict] = None


def _refuse(code: str, reason: str) -> VerificationModeChangeResult:
    return VerificationModeChangeResult(ok=False, code=code, reason=reason)


def change_verification_mode(
    session_set_dir: str | Path,
    *,
    target_mode: str = VERIFICATION_MODE_DEDICATED,
) -> VerificationModeChangeResult:
    """Append a sanctioned ``verification_mode_change`` record (Set 062 D4).

    The blessed writer for the Mode A -> Mode B transition on a set that
    has already started (the not-started seed rewrite stays the
    extension's spec-edit path). The transition is **recorded, not snuck
    past** the Set 057 capture: A->B is purely additive — work sessions
    execute identically under both modes; the mode only governs whether
    typed sessions are appended afterward — so a superseding activity-log
    record preserves the reason the capture is immutable while making the
    opt-in auditable. :func:`read_verification_mode` honors the latest
    record, so the Q6 close-out gate, the seven-state derivation, and the
    cross-provider validator all follow the transition with no other
    write.

    Gates (fail loud, checked in order, nothing written on refusal):

    1. ``target_mode`` must be ``dedicated-sessions`` — A->B only; B->A
       is refused unconditionally (and is structurally unreachable
       besides: this writer never records ``out-of-band-or-none``).
    2. The set directory must exist and carry a parseable ``spec.md``
       declaring ``tier: lightweight`` (the mode machinery is inert on
       Full tier). An unconfirmable tier refuses — fail closed.
    3. An existing-but-unreadable ``activity-log.json`` refuses (the
       record's home is uninspectable; the S2 verifier's fail-loud
       lesson). A *missing* log is created minimal on success — the
       implicit-default Mode A population never recorded anything.
    4. The effective recorded mode must be ``out-of-band-or-none``.
    5. No ``type: verification``/``remediation`` session may exist in the
       ledger and no session may be in flight (``session-state.json``
       must be readable to confirm both — fail closed otherwise).

    Returns a :class:`VerificationModeChangeResult`; never raises for a
    gate refusal. ``python -m ai_router.change_verification_mode`` is the
    CLI wrapper (the engine-agnostic entry point for Copilot/Codex/Gemini
    flows and the extension's spawn target).
    """
    # Gate 1 — direction. B->A is refused after any record exists by
    # design lock; this writer refuses it always (the not-started seed
    # rewrite is the only sanctioned B->A surface, and only while no
    # record exists).
    if target_mode != VERIFICATION_MODE_DEDICATED:
        return _refuse(
            "refused-target-mode",
            f"target mode {target_mode!r} is not allowed: the sanctioned "
            "transition is out-of-band-or-none -> dedicated-sessions only "
            "(A->B). B->A is never recorded by the blessed writer.",
        )

    set_dir = Path(session_set_dir)
    spec_path = set_dir / "spec.md"
    # Gate 2 — a real Lightweight session set.
    if not set_dir.is_dir() or not spec_path.is_file():
        return _refuse(
            "refused-no-session-set",
            f"{set_dir} is not a session-set directory (missing dir or "
            "spec.md).",
        )
    tier: Optional[str] = None
    try:
        # Set 048 S5 bare-import lesson + static guard: never a bare
        # `from spec_config import …` (works only under the test
        # sys.path shim; ModuleNotFoundError under pip-install). The
        # relative form covers package use; the absolute form covers
        # this module being imported by bare filename (the test
        # convention), where relative imports have no parent package.
        try:
            from .spec_config import parse_session_set_config
        except ImportError:  # pragma: no cover - import shim
            from ai_router.spec_config import (  # type: ignore[no-redef]
                parse_session_set_config,
            )

        tier = parse_session_set_config(spec_path).tier
    except Exception:
        tier = None
    if tier != "lightweight":
        detail = (
            f"spec.md declares tier: {tier}"
            if tier is not None
            else "spec.md's tier cannot be confirmed (unparseable config)"
        )
        return _refuse(
            "refused-not-lightweight",
            f"{detail}; verificationMode governs Lightweight verification "
            "only, so the transition writer refuses (fail closed).",
        )

    # Gate 3 — the record's home must be inspectable when it exists.
    log_path = set_dir / "activity-log.json"
    log: Optional[dict] = None
    if log_path.exists():
        try:
            with log_path.open("r", encoding="utf-8") as f:
                loaded = json.load(f)
        except (OSError, json.JSONDecodeError, UnicodeError):
            # Set 077 S1: UnicodeError sibling-site closure (L-069-1) —
            # invalid UTF-8 must refuse the gate, not raise out of it.
            loaded = None
        if not isinstance(loaded, dict) or not isinstance(
            loaded.get("entries", []), list
        ):
            return _refuse(
                "refused-activity-log-unreadable",
                f"{log_path} exists but cannot be read/parsed; refusing to "
                "record a mode transition while the set's history is "
                "uninspectable (fail loud).",
            )
        log = loaded

    # Gate 4 — effective recorded mode must still be Mode A.
    effective = read_verification_mode(set_dir)
    if effective != VERIFICATION_MODE_OUT_OF_BAND:
        return _refuse(
            "refused-already-dedicated",
            "the durable record already says dedicated-sessions — there is "
            "nothing to transition. If spec.md still reads "
            "out-of-band-or-none, align the seed to dedicated-sessions so "
            "the Explorer (which reads the spec) matches the record.",
        )

    # Gate 5 — ledger gates: no typed sessions, nothing in flight.
    state_path = set_dir / "session-state.json"
    if not state_path.is_file():
        return _refuse(
            "refused-state-unreadable",
            f"{state_path} not found; cannot confirm the no-typed-sessions "
            "and nothing-in-flight gates (fail closed).",
        )
    try:
        with state_path.open("r", encoding="utf-8") as f:
            raw_state = json.load(f)
        normalized = normalize_to_v4_shape(raw_state, spec_path)
    except Exception:
        return _refuse(
            "refused-state-unreadable",
            f"{state_path} cannot be read/normalized; cannot confirm the "
            "no-typed-sessions and nothing-in-flight gates (fail closed).",
        )
    sessions = normalized.get("sessions") or []
    typed = [
        s
        for s in sessions
        if isinstance(s, dict) and _session_type(s) != SESSION_TYPE_WORK
    ]
    if typed:
        numbers = ", ".join(str(s.get("number")) for s in typed)
        return _refuse(
            "refused-typed-session-exists",
            f"the ledger already carries typed session(s) ({numbers}) — "
            "the dedicated flow is already in motion; there is nothing to "
            "transition.",
        )
    in_flight = any(
        isinstance(s, dict) and s.get("status") == SESSION_STATUS_IN_PROGRESS
        for s in sessions
    )
    # Plan-less carve-out: no sessions[] ledger but a top-level
    # in-progress status IS an in-flight session.
    if not sessions and normalized.get("status") == SESSION_STATUS_IN_PROGRESS:
        in_flight = True
    if in_flight:
        return _refuse(
            "refused-session-in-flight",
            "a session is in flight; the mode transition contends with a "
            "running session — close it first, then re-run.",
        )

    # All gates pass — append the superseding record (atomic write).
    if log is None:
        log = {
            "sessionSetName": set_dir.name,
            "createdDate": _now_iso_utc(),
            "totalSessions": 0,
            "entries": [],
        }
    entries = log.setdefault("entries", [])
    completed_numbers = [
        s.get("number")
        for s in sessions
        if isinstance(s, dict)
        and s.get("status") == SESSION_STATUS_COMPLETE
        and isinstance(s.get("number"), int)
    ]
    session_number = max(completed_numbers, default=0)
    step_number = (
        max(
            (
                int(e.get("stepNumber", 0))
                for e in entries
                if e.get("sessionNumber") == session_number
            ),
            default=0,
        )
        + 1
    )
    entry = {
        "sessionNumber": session_number,
        "stepNumber": step_number,
        "stepKey": f"session-{session_number:03d}/verification-mode-change",
        "dateTime": _now_iso_utc(),
        "description": (
            "Blessed writer recorded verificationMode transition: "
            "out-of-band-or-none -> dedicated-sessions (A->B, additive; "
            "typed sessions may now be appended and the dedicated-sessions "
            "close-out gate applies)."
        ),
        "status": "complete",
        "kind": VERIFICATION_MODE_CHANGE_ENTRY_KIND,
        "choice": target_mode,
        "previousMode": VERIFICATION_MODE_OUT_OF_BAND,
    }
    entries.append(entry)
    _write_activity_log_atomic(log_path, log)
    return VerificationModeChangeResult(
        ok=True,
        code="changed",
        reason=(
            "verificationMode transition recorded: out-of-band-or-none -> "
            "dedicated-sessions."
        ),
        record=entry,
    )


# ---------------------------------------------------------------------------
# sN-issues.json seeding + reading
# ---------------------------------------------------------------------------

_ISSUES_FILE_RE = re.compile(
    r"^s(?P<session>\d+)-issues(?:-round-(?P<round>\d+))?\.json$"
)


def seed_issues_envelope(
    session_set_dir: str | Path,
    *,
    session_number: int,
    verification_round: int,
    verification_verdict: str,
    issues: List[dict],
) -> str:
    """Write a v2 ``sN-issues.json`` envelope (the sanctioned seeder).

    The blessed-writer companion for a verification session that finds
    issues (Set 057 Q1). Writes ``schemaVersion: 2`` so the promoted
    finding fields and the enum-enforced ``resolution_status`` /
    ``issueType`` apply. Round 1 → ``s<N>-issues.json``; round M>1 →
    ``s<N>-issues-round-<M>.json``. Never overwrites an existing
    findings file (the locked Set-055 invariant: one file per
    findings-bearing round).

    Raises ``ValueError`` for an empty ``issues`` list (the file exists
    only for findings-bearing rounds) and ``FileExistsError`` if the
    target already exists. Returns the absolute path written.
    """
    if not issues:
        raise ValueError(
            "seed_issues_envelope: issues must be non-empty — an "
            "sN-issues.json file is written only for a findings-bearing "
            "round (its presence means issues were found)."
        )
    # S2 verifier Major #3: the locked Set-055 invariant is "presence of an
    # sN-issues*.json file means that round found issues." The sanctioned
    # seeder must therefore refuse a clean/VERIFIED verdict — otherwise a
    # contradictory envelope (VERIFIED + issues) could mis-drive
    # derive_state() into closed-verified.
    if (
        not isinstance(verification_verdict, str)
        or not verification_verdict.strip()
        or verification_verdict.strip().upper() == "VERIFIED"
    ):
        raise ValueError(
            "seed_issues_envelope: verification_verdict must be a non-empty, "
            "non-VERIFIED findings verdict (the file's presence means issues "
            f"were found); got {verification_verdict!r}."
        )
    if verification_round == 1:
        fname = f"s{session_number}-issues.json"
    else:
        fname = f"s{session_number}-issues-round-{verification_round}.json"
    path = Path(session_set_dir) / fname
    if path.exists():
        raise FileExistsError(
            f"refusing to overwrite an existing findings file: {path}. "
            "Each findings-bearing round gets its own sN-issues file."
        )
    envelope = {
        "schemaVersion": 2,
        "sessionNumber": session_number,
        "verificationRound": verification_round,
        "verificationVerdict": verification_verdict,
        "issues": list(issues),
    }
    # Set 077 S5 (S1 bundle E [Critical]): atomic write. A partial
    # envelope would be entombed forever by the FileExistsError guard
    # above — the never-overwrite invariant assumes every existing file
    # is complete, so the write itself must guarantee completeness.
    _write_json_atomic(path, envelope)
    return str(path)


def read_latest_issues_envelope(session_set_dir: str | Path) -> Optional[dict]:
    """Return the most recent ``sN-issues*.json`` envelope, or ``None``.

    "Most recent" = highest ``(session_number, round)`` pair across all
    ``s<N>-issues.json`` / ``s<N>-issues-round-<M>.json`` files in the
    set (round 1 sorts as round 1). Malformed / unreadable files are
    skipped. Returns ``None`` when the set has no findings file at all
    (every verification round was clean).
    """
    set_dir = Path(session_set_dir)
    if not set_dir.is_dir():
        return None
    best_key: Optional[tuple] = None
    best_payload: Optional[dict] = None
    for child in set_dir.iterdir():
        if not child.is_file():
            continue
        m = _ISSUES_FILE_RE.match(child.name)
        if not m:
            continue
        session = int(m.group("session"))
        rnd = int(m.group("round")) if m.group("round") else 1
        try:
            with child.open("r", encoding="utf-8") as f:
                payload = json.load(f)
        except (OSError, json.JSONDecodeError, UnicodeError):
            # Set 077 S1: UnicodeError sibling-site closure (L-069-1).
            continue
        key = (session, rnd)
        if best_key is None or key > best_key:
            best_key = key
            best_payload = payload
    return best_payload


# ---------------------------------------------------------------------------
# Content-aware close-time validator (Set 057 Q6 backing mechanism)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DedicatedVerificationResult:
    """Outcome of :func:`validate_dedicated_verification`.

    ``applicable`` is False when ``verificationMode != dedicated-sessions``
    (the validator is a no-op and ``ok`` is True). When ``applicable`` is
    True, ``ok`` reports whether a *different-engine* verification session
    completed before terminal close; ``reason`` explains the verdict and
    ``corrective`` carries the one-line operator action the Set-057 Q6
    close-out gate prints when ``ok`` is False.
    """

    applicable: bool
    ok: bool
    reason: str
    corrective: str = ""


def _session_type(entry: dict) -> str:
    t = entry.get("type")
    if isinstance(t, str) and t in (
        SESSION_TYPE_WORK,
        SESSION_TYPE_VERIFICATION,
        SESSION_TYPE_REMEDIATION,
    ):
        return t
    return SESSION_TYPE_WORK


def _engine_provider(entry: dict) -> tuple:
    """Return ``(engine, provider)`` from a session's orchestrator block."""
    orch = entry.get("orchestrator")
    if not isinstance(orch, dict):
        return (None, None)
    return (orch.get("engine"), orch.get("provider"))


def work_session_pairs(sessions: List[dict]) -> List[tuple]:
    """Return each ``work`` session's recorded ``(engine, provider)`` pair.

    Set 077 S5 (A6): the baseline the cross-provider predicate compares
    a verification session against. One tuple per work session, in
    ledger order; unrecorded fields stay ``None`` (omit-null on disk
    reads back as absent). Sessions whose ``type`` is verification /
    remediation are excluded — they are not the work being verified.
    """
    return [
        _engine_provider(s)
        for s in sessions
        if isinstance(s, dict) and _session_type(s) == SESSION_TYPE_WORK
    ]


def cross_provider_satisfied(
    v_engine: Optional[str],
    v_provider: Optional[str],
    work_pairs: List[tuple],
) -> bool:
    """True when ``(v_engine, v_provider)`` differs from every work pair
    by engine **or by provider** (Set 077 S5, A6).

    The Set 057 gate accepted only an engine difference, so a
    Copilot-locked shop (every session ``--engine copilot``) could never
    pass even when the underlying model *provider* differed. The
    extension is additive, never weakening:

    * **Engine arm (legacy, unchanged):** a recorded ``v_engine`` that
      appears in no work session's recorded engine set passes outright.
      Work sessions with no recorded engine do not join that set — the
      pre-077 posture, preserved so no previously-passing configuration
      starts failing.
    * **Provider arm (new, strict):** otherwise the pair must differ
      from **every** work session pairwise — by engine (both recorded,
      unequal) or by provider (both recorded, unequal). **Missing data
      fails the pair closed**: a verification session with no recorded
      provider cannot satisfy this arm, and a work session with neither
      field recorded can never be confirmed different (mirroring the
      existing no-work-engine-baseline posture).

    Same engine + same provider therefore still fails. Callers must
    check the no-baseline case themselves (no work session with any
    recorded identity) — this predicate returns ``False`` there, but
    the corrective message differs.

    ACCEPTED BOUNDARY (out-of-band remediation SS3, operator-ratified
    2026-07-10; not a bug). The engine arm lets two DIFFERENT engines on the
    SAME underlying provider pass as "independent" — weaker than true
    effective-provider independence. This is deliberately RETAINED: this is the
    LIGHTWEIGHT / dedicated tier (router-off, no stamped artifact), whose
    integrity model is intentionally weaker and opt-in. The enforced release
    gate is the FULL tier, which already excludes the orchestrator's EFFECTIVE
    PROVIDER (not merely engine) via
    ``verify_session.resolve_orchestrator_exclusion`` and binds stamped
    cross-provider evidence. Tightening this arm to require provider-difference
    would break backward-compatible multi-engine/same-provider configs for
    marginal value, so it is documented as a known limitation rather than
    closed. See ``../dabbler-orchestration-remediation/ss3-summary.md``.
    """
    work_engines = {e for e, _p in work_pairs if e is not None}
    # Engine arm — legacy set-based comparison, unchanged semantics.
    if (
        v_engine is not None
        and work_engines
        and v_engine not in work_engines
    ):
        return True
    # Provider arm — pairwise, fail-closed on missing data.
    if v_provider is None:
        return False
    for w_engine, w_provider in work_pairs:
        if v_engine is not None and w_engine is not None and v_engine != w_engine:
            continue  # this pair differs by engine
        if w_provider is not None and w_provider != v_provider:
            continue  # this pair differs by provider
        return False  # same or unconfirmable pair — fail closed
    return bool(work_pairs)


def validate_dedicated_verification(
    session_set_dir: str | Path,
    *,
    closing_session_number: Optional[int] = None,
) -> DedicatedVerificationResult:
    """Confirm a different-engine verification session ran (Set 057 Q6).

    The content-aware close-time validator. When
    ``verificationMode == dedicated-sessions`` it checks that at least one
    **completed** ``type == verification`` session exists in ``sessions[]``
    AND that its orchestrator engine differs from every implementation
    (``work``) session's engine — the cross-provider principle the whole
    feature exists to enforce. On Lightweight (no events ledger) this
    writer-plus-validator pair is the entire enforcement surface; D3 is
    left unchanged (content-blind, inert there).

    ``closing_session_number`` (Set 057 S3 close-gate wiring): the number
    of the session ``close_session`` is finalizing right now. The terminal
    close of a happy-path single-round flow closes the verification session
    *itself* — at gate time that session is still ``in-progress`` (the
    snapshot flip runs after the gate). Passing its number here lets the
    validator treat it as the just-completed verification it is, so the
    gate does not reject the very session that satisfies it. When ``None``
    (the S2 advisory call site and all unit fixtures), only sessions whose
    status is already ``complete`` count — an independently in-progress
    verification session still fails.

    Returns a :class:`DedicatedVerificationResult`. The Set-057 Session-3
    close-out gate (Q6: hard TTY / soft non-TTY) consumes ``ok`` /
    ``corrective``; this function makes no I/O-blocking decision itself.
    """
    mode = read_verification_mode(session_set_dir)
    if mode != VERIFICATION_MODE_DEDICATED:
        return DedicatedVerificationResult(
            applicable=False,
            ok=True,
            reason=(
                f"verificationMode is {mode!r}; dedicated verification not "
                "required (no-op)."
            ),
        )

    set_dir = Path(session_set_dir)
    state_path = set_dir / "session-state.json"
    # Set 077 S5 (S1 bundle E): quote + as_posix() the set-dir path so
    # the corrective's command line survives spaces and Windows
    # backslashes when pasted.
    set_dir_arg = f'"{Path(session_set_dir).as_posix()}"'
    corrective = (
        "Run a dedicated verification session that differs from the work "
        "sessions by engine or provider: `python -m "
        "ai_router.start_session --session-set-dir "
        f"{set_dir_arg} --type verification --engine <your-engine> "
        "--provider <your-provider>`, then re-run close_session."
    )
    if not state_path.is_file():
        return DedicatedVerificationResult(
            applicable=True,
            ok=False,
            reason="no session-state.json to inspect for a verification session.",
            corrective=corrective,
        )
    try:
        with state_path.open("r", encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, json.JSONDecodeError, UnicodeError):
        # Set 077 S1: UnicodeError sibling-site closure (L-069-1) — an
        # invalid-UTF-8 state file is "unconfirmable", never a raise.
        return DedicatedVerificationResult(
            applicable=True,
            ok=False,
            reason="session-state.json unreadable; cannot confirm verification.",
            corrective=corrective,
        )
    try:
        normalized = normalize_to_v4_shape(raw, set_dir / "spec.md")
    except Exception:
        normalized = raw if isinstance(raw, dict) else {}
    sessions = normalized.get("sessions") or []

    verification_sessions = [
        s
        for s in sessions
        if isinstance(s, dict)
        and _session_type(s) == SESSION_TYPE_VERIFICATION
        and (
            s.get("status") == SESSION_STATUS_COMPLETE
            or (
                closing_session_number is not None
                and s.get("number") == closing_session_number
            )
        )
    ]
    if not verification_sessions:
        return DedicatedVerificationResult(
            applicable=True,
            ok=False,
            reason=(
                "verificationMode=dedicated-sessions but no completed "
                "verification session is present in sessions[]."
            ),
            corrective=corrective,
        )

    work_pairs = work_session_pairs(sessions)

    # Fail CLOSED when there is no implementation-identity baseline to
    # compare against: without it, "the verification identity is not among
    # the work identities" is vacuously true and would report cross-provider
    # satisfied when it cannot actually be confirmed (S2 verifier Major #1).
    # The Lightweight tier writes a per-session orchestrator block by hand,
    # so a baseline is expected; its absence is an honest "unconfirmable",
    # not a pass. Set 077 S5 (A6): the baseline is now engine OR provider —
    # a work session recording only a provider still anchors the check.
    if not any(e is not None or p is not None for e, p in work_pairs):
        return DedicatedVerificationResult(
            applicable=True,
            ok=False,
            reason=(
                "a verification session ran, but no implementation-session "
                "engine or provider is recorded, so it cannot be confirmed "
                "to be independent of the work sessions."
            ),
            corrective=(
                "Record the orchestrator engine (and provider) on the "
                "implementation sessions (the per-session orchestrator "
                "block) so the cross-provider check has a baseline, then "
                "re-run close_session."
            ),
        )

    for vs in verification_sessions:
        v_engine, v_provider = _engine_provider(vs)
        if v_engine is None and v_provider is None:
            # Cannot confirm cross-provider without any recorded identity.
            continue
        if cross_provider_satisfied(v_engine, v_provider, work_pairs):
            work_engines = {e for e, _p in work_pairs if e is not None}
            arm = (
                "engine"
                if v_engine is not None and v_engine not in work_engines
                else "provider"
            )
            return DedicatedVerificationResult(
                applicable=True,
                ok=True,
                reason=(
                    f"a completed verification session (engine={v_engine!r}, "
                    f"provider={v_provider!r}) differs from every "
                    f"implementation session by {arm}."
                ),
            )

    # Set 077 S5 (A6 + Critique-2 M5): the corrective names both remedies.
    # Legacy posture is explicit — work sessions recorded without
    # --provider cannot satisfy the provider arm, so for them the
    # engine-difference arm is the only path; the same-engine Copilot
    # model-picker pattern applies only to sets whose work sessions carry
    # provider data.
    work_providers_recorded = any(p is not None for _e, p in work_pairs)
    provider_hint = (
        ""
        if work_providers_recorded
        else (
            " Note: this set's work sessions carry no recorded provider, "
            "so the same-engine different-provider pattern cannot be "
            "confirmed for them — either verify on a different engine, or "
            "record the provider on the work sessions' per-session "
            "orchestrator blocks (going forward, pass --provider to "
            "start_session) and re-run close_session."
        )
    )
    return DedicatedVerificationResult(
        applicable=True,
        ok=False,
        reason=(
            "a verification session ran, but it cannot be confirmed to "
            "differ from the implementation sessions by engine or by "
            "provider (missing orchestrator identity, or same "
            "engine+provider as the work sessions)."
        ),
        corrective=(
            "Re-run the verification session so it differs from the "
            "implementation sessions by engine or by provider — e.g. a "
            "different engine, or the same engine driving a different "
            "model provider (Copilot model picker: --engine copilot "
            "--provider openai verifying work done under --engine copilot "
            "--provider anthropic) — with --engine/--provider recorded."
            + provider_hint
        ),
    )


# ---------------------------------------------------------------------------
# Seven-state derivation (Set 057 Q3)
# ---------------------------------------------------------------------------


def _disposition(issue: dict) -> Optional[str]:
    """Return the issue's ``resolution_status``, or ``None`` if open."""
    if not isinstance(issue, dict):
        return None
    status = issue.get("resolution_status")
    return status if isinstance(status, str) and status else None


def _disposition_is_known(status: Optional[str]) -> bool:
    """Whether a non-empty ``resolution_status`` is one the workflow recognizes.

    A value that is neither a known terminal nor a known human-stop disposition
    is an unknown/misspelled/unauthorized status — INVALID evidence that must
    fail closed to a human, never silently satisfy a close (SS1: closes the
    fail-open where an unknown status was neither "open" nor "human-stop").
    """
    return status in _TERMINAL_DISPOSITIONS or status in _HUMAN_STOP_DISPOSITIONS


def derive_state(
    sessions: List[dict],
    *,
    verification_mode: str,
    set_status: Optional[str],
    latest_issues: Optional[dict],
) -> str:
    """Pure derivation of the workflow state (Set 057 Q3 ladder).

    Separated from the file-reading :func:`derive_workflow_state` so every
    ladder branch is unit-testable from in-memory inputs (the verdict's
    residual-risk #2 demands full branch coverage).

    Parameters:
      ``sessions`` — normalized ``sessions[]`` (ordered by number); each
        dict carries ``status``, optional ``type`` (absent ⇒ ``work``),
        and optional ``verificationVerdict``.
      ``verification_mode`` — the durable ``verificationMode`` record.
      ``set_status`` — the top-level set status (``complete`` ⇒ terminal).
      ``latest_issues`` — the latest ``sN-issues.json`` envelope (or None).

    Interpretation notes (documented so the contract is explicit):
      * An issue is *open* when it carries no ``resolution_status``;
        *terminally dispositioned* when its status is a closing value;
        *human-stop* when its status escalates to a human.
      * "code/doc changes were made" during remediation is read as "at
        least one issue is marked ``fixed``".
      * The ``awaiting-human`` exit (reverify / remediate / accept /
        declare-complete) is realized by the operator's subsequent writer
        action — appending a typed session or editing dispositions — which
        this function re-derives on the next read, rather than by a
        separate persisted disposition enum (none exists in v4).
    """
    set_terminal = set_status == SESSION_STATUS_COMPLETE
    issues = (
        latest_issues.get("issues", [])
        if isinstance(latest_issues, dict)
        else []
    )
    if not isinstance(issues, list):
        issues = []

    # 1. Opt-out mode: the dedicated-session machine does not run.
    if verification_mode != VERIFICATION_MODE_DEDICATED:
        return (
            STATE_CLOSED_NO_VERIFICATION if set_terminal else STATE_WORK_IN_PROGRESS
        )

    if not sessions:
        return STATE_WORK_IN_PROGRESS

    latest = sessions[-1]
    latest_type = _session_type(latest)
    latest_status = latest.get("status")

    # 2. Latest session in-flight (non-terminal): the type names the wait.
    if latest_status == SESSION_STATUS_IN_PROGRESS:
        if latest_type == SESSION_TYPE_VERIFICATION:
            return STATE_AWAITING_VERIFICATION
        if latest_type == SESSION_TYPE_REMEDIATION:
            return STATE_AWAITING_REMEDIATION
        return STATE_WORK_IN_PROGRESS

    # 3. Latest session complete. First: are all authored work sessions
    #    complete? If not, we are still implementing.
    work_sessions = [s for s in sessions if _session_type(s) == SESSION_TYPE_WORK]
    if any(s.get("status") != SESSION_STATUS_COMPLETE for s in work_sessions):
        return STATE_WORK_IN_PROGRESS

    if latest_type == SESSION_TYPE_WORK:
        # Last completed session is work and all authored work is done.
        return STATE_AWAITING_VERIFICATION

    human_stop = any(_disposition(i) in _HUMAN_STOP_DISPOSITIONS for i in issues)
    open_issues = [i for i in issues if _disposition(i) is None]
    # Disposition authority (SS1): a resolution_status that is neither a known
    # terminal nor a known human-stop value is INVALID evidence — fail closed to
    # a human rather than let an unknown status satisfy a close.
    unknown_disposition = any(
        _disposition(i) is not None and not _disposition_is_known(_disposition(i))
        for i in issues
    )
    # Severity-anchored open blockers (SS1, L-071-1): a round is loop-opening
    # ONLY for an undispositioned finding that is blocking by severity
    # (Critical/Major, or unknown/missing severity — never laundered into a nit
    # by an absent label). An undispositioned Minor is a recorded observation,
    # not an open blocker, so a Minor-only round closes ("verified with
    # observations") instead of churning. ``is_blocking_issue`` is the SAME
    # predicate the push/pull loop layers use, so the workflow layer and the
    # loop layer can never disagree about what "blocking" means.
    open_blocking = [i for i in open_issues if is_blocking_issue(i)]

    # Disposition authority applies to BOTH the verification and remediation
    # boundaries (SS1): an unknown/unauthorized resolution_status anywhere in the
    # envelope is invalid evidence -> fail closed to a human BEFORE any branch can
    # route it onward. Hoisted above the branches so a `fixed` issue alongside an
    # unknown one cannot win via the remediation ``any_fixed`` path and recycle
    # invalid evidence back into re-verification (GPT SS1 rerun finding).
    if unknown_disposition:
        return STATE_AWAITING_HUMAN

    if latest_type == SESSION_TYPE_VERIFICATION:
        verdict = str(latest.get("verificationVerdict") or "").strip().upper()
        verified_token = verdict.startswith("VERIFIED")
        if open_blocking:
            # A VERIFIED token that nonetheless carries an open blocking finding
            # is CONTRADICTORY evidence (token says clean, findings say
            # otherwise): trust neither — a human adjudicates. This also replaces
            # the old short-circuit that returned closed-verified on the bare
            # VERIFIED token *before* inspecting the issues (so a structured
            # Major could ride a mislabeled VERIFIED). A normal ISSUES_FOUND
            # blocking round routes to remediation, or to a human at the limit.
            if verified_token:
                return STATE_AWAITING_HUMAN
            verification_rounds = sum(
                1 for s in sessions if _session_type(s) == SESSION_TYPE_VERIFICATION
            )
            if human_stop or verification_rounds >= _AUTOMATIC_ROUND_LIMIT:
                return STATE_AWAITING_HUMAN
            return STATE_AWAITING_REMEDIATION
        if human_stop:
            # No open blocker, but a finding escalates to a human
            # (advisory-disagreement / escalate-human / needs-more-context).
            return STATE_AWAITING_HUMAN
        if not issues:
            # Set 077 S5: a completed verification round with NO findings
            # envelope is unconfirmable pre-terminal unless the verdict token
            # vouches (VERIFIED). On a set that already closed terminally, keep
            # the legacy closed-verified reading (the close gate vouched then).
            if verified_token or set_terminal:
                return STATE_CLOSED_VERIFIED
            return STATE_AWAITING_HUMAN
        # Findings present, none open-blocking: Minor-only (verified with
        # observations) or every finding already terminally dispositioned
        # (e.g. all accepted/not-reproducible). Effectively verified (L-071-1).
        return STATE_CLOSED_VERIFIED

    if latest_type == SESSION_TYPE_REMEDIATION:
        if human_stop or open_issues:
            # Unresolved or escalated findings need a human call.
            return STATE_AWAITING_HUMAN
        any_fixed = any(_disposition(i) == "fixed" for i in issues)
        all_terminal = bool(issues) and all(
            _disposition(i) in _TERMINAL_DISPOSITIONS for i in issues
        )
        if any_fixed:
            # Code/doc changes were made ⇒ re-verify the fixes.
            return STATE_AWAITING_VERIFICATION
        if all_terminal:
            # No changes, every finding terminally dispositioned ⇒ done.
            return STATE_CLOSED_DISPOSITIONED
        # No issues envelope to reason about after a remediation is an
        # incoherent state; surface it to a human rather than guessing.
        return STATE_AWAITING_HUMAN

    # Unknown type on the latest entry — fall back to the safe default.
    return STATE_WORK_IN_PROGRESS


def derive_workflow_state(session_set_dir: str | Path) -> str:
    """Derive the seven-state workflow state from on-disk artifacts.

    Reads the normalized ``sessions[]`` + set status, the durable
    ``verificationMode`` record, and the latest ``sN-issues.json``
    envelope, then delegates to :func:`derive_state`. Returns one of
    :data:`WORKFLOW_STATES`. Never raises on a missing/garbled state file
    — degrades to ``work-in-progress``.
    """
    set_dir = Path(session_set_dir)
    mode = read_verification_mode(set_dir)
    state_path = set_dir / "session-state.json"
    sessions: List[dict] = []
    set_status: Optional[str] = None
    if state_path.is_file():
        try:
            with state_path.open("r", encoding="utf-8") as f:
                raw = json.load(f)
            normalized = normalize_to_v4_shape(raw, set_dir / "spec.md")
            sessions = normalized.get("sessions") or []
            set_status = normalized.get("status")
        except Exception:
            sessions = []
            set_status = None
    latest_issues = read_latest_issues_envelope(set_dir)
    return derive_state(
        sessions,
        verification_mode=mode,
        set_status=set_status,
        latest_issues=latest_issues,
    )


__all__ = [
    "VERIFICATION_MODE_DEDICATED",
    "VERIFICATION_MODE_OUT_OF_BAND",
    "VERIFICATION_MODES",
    "DEFAULT_VERIFICATION_MODE",
    "VERIFICATION_MODE_ENTRY_KIND",
    "VERIFICATION_MODE_CHANGE_ENTRY_KIND",
    "STATE_WORK_IN_PROGRESS",
    "STATE_AWAITING_VERIFICATION",
    "STATE_AWAITING_REMEDIATION",
    "STATE_AWAITING_HUMAN",
    "STATE_CLOSED_VERIFIED",
    "STATE_CLOSED_DISPOSITIONED",
    "STATE_CLOSED_NO_VERIFICATION",
    "WORKFLOW_STATES",
    "DedicatedVerificationResult",
    "VerificationModeChangeResult",
    "change_verification_mode",
    "read_verification_mode",
    "record_verification_mode",
    "read_spec_verification_mode",
    "has_verification_mode_record",
    "resolve_and_record_verification_mode",
    "seed_issues_envelope",
    "read_latest_issues_envelope",
    "validate_dedicated_verification",
    "cross_provider_satisfied",
    "work_session_pairs",
    "derive_state",
    "derive_workflow_state",
]
