"""Driver detail must not leak into a scenario's portable half.

Per L-112-1 every rule gets two falsifiers: one that PLANTS the
violation and asserts the rule fires, and one that plants the
legitimate look-alike and asserts it does not. A pattern gate over free
prose that nobody attacked is indistinguishable from a gate that matches
nothing -- and reading its regexes reads as confirmation.

The committed corpus is asserted clean here too, which is where the rule
actually bites: the lint itself is advisory, because refusing to render
a document over a sentence that looked like CSS would be the
route-around-the-gate failure this whole set exists to name.
"""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

import pytest

from scenario import discover_scenarios, load_scenario, parse_scenario
from scenario_lint import RULES, lint_scenario

WALKTHROUGHS_ROOT = Path(__file__).resolve().parents[2] / "docs" / "walkthroughs"

BASE = """
id: lint-fixture
title: A fixture scenario
summary: {summary}
audience: The lint test.
baseline:
  description: Start it from a shortcut.
  observable: The main window is open.
steps:
  - id: only-step
    title: The only step
    action: {action}
    expect: The thing is done.
drivers:
  playwright-web:
    steps:
      only-step:
        selector: '[data-testid="thing"] .row-label'
        xpath: '//div[@id="thing"]'
        call: 'page.locator("#thing").click()'
"""


def scenario(action: str = "Do the thing.", summary: str = "One step."):
    # JSON-quoted: an unquoted `#` starts a YAML comment, which would
    # silently truncate the very fragment a falsifier is planting.
    return parse_scenario(
        textwrap.dedent(
            BASE.format(action=json.dumps(action), summary=json.dumps(summary))
        )
    )


#: (rule name, planted violation, legitimate look-alike).
CASES = [
    (
        "attribute-selector",
        'Click the element matching [data-testid="save"].',
        "Click **Save**, then read the [release notes](notes.md).",
    ),
    (
        "css-class-selector",
        "Click the .monaco-list-row for the set.",
        "Open `uat-matrix.code-workspace`, then `docs/spec.md`, from `tools/x/.vscode-test/`.",
    ),
    (
        "css-id-selector",
        "Click #green-button to continue.",
        "See issue #123, press the # key, and open docs/guide.md#anchor. C# is fine.",
    ),
    (
        # Same rule, second form. Kept as its own case rather than folded
        # into the one above: `button#save` was missed by the FIRST fix for
        # this rule, and a falsifier that only ever plants the form the
        # author already thought of is the gap L-112-1 warns about.
        "css-id-selector",
        "Click button#save to continue.",
        "Read the note at https://example.test/guide#setup and open notes.md#top.",
    ),
    (
        "locator-engine-prefix",
        'Use css=button.primary to find it.',
        "The label reads css and the value is a colour.",
    ),
    (
        "xpath-expression",
        "Select //button[1] in the dialog.",
        "Read https://example.com/guide and the note at docs//nothing is not a path.",
    ),
    (
        "driver-api-call",
        'Run page.click("#save") to continue.',
        "Open the page. Click the Save button. The page.  Then stop.",
    ),
]


class TestEveryRuleHasBothFalsifiers:
    def test_every_rule_is_covered_by_a_case(self):
        # A rule added without falsifiers is the defect L-112-1 names.
        assert {rule.name for rule in RULES} == {name for name, _, _ in CASES}

    @pytest.mark.parametrize("name,violation,_look_alike", CASES)
    def test_the_planted_violation_is_flagged(self, name, violation, _look_alike):
        findings = lint_scenario(scenario(action=violation))
        assert name in {finding.rule for finding in findings}, findings
        flagged = next(finding for finding in findings if finding.rule == name)
        assert flagged.field.startswith("steps[0].action")
        assert "drivers" in str(flagged)

    @pytest.mark.parametrize("name,_violation,look_alike", CASES)
    def test_the_legitimate_look_alike_is_not_flagged(self, name, _violation, look_alike):
        findings = lint_scenario(scenario(action=look_alike))
        assert name not in {finding.rule for finding in findings}, findings


class TestCssIdSelectorBoundary:
    """The rule that took two attempts, pinned discrimination by discrimination.

    Round 2 of Set 113 S2 verification found the rule missing entirely.
    The first fix excluded `button#save` along with the URL fragments it
    was aimed at, and round 3 rejected it. The boundary between the two
    is subtle enough that it is asserted directly against the pattern
    rather than only through a scenario, so a future tightening cannot
    quietly re-lose one side of it.
    """

    RULE = next(rule for rule in RULES if rule.name == "css-id-selector")

    @pytest.mark.parametrize(
        "text",
        [
            "Click #green-button to continue.",  # bare id
            "Click button#save to continue.",  # type-qualified
            "div#main is the root element.",
            "a#b",  # shortest possible form
        ],
    )
    def test_selector_shapes_are_flagged(self, text: str):
        assert self.RULE.pattern.search(text), text

    @pytest.mark.parametrize(
        "text",
        [
            "See issue #123 for context.",  # identifiers cannot start with a digit
            "Press the # key twice.",  # nothing follows it
            "C# is fine.",  # nothing valid follows it
            "Open docs/guide.md#anchor in the browser.",  # file fragment
            "Read https://example.test/guide#setup first.",  # URL fragment
            "See notes.md#top.",  # bare file fragment
        ],
    )
    def test_legitimate_hashes_are_not_flagged(self, text: str):
        assert not self.RULE.pattern.search(text), text


class TestScope:
    def test_driver_blocks_are_never_linted(self):
        # The fixture's driver block is full of selectors, an XPath and a
        # Playwright call. That is where they BELONG, so a lint that
        # flagged them would make the quarantine unusable.
        assert lint_scenario(scenario()) == []

    def test_a_leak_anywhere_in_the_portable_half_is_found(self):
        findings = lint_scenario(scenario(summary="Look for .monaco-list-row rows."))
        assert [finding.field for finding in findings] == ["summary"]

    def test_the_finding_names_the_field_and_the_fragment(self):
        finding = lint_scenario(scenario(action="Click the .monaco-list-row."))[0]
        assert finding.field == "steps[0].action"
        assert finding.fragment == ".monaco-list-row"
        assert "CSS class selector" in str(finding)


class TestTheCommittedCorpus:
    def test_no_committed_scenario_leaks_driver_detail(self):
        scenarios = discover_scenarios(WALKTHROUGHS_ROOT)
        assert scenarios, f"no scenarios found under {WALKTHROUGHS_ROOT}"
        leaked = []
        for path in scenarios:
            for finding in lint_scenario(load_scenario(path)):
                leaked.append(f"{path}: {finding}")
        assert not leaked, "\n".join(leaked)
