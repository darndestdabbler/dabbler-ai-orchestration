"""Narration v1.1 — canonical templates + marker parser.

Set 045 Session 4. Produces and consumes the
``[DABBLER-NARRATION v1 phase=session-start ...]`` markers
specified in
``docs/session-sets/044-ai-chat-log-discovery-and-experiments/narration-design.md``.

Two responsibilities live here:

1. **Render canonical instruction templates** that operators place
   into a workspace as ``CLAUDE.md`` (for Claude Code) or
   ``AGENTS.md`` (for Copilot CLI / other AGENTS.md-honoring tools).
   The templates follow the four defensive phrasing rules locked
   in Set 045 / Session 1 (`open-question-resolution.md` §Q3):
   no "harvest" lexical family, no pretense self-disclosure, framed
   as a project convention rather than a data-emission request, and
   minimal caps emphasis.

2. **Parse markers out of assistant text** with the regex from
   narration-design.md §2.3. The Set 045 Claude per-event parser
   calls into :func:`detect_marker` to emit ``event_type="marker"``
   ``HarvestRecord`` instances; future Copilot OTel parser work can
   share the same regex.

Per the Set 044 v1.1 contract, **only session-start markers are in
scope**; per-turn narration is permanently OUT (proposal §4.3).
This module's render path will refuse to emit a ``phase=turn``
template.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Optional

# ---------------------------------------------------------------------------
# Marker regex (anchored single-line, narration-design.md §2.3).
# ---------------------------------------------------------------------------

# The optional-quote character class covers ASCII ('"', "'") plus the
# four Unicode curly variants U+201C, U+201D, U+2018, U+2019. Spelled
# out with a named comment so future eyes do not "fix" the
# visually-confusing duplicates.
_QUOTE_CHARS = "\"'“”‘’"

MARKER_REGEX = re.compile(
    r"\[DABBLER-NARRATION\s+v(?P<ver>\d+)"
    r"(?P<body>(?:\s+[A-Za-z][A-Za-z0-9_-]*\s*=\s*"
    rf"[{_QUOTE_CHARS}]?[A-Za-z0-9_./-]+[{_QUOTE_CHARS}]?)*)"
    r"\s*\]"
)

_KVP_REGEX = re.compile(
    rf"([A-Za-z][A-Za-z0-9_-]*)\s*=\s*[{_QUOTE_CHARS}]?([A-Za-z0-9_./-]+)[{_QUOTE_CHARS}]?"
)

# Placeholder strings the rendered template MUST NOT carry into the
# emitted marker (semantic check, narration-design.md §5.5).
_PLACEHOLDERS = frozenset(
    {"SET-SLUG", "SESSION-NUMBER", "TOTAL-SESSIONS", "EFFORT-LEVEL"}
)
_VALID_EFFORTS = frozenset({"low", "medium", "high"})


# ---------------------------------------------------------------------------
# Marker parser output.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ParsedMarker:
    """Output of :func:`detect_marker`.

    Mirrors narration-design.md §5.2 with one practical change:
    ``effort_reasoning`` is named ``effort`` here to match the
    ``HarvestRecord.effort`` field on the canonical schema. Consumers
    needing the "reasoning-axis only" semantic distinction can read
    the §5.2 doc.
    """

    marker_version: int
    phase: Optional[str]
    set_slug: Optional[str]
    session: Optional[int]
    total: Optional[int]
    effort: Optional[str]
    raw: str
    skipped: bool = False
    incomplete: bool = False
    parse_error: bool = False
    semantic_error: Optional[str] = None
    extra: dict = field(default_factory=dict)


def detect_marker(text: str) -> Optional[ParsedMarker]:
    """Find the first canonical marker in ``text`` and parse it.

    Returns ``None`` if no marker syntactically matches. A marker
    that matches the regex but fails the semantic checks in
    narration-design.md §5.5 is returned with ``semantic_error``
    set — the joiner emits it as a record so the operator can see
    the malformed marker rather than silently dropping it.
    """
    if not text:
        return None
    match = MARKER_REGEX.search(text)
    if match is None:
        return None
    raw = match.group(0)
    version_str = match.group("ver")
    try:
        version = int(version_str)
    except ValueError:
        return ParsedMarker(
            marker_version=0,
            phase=None,
            set_slug=None,
            session=None,
            total=None,
            effort=None,
            raw=raw,
            parse_error=True,
        )
    if version != 1:
        return ParsedMarker(
            marker_version=version,
            phase=None,
            set_slug=None,
            session=None,
            total=None,
            effort=None,
            raw=raw,
            skipped=True,
        )
    body = match.group("body") or ""
    fields: dict[str, str] = {}
    for kv in _KVP_REGEX.finditer(body):
        key = kv.group(1).lower()
        value = kv.group(2)
        fields[key] = value
    phase = fields.pop("phase", None)
    set_slug = fields.pop("set", None)
    session_str = fields.pop("session", None)
    total_str = fields.pop("total", None)
    effort = fields.pop("effort", None)
    extra = dict(fields)

    semantic_error: Optional[str] = None

    def _to_int(name: str, val: Optional[str], tag: str) -> Optional[int]:
        nonlocal semantic_error
        if val is None:
            return None
        try:
            n = int(val)
        except ValueError:
            if semantic_error is None:
                semantic_error = tag
            return None
        if n <= 0:
            if semantic_error is None:
                semantic_error = tag
            return None
        return n

    session = _to_int("session", session_str, "non-integer-session")
    total = _to_int("total", total_str, "non-integer-total")

    # Placeholder-leakage check (narration-design.md §5.5).
    if semantic_error is None:
        for v in (phase, set_slug, session_str, total_str, effort):
            if v is not None and v in _PLACEHOLDERS:
                semantic_error = "placeholder-leakage"
                break

    # Phase + effort domain checks.
    if semantic_error is None and phase is not None and phase not in ("session-start", "turn"):
        semantic_error = "unknown-phase"
    if semantic_error is None and effort is not None and effort not in _VALID_EFFORTS:
        semantic_error = "unknown-effort-enum"
    if (
        semantic_error is None
        and session is not None
        and total is not None
        and session > total
    ):
        semantic_error = "session-exceeds-total"

    required_present = (
        phase is not None and set_slug is not None and session is not None
    )
    if phase == "session-start":
        required_present = required_present and total is not None
    incomplete = not required_present and semantic_error is None

    return ParsedMarker(
        marker_version=version,
        phase=phase,
        set_slug=set_slug,
        session=session,
        total=total,
        effort=effort,
        raw=raw,
        incomplete=incomplete,
        semantic_error=semantic_error,
        extra=extra,
    )


# ---------------------------------------------------------------------------
# Canonical template strings (Set 045 / Session 4).
#
# Defensive rules from open-question-resolution.md §Q3:
#   1. No "harvest" lexical family.
#   2. No pretense self-disclosure ("synthetic", "NOT a real project").
#   3. Framed as a project convention, not a data-emission request.
#   4. Minimal caps emphasis.
# ---------------------------------------------------------------------------


_CLAUDE_TEMPLATE = """# Project Instructions

