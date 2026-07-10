"""Set 086 S2 — togglable Copilot-CLI transport diagnostics tests.

The module (``transport_diagnostics``) surfaces a failed dispatch's classified
detail (error_class, argv, auth-reprobe, stderr) two ways: a compact pure
summary embedded in the raised error, and a toggle-gated structured JSONL log.
Every branch is driven off explicit args / injected seams (env dict, a fake
``log_writer``) so the real filesystem and real environment are never touched.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import transport_diagnostics as td


# ---------------------------------------------------------------------------
# A duck-typed stand-in for cli_transport.TransportResult: only the public
# reads the diagnostics module uses.
# ---------------------------------------------------------------------------
@dataclass
class _FakeResult:
    ok: bool = False
    raw_stderr: str = ""
    partial_output_discarded: bool = False
    transport_metadata: dict = field(default_factory=dict)


def _auth_failure(argv=None, stderr="No authentication information found") -> _FakeResult:
    return _FakeResult(
        ok=False,
        raw_stderr=stderr,
        partial_output_discarded=False,
        transport_metadata={
            "error_class": "auth-class",
            "retryable": False,
            "argv": argv or ["copilot", "-p", "SYSTEM\n\nreview this", "--model",
                              "gpt-5.4", "--allow-all-tools", "--output-format",
                              "json", "--no-auto-update"],
            "exit_code": 1,
            "reprobed": True,
            "reprobe_cli_version": "1.2.3",
            "reprobe_cli_alive": True,
            "utf8_replacement_seen": False,
        },
    )


def _fixed_now():
    return datetime(2026, 7, 9, 12, 0, 0, tzinfo=timezone.utc)


# --- diagnostics_enabled: env wins over config both ways -------------------

def test_enabled_default_false_when_absent():
    assert td.diagnostics_enabled({}, env={}) is False
    assert td.diagnostics_enabled(None, env={}) is False


def test_enabled_from_config():
    cfg = {"transports": {"copilot-cli": {"diagnostics": {"enabled": True}}}}
    assert td.diagnostics_enabled(cfg, env={}) is True


def test_env_truthy_overrides_config_off():
    cfg = {"transports": {"copilot-cli": {"diagnostics": {"enabled": False}}}}
    assert td.diagnostics_enabled(cfg, env={td.DIAGNOSTICS_ENV_VAR: "1"}) is True
    assert td.diagnostics_enabled(cfg, env={td.DIAGNOSTICS_ENV_VAR: "true"}) is True


def test_env_falsy_overrides_config_on():
    cfg = {"transports": {"copilot-cli": {"diagnostics": {"enabled": True}}}}
    assert td.diagnostics_enabled(cfg, env={td.DIAGNOSTICS_ENV_VAR: "0"}) is False
    assert td.diagnostics_enabled(cfg, env={td.DIAGNOSTICS_ENV_VAR: "off"}) is False


def test_env_unrecognized_falls_through_to_config():
    cfg = {"transports": {"copilot-cli": {"diagnostics": {"enabled": True}}}}
    assert td.diagnostics_enabled(cfg, env={td.DIAGNOSTICS_ENV_VAR: "maybe"}) is True


def test_enabled_tolerates_malformed_config():
    # No level in the path may be a dict; never raises, always False.
    for bad in ({"transports": None}, {"transports": {"copilot-cli": 5}},
                {"transports": {"copilot-cli": {"diagnostics": "x"}}}, "not-a-dict"):
        assert td.diagnostics_enabled(bad, env={}) is False


# --- resolve_log_path ------------------------------------------------------

def test_log_path_default():
    assert td.resolve_log_path({}, env={}) == Path(td.DEFAULT_LOG_PATH)


def test_log_path_from_config():
    cfg = {"transports": {"copilot-cli": {"diagnostics": {"log_path": "x/y.jsonl"}}}}
    assert td.resolve_log_path(cfg, env={}) == Path("x/y.jsonl")


def test_log_path_env_overrides_config():
    cfg = {"transports": {"copilot-cli": {"diagnostics": {"log_path": "x/y.jsonl"}}}}
    got = td.resolve_log_path(cfg, env={td.DIAGNOSTICS_LOG_ENV_VAR: "z/override.jsonl"})
    assert got == Path("z/override.jsonl")


# --- redact_argv: the -p prompt payload never reaches the log --------------

def test_redact_argv_replaces_prompt_value():
    argv = ["copilot", "-p", "a very long secret prompt", "--model", "gpt-5.4"]
    out = td.redact_argv(argv)
    assert out == ["copilot", "-p", "<prompt: 25 chars>", "--model", "gpt-5.4"]
    assert "secret prompt" not in " ".join(out)


def test_redact_argv_no_prompt_flag():
    argv = ["copilot", "--version"]
    assert td.redact_argv(argv) == ["copilot", "--version"]


def test_redact_argv_trailing_p_flag_no_value():
    assert td.redact_argv(["copilot", "-p"]) == ["copilot", "-p"]


def test_redact_argv_empty_or_none():
    assert td.redact_argv(None) == []
    assert td.redact_argv([]) == []


# --- build_record ----------------------------------------------------------

def test_build_record_lifts_fields_and_redacts():
    rec = td.build_record(_auth_failure(), context={"role": "verifier"}, now=_fixed_now)
    assert rec["ts"] == "2026-07-09T12:00:00+00:00"
    assert rec["context"] == {"role": "verifier"}
    assert rec["ok"] is False
    assert rec["error_class"] == "auth-class"
    assert rec["exit_code"] == 1
    assert rec["reprobed"] is True
    assert rec["reprobe_cli_alive"] is True
    assert "<prompt:" in " ".join(rec["argv"])
    assert "review this" not in " ".join(rec["argv"])


def test_build_record_caps_stderr_tail():
    big = "x" * 5000
    rec = td.build_record(_auth_failure(stderr=big), now=_fixed_now)
    assert len(rec["raw_stderr"]) == td._STDERR_TAIL_CAP
    # tail, not head
    assert rec["raw_stderr"] == big[-td._STDERR_TAIL_CAP:]


def test_build_record_tolerates_missing_metadata():
    rec = td.build_record(_FakeResult(), now=_fixed_now)
    assert rec["error_class"] is None
    assert rec["argv"] == []


def test_build_and_summary_never_raise_on_malformed_metadata():
    # Round-3 finding: the helpers are called directly from the raise sites,
    # so a malformed result must degrade to an empty record, never raise (which
    # would mask the real transport failure).
    for bad_md in (5, [], "nope", None):
        r = _FakeResult(transport_metadata=bad_md)  # type: ignore[arg-type]
        rec = td.build_record(r, now=_fixed_now)
        assert rec["error_class"] is None and rec["argv"] == []
        assert isinstance(td.diagnostics_summary(r), str)
    # A non-string raw_stderr is coerced, not fatal.
    r = _FakeResult(raw_stderr=b"bytes stderr")  # type: ignore[arg-type]
    assert isinstance(td.build_record(r, now=_fixed_now)["raw_stderr"], str)
    assert isinstance(td.diagnostics_summary(r), str)


# --- diagnostics_summary: pure, prompt-free, always safe -------------------

def test_summary_has_class_and_redacted_argv_no_prompt():
    s = td.diagnostics_summary(_auth_failure(), context={"role": "generator",
                                                         "model_id": "gpt-5.4"})
    assert "error_class='auth-class'" in s
    assert "exit_code=1" in s
    assert "<prompt:" in s
    assert "review this" not in s
    assert s.startswith("[generator gpt-5.4] ")


def test_summary_reports_reprobe_status_both_ways():
    # Round-2 finding: reprobe STATUS is always reported. When it did not run,
    # `reprobed=False` is stated and `reprobe_cli_alive` is omitted.
    r = _auth_failure()
    r.transport_metadata["reprobed"] = False
    s = td.diagnostics_summary(r)
    assert "reprobed=False" in s
    assert "reprobe_cli_alive" not in s
    # When it ran, both are present.
    s2 = td.diagnostics_summary(_auth_failure())  # reprobed=True in the fixture
    assert "reprobed=True" in s2
    assert "reprobe_cli_alive=True" in s2


def test_summary_caps_stderr():
    r = _auth_failure(stderr="y" * 4000)
    s = td.diagnostics_summary(r)
    # the tail cap is the summary-specific (shorter) cap
    assert ("y" * td._SUMMARY_STDERR_CAP) in s
    assert ("y" * (td._SUMMARY_STDERR_CAP + 1)) not in s


# Round-2 finding: argv redaction is not enough — the CLI can echo the prompt
# into stderr, so stderr must be scrubbed of the exact prompt payload too, in
# BOTH the persisted record and the raised summary.

def _result_with_prompt_in_stderr():
    # A real CLI that echoes the prompt into stderr echoes the RAW value
    # (real newlines), so the scrub must match the raw prompt verbatim.
    prompt = "TOP SECRET SYSTEM PROMPT\n\nthe confidential user task"
    return _FakeResult(
        ok=False,
        raw_stderr=f"copilot error while handling prompt:\n{prompt}\nauth failed",
        transport_metadata={
            "error_class": "auth-class",
            "exit_code": 1,
            "argv": ["copilot", "-p", prompt, "--model", "gpt-5.4"],
        },
    ), prompt


def test_build_record_scrubs_prompt_from_stderr():
    r, prompt = _result_with_prompt_in_stderr()
    rec = td.build_record(r, now=_fixed_now)
    assert prompt not in rec["raw_stderr"]
    assert "the confidential user task" not in rec["raw_stderr"]
    assert td._PROMPT_REDACTION_MARKER in rec["raw_stderr"]
    # argv is still redacted independently.
    assert prompt not in " ".join(rec["argv"])


def test_summary_scrubs_prompt_from_stderr():
    r, prompt = _result_with_prompt_in_stderr()
    s = td.diagnostics_summary(r)
    assert prompt not in s
    assert "the confidential user task" not in s


# --- emit_diagnostics: toggle gating + best-effort write -------------------

def test_emit_noop_when_disabled():
    calls = []
    rec = td.emit_diagnostics(
        _auth_failure(), config={}, env={},
        log_writer=lambda p, l: calls.append((p, l)),
    )
    assert rec is None
    assert calls == []


def test_emit_writes_json_line_when_enabled():
    calls = []
    cfg = {"transports": {"copilot-cli": {"diagnostics": {"enabled": True,
                                                          "log_path": "d/diag.jsonl"}}}}
    rec = td.emit_diagnostics(
        _auth_failure(), config=cfg, env={}, now=_fixed_now,
        log_writer=lambda p, l: calls.append((p, l)),
    )
    assert rec is not None and rec["error_class"] == "auth-class"
    assert len(calls) == 1
    path, line = calls[0]
    assert path == Path("d/diag.jsonl")
    import json
    parsed = json.loads(line)
    assert parsed["error_class"] == "auth-class"
    assert "\n" not in line  # exactly one JSONL record, newline added by writer


def test_emit_swallows_write_failure_but_returns_record(capsys):
    def _boom(path, line):
        raise OSError("disk full")

    cfg = {"transports": {"copilot-cli": {"diagnostics": {"enabled": True}}}}
    rec = td.emit_diagnostics(_auth_failure(), config=cfg, env={}, now=_fixed_now,
                              log_writer=_boom)
    # The transport failure must not be masked by a diagnostics-write failure.
    assert rec is not None
    err = capsys.readouterr().err
    assert "could not write Copilot transport diagnostics" in err


def test_emit_enabled_via_env_only():
    calls = []
    rec = td.emit_diagnostics(
        _auth_failure(), config={}, env={td.DIAGNOSTICS_ENV_VAR: "yes"}, now=_fixed_now,
        log_writer=lambda p, l: calls.append((p, l)),
    )
    assert rec is not None
    assert len(calls) == 1


# Round-1 verification finding: "best-effort, never masks the transport
# failure" must hold for MORE than an OSError from the writer.

def test_emit_swallows_non_oserror_writer_failure(capsys):
    def _boom(path, line):
        raise ValueError("a non-OSError writer failure")

    cfg = {"transports": {"copilot-cli": {"diagnostics": {"enabled": True}}}}
    rec = td.emit_diagnostics(_auth_failure(), config=cfg, env={}, now=_fixed_now,
                              log_writer=_boom)
    # A non-OSError writer failure is swallowed too — never escapes to mask the
    # transport failure — and the record is still returned.
    assert rec is not None
    assert "could not write Copilot transport diagnostics" in capsys.readouterr().err


def test_emit_returns_none_on_unserializable_record(capsys):
    # A record that cannot be JSON-serialized (a non-serializable value slipped
    # into argv) must be swallowed at build/serialize time — returns None, never
    # attempts the write, never escapes.
    r = _auth_failure()
    r.transport_metadata["argv"] = ["copilot", object()]  # not JSON-serializable
    cfg = {"transports": {"copilot-cli": {"diagnostics": {"enabled": True}}}}
    calls = []
    rec = td.emit_diagnostics(r, config=cfg, env={}, now=_fixed_now,
                              log_writer=lambda p, l: calls.append((p, l)))
    assert rec is None
    assert calls == []  # the write was never attempted
    assert "could not build Copilot transport diagnostics record" in capsys.readouterr().err
