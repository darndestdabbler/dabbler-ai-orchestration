"""Set 109 S3 — the scrape-to-propose flow.

No test in this file opens a socket. The parsers run against the verbatim page
slices in ``pricing_page_fixtures``; the fetch path is driven through
``httpx.MockTransport``; the apply path writes to a tmp_path copy of a config.

Two properties are load-bearing enough to be asserted directly rather than
implied:

- ``--apply`` never writes a rate a human did not mark ``accept``, and refuses
  outright while any change is still ``pending``.
- A page whose STRUCTURE changed is fatal, and a page whose PRICE changed is a
  proposal. Collapsing those two would either manufacture a plausible wrong
  number or cry wolf on every routine edit.
"""
from __future__ import annotations

import datetime
import json
from pathlib import Path

import httpx
import pytest

import pricing_page_fixtures as fx
from ai_router import pricing_proposal as pp
from ai_router.pricing import validate_model_rates

TODAY = datetime.date(2026, 8, 4)


def _parsed():
    return {
        "openai": pp.parse_openai(pp.parse_document(fx.OPENAI_PRICING_TABLE)),
        "anthropic": pp.parse_anthropic(pp.parse_document(fx.ANTHROPIC_PRICING_TABLE)),
        "google": pp.parse_google(pp.parse_document(fx.GOOGLE_PRICING_SECTIONS)),
    }


# ---------------------------------------------------------------------------
# Parsing — against the real markup each provider actually served
# ---------------------------------------------------------------------------


def test_openai_reads_the_short_context_rate():
    rates = pp.parse_openai(pp.parse_document(fx.OPENAI_PRICING_TABLE))
    assert rates["gpt-5.6-sol"].rows == [
        {"input_cost_per_1m": 5.00, "output_cost_per_1m": 30.00}
    ]
    assert rates["gpt-5.6-luna"].rows == [
        {"input_cost_per_1m": 0.20, "output_cost_per_1m": 1.20}
    ]


def test_openai_reports_long_context_without_proposing_it():
    """The page prints the long-context rates but never says where the
    boundary is, and inventing that number is the one thing this tool must
    not do."""
    rates = pp.parse_openai(pp.parse_document(fx.OPENAI_PRICING_TABLE))
    observed = rates["gpt-5.4"].observations
    assert len(observed) == 1
    assert observed[0]["input_cost_per_1m"] == 5.00
    assert observed[0]["output_cost_per_1m"] == 22.50
    # ...and it is nowhere in the rows that a proposal would write.
    assert rates["gpt-5.4"].rows == [
        {"input_cost_per_1m": 2.50, "output_cost_per_1m": 15.00}
    ]


def test_openai_bare_gpt_5_6_is_absent_from_the_page():
    """The specimen. The registry routes `gpt-5.6`; OpenAI lists three
    variants and no bare id."""
    rates = pp.parse_openai(pp.parse_document(fx.OPENAI_PRICING_TABLE))
    assert "gpt-5.6" not in rates
    assert {"gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"} <= set(rates)


def test_anthropic_reads_one_model_from_two_dated_rows():
    rates = pp.parse_anthropic(pp.parse_document(fx.ANTHROPIC_PRICING_TABLE))
    assert rates["Claude Sonnet 5"].rows == [
        {"input_cost_per_1m": 2.00, "output_cost_per_1m": 10.00},
        {"input_cost_per_1m": 3.00, "output_cost_per_1m": 15.00,
         "effective_from": "2026-09-01"},
    ]


def test_anthropic_strips_status_noise_from_a_model_name():
    rates = pp.parse_anthropic(pp.parse_document(fx.ANTHROPIC_PRICING_TABLE))
    assert "Claude Sonnet 4" in rates          # not "Claude Sonnet 4 ( retired... )"


@pytest.mark.parametrize(
    "cell, expected",
    [
        ("Claude Opus 5", ("Claude Opus 5", None)),
        ("Claude Sonnet 5 through August 31, 2026", ("Claude Sonnet 5", None)),
        ("Claude Sonnet 5 starting September 1, 2026",
         ("Claude Sonnet 5", "2026-09-01")),
        ("Claude Sonnet 4 (retired, except on Bedrock)", ("Claude Sonnet 4", None)),
    ],
)
def test_anthropic_label_splitting(cell, expected):
    assert pp.split_anthropic_label(cell) == expected


def test_google_reads_both_context_tiers_with_the_boundary():
    rates = pp.parse_google(pp.parse_document(fx.GOOGLE_PRICING_SECTIONS))
    assert rates["gemini-2.5-pro"].rows == [
        {"input_cost_per_1m": 1.25, "output_cost_per_1m": 10.00,
         "max_input_tokens": 200000},
        {"input_cost_per_1m": 2.50, "output_cost_per_1m": 15.00},
    ]


def test_google_reads_standard_and_never_batch():
    """Batch is exactly half Standard for the same model. Reading the wrong
    section would understate by 2x -- the same shape as the defect this whole
    effort exists to end."""
    rates = pp.parse_google(pp.parse_document(fx.GOOGLE_PRICING_SECTIONS))
    cheapest = min(r["input_cost_per_1m"] for r in rates["gemini-2.5-pro"].rows)
    assert cheapest == 1.25          # Standard; Batch would be 0.625


