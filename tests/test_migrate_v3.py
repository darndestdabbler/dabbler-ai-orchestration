"""The one-shot v3->v4 migrator: migrates a copy of vendored v3 corpus
sets and refuses what it cannot confidently migrate."""

import json
import shutil
from pathlib import Path

from jsonschema import Draft202012Validator

from ai_router.migrate_v3 import SCHEMA_PATH, main
from ai_router.progress import build_projection

CORPUS = Path(__file__).parent / "fixtures" / "corpus"
V3_FIXTURES = ("004-cost-enforcement-and-capacity", "040-codex-launch-adapter")


def test_migrates_v3_sets_to_schema_valid_v4_with_same_status(tmp_path, capsys):
    root = tmp_path / "session-sets"
    root.mkdir()
    before = {}
    for name in V3_FIXTURES:
        shutil.copytree(CORPUS / name, root / name)
        before[name] = build_projection(root / name)["set"]["status"]

    assert main([str(root)]) == 0
    assert f"done: {len(V3_FIXTURES)} migrated, 0 skipped" in capsys.readouterr().out

    validator = Draft202012Validator(
        json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    )
    for name in V3_FIXTURES:
        state = json.loads(
            (root / name / "session-state.json").read_text(encoding="utf-8")
        )
        validator.validate(state)
        assert state["schemaVersion"] == 4
        projection = build_projection(root / name)
        assert projection["set"]["status"] == before[name]
        assert projection["set"]["schemaVersionOnDisk"] == 4


def test_refuses_invariant_violating_file_and_leaves_it_untouched(
    tmp_path, capsys
):
    root = tmp_path / "session-sets"
    set_dir = root / "099-broken"
    set_dir.mkdir(parents=True)
    state_path = set_dir / "session-state.json"
    original = json.dumps({
        "schemaVersion": 3,
        "sessionSetName": "099-broken",
        "status": "complete",
        "sessions": [{"number": 1, "title": "T", "status": "not-started"}],
    })
    state_path.write_text(original, encoding="utf-8")

    assert main([str(root)]) == 1
    captured = capsys.readouterr()
    assert "WARNING: skipped 099-broken" in captured.err
    assert "done: 0 migrated, 1 skipped" in captured.out
    assert state_path.read_text(encoding="utf-8") == original
