"""Bounded evidence for a review: seven tiers, nothing else.

Given a diff and a module slug, this resolves exactly the evidence the
reviewer is entitled to by default. Tiers 1-4 are bounded by the change
itself; tiers 5-7 are bounded by the module:

1. every modified file                             -- full content
2. direct callers of the changed symbols            -- full content
3. test files that import the modified files        -- full content
4. files referenced *in code* by the modified files, ONE HOP
                                   -- interface only where a real parser
                                      exists, otherwise full content
5. spec sections mapped to the module in the manifest
6. manifest-declared context assets (schemas, config, migrations)
7. the module's path listing                        -- names only

The module is one boundary, not the only one: a change that reaches
outside the module's ``codeRoots`` is still reviewed in full, because
tier 1 is bounded by the diff. ``codeRoots`` bounds tier 7 alone.

Everything else is excluded, and every exclusion is recorded with its
reason: an exclusion nobody can see is indistinguishable from a bug.
Tier 4 is one hop with no transitive closure, tier 5 is *mapped* rather
than searched, and every tier is resolved mechanically from the diff and
the manifest -- no model decides what a reviewer may read.

Tier 4 elides implementation bodies only where a real parser can say
what a body is: Python, through ``ast``. Any other language is carried
in full. A hand-rolled scanner that guesses at a contract is worse than
no extraction at all -- it hands the reviewer text that reads like a
signature but is not one, which is the silent-truncation failure wearing
a different hat. If measurement later shows tier 4 is too heavy, the
answer is that language's own declaration emitter, not a scanner.

The resolver refuses rather than trims. An undeclared slug has no
manifest entry to bound tiers 5-7 (:class:`ScopeUnavailable`, the
caller's cue to stay on the unscoped path); a scope over its char budget
names the remedy (:class:`ScopeTooLarge`). Silent shrinkage is the
failure mode this module exists to end.
"""

from __future__ import annotations

import ast
import os
import posixpath
import re
from dataclasses import dataclass
from pathlib import Path

from .modules import find_entry

TIER_MODIFIED = 1
TIER_CALLERS = 2
TIER_TESTS = 3
TIER_INTERFACE = 4
TIER_SPEC = 5
TIER_ASSETS = 6
TIER_MODULE_PATHS = 7

TIER_TITLES = {
    TIER_MODIFIED: "Modified files",
    TIER_CALLERS: "Direct callers of the changed symbols",
    TIER_TESTS: "Test files that import the modified files",
    TIER_INTERFACE: "Interface surface of files referenced in code (one hop)",
    TIER_SPEC: "Spec sections mapped to the module",
    TIER_ASSETS: "Manifest-declared context assets",
    TIER_MODULE_PATHS: "Module path listing (names only)",
}

CONTENT_FULL = "full"
CONTENT_INTERFACE = "interface"
CONTENT_NAMES = "names"

DEFAULT_FILE_CHAR_CAP = 64 * 1024
DEFAULT_SCOPE_CHAR_BUDGET = 200 * 1024
# Files larger than the inline cap are still searched for tier 2/3
# matches up to this size, so an oversized caller is reported rather
# than silently missed.
MATCH_SCAN_CAP = 256 * 1024

SKIP_DIRS = frozenset({
    ".git", ".venv", "__pycache__", "node_modules", "dist", "out",
    ".dabbler", ".mypy_cache", ".pytest_cache", ".ruff_cache",
})

# A symbol shorter than this matches too much prose to be a caller signal.
_MIN_SYMBOL_LEN = 3


class ScopeError(RuntimeError):
    """Base class for scope-resolution failures."""


class ScopeUnavailable(ScopeError):
    """The manifest declares no such module, so tiers 5-7 have nothing to
    resolve against. The caller falls back to the unscoped bundle --
    never to a guess at what the module is."""


class ScopeTooLarge(ScopeError):
    """The bounded scope still exceeds its char budget. Refused, never
    trimmed: a silently shortened review bundle reads as a complete
    one."""


@dataclass(frozen=True)
class ScopeEntry:
    path: str            # repo-relative, forward-slashed
    tier: int
    content_kind: str    # CONTENT_FULL | CONTENT_INTERFACE | CONTENT_NAMES
    text: str | None     # None only for CONTENT_NAMES


