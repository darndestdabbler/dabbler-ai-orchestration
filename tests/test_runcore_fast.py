"""The ``fast`` policy end to end: register, work, finish, commit — and the
preconditions that keep that path honest."""

import json
import subprocess


from ai_router import journal, runproject
from tests.conftest import cli

REGISTER = (
    "run", "--register", "--set", "001-default", "--session", "1",
    "--engine", "claude-code", "--provider", "anthropic", "--model", "sonnet",
)


def _register(**overrides):
    argv = list(REGISTER)
    for flag, value in overrides.items():
        argv += [f"--{flag.replace('_', '-')}", str(value)]
    code, payload = cli(*argv)
    assert code == 0, payload
    return payload


def _edit(repo, text="VALUE = 2\n"):
    (repo / "app.py").write_text(text, encoding="utf-8")


def test_fast_run_registers_works_and_commits(run_repo, run_config):
    started = _register()
    assert started["policy"] == "fast"
    assert started["state"] == "running"

    _edit(run_repo)
    code, finished = cli("finish", "--run", started["run_id"])
    assert code == 0, finished
    assert finished["outcome"] == "completed"

    log = subprocess.run(
        ["git", "-C", str(run_repo), "log", "-1", "--format=%B"],
        capture_output=True, text=True,
    ).stdout
    assert f"Dabbler-Run: {started['run_id']}" in log
    assert "First work session" in log


def test_fast_makes_zero_framework_model_calls(
    run_repo, run_config, no_model_calls
):
    started = _register()
    _edit(run_repo)
    cli("checkpoint", "--run", started["run_id"], "--note", "edited app")
    code, finished = cli("finish", "--run", started["run_id"])
    assert code == 0 and finished["outcome"] == "completed"


def test_the_four_documents_are_generated(run_repo, run_config):
    started = _register()
    _edit(run_repo)
    cli("finish", "--run", started["run_id"])

    set_dir = run_repo / "docs" / "session-sets" / "001-default"
    state = json.loads((set_dir / "session-state.json").read_text(encoding="utf-8"))
    assert state["schemaVersion"] == 5
    assert state["sessions"][0]["status"] == "complete"
    assert (set_dir / "activity-log.json").is_file()
    assert started["run_id"] in (set_dir / "change-log.md").read_text(encoding="utf-8")


def test_the_journal_replays_to_a_byte_identical_projection(run_repo, run_config):
    started = _register()
    _edit(run_repo)
    cli("finish", "--run", started["run_id"])

    root = journal.control_root()
    path = journal.projection_path(root)
    first = path.read_bytes()
    journal.projection_path(root).unlink()
    runproject.write_projection(root)
    assert path.read_bytes() == first


def test_registration_refuses_a_dirty_worktree(run_repo, run_config):
    _edit(run_repo)
    code, payload = cli(*REGISTER)
    assert code == 2
    assert payload["refused"] == "dirty-worktree"


def test_a_second_live_run_in_one_worktree_is_refused(run_repo, run_config):
    _register()
    code, payload = cli(
        "run", "--register", "--set", "001-default", "--session", "2",
        "--engine", "claude-code", "--provider", "anthropic",
        "--model", "sonnet",
    )
    assert code == 2
    assert payload["refused"] == "run-already-live"


def test_an_empty_diff_cannot_be_completed(run_repo, run_config):
    started = _register()
    code, payload = cli("finish", "--run", started["run_id"])
    assert code == 2
    assert payload["refused"] == "no-changes"


def test_a_failing_required_check_commits_nothing(run_repo, run_config):
    started = _register()
    _edit(run_repo)
    (run_repo / "FAIL").write_text("", encoding="utf-8")
    code, payload = cli("finish", "--run", started["run_id"])
    assert code == 2
    assert payload["refused"] == "checks-not-green"

    head = subprocess.run(
        ["git", "-C", str(run_repo), "log", "-1", "--format=%s"],
        capture_output=True, text=True,
    ).stdout.strip()
    assert head == "declare checks"


def test_an_honest_failure_is_recordable(run_repo, run_config):
    started = _register()
    _edit(run_repo)
    code, payload = cli(
        "finish", "--run", started["run_id"], "--outcome", "failed"
    )
    assert code == 0
    assert payload["outcome"] == "failed" and payload["commit"] is None


