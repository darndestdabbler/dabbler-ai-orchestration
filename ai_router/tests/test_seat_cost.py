"""Falsifiers for :mod:`ai_router.seat_cost`.

Every test here **plants** the condition into a real SQLite store and
drives the public entrypoint, rather than reasoning about the code
(L-112-1). That matters more than usual for this module: every one of its
failure modes returns a *plausible number*, not an exception, so reading
the source is indistinguishable from reading a correct implementation.

The two halves are deliberate:

FIRES
    A condition that must NOT produce a number. Each asserts the specific
    named status, not merely "not measured" -- a reader that collapsed
    every failure into one status would pass a weaker assertion while
    losing the distinction that keeps ``unavailable`` from being read as
    ``not_applicable``.
DOES NOT FIRE
    A legitimate look-alike that must still measure cleanly, so the
    fail-closed paths cannot be satisfied by refusing everything.
"""

import os
import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ai_router import seat_cost  # noqa: E402


# --------------------------------------------------------------------------
# Planting helpers -- a real store, built the way the real one is
# --------------------------------------------------------------------------


def _plant_store(
    path: Path,
    rows,
    *,
    schema_version: int = 6,
    usage_columns=("session_id", "turn_index", "model", "total_nano_aiu"),
    sessions_only=(),
    wal: bool = False,
):
    """Create a store at ``path`` and return it.

    ``rows`` is a sequence of ``(session_id, nano)`` pairs.
    ``sessions_only`` names conversations that exist with no usage rows --
    a genuine zero, which must not read as ``unknown``.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    if wal:
        conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("CREATE TABLE schema_version (version INTEGER)")
    conn.execute("INSERT INTO schema_version (version) VALUES (?)", (schema_version,))
    cols = ", ".join(f"{c} {'TEXT' if c in ('session_id', 'model') else 'INTEGER'}"
                     for c in usage_columns)
    conn.execute(f"CREATE TABLE assistant_usage_events (id INTEGER PRIMARY KEY, {cols})")
    conn.execute("CREATE TABLE sessions (id TEXT, summary TEXT)")
    for session_id, nano in rows:
        values = []
        for c in usage_columns:
            if c == "session_id":
                values.append(session_id)
            elif c == "total_nano_aiu":
                values.append(nano)
            elif c == "model":
                values.append("claude-opus-5")
            else:
                values.append(0)
        marks = ",".join("?" for _ in usage_columns)
        conn.execute(
            f"INSERT INTO assistant_usage_events ({', '.join(usage_columns)}) "
            f"VALUES ({marks})",
            tuple(values),
        )
    for session_id, _ in rows:
        conn.execute(
            "INSERT OR IGNORE INTO sessions (id, summary) VALUES (?, ?)",
            (session_id, "planted"),
        )
    for session_id in sessions_only:
        conn.execute(
            "INSERT INTO sessions (id, summary) VALUES (?, ?)",
            (session_id, "planted, no usage"),
        )
    conn.commit()
    conn.close()
    return path


ORCH = seat_cost.COMPONENT_ORCHESTRATOR_SEAT
ROUTED = seat_cost.COMPONENT_ROUTED_SEAT
API = seat_cost.COMPONENT_ROUTED_API


# ==========================================================================
# FIRES -- conditions that must never produce a number
# ==========================================================================


def test_absent_store_is_unavailable_not_zero(tmp_path):
    """No store file at all. The classic fail-open shape returns 0.0 here."""
    report = seat_cost.measure(
        {ORCH: ["abc"]}, store_path=str(tmp_path / "nope.db")
    )
    component = report.get(ORCH)
    assert component.status == seat_cost.STATUS_UNAVAILABLE
    assert component.credits is None, "an unreachable store must not price as 0.0"
    assert report.total_credits is None
    assert report.total_status == seat_cost.STATUS_UNKNOWN


def test_bumped_schema_version_is_refused(tmp_path):
    """The store is present and readable -- and no longer what we verified."""
    store = _plant_store(tmp_path / "s.db", [("abc", 5_000_000_000)], schema_version=7)
    report = seat_cost.measure({ORCH: ["abc"]}, store_path=str(store))
    component = report.get(ORCH)
    assert component.status == seat_cost.STATUS_SCHEMA_UNRECOGNIZED
    assert component.credits is None
    assert "schema_version 7" in (component.reason or "")


def test_renamed_usage_column_is_refused(tmp_path):
    """The unit column is gone. Pricing anyway would multiply by a guess."""
    store = _plant_store(
        tmp_path / "s.db", [("abc", 5_000_000_000)],
        usage_columns=("session_id", "turn_index", "model", "total_nano_credits"),
    )
    report = seat_cost.measure({ORCH: ["abc"]}, store_path=str(store))
    component = report.get(ORCH)
    assert component.status == seat_cost.STATUS_SCHEMA_UNRECOGNIZED
    assert component.credits is None
    assert "total_nano_aiu" in (component.reason or "")


def test_empty_id_set_is_unknown_not_zero(tmp_path):
    """Nothing to measure is not a measurement of nothing."""
    store = _plant_store(tmp_path / "s.db", [("abc", 5_000_000_000)])
    report = seat_cost.measure({ORCH: ["abc"], ROUTED: []}, store_path=str(store))
    routed = report.get(ROUTED)
    assert routed.status == seat_cost.STATUS_UNKNOWN
    assert routed.credits is None, "an empty component must not price as 0.0"
    assert report.total_credits is None, (
        "one unknown component must block the total; summing around it "
        "reports unmeasured spend as zero"
    )


def test_unknown_session_id_is_unknown_not_zero(tmp_path):
    """An id the store has never heard of. Absent is not zero."""
    store = _plant_store(tmp_path / "s.db", [("abc", 5_000_000_000)])
    report = seat_cost.measure({ORCH: ["never-seen"]}, store_path=str(store))
    component = report.get(ORCH)
    assert component.status == seat_cost.STATUS_UNKNOWN
    assert component.credits is None
    assert component.unmeasured_session_ids == ("never-seen",)


def test_partially_known_ids_are_a_lower_bound_not_a_total(tmp_path):
    """Half the conversations found. The number is real and incomplete."""
    store = _plant_store(tmp_path / "s.db", [("abc", 5_000_000_000)])
    report = seat_cost.measure({ORCH: ["abc", "missing"]}, store_path=str(store))
    component = report.get(ORCH)
    assert component.status == seat_cost.STATUS_LOWER_BOUND
    assert component.credits == pytest.approx(5.0)
    assert component.unmeasured_session_ids == ("missing",)
    assert report.is_complete is False
    assert report.total_status == seat_cost.STATUS_LOWER_BOUND


def test_live_session_is_a_lower_bound(tmp_path):
    """A session cannot measure its own closing turns (Set 118: 10% short)."""
    store = _plant_store(tmp_path / "s.db", [("abc", 5_000_000_000)])
    report = seat_cost.measure(
        {ORCH: ["abc"]}, store_path=str(store), live_session_ids=["abc"],
    )
    component = report.get(ORCH)
    assert component.status == seat_cost.STATUS_LOWER_BOUND
    assert component.credits == pytest.approx(5.0)
    assert "in flight" in (component.reason or "")


def test_engine_without_a_store_is_unavailable_not_not_applicable(tmp_path):
    """Claude Code's seat cost is real and unseen -- never a legitimate zero.

    This is the single most consequential distinction in the module: the
    wrong status here reports another engine's spend as $0.00.
    """
    store = _plant_store(tmp_path / "s.db", [("abc", 5_000_000_000)])
    report = seat_cost.measure(
        {ORCH: ["abc"]}, store_path=str(store), engine="claude",
    )
    component = report.get(ORCH)
    assert component.status == seat_cost.STATUS_UNAVAILABLE
    assert component.status != seat_cost.STATUS_NOT_APPLICABLE
    assert component.credits is None
    assert report.total_credits is None


def test_wal_rows_are_counted_and_immutable_would_undercount(tmp_path):
    """The bug no code review finds: ``immutable=1`` silently skips the WAL.

    Measured live on 2026-08-14 against the real store: ``mode=ro`` saw
    17,036 events / 168.0 credits where ``mode=ro&immutable=1`` saw 17,035
    / 156.5 -- a 7% undercount with no error. Planted here by holding a
    connection open with uncheckpointed rows in the WAL.
    """
    store = _plant_store(tmp_path / "s.db", [("abc", 5_000_000_000)], wal=True)

    writer = sqlite3.connect(str(store))
    writer.execute("PRAGMA journal_mode=WAL")
    writer.execute("PRAGMA wal_autocheckpoint=0")
    writer.execute(
        "INSERT INTO assistant_usage_events (session_id, turn_index, model, "
        "total_nano_aiu) VALUES (?, ?, ?, ?)",
        ("abc", 1, "claude-opus-5", 3_000_000_000),
    )
    writer.commit()
    try:
        assert (tmp_path / "s.db-wal").exists(), "the plant needs a live WAL"

        report = seat_cost.measure({ORCH: ["abc"]}, store_path=str(store))
        assert report.get(ORCH).credits == pytest.approx(8.0), (
            "the reader must see uncheckpointed WAL rows; 5.0 here means it "
            "opened the store immutable and silently undercounted"
        )

        # The structural half: prove the rejected mode really does undercount,
        # so this test fails if someone "optimizes" the connection string.
        immutable = sqlite3.connect(
            f"file:{Path(store).as_posix()}?mode=ro&immutable=1", uri=True
        )
        undercount = immutable.execute(
            "SELECT COALESCE(SUM(total_nano_aiu), 0) FROM assistant_usage_events"
        ).fetchone()[0]
        immutable.close()
        assert undercount < 8_000_000_000, (
            "immutable=1 is expected to miss the WAL; if it no longer does, "
            "this falsifier has stopped proving anything"
        )
    finally:
        writer.close()


def test_connection_string_never_uses_immutable():
    """Structural guard beside the behavioural one -- it holds however spelled."""
    assert "immutable" not in seat_cost._READ_URI_TEMPLATE
    source = Path(seat_cost.__file__).read_text(encoding="utf-8")
    code = "\n".join(
        line for line in source.splitlines()
        if not line.lstrip().startswith("#")
    )
    assert "immutable=1" not in code.split('"""')[-1], (
        "immutable=1 must not appear in executable code"
    )


