"""The five close gates. Exactly five — each one paid for by a concrete v1
incident, and no gate guards another gate:

- ``verification_clean``: the 2026-07-06 bypass (a hand-written
  ``manual`` method + self-attested VERIFIED closed a session with no real
  verification) and the 84 firings of v1's backstop stack. v2 reads the
  machine-only ledger instead of corroborating a hand-writable record.
- ``working_tree_clean``: 41 real firings — "forgot to git add".
- ``pushed_to_remote``: 29 real firings — work stranded local.
- ``test_run_fresh``: 5 firings — a close on code the suite never saw.
- ``verdict_vocabulary``: the 2026-07-08 incident — a confabulated
  ``manual-override-development`` persisted and every reader rendered it.

A predicate that raises is recorded as a failed gate with the exception
text — a buggy gate must not wedge every close in the repo. ``--force``
skips the bookkeeping gates, never the evidence gates.
"""

from __future__ import annotations

import fnmatch
import os
from dataclasses import dataclass
from pathlib import Path

from .evidence import (
    changed_paths_between,
    detect_out_of_band_write,
    is_machine_state_path,
    repo_root_for,
    run_git,
    snapshot_worktree_tree,
)
from .ledger import (
    LIFECYCLE_WRITTEN_SET_FILES,
    ROW_REMEDIATED_AT_CAP,
    LedgerError,
    read_rounds,
)
from .progress import read_session_state
from .verdict import SESSION_VERDICTS

# Basenames that legitimately appear dirty during a close: editor noise
# plus the close machinery's own lock.
_IGNORE_BASENAME_PATTERNS = (
    ".DS_Store", "*.swp", "*~", "Thumbs.db", "desktop.ini",
    ".lifecycle.lock",
)

# Set-dir files the close itself commits after the flip. The lifecycle
# lock is deliberately absent: it is still held during the close commit
# and deleted on release, so committing it leaves every close behind a
# tracked-deletion dirty tree.
SET_BOOKKEEPING_COMMIT_BASENAMES = LIFECYCLE_WRITTEN_SET_FILES

# What may legitimately be dirty in the set dir at close time: the files
# the close will commit, plus the lock the close itself is holding.
_SET_BOOKKEEPING_BASENAMES = (
    frozenset(SET_BOOKKEEPING_COMMIT_BASENAMES) | {".lifecycle.lock"}
)

EVIDENCE_GATES = frozenset({"verification_clean", "verdict_vocabulary"})


@dataclass(frozen=True)
class GateResult:
    name: str
    passed: bool
    remediation: str = ""


def _verify_command(set_dir) -> str:
    return f"python -m ai_router.verify --session-set-dir {set_dir}"


def _current_session(set_dir):
    state = read_session_state(set_dir)
    if not state:
        return None
    return state.get("currentSession")


# --- The five predicates -----------------------------------------------------

def check_verification_clean(set_dir) -> tuple:
    """The run ledger says the latest round is non-blocking, the worktree
    has not changed since that round (outside the set's own bookkeeping),
    and session-state.json was written only by the sanctioned writers.

    A blocking latest round is the *unresolved* terminal state: nothing
    lands but the record. A ``remediated_at_cap`` row is the other cap
    terminal — it is non-blocking, so it passes here, and the gate says so
    out loud rather than letting unreviewed work read as verified."""
    set_path = Path(set_dir)
    root = repo_root_for(set_path)
    if root is None:
        return False, f"not inside a git repository: {set_path}"

    # The integrity axis runs first and short-circuits: a hand-edited
    # state file must surface as itself, not as whatever downstream
    # confusion it causes.
    oob = detect_out_of_band_write(set_path, root, require_record=True)
    if oob:
        return False, (
            f"session-state integrity: {oob}. State files are written by "
            "the router, never by hand."
        )

    current = _current_session(set_path)
    if current is None:
        return False, f"no session is in flight under {set_path}"

    try:
        rounds = read_rounds(root, set_path.name, current)
    except LedgerError as exc:
        return False, (
            f"the run ledger is unreadable or invalid ({exc}); failing "
            "closed rather than trusting a tampered record"
        )
    if not rounds:
        return False, (
            "no verification round is recorded for session "
            f"{current}. Cross-provider verification is mandatory; run: "
            + _verify_command(set_path)
        )
    latest = rounds[-1]
    if latest.get("blocking"):
        return False, (
            f"round {latest['round']} ended with blocking findings "
            f"({latest.get('verdict')}); remediate and re-run: "
            + _verify_command(set_path)
            + " — at the round cap that same command records the terminal "
            "state instead of opening a round, and an unresolved session "
            "lands nothing but its record"
        )

    current_tree = snapshot_worktree_tree(root)
    if current_tree is None:
        return False, "could not snapshot the working tree (failing closed)"
    changed = changed_paths_between(
        root, latest["completion_tree"], current_tree
    )
    if changed is None:
        return False, (
            "could not diff the working tree against the verified round "
            "(failing closed)"
        )
    try:
        set_rel = os.path.relpath(str(set_path), root).replace("\\", "/")
    except ValueError:
        set_rel = str(set_path)
    material = [
        p for p in changed
        if not (
            p.replace("\\", "/").startswith(set_rel + "/")
            and p.replace("\\", "/").rsplit("/", 1)[-1]
            in _SET_BOOKKEEPING_BASENAMES
        )
    ]
    if material:
        preview = ", ".join(material[:5])
        suffix = f" (+{len(material) - 5} more)" if len(material) > 5 else ""
        return False, (
            f"the working tree changed after verification round "
            f"{latest['round']}: {preview}{suffix}. Re-run: "
            + _verify_command(set_path)
        )
    if latest.get("type") == ROW_REMEDIATED_AT_CAP:
        remediated = latest.get("remediated") or {}
        count = len(remediated.get("findings") or [])
        return True, (
            f"remediated at the cap: {count} blocking finding(s) from "
            f"round {remediated.get('reviewed_round')} each had their "
            "cited site changed, and the cap left the fix unreviewed. THIS "
            "WORK LANDS UNREVIEWED — no verifier saw the repair. It is not "
            "a waiver: nothing was accepted over a standing finding"
        )
    return True, ""


