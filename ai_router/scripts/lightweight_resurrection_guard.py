#!/usr/bin/env python3
"""Set 112 S3 — the anti-resurrection gate for the removed Lightweight tier.

Set 112 deleted the Lightweight tier: the ``tier:`` spec field, the
``verificationMode`` field and both of its modes (``out-of-band-or-none``
Mode A, ``dedicated-sessions`` Mode B), the five router modules that served
them, and every fixture and form branch that carried them. This gate is the
executable proof that the removal holds — a testimonial claim in a session
disposition does not survive the next contributor, a failing CI job does.

    python ai_router/scripts/lightweight_resurrection_guard.py [--repo-root .]

Exit ``0`` when the tier is gone, ``1`` when anything resurrects it.

Declaration territory vs. narration territory
---------------------------------------------
The hard part of this gate is not finding the strings — it is telling
"declares the tier" from "explains why the tier is gone". Set 112 leaves
roughly forty deliberate mentions behind: the migration message a stranded
consumer reads, the tests that assert that message, the historical note in
``docs/concepts/tier-model.md``, the cross-repo removal notice, the
changelogs, and the comments that tell a future reader why a branch is
missing. A gate that failed on those would either fail on its own
documentation or force the removal to go undocumented.

So this gate does not keep an allowlist of blessed files (an allowlist ages
into a blanket exemption — anything could resurrect inside a listed file).
It classifies by *position*:

* **Narration territory** — comments, Python docstrings, markdown prose and
  inline backticks. Text here describes; it never executes. Never scanned.
* **Declaration territory** — code outside comments/docstrings, fenced code
  blocks in markdown, and the body of YAML/JSON data files. Text here is
  read by a machine. Always scanned.

A resurrection has to land in declaration territory to have any effect, so
that is exactly where the patterns are applied. The consequence worth
stating plainly: this gate proves no live artifact *declares* the tier. It
does not, and cannot, prove that no live doc *describes* it — that is a
human reading, and Set 112's guided-look UAT is where it happens.

Two escapes exist, both deliberately narrow:

* :data:`SELF_EXEMPT` — this module and its test. Both name the deleted
  modules as literals because cataloguing them *is* their job. This is not
  the hole it looks like: :func:`check_deleted_files_stay_deleted` reads the
  filesystem, not the text, so a module that actually came back is caught
  regardless of what any file says about it.
* :data:`FROZEN_HISTORY_MARKER` — a superseded cross-repo notice, kept
  verbatim as the record of what consumers were once told, may declare
  itself frozen in its own first lines. The marker is *reported on every
  run*, so it can never quietly spread, and a test pins the current set of
  files that use it.

Frozen history is out of scope
------------------------------
``docs/session-sets/`` and ``docs/proposals/`` ran under the tier and stay
readable as the record; rewriting them would falsify it. That live-guidance
vs. frozen-history split is a repo fact, not a tier fact, so this module
reuses :mod:`drift_guard`'s exclusion rules rather than re-deriving them
(Set 112 S2 kept them alive for exactly this consumer). Build output
(``dist/``, ``out/``) is excluded for the same reason it always is: it is
compiled, never authored — the sources it is built from are scanned.

All output is ASCII-only so it is safe on a Windows ``cp1252`` console
(``lessons-learned.md`` L-079-1).
"""
from __future__ import annotations

import argparse
import io
import os
import re
import sys
import tokenize
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

try:  # running as a script: sys.path[0] is this dir
    from drift_guard import _is_excluded  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - import-path fallback
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from drift_guard import _is_excluded  # type: ignore[import-not-found]


# ---------------------------------------------------------------------------
# Findings
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Resurrection:
    """One live declaration of the removed tier."""

    rule: str
    location: str  # repo-relative path + ":line"
    line: str  # the offending source line, stripped
    detail: str

    def render(self) -> str:
        return (
            f"  [x] {self.rule}: {self.location}\n"
            f"      {self.line}\n"
            f"      {self.detail}"
        )


