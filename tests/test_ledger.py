import json

import pytest

from ai_router import ledger


def make_row(round_number=1, **overrides):
    row = {
        "round": round_number,
        "phase": "full" if round_number == 1 else "fix-delta",
        "verdict": "ISSUES_FOUND",
        "blocking": True,
        "verifier_model": "gpt-5-4",
        "verifier_provider": "openai",
        "findings": [{"description": "broken", "severity": "major"}],
        "cost_usd": 0.12,
        "completion_tree": "a" * 40,
        "recorded_at": "2026-08-17T10:00:00+02:00",
    }
    if round_number >= 2:
        row["previous_tree"] = "b" * 40
    row.update(overrides)
    return row


class TestLedgerRoundtrip:
    def test_append_and_read(self, tmp_path):
        ledger.append_round(tmp_path, "010-demo", 1, make_row())
        rounds = ledger.read_rounds(tmp_path, "010-demo", 1)
        assert len(rounds) == 1
        assert rounds[0]["verdict"] == "ISSUES_FOUND"

    def test_rounds_are_per_session(self, tmp_path):
        ledger.append_round(tmp_path, "010-demo", 1, make_row())
        assert ledger.read_rounds(tmp_path, "010-demo", 2) == []

    def test_duplicate_round_refused(self, tmp_path):
        ledger.append_round(tmp_path, "010-demo", 1, make_row())
        with pytest.raises(ledger.LedgerError, match="append-only"):
            ledger.append_round(tmp_path, "010-demo", 1, make_row())

    def test_next_round_number(self, tmp_path):
        assert ledger.next_round_number(tmp_path, "010-demo", 1) == 1
        ledger.append_round(tmp_path, "010-demo", 1, make_row())
        assert ledger.next_round_number(tmp_path, "010-demo", 1) == 2

    def test_missing_ledger_is_empty(self, tmp_path):
        assert ledger.read_rounds(tmp_path, "nope", 9) == []


class TestTamperRefusal:
    def _path(self, tmp_path):
        path = ledger.rounds_path(tmp_path, "010-demo", 1)
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def test_invented_verdict_refused_on_read(self, tmp_path):
        row = make_row(verdict="manual-override-development")
        self._path(tmp_path).write_text(
            json.dumps(row) + "\n", encoding="utf-8"
        )
        with pytest.raises(ledger.LedgerError):
            ledger.read_rounds(tmp_path, "010-demo", 1)

    def test_garbage_line_refused_not_skipped(self, tmp_path):
        path = self._path(tmp_path)
        path.write_text(
            json.dumps(make_row()) + "\nnot json\n", encoding="utf-8"
        )
        with pytest.raises(ledger.LedgerError, match="not valid JSON"):
            ledger.read_rounds(tmp_path, "010-demo", 1)

    def test_round_two_requires_previous_tree(self, tmp_path):
        row = make_row(2)
        del row["previous_tree"]
        with pytest.raises(ledger.LedgerError, match="previous_tree"):
            ledger.append_round(tmp_path, "010-demo", 2, row)


class TestDisputes:
    def test_prose_only_row_refused_on_read(self, tmp_path):
        # A hand-written dispute with no cited evidence cannot even be
        # smuggled in on disk: minItems 1 fails schema validation on read.
        path = ledger.disputes_path(tmp_path, "010-demo", 1)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps({
                "round": 1, "finding_index": 0, "grounds": "just because",
                "evidence_paths": [],
                "recorded_at": "2026-08-17T10:00:00+02:00",
            }) + "\n",
            encoding="utf-8",
        )
        with pytest.raises(ledger.LedgerError):
            ledger.read_disputes(tmp_path, "010-demo", 1)


class TestRawOutput:
    def test_saved_bytes_unmodified(self, tmp_path):
        content = "VERIFIED\r\nline two\n"
        path = ledger.save_raw_output(tmp_path, "010-demo", 1, 1, content)
        assert path.read_bytes() == content.encode("utf-8")


class TestCritiqueArtifacts:
    def test_invalid_record_is_refused_and_quarantined(self, tmp_path):
        # Both write shapes fail the same way — whole-file replace and
        # append — because a record that does not validate is never
        # half-written and never best-effort skipped. The rejected payload
        # is kept beside the subtree so a refusal can be diagnosed instead
        # of guessed at.
        bad_run = {
            "schema_version": 1, "change_id": "abcdef1",
            "set_slug": "010-demo", "session_number": 1,
            "opened_at": "2026-08-19T00:00:00Z",
            "attempts": [{"attempt": 1, "opened_at": "2026-08-19T00:00:00Z",
                          "completion_tree": "abcdef1",
                          "status": "invented"}],
        }
        with pytest.raises(ledger.LedgerError, match="quarantined"):
            ledger.write_review_run(tmp_path, "010-demo", 1, bad_run)
        assert not ledger.review_run_path(
            tmp_path, "010-demo", 1, "abcdef1").exists()

        blocked = {
            "schema_version": 1, "change_id": "abcdef1", "check_id": "c1",
            "attempt": 1, "result": "blocked",
            "recorded_at": "2026-08-19T00:00:00Z",
        }
        with pytest.raises(ledger.LedgerError, match="quarantined"):
            ledger.append_worker_result(tmp_path, "010-demo", 1, blocked)
        assert ledger.read_worker_results(
            tmp_path, "010-demo", 1, "abcdef1") == []

        kept = sorted(
            ledger.quarantine_dir(tmp_path, "010-demo", 1).glob("*.json")
        )
        payloads = [
            json.loads(p.read_text(encoding="utf-8"))["record"] for p in kept
        ]
        assert payloads == [bad_run, blocked]


class TestAdjudicationRow:
    def test_type_tagged_row_requires_its_fields(self, tmp_path):
        # The additive schema: an untyped row stays valid (every other test
        # here), a typed row validates round-trip, and a typed row missing
        # its outcomes is refused on read like any tampered line.
        row = make_row(
            2, type="adjudication", verdict="VERIFIED", blocking=False,
            findings=[],
            outcomes=[{"finding_index": 0, "outcome": "OVERRULED",
                       "reasons": "scope is documented"}],
            excluded_providers=["anthropic", "openai"],
        )
        ledger.append_round(tmp_path, "010-demo", 1, row)
        assert ledger.read_rounds(tmp_path, "010-demo", 1)[-1][
            "type"] == "adjudication"
        bad = dict(row, round=3)
        del bad["outcomes"]
        with pytest.raises(ledger.LedgerError):
            ledger.validate_round(bad)
