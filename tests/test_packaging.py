import datetime
import json
import re
import subprocess
import sys

import pytest
import yaml

from ai_router import ledger
from ai_router.config import load_config
from ai_router.evidence import snapshot_worktree_tree
from ai_router.packaging import (
    OUTCOME_FAILED, OUTCOME_PUBLISHED, OUTCOME_REFUSED, PackagingConfigError,
    load_declaration, package, record,
)
from ai_router.session import register_session_start
from ai_router.writers import declare_session_task
from tests.conftest import make_config

# A pack that writes one file into whatever directory the framework hands it,
# and a push that files what it was given. Both are `sys.executable -c`
# scripts rather than a real build tool: the behaviours under test are how
# the framework spawns a command and what it does with the result, and a
# repository that shipped dotnet would be testing dotnet.
PACK_SRC = (
    "import pathlib, sys;"
    "out = pathlib.Path(sys.argv[1]);"
    "out.mkdir(parents=True, exist_ok=True);"
    "[(out / n).write_text('artifact', encoding='utf-8')"
    " for n in sys.argv[2:]]"
)

# A pack that succeeds at its own job and leaves a build intermediate in the
# repository on the way past -- the ordinary shape of `dotnet pack` writing
# obj/ beside the code.
DIRTY_PACK_SRC = (
    "import pathlib, sys;"
    "out = pathlib.Path(sys.argv[1]);"
    "out.mkdir(parents=True, exist_ok=True);"
    "(out / 'thing-1.0.nupkg').write_text('artifact', encoding='utf-8');"
    "pathlib.Path(sys.argv[2]).write_text('intermediate', encoding='utf-8')"
)

# Records the argv it received and the environment it was given, then echoes
# the credential back on stdout the way a chatty tool does.
PUSH_SRC = (
    "import json, os, pathlib, sys;"
    "log = pathlib.Path(sys.argv[1]);"
    "rows = json.loads(log.read_text(encoding='utf-8')) if log.exists()"
    " else [];"
    "rows.append({'argv': sys.argv[2:], 'env': sorted(os.environ)});"
    "log.write_text(json.dumps(rows), encoding='utf-8');"
    "print('pushing with token ' + sys.argv[4]);"
    "sys.exit(int(os.environ.get('CI', '0')))"
)

FEED = "https://pkgs.dev.azure.test/org/_packaging/feed/nuget/v3/index.json"
SECRET_ENV = "DABBLER_FEED_PAT_TEST"
SECRET_VALUE = "pat-0123456789abcdef"


def _git(cwd, *args):
    return subprocess.run(
        ["git", "-C", str(cwd), *args], capture_output=True, text=True,
    )


def packaging_config(push_log, *, artifacts=("thing-1.0.nupkg",), **overrides):
    block = {
        "pack": {
            "argv": [
                sys.executable, "-c", PACK_SRC, "{output}", *artifacts,
            ],
        },
        "push": {
            "argv": [
                sys.executable, "-c", PUSH_SRC, str(push_log),
                "{artifact}", "{feed}", "{secret}",
            ],
            "feed": FEED,
            "secret": SECRET_ENV,
        },
    }
    for key, value in overrides.items():
        block[key].update(value)
    return make_config(packaging=block)


@pytest.fixture
def push_log(tmp_path):
    return tmp_path / "pushes.json"


@pytest.fixture
def publishable(sandbox_repo, monkeypatch):
    """A session that may publish: declared releasable before the work, then
    verified, committed, pushed and left with a clean tree."""
    repo, sessions_dir = sandbox_repo
    register_session_start(sessions_dir, 1, engine="claude-code",
                           provider="anthropic")
    declare_session_task(
        sessions_dir, session_number=1, task="ship the widget", releasable=True,
    )
    (repo / "widget.py").write_text("WIDGET = 1\n", encoding="utf-8")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "work")
    _git(repo, "push", "-q")
    ledger.append_round(repo, 1, {
        "round": 1,
        "verdict": "VERIFIED",
        "blocking": False,
        "verifier_model": "gpt-5-4",
        "verifier_provider": "openai",
        "findings": [],
        "completion_tree": snapshot_worktree_tree(repo),
        "recorded_at": datetime.datetime.now().astimezone().isoformat(),
    })
    monkeypatch.setenv(SECRET_ENV, SECRET_VALUE)
    return repo, sessions_dir


def pushes(push_log):
    return json.loads(push_log.read_text(encoding="utf-8"))


