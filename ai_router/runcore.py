"""Run identity, the state fold, and the preconditions every transition is
held to.

The journal is the authority and this module is its reader: ``state(run) =
fold(events for run_id)``, with no cached field that could disagree. Only the
framework moves a run's state, and it does so by appending the event that
means the move — an agent proposes, a handler validates here and either
appends or refuses with a named token.

Fail-closed is the rule in both directions. A transition the state machine
does not permit is corruption of a machine-owned record, not a shape to
tolerate; and every refusal names one reason a caller can act on rather than
returning a generic error.
"""

from __future__ import annotations

import os
import re
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .checks import matching_prefixes
from .journal import (
    is_machine_state_path, journal_path, read_events, run_git,
)

POLICY_FAST = "fast"
POLICY_VERIFIED = "verified"
POLICIES = (POLICY_FAST, POLICY_VERIFIED)

STATE_CREATED = "created"
STATE_RUNNING = "running"
STATE_WAITING = "waiting"
STATE_VERIFYING = "verifying"
STATE_REMEDIATING = "remediating"
STATE_COMPLETED = "completed"
STATE_FAILED = "failed"
STATE_CANCELLED = "cancelled"

TERMINAL_STATES = frozenset({STATE_COMPLETED, STATE_FAILED, STATE_CANCELLED})

# §5.3, in the order the blueprint lists them. Each fires at most once per
# run: a second observation is still visible in check and checkpoint facts,
# but the policy has already moved and cannot move twice.
TRIGGER_OPERATOR = "operator-request"
TRIGGER_SENSITIVE_PATH = "sensitive-path"
TRIGGER_NO_DECLARED_CHECK = "no-declared-check"
# A path no declared check covers and a path no selection rule maps are
# different declarations, and conflating them would let one hide the
# other. §5.2.1 requires unknown selection to escalate a fast run; this
# is the token it escalates under.
TRIGGER_SELECTION_UNKNOWN = "selection-unknown"
TRIGGER_REPEATED_CHECK_FAILURE = "repeated-check-failure"
TRIGGER_AGENT_UNCERTAIN = "agent-uncertain"
TRIGGER_DIFF_LIMIT = "diff-limit"

TRIGGER_ORDER = (
    TRIGGER_OPERATOR, TRIGGER_SENSITIVE_PATH, TRIGGER_NO_DECLARED_CHECK,
    TRIGGER_SELECTION_UNKNOWN, TRIGGER_REPEATED_CHECK_FAILURE,
    TRIGGER_AGENT_UNCERTAIN, TRIGGER_DIFF_LIMIT,
)

RUN_TRAILER = "Dabbler-Run"

# Organizational events are about a set or a session, not about a run, so
# they name no run at all. The fold skips them: cancelling a session is not
# a move in any run's state machine, and folding one into a terminal run
# would read as reopening it.
ORGANIZATION_EVENTS = ("organization.cancelled", "organization.restored")

_RUN_ID = re.compile(r"^r(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*$")
_SLUG_STRIP = re.compile(r"[^a-z0-9]+")


class Refusal(Exception):
    """A precondition said no. Exit code 2, ``{"refused": token}`` on
    stdout — a named reason the caller can act on, never a stack trace."""

    def __init__(self, token: str, detail: str):
        super().__init__(f"{token}: {detail}")
        self.token = token
        self.detail = detail


class TransitionError(RuntimeError):
    """The journal records a move the state machine does not permit. Only
    the framework writes these events, so this is a damaged record."""


# --- Run identity -----------------------------------------------------------

def slugify(text: str, limit: int = 40) -> str:
    slug = _SLUG_STRIP.sub("-", (text or "").strip().lower()).strip("-")
    if not slug:
        return "run"
    slug = slug[:limit].strip("-")
    return slug or "run"


