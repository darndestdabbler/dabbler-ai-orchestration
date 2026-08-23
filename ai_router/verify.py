"""The cross-provider verification loop.

Round 1 evidence is the full session: spec excerpt, ``git status``, the
complete diff, and untracked file contents. Rounds ≥2 see only the
fix-delta — a tree-to-tree diff from the previous round's recorded
snapshot — plus the prior rounds' unresolved findings, so a verifier
reviews the remediation instead of re-reviewing the world.

The verifier is picked by route() under a hard provider exclusion: the
orchestrator's effective provider (derived by ``identity``, never trusted
from a label) is excluded, so verification is always cross-provider, on
either transport. One retry excludes a failed provider too; when nothing
survives, the close stays blocked and only the operator can resolve it.

No round opens on unproved work. The tests a change makes necessary cost
nothing next to a model, so they run first: a round is refused until an
accepted ``preverify-targeted`` record exists for the surfaces as they
currently stand. The complete suite is not that evidence — it is the run
of record, and it belongs after the final verified tree. The same
economy governs the declared controls: ``facts`` settles compile,
typecheck, lint, and analyzer before dispatch, and a red required one
returns to the author instead of being bought a verifier's opinion.

Outcomes append to the machine-only ledger; raw verifier output is saved
before any parsing. The loop suspends at the round cap
(``verification.settings.max_rounds``, default 3) — the closed severity
vocabulary is the primary control, the cap is the backstop.

A contested finding has a channel: ``verify dispute`` records an
evidence-backed rebuttal (never prose alone), and the next round presents
it beside the finding for UPHOLD-or-WITHDRAW — so a scope dispute
converges instead of being re-raised until the cap.

When the cap is reached with every blocking finding disputed, ``verify
adjudicate`` routes the disputes to a third provider — one excluded
harder than any verifier: the orchestrator's provider AND every provider
that verified a round are all ineligible. The adjudicator judges each
dispute (UPHOLD or OVERRULE; it may not raise new findings) and its
outcome lands as one terminal ``type: "adjudication"`` ledger row the
existing close gate reads unchanged. One adjudication per session, ever;
no verification round may open after it.

``verify waive`` is the operator's last exit, permitted only when the
machine path is exhausted: an adjudication upheld a blocking finding, or
adjudication is unavailable (its preconditions hold and no eligible
provider survives the exclusion superset). It is interactive-only — the
attestation is typed at a prompt and a non-TTY stdin is refused, which
is the mechanical distinction between an operator attestation and a
confabulated one. WAIVED means the operator accepts UNVERIFIED work; it
never means "verified another way". Every refusal in this loop names
its sanctioned next command — no message describes a dead end.

``verify prepare`` is the critique pipeline's entry point, additive and
off by default: it derives the ``change-id`` from the reviewed tree,
records the author's claims as the canonical ``review-claims.json``, and
opens the review run. It decides nothing — no round, no verdict and no
gate reads what it writes.

``verify step`` executes the session's approved plan one step at a time,
at a granularity below the round. A step is opened against a declared
file envelope and anchored to the commit it opened on; closing it is
refused when the work reached outside that envelope — an amendment
requirement, not a warning — and refused again when a declared control or
the step's own targeted tests come back red. Both are free, both run
before any model is asked anything, and ``verify step guard-commit`` is
the pre-commit hook that keeps the author from committing a step the
framework has not yet closed.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Optional

from . import ledger
from .evidence import repo_root_for, run_git, snapshot_worktree_tree
from .facts import (
    EvidenceEmptyError,
    EvidenceTooLargeError,
    FactsError,
    append_facts,
    assemble_evidence,
    assemble_fix_delta_evidence,
    build_diff_pathspecs,
    check_evidence_cap,
    collect_facts,
    red_facts_refusal,
)
from .identity import IdentityResolutionError, resolve_session_orchestrator_identity
from .session import extract_spec_excerpt, resolve_session_set_dir
# Both moved to verifyjob, which owns cross-provider dispatch, so that
# route.py — retained past the cutover — stops importing this module,
# which is not. Imported back here only while this module still exists.
from .verifyjob import auto_verify as auto_verify  # re-export
from .verifyjob import build_verification_prompt
from .verdict import (
    VERDICT_VERIFIED,
    VERDICT_WAIVED,
    classify_blocking,
    normalize_severity,
    parse_verification_response,
)

EXIT_OK = 0
EXIT_USAGE = 2
EXIT_STATE = 3
EXIT_BLOCKING = 4
EXIT_CALL_FAILED = 6
EXIT_UNAVAILABLE = 7

DEFAULT_MAX_ROUNDS = 3


class VerifyError(RuntimeError):
    pass


def _spec_excerpt(set_dir, session_number: int) -> str:
    try:
        text = (Path(set_dir) / "spec.md").read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return "(spec.md unavailable)"
    return extract_spec_excerpt(text, session_number)


_DISPUTE_EVIDENCE_INLINE_CAP = 16 * 1024

_EVIDENCE_RANGE = re.compile(r"^(.*?):(\d+)(?:-(\d+))?$")


def split_evidence_range(token: str) -> tuple:
    """``(path, start, end)`` from ``path[:START[-END]]``; a bare path is
    ``(path, None, None)``. The range is how a citation stays *relevant*
    inside a large file instead of hoping the passage lands in a prefix."""
    match = _EVIDENCE_RANGE.match(token)
    if not match:
        return token, None, None
    start = int(match.group(2))
    end = int(match.group(3)) if match.group(3) else start
    return match.group(1), start, end


def _cited_evidence_lines(repo_root, cite: str) -> list:
    """The cited content, fenced — a rebuttal argues from the record, so
    the record rides along. A line-range cite renders exactly that passage;
    a whole-file cite is capped, and the truncation names the range syntax
    instead of silently dropping the tail. A path missing at render time is
    said so, never silently dropped."""
    rel_path, start, end = split_evidence_range(cite)
    full = Path(repo_root) / rel_path
    try:
        text = full.read_bytes().decode("utf-8")
    except FileNotFoundError:
        return [f"  - Cited evidence `{cite}`: (missing at render time)"]
    except (OSError, UnicodeDecodeError):
        return [f"  - Cited evidence `{cite}`: (unreadable as UTF-8)"]
    if start is not None:
        all_lines = text.splitlines()
        excerpt = "\n".join(all_lines[start - 1:end])
        if not excerpt:
            return [
                f"  - Cited evidence `{cite}`: (the file has only "
                f"{len(all_lines)} line(s); the cited range is empty)"
            ]
        label = f"`{rel_path}` lines {start}-{min(end, len(all_lines))}"
        return [f"  - Cited evidence {label}:", "", "```", excerpt, "```", ""]
    if len(text) > _DISPUTE_EVIDENCE_INLINE_CAP:
        text = (
            text[:_DISPUTE_EVIDENCE_INLINE_CAP]
            + "\n... (truncated at the inline cap; cite "
            f"`{rel_path}:START-END` to include a later passage)"
        )
    return [f"  - Cited evidence `{rel_path}`:", "", "```", text, "```", ""]


def _split_disputes(rounds: list, disputes: list) -> tuple:
    """``(pending, settled_round_by_key)``: a dispute is PENDING until a
    round recorded after its filing has presented it; that round's own
    findings then carry the outcome (re-raised = upheld, absent =
    withdrawn), so re-presenting the rebuttal would re-litigate a settled
    point — the loop this channel exists to end."""
    pending, settled = {}, {}
    for d in disputes or []:
        key = (d["round"], d["finding_index"])
        later = [
            r["round"] for r in rounds if r["round"] > d["filed_after_round"]
        ]
        if later:
            settled[key] = min(later)
        else:
            pending[key] = d
    return pending, settled


def _prior_findings_block(rounds: list, disputes=None, repo_root=None) -> str:
    """Prior rounds' findings, blocking ones marked unresolved — a
    re-raised unresolved point is not resurrection; a new finding must be
    a new defect within the fix delta. A disputed finding carries the
    orchestrator's rebuttal beside it exactly once, so a scope dispute
    converges instead of being re-raised forever."""
    if not rounds:
        return ""
    pending, settled = _split_disputes(rounds, disputes or [])
    lines = [
        "#### Prior-round findings (auto-assembled from the run ledger)",
        "",
        "Findings from this session's prior verification rounds. New "
        "findings must be NEW defects within the fix delta. Re-evaluate "
        "each unresolved finding: if it persists, RE-RAISE it; if the "
        "remediation resolves it, say so.",
        "",
    ]
    if pending:
        lines[2:2] = [
            "A finding marked DISPUTED carries the orchestrator's rebuttal "
            "and its cited evidence directly beside it. Do not simply "
            "re-raise a disputed finding: engage the rebuttal — UPHOLD the "
            "finding with reasons that address the cited evidence, or "
            "WITHDRAW it. A withdrawn finding no longer counts as "
            "unresolved.",
            "",
        ]
    for row in rounds:
        lines.append(
            f"**Round {row['round']}** — {row.get('verdict')}, "
            f"{len(row.get('findings') or [])} finding(s)"
        )
        for index, finding in enumerate(row.get("findings") or []):
            severity = finding.get("severity", "major")
            description = str(finding.get("description", ""))[:700]
            key = (row["round"], index)
            dispute = pending.get(key)
            marker = " [DISPUTED]" if dispute else ""
            lines.append(f"- [{severity}]{marker} {description}")
            scenario = finding.get("failureScenario")
            if scenario:
                lines.append(f"  - Failure scenario: {str(scenario)[:300]}")
            if dispute:
                lines.append(
                    "  - Orchestrator's rebuttal (grounds): "
                    + str(dispute["grounds"])
                )
                for cite in dispute["evidence_paths"]:
                    lines.extend(_cited_evidence_lines(repo_root, cite))
            elif key in settled:
                lines.append(
                    f"  - (disputed; the rebuttal was presented in round "
                    f"{settled[key]} and is settled by that round's "
                    "findings — do not re-adjudicate it here)"
                )
        lines.append("")
    return "\n".join(lines)


def _build_task_block(
    set_dir, session_number: int, round_number: int, prior_rounds: list,
    disputes=None, repo_root=None,
) -> str:
    parts = []
    prior = _prior_findings_block(prior_rounds, disputes, repo_root)
    if prior:
        parts.append(prior)
    parts.append(
        f"Session {session_number} of the active session set (verification "
        f"round {round_number}). This is a **pre-close** review. The "
        "session's plan, verbatim from spec.md:\n\n"
        + _spec_excerpt(set_dir, session_number)
    )
    return "\n\n".join(parts)


# --- Dispatch with one cross-provider retry ---------------------------------

def _dispatch_verification(
    prompt: str, *, exclude_providers: list, session_set, session_number,
    transport=None,
):
    """Two attempts, one exclusion accumulator: a fallback can never
    re-cross the caller's constraint. NoCandidateError propagates — that is
    the operator-only 'verification unavailable' state."""
    from .route import DispatchError, route

    excluded = list(exclude_providers)
    last_exc = None
    for attempt in range(2):
        try:
            return route(
                prompt,
                task_type="session-verification",
                session_set=str(session_set),
                session_number=session_number,
                exclude_providers=excluded,
                transport=transport,
            )
        except DispatchError as exc:
            last_exc = exc
            failed = getattr(exc, "provider", None)
            if attempt == 0 and failed and failed not in excluded:
                excluded.append(failed)
                continue
            raise
    raise last_exc  # unreachable; defensive


# --- The loop entry point ----------------------------------------------------

def _run_of_record_lines(set_path, config) -> str:
    """The close is two steps away from a verified tree, and this names them.
    A malformed or suite-less config says nothing rather than guessing a
    command: a wrong command here is what the message exists to prevent."""
    from .test_evidence import load_suites_checked, run_of_record_recipe

    loaded = load_suites_checked(config)
    suite = next((s for s in loaded.suites if s.expensive), None)
    if loaded.errors or suite is None:
        return (
            "The run of record and the push remain before "
            "`python -m ai_router.session close`."
        )
    return run_of_record_recipe(set_path, suite.name, suite.command)


def run_round(
    set_dir, *, max_rounds: Optional[int] = None, transport: Optional[str] = None,
) -> int:
    """One verification round: assemble evidence, dispatch cross-provider,
    record the outcome. Returns a CLI exit code; re-invoking after
    remediation continues the loop automatically. *transport* overrides the
    resolved transport preference for this round's dispatch.

    A round never opens on unproved work: the affected tests come first, and
    a full-suite run is not a substitute for them."""
    from .affected import preverify_gate, preverify_recipe, remediation_recipe
    from .config import load_config
    from .route import NoCandidateError, RouterError
    from .session import append_change_log_block, record_session_verification
    from .progress import read_session_state

    set_path = Path(set_dir)
    repo_root = repo_root_for(set_path)
    if repo_root is None:
        print(f"verify: not inside a git repository: {set_path}",
              file=sys.stderr)
        return EXIT_STATE
    state = read_session_state(set_path)
    current = (state or {}).get("currentSession")
    if current is None:
        print(
            f"verify: no session is in flight under {set_path}; run "
            "start_session first.", file=sys.stderr,
        )
        return EXIT_STATE

    try:
        orchestrator = resolve_session_orchestrator_identity(set_path, current)
    except IdentityResolutionError as exc:
        print(f"verify: {exc}", file=sys.stderr)
        return EXIT_STATE

    config = load_config()
    settings = (config.get("verification") or {}).get("settings") or {}
    cap = max_rounds or settings.get("max_rounds", DEFAULT_MAX_ROUNDS)

    slug = set_path.name
    prior_rounds = ledger.read_rounds(repo_root, slug, current)
    if any(r.get("type") == "adjudication" for r in prior_rounds):
        print(
            f"verify: refused -- session {current} already carries its "
            "adjudication row. Adjudication is terminal: one per session, "
            "ever, and no further verification rounds may open after it.",
            file=sys.stderr,
        )
        return EXIT_USAGE
    if any(r.get("type") == "waive" for r in prior_rounds):
        print(
            f"verify: refused -- session {current} is WAIVED by operator "
            "attestation; the waive row is terminal and no further "
            "verification rounds may open after it. Close the session:\n"
            f"  python -m ai_router.session close --session-set-dir "
            f"{set_path}",
            file=sys.stderr,
        )
        return EXIT_USAGE
    round_number = (prior_rounds[-1]["round"] + 1) if prior_rounds else 1
    if round_number > cap:
        last = prior_rounds[-1]["round"]
        print(
            f"verify: refused -- round {round_number} exceeds the cap "
            f"({cap}). The loop SUSPENDS at the bound; it does not keep "
            "opening rounds. If no Critical/Major finding is left, close. "
            "A contested blocking finding has its sanctioned exits, in "
            "order:\n"
            "  1. rebut it on the record:\n"
            f"     python -m ai_router.verify dispute --session-set-dir "
            f"{set_path} --round {last} --finding <F> --grounds \"...\" "
            "--evidence <path>\n"
            "  2. route the recorded disputes to a third provider:\n"
            f"     python -m ai_router.verify adjudicate --session-set-dir "
            f"{set_path}",
            file=sys.stderr,
        )
        return EXIT_USAGE

    try:
        if round_number == 1:
            evidence = assemble_evidence(repo_root, set_path, current)
        else:
            baseline = prior_rounds[-1]["completion_tree"]
            evidence = assemble_fix_delta_evidence(
                repo_root, set_path, current, baseline
            )
    except (EvidenceEmptyError, EvidenceTooLargeError, FactsError,
            VerifyError) as exc:
        print(f"verify: {exc}", file=sys.stderr)
        return EXIT_UNAVAILABLE

    # After the bundle exists and before any model sees it: there is
    # something to review, so the tests that review costs nothing must have
    # run first.
    gate = preverify_gate(repo_root, set_path, config)
    if not gate.ok:
        remedy = preverify_recipe(
            set_path, gate.suite, gate.command
        ) if gate.command else (
            "There is no targeted command to offer you: declare the missing "
            "mapping under testing.selection so the selector can answer for "
            "these paths."
        )
        print(
            "verify: refused -- no valid targeted selection evidence for "
            f"this tree: {gate.reason}.\n"
            "Verification is not the first thing a change meets; the tests "
            "the change affects are. The full suite is neither required nor "
            "accepted here -- it is the run of record, and it comes AFTER "
            f"the final verified tree.\n{remedy}\n"
            "`python -m ai_router.affected` prints the selection and the "
            "reason behind each row.",
            file=sys.stderr,
        )
        return EXIT_USAGE

    # Still before any model sees the bundle: everything the machine can
    # settle by itself, settled. A red required control is the author's to
    # fix, and a verification round spent rediscovering it buys nothing the
    # exit code already said.
    facts = collect_facts(
        repo_root, set_path, config, gate=gate, round_number=round_number,
        session_number=current,
    )
    append_facts(repo_root, slug, facts)
    refusal = red_facts_refusal(facts)
    if refusal:
        print(refusal, file=sys.stderr)
        return EXIT_USAGE

    disputes = ledger.read_disputes(repo_root, slug, current)
    prompt_body = build_verification_prompt(
        config.get("_verification_template", ""),
        _build_task_block(
            set_path, current, round_number, prior_rounds, disputes,
            repo_root,
        ),
        "session-verification",
        evidence,
    )

    exclude = [orchestrator.effective_provider]
    try:
        result = _dispatch_verification(
            prompt_body, exclude_providers=exclude,
            session_set=slug, session_number=current,
            transport=transport,
        )
    except NoCandidateError as exc:
        print(
            "verify: VERIFICATION UNAVAILABLE -- no eligible verifier "
            "exists outside the orchestrator's effective provider "
            f"({orchestrator.effective_provider}). Reason: {exc}\n"
            "No verdict was written; the close stays BLOCKED. This state "
            "is resolvable only by the operator (never the engine).\n"
            "Operator exit: enable a model from another provider in "
            "router-config.yaml (or set its API key env var), then "
            "re-run:\n"
            f"  python -m ai_router.verify --session-set-dir {set_path}",
            file=sys.stderr,
        )
        return EXIT_UNAVAILABLE
    except RouterError as exc:
        print(
            f"verify: routed verification call failed: {exc}\n"
            "Nothing was written. Retry once; if the second provider also "
            "fails, escalate to the operator.", file=sys.stderr,
        )
        return EXIT_CALL_FAILED

    if result.truncated:
        print(
            "verify: the verifier response is truncated — invalid "
            "evidence; nothing was written.", file=sys.stderr,
        )
        return EXIT_UNAVAILABLE

    # Raw output first, before any parsing or display.
    raw_path = ledger.save_raw_output(
        repo_root, slug, current, round_number, result.content
    )

    verdict, issues = parse_verification_response(result.content)
    classification = classify_blocking(verdict, issues)
    findings = [
        {
            "description": str(i.get("description", ""))[:2000],
            "severity": normalize_severity(i.get("severity")),
        }
        for i in issues
    ]
    # Carry the optional fields without inventing values.
    for finding, issue in zip(findings, issues):
        for key in ("category", "failureScenario"):
            if issue.get(key):
                finding[key] = str(issue[key])[:1000]
        if issue.get("evidencePaths"):
            finding["evidencePaths"] = list(issue["evidencePaths"])[:20]
        finding["blocking"] = issue in classification.blocking_issues
        finding["section"] = (
            "nits" if issue.get("section") == "nits" else "body"
        )

    completion_tree = snapshot_worktree_tree(repo_root)
    if completion_tree is None:
        print("verify: could not snapshot the working tree; nothing "
              "recorded.", file=sys.stderr)
        return EXIT_CALL_FAILED

    row = {
        "round": round_number,
        "phase": "full" if round_number == 1 else "fix-delta",
        "verdict": verdict,
        "blocking": classification.blocking,
        "verifier_model": result.model_name,
        "verifier_provider": result.provider,
        "orchestrator_provider": orchestrator.effective_provider,
        "findings": findings,
        "cost_usd": result.cost_usd,
        "completion_tree": completion_tree,
        "recorded_at": datetime.datetime.now().astimezone().isoformat(),
        "transport": result.transport,
    }
    if round_number >= 2:
        row["previous_tree"] = prior_rounds[-1]["completion_tree"]
    ledger.append_round(repo_root, slug, current, row)

    if classification.blocking:
        print(
            f"verify: round {round_number} — {verdict} with "
            f"{len(classification.blocking_issues)} blocking finding(s) "
            f"(verifier {result.model_name}/{result.provider}). Raw output: "
            f"{raw_path}\n"
            + remediation_recipe(set_path, gate.suite)
        )
        return EXIT_BLOCKING

    # Loop finished: stamp the session record and the change-log summary.
    rounds_all = prior_rounds + [row]
    total_cost = sum(
        r["cost_usd"] for r in rounds_all if r.get("cost_usd") is not None
    )
    priced = any(r.get("cost_usd") is not None for r in rounds_all)
    record_session_verification(
        set_path, current, verdict,
        summary={
            "rounds": round_number,
            "verifierModel": result.model_name,
            "verifierProvider": result.provider,
            "transport": result.transport,
            "costUsd": round(total_cost, 6) if priced else None,
        },
    )
    cost_text = f"${total_cost:.4f}" if priced else "unpriced (seat transport)"
    append_change_log_block(
        set_path,
        f"## Session {current} verification — {verdict} after "
        f"{round_number} round(s)\n\n"
        f"- Verifier: {result.model_name} ({result.provider}) over "
        f"{result.transport}\n"
        f"- Orchestrator provider (excluded): "
        f"{orchestrator.effective_provider}\n"
        f"- Routed verification cost: {cost_text}\n"
        f"- Raw round output: `.dabbler/runs/{slug}/s{current}/`\n",
    )
    print(
        f"verify: round {round_number} — {verdict} "
        f"(verifier {result.model_name}/{result.provider}); "
        f"session {current} is verified.\n"
        + _run_of_record_lines(set_path, config)
    )
    return EXIT_OK


# --- The critique prepare path -----------------------------------------------
#
# Additive and default-off: nothing here reads a verdict, changes a round,
# or touches the close. It writes the canonical author claims and opens the
# review run that later sets will hang evidence from.

CHANGE_ID_LENGTH = 16


class ChangeIdSuppliedError(VerifyError):
    """A caller tried to name the change under review. The identity is
    derived from the tree, so a supplied value is refused rather than
    honoured — an id a model may choose is an id a model may reuse to file
    fresh evidence against a review it has already passed."""


def derive_change_id(baseline_tree, completion_tree: str) -> str:
    """The reviewed change's identity: a digest over the two tree objects
    that bound it. Pure and reproducible — the same reviewed tree always
    yields the same id, and nothing outside this function produces one."""
    if not completion_tree:
        raise VerifyError(
            "cannot derive a change-id: the working tree could not be "
            "snapshotted"
        )
    payload = f"baseline={baseline_tree or ''}\ncompletion={completion_tree}"
    return hashlib.sha256(
        payload.encode("utf-8")
    ).hexdigest()[:CHANGE_ID_LENGTH]


def _head_tree(repo_root) -> Optional[str]:
    rc, out, _ = run_git(repo_root, "rev-parse", "HEAD^{tree}")
    return out if rc == 0 and out else None


def load_author_claims(claims_path) -> list:
    """The author's claims, as a list. A missing path is no claims at all,
    which is a valid input and is not the same as a missing claims file."""
    if claims_path is None:
        return []
    path = Path(claims_path)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise VerifyError(f"claims file unreadable: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise VerifyError(f"claims file is not valid JSON: {exc}") from exc
    if isinstance(payload, dict):
        if "change_id" in payload:
            raise ChangeIdSuppliedError(
                f"{path} supplies a change_id. The change-id is derived from "
                "the reviewed tree by this command and cannot be supplied; "
                "remove the key and re-run."
            )
        if "claims" not in payload:
            raise VerifyError(
                f"{path} is an object with no 'claims' key. Supply "
                '{"claims": [...]} — an explicit empty list is the way to '
                "say the author claims nothing. A bare claim object is not "
                "read as a claims file, because reading it as zero claims "
                "would silently discard what the author wrote."
            )
        claims = payload["claims"]
    else:
        claims = payload
    if not isinstance(claims, list):
        raise VerifyError(
            f"{path} must hold a list of claims, or an object with a "
            "'claims' list"
        )
    return claims


def render_claims_markdown(record: dict) -> str:
    """The human-readable twin of review-claims.json. Decorative: nothing
    parses it, and deleting it changes no behavior."""
    lines = [
        f"# Review claims — change {record['change_id']}",
        "",
        "Generated from `review-claims.json`, which is the artifact code "
        "reads. This rendering is for people; nothing parses it.",
        "",
        f"- Attempt: {record.get('attempt', 1)}",
        f"- Recorded: {record['recorded_at']}",
        "",
    ]
    claims = record.get("claims") or []
    if not claims:
        lines.append("The author claims nothing about this change.")
    for claim in claims:
        lines.append(f"## {claim['claim_id']}")
        lines.append("")
        lines.append(claim["statement"])
        if claim.get("kind"):
            lines.append("")
            lines.append(f"- Kind: {claim['kind']}")
        for path in claim.get("paths") or []:
            lines.append(f"- Path: `{path}`")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def run_prepare(set_dir, *, claims_path=None) -> int:
    """Open (or extend) the review run for the current working tree and
    record the author's claims under the machine-owned run directory.

    A remediation does not open a second review run: it links a new attempt
    onto the one already open for this session, so the prior attempt's
    evidence stays exactly where it was recorded."""
    from .config import (
        CRITIQUE_PIPELINE_DEFAULT,
        CRITIQUE_PIPELINE_SHADOW,
        load_config,
    )
    from .progress import read_session_state

    set_path = Path(set_dir)
    repo_root = repo_root_for(set_path)
    if repo_root is None:
        print(f"verify prepare: not inside a git repository: {set_path}",
              file=sys.stderr)
        return EXIT_STATE
    state = read_session_state(set_path)
    current = (state or {}).get("currentSession")
    if current is None:
        print(
            f"verify prepare: no session is in flight under {set_path}; run "
            "start_session first.", file=sys.stderr,
        )
        return EXIT_STATE

    config = load_config()
    mode = (config.get("critique") or {}).get(
        "pipeline", CRITIQUE_PIPELINE_DEFAULT
    )
    if mode != CRITIQUE_PIPELINE_SHADOW:
        print(
            f"verify prepare: refused -- critique.pipeline is {mode!r}, which "
            "writes nothing. Set it to "
            f"{CRITIQUE_PIPELINE_SHADOW!r} in router-config.yaml (or in the "
            "project-local local-overrides.yaml) to record critique "
            "artifacts without letting them decide anything.",
            file=sys.stderr,
        )
        return EXIT_USAGE

    try:
        claims = load_author_claims(claims_path)
    except VerifyError as exc:
        print(f"verify prepare: {exc}", file=sys.stderr)
        return EXIT_USAGE

    completion_tree = snapshot_worktree_tree(repo_root)
    if completion_tree is None:
        print("verify prepare: could not snapshot the working tree; nothing "
              "recorded.", file=sys.stderr)
        return EXIT_CALL_FAILED
    baseline_tree = _head_tree(repo_root)

    slug = set_path.name
    now = datetime.datetime.now().astimezone().isoformat()
    try:
        existing = ledger.read_review_runs(repo_root, slug, current)
        if existing:
            run = existing[-1]
            change_id = run["change_id"]
            attempts = list(run["attempts"])
            attempt = attempts[-1]["attempt"] + 1
            attempts.append({
                "attempt": attempt,
                "opened_at": now,
                "baseline_tree": baseline_tree,
                "completion_tree": completion_tree,
                "previous_attempt": attempts[-1]["attempt"],
                "status": "open",
            })
            run = {**run, "attempts": attempts}
            if claims_path is None:
                # Silence on a remediation means the claims are unchanged,
                # not that the author has withdrawn them. Only an explicit
                # --claims replaces what is on the record.
                prior = ledger.read_review_claims(
                    repo_root, slug, current, change_id
                )
                claims = (prior or {}).get("claims", claims)
        else:
            change_id = derive_change_id(baseline_tree, completion_tree)
            attempt = 1
            run = {
                "schema_version": 1,
                "change_id": change_id,
                "set_slug": slug,
                "session_number": current,
                "opened_at": now,
                "attempts": [{
                    "attempt": 1,
                    "opened_at": now,
                    "baseline_tree": baseline_tree,
                    "completion_tree": completion_tree,
                    "previous_attempt": None,
                    "status": "open",
                }],
            }

        claims_record = {
            "schema_version": 1,
            "change_id": change_id,
            "attempt": attempt,
            "recorded_at": now,
            "claims": claims,
        }
    except ledger.LedgerError as exc:
        print(f"verify prepare: {exc}", file=sys.stderr)
        return EXIT_STATE
    except VerifyError as exc:
        print(f"verify prepare: {exc}", file=sys.stderr)
        return EXIT_CALL_FAILED

    # Author-supplied content is screened before any machine state moves:
    # a refusal must leave no opened attempt behind for the retry to
    # stumble over, and must still preserve what it rejected.
    try:
        ledger.screen_review_claims(repo_root, slug, current, claims_record)
    except ledger.LedgerError as exc:
        print(
            f"verify prepare: {exc} No attempt was opened. Correct the "
            "claims file and re-run.",
            file=sys.stderr,
        )
        return EXIT_USAGE

    try:
        run_path = ledger.write_review_run(repo_root, slug, current, run)
        ledger.write_review_claims(repo_root, slug, current, claims_record)
    except ledger.LedgerError as exc:
        print(f"verify prepare: {exc}", file=sys.stderr)
        return EXIT_STATE
    ledger.write_review_claims_twin(
        repo_root, slug, current, change_id,
        render_claims_markdown(claims_record),
    )

    print(
        f"verify prepare: change {change_id}, attempt {attempt} "
        f"({len(claims)} claim(s)) recorded under {run_path.parent}"
    )
    return EXIT_OK


# --- The dispute channel -----------------------------------------------------

def _resolve_repo_relative(root: Path, token: str) -> tuple:
    """``(repo-relative-posix-path, None)`` for an existing path inside the
    repo, else ``(None, "outside" | "missing")``. Relative and absolute
    forms get the same containment check — ``../elsewhere`` may exist, but
    it is not the repo's record."""
    path = Path(token)
    try:
        resolved = (
            path.resolve() if path.is_absolute() else (root / path).resolve()
        )
        rel = resolved.relative_to(root.resolve())
    except ValueError:
        return None, "outside"
    except OSError:
        return None, "missing"
    if not (root / rel).is_file():
        return None, "missing"
    return str(rel).replace("\\", "/"), None


