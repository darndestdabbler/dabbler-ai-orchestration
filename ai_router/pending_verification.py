"""Pending-verification notices for ``start_session`` (Set 077 Feature 4).

A5 (Set 077): nothing ever surfaced an owed / unfinished verification at
the next session start — a Mode-B set whose work sessions completed sat
silently in ``awaiting-verification`` forever, and a Mode-A set that
closed without an ``external-verification.md`` verdict was never
mentioned again. This module derives those owed states and returns the
ASCII notice lines ``start_session`` prints as a loud, **advisory,
never-blocking** banner (Feature 4 standard: the banner cannot block a
start, and headless output is identical).

Everything here is derived from existing readers — the Set 057
seven-state derivation (``dedicated_verification.derive_workflow_state``),
the durable ``verificationMode`` record, and the Set 077 S4
``external_verification`` round parser. No new state is persisted (the
Set 047 derive rule), no router config is read (the banner must fire on
``--no-router`` Lightweight repos), and no reader here ever writes —
the module deliberately avoids ``session_state.read_status`` because its
lazy-synthesis side effect would materialize state files during a scan.

What is checked, in order:

1. **The set being started** — a Mode-B (``dedicated-sessions``) set in
   an ``awaiting-*`` state names its exact next action.
2. **In-progress sibling sets** in the same ``docs/session-sets/``
   parent — stalled Mode-B sets deriving to an ``awaiting-*`` state.
3. **The most recently completed sibling set** —
   * Mode B: an ``awaiting-*`` derivation (the headless soft-warn close
     path can flip a set complete with its verification still owed);
   * Mode A / default: closed with every session's
     ``verificationVerdict`` null AND no recognizable **work-scoped**
     verdict in ``external-verification.md``. Per Critique-2 M3 the
     opt-out is the parsed ``WAIVED`` record (latest round), never
     guessed absence — a latest-round ``WAIVED`` suppresses the notice,
     bare absence never does. A latest-round ``ISSUES_FOUND`` yields the
     "review and respond to round N" notice instead.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import List, Optional

try:
    from dedicated_verification import (  # type: ignore[import-not-found]
        STATE_AWAITING_HUMAN,
        STATE_AWAITING_REMEDIATION,
        STATE_AWAITING_VERIFICATION,
        VERIFICATION_MODE_DEDICATED,
        derive_workflow_state,
        read_verification_mode,
    )
    from progress import normalize_to_v4_shape  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - import shim
    from .dedicated_verification import (  # type: ignore[no-redef]
        STATE_AWAITING_HUMAN,
        STATE_AWAITING_REMEDIATION,
        STATE_AWAITING_VERIFICATION,
        VERIFICATION_MODE_DEDICATED,
        derive_workflow_state,
        read_verification_mode,
    )
    from .progress import normalize_to_v4_shape  # type: ignore[no-redef]

# Set 048 S5 bare-import lesson + static guard (test_production_imports):
# never a bare `from external_verification import ...` — the relative form
# covers package use; the absolute form covers this module being imported
# by bare filename (the test convention), where relative imports have no
# parent package.
try:
    from .external_verification import (
        VERDICT_ISSUES_FOUND,
        VERDICT_VERIFIED,
        VERDICT_WAIVED,
        read_external_verification,
    )
except ImportError:  # pragma: no cover - import shim
    from ai_router.external_verification import (  # type: ignore[no-redef]
        VERDICT_ISSUES_FOUND,
        VERDICT_VERIFIED,
        VERDICT_WAIVED,
        read_external_verification,
    )


#: Ceiling on emitted notices so a pathological repo cannot flood the
#: session-start output. Real repos have at most a couple of owed sets.
MAX_NOTICES = 5

_AWAITING_STATES = (
    STATE_AWAITING_VERIFICATION,
    STATE_AWAITING_REMEDIATION,
    STATE_AWAITING_HUMAN,
)


def _set_dir_arg(set_dir: Path) -> str:
    """A paste-safe --session-set-dir argument (quoted, forward slashes)."""
    return f'"{set_dir.as_posix()}"'


def _read_raw_state(set_dir: Path) -> Optional[dict]:
    """Side-effect-free raw ``session-state.json`` read; None on any error."""
    state_path = set_dir / "session-state.json"
    if not state_path.is_file():
        return None
    try:
        with state_path.open("r", encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, json.JSONDecodeError, UnicodeError):
        return None
    return raw if isinstance(raw, dict) else None


def _mode_b_notice(set_dir: Path, state: str) -> Optional[str]:
    """The exact-next-action line for a Mode-B ``awaiting-*`` state."""
    name = set_dir.name
    arg = _set_dir_arg(set_dir)
    if state == STATE_AWAITING_VERIFICATION:
        # Neutral placeholders (S5 verification round 1): the identity
        # must differ from the work sessions by engine OR provider —
        # "<other-engine>" would wrongly tell a Copilot-locked shop the
        # sanctioned same-engine different-provider pattern is not open.
        return (
            f"{name}: verification owed - run: python -m "
            f"ai_router.start_session --session-set-dir {arg} "
            "--type verification --engine <your-engine> "
            "--provider <your-provider> (must differ from the work "
            "sessions by engine or provider)"
        )
    if state == STATE_AWAITING_REMEDIATION:
        return (
            f"{name}: remediation owed - read the latest sN-issues*.json "
            f"in {arg} and open the remediation round through the blessed "
            "writer (start_session --type remediation, or --handoff from "
            "the in-flight verification session; see "
            "docs/ai-led-session-workflow.md -> Mode B)."
        )
    if state == STATE_AWAITING_HUMAN:
        return (
            f"{name}: verification stopped to a human - review the latest "
            f"verification round's findings/dispositions in {arg} "
            "(docs/ai-led-session-workflow.md -> Mode B bounded rounds)."
        )
    return None


def _all_session_verdicts_null(normalized: dict) -> bool:
    """True when no ``sessions[]`` entry carries a verification verdict."""
    sessions = normalized.get("sessions")
    if not isinstance(sessions, list):
        return True
    for s in sessions:
        if not isinstance(s, dict):
            continue
        verdict = s.get("verificationVerdict")
        if isinstance(verdict, str) and verdict.strip():
            return False
    return True


def _mode_a_owed_notice(set_dir: Path, normalized: dict) -> Optional[str]:
    """The owed-verification notice for a completed Mode-A set, or None.

    Owed = every session verdict is null AND the parsed
    ``external-verification.md`` carries no work-scoped verdict. The
    latest-round grammar decides (Critique-2 M3/M4): ``WAIVED`` is a
    durable opt-out (quiet), ``VERIFIED`` is done (quiet),
    ``ISSUES_FOUND`` owes a response (the round-N notice), anything else
    — absence, template-only, spec-scope-only — owes the verification
    itself.
    """
    if not _all_session_verdicts_null(normalized):
        return None
    result = read_external_verification(str(set_dir))
    name = set_dir.name
    rel = f"{set_dir.as_posix()}/external-verification.md"
    if result.has_recognizable_verdict and not result.is_specification_scope:
        if result.verdict == VERDICT_ISSUES_FOUND:
            round_label = (
                f"round {result.round}" if result.round is not None else "latest round"
            )
            return (
                f"{name}: review and respond to external-verification.md "
                f"{round_label} (ISSUES_FOUND) - {rel}"
            )
        if result.verdict in (VERDICT_VERIFIED, VERDICT_WAIVED):
            return None
    return (
        f"{name}: external verification owed - paste an 'Evaluate ...' "
        "prompt (Session Sets view -> Copy Prompt) into a DIFFERENT "
        f"assistant and have it write its verdict to {rel}"
    )


def _completed_sort_key(normalized: dict) -> str:
    """Recency key for ranking completed sets (ISO strings compare)."""
    for field in ("completedAt", "startedAt"):
        value = normalized.get(field)
        if isinstance(value, str) and value:
            return value
    return ""


def pending_verification_notices(session_set_dir: str | Path) -> List[str]:
    """Return the owed-verification notice lines for a session start.

    Never raises and never writes; any unreadable artifact simply drops
    its candidate from the scan (the banner is advisory — fail quiet,
    not loud, on infrastructure errors). Returns at most
    :data:`MAX_NOTICES` lines, ASCII-only.
    """
    notices: List[str] = []
    try:
        set_dir = Path(session_set_dir).resolve()
    except OSError:
        return notices

    # 1. The set being started.
    try:
        if read_verification_mode(set_dir) == VERIFICATION_MODE_DEDICATED:
            state = derive_workflow_state(set_dir)
            if state in _AWAITING_STATES:
                line = _mode_b_notice(set_dir, state)
                if line:
                    notices.append(line)
    except Exception:
        pass

    # 2 + 3. Sibling sets under the same parent.
    parent = set_dir.parent
    completed_candidates: List[tuple] = []  # (sort_key, dir, normalized)
    try:
        siblings = sorted(p for p in parent.iterdir() if p.is_dir())
    except OSError:
        siblings = []
    for sibling in siblings:
        if len(notices) >= MAX_NOTICES:
            break
        name = sibling.name
        if name.startswith(("_", ".")) or sibling == set_dir:
            continue
        if not (sibling / "spec.md").is_file():
            continue
        raw = _read_raw_state(sibling)
        if raw is None:
            continue
        status = raw.get("status")
        try:
            if status == "in-progress":
                if read_verification_mode(sibling) == VERIFICATION_MODE_DEDICATED:
                    state = derive_workflow_state(sibling)
                    if state in _AWAITING_STATES:
                        line = _mode_b_notice(sibling, state)
                        if line:
                            notices.append(line)
            elif status == "complete":
                normalized = normalize_to_v4_shape(raw, sibling / "spec.md")
                completed_candidates.append(
                    (_completed_sort_key(normalized), sibling, normalized)
                )
        except Exception:
            continue

    # 3. Only the MOST RECENTLY completed sibling is checked — older
    # completed sets are history, not an actionable owed state (and
    # pre-Set-057 sets with null verdicts would otherwise nag forever).
    if completed_candidates and len(notices) < MAX_NOTICES:
        completed_candidates.sort(key=lambda t: t[0])
        _key, latest_dir, normalized = completed_candidates[-1]
        try:
            if read_verification_mode(latest_dir) == VERIFICATION_MODE_DEDICATED:
                state = derive_workflow_state(latest_dir)
                if state in _AWAITING_STATES:
                    line = _mode_b_notice(latest_dir, state)
                    if line:
                        notices.append(line)
            else:
                line = _mode_a_owed_notice(latest_dir, normalized)
                if line:
                    notices.append(line)
        except Exception:
            pass

    return notices[:MAX_NOTICES]


def format_banner(notices: List[str]) -> str:
    """Render notice lines as the loud ASCII banner ``start_session`` prints.

    Empty input renders to an empty string (print nothing). One notice
    per line, each prefixed ``[dabbler]`` so the banner greps like every
    other lifecycle advisory; the ruler lines make it loud without any
    non-ASCII glyphs (cp1252 convention).
    """
    if not notices:
        return ""
    ruler = "[dabbler] " + "=" * 68
    lines = [ruler, "[dabbler] PENDING VERIFICATION - action needed:"]
    for n in notices:
        lines.append(f"[dabbler]   {n}")
    lines.append(ruler)
    return "\n".join(lines)


__all__ = [
    "MAX_NOTICES",
    "format_banner",
    "pending_verification_notices",
]
