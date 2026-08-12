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

import json
import os
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
    """Standing decision 5: a project's own answer is not overridden by a
    machine-wide default that spans every project on the box."""
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
    """Branch 2 has an answer in hand but nothing written -- so it claims no
    transport profile, writes no file, and does not count as set up."""
    monkeypatch.setenv(vt.ENV_VAR, vt.COPILOT_CLI)

    resolution = vt.resolve_verify_type()

    assert resolution.verify_type == vt.COPILOT_CLI
    assert resolution.source == vt.SOURCE_ENVIRONMENT
    assert resolution.needs_confirmation is True
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
    assert vt.resolve_verify_type(start=root).resolved is True


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


def test_a_retired_seat_local_transport_profile_is_refused(project):
    """Set 124 S2 REPLACES the old precedence test that lived here.

    It used to assert that a project file beat a seat-local
    ``local-overrides.yaml`` ``transport.profile``. That precedence stopped
    being meaningful the moment the project file became gitignored
    machine/project state: both files then answered "what verifies this
    project, on THIS machine", which is a duplicate mechanism rather than a
    hierarchy. The loser is retired, so the coverage is replaced rather than
    deleted -- the same input now has to be REFUSED.

    Refusal rather than warn-and-ignore is journaled in this set's
    decisions.jsonl: on a Copilot seat with no project file, ignoring the key
    would silently fall the profile back to ``api`` and then fail on provider
    keys the seat does not have by design.
    """
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

    with pytest.raises(ValueError) as excinfo:
        config_mod.load_config(str(config_path))

    message = str(excinfo.value)
    assert "transport.profile" in message
    # Not merely "rejected": the generic Appendix B refusal also names the
    # path, so asserting only that would pass even if the migration guidance
    # were deleted. Pin the guidance itself.
    assert "ai_router.verify_type" in message


def test_the_refusal_names_the_replacement_command_and_the_right_value(project):
    """A migration message that does not say what to run instead leaves an
    existing seat guessing. The value is DERIVED from the stale profile, so
    the operator is told the answer they already had, not a placeholder."""
    config_path = _write_config(
        project, _MINIMAL_CONFIG + _COPILOT_TRANSPORTS_BLOCK
    )
    (project / "local-overrides.yaml").write_text(
        "transport:\n  profile: copilot-cli\n", encoding="utf-8"
    )

    with pytest.raises(ValueError) as excinfo:
        config_mod.load_config(str(config_path))

    message = str(excinfo.value)
    assert "python -m ai_router.verify_type --set COPILOT_CLI" in message
    assert "local-overrides.yaml" in message

    # And the mirror value, so the derivation is not hardcoded to one profile.
    (project / "local-overrides.yaml").write_text(
        "transport:\n  profile: api\n", encoding="utf-8"
    )
    with pytest.raises(ValueError) as excinfo_api:
        config_mod.load_config(str(config_path))
    assert (
        "python -m ai_router.verify_type --set DIRECT_API"
        in str(excinfo_api.value)
    )


def test_local_overrides_still_work_for_what_is_still_allowed(project):
    """LOOK-ALIKE: the retirement must not have broken local overrides
    generally. A rule that refused everything would pass the two tests above
    and be badly wrong."""
    config_path = _write_config(
        project, _MINIMAL_CONFIG + _COPILOT_TRANSPORTS_BLOCK
    )
    (project / "local-overrides.yaml").write_text(
        textwrap.dedent(
            """
            routing:
              outsourcing_mode: disabled
            """
        ),
        encoding="utf-8",
    )
    vt.write_project_verify_type(project, vt.COPILOT_CLI)

    config = config_mod.load_config(str(config_path))

    assert config["routing"]["outsourcing_mode"] == "disabled"
    assert config["transport"]["profile"] == "copilot-cli"


def test_transport_profile_is_not_in_the_allowed_override_set():
    """STRUCTURAL: holds however the refusal branch is later rewritten."""
    assert "transport.profile" not in config_mod._LOCAL_OVERRIDE_ALLOWED
    assert not any(
        entry.startswith("transport.")
        for entry in config_mod._LOCAL_OVERRIDE_ALLOWED
    )


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

    # Branch 1: resolved -- and now the two are the same fact.
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


