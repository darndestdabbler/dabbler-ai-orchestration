"""Set 118 S1 -- the pytest suite, as a query instead of a forensic exercise.

The repo cannot retire what it cannot see. Before this module, answering
"which tests guard something that no longer exists?", "which tests reach
into the real repository tree?" or even "how many tests are there?"
required a one-off shell command that nobody wrote down -- and Set 128's
re-read of Set 118's spec proved the cost of that: the spec's coupling
figure (47 files / 1,485 tests) sat *between* two readings of its own
prose detector and could not be reproduced under either.

**So this module publishes its predicates, not only its results.** Every
count below names the rule that produced it, in
:data:`PREDICATES`, rendered at the top of the human report and carried
in the JSON. A number here is meant to be argued with; a number nobody
can re-derive is the defect class this repo keeps shipping gates to
close.

Three things it answers, one per Session 1 step:

1. **Volume** -- files, test functions, test LOC, production LOC and the
   ratio, under the exact predicates the spec's own history used
   (validated by reproducing prior commits; see ``--rev``).
2. **Coupling** -- four *named* detectors rather than one unnamed
   regex, because the spread between them is the whole finding. The
   headline is tiered: enumerating the real tree is strong coupling,
   deriving a path from ``__file__`` is weak, and merely *mentioning* a
   repo-ish identifier is not coupling at all.
3. **Guards and sole cover** -- which tests pin a historical decision
   or assert something stays absent, how old that decision is in sets,
   and (A1) whether a test file is the **only** cover for a production
   module. A retirement that removes the last cover for a module makes
   every later session's targeted run cheaper and nothing announces it,
   so that flag is what keeps Session 3 honest.

Guard status is read from a ``pytest.mark.guard`` marker **first** and
falls back to a heuristic. Session 2 ships the marker convention; as
markers land, the heuristic stops being load-bearing. The report says
which source each guard came from so that migration is visible.

``--rev`` reads the corpus out of git (one ``git cat-file --batch``
pass) rather than the working tree, which is what makes the spec's
historical figures reproducible by command instead of by archaeology.
Without it, Step 4 of this session could not be performed at all: the
3,513 / 67,182 / 133 figures are from ``ab47a3e7``, not from HEAD.

.. note:: **Named ``suite_inventory``, not ``test_inventory``.**

   The Set 118 spec calls this module ``ai_router/test_inventory.py``
   and its CLI ``python -m ai_router.test_inventory``. That name is
   refused by a shipped invariant: ``test_packaging_hygiene.py``
   asserts every ``test_*.py`` under ``ai_router/`` lives in
   ``ai_router/tests/``, which is what makes the wheel's
   ``ai_router.tests*`` exclude a *proof* that no test module ships,
   and it also keeps one import name from meaning two things (the test
   conftest puts ``ai_router/`` on ``sys.path``). A production module
   called ``test_inventory`` breaks that invariant to buy a filename.
   The spec's goal is a queryable inventory, not a spelling, so the
   module was renamed rather than the guard widened. **Sessions 2 and 3
   should read every ``test_inventory`` in the spec as
   ``suite_inventory``.**

The working-tree corpus is enumerated from the **filesystem**, not from
``git ls-files``: an inventory that reads only tracked files silently
omits a test file that has not been committed yet (L-064-9, the same
class as a diff-based evidence bundle omitting untracked deliverables).
``--rev`` necessarily reads tracked content only, and says so.

Output is ASCII-only (the cp1252 console convention).

CLI::

    python -m ai_router.suite_inventory                  # human report, working tree
    python -m ai_router.suite_inventory --rev ab47a3e7   # ...as of a commit
    python -m ai_router.suite_inventory --json out.json  # machine-readable
    python -m ai_router.suite_inventory --guards         # guard section only
"""

from __future__ import annotations

import argparse
import ast
import io
import json
import os
import re
import subprocess
import sys
import tokenize
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

JSON_CONTRACT_VERSION = 1

TESTS_PREFIX = "ai_router/tests"
PRODUCTION_PREFIX = "ai_router"
SESSION_SETS_DIR = "docs/session-sets"
PYPROJECT_PATH = "pyproject.toml"

try:  # 3.11+
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - older interpreters
    tomllib = None  # type: ignore[assignment]

# ---------------------------------------------------------------------------
# The published predicates. Every number this module reports names one.
# ---------------------------------------------------------------------------