def test_google_binds_by_api_id_not_display_name():
    rates = pp.parse_google(pp.parse_document(fx.GOOGLE_PRICING_SECTIONS))
    assert "gemini-2.5-pro" in rates
    assert "Gemini 2.5 Pro" not in rates


def test_unescaped_less_than_survives_the_parser():
    """The Google page emits a literal `<= 200k tokens` inside a cell. A
    regex tag-strip eats it and leaves a plausible single price."""
    blocks = pp.parse_document(
        "<table><tr><td>Input price</td><td>Free of charge</td>"
        "<td>$1.25, prompts <= 200k tokens<br>$2.50, prompts > 200k tokens</td>"
        "</tr></table>"
    )
    cell = blocks[0].rows[0][2]
    assert "<= 200k" in cell
    assert cell.split("\n") == ["$1.25, prompts <= 200k tokens",
                                "$2.50, prompts > 200k tokens"]


@pytest.mark.parametrize(
    "text, expected",
    [
        ("$5.00", 5.0), ("$5 / MTok", 5.0), ("$0.20", 0.2),
        ("$1.25, prompts <= 200k tokens", 1.25),
        ("-", None), ("Free of charge", None), ("Not available", None), ("", None),
    ],
)
def test_money_parsing(text, expected):
    assert pp.parse_money(text) == expected


@pytest.mark.parametrize(
    "text, expected",
    [
        ("$1.25, prompts <= 200k tokens", 200000),
        ("$1.25, prompts <= 200,000 tokens", 200000),
        ("$2.50, prompts > 200k tokens", None),
        ("$5.00", None),
    ],
)
def test_upper_bound_parsing(text, expected):
    assert pp.parse_upper_bound(text) == expected


# ---------------------------------------------------------------------------
# Structure failure is LOUD, and different from a price change
# ---------------------------------------------------------------------------


def test_renamed_openai_column_group_is_fatal():
    broken = fx.OPENAI_PRICING_TABLE.replace("Short context", "Standard context")
    with pytest.raises(pp.PageStructureError, match="Short context"):
        pp.parse_openai(pp.parse_document(broken))


def test_renamed_anthropic_column_is_fatal():
    broken = fx.ANTHROPIC_PRICING_TABLE.replace("Base Input Tokens", "Input")
    with pytest.raises(pp.PageStructureError):
        pp.parse_anthropic(pp.parse_document(broken))


def test_renamed_google_standard_section_is_fatal():
    broken = fx.GOOGLE_PRICING_SECTIONS.replace(">Standard<", ">Normal<")
    with pytest.raises(pp.PageStructureError, match="Standard"):
        pp.parse_google(pp.parse_document(broken))


def test_an_empty_page_is_fatal_rather_than_an_empty_proposal():
    """The dangerous failure: a page that parses to nothing looks exactly like
    'no changes' unless it is made to shout."""
    for parser in (pp.parse_openai, pp.parse_anthropic, pp.parse_google):
        with pytest.raises(pp.PageStructureError):
            parser(pp.parse_document("<html><body><p>Nothing here</p></body></html>"))


def test_a_changed_price_is_NOT_fatal():
    """The contrast case for the three above: same structure, new number."""
    repriced = fx.OPENAI_PRICING_TABLE.replace(">$2.50<", ">$99.00<")
    rates = pp.parse_openai(pp.parse_document(repriced))
    assert rates["gpt-5.4"].rows[0]["input_cost_per_1m"] == 99.00


# ---------------------------------------------------------------------------
# Identity binding
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "model_id, expected",
    [
        ("claude-sonnet-4-6", "Claude Sonnet 4.6"),
        ("claude-opus-4-8", "Claude Opus 4.8"),
        ("claude-opus-5", "Claude Opus 5"),
        ("claude-sonnet-5", "Claude Sonnet 5"),
        ("claude-haiku-3-5", "Claude Haiku 3.5"),
    ],
)
def test_anthropic_display_names_are_derived_not_looked_up(model_id, expected):
    assert pp.anthropic_display_name(model_id) == expected


def test_every_derived_anthropic_name_exists_on_the_page():
    """The derivation rule is only safe if it actually hits. If Anthropic
    restyles its names this fails, which is the intended signal."""
    rates = pp.parse_anthropic(pp.parse_document(fx.ANTHROPIC_PRICING_TABLE))
    for model_id in ("claude-opus-5", "claude-sonnet-5", "claude-opus-4-8",
                     "claude-sonnet-4-6"):
        assert pp.anthropic_display_name(model_id) in rates


# ---------------------------------------------------------------------------
# Proposal building
# ---------------------------------------------------------------------------


def _config(**models):
    return {"models": models}


def test_a_matching_but_unstamped_rate_becomes_a_confirmation():
    """Without this, a registry whose prices are all CORRECT could never
    become one whose prices are all CONFIRMED: a matching rate produced no
    change, so it had no route to a confirmed_on stamp, ever."""
    config = _config(**{"gpt-5-4-mini": {
        "provider": "openai", "model_id": "gpt-5.4-mini",
        "input_cost_per_1m": 0.75, "output_cost_per_1m": 4.50,
    }})
    proposal = pp.build_proposal(config, _parsed(), generated_on=TODAY)
    change = proposal["changes"][0]
    assert change["change_type"] == "confirm"
    assert change["decision"] == pp.DECISION_PENDING
    assert pp._normalized(change["current"]) == pp._normalized(change["proposed"])


