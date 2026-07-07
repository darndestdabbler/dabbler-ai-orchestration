"""Deterministic close-out gate checks — Full-tier consumers only.

**Who uses this:** Called by ``close_session.run_gate_checks()`` on every
close-out attempt. Six predicates: working-tree-clean, pushed-to-remote,
activity-log-entry, next-orchestrator-present, change-log-fresh, and
verification-integrity (Set 083 — the one gate ``--force`` does NOT
bypass; ``--manual-verify`` is its only sanctioned override).
**See also:** ``close_session.py`` (the gate runner); ``disposition.py``
(the disposition_present synthetic gate).

---

Each public ``check_*`` function returns a ``(passed, remediation)``
tuple. ``passed`` is the boolean verdict; ``remediation`` is a one-line
hint for the human / orchestrator surfaced when the gate rejects.
A passing check returns ``""`` (empty remediation).

The checks land in this module:

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
- :func:`check_verification_integrity` — Set 083: a claimed non-null
  ``verification_verdict`` must be corroborated by real evidence (a
  cross-provider ``session-verification`` metrics row + the raw
  ``sN-verification*.md`` artifact on the ``api`` path; the declared
  zero-budget tier on the ``manual-via-other-engine`` / ``skipped``
  paths), and ``verification_method`` must be a legal token. Hard-blocks
  in both interactive and headless modes; see the function docstring.

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
    from .disposition import (  # type: ignore[import-not-found]
        Disposition,
        RETIRED_VERIFICATION_METHODS,
        VERIFICATION_METHODS,
    )
    from .progress import (  # type: ignore[import-not-found]
        ProgressView,
        SessionStateInvariantError,
        normalize_to_v4_shape,
        read_progress,
    )
    from .session_state import (  # type: ignore[import-not-found]
        read_session_state,
        validate_next_orchestrator,
    )
except ImportError:
    from disposition import (  # type: ignore[no-redef]
        Disposition,
        RETIRED_VERIFICATION_METHODS,
        VERIFICATION_METHODS,
    )
    from progress import (  # type: ignore[no-redef]
        ProgressView,
        SessionStateInvariantError,
        normalize_to_v4_shape,
        read_progress,
    )
    from session_state import (  # type: ignore[no-redef]
        read_session_state,
        validate_next_orchestrator,
    )


GateOutcome = Tuple[bool, str]


# Set 030 Session 3: route every progress read through the v3
# helper. ``read_progress`` branches v2/v3 internally and validates the
# 8 invariants; gates downgrade to a "malformed state" failure rather
# than crashing the close-out flow. ``_session_in_focus`` mirrors the
# v2 "in-flight OR most-recently-closed" semantic so idempotent close
# retries still find the session the gate cares about.
def _read_progress_or_none(
    state: dict,
    session_set_dir: str,
) -> Tuple[Optional[ProgressView], Optional[str]]:
    """Return ``(view, error_remediation)``. Exactly one is non-None."""
    spec_md_path = os.path.join(session_set_dir, "spec.md")
    try:
        return read_progress(state, spec_md_path), None
    except SessionStateInvariantError as exc:
        return None, f"session-state.json fails v3 invariants: {exc}"
    except (TypeError, ValueError) as exc:
        return None, f"session-state.json malformed: {type(exc).__name__}: {exc}"


def _session_in_focus(view: ProgressView) -> Optional[int]:
    """Session number the gate is reasoning about.

    Prefers the in-flight session (v3 ``currentSession``); falls back
    to the most recently closed session so idempotent close-session
    retries (where the writer already flipped the session to complete)
    still find a target. Returns ``None`` for a never-started set.
    """
    if view.current_session is not None:
        return view.current_session
    if view.completed_sessions:
        return max(view.completed_sessions)
    return None


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
    #
    # Set 036 Session 1 renamed the lock from ``.close_session.lock``
    # to ``.lifecycle.lock`` (Q5 — start_session + close_session now
    # share the lock). Both filenames are ignored for one release:
    # legacy state files / mid-migration scenarios may still surface
    # the old name briefly.
    ".lifecycle.lock",
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


def _has_remote(repo_root: str) -> bool:
    """Return True if *repo_root* has at least one git remote configured.

    ``git remote`` lists configured remote names one per line; empty
    output (with a clean exit) means no remote is configured at all.
    Used by :func:`check_pushed_to_remote` to distinguish a
    deliberately remote-less repo (where the local-only marker waives
    the push gate) from a repo that has a remote but a branch the
    operator simply forgot to push.

    Fails conservative: a non-zero ``git remote`` exit is treated as
    "a remote may exist" (return True), so the local-only waiver
    requires an *affirmative* no-remote determination and never fires on
    an ambiguous probe. The waiver makes the gate pass; the failure-mode
    bias must therefore protect against masking a real unpushed state,
    not against a spurious block.
    """
    rc, out, _err = _run_git(["remote"], cwd=repo_root)
    if rc != 0:
        return True
    return bool(out.strip())


# ---------------------------------------------------------------------------
# Local-only marker
# ---------------------------------------------------------------------------

# Repo-level marker that declares a repository deliberately remote-less.
# It sits beside the extension's ``.dabbler/install-method`` marker, works
# on Full and Lightweight tiers alike, and survives window reloads (unlike
# volatile webview state). Only its *presence* matters — the file contents
# are not interpreted. See ``ai_router/docs/close-out.md`` for the
# sanctioned local-only close path.
_LOCAL_ONLY_MARKER = os.path.join(".dabbler", "local-only")


def is_local_only(repo_root: Optional[str]) -> bool:
    """Return True if *repo_root* carries the ``.dabbler/local-only`` marker.

    Pure filesystem check — no git invocation — so it is unit-testable
    against a plain directory without a live git tree. Returns ``False``
    for a falsy *repo_root* (e.g. when the repo root could not be
    resolved) rather than raising, so callers can guard with a single
    boolean expression.
    """
    if not repo_root:
        return False
    return os.path.isfile(os.path.join(repo_root, _LOCAL_ONLY_MARKER))


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

    Local-only repositories
    -----------------------
    A repo that is deliberately remote-less (no git remote, by operator
    decision) carries the ``.dabbler/local-only`` marker (see
    :func:`is_local_only`). When that marker is present **and no remote
    is configured at all**, the missing-upstream case becomes a
    *pass-with-note* rather than a configuration-error failure — the note
    ("local-only repo: push gate waived ...") is surfaced in the passing
    gate's remediation slot so the audit trail records why the gate
    passed without a push. The waiver is gated on ``not _has_remote`` so
    it can **never** mask a real "forgot to push to an existing remote"
    miss: if any remote exists, the marker is ignored and the normal
    missing-upstream / ahead-of-upstream failures apply unchanged. A repo
    without the marker is unchanged in every case.

    Set/clear the marker through the blessed CLI
    (``python -m ai_router.local_only --enable | --disable | --status``),
    which records an audit note inside the marker on enable. The sanctioned
    local-only close path — and how it contrasts with incident-recovery
    ``--force`` — is documented in ``ai_router/docs/close-out.md`` ->
    *Section 6 — The sanctioned local-only close path*.
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
        # Local-only waiver: a deliberately remote-less repo carrying the
        # .dabbler/local-only marker passes-with-note instead of failing
        # on the missing upstream. Gated on "no remote configured" so a
        # repo that DOES have a remote (but an unpushed/untracked branch)
        # still fails — the marker can never mask a real forgot-to-push.
        if is_local_only(repo_root) and not _has_remote(repo_root):
            return (
                True,
                "local-only repo: push gate waived "
                "(.dabbler/local-only marker present, no remote configured)",
            )
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
    view, err = _read_progress_or_none(state, session_set_dir)
    if view is None:
        return False, err  # type: ignore[return-value]
    current = _session_in_focus(view)
    if current is None:
        return (
            False,
            "no session in flight and none closed; "
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
    view, err = _read_progress_or_none(state, session_set_dir)
    if view is None:
        return False, err  # type: ignore[return-value]
    current = _session_in_focus(view)
    if current is None:
        return False, "no session in flight and none closed"

    is_final = view.total_sessions > 0 and current >= view.total_sessions
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
    view, err = _read_progress_or_none(state, session_set_dir)
    if view is None:
        return False, err  # type: ignore[return-value]
    current = _session_in_focus(view)
    if current is None:
        return False, "no session in flight and none closed"

    is_final = view.total_sessions > 0 and current >= view.total_sessions
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
# check_verification_integrity (Set 083)
# ---------------------------------------------------------------------------

# Registry name of the verification-integrity check. close_session uses it
# to (a) bypass the check under --manual-verify (the sanctioned, attested,
# logged override) and (b) still RUN the check under --force (force bypasses
# bookkeeping gates, not evidence — Set 083 makes that contract true for
# verification).
VERIFICATION_INTEGRITY_CHECK_NAME = "verification_integrity"

SESSION_VERIFICATION_TASK_TYPE = "session-verification"


def _project_root_for(session_set_dir: str) -> str:
    """Best-effort project root: git toplevel, else the layout heuristic.

    ``budget.yaml`` and the venv interpreter live at the project root.
    Outside a git tree (unit-test fixtures), fall back to the canonical
    ``<root>/docs/session-sets/<slug>`` layout — three levels up.
    """
    root = _repo_root_for(session_set_dir)
    if root:
        return root
    return os.path.abspath(os.path.join(session_set_dir, "..", "..", ".."))


def _verify_session_command(session_set_dir: str) -> str:
    """The exact sanctioned Step 6 invocation for this set.

    The refusal message teaches: the moment an engine hits the blocked
    path it must learn the one command that produces real evidence.
    """
    interp = (
        ".venv/Scripts/python.exe" if os.name == "nt" else ".venv/bin/python"
    )
    root = _project_root_for(session_set_dir)
    display = session_set_dir
    try:
        display = os.path.relpath(os.path.abspath(session_set_dir), root)
    except ValueError:
        pass
    display = display.replace(os.sep, "/")
    return f"{interp} -m ai_router.verify_session --session-set-dir {display}"


def _set_is_lightweight(session_set_dir: str) -> bool:
    """True when the set runs Lightweight (spec ``tier:`` or env var).

    Lightweight verification is per-set with its own close gates (Set 057
    Q6 / Set 077); this Full-tier gate is inert there. A resolution error
    treats the set as Full — an unreadable spec must not disarm the gate.
    """
    try:
        # runtime_mode is a Set 048 module: bare imports are forbidden
        # (test_production_imports — they silently no-op under
        # pip-install). Relative first; package-absolute fallback for the
        # top-level-module context the test harness imports this file under.
        try:
            from .runtime_mode import (  # type: ignore[import-not-found]
                _env_var_truthy,
                _spec_says_lightweight,
            )
        except ImportError:
            from ai_router.runtime_mode import (  # type: ignore[no-redef]
                _env_var_truthy,
                _spec_says_lightweight,
            )
        from pathlib import Path as _Path

        return _env_var_truthy() or _spec_says_lightweight(
            _Path(session_set_dir)
        )
    except Exception:
        return False


def _claimed_close_verdict(disposition: Disposition) -> Optional[str]:
    """The verdict this close would persist — the claim to corroborate.

    Mirrors ``close_session.resolve_close_verdict`` (explicit field wins;
    ``api``-status-derived fallback; else ``None``) without the stderr
    notes. Kept in lockstep by a parity test
    (``test_verification_integrity_gate.py::TestClaimedVerdictParity``);
    a direct import would be circular (close_session imports this module).
    A null claim is no longer inert: since the Set 083 S3 operator
    decision retired the Set 068 routed-gate SKIP path, a Full-tier
    close with no verdict fails the gate unless the operator-declared
    zero-budget tier covers it (see :func:`check_verification_integrity`).
    """
    explicit = disposition.verification_verdict
    if isinstance(explicit, str) and explicit != "":
        return explicit
    if disposition.verification_method == "api":
        if disposition.status == "completed":
            return "VERIFIED"
        if disposition.status in ("failed", "requires_review"):
            return "ISSUES_FOUND"
    return None


def _metrics_log_path() -> Optional[str]:
    """Resolve ``router-metrics.jsonl`` the way the writer does.

    Env override first (deployment/test seam), then the loaded config's
    resolution (workspace-discovered base dir or the package default).
    ``None`` when nothing resolves — the caller fails closed.
    """
    override = os.environ.get("AI_ROUTER_METRICS_PATH")
    if override:
        return override
    try:
        try:
            from .config import load_config  # type: ignore[import-not-found]
            from .metrics import _log_path  # type: ignore[import-not-found]
        except ImportError:
            from config import load_config  # type: ignore[no-redef]
            from metrics import _log_path  # type: ignore[no-redef]
        return str(_log_path(load_config()))
    except Exception:
        return None


def _models_registry() -> dict:
    """``router-config.yaml``'s ``models:`` map, or ``{}`` when unloadable."""
    try:
        try:
            from .config import load_config  # type: ignore[import-not-found]
        except ImportError:
            from config import load_config  # type: ignore[no-redef]
        models = load_config().get("models")
        return models if isinstance(models, dict) else {}
    except Exception:
        return {}