PREDICATES: Dict[str, str] = {
    "test-file": (
        "a *.py file under ai_router/tests/ (recursively) whose BASENAME "
        "matches test_*.py. Excludes conftest.py and the shared fixture "
        "helpers (stamp_fixtures.py, model_inventory_fixtures.py, ...), "
        "which carry no test functions of their own."
    ),
    "test-function": (
        "a line matching ^[ \\t]*(async )?def test_ inside a test file. "
        "This is the LINE predicate every historical figure in the 118 "
        "spec used; it is reproduced here so the series stays "
        "comparable. testFunctionsAst counts the same thing "
        "structurally (module-level and class-level defs named test_*); "
        "a gap between them means a `def test_` inside a string or a "
        "nested def, and is reported rather than hidden."
    ),
    "test-loc": (
        "physical lines of a test file, blanks and comments INCLUDED. "
        "The 118 spec's ratio table used a different, "
        "blank/comment-excluding counter (52,868 for a commit this one "
        "reads as 60,188); only the RATIO is comparable across the two."
    ),
    "production-module": (
        "a *.py file under ai_router/ that is NOT under ai_router/tests/. "
        "Includes ai_router/scripts/ (the test conftest puts it on "
        "sys.path, so tests import those modules bare)."
    ),
    "production-loc": "physical lines of a production module, same counter as test-loc.",
    "imports": (
        "a production module M is imported by test file T when T's AST "
        "contains `import M` / `from M import ...` under any of the "
        "three spellings the suite uses -- bare stem (import "
        "session_state), package-absolute (import ai_router.session_state) "
        "or from-package (from ai_router import session_state) -- or an "
        "importlib.import_module(\"<stem>\") with a literal argument. "
        "A name that is not a known production module is ignored, so "
        "stdlib and third-party imports cannot inflate the map."
    ),
    "imports.dynamic": (
        "importlib.import_module(<non-literal>) cannot be resolved "
        "statically, and reading it as 'imports nothing' is how "
        "ai_router/report.py was falsely reported UNCOVERED: "
        "test_entry_points.py imports every [project.scripts] target "
        "through a variable read out of pyproject.toml. Where a file "
        "makes such a call AND reads pyproject.toml, the DECLARED "
        "console-script targets complete its map. Any other unresolvable "
        "call is counted per file (dynamicImportCalls) and the file is "
        "listed under soleCover.unresolvedDynamicImportFiles, so a hole "
        "in the map is visible rather than silent."
    ),
    "coupling.D1-spec-prose": (
        "the 118 spec's detector AS WRITTEN IN ITS PROSE: Path(__file__) "
        "OR parents[N] OR a repo-root constant (REPO_ROOT / repo_root as "
        "SUBSTRINGS, not word-anchored). Reported for continuity with the "
        "spec, NOT as this tool's answer. The substring reading is load "
        "bearing: anchoring repo_root on word boundaries drops helpers "
        "named _repo_root() and moves the count by a whole file (42 files "
        "/ 1,251 functions at 8fda8d85 instead of 43 / 1,294). Three "
        "readings of one sentence, three answers -- which is the finding, "
        "not a footnote."
    ),
    "coupling.D2-bare-file": (
        "the same sentence read one clause looser: a bare __file__ OR "
        "parents[N] OR a repo-root constant. D1 and D2 bracket the "
        "spec's stated 47/1,485, which is how Set 128 established the "
        "figure was detector-dependent."
    ),
    "coupling.D3-derives-repo-path": (
        "STRUCTURAL: the file mentions __file__ as a NAME in the AST -- a "
        "string literal or comment quoting it does not count, which is "
        "one of the two over-counting mechanisms the Set 118 measurement "
        "correction named. Deliberately excludes the bare identifiers "
        "repo_root / REPO_ROOT, because passing a tmp_path to a parameter "
        "NAMED repo_root is the opposite of reaching into the real tree. "
        "D1 and D2 stay textual on purpose -- they reproduce historical "
        "regexes, and a regex sees strings."
    ),
    "coupling.D3a-enumerates-anywhere": (
        "D3 AND an enumeration call appearing ANYWHERE in the file. This "
        "is the co-occurrence reading a grep gives, and it OVER-COUNTS: "
        "test_session_state_backfill.py derives a script path from "
        "__file__ and separately calls .iterdir() on a tmp_path, which "
        "has nothing to do with the real tree. Kept as a named detector "
        "because it reproduces the Set 118 measurement correction's own "
        "figure (5 files / 66 functions at 8fda8d85), NOT because it is "
        "the answer."
    ),
    "coupling.D4-enumerates-real-tree": (
        "THE ANSWER, and it is a dataflow question rather than a "
        "co-occurrence one: the enumerated path must actually DERIVE from "
        "__file__. Resolved over the AST -- assignments are followed to a "
        "bounded fixpoint (ROOT = Path(__file__).parents[2]; DOCS = ROOT "
        "/ 'docs'), and a helper returning such a path taints its callers "
        "(_repo_root()). Counts two shapes: the file enumerates the path "
        "itself (ROOT.rglob(...), os.walk(ROOT)), or it HANDS the path to "
        "something that will (guard.run_all(_repo_root())), which is how "
        "the repository-is-the-system-under-test guards reach the tree. "
        "Passing a path to Path()/str() is plumbing and does not count. "
        "These are the tests that break on a rename or a doc move -- the "
        "change-amplification tax the set was scoped to attack."
    ),
    "coupling.tier": (
        "strong = D4. weak = D3 and not D4 (usually locating the package "
        "or a fixture dir; breaks on a depth change, not on a rename). "
        "names-only = D2 and not D3 -- matched only in TEXT (a repo-ish "
        "identifier, or a literal quoting one) and never in code; this is "
        "NOT coupling and is reported separately so it stops being "
        "counted as such. sandboxed = none of the above."
    ),
    "guard.marker": (
        "a @pytest.mark.guard(...) decorator (the Session 2 convention). "
        "Authoritative wherever present: a declared guard is never "
        "overridden by the heuristic."
    ),
    "guard.heuristic": (
        "a BOOTSTRAP for files carrying no marker yet, and it is a "
        "heuristic on purpose -- it exists to seed the markers, not to be "
        "trusted. A file is a guard when ANY of: 'guard' in the filename; "
        "the filename pins a numbered set (set<NNN>); the module docstring "
        "asserts permanence (stays deleted/absent/gone, anti-resurrection, "
        "resurrection, cannot recur, must not return, cannot come back); "
        "or guard-shaped test functions are at least half of the file and "
        "number at least two. That last clause is what stops one "
        "absence-shaped test in a 35-test file from painting the file a "
        "guard. Every hit carries its evidence string so a human can "
        "overrule it."
    ),
    "guard.limits": (
        "TUNED FOR PRECISION, NOT RECALL, and that is the design. A rule "
        "fed a noisy population is worse than one fed a small clean "
        "population, so the heuristic prefers to miss a guard over to "
        "invent one. Two consequences, both real. (a) BARE 'resurrection' "
        "IS NOT A SIGNAL: this repo uses it for the verification loop's "
        "settled-finding rule ('a resolved id that reappears'), an "
        "unrelated sense, and including it falsely flagged "
        "test_blocking_classifier.py and test_post_round_delta.py. Only "
        "'anti-resurrection' survives. (b) THE HEURISTIC CANNOT SEE AN "
        "INVARIANT PIN. A file pinning one rendering invariant or one "
        "number (the 118 spec names test_step_row_parity.py and "
        "test_print_session_set_status_completed_count.py) is "
        "indistinguishable by name, docstring or shape from an ordinary "
        "behaviour test -- because it IS one, until you know why it was "
        "written. Nothing mechanical closes either gap, which is the "
        "whole argument for the Session 2 marker: a guard's PURPOSE has "
        "to be declared by its author, not inferred by a regex."
    ),
    "guard.age-in-sets": (
        "latest set number present under docs/session-sets/ MINUS the set "
        "the guard names (from a set<NNN> in the filename, else the first "
        "'Set NNN' in the module docstring). Null when no set is named. "
        "This is the input Session 2's retirement rule consumes."
    ),
    "sole-cover": (
        "test file T is the sole cover for production module M when T is "
        "the ONLY test file importing M. A1: retiring T silently changes "
        "what 'targeted' resolves to for every later session that touches "
        "M, so a sole-cover file never enters a bulk retirement pass."
    ),
    "corpus.working-tree": (
        "the filesystem under ai_router/, INCLUDING untracked files "
        "(L-064-9: reading only tracked files hides a test that exists "
        "but has not been committed). __pycache__ excluded."
    ),
    "corpus.rev": (
        "the git tree at the named revision -- tracked content only, by "
        "construction. Use this to reproduce a historical figure."
    ),
}

# ---------------------------------------------------------------------------
# Detector regexes (compiled once; each maps to a PREDICATES entry)
# ---------------------------------------------------------------------------

_RE_TEST_DEF_LINE = re.compile(r"^[ \t]*(?:async[ \t]+)?def[ \t]+test_", re.M)
_RE_PARAMETRIZE = re.compile(r"@pytest\.mark\.parametrize")
_RE_PATH_DUNDER_FILE = re.compile(r"Path\(\s*__file__\s*\)")
_RE_DUNDER_FILE = re.compile(r"__file__")
_RE_PARENTS_INDEX = re.compile(r"\.parents\[\s*\d+\s*\]")
_RE_REPO_ROOT_CONST = re.compile(r"REPO_ROOT|repo_root")
_RE_ENUMERATES = re.compile(r"\.glob\(|\.rglob\(|\.iterdir\(|os\.walk\(|\bwalk\(")
_RE_SET_IN_FILENAME = re.compile(r"set(\d{2,4})")
_RE_SET_IN_DOCSTRING = re.compile(r"\bSets?\s+(\d{2,4})\b")
_RE_SET_DIR = re.compile(r"^(\d{3})-")

