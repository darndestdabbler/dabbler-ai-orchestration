"""Which tests a change makes necessary, and the named reason for each.

Selection is deterministic: the same changed paths against the same tree
always yield the same tests, in the same order, with the same reasons. A
selection record is evidence, and evidence that varies between runs proves
nothing.

Every selected test carries the reason that pulled it in, so a reader can
tell "the selector understood this change" from "the selector gave up".
A changed path that maps to no test is never widened into a full-suite run:
it records ``selection_unknown``, pulls in the configured smoke tests, and
raises a risk for verification to inspect. Running everything is the
expensive way to hide an incomplete mapping.

Two changes are genuinely repository-wide -- the test runner, the shared
bootstrap, the global build config. Those are declared, not guessed, and the
selector says so explicitly rather than letting every path quietly widen.

The selection is also the standard the pre-verification command is held to.
A command earns its place in the record by naming the tests the selector
chose; a full-suite run that names none of them is a ``policy_violation``,
recorded and refused, because the only thing it proves is what it cost.

A remediation is measured against the previous round's snapshot, not the
session's start. Otherwise one repository-wide edit early in a session makes
every later round demand the whole suite again, and the stage that exists to
delete that run becomes the thing prescribing it.
"""

from __future__ import annotations

import ast
import shlex
from dataclasses import dataclass, field
from pathlib import Path

from .test_evidence import (
    ACCEPTED_POLICIES,
    OUTCOME_PASSED,
    POLICY_ALL_TESTS_AFFECTED,
    POLICY_OPERATOR_OVERRIDE,
    POLICY_TARGETED,
    POLICY_VIOLATION,
    STAGE_PREVERIFY_TARGETED,
    load_suites_checked,
    matching_prefixes,
    read_records,
    surface_digest,
)

PACKAGE = "ai_router"

REASON_CHANGED_TEST = "changed-test"
REASON_MODULE_OWNERSHIP = "module-ownership"
REASON_CONFIGURED_RULE = "configured-rule"
REASON_DEPENDENCY_EDGE = "dependency-edge"
REASON_SMOKE = "selection-unknown-smoke"

# Strongest first. A test selected by several routes is recorded once, under
# the most specific reason that reached it.
REASON_PRECEDENCE = (
    REASON_CHANGED_TEST,
    REASON_MODULE_OWNERSHIP,
    REASON_CONFIGURED_RULE,
    REASON_DEPENDENCY_EDGE,
    REASON_SMOKE,
)

RISK_SELECTION_UNKNOWN = "selection_unknown"

SELECTION_FIELDS = frozenset({
    "test_root", "smoke", "repo_wide", "rules",
})
RULE_FIELDS = frozenset({"when", "select"})


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
    test_root: str = "tests"
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


# --- Configuration -----------------------------------------------------------

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

    test_root = raw.get("test_root", "tests")
    if not isinstance(test_root, str) or not test_root.strip():
        errors.append("testing.selection.test_root must be a non-empty string")
        test_root = "tests"

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
            test_root=test_root.strip(), smoke=smoke, repo_wide=repo_wide,
            rules=tuple(rules),
        ),
        tuple(errors),
    )


# --- The import graph --------------------------------------------------------

def _posix(path) -> str:
    return str(path).replace("\\", "/").strip("/")


def module_name_for(rel: str):
    """``ai_router/foo.py`` -> ``ai_router.foo``; ``None`` for anything that
    is not a module of this package."""
    rel = _posix(rel)
    if not rel.startswith(PACKAGE + "/") or not rel.endswith(".py"):
        return None
    parts = rel[:-3].split("/")
    if parts[-1] == "__init__":
        parts = parts[:-1]
    return ".".join(parts) if parts else None


def _imports_in(source: bytes, rel: str) -> frozenset:
    """Package modules imported by one file, with relative imports resolved
    against the file's own package."""
    try:
        tree = ast.parse(source)
    except (SyntaxError, ValueError):
        return frozenset()
    package_parts = _posix(rel).split("/")[:-1]
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == PACKAGE or alias.name.startswith(
                    PACKAGE + "."
                ):
                    found.add(alias.name)
            continue
        if not isinstance(node, ast.ImportFrom):
            continue
        if node.level:
            base = package_parts[:len(package_parts) - (node.level - 1)]
            module = ".".join(base + ([node.module] if node.module else []))
        else:
            module = node.module or ""
        if module != PACKAGE and not module.startswith(PACKAGE + "."):
            continue
        found.add(module)
        if module == PACKAGE:
            # `from ai_router import verify` names a submodule, not an
            # attribute of the package's __init__.
            for alias in node.names:
                found.add(f"{PACKAGE}.{alias.name}")
    return frozenset(found)


def _read(repo_root, rel: str):
    try:
        return (Path(repo_root) / rel).read_bytes()
    except OSError:
        return None