This project uses session-boundary markers in assistant output so
that downstream tooling can correlate assistant turns with the
project's session-set state.

## Session-start marker

When you begin a new session in this project, the first text output
of your first response must be the marker line below, on a line by
itself, before any tool call or conversational scaffolding:

```
[DABBLER-NARRATION v1 phase=session-start set={set_slug} session={session_number} total={total_sessions}{effort_kv}]
```

Emit this marker exactly once, at session start. Do not modify the
bracket structure, spacing, or key names. Do not add a marker on
subsequent turns within the same session.
"""

_AGENTS_TEMPLATE = """# Project Instructions

This project uses session-boundary markers in assistant output so
that downstream tooling can correlate assistant turns with the
project's session-set state.

## Session-start marker

At the start of each new session in this project, the first text
output of your first response must be the marker line below, on a
line by itself, before any tool call or conversational scaffolding:

```
[DABBLER-NARRATION v1 phase=session-start set={set_slug} session={session_number} total={total_sessions}{effort_kv}]
```

Emit this marker exactly once, at session start. Do not modify the
bracket structure, spacing, or key names. Do not add a marker on
subsequent turns within the same session.
"""


TemplateKind = Literal["claude", "agents"]


def _validate_render_inputs(
    set_slug: str,
    session_number: int,
    total_sessions: int,
    effort: Optional[str],
) -> None:
    if not set_slug or not isinstance(set_slug, str):
        raise ValueError("set_slug must be a non-empty string")
    if set_slug in _PLACEHOLDERS:
        raise ValueError(
            "set_slug must be a concrete value, not a template placeholder"
        )
    if not isinstance(session_number, int) or session_number <= 0:
        raise ValueError("session_number must be a positive integer")
    if not isinstance(total_sessions, int) or total_sessions <= 0:
        raise ValueError("total_sessions must be a positive integer")
    if session_number > total_sessions:
        raise ValueError(
            f"session_number={session_number} exceeds total_sessions={total_sessions}"
        )
    if effort is not None and effort not in _VALID_EFFORTS:
        raise ValueError(
            f"effort must be one of {sorted(_VALID_EFFORTS)} or None; got {effort!r}"
        )


def render_template(
    kind: TemplateKind,
    *,
    set_slug: str,
    session_number: int,
    total_sessions: int,
    effort: Optional[str] = None,
) -> str:
    """Render a canonical narration instruction template.

    Args:
        kind: ``"claude"`` for ``CLAUDE.md`` (Claude Code); ``"agents"``
            for ``AGENTS.md`` (Copilot CLI / other AGENTS-honoring
            assistants).
        set_slug: kebab-case session-set slug (e.g.
            ``"045-log-harvest-implementation"``).
        session_number: positive integer.
        total_sessions: positive integer, ``>= session_number``.
        effort: optional reasoning-axis effort
            (``"low" | "medium" | "high"``); ``None`` to omit the
            ``effort=`` key from the marker.

    Returns:
        The rendered Markdown body as a string.

    Raises:
        ValueError: on invalid inputs. The function refuses to emit
            a template that would carry placeholder strings into the
            marker (which would be flagged later by §5.5's
            ``placeholder-leakage`` semantic check).
    """
    _validate_render_inputs(set_slug, session_number, total_sessions, effort)
    template = _CLAUDE_TEMPLATE if kind == "claude" else _AGENTS_TEMPLATE
    effort_kv = f" effort={effort}" if effort else ""
    return template.format(
        set_slug=set_slug,
        session_number=session_number,
        total_sessions=total_sessions,
        effort_kv=effort_kv,
    )


# ---------------------------------------------------------------------------
# session-state.json convenience reader (for the extension command +
# Lightweight-tier CLI usage).
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _SessionStateProjection:
    set_slug: str
    session_number: int
    total_sessions: int
    effort: Optional[str]


def project_state_for_template(state_path: Path) -> _SessionStateProjection:
    """Project a ``session-state.json`` into render() inputs.

    Reads the state file via the canonical D13 path
    (``ai_router.progress.read_progress``) and returns the minimal
    field set ``render_template()`` needs. The progress reader
    handles both v3 (``sessions[]``) and v2 (legacy triple) shapes
    so this helper does not have to. Raises ``FileNotFoundError``
    if the file is missing, ``ValueError`` if required fields are
    absent / invalid.
    """
    from ai_router.progress import read_progress

    if not state_path.exists():
        raise FileNotFoundError(f"session-state.json not found at {state_path}")
    with open(state_path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    set_slug = payload.get("sessionSetName")
    if not set_slug:
        raise ValueError(f"{state_path} is missing sessionSetName")
    spec_md_path = state_path.parent / "spec.md"
    view = read_progress(payload, spec_md_path)
    current = view.current_session
    total = view.total_sessions
    if not isinstance(current, int) or current <= 0:
        raise ValueError(
            f"{state_path}: no current session in progress view "
            f"(start_session has not been run yet)"
        )
    if not isinstance(total, int) or total <= 0:
        raise ValueError(f"{state_path}: total_sessions must be positive (got {total!r})")
    effort_raw = (payload.get("orchestrator") or {}).get("effort")
    effort: Optional[str]
    if isinstance(effort_raw, str) and effort_raw in _VALID_EFFORTS:
        effort = effort_raw
    else:
        effort = None
    return _SessionStateProjection(
        set_slug=set_slug,
        session_number=current,
        total_sessions=total,
        effort=effort,
    )


# ---------------------------------------------------------------------------
# CLI entry point.
# ---------------------------------------------------------------------------


def _cli_main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m ai_router.narration",
        description=(
            "Render canonical CLAUDE.md / AGENTS.md narration templates "
            "(Set 045 v1.1, session-start only)."
        ),
    )
    parser.add_argument(
        "--kind",
        choices=("claude", "agents"),
        required=True,
        help="Which template to render.",
    )
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument(
        "--state-file",
        type=Path,
        help="Path to a session-state.json; current session is read from it.",
    )
    src.add_argument(
        "--set-slug",
        help="Explicit set slug (when used, --session and --total must also be set).",
    )
    parser.add_argument("--session", type=int, help="Session number (with --set-slug).")
    parser.add_argument("--total", type=int, help="Total sessions in set (with --set-slug).")
    parser.add_argument(
        "--effort",
        choices=("low", "medium", "high"),
        help="Optional reasoning effort; omit to leave the marker effort key out.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Write to this path; default is stdout.",
    )
    args = parser.parse_args(argv)

    if args.state_file is not None:
        proj = project_state_for_template(args.state_file)
        rendered = render_template(
            args.kind,
            set_slug=proj.set_slug,
            session_number=proj.session_number,
            total_sessions=proj.total_sessions,
            effort=args.effort if args.effort is not None else proj.effort,
        )
    else:
        if args.session is None or args.total is None:
            parser.error("--set-slug requires --session and --total")
        rendered = render_template(
            args.kind,
            set_slug=args.set_slug,
            session_number=args.session,
            total_sessions=args.total,
            effort=args.effort,
        )

    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        sys.stdout.write(rendered)
        if not rendered.endswith("\n"):
            sys.stdout.write("\n")
    return 0


if __name__ == "__main__":  # pragma: no cover - exercised by integration
    sys.exit(_cli_main())
