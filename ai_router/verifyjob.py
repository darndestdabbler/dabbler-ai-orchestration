"""One cross-provider review per round, and the loop that closes on it.

The independence guarantee is the point: the verifier is never the provider
that did the work, the exclusion is enforced in Python where the caller
cannot widen it away, and the model the provider says it served is resolved
back to a provider before any verdict is believed. A transport label is not
identity.

Response parsing is not reimplemented here. ``verdict.parse_verification_
response`` and ``classify_blocking`` decide what a verdict means and which
findings block, exactly as they do today; this module's job is to build the
evidence, dispatch once, and record what came back.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from pathlib import Path

import jsonschema

from . import checks, journal, runcore
from .config import load_config
from .evidence import run_git, snapshot_worktree_tree
from .journal import ACTOR_FRAMEWORK
from .runcore import Refusal
from .verdict import (
    VERDICT_ISSUES_FOUND,
    VERDICT_VERIFIED,
    classify_blocking,
    normalize_severity,
    parse_verification_response,
)

SCHEMA_VERSION = 1
POLICY_VERSION = "run-core-1"
OUTPUT_CONTRACT = "verdict-v2"

_SCHEMA_DIR = Path(__file__).parent / "schemas"
_schema_cache: dict = {}


def _schema(name: str) -> dict:
    if name not in _schema_cache:
        _schema_cache[name] = json.loads(
            (_SCHEMA_DIR / f"{name}.schema.json").read_text(encoding="utf-8")
        )
    return _schema_cache[name]


def _validate(document: dict, name: str, noun: str) -> dict:
    try:
        jsonschema.validate(document, _schema(name))
    except jsonschema.ValidationError as exc:
        location = "/".join(str(p) for p in exc.absolute_path) or "(root)"
        raise ValueError(f"{noun} invalid at {location}: {exc.message}") from exc
    return document


def _digest(raw: bytes) -> str:
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def verification_dir(root, run_id: str) -> Path:
    return journal.run_dir(root, run_id) / "verification"


# --- Round bookkeeping ------------------------------------------------------

def round_and_attempt(events) -> tuple:
    """``(round, attempt)`` for the dispatch about to happen.

    A transport failure produced no opinion, so it does not consume a round:
    the next dispatch is another attempt at the same one. Only a round that
    returned a verdict advances the count.
    """
    accepted = {
        e["payload"]["round"]
        for e in events
        if e["event_type"] == "verification.result"
        and e["payload"].get("verdict") is not None
        and "round" in e["payload"]
    }
    next_round = (max(accepted) if accepted else 0) + 1
    attempts = sum(
        1 for e in events
        if e["event_type"] == "verification.dispatched"
        and e["payload"]["round"] == next_round
    )
    return next_round, attempts + 1


def prior_reviewed_tree(events, before_round: int):
    """The tree the last accepted round reviewed, so round ≥ 2 can carry the
    fix delta rather than the whole session again."""
    reviewed = None
    for event in events:
        if event["event_type"] != "verification.result":
            continue
        payload = event["payload"]
        if payload.get("verdict") is None:
            continue
        if payload.get("round", 0) < before_round:
            reviewed = payload["tree_digest"]
    return reviewed


def prior_findings(events, before_round: int) -> list:
    for event in reversed(events):
        if event["event_type"] != "verification.result":
            continue
        payload = event["payload"]
        if payload.get("verdict") is None:
            continue
        if payload.get("round", 0) < before_round:
            return payload.get("blocking_findings") or []
    return []


# --- Evidence ---------------------------------------------------------------

def build_evidence(root, view, worktree, tree_digest, round_number, events):
    """Diff, check facts, and the ask — read from Git trees, never from the
    moving worktree, so what the verifier reviews is what was measured."""
    directory = verification_dir(root, view.run_id)
    directory.mkdir(parents=True, exist_ok=True)
    manifest = []

    base = prior_reviewed_tree(events, round_number) or view.base_commit
    rc, patch, err = run_git(
        worktree, "diff", "--no-ext-diff", "--no-color", base, tree_digest
    )
    if rc != 0:
        raise RuntimeError(f"could not materialize the review diff: {err}")
    diff_name = f"round-{round_number}-diff.patch"
    journal.atomic_write_text(directory / diff_name, patch + "\n")
    manifest.append({
        "kind": "diff", "ref": diff_name,
        "digest": _digest(patch.encode("utf-8")),
        "base_commit": base, "tree_digest": tree_digest,
    })

    facts = [
        {
            "check_id": c["check_id"], "stage": c["stage"],
            "outcome": c["outcome"], "exit_code": c["exit_code"],
            "duration_seconds": c["duration_seconds"],
            "tree_mutated": c["tree_mutated"], "selection": c["selection"],
        }
        for c in view.checks if c["tree_digest"] == tree_digest
    ]
    check_name = f"round-{round_number}-checks.json"
    body = json.dumps(facts, indent=2, ensure_ascii=False)
    journal.atomic_write_text(directory / check_name, body + "\n")
    manifest.append({
        "kind": "check", "ref": check_name,
        "digest": _digest(body.encode("utf-8")),
    })

    manifest.append({"kind": "ask", "inline": view.ask})
    if view.checkpoints:
        manifest.append({
            "kind": "checkpoints",
            "inline": "\n".join(f"- {c['note']}" for c in view.checkpoints),
        })
    findings = prior_findings(events, round_number)
    if findings:
        manifest.append({
            "kind": "findings",
            "inline": "\n".join(
                f"- [{f.get('severity')}] {f.get('description')}"
                for f in findings
            ),
        })
    return manifest, patch, facts


def build_request(view, config, *, round_number, tree_digest, manifest):
    budgets = config["run_policy"]["budgets"]
    dispatch_limit = (
        view.dispatch_limit if view.dispatch_limit is not None
        else budgets["model_dispatches"]
    )
    usd_cap = (
        view.model_usd_budget if view.model_usd_budget is not None
        else budgets.get("model_usd")
    )
    minutes_cap = (
        view.elapsed_minutes_budget
        if view.elapsed_minutes_budget is not None
        else budgets.get("elapsed_minutes")
    )
    return _validate({
        "schema_version": SCHEMA_VERSION,
        "request_id": str(uuid.uuid4()),
        "run_id": view.run_id,
        "round": round_number,
        "tree_digest": tree_digest,
        "policy_version": POLICY_VERSION,
        "orchestrator_identity": {
            "engine": view.engine, "provider": view.provider,
            "model": view.model,
            "identityProvenance": view.identity_provenance,
        },
        "excluded_providers": [view.provider],
        "evidence_manifest": manifest,
        "output_contract": OUTPUT_CONTRACT,
        "timeout_seconds": float(
            config["run_policy"]["check_timeout_seconds"]
        ),
        "budget": {
            "max_rounds": runcore.round_limit_for(view, config),
            "model_dispatches_remaining": max(
                0, dispatch_limit - view.dispatches
            ),
            "model_usd_remaining": (
                None if usd_cap is None else round(usd_cap - view.model_usd, 6)
            ),
            "elapsed_seconds_remaining": (
                None if minutes_cap is None
                else round(
                    (minutes_cap - runcore.elapsed_minutes(view)) * 60, 3
                )
            ),
        },
    }, "verification-request", "verification request")


def _strip_bodies(request: dict) -> dict:
    """The dispatched event carries the manifest's shape, not its bytes."""
    stripped = dict(request)
    stripped["evidence_manifest"] = [
        {k: v for k, v in entry.items() if k != "inline"}
        for entry in request["evidence_manifest"]
    ]
    return stripped


