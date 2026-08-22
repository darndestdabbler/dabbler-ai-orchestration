"""The run core's two structural claims: it depends on nothing the cutover
deletes, and its refresh stays inside the Explorer's freshness contract."""

import ast
import subprocess
import sys
import time
from pathlib import Path

import pytest

from ai_router import journal, runproject

RUN_CORE = (
    "journal", "runcore", "runproject", "checks", "verifyjob", "runcli",
)

# §13's cutover table. Every one of these is deleted or reduced in the same
# merge that lands the run core, so a run-core module importing one would
# make the reported size reduction fictional: the module could not actually
# be removed.
DELETED_AT_CUTOVER = frozenset({
    "session", "verify", "gates", "writers", "affected", "test_evidence",
    "evidence", "facts", "plan_review", "approved_plan", "ledger",
})

# §8.1: an event or spec change appears in the tree within two seconds.
FRESHNESS_BUDGET_SECONDS = 2.0
LONG_JOURNAL_EVENTS = 1000


def _imports(module: str) -> set:
    """Sibling modules *module* imports, at any depth in the file."""
    source = Path("ai_router") / f"{module}.py"
    tree = ast.parse(source.read_text(encoding="utf-8"), str(source))
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.level == 1:
            if node.module:
                found.add(node.module.split(".")[0])
            else:
                found.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.startswith("ai_router."):
                    found.add(alias.name.split(".")[1])
    return found


@pytest.mark.parametrize("module", RUN_CORE)
def test_the_run_core_imports_nothing_the_cutover_deletes(module):
    offenders = sorted(_imports(module) & DELETED_AT_CUTOVER)
    assert not offenders, (
        f"ai_router/{module}.py imports {offenders}, which §13 deletes at "
        "cutover. A replacement that depends on what it replaces cannot "
        "subtract anything."
    )


def test_the_run_core_is_importable_without_the_old_lifecycle(tmp_path):
    """Import each module in a fresh interpreter with the old lifecycle
    modules blocked, so a lazy in-function import cannot hide a dependency
    the static check missed."""
    blocker = "\n".join([
        "import sys",
        f"BLOCKED = {sorted(DELETED_AT_CUTOVER)!r}",
        "class _Blocker:",
        "    def find_module(self, name, path=None):",
        "        head = name.split('.')",
        "        if len(head) == 2 and head[0] == 'ai_router' "
        "and head[1] in BLOCKED:",
        "            raise ImportError('blocked at cutover: ' + name)",
        "        return None",
        "sys.meta_path.insert(0, _Blocker())",
        "import ai_router.runcli",
        "import ai_router.verifyjob",
        "import ai_router.runproject",
        "print('ok')",
    ])
    script = tmp_path / "probe.py"
    script.write_text(blocker, encoding="utf-8")
    done = subprocess.run(
        [sys.executable, str(script)], capture_output=True, text=True,
        cwd=str(Path.cwd()),
    )
    assert done.returncode == 0, done.stderr
    assert "ok" in done.stdout


def _seed_long_journal(root, repo, total: int) -> None:
    with journal.batch(root) as writer:
        writer.append(
            event_type="run.created", run_id="r0001-long", attempt=1,
            actor=journal.actor("agent", "bench", "anthropic"),
            summary="long", payload={
                "policy": "fast", "ask": "long", "base_commit": None,
                "worktree_id": journal.worktree_id(repo), "branch": "main",
                "set_slug": "001-default", "session_number": 1,
            },
        )
        writer.append(
            event_type="run.started", run_id="r0001-long", attempt=1,
            actor=journal.actor("agent", "bench", "anthropic"),
            summary="started", payload={
                "mode": "registered", "engine": "claude-code",
                "provider": "anthropic", "model": "sonnet",
                "identity_provenance": "direct",
            },
        )
        for n in range(total - 2):
            writer.append(
                event_type="run.checkpoint", run_id="r0001-long", attempt=1,
                actor=journal.actor("agent", "bench", "anthropic"),
                summary=f"note {n}",
                payload={"note": f"note {n}", "ack_guidance_through": None},
            )


def test_a_long_journal_still_refreshes_inside_the_freshness_budget(
    run_repo
):
    """§8.1's two-second contract, measured rather than assumed.

    The journal has no rotation (§14), so refresh cost grows with the
    repository's whole history. This pins the point at which that would stop
    being true and turns a regression in it into a failing test rather than
    a slow Explorer.
    """
    root = journal.control_root()
    _seed_long_journal(root, run_repo, LONG_JOURNAL_EVENTS)

    started = time.monotonic()
    projection = runproject.write_projection(root)
    rebuild = time.monotonic() - started
    assert projection["projection_revision"] == LONG_JOURNAL_EVENTS
    assert rebuild < FRESHNESS_BUDGET_SECONDS, (
        f"a {LONG_JOURNAL_EVENTS}-event journal rebuilt in {rebuild:.2f}s, "
        f"over the {FRESHNESS_BUDGET_SECONDS}s freshness budget"
    )

    started = time.monotonic()
    runproject.current_projection(root)
    cached = time.monotonic() - started
    assert cached < FRESHNESS_BUDGET_SECONDS


def test_an_incremental_read_does_not_re_fold_the_whole_journal(run_repo):
    """``status --after`` is the Explorer's per-frame call, so it must cost
    the tail rather than the history."""
    root = journal.control_root()
    _seed_long_journal(root, run_repo, LONG_JOURNAL_EVENTS)

    started = time.monotonic()
    tail = journal.read_events(root, after=LONG_JOURNAL_EVENTS - 5)
    elapsed = time.monotonic() - started
    assert [e["sequence"] for e in tail] == list(
        range(LONG_JOURNAL_EVENTS - 4, LONG_JOURNAL_EVENTS + 1)
    )
    assert elapsed < FRESHNESS_BUDGET_SECONDS


def test_the_incremental_and_full_projections_agree(run_repo):
    """The projection written alongside an append and the one rebuilt from
    scratch are the same bytes — §12.1's replay property, held against the
    handed-in event list the append path uses."""
    root = journal.control_root()
    _seed_long_journal(root, run_repo, 50)

    handed_in = runproject.build_projection(root, journal.read_events(root))
    from_scratch = runproject.build_projection(root)
    assert handed_in == from_scratch
