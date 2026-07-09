"""Writer-discipline check (the salvaged D3 "writer-bypass" detector).

Set 049 deliberately retained the writer-bypass detector (D3 in that
audit) as a *general writer-discipline check*, decoupled from the
coordination layer it was originally spec'd alongside. Set 051 removed
the rest of the orphaned ``ai_router.joiner`` subpackage — its only live
consumer, the extension's ``HarvestService``, was deleted in Set 049 (P4
Explorer revert) — but per cross-provider audit consensus this detector
was **salvaged** into a standalone module rather than allowed to vanish
with the dead code (both reviewers flagged silently dropping a
deliberately-kept capability as the audit's single biggest risk).

What it does
------------
The canonical session-state writers (``register_session_start`` /
``_flip_state_to_closed`` and their TypeScript mirrors) append a
``session-events.jsonl`` entry in the same transaction as each
``session-state.json`` write. So the state file's mtime should always be
bracketed by a ledger entry within a small tolerance. A divergence beyond
tolerance indicates an **out-of-band write** the canonical writers did not
perform — a hand-edit or a stray tool that bypassed the writer path. The
predicate is purely a writer-discipline check (state-file mtime vs. events
ledger), engine-independent, and useful even with no coordination model.

This module is **observation-only**: it reads ``session-state.json`` and
the sibling ``session-events.jsonl`` and never writes.

Provenance: lifted verbatim-in-behavior from the retired
``ai_router/joiner/{conflicts,parsers,schema}.py`` (Set 045), trimmed to
the single surviving detector and made self-contained (no ``joiner``
import).
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Literal, Optional

Severity = Literal["high", "medium", "low"]

# The canonical writers bracket the state-file write with a ledger entry in
# the same transaction; ±2s absorbs filesystem mtime granularity and the
# write/append ordering window.
DEFAULT_EVENT_TOLERANCE_NS = 2_000_000_000  # ±2 seconds

# Reason codes for a WriterBypassReport (Set 086 S1). The historical detector
# only ever produced the mtime-divergence case, which stays the default so
# every existing construction and consumer is unchanged. The two ledger-
# absence codes are emitted ONLY under ``require_ledger=True`` — the strict
# mode the Full-tier close gate opts into (docs/session-sets/086.../spec.md;
# gate-placement architecture: s1-gate-placement-architecture.json).
REASON_MTIME_DIVERGENCE = "mtime-divergence"
REASON_LEDGER_ABSENT = "ledger-absent"
REASON_LEDGER_EMPTY = "ledger-empty"
# Set 086 S1 (Round-5 finding): under require_ledger, an OSError reading/stat'ing
# the state file or the ledger must fail loud, not skip — an unreadable ledger
# is as uncorroborated as an absent one.
REASON_LEDGER_UNREADABLE = "ledger-unreadable"


# ---------------------------------------------------------------------------
# Self-contained helpers (formerly ai_router.joiner.schema / .parsers).
# ---------------------------------------------------------------------------


def canonicalize_cwd(cwd: str) -> str:
    """Normalize a workspace cwd into a stable comparison form.

    Forward-slashed, lowercased, no trailing slash. Case-insensitive on
    Windows; harmless on POSIX.
    """
    if not cwd:
        return ""
    return cwd.replace("\\", "/").rstrip("/").lower()


def parse_iso(ts: str) -> datetime:
    """Parse an ISO-8601 timestamp into an aware ``datetime``.

    Accepts the trailing ``Z`` form and naive timestamps (assumed UTC).
    Raises ``ValueError`` on unparseable input — callers treat that as a
    skip.
    """
    if not ts:
        raise ValueError("empty timestamp")
    cleaned = ts.strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    parsed = datetime.fromisoformat(cleaned)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


@dataclass(frozen=True)
class SessionStateView:
    """The writer-discipline-relevant projection of a state file."""

    state_file: Path
    set_slug: str
    workspace_root: Path


def read_session_state(state_file: Path) -> Optional[SessionStateView]:
    """Return the writer-discipline projection of a session-state file.

    Returns ``None`` if the file is missing or unparseable.
    """
    if not state_file.exists():
        return None
    try:
        with open(state_file, "r", encoding="utf-8") as f:
            payload = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    set_slug = payload.get("sessionSetName") or state_file.parent.name
    # workspace_root: walk up from
    # <workspace>/docs/session-sets/<slug>/session-state.json (4 parents).
    resolved = state_file.resolve()
    workspace_root = (
        resolved.parents[3] if len(resolved.parents) >= 4 else state_file.parent
    )
    return SessionStateView(
        state_file=state_file,
        set_slug=set_slug,
        workspace_root=workspace_root,
    )


def scan_session_states(root: Path) -> Iterable[SessionStateView]:
    """Yield a ``SessionStateView`` for every state file under ``root``.

    ``root`` is typically the workspace root; walks
    ``docs/session-sets/*/session-state.json`` per the canonical layout.
    """
    pattern_root = root / "docs" / "session-sets"
    if not pattern_root.exists():
        return
    for state_file in pattern_root.glob("*/session-state.json"):
        view = read_session_state(state_file)
        if view is not None:
            yield view