def test_the_written_file_header_does_not_instruct_the_reader_to_commit_it():
    """Set 124 S1, caught in this session by actually reading the file the
    tool writes rather than the code that writes it.

    ``write_project_verify_type`` embedded a header saying *"Committed on
    purpose: it is project configuration, not machine state"* -- the exact
    inverse of the operator's ruling, shipped inside every file the setup
    command produces. A case-sensitive grep for "commit" missed it because
    the word was capitalised, which is precisely why this is asserted on the
    written artifact instead of reviewed by eye."""
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        path = vt.write_project_verify_type(tmp, vt.COPILOT_CLI)
        header = "\n".join(
            line
            for line in path.read_text(encoding="utf-8").splitlines()
            if line.startswith("#")
        )

    assert "gitignored" in header.lower()
    assert "machine/project state" in header
    assert "not committed project" in header
    # The inverted Set 123 claim, in the shape it actually shipped.
    assert "committed on purpose" not in header.lower()
    assert "not machine state" not in header.lower()
    # And the value still parses despite the header (the tolerance contract).
    assert vt.parse_verify_type(
        "\n".join([header, vt.COPILOT_CLI]), origin="test"
    ) == vt.COPILOT_CLI


def test_the_setup_message_never_tells_the_operator_to_commit_the_file():
    """Set 124 S1. The file is gitignored machine/project state, so a setup
    message that says 'committed' is instructing the operator to do the one
    thing the .gitignore rule exists to prevent.

    STRUCTURAL companion: the retired ``committed`` attribute must stay
    retired. A property that silently came back would let a caller branch on
    a concept the design no longer has, and no textual assertion would catch
    it."""
    message = vt.guided_setup_instructions()

    assert "commit" not in message.lower(), message
    assert "gitignored" in message
    assert f"{vt.PROJECT_FILE_NAME} exists carrying the same value" in message

    resolution = vt.VerifyTypeResolution(
        verify_type=vt.DIRECT_API, source=vt.SOURCE_PROJECT_FILE
    )
    assert not hasattr(resolution, "committed")
    assert resolution.resolved is True
    assert "committed" not in resolution.to_dict()
    assert resolution.to_dict()["resolved"] is True


def test_cli_walks_a_project_from_setup_required_to_resolved(
    project, monkeypatch, capsys
):
    """The terminal journey that replaces the setup webview: unresolved ->
    machine default confirmed once -> resolved, in branch 1 forever. An
    unwritten machine default is deliberately still 'setup required': the
    design's bar is that BOTH the variable and the project file agree."""
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

# ---------------------------------------------------------------------------
# Set 124 S3 -- the writer establishes its own gitignore precondition.
#
# Found by the cold-start walk the spec required (L-079-3): the header
# write_project_verify_type embeds says the file is "Gitignored on purpose",
# and until S3 nothing made that true. A consumer who followed the documented
# first run got an untracked, COMMITTABLE file carrying its own claim to the
# contrary. These are both-direction falsifiers (L-112-1): one plants the
# defect and asserts the guarantee fires, one plants a legitimate look-alike
# and asserts it is not mistaken for coverage.
# ---------------------------------------------------------------------------


def test_writing_the_answer_adds_the_gitignore_rule(project):
    """FIRES: a project with no .gitignore at all gets one that covers the file."""
    assert not (project / vt.GITIGNORE_FILE_NAME).exists()
    vt.write_project_verify_type(project, vt.COPILOT_CLI)
    text = (project / vt.GITIGNORE_FILE_NAME).read_text(encoding="utf-8")
    assert vt.GITIGNORE_RULE in text.splitlines()
    assert vt.is_gitignored_by(text)


def test_the_rule_is_written_before_the_file_it_protects(project):
    """Ordering IS the guarantee: any window in which the file exists
    un-ignored is a window in which ``git add -A`` commits it."""
    written: list[str] = []
    real_write = Path.write_text

    def spy(self, *args, **kwargs):
        written.append(self.name)
        return real_write(self, *args, **kwargs)

    Path.write_text = spy  # type: ignore[method-assign]
    try:
        vt.write_project_verify_type(project, vt.COPILOT_CLI)
    finally:
        Path.write_text = real_write  # type: ignore[method-assign]

    assert vt.GITIGNORE_FILE_NAME in written
    assert vt.PROJECT_FILE_NAME in written
    assert written.index(vt.GITIGNORE_FILE_NAME) < written.index(
        vt.PROJECT_FILE_NAME
    ), f"the ignore rule must precede the file it protects: {written}"


def test_an_existing_gitignore_is_appended_to_never_clobbered(project):
    """The operator's own rules survive -- a guarantee that destroys the file
    it edits is not a guarantee."""
    (project / vt.GITIGNORE_FILE_NAME).write_text(
        "node_modules/\n.venv/\n", encoding="utf-8"
    )
    vt.write_project_verify_type(project, vt.DIRECT_API)
    text = (project / vt.GITIGNORE_FILE_NAME).read_text(encoding="utf-8")
    assert text.startswith("node_modules/\n.venv/\n")
    assert vt.is_gitignored_by(text)


