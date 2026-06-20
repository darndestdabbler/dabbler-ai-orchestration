"""Tests for the Set 067 first-party pull-verifier adapter (S1).

Covers the load-bearing invariants from
``docs/session-sets/067-pull-verifier-adapter-experiment-a/tool-contract.md``:
the loop terminates at every cap; sandbox escape is refused; the servant
returns raw ground truth and a summarizing servant is a hard failure; the
verdict is forced to the Set 066 critique-entry shape; the trace records real
tool use; and a zero-probe run is flagged as failed.

No metered API calls: a FakeBinding drives a scripted agentic loop.
"""

from __future__ import annotations

import json
import subprocess
import sys
from types import SimpleNamespace

import pytest

import pull_verifier as pv  # conftest puts ai_router/ on sys.path
import probe_templates as pt
import run_test_sandbox as rts


# --- A minimal router config (no real provider call is ever made here) ------
CONFIG = {
    "providers": {
        "anthropic": {
            "api_key_env": "DABBLER_ANTHROPIC_API_KEY",
            "base_url": "https://example.invalid/messages",
            "api_version": "2023-06-01",
            "timeout_seconds": 5,
        }
    },
    "models": {},  # pricing falls back to _FALLBACK_PRICING for the default model
}


def _tc(name, inp, tid="t1"):
    return pv.NeutralToolCall(id=tid, name=name, input=inp)


def _resp(text="", tool_calls=None, it=10, ot=10, stop="tool_use"):
    return pv.BindingResponse(
        text=text,
        tool_calls=tool_calls or [],
        input_tokens=it,
        output_tokens=ot,
        stop_reason=stop,
    )


class FakeBinding(pv.ProviderBinding):
    """Scripted provider binding - no network. provider_name=anthropic so the
    config/pricing resolution paths are exercised against the real registry."""

    provider_name = "anthropic"

    def __init__(self, queue=None, default=None, force_response=None):
        self.queue = list(queue or [])
        self.default = default
        self.force_response = force_response
        self.force_flags = []

    def request(self, *, force_verdict, **kw):
        self.force_flags.append(force_verdict)
        if force_verdict and self.force_response is not None:
            return self.force_response
        if self.queue:
            return self.queue.pop(0)
        if self.default is not None:
            return self.default
        raise AssertionError("FakeBinding ran out of responses")


@pytest.fixture
def sandbox(tmp_path):
    (tmp_path / "a.py").write_text("alpha\nbeta\ngamma\n", encoding="utf-8")
    (tmp_path / "b.txt").write_text("needle here\nhay\n", encoding="utf-8")
    sub = tmp_path / "sub"
    sub.mkdir()
    (sub / "c.py").write_text("inner\n", encoding="utf-8")
    return tmp_path


# ===========================================================================
# Sandbox confinement
# ===========================================================================


class TestSafe:
    def test_in_sandbox_path_ok(self, sandbox):
        assert pv._safe(sandbox, "a.py") == (sandbox / "a.py").resolve()

    def test_subdir_path_ok(self, sandbox):
        assert pv._safe(sandbox, "sub/c.py") == (sandbox / "sub" / "c.py").resolve()

    def test_dotdot_escape_refused(self, sandbox):
        with pytest.raises(pv.SandboxEscape):
            pv._safe(sandbox, "../outside.txt")

    def test_absolute_escape_refused(self, sandbox, tmp_path):
        outside = tmp_path.parent / "evil.txt"
        with pytest.raises(pv.SandboxEscape):
            pv._safe(sandbox, str(outside))

    def test_empty_path_refused(self, sandbox):
        with pytest.raises(pv.SandboxEscape):
            pv._safe(sandbox, "")


# ===========================================================================
# Deterministic servant returns raw ground truth
# ===========================================================================


class TestServantRawContent:
    def test_read_file_returns_raw_bytes(self, sandbox):
        servant = pv.DeterministicServant()
        r = servant.run("read_file", {"path": "a.py"}, sandbox)
        assert r.raw is True
        assert r.content == "alpha\nbeta\ngamma\n"
        assert r.elided is False

    def test_grep_returns_raw_lines(self, sandbox):
        servant = pv.DeterministicServant()
        r = servant.run("grep", {"pattern": "needle"}, sandbox)
        assert r.raw is True
        assert r.content == "b.txt:1:needle here"

    def test_grep_no_matches(self, sandbox):
        servant = pv.DeterministicServant()
        r = servant.run("grep", {"pattern": "zzzz"}, sandbox)
        assert r.content == "(no matches)"

    def test_grep_rejects_nested_quantifier_redos(self, sandbox):
        # set-067 critique Gemini finding 3 + 0.21.1 R1: catastrophic-
        # backtracking patterns -- including NESTED-group variants -- are
        # rejected as a raw ERROR (not compiled / run), so they cannot hang.
        servant = pv.DeterministicServant()
        for pat in ("(.*)*", "(a+)+", "((a+))+", "(ab(c+)d)+", "(a+)*"):
            r = servant.run("grep", {"pattern": pat}, sandbox)
            assert r.content.startswith("ERROR: "), pat
            assert "nested quantifier" in r.content, pat

    def test_has_nested_quantifier_unit(self):
        f = pv._has_nested_quantifier
        # Catastrophic: an UNBOUNDED quantifier on a body with an unbounded
        # quantifier (incl. nested groups and unbounded {n,}).
        assert f("(a+)+") and f("(.*)*") and f("((a+))+") and f("(ab(c+)d)+")
        assert f("(a+){2,}")   # unbounded {n,} outer
        assert f("(a{2,})+")   # unbounded {n,} in the body
        # Safe (must NOT false-positive): no quantifier in the quantified
        # group's body, BOUNDED reps, quantifier chars literal in a class,
        # escaped parens, and an optional group.
        assert not f("(foo|bar)+")
        assert not f(r"\d+")
        assert not f(r"(\d{3})+")
        assert not f("(a+){2}")      # bounded {n} outer -> allowed (R2)
        assert not f("(ab(c+)d){3}")  # bounded outer on a nested body -> allowed
        assert not f("(a{2,3})+")    # bounded {n,m} body -> allowed
        assert not f("(a+)?")        # optional -> not catastrophic
        assert not f("[*+]+")        # *,+ literal inside the class
        assert not f(r"\(a+\)+")      # escaped parens -> not a group

    def test_grep_rejects_overlong_pattern(self, sandbox):
        servant = pv.DeterministicServant()
        r = servant.run("grep", {"pattern": "a" * (pv._MAX_REGEX_LEN + 1)}, sandbox)
        assert r.content.startswith("ERROR: ")
        assert "too long" in r.content

    def test_grep_allows_normal_quantified_group(self, sandbox):
        # A quantified group whose body has NO quantifier (foo|bar)+ is safe and
        # must NOT be rejected by the heuristic.
        servant = pv.DeterministicServant()
        r = servant.run("grep", {"pattern": "(alpha|beta)+"}, sandbox)
        assert not r.content.startswith("ERROR: ")

    def test_list_dir_marks_directories(self, sandbox):
        servant = pv.DeterministicServant()
        r = servant.run("list_dir", {}, sandbox)
        assert "a.py" in r.content.splitlines()
        assert "sub/" in r.content.splitlines()

    def test_read_missing_file_is_raw_error(self, sandbox):
        servant = pv.DeterministicServant()
        r = servant.run("read_file", {"path": "nope.py"}, sandbox)
        assert r.content.startswith("ERROR: ")
        assert r.raw is True

    def test_escape_is_raw_error_not_crash(self, sandbox):
        servant = pv.DeterministicServant()
        r = servant.run("read_file", {"path": "../x"}, sandbox)
        assert r.content.startswith("ERROR: ")
        assert "escapes sandbox" in r.content

    def test_large_file_is_elided_raw_slice(self, sandbox):
        big = "x" * (pv._RESULT_BYTE_CAP + 500)
        (sandbox / "big.txt").write_text(big, encoding="utf-8")
        servant = pv.DeterministicServant()
        r = servant.run("read_file", {"path": "big.txt"}, sandbox)
        assert r.elided is True
        assert r.content.startswith("x" * 100)  # raw head slice, not a summary
        assert "elided" in r.content
        assert r.bytes_total == len(big)

    def test_elision_caps_bytes_not_chars(self, sandbox):
        # Multibyte content: 'e-acute' is 2 UTF-8 bytes, so this text is ~2x the
        # cap in BYTES while only ~1x in chars. A char-based cap would overshoot.
        text = "é" * pv._RESULT_BYTE_CAP
        (sandbox / "multi.txt").write_text(text, encoding="utf-8")
        servant = pv.DeterministicServant()
        r = servant.run("read_file", {"path": "multi.txt"}, sandbox)
        assert r.elided is True
        head = r.content.split("\n[... elided")[0]
        assert len(head.encode("utf-8")) <= pv._RESULT_BYTE_CAP
        assert r.bytes_total == len(text.encode("utf-8"))


class TestGrepConfinement:
    def test_grep_skips_symlink_to_outside_file(self, sandbox, tmp_path):
        outside = tmp_path.parent / "secret.txt"
        outside.write_text("SECRETTOKEN should not leak\n", encoding="utf-8")
        link = sandbox / "leak.txt"
        try:
            link.symlink_to(outside)
        except (OSError, NotImplementedError):
            pytest.skip("symlinks not permitted on this host")
        servant = pv.DeterministicServant()
        r = servant.run("grep", {"pattern": "SECRETTOKEN"}, sandbox)
        assert "SECRETTOKEN" not in r.content  # outside content never read
        assert r.content == "(no matches)"

    def test_grep_does_not_descend_symlinked_dir(self, sandbox, tmp_path):
        outside_dir = tmp_path.parent / "outside_dir"
        outside_dir.mkdir(exist_ok=True)
        (outside_dir / "hidden.txt").write_text(
            "SECRETTOKEN in dir\n", encoding="utf-8"
        )
        link = sandbox / "linkdir"
        try:
            link.symlink_to(outside_dir, target_is_directory=True)
        except (OSError, NotImplementedError):
            pytest.skip("symlinks not permitted on this host")
        servant = pv.DeterministicServant()
        r = servant.run("grep", {"pattern": "SECRETTOKEN"}, sandbox)
        assert "SECRETTOKEN" not in r.content

    def test_grep_still_finds_real_in_tree_files(self, sandbox):
        servant = pv.DeterministicServant()
        r = servant.run("grep", {"pattern": "inner"}, sandbox)
        assert "sub/c.py:1:inner" in r.content  # real subdir file still walked

    def test_broken_symlink_does_not_abort_grep(self, sandbox):
        # A broken in-tree symlink must be skipped (is_file() False), not read,
        # so it cannot turn the whole recursive grep into an ERROR.
        link = sandbox / "broken.txt"
        try:
            link.symlink_to(sandbox / "nonexistent-target.txt")
        except (OSError, NotImplementedError):
            pytest.skip("symlinks not permitted on this host")
        servant = pv.DeterministicServant()
        r = servant.run("grep", {"pattern": "inner"}, sandbox)
        assert not r.content.startswith("ERROR: ")
        assert "sub/c.py:1:inner" in r.content  # real files still searched


# ===========================================================================
# The deterministic-servant guardrail (anti-bias property)
# ===========================================================================


class _SummarizingServant(pv.DeterministicServant):
    """A BAD servant that paraphrases - must be caught by the guard."""

    def run(self, name, args, sandbox):
        return pv.ToolResult(
            content="(summary: the file looks fine)",
            raw=True,
            elided=False,
            bytes_total=0,
        )


class _NotRawServant(pv.DeterministicServant):
    """A BAD servant that fails to flag its result raw."""

    def run(self, name, args, sandbox):
        gt = pv._CANONICAL[name](sandbox, args)
        return pv.ToolResult(
            content=gt.content, raw=False, elided=gt.elided, bytes_total=0
        )


class _FakeErrorServant(pv.DeterministicServant):
    """A BAD servant that hides readable content behind a fake ERROR prefix."""

    def run(self, name, args, sandbox):
        return pv.ToolResult(
            content="ERROR: (summary disguised as an error)",
            raw=True,
            elided=False,
            bytes_total=0,
        )


class _FabricatedErrorTextServant(pv.DeterministicServant):
    """A BAD servant that injects model text into a genuinely-failing probe."""

    def run(self, name, args, sandbox):
        return pv.ToolResult(
            content="ERROR: model says this file probably has an auth bypass",
            raw=True,
            elided=False,
            bytes_total=0,
        )