def test_a_matching_and_freshly_stamped_rate_produces_no_change():
    """...and once confirmed it stops nagging, until the stamp ages out."""
    config = _config(**{"gpt-5-4-mini": {
        "provider": "openai", "model_id": "gpt-5.4-mini",
        "input_cost_per_1m": 0.75, "output_cost_per_1m": 4.50,
        "confirmed_on": "2026-08-01",
    }})
    assert pp.build_proposal(config, _parsed(), generated_on=TODAY)["changes"] == []


def test_a_matching_rate_with_a_stale_stamp_comes_back():
    config = _config(**{"gpt-5-4-mini": {
        "provider": "openai", "model_id": "gpt-5.4-mini",
        "input_cost_per_1m": 0.75, "output_cost_per_1m": 4.50,
        "confirmed_on": "2026-01-01",
    }})
    proposal = pp.build_proposal(config, _parsed(), generated_on=TODAY)
    assert proposal["changes"][0]["change_type"] == "confirm"


def test_an_understated_rate_produces_a_pending_change():
    config = _config(**{"gpt-5-5": {
        "provider": "openai", "model_id": "gpt-5.5",
        "input_cost_per_1m": 2.50, "output_cost_per_1m": 15.00,
    }})
    proposal = pp.build_proposal(config, _parsed(), generated_on=TODAY)
    change = proposal["changes"][0]
    assert change["alias"] == "gpt-5-5"
    assert change["decision"] == pp.DECISION_PENDING
    assert change["current"]["output_cost_per_1m"] == 15.00
    assert change["proposed"]["output_cost_per_1m"] == 30.00


def test_a_missing_tier_produces_a_structured_proposal():
    """gemini-pro records the cheap tier and nothing else -- the live defect."""
    config = _config(**{"gemini-pro": {
        "provider": "google", "model_id": "gemini-2.5-pro",
        "input_cost_per_1m": 1.25, "output_cost_per_1m": 10.00,
    }})
    proposal = pp.build_proposal(config, _parsed(), generated_on=TODAY)
    proposed = proposal["changes"][0]["proposed"]
    assert proposed["pricing"][0]["max_input_tokens"] == 200000
    assert proposed["pricing"][1]["input_cost_per_1m"] == 2.50


def test_every_proposal_is_a_shape_the_schema_accepts():
    """A proposal that could not be loaded back is worse than no proposal."""
    config = _config(
        **{
            "gemini-pro": {"provider": "google", "model_id": "gemini-2.5-pro",
                           "input_cost_per_1m": 9.0, "output_cost_per_1m": 9.0},
            "sonnet": {"provider": "anthropic", "model_id": "claude-sonnet-5",
                       "input_cost_per_1m": 9.0, "output_cost_per_1m": 9.0},
            "gpt-5-5": {"provider": "openai", "model_id": "gpt-5.5",
                        "input_cost_per_1m": 9.0, "output_cost_per_1m": 9.0},
        }
    )
    proposal = pp.build_proposal(config, _parsed(), generated_on=TODAY)
    assert len(proposal["changes"]) == 3
    for change in proposal["changes"]:
        validate_model_rates(change["alias"], dict(change["proposed"]))


def test_a_configured_model_the_page_omits_is_reported_loudly():
    config = _config(**{"gpt-5-6": {
        "provider": "openai", "model_id": "gpt-5.6",
        "input_cost_per_1m": 2.50, "output_cost_per_1m": 15.00,
    }})
    proposal = pp.build_proposal(config, _parsed(), generated_on=TODAY)
    assert proposal["changes"] == []
    assert proposal["unmatched_config_entries"] == [
        {"alias": "gpt-5-6", "provider": "openai", "model_id": "gpt-5.6",
         "looked_for": "gpt-5.6",
         "reason": "it is not listed there"}
    ]
    rendered = "\n".join(pp.render_proposal(proposal))
    assert "NOT CHECKED" in rendered
    assert "was NOT checked" in rendered


def test_page_models_no_entry_claims_are_listed():
    config = _config(**{"gpt-5-4": {
        "provider": "openai", "model_id": "gpt-5.4",
        "input_cost_per_1m": 2.50, "output_cost_per_1m": 15.00,
    }})
    proposal = pp.build_proposal(config, _parsed(), generated_on=TODAY)
    assert "gpt-5.6-luna" in proposal["unclaimed_page_models"]["openai"]
    assert "gpt-5.4" not in proposal["unclaimed_page_models"]["openai"]


# ---------------------------------------------------------------------------
# Fetch — all or nothing
# ---------------------------------------------------------------------------


_PAGE_BODIES = {
    pp.PRICING_PAGES["openai"]: fx.OPENAI_PRICING_TABLE,
    pp.PRICING_PAGES["anthropic"]: fx.ANTHROPIC_PRICING_TABLE,
    pp.PRICING_PAGES["google"]: fx.GOOGLE_PRICING_SECTIONS,
}


#: Captured before any monkeypatching, so a test that replaces
#: ``httpx.Client`` on the module can still build a real mock-backed one.
_REAL_HTTPX_CLIENT = httpx.Client


