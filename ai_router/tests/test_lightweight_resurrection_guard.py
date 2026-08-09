"""Set 112 S3 — tests for the anti-resurrection gate.

A gate that only ever passes proves nothing: the regexes could match
nothing at all and the repo would still look clean. So the bulk of this
module is **falsifiers** — planted resurrections that the guard must
catch — paired with the narration the guard must NOT catch, because
Set 112 leaves roughly forty deliberate mentions of the tier behind
(the migration message, its tests, the historical note, the removal
notice, the changelogs, and the comments explaining missing branches).

This file is in :data:`lightweight_resurrection_guard.SELF_EXEMPT`: it
has to spell the removed names out to plant them.
"""
from __future__ import annotations

from pathlib import Path

import pytest

import lightweight_resurrection_guard as guard


def _repo_root() -> Path:
    return Path(guard.__file__).resolve().parent.parent.parent


# ---------------------------------------------------------------------------
# The gate against the real repo
# ---------------------------------------------------------------------------


def test_the_repo_declares_no_lightweight_tier():
    """The set's headline claim, as an assertion instead of a testimonial."""
    violations = guard.run_all(_repo_root())
    assert violations == [], "\n".join(v.render() for v in violations)


def test_the_deleted_modules_are_actually_gone():
    """The text-independent half of the gate.

    This is why exempting the guard's own two files cannot hide a
    resurrection: a module that came back is caught by its path, no matter
    what any file says about it.
    """
    root = _repo_root()
    for rel in guard.DELETED_FILES:
        assert not (root / Path(rel)).exists(), rel


def test_the_guard_scans_something():
    """A tripwire against an exclusion rule that quietly matches everything."""
    scanned = list(guard.iter_scanned_files(_repo_root()))
    assert len(scanned) > 500
    names = {p.name for p in scanned}
    assert "close_session.py" in names
    assert "spec_config.py" in names


# ---------------------------------------------------------------------------
# Falsifiers: each rule must fire on a planted resurrection
# ---------------------------------------------------------------------------


def _scan(text: str, suffix: str) -> list[str]:
    return [v.rule for v in guard.scan_text(f"planted{suffix}", text, suffix)]


def test_a_spec_declaring_the_tier_is_caught():
    spec = "# A set\n\n## Session Set Configuration\n\n```yaml\ntier: lightweight\nrequiresUAT: false\n```\n"
    assert "tier-declared" in _scan(spec, ".md")


@pytest.mark.parametrize(
    "line",
    [
        "tier: lightweight",
        "  tier: lightweight",
        "tier: 'lightweight'",
        'tier: "lightweight"',
        "- tier: lightweight",
        "tier: lightweight  # operator-locked",
        "tier: Lightweight",
    ],
)
def test_every_yaml_spelling_of_the_declaration_is_caught(line: str):
    assert "tier-declared" in _scan(f"```yaml\n{line}\n```\n", ".md")


@pytest.mark.parametrize(
    ("text", "suffix"),
    [
        ("verificationMode: dedicated-sessions\n", ".yaml"),
        ('{"verificationMode": "out-of-band-or-none"}\n', ".json"),
        ("const mode = ctx.verificationMode = 'x';\n", ".ts"),
        ("cfg = {'verification_mode': 'dedicated-sessions'}\n", ".py"),
    ],
)
def test_the_removed_field_is_caught_in_every_syntax(text: str, suffix: str):
    assert "verification-mode-field" in _scan(text, suffix)


