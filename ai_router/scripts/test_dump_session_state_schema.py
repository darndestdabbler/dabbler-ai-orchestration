"""Unit tests for the session-state.json schema-example generator.

Set 004 / Session 4 replaces the practice of committing a hand-edited
example with a generator that produces a fresh example from the live
schema, plus a drift check against the committed reference at
``docs/session-state-schema-example.json``.

Test coverage:

  * ``build_example_state()`` produces a dict that round-trips through
    :func:`session_state.read_session_state` (so the example is a valid
    on-disk artifact, not just a documentation prop).
  * Every v2 schema field is present and has a non-null,
    non-placeholder value where the schema permits one.
  * ``format_example`` is byte-deterministic across calls (drift check
    requires exact equality).
  * ``--include-comments`` emits JSONC that strict ``json.loads`` rejects.
  * The committed reference matches the generator output (drift check
    passes today).
  * ``run_check`` returns 0 on match, 1 on byte mismatch, 1 on a
    missing reference, and prints the regeneration hint to stderr in
    both failure cases.
  * The CLI honors ``--write``, ``--include-comments``, and ``--check``.
"""

from __future__ import annotations

import io
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

# conftest puts ai_router/ on sys.path
import dump_session_state_schema  # noqa: E402
from dump_session_state_schema import (  # noqa: E402
    REFERENCE_PATH,
    _FIELD_COMMENTS,
    build_example_state,
    format_example,
    main,
    run_check,
)
from session_state import (  # noqa: E402
    SCHEMA_VERSION,
    SessionLifecycleState,
    read_session_state,
    validate_next_orchestrator,
)


# --------------------------------------------------------------------
# build_example_state
# --------------------------------------------------------------------


class TestBuildExampleState:
    def test_schema_version_matches_live_constant(self):
        state = build_example_state()
        assert state["schemaVersion"] == SCHEMA_VERSION

    def test_lifecycle_state_uses_live_enum_value(self):
        state = build_example_state()
        # Must be one of the live enum values, not a hand-typed string —
        # if the enum is renamed, this test fails before the example
        # silently goes stale.
        assert state["lifecycleState"] in {
            s.value for s in SessionLifecycleState
        }

    def test_all_top_level_keys_present(self):
        state = build_example_state()
        expected = {
            "schemaVersion",
            "sessionSetName",
            "currentSession",
            "totalSessions",
            "status",
            "lifecycleState",
            "startedAt",
            "completedAt",
            "verificationVerdict",
            "orchestrator",
            "nextOrchestrator",
        }
        assert set(state.keys()) == expected

    def test_orchestrator_block_is_complete(self):
        block = build_example_state()["orchestrator"]
        assert set(block.keys()) == {"engine", "provider", "model", "effort"}
        assert all(isinstance(v, str) and v for v in block.values())

    def test_next_orchestrator_passes_live_validator(self):
        # The next-orchestrator rubric in session_state.py has a 30-char
        # minimum on reason.specifics and a fixed reason.code enum. The
        # generator must produce a value that the live validator accepts
        # — otherwise we are documenting an invalid example.
        candidate = build_example_state()["nextOrchestrator"]
        passed, errors = validate_next_orchestrator(candidate)
        assert passed, f"validator rejected example: {errors}"

    def test_no_null_completion_fields(self):
        # The example documents the *closed* shape (mark_session_complete
        # has flipped it). Both fields must be non-null so a reader sees
        # what the closed envelope looks like, not the in-progress one.
        state = build_example_state()
        assert state["completedAt"] is not None
        assert state["verificationVerdict"] is not None

    def test_returned_dict_is_independent_per_call(self):
        # Mutation safety: callers that edit the result must not affect
        # subsequent calls. The generator is a small surface but the
        # dict-of-dicts shape makes shared-reference bugs easy.
        a = build_example_state()
        b = build_example_state()
        a["orchestrator"]["model"] = "mutated"
        a["nextOrchestrator"]["reason"]["code"] = "other"
        assert b["orchestrator"]["model"] != "mutated"
        assert b["nextOrchestrator"]["reason"]["code"] != "other"


# --------------------------------------------------------------------
# format_example — JSON form
# --------------------------------------------------------------------


class TestFormatExampleJson:
    def test_is_valid_json(self):
        rendered = format_example(build_example_state())
        parsed = json.loads(rendered)
        assert parsed["schemaVersion"] == SCHEMA_VERSION

    def test_is_byte_deterministic(self):
        # Drift check requires exact-byte equality across calls. Two
        # successive renders MUST be identical — any nondeterminism
        # (set ordering, dict reordering, locale-dependent formatting)
        # would make the check flap.
        a = format_example(build_example_state())
        b = format_example(build_example_state())
        assert a == b

    def test_ends_with_newline(self):
        rendered = format_example(build_example_state())
        assert rendered.endswith("\n")
        # Exactly one trailing newline (avoid drift from text editors
        # that strip-or-add).
        assert not rendered.endswith("\n\n")

    def test_indent_is_two_spaces(self):
        rendered = format_example(build_example_state())
        # Sample a known nested key. ``orchestrator`` is at depth 1, so
        # its inner ``"engine"`` line begins with four spaces.
        assert any(
            line.startswith('    "engine":') for line in rendered.splitlines()
        )

    def test_round_trips_through_read_session_state(self, tmp_path):
        # Write the rendered example to a session-set directory and
        # confirm the live read function returns an equivalent dict.
        # This is the strongest portability guarantee: anyone copying
        # the example into a new session set has a file the rest of the
        # toolchain accepts.
        rendered = format_example(build_example_state())
        (tmp_path / "session-state.json").write_text(rendered, encoding="utf-8")
        reloaded = read_session_state(str(tmp_path))
        assert reloaded == build_example_state()


