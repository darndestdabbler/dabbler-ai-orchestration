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
- **Method vocabulary** — an illegal ``verification_method`` token skips
  the backstop, because no evidence a round could buy would let that
  close pass: the token is what selects a corroboration path, and
  ``check_verification_integrity`` refuses a token it has no path for.
  (Set 116 S3 re-derived this skip after the operator's ruling demoted
  the vocabulary *gate* to warn-not-block, which falsified the reason
  the skip used to give without touching its conclusion.)
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
# Set 116 S2: the round budget is spent and this close has no settling
# evidence. The backstop refuses rather than buying another round; the
# close blocks and names the operator's two exits.
STATUS_ROUND_BOUND_REACHED = "round_bound_reached"

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


@dataclass
class BackstopDecision:
    """Whether the backstop will spend a routed call — decided before it does.

    Set 119 S2. Every branch the backstop takes *before* its metered call
    is a read of on-disk state: the method token, ``budget.yaml``, the
    orchestrator identity, the stamped evidence, the round ledger and the
    session's diff base. So the answer is knowable at any time, which is
    what ``close_preflight`` asks on the orchestrator's behalf — 78 of the
    212 recorded close-out check-failures are this one check, and each
    firing spends a routed round at close time to say something that was
    knowable minutes earlier.

    This is an **extraction, not a copy**. A preflight carrying its own
    spelling of the sequence would drift from the close it predicts, and a
    preflight that disagrees with the gate is worse than no preflight —
    it would teach orchestrators to distrust it, which is how a reporting
    tool dies. :func:`run_close_backstop` consumes exactly this object, so
    there is one sequence with two readers.

    ``would_route`` True means the next thing the backstop does is spend
    money; ``identity``, ``round_number`` and ``diff_base`` are then the
    resolved inputs it would spend it with. ``would_route`` False means
    the backstop has already decided, and ``outcome`` is the verbatim
    :class:`BackstopOutcome` the close would see.
    """

    would_route: bool
    outcome: Optional[BackstopOutcome] = None
    identity: Optional[object] = None
    round_number: Optional[int] = None
    diff_base: Optional[str] = None


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


def _read_stamped_artifact_text(
    session_set_dir: Path, artifact_path: Optional[str]
) -> Optional[str]:
    """The UTF-8 text of the stamped raw verification artifact, or ``None``.

    Resolves ``artifact_path`` the way the stamp validator does (absolute as-is,
    else by basename at the session-set root). This artifact is the HASH-BOUND
    source of truth for the verifier's findings: its bytes are re-validated
    against ``artifact_sha256`` by :func:`validate_stamped_row` (so a row only
    reaches ``valid`` when the artifact is intact). Reparsing it is therefore
    tamper-evident, unlike reading the editable ``sN-issues.json`` envelope.
    """
    if not artifact_path:
        return None
    resolved = (
        Path(artifact_path)
        if os.path.isabs(str(artifact_path))
        else Path(session_set_dir) / os.path.basename(str(artifact_path))
    )
    try:
        return resolved.read_text(encoding="utf-8")
    except OSError:
        return None


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
    # SS3 (anti-rollback): the LATEST ATTEMPT governs. If the newest
    # session-verification row is invalid (e.g. a truncated round whose artifact
    # never landed, or a tampered row), do NOT fall back to an older favorable
    # valid row -- return None so the backstop runs a fresh round rather than
    # settling on a superseded pass. (find_valid_stamped_rows appends the same
    # dicts in order, so identity against _all[-1] is exact.)
    if valid[-1] is not _all[-1]:
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
        # SS2 anti-laundering: derive the findings from the HASH-BOUND raw
        # artifact, NOT the editable sN-issues.json envelope. The artifact's
        # bytes were re-validated against artifact_sha256 when this row was
        # admitted to ``valid`` (validate_stamped_row), so a Major in the
        # artifact can never be laundered into a non-blocking close by
        # hand-editing the envelope's severity; editing the artifact itself
        # breaks its hash and drops the row from ``valid``. (In production the
        # envelope is DERIVED from this same artifact; here the artifact is the
        # single bound source of truth for severity.)
        artifact_text = _read_stamped_artifact_text(
            session_set_dir, authoritative.get("artifact_path")
        )
        if artifact_text is None:
            return None  # no readable bound artifact -> do not settle (blocking)
        _verdict, issues = parse_verification_response(artifact_text)
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
        session_number = int(match.group(1))
        envelope = _vs.issues_artifact_path(
            session_set_dir, session_number, int(match.group(2) or 1)
        )
        if envelope.exists():
            paths.append(str(envelope))
        # Set 116 S2 (the I-084-S2-9 sibling, L-069-1): a backstop round
        # now also appends to the round ledger, so that file is one of
        # the mid-close writes a rerun must keep tolerating.
        # `s*-rounds.jsonl` is NOT in
        # gate_checks._WORKING_TREE_IGNORE_PATTERNS, so without this the
        # rerun fails on working_tree_clean instead of on the gate that
        # actually failed -- exactly the bug I-084-S2-9 fixed for the
        # artifact and envelope beside it. Unlike the envelope this is
        # appended without an exists() check: the ledger is tolerance for
        # a path, and naming one that was never written costs nothing.
        paths.append(
            str(_vs.round_ledger_path(session_set_dir, session_number))
        )
    return paths


