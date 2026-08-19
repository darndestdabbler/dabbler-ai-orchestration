import json

import pytest
import yaml

from ai_router.modules import (
    EXIT_OK,
    EXIT_REFUSED,
    find_entry,
    load_entries,
    main,
)


def _manifest(root) -> dict:
    return yaml.safe_load(
        (root / "docs" / "modules.yaml").read_text(encoding="utf-8")
    )


def _write_manifest(root, entries):
    (root / "docs").mkdir(parents=True, exist_ok=True)
    (root / "docs" / "modules.yaml").write_text(
        yaml.safe_dump({"modules": entries}, sort_keys=False),
        encoding="utf-8",
    )


def test_create_appends_entry_and_prints_it(tmp_path, capsys):
    rc = main([
        "create", str(tmp_path), "--slug", "greeter", "--title", "Greeter",
        "--plan-path", "docs/modules/greeter/project-plan.md",
    ])
    assert rc == EXIT_OK
    entry = {
        "slug": "greeter",
        "title": "Greeter",
        "planPath": "docs/modules/greeter/project-plan.md",
    }
    assert json.loads(capsys.readouterr().out.strip()) == entry
    assert _manifest(tmp_path) == {"modules": [entry]}


def test_create_refuses_duplicate_slug(tmp_path, capsys):
    main(["create", str(tmp_path), "--slug", "greeter", "--title", "Greeter"])
    capsys.readouterr()
    rc = main(["create", str(tmp_path), "--slug", "greeter",
               "--title", "Other"])
    assert rc == EXIT_REFUSED
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "greeter" in captured.err
    # The manifest keeps the first entry untouched.
    assert [e["title"] for e in _manifest(tmp_path)["modules"]] == ["Greeter"]


def test_create_writes_the_scope_fields(tmp_path, capsys):
    rc = main([
        "create", str(tmp_path), "--slug", "greeter", "--title", "Greeter",
        "--code-root", "src/greeter", "--spec-section", "docs/spec.md#greet",
        "--context-asset", "schemas/*.json",
    ])
    assert rc == EXIT_OK
    capsys.readouterr()
    entry = find_entry(tmp_path, "greeter")
    assert entry.code_roots == ("src/greeter",)
    assert entry.spec_sections == ("docs/spec.md#greet",)
    assert entry.context_assets == ("schemas/*.json",)


def test_an_unknown_entry_key_is_rejected_not_ignored(tmp_path):
    _write_manifest(tmp_path, [{"slug": "greeter", "codeRoot": "src"}])
    with pytest.raises(ValueError) as excinfo:
        load_entries(tmp_path)
    assert "codeRoot" in str(excinfo.value)


def test_a_mistyped_list_field_is_rejected(tmp_path):
    _write_manifest(tmp_path, [{"slug": "greeter", "codeRoots": "src"}])
    with pytest.raises(ValueError) as excinfo:
        load_entries(tmp_path)
    assert "codeRoots" in str(excinfo.value)


def test_create_refuses_to_append_to_an_invalid_manifest(tmp_path, capsys):
    _write_manifest(tmp_path, [{"slug": "greeter", "bogus": 1}])
    rc = main(["create", str(tmp_path), "--slug", "other", "--title", "Other"])
    assert rc == EXIT_REFUSED
    assert "bogus" in capsys.readouterr().err
    assert len(_manifest(tmp_path)["modules"]) == 1


def test_find_entry_is_none_for_an_undeclared_slug(tmp_path):
    _write_manifest(tmp_path, [{"slug": "greeter", "title": "Greeter"}])
    assert find_entry(tmp_path, "absent") is None