def material_worktree_changes(set_dir) -> tuple:
    """``(paths, error)``: the working-tree changes that are the session's
    work rather than the record of it.

    Editor noise, the run ledger and the set's own lifecycle bookkeeping
    are not work. Two callers ask this: the close, which refuses to land
    uncommitted work, and the task declaration, which refuses to be made
    after work exists.
    """
    set_path = Path(set_dir)
    root = repo_root_for(set_path)
    if root is None:
        return [], f"not inside a git repository: {set_path}"
    # -uall expands collapsed untracked directories to per-file entries;
    # a single umbrella row would defeat the ignore filter.
    rc, out, err = run_git(root, "status", "--porcelain", "-uall")
    if rc != 0:
        return [], f"git status failed: {err or 'unknown error'}"
    try:
        set_rel = os.path.relpath(str(set_path), root).replace("\\", "/")
    except ValueError:
        set_rel = str(set_path)
    blocking = []
    for line in out.splitlines():
        if len(line) < 4:
            continue
        path = line[3:]
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        path = path.strip().strip('"').replace("\\", "/")
        basename = path.rsplit("/", 1)[-1]
        if any(
            fnmatch.fnmatch(basename, pattern)
            for pattern in _IGNORE_BASENAME_PATTERNS
        ):
            continue
        if (
            path.startswith(set_rel + "/")
            and basename in _SET_BOOKKEEPING_BASENAMES
        ):
            continue  # the close commits its own bookkeeping after the flip
        if is_machine_state_path(path):
            continue  # the run ledger is the record, not the work
        blocking.append(path)
    return blocking, ""


def preview_paths(paths) -> str:
    preview = ", ".join(paths[:5])
    return preview + (f" (+{len(paths) - 5} more)" if len(paths) > 5 else "")


def check_working_tree_clean(set_dir) -> tuple:
    blocking, error = material_worktree_changes(set_dir)
    if error:
        return False, error
    if not blocking:
        return True, ""
    return False, (
        f"working tree has uncommitted changes: {preview_paths(blocking)}"
    )


_PUSH_FAILURE_SIGNALS = (
    ("non-fast-forward", "non-fast-forward; rebase or pull --rebase first"),
    ("rejected", "remote rejected the push (branch protection or non-FF)"),
    ("protected branch", "remote rejected the push (branch protected)"),
    ("denied", "remote denied the push (permissions or branch protection)"),
)


def _has_remote(repo_root) -> bool:
    rc, out, _ = run_git(repo_root, "remote")
    if rc != 0:
        return True  # a remote may exist; the waiver needs an affirmative no
    return bool(out.strip())


