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
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional

# Set 047 Session 4: cancel / restore writers emit canonical v4
# on-disk shape just like register_session_start /
# _flip_state_to_closed. The shim normalize_to_v4_shape produces a
# v4 read-view that the cancel/restore writers re-trim to the
# canonical v4 on-disk shape (drop derived top-level keys, preserve
# passthroughs). The cancellation lifecycle is otherwise unchanged
# per spec §3.2: top-level ``status: "cancelled"`` token is
# preserved; the readCancellationState Set 035 reader contract is
# unchanged; ``CANCELLED.md`` markdown audit-history artifact
# remains.
try:
    from progress import (  # type: ignore[import-not-found]
        SCHEMA_VERSION_V4,
        SessionStateInvariantError,
        normalize_to_v4_shape,
    )
except ImportError:
    from .progress import (  # type: ignore[no-redef]
        SCHEMA_VERSION_V4,
        SessionStateInvariantError,
        normalize_to_v4_shape,
    )


CANCELLED_FILENAME = "CANCELLED.md"
RESTORED_FILENAME = "RESTORED.md"
SESSION_STATE_FILENAME = "session-state.json"

HISTORY_HEADER = "# Cancellation history"

# Set 047 Session 4: top-level keys dropped from the v4 on-disk
# shape (mirrors session_state._V4_TOP_LEVEL_DROPPED_KEYS and
# migrate_v3_to_v4._V4_TOP_LEVEL_DROPPED_KEYS).
_V4_TOP_LEVEL_DROPPED_KEYS = (
    "lifecycleState",
    "currentSession",
    "totalSessions",
    "completedSessions",
    "startedAt",
    "completedAt",
    "orchestrator",
    "verificationVerdict",
)


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


def _to_v4_on_disk_shape(state: dict, session_set_dir: str) -> dict:
    """Project *state* to the canonical v4 on-disk shape.

    Set 047 Session 4 writer-flip: cancel / restore re-emit the state
    file in v4 shape so the writer surface is uniform across
    register / close / cancel / restore. The shim normalizes any v1
    / v2 / v3 / v4 input to a v4 read-view (sessions[] with per-
    session metadata + derived top-level fields); this helper drops
    the derived top-level fields so the on-disk file matches the v4
    contract per spec §3.1.

    Plan-less carve-out (Set 047 Session 4 verifier Critical 3):
    when the input had no ``sessions[]`` at all (plan-less in-progress
    write), preserve that absence on output — writing
    ``sessions: []`` would convert a "plan unknown" file into a
    "zero-session" file. The top-level ``orchestrator`` /
    ``startedAt`` carve-out keys also ride through cancel/restore so
    the restored set lands on the same plan-less shape it started
    from.

    Falls back to the input dict unchanged if the shim raises on
    malformed input — the cancel/restore lifecycle is best-effort
    and should not block on schema-validation failures (an operator
    cancelling a broken state file is a fair use case).
    """
    spec_md_path = Path(session_set_dir) / "spec.md"
    try:
        normalized = normalize_to_v4_shape(state, spec_md_path)
    except (TypeError, ValueError, SessionStateInvariantError):
        return state
    out: dict = {
        "schemaVersion": SCHEMA_VERSION_V4,
        "sessionSetName": normalized.get("sessionSetName")
        or state.get("sessionSetName")
        or os.path.basename(session_set_dir.rstrip("/\\")),
        "status": normalized.get("status") or state.get("status"),
    }
    # Plan-less carve-out detection: the input file omitted sessions[]
    # entirely AND the synthesizer couldn't produce one. Preserve
    # the absent-key form on output and carry top-level orchestrator
    # / startedAt through as the documented plan-less passthrough.
    input_has_sessions = isinstance(state.get("sessions"), list)
    normalized_sessions = normalized.get("sessions")
    is_planless = (
        not input_has_sessions
        and (not isinstance(normalized_sessions, list) or not normalized_sessions)
    )
    if is_planless:
        for carveout_key in ("orchestrator", "startedAt"):
            if isinstance(state.get(carveout_key), (dict, str)):
                out[carveout_key] = state[carveout_key]
    elif isinstance(normalized_sessions, list):
        out["sessions"] = normalized_sessions
    # Cancellation lifecycle passthroughs that the shim already
    # carries through the normalized read-view. Persist them at the
    # top level so the cancellation reader (Set 035) sees the same
    # shape it has always seen.
    for passthrough_key in ("preCancelStatus", "forceClosed"):
        if passthrough_key in normalized:
            out[passthrough_key] = normalized[passthrough_key]
        elif passthrough_key in state:
            out[passthrough_key] = state[passthrough_key]
    # Defensively strip any derived top-level keys the shim added
    # to its read-view but the on-disk shape drops. The plan-less
    # carve-out keys (orchestrator, startedAt) are RE-ADDED above
    # only when the input was plan-less, so the strip below is a
    # no-op for those keys in that branch.
    for key in _V4_TOP_LEVEL_DROPPED_KEYS:
        if is_planless and key in ("orchestrator", "startedAt"):
            continue
        out.pop(key, None)
    return out


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
        # Set 047 Session 4: emit canonical v4 on-disk shape so a
        # cancel rewrite of a legacy v3 file lands on v4 just like
        # register / close. The shim's normalize promotes the
        # legacy top-level orchestrator / startedAt onto the
        # in-progress / most-recently-completed session before the
        # write trims the derived top-level keys.
        v4_state = _to_v4_on_disk_shape(state, session_set_dir)
        _write_session_state(session_set_dir, v4_state)


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
    # Sequence: write RESTORED.md, then update session-state.json, then
    # unlink CANCELLED.md. CANCELLED.md is the highest-precedence state
    # signal, so it stays in place until everything else is consistent —
    # a crash before the unlink leaves the set looking cancelled (sticky
    # and correct), and the operator can simply re-run restore. The
    # alternative (unlink first, then update JSON) would briefly show
    # the set as restored to the explorer while session-state.json still
    # reported ``status: "cancelled"`` to any other reader.
    _atomic_write_text(restored_path, updated)

    state = _read_session_state(session_set_dir)
    if state is not None:
        restored = state.get("preCancelStatus")
        if not isinstance(restored, str) or not restored or restored == "cancelled":
            restored = _infer_status_from_files(session_set_dir)
        state["status"] = restored
        state.pop("preCancelStatus", None)
        # Set 047 Session 4: emit canonical v4 on-disk shape so a
        # restore rewrite of a legacy v3 file lands on v4 just like
        # the cancel write above.
        v4_state = _to_v4_on_disk_shape(state, session_set_dir)
        _write_session_state(session_set_dir, v4_state)

    # Best-effort source removal as the final step. If this fails (or
    # the process crashes before reaching here), CANCELLED.md lingers
    # and the next reader sees the set as cancelled — the operator
    # re-runs restore, which then unlinks the lingering CANCELLED.md
    # and leaves only RESTORED.md as the canonical state.
    try:
        os.remove(cancelled_path)
    except OSError:
        pass