def test_an_asserted_provider_that_the_model_contradicts_is_refused(
    run_repo, run_config
):
    code, payload = cli(
        "run", "--register", "--set", "001-default", "--session", "1",
        "--engine", "claude-code", "--provider", "openai", "--model", "sonnet",
    )
    assert code == 2
    assert payload["refused"] == "identity-mismatch"


def test_wrapped_mode_is_not_enabled_in_this_slice(run_repo, run_config):
    code, payload = cli(*REGISTER, "--mode", "wrapped")
    assert code == 2
    assert payload["refused"] == "host-adapter-not-enabled"


def test_an_unknown_session_is_refused(run_repo, run_config):
    code, payload = cli(
        "run", "--register", "--set", "001-default", "--session", "9",
        "--engine", "claude-code", "--provider", "anthropic",
        "--model", "sonnet",
    )
    assert code == 2
    assert payload["refused"] == "unknown-session"


def test_the_commit_carries_exactly_the_accepted_tree(run_repo, run_config):
    started = _register()
    _edit(run_repo)
    code, finished = cli("finish", "--run", started["run_id"])
    assert code == 0

    root = journal.control_root()
    finish_event = [
        e for e in journal.read_events(root)
        if e["event_type"] == "run.finished"
    ][-1]
    committed_tree = subprocess.run(
        ["git", "-C", str(run_repo), "rev-parse", f"{finished['commit']}^{{tree}}"],
        capture_output=True, text=True,
    ).stdout.strip()
    assert committed_tree == finish_event["payload"]["tree_digest"]


def test_machine_state_never_enters_the_commit(run_repo, run_config):
    started = _register()
    _edit(run_repo)
    code, finished = cli("finish", "--run", started["run_id"])
    assert code == 0

    listing = subprocess.run(
        ["git", "-C", str(run_repo), "ls-tree", "-r", "--name-only",
         finished["commit"]],
        capture_output=True, text=True,
    ).stdout
    assert ".dabbler/" not in listing
    assert "session-state.json" not in listing
    assert "activity-log.json" not in listing


def test_a_check_that_mutates_the_tree_is_not_green(run_repo, run_config):
    mutating = run_repo / "checkrunner.py"
    mutating.write_text(
        "import pathlib\n"
        "pathlib.Path('side-effect.txt').write_text('x')\n",
        encoding="utf-8",
    )
    subprocess.run(
        ["git", "-C", str(run_repo), "commit", "-qam", "mutating runner"],
        capture_output=True,
    )
    started = _register()
    _edit(run_repo)
    code, payload = cli("finish", "--run", started["run_id"])
    assert code == 2
    assert payload["refused"] == "checks-not-green"

    root = journal.control_root()
    completed = [
        e["payload"] for e in journal.read_events(root)
        if e["event_type"] == "check.completed"
    ]
    assert any(p["tree_mutated"] for p in completed)


def test_status_rebuilds_a_deleted_projection(run_repo, run_config):
    started = _register()
    root = journal.control_root()
    journal.projection_path(root).unlink()

    code, payload = cli("status")
    assert code == 0
    assert payload["projection_revision"] == journal.tail_sequence(root)
    assert payload["runs"][0]["run_id"] == started["run_id"]


def test_status_after_returns_a_contiguous_suffix(run_repo, run_config):
    started = _register()
    cli("checkpoint", "--run", started["run_id"], "--note", "one")

    code, payload = cli("status", "--after", "1")
    assert code == 0
    assert [e["sequence"] for e in payload["events"]] == [2, 3]


def test_status_refuses_a_future_revision(run_repo, run_config):
    _register()
    code, payload = cli("status", "--after", "99")
    assert code == 2
    assert payload["refused"] == "future-revision"


def test_a_stored_sequence_gap_is_an_operational_error(run_repo, run_config):
    _register()
    root = journal.control_root()
    path = journal.journal_path(root)
    lines = path.read_bytes().splitlines(keepends=True)
    path.write_bytes(
        lines[0] + lines[1].replace(b'"sequence":2', b'"sequence":7')
    )

    code, payload = cli("status", "--rebuild")
    assert code == 1
    assert payload["error"] == "journal-corrupt"
