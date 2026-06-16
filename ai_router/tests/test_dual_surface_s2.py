"""Set 070 (S2) - tests for the provenance merge, comparison artifact + validator,
the fair-shake scoring, and the dual-surface mode wiring.

Hermetic: no metered LLM call, no real git. The merge / validator / scorers are
pure functions; the mode wiring writes only to a tmp activity-log.json.

What is pinned:
- the provenance merge NEVER collapses on free-text - only a shared, stable
  defectKey merges to ``both``; unkeyed findings stay single-surface (the safe
  over-split), and the result honestly flags provenance-incompleteness;
- the comparison artifact validator is in L-066-1 parity with the JSON Schema
  (closed envelope, int-not-bool, typed optionals, the cross-field provenance
  invariants the schema cannot express);
- the scoring derives the push-unique/pull-unique/shared high-sev tallies and the
  benchmark RETIRE telemetry, forces INCONCLUSIVE when underpowered, and refuses
  to pool sampled with opt-in;
- the mode wiring records once at set start (immutable), reads back the durable
  choice, and the sampled trigger is deterministic (injected draw).
"""

from __future__ import annotations

import json
from pathlib import Path

import jsonschema
import pytest

import dual_surface_verify as dsv

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = REPO_ROOT / "docs" / "dual-surface-comparison.schema.json"
EXAMPLE = REPO_ROOT / "docs" / "dual-surface-comparison-schema-example.json"


def _load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def _finding(description, *, severity="", category="", key=None):
    f = {"description": description}
    if severity:
        f["severity"] = severity
    if category:
        f["category"] = category
    if key is not None:
        f["defectKey"] = key
    return f


# ---------------------------------------------------------------------------
# Provenance merge
# ---------------------------------------------------------------------------


class TestMerge:
    def test_shared_key_merges_to_both_preserving_both_descriptions(self):
        push = [_finding("push wording", severity="Major", key="k1")]
        pull = [_finding("pull wording", severity="Critical", category="bug", key="k1")]
        res = dsv.merge_findings(push, pull)
        assert len(res.findings) == 1
        mf = res.findings[0]
        assert mf.provenance == dsv.PROVENANCE_BOTH
        assert mf.defect_key == "k1"
        # severity is the MOST severe across arms; both wordings preserved.
        assert mf.severity == "Critical"
        descs = {c.surface: c.description for c in mf.contributors}
        assert descs == {"push": "push wording", "pull": "pull wording"}
        assert res.provenance_complete is True
        assert res.push_unkeyed == 0 and res.pull_unkeyed == 0

    def test_distinct_keys_stay_unique_even_with_identical_wording(self):
        # SAME wording, DIFFERENT keys -> NEVER merged (description is not identity).
        push = [_finding("same wording", severity="Major", key="kA")]
        pull = [_finding("same wording", severity="Major", key="kB")]
        res = dsv.merge_findings(push, pull)
        provs = sorted(f.provenance for f in res.findings)
        assert provs == [dsv.PROVENANCE_PULL_ONLY, dsv.PROVENANCE_PUSH_ONLY]
        assert res.provenance_complete is True

    def test_unkeyed_findings_never_merge_and_flag_incompleteness(self):
        # SAME wording, NO keys -> still NOT merged (the safe over-split), and the
        # result flags that the unique tallies are an upper bound.
        push = [_finding("same wording", severity="Major")]
        pull = [_finding("same wording", severity="Major")]
        res = dsv.merge_findings(push, pull)
        assert len(res.findings) == 2
        assert {f.provenance for f in res.findings} == {
            dsv.PROVENANCE_PUSH_ONLY, dsv.PROVENANCE_PULL_ONLY
        }
        assert res.provenance_complete is False
        assert res.push_unkeyed == 1 and res.pull_unkeyed == 1

    def test_intra_arm_duplicate_key_folds_to_one_entry(self):
        # Two push findings with the SAME key are one contributor set, not two
        # entries (a duplicated key must not double-count the same arm).
        push = [
            _finding("first", severity="Major", key="k1"),
            _finding("second", severity="Minor", key="k1"),
        ]
        res = dsv.merge_findings(push, [])
        assert len(res.findings) == 1
        mf = res.findings[0]
        assert mf.provenance == dsv.PROVENANCE_PUSH_ONLY
        assert len(mf.contributors) == 2
        assert mf.severity == "Major"  # most severe across the two

    def test_ordering_both_then_keyed_single_then_unkeyed(self):
        push = [
            _finding("u", severity="Major"),               # unkeyed push
            _finding("shared", severity="Major", key="s"),  # both
            _finding("ponly", severity="Major", key="p"),   # push-only keyed
        ]
        pull = [_finding("shared2", severity="Major", key="s")]
        res = dsv.merge_findings(push, pull)
        # Pin the ORDER on the actual keys, not just labels: keyed-both ('s')
        # first, then keyed single-surface ('p'), then unkeyed ('') last. The two
        # trailing entries are both push-only, so a label-only assertion would not
        # catch a keyed/unkeyed swap (gpt-5-4 S2 R1).
        assert [f.defect_key for f in res.findings] == ["s", "p", ""]
        assert [f.provenance for f in res.findings] == [
            dsv.PROVENANCE_BOTH, dsv.PROVENANCE_PUSH_ONLY, dsv.PROVENANCE_PUSH_ONLY
        ]
        # And the unkeyed entry is the trailing one (the actual unkeyed push finding).
        assert res.findings[-1].contributors[0].description == "u"
        assert res.provenance_complete is False

    def test_non_dict_findings_are_skipped(self):
        res = dsv.merge_findings([None, "x", _finding("ok", key="k")], [])
        assert len(res.findings) == 1 and res.findings[0].defect_key == "k"

    def test_custom_key_of(self):
        push = [{"description": "d", "severity": "Major", "caseId": "c1"}]
        pull = [{"description": "e", "severity": "Major", "caseId": "c1"}]
        res = dsv.merge_findings(push, pull, key_of=lambda f: f.get("caseId", ""))
        assert res.findings[0].provenance == dsv.PROVENANCE_BOTH

    def test_is_high_severity(self):
        assert dsv.is_high_severity("Critical")
        assert dsv.is_high_severity("major")
        assert not dsv.is_high_severity("Minor")
        assert not dsv.is_high_severity("")
        assert not dsv.is_high_severity(None)


