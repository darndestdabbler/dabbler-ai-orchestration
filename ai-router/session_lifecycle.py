"""Cancel/restore lifecycle helpers for session sets.

Mirrors ``tools/dabbler-ai-orchestration/src/utils/cancelLifecycle.ts``
byte-for-byte on the on-disk shape: same filenames, same header, same
ISO-8601-with-timezone timestamp format, same prepend semantics. Either
side may be the writer; the other side reads what the first wrote.

The cancel/restore signal is encoded two ways:

* ``CANCELLED.md`` / ``RESTORED.md`` markdown files in the session-set
  folder. Filename signals the *current* state; body is the same
  accumulated history regardless of which name the file currently uses.
  ``CANCELLED.md`` presence is the highest-precedence state indicator,
  beating ``change-log.md`` and ``activity-log.json``.
* ``session-state.json`` ``status`` field flipped to ``"cancelled"``
  with the prior status captured into ``preCancelStatus`` so a restore
  can return the set to its pre-cancel status. If ``preCancelStatus``
  goes missing (e.g., a manually-edited state file), the restore path
  falls back to file-presence inference — ``change-log.md`` →
  ``"complete"``; ``activity-log.json`` → ``"in-progress"``; neither
  → ``"not-started"`` — same rules as the Set 7 backfill.
"""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime
from typing import Optional


CANCELLED_FILENAME = "CANCELLED.md"
RESTORED_FILENAME = "RESTORED.md"
SESSION_STATE_FILENAME = "session-state.json"

HISTORY_HEADER = "# Cancellation history"


def _now_iso_seconds() -> str:
    """Return the current local time as ISO-8601 with timezone, second precision.

    Format matches ``2026-05-14T11:23:07-04:00``. The TS mirror in
    cancelLifecycle.ts produces the same shape via a hand-rolled
    formatter; the two writers must agree byte-for-byte.
    """
    return datetime.now().astimezone().replace(microsecond=0).isoformat()


def is_cancelled(session_set_dir: str) -> bool:
    """``True`` iff *session_set_dir* currently has a ``CANCELLED.md``.

    Per the spec's detection rules, this signal takes precedence over
    every other state indicator (``change-log.md``, ``activity-log.json``,
    ``session-state.json`` status). Callers in
    ``print_session_set_status`` and the VS Code extension's
    state-detection function consult this first.
    """
    return os.path.isfile(os.path.join(session_set_dir, CANCELLED_FILENAME))


def was_restored(session_set_dir: str) -> bool:
    """``True`` iff *session_set_dir* has ``RESTORED.md`` AND not ``CANCELLED.md``.

    ``RESTORED.md`` is an audit-only artifact: once restored, the set
    falls back to whatever its other files indicate. The
    ``CANCELLED.md``-absent guard keeps a re-cancelled set (which
    renames ``RESTORED.md`` back to ``CANCELLED.md``) from also
    reporting "was restored".
    """
    return os.path.isfile(
        os.path.join(session_set_dir, RESTORED_FILENAME)
    ) and not is_cancelled(session_set_dir)


def _atomic_write_text(path: str, content: str) -> None:
    """Write *content* to *path* via a unique temp file + ``os.replace``.

    Mirrors ``_atomic_write_json`` in session_state.py. The temp file is
    colocated with the destination so ``os.replace`` is a same-filesystem
    rename. Per-call uniqueness via PID + random suffix avoids temp-file
    collisions when two writers (this module + the TS mirror, or two VS
    Code windows on the same workspace) act on the same set
    simultaneously.

    Writes raw bytes via ``open(..., "wb")`` so ``\\n`` is not translated
    to ``\\r\\n`` on Windows. The TS mirror writes utf-8 with explicit
    LF newlines for the same reason.
    """
    directory = os.path.dirname(path) or "."
    base = os.path.basename(path)
    fd, tmp_path = tempfile.mkstemp(
        prefix=f".{base}.",
        suffix=".tmp",
        dir=directory,
    )
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(content.encode("utf-8"))
        os.replace(tmp_path, path)
    except BaseException:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        raise


def _prepend_entry(existing: Optional[str], verb: str, reason: str, when: str) -> str:
    """Build the file body with *verb*'s new entry prepended above prior entries.

    Tolerates malformed prior content (manual edits) by keeping it
    verbatim below the new entry — the spec's risk section calls out
    that "filename presence is what matters" and the prepend logic must
    not break detection.

    Per the spec's prepend formula ``<verb-line>\\n<reason>\\n\\n``, each
    entry self-terminates with the blank-line separator. On a fresh
    file that gives a single trailing blank line after the only entry;
    once subsequent entries are added the same trailing separator
    becomes the inter-entry separator without needing a join step.
    """
    new_entry = f"{verb} on {when}\n{reason}\n\n"
    if existing is None:
        return f"{HISTORY_HEADER}\n\n{new_entry}"
    if existing.startswith(HISTORY_HEADER):
        after_header = existing[len(HISTORY_HEADER):].lstrip("\n")
        return f"{HISTORY_HEADER}\n\n{new_entry}{after_header}"
    # Malformed: prepend a fresh header + new entry; preserve manual
    # edits verbatim below. Detection (filename presence) is unaffected.
    return f"{HISTORY_HEADER}\n\n{new_entry}{existing}"