def _row_provider(row: dict, models: dict) -> Optional[str]:
    """A metrics row's provider, resolved via the model registry ONLY.

    The spec is explicit ("provider resolved via the model registry;
    missing identity fails closed"): the row's own ``provider`` string is
    deliberately NOT trusted — a wrong or hand-edited value there must
    not satisfy the cross-provider check (S2 round-1 verifier finding).
    The row's ``model`` is looked up in the loaded registry by key, then
    by ``model_id``; a row whose model cannot be resolved (or an
    unloadable registry) cannot corroborate anything.
    """
    model = row.get("model")
    if not isinstance(model, str) or not model:
        return None
    entry = models.get(model)
    if isinstance(entry, dict):
        reg_provider = entry.get("provider")
        if isinstance(reg_provider, str) and reg_provider.strip():
            return reg_provider.strip().lower()
    for entry in models.values():
        if isinstance(entry, dict) and entry.get("model_id") == model:
            reg_provider = entry.get("provider")
            if isinstance(reg_provider, str) and reg_provider.strip():
                return reg_provider.strip().lower()
    return None


def _session_verification_providers(
    metrics_path: str,
    set_slug: str,
    session_number: int,
) -> List[Optional[str]]:
    """Providers of every ``session-verification`` row for (set, session).

    Slug matching tolerates the historical path-shaped ``session_set``
    values the same way ``verify_session.round1_verifier_tier`` does
    (trailing path component). Unreadable rows are skipped; an unreadable
    FILE is the caller's fail-closed case (it sees no rows).
    """
    providers: List[Optional[str]] = []
    try:
        with open(metrics_path, "r", encoding="utf-8") as f:
            raw_lines = f.read().splitlines()
    except OSError:
        return providers
    models = _models_registry()
    for line in raw_lines:
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(row, dict):
            continue
        if row.get("task_type") != SESSION_VERIFICATION_TASK_TYPE:
            continue
        if row.get("session_number") != session_number:
            continue
        row_set = str(row.get("session_set") or "")
        row_slug = row_set.replace("\\", "/").rstrip("/").rsplit("/", 1)[-1]
        if row_slug != set_slug:
            continue
        providers.append(_row_provider(row, models))
    return providers