def test_an_already_covered_gitignore_is_left_byte_identical(project):
    """Idempotent: re-running setup must not accrete duplicate rules."""
    before = "node_modules/\n/project-verify-type.txt\n"
    (project / vt.GITIGNORE_FILE_NAME).write_text(before, encoding="utf-8")
    vt.write_project_verify_type(project, vt.COPILOT_CLI)
    assert (project / vt.GITIGNORE_FILE_NAME).read_text(encoding="utf-8") == before


@pytest.mark.parametrize(
    "rule",
    ["project-verify-type.txt", "/project-verify-type.txt", "**/project-verify-type.txt"],
)
def test_is_gitignored_by_recognises_genuine_coverage(rule):
    assert vt.is_gitignored_by(f"node_modules/\n{rule}\n.venv/\n")


@pytest.mark.parametrize(
    "look_alike",
    [
        "# project-verify-type.txt",  # a comment is not a rule
        "!project-verify-type.txt",  # a re-include is the OPPOSITE
        "project-verify-type",  # no extension
        "project-verify-type.text",  # wrong extension
        "verify-type.txt",  # different file
        "ai_router/local-overrides.yaml",  # the RETIRED rule (Set 124 S2)
        "",
    ],
)
def test_is_gitignored_by_rejects_look_alikes(look_alike):
    """A false POSITIVE is the dangerous direction: it leaves the file
    committable while the written header promises it is ignored. A gate that
    matches everything is indistinguishable from one that matches the right
    thing (L-112-1)."""
    assert not vt.is_gitignored_by(f"node_modules/\n{look_alike}\n")


def test_an_unwritable_gitignore_warns_but_still_records_the_answer(
    project, monkeypatch, capsys
):
    """Fail-open is correct HERE -- an operator must still be able to declare
    what verifies their project -- but the skip must be NAMED (L-079-1)."""

    def boom(self, *args, **kwargs):
        raise OSError("read-only file system")

    monkeypatch.setattr(vt, "ensure_gitignored", lambda root: boom(root))
    path = vt.write_project_verify_type(project, vt.COPILOT_CLI)
    assert vt.read_project_verify_type(path) == vt.COPILOT_CLI
    err = capsys.readouterr().err
    assert vt.GITIGNORE_RULE in err
    assert "by hand" in err


# ---------------------------------------------------------------------------
# Set 126 S1 -- setup reports its own second half.
#
# The design's bar is that setup is finished when BOTH the environment
# variable and the project file carry the same value. Branch 1 captured
# ``env_value`` from the start and never compared it, so "file only" and
# "file CONTRADICTED by the environment" printed the same confident [x].
#
# Both directions (L-112-1). The rule FIRES on a missing half and on a
# disagreeing half. It does NOT fire indiscriminately: agreeing halves keep
# the clean [x] with no nag, branches 2 and 3 are byte-identical to before,
# and -- the one way a display change could break a caller -- **no exit code
# moves in any of these cases**, which is pinned explicitly below.
# ---------------------------------------------------------------------------


def test_a_file_only_setup_reports_its_missing_second_half(project, monkeypatch):
    """FIRES (defect 2, half one): the file answered, the environment did not.

    Before Set 126 this was indistinguishable from a finished setup -- the
    state the design's own bar calls unfinished printed the same bare [x]."""
    vt.write_project_verify_type(project, vt.COPILOT_CLI)
    monkeypatch.delenv(vt.ENV_VAR, raising=False)

    resolution = vt.resolve_verify_type()

    assert resolution.resolved is True
    assert resolution.env_agreement == vt.ENV_AGREEMENT_MISSING
    assert resolution.to_dict()["env_agreement"] == vt.ENV_AGREEMENT_MISSING

    text = vt.describe(resolution)
    assert "[!]" in text
    assert "HALF-FINISHED" in text
    assert vt.ENV_VAR in text
    # The false-alarm case an operator WILL hit: the variable was set, but
    # this terminal predates it. Saying so is what stops a correct setup
    # being re-done.
    assert "restarted" in text
    # ...without ever suggesting dispatch is broken. It is not.
    assert "Dispatch is unaffected" in text