# Enumeration: `p.glob(...)` style takes the path as the RECEIVER,
# `os.walk(p)` style takes it as the first ARGUMENT. Both are handled.
_ENUMERATION_METHODS = frozenset(
    {"glob", "rglob", "iterdir", "walk", "scandir", "listdir"}
)
_OS_ENUMERATION_HOSTS = frozenset({"os", "path"})
# Handing a repo path to one of these is normalisation, not a reach into
# the tree, so they do not make a file strongly coupled on their own.
# ``join``/``dirname``/``abspath`` are here because os.path plumbing is
# how half the suite builds a fixture path: it constructs, it never walks.
_PATH_PLUMBING = frozenset(
    {
        "Path",
        "PurePath",
        "PosixPath",
        "WindowsPath",
        "str",
        "len",
        "print",
        "fspath",
        "join",
        "dirname",
        "basename",
        "abspath",
        "realpath",
        "normpath",
        "relpath",
        "expanduser",
        "splitext",
    }
)

_GUARD_DOCSTRING_SIGNALS = (
    "stays deleted",
    "stays absent",
    "stays gone",
    "stays removed",
    "anti-resurrection",
    "cannot recur",
    "must not recur",
    "must not return",
    "cannot come back",
    "does not come back",
    "so the dismissal cannot",
    "cannot be reintroduced",
)

_GUARD_FUNCNAME_SIGNALS = (
    "guard",
    "no_longer",
    "stays_",
    "_gone",
    "not_resurrect",
    "resurrect",
    "does_not_return",
    "never_returns",
    "is_absent",
    "are_gone",
    "cannot_recur",
)

TIER_STRONG = "strong"
TIER_WEAK = "weak"
TIER_NAMES_ONLY = "names-only"
TIER_SANDBOXED = "sandboxed"


# ---------------------------------------------------------------------------
# Corpus access -- working tree or a git revision
# ---------------------------------------------------------------------------


class CorpusError(RuntimeError):
    """The corpus could not be read (bad revision, not a git repo, ...)."""


def _git(root: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", *args],
        cwd=str(root),
        capture_output=True,
    )
    if proc.returncode != 0:
        raise CorpusError(
            "git " + " ".join(args) + " failed: "
            + proc.stderr.decode("utf-8", errors="replace").strip()
        )
    return proc.stdout.decode("utf-8", errors="replace")


@dataclass
class Corpus:
    """The set of files an inventory run reads, and where they came from."""

    root: Path
    rev: Optional[str]
    paths: List[str]
    _blobs: Dict[str, str] = field(default_factory=dict, repr=False)
    extra: Dict[str, str] = field(default_factory=dict, repr=False)

    @property
    def kind(self) -> str:
        return "rev" if self.rev else "working-tree"

    def read(self, path: str) -> str:
        return self._blobs[path]


def _is_python(path: str) -> bool:
    return path.endswith(".py") and "__pycache__" not in path


def _in_tests(path: str) -> bool:
    return path == TESTS_PREFIX or path.startswith(TESTS_PREFIX + "/")


def is_test_file(path: str) -> bool:
    """The published ``test-file`` predicate."""
    return _is_python(path) and _in_tests(path) and os.path.basename(path).startswith("test_")


def is_production_module(path: str) -> bool:
    """The published ``production-module`` predicate."""
    return (
        _is_python(path)
        and path.startswith(PRODUCTION_PREFIX + "/")
        and not _in_tests(path)
    )


def _relevant(path: str) -> bool:
    return is_test_file(path) or is_production_module(path)


def _load_working_tree(root: Path) -> Corpus:
    paths: List[str] = []
    blobs: Dict[str, str] = {}
    base = root / PRODUCTION_PREFIX
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if d != "__pycache__"]
        for name in filenames:
            full = Path(dirpath) / name
            rel = full.relative_to(root).as_posix()
            if not _relevant(rel):
                continue
            paths.append(rel)
            blobs[rel] = full.read_bytes().decode("utf-8", errors="replace")
    paths.sort()
    extra = {}
    pyproject = root / PYPROJECT_PATH
    if pyproject.is_file():
        extra[PYPROJECT_PATH] = pyproject.read_bytes().decode("utf-8", errors="replace")
    return Corpus(root=root, rev=None, paths=paths, _blobs=blobs, extra=extra)


def _load_rev(root: Path, rev: str) -> Corpus:
    listing = _git(root, "ls-tree", "-r", "--name-only", rev, "--", PRODUCTION_PREFIX)
    paths = sorted(p for p in listing.splitlines() if p and _relevant(p))
    blobs = _cat_file_batch(root, rev, paths)
    extra = _cat_file_batch(root, rev, [PYPROJECT_PATH])
    return Corpus(root=root, rev=rev, paths=paths, _blobs=blobs, extra=extra)


def _cat_file_batch(root: Path, rev: str, paths: Sequence[str]) -> Dict[str, str]:
    """Read every blob in ONE git process.

    ``git show`` per file would be several hundred subprocesses; on
    Windows that alone costs more than the rest of the run.
    """
    if not paths:
        return {}
    stdin = "".join(f"{rev}:{p}\n" for p in paths).encode("utf-8")
    proc = subprocess.run(
        ["git", "cat-file", "--batch"],
        cwd=str(root),
        input=stdin,
        capture_output=True,
    )
    if proc.returncode != 0:
        raise CorpusError(
            "git cat-file --batch failed: "
            + proc.stderr.decode("utf-8", errors="replace").strip()
        )
    out = proc.stdout
    blobs: Dict[str, str] = {}
    pos = 0
    for path in paths:
        nl = out.find(b"\n", pos)
        if nl < 0:
            raise CorpusError(f"truncated cat-file output at {path}")
        header = out[pos:nl].decode("utf-8", errors="replace")
        pos = nl + 1
        parts = header.split()
        if len(parts) != 3 or parts[1] != "blob":
            raise CorpusError(f"unexpected cat-file header for {path}: {header}")
        size = int(parts[2])
        blobs[path] = out[pos : pos + size].decode("utf-8", errors="replace")
        pos += size + 1  # trailing newline git appends after the payload
    return blobs


def load_corpus(root: Path, rev: Optional[str] = None) -> Corpus:
    return _load_rev(root, rev) if rev else _load_working_tree(root)


# ---------------------------------------------------------------------------
# Per-file analysis
# ---------------------------------------------------------------------------


