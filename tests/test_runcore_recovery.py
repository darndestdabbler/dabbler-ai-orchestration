"""Crash windows, freshness, guidance, organization, and prepared worktrees.

Each test kills the framework at one specific moment and proves the journal
still explains the run — recovery is idempotent, and nothing is ever done
twice because the record of doing it was lost.
"""

import subprocess


from ai_router import journal, runcore, runproject
from tests.conftest import StubTransport, cli, reconfigure

REGISTER = (
    "run", "--register", "--set", "001-default", "--session", "1",
    "--engine", "claude-code", "--provider", "anthropic", "--model", "sonnet",
)
REGISTER_VERIFIED = (
    "run", "--register", "--set", "001-default", "--session", "2",
    "--engine", "claude-code", "--provider", "anthropic", "--model", "sonnet",
)


def _register(argv=REGISTER):
    code, payload = cli(*argv)
    assert code == 0, payload
    return payload


def _edit(repo, text="VALUE = 2\n"):
    (repo / "app.py").write_text(text, encoding="utf-8")


def _events(root, kind):
    return [e for e in journal.read_events(root) if e["event_type"] == kind]


# --- Crash windows ----------------------------------------------------------

def test_a_lost_projection_write_is_healed_by_the_journal(
    run_repo, run_config
):
    started = _register()
    root = journal.control_root()
    _edit(run_repo)
    cli("checkpoint", "--run", started["run_id"], "--note", "mid-flight")
    # The coordinator died after the append and before the atomic replace.
    journal.projection_path(root).write_text("{}", encoding="utf-8")

    code, status = cli("status")
    assert code == 0
    assert status["projection_revision"] == journal.tail_sequence(root)
    assert status["runs"][0]["state"] == "running"

    code, resumed = cli("resume", "--run", started["run_id"])
    assert code == 0 and resumed["probe"]["ok"]
    code, finished = cli("finish", "--run", started["run_id"])
    assert code == 0 and finished["outcome"] == "completed"


def test_a_created_run_accepts_exactly_one_later_registration(
    run_repo, run_config
):
    root = journal.control_root()
    code, prepared = cli(
        "worktree", "create", "--set", "001-default", "--session", "1"
    )
    assert code == 0, prepared
    assert prepared["state"] == "ready"

    code, status = cli("status", "--run", prepared["run_id"])
    assert status["run"]["state"] == "created"

    argv = [
        "run", "--register", "--run", prepared["run_id"],
        "--engine", "claude-code", "--provider", "anthropic",
        "--model", "sonnet",
    ]
    worktree = prepared["worktree_id"]
    code, payload = _cli_in(worktree, *argv)
    assert code == 0, payload
    assert payload["state"] == "running"

    code, again = _cli_in(worktree, *argv)
    assert code == 2 and again["refused"] == "wrong-state"
    assert len(_events(root, "run.started")) == 1


def _cli_in(directory, *argv):
    import os

    previous = os.getcwd()
    os.chdir(directory)
    try:
        return cli(*argv)
    finally:
        os.chdir(previous)


def test_an_interrupted_check_never_becomes_evidence(run_repo, run_config):
    started = _register()
    _edit(run_repo)
    root = journal.control_root()
    journal.append(
        root, event_type="check.started", run_id=started["run_id"],
        attempt=1, actor=journal.actor("framework", "checks"),
        summary="targeted unit",
        payload={
            "check_id": "unit", "stage": "targeted", "command": "x",
            "tree_digest": "deadbeef",
            "selection": {
                "selected": [], "risks": [], "allTestsAffected": False,
                "allAffectedReason": "",
            },
        },
    )
    runproject.write_projection(root)

    code, resumed = cli("resume", "--run", started["run_id"])
    assert code == 0, resumed
    assert resumed["probe"]["interrupted_check"] == "unit"
    assert resumed["probe"]["ok"] is True

    code, payload = cli("check", "--run", started["run_id"])
    assert code == 0
    assert {c["check_id"] for c in payload["checks"]} == {"unit", "lint"}