def record_dispute(
    set_dir, *, round_number: int, finding_index: int, grounds: str,
    evidence: list,
) -> int:
    """Record the orchestrator's rebuttal of one recorded finding. The
    dispute is immutable and rides into the next round's prompt beside the
    finding it contests, where the verifier must engage it — UPHOLD or
    WITHDRAW — instead of re-raising it unanswered."""
    from .progress import read_session_state

    set_path = Path(set_dir)
    repo_root = repo_root_for(set_path)
    if repo_root is None:
        print(
            f"verify dispute: not inside a git repository: {set_path}",
            file=sys.stderr,
        )
        return EXIT_STATE
    state = read_session_state(set_path)
    current = (state or {}).get("currentSession")
    if current is None:
        print(
            f"verify dispute: no session is in flight under {set_path}; a "
            "dispute belongs to the session whose round it contests.",
            file=sys.stderr,
        )
        return EXIT_STATE

    if not (grounds or "").strip():
        print("verify dispute: --grounds must be non-empty",
              file=sys.stderr)
        return EXIT_USAGE
    if not evidence:
        print(
            "verify dispute: refused -- a dispute is an argument from the "
            "record, not a complaint; prose-only disputes are refused. Cite "
            "at least one existing repo path with --evidence.",
            file=sys.stderr,
        )
        return EXIT_USAGE

    root = Path(repo_root)
    cited = []
    for raw in evidence:
        rel, why = _resolve_repo_relative(root, raw)
        suffix = ""
        if rel is None and why == "missing":
            # Not a bare path: accept `path:START[-END]` line-range cites,
            # so a passage deep in a large file can be cited precisely.
            path_part, start, end = split_evidence_range(raw)
            if start is not None and 1 <= start <= end:
                rel, why = _resolve_repo_relative(root, path_part)
                if rel is not None:
                    suffix = f":{start}-{end}"
        if rel is None:
            reason = (
                "is outside the repository" if why == "outside"
                else "does not name a file in the repository"
            )
            print(
                f"verify dispute: refused -- evidence path {raw!r} "
                f"{reason}; a dispute cites the repo's own record.",
                file=sys.stderr,
            )
            return EXIT_USAGE
        if not suffix:
            # A bare cite of an oversized file would silently drop its
            # tail at render time; refuse it now, naming the exit.
            size = (root / rel).stat().st_size
            if size > _DISPUTE_EVIDENCE_INLINE_CAP:
                print(
                    f"verify dispute: refused -- {rel} is {size} bytes, "
                    "over the inline cap "
                    f"({_DISPUTE_EVIDENCE_INLINE_CAP}); cite the relevant "
                    f"passage as {rel}:START-END so it rides the prompt "
                    "whole instead of being truncated.",
                    file=sys.stderr,
                )
                return EXIT_USAGE
        cited.append(rel + suffix)

    slug = set_path.name
    rounds = ledger.read_rounds(repo_root, slug, current)
    target = next((r for r in rounds if r["round"] == round_number), None)
    if target is None:
        recorded = [r["round"] for r in rounds]
        print(
            f"verify dispute: round {round_number} is not recorded for "
            f"session {current} (recorded rounds: {recorded or 'none'}).",
            file=sys.stderr,
        )
        return EXIT_STATE
    findings = target.get("findings") or []
    if not 0 <= finding_index < len(findings):
        listing = "\n".join(
            f"  {i}. [{f.get('severity')}] "
            f"{str(f.get('description', ''))[:120]}"
            for i, f in enumerate(findings)
        )
        print(
            f"verify dispute: finding {finding_index} does not exist in "
            f"round {round_number}. Its findings, by 0-based index:\n"
            f"{listing or '  (none)'}", file=sys.stderr,
        )
        return EXIT_STATE

    row = {
        "round": round_number,
        "finding_index": finding_index,
        # The latest round at filing time: the first round recorded after
        # this presents the rebuttal, and later rounds treat the dispute
        # as settled by that round's findings instead of re-litigating it.
        "filed_after_round": rounds[-1]["round"],
        "grounds": grounds.strip(),
        "evidence_paths": cited,
        "recorded_at": datetime.datetime.now().astimezone().isoformat(),
    }
    try:
        ledger.append_dispute(repo_root, slug, current, row)
    except ledger.LedgerError as exc:
        print(f"verify dispute: {exc}", file=sys.stderr)
        return EXIT_STATE
    print(
        f"verify dispute: recorded against round {round_number} finding "
        f"{finding_index}. The next verification round presents the "
        "rebuttal beside the finding for UPHOLD-or-WITHDRAW."
    )
    return EXIT_OK