def build_prompt(config, request, patch, facts, findings) -> str:
    template = config.get("_verification_template") or (
        "## Independent Verification\n\n{original_task}\n\n"
        "### Task type\n\n{task_type}\n\n### Under review\n\n"
        "{original_response}\n"
    )
    ask = next(
        (e["inline"] for e in request["evidence_manifest"]
         if e["kind"] == "ask"), ""
    )
    review = [
        f"Diff from `{request['evidence_manifest'][0]['base_commit']}` to "
        f"tree `{request['tree_digest']}`:",
        "",
        "```diff",
        patch.strip() or "(no textual diff)",
        "```",
        "",
        "Declared checks that ran against this exact tree:",
        "",
        "```json",
        json.dumps(facts, indent=2, ensure_ascii=False),
        "```",
    ]
    if findings:
        review += [
            "",
            "This is a remediation round. The blocking findings it must "
            "answer were:",
            "",
            *(f"- {f.get('description')}" for f in findings),
        ]
    return (
        template
        .replace("{original_task}", ask)
        .replace("{task_type}", "session-verification")
        .replace("{original_response}", "\n".join(review))
    )


# --- Dispatch ---------------------------------------------------------------

def dispatch(request: dict, prompt: str, view):
    """Route the review under the hard exclusion, or refuse.

    The exclusion is re-checked here rather than trusted from the request:
    a request whose ``excluded_providers`` omits the working provider is the
    one shape that would silently buy a same-provider review.
    """
    from .route import DispatchError, NoCandidateError, route

    excluded = [p for p in request["excluded_providers"] if p]
    if view.provider not in excluded:
        raise Refusal(
            "provider-exclusion-missing",
            f"the request excludes {excluded} but the run's own provider is "
            f"{view.provider!r}. A review by the provider under review is "
            "not a cross-provider review.",
        )
    try:
        return route(
            prompt, task_type="session-verification",
            exclude_providers=excluded,
        ), None
    except NoCandidateError as exc:
        raise Refusal("verification-unavailable", str(exc)) from exc
    except DispatchError as exc:
        return None, f"transport:{type(exc).__name__}"