def _read_budget_yaml(project_root: str) -> Tuple[Optional[dict], str]:
    """Return ``(budget_dict, error)``; exactly one side is meaningful.

    Missing file → ``(None, "<path> not found")``. Unparseable → error
    text. Both are fail-closed for the manual/skipped arm: a claimed
    verdict without a readable zero-budget declaration is uncorroborated.
    """
    path = os.path.join(project_root, "ai_router", "budget.yaml")
    if not os.path.isfile(path):
        return None, f"{path} not found"
    try:
        import yaml

        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
    except Exception as exc:
        return None, f"budget.yaml unreadable: {type(exc).__name__}: {exc}"
    if not isinstance(data, dict):
        return None, "budget.yaml does not parse to a mapping"
    return data, ""


def check_verification_method_vocabulary(
    session_set_dir: str,
    disposition: Optional[Disposition],
    *,
    allow_empty_commit: bool = False,
) -> GateOutcome:
    """Layer 1 alone: ``verification_method`` must be a legal token.

    Split out of :func:`check_verification_integrity` (S2 round-2
    verifier finding) so ``--manual-verify`` can bypass the EVIDENCE
    corroboration while the vocabulary rule stays universal — the
    incident's retired ``"manual"`` token fails closed on every path,
    attested or not. Retired/renamed tokens get a naming message; every
    refusal teaches the sanctioned Step 6 command.
    """
    _ = allow_empty_commit
    if disposition is None:
        return True, ""
    method = disposition.verification_method
    if method in VERIFICATION_METHODS:
        return True, ""
    allowed = ", ".join(VERIFICATION_METHODS)
    retired_note = RETIRED_VERIFICATION_METHODS.get(method)
    detail = (
        retired_note
        if retired_note is not None
        else f"unknown token (legal: {allowed})"
    )
    command = _verify_session_command(session_set_dir)
    return (
        False,
        f"disposition.verification_method {method!r} is illegal: "
        f"{detail}. For routed verification run: {command}",
    )


