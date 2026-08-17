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
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import re
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
    if any(r.get("type") == "adjudication" for r in prior_rounds):
        print(
            f"verify: refused -- session {current} already carries its "
            "adjudication row. Adjudication is terminal: one per session, "
            "ever, and no further verification rounds may open after it.",
            file=sys.stderr,
        )
        return EXIT_USAGE
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
    undisputed = [
        i for i in blocking_indices if (latest["round"], i) not in by_key
    ]
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
    _check_cap(prompt)

    # The exclusion superset: the orchestrator's effective provider AND
    # every provider that verified any round of this session. The
    # adjudicator is a third voice, never a repeat one.
    excluded = sorted(
        {orchestrator.effective_provider}
        | {r["verifier_provider"] for r in rounds}
    )
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
            "is resolvable only by the operator (never the engine).",
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
            f"BLOCKED. Raw output: {raw_path}\n{outcome_lines}"
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


def main(argv=None) -> int:
    from .config import VALID_TRANSPORTS

    argv = list(sys.argv[1:]) if argv is None else list(argv)
    if argv[:1] == ["dispute"]:
        return _dispute_main(argv[1:])
    if argv[:1] == ["adjudicate"]:
        return _adjudicate_main(argv[1:])

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