def allocate_run_id(root, ask: str) -> str:
    """``r<NNNN>-<slug>``, allocated under the journal lock the caller holds.

    The counter is ``max(existing) + 1`` over the whole journal, so a
    cancelled run's number is never handed out again and a run id read
    anywhere in the record identifies exactly one attempt forever.
    """
    return allocate_run_id_from(read_events(root, validate=False), ask)


def allocate_run_id_from(events, ask: str) -> str:
    """The same allocation against a journal the caller already holds."""
    highest = 0
    for event in events:
        match = _RUN_ID.match(event.get("run_id") or "")
        if match:
            highest = max(highest, int(match.group(1)))
    return f"r{highest + 1:04d}-{slugify(ask)}"


# --- The fold ---------------------------------------------------------------

@dataclass
class RunView:
    """One run's state, derived. Every field is a fold of events; nothing
    here is stored anywhere that could drift from the journal."""

    run_id: str
    state: str = STATE_CREATED
    policy: str = POLICY_FAST
    attempt: int = 1
    ask: str = ""
    session_number: int = 0
    base_commit: Optional[str] = None
    branch: Optional[str] = None
    worktree_id: Optional[str] = None
    prepared: bool = False
    engine: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    identity_provenance: Optional[str] = None
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    last_activity_at: Optional[str] = None
    last_sequence: int = 0

    waiting_reason: Optional[str] = None
    waiting_sequence: Optional[int] = None

    checkpoints: list = field(default_factory=list)
    uncertain: bool = False
    guidance: list = field(default_factory=list)
    acked_through: int = 0

    open_checks: dict = field(default_factory=dict)
    checks: list = field(default_factory=list)
    check_failures: dict = field(default_factory=dict)

    rounds: int = 0
    open_request: Optional[dict] = None
    last_verdict: Optional[str] = None
    verifier_provider: Optional[str] = None
    verifier_transport: Optional[str] = None
    accepted_tree_digest: Optional[str] = None
    reviewed_tree_digest: Optional[str] = None
    blocking_findings: int = 0
    last_blocking_findings: list = field(default_factory=list)
    minor_findings: int = 0
    round_limit: Optional[int] = None
    dispatch_limit: Optional[int] = None
    model_usd_budget: Optional[float] = None
    elapsed_minutes_budget: Optional[float] = None
    dispatches: int = 0

    costs: dict = field(default_factory=dict)
    escalations: list = field(default_factory=list)

    worktree_ready: bool = False
    worktree_tasks: list = field(default_factory=list)

    commit: Optional[str] = None
    tree_digest: Optional[str] = None
    outcome: Optional[str] = None
    verdict: Optional[str] = None
    checks_green: bool = False

    @property
    def terminal(self) -> bool:
        return self.state in TERMINAL_STATES

    @property
    def pending_guidance(self) -> int:
        return sum(1 for g in self.guidance if g["sequence"] > self.acked_through)

    @property
    def model_usd(self) -> float:
        return round(
            sum(c["cost_usd"] for c in self.costs.values() if c["cost_usd"]), 6
        )

    @property
    def unpriced_calls(self) -> int:
        return sum(
            1 for c in self.costs.values() if c["pricing_status"] == "unpriced"
        )

    def latest_check(self, check_id: str, stage: str, tree_digest: str):
        """The most recent completed attempt of one check on one tree. An
        earlier attempt on the same tree is superseded, not averaged."""
        for record in reversed(self.checks):
            if (record["check_id"] == check_id and record["stage"] == stage
                    and record["tree_digest"] == tree_digest):
                return record
        return None


def _require(view: RunView, event_type: str, allowed) -> None:
    if view.state not in allowed:
        raise TransitionError(
            f"{view.run_id}: {event_type} is not permitted from state "
            f"{view.state!r} (permitted: {sorted(allowed)})"
        )