def check_verification_integrity(
    session_set_dir: str,
    disposition: Optional[Disposition],
    *,
    allow_empty_commit: bool = False,
) -> GateOutcome:
    """Refuse a close whose claimed verification verdict is uncorroborated.

    Set 083 S2, from the live 2026-07-06 bypass incident: an orchestrator
    wrote ``verification_method: "manual"`` (not a legal token) plus a
    self-attested ``VERIFIED`` into ``disposition.json`` and the close
    accepted both verbatim, because ``resolve_close_verdict()`` treats the
    disposition as evidence rather than as a claim to corroborate. Two
    deterministic layers, in the D3 writer-discipline spirit (anti-drift,
    not anti-adversary):

    1. **Method vocabulary.** ``verification_method`` must be one of
       :data:`disposition.VERIFICATION_METHODS`; retired/renamed tokens
       (the incident's ``"manual"``; the Set 026 ``"queue"``) fail with a
       message naming the replacement.
    2. **Verdict corroboration.** Per-session cross-provider verification
       is **mandatory** on every Full-tier close (Set 083 S3 operator
       decision, reversing the Set 068 DEMOTE — the routed-gate SKIP
       bypass is retired). Concretely:

       * method ``api`` — the claimed verdict must be non-null and backed
         by a ``session-verification`` row in ``router-metrics.jsonl``
         for this (set, session) whose verifier provider **differs from
         the session's orchestrator provider** (orchestrator from the
         session-state block; missing identity data fails closed — the
         Q6 precedent), plus an ``sN-verification*.md`` artifact at the
         set root.
       * method ``manual-via-other-engine`` / ``skipped`` (with or
         without a verdict) — the project's ``ai_router/budget.yaml``
         must actually declare the zero-budget tier (``threshold_usd:
         0``; a declared ``verification_method`` there must match the
         disposition's). This is the operator-authorized exception, not
         an engine's choice.
       * anything else with a **null** verdict — refused. A close that
         never verified is exactly the lazy path this gate exists to
         block; the refusal names the sanctioned ``verify_session``
         command.

    Scope: Lightweight sets are covered by their own per-set gates.

    Posture: **hard-block in BOTH interactive and headless modes** — the
    policed actor *is* the headless agent, so a soft warning printed to
    the offender's own console is toothless (operator-confirmed deviation
    from the Q6 TTY-block/headless-warn split). ``--manual-verify``
    (attested, logged) is the only sanctioned bypass, and it bypasses
    **layer 2 (evidence corroboration) only** — layer 1's vocabulary rule
    runs on every path via
    :func:`check_verification_method_vocabulary` (S2 round-2 finding:
    an attested close must still refuse the incident's illegal token).
    ``--force`` bypasses NEITHER layer. Every refusal names the exact
    sanctioned command so the blocked engine learns the easy path.
    """
    _ = allow_empty_commit

    if disposition is None:
        # Nothing is claimed. Disposition presence is enforced elsewhere
        # (invalid_invocation / disposition_present), and lying by
        # omission is the documented out-of-scope residual.
        return True, ""

    command = _verify_session_command(session_set_dir)
    method = disposition.verification_method

    # Layer 1 — method vocabulary (fail-closed on unknown tokens). This is
    # the close-time enforcement point for validate_disposition's rule 4:
    # the incident's exact disposition dies here. The sub-check is also
    # runnable standalone (check_verification_method_vocabulary) because
    # --manual-verify bypasses ONLY the evidence layers below, never this.
    vocab_passed, vocab_remediation = check_verification_method_vocabulary(
        session_set_dir, disposition,
    )
    if not vocab_passed:
        return False, vocab_remediation

    # Lightweight sets verify per-set through their own close gates
    # (Set 057 Q6 / Set 077); this Full-tier per-session gate is inert.
    if _set_is_lightweight(session_set_dir):
        return True, ""

    # Layer 2 — evidence. Per-session cross-provider verification is
    # MANDATORY on Full tier (Set 083 S3 operator decision; the Set 068
    # routed-gate SKIP path is retired). A null verdict no longer leaves
    # this gate inert: the only paths that do not require corroborated
    # api evidence are the operator-declared zero-budget tier below and
    # the attested --manual-verify override (applied by the caller).
    # (Defensive: with today's vocabulary ``api`` always derives a claim
    # from status and the other two legal methods fall through to the
    # zero-budget arm below — this refusal guards any future method token
    # that derives no claim, so mandatory verification cannot be dodged
    # by a null-verdict close under a new method.)
    claimed = _claimed_close_verdict(disposition)
    if claimed is None and method not in (
        "manual-via-other-engine",
        "skipped",
    ):
        return (
            False,
            f"the close records no verification verdict (method "
            f"{method!r}) — per-session cross-provider verification is "
            "mandatory on Full tier; there is no skip. Run the "
            f"sanctioned Step 6 command: {command}",
        )

    if method == "api":
        state = read_session_state(session_set_dir)
        if not state:
            return (
                False,
                f"claimed verdict {claimed!r} cannot be corroborated: "
                "session-state.json missing or unreadable (fails closed). "
                f"Run the sanctioned Step 6 command: {command}",
            )
        view, err = _read_progress_or_none(state, session_set_dir)
        if view is None:
            return (
                False,
                f"claimed verdict {claimed!r} cannot be corroborated: "
                f"{err} (fails closed)",
            )
        current = _session_in_focus(view)
        if current is None:
            return (
                False,
                f"claimed verdict {claimed!r} cannot be corroborated: no "
                "session in flight and none closed (fails closed)",
            )

        # Evidence artifact: sN-verification*.md at the set root.
        prefix = f"s{current}-verification"
        try:
            artifact_names = [
                name
                for name in os.listdir(session_set_dir)
                if name.startswith(prefix) and name.endswith(".md")
            ]
        except OSError:
            artifact_names = []
        if not artifact_names:
            return (
                False,
                f"claimed verdict {claimed!r} (method api) has no "
                f"s{current}-verification*.md artifact in the session-set "
                f"root. Run the sanctioned Step 6 command: {command}",
            )

        # Orchestrator identity — missing data fails closed (Q6 precedent).
        spec_md_path = os.path.join(session_set_dir, "spec.md")
        try:
            normalized = normalize_to_v4_shape(state, spec_md_path)
        except Exception as exc:
            return (
                False,
                f"claimed verdict {claimed!r} cannot be corroborated: "
                f"session-state.json failed to normalize "
                f"({type(exc).__name__}: {exc}; fails closed)",
            )
        orch_provider: Optional[str] = None
        for entry in normalized.get("sessions") or []:
            if isinstance(entry, dict) and entry.get("number") == current:
                orch = entry.get("orchestrator")
                if isinstance(orch, dict):
                    provider = orch.get("provider")
                    if isinstance(provider, str) and provider.strip():
                        orch_provider = provider.strip().lower()
                break
        if orch_provider is None:
            return (
                False,
                f"claimed verdict {claimed!r} (method api) cannot be "
                f"corroborated: session {current}'s orchestrator block "
                "records no provider, so cross-provider verification "
                "cannot be confirmed (missing identity fails closed). "
                "Re-run start_session with --provider, then verify via: "
                f"{command}",
            )

        metrics_path = _metrics_log_path()
        providers = (
            _session_verification_providers(
                metrics_path, os.path.basename(os.path.abspath(session_set_dir)),
                current,
            )
            if metrics_path
            else []
        )
        if not providers:
            return (
                False,
                f"claimed verdict {claimed!r} (method api) has no "
                "session-verification row in router-metrics.jsonl for "
                f"session {current} of this set — the routed verifier "
                "never ran (or metrics are unreadable; fails closed). "
                f"Run the sanctioned Step 6 command: {command}",
            )
        cross_provider = [
            p for p in providers if p is not None and p != orch_provider
        ]
        if not cross_provider:
            return (
                False,
                f"claimed verdict {claimed!r} (method api) is not "
                "cross-provider: every session-verification row for "
                f"session {current} resolves to the orchestrator's own "
                f"provider ({orch_provider!r}) or to no provider at all "
                "(fails closed). Re-verify via a different provider: "
                f"{command}",
            )
        return True, ""

    # method in ("manual-via-other-engine", "skipped"), with or without
    # a claimed verdict: only legal under the operator-authorized
    # zero-budget tier (Rule 2's exception), which must actually be
    # declared on disk. This is an OPERATOR declaration — an engine
    # cannot unilaterally record "skipped" and walk past verification.
    claim_desc = (
        f"claimed verdict {claimed!r}" if claimed is not None
        else "the no-verdict close"
    )
    budget, budget_err = _read_budget_yaml(_project_root_for(session_set_dir))
    if budget is None:
        return (
            False,
            f"{claim_desc} under method {method!r} requires "
            f"the zero-budget declaration in ai_router/budget.yaml "
            f"({budget_err}; fails closed). Either declare the zero-budget "
            f"tier or run the sanctioned Step 6 command: {command}",
        )
    threshold = budget.get("threshold_usd")
    if threshold != 0:
        return (
            False,
            f"{claim_desc} under method {method!r} is only "
            f"legal on the zero-budget tier, but ai_router/budget.yaml "
            f"declares threshold_usd={threshold!r}. Run the sanctioned "
            f"Step 6 command instead: {command}",
        )
    declared_method = budget.get("verification_method")
    if (
        isinstance(declared_method, str)
        and declared_method
        and declared_method != method
    ):
        return (
            False,
            f"{claim_desc} under method {method!r} does not "
            f"match ai_router/budget.yaml's declared verification_method "
            f"{declared_method!r}. Align the disposition with the budget "
            f"declaration, or run: {command}",
        )
    return True, ""


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
    (VERIFICATION_INTEGRITY_CHECK_NAME, check_verification_integrity),
)