# ---------------------------------------------------------------------------
# What counts as a declaration
# ---------------------------------------------------------------------------

# The five router modules Set 112 deleted outright. Any of these names
# appearing in declaration territory means something imports, spawns, or
# registers a module that no longer exists -- which is a broken build at
# best and a partial resurrection at worst.
DELETED_MODULES: tuple[str, ...] = (
    "dedicated_verification",
    "external_verification",
    "pending_verification",
    "change_verification_mode",
    "migrate_lightweight_to_canonical_v4",
)

# Files whose absence IS the removal. Checked directly rather than by grep:
# a re-added module would otherwise only be caught once something imported
# it, and "the file is back but unused" is precisely how a removal rots.
DELETED_FILES: tuple[str, ...] = (
    "ai_router/dedicated_verification.py",
    "ai_router/external_verification.py",
    "ai_router/pending_verification.py",
    "ai_router/change_verification_mode.py",
    "ai_router/migrate_lightweight_to_canonical_v4.py",
    "test-fixtures/cold-start/lightweight",
    "tools/dabbler-ai-orchestration/test-fixtures/uat-matrix/hello-world-lightweight",
)

# A spec.md / YAML mapping entry that declares the tier. The value must
# TERMINATE the line (optionally followed by a comment): that is what
# distinguishes the YAML entry `tier: lightweight` from the migration
# message, which opens with the same six words and then keeps talking
# ("tier: lightweight was removed in Set 112 -- there is one tier now.").
TIER_DECLARATION = re.compile(
    r"""^\s*(?:-\s*)?["']?tier["']?\s*:\s*["']?lightweight["']?\s*(?:\#.*)?,?\s*$""",
    re.IGNORECASE,
)

# The removed verification-mode field, as a YAML key, a JSON key, an object
# property, or an assignment target. Matched anywhere on the line because
# these forms are already machine-syntax -- there is no prose that looks
# like `verificationMode:` outside a code fence.
VERIFICATION_MODE_FIELD = re.compile(
    r"""(?:^|[\s\{\[,\.\(])["']?verification[_-]?[Mm]ode["']?\s*(?::(?!:)|=(?!=))"""
)

# The two mode VALUES, in a position that assigns them to something.
MODE_VALUE = re.compile(
    r"""(?::|=|=>)\s*["']?(?:out-of-band-or-none|dedicated-sessions)["']?\s*,?\s*$"""
)

DELETED_MODULE_REF = re.compile(
    r"\b(?:" + "|".join(DELETED_MODULES) + r")\b"
)

# The gate's own machinery. Both files must spell the removed names out to
# do their job. See the module docstring for why exempting them cannot hide
# a real resurrection.
SELF_EXEMPT: frozenset[str] = frozenset(
    {
        "ai_router/scripts/lightweight_resurrection_guard.py",
        "ai_router/tests/test_lightweight_resurrection_guard.py",
    }
)

# A superseded notice that is kept verbatim as a historical record may say
# so, in its own first lines, and be skipped. Editing such a file to please
# a gate would falsify the record it exists to preserve -- the same reason
# docs/session-sets/ and docs/proposals/ are excluded wholesale.
FROZEN_HISTORY_MARKER = "<!-- lightweight-guard: frozen-history -->"
_FROZEN_MARKER_MAX_LINES = 40


# ---------------------------------------------------------------------------
# Territory: blanking narration so only declarations remain
#
# Every blanker returns text with the SAME line count and line lengths as its
# input (narration is replaced by spaces, never deleted), so a match's line
# number and column still point at the real source.
# ---------------------------------------------------------------------------


def _blank(segment: str) -> str:
    """Replace a span with spaces, preserving newlines (and so line numbers)."""
    return "".join("\n" if ch == "\n" else " " for ch in segment)