class TestServantGuardrail:
    def test_fake_error_over_readable_file_is_hard_failure(self, sandbox):
        bad = _FakeErrorServant()
        r = bad.run("read_file", {"path": "a.py"}, sandbox)
        with pytest.raises(pv.DeterministicServantViolation):
            pv._guard_raw_ground_truth("read_file", {"path": "a.py"}, r, sandbox)

    def test_fabricated_error_text_on_failing_probe_caught(self, sandbox):
        # Even when canonical ALSO fails (missing file), an injected error
        # string must not pass: the error text itself must match ground truth.
        bad = _FabricatedErrorTextServant()
        r = bad.run("read_file", {"path": "missing.py"}, sandbox)
        with pytest.raises(pv.DeterministicServantViolation):
            pv._guard_raw_ground_truth(
                "read_file", {"path": "missing.py"}, r, sandbox
            )

    def test_genuine_error_passes_guard(self, sandbox):
        # An ERROR for a path that canonical also fails on is legitimate.
        good = pv.DeterministicServant()
        r = good.run("read_file", {"path": "missing.py"}, sandbox)
        assert r.content.startswith("ERROR: ")
        pv._guard_raw_ground_truth(
            "read_file", {"path": "missing.py"}, r, sandbox
        )

    def test_summarizing_servant_is_hard_failure(self, sandbox):
        bad = _SummarizingServant()
        r = bad.run("read_file", {"path": "a.py"}, sandbox)
        with pytest.raises(pv.DeterministicServantViolation):
            pv._guard_raw_ground_truth("read_file", {"path": "a.py"}, r, sandbox)

    def test_not_raw_flag_is_hard_failure(self, sandbox):
        bad = _NotRawServant()
        r = bad.run("read_file", {"path": "a.py"}, sandbox)
        with pytest.raises(pv.DeterministicServantViolation):
            pv._guard_raw_ground_truth("read_file", {"path": "a.py"}, r, sandbox)

    def test_good_servant_passes_guard(self, sandbox):
        good = pv.DeterministicServant()
        r = good.run("read_file", {"path": "a.py"}, sandbox)
        pv._guard_raw_ground_truth("read_file", {"path": "a.py"}, r, sandbox)

    def test_summarizing_servant_caught_in_full_loop(self, sandbox):
        binding = FakeBinding(
            queue=[_resp(tool_calls=[_tc("read_file", {"path": "a.py"})])]
        )
        with pytest.raises(pv.DeterministicServantViolation):
            pv.pull_route(
                sandbox,
                "review",
                binding=binding,
                servant=_SummarizingServant(),
                config=CONFIG,
            )


# ===========================================================================
# Forced verdict schema
# ===========================================================================


class TestVerdictSchema:
    def test_valid_verdict_parsed(self):
        c = pv._parse_verdict(
            "anthropic",
            "claude-sonnet-4-6",
            {
                "verdict": "ISSUES_FOUND",
                "summary": "found a bug",
                "findings": [
                    {"description": "off by one", "severity": "major"}
                ],
            },
        )
        assert c.verdict == "ISSUES_FOUND"
        assert c.findings[0].description == "off by one"
        assert c.findings[0].severity == "major"

    def test_missing_verdict_rejected(self):
        with pytest.raises(pv.VerdictSchemaError):
            pv._parse_verdict("anthropic", "m", {"summary": "x"})

    def test_empty_verdict_rejected(self):
        with pytest.raises(pv.VerdictSchemaError):
            pv._parse_verdict("anthropic", "m", {"verdict": "  ", "summary": "x"})

    def test_finding_without_description_rejected(self):
        with pytest.raises(pv.VerdictSchemaError):
            pv._parse_verdict(
                "anthropic",
                "m",
                {"verdict": "V", "summary": "s", "findings": [{"severity": "x"}]},
            )

    def test_trivial_verdict_rejected(self):
        # Empty summary AND no findings -> would fail the Set 066 per-entry rule.
        with pytest.raises(pv.VerdictSchemaError):
            pv._parse_verdict(
                "a", "m", {"verdict": "VERIFIED", "summary": "  ", "findings": []}
            )

    def test_verdict_with_findings_but_no_summary_ok(self):
        # Set 066 allows summary OR findings; findings alone is content-non-trivial.
        c = pv._parse_verdict(
            "a",
            "m",
            {
                "verdict": "ISSUES_FOUND",
                "summary": "",
                "findings": [{"description": "real bug"}],
            },
        )
        assert c.summary == ""
        assert len(c.findings) == 1

    def test_critique_entry_matches_set066_shape(self):
        c = pv._parse_verdict(
            "anthropic",
            "claude-sonnet-4-6",
            {"verdict": "VERIFIED", "summary": "ok", "findings": []},
        )
        entry = c.to_critique_entry()
        assert set(entry) >= {"provider", "model", "verdict", "summary", "findings"}
        assert entry["provider"] == "anthropic"


# ===========================================================================
# The loop driver - termination, caps, trace
# ===========================================================================


class TestLoopTermination:
    def test_probe_then_verdict_is_ok(self, sandbox):
        binding = FakeBinding(
            queue=[
                _resp(tool_calls=[_tc("read_file", {"path": "a.py"})]),
                _resp(
                    tool_calls=[
                        _tc(
                            "submit_verdict",
                            {"verdict": "VERIFIED", "summary": "looks fine"},
                            "v1",
                        )
                    ]
                ),
            ]
        )
        result = pv.pull_route(sandbox, "review", binding=binding, config=CONFIG)
        assert result.ok is True
        assert result.critique.verdict == "VERIFIED"
        assert result.trace.stop_reason == pv.STOP_VERDICT
        assert result.trace.tool_call_count == 1
        assert result.trace.zero_tool_calls is False
        assert result.trace.tool_calls[0].name == "read_file"
        assert result.trace.tool_calls[0].raw is True

    def test_zero_probe_verdict_is_failed_run(self, sandbox):
        binding = FakeBinding(
            queue=[
                _resp(
                    tool_calls=[
                        _tc(
                            "submit_verdict",
                            {"verdict": "VERIFIED", "summary": "no probe"},
                            "v1",
                        )
                    ]
                )
            ]
        )
        result = pv.pull_route(sandbox, "review", binding=binding, config=CONFIG)
        assert result.critique is not None
        assert result.trace.zero_tool_calls is True
        assert result.ok is False  # a verdict with no probe is NOT ok

    def test_text_only_turn_nudges_then_verdict(self, sandbox):
        binding = FakeBinding(
            queue=[
                _resp(text="I think it's fine."),  # no tool use -> nudge
                _resp(tool_calls=[_tc("grep", {"pattern": "needle"})]),
                _resp(
                    tool_calls=[
                        _tc(
                            "submit_verdict",
                            {"verdict": "VERIFIED", "summary": "checked"},
                            "v1",
                        )
                    ]
                ),
            ]
        )
        result = pv.pull_route(sandbox, "review", binding=binding, config=CONFIG)
        assert result.ok is True
        assert result.trace.tool_call_count == 1

    def test_max_turns_without_verdict(self, sandbox):
        # Binding always probes, never submits, ignores force -> max-turns.
        binding = FakeBinding(
            default=_resp(tool_calls=[_tc("read_file", {"path": "a.py"})])
        )
        result = pv.pull_route(
            sandbox,
            "review",
            binding=binding,
            config=CONFIG,
            caps=pv.PullCaps(max_turns=3),
        )
        assert result.critique is None
        assert result.ok is False
        assert result.trace.stop_reason == pv.STOP_MAX_TURNS
        assert result.trace.api_turns == 3

    def test_force_verdict_on_final_turn(self, sandbox):
        # Binding probes by default but honors force on the last turn.
        forced = _resp(
            tool_calls=[
                _tc(
                    "submit_verdict",
                    {"verdict": "ISSUES_FOUND", "summary": "forced"},
                    "v1",
                )
            ]
        )
        binding = FakeBinding(
            default=_resp(tool_calls=[_tc("read_file", {"path": "a.py"})]),
            force_response=forced,
        )
        result = pv.pull_route(
            sandbox,
            "review",
            binding=binding,
            config=CONFIG,
            caps=pv.PullCaps(max_turns=3),
        )
        assert result.ok is True
        assert result.critique.verdict == "ISSUES_FOUND"
        assert result.trace.stop_reason == pv.STOP_VERDICT
        # The last request must have been issued with force_verdict=True.
        assert binding.force_flags[-1] is True

    def test_budget_aware_force_verdict_before_exhaustion(self, sandbox):
        # A verbose prober nears the token budget WITHOUT a verdict. The
        # budget-aware guard must force submit_verdict before the hard ceiling
        # breaks the loop empty (Set 067 S4 dogfood; L-067-1). Reserve-based:
        # budget=100; each probe reports 45+45=90 tokens. turn0 has no prior
        # call (reserve 0) -> not near -> probe (acc 90). turn1: projected =
        # 90 (spent) + 90 (last call reserve) = 180 >= 100 -> force a verdict on
        # turn 1 (NOT the final turn -- max_turns is 10).
        forced = _resp(
            tool_calls=[
                _tc(
                    "submit_verdict",
                    {"verdict": "ISSUES_FOUND", "summary": "forced at budget"},
                    "v1",
                )
            ]
        )
        binding = FakeBinding(
            default=_resp(
                tool_calls=[_tc("read_file", {"path": "a.py"})], it=45, ot=45
            ),
            force_response=forced,
        )
        result = pv.pull_route(
            sandbox,
            "review",
            binding=binding,
            config=CONFIG,
            caps=pv.PullCaps(token_budget=100, max_turns=10),
        )
        # Forced to a verdict by the budget guard, not an empty token-budget stop.
        assert result.trace.stop_reason == pv.STOP_VERDICT
        assert result.ok is True
        assert result.critique.verdict == "ISSUES_FOUND"
        # Turn 0 was a normal probe (not forced); turn 1 was budget-forced. We
        # stopped well before the final turn, so this isolates the budget path.
        assert result.trace.api_turns == 2
        assert binding.force_flags == [False, True]