def count_test_functions(text: str) -> int:
    """The published ``test-function`` LINE predicate."""
    return len(_RE_TEST_DEF_LINE.findall(text))


def count_test_functions_ast(tree: Optional[ast.Module]) -> int:
    """The structural cross-check: module-level and class-level test defs."""
    if tree is None:
        return 0
    total = 0
    defs = (ast.FunctionDef, ast.AsyncFunctionDef)
    for node in tree.body:
        if isinstance(node, defs) and node.name.startswith("test_"):
            total += 1
        elif isinstance(node, ast.ClassDef):
            for sub in node.body:
                if isinstance(sub, defs) and sub.name.startswith("test_"):
                    total += 1
    return total


def count_loc(text: str) -> int:
    """The published ``test-loc`` / ``production-loc`` predicate."""
    return len(text.splitlines())


def _parse(text: str, path: str) -> Optional[ast.Module]:
    try:
        return ast.parse(text, filename=path)
    except SyntaxError:
        return None


@dataclass
class ModuleIndex:
    """Every production module, under each spelling a test may import it by."""

    by_dotted: Dict[str, str] = field(default_factory=dict)
    by_stem: Dict[str, str] = field(default_factory=dict)

    def resolve(self, name: str) -> Optional[str]:
        if name in self.by_dotted:
            return self.by_dotted[name]
        return self.by_stem.get(name)


def build_module_index(corpus: Corpus) -> ModuleIndex:
    index = ModuleIndex()
    for path in corpus.paths:
        if not is_production_module(path):
            continue
        rel = path[len(PRODUCTION_PREFIX) + 1 :]
        if rel.endswith("/__init__.py"):
            dotted = PRODUCTION_PREFIX + "." + rel[: -len("/__init__.py")].replace("/", ".")
        elif rel == "__init__.py":
            dotted = PRODUCTION_PREFIX
        else:
            dotted = PRODUCTION_PREFIX + "." + rel[: -len(".py")].replace("/", ".")
        index.by_dotted[dotted] = path
        # The suite's bare-import convention: ai_router/ and ai_router/scripts/
        # are both on sys.path via conftest, so their stems are importable.
        depth = rel.count("/")
        if (depth == 0 or rel.startswith("scripts/")) and not rel.endswith("__init__.py"):
            index.by_stem.setdefault(os.path.basename(rel)[: -len(".py")], path)
    return index


def _entry_point_modules(corpus: "Corpus", index: "ModuleIndex") -> Optional[List[str]]:
    """Production modules declared as console scripts in ``pyproject.toml``.

    ``test_entry_points.py`` imports each of these through
    ``importlib.import_module(module_path)`` where ``module_path`` is read
    out of the TOML at runtime. No static analysis can resolve that -- but
    the *declared* targets are a known corpus in the repo, so the map can
    be completed from the declaration instead of guessed.

    Returns ``None`` -- **not** ``[]`` -- when the declaration cannot be
    read at all: no ``pyproject.toml`` on the corpus, no ``tomllib``
    (the package supports Python 3.10, where it does not exist), or
    malformed TOML. The distinction is load bearing. ``[]`` means "read
    it, there are no console scripts"; ``None`` means "could not read
    it", and the caller must then report the dynamic import as an
    UNRESOLVED hole rather than silently treating the file as handled.
    Failing open here would quietly restore the false-uncovered defect
    on any supported interpreter that lacks ``tomllib``.
    """
    raw = corpus.extra.get(PYPROJECT_PATH)
    if not raw or tomllib is None:
        return None
    try:
        data = tomllib.loads(raw)
    except Exception:  # pragma: no cover - malformed pyproject
        return None
    scripts = data.get("project", {}).get("scripts", {}) or {}
    found: set = set()
    for target in scripts.values():
        if not isinstance(target, str):
            continue
        dotted = target.partition(":")[0]
        hit = index.resolve(dotted)
        if hit:
            found.add(hit)
    return sorted(found)


def _dynamic_import_calls(tree: Optional[ast.Module]) -> int:
    """``import_module(...)`` calls whose argument is NOT a literal."""
    if tree is None:
        return 0
    total = 0
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = getattr(node.func, "attr", None) or getattr(node.func, "id", None)
        if name != "import_module" or not node.args:
            continue
        arg = node.args[0]
        if not (isinstance(arg, ast.Constant) and isinstance(arg.value, str)):
            total += 1
    return total