# ---------------------------------------------------------------------------
# Comparison artifact: schema <-> validator parity (L-066-1)
# ---------------------------------------------------------------------------


class TestSchemaParity:
    def test_files_exist(self):
        assert SCHEMA.is_file() and EXAMPLE.is_file()

    def test_schema_is_valid(self):
        schema = _load(SCHEMA)
        jsonschema.validators.validator_for(schema).check_schema(schema)

    def test_example_conforms_to_schema(self):
        jsonschema.validate(_load(EXAMPLE), _load(SCHEMA))

    def test_example_passes_python_validator(self):
        res = dsv.validate_comparison_artifact(
            _load(EXAMPLE),
            expected_set_name="070-dual-surface-verification-telemetry",
        )
        assert res.ok and res.code == dsv.COMPARISON_OK
        assert res.run_tag == dsv.RUN_TAG_OPT_IN

    def test_schema_if_then_rejects_complete_with_nonzero_count(self):
        # PARITY (S3 path-aware dogfood, gpt-5.4): the JSON Schema's if/then now
        # rejects provenanceComplete=true with a nonzero unkeyed count, matching the
        # Python validator (a schema-only consumer no longer accepts what the runtime
        # rejects). The cross-array 'no unkeyed finding' half stays runtime-only.
        schema = _load(SCHEMA)
        art = _load(EXAMPLE)
        assert art["provenanceComplete"] is True
        art["pushUnkeyed"] = 2  # nonzero while complete -> must fail under the schema
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(art, schema)
        # ... and the Python validator agrees (parity).
        assert not dsv.validate_comparison_artifact(art).ok

    def test_schema_if_then_rejects_complete_with_unkeyed_finding(self):
        # PARITY (R4 Major): the schema now forbids an unkeyed finding when
        # provenanceComplete=true even with zero counts (not/contains over findings),
        # matching the Python validator -- JSON Schema CAN express this cross-array half.
        schema = _load(SCHEMA)
        art = _load(EXAMPLE)
        assert art["provenanceComplete"] is True  # counts stay 0
        art["findings"].append({
            "defectKey": "",  # unkeyed while complete -> must fail under the schema
            "provenance": "push-only", "severity": "Minor", "category": "",
            "surfaces": ["push"],
            "contributors": [{"surface": "push", "description": "unkeyed"}],
        })
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(art, schema)
        assert not dsv.validate_comparison_artifact(art).ok

    def test_schema_uniqueitems_rejects_duplicate_surfaces(self):
        # PARITY: the schema's uniqueItems now rejects a duplicated surfaces entry,
        # matching the Python validator's duplicate check.
        schema = _load(SCHEMA)
        art = _load(EXAMPLE)
        art["findings"][0]["surfaces"] = ["push", "pull", "push"]
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(art, schema)
        assert not dsv.validate_comparison_artifact(art).ok

    def test_schemaversion_float_and_bool_rejected_like_schema(self):
        for bad in (1.0, True):
            art = _load(EXAMPLE)
            art["schemaVersion"] = bad
            res = dsv.validate_comparison_artifact(art)
            assert not res.ok and res.code == dsv.COMPARISON_BAD_SCHEMA_VERSION

    def test_unkeyed_count_bool_rejected(self):
        art = _load(EXAMPLE)
        art["pushUnkeyed"] = True  # bool must not satisfy integer
        res = dsv.validate_comparison_artifact(art)
        assert not res.ok and res.code == dsv.COMPARISON_BAD_STRUCTURE

    def test_unknown_top_level_key_rejected(self):
        art = _load(EXAMPLE)
        art["verdict"] = "retire"  # the artifact carries no verdict (derived only)
        res = dsv.validate_comparison_artifact(art)
        assert not res.ok and any("unexpected top-level" in r for r in res.reasons)

    def test_unknown_contributor_key_rejected(self):
        art = _load(EXAMPLE)
        art["findings"][0]["contributors"][0]["evidence"] = "x"
        res = dsv.validate_comparison_artifact(art)
        assert not res.ok

    def test_identity_mismatch(self):
        res = dsv.validate_comparison_artifact(
            _load(EXAMPLE), expected_set_name="other-set"
        )
        assert not res.ok and res.code == dsv.COMPARISON_IDENTITY_MISMATCH

    def test_bad_run_tag_rejected(self):
        art = _load(EXAMPLE)
        art["runTag"] = "manual"
        res = dsv.validate_comparison_artifact(art)
        assert not res.ok

    def test_bad_kind_rejected(self):
        art = _load(EXAMPLE)
        art["kind"] = "something_else"
        res = dsv.validate_comparison_artifact(art)
        assert not res.ok

    def test_non_object_artifact(self):
        res = dsv.validate_comparison_artifact(["not", "an", "object"])
        assert not res.ok and res.code == dsv.COMPARISON_NOT_AN_OBJECT