# --- The adjudication round --------------------------------------------------

def _adjudication_exclusions(orchestrator, rounds: list) -> list:
    """The exclusion superset: the orchestrator's effective provider AND
    every provider that verified any round. The adjudicator is a third
    voice, never a repeat one."""
    return sorted(
        {orchestrator.effective_provider}
        | {
            r["verifier_provider"] for r in rounds
            if r.get("verifier_provider")
        }
    )


def _undisputed_blocking_indices(latest: dict, disputes: list) -> list:
    """Indices of the latest round's blocking findings that carry no
    recorded dispute — the machine path is not exhausted while any
    remain."""
    disputed = {(d["round"], d["finding_index"]) for d in disputes}
    return [
        i for i, f in enumerate(latest.get("findings") or [])
        if f.get("blocking", True) and (latest["round"], i) not in disputed
    ]


def _adjudication_prompt(
    set_path, session_number: int, disputed: list, fix_delta: str,
    repo_root,
) -> str:
    """The adjudicator judges each dispute — UPHOLD or OVERRULE — and may
    not raise new findings: it judges the dispute, it does not re-review
    the world. Per dispute: the finding verbatim, the rebuttal verbatim,
    the cited evidence content, and the current fix-delta ride along."""
    lines = [
        "You are the ADJUDICATOR for a verification session that reached "
        "its round cap with disputed blocking findings. Two parties are "
        "deadlocked: the verifier maintains each finding below; the "
        "orchestrator has recorded an evidence-backed dispute against "
        "each. Your task is to judge each dispute on its merits.",
        "",
        "You may NOT raise new findings. You are judging the disputes; "
        "you are not re-reviewing the work.",
        "",
    ]
    for number, (round_number, index, finding, dispute) in enumerate(
        disputed, start=1
    ):
        lines.append(
            f"#### Dispute {number} — round {round_number}, "
            f"finding {index}"
        )
        lines.append("")
        # The complete stored finding record, never a projection — a
        # partial rendering hands the adjudicator a one-sided record
        # (the dispute rides in full) and can clear a valid finding.
        lines.extend([
            "The finding, verbatim (the complete recorded row):",
            "",
            "```json",
            json.dumps(finding, indent=2),
            "```",
            "",
        ])
        lines.append(
            "The orchestrator's dispute, verbatim (grounds): "
            + str(dispute["grounds"])
        )
        for cite in dispute["evidence_paths"]:
            lines.extend(_cited_evidence_lines(repo_root, cite))
        lines.append("")
    lines.extend([
        "#### The current fix-delta (last verified snapshot -> current "
        "working tree)",
        "",
        "```diff",
        fix_delta or "(no changes since the last round)",
        "```",
        "",
        "#### Required output",
        "",
        "For each dispute, exactly one judgment line, nothing else "
        "decides the outcome:",
        "",
        "Dispute N: UPHOLD — reasons that address the cited evidence",
        "Dispute N: OVERRULE — reasons",
        "",
        "A dispute you do not clearly judge counts as UPHELD.",
    ])
    return "\n".join(lines)


