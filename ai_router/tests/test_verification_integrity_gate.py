"""Set 083 Session 2 — verification-integrity close gate tests.

The gate (``gate_checks.check_verification_integrity``) refuses a close
whose claimed verification verdict is uncorroborated, and refuses
illegal ``verification_method`` tokens outright. Born from a live
incident (2026-07-06): a Full-tier orchestrator wrote
``verification_method: "manual"`` (not a legal token) plus a
self-attested ``"VERIFIED"`` into ``disposition.json`` and
``close_session`` accepted both verbatim.

Matrix (spec Session 2 step 4):

- the live incident as a regression fixture (``"manual"`` +
  self-attested VERIFIED -> gate_failed at validation, through the full
  ``close_session.run`` flow);
- the no-artifact case;
- the same-provider case;
- the missing-orchestrator-identity case (fails closed);
- the null-verdict skipped close (Set 083: the old Set 068 routed-gate
  SKIP shape is RETIRED — fails without the zero-budget declaration,
  passes with it);
- the ``--manual-verify`` override (sanctioned bypass);
- ``--force`` does NOT bypass (force bypasses gates, not evidence);
- the zero-budget-declared manual case (passes);
- retired/unknown token vocabulary;
- the refusal message teaches the exact ``verify_session`` command;
- ``_claimed_close_verdict`` <-> ``resolve_close_verdict`` parity
  (the gate-side mirror cannot import the close_session original —
  circular import — so a parity test pins them together).
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

import close_session
from close_session import resolve_close_verdict
from session_checklist import record_post
from disposition import (
    Disposition,
    RETIRED_VERIFICATION_METHODS,
    VERIFICATION_METHODS,
    validate_disposition,
    write_disposition,
)
from gate_checks import (
    GATE_CHECKS,
    VERIFICATION_INTEGRITY_CHECK_NAME,
    _claimed_close_verdict,
    _verify_session_command,
    check_verification_integrity,
    check_verification_method_vocabulary,
)
from session_state import (
    NextOrchestrator,
    NextOrchestratorReason,
    register_session_start,
)
from stamp_fixtures import write_stamped_evidence


# ---------------------------------------------------------------------------
# Fixture builders
# ---------------------------------------------------------------------------

def _make_set(
    tmp_path: Path,
    *,
    orchestrator_provider: str = "anthropic",
    tier_line: str = "",
) -> Path:
    """A ``<root>/docs/session-sets/<slug>`` set with session 1 in flight.

    Uses the canonical repo layout so the gate's project-root heuristic
    (three levels up when no git repo exists) resolves ``tmp_path`` —
    where the ``ai_router/budget.yaml`` fixtures below are written.
    """
    set_dir = tmp_path / "docs" / "session-sets" / "gate-set"
    set_dir.mkdir(parents=True)
    spec = "# spec\n"
    if tier_line:
        spec += f"\n## Session Set Configuration\n\n```yaml\n{tier_line}\n```\n"
    (set_dir / "spec.md").write_text(spec, encoding="utf-8")
    kwargs = dict(
        session_set=str(set_dir),
        session_number=1,
        total_sessions=2,
        orchestrator_engine="claude-code",
        orchestrator_model="claude-fable-5",
        orchestrator_effort="medium",
    )
    if orchestrator_provider:
        kwargs["orchestrator_provider"] = orchestrator_provider
    register_session_start(**kwargs)
    return set_dir


def _strip_orchestrator_field(set_dir: Path, field_name: str) -> None:
    """Remove *field_name* from every session's orchestrator block.

    ``register_session_start`` requires enough identity to start, so the
    missing-identity cases are produced by editing the written state — the
    same shapes legacy files (or omit-null starts) present at close time.
    """
    state_path = set_dir / "session-state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    for entry in state.get("sessions") or []:
        orch = entry.get("orchestrator")
        if isinstance(orch, dict):
            orch.pop(field_name, None)
    state_path.write_text(
        json.dumps(state, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def _strip_provider_from_state(set_dir: Path) -> None:
    _strip_orchestrator_field(set_dir, "provider")


def _strip_model_from_state(set_dir: Path) -> None:
    _strip_orchestrator_field(set_dir, "model")


def _write_metrics(
    tmp_path: Path,
    monkeypatch,
    rows: list,
) -> Path:
    metrics = tmp_path / "router-metrics.jsonl"
    metrics.write_text(
        "".join(json.dumps(r) + "\n" for r in rows),
        encoding="utf-8",
    )
    monkeypatch.setenv("AI_ROUTER_METRICS_PATH", str(metrics))
    return metrics


def _verification_row(
    set_dir: Path,
    *,
    provider: str = "openai",
    model: str = "gpt-5-4",
    session_number: int = 1,
    task_type: str = "session-verification",
) -> dict:
    """A BARE (unstamped) metrics row — the pre-084 shape. Set 084 S2
    (F3): this row no longer corroborates a close; kept as the
    incident-3 regression shape. Corroborating fixtures use
    ``write_stamped_evidence`` (which also writes the paired artifact)."""
    return {
        "task_type": task_type,
        "session_set": set_dir.name,
        "session_number": session_number,
        "provider": provider,
        "model": model,
    }


def _write_artifact(set_dir: Path, session_number: int = 1) -> None:
    (set_dir / f"s{session_number}-verification.md").write_text(
        "VERIFIED\n", encoding="utf-8"
    )


def _write_budget(tmp_path: Path, text: str) -> None:
    budget_dir = tmp_path / "ai_router"
    budget_dir.mkdir(exist_ok=True)
    (budget_dir / "budget.yaml").write_text(text, encoding="utf-8")


def _api_disposition(verdict="VERIFIED", status="completed") -> Disposition:
    return Disposition(
        status=status,
        summary="gate matrix",
        verification_method="api",
        verification_verdict=verdict,
    )


INCIDENT_DISPOSITION = dict(
    status="completed",
    summary="live 2026-07-06 bypass incident shape",
    verification_method="manual",  # not a legal token
    verification_verdict="VERIFIED",  # self-attested, uncorroborated
)


# ---------------------------------------------------------------------------
# Vocabulary (layer 1)
# ---------------------------------------------------------------------------

class TestMethodVocabulary:
    def test_legal_vocabulary_is_the_budget_yaml_triple(self):
        assert set(VERIFICATION_METHODS) == {
            "api", "manual-via-other-engine", "skipped",
        }

    def test_incident_token_fails_validate_disposition(self):
        d = Disposition(**INCIDENT_DISPOSITION)
        passed, errors = validate_disposition(d, is_final_session=True)
        assert not passed
        joined = " ".join(errors)
        assert "manual-via-other-engine" in joined
        assert "Set 083" in joined

    def test_queue_token_fails_with_retirement_naming_message(self):
        d = Disposition(
            status="completed", summary="s", verification_method="queue",
        )
        passed, errors = validate_disposition(d, is_final_session=True)
        assert not passed
        joined = " ".join(errors)
        assert "Set 026" in joined and "retired" in joined

    def test_unknown_token_fails_with_generic_message(self, tmp_path):
        # Set 116 S3: the vocabulary rule is its own check now, so it is
        # asked directly. It used to be layer 1 of
        # check_verification_integrity, which asserted the same message
        # one level up.
        set_dir = _make_set(tmp_path)
        d = Disposition(
            status="completed", summary="s",
            verification_method="carrier-pigeon",
        )
        passed, remediation = check_verification_method_vocabulary(
            str(set_dir), d
        )
        assert not passed
        assert "carrier-pigeon" in remediation
        assert "unknown token" in remediation

    def test_the_incident_token_gets_a_naming_message(self, tmp_path):
        set_dir = _make_set(tmp_path)
        passed, remediation = check_verification_method_vocabulary(
            str(set_dir), Disposition(**INCIDENT_DISPOSITION)
        )
        assert not passed
        assert "manual-via-other-engine" in remediation

    def test_an_unknown_token_still_cannot_pass_the_integrity_gate(
        self, tmp_path
    ):
        """Demoting the spelling check did not open the gate.

        `verification_method` selects the corroboration path, so a token
        with no path cannot reach a passing close — it falls through to
        the zero-budget arm and is refused there. The message is no
        longer about the word; the refusal is.
        """
        set_dir = _make_set(tmp_path)
        passed, remediation = check_verification_integrity(
            str(set_dir),
            Disposition(
                status="completed", summary="s",
                verification_method="carrier-pigeon",
            ),
        )
        assert not passed
        assert "carrier-pigeon" in remediation

    def test_retired_map_covers_exactly_queue_and_manual(self):
        assert set(RETIRED_VERIFICATION_METHODS) == {"queue", "manual"}


# ---------------------------------------------------------------------------
# The api arm (layer 2)
# ---------------------------------------------------------------------------

class TestApiCorroboration:
    def test_full_evidence_passes(self, tmp_path, monkeypatch):
        set_dir = _make_set(tmp_path)
        _write_metrics(
            tmp_path, monkeypatch, [write_stamped_evidence(set_dir)]
        )
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert passed, remediation

    def test_no_artifact_fails_and_teaches(self, tmp_path, monkeypatch):
        set_dir = _make_set(tmp_path)
        _write_metrics(tmp_path, monkeypatch, [_verification_row(set_dir)])
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "s1-verification*.md" in remediation
        assert "ai_router.verify_session" in remediation

    def test_no_metrics_row_fails(self, tmp_path, monkeypatch):
        set_dir = _make_set(tmp_path)
        _write_artifact(set_dir)
        _write_metrics(tmp_path, monkeypatch, [])
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "router-metrics.jsonl" in remediation

    def test_missing_metrics_file_fails_closed(self, tmp_path, monkeypatch):
        set_dir = _make_set(tmp_path)
        _write_artifact(set_dir)
        monkeypatch.setenv(
            "AI_ROUTER_METRICS_PATH", str(tmp_path / "nonexistent.jsonl")
        )
        passed, _ = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed

    def test_same_provider_row_fails(self, tmp_path, monkeypatch):
        set_dir = _make_set(tmp_path, orchestrator_provider="anthropic")
        _write_metrics(
            tmp_path, monkeypatch,
            [write_stamped_evidence(
                set_dir, provider="anthropic", model="sonnet",
            )],
        )
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "cross-provider" in remediation

    def test_row_provider_field_is_not_trusted(self, tmp_path, monkeypatch):
        """S2 round-1 verifier finding: a row whose provider STRING lies
        ("openai") but whose model resolves to the orchestrator's own
        provider via the registry must not corroborate."""
        set_dir = _make_set(tmp_path, orchestrator_provider="anthropic")
        _write_metrics(
            tmp_path, monkeypatch,
            [write_stamped_evidence(
                set_dir, provider="openai", model="sonnet",
            )],
        )
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "cross-provider" in remediation

    def test_unresolvable_model_fails_closed(self, tmp_path, monkeypatch):
        """A row whose model is not in the registry has no resolvable
        identity — it cannot corroborate (fails closed), regardless of
        what its provider string claims."""
        set_dir = _make_set(tmp_path, orchestrator_provider="anthropic")
        _write_metrics(
            tmp_path, monkeypatch,
            [write_stamped_evidence(
                set_dir, provider="openai", model="mystery-model",
            )],
        )
        passed, _ = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed

    def test_missing_orchestrator_identity_fails_closed(
        self, tmp_path, monkeypatch
    ):
        """Set 084 (F1): identity is unresolvable only when the block has
        neither a registry-resolvable model NOR a provider label. Both
        are stripped here; the remediation names start_session --model."""
        set_dir = _make_set(tmp_path)
        _strip_provider_from_state(set_dir)
        _strip_model_from_state(set_dir)
        _write_artifact(set_dir)
        _write_metrics(tmp_path, monkeypatch, [_verification_row(set_dir)])
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "fails closed" in remediation
        assert "--model" in remediation

    def test_missing_provider_label_resolves_via_model_registry(
        self, tmp_path, monkeypatch
    ):
        """Set 084 (F1): a stripped provider LABEL no longer breaks the
        gate when the block's model resolves through the registry — the
        effective provider is derived from the model (claude-fable-5 ->
        anthropic), and a cross-provider gpt-5-4 row corroborates."""
        set_dir = _make_set(tmp_path)
        _strip_provider_from_state(set_dir)
        _write_metrics(
            tmp_path, monkeypatch, [write_stamped_evidence(set_dir)]
        )
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert passed, remediation

    def test_wrong_session_number_row_does_not_corroborate(
        self, tmp_path, monkeypatch
    ):
        set_dir = _make_set(tmp_path)
        _write_artifact(set_dir)
        _write_metrics(
            tmp_path, monkeypatch,
            [_verification_row(set_dir, session_number=2)],
        )
        passed, _ = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed

    def test_non_verification_task_row_does_not_corroborate(
        self, tmp_path, monkeypatch
    ):
        set_dir = _make_set(tmp_path)
        _write_artifact(set_dir)
        _write_metrics(
            tmp_path, monkeypatch,
            [_verification_row(set_dir, task_type="code-review")],
        )
        passed, _ = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed

    def test_api_status_derived_claim_is_also_policed(
        self, tmp_path, monkeypatch
    ):
        """No explicit verdict, but api+completed derives VERIFIED — the
        derived claim is persisted by resolve_close_verdict, so the gate
        demands the same evidence for it."""
        set_dir = _make_set(tmp_path)
        _write_metrics(tmp_path, monkeypatch, [])
        passed, _ = check_verification_integrity(
            str(set_dir), _api_disposition(verdict=None)
        )
        assert not passed

    def test_round_2_artifact_satisfies_the_artifact_arm(
        self, tmp_path, monkeypatch
    ):
        set_dir = _make_set(tmp_path)
        _write_metrics(
            tmp_path, monkeypatch,
            [write_stamped_evidence(set_dir, round_number=2)],
        )
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert passed, remediation


# ---------------------------------------------------------------------------
# The Set 084 S2 (F3) stamp layer
# ---------------------------------------------------------------------------

class TestStampedEvidenceLayer:
    """Only verify_session-stamped rows (or the backstop's) corroborate.

    The incident-3 regression class: a bare ``route()`` row — exactly
    what the 2026-07-06 hand-diluted-prompt bypass produced — carries no
    stamp and no longer satisfies the evidence layer; neither does any
    row whose stamp is internally inconsistent.
    """

    def test_bare_route_row_no_longer_corroborates(
        self, tmp_path, monkeypatch
    ):
        """Incident 3: cross-provider row, artifact present — the
        pre-084 gate passed this; the stamp layer refuses it."""
        set_dir = _make_set(tmp_path)
        _write_artifact(set_dir)
        _write_metrics(tmp_path, monkeypatch, [_verification_row(set_dir)])
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "evidence stamp" in remediation
        assert "route()" in remediation
        assert "ai_router.verify_session" in remediation

    def test_backstop_source_corroborates(self, tmp_path, monkeypatch):
        set_dir = _make_set(tmp_path)
        _write_metrics(
            tmp_path, monkeypatch,
            [write_stamped_evidence(
                set_dir, source="close_session_backstop",
            )],
        )
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert passed, remediation

    def test_unknown_source_fails(self, tmp_path, monkeypatch):
        set_dir = _make_set(tmp_path)
        _write_metrics(
            tmp_path, monkeypatch,
            [write_stamped_evidence(set_dir, source="my-own-script")],
        )
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "evidence stamp" in remediation

    def test_template_hash_mismatch_fails_closed(
        self, tmp_path, monkeypatch
    ):
        """A row stamped against a diluted / changed template — the
        consensus 'missing half of F3' — fails closed."""
        set_dir = _make_set(tmp_path)
        _write_metrics(
            tmp_path, monkeypatch,
            [write_stamped_evidence(
                set_dir, template_sha256="0" * 64,
            )],
        )
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "template" in remediation

    def test_template_id_mismatch_fails_closed(self, tmp_path, monkeypatch):
        set_dir = _make_set(tmp_path)
        _write_metrics(
            tmp_path, monkeypatch,
            [write_stamped_evidence(
                set_dir, template_id="session-verification-v999",
            )],
        )
        passed, _ = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed

    @pytest.mark.parametrize("missing_field", [
        "evidence_sha256",
        "template_id",
        "template_sha256",
        "verifier_model",
        "orchestrator_effective_provider",
        "artifact_path",
        "artifact_sha256",
        "package_version",
    ])
    def test_any_missing_stamp_field_fails_closed(
        self, tmp_path, monkeypatch, missing_field
    ):
        set_dir = _make_set(tmp_path)
        row = write_stamped_evidence(set_dir, **{missing_field: None})
        _write_metrics(tmp_path, monkeypatch, [row])
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "evidence stamp" in remediation

    def test_edited_artifact_fails_closed(self, tmp_path, monkeypatch):
        """Verification artifacts are never edited — an artifact whose
        bytes no longer hash to the stamp is refused."""
        set_dir = _make_set(tmp_path)
        row = write_stamped_evidence(set_dir)
        (set_dir / "s1-verification.md").write_text(
            "VERIFIED (edited after the fact)\n",
            encoding="utf-8", newline="",
        )
        _write_metrics(tmp_path, monkeypatch, [row])
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "edited" in remediation

    def test_verifier_model_row_model_mismatch_fails(
        self, tmp_path, monkeypatch
    ):
        """A stamp copied onto a different row's model is inconsistent."""
        set_dir = _make_set(tmp_path)
        row = write_stamped_evidence(set_dir, verifier_model="gemini-pro")
        _write_metrics(tmp_path, monkeypatch, [row])
        passed, _ = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed

    def test_stamped_exclusion_mismatch_fails(self, tmp_path, monkeypatch):
        """The stamp must record the SAME effective provider the gate
        itself resolves for the session orchestrator."""
        set_dir = _make_set(tmp_path)  # orchestrator resolves anthropic
        row = write_stamped_evidence(
            set_dir, orchestrator_provider="google",
        )
        _write_metrics(tmp_path, monkeypatch, [row])
        passed, _ = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed

    def test_hand_flipped_claim_cannot_ride_an_issues_found_row(
        self, tmp_path, monkeypatch,
    ):
        """I-084-S2-7 (the dogfood's round-4 finding): the stamped
        verdict — parsed at record time from the bytes the artifact
        hash binds — must MATCH the disposition's claim. An
        ISSUES_FOUND row cannot corroborate a hand-flipped VERIFIED."""
        set_dir = _make_set(tmp_path)
        _write_metrics(
            tmp_path, monkeypatch,
            [write_stamped_evidence(set_dir, content="ISSUES_FOUND\n")],
        )
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition(verdict="VERIFIED")
        )
        assert not passed
        assert "does not match the LATEST stamped verification verdict" in remediation

    def test_claim_matching_the_stamped_verdict_corroborates(
        self, tmp_path, monkeypatch,
    ):
        set_dir = _make_set(tmp_path)
        _write_metrics(
            tmp_path, monkeypatch,
            [write_stamped_evidence(set_dir, content="ISSUES_FOUND\n")],
        )
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition(verdict="ISSUES_FOUND")
        )
        assert passed, remediation

    def test_tampered_row_verdict_over_unchanged_artifact_fails(
        self, tmp_path, monkeypatch,
    ):
        """I-084-S2-10 (round-7 finding): editing the metrics row's
        verdict field cannot outrank the hash-bound artifact — the
        validator re-derives the verdict from the artifact bytes."""
        set_dir = _make_set(tmp_path)
        row = write_stamped_evidence(set_dir, content="ISSUES_FOUND\n")
        row["verdict"] = "VERIFIED"  # the forged row-level flip
        _write_metrics(tmp_path, monkeypatch, [row])
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition(verdict="VERIFIED")
        )
        assert not passed
        assert "re-derive" in remediation

    def test_cherry_picking_an_older_favorable_row_is_refused(
        self, tmp_path, monkeypatch,
    ):
        """I-084-S2-8 (round-5 finding): when valid rows disagree, the
        LATEST is the one authoritative result — a claim cannot ride an
        earlier VERIFIED row past a later refusing verification."""
        set_dir = _make_set(tmp_path)
        _write_metrics(
            tmp_path, monkeypatch,
            [
                write_stamped_evidence(set_dir, content="VERIFIED\n"),
                write_stamped_evidence(
                    set_dir, round_number=2, content="ISSUES_FOUND\n",
                ),
            ],
        )
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition(verdict="VERIFIED")
        )
        assert not passed
        assert "LATEST" in remediation

    def test_claim_matching_the_latest_row_corroborates(
        self, tmp_path, monkeypatch,
    ):
        set_dir = _make_set(tmp_path)
        _write_metrics(
            tmp_path, monkeypatch,
            [
                write_stamped_evidence(set_dir, content="ISSUES_FOUND\n"),
                write_stamped_evidence(
                    set_dir, round_number=2, content="VERIFIED\n",
                ),
            ],
        )
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition(verdict="VERIFIED")
        )
        assert passed, remediation

    def test_stale_row_after_new_work_fails_closed(
        self, tmp_path, monkeypatch,
    ):
        """I-084-S2-5: a row stamped at repo state A cannot corroborate
        after further tracked work landed — the freshness recompute
        mismatches."""
        set_dir = _make_set(tmp_path)
        row = write_stamped_evidence(set_dir)
        _write_metrics(tmp_path, monkeypatch, [row])
        # Land substantive tracked work AFTER the row was stamped.
        work = tmp_path / "src_change.py"
        work.write_text("x = 1\n", encoding="utf-8")
        import subprocess as _sp

        _sp.run(["git", "-C", str(tmp_path), "add", "-A"],
                capture_output=True, check=False)
        _sp.run(["git", "-C", str(tmp_path), "commit", "-m", "more work"],
                capture_output=True, check=False)
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "stale" in remediation or "work changed" in remediation

    def test_one_valid_row_among_bare_rows_corroborates(
        self, tmp_path, monkeypatch
    ):
        set_dir = _make_set(tmp_path)
        _write_metrics(
            tmp_path, monkeypatch,
            [
                _verification_row(set_dir),
                write_stamped_evidence(set_dir, round_number=2),
            ],
        )
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert passed, remediation