@dataclass(frozen=True)
class Exclusion:
    subject: str
    reason: str


@dataclass(frozen=True)
class ContextScope:
    module: str
    entries: tuple
    exclusions: tuple
    changed_symbols: tuple
    changes_outside_code_roots: tuple

    def tier(self, number: int) -> list:
        return [e for e in self.entries if e.tier == number]

    @property
    def total_chars(self) -> int:
        return sum(len(e.text) for e in self.entries if e.text)


# --- diff reading -----------------------------------------------------------

_DIFF_GIT = re.compile(r"^diff --git a/(.+?) b/(.+)$")
_HUNK = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")


def changed_paths(diff: str) -> dict:
    """``{repo-relative path: [(first_line, last_line), ...]}`` for the
    post-image of a unified diff. Deleted files map to an empty range
    list -- they are reported, never read."""
    out: dict = {}
    current = None
    for line in (diff or "").splitlines():
        match = _DIFF_GIT.match(line)
        if match:
            current = _norm(match.group(2))
            out.setdefault(current, [])
            continue
        if line.startswith("+++ "):
            target = line[4:].strip()
            if target == "/dev/null":
                continue
            current = _norm(target[2:] if target.startswith("b/") else target)
            out.setdefault(current, [])
            continue
        hunk = _HUNK.match(line)
        if hunk and current:
            start = int(hunk.group(1))
            count = int(hunk.group(2)) if hunk.group(2) is not None else 1
            if count == 0:
                continue  # pure deletion: no post-image lines to point at
            out[current].append((start, start + count - 1))
    return out


def _norm(path) -> str:
    """A repo-relative, forward-slashed path. ``lstrip("./")`` would eat
    the leading dot of ``.github/workflows/ci.yml`` -- it strips a
    character set, not a prefix."""
    text = str(path).replace("\\", "/")
    while text.startswith("./"):
        text = text[2:]
    return text.lstrip("/")


# --- text handling ----------------------------------------------------------

_HASH_COMMENT = {".py", ".ps1", ".psm1", ".psd1", ".sh", ".yaml", ".yml",
                 ".toml", ".cfg", ".ini", ".rb", ".r"}
_SLASH_COMMENT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".c", ".h",
                  ".cpp", ".cs", ".java", ".go", ".rs", ".swift", ".kt"}

# Tiers 2 and 3 look for callers and importers. Only code can call, so a
# match inside prose or a data file is not a caller.
CODE_SUFFIXES = frozenset(
    _SLASH_COMMENT | {".py", ".ps1", ".psm1", ".sh", ".rb"}
)


def strip_comments(text: str, suffix: str) -> str:
    """Comment-free text for reference detection. Quote-aware so a ``#``
    or ``//`` inside a string literal is not mistaken for a comment.
    Tier 4 says *referenced in code*, and a path named in a comment is
    not a reference."""
    suffix = suffix.lower()
    if suffix in _HASH_COMMENT:
        return _strip_line_comments(text, ("#",))
    if suffix in _SLASH_COMMENT:
        return _strip_block_comments(_strip_line_comments(text, ("//",)))
    return text


def _strip_line_comments(text: str, markers: tuple) -> str:
    out = []
    for line in text.splitlines():
        quote = None
        cut = len(line)
        index = 0
        while index < len(line):
            char = line[index]
            if quote:
                if char == "\\":
                    index += 2
                    continue
                if char == quote:
                    quote = None
            elif char in "\"'`":
                quote = char
            else:
                if any(line.startswith(m, index) for m in markers):
                    cut = index
                    break
            index += 1
        out.append(line[:cut])
    return "\n".join(out)


def _strip_block_comments(text: str) -> str:
    return re.sub(r"/\*.*?\*/", " ", text, flags=re.S)


def read_text(path: Path, char_cap: int = DEFAULT_FILE_CHAR_CAP):
    """``(text, refusal_reason)``. Exactly one is ``None``."""
    try:
        if path.is_symlink():
            return None, "symlink (not followed)"
        size = path.stat().st_size
        if size > char_cap:
            return None, f"oversized ({size} bytes, cap {char_cap})"
        return path.read_bytes().decode("utf-8"), None
    except UnicodeDecodeError:
        return None, "binary / non-UTF-8"
    except OSError:
        return None, "unreadable"


