import textwrap

import pytest
import yaml

from ai_router.context_scope import (
    CONTENT_FULL,
    CONTENT_INTERFACE,
    CONTENT_NAMES,
    TIER_ASSETS,
    TIER_CALLERS,
    TIER_INTERFACE,
    TIER_MODIFIED,
    TIER_MODULE_PATHS,
    TIER_SPEC,
    TIER_TESTS,
    ScopeTooLarge,
    ScopeUnavailable,
    changed_paths,
    changed_symbols,
    extract_section,
    interface_surface,
    resolve_scope,
    strip_comments,
)


def _write(root, rel, text):
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(text), encoding="utf-8")
    return path


def _manifest(root, **overrides):
    entry = {"slug": "widget", "title": "Widget", "codeRoots": ["src"]}
    entry.update(overrides)
    _write(root, "docs/modules.yaml", "")
    (root / "docs" / "modules.yaml").write_text(
        yaml.safe_dump({"modules": [entry]}, sort_keys=False),
        encoding="utf-8",
    )


def _diff(rel, start=1, count=3):
    return (
        f"diff --git a/{rel} b/{rel}\n"
        f"--- a/{rel}\n"
        f"+++ b/{rel}\n"
        f"@@ -{start},{count} +{start},{count} @@\n"
        "+changed\n"
    )


@pytest.fixture
def repo(tmp_path):
    root = tmp_path / "repo"
    _write(root, "src/core.py", '''
        """Core."""

        SPEED_LIMIT = 7


        def compute(value: int) -> int:
            """Contract: doubles the value."""
            secret_detail = value * 2
            return secret_detail
    ''')
    _write(root, "src/caller.py", '''
        from src.core import compute


        def run(x):
            return compute(x)
    ''')
    _write(root, "src/unrelated.py", '''
        def idle():
            return None
    ''')
    _write(root, "tests/test_core.py", '''
        from src import core


        def test_compute():
            assert core.compute(2) == 4
    ''')
    _manifest(root)
    return root


# --- diff and text primitives ----------------------------------------------

def test_changed_paths_reports_hunk_ranges_of_the_post_image():
    diff = (
        "diff --git a/src/core.py b/src/core.py\n"
        "--- a/src/core.py\n"
        "+++ b/src/core.py\n"
        "@@ -4,6 +6,8 @@ def compute():\n"
        "+x\n"
    )
    assert changed_paths(diff) == {"src/core.py": [(6, 13)]}


def test_changed_paths_reports_a_deletion_without_a_range():
    diff = (
        "diff --git a/src/gone.py b/src/gone.py\n"
        "--- a/src/gone.py\n"
        "+++ /dev/null\n"
        "@@ -1,3 +0,0 @@\n"
        "-x\n"
    )
    assert changed_paths(diff) == {"src/gone.py": []}


def test_strip_comments_keeps_a_hash_inside_a_string_literal():
    stripped = strip_comments('url = "a#b"  # trailing note\n', ".py")
    assert '"a#b"' in stripped
    assert "trailing note" not in stripped


def test_changed_symbols_only_names_definitions_the_hunks_touch():
    source = textwrap.dedent('''
        def untouched():
            return 1


        def touched():
            return 2
    ''').strip()
    lineno = source.splitlines().index("def touched():") + 1
    assert changed_symbols(source, [(lineno, lineno + 1)]) == {"touched"}


def test_interface_surface_keeps_the_contract_and_drops_the_body():
    surface, refusal = interface_surface(textwrap.dedent('''
        SPEED_LIMIT = 7


        def compute(value: int) -> int:
            """Contract: doubles the value."""
            secret_detail = value * 2
            return secret_detail
    '''))
    assert refusal is None
    assert "def compute(value: int) -> int" in surface
    assert "Contract: doubles the value." in surface
    assert "SPEED_LIMIT = 7" in surface
    assert "secret_detail" not in surface


def test_interface_surface_refuses_unparseable_python():
    surface, refusal = interface_surface("def broken(:\n")
    assert surface is None
    assert "unparseable" in refusal


def test_extract_section_stops_at_the_next_heading_of_equal_level():
    text = "# One\nalpha\n\n## Sub\nbeta\n\n# Two\ngamma\n"
    section = extract_section(text, "one")
    assert "beta" in section
    assert "gamma" not in section


# --- the seven tiers --------------------------------------------------------

def test_tier_one_carries_the_modified_file_in_full(repo):
    scope = resolve_scope(repo, _diff("src/core.py"), "widget")
    tier = scope.tier(TIER_MODIFIED)
    assert [e.path for e in tier] == ["src/core.py"]
    assert tier[0].content_kind == CONTENT_FULL
    assert "secret_detail" in tier[0].text


