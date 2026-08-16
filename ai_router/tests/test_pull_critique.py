"""Tests for the Set 067 S4 path-aware-critique producer.

The producer drives the pull verifier across >= 2 providers and assembles the
Set 066 ``path-aware-critique.json`` artifact. These tests inject a FAKE
``run_pull`` so no metered API call is ever made; they assert the multi-provider
invariant (refuse a single-provider artifact), the envelope shape (validates
against the Set 066 runtime validator), level/identity stamping, the write/
dry-run paths, instruction building from the template + disposition, and the
CLI surface.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

import pull_critique as pc  # conftest puts ai_router/ on sys.path
import pull_verifier as pv
import probe_templates as pt
from path_aware_critique import (
    record_path_aware_critique,
    validate_path_aware_critique_artifact,
    validate_path_aware_critique_gate,
)


# --- Fakes ------------------------------------------------------------------


def _fake_result(provider, model, *, ok=True, verdict="VERIFIED", summary="ok",
                 findings=(), zero_calls=False, stop="verdict", crit=True):
    """Build a PullResult as the adapter would return it."""
    trace = pv.PullTrace(stop_reason=stop)
    if not zero_calls:
        trace.tool_calls.append(
            pv.ToolCallRecord(
                turn=0, name="read_file", args={"path": "x"}, raw=True,
                elided=False, result_chars=10, error=False,
            )
        )
    critique = None
    if crit:
        critique = pv.PullCritique(
            provider=provider,
            model=model,
            verdict=verdict,
            summary=summary,
            findings=tuple(
                pv.Finding(description=d, severity="Major", category="correctness")
                for d in findings
            ),
        )
    return pv.PullResult(
        provider=provider, model=model, critique=critique, trace=trace
    )


def _runner(mapping):
    """Return a run_pull that yields a scripted PullResult per provider."""
    def run_pull(sandbox, instruction, *, provider, model, config, **kwargs):
        return mapping[provider]
    return run_pull


def _make_set(tmp_path, slug="099-demo-set", level="required"):
    set_dir = tmp_path / slug
    set_dir.mkdir()
    (set_dir / "spec.md").write_text(
        "# Demo Set Spec\n\nbody\n", encoding="utf-8"
    )
    (set_dir / "disposition.json").write_text(
        json.dumps(
            {"summary": "did a thing", "files_changed": ["a.py", "b.py"]}
        ),
        encoding="utf-8",
    )
    # The durable record (so read_path_aware_critique returns `level`).
    (set_dir / "activity-log.json").write_text(
        json.dumps({"sessionSetName": slug, "entries": []}), encoding="utf-8"
    )
    record_path_aware_critique(set_dir, level, session_number=1)
    return set_dir


# --- The multi-provider invariant ------------------------------------------


def test_two_distinct_providers_produces_valid_artifact(tmp_path):
    set_dir = _make_set(tmp_path)
    run = _runner(
        {
            "openai": _fake_result("openai", "gpt-5.4", findings=["bug a"]),
            "google": _fake_result("google", "gemini-2.5-pro"),
        }
    )
    res = pc.produce_path_aware_critique(
        set_dir, sandbox_dir=tmp_path, run_pull=run
    )
    assert res.ok
    assert res.written_to == set_dir / "path-aware-critique.json"
    # The written file passes the SAME validator the close-out gate uses.
    result = validate_path_aware_critique_artifact(res.written_to)
    assert result.ok, result.reasons
    assert sorted(result.providers) == ["google", "openai"]
    # Identity stamping: name = dir name, level = recorded policy.
    assert res.artifact["sessionSetName"] == "099-demo-set"
    assert res.artifact["pathAwareCritique"] == "required"
    assert res.artifact["schemaVersion"] == 1


def test_single_distinct_provider_refused(tmp_path):
    set_dir = _make_set(tmp_path)
    # Two runs but the SAME provider -> not multi-provider.
    run = _runner(
        {
            "openai": _fake_result("openai", "gpt-5.4"),
            "google": _fake_result("openai", "gpt-5.4"),  # adapter stamped openai
        }
    )
    res = pc.produce_path_aware_critique(
        set_dir, sandbox_dir=tmp_path, run_pull=run
    )
    assert not res.ok
    assert res.written_to is None
    assert not (set_dir / "path-aware-critique.json").exists()
    assert any("single-provider" in r for r in res.reasons)


def test_failed_provider_run_is_skipped_not_fatal(tmp_path):
    set_dir = _make_set(tmp_path)
    run = _runner(
        {
            "openai": _fake_result("openai", "gpt-5.4"),
            "google": _fake_result(
                "google", "gemini-2.5-pro", zero_calls=True
            ),  # zero probes -> ok=False -> skipped
        }
    )
    res = pc.produce_path_aware_critique(
        set_dir, sandbox_dir=tmp_path, run_pull=run
    )
    # Only one usable verdict -> single provider -> refused, but the run
    # completed (the zero-probe failure was skipped, not raised).
    assert not res.ok
    assert any("zero tool calls" in s for s in res.skipped)


def test_raising_provider_is_skipped(tmp_path):
    set_dir = _make_set(tmp_path)

    def run_pull(sandbox, instruction, *, provider, model, config, **kwargs):
        if provider == "google":
            raise RuntimeError("boom")
        return _fake_result("openai", "gpt-5.4")

    res = pc.produce_path_aware_critique(
        set_dir, sandbox_dir=tmp_path, run_pull=run_pull
    )
    assert not res.ok
    assert any("RuntimeError" in s and "boom" in s for s in res.skipped)


# --- write vs dry-run -------------------------------------------------------


def test_dry_run_does_not_write(tmp_path):
    set_dir = _make_set(tmp_path)
    run = _runner(
        {
            "openai": _fake_result("openai", "gpt-5.4"),
            "google": _fake_result("google", "gemini-2.5-pro"),
        }
    )
    res = pc.produce_path_aware_critique(
        set_dir, sandbox_dir=tmp_path, write=False, run_pull=run
    )
    assert res.ok
    assert res.written_to is None
    assert not (set_dir / "path-aware-critique.json").exists()


def test_explicit_level_override_allowed_only_on_dry_run(tmp_path):
    # An explicit level that disagrees with the recorded policy is honored in
    # the ARTIFACT, but only a dry run may stamp it (writing it would fail the
    # gate's identity check), so write must be False.
    set_dir = _make_set(tmp_path, level="required")
    run = _runner(
        {
            "openai": _fake_result("openai", "gpt-5.4"),
            "google": _fake_result("google", "gemini-2.5-pro"),
        }
    )
    res = pc.produce_path_aware_critique(
        set_dir, sandbox_dir=tmp_path, level="advisory", write=False, run_pull=run
    )
    assert res.artifact["pathAwareCritique"] == "advisory"
    assert res.ok  # dry run: structurally valid, nothing written
    assert res.written_to is None


def test_write_mode_refuses_level_mismatching_recorded_policy(tmp_path):
    # The gate-identity guard: in write mode the stamped level must equal the
    # recorded policy, or the artifact would be written-but-gate-rejected.
    set_dir = _make_set(tmp_path, level="required")
    run = _runner(
        {
            "openai": _fake_result("openai", "gpt-5.4"),
            "google": _fake_result("google", "gemini-2.5-pro"),
        }
    )
    res = pc.produce_path_aware_critique(
        set_dir, sandbox_dir=tmp_path, level="advisory", run_pull=run
    )
    assert not res.ok
    assert res.written_to is None
    assert not (set_dir / "path-aware-critique.json").exists()
    assert any("recorded" in r and "advisory" in r for r in res.reasons)


def test_level_defaults_to_recorded_policy(tmp_path):
    set_dir = _make_set(tmp_path, level="advisory")
    run = _runner(
        {
            "openai": _fake_result("openai", "gpt-5.4"),
            "google": _fake_result("google", "gemini-2.5-pro"),
        }
    )
    res = pc.produce_path_aware_critique(
        set_dir, sandbox_dir=tmp_path, run_pull=run
    )
    assert res.artifact["pathAwareCritique"] == "advisory"


# --- instruction building ---------------------------------------------------


def test_build_instruction_fills_template(tmp_path):
    set_dir = _make_set(tmp_path)
    instr = pc.build_instruction(set_dir)
    # Placeholders are gone; set specifics + template body are present.
    assert "{set_title}" not in instr
    assert "{change_summary}" not in instr
    assert "{files_changed}" not in instr
    assert "099-demo-set" in instr
    assert "did a thing" in instr
    assert "a.py" in instr
    # The template's load-bearing anti-bias instruction survives.
    assert "the repository wins" in instr


def test_build_instruction_without_disposition(tmp_path):
    set_dir = tmp_path / "100-bare"
    set_dir.mkdir()
    (set_dir / "spec.md").write_text("# Bare Spec\n", encoding="utf-8")
    instr = pc.build_instruction(set_dir)
    assert "100-bare" in instr
    # No disposition -> graceful fallbacks, not a crash.
    assert "No file list recorded" in instr or "No close-time summary" in instr


def test_build_instruction_non_string_summary_does_not_raise(tmp_path):
    # A malformed disposition with a non-string (truthy) summary must not crash
    # build_instruction in str.replace (S4 dogfood finding 3).
    set_dir = tmp_path / "101-bad-disp"
    set_dir.mkdir()
    (set_dir / "spec.md").write_text("# Bad Disp Spec\n", encoding="utf-8")
    (set_dir / "disposition.json").write_text(
        json.dumps({"summary": {"oops": "a dict"}, "files_changed": [123]}),
        encoding="utf-8",
    )
    instr = pc.build_instruction(set_dir)  # must not raise
    assert "No close-time summary" in instr


def test_session_name_resolved_from_dot_invocation(tmp_path, monkeypatch):
    # Invoked as "." from inside the set, Path(".").name is "" -> the producer
    # must resolve() first so sessionSetName is the real set name, not empty
    # (S4 dogfood finding 1).
    set_dir = _make_set(tmp_path, slug="102-dot-set")
    run = _runner(
        {
            "openai": _fake_result("openai", "gpt-5.4"),
            "google": _fake_result("google", "gemini-2.5-pro"),
        }
    )
    monkeypatch.chdir(set_dir)
    res = pc.produce_path_aware_critique(".", sandbox_dir=tmp_path, run_pull=run)
    assert res.artifact["sessionSetName"] == "102-dot-set"
    assert res.ok


def test_default_sandbox_is_repo_root_not_cwd(tmp_path, monkeypatch):
    # set-067 critique GPT finding 2: with no --sandbox, the review must default
    # to the git repo root containing the set, NOT Path.cwd() (which could
    # under-scope the review while still passing the gate).
    repo = tmp_path / "repo"
    (repo / ".git").mkdir(parents=True)
    set_dir = repo / "docs" / "session-sets" / "104-deep-set"
    set_dir.mkdir(parents=True)
    (set_dir / "spec.md").write_text("# Deep Spec\n", encoding="utf-8")
    (set_dir / "activity-log.json").write_text(
        json.dumps({"sessionSetName": "104-deep-set", "entries": []}),
        encoding="utf-8",
    )
    record_path_aware_critique(set_dir, "required", session_number=1)

    captured = {}

    def run_pull(sandbox, instruction, *, provider, model, config, **kwargs):
        captured["sandbox"] = sandbox
        captured["caps"] = kwargs.get("caps")
        captured["run_test_config"] = kwargs.get("run_test_config")
        captured["diff_config"] = kwargs.get("diff_config")
        return _fake_result(provider, "m")

    # cwd is some unrelated dir, NOT the repo.
    monkeypatch.chdir(tmp_path)
    pc.produce_path_aware_critique(
        set_dir,
        providers=(("openai", None), ("google", None)),
        write=False,
        run_pull=run_pull,
    )
    assert Path(captured["sandbox"]).resolve() == repo.resolve()


def test_podman_lane_config_is_threaded_to_pull_route(tmp_path):
    # Set 069 S4: a podman_lane_config passed to the producer reaches pull_route
    # (so the run_authored_probe lane is actually offered per provider).
    set_dir = _make_set(tmp_path, level="required")
    captured = {}

    def run_pull(sandbox, instruction, *, provider, model, config, **kwargs):
        captured["podman_lane_config"] = kwargs.get("podman_lane_config")
        captured["caps"] = kwargs.get("caps")
        return _fake_result(provider, "m")

    cfg = pv.PodmanLaneConfig(repo_root=str(tmp_path), image="pull-probe:local")
    pc.produce_path_aware_critique(
        set_dir,
        providers=(("openai", None), ("google", None)),
        sandbox_dir=tmp_path,
        write=False,
        podman_lane_config=cfg,
        run_pull=run_pull,
    )
    assert captured["podman_lane_config"] is cfg
    # An active execution lane (even the podman one alone) triggers blast-radius
    # budgeted caps rather than leaving caps=None.
    assert captured["caps"] is not None


def test_produced_artifact_passes_the_real_close_out_gate(tmp_path):
    # End-to-end: a produced artifact must satisfy the ACTUAL close-out gate
    # (validate_path_aware_critique_gate), not just the structural validator
    # (S4 dogfood finding 2 - the earlier tests only checked envelope validity).
    set_dir = _make_set(tmp_path, level="required")
    run = _runner(
        {
            "openai": _fake_result("openai", "gpt-5.4", findings=["bug a"]),
            "google": _fake_result("google", "gemini-2.5-pro"),
        }
    )
    res = pc.produce_path_aware_critique(set_dir, sandbox_dir=tmp_path, run_pull=run)
    assert res.ok and res.written_to is not None
    gate = validate_path_aware_critique_gate(set_dir)
    assert gate.applicable and gate.ok, gate.reason


def test_producer_and_gate_agree_on_non_canonical_path(tmp_path, monkeypatch):
    # The producer resolves the path to stamp sessionSetName; the gate must
    # resolve too, so a "." invocation that WRITES also PASSES the gate -- the
    # two never disagree on a non-canonical path (S4 dogfood finding 1).
    set_dir = _make_set(tmp_path, slug="103-agree-set", level="required")
    run = _runner(
        {
            "openai": _fake_result("openai", "gpt-5.4"),
            "google": _fake_result("google", "gemini-2.5-pro"),
        }
    )
    monkeypatch.chdir(set_dir)
    res = pc.produce_path_aware_critique(".", sandbox_dir=tmp_path, run_pull=run)
    assert res.ok and res.written_to is not None
    gate = validate_path_aware_critique_gate(".")  # same non-canonical path
    assert gate.applicable and gate.ok, gate.reason


# --- CLI --------------------------------------------------------------------


def test_cli_dry_run(tmp_path, monkeypatch, capsys):
    set_dir = _make_set(tmp_path)
    run = _runner(
        {
            "openai": _fake_result("openai", "gpt-5.4"),
            "google": _fake_result("google", "gemini-2.5-pro"),
        }
    )
    # Patch the module-level default so the CLI uses the fake.
    monkeypatch.setattr(pc, "pull_route", run)
    real = pc.produce_path_aware_critique

    def patched(*a, **k):
        k.setdefault("run_pull", run)
        return real(*a, **k)

    monkeypatch.setattr(pc, "produce_path_aware_critique", patched)
    rc = pc._main([str(set_dir), "--dry-run"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "ok=True" in out
    assert "dry-run" in out
    assert not (set_dir / "path-aware-critique.json").exists()


def test_parse_providers():
    assert pc._parse_providers(None) == pc.DEFAULT_PROVIDERS
    assert pc._parse_providers(["openai"]) == (("openai", None),)
    assert pc._parse_providers(["openai:gpt-5.4", "google"]) == (
        ("openai", "gpt-5.4"),
        ("google", None),
    )


# --- Set 069 S2: blast-radius-budgeted caps ---------------------------------


def _base_caps():
    return pv.PullCaps(
        max_turns=14, max_output_tokens=24000, token_budget=300_000,
        cost_ceiling_usd=1.0,
    )


def test_budget_caps_high_blast_gets_full_budget():
    # A shared-schema / cross-artifact change classifies as `required` -> 1.0x.
    caps = pc.budget_caps_for_paths(
        ["docs/path-aware-critique.schema.json", "ai_router/x.py"],
        base_caps=_base_caps(),
    )
    assert caps.max_turns == 14
    assert caps.token_budget == 300_000
    assert caps.cost_ceiling_usd == 1.0
    assert caps.max_output_tokens == 24000  # per-call ceiling untouched


def test_budget_caps_low_blast_code_scaled_down():
    # A single isolated code file -> `advisory` -> 0.6x.
    caps = pc.budget_caps_for_paths(
        ["ai_router/lonely_module.py"], base_caps=_base_caps()
    )
    assert caps.max_turns == round(14 * 0.6)
    assert caps.token_budget == int(300_000 * 0.6)
    assert caps.cost_ceiling_usd == pytest.approx(0.6)


def test_budget_caps_docs_only_scaled_lowest_with_floors():
    caps = pc.budget_caps_for_paths(
        ["docs/notes.md"], base_caps=_base_caps()
    )
    # `none` -> 0.4x, but never below the workable floors.
    assert caps.max_turns == max(4, round(14 * 0.4))
    assert caps.token_budget == max(20_000, int(300_000 * 0.4))


def test_budget_caps_empty_paths_does_not_crash():
    caps = pc.budget_caps_for_paths([], base_caps=_base_caps())
    assert caps.max_turns >= 4


# --- Set 069 S2: producer threads exec/diff config + budgeted caps ----------


def _capturing_runner():
    captured = {}

    def run_pull(sandbox, instruction, *, provider, model, config, **kwargs):
        captured.setdefault("calls", []).append(kwargs)
        return _fake_result(provider, "m")

    return run_pull, captured


def test_producer_threads_run_test_and_diff_config(tmp_path):
    set_dir = _make_set(tmp_path)
    run, captured = _capturing_runner()
    rt = pv.RunTestConfig(repo_root=str(tmp_path), ref="HEAD",
                          command=("pytest", "-q"))
    diff = pv.DiffConfig(repo_root=str(tmp_path), base_ref="HEAD")
    pc.produce_path_aware_critique(
        set_dir, sandbox_dir=tmp_path, write=False, run_pull=run,
        run_test_config=rt, diff_config=diff,
    )
    call = captured["calls"][0]
    assert call["run_test_config"] is rt
    assert call["diff_config"] is diff
    # An execution lane is active + no caps pinned -> blast-radius-budgeted caps.
    assert isinstance(call["caps"], pv.PullCaps)


def test_producer_read_only_path_leaves_caps_none(tmp_path):
    set_dir = _make_set(tmp_path)
    run, captured = _capturing_runner()
    pc.produce_path_aware_critique(
        set_dir, sandbox_dir=tmp_path, write=False, run_pull=run,
    )
    call = captured["calls"][0]
    # No execution lane -> caps stays None (pull_route resolves the config
    # default), run_test_config / diff_config are None: read-only path unchanged.
    assert call["caps"] is None
    assert call["run_test_config"] is None
    assert call["diff_config"] is None


def test_producer_honors_explicit_caps(tmp_path):
    set_dir = _make_set(tmp_path)
    run, captured = _capturing_runner()
    pinned = pv.PullCaps(max_turns=3)
    rt = pv.RunTestConfig(repo_root=str(tmp_path), ref="HEAD",
                          command=("pytest", "-q"))
    pc.produce_path_aware_critique(
        set_dir, sandbox_dir=tmp_path, write=False, run_pull=run,
        run_test_config=rt, caps=pinned,
    )
    assert captured["calls"][0]["caps"] is pinned


# --- Set 069 S2: CLI builds exec/diff configs from flags --------------------


def _exec_args(**overrides):
    """A SimpleNamespace with every flag _build_exec_configs reads, defaulted off."""
    base = dict(
        run_test_cmd=None, run_test_named=None, exec_ref=None,
        diff_base=None, diff_head="", probe_templates=False,
        podman_lane=False, podman_image=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def test_build_exec_configs_run_test_requires_ref():
    args = _exec_args(run_test_cmd="pytest -q")
    with pytest.raises(pc.PullCritiqueError):
        pc._build_exec_configs(args, repo_root=".", config=None)


def test_build_exec_configs_builds_both():
    args = _exec_args(
        run_test_cmd="pytest -q", run_test_named=["unit=python -m pytest x"],
        exec_ref="HEAD", diff_base="main",
    )
    rt, diff, probe, podman = pc._build_exec_configs(
        args, repo_root="/r", config=None
    )
    assert rt.repo_root == "/r" and rt.ref == "HEAD"
    assert rt.command == ("pytest", "-q")
    assert rt.commands == {"unit": ("python", "-m", "pytest", "x")}
    assert diff.base_ref == "main"
    assert probe is None  # --probe-templates not requested
    assert podman is None  # --podman-lane not requested


def test_build_exec_configs_rejects_bad_named():
    args = _exec_args(run_test_named=["no-equals-sign"], exec_ref="HEAD")
    with pytest.raises(pc.PullCritiqueError):
        pc._build_exec_configs(args, repo_root=".", config=None)


def test_build_exec_configs_none_when_no_flags():
    args = _exec_args()
    rt, diff, probe, podman = pc._build_exec_configs(
        args, repo_root=".", config=None
    )
    assert rt is None and diff is None and probe is None and podman is None


# --- Set 069 S3: CLI builds the probe-template config; producer threads it ---


def test_build_exec_configs_builds_probe_template_config():
    args = _exec_args(probe_templates=True, exec_ref="HEAD")
    rt, diff, probe, podman = pc._build_exec_configs(
        args, repo_root="/r", config=None
    )
    assert rt is None and diff is None and podman is None
    assert probe is not None
    assert probe.repo_root == "/r" and probe.ref == "HEAD"
    # The built-in seed library is wired in.
    assert "malformed_artifact_bytes" in probe.templates


def test_build_exec_configs_builds_podman_lane_config():
    # Set 069 S4: --podman-lane builds a PodmanLaneConfig; the read-only bind
    # mount means it does NOT require --exec-ref (ref is provenance only).
    args = _exec_args(podman_lane=True, podman_image="pull-probe@sha256:abc")
    rt, diff, probe, podman = pc._build_exec_configs(
        args, repo_root="/r", config=None
    )
    assert rt is None and diff is None and probe is None
    assert podman is not None
    assert podman.repo_root == "/r"
    assert podman.image == "pull-probe@sha256:abc"
    assert podman.ref == "HEAD"  # default provenance


def test_build_exec_configs_probe_templates_requires_ref():
    args = _exec_args(probe_templates=True)  # no exec_ref
    with pytest.raises(pc.PullCritiqueError):
        pc._build_exec_configs(args, repo_root=".", config=None)


def test_producer_threads_probe_template_config(tmp_path):
    set_dir = _make_set(tmp_path)
    run, captured = _capturing_runner()
    probe = pt.ProbeTemplateConfig(repo_root=str(tmp_path), ref="HEAD")
    pc.produce_path_aware_critique(
        set_dir, sandbox_dir=tmp_path, write=False, run_pull=run,
        probe_template_config=probe,
    )
    call = captured["calls"][0]
    assert call["probe_template_config"] is probe
    # The template lane is an execution lane -> blast-radius-budgeted caps.
    assert isinstance(call["caps"], pv.PullCaps)


# ===========================================================================
# Set 113 S6: the critique's spend must reach the ledger.
#
# Set 113 S4 ran three path-aware critiques and none wrote a row to
# router-metrics.jsonl, so a set could spend on critiques and report zero.
# Falsifier pair: plant a finished arm and assert a row is written; plant the
# shapes that must NOT write one (and must never break the run).
# ===========================================================================


def _capture_rows(monkeypatch):
    """Intercept record_call at the module the producer imports it from."""
    rows = []
    import metrics

    def fake_record_call(config, **kw):
        rows.append(kw)

    monkeypatch.setattr(metrics, "record_call", fake_record_call)
    return rows


class TestCritiqueSpendIsLedgered:
    def test_each_arm_writes_one_row(self, tmp_path, monkeypatch):
        rows = _capture_rows(monkeypatch)
        set_dir = _make_set(tmp_path)
        run = _runner(
            {
                "openai": _fake_result("openai", "gpt-5.6-sol",
                                       findings=["bug a"]),
                "google": _fake_result("google", "gemini-2.5-pro"),
            }
        )
        res = pc.produce_path_aware_critique(
            set_dir, sandbox_dir=tmp_path, run_pull=run
        )
        assert res.ok
        # PLANT THE DEFECT: before the fix this list was empty for every run.
        assert len(rows) == 2, rows
        by_provider = {r["provider"]: r for r in rows}
        assert set(by_provider) == {"openai", "google"}
        for r in rows:
            assert r["call_type"] == pc.CRITIQUE_CALL_TYPE
            assert r["task_type"] == pc.CRITIQUE_TASK_TYPE
            assert str(set_dir) == r["session_set"]
        # The verdict and finding count travel with the row, so the ledger can
        # answer "what did this critique cost AND what did it say".
        assert by_provider["openai"]["issue_count"] == 1
        assert by_provider["google"]["issue_count"] == 0
        assert by_provider["openai"]["verdict"] == "VERIFIED"
        # The served id is the id the provider actually serves, not a registry
        # alias - which is what the Set 113 S6 alias fix guarantees, and what
        # keeps the Set 109 drift gate reading known ids.
        assert by_provider["openai"]["model"] == "gpt-5.6-sol"

    def test_a_provider_that_raised_writes_no_row(self, tmp_path, monkeypatch):
        # THE LEGITIMATE LOOK-ALIKE: an arm that never returned a result has no
        # measured spend to report, and must not invent a zero row.
        rows = _capture_rows(monkeypatch)
        set_dir = _make_set(tmp_path)

        def run_pull(sandbox, instruction, *, provider, model, config, **kw):
            if provider == "openai":
                raise RuntimeError("boom")
            return _fake_result("google", "gemini-2.5-pro")

        pc.produce_path_aware_critique(
            set_dir, sandbox_dir=tmp_path, write=False, run_pull=run_pull
        )
        assert [r["provider"] for r in rows] == ["google"]

    def test_an_arm_with_no_verdict_is_still_ledgered(self, tmp_path,
                                                      monkeypatch):
        # It ran, so it SPENT. A failed arm that writes no row is exactly the
        # under-reporting this fix exists to close.
        rows = _capture_rows(monkeypatch)
        set_dir = _make_set(tmp_path)
        run = _runner(
            {
                "openai": _fake_result("openai", "gpt-5.6-sol", crit=False,
                                       stop="max-turns"),
                "google": _fake_result("google", "gemini-2.5-pro"),
            }
        )
        pc.produce_path_aware_critique(
            set_dir, sandbox_dir=tmp_path, write=False, run_pull=run
        )
        assert len(rows) == 2
        failed = [r for r in rows if r["provider"] == "openai"][0]
        assert failed["verdict"] is None
        assert failed["issue_count"] is None
        assert failed["stop_reason"] == "max-turns"

    def test_a_broken_ledger_never_costs_the_caller_the_critique(
        self, tmp_path, monkeypatch
    ):
        # record_call's own contract is "never raise". The producer must hold
        # the same line: bookkeeping about a paid artifact must not destroy it.
        import metrics

        def exploding(config, **kw):
            raise OSError("disk full")

        monkeypatch.setattr(metrics, "record_call", exploding)
        set_dir = _make_set(tmp_path)
        run = _runner(
            {
                "openai": _fake_result("openai", "gpt-5.6-sol"),
                "google": _fake_result("google", "gemini-2.5-pro"),
            }
        )
        res = pc.produce_path_aware_critique(
            set_dir, sandbox_dir=tmp_path, run_pull=run
        )
        assert res.ok


class TestPaidButFailedArmsAreLedgered:
    """Set 113 S6 round-1 finding 2. Recording only on the success path meant a
    provider that returned several billable turns and THEN raised contributed
    real dollars and zero rows -- and failing arms are the exact class this
    session is diagnosing, so that is the spend most likely to be missing."""

    @staticmethod
    def _runner_that_bills_then_dies(billed_in, billed_out, cost,
                                     resolved="gpt-5.6-sol"):
        def run_pull(sandbox, instruction, *, provider, model, config,
                     trace_sink=None, **kw):
            if provider == "openai":
                # pull_route stamps identity on the trace BEFORE driving
                # anything, which is what makes a failed arm attributable.
                trace = pv.PullTrace(stop_reason="verdict", provider=provider,
                                     resolved_model=resolved)
                if trace_sink is not None:
                    trace_sink.append(trace)
                # ...several billable turns happen...
                trace.input_tokens = billed_in
                trace.output_tokens = billed_out
                trace.cost_usd = cost
                # ...and then the arm dies.
                raise pv.DeterministicServantViolation("grep: boom")
            return _fake_result("google", "gemini-2.5-pro")
        return run_pull

    def test_an_arm_that_billed_then_raised_is_ledgered(self, tmp_path,
                                                        monkeypatch):
        rows = _capture_rows(monkeypatch)
        set_dir = _make_set(tmp_path)
        res = pc.produce_path_aware_critique(
            set_dir, sandbox_dir=tmp_path, write=False,
            run_pull=self._runner_that_bills_then_dies(1200, 800, 0.47),
        )
        assert not res.ok  # only one provider produced a critique
        failed = [r for r in rows if r["provider"] == "openai"]
        assert len(failed) == 1, rows
        assert failed[0]["cost_usd"] == 0.47
        assert failed[0]["input_tokens"] == 1200
        assert failed[0]["output_tokens"] == 800
        assert failed[0]["verdict"] is None

    def test_an_arm_that_billed_nothing_invents_no_spend(self, tmp_path,
                                                         monkeypatch):
        # THE LEGITIMATE LOOK-ALIKE: a run that died before any billable
        # response must not get a zero row - that is the opposite error, and
        # it would make an unmeasured failure look like a measured $0.00.
        rows = _capture_rows(monkeypatch)
        set_dir = _make_set(tmp_path)
        pc.produce_path_aware_critique(
            set_dir, sandbox_dir=tmp_path, write=False,
            run_pull=self._runner_that_bills_then_dies(0, 0, 0.0),
        )
        assert [r["provider"] for r in rows] == ["google"]

    def test_a_runner_with_no_sink_support_does_not_break_the_producer(
        self, tmp_path, monkeypatch
    ):
        # Injected runners in older tests take **kwargs; one that ignores
        # trace_sink must still work, with nothing invented for it.
        rows = _capture_rows(monkeypatch)
        set_dir = _make_set(tmp_path)

        def run_pull(sandbox, instruction, *, provider, model, config, **kw):
            if provider == "openai":
                raise RuntimeError("died with no trace at all")
            return _fake_result("google", "gemini-2.5-pro")

        pc.produce_path_aware_critique(
            set_dir, sandbox_dir=tmp_path, write=False, run_pull=run_pull
        )
        assert [r["provider"] for r in rows] == ["google"]

    def test_a_paid_failed_arm_is_attributed_to_the_model_that_spent(
        self, tmp_path, monkeypatch
    ):
        # Round-3 finding: the resolved model must come from the trace, not
        # from an optional attribute on the exception. Guard violations and
        # BindingHTTPError carry no such attribute, so an unpinned arm used to
        # record "(unresolved)" and a pinned one recorded the caller's ALIAS as
        # the id sent on the wire.
        rows = _capture_rows(monkeypatch)
        set_dir = _make_set(tmp_path)
        pc.produce_path_aware_critique(
            set_dir, sandbox_dir=tmp_path, write=False,
            providers=(("openai", "gpt-5-6-sol"), ("google", None)),
            run_pull=self._runner_that_bills_then_dies(900, 300, 0.31),
        )
        failed = [r for r in rows if r["provider"] == "openai"][0]
        assert failed["model"] == "gpt-5-6-sol"              # asked for
        assert failed["requested_model_id"] == "gpt-5.6-sol"  # sent
        assert failed.get("served_model_id") is None          # never observed
        assert failed["cost_usd"] == 0.31

    def test_an_unpinned_paid_failed_arm_is_never_unresolved(
        self, tmp_path, monkeypatch
    ):
        # The case that produced the literal string "(unresolved)".
        rows = _capture_rows(monkeypatch)
        set_dir = _make_set(tmp_path)
        pc.produce_path_aware_critique(
            set_dir, sandbox_dir=tmp_path, write=False,
            run_pull=self._runner_that_bills_then_dies(900, 300, 0.31),
        )
        failed = [r for r in rows if r["provider"] == "openai"][0]
        assert failed["model"] == "gpt-5.6-sol"
        assert failed["requested_model_id"] == "gpt-5.6-sol"
        assert "(unresolved)" not in str(failed.values())

    def test_the_trace_carries_identity_from_the_real_pull_route(self, tmp_path):
        # Structural: the production path must actually stamp it, or the two
        # tests above would be asserting a property only the fake has.
        (tmp_path / "a.py").write_text("alpha\n", encoding="utf-8")
        sink = []
        binding = _CritiqueFakeBinding()
        try:
            pv.pull_route(
                tmp_path, "review", binding=binding, trace_sink=sink,
                config={
                    "providers": {
                        "openai": {
                            "api_key_env": "DABBLER_OPENAI_API_KEY",
                            "base_url": "https://example.invalid/v1",
                            "timeout_seconds": 5,
                        }
                    },
                    "models": {"gpt-5-6-sol": {"model_id": "gpt-5.6-sol"}},
                },
                model="gpt-5-6-sol", provider="openai",
            )
        except Exception:
            pass
        assert sink, "pull_route must publish its trace before driving anything"
        assert sink[0].resolved_model == "gpt-5.6-sol"
        assert sink[0].provider == "openai"


class _CritiqueFakeBinding(pv.ProviderBinding):
    """Dies on the first request, after pull_route has stamped the trace."""

    provider_name = "openai"

    def request(self, **kw):
        raise pv.BindingHTTPError("openai returned HTTP 500")


class TestLedgerModelProvenance:
    """Set 113 S6 round-2 finding 1. The first version wrote the RESOLVED id
    into `model`, `requested_model_id` AND `served_model_id`, so an alias-based
    critique lost what the caller asked for and asserted a served/requested
    match that had never been observed - which is precisely what a model-drift
    audit reads."""

    def test_the_caller_s_alias_and_the_sent_id_are_kept_apart(
        self, tmp_path, monkeypatch
    ):
        rows = _capture_rows(monkeypatch)
        set_dir = _make_set(tmp_path)

        def run_pull(sandbox, instruction, *, provider, model, config, **kw):
            # What pull_route does: resolve the alias, stamp the resolved id.
            return _fake_result(provider, "gpt-5.6-sol")

        pc.produce_path_aware_critique(
            set_dir, sandbox_dir=tmp_path, write=False, run_pull=run_pull,
            providers=(("openai", "gpt-5-6-sol"),),
        )
        assert len(rows) == 1
        row = rows[0]
        assert row["model"] == "gpt-5-6-sol"              # what was asked for
        assert row["requested_model_id"] == "gpt-5.6-sol"  # what was sent

    def test_served_model_is_unknown_rather_than_assumed(self, tmp_path,
                                                         monkeypatch):
        # This executor does not capture the provider's echoed model. NULL is
        # the schema's honest "not captured"; asserting the id we sent would
        # make served_model_mismatch compute False and claim a match nobody
        # observed.
        rows = _capture_rows(monkeypatch)
        set_dir = _make_set(tmp_path)
        run = _runner({"openai": _fake_result("openai", "gpt-5.6-sol"),
                       "google": _fake_result("google", "gemini-2.5-pro")})
        pc.produce_path_aware_critique(
            set_dir, sandbox_dir=tmp_path, write=False, run_pull=run
        )
        for row in rows:
            assert row.get("served_model_id") is None

    def test_an_unpinned_arm_falls_back_to_the_resolved_id(self, tmp_path,
                                                           monkeypatch):
        # THE LEGITIMATE LOOK-ALIKE: with no pin there is no alias to keep, so
        # `model` must carry the resolved id rather than None.
        rows = _capture_rows(monkeypatch)
        set_dir = _make_set(tmp_path)
        run = _runner({"openai": _fake_result("openai", "gpt-5.4"),
                       "google": _fake_result("google", "gemini-2.5-pro")})
        pc.produce_path_aware_critique(
            set_dir, sandbox_dir=tmp_path, write=False, run_pull=run
        )
        assert {r["model"] for r in rows} == {"gpt-5.4", "gemini-2.5-pro"}