def run_adjudication(
    set_dir, *, max_rounds: Optional[int] = None,
    transport: Optional[str] = None,
) -> int:
    """Route the session's recorded disputes to a third provider for
    judgment. Machine-checked preconditions, each refusal naming the unmet
    one; the outcome is one terminal ledger row the existing
    ``verification_clean`` gate already knows how to read."""
    from .config import load_config
    from .route import NoCandidateError, RouterError
    from .session import append_change_log_block, record_session_verification
    from .progress import read_session_state
    from .verdict import (
        OUTCOME_OVERRULED,
        VERDICT_ISSUES_FOUND,
        parse_adjudication_response,
    )

    set_path = Path(set_dir)
    repo_root = repo_root_for(set_path)
    if repo_root is None:
        print(
            f"verify adjudicate: not inside a git repository: {set_path}",
            file=sys.stderr,
        )
        return EXIT_STATE
    state = read_session_state(set_path)
    current = (state or {}).get("currentSession")
    if current is None:
        print(
            f"verify adjudicate: no session is in flight under {set_path}.",
            file=sys.stderr,
        )
        return EXIT_STATE

    try:
        orchestrator = resolve_session_orchestrator_identity(set_path, current)
    except IdentityResolutionError as exc:
        print(f"verify adjudicate: {exc}", file=sys.stderr)
        return EXIT_STATE

    config = load_config()
    settings = (config.get("verification") or {}).get("settings") or {}
    cap = max_rounds or settings.get("max_rounds", DEFAULT_MAX_ROUNDS)

    slug = set_path.name
    rounds = ledger.read_rounds(repo_root, slug, current)
    if any(r.get("type") == "adjudication" for r in rounds):
        print(
            "verify adjudicate: refused -- unmet precondition: session "
            f"{current} already carries its adjudication row. One "
            "adjudication per session, ever.", file=sys.stderr,
        )
        return EXIT_STATE
    if any(r.get("type") == "waive" for r in rounds):
        print(
            f"verify adjudicate: refused -- session {current} is WAIVED "
            "by operator attestation; there is nothing left to "
            "adjudicate. Close the session:\n"
            f"  python -m ai_router.session close --session-set-dir "
            f"{set_path}",
            file=sys.stderr,
        )
        return EXIT_STATE
    latest = rounds[-1] if rounds else None
    if latest is None or latest["round"] < cap:
        reached = latest["round"] if latest else 0
        print(
            "verify adjudicate: refused -- unmet precondition: the round "
            f"cap ({cap}) is not reached (recorded rounds: {reached}). "
            "Adjudication is the exit from a capped impasse, not a "
            "shortcut around remediation.", file=sys.stderr,
        )
        return EXIT_STATE
    if not latest.get("blocking"):
        print(
            "verify adjudicate: refused -- unmet precondition: the latest "
            f"round ({latest['round']}) is not blocking; there is no "
            "impasse to adjudicate. Close the session.", file=sys.stderr,
        )
        return EXIT_STATE

    disputes = ledger.read_disputes(repo_root, slug, current)
    by_key = {(d["round"], d["finding_index"]): d for d in disputes}
    findings = latest.get("findings") or []
    blocking_indices = [
        i for i, f in enumerate(findings) if f.get("blocking", True)
    ]
    undisputed = _undisputed_blocking_indices(latest, disputes)
    if undisputed:
        listing = ", ".join(str(i) for i in undisputed)
        print(
            "verify adjudicate: refused -- unmet precondition: blocking "
            f"finding(s) {listing} of round {latest['round']} carry no "
            "recorded dispute. Adjudication judges disputes; record one "
            "per finding first:\n"
            f"  python -m ai_router.verify dispute --session-set-dir "
            f"{set_path} --round {latest['round']} --finding <F> "
            "--grounds \"...\" --evidence <path>", file=sys.stderr,
        )
        return EXIT_STATE

    current_tree = snapshot_worktree_tree(repo_root)
    if current_tree is None:
        print(
            "verify adjudicate: could not snapshot the working tree "
            "(failing closed).", file=sys.stderr,
        )
        return EXIT_CALL_FAILED
    rc, fix_delta, err = run_git(
        repo_root, "diff", "--no-color", latest["completion_tree"],
        current_tree, "--", *build_diff_pathspecs(),
    )
    if rc != 0:
        print(f"verify adjudicate: fix-delta diff failed: {err}",
              file=sys.stderr)
        return EXIT_CALL_FAILED

    disputed = [
        (latest["round"], i, findings[i], by_key[(latest["round"], i)])
        for i in blocking_indices
    ]
    prompt = _adjudication_prompt(
        set_path, current, disputed, fix_delta, repo_root
    )
    check_evidence_cap(prompt)

    excluded = _adjudication_exclusions(orchestrator, rounds)
    try:
        result = _dispatch_verification(
            prompt, exclude_providers=excluded,
            session_set=slug, session_number=current,
            transport=transport,
        )
    except NoCandidateError as exc:
        print(
            "verify adjudicate: VERIFICATION UNAVAILABLE -- no eligible "
            "adjudicator exists outside the excluded providers "
            f"({', '.join(excluded)}). Reason: {exc}\n"
            "No verdict was written; the close stays BLOCKED. This state "
            "is resolvable only by the operator (never the engine).\n"
            "Operator exits: enable a model from a provider outside the "
            "exclusions and re-run:\n"
            f"  python -m ai_router.verify adjudicate --session-set-dir "
            f"{set_path}\n"
            "or, if no third provider can exist, attest an operator "
            "waiver at an interactive prompt:\n"
            f"  python -m ai_router.verify waive --session-set-dir "
            f"{set_path}",
            file=sys.stderr,
        )
        return EXIT_UNAVAILABLE
    except RouterError as exc:
        print(
            f"verify adjudicate: routed adjudication call failed: {exc}\n"
            "Nothing was written. Retry once; if the second provider also "
            "fails, escalate to the operator.", file=sys.stderr,
        )
        return EXIT_CALL_FAILED

    if result.truncated:
        print(
            "verify adjudicate: the adjudicator response is truncated — "
            "invalid evidence; nothing was written.", file=sys.stderr,
        )
        return EXIT_UNAVAILABLE

    round_number = latest["round"] + 1
    raw_path = ledger.save_raw_output(
        repo_root, slug, current, round_number, result.content
    )

    judged = parse_adjudication_response(result.content, len(disputed))
    outcomes = [
        {
            "finding_index": index,
            "outcome": judgment["outcome"],
            "reasons": judgment["reasons"],
        }
        for (_, index, _, _), judgment in zip(disputed, judged)
    ]
    all_overruled = all(
        o["outcome"] == OUTCOME_OVERRULED for o in outcomes
    )
    verdict = VERDICT_VERIFIED if all_overruled else VERDICT_ISSUES_FOUND

    row = {
        "round": round_number,
        "type": "adjudication",
        "verdict": verdict,
        "blocking": not all_overruled,
        "verifier_model": result.model_name,
        "verifier_provider": result.provider,
        "orchestrator_provider": orchestrator.effective_provider,
        "findings": [],
        "outcomes": outcomes,
        "excluded_providers": excluded,
        "cost_usd": result.cost_usd,
        "completion_tree": current_tree,
        "previous_tree": latest["completion_tree"],
        "recorded_at": datetime.datetime.now().astimezone().isoformat(),
        "transport": result.transport,
    }
    ledger.append_round(repo_root, slug, current, row)

    outcome_lines = "\n".join(
        f"- Dispute on round {latest['round']} finding "
        f"{o['finding_index']}: {o['outcome']}"
        + (f" — {o['reasons']}" if o["reasons"] else "")
        for o in outcomes
    )
    if not all_overruled:
        upheld = sum(1 for o in outcomes if o["outcome"] != OUTCOME_OVERRULED)
        print(
            f"verify adjudicate: {verdict} — the adjudicator "
            f"({result.model_name}/{result.provider}) upheld {upheld} of "
            f"{len(outcomes)} disputed finding(s); the close stays "
            f"BLOCKED. Raw output: {raw_path}\n{outcome_lines}\n"
            "Exits: remediate the upheld finding(s) — no further "
            "verification round may open this session, so remediation "
            "lands in a follow-up session — or accept the work UNVERIFIED "
            "with an operator attestation at an interactive prompt:\n"
            f"  python -m ai_router.verify waive --session-set-dir "
            f"{set_path}"
        )
        return EXIT_BLOCKING

    rounds_all = rounds + [row]
    total_cost = sum(
        r["cost_usd"] for r in rounds_all if r.get("cost_usd") is not None
    )
    priced = any(r.get("cost_usd") is not None for r in rounds_all)
    record_session_verification(
        set_path, current, verdict,
        summary={
            "rounds": round_number,
            "verifierModel": result.model_name,
            "verifierProvider": result.provider,
            "transport": result.transport,
            "costUsd": round(total_cost, 6) if priced else None,
        },
    )
    cost_text = f"${total_cost:.4f}" if priced else "unpriced (seat transport)"
    append_change_log_block(
        set_path,
        f"## Session {current} adjudication — {verdict} (every disputed "
        f"finding OVERRULED)\n\n"
        f"- Adjudicator: {result.model_name} ({result.provider}) over "
        f"{result.transport}\n"
        f"- Excluded providers: {', '.join(excluded)}\n"
        f"- Routed cost, all rounds: {cost_text}\n"
        f"{outcome_lines}\n"
        f"- Raw round output: `.dabbler/runs/{slug}/s{current}/`\n",
    )
    print(
        f"verify adjudicate: {verdict} — the adjudicator "
        f"({result.model_name}/{result.provider}) overruled every "
        f"disputed finding; session {current} is clear to close.\n"
        f"{outcome_lines}"
    )
    return EXIT_OK