def _served_identity_error(result, request, config):
    """``None`` when the served model resolves to the provider the transport
    claims and stays outside the exclusion; a reason otherwise."""
    from .identity import resolve_model_provider

    served = result.served_model_id
    if not served:
        return "served-model-unknown"
    provider = resolve_model_provider(served, config.get("models"))
    if not provider:
        return f"served-model-unresolvable:{served}"
    if provider != str(result.provider or "").strip().lower():
        return f"served-provider-mismatch:{provider}!={result.provider}"
    if provider in request["excluded_providers"]:
        return f"served-provider-excluded:{provider}"
    return None


def _finding(issue: dict) -> dict:
    record = {
        "description": str(issue.get("description") or ""),
        "category": str(issue.get("category") or "unknown"),
        "severity": normalize_severity(issue.get("severity")),
    }
    for key in ("failureScenario", "evidencePaths", "raw"):
        if issue.get(key):
            record[key] = issue[key]
    return record


def build_result(request, *, attempt, route_result, error_class,
                 raw_ref, raw_digest, config):
    if route_result is None or error_class:
        return _validate({
            "schema_version": SCHEMA_VERSION,
            "request_id": request["request_id"], "attempt": attempt,
            "tree_digest": request["tree_digest"],
            "effective_provider": getattr(route_result, "provider", None),
            "requested_model": getattr(route_result, "model_id", None),
            "served_model_id": getattr(route_result, "served_model_id", None),
            "transport": getattr(route_result, "transport", None),
            "verdict": None, "blocking_findings": [], "minor_findings": [],
            "doc_capped_findings": [],
            "usage": {
                "input_tokens": getattr(route_result, "input_tokens", 0) or 0,
                "output_tokens": getattr(route_result, "output_tokens", 0) or 0,
                "model_usd": getattr(route_result, "cost_usd", None),
                "priced": getattr(route_result, "cost_usd", None) is not None,
            },
            "raw_output_ref": raw_ref, "raw_output_digest": raw_digest,
            "error_class": error_class, "round": request["round"],
            "dispatch_id": f"{request['request_id']}:{attempt}",
        }, "verification-result", "verification result")

    verdict, issues = parse_verification_response(route_result.content)
    classification = classify_blocking(verdict, issues)
    return _validate({
        "schema_version": SCHEMA_VERSION,
        "request_id": request["request_id"], "attempt": attempt,
        "tree_digest": request["tree_digest"],
        "effective_provider": route_result.provider,
        "requested_model": route_result.model_id,
        "served_model_id": route_result.served_model_id,
        "transport": route_result.transport,
        "verdict": (
            VERDICT_VERIFIED if verdict == VERDICT_VERIFIED
            else VERDICT_ISSUES_FOUND
        ),
        "blocking_findings": [
            _finding(i) for i in classification.blocking_issues
        ],
        "minor_findings": [_finding(i) for i in classification.nit_issues],
        "doc_capped_findings": [
            _finding(i) for i in classification.doc_capped_issues
        ],
        "usage": {
            "input_tokens": route_result.input_tokens or 0,
            "output_tokens": route_result.output_tokens or 0,
            "model_usd": route_result.cost_usd,
            "priced": route_result.cost_usd is not None,
        },
        "raw_output_ref": raw_ref, "raw_output_digest": raw_digest,
        "error_class": None, "round": request["round"],
        "dispatch_id": f"{request['request_id']}:{attempt}",
    }, "verification-result", "verification result")