class TestProvenanceInvariants:
    """Cross-field rules the JSON Schema cannot express, enforced by the validator."""

    def test_both_without_both_surfaces_rejected(self):
        art = _load(EXAMPLE)
        # Claim 'both' but only a push contributor.
        art["findings"][0]["contributors"] = [
            {"surface": "push", "description": "only push"}
        ]
        art["findings"][0]["surfaces"] = ["push"]
        res = dsv.validate_comparison_artifact(art)
        assert not res.ok
        assert any("both" in r and "surfaces" in r for r in res.reasons)

    def test_both_without_defect_key_rejected(self):
        art = _load(EXAMPLE)
        art["findings"][0]["defectKey"] = ""  # 'both' but unkeyed
        res = dsv.validate_comparison_artifact(art)
        assert not res.ok

    def test_push_only_with_pull_contributor_rejected(self):
        art = _load(EXAMPLE)
        # findings[2] is push-only; sneak a pull contributor in.
        art["findings"][2]["contributors"].append(
            {"surface": "pull", "description": "should not be here"}
        )
        art["findings"][2]["surfaces"] = ["push", "pull"]
        res = dsv.validate_comparison_artifact(art)
        assert not res.ok

    def test_duplicate_surfaces_rejected(self):
        # The validator must reject a duplicated surfaces label, even when the
        # contributors cover the right set (S3 path-aware dogfood, gpt-5.4 Major).
        art = _load(EXAMPLE)
        art["findings"][0]["surfaces"] = ["push", "pull", "push"]  # dup push
        res = dsv.validate_comparison_artifact(art)
        assert not res.ok
        assert any("surfaces" in r and "duplicate" in r for r in res.reasons), res.reasons

    def test_surfaces_inconsistent_with_contributors_rejected(self):
        # A push-only finding whose surfaces field claims pull (disagreeing with its
        # single push contributor) must be rejected: the summary cannot drift from
        # the load-bearing contributors.
        art = _load(EXAMPLE)
        # findings[2] is push-only with a single push contributor.
        art["findings"][2]["surfaces"] = ["pull"]
        res = dsv.validate_comparison_artifact(art)
        assert not res.ok
        assert any("surfaces" in r and "does not match" in r for r in res.reasons), res.reasons

    def test_producer_emits_distinct_surfaces_on_intra_arm_dup_key(self):
        # An intra-arm duplicate key keeps BOTH contributors but emits a DISTINCT
        # surfaces summary (no duplicate push), and the result re-validates.
        merge = dsv.merge_findings(
            [_finding("push a", severity="Major", key="K"),
             _finding("push b", severity="Major", key="K")],  # same key, same arm
            [_finding("pull a", severity="Major", key="K")],
        )
        both = [f for f in merge.findings if f.provenance == "both"]
        assert len(both) == 1
        mf = both[0]
        assert len(mf.contributors) == 3          # full multiplicity preserved
        assert mf.surfaces == ("push", "pull")    # distinct summary, no dup push
        assert mf.to_dict()["surfaces"] == ["push", "pull"]

    def test_provenance_complete_true_with_unkeyed_finding_rejected(self):
        art = _load(EXAMPLE)
        # Add an unkeyed finding but keep provenanceComplete true -> inconsistent.
        art["findings"].append({
            "defectKey": "",
            "provenance": "push-only",
            "severity": "Minor",
            "category": "",
            "surfaces": ["push"],
            "contributors": [{"surface": "push", "description": "unkeyed"}],
        })
        res = dsv.validate_comparison_artifact(art)
        assert not res.ok
        assert any("provenanceComplete" in r for r in res.reasons)

    def test_provenance_complete_true_with_nonzero_unkeyed_count_rejected(self):
        # A malformed artifact declaring provenanceComplete=true with a nonzero
        # unkeyed COUNT but NO unkeyed finding present must still be rejected -
        # otherwise score_comparison would trust the flag and clear the upper-bound
        # honesty warning on incomplete provenance (gpt-5-4 S2 R1).
        for field in ("pushUnkeyed", "pullUnkeyed"):
            art = _load(EXAMPLE)
            assert art["provenanceComplete"] is True
            art[field] = 2  # nonzero, but every finding is still keyed
            res = dsv.validate_comparison_artifact(art)
            assert not res.ok
            assert any("provenanceComplete" in r and "nonzero" in r
                       for r in res.reasons), res.reasons


# ---------------------------------------------------------------------------
# build_comparison_artifact round-trips through the validator
# ---------------------------------------------------------------------------


class TestBuild:
    def _run(self, **over):
        push = over.pop("push", [_finding("p", severity="Major", key="k1")])
        pull = over.pop("pull", [_finding("q", severity="Major", key="k1")])
        merge = dsv.merge_findings(push, pull)
        run = dsv.DualSurfaceRun(
            session_set="070-set",
            committed_ref="HEAD~1..HEAD",
            sandbox_dir="/repo",
            provider="anthropic",
            model="claude-sonnet-4-6",
            push=None,  # not serialized into the comparison
            pull=None,
            framing_equal=True,
            attestation={"providerEqual": True, "modelEqual": True},
        )
        return dsv.build_comparison_artifact(
            run, merge, run_tag=over.pop("run_tag", dsv.RUN_TAG_SAMPLED),
            compared_at="2026-06-16T00:00:00+00:00",
        )

    def test_built_artifact_validates(self):
        art = self._run()
        res = dsv.validate_comparison_artifact(art, expected_set_name="070-set")
        assert res.ok, res.reasons

    def test_built_artifact_conforms_to_schema(self):
        jsonschema.validate(self._run(), _load(SCHEMA))

    def test_bad_run_tag_raises(self):
        with pytest.raises(ValueError):
            self._run(run_tag="manual")

    def test_empty_findings_is_valid(self):
        art = self._run(push=[], pull=[])
        res = dsv.validate_comparison_artifact(art)
        assert res.ok and art["findings"] == []
        assert art["provenanceComplete"] is True


