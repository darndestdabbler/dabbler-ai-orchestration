"""The scripted transport: the framework's model calls without a vendor."""

from pathlib import Path

import pytest

from ai_router.config import TRANSPORT_OFFLINE, VALID_TRANSPORTS, resolve_transport
from ai_router.transports.offline import (
    ENV_RESPONSES_DIR,
    OfflineTransport,
    OfflineTransportError,
    resolve_responses_dir,
)


@pytest.fixture
def scripted(tmp_path):
    def _write(*bodies):
        for index, body in enumerate(bodies, start=1):
            (tmp_path / f"{index:02d}.md").write_text(body, encoding="utf-8")
        return OfflineTransport(tmp_path)
    return _write


class TestResponseQueue:
    def test_responses_serve_in_lexical_order(self, scripted):
        transport = scripted("VERIFIED\nfirst", "ISSUES FOUND\nsecond")
        assert "first" in transport.dispatch(model_id="x").content
        assert "second" in transport.dispatch(model_id="x").content

    def test_cursor_survives_a_new_process(self, scripted, tmp_path):
        scripted("VERIFIED\nfirst", "VERIFIED\nsecond").dispatch(model_id="x")
        # Every CLI verb is its own process; the cursor lives on disk.
        assert "second" in OfflineTransport(tmp_path).dispatch(
            model_id="x"
        ).content

    def test_reset_rewinds(self, scripted, tmp_path):
        transport = scripted("VERIFIED\nfirst", "VERIFIED\nsecond")
        transport.dispatch(model_id="x")
        transport.reset()
        assert "first" in transport.dispatch(model_id="x").content

    def test_exhaustion_raises_rather_than_replaying(self, scripted):
        transport = scripted("VERIFIED\nonly one")
        transport.dispatch(model_id="x")
        with pytest.raises(OfflineTransportError, match="exhausted"):
            transport.dispatch(model_id="x")

    def test_empty_response_is_refused(self, scripted):
        with pytest.raises(OfflineTransportError, match="empty"):
            scripted("   \n").dispatch(model_id="x")

    def test_missing_directory_is_named(self, tmp_path):
        with pytest.raises(OfflineTransportError, match="does not exist"):
            OfflineTransport(tmp_path / "absent").dispatch(model_id="x")

    def test_directory_without_responses_is_named(self, tmp_path):
        (tmp_path / "notes.rst").write_text("not a response")
        with pytest.raises(OfflineTransportError, match="holds no"):
            OfflineTransport(tmp_path).dispatch(model_id="x")


class TestResultProvenance:
    def test_result_never_claims_to_be_a_provider(self, scripted):
        result = scripted("VERIFIED\nbody").dispatch(model_id="claude-opus-5")
        assert result.ok
        assert result.served_model_id == "offline:01.md"
        assert result.metadata["simulated"] is True
        assert result.metadata["requested_model_id"] == "claude-opus-5"

    def test_nothing_is_metered_because_nothing_was_spent(self, scripted):
        result = scripted("VERIFIED\nbody").dispatch(model_id="x")
        assert result.input_tokens == 0
        assert result.output_tokens == 0


class TestSelection:
    def test_transport_is_selectable(self):
        assert TRANSPORT_OFFLINE in VALID_TRANSPORTS
        assert resolve_transport({}, "offline") == TRANSPORT_OFFLINE

    def test_env_var_beats_config(self, tmp_path, monkeypatch):
        monkeypatch.setenv(ENV_RESPONSES_DIR, str(tmp_path))
        resolved = resolve_responses_dir(
            {"transports": {"offline": {"responses_dir": "/elsewhere"}}}
        )
        assert resolved == tmp_path

    def test_config_supplies_the_directory(self, monkeypatch):
        monkeypatch.delenv(ENV_RESPONSES_DIR, raising=False)
        resolved = resolve_responses_dir(
            {"transports": {"offline": {"responses_dir": "/scripts"}}}
        )
        # Compared as a path, not as its rendered string: the separator is a
        # property of the platform, not of the resolution being tested.
        assert resolved == Path("/scripts")

    def test_unconfigured_offline_refuses_rather_than_defaulting(
        self, monkeypatch
    ):
        """No default location — it cannot be reached by accident."""
        monkeypatch.delenv(ENV_RESPONSES_DIR, raising=False)
        with pytest.raises(OfflineTransportError, match="needs a response"):
            resolve_responses_dir({})
