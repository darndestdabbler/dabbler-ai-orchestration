"""Set 107 S2 — tests for the tutorial-fidelity gate.

``tutorial_gate`` lives under ``ai_router/scripts/`` and is imported by bare
filename via the conftest ``SCRIPTS_DIR`` sys.path shim (same convention as
``drift_guard``).

Two kinds of test here, and both matter:

1. Each check is FALSIFIED on a synthetic tree — a defect is introduced and the
   check must fire. Set 106 shipped this gate's predecessor as a script that was
   only ever observed green; a check nobody has watched fail is not known to be
   a check.
2. A final test asserts the REAL repository passes, so this suite is itself the
   CI gate: paraphrasing the sample's output in the tutorial, inventing a
   command title, breaking a link, or letting git / YAML / host / governance
   vocabulary back into the 15-minute first run all turn it red.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

import tutorial_gate


REPO_ROOT = Path(__file__).resolve().parents[2]
HELLO_WORLD = "docs/tutorials/hello-world.md"


# ---------------------------------------------------------------------------
# A synthetic repo with the minimum surface the gate reads
# ---------------------------------------------------------------------------


@pytest.fixture()
def repo(tmp_path: Path) -> Path:
    """A miniature repo: one bundle, one tutorial, one package.json."""
    root = tmp_path / "repo"

    files = root / "docs" / "templates" / "sample-project" / "files"
    (files / "hello").mkdir(parents=True)
    (files / "hello" / "greeting.py").write_text("def greet(n):\n", encoding="utf-8")
    (files / "main.py").write_text("print(greet('world'))\n", encoding="utf-8")
    (files / "test_greeting.py").write_text("import unittest\n", encoding="utf-8")
    (files / "dot-gitignore").write_text(".venv/\n", encoding="utf-8")

    (root / "docs" / "templates" / "sample-project" / "bundle.json").write_text(
        json.dumps(
            {
                "bundleVersion": 1,
                "sampleSetSlug": "001-add-a-shout",
                "programEntryPoint": "main.py",
                "testCommandArgs": ["-m", "unittest"],
                "expectedTestCount": 2,
                "expectedProgramOutput": ["Hello, world!", "HELLO, WORLD!"],
                "missingFunction": "shout",
            }
        ),
        encoding="utf-8",
    )

    pkg_dir = root / "tools" / "dabbler-ai-orchestration"
    pkg_dir.mkdir(parents=True)
    (pkg_dir / "package.json").write_text(
        json.dumps(
            {
                "contributes": {
                    "commands": [
                        {
                            "command": "dabbler.trySampleProject",
                            "category": "Dabbler",
                            "title": "Try a sample project",
                        }
                    ]
                }
            }
        ),
        encoding="utf-8",
    )

    tutorials = root / "docs" / "tutorials"
    tutorials.mkdir(parents=True)
    (tutorials / "adopt-dabbler.md").write_text(
        "# Adopt\n"
        "\n"
        "Left-click the set and paste the line it copies:\n"
        "\n"
        "```\n"
        "Start the next session of `003-greeter-plan`.\n"
        "```\n",
        encoding="utf-8",
    )
    (tutorials / "hello-world.md").write_text(
        "# Hello World\n"
        "\n"
        "Run **Dabbler: Try a sample project**.\n"
        "The dialog is **Select an Empty Folder for the Sample Project**;\n"
        "click **Create Sample Project**. A notification reads\n"
        "**Creating your sample project...**.\n"
        "\n"
        "Your sample project is ready. To start the first AI task, copy the\n"
        "starter prompt and paste it into your AI chat.\n"
        "\n"
        "Click **Copy Starter Prompt**, and the status bar says\n"
        "`Copied to clipboard. Paste it into your AI chat to begin.`\n"
        "\n"
        "```\n"
        "Start the next session of `001-add-a-shout`.\n"
        "```\n"
        "\n"
        "`hello/greeting.py` is missing `shout`; run `main.py` after.\n"
        "The set is `001-add-a-shout` and `test_greeting.py` holds the tests.\n"
        "\n"
        "```\n"
        ".venv\\Scripts\\python.exe -m unittest\n"
        "```\n"
        "```\n"
        ".venv/bin/python -m unittest\n"
        "```\n"
        "\n"
        "```\n"
        "Ran 2 tests in 0.000s\n"
        "\n"
        "FAILED (errors=1)\n"
        "```\n"
        "\n"
        # The SECOND pair -- mirrors the real tutorial, where the test command
        # is shown once before the AI's change and once after. This duplication
        # is what defeated the set-based platform check (round 5).
        "```\n"
        ".venv\\Scripts\\python.exe -m unittest\n"
        "```\n"
        "```\n"
        ".venv/bin/python -m unittest\n"
        "```\n"
        "\n"
        "```\n"
        "Ran 2 tests in 0.000s\n"
        "\n"
        "OK\n"
        "```\n"
        "\n"
        "```\n"
        ".venv\\Scripts\\python.exe main.py\n"
        "```\n"
        "```\n"
        ".venv/bin/python main.py\n"
        "```\n"
        "\n"
        "```\n"
        "Hello, world!\n"
        "HELLO, WORLD!\n"
        "```\n"
        "\n"
        "Next: [Adopt Dabbler](adopt-dabbler.md). Full tier adds independent\n"
        "cross-provider verification.\n",
        encoding="utf-8",
    )

    ts_dir = root / "tools" / "dabbler-ai-orchestration" / "src" / "utils"
    ts_dir.mkdir(parents=True)
    (ts_dir / "sampleProject.ts").write_text(
        'export const SAMPLE_PICKER_LABEL = "Create Sample Project";\n'
        'export const SAMPLE_PICKER_TITLE = '
        '"Select an Empty Folder for the Sample Project";\n'
        'export const SUCCESS_NEXT_STEP_ACTION = "Copy Starter Prompt";\n'
        'export const STARTER_LINE_COPIED = '
        '"Copied to clipboard. Paste it into your AI chat to begin.";\n'
        'export function describeSuccess() { return '
        '"Your sample project is ready. To start the first AI task, copy the '
        'starter prompt and paste it into your AI chat."; }\n'
        "export function buildSampleStarterLine(slug: string): string {\n"
        "  return `Start the next session of \\`${slug}\\`.`;\n"
        "}\n",
        encoding="utf-8",
    )
    cmd_dir = root / "tools" / "dabbler-ai-orchestration" / "src" / "commands"
    cmd_dir.mkdir(parents=True)
    (cmd_dir / "trySampleProject.ts").write_text(
        'const title = "Creating your sample project...";\n', encoding="utf-8"
    )
    return root


def _edit(repo: Path, rel: str, old: str, new: str) -> None:
    p = repo / rel
    text = p.read_text(encoding="utf-8")
    assert old in text, f"fixture drift: {old!r} not in {rel}"
    p.write_text(text.replace(old, new), encoding="utf-8")


def _append(repo: Path, rel: str, text: str) -> None:
    p = repo / rel
    p.write_text(p.read_text(encoding="utf-8") + text, encoding="utf-8")


def _checks(violations, name: str):
    return [v for v in violations if v.check == name]


def test_clean_synthetic_repo_passes(repo: Path):
    assert tutorial_gate.run_all(repo) == []


# ---------------------------------------------------------------------------
# Check 1 — command titles
# ---------------------------------------------------------------------------


def test_invented_command_title_is_flagged(repo: Path):
    _edit(repo, HELLO_WORLD, "Dabbler: Try a sample project", "Dabbler: Start work")
    assert _checks(tutorial_gate.run_all(repo), "command-titles")


def test_command_title_containing_a_dot_is_captured_whole(repo: Path):
    """`Dabbler: Open modules.yaml` is a real title; the dot is part of it.

    Set 108 S3: the regex stopped at the dot, so the gate reported the correct
    tutorial text as an invented command and CI went red on a true statement.
    """
    # Assert on the capture itself, not merely on the absence of a violation:
    # a regex that stopped matching dotted titles ALTOGETHER would also emit no
    # violation, so the no-violation assertion below is fail-open on its own.
    captured = tutorial_gate._COMMAND_RE.findall(
        "run **`Dabbler: Open modules.yaml`** and add the code root"
    )
    assert captured == ["Open modules.yaml"]

    pkg = repo / "tools" / "dabbler-ai-orchestration" / "package.json"
    data = json.loads(pkg.read_text(encoding="utf-8"))
    data["contributes"]["commands"].append(
        {
            "command": "dabbler.openModulesYaml",
            "category": "Dabbler",
            "title": "Open modules.yaml",
        }
    )
    pkg.write_text(json.dumps(data), encoding="utf-8")

    _edit(
        repo,
        HELLO_WORLD,
        "Dabbler: Try a sample project",
        "Dabbler: Open modules.yaml",
    )
    assert _checks(tutorial_gate.run_all(repo), "command-titles") == []


def test_sentence_final_period_is_not_swallowed_into_a_title(repo: Path):
    """The dot-tolerant regex must still stop at the end of a sentence."""
    _edit(
        repo,
        HELLO_WORLD,
        "Dabbler: Try a sample project",
        "Dabbler: Try a sample project. Then read on",
    )
    assert _checks(tutorial_gate.run_all(repo), "command-titles") == []


# ---------------------------------------------------------------------------
# Check 2 — program output is bound to bundle.json
# ---------------------------------------------------------------------------


def test_paraphrased_program_output_is_flagged(repo: Path):
    _edit(repo, HELLO_WORLD, "HELLO, WORLD!", "HELLO WORLD!")
    found = _checks(tutorial_gate.run_all(repo), "bundle-output")
    assert found and "HELLO, WORLD!" in found[0].detail


# ---------------------------------------------------------------------------
# Check 3 — test count is bound to bundle.json
# ---------------------------------------------------------------------------


def test_wrong_test_count_is_flagged(repo: Path):
    _edit(repo, HELLO_WORLD, "Ran 2 tests", "Ran 3 tests")
    assert _checks(tutorial_gate.run_all(repo), "bundle-test-count")


def test_missing_test_output_is_flagged(repo: Path):
    _edit(repo, HELLO_WORLD, "Ran 2 tests in 0.000s\n", "")
    assert _checks(tutorial_gate.run_all(repo), "bundle-test-count")


# ---------------------------------------------------------------------------
# Check 4 — sample literals
# ---------------------------------------------------------------------------


def test_renamed_missing_function_is_flagged(repo: Path):
    _edit(repo, HELLO_WORLD, "`shout`", "`yell`")
    assert _checks(tutorial_gate.run_all(repo), "bundle-literals")


def test_path_not_in_bundle_is_flagged(repo: Path):
    _edit(repo, HELLO_WORLD, "`test_greeting.py`", "`tests/test_greeting.py`")
    found = _checks(tutorial_gate.run_all(repo), "bundle-literals")
    assert found and "tests/test_greeting.py" in found[0].detail


def test_dot_prefixed_bundle_file_renders_without_the_prefix(repo: Path):
    """`files/dot-gitignore` renders as `.gitignore`, so quoting the rendered
    name must pass and quoting the source name must not."""
    rendered = tutorial_gate.rendered_bundle_paths(repo)
    assert ".gitignore" in rendered
    assert "dot-gitignore" not in rendered


# ---------------------------------------------------------------------------
# Check 5 — links
# ---------------------------------------------------------------------------


def test_dead_relative_link_is_flagged(repo: Path):
    _edit(repo, HELLO_WORLD, "(adopt-dabbler.md)", "(adopting-dabbler.md)")
    assert _checks(tutorial_gate.run_all(repo), "links")


def test_external_and_anchor_links_are_not_flagged(repo: Path):
    _append(
        repo,
        HELLO_WORLD,
        "\n[ext](https://example.invalid/x) and [anchor](adopt-dabbler.md#top)\n",
    )
    assert not _checks(tutorial_gate.run_all(repo), "links")


# ---------------------------------------------------------------------------
# Check 6 — the first run stays a first run
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "snippet",
    [
        'Now run `git commit -m "done"`.\n',
        "Run `git push` to share it.\n",
        "```yaml\nmodules:\n  - slug: greeter\n```\n",
        "Open a pull request when you are done.\n",
        "Turn on branch protection for main.\n",
        "Open a worktree for the set.\n",
        "Ask a teammate to review it.\n",
        "Your CI job runs the tests too.\n",
        "Add it to your pipeline.\n",
        "Edit `.github/CODEOWNERS` to route reviews.\n",
        "Create the repository on GitHub first.\n",
        "On Azure DevOps, add a build validation policy.\n",
        "Set DABBLER_ANTHROPIC_API_KEY in your environment.\n",
        "Enter a not-to-exceed budget when asked.\n",
        # --- Round 1 of Set 107 S2's verification found every one of these
        # --- passing the first version of the gate.
        "Run `git diff` to see what changed.\n",
        "Check `git log` for the history.\n",
        "Use `git show HEAD` to inspect it.\n",
        "If it goes wrong, `git reset --hard`.\n",
        "Run `git clean -fd` to tidy up.\n",
        "Use `git cherry-pick abc123`.\n",
        "Add a `git worktree` for the session.\n",
        "Start a branch before you begin.\n",
        "Switch branches when you are done.\n",
        "Commit your work first.\n",
        # An UNLABELLED fence carrying YAML -- the tutorial's own fence style.
        "```\nmodules:\n  - slug: greeter\n    title: Greeter\n```\n",
        # --- Round 3 nit: a mapping key plus an indented scalar list, which the
        # --- first detector missed because the list items were not `key:`.
        "```\nproviders:\n  - codex\n  - gemini\n```\n",
    ],
)
def test_first_run_constraint_flags_banned_content(repo: Path, snippet: str):
    _append(repo, HELLO_WORLD, snippet)
    found = _checks(tutorial_gate.run_all(repo), "first-run-constraint")
    assert found, f"gate did not flag: {snippet!r}"


def test_missing_full_tier_sentence_is_flagged(repo: Path):
    """Its ABSENCE is a defect too -- the spec requires exactly one."""
    _edit(
        repo,
        HELLO_WORLD,
        "Full tier adds independent\ncross-provider verification.",
        "That is all.",
    )
    assert _checks(tutorial_gate.run_all(repo), "first-run-constraint")


def test_duplicated_full_tier_sentence_is_flagged(repo: Path):
    _append(
        repo,
        HELLO_WORLD,
        "\nFull tier adds independent cross-provider verification.\n",
    )
    found = _checks(tutorial_gate.run_all(repo), "first-run-constraint")
    assert found and "found 2" in found[-1].detail


def test_full_tier_sentence_survives_a_line_wrap(repo: Path):
    """Markdown reflows prose; a line break is not a content difference."""
    assert not _checks(tutorial_gate.run_all(repo), "first-run-constraint")


# ---------------------------------------------------------------------------
# Check 3b — the red-to-green transition must be shown at BOTH ends
# ---------------------------------------------------------------------------


def test_missing_failing_result_is_flagged(repo: Path):
    _edit(repo, HELLO_WORLD, "FAILED (errors=1)", "(it passes)")
    found = _checks(tutorial_gate.run_all(repo), "bundle-test-count")
    assert found and "failing" in found[0].detail


def test_missing_passing_result_is_flagged(repo: Path):
    _edit(repo, HELLO_WORLD, "\nOK\n", "\n(done)\n")
    found = _checks(tutorial_gate.run_all(repo), "bundle-test-count")
    assert found and "passing" in found[0].detail


# ---------------------------------------------------------------------------
# Check 4b — quoted UI strings are bound to the shipped constants
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "literal",
    [
        "Create Sample Project",
        "Select an Empty Folder for the Sample Project",
        "Creating your sample project...",
        "Copy Starter Prompt",
        "Copied to clipboard. Paste it into your AI chat to begin.",
    ],
)
def test_tutorial_dropping_a_ui_string_is_flagged(repo: Path, literal: str):
    _edit(repo, HELLO_WORLD, literal, "something else entirely")
    assert _checks(tutorial_gate.run_all(repo), "ui-strings")


def test_product_renaming_a_ui_string_is_flagged(repo: Path):
    """Drift from the OTHER side: the source changes, the tutorial does not."""
    _edit(
        repo,
        "tools/dabbler-ai-orchestration/src/utils/sampleProject.ts",
        "Copy Starter Prompt",
        "Copy Start Line",
    )
    found = _checks(tutorial_gate.run_all(repo), "ui-strings")
    assert found and "no such string remains" in found[0].detail


def test_starter_line_must_appear_verbatim(repo: Path):
    _edit(
        repo,
        HELLO_WORLD,
        "Start the next session of `001-add-a-shout`.",
        "Begin the next session for 001-add-a-shout.",
    )
    found = _checks(tutorial_gate.run_all(repo), "ui-strings")
    assert found and "starter line" in found[0].detail


def test_ui_string_check_tolerates_a_line_wrap(repo: Path):
    """The success notification is quoted across two lines in the fixture."""
    assert not _checks(tutorial_gate.run_all(repo), "ui-strings")


def test_starter_line_template_is_pinned_to_the_shipped_source(repo: Path):
    """Hard-coding the template in the gate would just move the drift up a
    level: if the product reworded it, the gate would keep enforcing the old
    form and report green. Round 4 (close backstop) named this."""
    _edit(
        repo,
        "tools/dabbler-ai-orchestration/src/utils/sampleProject.ts",
        "Start the next session of",
        "Begin the next session for",
    )
    found = _checks(tutorial_gate.run_all(repo), "ui-strings")
    assert found and "no longer produces that wording" in found[0].detail


def test_adoption_tutorial_starter_line_is_pinned_too(repo: Path):
    """Round 3 named the residual; round 4 was right that naming is not
    closing. adopt-dabbler.md is checked on the PREFIX, since its slugs are the
    reader's own rather than the sample's."""
    _edit(
        repo,
        "docs/tutorials/adopt-dabbler.md",
        "Start the next session of `003-greeter-plan`.",
        "Kick off the next session.",
    )
    found = _checks(tutorial_gate.run_all(repo), "ui-strings")
    assert found and "adopt-dabbler.md" in found[0].location


# ---------------------------------------------------------------------------
# Check 4c — platform pairs. This is the check that would have caught THIS
# session's own Windows-only step 4.
# ---------------------------------------------------------------------------


def test_windows_only_command_is_flagged(repo: Path):
    _edit(
        repo,
        HELLO_WORLD,
        "\n.venv/bin/python main.py\n",
        "\n",
    )
    found = _checks(tutorial_gate.run_all(repo), "platform-pairs")
    assert any("POSIX reader" in v.detail for v in found)


def test_posix_only_command_is_flagged(repo: Path):
    _edit(
        repo,
        HELLO_WORLD,
        "\n.venv\\Scripts\\python.exe main.py\n",
        "\n",
    )
    found = _checks(tutorial_gate.run_all(repo), "platform-pairs")
    assert any("Windows reader" in v.detail for v in found)


def test_mistyped_platform_alternative_is_flagged(repo: Path):
    """A dropped alternative and a typo'd one fail the same way -- the check
    compares ARGUMENTS, so the pair must match, not merely both exist."""
    _edit(repo, HELLO_WORLD, ".venv/bin/python main.py", ".venv/bin/python maim.py")
    assert _checks(tutorial_gate.run_all(repo), "platform-pairs")


def test_matched_platform_pairs_pass(repo: Path):
    assert not _checks(tutorial_gate.run_all(repo), "platform-pairs")


def test_removing_only_the_second_posix_test_command_is_flagged(repo: Path):
    """The regression round 5 asked for, and the one the set-based version
    could not see.

    `-m unittest` is shown twice -- before the AI's change and after. Deleting
    only the SECOND POSIX occurrence (section 4's) left the argument string
    present via section 1, so the old set comparison reported green while a
    macOS reader reached the completion proof with no runnable command. This is
    precisely this session's own original defect.
    """
    text = (repo / HELLO_WORLD).read_text(encoding="utf-8")
    needle = "```\n.venv/bin/python -m unittest\n```\n"
    assert text.count(needle) == 2, "fixture must show the pair twice"
    head, sep, tail = text.rpartition(needle)
    (repo / HELLO_WORLD).write_text(head + tail, encoding="utf-8")

    found = _checks(tutorial_gate.run_all(repo), "platform-pairs")
    assert found, "the second-occurrence removal must be caught"
    assert any("2 time(s) for Windows but 1 time(s)" in v.detail for v in found)


def test_commented_untagged_yaml_is_flagged(repo: Path):
    """Round 5: a `# comment` line matched neither YAML pattern, so `all(...)`
    went false and an ordinary commented config block was accepted."""
    _append(
        repo,
        HELLO_WORLD,
        "```\nproviders:\n  # Choose one provider.\n  - codex\n```\n",
    )
    assert _checks(tutorial_gate.run_all(repo), "first-run-constraint")


def test_yaml_document_markers_do_not_defeat_detection(repo: Path):
    _append(
        repo,
        HELLO_WORLD,
        "```\n---\nmodules:\n  - slug: greeter\n```\n",
    )
    assert _checks(tutorial_gate.run_all(repo), "first-run-constraint")


def test_symmetric_typo_in_both_platform_commands_is_flagged(repo: Path):
    """Round 6: symmetry was the wrong contract.

    Editing BOTH platform lines the same way -- the natural result of a global
    find-and-replace -- left the Counters equal and the gate green, while every
    reader got `No module named unitest`. The commands are now validated
    against bundle.json's own `testCommandArgs` / `programEntryPoint`.
    """
    _edit(repo, HELLO_WORLD, "-m unittest", "-m unitest")
    found = _checks(tutorial_gate.run_all(repo), "platform-pairs")
    assert found and "not a command bundle.json defines" in found[0].detail


def test_dropping_a_canonical_command_entirely_is_flagged(repo: Path):
    _edit(repo, HELLO_WORLD, ".venv\\Scripts\\python.exe main.py\n", "")
    _edit(repo, HELLO_WORLD, ".venv/bin/python main.py\n", "")
    found = _checks(tutorial_gate.run_all(repo), "platform-pairs")
    assert found and "never shows the reader running it" in found[-1].detail


@pytest.mark.parametrize(
    "snippet",
    [
        # Round 6: option forms start with a dash, so the subcommand branch
        # never matched them. `git --version` beside the Git prerequisite is
        # the most plausible edit of the lot.
        "Check it worked with `git --version`.\n",
        "Run `git -C myfolder status`.\n",
        "Use `git -c user.email=you@example.com commit`.\n",
    ],
)
def test_git_option_forms_are_flagged(repo: Path, snippet: str):
    _append(repo, HELLO_WORLD, snippet)
    assert _checks(tutorial_gate.run_all(repo), "first-run-constraint")


def test_block_scalar_yaml_is_flagged(repo: Path):
    """Round 5 asked for block scalars; the round-5 fix did not implement them
    and round 6 caught the omission."""
    _append(
        repo,
        HELLO_WORLD,
        "```\nsteps:\n  script: |\n    python build.py\n    python test.py\n```\n",
    )
    assert _checks(tutorial_gate.run_all(repo), "first-run-constraint")


def test_a_comment_only_block_is_not_yaml(repo: Path):
    """Furniture is skipped, not treated as content -- a fence of pure
    comments must not become a YAML violation on its own."""
    _append(repo, HELLO_WORLD, "```\n# just a note\n# and another\n```\n")
    assert not _checks(tutorial_gate.run_all(repo), "first-run-constraint")


# ---------------------------------------------------------------------------
# Required surfaces — the gate must not silently check nothing
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "rel",
    [
        "docs/tutorials/hello-world.md",
        "docs/tutorials/adopt-dabbler.md",
        "docs/templates/sample-project/bundle.json",
        "tools/dabbler-ai-orchestration/package.json",
    ],
)
def test_missing_required_surface_is_flagged(repo: Path, rel: str):
    (repo / rel).unlink()
    assert _checks(tutorial_gate.run_all(repo), "required-surfaces")


@pytest.mark.parametrize(
    "snippet",
    [
        # `git` as a bare noun in prose is fine -- being told to RUN it is not.
        "The project keeps its own version history for you.\n",
        # Naming the AI agent product is not host configuration.
        "Copilot, Claude Code, Codex and Gemini Code Assist all work.\n",
        # A dotfile name is not a git command.
        "The `.gitignore` file lists what is not tracked.\n",
        # `git-scm.com` is where a reader without git goes to get it.
        "Get it from [git-scm.com/downloads](https://git-scm.com/downloads).\n",
        # A shell transcript is not YAML, even with a `-` flag and a colon.
        "```\n.venv/bin/python -m unittest\n```\n",
        "```\nRan 2 tests in 0.000s\n\nOK\n```\n",
        # A ONE-LINE `word: value` fence is shape-identical to configuration,
        # and the tutorial legitimately contains two. Round 3 asked for these to
        # be flagged; doing so flagged the real document. Declined on purpose.
        "```\nDabbler: Try a sample project\n```\n",
        "```\nclose_session: succeeded\n```\n",
    ],
)
def test_first_run_constraint_does_not_flag_legitimate_prose(
    repo: Path, snippet: str
):
    _append(repo, HELLO_WORLD, snippet)
    assert not _checks(tutorial_gate.run_all(repo), "first-run-constraint")


def test_constraint_applies_only_to_the_first_run_document(repo: Path):
    """adopt-dabbler.md is SUPPOSED to teach hosts, CI and pull requests."""
    _append(
        repo,
        "docs/tutorials/adopt-dabbler.md",
        "Run `git push`, open a pull request on GitHub, and wait for CI.\n",
    )
    assert not _checks(tutorial_gate.run_all(repo), "first-run-constraint")


# ---------------------------------------------------------------------------
# Absent surfaces degrade quietly rather than crashing
# ---------------------------------------------------------------------------


def test_missing_surfaces_produce_no_violations(tmp_path: Path):
    assert tutorial_gate.run_all(tmp_path) == []


def test_missing_first_run_doc_does_not_crash_bundle_checks(repo: Path):
    """The per-check functions degrade quietly so they can run on a synthetic
    tree -- but `required-surfaces` is what stops that becoming a fail-open on
    a real one."""
    (repo / HELLO_WORLD).unlink()
    violations = tutorial_gate.run_all(repo)
    assert not _checks(violations, "bundle-output")
    assert _checks(violations, "required-surfaces")


# ---------------------------------------------------------------------------
# The real repository is the gate
# ---------------------------------------------------------------------------


def test_real_repository_passes_the_tutorial_gate():
    violations = tutorial_gate.run_all(REPO_ROOT)
    assert violations == [], "\n".join(v.render() for v in violations)


def test_cli_exits_zero_on_the_real_repository(capsys):
    assert tutorial_gate.main(["--repo-root", str(REPO_ROOT)]) == 0
    assert "OK" in capsys.readouterr().out


def test_cli_exits_one_on_a_violation(repo: Path, capsys):
    _edit(repo, HELLO_WORLD, "HELLO, WORLD!", "HELLO WORLD!")
    assert tutorial_gate.main(["--repo-root", str(repo)]) == 1
    assert "FAILED" in capsys.readouterr().out