def _client(overrides=None, status=None):
    overrides = overrides or {}
    status = status or {}

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url in status:
            return httpx.Response(status[url], text="nope")
        return httpx.Response(200, text=overrides.get(url, _PAGE_BODIES[url]))

    return _REAL_HTTPX_CLIENT(transport=httpx.MockTransport(handler))


def test_fetch_all_returns_all_three_providers():
    with _client() as client:
        rates = pp.fetch_all(client)
    assert set(rates) == {"openai", "anthropic", "google"}


def test_one_unfetchable_page_aborts_the_whole_run():
    with _client(status={pp.PRICING_PAGES["anthropic"]: 503}) as client:
        with pytest.raises(pp.PageStructureError, match="anthropic"):
            pp.fetch_all(client)


def test_one_unparseable_page_aborts_the_whole_run():
    """A proposal covering two of three providers reads as 'prices checked'
    while the third silently rots."""
    with _client(overrides={pp.PRICING_PAGES["google"]: "<html></html>"}) as client:
        with pytest.raises(pp.PageStructureError, match="google"):
            pp.fetch_all(client)


# ---------------------------------------------------------------------------
# Apply — the human is the gate
# ---------------------------------------------------------------------------


CONFIG_YAML = """\
# A comment that must survive the round-trip.
metadata:
  pricing_reviewed: "2026-07-03"
  review_frequency_days: 30

models:
  # Load-bearing documentation about this entry.
  gpt-5-5:
    provider: openai
    model_id: gpt-5.5
    input_cost_per_1m: 2.50
    output_cost_per_1m: 15.00
  gemini-pro:
    provider: google
    model_id: gemini-2.5-pro
    input_cost_per_1m: 1.25
    output_cost_per_1m: 10.00
"""


@pytest.fixture
def config_file(tmp_path) -> Path:
    path = tmp_path / "router-config.yaml"
    path.write_text(CONFIG_YAML, encoding="utf-8")
    return path


_FIXTURE_MODEL_IDS = {"gpt-5-5": "gpt-5.5", "gemini-pro": "gemini-2.5-pro"}


def _change(alias, proposed, decision, change_type="update", model_id=None):
    return {"alias": alias, "provider": "x",
            "model_id": model_id or _FIXTURE_MODEL_IDS.get(alias, "y"),
            "page_key": "y", "source_url": "u", "current": {},
            "proposed": proposed, "observations": [],
            "change_type": change_type, "decision": decision}


def test_a_pending_change_refuses_the_whole_apply():
    """Applying the accepted ones and leaving the rest would let a half-read
    proposal still write prices."""
    proposal = {"schema_version": pp.SCHEMA_VERSION, "changes": [
        _change("a", {"input_cost_per_1m": 1.0, "output_cost_per_1m": 2.0},
                pp.DECISION_ACCEPT),
        _change("b", {"input_cost_per_1m": 1.0, "output_cost_per_1m": 2.0},
                pp.DECISION_PENDING),
    ]}
    with pytest.raises(pp.ProposalError, match="still 'pending'"):
        pp.accepted_changes(proposal)


def test_an_unrecognised_decision_refuses_the_apply():
    proposal = {"schema_version": pp.SCHEMA_VERSION, "changes": [
        _change("a", {"input_cost_per_1m": 1.0, "output_cost_per_1m": 2.0}, "maybe"),
    ]}
    with pytest.raises(pp.ProposalError, match="unrecognised decision"):
        pp.accepted_changes(proposal)


def test_only_accepted_changes_are_returned():
    proposal = {"schema_version": pp.SCHEMA_VERSION, "changes": [
        _change("a", {}, pp.DECISION_ACCEPT),
        _change("b", {}, pp.DECISION_REJECT),
    ]}
    assert [c["alias"] for c in pp.accepted_changes(proposal)] == ["a"]


def test_apply_writes_the_accepted_rate_and_stamps_it(config_file):
    ruamel = pytest.importorskip("ruamel.yaml")
    written = pp.apply_changes(
        config_file,
        [_change("gpt-5-5",
                 {"input_cost_per_1m": 5.00, "output_cost_per_1m": 30.00},
                 pp.DECISION_ACCEPT)],
        confirmed_on=TODAY,
    )
    assert written == ["gpt-5-5"]
    document = ruamel.YAML().load(config_file.read_text(encoding="utf-8"))
    assert document["models"]["gpt-5-5"]["output_cost_per_1m"] == 30.00
    assert document["models"]["gpt-5-5"]["confirmed_on"] == "2026-08-04"


def test_apply_leaves_a_rejected_entry_completely_alone(config_file):
    pytest.importorskip("ruamel.yaml")
    pp.apply_changes(
        config_file,
        [_change("gpt-5-5",
                 {"input_cost_per_1m": 5.00, "output_cost_per_1m": 30.00},
                 pp.DECISION_ACCEPT)],
        confirmed_on=TODAY,
    )
    text = config_file.read_text(encoding="utf-8")
    assert "1.25" in text                        # gemini-pro's rate, untouched
    assert "confirmed_on" not in text.split("gemini-pro:")[1]


