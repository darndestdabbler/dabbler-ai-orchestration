"""Deterministic close-out gate checks.

Each public ``check_*`` function returns a ``(passed, remediation)``
tuple. ``passed`` is the boolean verdict; ``remediation`` is a one-line
hint for the human / orchestrator surfaced when the gate rejects.
A passing check returns ``""`` (empty remediation).

The five checks land in this module:

- :func:`check_working_tree_clean` — scoped to the disposition's
  ``files_changed`` allowlist plus a small set of universally-ignored
  patterns. Stricter than blanket ``git status --porcelain`` because
  the close-out gate cares only about whether the *declared* surface
  is clean — stray ``.DS_Store`` or editor swap files are tolerated.
- :func:`check_pushed_to_remote` — distinguishes "configuration error"
  (no upstream, detached HEAD) from "transient block" (push rejected
  by branch protection, non-fast-forward), so the remediation tells
  the operator what kind of fix to apply.
- :func:`check_activity_log_entry` — verifies the session has at least
  one entry in ``activity-log.json``. A session with zero entries
  almost certainly means the orchestrator never called ``log_step``,
  which is itself a workflow violation.
- :func:`check_next_orchestrator_present` — for non-final sessions,
  ensures the disposition's ``next_orchestrator`` is populated and
  passes :func:`session_state.validate_next_orchestrator`. The final
  session of a set legitimately has no next orchestrator.
- :func:`check_change_log_fresh` — for the final session of the set,
  requires ``change-log.md`` to exist and to either (a) have a
  modification time at or after the current session's ``startedAt``
  OR (b) reference the current session number in its body. The double
  predicate handles the "I edited the change log just before
  ``startedAt`` due to clock skew" edge case.

Why a separate module
---------------------
Keeping the predicates here lets ``close_session.py`` stay focused on
flow control (CLI, idempotency, event emission). Each predicate is
independently testable against a fixture without spinning up the full
close-out flow, which is exactly what the spec asks for ("All checks
have unit tests for both pass and at least one failure case").

Git invariants
--------------
``check_pushed_to_remote`` enumerates failure modes deliberately rather
than catch-alling a generic ``git push`` failure: missing upstream,
detached HEAD, non-fast-forward (rebase needed), and protected-branch
rejection each have distinct remediations and are surfaced as such.
The check itself does NOT push — pushing is a side-effect-bearing
operation that the orchestrator owns; the gate only reads state.
"""

from __future__ import annotations

import fnmatch
import json
import os
import re
import subprocess
from datetime import datetime
from typing import List, Optional, Tuple

try:
    from .disposition import Disposition  # type: ignore[import-not-found]
    from .session_state import (  # type: ignore[import-not-found]
        read_session_state,
        validate_next_orchestrator,
    )
except ImportError:
    from disposition import Disposition  # type: ignore[no-redef]
    from session_state import (  # type: ignore[no-redef]
        read_session_state,
        validate_next_orchestrator,
    )


GateOutcome = Tuple[bool, str]


# Patterns ignored by check_working_tree_clean even when they appear as
# untracked or modified entries inside the session set's tree. These are
# editor / OS detritus the close-out gate has no business blocking on.
# Kept small and explicit; expand only when a real fixture demonstrates
# a needed addition.
_WORKING_TREE_IGNORE_PATTERNS = (
    ".DS_Store",
    "*.swp",
    "*~",
    "Thumbs.db",
    "desktop.ini",
    # Close-out machinery's own bookkeeping: the lock is created on
    # acquisition and removed on release; the events ledger is appended
    # to during the close-out itself. Both legitimately appear in a
    # mid-close-out git status. The orchestrator commits
    # session-events.jsonl during the close-out commit; the lock file
    # is gone before the commit lands.
    ".close_session.lock",
    "session-events.jsonl",
)


# ---------------------------------------------------------------------------
# Git helpers
# ---------------------------------------------------------------------------