# ---------------------------------------------------------------------------
# The manual-via-other-engine / skipped arm (layer 2)
# ---------------------------------------------------------------------------

class TestZeroBudgetArm:
    def test_skip_with_null_verdict_requires_zero_budget(self, tmp_path):
        """Set 083 (operator decision): the old Set 068 routed-gate SKIP
        shape — method skipped, no verdict, no budget declaration — is
        RETIRED. Verification is mandatory; an undeclared skip fails."""
        set_dir = _make_set(tmp_path)
        d = Disposition(
            status="completed", summary="s", verification_method="skipped",
        )
        passed, remediation = check_verification_integrity(str(set_dir), d)
        assert not passed
        assert "zero-budget" in remediation
        assert "verify_session" in remediation

    def test_skip_with_null_verdict_passes_under_zero_budget(self, tmp_path):
        """The one legal skip: the operator-declared zero-budget tier
        covers a no-verdict skipped close."""
        set_dir = _make_set(tmp_path)
        _write_budget(
            tmp_path, "threshold_usd: 0\nverification_method: \"skipped\"\n",
        )
        d = Disposition(
            status="completed", summary="s", verification_method="skipped",
        )
        passed, remediation = check_verification_integrity(str(set_dir), d)
        assert passed, remediation

    def test_manual_with_null_verdict_requires_zero_budget(self, tmp_path):
        """Set 083: a no-verdict manual-via-other-engine close is likewise
        only legal under the operator's zero-budget declaration."""
        set_dir = _make_set(tmp_path)
        d = Disposition(
            status="completed", summary="s",
            verification_method="manual-via-other-engine",
        )
        passed, remediation = check_verification_integrity(str(set_dir), d)
        assert not passed
        assert "zero-budget" in remediation

    def test_claimed_verdict_without_budget_yaml_fails(self, tmp_path):
        set_dir = _make_set(tmp_path)
        d = Disposition(
            status="completed", summary="s",
            verification_method="skipped",
            verification_verdict="VERIFIED",
        )
        passed, remediation = check_verification_integrity(str(set_dir), d)
        assert not passed
        assert "zero-budget" in remediation

    def test_claimed_verdict_on_nonzero_budget_fails(self, tmp_path):
        set_dir = _make_set(tmp_path)
        _write_budget(tmp_path, "threshold_usd: 10\nverification_method: api\n")
        d = Disposition(
            status="completed", summary="s",
            verification_method="manual-via-other-engine",
            verification_verdict="VERIFIED",
        )
        passed, remediation = check_verification_integrity(str(set_dir), d)
        assert not passed
        assert "threshold_usd=10" in remediation

    def test_zero_budget_declared_manual_passes(self, tmp_path):
        set_dir = _make_set(tmp_path)
        _write_budget(
            tmp_path,
            "threshold_usd: 0\n"
            'verification_method: "manual-via-other-engine"\n',
        )
        d = Disposition(
            status="completed", summary="s",
            verification_method="manual-via-other-engine",
            verification_verdict="VERIFIED",
        )
        passed, remediation = check_verification_integrity(str(set_dir), d)
        assert passed, remediation

    def test_zero_budget_method_mismatch_fails(self, tmp_path):
        set_dir = _make_set(tmp_path)
        _write_budget(
            tmp_path,
            "threshold_usd: 0\nverification_method: \"skipped\"\n",
        )
        d = Disposition(
            status="completed", summary="s",
            verification_method="manual-via-other-engine",
            verification_verdict="VERIFIED",
        )
        passed, remediation = check_verification_integrity(str(set_dir), d)
        assert not passed
        assert "does not match" in remediation