def apply_event(view: RunView, event: dict) -> RunView:
    """Fold one event into *view*. Pure apart from the exception it raises
    when the journal records an impossible move."""
    kind = event["event_type"]
    payload = event["payload"]
    view.last_sequence = event["sequence"]

    if view.terminal and kind != "run.cost_updated":
        raise TransitionError(
            f"{view.run_id}: {kind} follows a terminal {view.state!r} run; "
            "follow-up work is a new run, never a reopened one."
        )
    if kind != "run.cost_updated":
        view.last_activity_at = event["occurred_at"]

    if kind == "run.created":
        view.state = STATE_CREATED
        view.policy = payload["policy"]
        view.ask = payload["ask"]
        view.base_commit = payload["base_commit"]
        view.branch = payload["branch"]
        view.worktree_id = payload["worktree_id"]
        view.session_number = payload["session_number"]
        view.prepared = bool(payload.get("prepared"))
        view.attempt = event["attempt"]
        view.created_at = event["occurred_at"]
    elif kind == "run.started":
        _require(view, kind, {STATE_CREATED})
        view.state = STATE_RUNNING
        view.engine = payload["engine"]
        view.provider = payload["provider"]
        view.model = payload["model"]
        view.identity_provenance = payload["identity_provenance"]
        view.started_at = event["occurred_at"]
    elif kind == "run.checkpoint":
        view.checkpoints.append({
            "sequence": event["sequence"], "note": payload["note"],
            "occurred_at": event["occurred_at"],
            "uncertain": bool(payload.get("uncertain")),
        })
        if payload.get("uncertain"):
            view.uncertain = True
        ack = payload.get("ack_guidance_through")
        if ack:
            view.acked_through = max(view.acked_through, int(ack))
    elif kind == "run.guidance":
        view.guidance.append({
            "sequence": event["sequence"], "text": payload["text"],
            "answers_sequence": payload["answers_sequence"],
        })
    elif kind == "run.waiting":
        _require(view, kind, {STATE_RUNNING, STATE_REMEDIATING})
        view.state = STATE_WAITING
        view.waiting_reason = payload["reason"]
        view.waiting_sequence = event["sequence"]
    elif kind == "run.resumed":
        _require(view, kind, {STATE_WAITING})
        view.state = STATE_RUNNING
        view.waiting_reason = None
        view.waiting_sequence = None
        for name in ("round_limit", "dispatch_limit"):
            if payload.get(name) is not None:
                setattr(view, name, int(payload[name]))
        for name in ("model_usd_budget", "elapsed_minutes_budget"):
            if payload.get(name) is not None:
                setattr(view, name, float(payload[name]))
    elif kind == "escalation.triggered":
        view.policy = payload["to_policy"]
        view.escalations.append(payload["trigger"])
    elif kind == "check.started":
        view.open_checks[payload["check_id"]] = payload
    elif kind == "check.completed":
        view.open_checks.pop(payload["check_id"], None)
        view.checks.append(payload)
        if payload["outcome"] != "passed":
            view.check_failures[payload["check_id"]] = (
                view.check_failures.get(payload["check_id"], 0) + 1
            )
    elif kind == "verification.dispatched":
        _require(view, kind, {STATE_RUNNING, STATE_REMEDIATING})
        view.state = STATE_VERIFYING
        view.rounds = payload["round"]
        view.open_request = payload
        view.dispatches += 1
    elif kind == "verification.result":
        _require(view, kind, {STATE_VERIFYING})
        view.open_request = None
        view.verifier_provider = payload.get("effective_provider")
        view.verifier_transport = payload.get("transport")
        blocking = payload.get("blocking_findings") or []
        view.blocking_findings = len(blocking)
        # The findings themselves, not just their count: "remediated at the
        # cap" is decided per finding, against what each one cited.
        view.last_blocking_findings = list(blocking)
        view.minor_findings = len(payload.get("minor_findings") or [])
        if payload.get("verdict") is not None:
            view.last_verdict = payload["verdict"]
            view.reviewed_tree_digest = payload["tree_digest"]
        if blocking:
            view.state = STATE_REMEDIATING
            view.accepted_tree_digest = None
        else:
            view.state = STATE_RUNNING
            # A transport failure produced no opinion, so it accepts nothing.
            view.accepted_tree_digest = (
                payload["tree_digest"] if payload.get("verdict") else None
            )
    elif kind == "remediation.started":
        _require(view, kind, {STATE_REMEDIATING})
    elif kind == "run.cost_updated":
        # Latest update per dispatch wins, so an append-only seat correction
        # replaces its estimate instead of being summed on top of it.
        view.costs[payload["dispatch_id"]] = payload
    elif kind == "run.finished":
        _require(
            view, kind,
            {STATE_CREATED, STATE_RUNNING, STATE_WAITING, STATE_VERIFYING,
             STATE_REMEDIATING},
        )
        view.state = payload["outcome"]
        view.outcome = payload["outcome"]
        view.commit = payload["commit"]
        view.tree_digest = payload["tree_digest"]
        view.verdict = payload["verdict"]
        view.checks_green = payload["checks_green"]
    elif kind == "worktree.created":
        view.worktree_id = payload["worktree_id"]
        view.branch = payload["branch"]
    elif kind == "worktree.ready":
        view.worktree_ready = True
        view.worktree_tasks = payload["tasks"]
    elif kind == "worktree.failed":
        view.worktree_ready = False
        view.worktree_tasks = payload["tasks"]
    return view