def imported_production_modules(tree: Optional[ast.Module], index: ModuleIndex) -> List[str]:
    """The published ``imports`` predicate."""
    if tree is None:
        return []
    found: set = set()

    def take(name: Optional[str]) -> bool:
        if not name:
            return False
        hit = index.resolve(name)
        if hit:
            found.add(hit)
            return True
        return False

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                take(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                continue
            module = node.module
            if not module:
                continue
            matched = take(module)
            # `from ai_router import session_state` names submodules, not
            # attributes; `from ai_router import route` names a function and
            # is attributed to ai_router/__init__.py by the take() above.
            for alias in node.names:
                take(f"{module}.{alias.name}")
            if not matched:
                take(module.split(".")[0])
        elif isinstance(node, ast.Call):
            func = node.func
            name = getattr(func, "attr", None) or getattr(func, "id", None)
            if name == "import_module" and node.args:
                arg = node.args[0]
                if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                    take(arg.value)
    return sorted(found)


def _code_only(text: str) -> str:
    """*text* with string literals and comments blanked out.

    D1/D2 are textual by definition -- they exist to reproduce historical
    regexes, and a regex sees strings. D3/D4 are this tool's own answer,
    so they must not repeat the over-counting mechanism the Set 118
    measurement correction named: a ``docs/...`` path or an enumeration
    call appearing as *test data* is not a path anything opens. This
    module's own test file plants ``.rglob(`` in a string to prove the
    detector fires, and was tiered ``strong`` until this existed.

    Falls back to the raw text if the source does not tokenize, which
    keeps an unparseable file counted rather than silently exempt.
    """
    try:
        tokens = list(tokenize.generate_tokens(io.StringIO(text).readline))
    except (tokenize.TokenError, IndentationError, SyntaxError):
        return text
    lines = [list(line) for line in text.splitlines()]
    blanked = (tokenize.STRING, tokenize.COMMENT, getattr(tokenize, "FSTRING_MIDDLE", -1))
    for token in tokens:
        if token.type not in blanked:
            continue
        (start_row, start_col), (end_row, end_col) = token.start, token.end
        for row in range(start_row, end_row + 1):
            index = row - 1
            if not 0 <= index < len(lines):
                continue
            line = lines[index]
            first = start_col if row == start_row else 0
            last = end_col if row == end_row else len(line)
            for col in range(first, min(last, len(line))):
                line[col] = " "
    return "\n".join("".join(line) for line in lines)


def _expr_derives_from_file(node: ast.AST, names: set, funcs: set) -> bool:
    """Does this expression carry a value derived from ``__file__``?"""
    for sub in ast.walk(node):
        if isinstance(sub, ast.Name):
            if sub.id == "__file__" or sub.id in names:
                return True
        elif isinstance(sub, ast.Attribute):
            if sub.attr == "__file__":
                return True
        elif isinstance(sub, ast.Call):
            func = sub.func
            if isinstance(func, ast.Name) and func.id in funcs:
                return True
            if isinstance(func, ast.Attribute) and func.attr in funcs:
                return True
    return False


def _repo_derived_bindings(tree: ast.Module) -> Tuple[set, set]:
    """Names and functions whose values derive from ``__file__``.

    A small bounded fixpoint, so ``ROOT = Path(__file__).parents[2]`` then
    ``DOCS = ROOT / "docs"`` both count, as does a ``_repo_root()`` helper
    whose return value derives from ``__file__``.
    """
    names: set = set()
    funcs: set = set()
    for _ in range(5):
        changed = False
        for node in ast.walk(tree):
            if isinstance(node, (ast.Assign, ast.AnnAssign)):
                value = node.value
                if value is None or not _expr_derives_from_file(value, names, funcs):
                    continue
                targets = (
                    node.targets if isinstance(node, ast.Assign) else [node.target]
                )
                for target in targets:
                    for sub in ast.walk(target):
                        if isinstance(sub, ast.Name) and sub.id not in names:
                            names.add(sub.id)
                            changed = True
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.name in funcs:
                    continue
                for sub in ast.walk(node):
                    if (
                        isinstance(sub, ast.Return)
                        and sub.value is not None
                        and _expr_derives_from_file(sub.value, names, funcs)
                    ):
                        funcs.add(node.name)
                        changed = True
                        break
        if not changed:
            break
    return names, funcs


def _iterated_calls(tree: ast.Module) -> set:
    """Call nodes whose RESULT is consumed as an iterable.

    ``for v in guard.iter_scanned_files(ROOT)`` and
    ``list(guard.run_all(ROOT))`` both walk whatever the callee walked.
    Narrow on purpose: an ordinary ``helper(ROOT)`` whose result is
    compared or asserted is not evidence that anything was enumerated.
    """
    consumers = {"list", "sorted", "set", "tuple", "frozenset", "any", "all", "sum"}
    found = set()

    def take(node: Optional[ast.AST]) -> None:
        if isinstance(node, ast.Call):
            found.add(id(node))

    for node in ast.walk(tree):
        if isinstance(node, (ast.For, ast.AsyncFor)):
            take(node.iter)
        elif isinstance(node, ast.comprehension):
            take(node.iter)
        elif isinstance(node, ast.Call):
            callee = getattr(node.func, "attr", None) or getattr(node.func, "id", None)
            if callee in consumers:
                for arg in node.args:
                    take(arg)
    return found


def _enumerates_derived_path(tree: ast.Module) -> bool:
    """Is a ``__file__``-derived path actually enumerated?

    Two shapes count, both syntactically checkable. The path is
    enumerated **here** (``ROOT.rglob(...)``, ``os.walk(ROOT)``), or it is
    handed to a call **whose result is iterated**
    (``list(guard.iter_scanned_files(_repo_root()))``) -- which is how the
    repository-is-the-system-under-test guards reach the tree.
    """
    names, funcs = _repo_derived_bindings(tree)
    iterated = _iterated_calls(tree)
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if isinstance(func, ast.Attribute) and func.attr in _ENUMERATION_METHODS:
            host = func.value
            if isinstance(host, ast.Name) and host.id in _OS_ENUMERATION_HOSTS:
                if node.args and _expr_derives_from_file(node.args[0], names, funcs):
                    return True
                continue
            if _expr_derives_from_file(host, names, funcs):
                return True
            continue
        if id(node) not in iterated:
            continue
        callee = getattr(func, "attr", None) or getattr(func, "id", None)
        if callee in _PATH_PLUMBING:
            continue
        for arg in list(node.args) + [kw.value for kw in node.keywords]:
            if _expr_derives_from_file(arg, names, funcs):
                return True
    return False


def coupling_detectors(text: str, tree: Optional[ast.Module] = None) -> Dict[str, bool]:
    """All named detectors, evaluated independently."""
    code = _code_only(text)
    path_file = bool(_RE_PATH_DUNDER_FILE.search(text))
    parents = bool(_RE_PARENTS_INDEX.search(text))
    repo_const = bool(_RE_REPO_ROOT_CONST.search(text))
    if tree is None:
        tree = _parse(text, "<inline>")
    if tree is not None:
        derives = any(
            (isinstance(n, ast.Name) and n.id == "__file__")
            or (isinstance(n, ast.Attribute) and n.attr == "__file__")
            for n in ast.walk(tree)
        )
        enumerates_here = _enumerates_derived_path(tree)
    else:
        derives = bool(_RE_DUNDER_FILE.search(code))
        enumerates_here = derives and bool(_RE_ENUMERATES.search(code))
    return {
        "D1-spec-prose": path_file or parents or repo_const,
        "D2-bare-file": bool(_RE_DUNDER_FILE.search(text)) or parents or repo_const,
        "D3-derives-repo-path": derives,
        "D3a-enumerates-anywhere": derives and bool(_RE_ENUMERATES.search(code)),
        "D4-enumerates-real-tree": derives and enumerates_here,
    }


def coupling_tier(detectors: Dict[str, bool]) -> str:
    """The published ``coupling.tier`` predicate."""
    if detectors["D4-enumerates-real-tree"]:
        return TIER_STRONG
    if detectors["D3-derives-repo-path"]:
        return TIER_WEAK
    if detectors["D2-bare-file"]:
        return TIER_NAMES_ONLY
    return TIER_SANDBOXED


def _marker_guards(tree: Optional[ast.Module]) -> List[str]:
    """Functions carrying @pytest.mark.guard(...) -- the Session 2 convention."""
    if tree is None:
        return []
    names: List[str] = []
    defs = (ast.FunctionDef, ast.AsyncFunctionDef)

    def has_guard(node) -> bool:
        for dec in node.decorator_list:
            target = dec.func if isinstance(dec, ast.Call) else dec
            if isinstance(target, ast.Attribute) and target.attr == "guard":
                value = target.value
                if isinstance(value, ast.Attribute) and value.attr == "mark":
                    return True
        return False

    for node in ast.walk(tree):
        if isinstance(node, defs) and has_guard(node):
            names.append(node.name)
    return names


def guard_function_names(tree: Optional[ast.Module]) -> List[str]:
    """Test functions whose NAME asserts absence or permanence."""
    if tree is None:
        return []
    names: List[str] = []
    defs = (ast.FunctionDef, ast.AsyncFunctionDef)
    for node in ast.walk(tree):
        if not isinstance(node, defs) or not node.name.startswith("test_"):
            continue
        if any(signal in node.name for signal in _GUARD_FUNCNAME_SIGNALS):
            names.append(node.name)
    return names


def _heuristic_guard_evidence(
    path: str, tree: Optional[ast.Module], test_functions: int, guard_functions: int
) -> List[str]:
    """The published ``guard.heuristic`` predicate. Evidence, not a verdict."""
    evidence: List[str] = []
    base = os.path.basename(path)
    if "guard" in base:
        evidence.append(f"filename contains 'guard': {base}")
    if _RE_SET_IN_FILENAME.search(base):
        evidence.append(f"filename pins a numbered set: {base}")
    doc = (ast.get_docstring(tree) or "") if tree is not None else ""
    lowered = doc.lower()
    for signal in _GUARD_DOCSTRING_SIGNALS:
        if signal in lowered:
            evidence.append(f"module docstring asserts permanence: '{signal}'")
            break
    # The majority clause: one absence-shaped test in a large behaviour
    # file is not a guard file, and calling it one made the population
    # 53 files / 1,838 functions -- useless to Session 2's rule.
    if guard_functions >= 2 and test_functions and guard_functions * 2 >= test_functions:
        evidence.append(
            f"{guard_functions} of {test_functions} test functions are guard-shaped"
        )
    return evidence


def guarded_set_number(path: str, tree: Optional[ast.Module]) -> Optional[int]:
    """The set a guard pins, from its filename or its module docstring."""
    match = _RE_SET_IN_FILENAME.search(os.path.basename(path))
    if match:
        return int(match.group(1))
    doc = (ast.get_docstring(tree) or "") if tree is not None else ""
    match = _RE_SET_IN_DOCSTRING.search(doc)
    if match:
        return int(match.group(1))
    return None


def latest_set_number(root: Path) -> Optional[int]:
    """Highest set number under docs/session-sets/ -- the 'now' for guard age."""
    base = root / SESSION_SETS_DIR
    if not base.is_dir():
        return None
    numbers = [
        int(m.group(1))
        for entry in base.iterdir()
        if entry.is_dir()
        for m in [_RE_SET_DIR.match(entry.name)]
        if m
    ]
    return max(numbers) if numbers else None


# ---------------------------------------------------------------------------
# git dates -- one pass over history, not one process per file
# ---------------------------------------------------------------------------


def file_dates(root: Path, rev: Optional[str]) -> Dict[str, Tuple[str, str]]:
    """``{path: (first_seen, last_modified)}`` as ISO dates.

    Renames are NOT followed: a renamed file's first-seen is the date it
    appeared at its current path. Stated rather than hidden -- following
    renames would need per-file ``--follow`` and hundreds of processes.
    """
    args = ["log", "--format=%x01%aI", "--name-only", "--no-renames"]
    if rev:
        args.append(rev)
    args += ["--", TESTS_PREFIX, PRODUCTION_PREFIX]
    try:
        out = _git(root, *args)
    except CorpusError:
        return {}
    dates: Dict[str, Tuple[str, str]] = {}
    current = ""
    for line in out.splitlines():
        if line.startswith("\x01"):
            current = line[1:].strip()[:10]
            continue
        path = line.strip()
        if not path or not current or not _relevant(path):
            continue
        # git log is newest-first: the first sighting is last-modified,
        # and every later sighting overwrites first-seen downward.
        if path in dates:
            dates[path] = (current, dates[path][1])
        else:
            dates[path] = (current, current)
    return dates


# ---------------------------------------------------------------------------
# The inventory
# ---------------------------------------------------------------------------


@dataclass
class TestFileRecord:
    path: str
    test_functions: int
    test_functions_ast: int
    loc: int
    parametrize_decorators: int
    imports: List[str]
    dynamic_import_calls: int
    coupling: Dict[str, bool]
    tier: str
    guard: bool
    guard_source: Optional[str]
    guard_evidence: List[str]
    guard_functions: List[str]
    guarded_set: Optional[int]
    age_in_sets: Optional[int]
    marker_guard_functions: List[str]
    sole_cover_for: List[str]
    first_seen: Optional[str]
    last_modified: Optional[str]

    def to_dict(self) -> dict:
        return {
            "path": self.path,
            "testFunctions": self.test_functions,
            "testFunctionsAst": self.test_functions_ast,
            "loc": self.loc,
            "parametrizeDecorators": self.parametrize_decorators,
            "imports": self.imports,
            "dynamicImportCalls": self.dynamic_import_calls,
            "coupling": {
                "detectors": self.coupling,
                "tier": self.tier,
            },
            "guard": {
                "isGuard": self.guard,
                "source": self.guard_source,
                "evidence": self.guard_evidence,
                "guardShapedFunctions": self.guard_functions,
                "guardedSet": self.guarded_set,
                "ageInSets": self.age_in_sets,
                "markerFunctions": self.marker_guard_functions,
            },
            "soleCoverFor": self.sole_cover_for,
            "firstSeen": self.first_seen,
            "lastModified": self.last_modified,
        }


@dataclass
class Inventory:
    corpus_kind: str
    rev: Optional[str]
    root: str
    latest_set: Optional[int]
    files: List[TestFileRecord]
    production_files: int
    production_loc: int
    module_cover: Dict[str, List[str]]
    uncovered_modules: List[str]
    unresolved_dynamic_files: List[str]
    entry_point_modules: List[str]

    # -- totals -------------------------------------------------------------

    @property
    def test_files(self) -> int:
        return len(self.files)

    @property
    def test_functions(self) -> int:
        return sum(f.test_functions for f in self.files)

    @property
    def test_functions_ast(self) -> int:
        return sum(f.test_functions_ast for f in self.files)

    @property
    def test_loc(self) -> int:
        return sum(f.loc for f in self.files)

    @property
    def parametrize_decorators(self) -> int:
        return sum(f.parametrize_decorators for f in self.files)

    @property
    def ratio(self) -> float:
        return (self.test_loc / self.production_loc) if self.production_loc else 0.0

    def detector_totals(self) -> Dict[str, Dict[str, int]]:
        names = [
            "D1-spec-prose",
            "D2-bare-file",
            "D3-derives-repo-path",
            "D3a-enumerates-anywhere",
            "D4-enumerates-real-tree",
        ]
        out: Dict[str, Dict[str, int]] = {}
        for name in names:
            hits = [f for f in self.files if f.coupling[name]]
            out[name] = {
                "files": len(hits),
                "testFunctions": sum(f.test_functions for f in hits),
            }
        return out

    def tier_totals(self) -> Dict[str, Dict[str, int]]:
        out: Dict[str, Dict[str, int]] = {}
        for tier in (TIER_STRONG, TIER_WEAK, TIER_NAMES_ONLY, TIER_SANDBOXED):
            hits = [f for f in self.files if f.tier == tier]
            out[tier] = {
                "files": len(hits),
                "testFunctions": sum(f.test_functions for f in hits),
            }
        return out

    @property
    def guards(self) -> List[TestFileRecord]:
        return [f for f in self.files if f.guard]

    @property
    def sole_cover_files(self) -> List[TestFileRecord]:
        return [f for f in self.files if f.sole_cover_for]

    def to_dict(self) -> dict:
        return {
            "contractVersion": JSON_CONTRACT_VERSION,
            "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "corpus": {
                "kind": self.corpus_kind,
                "rev": self.rev,
                "root": self.root,
                "latestSet": self.latest_set,
            },
            "predicates": PREDICATES,
            "totals": {
                "testFiles": self.test_files,
                "testFunctions": self.test_functions,
                "testFunctionsAst": self.test_functions_ast,
                "testLoc": self.test_loc,
                "parametrizeDecorators": self.parametrize_decorators,
                "productionFiles": self.production_files,
                "productionLoc": self.production_loc,
                "testToProductionRatio": round(self.ratio, 4),
            },
            "coupling": {
                "detectors": self.detector_totals(),
                "tiers": self.tier_totals(),
            },
            "guards": {
                "files": len(self.guards),
                "testFunctions": sum(f.test_functions for f in self.guards),
                "byMarker": len([f for f in self.guards if f.guard_source == "marker"]),
                "byHeuristic": len([f for f in self.guards if f.guard_source == "heuristic"]),
            },
            "soleCover": {
                "modulesWithSingleCover": sum(
                    1 for covers in self.module_cover.values() if len(covers) == 1
                ),
                "modulesWithNoCover": len(self.uncovered_modules),
                "uncoveredModules": self.uncovered_modules,
                "entryPointModules": self.entry_point_modules,
                "unresolvedDynamicImportFiles": self.unresolved_dynamic_files,
            },
            "files": [f.to_dict() for f in self.files],
        }


