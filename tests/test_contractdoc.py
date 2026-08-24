"""Contract rendering: the sections a reader needs, and the refusals."""
import pytest

from ai_router.contractdoc import ContractError, load, render
from ai_router.solution import parse as parse_solution

CONTRACT = {
    "component": "csv-parser",
    "version": "1.0.0",
    "summary": "Reads a simple CSV file.",
    "operations": [{
        "name": "parse",
        "signature": "List<CsvRecord> parse(Path file)",
        "preconditions": ["The file exists and is readable."],
        "postconditions": ["One record per data row, in file order."],
        "retained": ["A trailing empty field stays an empty string, not null."],
        "sideEffects": ["None. The file is not modified."],
        "errors": ["A header-only file returns an empty list."],
        "notPromised": ["The concrete List implementation."],
    }],
}

SOLUTION = parse_solution({
    "solution": {"name": "csv-demo", "title": "CSV"},
    "components": [
        {"name": "csv-model"},
        {"name": "csv-parser", "dependsOn": ["csv-model"]},
        {"name": "csv-app", "kind": "integration", "dependsOn": ["csv-parser"]},
    ],
})


class TestRendering:
    def test_every_section_a_reader_needs_is_present(self):
        out = render(CONTRACT)
        for heading in ("Must be true going in", "Guaranteed coming out",
                        "Kept on purpose", "Side effects", "How it fails"):
            assert heading in out

    def test_not_promised_is_called_out_separately_from_the_table(self):
        out = render(CONTRACT)
        assert "Not promised" in out
        assert "concrete List implementation" in out

    def test_an_empty_section_says_so_rather_than_rendering_blank(self):
        thin = {"component": "x", "operations": [{"name": "go"}]}
        assert "*none stated*" in render(thin)

    def test_the_diagram_shows_both_dependency_directions(self):
        out = render(CONTRACT, SOLUTION)
        assert "```mermaid" in out
        assert "csv_parser --> csv_model" in out
        assert "csv_app" in out

    def test_used_by_names_who_breaks(self):
        out = render(CONTRACT, SOLUTION)
        assert "**Used by:** `csv-app`" in out

    def test_no_diagram_is_drawn_for_a_component_outside_the_solution(self):
        out = render({"component": "stranger", "operations": [{"name": "go"}]},
                     SOLUTION)
        assert "```mermaid" not in out

    def test_it_says_not_to_hand_edit(self):
        assert "Do not edit by hand" in render(CONTRACT)


class TestRefusals:
    def test_a_missing_file_is_refused(self, tmp_path):
        with pytest.raises(ContractError, match="no contract"):
            load(tmp_path / "nope.yaml")

    def test_a_contract_without_operations_is_refused(self, tmp_path):
        p = tmp_path / "c.yaml"
        p.write_text("component: x\n")
        with pytest.raises(ContractError, match="operations"):
            load(p)

    def test_an_operation_without_a_name_is_refused(self, tmp_path):
        p = tmp_path / "c.yaml"
        p.write_text("component: x\noperations:\n  - signature: foo()\n")
        with pytest.raises(ContractError, match="name"):
            load(p)
