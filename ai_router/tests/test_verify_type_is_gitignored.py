"""Set 124 S1 falsifiers for the repo-hygiene half of the verify-type rule.

Operator ruling, 2026-08-12, correcting Set 123: ``project-verify-type.txt``
is **machine/project** state -- "this project, on THIS machine" -- so it must
never be committed. Set 123 shipped it as committed project configuration and
said so in `verify_type.py`, the docs and the consumer template.

Per L-112-1 (a gate that only ever passes proves nothing), a ``.gitignore``
line is exactly the kind of rule that is indistinguishable from a no-op by
reading it. Reviewing the pattern reads as confirmation; only a **planted**
file separates "ignores the right thing" from "ignores everything" and from
"ignores nothing". So both directions are planted here:

- **The rule fires.** A project-root ``project-verify-type.txt`` is ignored.
- **The rule does not fire indiscriminately.** A *nested* look-alike is NOT
  ignored. The pattern is anchored (``/project-verify-type.txt``) because
  :func:`verify_type.find_project_file` reads the project-root copy and
  nothing else, so an unanchored rule would buy no safety while silently
  swallowing a fixture a future test means to commit.

Plus the migration hazard that no pattern can fix: a ``.gitignore`` entry has
**no effect on an already-tracked file**. A repo that committed the file
before the rule existed keeps publishing one seat's answer to every clone,
and the rule above would look perfectly healthy while it happened. That is
asserted structurally against this repo's real index.

The planting is done in a throwaway git repo seeded with this repo's REAL
``.gitignore``, never in the working tree: the working tree's own
``project-verify-type.txt`` is live machine state this suite must not clobber.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

import verify_type as vt  # type: ignore[import-not-found]

REPO_ROOT = Path(__file__).resolve().parents[2]
REPO_GITIGNORE = REPO_ROOT / ".gitignore"


def _git(*args: str, cwd: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def _require_git() -> None:
    """Fail loudly rather than skip when git is missing but a checkout exists.

    A silent skip is the failure mode this whole module exists to prevent
    (L-112-1). The one legitimate not-applicable case is a source tree with
    no ``.git`` at all -- an unpacked wheel or sdist -- where there is no
    index to assert about.
    """
    if not (REPO_ROOT / ".git").exists():
        pytest.skip("not a git checkout (unpacked sdist/wheel); no index to assert on")
    if subprocess.run(
        ["git", "--version"], capture_output=True
    ).returncode != 0:  # pragma: no cover - git is present in CI and dev
        pytest.fail("git is required to falsify the ignore rule, and is not runnable")


@pytest.fixture()
def seeded_repo(tmp_path: Path) -> Path:
    """A throwaway git repo carrying this repo's real ``.gitignore``.

    Seeding from the real file is the point: a copy of the *pattern* would
    test the test's idea of the rule, not the rule that ships.
    """
    _require_git()
    root = tmp_path / "seeded"
    (root / "docs" / "session-sets" / "999-fixture").mkdir(parents=True)
    assert _git("init", "-q", str(root), cwd=tmp_path).returncode == 0
    (root / ".gitignore").write_text(
        REPO_GITIGNORE.read_text(encoding="utf-8"), encoding="utf-8"
    )
    return root


def _is_ignored(repo: Path, relpath: str) -> bool:
    """True when git itself says the path is ignored -- not our regex opinion."""
    return _git("check-ignore", "-q", "--", relpath, cwd=repo).returncode == 0


# ---------------------------------------------------------------------------
# The rule fires
# ---------------------------------------------------------------------------


def test_a_planted_project_root_verify_type_file_is_ignored(seeded_repo: Path):
    """Plant the real defect: a seat's answer sitting at the project root,
    one `git add -A` away from being published to every clone."""
    planted = seeded_repo / vt.PROJECT_FILE_NAME
    planted.write_text(f"{vt.COPILOT_CLI}\n", encoding="utf-8")

    assert _is_ignored(seeded_repo, vt.PROJECT_FILE_NAME), (
        f"{vt.PROJECT_FILE_NAME} at the project root is NOT ignored -- a "
        "Copilot seat's COPILOT_CLI would be committed onto teammates who "
        "hold DABBLER_* keys and need DIRECT_API"
    )

    status = _git("status", "--porcelain", "--untracked-files=all", cwd=seeded_repo)
    assert vt.PROJECT_FILE_NAME not in status.stdout, (
        "the planted file still surfaces as an addable change: "
        f"{status.stdout!r}"
    )


def test_git_add_all_cannot_stage_the_planted_file(seeded_repo: Path):
    """The failure mode in the shape it actually happens: nobody types the
    filename, they type `git add -A`."""
    (seeded_repo / vt.PROJECT_FILE_NAME).write_text(
        f"{vt.DIRECT_API}\n", encoding="utf-8"
    )
    (seeded_repo / "kept.txt").write_text("tracked\n", encoding="utf-8")

    assert _git("add", "-A", cwd=seeded_repo).returncode == 0
    staged = _git("diff", "--cached", "--name-only", cwd=seeded_repo).stdout.split()

    assert "kept.txt" in staged, "the fixture staged nothing; the assertion below is vacuous"
    assert vt.PROJECT_FILE_NAME not in staged


# ---------------------------------------------------------------------------
# The rule does not fire indiscriminately
# ---------------------------------------------------------------------------


def test_a_nested_look_alike_is_not_ignored(seeded_repo: Path):
    """The legitimate look-alike. An unanchored pattern would swallow this
    and read exactly as healthy -- which is the whole reason the anchored
    form was chosen."""
    nested = "docs/session-sets/999-fixture/" + vt.PROJECT_FILE_NAME
    (seeded_repo / nested).write_text(f"{vt.DIRECT_API}\n", encoding="utf-8")

    assert not _is_ignored(seeded_repo, nested), (
        "a nested project-verify-type.txt is ignored, so the rule is matching "
        "by basename at any depth; a committed test fixture would vanish "
        "silently"
    )


def test_the_suite_is_isolated_from_this_machines_verify_type():
    """Set 124 S1. The conftest guard must cover BOTH resolution seams.

    ``resolve_verify_type`` goes through ``find_project_file``;
    ``derive_transport_profile`` -- the one ``load_config`` actually calls --
    does not, it walks ``find_project_root`` and builds the path itself. A
    guard covering only the first looks like a fix while the dispatch path
    still reads the developer's file, which is exactly the mistake this
    session made once: 11 tests kept failing (and kept making real Copilot
    CLI calls, 380s vs 52s) after the first patch.

    Asserted from inside the suite, where the guard is active, against a
    config that explicitly declares ``api``. Before the guard this returned
    ``copilot-cli`` on this machine.
    """
    import verify_type as vt_mod  # local: the patched module identity

    assert vt_mod.find_project_root(REPO_ROOT) is None
    assert vt_mod.find_project_file(REPO_ROOT) is None

    derivation = vt_mod.derive_transport_profile(
        {"transport": {"profile": "api"}}, anchors=(REPO_ROOT, None)
    )
    assert derivation.profile == "api"
    assert derivation.project_file is None


def test_the_committed_project_wide_default_is_still_committable(seeded_repo: Path):
    """The other look-alike: the rule must not have reached the project-wide
    default it deliberately leaves committed."""
    (seeded_repo / "ai_router").mkdir(parents=True, exist_ok=True)
    (seeded_repo / "ai_router" / "router-config.yaml").write_text(
        "transport:\n  profile: api\n", encoding="utf-8"
    )
    assert not _is_ignored(seeded_repo, "ai_router/router-config.yaml")


# ---------------------------------------------------------------------------
# STRUCTURAL: the hazard no pattern can fix
# ---------------------------------------------------------------------------


def test_this_repo_does_not_track_the_verify_type_file():
    """A ``.gitignore`` entry does nothing to a file already in the index.

    This is the consumer-migration hazard (`git rm --cached`), and it is
    asserted against this repo's REAL index rather than a fixture, because a
    fixture cannot regress and this can.
    """
    _require_git()
    tracked = _git("ls-files", "--", vt.PROJECT_FILE_NAME, cwd=REPO_ROOT).stdout.strip()
    assert tracked == "", (
        f"{vt.PROJECT_FILE_NAME} is TRACKED in this repo. The ignore rule has "
        "no effect on an already-indexed file -- run `git rm --cached "
        f"{vt.PROJECT_FILE_NAME}`"
    )


def test_the_real_gitignore_carries_the_anchored_rule():
    """Structural companion to the planted tests: the shipped rule is the
    anchored form, so the nested-look-alike guarantee holds however the
    planting fixture is later refactored."""
    lines = [
        line.strip()
        for line in REPO_GITIGNORE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    assert f"/{vt.PROJECT_FILE_NAME}" in lines
    assert vt.PROJECT_FILE_NAME not in lines, (
        "an unanchored duplicate would re-introduce the basename match the "
        "anchored rule exists to avoid"
    )