# ---------------------------------------------------------------------------
# Round-1 / supplementary findings, as permanent falsifiers
#
# Every case below was MISSED by the first version of this gate and named
# by cross-provider verification. They are the shapes a resurrection would
# most plausibly take in this repo, so they stay pinned.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "suffix", "rule"),
    [
        # Round 1, finding 2: a triple-quoted string that is NOT a docstring
        # is data, not narration. This is the ordinary way to embed a spec.
        ('SPEC = """\ntier: lightweight\nrequiresUAT: false\n"""\n', ".py", "tier-declared"),
        # Round 1, finding 5: compact JSON slips past a line-anchored rule.
        ('{"tier":"lightweight"}\n', ".json", "tier-declared"),
        # Round 1, finding 1: the TypeScript shapes the extension surface
        # would actually come back as.
        ("interface S { verificationMode?: string; }\n", ".ts", "verification-mode-field"),
        ("if (spec.verificationMode) { enableLegacy(); }\n", ".ts", "verification-mode-field"),
        (
            'export type VerificationMode = "out-of-band-or-none" | "dedicated-sessions";\n',
            ".ts",
            "verification-mode-field",
        ),
        ('const DEFAULT_MODE = "dedicated-sessions";\n', ".ts", "verification-mode-value"),
        (
            'const MODES = ["out-of-band-or-none", "dedicated-sessions"];\n',
            ".ts",
            "verification-mode-value",
        ),
        # Remediation-review round: the two remaining live-read forms.
        ("const { verificationMode } = spec;\n", ".ts", "verification-mode-field"),
        ("const { verificationMode: mode } = spec;\n", ".ts", "verification-mode-field"),
        ("const { tier, verificationMode } = spec;\n", ".ts", "verification-mode-field"),
        ('if (spec["verificationMode"]) { legacy(); }\n', ".ts", "verification-mode-field"),
        # Round 4 (at the loop bound): the snake_case spelling, which a
        # `verification[_M]ode` character class silently never matched, and
        # the bare-key object literal.
        ("if (spec.verification_mode) { legacy(); }\n", ".ts", "verification-mode-field"),
        ("const { verification_mode } = spec;\n", ".ts", "verification-mode-field"),
        ("mode = spec.verification_mode\n", ".py", "verification-mode-field"),
        (
            'const spec = { tier: "lightweight", requiresUAT: false };\n',
            ".ts",
            "tier-declared",
        ),
    ],
)
def test_shapes_the_first_version_missed_are_caught(text: str, suffix: str, rule: str):
    assert rule in _scan(text, suffix)


def test_the_bare_key_inline_rule_does_not_apply_to_python():
    """Deliberate, and the reason the bare-key rule is separate.

    Planting a spec fragment inside a string is the idiom of the Python
    tests that prove the refusal fires. Applying the bare-key rule there
    would fail the tests that demonstrate the removal works. A real Python
    template still gets caught: its YAML starts its own line.
    """
    assert _scan("for raw in ('tier: \"lightweight\"',):\n", ".py") == []
    assert "tier-declared" in _scan('SPEC = """\ntier: lightweight\n"""\n', ".py")


def test_the_word_in_prose_or_a_test_name_is_still_not_a_declaration():
    """The read-form rules must not degrade into 'the word appears'.

    All three lines below are live in the repo and must stay clean.
    """
    text = (
        'test("validation is case-tolerant, matching tier / verificationMode", () => {\n'
        "  assert.ok(!/verificationMode/.test(spec), \"spec must not mention verificationMode\");\n"
        "});\n"
    )
    assert _scan(text, ".ts") == []


def test_a_docstring_is_still_narration_after_the_template_fix():
    """The fix must not swing the other way and flag every long string."""
    text = (
        "def f():\n"
        '    """Set 112 removed tier: lightweight and the verificationMode field.\n'
        "\n"
        '    dedicated_verification went with them.\n'
        '    """\n'
        "    return 1\n"
    )
    assert _scan(text, ".py") == []


@pytest.mark.parametrize(
    "name",
    ["spec.md.template", "azure-pipelines.yml.template", "config.json.in"],
)
def test_a_template_is_read_as_the_file_it_renders_to(name: str):
    """Supplementary finding: `.template` scaffolds were not scanned at all.

    They are the canonical source of every new consumer repo's `spec.md`,
    so a declaration there reaches every future adopter while CI stays
    green -- the worst place in the repo for the gate to be blind.
    """
    assert guard.effective_suffix(Path(name)) in guard._BLANKERS


def test_a_planted_declaration_in_the_scaffold_template_is_caught(tmp_path: Path):
    templates = tmp_path / "docs" / "templates" / "consumer-bootstrap"
    templates.mkdir(parents=True)
    (templates / "spec.md.template").write_text(
        "## Session Set Configuration\n\n```yaml\ntier: lightweight\n```\n",
        encoding="utf-8",
    )
    rules = [v.rule for v in guard.check_no_live_declarations(tmp_path)]
    assert rules == ["tier-declared"]


def test_a_bare_mode_literal_on_its_own_line_is_spared():
    """Deliberate boundary, not an oversight.

    The Playwright spec that proves a stale `.dabbler/verification-mode`
    marker is now INERT must write the string as a positional argument. A
    literal in that position configures nothing, and a gate that ate the
    test proving the removal works would be eating its own evidence.
    """
    text = (
        "fs.writeFileSync(\n"
        '  path.join(dabblerDir, "verification-mode"),\n'
        '  "dedicated-sessions\\n",\n'
        '  "utf8",\n'
        ");\n"
    )
    assert _scan(text, ".ts") == []