# ==========================================================================
# DOES NOT FIRE -- legitimate look-alikes that must still measure
# ==========================================================================


def test_known_id_summing_to_zero_is_a_real_zero(tmp_path):
    """A conversation that made no billed calls is 0.0 with full confidence.

    The mirror of the unknown-id test: if the reader could not tell these
    apart it would be fail-closed to the point of uselessness.
    """
    store = _plant_store(tmp_path / "s.db", [("abc", 5_000_000_000)],
                         sessions_only=["quiet"])
    report = seat_cost.measure({ORCH: ["quiet"]}, store_path=str(store))
    component = report.get(ORCH)
    assert component.status == seat_cost.STATUS_MEASURED
    assert component.credits == pytest.approx(0.0)
    assert component.unmeasured_session_ids == ()


def test_declared_not_applicable_contributes_an_honest_zero(tmp_path):
    """A Copilot seat dispatches no Direct-API calls; that component is empty."""
    store = _plant_store(tmp_path / "s.db", [("abc", 5_000_000_000)])
    report = seat_cost.measure(
        {ORCH: ["abc"], ROUTED: ["abc"]},
        store_path=str(store), not_applicable=[API],
    )
    api = report.get(API)
    assert api.status == seat_cost.STATUS_NOT_APPLICABLE
    assert api.credits == pytest.approx(0.0)
    assert report.is_complete is True
    assert report.total_credits == pytest.approx(10.0)