# --------------------------------------------------------------------
# format_example — JSONC form
# --------------------------------------------------------------------


class TestFormatExampleJsonc:
    def test_contains_double_slash_comments(self):
        rendered = format_example(
            build_example_state(), include_comments=True
        )
        assert "// " in rendered

    def test_strict_json_loads_rejects_jsonc(self):
        # JSONC is for humans only — strict json.loads must fail. If
        # this ever passes, comments are not actually being inserted
        # (which would be a silent regression).
        rendered = format_example(
            build_example_state(), include_comments=True
        )
        with pytest.raises(json.JSONDecodeError):
            json.loads(rendered)

    def test_each_top_level_key_has_a_comment(self):
        # Every top-level field should carry an explanatory comment in
        # the JSONC form. If a new schema field is added without a
        # corresponding _FIELD_COMMENTS entry, this test surfaces it.
        rendered = format_example(
            build_example_state(), include_comments=True
        )
        for key in build_example_state().keys():
            # The comment line precedes the key. We just need to confirm
            # that *some* ``//`` line appears immediately before each
            # top-level ``  "key":`` line.
            lines = rendered.splitlines()
            for i, line in enumerate(lines):
                if re.match(rf'^  "{re.escape(key)}":', line):
                    assert i > 0
                    assert lines[i - 1].lstrip().startswith("//"), (
                        f"top-level key {key!r} has no preceding "
                        f"// comment in JSONC output"
                    )
                    break
            else:
                pytest.fail(f"top-level key {key!r} not found in rendered JSONC")

    def test_field_comments_table_has_no_stale_entries(self):
        # Cross-provider review (Set 004 / Session 4 verification round
        # 1) flagged that a field removed from the schema would leave
        # its entry behind in _FIELD_COMMENTS unnoticed. Lock that down:
        # every key in the comment table must exist in the live example.
        state_keys = set(build_example_state().keys())
        stale = set(_FIELD_COMMENTS.keys()) - state_keys
        assert not stale, (
            f"_FIELD_COMMENTS has stale entries no longer in the schema: "
            f"{sorted(stale)}. Remove them from dump_session_state_schema.py."
        )

    def test_jsonc_parser_handles_escaped_quote_in_key(self):
        # Cross-provider review (Set 004 / Session 4 verification round
        # 1) Minor finding: the original split('"', 2) parser would
        # mis-split a top-level key containing an escaped quote. None of
        # the live schema keys contain escapes today, but the JSONC
        # injector must not become a constraint on future field names.
        # Synthesize a fake state with one such key and confirm the
        # comment-injection logic still finds it.
        weird_key = 'has"quote'
        weird_state = {weird_key: "value"}
        # Temporarily seed a comment for the weird key so the test
        # actually exercises the lookup path. monkeypatch isn't needed
        # because we assert + restore by hand.
        _FIELD_COMMENTS[weird_key] = "exotic-key comment"
        try:
            rendered = format_example(weird_state, include_comments=True)
            assert "// exotic-key comment" in rendered, (
                "JSONC injector failed to recognize a top-level key "
                "containing an escaped quote"
            )
        finally:
            del _FIELD_COMMENTS[weird_key]

    def test_does_not_inject_comments_into_nested_blocks(self):
        # Nested keys (e.g. ``orchestrator.engine``) live at four-space
        # indent. The JSONC walker must NOT inject comments there —
        # they would clutter without adding information.
        rendered = format_example(
            build_example_state(), include_comments=True
        )
        # Find the line immediately before each four-space-indented key.
        # None of those preceding lines should be a ``//`` comment.
        lines = rendered.splitlines()
        for i, line in enumerate(lines):
            if re.match(r'^    "[^"]+":', line) and i > 0:
                assert not lines[i - 1].lstrip().startswith("//"), (
                    f"unexpected JSONC comment before nested key at line {i}: "
                    f"{line!r}"
                )


# --------------------------------------------------------------------
# Reference file + run_check
# --------------------------------------------------------------------


def _repo_root() -> Path:
    # tests/ lives at <repo>/ai_router/tests; two parents up is the repo root.
    return Path(__file__).resolve().parent.parent.parent