# ---------------------------------------------------------------------------
# Scope: null claims, missing disposition, the removed tier escape
# ---------------------------------------------------------------------------

class TestGateScope:
    def test_no_disposition_is_inert(self, tmp_path):
        set_dir = _make_set(tmp_path)
        passed, remediation = check_verification_integrity(str(set_dir), None)
        assert passed and remediation == ""

    def test_spec_tier_lightweight_no_longer_disarms_the_gate(self, tmp_path):
        """Set 112 regression guard, inverted from the old inertness test.

        Before Set 112 a ``tier: lightweight`` line in spec.md made this
        gate return pass unconditionally. A spec file must never be able to
        turn off the verification evidence check; the tier is gone and so
        is the early-out.
        """
        set_dir = _make_set(tmp_path, tier_line="tier: lightweight")
        self_delete = set_dir / "session-events.jsonl"
        if self_delete.exists():
            self_delete.unlink()
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "missing verification evidence" in remediation

    def test_no_router_env_var_no_longer_disarms_the_gate(
        self, tmp_path, monkeypatch
    ):
        """The other half of the removed escape.

        ``DABBLER_NO_ROUTER=1`` alone used to satisfy the Lightweight
        predicate and skip this gate outright -- an env var that disarmed a
        verification gate with no tier and no attestation behind it. It is
        now a routed-call suppressor and nothing else; ``--manual-verify``
        is the attested bypass.
        """
        monkeypatch.setenv("DABBLER_NO_ROUTER", "1")
        set_dir = _make_set(tmp_path)
        ledger = set_dir / "session-events.jsonl"
        if ledger.exists():
            ledger.unlink()
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "missing verification evidence" in remediation

    def test_remediation_no_longer_advertises_the_removed_tier(self, tmp_path):
        """The corrective must not tell a blocked operator to declare a
        tier that no longer loads."""
        set_dir = _make_set(tmp_path)
        ledger = set_dir / "session-events.jsonl"
        if ledger.exists():
            ledger.unlink()
        _passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert "lightweight" not in remediation.lower()
        assert "--manual-verify" in remediation

    def test_illegal_tokens_still_refused_with_a_legacy_tier_line(self, tmp_path):
        """Vocabulary is validated first — an illegal token is illegal
        regardless of any legacy tier line in the spec."""
        set_dir = _make_set(tmp_path, tier_line="tier: lightweight")
        passed, _ = check_verification_integrity(
            str(set_dir), Disposition(**INCIDENT_DISPOSITION)
        )
        assert not passed

    def test_registered_as_the_sixth_gate(self):
        """Set 083 put verification_integrity sixth; Set 111 S4 appended
        two more after it. The load-bearing contract is its INDEX, which
        index-based consumers pin — not that it is last forever."""
        names = [name for name, _fn in GATE_CHECKS]
        assert names[5] == VERIFICATION_INTEGRITY_CHECK_NAME
        assert names[:6] == [
            "working_tree_clean",
            "pushed_to_remote",
            "activity_log_entry",
            "next_orchestrator_present",
            "change_log_fresh",
            VERIFICATION_INTEGRITY_CHECK_NAME,
        ]

    def test_refusal_names_the_exact_command(self, tmp_path):
        set_dir = _make_set(tmp_path)
        expected = _verify_session_command(str(set_dir))
        assert "-m ai_router.verify_session --session-set-dir" in expected
        assert "docs/session-sets/gate-set" in expected
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert expected in remediation


