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

import fnmatch
import os
import shlex
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .journal import MACHINE_DIRNAME, run_git, write_heartbeat

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


# --- The repository's own declarations (moved here from affected.py) ---------
#
# Selection is deterministic: the same changed paths against the same tree
# always yield the same tests, in the same order, with the same reasons. What
# maps to what is declared by the repository in its own configuration, in
# whatever language it is written — an inferred mapping needs a parser per
# ecosystem and buys an optimization on an optimization. A changed path that
# maps to no test is never widened into a full-suite run: it records
# ``selection_unknown``, pulls in the configured smoke tests, and raises a
# risk. Running everything is the expensive way to hide an incomplete mapping.

REASON_CHANGED_TEST = "changed-test"
REASON_CONFIGURED_RULE = "configured-rule"
REASON_SMOKE = "selection-unknown-smoke"

# Strongest first. A test selected by several routes is recorded once, under
# the most specific reason that reached it.
REASON_PRECEDENCE = (
    REASON_CHANGED_TEST, REASON_CONFIGURED_RULE, REASON_SMOKE,
)

RISK_SELECTION_UNKNOWN = "selection_unknown"

SELECTION_FIELDS = frozenset({
    "test_roots", "test_glob", "smoke", "repo_wide", "rules",
})
RULE_FIELDS = frozenset({"when", "select"})


def _posix(path) -> str:
    return str(path).replace("\\", "/").strip("/")


def _normalise_rel(path: str) -> str:
    rel = _posix(str(path)).strip()
    # A "./" PREFIX loop, never lstrip("./"): lstrip strips a character
    # set and would eat the leading dot of ".github/".
    while rel.startswith("./"):
        rel = rel[2:]
    rel = rel.strip("/")
    # "." is the whole-repo prefix; it must match everything, not nothing.
    return "" if rel == "." else rel


def matching_prefixes(rel: str, prefixes) -> tuple:
    """Which declared prefixes cover *rel*, anchored at path boundaries —
    ``a/tests_helper.py`` does not match prefix ``a/tests/``. A prefix that
    normalises to '' (a whole-repo suite) matches everything."""
    rel_n = _normalise_rel(rel)
    hits = []
    for prefix in prefixes:
        p_n = _normalise_rel(prefix)
        if p_n == "" or rel_n == p_n or rel_n.startswith(p_n + "/"):
            hits.append(prefix)
    return tuple(hits)


@dataclass(frozen=True)
class SelectedTest:
    path: str
    reason: str
    selected_by: str


@dataclass(frozen=True)
class SelectionRisk:
    kind: str
    path: str
    detail: str


@dataclass(frozen=True)
class SelectionConfig:
    # Where this repository's tests live and what it calls them. Both are
    # declared: guessing either one is guessing an ecosystem's convention.
    test_roots: tuple = ()
    test_glob: str = ""
    smoke: tuple = ()
    repo_wide: tuple = ()
    rules: tuple = ()  # ((when_prefix, (test_path, ...)), ...)


@dataclass(frozen=True)
class SelectionConfigResult:
    config: SelectionConfig = field(default_factory=SelectionConfig)
    errors: tuple = ()

    @property
    def ok(self) -> bool:
        return not self.errors


@dataclass(frozen=True)
class SelectionResult:
    selected: tuple = ()
    risks: tuple = ()
    all_tests_affected: bool = False
    all_affected_reason: str = ""

    @property
    def test_paths(self) -> tuple:
        return tuple(sorted({s.path for s in self.selected}))

    @property
    def unknown_paths(self) -> tuple:
        return tuple(
            r.path for r in self.risks if r.kind == RISK_SELECTION_UNKNOWN
        )

    def to_dict(self) -> dict:
        return {
            "selected": [
                {"path": s.path, "reason": s.reason,
                 "selectedBy": s.selected_by}
                for s in self.selected
            ],
            "risks": [
                {"kind": r.kind, "path": r.path, "detail": r.detail}
                for r in self.risks
            ],
            "allTestsAffected": self.all_tests_affected,
            "allAffectedReason": self.all_affected_reason,
        }