def test_apply_replaces_a_flat_entry_with_a_tiered_one(config_file):
    ruamel = pytest.importorskip("ruamel.yaml")
    pp.apply_changes(
        config_file,
        [_change("gemini-pro", {"pricing": [
            {"max_input_tokens": 200000,
             "input_cost_per_1m": 1.25, "output_cost_per_1m": 10.00},
            {"input_cost_per_1m": 2.50, "output_cost_per_1m": 15.00},
        ]}, pp.DECISION_ACCEPT)],
        confirmed_on=TODAY,
    )
    entry = ruamel.YAML().load(config_file.read_text(encoding="utf-8"))["models"]["gemini-pro"]
    # The flat fields must be GONE, not left beside the list to disagree with it.
    assert "input_cost_per_1m" not in entry
    assert entry["pricing"][0]["max_input_tokens"] == 200000


def test_apply_preserves_the_config_comments(config_file):
    pytest.importorskip("ruamel.yaml")
    pp.apply_changes(
        config_file,
        [_change("gpt-5-5",
                 {"input_cost_per_1m": 5.00, "output_cost_per_1m": 30.00},
                 pp.DECISION_ACCEPT)],
        confirmed_on=TODAY,
    )
    text = config_file.read_text(encoding="utf-8")
    assert "# A comment that must survive the round-trip." in text
    assert "# Load-bearing documentation about this entry." in text


def test_the_rollup_does_NOT_advance_while_a_priced_model_is_unstamped(config_file):
    """The extension's Cost Dashboard renders its staleness banner from this
    field. Setting it to the oldest EXISTING stamp would read as today the
    moment one model is confirmed, declaring the whole file freshly reviewed
    while the rest sit unconfirmed. A confidently-wrong rollup is worse than a
    visibly old one."""
    ruamel = pytest.importorskip("ruamel.yaml")
    pp.apply_changes(
        config_file,
        [_change("gpt-5-5",
                 {"input_cost_per_1m": 5.00, "output_cost_per_1m": 30.00},
                 pp.DECISION_ACCEPT)],
        confirmed_on=TODAY,
    )
    document = ruamel.YAML().load(config_file.read_text(encoding="utf-8"))
    assert document["models"]["gpt-5-5"]["confirmed_on"] == "2026-08-04"
    assert document["metadata"]["pricing_reviewed"] == "2026-07-03"   # unmoved


def test_the_rollup_advances_once_every_priced_model_is_stamped(config_file):
    ruamel = pytest.importorskip("ruamel.yaml")
    pp.apply_changes(
        config_file,
        [
            _change("gpt-5-5",
                    {"input_cost_per_1m": 5.00, "output_cost_per_1m": 30.00},
                    pp.DECISION_ACCEPT),
            _change("gemini-pro",
                    {"input_cost_per_1m": 1.25, "output_cost_per_1m": 10.00},
                    pp.DECISION_ACCEPT, change_type="confirm"),
        ],
        confirmed_on=TODAY,
    )
    document = ruamel.YAML().load(config_file.read_text(encoding="utf-8"))
    assert document["metadata"]["pricing_reviewed"] == "2026-08-04"


def test_a_confirmation_stamps_without_touching_the_rate(config_file):
    ruamel = pytest.importorskip("ruamel.yaml")
    pp.apply_changes(
        config_file,
        [_change("gemini-pro",
                 {"input_cost_per_1m": 999.0, "output_cost_per_1m": 999.0},
                 pp.DECISION_ACCEPT, change_type="confirm")],
        confirmed_on=TODAY,
    )
    entry = ruamel.YAML().load(config_file.read_text(encoding="utf-8"))["models"]["gemini-pro"]
    # A confirm entry's `proposed` equals `current` by construction; even a
    # doctored one must not become a rate write.
    assert entry["input_cost_per_1m"] == 1.25
    assert entry["confirmed_on"] == "2026-08-04"


def test_apply_refuses_when_the_alias_now_points_at_a_different_model(config_file):
    """Session 4 repoints aliases. A proposal fetched before a repoint would
    otherwise write the old model's rates into the new model's entry and stamp
    them confirmed today."""
    pytest.importorskip("ruamel.yaml")
    before = config_file.read_text(encoding="utf-8")
    with pytest.raises(pp.ProposalError, match="different model"):
        pp.apply_changes(
            config_file,
            [_change("gemini-pro",
                     {"input_cost_per_1m": 1.0, "output_cost_per_1m": 2.0},
                     pp.DECISION_ACCEPT, model_id="gemini-3.1-pro-preview")],
            confirmed_on=TODAY,
        )
    assert config_file.read_text(encoding="utf-8") == before


def test_apply_refuses_a_change_that_would_not_load(config_file):
    """Two bounded rows and no unbounded one: a large prompt would have no
    rate. The file must be left untouched."""
    pytest.importorskip("ruamel.yaml")
    before = config_file.read_text(encoding="utf-8")
    with pytest.raises(pp.ProposalError, match="cannot load"):
        pp.apply_changes(
            config_file,
            [_change("gemini-pro", {"pricing": [
                {"max_input_tokens": 1000,
                 "input_cost_per_1m": 1.0, "output_cost_per_1m": 2.0},
                {"max_input_tokens": 2000,
                 "input_cost_per_1m": 3.0, "output_cost_per_1m": 4.0},
            ]}, pp.DECISION_ACCEPT)],
            confirmed_on=TODAY,
        )
    assert config_file.read_text(encoding="utf-8") == before


