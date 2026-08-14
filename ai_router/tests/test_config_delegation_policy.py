"""Set 131 S1 — the delegation policy keys, and the precedence they encode.

The tests are weighted to **precedence**, not to coverage. A rule list that
validates but silently reorders is the failure that looks like success: every
key parses, every value is well-typed, and cost has quietly been allowed to
overrule authority. So the assertions that matter here are the ones that fix
rule 1 and rule 2 *ahead* of the economic rules, in both surfaces that carry
them — ``config.py`` (the floor) and the workflow doc (the written order).

Falsifier discipline (L-112-1): each rule ships a plant that plants the
defect and asserts the check fires, and — where a look-alike exists — a plant
of the legitimate look-alike asserting it does NOT fire. A validator that has
only ever seen good input looks identical to one that checks nothing.
"""

import textwrap
from pathlib import Path

import pytest
import config as config_mod  # type: ignore[import-not-found]


REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_DOC = REPO_ROOT / "docs" / "ai-led-session-workflow.md"
SHIPPED_CONFIG = REPO_ROOT / "ai_router" / "router-config.yaml"


# ---------------------------------------------------------------------------
# Fixture: a minimal but complete config we can mutate per test
# ---------------------------------------------------------------------------

_MINIMAL_RC = """\
metadata:
  pricing_reviewed: "2099-01-01"
  review_frequency_days: 3650
providers:
  anthropic:
    display_label: Anthropic
    enabled: true
    api_key_env: FAKE_ANTHROPIC_KEY
    base_url: https://api.anthropic.com/v1/messages
    api_version: "2023-06-01"
    rate_limit:
      requests_per_minute: 10
      tokens_per_minute: 10000
    timeout_seconds: 30
    retry:
      max_retries: 1
      backoff_base_seconds: 1
models:
  test-model:
    provider: anthropic
    model_id: claude-test
    tier: 1
    is_enabled: true
    is_enabled_as_verifier: false
    input_cost_per_1m: 1.0
    output_cost_per_1m: 5.0
    max_context_tokens: 100000
    max_output_tokens: 4096
routing:
  outsourcing_mode: whenever-helpful
  tier1_max_complexity: 30
  tier2_max_complexity: 65
  default_tier: 1
  tier_assignments:
    1: test-model
  task_type_overrides: {}
task_type_params: {}
complexity:
  weights:
    context_length: 0.5
    keyword_signals: 0.5
    task_type: 0.0
    explicit_hint: 0.0
  context_length_scores:
    - {max_chars: 999999, score: 50}
  task_type_scores:
    general: 50
  high_complexity_keywords: []
  low_complexity_keywords: []
escalation:
  enabled: false
  max_escalations: 0
  triggers:
    empty_response: false
    max_tokens_hit: false
    min_output_tokens: 0
    refusal_detection: false
  refusal_phrases: []
verification:
  enabled: false
  preferred_pairings: {}
  auto_verify_task_types: []
  settings:
    check_categories: []
    on_disagreement: merge
    on_disagreement_by_task_type: {}
    tiebreaker_model: test-model
    max_cost_multiplier: 1.0
    prompt_template_file: null
metrics:
  enabled: false
  log_filename: test-metrics.jsonl
state:
  db_path: test-state.db
  log_prompts: false
  log_responses: false
output:
  verbose: false
"""


def _write_config(tmp_path: Path, delegation_yaml: str | None) -> Path:
    """Write a loadable workspace whose ``delegation:`` block is *ours*.

    The ``.git`` marker bounds the fixture as its own project so
    ``verify_type`` answers from here and not from the real repo's
    (gitignored, machine-specific) ``project-verify-type.txt`` — without it
    these tests pass or fail depending on how the developer's checkout is
    provisioned. See test_local_overrides_merge._setup_workspace.
    """
    (tmp_path / ".git").mkdir(exist_ok=True)
    ai_router_dir = tmp_path / "ai_router"
    ai_router_dir.mkdir(exist_ok=True)
    rc = ai_router_dir / "router-config.yaml"
    body = _MINIMAL_RC
    if delegation_yaml is not None:
        body += textwrap.dedent(delegation_yaml)
    rc.write_text(body, encoding="utf-8")
    return rc


def _load(tmp_path: Path, delegation_yaml: str | None, monkeypatch) -> dict:
    rc = _write_config(tmp_path, delegation_yaml)
    monkeypatch.setenv("FAKE_ANTHROPIC_KEY", "fake-key-value")
    return config_mod.load_config(str(rc))