def test_a_disagreeing_env_half_names_both_values_and_the_winner(
    project, monkeypatch
):
    """FIRES (defect 2, half two): both halves present, contradicting.

    An operator who cannot see WHICH side won cannot tell whether the fix is
    to change the file or the environment, so the report must name both
    values and state that the file is what dispatch uses."""
    vt.write_project_verify_type(project, vt.COPILOT_CLI)
    monkeypatch.setenv(vt.ENV_VAR, vt.DIRECT_API)

    resolution = vt.resolve_verify_type()

    assert resolution.env_agreement == vt.ENV_AGREEMENT_DISAGREES
    # The file still wins SILENTLY for dispatch -- narration changed, the
    # resolution order did not (standing decision 5).
    assert resolution.verify_type == vt.COPILOT_CLI
    assert resolution.transport_profile == "copilot-cli"

    text = vt.describe(resolution)
    assert "DISAGREE" in text
    assert vt.COPILOT_CLI in text and vt.DIRECT_API in text
    assert vt.PROJECT_FILE_NAME in text and vt.ENV_VAR in text
    assert "Dispatch uses the FILE" in text


def test_an_invalid_env_half_is_a_disagreement_not_an_exception(
    project, monkeypatch
):
    """FIRES, and stays a narration path: a typo'd environment value does not
    carry the same value as the file, so it disagrees.

    Raising here would put an exception in a *display* path and would break
    branch 1's contract that the file answers without the environment being
    able to decide anything. ``parse_verify_type`` still raises where the
    value is being *used* (branch 2); this is where it is being reported."""
    vt.write_project_verify_type(project, vt.DIRECT_API)
    monkeypatch.setenv(vt.ENV_VAR, "DIRECT-API")  # the hyphen typo

    resolution = vt.resolve_verify_type()

    assert resolution.resolved is True
    assert resolution.verify_type == vt.DIRECT_API
    assert resolution.env_agreement == vt.ENV_AGREEMENT_DISAGREES
    assert "DIRECT-API" in vt.describe(resolution)


def test_agreeing_halves_print_the_clean_check_with_no_nag(project, monkeypatch):
    """DOES NOT FIRE: a finished setup gains nothing at all.

    Asserted as the EXACT two lines, not merely "no [!]": a nag that only
    grew quieter would still be a nag on every session of every correctly
    configured project."""
    vt.write_project_verify_type(project, vt.COPILOT_CLI)
    monkeypatch.setenv(vt.ENV_VAR, vt.COPILOT_CLI)

    resolution = vt.resolve_verify_type()

    assert resolution.env_agreement == vt.ENV_AGREEMENT_AGREES
    assert vt.env_half_note(resolution) is None
    lines = vt.describe(resolution).splitlines()
    assert lines == [
        f"[x] verify type: {vt.COPILOT_CLI} "
        f"(from {project / vt.PROJECT_FILE_NAME})",
        "    transport.profile derives to: copilot-cli",
    ]


def test_a_blank_env_half_is_missing_not_disagreeing(project, monkeypatch):
    """DOES NOT FIRE as a disagreement: branch 2 already treats a blank
    variable as unset (``raw_env.strip()``), so reporting the same string as
    a *contradicting value* would make the two halves of this module
    disagree about what "set" means -- and would tell the operator to go fix
    a value that is not there."""
    vt.write_project_verify_type(project, vt.DIRECT_API)
    monkeypatch.setenv(vt.ENV_VAR, "   ")

    resolution = vt.resolve_verify_type()

    assert resolution.env_agreement == vt.ENV_AGREEMENT_MISSING
    assert "DISAGREE" not in vt.describe(resolution)


def test_branch_2_and_branch_3_narration_are_untouched(project, monkeypatch):
    """DOES NOT FIRE where there is no pair to compare.

    On branch 2 the environment IS the answer and no file has spoken; on
    branch 3 neither has. A comparison in either place would be inventing a
    disagreement out of a single value."""
    monkeypatch.setenv(vt.ENV_VAR, vt.COPILOT_CLI)
    branch_2 = vt.resolve_verify_type()
    assert branch_2.source == vt.SOURCE_ENVIRONMENT
    assert branch_2.env_agreement == vt.ENV_AGREEMENT_NOT_APPLICABLE
    text_2 = vt.describe(branch_2)
    assert "[~]" in text_2 and "[!]" not in text_2
    assert "--confirm" in text_2

    monkeypatch.delenv(vt.ENV_VAR, raising=False)
    branch_3 = vt.resolve_verify_type()
    assert branch_3.source == vt.SOURCE_UNRESOLVED
    assert branch_3.env_agreement == vt.ENV_AGREEMENT_NOT_APPLICABLE
    text_3 = vt.describe(branch_3)
    assert "[ ] verify type: unresolved" in text_3
    assert "[!]" not in text_3