class TestCaps:
    def test_token_budget_cap(self, sandbox):
        # Over-budget now triggers ONE backstop forced-verdict call before the
        # stop (set-067 critique GPT finding 3). The default FakeBinding ignores
        # the force (no force_response), so that call yields no verdict and the
        # NEXT iteration honors STOP_TOKEN_BUDGET: turn 0 probe (60 tokens) ->
        # turn 1 over-budget backstop (forced) -> turn 2 stop.
        binding = FakeBinding(
            default=_resp(
                tool_calls=[_tc("read_file", {"path": "a.py"})], it=30, ot=30
            )
        )
        result = pv.pull_route(
            sandbox,
            "review",
            binding=binding,
            config=CONFIG,
            caps=pv.PullCaps(token_budget=50, max_turns=10),
        )
        assert result.trace.stop_reason == pv.STOP_TOKEN_BUDGET
        assert result.trace.api_turns == 2  # probe + one backstop forced call
        assert binding.force_flags == [False, True]  # backstop forced the 2nd

    def test_cost_ceiling_cap(self, sandbox):
        # sonnet fallback pricing 3/15 per 1M: 1000 in + 1000 out = $0.018/turn.
        # The ceiling is a POST-HOC stop (tool-contract section 5). Over-ceiling
        # spends ONE backstop forced-verdict call (set-067 critique GPT finding
        # 3), which here yields no verdict (FakeBinding ignores force), so the
        # loop honors STOP_COST_CEILING on the following iteration.
        binding = FakeBinding(
            default=_resp(
                tool_calls=[_tc("read_file", {"path": "a.py"})], it=1000, ot=1000
            )
        )
        result = pv.pull_route(
            sandbox,
            "review",
            binding=binding,
            config=CONFIG,
            caps=pv.PullCaps(cost_ceiling_usd=0.01, max_turns=10),
        )
        assert result.trace.stop_reason == pv.STOP_COST_CEILING
        assert result.trace.api_turns == 2  # probe + one backstop forced call
        assert binding.force_flags == [False, True]

    def test_unknown_tool_call_dispatched_as_error_not_nudge(self, sandbox):
        # set-067 critique Gemini finding 1: an unrecognized tool name must be
        # DISPATCHED to the servant (raw "ERROR: unknown tool ...") so the
        # tool_use is answered, not silently dropped (which left an unanswered
        # tool_use -> provider 400 next turn). Turn 0 emits an unknown tool;
        # turn 1 submits a verdict.
        binding = FakeBinding(
            queue=[
                _resp(tool_calls=[_tc("search_web", {"q": "x"}, "u1")]),
                _resp(
                    tool_calls=[
                        _tc(
                            "submit_verdict",
                            {"verdict": "VERIFIED", "summary": "ok"},
                            "v1",
                        )
                    ]
                ),
            ]
        )
        result = pv.pull_route(sandbox, "review", binding=binding, config=CONFIG)
        assert result.trace.stop_reason == pv.STOP_VERDICT
        unknown = [tc for tc in result.trace.tool_calls if tc.name == "search_web"]
        assert len(unknown) == 1
        assert unknown[0].error is True  # servant returned a raw ERROR result

    def test_truncated_verdict_is_fed_back_not_crash(self, sandbox):
        # set-067 critique Gemini finding 4: a malformed/truncated verdict must
        # not raise out of pull_route. An invalid submit_verdict (no summary and
        # no findings -> trivial) is fed back as an error; the retry succeeds.
        binding = FakeBinding(
            queue=[
                _resp(tool_calls=[_tc("submit_verdict", {"verdict": "VERIFIED"}, "v1")]),
                _resp(
                    tool_calls=[
                        _tc(
                            "submit_verdict",
                            {"verdict": "VERIFIED", "summary": "read a.py; fine"},
                            "v2",
                        )
                    ]
                ),
            ]
        )
        result = pv.pull_route(sandbox, "review", binding=binding, config=CONFIG)
        # No crash; the invalid verdict was fed back and the retry parsed.
        assert result.trace.stop_reason == pv.STOP_VERDICT
        assert result.critique is not None
        assert result.critique.summary == "read a.py; fine"

    def test_multiple_invalid_verdict_calls_all_answered(self, sandbox):
        # set-067 0.21.1 R1: if a turn emits MORE THAN ONE (invalid) verdict
        # call, EVERY one must get a tool_result or the next request 400s.
        class CapturingBinding(pv.ProviderBinding):
            provider_name = "anthropic"

            def __init__(self, queue):
                self.queue = list(queue)
                self.transcripts = []

            def request(self, *, force_verdict, transcript, **kw):
                self.transcripts.append([dict(e) for e in transcript])
                return self.queue.pop(0)

        binding = CapturingBinding(
            [
                _resp(
                    tool_calls=[
                        _tc("submit_verdict", {"verdict": "VERIFIED"}, "v1"),
                        _tc("submit_verdict", {"verdict": "VERIFIED"}, "v2"),
                    ]
                ),
                _resp(
                    tool_calls=[
                        _tc(
                            "submit_verdict",
                            {"verdict": "VERIFIED", "summary": "fine"},
                            "v3",
                        )
                    ]
                ),
            ]
        )
        result = pv.pull_route(sandbox, "review", binding=binding, config=CONFIG)
        assert result.trace.stop_reason == pv.STOP_VERDICT
        # The transcript sent on the 2nd request must answer BOTH v1 and v2.
        second = binding.transcripts[1]
        tool_turns = [e for e in second if e["role"] == "tool"]
        answered = {r["id"] for e in tool_turns for r in e["results"]}
        assert {"v1", "v2"} <= answered

    def test_persistently_invalid_verdict_ends_gracefully(self, sandbox):
        # If every forced verdict is invalid, the loop ends with no verdict
        # (ok=False) rather than raising VerdictSchemaError.
        binding = FakeBinding(
            default=_resp(
                tool_calls=[_tc("submit_verdict", {"verdict": "VERIFIED"}, "v1")]
            )
        )
        result = pv.pull_route(
            sandbox, "review", binding=binding, config=CONFIG,
            caps=pv.PullCaps(max_turns=3),
        )
        assert result.critique is None
        assert result.ok is False  # no crash

    def test_budget_backstop_forces_verdict_on_first_turn_overshoot(self, sandbox):
        # GPT finding 3, reproduced: a single FIRST probe that overshoots the
        # budget previously exited EMPTY (no reserve on turn 0). The backstop
        # now spends one forced-verdict call; with a force_response the model
        # commits a verdict instead of stopping empty.
        forced = _resp(
            tool_calls=[
                _tc(
                    "submit_verdict",
                    {"verdict": "ISSUES_FOUND", "summary": "forced at budget"},
                    "v1",
                )
            ]
        )
        binding = FakeBinding(
            default=_resp(
                tool_calls=[_tc("read_file", {"path": "a.py"})], it=80, ot=80
            ),
            force_response=forced,
        )
        result = pv.pull_route(
            sandbox,
            "review",
            binding=binding,
            config=CONFIG,
            caps=pv.PullCaps(token_budget=100, max_turns=10),
        )
        # turn 0 probe overshoots (160 > 100); turn 1 is the over-budget backstop
        # (forced) and produces the verdict -> STOP_VERDICT, not an empty stop.
        assert result.trace.stop_reason == pv.STOP_VERDICT
        assert result.ok is True
        assert result.critique.verdict == "ISSUES_FOUND"
        assert binding.force_flags == [False, True]

    def test_cost_accounting_accumulates(self, sandbox):
        binding = FakeBinding(
            queue=[
                _resp(
                    tool_calls=[_tc("read_file", {"path": "a.py"})],
                    it=1000,
                    ot=1000,
                ),
                _resp(
                    tool_calls=[
                        _tc(
                            "submit_verdict",
                            {"verdict": "VERIFIED", "summary": "ok"},
                            "v1",
                        )
                    ],
                    it=500,
                    ot=500,
                ),
            ]
        )
        result = pv.pull_route(sandbox, "review", binding=binding, config=CONFIG)
        assert result.trace.input_tokens == 1500
        assert result.trace.output_tokens == 1500
        # (1500*3 + 1500*15) / 1e6 = 0.027
        assert abs(result.trace.cost_usd - 0.027) < 1e-9


class TestTraceInstrumentation:
    def test_trace_records_elided_flag(self, sandbox):
        big = "y" * (pv._RESULT_BYTE_CAP + 100)
        (sandbox / "big.txt").write_text(big, encoding="utf-8")
        binding = FakeBinding(
            queue=[
                _resp(tool_calls=[_tc("read_file", {"path": "big.txt"})]),
                _resp(
                    tool_calls=[
                        _tc(
                            "submit_verdict",
                            {"verdict": "VERIFIED", "summary": "ok"},
                            "v1",
                        )
                    ]
                ),
            ]
        )
        result = pv.pull_route(sandbox, "review", binding=binding, config=CONFIG)
        assert result.trace.tool_calls[0].elided is True

    def test_escaping_probe_records_error(self, sandbox):
        binding = FakeBinding(
            queue=[
                _resp(tool_calls=[_tc("read_file", {"path": "../escape"})]),
                _resp(
                    tool_calls=[
                        _tc(
                            "submit_verdict",
                            {"verdict": "VERIFIED", "summary": "ok"},
                            "v1",
                        )
                    ]
                ),
            ]
        )
        result = pv.pull_route(sandbox, "review", binding=binding, config=CONFIG)
        rec = result.trace.tool_calls[0]
        assert rec.error is True
        assert rec.name == "read_file"
        # The escape was raw-errored, not crashed: the loop still produced a verdict.
        assert result.trace.stop_reason == pv.STOP_VERDICT

    def test_result_serializes_to_dict(self, sandbox):
        binding = FakeBinding(
            queue=[
                _resp(tool_calls=[_tc("read_file", {"path": "a.py"})]),
                _resp(
                    tool_calls=[
                        _tc(
                            "submit_verdict",
                            {"verdict": "VERIFIED", "summary": "ok"},
                            "v1",
                        )
                    ]
                ),
            ]
        )
        result = pv.pull_route(sandbox, "review", binding=binding, config=CONFIG)
        d = result.to_dict()
        # Round-trips through JSON (the CLI / S4 producer relies on this).
        s = json.dumps(d)
        assert json.loads(s)["ok"] is True
        assert d["trace"]["tool_call_count"] == 1


# ===========================================================================
# Provider binding registry + Anthropic wire translation (no network)
# ===========================================================================


class TestPricing:
    def test_pricing_reads_from_config_models(self):
        cfg = {
            "models": {
                "x": {
                    "model_id": "claude-sonnet-4-6",
                    "input_cost_per_1m": 1.0,
                    "output_cost_per_1m": 2.0,
                }
            }
        }
        assert pv._pricing_for("claude-sonnet-4-6", cfg) == (1.0, 2.0)

    def test_pricing_falls_back_when_absent(self):
        assert pv._pricing_for("claude-sonnet-4-6", None) == (3.00, 15.00)

    def test_pricing_uses_config_over_fallback(self, sandbox):
        # pull_route must use config pricing, not the conservative fallback.
        cfg = {
            "providers": {"anthropic": {"api_key_env": "X"}},
            "models": {
                "s": {
                    "model_id": "claude-sonnet-4-6",
                    "input_cost_per_1m": 100.0,
                    "output_cost_per_1m": 100.0,
                }
            },
        }
        binding = FakeBinding(
            queue=[
                _resp(
                    tool_calls=[_tc("read_file", {"path": "a.py"})],
                    it=1000,
                    ot=0,
                ),
                _resp(
                    tool_calls=[
                        _tc(
                            "submit_verdict",
                            {"verdict": "VERIFIED", "summary": "ok"},
                            "v1",
                        )
                    ],
                    it=0,
                    ot=0,
                ),
            ]
        )
        result = pv.pull_route(sandbox, "review", binding=binding, config=cfg)
        # 1000 in-tokens at $100/1M = $0.1 (would be $0.003 on fallback pricing).
        assert abs(result.trace.cost_usd - 0.1) < 1e-9


class TestBindingRegistry:
    def test_anthropic_binding_available(self):
        b = pv._get_binding("anthropic")
        assert isinstance(b, pv.AnthropicBinding)

    def test_openai_binding_available(self):
        b = pv._get_binding("openai")
        assert isinstance(b, pv.OpenAIBinding)

    def test_gemini_binding_available(self):
        b = pv._get_binding("google")
        assert isinstance(b, pv.GeminiBinding)

    def test_unbound_provider_raises(self):
        # cohere has no binding; the registry still raises a clear error.
        with pytest.raises(NotImplementedError):
            pv._get_binding("cohere")

    def test_unknown_provider_raises(self):
        with pytest.raises(NotImplementedError):
            pv._get_binding("nope")


class TestAnthropicWireTranslation:
    def test_to_messages_roundtrips_tool_use(self):
        transcript = [
            {"role": "user", "text": "review"},
            {
                "role": "assistant",
                "text": "let me look",
                "tool_calls": [_tc("read_file", {"path": "a.py"}, "tu1")],
            },
            {
                "role": "tool",
                "results": [
                    {"id": "tu1", "name": "read_file", "content": "alpha"}
                ],
            },
        ]
        msgs = pv.AnthropicBinding._to_messages(transcript)
        assert msgs[0] == {"role": "user", "content": "review"}
        assert msgs[1]["role"] == "assistant"
        assert any(b["type"] == "tool_use" for b in msgs[1]["content"])
        assert msgs[2]["content"][0]["type"] == "tool_result"
        assert msgs[2]["content"][0]["tool_use_id"] == "tu1"

    def test_from_response_extracts_tool_calls_and_usage(self):
        data = {
            "content": [
                {"type": "text", "text": "thinking"},
                {
                    "type": "tool_use",
                    "id": "x",
                    "name": "grep",
                    "input": {"pattern": "p"},
                },
            ],
            "usage": {"input_tokens": 11, "output_tokens": 22},
            "stop_reason": "tool_use",
        }
        r = pv.AnthropicBinding._from_response(data)
        assert r.text == "thinking"
        assert r.tool_calls[0].name == "grep"
        assert r.input_tokens == 11
        assert r.output_tokens == 22

    def test_to_anthropic_tool_shapes_input_schema(self):
        tool = pv._verdict_tool_schema()
        shaped = pv.AnthropicBinding._to_anthropic_tool(tool)
        assert shaped["name"] == "submit_verdict"
        assert "input_schema" in shaped
        assert shaped["input_schema"]["type"] == "object"

    def test_verdict_schema_required_aligns_with_parser(self):
        # Schema requires only 'verdict'; the Set 066 content rule (summary OR
        # findings) is enforced by _parse_verdict, so schema and parser agree.
        tool = pv._verdict_tool_schema()
        assert tool["parameters"]["required"] == ["verdict"]


# ===========================================================================
# pull_route guards
# ===========================================================================


class TestPullRouteGuards:
    def test_missing_sandbox_raises(self, tmp_path):
        with pytest.raises(pv.PullVerifierError):
            pv.pull_route(
                tmp_path / "does-not-exist",
                "review",
                binding=FakeBinding(),
                config=CONFIG,
            )

    def test_result_stamps_provider_and_model(self, sandbox):
        binding = FakeBinding(
            queue=[
                _resp(tool_calls=[_tc("read_file", {"path": "a.py"})]),
                _resp(
                    tool_calls=[
                        _tc(
                            "submit_verdict",
                            {"verdict": "VERIFIED", "summary": "ok"},
                            "v1",
                        )
                    ]
                ),
            ]
        )
        result = pv.pull_route(sandbox, "review", binding=binding, config=CONFIG)
        assert result.provider == "anthropic"
        assert result.model == "claude-sonnet-4-6"
        assert result.critique.provider == "anthropic"
        assert result.critique.model == "claude-sonnet-4-6"


# ===========================================================================
# S2: OpenAI binding wire translation (Chat Completions tool_calls)
# ===========================================================================


# A canned multi-turn neutral transcript reused across binding-parity tests.
PARITY_TRANSCRIPT = [
    {"role": "user", "text": "review the repo"},
    {
        "role": "assistant",
        "text": "let me read it",
        "tool_calls": [pv.NeutralToolCall(id="c1", name="read_file", input={"path": "a.py"})],
    },
    {
        "role": "tool",
        "results": [{"id": "c1", "name": "read_file", "content": "alpha\nbeta"}],
    },
]