# ---------------------------------------------------------------------------
# _claimed_close_verdict <-> resolve_close_verdict parity
# ---------------------------------------------------------------------------

class TestClaimedVerdictParity:
    """The gate's claim mirror must agree with close_session's resolver
    (L-066-1 both-directions parity; a direct import would be circular)."""

    MATRIX = [
        ("api", "completed", "VERIFIED"),
        ("api", "completed", "ISSUES_FOUND"),
        ("api", "completed", None),
        ("api", "failed", None),
        ("api", "requires_review", None),
        ("api", "failed", "VERIFIED"),
        ("manual-via-other-engine", "completed", None),
        ("manual-via-other-engine", "completed", "VERIFIED"),
        ("skipped", "completed", None),
        ("skipped", "failed", "ISSUES_FOUND"),
        ("manual", "completed", "VERIFIED"),  # the incident shape
        ("queue", "completed", None),
        ("api", "completed", "ISSUES_FOUND_RESOLVED_IN_FLIGHT"),
    ]

    @pytest.mark.parametrize("method,status,verdict", MATRIX)
    def test_parity(self, method, status, verdict, capsys):
        d = Disposition(
            status=status, summary="s",
            verification_method=method,
            verification_verdict=verdict,
        )
        assert _claimed_close_verdict(d) == resolve_close_verdict(d)
        capsys.readouterr()  # swallow resolve's stderr notes


