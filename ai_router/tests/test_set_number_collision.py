"""Duplicate session-set numbers are refused before the work starts (Set 122 S4).

Verdict §6.4 asks developers to reserve set numbers in chat before
scaffolding. That is a convention, and the spec's judgement is that *"a
check that refuses the collision is worth more than a convention nobody
remembers"*. `resolve_set` already treated the collision as a bug — but
only at **address** time, which reports it after the work is done.

The refusal is wired into the two product paths where a collision is
actually visible: `start_session` (the mandated first on-disk action of
every session, so "before the work starts") and `drift_guard.py`, which
CI runs as a fast gate. The module-lifecycle scaffolder deliberately does
**not** call it — its numbering mints `max(existing) + 1` from a live
listing and so cannot self-collide, which would make a refusal there one
that could only ever pass (see
`test_create_never_mints_a_number_another_set_already_holds`).

Per L-112-1 every refusal below is paired with the legitimate look-alike
it must NOT fire on. A collision check that also refused an idempotent
re-run would be worse than no check: it would break retryability to
prevent nothing.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

import pytest

from ai_router import resolve_set as rs


def _mkset(root, name: str):
    directory = os.path.join(str(root), name)
    os.makedirs(directory, exist_ok=True)
    return directory


@pytest.fixture
def scan_root(tmp_path):
    root = tmp_path / "session-sets"
    root.mkdir()
    _mkset(root, "001-first")
    _mkset(root, "002-second")
    _mkset(root, "harvester-cli")  # no numeric prefix: predates the convention
    _mkset(root, "_archived")
    return str(root)


# --- detection ---------------------------------------------------------------


def test_a_clean_repo_reports_no_collisions(scan_root):
    assert rs.find_collisions(scan_root) == {}
    rs.assert_no_collisions(scan_root)


def test_a_duplicate_number_is_detected(scan_root):
    _mkset(scan_root, "002-second-again")
    assert rs.find_collisions(scan_root) == {2: ["002-second", "002-second-again"]}
    with pytest.raises(rs.SetCollisionError):
        rs.assert_no_collisions(scan_root)


def test_leading_zeros_do_not_hide_a_collision(scan_root):
    """`2-x` and `002-y` are the same number, however they are typed."""
    _mkset(scan_root, "2-second-unpadded")
    assert 2 in rs.find_collisions(scan_root)


def test_a_bare_descriptive_slug_is_not_a_collision(scan_root):
    """The look-alike: unnumbered dirs predate the convention, not a bug."""
    _mkset(scan_root, "another-bare-slug")
    assert rs.find_collisions(scan_root) == {}


def test_underscore_directories_are_not_collisions(scan_root):
    """`_archived/002-second` style holding pens are deliberately skipped."""
    _mkset(scan_root, "_archived-002-second")
    assert rs.find_collisions(scan_root) == {}


def test_the_report_names_both_sides(scan_root):
    _mkset(scan_root, "002-second-again")
    text = rs.describe_collisions(scan_root, rs.find_collisions(scan_root))
    assert "002-second" in text and "002-second-again" in text
    assert text.isascii(), "operator-facing CLI text must be cp1252-safe"


# --- assert_number_available -------------------------------------------------


def test_a_free_number_is_available(scan_root):
    rs.assert_number_available(scan_root, 3)


def test_a_taken_number_is_refused(scan_root):
    with pytest.raises(rs.SetCollisionError, match="already taken"):
        rs.assert_number_available(scan_root, 2)


def test_a_set_does_not_collide_with_itself(scan_root):
    """The look-alike that matters most: an idempotent re-scaffold.

    Passing the slug about to be minted means a re-run over an existing
    directory is not reported as a collision with itself. Without this
    the refusal would make every retryable scaffolder un-retryable —
    trading a real conflict for a worse one.
    """
    rs.assert_number_available(scan_root, 2, slug="002-second")


def test_a_different_slug_on_the_same_number_is_still_refused(scan_root):
    with pytest.raises(rs.SetCollisionError):
        rs.assert_number_available(scan_root, 2, slug="002-something-else")


# --- the CLI sweep -----------------------------------------------------------


def _cli(args, cwd=None):
    return subprocess.run(
        [sys.executable, "-m", "ai_router.resolve_set", *args],
        capture_output=True,
        text=True,
        cwd=cwd or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    )


def test_cli_check_is_clean_on_a_well_formed_root(scan_root):
    result = _cli(["--check", "--scan", scan_root])
    assert result.returncode == 0, result.stderr
    # L-112-1: the corpus size is printed, so a scan that examined
    # nothing cannot read as a clean bill of health.
    assert "2 numbered session set(s)" in result.stdout


def test_cli_check_exits_3_on_a_collision(scan_root):
    _mkset(scan_root, "002-second-again")
    result = _cli(["--check", "--scan", scan_root])
    assert result.returncode == 3
    assert "002-second-again" in result.stderr


def test_cli_check_json_reports_the_corpus_and_the_collisions(scan_root):
    _mkset(scan_root, "002-second-again")
    result = _cli(["--check", "--scan", scan_root, "--json"])
    payload = json.loads(result.stdout)
    assert payload["numbered"] == 2
    assert payload["collisions"] == {"2": ["002-second", "002-second-again"]}


def test_this_repo_has_no_duplicate_set_numbers():
    """The sweep, run against the real tree.

    A dogfood rather than a fixture: the check is only worth shipping if
    the repo it ships from passes it.
    """
    repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    scan = os.path.join(repo, "docs", "session-sets")
    collisions = rs.find_collisions(scan)
    assert collisions == {}, rs.describe_collisions(scan, collisions)
    assert len(rs.index_by_prefix(scan)) > 50, "the sweep examined an empty corpus"


# --- start_session refuses before the work starts ----------------------------


def _fake_set(tmp_path, slug: str):
    directory = tmp_path / "docs" / "session-sets" / slug
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "spec.md").write_text("# Spec\n", encoding="utf-8")
    return directory


def test_start_session_refuses_a_duplicate_numbered_set(tmp_path):
    from ai_router import start_session as ss

    _fake_set(tmp_path, "123-alpha")
    _fake_set(tmp_path, "123-beta")
    message = ss._refuse_duplicate_set_number(
        str(tmp_path / "docs" / "session-sets" / "123-alpha")
    )
    assert message is not None
    assert "123-beta" in message


def test_start_session_allows_a_unique_numbered_set(tmp_path):
    from ai_router import start_session as ss

    _fake_set(tmp_path, "123-alpha")
    _fake_set(tmp_path, "124-beta")
    assert (
        ss._refuse_duplicate_set_number(
            str(tmp_path / "docs" / "session-sets" / "123-alpha")
        )
        is None
    )


def test_start_session_allows_an_unnumbered_set(tmp_path):
    """A legacy descriptive slug must still be startable."""
    from ai_router import start_session as ss

    _fake_set(tmp_path, "harvester-cli-distribution")
    assert (
        ss._refuse_duplicate_set_number(
            str(tmp_path / "docs" / "session-sets" / "harvester-cli-distribution")
        )
        is None
    )


def test_start_session_is_not_blocked_by_an_unrelated_collision(tmp_path):
    """Scoped to this set's number, deliberately.

    Refusing to register `124-mine` because `087-a` and `087-b` collide
    elsewhere would block work that has nothing to do with the bug. The
    repo-wide sweep is a separate entry point on purpose.
    """
    from ai_router import start_session as ss

    _fake_set(tmp_path, "087-a")
    _fake_set(tmp_path, "087-b")
    _fake_set(tmp_path, "124-mine")
    assert (
        ss._refuse_duplicate_set_number(
            str(tmp_path / "docs" / "session-sets" / "124-mine")
        )
        is None
    )