class TestOpenAIWireTranslation:
    def test_to_input_items_sends_only_new_non_assistant_entries(self):
        # Assistant turns live server-side (previous_response_id); only the
        # user message + the tool results become input items.
        items, upto = pv.OpenAIBinding._to_input_items(PARITY_TRANSCRIPT, 0)
        assert upto == 3
        assert items[0] == {"role": "user", "content": "review the repo"}
        # the assistant turn is skipped; the tool result becomes a
        # function_call_output keyed by the SAME call_id the model emitted.
        assert items[1] == {
            "type": "function_call_output",
            "call_id": "c1",
            "output": "alpha\nbeta",
        }
        assert len(items) == 2

    def test_to_input_items_resumes_from_offset(self):
        # On turn 2 the binding has already sent transcript[:2]; only the new
        # tool entry at index 2 is translated.
        items, upto = pv.OpenAIBinding._to_input_items(PARITY_TRANSCRIPT, 2)
        assert upto == 3
        assert items == [
            {"type": "function_call_output", "call_id": "c1", "output": "alpha\nbeta"}
        ]

    def test_to_openai_tool_flattens_function(self):
        # Responses API flattens function tools (no nested "function" key).
        tool = pv._verdict_tool_schema()
        shaped = pv.OpenAIBinding._to_openai_tool(tool)
        assert shaped["type"] == "function"
        assert shaped["name"] == "submit_verdict"
        assert shaped["parameters"]["type"] == "object"

    def test_from_response_extracts_function_call_and_usage(self):
        data = {
            "id": "resp_1",
            "output": [
                {
                    "type": "message",
                    "content": [{"type": "output_text", "text": "thinking out loud"}],
                },
                {
                    "type": "function_call",
                    "call_id": "call_42",
                    "name": "grep",
                    "arguments": '{"pattern": "needle"}',
                },
            ],
            "usage": {"input_tokens": 33, "output_tokens": 44},
            "status": "completed",
        }
        r = pv.OpenAIBinding._from_response(data)
        assert r.text == "thinking out loud"
        assert r.tool_calls[0].id == "call_42"
        assert r.tool_calls[0].name == "grep"
        assert r.tool_calls[0].input == {"pattern": "needle"}
        assert r.input_tokens == 33
        assert r.output_tokens == 44
        assert r.stop_reason == "end_turn"

    def test_from_response_maps_incomplete_to_max_tokens(self):
        data = {
            "output": [],
            "usage": {},
            "status": "incomplete",
            "incomplete_details": {"reason": "max_output_tokens"},
        }
        r = pv.OpenAIBinding._from_response(data)
        assert r.stop_reason == "max_tokens"

    def test_from_response_tolerates_bad_arguments_json(self):
        data = {
            "output": [
                {
                    "type": "function_call",
                    "call_id": "c",
                    "name": "grep",
                    "arguments": "{not json",
                }
            ],
            "usage": {},
            "status": "completed",
        }
        r = pv.OpenAIBinding._from_response(data)
        assert r.text == ""
        assert r.tool_calls[0].input == {}  # malformed args -> empty dict, no crash

    def test_request_uses_responses_api_and_chains_previous_id(self, monkeypatch):
        calls = []

        class _Resp:
            def __init__(self, rid):
                self._rid = rid

            def raise_for_status(self):
                pass

            def json(self):
                return {
                    "id": self._rid,
                    "output": [
                        {
                            "type": "message",
                            "content": [{"type": "output_text", "text": "x"}],
                        }
                    ],
                    "usage": {},
                    "status": "completed",
                }

        class _Client:
            def __init__(self, *a, **k):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def post(self, url, headers=None, json=None):
                calls.append({"url": url, "body": json})
                return _Resp(f"resp_{len(calls)}")

        import httpx

        monkeypatch.setattr(httpx, "Client", _Client)
        cfg = {"api_key_env": "DABBLER_OPENAI_API_KEY", "base_url": "https://x.invalid/v1"}
        b = pv.OpenAIBinding()
        # Turn 1.
        b.request(
            system="s",
            transcript=[{"role": "user", "text": "go"}],
            tools=pv._all_tool_schemas(),
            force_verdict=False,
            max_output_tokens=24000,
            model="gpt-5.4",
            config=cfg,
            generation_params={"reasoning_effort": "medium"},
        )
        assert calls[0]["url"].endswith("/responses")
        b0 = calls[0]["body"]
        assert "previous_response_id" not in b0  # first turn has no prior id
        assert b0["max_output_tokens"] == 24000
        assert b0["reasoning"] == {"effort": "medium"}
        assert b0["store"] is True
        # Turn 2 (forced) - chains the prior response id, sends only new items.
        b.request(
            system="s",
            transcript=[
                {"role": "user", "text": "go"},
                {
                    "role": "assistant",
                    "text": "",
                    "tool_calls": [_tc("read_file", {"path": "a.py"}, "c1")],
                },
                {"role": "tool", "results": [{"id": "c1", "name": "read_file", "content": "x"}]},
            ],
            tools=pv._all_tool_schemas(),
            force_verdict=True,
            max_output_tokens=24000,
            model="gpt-5.4",
            config=cfg,
        )
        b1 = calls[1]["body"]
        assert b1["previous_response_id"] == "resp_1"
        # Only the new tool result is resent; the assistant turn is server-side.
        assert b1["input"] == [
            {"type": "function_call_output", "call_id": "c1", "output": "x"}
        ]
        assert b1["tool_choice"] == {"type": "function", "name": "submit_verdict"}

    def test_stateful_offset_advances_across_text_only_nudge(self, monkeypatch):
        # The adversarial path: a text-only assistant turn makes the driver
        # append a user NUDGE (not a tool result). The stateful cursor must
        # advance across that extra user turn and never resend the user msg.
        calls = []

        class _Resp:
            def __init__(self, rid):
                self._rid = rid

            def raise_for_status(self):
                pass

            def json(self):
                return {
                    "id": self._rid,
                    "output": [
                        {"type": "message", "content": [{"type": "output_text", "text": "x"}]}
                    ],
                    "usage": {},
                    "status": "completed",
                }

        class _Client:
            def __init__(self, *a, **k):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def post(self, url, headers=None, json=None):
                calls.append(json)
                return _Resp(f"resp_{len(calls)}")

        import httpx

        monkeypatch.setattr(httpx, "Client", _Client)
        cfg = {"api_key_env": "DABBLER_OPENAI_API_KEY", "base_url": "https://x.invalid/v1"}
        b = pv.OpenAIBinding()
        tools = pv._all_tool_schemas()
        kw = dict(system="s", tools=tools, force_verdict=False, max_output_tokens=100, model="gpt-5.4", config=cfg)
        # Turn 1: initial user message.
        t1 = [{"role": "user", "text": "go"}]
        b.request(transcript=t1, **kw)
        # Turn 2: assistant returned text only -> driver appended a user nudge.
        t2 = t1 + [
            {"role": "assistant", "text": "hmm", "tool_calls": []},
            {"role": "user", "text": "use the tools then submit_verdict"},
        ]
        b.request(transcript=t2, **kw)
        # Turn 3: now a real tool call + result.
        t3 = t2 + [
            {"role": "assistant", "text": "", "tool_calls": [_tc("read_file", {"path": "a.py"}, "c9")]},
            {"role": "tool", "results": [{"id": "c9", "name": "read_file", "content": "alpha"}]},
        ]
        b.request(transcript=t3, **kw)

        # Turn 1 sent the user message, no chaining id.
        assert calls[0]["input"] == [{"role": "user", "content": "go"}]
        assert "previous_response_id" not in calls[0]
        # Turn 2 sent ONLY the nudge (assistant turn is server-side), chained.
        assert calls[1]["input"] == [
            {"role": "user", "content": "use the tools then submit_verdict"}
        ]
        assert calls[1]["previous_response_id"] == "resp_1"
        # Turn 3 sent ONLY the new tool result.
        assert calls[2]["input"] == [
            {"type": "function_call_output", "call_id": "c9", "output": "alpha"}
        ]
        assert calls[2]["previous_response_id"] == "resp_2"

    def test_offset_not_advanced_on_request_failure(self, monkeypatch):
        # Failure-atomicity: a failed request must NOT advance the cursor, so a
        # retry resends the same items rather than skipping them.
        class _Client:
            def __init__(self, *a, **k):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def post(self, url, headers=None, json=None):
                raise RuntimeError("boom")

        import httpx

        monkeypatch.setattr(httpx, "Client", _Client)
        b = pv.OpenAIBinding()
        before = b._sent_upto
        with pytest.raises(RuntimeError):
            b.request(
                system="s",
                transcript=[{"role": "user", "text": "go"}],
                tools=pv._all_tool_schemas(),
                force_verdict=False,
                max_output_tokens=100,
                model="gpt-5.4",
                config={"api_key_env": "DABBLER_OPENAI_API_KEY"},
            )
        assert b._sent_upto == before  # cursor unchanged on failure
        assert b._response_id is None

    def test_offset_not_advanced_on_parse_failure(self, monkeypatch):
        # Failure-atomicity part 2: a malformed-but-JSON response that raises
        # during _from_response() parsing must ALSO leave the cursor untouched
        # (parse-before-commit ordering), so a retry resends, not skips.
        class _Resp:
            def raise_for_status(self):
                pass

            def json(self):
                return {"id": "resp_1", "output": [], "usage": {}, "status": "ok"}

        class _Client:
            def __init__(self, *a, **k):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def post(self, url, headers=None, json=None):
                return _Resp()

        import httpx

        monkeypatch.setattr(httpx, "Client", _Client)
        b = pv.OpenAIBinding()
        # Force the parse step to blow up AFTER json() has returned.
        monkeypatch.setattr(
            b, "_from_response", lambda data: (_ for _ in ()).throw(ValueError("bad"))
        )
        before = b._sent_upto
        with pytest.raises(ValueError):
            b.request(
                system="s",
                transcript=[{"role": "user", "text": "go"}],
                tools=pv._all_tool_schemas(),
                force_verdict=False,
                max_output_tokens=100,
                model="gpt-5.4",
                config={"api_key_env": "DABBLER_OPENAI_API_KEY"},
            )
        assert b._sent_upto == before  # cursor NOT advanced past a parse failure
        assert b._response_id is None

    def test_from_response_skips_non_dict_output_items(self):
        # A null/garbage output item must not crash the parser.
        data = {
            "id": "r",
            "output": [None, {"type": "message", "content": [{"type": "output_text", "text": "ok"}]}],
            "usage": {},
            "status": "completed",
        }
        r = pv.OpenAIBinding._from_response(data)
        assert r.text == "ok"


# ===========================================================================
# S2: Gemini binding wire translation (function_declarations)
# ===========================================================================