# ---------------------------------------------------------------------------
# End-to-end through close_session.run
# ---------------------------------------------------------------------------

def _git(repo_root: Path, *args: str) -> None:
    proc = subprocess.run(
        ["git", *args], cwd=str(repo_root),
        capture_output=True, text=True,
        encoding="utf-8", errors="replace", check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {proc.stderr}")


def _valid_next_orc() -> NextOrchestrator:
    return NextOrchestrator(
        engine="gemini-code-assist",
        provider="google",
        model="gemini-3-pro",
        effort="high",
        reason=NextOrchestratorReason(
            code="continue-current-trajectory",
            specifics="continue the gate work on the recommended engine",
        ),
    )


@pytest.fixture
def incident_repo(tmp_path: Path) -> Path:
    """A pushed, activity-logged set whose disposition is the live
    incident's exact shape — every bookkeeping gate passes; only the
    verification-integrity gate stands between the self-attested verdict
    and a successful close."""
    root = tmp_path / "repo"
    root.mkdir()
    _git(root, "init", "-b", "main")
    _git(root, "config", "user.email", "t@example.invalid")
    _git(root, "config", "user.name", "T")
    _git(root, "config", "commit.gpgsign", "false")
    (root / "README.md").write_text("baseline\n", encoding="utf-8")
    _git(root, "add", "README.md")
    _git(root, "commit", "-m", "baseline")
    bare = tmp_path / "repo.git"
    bare.mkdir()
    _git(bare, "init", "--bare", "-b", "main")
    _git(root, "remote", "add", "origin", str(bare))
    _git(root, "push", "-u", "origin", "main")

    set_dir = root / "docs" / "session-sets" / "incident-set"
    set_dir.mkdir(parents=True)
    (set_dir / "spec.md").write_text("# spec\n", encoding="utf-8")
    register_session_start(
        session_set=str(set_dir),
        session_number=1,
        total_sessions=2,
        orchestrator_engine="claude-code",
        orchestrator_model="claude-sonnet-4-6",
        orchestrator_effort="medium",
        orchestrator_provider="anthropic",
    )
    (set_dir / "activity-log.json").write_text(
        json.dumps({
            "sessionSetName": "incident-set",
            "createdDate": "2026-07-06T00:00:00-04:00",
            "totalSessions": 2,
            "entries": [{
                "sessionNumber": 1,
                "stepNumber": 1,
                "stepKey": "session-1/work",
                "dateTime": "2026-07-06T01:00:00-04:00",
                "description": "did work",
                "status": "complete",
                "routedApiCalls": [],
            }],
        }, indent=2),
        encoding="utf-8",
    )
    # Set 114 S1: the session posted its step checklist. Written through
    # the shipping writer so the fixture exercises the real path.
    record_post(str(set_dir), 1, [])
    write_disposition(str(set_dir), Disposition(
        next_orchestrator=_valid_next_orc(),
        **INCIDENT_DISPOSITION,
    ))
    _git(root, "add", "-A")
    _git(root, "commit", "-m", "land incident shape")
    _git(root, "push", "origin", "main")
    return set_dir


def _ns(**overrides):
    parser = close_session._build_parser()
    args = parser.parse_args([])
    for k, v in overrides.items():
        setattr(args, k, v)
    return args


class TestCloseSessionEndToEnd:
    def test_incident_disposition_is_blocked(self, incident_repo, monkeypatch):
        """The regression fixture: the exact live-incident disposition is
        gate_failed at validation — in headless (non-TTY) mode, proving
        the hard-block-in-both-modes posture."""
        monkeypatch.setenv(
            "AI_ROUTER_METRICS_PATH",
            str(incident_repo.parent / "no-metrics.jsonl"),
        )
        outcome = close_session.run(_ns(session_set_dir=str(incident_repo)))
        assert outcome.result == "gate_failed"
        assert outcome.exit_code == 1
        # Set 116 S3: the incident's illegal token also fails the now-
        # advisory vocabulary check. What must stay true is that the
        # BLOCKING failure is verification_integrity alone.
        failed = {
            g.check for g in outcome.gate_results
            if not g.passed and g.blocking
        }
        assert failed == {VERIFICATION_INTEGRITY_CHECK_NAME}
        assert {
            g.check for g in outcome.gate_results
            if not g.passed and not g.blocking
        } == {"verification_method_vocabulary"}
        blocked = next(
            g for g in outcome.gate_results
            if g.check == VERIFICATION_INTEGRITY_CHECK_NAME
        )
        assert "ai_router.verify_session" in blocked.remediation

    def test_force_does_not_bypass(self, incident_repo, tmp_path, monkeypatch):
        """--force bypasses bookkeeping gates, not evidence: the incident
        disposition is still blocked on the incident-recovery path."""
        monkeypatch.setenv("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", "1")
        monkeypatch.setenv(
            "AI_ROUTER_METRICS_PATH",
            str(incident_repo.parent / "no-metrics.jsonl"),
        )
        reason = tmp_path / "reason.md"
        reason.write_text("incident-recovery attempt\n", encoding="utf-8")
        outcome = close_session.run(_ns(
            session_set_dir=str(incident_repo),
            force=True,
            reason_file=str(reason),
        ))
        assert outcome.result == "gate_failed"
        assert [(g.check, g.passed) for g in outcome.gate_results] == [
            (VERIFICATION_INTEGRITY_CHECK_NAME, False)
        ]

    def test_force_close_records_the_dispositions_method_honestly(
        self, incident_repo, tmp_path, monkeypatch
    ):
        """A --force close whose disposition carries a legal,
        gate-corroborated api verification must record method "api" in
        the outcome/event surface, not "skipped" — force bypasses
        bookkeeping gates, not evidence, and the audit trail must not
        claim verification was skipped when it was corroborated (S2
        round-3 finding)."""
        monkeypatch.setenv("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", "1")
        repo_root = incident_repo.parents[2]
        write_disposition(str(incident_repo), Disposition(
            status="completed",
            summary="corroborated api close, force path",
            verification_method="api",
            verification_verdict="VERIFIED",
            next_orchestrator=_valid_next_orc(),
        ))
        stamped_row = write_stamped_evidence(incident_repo)
        metrics = tmp_path / "metrics.jsonl"
        metrics.write_text(
            json.dumps(stamped_row) + "\n", encoding="utf-8",
        )
        monkeypatch.setenv("AI_ROUTER_METRICS_PATH", str(metrics))
        _git(repo_root, "add", "-A")
        _git(repo_root, "commit", "-m", "corroborated api disposition")
        _git(repo_root, "push", "origin", "main")

        reason = tmp_path / "reason.md"
        reason.write_text("incident-recovery close\n", encoding="utf-8")
        outcome = close_session.run(_ns(
            session_set_dir=str(incident_repo),
            force=True,
            reason_file=str(reason),
        ))
        assert outcome.result == "succeeded", outcome.messages
        assert outcome.verification_method == "api"

    def test_force_close_without_disposition_records_skipped(
        self, tmp_path, monkeypatch
    ):
        """A force close with no disposition has no method to honor —
        "skipped" remains the honest fallback record."""
        set_dir = _make_set(tmp_path)
        monkeypatch.setenv("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", "1")
        reason = tmp_path / "reason.md"
        reason.write_text("incident-recovery close\n", encoding="utf-8")
        outcome = close_session.run(_ns(
            session_set_dir=str(set_dir),
            force=True,
            reason_file=str(reason),
        ))
        assert outcome.result == "succeeded", outcome.messages
        assert outcome.verification_method == "skipped"

    def test_manual_verify_now_warns_on_the_incident_token(
        self, incident_repo, tmp_path, monkeypatch
    ):
        """The named residual of the Set 116 S3 ruling, pinned.

        Until 2026-08-10, --manual-verify bypassed the evidence layer but
        the vocabulary layer still refused the incident's illegal token,
        so an attested close of the exact incident shape failed. The
        operator's ruling demoted that check to warn-not-block, having
        been shown this consequence by name, so the close now SUCCEEDS
        and the illegal token reaches session-state.json.

        What must remain true, and is asserted here: the check still ran,
        it still returned its refusal, the refusal is still reported, and
        it is marked non-blocking rather than quietly passed. A demotion
        that lost the signal would be a deletion wearing its name.
        """
        monkeypatch.setenv(
            "AI_ROUTER_METRICS_PATH",
            str(incident_repo.parent / "no-metrics.jsonl"),
        )
        reason = tmp_path / "attestation.md"
        reason.write_text(
            "operator attests: verified out-of-band on another engine\n",
            encoding="utf-8",
        )
        outcome = close_session.run(_ns(
            session_set_dir=str(incident_repo),
            manual_verify=True,
            reason_file=str(reason),
        ))
        assert outcome.result == "succeeded", outcome.messages
        vocab = next(
            g for g in outcome.gate_results
            if g.check == "verification_method_vocabulary"
        )
        assert vocab.passed is False
        assert vocab.blocking is False
        assert "manual" in vocab.remediation
        # The warning reaches the operator-facing message list, not just
        # the JSON: a kept signal nobody prints is not a kept signal.
        assert any(
            "verification_method_vocabulary WARNING" in m
            for m in outcome.messages
        ), outcome.messages

    def test_the_incident_token_still_blocks_without_manual_verify(
        self, incident_repo, monkeypatch
    ):
        """The demotion's boundary, from the other side.

        The Set 083 incident shape — an illegal token plus a
        self-attested verdict — still cannot close on an ordinary
        (unattested) path. It is refused by verification_integrity,
        which has no corroboration path for a token it does not know,
        rather than by the spelling check. Without this test the
        demotion would look like it had reopened the incident.
        """
        monkeypatch.setenv(
            "AI_ROUTER_METRICS_PATH",
            str(incident_repo.parent / "no-metrics.jsonl"),
        )
        outcome = close_session.run(_ns(session_set_dir=str(incident_repo)))
        assert outcome.result == "gate_failed"
        blocked = {
            g.check for g in outcome.gate_results
            if not g.passed and g.blocking
        }
        assert blocked
        assert "verification_method_vocabulary" not in blocked

    def test_manual_verify_is_the_sanctioned_evidence_bypass(
        self, incident_repo, tmp_path, monkeypatch
    ):
        """With a LEGAL method token whose evidence would fail (a claimed
        verdict under manual-via-other-engine and no zero-budget
        declaration), --manual-verify (attested, logged) closes the
        session: the verification-integrity row records the
        evidence-bypass note."""
        monkeypatch.setenv(
            "AI_ROUTER_METRICS_PATH",
            str(incident_repo.parent / "no-metrics.jsonl"),
        )
        repo_root = incident_repo.parents[2]
        write_disposition(str(incident_repo), Disposition(
            status="completed",
            summary="attested out-of-band verification",
            verification_method="manual-via-other-engine",
            verification_verdict="VERIFIED",
            next_orchestrator=_valid_next_orc(),
        ))
        _git(repo_root, "add", "-A")
        _git(repo_root, "commit", "-m", "legal-token attested disposition")
        _git(repo_root, "push", "origin", "main")

        # Sanity: without --manual-verify this close is blocked (no
        # zero-budget declaration corroborates the claimed verdict).
        blocked = close_session.run(_ns(session_set_dir=str(incident_repo)))
        assert blocked.result == "gate_failed"

        reason = tmp_path / "attestation.md"
        reason.write_text(
            "operator attests: verified out-of-band on another engine\n",
            encoding="utf-8",
        )
        outcome = close_session.run(_ns(
            session_set_dir=str(incident_repo),
            manual_verify=True,
            reason_file=str(reason),
        ))
        assert outcome.result == "succeeded", outcome.messages
        vi = next(
            g for g in outcome.gate_results
            if g.check == VERIFICATION_INTEGRITY_CHECK_NAME
        )
        assert vi.passed
        assert "--manual-verify" in vi.remediation


# ---------------------------------------------------------------------------
# Set 086 S1 — the ledger axis (fail loud on a fully-simulated session)
# ---------------------------------------------------------------------------

class TestLedgerAxis:
    """A Full-tier close requires a router-written events ledger. Its absence
    is the fully-simulated signature (no canonical writer ever ran) and now
    HIGH-blocks the verification-integrity gate, orthogonal to the verdict/
    stamp axis. ``_make_set`` builds a real ledger via register_session_start;
    these tests remove/empty it to model the incident."""

    def _delete_ledger(self, set_dir: Path) -> None:
        (set_dir / "session-events.jsonl").unlink()

    def test_absent_ledger_blocks_even_with_valid_evidence(
        self, tmp_path, monkeypatch
    ):
        set_dir = _make_set(tmp_path)
        _write_metrics(
            tmp_path, monkeypatch, [write_stamped_evidence(set_dir)]
        )
        self._delete_ledger(set_dir)
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "session-events.jsonl" in remediation
        assert "HIGH" in remediation

    def test_empty_ledger_blocks(self, tmp_path, monkeypatch):
        set_dir = _make_set(tmp_path)
        _write_metrics(
            tmp_path, monkeypatch, [write_stamped_evidence(set_dir)]
        )
        (set_dir / "session-events.jsonl").write_text("", encoding="utf-8")
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "no canonical-writer event" in remediation

    def test_ledger_axis_short_circuits_before_verdict_axis(self, tmp_path):
        # No evidence at all AND no ledger: the LEDGER message must win (it is
        # the root cause and runs first), not the verdict/artifact message.
        set_dir = _make_set(tmp_path)
        self._delete_ledger(set_dir)
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "session-events.jsonl" in remediation
        # The verdict-axis artifact message must NOT be what surfaced.
        assert "s1-verification*.md" not in remediation

    def test_present_ledger_passes_ledger_axis(self, tmp_path, monkeypatch):
        # Sanity: with the real ledger left in place, full valid evidence
        # closes (the ledger axis is satisfied).
        set_dir = _make_set(tmp_path)
        _write_metrics(
            tmp_path, monkeypatch, [write_stamped_evidence(set_dir)]
        )
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert passed, remediation

    def test_unreadable_ledger_fails_closed(self, tmp_path, monkeypatch):
        # Round-5 finding: an existing-but-unreadable ledger (a directory in
        # its place) must BLOCK, not fall through to the verdict axis.
        set_dir = _make_set(tmp_path)
        events = set_dir / "session-events.jsonl"
        events.unlink()
        events.mkdir()
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "could not be read" in remediation or "unreadable" in remediation

    def test_unreadable_state_file_fails_closed(self, tmp_path):
        # Round-5 class: a state file present but unparseable must fail closed,
        # not pass the ledger axis (an unreadable snapshot cannot corroborate).
        set_dir = _make_set(tmp_path)
        (set_dir / "session-state.json").write_text(
            "{ not valid json", encoding="utf-8"
        )
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "failing closed" in remediation

    def test_legacy_tier_line_does_not_exempt_an_absent_ledger(self, tmp_path):
        # Set 112: the ledger axis used to sit behind the Lightweight
        # early-out. A leftover tier line in a consumer's spec must not
        # buy an absent ledger a pass.
        set_dir = _make_set(tmp_path, tier_line="tier: lightweight")
        self._delete_ledger(set_dir)
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "missing verification evidence" in remediation

    def test_ledger_check_fails_closed_on_internal_error(
        self, tmp_path, monkeypatch
    ):
        # Round-1 finding: a failure inside the ledger detector must BLOCK
        # (fail closed), never silently pass — this axis is the safety net.
        set_dir = _make_set(tmp_path)  # has a real ledger
        import writer_discipline as wd

        def _raise(*a, **k):
            raise RuntimeError("boom")

        monkeypatch.setattr(wd, "detect_writer_bypass", _raise)
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "failing closed" in remediation