def test_components_stay_separated(tmp_path):
    """The whole point: seat cost and routed cost are never merged.

    Same store, different conversations, one report -- and the routed
    component must not absorb the orchestrator's spend or vice versa.
    """
    store = _plant_store(
        tmp_path / "s.db",
        [("orch", 4_000_000_000), ("child-a", 1_000_000_000),
         ("child-b", 500_000_000)],
    )
    report = seat_cost.measure(
        {ORCH: ["orch"], ROUTED: ["child-a", "child-b"]},
        store_path=str(store), not_applicable=[API],
    )
    assert report.get(ORCH).credits == pytest.approx(4.0)
    assert report.get(ROUTED).credits == pytest.approx(1.5)
    assert report.total_credits == pytest.approx(5.5)
    rendered = seat_cost.format_report(report)
    assert "orchestrator seat" in rendered
    assert "routed calls" in rendered


def test_totals_agree_with_an_independent_walk(tmp_path):
    """Structural: the reader's total equals a straight sum of the same rows."""
    rows = [("orch", 4_100_000_000), ("orch", 900_000_000),
            ("child", 2_500_000_000)]
    store = _plant_store(tmp_path / "s.db", rows)
    report = seat_cost.measure(
        {ORCH: ["orch"], ROUTED: ["child"]},
        store_path=str(store), not_applicable=[API],
    )
    expected = sum(nano for _, nano in rows) / seat_cost.NANO_AIU_PER_CREDIT
    assert report.total_credits == pytest.approx(expected)
    assert report.total_usd == pytest.approx(expected / seat_cost.CREDITS_PER_USD)


