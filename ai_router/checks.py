"""Declared checks: what to run for this change, how to run it, and what the
run of it proves.

Two stages and one executor. ``targeted`` runs the tests a change makes
necessary plus the cheap deterministic controls that cover it; ``final-full``
runs the relevant complete suites once, as the run's final proof. The
separation exists to delete one specific expense — a full suite bought before
anyone knows whether the change is right — so this module refuses to accept a
complete suite as targeted evidence outside the three declared exceptions.

Every check is judged against a Git tree id, not against "the worktree". A
command that changes the tree it was measuring has invalidated its own
result, and that is recorded rather than rounded off.
"""

from __future__ import annotations

import os
import shlex
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .affected import (
    RISK_SELECTION_UNKNOWN,
    SelectionResult,
    load_selection_config,
    select_tests,
    targeted_command,
)
from .evidence import changed_paths_between, snapshot_worktree_tree
from .journal import write_heartbeat
from .test_evidence import matching_prefixes

STAGE_TARGETED = "targeted"
STAGE_FINAL_FULL = "final-full"
STAGES = (STAGE_TARGETED, STAGE_FINAL_FULL)

OUTCOME_PASSED = "passed"
OUTCOME_FAILED = "failed"

CONTROL_KINDS = frozenset({"compile", "typecheck", "lint", "analyzer"})

SUITE_FIELDS = frozenset({
    "name", "command", "argv", "covers", "cwd", "expensive", "small",
    "timeout_seconds",
})
CONTROL_FIELDS = frozenset({
    "name", "kind", "command", "argv", "covers", "cwd", "required",
    "timeout_seconds",
})

# Why a full suite was allowed at the targeted stage. Anything else is a
# refusal: unknown selection is not permission to run everything.
FULL_ALLOWED_SMALL = "suite-declared-small"
FULL_ALLOWED_ALL_AFFECTED = "all-tests-affected"
FULL_ALLOWED_OPERATOR = "operator-override"

HEARTBEAT_INTERVAL_SECONDS = 15.0


class CheckConfigError(ValueError):
    """A declaration error. Refused at load: a check nobody can run and a
    check nobody declared must never look the same."""


@dataclass(frozen=True)
class Check:
    name: str
    argv: tuple = ()
    command: str = ""
    covers: tuple = ()
    cwd: str = ""
    required: bool = True
    kind: str = "suite"
    small: bool = False
    timeout_seconds: Optional[float] = None

    @property
    def is_suite(self) -> bool:
        return self.kind == "suite"

    def display_command(self) -> str:
        return self.command or " ".join(self.argv)


@dataclass(frozen=True)
class CheckRun:
    check: Check
    stage: str
    command: str
    tree_digest: str
    post_tree_digest: Optional[str]
    tree_mutated: bool
    exit_code: Optional[int]
    duration_seconds: float
    timed_out: bool
    outcome: str
    selection: dict
    output: str = ""

    @property
    def green(self) -> bool:
        return self.outcome == OUTCOME_PASSED and not self.tree_mutated

    @property
    def blocks(self) -> bool:
        return self.check.required and not self.green


@dataclass(frozen=True)
class CheckPlan:
    stage: str
    tree_digest: str
    checks: tuple = ()
    selection: SelectionResult = field(default_factory=SelectionResult)
    changed_paths: tuple = ()
    covered_paths: tuple = ()
    full_allowed_reason: str = ""


# --- Declarations -----------------------------------------------------------

def _normalize_covers(entries, label: str) -> tuple:
    covers = []
    for entry in entries:
        normalized = str(entry).replace("\\", "/").strip()
        if not normalized:
            raise CheckConfigError(f"{label}.covers has an empty entry")
        if "*" in normalized or "?" in normalized:
            raise CheckConfigError(
                f"{label}.covers entry {entry!r} uses a glob; v1 accepts a "
                "directory prefix ending in '/' or an exact file path."
            )
        covers.append(normalized.lstrip("./"))
    return tuple(covers)


def _entry_command(entry: dict, label: str) -> tuple:
    has_command = isinstance(entry.get("command"), str) and entry["command"].strip()
    argv = entry.get("argv")
    has_argv = isinstance(argv, list) and argv
    if has_command and has_argv:
        raise CheckConfigError(
            f"{label} declares both 'command' and 'argv'; a check has one "
            "way to run."
        )
    if not has_command and not has_argv:
        raise CheckConfigError(
            f"{label} declares neither 'command' nor 'argv'."
        )
    if has_argv and not all(isinstance(a, str) and a for a in argv):
        raise CheckConfigError(f"{label}.argv must be non-empty strings")
    return (
        tuple(argv) if has_argv else (),
        entry["command"].strip() if has_command else "",
    )


