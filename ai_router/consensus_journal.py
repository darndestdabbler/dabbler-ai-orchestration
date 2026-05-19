"""Decision-time consensus journal writer.

Set 031 ships the ``delegation.decision_consensus`` config sub-block that
lets the orchestrator route in-session design / architecture / process
decisions through cross-engine consensus before falling back to
``AskUserQuestion``. This module is the per-call writer for the journal
that captures those decisions for later audit.

Two artifacts per call:

1. **Per-line summary** appended to ``journal_path`` (default
   ``ai_router/consensus-decisions.jsonl``). One JSON object per call.
   Append-only. Mirrors the shape of ``router-metrics.jsonl`` so the
   two logs feel familiar.

2. **Optional full-payload sibling** at
   ``<journal_full_payloads_dir>/<timestamp>-<hash6>.md`` containing
   the prompt, per-engine responses verbatim, and the synthesized
   recommendation. Disabled by setting ``journal_full_payloads_dir``
   to ``None`` in the config (the JSONL summary still records the
   decision either way).

The hash that ties the two artifacts together is a ``sha256:`` prefix
over ``question_summary || category || timestamp`` so each line in the
JSONL can be cross-referenced against its full-payload Markdown file
by short prefix match.

See ``docs/ai-led-session-workflow.md`` "Decision-time consensus" for
the decision tree, eligible categories, and the design rationale
behind the split (per-line summary in git, disk-heavy payloads
gitignored).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Optional


# Agreement-level enum used in the per-line record. Documented here so
# orchestrators can import the canonical names rather than passing
# free-form strings.
AGREEMENT_LEVELS = ("aligned", "partial", "conflict", "degraded")
_AGREEMENT_LEVELS_SET = frozenset(AGREEMENT_LEVELS)

# Fallback-action enum. ``None`` is the no-fallback case — the
# synthesized recommendation was applied as-is.
FALLBACK_ACTIONS = ("ask_user", "orchestrator_judgment")
_FALLBACK_ACTIONS_SET = frozenset(FALLBACK_ACTIONS)


@dataclass(frozen=True)
class ConsensusRecord:
    """Per-line journal record for one consensus call.

    Field order matches the design doc's example payload so the on-disk
    JSONL reads cleanly when inspected with ``jq`` or similar.

    The dataclass is frozen so a record cannot be mutated after
    construction; serialize once, write once, move on.
    """

    timestamp: str
    session_set: str
    session_number: int
    category: str
    question_summary: str
    question_hash: str
    engines: list[str]
    agreement_level: str
    chosen_recommendation_summary: str
    applied: bool
    fallback_action: Optional[str]
    fallback_reason: Optional[str]
    input_tokens_total: int
    output_tokens_total: int
    cost_usd: float
    # Open-ended bag for forward-compat additions (agreement_level
    # heuristic details, per-engine breakdown, etc.). Kept separate so
    # the core schema stays explicit; merged flat at serialize time.
    extra: Mapping[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        out: dict = {
            "timestamp": self.timestamp,
            "session_set": self.session_set,
            "session_number": self.session_number,
            "category": self.category,
            "question_summary": self.question_summary,
            "question_hash": self.question_hash,
            "engines": list(self.engines),
            "agreement_level": self.agreement_level,
            "chosen_recommendation_summary": self.chosen_recommendation_summary,
            "applied": self.applied,
            "fallback_action": self.fallback_action,
            "fallback_reason": self.fallback_reason,
            "input_tokens_total": self.input_tokens_total,
            "output_tokens_total": self.output_tokens_total,
            "cost_usd": self.cost_usd,
        }
        # Merge extras flat. Reserved keys cannot be shadowed — the
        # explicit field always wins.
        for k, v in dict(self.extra).items():
            if k in out:
                continue
            out[k] = v
        return out


def now_iso() -> str:
    """Return the current time as an ISO 8601 string with offset.

    Local time + offset is used (not normalized to UTC) because the
    consensus journal is read by humans alongside other dated artifacts
    (commit logs, session-state.json) that use local-with-offset, and
    the offset preserves the original timezone for forensic context.
    The matching session_events.py log normalizes to UTC; the two
    conventions are deliberately independent — session events are
    machine-collated across hosts, consensus decisions are human-read
    in the orchestrator's own working timezone.
    """
    return datetime.now().astimezone().isoformat(timespec="milliseconds")


def compute_question_hash(
    question_summary: str,
    category: str,
    timestamp: str,
) -> str:
    """Return a ``sha256:`` prefix hash tying summary + category + timestamp.

    The hash is full-length sha256 (64 hex chars after the prefix). The
    short 6-char form used in full-payload filenames is taken from the
    front of this value via :func:`short_hash_from_full`.
    """
    blob = f"{question_summary}|{category}|{timestamp}".encode("utf-8")
    digest = hashlib.sha256(blob).hexdigest()
    return f"sha256:{digest}"


def short_hash_from_full(question_hash: str) -> str:
    """Return the first 6 hex chars of a ``sha256:…`` hash.

    Raises :class:`ValueError` if the input does not start with
    ``sha256:`` — the prefix is part of the canonical shape and the
    short form is meaningless without it.
    """
    if not question_hash.startswith("sha256:"):
        raise ValueError(
            "question_hash must start with 'sha256:' "
            f"(got {question_hash!r})"
        )
    return question_hash[len("sha256:"): len("sha256:") + 6]


# Filesystem-safe timestamp form for the full-payload filename.
# ``2026-05-19T14:03:21.456-04:00`` → ``2026-05-19T14-03-21-456-0400``.
_FS_TS_SUBS = (
    (":", "-"),
    (".", "-"),
    ("+", "p"),
)


def _filesystem_timestamp(ts: str) -> str:
    out = ts
    for src, dst in _FS_TS_SUBS:
        out = out.replace(src, dst)
    # Strip remaining problematic characters defensively.
    return re.sub(r"[^A-Za-z0-9_\-]", "-", out)


def append_record(
    record: ConsensusRecord,
    *,
    journal_path: str | os.PathLike[str],
) -> Path:
    """Append one :class:`ConsensusRecord` to the JSONL journal.

    Creates the parent directory if missing. Opens in append mode and
    flushes after the write so an external reader sees the line as
    soon as this call returns. A best-effort ``fsync`` follows; on
    platforms or filesystems that refuse it the call is silently
    skipped (logging metrics already follow this pattern).

    POSIX append + a single ``write`` are atomic with respect to other
    processes appending to the same file for sub-PIPE_BUF writes — a
    typical consensus-decision line fits well inside that ceiling, so
    no temp-and-rename ceremony is required for the JSONL path. The
    full-payload Markdown sibling uses temp-then-rename via
    :func:`write_full_payload`.

    Returns the path the record was written to.
    """
    path = Path(journal_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(record.to_dict(), ensure_ascii=False)
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")
        fh.flush()
        try:
            os.fsync(fh.fileno())
        except OSError:
            pass
    return path


def write_full_payload(
    *,
    full_payloads_dir: str | os.PathLike[str],
    timestamp: str,
    question_hash: str,
    content: str,
) -> Path:
    """Write the full prompt + per-engine responses Markdown sibling.

    File name format: ``<filesystem-ts>-<hash6>.md`` under
    ``full_payloads_dir``. Uses write-to-temp + ``os.replace`` so a
    crashed write never leaves a half-formed artifact next to the
    JSONL summary that points at it.

    Returns the path written.
    """
    out_dir = Path(full_payloads_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    name = f"{_filesystem_timestamp(timestamp)}-{short_hash_from_full(question_hash)}.md"
    target = out_dir / name
    tmp = target.with_name(target.name + f".tmp.{os.getpid()}")
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(content)
        fh.flush()
        try:
            os.fsync(fh.fileno())
        except OSError:
            pass
    os.replace(tmp, target)
    return target


@dataclass(frozen=True)
class JournalWriteResult:
    """Return value from :func:`write_consensus_record`.

    Carries the journal line path (always populated) and the full-payload
    Markdown path (populated only when ``full_payloads_dir`` was given).
    """

    journal_path: Path
    full_payload_path: Optional[Path]


def write_consensus_record(
    record: ConsensusRecord,
    *,
    journal_path: str | os.PathLike[str],
    full_payloads_dir: Optional[str | os.PathLike[str]] = None,
    full_payload_content: Optional[str] = None,
) -> JournalWriteResult:
    """One-shot write of both per-line summary and optional full payload.

    The typical orchestrator call site does both writes together; this
    helper keeps them in one place so the JSONL line and the Markdown
    sibling don't drift in shape or naming over time. Either artifact
    can be skipped:

    - Always writes ``record`` to ``journal_path``.
    - Writes the Markdown sibling only when BOTH ``full_payloads_dir``
      AND ``full_payload_content`` are given (a directory without
      content is a misconfiguration — raise rather than silently emit
      an empty file).
    """
    if full_payloads_dir is not None and full_payload_content is None:
        raise ValueError(
            "full_payload_content is required when full_payloads_dir is set"
        )

    line_path = append_record(record, journal_path=journal_path)
    payload_path: Optional[Path] = None
    if full_payloads_dir is not None:
        # full_payload_content is guaranteed non-None by the check above.
        assert full_payload_content is not None
        payload_path = write_full_payload(
            full_payloads_dir=full_payloads_dir,
            timestamp=record.timestamp,
            question_hash=record.question_hash,
            content=full_payload_content,
        )
    return JournalWriteResult(
        journal_path=line_path,
        full_payload_path=payload_path,
    )


def validate_record_inputs(
    *,
    agreement_level: str,
    fallback_action: Optional[str],
) -> None:
    """Validate enum-shaped fields before constructing a :class:`ConsensusRecord`.

    Raises :class:`ValueError` for unknown agreement level or fallback
    action. Used by callers that build records from operator-facing
    inputs; the dataclass itself is frozen but does not validate
    (mirrors session_events.Event's split between dataclass and
    ``append_event``).
    """
    if agreement_level not in _AGREEMENT_LEVELS_SET:
        raise ValueError(
            f"agreement_level must be one of {AGREEMENT_LEVELS}, "
            f"got {agreement_level!r}"
        )
    if fallback_action is not None and fallback_action not in _FALLBACK_ACTIONS_SET:
        raise ValueError(
            f"fallback_action must be None or one of {FALLBACK_ACTIONS}, "
            f"got {fallback_action!r}"
        )