def test_the_exit_code_is_identical_in_every_agreement_state(
    project, monkeypatch, capsys
):
    """The one way this display change could break a caller.

    Exit 3 is consumed as "guided setup required", and this repo's own seat
    is currently in exactly the half-configured state that would start
    failing. Authoring decision 2: the new information arrives as output, not
    as a failure. Every resolved state exits 0 -- including the disagreeing
    one -- and the two unresolved branches keep exit 3."""
    assert vt.main([]) == vt.EXIT_SETUP_REQUIRED  # branch 3
    monkeypatch.setenv(vt.ENV_VAR, vt.COPILOT_CLI)
    assert vt.main([]) == vt.EXIT_SETUP_REQUIRED  # branch 2

    vt.write_project_verify_type(project, vt.COPILOT_CLI)
    for value, expected in (
        (vt.COPILOT_CLI, vt.ENV_AGREEMENT_AGREES),
        (vt.DIRECT_API, vt.ENV_AGREEMENT_DISAGREES),
        ("garbage", vt.ENV_AGREEMENT_DISAGREES),
    ):
        monkeypatch.setenv(vt.ENV_VAR, value)
        assert vt.resolve_verify_type().env_agreement == expected
        assert vt.main([]) == vt.EXIT_OK, value
        assert vt.main(["--json"]) == vt.EXIT_OK, value

    monkeypatch.delenv(vt.ENV_VAR, raising=False)
    assert vt.resolve_verify_type().env_agreement == vt.ENV_AGREEMENT_MISSING
    assert vt.main([]) == vt.EXIT_OK
    capsys.readouterr()


def test_env_agreement_is_total_ascii_and_published(project, monkeypatch):
    """STRUCTURAL, beside the textual assertions above (L-112-1).

    Three properties that hold however the narration is worded: the state is
    always one the vocabulary names (a caller can branch exhaustively), it is
    on ``to_dict()`` so ``--json`` consumers see it, and the NOTE this session
    adds is ASCII-only -- including the environment's own value, which is
    arbitrary machine state that would otherwise crash this print on a
    Windows cp1252 console (L-079-1).

    The whole-``describe`` encode below is an end-to-end companion, not a
    wider claim: describe's first line echoes the project path, which can
    carry non-ASCII on a checkout whose directory name does. That is
    pre-existing and outside this session's scope, so the path is asserted
    ASCII by construction first."""
    vt.write_project_verify_type(project, vt.COPILOT_CLI)
    assert str(project).isascii()  # the premise of the describe() check below

    for value in (
        None,
        "",
        "   ",
        vt.COPILOT_CLI,
        vt.DIRECT_API,
        " COPILOT_CLI ",
        "copilot_cli",
        "cafe\u0301 \u2014 not a verify type",
    ):
        if value is None:
            monkeypatch.delenv(vt.ENV_VAR, raising=False)
        else:
            monkeypatch.setenv(vt.ENV_VAR, value)

        resolution = vt.resolve_verify_type()
        agreement = resolution.env_agreement

        assert agreement in vt.ENV_AGREEMENT_STATES, value
        assert resolution.to_dict()["env_agreement"] == agreement
        # Dispatch never moves, whatever the environment says.
        assert resolution.transport_profile == "copilot-cli"
        note = vt.env_half_note(resolution)
        assert note is None or note.isascii(), value
        text = vt.describe(resolution)
        assert text.isascii(), value
        text.encode("cp1252")

    # ...and the state is a real answer everywhere, not just on branch 1.
    monkeypatch.delenv(vt.ENV_VAR, raising=False)
    (project / vt.PROJECT_FILE_NAME).unlink()
    assert (
        vt.resolve_verify_type().env_agreement
        in vt.ENV_AGREEMENT_STATES
    )


# ---------------------------------------------------------------------------
# Set 126 S2 -- one command finishes setup, on whichever OS is running it.
#
# S1 made the missing half visible; this makes it executable. The risk is not
# in the happy path, it is in the OS SPLIT: `[System.Environment]::
# SetEnvironmentVariable(..., 'User')` is a silent no-op on Linux and macOS,
# which is defect 1 wearing a success message, so the helper must *do* on
# Windows and *instruct* on POSIX and never blur which it just did.
#
# Both directions (L-112-1), and both provable on the runner that is NOT the
# target OS -- `python-tests` runs ubuntu + macOS + windows, so a
# cross-platform claim tested only where it is true is untested where it
# matters. The seams (`platform=`, `writer=`, `broadcaster=`) exist for
# exactly that.
# ---------------------------------------------------------------------------


class _WriterSpy:
    """Records every environment write attempt, and performs none.

    A spy rather than a real registry write on purpose: a falsifier that
    mutated the developer's own user environment would be a test with a
    machine-wide side effect.
    """

    def __init__(self):
        self.calls: list = []

    def __call__(self, name, value, scope):
        self.calls.append((name, value, scope))

    @property
    def scopes(self) -> set:
        return {scope for _name, _value, scope in self.calls}