def interrupted_result(root, view) -> dict:
    """The immutable failed attempt recovery records for a dispatch whose
    process is gone. It carries no verdict, so it accepts nothing and the
    next ``verify`` creates another attempt for the same round."""
    request = view.open_request
    round_number = request["round"]
    events = journal.read_events(root, run_id=view.run_id)
    attempt = sum(
        1 for e in events
        if e["event_type"] == "verification.dispatched"
        and e["payload"]["round"] == round_number
    )
    result = _validate({
        "schema_version": SCHEMA_VERSION,
        "request_id": request["request_id"], "attempt": attempt,
        "tree_digest": request["tree_digest"],
        "effective_provider": None, "requested_model": None,
        "served_model_id": None, "transport": None, "verdict": None,
        "blocking_findings": [], "minor_findings": [],
        "doc_capped_findings": [],
        "usage": {
            "input_tokens": 0, "output_tokens": 0, "model_usd": None,
            "priced": False,
        },
        "raw_output_ref": None, "raw_output_digest": None,
        "error_class": "interrupted", "round": round_number,
        "dispatch_id": f"{request['request_id']}:{attempt}",
    }, "verification-result", "verification result")
    journal.atomic_write_json(
        verification_dir(root, view.run_id)
        / f"round-{round_number}-attempt-{attempt}-result.json",
        result,
    )
    return result


# --- The verb ---------------------------------------------------------------

def cmd_verify(args) -> dict:
    from .runcli import _emit, _view, _control_root

    root = _control_root()
    config = load_config()
    view = _view(root, args.run)

    if view.policy != runcore.POLICY_VERIFIED:
        raise Refusal(
            "policy-fast",
            f"{view.run_id} is a 'fast' run and makes zero framework model "
            "calls. Run 'escalate' first if this work needs a review.",
        )
    if view.state not in (runcore.STATE_RUNNING, runcore.STATE_REMEDIATING):
        raise Refusal(
            "wrong-state",
            f"{view.run_id} is {view.state}; verification dispatches from "
            "running or remediating.",
        )

    worktree = Path(view.worktree_id)
    _run_targeted(root, config, view)
    view = _view(root, view.run_id)
    tree_digest = snapshot_worktree_tree(worktree)
    _require_targeted_evidence(view, tree_digest)

    events = journal.read_events(root, run_id=view.run_id)
    round_number, attempt = round_and_attempt(events)
    paused = _pause_if_exhausted(root, view, config, round_number)
    if paused is not None:
        return paused

    manifest, patch, facts = build_evidence(
        root, view, worktree, tree_digest, round_number, events
    )
    request = build_request(
        view, config, round_number=round_number, tree_digest=tree_digest,
        manifest=manifest,
    )
    directory = verification_dir(root, view.run_id)
    journal.atomic_write_json(
        directory / f"round-{round_number}-request.json", request
    )
    _emit(root, [{
        "event_type": "verification.dispatched", "run_id": view.run_id,
        "attempt": view.attempt,
        "actor": journal.actor(ACTOR_FRAMEWORK, "verifyjob"),
        "summary": f"verification round {round_number} dispatched",
        "artifact_refs": [
            f"{journal.RUNS_DIRNAME}/{view.run_id}/verification/"
            f"round-{round_number}-request.json"
        ],
        "payload": _strip_bodies(request),
    }])

    journal.write_heartbeat(root, view.run_id, f"verify/round-{round_number}")
    prompt = build_prompt(
        config, request, patch, facts, prior_findings(events, round_number)
    )
    route_result, error_class = dispatch(request, prompt, view)
    if route_result is not None and not error_class:
        error_class = _served_identity_error(route_result, request, config)

    raw_ref, raw_digest = None, None
    if route_result is not None and route_result.content:
        name = f"round-{round_number}-attempt-{attempt}-response.txt"
        journal.atomic_write_text(directory / name, route_result.content)
        raw_ref = name
        raw_digest = _digest(route_result.content.encode("utf-8"))

    result = build_result(
        request, attempt=attempt, route_result=route_result,
        error_class=error_class, raw_ref=raw_ref, raw_digest=raw_digest,
        config=config,
    )
    journal.atomic_write_json(
        directory / f"round-{round_number}-attempt-{attempt}-result.json",
        result,
    )
    journal.clear_heartbeat(root, view.run_id)

    batch = [{
        "event_type": "verification.result", "run_id": view.run_id,
        "attempt": view.attempt,
        "actor": journal.actor(
            ACTOR_FRAMEWORK, "verifyjob", result["effective_provider"]
        ),
        "summary": (
            f"round {round_number}: {result['verdict'] or error_class}"
        ),
        "payload": result,
    }]
    if route_result is not None:
        batch.append({
            "event_type": "run.cost_updated", "run_id": view.run_id,
            "attempt": view.attempt,
            "actor": journal.actor(ACTOR_FRAMEWORK, "verifyjob"),
            "summary": "verification dispatch cost",
            "payload": {
                "dispatch_id": result["dispatch_id"],
                "cost_usd": route_result.cost_usd,
                "pricing_status": (
                    "priced" if route_result.cost_usd is not None
                    else "unpriced"
                ),
                "source": route_result.transport,
                "usage": {
                    "input_tokens": route_result.input_tokens or 0,
                    "output_tokens": route_result.output_tokens or 0,
                },
            },
        })
    if result["blocking_findings"]:
        batch.append({
            "event_type": "remediation.started", "run_id": view.run_id,
            "attempt": view.attempt,
            "actor": journal.actor(ACTOR_FRAMEWORK, "verifyjob"),
            "summary": f"round {round_number}: "
                       f"{len(result['blocking_findings'])} blocking",
            "payload": {
                "round": round_number,
                "finding_count": len(result["blocking_findings"]),
            },
        })
    _emit(root, batch)

    view = _view(root, view.run_id)
    return {
        "round": round_number, "tree_digest": tree_digest,
        "verdict": result["verdict"], "error_class": result["error_class"],
        "blocking": result["blocking_findings"],
        "minor": result["minor_findings"],
        "doc_capped": result["doc_capped_findings"],
        "state": view.state,
    }


