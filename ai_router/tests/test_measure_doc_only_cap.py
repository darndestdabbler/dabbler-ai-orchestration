"""Set 121 S4 -- falsifiers for the doc-only cap MEASUREMENT.

The measurement's whole value is that it reports what the shipped cap does, not
what its author believes it does. Each test below plants a finding whose bucket
is unambiguous and asserts the classifier agrees; the last one plants a
would-have-been-capped finding so ``capped`` is proven able to be non-zero.

That last test matters more than it looks. Set 121 S4's measurement over four
sessions returned ``capped == 0``, and a counter that is structurally stuck at
zero is indistinguishable from a cap that never fires -- which is exactly the
L-112-1 failure mode this repo has already paid for.
"""
import json

import pytest

import measure_doc_only_cap as m


def _issue(paths=None, severity="Major", description="a finding"):
    issue = {"severity": severity, "description": description}
    if paths is not None:
        issue["evidencePaths"] = paths
    return issue


class TestClassify:
    @pytest.mark.parametrize(
        "paths, expected",
        [
            (None, "uncited"),
            ([], "uncited"),
            (["docs/a.md", "README.md"], "doc-only"),
            (["ai_router/x.py"], "code-only"),
            (["docs/a.md", "ai_router/x.py"], "mixed"),
            # Behaviour-bearing markdown is code that happens to be spelled in
            # markdown, so a finding citing only it is NOT doc-only.
            (["ai_router/prompt-templates/verify.md"], "code-only"),
        ],
    )
    def test_every_finding_lands_in_exactly_one_bucket(self, paths, expected):
        assert m.classify(_issue(paths)) == expected

    def test_the_buckets_partition_the_findings(self, tmp_path):
        """Sum of the buckets is the finding count -- no double-count, no drop."""
        issues = [
            _issue(None),
            _issue(["docs/a.md"]),
            _issue(["ai_router/x.py"]),
            _issue(["docs/a.md", "ai_router/x.py"]),
        ]
        report = _measure_one(tmp_path, issues)
        row = report["rows"][0]
        assert sum(row[b] for b in m.BUCKETS) == row["findings"] == 4


def _measure_one(tmp_path, issues, session=1, rnd=1):
    (tmp_path / f"s{session}-issues.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "sessionNumber": session,
                "verificationRound": rnd,
                "verificationVerdict": "ISSUES_FOUND",
                "issues": issues,
            }
        ),
        encoding="utf-8",
    )
    return m.measure(str(tmp_path))


class TestCappedCounter:
    def test_a_doc_only_major_is_counted_as_capped(self, tmp_path):
        """The planted violation: without this the zero could be structural."""
        report = _measure_one(tmp_path, [_issue(["docs/a.md"], severity="Major")])
        assert report["totals"]["capped"] == 1
        assert report["totals"]["blocking_after_cap"] == 0

    def test_the_look_alike_a_mixed_major_is_not_capped(self, tmp_path):
        """Mixed citations keep their severity -- the cap requires ALL docs."""
        report = _measure_one(
            tmp_path, [_issue(["docs/a.md", "ai_router/x.py"], severity="Major")]
        )
        assert report["totals"]["capped"] == 0
        assert report["totals"]["blocking_after_cap"] == 1

    def test_a_doc_only_MINOR_is_not_counted_as_capped(self, tmp_path):
        """The cap only 'fires' where it changed an outcome.

        A Minor already opened no round, so counting it would inflate the
        measurement with findings the cap never affected.
        """
        report = _measure_one(tmp_path, [_issue(["docs/a.md"], severity="Minor")])
        assert report["totals"]["capped"] == 0


class TestRoundCounts:
    """The falsifier for the bug S4's own verification caught.

    ``sN-rounds.jsonl`` holds two event types. ``round-completed`` is a metered
    round that ran; ``operator-authorization`` is permission to exceed a bound
    and costs nothing. Counting lines conflates them and overstates loop cost,
    which is the one number the cap is judged against.
    """

    def _ledger(self, tmp_path, session, rows):
        (tmp_path / f"s{session}-rounds.jsonl").write_text(
            "\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8"
        )

    def test_an_authorization_row_is_not_a_round(self, tmp_path):
        self._ledger(
            tmp_path,
            1,
            [
                {"event": "round-completed", "verificationRound": 1},
                {"event": "operator-authorization", "verificationRound": 2},
                {"event": "round-completed", "verificationRound": 2},
            ],
        )
        assert m.measure(str(tmp_path))["roundsPerSession"] == {1: 2}

    def test_the_look_alike_two_real_rounds_both_count(self, tmp_path):
        """Without this, 'return 0 always' would pass the test above."""
        self._ledger(
            tmp_path,
            1,
            [
                {"event": "round-completed", "verificationRound": 1},
                {"event": "round-completed", "verificationRound": 2},
            ],
        )
        assert m.measure(str(tmp_path))["roundsPerSession"] == {1: 2}

    def test_a_malformed_line_is_skipped_rather_than_counted(self, tmp_path):
        (tmp_path / "s1-rounds.jsonl").write_text(
            json.dumps({"event": "round-completed"}) + "\nnot json\n\n",
            encoding="utf-8",
        )
        assert m.measure(str(tmp_path))["roundsPerSession"] == {1: 1}


class TestMarkdownRendering:
    def test_the_markdown_table_carries_the_same_totals_as_the_report(self, tmp_path):
        """The report artifact is regenerated from this, never hand-copied."""
        report = _measure_one(
            tmp_path,
            [
                _issue(["docs/a.md"]),
                _issue(["ai_router/x.py"]),
                _issue(["docs/a.md", "ai_router/x.py"]),
            ],
        )
        table = m.render_markdown(report)
        assert table.splitlines()[0].startswith("| artifact |")
        assert "| **TOTAL** |" in table
        t = report["totals"]
        total_row = [ln for ln in table.splitlines() if ln.startswith("| **TOTAL**")][0]
        for value in (t["findings"], t["doc-only"], t["code-only"], t["mixed"]):
            assert f"**{value}**" in total_row


class TestCounterfactual:
    def test_it_names_rounds_carried_only_by_mixed_blockers(self, tmp_path):
        report = _measure_one(
            tmp_path, [_issue(["docs/a.md", "ai_router/x.py"], severity="Major")]
        )
        cf = report["counterfactual"]
        assert cf["roundsWithBlockingFindings"] == 1
        assert cf["roundsCarryingOnlyMixedBlockers"] == 1

    def test_a_code_only_blocker_is_not_attributed_to_mixed(self, tmp_path):
        report = _measure_one(
            tmp_path, [_issue(["ai_router/x.py"], severity="Major")]
        )
        cf = report["counterfactual"]
        assert cf["roundsWithBlockingFindings"] == 1
        assert cf["roundsCarryingOnlyMixedBlockers"] == 0