def fold(events) -> Optional[RunView]:
    view = None
    for event in events:
        if event["event_type"] in ORGANIZATION_EVENTS:
            continue
        if view is None:
            if event["event_type"] != "run.created":
                raise TransitionError(
                    f"{event['run_id']}: the journal opens this run with "
                    f"{event['event_type']!r}; every run begins at run.created."
                )
            view = RunView(run_id=event["run_id"])
        apply_event(view, event)
    return view


def fold_all(events) -> dict:
    """``{run_id: RunView}`` in first-appearance order."""
    views: dict = {}
    for event in events:
        if event["event_type"] in ORGANIZATION_EVENTS:
            continue
        run_id = event["run_id"]
        if run_id not in views:
            if event["event_type"] != "run.created":
                raise TransitionError(
                    f"{run_id}: the journal opens this run with "
                    f"{event['event_type']!r}; every run begins at run.created."
                )
            views[run_id] = RunView(run_id=run_id)
        apply_event(views[run_id], event)
    return views


def load_run(root, run_id: str) -> RunView:
    events = read_events(root, run_id=run_id)
    if not events:
        raise Refusal(
            "unknown-run",
            f"no run {run_id!r} in {journal_path(root)}",
        )
    return fold(events)


def live_runs(views: dict, worktree: str = None) -> list:
    """Non-terminal runs, optionally only those in one worktree."""
    return [
        v for v in views.values()
        if not v.terminal
        and (worktree is None or v.worktree_id == worktree)
    ]


# --- Git preconditions ------------------------------------------------------

def head_commit(worktree) -> Optional[str]:
    rc, out, _ = run_git(worktree, "rev-parse", "HEAD")
    return out.strip() if rc == 0 and out.strip() else None


def current_branch(worktree) -> Optional[str]:
    """``None`` on a detached HEAD — the caller decides whether that is
    fatal, but nobody gets a fabricated branch name."""
    rc, out, _ = run_git(worktree, "symbolic-ref", "--quiet", "--short", "HEAD")
    return out.strip() if rc == 0 and out.strip() else None


def worktree_is_clean(worktree) -> bool:
    """Tracked, staged, and untracked changes all count -- except the run
    ledger. The clean-start rule is the boundary that keeps ``finish`` from
    committing work the run did not do.

    ``.dabbler/`` is the record *of* a session, not the work *of* one, and
    ``evidence.is_machine_state_path`` is the one place that decides which
    is which. Asking git alone was correct only while the ledger was
    ignored everywhere; once a repository tracks it so a session can move
    between machines, a round writing its own output would leave the tree
    dirty and refuse the next registration. The tree digest and the
    evidence diff already drop the ledger unconditionally, and the
    lifecycle's own close gate already exempts it -- this was the one gate
    still asking a question git answers differently depending on whether
    the ledger happens to be tracked.

    ``-uall`` expands a collapsed untracked directory to per-file rows; a
    single umbrella entry for ``.dabbler/`` would not match the filter.
    """
    rc, out, _ = run_git(
        worktree, "status", "--porcelain=v1", "--untracked-files=all",
    )
    if rc != 0:
        return False
    for line in out.splitlines():
        if len(line) < 4:
            continue
        path = line[3:]
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        path = path.strip().strip('"').replace("\\", "/")
        if is_machine_state_path(path):
            continue
        return False
    return True


