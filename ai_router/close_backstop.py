"""Set 084 S2 — the close backstop: the framework holds the last word.

**Who uses this:** ``close_session.run`` only, on Full-tier closes.
**See also:** ``verify_session.py`` (the sanctioned mid-session Step 6
tool this reuses wholesale); ``verification_stamp.py`` (F3);
``gate_checks.check_verification_integrity`` (the evidence gate the
backstop's stamped row satisfies).

The structural move (spec Session 2 step 3): on a Full-tier close where
no valid stamped verification evidence exists for the session,
``close_session`` does not merely refuse — it **runs the verification
itself**, in-process, through the same F1/F2/F3 machinery the
``verify_session`` CLI uses: the same evidence assembly, the same
canonical adversarial template, the same registry-resolved
orchestrator-provider exclusion, the same raw artifacts, and the same
stamped metrics row (``source: "close_session_backstop"``). The policed
actor no longer holds the pen on the last word — ``verify_session``
remains the sanctioned tool for iterative remediation rounds; the
backstop guarantees the floor.

What the backstop respects (all spec-locked):

- **budget.yaml** — the operator-declared zero-budget tier
  (``threshold_usd: 0``) skips the backstop entirely; the existing
  manual/attested flow is untouched.
- **Method vocabulary** — an illegal ``verification_method`` token
  skips the backstop (the vocabulary gate refuses that close anyway;
  a metered call against a doomed close would be waste).
- **The two-attempt ladder** — one retry on a transport failure; a
  second failure blocks the close (never a pass).
- **``verification_unavailable``** — an exclusion that leaves no
  eligible verifier blocks the close explicitly; the only resolution
  is the operator-attested ``--manual-verify`` path.
- **The close lock** — the backstop runs inside ``close_session``'s
  lock, and its stamped evidence makes a re-run skip it (idempotent).

Evidence base: the caller commits and pushes BEFORE invoking
``close_session`` (the Section 1 ownership contract), so a
working-tree-vs-HEAD diff at close time is empty. The backstop diffs
against the last commit **before the session's ``startedAt``** so the
verifier reviews the session's actual work.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, List, Optional

try:
    from disposition import Disposition  # type: ignore[import-not-found]
    from gate_checks import (  # type: ignore[import-not-found]
        _claimed_close_verdict,
        _project_root_for,
        _read_budget_yaml,
        check_verification_method_vocabulary,
        find_session_verification_evidence,
    )
    from progress import normalize_to_v4_shape  # type: ignore[import-not-found]
    from session_state import read_session_state  # type: ignore[import-not-found]
    from verification import (  # type: ignore[import-not-found]
        classify_blocking,
        is_blocking_verdict,
        parse_verification_response,
    )
    import verify_session as _vs  # type: ignore[import-not-found]
    from verification_stamp import (  # type: ignore[import-not-found]
        GIT_EMPTY_TREE,
        STAMP_SOURCE_CLOSE_BACKSTOP,
        build_stamp,
        compute_work_diff_sha256,
        repo_relative_posix,
        resolve_commitish,
        sha256_hex,
    )
except ImportError:
    from .disposition import Disposition  # type: ignore[no-redef]
    from .gate_checks import (  # type: ignore[no-redef]
        _claimed_close_verdict,
        _project_root_for,
        _read_budget_yaml,
        check_verification_method_vocabulary,
        find_session_verification_evidence,
    )
    from .progress import normalize_to_v4_shape  # type: ignore[no-redef]
    from .session_state import read_session_state  # type: ignore[no-redef]
    from .verification import (  # type: ignore[no-redef]
        classify_blocking,
        is_blocking_verdict,
        parse_verification_response,
    )
    from . import verify_session as _vs  # type: ignore[no-redef]
    from .verification_stamp import (  # type: ignore[no-redef]
        GIT_EMPTY_TREE,
        STAMP_SOURCE_CLOSE_BACKSTOP,
        build_stamp,
        compute_work_diff_sha256,
        repo_relative_posix,
        resolve_commitish,
        sha256_hex,
    )


# Backstop outcome statuses. ``skipped_*`` means the close proceeds to
# the normal gate chain untouched; the other statuses carry the
# backstop's own verdict on the close.
STATUS_SKIPPED_EVIDENCE_PRESENT = "skipped_evidence_present"
STATUS_SKIPPED_ZERO_BUDGET = "skipped_zero_budget"
STATUS_SKIPPED_VOCABULARY = "skipped_illegal_vocabulary"
STATUS_VERIFIED = "verified"
STATUS_BLOCKING = "blocking_findings"
STATUS_UNAVAILABLE = "verification_unavailable"
STATUS_ROUTE_FAILED = "route_failed"
STATUS_IDENTITY_UNRESOLVABLE = "identity_unresolvable"

# The gate-result / closeout_failed check names the backstop surfaces
# through close_session's output shape.
BACKSTOP_CHECK_NAME = "verification_backstop"

_DEFAULT_COMPLEXITY_HINT = _vs.DEFAULT_COMPLEXITY_HINT


@dataclass
class BackstopOutcome:
    """What the backstop did, for ``close_session`` to act on."""

    status: str
    messages: List[str] = field(default_factory=list)
    # Paths the backstop wrote during the close (artifacts, issues
    # envelope, the patched disposition). close_session feeds these to
    # the working-tree gate as close-out bookkeeping — written mid-close
    # by design, committed in the follow-up close-out commit, exactly
    # like session-events.jsonl.
    written_paths: List[str] = field(default_factory=list)
    verdict: Optional[str] = None
    blocking: bool = False
    cost_usd: float = 0.0
    remediation: str = ""

    @property
    def skipped(self) -> bool:
        return self.status.startswith("skipped_")


def _default_route(prompt: str, session_set: str, session_number: int,
                   complexity_hint: int, max_tier: Optional[int],
                   exclude_providers: Optional[List[str]] = None,
                   verification_stamp: Optional[dict] = None):
    """Production route() invocation (injectable seam for tests).

    Identical contract to ``verify_session._default_route`` — the
    backstop IS Step 6, run by the framework instead of the
    orchestrator's hand.
    """
    return _vs._default_route(
        prompt, session_set, session_number, complexity_hint, max_tier,
        exclude_providers, verification_stamp,
    )


def _backstop_conventions(round_number: int) -> str:
    """The up-front conventions block for a backstop verification round.

    The project-guidance Convention (promoted L-064-10) requires every
    session-verification prompt to open with the agreed baseline so
    Round 1 spends findings on real defects. Two facts are structural
    to the backstop and produce guaranteed false positives when
    omitted (this set's own dogfood rounds 1–2 demonstrated both):

    - the verification runs IN-PROCESS during the very close it
      verifies, so the evidence necessarily shows an in-progress
      session (no ``closeout_succeeded`` yet, live lifecycle lock
      files) — the close completes mechanically only if this round's
      verdict is non-blocking, so "the close is not finished" is the
      expected mid-close view, never a finding;
    - the close/verdict contract is severity-derived (workflow Step
      6/7, L-071-1): the close proceeds on VERIFIED or a Minor-only
      (nits-only) ISSUES_FOUND and refuses on >=1 Critical/Major —
      the bare verdict token is not the blocking predicate.

    This block is factual context in the Original Task slot — the
    canonical adversarial template itself is untouched (L-069-2) and
    the F3 stamp still binds the row to it.
    """
    lines = [
        "- This verification is the Set 084 close backstop running "
        "IN-PROCESS during the very close it verifies "
        "(ai_router/docs/close-out.md Section 3, step 6b). The "
        "evidence therefore necessarily shows the session still "
        "in-progress (no closeout_succeeded event yet; lifecycle lock "
        "files present) -- that is the expected mid-close view. The "
        "close completes mechanically only if THIS round's verdict is "
        "non-blocking, so 'the close has not finished' is never "
        "itself a finding.",
        "- Blocking discipline (docs/ai-led-session-workflow.md Step "
        "6/7; L-071-1; explicitly preserved by the active spec's "
        "non-goals): the close proceeds on VERIFIED or on a "
        "Minor-only ISSUES_FOUND, and refuses on >=1 Critical/Major. "
        "Severity, not the bare verdict token, is the blocking "
        "predicate.",
    ]
    if round_number > 1:
        # Facts only (I-084-S2-12): the backstop cannot know whether
        # remediation actually happened between rounds, so it never
        # asserts it — it points at the on-disk round history and
        # instructs the verifier to judge the CURRENT state: re-report
        # what is still broken, do not re-open what the evidence shows
        # resolved.
        lines.append(
            f"- This is verification round {round_number}. Earlier "
            "rounds' raw outputs and findings envelopes are on disk in "
            "the session set (sN-verification*.md / sN-issues*.json), "
            "and any remediation is visible in the evidence diff. "
            "Judge the CURRENT state on its merits: a defect that "
            "remains present MUST be re-reported; a point the current "
            "evidence shows resolved is settled and is not re-opened "
            "under fresh wording."
        )
    return "\n".join(lines)


def _session_started_at(
    session_set_dir: Path, session_number: int
) -> Optional[str]:
    """The session's ``startedAt`` from the normalized v4 ledger, or None."""
    state = read_session_state(str(session_set_dir))
    if not state:
        return None
    try:
        normalized = normalize_to_v4_shape(
            state, str(session_set_dir / "spec.md")
        )
    except Exception:
        return None
    for entry in normalized.get("sessions") or []:
        if isinstance(entry, dict) and entry.get("number") == session_number:
            started = entry.get("startedAt")
            return started if isinstance(started, str) and started else None
    return None


def resolve_backstop_diff_base(
    session_set_dir: Path, session_number: int
) -> Optional[str]:
    """The git ref the backstop's evidence diff is taken against.

    The close-out ownership contract has the caller commit and push
    before ``close_session`` runs, so a plain ``HEAD`` diff at close
    time is empty — it would hand the verifier nothing. The backstop
    diffs against the last commit **before the session's
    ``startedAt``**, so the evidence bundle is the session's actual
    work (committed and uncommitted alike). When no pre-session commit
    exists (a fresh repo's first session), the base is git's empty
    tree — the session's work IS the whole tree (I-084-S2-6). Returns
    ``None`` — the caller FAILS CLOSED — when ``startedAt`` is missing
    or the repo cannot be resolved: silently verifying a thin/empty
    bundle is exactly the degraded evidence the round-3 finding
    refused.
    """
    started_at = _session_started_at(session_set_dir, session_number)
    if not started_at:
        return None
    try:
        repo_root = _vs.repo_root_for(session_set_dir)
    except _vs.VerifySessionError:
        return None
    proc = subprocess.run(
        [
            "git", "-C", str(repo_root), "rev-list", "--max-count=1",
            f"--before={started_at}", "HEAD",
        ],
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        return None
    sha = proc.stdout.decode("utf-8", errors="replace").strip()
    if re.fullmatch(r"[0-9a-f]{7,40}", sha):
        return sha
    # No commit predates startedAt: the whole tree is the session's
    # work — diff from the empty tree, never a silently empty bundle.
    return GIT_EMPTY_TREE


def _issues_envelope_for_artifact(
    session_set_dir: Path, artifact_path: Optional[str]
) -> Optional[dict]:
    """The ``sN-issues*.json`` envelope PAIRED with one verification
    artifact (same round suffix), or None.

    I-084-S2-8: the Minor-only settlement check must read the findings
    of the authoritative row's own round — a global "latest envelope"
    could pair a different round's findings with the row's verdict.
    """
    import json

    if not artifact_path:
        return None
    basename = os.path.basename(str(artifact_path))
    match = re.fullmatch(
        r"s(\d+)-verification(?:-round-(\d+))?\.md", basename
    )
    if not match:
        return None
    session_number = int(match.group(1))
    round_number = int(match.group(2) or 1)
    envelope_path = _vs.issues_artifact_path(
        session_set_dir, session_number, round_number
    )
    try:
        data = json.loads(envelope_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _existing_evidence_settles_the_close(
    session_set_dir: Path,
    session_number: int,
    disposition: Disposition,
    orchestrator_provider: str,
) -> Optional[dict]:
    """The authoritative settling row when valid stamped evidence
    already covers this close, else ``None``.

    ``verify_session`` pre-empts the backstop by producing exactly this
    state. Two shapes qualify:

    - a valid stamped row + a claimed ``VERIFIED``;
    - a valid stamped row + a claimed ``ISSUES_FOUND`` whose latest
      findings envelope is **non-blocking** (Minor-only — effectively
      VERIFIED for the loop, L-071-1). A blocking or envelope-less
      ``ISSUES_FOUND`` claim does NOT settle it: the backstop runs a
      fresh round so its verdict, not the stale one, governs.
    """
    _all, valid, _reasons = find_session_verification_evidence(
        str(session_set_dir), session_number, orchestrator_provider,
    )
    if not valid:
        return None
    claimed = _claimed_close_verdict(disposition)
    # I-084-S2-7/-8: the LATEST valid stamped row is the one
    # authoritative result (rows append chronologically) — the claim
    # must match IT, so neither a hand-flipped claim nor a cherry-pick
    # of an earlier favorable row can stand the backstop down after a
    # later verification refused.
    authoritative = valid[-1]
    if claimed != authoritative.get("verdict"):
        return None
    if claimed == "VERIFIED":
        return authoritative
    if claimed == "ISSUES_FOUND":
        envelope = _issues_envelope_for_artifact(
            session_set_dir, authoritative.get("artifact_path")
        )
        if envelope is None:
            return None  # anti-laundering: no findings list -> blocking
        issues = envelope.get("issues")
        if not isinstance(issues, list):
            return None
        if is_blocking_verdict("ISSUES_FOUND", issues):
            return None
        return authoritative
    return None


def _settling_bookkeeping_paths(
    session_set_dir: Path, authoritative: dict
) -> List[str]:
    """The corroborating evidence's on-disk bookkeeping for one close.

    I-084-S2-9 (the dogfood's round-6 finding): a backstop-VERIFIED run
    whose close later fails a different gate leaves its artifacts
    uncommitted; the RERUN skips the backstop, so the working-tree gate
    must keep tolerating exactly those files — rediscovered from the
    authoritative row, never remembered from a prior process.
    """
    paths: List[str] = [str(session_set_dir / "disposition.json")]
    artifact_path = authoritative.get("artifact_path")
    if not artifact_path:
        return paths
    resolved = (
        Path(artifact_path)
        if os.path.isabs(str(artifact_path))
        else Path(session_set_dir) / os.path.basename(str(artifact_path))
    )
    paths.append(str(resolved))
    match = re.fullmatch(
        r"s(\d+)-verification(?:-round-(\d+))?\.md",
        os.path.basename(str(artifact_path)),
    )
    if match:
        envelope = _vs.issues_artifact_path(
            session_set_dir, int(match.group(1)), int(match.group(2) or 1)
        )
        if envelope.exists():
            paths.append(str(envelope))
    return paths


def run_close_backstop(
    session_set_dir: str,
    session_number: Optional[int],
    disposition: Optional[Disposition],
    *,
    route_fn: Optional[Callable] = None,
    complexity_hint: int = _DEFAULT_COMPLEXITY_HINT,
) -> BackstopOutcome:
    """Run the Set 084 close backstop for one Full-tier close attempt.

    The caller (``close_session.run``) has already excluded the
    ``--force`` / ``--manual-verify`` / Lightweight paths and holds the
    close lock. This function decides skip-vs-run, performs the
    verification when owed, writes the artifacts + stamped row + the
    disposition patch, and reports what happened; the caller maps the
    outcome onto the close (proceed / ``gate_failed``).
    """
    set_dir = Path(session_set_dir)

    if disposition is None or session_number is None:
        # Nothing to police here: the missing-disposition refusal (and
        # the no-session shape) belongs to the invocation layer.
        return BackstopOutcome(
            status=STATUS_SKIPPED_VOCABULARY,
            messages=["backstop skipped: no disposition/session to close"],
        )

    # An illegal verification_method token dooms this close at the
    # vocabulary gate regardless of evidence — running a metered
    # verification first would be pure waste.
    vocab_ok, _ = check_verification_method_vocabulary(
        str(set_dir), disposition,
    )
    if not vocab_ok:
        return BackstopOutcome(
            status=STATUS_SKIPPED_VOCABULARY,
            messages=[
                "backstop skipped: disposition.verification_method is "
                "illegal; the vocabulary gate refuses this close"
            ],
        )

    # The operator-declared zero-budget tier keeps its existing manual /
    # attested flow, untouched (spec-locked). Only threshold_usd == 0
    # counts; an absent or unreadable budget.yaml is the api default.
    budget, _err = _read_budget_yaml(_project_root_for(str(set_dir)))
    if budget is not None and budget.get("threshold_usd") == 0:
        return BackstopOutcome(
            status=STATUS_SKIPPED_ZERO_BUDGET,
            messages=[
                "backstop skipped: ai_router/budget.yaml declares the "
                "zero-budget tier (threshold_usd: 0); the manual/attested "
                "flow governs this close"
            ],
        )

    # F1: resolve the orchestrator identity through the one shared path.
    # Unresolvable identity fails closed BEFORE any metered call.
    try:
        identity = _vs.resolve_orchestrator_exclusion(
            set_dir, session_number
        )
    except _vs.VerifySessionError as exc:
        return BackstopOutcome(
            status=STATUS_IDENTITY_UNRESOLVABLE,
            remediation=(
                f"{exc} Re-run start_session with --model, then close "
                "again."
            ),
        )

    # Skip when settling evidence already exists (verify_session — or a
    # prior backstop round — pre-empted this run). The skip outcome
    # still carries the corroborating evidence's bookkeeping paths so a
    # rerun after a later gate failure keeps tolerating the uncommitted
    # artifacts a prior backstop round wrote (I-084-S2-9).
    settling_row = _existing_evidence_settles_the_close(
        set_dir, session_number, disposition, identity.effective_provider,
    )
    if settling_row is not None:
        return BackstopOutcome(
            status=STATUS_SKIPPED_EVIDENCE_PRESENT,
            written_paths=_settling_bookkeeping_paths(
                set_dir, settling_row
            ),
        )

    # --- The backstop runs. Same machinery as verify_session, end to
    # --- end: evidence -> template -> exclusion -> stamped row ->
    # --- raw artifacts -> disposition patch.
    exclude_providers = [identity.effective_provider]
    diff_base = resolve_backstop_diff_base(set_dir, session_number)
    if diff_base is None:
        try:
            from .gate_checks import _verify_session_command
        except ImportError:
            from gate_checks import _verify_session_command  # type: ignore[no-redef]
        return BackstopOutcome(
            status=STATUS_ROUTE_FAILED,
            remediation=(
                "the backstop cannot determine the session's evidence "
                "base (no recorded startedAt, or the repo is "
                "unresolvable) and refuses to verify a degraded bundle "
                "(fails closed — I-084-S2-6). Run the sanctioned Step 6 "
                "command with an explicit --diff-base instead: "
                f"{_verify_session_command(str(set_dir))}"
            ),
        )
    try:
        round_number = _vs.resolve_round(set_dir, session_number, None)
        evidence = _vs.assemble_evidence(
            set_dir, session_number, diff_base,
            list(_vs.DEFAULT_DIFF_EXCLUDES),
        )
    except _vs.VerifySessionError as exc:
        return BackstopOutcome(
            status=STATUS_ROUTE_FAILED,
            remediation=(
                f"backstop could not assemble the evidence bundle: {exc}"
            ),
        )
    prompt = _vs.build_prompt(
        evidence, session_number, round_number,
        conventions=_backstop_conventions(round_number),
    )
    review_path = _vs.verification_artifact_path(
        set_dir, session_number, round_number
    )
    issues_path = _vs.issues_artifact_path(
        set_dir, session_number, round_number
    )
    try:
        repo_root = _vs.repo_root_for(set_dir)
    except _vs.VerifySessionError:
        repo_root = set_dir
    # I-084-S2-5: bind the stamp to the repo state under close. The
    # base is already resolved (rev-list sha or the empty tree);
    # resolve_commitish normalizes it and the freshness hash is what
    # the close gate recomputes.
    evidence_base = resolve_commitish(repo_root, diff_base)
    work_diff_sha256 = (
        compute_work_diff_sha256(set_dir, evidence_base)
        if evidence_base
        else None
    )
    if not evidence_base or not work_diff_sha256:
        return BackstopOutcome(
            status=STATUS_ROUTE_FAILED,
            remediation=(
                "the backstop could not bind the evidence stamp to the "
                f"repo state (base {diff_base!r}); fails closed."
            ),
        )
    try:
        stamp = build_stamp(
            source=STAMP_SOURCE_CLOSE_BACKSTOP,
            evidence_sha256=sha256_hex(prompt.encode("utf-8")),
            orchestrator_effective_provider=identity.effective_provider,
            artifact_path=repo_relative_posix(review_path, repo_root),
            evidence_base=evidence_base,
            work_diff_sha256=work_diff_sha256,
        )
    except ValueError as exc:
        # I-084-S2-11: a drifted-template refusal (or any stamp
        # assembly refusal) is a CONTROLLED fail-closed block, never an
        # unwinding traceback — no metered call is made.
        return BackstopOutcome(
            status=STATUS_ROUTE_FAILED,
            remediation=(
                f"the backstop refused to stamp (fails closed): {exc}"
            ),
        )

    if route_fn is None:
        route_fn = _default_route

    # Catch VerificationUnavailableError under EVERY module identity it
    # can carry (the I-084-S1-2 lesson, taken one step further): the
    # package-qualified class is what a production route() raises, but
    # under the sys.path-shim context the sibling bare module binds a
    # DISTINCT class object — an except clause naming only one silently
    # misses the other and the hard blocked state degrades to a generic
    # transport failure.
    unavailable_classes = []
    try:
        from ai_router.verification import (  # type: ignore[import-not-found]
            VerificationUnavailableError as _PkgUnavailable,
        )
        unavailable_classes.append(_PkgUnavailable)
    except ImportError:
        pass
    try:
        from verification import (  # type: ignore[no-redef]
            VerificationUnavailableError as _BareUnavailable,
        )
        if _BareUnavailable not in unavailable_classes:
            unavailable_classes.append(_BareUnavailable)
    except ImportError:
        pass
    unavailable = tuple(unavailable_classes)

    result = None
    last_error: Optional[Exception] = None
    for attempt in (1, 2):  # the existing two-attempt ladder, preserved
        try:
            result = route_fn(
                prompt,
                str(set_dir),
                session_number,
                complexity_hint,
                None,
                exclude_providers,
                stamp,
            )
            break
        except unavailable as exc:
            # The hard blocked state — no retry can conjure a diverse
            # provider. No verdict, no artifact, no disposition patch.
            return BackstopOutcome(
                status=STATUS_UNAVAILABLE,
                remediation=(
                    "the close backstop found no eligible verifier "
                    "outside the orchestrator's effective provider "
                    f"({identity.effective_provider}): {exc} The close "
                    "stays BLOCKED. The only sanctioned resolution is "
                    "the operator-attested manual path: close_session "
                    "--manual-verify with an attestation naming the "
                    "verifying surface, model, effective provider, "
                    "template used, timestamp, and raw artifact."
                ),
            )
        except Exception as exc:  # noqa: BLE001 — transport failures
            last_error = exc
            if attempt == 1:
                print(
                    "close_session backstop: verification attempt 1 "
                    f"failed ({type(exc).__name__}: {exc}); retrying "
                    "once.",
                    file=sys.stderr,
                )
    if result is None:
        try:
            from .gate_checks import _verify_session_command
        except ImportError:
            from gate_checks import _verify_session_command  # type: ignore[no-redef]
        return BackstopOutcome(
            status=STATUS_ROUTE_FAILED,
            remediation=(
                "the close backstop's verification call failed twice "
                f"(last: {type(last_error).__name__}: {last_error}). "
                "Provider unavailability at close BLOCKS the close — "
                "never a pass. Re-run close_session when the provider "
                "recovers, or run the sanctioned Step 6 command "
                f"yourself: {_verify_session_command(str(set_dir))}"
            ),
        )

    # Persist RAW before display/parsing (L-064-3); newline="" keeps the
    # on-disk bytes equal to the stamped artifact_sha256's input.
    review_path.write_text(result.content, encoding="utf-8", newline="")
    written = [str(review_path)]

    verdict, issues = parse_verification_response(result.content)
    classification = classify_blocking(verdict, issues)
    if issues:
        _vs.write_issues_artifact(
            issues_path, session_number, round_number, verdict, issues
        )
        written.append(str(issues_path))

    disposition_path = _vs.patch_disposition(set_dir, verdict)
    written.append(str(disposition_path))

    cost = float(getattr(result, "total_cost_usd", 0.0) or 0.0)
    messages = [
        "close backstop ran the session verification in-process "
        f"(Set 084): round {round_number}, verifier "
        f"{getattr(result, 'model_name', '?')}, excluded provider(s) "
        f"{', '.join(exclude_providers)}, diff base {diff_base}, "
        f"verdict {verdict}, cost ${cost:.4f}",
        f"backstop artifacts: {review_path.name}"
        + (f", {issues_path.name}" if issues else "")
        + "; disposition.json patched (verification_method=api, "
        f"verification_verdict={verdict}) — commit these in the "
        "close-out commit",
    ]

    if classification.blocking:
        findings = "; ".join(
            str(i.get("description", i))[:160]
            for i in classification.blocking_issues[:3]
        )
        return BackstopOutcome(
            status=STATUS_BLOCKING,
            messages=messages,
            written_paths=written,
            verdict=verdict,
            blocking=True,
            cost_usd=cost,
            remediation=(
                f"the backstop verification found BLOCKING issues "
                f"({len(classification.blocking_issues)} Critical/Major): "
                f"{findings}. Remediate, then re-verify with "
                "verify_session (the sanctioned remediation loop) and "
                "close again."
            ),
        )

    return BackstopOutcome(
        status=STATUS_VERIFIED,
        messages=messages,
        written_paths=written,
        verdict=verdict,
        blocking=False,
        cost_usd=cost,
    )
