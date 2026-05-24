"""Per-session-set coverage summaries for ai_router.joiner.

See joiner-spec.md §6. The Explorer (S5) renders per-row badges
from these summaries; the Q1 bypass-rate computation (S5) also
reads them.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

from ai_router.joiner import parsers
from ai_router.joiner.parsers import (
    NativeSession,
    scan_launch_log,
    scan_native_sessions,
    scan_session_states,
)


@dataclass(frozen=True)
class CoverageSummary:
    set_slug: str
    workspace_cwd_canonical: str
    wrapper_launched: bool
    narration_present: bool
    native_log_bound: bool
    last_signal_ts: Optional[datetime]
    bypass_inferred: bool

    def to_json_dict(self) -> dict:
        payload = asdict(self)
        payload["last_signal_ts"] = (
            self.last_signal_ts.isoformat() if self.last_signal_ts else None
        )
        return payload


def coverage(
    *,
    workspace_root: Optional[Path] = None,
    claude_root: Optional[Path] = None,
    copilot_root: Optional[Path] = None,
    launch_log: Optional[Path] = None,
) -> list[CoverageSummary]:
    """Compute per-session-set coverage summaries.

    Set 045 / S5 wires the ``narration_present`` field through to the
    S4 per-event marker detection. The ``wrapper_launched`` field
    reflects the S3 launch log; ``native_log_bound`` reflects the
    presence of any provider-native session in the workspace.
    """
    root = workspace_root or Path.cwd()
    natives = list(scan_native_sessions(claude_root=claude_root, copilot_root=copilot_root))
    launches = list(scan_launch_log(launch_log))
    summaries: list[CoverageSummary] = []
    for state in scan_session_states(root):
        workspace_canon = parsers.canonicalize_cwd(str(state.workspace_root))
        relevant_natives = [
            n for n in natives
            if n.cwd_canonical == workspace_canon
            or n.cwd_canonical.startswith(workspace_canon + "/")
        ]
        wrapper_launched = any(
            launch.set_slug == state.set_slug for launch in launches
        )
        native_log_bound = bool(relevant_natives)
        last_signal_ts = _max_ts(relevant_natives)
        narration_present = _any_narration_marker(
            relevant_natives, set_slug=state.set_slug,
        )
        summaries.append(
            CoverageSummary(
                set_slug=state.set_slug,
                workspace_cwd_canonical=workspace_canon,
                wrapper_launched=wrapper_launched,
                narration_present=narration_present,
                native_log_bound=native_log_bound,
                last_signal_ts=last_signal_ts,
                bypass_inferred=native_log_bound and not wrapper_launched,
            )
        )
    return summaries


def _any_narration_marker(
    natives: list[NativeSession],
    *,
    set_slug: str,
) -> bool:
    """Return True if any native in the workspace emitted a narration marker.

    Per joiner-spec.md §5.1 the marker event has
    ``source="narration"`` and ``event_type="marker"``. A marker
    bound to a launch carries the launch's ``set_slug``; free-running
    markers carry no ``set_slug``. The workspace filter has already
    been applied by the caller (``relevant_natives``), so an unbound
    marker is still strong evidence of narration presence for any
    set in the same workspace.

    Short-circuits on the first match — cheap on the common case
    where a workspace's first claude/copilot session yields a marker
    in its opening turns.
    """
    for native in natives:
        if native.engine == "claude":
            events = parsers.read_claude_session_events(
                Path(native.source_file),
                session_cwd_canonical=native.cwd_canonical,
                fallback_conv_id=native.conv_id,
            )
        elif native.engine == "copilot":
            # Per pre-S5 operator decision (2026-05-24), Copilot-side
            # `gen_ai.output.messages` marker scanning is deferred —
            # the Copilot per-event parser emits no marker events.
            # Future engines wire here without breaking the predicate.
            continue
        else:
            continue
        for evt in events:
            if evt.event_type != "marker":
                continue
            if evt.set_slug is None or evt.set_slug == set_slug:
                return True
    return False


def _max_ts(natives: list[NativeSession]) -> Optional[datetime]:
    candidates = [
        n.last_event_ts or n.first_event_ts for n in natives
    ]
    if not candidates:
        return None
    return max(candidates)
