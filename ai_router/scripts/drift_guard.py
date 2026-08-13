#!/usr/bin/env python3
"""Set 058 S3 — CI drift guards for the consumer bootstrap and CI config.

Five checks, run together by ``main()`` and exercised individually by
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

Set 112 S2 RETIRED the sixth check, the ``stale-framing`` guard. It forbade
the stale "Lightweight = no Python / no venv / docs-only" framing from
reappearing in live guidance docs — a guard that existed only to defend the
Lightweight tier's meaning. The tier is gone, so the framing it policed can no
longer be asserted about anything, and a guard whose subject does not exist is
noise that a future reader would have to decode before deleting. Its
banned-phrase catalogue, the ``<!-- drift-guard:allow-begin/end -->``
allow-region machinery, and ``ALLOWED_MARKER_FILES`` went with it.

What was deliberately KEPT is the doc-walking mechanism it used
(:func:`iter_scanned_docs` and its exclusion rules): those encode "which files
are LIVE guidance" versus "which are frozen history" — a repo fact, not a tier
fact — and Set 112 Session 3's anti-resurrection grep gate needs exactly that
distinction. Reuse it there rather than re-deriving the exclusions.

The checks (Set 058 D6/D8):

1. **one-active-set guard** (D6) — at most one session set under
   ``docs/session-sets/`` may be ``status: in-progress`` at a time, so a cold
   orchestrator can deterministically resolve THE active set (the rule rendered
   verbatim into every consumer repo's ``docs/dabbler/start-here.md``).

2. **dist-bundle-in-sync guard** (D8 snapshot) — the consumer-bootstrap
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
# Shared doc-walking mechanism
#
# Set 112 S2: this outlived the stale-framing guard that introduced it. It
# answers "which files in this repo are LIVE guidance?" — everything under
# docs/ except the frozen historical records — which is a repo fact
# independent of any one check. Set 112 S3's anti-resurrection grep gate is
# its next consumer.
# ---------------------------------------------------------------------------

# Directories never scanned (relative to repo root, matched on any path part).
#
# Set 122 S3 added ``build`` and ``.eggs``: setuptools' build output. A
# ``pip install`` of this checkout (the Layer 3 cold-start walkthrough and
# the provisioning dogfood both do one) materializes ``build/lib/`` — a
# verbatim COPY of the package source, including this guard's own pattern
# table. The scan then reported the copy's regexes as live declarations,
# so a green tree went red purely because someone had run an install.
# Both are gitignored build products with no tracked content, and both are
# the same class as the ``dist`` / ``out`` / ``test-results`` entries that
# were already here.
_EXCLUDED_DIR_PARTS: frozenset[str] = frozenset(
    {
        ".git",
        ".venv",
        "node_modules",
        "__pycache__",
        "build",
        ".eggs",
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


# ---------------------------------------------------------------------------
# Check 1 — one-active-set guard (D6)
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
# Check 2 — dist-bundle-in-sync guard (D8 snapshot)
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
# Set 122 S4 — concurrent-session conflict guards
#
# The two things two developers running concurrent session sets collide on:
# an append-only file, and a set number. Both are now partitioned or
# refused, and both refusals belong in a fast dependency-light gate rather
# than at the end of a 10-minute suite, because both are introduced by a
# MERGE -- the merge captain needs the answer immediately.
# ---------------------------------------------------------------------------


def check_set_numbers_are_unique(repo_root: Path) -> list[Violation]:
    """No two session sets may share a numeric prefix.

    Verdict 6.4 asks developers to reserve numbers in chat before
    scaffolding. Nothing enforced it, and the collision is invisible
    inside a single worktree: two branches each mint ``123-`` and the
    clash only exists after they merge -- which is exactly when this
    check runs.
    """
    scan_root = repo_root / "docs" / "session-sets"
    if not scan_root.is_dir():
        return []
    index: dict[int, list[str]] = {}
    prefix_re = re.compile(r"^(\d+)-")
    for entry in sorted(scan_root.iterdir()):
        if not entry.is_dir() or entry.name.startswith("_"):
            continue
        m = prefix_re.match(entry.name)
        if not m:
            continue
        index.setdefault(int(m.group(1)), []).append(entry.name)
    return [
        Violation(
            check="set-number-collision",
            location=f"docs/session-sets/ (number {number})",
            detail=(
                f"{len(slugs)} session sets share numeric prefix {number}: "
                f"{', '.join(sorted(slugs))}. Number addressing, prerequisite "
                f"links and the set index all become ambiguous. Rename one "
                f"(keep the work, change the prefix) to the next free number "
                f"from `python -m ai_router.resolve_set --next`."
            ),
        )
        for number, slugs in sorted(index.items())
        if len(slugs) > 1
    ]


def check_changelog_partition_round_trips(repo_root: Path) -> list[Violation]:
    """The partitioned changelogs still reproduce the document they replaced.

    The import is guarded, but NOT fail-open. A repo that carries no
    partition at all (a consumer repo, or this one before Set 122 S4) has
    nothing to check and reports nothing. A repo that HAS ``changelog.d/``
    directories and cannot import the module is a broken gate, and a gate
    that skips itself when its own code fails to load is the silent
    fail-open branch L-079-3 warns about -- so that case is a violation.
    """
    partitions = [
        path
        for path in (
            repo_root / "ai_router" / "changelog.d",
            repo_root / "tools" / "dabbler-ai-orchestration" / "changelog.d",
        )
        if path.is_dir()
    ]
    sys.path.insert(0, str(repo_root))
    try:
        from ai_router import changelog as cl  # type: ignore[import-not-found]
    except Exception as exc:  # noqa: BLE001 - reported, never swallowed
        if not partitions:
            return []
        return [
            Violation(
                check="changelog-round-trip",
                location="ai_router/changelog.py",
                detail=(
                    f"{len(partitions)} changelog.d/ partition(s) exist but "
                    f"`ai_router.changelog` could not be imported "
                    f"({type(exc).__name__}: {exc}). The round-trip gate cannot "
                    f"run, and a gate that skips itself when its own code fails "
                    f"to load is indistinguishable from a passing one."
                ),
            )
        ]
    finally:
        if sys.path and sys.path[0] == str(repo_root):
            sys.path.pop(0)

    violations: list[Violation] = []
    for key in sorted(cl.TARGETS):
        target = cl.TARGETS[key]
        if not (repo_root / target.rendered_rel).is_file():
            continue
        if not (repo_root / target.fragments_rel).is_dir():
            continue
        try:
            problems = cl.check(target, str(repo_root))
        except cl.ChangelogError as exc:
            problems = [str(exc)]
        violations.extend(
            Violation(
                check="changelog-round-trip",
                location=target.fragments_rel,
                detail=problem,
            )
            for problem in problems
        )
    return violations


# ---------------------------------------------------------------------------
# Aggregate + CLI
# ---------------------------------------------------------------------------

ALL_CHECKS = (
    ("one-active-set", check_one_active_set),
    ("dist-in-sync", check_dist_bundle_in_sync),
    ("sample-dist-in-sync", check_sample_bundle_in_sync),
    ("model-registry-drift", check_model_registry_matches_providers),
    ("actions-sha-pinned", check_actions_are_sha_pinned),
    ("set-number-collision", check_set_numbers_are_unique),
    ("changelog-round-trip", check_changelog_partition_round_trips),
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
        description="Set 058 consumer-bootstrap / CI drift guards."
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
        print("[drift-guard] OK - no bootstrap / CI drift found.")
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
