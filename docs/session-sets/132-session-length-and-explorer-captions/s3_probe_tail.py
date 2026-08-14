"""Set 132 S3 -- what actually distinguishes a long session from a median one.

Both panel advisors independently proposed the same cheap discriminators for
the residual (idle-corrected) tail: largest-gap share, verification-round
count, test-run count and re-runs, ``requiresE2E``, and the ceremony-vs-work
split. All of them are already on disk. This probe computes them and asks
one question: **once you know those, does N still carry signal?**

Population and duration conventions follow ``s2-measurement.md`` Section 1.
"""
from __future__ import annotations

import json
import pathlib
import statistics
from datetime import datetime

from ai_router.spec_admission import classify_steps, parse_session_plans, WORK

SETS = pathlib.Path("docs/session-sets")


def _ts(v):
    return datetime.fromisoformat(v) if v else None


def _jsonl(path):
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return out


def _requires_e2e(spec_text):
    # The configuration block is a fenced yaml block near the top.
    for line in spec_text.splitlines():
        s = line.strip()
        if s.startswith("requiresE2E:"):
            return "true" in s.lower()
    return None


def rows():
    out = []
    for set_dir in sorted(SETS.iterdir()):
        if not set_dir.is_dir():
            continue
        state_path, spec_path = set_dir / "session-state.json", set_dir / "spec.md"
        if not (state_path.exists() and spec_path.exists()):
            continue
        state = json.loads(state_path.read_text(encoding="utf-8"))
        if state.get("schemaVersion") != 4:
            continue
        spec_text = spec_path.read_text(encoding="utf-8")
        plans = {p.number: p for p in parse_session_plans(spec_text)}
        e2e = _requires_e2e(spec_text)
        log_path = set_dir / "activity-log.json"
        entries = (
            json.loads(log_path.read_text(encoding="utf-8")).get("entries", [])
            if log_path.exists()
            else []
        )
        test_runs = _jsonl(set_dir / "test-runs.jsonl")
        for session in state.get("sessions", []):
            num = session.get("number")
            plan = plans.get(num)
            started, completed = _ts(session.get("startedAt")), _ts(session.get("completedAt"))
            if not (plan and plan.steps and started and completed):
                continue
            elapsed = (completed - started).total_seconds() / 60.0
            if elapsed <= 0:
                continue
            roles = classify_steps(plan.steps)
            marks = sorted(
                (
                    (_ts(e["dateTime"]), e.get("stepNumber"))
                    for e in entries
                    if e.get("sessionNumber") == num
                    and e.get("kind") != "plan-step"
                    and e.get("dateTime")
                    and e.get("status") == "complete"
                ),
                key=lambda m: m[0],
            )
            gaps, cursor = [], started
            work_min = cer_min = 0.0
            mappable = bool(marks) and all(
                isinstance(sn, int) and 1 <= sn <= len(roles) for _, sn in marks
            )
            for when, step_no in marks:
                delta = max((when - cursor).total_seconds() / 60.0, 0.0)
                gaps.append(delta)
                if mappable:
                    if roles[step_no - 1] == WORK:
                        work_min += delta
                    else:
                        cer_min += delta
                cursor = when
            tail_gap = max((completed - cursor).total_seconds() / 60.0, 0.0)
            gaps.append(tail_gap)
            if mappable:
                cer_min += tail_gap
            rounds = _jsonl(set_dir / f"s{num}-rounds.jsonl")
            runs = [r for r in test_runs if r.get("sessionNumber") == num]
            out.append(
                {
                    "id": f"{set_dir.name[:3]} S{num}",
                    "N": sum(1 for r in roles if r == WORK),
                    "elapsed": elapsed,
                    "same_day": started.date() == completed.date(),
                    "marks": len(marks),
                    "max_gap": max(gaps) if gaps else 0.0,
                    "max_gap_share": (max(gaps) / elapsed) if gaps and elapsed else 0.0,
                    "idle_trimmed": sum(min(g, 45.0) for g in gaps),
                    "rounds": len([r for r in rounds if r.get("event") == "round-completed"]),
                    "verif_artifacts": len(list(set_dir.glob(f"s{num}-verification*.md"))),
                    "test_runs": len(runs),
                    "suites": len({r.get("suite") for r in runs}),
                    "e2e": e2e,
                    "work_min": work_min if mappable else None,
                    "cer_min": cer_min if mappable else None,
                }
            )
    return out


def med(xs):
    xs = [x for x in xs if x is not None]
    return statistics.median(xs) if xs else float("nan")