def _shipped(monkeypatch) -> dict:
    monkeypatch.setenv("FAKE_ANTHROPIC_KEY", "fake-key-value")
    return config_mod.load_config(str(SHIPPED_CONFIG))


# ---------------------------------------------------------------------------
# Rule 2 — the independence floor. Cost may never delete an authority rule.
# ---------------------------------------------------------------------------


def test_floor_holds_when_the_config_deletes_an_entry(tmp_path, monkeypatch):
    """THE plant: a config that removes code-review must not succeed."""
    cfg = _load(tmp_path, """
        delegation:
          always_route_task_types:
            - session-verification
    """, monkeypatch)
    routed = cfg["delegation"]["always_route_task_types"]
    for required in config_mod.INDEPENDENCE_REQUIRED_TASK_TYPES:
        assert required in routed, (
            f"{required!r} was deleted from the config and the effective "
            "config honoured the deletion — an economic edit just overruled "
            "precedence rule 2."
        )


def test_floor_holds_for_an_empty_list(tmp_path, monkeypatch):
    cfg = _load(tmp_path, """
        delegation:
          always_route_task_types: []
    """, monkeypatch)
    assert set(config_mod.INDEPENDENCE_REQUIRED_TASK_TYPES).issubset(
        cfg["delegation"]["always_route_task_types"]
    )


def test_floor_holds_when_the_delegation_block_is_absent(tmp_path, monkeypatch):
    """An older consumer-repo config predates the key entirely."""
    cfg = _load(tmp_path, None, monkeypatch)
    assert set(config_mod.INDEPENDENCE_REQUIRED_TASK_TYPES).issubset(
        cfg["delegation"]["always_route_task_types"]
    )


def test_floor_is_a_floor_not_a_ceiling(tmp_path, monkeypatch):
    """The look-alike that must NOT fire: adding is legitimate."""
    cfg = _load(tmp_path, """
        delegation:
          always_route_task_types:
            - architecture
    """, monkeypatch)
    routed = cfg["delegation"]["always_route_task_types"]
    assert "architecture" in routed, "a legitimate addition was dropped"
    assert set(config_mod.INDEPENDENCE_REQUIRED_TASK_TYPES).issubset(routed)


def test_shipped_config_states_the_floor_explicitly(monkeypatch):
    """The file must be honest rather than leaning on the injection.

    Structural assertion beside the behavioural one: a reader opening
    router-config.yaml has to SEE the three entries, because the union is
    invisible at the point of reading.
    """
    text = SHIPPED_CONFIG.read_text(encoding="utf-8")
    block = text.split("always_route_task_types:", 1)[1].split("\n\n", 1)[0]
    for required in config_mod.INDEPENDENCE_REQUIRED_TASK_TYPES:
        assert f"- {required}" in block, (
            f"{required!r} is enforced by load_config but not written in the "
            "shipped config — the file understates the policy it carries."
        )


def test_malformed_always_route_list_is_refused(tmp_path, monkeypatch):
    with pytest.raises(ValueError, match="always_route_task_types"):
        _load(tmp_path, """
            delegation:
              always_route_task_types: session-verification
        """, monkeypatch)


# ---------------------------------------------------------------------------
# The reason codes are a CLOSED enum
# ---------------------------------------------------------------------------


def test_unknown_reason_code_is_refused(tmp_path, monkeypatch):
    """The plant: a newly-invented excuse to keep work."""
    with pytest.raises(ValueError, match="direct-because-i-am-faster"):
        _load(tmp_path, """
            delegation:
              direct_work_reason_codes:
                - direct-mechanical
                - direct-because-i-am-faster
        """, monkeypatch)


def test_a_legitimate_subset_of_reason_codes_is_accepted(tmp_path, monkeypatch):
    """The look-alike that must NOT fire: a shorter list is still valid."""
    cfg = _load(tmp_path, """
        delegation:
          direct_work_reason_codes:
            - direct-mechanical
    """, monkeypatch)
    assert cfg["delegation"]["direct_work_reason_codes"] == [
        "direct-mechanical"
    ]


def test_shipped_reason_codes_match_the_enum_exactly(monkeypatch):
    cfg = _shipped(monkeypatch)
    assert set(cfg["delegation"]["direct_work_reason_codes"]) == set(
        config_mod._DIRECT_WORK_REASON_CODES
    )


# ---------------------------------------------------------------------------
# child_budget — advisory, but not nonsense
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("value", ["0", "-5", "true"])
def test_child_budget_refuses_a_nonsense_cap(tmp_path, monkeypatch, value):
    """``true`` is in here on purpose: ``True == 1`` in Python, so a bare
    isinstance(x, int) admits a boolean as a valid inference cap.
    """
    with pytest.raises(ValueError, match="max_inferences_per_child"):
        _load(tmp_path, f"""
            delegation:
              child_budget:
                max_inferences_per_child: {value}
        """, monkeypatch)