# ---------------------------------------------------------------------------
# Scoring: provenance scoreboard
# ---------------------------------------------------------------------------


class TestScoreComparison:
    def test_high_sev_tally_excludes_minor(self):
        art = _load(EXAMPLE)  # both(Major), pull-only(Major), push-only(Minor)
        score = dsv.score_comparison(art)
        assert score.ok
        assert score.shared_high_sev == 1
        assert score.pull_unique_high_sev == 1
        assert score.push_unique_high_sev == 0  # the push-only one is Minor
        assert score.total_high_sev == 2
        assert score.upper_bound is False

    def test_incomplete_provenance_marks_upper_bound(self):
        merge = dsv.merge_findings(
            [_finding("a", severity="Major")],  # unkeyed
            [_finding("b", severity="Major")],
        )
        run = dsv.DualSurfaceRun(
            session_set="s", committed_ref="r", sandbox_dir="/d",
            provider="anthropic", model="m", push=None, pull=None,
            framing_equal=True, attestation=_equal_arms_attestation(),
        )
        art = dsv.build_comparison_artifact(
            run, merge, run_tag=dsv.RUN_TAG_SAMPLED,
            compared_at="2026-06-16T00:00:00+00:00",
        )
        score = dsv.score_comparison(art)
        assert score.ok and score.upper_bound is True
        assert score.push_unique_high_sev == 1 and score.pull_unique_high_sev == 1
        assert any("upper bound" in r for r in score.reasons)

    def test_invalid_artifact_not_ok(self):
        score = dsv.score_comparison({"schemaVersion": 99})
        assert not score.ok


# ---------------------------------------------------------------------------
# Scoring: benchmark RETIRE telemetry (ground truth)
# ---------------------------------------------------------------------------


def _registration(case_ids, *, min_power=10):
    return {
        "schemaVersion": 1,
        "name": "bench-1",
        "registeredAt": "2026-06-16T00:00:00+00:00",
        "minCasesForPower": min_power,
        "thresholds": {
            "recall": 0.5, "precision": 0.5, "replaySuccess": 0.5,
            "maxFalseReproducedRate": 0.1,
        },
        "cases": [
            {"id": cid, "kind": ("holdout" if i == 0 else "seeded"),
             "defectClass": "x", "description": "d"}
            for i, cid in enumerate(case_ids)
        ],
    }


def _equal_arms_attestation():
    """A held-equal attestation carrying the RAW per-arm identities + framing the
    scorer re-derives equality from (not just the self-asserted booleans)."""
    return {
        "providerEqual": True,
        "modelEqual": True,
        "framingEqual": True,
        "bothAdversarial": True,
        "requestedProvider": "anthropic",
        "pushProvider": "anthropic",
        "pullProvider": "anthropic",
        "requestedModel": "m",
        "pushModel": "m",
        "pullModel": "m",
        "pushFraming": {"strength": dsv.FRAMING_ADVERSARIAL, "template": "verification.md"},
        "pullFraming": {"strength": dsv.FRAMING_ADVERSARIAL, "template": "path-aware-critique.md"},
    }


def _comparison_with(
    findings, *, run_tag=dsv.RUN_TAG_SAMPLED, complete=True, attestation=None
):
    return {
        "schemaVersion": 1,
        "kind": "dual_surface_comparison",
        "sessionSetName": "s",
        "comparedAt": "2026-06-16T00:00:00+00:00",
        "runTag": run_tag,
        "committedRef": "r",
        "provider": "anthropic",
        "model": "m",
        # Default to a held-equal attestation so these fixtures exercise the
        # valid-telemetry path; the negative tests pass an unequal attestation.
        "attestation": _equal_arms_attestation() if attestation is None else attestation,
        "provenanceComplete": complete,
        "pushUnkeyed": 0,
        "pullUnkeyed": 0,
        "findings": findings,
    }


def _mf(key, provenance, severity):
    surfaces = (["push", "pull"] if provenance == "both"
                else ["push"] if provenance == "push-only" else ["pull"])
    contributors = [{"surface": s, "description": f"{s} desc"} for s in surfaces]
    return {
        "defectKey": key, "provenance": provenance, "severity": severity,
        "category": "", "surfaces": surfaces, "contributors": contributors,
    }