def blank_python_narration(source: str) -> str:
    """Blank comments and triple-quoted strings in Python source.

    Single-quoted strings are LEFT INTACT on purpose: `{"verificationMode":
    ...}` is a declaration that happens to be spelled with quotes, and the
    dict-key form is the most likely way the field would come back. Triple-
    quoted strings are blanked because that is where module and function
    docstrings live, and Set 112's docstrings necessarily name what they
    removed.

    A file that does not tokenize (a syntax error, or a Python-3.13-only
    construct on an older runtime) is returned unchanged: fail CLOSED, scan
    it whole, and let a false positive be adjudicated. A tokenizer failure
    must never be a silent pass.
    """
    lines = source.splitlines(keepends=True)
    try:
        tokens = list(tokenize.generate_tokens(io.StringIO(source).readline))
    except (tokenize.TokenError, IndentationError, SyntaxError):
        return source

    spans: list[tuple[int, int, int, int]] = []
    for tok in tokens:
        if tok.type == tokenize.COMMENT:
            spans.append((*tok.start, *tok.end))
        elif tok.type == tokenize.STRING:
            text = tok.string.lstrip("rbuRBUf")
            if text[:3] in ('"""', "'''"):
                spans.append((*tok.start, *tok.end))

    for srow, scol, erow, ecol in spans:
        for row in range(srow, erow + 1):
            idx = row - 1
            if idx >= len(lines):
                continue
            line = lines[idx]
            start = scol if row == srow else 0
            end = ecol if row == erow else len(line.rstrip("\n"))
            lines[idx] = line[:start] + _blank(line[start:end]) + line[end:]

    return "".join(lines)


_JS_STRING_OPENERS = "\"'`"


def blank_js_narration(source: str) -> str:
    """Blank `//` and `/* */` comments in TypeScript/JavaScript source.

    Quote-aware, because `"https://example.com"` is not a comment. String
    contents are kept for the same reason Python's single-quoted strings
    are: a re-declared `verificationMode` field would live in one.
    """
    out: list[str] = []
    i = 0
    n = len(source)
    quote: str | None = None
    while i < n:
        ch = source[i]
        if quote is not None:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(source[i + 1])
                i += 2
                continue
            if ch == quote:
                quote = None
            i += 1
            continue
        if ch in _JS_STRING_OPENERS:
            quote = ch
            out.append(ch)
            i += 1
            continue
        if ch == "/" and i + 1 < n and source[i + 1] == "/":
            end = source.find("\n", i)
            end = n if end == -1 else end
            out.append(_blank(source[i:end]))
            i = end
            continue
        if ch == "/" and i + 1 < n and source[i + 1] == "*":
            end = source.find("*/", i + 2)
            end = n if end == -1 else end + 2
            out.append(_blank(source[i:end]))
            i = end
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def blank_yaml_narration(source: str) -> str:
    """Blank `#` comments in YAML, leaving quoted `#` alone."""
    out_lines: list[str] = []
    for line in source.splitlines(keepends=True):
        quote: str | None = None
        cut: int | None = None
        for idx, ch in enumerate(line):
            if quote is not None:
                if ch == quote:
                    quote = None
                continue
            if ch in "\"'":
                quote = ch
                continue
            if ch == "#":
                cut = idx
                break
        if cut is None:
            out_lines.append(line)
        else:
            body = line[cut:]
            out_lines.append(line[:cut] + _blank(body))
    return "".join(out_lines)


_FENCE = re.compile(r"^\s*(?:`{3,}|~{3,})")


def keep_markdown_fences(source: str) -> str:
    """Keep only fenced-code-block CONTENT; blank all markdown prose.

    In a doc, `tier: lightweight` inside backticks is a citation and inside
    a ```yaml block is a specimen. Only the specimen can be copied into a
    real spec.md and mean something, so only fenced content is scanned.

    The fence lines themselves are blanked, so a ```` ```yaml ```` info
    string never matches anything.
    """
    out_lines: list[str] = []
    in_fence = False
    for line in source.splitlines(keepends=True):
        if _FENCE.match(line):
            in_fence = not in_fence
            out_lines.append(_blank(line))
            continue
        out_lines.append(line if in_fence else _blank(line))
    return "".join(out_lines)


