"""Tests for the Set 069 S3 probe-template lane (ai_router.probe_templates).

Covers: typed-arg validation (accept / reject), the operator-authored driver
probes in-process against the REAL public entrypoints (both the robust and the
reproduced directions), the in-cage driver CLI exit codes, the cage-backed runner
(with a faked cage), and the deterministic argv builder.

No metered calls; no real model loop. The one place the cage is exercised is via
a faked ``run_test_in_cage`` so no real worktree is created.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

import probe_templates as pt  # conftest puts ai_router/ on sys.path
import path_aware_critique as pac
import run_test_sandbox as rts


def _resolved_module(name: str):
    """The module ``probe_templates._import_under_review`` resolves for ``name``.

    In the test context both ``ai_router.<name>`` and the bare ``<name>`` are
    importable as DISTINCT module objects; the driver prefers the ``ai_router.``
    form, so a monkeypatch must target that exact object to be seen. In the cage
    only the worktree's ``ai_router`` exists, so this ambiguity is test-only.
    """
    try:
        return __import__(f"ai_router.{name}", fromlist=["_"])
    except ImportError:  # pragma: no cover - pure bare context
        return __import__(name, fromlist=["_"])


# ---------------------------------------------------------------------------
# Typed-arg validation
# ---------------------------------------------------------------------------


_OPTIONAL_TPL = pt.ProbeTemplate(
    template_id="t_opt",
    version="1",
    description="synthetic template with mixed arg types",
    entrypoint_kind=pt.ENTRYPOINT_PUBLIC_API,
    entrypoint_ref="ai_router.x.y",
    arg_specs=(
        pt.ArgSpec("s", pt.ARG_STRING),
        pt.ArgSpec("n", pt.ARG_INT, required=False),
        pt.ArgSpec("b", pt.ARG_BOOL, required=False),
        pt.ArgSpec("e", pt.ARG_ENUM, required=False, choices=("a", "b")),
    ),
)


class TestValidateTemplateArgs:
    def test_valid_args_coerced(self):
        coerced, errors = pt.validate_template_args(
            _OPTIONAL_TPL, {"s": "x", "n": 3, "b": True, "e": "a"}
        )
        assert errors == []
        assert coerced == {"s": "x", "n": 3, "b": True, "e": "a"}

    def test_missing_required_is_error(self):
        coerced, errors = pt.validate_template_args(_OPTIONAL_TPL, {"n": 1})
        assert any("missing required arg 's'" in e for e in errors)

    def test_optional_absent_is_ok(self):
        coerced, errors = pt.validate_template_args(_OPTIONAL_TPL, {"s": "x"})
        assert errors == []
        assert coerced == {"s": "x"}

    def test_none_args_treated_as_empty(self):
        # A template with only optional args may be called with no args at all.
        only_opt = pt.ProbeTemplate(
            "t2", "1", "d", pt.ENTRYPOINT_PUBLIC_API, "a.b",
            arg_specs=(pt.ArgSpec("n", pt.ARG_INT, required=False),),
        )
        coerced, errors = pt.validate_template_args(only_opt, None)
        assert errors == [] and coerced == {}

    def test_non_dict_args_rejected(self):
        _coerced, errors = pt.validate_template_args(_OPTIONAL_TPL, ["s", "x"])
        assert any("args must be an object" in e for e in errors)

    def test_wrong_string_type_rejected(self):
        _c, errors = pt.validate_template_args(_OPTIONAL_TPL, {"s": 5})
        assert any("must be a string" in e for e in errors)

    def test_int_rejects_bool(self):
        # bool is an int subclass; the validator must reject it for an int arg.
        _c, errors = pt.validate_template_args(
            _OPTIONAL_TPL, {"s": "x", "n": True}
        )
        assert any("'n' must be an integer" in e for e in errors)

    def test_bool_requires_bool(self):
        _c, errors = pt.validate_template_args(
            _OPTIONAL_TPL, {"s": "x", "b": 1}
        )
        assert any("'b' must be a boolean" in e for e in errors)

    def test_enum_membership_enforced(self):
        _c, errors = pt.validate_template_args(
            _OPTIONAL_TPL, {"s": "x", "e": "z"}
        )
        assert any("'e' must be one of" in e for e in errors)

    def test_unknown_arg_rejected(self):
        _c, errors = pt.validate_template_args(
            _OPTIONAL_TPL, {"s": "x", "bogus": 1}
        )
        assert any("unknown arg 'bogus'" in e for e in errors)


# ---------------------------------------------------------------------------
# The operator-authored driver probes (in-process, against REAL entrypoints)
# ---------------------------------------------------------------------------


class TestMalformedArtifactProbe:
    @pytest.mark.parametrize("corruption", ["invalid-utf8", "truncated-json", "empty"])
    def test_robust_against_fixed_validator(self, corruption):
        # The fixed validate_path_aware_critique_artifact returns a not-ok result
        # (never raises) on malformed bytes -> the probe reports robust (exit 0).
        code, line = pt._probe_malformed_artifact_bytes({"corruption": corruption})
        assert code == pt.PROBE_ROBUST_EXIT
        assert line.startswith("robust:")

    def test_reproduces_when_validator_raises(self, monkeypatch):
        # Simulate the pre-fix behavior: the entrypoint raises on bad bytes ->
        # the probe classifies it reproduced (exit 1), naming only the exception
        # TYPE (deterministic, no addresses) so a replay reproduces the hash.
        def raising(_path):
            raise UnicodeDecodeError("utf-8", b"\xff", 0, 1, "invalid start byte")

        # Patch the EXACT module _import_under_review resolves (in the test
        # context both ai_router.X and the bare X are importable as distinct
        # module objects; in the cage only the worktree's ai_router exists).
        monkeypatch.setattr(
            _resolved_module("path_aware_critique"),
            "validate_path_aware_critique_artifact",
            raising,
        )
        code, line = pt._probe_malformed_artifact_bytes(
            {"corruption": "invalid-utf8"}
        )
        assert code == pt.PROBE_REPRODUCED_EXIT
        assert "reproduced" in line and "UnicodeDecodeError" in line


class TestBadParentDirProbe:
    @pytest.mark.parametrize("mode", ["nonexistent", "file-as-dir"])
    def test_robust_against_fixed_cage(self, mode):
        # The fixed run_test_in_cage returns a clean error result (never raises)
        # when mkdtemp cannot create under the bad parent -> robust (exit 0). No
        # nested worktree is created (mkdtemp fails before git worktree add).
        code, line = pt._probe_bad_parent_dir({"parent_mode": mode})
        assert code == pt.PROBE_ROBUST_EXIT
        assert line.startswith("robust:") and "ran=False" in line

    def test_reproduces_when_cage_raises(self, monkeypatch):
        def raising(*a, **k):
            raise OSError("mkdtemp escaped")

        monkeypatch.setattr(
            _resolved_module("run_test_sandbox"), "run_test_in_cage", raising
        )
        code, line = pt._probe_bad_parent_dir({"parent_mode": "nonexistent"})
        assert code == pt.PROBE_REPRODUCED_EXIT
        assert "reproduced" in line and "OSError" in line


# ---------------------------------------------------------------------------
# The in-cage driver CLI (python -m ai_router.probe_templates --run ...)
# ---------------------------------------------------------------------------


class TestDriverMain:
    def test_valid_run_prints_result_and_exit(self, capsys):
        code = pt._driver_main(
            ["--run", "malformed_artifact_bytes", '{"corruption": "empty"}']
        )
        out = capsys.readouterr().out.strip()
        assert code == pt.PROBE_ROBUST_EXIT
        assert out.startswith(pt.PROBE_RESULT_PREFIX)

    def test_unknown_template_is_error_exit(self, capsys):
        code = pt._driver_main(["--run", "no_such_template", "{}"])
        assert code == pt.PROBE_ERROR_EXIT
        assert "unknown template" in capsys.readouterr().out

    def test_bad_json_args_is_error_exit(self, capsys):
        code = pt._driver_main(["--run", "malformed_artifact_bytes", "{not json"])
        assert code == pt.PROBE_ERROR_EXIT
        assert "not valid JSON" in capsys.readouterr().out

    def test_invalid_args_is_error_exit(self, capsys):
        code = pt._driver_main(
            ["--run", "malformed_artifact_bytes", '{"corruption": "bogus"}']
        )
        assert code == pt.PROBE_ERROR_EXIT
        assert "invalid args" in capsys.readouterr().out

    def test_bad_usage_is_error_exit(self, capsys):
        code = pt._driver_main(["--wrong"])
        assert code == pt.PROBE_ERROR_EXIT


# ---------------------------------------------------------------------------
# The cage-backed runner (faked cage; no real worktree)
# ---------------------------------------------------------------------------


def _fake_result(*, ran=True, error=None, removed=True, exit_code=1,
                 output="PROBE_RESULT: robust: ..."):
    return SimpleNamespace(
        ran=ran, error=error, worktree_removed=removed, exit_code=exit_code,
        output=output,
        render=lambda: (output if not error else f"ERROR: run_test cage: {error}"),
    )


_CFG = pt.ProbeTemplateConfig(repo_root=".", ref="HEAD")


class TestRunProbeTemplate:
    def test_unknown_template_is_raw_error_no_run(self):
        content, is_error, _elided, run = pt.run_probe_template(
            _CFG, "no_such", {}
        )
        assert is_error is True and run is None
        assert content.startswith("ERROR: run_probe_template: unknown templateId")

    def test_invalid_args_is_raw_error_no_run(self, monkeypatch):
        # Invalid args must NOT reach the cage.
        called = []
        monkeypatch.setattr(
            rts, "run_test_in_cage", lambda *a, **k: called.append(1)
        )
        content, is_error, _elided, run = pt.run_probe_template(
            _CFG, "malformed_artifact_bytes", {"corruption": "bogus"}
        )
        assert is_error is True and run is None and not called
        assert "invalid args" in content

    def test_clean_run_captures_probe_run(self, monkeypatch):
        captured = {}

        def fake_cage(repo_root, ref, command, *, caps=None):
            captured["argv"] = tuple(command)
            captured["repo_root"] = repo_root
            captured["ref"] = ref
            return _fake_result(output="PROBE_RESULT: reproduced: ...", exit_code=1)

        monkeypatch.setattr(rts, "run_test_in_cage", fake_cage)
        content, is_error, _elided, run = pt.run_probe_template(
            _CFG, "malformed_artifact_bytes", {"corruption": "invalid-utf8"}
        )
        assert is_error is False and run is not None
        assert run.template.template_id == "malformed_artifact_bytes"
        assert run.args == {"corruption": "invalid-utf8"}
        # The argv is the deterministic, trusted probe-driver invocation.
        assert captured["argv"] == pt.build_probe_argv(
            "malformed_artifact_bytes", {"corruption": "invalid-utf8"}
        )
        assert captured["ref"] == "HEAD"

    def test_cage_error_captures_no_run(self, monkeypatch):
        monkeypatch.setattr(
            rts, "run_test_in_cage",
            lambda *a, **k: _fake_result(ran=False, error="not a git repo"),
        )
        content, is_error, _elided, run = pt.run_probe_template(
            _CFG, "bad_parent_dir", {"parent_mode": "nonexistent"}
        )
        assert run is None  # a cage error cannot back a reproduction
        assert is_error is True

    def test_robust_exit0_run_not_captured(self, monkeypatch):
        # A clean ROBUST run (exit 0 -> NO defect) must NOT back a reproduction,
        # even though its output replays deterministically (GPT-5.4 S3 finding 1).
        monkeypatch.setattr(
            rts, "run_test_in_cage",
            lambda *a, **k: _fake_result(exit_code=pt.PROBE_ROBUST_EXIT,
                                         output="PROBE_RESULT: robust: ..."),
        )
        _c, is_error, _el, run = pt.run_probe_template(
            _CFG, "malformed_artifact_bytes", {"corruption": "invalid-utf8"}
        )
        assert run is None and is_error is False

    def test_probe_error_exit2_not_captured_and_flagged(self, monkeypatch):
        # A probe-internal error (exit 2) ran cleanly but could not perform its
        # check -> no reproduction AND surfaced as an error tool result.
        monkeypatch.setattr(
            rts, "run_test_in_cage",
            lambda *a, **k: _fake_result(exit_code=pt.PROBE_ERROR_EXIT,
                                         output="PROBE_RESULT: error: ..."),
        )
        _c, is_error, _el, run = pt.run_probe_template(
            _CFG, "malformed_artifact_bytes", {"corruption": "invalid-utf8"}
        )
        assert run is None and is_error is True

    def test_teardown_leak_captures_no_run(self, monkeypatch):
        # A clean exit but a teardown leak must NOT back a reproduction.
        monkeypatch.setattr(
            rts, "run_test_in_cage",
            lambda *a, **k: _fake_result(removed=False),
        )
        _c, _e, _el, run = pt.run_probe_template(
            _CFG, "bad_parent_dir", {"parent_mode": "nonexistent"}
        )
        assert run is None


class TestBuildProbeArgv:
    def test_argv_is_deterministic_and_sorted(self):
        argv = pt.build_probe_argv("tid", {"b": 2, "a": 1})
        assert argv[1:5] == ("-m", "ai_router.probe_templates", "--run", "tid")
        # sort_keys makes the JSON arg stable regardless of input dict order.
        assert json.loads(argv[5]) == {"a": 1, "b": 2}
        assert argv[5] == '{"a": 1, "b": 2}'


class TestProbeTemplateConfig:
    def test_defaults_to_builtin_library(self):
        cfg = pt.ProbeTemplateConfig(repo_root=".", ref="HEAD")
        assert set(cfg.templates) == set(pt.BUILTIN_PROBE_TEMPLATES)
        assert cfg.get("malformed_artifact_bytes") is not None
        assert cfg.get("nope") is None
        assert cfg.get(None) is None


class TestSeedLibraryContract:
    def test_every_template_drives_a_public_entrypoint(self):
        # Meta-oracle: no seed template may drive an agent harness; each names a
        # real PUBLIC entrypoint and has a matching driver probe of the same id.
        for tid, tpl in pt.BUILTIN_PROBE_TEMPLATES.items():
            assert tpl.template_id == tid
            assert tpl.entrypoint_kind in pt.PUBLIC_ENTRYPOINT_KINDS
            assert tpl.entrypoint_ref
            assert tid in pt._PROBES