class TestReferenceFile:
    def test_committed_reference_matches_generator(self):
        # If this fails, the schema example has drifted from the
        # generator. Run:
        #   python ai_router/dump_session_state_schema.py --write \
        #     docs/session-state-schema-example.json
        reference = _repo_root() / REFERENCE_PATH
        assert reference.is_file(), (
            f"reference file missing at {reference}; "
            f"run the generator with --write to create it"
        )
        actual = reference.read_text(encoding="utf-8")
        expected = format_example(build_example_state())
        assert actual == expected


class TestRunCheck:
    def test_returns_zero_on_match(self, tmp_path):
        ref_dir = tmp_path / "docs"
        ref_dir.mkdir()
        rendered = format_example(build_example_state())
        (ref_dir / "session-state-schema-example.json").write_text(
            rendered, encoding="utf-8"
        )
        stderr = io.StringIO()
        rc = run_check(repo_root=tmp_path, stderr=stderr)
        assert rc == 0
        assert stderr.getvalue() == ""

    def test_returns_one_on_byte_drift(self, tmp_path):
        ref_dir = tmp_path / "docs"
        ref_dir.mkdir()
        # Tweak any byte — the trailing newline, a field value, anything.
        drifted = format_example(build_example_state()).replace(
            "example-session-set", "drifted-session-set"
        )
        (ref_dir / "session-state-schema-example.json").write_text(
            drifted, encoding="utf-8"
        )
        stderr = io.StringIO()
        rc = run_check(repo_root=tmp_path, stderr=stderr)
        assert rc == 1
        # Operator hint must point at the regeneration command.
        msg = stderr.getvalue()
        assert "DRIFT" in msg
        assert "dump_session_state_schema.py" in msg

    def test_returns_one_on_missing_reference(self, tmp_path):
        # No reference file at all — the most likely failure mode for
        # a fresh checkout where someone forgot to commit it.
        stderr = io.StringIO()
        rc = run_check(repo_root=tmp_path, stderr=stderr)
        assert rc == 1
        assert "missing" in stderr.getvalue()

    def test_uses_cwd_when_repo_root_omitted(self, tmp_path, monkeypatch):
        # CI / pre-commit invoke the CLI with cwd at the repo root;
        # confirm the default behavior matches that contract.
        ref_dir = tmp_path / "docs"
        ref_dir.mkdir()
        (ref_dir / "session-state-schema-example.json").write_text(
            format_example(build_example_state()), encoding="utf-8"
        )
        monkeypatch.chdir(tmp_path)
        stderr = io.StringIO()
        rc = run_check(stderr=stderr)
        assert rc == 0


# --------------------------------------------------------------------
# CLI / main()
# --------------------------------------------------------------------


class TestCli:
    def test_main_prints_to_stdout_by_default(self, capsys):
        rc = main([])
        assert rc == 0
        captured = capsys.readouterr()
        assert json.loads(captured.out)["schemaVersion"] == SCHEMA_VERSION

    def test_main_write_flag_writes_file(self, tmp_path, capsys):
        out_path = tmp_path / "nested" / "example.json"
        rc = main(["--write", str(out_path)])
        assert rc == 0
        # Stdout should be empty; the path confirmation goes to stderr.
        captured = capsys.readouterr()
        assert captured.out == ""
        assert str(out_path) in captured.err
        # File contents match the canonical render.
        assert out_path.read_text(encoding="utf-8") == format_example(
            build_example_state()
        )

    def test_main_include_comments_emits_jsonc(self, capsys):
        rc = main(["--include-comments"])
        assert rc == 0
        captured = capsys.readouterr()
        with pytest.raises(json.JSONDecodeError):
            json.loads(captured.out)

    def test_main_check_returns_zero_when_reference_matches(
        self, tmp_path, monkeypatch, capsys
    ):
        ref_dir = tmp_path / "docs"
        ref_dir.mkdir()
        (ref_dir / "session-state-schema-example.json").write_text(
            format_example(build_example_state()), encoding="utf-8"
        )
        monkeypatch.chdir(tmp_path)
        rc = main(["--check"])
        assert rc == 0

    def test_main_check_returns_one_on_drift(
        self, tmp_path, monkeypatch, capsys
    ):
        ref_dir = tmp_path / "docs"
        ref_dir.mkdir()
        (ref_dir / "session-state-schema-example.json").write_text(
            "{}\n", encoding="utf-8"
        )
        monkeypatch.chdir(tmp_path)
        rc = main(["--check"])
        assert rc == 1
        captured = capsys.readouterr()
        assert "DRIFT" in captured.err

    def test_subprocess_invocation_of_check_against_real_reference(self):
        # End-to-end smoke: shell out to the script the same way CI /
        # pre-commit will. Confirms the __main__ entry point and the
        # sys.path bootstrap both work, and that the committed
        # reference matches the live schema right now.
        script = _repo_root() / "ai_router" / "dump_session_state_schema.py"
        result = subprocess.run(
            [sys.executable, str(script), "--check"],
            cwd=str(_repo_root()),
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, (
            f"--check failed: stdout={result.stdout!r} stderr={result.stderr!r}"
        )
