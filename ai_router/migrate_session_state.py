"""Bulk migrator: rewrite v2 ``session-state.json`` files into v3 shape.

Set 030 Session 4 deliverable. Two consumers will call into this
module:

1. The CLI ``python -m ai_router.migrate_session_state`` (this module's
   ``main()``). Bulk-walks ``docs/session-sets/*/session-state.json``
   under a scan root and migrates each in place (or dry-runs).
2. The VS Code extension's in-extension lazy migrator (Session 5 work).
   It will subprocess into this module per-set so both call paths share
   the same migration logic. ``migrate_one_set`` is the shared entry
   point.

Migration semantics
-------------------

The migrator is *inferential*, not strict. ``progress.synthesize_v3_from_v2``
is intentionally conservative — it defaults every session to
``not-started`` unless ``completedSessions[]`` lists the number — because
its job is to surface contradictions in v2 snapshots (per memory
``feedback_default_not_started_evidence_to_escalate``). The migrator's
job is different: it operates on *already-existing* v2 files where the
operator has already decided the set's semantics, and it has access to
stronger combined signals:

- ``status: "complete"`` **plus** ``lifecycleState: "closed"`` means the
  set is force-closed. Every session is complete (regardless of whether
  ``completedSessions[]`` was kept up to date — sets 007, 008, 011, 014
  etc. are closed without the array present).
- ``status: "complete"`` **plus** ``currentSession >= totalSessions``
  means the set ran to its planned end. Treat the same as force-closed.
- Otherwise: ``completedSessions[]`` is the authoritative count and we
  trust it. The single ``in-progress`` session (if any) is
  ``currentSession`` when the top-level status is ``in-progress`` and
  the number is not already in ``completedSessions[]``.

Dual-write per spec D5: the migrator writes BOTH the v3 ``sessions[]``
array AND the legacy triple (``currentSession`` / ``totalSessions`` /
``completedSessions``) derived from it. Set 030 does not drop legacy
emission. A future set may flip "stop writing legacy" once v3 readers
are confirmed across all three consumer repos.

Strategy values
---------------

- ``"regex"`` (default for the CLI). Use ``spec.md`` regex extraction
  for titles, falling back to ``"Session N"`` for headings that don't
  parse. Zero router cost. Deterministic.
- ``"generic"``. Use ``"Session N"`` labels even when regex would work.
  Useful for sets with intentionally malformed/missing specs where the
  operator wants neutral labels.
- ``"ai"``. Routes through ``ai_router.route()`` with
  ``task_type='spec-title-extraction'``. **Not implemented in Session 4
  (spec D7 / D14):** raises ``NotImplementedError`` pointing at the
  Session 5 wiring task. Reserved as a flag so consumer repos can
  start scripting against the strategy contract today.
- ``"interactive"`` (CLI-only). Prompts the operator at each set with
  a one-keystroke choice between regex, generic, and skip. Falls back
  to ``"regex"`` if stdin is not a TTY.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional, Tuple

try:
    from progress import (  # type: ignore[import-not-found]
        SCHEMA_VERSION_V3,
        SESSION_STATUS_COMPLETE,
        SESSION_STATUS_IN_PROGRESS,
        SESSION_STATUS_NOT_STARTED,
        LIFECYCLE_STATE_CLOSED,
        LIFECYCLE_STATE_WORK_IN_PROGRESS,
        SessionRecord,
        SessionStateInvariantError,
        canonicalize_status,
        extract_session_titles_from_spec,
        validate_invariants,
    )
except ImportError:
    from .progress import (  # type: ignore[no-redef]
        SCHEMA_VERSION_V3,
        SESSION_STATUS_COMPLETE,
        SESSION_STATUS_IN_PROGRESS,
        SESSION_STATUS_NOT_STARTED,
        LIFECYCLE_STATE_CLOSED,
        LIFECYCLE_STATE_WORK_IN_PROGRESS,
        SessionRecord,
        SessionStateInvariantError,
        canonicalize_status,
        extract_session_titles_from_spec,
        validate_invariants,
    )


SESSION_STATE_FILENAME = "session-state.json"
CANCELLED_MARKER_FILENAME = "CANCELLED.md"

STRATEGY_REGEX = "regex"
STRATEGY_GENERIC = "generic"
STRATEGY_AI = "ai"
STRATEGY_INTERACTIVE = "interactive"

STRATEGIES = (STRATEGY_REGEX, STRATEGY_GENERIC, STRATEGY_AI, STRATEGY_INTERACTIVE)

ACTION_MIGRATED = "migrated"
ACTION_SKIPPED_V3 = "skipped-v3"
ACTION_SKIPPED_NO_STATE = "skipped-no-state"
ACTION_SKIPPED_MALFORMED = "skipped-malformed"
ACTION_SKIPPED_OPERATOR = "skipped-operator"
ACTION_WOULD_VIOLATE = "would-violate"


@dataclass(frozen=True)
class MigrationResult:
    """Outcome of attempting to migrate one set."""

    set_dir: str
    action: str
    reason: str = ""
    before: Optional[dict] = None
    after: Optional[dict] = None
    error: Optional[str] = None

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
        }


def _strict_positive_int(v) -> bool:
    """Reject bool / float / str even when ``isinstance(x, int)`` is True."""
    return type(v) is int and v > 0


def _strip_legacy_completed(raw, total: int) -> List[int]:
    """Filter a legacy ``completedSessions`` value to in-range positive ints."""
    if not isinstance(raw, list):
        return []
    out: List[int] = []
    seen: set = set()
    for n in raw:
        if _strict_positive_int(n) and 1 <= n <= total and n not in seen:
            out.append(n)
            seen.add(n)
    out.sort()
    return out


def _resolve_total(state: dict, spec_titles: dict) -> int:
    """Pick the v3 ``totalSessions`` from the strongest available signal."""
    total_raw = state.get("totalSessions")
    candidates: List[int] = []
    if _strict_positive_int(total_raw):
        candidates.append(total_raw)
    if spec_titles:
        candidates.append(max(spec_titles.keys()))
    current_raw = state.get("currentSession")
    if _strict_positive_int(current_raw):
        candidates.append(current_raw)
    completed_raw = state.get("completedSessions") or []
    if isinstance(completed_raw, list):
        for n in completed_raw:
            if _strict_positive_int(n):
                candidates.append(n)
    return max(candidates) if candidates else 0


def _resolve_lifecycle_state(top_status: str, raw: Optional[str]) -> Optional[str]:
    """Normalize ``lifecycleState`` against the canonical top-level status.

    Conservative: keeps any non-empty value the operator wrote (after a
    sanity check against the top-level status). Only fills in obvious
    blanks — ``status: in-progress`` with ``lifecycleState: null`` gets
    ``"work_in_progress"``; ``status: complete`` with
    ``lifecycleState: null`` gets ``"closed"``.
    """
    if top_status == SESSION_STATUS_COMPLETE:
        return LIFECYCLE_STATE_CLOSED
    if top_status == "cancelled":
        # Cancelled sets are first-class top-level state but the
        # lifecycleState convention is ``closed`` (the marker file is
        # the operator-visible signal; rule 8 binds the field). Keep
        # whatever the operator wrote, defaulting to closed.
        return raw if isinstance(raw, str) and raw else LIFECYCLE_STATE_CLOSED
    if top_status == SESSION_STATUS_IN_PROGRESS:
        return raw if isinstance(raw, str) and raw else LIFECYCLE_STATE_WORK_IN_PROGRESS
    # not-started: keep the operator's explicit value (often ``null``)
    return raw


def _build_v3_sessions(
    state: dict,
    spec_titles: dict,
    *,
    total: int,
    use_generic_titles: bool,
) -> List[dict]:
    """Return the v3 ``sessions[]`` array derived from a v2 ``state`` dict.

    Inferential rules (see module docstring): force-promote every
    session to ``complete`` when the set is closed (``status: complete``
    plus ``lifecycleState: closed`` OR ``currentSession >= totalSessions``).
    Otherwise trust ``completedSessions[]`` for completion membership and
    promote ``currentSession`` to ``in-progress`` when the top-level
    status is ``in-progress``.
    """
    top_status = canonicalize_status(state.get("status"))
    lifecycle = state.get("lifecycleState")
    current_raw = state.get("currentSession")
    current_int = current_raw if _strict_positive_int(current_raw) else None

    closed_signal = top_status == SESSION_STATUS_COMPLETE and (
        lifecycle == LIFECYCLE_STATE_CLOSED
        or (current_int is not None and current_int >= total)
    )

    completed_legacy = _strip_legacy_completed(state.get("completedSessions"), total)

    if closed_signal:
        completed_set = set(range(1, total + 1))
    else:
        completed_set = set(completed_legacy)

    in_progress_number: Optional[int] = None
    if (
        top_status == SESSION_STATUS_IN_PROGRESS
        and current_int is not None
        and 1 <= current_int <= total
        and current_int not in completed_set
    ):
        in_progress_number = current_int

    sessions: List[dict] = []
    for n in range(1, total + 1):
        if use_generic_titles or n not in spec_titles:
            title = f"Session {n}"
        else:
            title = spec_titles[n]
        if in_progress_number is not None and n == in_progress_number:
            status = SESSION_STATUS_IN_PROGRESS
        elif n in completed_set:
            status = SESSION_STATUS_COMPLETE
        else:
            status = SESSION_STATUS_NOT_STARTED
        sessions.append({"number": n, "title": title, "status": status})
    return sessions


def _derive_legacy_triple(
    sessions: List[dict],
) -> Tuple[Optional[int], int, List[int]]:
    """Return ``(current, total, completed)`` derived from ``sessions[]``."""
    current: Optional[int] = None
    completed: List[int] = []
    for s in sessions:
        if s["status"] == SESSION_STATUS_IN_PROGRESS:
            current = s["number"]
        elif s["status"] == SESSION_STATUS_COMPLETE:
            completed.append(s["number"])
    completed.sort()
    return current, len(sessions), completed


def _migrate_state_dict(
    state: dict,
    spec_md_path: Path,
    *,
    use_generic_titles: bool,
) -> Tuple[dict, List[dict]]:
    """Return ``(migrated_state_dict, sessions_array)``. Pure function.

    Validates the resulting array against the 8 v3 invariants before
    returning. Raises :class:`SessionStateInvariantError` if the
    inference produced an invalid shape — callers translate that into
    an ``ACTION_WOULD_VIOLATE`` result.
    """
    spec_titles = {n: t for n, t in extract_session_titles_from_spec(spec_md_path)}
    total = _resolve_total(state, spec_titles)
    if total < 1:
        raise SessionStateInvariantError(
            1,
            "cannot determine totalSessions: no spec.md headings, no "
            "legacy totalSessions, no completedSessions, no currentSession",
        )

    sessions = _build_v3_sessions(
        state,
        spec_titles,
        total=total,
        use_generic_titles=use_generic_titles,
    )

    top_status_raw = state.get("status")
    top_status = canonicalize_status(top_status_raw)
    lifecycle_state = _resolve_lifecycle_state(top_status or "", state.get("lifecycleState"))

    # Convert to records for validation (the validator API takes records).
    records = [
        SessionRecord(number=s["number"], title=s["title"], status=s["status"])
        for s in sessions
    ]
    validate_invariants(records, top_status=top_status, lifecycle_state=lifecycle_state)

    current, derived_total, completed = _derive_legacy_triple(sessions)

    out = dict(state)
    out["schemaVersion"] = SCHEMA_VERSION_V3
    out["sessions"] = sessions
    if top_status is not None and top_status != top_status_raw:
        out["status"] = top_status
    if lifecycle_state is not None or "lifecycleState" in out:
        out["lifecycleState"] = lifecycle_state
    out["currentSession"] = current
    out["totalSessions"] = derived_total
    out["completedSessions"] = completed
    return out, sessions


def migrate_one_set(
    set_dir: str,
    *,
    strategy: str = STRATEGY_REGEX,
    dry_run: bool = True,
) -> MigrationResult:
    """Migrate one session-set directory's ``session-state.json`` to v3.

    Idempotent: a v3 file is returned as ``ACTION_SKIPPED_V3`` without
    touching disk. A missing or malformed state file is reported with
    a skip action and a human-readable reason.

    Shared with the in-extension lazy migrator (Session 5). The
    extension calls this via Python subprocess from
    ``tools/dabbler-ai-orchestration/src/...``. The contract is: this
    function never raises for a "file isn't there / file is broken"
    case — those become structured result records that the caller can
    surface in the UI.

    The CLI's ``--strategy interactive`` value is resolved upstream
    (in :func:`main`) into either ``regex`` or ``generic`` before
    calling here, so this function only sees the three deterministic
    strategies (``regex``, ``generic``, ``ai``).
    """
    if strategy not in STRATEGIES:
        raise ValueError(
            f"unknown strategy {strategy!r}; expected one of {STRATEGIES}"
        )
    if strategy == STRATEGY_AI:
        raise NotImplementedError(
            "strategy='ai' is wired in Session 5 (per spec D7 / D14). "
            "Use strategy='regex' (default) or strategy='generic' for "
            "Session 4 migrations."
        )
    if strategy == STRATEGY_INTERACTIVE:
        # The CLI resolves interactive into regex/generic before calling
        # in; library callers passing INTERACTIVE directly get the safe
        # default. We could refuse instead, but the extension's lazy
        # migrator (Session 5) will pass a deterministic strategy chosen
        # via the quickpick — and a hypothetical script that copy-pastes
        # the CLI flag verbatim shouldn't crash.
        strategy = STRATEGY_REGEX

    state_path = os.path.join(set_dir, SESSION_STATE_FILENAME)
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
    if schema_version == SCHEMA_VERSION_V3 and isinstance(state.get("sessions"), list):
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_SKIPPED_V3,
            reason="already v3 (sessions[] present)",
            before=state,
            after=state,
        )

    spec_md_path = Path(set_dir) / "spec.md"
    use_generic = strategy == STRATEGY_GENERIC
    try:
        new_state, _sessions = _migrate_state_dict(
            state,
            spec_md_path,
            use_generic_titles=use_generic,
        )
    except SessionStateInvariantError as exc:
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_WOULD_VIOLATE,
            reason=str(exc),
            before=state,
            error=str(exc),
        )
    except (ValueError, TypeError) as exc:
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_SKIPPED_MALFORMED,
            reason=f"unexpected migration error: {exc}",
            before=state,
            error=str(exc),
        )

    if not dry_run:
        _atomic_write_json(state_path, new_state)

    return MigrationResult(
        set_dir=set_dir,
        action=ACTION_MIGRATED,
        reason="v2 → v3 (regex titles)" if not use_generic else "v2 → v3 (generic titles)",
        before=state,
        after=new_state,
    )


def _atomic_write_json(path: str, data: dict) -> None:
    """Write ``data`` to ``path`` via tempfile + os.replace.

    Atomic on POSIX and on Windows for same-volume replaces; the
    migrator never crosses volumes (the temp file is created in the
    same directory as the target).
    """
    directory = os.path.dirname(path) or "."
    tmp_path = os.path.join(directory, f".{os.path.basename(path)}.tmp")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    os.replace(tmp_path, path)


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
    strategy: str = STRATEGY_REGEX,
    dry_run: bool = True,
    set_filter: Optional[Iterable[str]] = None,
) -> List[MigrationResult]:
    """Migrate every session set under ``scan_root``.

    ``set_filter``, if provided, restricts the migration to set-dir
    basenames whose name appears in the iterable — useful for the
    extension's per-set migrate command (Session 5) which passes a
    single set name.
    """
    candidates = discover_session_sets(scan_root)
    if set_filter is not None:
        filter_set = set(set_filter)
        candidates = [p for p in candidates if os.path.basename(p) in filter_set]
    results: List[MigrationResult] = []
    for set_dir in candidates:
        results.append(migrate_one_set(set_dir, strategy=strategy, dry_run=dry_run))
    return results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _default_scan_root() -> str:
    """Best-effort default for ``--scan`` when run from a workspace root."""
    candidate = os.path.join(os.getcwd(), "docs", "session-sets")
    return candidate if os.path.isdir(candidate) else os.getcwd()


def _print_result_line(r: MigrationResult, *, verbose: bool) -> None:
    """One-line summary per result; verbose mode dumps before/after JSON."""
    name = os.path.basename(r.set_dir) or r.set_dir
    if r.action == ACTION_MIGRATED:
        sessions_summary = ""
        if r.after and isinstance(r.after.get("sessions"), list):
            sessions = r.after["sessions"]
            complete = sum(1 for s in sessions if s.get("status") == SESSION_STATUS_COMPLETE)
            in_progress = sum(1 for s in sessions if s.get("status") == SESSION_STATUS_IN_PROGRESS)
            not_started = sum(1 for s in sessions if s.get("status") == SESSION_STATUS_NOT_STARTED)
            sessions_summary = (
                f"  ({complete} complete, {in_progress} in-progress, "
                f"{not_started} not-started)"
            )
        print(f"  [migrated]    {name}{sessions_summary}")
    elif r.action == ACTION_SKIPPED_V3:
        print(f"  [skip:v3]     {name}  (already v3)")
    elif r.action == ACTION_SKIPPED_NO_STATE:
        print(f"  [skip:nostate]{name}  ({r.reason})")
    elif r.action == ACTION_SKIPPED_MALFORMED:
        print(f"  [skip:bad]    {name}  ({r.reason})")
    elif r.action == ACTION_SKIPPED_OPERATOR:
        print(f"  [skip:user]   {name}  ({r.reason})")
    elif r.action == ACTION_WOULD_VIOLATE:
        print(f"  [WOULD-VIOLATE] {name}  ({r.reason})")
    else:
        print(f"  [unknown:{r.action}] {name}  ({r.reason})")

    if verbose and r.action == ACTION_MIGRATED:
        print("    --- before (v2):")
        for line in json.dumps(r.before, indent=2).splitlines():
            print(f"    {line}")
        print("    --- after (v3 dual-write):")
        for line in json.dumps(r.after, indent=2).splitlines():
            print(f"    {line}")


def _interactive_choose_strategy(set_dir: str) -> Optional[str]:
    """Prompt the operator for a per-set strategy. ``None`` means skip.

    Falls back to ``"regex"`` when stdin is not a TTY — keeps the CLI
    scriptable without making ``--strategy interactive`` blow up in CI.
    """
    if not sys.stdin.isatty():
        return STRATEGY_REGEX
    name = os.path.basename(set_dir)
    while True:
        prompt = (
            f"\n  {name}\n"
            "    [r]egex titles (default)  "
            "[g]eneric labels  "
            "[s]kip this set  "
            "[q]uit: "
        )
        sys.stdout.write(prompt)
        sys.stdout.flush()
        try:
            answer = sys.stdin.readline().strip().lower()
        except (EOFError, KeyboardInterrupt):
            return None
        if answer in ("", "r", "regex"):
            return STRATEGY_REGEX
        if answer in ("g", "generic"):
            return STRATEGY_GENERIC
        if answer in ("s", "skip"):
            return None
        if answer in ("q", "quit"):
            sys.stdout.write("    quitting\n")
            sys.exit(0)
        sys.stdout.write(f"    unknown choice {answer!r}; try again\n")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ai_router.migrate_session_state",
        description=(
            "Bulk-migrate session-state.json files from v2 to v3 "
            "(dual-write shape per spec D5). Idempotent: files already "
            "in v3 are skipped. Default mode is dry-run."
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
        help="Write migrated state files. Default is dry-run (no writes).",
    )
    parser.add_argument(
        "--strategy",
        choices=STRATEGIES,
        default=STRATEGY_INTERACTIVE,
        help=(
            "Title-extraction strategy. 'regex' uses spec.md headings "
            "(deterministic, free). 'generic' uses 'Session N' labels. "
            "'ai' is reserved for Session 5 (raises NotImplementedError "
            "in Session 4). 'interactive' (default) prompts per set."
        ),
    )
    parser.add_argument(
        "--only",
        action="append",
        default=[],
        metavar="SET_NAME",
        help=(
            "Restrict migration to one or more session-set directory "
            "basenames (e.g., --only 011-readme-polish). May be repeated."
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
    candidates = discover_session_sets(scan_root)
    if args.only:
        only_set = set(args.only)
        candidates = [p for p in candidates if os.path.basename(p) in only_set]

    if not candidates:
        msg = f"no session sets found under {scan_root!r}"
        if args.json:
            print(json.dumps({
                "scan_root": scan_root,
                "strategy": args.strategy,
                "dry_run": not args.in_place,
                "counts": {
                    "migrated": 0,
                    "skipped_v3": 0,
                    "skipped_no_state": 0,
                    "skipped_malformed": 0,
                    "skipped_operator": 0,
                    "would_violate": 0,
                    "total": 0,
                },
                "results": [],
                "note": msg,
            }))
        else:
            print(msg)
        return 0

    results: List[MigrationResult] = []
    dry_run = not args.in_place

    if not args.json:
        mode = "DRY RUN" if dry_run else "IN-PLACE"
        print(f"\n  Bulk migrator [{mode}] — scan root: {scan_root}")
        print(f"  Strategy: {args.strategy}\n")

    for set_dir in candidates:
        if args.strategy == STRATEGY_INTERACTIVE:
            chosen = _interactive_choose_strategy(set_dir)
            if chosen is None:
                results.append(
                    MigrationResult(
                        set_dir=set_dir,
                        action=ACTION_SKIPPED_OPERATOR,
                        reason="operator chose to skip",
                    )
                )
                if not args.json:
                    _print_result_line(results[-1], verbose=False)
                continue
            r = migrate_one_set(set_dir, strategy=chosen, dry_run=dry_run)
        else:
            r = migrate_one_set(set_dir, strategy=args.strategy, dry_run=dry_run)
        results.append(r)
        if not args.json:
            _print_result_line(r, verbose=args.verbose)

    counts = {
        "migrated": sum(1 for r in results if r.action == ACTION_MIGRATED),
        "skipped_v3": sum(1 for r in results if r.action == ACTION_SKIPPED_V3),
        "skipped_no_state": sum(1 for r in results if r.action == ACTION_SKIPPED_NO_STATE),
        "skipped_malformed": sum(1 for r in results if r.action == ACTION_SKIPPED_MALFORMED),
        "skipped_operator": sum(1 for r in results if r.action == ACTION_SKIPPED_OPERATOR),
        "would_violate": sum(1 for r in results if r.action == ACTION_WOULD_VIOLATE),
        "total": len(results),
    }

    if args.json:
        print(json.dumps(
            {
                "scan_root": scan_root,
                "strategy": args.strategy,
                "dry_run": dry_run,
                "counts": counts,
                "results": [r.to_dict() for r in results],
            },
            indent=2,
        ))
    else:
        print()
        print(
            f"  Summary: {counts['migrated']} migrated, "
            f"{counts['skipped_v3']} already v3, "
            f"{counts['skipped_operator']} skipped by operator, "
            f"{counts['skipped_no_state']} no state file, "
            f"{counts['skipped_malformed']} malformed, "
            f"{counts['would_violate']} would-violate."
        )
        if dry_run and counts["migrated"]:
            print("  (dry run; rerun with --in-place to write changes)")

    # Exit 1 if any set would violate; 0 otherwise. Callers (CI, scripts)
    # see a non-zero exit when an automated migration cannot be completed
    # cleanly. Operator-driven skips don't count as failures.
    return 1 if counts["would_violate"] else 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())


__all__ = [
    "SESSION_STATE_FILENAME",
    "STRATEGY_REGEX",
    "STRATEGY_GENERIC",
    "STRATEGY_AI",
    "STRATEGY_INTERACTIVE",
    "STRATEGIES",
    "ACTION_MIGRATED",
    "ACTION_SKIPPED_V3",
    "ACTION_SKIPPED_NO_STATE",
    "ACTION_SKIPPED_MALFORMED",
    "ACTION_SKIPPED_OPERATOR",
    "ACTION_WOULD_VIOLATE",
    "MigrationResult",
    "migrate_one_set",
    "migrate_all",
    "discover_session_sets",
    "main",
]
