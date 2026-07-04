import io
import queue
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Optional, Sequence

import pytest

import cli_transport

# ---------------------------------------------------------------------------
# Test fakes for subprocess.Popen
# ---------------------------------------------------------------------------


class FakeStream:
    """A fake file-like stream that can simulate blocking IO."""

    def __init__(self, lines: list[str], block_after: Optional[float] = None):
        self._lines = iter(lines)
        self._block_after = block_after

    def readline(self, size: int = -1) -> str:
        try:
            return next(self._lines)
        except StopIteration:
            if self._block_after is not None:
                time.sleep(self._block_after)
            return ""


@dataclass
class FakeProcess:
    """A fake process handle implementing the ProcessHandle protocol."""

    stdout_lines: list[str] = field(default_factory=list)
    stderr_lines: list[str] = field(default_factory=list)
    exit_code: int = 0
    delay_seconds: float = 0.0
    block_stdout_after: Optional[float] = None
    block_stderr_after: Optional[float] = None

    stdout: FakeStream = field(init=False)
    stderr: FakeStream = field(init=False)
    _killed: bool = False
    _waited: bool = False
    _pid: int = 1234
    _start_time: float = field(init=False)

    def __post_init__(self):
        self.stdout = FakeStream(self.stdout_lines, self.block_stdout_after)
        self.stderr = FakeStream(self.stderr_lines, self.block_stderr_after)
        self._start_time = time.monotonic()

    def poll(self) -> Optional[int]:
        if self._waited or (
            self.delay_seconds > 0
            and time.monotonic() - self._start_time < self.delay_seconds
        ):
            return None
        return self.exit_code

    def kill(self) -> None:
        self._killed = True
        self.exit_code = -9

    def wait(self, timeout: Optional[float] = None) -> int:
        if timeout:
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                if self.poll() is not None:
                    break
                time.sleep(0.01)
            else:
                raise subprocess.TimeoutExpired(self, timeout)

        self._waited = True
        return self.exit_code

    @property
    def killed(self) -> bool:
        return self._killed


@dataclass
class SpawnerCall:
    argv: Sequence[str]
    env: Optional[dict]


class FakeSpawner:
    def __init__(self, process_to_return: FakeProcess, delay_seconds: float = 0):
        self._process = process_to_return
        self._delay = delay_seconds
        self.calls: list[SpawnerCall] = []

    def __call__(self, argv: Sequence[str], env: Optional[dict]) -> FakeProcess:
        self.calls.append(SpawnerCall(argv, env))
        if self._delay > 0:
            time.sleep(self._delay)
        return self._process


class FakeVersionProbe:
    def __init__(self, return_value: Optional[str]):
        self._return_value = return_value
        self.call_count = 0

    def __call__(self) -> Optional[str]:
        self.call_count += 1
        return self._return_value


@pytest.fixture
def short_timeouts():
    # Margins are wide (5-10x) relative to the fake delays each timeout test
    # below uses, so thread-scheduling jitter on a loaded CI box cannot cross
    # a boundary and misclassify which tier timed out.
    return cli_transport.TransportTimeouts(
        spawn_seconds=0.2, first_byte_seconds=0.2, total_seconds=5.0
    )


# A realistic success stdout payload from the CLI. Message-type events wrap
# their payload under "data" ({"type": ..., "data": {...}, "id": ...,
# ["ephemeral": ...]}); the terminal "result" event does not -- its fields
# (sessionId/usage) sit at the envelope's top level. This asymmetry is real
# (S4 live-dogfood finding against the actual CLI, not a simplification).
SUCCESS_STDOUT_LINES = [
    '{"type": "session.start", "sessionId": "test-session-id"}\n',
    '{"type": "assistant.message_delta", "data": {"content": "Hello"}, "ephemeral": true}\n',
    '{"type": "assistant.message", "data": {"content": "Hello world", "model": "gpt-5.4", "outputTokens": 2}}\n',
    '{"type": "result", "sessionId": "test-session-id", "usage": {"premiumRequests": 1}}\n',
]


