"""Fixture generator for the end-to-end orchestrator harness.

The harness drives the real ``ai_router.start_session`` and
``ai_router.close_session`` CLIs against tmpdir-scoped session sets
and asserts on the resulting on-disk state. To pass the close-out
gates (working tree clean, pushed to remote, activity log entry,
next orchestrator, change-log fresh), each fixture session set is
backed by a genuine git repository with a local bare remote — the
same shape ``test_close_session_integration.py``'s ``closeable_set``
fixture uses, generalized to multi-session sequences.

Public entry points
-------------------
``make_session_set(tmp_path, slug, total_sessions, ...)``
    Build a tmpdir-scoped git repo + bare remote, drop a spec.md
    with the orchestrator-expected YAML block, and return the
    session-set directory path plus a handle for subsequent CLI
    invocations.

``drive_start_session(handle, session_number, **kwargs)``
    Invoke ``python -m ai_router.start_session`` via subprocess.
    Auto-commits and pushes the state changes so subsequent close
    gates see a clean tree.

``drive_close_session(handle, session_number, *, is_final, ...)``
    Invoke ``python -m ai_router.close_session --manual-verify
    --reason-file <tmp>``. Caller must have already staged the
    disposition / activity log / change-log for the session.
    Returns the subprocess CompletedProcess so scenario tests can
    assert on exit codes and stdout.

``make_disposition(handle, session_number, *, is_final, status, ...)``
    Write a valid ``disposition.json`` to the session-set root.

``make_change_log(handle, summary)``
    Write ``change-log.md`` mentioning the current session number,
    so ``check_change_log_fresh`` passes on the final session.

``make_activity_log_entry(handle, session_number)``
    Append a minimal entry to ``activity-log.json`` so
    ``check_activity_log_entry`` passes.

``read_state(handle)`` / ``read_events(handle)``
    Thin wrappers that read the on-disk state file and the events
    ledger; tests use them as the assertion surface.

The harness uses ``--manual-verify`` throughout: no live API calls,
no provider routing, zero verification spend. Scenario tests
override individual steps to exercise failure paths.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

# Repo root: ai_router/tests/e2e/fixtures.py → parents[3] is the
# repository checkout. The harness passes this on PYTHONPATH to every
# subprocess so ``python -m ai_router.start_session`` resolves against
# the source tree without requiring the test interpreter to have
# ai_router pip-installed. This lets ``pytest`` run under the system
# Python on a developer laptop where only the project's source is on
# disk (no ``pip install -e .`` step).
_REPO_ROOT = Path(__file__).resolve().parents[3]

# Import via the bare-filename convention the existing test suite
# uses (the parent conftest puts ``ai_router/`` on sys.path).
from disposition import (  # type: ignore[import-not-found]
    Disposition,
    write_disposition,
)
from session_events import read_events as _read_events_raw  # type: ignore[import-not-found]
from session_lifecycle import (  # type: ignore[import-not-found]
    cancel_session_set,
    restore_session_set,
)
from session_state import (  # type: ignore[import-not-found]
    NextOrchestrator,
    NextOrchestratorReason,
    read_session_state,
    synthesize_not_started_state,
)


# ---------------------------------------------------------------------------
# Handle
# ---------------------------------------------------------------------------


@dataclass
class HarnessHandle:
    """Per-session-set state the fixture helpers share.

    Carries everything the helpers need to operate on a fixture without
    re-deriving paths every call: the repo root (where ``git`` commands
    run from), the session-set directory (passed to both CLIs), the
    bare remote (so the auto-push after each boundary write actually
    has somewhere to go), the orchestrator descriptor (engine / model /
    provider / effort — the start_session CLI requires these), and the
    declared session-set name (for activity-log entries).
    """

    repo_root: Path
    set_dir: Path
    bare_remote: Path
    slug: str
    total_sessions: int
    engine: str = "claude-code"
    model: str = "claude-opus-4-7"
    provider: str = "anthropic"
    effort: str = "high"


# ---------------------------------------------------------------------------
# Git helpers
# ---------------------------------------------------------------------------


def _subprocess_env() -> Dict[str, str]:
    """Return an env dict for ``python -m ai_router.*`` subprocess calls.

    Prepends the repo root to ``PYTHONPATH`` so the subprocess can
    resolve the ``ai_router`` package against the source tree. Mirrors
    what an editable install would do, without requiring one — useful
    on CI runners and laptops that have a system Python on PATH but
    no ``pip install -e .`` step.
    """
    env = os.environ.copy()
    existing = env.get("PYTHONPATH", "")
    sep = os.pathsep
    env["PYTHONPATH"] = (
        f"{_REPO_ROOT}{sep}{existing}" if existing else str(_REPO_ROOT)
    )
    return env


def _git(repo_root: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    """Run ``git <args>`` in *repo_root* and return the CompletedProcess.

    Raises ``RuntimeError`` on a non-zero exit when *check* is True, so
    fixture failures surface with a useful stderr rather than as an
    opaque downstream assertion failure.
    """
    proc = subprocess.run(
        ["git", *args],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if check and proc.returncode != 0:
        raise RuntimeError(
            f"git {' '.join(args)} failed in {repo_root}: {proc.stderr.strip()}"
        )
    return proc


def _commit_and_push(handle: HarnessHandle, message: str) -> None:
    """Stage all changes under the session set, commit, push to origin.

    The harness calls this after every boundary write (start_session,
    close_session) and after every fixture-authored artifact
    (disposition, activity log, change-log) so the working tree is
    always clean and the branch is always at-tip with the upstream
    when the next close-out gate runs.

    ``--allow-empty`` is intentional: an idempotent re-invocation of
    start_session writes the same snapshot, and we don't want the
    commit step to spuriously fail.
    """
    # Stage only the session-set directory and the harness-reasons dir
    # (where reason files for --reason-file live). Using git add -A would
    # sweep in uncommitted changes from *other* session sets sharing the
    # same repo, which would hide boundary-hygiene regressions in multiset
    # tests by silently including cross-set changes in the wrong commit.
    _git(handle.repo_root, "add", "--", str(handle.set_dir))
    harness_reasons = handle.repo_root / ".harness-reasons"
    if harness_reasons.is_dir():
        _git(handle.repo_root, "add", "--", str(harness_reasons))
    proc = _git(
        handle.repo_root,
        "commit",
        "--allow-empty",
        "-m",
        message,
        check=False,
    )
    if proc.returncode != 0 and "nothing to commit" not in proc.stdout.lower():
        # Non-zero with "nothing to commit" is the empty-diff path which
        # ``--allow-empty`` already authorizes; any other non-zero is a
        # real fixture failure.
        raise RuntimeError(
            f"git commit failed in {handle.repo_root}: "
            f"{proc.stdout.strip()} / {proc.stderr.strip()}"
        )
    _git(handle.repo_root, "push", "origin", "main")


# ---------------------------------------------------------------------------
# Spec.md authoring
# ---------------------------------------------------------------------------


_SPEC_TEMPLATE = """# {slug}