# ---------------------------------------------------------------------------
# Report type.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class WriterBypassReport:
    kind: Literal["writer-bypass"]
    severity: Severity
    detected_at: datetime
    set_slug: Optional[str]
    state_file: str
    workspace_cwd_canonical: str
    evidence: dict
    raw_refs: list[dict] = field(default_factory=list)
    note: str = ""
    # Set 086 S1: which discipline rule fired. Defaults to the historical
    # mtime-divergence case so every pre-existing construction keeps its
    # meaning; ``require_ledger=True`` sets the two ledger-absence codes.
    reason: str = REASON_MTIME_DIVERGENCE

    def to_json_dict(self) -> dict:
        payload = asdict(self)
        payload["detected_at"] = self.detected_at.isoformat()
        return payload


# ---------------------------------------------------------------------------
# Detector — out-of-band writes the canonical writers did not perform.
# ---------------------------------------------------------------------------


def _ledger_absence_report(
    state: SessionStateView,
    events_path: Path,
    when: datetime,
    *,
    reason: str,
    note: str,
) -> WriterBypassReport:
    """Build the HIGH report emitted for an absent/empty ledger under
    ``require_ledger=True``. No mtime delta exists in this case, so the
    evidence carries the reason and the ledger path rather than a delta."""
    return WriterBypassReport(
        kind="writer-bypass",
        severity="high",
        detected_at=when,
        set_slug=state.set_slug,
        state_file=str(state.state_file),
        workspace_cwd_canonical=canonicalize_cwd(str(state.workspace_root)),
        evidence={
            "reason": reason,
            "events_path": str(events_path),
            "events_ledger_present": reason == REASON_LEDGER_EMPTY,
            "content_hash": None,
        },
        raw_refs=[
            {"file": str(state.state_file), "field": "mtime"},
            {"file": str(events_path), "field": "ledger"},
        ],
        note=note,
        reason=reason,
    )


