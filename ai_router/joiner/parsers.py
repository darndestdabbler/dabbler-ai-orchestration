"""Native-log + state-file + launch-log scrapers for ai_router.joiner.

Promoted from ``spike-prototypes/correlation_prototype.py`` (Set 045
Session 1). Hardened for production use:

- Default roots are operator-machine paths (``~/.claude/projects``,
  ``~/.copilot/session-state``, ``~/.dabbler/launch-log.jsonl``) but
  every scanner accepts an explicit ``root`` for testability.
- Scanners are streaming generators (Q4 evidence: idiomatic Python
  short-circuits cleanly on large JSONL files; do not slurp the
  whole file).
- Tolerant of partial / malformed JSONL — a bad line skips, does
  not abort.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, Optional

from ai_router.joiner.schema import HarvestRecord, canonicalize_cwd, parse_iso
from ai_router.narration import detect_marker


# ---------------------------------------------------------------------------
# Native-session record (the joiner's per-session-log abstraction).
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class NativeSession:
    engine: str                 # 'claude' | 'copilot'
    conv_id: str                # native sessionId
    first_event_ts: datetime
    last_event_ts: Optional[datetime]
    cwd_canonical: str
    source_file: str
    cwd_source: str             # 'jsonl-field' | 'slug-fallback' | 'context'


# ---------------------------------------------------------------------------
# Path helpers for Claude's project-dir slug.
# ---------------------------------------------------------------------------


def claude_slug_to_cwd(slug: str) -> str:
    """Reverse Claude's project-dir slug back to a path-like comparable.

    The Windows slug format is "<drive>--<path-with-dashes>". Dashes
    in the original path are indistinguishable from path separators
    after the slug round-trip — this is a fallback only when the
    JSONL's own ``cwd`` field is missing.
    """
    if len(slug) >= 4 and slug[1:3] == "--":
        drive = slug[0]
        rest = slug[3:].replace("-", "/")
        return canonicalize_cwd(f"{drive}:/{rest}")
    return canonicalize_cwd(slug)


# ---------------------------------------------------------------------------
# Claude JSONL scrapers.
# ---------------------------------------------------------------------------


def default_claude_root() -> Path:
    return Path(os.path.expanduser("~")) / ".claude" / "projects"


def scan_claude_logs(root: Optional[Path] = None) -> Iterable[NativeSession]:
    """Yield one ``NativeSession`` per Claude JSONL conversation file."""
    actual_root = root or default_claude_root()
    if not actual_root.exists():
        return
    for workspace_dir in actual_root.iterdir():
        if not workspace_dir.is_dir():
            continue
        slug_cwd = claude_slug_to_cwd(workspace_dir.name)
        for jsonl_path in workspace_dir.glob("*.jsonl"):
            session = _read_claude_jsonl(jsonl_path, slug_cwd)
            if session is not None:
                yield session


def _read_claude_jsonl(jsonl_path: Path, slug_cwd: str) -> Optional[NativeSession]:
    conv_id = jsonl_path.stem
    first_ts: Optional[datetime] = None
    last_ts: Optional[datetime] = None
    cwd_field: Optional[str] = None
    try:
        with open(jsonl_path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                ts_str = rec.get("timestamp")
                if ts_str:
                    try:
                        parsed = parse_iso(ts_str)
                    except ValueError:
                        parsed = None
                    if parsed is not None:
                        if first_ts is None:
                            first_ts = parsed
                        last_ts = parsed
                if not cwd_field:
                    c = rec.get("cwd")
                    if c:
                        cwd_field = c
    except OSError:
        return None
    if first_ts is None:
        return None
    if cwd_field:
        cwd_canon = canonicalize_cwd(cwd_field)
        cwd_source = "jsonl-field"
    else:
        cwd_canon = slug_cwd
        cwd_source = "slug-fallback"
    return NativeSession(
        engine="claude",
        conv_id=conv_id,
        first_event_ts=first_ts,
        last_event_ts=last_ts,
        cwd_canonical=cwd_canon,
        source_file=str(jsonl_path),
        cwd_source=cwd_source,
    )


_CLAUDE_NOISE_TYPES = frozenset(
    {
        "queue-operation",
        "ai-title",
        "last-prompt",
        "file-history-snapshot",
        "attachment",
    }
)


def _summarize_claude_tool_args(args: object) -> Optional[dict]:
    """Reduce a Claude ``tool_use.input`` payload to a redacted summary.

    Mirrors the ``_summarize_tool_args`` posture for Copilot
    (joiner-spec.md §7): keep file paths + arity, drop content.
    Returns ``None`` when ``args`` is not a dict.
    """
    if not isinstance(args, dict):
        return None
    summary: dict[str, object] = {}
    for key in ("file_path", "path", "file", "filename"):
        if key in args and isinstance(args[key], str):
            summary["file"] = args[key]
            break
    for key in ("line_count", "lines", "count", "limit"):
        if key in args and isinstance(args[key], (int, float)):
            summary["lines"] = int(args[key])
            break
    if "command" in args and isinstance(args["command"], str):
        # Preserve command verb only; argv body is potentially sensitive.
        first_word = args["command"].strip().split(None, 1)[0] if args["command"].strip() else ""
        if first_word:
            summary["command_head"] = first_word
    if "args" in args and isinstance(args["args"], (list, tuple)):
        summary["arg_count"] = len(args["args"])
    if summary:
        return summary
    return {"arg_keys": sorted(k for k in args.keys() if isinstance(k, str))}


def _claude_usage_tokens(usage: object) -> tuple[Optional[int], Optional[int]]:
    """Return (tokens_in, tokens_out) from a Claude assistant ``usage`` block.

    Claude reports cache reads + cache creation + uncached input as
    separate counters; consumers comparing against Copilot's flat
    ``inputTokens`` get the closest analog by summing all three.
    """
    if not isinstance(usage, dict):
        return None, None
    input_total = 0
    seen_in = False
    for key in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"):
        v = usage.get(key)
        if isinstance(v, int):
            input_total += v
            seen_in = True
    out = usage.get("output_tokens")
    tokens_out = int(out) if isinstance(out, int) else None
    return (input_total if seen_in else None, tokens_out)


def read_claude_session_events(
    jsonl_path: Path,
    *,
    session_cwd_canonical: Optional[str] = None,
    fallback_conv_id: Optional[str] = None,
) -> Iterable[HarvestRecord]:
    """Yield canonical ``HarvestRecord`` objects per Claude JSONL event.

    Set 045 / Session 4 deliverable. Replaces the placeholder
    ``session_start``-only projection from S3's
    ``_native_events_for`` Claude fallback. Maps Claude JSONL
    record ``type`` values to the canonical ``event_type`` enum
    (joiner-spec.md §5.1):

    - First ``user`` or ``assistant`` record → one ``session_start``.
    - Each ``assistant`` record → one ``turn`` (timestamped from the
      record's ``timestamp`` field).
    - Each ``tool_use`` block in an assistant's ``message.content``
      → one ``tool_call`` (redacted via
      :func:`_summarize_claude_tool_args`, joiner-spec.md §7).
    - An assistant record carrying ``message.usage`` → one
      ``usage`` (tokens_in summed across uncached input + cache
      creation + cache read; tokens_out from ``output_tokens``).
    - Any ``text`` content block matching the
      ``[DABBLER-NARRATION v1 ...]`` regex
      (:func:`ai_router.narration.detect_marker`) → one ``marker``.
      Marker records carry ``source="narration"`` and back-pointer
      to the JSONL line for audit.

    Noise types (``queue-operation``, ``ai-title``, ``last-prompt``,
    ``file-history-snapshot``, ``attachment``) are skipped.

    Sticky context (cwd, conv_id, model, provider) is established
    from the first record carrying each field and threaded onto
    subsequent events. Provider defaults to ``"anthropic"`` once a
    Claude assistant record with a ``message.model`` is seen.

    Tolerant of malformed lines: a bad JSONL line is skipped, never
    aborts the iterator. Missing files yield nothing.
    """
    if not jsonl_path.exists():
        return
    conv_id_from_file = jsonl_path.stem
    sticky_conv_id: Optional[str] = fallback_conv_id or conv_id_from_file
    sticky_cwd: Optional[str] = session_cwd_canonical
    sticky_model: Optional[str] = None
    sticky_provider: Optional[str] = None
    emitted_session_start = False
    try:
        with open(jsonl_path, "r", encoding="utf-8", errors="replace") as f:
            for line_idx, line in enumerate(f, 1):
                if not line.strip():
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                rec_type = rec.get("type")
                if rec_type in _CLAUDE_NOISE_TYPES:
                    continue
                if rec_type not in ("user", "assistant"):
                    continue
                ts_str = rec.get("timestamp")
                if not ts_str:
                    continue
                try:
                    ts = parse_iso(ts_str)
                except ValueError:
                    continue
                # Sticky-context updates.
                cwd_field = rec.get("cwd")
                if cwd_field and not sticky_cwd:
                    sticky_cwd = canonicalize_cwd(cwd_field)
                conv_field = rec.get("sessionId")
                if conv_field:
                    sticky_conv_id = conv_field
                message = rec.get("message") if isinstance(rec.get("message"), dict) else {}
                model_field = message.get("model") if message else None
                if model_field and not sticky_model:
                    sticky_model = model_field
                    if not sticky_provider:
                        sticky_provider = "anthropic"
                cwd_for_record = sticky_cwd or ""

                if not emitted_session_start:
                    yield HarvestRecord(
                        ts=ts,
                        event_type="session_start",
                        source="claude-native",
                        engine="claude",
                        workspace_cwd=cwd_for_record,
                        workspace_cwd_canonical=cwd_for_record,
                        raw_ref={
                            "file": str(jsonl_path),
                            "line": line_idx,
                            "type": rec_type,
                        },
                        provider=sticky_provider,
                        model=sticky_model,
                        conv_id=sticky_conv_id,
                    )
                    emitted_session_start = True

                if rec_type != "assistant":
                    # Marker detection on user-side content is out of
                    # scope: per Set 044 narration-design.md §3.1 the
                    # marker is emitted by the assistant, not the user.
                    continue

                content = message.get("content") if message else None
                content_blocks = content if isinstance(content, list) else []

                # 1) Marker events (scan text blocks first so a turn
                #    that opens with the marker shows the marker
                #    record before the turn record at the same ts).
                for block_idx, block in enumerate(content_blocks):
                    if not isinstance(block, dict):
                        continue
                    if block.get("type") != "text":
                        continue
                    text = block.get("text")
                    if not isinstance(text, str):
                        continue
                    parsed = detect_marker(text)
                    if parsed is None:
                        continue
                    yield HarvestRecord(
                        ts=ts,
                        event_type="marker",
                        source="narration",
                        engine="claude",
                        workspace_cwd=cwd_for_record,
                        workspace_cwd_canonical=cwd_for_record,
                        raw_ref={
                            "file": str(jsonl_path),
                            "line": line_idx,
                            "block": block_idx,
                            "marker_raw": parsed.raw,
                            "semantic_error": parsed.semantic_error,
                            "incomplete": parsed.incomplete,
                            "skipped": parsed.skipped,
                        },
                        provider=sticky_provider,
                        model=sticky_model,
                        conv_id=sticky_conv_id,
                        set_slug=parsed.set_slug,
                        session_number=parsed.session,
                        effort=parsed.effort,
                    )

                # 2) Turn event (one per assistant record).
                yield HarvestRecord(
                    ts=ts,
                    event_type="turn",
                    source="claude-native",
                    engine="claude",
                    workspace_cwd=cwd_for_record,
                    workspace_cwd_canonical=cwd_for_record,
                    raw_ref={"file": str(jsonl_path), "line": line_idx, "type": "assistant"},
                    provider=sticky_provider,
                    model=sticky_model,
                    conv_id=sticky_conv_id,
                )

                # 3) Tool-call events.
                for block_idx, block in enumerate(content_blocks):
                    if not isinstance(block, dict):
                        continue
                    if block.get("type") != "tool_use":
                        continue
                    yield HarvestRecord(
                        ts=ts,
                        event_type="tool_call",
                        source="claude-native",
                        engine="claude",
                        workspace_cwd=cwd_for_record,
                        workspace_cwd_canonical=cwd_for_record,
                        raw_ref={
                            "file": str(jsonl_path),
                            "line": line_idx,
                            "block": block_idx,
                            "tool_use_id": block.get("id"),
                        },
                        provider=sticky_provider,
                        model=sticky_model,
                        conv_id=sticky_conv_id,
                        tool=block.get("name"),
                        tool_args_summary=_summarize_claude_tool_args(block.get("input")),
                    )

                # 4) Usage event.
                usage = message.get("usage") if message else None
                if usage is not None:
                    tokens_in, tokens_out = _claude_usage_tokens(usage)
                    if tokens_in is not None or tokens_out is not None:
                        yield HarvestRecord(
                            ts=ts,
                            event_type="usage",
                            source="claude-native",
                            engine="claude",
                            workspace_cwd=cwd_for_record,
                            workspace_cwd_canonical=cwd_for_record,
                            raw_ref={"file": str(jsonl_path), "line": line_idx, "type": "usage"},
                            provider=sticky_provider,
                            model=sticky_model,
                            conv_id=sticky_conv_id,
                            tokens_in=tokens_in,
                            tokens_out=tokens_out,
                        )
    except OSError:
        return


# ---------------------------------------------------------------------------
# Copilot OTel JSONL scrapers.
# ---------------------------------------------------------------------------


def default_copilot_root() -> Path:
    return Path(os.path.expanduser("~")) / ".copilot" / "session-state"


def scan_copilot_logs(root: Optional[Path] = None) -> Iterable[NativeSession]:
    """Yield one ``NativeSession`` per Copilot session-state directory."""
    actual_root = root or default_copilot_root()
    if not actual_root.exists():
        return
    for session_dir in actual_root.iterdir():
        if not session_dir.is_dir():
            continue
        events = session_dir / "events.jsonl"
        if not events.exists():
            continue
        session = _read_copilot_events(events, session_dir.name)
        if session is not None:
            yield session


_COPILOT_EVENT_TYPE_TO_HARVEST = {
    "session.start": "session_start",
    "session.end": "session_end",
    "turn.start": "turn",
    "turn.end": "turn",
    "tool.call": "tool_call",
    "tool.invoke": "tool_call",
    "usage": "usage",
}


def _summarize_tool_args(args: object) -> Optional[dict]:
    """Reduce raw tool arguments to a redacted summary.

    The joiner MUST NOT expose raw payloads (joiner-spec.md §7).
    We retain file paths and arity (line counts, arg counts) only.
    """
    if not isinstance(args, dict):
        return None
    summary: dict[str, object] = {}
    for key in ("file", "path", "filename"):
        if key in args and isinstance(args[key], str):
            summary["file"] = args[key]
            break
    for key in ("line_count", "lines", "count"):
        if key in args and isinstance(args[key], (int, float)):
            summary["lines"] = int(args[key])
            break
    if "args" in args and isinstance(args["args"], (list, tuple)):
        summary["arg_count"] = len(args["args"])
    if summary:
        return summary
    return {"arg_keys": sorted(k for k in args.keys() if isinstance(k, str))}


def _copilot_event_engine_meta(rec: dict) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Return (provider, model, conv_id) hints from a Copilot event."""
    data = rec.get("data") if isinstance(rec.get("data"), dict) else {}
    provider = data.get("provider") or rec.get("provider")
    model = data.get("model") or rec.get("model")
    conv_id = (
        data.get("sessionId")
        or data.get("session_id")
        or rec.get("sessionId")
        or rec.get("session_id")
    )
    return provider, model, conv_id


def read_copilot_session_events(
    events_path: Path,
    *,
    session_cwd_canonical: Optional[str] = None,
    fallback_conv_id: Optional[str] = None,
) -> Iterable[HarvestRecord]:
    """Yield canonical ``HarvestRecord`` objects per Copilot session event.

    Hardened replacement for the Set 045 / Session 1 spike scrape.
    Maps known Copilot OTel event types to the canonical
    ``event_type`` enum (joiner-spec.md §5.1):

    - ``session.start`` → ``session_start``
    - ``session.end``   → ``session_end``
    - ``turn.start`` / ``turn.end`` → ``turn``
    - ``tool.call`` / ``tool.invoke`` → ``tool_call``
    - ``usage`` → ``usage``

    Unknown event types are skipped (forward-compatible with new
    Copilot OTel revisions). The redaction posture from §7 is
    enforced: tool args are passed through
    :func:`_summarize_tool_args` so no raw payloads escape.
    """
    if not events_path.exists():
        return
    sticky_conv_id: Optional[str] = fallback_conv_id
    sticky_cwd: Optional[str] = session_cwd_canonical
    sticky_model: Optional[str] = None
    sticky_provider: Optional[str] = None
    try:
        with open(events_path, "r", encoding="utf-8", errors="replace") as f:
            for line_idx, line in enumerate(f, 1):
                if not line.strip():
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                evt_type = rec.get("type")
                harvest_type = _COPILOT_EVENT_TYPE_TO_HARVEST.get(evt_type)
                if harvest_type is None:
                    continue
                ts_str = (
                    rec.get("timestamp")
                    or (rec.get("data") or {}).get("startTime")
                    or (rec.get("data") or {}).get("endTime")
                )
                if not ts_str:
                    continue
                try:
                    ts = parse_iso(ts_str)
                except ValueError:
                    continue
                provider, model, conv_id = _copilot_event_engine_meta(rec)
                if provider:
                    sticky_provider = provider
                if model:
                    sticky_model = model
                if conv_id:
                    sticky_conv_id = conv_id
                if evt_type == "session.start":
                    data = rec.get("data") or {}
                    ctx_cwd = (data.get("context") or {}).get("cwd")
                    if ctx_cwd:
                        sticky_cwd = canonicalize_cwd(ctx_cwd)
                data = rec.get("data") if isinstance(rec.get("data"), dict) else {}
                tool_name: Optional[str] = None
                tool_args_summary: Optional[dict] = None
                tokens_in: Optional[int] = None
                tokens_out: Optional[int] = None
                if harvest_type == "tool_call":
                    tool_name = data.get("tool") or data.get("name")
                    tool_args_summary = _summarize_tool_args(data.get("args") or data.get("arguments") or data)
                if harvest_type == "usage":
                    tokens_in = data.get("inputTokens") or data.get("tokens_in")
                    tokens_out = data.get("outputTokens") or data.get("tokens_out")
                    if not isinstance(tokens_in, int):
                        tokens_in = None
                    if not isinstance(tokens_out, int):
                        tokens_out = None
                cwd_for_record = sticky_cwd or ""
                yield HarvestRecord(
                    ts=ts,
                    event_type=harvest_type,  # type: ignore[arg-type]
                    source="copilot-native",
                    engine="copilot",
                    workspace_cwd=cwd_for_record,
                    workspace_cwd_canonical=cwd_for_record,
                    raw_ref={"file": str(events_path), "line": line_idx, "type": evt_type},
                    provider=sticky_provider,
                    model=sticky_model,
                    conv_id=sticky_conv_id,
                    tool=tool_name,
                    tool_args_summary=tool_args_summary,
                    tokens_in=tokens_in,
                    tokens_out=tokens_out,
                )
    except OSError:
        return


def _read_copilot_events(events_path: Path, fallback_id: str) -> Optional[NativeSession]:
    first_rec: Optional[dict] = None
    last_ts: Optional[datetime] = None
    try:
        with open(events_path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if first_rec is None:
                    first_rec = rec
                ts_str = rec.get("timestamp") or rec.get("data", {}).get("startTime")
                if ts_str:
                    try:
                        last_ts = parse_iso(ts_str)
                    except ValueError:
                        pass
    except OSError:
        return None
    if first_rec is None:
        return None
    if first_rec.get("type") != "session.start":
        return None
    data = first_rec.get("data", {})
    conv_id = data.get("sessionId") or fallback_id
    start_ts = data.get("startTime") or first_rec.get("timestamp")
    if not start_ts:
        return None
    try:
        first_ts = parse_iso(start_ts)
    except ValueError:
        return None
    cwd = data.get("context", {}).get("cwd")
    return NativeSession(
        engine="copilot",
        conv_id=conv_id,
        first_event_ts=first_ts,
        last_event_ts=last_ts or first_ts,
        cwd_canonical=canonicalize_cwd(cwd) if cwd else "",
        source_file=str(events_path),
        cwd_source="context",
    )


# ---------------------------------------------------------------------------
# Unified native scan (used by both conflict detector and harvest stream).
# ---------------------------------------------------------------------------


def scan_native_sessions(
    claude_root: Optional[Path] = None,
    copilot_root: Optional[Path] = None,
) -> Iterable[NativeSession]:
    """Yield every native session known to the joiner (Claude + Copilot)."""
    yield from scan_claude_logs(claude_root)
    yield from scan_copilot_logs(copilot_root)


# ---------------------------------------------------------------------------
# Session-state.json reader (state-file is sole truth per Set 033 H2).
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SessionStateView:
    state_file: Path
    set_slug: str
    workspace_root: Path
    orchestrator_engine: Optional[str]
    orchestrator_provider: Optional[str]
    last_activity: Optional[datetime]


def read_session_state(state_file: Path) -> Optional[SessionStateView]:
    """Return the joiner-relevant projection of a session-state file.

    Returns ``None`` if the file is missing or unparseable. The
    state file is the canonical source of truth for "who's checked
    out"; the joiner reads it but does not write it.
    """
    if not state_file.exists():
        return None
    try:
        with open(state_file, "r", encoding="utf-8") as f:
            payload = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    set_slug = payload.get("sessionSetName") or state_file.parent.name
    orch = payload.get("orchestrator") or {}
    last_activity_str = orch.get("lastActivityAt") or payload.get("startedAt")
    last_activity: Optional[datetime]
    if last_activity_str:
        try:
            last_activity = parse_iso(last_activity_str)
        except ValueError:
            last_activity = None
    else:
        last_activity = None
    # workspace_root: walk up from <workspace>/docs/session-sets/<slug>/session-state.json
    # to the workspace root (4 parents up).
    workspace_root = state_file.resolve().parents[3] if len(state_file.resolve().parents) >= 4 else state_file.parent
    return SessionStateView(
        state_file=state_file,
        set_slug=set_slug,
        workspace_root=workspace_root,
        orchestrator_engine=orch.get("engine"),
        orchestrator_provider=orch.get("provider"),
        last_activity=last_activity,
    )


def scan_session_states(root: Path) -> Iterable[SessionStateView]:
    """Yield ``SessionStateView`` for every state file under ``root``.

    ``root`` is typically the workspace root; the function walks
    ``docs/session-sets/*/session-state.json`` per the
    canonical layout.
    """
    pattern_root = root / "docs" / "session-sets"
    if not pattern_root.exists():
        return
    for state_file in pattern_root.glob("*/session-state.json"):
        view = read_session_state(state_file)
        if view is not None:
            yield view


# ---------------------------------------------------------------------------
# Launch-log reader (consumed once S3 ships ``dabbler-launch``).
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class LaunchRecord:
    """Parser-internal projection of a launch-log line.

    The on-disk format is the canonical Harvest Record schema
    (joiner-spec.md §5); this dataclass is the joiner's working
    view for the join algorithm in §4. The wrapper writes records
    with ``event_type="launch"`` / ``source="wrapper"`` and the
    parser flattens to ``LaunchRecord``.
    """

    launch_ts: datetime
    workspace_cwd: str
    workspace_cwd_canonical: str
    set_slug: Optional[str]
    session_number: Optional[int]
    engine: str
    launch_id: str
    effort: Optional[str]
    provider: Optional[str]
    model: Optional[str]
    raw_ref: dict


def default_launch_log() -> Path:
    return Path(os.path.expanduser("~")) / ".dabbler" / "launch-log.jsonl"


def scan_launch_log(path: Optional[Path] = None) -> Iterable[LaunchRecord]:
    """Yield launch records from the wrapper's append-only JSONL.

    Reads the canonical Harvest Record schema (joiner-spec.md §5):
    ``ts`` + ``engine`` fields. For backward compatibility with the
    v0 stub shape that predated the schema lock, also accepts
    ``launch_ts`` (alias for ``ts``) and ``target_backend`` (alias
    for ``engine``); the wrapper writes the canonical names.

    Lines without a parseable timestamp or with neither engine
    field are skipped (defensive: the joiner emits records as
    unbound rather than aborting on garbage).
    """
    actual = path or default_launch_log()
    if not actual.exists():
        return
    try:
        with open(actual, "r", encoding="utf-8", errors="replace") as f:
            for idx, line in enumerate(f, 1):
                if not line.strip():
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                ts_str = rec.get("ts") or rec.get("launch_ts")
                if not ts_str:
                    continue
                try:
                    ts = parse_iso(ts_str)
                except ValueError:
                    continue
                cwd = rec.get("workspace_cwd", "")
                cwd_canonical = (
                    rec.get("workspace_cwd_canonical")
                    or canonicalize_cwd(cwd)
                )
                engine = rec.get("engine") or rec.get("target_backend") or "unknown"
                raw_ref_payload = dict(rec.get("raw_ref") or {})
                launch_id = (
                    raw_ref_payload.get("launch_id")
                    or rec.get("launch_id")
                    or ""
                )
                raw_ref_payload.setdefault("file", str(actual))
                raw_ref_payload.setdefault("line", idx)
                yield LaunchRecord(
                    launch_ts=ts,
                    workspace_cwd=cwd,
                    workspace_cwd_canonical=cwd_canonical,
                    set_slug=rec.get("set_slug"),
                    session_number=rec.get("session_number"),
                    engine=engine,
                    launch_id=launch_id,
                    effort=rec.get("effort"),
                    provider=rec.get("provider"),
                    model=rec.get("model"),
                    raw_ref=raw_ref_payload,
                )
    except OSError:
        return