def test_argument_construction():
    spawner = FakeSpawner(FakeProcess())
    transport = cli_transport.CopilotCliTransport(binary="gh-copilot", spawner=spawner)

    transport.dispatch(
        model_id="gpt-5.4",
        system_prompt="Be concise.",
        user_message="Say hello.",
    )

    assert len(spawner.calls) == 1
    call = spawner.calls[0]
    expected_prompt = "Be concise.\n\nSay hello."
    expected_argv = [
        "gh-copilot",
        "-p", expected_prompt,
        "--model", "gpt-5.4",
        "--allow-all-tools",
        "--output-format", "json",
        "--no-auto-update",
    ]
    assert call.argv == expected_argv
    assert call.env == {"COPILOT_AUTO_UPDATE": "false"}


def test_argument_construction_no_system_prompt():
    spawner = FakeSpawner(FakeProcess())
    transport = cli_transport.CopilotCliTransport(spawner=spawner)
    transport.dispatch(model_id="gpt-5.4", system_prompt="", user_message="Just hello.")

    assert len(spawner.calls) == 1
    assert spawner.calls[0].argv[2] == "Just hello."


def test_noninteractive_flags_are_always_present_on_error():
    spawner = FakeSpawner(FakeProcess(exit_code=1, stderr_lines=["error\n"]))
    transport = cli_transport.CopilotCliTransport(spawner=spawner)
    transport.dispatch(model_id="m", system_prompt="", user_message="u")

    assert len(spawner.calls) == 1
    call = spawner.calls[0]
    assert "--allow-all-tools" in call.argv
    assert "--no-auto-update" in call.argv


def test_timeout_spawn(short_timeouts):
    # 5x the fixture's spawn_seconds (0.2s) so scheduling jitter cannot make
    # the spawn call happen to return before the deadline.
    spawner = FakeSpawner(FakeProcess(), delay_seconds=1.0)
    transport = cli_transport.CopilotCliTransport(
        spawner=spawner, timeouts=short_timeouts
    )
    result = transport.dispatch(model_id="m", system_prompt="", user_message="u")

    assert not result.ok
    assert result.transport_metadata["error_class"] == "spawn-timeout"


def test_timeout_first_byte(short_timeouts):
    # 5x the fixture's first_byte_seconds (0.2s); total_seconds is 5.0s so it
    # cannot fire first even under heavy scheduling delay.
    fake_proc = FakeProcess(block_stdout_after=1.0)
    spawner = FakeSpawner(fake_proc)
    transport = cli_transport.CopilotCliTransport(
        spawner=spawner, timeouts=short_timeouts
    )
    result = transport.dispatch(model_id="m", system_prompt="", user_message="u")

    assert not result.ok
    assert result.transport_metadata["error_class"] == "first-byte-timeout"
    assert not result.partial_output_discarded
    assert result.content == ""
    assert fake_proc.killed


def test_timeout_total():
    # A dedicated, wide-margin timeout config: first_byte is generous (the
    # one immediately-available line only needs to clear queue/thread
    # scheduling overhead, not a fake delay), total is short, and the second
    # block is ~7x total_seconds so jitter cannot let it race past total.
    timeouts = cli_transport.TransportTimeouts(
        spawn_seconds=1.0, first_byte_seconds=1.0, total_seconds=0.3
    )
    fake_proc = FakeProcess(
        stdout_lines=['{"type":"session.start"}\n'], block_stdout_after=2.0
    )
    spawner = FakeSpawner(fake_proc)
    transport = cli_transport.CopilotCliTransport(spawner=spawner, timeouts=timeouts)
    result = transport.dispatch(model_id="m", system_prompt="", user_message="u")

    assert not result.ok
    assert result.transport_metadata["error_class"] == "total-timeout"
    assert result.partial_output_discarded
    assert result.content == ""
    assert fake_proc.killed


def test_auth_error_reprobes_and_stops():
    stderr_lines = ["Error: You are not logged in. Please run `copilot auth login`.\n"]
    fake_proc = FakeProcess(exit_code=1, stderr_lines=stderr_lines)
    spawner = FakeSpawner(fake_proc)
    probe = FakeVersionProbe("1.2.3")
    transport = cli_transport.CopilotCliTransport(
        spawner=spawner, version_probe=probe
    )
    result = transport.dispatch(model_id="m", system_prompt="", user_message="u")

    assert not result.ok
    assert not result.retryable
    assert result.transport_metadata["error_class"] == "auth-class"
    assert probe.call_count == 1
    assert result.transport_metadata["reprobed"]
    assert result.transport_metadata["reprobe_cli_version"] == "1.2.3"
    assert result.transport_metadata["reprobe_cli_alive"]