def _read_session_state(session_set_dir: str) -> Optional[dict]:
    state_path = os.path.join(session_set_dir, SESSION_STATE_FILENAME)
    if not os.path.isfile(state_path):
        return None
    try:
        with open(state_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _write_session_state(session_set_dir: str, state: dict) -> None:
    state_path = os.path.join(session_set_dir, SESSION_STATE_FILENAME)
    _atomic_write_text(state_path, json.dumps(state, indent=2) + "\n")


def _infer_status_from_files(session_set_dir: str) -> str:
    """Inferred status from current file presence — Set 7 backfill rules."""
    if os.path.isfile(os.path.join(session_set_dir, "change-log.md")):
        return "complete"
    if os.path.isfile(os.path.join(session_set_dir, "activity-log.json")):
        return "in-progress"
    return "not-started"


def cancel_session_set(session_set_dir: str, reason: str = "") -> None:
    """Cancel *session_set_dir*.

    1. Rename ``RESTORED.md`` to ``CANCELLED.md`` if present so the
       accumulated history carries forward.
    2. Prepend a ``Cancelled on <iso>\\n<reason>`` entry above prior
       entries.
    3. Update ``session-state.json`` so ``status`` becomes
       ``"cancelled"`` with the prior status captured into
       ``preCancelStatus``. A re-cancel preserves the original
       ``preCancelStatus`` rather than overwriting it with
       ``"cancelled"``, which would lose the original status across
       a restore.

    The empty string is a valid *reason* — operators may dismiss the
    input dialog without typing anything. The prepend logic writes the
    blank reason line so the timestamp pattern stays intact.
    """
    cancelled_path = os.path.join(session_set_dir, CANCELLED_FILENAME)
    restored_path = os.path.join(session_set_dir, RESTORED_FILENAME)

    if os.path.isfile(restored_path) and not os.path.isfile(cancelled_path):
        os.rename(restored_path, cancelled_path)

    if os.path.isfile(cancelled_path):
        with open(cancelled_path, "r", encoding="utf-8") as f:
            existing: Optional[str] = f.read()
    else:
        existing = None

    updated = _prepend_entry(existing, "Cancelled", reason, _now_iso_seconds())
    _atomic_write_text(cancelled_path, updated)

    state = _read_session_state(session_set_dir)
    if state is not None:
        if state.get("status") != "cancelled":
            state["preCancelStatus"] = state.get("status")
        state["status"] = "cancelled"
        _write_session_state(session_set_dir, state)


def restore_session_set(session_set_dir: str, reason: str = "") -> None:
    """Restore *session_set_dir*.

    1. Rename ``CANCELLED.md`` to ``RESTORED.md`` (preserving history).
    2. Prepend a ``Restored on <iso>\\n<reason>`` entry above prior
       entries.
    3. Update ``session-state.json`` so ``status`` is restored from
       ``preCancelStatus`` (then cleared). If ``preCancelStatus`` is
       missing — e.g., a manually-edited state file — fall back to
       file-presence inference (Set 7 backfill rules).

    Raises ``FileNotFoundError`` if ``CANCELLED.md`` does not exist.
    Restoring a never-cancelled set is an operator error, not a no-op.
    """
    cancelled_path = os.path.join(session_set_dir, CANCELLED_FILENAME)
    restored_path = os.path.join(session_set_dir, RESTORED_FILENAME)

    if not os.path.isfile(cancelled_path):
        raise FileNotFoundError(
            f"restore_session_set: {cancelled_path} does not exist; "
            "nothing to restore"
        )

    with open(cancelled_path, "r", encoding="utf-8") as f:
        existing = f.read()

    updated = _prepend_entry(existing, "Restored", reason, _now_iso_seconds())
    # Write the new file under the target name, then unlink the source.
    # A crash mid-sequence leaves both files present (subsequent restore
    # is then a no-op since `is_cancelled` already returns False), and
    # the cancelled detection still wins via filename presence.
    _atomic_write_text(restored_path, updated)
    # Best-effort source removal. A crash between the two operations
    # leaves both files present; the next reader sees CANCELLED.md and
    # therefore reports the set as cancelled (the precedence rule
    # CANCELLED-wins-over-everything keeps the failure mode safe — the
    # operator can re-run restore, which then unlinks the lingering
    # CANCELLED.md and leaves only RESTORED.md as the canonical state).
    try:
        os.remove(cancelled_path)
    except OSError:
        pass

    state = _read_session_state(session_set_dir)
    if state is not None:
        restored = state.get("preCancelStatus")
        if not isinstance(restored, str) or not restored or restored == "cancelled":
            restored = _infer_status_from_files(session_set_dir)
        state["status"] = restored
        state.pop("preCancelStatus", None)
        _write_session_state(session_set_dir, state)