class TestEqualArmsGuardOnScoring:
    """An inspection-only (require_equal=False) artifact is structurally valid but
    must NOT be scored as telemetry: the scorers are the RETIRE-evidence boundary and
    re-derive equality from the RAW recorded arm identities/framing - never trusting
    the self-asserted *Equal booleans (Set 070 S3 path-aware dogfood, gpt-5.4 Major;
    R3 sharpening: "measured, not assumed")."""

    def test_booleans_only_attestation_rejected(self):
        # The verifier's core point: an attestation carrying only the four booleans
        # (no raw arm identities) is an unverified CLAIM and must NOT score.
        comp = _comparison_with(
            [_mf("c0", "push-only", "Major")],
            attestation={
                "providerEqual": True, "modelEqual": True,
                "framingEqual": True, "bothAdversarial": True,
            },
        )
        score = dsv.score_comparison(comp)
        assert score.ok is False
        assert any("raw per-arm attestation is incomplete" in r for r in score.reasons)

    def test_lying_booleans_caught_by_raw_rederivation(self):
        # providerEqual=true is ASSERTED, but the raw providers actually differ -> the
        # re-derivation catches the lie (the booleans are never trusted).
        att = _equal_arms_attestation()
        att["pullProvider"] = "openai"   # raw disagreement; booleans still all true
        comp = _comparison_with([_mf("c0", "push-only", "Major")], attestation=att)
        score = dsv.score_comparison(comp)
        assert score.ok is False
        assert any("providers differ" in r for r in score.reasons)

    def test_model_disagreement_rejected(self):
        att = _equal_arms_attestation()
        att["pushModel"] = "other-model"
        comp = _comparison_with([_mf("c0", "push-only", "Major")], attestation=att)
        assert dsv.score_comparison(comp).ok is False

    def test_non_adversarial_framing_rejected(self):
        att = _equal_arms_attestation()
        att["pushFraming"] = {"strength": dsv.FRAMING_WEAK, "template": "x"}
        att["pullFraming"] = {"strength": dsv.FRAMING_WEAK, "template": "y"}
        comp = _comparison_with([_mf("c0", "push-only", "Major")], attestation=att)
        score = dsv.score_comparison(comp)
        assert score.ok is False
        assert any("not strong adversarial" in r for r in score.reasons)

    def test_differing_framing_rejected(self):
        att = _equal_arms_attestation()
        att["pullFraming"] = {"strength": dsv.FRAMING_MODERATE, "template": "y"}
        comp = _comparison_with([_mf("c0", "push-only", "Major")], attestation=att)
        score = dsv.score_comparison(comp)
        assert score.ok is False
        assert any("framings differ" in r for r in score.reasons)

    def test_missing_framing_block_rejected(self):
        att = _equal_arms_attestation()
        del att["pushFraming"]
        comp = _comparison_with([_mf("c0", "push-only", "Major")], attestation=att)
        assert dsv.score_comparison(comp).ok is False

    def test_score_against_benchmark_rejects_unequal_arms(self):
        reg = _registration([f"c{i}" for i in range(10)], min_power=5)
        att = _equal_arms_attestation()
        att["pushProvider"] = "openai"  # raw provider disagreement
        comp = _comparison_with([_mf("c0", "push-only", "Major")], attestation=att)
        score = dsv.score_against_benchmark(comp, reg)
        assert score.ok is False
        assert score.verdict == dsv.RETIRE_INCONCLUSIVE
        assert any("providers differ" in r for r in score.reasons)

    def test_held_equal_artifact_still_scores(self):
        # The held-equal fixture (raw identities present + agreeing + adversarial)
        # re-derives as equal and scores ok.
        reg = _registration([f"c{i}" for i in range(10)], min_power=5)
        comp = _comparison_with([_mf("c0", "push-only", "Major")])
        assert dsv.score_against_benchmark(comp, reg).ok is True
        assert dsv.score_comparison(comp).ok is True

    def test_scores_when_arms_agree_but_request_string_differs(self):
        # R4 Issue 1: equality is judged on ACTUAL arm identities (push==pull), not a
        # match to the requested string. Both arms ran on the same resolved provider/
        # model that differs from the request -> still held-equal, still scoreable.
        reg = _registration([f"c{i}" for i in range(10)], min_power=5)
        att = _equal_arms_attestation()
        att["requestedProvider"] = "google"        # request differs from the arms...
        att["requestedModel"] = "requested-model"  # ...but push==pull (anthropic/m).
        comp = _comparison_with([_mf("c0", "push-only", "Major")], attestation=att)
        assert dsv.score_comparison(comp).ok is True
        assert dsv.score_against_benchmark(comp, reg).ok is True

    def test_missing_arm_identity_rejected(self):
        att = _equal_arms_attestation()
        del att["pushProvider"]
        comp = _comparison_with([_mf("c0", "push-only", "Major")], attestation=att)
        score = dsv.score_comparison(comp)
        assert score.ok is False
        assert any("incomplete" in r for r in score.reasons)


class TestBenchmarkScore:
    def test_underpowered_forces_inconclusive(self):
        reg = _registration(["c1", "c2"], min_power=10)  # only 2 real cases
        comp = _comparison_with([_mf("c1", "push-only", "Major")])
        score = dsv.score_against_benchmark(comp, reg)
        assert score.ok
        assert score.underpowered is True
        assert score.verdict == dsv.RETIRE_INCONCLUSIVE
        assert score.push_unique_real == 1

    def test_powered_push_adds_unique(self):
        ids = [f"c{i}" for i in range(10)]
        reg = _registration(ids, min_power=5)
        comp = _comparison_with([
            _mf("c0", "push-only", "Major"),
            _mf("c1", "both", "Critical"),
            _mf("c2", "pull-only", "Major"),
        ])
        score = dsv.score_against_benchmark(comp, reg)
        assert score.ok and not score.underpowered
        assert score.verdict == dsv.RETIRE_PUSH_ADDS_UNIQUE
        assert score.push_unique_real == 1
        assert score.pull_unique_real == 1
        assert score.shared_real == 1

    def test_powered_push_no_unique(self):
        ids = [f"c{i}" for i in range(10)]
        reg = _registration(ids, min_power=5)
        comp = _comparison_with([_mf("c0", "pull-only", "Major")])
        score = dsv.score_against_benchmark(comp, reg)
        assert score.verdict == dsv.RETIRE_PUSH_NO_UNIQUE
        assert score.push_unique_real == 0

    def test_unregistered_key_counted_separately_not_as_real(self):
        ids = [f"c{i}" for i in range(10)]
        reg = _registration(ids, min_power=5)
        comp = _comparison_with([_mf("ghost", "push-only", "Major")])
        score = dsv.score_against_benchmark(comp, reg)
        assert score.unregistered_keyed == 1
        assert score.push_unique_real == 0
        assert score.verdict == dsv.RETIRE_PUSH_NO_UNIQUE

    def test_unkeyed_high_sev_excluded_from_real_tally(self):
        ids = [f"c{i}" for i in range(10)]
        reg = _registration(ids, min_power=5)
        # An unkeyed high-sev finding can't be scored against ground truth.
        comp = _comparison_with(
            [{"defectKey": "", "provenance": "push-only", "severity": "Major",
              "category": "", "surfaces": ["push"],
              "contributors": [{"surface": "push", "description": "d"}]}],
            complete=False,
        )
        score = dsv.score_against_benchmark(comp, reg)
        assert score.push_unique_real == 0

    def test_invalid_registration_not_ok(self):
        comp = _comparison_with([_mf("c0", "push-only", "Major")])
        score = dsv.score_against_benchmark(comp, {"schemaVersion": 1})
        assert not score.ok

    def test_invalid_comparison_not_ok(self):
        reg = _registration(["c1"], min_power=1)
        score = dsv.score_against_benchmark({"bad": True}, reg)
        assert not score.ok