def test_an_orphaned_dispatch_is_recorded_as_a_failed_attempt(
    run_repo, run_config, monkeypatch, provider_keys
):
    stub = StubTransport([])
    from ai_router.transports.api import DirectApiTransport

    monkeypatch.setattr(
        DirectApiTransport, "dispatch", lambda self, **kw: stub.dispatch(**kw)
    )
    started = _register(REGISTER_VERIFIED)
    _edit(run_repo)
    root = journal.control_root()

    # Dispatch the round, then lose the process before its result lands.
    from ai_router import verifyjob
    from ai_router.config import load_config
    from ai_router.evidence import snapshot_worktree_tree
    from ai_router.runcli import _emit, _view

    view = _view(root, started["run_id"])
    tree = snapshot_worktree_tree(run_repo)
    manifest, _, _ = verifyjob.build_evidence(
        root, view, run_repo, tree, 1,
        journal.read_events(root, run_id=view.run_id),
    )
    request = verifyjob.build_request(
        view, load_config(), round_number=1, tree_digest=tree,
        manifest=manifest,
    )
    _emit(root, [{
        "event_type": "verification.dispatched", "run_id": view.run_id,
        "attempt": 1, "actor": journal.actor("framework", "verifyjob"),
        "summary": "round 1 dispatched",
        "payload": verifyjob._strip_bodies(request),
    }])

    code, resumed = cli("resume", "--run", started["run_id"])
    assert code == 0, resumed
    result = _events(root, "verification.result")[0]["payload"]
    assert result["error_class"] == "interrupted"
    assert result["verdict"] is None
    assert resumed["state"] == "running"

    stub.responses = ["VERIFIED\n\nchecked\n"]
    code, second = cli("verify", "--run", started["run_id"])
    assert code == 0, second
    assert second["round"] == 1 and second["verdict"] == "VERIFIED"


def _drop_last_event(root):
    """Lose the final journal line, as a kill between the commit and the
    ``run.finished`` that records it would."""
    path = journal.journal_path(root)
    lines = path.read_bytes().splitlines(keepends=True)
    path.write_bytes(b"".join(lines[:-1]))
    runproject.write_projection(root)


def _count_commits(repo):
    return subprocess.run(
        ["git", "-C", str(repo), "rev-list", "--count", "HEAD"],
        capture_output=True, text=True,
    ).stdout.strip()


def test_a_proven_commit_before_run_finished_is_adopted_not_repeated(
    run_repo, run_config
):
    started = _register()
    _edit(run_repo)
    code, finished = cli("finish", "--run", started["run_id"])
    assert code == 0, finished
    root = journal.control_root()

    # The commit landed and its checks are on the record for that exact
    # tree; only the closing event was lost.
    _drop_last_event(root)
    before = _count_commits(run_repo)

    code, resumed = cli("resume", "--run", started["run_id"])
    assert code == 0, resumed
    assert resumed["state"] == "completed"
    assert resumed["commit"] == finished["commit"]
    assert _count_commits(run_repo) == before
    assert len(_events(root, "run.finished")) == 1


def test_an_unproven_commit_is_not_adopted_as_a_completion(
    run_repo, run_config
):
    """A trailer is text anyone can type. Recovery closes a run on a commit
    only when the evidence a completion requires is on the record for that
    exact tree; otherwise the run parks and names what is missing."""
    started = _register()
    _edit(run_repo)
    root = journal.control_root()
    subprocess.run(
        ["git", "-C", str(run_repo), "add", "-A"], capture_output=True,
    )
    subprocess.run(
        ["git", "-C", str(run_repo), "commit", "-q", "-m",
         f"First work session\n\nDabbler-Run: {started['run_id']}\n"],
        capture_output=True,
    )

    code, resumed = cli("resume", "--run", started["run_id"])
    assert code == 0, resumed
    assert resumed["state"] == "waiting"
    assert not _events(root, "run.finished")

    question = _events(root, "run.waiting")[-1]["payload"]["question"]
    assert "not backed by the evidence" in question
    assert "no final-full result for check 'unit'" in question


def test_a_verified_run_is_not_adopted_without_its_verdict(
    run_repo, run_config, monkeypatch, provider_keys
):
    stub = StubTransport([])
    from ai_router.transports.api import DirectApiTransport

    monkeypatch.setattr(
        DirectApiTransport, "dispatch", lambda self, **kw: stub.dispatch(**kw)
    )
    started = _register(REGISTER_VERIFIED)
    _edit(run_repo)
    root = journal.control_root()
    subprocess.run(
        ["git", "-C", str(run_repo), "add", "-A"], capture_output=True,
    )
    subprocess.run(
        ["git", "-C", str(run_repo), "commit", "-q", "-m",
         f"Review the parser\n\nDabbler-Run: {started['run_id']}\n"],
        capture_output=True,
    )

    code, resumed = cli("resume", "--run", started["run_id"])
    assert code == 0, resumed
    assert resumed["state"] == "waiting"
    assert not _events(root, "run.finished")
    assert stub.calls == []

    question = _events(root, "run.waiting")[-1]["payload"]["question"]
    assert "no accepted verification is bound to the committed tree" in question


