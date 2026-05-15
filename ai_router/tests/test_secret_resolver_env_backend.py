"""Tests for secret_resolver — env-var backend."""

import sys

import pytest
import secret_resolver as sr  # type: ignore[import-not-found]


def test_env_backend_returns_value_when_present(monkeypatch):
    monkeypatch.setenv("_TEST_KEY", "test-value")
    assert sr.resolve_secret("_TEST_KEY") == "test-value"


def test_env_backend_returns_none_when_absent(monkeypatch):
    monkeypatch.delenv("_TEST_KEY", raising=False)
    assert sr.resolve_secret("_TEST_KEY") is None


def test_env_backend_normalises_empty_string_to_none(monkeypatch):
    monkeypatch.setenv("_TEST_KEY", "")
    assert sr.resolve_secret("_TEST_KEY") is None


@pytest.mark.skipif(
    sys.platform == "win32",
    reason="Windows os.environ is case-insensitive; platform contract applies to env backend",
)
def test_env_backend_is_case_sensitive(monkeypatch):
    monkeypatch.setenv("_TEST_KEY_UPPER", "upper")
    assert sr.resolve_secret("_TEST_KEY_UPPER") == "upper"
    assert sr.resolve_secret("_test_key_upper") is None


def test_resolve_secret_raises_on_unknown_backend():
    with pytest.raises(ValueError, match="Unknown secret backend"):
        sr.resolve_secret("ANYTHING", source="nonexistent-backend")


def test_register_backend_and_use_it():
    calls = []

    def _custom(name: str):
        calls.append(name)
        return f"custom-{name}"

    sr.register_backend("_test_custom", _custom)
    try:
        result = sr.resolve_secret("MY_KEY", source="_test_custom")
        assert result == "custom-MY_KEY"
        assert calls == ["MY_KEY"]
    finally:
        del sr._BACKENDS["_test_custom"]