def build_inventory(root: Path, rev: Optional[str] = None, dates: bool = True) -> Inventory:
    corpus = load_corpus(root, rev)
    index = build_module_index(corpus)
    latest_set = latest_set_number(root)
    date_map = file_dates(root, rev) if dates else {}

    parsed: List[Tuple[str, str, Optional[ast.Module]]] = []
    production_files = 0
    production_loc = 0
    for path in corpus.paths:
        if is_production_module(path):
            production_files += 1
            production_loc += count_loc(corpus.read(path))
            continue
        text = corpus.read(path)
        parsed.append((path, text, _parse(text, path)))

    # First pass: imports, so sole-cover can be computed before records exist.
    module_cover: Dict[str, List[str]] = {
        p: [] for p in corpus.paths if is_production_module(p)
    }
    entry_points = _entry_point_modules(corpus, index)
    per_file_imports: Dict[str, List[str]] = {}
    per_file_dynamic: Dict[str, int] = {}
    unresolved_dynamic: List[str] = []
    for path, text, tree in parsed:
        mods = set(imported_production_modules(tree, index))
        dynamic = _dynamic_import_calls(tree)
        per_file_dynamic[path] = dynamic
        if dynamic:
            # A non-literal import_module() is unresolvable by static
            # analysis. Where the file also reads pyproject.toml, the
            # DECLARED console-script targets complete the map; otherwise
            # the hole is recorded rather than silently read as "imports
            # nothing", which is what made report.py look uncovered.
            # entry_points is None when the declaration could not be READ
            # (no tomllib on Python 3.10, malformed TOML) -- that fails
            # CLOSED to an unresolved hole, never to a confident zero.
            if PYPROJECT_PATH in text and entry_points:
                mods.update(entry_points)
            else:
                unresolved_dynamic.append(path)
        per_file_imports[path] = sorted(mods)
        for mod in sorted(mods):
            module_cover.setdefault(mod, []).append(path)

    sole_cover: Dict[str, List[str]] = {}
    for mod, covers in module_cover.items():
        if len(covers) == 1:
            sole_cover.setdefault(covers[0], []).append(mod)

    files: List[TestFileRecord] = []
    for path, text, tree in parsed:
        detectors = coupling_detectors(text, tree)
        markers = _marker_guards(tree)
        n_tests = count_test_functions(text)
        guard_fns = guard_function_names(tree)
        evidence = _heuristic_guard_evidence(path, tree, n_tests, len(guard_fns))
        if markers:
            guard, source = True, "marker"
            guard_evidence = [f"@pytest.mark.guard on {name}" for name in markers]
        elif evidence:
            guard, source = True, "heuristic"
            guard_evidence = evidence
        else:
            guard, source, guard_evidence = False, None, []
        guarded_set = guarded_set_number(path, tree) if guard else None
        age = (
            latest_set - guarded_set
            if (guard and guarded_set is not None and latest_set is not None)
            else None
        )
        first_seen, last_modified = date_map.get(path, (None, None))
        files.append(
            TestFileRecord(
                path=path,
                test_functions=n_tests,
                test_functions_ast=count_test_functions_ast(tree),
                loc=count_loc(text),
                parametrize_decorators=len(_RE_PARAMETRIZE.findall(text)),
                imports=per_file_imports[path],
                dynamic_import_calls=per_file_dynamic[path],
                coupling=detectors,
                tier=coupling_tier(detectors),
                guard=guard,
                guard_source=source,
                guard_evidence=guard_evidence,
                guard_functions=guard_fns,
                guarded_set=guarded_set,
                age_in_sets=age,
                marker_guard_functions=markers,
                sole_cover_for=sorted(sole_cover.get(path, [])),
                first_seen=first_seen,
                last_modified=last_modified,
            )
        )

    uncovered = sorted(mod for mod, covers in module_cover.items() if not covers)
    return Inventory(
        corpus_kind=corpus.kind,
        rev=rev,
        root=str(root),
        latest_set=latest_set,
        files=files,
        production_files=production_files,
        production_loc=production_loc,
        module_cover=module_cover,
        uncovered_modules=uncovered,
        unresolved_dynamic_files=sorted(unresolved_dynamic),
        entry_point_modules=entry_points or [],
    )