class TestTheDeclaration:
    """A repository publishes because it said how. Nothing here is inferred
    from a language nobody named."""

    def test_a_repository_that_declares_nothing_loads_nothing(self):
        assert load_declaration(make_config()) is None

    @pytest.mark.parametrize("half, drop", [
        ("pack", "{output}"),
        ("push", "{artifact}"),
        ("push", "{feed}"),
        ("push", "{secret}"),
    ])
    def test_a_command_that_takes_a_supplied_value_elsewhere_is_refused(
            self, push_log, half, drop):
        """Each placeholder is the framework's only route for one fact. A
        command missing one takes that fact from somewhere the record cannot
        see -- an ambient credential, a stale output directory, a feed the
        record names but the command never used."""
        config = packaging_config(push_log)
        argv = [a for a in config["packaging"][half]["argv"] if a != drop]
        config["packaging"][half]["argv"] = argv
        with pytest.raises(PackagingConfigError, match=re.escape(drop)):
            load_declaration(config)

    def test_the_shipped_schema_declares_the_block_an_operator_overlays(
            self, tmp_path, monkeypatch, push_log):
        """The feed and the credential's name are machine facts, so they
        arrive through `local-overrides.yaml`. An overlay key the schema does
        not declare is refused at load, so a block the schema forgot would be
        undeclarable rather than merely undocumented."""
        subprocess.run(
            ["git", "init", "-q"], cwd=str(tmp_path), capture_output=True,
        )
        monkeypatch.chdir(tmp_path)
        (tmp_path / "local-overrides.yaml").write_text(
            yaml.safe_dump(
                {"packaging": packaging_config(push_log)["packaging"]}
            ),
            encoding="utf-8",
        )
        declaration = load_declaration(load_config())
        assert declaration.push.feed == FEED
        assert declaration.push.secret == SECRET_ENV


class TestWhoMayPublish:
    """Step (a) decides, step (f) reads. The order is the point: a session
    that declares after the work is a model choosing in hindsight."""

    @pytest.mark.parametrize("declaration", [None, False])
    def test_a_session_that_may_not_publish_does_not(
            self, sandbox_repo, push_log, declaration):
        """Two shapes of the same answer: a session that declared `no`, and
        one that never declared at all. `session_is_releasable` fails closed,
        so the absent declaration is a refusal rather than an unknown."""
        repo, sessions_dir = sandbox_repo
        register_session_start(sessions_dir, 1, engine="claude-code",
                               provider="anthropic")
        if declaration is not None:
            declare_session_task(
                sessions_dir, session_number=1, task="refactor only",
                releasable=declaration,
            )
        run = package(sessions_dir, config=packaging_config(push_log))
        assert run.outcome == OUTCOME_REFUSED
        assert run.releasable is False
        assert "releasable" in run.refusal
        assert not push_log.exists()

    def test_a_releasable_session_in_a_repository_with_no_feed_is_refused(
            self, publishable):
        repo, sessions_dir = publishable
        run = package(sessions_dir, config=make_config())
        assert run.outcome == OUTCOME_REFUSED
        assert "publishes nothing" in run.refusal

    def test_the_order_is_proved_by_the_gates_not_by_the_command_sequence(
            self, publishable, push_log):
        """§3.f runs after (e). 'After' means the evidence exists, so work
        left unpushed refuses the publication rather than shipping a tree the
        remote has never seen."""
        repo, sessions_dir = publishable
        (repo / "widget.py").write_text("WIDGET = 2\n", encoding="utf-8")
        _git(repo, "add", "-A")
        _git(repo, "commit", "-q", "-m", "more work")
        run = package(sessions_dir, config=packaging_config(push_log))
        assert run.outcome == OUTCOME_REFUSED
        assert "pushed_to_remote" in run.refusal
        assert not push_log.exists()

    def test_a_missing_credential_refuses_before_anything_is_built(
            self, publishable, push_log, monkeypatch):
        repo, sessions_dir = publishable
        monkeypatch.delenv(SECRET_ENV, raising=False)
        run = package(sessions_dir, config=packaging_config(push_log))
        assert run.outcome == OUTCOME_REFUSED
        assert SECRET_ENV in run.refusal
        assert not ledger.package_output_dir(repo, 1).exists()