class TestGeminiWireTranslation:
    def test_to_contents_roundtrips_function_call_and_response(self):
        contents = pv.GeminiBinding._to_contents(PARITY_TRANSCRIPT)
        assert contents[0] == {"role": "user", "parts": [{"text": "review the repo"}]}
        assert contents[1]["role"] == "model"
        # model turn carries a functionCall part (no id on the wire).
        fc = [p for p in contents[1]["parts"] if "functionCall" in p][0]
        assert fc["functionCall"]["name"] == "read_file"
        assert fc["functionCall"]["args"] == {"path": "a.py"}
        # tool results go back in a user turn as functionResponse parts.
        assert contents[2]["role"] == "user"
        fr = contents[2]["parts"][0]["functionResponse"]
        assert fr["name"] == "read_file"
        assert fr["response"] == {"result": "alpha\nbeta"}

    def test_to_decl_flattens_tool(self):
        tool = pv._verdict_tool_schema()
        decl = pv.GeminiBinding._to_decl(tool)
        assert decl["name"] == "submit_verdict"
        assert decl["parameters"]["type"] == "object"

    def test_from_response_extracts_function_call_and_usage(self):
        data = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": "let me look"},
                            {
                                "functionCall": {
                                    "name": "list_dir",
                                    "args": {"path": "."},
                                }
                            },
                        ]
                    },
                    "finishReason": "STOP",
                }
            ],
            "usageMetadata": {
                "promptTokenCount": 12,
                "candidatesTokenCount": 5,
                "thoughtsTokenCount": 7,
            },
        }
        r = pv.GeminiBinding._from_response(data)
        assert r.text == "let me look"
        assert r.tool_calls[0].name == "list_dir"
        assert r.tool_calls[0].input == {"path": "."}
        assert r.tool_calls[0].id  # a synthesized non-empty id for result routing
        assert r.input_tokens == 12
        # thoughts folded into output so the budget/cost caps see honest spend.
        assert r.output_tokens == 12  # 5 candidates + 7 thoughts
        assert r.stop_reason == "end_turn"

    def test_from_response_maps_max_tokens_finish(self):
        data = {
            "candidates": [{"content": {"parts": []}, "finishReason": "MAX_TOKENS"}],
            "usageMetadata": {},
        }
        r = pv.GeminiBinding._from_response(data)
        assert r.stop_reason == "max_tokens"

    def test_multiple_same_name_calls_get_distinct_ids_and_positional_responses(self):
        # Gemini has no wire id; two read_file calls in one turn must parse to
        # DISTINCT synthesized ids, and their functionResponse parts must go
        # back in the same order (positional matching).
        data = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"functionCall": {"name": "read_file", "args": {"path": "a.py"}}},
                            {"functionCall": {"name": "read_file", "args": {"path": "b.py"}}},
                        ]
                    },
                    "finishReason": "STOP",
                }
            ],
            "usageMetadata": {},
        }
        r = pv.GeminiBinding._from_response(data)
        assert len(r.tool_calls) == 2
        assert r.tool_calls[0].id != r.tool_calls[1].id  # distinct
        assert r.tool_calls[0].input == {"path": "a.py"}
        assert r.tool_calls[1].input == {"path": "b.py"}
        # The driver builds tool results in call order; _to_contents must emit
        # functionResponse parts in that same order.
        transcript = [
            {"role": "user", "text": "go"},
            {
                "role": "assistant",
                "text": "",
                "tool_calls": list(r.tool_calls),
            },
            {
                "role": "tool",
                "results": [
                    {"id": r.tool_calls[0].id, "name": "read_file", "content": "AAA"},
                    {"id": r.tool_calls[1].id, "name": "read_file", "content": "BBB"},
                ],
            },
        ]
        contents = pv.GeminiBinding._to_contents(transcript)
        responses = [
            p["functionResponse"] for p in contents[2]["parts"] if "functionResponse" in p
        ]
        assert [fr["response"]["result"] for fr in responses] == ["AAA", "BBB"]

    def test_gemini3_uses_thinking_level_not_budget(self, monkeypatch):
        captured = {}

        class _Resp:
            def raise_for_status(self):
                pass

            def json(self):
                return {
                    "candidates": [
                        {"content": {"parts": [{"text": "x"}]}, "finishReason": "STOP"}
                    ],
                    "usageMetadata": {},
                }

        class _Client:
            def __init__(self, *a, **k):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def post(self, url, json=None):
                captured["body"] = json
                return _Resp()

        import httpx

        monkeypatch.setattr(httpx, "Client", _Client)
        pv.GeminiBinding().request(
            system="s",
            transcript=[{"role": "user", "text": "go"}],
            tools=pv._all_tool_schemas(),
            force_verdict=False,
            max_output_tokens=24000,
            model="gemini-3-pro",
            config={"api_key_env": "DABBLER_GEMINI_API_KEY", "base_url": "https://g.invalid/v1beta"},
            generation_params={"thinking_level": "high"},
        )
        thinking = captured["body"]["generationConfig"]["thinkingConfig"]
        assert thinking == {"thinkingLevel": "HIGH"}  # uppercased; not thinkingBudget
        assert "thinkingBudget" not in thinking

    def test_force_verdict_sets_tool_config_and_bounded_thinking(self, monkeypatch):
        captured = {}

        class _Resp:
            def raise_for_status(self):
                pass

            def json(self):
                return {
                    "candidates": [
                        {"content": {"parts": [{"text": "x"}]}, "finishReason": "STOP"}
                    ],
                    "usageMetadata": {},
                }

        class _Client:
            def __init__(self, *a, **k):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def post(self, url, json=None):
                captured["url"] = url
                captured["body"] = json
                return _Resp()

        import httpx

        monkeypatch.setattr(httpx, "Client", _Client)
        b = pv.GeminiBinding()
        b.request(
            system="s",
            transcript=[{"role": "user", "text": "go"}],
            tools=pv._all_tool_schemas(),
            force_verdict=True,
            max_output_tokens=24000,
            model="gemini-2.5-pro",
            config={
                "api_key_env": "DABBLER_GEMINI_API_KEY",
                "base_url": "https://g.invalid/v1beta",
            },
            generation_params={"thinking_budget": 8192},
        )
        assert "generateContent" in captured["url"]
        body = captured["body"]
        fcc = body["tool_config"]["function_calling_config"]
        assert fcc["mode"] == "ANY"
        assert fcc["allowed_function_names"] == ["submit_verdict"]
        assert body["generationConfig"]["maxOutputTokens"] == 24000
        assert body["generationConfig"]["thinkingConfig"]["thinkingBudget"] == 8192


# ===========================================================================
# S2: tool-call parity across the three providers
# ===========================================================================


class TestToolCallParity:
    def test_all_bindings_expose_the_same_logical_toolset(self):
        tools = pv._all_tool_schemas()
        names = {t["name"] for t in tools}
        anthropic = {pv.AnthropicBinding._to_anthropic_tool(t)["name"] for t in tools}
        openai = {pv.OpenAIBinding._to_openai_tool(t)["name"] for t in tools}
        gemini = {pv.GeminiBinding._to_decl(t)["name"] for t in tools}
        assert names == anthropic == openai == gemini
        assert names == {"read_file", "grep", "list_dir", "submit_verdict"}

    def test_all_bindings_preserve_tool_parameter_schema(self):
        verdict = pv._verdict_tool_schema()
        a = pv.AnthropicBinding._to_anthropic_tool(verdict)["input_schema"]
        o = pv.OpenAIBinding._to_openai_tool(verdict)["parameters"]
        g = pv.GeminiBinding._to_decl(verdict)["parameters"]
        assert a == o == g == verdict["parameters"]

    def test_all_bindings_parse_the_same_neutral_tool_call(self):
        # Each provider expresses a read_file({path: a.py}) call in its own
        # native response shape; all three _from_response parsers must yield
        # the SAME neutral (name, input) the driver dispatches on.
        anthropic_resp = {
            "content": [
                {"type": "tool_use", "id": "x", "name": "read_file", "input": {"path": "a.py"}}
            ],
            "usage": {"input_tokens": 1, "output_tokens": 1},
            "stop_reason": "tool_use",
        }
        openai_resp = {
            "id": "r",
            "output": [
                {
                    "type": "function_call",
                    "call_id": "x",
                    "name": "read_file",
                    "arguments": '{"path": "a.py"}',
                }
            ],
            "usage": {"input_tokens": 1, "output_tokens": 1},
            "status": "completed",
        }
        gemini_resp = {
            "candidates": [
                {
                    "content": {
                        "parts": [{"functionCall": {"name": "read_file", "args": {"path": "a.py"}}}]
                    },
                    "finishReason": "STOP",
                }
            ],
            "usageMetadata": {"promptTokenCount": 1, "candidatesTokenCount": 1},
        }
        a = pv.AnthropicBinding._from_response(anthropic_resp).tool_calls[0]
        o = pv.OpenAIBinding._from_response(openai_resp).tool_calls[0]
        g = pv.GeminiBinding._from_response(gemini_resp).tool_calls[0]
        assert (a.name, a.input) == ("read_file", {"path": "a.py"})
        assert (o.name, o.input) == ("read_file", {"path": "a.py"})
        assert (g.name, g.input) == ("read_file", {"path": "a.py"})


# ===========================================================================
# S2: executor config block resolution (router-config.yaml pull_verifier:)
# ===========================================================================


class TestExecutorConfig:
    def test_caps_from_config_reads_block(self):
        cfg = {
            "pull_verifier": {
                "caps": {
                    "max_turns": 20,
                    "max_output_tokens": 24000,
                    "token_budget": 500000,
                    "cost_ceiling_usd": 2.5,
                }
            }
        }
        caps = pv.caps_from_config(cfg)
        assert caps.max_turns == 20
        assert caps.max_output_tokens == 24000
        assert caps.token_budget == 500000
        assert caps.cost_ceiling_usd == 2.5

    def test_caps_from_config_falls_back_to_defaults(self):
        # No block at all -> the exact S1 PullCaps defaults (backward compatible).
        caps = pv.caps_from_config({})
        assert caps == pv.PullCaps()

    def test_caps_from_config_partial_block_merges_defaults(self):
        caps = pv.caps_from_config({"pull_verifier": {"caps": {"max_turns": 3}}})
        assert caps.max_turns == 3
        assert caps.max_output_tokens == pv.PullCaps().max_output_tokens

    def test_resolve_model_reads_executor_pin(self):
        cfg = {"pull_verifier": {"models": {"openai": "gpt-5.4-mini"}}}
        assert pv._resolve_model("openai", None, cfg) == "gpt-5.4-mini"

    def test_resolve_model_explicit_wins_over_pin(self):
        cfg = {"pull_verifier": {"models": {"openai": "gpt-5.4-mini"}}}
        assert pv._resolve_model("openai", "gpt-5.4", cfg) == "gpt-5.4"

    def test_resolve_model_falls_back_to_default_models(self):
        assert pv._resolve_model("google", None, {}) == "gemini-2.5-pro"

    def test_resolve_gen_params_reads_block(self):
        cfg = {
            "pull_verifier": {
                "generation_params": {"openai": {"reasoning_effort": "high"}}
            }
        }
        assert pv._resolve_gen_params("openai", cfg) == {"reasoning_effort": "high"}

    def test_resolve_gen_params_empty_when_absent(self):
        assert pv._resolve_gen_params("openai", {}) == {}

    def test_real_router_config_resolves_executor_block(self):
        # The shipped router-config.yaml must carry a valid pull_verifier block
        # with all three provider pins + caps that the resolvers can read.
        cfg = pv._load_router_config()
        block = pv._executor_block(cfg)
        assert block, "router-config.yaml is missing the pull_verifier block"
        assert set(block["models"]) == {"anthropic", "openai", "google"}
        caps = pv.caps_from_config(cfg)
        # The shipped caps bump max_output_tokens for GPT-5.4 reasoning headroom.
        assert caps.max_output_tokens >= 24000
        for prov in ("anthropic", "openai", "google"):
            assert pv._resolve_model(prov, None, cfg)


# ===========================================================================
# Set 068: run_test tool wiring (offered only when caged; dispatched to the
# cage, not the read-only servant; recorded as a real probe)
# ===========================================================================


class _ToolCapturingBinding(FakeBinding):
    """A FakeBinding that records the tool NAMES offered on each turn."""

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.tools_seen = []

    def request(self, *, force_verdict, **kw):
        self.tools_seen.append([t["name"] for t in kw["tools"]])
        return super().request(force_verdict=force_verdict, **kw)


_VERDICT_OK = _resp(
    tool_calls=[
        _tc("submit_verdict", {"verdict": "VERIFIED", "summary": "ok"}, "v1")
    ]
)


class TestRunTestWiring:
    def test_not_offered_without_config(self, sandbox):
        # Default (Set 067) loop: run_test must NOT appear in the offered tools.
        b = _ToolCapturingBinding(
            queue=[_resp(tool_calls=[_tc("read_file", {"path": "a.py"})]),
                   _VERDICT_OK]
        )
        result = pv.pull_route(sandbox, "review", binding=b, config=CONFIG)
        assert result.ok is True
        assert all("run_test" not in names for names in b.tools_seen)

    def test_offered_and_dispatched_to_cage(self, sandbox, monkeypatch):
        # With a RunTestConfig, run_test is offered AND dispatched to the cage
        # (NOT the read-only servant), recorded as a real probe (raw=True).
        calls = []

        def fake_dispatch(cfg, args):
            calls.append((cfg, args))
            return ("exit_code=0\n--- output ---\nTEST OK", False, False, None)

        monkeypatch.setattr(pv, "_dispatch_run_test", fake_dispatch)
        verdict = _resp(
            tool_calls=[
                _tc("submit_verdict",
                    {"verdict": "VERIFIED", "summary": "tests pass"}, "v1")
            ]
        )
        b = _ToolCapturingBinding(
            queue=[_resp(tool_calls=[_tc("run_test", {}, "rt1")]), verdict]
        )
        rt_cfg = pv.RunTestConfig(
            repo_root=str(sandbox), ref="HEAD", command=("pytest", "-q")
        )
        result = pv.pull_route(
            sandbox, "review", binding=b, config=CONFIG, run_test_config=rt_cfg
        )
        assert "run_test" in b.tools_seen[0]
        assert len(calls) == 1  # the cage was invoked exactly once
        assert result.ok is True
        # run_test counts as a real probe, so this is NOT a zero_tool_calls run.
        assert result.trace.tool_call_count == 1
        assert result.trace.zero_tool_calls is False
        rec = result.trace.tool_calls[0]
        assert rec.name == "run_test"
        assert rec.raw is True
        assert rec.error is False

    def test_cage_error_recorded_as_error_probe(self, sandbox, monkeypatch):
        def fake_dispatch(cfg, args):
            return ("ERROR: run_test cage: not a git repository", True, False, None)

        monkeypatch.setattr(pv, "_dispatch_run_test", fake_dispatch)
        b = FakeBinding(
            queue=[_resp(tool_calls=[_tc("run_test", {}, "rt1")]), _VERDICT_OK]
        )
        rt_cfg = pv.RunTestConfig(
            repo_root=str(sandbox), ref="HEAD", command=("pytest", "-q")
        )
        result = pv.pull_route(
            sandbox, "review", binding=b, config=CONFIG, run_test_config=rt_cfg
        )
        assert result.ok is True
        rec = result.trace.tool_calls[0]
        assert rec.name == "run_test"
        assert rec.error is True  # cage error surfaced as a raw ERROR probe

    def test_dispatch_resolves_named_command(self):
        # _dispatch_run_test passes the resolved argv to the cage; a bad name
        # falls back to the default command (RunTestConfig.resolve).
        cfg = pv.RunTestConfig(
            repo_root=".", ref="HEAD",
            command=("default", "cmd"),
            commands={"unit": ("pytest", "-q")},
        )
        assert cfg.resolve(None) == ("default", "cmd")
        assert cfg.resolve("unit") == ("pytest", "-q")
        assert cfg.resolve("missing") == ("default", "cmd")