# --- python parsing ---------------------------------------------------------

def changed_symbols(text: str, ranges) -> set:
    """Names defined by the hunks: functions, classes, and module-level
    constants whose definition overlaps a changed line range. An
    unparseable file yields no symbols rather than a guess."""
    try:
        tree = ast.parse(text)
    except (SyntaxError, ValueError):
        return set()
    spans = list(ranges or [])
    names: set = set()

    def _overlaps(node) -> bool:
        if not spans:
            return True
        start = getattr(node, "lineno", 0)
        end = getattr(node, "end_lineno", start) or start
        return any(start <= hi and end >= lo for lo, hi in spans)

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef,
                             ast.ClassDef)) and _overlaps(node):
            names.add(node.name)
    for node in tree.body:
        if isinstance(node, ast.Assign) and _overlaps(node):
            names.update(
                t.id for t in node.targets if isinstance(t, ast.Name)
            )
        elif isinstance(node, ast.AnnAssign) and _overlaps(node):
            if isinstance(node.target, ast.Name):
                names.add(node.target.id)
    return {
        name for name in names
        if len(name) >= _MIN_SYMBOL_LEN and not name.startswith("__")
    }


class _InterfaceOnly(ast.NodeTransformer):
    """Replace every function body with its docstring plus ``...``. The
    docstring stays because it is the contract; the body goes because it
    is the implementation."""

    def _elide(self, node):
        self.generic_visit(node)
        body = []
        if (node.body and isinstance(node.body[0], ast.Expr)
                and isinstance(node.body[0].value, ast.Constant)
                and isinstance(node.body[0].value.value, str)):
            body.append(node.body[0])
        body.append(ast.Expr(value=ast.Constant(value=Ellipsis)))
        node.body = body
        return node

    visit_FunctionDef = _elide
    visit_AsyncFunctionDef = _elide


def interface_surface(text: str):
    """``(rendered, refusal_reason)`` -- signatures, annotations, class
    and constant declarations, docstrings; no function bodies. Extracted
    by parsing, never by asking a model."""
    try:
        tree = ast.parse(text)
    except (SyntaxError, ValueError) as exc:
        return None, f"unparseable Python ({exc.__class__.__name__})"
    try:
        return ast.unparse(ast.fix_missing_locations(
            _InterfaceOnly().visit(tree)
        )), None
    except (AttributeError, ValueError) as exc:
        return None, f"interface extraction failed ({exc})"


def _python_module_candidates(dotted: str, level: int, source_rel: str):
    """Repo-relative candidate files for one import, absolute or
    relative. Nothing here touches the filesystem."""
    if level:
        base = source_rel.rsplit("/", 1)[0] if "/" in source_rel else ""
        parts = base.split("/") if base else []
        parts = parts[: len(parts) - (level - 1)] if level > 1 else parts
        prefix = "/".join(parts)
        stem = f"{prefix}/{dotted.replace('.', '/')}" if dotted else prefix
    else:
        stem = dotted.replace(".", "/")
    stem = stem.strip("/")
    if not stem:
        return []
    parent = stem.rsplit("/", 1)[0] if "/" in stem else ""
    return [
        f"{stem}.py", f"{stem}/__init__.py",
        f"{parent}.py" if parent else "",
    ]


def _python_references(text: str, source_rel: str, repo_root: Path) -> set:
    try:
        tree = ast.parse(text)
    except (SyntaxError, ValueError):
        return set()
    found: set = set()
    for node in ast.walk(tree):
        candidates: list = []
        if isinstance(node, ast.Import):
            for alias in node.names:
                candidates += _python_module_candidates(alias.name, 0,
                                                        source_rel)
        elif isinstance(node, ast.ImportFrom):
            candidates += _python_module_candidates(
                node.module or "", node.level or 0, source_rel
            )
            for alias in node.names:
                dotted = f"{node.module}.{alias.name}" if node.module \
                    else alias.name
                candidates += _python_module_candidates(
                    dotted, node.level or 0, source_rel
                )
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            candidates.append(_norm(node.value))
        for candidate in candidates:
            if candidate and (repo_root / candidate).is_file():
                found.add(candidate)
    return found