# --- The operator waiver -----------------------------------------------------

def run_waive(set_dir, *, max_rounds: Optional[int] = None) -> int:
    """Record the operator's attested acceptance of UNVERIFIED work.

    Permitted only when the machine path is exhausted: an adjudication row
    upheld at least one blocking finding, or adjudication is unavailable
    (its preconditions hold and no eligible provider survives the
    exclusion superset — checked with the same selection seam ``route()``
    uses). Interactive-only: the attestation is typed at a prompt, and a
    non-TTY stdin is refused — an engine in a non-interactive shell cannot
    invoke it. WAIVED means the session closes UNVERIFIED; it never means
    "verified another way"."""
    from .config import load_config
    from .progress import read_session_state
    from .session import append_change_log_block, record_session_verification
    from .verdict import OUTCOME_OVERRULED

    set_path = Path(set_dir)
    repo_root = repo_root_for(set_path)
    if repo_root is None:
        print(f"verify waive: not inside a git repository: {set_path}",
              file=sys.stderr)
        return EXIT_STATE
    state = read_session_state(set_path)
    current = (state or {}).get("currentSession")
    if current is None:
        print(
            f"verify waive: no session is in flight under {set_path}.",
            file=sys.stderr,
        )
        return EXIT_STATE

    slug = set_path.name
    rounds = ledger.read_rounds(repo_root, slug, current)
    if any(r.get("type") == "waive" for r in rounds):
        print(
            f"verify waive: refused -- session {current} already carries "
            "its waive row. One waiver per session, ever. Close the "
            "session:\n"
            f"  python -m ai_router.session close --session-set-dir "
            f"{set_path}",
            file=sys.stderr,
        )
        return EXIT_STATE

    adjudication = next(
        (r for r in rounds if r.get("type") == "adjudication"), None
    )
    if adjudication is not None:
        if not adjudication.get("blocking"):
            print(
                "verify waive: refused -- the adjudication overruled "
                "every disputed finding; there is nothing to waive. The "
                "session is clear to close:\n"
                f"  python -m ai_router.session close --session-set-dir "
                f"{set_path}",
                file=sys.stderr,
            )
            return EXIT_STATE
        judged_round = [r for r in rounds if not r.get("type")][-1]
        findings = judged_round.get("findings") or []
        waived_findings = [
            findings[o["finding_index"]]
            for o in adjudication.get("outcomes") or []
            if o["outcome"] != OUTCOME_OVERRULED
            and 0 <= o["finding_index"] < len(findings)
        ]
        exhausted_via = "upheld-adjudication"
    else:
        # No adjudication row: waivable only if adjudication is itself
        # unavailable — every adjudicate precondition holds and no
        # eligible provider survives. Anything less has a machine exit,
        # and the refusal names it.
        try:
            orchestrator = resolve_session_orchestrator_identity(
                set_path, current
            )
        except IdentityResolutionError as exc:
            print(f"verify waive: {exc}", file=sys.stderr)
            return EXIT_STATE
        config = load_config()
        settings = (config.get("verification") or {}).get("settings") or {}
        cap = max_rounds or settings.get("max_rounds", DEFAULT_MAX_ROUNDS)
        latest = rounds[-1] if rounds else None
        if latest is None or latest["round"] < cap:
            reached = latest["round"] if latest else 0
            print(
                "verify waive: refused -- the machine path is not "
                f"exhausted: the round cap ({cap}) is not reached "
                f"(recorded rounds: {reached}). Run the loop:\n"
                f"  python -m ai_router.verify --session-set-dir "
                f"{set_path}",
                file=sys.stderr,
            )
            return EXIT_STATE
        if not latest.get("blocking"):
            print(
                "verify waive: refused -- the latest round "
                f"({latest['round']}) is not blocking; there is nothing "
                "to waive. Close the session:\n"
                f"  python -m ai_router.session close --session-set-dir "
                f"{set_path}",
                file=sys.stderr,
            )
            return EXIT_STATE
        disputes = ledger.read_disputes(repo_root, slug, current)
        undisputed = _undisputed_blocking_indices(latest, disputes)
        if undisputed:
            listing = ", ".join(str(i) for i in undisputed)
            print(
                "verify waive: refused -- the machine path is not "
                f"exhausted: blocking finding(s) {listing} of round "
                f"{latest['round']} carry no recorded dispute. Record one "
                "per finding first:\n"
                f"  python -m ai_router.verify dispute --session-set-dir "
                f"{set_path} --round {latest['round']} --finding <F> "
                "--grounds \"...\" --evidence <path>",
                file=sys.stderr,
            )
            return EXIT_STATE
        from .route import RouterError, any_candidate_survives

        excluded = _adjudication_exclusions(orchestrator, rounds)
        try:
            adjudicable = any_candidate_survives(excluded)
        except RouterError:
            # An undispatchable transport cannot adjudicate either.
            adjudicable = False
        if adjudicable:
            print(
                "verify waive: refused -- the machine path is not "
                "exhausted: an eligible adjudicator exists outside the "
                f"excluded providers ({', '.join(excluded)}). Consensus "
                "precedes the operator; route the disputes first:\n"
                f"  python -m ai_router.verify adjudicate "
                f"--session-set-dir {set_path}",
                file=sys.stderr,
            )
            return EXIT_STATE
        waived_findings = [
            f for f in latest.get("findings") or []
            if f.get("blocking", True)
        ]
        exhausted_via = "adjudication-unavailable"

    if not sys.stdin.isatty():
        print(
            "verify waive: refused -- stdin is not a TTY. A waiver is an "
            "operator attestation typed at an interactive prompt; a "
            "non-interactive shell (an engine) cannot invoke it. Re-run "
            "this exact command in an interactive terminal.",
            file=sys.stderr,
        )
        return EXIT_USAGE

    print(
        f"verify waive: session {current} of {slug} — the following "
        f"blocking finding(s) will be waived ({exhausted_via}):"
    )
    for finding in waived_findings:
        print(
            f"  - [{finding.get('severity')}] "
            f"{str(finding.get('description', ''))[:200]}"
        )
    print(
        "WAIVED means the session closes UNVERIFIED — the operator "
        "accepts the risk on the record. It never means \"verified "
        "another way\"."
    )
    try:
        attestation = input(
            "Attestation (why this is accepted unverified): "
        ).strip()
    except EOFError:
        attestation = ""
    if not attestation:
        print(
            "verify waive: refused -- an empty attestation attests "
            "nothing; nothing was written.", file=sys.stderr,
        )
        return EXIT_USAGE

    completion_tree = snapshot_worktree_tree(repo_root)
    if completion_tree is None:
        print(
            "verify waive: could not snapshot the working tree; nothing "
            "recorded.", file=sys.stderr,
        )
        return EXIT_CALL_FAILED

    row = {
        "round": rounds[-1]["round"] + 1,
        "type": "waive",
        "verdict": VERDICT_WAIVED,
        "blocking": False,
        "findings": [],
        "attestation": attestation,
        "waived": {
            "exhausted_via": exhausted_via,
            "findings": waived_findings,
        },
        "completion_tree": completion_tree,
        "previous_tree": rounds[-1]["completion_tree"],
        "recorded_at": datetime.datetime.now().astimezone().isoformat(),
    }
    ledger.append_round(repo_root, slug, current, row)
    record_session_verification(set_path, current, VERDICT_WAIVED)
    waived_lines = "".join(
        f"- Waived: [{f.get('severity')}] "
        f"{str(f.get('description', ''))[:200]}\n"
        for f in waived_findings
    )
    append_change_log_block(
        set_path,
        f"## Session {current} verification — WAIVED (operator "
        "attestation)\n\n"
        f"- Machine path exhausted via: {exhausted_via}\n"
        f"{waived_lines}"
        f"- Attestation, verbatim: {attestation}\n"
        "- WAIVED means the operator accepted UNVERIFIED work; it is not "
        "a verification.\n",
    )
    print(
        f"verify waive: WAIVED recorded for session {current}. The "
        "session closes UNVERIFIED, carrying the attestation in the "
        "record:\n"
        f"  python -m ai_router.session close --session-set-dir {set_path}"
    )
    return EXIT_OK