def build_import_graph(repo_root) -> dict:
    """``{module: {package modules it imports}}`` for every module of the
    package present in the tree."""
    graph = {}
    package_dir = Path(repo_root) / PACKAGE
    if not package_dir.is_dir():
        return graph
    for path in sorted(package_dir.rglob("*.py")):
        rel = _posix(path.relative_to(repo_root))
        module = module_name_for(rel)
        if module is None:
            continue
        source = _read(repo_root, rel)
        if source is None:
            continue
        graph[module] = set(_imports_in(source, rel))
    return graph


def _closure(seeds, graph: dict) -> set:
    """Modules reachable from *seeds*, not expanding the package root.

    ``ai_router/__init__.py`` re-exports the router entry points, so a module
    that reaches for ``from .. import __version__`` would otherwise inherit
    every dependency the package surface has. Expanding that hub makes every
    module reachable from every other and reduces ``dependency-edge`` to
    "everything" -- a reason that explains nothing. The root is still a
    reachable node, so editing ``__init__.py`` itself still selects its
    dependents."""
    seen, queue = set(), list(seeds)
    while queue:
        module = queue.pop()
        if module in seen:
            continue
        seen.add(module)
        if module == PACKAGE:
            continue
        queue.extend(graph.get(module, ()))
    return seen


def test_files(repo_root, test_root: str) -> tuple:
    root = Path(repo_root) / test_root
    if not root.is_dir():
        return ()
    return tuple(sorted(
        _posix(p.relative_to(repo_root))
        for p in root.rglob("test_*.py")
    ))


def build_test_dependencies(repo_root, test_root: str) -> dict:
    """``{test file: {package modules it reaches, directly or through the
    package's own imports}}``."""
    graph = build_import_graph(repo_root)
    out = {}
    for rel in test_files(repo_root, test_root):
        source = _read(repo_root, rel)
        if source is None:
            continue
        out[rel] = _closure(_imports_in(source, rel), graph)
    return out


# --- Selection ---------------------------------------------------------------

def _is_test_path(rel: str, test_root: str) -> bool:
    return bool(matching_prefixes(rel, (test_root,)))


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

    dependencies = build_test_dependencies(repo_root, selection.test_root)
    known_tests = set(dependencies)
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

        if _is_test_path(rel, selection.test_root):
            if rel in known_tests:
                _offer(rel, REASON_CHANGED_TEST, rel)
                matched = True
            # A non-collected file under the test root -- a shared helper, a
            # package marker -- maps to nothing on its own. It must fall
            # through to the rules and, failing those, to selection_unknown:
            # treating it as mapped would return clean targeted evidence for
            # a change that can break any test importing it.

        for when, targets in selection.rules:
            if matching_prefixes(rel, (when,)):
                # An empty target list is a declaration that this path
                # affects no test -- mapped, deliberately selecting nothing.
                matched = True
                for target in targets:
                    _offer(target, REASON_CONFIGURED_RULE, rel)

        module = module_name_for(rel)
        if module is not None:
            owner = f"{selection.test_root}/test_{module.split('.')[-1]}.py"
            if owner in known_tests:
                _offer(owner, REASON_MODULE_OWNERSHIP, rel)
                matched = True
            for test_path, reached in dependencies.items():
                if module in reached:
                    _offer(test_path, REASON_DEPENDENCY_EDGE, rel)
                    matched = True

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


# --- The pre-verification policy ---------------------------------------------

def preverify_baseline(repo_root, session_set_dir):
    """The tree a pre-verification run is judged against.

    Before the first round that is ``HEAD``: all of the session's work is
    new. Once a round exists it is that round's recorded snapshot, because a
    remediation answers for what the fix changed and nothing else. Measuring
    every round against ``HEAD`` instead is what lets one repository-wide
    edit early in a session demand a full suite before every later round --
    the exact ceremony the stage exists to remove."""
    from . import ledger
    from .progress import read_session_state

    state = read_session_state(Path(session_set_dir))
    current = (state or {}).get("currentSession")
    if current is None:
        return None
    rounds = ledger.read_rounds(
        repo_root, Path(session_set_dir).name, current
    )
    for row in reversed(rounds):
        if row.get("completion_tree"):
            return row["completion_tree"]
    return None


def working_tree_changes(repo_root, baseline_tree=None):
    """Paths this working tree changes against *baseline_tree*, or against
    HEAD when none is given. Tracked or not. ``None`` when git cannot
    answer -- an unmeasurable change set is never "empty"."""
    from .evidence import changed_paths_between, run_git, snapshot_worktree_tree

    current = snapshot_worktree_tree(repo_root)
    if current is None:
        return None
    if not baseline_tree:
        rc, head, _ = run_git(repo_root, "rev-parse", "HEAD^{tree}")
        if rc != 0 or not head:
            return None
        baseline_tree = head
    return changed_paths_between(repo_root, baseline_tree, current)