def test_auth_error_reprobe_finds_dead_cli():
    stderr_lines = ["Error: Authentication failed.\n"]
    fake_proc = FakeProcess(exit_code=1, stderr_lines=stderr_lines)
    spawner = FakeSpawner(fake_proc)
    probe = FakeVersionProbe(None)
    transport = cli_transport.CopilotCliTransport(
        spawner=spawner, version_probe=probe
    )
    result = transport.dispatch(model_id="m", system_prompt="", user_message="u")

    assert not result.ok
    assert probe.call_count == 1
    assert result.transport_metadata["reprobed"]
    assert result.transport_metadata["reprobe_cli_version"] is None
    assert not result.transport_metadata["reprobe_cli_alive"]


def test_non_auth_error_does_not_reprobe():
    stderr_lines = ["Error: Model foo from --model flag is not available.\n"]
    fake_proc = FakeProcess(exit_code=1, stderr_lines=stderr_lines)
    spawner = FakeSpawner(fake_proc)
    probe = FakeVersionProbe("1.2.3")
    transport = cli_transport.CopilotCliTransport(
        spawner=spawner, version_probe=probe
    )
    result = transport.dispatch(model_id="foo", system_prompt="", user_message="u")

    assert not result.ok
    assert result.transport_metadata["error_class"] == "invalid-model"
    assert probe.call_count == 0
    assert not result.transport_metadata["reprobed"]
    assert result.transport_metadata["reprobe_cli_version"] is None


def test_quota_error_classifies_correctly_and_does_not_reprobe():
    stderr_lines = ["429 Too Many Requests: rate limit exceeded\n"]
    fake_proc = FakeProcess(exit_code=1, stderr_lines=stderr_lines)
    spawner = FakeSpawner(fake_proc)
    probe = FakeVersionProbe("1.2.3")
    transport = cli_transport.CopilotCliTransport(
        spawner=spawner, version_probe=probe
    )
    result = transport.dispatch(model_id="m", system_prompt="", user_message="u")

    assert not result.ok
    assert not result.retryable
    assert result.transport_metadata["error_class"] == "quota-rate-class"
    assert probe.call_count == 0


def test_invalid_model_error():
    stderr_lines = ["Error: Model 'bad-model' from --model flag is not available.\n"]
    fake_proc = FakeProcess(exit_code=1, stderr_lines=stderr_lines)
    spawner = FakeSpawner(fake_proc)
    transport = cli_transport.CopilotCliTransport(spawner=spawner)
    result = transport.dispatch(model_id="m", system_prompt="", user_message="u")

    assert not result.ok
    assert not result.retryable
    assert result.transport_metadata["error_class"] == "invalid-model"


def test_generic_error_fallback():
    stderr_lines = ["Some unknown failure has occurred.\n"]
    fake_proc = FakeProcess(exit_code=127, stderr_lines=stderr_lines)
    spawner = FakeSpawner(fake_proc)
    transport = cli_transport.CopilotCliTransport(spawner=spawner)
    result = transport.dispatch(model_id="m", system_prompt="", user_message="u")

    assert not result.ok
    assert not result.retryable
    assert result.transport_metadata["error_class"] == "generic-unknown"
    assert cli_transport.RETRYABLE_ERROR_CLASSES == frozenset()


def test_no_internal_retry():
    # Success case
    spawner_ok = FakeSpawner(FakeProcess(stdout_lines=SUCCESS_STDOUT_LINES))
    transport_ok = cli_transport.CopilotCliTransport(spawner=spawner_ok)
    transport_ok.dispatch(model_id="m", system_prompt="", user_message="u")
    assert len(spawner_ok.calls) == 1

    # Error case
    spawner_err = FakeSpawner(FakeProcess(exit_code=1))
    transport_err = cli_transport.CopilotCliTransport(spawner=spawner_err)
    transport_err.dispatch(model_id="m", system_prompt="", user_message="u")
    assert len(spawner_err.calls) == 1