# Extension -> blanker. Anything not listed is not scanned: the file types
# below are the ones a declaration can actually live in.
_BLANKERS = {
    ".py": blank_python_narration,
    ".ts": blank_js_narration,
    ".tsx": blank_js_narration,
    ".js": blank_js_narration,
    ".jsx": blank_js_narration,
    ".mjs": blank_js_narration,
    ".cjs": blank_js_narration,
    ".json": lambda s: s,
    ".yaml": blank_yaml_narration,
    ".yml": blank_yaml_narration,
    ".md": keep_markdown_fences,
}


def iter_scanned_files(repo_root: Path) -> Iterable[Path]:
    """Yield every live, scannable file under *repo_root*.

    Exclusions come from :mod:`drift_guard` (``.git``, ``.venv``,
    ``node_modules``, ``__pycache__``, ``dist``, ``out``, ``.vscode-test``,
    ``test-results``, plus ``docs/session-sets/`` and ``docs/proposals/``),
    plus this gate's own two files.

    The walk PRUNES excluded directories rather than filtering paths after
    the fact: ``node_modules`` and ``.venv`` hold six figures of files that
    are excluded anyway, and this gate runs in the pytest suite as well as
    in CI. Pruning is what keeps it seconds rather than a minute.
    """
    for dirpath, dirnames, filenames in os.walk(repo_root):
        rel_dir = Path(dirpath).relative_to(repo_root)
        dir_parts = () if rel_dir == Path(".") else rel_dir.parts
        dirnames[:] = sorted(
            d for d in dirnames if not _is_excluded(dir_parts + (d,))
        )
        for name in sorted(filenames):
            path = Path(dirpath) / name
            if path.suffix.lower() not in _BLANKERS:
                continue
            rel = Path(*dir_parts, name) if dir_parts else Path(name)
            if rel.as_posix() in SELF_EXEMPT:
                continue
            yield path


def declares_frozen_history(source: str) -> bool:
    """True when a file marks itself a frozen historical record.

    The marker must appear near the top (within the first
    ``_FROZEN_MARKER_MAX_LINES`` lines), beside the human-readable banner it
    accompanies -- not buried at the bottom of a live document.
    """
    head = source.splitlines()[:_FROZEN_MARKER_MAX_LINES]
    return any(FROZEN_HISTORY_MARKER in line for line in head)


# ---------------------------------------------------------------------------
# The checks
# ---------------------------------------------------------------------------


_MIGRATION_HINT = (
    "Set 112 removed the Lightweight tier; there is one tier now. If this is "
    "narration, move it into a comment, a docstring, or markdown prose. If it "
    "is a real declaration, delete it."
)


def check_deleted_files_stay_deleted(repo_root: Path) -> list[Resurrection]:
    """The five deleted modules and both Lightweight fixture trees are gone."""
    violations: list[Resurrection] = []
    for rel in DELETED_FILES:
        target = repo_root / Path(rel)
        if target.exists():
            violations.append(
                Resurrection(
                    rule="deleted-file-returned",
                    location=rel,
                    line="(the path exists)",
                    detail=(
                        "Set 112 deleted this with the Lightweight tier. Its "
                        "absence is the removal; re-adding it re-opens the "
                        "machinery even if nothing imports it yet."
                    ),
                )
            )
    return violations