# ===========================================================================
# Set 069 S2: get_diff tool (raw unified diff; offered only when configured;
# dispatched to git directly, recorded as a real probe)
# ===========================================================================


def _make_git_repo(repo):
    """A throwaway one-commit git repo for diff/cage tests."""
    repo.mkdir(parents=True, exist_ok=True)

    def _git(*args):
        subprocess.run(
            ["git", "-C", str(repo), *args], check=True, capture_output=True
        )

    _git("init", "-q")
    _git("config", "user.email", "t@example.invalid")
    _git("config", "user.name", "Test")
    (repo / "hello.txt").write_text("hi\n", encoding="utf-8")
    _git("add", "-A")
    _git("commit", "-q", "-m", "init")
    return repo


class TestGetDiffWiring:
    def test_not_offered_without_config(self, sandbox):
        b = _ToolCapturingBinding(
            queue=[_resp(tool_calls=[_tc("read_file", {"path": "a.py"})]),
                   _VERDICT_OK]
        )
        pv.pull_route(sandbox, "review", binding=b, config=CONFIG)
        assert all("get_diff" not in names for names in b.tools_seen)

    def test_offered_and_dispatched(self, sandbox, monkeypatch):
        def fake_dispatch(cfg):
            return ("[changed paths]\nx.py\n[unified diff]\n+new", False, False)

        monkeypatch.setattr(pv, "_dispatch_get_diff", fake_dispatch)
        b = _ToolCapturingBinding(
            queue=[_resp(tool_calls=[_tc("get_diff", {}, "g1")]), _VERDICT_OK]
        )
        diff_cfg = pv.DiffConfig(repo_root=str(sandbox), base_ref="HEAD")
        result = pv.pull_route(
            sandbox, "review", binding=b, config=CONFIG, diff_config=diff_cfg
        )
        assert "get_diff" in b.tools_seen[0]
        assert result.ok is True
        rec = result.trace.tool_calls[0]
        assert rec.name == "get_diff" and rec.raw is True and rec.error is False

    def test_dispatch_real_repo_shows_diff(self, tmp_path):
        repo = _make_git_repo(tmp_path / "repo")
        (repo / "hello.txt").write_text("hi\nthere\n", encoding="utf-8")
        cfg = pv.DiffConfig(repo_root=str(repo), base_ref="HEAD")
        content, is_error, _elided = pv._dispatch_get_diff(cfg)
        assert is_error is False
        assert "[changed paths]" in content and "hello.txt" in content
        assert "[unified diff]" in content and "+there" in content

    def test_dispatch_bad_ref_is_raw_error(self, tmp_path):
        repo = _make_git_repo(tmp_path / "repo")
        cfg = pv.DiffConfig(repo_root=str(repo), base_ref="no-such-ref-xyz")
        content, is_error, _elided = pv._dispatch_get_diff(cfg)
        assert is_error is True and content.startswith("ERROR: get_diff:")

    def test_diff_config_range(self):
        assert pv.DiffConfig("r", "BASE")._range() == ("BASE",)
        assert pv.DiffConfig("r", "BASE", "HEAD")._range() == ("BASE..HEAD",)
        assert pv.DiffConfig("r", "BASE", paths=("a.py",))._range() == (
            "BASE", "--", "a.py",
        )


# ===========================================================================
# Set 069 S2: run_test execution capture + evidence-protocol tagging
# (orchestrator-applied tier; pristine-replay-backed; never agent-self-granted)
# ===========================================================================


def _exec(command_id="default", name="", argv=("pytest", "-q"),
          exit_code=1, raw_output="FAILED test_x"):
    # Each execution carries its OWN replay context (Set 069 S3): repo_root / ref
    # / caps from the lane that ran it, so _build_transcript stamps a real
    # pinnedRef and _run_pristine_replay (when not faked) targets the right tree.
    return pv._Execution(
        command_id=command_id, requested_name=name, argv=tuple(argv),
        exit_code=exit_code, raw_output=raw_output,
        repo_root=".", ref="HEAD",
    )


def _fake_replay(output, *, ran=True, error=None, removed=True, exit_code=1):
    return SimpleNamespace(
        ran=ran, error=error, worktree_removed=removed,
        exit_code=exit_code, output=output,
    )


def _crit(findings):
    return pv.PullCritique(
        provider="openai", model="gpt-5.4", verdict="ISSUES_FOUND",
        summary="s", findings=tuple(findings),
    )


class TestRunTestConfigResolveId:
    def test_resolve_id_default_named_and_unknown(self):
        cfg = pv.RunTestConfig(
            repo_root=".", ref="HEAD", command=("d", "cmd"),
            commands={"unit": ("pytest",)},
        )
        assert cfg.resolve_id(None) == "default"
        assert cfg.resolve_id("unit") == "unit"
        # An UNKNOWN name falls back to the default COMMAND -> id "default", never
        # the unmatched string (the false-commandId guard).
        assert cfg.resolve_id("missing") == "default"


class TestDispatchRunTestExecutionCapture:
    def test_clean_run_captures_execution(self, tmp_path):
        repo = _make_git_repo(tmp_path / "repo")
        cfg = pv.RunTestConfig(
            repo_root=str(repo), ref="HEAD",
            command=(sys.executable, "-c", "print('hi'); raise SystemExit(0)"),
        )
        content, is_error, _elided, execution = pv._dispatch_run_test(cfg, {})
        assert is_error is False
        assert execution is not None
        assert execution.command_id == "default"
        assert execution.exit_code == 0
        assert "hi" in execution.raw_output

    def test_unknown_name_captures_resolved_default_id(self, tmp_path):
        # GPT-5.4 S2 R1 finding 1: an UNKNOWN name silently runs the DEFAULT
        # command; the captured command_id MUST be the resolved trusted id
        # ("default"), NOT the model's unmatched string - else a false commandId
        # could back a REPRODUCED claim.
        repo = _make_git_repo(tmp_path / "repo")
        cfg = pv.RunTestConfig(
            repo_root=str(repo), ref="HEAD",
            command=(sys.executable, "-c", "print('ran default')"),
            commands={"unit": (sys.executable, "-c", "print('unit')")},
        )
        _c, _e, _el, execution = pv._dispatch_run_test(cfg, {"name": "missing"})
        assert execution is not None
        assert execution.command_id == "default"  # NOT "missing"
        assert "ran default" in execution.raw_output

    def test_cage_error_captures_no_execution(self, tmp_path):
        # Not a git repo -> cage error -> no execution can back a reproduction.
        cfg = pv.RunTestConfig(
            repo_root=str(tmp_path), ref="HEAD", command=("echo", "x")
        )
        content, is_error, _elided, execution = pv._dispatch_run_test(cfg, {})
        assert is_error is True and execution is None


class TestStampEvidenceTiers:
    def test_reproduced_conferred_on_matching_clean_replay(self, monkeypatch):
        monkeypatch.setattr(
            pv, "_run_pristine_replay",
            lambda ex: _fake_replay(ex.raw_output),  # replay matches
        )
        crit = _crit([pv.Finding(description="bug", severity="Major")])
        payload = {"findings": [
            {"description": "bug", "evidenceTier": "REPRODUCED",
             "commandId": "default"}
        ]}
        out = pv._stamp_evidence_tiers(crit, payload, [_exec()])
        f = out.findings[0]
        assert f.evidence_tier == pv.EVIDENCE_REPRODUCED
        assert f.transcript is not None
        assert f.transcript["entrypoint"]["kind"] == pv.ENTRYPOINT_TEST
        # The stamped transcript is a VALID falsifier per the S1 protocol.
        ok, reasons = __import__("evidence_protocol").validate_transcript(
            f.transcript
        )
        assert ok, reasons

    def test_reproduced_collapses_when_replay_mismatches(self, monkeypatch):
        monkeypatch.setattr(
            pv, "_run_pristine_replay",
            lambda ex: _fake_replay("DIFFERENT OUTPUT"),  # mismatch
        )
        crit = _crit([pv.Finding(description="bug")])
        payload = {"findings": [
            {"description": "bug", "evidenceTier": "REPRODUCED",
             "commandId": "default"}
        ]}
        out = pv._stamp_evidence_tiers(crit, payload, [_exec()])
        # Collapsed to a read-claim: no tier field, no transcript.
        assert out.findings[0].evidence_tier == ""
        assert out.findings[0].transcript is None

    def test_reproduced_collapses_when_no_execution(self, monkeypatch):
        monkeypatch.setattr(
            pv, "_run_pristine_replay",
            lambda ex: _fake_replay(ex.raw_output),
        )
        crit = _crit([pv.Finding(description="bug")])
        payload = {"findings": [
            {"description": "bug", "evidenceTier": "REPRODUCED",
             "commandId": "default"}
        ]}
        out = pv._stamp_evidence_tiers(crit, payload, [])  # no runs
        assert out.findings[0].evidence_tier == ""

    def test_reproduced_collapses_when_commandid_unknown(self, monkeypatch):
        monkeypatch.setattr(
            pv, "_run_pristine_replay",
            lambda ex: _fake_replay(ex.raw_output),
        )
        crit = _crit([pv.Finding(description="bug")])
        payload = {"findings": [
            {"description": "bug", "evidenceTier": "REPRODUCED",
             "commandId": "nope"}  # not among the executions
        ]}
        out = pv._stamp_evidence_tiers(crit, payload, [_exec()])
        assert out.findings[0].evidence_tier == ""

    def test_hypothesis_preserved(self):
        crit = _crit([pv.Finding(description="maybe")])
        payload = {"findings": [
            {"description": "maybe", "evidenceTier": "HYPOTHESIS"}
        ]}
        out = pv._stamp_evidence_tiers(crit, payload, [])
        assert out.findings[0].evidence_tier == pv.EVIDENCE_HYPOTHESIS
        assert out.findings[0].transcript is None

    def test_untagged_stays_asserted_default(self):
        crit = _crit([pv.Finding(description="read claim")])
        payload = {"findings": [{"description": "read claim"}]}
        out = pv._stamp_evidence_tiers(crit, payload, [])
        # No on-disk field -> byte-identical to a pre-069 entry.
        assert out.findings[0].evidence_tier == ""
        assert "evidenceTier" not in out.findings[0].to_dict()

    def test_unknown_name_claim_collapses(self, monkeypatch):
        # End of the finding-1 chain: dispatch captured command_id="default" (an
        # unknown name ran the default), but the agent claims commandId="missing"
        # -> no match -> collapse, even with a clean matching replay available.
        monkeypatch.setattr(
            pv, "_run_pristine_replay",
            lambda ex: _fake_replay(ex.raw_output),
        )
        crit = _crit([pv.Finding(description="bug")])
        payload = {"findings": [
            {"description": "bug", "evidenceTier": "REPRODUCED",
             "commandId": "missing"}  # the unmatched name the model passed
        ]}
        out = pv._stamp_evidence_tiers(
            crit, payload, [_exec(command_id="default")]
        )
        assert out.findings[0].evidence_tier == ""

    def test_verdict_schema_evidence_fields_gated(self):
        # GPT-5.4 S2 R1 finding 2: the read-only verdict schema must NOT advertise
        # evidenceTier / commandId (byte-for-byte the pre-069 surface); they
        # appear only when the run_test lane is active (allow_evidence=True).
        ro = pv._verdict_tool_schema()
        props = ro["parameters"]["properties"]["findings"]["items"]["properties"]
        assert "evidenceTier" not in props and "commandId" not in props
        ex = pv._verdict_tool_schema(allow_evidence=True)
        eprops = ex["parameters"]["properties"]["findings"]["items"]["properties"]
        assert "evidenceTier" in eprops and "commandId" in eprops

    def test_no_config_loop_offers_pre069_verdict_schema(self, sandbox):
        # The no-config loop's offered submit_verdict carries no evidence fields.
        b = _ToolCapturingBinding(
            queue=[_resp(tool_calls=[_tc("read_file", {"path": "a.py"})]),
                   _VERDICT_OK]
        )

        class _SchemaCapturingBinding(_ToolCapturingBinding):
            def request(self, *, force_verdict, **kw):
                self.tool_schemas = kw["tools"]
                return FakeBinding.request(self, force_verdict=force_verdict, **kw)

        b2 = _SchemaCapturingBinding(
            queue=[_resp(tool_calls=[_tc("read_file", {"path": "a.py"})]),
                   _VERDICT_OK]
        )
        pv.pull_route(sandbox, "review", binding=b2, config=CONFIG)
        verdict_schema = [
            t for t in b2.tool_schemas if t["name"] == "submit_verdict"
        ][0]
        props = (
            verdict_schema["parameters"]["properties"]["findings"]["items"]
            ["properties"]
        )
        assert "evidenceTier" not in props

    def test_agent_cannot_self_grant_without_run_test_config(
        self, sandbox, monkeypatch
    ):
        # Even if the model PROPOSES REPRODUCED, with NO run_test_config the
        # loop never stamps (no execution lane) -> the finding stays a read-claim.
        verdict = _resp(tool_calls=[_tc("submit_verdict", {
            "verdict": "ISSUES_FOUND", "summary": "s",
            "findings": [{"description": "bug", "evidenceTier": "REPRODUCED",
                          "commandId": "default"}],
        }, "v1")])
        b = FakeBinding(
            queue=[_resp(tool_calls=[_tc("read_file", {"path": "a.py"})]),
                   verdict]
        )
        result = pv.pull_route(sandbox, "review", binding=b, config=CONFIG)
        assert result.ok
        assert result.critique.findings[0].evidence_tier == ""