def _tree_snapshot(root: Path) -> dict:
    """Every file under *root*, by relative path -> bytes."""
    return {
        str(path.relative_to(root)): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def test_the_windows_path_persists_the_files_value_at_user_scope(project):
    """FIRES (defect 3): on Windows the helper actually writes, at USER
    scope, the value the project file already carries."""
    vt.write_project_verify_type(project, vt.COPILOT_CLI)
    spy = _WriterSpy()

    outcome = vt.set_env_verify_type(
        platform=vt.PLATFORM_WINDOWS, writer=spy, broadcaster=lambda: None
    )

    assert spy.calls == [(vt.ENV_VAR, vt.COPILOT_CLI, vt.ENV_SCOPE_USER)]
    assert outcome.persisted is True
    assert outcome.scope == vt.ENV_SCOPE_USER
    assert outcome.platform == vt.PLATFORM_WINDOWS
    assert outcome.value == vt.COPILOT_CLI
    assert "USER scope" in outcome.instructions
    assert str(project / vt.PROJECT_FILE_NAME) in outcome.instructions
    assert outcome.to_dict()["persisted"] is True


def test_the_value_is_derived_from_the_file_never_from_the_environment(
    project, monkeypatch
):
    """FIRES, and it is the whole point: the two halves cannot drift because
    the second one is DERIVED from the first, never asked for again.

    Planted defect: an environment half that already contradicts the file.
    A helper that read the environment (or prompted) would preserve the
    contradiction it was run to end."""
    vt.write_project_verify_type(project, vt.COPILOT_CLI)
    monkeypatch.setenv(vt.ENV_VAR, vt.DIRECT_API)
    assert vt.resolve_verify_type().env_agreement == vt.ENV_AGREEMENT_DISAGREES

    spy = _WriterSpy()
    outcome = vt.set_env_verify_type(
        platform=vt.PLATFORM_WINDOWS, writer=spy, broadcaster=lambda: None
    )

    assert spy.calls == [(vt.ENV_VAR, vt.COPILOT_CLI, vt.ENV_SCOPE_USER)]
    assert outcome.value == vt.COPILOT_CLI
    # ...and the disagreement is now closed, not merely reported.
    assert vt.resolve_verify_type().env_agreement == vt.ENV_AGREEMENT_AGREES


def test_the_posix_path_writes_nothing_at_all_and_returns_the_export_line(
    project, monkeypatch
):
    """DOES NOT FIRE: there is no OS-level user environment to write on
    POSIX, so the honest deliverable is instructions.

    Structural, not textual: the injected writer is never called, the
    process environment is untouched, and the project tree is byte-identical
    afterwards. A helper that "succeeded" by printing would be the silent
    no-op this design exists to refuse."""
    vt.write_project_verify_type(project, vt.DIRECT_API)
    monkeypatch.delenv(vt.ENV_VAR, raising=False)
    spy = _WriterSpy()
    before = _tree_snapshot(project)

    outcome = vt.set_env_verify_type(
        platform=vt.PLATFORM_POSIX, writer=spy, broadcaster=lambda: None
    )

    assert spy.calls == []
    assert outcome.persisted is False
    assert outcome.scope is None
    assert _tree_snapshot(project) == before
    assert vt.ENV_VAR not in os.environ
    assert f"export {vt.ENV_VAR}={vt.DIRECT_API}" in outcome.instructions
    assert "Nothing was written" in outcome.instructions


def test_neither_path_ever_writes_machine_scope(project, monkeypatch):
    """STRUCTURAL, and the reason it is structural: reading the argument at
    one call site proves nothing about the other branch, or about tomorrow.

    Every write this module can be driven to make, across both platforms and
    both values, is asserted to carry USER scope -- and the Windows hive
    constant is pinned, because on Windows the hive IS the scope: a Machine
    write would have to name HKEY_LOCAL_MACHINE. Machine scope is refused,
    not merely unused: a Copilot seat is licensed per GitHub identity, so a
    machine-wide answer imposes one seat's transport on every other account
    -- the failure Set 124 S1 removed from git."""
    spy = _WriterSpy()
    for value in (vt.COPILOT_CLI, vt.DIRECT_API):
        vt.write_project_verify_type(project, value)
        for platform in (vt.PLATFORM_WINDOWS, vt.PLATFORM_POSIX):
            vt.set_env_verify_type(
                platform=platform, writer=spy, broadcaster=lambda: None
            )

    assert spy.calls, "the matrix must actually exercise the writing branch"
    assert spy.scopes == {vt.ENV_SCOPE_USER}
    assert "machine" not in {scope.lower() for scope in spy.scopes}
    assert vt.WINDOWS_ENV_REGISTRY_ROOT == "HKEY_CURRENT_USER"
    assert "LOCAL_MACHINE" not in vt.WINDOWS_ENV_REGISTRY_ROOT


@pytest.mark.parametrize("scope", ["machine", "Machine", "MACHINE", "process"])
def test_the_windows_writer_refuses_any_scope_but_user(scope):
    """The planted violation (L-112-1): a caller that reaches for Machine
    scope hits an exception, not a comment asking it not to.

    The refusal happens BEFORE ``winreg`` is imported, which is what makes
    this assertion meaningful on ubuntu and macOS -- where importing winreg
    would raise ImportError instead. A test that could only run on Windows
    would leave the guarantee unchecked on two thirds of the CI matrix."""
    with pytest.raises(vt.VerifyTypeError) as excinfo:
        vt.write_windows_user_env(vt.ENV_VAR, vt.COPILOT_CLI, scope)

    assert scope in str(excinfo.value)
    assert vt.ENV_SCOPE_USER in str(excinfo.value)


def test_both_paths_state_the_restart_caveat(project):
    """DOES NOT FIRE as a claim of immediate effect, on either OS.

    The surprise is on the record: during Set 124 S1 the value was set
    correctly and read empty in the terminal that was already open. A helper
    that stayed silent about it would send the operator to re-do a setup that
    was already finished."""
    vt.write_project_verify_type(project, vt.COPILOT_CLI)

    for platform in (vt.PLATFORM_WINDOWS, vt.PLATFORM_POSIX):
        outcome = vt.set_env_verify_type(
            platform=platform, writer=_WriterSpy(), broadcaster=lambda: None
        )
        assert "restarted" in outcome.instructions, platform
        assert "OLD environment" in outcome.instructions, platform


def test_a_project_the_file_has_not_answered_for_is_refused(
    project, monkeypatch
):
    """DOES NOT FIRE where there is nothing to derive from.

    Branch 3 (nothing at all) and branch 2 (an unconfirmed machine default)
    both refuse, and both name the command that would make the file answer.
    Writing an environment half no file agrees with would MANUFACTURE the
    disagreement this whole set exists to remove."""
    spy = _WriterSpy()

    monkeypatch.delenv(vt.ENV_VAR, raising=False)
    with pytest.raises(vt.VerifyTypeError) as branch_3:
        vt.set_env_verify_type(writer=spy, platform=vt.PLATFORM_WINDOWS)
    assert "--set" in str(branch_3.value)

    monkeypatch.setenv(vt.ENV_VAR, vt.COPILOT_CLI)
    with pytest.raises(vt.VerifyTypeError) as branch_2:
        vt.set_env_verify_type(writer=spy, platform=vt.PLATFORM_WINDOWS)
    assert "--confirm" in str(branch_2.value)

    assert spy.calls == []


def test_a_broadcast_failure_is_named_and_never_fails_the_write(project):
    """Fail-open is correct HERE -- the value is already persisted when the
    broadcast runs -- but the skip must be NAMED (L-079-1).

    An operator told only "open a new terminal" would otherwise be following
    advice that quietly stopped being sufficient."""
    vt.write_project_verify_type(project, vt.COPILOT_CLI)
    spy = _WriterSpy()

    def boom():
        raise OSError(5, "access denied")

    outcome = vt.set_env_verify_type(
        platform=vt.PLATFORM_WINDOWS, writer=spy, broadcaster=boom
    )

    assert outcome.persisted is True
    assert spy.calls == [(vt.ENV_VAR, vt.COPILOT_CLI, vt.ENV_SCOPE_USER)]
    assert len(outcome.warnings) == 1
    assert "sign out" in outcome.instructions
    assert "IS persisted" in outcome.instructions


def test_the_broadcast_is_attempted_on_windows_only(project):
    """DOES NOT FIRE on POSIX: there is nothing to notify anyone about,
    because nothing was written. A broadcast there would be a Windows API
    call on a platform that has none."""
    vt.write_project_verify_type(project, vt.DIRECT_API)
    attempts: list = []

    vt.set_env_verify_type(
        platform=vt.PLATFORM_WINDOWS,
        writer=_WriterSpy(),
        broadcaster=lambda: attempts.append(vt.PLATFORM_WINDOWS),
    )
    assert attempts == [vt.PLATFORM_WINDOWS]

    vt.set_env_verify_type(
        platform=vt.PLATFORM_POSIX,
        writer=_WriterSpy(),
        broadcaster=lambda: attempts.append(vt.PLATFORM_POSIX),
    )
    assert attempts == [vt.PLATFORM_WINDOWS]


def test_only_the_persisting_path_publishes_the_value_into_this_process(
    project, monkeypatch
):
    """The one thing ``setx`` cannot do, and the one thing POSIX must not do.

    On Windows the value is genuinely in the user's environment when this
    returns, so telling THIS process is honest -- and without it the caller's
    own next resolution reads a stale block and reports the half just
    finished as missing. On POSIX nothing was persisted, so a process-local
    claim would be one no shell could back."""
    vt.write_project_verify_type(project, vt.COPILOT_CLI)

    monkeypatch.delenv(vt.ENV_VAR, raising=False)
    vt.set_env_verify_type(
        platform=vt.PLATFORM_POSIX, writer=_WriterSpy(), broadcaster=lambda: None
    )
    assert vt.ENV_VAR not in os.environ
    assert vt.resolve_verify_type().env_agreement == vt.ENV_AGREEMENT_MISSING

    vt.set_env_verify_type(
        platform=vt.PLATFORM_WINDOWS, writer=_WriterSpy(), broadcaster=lambda: None
    )
    assert os.environ[vt.ENV_VAR] == vt.COPILOT_CLI
    assert vt.resolve_verify_type().env_agreement == vt.ENV_AGREEMENT_AGREES


def test_the_env_write_narration_is_ascii_on_both_platforms(project):
    """L-079-1, and it is not theoretical here: this output names a project
    PATH and a Windows API failure string, both arbitrary machine state, and
    it prints to a cp1252 console."""
    vt.write_project_verify_type(project, vt.COPILOT_CLI)
    assert str(project).isascii()  # the premise of the checks below

    def boom():
        raise OSError("caf\u00e9 \u2014 access denied")

    for platform in (vt.PLATFORM_WINDOWS, vt.PLATFORM_POSIX):
        for broadcaster in (lambda: None, boom):
            outcome = vt.set_env_verify_type(
                platform=platform,
                writer=_WriterSpy(),
                broadcaster=broadcaster,
            )
            assert outcome.instructions.isascii(), (platform, outcome)
            outcome.instructions.encode("cp1252")


def test_the_cli_finishes_setup_in_one_command_and_moves_no_exit_code(
    project, monkeypatch, capsys
):
    """The CLI wiring, end to end, with the exit-code guarantee intact.

    ``--set`` and ``--set-env`` compose into the one command the SIMPLE
    counter-argument asked for (authoring decision 1 kept them separable, it
    did not make them unusable together). An unresolved project exits 3 --
    "guided setup required", which is exactly the remedy -- rather than 2:
    nothing about the request was malformed."""
    spy = _WriterSpy()
    monkeypatch.setattr(vt, "write_windows_user_env", spy)
    monkeypatch.setattr(vt, "broadcast_environment_change", lambda: None)
    monkeypatch.setattr(vt, "current_platform", lambda: vt.PLATFORM_WINDOWS)
    monkeypatch.delenv(vt.ENV_VAR, raising=False)

    assert vt.main(["--set-env"]) == vt.EXIT_SETUP_REQUIRED
    assert spy.calls == []
    assert vt.PROJECT_FILE_NAME in capsys.readouterr().err

    # ...and the refusal keeps whichever stdout shape was asked for: a
    # --json consumer piping into a parser gets JSON, not setup prose.
    assert vt.main(["--set-env", "--json"]) == vt.EXIT_SETUP_REQUIRED
    refused = capsys.readouterr()
    assert json.loads(refused.out)["resolved"] is False
    assert vt.PROJECT_FILE_NAME in refused.err
    assert spy.calls == []

    assert vt.main(["--set", vt.COPILOT_CLI, "--set-env"]) == vt.EXIT_OK
    assert spy.calls == [(vt.ENV_VAR, vt.COPILOT_CLI, vt.ENV_SCOPE_USER)]
    out = capsys.readouterr().out
    assert "persisted at USER scope" in out
    # The half-finished nag is GONE in the same breath -- the command that
    # finished setup must not then report it as unfinished.
    assert "HALF-FINISHED" not in out

    assert vt.main(["--set-env", "--json"]) == vt.EXIT_OK
    payload = json.loads(capsys.readouterr().out)
    assert payload["env_agreement"] == vt.ENV_AGREEMENT_AGREES
    assert payload["env_write"]["scope"] == vt.ENV_SCOPE_USER
    assert payload["env_write"]["persisted"] is True

