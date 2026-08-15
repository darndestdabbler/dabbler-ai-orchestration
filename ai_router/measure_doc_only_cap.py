"""Measure the Set 119 doc-only severity cap against recorded verification traffic.

Set 121 S4 was chartered to answer one question the sequencing note asked and
nobody could answer: **does the doc-only cap ever fire?** A number produced once
by hand is not evidence -- the next set would have to re-derive it, and this
repo has twice shipped a spec whose own numbers were stale. So the measurement
ships as a module.

It deliberately calls the SHIPPED predicates (:func:`is_doc_only_issue`,
:func:`is_documentation_path`, :func:`is_blocking_issue`) rather than
reimplementing the rule. A measurement that models the cap reports on the model.

Every finding lands in exactly one bucket:

``uncited``
    No usable ``evidencePaths``. Unchanged by the cap -- absence is not
    doc-ness, so Critical/Major/unknown all still block.
``doc-only``
    Every cited path is documentation prose. **This is what the cap caps.**
``code-only``
    No cited path is documentation.
``mixed``
    Both. The cap requires *every* path to be documentation, so a mixed finding
    keeps its declared severity -- the predicted way the cap gets defeated on
    prose-heavy work, because a reviewer of a doc change naturally cites the doc
    *and* the code the doc describes.

Usage::

    python -m ai_router.measure_doc_only_cap <set-dir> [--json <out>]
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import statistics
from typing import List, Optional

try:  # package import
    from .verification import (
        is_blocking_issue,
        is_doc_only_issue,
        is_documentation_path,
        normalize_evidence_path,
    )
except ImportError:  # flat-module import (the repo's test convention)
    from verification import (  # type: ignore[no-redef]
        is_blocking_issue,
        is_doc_only_issue,
        is_documentation_path,
        normalize_evidence_path,
    )

#: Median verification rounds per session across sets 111-116, measured from
#: ``s*-rounds.jsonl`` before the cap shipped (Set 121 spec, section 4).
PRE_CAP_MEDIAN_ROUNDS = 4.0

BUCKETS = ("uncited", "doc-only", "code-only", "mixed")
_SUMMED = (
    "findings",
    "cited",
    "uncited",
    "doc-only",
    "code-only",
    "mixed",
    "capped",
    "blocking_after_cap",
    "blocking_if_mixed_capped",
)


def cited_paths(issue: dict) -> List[str]:
    """The finding's usable evidence paths (decoration normalized away)."""
    raw = (issue or {}).get("evidencePaths")
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, (list, tuple)):
        return []
    return [p for p in raw if isinstance(p, str) and normalize_evidence_path(p)]


def classify(issue: dict) -> str:
    """Bucket one finding: ``uncited`` / ``doc-only`` / ``code-only`` / ``mixed``."""
    paths = cited_paths(issue)
    if not paths:
        return "uncited"
    docs = [p for p in paths if is_documentation_path(p)]
    if len(docs) == len(paths):
        return "doc-only"
    if not docs:
        return "code-only"
    return "mixed"


#: The ledger event that records a COMPLETED metered verification round.
#: ``operator-authorization`` rows also live in ``sN-rounds.jsonl`` -- they
#: record permission to exceed a bound, not a round that ran -- so counting
#: every non-blank line overstates loop cost. Set 121 S4 shipped that bug and
#: its own verification caught it: S1's ledger holds 6 completed rounds plus
#: one authorization row, which a line count reported as 7.
ROUND_COMPLETED_EVENT = "round-completed"


def _round_counts(set_dir: str) -> dict:
    """Completed metered rounds per session, from the ``sN-rounds.jsonl`` ledgers.

    The ledger is the true count: the close backstop ledgers every round it
    runs, so this is the same source and method the pre-cap median used. Only
    :data:`ROUND_COMPLETED_EVENT` rows count.
    """
    counts = {}
    for path in sorted(glob.glob(os.path.join(set_dir, "s*-rounds.jsonl"))):
        name = os.path.basename(path)
        try:
            session = int(name[1 : name.index("-")])
        except ValueError:
            continue
        completed = 0
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except ValueError:
                    continue
                if isinstance(row, dict) and row.get("event") == ROUND_COMPLETED_EVENT:
                    completed += 1
        counts[session] = completed
    return counts