def test_public_component_identifiers_are_the_documented_ones():
    """Remediation of the Round 1 Major: one vocabulary, pinned to its doc.

    The verifier found ``spec.md`` naming ``routed_call_cost`` /
    ``routed_seat_cost`` / ``orchestrator_seat_cost`` while the module
    emitted ``routed_api`` / ``routed_seat`` / ``orchestrator_seat``. The
    short names won (they sit under a ``cost`` parent in Session 3's
    ``disposition.cost``, where the suffix would stutter), and the drift is
    now mechanical to catch instead of a judgment call: these are the
    values ``CostReport.to_dict()`` emits, so a rename that misses the doc
    fails here.
    """
    assert seat_cost.COMPONENTS == (
        "orchestrator_seat", "routed_seat", "routed_api",
    )
    assert seat_cost.COMPONENT_ORCHESTRATOR_SEAT == "orchestrator_seat"
    assert seat_cost.COMPONENT_ROUTED_SEAT == "routed_seat"
    assert seat_cost.COMPONENT_ROUTED_API == "routed_api"
    assert set(seat_cost.COMPONENT_LABELS) == set(seat_cost.COMPONENTS)

    doc = (
        Path(seat_cost.__file__).parent / "docs" / "seat-cost.md"
    ).read_text(encoding="utf-8")
    assert doc.strip(), "the canonical doc must be non-empty to pin anything"
    for name in seat_cost.COMPONENTS:
        assert f"`{name}`" in doc, (
            f"public identifier {name!r} is not named in seat-cost.md; the "
            "vocabulary and its documentation have drifted apart"
        )
    for retired in ("routed_call_cost", "routed_seat_cost", "orchestrator_seat_cost"):
        assert retired not in doc, (
            f"{retired!r} was the rejected spelling; it must not reappear"
        )


def test_to_dict_emits_the_public_identifiers(tmp_path):
    """The identifiers are a wire contract, so assert them on the wire."""
    store = _plant_store(tmp_path / "s.db", [("orch", 1_000_000_000)])
    report = seat_cost.measure(
        {ORCH: ["orch"], ROUTED: []}, store_path=str(store), not_applicable=[API],
    )
    emitted = [c["component"] for c in report.to_dict()["components"]]
    assert emitted == list(seat_cost.COMPONENTS)


def test_credits_to_usd_conversion_is_defined_once():
    """One constant, one direction. A second copy is how units drift."""
    assert seat_cost.CREDITS_PER_USD == 100.0
    assert seat_cost.NANO_AIU_PER_CREDIT == 1_000_000_000
    component = seat_cost.ComponentCost(
        component=ORCH, status=seat_cost.STATUS_MEASURED, credits=4266.6,
    )
    assert component.usd == pytest.approx(42.666)


def test_copilot_engine_is_gated_in(tmp_path):
    """The gate admits the engine that has a store, under both spellings."""
    assert seat_cost.engine_has_usage_store("github-copilot") is True
    assert seat_cost.engine_has_usage_store("copilot") is True
    assert seat_cost.engine_has_usage_store("GitHub-Copilot") is True
    assert seat_cost.engine_has_usage_store("claude") is False
    assert seat_cost.engine_has_usage_store(None) is False

    store = _plant_store(tmp_path / "s.db", [("abc", 5_000_000_000)])
    report = seat_cost.measure(
        {ORCH: ["abc"]}, store_path=str(store), engine="github-copilot",
    )
    assert report.get(ORCH).status == seat_cost.STATUS_MEASURED


def test_seat_session_id_read_from_environment():
    """The join key Session 2 will record; here only read."""
    assert seat_cost.seat_session_id_from_env({}) is None
    assert seat_cost.seat_session_id_from_env(
        {seat_cost.SEAT_SESSION_ID_ENV: "   "}
    ) is None
    assert seat_cost.seat_session_id_from_env(
        {seat_cost.SEAT_SESSION_ID_ENV: "abc-123"}
    ) == "abc-123"