def test_the_mode_values_are_caught():
    assert "verification-mode-value" in _scan("mode: dedicated-sessions\n", ".yaml")
    assert "verification-mode-value" in _scan("mode: out-of-band-or-none\n", ".yaml")


@pytest.mark.parametrize(
    ("text", "suffix"),
    [
        ("from dedicated_verification import gate\n", ".py"),
        ("import external_verification\n", ".py"),
        ("from .pending_verification import banner\n", ".py"),
        ("MIGRATORS = ['migrate_lightweight_to_canonical_v4']\n", ".py"),
        ("```bash\npython -m ai_router.change_verification_mode\n```\n", ".md"),
    ],
)
def test_referencing_a_deleted_module_is_caught(text: str, suffix: str):
    assert "deleted-module-referenced" in _scan(text, suffix)


def test_a_returned_module_file_is_caught(tmp_path: Path):
    (tmp_path / "ai_router").mkdir()
    (tmp_path / "ai_router" / "dedicated_verification.py").write_text(
        "# it's back\n", encoding="utf-8"
    )
    rules = [v.rule for v in guard.check_deleted_files_stay_deleted(tmp_path)]
    assert rules == ["deleted-file-returned"]


def test_a_returned_fixture_tree_is_caught(tmp_path: Path):
    (tmp_path / "test-fixtures" / "cold-start" / "lightweight").mkdir(parents=True)
    rules = [v.rule for v in guard.check_deleted_files_stay_deleted(tmp_path)]
    assert rules == ["deleted-file-returned"]


# ---------------------------------------------------------------------------
# The other half: narration must survive
#
# Each case below is a real line from this repo, or a close paraphrase.
# ---------------------------------------------------------------------------


def test_the_migration_message_does_not_trip_the_gate():
    """The message opens with the exact six characters the YAML entry does.

    `tier: lightweight was removed in Set 112 -- there is one tier now.`
    A gate that flagged its own error message would be self-defeating.
    """
    text = (
        'LIGHTWEIGHT_REMOVED_MESSAGE = (\n'
        '    "tier: lightweight was removed in Set 112 -- there is one tier now. "\n'
        '    "Fix: set tier: full, or delete the line."\n'
        ')\n'
    )
    assert _scan(text, ".py") == []


def test_a_docstring_explaining_the_removal_survives():
    text = (
        '"""Set 112 deleted dedicated_verification and external_verification.\n'
        "\n"
        "The verificationMode field went with them; tier: lightweight now\n"
        'raises at the boundary.\n'
        '"""\n'
        "VALUE = 1\n"
    )
    assert _scan(text, ".py") == []


def test_a_python_comment_explaining_the_removal_survives():
    text = (
        "# Set 112: the dedicated-sessions gate lived here. verificationMode\n"
        "# and tier: lightweight are both gone.\n"
        "VALUE = 1\n"
    )
    assert _scan(text, ".py") == []


def test_a_typescript_comment_explaining_the_removal_survives():
    text = (
        "// Set 112 S2: `tier` and `verificationMode` are gone with the\n"
        "// Lightweight tier. A spec declaring `tier: lightweight` is refused.\n"
        "/* dedicated_verification.read_latest_issues_envelope is deleted. */\n"
        "const x = 1;\n"
    )
    assert _scan(text, ".ts") == []


def test_markdown_prose_about_the_removal_survives():
    text = (
        "> **Read this if any `spec.md` declares `tier: lightweight`.**\n"
        "\n"
        "The `verificationMode` field and its `dedicated-sessions` /\n"
        "`out-of-band-or-none` modes are deleted. Run\n"
        "`ai_router.migrate_lightweight_to_canonical_v4`? No - it is gone too.\n"
    )
    assert _scan(text, ".md") == []


def test_a_fenced_block_quoting_the_migration_message_survives():
    """The removal notice reproduces the error verbatim, inside a fence."""
    text = (
        "```\n"
        "tier: lightweight was removed in Set 112 -- there is one tier now. "
        "Fix: set tier: full.\n"
        "```\n"
    )
    assert _scan(text, ".md") == []


def test_a_test_that_plants_the_tier_in_a_string_survives():
    """`test_lightweight_removal_boundary.py`'s pattern, which must keep working."""
    text = 'd = _make_set(tmp_path, "tier: lightweight\\nrequiresUAT: false")\n'
    assert _scan(text, ".py") == []


