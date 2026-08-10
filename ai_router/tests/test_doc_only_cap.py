"""Set 119 S1 — the ``evidencePaths`` contract and the doc-only severity cap.

Two deliverables are pinned here, and the second is the one that changes
verification behaviour, so it is tested the way L-112-1 requires: with
**planted** cases, not by reading the rule.

1. ``evidencePaths`` — the finding's provenance, on **both** surfaces: the
   markdown parse in :mod:`verification` and the structured ``submit_verdict``
   tool in :mod:`pull_verifier`. Tolerant by design: an absent line leaves the
   key off, decoration and ``:<line>`` suffixes normalize away.

2. The **doc-only cap** (operator-attested verification reduction, Set 119 S1
   ``decisions.jsonl``): a finding whose cited paths are ALL documentation prose
   records at Minor and opens no round. The falsifier pairs below plant, per
   rule, the defect the cap must fire on AND the legitimate look-alike it must
   NOT fire on:

   * doc-only Major -> no round   vs.  mixed doc-and-code Major -> round
   * no ``evidencePaths`` at all  -> unchanged, still blocks (absence is not
     doc-ness; the anti-laundering default is what this set must not weaken)
   * a self-declared "documentation" ``category`` / description -> still blocks
     (doc-ness is derived from paths, never self-declared)
   * ``ai_router/prompt-templates/*.md`` -> still blocks (behaviour-bearing
     markdown is code that happens to be spelled in markdown)
"""

from __future__ import annotations

import pytest

import pull_verifier
import verification
from verification import (
    classify_blocking,
    is_blocking_issue,
    is_blocking_verdict,
    is_doc_only_issue,
    is_documentation_path,
    normalize_evidence_path,
    parse_verification_response,
)


def _issue(severity="Major", paths=None, **extra):
    issue = {"description": "a finding", "severity": severity}
    if paths is not None:
        issue["evidencePaths"] = paths
    issue.update(extra)
    return issue


# --- normalize_evidence_path ----------------------------------------------

@pytest.mark.parametrize(
    "raw,expected",
    [
        ("ai_router/verification.py", "ai_router/verification.py"),
        ("`docs/quick-start.md`", "docs/quick-start.md"),
        ("**docs/quick-start.md**", "docs/quick-start.md"),
        ("./docs/quick-start.md", "docs/quick-start.md"),
        ("docs//quick-start.md", "docs/quick-start.md"),
        (".\\ai_router\\verification.py", "ai_router/verification.py"),
        ("ai_router/verification.py:613", "ai_router/verification.py"),
        ("ai_router/verification.py:613-620", "ai_router/verification.py"),
        ("docs/quick-start.md#severity", "docs/quick-start.md"),
        ("(ai_router/x.py)", "ai_router/x.py"),
        # Anything that is not a path at all normalizes away entirely.
        ("", ""),
        ("   ", ""),
        (".", ""),
        ("..", ""),
        (None, ""),
        ("``", ""),
    ],
)
def test_normalize_strips_decoration_and_line_refs(raw, expected):
    assert normalize_evidence_path(raw) == expected


# --- is_documentation_path -------------------------------------------------

@pytest.mark.parametrize(
    "path",
    [
        "docs/quick-start.md",
        "README.md",
        "docs/planning/notes.RST",
        "notes.txt",
        "docs/session-constitution.md:120",
    ],
)
def test_prose_extensions_are_documentation(path):
    assert is_documentation_path(path) is True


@pytest.mark.parametrize(
    "path",
    [
        "ai_router/verification.py",
        # A machine contract that happens to live under docs/ is NOT prose --
        # the predicate is extension-based precisely so this stays blocking.
        "docs/session-issues.schema.json",
        "docs/disposition-schema.json",
        "package.json",
        "ai_router/router-config.yaml",
        # No extension in the final segment.
        "docs/planning",
        "Makefile",
        # Not a path at all.
        "the whole repo",
    ],
)
def test_non_prose_paths_are_not_documentation(path):
    assert is_documentation_path(path) is False