def test_malformed_empty_output_is_generic_error():
    # Empty stdout
    spawner_empty = FakeSpawner(FakeProcess(stdout_lines=[]))
    result_empty = cli_transport.CopilotCliTransport(spawner=spawner_empty).dispatch(
        model_id="m", system_prompt="", user_message="u"
    )
    assert not result_empty.ok
    assert result_empty.transport_metadata["error_class"] == "generic-unknown"

    # Malformed JSON
    spawner_badjson = FakeSpawner(FakeProcess(stdout_lines=["not json\n"]))
    result_badjson = cli_transport.CopilotCliTransport(
        spawner=spawner_badjson
    ).dispatch(model_id="m", system_prompt="", user_message="u")
    assert not result_badjson.ok
    assert result_badjson.transport_metadata["error_class"] == "generic-unknown"

    # Valid JSONL but missing required event
    spawner_no_msg = FakeSpawner(
        FakeProcess(stdout_lines=['{"type":"session.start"}\n', '{"type":"result"}\n'])
    )
    result_no_msg = cli_transport.CopilotCliTransport(
        spawner=spawner_no_msg
    ).dispatch(model_id="m", system_prompt="", user_message="u")
    assert not result_no_msg.ok
    assert result_no_msg.transport_metadata["error_class"] == "generic-unknown"


@pytest.mark.parametrize(
    "bad_message_json",
    [
        # outputTokens is a string, not an int
        '{"type": "assistant.message", "data": {"content": "hi", "outputTokens": "not-a-number"}}\n',
        # outputTokens is a bool -- isinstance(True, int) is True in Python,
        # so this must be explicitly rejected, not silently coerced to 1.
        '{"type": "assistant.message", "data": {"content": "hi", "outputTokens": true}}\n',
        # outputTokens is a numeric string / a float -- int() itself would
        # silently coerce either without complaint (round-3 verification
        # finding), so these must be rejected by an exact-type check, not
        # discovered via int()'s own leniency.
        '{"type": "assistant.message", "data": {"content": "hi", "outputTokens": "7"}}\n',
        '{"type": "assistant.message", "data": {"content": "hi", "outputTokens": 1.5}}\n',
        # content is a number, not a string
        '{"type": "assistant.message", "data": {"content": 12345, "outputTokens": 1}}\n',
        # model is a list, not a string
        '{"type": "assistant.message", "data": {"content": "hi", "model": ["a", "b"]}}\n',
        # content is falsy-but-wrong-typed: `x or ""` would previously mask
        # each of these into an empty-but-"valid" string before the type
        # check ever saw the real, wrong type (round-2 verification finding).
        '{"type": "assistant.message", "data": {"content": 0, "outputTokens": 1}}\n',
        '{"type": "assistant.message", "data": {"content": false, "outputTokens": 1}}\n',
        '{"type": "assistant.message", "data": {"content": [], "outputTokens": 1}}\n',
        '{"type": "assistant.message", "data": {"content": {}, "outputTokens": 1}}\n',
        '{"type": "assistant.message", "data": {"content": null, "outputTokens": 1}}\n',
        # data itself is the wrong shape (a list, not a dict) -- the S4
        # live-dogfood fix's new unwrap step must reject this the same way,
        # not raise or silently treat it as an empty dict.
        '{"type": "assistant.message", "data": ["not", "a", "dict"]}\n',
    ],
)
def test_malformed_field_shape_in_otherwise_valid_json_is_generic_error(
    bad_message_json,
):
    # session-verification finding (Set 078 S2): well-formed JSON with an
    # unexpected field SHAPE must never raise out of dispatch() -- it is
    # exactly as untrustworthy as a missing event.
    spawner = FakeSpawner(FakeProcess(stdout_lines=[bad_message_json], exit_code=0))
    result = cli_transport.CopilotCliTransport(spawner=spawner).dispatch(
        model_id="m", system_prompt="", user_message="u"
    )
    assert not result.ok
    assert result.transport_metadata["error_class"] == "generic-unknown"
    assert result.content == ""


def test_missing_content_field_defaults_to_empty_string_success():
    # An absent "content" key (distinct from an explicitly-present wrong-
    # typed value, covered above) is not malformed -- it is treated as an
    # empty response, not an error.
    stdout_lines = [
        '{"type": "assistant.message", "data": {"outputTokens": 0}}\n',
        '{"type": "result", "usage": {}}\n',
    ]
    spawner = FakeSpawner(FakeProcess(stdout_lines=stdout_lines, exit_code=0))
    result = cli_transport.CopilotCliTransport(spawner=spawner).dispatch(
        model_id="m", system_prompt="", user_message="u"
    )
    assert result.ok
    assert result.content == ""


