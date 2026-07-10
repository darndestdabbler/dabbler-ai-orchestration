"""Set 084 Session 1 — identity resolution + dynamic verifier exclusion.

The Layer-1 matrix from the spec (Session 1 step 5):

- the **incident-3 regression fixture** (orchestrator ``engine: copilot,
  model: claude-sonnet-4.6``): a ``claude-sonnet-4.6`` verification row
  is refused by the close gate as same-provider, and selection refuses
  to pick any anthropic verifier under the exclusion;
- the **arbitrary-label fixture** (seat label says ``openai``, model
  says anthropic — the model wins);
- the **missing-model multi-provider fixture** (``start_session``
  refuses; the gate fails closed);
- the **single-vendor back-compat fixture** (existing sets — engine +
  provider label, no model — keep closing);
- the **no-diverse-catalog fixture** (copilot-cli exclusion against a
  single-provider catalog → ``verification_unavailable``).

Plus the unit matrix for ``ai_router/orchestrator_identity.py`` itself
and the exclusion-aware selection helpers (``pick_model`` /
``get_escalation_model``). No metered calls anywhere.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import ai_router
import start_session
from gate_checks import check_verification_integrity
from models import pick_model
from orchestrator_identity import (
    IDENTITY_PROVENANCE_VALUES,
    IdentityResolutionError,
    MULTI_PROVIDER_ENGINES,
    PROVENANCE_ASSERTED,
    PROVENANCE_DIRECT,
    SOURCE_MODEL_REGISTRY,
    SOURCE_PROVIDER_FIELD,
    classify_identity_provenance,
    is_multi_provider_engine,
    resolve_model_provider,
    resolve_orchestrator_identity,
    resolve_session_orchestrator_identity,
)
from session_state import build_orchestrator_block, register_session_start
from ai_router.utils import get_escalation_model
import ai_router.copilot_preflight as _cp_pkg
from ai_router.copilot_preflight import PreflightResult as _PreflightResult


@pytest.fixture(autouse=True)
def _stub_copilot_preflight(monkeypatch):
    """Stub the Set 086 copilot-seat preflight to PASS.

    The copilot-engine identity fixtures here run ``start_session``, which now
    runs the real preflight (``which copilot``). Stubbing keeps them off the real
    CLI so they do not require ``copilot`` to be installed (absent in CI); the
    tests still reach their intended identity/exclusion assertions. The
    preflight's own behavior is covered by test_copilot_preflight.py /
    test_start_session.py.
    """
    monkeypatch.setattr(
        _cp_pkg,
        "run_preflight",
        lambda *a, **k: _PreflightResult(
            ok=True, stage="live-probe", error_class=None, message="stubbed"
        ),
    )
# The PACKAGE class object — the one production route()/verify_session
# raise and catch (I-084-S1-2: a bare `from verification import ...` binds
# a DISTINCT class under the conftest sys.path shim and would miss the
# except clause; this test file exercises the production identity).
from ai_router.verification import VerificationUnavailableError
from ai_router import verify_session as vs
from copilot_catalog import Catalog, CatalogMeta, ModelEntry


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

# A hermetic registry mirroring router-config.yaml's shape (never load
# the live config in unit tests).
REGISTRY = {
    "sonnet": {"provider": "anthropic", "model_id": "claude-sonnet-4-6",
               "tier": 2, "output_cost_per_1m": 15.0},
    "opus": {"provider": "anthropic", "model_id": "claude-opus-4-8",
             "tier": 3, "output_cost_per_1m": 25.0},
    "gemini-pro": {"provider": "google", "model_id": "gemini-2.5-pro",
                   "tier": 2, "output_cost_per_1m": 10.0},
    "gemini-flash": {"provider": "google", "model_id": "gemini-2.5-flash",
                     "tier": 1, "output_cost_per_1m": 2.5},
    "gpt-5-4": {"provider": "openai", "model_id": "gpt-5.4",
                "tier": 3, "output_cost_per_1m": 15.0},
    "gpt-5-4-mini": {"provider": "openai", "model_id": "gpt-5.4-mini",
                     "tier": 2, "output_cost_per_1m": 4.5},
}

ROUTING_CONFIG = {
    "models": REGISTRY,
    "routing": {
        "tier1_max_complexity": 30,
        "tier2_max_complexity": 65,
        "tier_assignments": {1: "gemini-flash", 2: "gemini-pro", 3: "opus"},
        "task_type_overrides": {"session-verification": "gpt-5-4"},
    },
    "escalation": {"max_escalations": 2},
}

# The exact incident-3 orchestrator shape: a Copilot seat whose model
# picker ran claude-sonnet-4.6 while the free-text seat label drifted.
INCIDENT3_BLOCK = {
    "engine": "copilot",
    "provider": "openai",  # the arbitrary label — must NOT win
    "model": "claude-sonnet-4.6",
}


def _make_gate_set(
    tmp_path: Path,
    orchestrator: dict,
) -> Path:
    """A ``<root>/docs/session-sets/<slug>`` set with session 1 in flight
    and an arbitrary orchestrator block (hand-written state so the gate
    sees exactly the shape under test).

    Set 086 S1: a real Full-tier set always has a router-written
    ``session-events.jsonl`` ledger (start_session's boundary write), and the
    verification-integrity gate now fails loud on its absence. These fixtures
    exercise the identity/evidence axis, not the ledger axis, so they carry a
    minimal non-empty ledger — the honest shape of a router-executed set.
    """
    set_dir = tmp_path / "docs" / "session-sets" / "identity-set"
    set_dir.mkdir(parents=True)
    (set_dir / "spec.md").write_text("# spec\n", encoding="utf-8")
    state = {
        "schemaVersion": 4,
        "sessionSetName": "identity-set",
        "status": "in-progress",
        "sessions": [
            {
                "number": 1,
                "title": "Session 1",
                "status": "in-progress",
                "startedAt": "2026-07-07T09:00:00-04:00",
                "completedAt": None,
                "orchestrator": orchestrator,
                "verificationVerdict": None,
            },
        ],
    }
    (set_dir / "session-state.json").write_text(
        json.dumps(state, indent=2), encoding="utf-8"
    )
    (set_dir / "session-events.jsonl").write_text(
        json.dumps({"ts": "2026-07-07T09:00:00-04:00", "event": "work_started"})
        + "\n",
        encoding="utf-8",
    )
    (set_dir / "s1-verification.md").write_text("raw\n", encoding="utf-8")
    return set_dir


def _write_metrics(tmp_path: Path, monkeypatch, rows: list) -> None:
    metrics = tmp_path / "router-metrics.jsonl"
    metrics.write_text(
        "".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8"
    )
    monkeypatch.setenv("AI_ROUTER_METRICS_PATH", str(metrics))


def _row(model: str, provider: str = "irrelevant") -> dict:
    return {
        "task_type": "session-verification",
        "session_set": "identity-set",
        "session_number": 1,
        "provider": provider,  # deliberately untrusted
        "model": model,
    }


def _api_disposition():
    from disposition import Disposition

    return Disposition(
        status="completed",
        summary="identity matrix",
        verification_method="api",
        verification_verdict="VERIFIED",
    )


def _fake_catalog(*entries: tuple) -> Catalog:
    """A seat catalog with the given (model_id, provider) CONFIRMED."""
    return Catalog(
        meta=CatalogMeta(
            schema_version=1,
            cli_name="GitHub Copilot CLI",
            cli_version="1.0.68",
            cli_version_pin_required=True,
            seat_id="test-seat",
            seat_label="test",
            source="empirical-probe",
            probed_at="2026-07-07T00:00:00Z",
        ),
        models=[
            ModelEntry(id=mid, provider=prov, enablement="confirmed")
            for mid, prov in entries
        ],
    )


# ---------------------------------------------------------------------------
# resolve_model_provider — the registry lookup
# ---------------------------------------------------------------------------

class TestResolveModelProvider:
    @pytest.mark.parametrize("model,expected", [
        ("sonnet", "anthropic"),                # registry key
        ("claude-sonnet-4-6", "anthropic"),     # exact model_id
        ("claude-sonnet-4.6", "anthropic"),     # normalized dot form
        ("gpt-5.4", "openai"),                  # exact model_id
        ("GPT-5-4", "openai"),                  # normalized key casing
        ("gemini-2.5-pro", "google"),
    ])
    def test_registry_resolution(self, model, expected):
        assert resolve_model_provider(model, REGISTRY) == expected

    @pytest.mark.parametrize("model,expected", [
        ("claude-fable-5", "anthropic"),        # copilot universe member
        ("gemini-3.1-pro-preview", "google"),
        ("gpt-5.3-codex", "openai"),
        ("claude-opus-4-7", "anthropic"),       # dash form of universe id
    ])
    def test_copilot_universe_resolution(self, model, expected):
        # Not in the config registry — resolves through the documented
        # Copilot CLI model universe (bounded; never a bare prefix guess).
        assert resolve_model_provider(model, REGISTRY) == expected

    @pytest.mark.parametrize("model", [
        "mystery-model", "", None, "llama-9", "claude"  # not a universe id
    ])
    def test_unknown_models_do_not_resolve(self, model):
        assert resolve_model_provider(model, REGISTRY) is None


# ---------------------------------------------------------------------------
# Provenance classification — derived from the engine, never a choice
# ---------------------------------------------------------------------------

class TestProvenance:
    def test_enum_is_exactly_direct_and_asserted(self):
        assert IDENTITY_PROVENANCE_VALUES == {"direct", "asserted"}

    @pytest.mark.parametrize("engine", sorted(MULTI_PROVIDER_ENGINES))
    def test_multi_provider_engines_are_asserted(self, engine):
        assert is_multi_provider_engine(engine)
        assert classify_identity_provenance(engine) == PROVENANCE_ASSERTED

    def test_case_insensitive(self):
        assert classify_identity_provenance("GitHub-Copilot") == "asserted"

    @pytest.mark.parametrize("engine", [
        "claude-code", "claude", "codex", "gemini-pro", "gpt-5-4",
    ])
    def test_single_vendor_engines_are_direct(self, engine):
        assert not is_multi_provider_engine(engine)
        assert classify_identity_provenance(engine) == PROVENANCE_DIRECT

    @pytest.mark.parametrize("engine", [None, "", "   "])
    def test_missing_engine_derives_nothing(self, engine):
        assert classify_identity_provenance(engine) is None


# ---------------------------------------------------------------------------
# resolve_orchestrator_identity — the block-level contract
# ---------------------------------------------------------------------------

class TestResolveOrchestratorIdentity:
    def test_incident3_arbitrary_label_model_wins(self):
        """The incident-3 shape: seat label says openai, model says
        anthropic — the registry-resolved model wins."""
        identity = resolve_orchestrator_identity(
            INCIDENT3_BLOCK, models_registry=REGISTRY
        )
        assert identity.effective_provider == "anthropic"
        assert identity.provenance == PROVENANCE_ASSERTED
        assert identity.source == SOURCE_MODEL_REGISTRY

    def test_model_wins_for_single_vendor_engines_too(self):
        identity = resolve_orchestrator_identity(
            {"engine": "claude-code", "provider": "openai",
             "model": "claude-fable-5"},
            models_registry=REGISTRY,
        )
        assert identity.effective_provider == "anthropic"
        assert identity.provenance == PROVENANCE_DIRECT

    def test_multi_provider_without_model_fails_closed(self):
        with pytest.raises(IdentityResolutionError) as exc:
            resolve_orchestrator_identity(
                {"engine": "github-copilot", "provider": "anthropic"},
                models_registry=REGISTRY,
            )
        assert "--model" in str(exc.value)

    def test_multi_provider_with_unknown_model_fails_closed(self):
        with pytest.raises(IdentityResolutionError) as exc:
            resolve_orchestrator_identity(
                {"engine": "copilot", "model": "mystery-9000",
                 "provider": "anthropic"},
                models_registry=REGISTRY,
            )
        assert "registry" in str(exc.value)

    def test_single_vendor_back_compat_provider_fallback(self):
        """Existing sets (engine + label, no model) keep resolving —
        the provider field is the explicit second choice."""
        identity = resolve_orchestrator_identity(
            {"engine": "claude-code", "provider": "Anthropic"},
            models_registry=REGISTRY,
        )
        assert identity.effective_provider == "anthropic"
        assert identity.source == SOURCE_PROVIDER_FIELD
        assert identity.provenance == PROVENANCE_DIRECT

    def test_single_vendor_unresolvable_model_read_side_legacy_tolerance(
        self,
    ):
        """READ-side only (I-084-S1-4): pre-084 state files carry model
        strings the registry does not cover; a single-vendor engine's
        label is as trustworthy as its engine, so resolution falls back
        rather than stranding historical sets. The BOUNDARY prevents new
        occurrences — start_session refuses a supplied-but-unresolvable
        model for every engine (tested in TestStartSessionBoundary)."""
        identity = resolve_orchestrator_identity(
            {"engine": "claude-code", "provider": "anthropic",
             "model": "some-internal-build"},
            models_registry=REGISTRY,
        )
        assert identity.effective_provider == "anthropic"
        assert identity.source == SOURCE_PROVIDER_FIELD

    def test_dated_snapshot_id_resolves_to_its_undated_alias(self):
        # Anthropic's canonical API ids carry a -YYYYMMDD suffix; the
        # normalization strips it so the dated form matches the same
        # registry entry (claude-haiku-4.5 in the Copilot universe).
        assert resolve_model_provider(
            "claude-haiku-4-5-20251001", REGISTRY
        ) == "anthropic"

    @pytest.mark.parametrize("invented", [
        "gpt-5.4-20251001",          # I-084-S1-5: invented OpenAI dated id
        "gpt-5-4-20251001",
        "gemini-2.5-pro-20251001",   # invented Google dated id
        "sonnet-20251001",           # dated registry KEY (not claude-*)
    ])
    def test_dated_variants_outside_anthropic_do_not_resolve(
        self, invented
    ):
        """R3 finding I-084-S1-5: the dated-alias convention is
        Anthropic's (claude-*). An invented dated variant of any other
        provider's id must NOT normalize onto a real registry entry —
        it fails to resolve, so the start_session boundary refuses it."""
        assert resolve_model_provider(invented, REGISTRY) is None

    def test_identity_only_registry_entries_resolve(self):
        # Disabled (is_enabled: false) entries are identity-registry
        # coverage for orchestrator-only models — resolvable here,
        # never selectable by pick_model / verifier selection.
        registry = dict(REGISTRY)
        registry["gemini-3-pro"] = {
            "provider": "google", "model_id": "gemini-3-pro",
            "is_enabled": False, "is_enabled_as_verifier": False,
        }
        assert resolve_model_provider("gemini-3-pro", registry) == "google"

    @pytest.mark.parametrize("block", [
        None, {}, {"engine": "claude-code"},
        {"engine": "claude-code", "provider": "  "},
    ])
    def test_nothing_resolvable_fails_closed(self, block):
        with pytest.raises(IdentityResolutionError):
            resolve_orchestrator_identity(block, models_registry=REGISTRY)


# ---------------------------------------------------------------------------
# The writer stamp — identityProvenance via the shared block builder
# ---------------------------------------------------------------------------

class TestWriterStamp:
    def test_copilot_block_is_labeled_asserted(self):
        block = build_orchestrator_block(
            "copilot",
            orchestrator_provider="anthropic",
            orchestrator_model="claude-sonnet-4.6",
        )
        assert block["identityProvenance"] == PROVENANCE_ASSERTED

    def test_direct_block_is_labeled_direct(self):
        block = build_orchestrator_block("claude-code")
        assert block["identityProvenance"] == PROVENANCE_DIRECT

    def test_register_session_start_stamps_provenance(self, tmp_path):
        set_dir = tmp_path / "stamp-set"
        set_dir.mkdir()
        (set_dir / "spec.md").write_text("# spec\n", encoding="utf-8")
        register_session_start(
            session_set=str(set_dir),
            session_number=1,
            total_sessions=1,
            orchestrator_engine="copilot",
            orchestrator_model="claude-sonnet-4.6",
            orchestrator_provider="anthropic",
        )
        state = json.loads(
            (set_dir / "session-state.json").read_text(encoding="utf-8")
        )
        orch = state["sessions"][0]["orchestrator"]
        assert orch["identityProvenance"] == PROVENANCE_ASSERTED

    def test_provenance_survives_the_reader_shim(self, tmp_path):
        from progress import normalize_to_v4_shape

        set_dir = tmp_path / "shim-set"
        set_dir.mkdir()
        (set_dir / "spec.md").write_text("# spec\n", encoding="utf-8")
        register_session_start(
            session_set=str(set_dir),
            session_number=1,
            total_sessions=1,
            orchestrator_engine="copilot",
            orchestrator_model="claude-sonnet-4.6",
        )
        state = json.loads(
            (set_dir / "session-state.json").read_text(encoding="utf-8")
        )
        normalized = normalize_to_v4_shape(state, set_dir / "spec.md")
        orch = normalized["sessions"][0]["orchestrator"]
        assert orch["identityProvenance"] == PROVENANCE_ASSERTED


# ---------------------------------------------------------------------------
# start_session boundary enforcement (missing-model multi-provider fixture)
# ---------------------------------------------------------------------------

def _start_args(set_dir: Path, *extra: str):
    parser = start_session._build_arg_parser()
    return parser.parse_args(
        ["--session-set-dir", str(set_dir), *extra]
    )


class TestStartSessionBoundary:
    @pytest.fixture()
    def set_dir(self, tmp_path: Path) -> Path:
        d = tmp_path / "docs" / "session-sets" / "boundary-set"
        d.mkdir(parents=True)
        (d / "spec.md").write_text(
            "# spec\n\n### Session 1 of 1: Only\n", encoding="utf-8"
        )
        return d

    def test_multi_provider_without_model_is_refused(
        self, set_dir: Path, capsys
    ):
        rc = start_session.run(
            _start_args(set_dir, "--engine", "github-copilot",
                        "--provider", "anthropic")
        )
        assert rc == start_session.EXIT_USAGE
        err = capsys.readouterr().err
        assert "--model" in err
        # Fail-loud BEFORE any write.
        assert not (set_dir / "session-state.json").exists()

    def test_multi_provider_with_unknown_model_is_refused(
        self, set_dir: Path, capsys
    ):
        rc = start_session.run(
            _start_args(set_dir, "--engine", "copilot",
                        "--model", "mystery-9000")
        )
        assert rc == start_session.EXIT_USAGE
        assert "registry" in capsys.readouterr().err
        assert not (set_dir / "session-state.json").exists()

    def test_multi_provider_with_registry_model_starts(
        self, set_dir: Path, capsys
    ):
        rc = start_session.run(
            _start_args(set_dir, "--engine", "copilot",
                        "--provider", "openai",
                        "--model", "claude-sonnet-4.6")
        )
        assert rc == start_session.EXIT_OK
        # The contradicting seat label is noted (model wins at use time).
        assert "seat label" in capsys.readouterr().err
        state = json.loads(
            (set_dir / "session-state.json").read_text(encoding="utf-8")
        )
        orch = state["sessions"][0]["orchestrator"]
        assert orch["identityProvenance"] == PROVENANCE_ASSERTED
        # The label is preserved as a descriptor — resolution ignores it.
        assert orch["provider"] == "openai"

    def test_single_vendor_without_model_still_starts(self, set_dir: Path):
        rc = start_session.run(
            _start_args(set_dir, "--engine", "claude-code",
                        "--provider", "anthropic")
        )
        assert rc == start_session.EXIT_OK

    def test_single_vendor_with_unresolvable_model_is_refused(
        self, set_dir: Path, capsys
    ):
        """I-084-S1-4 (R2 finding): 'validates any supplied model against
        the registry' is engine-independent — a typoed model on a
        single-vendor engine fails loud at the boundary instead of
        silently deferring identity to the free-text label."""
        rc = start_session.run(
            _start_args(set_dir, "--engine", "claude-code",
                        "--provider", "anthropic",
                        "--model", "claude-opus-4-7-typo")
        )
        assert rc == start_session.EXIT_USAGE
        err = capsys.readouterr().err
        assert "does not resolve" in err
        assert "omit --model" in err  # single-vendor remediation named
        assert not (set_dir / "session-state.json").exists()

    def test_single_vendor_with_live_registry_models_starts(
        self, set_dir: Path
    ):
        # The models this repo's orchestrators actually declare must
        # resolve against the LIVE registry (config models: including
        # the identity-only disabled entries + the Copilot universe).
        for model in ("claude-fable-5", "claude-sonnet-5",
                      "claude-opus-4-7", "gemini-3-pro", "gpt-5.4"):
            assert resolve_model_provider(model) is not None, model


# ---------------------------------------------------------------------------
# The close gate — incident-3 regression + back-compat
# ---------------------------------------------------------------------------

class TestGateIncident3:
    def test_same_provider_row_is_refused(self, tmp_path, monkeypatch):
        """Incident 3, exactly: copilot seat on claude-sonnet-4.6; the
        'cross-provider' verification also ran on claude-sonnet-4.6.
        The row resolves anthropic via the registry, the orchestrator
        resolves anthropic via the registry — same provider, refused.
        (Stamped per Set 084 F3 so the refusal isolates the provider
        arm, not the missing stamp.)"""
        set_dir = _make_gate_set(tmp_path, dict(INCIDENT3_BLOCK))
        from stamp_fixtures import write_stamped_evidence

        _write_metrics(
            tmp_path, monkeypatch,
            [write_stamped_evidence(
                set_dir, model="claude-sonnet-4.6", provider="openai",
            )],
        )
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "cross-provider" in remediation

    def test_label_cannot_rescue_a_same_provider_row(
        self, tmp_path, monkeypatch
    ):
        """The seat label says openai on BOTH sides; both models resolve
        anthropic. Neither free-text string is consulted."""
        set_dir = _make_gate_set(tmp_path, dict(INCIDENT3_BLOCK))
        _write_metrics(
            tmp_path, monkeypatch,
            [_row("claude-fable-5", provider="openai")],
        )
        passed, _ = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed

    def test_genuinely_cross_provider_row_corroborates(
        self, tmp_path, monkeypatch
    ):
        set_dir = _make_gate_set(tmp_path, dict(INCIDENT3_BLOCK))
        from stamp_fixtures import write_stamped_evidence

        _write_metrics(
            tmp_path, monkeypatch, [write_stamped_evidence(set_dir)]
        )
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert passed, remediation

    def test_multi_provider_orchestrator_without_model_fails_closed(
        self, tmp_path, monkeypatch
    ):
        set_dir = _make_gate_set(
            tmp_path, {"engine": "copilot", "provider": "openai"}
        )
        _write_metrics(tmp_path, monkeypatch, [_row("gpt-5-4")])
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert not passed
        assert "--model" in remediation

    def test_single_vendor_back_compat_set_still_closes(
        self, tmp_path, monkeypatch
    ):
        """Existing sets (engine + label, no model) keep closing when
        the verification row is genuinely cross-provider (and stamped —
        Set 084 F3)."""
        set_dir = _make_gate_set(
            tmp_path, {"engine": "claude-code", "provider": "anthropic"}
        )
        from stamp_fixtures import write_stamped_evidence

        _write_metrics(
            tmp_path, monkeypatch, [write_stamped_evidence(set_dir)]
        )
        passed, remediation = check_verification_integrity(
            str(set_dir), _api_disposition()
        )
        assert passed, remediation


# ---------------------------------------------------------------------------
# Selection under exclusion — pick_model / escalation (incident-3's
# "selection refuses to pick any anthropic verifier")
# ---------------------------------------------------------------------------

class TestSelectionExclusion:
    def test_pin_survives_when_not_excluded(self):
        # The Claude-orchestrator common case: anthropic excluded, the
        # gpt-5-4 pin survives as the preference.
        assert pick_model(
            70, 3, "session-verification", ROUTING_CONFIG,
            exclude_providers=["anthropic"],
        ) == "gpt-5-4"

    def test_pin_never_overrides_the_exclusion(self):
        # Incident-3 inverted: an OpenAI-effective orchestrator must not
        # get the pinned gpt-5-4 back.
        chosen = pick_model(
            70, 3, "session-verification", ROUTING_CONFIG,
            exclude_providers=["openai"],
        )
        assert chosen is not None
        assert REGISTRY[chosen]["provider"] != "openai"

    def test_anthropic_exclusion_never_yields_anthropic(self):
        # The incident-3 selection clause: with the orchestrator's
        # effective provider (anthropic) excluded, NO anthropic model
        # can be picked at any complexity.
        for score in (10, 45, 70, 95):
            chosen = pick_model(
                score, 3, "session-verification", ROUTING_CONFIG,
                exclude_providers=["anthropic"],
            )
            assert chosen is not None
            assert REGISTRY[chosen]["provider"] != "anthropic"

    def test_no_survivor_returns_none(self):
        assert pick_model(
            70, 3, "session-verification", ROUTING_CONFIG,
            exclude_providers=["anthropic", "openai", "google"],
        ) is None

    def test_no_exclusion_preserves_legacy_behavior(self):
        assert pick_model(
            70, 3, "session-verification", ROUTING_CONFIG
        ) == "gpt-5-4"
        assert pick_model(20, 3, "general", ROUTING_CONFIG) == "gemini-flash"

    def test_escalation_never_crosses_into_excluded_provider(self):
        # tier-2 -> tier-3: the assignment (opus/anthropic) is excluded;
        # the cheapest surviving tier-3 model (gpt-5-4) is used instead.
        nxt = get_escalation_model(
            "gemini-pro", ROUTING_CONFIG, 0, exclude_providers=["anthropic"]
        )
        assert nxt == "gpt-5-4"

    def test_escalation_stops_when_nothing_survives(self):
        nxt = get_escalation_model(
            "gemini-pro", ROUTING_CONFIG, 0,
            exclude_providers=["anthropic", "openai"],
        )
        assert nxt is None


# ---------------------------------------------------------------------------
# Session-level resolution + verify_session wiring
# ---------------------------------------------------------------------------

SPEC_TEXT = """# Test Spec

## Sessions

### Session 1 of 1: Only session

**Steps:**
1. Do it.
"""


def _live_set(tmp_path: Path, orchestrator: dict) -> Path:
    import subprocess

    subprocess.run(["git", "-C", str(tmp_path), "init", "-q"], check=True)
    subprocess.run(
        ["git", "-C", str(tmp_path), "config", "user.email", "t@e.com"],
        check=True,
    )
    subprocess.run(
        ["git", "-C", str(tmp_path), "config", "user.name", "T"], check=True
    )
    set_dir = tmp_path / "docs" / "session-sets" / "identity-set"
    set_dir.mkdir(parents=True)
    (set_dir / "spec.md").write_text(SPEC_TEXT, encoding="utf-8")
    state = {
        "schemaVersion": 4,
        "sessionSetName": "identity-set",
        "status": "in-progress",
        "sessions": [{
            "number": 1, "title": "Only session", "status": "in-progress",
            "startedAt": "2026-07-07T09:00:00-04:00", "completedAt": None,
            "orchestrator": orchestrator, "verificationVerdict": None,
        }],
    }
    (set_dir / "session-state.json").write_text(
        json.dumps(state), encoding="utf-8"
    )
    (tmp_path / "f.py").write_text("x = 1\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(tmp_path), "add", "-A"], check=True)
    subprocess.run(
        ["git", "-C", str(tmp_path), "commit", "-q", "-m", "seed"],
        check=True,
    )
    return set_dir


class TestSessionLevelResolution:
    def test_resolves_in_progress_session(self, tmp_path):
        set_dir = _make_gate_set(tmp_path, dict(INCIDENT3_BLOCK))
        identity = resolve_session_orchestrator_identity(
            str(set_dir), models_registry=REGISTRY
        )
        assert identity.effective_provider == "anthropic"

    def test_missing_state_fails_closed(self, tmp_path):
        empty = tmp_path / "docs" / "session-sets" / "empty-set"
        empty.mkdir(parents=True)
        with pytest.raises(IdentityResolutionError):
            resolve_session_orchestrator_identity(
                str(empty), models_registry=REGISTRY
            )

    def test_missing_dir_fails_closed(self, tmp_path):
        with pytest.raises(IdentityResolutionError):
            resolve_session_orchestrator_identity(
                str(tmp_path / "nope"), models_registry=REGISTRY
            )


class _RecordingRoute:
    def __init__(self, response="VERIFIED -- checked."):
        self.response = response
        self.calls = []

    def __call__(self, prompt, session_set, session_number,
                 complexity_hint, max_tier, exclude_providers=None,
                 verification_stamp=None):
        self.calls.append({
            "exclude_providers": exclude_providers,
            "verification_stamp": verification_stamp,
        })

        class _R:
            content = self.response
            model_name = "fake-verifier"
            truncated = False
            total_cost_usd = 0.01

        return _R()


class TestVerifySessionExclusionWiring:
    def test_exclusion_is_resolved_and_passed(self, tmp_path, capsys):
        set_dir = _live_set(tmp_path, dict(INCIDENT3_BLOCK))
        fake = _RecordingRoute()
        rc = vs.run(_vs_args(set_dir), route_fn=fake)
        assert rc == vs.EXIT_OK
        # The incident-3 orchestrator resolves anthropic (model wins over
        # the openai seat label) and anthropic is what gets excluded.
        assert fake.calls[0]["exclude_providers"] == ["anthropic"]
        assert "excluded providers: anthropic" in capsys.readouterr().out

    def test_unresolvable_identity_refuses_before_any_call(
        self, tmp_path, capsys
    ):
        set_dir = _live_set(
            tmp_path, {"engine": "copilot", "provider": "openai"}
        )
        fake = _RecordingRoute()
        rc = vs.run(_vs_args(set_dir), route_fn=fake)
        assert rc == vs.EXIT_STATE
        assert fake.calls == []
        assert "--model" in capsys.readouterr().err

    def test_verification_unavailable_exits_7_writes_nothing(
        self, tmp_path, capsys
    ):
        set_dir = _live_set(tmp_path, dict(INCIDENT3_BLOCK))

        def unavailable(*a, **k):
            raise VerificationUnavailableError("no diverse candidate")

        rc = vs.run(_vs_args(set_dir), route_fn=unavailable)
        assert rc == vs.EXIT_VERIFICATION_UNAVAILABLE
        # The hard blocked state: no verdict, no artifact, no disposition.
        assert not (set_dir / "s1-verification.md").exists()
        assert not (set_dir / "disposition.json").exists()
        err = capsys.readouterr().err
        assert "VERIFICATION UNAVAILABLE" in err
        assert "--manual-verify" in err

    def test_dry_run_names_the_exclusion(self, tmp_path, capsys):
        set_dir = _live_set(tmp_path, dict(INCIDENT3_BLOCK))
        rc = vs.run(_vs_args(set_dir, dry_run=True),
                    route_fn=_RecordingRoute())
        assert rc == vs.EXIT_OK
        out = capsys.readouterr().out
        assert "excluded providers: anthropic" in out
        assert "asserted" in out


def _vs_args(set_dir: Path, **overrides):
    import argparse  # noqa: F401 — parser namespace built below

    parser = vs._build_arg_parser()
    ns = parser.parse_args(["--session-set-dir", str(set_dir)])
    for key, value in overrides.items():
        setattr(ns, key, value)
    return ns


# ---------------------------------------------------------------------------
# copilot-cli: the no-diverse-catalog fixture -> verification_unavailable
# ---------------------------------------------------------------------------

class TestCopilotCliExclusion:
    CONFIG = {
        "transports": {
            "copilot-cli": {
                "roles": {
                    "generator": {
                        "prefer": ["claude-sonnet-4.6", "gpt-5.5"],
                        "require_provider_in": [
                            "anthropic", "openai", "google",
                        ],
                    },
                },
            },
        },
    }

    def test_exclusion_filters_the_generator_role(self):
        catalog = _fake_catalog(
            ("claude-sonnet-4.6", "anthropic"), ("gpt-5.5", "openai"),
        )
        model_id, provider, failure = ai_router._resolve_copilot_generator(
            self.CONFIG, catalog, exclude_providers=frozenset({"anthropic"})
        )
        assert (model_id, provider) == ("gpt-5.5", "openai")
        assert failure is None

    def test_no_diverse_catalog_resolves_nothing(self):
        # The seat's lockfile confirms only anthropic models; excluding
        # anthropic (the orchestrator's effective provider) leaves no
        # candidate — the route() caller raises the hard
        # verification_unavailable outcome from this None.
        catalog = _fake_catalog(("claude-sonnet-4.6", "anthropic"))
        model_id, provider, failure = ai_router._resolve_copilot_generator(
            self.CONFIG, catalog, exclude_providers=frozenset({"anthropic"})
        )
        assert model_id is None
        assert "excluded providers" in failure
        assert "full confirmed catalog" in failure

    def test_exclusion_falls_back_to_confirmed_entries_beyond_prefer(self):
        """R3 finding I-084-S1-6: the prefer list is a preference ORDER,
        not the candidate universe. A confirmed different-provider entry
        that prefer does not name must still resolve under exclusion —
        verification_unavailable only fires when the whole confirmed
        catalog has no surviving candidate."""
        # gemini-3.5-flash is confirmed on the seat but NOT in the
        # generator prefer list ([claude-sonnet-4.6, gpt-5.5]).
        catalog = _fake_catalog(
            ("claude-sonnet-4.6", "anthropic"),
            ("gemini-3.5-flash", "google"),
        )
        model_id, provider, failure = ai_router._resolve_copilot_generator(
            self.CONFIG, catalog,
            exclude_providers=frozenset({"anthropic"}),
        )
        assert (model_id, provider) == ("gemini-3.5-flash", "google")
        assert failure is None

    def test_fallback_scan_respects_require_provider_in(self):
        config = {
            "transports": {"copilot-cli": {"roles": {"generator": {
                "prefer": ["claude-sonnet-4.6"],
                "require_provider_in": ["anthropic", "openai"],
            }}}},
        }
        # google is confirmed and unexcluded but NOT an allowed provider.
        catalog = _fake_catalog(
            ("claude-sonnet-4.6", "anthropic"),
            ("gemini-3.5-flash", "google"),
        )
        model_id, _provider, failure = ai_router._resolve_copilot_generator(
            config, catalog, exclude_providers=frozenset({"anthropic"})
        )
        assert model_id is None
        assert failure is not None

    def test_no_exclusion_keeps_the_prefer_only_contract(self):
        # Pre-084 behavior unchanged: without an exclusion, the
        # generator role resolves from prefer alone — a confirmed
        # non-prefer entry does NOT get picked up.
        catalog = _fake_catalog(("gemini-3.5-flash", "google"))
        model_id, _provider, failure = ai_router._resolve_copilot_generator(
            self.CONFIG, catalog
        )
        assert model_id is None
        assert failure is not None

    def test_error_type_is_the_hard_outcome(self):
        # The exception route() raises for this state is typed and names
        # the operator-attested manual path.
        err = VerificationUnavailableError("reason text")
        assert "reason text" in str(err)
        assert err.reason == "reason text"


# ---------------------------------------------------------------------------
# R1 remediations (this session's own verification round 1)
# ---------------------------------------------------------------------------

class TestR1ExceptionClassIdentity:
    """I-084-S1-2: verify_session's except clause must catch the CLASS
    OBJECT route() actually raises (ai_router.verification.*), not a
    bare-import sibling that can be a distinct class under sys.path
    shims."""

    def test_package_raised_exception_is_caught_as_exit_7(
        self, tmp_path, capsys
    ):
        import ai_router.verification as pkg_verification

        set_dir = _live_set(tmp_path, dict(INCIDENT3_BLOCK))

        def unavailable_via_package_class(*a, **k):
            # Exactly what route() raises in production: the class from
            # the PACKAGE module object.
            raise pkg_verification.VerificationUnavailableError(
                "no diverse candidate (package class)"
            )

        rc = vs.run(_vs_args(set_dir), route_fn=unavailable_via_package_class)
        assert rc == vs.EXIT_VERIFICATION_UNAVAILABLE
        assert "--manual-verify" in capsys.readouterr().err


class TestR1ExclusionUnion:
    """I-084-S1-3: a caller-supplied exclude_providers can ADD exclusions
    but never REMOVE the session-derived one — route() unions them."""

    def _fake_api(self, captured):
        from providers import APIResult

        def fake_call_model(provider_name, model_id, system_prompt,
                            user_message, max_tokens, config,
                            generation_params):
            captured.append((provider_name, model_id))
            return APIResult(
                content="VERIFIED -- checked the diff end to end.",
                input_tokens=10,
                output_tokens=64,
                stop_reason="end_turn",
            )

        return fake_call_model

    @pytest.fixture()
    def routed(self, monkeypatch, tmp_path):
        """route() with the network + metrics seams faked out."""
        monkeypatch.setattr(ai_router, "_config", None)
        monkeypatch.setattr(ai_router, "_rate_limiters", {})
        monkeypatch.setattr(
            ai_router, "record_call", lambda *a, **k: None
        )
        monkeypatch.setenv(
            "AI_ROUTER_METRICS_PATH", str(tmp_path / "metrics.jsonl")
        )
        captured = []
        monkeypatch.setattr(
            ai_router, "call_model", self._fake_api(captured)
        )
        return captured

    def test_caller_list_cannot_drop_the_session_exclusion(
        self, routed, tmp_path
    ):
        # The incident-3 orchestrator resolves anthropic. A bare route()
        # caller passes an exclusion that deliberately OMITS anthropic —
        # the session-derived exclusion must still apply (union), so the
        # dispatched provider is neither anthropic nor the caller's
        # openai.
        set_dir = _live_set(tmp_path, dict(INCIDENT3_BLOCK))
        result = ai_router.route(
            content="verify this",
            task_type="session-verification",
            session_set=str(set_dir),
            session_number=1,
            exclude_providers=["openai"],
        )
        providers_hit = {p for p, _m in routed}
        assert "anthropic" not in providers_hit
        assert "openai" not in providers_hit
        assert providers_hit  # something DID run (google survives)
        assert result.model_name is not None

    def test_bare_call_with_session_context_excludes_orchestrator(
        self, routed, tmp_path
    ):
        # The incident-3 bare-route shape itself: no explicit exclusion,
        # session context present -> the orchestrator's provider
        # (anthropic) is excluded by resolution; the gpt-5-4 pin
        # survives as the preference.
        set_dir = _live_set(tmp_path, dict(INCIDENT3_BLOCK))
        ai_router.route(
            content="verify this",
            task_type="session-verification",
            session_set=str(set_dir),
            session_number=1,
        )
        providers_hit = {p for p, _m in routed}
        assert providers_hit == {"openai"}

    def test_unresolvable_identity_fails_closed_at_route(
        self, routed, tmp_path
    ):
        set_dir = _live_set(
            tmp_path, {"engine": "copilot", "provider": "openai"}
        )
        # route() raises the PACKAGE class (ai_router.IdentityResolutionError),
        # which is distinct from this file's bare-imported sibling.
        with pytest.raises(ai_router.IdentityResolutionError):
            ai_router.route(
                content="verify this",
                task_type="session-verification",
                session_set=str(set_dir),
                session_number=1,
            )
        assert routed == []  # refused before any dispatch


# ---------------------------------------------------------------------------
# I-084-S1-1: the machine-readable JSON schema surface + parity (L-066-1)
# ---------------------------------------------------------------------------

SCHEMA_PATH = (
    Path(__file__).resolve().parent.parent
    / "schemas"
    / "session-state.schema.json"
)


@pytest.fixture(scope="module")
def state_schema() -> dict:
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def state_validator(state_schema):
    import jsonschema

    cls = jsonschema.validators.validator_for(state_schema)
    cls.check_schema(state_schema)
    return cls(state_schema)


class TestSessionStateSchemaParity:
    """Both directions of L-066-1 for the new schema surface: what the
    live WRITER emits validates against the JSON schema, and the JSON
    schema rejects what the writer refuses (the identityProvenance
    enum)."""

    def test_schema_file_exists(self):
        assert SCHEMA_PATH.is_file()

    def test_committed_reference_example_validates(self, state_validator):
        example_path = (
            Path(__file__).resolve().parents[2]
            / "docs"
            / "session-state-schema-example.json"
        )
        example = json.loads(example_path.read_text(encoding="utf-8"))
        errors = list(state_validator.iter_errors(example))
        assert not errors, [e.message for e in errors]

    def test_live_writer_output_validates(self, tmp_path, state_validator):
        set_dir = tmp_path / "writer-set"
        set_dir.mkdir()
        (set_dir / "spec.md").write_text(
            "# spec\n\n### Session 1 of 2: A\n\n### Session 2 of 2: B\n",
            encoding="utf-8",
        )
        register_session_start(
            session_set=str(set_dir),
            session_number=1,
            total_sessions=2,
            orchestrator_engine="copilot",
            orchestrator_model="claude-sonnet-4.6",
            orchestrator_provider="anthropic",
            orchestrator_effort="high",
        )
        state = json.loads(
            (set_dir / "session-state.json").read_text(encoding="utf-8")
        )
        errors = list(state_validator.iter_errors(state))
        assert not errors, [e.message for e in errors]
        # And the F1 field is actually present on the validated output.
        orch = state["sessions"][0]["orchestrator"]
        assert orch["identityProvenance"] == "asserted"

    def test_schema_rejects_a_bad_provenance_token(
        self, tmp_path, state_validator
    ):
        set_dir = tmp_path / "bad-set"
        set_dir.mkdir()
        (set_dir / "spec.md").write_text(
            "# spec\n\n### Session 1 of 1: A\n", encoding="utf-8"
        )
        register_session_start(
            session_set=str(set_dir),
            session_number=1,
            total_sessions=1,
            orchestrator_engine="claude-code",
        )
        state = json.loads(
            (set_dir / "session-state.json").read_text(encoding="utf-8")
        )
        state["sessions"][0]["orchestrator"]["identityProvenance"] = (
            "self-attested"
        )
        errors = list(state_validator.iter_errors(state))
        assert errors  # the enum rejects what the writer would refuse

    def test_schema_accepts_pre_084_block_without_provenance(
        self, state_validator
    ):
        # identityProvenance is ADDITIVE: historical blocks omit it.
        state = {
            "schemaVersion": 4,
            "sessionSetName": "legacy-set",
            "status": "in-progress",
            "sessions": [{
                "number": 1, "title": "S1", "status": "in-progress",
                "startedAt": "t", "completedAt": None,
                "orchestrator": {
                    "engine": "claude-code", "provider": "anthropic",
                },
                "verificationVerdict": None,
            }],
        }
        errors = list(state_validator.iter_errors(state))
        assert not errors, [e.message for e in errors]

    def test_schema_accepts_the_planless_carveout(self, state_validator):
        state = {
            "schemaVersion": 4,
            "sessionSetName": "planless-set",
            "status": "in-progress",
            "startedAt": "2026-07-07T09:00:00-04:00",
            "orchestrator": {
                "engine": "claude-code",
                "identityProvenance": "direct",
            },
        }
        errors = list(state_validator.iter_errors(state))
        assert not errors, [e.message for e in errors]