@pytest.mark.parametrize(
    "path",
    [
        "ai_router/prompt-templates/verification.md",
        "ai_router/prompt-templates/path-aware-critique.md",
        "./ai_router/prompt-templates/task-prompts.md:40",
    ],
)
def test_behavioural_markdown_is_not_documentation(path):
    """The reviewer templates ARE the verifier's instructions -- code."""
    assert is_documentation_path(path) is False


# --- is_doc_only_issue -----------------------------------------------------

def test_doc_only_issue_requires_every_path_to_be_docs():
    assert is_doc_only_issue(_issue(paths=["docs/a.md", "README.md"])) is True


def test_one_code_path_defeats_doc_only():
    issue = _issue(paths=["docs/a.md", "ai_router/verification.py"])
    assert is_doc_only_issue(issue) is False


@pytest.mark.parametrize("value", [[], "", {}, 0, ["", "  ", "."]])
def test_unusable_evidence_paths_is_not_doc_only(value):
    """Empty, wrong-typed, or decoration-only: no evidence, so no cap."""
    assert is_doc_only_issue(_issue(paths=value)) is False


def test_bare_string_evidence_path_is_accepted():
    """A model that answers with one string instead of an array still cites."""
    assert is_doc_only_issue(_issue(paths="docs/a.md")) is True


def test_non_string_entry_defeats_doc_only():
    assert is_doc_only_issue(_issue(paths=["docs/a.md", 7])) is False


# --- THE FALSIFIERS: the cap fires, and the look-alikes it must not touch ---

def test_falsifier_doc_only_major_does_not_open_a_round():
    """PLANTED: a Major whose only evidence is a markdown doc opens no round."""
    issue = _issue(severity="Major", paths=["docs/session-constitution.md"])
    assert is_blocking_issue(issue) is False
    assert is_blocking_verdict("ISSUES_FOUND", [issue]) is False
    result = classify_blocking("ISSUES_FOUND", [issue])
    assert result.blocking is False
    assert result.blocking_issues == []
    assert result.nit_issues == [issue]
    assert result.doc_capped_issues == [issue]
    assert "doc-only capped" in result.reason


def test_falsifier_mixed_doc_and_code_major_does_open_a_round():
    """PLANTED look-alike: one code path among the docs and it still blocks."""
    issue = _issue(
        severity="Major",
        paths=["docs/session-constitution.md", "ai_router/verification.py"],
    )
    assert is_blocking_issue(issue) is True
    assert is_blocking_verdict("ISSUES_FOUND", [issue]) is True
    result = classify_blocking("ISSUES_FOUND", [issue])
    assert result.blocking is True
    assert result.blocking_issues == [issue]
    assert result.doc_capped_issues == []


def test_falsifier_blocking_finding_with_no_paths_still_blocks():
    """Absence is not doc-ness: an uncited Major is not cheaper."""
    assert is_doc_only_issue(_issue()) is False
    assert is_blocking_issue(_issue(severity="Major")) is True
    assert is_blocking_issue(_issue(severity="Critical")) is True
    assert is_blocking_issue({"description": "no severity at all"}) is True


def test_falsifier_self_declared_doc_ness_is_ignored():
    """Doc-ness is derived from paths, never from what the verifier says."""
    issue = _issue(
        severity="Major",
        paths=["ai_router/verification.py"],
        category="documentation",
        description="This is only a documentation wording issue in the docs.",
    )
    assert is_blocking_issue(issue) is True


def test_falsifier_prompt_template_wording_still_blocks():
    """Behaviour-bearing markdown is the look-alike closest to a false pass."""
    issue = _issue(
        severity="Major",
        paths=["ai_router/prompt-templates/verification.md"],
    )
    assert is_blocking_issue(issue) is True