# ---------------------------------------------------------------------------
# Rendering (ASCII only -- cp1252 console convention)
# ---------------------------------------------------------------------------


def _rule(title: str) -> str:
    return f"\n{title}\n" + "-" * len(title)


def render_predicates() -> str:
    lines = [_rule("Predicates (every number below names one)")]
    for name, text in PREDICATES.items():
        lines.append(f"  {name}:")
        for chunk in _wrap(text, 68):
            lines.append(f"      {chunk}")
    return "\n".join(lines)


def _wrap(text: str, width: int) -> List[str]:
    words = text.split()
    lines: List[str] = []
    current = ""
    for word in words:
        if current and len(current) + 1 + len(word) > width:
            lines.append(current)
            current = word
        else:
            current = f"{current} {word}".strip()
    if current:
        lines.append(current)
    return lines


def render(inv: Inventory, *, predicates: bool = True, guards_only: bool = False) -> str:
    out: List[str] = []
    corpus = f"rev {inv.rev}" if inv.rev else "working tree (untracked included)"
    out.append("Test inventory -- ai_router/tests")
    out.append(f"corpus: {corpus}   root: {inv.root}")
    if inv.latest_set is not None:
        out.append(f"latest set on disk: {inv.latest_set} (the 'now' for guard age)")

    if not guards_only:
        if predicates:
            out.append(render_predicates())

        out.append(_rule("Volume"))
        out.append(f"  test files                 {inv.test_files:>8,}")
        out.append(f"  test functions (line)      {inv.test_functions:>8,}")
        ast_note = "" if inv.test_functions_ast == inv.test_functions else "   <-- differs, see predicate"
        out.append(f"  test functions (AST)       {inv.test_functions_ast:>8,}{ast_note}")
        out.append(f"  test LOC                   {inv.test_loc:>8,}")
        out.append(f"  parametrize decorators     {inv.parametrize_decorators:>8,}")
        out.append(f"  production modules         {inv.production_files:>8,}")
        out.append(f"  production LOC             {inv.production_loc:>8,}")
        out.append(f"  test / production ratio    {inv.ratio:>8.2f}")

        out.append(_rule("Coupling -- named detectors, not one unnamed regex"))
        out.append("  detector                      files   test functions")
        for name, totals in inv.detector_totals().items():
            out.append(
                f"    {name:<26} {totals['files']:>5}   {totals['testFunctions']:>10,}"
            )
        out.append("")
        out.append("  tier (this tool's answer)     files   test functions")
        labels = {
            TIER_STRONG: "strong (enumerates tree)",
            TIER_WEAK: "weak (locates package)",
            TIER_NAMES_ONLY: "names-only (NOT coupling)",
            TIER_SANDBOXED: "sandboxed",
        }
        for tier, totals in inv.tier_totals().items():
            out.append(
                f"    {labels[tier]:<26} {totals['files']:>5}   {totals['testFunctions']:>10,}"
            )
        strong = inv.tier_totals()[TIER_STRONG]
        out.append("")
        out.append(
            f"  Strong coupling is {strong['files']} files / {strong['testFunctions']} "
            "test functions. That is the change-amplification tax."
        )

    out.append(_rule("Guards"))
    guards = inv.guards
    out.append(
        f"  {len(guards)} guard files carrying "
        f"{sum(f.test_functions for f in guards):,} test functions "
        f"({len([f for f in guards if f.guard_source == 'marker'])} by marker, "
        f"{len([f for f in guards if f.guard_source == 'heuristic'])} by heuristic)"
    )
    aged = sorted(
        (f for f in guards if f.age_in_sets is not None),
        key=lambda f: (-f.age_in_sets, -f.test_functions),
    )
    if aged:
        out.append("")
        out.append("  oldest first -- age is the input Session 2's rule consumes")
        out.append("  tests  set  age  sole-cover  file")
        for rec in aged[:25]:
            sole = "YES" if rec.sole_cover_for else "-"
            out.append(
                f"  {rec.test_functions:>5}  {rec.guarded_set:>3}  {rec.age_in_sets:>3}  "
                f"{sole:^10}  {os.path.basename(rec.path)}"
            )
        if len(aged) > 25:
            out.append(f"  ... and {len(aged) - 25} more (see --json)")
    undated = [f for f in guards if f.age_in_sets is None]
    if undated:
        out.append(
            f"  {len(undated)} guard files name no set, so no age can be "
            "derived -- these need the Session 2 marker most."
        )

    if not guards_only:
        out.append(_rule("Sole cover (A1) -- retiring these changes what 'targeted' means"))
        single = sum(1 for covers in inv.module_cover.values() if len(covers) == 1)
        out.append(f"  {single} production modules are covered by exactly ONE test file")
        out.append(f"  {len(inv.sole_cover_files)} test files are the sole cover for at least one module")
        out.append(f"  {len(inv.uncovered_modules)} production modules have NO test file importing them")
        if inv.entry_point_modules:
            out.append(
                f"  {len(inv.entry_point_modules)} of those are pyproject console-script "
                "targets, credited to the test that imports them dynamically"
            )
        if inv.unresolved_dynamic_files:
            out.append(
                f"  [!] {len(inv.unresolved_dynamic_files)} file(s) make an unresolvable "
                "dynamic import -- the map has a hole there, not a zero:"
            )
            for path in inv.unresolved_dynamic_files[:10]:
                out.append(f"        {os.path.basename(path)}")
        risky = sorted(
            (f for f in inv.sole_cover_files if f.guard),
            key=lambda f: -len(f.sole_cover_for),
        )
        if risky:
            out.append("")
            out.append("  guard AND sole cover -- never eligible for a bulk pass:")
            for rec in risky[:15]:
                mods = ", ".join(os.path.basename(m) for m in rec.sole_cover_for[:3])
                more = "" if len(rec.sole_cover_for) <= 3 else f" (+{len(rec.sole_cover_for) - 3})"
                out.append(f"    {os.path.basename(rec.path)} -> {mods}{more}")
            if len(risky) > 15:
                out.append(f"    ... and {len(risky) - 15} more (see --json)")

    return "\n".join(out) + "\n"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _default_root() -> Path:
    return Path(__file__).resolve().parent.parent


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m ai_router.suite_inventory",
        description=(
            "Inventory the pytest suite: volume, coupling, guards and sole "
            "cover. Publishes the predicate behind every number -- a count "
            "nobody can re-derive is not evidence."
        ),
    )
    parser.add_argument(
        "--rev",
        help=(
            "read the corpus from this git revision instead of the working "
            "tree (tracked content only). Use it to reproduce a historical "
            "figure, e.g. --rev ab47a3e7."
        ),
    )
    parser.add_argument(
        "--root",
        default=None,
        help="repository root (defaults to the package's own repo).",
    )
    parser.add_argument("--json", dest="json_path", help="write the JSON contract to this path.")
    parser.add_argument(
        "--stdout-json", action="store_true", help="emit the JSON contract on stdout."
    )
    parser.add_argument(
        "--guards", action="store_true", help="render only the guard section."
    )
    parser.add_argument(
        "--no-predicates",
        action="store_true",
        help="omit the predicate preamble from the human report.",
    )
    parser.add_argument(
        "--no-dates",
        action="store_true",
        help="skip the git history pass (first-seen / last-modified become null).",
    )
    args = parser.parse_args(argv)

    root = Path(args.root).resolve() if args.root else _default_root()
    try:
        inv = build_inventory(root, rev=args.rev, dates=not args.no_dates)
    except CorpusError as exc:
        print(f"[x] {exc}", file=sys.stderr)
        return 2

    if args.json_path:
        Path(args.json_path).write_text(
            json.dumps(inv.to_dict(), indent=2) + "\n", encoding="utf-8"
        )
        print(f"[x] wrote {args.json_path}")
    if args.stdout_json:
        print(json.dumps(inv.to_dict(), indent=2))
        return 0
    print(render(inv, predicates=not args.no_predicates, guards_only=args.guards))
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry
    sys.exit(main())