class TestAggregate:
    def _score(self, tag, push_unique=0, underpowered=False):
        return dsv.BenchmarkScore(
            ok=True, run_tag=tag, push_unique_real=push_unique,
            pull_unique_real=0, shared_real=0, unregistered_keyed=0,
            real_cases=20, underpowered=underpowered,
            verdict=dsv.RETIRE_INCONCLUSIVE,
        )

    def test_refuses_mixed_tags(self):
        agg = dsv.aggregate_retire_telemetry([
            self._score(dsv.RUN_TAG_SAMPLED), self._score(dsv.RUN_TAG_OPT_IN),
        ])
        assert not agg.ok
        assert any("never pooled" in r for r in agg.reasons)

    def test_pools_same_tag_and_sums(self):
        agg = dsv.aggregate_retire_telemetry(
            [self._score(dsv.RUN_TAG_SAMPLED, push_unique=2),
             self._score(dsv.RUN_TAG_SAMPLED, push_unique=1)],
            min_runs_for_power=2,
        )
        assert agg.ok and agg.runs == 2 and agg.push_unique_real == 3
        assert agg.verdict == dsv.RETIRE_PUSH_ADDS_UNIQUE

    def test_below_min_runs_inconclusive(self):
        agg = dsv.aggregate_retire_telemetry(
            [self._score(dsv.RUN_TAG_SAMPLED, push_unique=2)],
            min_runs_for_power=5,
        )
        assert agg.ok and agg.verdict == dsv.RETIRE_INCONCLUSIVE

    def test_underpowered_constituent_keeps_inconclusive(self):
        agg = dsv.aggregate_retire_telemetry(
            [self._score(dsv.RUN_TAG_SAMPLED, push_unique=2, underpowered=True),
             self._score(dsv.RUN_TAG_SAMPLED, push_unique=1)],
            min_runs_for_power=2,
        )
        assert agg.ok and agg.verdict == dsv.RETIRE_INCONCLUSIVE

    def test_empty_not_ok(self):
        assert not dsv.aggregate_retire_telemetry([]).ok


# ---------------------------------------------------------------------------
# Mode wiring (the verificationMode-pattern option)
# ---------------------------------------------------------------------------


def _set_dir(tmp_path, *, with_log=True, spec_mode=None):
    d = tmp_path / "070-set"
    d.mkdir(exist_ok=True)
    spec = "# spec\n"
    if spec_mode is not None:
        spec += (
            "## Session Set Configuration\n\n```yaml\n"
            f"tier: full\ndualSurfaceMode: {spec_mode}\n```\n"
        )
    (d / "spec.md").write_text(spec, encoding="utf-8")
    if with_log:
        (d / "activity-log.json").write_text(
            json.dumps({"sessionSetName": "070-set", "totalSessions": 0,
                        "entries": []}),
            encoding="utf-8",
        )
    return d