def load_selection_config(config) -> SelectionConfigResult:
    """The declared selection rules plus every declaration error. A silently
    dropped rule and no rule at all must never look the same: a typo that
    removes a mapping turns real coverage into ``selection_unknown``."""
    if not isinstance(config, dict):
        return SelectionConfigResult()
    raw = (config.get("testing") or {}).get("selection")
    if raw is None:
        return SelectionConfigResult()
    if not isinstance(raw, dict):
        return SelectionConfigResult(
            errors=("testing.selection must be a mapping",)
        )
    errors = []
    unknown = sorted(set(raw) - SELECTION_FIELDS)
    if unknown:
        errors.append(f"testing.selection has unknown key(s) {unknown}")

    def _str_list(value, label):
        if value is None:
            return ()
        if not isinstance(value, list) or not all(
            isinstance(v, str) for v in value
        ):
            errors.append(f"{label} must be a list of strings")
            return ()
        return tuple(v.strip() for v in value if v.strip())

    test_roots = _str_list(
        raw.get("test_roots"), "testing.selection.test_roots"
    )
    test_glob = raw.get("test_glob", "")
    if not isinstance(test_glob, str):
        errors.append("testing.selection.test_glob must be a string")
        test_glob = ""

    smoke = _str_list(raw.get("smoke"), "testing.selection.smoke")
    repo_wide = _str_list(raw.get("repo_wide"), "testing.selection.repo_wide")

    rules = []
    raw_rules = raw.get("rules")
    if raw_rules is not None and not isinstance(raw_rules, list):
        errors.append("testing.selection.rules must be a list")
        raw_rules = None
    for index, entry in enumerate(raw_rules or []):
        label = f"testing.selection.rules[{index}]"
        if not isinstance(entry, dict):
            errors.append(f"{label} must be a mapping")
            continue
        extra = sorted(set(entry) - RULE_FIELDS)
        if extra:
            errors.append(f"{label} has unknown key(s) {extra}")
        when = entry.get("when")
        if not isinstance(when, str) or not when.strip():
            errors.append(f"{label}.when must be a non-empty path prefix")
            continue
        select = entry.get("select")
        # An explicit empty list is the declaration "this path affects no
        # test", which is different from "unmapped" and must stay expressible.
        if select is None or not isinstance(select, list) or not all(
            isinstance(v, str) for v in select
        ):
            errors.append(f"{label}.select must be a list of test paths")
            continue
        rules.append((
            when.strip(), tuple(v.strip() for v in select if v.strip())
        ))

    return SelectionConfigResult(
        SelectionConfig(
            test_roots=test_roots, test_glob=test_glob.strip(), smoke=smoke,
            repo_wide=repo_wide, rules=tuple(rules),
        ),
        tuple(errors),
    )


def is_test_file(repo_root, rel: str, selection: SelectionConfig) -> bool:
    """Whether *rel* is one of this repository's tests.

    Three conditions, all declared or observed rather than assumed: the path
    sits under a declared test root, its filename matches the declared
    test-file glob, and the file is present in the tree. Presence is what
    keeps a deleted test out of the command -- naming it would fail the very
    run it was meant to prove.

    Matching is case-sensitive on every platform. Selection is evidence, and
    evidence that depends on which filesystem produced it proves nothing.
    """
    if not selection.test_glob:
        return False
    if not matching_prefixes(rel, selection.test_roots):
        return False
    if not fnmatch.fnmatchcase(rel.rsplit("/", 1)[-1], selection.test_glob):
        return False
    return (Path(repo_root) / rel).is_file()