def _round_bound_remediation(
    session_set_dir: Path,
    session_number: int,
    status: "_vs.PhaseBoundStatus",
) -> str:
    """What the backstop wants when the round budget is spent.

    Set 116 S2. The refusal has to be actionable, and the two exits are
    the ones that ALREADY exist -- a set about removing ceremony does not
    get to invent a third flag. Which exit applies is a judgement about
    the findings, so the message states both and refuses to pick: at the
    bound, that choice is the operator's by the decision-rights hard
    carve-out, never the closing orchestrator's.
    """
    ledger = _vs.round_ledger_path(session_set_dir, session_number).name
    return (
        f"the close backstop refused to open {status.label} "
        f"{status.prior_rounds + 1} of a bounded {status.bound} for "
        f"session {session_number}. This close carries no settling "
        "verification evidence and the loop's budget is already spent, "
        "so the backstop STOPS here rather than buying another metered "
        "round (Set 116 S2: it previously ran rounds 5-12 unbounded, "
        "unauthorized, and absent from the ledger). Neither exit is the "
        "orchestrator's to take alone:\n"
        "  - Nothing material left (only Minor or unrated nits): the "
        "loop is effectively VERIFIED. Record the residual as "
        "adjudicated-minor in disposition.json and close on the "
        "operator-attested path: close_session --manual-verify "
        "\"<attestation naming the verifying surface, model, effective "
        "provider, template, timestamp and raw artifact>\".\n"
        "  - A material Critical/Major still standing or disputed: the "
        "operator adjudicates, or authorizes exactly one more round -- "
        "python -m ai_router.verify_session --session-set-dir "
        f"{session_set_dir} --operator-authorized-round \"<the "
        "operator's reason>\" -- which records the attestation in "
        f"{ledger} and produces the settling evidence this close wants. "
        "An adjudication settles the STOP, not the truth: a finding "
        "waived at the bound is an owed residual with a named owner."
    )