def test_a_probe_failure_names_the_discrepancy(run_repo, run_config):
    started = _register()
    subprocess.run(
        ["git", "-C", str(run_repo), "commit", "-q", "--allow-empty", "-m",
         "unrelated work"],
        capture_output=True,
    )

    code, payload = cli("resume", "--run", started["run_id"])
    assert code == 0, payload
    assert payload["state"] == "waiting"
    assert not payload["probe"]["ok"]
    assert "not the recorded base" in " ".join(payload["probe"]["findings"])


# --- Guidance ---------------------------------------------------------------

def test_guidance_stays_pending_until_acknowledged(run_repo, run_config):
    started = _register()
    code, payload = cli(
        "guidance", "--run", started["run_id"], "--text",
        "prefer the streaming parser", "--attest-operator",
    )
    assert code == 0, payload
    sequence = payload["sequence"]

    code, status = cli("status", "--run", started["run_id"])
    assert status["run"]["pending_guidance"] == 1

    code, acked = cli(
        "checkpoint", "--run", started["run_id"], "--note", "read it",
        "--ack-guidance-through", str(sequence),
    )
    assert code == 0 and acked["pending_guidance"] == 0


def test_acknowledging_beyond_the_latest_guidance_is_refused(
    run_repo, run_config
):
    started = _register()
    code, payload = cli(
        "checkpoint", "--run", started["run_id"], "--note", "n",
        "--ack-guidance-through", "99",
    )
    assert code == 2
    assert payload["refused"] == "ack-exceeds-guidance"


def test_guidance_requires_the_operator_attestation(run_repo, run_config):
    started = _register()
    code, payload = cli("guidance", "--run", started["run_id"], "--text", "x")
    assert code == 2
    assert payload["refused"] == "attestation-required"


def test_answering_the_current_wait_resumes_exactly_that_sequence(
    run_repo, run_config
):
    started = _register()
    root = journal.control_root()
    _edit(run_repo)
    view = runcore.load_run(root, started["run_id"])
    journal.append(
        root, event_type="run.waiting", run_id=view.run_id, attempt=1,
        actor=journal.actor("framework", "runcore"), summary="paused",
        payload={"reason": "operator", "question": "which parser?"},
    )
    runproject.write_projection(root)
    waiting_at = journal.tail_sequence(root)

    code, stale = cli(
        "guidance", "--run", view.run_id, "--text", "the streaming one",
        "--answer", str(waiting_at - 1), "--resume", "--attest-operator",
    )
    assert code == 2 and stale["refused"] == "stale-wait-sequence"

    code, answered = cli(
        "guidance", "--run", view.run_id, "--text", "the streaming one",
        "--answer", str(waiting_at), "--resume", "--attest-operator",
    )
    assert code == 0, answered
    assert answered["state"] == "running"
    resumed = _events(root, "run.resumed")[0]
    assert resumed["payload"]["answered_sequence"] == waiting_at


# --- Organization -----------------------------------------------------------

def test_a_new_set_is_declared_and_committed_on_its_own(run_repo, run_config):
    code, payload = cli(
        "organize", "set", "create", "--title", "API objectives",
        "--objective", "Ship the public surface",
    )
    assert code == 0, payload
    assert payload["set_slug"] == "002-api-objectives"

    subject = subprocess.run(
        ["git", "-C", str(run_repo), "log", "-1", "--format=%s"],
        capture_output=True, text=True,
    ).stdout.strip()
    assert subject == "Declare session set 002-api-objectives"

    code, status = cli("status")
    slugs = [s["slug"] for s in status["session_sets"]]
    assert slugs == ["001-default", "002-api-objectives"]


def test_a_session_is_appended_with_its_declared_policy(run_repo, run_config):
    code, payload = cli(
        "organize", "session", "add", "--set", "001-default",
        "--title", "Harden the loader", "--policy", "verified",
    )
    assert code == 0, payload
    assert payload["session_number"] == 3

    code, status = cli("status")
    session = status["session_sets"][0]["sessions"][2]
    assert session["title"] == "Harden the loader"
    assert session["policy"] == "verified"


def test_cancelling_a_session_with_a_live_run_is_refused(
    run_repo, run_config
):
    _register()
    code, payload = cli(
        "organize", "cancel", "--set", "001-default", "--session", "1",
        "--reason", "deferred", "--attest-operator",
    )
    assert code == 2
    assert payload["refused"] == "run-already-live"