def test_unmeasured_components_are_named_in_the_render(tmp_path):
    """The rule: a report must NAME what it could not measure."""
    store = _plant_store(tmp_path / "s.db", [("abc", 5_000_000_000)])
    report = seat_cost.measure(
        {ORCH: ["abc"], ROUTED: []}, store_path=str(store),
    )
    rendered = seat_cost.format_report(report)
    assert "TOTAL: not available" in rendered
    assert "routed calls (Copilot CLI transport)" in rendered
    assert "$0.00" not in rendered.split("TOTAL")[1], (
        "the unmeasured component must not be rendered as a dollar zero"
    )


def test_resolve_store_path_prefers_explicit_then_home(tmp_path):
    """Absent files resolve to None, so callers branch on presence."""
    assert seat_cost.resolve_store_path(str(tmp_path / "nope.db")) is None
    planted = _plant_store(tmp_path / "explicit.db", [("abc", 1)])
    assert seat_cost.resolve_store_path(str(planted)) == planted

    home = tmp_path / "home"
    assert seat_cost.resolve_store_path(home=str(home)) is None
    default = home / seat_cost.DEFAULT_STORE_RELPATH
    _plant_store(default, [("abc", 1)])
    assert seat_cost.resolve_store_path(home=str(home)) == default


def test_duplicate_ids_are_not_double_counted(tmp_path):
    """The same conversation named twice is one conversation."""
    store = _plant_store(tmp_path / "s.db", [("abc", 5_000_000_000)])
    report = seat_cost.measure({ORCH: ["abc", "abc"]}, store_path=str(store))
    assert report.get(ORCH).credits == pytest.approx(5.0)
    assert report.get(ORCH).session_ids == ("abc",)


def test_cli_runs_and_reports_separated_components(tmp_path, capsys):
    """The operator-facing surface, driven end to end."""
    store = _plant_store(
        tmp_path / "s.db", [("orch", 42_000_000_000), ("child", 8_000_000_000)]
    )
    code = seat_cost.main([
        "--orchestrator", "orch", "--routed", "child",
        "--no-api-calls", "--store-path", str(store),
    ])
    out = capsys.readouterr().out
    assert code == 0
    assert "orchestrator seat" in out
    assert "routed calls (Copilot CLI transport)" in out
    assert "42.0" in out and "8.0" in out
    assert "50.0 credits = $0.50" in out


def test_cli_output_is_ascii_only(tmp_path, capsys):
    """project-guidance Code Style: cp1252 must be able to encode it."""
    store = _plant_store(tmp_path / "s.db", [("orch", 4_000_000_000)])
    seat_cost.main([
        "--orchestrator", "orch", "--store-path", str(store), "--no-api-calls",
    ])
    out = capsys.readouterr().out
    out.encode("cp1252")
    assert out == out.encode("ascii", "strict").decode("ascii")


# ==========================================================================
# Set 130 Session 3 -- the join: ids the repo recorded, priced by the reader
#
# Sessions 1 and 2 built the two halves; this is the seam between them, and
# a seam is where a plausible wrong number gets in. Every test below plants
# BOTH artifacts a real run writes -- a session-state.json and a
# router-metrics.jsonl -- and drives the public entrypoint against them.
# ==========================================================================


def _plant_state(session_set_dir: Path, sessions):
    """Write a v4 session-state.json. ``sessions`` is (number, status, ids)."""
    import json

    session_set_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "schemaVersion": 4,
        "sessionSetName": session_set_dir.name,
        "status": "in-progress",
        "sessions": [],
    }
    for number, status, ids in sessions:
        orchestrator = {"engine": "github-copilot", "model": "claude-opus-5"}
        if ids is not None:
            orchestrator["seatSessionIds"] = list(ids)
        payload["sessions"].append(
            {"number": number, "status": status, "orchestrator": orchestrator}
        )
    (session_set_dir / "session-state.json").write_text(
        json.dumps(payload, indent=2), encoding="utf-8"
    )
    return session_set_dir