# --- Step execution ----------------------------------------------------------
#
# A step is in flight or it is not, exactly one at a time, and
# step-execution.jsonl says which. A step answers for its own work and no
# one else's: its change set starts at the snapshot the previous step
# closed on, or at the commit the session opened on when it is the first.
# A closed step's work stays in the working tree until the session commits,
# so anchoring every step to that commit would charge each one for its
# predecessors -- and dropping those paths by name instead would let a
# later step edit them again, outside its own envelope, unremarked.
#
# The order is the economy. Git decides whether the work stayed inside the
# declared envelope, and a path outside it is refused as an amendment
# requirement rather than reported as a warning -- an envelope nothing
# enforces is a comment. Then the declared controls and the step's own
# targeted tests run, free, and a red one returns to the author. Only what
# survives both is worth a model.


class StepRefusal(VerifyError):
    """A step command refused, carrying the exit code the CLI returns."""

    def __init__(self, message: str, code: int = EXIT_STATE):
        super().__init__(message)
        self.code = code


def _step_command(verb: str, set_path, suffix: str = "") -> str:
    return (
        f"python -m ai_router.verify step {verb} --session-set-dir "
        f"{set_path}{suffix}"
    )


def _head_commit(repo_root) -> Optional[str]:
    rc, out, _ = run_git(repo_root, "rev-parse", "HEAD")
    out = (out or "").strip()
    return out if rc == 0 and out else None


def _step_session(set_path):
    from .progress import read_session_state

    repo_root = repo_root_for(set_path)
    if repo_root is None:
        raise StepRefusal(f"not inside a git repository: {set_path}")
    current = (read_session_state(set_path) or {}).get("currentSession")
    if current is None:
        raise StepRefusal(
            f"no session is in flight under {set_path}; register the session "
            "first:\n"
            f"  python -m ai_router.session start --session-set-dir {set_path}"
            " --engine <engine> --provider <provider>"
        )
    return repo_root, current


def _approved_plan_for(repo_root, set_path, session_number: int) -> dict:
    from .approved_plan import PlanIntegrityError, plan_path, read_plan

    slug = set_path.name
    if not plan_path(repo_root, slug, session_number).exists():
        raise StepRefusal(
            f"{slug} session {session_number} has no plan. A step executes "
            "against a plan pre-registered and approved before the code was "
            "seen; there is nothing to execute without one."
        )
    try:
        plan = read_plan(ledger.session_run_dir(repo_root, slug, session_number))
    except (PlanIntegrityError, ValueError, OSError) as exc:
        raise StepRefusal(str(exc)) from exc
    if not plan.get("approved"):
        raise StepRefusal(
            f"the plan for {slug} session {session_number} is not approved. "
            "An unapproved plan is still being written, and an envelope that "
            "can still move measures nothing."
        )
    return plan


def _baseline_tree_of(repo_root, commit: str) -> str:
    rc, tree, _ = run_git(repo_root, "rev-parse", f"{commit}^{{tree}}")
    tree = (tree or "").strip()
    if rc != 0 or not tree:
        raise StepRefusal(
            f"git could not resolve the tree of {commit[:12]}, the commit "
            "this step opened against; the step's own change set cannot be "
            "measured.",
            EXIT_CALL_FAILED,
        )
    return tree


def _envelope_refusal(set_path, step_id: str, comparison, note: str = "") -> str:
    if not comparison.measured:
        return (
            f"step {step_id!r} cannot be closed -- {comparison.unmeasured_reason}"
            ". An unmeasurable change set is never \"inside the plan\"."
        )
    rows = "\n".join(
        f"  {item.path}  ({item.reason})" for item in comparison.outside
    )
    return (
        f"step {step_id!r} wrote outside its declared envelope:\n{rows}\n"
        + (f"{note}\n" if note else "")
        + "This is an amendment requirement, not a warning. The envelope was "
        "declared before the code was seen, and widening it after the fact "
        "without a record is how a plan stops meaning anything. Either move "
        "the change back inside the envelope, or amend the plan -- the "
        "amendment carries the widening and is re-reviewed against the risk "
        "the wider envelope earns:\n"
        f"  {_step_command('amend', set_path)} --add-file <path> --reason "
        "\"<why the envelope was wrong>\""
    )


def _step_deterministic_facts(repo_root, config, changed_paths) -> tuple:
    """The declared controls plus the step's own targeted tests, run here
    rather than recorded by their author.

    Pre-verification asks the author to run and record; a step does not,
    because the framework is what closes it and a fact it collected itself
    needs no evidence protocol to be trusted.

    Every declaration is read before anything runs. A misdeclared suite or
    selection rule narrows what the pass executes without saying so, and a
    green row from a pass that silently skipped the step's tests is worse
    than no row -- so the errors come back with nothing run."""
    from .affected import (
        load_selection_config,
        select_tests,
        targeted_command,
    )
    from .facts import (
        KIND_TESTS,
        STATUS_NOT_APPLICABLE,
        ControlFact,
        ControlSpec,
        collect_control_facts,
        load_controls_checked,
        run_control,
    )
    from .test_evidence import load_suites_checked

    selection = load_selection_config(config)
    suites = load_suites_checked(config)
    errors = (
        tuple(load_controls_checked(config).errors)
        + tuple(selection.errors)
        + tuple(suites.errors)
    )
    if errors:
        return (), errors

    controls, _ = collect_control_facts(repo_root, config)
    result = select_tests(repo_root, changed_paths, selection.config)
    for suite in suites.suites:
        command = targeted_command(suite.command, result)
        if not command:
            controls += (ControlFact(
                KIND_TESTS, STATUS_NOT_APPLICABLE, "", False,
                f"{suite.name}: this step's paths map to no test",
            ),)
            continue
        controls += (run_control(
            repo_root, ControlSpec(KIND_TESTS, command, required=True)
        ),)
    return controls, ()


