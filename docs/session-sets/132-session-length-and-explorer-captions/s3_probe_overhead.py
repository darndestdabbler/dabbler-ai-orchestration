"""Set 132 S3 — the observational fallback, run rather than merely evaluated.

Estimates per-session fixed overhead ``F`` directly, from the timestamps of
the steps the fixed instrument classifies as **ceremony**, and then tests
``w-bar(N)`` -- mean minutes per WORK step -- against N directly, instead of
through the ``F/N + w-bar`` composite that Set 131 could not decompose.

Population and duration conventions follow
``s2-measurement.md`` Section 1 so the two documents are comparable.

Attribution rule: walk each session's logged marks in time order; the
interval ending at a ``complete`` mark is charged to that mark's step.
``in-progress`` marks do not close an interval. Per-STEP figures are NOT
reported, because a run of marks written at one instant charges the whole
preceding interval to whichever of them sorts first.

That grouping is safe **within** a role and unsafe across one. Both Set 132
path-aware critics rejected an earlier, stronger claim that per-role totals
were robust to batch logging outright: a batch containing both a work step
and a ceremony step charges the interval to one role arbitrarily. The probe
therefore COUNTS such batches (``mixed_role_batches``) and reports a cut with
those sessions removed, rather than asserting the problem away. Detection is
on **identical timestamps**, not a tolerance window, so near-simultaneous
marks a fraction of a second apart are treated as separate intervals.
"""
from __future__ import annotations

import json
import pathlib
import statistics
from datetime import datetime

from ai_router.spec_admission import classify_steps, parse_session_plans, WORK

SETS = pathlib.Path("docs/session-sets")
IDLE_CAP_MIN = 45.0


def _ts(value):
    return datetime.fromisoformat(value) if value else None


def rows():
    out = []
    # Exclusion counters by reason. Both critics flagged that "sessions with a
    # parseable plan and logged marks" understated the filter: the
    # step-number-out-of-range drop is a real, non-neutral exclusion and was
    # not disclosed. Counted here so the document can quote it.
    drops = {
        "no_plan_or_timestamps": 0,
        "non_positive_duration": 0,
        "no_complete_marks": 0,
        "step_number_outside_parse": 0,
    }
    for set_dir in sorted(SETS.iterdir()):
        if not set_dir.is_dir():
            continue
        state_path = set_dir / "session-state.json"
        spec_path = set_dir / "spec.md"
        log_path = set_dir / "activity-log.json"
        if not (state_path.exists() and spec_path.exists()):
            continue
        state = json.loads(state_path.read_text(encoding="utf-8"))
        if state.get("schemaVersion") != 4:
            continue
        plans = {p.number: p for p in parse_session_plans(spec_path.read_text(encoding="utf-8"))}
        entries = []
        if log_path.exists():
            entries = json.loads(log_path.read_text(encoding="utf-8")).get("entries", [])
        for session in state.get("sessions", []):
            num = session.get("number")
            plan = plans.get(num)
            started, completed = _ts(session.get("startedAt")), _ts(session.get("completedAt"))
            if not (plan and plan.steps and started and completed):
                drops["no_plan_or_timestamps"] += 1
                continue
            minutes = (completed - started).total_seconds() / 60.0
            if minutes <= 0:
                drops["non_positive_duration"] += 1
                continue
            roles = classify_steps(plan.steps)
            n_work = sum(1 for r in roles if r == WORK)
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
            # A logged step number outside the current parse means the seeded
            # plan and today's parse disagree (the five D1 sessions); the role
            # mapping would be wrong, so the session is dropped, not guessed.
            # NOT a neutral exclusion -- it removes exactly the sessions whose
            # specs D1 mis-parsed -- so it is counted and disclosed.
            if not marks:
                drops["no_complete_marks"] += 1
                continue
            if any(
                not isinstance(sn, int) or sn < 1 or sn > len(roles) for _, sn in marks
            ):
                drops["step_number_outside_parse"] += 1
                continue
            work_min = cer_min = work_min_trim = cer_min_trim = 0.0
            cursor = started
            # Group marks by timestamp. An IDENTICAL-timestamp batch that ends
            # a non-zero interval AND mixes roles is un-attributable: all of
            # that elapsed time lands on whichever member sorts first, so a
            # work+ceremony batch charges ceremony time to work (or the
            # reverse). Grouping is exact-equality, not a tolerance window, so
            # marks a fraction of a second apart stay separate intervals.
            # Counted, and reported as a sensitivity cut, rather than assumed
            # away -- both path-aware critics caught the original claim that
            # per-role totals were robust to batching, which holds only
            # WITHIN a role.
            mixed_role_batches = 0
            groups: list[tuple] = []
            for when, step_no in marks:
                if groups and groups[-1][0] == when:
                    groups[-1][1].append(step_no)
                else:
                    groups.append((when, [step_no]))
            for when, step_nos in groups:
                delta = (when - cursor).total_seconds() / 60.0
                if delta < 0:
                    delta = 0.0
                trimmed = min(delta, IDLE_CAP_MIN)
                batch_roles = {roles[sn - 1] == WORK for sn in step_nos}
                if delta > 0 and len(batch_roles) > 1:
                    mixed_role_batches += 1
                # The interval is charged to the first member's role, which is
                # the rule the document states; when the batch is mixed that
                # choice is arbitrary, which is what the counter records.
                if roles[step_nos[0] - 1] == WORK:
                    work_min += delta
                    work_min_trim += trimmed
                else:
                    cer_min += delta
                    cer_min_trim += trimmed
                cursor = when
            tail = max((completed - cursor).total_seconds() / 60.0, 0.0)
            cer_min += tail
            cer_min_trim += min(tail, IDLE_CAP_MIN)
            covered = sorted({sn for _, sn in marks})
            out.append(
                {
                    "set": set_dir.name,
                    "session": num,
                    "N": n_work,
                    "ceremony_steps": len(roles) - n_work,
                    "declared": len(plan.steps),
                    "elapsed": minutes,
                    "work_min": work_min,
                    "cer_min": cer_min,
                    "work_min_trim": work_min_trim,
                    "cer_min_trim": cer_min_trim,
                    "marks": len(marks),
                    "mixed_role_batches": mixed_role_batches,
                    "work_marks": sum(1 for _, sn in marks if roles[sn - 1] == WORK),
                    "covered_work": sum(
                        1 for sn in covered if roles[sn - 1] == WORK
                    ),
                    "crosses_day": started.date() != completed.date(),
                }
            )
    return out, drops