def test_falsifier_doc_only_critical_is_capped_too():
    """The attested rule is uniform across declared severities."""
    issue = _issue(severity="Critical", paths=["docs/quick-start.md"])
    assert is_blocking_issue(issue) is False


def test_falsifier_unknown_severity_doc_only_is_capped():
    """An uncapped unknown blocks; the SAME finding citing only docs does not."""
    uncited = {"description": "d", "evidencePaths": ["ai_router/x.py"]}
    cited_docs = {"description": "d", "evidencePaths": ["docs/a.md"]}
    assert is_blocking_issue(uncited) is True
    assert is_blocking_issue(cited_docs) is False


def test_cap_does_not_mask_a_real_blocker_in_the_same_round():
    doc_only = _issue(severity="Major", paths=["docs/a.md"])
    real = _issue(severity="Major", paths=["ai_router/verification.py"])
    result = classify_blocking("ISSUES_FOUND", [doc_only, real])
    assert result.blocking is True
    assert result.blocking_issues == [real]
    assert result.doc_capped_issues == [doc_only]
    assert "doc-only capped" in result.reason


def test_declared_minor_is_not_counted_as_doc_capped():
    """The audit list holds only findings the cap actually demoted."""
    issue = _issue(severity="Minor", paths=["docs/a.md"])
    result = classify_blocking("ISSUES_FOUND", [issue])
    assert result.doc_capped_issues == []
    assert result.nit_issues == [issue]
    assert "doc-only capped" not in result.reason


def test_issues_found_with_no_parsed_findings_still_blocks():
    """The cap must not touch the conservative no-findings branch."""
    assert is_blocking_verdict("ISSUES_FOUND", []) is True


# --- Surface 1: the markdown parse ----------------------------------------

@pytest.mark.parametrize(
    "line,expected",
    [
        (
            "  - **Evidence paths:** `docs/session-constitution.md`, "
            "docs/quick-start.md:12\n",
            ["docs/session-constitution.md", "docs/quick-start.md"],
        ),
        (
            "  - **Evidence path:** ai_router/verification.py docs/a.md\n",
            ["ai_router/verification.py", "docs/a.md"],
        ),
    ],
)
def test_markdown_surface_parses_evidence_paths(line, expected):
    body = (
        "ISSUES FOUND\n"
        "- **Issue 1:** the constitution's wording drifted\n"
        "  - **Category:** Correctness\n"
        "  - **Severity:** Major\n"
        f"{line}"
        "  - **Details:** x\n"
    )
    verdict, issues = parse_verification_response(body)
    assert verdict == "ISSUES_FOUND"
    assert issues[0]["evidencePaths"] == expected


def test_markdown_surface_omits_the_key_when_the_line_is_absent():
    body = (
        "ISSUES FOUND\n"
        "- **Issue 1:** drift\n"
        "  - **Severity:** Major\n"
        "  - **Details:** x\n"
    )
    _, issues = parse_verification_response(body)
    assert "evidencePaths" not in issues[0]
    assert is_blocking_verdict("ISSUES_FOUND", issues) is True


def test_markdown_surface_doc_only_issue_does_not_open_a_round_end_to_end():
    """The whole push path: verifier text in, no round out."""
    body = (
        "ISSUES FOUND\n"
        "- **Issue 1:** the constitution says 'blessed writer'\n"
        "  - **Severity:** Major\n"
        "  - **Evidence paths:** docs/session-constitution.md\n"
    )
    verdict, issues = parse_verification_response(body)
    assert is_blocking_verdict(verdict, issues) is False


def test_verified_contradiction_branch_respects_the_cap():
    """A doc-only Major under a VERIFIED token is a nit, not contradiction."""
    body = (
        "VERIFIED\n"
        "- **Issue 1:** wording\n"
        "  - **Severity:** Major\n"
        "  - **Evidence paths:** docs/quick-start.md\n"
    )
    verdict, issues = parse_verification_response(body)
    assert verdict == "VERIFIED"
    assert issues == []