@dataclass(frozen=True)
class PreverifyVerdict:
    policy: str
    reason: str
    missing: tuple = ()

    @property
    def accepted(self) -> bool:
        return self.policy in ACCEPTED_POLICIES


@dataclass(frozen=True)
class PreverifyGate:
    ok: bool
    reason: str = ""
    suite: str = ""
    command: str = ""


def _command_tokens(command) -> frozenset:
    text = _posix(str(command or ""))
    try:
        tokens = shlex.split(text)
    except ValueError:
        tokens = text.split()
    return frozenset(t.strip("'\"") for t in tokens if t)


def command_names_test(command, test_path: str) -> bool:
    """Whether *command* names *test_path* as a test to run.

    A file, or a node id inside that file -- nothing wider. A directory
    argument is deliberately not a match: ``pytest tests/`` is the full
    suite with a path typed in front of it, and accepting it would make
    every refusal in this module one keystroke away from meaningless."""
    target = _posix(test_path)
    return any(
        token == target or token.startswith(target + "::")
        for token in _command_tokens(command)
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


def _override_or_violation(override_reason, why: str, missing: tuple):
    """The two audited ways past a refusal, and the refusal itself."""
    if override_reason is not None:
        reason = str(override_reason).strip()
        if reason:
            return PreverifyVerdict(POLICY_OPERATOR_OVERRIDE, reason, missing)
        return PreverifyVerdict(
            POLICY_VIOLATION,
            "--allow-full-preverify carried no reason; an override nobody "
            "can audit is not an exception",
            missing,
        )
    return PreverifyVerdict(POLICY_VIOLATION, why, missing)


def classify_preverify_command(
    command, result: SelectionResult, *, override_reason=None,
) -> PreverifyVerdict:
    """What makes *command* acceptable pre-verification evidence, or why it
    is not.

    A command earns ``targeted`` by naming every test the selector chose --
    not most of them, and not the directory they live in. The two
    repository-wide exceptions are the only other ways through, and each
    lands in the record under its own name so a reader can tell a proved
    exception from an asserted one. Everything else is a
    ``policy_violation``: the run happened, it cost what it cost, and it
    proves nothing about the change.

    Zero selected tests is not a free pass. A change declared to affect no
    test needs no run, so every run recorded against it is a run nobody
    asked for -- in practice the whole suite, which is the single case this
    stage exists to refuse."""
    if result.all_tests_affected:
        return PreverifyVerdict(
            POLICY_ALL_TESTS_AFFECTED, result.all_affected_reason,
        )
    if not result.test_paths:
        return _override_or_violation(
            override_reason,
            "the selector maps this change set to no test, so no "
            "pre-verification run was needed and this one is evidence of "
            "nothing",
            (),
        )
    missing = tuple(
        path for path in result.test_paths
        if not command_names_test(command, path)
    )
    if not missing:
        return PreverifyVerdict(
            POLICY_TARGETED,
            f"names all {len(result.test_paths)} selected test(s)",
        )
    return _override_or_violation(
        override_reason,
        f"the command names {len(result.test_paths) - len(missing)} of "
        f"{len(result.test_paths)} selected test(s) and misses "
        + ", ".join(missing[:5])
        + ("..." if len(missing) > 5 else "")
        + ". A run that does not name the selected tests is not evidence "
        "that they ran",
        missing,
    )


def preverify_gate(repo_root, session_set_dir, config) -> PreverifyGate:
    """Whether valid targeted selection evidence exists for the tree as it
    now stands.

    Validity is four things at once: the run was pre-verification, its
    command survived the policy, it was green, and it digest-matches the
    surfaces the suite covers right now. The last one is what makes
    remediation cheap and honest -- a fix moves the surfaces, so the
    affected tests are rerun rather than re-cited."""
    loaded = load_suites_checked(config)
    if loaded.errors:
        return PreverifyGate(
            False,
            "testing.suites is malformed: " + "; ".join(loaded.errors),
        )
    expensive = [s for s in loaded.suites if s.expensive]
    if not expensive:
        return PreverifyGate(True)
    selection = load_selection_config(config)
    if not selection.ok:
        return PreverifyGate(
            False,
            "testing.selection is malformed: " + "; ".join(selection.errors),
        )
    changed = working_tree_changes(
        repo_root, preverify_baseline(repo_root, session_set_dir)
    )
    if changed is None:
        return PreverifyGate(
            False,
            "the change set could not be determined, so no run can be "
            "proved targeted against it (failing closed)",
        )
    result = select_tests(repo_root, changed, selection.config)
    if result.unknown_paths and not selection.config.smoke:
        # Uncertainty is supposed to buy the smoke tests. Where none are
        # declared it buys nothing at all, and the tests the *mapped* paths
        # selected would otherwise make the gap read as covered -- a green
        # record for one half of a change says nothing about the other.
        return PreverifyGate(
            False,
            "the selector could not map "
            + ", ".join(result.unknown_paths[:5])
            + ("..." if len(result.unknown_paths) > 5 else "")
            + " to any test and no testing.selection.smoke fallback is "
            "declared, so nothing ran for those paths. Declare the mapping "
            "rather than widening the run",
            expensive[0].name, "",
        )
    if not result.all_tests_affected and not result.test_paths:
        # Declared to affect no test: nothing to prove, and nothing to ask
        # for. Demanding a record here is what would put the full suite in
        # front of verification on the most ordinary change there is.
        return PreverifyGate(True)
    records = read_records(repo_root, Path(session_set_dir).name)
    for suite in expensive:
        current = surface_digest(
            repo_root, suite.covers, session_set_dir=session_set_dir,
        )
        if current is None:
            return PreverifyGate(
                False,
                f"the surfaces {suite.name} covers could not be digested "
                "(failing closed)", suite.name,
                targeted_command(suite.command, result),
            )
        mine = [
            r for r in records
            if r.suite == suite.name and r.stage == STAGE_PREVERIFY_TARGETED
        ]
        if any(
            r.policy in ACCEPTED_POLICIES
            and r.outcome == OUTCOME_PASSED
            and r.surface_digest == current
            for r in mine
        ):
            continue
        if not mine:
            why = f"no pre-verification run of {suite.name} is recorded"
        elif all(r.policy == POLICY_VIOLATION for r in mine):
            why = (
                f"every recorded pre-verification run of {suite.name} is a "
                f"{POLICY_VIOLATION}"
            )
        elif not any(
            r.policy in ACCEPTED_POLICIES and r.outcome == OUTCOME_PASSED
            for r in mine
        ):
            why = (
                f"the pre-verification run of {suite.name} is not green; a "
                "red targeted run returns to you, not to a verifier"
            )
        else:
            why = (
                f"the pre-verification run of {suite.name} predates a change "
                "to the surfaces it covers"
            )
        return PreverifyGate(
            False, why, suite.name, targeted_command(suite.command, result),
        )
    return PreverifyGate(True)


# --- CLI ---------------------------------------------------------------------

def main(argv=None) -> int:
    import argparse
    import json
    import sys

    from .config import load_config
    from .evidence import repo_root_for

    parser = argparse.ArgumentParser(
        prog="python -m ai_router.affected",
        description="the tests this working tree makes necessary, and why",
    )
    parser.add_argument("--json", action="store_true")
    parser.add_argument(
        "--session-set-dir",
        help=(
            "scope the selection the way verification will: once a round "
            "exists, a remediation is measured against that round's "
            "snapshot rather than HEAD"
        ),
    )
    args = parser.parse_args(argv)

    repo_root = repo_root_for(".")
    if repo_root is None:
        print("affected: no git repository here", file=sys.stderr)
        return 2
    config = load_config()
    loaded = load_selection_config(config)
    if not loaded.ok:
        print(
            "affected: testing.selection is malformed: "
            + "; ".join(loaded.errors),
            file=sys.stderr,
        )
        return 2
    baseline = (
        preverify_baseline(repo_root, args.session_set_dir)
        if args.session_set_dir else None
    )
    changed = working_tree_changes(repo_root, baseline)
    if changed is None:
        print("affected: could not determine the change set", file=sys.stderr)
        return 2

    result = select_tests(repo_root, changed, loaded.config)
    if args.json:
        print(json.dumps(result.to_dict(), indent=2))
        return 0

    # Which baseline produced this, always: a selection measured against
    # HEAD and one measured against the last round look identical as a list
    # of files, and only one of them is what verification will require.
    print(
        f"scope: {'the last round' if baseline else 'HEAD'}"
        + ("" if args.session_set_dir else
           " (pass --session-set-dir to scope a remediation to its fix)")
    )
    # The runner is whatever the repository declared, never this module's
    # guess: a printed command an orchestrator cannot paste teaches it to
    # improvise one.
    suites = [s for s in load_suites_checked(config).suites if s.expensive]
    base = suites[0].command if suites else "python -m pytest"

    if result.all_tests_affected:
        print(f"all tests affected: {result.all_affected_reason}")
        print("\n" + targeted_command(base, result))
        return 0
    for risk in result.risks:
        print(f"  RISK {risk.kind}: {risk.path}")
    for choice in result.selected:
        print(f"  {choice.reason:22} {choice.path}  <- {choice.selected_by}")
    if not result.selected:
        print("no tests affected by this change set")
        return 0
    print("\n" + targeted_command(base, result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
