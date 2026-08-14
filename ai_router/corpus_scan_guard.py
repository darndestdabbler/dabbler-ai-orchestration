"""A corpus scan must prove it examined something (L-112-1, encoded).

Set 121 Session 1. ``L-112-1`` says a gate that only ever passes proves
nothing. Its second bullet is the half that can be *enforced* rather than
merely stated:

    Assert the INPUT SET is non-empty, and plant into the corpus the gate
    reads. A scan whose corpus comes back empty passes having examined
    nothing (Set 128 S3: a corpus check with no ``assert discovered``).

The other two bullets -- one falsifier per rule, and assert the rule
rather than a substring a sibling rule also emits -- are not mechanically
enumerable: the repo's pattern gates carry no registry, marker or naming
convention, so a meta-gate over *them* could not see its own population
and would be the very thing the lesson warns about. Those survive as the
one-line instruction in ``lessons-learned.md``.

Corpus *scans*, by contrast, are recognisable by shape: a walk of a
repo-rooted tree (``rglob`` / ``glob`` / ``iterdir`` / ``os.walk``). This
module finds every ``test_*`` function that scans one -- directly or
through a module helper -- and refuses any that never asserts the scan
found anything.

Why this is structural and not textual (L-112-1's own advice): the check
parses the AST and follows assignments, so it holds however the scan is
spelled -- comprehension, loop, helper call or intermediate variable --
and it cannot be satisfied by a comment that merely mentions the rule.

The discriminator is *the checked-out repo* versus *a tree the test
built*. A scan of a fixture directory is not a silent-failure risk: the
test created the files, so an empty result is a bug its own assertions
catch -- and a whole legitimate class of test ("assert this wrote
nothing") scans a fixture precisely to prove the result IS empty. The
risky scan is the one rooted at a **module-level path constant**, which
by construction points at the real tree, because that tree is not under
the test's control and can silently stop matching.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator, Optional

TESTS_DIR = Path(__file__).resolve().parent / "tests"
AI_ROUTER_DIR = Path(__file__).resolve().parent

#: Path-walking methods that build a file corpus.
CORPUS_METHODS = frozenset({"rglob", "glob", "iterdir"})

#: Builtins whose truthiness over a corpus is a non-empty assertion.
_TRUTHY_CALLS = frozenset({"len", "any", "bool", "sorted", "list", "set"})

#: Calls that MATERIALIZE a lazy path walk into a sized collection.
#: ``Path.rglob`` and friends return generators, and a generator is
#: **always truthy** -- so ``files = ROOT.rglob("*.py"); assert files``
#: proves nothing at all. Only a materialized corpus can be asserted by
#: bare truthiness.
_MATERIALIZING_CALLS = frozenset(
    {"list", "set", "tuple", "sorted", "frozenset"}
)

#: Methods that accumulate examined items into a collection.
_ACCUMULATOR_METHODS = frozenset({"append", "extend", "add", "update"})


@dataclass(frozen=True)
class Offender:
    """One ``test_*`` function that scans the repo and never says so."""

    module: str
    function: str
    line: int

    def __str__(self) -> str:  # pragma: no cover - formatting only
        return f"{self.module}::{self.function} (line {self.line})"


def _segment(source: str, node: Optional[ast.AST]) -> str:
    if node is None:
        return ""
    return ast.get_source_segment(source, node) or ""


def _module_path_constants(tree: ast.AST, source: str) -> frozenset:
    """Module-level names that hold a path into the checked-out tree.

    A module-level constant is computed at import time from ``__file__``
    (directly or through another such constant), so it always points at
    the real repo. A fixture or local variable does not.
    """
    names: set = set()
    changed = True
    while changed:
        changed = False
        for node in tree.body if isinstance(tree, ast.Module) else []:
            targets: list
            if isinstance(node, ast.Assign):
                targets, value = list(node.targets), node.value
            elif isinstance(node, ast.AnnAssign) and node.value is not None:
                targets, value = [node.target], node.value
            else:
                continue
            text = _segment(source, value)
            rooted = (
                "__file__" in text
                or bool(_referenced_names(value) & names)
            )
            if not rooted:
                continue
            for target in targets:
                for name in _target_names(target):
                    if name not in names:
                        names.add(name)
                        changed = True
    return frozenset(names)


def _path_provider_functions(tree: ast.AST, source: str) -> frozenset:
    """Functions that MINT a repo path (their body names ``__file__``).

    ``_ai_router_root()`` is the shape: a helper returning
    ``Path(__file__).resolve().parent.parent``. Calling one is
    equivalent to naming a module path constant.
    """
    return frozenset(
        func.name
        for func in _functions(tree)
        if "__file__" in _segment(source, func)
    )


def _repo_path_names(
    func: ast.AST, constants: frozenset, providers: frozenset, source: str
) -> frozenset:
    """Names inside *func* that hold a path into the checked-out tree.

    Seeded with the module constants and grown through assignment, so a
    scan rooted at a local (``root = _ai_router_root()``, or the
    idiomatic ``root = Path(__file__).resolve().parent``) is recognised
    as a repo scan rather than a fixture scan.
    """
    names: set = set(constants)
    changed = True
    while changed:
        changed = False
        for child in ast.walk(func):
            targets: Iterable[ast.AST]
            if isinstance(child, ast.Assign):
                targets, value = child.targets, child.value
            elif isinstance(child, (ast.AnnAssign, ast.AugAssign)):
                if child.value is None:
                    continue
                targets, value = [child.target], child.value
            else:
                continue
            if not (
                _referenced_names(value) & names
                or _called_names(value) & providers
                or "__file__" in _segment(source, value)
            ):
                continue
            for target in targets:
                for name in _target_names(target):
                    if name not in names:
                        names.add(name)
                        changed = True
    return frozenset(names)


def _corpus_roots(node: ast.AST) -> Iterator[ast.AST]:
    """Yield the ROOT expression of every path-walking call under *node*.

    ``os.walk`` only -- ``ast.walk`` shares the name and walks a parsed
    tree, not a directory. Matching on the bare attribute would flag
    every AST-inspecting test as a corpus scan.
    """
    for child in ast.walk(node):
        if not isinstance(child, ast.Call):
            continue
        func = child.func
        if not isinstance(func, ast.Attribute):
            continue
        if func.attr in CORPUS_METHODS:
            yield func.value
        elif (
            func.attr == "walk"
            and isinstance(func.value, ast.Name)
            and func.value.id == "os"
            and child.args
        ):
            yield child.args[0]


def _scans_repo(node: ast.AST, roots: frozenset) -> bool:
    """True iff *node* walks a tree rooted at one of *roots*."""
    return any(
        _referenced_names(root) & roots for root in _corpus_roots(node)
    )


def _walks_any_tree(node: ast.AST) -> bool:
    """True iff *node* walks any tree at all, whoever owns it."""
    return any(True for _ in _corpus_roots(node))


def _called_names(node: ast.AST) -> set:
    names = set()
    for child in ast.walk(node):
        if isinstance(child, ast.Call) and isinstance(child.func, ast.Name):
            names.add(child.func.id)
    return names


def _referenced_names(node: Optional[ast.AST]) -> set:
    if node is None:
        return set()
    return {
        child.id for child in ast.walk(node) if isinstance(child, ast.Name)
    }


def _target_names(target: ast.AST) -> set:
    return {
        child.id
        for child in ast.walk(target)
        if isinstance(child, ast.Name)
    }


def _is_lazy_walk(value: ast.AST) -> bool:
    """True iff *value* is a path walk that was never materialized.

    ``ROOT.rglob("*.py")`` is a generator; ``list(ROOT.rglob("*.py"))``
    and ``[p for p in ROOT.rglob("*.py")]`` are not. The distinction
    matters because a generator is always truthy, so a bare
    ``assert corpus`` over one is exactly the vacuous assertion this
    guard exists to refuse.
    """
    if isinstance(value, ast.Call):
        if isinstance(value.func, ast.Name):
            if value.func.id in _MATERIALIZING_CALLS:
                return False
        if isinstance(value.func, ast.Attribute):
            return value.func.attr in CORPUS_METHODS or (
                value.func.attr == "walk"
            )
        return False
    if isinstance(value, (ast.ListComp, ast.SetComp, ast.DictComp)):
        return False
    if isinstance(value, ast.GeneratorExp):
        return True
    return False


def _corpus_variables(
    func: ast.AST,
    roots: frozenset,
    corpus_helpers: frozenset,
    lazy_helpers: frozenset = frozenset(),
) -> tuple:
    """``(corpus_names, lazy_names)`` for *func*.

    Followed through assignment so an intermediate variable
    (``scanned = {p.name for p in sources}``) still counts as the corpus.
    ``lazy_names`` is the subset holding an unmaterialized walk, whose
    truthiness is meaningless -- including one that arrived through a
    helper whose ``return`` hands back an unmaterialized walk.
    """
    names: set = set()
    lazy: set = set()
    changed = True
    while changed:
        changed = False
        for child in ast.walk(func):
            # Accumulation: `for p in <corpus>: scanned.append(p)`.
            # The list built inside the loop IS the examined corpus, and
            # it is the shape a scan uses when it must also count what it
            # looked at. Materialized by construction.
            if isinstance(child, ast.For):
                iterates = (
                    _scans_repo(child.iter, roots)
                    or bool(_called_names(child.iter) & corpus_helpers)
                    or bool(_referenced_names(child.iter) & names)
                )
                if iterates:
                    element = _target_names(child.target)
                    for node in ast.walk(child):
                        if not isinstance(node, ast.Call):
                            continue
                        fn = node.func
                        if not (
                            isinstance(fn, ast.Attribute)
                            and fn.attr in _ACCUMULATOR_METHODS
                            and isinstance(fn.value, ast.Name)
                        ):
                            continue
                        if not any(
                            _referenced_names(arg) & element
                            for arg in node.args
                        ):
                            continue
                        if fn.value.id not in names:
                            names.add(fn.value.id)
                            changed = True
                continue
            targets: Iterable[ast.AST]
            if isinstance(child, ast.Assign):
                targets, value = child.targets, child.value
            elif isinstance(child, (ast.AnnAssign, ast.AugAssign)):
                if child.value is None:
                    continue
                targets, value = [child.target], child.value
            else:
                continue
            derives = (
                _scans_repo(value, roots)
                or bool(_called_names(value) & corpus_helpers)
                or bool(_referenced_names(value) & names)
            )
            if not derives:
                continue
            is_lazy = _is_lazy_walk(value) or bool(
                _called_names(value) & lazy_helpers
            )
            for target in targets:
                for name in _target_names(target):
                    if name not in names:
                        names.add(name)
                        changed = True
                    if is_lazy and name not in lazy:
                        lazy.add(name)
                        changed = True
                    elif not is_lazy and name in lazy:
                        lazy.discard(name)
                        changed = True
    return names, lazy


def _asserts_non_empty(
    func: ast.AST, corpus_names: set, lazy_names: set
) -> bool:
    """True iff *func* asserts a corpus variable holds something.

    Accepted shapes, each a positive claim about the corpus:
    ``assert corpus``; ``assert len(corpus)``; ``assert len(corpus) > 0``
    (also ``>=``/``!=`` against an int); and ``assert member in corpus``,
    which is strictly stronger than non-emptiness.

    Deliberately NOT accepted: ``assert not offenders`` and
    ``assert offenders == []``. Those are the vacuous-pass shapes -- both
    are satisfied by a scan that examined nothing, which is the whole
    point of the rule. Nor is bare truthiness over an **unmaterialized**
    walk: ``files = ROOT.rglob(...)`` is a generator, and a generator is
    always truthy, so ``assert files`` there is itself vacuous.
    """
    solid = set(corpus_names) - set(lazy_names)
    for child in ast.walk(func):
        if not isinstance(child, ast.Assert):
            continue
        test = child.test
        if isinstance(test, (ast.Name, ast.Attribute)):
            if _referenced_names(test) & solid:
                return True
        elif isinstance(test, ast.Call):
            if (
                isinstance(test.func, ast.Name)
                and test.func.id in _TRUTHY_CALLS
                and _referenced_names(test) & corpus_names
            ):
                return True
        elif isinstance(test, ast.Compare):
            for op, comparator in zip(test.ops, test.comparators):
                if isinstance(op, ast.In):
                    if _referenced_names(comparator) & corpus_names:
                        return True
                elif isinstance(op, (ast.Gt, ast.GtE, ast.NotEq)):
                    if not (
                        isinstance(comparator, ast.Constant)
                        and isinstance(comparator.value, int)
                        and not isinstance(comparator.value, bool)
                    ):
                        continue
                    if _referenced_names(test.left) & corpus_names:
                        return True
    return False


def _functions(tree: ast.AST) -> Iterator[ast.AST]:
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            yield node


def _calls_with_constant_root(
    func: ast.AST, helpers: frozenset, constants: frozenset
) -> bool:
    """True iff *func* hands a module path constant to a walking helper.

    Covers the common shape where the scan lives in a helper that takes
    its root as a parameter (``_scan_for_violations(root)``) and the test
    supplies the real tree at the call site.
    """
    for child in ast.walk(func):
        if not isinstance(child, ast.Call):
            continue
        if not (isinstance(child.func, ast.Name)
                and child.func.id in helpers):
            continue
        for arg in list(child.args) + [kw.value for kw in child.keywords]:
            if _referenced_names(arg) & constants:
                return True
    return False


def _parameter_names(func: ast.AST) -> set:
    """Every parameter name of *func* -- pytest injects fixtures here."""
    args = getattr(func, "args", None)
    if args is None:
        return set()
    collected = list(args.args) + list(args.posonlyargs) + list(
        args.kwonlyargs
    )
    return {arg.arg for arg in collected}


def _corpus_helpers(
    tree: ast.AST, source: str, constants: frozenset, providers: frozenset
) -> tuple:
    """``(self_rooted, parameterised)`` helper names, resolved TRANSITIVELY.

    A wrapper that never touches the filesystem itself but calls a helper
    that does is still a corpus builder -- the canonical lint shape is
    three layers (``_sources`` -> ``_violations`` -> ``test_*``). Resolved
    to a fixpoint, so depth is unbounded rather than one.

    Fixtures need no special case here: a ``@pytest.fixture`` is just a
    non-``test_`` function, so one that walks the repo lands in
    ``self_rooted`` and is matched at the consuming test by PARAMETER
    name rather than by call.
    """
    helpers = [
        func for func in _functions(tree)
        if not func.name.startswith("test_")
    ]
    self_rooted: set = set()
    changed = True
    while changed:
        changed = False
        for func in helpers:
            if func.name in self_rooted:
                continue
            roots = _repo_path_names(func, constants, providers, source)
            if _scans_repo(func, roots) or (
                _called_names(func) & self_rooted
            ) or (_parameter_names(func) & self_rooted):
                self_rooted.add(func.name)
                changed = True
    parameterised = frozenset(
        func.name for func in helpers
        if _walks_any_tree(func) and func.name not in self_rooted
    )
    return frozenset(self_rooted), parameterised


def _conftest_corpus_fixtures(path: Path) -> tuple:
    """``(corpus_helpers, lazy_helpers)`` from the sibling ``conftest.py``.

    A fixture defined in ``conftest.py`` reaches a test purely by
    parameter name, with nothing in the test module to link them, so the
    guard reads that file too -- including whether the fixture hands back
    an unmaterialized walk. Absent or unparseable conftest is not an
    error -- most directories have none.
    """
    conftest = path.parent / "conftest.py"
    if not conftest.is_file() or conftest == path:
        return frozenset(), frozenset()
    try:
        source = conftest.read_text(encoding="utf-8")
        tree = ast.parse(source)
    except (OSError, SyntaxError, UnicodeDecodeError):
        return frozenset(), frozenset()
    constants = _module_path_constants(tree, source)
    providers = _path_provider_functions(tree, source)
    self_rooted, _ = _corpus_helpers(tree, source, constants, providers)
    lazy = _lazy_returning_helpers(
        tree, source, constants, providers, self_rooted
    )
    return self_rooted, lazy


def _lazy_returning_helpers(
    tree: ast.AST,
    source: str,
    constants: frozenset,
    providers: frozenset,
    corpus_helpers: frozenset,
) -> frozenset:
    """Helpers whose ``return`` hands back an UNMATERIALIZED walk.

    ``def _sources(): return ROOT.rglob("*.py")`` returns a generator, so
    a caller's ``assert files`` is exactly as vacuous as it would be
    inline. Laziness has to cross the call boundary or the materialization
    rule only holds for corpora built in the test body. Resolved to a
    fixpoint so it crosses several boundaries.
    """
    lazy: set = set()
    changed = True
    while changed:
        changed = False
        for func in _functions(tree):
            if func.name.startswith("test_") or func.name in lazy:
                continue
            roots = _repo_path_names(func, constants, providers, source)
            _, local_lazy = _corpus_variables(
                func, roots, corpus_helpers, frozenset(lazy)
            )
            for node in ast.walk(func):
                if not isinstance(node, ast.Return) or node.value is None:
                    continue
                value = node.value
                if (
                    _is_lazy_walk(value)
                    or bool(_referenced_names(value) & local_lazy)
                    or bool(_called_names(value) & lazy)
                ):
                    lazy.add(func.name)
                    changed = True
                    break
    return frozenset(lazy)


def offenders_in_module(path: Path) -> list:
    """Every ``test_*`` function in *path* that scans the repo silently."""
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source)
    constants = _module_path_constants(tree, source)
    providers = _path_provider_functions(tree, source)
    self_rooted, parameterised = _corpus_helpers(
        tree, source, constants, providers
    )
    lazy_helpers = _lazy_returning_helpers(
        tree, source, constants, providers, self_rooted
    )
    conftest_helpers, conftest_lazy = _conftest_corpus_fixtures(path)
    self_rooted = self_rooted | conftest_helpers
    lazy_helpers = lazy_helpers | conftest_lazy

    found = []
    for func in _functions(tree):
        if not func.name.startswith("test_"):
            continue
        roots = _repo_path_names(func, constants, providers, source)
        injected = _parameter_names(func) & self_rooted
        scans = (
            _scans_repo(func, roots)
            or bool(_called_names(func) & self_rooted)
            or bool(injected)
            or _calls_with_constant_root(func, parameterised, roots)
        )
        if not scans:
            continue
        corpus_names, lazy = _corpus_variables(
            func, roots, self_rooted, lazy_helpers
        )
        more, more_lazy = _corpus_variables(
            func, roots, parameterised, lazy_helpers
        )
        corpus_names |= more
        lazy |= more_lazy
        # An injected fixture IS the corpus, under its parameter name --
        # and inherits the fixture's own laziness.
        corpus_names |= injected
        lazy |= injected & lazy_helpers
        if not _asserts_non_empty(func, corpus_names, lazy):
            found.append(Offender(path.name, func.name, func.lineno))
    return found


def discover_test_modules(root: Path) -> list:
    """The gate's own corpus: every ``test_*.py`` under *root*."""
    return sorted(
        path
        for path in root.rglob("test_*.py")
        if ".venv" not in path.parts and "node_modules" not in path.parts
    )


def scan(root: Path) -> tuple:
    """``(modules_examined, offenders)`` for the tree at *root*."""
    modules = discover_test_modules(root)
    found = []
    for path in modules:
        found.extend(offenders_in_module(path))
    return modules, found