def test_tier_two_pulls_a_caller_of_a_changed_symbol_from_outside_the_module(
    repo,
):
    _write(repo, "app/consumer.py", '''
        from src.core import compute


        def consume(x):
            return compute(x)
    ''')
    scope = resolve_scope(repo, _diff("src/core.py", start=6, count=4),
                          "widget")
    assert "compute" in scope.changed_symbols
    assert {e.path for e in scope.tier(TIER_CALLERS)} == {
        "src/caller.py", "app/consumer.py",
    }


def test_a_file_that_calls_nothing_changed_is_excluded_not_pulled(repo):
    scope = resolve_scope(repo, _diff("src/core.py"), "widget")
    pulled = {e.path for e in scope.entries if e.tier != TIER_MODULE_PATHS}
    assert "src/unrelated.py" not in pulled
    assert any("other in-module file" in x.subject for x in scope.exclusions)


def test_tier_three_pulls_the_test_that_imports_the_modified_file(repo):
    scope = resolve_scope(repo, _diff("src/core.py"), "widget")
    assert [e.path for e in scope.tier(TIER_TESTS)] == ["tests/test_core.py"]


def test_tier_four_is_interface_only_and_one_hop(repo):
    _write(repo, "src/depth2.py", "def deep():\n    return 99\n")
    _write(repo, "src/hop1.py", '''
        from src.depth2 import deep


        def helper(flag: bool) -> int:
            """Contract: helps."""
            hidden_body_token = deep()
            return hidden_body_token
    ''')
    _write(repo, "src/edge.py", '''
        from src.hop1 import helper


        def edge():
            return helper(True)
    ''')
    _manifest(repo, codeRoots=["src"])
    scope = resolve_scope(repo, _diff("src/edge.py"), "widget")
    hop = {e.path: e for e in scope.tier(TIER_INTERFACE)}
    assert "src/hop1.py" in hop
    assert hop["src/hop1.py"].content_kind == CONTENT_INTERFACE
    assert "Contract: helps." in hop["src/hop1.py"].text
    assert "hidden_body_token" not in hop["src/hop1.py"].text
    # One hop only: hop1's own import is not followed.
    assert "src/depth2.py" not in hop


def test_a_path_named_only_in_a_comment_is_not_a_tier_four_reference(repo):
    _write(repo, "src/mentioned.py", "def mentioned():\n    return 1\n")
    _write(repo, "src/mentioner.py",
           "# see src/mentioned.py for the old behaviour\n"
           "def mentioner():\n    return 2\n")
    scope = resolve_scope(repo, _diff("src/mentioner.py"), "widget")
    assert "src/mentioned.py" not in {
        e.path for e in scope.tier(TIER_INTERFACE)
    }


def test_tier_four_resolves_an_extensionless_typescript_import(repo):
    _write(repo, "src/util/helper.ts", '''
        import * as vscode from "vscode";

        export interface Options {
          retries: number;
        }

        export function helper(opts: Options): string {
          return String(opts.retries + 1);
        }
    ''')
    _write(repo, "src/util/edge.ts", '''
        import { helper } from "./helper";

        export function edge(): string {
          return helper({ retries: 1 });
        }
    ''')
    scope = resolve_scope(repo, _diff("src/util/edge.ts"), "widget")
    surfaces = {e.path: e for e in scope.tier(TIER_INTERFACE)}
    assert "src/util/helper.ts" in surfaces
    # No real TypeScript parser here, so the file is carried whole rather
    # than guessed at.
    assert surfaces["src/util/helper.ts"].content_kind == CONTENT_FULL
    assert "retries: number" in surfaces["src/util/helper.ts"].text
    # A bare package specifier is not a repo file.
    assert not any("vscode" in path for path in surfaces)


def test_a_dot_prefixed_directory_survives_path_normalisation(repo):
    _write(repo, ".vscode/helper.ts", "export const helper = 1;\n")
    _write(repo, ".vscode/main.ts", 'import { helper } from "./helper";\n')
    scope = resolve_scope(repo, _diff(".vscode/main.ts"), "widget")
    assert [e.path for e in scope.tier(TIER_MODIFIED)] == [".vscode/main.ts"]
    assert ".vscode/helper.ts" in {e.path for e in scope.tier(TIER_INTERFACE)}