def band(n):
    if n <= 2:
        return "<=2"
    if n == 3:
        return "3"
    if n <= 5:
        return "4-5"
    return ">=6"


def med(xs):
    return statistics.median(xs) if xs else float("nan")


def main():
    data, drops = rows()
    print(f"n = {len(data)} sessions with marks and a parseable plan")
    print("excluded, by reason: " + ", ".join(f"{k}={v}" for k, v in drops.items()))
    mixed = [r for r in data if r["mixed_role_batches"] > 0]
    print(f"sessions containing a MIXED-ROLE same-timestamp batch that ends a "
          f"non-zero interval: {len(mixed)} of {len(data)}")
    # The step_number_outside_parse drop is large and NOT era-neutral: it
    # removes sessions whose seeded plan (written by the pre-Set-132 parser)
    # disagrees with today's parse, which skews the surviving population
    # recent. Reported so the document cannot quietly inherit the skew.
    bands = {}
    for r in data:
        head = r["set"][:3]
        if head.isdigit():
            bands.setdefault(f"{int(head) // 10 * 10:03d}s", 0)
            bands[f"{int(head) // 10 * 10:03d}s"] += 1
    print("surviving population by set decade: "
          + ", ".join(f"{k}={v}" for k, v in sorted(bands.items())))
    print()

    for label, wkey, ckey, subset in (
        ("ALL, elapsed", "work_min", "cer_min", data),
        ("ALL, idle-trimmed at 45m", "work_min_trim", "cer_min_trim", data),
        (
            "SAME CALENDAR DAY, elapsed",
            "work_min",
            "cer_min",
            [r for r in data if not r["crosses_day"]],
        ),
        (
            "NO MIXED-ROLE BATCH (the un-attributable sessions removed)",
            "work_min",
            "cer_min",
            [r for r in data if r["mixed_role_batches"] == 0],
        ),
    ):
        print(f"== {label} (n={len(subset)}) ==")
        print(f"{'N band':>7} {'n':>4} {'med F (cer)':>12} {'med W':>8} "
              f"{'med w-bar':>10} {'med elapsed':>12} {'F share':>8}")
        for b in ("<=2", "3", "4-5", ">=6"):
            rs = [r for r in subset if band(r["N"]) == b]
            if not rs:
                continue
            wbars = [r[wkey] / r["N"] for r in rs if r["N"] > 0]
            f_share = [
                r[ckey] / (r[ckey] + r[wkey])
                for r in rs
                if (r[ckey] + r[wkey]) > 0
            ]
            print(
                f"{b:>7} {len(rs):>4} {med([r[ckey] for r in rs]):>12.1f} "
                f"{med([r[wkey] for r in rs]):>8.1f} {med(wbars):>10.1f} "
                f"{med([r['elapsed'] for r in rs]):>12.1f} "
                f"{med(f_share):>7.0%}"
            )
        wbars_all = [r[wkey] / r["N"] for r in subset if r["N"] > 0]
        ns = [r["N"] for r in subset if r["N"] > 0]
        if len(ns) > 2:
            print(f"  corr(N, w-bar) = {statistics.correlation(ns, wbars_all):+.3f}"
                  f"   median F = {med([r[ckey] for r in subset]):.1f} min"
                  f"   median w-bar = {med(wbars_all):.1f} min")
        print()

    print("== exact N, elapsed (the decomposition the composite could not do) ==")
    print(f"{'N':>3} {'n':>4} {'med F':>7} {'med w-bar':>10} {'med W':>7} {'med total':>10}")
    for n in sorted({r["N"] for r in data}):
        rs = [r for r in data if r["N"] == n and r["N"] > 0]
        if len(rs) < 3:
            continue
        print(
            f"{n:>3} {len(rs):>4} {med([r['cer_min'] for r in rs]):>7.1f} "
            f"{med([r['work_min'] / r['N'] for r in rs]):>10.1f} "
            f"{med([r['work_min'] for r in rs]):>7.1f} "
            f"{med([r['elapsed'] for r in rs]):>10.1f}"
        )

    print("\n== coverage: how many work steps actually got their own mark ==")
    full = [r for r in data if r["covered_work"] >= r["N"] and r["N"] > 0]
    print(f"sessions whose every work step carries a distinct logged number: "
          f"{len(full)} / {len([r for r in data if r['N'] > 0])}")
    wbars = [r["work_min"] / r["N"] for r in full]
    ns = [r["N"] for r in full]
    if len(ns) > 2:
        print(f"  restricted to those: corr(N, w-bar) = "
              f"{statistics.correlation(ns, wbars):+.3f}, median w-bar = "
              f"{med(wbars):.1f} min, median F = "
              f"{med([r['cer_min'] for r in full]):.1f} min")
        print(f"{'N':>3} {'n':>4} {'med F':>7} {'med w-bar':>10}")
        for n in sorted({r["N"] for r in full}):
            rs = [r for r in full if r["N"] == n]
            if len(rs) < 3:
                continue
            print(f"{n:>3} {len(rs):>4} {med([r['cer_min'] for r in rs]):>7.1f} "
                  f"{med([r['work_min'] / r['N'] for r in rs]):>10.1f}")

    # The composition check both advisors were asked to attack: ceremony time
    # cannot be compared across sessions that declare different numbers of
    # ceremony steps. A session is "skeleton-era" when the classifier finds
    # the full four-slot skeleton (Set 128 onward); before that, tail stages
    # were routinely compressed into one step or omitted, so their ceremony
    # time is not absent -- it is charged to work steps.
    print("\n== composition check: ceremony steps declared, by N band ==")
    print(f"{'N band':>7} {'n':>4} {'med ceremony steps':>20} {'skeleton-era share':>20}")
    for b in ("<=2", "3", "4-5", ">=6"):
        rs = [r for r in data if band(r["N"]) == b]
        if not rs:
            continue
        skel = [r for r in rs if r["ceremony_steps"] >= 4]
        print(f"{b:>7} {len(rs):>4} {med([r['ceremony_steps'] for r in rs]):>20.1f} "
              f"{len(skel) / len(rs):>19.0%}")

    print("\n== SKELETON-ERA ONLY (>= 4 ceremony steps), elapsed ==")
    skel = [r for r in data if r["ceremony_steps"] >= 4 and r["N"] > 0]
    print(f"n = {len(skel)}")
    print(f"{'N':>3} {'n':>4} {'med F':>7} {'med w-bar':>10} {'med W':>7} {'med total':>10}")
    for n in sorted({r["N"] for r in skel}):
        rs = [r for r in skel if r["N"] == n]
        if len(rs) < 3:
            continue
        print(f"{n:>3} {len(rs):>4} {med([r['cer_min'] for r in rs]):>7.1f} "
              f"{med([r['work_min'] / r['N'] for r in rs]):>10.1f} "
              f"{med([r['work_min'] for r in rs]):>7.1f} "
              f"{med([r['elapsed'] for r in rs]):>10.1f}")
    if len(skel) > 2:
        ns = [r["N"] for r in skel]
        wb = [r["work_min"] / r["N"] for r in skel]
        print(f"  corr(N, w-bar) = {statistics.correlation(ns, wb):+.3f}"
              f"   median F = {med([r['cer_min'] for r in skel]):.1f} min"
              f"   median w-bar = {med(wb):.1f} min")
        print(f"  corr(N, F) = "
              f"{statistics.correlation(ns, [r['cer_min'] for r in skel]):+.3f}"
              "   (F should not depend on N; a strong value here is a warning)")


if __name__ == "__main__":
    main()