def test_child_budget_absent_is_allowed(tmp_path, monkeypatch):
    """The look-alike: the block is advisory, so omitting it is legal."""
    cfg = _load(tmp_path, """
        delegation:
          always_route_task_types: []
    """, monkeypatch)
    assert cfg["delegation"].get("child_budget") is None


# ---------------------------------------------------------------------------
# thresholds — keyed by transport profile
# ---------------------------------------------------------------------------


def test_threshold_under_an_unknown_profile_is_refused(tmp_path, monkeypatch):
    """Dead config that reads as active policy is the defect here."""
    with pytest.raises(ValueError, match="copilot-cli-v2"):
        _load(tmp_path, """
            delegation:
              thresholds:
                copilot-cli-v2:
                  route_when_files_exceed: 1
        """, monkeypatch)


def test_threshold_shape_is_refused_when_wrong_typed(tmp_path, monkeypatch):
    with pytest.raises(ValueError, match="route_when_exploration_unbounded"):
        _load(tmp_path, """
            delegation:
              thresholds:
                api:
                  route_when_exploration_unbounded: "yes"
        """, monkeypatch)


def test_both_shipped_transport_profiles_carry_thresholds(monkeypatch):
    cfg = _shipped(monkeypatch)
    thresholds = cfg["delegation"]["thresholds"]
    assert set(thresholds) == {"api", "copilot-cli"}
    # The seat routes exploration sooner than the API path: its children can
    # explore the repo themselves, so delegating exploration is cheap there.
    assert thresholds["copilot-cli"]["route_when_files_exceed"] < (
        thresholds["api"]["route_when_files_exceed"]
    )


# ---------------------------------------------------------------------------
# The written precedence order — the half a config cannot express
# ---------------------------------------------------------------------------


_RULE_HEADINGS = (
    "**1 — Authority veto.**",
    "**2 — Independence requirement.**",
    "**3 — Risk gate.**",
    "**4 — Context footprint.**",
    "**5 — Model choice, last.**",
)


def test_delegation_precedence_is_documented_in_precedence_order():
    """A rule list that validates but REORDERS is the failure that looks
    like success, so assert positions rather than presence.
    """
    doc = WORKFLOW_DOC.read_text(encoding="utf-8")
    positions = []
    for heading in _RULE_HEADINGS:
        idx = doc.find(heading)
        assert idx != -1, f"precedence rule missing from the doc: {heading}"
        positions.append(idx)
    assert positions == sorted(positions), (
        "the precedence rules are documented out of order — the order IS the "
        f"contract. Found offsets: {positions}"
    )


def test_authority_veto_precedes_every_economic_rule():
    """Rule 1 and rule 2 are authority; rules 4 and 5 are economics."""
    doc = WORKFLOW_DOC.read_text(encoding="utf-8")
    authority = max(doc.find(_RULE_HEADINGS[0]), doc.find(_RULE_HEADINGS[1]))
    for economic in (_RULE_HEADINGS[3], _RULE_HEADINGS[4]):
        assert authority < doc.find(economic), (
            f"{economic} is documented before the authority rules — cost "
            "must never be evaluated ahead of authority."
        )


# ---------------------------------------------------------------------------
# What Set 131 S1 RETIRED — the pin, and two knobs that never existed
# ---------------------------------------------------------------------------


def test_the_verification_only_pin_is_gone(monkeypatch):
    cfg = _shipped(monkeypatch)
    assert cfg["routing"]["outsourcing_mode"] == "whenever-helpful"


def test_the_temporary_policy_section_is_gone_from_the_doc():
    doc = WORKFLOW_DOC.read_text(encoding="utf-8")
    assert "Temporary verification-only policy" not in doc, (
        "the retired Set 110-112 window is still described as current policy"
    )


@pytest.mark.parametrize(
    "phantom", ["direct_work_max_lines", "direct_work_max_files"]
)
def test_phantom_config_keys_are_documented_nowhere(phantom, monkeypatch):
    """Defect 3: the doc promised two human-tunable keys that were never
    shipped. Assert both surfaces agree they do not exist.
    """
    doc = WORKFLOW_DOC.read_text(encoding="utf-8")
    assert phantom not in doc, (
        f"the workflow doc still tells the reader {phantom} is tunable in "
        "router-config.yaml; it has never existed"
    )
    assert phantom not in _shipped(monkeypatch)["delegation"]