def test_missing_data_key_is_malformed_not_empty_success():
    # An assistant.message event with no "data" key at all (distinct from a
    # present-but-incomplete data dict, covered above) is a structurally
    # malformed wire shape -- the real CLI always wraps message payload
    # fields under "data" -- and must fail closed as generic-unknown, not
    # be silently accepted as a legitimate empty response (S5 path-aware
    # critique finding).
    stdout_lines = [
        '{"type": "assistant.message"}\n',
        '{"type": "result", "usage": {}}\n',
    ]
    spawner = FakeSpawner(FakeProcess(stdout_lines=stdout_lines, exit_code=0))
    result = cli_transport.CopilotCliTransport(spawner=spawner).dispatch(
        model_id="m", system_prompt="", user_message="u"
    )
    assert not result.ok
    assert result.transport_metadata["error_class"] == cli_transport.ERROR_CLASS_GENERIC


def test_malformed_usage_shape_is_generic_error():
    stdout_lines = [
        '{"type": "assistant.message", "data": {"content": "hi", "outputTokens": 1}}\n',
        '{"type": "result", "usage": ["not", "a", "dict"]}\n',
    ]
    spawner = FakeSpawner(FakeProcess(stdout_lines=stdout_lines, exit_code=0))
    result = cli_transport.CopilotCliTransport(spawner=spawner).dispatch(
        model_id="m", system_prompt="", user_message="u"
    )
    assert not result.ok
    assert result.transport_metadata["error_class"] == "generic-unknown"


def test_success_path():
    spawner = FakeSpawner(FakeProcess(stdout_lines=SUCCESS_STDOUT_LINES, exit_code=0))
    transport = cli_transport.CopilotCliTransport(spawner=spawner)
    result = transport.dispatch(model_id="m", system_prompt="", user_message="u")

    assert result.ok
    assert result.content == "Hello world"
    assert result.output_tokens == 2
    assert not result.usage_authoritative
    assert result.finish_reason_known
    assert result.content_complete
    assert not result.partial_output_discarded
    assert result.stop_reason == "end_turn"

    meta = result.transport_metadata
    assert meta["error_class"] is None
    assert not meta["retryable"]
    assert meta["exit_code"] == 0
    assert meta["echoed_model"] == "gpt-5.4"
    assert meta["session_id"] == "test-session-id"
    assert meta["premium_requests"] == 1


def test_result_to_dict():
    spawner = FakeSpawner(FakeProcess(stdout_lines=SUCCESS_STDOUT_LINES, exit_code=0))
    transport = cli_transport.CopilotCliTransport(spawner=spawner)
    result = transport.dispatch(model_id="m", system_prompt="", user_message="u")

    d = result.to_dict()
    assert d["ok"]
    assert not d["retryable"]
    assert d["content"] == "Hello world"
    assert d["output_tokens"] == 2
    assert "transport_metadata" in d


# This is the only test that spawns a real, harmless subprocess.
def test_default_spawner():
    argv = [sys.executable, "-c", "import sys; sys.stdout.write('out'); sys.stderr.write('err')"]
    proc = cli_transport.default_spawner(argv, env=None)
    assert isinstance(proc, subprocess.Popen)

    stdout, stderr = proc.communicate(timeout=5)
    assert proc.returncode == 0
    assert stdout == "out"
    assert stderr == "err"


def test_default_spawner_decodes_utf8_bytes_cp1252_cannot():
    # S4 live-dogfood finding: without an explicit encoding, Popen(text=True)
    # decodes with locale.getpreferredencoding() -- cp1252 on this Windows
    # seat -- and the real CLI's UTF-8 JSONL routinely contains bytes
    # (an em dash, "\xe2\x80\x94") that cp1252 cannot decode, which crashed
    # the reader thread mid-stream and left the child blocked on a full pipe
    # (see default_spawner's docstring for the full failure chain). Write
    # the child's stdout via the raw buffer so this test is not itself
    # subject to the parent's console encoding.
    argv = [
        sys.executable, "-c",
        "import sys; sys.stdout.buffer.write('caf\\u2014e'.encode('utf-8'))",
    ]
    proc = cli_transport.default_spawner(argv, env=None)
    stdout, _ = proc.communicate(timeout=5)
    assert proc.returncode == 0
    assert stdout == "caf—e"