def detect_writer_bypass(
    state: SessionStateView,
    *,
    detected_at: Optional[datetime] = None,
    event_tolerance_ns: int = DEFAULT_EVENT_TOLERANCE_NS,
    require_ledger: bool = False,
) -> list[WriterBypassReport]:
    """Surface writer-bypass reports for one state file.

    A bypass is suspected when ``session-state.json``'s mtime is not
    bracketed by a corresponding ``session-events.jsonl`` entry within
    ``event_tolerance_ns``. The canonical writers append an event in the
    same transaction as the state-file write; a divergence indicates the
    snapshot was touched out-of-band.

    ``require_ledger`` (Set 086 S1) flips the *absence* handling. By default
    (``False``) an absent or empty ledger is skipped — the frame is wrong for
    a set that may predate ledgers, which protects the standalone historical
    scan and its existing callers/tests. When ``True`` — the mode the
    Full-tier close gate opts into — an absent ledger (``ledger-absent``) or
    an empty ledger (``ledger-empty``) is instead the *loudest* signal: a
    single HIGH ``WriterBypassReport``. This is the one case a fully-simulated
    session (no router ever ran) produces, and it is exactly what the close
    must fail loud on rather than skip. See the gate-placement decision in
    ``docs/session-sets/086-verification-verdict-token-legibility/``.
    """
    when = detected_at or datetime.now(timezone.utc)
    events_path = state.state_file.with_name("session-events.jsonl")
    try:
        state_mtime_ns = state.state_file.stat().st_mtime_ns
    except OSError as exc:
        # Standalone scan: cannot compare, skip. Close gate
        # (require_ledger=True): a state file we cannot even stat cannot
        # corroborate a ledger — fail loud rather than silently pass (Round-5
        # finding: no OSError path may disarm the axis).
        if require_ledger:
            return [
                _ledger_absence_report(
                    state, events_path, when,
                    reason=REASON_LEDGER_UNREADABLE,
                    note=(
                        "could not stat the session-state file to corroborate "
                        f"the router ledger ({type(exc).__name__}); a Full-tier "
                        "close fails closed rather than skip an unreadable path"
                    ),
                )
            ]
        return []
    if not events_path.exists():
        # No events ledger at all. Standalone scan: bypass is the wrong frame
        # (the set may be too old to have one yet), so skip. Close gate
        # (require_ledger=True): absence is the tell that no canonical writer
        # ever ran — fail loud at HIGH.
        if require_ledger:
            return [
                _ledger_absence_report(
                    state, events_path, when,
                    reason=REASON_LEDGER_ABSENT,
                    note=(
                        "no session-events.jsonl ledger next to the state file; "
                        "a Full-tier close requires a router-written ledger "
                        "(created by start_session) as proof a real writer "
                        "executed this session"
                    ),
                )
            ]
        return []
    nearest_event_ns: Optional[int] = None
    nearest_delta_ns: Optional[int] = None
    try:
        with open(events_path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                ts_str = rec.get("ts") or rec.get("timestamp")
                if not ts_str:
                    continue
                try:
                    ts = parse_iso(ts_str)
                except ValueError:
                    continue
                evt_ns = int(ts.timestamp() * 1_000_000_000)
                delta = abs(evt_ns - state_mtime_ns)
                if nearest_delta_ns is None or delta < nearest_delta_ns:
                    nearest_delta_ns = delta
                    nearest_event_ns = evt_ns
    except OSError as exc:
        # The ledger exists (``events_path.exists()`` was true) but cannot be
        # read — permission-denied, replaced with a directory, an I/O error.
        # Standalone scan: skip. Close gate (require_ledger=True): an
        # unreadable ledger is as uncorroborated as none — fail loud (Round-5
        # finding), never fall through to the stamp/verdict axis.
        if require_ledger:
            return [
                _ledger_absence_report(
                    state, events_path, when,
                    reason=REASON_LEDGER_UNREADABLE,
                    note=(
                        "session-events.jsonl exists but could not be read "
                        f"({type(exc).__name__}); a Full-tier close cannot "
                        "corroborate an unreadable ledger; failing closed"
                    ),
                )
            ]
        return []

    if nearest_delta_ns is None:
        # Empty (or all-unparseable) ledger. Standalone scan: same caveat as a
        # missing ledger, skip. Close gate (require_ledger=True): a ledger with
        # no usable canonical-writer event is as bad as none — fail loud.
        if require_ledger:
            return [
                _ledger_absence_report(
                    state, events_path, when,
                    reason=REASON_LEDGER_EMPTY,
                    note=(
                        "session-events.jsonl exists but carries no usable "
                        "canonical-writer event; a Full-tier close cannot be "
                        "corroborated as router-executed against an empty ledger"
                    ),
                )
            ]
        return []
    if nearest_delta_ns <= event_tolerance_ns:
        return []
    return [
        WriterBypassReport(
            kind="writer-bypass",
            severity="high",
            detected_at=when,
            set_slug=state.set_slug,
            state_file=str(state.state_file),
            workspace_cwd_canonical=canonicalize_cwd(str(state.workspace_root)),
            evidence={
                "state_mtime_ns": state_mtime_ns,
                "nearest_event_ts_ns": nearest_event_ns,
                "delta_seconds": round(nearest_delta_ns / 1_000_000_000, 3),
                "content_hash": None,
            },
            raw_refs=[
                {"file": str(state.state_file), "field": "mtime"},
                {"file": str(events_path), "field": "nearest-event"},
            ],
            note=(
                f"state-file mtime is {nearest_delta_ns / 1_000_000_000:.1f}s "
                f"from the nearest events-ledger entry; canonical writers "
                f"bracket within +/-2s"
            ),
        )
    ]


# ---------------------------------------------------------------------------
# Top-level entry point: scan all known state files.
# ---------------------------------------------------------------------------


def scan_writer_bypass(
    set_slug: Optional[str] = None,
    *,
    workspace_root: Optional[Path] = None,
    detected_at: Optional[datetime] = None,
    require_ledger: bool = False,
) -> list[WriterBypassReport]:
    """Scan all known state files and emit writer-bypass reports.

    Args:
        set_slug: optionally restrict to one session set.
        workspace_root: defaults to ``Path.cwd()``; walks
            ``<root>/docs/session-sets/*/session-state.json`` from there.
        detected_at: pin the run timestamp (for deterministic tests).
        require_ledger: Set 086 S1 — treat an absent/empty ledger as a HIGH
            finding rather than skipping (see :func:`detect_writer_bypass`).
            Default ``False`` preserves the historical multi-set scan; the
            close gate calls the single-set :func:`detect_writer_bypass`
            directly with ``True``.
    """
    root = workspace_root or Path.cwd()
    reports: list[WriterBypassReport] = []
    for state in scan_session_states(root):
        if set_slug and state.set_slug != set_slug:
            continue
        reports.extend(
            detect_writer_bypass(
                state, detected_at=detected_at, require_ledger=require_ledger
            )
        )
    return reports