def _declaration_refusal(errors) -> str:
    rows = "\n".join(f"  {error}" for error in errors)
    return (
        "the deterministic pass cannot be trusted to have run this step's "
        f"evidence -- its declarations do not parse:\n{rows}\n"
        "A dropped suite and no suite at all look identical once the pass "
        "has finished, so a step does not close on a declaration nobody "
        "could read. Fix the declaration in router-config.yaml and close "
        "the step again."
    )


def run_step_open(set_dir, *, step_id: str) -> int:
    """Put one plan step in flight, anchored to the commit it opens on."""
    from .approved_plan import effective_plan, find_step

    set_path = Path(set_dir)
    try:
        repo_root, current = _step_session(set_path)
        slug = set_path.name
        plan = _approved_plan_for(repo_root, set_path, current)

        in_flight = ledger.open_step(repo_root, slug, current)
        if in_flight is not None:
            raise StepRefusal(
                f"step {in_flight['step_id']!r} is already in flight. Two "
                "open steps share one working tree, and neither one's diff "
                "is then its own. Close it first:\n"
                f"  {_step_command('close', set_path)}",
                EXIT_USAGE,
            )
        step = find_step(plan, step_id)
        if step is None:
            declared = ", ".join(
                s["step_id"] for s in effective_plan(plan)["steps"]
            )
            raise StepRefusal(
                f"step {step_id!r} is not declared in the approved plan for "
                f"session {current}. The plan declares: {declared}.",
                EXIT_USAGE,
            )
        if step_id in ledger.closed_step_ids(repo_root, slug, current):
            raise StepRefusal(
                f"step {step_id!r} is already closed. A step executes once: "
                "re-opening one would put a second change against an "
                "envelope that was reviewed for the first.",
                EXIT_USAGE,
            )
        base_commit = _head_commit(repo_root)
        if base_commit is None:
            raise StepRefusal(
                "git could not resolve HEAD, so the step has nothing to "
                "anchor its change set to.",
                EXIT_CALL_FAILED,
            )
        ledger.append_step_event(repo_root, slug, current, {
            "schema_version": ledger.STEP_SCHEMA_VERSION,
            "event": ledger.STEP_EVENT_OPENED,
            "recorded_at": datetime.datetime.now().astimezone().isoformat(),
            "set_slug": slug,
            "session_number": current,
            "step_id": step_id,
            "base_commit": base_commit,
        })
    except (StepRefusal, ledger.LedgerError) as exc:
        code = getattr(exc, "code", EXIT_STATE)
        print(f"verify step open: {exc}", file=sys.stderr)
        return code

    envelope = "\n".join(f"  {p}" for p in step["file_envelope"])
    contract = "\n".join(
        f"  [{item['kind']}] {item['description']}"
        for item in step["evidence_contract"]
    )
    print(
        f"step open: {step_id} is in flight, anchored to "
        f"{base_commit[:12]}.\n"
        f"{step['intent']}\n"
        f"Envelope -- nothing outside these paths:\n{envelope}\n"
        f"Evidence contract:\n{contract}\n"
        f"When the work is done:\n  {_step_command('close', set_path)}"
    )
    return EXIT_OK


def run_step_close(set_dir) -> int:
    """Close the step in flight: the envelope first, then the deterministic
    evidence, and neither costs a model call."""
    from .approved_plan import compare_to_envelope
    from .config import load_config
    from .evidence import snapshot_worktree_tree
    from .facts import FactRecord, red_facts_refusal

    set_path = Path(set_dir)
    try:
        repo_root, current = _step_session(set_path)
        slug = set_path.name
        step_row = ledger.open_step(repo_root, slug, current)
        if step_row is None:
            raise StepRefusal(
                f"no step is in flight for {slug} session {current}. Open "
                "one:\n"
                f"  {_step_command('open', set_path, ' --step <step_id>')}",
                EXIT_USAGE,
            )
        step_id = step_row["step_id"]
        base_commit = step_row["base_commit"]
        plan = _approved_plan_for(repo_root, set_path, current)

        head = _head_commit(repo_root)
        if head != base_commit:
            raise StepRefusal(
                f"HEAD moved from {base_commit[:12]} to "
                f"{(head or '(unknown)')[:12]} while step {step_id!r} was "
                "open. The step's envelope comparison and its deterministic "
                "evidence are both measured against the commit it opened on, "
                "so a commit landed mid-step leaves them describing someone "
                "else's change. Put the work back in the working tree "
                f"(git reset --soft {base_commit[:12]}) and close the step "
                "again. The framework commits a step, and only once its "
                "evidence is satisfied.",
                EXIT_BLOCKING,
            )

        baseline_tree = ledger.last_closed_tree(
            repo_root, slug, current
        ) or _baseline_tree_of(repo_root, base_commit)
        comparison = compare_to_envelope(
            repo_root, plan, set_path, baseline_tree, step_id=step_id
        )
        if comparison.needs_amendment:
            raise StepRefusal(
                _envelope_refusal(set_path, step_id, comparison), EXIT_BLOCKING
            )

        config = load_config()
        controls, errors = _step_deterministic_facts(
            repo_root, config, comparison.inside
        )
        if errors:
            raise StepRefusal(_declaration_refusal(errors), EXIT_BLOCKING)
        refusal = red_facts_refusal(
            FactRecord(controls=controls), "verify step close"
        )
        if refusal:
            print(refusal, file=sys.stderr)
            return EXIT_BLOCKING

        # The controls and tests just ran against this working tree, and a
        # compile, an analyzer or a test run that drops an artifact writes
        # to it like anything else. Measure again before the snapshot
        # becomes the next step's baseline: a path checked only before the
        # commands ran would let their output into the record unremarked,
        # and the next step would inherit it as already-accounted-for.
        comparison = compare_to_envelope(
            repo_root, plan, set_path, baseline_tree, step_id=step_id
        )
        if comparison.needs_amendment:
            raise StepRefusal(
                _envelope_refusal(
                    set_path, step_id, comparison,
                    note=(
                        "These appeared while the step's own deterministic "
                        "commands ran, so the write is theirs rather than "
                        "yours -- declare the artifact, or stop the command "
                        "writing it into the repository."
                    ),
                ),
                EXIT_BLOCKING,
            )

        closed_tree = snapshot_worktree_tree(repo_root)
        if closed_tree is None:
            raise StepRefusal(
                "git could not snapshot the working tree, so this step "
                "cannot record where it ended and the next step would have "
                "no baseline to be measured from.",
                EXIT_CALL_FAILED,
            )
        ledger.append_step_event(repo_root, slug, current, {
            "schema_version": ledger.STEP_SCHEMA_VERSION,
            "event": ledger.STEP_EVENT_CLOSED,
            "recorded_at": datetime.datetime.now().astimezone().isoformat(),
            "set_slug": slug,
            "session_number": current,
            "step_id": step_id,
            "base_commit": base_commit,
            "closed_tree": closed_tree,
            "envelope": {
                "inside": list(comparison.inside),
                "outside": [item.path for item in comparison.outside],
            },
            "deterministic": [fact.to_dict() for fact in controls],
        })
    except (StepRefusal, ledger.LedgerError) as exc:
        code = getattr(exc, "code", EXIT_STATE)
        print(f"verify step close: {exc}", file=sys.stderr)
        return code

    rows = "\n".join(
        f"  {fact.kind:<10} {fact.status:<15} {fact.command}"
        for fact in controls
    )
    print(
        f"step close: {step_id} closed. {len(comparison.inside)} path(s) "
        f"changed, all inside the declared envelope.\n{rows}"
    )
    return EXIT_OK


def run_step_status(set_dir) -> int:
    """What is in flight, what is done, and what is left."""
    from .approved_plan import effective_plan

    set_path = Path(set_dir)
    try:
        repo_root, current = _step_session(set_path)
        slug = set_path.name
        plan = _approved_plan_for(repo_root, set_path, current)
        in_flight = ledger.open_step(repo_root, slug, current)
        done = ledger.closed_step_ids(repo_root, slug, current)
    except (StepRefusal, ledger.LedgerError) as exc:
        print(f"verify step status: {exc}", file=sys.stderr)
        return getattr(exc, "code", EXIT_STATE)

    for step in effective_plan(plan)["steps"]:
        step_id = step["step_id"]
        if in_flight is not None and in_flight["step_id"] == step_id:
            mark = "OPEN "
        elif step_id in done:
            mark = "done "
        else:
            mark = "     "
        print(f"  {mark} {step_id}  {step['intent']}")
    if in_flight is None:
        print(f"No step is in flight. "
              f"{_step_command('open', set_path, ' --step <step_id>')}")
    else:
        print(f"Step {in_flight['step_id']!r} is in flight, anchored to "
              f"{in_flight['base_commit'][:12]}. "
              f"{_step_command('close', set_path)}")
    return EXIT_OK


def _spec_text(set_path) -> str:
    """The whole spec, not an excerpt: the plan reviewer derives a
    session's goals by parsing every session heading, so a slice of one
    session reads as a spec with no sessions in it."""
    try:
        return (Path(set_path) / "spec.md").read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise StepRefusal(
            f"{set_path}/spec.md could not be read, so the amendment has "
            f"nothing to be reviewed against: {exc}"
        ) from exc


