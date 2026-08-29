"""The run-core command line: ``python -m ai_router.runcli <verb>``.

One parser, one set of handlers, one JSON contract. Exit 0 is success, 1 is
an operational failure named in ``error``, 2 is a refusal named in
``refused`` — a caller never has to read prose to find out which happened.

Every state change goes through here, and every one of them appends its event
and refreshes the projection under a single journal lock, so no reader ever
sees an event without the view that explains it. Nothing in this module
accepts a verdict, a sequence, or a timestamp from its caller.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from . import checks, journal, runcore, runproject
from .config import (
    TRANSPORT_ENV_VAR,
    VALID_TRANSPORTS,
    load_config,
    resolve_transport,
)
from .journal import (
    changed_paths_between,
    repo_root_for,
    run_git,
    snapshot_worktree_tree,
)
from .identity import (
    IdentityResolutionError,
    resolve_orchestrator_identity,
)
from .journal import ACTOR_AGENT, ACTOR_FRAMEWORK, ACTOR_OPERATOR
from .runcore import Refusal

EXIT_OK = 0
EXIT_ERROR = 1
EXIT_REFUSED = 2

class OperationalError(RuntimeError):
    def __init__(self, token: str, detail: str, **extra):
        super().__init__(f"{token}: {detail}")
        self.token = token
        self.detail = detail
        self.extra = extra


# --- Journal + projection ---------------------------------------------------

def _emit(root, events) -> tuple:
    """Append one or more events and refresh the projection under one lock.

    Grouped appends exist so a reader can never observe half of a compound
    move (create+start, guidance+resume). The projection is written before
    the lock is released; if that write fails the events are already durable
    and the caller is told the view is behind rather than told nothing.
    """
    with journal.batch(root) as writer:
        for spec in events:
            writer.append(**spec)
        appended = writer.appended
        try:
            # The batch already holds the whole journal, read and validated
            # once under this lock; handing it on spares the projection a
            # second full read of the same file after every append.
            projection = runproject.write_projection(root, writer.events)
        except Exception as exc:  # the append is durable; the view is not
            raise OperationalError(
                "projection-stale",
                f"events through sequence {appended[-1]['sequence']} are "
                f"durable but the projection could not be rewritten: {exc}",
                sequence=appended[-1]["sequence"],
            ) from exc
    return appended, projection


def _control_root():
    return journal.control_root()


def _worktree(root):
    here = repo_root_for(Path.cwd())
    return here or root


def _view(root, run_id: str) -> runcore.RunView:
    view = runcore.load_run(root, run_id)
    if view is None:
        raise Refusal("unknown-run", f"no events for run {run_id!r}")
    return view


def _require_nonterminal(view) -> None:
    if view.terminal:
        raise Refusal(
            "terminal-run",
            f"{view.run_id} is {view.state}; follow-up work is a new run.",
        )


def _require_attestation(args) -> None:
    if not getattr(args, "attest_operator", False):
        raise Refusal(
            "attestation-required",
            "this action is the operator's, and the journal records it as "
            "such. Re-run with --attest-operator.",
        )


# --- run --register ---------------------------------------------------------

def _resolve_session(root, session_number: int):
    organization = runproject.load_organization(root)
    session = next(
        (s for s in organization["sessions"] if s["number"] == session_number),
        None,
    )
    if session is None:
        raise Refusal(
            "unknown-session",
            f"{runproject.SESSION_PLAN_REL} declares no session "
            f"{session_number}",
        )
    return session


def cmd_run(args) -> dict:
    root = _control_root()
    config = load_config()
    if args.mode == "wrapped":
        raise Refusal(
            "host-adapter-not-enabled",
            "wrapped mode is reserved for a host adapter that does not ship "
            "in this slice; register the already-running session instead.",
        )
    try:
        identity = resolve_orchestrator_identity({
            "engine": args.engine, "provider": args.provider,
            "model": args.model,
        }, models_registry=config.get("models"))
    except IdentityResolutionError as exc:
        raise Refusal("identity-unresolvable", str(exc)) from exc
    if identity.effective_provider != args.provider.strip().lower():
        raise Refusal(
            "identity-mismatch",
            f"model {args.model!r} resolves to provider "
            f"{identity.effective_provider!r}, not the asserted "
            f"{args.provider!r}. Cross-provider verification depends on this "
            "being derived, not declared.",
        )

    worktree = _worktree(root)
    started_payload = {
        "mode": "registered", "engine": args.engine,
        "provider": identity.effective_provider, "model": args.model,
        "identity_provenance": identity.provenance,
        "identity_source": identity.source,
    }

    if args.run:
        view = _view(root, args.run)
        if view.state != runcore.STATE_CREATED:
            raise Refusal(
                "wrong-state",
                f"{view.run_id} is {view.state}; only a prepared run in "
                "'created' accepts registration.",
            )
        if not view.worktree_ready:
            raise Refusal(
                "worktree-not-ready",
                f"{view.run_id} has no worktree.ready event. Run "
                f"'worktree init --run {view.run_id}' first.",
            )
        if journal.worktree_id(worktree) != view.worktree_id:
            raise Refusal(
                "wrong-worktree",
                f"{view.run_id} was prepared in {view.worktree_id}; register "
                "from inside that worktree.",
            )
        runcore.require_clean_start(worktree)
        events, _ = _emit(root, [{
            "event_type": "run.started", "run_id": view.run_id,
            "attempt": view.attempt,
            "actor": journal.actor(ACTOR_AGENT, args.engine, identity.effective_provider),
            "summary": f"registered {args.engine} on {identity.effective_provider}",
            "payload": started_payload,
        }])
        view = _view(root, view.run_id)
        return _run_output(view, worktree, identity)

    if config["git"]["worktree_per_run"]:
        raise Refusal(
            "worktree-preparation-required",
            "git.worktree_per_run is true, so a run works in its own "
            "prepared worktree. Run 'worktree create --session N' first.",
        )
    if args.session is None:
        raise Refusal(
            "session-required",
            "name the declared session with --session, or a prepared run "
            "with --run.",
        )
    session = _resolve_session(root, args.session)
    runcore.require_clean_start(worktree)

    with journal.batch(root) as writer:
        views = runcore.fold_all(writer.events)
        runcore.require_single_live_run(views, journal.worktree_id(worktree))
        _require_session_open(writer.events, views, args.session)
        attempt = 1 + sum(
            1 for v in views.values()
            if v.session_number == args.session
        )
        ask = session["title"]
        policy = args.policy or session["policy"] or config["run_policy"]["default"]
        run_id = runcore.allocate_run_id_from(writer.events, ask)
        base = runcore.head_commit(worktree)
        actor = journal.actor(
            ACTOR_AGENT, args.engine, identity.effective_provider
        )
        writer.append(
            event_type="run.created", run_id=run_id, attempt=attempt,
            actor=actor,
            summary=f"session {args.session}: {ask}",
            payload={
                "policy": policy, "ask": ask, "base_commit": base,
                "worktree_id": journal.worktree_id(worktree),
                "branch": runcore.current_branch(worktree),
                "session_number": args.session,
            },
        )
        writer.append(
            event_type="run.started", run_id=run_id, attempt=attempt,
            actor=actor,
            summary=f"registered {args.engine} on {identity.effective_provider}",
            payload=started_payload,
        )
        runproject.write_projection(root, writer.events)
        view = runcore.fold(
            [e for e in writer.events if e["run_id"] == run_id]
        )

    return _run_output(view, worktree, identity)


def _require_session_open(events, views, session_number) -> None:
    entry = runproject.organization_states(events).get(session_number)
    if entry and entry[1] == runproject.STATE_CANCELLED:
        raise Refusal(
            "session-cancelled",
            f"session {session_number} is cancelled; restore it before "
            "starting a run.",
        )


def _run_output(view, worktree, identity) -> dict:
    return {
        "run_id": view.run_id,
        "session_number": view.session_number, "policy": view.policy,
        "state": view.state, "worktree": journal.worktree_id(worktree),
        "base_commit": view.base_commit,
        "identity_provenance": identity.provenance,
    }


# --- checkpoint / guidance / escalate ---------------------------------------

def cmd_checkpoint(args) -> dict:
    root = _control_root()
    view = _view(root, args.run)
    _require_nonterminal(view)
    latest_guidance = max(
        (g["sequence"] for g in view.guidance), default=0
    )
    if args.ack_guidance_through and args.ack_guidance_through > latest_guidance:
        raise Refusal(
            "ack-exceeds-guidance",
            f"acknowledging through {args.ack_guidance_through} but the "
            f"latest guidance is sequence {latest_guidance or 'none'}.",
        )
    batch = [{
        "event_type": "run.checkpoint", "run_id": view.run_id,
        "attempt": view.attempt,
        "actor": journal.actor(ACTOR_AGENT, view.engine or "agent", view.provider),
        "summary": args.note[:200],
        "payload": {
            "note": args.note[:500],
            "ack_guidance_through": args.ack_guidance_through,
            "uncertain": bool(args.uncertain),
        },
    }]
    if args.uncertain and view.policy == runcore.POLICY_FAST:
        batch.append(_escalation_event(view, runcore.TRIGGER_AGENT_UNCERTAIN))
    appended, _ = _emit(root, batch)
    view = _view(root, view.run_id)
    return {
        "sequence": appended[0]["sequence"],
        "pending_guidance": view.pending_guidance,
        "policy": view.policy,
    }


def _escalation_event(view, trigger: str, detail: str = "") -> dict:
    payload = {
        "trigger": trigger, "from_policy": view.policy,
        "to_policy": runcore.POLICY_VERIFIED,
    }
    if detail:
        payload["detail"] = detail
    return {
        "event_type": "escalation.triggered", "run_id": view.run_id,
        "attempt": view.attempt,
        "actor": journal.actor(ACTOR_FRAMEWORK, "runcore"),
        "summary": f"escalated to verified: {trigger}",
        "payload": payload,
    }


def cmd_guidance(args) -> dict:
    root = _control_root()
    _require_attestation(args)
    view = _view(root, args.run)
    _require_nonterminal(view)
    batch = [{
        "event_type": "run.guidance", "run_id": view.run_id,
        "attempt": view.attempt,
        "actor": journal.actor(ACTOR_OPERATOR, "operator"),
        "summary": args.text[:200],
        "payload": {
            "text": args.text[:2000],
            "answers_sequence": args.answer,
        },
    }]
    if args.answer is not None:
        if view.state != runcore.STATE_WAITING or view.waiting_sequence != args.answer:
            raise Refusal(
                "stale-wait-sequence",
                f"{view.run_id} is {view.state} waiting at "
                f"{view.waiting_sequence!r}; --answer names {args.answer}.",
            )
        probe = runcore.recovery_probe(root, view)
        if not probe["ok"]:
            raise Refusal(
                "probe-failed",
                "the recovery probe found: " + "; ".join(probe["findings"]),
            )
        batch.append({
            "event_type": "run.resumed", "run_id": view.run_id,
            "attempt": view.attempt,
            "actor": journal.actor(ACTOR_OPERATOR, "operator"),
            "summary": "resumed by operator answer",
            "payload": {"probe": probe, "answered_sequence": args.answer},
        })
    appended, _ = _emit(root, batch)
    view = _view(root, view.run_id)
    return {
        "sequence": appended[0]["sequence"], "state": view.state,
        "answered_sequence": args.answer,
    }


def cmd_escalate(args) -> dict:
    root = _control_root()
    view = _view(root, args.run)
    _require_nonterminal(view)
    if runcore.TRIGGER_OPERATOR not in view.escalations:
        _emit(root, [_escalation_event(view, runcore.TRIGGER_OPERATOR)])
        view = _view(root, view.run_id)
    return {"policy": view.policy, "trigger": runcore.TRIGGER_OPERATOR}


# --- check ------------------------------------------------------------------

def run_checks(root, config, view, *, stage, allow_full_reason="",
               operator_attested=False):
    """Plan, run, and journal the declared checks for the current tree.

    Reuses a fresh green record for the same check on the same tree rather
    than paying for it twice, and refuses a complete suite at the targeted
    stage outside the three declared exceptions.
    """
    worktree = Path(view.worktree_id)
    tree_digest = snapshot_worktree_tree(worktree)
    if tree_digest is None:
        raise OperationalError(
            "snapshot-failed", f"could not snapshot the tree at {worktree}"
        )
    if allow_full_reason and not operator_attested:
        raise Refusal(
            "attestation-required",
            "--allow-full is an operator override and is journaled as one; "
            "add --attest-operator.",
        )
    try:
        planned = checks.plan(
            worktree, config, stage=stage, tree_digest=tree_digest,
            base_commit=view.base_commit, allow_full_reason=allow_full_reason,
        )
    except checks.CheckConfigError as exc:
        raise Refusal("check-config-invalid", str(exc)) from exc

    if (stage == checks.STAGE_TARGETED
            and planned.full_allowed_reason == checks.FULL_ALLOWED_OPERATOR):
        pass  # journaled below via the selection policy field

    results, reused = [], []
    for check, command in planned.checks:
        fresh = view.latest_check(check.name, stage, tree_digest)
        if fresh and fresh["outcome"] == checks.OUTCOME_PASSED and not fresh["tree_mutated"]:
            reused.append(check.name)
            continue
        selection = checks.selection_payload(
            planned.selection, planned.full_allowed_reason
        )
        _emit(root, [{
            "event_type": "check.started", "run_id": view.run_id,
            "attempt": view.attempt,
            "actor": journal.actor(ACTOR_FRAMEWORK, "checks"),
            "summary": f"{stage} {check.name}",
            "payload": {
                "check_id": check.name, "stage": stage, "command": command,
                "tree_digest": tree_digest, "selection": selection,
                "kind": check.kind, "required": check.required,
            },
        }])
        result = checks.execute(
            worktree, check, command, stage=stage, tree_digest=tree_digest,
            timeout_seconds=checks.timeout_for(check, config),
            run_id=view.run_id, selection=selection,
        )
        report_ref = _write_report(root, view.run_id, stage, result)
        _emit(root, [{
            "event_type": "check.completed", "run_id": view.run_id,
            "attempt": view.attempt,
            "actor": journal.actor(ACTOR_FRAMEWORK, "checks"),
            "summary": f"{stage} {check.name}: {result.outcome}",
            "artifact_refs": [report_ref] if report_ref else [],
            "payload": {
                "check_id": check.name, "stage": stage, "command": command,
                "exit_code": result.exit_code,
                "duration_seconds": result.duration_seconds,
                "outcome": result.outcome, "timed_out": result.timed_out,
                "tree_digest": tree_digest,
                "post_tree_digest": result.post_tree_digest,
                "tree_mutated": result.tree_mutated,
                "selection": selection, "report_ref": report_ref,
                "kind": check.kind, "required": check.required,
            },
        }])
        results.append(result)
        journal.clear_heartbeat(root, view.run_id)

    view = _view(root, view.run_id)
    _fire_triggers(root, config, view, planned)
    return planned, results, reused, tree_digest


def _write_report(root, run_id, stage, result):
    if not result.output:
        return None
    directory = journal.run_dir(root, run_id) / "checks"
    directory.mkdir(parents=True, exist_ok=True)
    name = f"{stage}-{result.check.name}.out"
    journal.atomic_write_text(directory / name, result.output[-200_000:])
    return f"{journal.RUNS_DIRNAME}/{run_id}/checks/{name}"


def _fire_triggers(root, config, view, planned) -> None:
    if view.policy != runcore.POLICY_FAST:
        return
    rc, out, _ = run_git(
        Path(view.worktree_id), "diff", "--numstat", view.base_commit,
        planned.tree_digest,
    )
    diff_lines = 0
    if rc == 0:
        for line in out.splitlines():
            parts = line.split("\t")
            diff_lines += sum(int(p) for p in parts[:2] if p.isdigit())
    pending = runcore.pending_triggers(
        view, config=config, changed_paths=planned.changed_paths,
        diff_lines=diff_lines,
        covered_paths=planned.covered_paths,
        selection_unknown=bool(
            checks.selection_unknown_paths(planned.selection)
        ),
    )
    if pending:
        _emit(root, [_escalation_event(view, t) for t in pending])


def cmd_check(args) -> dict:
    root = _control_root()
    config = load_config()
    view = _view(root, args.run)
    _require_nonterminal(view)
    if view.state == runcore.STATE_VERIFYING:
        raise Refusal(
            "wrong-state",
            f"{view.run_id} is verifying; a check would measure a tree the "
            "review is not looking at.",
        )
    if args.stage == checks.STAGE_FINAL_FULL:
        _require_verification_accepted(view, root)
    exhausted = runcore.budget_exhaustion(view, config)
    if exhausted:
        # A ceiling pauses the run for the operator in either policy. It is
        # never an escalation: this is where the framework stops spending,
        # not where it spends differently.
        view = _park(root, view, {"findings": [exhausted]})
        return {
            "tree_digest": None, "stage": args.stage, "fresh": [],
            "selection": checks.empty_selection(), "checks": [],
            "policy": view.policy, "state": view.state, "paused": exhausted,
        }
    planned, results, reused, tree = run_checks(
        root, config, view, stage=args.stage,
        allow_full_reason=args.allow_full or "",
        operator_attested=bool(args.attest_operator),
    )
    return {
        "tree_digest": tree, "stage": args.stage, "fresh": reused,
        "selection": checks.selection_payload(
            planned.selection, planned.full_allowed_reason
        ),
        "checks": [
            {
                "check_id": r.check.name, "outcome": r.outcome,
                "exit_code": r.exit_code, "required": r.check.required,
                "duration_seconds": r.duration_seconds,
                "tree_mutated": r.tree_mutated, "timed_out": r.timed_out,
            }
            for r in results
        ],
        "policy": _view(root, view.run_id).policy,
    }


def _require_verification_accepted(view, root) -> None:
    if view.policy != runcore.POLICY_VERIFIED:
        return
    worktree = Path(view.worktree_id)
    tree = snapshot_worktree_tree(worktree)
    if view.accepted_tree_digest != tree:
        raise Refusal(
            "verification-required",
            "the complete suite runs once, after the final accepted "
            "verification of this exact tree. Run 'verify' first.",
        )


# --- finish -----------------------------------------------------------------

def cmd_finish(args) -> dict:
    root = _control_root()
    config = load_config()
    view = _view(root, args.run)
    _require_nonterminal(view)

    if args.outcome in ("failed", "cancelled"):
        appended, _ = _emit(root, [{
            "event_type": "run.finished", "run_id": view.run_id,
            "attempt": view.attempt,
            "actor": journal.actor(ACTOR_OPERATOR, "operator"),
            "summary": f"run {args.outcome}",
            "payload": {
                "outcome": args.outcome, "commit": None, "tree_digest": None,
                "verdict": None, "checks_green": False,
            },
        }])
        return {
            "outcome": args.outcome, "commit": None, "verdict": None,
            "checks": [],
        }

    worktree = Path(view.worktree_id)
    tree_digest = snapshot_worktree_tree(worktree)
    rc, base_tree, _ = run_git(worktree, "rev-parse", f"{view.base_commit}^{{tree}}")
    if rc == 0 and base_tree.strip() == tree_digest:
        raise Refusal(
            "no-changes",
            "the candidate tree equals the base commit. A run that changed "
            "nothing is cancelled or recorded as failed, never completed "
            "with an empty commit.",
        )

    verdict = None
    if view.policy == runcore.POLICY_VERIFIED:
        verdict = _resolve_verified_verdict(view, tree_digest, config)

    _, results, reused, final_tree = run_checks(
        root, config, view, stage=checks.STAGE_FINAL_FULL,
    )
    if final_tree != tree_digest:
        raise Refusal(
            "tree-moved",
            "the tree changed while the final suite ran; re-run the checks "
            "against a settled tree.",
        )
    blocking = [r for r in results if r.blocks]
    if blocking:
        raise Refusal(
            "checks-not-green",
            "required check(s) did not pass on this tree: "
            + ", ".join(sorted(r.check.name for r in blocking))
            + ". A failed run commits nothing.",
        )

    view = _view(root, view.run_id)
    existing = runcore.find_run_commit(worktree, view.run_id, view.base_commit)
    if existing:
        # A commit from the crash window. It is adopted only when it holds
        # the very tree these checks just passed on; anything else is a
        # commit this run did not make on this work.
        commit, existing_tree = existing
        if existing_tree != tree_digest:
            raise Refusal(
                "tree-moved",
                f"a commit for this run already exists at {commit[:12]} but "
                f"its tree is {existing_tree}, not the accepted "
                f"{tree_digest}. Nothing is committed twice and nothing is "
                "committed on a tree the checks did not measure.",
            )
    else:
        commit = _commit(worktree, view, tree_digest)
    pushed = False
    if config["git"]["push_on_finish"]:
        pushed = _push(worktree, config, view)

    _emit(root, [{
        "event_type": "run.finished", "run_id": view.run_id,
        "attempt": view.attempt,
        "actor": journal.actor(ACTOR_FRAMEWORK, "finish"),
        "summary": f"completed at {commit[:12]}",
        "payload": {
            "outcome": "completed", "commit": commit,
            "tree_digest": tree_digest, "verdict": verdict,
            "unreviewed_findings": (
                view.blocking_findings
                if verdict == "REMEDIATED_AT_CAP" else None
            ),
            "checks_green": True,
            "pushed": pushed,
        },
    }])
    return {
        "outcome": "completed", "commit": commit, "verdict": verdict,
        "checks": [
            {"check_id": r.check.name, "outcome": r.outcome,
             "stage": r.stage, "duration_seconds": r.duration_seconds}
            for r in results
        ],
        "reused": reused, "pushed": pushed,
    }


def _resolve_verified_verdict(view, tree_digest, config):
    """The verdict a completed 'verified' run carries — always one the loop
    produced. There is no waiver: at the round cap a run whose blocking
    findings were each shown remediated carries REMEDIATED_AT_CAP, and its
    work lands labelled unreviewed rather than accepted over anything."""
    from .verdict import (
        VERDICT_ISSUES_FOUND, VERDICT_REMEDIATED_AT_CAP, VERDICT_VERIFIED,
        unremediated_findings, validate_session_verdict,
    )

    if view.accepted_tree_digest == tree_digest:
        if view.last_verdict == VERDICT_VERIFIED:
            return validate_session_verdict(VERDICT_VERIFIED)
        if (
            view.last_verdict == VERDICT_ISSUES_FOUND
            and view.blocking_findings == 0
        ):
            # The severity-gated stop: minor findings are recorded and do
            # not hold the run open.
            return validate_session_verdict(VERDICT_ISSUES_FOUND)
    if (
        view.blocking_findings
        and view.rounds >= runcore.round_limit_for(view, config)
        and view.reviewed_tree_digest not in (None, tree_digest)
    ):
        fix_paths = changed_paths_between(
            Path(view.worktree_id), view.reviewed_tree_digest, tree_digest
        )
        unshown = (
            view.last_blocking_findings if fix_paths is None
            else unremediated_findings(view.last_blocking_findings, fix_paths)
        )
        if not unshown:
            # Remediated at the cap: every blocking finding's cited site
            # was changed, and the cap left the repair unreviewed. Not a
            # waiver — nothing stands.
            return validate_session_verdict(VERDICT_REMEDIATED_AT_CAP)
        raise Refusal(
            "verification-required",
            f"the round cap is reached and {len(unshown)} blocking "
            "finding(s) cannot be shown remediated: the fix delta touches "
            "no path they cited. Unreviewed work lands only where each "
            "finding's own site was changed; this run is unresolved.",
        )
    if view.accepted_tree_digest != tree_digest:
        raise Refusal(
            "verification-required",
            "no accepted verification is bound to this tree. Run 'verify' "
            "against the current tree before finishing.",
        )
    raise Refusal(
        "verification-required",
        f"the latest verdict is {view.last_verdict!r} with "
        f"{view.blocking_findings} blocking finding(s).",
    )


def _commit(worktree, view, tree_digest) -> str:
    """Stage exactly the snapshot's contents and refuse to commit anything
    else. ``git write-tree`` must reproduce the accepted digest — the commit
    is the tree the checks passed on, or there is no commit."""
    run_git(worktree, "add", "-A")
    run_git(
        worktree, "rm", "--cached", "-r", "-f", "--ignore-unmatch", "-q",
        "--", journal.MACHINE_DIRNAME,
    )
    rc, staged, err = run_git(worktree, "write-tree")
    if rc != 0:
        raise OperationalError("write-tree-failed", err or "git write-tree failed")
    if staged.strip() != tree_digest:
        raise Refusal(
            "tree-moved",
            f"the staged tree {staged.strip()} is not the accepted "
            f"{tree_digest}; nothing is committed on a moving tree.",
        )
    subject = " ".join(view.ask.splitlines()[0].split())[:72]
    message = f"{subject}\n\n{runcore.RUN_TRAILER}: {view.run_id}\n"
    rc, _, err = run_git(worktree, "commit", "--no-verify", "-q", "-m", message)
    if rc != 0:
        raise OperationalError("commit-failed", err or "git commit failed")
    return runcore.head_commit(worktree)


def _push(worktree, config, view) -> bool:
    remote = config["git"]["remote"]
    branch = view.branch or runcore.current_branch(worktree)
    rc, _, err = run_git(worktree, "push", remote, f"HEAD:{branch}")
    if rc != 0:
        raise OperationalError(
            "push-failed",
            f"the commit exists but the push to {remote} failed ({err}); "
            "re-run finish to retry the push.",
        )
    return True


# --- resume -----------------------------------------------------------------

def heal(root, view) -> tuple:
    """``(view, parked)`` after closing the crash windows §5.5 names.

    An orphaned dispatch becomes an immutable failed attempt so the round is
    no longer open; a commit that landed before its ``run.finished`` is
    adopted, but only against the evidence that commit would have needed.
    Both are re-runnable: a second resume finds nothing left to heal.

    *parked* says recovery itself put the run in front of the operator. The
    caller must not then resume it — that would hand back a run whose
    discrepancy is still standing.
    """
    from .journal import heartbeat_owner_alive, read_heartbeat
    from .verifyjob import interrupted_result

    if view.open_request:
        beat = read_heartbeat(root, view.run_id)
        if not (beat and heartbeat_owner_alive(beat)):
            result = interrupted_result(root, view)
            _emit(root, [{
                "event_type": "verification.result", "run_id": view.run_id,
                "attempt": view.attempt,
                "actor": journal.actor(ACTOR_FRAMEWORK, "resume"),
                "summary": f"round {result['round']} interrupted",
                "payload": result,
            }])
            view = _view(root, view.run_id)

    if view.state in (runcore.STATE_RUNNING, runcore.STATE_REMEDIATING):
        before = view.state
        view = _adopt_orphan_commit(root, view)
        if view.state == runcore.STATE_WAITING and before != view.state:
            return view, True
    return view, False


def _adopt_orphan_commit(root, view) -> runcore.RunView:
    """Close a run on a commit it already made — but only on the evidence
    that would have been required to make it.

    Recovery is the one path that reaches ``completed`` without going
    through ``finish``, so it re-derives ``finish``'s proof rather than
    inheriting its conclusion. An unproven commit parks the run for the
    operator instead of being recorded as a green completion.
    """
    worktree = Path(view.worktree_id) if view.worktree_id else None
    if not (worktree and worktree.is_dir() and view.base_commit):
        return view
    found = runcore.find_run_commit(worktree, view.run_id, view.base_commit)
    if not found:
        return view
    commit, tree = found

    try:
        planned = checks.plan(
            worktree, load_config(), stage=checks.STAGE_FINAL_FULL,
            tree_digest=tree, base_commit=view.base_commit,
        )
        required = [c.name for c, _ in planned.checks if c.required]
    except checks.CheckConfigError as exc:
        return _park(root, view, {"findings": [
            f"a commit for this run exists at {commit[:12]} but its checks "
            f"cannot be re-derived: {exc}"
        ]})

    problems = runcore.adoption_problems(view, tree, required)
    if problems:
        return _park(root, view, {"findings": [
            f"a commit for this run exists at {commit[:12]} but it is not "
            "backed by the evidence a completion requires: "
            + "; ".join(problems)
            + ". Reset or amend it, or record the run as failed."
        ]})

    _emit(root, [{
        "event_type": "run.finished", "run_id": view.run_id,
        "attempt": view.attempt,
        "actor": journal.actor(ACTOR_FRAMEWORK, "resume"),
        "summary": f"adopted commit {commit[:12]}",
        "payload": {
            "outcome": "completed", "commit": commit, "tree_digest": tree,
            "verdict": view.last_verdict, "checks_green": True,
        },
    }])
    return _view(root, view.run_id)


def cmd_resume(args) -> dict:
    root = _control_root()
    config = load_config()
    view = _view(root, args.run)
    _require_nonterminal(view)
    view, parked = heal(root, view)
    if parked:
        return _resume_output(view, runcore.recovery_probe(root, view), config)
    if view.terminal:
        return {
            "state": view.state, "probe": runcore.recovery_probe(root, view),
            "round_limit": runcore.round_limit_for(view, config),
            "dispatch_limit": view.dispatch_limit
            or config["run_policy"]["budgets"]["model_dispatches"],
            "model_usd_budget": view.model_usd_budget,
            "elapsed_minutes_budget": view.elapsed_minutes_budget,
            "commit": view.commit,
        }
    probe = runcore.recovery_probe(root, view)

    payload = {"probe": probe, "answered_sequence": None}
    if args.extend_rounds:
        _require_attestation(args)
        if view.state != runcore.STATE_WAITING:
            raise Refusal(
                "not-waiting",
                f"{view.run_id} is {view.state}; rounds are extended from a "
                "budget pause. A reached verification round cap is not "
                "extensible — it ends the run in one of its two terminal "
                "states rather than waiting to be raised.",
            )
        limit = runcore.round_limit_for(view, config)
        payload["round_limit"] = limit + args.extend_rounds
        current_dispatch = (
            view.dispatch_limit
            if view.dispatch_limit is not None
            else config["run_policy"]["budgets"]["model_dispatches"]
        )
        payload["dispatch_limit"] = current_dispatch + args.extend_rounds
        if args.model_usd_budget is not None:
            payload["model_usd_budget"] = args.model_usd_budget
        if args.elapsed_minutes_budget is not None:
            payload["elapsed_minutes_budget"] = args.elapsed_minutes_budget
        probed = runcore.RunView(**{**view.__dict__})
        probed.round_limit = payload["round_limit"]
        probed.dispatch_limit = payload["dispatch_limit"]
        if args.model_usd_budget is not None:
            probed.model_usd_budget = args.model_usd_budget
        if args.elapsed_minutes_budget is not None:
            probed.elapsed_minutes_budget = args.elapsed_minutes_budget
        exhausted = runcore.budget_exhaustion(probed, config)
        if exhausted:
            raise Refusal(
                "budget-exhausted",
                f"{exhausted}; supply a new total with --model-usd-budget "
                "and/or --elapsed-minutes-budget on the same attested resume.",
            )
    elif view.state != runcore.STATE_WAITING:
        if not probe["ok"]:
            # §5.5: a probe failure parks the run for the operator with the
            # discrepancy named. It is not a refusal — something really did
            # change under the run, and that fact belongs in the record.
            view = _park(root, view, probe)
        return _resume_output(view, probe, config)
    if not probe["ok"]:
        raise Refusal(
            "probe-failed",
            "the recovery probe found: " + "; ".join(probe["findings"])
            + ". The run stays waiting until the discrepancy is resolved.",
        )
    _emit(root, [{
        "event_type": "run.resumed", "run_id": view.run_id,
        "attempt": view.attempt,
        "actor": journal.actor(
            ACTOR_OPERATOR if args.extend_rounds else ACTOR_AGENT, "resume"
        ),
        "summary": "resumed",
        "payload": payload,
    }])
    return _resume_output(_view(root, view.run_id), probe, config)


def _park(root, view, probe):
    if view.state not in (runcore.STATE_RUNNING, runcore.STATE_REMEDIATING):
        return view
    _emit(root, [{
        "event_type": "run.waiting", "run_id": view.run_id,
        "attempt": view.attempt,
        "actor": journal.actor(ACTOR_FRAMEWORK, "resume"),
        "summary": "paused: recovery probe found a discrepancy",
        "payload": {
            "reason": "operator",
            "question": (
                "the recovery probe found: "
                + "; ".join(probe["findings"])
                + ". Resolve it, then answer this wait with 'guidance "
                "--answer <sequence> --resume --attest-operator'."
            ),
        },
    }])
    return _view(root, view.run_id)


def _resume_output(view, probe, config) -> dict:
    return {
        "state": view.state, "probe": probe,
        "round_limit": runcore.round_limit_for(view, config),
        "dispatch_limit": view.dispatch_limit
        or config["run_policy"]["budgets"]["model_dispatches"],
        "model_usd_budget": view.model_usd_budget,
        "elapsed_minutes_budget": view.elapsed_minutes_budget,
        "commit": view.commit,
    }


# --- status -----------------------------------------------------------------

def cmd_status(args) -> dict:
    root = _control_root()
    try:
        projection = runproject.current_projection(root, rebuild=args.rebuild)
    except journal.JournalCorrupt as exc:
        raise OperationalError("journal-corrupt", str(exc)) from exc

    base = {
        "control_root": journal.worktree_id(root),
        "projection_revision": projection["projection_revision"],
        "organization_digest": projection["organization_digest"],
    }
    if args.after is not None:
        if args.after > projection["projection_revision"]:
            raise Refusal(
                "future-revision",
                f"--after {args.after} is beyond the stored revision "
                f"{projection['projection_revision']}.",
            )
        try:
            events = journal.read_events(root, after=args.after)
        except journal.JournalCorrupt as exc:
            raise OperationalError("journal-corrupt", str(exc)) from exc
        return {**base, "events": events}
    if args.run:
        run = next(
            (r for r in projection["runs"] if r["run_id"] == args.run), None
        )
        if run is None:
            raise Refusal("unknown-run", f"no run {args.run!r}")
        return {**base, "run": run}
    return {**base, **projection}


# --- organize ---------------------------------------------------------------

def _commit_spec(root, paths, message) -> str:
    run_git(root, "add", "--", *paths)
    rc, _, err = run_git(root, "commit", "--no-verify", "-q", "-m", message)
    if rc != 0:
        raise OperationalError("commit-failed", err or "git commit failed")
    return runcore.head_commit(root)


def cmd_organize_session_add(args) -> dict:
    root = _control_root()
    if not runcore.worktree_is_clean(root):
        raise Refusal(
            "dirty-worktree",
            "adding a session commits the plan on its own; commit or stash "
            "unrelated changes first.",
        )
    organization = runproject.load_organization(root)
    number = max(
        (s["number"] for s in organization["sessions"]), default=0
    ) + 1
    plan = runproject.session_plan_path(root)
    plan.parent.mkdir(parents=True, exist_ok=True)
    body = (
        plan.read_text(encoding="utf-8").rstrip("\n")
        if plan.is_file() else "# Session plan\n\n## Sessions"
    )
    policy = f"\nPolicy: {args.policy}\n" if args.policy else ""
    plan.write_text(
        f"{body}\n\n### Session {number}: {args.title}\n{policy}\n"
        "Describe and complete one bounded change.\n",
        encoding="utf-8",
    )
    commit = _commit_spec(
        root, [runproject.SESSION_PLAN_REL], f"Declare session {number}"
    )
    runproject.write_projection(root)
    return {"session_number": number, "commit": commit}


def cmd_organize_cancel(args, restore: bool = False) -> dict:
    root = _control_root()
    _require_attestation(args)
    _resolve_session(root, args.session)
    if not restore:
        views = runcore.fold_all(journal.read_events(root))
        live = [
            v for v in views.values()
            if not v.terminal and v.session_number == args.session
        ]
        if live:
            raise Refusal(
                "run-already-live",
                f"{live[0].run_id} is still {live[0].state}; finish or "
                "cancel the run before cancelling its session.",
            )
    _emit(root, [{
        "event_type": (
            "organization.restored" if restore else "organization.cancelled"
        ),
        "run_id": None,
        "attempt": 1,
        "actor": journal.actor(ACTOR_OPERATOR, "operator"),
        "summary": f"{'restored' if restore else 'cancelled'} session",
        "payload": {
            "session_number": args.session, "reason": args.reason,
        },
    }])
    projection = runproject.current_projection(root)
    state = next(
        s["state"] for s in projection["sessions"]
        if s["number"] == args.session
    )
    return {"session_number": args.session, "state": state}


# --- doctor / configure -----------------------------------------------------

def cmd_doctor(args) -> dict:
    from .bootstrap import detect_copilot_seat

    config = load_config()
    env_value = os.environ.get(TRANSPORT_ENV_VAR)
    diagnostics = []
    if env_value and env_value.strip().lower() not in VALID_TRANSPORTS:
        diagnostics.append(
            f"{TRANSPORT_ENV_VAR}={env_value!r} is not one of "
            f"{list(VALID_TRANSPORTS)}"
        )
    try:
        effective = resolve_transport(config, args.transport)
        source = (
            "--transport" if args.transport else
            TRANSPORT_ENV_VAR if env_value else
            "transport.profile" if (config.get("transport") or {}).get("profile")
            else "default"
        )
    except ValueError as exc:
        effective, source = None, "invalid"
        diagnostics.append(str(exc))

    keys = sorted(
        name for name, block in (config.get("providers") or {}).items()
        if os.environ.get(block.get("api_key_env") or "")
    )
    seat = detect_copilot_seat() if effective == "copilot-cli" else None
    if effective == "copilot-cli" and not seat:
        diagnostics.append("the Copilot CLI is not on PATH")
    if effective == "api" and not keys:
        diagnostics.append("no provider API key is present in the environment")
    return {
        "ready": not diagnostics,
        "python": sys.version.split()[0],
        "router": _router_version(),
        "transport": {
            "env_present": env_value is not None,
            "env_value": env_value,
            "effective": effective,
            "source": source,
            "status": "ready" if not diagnostics else "unresolved",
            "diagnostics": diagnostics,
        },
        "provider_keys_present": keys,
    }


def _router_version() -> str:
    try:
        from importlib.metadata import version

        return version("dabbler-ai-router")
    except Exception:
        return "unknown"


def cmd_configure_transport(args) -> dict:
    from .bootstrap import persist_transport_preference

    if args.profile not in VALID_TRANSPORTS:
        raise Refusal(
            "invalid-transport",
            f"--profile must be one of {list(VALID_TRANSPORTS)}",
        )
    scope = persist_transport_preference(args.profile)
    return {
        "env_name": TRANSPORT_ENV_VAR,
        "value": args.profile,
        "persisted_scope": scope,
        "restart_may_be_required": scope is not None,
    }


# --- worktree (§11.2) -------------------------------------------------------

def cmd_worktree_create(args) -> dict:
    """Allocate the run before touching Git, then create and initialize its
    worktree. The main worktree may be dirty: the prepared branch starts from
    committed ``HEAD`` and no work-in-progress is copied or committed."""
    root = _control_root()
    config = load_config()
    session = _resolve_session(root, args.session)
    base = runcore.head_commit(root)
    if base is None:
        raise Refusal("no-base-commit", f"{root} has no HEAD to branch from")

    with journal.batch(root) as writer:
        views = runcore.fold_all(writer.events)
        _require_session_open(writer.events, views, args.session)
        attempt = 1 + sum(
            1 for v in views.values()
            if v.session_number == args.session
        )
        ask = session["title"]
        run_id = runcore.allocate_run_id_from(writer.events, ask)
        branch = f"dabbler/run/{run_id}"
        if run_git(root, "rev-parse", "--verify", "--quiet", branch)[0] == 0:
            raise Refusal(
                "branch-exists",
                f"{branch} already exists; run ids are never reused, so this "
                "is a leftover from a removed worktree.",
            )
        target = runcore.worktree_root(root, config) / run_id
        writer.append(
            event_type="run.created", run_id=run_id, attempt=attempt,
            actor=journal.actor(ACTOR_FRAMEWORK, "worktree"),
            summary=f"prepared session {args.session}",
            payload={
                "policy": args.policy or session["policy"]
                or config["run_policy"]["default"],
                "ask": ask, "base_commit": base,
                "worktree_id": journal.worktree_id(target), "branch": branch,
                "session_number": args.session,
                "prepared": True,
            },
        )
        runproject.write_projection(root, writer.events)

    target.parent.mkdir(parents=True, exist_ok=True)
    rc, _, err = run_git(
        root, "worktree", "add", "-b", branch, str(target), base
    )
    if rc != 0:
        _emit(root, [{
            "event_type": "worktree.failed", "run_id": run_id, "attempt": attempt,
            "actor": journal.actor(ACTOR_FRAMEWORK, "worktree"),
            "summary": "worktree add failed",
            "payload": {
                "worktree_id": journal.worktree_id(target), "tasks": [],
                "failed_task": "worktree-add", "detail": err,
            },
        }])
        raise OperationalError("worktree-add-failed", err or "git worktree add failed")
    _emit(root, [{
        "event_type": "worktree.created", "run_id": run_id, "attempt": attempt,
        "actor": journal.actor(ACTOR_FRAMEWORK, "worktree"),
        "summary": f"worktree at {target.name}",
        "payload": {
            "worktree_id": journal.worktree_id(target), "branch": branch,
            "base_commit": base,
        },
    }])
    return _initialize(root, config, _view(root, run_id))


def cmd_worktree_init(args) -> dict:
    root = _control_root()
    config = load_config()
    view = _view(root, args.run)
    if view.terminal:
        raise Refusal(
            "terminal-run", f"{view.run_id} is {view.state}; nothing to init."
        )
    if not Path(view.worktree_id).is_dir():
        raise Refusal(
            "worktree-missing",
            f"{view.worktree_id} does not exist; remove the run and prepare "
            "a new one.",
        )
    return _initialize(root, config, view)


def _initialize(root, config, view) -> dict:
    """Run the declared init tasks in order, each idempotent and separately
    retryable. Secrets ride in the process environment and never in events."""
    target = Path(view.worktree_id)
    default_timeout = float(config["run_policy"]["check_timeout_seconds"])
    tasks, failed = [], None
    for task in config["worktree"]["init"]:
        journal.write_heartbeat(root, view.run_id, f"worktree-init/{task['id']}")
        record = runcore.run_init_task(task, target, default_timeout)
        tasks.append(record)
        if record["outcome"] == "failed":
            failed = record["id"]
            break
    journal.clear_heartbeat(root, view.run_id)

    if failed:
        _emit(root, [{
            "event_type": "worktree.failed", "run_id": view.run_id,
            "attempt": view.attempt,
            "actor": journal.actor(ACTOR_FRAMEWORK, "worktree"),
            "summary": f"initialization failed at {failed}",
            "payload": {
                "worktree_id": view.worktree_id, "tasks": tasks,
                "failed_task": failed,
            },
        }])
        state = "failed"
    else:
        _emit(root, [{
            "event_type": "worktree.ready", "run_id": view.run_id,
            "attempt": view.attempt,
            "actor": journal.actor(ACTOR_FRAMEWORK, "worktree"),
            "summary": "worktree ready",
            "payload": {"worktree_id": view.worktree_id, "tasks": tasks},
        }])
        state = "ready"
    return {
        "run_id": view.run_id, "worktree_id": view.worktree_id,
        "state": state, "tasks": tasks,
    }


def cmd_worktree_remove(args) -> dict:
    root = _control_root()
    view = _view(root, args.run)
    if view.state not in (runcore.STATE_CREATED, *runcore.TERMINAL_STATES):
        raise Refusal(
            "wrong-state",
            f"{view.run_id} is {view.state}; only a terminal or never-started "
            "prepared worktree is removed.",
        )
    if not view.terminal:
        _emit(root, [{
            "event_type": "run.finished", "run_id": view.run_id,
            "attempt": view.attempt,
            "actor": journal.actor(ACTOR_OPERATOR, "operator"),
            "summary": "prepared run cancelled with its worktree",
            "payload": {
                "outcome": "cancelled", "commit": None, "tree_digest": None,
                "verdict": None, "checks_green": False,
            },
        }])
    run_git(root, "worktree", "remove", "--force", view.worktree_id)
    run_git(root, "worktree", "prune")
    if view.branch:
        run_git(root, "branch", "-D", view.branch)
    view = _view(root, view.run_id)
    return {
        "run_id": view.run_id, "worktree_id": view.worktree_id,
        "state": view.state, "tasks": view.worktree_tasks,
    }


# --- Parser -----------------------------------------------------------------

class _JsonSubparsers:
    """``--json`` is accepted before or after the verb.

    Every subparser gets its own copy with a suppressed default, so a flag
    typed before the verb is not silently overwritten by the subparser's
    default — the two spellings mean the same thing.
    """

    def __init__(self, actions):
        self._actions = actions

    def add_parser(self, name, **kwargs):
        parser = self._actions.add_parser(name, **kwargs)
        parser.add_argument(
            "--json", action="store_true", default=argparse.SUPPRESS
        )
        original = parser.add_subparsers

        def _wrapped(*a, **kw):
            return _JsonSubparsers(original(*a, **kw))

        parser.add_subparsers = _wrapped
        return parser



def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="dabbler")
    parser.add_argument("--json", action="store_true", default=False)
    sub = _JsonSubparsers(parser.add_subparsers(dest="verb", required=True))

    run = sub.add_parser("run")
    run.add_argument("--register", action="store_true", required=True)
    run.add_argument("--session", type=int)
    run.add_argument("--run")
    run.add_argument("--engine", required=True)
    run.add_argument("--provider", required=True)
    run.add_argument("--model", required=True)
    run.add_argument("--policy", choices=runcore.POLICIES)
    run.add_argument("--mode", choices=("registered", "wrapped"),
                     default="registered")
    run.set_defaults(handler=cmd_run)

    checkpoint = sub.add_parser("checkpoint")
    checkpoint.add_argument("--run", required=True)
    checkpoint.add_argument("--note", required=True)
    checkpoint.add_argument("--uncertain", action="store_true")
    checkpoint.add_argument("--ack-guidance-through", type=int)
    checkpoint.set_defaults(handler=cmd_checkpoint)

    guidance = sub.add_parser("guidance")
    guidance.add_argument("--run", required=True)
    guidance.add_argument("--text", required=True)
    guidance.add_argument("--answer", type=int)
    guidance.add_argument("--resume", action="store_true")
    guidance.add_argument("--attest-operator", action="store_true")
    guidance.set_defaults(handler=cmd_guidance)

    escalate = sub.add_parser("escalate")
    escalate.add_argument("--run", required=True)
    escalate.set_defaults(handler=cmd_escalate)

    check = sub.add_parser("check")
    check.add_argument("--run", required=True)
    check.add_argument("--stage", choices=checks.STAGES,
                       default=checks.STAGE_TARGETED)
    check.add_argument("--allow-full")
    check.add_argument("--attest-operator", action="store_true")
    check.set_defaults(handler=cmd_check)

    verify = sub.add_parser("verify")
    verify.add_argument("--run", required=True)
    verify.set_defaults(handler=_cmd_verify)

    finish = sub.add_parser("finish")
    finish.add_argument("--run", required=True)
    finish.add_argument("--outcome",
                        choices=("completed", "failed", "cancelled"))
    finish.set_defaults(handler=cmd_finish)

    resume = sub.add_parser("resume")
    resume.add_argument("--run", required=True)
    resume.add_argument("--extend-rounds", type=int)
    resume.add_argument("--model-usd-budget", type=float)
    resume.add_argument("--elapsed-minutes-budget", type=float)
    resume.add_argument("--attest-operator", action="store_true")
    resume.set_defaults(handler=cmd_resume)

    status = sub.add_parser("status")
    status.add_argument("--run")
    status.add_argument("--after", type=int)
    status.add_argument("--rebuild", action="store_true")
    status.set_defaults(handler=cmd_status)

    doctor = sub.add_parser("doctor")
    doctor.add_argument("--transport", choices=VALID_TRANSPORTS)
    doctor.set_defaults(handler=cmd_doctor)

    configure = sub.add_parser("configure")
    configure_sub = configure.add_subparsers(dest="target", required=True)
    transport = configure_sub.add_parser("transport")
    transport.add_argument("--profile", required=True)
    transport.add_argument("--user", action="store_true")
    transport.set_defaults(handler=cmd_configure_transport)

    organize = sub.add_parser("organize")
    organize_sub = organize.add_subparsers(dest="noun", required=True)
    org_session = organize_sub.add_parser("session")
    org_session_sub = org_session.add_subparsers(dest="action", required=True)
    session_add = org_session_sub.add_parser("add")
    session_add.add_argument("--title", required=True)
    session_add.add_argument("--policy", choices=runcore.POLICIES)
    session_add.set_defaults(handler=cmd_organize_session_add)

    for name, restore in (("cancel", False), ("restore", True)):
        action = organize_sub.add_parser(name)
        action.add_argument("--session", type=int, required=True)
        action.add_argument("--reason", required=True)
        action.add_argument("--attest-operator", action="store_true")
        action.set_defaults(
            handler=lambda a, r=restore: cmd_organize_cancel(a, restore=r)
        )

    _add_worktree_parser(sub)
    return parser


def _add_worktree_parser(sub) -> None:
    worktree = sub.add_parser("worktree")
    worktree_sub = worktree.add_subparsers(dest="action", required=True)
    create = worktree_sub.add_parser("create")
    create.add_argument("--session", type=int, required=True)
    create.add_argument("--policy", choices=runcore.POLICIES)
    create.set_defaults(handler=cmd_worktree_create)
    for name, handler in (
        ("init", cmd_worktree_init), ("remove", cmd_worktree_remove)
    ):
        action = worktree_sub.add_parser(name)
        action.add_argument("--run", required=True)
        action.set_defaults(handler=handler)


def _cmd_verify(args) -> dict:
    from .verifyjob import cmd_verify

    return cmd_verify(args)


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    try:
        payload = args.handler(args)
    except Refusal as refusal:
        _print({"refused": refusal.token, "detail": refusal.detail}, args)
        return EXIT_REFUSED
    except OperationalError as error:
        _print(
            {"error": error.token, "detail": error.detail, **error.extra}, args
        )
        return EXIT_ERROR
    except (journal.JournalError, runcore.TransitionError, ValueError) as error:
        token = (
            "journal-corrupt"
            if isinstance(error, journal.JournalCorrupt) else "invalid-state"
        )
        _print({"error": token, "detail": str(error)}, args)
        return EXIT_ERROR
    _print(payload, args)
    return EXIT_OK


def _print(payload: dict, args) -> None:
    if getattr(args, "json", False):
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return
    for key, value in payload.items():
        if isinstance(value, (dict, list)):
            value = json.dumps(value, ensure_ascii=False)
        print(f"{key}: {value}")


if __name__ == "__main__":
    raise SystemExit(main())
