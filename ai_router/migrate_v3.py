"""One-shot v3->v4 corpus migrator: rewrite pre-v4 session-state.json
files into the v4 on-disk write shape, in place.

Usage: python -m ai_router.migrate_v3 <session-sets-root>

The transformation delegates to :func:`progress.normalize_to_v4_shape`
(the read shim) and then keeps only what the v4 write shape carries —
the per-session ledger plus canonical status — dropping the derived
top-level fields readers re-derive at read time. Every result must pass
the v4 write schema AND the reader invariants before anything is
written; a set this tool cannot confidently migrate is skipped with a
warning and stays on its current schema (readers tolerate pre-v4 files
indefinitely, so a skip is safe).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

from .progress import (
    SCHEMA_VERSION_V4,
    SessionStateInvariantError,
    get_progress,
    normalize_to_v4_shape,
)

SCHEMA_PATH = (
    Path(__file__).resolve().parent / "schemas" / "session-state.schema.json"
)

# Coordination-layer keys retired from orchestrator blocks; the v4 write
# shape must omit them even though readers tolerate them on old files.
_RETIRED_ORCHESTRATOR_KEYS = ("chatSessionId", "checkedOutAt", "lastActivityAt")

# Top-level fields the v4 write shape passes through opaquely when the
# source file carries them.
_PASSTHROUGH_KEYS = ("preCancelStatus", "forceClosed", "nextOrchestrator")


class Refused(Exception):
    """The file cannot be confidently migrated; leave it untouched."""


def _swept_orchestrator(block):
    # Orchestrator blocks are omit-null: a null value and a missing key
    # are the same claim, and the write schema only accepts the latter.
    if not isinstance(block, dict):
        return block
    return {
        k: v
        for k, v in block.items()
        if k not in _RETIRED_ORCHESTRATOR_KEYS and v is not None
    }


def build_v4_on_disk_shape(normalized: dict, original: dict) -> dict:
    """The v4 write shape: ledger + canonical status, no derived fields."""
    sessions = []
    for entry in normalized.get("sessions") or []:
        out_entry = dict(entry)
        out_entry["orchestrator"] = _swept_orchestrator(
            out_entry.get("orchestrator")
        )
        title = out_entry.get("title")
        if not (isinstance(title, str) and title.strip()):
            # The read view renders exactly this fallback for a bare title.
            out_entry["title"] = f"Session {out_entry.get('number')}"
        sessions.append(out_entry)
    out = {
        "schemaVersion": SCHEMA_VERSION_V4,
        "sessionSetName": normalized.get("sessionSetName"),
        "status": normalized.get("status"),
        "sessions": sessions,
    }
    for key in _PASSTHROUGH_KEYS:
        if key in original:
            out[key] = original[key]
    return out


def migrate_set(set_dir: Path, validator: Draft202012Validator):
    """Migrate one set's session-state.json in place.

    Returns the written v4 dict, or ``None`` when the file is already
    v4 (not a migration candidate). Raises :class:`Refused` — with the
    file untouched — for anything that cannot be migrated confidently.
    """
    state_path = set_dir / "session-state.json"
    try:
        original = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeError) as exc:
        raise Refused(f"unreadable session-state.json: {exc}")
    if not isinstance(original, dict):
        raise Refused("top-level JSON is not an object")

    version = original.get("schemaVersion")
    if isinstance(version, int) and version >= SCHEMA_VERSION_V4:
        return None
    if not isinstance(version, int):
        raise Refused(f"schemaVersion is {version!r}, expected an integer")

    try:
        normalized = normalize_to_v4_shape(original, set_dir / "spec.md")
        get_progress(normalized)  # reader invariants must hold on the result
    except (SessionStateInvariantError, TypeError, ValueError) as exc:
        raise Refused(str(exc))

    migrated = build_v4_on_disk_shape(normalized, original)
    errors = sorted(validator.iter_errors(migrated), key=lambda e: list(e.path))
    if errors:
        raise Refused(
            "; ".join(
                f"{list(e.path)}: {e.message}" for e in errors[:3]
            )
        )

    state_path.write_text(
        json.dumps(migrated, indent=2) + "\n", encoding="utf-8"
    )
    return migrated


def main(argv=None) -> int:
    args = sys.argv[1:] if argv is None else list(argv)
    if len(args) != 1:
        print(
            "usage: python -m ai_router.migrate_v3 <session-sets-root>",
            file=sys.stderr,
        )
        return 2
    root = Path(args[0])
    if not root.is_dir():
        print(f"not a directory: {root}", file=sys.stderr)
        return 2

    validator = Draft202012Validator(
        json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    )
    migrated_count = skipped_count = 0
    for set_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        if not (set_dir / "session-state.json").is_file():
            continue
        try:
            result = migrate_set(set_dir, validator)
        except Refused as exc:
            skipped_count += 1
            print(f"WARNING: skipped {set_dir.name}: {exc}", file=sys.stderr)
            continue
        if result is None:
            continue
        migrated_count += 1
        sessions = result.get("sessions") or []
        print(
            f"migrated {set_dir.name}: {len(sessions)} session(s), "
            f"status={result['status']}"
        )
    print(f"done: {migrated_count} migrated, {skipped_count} skipped")
    return 1 if skipped_count else 0


if __name__ == "__main__":
    raise SystemExit(main())