class TestEvidenceTierEndToEnd:
    def test_run_test_reproduced_flows_to_critique_entry(
        self, sandbox, monkeypatch
    ):
        # A run_test that reproduces a defect + a matching pristine replay ->
        # the critique entry carries evidenceTier=REPRODUCED + a valid transcript
        # that the Set 066 artifact validator (S1-extended) accepts.
        def fake_dispatch(cfg, args):
            return ("exit_code=1\n--- output ---\nAssertionError", False, False,
                    _exec(raw_output="AssertionError"))

        monkeypatch.setattr(pv, "_dispatch_run_test", fake_dispatch)
        monkeypatch.setattr(
            pv, "_run_pristine_replay",
            lambda ex: _fake_replay("AssertionError"),
        )
        verdict = _resp(tool_calls=[_tc("submit_verdict", {
            "verdict": "ISSUES_FOUND", "summary": "a real bug",
            "findings": [{"description": "off-by-one", "severity": "Major",
                          "category": "correctness",
                          "evidenceTier": "REPRODUCED", "commandId": "default"}],
        }, "v1")])
        b = FakeBinding(
            queue=[_resp(tool_calls=[_tc("run_test", {}, "rt1")]), verdict]
        )
        rt_cfg = pv.RunTestConfig(
            repo_root=str(sandbox), ref="HEAD", command=("pytest", "-q")
        )
        result = pv.pull_route(
            sandbox, "review", binding=b, config=CONFIG, run_test_config=rt_cfg
        )
        assert result.ok
        entry = result.critique.to_critique_entry()
        f0 = entry["findings"][0]
        assert f0["evidenceTier"] == "REPRODUCED"
        assert f0["transcript"]["commandId"] == "default"

        # The artifact built from this entry passes the real Set 066 validator.
        from path_aware_critique import validate_path_aware_critique_artifact
        artifact = {
            "schemaVersion": 1,
            "sessionSetName": "069-x",
            "pathAwareCritique": "required",
            "critiques": [
                entry,
                {"provider": "google", "model": "gemini-2.5-pro",
                 "verdict": "VERIFIED", "summary": "ok", "findings": []},
            ],
        }
        res = validate_path_aware_critique_artifact(artifact)
        assert res.ok, res.reasons


# ===========================================================================
# Set 069 S3: the probe-template lane (run_probe_template) - offered only when
# configured; dispatched to the cage; templateId evidence flows through S1.
# ===========================================================================


def _probe_run(template_id="malformed_artifact_bytes", args=None,
               argv=None, exit_code=1, output="PROBE_RESULT: reproduced: ..."):
    template = pt.BUILTIN_PROBE_TEMPLATES[template_id]
    args = {"corruption": "invalid-utf8"} if args is None else args
    argv = pt.build_probe_argv(template_id, args) if argv is None else argv
    result = SimpleNamespace(
        ran=True, error=None, worktree_removed=True, exit_code=exit_code,
        output=output,
    )
    return pt.ProbeRun(template=template, args=args, argv=argv, result=result)


_PT_CFG = pt.ProbeTemplateConfig(repo_root=".", ref="HEAD")


class TestRunProbeTemplateWiring:
    def test_not_offered_without_config(self, sandbox):
        b = _ToolCapturingBinding(
            queue=[_resp(tool_calls=[_tc("read_file", {"path": "a.py"})]),
                   _VERDICT_OK]
        )
        pv.pull_route(sandbox, "review", binding=b, config=CONFIG)
        assert all("run_probe_template" not in names for names in b.tools_seen)

    def test_offered_and_dispatched_to_cage(self, sandbox, monkeypatch):
        calls = []

        def fake_dispatch(cfg, args):
            calls.append((cfg, args))
            return ("exit_code=1\n--- output ---\nPROBE_RESULT: robust", False,
                    False, None)

        monkeypatch.setattr(pv, "_dispatch_run_probe_template", fake_dispatch)
        verdict = _resp(tool_calls=[
            _tc("submit_verdict", {"verdict": "VERIFIED", "summary": "probed"}, "v1")
        ])
        b = _ToolCapturingBinding(
            queue=[_resp(tool_calls=[
                _tc("run_probe_template",
                    {"templateId": "malformed_artifact_bytes",
                     "args": {"corruption": "invalid-utf8"}}, "p1")]),
                   verdict]
        )
        result = pv.pull_route(
            sandbox, "review", binding=b, config=CONFIG,
            probe_template_config=_PT_CFG,
        )
        assert "run_probe_template" in b.tools_seen[0]
        assert len(calls) == 1
        assert result.ok is True
        rec = result.trace.tool_calls[0]
        assert rec.name == "run_probe_template" and rec.raw is True
        assert rec.error is False

    def test_template_error_recorded_as_error_probe(self, sandbox, monkeypatch):
        monkeypatch.setattr(
            pv, "_dispatch_run_probe_template",
            lambda cfg, args: (
                "ERROR: run_probe_template: unknown templateId 'x'", True,
                False, None),
        )
        b = FakeBinding(
            queue=[_resp(tool_calls=[
                _tc("run_probe_template", {"templateId": "x"}, "p1")]),
                   _VERDICT_OK]
        )
        result = pv.pull_route(
            sandbox, "review", binding=b, config=CONFIG,
            probe_template_config=_PT_CFG,
        )
        assert result.ok is True
        assert result.trace.tool_calls[0].error is True


class TestVerdictSchemaTemplateGating:
    def test_template_lane_offers_templateid_not_commandid(self):
        sch = pv._verdict_tool_schema(allow_template_evidence=True)
        props = sch["parameters"]["properties"]["findings"]["items"]["properties"]
        assert "evidenceTier" in props and "templateId" in props
        assert "commandId" not in props

    def test_both_lanes_offer_both_ids(self):
        sch = pv._verdict_tool_schema(
            allow_evidence=True, allow_template_evidence=True
        )
        props = sch["parameters"]["properties"]["findings"]["items"]["properties"]
        assert {"evidenceTier", "commandId", "templateId"} <= set(props)

    def test_no_lane_offers_neither(self):
        props = (pv._verdict_tool_schema()["parameters"]["properties"]
                 ["findings"]["items"]["properties"])
        assert "templateId" not in props and "commandId" not in props


class TestDispatchRunProbeTemplate:
    def test_clean_run_builds_template_execution(self, monkeypatch):
        run = _probe_run(args={"corruption": "invalid-utf8"})
        monkeypatch.setattr(
            pt, "run_probe_template",
            lambda cfg, tid, raw: (run.result.output, False, False, run),
        )
        content, is_error, _elided, execution = pv._dispatch_run_probe_template(
            _PT_CFG,
            {"templateId": "malformed_artifact_bytes",
             "args": {"corruption": "invalid-utf8"}},
        )
        assert is_error is False and execution is not None
        assert execution.kind == "template"
        assert execution.template_id == "malformed_artifact_bytes"
        assert execution.template_args == {"corruption": "invalid-utf8"}
        assert execution.entrypoint_kind == pt.ENTRYPOINT_PUBLIC_API
        assert execution.match_id == "malformed_artifact_bytes"

    def test_error_run_captures_no_execution(self, monkeypatch):
        monkeypatch.setattr(
            pt, "run_probe_template",
            lambda cfg, tid, raw: ("ERROR: ...", True, False, None),
        )
        _c, is_error, _el, execution = pv._dispatch_run_probe_template(
            _PT_CFG, {"templateId": "nope"}
        )
        assert is_error is True and execution is None


class TestTemplateEvidenceEndToEnd:
    def test_template_reproduced_flows_to_critique_entry(
        self, sandbox, monkeypatch
    ):
        run = _probe_run(output="PROBE_RESULT: reproduced: raised UnicodeDecodeError")

        def fake_dispatch(cfg, args):
            return (run.result.output, False, False, pv._Execution(
                command_id="", requested_name="", argv=tuple(run.argv),
                exit_code=run.result.exit_code, raw_output=run.result.output,
                kind="template", template_id=run.template.template_id,
                template_args=dict(run.args),
                entrypoint_kind=run.template.entrypoint_kind,
                entrypoint_ref=run.template.entrypoint_ref,
                repo_root=".", ref="HEAD",
            ))

        monkeypatch.setattr(pv, "_dispatch_run_probe_template", fake_dispatch)
        monkeypatch.setattr(
            pv, "_run_pristine_replay",
            lambda ex: _fake_replay(ex.raw_output),
        )
        verdict = _resp(tool_calls=[_tc("submit_verdict", {
            "verdict": "ISSUES_FOUND", "summary": "a real crash",
            "findings": [{"description": "validator crashes on bad bytes",
                          "severity": "Major", "category": "correctness",
                          "evidenceTier": "REPRODUCED",
                          "templateId": "malformed_artifact_bytes"}],
        }, "v1")])
        b = FakeBinding(queue=[
            _resp(tool_calls=[_tc("run_probe_template", {
                "templateId": "malformed_artifact_bytes",
                "args": {"corruption": "invalid-utf8"}}, "p1")]),
            verdict,
        ])
        result = pv.pull_route(
            sandbox, "review", binding=b, config=CONFIG,
            probe_template_config=_PT_CFG,
        )
        assert result.ok
        entry = result.critique.to_critique_entry()
        f0 = entry["findings"][0]
        assert f0["evidenceTier"] == "REPRODUCED"
        assert f0["transcript"]["templateId"] == "malformed_artifact_bytes"
        assert f0["transcript"]["entrypoint"]["kind"] == pt.ENTRYPOINT_PUBLIC_API
        assert f0["transcript"]["args"] == {"corruption": "invalid-utf8"}

        # The S1 protocol accepts the templateId falsifier...
        from evidence_protocol import validate_transcript
        ok, reasons = validate_transcript(f0["transcript"])
        assert ok, reasons
        # ...and the Set 066 artifact built from it validates.
        from path_aware_critique import validate_path_aware_critique_artifact
        artifact = {
            "schemaVersion": 1, "sessionSetName": "069-x",
            "pathAwareCritique": "required",
            "critiques": [entry, {"provider": "google",
                                  "model": "gemini-2.5-pro", "verdict": "VERIFIED",
                                  "summary": "ok", "findings": []}],
        }
        assert validate_path_aware_critique_artifact(artifact).ok

    def test_template_build_transcript_branch(self, monkeypatch):
        # Unit: _build_transcript emits a templateId (not commandId) transcript
        # for a template-kind execution, with the template's public entrypoint.
        monkeypatch.setattr(
            pv, "_run_pristine_replay",
            lambda ex: _fake_replay(ex.raw_output),
        )
        ex = pv._Execution(
            command_id="", requested_name="",
            argv=("python", "-m", "ai_router.probe_templates"),
            exit_code=1, raw_output="PROBE_RESULT: reproduced",
            kind="template", template_id="malformed_artifact_bytes",
            template_args={"corruption": "invalid-utf8"},
            entrypoint_kind=pt.ENTRYPOINT_PUBLIC_API,
            entrypoint_ref="ai_router.path_aware_critique.x",
        )
        t = pv._build_transcript(ex)
        assert t["templateId"] == "malformed_artifact_bytes"
        assert "commandId" not in t
        assert t["entrypoint"] == {
            "kind": pt.ENTRYPOINT_PUBLIC_API,
            "ref": "ai_router.path_aware_critique.x",
        }
        assert t["args"] == {"corruption": "invalid-utf8"}