def test_apply_refuses_a_model_that_left_the_config(config_file):
    pytest.importorskip("ruamel.yaml")
    with pytest.raises(pp.ProposalError, match="no longer in"):
        pp.apply_changes(
            config_file,
            [_change("retired-model",
                     {"input_cost_per_1m": 1.0, "output_cost_per_1m": 2.0},
                     pp.DECISION_ACCEPT)],
            confirmed_on=TODAY,
        )


def test_a_proposal_from_another_schema_version_is_refused(tmp_path):
    path = tmp_path / "pricing-proposal.json"
    path.write_text(json.dumps({"schema_version": 99, "changes": []}),
                    encoding="utf-8")
    with pytest.raises(pp.ProposalError, match="schema_version"):
        pp.load_proposal(path)


def test_a_missing_proposal_names_the_command_that_makes_one(tmp_path):
    with pytest.raises(pp.ProposalError, match="--fetch"):
        pp.load_proposal(tmp_path / "absent.json")


# ---------------------------------------------------------------------------
# The CLI never writes on --fetch
# ---------------------------------------------------------------------------


def _minimal_config():
    """What ``build_proposal`` reads. ``load_config`` is monkeypatched out of
    these two tests on purpose: they are about what the CLI WRITES, and
    dragging in provider-key validation would test something else."""
    return {"models": {
        "gpt-5-5": {"provider": "openai", "model_id": "gpt-5.5",
                    "input_cost_per_1m": 2.50, "output_cost_per_1m": 15.00},
        "gemini-pro": {"provider": "google", "model_id": "gemini-2.5-pro",
                       "input_cost_per_1m": 1.25, "output_cost_per_1m": 10.00},
    }}


def test_fetch_never_writes_the_config(tmp_path, monkeypatch, config_file):
    before = config_file.read_text(encoding="utf-8")
    monkeypatch.setattr(pp, "load_config", lambda path=None: _minimal_config())
    monkeypatch.setattr(pp.httpx, "Client", lambda **kw: _client())
    proposal_path = tmp_path / "proposal.json"

    code = pp.main([
        "--fetch", "--config", str(config_file), "--proposal", str(proposal_path)
    ])

    assert code == pp.EXIT_CHANGES
    assert config_file.read_text(encoding="utf-8") == before
    payload = json.loads(proposal_path.read_text(encoding="utf-8"))
    assert payload["changes"], "the fixtures disagree with the config, so there must be changes"
    assert all(c["decision"] == pp.DECISION_PENDING for c in payload["changes"])


def test_fetch_writes_no_proposal_at_all_when_a_page_breaks(
    tmp_path, monkeypatch, config_file
):
    monkeypatch.setattr(pp, "load_config", lambda path=None: _minimal_config())
    monkeypatch.setattr(
        pp.httpx, "Client",
        lambda **kw: _client(overrides={pp.PRICING_PAGES["google"]: "<html></html>"}),
    )
    proposal_path = tmp_path / "proposal.json"

    code = pp.main([
        "--fetch", "--config", str(config_file), "--proposal", str(proposal_path)
    ])

    assert code == pp.EXIT_FATAL
    assert not proposal_path.exists()


def test_apply_with_nothing_accepted_leaves_the_config_alone(
    tmp_path, monkeypatch, config_file
):
    before = config_file.read_text(encoding="utf-8")
    proposal_path = tmp_path / "proposal.json"
    proposal_path.write_text(json.dumps({
        "schema_version": pp.SCHEMA_VERSION,
        "changes": [_change("gpt-5-5",
                            {"input_cost_per_1m": 5.0, "output_cost_per_1m": 30.0},
                            pp.DECISION_REJECT)],
    }), encoding="utf-8")

    code = pp.main([
        "--apply", "--config", str(config_file), "--proposal", str(proposal_path)
    ])

    assert code == pp.EXIT_NO_CHANGES
    assert config_file.read_text(encoding="utf-8") == before


def test_apply_refuses_and_writes_nothing_while_a_change_is_pending(
    tmp_path, config_file
):
    before = config_file.read_text(encoding="utf-8")
    proposal_path = tmp_path / "proposal.json"
    proposal_path.write_text(json.dumps({
        "schema_version": pp.SCHEMA_VERSION,
        "changes": [_change("gpt-5-5",
                            {"input_cost_per_1m": 5.0, "output_cost_per_1m": 30.0},
                            pp.DECISION_PENDING)],
    }), encoding="utf-8")

    code = pp.main([
        "--apply", "--config", str(config_file), "--proposal", str(proposal_path)
    ])

    assert code == pp.EXIT_CHANGES
    assert config_file.read_text(encoding="utf-8") == before


# ---------------------------------------------------------------------------
# Round-1 remediation: the fail-open paths this session's own verification
# round found. Each one manufactured a structurally valid, plausible-looking
# price -- which is the precise failure the module exists to prevent.
# ---------------------------------------------------------------------------


def _google_with_mismatched_lines():
    """Google adds a modality line to output but not input -- an ordinary
    page evolution. The two sides can no longer be paired without guessing."""
    return fx.GOOGLE_PRICING_SECTIONS.replace(
        "<td>$10.00, prompts <= 200k tokens<br>$15.00, prompts > 200k</td>",
        "<td>$10.00, prompts <= 200k tokens</td>",
        1,
    )


