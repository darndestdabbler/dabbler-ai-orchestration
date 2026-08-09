"""Detect session-state schema drift — detect-only (Set 050 Session 2).

Set 050 ("Schema-Drift Detection & Migration Guard") audit-locked spec at
``docs/session-sets/050-schema-drift-detection-and-migration-guard/spec.md``;
verdict at
``docs/proposals/2026-05-29-session-set-currency-and-addressing/verdict.md``.

What this is
------------

A **detect-only** scanner. It walks ``<scan_root>/*/session-state.json``,
reads each file's ``schemaVersion``, compares it to the schema version this
installation actually supports, and reports any set that is on an older
schema together with the exact bulk-upgrade command to run. It never writes
state files and never runs a migrator — remediation stays an explicit
operator/orchestrator action (the "no silent auto-migration" non-goal).

This is the **richer CI / manual surface**. The session-start hot-path guard
(Set 050 S3) is a separate, pure-Node scanner with no ``ai_router``
dependency — because the incident repo that triggered this set
(``dabbler-access-harvester``) ran an ancient router with no
``check_migrations`` at all. The two scanners share a single source of
truth for "the current version": :data:`LOCAL_SCHEMA_VERSION` here equals
``ai_router``'s ``SESSION_STATE_SCHEMA_VERSION``, and a CI test pins the
JS constant to the same value.

Source of "current version" truth (verdict Q1)
----------------------------------------------

Two values, never conflated:

- :data:`LOCAL_SCHEMA_VERSION` — the schema this installation can read/write.
  **This is the runtime truth** for the scan's default mode. Sourced from
  ``session_state.SCHEMA_VERSION``.
- The *upstream* current version published in ``docs/schema-current.json``
  on the canonical repo. **Advisory only**, consulted off the hot path via
  the explicit ``--manifest-url`` flag (cached, fail-open). It lets a stale
  pinned consumer *learn* that a newer schema exists without a code bump; it
  never changes the per-file scan, which always uses the local constant.

The migration chain (empirically corrected — see CHAIN NOTE)
------------------------------------------------------------

CHAIN NOTE (Set 050 S2). The S1 verdict (Q7) locked the bulk-upgrade
sequence as two migrators — ``migrate_lightweight_to_canonical_v4`` then
``migrate_v3_to_v4`` — and claimed it "correctly handles a v2 set that needs
both steps." Implementing the S2 carried-risk-#2 test ("v2-needs-both-
migrators sequence") falsified that claim empirically: a *genuine* v2 file
(explicit ``schemaVersion: 2`` with the legacy currentSession/totalSessions/
completedSessions triple) was **skipped by both** of those migrators. The
v2→v3 step belongs to a *third* existing migrator, ``migrate_session_state``,
which the verdict's enumeration omitted.

Set 112 then deleted ``migrate_lightweight_to_canonical_v4`` along with the
Lightweight tier it existed to migrate off. Its slot in the chain is gone,
not replaced: the non-canonical shapes it repaired were Lightweight
hand-maintained state files, and there is no longer a tier that produces
them. The surviving chain (each step idempotent / skips inapplicable files;
ordered so output of step N feeds step N+1) is:

    1. python -m ai_router.migrate_session_state --in-place  # v2 -> v3
    2. python -m ai_router.migrate_v3_to_v4 --in-place       # v3 -> v4
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, List, Optional

try:  # test convention: bare import; production: relative fallback
    from session_state import SCHEMA_VERSION as LOCAL_SCHEMA_VERSION  # type: ignore[import-not-found]
except ImportError:
    from .session_state import SCHEMA_VERSION as LOCAL_SCHEMA_VERSION  # type: ignore[no-redef]

try:
    from migrate_v3_to_v4 import (  # type: ignore[import-not-found]
        SESSION_STATE_FILENAME,
        discover_session_sets,
    )
except ImportError:
    from .migrate_v3_to_v4 import (  # type: ignore[no-redef]
        SESSION_STATE_FILENAME,
        discover_session_sets,
    )


# --- drift status tokens -----------------------------------------------------

STATUS_CLEAN = "clean"        # schemaVersion == target
STATUS_DRIFT = "drift"        # schemaVersion < target, or missing/unknown
STATUS_AHEAD = "ahead"        # schemaVersion > target (this install is stale)
STATUS_UNREADABLE = "unreadable"  # file missing / not JSON / not an object


# --- migration chain ---------------------------------------------------------

# Symbolic migrator ID -> the local module that performs it. The GitHub
# manifest (docs/schema-current.json) carries only the symbolic IDs +
# version ranges (declarative, NO executable shell strings); command
# resolution lives here, in local code (verdict Q3).
MIGRATOR_MODULES = {
    "v2-to-v3": "ai_router.migrate_session_state",
    "v3-to-v4": "ai_router.migrate_v3_to_v4",
}

# Ordered bulk-upgrade chain. Run in this order, each idempotent and each a
# no-op / structured-skip on files it does not apply to, the sequence
# upgrades any drifted set to the current schema (see CHAIN NOTE in the
# module docstring).
BULK_UPGRADE_MIGRATOR_IDS = ["v2-to-v3", "v3-to-v4"]

MANIFEST_FILENAME = "schema-current.json"
_DEFAULT_MANIFEST_CACHE = Path.home() / ".dabbler" / "schema-manifest-cache.json"


def bulk_upgrade_commands() -> List[str]:
    """The ordered list of shell commands that upgrade any drifted set."""
    return [
        f"python -m {MIGRATOR_MODULES[mid]} --in-place"
        for mid in BULK_UPGRADE_MIGRATOR_IDS
    ]


def bulk_upgrade_oneliner() -> str:
    """The bulk-upgrade chain as a single copy-pasteable ``&&`` command."""
    return " && ".join(bulk_upgrade_commands())


# --- scan --------------------------------------------------------------------


@dataclass(frozen=True)
class DriftResult:
    """Per-set drift outcome."""

    set_dir: str
    schema_version: Optional[int]
    status: str
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "set_dir": self.set_dir,
            "set_name": os.path.basename(self.set_dir) or self.set_dir,
            "schema_version": self.schema_version,
            "status": self.status,
            "error": self.error,
        }


def _read_schema_version(state_path: str) -> tuple:
    """Return ``(schema_version_or_None, error_or_None)`` for one state file.

    ``schema_version`` is the integer ``schemaVersion`` field, or ``None``
    when the field is absent or not an integer. ``error`` is set (and the
    version is ``None``) when the file cannot be read as a JSON object —
    never raised, so one bad file does not abort the scan.
    """
    try:
        with open(state_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        return None, f"unreadable: {exc}"
    if not isinstance(data, dict):
        return None, "not a JSON object"
    version = data.get("schemaVersion")
    if isinstance(version, bool) or not isinstance(version, int):
        # Missing or non-integer schemaVersion. Treated as drift (a
        # pre-canonical / hand-authored shape), version reported as None.
        return None, None
    return version, None


def _classify(version: Optional[int], target: int, error: Optional[str]) -> str:
    if error is not None:
        return STATUS_UNREADABLE
    if version is None:
        return STATUS_DRIFT  # missing/unknown schemaVersion -> needs upgrade
    if version == target:
        return STATUS_CLEAN
    if version < target:
        return STATUS_DRIFT
    return STATUS_AHEAD


def detect_drift(scan_root: str, target: int = LOCAL_SCHEMA_VERSION) -> List[DriftResult]:
    """Scan every session set under ``scan_root`` and classify each.

    ``target`` defaults to :data:`LOCAL_SCHEMA_VERSION` — the schema this
    installation supports. Results are returned sorted by set-dir basename
    (the order :func:`discover_session_sets` already yields).
    """
    results: List[DriftResult] = []
    for set_dir in discover_session_sets(scan_root):
        state_path = os.path.join(set_dir, SESSION_STATE_FILENAME)
        version, error = _read_schema_version(state_path)
        status = _classify(version, target, error)
        results.append(
            DriftResult(
                set_dir=set_dir,
                schema_version=version,
                status=status,
                error=error,
            )
        )
    return results


# --- advisory manifest fetch (off the hot path) ------------------------------


def _urllib_fetch(url: str, *, timeout: float = 5.0) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "dabbler-ai-router/check_migrations"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (https URL, advisory)
        return resp.read()


@dataclass(frozen=True)
class ManifestResult:
    """Outcome of an advisory manifest fetch."""

    manifest: Optional[dict]
    source: str  # "network" | "cache" | "none"
    warning: Optional[str] = None


def fetch_manifest(
    url: str,
    *,
    strict: bool = False,
    cache_path: Path = _DEFAULT_MANIFEST_CACHE,
    fetch_fn: Callable[[str], bytes] = _urllib_fetch,
) -> ManifestResult:
    """Fetch the advisory schema manifest, fail-open with a cache fallback.

    Order of resolution (verdict Q2):
      1. Try the network. On success, refresh the cache and return it.
      2. On failure, fall back to the cache if present (with a warning).
      3. If both fail, return an empty result with a warning.

    ``strict`` (``--strict-manifest``) flips the posture to fail-loud: a
    network failure raises :class:`RuntimeError` instead of degrading.

    ``fetch_fn`` and ``cache_path`` are injectable for tests; production
    callers use the defaults.
    """
    try:
        raw = fetch_fn(url)
        manifest = json.loads(raw.decode("utf-8"))
        if not isinstance(manifest, dict):
            raise ValueError("manifest is not a JSON object")
        _try_write_cache(cache_path, raw)
        return ManifestResult(manifest=manifest, source="network")
    except Exception as exc:  # network, decode, or shape error
        if strict:
            raise RuntimeError(f"manifest fetch failed (strict mode): {exc}") from exc
        cached = _try_read_cache(cache_path)
        if cached is not None:
            return ManifestResult(
                manifest=cached,
                source="cache",
                warning=f"manifest fetch failed ({exc}); using cached copy",
            )
        return ManifestResult(
            manifest=None,
            source="none",
            warning=f"manifest fetch failed ({exc}); no cache - using local schema version only",
        )


def _try_write_cache(cache_path: Path, raw: bytes) -> None:
    try:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(raw)
    except OSError:
        pass  # cache is best-effort; never fatal


def _try_read_cache(cache_path: Path) -> Optional[dict]:
    try:
        data = json.loads(cache_path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def load_local_manifest() -> Optional[dict]:
    """Read the manifest shipped in this repo (``docs/schema-current.json``).

    Used by the manifest==constant CI guard. Returns ``None`` if the file
    is absent (e.g. a consumer checkout without docs/).
    """
    here = Path(__file__).resolve().parent.parent  # repo root (parent of ai_router/)
    candidate = here / "docs" / MANIFEST_FILENAME
    if not candidate.is_file():
        return None
    try:
        data = json.loads(candidate.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


# --- CLI ---------------------------------------------------------------------


def _default_scan_root() -> str:
    candidate = os.path.join(os.getcwd(), "docs", "session-sets")
    return candidate if os.path.isdir(candidate) else os.getcwd()


def summarize_drift(scan_root: Optional[str] = None) -> Optional[str]:
    """Return a terse, ASCII-only drift warning for the lifecycle CLIs, or None.

    Set 053: this is the helper chained into ``start_session`` (and, as a
    soft note, ``close_session``) so a schema-drift warning rides the
    script-driven session lifecycle — firing for every orchestrator
    (Claude, Copilot, Codex, human) at every session boundary on every
    host, with no editor hook, CI job, or git hook required.

    Runs :func:`detect_drift` over ``scan_root`` (default: the cwd's
    ``docs/session-sets``) and returns a single summary line when any set
    is on an OLDER schema than this install supports, OR has an
    unreadable/corrupt ``session-state.json``. Returns ``None`` when
    everything is current and readable (silent), OR when the scan cannot
    run at all — this is a **non-blocking, fail-open advisory**: a scan
    failure must never disrupt a session boundary. "Old schema is
    acceptable" (Set 050), so the line is informational, not a directive
    to migrate.

    Unreadable/corrupt files are surfaced too (not just older ones): a
    corrupt state file is a more urgent problem than a benign old-schema
    one and must not be hidden behind the drift count (Set 053 S2 IV&V).
    ``AHEAD`` (this install is older than a set's schema) is intentionally
    excluded — that is a tool-staleness signal, a different class of
    problem from "this set is behind."

    Output is ASCII-only (Windows cp1252 consoles cannot encode non-ASCII
    glyphs — the same constraint the CLI honors).
    """
    try:
        root = scan_root if scan_root is not None else _default_scan_root()
        results = detect_drift(root)
    except Exception:
        # Fail-open: never let a drift-scan error break start/close_session.
        return None

    older = [r for r in results if r.status == STATUS_DRIFT]
    unreadable = [r for r in results if r.status == STATUS_UNREADABLE]
    if not older and not unreadable:
        return None

    segments = []
    if older:
        known = sorted({r.schema_version for r in older if r.schema_version is not None})
        if known:
            detail = "older: " + ", ".join(f"v{v}" for v in known)
            n_unknown = sum(1 for r in older if r.schema_version is None)
            if n_unknown:
                detail += f", {n_unknown} with no/unknown version"
        else:
            detail = "no/unknown schemaVersion"
        segments.append(
            f"{len(older)} session-set(s) below the current schema "
            f"v{LOCAL_SCHEMA_VERSION} ({detail})"
        )
    if unreadable:
        segments.append(
            f"{len(unreadable)} session-set(s) with an unreadable/corrupt "
            f"session-state.json"
        )
    return (
        "[dabbler] " + "; ".join(segments) + ". Old schema is acceptable; to "
        "review or upgrade run: python -m ai_router.check_migrations --verbose"
    )


def _counts(results: List[DriftResult]) -> dict:
    return {
        "clean": sum(1 for r in results if r.status == STATUS_CLEAN),
        "drift": sum(1 for r in results if r.status == STATUS_DRIFT),
        "ahead": sum(1 for r in results if r.status == STATUS_AHEAD),
        "unreadable": sum(1 for r in results if r.status == STATUS_UNREADABLE),
        "total": len(results),
    }


def _format_version(r: DriftResult) -> str:
    return "v?" if r.schema_version is None else f"v{r.schema_version}"


def _print_human(
    results: List[DriftResult],
    target: int,
    *,
    verbose: bool,
    manifest_note: Optional[str],
) -> None:
    counts = _counts(results)
    drifted = [r for r in results if r.status in (STATUS_DRIFT, STATUS_AHEAD, STATUS_UNREADABLE)]

    if manifest_note:
        print(manifest_note)

    if not results:
        print("No session sets found.")
        return

    if not drifted:
        # Terse clean line (the JS hot-path hook stays fully silent when
        # clean; this manual/CI tool prints a one-line confirmation).
        print(f"OK: all {counts['total']} session set(s) at schema v{target}.")
        if verbose:
            for r in results:
                print(f"  [clean]  {os.path.basename(r.set_dir)}  ({_format_version(r)})")
        return

    n_drift = counts["drift"]
    # Locked one-line default (verdict Q4), ASCII-only for Windows consoles.
    print(
        f"WARNING: {n_drift} session set(s) on an older schema "
        f"(current: v{target}) -- old schema is OK to keep; "
        f"to upgrade, run the bulk migrator chain."
    )

    drift_names = [os.path.basename(r.set_dir) for r in results if r.status == STATUS_DRIFT]
    shown = drift_names[:5]
    if shown:
        print("  older: " + ", ".join(shown) + (
            f", ... and {len(drift_names) - len(shown)} more" if len(drift_names) > len(shown) else ""
        ))
    if counts["ahead"]:
        print(
            f"  ahead: {counts['ahead']} set(s) written by a NEWER schema than this "
            f"install supports -- upgrade dabbler-ai-router."
        )
    if counts["unreadable"]:
        print(f"  unreadable: {counts['unreadable']} state file(s) could not be parsed.")

    if verbose:
        print()
        for r in drifted:
            if r.status == STATUS_UNREADABLE:
                print(f"  [unreadable] {os.path.basename(r.set_dir)}  ({r.error})")
            elif r.status == STATUS_AHEAD:
                print(f"  [ahead]      {os.path.basename(r.set_dir)}  ({_format_version(r)} > v{target})")
            else:
                print(f"  [drift]      {os.path.basename(r.set_dir)}  ({_format_version(r)} -> v{target})")

    print()
    print("  Bulk upgrade (run from the repo root; each step is idempotent):")
    for cmd in bulk_upgrade_commands():
        print(f"    {cmd}")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ai_router.check_migrations",
        description=(
            "Detect-only schema-drift scanner. Walks "
            "<scan>/*/session-state.json and reports any set on an older "
            "schemaVersion than this installation supports, with the bulk "
            "upgrade command. Never writes state files. Exit non-zero on "
            "drift (for CI) unless --exit-zero."
        ),
    )
    parser.add_argument(
        "--scan",
        default=_default_scan_root(),
        help=(
            "Directory under which to find session sets. Default: "
            "./docs/session-sets when present, else the current directory."
        ),
    )
    parser.add_argument(
        "--target",
        type=int,
        default=LOCAL_SCHEMA_VERSION,
        help=(
            "Schema version to compare against. Default: this install's "
            f"supported version (v{LOCAL_SCHEMA_VERSION})."
        ),
    )
    parser.add_argument(
        "--manifest-url",
        default=None,
        help=(
            "Advisory: fetch the canonical schema manifest from this URL "
            "(cached, fail-open) and warn if it publishes a NEWER schema "
            "than this install supports. Does not change the per-set scan."
        ),
    )
    parser.add_argument(
        "--strict-manifest",
        action="store_true",
        help="Make an advisory --manifest-url fetch failure fatal (CI).",
    )
    parser.add_argument(
        "--exit-zero",
        action="store_true",
        help="Always exit 0 even when drift is found (for non-failing hooks).",
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="Per-set detail.")
    parser.add_argument(
        "--json", action="store_true", help="Machine-readable JSON instead of human text."
    )
    args = parser.parse_args(argv)

    results = detect_drift(args.scan, target=args.target)
    counts = _counts(results)

    manifest_note: Optional[str] = None
    manifest_payload: Optional[dict] = None
    if args.manifest_url:
        mres = fetch_manifest(args.manifest_url, strict=args.strict_manifest)
        manifest_payload = mres.manifest
        upstream = (mres.manifest or {}).get("currentSchemaVersion")
        notes = []
        if mres.warning:
            notes.append(f"NOTE: {mres.warning}")
        if isinstance(upstream, int) and upstream > LOCAL_SCHEMA_VERSION:
            min_router = (mres.manifest or {}).get("minimumAiRouterVersion", "(see manifest)")
            notes.append(
                f"NOTE: upstream publishes schema v{upstream}; this install "
                f"supports v{LOCAL_SCHEMA_VERSION}. Upgrade dabbler-ai-router "
                f"(>= {min_router}) to read/write the newer schema."
            )
        manifest_note = "\n".join(notes) if notes else None

    has_problem = bool(counts["drift"] or counts["ahead"] or counts["unreadable"])

    if args.json:
        print(
            json.dumps(
                {
                    "scan_root": args.scan,
                    "target": args.target,
                    "counts": counts,
                    "results": [r.to_dict() for r in results],
                    "bulk_upgrade_commands": bulk_upgrade_commands(),
                    "manifest": manifest_payload,
                    "manifest_note": manifest_note,
                },
                indent=2,
            )
        )
    else:
        _print_human(results, args.target, verbose=args.verbose, manifest_note=manifest_note)

    if args.exit_zero:
        return 0
    return 1 if has_problem else 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())


__all__ = [
    "LOCAL_SCHEMA_VERSION",
    "STATUS_CLEAN",
    "STATUS_DRIFT",
    "STATUS_AHEAD",
    "STATUS_UNREADABLE",
    "MIGRATOR_MODULES",
    "BULK_UPGRADE_MIGRATOR_IDS",
    "MANIFEST_FILENAME",
    "DriftResult",
    "ManifestResult",
    "bulk_upgrade_commands",
    "bulk_upgrade_oneliner",
    "detect_drift",
    "summarize_drift",
    "fetch_manifest",
    "load_local_manifest",
    "main",
]