class TestModeWiring:
    def test_default_is_off(self, tmp_path):
        d = _set_dir(tmp_path)
        assert dsv.read_dual_surface_mode(d) == dsv.DUAL_SURFACE_MODE_OFF

    def test_record_and_read_back(self, tmp_path):
        d = _set_dir(tmp_path)
        dsv.record_dual_surface_mode(d, dsv.DUAL_SURFACE_MODE_SAMPLED)
        assert dsv.read_dual_surface_mode(d) == dsv.DUAL_SURFACE_MODE_SAMPLED

    def test_record_unknown_raises(self, tmp_path):
        d = _set_dir(tmp_path)
        with pytest.raises(ValueError):
            dsv.record_dual_surface_mode(d, "bogus")

    def test_record_missing_log_raises(self, tmp_path):
        d = _set_dir(tmp_path, with_log=False)
        with pytest.raises(FileNotFoundError):
            dsv.record_dual_surface_mode(d, dsv.DUAL_SURFACE_MODE_SAMPLED)

    def test_record_non_object_log_raises_controlled_valueerror(self, tmp_path):
        # A JSON document that parses but is not an object must raise a CONTROLLED
        # ValueError (not crash later on .get / setdefault) so the CLI maps it to a
        # clean exit (gpt-5-4 S2 R1).
        d = _set_dir(tmp_path, with_log=False)
        (d / "activity-log.json").write_text("[1, 2, 3]", encoding="utf-8")
        with pytest.raises(ValueError):
            dsv.record_dual_surface_mode(d, dsv.DUAL_SURFACE_MODE_SAMPLED)

    def test_record_unparseable_log_raises_controlled_valueerror(self, tmp_path):
        d = _set_dir(tmp_path, with_log=False)
        (d / "activity-log.json").write_bytes(b"\xff\xfe not json {")
        with pytest.raises(ValueError):
            dsv.record_dual_surface_mode(d, dsv.DUAL_SURFACE_MODE_SAMPLED)

    def test_record_repairs_non_list_entries(self, tmp_path):
        # A wrong-typed entries field is reset to a real array so the durable
        # record actually lands (not silently dropped into a non-list).
        d = _set_dir(tmp_path, with_log=False)
        (d / "activity-log.json").write_text(
            json.dumps({"sessionSetName": "070-set", "entries": "oops"}),
            encoding="utf-8",
        )
        dsv.record_dual_surface_mode(d, dsv.DUAL_SURFACE_MODE_OPT_IN)
        assert dsv.read_dual_surface_mode(d) == dsv.DUAL_SURFACE_MODE_OPT_IN

    def test_resolve_cli_choice_precedence(self, tmp_path):
        d = _set_dir(tmp_path, spec_mode="opt-in")
        chosen = dsv.resolve_and_record_dual_surface_mode(
            d, cli_choice=dsv.DUAL_SURFACE_MODE_SAMPLED
        )
        assert chosen == dsv.DUAL_SURFACE_MODE_SAMPLED
        assert dsv.read_dual_surface_mode(d) == dsv.DUAL_SURFACE_MODE_SAMPLED

    def test_resolve_spec_seed_when_no_cli(self, tmp_path):
        d = _set_dir(tmp_path, spec_mode="sampled")
        chosen = dsv.resolve_and_record_dual_surface_mode(d)
        assert chosen == dsv.DUAL_SURFACE_MODE_SAMPLED

    def test_resolve_immutable_after_first_record(self, tmp_path):
        d = _set_dir(tmp_path)
        dsv.record_dual_surface_mode(d, dsv.DUAL_SURFACE_MODE_OPT_IN)
        # A later resolve must NOT overwrite (immutability).
        chosen = dsv.resolve_and_record_dual_surface_mode(
            d, cli_choice=dsv.DUAL_SURFACE_MODE_OFF
        )
        assert chosen is None
        assert dsv.read_dual_surface_mode(d) == dsv.DUAL_SURFACE_MODE_OPT_IN

    def test_resolve_records_nothing_without_source(self, tmp_path):
        d = _set_dir(tmp_path)
        assert dsv.resolve_and_record_dual_surface_mode(d) is None
        assert dsv.read_dual_surface_mode(d) == dsv.DUAL_SURFACE_MODE_OFF

    def test_resolve_bad_cli_raises(self, tmp_path):
        d = _set_dir(tmp_path)
        with pytest.raises(ValueError):
            dsv.resolve_and_record_dual_surface_mode(d, cli_choice="bogus")

    def test_unreadable_detected(self, tmp_path):
        d = _set_dir(tmp_path, with_log=False)
        (d / "activity-log.json").write_bytes(b"\xff\xfe not json")
        assert dsv.dual_surface_mode_record_unreadable(d) is True
        # The reader still never raises (collapses to off).
        assert dsv.read_dual_surface_mode(d) == dsv.DUAL_SURFACE_MODE_OFF

    def test_unreadable_false_when_absent(self, tmp_path):
        d = _set_dir(tmp_path, with_log=False)
        assert dsv.dual_surface_mode_record_unreadable(d) is False

    def test_last_valid_entry_wins(self, tmp_path):
        d = _set_dir(tmp_path)
        dsv.record_dual_surface_mode(d, dsv.DUAL_SURFACE_MODE_SAMPLED)
        dsv.record_dual_surface_mode(d, dsv.DUAL_SURFACE_MODE_OPT_IN)
        assert dsv.read_dual_surface_mode(d) == dsv.DUAL_SURFACE_MODE_OPT_IN

    def test_readers_never_raise_on_non_list_entries(self, tmp_path):
        # A parseable-but-malformed log whose 'entries' is a non-iterable (the int
        # 1) must NOT raise from the readers - they collapse to off / False (the
        # L-069-1 bug-class: harden the reader, not just the writer; gpt-5-4 S2 R2).
        d = _set_dir(tmp_path, with_log=False)
        (d / "activity-log.json").write_text(
            json.dumps({"sessionSetName": "070-set", "entries": 1}),
            encoding="utf-8",
        )
        assert dsv.read_dual_surface_mode(d) == dsv.DUAL_SURFACE_MODE_OFF
        assert dsv.has_dual_surface_mode_record(d) is False

    def test_record_ignores_malformed_stepnumber(self, tmp_path):
        # A prior entry with a non-int stepNumber (a list) must be IGNORED, not fed
        # to int() (which would TypeError); the record still lands at step 1.
        d = _set_dir(tmp_path, with_log=False)
        (d / "activity-log.json").write_text(
            json.dumps({"sessionSetName": "070-set",
                        "entries": [{"sessionNumber": 1, "stepNumber": []}]}),
            encoding="utf-8",
        )
        dsv.record_dual_surface_mode(d, dsv.DUAL_SURFACE_MODE_SAMPLED, session_number=1)
        assert dsv.read_dual_surface_mode(d) == dsv.DUAL_SURFACE_MODE_SAMPLED


