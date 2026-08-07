#!/usr/bin/env python3
"""Set 058 S3 — CI drift guards for the tier model and consumer bootstrap.

Three checks, run together by ``main()`` and exercised individually by
``ai_router/tests/test_drift_guard.py``. All output is ASCII-only so it is
safe on a Windows ``cp1252`` console (see ``lessons-learned.md``).

This module lives under ``ai_router/scripts/`` (NOT in the packaged wheel —
the dir has no ``__init__.py`` and ``namespaces = false`` excludes it). It is a
repo-level CI/dev tool, not part of the public ``ai_router`` API, so it does
not change the PyPI surface. Tests import it by bare filename via the conftest
``SCRIPTS_DIR`` shim; CI runs it directly:

    python ai_router/scripts/drift_guard.py [--repo-root .]

Exit status is ``0`` when every check passes, ``1`` when any check finds a
violation (so CI goes red).

The three checks (Set 058 D6/D8):

1. **stale-framing guard** — forbids the stale, pre-Set-048 "Lightweight =
   no Python / no venv / docs-only" framing from reappearing in any live
   guidance doc. The banned phrase list IS the one documented in the tier-model
   SSoT (``docs/concepts/tier-model.md`` -> "Banned framing"). Only the files on
   the explicit ``ALLOWED_MARKER_FILES`` allowlist (those whose *purpose* is to
   document the ban) may quote the phrases inside
   ``<!-- drift-guard:allow-begin -->`` / ``<!-- drift-guard:allow-end -->``
   regions, which the scan skips; a marker anywhere else is itself a violation.
   Frozen historical records under
   ``docs/session-sets/`` and ``docs/proposals/`` are out of scope (they record
   the problem this set fixed; rewriting history is not the goal).

2. **one-active-set guard** (D6) — at most one session set under
   ``docs/session-sets/`` may be ``status: in-progress`` at a time, so a cold
   orchestrator can deterministically resolve THE active set (the rule rendered
   verbatim into every consumer repo's ``docs/dabbler/start-here.md``).

3. **dist-bundle-in-sync guard** (D8 snapshot) — the consumer-bootstrap
   template bundle copied into the extension's ``dist/templates/`` (the build
   artifact the published .vsix actually ships from) must byte-match the
   canonical ``docs/templates/consumer-bootstrap/`` source of truth. A stale
   committed ``dist/`` copy means the Marketplace build would scaffold from
   outdated templates; this catches the "edited the template, forgot to
   recompile" drift.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

# ---------------------------------------------------------------------------
# Shared types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Violation:
    """One drift finding. ``location`` is a repo-relative path (+ optional
    ``:line``); ``detail`` is a human-readable, ASCII-only explanation."""

    check: str
    location: str
    detail: str

    def render(self) -> str:
        return f"  [x] {self.check}: {self.location}\n      {self.detail}"


# ---------------------------------------------------------------------------
# Check 1 — stale-framing guard
# ---------------------------------------------------------------------------

# The banned phrases, lowercased. These are the unambiguous stale-tier
# assertions from the tier-model SSoT's "Banned framing" list; none appears in
# correctly-framed live docs (which say "router-off, not Python-off").
# Matching is a case-insensitive substring test per line.
#
# The SSoT also lists "no close-out" / "no start_session / close_session", but
# those phrasings are NOT enforced here: "no close-out event" / "No close-out
# gate dependency" are common, legitimate, tier-agnostic statements about the
# close-out machinery itself (see ai_router/docs/close-out.md,
# docs/session-issues-schema.md). Any genuine stale-framing sentence
# ("Lightweight = no Python / no venv / no close-out / ...") always co-occurs
# with "no python" / "no venv", so the catalogue below catches it without the
# false positives the close-out variants would produce.
BANNED_PHRASES: tuple[str, ...] = (
    "no python",
    "no venv",
    "no .venv",
    "no pypi",
    "docs-only",
    "explorer-only",
)

# The ban targets a stale tier-framing *label* ("docs-only", "explorer-only"),
# NOT a longer identifier that merely contains it as a sub-token. The Set 075
# telemetry vocabulary uses `docs-only-excluded` and `targetClass=docs-only` as
# legitimate diffClass identifiers; those must not trip the guard, while a bare
# `docs-only` (even backtick-quoted, as documented deliberately under an
# allow-region in the bootstrap README) still must.
#
# A label occurrence is exempt only when it is part of a *real compound
# identifier* — i.e. the surrounding run of identifier characters (word chars
# plus ``=`` / ``-``) contains an extra WORD component beyond the label itself.
# So ``docs-only-excluded`` (extra word ``excluded``) and ``targetClass=docs-only``
# (extra word ``targetClass``) are exempt, but a bare label is flagged whether it
# stands alone, is backtick-quoted, ends a sentence (``docs-only.``), or is
# adjacent only to a *dangling* separator (``docs-only-`` / ``=docs-only`` with no
# further word) — a dangling ``-`` / ``=`` is not a compound identifier.
_BANNED_LITERAL_RES: tuple[re.Pattern[str], ...] = tuple(
    re.compile(re.escape(p), re.IGNORECASE) for p in BANNED_PHRASES
)

# Characters that can extend an identifier token around a banned label.
_IDENT_CHARS = frozenset(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_=-"
)


def _is_compound_identifier(raw: str, start: int, end: int) -> bool:
    """True if the label at ``raw[start:end]`` is a sub-token of a longer id.

    Expands left and right over identifier characters (word chars, ``=``, ``-``)
    and reports whether the surrounding token carries an EXTRA word component
    (an alphanumeric / underscore char outside the label span). A dangling ``-``
    or ``=`` with no further word does not count — it is not a real identifier.
    """
    i = start
    while i > 0 and raw[i - 1] in _IDENT_CHARS:
        i -= 1
    j = end
    while j < len(raw) and raw[j] in _IDENT_CHARS:
        j += 1
    extra = raw[i:start] + raw[end:j]
    return any(c.isalnum() or c == "_" for c in extra)
_BANNED_RES: tuple[re.Pattern[str], ...] = tuple(
    re.compile(r"(?<![\w=-])" + re.escape(p) + r"(?![\w=-])", re.IGNORECASE)
    for p in BANNED_PHRASES
)

ALLOW_BEGIN = "drift-guard:allow-begin"
ALLOW_END = "drift-guard:allow-end"

# The allow-region escape hatch is NOT unrestricted: only these repo-relative
# files may use it, and only for one of the two sanctioned reasons below. A
# marker anywhere else is itself a violation, so a stray suppression cannot
# silently hide real drift. To exempt a new file, add it here deliberately (a
# reviewed decision), not by dropping a marker into it.
#
# Reason 1 -- quoting the banned-phrase catalogue while documenting the ban.
# Reason 2 (Set 107 S1) -- a FROZEN proposal/review record in which the label
#   carries its ordinary English sense ("a documentation-only change") and has
#   nothing to do with tier framing. These four files are the git-transparency
#   audit trail: they are historical records of what each reviewer wrote, so
#   the honest fix is an auditable suppression rather than rewording another
#   engine's review after the fact. `docs/proposals/` and `docs/session-sets/`
#   get the same treatment wholesale via _EXCLUDED_DOC_SUBTREES; these live
#   under docs/planning/ only because that is where the operator filed them.
ALLOWED_MARKER_FILES: frozenset[str] = frozenset(
    {
        "docs/concepts/tier-model.md",
        "docs/templates/consumer-bootstrap/README.md",
        "tools/dabbler-ai-orchestration/CHANGELOG.md",
        "docs/planning/git-transparency-proposal-v2.md",
        "docs/planning/git-transparency-proposal-v3.md",
        "docs/planning/git-transparency-proposal-gpt-v2.md",
        "docs/planning/git-transparency-proposal-gpt-v3.md",
    }
)

# Directories never scanned (relative to repo root, matched on any path part).
_EXCLUDED_DIR_PARTS: frozenset[str] = frozenset(
    {
        ".git",
        ".venv",
        "node_modules",
        "__pycache__",
        "dist",
        "out",
        ".vscode-test",
        "test-results",
    }
)

# Subtrees of docs/ that are frozen historical records, not live guidance.
_EXCLUDED_DOC_SUBTREES: tuple[tuple[str, ...], ...] = (
    ("docs", "session-sets"),
    ("docs", "proposals"),
)

# File extensions that count as "docs" for the framing scan.
_SCANNED_SUFFIXES: frozenset[str] = frozenset({".md", ".html"})


def _is_excluded(rel_parts: tuple[str, ...]) -> bool:
    if any(part in _EXCLUDED_DIR_PARTS for part in rel_parts):
        return True
    for subtree in _EXCLUDED_DOC_SUBTREES:
        if rel_parts[: len(subtree)] == subtree:
            return True
    return False


def iter_scanned_docs(repo_root: Path) -> Iterable[Path]:
    """Yield every live-guidance doc under *repo_root* the framing scan covers."""
    for path in sorted(repo_root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in _SCANNED_SUFFIXES:
            continue
        rel_parts = path.relative_to(repo_root).parts
        if _is_excluded(rel_parts):
            continue
        yield path


def scan_stale_framing(repo_root: Path) -> list[Violation]:
    """Flag any banned stale-tier phrasing in live guidance docs.

    Lines inside an ``<!-- drift-guard:allow-begin -->`` /
    ``<!-- drift-guard:allow-end -->`` region are skipped, so the SSoT and the
    bundle README can document the ban without tripping it.

    A banned phrase is exempt only when the occurrence is part of a real compound
    identifier (one carrying an extra word component, e.g. ``docs-only-excluded``
    or ``targetClass=docs-only``); a bare label is still caught whether it stands
    alone, is backtick-quoted, ends a sentence (``docs-only.``), or sits beside a
    dangling ``-`` / ``=`` separator. See :func:`_is_compound_identifier`. The ban
    targets the tier-framing label, not code identifiers that share the substring.
    """
    violations: list[Violation] = []
    for path in iter_scanned_docs(repo_root):
        rel = path.relative_to(repo_root).as_posix()
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue  # binary or unreadable -> not a doc we guard
        marker_allowed_here = rel in ALLOWED_MARKER_FILES
        allowed = False
        for lineno, raw in enumerate(text.splitlines(), start=1):
            if ALLOW_BEGIN in raw or ALLOW_END in raw:
                if not marker_allowed_here:
                    # A suppression marker in a non-allowlisted file is itself a
                    # violation — the escape hatch is auditable, not universal.
                    violations.append(
                        Violation(
                            check="stale-framing",
                            location=f"{rel}:{lineno}",
                            detail=(
                                "drift-guard allow marker used in a file not on "
                                "ALLOWED_MARKER_FILES. Reword to drop the banned "
                                "phrasing, or add this file to the allowlist in "
                                "drift_guard.py as a reviewed decision."
                            ),
                        )
                    )
                    # Do NOT honor the marker here: keep scanning this line's
                    # successors normally so real drift below is still caught.
                    continue
                allowed = ALLOW_BEGIN in raw
                continue
            if allowed:
                continue
            for phrase, rx in zip(BANNED_PHRASES, _BANNED_LITERAL_RES):
                # Flag a banned label unless this occurrence is part of a real
                # compound identifier (e.g. `docs-only-excluded` /
                # `targetClass=docs-only`). A bare label -- prose, backtick-quoted,
                # sentence-ending, or beside a dangling `-`/`=` -- still trips.
                if any(
                    not _is_compound_identifier(raw, m.start(), m.end())
                    for m in rx.finditer(raw)
                ):
                    violations.append(
                        Violation(
                            check="stale-framing",
                            location=f"{rel}:{lineno}",
                            detail=(
                                f"banned tier phrasing {phrase!r}; Lightweight is "
                                "router-off, not Python-off. If this is a "
                                "deliberate quote of the ban, wrap it in a "
                                "<!-- drift-guard:allow-begin/end --> region."
                            ),
                        )
                    )
    return violations


# ---------------------------------------------------------------------------
# Check 2 — one-active-set guard (D6)
# ---------------------------------------------------------------------------


def find_in_progress_sets(repo_root: Path) -> list[str]:
    """Return repo-relative paths of every ``in-progress`` session-set dir."""
    base = repo_root / "docs" / "session-sets"
    if not base.is_dir():
        return []
    in_progress: list[str] = []
    for child in sorted(base.iterdir()):
        state = child / "session-state.json"
        if not (child.is_dir() and state.is_file()):
            continue
        try:
            status = json.loads(state.read_text(encoding="utf-8")).get("status")
        except (json.JSONDecodeError, OSError):
            continue
        if status == "in-progress":
            in_progress.append(child.relative_to(repo_root).as_posix())
    return in_progress


def check_one_active_set(repo_root: Path) -> list[Violation]:
    """At most one session set may be in-progress at a time (D6).

    This is the machine-checkable form of the active-set-resolution rule that
    every consumer repo's ``start-here.md`` states verbatim. Zero in-progress
    (the between-sessions state) is fine; two or more is the drift.
    """
    in_progress = find_in_progress_sets(repo_root)
    if len(in_progress) <= 1:
        return []
    return [
        Violation(
            check="one-active-set",
            location="docs/session-sets/",
            detail=(
                f"{len(in_progress)} session sets are in-progress at once "
                f"({', '.join(in_progress)}); the active-set rule requires at "
                "most one. Close or cancel the extras."
            ),
        )
    ]


# ---------------------------------------------------------------------------
# Check 3 — dist-bundle-in-sync guard (D8 snapshot)
# ---------------------------------------------------------------------------

_CANONICAL_BUNDLE = ("docs", "templates", "consumer-bootstrap")
_DIST_BUNDLE = (
    "tools",
    "dabbler-ai-orchestration",
    "dist",
    "templates",
    "consumer-bootstrap",
)

# Set 107 S1: the sample-project bundle is the SECOND template tree the
# extension ships, and it had exactly the same stale-dist exposure the
# consumer-bootstrap guard exists to close -- a committed dist/ copy that
# drifts from its canonical source means the Marketplace build creates a
# stale sample. Unlike the consumer-bootstrap bundle this one is a TREE
# (files/ has subdirectories), so the comparison below walks recursively;
# that is a superset of the flat case, so both pairs share one comparator
# (L-069-1: fix the class, not the reported site).
_CANONICAL_SAMPLE = ("docs", "templates", "sample-project")
_DIST_SAMPLE = (
    "tools",
    "dabbler-ai-orchestration",
    "dist",
    "templates",
    "sample-project",
)


def _read_bytes_normalized(path: Path) -> bytes:
    """Read bytes with CRLF normalized to LF so a Windows checkout that flips
    line endings on one copy but not the other does not produce a phantom
    mismatch. The writer normalizes to LF on read, so LF is the contract."""
    return path.read_bytes().replace(b"\r\n", b"\n")


def _relative_files(root: Path) -> set[str]:
    """Every file under *root*, as posix paths relative to it (recursive)."""
    return {
        p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()
    }


def _compare_bundle_pair(
    repo_root: Path,
    canonical: tuple[str, ...],
    dist: tuple[str, ...],
    label: str,
    check: str,
) -> list[Violation]:
    """Compare a canonical template tree against its committed ``dist/`` copy.

    Both trees must contain the same relative paths with byte-identical
    (LF-normalized) content. A drift means ``npm run compile`` was not re-run
    after editing a template, so the .vsix would ship a stale bundle. The walk
    is RECURSIVE so a nested tree (the sample bundle's ``files/``) is covered
    as thoroughly as a flat one.
    """
    src = repo_root.joinpath(*canonical)
    dst = repo_root.joinpath(*dist)
    dist_display = "/".join(dist)
    if not src.is_dir():
        return [
            Violation(
                check=check,
                location=src.relative_to(repo_root).as_posix(),
                detail=f"canonical {label} bundle directory is missing.",
            )
        ]
    if not dst.is_dir():
        return [
            Violation(
                check=check,
                location=dist_display,
                detail="packaged dist bundle is missing; run `npm run compile`.",
            )
        ]
    violations: list[Violation] = []
    src_files = _relative_files(src)
    dst_files = _relative_files(dst)
    for name in sorted(src_files - dst_files):
        violations.append(
            Violation(
                check=check,
                location=f"{dist_display}/{name}",
                detail="present in the canonical bundle but missing from dist; "
                "run `npm run compile`.",
            )
        )
    for name in sorted(dst_files - src_files):
        violations.append(
            Violation(
                check=check,
                location=f"{dist_display}/{name}",
                detail="present in dist but not in the canonical bundle; it is a "
                "stale copy. Run `npm run compile`.",
            )
        )
    for name in sorted(src_files & dst_files):
        if _read_bytes_normalized(src / name) != _read_bytes_normalized(dst / name):
            violations.append(
                Violation(
                    check=check,
                    location=f"{dist_display}/{name}",
                    detail="dist copy differs from the canonical template; run "
                    "`npm run compile` to recopy the bundle.",
                )
            )
    return violations


def check_dist_bundle_in_sync(repo_root: Path) -> list[Violation]:
    """The committed ``dist/`` consumer-bootstrap bundle matches its source."""
    return _compare_bundle_pair(
        repo_root,
        _CANONICAL_BUNDLE,
        _DIST_BUNDLE,
        "consumer-bootstrap",
        "dist-in-sync",
    )


def check_sample_bundle_in_sync(repo_root: Path) -> list[Violation]:
    """The committed ``dist/`` sample-project bundle matches its source.

    Set 107 S1. The sample bundle is the user-facing contract three things
    pin (the ``Try a sample project`` command, ``hello-world.md``, and the
    smoke test), so a stale packaged copy is the same shipping defect the
    consumer-bootstrap guard already prevents.
    """
    return _compare_bundle_pair(
        repo_root,
        _CANONICAL_SAMPLE,
        _DIST_SAMPLE,
        "sample-project",
        "sample-dist-in-sync",
    )


def check_model_registry_matches_providers(repo_root: Path) -> list[Violation]:
    """Every ``model_id`` in ``router-config.yaml`` is one its provider offers.

    Set 109 S4. The set that built ``ai_router/model_inventory`` deliberately
    left it unwired, for one stated reason: the repository's own registry
    failed it — ``router-config.yaml`` sent ``model_id: gpt-5.6``, which OpenAI
    does not list and silently served from ``gpt-5.6-sol`` at twice the
    recorded rate — so arming it would have turned this very suite red on the
    day it landed. Session 4 corrected the registry, ``--check`` passes, and
    that reason expired. A gate nothing invokes catches nothing: the whole
    point of the set is that the drift was invisible for months, and an
    unwired check is invisible too.

    It reads only local files — ``router-config.yaml`` and the committed
    ``ai_router/model-inventory.lock`` — and never probes a provider. So this
    is deterministic in CI and goes red on a **commit**, never on a provider's
    release schedule. Refreshing the lock (``--refresh``) is the deliberate,
    network-touching act that can change the answer.

    A lockfile that has never been written is reported as a violation rather
    than skipped: "we could not ask" and "the provider does not offer it" are
    different facts, but neither one is a passing gate.
    """
    config_path = repo_root / "ai_router" / "router-config.yaml"
    lock_path = repo_root / "ai_router" / "model-inventory.lock"
    have_config, have_lock = config_path.is_file(), lock_path.is_file()
    if not have_config and not have_lock:
        # A consumer checkout may legitimately carry neither. Nothing to
        # certify is not a violation.
        return []
    if not have_lock:
        # Round-3 nit: an `or` here meant deleting the lockfile turned this
        # gate green -- a fail-open in the check added to close a fail-open.
        # A registry with no snapshot to check against is unverifiable, and
        # unverifiable is not passing.
        return [Violation(
            check="model-registry-drift",
            location="ai_router/model-inventory.lock",
            detail=(
                "the registry exists but its provider snapshot does not, so "
                "no model_id can be checked. Run `python -m "
                "ai_router.model_inventory --refresh` to write it."
            ),
        )]
    if not have_config:
        return [Violation(
            check="model-registry-drift",
            location="ai_router/router-config.yaml",
            detail=(
                "a provider snapshot exists but router-config.yaml does not, "
                "so this checkout is in a state the guard cannot interpret."
            ),
        )]

    try:
        from ai_router.model_inventory import (  # type: ignore
            check_registry, load_lockfile,
        )
        from ai_router.config import load_config  # type: ignore
    except Exception as exc:  # pragma: no cover - import-environment dependent
        return [Violation(
            check="model-registry-drift",
            location="ai_router/model_inventory.py",
            detail=(
                f"could not import the model-inventory check ({exc}). The "
                "gate cannot certify the registry, so it fails rather than "
                "passing silently."
            ),
        )]

    try:
        result = check_registry(
            load_config(str(config_path)), load_lockfile(lock_path)
        )
    except Exception as exc:
        return [Violation(
            check="model-registry-drift",
            location="ai_router/model-inventory.lock",
            detail=(
                f"the model-inventory check could not run ({exc}). Run "
                "`python -m ai_router.model_inventory --refresh` to write the "
                "snapshot, then re-run this guard."
            ),
        )]

    violations: list[Violation] = []
    for message in result.fatal:
        violations.append(Violation(
            check="model-registry-drift",
            location="ai_router/model-inventory.lock",
            detail=str(message),
        ))
    for finding in list(result.routable_drift) + list(result.identity_drift):
        violations.append(Violation(
            check="model-registry-drift",
            location=f"router-config.yaml -> models.{finding.alias}",
            detail=(
                f"model_id {finding.model_id!r} is not offered by "
                f"{finding.provider}. Correct the id, or move the record out "
                "of the model registry. Run `python -m "
                "ai_router.model_inventory --check` for the full report."
            ),
        ))
    return violations


def check_actions_are_sha_pinned(repo_root: Path) -> list[Violation]:
    """Every workflow ``uses:`` references a 40-character commit SHA.

    Set 111 S4. GitHub's supply-chain hardening guidance: a tag is
    MUTABLE, so ``actions/checkout@v4`` can be repointed at arbitrary code
    and a compromise of the action reaches every workflow referencing it.
    A branch ref (``@release/v1``, which this repo had on the PyPI publish
    path) is worse still — it moves on every upstream push.

    Local ``./.github/actions/...`` composite actions are exempt: they
    resolve inside this repository at the workflow's own commit, so there
    is no third party to compromise and no ref to repoint.

    The bump path is ``.github/dependabot.yml``, which rewrites the SHA
    and its trailing ``# vX.Y.Z`` comment together.
    """
    workflows = repo_root / ".github" / "workflows"
    if not workflows.is_dir():
        return []
    uses_re = re.compile(r"^\s*-?\s*uses:\s*(\S+)")
    sha_re = re.compile(r"^[0-9a-f]{40}$")
    violations: list[Violation] = []
    for path in sorted(workflows.glob("*.yml")) + sorted(
        workflows.glob("*.yaml")
    ):
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        rel = path.relative_to(repo_root).as_posix()
        for lineno, line in enumerate(lines, start=1):
            m = uses_re.match(line)
            if not m:
                continue
            ref = m.group(1)
            if ref.startswith("./") or ref.startswith("docker://"):
                continue
            _, sep, version = ref.partition("@")
            if sep and sha_re.match(version):
                continue
            violations.append(
                Violation(
                    check="actions-sha-pinned",
                    location=f"{rel}:{lineno}",
                    detail=(
                        f"`uses: {ref}` is not pinned to a commit SHA. A tag "
                        f"or branch is mutable, so a compromise of the "
                        f"action reaches this workflow. Pin it as "
                        f"`owner/action@<40-char-sha>  # vX.Y.Z`; Dependabot "
                        f"(.github/dependabot.yml) maintains the pin."
                    ),
                )
            )
    return violations


# ---------------------------------------------------------------------------
# Aggregate + CLI
# ---------------------------------------------------------------------------

ALL_CHECKS = (
    ("stale-framing", scan_stale_framing),
    ("one-active-set", check_one_active_set),
    ("dist-in-sync", check_dist_bundle_in_sync),
    ("sample-dist-in-sync", check_sample_bundle_in_sync),
    ("model-registry-drift", check_model_registry_matches_providers),
    ("actions-sha-pinned", check_actions_are_sha_pinned),
)


def run_all(repo_root: Path) -> list[Violation]:
    violations: list[Violation] = []
    for _name, fn in ALL_CHECKS:
        violations.extend(fn(repo_root))
    return violations


def _default_repo_root() -> Path:
    # scripts/ -> ai_router/ -> repo root
    return Path(__file__).resolve().parent.parent.parent


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Set 058 tier-model / consumer-bootstrap drift guards."
    )
    parser.add_argument(
        "--repo-root",
        default=str(_default_repo_root()),
        help="Repository root to scan (defaults to this checkout).",
    )
    args = parser.parse_args(argv)
    repo_root = Path(args.repo_root).resolve()

    print(f"[drift-guard] scanning {repo_root}")
    violations = run_all(repo_root)
    if not violations:
        print("[drift-guard] OK - no tier-model / bootstrap drift found.")
        return 0

    by_check: dict[str, list[Violation]] = {}
    for v in violations:
        by_check.setdefault(v.check, []).append(v)
    print(f"[drift-guard] FAILED - {len(violations)} violation(s):")
    for check, items in by_check.items():
        print(f"- {check} ({len(items)}):")
        for v in items:
            print(v.render())
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