_PATHISH = re.compile(r"[A-Za-z0-9_./\\-]+\.[A-Za-z0-9]{1,5}")


# --- typescript / javascript parsing ----------------------------------------

_JS_SUFFIXES = frozenset({".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"})
# Module resolution order for an extensionless specifier, TypeScript first
# because a .ts source is the contract its emitted .js only reflects.
_JS_RESOLVE_EXTS = (".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs")

_JS_IMPORT = re.compile(
    r"""\b(?:from|import|require)\s*\(?\s*['"]([^'"\n]+)['"]"""
)


def _resolve_js_specifier(spec: str, source_rel: str, repo_root: Path):
    """The repo file a relative specifier names, or ``None``. A bare
    specifier is a package, not a repo file, and is not a reference."""
    if not spec.startswith("."):
        return None
    base = _norm(posixpath.normpath(
        posixpath.join(posixpath.dirname(source_rel), spec)
    ))
    if not base or base.startswith(".."):
        return None
    candidates = [base] if Path(base).suffix else []
    candidates += [f"{base}{ext}" for ext in _JS_RESOLVE_EXTS]
    candidates += [f"{base}/index{ext}" for ext in _JS_RESOLVE_EXTS]
    for candidate in candidates:
        if (repo_root / candidate).is_file():
            return candidate
    return None


def _js_references(code: str, source_rel: str, repo_root: Path) -> set:
    found: set = set()
    for spec in _JS_IMPORT.findall(code):
        resolved = _resolve_js_specifier(spec, source_rel, repo_root)
        if resolved and resolved != source_rel:
            found.add(resolved)
    return found


def _textual_references(code: str, source_rel: str, repo_root: Path) -> set:
    parent = source_rel.rsplit("/", 1)[0] if "/" in source_rel else ""
    found: set = set()
    for raw in _PATHISH.findall(code):
        candidate = _norm(raw)
        for rel in (candidate,
                    f"{parent}/{candidate}" if parent else candidate):
            rel = rel.strip("/")
            if rel and rel != source_rel and (repo_root / rel).is_file():
                found.add(rel)
    return found


# --- walking ----------------------------------------------------------------

def _walk(repo_root: Path, start: Path) -> list:
    out: list = []
    for dirpath, dirnames, filenames in os.walk(start):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for name in sorted(filenames):
            full = Path(dirpath) / name
            try:
                out.append(_norm(full.relative_to(repo_root)))
            except ValueError:
                continue
    return out


def _module_paths(repo_root: Path, code_roots) -> list:
    seen: list = []
    for root in code_roots:
        start = repo_root / root
        if start.is_dir():
            seen.extend(_walk(repo_root, start))
        elif start.is_file():
            seen.append(_norm(root))
    return sorted(dict.fromkeys(seen))


def in_module(rel: str, code_roots) -> bool:
    rel = _norm(rel)
    for root in code_roots:
        root = _norm(root).rstrip("/")
        if rel == root or rel.startswith(f"{root}/"):
            return True
    return False


def is_test_path(rel: str) -> bool:
    rel = _norm(rel)
    name = rel.rsplit("/", 1)[-1]
    if any(part in ("tests", "test", "__tests__") for part in rel.split("/")):
        return True
    return (
        name.startswith("test_")
        or name.endswith("_test.py")
        or ".test." in name
        or ".spec." in name
    )


def _word_pattern(names):
    """A whole-word alternation over *names*, or ``None`` when nothing
    survives. Names shorter than :data:`_MIN_SYMBOL_LEN` are dropped:
    they match prose, not calls."""
    words = sorted({
        name for name in names
        if len(name) >= _MIN_SYMBOL_LEN and not name.startswith("__")
    })
    if not words:
        return None
    return re.compile(r"\b(" + "|".join(re.escape(w) for w in words) + r")\b")


# --- spec sections ----------------------------------------------------------