def _run_git(
    args: List[str], *, cwd: Optional[str] = None,
) -> Tuple[int, str, str]:
    """Run ``git <args>`` and return ``(returncode, stdout, stderr)``.

    Stdout and stderr are decoded as UTF-8 with ``errors="replace"`` so
    a stray byte sequence (e.g., a non-UTF-8 filename Windows emitted)
    does not crash the gate. Trailing whitespace on each stream is
    stripped — every consumer wants the trimmed form.

    A missing ``git`` binary surfaces as a non-zero return with the
    exception text in stderr, mirroring how a normal git failure
    presents. The gates above translate that into a "configuration
    error" remediation.
    """
    cmd = ["git"] + list(args)
    try:
        proc = subprocess.run(
            cmd,
            cwd=cwd,
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except FileNotFoundError as exc:
        return 127, "", f"git not available: {exc}"
    return proc.returncode, proc.stdout.strip(), proc.stderr.strip()


def _repo_root_for(path: str) -> Optional[str]:
    """Return the absolute path of the git repo root containing *path*.

    Returns ``None`` if *path* is not inside a git working tree (or git
    is unavailable). Used by the working-tree and push gates to anchor
    git invocations at the repo root rather than at *path*, since
    ``git status --porcelain -- <path>`` is the right shape but must run
    from within the repo.
    """
    rc, out, _err = _run_git(["rev-parse", "--show-toplevel"], cwd=path)
    if rc != 0 or not out:
        return None
    return os.path.abspath(out)


def _is_ignored_pattern(name: str) -> bool:
    """Return True if *name* (basename) matches a universally-ignored pattern."""
    base = os.path.basename(name)
    for pat in _WORKING_TREE_IGNORE_PATTERNS:
        if fnmatch.fnmatch(base, pat):
            return True
    return False


# ---------------------------------------------------------------------------
# check_working_tree_clean
# ---------------------------------------------------------------------------

def check_working_tree_clean(
    session_set_dir: str,
    disposition: Optional[Disposition],
    *,
    allow_empty_commit: bool = False,
) -> GateOutcome:
    """Verify the session-set tree is clean for the declared file surface.

    Algorithm:
      1. Resolve the repo root that contains *session_set_dir*. If we
         cannot, return a configuration-error failure — close-out can't
         meaningfully verify a working tree we can't query.
      2. Run ``git status --porcelain`` from the repo root. Empty output
         is the trivial pass.
      3. For each non-empty status line, ignore entries whose basenames
         match :data:`_WORKING_TREE_IGNORE_PATTERNS`. The remainder is
         the "blocking" set.
      4. If the disposition declares ``files_changed``, the blocking set
         is reduced to entries whose paths are inside the session-set
         dir or whose paths appear in ``files_changed``. The intent: a
         session set's close-out gate should not block on dirty files in
         an unrelated part of the repo.
      5. Pass iff the resulting blocking set is empty. The remediation
         lists up to the first 5 offending paths so the operator can
         act without re-running ``git status``.

    The ``allow_empty_commit`` flag is accepted for symmetry with
    :func:`close_session.run`; it does not affect this check directly
    (an empty commit is about whether close-out *creates* a commit,
    not about whether the tree is clean), but is kept in the signature
    so future tightening doesn't require a call-site change.
    """
    _ = allow_empty_commit

    repo_root = _repo_root_for(session_set_dir)
    if repo_root is None:
        return (
            False,
            f"not inside a git repository: {session_set_dir}",
        )

    # ``-uall`` expands collapsed untracked directories to individual
    # files, so the path-scoping logic below sees per-file entries
    # rather than a single ``docs/`` umbrella row that would defeat
    # both the in-scope check and the ignore-pattern filter.
    rc, out, err = _run_git(
        ["status", "--porcelain", "-uall"], cwd=repo_root,
    )
    if rc != 0:
        return False, f"git status failed: {err or 'unknown error'}"

    if not out:
        return True, ""

    # Parse porcelain v1 output. Each line is "XY <path>" where X and Y
    # are status codes; for renames the line is "XY <orig> -> <new>".
    # We only need the path(s).
    blocking: List[str] = []
    abs_set_dir = os.path.abspath(session_set_dir)
    declared = set()
    if disposition is not None:
        for p in disposition.files_changed:
            declared.add(os.path.normcase(os.path.normpath(p)))

    for line in out.splitlines():
        if len(line) < 4:
            continue
        path_part = line[3:]
        # Rename arrow: take the destination side (post-rename).
        if " -> " in path_part:
            path_part = path_part.split(" -> ", 1)[1]
        # Strip surrounding quotes git uses for paths with spaces.
        path_part = path_part.strip().strip('"')

        if _is_ignored_pattern(path_part):
            continue

        # Filter by relevance: in-scope when the path is under the
        # session set directory OR explicitly declared in
        # files_changed. Without a disposition we keep everything (the
        # caller is responsible for surfacing — typically the --force
        # path skips this check entirely).
        abs_path = os.path.abspath(os.path.join(repo_root, path_part))
        norm_rel = os.path.normcase(os.path.normpath(path_part))

        in_session_set = (
            abs_path == abs_set_dir
            or abs_path.startswith(abs_set_dir + os.sep)
        )
        in_declared = norm_rel in declared
        if disposition is not None and not (in_session_set or in_declared):
            continue

        blocking.append(path_part)

    if not blocking:
        return True, ""

    preview = ", ".join(blocking[:5])
    suffix = "" if len(blocking) <= 5 else f" (+{len(blocking) - 5} more)"
    return (
        False,
        f"working tree has uncommitted changes in scope: {preview}{suffix}",
    )


# ---------------------------------------------------------------------------
# check_pushed_to_remote
# ---------------------------------------------------------------------------

# Substrings the gate looks for in ``git push --dry-run`` stderr to
# distinguish failure modes. Matching is case-insensitive. Order
# matters: the first matching pattern wins, so the most specific
# diagnosis is listed first.
_PUSH_FAILURE_SIGNALS = (
    ("non-fast-forward", "non-fast-forward; rebase or pull --rebase first"),
    ("rejected", "remote rejected the push (branch protection or non-FF)"),
    ("protected branch", "remote rejected the push (branch protected)"),
    ("denied", "remote denied the push (permissions or branch protection)"),
)


def check_pushed_to_remote(
    session_set_dir: str,
    disposition: Optional[Disposition],
    *,
    allow_empty_commit: bool = False,
) -> GateOutcome:
    """Verify the current branch is pushed (or pushable) to its upstream.

    Failure modes enumerated:

    * Detached HEAD — return configuration-error remediation.
    * Missing upstream — return configuration-error remediation citing
      ``--set-upstream``.
    * Branch tip not present on the remote (``rev-list @{u}..HEAD``
      shows commits) AND a dry-run push reports rejection — surface
      the rejection signal verbatim so the operator sees what the
      remote complained about.
    * Branch tip present and equal to upstream — pass.
    * Branch tip ahead of upstream but no rejection signal on dry-run
      — surface as "needs push" rather than rejection (the operator
      just hasn't run ``git push`` yet).

    The check is read-only: ``git push --dry-run`` does not transmit
    objects to the remote (it negotiates only). We rely on the
    orchestrator to perform the real push; the gate's job is to confirm
    the state will be acceptable when push happens.
    """
    _ = disposition
    _ = allow_empty_commit

    repo_root = _repo_root_for(session_set_dir)
    if repo_root is None:
        return False, f"not inside a git repository: {session_set_dir}"

    # Detached HEAD probe via symbolic-ref. A detached HEAD makes
    # symbolic-ref exit non-zero, so we use that as the signal rather
    # than a string match.
    rc, head_ref, _err = _run_git(
        ["symbolic-ref", "--short", "HEAD"], cwd=repo_root,
    )
    if rc != 0 or not head_ref:
        return (
            False,
            "HEAD is detached; check out a branch before close-out",
        )

    # Upstream presence probe.
    rc, upstream, _err = _run_git(
        ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        cwd=repo_root,
    )
    if rc != 0 or not upstream:
        return (
            False,
            f"branch {head_ref!r} has no upstream; "
            f"run: git push --set-upstream <remote> {head_ref}",
        )

    # Are we ahead of upstream? rev-list @{u}..HEAD counts commits to push.
    rc, rev_out, _err = _run_git(
        ["rev-list", "--count", "@{u}..HEAD"], cwd=repo_root,
    )
    try:
        ahead = int(rev_out) if rc == 0 else 0
    except ValueError:
        ahead = 0

    if ahead == 0:
        return True, ""

    # We're ahead. Try a dry-run push to surface rejection signals
    # without actually transmitting commits.
    rc, _stdout, err_text = _run_git(
        ["push", "--dry-run", "--porcelain"], cwd=repo_root,
    )
    err_lower = err_text.lower()
    for signal, remediation in _PUSH_FAILURE_SIGNALS:
        if signal in err_lower:
            return False, remediation

    if rc != 0:
        # Some other failure mode — surface the stderr verbatim, trimmed.
        snippet = err_text.splitlines()[0] if err_text else "unknown error"
        return False, f"git push --dry-run failed: {snippet}"

    # Dry-run succeeded but we're still ahead → operator simply hasn't pushed.
    return (
        False,
        f"branch {head_ref!r} is {ahead} commit(s) ahead of {upstream}; "
        f"run: git push",
    )


# ---------------------------------------------------------------------------
# check_activity_log_entry
# ---------------------------------------------------------------------------

def _read_activity_log(session_set_dir: str) -> Optional[dict]:
    path = os.path.join(session_set_dir, "activity-log.json")
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def check_activity_log_entry(
    session_set_dir: str,
    disposition: Optional[Disposition],
    *,
    allow_empty_commit: bool = False,
) -> GateOutcome:
    """Verify the current session has at least one entry in activity-log.json.

    The current session number is read from ``session-state.json``
    (authoritative for in-progress sets). A session with zero entries
    is almost always a workflow violation: either the orchestrator
    never called ``log_step`` or the activity log was deleted between
    work and close-out.

    Returns a configuration-error failure when the log file is missing
    or unparseable; both are recoverable but the operator needs to know.
    """
    _ = disposition
    _ = allow_empty_commit

    state = read_session_state(session_set_dir)
    if not state:
        return (
            False,
            "session-state.json missing or unreadable; cannot determine current session",
        )
    current = state.get("currentSession")
    if not isinstance(current, int):
        return (
            False,
            "session-state.json has no currentSession; "
            "register_session_start() likely not called",
        )

    log = _read_activity_log(session_set_dir)
    if log is None:
        return (
            False,
            "activity-log.json missing or unreadable",
        )
    entries = log.get("entries")
    if not isinstance(entries, list):
        return (
            False,
            "activity-log.json has no entries list",
        )

    matching = [
        e for e in entries
        if isinstance(e, dict) and e.get("sessionNumber") == current
    ]
    if not matching:
        return (
            False,
            f"activity-log.json has no entries for session {current}",
        )
    return True, ""


# ---------------------------------------------------------------------------
# check_next_orchestrator_present
# ---------------------------------------------------------------------------

def check_next_orchestrator_present(
    session_set_dir: str,
    disposition: Optional[Disposition],
    *,
    allow_empty_commit: bool = False,
) -> GateOutcome:
    """Verify ``next_orchestrator`` is populated for non-final sessions.

    Logic:

    * Read ``currentSession`` and ``totalSessions`` from session state.
    * If ``currentSession >= totalSessions`` (final session), pass —
      the final session legitimately has no next orchestrator.
    * Otherwise the disposition's ``next_orchestrator`` must be present
      and must pass :func:`validate_next_orchestrator`.

    Without a disposition the check fails with a configuration error
    pointing at the missing artifact. With a disposition but no
    ``next_orchestrator`` field, the failure cites the missing field.
    Sub-field validation errors are joined into the remediation string
    so the operator can see exactly which field is malformed.
    """
    _ = allow_empty_commit

    state = read_session_state(session_set_dir)
    if not state:
        return (
            False,
            "session-state.json missing or unreadable",
        )
    current = state.get("currentSession")
    total = state.get("totalSessions")
    if not isinstance(current, int):
        return False, "session-state.json has no currentSession"
    # totalSessions may legitimately be None during early bootstrapping;
    # treat that as "we don't know" and require next_orchestrator to be
    # safe — close-out without the field is the same failure either way.

    is_final = isinstance(total, int) and total > 0 and current >= total
    if is_final:
        return True, ""

    if disposition is None:
        return (
            False,
            "disposition.json required to verify next_orchestrator",
        )
    if disposition.next_orchestrator is None:
        return (
            False,
            "disposition.next_orchestrator required for non-final session",
        )
    passed, errors = validate_next_orchestrator(disposition.next_orchestrator)
    if not passed:
        joined = "; ".join(errors[:3])
        suffix = "" if len(errors) <= 3 else f" (+{len(errors) - 3} more)"
        return False, f"next_orchestrator invalid: {joined}{suffix}"
    return True, ""


# ---------------------------------------------------------------------------
# check_change_log_fresh
# ---------------------------------------------------------------------------

def _parse_iso_timestamp(value: object) -> Optional[datetime]:
    """Parse an ISO-8601 timestamp into a tz-aware datetime, or None.

    Accepts trailing ``Z`` (UTC) by translating to ``+00:00`` first.
    Returns ``None`` for non-strings, malformed strings, or naive
    datetimes (we want apples-to-apples comparison against ``mtime``,
    which is always tz-aware once we attach the local zone).
    """
    if not isinstance(value, str) or not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        return None
    return dt


def check_change_log_fresh(
    session_set_dir: str,
    disposition: Optional[Disposition],
    *,
    allow_empty_commit: bool = False,
) -> GateOutcome:
    """For the final session of a set, verify ``change-log.md`` is fresh.

    A change log is "fresh" when at least one of the following holds:

    * its filesystem mtime is at or after the current session's
      ``startedAt`` timestamp; OR
    * its content references the current session number (e.g.,
      ``Session 4`` or ``session 4 of``) — covers the edge case where
      a change log was authored slightly before ``startedAt`` due to
      clock skew or pre-stage editing.

    Non-final sessions skip this check (return pass). Missing
    ``change-log.md`` on the final session is a hard fail with a clear
    remediation.
    """
    _ = disposition
    _ = allow_empty_commit

    state = read_session_state(session_set_dir)
    if not state:
        return False, "session-state.json missing or unreadable"
    current = state.get("currentSession")
    total = state.get("totalSessions")
    if not isinstance(current, int):
        return False, "session-state.json has no currentSession"

    is_final = isinstance(total, int) and total > 0 and current >= total
    if not is_final:
        return True, ""

    path = os.path.join(session_set_dir, "change-log.md")
    if not os.path.isfile(path):
        return (
            False,
            "change-log.md missing; final session must author it before close-out",
        )

    started_at = _parse_iso_timestamp(state.get("startedAt"))
    mtime_dt: Optional[datetime] = None
    try:
        mtime_ts = os.path.getmtime(path)
        mtime_dt = datetime.fromtimestamp(mtime_ts).astimezone()
    except OSError:
        mtime_dt = None

    if started_at is not None and mtime_dt is not None and mtime_dt >= started_at:
        return True, ""

    # Content-based freshness: does the file reference the current session?
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
    except OSError as exc:
        return False, f"change-log.md unreadable: {exc}"

    # Match "session N" or "session-N" or "session_N" with N == current.
    session_pattern = re.compile(
        rf"\bsession[\s\-_]*{current}\b",
        re.IGNORECASE,
    )
    if session_pattern.search(content):
        return True, ""

    return (
        False,
        f"change-log.md predates session {current} startedAt and does not "
        f"reference session {current}; refresh before close-out",
    )


# ---------------------------------------------------------------------------
# Registry consumed by close_session._run_gate_checks
# ---------------------------------------------------------------------------

# Order matters: this is the order checks appear in the JSON output's
# ``gate_results`` list. Skeleton ordering is preserved so consumers
# (Set 5 VS Code extension) don't have to re-pin against a new shape.
GATE_CHECKS: Tuple[Tuple[str, "callable"], ...] = (  # type: ignore[name-defined]
    ("working_tree_clean", check_working_tree_clean),
    ("pushed_to_remote", check_pushed_to_remote),
    ("activity_log_entry", check_activity_log_entry),
    ("next_orchestrator_present", check_next_orchestrator_present),
    ("change_log_fresh", check_change_log_fresh),
)