def test_a_referenced_non_python_file_is_carried_in_full(repo):
    _write(repo, "src/tool.ps1", "function Invoke-Tool { 'hi' }\n")
    _write(repo, "src/runner.py", '''
        SCRIPT = "src/tool.ps1"


        def runner():
            return SCRIPT
    ''')
    scope = resolve_scope(repo, _diff("src/runner.py"), "widget")
    carried = {e.path: e for e in scope.tier(TIER_INTERFACE)}
    assert carried["src/tool.ps1"].content_kind == CONTENT_FULL
    assert "Invoke-Tool" in carried["src/tool.ps1"].text
    _write(repo, "src/mentioner.py",
           "# see src/mentioned.py for the old behaviour\n"
           "def mentioner():\n    return 2\n")
    scope = resolve_scope(repo, _diff("src/mentioner.py"), "widget")
    assert "src/mentioned.py" not in {
        e.path for e in scope.tier(TIER_INTERFACE)
    }


def test_tier_five_takes_the_mapped_spec_section_only(repo):
    _write(repo, "docs/spec.md",
           "# Widget rules\nkeep me\n\n# Other module\ndrop me\n")
    _manifest(repo, codeRoots=["src"],
              specSections=["docs/spec.md#widget-rules"])
    scope = resolve_scope(repo, _diff("src/core.py"), "widget")
    text = scope.tier(TIER_SPEC)[0].text
    assert "keep me" in text
    assert "drop me" not in text


def test_tier_five_records_an_unresolvable_mapping_as_an_exclusion(repo):
    _write(repo, "docs/spec.md", "# Widget rules\nkeep me\n")
    _manifest(repo, codeRoots=["src"], specSections=["docs/spec.md#absent"])
    scope = resolve_scope(repo, _diff("src/core.py"), "widget")
    assert scope.tier(TIER_SPEC) == []
    assert any("absent" in x.reason for x in scope.exclusions)


def test_tier_six_resolves_a_context_asset_glob(repo):
    _write(repo, "schemas/widget.json", '{"kind": "widget"}\n')
    _manifest(repo, codeRoots=["src"], contextAssets=["schemas/*.json"])
    scope = resolve_scope(repo, _diff("src/core.py"), "widget")
    assert [e.path for e in scope.tier(TIER_ASSETS)] == [
        "schemas/widget.json"
    ]


def test_tier_seven_lists_module_paths_by_name_with_no_contents(repo):
    scope = resolve_scope(repo, _diff("src/core.py"), "widget")
    tier = scope.tier(TIER_MODULE_PATHS)
    assert {e.path for e in tier} == {
        "src/core.py", "src/caller.py", "src/unrelated.py",
    }
    assert all(e.text is None and e.content_kind == CONTENT_NAMES
               for e in tier)


# --- boundaries and refusals ------------------------------------------------

def test_a_change_outside_the_code_roots_is_still_reviewed_in_full(repo):
    _write(repo, "other/thing.py", "def thing():\n    return 1\n")
    scope = resolve_scope(repo, _diff("other/thing.py"), "widget")
    assert [e.path for e in scope.tier(TIER_MODIFIED)] == ["other/thing.py"]
    assert scope.changes_outside_code_roots == ("other/thing.py",)


def test_an_untracked_addition_can_be_supplied_out_of_band(repo):
    _write(repo, "src/fresh.py", "def fresh():\n    return 1\n")
    scope = resolve_scope(repo, "", "widget",
                          extra_changed_paths=["src/fresh.py"])
    assert [e.path for e in scope.tier(TIER_MODIFIED)] == ["src/fresh.py"]


def test_an_undeclared_slug_leaves_the_caller_unscoped(repo):
    with pytest.raises(ScopeUnavailable):
        resolve_scope(repo, _diff("src/core.py"), "no-such-module")


def test_a_module_without_code_roots_still_scopes_tiers_one_to_four(repo):
    _manifest(repo, codeRoots=[])
    scope = resolve_scope(repo, _diff("src/core.py", start=6, count=4),
                          "widget")
    assert [e.path for e in scope.tier(TIER_MODIFIED)] == ["src/core.py"]
    assert [e.path for e in scope.tier(TIER_CALLERS)] == ["src/caller.py"]
    assert scope.tier(TIER_MODULE_PATHS) == []
    assert any("codeRoots" in x.reason for x in scope.exclusions)


def test_an_over_budget_scope_is_refused_rather_than_trimmed(repo, monkeypatch):
    monkeypatch.setenv("AI_ROUTER_SCOPE_MAX_CHARS", "10")
    with pytest.raises(ScopeTooLarge) as excinfo:
        resolve_scope(repo, _diff("src/core.py"), "widget")
    assert "AI_ROUTER_SCOPE_MAX_CHARS" in str(excinfo.value)
