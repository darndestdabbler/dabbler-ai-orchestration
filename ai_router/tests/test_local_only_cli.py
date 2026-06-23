"""Tests for the ``ai_router.local_only`` CLI (Set 076 Session 2).

The CLI is the blessed enable / disable / inspect surface for the
``.dabbler/local-only`` marker that :mod:`gate_checks` consults. These tests
exercise the pure helpers (idempotency, the audit note, status reading) and the
``main()`` argument surface, plus the integration invariant that an enabled
marker is exactly what :func:`gate_checks.is_local_only` recognizes.
"""
import os

import pytest

import gate_checks
import local_only


# --- pure helpers ------------------------------------------------------------


def test_marker_path_matches_gate_contract(tmp_path):
    # The CLI must target the same relative path the gate reads.
    assert local_only.marker_path(str(tmp_path)) == os.path.join(
        str(tmp_path), gate_checks._LOCAL_ONLY_MARKER
    )


def test_enable_creates_marker_and_dabbler_dir(tmp_path):
    repo = str(tmp_path)
    assert not os.path.isdir(os.path.join(repo, ".dabbler"))

    changed, path = local_only.enable_local_only(repo, reason="remote-less by design")

    assert changed is True
    assert os.path.isfile(path)
    # The marker is exactly what the gate recognizes.
    assert gate_checks.is_local_only(repo) is True
    # The audit note carries the reason and the enable provenance.
    body = open(path, encoding="utf-8").read()
    assert "remote-less by design" in body
    assert "enabled_by: ai_router.local_only --enable" in body
    assert "enabled_at:" in body


def test_enable_is_idempotent_and_preserves_original_note(tmp_path):
    repo = str(tmp_path)
    changed1, path = local_only.enable_local_only(repo, reason="first reason")
    original = open(path, encoding="utf-8").read()

    # Re-enabling with a different reason is a no-op that does NOT clobber the
    # recorded audit note.
    changed2, path2 = local_only.enable_local_only(repo, reason="second reason")

    assert changed1 is True
    assert changed2 is False
    assert path2 == path
    assert open(path, encoding="utf-8").read() == original
    assert "second reason" not in original


def test_enable_without_reason_records_placeholder(tmp_path):
    repo = str(tmp_path)
    _changed, path = local_only.enable_local_only(repo)
    body = open(path, encoding="utf-8").read()
    assert "reason: (none given)" in body


def test_disable_removes_marker_idempotently(tmp_path):
    repo = str(tmp_path)
    local_only.enable_local_only(repo)
    assert gate_checks.is_local_only(repo) is True

    changed1, _path = local_only.disable_local_only(repo)
    assert changed1 is True
    assert gate_checks.is_local_only(repo) is False

    # Second disable is a no-op.
    changed2, _path = local_only.disable_local_only(repo)
    assert changed2 is False


def test_disable_leaves_dabbler_dir_for_sibling_markers(tmp_path):
    repo = str(tmp_path)
    local_only.enable_local_only(repo)
    # Simulate the extension's sibling marker living in the same dir.
    sibling = os.path.join(repo, ".dabbler", "install-method")
    open(sibling, "w", encoding="utf-8").write("marketplace")

    local_only.disable_local_only(repo)

    assert os.path.isdir(os.path.join(repo, ".dabbler"))
    assert os.path.isfile(sibling)


def test_read_marker_note_absent_returns_none(tmp_path):
    assert local_only.read_marker_note(str(tmp_path)) is None


def test_read_marker_note_present_returns_body(tmp_path):
    repo = str(tmp_path)
    local_only.enable_local_only(repo, reason="audit me")
    note = local_only.read_marker_note(repo)
    assert note is not None
    assert "audit me" in note


# --- main() CLI surface ------------------------------------------------------


def test_main_enable_then_status_then_disable(tmp_path, capsys):
    repo = str(tmp_path)

    rc = local_only.main(["--enable", "--reason", "x", "--repo-root", repo])
    assert rc == 0
    assert gate_checks.is_local_only(repo) is True
    out = capsys.readouterr().out
    assert "local-only enabled" in out

    rc = local_only.main(["--status", "--repo-root", repo])
    assert rc == 0
    out = capsys.readouterr().out
    assert "present" in out

    rc = local_only.main(["--disable", "--repo-root", repo])
    assert rc == 0
    assert gate_checks.is_local_only(repo) is False
    out = capsys.readouterr().out
    assert "disabled" in out


def test_main_status_on_absent_marker(tmp_path, capsys):
    rc = local_only.main(["--status", "--repo-root", str(tmp_path)])
    assert rc == 0
    out = capsys.readouterr().out
    assert "absent" in out


def test_main_requires_an_action(tmp_path):
    # The mutually-exclusive group is required: no action exits 2 (argparse).
    with pytest.raises(SystemExit) as exc:
        local_only.main(["--repo-root", str(tmp_path)])
    assert exc.value.code == 2


def test_main_actions_are_mutually_exclusive(tmp_path):
    with pytest.raises(SystemExit) as exc:
        local_only.main(["--enable", "--disable", "--repo-root", str(tmp_path)])
    assert exc.value.code == 2


def test_main_status_ascii_only_output(tmp_path, capsys):
    # Project Code Style convention: CLI console output is ASCII-only so a
    # Windows cp1252 console cannot crash mid-line.
    repo = str(tmp_path)
    local_only.enable_local_only(repo, reason="check encoding")
    local_only.main(["--status", "--repo-root", repo])
    out = capsys.readouterr().out
    out.encode("cp1252")  # raises if a non-cp1252 glyph slipped in


def test_main_output_ascii_safe_with_non_ascii_reason(tmp_path, capsys):
    # A non-ASCII --reason must NOT make console output crash a cp1252 console,
    # while the marker FILE preserves the reason as UTF-8 (console ASCII / file
    # UTF-8 -- both halves of the Code Style convention).
    repo = str(tmp_path)
    reason = "remote-less café — naïve façade — \U0001f512"
    _changed, path = local_only.enable_local_only(repo, reason=reason)

    # The marker file keeps the reason verbatim (UTF-8), un-mangled.
    assert reason in open(path, encoding="utf-8").read()

    # --status echoes the marker contents (incl. the reason); its console output
    # must still be strict ASCII so a cp1252 console cannot crash.
    local_only.main(["--status", "--repo-root", repo])
    out = capsys.readouterr().out
    out.encode("ascii")  # strict ASCII: raises if any non-ASCII leaked through
    # The reason is shown escaped (backslashreplace), not raw.
    assert "caf\\xe9" in out
