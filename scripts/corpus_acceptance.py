"""Corpus acceptance: run the v2 reader over every v1 session set in place.

Asserts: zero crashes, set-status totals match the checked manifest, and
v3-on-disk sets normalize to the v4 read view. Run manually:

    .venv/Scripts/python scripts/corpus_acceptance.py [--corpus-root PATH]
    .venv/Scripts/python scripts/corpus_acceptance.py --write-manifest

The manifest at tests/fixtures/corpus-manifest.json is written once and
hand-checked; a later disagreement means either the corpus changed or the
reader regressed — check the set by hand before "fixing" either side.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_router.progress import build_projection  # noqa: E402

DEFAULT_CORPUS = Path("d:/Projects/dabbler-ai-orchestration/docs/session-sets")
MANIFEST = (
    Path(__file__).resolve().parents[1]
    / "tests" / "fixtures" / "corpus-manifest.json"
)


def scan(corpus_root: Path) -> tuple:
    statuses: dict = {}
    crashes: list = []
    v3_normalized = 0
    for set_dir in sorted(corpus_root.iterdir()):
        if not set_dir.is_dir() or set_dir.name.startswith("_"):
            continue
        try:
            projection = build_projection(set_dir)
        except Exception as exc:  # a crash on any set is the failure
            crashes.append((set_dir.name, f"{type(exc).__name__}: {exc}"))
            continue
        statuses[set_dir.name] = projection["set"]["status"]
        if projection["set"]["schemaVersionOnDisk"] == 3:
            # v3 normalizes on read: sessions must carry the v4 metadata
            # keys and the projection must expose derived fields.
            sessions = projection["sessions"]
            if not sessions or any(
                "verificationVerdict" not in s for s in sessions
            ):
                crashes.append(
                    (set_dir.name, "v3 set did not normalize to v4 shape")
                )
                continue
            v3_normalized += 1
    return statuses, crashes, v3_normalized


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus-root", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--write-manifest", action="store_true")
    args = parser.parse_args()

    if not args.corpus_root.is_dir():
        print(f"corpus root not found: {args.corpus_root}", file=sys.stderr)
        return 2

    statuses, crashes, v3_count = scan(args.corpus_root)
    totals = Counter(statuses.values())
    print(f"sets read: {len(statuses)}; v3 normalized on read: {v3_count}")
    print(f"status totals: {dict(sorted(totals.items()))}")

    if crashes:
        print(f"\nFAIL: {len(crashes)} crash(es):", file=sys.stderr)
        for name, error in crashes:
            print(f"  {name}: {error}", file=sys.stderr)
        return 1

    if args.write_manifest:
        MANIFEST.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST.write_text(
            json.dumps(
                {"totals": dict(sorted(totals.items())),
                 "sets": dict(sorted(statuses.items()))},
                indent=2,
            ) + "\n",
            encoding="utf-8",
        )
        print(f"manifest written: {MANIFEST}")
        return 0

    if not MANIFEST.exists():
        print("no manifest; run with --write-manifest once and hand-check "
              "it.", file=sys.stderr)
        return 2
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    failures = []
    if manifest["totals"] != dict(sorted(totals.items())):
        failures.append(
            f"totals drifted: manifest {manifest['totals']} vs "
            f"reader {dict(sorted(totals.items()))}"
        )
    for name, expected in manifest["sets"].items():
        got = statuses.get(name)
        if got != expected:
            failures.append(f"{name}: manifest {expected!r} vs reader {got!r}")
    if failures:
        print("\nFAIL:", file=sys.stderr)
        for failure in failures:
            print(f"  {failure}", file=sys.stderr)
        return 1
    print("OK: totals and per-set statuses match the manifest.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
