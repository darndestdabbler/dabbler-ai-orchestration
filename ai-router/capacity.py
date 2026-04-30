"""Per-provider capacity heartbeat signals.

Set 004 / Session 2. The role-loop daemons (verifier and orchestrator)
emit one structured signal per ``complete()`` so observers can answer
two narrow questions:

    1. When did this provider last produce work? (liveness)
    2. How much has it produced over the last N minutes? (utilization)

Both questions are **backward-looking**. This module deliberately does
NOT predict remaining capacity, throttle risk, or rate-limit headroom —
those are not knowable from heartbeat data, and a downstream consumer
that treated them as predictions would be making a category error. The
spec calls this out explicitly (see Set 004 spec, Session 2,
"heartbeat-only framing"), so the public surface here mirrors the
framing: ``read_capacity_summary`` returns observed quantities only.

Storage format
--------------
``provider-queues/<provider>/capacity_signal.jsonl``. JSON Lines (one
object per line) so appenders are O(1) and concurrent writers from
verifier/orchestrator daemons cannot tear partial records — each line
is a complete record terminated by a newline.

Each record:

    {
      "timestamp":        ISO-8601 UTC,
      "provider":         <provider>,
      "task_type":        <queue task_type>,
      "tokens_input":     int,
      "tokens_output":    int,
      "elapsed_seconds":  float | null,
      "model_name":       str | null
    }

Missing fields are written as ``null`` rather than omitted so each
line has a stable shape — ``read_capacity_summary`` does not need to
defend against schema drift across daemon versions.

Concurrency
-----------
The append uses Python's text-mode ``open(..., "a")`` which is atomic
per-line on POSIX and on Windows for writes smaller than the pipe-buf
limit (well under our payload size). The role-loop daemons each run
on their own provider directory, so cross-process contention for the
same file is rare; when it happens (e.g., two test workers writing
the same fixture path), each ``write`` lands as one complete line.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional


CAPACITY_SIGNAL_FILENAME = "capacity_signal.jsonl"

# Default lookback for ``read_capacity_summary``. 60 minutes matches
# the Anthropic 5-hour subscription window's smallest natural granular
# bucket — short enough that "right now" is meaningful, long enough
# that an idle stretch doesn't read as zero output.
DEFAULT_LOOKBACK_MINUTES = 60


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _provider_dir(base_dir: str, provider: str) -> str:
    return os.path.join(base_dir, provider)


def _signal_path(base_dir: str, provider: str) -> str:
    return os.path.join(_provider_dir(base_dir, provider), CAPACITY_SIGNAL_FILENAME)


def write_capacity_signal(
    provider: str,
    completion_metadata: dict,
    *,
    base_dir: str = "provider-queues",
) -> str:
    """Append one capacity signal record for ``provider``.

    ``completion_metadata`` is a free-form dict; the fields the
    role-loop daemons populate are pulled by name and missing fields
    are stored as ``null``. This shape is intentionally permissive —
    a daemon that doesn't know its own elapsed seconds (e.g., a unit
    test injecting a synthetic completion) should still be able to
    write a heartbeat.

    Recognized keys:

      * ``task_type``       — string; the queue's ``task_type`` value.
      * ``tokens_input``    — int; provider-reported input tokens.
      * ``tokens_output``   — int; provider-reported output tokens.
      * ``elapsed_seconds`` — float; wall-clock time the completion took.
      * ``model_name``      — string; the model that ran.

    Anything else in ``completion_metadata`` is ignored — the on-disk
    schema is fixed so downstream readers do not have to defend
    against drift. Returns the path written to (caller may want to
    log it).

    Best-effort: a write failure is swallowed so a transient FS error
    cannot wedge the role-loop. The caller is the daemon's
    ``complete()`` path; making the heartbeat fatal would defeat the
    whole point of an observational signal.
    """
    path = _signal_path(base_dir, provider)
    record = {
        "timestamp": _utc_now().isoformat(),
        "provider": provider,
        "task_type": completion_metadata.get("task_type"),
        "tokens_input": completion_metadata.get("tokens_input"),
        "tokens_output": completion_metadata.get("tokens_output"),
        "elapsed_seconds": completion_metadata.get("elapsed_seconds"),
        "model_name": completion_metadata.get("model_name"),
    }

    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        # ``a`` opens for append; ``encoding`` pinned to utf-8 so
        # Windows default cp1252 doesn't mangle non-ASCII task_type
        # strings if a provider ever uses one.
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, sort_keys=True) + "\n")
    except OSError:
        # Heartbeat is observational; never propagate.
        pass

    return path


@dataclass
class CapacitySummary:
    """Observed values from a per-provider capacity-signal log.

    All fields are backward-looking. None of them imply remaining
    capacity, throttle risk, or rate-limit headroom — see the module
    docstring for why.

    - ``provider``: the provider this summary describes.
    - ``signal_file_present``: whether the on-disk log exists at all.
      Distinguishes "no daemon has ever run" from "daemon has run
      but no completions in the window".
    - ``last_completion_at``: ISO timestamp of the most recent record
      (regardless of window), or ``None`` if the log is empty.
    - ``time_since_last_seconds``: float seconds between
      ``last_completion_at`` and ``now``, or ``None`` when the log is
      empty.
    - ``completions_in_window``: number of records whose timestamp is
      within ``lookback_minutes`` of ``now``.
    - ``tokens_in_window``: sum of ``tokens_input + tokens_output`` for
      the in-window records (zero when fields are null/missing).
    - ``lookback_minutes``: the window size used to compute the
      ``*_in_window`` fields. Echoed back so callers don't have to
      track it themselves.
    """

    provider: str
    signal_file_present: bool
    last_completion_at: Optional[str]
    time_since_last_seconds: Optional[float]
    completions_in_window: int
    tokens_in_window: int
    lookback_minutes: int

    def to_dict(self) -> dict:
        return {
            "provider": self.provider,
            "signal_file_present": self.signal_file_present,
            "last_completion_at": self.last_completion_at,
            "time_since_last_seconds": self.time_since_last_seconds,
            "completions_in_window": self.completions_in_window,
            "tokens_in_window": self.tokens_in_window,
            "lookback_minutes": self.lookback_minutes,
        }


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        # ``fromisoformat`` accepts the UTC offsets we write, plus
        # naive strings (treated as local). The records we write are
        # always offset-aware via ``_utc_now().isoformat()``.
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def read_capacity_summary(
    provider: str,
    *,
    lookback_minutes: int = DEFAULT_LOOKBACK_MINUTES,
    base_dir: str = "provider-queues",
    now: Optional[datetime] = None,
) -> CapacitySummary:
    """Summarize the capacity-signal log for ``provider``.

    Reads ``provider-queues/<provider>/capacity_signal.jsonl`` and
    returns a :class:`CapacitySummary`. A missing file produces a
    summary with ``signal_file_present=False`` and zeros for the
    counts — never raises.

    ``now`` lets tests inject a deterministic clock; production
    callers omit it.

    Robustness: a malformed line is skipped silently rather than
    failing the whole read. The log is append-only and any line that
    fails JSON parsing is almost certainly a torn write from an
    earlier crashed process — observed reads should still proceed.
    """
    if lookback_minutes <= 0:
        raise ValueError(
            f"lookback_minutes must be positive (got {lookback_minutes!r})"
        )

    now_dt = now or _utc_now()
    # Records on disk are always offset-aware (we write
    # ``_utc_now().isoformat()``). A test or older caller that
    # injects a NAIVE ``now`` would otherwise crash the in-window
    # comparison below ("can't compare offset-naive and offset-aware
    # datetimes"). Treat a naive ``now`` as UTC so all subsequent
    # arithmetic operates in a single tz-aware regime. Production
    # callers always pass an aware datetime; this is a pure
    # robustness measure.
    if now_dt.tzinfo is None:
        now_dt = now_dt.replace(tzinfo=timezone.utc)
    cutoff = now_dt - timedelta(minutes=lookback_minutes)

    path = _signal_path(base_dir, provider)
    present = os.path.isfile(path)

    last_at_str: Optional[str] = None
    last_at_dt: Optional[datetime] = None
    completions_in_window = 0
    tokens_in_window = 0

    if present:
        try:
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    ts_str = rec.get("timestamp")
                    ts_dt = _parse_iso(ts_str)
                    if ts_dt is None:
                        continue
                    # Track the latest timestamp seen, regardless of
                    # window, so ``last_completion_at`` is meaningful
                    # even when the window is short and empty.
                    if last_at_dt is None or ts_dt > last_at_dt:
                        last_at_dt = ts_dt
                        last_at_str = ts_str
                    if ts_dt >= cutoff:
                        completions_in_window += 1
                        tokens_in_window += int(rec.get("tokens_input") or 0)
                        tokens_in_window += int(rec.get("tokens_output") or 0)
        except OSError:
            present = False

    time_since_last: Optional[float] = None
    if last_at_dt is not None:
        # ``now_dt`` is guaranteed aware by the normalization at the
        # top of this function. Records on disk are also aware, but
        # be defensive against a parser regression that ever produced
        # a naive datetime.
        if last_at_dt.tzinfo is None:
            last_at_dt = last_at_dt.replace(tzinfo=now_dt.tzinfo)
        time_since_last = max(
            0.0, (now_dt - last_at_dt).total_seconds()
        )

    return CapacitySummary(
        provider=provider,
        signal_file_present=present,
        last_completion_at=last_at_str,
        time_since_last_seconds=time_since_last,
        completions_in_window=completions_in_window,
        tokens_in_window=tokens_in_window,
        lookback_minutes=lookback_minutes,
    )


__all__ = [
    "CAPACITY_SIGNAL_FILENAME",
    "DEFAULT_LOOKBACK_MINUTES",
    "CapacitySummary",
    "read_capacity_summary",
    "write_capacity_signal",
]