def _run_targeted(root, config, view) -> None:
    from .runcli import run_checks

    _, results, _, _ = run_checks(
        root, config, view, stage=checks.STAGE_TARGETED
    )
    blocking = [r for r in results if r.blocks]
    if blocking:
        raise Refusal(
            "targeted-checks-failed",
            "required targeted check(s) did not pass on this tree: "
            + ", ".join(sorted(r.check.name for r in blocking))
            + ". A review of a tree its own checks reject buys nothing.",
        )


def _require_targeted_evidence(view, tree_digest) -> None:
    """Targeted evidence must exist for this exact tree, and it must be
    evidence: a change no selection rule maps has not been tested, whatever
    the smoke run's exit code said."""
    targeted = [
        c for c in view.checks
        if c["stage"] == checks.STAGE_TARGETED
        and c["tree_digest"] == tree_digest
    ]
    if not targeted:
        raise Refusal(
            "targeted-evidence-missing",
            "no targeted check ran against this tree. Run "
            "'check --stage targeted' first.",
        )
    for record in targeted:
        selection = record.get("selection") or {}
        unknown = [
            r for r in selection.get("risks", [])
            if r.get("kind") == "selection_unknown"
        ]
        if unknown and selection.get("policy") != checks.FULL_ALLOWED_OPERATOR:
            raise Refusal(
                "selection-unknown",
                "no test maps to " + ", ".join(sorted(r["path"] for r in unknown))
                + ". Add a testing.selection rule, or re-run the targeted "
                "check with --allow-full \"<reason>\" --attest-operator.",
            )


def _pause_if_exhausted(root, view, config, round_number):
    """A ceiling pauses the run for the operator. It never opens another
    autonomous layer, in either policy."""
    from .runcli import _emit, _view

    limit = runcore.round_limit_for(view, config)
    reason = None
    if round_number > limit:
        reason = f"the verification round cap of {limit} is reached"
    else:
        reason = runcore.budget_exhaustion(view, config)
    if reason is None:
        return None
    _emit(root, [{
        "event_type": "run.waiting", "run_id": view.run_id,
        "attempt": view.attempt,
        "actor": journal.actor(ACTOR_FRAMEWORK, "verifyjob"),
        "summary": f"paused: {reason}",
        "payload": {
            "reason": "operator",
            "question": (
                f"{reason}. Extend with 'resume --extend-rounds <N> "
                "--attest-operator', waive with 'finish --waive \"<reason>\" "
                "--attest-operator', or record 'finish --outcome failed'."
            ),
        },
    }])
    view = _view(root, view.run_id)
    return {
        "round": round_number, "tree_digest": None, "verdict": None,
        "error_class": None, "blocking": [], "minor": [],
        "doc_capped": [], "state": view.state, "paused": reason,
    }