> Test fixture spec for the e2e harness. Not a real session set.

## Session Set Configuration

```yaml
totalSessions: {total_sessions}
requiresUAT: false
requiresE2E: false
uatStyle: ad-hoc
effort: normal
```
"""


def _write_spec(set_dir: Path, slug: str, total_sessions: int) -> None:
    """Write the minimal spec.md the orchestrator's parser expects.

    The parser (``session_state._extract_session_set_configuration_block``)
    looks for the ``## Session Set Configuration`` heading and a YAML
    fenced block beneath it. Only ``totalSessions`` is read by the
    Python layer post-Set-026, but the other fields are included so
    the fixture matches what an operator-authored spec looks like.
    """
    (set_dir / "spec.md").write_text(
        _SPEC_TEMPLATE.format(slug=slug, total_sessions=total_sessions),
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# make_session_set
# ---------------------------------------------------------------------------


def make_session_set(
    tmp_path: Path,
    slug: str,
    total_sessions: int,
    *,
    engine: str = "claude-code",
    model: str = "claude-opus-4-7",
    provider: str = "anthropic",
    effort: str = "high",
) -> HarnessHandle:
    """Build a tmpdir-scoped session set ready for the e2e harness.

    Creates ``<tmp_path>/repo/`` as a git working tree with
    ``<tmp_path>/repo.git`` as its bare upstream, drops the session set
    under ``docs/session-sets/<slug>/`` with a minimal spec.md, and
    lands a baseline commit so the branch has somewhere for subsequent
    pushes to fast-forward from.

    Returns a :class:`HarnessHandle` carrying everything the per-step
    helpers need. Tests typically just pass the handle around without
    inspecting its fields directly.
    """
    repo_root = tmp_path / "repo"
    repo_root.mkdir()

    # Local git identity for the fixture. ``commit.gpgsign=false``
    # neutralizes a global signing config that would otherwise fail in
    # a tmpdir with no key configured.
    _git(repo_root, "init", "-b", "main")
    _git(repo_root, "config", "user.email", "harness@example.invalid")
    _git(repo_root, "config", "user.name", "Harness")
    _git(repo_root, "config", "commit.gpgsign", "false")

    (repo_root / "README.md").write_text("baseline\n", encoding="utf-8")
    _git(repo_root, "add", "README.md")
    _git(repo_root, "commit", "-m", "baseline")

    # Bare remote alongside the working tree; main branch tracks it.
    bare = tmp_path / "repo.git"
    bare.mkdir()
    _git(bare, "init", "--bare", "-b", "main")
    _git(repo_root, "remote", "add", "origin", str(bare))
    _git(repo_root, "push", "-u", "origin", "main")

    set_dir = repo_root / "docs" / "session-sets" / slug
    set_dir.mkdir(parents=True)
    _write_spec(set_dir, slug, total_sessions)

    # Lay down the not-started state file matching production
    # bootstrap. The start_session CLI reads ``totalSessions`` from
    # the existing state file (start_session.py:264); without this
    # call, the first session's snapshot would land with
    # ``totalSessions: null`` and downstream gates would surface
    # confusing failures.
    synthesize_not_started_state(str(set_dir))

    # Land the spec + not-started state on a single commit so
    # subsequent register/close commits show up as their own audit
    # entries in ``git log``.
    _git(repo_root, "add", "-A")
    _git(repo_root, "commit", "-m", f"add fixture session set {slug}")
    _git(repo_root, "push", "origin", "main")

    return HarnessHandle(
        repo_root=repo_root,
        set_dir=set_dir,
        bare_remote=bare,
        slug=slug,
        total_sessions=total_sessions,
        engine=engine,
        model=model,
        provider=provider,
        effort=effort,
    )


# ---------------------------------------------------------------------------
# drive_start_session
# ---------------------------------------------------------------------------


def drive_start_session(
    handle: HarnessHandle,
    session_number: int,
    *,
    commit: bool = True,
) -> subprocess.CompletedProcess:
    """Invoke ``python -m ai_router.start_session`` via subprocess.

    Uses the same interpreter pytest is running under (via
    ``sys.executable``) so the harness exercises the installed
    ``ai_router`` package without resolving ``python`` off PATH —
    important on Windows where the venv's interpreter may not be the
    first ``python`` on PATH.

    When *commit* is True (the default), the resulting state-file and
    events-ledger changes are staged, committed, and pushed so the
    next close-out gate sees a clean tree. Scenario tests that want
    to assert on the in-flight working tree pass ``commit=False``.
    """
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "ai_router.start_session",
            "--session-set-dir",
            str(handle.set_dir),
            "--session-number",
            str(session_number),
            "--engine",
            handle.engine,
            "--model",
            handle.model,
            "--provider",
            handle.provider,
            "--effort",
            handle.effort,
        ],
        cwd=str(handle.repo_root),
        env=_subprocess_env(),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"start_session exited {proc.returncode} for session "
            f"{session_number}: stdout={proc.stdout!r} stderr={proc.stderr!r}"
        )
    if commit:
        _commit_and_push(handle, f"session {session_number}: start_session")
    return proc


# ---------------------------------------------------------------------------
# Disposition authoring
# ---------------------------------------------------------------------------


def _default_next_orchestrator() -> NextOrchestrator:
    """Build a NextOrchestrator that passes ``validate_next_orchestrator``.

    The specifics string is intentionally over the
    ``NEXT_ORCHESTRATOR_SPECIFICS_MIN_LEN`` (30) threshold so a
    casual edit doesn't accidentally fall under it.
    """
    return NextOrchestrator(
        engine="claude-code",
        provider="anthropic",
        model="claude-opus-4-7",
        effort="high",
        reason=NextOrchestratorReason(
            code="continue-current-trajectory",
            specifics=(
                "harness fixture: continue with the same orchestrator "
                "for the next session"
            ),
        ),
    )


def make_disposition(
    handle: HarnessHandle,
    session_number: int,
    *,
    is_final: bool,
    status: str = "completed",
    summary: Optional[str] = None,
    files_changed: Optional[List[str]] = None,
    commit: bool = True,
) -> None:
    """Write ``disposition.json`` to the session-set root.

    The final session legitimately has no ``next_orchestrator``; the
    ``check_next_orchestrator_present`` gate passes on
    ``currentSession >= totalSessions``. Non-final sessions must
    populate it for the gate to pass.

    *summary* defaults to a deterministic per-session string. *files_changed*
    defaults to an empty list — the working-tree gate ignores
    untracked files outside the session set anyway, and the harness
    commits state-file changes itself, so the disposition typically
    doesn't need to declare a surface.
    """
    disposition = Disposition(
        status=status,
        summary=summary or f"harness session {session_number} closed",
        verification_method="manual-via-other-engine",
        files_changed=files_changed or [],
        verification_message_ids=[],
        next_orchestrator=None if is_final else _default_next_orchestrator(),
        blockers=[],
    )
    write_disposition(str(handle.set_dir), disposition)
    if commit:
        _commit_and_push(
            handle,
            f"session {session_number}: disposition",
        )


# ---------------------------------------------------------------------------
# Activity log authoring
# ---------------------------------------------------------------------------


def _activity_log_path(handle: HarnessHandle) -> Path:
    return handle.set_dir / "activity-log.json"


def make_activity_log_entry(
    handle: HarnessHandle,
    session_number: int,
    *,
    description: str = "harness work step",
    commit: bool = True,
) -> None:
    """Append a single entry for *session_number* to ``activity-log.json``.

    The close-out gate ``check_activity_log_entry`` requires at least
    one entry whose ``sessionNumber`` matches the current session. A
    single deterministic entry per session is enough; tests that care
    about multi-step orchestrator behavior call this helper multiple
    times.

    The file is created on first call with the session-set metadata
    block. Subsequent calls append to ``entries[]`` and bump the
    step number.
    """
    path = _activity_log_path(handle)
    if path.is_file():
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = {
            "sessionSetName": handle.slug,
            "createdDate": "2026-05-16T00:00:00-04:00",
            "totalSessions": handle.total_sessions,
            "entries": [],
        }

    entries = data.setdefault("entries", [])
    step_number = (
        max(
            (
                e.get("stepNumber", 0)
                for e in entries
                if e.get("sessionNumber") == session_number
            ),
            default=0,
        )
        + 1
    )
    entries.append({
        "sessionNumber": session_number,
        "stepNumber": step_number,
        "stepKey": f"session-{session_number}/step-{step_number}",
        "dateTime": "2026-05-16T01:00:00-04:00",
        "description": description,
        "status": "complete",
        "routedApiCalls": [],
    })

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

    if commit:
        _commit_and_push(
            handle,
            f"session {session_number}: activity log entry",
        )


# ---------------------------------------------------------------------------
# Change-log authoring
# ---------------------------------------------------------------------------


def make_change_log(
    handle: HarnessHandle,
    summary: str = "harness session set close-out",
    *,
    final_session_number: Optional[int] = None,
    commit: bool = True,
) -> None:
    """Write ``change-log.md`` for the final session of the set.

    ``check_change_log_fresh`` fires only on the final session and
    accepts either a fresh mtime OR a body that references the
    current session number. The body deliberately mentions "Session N"
    so the content-based predicate passes regardless of clock skew
    between the fixture and the gate's mtime probe.
    """
    n = final_session_number if final_session_number is not None else handle.total_sessions
    (handle.set_dir / "change-log.md").write_text(
        f"# Change Log — {handle.slug}\n\n"
        f"Session {n} of {handle.total_sessions}: {summary}\n",
        encoding="utf-8",
    )
    if commit:
        _commit_and_push(handle, f"session {n}: change-log")


# ---------------------------------------------------------------------------
# drive_close_session
# ---------------------------------------------------------------------------


def drive_close_session(
    handle: HarnessHandle,
    session_number: int,
    *,
    reason: str = "harness close-out: manual verification attested",
    extra_args: Optional[List[str]] = None,
    commit_after: bool = True,
    force: bool = False,
    inject_force_env: bool = True,
) -> subprocess.CompletedProcess:
    """Invoke ``python -m ai_router.close_session`` via subprocess.

    Uses ``--manual-verify --reason-file <tmp>`` by default, matching
    the zero-budget verification path described in the spec.

    The reason file is written inside ``handle.repo_root`` so it can
    be committed alongside the state changes — leaving it untracked
    would dirty the working tree (the ignore-pattern list does not
    cover ad-hoc fixture files), which is fine for the close-out
    being driven (the file is created before close-out runs) but
    would block subsequent sessions' close-outs.

    Returns the subprocess CompletedProcess unmodified. Callers
    decide what to do with non-zero exit codes — happy-path tests
    assert ``returncode == 0``; failure-path tests assert on the
    specific exit code and stderr content.
    """
    reasons_dir = handle.repo_root / ".harness-reasons"
    reasons_dir.mkdir(exist_ok=True)
    reason_path = reasons_dir / f"session-{session_number}.txt"
    reason_path.write_text(reason + "\n", encoding="utf-8")

    args = [
        sys.executable,
        "-m",
        "ai_router.close_session",
        "--session-set-dir",
        str(handle.set_dir),
    ]
    # --force and --manual-verify are mutually incompatible; force-close
    # bypasses verification entirely and requires only --reason-file for
    # the forensic audit trail.
    if not force:
        args.append("--manual-verify")
    args.extend(["--reason-file", str(reason_path), "--json"])
    if force:
        args.append("--force")
    if extra_args:
        args.extend(extra_args)

    env = _subprocess_env()
    # Always strip the force-close env var so a dev-shell value never leaks
    # into tests. Inject it only when explicitly requested so the guard test
    # (inject_force_env=False) sees the absent-variable rejection path.
    env.pop("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", None)
    if force and inject_force_env:
        env["AI_ROUTER_ALLOW_FORCE_CLOSE_OUT"] = "1"

    proc = subprocess.run(
        args,
        cwd=str(handle.repo_root),
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )

    if commit_after and proc.returncode == 0:
        _commit_and_push(handle, f"session {session_number}: close_session")

    return proc


# ---------------------------------------------------------------------------
# Read helpers
# ---------------------------------------------------------------------------


def read_state(handle: HarnessHandle) -> Dict[str, Any]:
    """Return the parsed ``session-state.json`` for the fixture.

    Returns an empty dict when the file is missing (the helper is
    typed for the in-flight case; missing-file assertions should
    use ``handle.set_dir`` directly to check existence).

    Set 047 Session 4: routes through :func:`progress.normalize_to_v4_shape`
    so a v4 on-disk file (where the v3 top-level fields like
    ``currentSession`` / ``totalSessions`` / ``completedSessions`` /
    ``orchestrator`` / ``startedAt`` / ``completedAt`` /
    ``verificationVerdict`` are dropped) reads identically to a v3
    file for tests that assert against the derived top-level
    view. Tests that want to inspect the raw on-disk bytes use
    :func:`read_raw_state` below.
    """
    state = read_session_state(str(handle.set_dir))
    if not isinstance(state, dict):
        return {}
    try:
        # Lazy import to avoid bringing progress in if the helper is
        # called against a missing or unreadable file.
        try:
            from progress import normalize_to_v4_shape  # type: ignore[import-not-found]
        except ImportError:
            from ai_router.progress import normalize_to_v4_shape  # type: ignore[no-redef]
        spec_md_path = Path(handle.set_dir) / "spec.md"
        return normalize_to_v4_shape(state, spec_md_path)
    except Exception:
        return state


def read_raw_state(handle: HarnessHandle) -> Dict[str, Any]:
    """Return the raw on-disk ``session-state.json`` for the fixture.

    Set 047 Session 4 companion to :func:`read_state` — bypasses the
    v4 normalize shim so tests can assert against the literal v4
    on-disk shape (no derived top-level fields). Use this when the
    test cares about the exact bytes on disk; use :func:`read_state`
    when the test cares about the logical state regardless of the
    schema version the writer happened to land on.

    Set 047 Session 4 verifier Important 1 fix: the initial draft
    of this helper called :func:`read_session_state` (the shim-routed
    reader), which would have masked any v4-on-disk-shape regression.
    Route through :func:`read_raw_session_state` instead so the
    helper actually delivers what its name promises.
    """
    try:
        try:
            from session_state import read_raw_session_state  # type: ignore[import-not-found]
        except ImportError:
            from ai_router.session_state import read_raw_session_state  # type: ignore[no-redef]
    except ImportError:
        # Fallback: the helper exists in every Set 047+ checkout but
        # is absent from pre-Set-047 trees. Fall back to a direct
        # JSON read in that case so the fixture still works against
        # historical checkouts.
        import json as _json
        path = handle.set_dir / "session-state.json"
        if not path.is_file():
            return {}
        try:
            data = _json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
        return data if isinstance(data, dict) else {}
    state = read_raw_session_state(str(handle.set_dir))
    return state if isinstance(state, dict) else {}


def read_events(handle: HarnessHandle):
    """Return the parsed events ledger as a list of ``Event`` dataclasses.

    Delegates to the production reader so tests stay aligned with the
    shape the orchestrator's own consumers see. A missing or empty
    ledger surfaces as an empty list.
    """
    return _read_events_raw(str(handle.set_dir))


# ---------------------------------------------------------------------------
# Cancel / restore helpers
# ---------------------------------------------------------------------------


def cancel_set(
    handle: HarnessHandle,
    reason: str = "",
    *,
    commit: bool = True,
) -> None:
    """Cancel the session set and optionally commit the cancellation marker.

    Delegates to the production ``cancel_session_set`` so the on-disk
    shape (CANCELLED.md header, preCancelStatus) is byte-for-byte
    identical to what an operator's VS Code command would produce.
    """
    cancel_session_set(str(handle.set_dir), reason)
    if commit:
        short = reason[:40] or "no reason"
        _commit_and_push(handle, f"cancel: {short}")


def restore_set(
    handle: HarnessHandle,
    reason: str = "",
    *,
    commit: bool = True,
) -> None:
    """Restore the session set and optionally commit the restore marker.

    Delegates to the production ``restore_session_set``. Raises
    ``FileNotFoundError`` (from the production helper) when called on
    a set that has not been cancelled — tests that exercise this error
    path should call ``restore_session_set`` directly.
    """
    restore_session_set(str(handle.set_dir), reason)
    if commit:
        short = reason[:40] or "no reason"
        _commit_and_push(handle, f"restore: {short}")


# ---------------------------------------------------------------------------
# Sibling-worktree helper
# ---------------------------------------------------------------------------


def make_sibling_worktree(handle: HarnessHandle, slug: str) -> Path:
    """Add a canonical sibling worktree at ``<repo>-worktrees/<slug>/``.

    Creates the ``<repo>-worktrees/`` container alongside the primary
    working tree and runs ``git worktree add`` with branch
    ``session-set/<slug>`` — the naming convention that
    ``worktree.enumerate_worktrees`` classifies as "canonical". The
    new working tree starts from the current HEAD of the primary.

    Returns the absolute path of the new working tree root.
    """
    worktrees_dir = handle.repo_root.parent / f"{handle.repo_root.name}-worktrees"
    worktrees_dir.mkdir(exist_ok=True)
    wt_path = worktrees_dir / slug
    _git(
        handle.repo_root,
        "worktree",
        "add",
        str(wt_path),
        "-b",
        f"session-set/{slug}",
    )
    return wt_path


# ---------------------------------------------------------------------------
# Multi-set helper
# ---------------------------------------------------------------------------


def make_additional_set(
    base_handle: HarnessHandle,
    new_slug: str,
    new_total_sessions: int,
) -> "HarnessHandle":
    """Add a second (or third …) session set to an existing fixture repo.

    Creates ``docs/session-sets/<new_slug>/`` under the same git
    working tree as *base_handle*, drops a spec.md and a not-started
    state file, commits, and returns a new HarnessHandle pointing at
    the new set. The handle shares the same repo_root and bare_remote
    as *base_handle* so all subsequent ``drive_start_session`` /
    ``drive_close_session`` calls operate on the same git history —
    which is the point: boundary-hygiene tests can assert that
    close-out for set A leaves set B's state file untouched.
    """
    set_dir = base_handle.repo_root / "docs" / "session-sets" / new_slug
    set_dir.mkdir(parents=True)
    _write_spec(set_dir, new_slug, new_total_sessions)
    synthesize_not_started_state(str(set_dir))
    _git(base_handle.repo_root, "add", "-A")
    _git(
        base_handle.repo_root,
        "commit",
        "-m",
        f"add fixture session set {new_slug}",
    )
    _git(base_handle.repo_root, "push", "origin", "main")
    return HarnessHandle(
        repo_root=base_handle.repo_root,
        set_dir=set_dir,
        bare_remote=base_handle.bare_remote,
        slug=new_slug,
        total_sessions=new_total_sessions,
        engine=base_handle.engine,
        model=base_handle.model,
        provider=base_handle.provider,
        effort=base_handle.effort,
    )