def describe(label, group, all_rows):
    print(f"\n== {label} (n={len(group)}) ==")
    fields = [
        ("elapsed min", "elapsed"),
        ("idle-trimmed min", "idle_trimmed"),
        ("N", "N"),
        ("marks logged", "marks"),
        ("largest gap min", "max_gap"),
        ("largest-gap share", "max_gap_share"),
        ("verification rounds", "rounds"),
        ("verification artifacts", "verif_artifacts"),
        ("test runs recorded", "test_runs"),
        ("distinct suites", "suites"),
        ("ceremony min", "cer_min"),
        ("work min", "work_min"),
    ]
    print(f"{'median of':>24} {'tail':>9} {'rest':>9}")
    rest = [r for r in all_rows if r not in group]
    for name, key in fields:
        print(f"{name:>24} {med([r[key] for r in group]):>9.2f} "
              f"{med([r[key] for r in rest]):>9.2f}")
    e2e_t = [r for r in group if r["e2e"]]
    e2e_r = [r for r in rest if r["e2e"]]
    print(f"{'requiresE2E share':>24} {len(e2e_t) / max(len(group), 1):>9.0%} "
          f"{len(e2e_r) / max(len(rest), 1):>9.0%}")


def main():
    data = rows()
    same_day = [r for r in data if r["same_day"]]
    print(f"n = {len(data)} sessions ({len(same_day)} same calendar day)")

    # The residual tail, defined on the CLEAN measure: same-day sessions in
    # the top decile of idle-trimmed minutes.
    ranked = sorted(same_day, key=lambda r: r["idle_trimmed"], reverse=True)
    k = max(len(ranked) // 10, 5)
    tail = ranked[:k]
    describe("residual tail: top decile of idle-trimmed, same-day", tail, same_day)

    print("\n-- the tail sessions themselves --")
    print(f"{'session':>9} {'trimmed':>8} {'elapsed':>8} {'N':>3} {'marks':>6} "
          f"{'maxgap':>7} {'share':>6} {'rounds':>7} {'runs':>5} {'cer':>7} {'work':>7}")
    for r in tail:
        print(f"{r['id']:>9} {r['idle_trimmed']:>8.0f} {r['elapsed']:>8.0f} "
              f"{r['N']:>3} {r['marks']:>6} {r['max_gap']:>7.0f} "
              f"{r['max_gap_share']:>6.0%} {r['rounds']:>7} {r['test_runs']:>5} "
              f"{(r['cer_min'] if r['cer_min'] is not None else float('nan')):>7.0f} "
              f"{(r['work_min'] if r['work_min'] is not None else float('nan')):>7.0f}")

    print("\n-- does N still carry signal once the discriminators are known? --")
    scored = [r for r in same_day if r["marks"] > 0]
    print("  NOTE: idle-trimmed minutes are BUILT from the marks (a sum of "
          "capped\n  inter-mark gaps), so corr(marks, idle-trimmed) is partly "
          "mechanical.\n  Elapsed minutes are independent of how many marks "
          "were logged, so the\n  elapsed column is the honest one for `marks`.")
    print(f"\n  {'discriminator':>16} {'vs idle-trimmed':>17} {'vs elapsed':>12}")
    for key in ("N", "marks", "max_gap", "max_gap_share", "rounds",
                "verif_artifacts", "test_runs"):
        xs = [r[key] for r in scored]
        if len(set(xs)) <= 1:
            continue
        c_trim = statistics.correlation(xs, [r["idle_trimmed"] for r in scored])
        c_elapsed = statistics.correlation(xs, [r["elapsed"] for r in scored])
        print(f"  {key:>16} {c_trim:>+17.3f} {c_elapsed:>+12.3f}")
    print(f"  (n={len(scored)})")
    print("  NOTE 2: max_gap is bounded above by elapsed, so its elapsed "
          "correlation is\n  structural too; max_gap_share is the "
          "non-mechanical form of the same idea.")

    # Era control. Sessions got longer over time and recent sets also write
    # more verification artifacts, so the whole-corpus ranking could be one
    # era effect wearing two hats. Re-rank inside the recent era only.
    recent = [r for r in scored if r["id"][:3].isdigit() and int(r["id"][:3]) >= 111]
    print(f"\n-- era control: sets 111+ only (n={len(recent)}) --")
    print(f"  {'discriminator':>16} {'vs elapsed':>12}")
    for key in ("N", "marks", "max_gap_share", "rounds", "verif_artifacts",
                "test_runs"):
        xs = [r[key] for r in recent]
        if len(set(xs)) <= 1:
            continue
        print(f"  {key:>16} "
              f"{statistics.correlation(xs, [r['elapsed'] for r in recent]):>+12.3f}")

    # Sessions that recorded test runs are a proxy for "reached the expensive
    # stages at all"; the split is reported rather than controlled for.
    with_runs = [r for r in scored if r["test_runs"] > 0]
    without = [r for r in scored if r["test_runs"] == 0]
    print(f"\n  median idle-trimmed WITH recorded test runs (n={len(with_runs)}): "
          f"{med([r['idle_trimmed'] for r in with_runs]):.0f} min")
    print(f"  median idle-trimmed WITHOUT             (n={len(without)}): "
          f"{med([r['idle_trimmed'] for r in without]):.0f} min")


if __name__ == "__main__":
    main()
