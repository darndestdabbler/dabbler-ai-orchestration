"""Set 069 S5 - the measured replacement gate (benchmark + scoreboard).

Set 068's DEMOTE decision kept the routed per-session check GATED and kept the
**manual whole-set critique** as the backstop, explicitly saying RETIRE reopens
**on telemetry**, not on faith. Set 069 built an executable automated ceiling
(S2-S4) and a quality-gated ratchet (S5 ``floor_ratchet``, deleted as
unreachable in Set 119 S3). The open
question - *is the automated process good enough to drop the manual run's
cadence?* - is exactly the kind of design argument the proposal panel said should
"lose to scoreboards" (Sec.1.6). This module is that scoreboard.

It has two artifacts and one scoring function, deliberately separated so the
**verdict is derived, never hand-asserted** (the same discipline as the
orchestrator stamping REPRODUCED, not the agent):

1. **A pre-registered benchmark** (``benchmark-registration.json``): the defect
   set the automated surface is scored against, plus the pass thresholds -
   committed **before** scoring so the bar cannot be moved to fit the result. It
   mixes **seeded** defects (known classes) with **holdout** defects (recent real
   misses - e.g. the two Major bugs the 0.22.0 automated run missed), so the
   benchmark measures the actual gap that motivated this set, not a self-graded
   toy. It records ``minCasesForPower`` so a too-small n is reported as
   **underpowered**, not silently passed (proposal Sec.4 / the honesty standard).

2. **A scoreboard** (``replacement-scoreboard.json``): the **raw** per-case
   outcomes (detected / replayed / falsely-REPRODUCED) plus a count of spurious
   detections (the precision denominator's false positives) and a **telemetry
   record** of the gated verification surface (escaped-defect rate, intro-stage
   vs end-of-set timing, rework saved, false-positive churn,
   predicate-should-have-fired misses). It carries no verdict.

3. :func:`score_benchmark` reads the registration + the scoreboard and **derives**
   recall / precision / replay-success / false-``REPRODUCED`` rate, the
   ``meets_thresholds`` decision (which is **False whenever underpowered**), and a
   **cadence recommendation**. The manual run is **never retired**; the strongest
   recommendation the gate will make is to reduce it to a **periodic backstop**
   (the non-goal: the human is the current defense against the meta-oracle
   problem). "The manual run's cadence is decided by this scoreboard."

Everything here is pure-Python, dependency-free, ASCII-only on every error
string, and **never raises** on malformed input (L-066-1 parity with the two JSON
Schemas ``docs/benchmark-registration.schema.json`` and
``docs/replacement-scoreboard.schema.json``: optional fields are type-checked and
``int`` is guarded against ``bool``).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

# ---------------------------------------------------------------------------
# Artifact constants
# ---------------------------------------------------------------------------

BENCHMARK_REGISTRATION_FILENAME = "benchmark-registration.json"
REPLACEMENT_SCOREBOARD_FILENAME = "replacement-scoreboard.json"
REPLACEMENT_SCHEMA_VERSIONS = (1,)

CASE_SEEDED = "seeded"
CASE_HOLDOUT = "holdout"
CASE_KINDS = (CASE_SEEDED, CASE_HOLDOUT)

# The cadence recommendations. The manual run is NEVER fully retired (the
# non-goal: it is the current defense against the meta-oracle problem); the
# strongest the gate recommends is a periodic backstop.
CADENCE_MANUAL_MANDATORY = "manual-stays-mandatory"
CADENCE_MANUAL_BACKSTOP = "manual-reduce-to-periodic-backstop"

# The default n below which a benchmark is reported underpowered.
DEFAULT_MIN_CASES_FOR_POWER = 10

# Stable machine tokens.
REPLACEMENT_OK = "replacement-ok"
REPLACEMENT_NOT_AN_OBJECT = "replacement-not-an-object"
REPLACEMENT_BAD_SCHEMA_VERSION = "replacement-bad-schema-version"
REPLACEMENT_IDENTITY_MISMATCH = "replacement-identity-mismatch"
REPLACEMENT_BAD_STRUCTURE = "replacement-bad-structure"

# The closed top-level key sets (each schema's additionalProperties: false). The
# scoreboard set deliberately has NO verdict / meets / cadence key: the verdict
# is DERIVED by score_benchmark, never hand-asserted, so an extra top-level field
# is rejected (closing the C.1 "write a passing verdict directly" loophole).
_REGISTRATION_TOP_KEYS = {
    "schemaVersion", "name", "registeredAt", "minCasesForPower", "notes",
    "thresholds", "cases",
}
_SCOREBOARD_TOP_KEYS = {
    "schemaVersion", "benchmarkName", "scoredAt", "notes", "spuriousDetections",
    "outcomes", "telemetry",
}


def _is_nonempty_str(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_int_not_bool(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _is_unit_number(value: object) -> bool:
    """A number in [0, 1] (int or float, never bool) - a rate / threshold."""
    if isinstance(value, bool):
        return False
    return isinstance(value, (int, float)) and 0.0 <= float(value) <= 1.0


def _is_nonneg_number(value: object) -> bool:
    if isinstance(value, bool):
        return False
    return isinstance(value, (int, float)) and float(value) >= 0.0


# ---------------------------------------------------------------------------
# Pre-registered benchmark validation
# ---------------------------------------------------------------------------

_THRESHOLD_KEYS = ("recall", "precision", "replaySuccess", "maxFalseReproducedRate")


@dataclass(frozen=True)
class BenchmarkRegistrationResult:
    """Outcome of :func:`validate_benchmark_registration`."""

    ok: bool
    code: str
    reasons: Tuple[str, ...] = ()
    name: Optional[str] = None
    case_ids: Tuple[str, ...] = ()
    real_case_count: int = 0
    min_cases_for_power: int = DEFAULT_MIN_CASES_FOR_POWER


def _validate_case(case: object, index: int, seen: set) -> List[str]:
    reasons: List[str] = []
    where = f"cases[{index}]"
    if not isinstance(case, dict):
        return [f"{where} is not an object"]
    cid = case.get("id")
    if not _is_nonempty_str(cid):
        reasons.append(f"{where}.id is missing or empty")
    elif cid in seen:
        reasons.append(f"{where}.id {cid!r} is duplicated")
    else:
        seen.add(cid)
    kind = case.get("kind")
    if not _is_nonempty_str(kind):
        reasons.append(f"{where}.kind is missing or empty")
    elif kind not in CASE_KINDS:
        reasons.append(f"{where}.kind must be one of {list(CASE_KINDS)}")
    if not _is_nonempty_str(case.get("defectClass")):
        reasons.append(f"{where}.defectClass is missing or empty")
    if not _is_nonempty_str(case.get("description")):
        reasons.append(f"{where}.description is missing or empty")
    if "probeable" in case and not isinstance(case.get("probeable"), bool):
        reasons.append(f"{where}.probeable, when present, must be a boolean")
    if "sourceRef" in case and not isinstance(case.get("sourceRef"), str):
        reasons.append(f"{where}.sourceRef, when present, must be a string")
    return reasons


def validate_benchmark_registration(
    artifact: object, *, expected_name: Optional[str] = None
) -> BenchmarkRegistrationResult:
    """Validate a ``benchmark-registration.json`` pre-registration. Never raises."""
    if not isinstance(artifact, dict):
        return BenchmarkRegistrationResult(
            ok=False, code=REPLACEMENT_NOT_AN_OBJECT,
            reasons=("artifact is not an object",),
        )
    version = artifact.get("schemaVersion")
    if not _is_int_not_bool(version) or version not in REPLACEMENT_SCHEMA_VERSIONS:
        return BenchmarkRegistrationResult(
            ok=False, code=REPLACEMENT_BAD_SCHEMA_VERSION,
            reasons=(f"schemaVersion must be one of "
                     f"{list(REPLACEMENT_SCHEMA_VERSIONS)} (integer)",),
        )
    name = artifact.get("name")
    if not _is_nonempty_str(name):
        return BenchmarkRegistrationResult(
            ok=False, code=REPLACEMENT_BAD_STRUCTURE,
            reasons=("name is missing or empty",),
        )
    if expected_name is not None and name != expected_name:
        return BenchmarkRegistrationResult(
            ok=False, code=REPLACEMENT_IDENTITY_MISMATCH, name=name,
            reasons=(f"name {name!r} does not match the expected benchmark "
                     f"({expected_name!r})",),
        )

    reasons: List[str] = []

    extra = sorted(set(artifact) - _REGISTRATION_TOP_KEYS)
    if extra:
        reasons.append(f"unexpected top-level key(s): {extra}")
    if "notes" in artifact and not isinstance(artifact.get("notes"), str):
        reasons.append("notes, when present, must be a string")

    if not _is_nonempty_str(artifact.get("registeredAt")):
        reasons.append("registeredAt is missing or empty")

    min_power = artifact.get("minCasesForPower", DEFAULT_MIN_CASES_FOR_POWER)
    if not _is_int_not_bool(min_power) or min_power < 1:
        reasons.append("minCasesForPower, when present, must be a positive integer")
        min_power = DEFAULT_MIN_CASES_FOR_POWER

    thresholds = artifact.get("thresholds")
    if not isinstance(thresholds, dict):
        reasons.append("thresholds is missing or not an object")
    else:
        for key in _THRESHOLD_KEYS:
            if key not in thresholds:
                reasons.append(f"thresholds.{key} is missing")
            elif not _is_unit_number(thresholds.get(key)):
                reasons.append(f"thresholds.{key} must be a number in [0, 1]")

    cases = artifact.get("cases")
    case_ids: List[str] = []
    if not isinstance(cases, list) or not cases:
        reasons.append("cases must be a non-empty array")
    else:
        seen: set = set()
        for i, case in enumerate(cases):
            case_reasons = _validate_case(case, i, seen)
            reasons.extend(case_reasons)
            if isinstance(case, dict) and _is_nonempty_str(case.get("id")):
                case_ids.append(case["id"])
        # The benchmark must measure the actual gap: at least one holdout
        # (recent real miss), not only self-seeded toy defects.
        kinds = {c.get("kind") for c in cases if isinstance(c, dict)}
        if CASE_HOLDOUT not in kinds:
            reasons.append(
                "the benchmark must include at least one 'holdout' case (a recent "
                "real miss); a seeded-only benchmark cannot measure the real gap"
            )

    if reasons:
        return BenchmarkRegistrationResult(
            ok=False, code=REPLACEMENT_BAD_STRUCTURE, name=name,
            reasons=tuple(reasons),
        )
    return BenchmarkRegistrationResult(
        ok=True, code=REPLACEMENT_OK, name=name,
        case_ids=tuple(case_ids), real_case_count=len(case_ids),
        min_cases_for_power=min_power,
    )


# ---------------------------------------------------------------------------
# Scoreboard validation (raw outcomes + telemetry; no verdict)
# ---------------------------------------------------------------------------

_TELEMETRY_RATE_KEYS = ("escapedDefectRate", "falsePositiveChurn")
_TELEMETRY_COUNT_KEYS = ("predicateShouldHaveFiredMisses",)


@dataclass(frozen=True)
class ScoreboardResult:
    """Outcome of :func:`validate_scoreboard`."""

    ok: bool
    code: str
    reasons: Tuple[str, ...] = ()
    benchmark_name: Optional[str] = None


def _validate_outcome(outcome: object, index: int, seen: set) -> List[str]:
    reasons: List[str] = []
    where = f"outcomes[{index}]"
    if not isinstance(outcome, dict):
        return [f"{where} is not an object"]
    cid = outcome.get("caseId")
    if not _is_nonempty_str(cid):
        reasons.append(f"{where}.caseId is missing or empty")
    elif cid in seen:
        reasons.append(f"{where}.caseId {cid!r} is duplicated")
    else:
        seen.add(cid)
    for key in ("detected", "replayed", "falseReproduced"):
        if key not in outcome:
            reasons.append(f"{where}.{key} is missing")
        elif not isinstance(outcome.get(key), bool):
            reasons.append(f"{where}.{key} must be a boolean")
    return reasons


def _validate_telemetry(telemetry: object) -> List[str]:
    reasons: List[str] = []
    if not isinstance(telemetry, dict):
        return ["telemetry is missing or not an object"]
    if not _is_unit_number(telemetry.get("escapedDefectRate")):
        reasons.append("telemetry.escapedDefectRate must be a number in [0, 1]")
    if not _is_nonneg_number(telemetry.get("falsePositiveChurn")):
        reasons.append("telemetry.falsePositiveChurn must be a non-negative number")
    if not _is_int_not_bool(telemetry.get("predicateShouldHaveFiredMisses")):
        reasons.append("telemetry.predicateShouldHaveFiredMisses must be an integer")
    timing = telemetry.get("timing")
    if not isinstance(timing, dict):
        reasons.append("telemetry.timing is missing or not an object")
    else:
        for key in ("introStageCatches", "endOfSetCatches"):
            value = timing.get(key)
            if not _is_int_not_bool(value):
                reasons.append(f"telemetry.timing.{key} must be an integer")
            elif value < 0:
                reasons.append(f"telemetry.timing.{key} must be non-negative")
    if "reworkSaved" in telemetry and not _is_nonneg_number(telemetry.get("reworkSaved")):
        reasons.append("telemetry.reworkSaved, when present, must be a "
                       "non-negative number")
    return reasons


def validate_scoreboard(
    artifact: object, *, expected_name: Optional[str] = None
) -> ScoreboardResult:
    """Validate a ``replacement-scoreboard.json`` (raw outcomes + telemetry).

    The scoreboard carries no verdict - :func:`score_benchmark` derives it. Never
    raises.
    """
    if not isinstance(artifact, dict):
        return ScoreboardResult(
            ok=False, code=REPLACEMENT_NOT_AN_OBJECT,
            reasons=("artifact is not an object",),
        )
    version = artifact.get("schemaVersion")
    if not _is_int_not_bool(version) or version not in REPLACEMENT_SCHEMA_VERSIONS:
        return ScoreboardResult(
            ok=False, code=REPLACEMENT_BAD_SCHEMA_VERSION,
            reasons=(f"schemaVersion must be one of "
                     f"{list(REPLACEMENT_SCHEMA_VERSIONS)} (integer)",),
        )
    name = artifact.get("benchmarkName")
    if not _is_nonempty_str(name):
        return ScoreboardResult(
            ok=False, code=REPLACEMENT_BAD_STRUCTURE,
            reasons=("benchmarkName is missing or empty",),
        )
    if expected_name is not None and name != expected_name:
        return ScoreboardResult(
            ok=False, code=REPLACEMENT_IDENTITY_MISMATCH, benchmark_name=name,
            reasons=(f"benchmarkName {name!r} does not match the registered "
                     f"benchmark ({expected_name!r})",),
        )

    reasons: List[str] = []
    # Close the top-level object (additionalProperties: false). This is the C.1
    # load-bearing rule: a scoreboard may NOT carry a hand-written verdict /
    # meets_thresholds / cadence field - the verdict is derived, not asserted.
    extra = sorted(set(artifact) - _SCOREBOARD_TOP_KEYS)
    if extra:
        reasons.append(f"unexpected top-level key(s): {extra} (the scoreboard "
                       "carries only raw outcomes + telemetry; the verdict is "
                       "derived by score_benchmark, never hand-asserted)")
    if "notes" in artifact and not isinstance(artifact.get("notes"), str):
        reasons.append("notes, when present, must be a string")
    if not _is_nonempty_str(artifact.get("scoredAt")):
        reasons.append("scoredAt is missing or empty")

    outcomes = artifact.get("outcomes")
    if not isinstance(outcomes, list) or not outcomes:
        reasons.append("outcomes must be a non-empty array")
    else:
        seen: set = set()
        for i, outcome in enumerate(outcomes):
            reasons.extend(_validate_outcome(outcome, i, seen))

    spurious = artifact.get("spuriousDetections", 0)
    if not _is_int_not_bool(spurious) or spurious < 0:
        reasons.append("spuriousDetections, when present, must be a "
                       "non-negative integer")

    reasons.extend(_validate_telemetry(artifact.get("telemetry")))

    if reasons:
        return ScoreboardResult(
            ok=False, code=REPLACEMENT_BAD_STRUCTURE, benchmark_name=name,
            reasons=tuple(reasons),
        )
    return ScoreboardResult(ok=True, code=REPLACEMENT_OK, benchmark_name=name)


# ---------------------------------------------------------------------------
# Scoring (the DERIVED verdict)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ScoreResult:
    """The derived score of the automated surface against the benchmark.

    Metrics are ``None`` when their denominator is zero (e.g. replay-success with
    no detections) - reported honestly, never coerced to 0 or 1. ``underpowered``
    is True when the real-case count is below the registration's
    ``minCasesForPower``; an underpowered benchmark **cannot** meet thresholds
    (the honesty rule). ``cadence_recommendation`` is one of the ``CADENCE_*``
    tokens; the manual run is never fully retired.
    """

    ok: bool
    recall: Optional[float]
    precision: Optional[float]
    replay_success: Optional[float]
    false_reproduced_rate: Optional[float]
    real_cases: int
    detected: int
    spurious_detections: int
    underpowered: bool
    meets_thresholds: bool
    cadence_recommendation: str
    reasons: Tuple[str, ...] = ()


def _ratio(numerator: int, denominator: int) -> Optional[float]:
    if denominator <= 0:
        return None
    return numerator / denominator


def score_benchmark(
    registration: object, scoreboard: object
) -> ScoreResult:
    """Derive the score + cadence recommendation. Never raises.

    Validates both artifacts and confirms the scoreboard's ``benchmarkName``
    matches the registration ``name`` and that every scored ``caseId`` is a
    registered case (no scoring against cases the pre-registration did not commit
    to). Then computes:

    - **recall** = detected real cases / total real cases;
    - **precision** = detected / (detected + spuriousDetections);
    - **replay-success** = replayed / detected;
    - **false-REPRODUCED rate** = falsely-REPRODUCED / detected;

    ``meets_thresholds`` is True only when every threshold is satisfied AND the
    benchmark is **not underpowered**. The cadence recommendation is
    :data:`CADENCE_MANUAL_BACKSTOP` only when thresholds are met; otherwise
    :data:`CADENCE_MANUAL_MANDATORY` (the manual run is not relaxed on faith).
    """
    reg = validate_benchmark_registration(registration)
    if not reg.ok:
        return _failed_score(
            f"benchmark registration is invalid ({reg.code}): "
            f"{'; '.join(reg.reasons)}"
        )
    sb = validate_scoreboard(scoreboard, expected_name=reg.name)
    if not sb.ok:
        return _failed_score(
            f"scoreboard is invalid ({sb.code}): {'; '.join(sb.reasons)}"
        )

    registered_ids = set(reg.case_ids)
    outcomes = scoreboard.get("outcomes", [])
    reasons: List[str] = []

    detected = 0
    replayed = 0
    false_reproduced = 0
    scored_ids: set = set()
    for outcome in outcomes:
        cid = outcome.get("caseId")
        scored_ids.add(cid)
        if cid not in registered_ids:
            reasons.append(
                f"scoreboard outcome caseId {cid!r} is not a registered case; the "
                "surface may only be scored against the pre-registered benchmark"
            )
            continue
        if outcome.get("detected") is True:
            detected += 1
            if outcome.get("replayed") is True:
                replayed += 1
            if outcome.get("falseReproduced") is True:
                false_reproduced += 1

    if reasons:
        return _failed_score("; ".join(reasons))

    thresholds: Dict[str, float] = registration.get("thresholds", {})
    spurious = scoreboard.get("spuriousDetections", 0) or 0

    recall = _ratio(detected, reg.real_case_count)
    precision = _ratio(detected, detected + spurious)
    replay_success = _ratio(replayed, detected)
    false_reproduced_rate = _ratio(false_reproduced, detected)

    underpowered = reg.real_case_count < reg.min_cases_for_power

    def _meets(metric: Optional[float], bar: object, at_least: bool) -> bool:
        if metric is None or not isinstance(bar, (int, float)):
            return False
        return metric >= bar if at_least else metric <= bar

    meets = (
        not underpowered
        and _meets(recall, thresholds.get("recall"), True)
        and _meets(precision, thresholds.get("precision"), True)
        and _meets(replay_success, thresholds.get("replaySuccess"), True)
        and _meets(false_reproduced_rate,
                   thresholds.get("maxFalseReproducedRate"), False)
    )

    if underpowered:
        reasons.append(
            f"benchmark is underpowered: {reg.real_case_count} real cases < "
            f"minCasesForPower {reg.min_cases_for_power}; the manual run stays "
            "mandatory until n is adequate"
        )

    cadence = CADENCE_MANUAL_BACKSTOP if meets else CADENCE_MANUAL_MANDATORY
    return ScoreResult(
        ok=True,
        recall=recall,
        precision=precision,
        replay_success=replay_success,
        false_reproduced_rate=false_reproduced_rate,
        real_cases=reg.real_case_count,
        detected=detected,
        spurious_detections=spurious,
        underpowered=underpowered,
        meets_thresholds=meets,
        cadence_recommendation=cadence,
        reasons=tuple(reasons),
    )


def _failed_score(reason: str) -> ScoreResult:
    return ScoreResult(
        ok=False,
        recall=None,
        precision=None,
        replay_success=None,
        false_reproduced_rate=None,
        real_cases=0,
        detected=0,
        spurious_detections=0,
        underpowered=True,
        meets_thresholds=False,
        cadence_recommendation=CADENCE_MANUAL_MANDATORY,
        reasons=(reason,),
    )


# ---------------------------------------------------------------------------
# File helpers
# ---------------------------------------------------------------------------


def find_benchmark_registration(session_set_dir: Union[str, Path]) -> Optional[Path]:
    path = Path(session_set_dir) / BENCHMARK_REGISTRATION_FILENAME
    return path if path.is_file() else None


def find_replacement_scoreboard(session_set_dir: Union[str, Path]) -> Optional[Path]:
    path = Path(session_set_dir) / REPLACEMENT_SCOREBOARD_FILENAME
    return path if path.is_file() else None


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _fmt(metric: Optional[float]) -> str:
    return "n/a" if metric is None else f"{metric:.3f}"


def main(argv=None) -> int:
    """CLI entry point. Returns an exit code; never calls ``sys.exit``.

    ``score`` loads the registration + scoreboard from the session-set root,
    derives the metrics, and prints the cadence recommendation (ASCII-only). A
    not-met / underpowered result is a *verdict*, not an error (exit 0); only an
    invalid artifact pair returns non-zero.
    """
    import argparse
    import json

    parser = argparse.ArgumentParser(
        prog="python -m ai_router.replacement_gate",
        description=(
            "Measured replacement gate (Set 069 S5): score the automated "
            "verification surface against a pre-registered benchmark."
        ),
    )
    parser.add_argument("--session-set-dir", required=True)
    args = parser.parse_args(argv)

    reg_path = find_benchmark_registration(args.session_set_dir)
    sb_path = find_replacement_scoreboard(args.session_set_dir)
    if reg_path is None or sb_path is None:
        missing = []
        if reg_path is None:
            missing.append(BENCHMARK_REGISTRATION_FILENAME)
        if sb_path is None:
            missing.append(REPLACEMENT_SCOREBOARD_FILENAME)
        print(f"[ ] missing artifact(s): {', '.join(missing)}")
        return 0
    try:
        registration = json.loads(reg_path.read_text(encoding="utf-8"))
        scoreboard = json.loads(sb_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        print(f"[ ] artifact unreadable: {exc}")
        return 2

    score = score_benchmark(registration, scoreboard)
    if not score.ok:
        print("[ ] could not score:")
        for r in score.reasons:
            print(f"    - {r}")
        return 1

    mark = "x" if score.meets_thresholds else " "
    print(f"[{mark}] recall={_fmt(score.recall)} precision={_fmt(score.precision)} "
          f"replay={_fmt(score.replay_success)} "
          f"falseREPRODUCED={_fmt(score.false_reproduced_rate)}")
    print(f"    real_cases={score.real_cases} detected={score.detected} "
          f"underpowered={score.underpowered}")
    print(f"    cadence: {score.cadence_recommendation}")
    for r in score.reasons:
        print(f"    note: {r}")
    return 0


__all__ = [
    "BENCHMARK_REGISTRATION_FILENAME",
    "REPLACEMENT_SCOREBOARD_FILENAME",
    "REPLACEMENT_SCHEMA_VERSIONS",
    "CASE_SEEDED",
    "CASE_HOLDOUT",
    "CASE_KINDS",
    "CADENCE_MANUAL_MANDATORY",
    "CADENCE_MANUAL_BACKSTOP",
    "DEFAULT_MIN_CASES_FOR_POWER",
    "BenchmarkRegistrationResult",
    "ScoreboardResult",
    "ScoreResult",
    "validate_benchmark_registration",
    "validate_scoreboard",
    "score_benchmark",
    "find_benchmark_registration",
    "find_replacement_scoreboard",
    "main",
]


if __name__ == "__main__":  # pragma: no cover - CLI entry
    import sys

    raise SystemExit(main(sys.argv[1:]))