def require_clean_start(worktree) -> None:
    if not worktree_is_clean(worktree):
        raise Refusal(
            "dirty-worktree",
            f"{worktree} has tracked, staged, or untracked changes. A run "
            "starts from a clean tree so its commit contains its own work "
            "and nothing else — commit or stash first.",
        )
    if current_branch(worktree) is None:
        raise Refusal(
            "detached-head",
            f"{worktree} has a detached HEAD; a run records the branch it "
            "works on. Check out a branch first.",
        )


def require_single_live_run(views: dict, worktree: str) -> None:
    live = live_runs(views, worktree)
    if live:
        raise Refusal(
            "run-already-live",
            f"{live[0].run_id} is still {live[0].state} in this worktree. "
            "Finish or cancel it before registering another.",
        )


def find_run_commit(worktree, run_id: str, base_commit: str):
    """``(sha, tree)`` for the commit this run already made, or ``None``.

    The trailer identifies the commit; it does not vouch for it. A trailer
    is text anyone can type, and a descendant carrying one proves only that
    something claimed this run's name. Recovery must still hold the tree
    against the recorded evidence before closing the run on it — see
    :func:`adoption_problems`.
    """
    rc, out, _ = run_git(
        worktree, "log", "--format=%H%x1f%T%x1f%B%x1e", f"{base_commit}..HEAD",
    )
    if rc != 0:
        return None
    for entry in out.split("\x1e"):
        if not entry.strip():
            continue
        parts = entry.strip().split("\x1f", 2)
        if len(parts) != 3:
            continue
        sha, tree, body = parts
        if f"{RUN_TRAILER}: {run_id}" in body:
            return sha.strip(), tree.strip()
    return None


def adoption_problems(view: RunView, tree_digest: str, required_checks) -> list:
    """Why this run may not be closed on *tree_digest*, or an empty list.

    The commit-before-journal window is the one place a run can reach
    ``completed`` without the handler that normally proves it, so the proof
    is re-derived here from the journal instead of assumed. Every required
    check must have a green ``final-full`` record bound to this exact tree,
    and a ``verified`` run must additionally carry an accepted verdict bound
    to it. Anything less and the run is not adopted: an unproven commit
    stays an unproven commit, and the operator is told why.
    """
    problems = []
    for check_id in required_checks:
        record = view.latest_check(check_id, "final-full", tree_digest)
        if record is None:
            problems.append(
                f"no final-full result for check {check_id!r} on the "
                "committed tree"
            )
        elif record["outcome"] != "passed" or record["tree_mutated"]:
            problems.append(
                f"check {check_id!r} did not pass on the committed tree"
            )
    if view.policy == POLICY_VERIFIED:
        if view.accepted_tree_digest != tree_digest:
            problems.append(
                "no accepted verification is bound to the committed tree"
            )
        elif view.last_verdict != "VERIFIED" and view.blocking_findings:
            problems.append(
                f"the latest verdict is {view.last_verdict!r} with "
                f"{view.blocking_findings} blocking finding(s)"
            )
    return problems


# --- Escalation (§5.3) ------------------------------------------------------