class TestEvidenceLaneMatching:
    """Set 069 S3 (GPT-5.4 finding 2): commandId / templateId resolve per lane."""

    def _tmpl_ex(self, tid, output="PROBE_RESULT: reproduced"):
        return pv._Execution(
            command_id="", requested_name="",
            argv=("python", "-m", "ai_router.probe_templates"),
            exit_code=1, raw_output=output, kind="template", template_id=tid,
            template_args={"corruption": "invalid-utf8"},
            entrypoint_kind=pt.ENTRYPOINT_PUBLIC_API,
            entrypoint_ref="ai_router.path_aware_critique.x",
            repo_root=".", ref="HEAD",
        )

    def _cmd_ex(self, cid, output="FAILED test_x"):
        return pv._Execution(
            command_id=cid, requested_name=("" if cid == "default" else cid),
            argv=("pytest", "-q"), exit_code=1, raw_output=output,
            repo_root=".", ref="HEAD",
        )

    def test_both_ids_collapse_to_read_claim(self, monkeypatch):
        # A finding naming BOTH a commandId and a templateId is ambiguous -> the
        # orchestrator must not guess a lane; collapse to a read-claim.
        monkeypatch.setattr(
            pv, "_run_pristine_replay", lambda ex: _fake_replay(ex.raw_output)
        )
        crit = _crit([pv.Finding(description="bug")])
        payload = {"findings": [{"description": "bug", "evidenceTier": "REPRODUCED",
                                 "commandId": "shared", "templateId": "shared"}]}
        out = pv._stamp_evidence_tiers(
            crit, payload, [self._cmd_ex("shared"), self._tmpl_ex("shared")]
        )
        assert out.findings[0].evidence_tier == ""

    def test_commandid_does_not_bind_template_execution(self, monkeypatch):
        # A command id colliding with a template id must bind to the COMMAND
        # execution only. Here ONLY a template execution exists with id "shared";
        # a commandId="shared" claim must NOT match it -> collapse.
        monkeypatch.setattr(
            pv, "_run_pristine_replay", lambda ex: _fake_replay(ex.raw_output)
        )
        crit = _crit([pv.Finding(description="bug")])
        payload = {"findings": [{"description": "bug", "evidenceTier": "REPRODUCED",
                                 "commandId": "shared"}]}
        out = pv._stamp_evidence_tiers(crit, payload, [self._tmpl_ex("shared")])
        assert out.findings[0].evidence_tier == ""

    def test_templateid_binds_template_lane_when_ids_collide(self, monkeypatch):
        # With BOTH lanes' executions sharing the id "shared", a templateId claim
        # binds the TEMPLATE execution (its public_api entrypoint), never the
        # command one.
        monkeypatch.setattr(
            pv, "_run_pristine_replay", lambda ex: _fake_replay(ex.raw_output)
        )
        crit = _crit([pv.Finding(description="bug")])
        payload = {"findings": [{"description": "bug", "evidenceTier": "REPRODUCED",
                                 "templateId": "shared"}]}
        out = pv._stamp_evidence_tiers(
            crit, payload, [self._cmd_ex("shared"), self._tmpl_ex("shared")]
        )
        f = out.findings[0]
        assert f.evidence_tier == pv.EVIDENCE_REPRODUCED
        assert f.transcript["templateId"] == "shared"
        assert f.transcript["entrypoint"]["kind"] == pt.ENTRYPOINT_PUBLIC_API

    def test_replay_uses_executions_own_repo_and_ref(self, monkeypatch):
        # GPT-5.4 S3 R2 finding 1: each execution replays against ITS OWN captured
        # repo/ref, never a shared cfg. Build a template execution pinned to a
        # DIFFERENT repo/ref than the command lane and confirm the replay (and the
        # transcript pinnedRef) use the TEMPLATE execution's own context.
        seen = {}

        def fake_cage(repo_root, ref, argv, *, caps=None):
            seen["repo_root"] = repo_root
            seen["ref"] = ref
            return _fake_replay("PROBE_RESULT: reproduced")

        monkeypatch.setattr(rts, "run_test_in_cage", fake_cage)
        ex = pv._Execution(
            command_id="", requested_name="",
            argv=("python", "-m", "ai_router.probe_templates"),
            exit_code=1, raw_output="PROBE_RESULT: reproduced", kind="template",
            template_id="malformed_artifact_bytes",
            entrypoint_kind=pt.ENTRYPOINT_PUBLIC_API, entrypoint_ref="ai_router.x",
            repo_root="/tmpl-repo", ref="tmpl-ref",
        )
        t = pv._build_transcript(ex)
        assert seen == {"repo_root": "/tmpl-repo", "ref": "tmpl-ref"}
        assert t["pinnedRef"] == "tmpl-ref"


# ===========================================================================
# Set 069 S4: the Podman model-authored-probe lane (run_authored_probe).
# Offered only when configured; dispatched to the Podman cage (faked here);
# a MODEL-AUTHORED probe can NEVER mint REPRODUCED - it caps at HYPOTHESIS.
# ===========================================================================

import podman_sandbox as _ps  # noqa: E402

_PODMAN_CFG = pv.PodmanLaneConfig(repo_root=".")


def _fake_podman_result(*, exit_code=1, probe_output="PROBE_RESULT: reproduced",
                        removed=True, error=None, ran=True):
    return _ps.PodmanResult(
        ran=ran, exit_code=exit_code, timed_out=False,
        probe_output=probe_output, runtime_diagnostics="WARN: ignored cap",
        wall_seconds=1.5, container_removed=removed, image="img",
        image_digest_pinned=False, resource_caps_enforced=False,
        argv=("podman", "run"), error=error,
    )


class TestDefaultTriage:
    def test_proceeds_on_a_real_probe(self):
        assert pv.default_triage(
            "import ai_router; print('PROBE_RESULT: x')", "a Major bug"
        ) is None

    def test_rejects_empty_body_and_missing_claim(self):
        assert "empty probe body" in pv.default_triage("", "claim")
        assert "severity-gated" in pv.default_triage("import ai_router", "")

    def test_rejects_probe_not_touching_code_under_review(self):
        # meta-oracle: a freestanding harness that never imports ai_router.
        assert "meta-oracle" in pv.default_triage("print(1+1)", "Major bug")

    def test_escalates_an_escape_attempt(self):
        r = pv.default_triage("import ai_router\nimport socket", "Major bug")
        assert r and r.startswith("ESCALATE:")


class TestRunAuthoredProbeWiring:
    def test_not_offered_without_config(self, sandbox):
        b = _ToolCapturingBinding(
            queue=[_resp(tool_calls=[_tc("read_file", {"path": "a.py"})]),
                   _VERDICT_OK]
        )
        pv.pull_route(sandbox, "review", binding=b, config=CONFIG)
        assert all("run_authored_probe" not in names for names in b.tools_seen)

    def test_offered_and_dispatched_to_cage(self, sandbox, monkeypatch):
        calls = []

        def fake_dispatch(cfg, args):
            calls.append((cfg, args))
            return ("probeId=authored-abc\n--- output ---\nok", False, False, None)

        monkeypatch.setattr(pv, "_dispatch_run_authored_probe", fake_dispatch)
        verdict = _resp(tool_calls=[_tc(
            "submit_verdict", {"verdict": "VERIFIED", "summary": "probed"}, "v1")])
        b = _ToolCapturingBinding(queue=[
            _resp(tool_calls=[_tc("run_authored_probe", {
                "probe": "import ai_router", "entrypointRef": "ai_router.x",
                "claim": "Major"}, "p1")]),
            verdict,
        ])
        result = pv.pull_route(
            sandbox, "review", binding=b, config=CONFIG,
            podman_lane_config=_PODMAN_CFG,
        )
        assert "run_authored_probe" in b.tools_seen[0]
        assert len(calls) == 1 and result.ok is True
        rec = result.trace.tool_calls[0]
        assert rec.name == "run_authored_probe" and rec.raw is True


class TestDispatchRunAuthoredProbe:
    def test_reproduced_builds_authored_execution(self, monkeypatch):
        monkeypatch.setattr(
            _ps, "run_probe_in_container", lambda *a, **k: _fake_podman_result()
        )
        content, is_error, _el, ex = pv._dispatch_run_authored_probe(
            _PODMAN_CFG,
            {"probe": "import ai_router",
             "entrypointRef": "ai_router.contract_gate.x",
             "entrypointKind": "public_api", "claim": "Major crash"},
        )
        assert is_error is False and ex is not None
        assert ex.kind == "authored"
        assert ex.probe_id.startswith("authored-")
        assert ex.entrypoint_ref == "ai_router.contract_gate.x"
        assert ex.replay_matched is True  # second run reproduced same output
        assert ex.match_id == ex.probe_id
        assert "probeId=" in content and "HYPOTHESIS" in content

    def test_robust_probe_captures_no_execution(self, monkeypatch):
        monkeypatch.setattr(
            _ps, "run_probe_in_container",
            lambda *a, **k: _fake_podman_result(exit_code=0, probe_output="ok"),
        )
        _c, _e, _el, ex = pv._dispatch_run_authored_probe(
            _PODMAN_CFG,
            {"probe": "import ai_router", "entrypointRef": "ai_router.x",
             "claim": "Major"},
        )
        assert ex is None

    def test_missing_entrypoint_is_an_error_before_the_cage(self, monkeypatch):
        ran = []
        monkeypatch.setattr(
            _ps, "run_probe_in_container",
            lambda *a, **k: ran.append(1) or _fake_podman_result(),
        )
        content, is_error, _el, ex = pv._dispatch_run_authored_probe(
            _PODMAN_CFG, {"probe": "import ai_router", "claim": "Major"}
        )
        assert is_error and ex is None and not ran
        assert "entrypointRef" in content

    def test_bad_entrypoint_kind_is_an_error(self, monkeypatch):
        monkeypatch.setattr(
            _ps, "run_probe_in_container", lambda *a, **k: _fake_podman_result()
        )
        content, is_error, _el, ex = pv._dispatch_run_authored_probe(
            _PODMAN_CFG,
            {"probe": "import ai_router", "entrypointRef": "ai_router.x",
             "entrypointKind": "agent_harness", "claim": "Major"},
        )
        assert is_error and ex is None and "agent_harness" in content

    def test_triage_rejection_skips_the_cage(self, monkeypatch):
        ran = []
        monkeypatch.setattr(
            _ps, "run_probe_in_container",
            lambda *a, **k: ran.append(1) or _fake_podman_result(),
        )
        content, is_error, _el, ex = pv._dispatch_run_authored_probe(
            _PODMAN_CFG,
            {"probe": "import ai_router", "entrypointRef": "ai_router.x",
             "claim": ""},
        )
        assert is_error and ex is None and not ran
        assert "triage" in content


class TestAuthoredEvidenceCapsAtHypothesis:
    def _authored_ex(self, probe_id="authored-deadbeef"):
        return pv._Execution(
            command_id="", requested_name="", argv=("python", "-B", "-c", "x"),
            exit_code=1, raw_output="PROBE_RESULT: reproduced", kind="authored",
            entrypoint_kind="public_api", entrypoint_ref="ai_router.x",
            probe_id=probe_id, probe_body="import ai_router", replay_matched=True,
            repo_root=".", ref="HEAD",
        )

    def test_authored_build_transcript_is_none(self):
        # A model-authored probe is never a trusted falsifier.
        assert pv._build_transcript(self._authored_ex()) is None

    def test_reproduced_claim_with_probeid_caps_at_hypothesis(self):
        crit = _crit([pv.Finding(description="bug", severity="Major")])
        payload = {"findings": [{"description": "bug",
                                 "evidenceTier": "REPRODUCED",
                                 "probeId": "authored-deadbeef"}]}
        out = pv._stamp_evidence_tiers(crit, payload, [self._authored_ex()])
        f = out.findings[0]
        # DOWNGRADED from a REPRODUCED claim to HYPOTHESIS (executed but
        # model-authored), NOT minted REPRODUCED and NOT a bare read-claim.
        assert f.evidence_tier == pv.EVIDENCE_HYPOTHESIS
        assert f.transcript is None

    def test_sole_authored_run_cannot_mint_reproduced(self):
        crit = _crit([pv.Finding(description="bug")])
        payload = {"findings": [{"description": "bug",
                                 "evidenceTier": "REPRODUCED"}]}
        out = pv._stamp_evidence_tiers(crit, payload, [self._authored_ex()])
        assert out.findings[0].evidence_tier == pv.EVIDENCE_HYPOTHESIS

    def test_authored_probeid_does_not_cross_bind_a_command_lane(self):
        cmd_ex = pv._Execution(
            command_id="default", requested_name="", argv=("pytest",),
            exit_code=1, raw_output="x", repo_root=".", ref="HEAD",
        )
        crit = _crit([pv.Finding(description="bug")])
        payload = {"findings": [{"description": "bug",
                                 "evidenceTier": "REPRODUCED",
                                 "probeId": "authored-deadbeef"}]}
        # probeId names an authored run that did NOT happen -> not has_probe ->
        # only an unnamed command run exists -> collapses to a read-claim.
        out = pv._stamp_evidence_tiers(crit, payload, [cmd_ex])
        assert out.findings[0].evidence_tier == ""


class TestVerdictSchemaAuthoredGating:
    def test_authored_lane_offers_probeid(self):
        props = (pv._verdict_tool_schema(allow_authored_evidence=True)
                 ["parameters"]["properties"]["findings"]["items"]["properties"])
        assert "evidenceTier" in props and "probeId" in props
        assert "commandId" not in props and "templateId" not in props

    def test_no_lane_offers_no_probeid(self):
        props = (pv._verdict_tool_schema()["parameters"]["properties"]
                 ["findings"]["items"]["properties"])
        assert "probeId" not in props
