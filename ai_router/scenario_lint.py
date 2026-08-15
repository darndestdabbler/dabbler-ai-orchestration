"""Driver detail must not leak into the portable half (Set 113 Session 2).

The quarantine is enforced twice, and the two halves do different jobs.

**Structurally** (:mod:`ai_router.scenario`, :mod:`ai_router.scenario_render`):
no renderer reads ``drivers``, and ``Scenario.portable_digest`` cannot
see it. That is what guarantees a selector change leaves all four
renderings byte-identical -- a property a test can prove, and it holds
however careless an author is.

**Textually** (this module): the structural half cannot notice a
selector an author typed into ``action`` instead of into a driver block.
That step still renders, it just renders unreadable instructions on
every platform, and no amount of structure catches it. So this scans the
portable strings for selector-shaped text.

It is a **lint, not a schema refusal** -- deliberately. A pattern gate
over free prose has a false-positive surface, and refusing to render a
document because a sentence looked like CSS would be exactly the
route-around-the-gate failure this whole set exists to name. The
committed corpus is asserted clean by the test suite, which is where the
rule bites; an author running the renderer sees a warning and decides.

Per L-112-1 each rule below ships two falsifiers: one that plants the
violation and asserts the rule fires, and one that plants the legitimate
look-alike -- a filename with a dotted extension, a URL, an ordinary
sentence -- and asserts it does not.

**One known look-alike, recorded rather than papered over.** A bare
hyphenated dotfile at the start of a token -- ``.vscode-test``,
``.code-workspace`` -- is shaped exactly like a CSS class and this
module flags it. That is not a bug to engineer around: writing the path
qualified (``tools/dabbler-ai-orchestration/.vscode-test/``) both clears
the rule and tells the reader where the folder actually is, which a
walkthrough written for a stranger owed them anyway. The exemplar
scenario hit this on its first lint pass and was reworded, not
exempted.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Pattern, Tuple

from ai_router.scenario import Scenario


@dataclass(frozen=True)
class Rule:
    """One shape of target-specific mechanics that must live under ``drivers:``."""

    name: str
    pattern: Pattern[str]
    explanation: str


#: The rules, each narrow enough to name what it found.
RULES: Tuple[Rule, ...] = (
    Rule(
        name="attribute-selector",
        # `[data-testid="row"]`, `[aria-expanded=false]`, `[role^="tree"]`.
        # An ordinary markdown link `[text](url)` has no `=` before the
        # closing bracket and does not match.
        pattern=re.compile(r"\[[A-Za-z][\w:-]*\s*[~|^$*]?=[^\]]*\]"),
        explanation="an attribute selector",
    ),
    Rule(
        name="css-class-selector",
        # `.monaco-list-row`. The lookbehind keeps `uat-matrix.code-workspace`
        # and `spec.md` out: a real filename has a word character before the
        # dot. A bare hyphenated dotted token in prose is a selector.
        pattern=re.compile(r"(?<![\w./-])\.[a-z][a-z0-9]*(?:-[a-z0-9]+)+"),
        explanation="a CSS class selector",
    ),
    Rule(
        name="css-id-selector",
        # `#green-button`, and the type-qualified `button#save` that browser
        # tooling emits. Three exclusions do the work, and the third is the
        # hard one:
        #
        #   * a CSS identifier cannot start with a digit -> `issue #123`
        #     is out;
        #   * `#` must be followed by an identifier -> `C#` and a bare `#`
        #     are out;
        #   * an optional type prefix may not follow `.`, `/` or another
        #     word character -> `docs/guide.md#anchor` and
        #     `https://x.test/page#section` are out, while `button#save`,
        #     whose prefix begins at a word boundary, is in.
        #
        # Set 113 S2 verification found the rule missing altogether, then
        # found this second form after the first fix. `button#save` survives
        # an unquoted YAML scalar, because YAML needs whitespace before `#`
        # to start a comment -- so it is a live authoring path, not an
        # exotic one.
        pattern=re.compile(r"(?<![\w#./-])[A-Za-z]*#[A-Za-z_-][\w-]*"),
        explanation="a CSS id selector",
    ),
    Rule(
        name="locator-engine-prefix",
        # Playwright's engine prefixes.
        pattern=re.compile(r"\b(?:css|xpath)=", re.IGNORECASE),
        explanation="a locator-engine prefix",
    ),
    Rule(
        name="xpath-expression",
        # `//div[...]` at the start of a token. `https://example.com` has a
        # colon before the slashes and does not match.
        pattern=re.compile(r"(?:^|(?<=\s))//[A-Za-z*]"),
        explanation="an XPath expression",
    ),
    Rule(
        name="driver-api-call",
        pattern=re.compile(
            r"\b(?:page\.[a-z]|locator\(|getBy[A-Z]\w*\(|querySelector"
            r"|waitForSelector|\$x\()",
        ),
        explanation="a driver API call",
    ),
)


@dataclass(frozen=True)
class Finding:
    """One selector-shaped fragment found in a portable field."""

    field: str
    rule: str
    fragment: str
    explanation: str

    def __str__(self) -> str:
        return (
            f"{self.field}: {self.explanation} ({self.rule}) -- {self.fragment!r}. "
            "Move target-specific mechanics under drivers:"
        )


def _portable_strings(scenario: Scenario) -> Iterator[Tuple[str, str]]:
    """Every human-readable portable string, with a dotted path naming it.

    Walks :meth:`Scenario.portable_payload`, which is by construction the
    half without ``drivers`` -- so this cannot accidentally scan (or
    accidentally miss) whatever that half happens to contain today.
    """

    def walk(node: Any, path: str) -> Iterator[Tuple[str, str]]:
        if isinstance(node, str):
            yield path, node
        elif isinstance(node, dict):
            for key, value in node.items():
                yield from walk(value, f"{path}.{key}" if path else str(key))
        elif isinstance(node, list):
            for index, value in enumerate(node):
                yield from walk(value, f"{path}[{index}]")

    yield from walk(scenario.portable_payload(), "")


def lint_scenario(scenario: Scenario) -> List[Finding]:
    """Every selector-shaped fragment in the portable half, in field order."""
    findings: List[Finding] = []
    for field_path, text in _portable_strings(scenario):
        for rule in RULES:
            for match in rule.pattern.finditer(text):
                findings.append(
                    Finding(
                        field=field_path,
                        rule=rule.name,
                        fragment=match.group(0),
                        explanation=rule.explanation,
                    )
                )
    return findings


def lint_paths(paths: List[Path]) -> Dict[Path, List[Finding]]:
    """Lint each scenario source, keyed by path. Clean sources map to ``[]``."""
    from ai_router.scenario import load_scenario

    return {path: lint_scenario(load_scenario(path)) for path in paths}


def main(argv: Optional[List[str]] = None) -> int:  # pragma: no cover - CLI entry
    import argparse

    from ai_router.scenario import discover_scenarios
    from ai_router.scenario_render import WALKTHROUGHS_DIRNAME

    parser = argparse.ArgumentParser(
        prog="scenario_lint",
        description="Flag driver detail that leaked into a scenario's portable half.",
    )
    parser.add_argument("paths", nargs="*", help="scenario.yaml files or directories")
    args = parser.parse_args(argv)

    repo_root = Path(__file__).resolve().parent.parent
    targets: List[Path] = []
    if args.paths:
        for raw in args.paths:
            candidate = Path(raw)
            targets.extend(
                discover_scenarios(candidate) if candidate.is_dir() else [candidate]
            )
    else:
        targets = discover_scenarios(repo_root / WALKTHROUGHS_DIRNAME)

    found = 0
    for path, findings in lint_paths(targets).items():
        for finding in findings:
            found += 1
            print(f"[scenario_lint] {path}: {finding}")
    if not found:
        print(f"[scenario_lint] ok - {len(targets)} scenario(s), no driver detail leaked.")
    return 1 if found else 0


if __name__ == "__main__":  # pragma: no cover - CLI entry
    import sys

    sys.exit(main())
