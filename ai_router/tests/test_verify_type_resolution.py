"""Set 123 S1 falsifiers for the verify-type resolver and the derivation of
``transport.profile`` from it.

Two things are being falsified here, per L-112-1 (a gate that only ever
passes proves nothing):

- **The rule fires.** A project file beats a disagreeing ``transport.profile``
  in *both* directions, including a seat-local ``local-overrides.yaml`` one.
- **The rule does not fire indiscriminately.** With no project file, an
  explicitly configured profile survives untouched, and an *unconfirmed*
  machine default never silently re-routes dispatch. A derivation that
  overrode everything unconditionally would pass the first pair and fail
  this one.

Plus a structural assertion beside the textual ones: the verify-type ->
profile mapping is bijective with ``config._VALID_TRANSPORT_PROFILES``, which
holds however either side is spelled.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

import config as config_mod  # type: ignore[import-not-found]
import verify_type as vt  # type: ignore[import-not-found]


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


@pytest.fixture()
def project(tmp_path: Path, monkeypatch) -> Path:
    """A bounded fake project root, entered as cwd.

    The ``.git`` marker is what stops :func:`verify_type.find_project_file`
    walking out of the fixture and into whatever the real machine has above
    the temp dir -- the same boundary a real project relies on.
    """
    root = tmp_path / "fake-project"
    (root / ".git").mkdir(parents=True)
    monkeypatch.chdir(root)
    monkeypatch.delenv(vt.ENV_VAR, raising=False)
    return root


_MINIMAL_CONFIG = """
    providers: {}
    models: {}
    routing:
      tier_assignments: {}
"""

_COPILOT_TRANSPORTS_BLOCK = """
    transports:
      copilot-cli:
        lockfile: "ai_router/copilot-catalog.lock"
        roles: {}
