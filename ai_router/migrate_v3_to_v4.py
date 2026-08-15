"""Bulk migrator: rewrite v3 ``session-state.json`` files into v4 shape.

Set 047 Session 3 deliverable per the audit-locked spec at
``docs/session-sets/047-state-file-schema-v4-audit/spec.md`` (§3.4
migration sequencing). Two consumers call into this module:

1. The CLI ``python -m ai_router.migrate_v3_to_v4`` (this module's
   :func:`main`). Bulk-walks ``docs/session-sets/*/session-state.json``
   under a scan root and migrates each in place (or dry-runs).
2. The VS Code extension's in-extension lazy migrator
   (:mod:`tools/dabbler-ai-orchestration/src/commands/migrateSetV4`).
   The extension does NOT shell out; it carries its own TypeScript
   mirror of :func:`migrate_one_set` in
   ``tools/dabbler-ai-orchestration/src/utils/migrateSessionStateV4.ts``
   so a consumer repo that has not installed ai-router can
   still right-click → "Migrate to v4 schema" without a Python
   dependency. Both implementations MUST stay in lockstep on the on-disk
   v4 shape and the rollback file naming.

Migration semantics
-------------------

The migrator is a thin wrapper around :func:`progress.normalize_to_v4_shape`
(Set 047 Session 2). The shim already does the heavy lifting — promoting
top-level v3 metadata (``orchestrator`` / ``startedAt`` / ``completedAt``
/ ``verificationVerdict``) onto the per-session ``sessions[]`` entries
and deriving the top-level fields from the ledger. The migrator's job
is to take that read-view dict, STRIP the derived top-level fields
(which v4 readers re-derive at read time), and write the resulting
trimmed object to disk.

On-disk v4 shape (per spec §3.1):

  - Preserved at top level: ``schemaVersion: 4``, ``sessionSetName``,
    ``sessions[]`` (with per-session metadata), ``status``.
  - Preserved as passthrough: ``preCancelStatus``, ``forceClosed``
    (opaque to the schema; the cancellation lifecycle and the FORCED
    badge still consume them).
  - Dropped: ``lifecycleState`` (sub-states move to the events
    ledger), ``currentSession``, ``totalSessions``,
    ``completedSessions``, ``startedAt``, ``completedAt``,
    ``orchestrator``, ``verificationVerdict``.

Idempotence + safety
--------------------

- A file already at ``schemaVersion >= 4`` returns
  :data:`ACTION_SKIPPED_V4` without touching disk.
- A file at ``schemaVersion < 3`` (v1/v2) returns
  :data:`ACTION_SKIPPED_NOT_V3` — operator must run
  ``python -m ai_router.migrate_session_state`` first to land on v3.
- A file at ``schemaVersion == 3`` but with no ``sessions[]`` returns
  :data:`ACTION_SKIPPED_MALFORMED` (broken v3, not a downgrade
  candidate; hand-repair or restore from git).
- On apply mode, the original v3 file is renamed
  ``session-state.v3.bak.json`` BEFORE the new v4 file is written.
  This means a crash partway through the write leaves the operator
  with the .bak — the rollback procedure at
  ``docs/v3-to-v4-rollback-procedure.md`` is one ``mv`` away from
  fully restoring state. Per-set; one .bak per set.

The migrator NEVER raises for "file isn't there / file is broken"
cases — those come back as structured :class:`MigrationResult`
records so the CLI and the extension can render kind-specific
messages.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional

try:
    from progress import (  # type: ignore[import-not-found]
        SCHEMA_VERSION_V3,
        SCHEMA_VERSION_V4,
        SessionStateInvariantError,
        canonicalize_status,
        get_progress,
        normalize_to_v4_shape,
    )
except ImportError:
    from .progress import (  # type: ignore[no-redef]
        SCHEMA_VERSION_V3,
        SCHEMA_VERSION_V4,
        SessionStateInvariantError,
        canonicalize_status,
        get_progress,
        normalize_to_v4_shape,
    )


SESSION_STATE_FILENAME = "session-state.json"
BACKUP_FILENAME = "session-state.v3.bak.json"
SWEEP_BACKUP_FILENAME = "session-state.pre-049-sweep.bak.json"

ACTION_MIGRATED = "migrated"
ACTION_SWEPT_ORCHESTRATOR = "swept-orchestrator"
ACTION_SKIPPED_V4 = "skipped-v4"
ACTION_SKIPPED_NOT_V3 = "skipped-not-v3"
ACTION_SKIPPED_NO_STATE = "skipped-no-state"
ACTION_SKIPPED_MALFORMED = "skipped-malformed"
ACTION_SKIPPED_FUTURE_SCHEMA = "skipped-future-schema"
ACTION_WOULD_VIOLATE = "would-violate"
ACTION_FAILED_BACKUP = "failed-backup"

# Orchestrator-block keys retired by Set 049 (chatSessionId composite
# identity + coordination-layer rip). The sweep+normalize pass strips
# these from every orchestrator block on disk — both the legacy
# top-level `orchestrator` field (pre-v4 files migrated forward) and
# the per-session ledger blocks (v4 shape). On already-clean v4 files
# the sweep is a no-op (idempotent).
_RETIRED_ORCHESTRATOR_KEYS = (
    "chatSessionId",
    "checkedOutAt",
    "lastActivityAt",
)

# Fields the on-disk v4 shape drops from the top level. The normalize
# shim re-derives these at read time from the per-session ledger, so a
# v4 reader sees them transparently — but the on-disk file MUST NOT
# carry them, otherwise an out-of-sync top-level (e.g., hand-edited
# completedSessions[] that no longer matches sessions[]) would create
# the exact ambiguity v4 is supposed to eliminate.
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

# Fields preserved at the top level of the on-disk v4 shape (in
# canonical insertion order — readers don't care, but humans diffing
# JSON do). ``preCancelStatus`` and ``forceClosed`` ride along only
# when present in the source v3 file.
_V4_TOP_LEVEL_PRESERVED_KEYS = (
    "schemaVersion",
    "sessionSetName",
    "status",
    "sessions",
)
_V4_TOP_LEVEL_PASSTHROUGH_KEYS = (
    "preCancelStatus",
    "forceClosed",
)


@dataclass(frozen=True)
class MigrationResult:
    """Outcome of attempting to migrate one set."""

    set_dir: str
    action: str
    reason: str = ""
    before: Optional[dict] = None
    after: Optional[dict] = None
    error: Optional[str] = None
    backup_path: Optional[str] = None

    def is_change(self) -> bool:
        return self.action == ACTION_MIGRATED

    def to_dict(self) -> dict:
        return {
            "set_dir": self.set_dir,
            "action": self.action,
            "reason": self.reason,
            "before": self.before,
            "after": self.after,
            "error": self.error,
            "backup_path": self.backup_path,
        }


def _strip_retired_orchestrator_keys(block: object) -> tuple:
    """Strip Set-049-retired keys from a single orchestrator block.

    Returns ``(new_block, changed)``. *block* may be any value (``None``,
    a dict, or something malformed); only dicts are processed, all
    other inputs round-trip unchanged with ``changed=False``.

    A retired key is "present" if it appears in the dict regardless of
    value (including ``None``), because the on-disk shape must omit
    these keys entirely under the Set 049 omit-null contract.
    """
    if not isinstance(block, dict):
        return block, False
    changed = False
    new_block = {}
    for key, value in block.items():
        if key in _RETIRED_ORCHESTRATOR_KEYS:
            changed = True
            continue
        new_block[key] = value
    return new_block, changed


def _sweep_orchestrator_blocks(state: dict) -> tuple:
    """Strip retired orchestrator-block keys throughout a state file.

    Sweeps the top-level legacy ``orchestrator`` field (where it
    survives in pre-Set-047 files migrated forward) AND every
    per-session ledger entry's ``orchestrator`` block (the v4 shape).
    Returns ``(new_state, changed)``; ``new_state`` is a shallow copy
    when ``changed=True`` and the original reference otherwise.

    Idempotent: re-running on already-clean state returns the input
    unchanged with ``changed=False``.
    """
    changed = False
    new_state = state

    # Sweep top-level legacy orchestrator (pre-v4 shape).
    if isinstance(state.get("orchestrator"), dict):
        swept, top_changed = _strip_retired_orchestrator_keys(state["orchestrator"])
        if top_changed:
            new_state = dict(state)
            new_state["orchestrator"] = swept
            changed = True

    # Sweep per-session ledger orchestrator blocks (v4 shape).
    sessions = state.get("sessions")
    if isinstance(sessions, list):
        new_sessions = []
        sessions_changed = False
        for entry in sessions:
            if not isinstance(entry, dict):
                new_sessions.append(entry)
                continue
            orch = entry.get("orchestrator")
            swept, entry_changed = _strip_retired_orchestrator_keys(orch)
            if entry_changed:
                new_entry = dict(entry)
                new_entry["orchestrator"] = swept
                new_sessions.append(new_entry)
                sessions_changed = True
            else:
                new_sessions.append(entry)
        if sessions_changed:
            if new_state is state:
                new_state = dict(state)
            new_state["sessions"] = new_sessions
            changed = True

    return new_state, changed


def build_v4_on_disk_shape(normalized: dict, original: dict) -> dict:
    """Return the on-disk v4 dict given a normalized read-view + original.

    *normalized* is the output of
    :func:`progress.normalize_to_v4_shape` — sessions[] already carries
    the per-session metadata promoted from the v3 top level.
    *original* is the parsed v3 state so we can preserve passthrough
    fields (``preCancelStatus`` / ``forceClosed``) that the shim also
    carries forward.

    Drops every key in :data:`_V4_TOP_LEVEL_DROPPED_KEYS` from the
    output so the on-disk file has no derived-redundant fields. The
    shim re-creates them at read time.
    """
    out: dict = {}
    # Insert preserved top-level keys in canonical order so the
    # written JSON is human-readable and deterministic.
    for key in _V4_TOP_LEVEL_PRESERVED_KEYS:
        if key == "schemaVersion":
            out[key] = SCHEMA_VERSION_V4
        elif key == "status":
            # Canonicalize on the way out — a v3 file with a tolerated
            # alias (``"completed"`` / ``"done"``) is stored as the
            # canonical token in v4.
            out[key] = canonicalize_status(normalized.get("status")) or normalized.get(
                "status"
            )
        elif key == "sessions":
            out[key] = normalized.get("sessions", [])
        else:
            out[key] = normalized.get(key)
    for key in _V4_TOP_LEVEL_PASSTHROUGH_KEYS:
        if key in original:
            out[key] = original[key]
    return out


def migrate_one_set(
    set_dir: str,
    *,
    dry_run: bool = True,
) -> MigrationResult:
    """Migrate one session-set directory's ``session-state.json`` to v4.

    Idempotent: a v4 file (``schemaVersion >= 4``) returns
    :data:`ACTION_SKIPPED_V4` without touching disk. A missing,
    malformed, future-schema, or v1/v2 file is reported with a
    structured skip action and a human-readable reason; this function
    NEVER raises for normal failure cases.

    Apply mode writes ``session-state.v3.bak.json`` alongside the
    target BEFORE writing the new file. If the backup write fails,
    the migration is aborted with :data:`ACTION_FAILED_BACKUP` and
    the original v3 file remains untouched.
    """
    state_path = os.path.join(set_dir, SESSION_STATE_FILENAME)
    backup_path = os.path.join(set_dir, BACKUP_FILENAME)

    if not os.path.isfile(state_path):
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_SKIPPED_NO_STATE,
            reason=f"{SESSION_STATE_FILENAME} not found",
        )

    try:
        with open(state_path, "r", encoding="utf-8") as f:
            state = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_SKIPPED_MALFORMED,
            reason=f"failed to parse: {exc}",
            error=str(exc),
        )

    if not isinstance(state, dict):
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_SKIPPED_MALFORMED,
            reason=f"top-level JSON is {type(state).__name__}, expected object",
        )

    schema_version = state.get("schemaVersion")

    # Future-schema guard: a file at schemaVersion > 4 belongs to a
    # later migrator iteration. Refuse to downgrade.
    if isinstance(schema_version, int) and schema_version > SCHEMA_VERSION_V4:
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_SKIPPED_FUTURE_SCHEMA,
            reason=(
                f"schemaVersion={schema_version} is newer than this migrator "
                f"(v{SCHEMA_VERSION_V4}); refusing to downgrade. Upgrade the "
                "migrator or hand-edit the file."
            ),
            before=state,
        )

    # Already-v4 branch. Set 049 added an orchestrator-block sweep pass
    # that strips three retired keys (``chatSessionId`` / ``checkedOutAt``
    # / ``lastActivityAt``) from any orchestrator block on disk.
    # Pre-Set-049 v4 files migrated to v4 by Set 047 still carry those
    # keys on their per-session orchestrator blocks; the sweep catches
    # them on the next migrator run. On already-clean v4 files the
    # sweep is a no-op and we keep the existing skip semantics.
    if isinstance(schema_version, int) and schema_version >= SCHEMA_VERSION_V4:
        swept_state, swept = _sweep_orchestrator_blocks(state)
        if not swept:
            return MigrationResult(
                set_dir=set_dir,
                action=ACTION_SKIPPED_V4,
                reason=f"already v4 (schemaVersion={schema_version})",
                before=state,
                after=state,
            )

        if dry_run:
            return MigrationResult(
                set_dir=set_dir,
                action=ACTION_SWEPT_ORCHESTRATOR,
                reason=(
                    "v4 → v4 (orchestrator-block sweep: stripping "
                    f"{', '.join(_RETIRED_ORCHESTRATOR_KEYS)}; dry-run, "
                    "no write performed)"
                ),
                before=state,
                after=swept_state,
                backup_path=None,
            )

        # Apply mode: use the Set-049-specific backup filename so the
        # rollback affordance distinguishes a v3→v4 .bak (existing) from
        # a v4-sweep .bak (new).
        sweep_backup_path = os.path.join(set_dir, SWEEP_BACKUP_FILENAME)
        try:
            _atomic_copy_json(state_path, sweep_backup_path)
        except OSError as exc:
            return MigrationResult(
                set_dir=set_dir,
                action=ACTION_FAILED_BACKUP,
                reason=f"could not write backup at {sweep_backup_path}: {exc}",
                before=state,
                error=str(exc),
            )

        try:
            _atomic_write_json(state_path, swept_state)
        except OSError as exc:
            return MigrationResult(
                set_dir=set_dir,
                action=ACTION_FAILED_BACKUP,
                reason=(
                    f"backup written at {sweep_backup_path} but state-file write "
                    f"failed: {exc}. Restore the backup via the rollback "
                    f"procedure at docs/v3-to-v4-rollback-procedure.md."
                ),
                before=state,
                error=str(exc),
                backup_path=sweep_backup_path,
            )

        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_SWEPT_ORCHESTRATOR,
            reason=(
                "v4 → v4 (orchestrator-block sweep: stripped "
                f"{', '.join(_RETIRED_ORCHESTRATOR_KEYS)})"
            ),
            before=state,
            after=swept_state,
            backup_path=sweep_backup_path,
        )

    # Pre-v3 guard: refuse to operate on v1/v2 files. The shim CAN
    # synthesize sessions[] from a v2 snapshot, but writing it out as
    # v4 silently skips the v2→v3 inferential pass that the
    # ``migrate_session_state`` module does (closed-signal force-
    # promotion, lifecycleState normalization). Make the operator run
    # the two migrators in sequence so each step is auditable.
    if not (isinstance(schema_version, int) and schema_version == SCHEMA_VERSION_V3):
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_SKIPPED_NOT_V3,
            reason=(
                f"schemaVersion={schema_version!r} is not v{SCHEMA_VERSION_V3}; "
                "the v3→v4 migrator only operates on v3 input. Run "
                "`python -m ai_router.migrate_session_state --in-place` first "
                "to bring the file to v3, then re-run this command."
            ),
            before=state,
        )

    # Broken v3: schemaVersion=3 but sessions[] is missing or not a
    # list. The shim would synthesize from the v2 path here, which is
    # exactly the wrong move — the file declares itself v3, so the
    # missing sessions[] is corruption, not v2-ness. Mirror the v2→v3
    # migrator's same-shaped guard.
    if not isinstance(state.get("sessions"), list):
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_SKIPPED_MALFORMED,
            reason=(
                "schemaVersion=3 but sessions[] is missing or not a list; "
                "this is a broken v3 file, not a downgrade candidate. "
                "Hand-repair or restore from git, then re-run."
            ),
            before=state,
        )

    spec_md_path = Path(set_dir) / "spec.md"
    try:
        normalized = normalize_to_v4_shape(state, spec_md_path)
    except SessionStateInvariantError as exc:
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_WOULD_VIOLATE,
            reason=str(exc),
            before=state,
            error=str(exc),
        )
    except (TypeError, ValueError) as exc:
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_SKIPPED_MALFORMED,
            reason=f"normalize_to_v4_shape rejected the input: {exc}",
            before=state,
            error=str(exc),
        )

    # The shim builds the v4 read view without enforcing invariants —
    # it's the reader-first contract from S2. The migrator additionally
    # validates the resulting view through ``get_progress`` so a v3
    # file whose status doesn't match its sessions[] (e.g.,
    # status=complete with a not-started session) surfaces as a
    # WOULD_VIOLATE rather than silently rewriting an invalid v4 file.
    try:
        get_progress(normalized)
    except SessionStateInvariantError as exc:
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_WOULD_VIOLATE,
            reason=str(exc),
            before=state,
            error=str(exc),
        )

    new_state = build_v4_on_disk_shape(normalized, state)
    # Set 049 T4: strip retired orchestrator-block keys from the v4
    # output. The v3 input may have carried them on the top-level
    # legacy ``orchestrator`` field (which the shim promotes into
    # per-session entries), so the sweep applies after the v4 shape is
    # assembled. Idempotent for v3 files without the retired keys.
    new_state, _ = _sweep_orchestrator_blocks(new_state)

    if dry_run:
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_MIGRATED,
            reason="v3 → v4 (dry-run; no write performed)",
            before=state,
            after=new_state,
            backup_path=None,
        )

    # Apply path: write the backup first. The backup is the rollback
    # affordance — see ``docs/v3-to-v4-rollback-procedure.md``. If a
    # prior .bak exists from a previous run, overwrite it: the
    # invariant is "the .bak corresponds to the state file immediately
    # before the most-recent migration," and we're about to perform a
    # fresh migration. ``os.replace`` is atomic on POSIX and Windows
    # for same-volume renames.
    try:
        _atomic_copy_json(state_path, backup_path)
    except OSError as exc:
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_FAILED_BACKUP,
            reason=f"could not write backup at {backup_path}: {exc}",
            before=state,
            error=str(exc),
        )

    try:
        _atomic_write_json(state_path, new_state)
    except OSError as exc:
        # Backup is already on disk; the operator can recover by
        # running the rollback procedure. Surface the failure with
        # the .bak path so the operator knows where to restore from.
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_FAILED_BACKUP,
            reason=(
                f"backup written at {backup_path} but state-file write "
                f"failed: {exc}. Restore the backup via the rollback "
                f"procedure at docs/v3-to-v4-rollback-procedure.md."
            ),
            before=state,
            error=str(exc),
            backup_path=backup_path,
        )

    return MigrationResult(
        set_dir=set_dir,
        action=ACTION_MIGRATED,
        reason="v3 → v4",
        before=state,
        after=new_state,
        backup_path=backup_path,
    )


def _atomic_write_json(path: str, data: dict) -> None:
    """Write ``data`` to ``path`` via unique tempfile + os.replace.

    Mirrors the same-named helper in
    :mod:`ai_router.migrate_session_state` — atomic on POSIX and on
    Windows for same-volume replaces; the temp file is created in the
    same directory as the target. ``tempfile.mkstemp`` ensures the
    temp filename is unique per invocation so concurrent migrator
    runs cannot collide.
    """
    directory = os.path.dirname(path) or "."
    basename = os.path.basename(path)
    fd, tmp_path = tempfile.mkstemp(
        prefix=f".{basename}.",
        suffix=".tmp",
        dir=directory,
    )
    os.close(fd)
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.write("\n")
        os.replace(tmp_path, path)
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _atomic_copy_json(src: str, dst: str) -> None:
    """Copy *src* (a JSON file) to *dst* atomically.

    Reads the source's full text, writes it through a unique tempfile
    in the destination's directory, then ``os.replace``s the temp
    over *dst*. Atomic for same-volume renames. Used for the
    .v3.bak.json backup so the on-disk transition is "no .bak → .bak
    written → state file replaced" with no half-written .bak window.

    Reading + rewriting (instead of ``shutil.copyfile``) means the
    .bak gets the same insertion order / formatting as the source
    file as the JSON parser saw it. We re-parse and re-emit
    deliberately so a backup of a hand-edited file (with surprising
    whitespace) normalizes into JSON-with-indent=2 — easier to diff
    against the v4 file later.
    """
    with open(src, "r", encoding="utf-8") as f:
        raw = json.load(f)
    _atomic_write_json(dst, raw)


def discover_session_sets(scan_root: str) -> List[str]:
    """Find candidate session-set directories under ``scan_root``.

    A "candidate" is any directory directly under ``scan_root`` that
    contains a ``session-state.json`` file. The scan root itself is
    typically ``docs/session-sets`` but the CLI accepts any path so
    consumer repos can run the migrator against their own layouts.
    """
    if not os.path.isdir(scan_root):
        return []
    out: List[str] = []
    for name in sorted(os.listdir(scan_root)):
        path = os.path.join(scan_root, name)
        if not os.path.isdir(path):
            continue
        if os.path.isfile(os.path.join(path, SESSION_STATE_FILENAME)):
            out.append(path)
    return out


def migrate_all(
    scan_root: str,
    *,
    dry_run: bool = True,
    set_filter: Optional[Iterable[str]] = None,
) -> List[MigrationResult]:
    """Migrate every session set under ``scan_root``.

    ``set_filter``, if provided, restricts the migration to set-dir
    basenames whose name appears in the iterable — useful for the
    extension's per-set migrate command which passes a single set
    name.
    """
    candidates = discover_session_sets(scan_root)
    if set_filter is not None:
        filter_set = set(set_filter)
        candidates = [p for p in candidates if os.path.basename(p) in filter_set]
    return [migrate_one_set(set_dir, dry_run=dry_run) for set_dir in candidates]


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _default_scan_root() -> str:
    candidate = os.path.join(os.getcwd(), "docs", "session-sets")
    return candidate if os.path.isdir(candidate) else os.getcwd()


def _print_result_line(r: MigrationResult, *, verbose: bool) -> None:
    name = os.path.basename(r.set_dir) or r.set_dir
    if r.action == ACTION_MIGRATED:
        sessions_summary = ""
        if r.after and isinstance(r.after.get("sessions"), list):
            sessions = r.after["sessions"]
            sessions_summary = f"  ({len(sessions)} session(s))"
        print(f"  [migrated]    {name}{sessions_summary}")
    elif r.action == ACTION_SWEPT_ORCHESTRATOR:
        print(f"  [swept]       {name}  ({r.reason})")
    elif r.action == ACTION_SKIPPED_V4:
        print(f"  [skip:v4]     {name}  (already v4)")
    elif r.action == ACTION_SKIPPED_NOT_V3:
        print(f"  [skip:notv3]  {name}  ({r.reason})")
    elif r.action == ACTION_SKIPPED_NO_STATE:
        print(f"  [skip:nostate]{name}  ({r.reason})")
    elif r.action == ACTION_SKIPPED_MALFORMED:
        print(f"  [skip:bad]    {name}  ({r.reason})")
    elif r.action == ACTION_SKIPPED_FUTURE_SCHEMA:
        print(f"  [skip:future] {name}  ({r.reason})")
    elif r.action == ACTION_WOULD_VIOLATE:
        print(f"  [WOULD-VIOLATE] {name}  ({r.reason})")
    elif r.action == ACTION_FAILED_BACKUP:
        # Two subtypes — distinguish by whether a .bak landed:
        #   * backup_path None: the backup write itself failed; the
        #     state file is untouched. Operator fixes the filesystem
        #     condition (permissions/disk) and reruns. No rollback.
        #   * backup_path set: the backup was written, then the
        #     state-file write failed. The state file may be partially
        #     replaced; point at the rollback procedure.
        if r.backup_path:
            print(
                f"  [BACKUP-FAILED:rollback-needed] {name}  ({r.reason})"
            )
        else:
            print(f"  [BACKUP-FAILED:no-bak] {name}  ({r.reason})")
    else:
        print(f"  [unknown:{r.action}] {name}  ({r.reason})")

    if verbose and r.action in (ACTION_MIGRATED, ACTION_SWEPT_ORCHESTRATOR):
        label_before = "before (v3)" if r.action == ACTION_MIGRATED else "before (v4)"
        label_after = "after (v4)"
        print(f"    --- {label_before}:")
        for line in json.dumps(r.before, indent=2).splitlines():
            print(f"    {line}")
        print(f"    --- {label_after}:")
        for line in json.dumps(r.after, indent=2).splitlines():
            print(f"    {line}")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ai_router.migrate_v3_to_v4",
        description=(
            "Bulk-migrate session-state.json files from v3 to v4 "
            "(per-session metadata, dropped derived top-level fields "
            "per Set 047 §3.1). Idempotent: files already v4 are "
            "skipped. v1/v2 files are skipped with instructions to run "
            "the v2→v3 migrator first. Default mode is dry-run; apply "
            "mode writes session-state.v3.bak.json alongside each "
            "migrated file for rollback."
        ),
    )
    parser.add_argument(
        "--scan",
        default=_default_scan_root(),
        help=(
            "Directory under which to find session sets. Default: "
            "./docs/session-sets when present, else the current directory."
        ),
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
        help=(
            "Write migrated state files. Default is dry-run (no writes). "
            "Apply mode writes session-state.v3.bak.json alongside each "
            "migrated file so the rollback procedure at "
            "docs/v3-to-v4-rollback-procedure.md can restore them."
        ),
    )
    parser.add_argument(
        "--only",
        action="append",
        default=[],
        metavar="SET_NAME",
        help=(
            "Restrict migration to one or more session-set directory "
            "basenames (e.g., --only 047-state-file-schema-v4-audit). "
            "May be repeated."
        ),
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Dump before/after JSON for each migrated set.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable JSON results instead of human text.",
    )
    args = parser.parse_args(argv)

    scan_root = args.scan
    dry_run = not args.in_place
    set_filter = args.only or None

    results = migrate_all(scan_root, dry_run=dry_run, set_filter=set_filter)

    if not results and not args.json:
        print(f"\n  No session sets found under {scan_root!r}.")
        if set_filter:
            print(f"  (filter applied: {sorted(set(set_filter))})")
        return 0

    if not args.json:
        mode = "DRY RUN" if dry_run else "IN-PLACE"
        print(f"\n  v3 -> v4 migrator [{mode}] - scan root: {scan_root}\n")
        for r in results:
            _print_result_line(r, verbose=args.verbose)

    counts = {
        "migrated": sum(1 for r in results if r.action == ACTION_MIGRATED),
        "swept_orchestrator": sum(
            1 for r in results if r.action == ACTION_SWEPT_ORCHESTRATOR
        ),
        "skipped_v4": sum(1 for r in results if r.action == ACTION_SKIPPED_V4),
        "skipped_not_v3": sum(1 for r in results if r.action == ACTION_SKIPPED_NOT_V3),
        "skipped_no_state": sum(1 for r in results if r.action == ACTION_SKIPPED_NO_STATE),
        "skipped_malformed": sum(1 for r in results if r.action == ACTION_SKIPPED_MALFORMED),
        "skipped_future_schema": sum(
            1 for r in results if r.action == ACTION_SKIPPED_FUTURE_SCHEMA
        ),
        "would_violate": sum(1 for r in results if r.action == ACTION_WOULD_VIOLATE),
        "failed_backup": sum(1 for r in results if r.action == ACTION_FAILED_BACKUP),
        "total": len(results),
    }

    if args.json:
        print(
            json.dumps(
                {
                    "scan_root": scan_root,
                    "dry_run": dry_run,
                    "counts": counts,
                    "results": [r.to_dict() for r in results],
                },
                indent=2,
            )
        )
    else:
        print()
        print(
            f"  Summary: {counts['migrated']} migrated, "
            f"{counts['swept_orchestrator']} swept (v4-to-v4 orchestrator strip), "
            f"{counts['skipped_v4']} already v4 (clean), "
            f"{counts['skipped_not_v3']} not yet v3 (run v2-to-v3 first), "
            f"{counts['skipped_no_state']} no state file, "
            f"{counts['skipped_malformed']} malformed, "
            f"{counts['would_violate']} would-violate, "
            f"{counts['failed_backup']} backup-failed."
        )
        if dry_run and (counts["migrated"] or counts["swept_orchestrator"]):
            print("  (dry run; rerun with --in-place to write changes)")
        if not dry_run and counts["migrated"]:
            print(
                "  (rollback: see docs/v3-to-v4-rollback-procedure.md -- "
                "rename session-state.v3.bak.json back to session-state.json)"
            )
        if not dry_run and counts["swept_orchestrator"]:
            print(
                "  (sweep rollback: rename session-state.pre-049-sweep.bak.json "
                "back to session-state.json)"
            )

    # Exit 1 if any set would violate invariants OR a backup failed;
    # 0 otherwise. Callers (CI, scripts) see a non-zero exit when an
    # automated migration cannot be completed cleanly.
    return 1 if (counts["would_violate"] or counts["failed_backup"]) else 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())


__all__ = [
    "SESSION_STATE_FILENAME",
    "BACKUP_FILENAME",
    "SWEEP_BACKUP_FILENAME",
    "ACTION_MIGRATED",
    "ACTION_SWEPT_ORCHESTRATOR",
    "ACTION_SKIPPED_V4",
    "ACTION_SKIPPED_NOT_V3",
    "ACTION_SKIPPED_NO_STATE",
    "ACTION_SKIPPED_MALFORMED",
    "ACTION_SKIPPED_FUTURE_SCHEMA",
    "ACTION_WOULD_VIOLATE",
    "ACTION_FAILED_BACKUP",
    "MigrationResult",
    "build_v4_on_disk_shape",
    "migrate_one_set",
    "migrate_all",
    "discover_session_sets",
    "main",
]