def select_tests(repo_root, changed_paths, selection: SelectionConfig):
    """The tests *changed_paths* make necessary, each with the reason that
    selected it, plus the risks the selection raised.

    Reasons are assigned by precedence, so a test reachable by several routes
    is recorded once under the most specific one. Nothing here widens to the
    full suite except an explicitly declared repository-wide path."""
    changed = [_posix(p) for p in changed_paths if str(p).strip()]

    repo_wide_hits = [
        rel for rel in changed if matching_prefixes(rel, selection.repo_wide)
    ] if selection.repo_wide else []
    if repo_wide_hits:
        return SelectionResult(
            selected=(), risks=(), all_tests_affected=True,
            all_affected_reason=(
                "declared repository-wide path(s) changed: "
                + ", ".join(sorted(set(repo_wide_hits)))
            ),
        )

    # Best reason wins: {test path: (precedence index, reason, selected_by)}
    best: dict = {}

    def _offer(test_path: str, reason: str, selected_by: str) -> None:
        test_path = _posix(test_path)
        rank = REASON_PRECEDENCE.index(reason)
        current = best.get(test_path)
        if current is None or rank < current[0]:
            best[test_path] = (rank, reason, selected_by)

    unknown = []
    for rel in changed:
        matched = False

        if is_test_file(repo_root, rel, selection):
            _offer(rel, REASON_CHANGED_TEST, rel)
            matched = True
        # Everything else under a test root -- a shared helper, a fixture, a
        # package marker -- maps to nothing on its own. It must fall through
        # to the rules and, failing those, to selection_unknown: treating it
        # as mapped would return clean targeted evidence for a change that
        # can break any test using it.

        for when, targets in selection.rules:
            if matching_prefixes(rel, (when,)):
                # An empty target list is a declaration that this path
                # affects no test -- mapped, deliberately selecting nothing.
                matched = True
                for target in targets:
                    _offer(target, REASON_CONFIGURED_RULE, rel)

        if not matched:
            unknown.append(rel)

    risks = []
    for rel in sorted(set(unknown)):
        risks.append(SelectionRisk(
            RISK_SELECTION_UNKNOWN, rel,
            "no test maps to this path; the configured smoke tests ran "
            "instead and verification must judge the exposure. Add a "
            "testing.selection rule rather than widening the run.",
        ))
    if unknown:
        for smoke in selection.smoke:
            _offer(smoke, REASON_SMOKE, "selection_unknown")

    selected = tuple(sorted(
        (
            SelectedTest(path, reason, selected_by)
            for path, (_, reason, selected_by) in best.items()
        ),
        key=lambda s: (REASON_PRECEDENCE.index(s.reason), s.path),
    ))
    return SelectionResult(
        selected=selected, risks=tuple(risks), all_tests_affected=False,
        all_affected_reason="",
    )


def targeted_command(base: str, result: SelectionResult) -> str:
    """The command this change set sanctions, or ``""`` when it sanctions
    none. The bare suite command is correct only where the selector proved
    every test affected; a change mapped to no test has nothing to run, and
    naming the suite there would be this module recommending the one run it
    exists to refuse."""
    base = str(base or "").strip()
    if result.all_tests_affected:
        return base
    if not result.test_paths:
        return ""
    return " ".join((base, *result.test_paths))


RECORD_PLACEHOLDER = "<the command you ran>"


def snapshot_worktree_tree(repo_root) -> Optional[str]:
    """A tree object capturing tracked AND untracked non-ignored files,
    via a throwaway index — the real index and worktree are untouched.
    Both ends of a fix-delta diff must be snapshots like this one: a
    tree-vs-worktree diff reports an untracked file as deleted.

    The machine-side ``.dabbler/`` directory is dropped unconditionally,
    so the ledger cannot appear in a snapshot even in a repo that never
    got the ignore rule (or that committed the ledger before it did)."""
    fd, tmp_index = tempfile.mkstemp(prefix="dabbler-verify-index-")
    os.close(fd)
    os.unlink(tmp_index)  # let git create it
    env = dict(os.environ, GIT_INDEX_FILE=tmp_index)
    try:
        rc, _, _ = run_git(repo_root, "read-tree", "HEAD", env=env)
        if rc != 0:
            rc, _, _ = run_git(repo_root, "read-tree", "--empty", env=env)
            if rc != 0:
                return None
        rc, _, _ = run_git(repo_root, "add", "-A", env=env)
        if rc != 0:
            return None
        # After the add, so it also clears entries inherited from HEAD.
        # rc is ignored: --ignore-unmatch makes "nothing to drop" normal.
        run_git(
            repo_root, "rm", "--cached", "-r", "-f", "--ignore-unmatch",
            "-q", "--", MACHINE_DIRNAME, env=env,
        )
        rc, out, _ = run_git(repo_root, "write-tree", env=env)
        return out if rc == 0 and out else None
    finally:
        try:
            os.unlink(tmp_index)
        except OSError:
            pass


def changed_paths_between(repo_root, tree_a: str, tree_b: str) -> Optional[list]:
    """Repo-relative paths differing between two trees, or ``None`` on git
    failure (callers fail closed)."""
    rc, out, _ = run_git(
        repo_root, "diff", "--name-only", "-z", "--no-ext-diff",
        tree_a, tree_b,
    )
    if rc != 0:
        return None
    return [p for p in out.split("\0") if p]


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


