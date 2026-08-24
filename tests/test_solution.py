"""The solution manifest: what it accepts, and what it refuses by name."""
import pytest

from ai_router.solution import ManifestError, STEPS, as_dict, parse

BASE = {
    "solution": {"name": "csv-demo", "title": "CSV walkthrough", "step": "contracts"},
    "components": [
        {"name": "csv-model", "kind": "library"},
        {"name": "csv-parser", "kind": "library", "dependsOn": ["csv-model"]},
        {"name": "csv-app", "kind": "integration",
         "dependsOn": ["csv-model", "csv-parser"]},
    ],
}


def doc(**over):
    import copy
    d = copy.deepcopy(BASE)
    d.update(over)
    return d


class TestParsing:
    def test_a_well_formed_manifest_parses(self):
        s = parse(doc())
        assert s.name == "csv-demo"
        assert len(s.components) == 3

    def test_used_by_is_derived_from_the_other_direction(self):
        s = parse(doc())
        assert s.get("csv-model").used_by == ("csv-app", "csv-parser")
        assert s.get("csv-app").used_by == ()

    def test_a_component_defaults_to_a_library_at_the_first_step(self):
        s = parse(doc(components=[{"name": "solo"}]))
        assert s.get("solo").kind == "library"
        assert s.get("solo").step == STEPS[0]

    def test_the_integration_is_reachable_as_a_group(self):
        assert [c.name for c in parse(doc()).integration] == ["csv-app"]


class TestRefusals:
    def test_a_misspelled_key_is_refused_rather_than_ignored(self):
        d = doc(components=[{"name": "a", "dependson": ["b"]}])
        with pytest.raises(ManifestError, match="dependson"):
            parse(d)

    def test_a_dependency_on_an_unknown_component_is_refused(self):
        d = doc(components=[{"name": "a", "dependsOn": ["ghost"]}])
        with pytest.raises(ManifestError, match="ghost"):
            parse(d)

    def test_a_cycle_is_refused_and_the_loop_is_named(self):
        d = doc(components=[
            {"name": "a", "dependsOn": ["b"]},
            {"name": "b", "dependsOn": ["a"]},
        ])
        with pytest.raises(ManifestError, match="a -> b -> a"):
            parse(d)

    def test_a_duplicate_component_is_refused(self):
        d = doc(components=[{"name": "a"}, {"name": "a"}])
        with pytest.raises(ManifestError, match="duplicate"):
            parse(d)

    def test_an_unknown_kind_is_refused(self):
        d = doc(components=[{"name": "a", "kind": "service"}])
        with pytest.raises(ManifestError, match="service"):
            parse(d)

    def test_an_unknown_step_is_refused(self):
        d = doc(components=[{"name": "a", "step": "shipping"}])
        with pytest.raises(ManifestError, match="shipping"):
            parse(d)

    def test_an_empty_component_list_is_refused(self):
        with pytest.raises(ManifestError, match="components"):
            parse(doc(components=[]))

    def test_a_component_without_a_name_is_refused(self):
        with pytest.raises(ManifestError, match="name"):
            parse(doc(components=[{"kind": "library"}]))


class TestProjection:
    def test_the_projection_carries_step_position_for_the_ui(self):
        d = as_dict(parse(doc()))
        assert d["solution"]["stepNumber"] == 3
        assert d["solution"]["stepCount"] == 6
        assert d["solution"]["stepTitle"]

    def test_the_projection_carries_both_dependency_directions(self):
        d = as_dict(parse(doc()))
        model = next(c for c in d["components"] if c["name"] == "csv-model")
        assert model["dependsOn"] == []
        assert model["usedBy"] == ["csv-app", "csv-parser"]