def _plant_metrics(path: Path, rows):
    """Write a router-metrics.jsonl. ``rows`` is (session_number, id)."""
    import json

    lines = []
    for number, transport_session_id in rows:
        lines.append(json.dumps({
            "session_set": path.parent.name,
            "session_number": number,
            "call_type": "route",
            "transport": "copilot-cli",
            "billed_usage_unavailable": True,
            "cost_usd": 0.0,
            "transport_session_id": transport_session_id,
        }))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def test_measure_session_joins_recorded_ids_from_both_writers(tmp_path, monkeypatch):
    """The whole chain: start_session's ids + record_call's ids -> one report."""
    store = _plant_store(tmp_path / "s.db", [
        ("orch-a", 40_000_000_000),
        ("orch-b", 2_000_000_000),
        ("child-1", 8_000_000_000),
    ])
    set_dir = _plant_state(
        tmp_path / "130-set",
        [(1, "complete", ["earlier"]), (2, "in-progress", ["orch-a", "orch-b"])],
    )
    metrics_path = _plant_metrics(
        set_dir / "router-metrics.jsonl",
        [(2, "child-1"), (2, None), (1, "not-this-session")],
    )
    monkeypatch.setenv("AI_ROUTER_METRICS_PATH", str(metrics_path))
    monkeypatch.delenv(seat_cost.SEAT_SESSION_ID_ENV, raising=False)

    report = seat_cost.measure_session(
        str(set_dir), 2, live=False, store_path=str(store)
    )

    orch = report.get(ORCH)
    assert orch.session_ids == ("orch-a", "orch-b"), (
        "session 1's conversation must not be billed to session 2"
    )
    assert orch.credits == pytest.approx(42.0)
    assert orch.status == seat_cost.STATUS_MEASURED
    routed = report.get(ROUTED)
    assert routed.session_ids == ("child-1",), "a null id is not a conversation"
    assert routed.credits == pytest.approx(8.0)
    assert routed.status == seat_cost.STATUS_LOWER_BOUND, (
        "the log records 2 routed calls for this session and only 1 carries "
        "an id, so the priced figure is a floor -- measure() cannot know "
        "that, because it only ever sees the ids it was handed"
    )
    assert "2 routed call(s)" in (routed.reason or "")
    assert report.get(API).status == seat_cost.STATUS_NOT_APPLICABLE
    assert report.total_credits == pytest.approx(50.0)
    assert report.total_status == seat_cost.STATUS_LOWER_BOUND


def test_a_session_measuring_itself_reports_a_floor_and_counts_itself(
    tmp_path, monkeypatch
):
    """T5. Live means in-flight, and the closing conversation is included even
    when a context reset started it without a re-register."""
    store = _plant_store(tmp_path / "s.db", [
        ("orch-a", 40_000_000_000),
        ("mid-reset", 5_000_000_000),
        ("child-1", 1_000_000_000),
    ])
    set_dir = _plant_state(tmp_path / "130-set", [(1, "in-progress", ["orch-a"])])
    metrics_path = _plant_metrics(set_dir / "router-metrics.jsonl", [(1, "child-1")])
    monkeypatch.setenv("AI_ROUTER_METRICS_PATH", str(metrics_path))
    monkeypatch.setenv(seat_cost.SEAT_SESSION_ID_ENV, "mid-reset")

    report = seat_cost.measure_session(
        str(set_dir), 1, live=True, store_path=str(store)
    )
    orch = report.get(ORCH)
    assert orch.status == seat_cost.STATUS_LOWER_BOUND, (
        "a session cannot claim an exact figure about itself"
    )
    assert set(orch.session_ids) == {"orch-a", "mid-reset"}
    assert orch.credits == pytest.approx(45.0)
    assert report.total_status == seat_cost.STATUS_LOWER_BOUND
    assert report.total_credits == pytest.approx(46.0)


def test_a_session_that_recorded_no_ids_is_unknown_not_zero(tmp_path, monkeypatch):
    """The Direct-API shape: no seatSessionIds key at all."""
    store = _plant_store(tmp_path / "s.db", [("someone-else", 9_000_000_000)])
    set_dir = _plant_state(tmp_path / "130-set", [(1, "in-progress", None)])
    metrics_path = _plant_metrics(set_dir / "router-metrics.jsonl", [])
    monkeypatch.setenv("AI_ROUTER_METRICS_PATH", str(metrics_path))
    monkeypatch.delenv(seat_cost.SEAT_SESSION_ID_ENV, raising=False)

    report = seat_cost.measure_session(
        str(set_dir), 1, live=False, store_path=str(store)
    )
    assert report.get(ORCH).status == seat_cost.STATUS_UNKNOWN
    assert report.get(ORCH).credits is None
    assert report.total_credits is None