"""


def _write_config(target_dir: Path, body: str) -> Path:
    path = target_dir / "router-config.yaml"
    path.write_text(textwrap.dedent(body), encoding="utf-8")
    return path


# ---------------------------------------------------------------------------
# The three branches
# ---------------------------------------------------------------------------


def test_project_file_wins_silently_over_the_environment(project, monkeypatch):
    """Standing decision 5: a project's committed choice is not overridden by
    whichever machine it happens to be checked out on."""
    vt.write_project_verify_type(project, vt.DIRECT_API)
    monkeypatch.setenv(vt.ENV_VAR, vt.COPILOT_CLI)

    resolution = vt.resolve_verify_type()

    assert resolution.verify_type == vt.DIRECT_API
    assert resolution.source == vt.SOURCE_PROJECT_FILE
    assert resolution.needs_confirmation is False
    assert resolution.needs_setup is False
    assert resolution.transport_profile == "api"


def test_environment_default_is_a_suggestion_awaiting_confirmation(
    project, monkeypatch
):
    """Branch 2 has an answer in hand but nothing committed -- so it claims no
    transport profile, writes no file, and does not count as set up."""
    monkeypatch.setenv(vt.ENV_VAR, vt.COPILOT_CLI)

    resolution = vt.resolve_verify_type()

    assert resolution.verify_type == vt.COPILOT_CLI
    assert resolution.source == vt.SOURCE_ENVIRONMENT
    assert resolution.needs_confirmation is True
    assert resolution.committed is False
    assert resolution.resolved is False
    assert resolution.transport_profile is None
    assert resolution.suggested_transport_profile == "copilot-cli"
    assert not (project / vt.PROJECT_FILE_NAME).exists()


def test_guided_setup_when_neither_file_nor_environment_exists(project):
    resolution = vt.resolve_verify_type()

    assert resolution.verify_type is None
    assert resolution.needs_setup is True
    assert resolution.resolved is False
    instructions = vt.guided_setup_instructions(project)
    assert vt.PROJECT_FILE_NAME in instructions
    assert vt.ENV_VAR in instructions


# ---------------------------------------------------------------------------
# Reported, never guessed at
# ---------------------------------------------------------------------------


def test_invalid_project_file_is_reported_and_never_falls_through_to_env(
    project, monkeypatch
):
    """An unparseable project file must NOT quietly resolve to the machine
    default: falling through would answer a question the project already
    tried to answer, and answer it differently."""
    (project / vt.PROJECT_FILE_NAME).write_text("direct api\n", encoding="utf-8")
    monkeypatch.setenv(vt.ENV_VAR, vt.COPILOT_CLI)

    with pytest.raises(vt.VerifyTypeError) as excinfo:
        vt.resolve_verify_type()

    message = str(excinfo.value)
    assert vt.PROJECT_FILE_NAME in message
    assert "'direct api'" in message


def test_invalid_environment_value_is_reported(project, monkeypatch):
    monkeypatch.setenv(vt.ENV_VAR, "DIRECT-API")

    with pytest.raises(vt.VerifyTypeError) as excinfo:
        vt.resolve_verify_type()

    assert vt.ENV_VAR in str(excinfo.value)


def test_project_file_tolerates_comments_and_surrounding_whitespace(project):
    (project / vt.PROJECT_FILE_NAME).write_text(
        "# why this project verifies the way it does\n\n   COPILOT_CLI   \n",
        encoding="utf-8",
    )

    assert vt.resolve_verify_type().verify_type == vt.COPILOT_CLI


def test_the_project_file_is_read_at_the_project_root_and_nowhere_else(
    tmp_path, monkeypatch
):
    """Round 1 + supplementary: the answer must not change with the directory
    a tool was launched from. A nested copy -- a stale sample, a fixture, a
    scratch dir -- cannot answer for the project, and a file above the repo
    boundary belongs to somebody else."""
    outside = tmp_path / "outside"
    root = outside / "repo"
    nested = root / "ai_router" / "tests"
    nested.mkdir(parents=True)
    (root / ".git").mkdir()
    (outside / vt.PROJECT_FILE_NAME).write_text("DIRECT_API\n", encoding="utf-8")

    assert vt.find_project_root(nested) == root
    assert vt.find_project_file(nested) is None

    (root / vt.PROJECT_FILE_NAME).write_text("COPILOT_CLI\n", encoding="utf-8")
    (nested / vt.PROJECT_FILE_NAME).write_text("DIRECT_API\n", encoding="utf-8")

    assert vt.find_project_file(nested) == root / vt.PROJECT_FILE_NAME
    assert vt.find_project_file(root) == root / vt.PROJECT_FILE_NAME
    monkeypatch.chdir(nested)
    assert vt.resolve_verify_type().verify_type == vt.COPILOT_CLI


def test_a_write_from_a_nested_directory_lands_at_the_project_root(
    tmp_path, monkeypatch, capsys
):
    """Round 1: a --confirm that wrote to the invocation directory reported
    success while leaving the project unconfigured from everywhere else."""
    root = tmp_path / "repo"
    nested = root / "a" / "b"
    nested.mkdir(parents=True)
    (root / ".git").mkdir()
    monkeypatch.chdir(nested)
    monkeypatch.setenv(vt.ENV_VAR, vt.DIRECT_API)

    assert vt.main(["--confirm"]) == vt.EXIT_OK
    capsys.readouterr()

    assert (root / vt.PROJECT_FILE_NAME).is_file()
    assert not (nested / vt.PROJECT_FILE_NAME).exists()
    assert vt.resolve_verify_type(start=root).committed is True


def test_a_write_outside_any_repository_is_refused_not_guessed(
    tmp_path, monkeypatch, capsys
):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv(vt.ENV_VAR, vt.DIRECT_API)

    assert vt.main(["--confirm"]) == vt.EXIT_INVALID

    assert "git init" in capsys.readouterr().err
    assert not (tmp_path / vt.PROJECT_FILE_NAME).exists()


# ---------------------------------------------------------------------------
# The derivation: the file and transport.profile cannot disagree
# ---------------------------------------------------------------------------


def test_project_file_beats_a_disagreeing_configured_api_profile(project):
    """FALSIFIER, direction 1: plant the disagreement, assert the file wins."""
    config_path = _write_config(
        project,
        _MINIMAL_CONFIG
        + _COPILOT_TRANSPORTS_BLOCK
        + """
    transport:
      profile: api
    """,
    )
    vt.write_project_verify_type(project, vt.COPILOT_CLI)

    config = config_mod.load_config(str(config_path))

    assert config["transport"]["profile"] == "copilot-cli"


def test_project_file_beats_a_disagreeing_configured_copilot_profile(project):
    """FALSIFIER, direction 2. A one-directional derivation passes the test
    above and fails this one."""
    config_path = _write_config(
        project,
        _MINIMAL_CONFIG
        + _COPILOT_TRANSPORTS_BLOCK
        + """
    transport:
      profile: copilot-cli
    """,
    )
    vt.write_project_verify_type(project, vt.DIRECT_API)

    config = config_mod.load_config(str(config_path))

    assert config["transport"]["profile"] == "api"


def test_project_file_beats_a_seat_local_override(project):
    """The seat-local override (Set 110 S4) is still the seat's home for the
    profile -- until the project commits an answer, which outranks it."""
    config_path = _write_config(
        project, _MINIMAL_CONFIG + _COPILOT_TRANSPORTS_BLOCK
    )
    (project / "local-overrides.yaml").write_text(
        textwrap.dedent(
            """
            transport:
              profile: copilot-cli
            """
        ),
        encoding="utf-8",
    )
    vt.write_project_verify_type(project, vt.DIRECT_API)

    config = config_mod.load_config(str(config_path))

    assert config["transport"]["profile"] == "api"


def test_with_no_project_file_the_config_stays_in_charge(project):
    """LOOK-ALIKE: the derivation must not fire indiscriminately. Before a
    project has an answer, the seat's configured profile is the only thing
    that knows how to dispatch -- and the ``api`` default is still reached,
    now through resolution rather than beside it."""
    config_path = _write_config(
        project,
        _MINIMAL_CONFIG
        + _COPILOT_TRANSPORTS_BLOCK
        + """
    transport:
      profile: copilot-cli
    """,
    )
    assert config_mod.load_config(str(config_path))["transport"]["profile"] == (
        "copilot-cli"
    )

    _write_config(project, _MINIMAL_CONFIG)
    assert config_mod.load_config(str(config_path))["transport"]["profile"] == "api"


def test_the_resolver_and_the_config_can_never_disagree(project, monkeypatch):
    """The session's Ends-with, made executable across all three branches.

    Round 1 found the hole this closes: the resolver used to claim a
    transport profile for an *unconfirmed* machine default while
    ``load_config`` derived another. The invariant is now structural -- a
    resolution names a profile only when that profile is what dispatch
    reads."""
    config_path = _write_config(project, _MINIMAL_CONFIG + _COPILOT_TRANSPORTS_BLOCK)

    def _check():
        resolution = vt.resolve_verify_type()
        loaded = config_mod.load_config(str(config_path))["transport"]["profile"]
        if resolution.transport_profile is not None:
            assert resolution.transport_profile == loaded
        return resolution, loaded

    # Branch 3: nothing claimed, config keeps its own default.
    resolution, loaded = _check()
    assert resolution.transport_profile is None and loaded == "api"

    # Branch 2: an unconfirmed default claims nothing and changes nothing.
    monkeypatch.setenv(vt.ENV_VAR, vt.COPILOT_CLI)
    resolution, loaded = _check()
    assert resolution.needs_confirmation is True
    assert resolution.transport_profile is None and loaded == "api"

    # Branch 1: committed -- and now the two are the same fact.
    vt.write_project_verify_type(project, vt.COPILOT_CLI)
    resolution, loaded = _check()
    assert resolution.transport_profile == "copilot-cli" and loaded == "copilot-cli"


def test_a_config_loaded_from_outside_its_project_still_honours_it(
    tmp_path, monkeypatch
):
    """Round 1 + round 3: automation passes an explicit path (or
    AI_ROUTER_CONFIG) and runs from elsewhere. The project that OWNS the
    config answers for it -- including when the caller is itself sitting in a
    different, differently-configured project, which round 3 caught."""
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    other_project = tmp_path / "other-project"
    other_project.mkdir()
    (other_project / ".git").mkdir()
    config_path = _write_config(
        other_project, _MINIMAL_CONFIG + _COPILOT_TRANSPORTS_BLOCK
    )
    vt.write_project_verify_type(other_project, vt.COPILOT_CLI)

    # (a) The caller is in no project at all.
    monkeypatch.chdir(elsewhere)
    assert config_mod.load_config(str(config_path))["transport"]["profile"] == (
        "copilot-cli"
    )

    # (b) The caller is in a project of its own, answering differently. The
    # loaded config's project must still win -- otherwise repo B's calls
    # dispatch by repo A's answer.
    caller_project = tmp_path / "caller-project"
    caller_project.mkdir()
    (caller_project / ".git").mkdir()
    vt.write_project_verify_type(caller_project, vt.DIRECT_API)
    monkeypatch.chdir(caller_project)
    assert config_mod.load_config(str(config_path))["transport"]["profile"] == (
        "copilot-cli"
    )

    # (c) Round 4: the loaded config's project has NOT chosen yet. "Not
    # chosen" is answered by that project's own configured profile -- it is
    # not an invitation for the caller's file to answer on its behalf.
    unchosen = tmp_path / "unchosen-project"
    unchosen.mkdir()
    (unchosen / ".git").mkdir()
    unchosen_config = _write_config(
        unchosen,
        _MINIMAL_CONFIG
        + """
    transport:
      profile: api
    """,
    )
    assert config_mod.load_config(str(unchosen_config))["transport"]["profile"] == (
        "api"
    )


def test_an_invalid_project_file_fails_config_load_loudly(project):
    """A typo stops the load; it never dispatches somewhere else."""
    config_path = _write_config(project, _MINIMAL_CONFIG)
    (project / vt.PROJECT_FILE_NAME).write_text("COPILOT_CLI\nDIRECT_API\n",
                                                encoding="utf-8")

    with pytest.raises(vt.VerifyTypeError):
        config_mod.load_config(str(config_path))


def test_derived_copilot_profile_names_the_project_file_when_it_cannot_load(
    project,
):
    """The operator must not be told to fix a transport.profile they never
    wrote, in a config that is no longer the authority for it."""
    config_path = _write_config(project, _MINIMAL_CONFIG)
    vt.write_project_verify_type(project, vt.COPILOT_CLI)

    with pytest.raises(ValueError) as excinfo:
        config_mod.load_config(str(config_path))

    message = str(excinfo.value)
    assert "transports.copilot-cli is missing" in message
    assert vt.PROJECT_FILE_NAME in message


def test_verify_types_and_transport_profiles_are_bijective():
    """STRUCTURAL: neither side can grow a value the other cannot express, so
    'the two cannot disagree' holds however either is spelled."""
    assert set(vt.PROFILE_BY_VERIFY_TYPE) == set(vt.VALID_VERIFY_TYPES)
    assert set(vt.PROFILE_BY_VERIFY_TYPE.values()) == set(
        config_mod._VALID_TRANSPORT_PROFILES
    )
    assert len(vt.VERIFY_TYPE_BY_PROFILE) == len(vt.PROFILE_BY_VERIFY_TYPE)


# ---------------------------------------------------------------------------
# The CLI entry point (what the agent runs in the terminal)
# ---------------------------------------------------------------------------


def test_cli_walks_a_project_from_setup_required_to_committed(
    project, monkeypatch, capsys
):
    """The terminal journey that replaces the setup webview: unresolved ->
    machine default confirmed once -> committed, in branch 1 forever. An
    uncommitted machine default is deliberately still 'setup required': the
    design's bar is that BOTH the variable and the committed file agree."""
    assert vt.main([]) == vt.EXIT_SETUP_REQUIRED
    assert vt.PROJECT_FILE_NAME in capsys.readouterr().out

    monkeypatch.setenv(vt.ENV_VAR, vt.DIRECT_API)
    assert vt.main([]) == vt.EXIT_SETUP_REQUIRED
    assert "--confirm" in capsys.readouterr().out

    assert vt.main(["--confirm"]) == vt.EXIT_OK
    capsys.readouterr()

    confirmed = vt.resolve_verify_type()
    assert confirmed.source == vt.SOURCE_PROJECT_FILE
    assert confirmed.verify_type == vt.DIRECT_API
    assert confirmed.needs_confirmation is False
    assert vt.read_project_verify_type(project / vt.PROJECT_FILE_NAME) == (
        vt.DIRECT_API
    )