def decide_backstop(
    session_set_dir: str,
    session_number: Optional[int],
    disposition: Optional[Disposition],
) -> BackstopDecision:
    """Everything the backstop decides before it spends anything.

    Set 119 S2 extracted this from :func:`run_close_backstop`, which now
    calls it — see :class:`BackstopDecision` for why it is one sequence
    with two readers rather than two spellings of one sequence.

    **Pure reads, no routed call, no writes.** Every branch below consults
    on-disk state only: the disposition's method token, ``budget.yaml``,
    the session's orchestrator identity, the stamped metrics rows and
    their hash-bound artifacts, the round ledger, and ``git log`` for the
    diff base. Safe to call at any time, including mid-session from
    ``close_preflight``.

    The one pre-metered refusal NOT decided here is
    :class:`verify_session.EvidenceTooLargeError`, raised by the evidence
    assembly that follows: assembly is the routing *preparation*, not the
    decision, and it is the one expensive read in the sequence. A caller
    predicting the close therefore predicts every branch up to assembly.
    """
    set_dir = Path(session_set_dir)

    if disposition is None or session_number is None:
        # Nothing to police here: the missing-disposition refusal (and
        # the no-session shape) belongs to the invocation layer.
        return BackstopDecision(
            would_route=False,
            outcome=BackstopOutcome(
                status=STATUS_SKIPPED_VOCABULARY,
                messages=["backstop skipped: no disposition/session to close"],
            ),
        )

    # An illegal verification_method token dooms this close regardless of
    # evidence, so a metered verification first would be pure waste.
    #
    # Set 116 S3 re-derived this. The operator's ruling demoted the
    # vocabulary GATE to warn-not-block, which falsifies the reason this
    # early-out used to give ("the vocabulary gate refuses that close
    # anyway") — but not its conclusion. verification_method is what
    # selects a corroboration path, so a token with no path still cannot
    # reach a passing close: check_verification_integrity falls through
    # to the zero-budget arm and refuses there. And on a repo that HAS
    # declared the zero-budget tier, the very next check skips the
    # backstop too. Either way the round buys nothing, so the skip stays
    # and only its justification changed.
    vocab_ok, _ = check_verification_method_vocabulary(
        str(set_dir), disposition,
    )
    if not vocab_ok:
        return BackstopDecision(
            would_route=False,
            outcome=BackstopOutcome(
                status=STATUS_SKIPPED_VOCABULARY,
                messages=[
                    "backstop skipped: disposition.verification_method is "
                    "illegal, so no evidence this round could buy would let "
                    "the close pass. Fix the token. (A separate invocation, "
                    "close_session --manual-verify, does not reach this "
                    "backstop at all and would close with only an advisory "
                    "warning about the token -- that is a different, "
                    "attested path, not this one.)"
                ],
            ),
        )

    # The operator-declared zero-budget tier keeps its existing manual /
    # attested flow, untouched (spec-locked). Only threshold_usd == 0
    # counts; an absent or unreadable budget.yaml is the api default.
    budget, _err = _read_budget_yaml(_project_root_for(str(set_dir)))
    if budget is not None and budget.get("threshold_usd") == 0:
        return BackstopDecision(
            would_route=False,
            outcome=BackstopOutcome(
                status=STATUS_SKIPPED_ZERO_BUDGET,
                messages=[
                    "backstop skipped: ai_router/budget.yaml declares the "
                    "zero-budget tier (threshold_usd: 0); the manual/attested "
                    "flow governs this close"
                ],
            ),
        )

    # F1: resolve the orchestrator identity through the one shared path.
    # Unresolvable identity fails closed BEFORE any metered call.
    try:
        identity = _vs.resolve_orchestrator_exclusion(
            set_dir, session_number
        )
    except _vs.VerifySessionError as exc:
        return BackstopDecision(
            would_route=False,
            outcome=BackstopOutcome(
                status=STATUS_IDENTITY_UNRESOLVABLE,
                remediation=(
                    f"{exc} Re-run start_session with --model, then close "
                    "again."
                ),
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
        return BackstopDecision(
            would_route=False,
            outcome=BackstopOutcome(
                status=STATUS_SKIPPED_EVIDENCE_PRESENT,
                written_paths=_settling_bookkeeping_paths(
                    set_dir, settling_row
                ),
            ),
        )

    # --- Set 116 S2: ONE round budget, every route.
    #
    # verify_session evaluates the bounded totals BEFORE its metered call
    # and refuses past them (Set 111 S1). The backstop resolved a round
    # and routed with no bound at all -- which is how router metrics show
    # backstop rounds 5-10 (Set 111 S2), 5-12 (Set 112 S3) and 5-7 (Set
    # 114 S1): none authorized, none in the ledger, none visible to the
    # arithmetic that was supposed to be enforcing a cap of 2.
    #
    # Same function, same arithmetic, same numbers -- no second budget is
    # invented here. A backstop round carries no --phase, so it is a
    # CLASSIC round: it is bounded by PHASE_BOUND_CLASSIC and counted
    # against every findings-bearing round the session has run, exactly
    # as a classic verify_session round would be. That is the unification;
    # a separate backstop allowance would just be the same hole with a
    # number written next to it.
    #
    # Note the ordering: this sits AFTER the settling-evidence skip, so a
    # session that verified clean still closes no matter how many rounds
    # it took to get there. The budget only bites when the close has no
    # settling evidence AND the loop is already spent -- which is the
    # state that should stop for a human, not buy round 11.
    round_number = _vs.resolve_round(set_dir, session_number, None)
    bound_status = _vs.evaluate_phase_bound(
        set_dir, session_number, round_number, None
    )
    if bound_status.exceeds:
        return BackstopDecision(
            would_route=False,
            outcome=BackstopOutcome(
                status=STATUS_ROUND_BOUND_REACHED,
                remediation=_round_bound_remediation(
                    set_dir, session_number, bound_status
                ),
            ),
        )

    diff_base = resolve_backstop_diff_base(set_dir, session_number)
    if diff_base is None:
        try:
            from .gate_checks import _verify_session_command
        except ImportError:
            from gate_checks import _verify_session_command  # type: ignore[no-redef]
        return BackstopDecision(
            would_route=False,
            outcome=BackstopOutcome(
                status=STATUS_ROUTE_FAILED,
                remediation=(
                    "the backstop cannot determine the session's evidence "
                    "base (no recorded startedAt, or the repo is "
                    "unresolvable) and refuses to verify a degraded bundle "
                    "(fails closed — I-084-S2-6). Run the sanctioned Step 6 "
                    "command with an explicit --diff-base instead: "
                    f"{_verify_session_command(str(set_dir))}"
                ),
            ),
        )

    return BackstopDecision(
        would_route=True,
        identity=identity,
        round_number=round_number,
        diff_base=diff_base,
    )


def run_close_backstop(
    session_set_dir: str,
    session_number: Optional[int],
    disposition: Optional[Disposition],
    *,
    route_fn: Optional[Callable] = None,
    complexity_hint: int = _DEFAULT_COMPLEXITY_HINT,
) -> BackstopOutcome:
    """Run the Set 084 close backstop for one close attempt.

    The caller (``close_session.run``) has already excluded the
    ``--force`` / ``--manual-verify`` / ``--no-router`` paths and holds the
    close lock. This function decides skip-vs-run, performs the
    verification when owed, writes the artifacts + stamped row + the
    disposition patch, and reports what happened; the caller maps the
    outcome onto the close (proceed / ``gate_failed``).

    The skip-vs-run decision itself lives in :func:`decide_backstop`
    (Set 119 S2), so ``close_preflight`` can ask the same question
    without spending the round that answering it used to cost.
    """
    set_dir = Path(session_set_dir)

    decision = decide_backstop(session_set_dir, session_number, disposition)
    if not decision.would_route:
        # decide_backstop always pairs would_route=False with an outcome;
        # the fallback keeps a future edit from returning None here.
        return decision.outcome or BackstopOutcome(
            status=STATUS_ROUTE_FAILED,
            remediation="the backstop reached no decision",
        )

    # Narrow for the type checker: a routing decision carries all three.
    assert session_number is not None and disposition is not None
    identity = decision.identity
    round_number = decision.round_number
    diff_base = decision.diff_base

    # --- The backstop runs. Same machinery as verify_session, end to
    # --- end: evidence -> template -> exclusion -> stamped row ->
    # --- raw artifacts -> disposition patch.
    exclude_providers = [identity.effective_provider]
    try:
        repo_root = _vs.repo_root_for(set_dir)
    except _vs.VerifySessionError:
        repo_root = set_dir
    # Set 119 S3: snapshot the tree BEFORE anything is written, so the
    # ledger row below records the state this round actually reviewed and
    # `--phase remediation-review` is reachable afterwards. Until now a
    # backstop round left no baseline at all -- it is unphased, and only
    # findings-bearing discovery-family rounds wrote one into an envelope
    # -- so the remediation loop this run's own blocking message names
    # refused with EXIT_USAGE, and the orchestrator had to buy a full
    # discovery round to get back in. Fails OPEN like verify_session's:
    # the round is still sound evidence without it.
    baseline_tree = _vs.snapshot_worktree_tree(repo_root)
    try:
        evidence = _vs.assemble_evidence(
            set_dir, session_number, diff_base,
            list(_vs.DEFAULT_DIFF_EXCLUDES),
        )
    except _vs.EvidenceTooLargeError as exc:
        # Set 112 S2: assemble_evidence raises this (deliberately NOT a
        # VerifySessionError -- the CLI maps it to its own
        # verification-unavailable exit code), so the handler below did not
        # catch it and close_session died with a raw traceback instead of a
        # gate outcome. A session large enough to overrun the cap is exactly
        # when an operator most needs the actionable message, and a traceback
        # on the close path reads as a tool failure rather than a refusal.
        #
        # Fail CLOSED, loudly, and name the way out: the backstop assembles
        # with the DEFAULT excludes only, so the fix is to run the sanctioned
        # Step 6 command directly, where --exclude and --diff-base are
        # available to shrink a bundle honestly.
        try:
            from .gate_checks import _verify_session_command
        except ImportError:
            from gate_checks import _verify_session_command  # type: ignore[no-redef]
        return BackstopOutcome(
            status=STATUS_UNAVAILABLE,
            remediation=(
                f"the backstop cannot verify this close: {exc}. It assembles "
                "with the default excludes only and refuses to route a bundle "
                "the verifier would silently truncate (fails closed). Run the "
                "sanctioned Step 6 command yourself, where --exclude "
                "<pathspec> (drop generated trees) and --diff-base <ref> are "
                "available to shrink the evidence honestly, then close again: "
                f"{_verify_session_command(str(set_dir))}"
            ),
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

    # Set 116 S2: the ledger is the true count, so every round goes in it
    # -- including this one. Written BEFORE the disposition patch (the
    # same ordering verify_session uses) so the bounded-totals input
    # exists even if a later step fails, and marked with its source so
    # the audit trail says WHO ran the round rather than leaving the
    # backstop's rounds to be reconstructed from router metrics.
    #
    # `ended_loop` follows the same rule as everywhere else: a clean
    # round settles the close and consumes no budget; a blocking one
    # sends the session back to remediation and does. There is no
    # supplementary-blockers case to consider here -- the backstop runs
    # unphased, and it never reaches this point when settling evidence
    # already exists.
    ledger_path = _vs.round_ledger_path(set_dir, session_number)
    _vs.record_round_completed(
        ledger_path,
        session_number=session_number,
        round_number=round_number,
        phase=None,
        verdict=verdict,
        blocking=classification.blocking,
        ended_loop=not classification.blocking,
        source=_vs.ROUND_SOURCE_CLOSE_BACKSTOP,
        discovery_baseline_tree=baseline_tree,
    )
    written.append(str(ledger_path))

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
        # Set 119 S3: name the phase, and name it only because it now
        # works. The old text said "re-verify with verify_session (the
        # sanctioned remediation loop)" while --phase remediation-review
        # refused with EXIT_USAGE from this exact state -- no prior round
        # had recorded a discoveryBaselineTree, because this round is
        # unphased and only findings-bearing discovery-family rounds
        # wrote one. The ledger row above now carries the baseline, so
        # the named command runs; test_close_backstop asserts it succeeds
        # from the state this message is printed in.
        try:
            from .gate_checks import _verify_session_command
        except ImportError:
            from gate_checks import _verify_session_command  # type: ignore[no-redef]
        next_command = _verify_session_command(
            str(set_dir), phase=_vs.PHASE_REMEDIATION_REVIEW
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
                f"{findings}. Remediate the blockers once, then review the "
                f"fix delta: {next_command} -- this round recorded the "
                "baseline it diffs from, so the phase is reachable without "
                "buying a fresh discovery round. Then close again."
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