def test_mismatched_google_line_counts_do_not_become_a_flat_price():
    """The earlier draft paired the first input line with the first output
    line and returned a flat rate. That is a guess."""
    rates = pp.parse_google(pp.parse_document(_google_with_mismatched_lines()))
    entry = rates["gemini-2.5-pro"]
    assert entry.rows == []
    assert "unreadable" in entry.observations[0]


def test_an_unreadable_section_for_a_CONFIGURED_model_aborts_the_run():
    """Round 3 rejected the softer treatment this replaced. Reporting it as
    "not checked" while still writing a proposal for the other models turns a
    parse failure into a permitted partial, and "no silent partial" cannot
    mean a line an operator may skim past on the way to applying the rest."""
    page_rates = dict(_parsed())
    page_rates["google"] = pp.parse_google(
        pp.parse_document(_google_with_mismatched_lines())
    )
    config = _config(**{"gemini-pro": {
        "provider": "google", "model_id": "gemini-2.5-pro",
        "input_cost_per_1m": 1.25, "output_cost_per_1m": 10.00,
    }})
    with pytest.raises(pp.PageStructureError, match="gemini-pro"):
        pp.build_proposal(config, page_rates, generated_on=TODAY)


def test_a_model_absent_from_the_page_is_reported_but_NOT_fatal():
    """The contrast case. `gpt-5.6` is not on OpenAI's list at all -- a
    registry defect for Session 4, not a parser failure -- so it is reported
    as unchecked and the run continues."""
    config = _config(**{
        "gpt-5-6": {"provider": "openai", "model_id": "gpt-5.6",
                    "input_cost_per_1m": 2.50, "output_cost_per_1m": 15.00},
        "gpt-5-4": {"provider": "openai", "model_id": "gpt-5.4",
                    "input_cost_per_1m": 2.50, "output_cost_per_1m": 15.00,
                    "confirmed_on": "2026-08-01"},
    })
    proposal = pp.build_proposal(config, _parsed(), generated_on=TODAY)
    assert [m["alias"] for m in proposal["unmatched_config_entries"]] == ["gpt-5-6"]


def test_disagreeing_tier_bounds_do_not_become_a_price():
    broken = fx.GOOGLE_PRICING_SECTIONS.replace(
        "$15.00, prompts > 200k", "$15.00, prompts <= 400k tokens", 1
    )
    entry = pp.parse_google(pp.parse_document(broken))["gemini-2.5-pro"]
    assert entry.rows == []
    assert "bounds disagree" in entry.observations[0]["unreadable"]


def test_an_unreadable_model_nobody_configured_is_simply_ignored():
    """Roughly a hundred sections on that page price video, images, TTS and
    embeddings. One of them going unreadable must not fail a run that never
    cared about it."""
    page_rates = dict(_parsed())
    page_rates["google"] = pp.parse_google(
        pp.parse_document(_google_with_mismatched_lines())
    )
    config = _config(**{"gemini-flash": {
        "provider": "google", "model_id": "gemini-2.5-flash",
        "input_cost_per_1m": 0.30, "output_cost_per_1m": 2.50,
        "confirmed_on": "2026-08-01",
    }})
    proposal = pp.build_proposal(config, page_rates, generated_on=TODAY)
    # gemini-2.5-pro is the unreadable one and nothing configured points at
    # it, so the run is silent about it.
    assert proposal["changes"] == []
    assert proposal["unmatched_config_entries"] == []


def test_a_failed_refresh_moves_the_previous_proposal_out_of_reach(
    tmp_path, monkeypatch, config_file
):
    """Writing nothing is not enough: an edited proposal from an earlier run
    is still sitting at that path, and the next --apply would write its
    months-old numbers and stamp them confirmed today."""
    monkeypatch.setattr(pp, "load_config", lambda path=None: _minimal_config())
    proposal_path = tmp_path / "proposal.json"
    proposal_path.write_text(json.dumps({
        "schema_version": pp.SCHEMA_VERSION,
        "changes": [_change("gpt-5-5",
                            {"input_cost_per_1m": 1.0, "output_cost_per_1m": 2.0},
                            pp.DECISION_ACCEPT)],
    }), encoding="utf-8")
    monkeypatch.setattr(
        pp.httpx, "Client",
        lambda **kw: _client(overrides={pp.PRICING_PAGES["google"]: "<html></html>"}),
    )

    code = pp.main([
        "--fetch", "--config", str(config_file), "--proposal", str(proposal_path)
    ])

    assert code == pp.EXIT_FATAL
    assert not proposal_path.exists()
    # Moved aside, not destroyed -- the operator's accept/reject work is theirs.
    stale = proposal_path.with_suffix(".stale.json")
    assert stale.exists()
    assert json.loads(stale.read_text(encoding="utf-8"))["changes"][0]["decision"] == "accept"


