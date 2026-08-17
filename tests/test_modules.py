import json

import yaml

from ai_router.modules import EXIT_OK, EXIT_REFUSED, main


def _manifest(root) -> dict:
    return yaml.safe_load(
        (root / "docs" / "modules.yaml").read_text(encoding="utf-8")
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
