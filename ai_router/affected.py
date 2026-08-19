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
"""

from __future__ import annotations

import ast
from dataclasses import dataclass, field
from pathlib import Path

from .test_evidence import matching_prefixes

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


# --- CLI ---------------------------------------------------------------------

def working_tree_changes(repo_root):
    """Paths this working tree changes against HEAD, tracked or not. ``None``
    when git cannot answer -- an unmeasurable change set is never "empty"."""
    from .evidence import changed_paths_between, run_git, snapshot_worktree_tree

    current = snapshot_worktree_tree(repo_root)
    if current is None:
        return None
    rc, head, _ = run_git(repo_root, "rev-parse", "HEAD^{tree}")
    if rc != 0 or not head:
        return None
    return changed_paths_between(repo_root, head, current)


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
    args = parser.parse_args(argv)

    repo_root = repo_root_for(".")
    if repo_root is None:
        print("affected: no git repository here", file=sys.stderr)
        return 2
    loaded = load_selection_config(load_config())
    if not loaded.ok:
        print(
            "affected: testing.selection is malformed: "
            + "; ".join(loaded.errors),
            file=sys.stderr,
        )
        return 2
    changed = working_tree_changes(repo_root)
    if changed is None:
        print("affected: could not determine the change set", file=sys.stderr)
        return 2

    result = select_tests(repo_root, changed, loaded.config)
    if args.json:
        print(json.dumps(result.to_dict(), indent=2))
        return 0

    if result.all_tests_affected:
        print(f"all tests affected: {result.all_affected_reason}")
        return 0
    for risk in result.risks:
        print(f"  RISK {risk.kind}: {risk.path}")
    for choice in result.selected:
        print(f"  {choice.reason:22} {choice.path}  <- {choice.selected_by}")
    if not result.selected:
        print("no tests affected by this change set")
        return 0
    print("\n" + " ".join(("python", "-m", "pytest", *result.test_paths)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
