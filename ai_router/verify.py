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

Outcomes append to the machine-only ledger; raw verifier output is saved
before any parsing. The loop suspends at the round cap
(``verification.settings.max_rounds``, default 3) — the closed severity
vocabulary is the primary control, the cap is the backstop.
"""

from __future__ import annotations

import argparse
import datetime
import os
import sys
from pathlib import Path
from typing import Optional

from . import ledger
from .evidence import repo_root_for, run_git, snapshot_worktree_tree
from .identity import IdentityResolutionError, resolve_session_orchestrator_identity
from .session import extract_spec_excerpt, resolve_session_set_dir
from .verdict import (
    VERDICT_VERIFIED,
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
DEFAULT_EVIDENCE_CHAR_CAP = 600 * 1024
_UNTRACKED_INLINE_CAP = 64 * 1024

DEFAULT_DIFF_EXCLUDES = (
    "dist", "out", "node_modules", ".venv", "__pycache__", "*.vsix",
)


class VerifyError(RuntimeError):
    pass


class EvidenceEmptyError(VerifyError):
    """Nothing to review: a bundle a verifier cannot review must never be
    routed — a session that already committed its work once verified
    nothing and nearly closed clean."""


class EvidenceTooLargeError(VerifyError):
    pass


def evidence_char_cap() -> int:
    raw = os.environ.get("AI_ROUTER_VERIFY_MAX_EVIDENCE_CHARS")
    try:
        return int(raw) if raw else DEFAULT_EVIDENCE_CHAR_CAP
    except ValueError:
        return DEFAULT_EVIDENCE_CHAR_CAP


def build_diff_pathspecs(excludes=DEFAULT_DIFF_EXCLUDES) -> list:
    """Depth-agnostic exclusions: the anchored form missed nested
    ``tools/x/dist``."""
    pathspecs = ["."]
    for pattern in excludes:
        pathspecs.append(f":(exclude,glob)**/{pattern}")
        if "*" not in pattern:
            pathspecs.append(f":(exclude,glob)**/{pattern}/**")
    return pathspecs


_BOOKKEEPING_BASENAMES = frozenset({
    "session-state.json", "activity-log.json", "change-log.md",
})


def _spec_excerpt(set_dir, session_number: int) -> str:
    try:
        text = (Path(set_dir) / "spec.md").read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return "(spec.md unavailable)"
    return extract_spec_excerpt(text, session_number)


def _untracked_contents(repo_root, pathspecs) -> tuple:
    """(inlined, omitted, bookkeeping): git diff shows only names for new
    files, so their contents ride separately. Exclusion is never silent —
    omitted files are listed with the reason."""
    rc, out, _ = run_git(
        repo_root, "ls-files", "--others", "--exclude-standard", "-z", "--",
        *pathspecs,
    )
    if rc != 0:
        return [], [], []
    inlined, omitted, bookkeeping = [], [], []
    for rel in (p for p in out.split("\0") if p):
        basename = rel.replace("\\", "/").rsplit("/", 1)[-1]
        if basename in _BOOKKEEPING_BASENAMES:
            bookkeeping.append(rel)
            continue
        full = Path(repo_root) / rel
        try:
            if full.is_symlink():
                omitted.append((rel, "symlink (not followed)"))
                continue
            size = full.stat().st_size
            if size > _UNTRACKED_INLINE_CAP:
                omitted.append((rel, f"oversized ({size} bytes)"))
                continue
            text = full.read_bytes().decode("utf-8")
        except UnicodeDecodeError:
            omitted.append((rel, "binary / non-UTF-8"))
            continue
        except OSError:
            omitted.append((rel, "unreadable"))
            continue
        inlined.append((rel, text))
    return inlined, omitted, bookkeeping


def _render_evidence(
    status: str, diff: str, diff_heading: str, inlined, omitted, bookkeeping
) -> str:
    parts = [
        "The session's work, as the working tree presents it.",
        "",
        "#### git status --short",
        "```",
        status or "(clean -- no changes reported)",
        "```",
        "",
        f"#### {diff_heading}",
        "",
        "```diff",
        diff or "(empty diff)",
        "```",
    ]
    if inlined:
        parts.append(
            "\n#### Untracked file contents (new files, absent from the diff)"
        )
        for rel, text in inlined:
            parts.extend([f"\n**{rel}**", "```", text, "```"])
    if omitted:
        parts.append("\n#### Untracked paths NOT inlined")
        parts.extend(f"- {rel} — {reason}" for rel, reason in omitted)
    if bookkeeping:
        parts.append("\n#### Expected framework bookkeeping (paths only)")
        parts.extend(f"- {rel}" for rel in bookkeeping)
    return "\n".join(parts)


def assemble_evidence(repo_root, set_dir, session_number: int) -> str:
    """Round 1: full working-tree evidence vs HEAD."""
    pathspecs = build_diff_pathspecs()
    rc, status, err = run_git(repo_root, "status", "--short")
    if rc != 0:
        raise VerifyError(f"git status failed: {err}")
    rc, diff, err = run_git(
        repo_root, "diff", "--no-color", "HEAD", "--", *pathspecs
    )
    if rc != 0:
        raise VerifyError(f"git diff failed: {err}")
    inlined, omitted, bookkeeping = _untracked_contents(repo_root, pathspecs)
    if not diff.strip() and not inlined:
        raise EvidenceEmptyError(
            "the evidence bundle is empty (no diff vs HEAD, no untracked "
            "files). If the session's work is already committed, verify "
            "against the commit range instead of routing an empty review."
        )
    heading = (
        "Complete diff (working tree vs `HEAD`; generated-bundle "
        f"exclusions: {', '.join(DEFAULT_DIFF_EXCLUDES)})"
    )
    rendered = _render_evidence(
        status, diff, heading, inlined, omitted, bookkeeping
    )
    _check_cap(rendered)
    return rendered


def assemble_fix_delta_evidence(
    repo_root, set_dir, session_number: int, baseline_tree: str
) -> str:
    """Rounds ≥2: tree-to-tree fix delta only. The untracked collector is
    deliberately absent — the tree diff already carries new files as added
    hunks."""
    current_tree = snapshot_worktree_tree(repo_root)
    if current_tree is None:
        raise VerifyError(
            "could not snapshot the working tree for the fix delta "
            "(failing closed)"
        )
    pathspecs = build_diff_pathspecs()
    rc, status, _ = run_git(repo_root, "status", "--short")
    rc, diff, err = run_git(
        repo_root, "diff", "--no-color", baseline_tree, current_tree, "--",
        *pathspecs,
    )
    if rc != 0:
        raise VerifyError(f"fix-delta diff failed: {err}")
    heading = (
        f"FIX DELTA ONLY (tree-to-tree: previous round "
        f"{baseline_tree[:12]} -> current working tree "
        f"{current_tree[:12]}). This is NOT the full session diff — new "
        "defects are admissible only within these hunks."
    )
    rendered = _render_evidence(status, diff, heading, [], [], [])
    _check_cap(rendered)
    return rendered


def _check_cap(rendered: str) -> None:
    cap = evidence_char_cap()
    if len(rendered) > cap:
        raise EvidenceTooLargeError(
            f"evidence bundle is {len(rendered)} chars (cap {cap}). Split "
            "the session or raise AI_ROUTER_VERIFY_MAX_EVIDENCE_CHARS."
        )


def _prior_findings_block(rounds: list) -> str:
    """Prior rounds' findings, blocking ones marked unresolved — a
    re-raised unresolved point is not resurrection; a new finding must be
    a new defect within the fix delta."""
    if not rounds:
        return ""
    lines = [
        "#### Prior-round findings (auto-assembled from the run ledger)",
        "",
        "Findings from this session's prior verification rounds. New "
        "findings must be NEW defects within the fix delta. Re-evaluate "
        "each unresolved finding: if it persists, RE-RAISE it; if the "
        "remediation resolves it, say so.",
        "",
    ]
    for row in rounds:
        lines.append(
            f"**Round {row['round']}** — {row.get('verdict')}, "
            f"{len(row.get('findings') or [])} finding(s)"
        )
        for finding in row.get("findings") or []:
            severity = finding.get("severity", "major")
            description = str(finding.get("description", ""))[:700]
            lines.append(f"- [{severity}] {description}")
            scenario = finding.get("failureScenario")
            if scenario:
                lines.append(f"  - Failure scenario: {str(scenario)[:300]}")
        lines.append("")
    return "\n".join(lines)


def _build_task_block(
    set_dir, session_number: int, round_number: int, prior_rounds: list
) -> str:
    parts = []
    prior = _prior_findings_block(prior_rounds)
    if prior:
        parts.append(prior)
    parts.append(
        f"Session {session_number} of the active session set (verification "
        f"round {round_number}). This is a **pre-close** review. The "
        "session's plan, verbatim from spec.md:\n\n"
        + _spec_excerpt(set_dir, session_number)
    )
    return "\n\n".join(parts)


def build_verification_prompt(
    template: str, original_task: str, task_type: str, original_response: str
) -> str:
    template = template or (
        "Verify the following work adversarially. Start your response "
        "with VERIFIED or ISSUES FOUND.\n\n### Original Task\n"
        "{original_task}\n\n### Task Type\n{task_type}\n\n"
        "### Response Under Review\n{original_response}\n"
    )
    return (
        template.replace("{original_task}", original_task or "(not provided)")
        .replace("{task_type}", task_type)
        .replace("{original_response}", original_response)
    )


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

def run_round(
    set_dir, *, max_rounds: Optional[int] = None, transport: Optional[str] = None,
) -> int:
    """One verification round: assemble evidence, dispatch cross-provider,
    record the outcome. Returns a CLI exit code; re-invoking after
    remediation continues the loop automatically. *transport* overrides the
    resolved transport preference for this round's dispatch."""
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
    round_number = (prior_rounds[-1]["round"] + 1) if prior_rounds else 1
    if round_number > cap:
        print(
            f"verify: refused -- round {round_number} exceeds the cap "
            f"({cap}). The loop SUSPENDS at the bound; it does not keep "
            "opening rounds. If no Critical/Major finding is left, close; "
            "an unfixed or disputed blocking finding goes to the operator.",
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
    except (EvidenceEmptyError, EvidenceTooLargeError, VerifyError) as exc:
        print(f"verify: {exc}", file=sys.stderr)
        return EXIT_UNAVAILABLE

    prompt_body = build_verification_prompt(
        config.get("_verification_template", ""),
        _build_task_block(set_path, current, round_number, prior_rounds),
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
            "is resolvable only by the operator (never the engine).",
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
            f"{raw_path}\nRemediate, then re-run the same command to open "
            f"round {round_number + 1}."
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
        f"session {current} is clear to close."
    )
    return EXIT_OK


# --- Task-level auto-verify (route()'s deferred seam) ------------------------

def auto_verify(route_result, content: str, task_type: str, config) -> Optional[dict]:
    """Verify a routed response with a different-provider verifier; returns
    ``{verdict, blocking, issue_count, verifier_model, verifier_provider}``
    or ``None`` when no verifier survives. Best-effort by contract: the
    routed call already succeeded and was paid for."""
    from .metrics import record_call
    from .route import RouterError, route

    prompt = build_verification_prompt(
        config.get("_verification_template", ""),
        content, task_type, route_result.content,
    )
    try:
        result = route(
            prompt, task_type="verification",
            exclude_providers=[route_result.provider],
        )
    except RouterError:
        return None
    verdict, issues = parse_verification_response(result.content)
    classification = classify_blocking(verdict, issues)
    record_call(
        config, call_type="verify", task_type=task_type,
        model=result.model_name, provider=result.provider,
        tier=result.tier, complexity_score=None, generation_params={},
        input_tokens=result.input_tokens, output_tokens=result.output_tokens,
        cost_usd=result.cost_usd, elapsed_seconds=result.elapsed_seconds,
        escalated=result.escalated, stop_reason="", transport=result.transport,
        verifier_of=route_result.model_name, verdict=verdict,
        issue_count=len(issues),
    )
    return {
        "verdict": verdict,
        "blocking": classification.blocking,
        "issue_count": len(issues),
        "verifier_model": result.model_name,
        "verifier_provider": result.provider,
    }


def main(argv=None) -> int:
    from .config import VALID_TRANSPORTS

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
