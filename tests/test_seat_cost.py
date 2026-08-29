import sqlite3

import pytest

from ai_router.seat_cost import (
    STATUS_FLOOR,
    STATUS_MEASURED,
    STATUS_UNMEASURED,
    measure_conversations,
)


@pytest.fixture
def store(tmp_path):
    """A minimal seat store shaped like the CLI's session-store.db."""
    path = tmp_path / "session-store.db"
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE schema_version (version INTEGER)")
    conn.execute("INSERT INTO schema_version VALUES (6)")
    conn.execute(
        "CREATE TABLE assistant_usage_events "
        "(session_id TEXT, total_nano_aiu INTEGER)"
    )
    conn.execute("CREATE TABLE sessions (id TEXT PRIMARY KEY)")
    # conv-a: 1.5 credits over two events; conv-b: known with zero usage.
    conn.execute(
        "INSERT INTO assistant_usage_events VALUES "
        "('conv-a', 1000000000), ('conv-a', 500000000)"
    )
    conn.execute("INSERT INTO sessions VALUES ('conv-a'), ('conv-b')")
    conn.commit()
    conn.close()
    return str(path)


class TestMeasureConversations:
    def test_measured_exact(self, store):
        result = measure_conversations(["conv-a"], store_path=store)
        assert result.status == STATUS_MEASURED
        assert result.credits == pytest.approx(1.5)
        assert result.usd == pytest.approx(0.015)
        assert result.event_count == 2

    def test_known_conversation_with_zero_usage_is_a_genuine_zero(self, store):
        result = measure_conversations(["conv-b"], store_path=store)
        assert result.status == STATUS_MEASURED
        assert result.credits == 0.0

    def test_missing_id_makes_a_floor(self, store):
        result = measure_conversations(
            ["conv-a", "conv-nope"], store_path=store
        )
        assert result.status == STATUS_FLOOR
        assert result.credits == pytest.approx(1.5)
        assert result.missing_session_ids == ("conv-nope",)

    def test_self_measurement_is_a_floor(self, store, monkeypatch):
        monkeypatch.setenv("COPILOT_AGENT_SESSION_ID", "conv-a")
        result = measure_conversations(["conv-a"], store_path=store)
        assert result.status == STATUS_FLOOR
        assert "own live conversation" in result.reason

    def test_no_store_is_unmeasured_not_zero(self, tmp_path):
        result = measure_conversations(
            ["conv-a"], store_path=str(tmp_path / "absent.db")
        )
        assert result.status == STATUS_UNMEASURED
        assert result.credits is None
        assert result.usd is None

    def test_unsupported_schema_version_refused(self, store):
        conn = sqlite3.connect(store)
        conn.execute("UPDATE schema_version SET version = 99")
        conn.commit()
        conn.close()
        result = measure_conversations(["conv-a"], store_path=store)
        assert result.status == STATUS_UNMEASURED
        assert "schema_version 99" in result.reason

    def test_no_requested_id_known_is_unmeasured(self, store):
        result = measure_conversations(["conv-x"], store_path=store)
        assert result.status == STATUS_UNMEASURED
        assert result.credits is None
