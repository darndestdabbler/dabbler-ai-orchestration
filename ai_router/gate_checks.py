"""Deterministic close-out gate checks — Full-tier consumers only.

**Who uses this:** Called by ``close_session.run_gate_checks()`` on every
close-out attempt. Ten predicates, of which five may refuse a close —
see *Blocking, precondition, advisory* below. ``verification_integrity``
(Set 083) is the one ``--force`` does NOT bypass; ``--manual-verify`` is
its only sanctioned override.
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
- :func:`check_test_run_fresh` — Set 111 S4: every expensive suite whose
  covered surfaces this session touched must have a green run of record
  whose content digest still matches those surfaces. Catches the Set 110
  S3 pattern — closing on a full run that predates the last code change.
- :func:`check_uat_walk_recorded` — Set 111 S4: a ``requiresUAT`` session
  closes only with a recorded walk or an operator-attested waiver, so a
  skipped UAT is a visible decision rather than an evaporation.
- :func:`check_checklist_posted` — Set 114 S1: the step checklist must
  have been posted at each transition the session's own records show.
  Rendering it is what records it, so the gate compares records against
  records and never asks anyone to attest they posted.

Blocking, precondition, advisory (Set 116 S3)
---------------------------------------------
On an ordinary close, every check above runs and prints. What differs is
whether it may **refuse** one, per the operator's 2026-08-10 ruling
(attested in Set 116's ``decisions.jsonl``; the per-gate rationale is in
that set's ``operator-notes.md``). :data:`ADVISORY_CHECKS` is the
authority, and :func:`is_blocking_check` is the one predicate every
caller asks:

- **Gates (blocking).** ``verification_integrity`` — a claimed verdict
  must be corroborated; ``uat_walk_recorded`` — a ``requiresUAT``
  session closes with its walk or an attested waiver; ``test_run_fresh``
  — the expensive suites this session touched have a fresh green run.
  Three checks the operator believes in.
- **Transactional preconditions (blocking, different reason).**
  ``working_tree_clean`` and ``pushed_to_remote`` are not discipline:
  they protect the *write*. A close computed against a dirty surface, or
  an unpushed close, records something that was never true. They block
  because the record would otherwise be wrong, not because anyone should
  want the ceremony.
- **Advisory (warn-not-block).** ``activity_log_entry``,
  ``next_orchestrator_present``, ``change_log_fresh``,
  ``checklist_posted`` and ``verification_method_vocabulary``. The
  signal is kept and the veto is removed. **Nothing was deleted** —
  every advisory check keeps its implementation, its remediation text
  and its tests, so a demotion stays a demotion. A demoted check that
  never surfaces anything worth acting on is a deletion candidate in a
  later set, **on evidence**.

Two qualifications, because the loose readings of the above are wrong in
ways a maintainer would otherwise discover the hard way.

**"Every close" excludes ``--force``.** That path was already narrower
than the gate chain before this ruling: ``close_session.run`` under
``--force`` constructs the ``verification_integrity`` row alone and runs
no other predicate, which is the whole point of the flag (force bypasses
bookkeeping, never evidence). So a forced close prints no advisory
warnings — not because they were demoted, but because they were never
run there. ``--force`` is hard-scoped to incident recovery.

**The vocabulary demotion is narrower than "an illegal token can now
close."** It leaves no close-time enforcement of
:data:`disposition.VERIFICATION_METHODS` — ``validate_disposition``'s
rule 4 is not run at close and this check was its only enforcement
point — but ``verification_method`` also *selects* the corroboration
path, so on an ordinary repo an unknown token still cannot pass
:func:`check_verification_integrity`: it falls through to the
zero-budget arm and is refused there. Exactly two paths let an illegal
token reach ``session-state.json``: an attested ``--manual-verify``
close, and a repo that has declared the zero-budget tier and written the
same non-standard token into ``budget.yaml``.

The education-mode brief that preceded the operator's attestation
described this residual as the *broader* "a corroborated close can
persist an illegal token". That overstated the exposure rather than
understating it, so the attestation covers strictly more than the code
actually does and needs no revisiting; the journal entry is left as
written, because a decision journal records what was said at the time.

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
from typing import FrozenSet, List, Optional, Tuple

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

try:
    from .session_checklist import (  # type: ignore[import-not-found]
        PLAN_STEP_KIND,
        is_logged_step,
    )
except ImportError:  # pragma: no cover - direct-script fallback
    try:
        from session_checklist import (  # type: ignore[no-redef]
            PLAN_STEP_KIND,
            is_logged_step,
        )
    except ImportError:  # pragma: no cover - defensive
        # One spelling of these rules lives in session_checklist; this
        # fallback exists only so an odd import path degrades to the
        # pre-Set-114-S2 behavior rather than taking down every gate in
        # the module.
        PLAN_STEP_KIND = "plan-step"

        def is_logged_step(entry: object) -> bool:  # type: ignore[misc]
            return isinstance(entry, dict) and not str(
                entry.get("kind") or ""
            ).strip()


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
    # Set 117 S1 (operator-authorized 2026-08-10, out of that session's
    # scope but blocking its close). Same class as session-events.jsonl,
    # and it closed a genuine catch-22: `check_checklist_posted`'s own
    # remediation says "post the checklist and re-run close", but rendering
    # the checklist is what RECORDS the post, so following that advice
    # dirties the tree with checklist-posts.jsonl and the very next gate --
    # this one -- refuses the close. The two gates contradicted each other,
    # and the only exits were an extra commit or a waiver.
    #
    # This was not theoretical. `sampleProjectSmoke` ("close_session closes
    # cleanly on the local-only repo") had been red on master: it commits,
    # posts through the shipping CLI, then closes -- which is the documented
    # order -- and failed on exactly this file. The sample project is the
    # NEW-USER path, so the first close a new adopter runs was the one that
    # could not succeed.
    #
    # Loosening a close gate is normally operator-only territory, and this
    # was authorized as such. Note what it does NOT relax: the file is
    # ignored for the tree-clean check only, and the orchestrator still
    # commits it in the close-out commit exactly as it does the events
    # ledger. Falsifier: `test_working_tree_clean_still_blocks_on_real_work`
    # plants an ordinary dirty file and asserts the gate still refuses.
    "checklist-posts.jsonl",
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
# It sits beside the extension's ``.dabbler/install-method`` marker and
# survives window reloads (unlike volatile webview state). Only its
# *presence* matters — the file contents are not interpreted. See
# ``ai_router/docs/close-out.md`` for the sanctioned local-only close path.
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
    extra_ignore_paths: Optional[List[str]] = None,
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

    ``extra_ignore_paths`` (Set 084 S2): paths the close backstop wrote
    mid-close (its raw verification artifacts, the findings envelope,
    the patched ``disposition.json``). Like ``session-events.jsonl``,
    they are close-out machinery bookkeeping that legitimately appears
    dirty during the close itself and is committed in the follow-up
    close-out commit — the caller (``close_session.run``) passes them
    for the one close the backstop just verified, never as standing
    policy.
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
    # Set 084 S2: absolute-path set of backstop-written bookkeeping the
    # gate tolerates for this one close (see the docstring).
    backstop_ignored = {
        os.path.normcase(os.path.abspath(p))
        for p in (extra_ignore_paths or [])
    }

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
        if backstop_ignored and (
            os.path.normcase(
                os.path.abspath(os.path.join(repo_root, path_part))
            )
            in backstop_ignored
        ):
            continue

        # Filter by relevance: in-scope when the path is under the
        # session set directory OR explicitly declared in
        # files_changed. Without a disposition we keep everything (the
        # caller is responsible for surfacing — typically the --force
        # path skips this check entirely).
        abs_path = os.path.abspath(os.path.join(repo_root, path_part))
        norm_rel = os.path.normcase(os.path.normpath(path_part))

        # Windows drive-letter case: git emits an uppercase drive
        # (``C:\...``) while the CLI ``--session-set-dir`` arg may be
        # lowercase (``c:\...``). Compare case-folded (normcase is a
        # no-op on POSIX, which is correctly case-sensitive).
        nc_abs_path = os.path.normcase(abs_path)
        nc_abs_set_dir = os.path.normcase(abs_set_dir)
        in_session_set = (
            nc_abs_path == nc_abs_set_dir
            or nc_abs_path.startswith(nc_abs_set_dir + os.sep)
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

    Set/clear the marker through the sanctioned CLI
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

    **Plan entries do not count, and neither does writer bookkeeping**
    (Set 114 S2). ``start_session`` seeds the session's spec steps as
    ``kind: "plan-step"`` entries, and the ``pathAwareCritique`` /
    ``contractGate`` policy captures write their own ``kind``-bearing
    entries — all at registration, before any work exists. Counting any
    of them would leave a gate that can no longer fail, which is worse
    than no gate because it still reads like coverage. The rule is one
    predicate, :func:`session_checklist.is_logged_step`: an entry with
    no ``kind`` is a step the orchestrator logged; an entry with one is
    a record written *for* the session, not *by* it.

    Set 114 S1 predicted this exact failure when it rejected an
    activity-log entry kind for the post ledger; seeding is
    spec-directed, so the predicted consequence is paid here. Round 1's
    first cut excluded only ``plan-step`` and both discovery lenses
    independently caught the bookkeeping half.

    Returns a configuration-error failure when the log file is missing
    or unparseable; both are recoverable but the operator needs to know.
        **Advisory since Set 116 S3** (operator ruling, 2026-08-10): this
    check still runs and still reports, but it cannot refuse a close.
    The verdict below is unchanged — the demotion lives in
    :data:`ADVISORY_CHECKS`, so re-arming it is one line.
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
        if isinstance(e, dict)
        and e.get("sessionNumber") == current
        and is_logged_step(e)
    ]
    if not matching:
        kinds = sorted(
            {
                str(e.get("kind")).strip()
                for e in entries
                if isinstance(e, dict)
                and e.get("sessionNumber") == current
                and str(e.get("kind") or "").strip()
            }
        )
        if kinds:
            return (
                False,
                f"activity-log.json has no logged step for session "
                f"{current} — only writer bookkeeping "
                f"({', '.join(kinds)}). Those records are written FOR a "
                f"session at registration, not BY it doing work. Log what "
                f"this session did (SessionLog.log_step) before closing.",
            )
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
        **Advisory since Set 116 S3** (operator ruling, 2026-08-10): this
    check still runs and still reports, but it cannot refuse a close.
    The verdict below is unchanged — the demotion lives in
    :data:`ADVISORY_CHECKS`, so re-arming it is one line.
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
    ``change-log.md`` on the final session returns a failing verdict
    with a clear remediation.

    **Advisory since Set 116 S3** (operator ruling, 2026-08-10): this
    check still runs and still reports, but it cannot refuse a close —
    so that failing verdict is a warning at close, not the "hard fail"
    this docstring used to promise. The verdict itself is unchanged; the
    demotion lives in :data:`ADVISORY_CHECKS`, so re-arming it is one
    line. ``_flip_state_to_closed`` no longer keys on ``change-log.md``
    either (Set 116 S3 removed that mirror after it turned this
    demotion into a raised ``SessionStateInvariantError``).
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


def _venv_python() -> str:
    """The workspace-venv interpreter the runbooks tell operators to use.

    One spelling, shared by every remediation message that names a
    command, so a platform fix lands in one place (L-069-1).
    """
    return (
        ".venv/Scripts/python.exe" if os.name == "nt" else ".venv/bin/python"
    )


def _set_dir_display(session_set_dir: str) -> str:
    """*session_set_dir* as a project-relative, posix-separated path."""
    root = _project_root_for(session_set_dir)
    display = session_set_dir
    try:
        display = os.path.relpath(os.path.abspath(session_set_dir), root)
    except ValueError:
        pass
    return display.replace(os.sep, "/")


def _verify_session_command(
    session_set_dir: str, phase: Optional[str] = None
) -> str:
    """The exact sanctioned Step 6 invocation for this set.

    The refusal message teaches: the moment an engine hits the blocked
    path it must learn the one command that produces real evidence.

    Set 119 S3: *phase* appends ``--phase <phase>`` so a refusal can name
    the step it actually means. The backstop's blocking message said
    "re-verify with verify_session" and meant the remediation-review
    cycle, but that phase failed closed with ``EXIT_USAGE`` from exactly
    the state the message was printed in — the message named a command
    that did not work. Naming the phase is only honest now that it does.
    """
    command = (
        f"{_venv_python()} -m ai_router.verify_session "
        f"--session-set-dir {_set_dir_display(session_set_dir)}"
    )
    if phase:
        command += f" --phase {phase}"
    return command


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


def _session_verification_rows(
    metrics_path: str,
    set_slug: str,
    session_number: int,
) -> List[dict]:
    """Every ``session-verification`` row for (set, session), verbatim.

    Slug matching tolerates the historical path-shaped ``session_set``
    values the same way ``verify_session.round1_verifier_tier`` does
    (trailing path component). Unreadable rows are skipped; an unreadable
    FILE is the caller's fail-closed case (it sees no rows).

    Set 084 S2 (F3): rows are returned whole — the caller validates the
    evidence stamp (``verification_stamp.find_valid_stamped_rows``)
    rather than reading a bare provider list, so an unstamped bare
    ``route()`` row can no longer corroborate a close.
    """
    rows: List[dict] = []
    try:
        with open(metrics_path, "r", encoding="utf-8") as f:
            raw_lines = f.read().splitlines()
    except OSError:
        return rows
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
        if os.path.normcase(row_slug) != os.path.normcase(set_slug):
            continue
        rows.append(row)
    return rows


def find_session_verification_evidence(
    session_set_dir: str,
    session_number: int,
    orchestrator_effective_provider: str,
    *,
    notes: Optional[List[str]] = None,
) -> Tuple[List[dict], List[dict], List[str]]:
    """Return ``(all_rows, valid_stamped_rows, rejection_reasons)``.

    The Set 084 F3 evidence resolution, shared by the close gate and the
    ``close_session`` backstop's skip predicate (one path — L-069-1):
    collect every ``session-verification`` row for (set, session), then
    keep only rows whose evidence stamp is present, internally
    consistent, and cross-provider against
    *orchestrator_effective_provider*. A missing/unreadable metrics file
    yields ``([], [], [])`` — the caller's fail-closed case.

    *notes* (Set 128 S2) is the audit sink threaded down to
    ``validate_stamped_row``: the backstop passes one so it can ledger
    an A4.1 test-only exemption, and every other caller omits it.
    """
    metrics_path = _metrics_log_path()
    if not metrics_path:
        return [], [], []
    rows = _session_verification_rows(
        metrics_path,
        os.path.basename(os.path.abspath(session_set_dir)),
        session_number,
    )
    if not rows:
        return [], [], []
    try:
        from .verification_stamp import (  # type: ignore[import-not-found]
            find_valid_stamped_rows,
        )
    except ImportError:
        from verification_stamp import (  # type: ignore[no-redef]
            find_valid_stamped_rows,
        )
    valid, reasons = find_valid_stamped_rows(
        rows,
        session_set_dir=session_set_dir,
        session_number=session_number,
        orchestrator_effective_provider=orchestrator_effective_provider,
        models_registry=_models_registry() or None,
        repo_root=_repo_root_for(session_set_dir),
        notes=notes,
    )
    return rows, valid, reasons


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


def _check_session_ledger_present(session_set_dir: str) -> GateOutcome:
    """Ledger axis of the verification-integrity gate (Set 086 S1).

    A Full-tier close must be corroborated by a real router-written events
    ledger (``session-events.jsonl``, created by ``start_session`` and
    appended by every sanctioned writer). Its **absence** is the one signature a
    fully-simulated session leaves — no canonical writer ever ran — and it is
    exactly the case ``writer_discipline`` historically *skipped*. Here we opt
    into its strict ``require_ledger=True`` mode so an absent or empty ledger
    is a HIGH finding that fails the close loud.

    Orthogonal to the verdict/stamp axis (a hand-forged stamp can look
    corroborated while the ledger is absent), so this runs FIRST and
    short-circuits — one message, the root cause, never two. The one
    inherited guard is ``--manual-verify``, which swaps this whole gate for
    the vocabulary check, so the ledger axis never fires on the sanctioned
    attested no-ledger path. ``--no-router``
    is deliberately NOT consulted: this sub-check only *inspects*, so skipping
    under it would reopen the very bypass being closed (gate-placement
    decision C: docs/session-sets/086.../s1-gate-placement-architecture.json).
    """
    try:
        try:
            from .writer_discipline import (  # type: ignore[import-not-found]
                REASON_LEDGER_ABSENT,
                REASON_LEDGER_EMPTY,
                REASON_LEDGER_UNREADABLE,
                detect_writer_bypass,
                read_session_state as wd_read_state,
            )
        except ImportError:
            from writer_discipline import (  # type: ignore[no-redef]
                REASON_LEDGER_ABSENT,
                REASON_LEDGER_EMPTY,
                REASON_LEDGER_UNREADABLE,
                detect_writer_bypass,
                read_session_state as wd_read_state,
            )
        from pathlib import Path as _Path

        state_file = _Path(session_set_dir) / "session-state.json"
        view = wd_read_state(state_file)
        if view is None:
            # wd_read_state collapses "absent" and "present-but-unreadable"
            # to None. Distinguish them (Round-5 class): a state file that
            # EXISTS but cannot be read/parsed must fail closed — an unreadable
            # snapshot cannot corroborate a router-executed session any more
            # than an unreadable ledger can. A genuinely ABSENT state file is
            # the api-evidence branch's / disposition-present gate's job (they
            # fail closed with a clearer message), so pass it through here.
            if state_file.exists():
                raise OSError(
                    "session-state.json is present but could not be read/parsed"
                )
            return True, ""
        reports = detect_writer_bypass(view, require_ledger=True)
    except Exception as exc:
        # Fail CLOSED (Round-1 finding): this ledger axis is a security gate
        # for the very set that adds it. An import OR a runtime failure of the
        # detector must NOT silently disarm it (that is exactly the fail-open
        # hole this set exists to remove) — block the close with a diagnostic.
        # The whole read+detect path is inside this try so no exception path
        # can convert to a silent pass. The operator can fix the ai_router
        # install, or use the sanctioned --manual-verify (attested) escape.
        return (
            False,
            "verification_integrity ledger check could not run "
            f"({type(exc).__name__}: {exc}); failing closed rather than "
            "skipping the router-ledger evidence check. Fix the ai_router "
            "install, or use --manual-verify for an attested close.",
        )

    # Scope: this gate owns the LEDGER-ABSENCE axis only (the fully-simulated
    # signature). A pure mtime-divergence report is the standalone D3
    # detector's separate concern; wiring divergence-blocking into close would
    # be a far broader behavior change (any legitimate out-of-tolerance write
    # pattern would block) and is out of Set 086's scope. Ignore it here.
    absence = [
        r for r in reports
        if r.reason in (
            REASON_LEDGER_ABSENT, REASON_LEDGER_EMPTY, REASON_LEDGER_UNREADABLE
        )
    ]
    if not absence:
        return True, ""

    reason = absence[0].reason
    command = _verify_session_command(session_set_dir)
    if reason == REASON_LEDGER_ABSENT:
        detail = (
            "no session-events.jsonl ledger exists next to session-state.json"
        )
    elif reason == REASON_LEDGER_EMPTY:
        detail = (
            "session-events.jsonl exists but carries no canonical-writer event"
        )
    else:  # REASON_LEDGER_UNREADABLE
        detail = (
            "the session-state file or session-events.jsonl ledger could not "
            "be read/stat'ed (unreadable, permission-denied, or not a file)"
        )
    return (
        False,
        f"missing verification evidence (severity: HIGH) -- {detail}. A "
        "Full-tier close requires a router-written events ledger (created by "
        "start_session) as proof a real writer executed this session; its "
        "absence means the session was fully simulated or the state file was "
        "hand-authored. Re-run the session through the real (authenticated) "
        f"router so start_session/close_session write the ledger, then verify "
        f"via: {command}. If this is an authorized manual close, re-run "
        "with --manual-verify (attested, logged).",
    )


def check_verification_method_vocabulary(
    session_set_dir: str,
    disposition: Optional[Disposition],
    *,
    allow_empty_commit: bool = False,
) -> GateOutcome:
    """``verification_method`` must be a legal token. **Advisory.**

    Split out of :func:`check_verification_integrity` by Set 083 S2 so
    ``--manual-verify`` could bypass the EVIDENCE corroboration while the
    vocabulary rule stayed universal. Set 116 S3 promoted it to its own
    registry entry and the operator's ruling made that entry advisory:
    the check still runs and still prints its message, but it cannot
    refuse a close ("a spelling check on a token").

    It therefore returns ``(False, ...)`` for an illegal token exactly as
    it always did — the demotion lives in :data:`ADVISORY_CHECKS`, not
    here. A predicate that softened its own verdict would leave every
    caller unable to tell "passed" from "was excused", and would make the
    demotion impossible to reverse without re-deriving the rule.

    Retired/renamed tokens get a naming message; every refusal teaches
    the sanctioned Step 6 command.
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
         the session's orchestrator EFFECTIVE provider** (Set 084 F1:
         registry-resolved from the orchestrator block's ``model`` via
         ``orchestrator_identity.resolve_orchestrator_identity``; the
         free-text seat label is only the single-vendor fallback;
         missing/unresolvable identity fails closed — the Q6 precedent),
         plus an ``sN-verification*.md`` artifact at the set root.
         Set 084 S2 (F3): the row must additionally carry a **valid
         evidence stamp** (``verification_stamp.validate_stamped_row``
         — sanctioned source, evidence hash, canonical-template id +
         normalized hash, verifier-model consistency, the applied
         exclusion, artifact path + content hash, package version;
         any missing or inconsistent field fails closed). A bare
         ``route()`` row no longer corroborates a close.
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

    Scope: every set. Set 112 deleted the Lightweight tier, and with it
    the ``_set_is_lightweight`` early-out that let a spec field — or the
    ``DABBLER_NO_ROUTER`` env var on its own — make this gate inert.
    ``--no-router`` now suppresses routed calls and buys no gate relief.

    Posture: **hard-block in BOTH interactive and headless modes** — the
    policed actor *is* the headless agent, so a soft warning printed to
    the offender's own console is toothless (operator-confirmed deviation
    from the Q6 TTY-block/headless-warn split). ``--manual-verify``
    (attested, logged) is the only sanctioned bypass, and it bypasses
    the **evidence corroboration** below. ``--force`` bypasses neither.
    Every refusal names the exact sanctioned command so the blocked
    engine learns the easy path.

    Set 116 S3 — the vocabulary layer left this gate. It is now its own
    registry entry, ``verification_method_vocabulary``, and the
    operator's 2026-08-10 ruling made that entry **advisory**: it runs,
    it prints, and it cannot refuse a close. What survives here is the
    substance of the Set 083 incident — an uncorroborated claimed
    verdict — which the evidence layers below refuse exactly as before.

    What that demotion does and does not change, stated exactly, because
    "the vocabulary check no longer blocks" is easy to over-read:

    * An illegal token still cannot reach a passing close on an ordinary
      repo. ``verification_method`` *selects the corroboration path*, so
      a token this gate has no path for is not a spelling problem — it
      falls through to the zero-budget arm below and is refused there
      because ``budget.yaml`` does not declare ``threshold_usd: 0``.
      The refusal is now "I cannot corroborate this", which is this
      gate's own job, rather than "that word is not in the list".
    * The demotion bites in exactly two places, both named to the
      operator before it was attested: under ``--manual-verify`` (where
      the caller excuses this gate entirely, so nothing checks the
      token), and on a repo that has *declared* the zero-budget tier and
      written the same non-standard token into ``budget.yaml`` — three
      deliberate operator declarations agreeing with each other, which
      is a declaration and not drift.
    """
    _ = allow_empty_commit

    if disposition is None:
        # Nothing is claimed. Disposition presence is enforced elsewhere
        # (invalid_invocation / disposition_present), and lying by
        # omission is the documented out-of-scope residual.
        return True, ""

    command = _verify_session_command(session_set_dir)
    method = disposition.verification_method

    # Layer 2a — ledger axis (Set 086 S1). Orthogonal to the verdict/stamp
    # axis below and checked FIRST with a short-circuit: a fully-simulated
    # session leaves a corroborated-looking verdict but no router ledger, so
    # the ledger absence is the loudest, root-cause signal. Runs on the
    # non-manual path only (--manual-verify swaps this gate out at the
    # caller).
    ledger_passed, ledger_remediation = _check_session_ledger_present(
        session_set_dir
    )
    if not ledger_passed:
        return False, ledger_remediation

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
        orch_block: Optional[dict] = None
        for entry in normalized.get("sessions") or []:
            if isinstance(entry, dict) and entry.get("number") == current:
                orch = entry.get("orchestrator")
                if isinstance(orch, dict):
                    orch_block = orch
                break
        # Set 084 (F1): the orchestrator side of the != check is the
        # EFFECTIVE provider — registry-resolved from the block's model
        # through the shared helper, never the free-text seat label
        # (which stays second choice for single-vendor engines only).
        # Unresolvable identity fails closed, remediation names the
        # exact flag (start_session --model).
        try:
            try:
                from .orchestrator_identity import (  # type: ignore[import-not-found]
                    IdentityResolutionError,
                    resolve_orchestrator_identity,
                )
            except ImportError:
                from orchestrator_identity import (  # type: ignore[no-redef]
                    IdentityResolutionError,
                    resolve_orchestrator_identity,
                )
            identity = resolve_orchestrator_identity(
                orch_block, models_registry=_models_registry() or None
            )
            orch_provider = identity.effective_provider
        except IdentityResolutionError as exc:
            return (
                False,
                f"claimed verdict {claimed!r} (method api) cannot be "
                f"corroborated: session {current}'s orchestrator "
                f"identity is unresolvable — {exc} Cross-provider "
                "verification cannot be confirmed against an unresolved "
                "identity (fails closed). Re-run start_session with "
                f"--model, then verify via: {command}",
            )

        all_rows, valid_rows, rejections = (
            find_session_verification_evidence(
                session_set_dir, current, orch_provider,
            )
        )
        if not all_rows:
            return (
                False,
                f"claimed verdict {claimed!r} (method api) has no "
                "session-verification row in router-metrics.jsonl for "
                f"session {current} of this set — the routed verifier "
                "never ran (or metrics are unreadable; fails closed). "
                f"Run the sanctioned Step 6 command: {command}",
            )
        if not valid_rows:
            # Set 084 S2 (F3): rows exist but none carries a valid,
            # internally consistent evidence stamp — a bare route() row
            # (the incident-3 shape) or a tampered/mismatched stamp no
            # longer corroborates a close. Surface the first rejection
            # reason so the refusal is diagnosable, and keep naming the
            # sanctioned command.
            first_reason = rejections[0] if rejections else "no stamp"
            return (
                False,
                f"claimed verdict {claimed!r} (method api) has "
                f"{len(all_rows)} session-verification row(s) for session "
                f"{current}, but none carries a valid evidence stamp "
                f"(Set 084 F3 — first rejection: {first_reason}). Only "
                "verify_session-stamped rows (or the close backstop's) "
                "corroborate a close; run the sanctioned Step 6 command: "
                f"{command}",
            )
        # SS3 (anti-rollback): the LATEST ATTEMPT governs, not the latest VALID
        # row. If the newest session-verification row FAILED validation (e.g. a
        # truncated round whose artifact never landed, or a tampered row), an
        # earlier favorable valid row must NOT corroborate the close -- fail
        # closed so a newer failed attempt cannot be discarded in favor of an
        # older pass. ``find_valid_stamped_rows`` appends the same dicts in
        # order, so identity against ``all_rows[-1]`` is exact.
        if valid_rows[-1] is not all_rows[-1]:
            first_reason = rejections[0] if rejections else "invalid latest row"
            return (
                False,
                f"claimed verdict {claimed!r} (method api): the LATEST "
                f"session-verification row for session {current} is INVALID "
                f"({first_reason}). A newer attempt failed validation, so an "
                "earlier favorable row cannot corroborate the close (SS3 "
                "anti-rollback, fails closed). Re-verify via the sanctioned "
                f"Step 6 command: {command}",
            )
        # I-084-S2-7/-8: the CLAIM must match what the verifier
        # actually said — and when multiple valid rows exist, the
        # AUTHORITATIVE result is the LATEST one (rows append
        # chronologically), so a later blocking verification can never
        # be laundered by cherry-picking an earlier favorable row. The
        # stamped verdict is parsed at record time from the same bytes
        # the artifact hash binds.
        authoritative = valid_rows[-1]
        if claimed != authoritative.get("verdict"):
            return (
                False,
                f"claimed verdict {claimed!r} (method api) does not "
                "match the LATEST stamped verification verdict for "
                f"session {current} "
                f"({authoritative.get('verdict')!r}, artifact "
                f"{authoritative.get('artifact_path')!r}). The most "
                "recent verifier result — not the disposition's claim "
                "or an earlier round — is the evidence; re-verify via "
                f"the sanctioned Step 6 command: {command}",
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
# check_test_run_fresh / check_uat_walk_recorded (Set 111 S4)
# ---------------------------------------------------------------------------

TEST_RUN_FRESH_CHECK_NAME = "test_run_fresh"
UAT_WALK_CHECK_NAME = "uat_walk_recorded"
CHECKLIST_POSTED_CHECK_NAME = "checklist_posted"
VERIFICATION_METHOD_VOCABULARY_CHECK_NAME = "verification_method_vocabulary"


def _router_config_or_none() -> Optional[dict]:
    """Load ``router-config.yaml``, or ``None`` when it cannot be read.

    Both Set 111 gates degrade to their locked defaults on a config
    failure rather than raising — a close must not wedge because the
    config is momentarily unparseable.
    """
    try:
        try:
            from .config import load_config  # type: ignore[import-not-found]
        except ImportError:
            from ai_router.config import load_config  # type: ignore[no-redef]
        return load_config()
    except Exception:
        return None


def check_test_run_fresh(
    session_set_dir: str,
    disposition: Optional[Disposition],
    *,
    allow_empty_commit: bool = False,
) -> GateOutcome:
    """Verify the expensive suites this session touched have a fresh run.

    The test-run policy (Set 111 S4, piloted in Set 110's operator notes)
    says an expensive suite runs fully **once per session, after the last
    code change**. Set 110 S3 tried to close on a full run that predated
    three test fixes, disclosed it, and was correctly refused — the
    orchestrator agreed with the policy and slipped anyway, which is why
    this is a check and not a paragraph.

    Freshness is a **content digest** over the surfaces a suite covers
    (``run_of_record.surface_digest``), not an mtime: a checkout or a
    no-op save rewrites mtimes without changing content, and both
    directions of that error are unacceptable in a gate.

    Inert by construction where it should be: a suite whose covered
    surfaces this session did not touch is not required, and a set that
    declares no expensive suites passes trivially. There is no tier-shaped
    escape — Set 112 removed the Lightweight early-out.

    **A suite-configuration error blocks (Set 129 S1).** "No expensive
    suites declared" used to be indistinguishable from "every declared
    suite was malformed and silently dropped", so one typo in a
    consumer's ``testing.suites`` block disarmed this gate for the whole
    repo and reported nothing. The information the skip needs is missing,
    so there is no skip.
    """
    _ = allow_empty_commit

    if disposition is None:
        # A missing disposition is already the disposition_present gate's
        # failure; piling on here would double-report one root cause.
        return True, ""

    try:
        try:
            from .run_of_record import (  # type: ignore[import-not-found]
                evaluate_freshness,
                load_suites_checked,
            )
        except ImportError:
            from ai_router.run_of_record import (  # type: ignore[no-redef]
                evaluate_freshness,
                load_suites_checked,
            )
    except ImportError as exc:  # pragma: no cover - defensive
        return False, f"run_of_record unavailable: {exc}"

    loaded = load_suites_checked(_router_config_or_none())
    if loaded.errors:
        return False, (
            "the test-suite declaration is malformed, so the suites this "
            "session owes cannot be determined; fix testing.suites in "
            "router-config.yaml — "
            + "; ".join(loaded.errors)
        )
    suites = loaded.suites
    if not any(s.expensive for s in suites):
        return True, ""

    verdicts = evaluate_freshness(
        session_set_dir, list(disposition.files_changed), suites
    )
    failures = [v for v in verdicts if v.required and not v.passed]
    if not failures:
        return True, ""
    return False, "; ".join(f"{v.suite}: {v.reason}" for v in failures)


def _uat_policy(session_set_dir: str) -> Tuple[bool, str]:
    """Return ``(requires_uat, uat_scope)`` from the set's spec.

    A spec that cannot be parsed reports ``(False, "none")`` — the gate
    is a universal-core addition and must stay inert for every set that
    does not declare UAT, including specs predating the config block.

    **Scope never disarms an armed flag.** ``requiresUAT: true`` is the
    arming decision; ``uatScope`` only says WHICH sessions owe the walk.
    An omitted scope (a shape that already exists in this repo's history)
    used to collapse to ``none`` and turn the whole gate off, so the one
    spec most likely to be hand-authored — ``requiresUAT: true`` and
    nothing else — was exactly the one that closed with no walk and no
    complaint. That is the evaporation this gate exists to make
    impossible, so anything other than a recognised scope now resolves to
    ``per-set``: the final session owes the walk. Disarming is done where
    it is visible, by ``requiresUAT: false`` or ``"suggested"``.
    """
    try:
        try:
            from .spec_config import (  # type: ignore[import-not-found]
                LightweightTierRemovedError,
                parse_session_set_config,
            )
        except ImportError:
            from ai_router.spec_config import (  # type: ignore[no-redef]
                LightweightTierRemovedError,
                parse_session_set_config,
            )
        from pathlib import Path as _Path

        cfg = parse_session_set_config(
            _Path(session_set_dir) / "spec.md"
        )
    except LightweightTierRemovedError:
        # Set 112: never swallow the removed-tier refusal. This broad
        # handler exists so an UNPARSEABLE spec leaves the gate inert; a
        # spec that parses fine and declares a DELETED tier is the
        # opposite case, and converting it to "(False, 'none')" would
        # both hide the migration message and silently disarm an armed
        # UAT policy. Re-raise so the caller's boundary refusal fires.
        raise
    except Exception:
        return False, "none"
    # Only a literal `true` arms the gate. "suggested" is deliberately
    # NOT armed: Set 048 S2 defined it as advisory, and turning an
    # advisory flag into a hard close gate would be a policy change this
    # session was not asked to make.
    if cfg.requires_uat is not True:
        return False, "none"
    scope = (cfg.uat_scope or "").strip().lower()
    if scope not in ("per-set", "per-session"):
        scope = "per-set"
    return True, scope


def check_uat_walk_recorded(
    session_set_dir: str,
    disposition: Optional[Disposition],
    *,
    allow_empty_commit: bool = False,
) -> GateOutcome:
    """A ``requiresUAT`` session closes with its walk, or an attested waiver.

    Set 110 S2 closed without its UAT walk — part of a long pattern the
    operator named directly: *"We often bypass UAT. I haven't complained
    because it totally sucks, but we shouldn't bypass it."* The failure
    mode is not a decision to skip; it is **evaporation**, the walk simply
    not happening and nothing noticing. This gate makes skipping a visible,
    recorded operator decision instead.

    Policy, read from the spec's configuration block:

    * ``requiresUAT`` is not literally ``true`` → inert.
    * ``uatScope: per-set`` → only the **final** session owes a walk.
    * ``uatScope: per-session`` → every session owes one.
    * anything else — omitted, ``none``, or a typo — → ``per-set``.
      Scope chooses WHICH sessions owe a walk; it never cancels the
      requirement. Disarming is done visibly, with ``requiresUAT: false``
      or ``"suggested"``.

    A session that owes a walk passes only with a ``uat`` block whose
    ``status`` is ``walked`` (and whose ``walkArtifact`` exists on disk)
    or ``waived`` (with a non-empty attestation). Shape errors are the
    disposition validator's job; this gate reports the policy failure and
    the on-disk artifact check the validator cannot do.
    """
    _ = allow_empty_commit

    requires_uat, scope = _uat_policy(session_set_dir)
    if not requires_uat or scope == "none":
        return True, ""

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
    if scope == "per-set" and not is_final:
        return True, ""

    if disposition is None:
        return True, ""

    uat = disposition.uat
    if not isinstance(uat, dict) or not uat:
        return (
            False,
            f"this set declares requiresUAT: true (uatScope: {scope}) and "
            f"session {current} owes its guided-look walk, but "
            f"disposition.uat is absent. Record the walk "
            f"(status 'walked' + walkArtifact + attestation) or an "
            f"operator-attested waiver (status 'waived' + attestation). "
            f"A walk must never evaporate silently.",
        )

    status = uat.get("status")
    attestation = uat.get("attestation")
    if not isinstance(attestation, str) or attestation.strip() == "":
        return (
            False,
            "disposition.uat.attestation must record what the operator "
            "actually said; an unattested walk or waiver is not auditable",
        )

    if status == "waived":
        return True, ""

    if status != "walked":
        return (
            False,
            f"disposition.uat.status must be 'walked' or 'waived' "
            f"(got {status!r})",
        )

    artifact = uat.get("walkArtifact")
    if not isinstance(artifact, str) or artifact.strip() == "":
        return (
            False,
            "disposition.uat.walkArtifact must name the walk file when "
            "uat.status == 'walked'",
        )
    # Resolve relative to the session-set dir first (the normal case),
    # then as a repo-relative or absolute path, so a walk stored outside
    # the set folder still validates.
    candidates = [
        os.path.join(session_set_dir, artifact),
        artifact,
    ]
    repo_root = _repo_root_for(session_set_dir)
    if repo_root:
        candidates.append(os.path.join(repo_root, artifact))
    if not any(os.path.isfile(c) for c in candidates):
        return (
            False,
            f"disposition.uat.walkArtifact {artifact!r} does not exist; "
            f"a recorded walk must point at the walk that was actually "
            f"presented",
        )
    return True, ""


# ---------------------------------------------------------------------------
# check_checklist_posted (Set 114 S1)
# ---------------------------------------------------------------------------

# The cadence, encoded. Each tuple is (kind, operator-facing label) for a
# transition this gate can SEE in the session's own records.
#
# Set 114 S1 round 1 (finding 3): the first cut of this comment claimed
# operator stops "leave no timestamped record of their own" and used that
# to justify not checking them. That was false — `decision_journal`
# writes a timestamped record for every decision, and the human-authority
# ones ARE the operator stops. They are checked below. The genuinely
# unobservable half is named in the docstring.
CHECKLIST_TRANSITION_START = "session-start"
CHECKLIST_TRANSITION_TEST_RUN = "test-run-recorded"
CHECKLIST_TRANSITION_ROUND = "verification-round"
CHECKLIST_TRANSITION_OPERATOR_STOP = "operator-stop"
CHECKLIST_TRANSITION_LAST_STEP = "last-logged-step"


def _checklist_transitions(
    session_set_dir: str, session_number: int, state: dict
) -> List[Tuple[datetime, str]]:
    """Every checkable transition for *session_number*, unsorted.

    Read from the records the session already keeps, so the gate never
    asks the orchestrator to attest to anything: ``session-state.json``
    for the start, ``test-runs.jsonl`` for the long-running commands,
    ``sN-rounds.jsonl`` for the completed verification rounds,
    ``decisions.jsonl`` for the operator stops (a human-authority
    decision IS a stop, by definition), and the newest
    ``activity-log.json`` entry for "the work moved on, and the next
    thing is close".

    Only the LAST logged step becomes a transition, not every one. A post
    after every step is the noise failure the spec warns about, and a
    checklist scrolled past like a banner answers nothing.
    """
    out: List[Tuple[datetime, str]] = []

    for session in state.get("sessions") or []:
        if not isinstance(session, dict):
            continue
        if session.get("number") != session_number:
            continue
        started = _parse_iso_timestamp(session.get("startedAt"))
        if started is not None:
            out.append((started, CHECKLIST_TRANSITION_START))
        break

    try:
        try:
            from .run_of_record import read_records  # type: ignore[import-not-found]
        except ImportError:
            from run_of_record import read_records  # type: ignore[no-redef]
        for record in read_records(session_set_dir):
            if record.session_number != session_number:
                continue
            when = _parse_iso_timestamp(record.recorded_at)
            if when is not None:
                suite = record.suite or "?"
                out.append(
                    (when, f"{CHECKLIST_TRANSITION_TEST_RUN} ({suite})")
                )
    except ImportError:  # pragma: no cover - defensive
        pass

    rounds_path = os.path.join(
        session_set_dir, f"s{session_number}-rounds.jsonl"
    )
    # Set 116 S2: the close backstop now ledgers its rounds too, so the
    # ledger is the true count. A backstop round is NOT a checklist
    # transition: it runs in-process DURING the close, which means its
    # window ("post at or after the last transition") opens after the
    # last moment the orchestrator could ever post into it. Left in, it
    # would fail every backstop-verified close on a post that was
    # impossible to make -- an obligation the session cannot discharge is
    # not discipline, it is a trap. The cadence governs the ORCHESTRATOR
    # showing the operator where it is; a round the framework runs for
    # itself at close has no "after" to show.
    #
    # The token comes from the stamp's closed producer vocabulary rather
    # than being spelled out here: one definition, so a rename cannot
    # silently turn this skip into a no-op (L-069-1).
    try:
        from .verification_stamp import (  # type: ignore[import-not-found]
            STAMP_SOURCE_CLOSE_BACKSTOP,
        )
    except ImportError:
        from verification_stamp import (  # type: ignore[no-redef]
            STAMP_SOURCE_CLOSE_BACKSTOP,
        )
    try:
        with open(rounds_path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(record, dict):
                    continue
                if record.get("event") != "round-completed":
                    continue
                if record.get("sessionNumber") != session_number:
                    continue
                # A backstop round is not a transition -- see above.
                if record.get("source") == STAMP_SOURCE_CLOSE_BACKSTOP:
                    continue
                when = _parse_iso_timestamp(record.get("recordedAt"))
                if when is not None:
                    number = record.get("verificationRound")
                    out.append(
                        (when, f"{CHECKLIST_TRANSITION_ROUND} {number}")
                    )
    except OSError:
        pass

    # An operator stop is a decision the AI may not take alone, and
    # `decision_journal` timestamps every one of them. Only the
    # human-authority rows are stops: an `ai`-authority decision is
    # journaled without stopping for anyone.
    try:
        try:
            from .decision_journal import (  # type: ignore[import-not-found]
                JOURNAL_FILENAME,
            )
        except ImportError:
            from decision_journal import (  # type: ignore[no-redef]
                JOURNAL_FILENAME,
            )
        with open(
            os.path.join(session_set_dir, JOURNAL_FILENAME),
            "r",
            encoding="utf-8",
        ) as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(record, dict):
                    continue
                if record.get("authority") != "human":
                    continue
                if record.get("session_number") != session_number:
                    continue
                when = _parse_iso_timestamp(record.get("timestamp"))
                if when is not None:
                    rubric = record.get("rubric_line") or "?"
                    out.append(
                        (
                            when,
                            f"{CHECKLIST_TRANSITION_OPERATOR_STOP} ({rubric})",
                        )
                    )
    except (OSError, ImportError):
        pass

    log = _read_activity_log(session_set_dir)
    entries = (log or {}).get("entries")
    if isinstance(entries, list):
        stamps = [
            (parsed, e)
            for e in entries
            if isinstance(e, dict)
            and e.get("sessionNumber") == session_number
            # Set 114 S2: only a LOGGED step is the work moving on. A
            # seeded plan row, or a policy record the writer emitted at
            # registration, would invent a transition the session never
            # reached — and both are written before any work exists.
            and is_logged_step(e)
            for parsed in [_parse_iso_timestamp(e.get("dateTime"))]
            if parsed is not None
        ]
        if stamps:
            when, entry = max(stamps, key=lambda pair: pair[0])
            key = str(entry.get("stepKey") or "").strip() or "?"
            out.append((when, f"{CHECKLIST_TRANSITION_LAST_STEP} ({key})"))

    return out


def check_checklist_posted(
    session_set_dir: str,
    disposition: Optional[Disposition],
    *,
    allow_empty_commit: bool = False,
) -> GateOutcome:
    """A session that never showed the operator where it was cannot close.

    Set 111 S4 shipped ``session_checklist`` and wrote the obligation to
    post it at every transitional boundary as **prose** — then ran for
    many hours across dozens of transitions and posted once, at the
    start. Nothing noticed, because nothing could: a close gate cannot
    observe a chat window. So Set 114 made rendering the checklist the
    act that records it (``checklist-posts.jsonl``), and this gate
    compares those records against the transitions the session's own
    records show.

    The rule is one post per transition, consumed in time order: for
    transitions at ``t1 < t2 < ... < tk``, each ``ti`` needs a post in
    ``[ti, ti+1)`` (the last: at or after ``tk``). That is what stops a
    single post at the very end from covering the whole session, and it
    makes the final transition's window the "before close" post by
    construction — no separate close concept needed.

    **One transition type discharges itself (Set 127 S3).** The
    ``verification-round`` transitions are no longer the orchestrator's
    to remember: ``verify_session`` renders the checklist at the end of
    every round that completed, through the same ``record_post`` path, so
    the record still means a render happened. The machine-driven
    ``discovery -> supplementary -> remediate -> remediation-review``
    sequence closed each of those windows minutes apart with nobody at
    the terminal (Set 126 S2 missed rounds 2 and 3), and a missed window
    can only be waived — a structurally predictable omission arriving on
    the operator's desk as paperwork. The operator ratified removing the
    failure mode rather than re-teaching the obligation
    (``authority: "human"``, ``verification_effect: "reduces"``, Set
    127's ``decisions.jsonl``), knowing the cost: a round transition can
    no longer be missed, so it can no longer be reported.

    Nothing else moved. This gate is unchanged — it still derives round
    transitions from ``sN-rounds.jsonl`` and still applies the positional
    windows to them — and every other transition type (session start,
    test-run recorded, operator stop, last logged step) binds exactly as
    it did, which is the half a human can actually hit. A round the
    CLOSE BACKSTOP ran still posts nothing and is still not a transition
    (see :func:`_checklist_transitions`), and neither is a round that was
    refused, failed, or dry-run.

    Exactly one transition may be excused, and only by being older than
    the session's first recorded post: **the session start**. A ledger
    cannot describe the time before it existed, so a session already in
    flight when this shipped — or in a consumer repo that upgraded
    mid-session — is not failed for a start it could not have recorded.
    Every other transition binds unconditionally, however old the ledger
    is. The first cut of this gate excused *every* transition older than
    the first post, which meant a session that ignored the checklist all
    day, hit this gate, ran the command once and retried closed
    cleanly — the exact decay this set exists to end (round-1 findings 1
    and 4).

    Records older than the session's own ``startedAt`` are not this
    session's transitions at all and are dropped before any of that: a
    session cannot owe a post for a moment that preceded it.

    A missed window cannot be re-entered — you cannot post into the
    past — so the escape is an **operator-attested waiver**, the same
    shape ``check_uat_walk_recorded`` uses: ``disposition.checklist``
    with ``status: "waived"`` and a non-empty ``attestation``. Found by
    this gate's own dogfood, which refused the session that shipped it:
    without a waiver the only exit is ``--force``, which bypasses every
    *other* gate too, so an unrecoverable check makes the close-out
    weaker overall. A waiver keeps the omission on the record with a
    name against it, which is the whole point — laundering it silently
    is what the positional windows exist to prevent.

    Two deliberate limits, stated rather than hidden:
    * **A post proves a render, not a reader.** The gate can be satisfied
      mechanically. That is an acceptable floor: it converts an invisible
      omission into a visible one, which is strictly what it claims.
    * **No "before X" moment is checkable.** Every record this framework
      keeps is written *after* the thing it describes, so this gate can
      prove a post followed an event and can never prove one preceded
      it: starting a command leaves no artifact, and `decisions.jsonl`
      gets its line once the decision exists — after the brief, not
      before it. Asking the orchestrator to declare either would be the
      self-reported attestation the spec rules out (Decision 3), and it
      would decay exactly as the prose obligation did. The
      ``operator-stop`` transition therefore means "a stop was journaled
      and the session posted after it", and the docs say so.
        **Advisory since Set 116 S3** (operator ruling, 2026-08-10): this
    check still runs and still reports, but it cannot refuse a close.
    The verdict below is unchanged — the demotion lives in
    :data:`ADVISORY_CHECKS`, so re-arming it is one line.
    """
    _ = disposition
    _ = allow_empty_commit

    try:
        try:
            from .session_checklist import (  # type: ignore[import-not-found]
                POSTS_FILENAME,
                read_posts,
            )
        except ImportError:
            from session_checklist import (  # type: ignore[no-redef]
                POSTS_FILENAME,
                read_posts,
            )
    except ImportError as exc:  # pragma: no cover - defensive
        return False, f"session_checklist unavailable: {exc}"

    state = read_session_state(session_set_dir)
    if not state:
        return False, "session-state.json missing or unreadable"
    view, err = _read_progress_or_none(state, session_set_dir)
    if view is None:
        return False, err  # type: ignore[return-value]
    current = _session_in_focus(view)
    if current is None:
        return False, "no session in flight and none closed"

    command = (
        f"{_venv_python()} -m ai_router.session_checklist --markdown "
        f"--session-set-dir {_set_dir_display(session_set_dir)}"
    )

    posts = sorted(
        (
            parsed
            for record in read_posts(session_set_dir, current)
            for parsed in [_parse_iso_timestamp(record.get("postedAt"))]
            if parsed is not None
        )
    )
    if not posts:
        return (
            False,
            f"session {current} recorded no step-checklist post in "
            f"{POSTS_FILENAME}. The operator was never shown where this "
            f"session was. Post it now ({command}) and re-run close; from "
            f"here on, post at every transition named in "
            f"session-constitution.md Step 4.",
        )

    transitions = _checklist_transitions(session_set_dir, current, state)
    started = next(
        (
            when
            for when, label in transitions
            if label == CHECKLIST_TRANSITION_START
        ),
        None,
    )
    if started is not None:
        # A transition is a moment WITHIN the session. A record older
        # than the session's own start belongs to something else (a
        # fixture's canned history, a prior session's entry, a clock the
        # session did not own), and a session cannot owe a post for a
        # moment that preceded it.
        transitions = [
            (when, label)
            for when, label in transitions
            if when >= started or label == CHECKLIST_TRANSITION_START
        ]
    if not transitions:
        return True, ""

    # Group transitions that share an instant: one post covers them all,
    # because an empty [t, t) window is unsatisfiable by construction.
    grouped: List[Tuple[datetime, List[str]]] = []
    for when, label in sorted(transitions, key=lambda pair: pair[0]):
        if grouped and grouped[-1][0] == when:
            grouped[-1][1].append(label)
        else:
            grouped.append((when, [label]))

    first_post = posts[0]
    missing: List[str] = []
    for index, (when, labels) in enumerate(grouped):
        upper = (
            grouped[index + 1][0] if index + 1 < len(grouped) else None
        )
        covered = any(
            post >= when and (upper is None or post < upper) for post in posts
        )
        if covered:
            continue
        # The one bounded excuse: a session start older than the ledger's
        # first post. Anything else in the same group still binds, so a
        # test run that happens to share the start's instant is not
        # excused by proximity.
        excused = [
            label
            for label in labels
            if label == CHECKLIST_TRANSITION_START and when < first_post
        ]
        missing.extend(label for label in labels if label not in excused)

    if not missing:
        return True, ""

    # A missed window cannot be re-entered, so the only honest exit is an
    # operator-attested waiver that leaves the omission on the record.
    waiver = getattr(disposition, "checklist", None) if disposition else None
    if isinstance(waiver, dict) and waiver.get("status") == "waived":
        attestation = waiver.get("attestation")
        if not isinstance(attestation, str) or attestation.strip() == "":
            return (
                False,
                "disposition.checklist.status is 'waived' but "
                "attestation is empty; an unattested waiver records "
                "nobody's decision. State what the operator actually "
                "said, and name the missed transitions: "
                f"{'; '.join(missing)}",
            )
        return True, ""

    return (
        False,
        f"session {current} owes a step-checklist post at "
        f"{len(missing)} transition(s) that left a record and no post: "
        f"{'; '.join(missing)}. Post the checklist ({command}) and re-run "
        f"close — a post recorded now covers the last transition. Each "
        f"transition needs its own post, before the next one happens. A "
        f"window already passed cannot be re-entered: if one was missed, "
        f"the exit is an operator-attested waiver "
        f"(disposition.checklist = {{'status': 'waived', 'attestation': "
        f"'...'}}), never a silent retry.",
    )


# ---------------------------------------------------------------------------
# Registry consumed by close_session._run_gate_checks
# ---------------------------------------------------------------------------
# Order matters: this is the order checks appear in the JSON output's
# ``gate_results`` list. Skeleton ordering is preserved so consumers
# (Set 5 VS Code extension) don't have to re-pin against a new shape.
# Set 111 S4 appends two checks rather than inserting them, so every
# existing index-based consumer keeps its position. Set 116 S3 appends
# verification_method_vocabulary for the same reason: it was already a
# check (layer 1 of verification_integrity, and the whole of that gate
# under --manual-verify), and the operator's ruling names it, so it
# needs a row of its own to be demoted in.
GATE_CHECKS: Tuple[Tuple[str, "callable"], ...] = (  # type: ignore[name-defined]
    ("working_tree_clean", check_working_tree_clean),
    ("pushed_to_remote", check_pushed_to_remote),
    ("activity_log_entry", check_activity_log_entry),
    ("next_orchestrator_present", check_next_orchestrator_present),
    ("change_log_fresh", check_change_log_fresh),
    (VERIFICATION_INTEGRITY_CHECK_NAME, check_verification_integrity),
    (TEST_RUN_FRESH_CHECK_NAME, check_test_run_fresh),
    (UAT_WALK_CHECK_NAME, check_uat_walk_recorded),
    (CHECKLIST_POSTED_CHECK_NAME, check_checklist_posted),
    (
        VERIFICATION_METHOD_VOCABULARY_CHECK_NAME,
        check_verification_method_vocabulary,
    ),
)


# ---------------------------------------------------------------------------
# Which checks may refuse a close (Set 116 S3 — the operator's ruling)
# ---------------------------------------------------------------------------
# Operator ruling, 2026-08-10, attested in Set 116's decisions.jsonl
# (authority=human, rubric_line=verification-reduction). Every name here
# still RUNS and still PRINTS its remediation; it simply cannot refuse a
# close. Removing a name from this set re-arms it; nothing is deleted, so
# a demotion is one line to reverse.
#
# The complement is deliberately NOT spelled out as a "blocking" list.
# Membership of GATE_CHECKS is what makes a check exist, and blocking is
# the default — a check added later blocks unless someone deliberately
# demotes it, which is the safe direction for a list to fail in.
ADVISORY_CHECKS: FrozenSet[str] = frozenset(
    {
        "activity_log_entry",
        "next_orchestrator_present",
        "change_log_fresh",
        CHECKLIST_POSTED_CHECK_NAME,
        VERIFICATION_METHOD_VOCABULARY_CHECK_NAME,
    }
)


def is_blocking_check(name: str) -> bool:
    """True when a failure of *name* must refuse the close.

    The single predicate every caller asks — ``close_session.run``,
    ``close_session.run_gate_checks``'s consumers, and
    ``session_state.mark_session_complete``. One spelling of the rule,
    because three copies of ``name not in {...}`` is exactly the sibling
    drift L-069-1 is about: a later set that re-arms one check would
    otherwise re-arm it in one place and not the others.

    Unknown names block. A check nobody classified is a check nobody
    demoted.
    """
    return name not in ADVISORY_CHECKS