class TestThePublication:
    def test_pack_then_push_once_per_artifact(self, publishable, push_log):
        repo, sessions_dir = publishable
        run = package(sessions_dir, config=packaging_config(
            push_log, artifacts=("a-1.0.nupkg", "b-1.0.nupkg"),
        ))
        assert run.outcome == OUTCOME_PUBLISHED, run.refusal
        assert run.artifacts == ("a-1.0.nupkg", "b-1.0.nupkg")
        assert [row["argv"][0] for row in pushes(push_log)] == [
            str(ledger.package_output_dir(repo, 1) / name)
            for name in run.artifacts
        ]
        assert [s.step for s in run.steps] == ["pack", "push", "push"]
        assert run.tree_digest == snapshot_worktree_tree(repo)

    def test_pack_writes_into_the_run_directory_leaving_the_tree_alone(
            self, publishable, push_log):
        """The tree that was verified stays the tree that was verified, and
        the artifacts land where the record can name them."""
        repo, sessions_dir = publishable
        package(sessions_dir, config=packaging_config(push_log))
        output = ledger.package_output_dir(repo, 1)
        assert (output / "thing-1.0.nupkg").is_file()
        assert _git(repo, "status", "--porcelain").stdout.strip() == ""

    def test_a_stale_artifact_from_a_previous_run_is_not_published(
            self, publishable, push_log):
        repo, sessions_dir = publishable
        output = ledger.package_output_dir(repo, 1)
        output.mkdir(parents=True, exist_ok=True)
        (output / "last-week-9.9.nupkg").write_text("old", encoding="utf-8")
        run = package(sessions_dir, config=packaging_config(push_log))
        assert run.artifacts == ("thing-1.0.nupkg",)
        assert not (output / "last-week-9.9.nupkg").exists()

    def test_a_pack_that_produced_nothing_is_refused_not_reported_published(
            self, publishable, push_log):
        repo, sessions_dir = publishable
        run = package(sessions_dir, config=packaging_config(push_log, artifacts=()))
        assert run.outcome == OUTCOME_REFUSED
        assert "nothing to push" in run.refusal
        assert not push_log.exists()

    def test_a_pack_that_dirties_the_repository_publishes_nothing(
            self, publishable, push_log):
        """A build that leaves intermediates behind has produced artifacts
        from a tree nobody verified. The exit code says it worked; the tree
        says the result is not about the code that was reviewed, and the tree
        wins -- the same rule a check that mutates its own subject gets."""
        repo, sessions_dir = publishable
        config = packaging_config(push_log)
        config["packaging"]["pack"]["argv"] = [
            sys.executable, "-c", DIRTY_PACK_SRC, "{output}",
            str(repo / "obj.log"),
        ]
        run = package(sessions_dir, config=config)
        assert run.outcome == OUTCOME_FAILED
        assert run.tree_mutated is True
        assert run.post_tree_digest != run.tree_digest
        assert not push_log.exists()

    def test_a_rejected_push_stops_the_release_at_the_first_failure(
            self, publishable, push_log, monkeypatch):
        """A feed holding half a release beside a record claiming it
        published is worse than a failure that stopped where it stopped.
        CI is on the child-environment allowlist, so the stub exits on it."""
        monkeypatch.setenv("CI", "1")
        repo, sessions_dir = publishable
        run = package(sessions_dir, config=packaging_config(
            push_log, artifacts=("a-1.0.nupkg", "b-1.0.nupkg"),
        ))
        assert run.outcome == OUTCOME_FAILED
        assert [s.step for s in run.steps] == ["pack", "push"]
        assert len(pushes(push_log)) == 1


class TestTheCredential:
    def test_the_value_reaches_the_command_and_no_environment(
            self, publishable, push_log, monkeypatch):
        """The PAT is substituted into one argv element. The child's
        environment is the allowlist, so neither the credential nor the
        operator's other secrets are inherited."""
        monkeypatch.setenv("DABBLER_ANTHROPIC_API_KEY", "sk-should-not-travel")
        repo, sessions_dir = publishable
        run = package(sessions_dir, config=packaging_config(push_log))
        assert run.outcome == OUTCOME_PUBLISHED, run.refusal
        row = pushes(push_log)[0]
        assert row["argv"][2] == SECRET_VALUE
        assert SECRET_ENV not in row["env"]
        assert "DABBLER_ANTHROPIC_API_KEY" not in row["env"]

    def test_the_record_keeps_the_placeholder_and_scrubs_the_output(
            self, publishable, push_log):
        """A credential that reaches a log has leaked whether or not it
        reached an environment, so the recorded command still says
        `{secret}` and the tool's own echo of it is scrubbed."""
        repo, sessions_dir = publishable
        run = package(sessions_dir, config=packaging_config(push_log))
        push_step = run.steps[-1]
        assert "{secret}" in push_step.command
        assert "pushing with token {secret}" in push_step.output
        assert SECRET_VALUE not in json.dumps(run.as_record())


class TestTheRecord:
    def test_refusals_and_publications_append_to_one_validated_ledger(
            self, publishable, push_log, monkeypatch):
        """A record holding only the successes cannot be read as a history
        of what was released, so a refusal files beside a publication."""
        repo, sessions_dir = publishable
        monkeypatch.delenv(SECRET_ENV, raising=False)
        record(sessions_dir, package(sessions_dir, config=packaging_config(push_log)))
        monkeypatch.setenv(SECRET_ENV, SECRET_VALUE)
        record(sessions_dir, package(sessions_dir, config=packaging_config(push_log)))
        rows = ledger.read_packaging(repo, 1)
        assert [r["outcome"] for r in rows] == [
            OUTCOME_REFUSED, OUTCOME_PUBLISHED,
        ]
        assert rows[-1]["feed"] == FEED
        assert rows[-1]["secret_name"] == SECRET_ENV

    def test_a_dry_run_shows_the_gates_and_runs_nothing(
            self, publishable, push_log):
        repo, sessions_dir = publishable
        run = package(
            sessions_dir, config=packaging_config(push_log), dry_run=True,
        )
        assert run.ready is True
        assert [g["passed"] for g in run.gates] == [True] * 5
        assert not push_log.exists()
        assert not ledger.packaging_path(repo, 1).exists()