def test_cost_block_drops_the_machine_path_and_labels_the_reading(tmp_path):
    """The block is committed, so it carries no operator's absolute path --
    and it carries the one label the arithmetic cannot: when it was read."""
    store = _plant_store(tmp_path / "s.db", [("orch", 10_000_000_000)])
    report = seat_cost.measure(
        {ORCH: ["orch"]}, store_path=str(store), not_applicable=[API]
    )
    block = report.to_cost_block(seat_cost.MEASURED_AT_RETROSPECTIVE)

    assert "store_path" not in block
    assert str(tmp_path) not in repr(block)
    assert block["store_schema_version"] == 6
    assert block["measured_at"] == seat_cost.MEASURED_AT_RETROSPECTIVE
    with pytest.raises(ValueError):
        report.to_cost_block("sometime")


def test_format_cost_block_never_renders_an_unknown_as_a_dollar_zero(tmp_path):
    """The recorded artifact renders the same way wherever it is read."""
    store = _plant_store(tmp_path / "s.db", [("orch", 10_000_000_000)])
    report = seat_cost.measure(
        {ORCH: ["orch"], ROUTED: []}, store_path=str(store), not_applicable=[API]
    )
    lines = seat_cost.format_cost_block(
        report.to_cost_block(seat_cost.MEASURED_AT_CLOSE)
    )
    rendered = "\n".join(lines)
    unknown_line = next(l for l in lines if "UNKNOWN" in l)
    assert "routed calls (Copilot CLI transport)" in unknown_line
    assert "$" not in unknown_line, (
        "the component that was not measured must carry no dollar figure"
    )
    assert "TOTAL: not available" in rendered
    assert "routed_seat" in rendered
    rendered.encode("cp1252")


# ==========================================================================
# Set 130 S3, round 1+2 remediation -- the recorded block arrives from DISK
#
# The authoring validator guards what a producer writes. These guard what a
# READER is handed: a hand edit, an older producer, a future one. Both
# discovery lenses found the same hole independently, which is the shape of
# a real one.
# ==========================================================================


def test_a_status_that_means_unmeasured_beats_a_number_sitting_beside_it():
    """The renderer must not decide from `credits is not None`.

    Planted straight from the finding: status 'unknown' with credits 0.0,
    the exact fail-open shape, arriving the way it actually would -- off
    disk, past the authoring validator.
    """
    block = {
        "measured_at": "close",
        "components": [{
            "component": "routed_seat", "status": "unknown",
            "credits": 0.0, "usd": 0.0,
        }],
        "total_status": "unknown",
        "total_credits": 0.0,
        "total_usd": 0.0,
        "unmeasured": ["routed_seat"],
    }
    rendered = "\n".join(seat_cost.format_cost_block(block))
    assert "$0.00" not in rendered, (
        "an unmeasured component was rendered as a dollar figure"
    )
    assert "UNKNOWN" in rendered
    assert "the status wins" in rendered
    assert "TOTAL: not available" in rendered, (
        "a total may not survive an unmeasured component, whatever the "
        "block claims total_credits is"
    )


def test_a_numeric_status_with_no_number_reports_nothing_rather_than_guessing():
    """The mirror: 'measured' with credits stripped must not print a figure."""
    block = {
        "measured_at": "retrospective",
        "components": [{
            "component": "orchestrator_seat", "status": "measured",
            "credits": None, "usd": None,
        }],
        "total_status": "measured",
        "total_credits": 100.0,
        "total_usd": 1.0,
        "unmeasured": [],
    }
    rendered = "\n".join(seat_cost.format_cost_block(block))
    assert "MEASURED" in rendered
    assert "refusing to report a figure" in rendered
    assert "TOTAL: not available" in rendered
    assert "$1.00" not in rendered