# The child environment is built, never inherited. A check command is
# repository-declared and runs on the router's own machine, so inheriting
# the environment hands every vendor key, feed PAT and git token to code
# the framework did not write and cannot audit. The names below are what a
# toolchain needs to find its interpreter, its SDK and a scratch
# directory.
#
# Nothing on this list carries a credential, and that is the property
# being kept: vendor keys (DABBLER_*_API_KEY and the raw ANTHROPIC_,
# OPENAI_, GEMINI_ forms), feed PATs (NUGET_*, NPM_TOKEN,
# VSS_NUGET_EXTERNAL_FEED_ENDPOINTS), git tokens (GH_TOKEN, GITHUB_TOKEN,
# GIT_ASKPASS) and proxy credentials (HTTP_PROXY / HTTPS_PROXY, whose URLs
# routinely carry user:password) never reach a child because they were
# never added — not because a filter caught them on the way out.
#
# Option-injection variables are absent on the same terms: _JAVA_OPTIONS,
# JAVA_TOOL_OPTIONS, JDK_JAVA_OPTIONS, NODE_OPTIONS, PYTHONPATH and
# PYTHONSTARTUP all change what a runtime executes without changing the
# command the record says ran.
#
# TEMP, TMP and TMPDIR are deliberately absent: they are always set to a
# per-check scratch directory rather than passed through, so a check
# cannot read what the parent left in its temp directory or leave
# something there for the next one.
CHILD_ENV_ALLOWLIST = frozenset({
    # Where to find programs, and how to talk to the user's console.
    "PATH", "PATHEXT", "COMSPEC", "SHELL", "TERM",
    "LANG", "LC_ALL", "LC_CTYPE", "TZ",
    # Identity and home, which build tools use to locate their caches.
    "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH",
    "USER", "USERNAME", "LOGNAME",
    # Windows platform roots.
    "SYSTEMROOT", "WINDIR", "SYSTEMDRIVE", "PUBLIC", "ALLUSERSPROFILE",
    "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432", "PROGRAMDATA",
    "COMMONPROGRAMFILES", "COMMONPROGRAMFILES(X86)",
    "APPDATA", "LOCALAPPDATA",
    "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS",
    # Toolchain roots. Every one of these names a directory.
    "VIRTUAL_ENV", "JAVA_HOME",
    "DOTNET_ROOT", "DOTNET_ROOT(X86)",
    "DOTNET_CLI_TELEMETRY_OPTOUT", "DOTNET_NOLOGO",
    "GOROOT", "GOPATH", "GOCACHE", "GOMODCACHE",
    "CARGO_HOME", "RUSTUP_HOME",
    # A build that behaves differently under automation should know it is.
    "CI",
})


def child_env(scratch) -> dict:
    """The environment a check process gets: the allowlist, plus a scratch
    directory of its own for TEMP/TMP/TMPDIR."""
    env = {
        name: os.environ[name]
        for name in CHILD_ENV_ALLOWLIST
        if name in os.environ
    }
    scratch = str(scratch)
    env["TEMP"] = scratch
    env["TMP"] = scratch
    env["TMPDIR"] = scratch
    return env


def _spawn(check: Check, command: str, cwd: Path, env: dict):
    if check.command:
        # A declared shell string is trusted repository configuration and
        # keeps working byte-for-byte; nothing here infers shell mode.
        return subprocess.Popen(
            command, shell=True, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, text=True, encoding="utf-8",
            errors="replace", cwd=str(cwd), env=env,
            **({} if os.name == "nt" else {"start_new_session": True}),
        )
    argv = shlex.split(command) if command != " ".join(check.argv) else list(check.argv)
    return subprocess.Popen(
        argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        encoding="utf-8", errors="replace", cwd=str(cwd), env=env,
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
    with tempfile.TemporaryDirectory(
        prefix="dabbler-check-", ignore_cleanup_errors=True
    ) as scratch:
        process = _spawn(check, command, cwd, child_env(scratch))
        chunks: list = []
        deadline = started + timeout_seconds
        try:
            while True:
                try:
                    chunks.append(
                        process.communicate(
                            timeout=HEARTBEAT_INTERVAL_SECONDS
                        )[0]
                    )
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