def scan_text(rel_path: str, source: str, suffix: str) -> list[Resurrection]:
    """Apply every declaration pattern to one file's declaration territory."""
    blanker = _BLANKERS[suffix]
    scannable = blanker(source)
    raw_lines = source.splitlines()
    violations: list[Resurrection] = []

    for lineno, line in enumerate(scannable.splitlines(), start=1):
        if not line.strip():
            continue
        raw = raw_lines[lineno - 1].strip() if lineno <= len(raw_lines) else line.strip()
        loc = f"{rel_path}:{lineno}"

        if TIER_DECLARATION.match(line):
            violations.append(
                Resurrection(
                    rule="tier-declared",
                    location=loc,
                    line=raw,
                    detail=(
                        "A live artifact declares `tier: lightweight`. The "
                        "spec loader refuses it at the boundary, so this "
                        "would fail for a user rather than for CI. "
                        + _MIGRATION_HINT
                    ),
                )
            )
        if VERIFICATION_MODE_FIELD.search(line):
            violations.append(
                Resurrection(
                    rule="verification-mode-field",
                    location=loc,
                    line=raw,
                    detail=(
                        "The `verificationMode` / `verification_mode` field "
                        "was removed with the tier's two verification modes. "
                        "Nothing reads it. " + _MIGRATION_HINT
                    ),
                )
            )
        if MODE_VALUE.search(line):
            violations.append(
                Resurrection(
                    rule="verification-mode-value",
                    location=loc,
                    line=raw,
                    detail=(
                        "`out-of-band-or-none` (Mode A) and "
                        "`dedicated-sessions` (Mode B) were the Lightweight "
                        "verification modes. Both are deleted; assigning one "
                        "configures nothing. " + _MIGRATION_HINT
                    ),
                )
            )
        if DELETED_MODULE_REF.search(line):
            violations.append(
                Resurrection(
                    rule="deleted-module-referenced",
                    location=loc,
                    line=raw,
                    detail=(
                        "This names a router module Set 112 deleted. In "
                        "declaration territory that is an import, a spawn, or "
                        "a registration that cannot resolve. " + _MIGRATION_HINT
                    ),
                )
            )

    return violations


def check_no_live_declarations(repo_root: Path) -> list[Resurrection]:
    """Scan every live file's declaration territory."""
    violations: list[Resurrection] = []
    for path in iter_scanned_files(repo_root):
        rel = path.relative_to(repo_root).as_posix()
        try:
            source = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if path.suffix.lower() == ".md" and declares_frozen_history(source):
            continue
        violations.extend(scan_text(rel, source, path.suffix.lower()))
    return violations


def find_frozen_history(repo_root: Path) -> list[str]:
    """Repo-relative paths of every doc claiming the frozen-history marker."""
    frozen: list[str] = []
    for path in iter_scanned_files(repo_root):
        if path.suffix.lower() != ".md":
            continue
        try:
            source = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if declares_frozen_history(source):
            frozen.append(path.relative_to(repo_root).as_posix())
    return frozen


def run_all(repo_root: Path) -> list[Resurrection]:
    return check_deleted_files_stay_deleted(repo_root) + check_no_live_declarations(
        repo_root
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Set 112 S3: fail the build if the removed Lightweight tier is "
            "declared anywhere in live (non-archive) source."
        )
    )
    parser.add_argument(
        "--repo-root",
        default=".",
        help="Repository root to scan (default: the current directory).",
    )
    args = parser.parse_args(argv)
    repo_root = Path(args.repo_root).resolve()

    violations = run_all(repo_root)

    # Reported on EVERY run, pass or fail: an escape nobody can see is an
    # escape that spreads.
    for rel in find_frozen_history(repo_root):
        print(f"[note] frozen historical record, not scanned: {rel}")

    if not violations:
        print("[ok] lightweight-resurrection guard: the tier stays removed.")
        return 0

    print(
        f"[FAIL] lightweight-resurrection guard: {len(violations)} live "
        "declaration(s) of the removed Lightweight tier:"
    )
    for violation in violations:
        print(violation.render())
    print(
        "\nSee docs/cross-repo-lightweight-removal-notice.md for the migration, "
        "and docs/concepts/tier-model.md for what the tier was."
    )
    return 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