def pending_triggers(
    view: RunView,
    *,
    config: dict,
    changed_paths=(),
    diff_lines: Optional[int] = None,
    covered_paths=None,
    selection_unknown: bool = False,
    operator_request: bool = False,
) -> list:
    """Triggers that fire now and have not fired before, in §5.3 order.

    *covered_paths* is the subset of *changed_paths* some declared check
    covers; ``None`` means the caller did not evaluate coverage and the
    no-declared-check trigger is not judged.
    """
    policy = config["run_policy"]
    already = set(view.escalations)
    fired = []

    if operator_request:
        fired.append(TRIGGER_OPERATOR)
    sensitive = policy.get("sensitive_paths") or []
    if sensitive and any(
        matching_prefixes(p, sensitive) for p in changed_paths
    ):
        fired.append(TRIGGER_SENSITIVE_PATH)
    if covered_paths is not None and changed_paths and not covered_paths:
        fired.append(TRIGGER_NO_DECLARED_CHECK)
    if selection_unknown:
        fired.append(TRIGGER_SELECTION_UNKNOWN)
    if any(count >= 2 for count in view.check_failures.values()):
        fired.append(TRIGGER_REPEATED_CHECK_FAILURE)
    if view.uncertain:
        fired.append(TRIGGER_AGENT_UNCERTAIN)
    if diff_lines is not None and diff_lines > policy["diff_limit_lines"]:
        fired.append(TRIGGER_DIFF_LIMIT)

    return [t for t in TRIGGER_ORDER if t in fired and t not in already]


# --- Budgets (§5.3) ---------------------------------------------------------

def elapsed_minutes(view: RunView) -> float:
    import datetime

    if not view.started_at or not view.last_activity_at:
        return 0.0
    start = datetime.datetime.fromisoformat(view.started_at)
    last = datetime.datetime.fromisoformat(view.last_activity_at)
    return max(0.0, (last - start).total_seconds() / 60.0)


def budget_exhaustion(view: RunView, config: dict) -> Optional[str]:
    """The ceiling this run has reached, or ``None``.

    Reaching a ceiling pauses the run for the operator in either policy. It
    is never an escalation trigger: a budget is the point at which the
    framework stops spending, not the point at which it spends differently.
    """
    budgets = config["run_policy"]["budgets"]
    limit = (
        view.dispatch_limit
        if view.dispatch_limit is not None
        else budgets["model_dispatches"]
    )
    if view.dispatches >= limit:
        return f"model_dispatches ceiling of {limit} reached"
    usd_cap = (
        view.model_usd_budget
        if view.model_usd_budget is not None
        else budgets.get("model_usd")
    )
    if usd_cap is not None and view.model_usd >= usd_cap:
        return f"model_usd ceiling of {usd_cap} reached"
    minutes_cap = (
        view.elapsed_minutes_budget
        if view.elapsed_minutes_budget is not None
        else budgets.get("elapsed_minutes")
    )
    if minutes_cap is not None and elapsed_minutes(view) >= minutes_cap:
        return f"elapsed_minutes ceiling of {minutes_cap} reached"
    return None


def round_limit_for(view: RunView, config: dict) -> int:
    if view.round_limit is not None:
        return view.round_limit
    return config["run_policy"]["verification_rounds"]


# --- Resume probe (§5.5) ----------------------------------------------------