def test_tests_that_plant_quoted_and_commented_variants_survive():
    """`test_spec_config.py`'s parameterisations, likewise.

    These are the tests that PROVE the refusal fires. A bare `tier:` key
    mid-line is how test code carries a spec fragment; only the fully
    quoted JSON shape counts as an embedded declaration.
    """
    text = (
        "for raw in ('tier: \"lightweight\"', \"tier: 'lightweight'\"):\n"
        '    body = _config_block("tier: lightweight  # operator-locked at S1")\n'
    )
    assert _scan(text, ".py") == []


def test_a_url_is_not_mistaken_for_a_comment():
    """The JS blanker is quote-aware; `//` inside a string is not a comment."""
    text = 'const u = "https://x/y"; const m = {verificationMode: 1};\n'
    assert "verification-mode-field" in _scan(text, ".ts")


def test_a_quoted_hash_is_not_mistaken_for_a_yaml_comment():
    text = "note: \"a # sign\"\nverificationMode: dedicated-sessions\n"
    assert "verification-mode-field" in _scan(text, ".yaml")


def test_a_tier_full_declaration_is_not_a_resurrection():
    """Consumer repos hold hundreds of `tier: full` lines; they are legal."""
    assert _scan("```yaml\ntier: full\n```\n", ".md") == []


# ---------------------------------------------------------------------------
# The escapes stay narrow
# ---------------------------------------------------------------------------


def test_the_self_exemption_is_exactly_the_gates_own_two_files():
    """Pinned so the escape cannot grow into a general allowlist."""
    assert guard.SELF_EXEMPT == frozenset(
        {
            "ai_router/scripts/lightweight_resurrection_guard.py",
            "ai_router/tests/test_lightweight_resurrection_guard.py",
        }
    )
    root = _repo_root()
    for rel in guard.SELF_EXEMPT:
        assert (root / Path(rel)).is_file(), rel


def test_exactly_one_file_claims_the_frozen_history_marker():
    """Pinned for the same reason. Growth here is a review conversation."""
    assert guard.find_frozen_history(_repo_root()) == [
        "docs/cross-repo-lightweight-notice.md"
    ]


def test_the_frozen_marker_only_counts_near_the_top():
    """A marker buried at the bottom of a live doc must not silence it."""
    buried = "\n".join(["filler"] * 60) + f"\n{guard.FROZEN_HISTORY_MARKER}\n"
    assert not guard.declares_frozen_history(buried)
    assert guard.declares_frozen_history(f"# Title\n\n{guard.FROZEN_HISTORY_MARKER}\n")


def test_frozen_history_only_silences_markdown(tmp_path: Path):
    """The marker is a doc affordance; code cannot buy its way out with it."""
    code = tmp_path / "thing.py"
    code.write_text(
        f"# {guard.FROZEN_HISTORY_MARKER}\nimport dedicated_verification\n",
        encoding="utf-8",
    )
    violations = guard.check_no_live_declarations(tmp_path)
    assert [v.rule for v in violations] == ["deleted-module-referenced"]


# ---------------------------------------------------------------------------
# Fail-closed behaviour
# ---------------------------------------------------------------------------


def test_an_untokenizable_python_file_is_scanned_whole_not_skipped():
    """A tokenizer failure must never be a silent pass.

    The file below has an unterminated string, so `tokenize` raises. The
    blanker returns the source unchanged, which means the declaration is
    still seen -- fail CLOSED. The cost is a possible false positive on a
    genuinely broken file, which is the right trade for a gate.
    """
    text = 'x = "unterminated\nverificationMode: 1\n'
    assert "verification-mode-field" in _scan(text, ".py")


def test_the_cli_returns_nonzero_on_a_planted_resurrection(tmp_path: Path, capsys):
    (tmp_path / "conf.yaml").write_text("tier: lightweight\n", encoding="utf-8")
    rc = guard.main(["--repo-root", str(tmp_path)])
    assert rc == 1
    out = capsys.readouterr().out
    assert "tier-declared" in out
    assert "cross-repo-lightweight-removal-notice.md" in out


def test_the_cli_returns_zero_on_a_clean_tree(tmp_path: Path, capsys):
    (tmp_path / "conf.yaml").write_text("tier: full\n", encoding="utf-8")
    assert guard.main(["--repo-root", str(tmp_path)]) == 0
    assert "the tier stays removed" in capsys.readouterr().out


def test_the_output_is_ascii_only(capsys):
    """L-079-1: this runs on a Windows cp1252 console in CI and locally."""
    guard.main(["--repo-root", str(_repo_root())])
    captured = capsys.readouterr().out
    captured.encode("cp1252")
    assert captured.isascii()