def check_pushed_to_remote(set_dir) -> tuple:
    root = repo_root_for(Path(set_dir))
    if root is None:
        return False, f"not inside a git repository: {set_dir}"
    rc, head_ref, _ = run_git(root, "symbolic-ref", "--short", "HEAD")
    if rc != 0:
        return False, "HEAD is detached; check out a branch before close-out"
    rc, upstream, _ = run_git(
        root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"
    )
    if rc != 0:
        if os.path.isfile(
            os.path.join(root, ".dabbler", "local-only")
        ) and not _has_remote(root):
            return True, (
                "local-only repo: push gate waived (.dabbler/local-only "
                "marker present, no remote configured)"
            )
        return False, (
            f"branch {head_ref!r} has no upstream; run: "
            f"git push --set-upstream <remote> {head_ref}"
        )
    rc, out, _ = run_git(root, "rev-list", "--count", "@{u}..HEAD")
    try:
        ahead = int(out) if rc == 0 else 0
    except ValueError:
        ahead = 0
    if ahead == 0:
        return True, ""
    rc, _, err = run_git(root, "push", "--dry-run", "--porcelain")
    if rc != 0:
        lowered = (err or "").lower()
        for signal, remediation in _PUSH_FAILURE_SIGNALS:
            if signal in lowered:
                return False, remediation
        first = (err or "").splitlines()[0] if err else "unknown error"
        return False, f"git push --dry-run failed: {first}"
    return False, (
        f"branch {head_ref!r} is {ahead} commit(s) ahead of {upstream}; "
        "run: git push"
    )


def _governing_config(set_dir):
    """The configuration that actually governs *set_dir*'s repository.

    The ambient config describes the repository the router was invoked in.
    A session set living in a different repository never made those
    declarations, and gating it against them would demand a run of record
    for suites that repository does not have. Only the alternative is worse:
    a repository silently gated by another's testing policy."""
    from .config import load_config, project_root

    set_root = repo_root_for(Path(set_dir))
    ambient = project_root()
    if set_root is None or ambient is None:
        return None
    try:
        if Path(set_root).resolve() != Path(ambient).resolve():
            return None
        return load_config()
    except Exception:
        return None


def check_test_run_fresh(set_dir, config=None) -> tuple:
    from .test_evidence import evaluate_freshness, load_suites_checked

    if config is None:
        config = _governing_config(set_dir)
    loaded = load_suites_checked(config)
    if loaded.errors:
        # "No expensive suites declared" and "every declared suite was a
        # typo and got dropped" must never be indistinguishable.
        return False, (
            "the test-suite declaration is malformed, so the suites this "
            "session owes cannot be determined; fix testing.suites in "
            "router-config.yaml — " + "; ".join(loaded.errors)
        )
    if not any(s.expensive for s in loaded.suites):
        return True, ""
    verdicts = evaluate_freshness(set_dir, None, list(loaded.suites))
    failures = [v for v in verdicts if v.required and not v.passed]
    if not failures:
        return True, ""
    return False, "; ".join(f"{v.suite}: {v.reason}" for v in failures)


def check_verdict_vocabulary(set_dir) -> tuple:
    """Every persisted verdict token is exactly in the closed allowlist.
    Absence of rounds is verification_clean's finding, not this gate's —
    double-reporting one root cause is worse than silence."""
    set_path = Path(set_dir)
    root = repo_root_for(set_path)
    current = _current_session(set_path)
    tokens = []
    if root is not None and current is not None:
        try:
            rounds = read_rounds(root, set_path.name, current)
        except LedgerError:
            rounds = []
        if rounds:
            tokens.append(("run ledger", rounds[-1].get("verdict")))
    state = read_session_state(set_path)
    if state:
        for record in state.get("sessions") or []:
            if record.get("number") == current and record.get(
                "verificationVerdict"
            ) is not None:
                tokens.append(
                    ("session-state", record["verificationVerdict"])
                )
    for source, token in tokens:
        if str(token).strip() not in SESSION_VERDICTS:
            return False, (
                f"{source} carries verdict {token!r}, which is not in the "
                f"closed vocabulary {sorted(SESSION_VERDICTS)}. Verdicts "
                "are written by the router, never invented — a free-form "
                "token (the v1 'manual-override-development' incident) or "
                "a prefix look-alike never closes a session."
            )
    return True, ""


# --- Driver -----------------------------------------------------------------

GATE_CHECKS = (
    ("verification_clean", check_verification_clean),
    ("working_tree_clean", check_working_tree_clean),
    ("pushed_to_remote", check_pushed_to_remote),
    ("test_run_fresh", check_test_run_fresh),
    ("verdict_vocabulary", check_verdict_vocabulary),
)


def run_gates(set_dir, *, forced: bool = False, config=None) -> list:
    """All five gate rows (or only the evidence gates under ``forced`` —
    force bypasses bookkeeping, never evidence). A predicate that raises
    becomes a failed row carrying the exception text."""
    results = []
    for name, predicate in GATE_CHECKS:
        if forced and name not in EVIDENCE_GATES:
            results.append(GateResult(
                name, True, "skipped by --force (bookkeeping gate)"
            ))
            continue
        try:
            if name == "test_run_fresh":
                passed, remediation = predicate(set_dir, config)
            else:
                passed, remediation = predicate(set_dir)
        except Exception as exc:  # a buggy gate must not wedge every close
            passed, remediation = False, (
                f"gate crashed ({type(exc).__name__}: {exc}); failing closed"
            )
        results.append(GateResult(name, bool(passed), remediation))
    return results