def load_checks(config: dict) -> tuple:
    """Every declared suite and control, or a :class:`CheckConfigError`.

    Repository configuration is trusted input, so a legacy ``command``
    string still runs through the platform shell; new declarations use
    ``argv`` and are executed directly.
    """
    testing = (config.get("testing") or {})
    checks: list = []
    names: set = set()

    for index, entry in enumerate(testing.get("suites") or []):
        label = f"testing.suites[{index}]"
        if not isinstance(entry, dict):
            raise CheckConfigError(f"{label} must be a mapping")
        unknown = sorted(set(entry) - SUITE_FIELDS)
        if unknown:
            raise CheckConfigError(f"{label} has unknown key(s) {unknown}")
        name = str(entry.get("name") or "").strip()
        if not name:
            raise CheckConfigError(f"{label}.name must be a non-empty string")
        if name in names:
            raise CheckConfigError(f"{label}.name {name!r} is declared twice")
        names.add(name)
        argv, command = _entry_command(entry, label)
        checks.append(Check(
            name=name, argv=argv, command=command,
            covers=_normalize_covers(entry.get("covers") or [], label),
            cwd=str(entry.get("cwd") or ""),
            required=True,  # a suite is always required
            kind="suite",
            small=bool(entry.get("small")),
            timeout_seconds=entry.get("timeout_seconds"),
        ))

    for index, entry in enumerate(testing.get("controls") or []):
        label = f"testing.controls[{index}]"
        if not isinstance(entry, dict):
            raise CheckConfigError(f"{label} must be a mapping")
        unknown = sorted(set(entry) - CONTROL_FIELDS)
        if unknown:
            raise CheckConfigError(f"{label} has unknown key(s) {unknown}")
        name = str(entry.get("name") or "").strip()
        if not name:
            raise CheckConfigError(f"{label}.name must be a non-empty string")
        if name in names:
            raise CheckConfigError(f"{label}.name {name!r} is declared twice")
        names.add(name)
        kind = str(entry.get("kind") or "").strip()
        if kind not in CONTROL_KINDS:
            raise CheckConfigError(
                f"{label}.kind {kind!r} is not one of {sorted(CONTROL_KINDS)}"
            )
        argv, command = _entry_command(entry, label)
        checks.append(Check(
            name=name, argv=argv, command=command,
            covers=_normalize_covers(entry.get("covers") or [], label),
            cwd=str(entry.get("cwd") or ""),
            required=bool(entry.get("required", True)),
            kind=kind,
            timeout_seconds=entry.get("timeout_seconds"),
        ))

    return tuple(checks)


def covers_any(check: Check, changed_paths) -> bool:
    """Prefix entries end in ``/``; every other entry is an exact file."""
    for path in changed_paths:
        for entry in check.covers:
            if entry.endswith("/"):
                if matching_prefixes(path, (entry.rstrip("/"),)):
                    return True
            elif path == entry:
                return True
    return False


# --- Planning ---------------------------------------------------------------

def changed_paths(root, base_commit: str, tree_digest: str) -> tuple:
    paths = changed_paths_between(root, base_commit, tree_digest)
    if paths is None:
        return ()
    return tuple(sorted(paths))


def plan(
    root,
    config: dict,
    *,
    stage: str,
    tree_digest: str,
    base_commit: str,
    allow_full_reason: str = "",
) -> CheckPlan:
    """Which declared checks this tree needs, with the command for each.

    Relevance is `covers`: a suite or control that covers nothing the change
    touched is not run, and a change no declared check covers at all is the
    §5.3 ``no-declared-check`` condition rather than a reason to run
    everything.
    """
    if stage not in STAGES:
        raise ValueError(f"unknown stage {stage!r}")
    declared = load_checks(config)
    touched = changed_paths(root, base_commit, tree_digest)
    covered = tuple(
        path for path in touched
        if any(covers_any(c, (path,)) for c in declared)
    )

    selection_result = SelectionResult()
    if stage == STAGE_TARGETED:
        loaded = load_selection_config(config)
        if loaded.errors:
            raise CheckConfigError(
                "testing.selection is invalid: " + "; ".join(loaded.errors)
            )
        selection_result = select_tests(root, touched, loaded.config)

    planned, full_reason = [], ""
    for check in declared:
        if not covers_any(check, touched):
            continue
        if stage == STAGE_FINAL_FULL:
            if check.is_suite:
                planned.append((check, check.display_command()))
            continue
        if not check.is_suite:
            planned.append((check, check.display_command()))
            continue
        command, reason = _targeted_suite_command(
            check, selection_result, allow_full_reason
        )
        if command:
            planned.append((check, command))
            full_reason = full_reason or reason

    return CheckPlan(
        stage=stage, tree_digest=tree_digest, checks=tuple(planned),
        selection=selection_result, changed_paths=touched,
        covered_paths=covered, full_allowed_reason=full_reason,
    )