def test_apply_after_a_failed_refresh_finds_nothing_to_apply(
    tmp_path, monkeypatch, config_file
):
    """The point of moving it aside: the very next --apply is a no-op rather
    than a confident write of unverified numbers."""
    monkeypatch.setattr(pp, "load_config", lambda path=None: _minimal_config())
    proposal_path = tmp_path / "proposal.json"
    proposal_path.write_text(json.dumps({
        "schema_version": pp.SCHEMA_VERSION,
        "changes": [_change("gpt-5-5",
                            {"input_cost_per_1m": 1.0, "output_cost_per_1m": 2.0},
                            pp.DECISION_ACCEPT)],
    }), encoding="utf-8")
    monkeypatch.setattr(
        pp.httpx, "Client",
        lambda **kw: _client(overrides={pp.PRICING_PAGES["google"]: "<html></html>"}),
    )
    pp.main(["--fetch", "--config", str(config_file),
             "--proposal", str(proposal_path)])

    before = config_file.read_text(encoding="utf-8")
    code = pp.main(["--apply", "--config", str(config_file),
                    "--proposal", str(proposal_path)])

    assert code == pp.EXIT_CHANGES          # refused: there is no proposal
    assert config_file.read_text(encoding="utf-8") == before


def test_a_modality_split_reads_the_labelled_text_rate():
    """`gemini-2.5-flash` prices input as `$0.30 (text / image / video)` and
    `$1.00 (audio)` against a single output price. Those cells are split on
    different axes; reading the labelled text line is a read, pairing line 1
    with line 1 would be a guess that happened to be right."""
    rates = pp.parse_google(pp.parse_document(fx.GOOGLE_PRICING_SECTIONS))
    assert rates["gemini-2.5-flash"].rows == [
        {"input_cost_per_1m": 0.30, "output_cost_per_1m": 2.50}
    ]


def test_an_unlabelled_multi_rate_cell_is_unreadable():
    broken = fx.GOOGLE_PRICING_SECTIONS.replace(
        "$0.30 (text / image / video)", "$0.30 (image)", 1
    )
    entry = pp.parse_google(pp.parse_document(broken))["gemini-2.5-flash"]
    assert entry.rows == []
    assert "cannot be told apart" in entry.observations[0]["unreadable"]


def test_two_text_lines_are_unreadable_rather_than_first_wins():
    broken = fx.GOOGLE_PRICING_SECTIONS.replace(
        "$1.00 (audio)", "$1.00 (text, long)", 1
    )
    entry = pp.parse_google(pp.parse_document(broken))["gemini-2.5-flash"]
    assert entry.rows == []


def test_an_unreadable_configured_model_quarantines_the_previous_proposal(
    tmp_path, monkeypatch, config_file
):
    """The parse failure must reach the SAME quarantine a fetch failure does,
    or the stale proposal it leaves behind is applicable."""
    monkeypatch.setattr(pp, "load_config", lambda path=None: _minimal_config())
    proposal_path = tmp_path / "proposal.json"
    proposal_path.write_text(json.dumps({
        "schema_version": pp.SCHEMA_VERSION,
        "changes": [_change("gpt-5-5",
                            {"input_cost_per_1m": 1.0, "output_cost_per_1m": 2.0},
                            pp.DECISION_ACCEPT)],
    }), encoding="utf-8")
    monkeypatch.setattr(
        pp.httpx, "Client",
        lambda **kw: _client(
            overrides={pp.PRICING_PAGES["google"]: _google_with_mismatched_lines()}
        ),
    )

    code = pp.main([
        "--fetch", "--config", str(config_file), "--proposal", str(proposal_path)
    ])

    assert code == pp.EXIT_FATAL
    assert not proposal_path.exists()
    assert proposal_path.with_suffix(".stale.json").exists()


def test_a_price_cell_with_no_recognised_rate_is_unreadable_not_absent():
    """Round 4: `_priced_lines` drops every unparseable line, so a reformatted
    cell left the section looking ABSENT rather than unreadable -- and absent
    is the non-fatal branch."""
    broken = fx.GOOGLE_PRICING_SECTIONS.replace(
        "<td>$0.30 (text / image / video)<br>$1.00 (audio)</td>",
        "<td>see the pricing calculator</td>",
        1,
    )
    entry = pp.parse_google(pp.parse_document(broken))["gemini-2.5-flash"]
    assert entry.rows == []
    assert "no per-token rate" in entry.observations[0]["unreadable"]


def test_an_unrecognised_price_cell_on_a_configured_model_aborts(tmp_path,
                                                                 monkeypatch,
                                                                 config_file):
    broken = fx.GOOGLE_PRICING_SECTIONS.replace(
        "<td>$1.25, prompts <= 200k tokens<br>$2.50, prompts > 200k tokens</td>",
        "<td>see the pricing calculator</td>",
        1,
    )
    monkeypatch.setattr(pp, "load_config", lambda path=None: _minimal_config())
    monkeypatch.setattr(
        pp.httpx, "Client",
        lambda **kw: _client(overrides={pp.PRICING_PAGES["google"]: broken}),
    )
    proposal_path = tmp_path / "proposal.json"

    code = pp.main([
        "--fetch", "--config", str(config_file), "--proposal", str(proposal_path)
    ])

    assert code == pp.EXIT_FATAL
    assert not proposal_path.exists()


def test_a_section_with_no_price_rows_at_all_is_still_irrelevant():
    """The contrast: image / video / TTS sections carry no Input price row and
    must stay ignorable, or one of the ~100 non-text models would fail every
    run."""
    assert pp._google_section_rates(
        pp.Table(rows=[["Image price", "Free", "$0.04 / image"]]), "imagen-4"
    ) is None