def extract_section(text: str, anchor: str):
    """The markdown section whose heading slugifies to *anchor*, up to
    the next heading of the same or higher level. ``None`` when the
    anchor is absent -- a mapped section that does not exist is an
    operator error, not a silent empty string."""
    wanted = anchor.strip().lower()
    lines = text.splitlines()
    start = None
    level = 0
    for index, line in enumerate(lines):
        match = re.match(r"^(#{1,6})\s+(.*)$", line)
        if not match:
            continue
        slug = re.sub(r"[^a-z0-9]+", "-", match.group(2).strip().lower())
        if start is None:
            if slug.strip("-") == wanted.strip("-"):
                start, level = index, len(match.group(1))
        elif len(match.group(1)) <= level:
            return "\n".join(lines[start:index]).strip()
    if start is None:
        return None
    return "\n".join(lines[start:]).strip()


# --- the resolver -----------------------------------------------------------

def scope_char_budget() -> int:
    raw = os.environ.get("AI_ROUTER_SCOPE_MAX_CHARS")
    try:
        return int(raw) if raw else DEFAULT_SCOPE_CHAR_BUDGET
    except ValueError:
        return DEFAULT_SCOPE_CHAR_BUDGET


def resolve_scope(repo_root, diff: str, module_slug: str,
                  extra_changed_paths=(), entry=None) -> ContextScope:
    """The seven-tier scope for *module_slug*. Tiers 1-4 follow the
    change; tiers 5-7 follow the module's manifest entry.
    *extra_changed_paths* carries files a diff cannot show (untracked
    additions)."""
    repo_root = Path(repo_root)
    if entry is None:
        try:
            entry = find_entry(repo_root, module_slug)
        except ValueError as exc:
            raise ScopeUnavailable(
                f"docs/modules.yaml could not be read ({exc})"
            ) from exc
    if entry is None:
        raise ScopeUnavailable(
            f"no docs/modules.yaml entry declares the slug "
            f"{module_slug!r}; tiers 5-7 have nothing to resolve against"
        )

    entries: list = []
    exclusions: list = []
    claimed: set = set()

    if not entry.code_roots:
        exclusions.append(Exclusion(
            "tier 7 (module path listing)",
            f"module {entry.slug!r} declares no codeRoots in "
            "docs/modules.yaml, so there is no module listing to give",
        ))

    ranges = changed_paths(diff)
    for extra in extra_changed_paths:
        ranges.setdefault(_norm(extra), [])

    # Tier 1 -- every modified file. The diff bounds this tier, not the
    # module: a change that reaches outside codeRoots is still the
    # change under review.
    symbols: set = set()
    outside: list = []
    for rel in sorted(ranges):
        if not in_module(rel, entry.code_roots):
            outside.append(rel)
        full = repo_root / rel
        if not full.is_file():
            exclusions.append(Exclusion(rel, "deleted or absent in the tree"))
            continue
        text, refusal = read_text(full)
        if text is None:
            exclusions.append(Exclusion(rel, refusal))
            continue
        entries.append(ScopeEntry(rel, TIER_MODIFIED, CONTENT_FULL, text))
        claimed.add(rel)
        if rel.endswith(".py"):
            symbols |= changed_symbols(text, ranges[rel])
        else:
            stem = rel.rsplit("/", 1)[-1].rsplit(".", 1)[0]
            if len(stem) >= _MIN_SYMBOL_LEN:
                symbols.add(stem)

    module_paths = _module_paths(repo_root, entry.code_roots)
    modified = sorted(claimed)

    # Tiers 2 and 3 -- one pass over the repository. A caller is a caller
    # wherever it lives; the module boundary bounds tier 7, not these.
    stems = {
        rel.rsplit("/", 1)[-1].rsplit(".", 1)[0] for rel in modified
    }
    caller_pattern = _word_pattern(symbols)
    test_pattern = _word_pattern(stems)
    unsearchable = 0
    if caller_pattern or test_pattern:
        for rel in _walk(repo_root, repo_root):
            if rel in claimed or Path(rel).suffix.lower() not in CODE_SUFFIXES:
                continue
            text, refusal = read_text(repo_root / rel, MATCH_SCAN_CAP)
            if text is None:
                unsearchable += 1
                continue
            is_test = is_test_path(rel)
            pattern = test_pattern if is_test else caller_pattern
            if pattern is None:
                continue
            if not pattern.search(strip_comments(text, Path(rel).suffix)):
                continue
            tier = TIER_TESTS if is_test else TIER_CALLERS
            if len(text) > DEFAULT_FILE_CHAR_CAP:
                exclusions.append(Exclusion(
                    rel,
                    f"matches tier {tier} but is {len(text)} chars, over the "
                    f"per-file cap ({DEFAULT_FILE_CHAR_CAP})",
                ))
                continue
            entries.append(ScopeEntry(rel, tier, CONTENT_FULL, text))
            claimed.add(rel)
    if unsearchable:
        exclusions.append(Exclusion(
            f"{unsearchable} repository file(s)",
            "not searchable as UTF-8 text within the scan cap, so tiers 2 "
            "and 3 could not consider them",
        ))

    # Tier 4 -- one hop of referenced files, interface surface only.
    referenced: set = set()
    for rel in modified:
        source = next(e.text for e in entries if e.path == rel)
        suffix = Path(rel).suffix.lower()
        code = strip_comments(source, suffix)
        if suffix == ".py":
            referenced |= _python_references(source, rel, repo_root)
        elif suffix in _JS_SUFFIXES:
            referenced |= _js_references(code, rel, repo_root)
        referenced |= _textual_references(code, rel, repo_root)
    for rel in sorted(referenced - claimed):
        text, refusal = read_text(repo_root / rel)
        if text is None:
            exclusions.append(Exclusion(rel, refusal))
            continue
        if rel.endswith(".py"):
            surface, refusal = interface_surface(text)
            if surface is None:
                exclusions.append(Exclusion(rel, refusal))
                continue
            entries.append(
                ScopeEntry(rel, TIER_INTERFACE, CONTENT_INTERFACE, surface)
            )
        else:
            entries.append(ScopeEntry(rel, TIER_INTERFACE, CONTENT_FULL, text))
        claimed.add(rel)

    # Tier 5 -- mapped spec sections (mapped, never searched).
    for mapping in entry.spec_sections:
        rel, _, anchor = mapping.partition("#")
        rel = _norm(rel)
        text, refusal = read_text(repo_root / rel)
        if text is None:
            exclusions.append(Exclusion(mapping, refusal or "unreadable"))
            continue
        if anchor:
            section = extract_section(text, anchor)
            if section is None:
                exclusions.append(Exclusion(
                    mapping, f"no heading in {rel} matches anchor {anchor!r}"
                ))
                continue
            text = section
        entries.append(ScopeEntry(mapping, TIER_SPEC, CONTENT_FULL, text))

    # Tier 6 -- manifest-declared context assets.
    for asset in entry.context_assets:
        matches = sorted(_norm(p.relative_to(repo_root))
                         for p in repo_root.glob(asset) if p.is_file())
        if not matches:
            exclusions.append(Exclusion(asset, "no file matches this asset"))
            continue
        for rel in matches:
            if rel in claimed:
                continue
            text, refusal = read_text(repo_root / rel)
            if text is None:
                exclusions.append(Exclusion(rel, refusal))
                continue
            entries.append(ScopeEntry(rel, TIER_ASSETS, CONTENT_FULL, text))
            claimed.add(rel)

    # Tier 7 -- names only.
    for rel in module_paths:
        entries.append(ScopeEntry(rel, TIER_MODULE_PATHS, CONTENT_NAMES, None))

    unclaimed = [rel for rel in module_paths if rel not in claimed]
    if unclaimed:
        exclusions.append(Exclusion(
            f"{len(unclaimed)} other in-module file(s)",
            "matched no tier; listed by name in tier 7 and available by "
            "named, justified request",
        ))
    exclusions.append(Exclusion(
        "every path outside the tiers above",
        "excluded by default -- this scope is bounded by design, not "
        "degraded",
    ))

    scope = ContextScope(
        module=entry.slug,
        entries=tuple(sorted(entries, key=lambda e: (e.tier, e.path))),
        exclusions=tuple(exclusions),
        changed_symbols=tuple(sorted(symbols)),
        changes_outside_code_roots=tuple(outside),
    )
    budget = scope_char_budget()
    if scope.total_chars > budget:
        raise ScopeTooLarge(
            f"the bounded scope for module {entry.slug!r} is "
            f"{scope.total_chars} chars against a budget of {budget}. "
            "Split the session, narrow what the change touches, or raise "
            "AI_ROUTER_SCOPE_MAX_CHARS deliberately -- the scope is never "
            "trimmed to fit."
        )
    return scope