def _targeted_suite_command(check: Check, result: SelectionResult,
                            allow_full_reason: str) -> tuple:
    """``(command, full-allowed reason)``; an empty command means this suite
    contributes nothing to the targeted stage for this change."""
    base = check.display_command()
    if result.all_tests_affected:
        return base, FULL_ALLOWED_ALL_AFFECTED
    if check.small:
        return base, FULL_ALLOWED_SMALL
    if allow_full_reason:
        return base, FULL_ALLOWED_OPERATOR
    return targeted_command(base, result), ""


def selection_unknown_paths(result: SelectionResult) -> tuple:
    return tuple(
        r.path for r in result.risks if r.kind == RISK_SELECTION_UNKNOWN
    )


# --- Execution --------------------------------------------------------------

def _terminate_tree(process) -> None:
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(process.pid)],
            capture_output=True,
        )
    else:
        import signal

        try:
            os.killpg(os.getpgid(process.pid), signal.SIGKILL)
        except OSError:
            process.kill()


def _spawn(check: Check, command: str, cwd: Path):
    if check.command:
        # A declared shell string is trusted repository configuration and
        # keeps working byte-for-byte; nothing here infers shell mode.
        return subprocess.Popen(
            command, shell=True, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, text=True, encoding="utf-8",
            errors="replace", cwd=str(cwd),
            **({} if os.name == "nt" else {"start_new_session": True}),
        )
    argv = shlex.split(command) if command != " ".join(check.argv) else list(check.argv)
    return subprocess.Popen(
        argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        encoding="utf-8", errors="replace", cwd=str(cwd),
        **({} if os.name == "nt" else {"start_new_session": True}),
    )


def execute(
    root,
    check: Check,
    command: str,
    *,
    stage: str,
    tree_digest: str,
    timeout_seconds: float,
    run_id: str = "",
    selection: dict = None,
) -> CheckRun:
    """Run one declared check and measure what it did to the tree.

    The process is a coordinator while its child lives, so a long suite is
    observably active rather than looking stalled. A command that mutates
    the candidate tree fails the check whatever its exit code said: it did
    not measure the tree anyone is about to commit.
    """
    cwd = Path(root) / check.cwd if check.cwd else Path(root)
    started = time.monotonic()
    timed_out = False
    process = _spawn(check, command, cwd)
    chunks: list = []
    deadline = started + timeout_seconds
    try:
        while True:
            try:
                chunks.append(process.communicate(timeout=HEARTBEAT_INTERVAL_SECONDS)[0])
                break
            except subprocess.TimeoutExpired:
                if run_id:
                    write_heartbeat(root, run_id, f"check/{check.name}")
                if time.monotonic() >= deadline:
                    timed_out = True
                    _terminate_tree(process)
                    try:
                        chunks.append(process.communicate(timeout=30)[0])
                    except subprocess.TimeoutExpired:
                        pass
                    break
    finally:
        if process.poll() is None:
            _terminate_tree(process)

    duration = time.monotonic() - started
    exit_code = None if timed_out else process.returncode
    post = snapshot_worktree_tree(root)
    mutated = post != tree_digest
    outcome = (
        OUTCOME_PASSED if (exit_code == 0 and not timed_out and not mutated)
        else OUTCOME_FAILED
    )
    return CheckRun(
        check=check, stage=stage, command=command, tree_digest=tree_digest,
        post_tree_digest=post, tree_mutated=mutated, exit_code=exit_code,
        duration_seconds=round(duration, 3), timed_out=timed_out,
        outcome=outcome, selection=selection or empty_selection(),
        output="".join(c for c in chunks if c),
    )


def empty_selection() -> dict:
    return SelectionResult().to_dict()


def selection_payload(result: SelectionResult, full_reason: str = "") -> dict:
    payload = result.to_dict()
    if full_reason:
        payload["policy"] = full_reason
    return payload


def timeout_for(check: Check, config: dict) -> float:
    if check.timeout_seconds:
        return float(check.timeout_seconds)
    return float(config["run_policy"]["check_timeout_seconds"])