def test_routed_api_applicability_is_derived_from_the_record_not_a_flag(
    tmp_path, monkeypatch
):
    """The advertised flagless command must produce a total on a seat.

    `--session-set-dir` used to pass `--no-api-calls` straight through, so
    the documented producer path reported routed_api as UNKNOWN and
    suppressed the total for the ordinary Copilot-seat case.
    """
    import json as _json

    store = _plant_store(tmp_path / "s.db", [
        ("orch-a", 40_000_000_000), ("child-1", 8_000_000_000),
    ])
    set_dir = _plant_state(tmp_path / "130-set", [(1, "complete", ["orch-a"])])
    metrics_path = _plant_metrics(set_dir / "router-metrics.jsonl", [(1, "child-1")])
    monkeypatch.setenv("AI_ROUTER_METRICS_PATH", str(metrics_path))
    monkeypatch.delenv(seat_cost.SEAT_SESSION_ID_ENV, raising=False)

    report = seat_cost.measure_session(
        str(set_dir), 1, live=False, store_path=str(store)
    )
    assert report.get(API).status == seat_cost.STATUS_NOT_APPLICABLE
    assert report.total_credits == pytest.approx(48.0)
    assert report.total_status == seat_cost.STATUS_MEASURED

    # A session that DID dispatch a priced Direct-API call is a different
    # claim: real, authoritative elsewhere, in a different unit. Reporting
    # it as not_applicable would report someone's spend as zero.
    rows = _json.loads(
        "[" + ",".join(metrics_path.read_text(encoding="utf-8").splitlines()) + "]"
    )
    rows.append({
        "session_set": set_dir.name, "session_number": 1, "call_type": "route",
        "transport": "api", "cost_usd": 1.25, "billed_usage_unavailable": None,
        "transport_session_id": None,
    })
    metrics_path.write_text(
        "\n".join(_json.dumps(r) for r in rows) + "\n", encoding="utf-8"
    )
    report = seat_cost.measure_session(
        str(set_dir), 1, live=False, store_path=str(store)
    )
    api_component = report.get(API)
    assert api_component.status == seat_cost.STATUS_UNAVAILABLE
    assert api_component.credits is None
    assert "router-metrics.jsonl" in (api_component.reason or "")
    assert report.total_credits is None


def test_the_advertised_cli_command_produces_a_block_with_a_total(
    tmp_path, monkeypatch, capsys
):
    """End to end through the exact command the docs and close note print."""
    import json as _json

    store = _plant_store(tmp_path / "s.db", [("orch-a", 40_000_000_000)])
    set_dir = _plant_state(tmp_path / "130-set", [(1, "complete", ["orch-a"])])
    metrics_path = _plant_metrics(set_dir / "router-metrics.jsonl", [])
    monkeypatch.setenv("AI_ROUTER_METRICS_PATH", str(metrics_path))
    monkeypatch.delenv(seat_cost.SEAT_SESSION_ID_ENV, raising=False)

    code = seat_cost.main([
        "--session-set-dir", str(set_dir), "--session-number", "1",
        "--retrospective", "--cost-block", "--store-path", str(store),
    ])
    assert code == 0
    block = _json.loads(capsys.readouterr().out)
    statuses = {c["component"]: c["status"] for c in block["components"]}
    assert statuses[API] == seat_cost.STATUS_NOT_APPLICABLE
    assert block["total_credits"] == pytest.approx(40.0)
    assert block["measured_at"] == seat_cost.MEASURED_AT_RETROSPECTIVE


def test_a_session_with_no_routed_call_at_all_is_a_zero_not_an_unknown(
    tmp_path, monkeypatch
):
    """Derived both ways: absence of a CALL is zero, absence of an ID is not.

    Without this, every session that simply made no routed call reported
    routed_seat UNKNOWN and lost its total -- an unknown that means nothing
    is as useless as a zero that means nothing.
    """
    store = _plant_store(tmp_path / "s.db", [("orch-a", 40_000_000_000)])
    set_dir = _plant_state(tmp_path / "130-set", [(1, "complete", ["orch-a"])])
    metrics_path = _plant_metrics(set_dir / "router-metrics.jsonl", [])
    monkeypatch.setenv("AI_ROUTER_METRICS_PATH", str(metrics_path))
    monkeypatch.delenv(seat_cost.SEAT_SESSION_ID_ENV, raising=False)

    report = seat_cost.measure_session(
        str(set_dir), 1, live=False, store_path=str(store)
    )
    assert report.get(ROUTED).status == seat_cost.STATUS_NOT_APPLICABLE
    assert report.total_credits == pytest.approx(40.0)

    # Now the pre-Set-130-S2 shape: the calls happened, no id was captured.
    _plant_metrics(set_dir / "router-metrics.jsonl", [(1, None), (1, None)])
    report = seat_cost.measure_session(
        str(set_dir), 1, live=False, store_path=str(store)
    )
    routed = report.get(ROUTED)
    assert routed.status == seat_cost.STATUS_UNKNOWN
    assert routed.credits is None, "real spend must not be reported as zero"
    assert "2 routed call(s)" in (routed.reason or "")
    assert report.total_credits is None