def measure(set_dir: str) -> dict:
    """Bucket every finding in every ``sN-issues*.json`` under *set_dir*."""
    rows = []
    for path in sorted(glob.glob(os.path.join(set_dir, "s*-issues*.json"))):
        with open(path, encoding="utf-8") as handle:
            payload = json.load(handle)
        issues = payload.get("issues") or []
        counts = dict.fromkeys(BUCKETS, 0)
        capped = 0
        blocking_after = 0
        blocking_if_mixed_capped = 0
        severities: dict = {}
        for issue in issues:
            kind = classify(issue)
            counts[kind] += 1
            sev = str(issue.get("severity") or "").strip() or "unrated"
            severities[sev] = severities.get(sev, 0) + 1
            if is_doc_only_issue(issue):
                # Strip the paths to ask what the severity alone would have
                # done; the cap fired only if that answer was "block".
                bare = {k: v for k, v in issue.items() if k != "evidencePaths"}
                if is_blocking_issue(bare):
                    capped += 1
            if is_blocking_issue(issue):
                blocking_after += 1
                # COUNTERFACTUAL ONLY. Widening the cap to mixed citations is a
                # verification reduction and is reserved to the operator (Set
                # 121 spec, decision 5). This sizes the question; it does not
                # answer it, and nothing here changes any severity.
                if kind != "mixed":
                    blocking_if_mixed_capped += 1
        rows.append(
            {
                "artifact": os.path.basename(path),
                "session": payload.get("sessionNumber"),
                "round": payload.get("verificationRound"),
                "phase": payload.get("phase"),
                "verdict": payload.get("verificationVerdict"),
                "findings": len(issues),
                "cited": len(issues) - counts["uncited"],
                **counts,
                "capped": capped,
                "blocking_after_cap": blocking_after,
                "blocking_if_mixed_capped": blocking_if_mixed_capped,
                "severities": severities,
            }
        )
    rows.sort(key=lambda r: (r["session"] or 0, r["round"] or 0))

    rounds = _round_counts(set_dir)
    blocked = [r for r in rows if r["blocking_after_cap"]]
    return {
        "setDir": set_dir,
        "rows": rows,
        "roundsPerSession": rounds,
        "medianRounds": statistics.median(rounds.values()) if rounds else None,
        "preCapMedianRounds": PRE_CAP_MEDIAN_ROUNDS,
        "totals": {k: sum(r[k] for r in rows) for k in _SUMMED},
        "counterfactual": {
            "roundsWithBlockingFindings": len(blocked),
            "roundsCarryingOnlyMixedBlockers": sum(
                1 for r in blocked if not r["blocking_if_mixed_capped"]
            ),
        },
    }


def render(report: dict) -> str:
    """The per-round table the spec's Step 4 asks for."""
    header = (
        f"{'artifact':<26}{'S':>2}{'R':>3}{'find':>6}{'cited':>7}"
        f"{'doc':>5}{'code':>6}{'mixed':>7}{'capped':>8}"
    )
    lines = [header, "-" * len(header)]
    for r in report["rows"]:
        lines.append(
            f"{r['artifact']:<26}{r['session'] or 0:>2}{r['round'] or 0:>3}"
            f"{r['findings']:>6}{r['cited']:>7}{r['doc-only']:>5}"
            f"{r['code-only']:>6}{r['mixed']:>7}{r['capped']:>8}"
        )
    t = report["totals"]
    lines.append("-" * len(header))
    lines.append(
        f"{'TOTAL':<26}{'':>2}{'':>3}{t['findings']:>6}{t['cited']:>7}"
        f"{t['doc-only']:>5}{t['code-only']:>6}{t['mixed']:>7}{t['capped']:>8}"
    )
    lines.append("")
    lines.append(f"uncited findings: {t['uncited']}")
    lines.append(
        f"rounds per session: {report['roundsPerSession']}  "
        f"median={report['medianRounds']}  "
        f"pre-cap median={report['preCapMedianRounds']}"
    )
    lines.append(f"the cap FIRED on {t['capped']} finding(s)")
    cf = report["counterfactual"]
    lines.append(
        f"counterfactual (NOT a proposal): of the "
        f"{cf['roundsWithBlockingFindings']} round artifact(s) carrying a "
        f"blocking finding, {cf['roundsCarryingOnlyMixedBlockers']} carried "
        f"ONLY mixed-citation blockers"
    )
    return "\n".join(lines)


def render_markdown(report: dict) -> str:
    """The same per-round table as a Markdown table.

    The report artifact is regenerated from this rather than hand-copied: a
    hand-maintained table drifts from its own JSON on the next round, which is
    the consistency-echo failure (G-012) this repo keeps paying for.
    """
    lines = [
        "| artifact | S | R | findings | cited `evidencePaths` | doc-only "
        "| code-only | **mixed** | capped |",
        "| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for r in report["rows"]:
        lines.append(
            f"| `{r['artifact']}` | {r['session']} | {r['round']} "
            f"| {r['findings']} | {r['cited']} | {r['doc-only']} "
            f"| {r['code-only']} | {r['mixed']} | **{r['capped']}** |"
        )
    t = report["totals"]
    lines.append(
        f"| **TOTAL** | | | **{t['findings']}** | **{t['cited']}** "
        f"| **{t['doc-only']}** | **{t['code-only']}** | **{t['mixed']}** "
        f"| **{t['capped']}** |"
    )
    return "\n".join(lines)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ai_router.measure_doc_only_cap",
        description=(
            "Measure the Set 119 doc-only severity cap against a session set's "
            "recorded verification traffic. Read-only; changes no severity."
        ),
    )
    parser.add_argument("set_dir", help="Path to the session-set directory.")
    parser.add_argument("--json", dest="json_out", help="Also write the raw report here.")
    parser.add_argument(
        "--markdown",
        action="store_true",
        help="Render the per-round table as Markdown (for the report artifact).",
    )
    args = parser.parse_args(argv)

    report = measure(args.set_dir)
    print(render_markdown(report) if args.markdown else render(report))
    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as handle:
            json.dump(report, handle, indent=2)
            handle.write("\n")
        print(f"wrote {args.json_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
