"""Tests for the Set 066 ``P_set = any(P_task)`` blast-radius predicate.

Pins the classifier behavior (the four categories + the cross-artifact
domain-span rule), the ``any(P_task)`` roll-up, the recommendation mapping
(required / advisory / none), ASCII-only output, and the CLI.
"""

from __future__ import annotations

import json

import blast_radius as br  # conftest puts ai_router/ on sys.path
import path_aware_critique as pac

REQ = pac.PATH_AWARE_CRITIQUE_REQUIRED
ADV = pac.PATH_AWARE_CRITIQUE_ADVISORY
NONE = pac.PATH_AWARE_CRITIQUE_NONE


class TestCategoryDetection:
    def test_shared_schema_path_trips_required(self):
        r = br.classify_paths(["docs/path-aware-critique.schema.json"])
        assert r.p_set is True
        assert br.SHARED_SCHEMA in r.categories
        assert r.recommended == REQ

    def test_schema_defining_code_file_trips_shared_schema(self):
        r = br.classify_paths(["ai_router/session_state.py"])
        assert br.SHARED_SCHEMA in r.categories

    def test_wiring_path_trips_required(self):
        r = br.classify_paths(["ai_router/close_session.py"])
        assert r.p_set is True
        assert br.WIRING in r.categories
        assert r.recommended == REQ

    def test_index_path_trips_required(self):
        r = br.classify_paths(["ai_router/__init__.py"])
        assert r.p_set is True
        assert br.INDEX in r.categories

    def test_cross_artifact_spans_contract_and_other_domain(self):
        # A schema artifact + a code consumer in one task spans a contract
        # domain plus code -> cross-artifact.
        r = br.classify_blast_radius(
            [
                {
                    "id": "t",
                    "paths": [
                        "docs/foo.schema.json",
                        "src/consumer.tsx",
                    ],
                }
            ]
        )
        assert br.CROSS_ARTIFACT in r.tasks[0].categories
        assert r.recommended == REQ

    def test_code_plus_doc_without_contract_is_not_cross_artifact(self):
        # Pure code+doc (no schema/spec/config) does not auto-fire
        # cross-artifact (avoids "every mixed commit is required").
        r = br.classify_blast_radius(
            [{"id": "t", "paths": ["src/foo.py", "docs/foo-guide.md"]}]
        )
        assert br.CROSS_ARTIFACT not in r.tasks[0].categories

    def test_explicit_category_override(self):
        r = br.classify_blast_radius(
            [{"id": "t", "paths": ["whatever.txt"], "categories": ["wiring"]}]
        )
        assert r.p_set is True
        assert br.WIRING in r.tasks[0].categories

    def test_description_keyword_trips(self):
        r = br.classify_blast_radius(
            [{"id": "t", "description": "rewire the close-out gate list"}]
        )
        assert r.p_set is True
        assert br.WIRING in r.tasks[0].categories


class TestRecommendationMapping:
    def test_docs_only_low_blast_is_none(self):
        r = br.classify_paths(["docs/some-guide.md"])
        assert r.p_set is False
        assert r.recommended == NONE

    def test_code_only_low_blast_is_advisory(self):
        r = br.classify_paths(["src/widget/color_picker.py"])
        assert r.p_set is False
        assert r.recommended == ADV

    def test_empty_is_none(self):
        r = br.classify_paths([])
        assert r.p_set is False
        assert r.recommended == NONE


class TestRollup:
    def test_p_set_is_any_p_task(self):
        r = br.classify_blast_radius(
            [
                {"id": "low", "paths": ["src/util.py"]},
                {"id": "high", "paths": ["ai_router/close_session.py"]},
            ]
        )
        assert r.p_set is True
        assert r.recommended == REQ
        by_id = {t.task_id: t for t in r.tasks}
        assert by_id["low"].p_task is False
        assert by_id["high"].p_task is True

    def test_all_low_blast_no_required(self):
        r = br.classify_blast_radius(
            [
                {"id": "a", "paths": ["src/a.py"]},
                {"id": "b", "paths": ["src/b.py"]},
            ]
        )
        assert r.p_set is False
        assert r.recommended == ADV


class TestRenderAndCli:
    def test_render_is_ascii_and_has_markers(self):
        r = br.classify_blast_radius(
            [
                {"id": "high", "paths": ["ai_router/close_session.py"]},
                {"id": "low", "paths": ["src/util.py"]},
            ]
        )
        text = r.render()
        text.encode("ascii")  # raises if any non-ASCII glyph leaked in
        assert "[x]" in text  # the tripping task
        assert "[ ]" in text  # the non-tripping task
        assert "P_set: TRUE" in text
        assert "NOT a hard auto-set" in text

    def test_cli_text_mode(self, capsys):
        rc = br.main(["ai_router/close_session.py"])
        assert rc == 0
        out = capsys.readouterr().out
        out.encode("ascii")
        assert "Recommended pathAwareCritique: required" in out

    def test_cli_json_mode(self, capsys):
        rc = br.main(["--json", "ai_router/__init__.py"])
        assert rc == 0
        payload = json.loads(capsys.readouterr().out)
        assert payload["pSet"] is True
        assert payload["recommended"] == REQ
        assert "index" in payload["categories"]