class TestShouldRun:
    def test_off_never_runs(self):
        assert dsv.should_run_dual_surface(dsv.DUAL_SURFACE_MODE_OFF) is None
        assert dsv.should_run_dual_surface(
            dsv.DUAL_SURFACE_MODE_OFF, opt_in=True) is None

    def test_opt_in_only_when_requested(self):
        assert dsv.should_run_dual_surface(dsv.DUAL_SURFACE_MODE_OPT_IN) is None
        assert dsv.should_run_dual_surface(
            dsv.DUAL_SURFACE_MODE_OPT_IN, opt_in=True) == dsv.RUN_TAG_OPT_IN

    def test_sampled_draw_below_rate_runs_sampled(self):
        tag = dsv.should_run_dual_surface(
            dsv.DUAL_SURFACE_MODE_SAMPLED, sample_value=0.05, sample_rate=0.1)
        assert tag == dsv.RUN_TAG_SAMPLED

    def test_sampled_draw_above_rate_skips(self):
        assert dsv.should_run_dual_surface(
            dsv.DUAL_SURFACE_MODE_SAMPLED, sample_value=0.5, sample_rate=0.1) is None

    def test_sampled_explicit_opt_in_is_operational_tag(self):
        # A deliberate opt-in under sampled mode is OPERATIONAL, never folded
        # into the unbiased telemetry.
        assert dsv.should_run_dual_surface(
            dsv.DUAL_SURFACE_MODE_SAMPLED, opt_in=True,
            sample_value=0.0) == dsv.RUN_TAG_OPT_IN

    def test_sampled_without_draw_skips(self):
        assert dsv.should_run_dual_surface(dsv.DUAL_SURFACE_MODE_SAMPLED) is None

    def test_unknown_mode_treated_as_off(self):
        assert dsv.should_run_dual_surface("bogus", sample_value=0.0) is None


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


class TestCLI:
    def test_record_then_read_mode(self, tmp_path, capsys):
        d = _set_dir(tmp_path)
        rc = dsv.main(["record-mode", "--session-set-dir", str(d), "--mode", "sampled"])
        assert rc == 0
        rc = dsv.main(["read-mode", "--session-set-dir", str(d)])
        assert rc == 0
        assert "sampled" in capsys.readouterr().out

    def test_score_missing_artifact(self, tmp_path, capsys):
        d = _set_dir(tmp_path)
        rc = dsv.main(["score", "--session-set-dir", str(d)])
        assert rc == 0
        assert "no dual-surface-comparison.json" in capsys.readouterr().out

    def test_score_reads_artifact_and_benchmark(self, tmp_path, capsys):
        d = _set_dir(tmp_path)
        # A provenance-complete comparison + a registration the score reads.
        comp = _comparison_with([_mf("c0", "push-only", "Major")])
        comp["sessionSetName"] = "070-set"
        (d / dsv.COMPARISON_ARTIFACT_FILENAME).write_text(
            json.dumps(comp), encoding="utf-8")
        (d / "benchmark-registration.json").write_text(
            json.dumps(_registration([f"c{i}" for i in range(3)], min_power=10)),
            encoding="utf-8",
        )
        rc = dsv.main(["score", "--session-set-dir", str(d)])
        assert rc == 0
        out = capsys.readouterr().out
        assert "high-severity provenance tally" in out
        assert "RETIRE telemetry" in out
        assert "inconclusive" in out  # underpowered

    def test_record_mode_off_happy_path(self, tmp_path):
        d = _set_dir(tmp_path)
        rc = dsv.main(["record-mode", "--session-set-dir", str(d), "--mode", "off"])
        assert rc == 0
        assert dsv.read_dual_surface_mode(d) == dsv.DUAL_SURFACE_MODE_OFF

    def test_record_mode_unreadable_log_returns_2(self, tmp_path, capsys):
        # A corrupt existing activity log must NOT crash record-mode (has_..._record
        # collapses it to "no record", so without the guard the resolve would fall
        # through to record_dual_surface_mode and raise) - it returns a controlled 2
        # with ASCII-only output (gpt-5-4 S2 R1).
        d = _set_dir(tmp_path, with_log=False)
        (d / "activity-log.json").write_bytes(b"\xff\xfe not json at all {")
        rc = dsv.main(["record-mode", "--session-set-dir", str(d), "--mode", "sampled"])
        assert rc == 2
        out = capsys.readouterr().out
        assert "unreadable" in out
        assert out.isascii()

    def test_record_mode_non_list_entries_does_not_crash(self, tmp_path, capsys):
        # A parseable log with a non-iterable 'entries' must NOT escape as a
        # traceback through the CLI; the readers/writer are hardened so it records
        # successfully (entries repaired) with no crash (gpt-5-4 S2 R2).
        d = _set_dir(tmp_path, with_log=False)
        (d / "activity-log.json").write_text(
            json.dumps({"sessionSetName": "070-set", "entries": 1}),
            encoding="utf-8",
        )
        rc = dsv.main(["record-mode", "--session-set-dir", str(d), "--mode", "opt-in"])
        assert rc == 0  # no traceback; recorded
        assert capsys.readouterr().out.isascii()
        assert dsv.read_dual_surface_mode(d) == dsv.DUAL_SURFACE_MODE_OPT_IN

    def test_record_mode_bad_stepnumber_does_not_crash(self, tmp_path, capsys):
        # A prior entry with a malformed stepNumber must not crash record-mode.
        d = _set_dir(tmp_path, with_log=False)
        (d / "activity-log.json").write_text(
            json.dumps({"sessionSetName": "070-set",
                        "entries": [{"sessionNumber": 1, "stepNumber": []}]}),
            encoding="utf-8",
        )
        rc = dsv.main(["record-mode", "--session-set-dir", str(d), "--mode", "sampled"])
        assert rc == 0
        assert dsv.read_dual_surface_mode(d) == dsv.DUAL_SURFACE_MODE_SAMPLED