def recovery_probe(root, view: RunView) -> dict:
    """What a resuming run must be told before it continues.

    Every discrepancy is reported rather than repaired: the probe's job is
    to name what changed under the run, and the operator's is to decide.
    """
    from .journal import heartbeat_owner_alive, read_heartbeat

    findings = []
    worktree = Path(view.worktree_id) if view.worktree_id else None
    present = bool(worktree and worktree.is_dir())
    if not present:
        findings.append(f"worktree {view.worktree_id} no longer exists")

    head = head_commit(worktree) if present else None
    matches = False
    orphan = None
    if present and view.base_commit:
        matches = head == view.base_commit
        if not matches:
            found = find_run_commit(worktree, view.run_id, view.base_commit)
            orphan = found[0] if found else None
            if orphan is None:
                findings.append(
                    f"HEAD is {head}, not the recorded base {view.base_commit}, "
                    "and carries no commit from this run"
                )

    # An interrupted check is reported, not blocking: it was never evidence
    # (only completed checks are), and the next check simply starts a new
    # attempt. An interrupted dispatch IS blocking until recovery has
    # recorded its failed attempt, because until then the round is open.
    open_check = next(iter(view.open_checks), None)
    if view.open_request:
        findings.append(
            f"verification round {view.open_request['round']} was dispatched "
            "with no recorded result"
        )

    beat = read_heartbeat(root, view.run_id)
    second_live = bool(beat and heartbeat_owner_alive(beat))
    if second_live:
        findings.append(
            f"a live heartbeat for this run is owned by pid {beat.get('pid')}"
        )

    return {
        "ok": not findings,
        "findings": findings,
        "worktree_present": present,
        "head_commit": head,
        "head_matches_base": matches,
        "last_check": view.checks[-1]["check_id"] if view.checks else None,
        "second_heartbeat": second_live,
        "orphan_commit": orphan,
        "interrupted_check": open_check,
        "interrupted_round": (
            view.open_request["round"] if view.open_request else None
        ),
    }


# --- Prepared worktrees (§11.2) ---------------------------------------------

def worktree_root(root, config: dict) -> Path:
    """Where prepared worktrees live. The default is a sibling of the main
    worktree, never a directory nested inside one: a worktree under a
    working tree is a working tree's untracked content."""
    configured = (config.get("worktree") or {}).get("root")
    if configured:
        return Path(root).parent.joinpath(configured).resolve() \
            if not Path(configured).is_absolute() else Path(configured)
    return (Path(root).parent / f".{Path(root).name}-dabbler-worktrees").resolve()


def platform_argv(value):
    """A plain argv list, or the ``windows``/``posix`` mapping resolved for
    this platform. Never a shell string — shell mode is declared, never
    inferred from metacharacters."""
    if isinstance(value, dict):
        return list(value["windows" if os.name == "nt" else "posix"])
    return list(value or [])


def run_init_task(task: dict, cwd: Path, default_timeout: float) -> dict:
    """One declared initialization task, idempotent by its own probe.

    A task whose probe already passes is not re-run — that is what makes
    ``worktree init`` a retry of the failures rather than a repeat of the
    work.
    """
    probe = task.get("probe_argv")
    record = {
        "id": task["id"], "argv": [], "shell_command": None,
        "exit_code": None, "duration_seconds": 0.0, "timed_out": False,
        "probe": "not_declared", "outcome": "passed",
    }
    if probe and _probe_passes(probe, cwd):
        record["probe"] = "passed"
        return record

    timeout = float(task.get("timeout_seconds") or default_timeout)
    started = time.monotonic()
    if task.get("shell"):
        command = task.get("command")
        if not command:
            raise Refusal(
                "worktree-init-invalid",
                f"task {task['id']!r} declares shell: true with no command",
            )
        record["shell_command"] = command
        process = subprocess.Popen(
            command, shell=True, cwd=str(cwd), stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        argv = platform_argv(task.get("argv"))
        if not argv:
            raise Refusal(
                "worktree-init-invalid",
                f"task {task['id']!r} declares no argv",
            )
        record["argv"] = argv
        process = subprocess.Popen(
            argv, cwd=str(cwd), stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    try:
        process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        record["timed_out"] = True
        process.kill()
        process.communicate()
    record["duration_seconds"] = round(time.monotonic() - started, 3)
    record["exit_code"] = None if record["timed_out"] else process.returncode
    if probe:
        record["probe"] = "passed" if _probe_passes(probe, cwd) else "failed"
    ok = (
        not record["timed_out"]
        and record["exit_code"] == 0
        and record["probe"] != "failed"
    )
    record["outcome"] = "passed" if ok else "failed"
    return record


def _probe_passes(probe, cwd: Path) -> bool:
    argv = platform_argv(probe)
    if not argv:
        return False
    try:
        completed = subprocess.run(
            argv, cwd=str(cwd), capture_output=True, timeout=120,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return completed.returncode == 0