def run_step_amend(set_dir, *, reason: str, added_files=None) -> int:
    """Widen the open step's envelope through the plan reviewer.

    The amendment carries the widening rather than a note about it, and it
    is re-reviewed against the risk the wider envelope derives -- so an
    author cannot amend past the review its own work earns."""
    from . import plan_review
    from .approved_plan import PlanImmutableError

    set_path = Path(set_dir)
    try:
        repo_root, current = _step_session(set_path)
        slug = set_path.name
        step_row = ledger.open_step(repo_root, slug, current)
        if step_row is None:
            raise StepRefusal(
                f"no step is in flight for {slug} session {current}; an "
                "amendment amends the step that needs it, not the plan at "
                "large.",
                EXIT_USAGE,
            )
        _approved_plan_for(repo_root, set_path, current)
        run_dir = ledger.session_run_dir(repo_root, slug, current)
        try:
            record, plan = plan_review.review_amendment(
                run_dir, _spec_text(set_path), current,
                step_id=step_row["step_id"], reason=reason,
                added_files=list(added_files or []),
                workspace_root=repo_root, session_set=slug,
            )
        except (PlanImmutableError, ValueError,
                plan_review.PlanReviewError) as exc:
            raise StepRefusal(str(exc), EXIT_USAGE) from exc
        if plan is None:
            raise StepRefusal(
                f"the amendment to {step_row['step_id']!r} was not approved "
                f"({record['outcome']}). The approved plan is unchanged.",
                EXIT_BLOCKING,
            )
    except (StepRefusal, ledger.LedgerError) as exc:
        print(f"verify step amend: {exc}", file=sys.stderr)
        return getattr(exc, "code", EXIT_STATE)

    print(
        f"step amend: {step_row['step_id']} amended; the envelope now "
        f"covers {', '.join(added_files or [])}.\n"
        f"  {_step_command('close', set_path)}"
    )
    return EXIT_OK


def run_step_guard_commit(cwd=".") -> int:
    """The pre-commit guard: refuse a manual commit while a step is open.

    The framework commits a step, after its evidence is satisfied. A commit
    made while a step is open leaves the step with no diff of its own to be
    judged by, which is why this is a refusal and not advice."""
    repo_root = repo_root_for(cwd)
    if repo_root is None:
        return EXIT_OK
    try:
        open_rows = ledger.open_steps_in_repo(repo_root)
    except ledger.LedgerError as exc:
        print(f"verify step guard-commit: {exc}", file=sys.stderr)
        return EXIT_STATE
    if not open_rows:
        return EXIT_OK
    rows = "\n".join(
        f"  {row['step_id']} (set {row['set_slug']}, session "
        f"{row['session_number']})" for row in open_rows
    )
    set_dir = f"docs/session-sets/{open_rows[0]['set_slug']}"
    print(
        "commit refused -- a step is open:\n"
        f"{rows}\n"
        "The framework commits a step, and it does so once the step's "
        "evidence is satisfied. Close the step and let it:\n"
        f"  {_step_command('close', set_dir)}",
        file=sys.stderr,
    )
    return EXIT_BLOCKING


def _step_main(argv) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m ai_router.verify step",
        description="Execute one approved-plan step: open it, close it "
                    "against its own envelope and deterministic evidence, "
                    "or ask what is in flight.",
    )
    sub = parser.add_subparsers(dest="verb", required=True)
    for verb, help_text in (
        ("open", "put one plan step in flight"),
        ("close", "close the step in flight"),
        ("status", "what is in flight, done, and left"),
        ("amend", "widen the open step's envelope, through review"),
    ):
        child = sub.add_parser(verb, help=help_text)
        child.add_argument("--session-set-dir", required=True,
                           help="directory, slug, or bare set number")
        if verb == "open":
            child.add_argument("--step", required=True,
                               help="a step_id the approved plan declares")
        if verb == "amend":
            child.add_argument("--add-file", action="append", default=[],
                               dest="add_file",
                               help="a path to add to the step's envelope "
                                    "(repeatable)")
            child.add_argument("--reason", required=True,
                               help="why the declared envelope was wrong")
    sub.add_parser("guard-commit",
                   help="pre-commit hook entry point; takes no arguments")
    args = parser.parse_args(argv)

    if args.verb == "guard-commit":
        return run_step_guard_commit()
    try:
        set_dir = resolve_session_set_dir(args.session_set_dir)
    except ValueError as exc:
        print(f"verify step {args.verb}: {exc}", file=sys.stderr)
        return EXIT_USAGE
    if args.verb == "open":
        return run_step_open(set_dir, step_id=args.step)
    if args.verb == "close":
        return run_step_close(set_dir)
    if args.verb == "amend":
        if not args.add_file:
            print(
                "verify step amend: refused -- an amendment must carry the "
                "change it makes. Name the path(s) with --add-file.",
                file=sys.stderr,
            )
            return EXIT_USAGE
        return run_step_amend(
            set_dir, reason=args.reason, added_files=args.add_file
        )
    return run_step_status(set_dir)


def _dispute_main(argv) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m ai_router.verify dispute",
        description="Rebut one recorded finding with evidence from the "
                    "repo; the next round presents it for "
                    "UPHOLD-or-WITHDRAW.",
    )
    parser.add_argument("--session-set-dir", required=True,
                        help="directory, slug, or bare set number")
    parser.add_argument("--round", type=int, required=True,
                        help="the recorded round the finding belongs to")
    parser.add_argument("--finding", type=int, required=True,
                        help="0-based index into that round's findings")
    parser.add_argument("--grounds", required=True,
                        help="the rebuttal's argument, one dispute per "
                             "finding, immutable once recorded")
    parser.add_argument("--evidence", action="append", default=[],
                        help="existing repo path the rebuttal cites, "
                             "optionally with a line range as "
                             "path:START-END (repeatable; at least one "
                             "is required)")
    args = parser.parse_args(argv)
    try:
        set_dir = resolve_session_set_dir(args.session_set_dir)
    except ValueError as exc:
        print(f"verify dispute: {exc}", file=sys.stderr)
        return EXIT_USAGE
    return record_dispute(
        set_dir, round_number=args.round, finding_index=args.finding,
        grounds=args.grounds, evidence=args.evidence,
    )


def _adjudicate_main(argv) -> int:
    from .config import VALID_TRANSPORTS

    parser = argparse.ArgumentParser(
        prog="python -m ai_router.verify adjudicate",
        description="Route the session's recorded disputes to a third "
                    "provider for judgment — UPHOLD or OVERRULE, one "
                    "adjudication per session, ever.",
    )
    parser.add_argument("--session-set-dir", required=True,
                        help="directory, slug, or bare set number")
    parser.add_argument("--max-rounds", type=int,
                        help="override the configured round cap the "
                             "precondition checks against")
    parser.add_argument(
        "--transport", choices=list(VALID_TRANSPORTS),
        help="override the resolved transport preference for the "
             "adjudication dispatch",
    )
    args = parser.parse_args(argv)
    try:
        set_dir = resolve_session_set_dir(args.session_set_dir)
    except ValueError as exc:
        print(f"verify adjudicate: {exc}", file=sys.stderr)
        return EXIT_USAGE
    return run_adjudication(
        set_dir, max_rounds=args.max_rounds, transport=args.transport,
    )


def _waive_main(argv) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m ai_router.verify waive",
        description="Operator-attested WAIVED outcome; interactive-only, "
                    "permitted only when the machine path is exhausted. "
                    "WAIVED means the session closes UNVERIFIED.",
    )
    parser.add_argument("--session-set-dir", required=True,
                        help="directory, slug, or bare set number")
    parser.add_argument("--max-rounds", type=int,
                        help="override the configured round cap the "
                             "adjudication-unavailable check measures "
                             "against")
    args = parser.parse_args(argv)
    try:
        set_dir = resolve_session_set_dir(args.session_set_dir)
    except ValueError as exc:
        print(f"verify waive: {exc}", file=sys.stderr)
        return EXIT_USAGE
    return run_waive(set_dir, max_rounds=args.max_rounds)


def _prepare_main(argv) -> int:
    # There is no --change-id flag, and this is the message that says so:
    # argparse's "unrecognized arguments" would read like an oversight.
    for token in argv:
        if token == "--change-id" or token.startswith("--change-id="):
            print(
                "verify prepare: refused -- there is no --change-id option. "
                "The change-id is derived from the reviewed tree; a supplied "
                "value is refused rather than honoured.",
                file=sys.stderr,
            )
            return EXIT_USAGE
    parser = argparse.ArgumentParser(
        prog="python -m ai_router.verify prepare",
        description="Open the review run for the current working tree and "
                    "record the author's claims. Writes only when "
                    "critique.pipeline is 'shadow'; decides nothing.",
    )
    parser.add_argument("--session-set-dir", required=True,
                        help="directory, slug, or bare set number")
    parser.add_argument(
        "--claims",
        help="JSON file holding the author's claims (a list, or an object "
             "with a 'claims' list). Omit for no claims.",
    )
    args = parser.parse_args(argv)
    try:
        set_dir = resolve_session_set_dir(args.session_set_dir)
    except ValueError as exc:
        print(f"verify prepare: {exc}", file=sys.stderr)
        return EXIT_USAGE
    return run_prepare(set_dir, claims_path=args.claims)


def main(argv=None) -> int:
    from .config import VALID_TRANSPORTS

    argv = list(sys.argv[1:]) if argv is None else list(argv)
    if argv[:1] == ["dispute"]:
        return _dispute_main(argv[1:])
    if argv[:1] == ["adjudicate"]:
        return _adjudicate_main(argv[1:])
    if argv[:1] == ["waive"]:
        return _waive_main(argv[1:])
    if argv[:1] == ["prepare"]:
        return _prepare_main(argv[1:])
    if argv[:1] == ["step"]:
        return _step_main(argv[1:])

    parser = argparse.ArgumentParser(prog="python -m ai_router.verify")
    parser.add_argument("--session-set-dir", required=True,
                        help="directory, slug, or bare set number")
    parser.add_argument("--max-rounds", type=int)
    parser.add_argument(
        "--transport", choices=list(VALID_TRANSPORTS),
        help="override the resolved transport preference for this round "
             "(highest level of the precedence: flag > DABBLER_TRANSPORT > "
             "transport.profile > api)",
    )
    args = parser.parse_args(argv)
    try:
        set_dir = resolve_session_set_dir(args.session_set_dir)
    except ValueError as exc:
        print(f"verify: {exc}", file=sys.stderr)
        return EXIT_USAGE
    return run_round(
        set_dir, max_rounds=args.max_rounds, transport=args.transport,
    )


if __name__ == "__main__":
    raise SystemExit(main())