# ---------------------------------------------------------------------------
# CLI (Set 122 Session 2)
# ---------------------------------------------------------------------------
#
# Why this entry point exists
# ---------------------------
#
# The functions above were reachable only from Python. The extension carried
# its own TypeScript port of them in ``src/utils/cancelLifecycle.ts``, whose
# ``writeSessionState`` opened ``session-state.json`` for writing directly --
# the invariant violation Set 122 exists to remove (spec preamble; operator
# decision 2026-08-13, ``decisions.jsonl``). Deleting that port needs
# somewhere for the extension's Cancel / Restore commands to go, and the
# answer is the same one Set 124 S3 reached for ``verify_type``: spawn the
# router's own entry point rather than keep a second writer. The port already
# existed here in full; only the entry point was missing.
#
# Exit codes (stable -- the extension's launcher branches on them, and they
# match ``ai_router.modules`` so both surfaces read the same way):
#
# * ``0`` -- the operation succeeded.
# * ``2`` -- usage error (argparse).
# * ``3`` -- **refused**: a precondition rejected the call and NOTHING was
#   written (restoring a set that was never cancelled; a missing directory).
# * ``4`` -- **write failure**: the write phase raised. Unlike
#   ``ai_router.modules`` there is no rollback here; cancel/restore are
#   ordered to be re-runnable, so the remedy is always to re-run.


def _lifecycle_payload(command: str, session_set_dir: str, **extra) -> dict:
    payload = {
        "command": command,
        "sessionSetDir": session_set_dir,
        "ok": True,
        "exitCode": 0,
    }
    payload.update(extra)
    return payload


def main(argv: Optional[list] = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(
        prog="ai_router.session_lifecycle",
        description=(
            "Cancel or restore a session set through the sanctioned writer. "
            "Exit 3 = refused (nothing written); exit 4 = write failure "
            "(re-run to finish -- both operations are ordered to be "
            "safely re-runnable)."
        ),
    )
    parser.add_argument("--json", action="store_true", help="Machine-readable JSON output.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    for name, help_text in (
        ("cancel", "Cancel a session set."),
        ("restore", "Restore a cancelled session set."),
    ):
        sub = subparsers.add_parser(name, help=help_text)
        sub.add_argument(
            "--session-set-dir",
            required=True,
            help="Path to the session-set directory.",
        )
        sub.add_argument(
            "--reason",
            default="",
            help="Operator-supplied reason. The empty string is valid.",
        )

    args = parser.parse_args(argv)
    set_dir = os.path.abspath(args.session_set_dir)

    def emit(payload: dict, lines: list) -> int:
        code = payload["exitCode"]
        if args.json:
            print(json.dumps(payload, indent=2))
        else:
            stream = sys.stdout if code == 0 else sys.stderr
            for line in lines:
                print(line, file=stream)
        return code

    def refuse(reason: str) -> int:
        payload = _lifecycle_payload(args.command, set_dir)
        payload.update({"ok": False, "exitCode": 3, "refused": reason})
        return emit(payload, [f"[!] Refused: {reason}", "    Nothing was written."])

    if not os.path.isdir(set_dir):
        return refuse(f"{set_dir} is not a directory.")
    # Checked here rather than left to the writer's FileNotFoundError so a
    # never-cancelled set is a REFUSAL (nothing written) and not a write
    # failure -- the two mean different things to the caller, and only one
    # of them is the operator's mistake.
    if args.command == "restore" and not is_cancelled(set_dir):
        return refuse(
            f"{os.path.basename(set_dir)} is not cancelled; there is nothing to restore."
        )

    try:
        if args.command == "cancel":
            cancel_session_set(set_dir, args.reason)
        else:
            restore_session_set(set_dir, args.reason)
    except Exception as exc:  # noqa: BLE001 -- report, never traceback at a UI boundary
        detail = str(exc) or exc.__class__.__name__
        payload = _lifecycle_payload(args.command, set_dir)
        payload.update({"ok": False, "exitCode": 4, "writeFailed": detail})
        return emit(
            payload,
            [
                f"[!] {args.command} failed: {detail}",
                "    Re-run the command to finish; already-applied steps are skipped.",
            ],
        )

    name = os.path.basename(set_dir)
    verb = "Cancelled" if args.command == "cancel" else "Restored"
    payload = _lifecycle_payload(
        args.command, set_dir, sessionSetName=name, reason=args.reason
    )
    return emit(payload, [f"[x] {verb} {name}."])


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