def test_verified_contradiction_branch_still_surfaces_a_code_major():
    body = (
        "VERIFIED\n"
        "- **Issue 1:** real defect\n"
        "  - **Severity:** Major\n"
        "  - **Evidence paths:** ai_router/verification.py\n"
    )
    verdict, issues = parse_verification_response(body)
    assert verdict == "VERIFIED"
    assert len(issues) == 1


# --- Surface 2: the submit_verdict tool -----------------------------------

def test_tool_schema_offers_evidence_paths_on_the_read_only_shape():
    schema = pull_verifier._verdict_tool_schema()
    props = schema["parameters"]["properties"]["findings"]["items"]["properties"]
    assert props["evidencePaths"]["type"] == "array"
    assert props["evidencePaths"]["items"]["type"] == "string"
    assert "Critical or Major" in props["evidencePaths"]["description"]


def test_tool_surface_parses_and_normalizes_evidence_paths():
    critique = pull_verifier._parse_verdict(
        "openai",
        "gpt-x",
        {
            "verdict": "ISSUES_FOUND",
            "summary": "s",
            "findings": [
                {
                    "description": "d",
                    "severity": "Major",
                    "evidencePaths": ["./docs/a.md", "ai_router/x.py:12"],
                }
            ],
        },
    )
    finding = critique.findings[0]
    assert finding.evidence_paths == ("docs/a.md", "ai_router/x.py")
    assert finding.to_dict()["evidencePaths"] == ["docs/a.md", "ai_router/x.py"]


def test_tool_surface_omits_the_key_when_absent():
    critique = pull_verifier._parse_verdict(
        "openai",
        "gpt-x",
        {
            "verdict": "ISSUES_FOUND",
            "summary": "s",
            "findings": [{"description": "d", "severity": "Major"}],
        },
    )
    assert critique.findings[0].evidence_paths == ()
    assert "evidencePaths" not in critique.findings[0].to_dict()


def test_tool_surface_tolerates_a_bare_string_and_junk_entries():
    critique = pull_verifier._parse_verdict(
        "openai",
        "gpt-x",
        {
            "verdict": "ISSUES_FOUND",
            "summary": "s",
            "findings": [
                {"description": "d", "evidencePaths": "docs/a.md"},
                {"description": "e", "evidencePaths": [7, None, "docs/b.md"]},
            ],
        },
    )
    assert critique.findings[0].evidence_paths == ("docs/a.md",)
    assert critique.findings[1].evidence_paths == ("docs/b.md",)


def test_tool_surface_finding_feeds_the_shared_cap():
    """The pull surface inherits the cap through the shared predicate."""
    critique = pull_verifier._parse_verdict(
        "openai",
        "gpt-x",
        {
            "verdict": "ISSUES_FOUND",
            "summary": "s",
            "findings": [
                {
                    "description": "wording",
                    "severity": "Major",
                    "evidencePaths": ["docs/quick-start.md"],
                },
                {
                    "description": "defect",
                    "severity": "Major",
                    "evidencePaths": ["ai_router/verification.py"],
                },
            ],
        },
    )
    dicts = [f.to_dict() for f in critique.findings]
    result = classify_blocking(critique.verdict, dicts)
    assert result.blocking is True
    assert result.blocking_issues == [dicts[1]]
    assert result.doc_capped_issues == [dicts[0]]


# --- The templates ask for it ---------------------------------------------

@pytest.mark.parametrize(
    "template", ["verification.md", "path-aware-critique.md"]
)
def test_reviewer_templates_ask_for_evidence_paths(template):
    import pathlib

    path = (
        pathlib.Path(verification.__file__).resolve().parent
        / "prompt-templates"
        / template
    )
    text = path.read_text(encoding="utf-8")
    assert "Evidence paths" in text
    assert "evidencePaths" in text or "Evidence paths:" in text