def test_a_cancelled_session_cannot_start_and_restore_reopens_it(
    run_repo, run_config
):
    code, payload = cli(
        "organize", "cancel", "--set", "001-default", "--session", "1",
        "--reason", "deferred", "--attest-operator",
    )
    assert code == 0 and payload["state"] == "cancelled"

    code, refused = cli(*REGISTER)
    assert code == 2 and refused["refused"] == "session-cancelled"

    code, restored = cli(
        "organize", "restore", "--set", "001-default", "--session", "1",
        "--reason", "back on", "--attest-operator",
    )
    assert code == 0 and restored["state"] == "not-started"
    assert cli(*REGISTER)[0] == 0


def test_a_spec_edit_alone_moves_the_organization_digest(
    run_repo, run_config
):
    code, before = cli("status")
    spec = run_repo / "docs" / "session-sets" / "001-default" / "spec.md"
    spec.write_text(
        spec.read_text(encoding="utf-8") + "\n### Session 3: Extra\n",
        encoding="utf-8",
    )

    code, after = cli("status")
    assert code == 0
    assert after["organization_digest"] != before["organization_digest"]
    assert after["projection_revision"] == before["projection_revision"]
    assert len(after["session_sets"][0]["sessions"]) == 3


def test_an_invalid_spec_diagnoses_without_hiding_its_runs(
    run_repo, run_config
):
    started = _register()
    spec = run_repo / "docs" / "session-sets" / "001-default" / "spec.md"
    spec.write_text(
        "## Sessions\n\n### Session 1: A\n\n### Session 1: A again\n",
        encoding="utf-8",
    )

    code, status = cli("status")
    assert code == 0
    details = " ".join(d["detail"] for d in status["diagnostics"])
    assert "more than once" in details and "no '# <title>'" in details
    assert [r["run_id"] for r in status["runs"]] == [started["run_id"]]


# --- Prepared worktrees -----------------------------------------------------

def test_preparation_from_a_dirty_main_worktree_copies_no_wip(
    run_repo, run_config
):
    (run_repo / "wip.txt").write_text("scratch\n", encoding="utf-8")
    _edit(run_repo, "VALUE = 999\n")

    code, prepared = cli(
        "worktree", "create", "--set", "001-default", "--session", "1"
    )
    assert code == 0, prepared
    from pathlib import Path

    target = Path(prepared["worktree_id"])
    assert not (target / "wip.txt").exists()
    assert (target / "app.py").read_text(encoding="utf-8") == "VALUE = 1\n"


def test_worktree_per_run_refuses_an_in_place_registration(
    run_repo, run_config
):
    reconfigure(run_repo, run_config, git={"worktree_per_run": True})
    code, payload = cli(*REGISTER)
    assert code == 2
    assert payload["refused"] == "worktree-preparation-required"


def test_removing_a_prepared_run_cancels_it_first(run_repo, run_config):
    code, prepared = cli(
        "worktree", "create", "--set", "001-default", "--session", "1"
    )
    assert code == 0
    code, removed = cli("worktree", "remove", "--run", prepared["run_id"])
    assert code == 0, removed
    assert removed["state"] == "cancelled"

    from pathlib import Path

    assert not Path(prepared["worktree_id"]).exists()


def test_a_failed_init_task_names_itself_and_retries(run_repo, run_config):
    import sys

    reconfigure(run_repo, run_config, worktree={"init": [{
        "id": "impossible",
        "argv": [sys.executable, "-c", "import sys; sys.exit(3)"],
    }]})
    code, prepared = cli(
        "worktree", "create", "--set", "001-default", "--session", "1"
    )
    assert code == 0, prepared
    assert prepared["state"] == "failed"
    assert prepared["tasks"][0]["exit_code"] == 3

    reconfigure(run_repo, run_config, worktree={"init": [{
        "id": "impossible",
        "argv": [sys.executable, "-c", "import sys; sys.exit(0)"],
    }]})
    code, retried = cli("worktree", "init", "--run", prepared["run_id"])
    assert code == 0 and retried["state"] == "ready"


# --- Freshness --------------------------------------------------------------

def test_a_fast_run_runs_the_complete_suite_once_at_finish(
    run_repo, run_config
):
    started = _register()
    _edit(run_repo)
    for note in ("one", "two", "three"):
        cli("checkpoint", "--run", started["run_id"], "--note", note)
    code, finished = cli("finish", "--run", started["run_id"])
    assert code == 0, finished

    root = journal.control_root()
    stages = [
        e["payload"]["stage"] for e in _events(root, "check.started")
    ]
    assert stages.count("final-full") == 1
    assert stages.count("targeted") == 0
