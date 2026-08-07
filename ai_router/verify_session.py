"""Set 083 S1 -- the ``verify_session`` CLI: Step 6 as a first-class command.

A live incident (2026-07-06) showed the affordance gap at Step 6
(end-of-session cross-provider verification): it was the ONLY lifecycle
boundary step with no CLI. Every orchestrator had to hand-compose a
``route()`` call, an evidence bundle, the artifact writes, and a verdict
parse -- so evidence quality varied by which engine ran the session, and
one orchestrator bypassed the step entirely by writing a self-attested
verdict into ``disposition.json``. This module is the **affordance** half
of the Set 083 fix (Session 2 ships the **enforcement** half: the
verification-integrity close gate).

One command performs Step 6 the way every other boundary step already
works (``start_session``, ``routed_gate``, ``close_session``,
``pull_critique``)::

    python -m ai_router.verify_session --session-set-dir <set> \
        [--phase discovery|supplementary|remediation-review] \
        [--diff-base <ref>] [--round N] [--max-tier T] [--dry-run] \
        [--wording-only] [--exclude <pathspec> ...] [--no-default-excludes] \
        [--conventions-file <path>] [--operator-authorized-round <reason>]

What it does, in order:

1. Resolves the in-progress session number from ``session-state.json``
   (the same reader path every other lifecycle CLI uses).
2. Assembles the evidence bundle deterministically: the session's spec
   excerpt, ``git status --short`` (untracked deliverables stay visible
   -- L-064-9), and the complete unfiltered diff of the working tree vs
   ``--diff-base`` (default ``HEAD``), with generated-bundle exclusions
   (``dist/`` etc.) on by default and overridable.
3. Auto-assembles the cross-round issue ledger (Set 096) from prior
   rounds' ``sN-issues*.json`` and the orchestrator's
   ``sN-remediation-round-<R>.md`` sidecars — settled vs unresolved
   split by SETTLEMENT EVIDENCE, fail-closed — then fills
   ``ai_router/prompt-templates/verification.md`` (which carries the
   consequence-graded severity rubric and the structured verdict schema)
   and routes ``task_type="session-verification"``. The hand-carried
   ledger file is retired for the no-resurrection function;
   ``--conventions-file`` remains for the suite baseline / release
   contract / by-design scope. Set 084 (F2): the CLI resolves
   the session orchestrator's EFFECTIVE provider (registry lookup on
   the orchestrator block's model, via ``orchestrator_identity``) and
   passes it as a hard ``exclude_providers`` constraint -- the verifier
   can never be the orchestrator's own provider; the config's
   ``session-verification`` pin is only a preference below that
   constraint. The CLI still never picks a concrete verifier model.
4. Writes ``sN-verification.md`` / ``sN-verification-round-<R>.md`` RAW,
   before any display (L-064-3), and ``sN-issues[-round-<R>].json`` when
   the round bears findings (Set 055 envelope).
5. Classifies blocking-ness through ``is_blocking_verdict`` /
   ``classify_blocking`` (L-071-1) -- a Minor-only round never opens a
   remediation loop.
6. Patches ``disposition.json`` (``verification_method: "api"``, the
   verdict token verbatim) preserving every unrelated field, and prints
   the verdict, the blocking classification, and the exact next action.

**The phased loop (Set 096 S2).** ``--phase`` selects one of three
framings; **omitted, the classic single-call behavior is unchanged**
(compat). The phase framing rides in the Original Task slot — the
canonical template file stays byte-identical, so the Set 084 F3
template pin holds on every phase:

- ``discovery`` — INITIAL_DISCOVERY: exhaustive-enumeration framing at
  ALL severities, fanned out K ways over the SAME evidence bundle
  (``verification.discovery.fan_out``, default 2 — sized by the Set 096
  S1 experiment: same-model pairwise overlap measured Jaccard 0.13–0.31,
  so K=2 harvests ~81% of the observable finding pool vs ~50% for one
  call). Set 111 S1: the K calls no longer send IDENTICAL prompts — each
  carries a different discovery LENS (``spec-conformance`` reads the
  spec toward the diff; ``failure-scenario`` reads the code toward the
  ways it breaks), cycled by call index. Same K, same cost, same
  envelope merge; only the framing differs, so the fast path and the
  cost-scaling incentive are untouched. Call 1 writes the canonical
  round artifact; call k writes the ``-fanout-<k>`` sibling; the parsed
  finding sets merge into ONE round envelope (per-issue
  ``discoveryCall`` + ``discoveryLens``). The round also records a
  ``discoveryBaselineTree`` working-tree snapshot for the later
  fix-delta review.
- ``supplementary`` — SUPPLEMENTARY_DISCOVERY: runs BEFORE any
  remediation, when discovery found Critical/Major. A completeness-critic
  framing over the SAME evidence, fed the prior rounds' findings with a
  do-not-re-report instruction (decorrelation by prompt — the measured
  S1 default). With ``verification.discovery.provider_diversity:
  cross-provider``, the round-1 verifier's provider is ALSO excluded as
  a preference: when that leaves no eligible verifier the call degrades
  LOUDLY to the base orchestrator-only exclusion instead of failing.
- ``remediation-review`` — after remediating: the evidence is the FIX
  DELTA ONLY (a tree-to-tree diff from the recorded discovery baseline
  to a fresh working-tree snapshot — tree-to-tree so files added during
  remediation appear with full content instead of reading as deleted)
  plus the auto-assembled ledger. The verifier returns per-finding
  ``fix-accepted / fix-rejected / accepted-with-modification`` verdicts
  (parsed tolerantly into the envelope's ``fixVerdicts``); new defects
  are admissible ONLY within the fix hunks; Minors are recorded, never
  re-rounded.

``--max-tier`` exists for wording-only re-verifies (L-064-7). The pin is
directional: it is only ever a ceiling, and on a substantive re-verify it
must never sit below the round-1 verifier's tier -- so the CLI REFUSES a
``--round >= 2`` call whose ``--max-tier`` is below the round-1
verifier's tier unless ``--wording-only`` is passed (the L-064-7
symmetric failure, encoded).

**The bounds are ENFORCED, not printed (Set 111 S1).** The loop's
documented totals -- at most 2 discovery-family passes (``discovery`` +
``supplementary``), at most 2 ``remediation-review`` cycles, at most 2
classic no-``--phase`` rounds -- used to feed an advisory "Next action"
message only, and were exceeded in practice (one session ran 13 calls
over 379 minutes AFTER the cap shipped). The CLI now REFUSES the round
that would pass a bound, before any metered call, unless
``--operator-authorized-round "<reason>"`` carries the operator's
attestation. That authorization is appended to the per-session round
ledger ``sN-rounds.jsonl`` (append-only, mirroring
``close_session --manual-verify``: the flag alone is never enough --
an authorization with nothing to say is not an audit trail). The same
ledger records every COMPLETED round's phase, verdict and ``endedLoop``,
which is what the bound counts (unioned by round number with the findings
envelopes, for sessions that predate it): a clean round that settles the
session consumes nothing, but a clean ``supplementary`` round whose prior
discovery blockers still stand IS the second discovery pass and writes no
envelope to be counted from.

Exit codes:

- ``0``  -- verification ran; result is non-blocking (VERIFIED or
  Minor-only). Also the ``--dry-run`` exit.
- ``2``  -- usage error (bad args, tier-pin refusal, artifact collision).
- ``3``  -- state error (set dir not found, no session in flight).
- ``4``  -- verification ran; result is BLOCKING (>=1 Critical/Major or
  unknown-severity finding). Artifacts are written; remediate and re-run.
  Also returned by a CLEAN ``--phase supplementary`` round while prior
  discovery blockers stand unremediated: the round is clean but the
  SESSION is not (disposition is patched ``ISSUES_FOUND``).
- ``6``  -- the routed call itself failed (provider/transport error).
- ``7``  -- verification UNAVAILABLE (Set 084 F2): the orchestrator's
  effective-provider exclusion left no eligible verifier. No verdict
  written; close stays blocked; operator-attested manual path only.

Output is ASCII-only (the cp1252 console convention); artifacts are
written ``encoding="utf-8"``.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Callable, List, Optional, Sequence

try:
    from progress import (  # type: ignore[import-not-found]
        SessionStateInvariantError,
        read_progress,
    )
    from session_state import read_session_state  # type: ignore[import-not-found]
    from resolve_set import (  # type: ignore[import-not-found]
        SetResolutionError,
        resolve_session_set_dir,
    )
    from verification import (  # type: ignore[import-not-found]
        build_verification_prompt,
        classify_blocking,
        is_blocking_issue,
        parse_fix_verdicts,
        parse_verification_response,
    )
except ImportError:
    from .progress import (  # type: ignore[no-redef]
        SessionStateInvariantError,
        read_progress,
    )
    from .session_state import read_session_state  # type: ignore[no-redef]
    from .resolve_set import (  # type: ignore[no-redef]
        SetResolutionError,
        resolve_session_set_dir,
    )
    from .verification import (  # type: ignore[no-redef]
        build_verification_prompt,
        classify_blocking,
        is_blocking_issue,
        parse_fix_verdicts,
        parse_verification_response,
    )


EXIT_OK = 0
EXIT_USAGE = 2
EXIT_STATE = 3
EXIT_BLOCKING = 4
EXIT_ROUTE_FAILED = 6
# Set 084 (F2): the hard verification_unavailable outcome — dynamic
# exclusion left no eligible different-provider verifier. No verdict is
# written; the close stays blocked; the only sanctioned resolution is
# the operator-attested manual path (close_session --manual-verify).
EXIT_VERIFICATION_UNAVAILABLE = 7

SESSION_VERIFICATION_TASK_TYPE = "session-verification"
DEFAULT_COMPLEXITY_HINT = 70

# ---------------------------------------------------------------------------
# The phased verification loop (Set 096 S2). ``--phase`` omitted = the
# classic single-call behavior, unchanged (compat).
# ---------------------------------------------------------------------------

PHASE_DISCOVERY = "discovery"
PHASE_SUPPLEMENTARY = "supplementary"
PHASE_REMEDIATION_REVIEW = "remediation-review"
PHASE_CHOICES = (PHASE_DISCOVERY, PHASE_SUPPLEMENTARY, PHASE_REMEDIATION_REVIEW)

# --- Set 111 S1: the bounded totals, ENFORCED -------------------------------
# The two discovery-family passes are `discovery` (pass 1) and
# `supplementary` (pass 2) -- the constitution's "at most 2 discovery
# passes". `remediation-review` gets its own 2-cycle budget, and the
# classic no-`--phase` path its documented "2 automatic rounds". Only
# FINDINGS-BEARING rounds count (a clean round ends the loop on its own),
# which is exactly what `count_phase_family_rounds` sees: envelopes.
DISCOVERY_FAMILY_PHASES = (PHASE_DISCOVERY, PHASE_SUPPLEMENTARY)
PHASE_BOUND_DISCOVERY = 2
PHASE_BOUND_REMEDIATION_REVIEW = 2
PHASE_BOUND_CLASSIC = 2

# The two record kinds in the per-session round ledger (sN-rounds.jsonl):
# the operator's pre-call authorization for a past-the-bound round, and
# the post-call record of a completed round (the bounded-totals input).
ROUND_EVENT_AUTHORIZATION = "operator-authorization"
ROUND_EVENT_COMPLETED = "round-completed"

# --- Set 111 S1: discovery LENSES -------------------------------------------
# The K=2 fan-out is already paid for; sending the SAME prompt twice buys
# only the model's own sampling variance. The residue of the (dead)
# parallel-lens proposal is to vary the FRAMING inside the existing
# fan-out: same K, same cost, same loop position, same envelope merge.
# Cycled by call index, so K=1 gets lens 1 and K=3 wraps to lens 1 again.
DISCOVERY_LENS_SPEC_CONFORMANCE = "spec-conformance"
DISCOVERY_LENS_FAILURE_SCENARIO = "failure-scenario"
DISCOVERY_LENSES = (
    DISCOVERY_LENS_SPEC_CONFORMANCE,
    DISCOVERY_LENS_FAILURE_SCENARIO,
)

# Phased rounds default to the raised complexity hint the workflow already
# prescribes for post-Critical/Major re-verifies: discovery asks for an
# exhaustive enumeration (a larger answer than a verdict-only review), and
# supplementary / remediation-review are by definition downstream of C/M
# findings. An explicit --complexity-hint always wins.
PHASE_COMPLEXITY_HINT = 85

# S1 experiment defaults (s1-fanout-experiment.md): K=2 same-model discovery
# calls harvest ~81% (mean) of the observable finding pool at ~$0.50; the
# third call added one finding and the cross-provider call added zero, so
# provider diversity is a *preference knob* for the supplementary pass, not
# a hard rule. router-config.yaml ``verification.discovery`` overrides.
DISCOVERY_FAN_OUT_DEFAULT = 2
PROVIDER_DIVERSITY_SAME_MODEL = "same-model"
PROVIDER_DIVERSITY_CROSS_PROVIDER = "cross-provider"
PROVIDER_DIVERSITY_DEFAULT = PROVIDER_DIVERSITY_SAME_MODEL
# The discovery output-budget FLOOR (spec: "raised output budget"). Every
# routed call already runs at its model's CONFIGURED max_output_tokens —
# the per-model ceiling is provider-limit-bound and only the operator can
# raise it — so the implementable half is visibility: warn LOUDLY when a
# discovery call is answered by a model whose configured ceiling sits
# below this floor (exhaustive enumeration needs headroom; a truncated
# response is already a fail-closed invalid round, never silent loss).
DISCOVERY_MIN_OUTPUT_TOKENS_DEFAULT = 32000
# Backstop against a runaway config value: each call is a metered routed
# review, and the measured yield curve flattened hard by K=3 (7 -> +8 -> +1).
_DISCOVERY_FAN_OUT_CAP = 4


def load_discovery_phase_config(
    config: Optional[dict] = None,
) -> "tuple[int, str]":
    """``(fan_out, provider_diversity)`` from ``router-config.yaml``'s
    ``verification.discovery`` block, defaulting to the S1-measured values.

    Fail-open by design: an unreadable config or a malformed value falls
    back to the defaults — phase selection must never die on a config nit
    (the values only size the harvest; the cross-provider exclusion and the
    stamp are enforced elsewhere and fail closed there). ``fan_out`` is
    clamped to [1, ``_DISCOVERY_FAN_OUT_CAP``]. *config* defaults to the
    loaded ``router-config.yaml``; tests pass an explicit dict.
    """
    fan_out = DISCOVERY_FAN_OUT_DEFAULT
    diversity = PROVIDER_DIVERSITY_DEFAULT
    try:
        if config is None:
            try:
                from config import load_config  # type: ignore[import-not-found]
            except ImportError:
                from .config import load_config  # type: ignore[no-redef]
            config = load_config()
        block = (
            (config.get("verification") or {}).get("discovery") or {}
        )
        raw_k = block.get("fan_out")
        if (
            isinstance(raw_k, int)
            and not isinstance(raw_k, bool)
            and raw_k >= 1
        ):
            fan_out = min(raw_k, _DISCOVERY_FAN_OUT_CAP)
        raw_d = str(block.get("provider_diversity") or "").strip().lower()
        if raw_d in (
            PROVIDER_DIVERSITY_SAME_MODEL,
            PROVIDER_DIVERSITY_CROSS_PROVIDER,
        ):
            diversity = raw_d
    except Exception:
        pass
    return fan_out, diversity


def load_discovery_model(config: Optional[dict] = None) -> Optional[str]:
    """The registry alias the discovery fan-out prefers, or ``None``.

    ``verification.discovery.model`` (Set 109 S4). Discovery runs K calls with
    IDENTICAL prompts and is bought for BREADTH of findings — a second
    independent read is worth more there than a marginally better single one,
    and everything it raises is adjudicated downstream by the pinned verifier.
    So it is the one verification surface where the cheap variant is the right
    tool rather than a saving: ``gpt-5.6-luna`` bills $0.20/$1.20 against
    ``-sol``'s $5.00/$30.00.

    Fail-open to ``None`` exactly like its siblings above, and ``None`` means
    "use the ``session-verification`` pin" — the pre-Set-109 behaviour. The
    value is only ever a PREFERENCE: ``pick_model`` drops it when the alias is
    unknown, disabled, above ``max_tier``, or from an excluded provider, so a
    typo here degrades to the pinned verifier rather than to no verification.
    """
    try:
        if config is None:
            try:
                from config import load_config  # type: ignore[import-not-found]
            except ImportError:
                from .config import load_config  # type: ignore[no-redef]
            config = load_config()
        raw = (
            (config.get("verification") or {}).get("discovery") or {}
        ).get("model")
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
    except Exception:
        pass
    return None


def load_discovery_min_output_tokens(config: Optional[dict] = None) -> int:
    """The discovery output-budget floor from
    ``verification.discovery.min_output_tokens`` (fail-open to the
    default, like :func:`load_discovery_phase_config`)."""
    floor = DISCOVERY_MIN_OUTPUT_TOKENS_DEFAULT
    try:
        if config is None:
            try:
                from config import load_config  # type: ignore[import-not-found]
            except ImportError:
                from .config import load_config  # type: ignore[no-redef]
            config = load_config()
        raw = (
            (config.get("verification") or {}).get("discovery") or {}
        ).get("min_output_tokens")
        if isinstance(raw, int) and not isinstance(raw, bool) and raw > 0:
            floor = raw
    except Exception:
        pass
    return floor


def _model_output_cap(model_name: str) -> Optional[int]:
    """The CONFIGURED ``max_output_tokens`` for *model_name*, or ``None``
    when unresolvable (fail open — the floor check cannot warn on
    evidence it does not have)."""
    try:
        try:
            from config import load_config  # type: ignore[import-not-found]
        except ImportError:
            from .config import load_config  # type: ignore[no-redef]
        cfg = (load_config().get("models") or {}).get(str(model_name)) or {}
        cap = cfg.get("max_output_tokens")
        if isinstance(cap, int) and not isinstance(cap, bool) and cap > 0:
            return cap
    except Exception:
        pass
    return None

# Generated-bundle exclusions applied to the evidence diff by default.
# These are build outputs / vendored trees whose churn drowns the real
# change set; every one is overridable (--exclude adds more,
# --no-default-excludes drops these). git pathspec :(exclude) form.
DEFAULT_DIFF_EXCLUDES = (
    "dist",
    "out",
    "node_modules",
    ".venv",
    "__pycache__",
    "*.vsix",
)

# Framework state/ledger bookkeeping written by blessed writers or read-triggered
# lazy-synth (Set 105). An all-sets status scan / Work Explorer refresh calls
# ``read_status`` -> ``ensure_session_state_file`` for every spec folder lacking a
# state file (the Set 7 "every spec folder carries a session-state.json"
# invariant), materializing UNTRACKED ``not-started`` state files out of band.
# When the untracked collector inlines their content as "deliverables", the
# cross-provider verifier -- correctly applying the "blessed writers only, never
# hand-author session-state.json" discipline -- flags them as violations. They
# are machine-written, so the finding is a false positive that never clears
# (the files re-synth between rounds). Classified by BASENAME so the fix covers
# the set-under-review's own in-progress state file AND sibling sets' not-started
# files uniformly; both are blessed-writer output that needs no cross-provider
# review. Deliberately NOT a ``DEFAULT_DIFF_EXCLUDES`` entry: a blanket pathspec
# exclude would also drop TRACKED changes to these files from the diff, blinding
# the verifier to legitimate state-machinery work (schema/meta sets, committed
# fixtures). This reclassifies ONLY the untracked-content inlining; the tracked
# diff is left untouched.
FRAMEWORK_BOOKKEEPING_FILES = frozenset(
    {
        "session-state.json",
        "session-events.jsonl",
        "activity-log.json",
    }
)


class VerifySessionError(Exception):
    """Raised for deterministic pre-route failures (usage / state)."""


class EvidenceTooLargeError(Exception):
    """Raised by ``assemble_evidence`` when the assembled evidence exceeds the
    oversized-input cap (Set 089). Distinct from :class:`VerifySessionError` so
    the CLI maps it to ``EXIT_VERIFICATION_UNAVAILABLE`` (fail-closed evidence),
    not ``EXIT_USAGE``. Raising it at assembly time -- not only in the CLI --
    means EVERY caller of ``assemble_evidence`` fails closed rather than routing
    a diff the verifier would silently truncate."""

    def __init__(self, assembled_chars: int, cap: int) -> None:
        self.assembled_chars = assembled_chars
        self.cap = cap
        super().__init__(
            f"assembled evidence is {assembled_chars} chars, over the "
            f"{cap}-char cap"
        )


# ---------------------------------------------------------------------------
# Session / round resolution
# ---------------------------------------------------------------------------

def resolve_in_progress_session(session_set_dir: Path) -> int:
    """Return the in-flight session number for *session_set_dir*.

    Reads ``session-state.json`` through the canonical reader path
    (``read_progress`` -- the same normalize shim every lifecycle CLI
    uses). Raises :class:`VerifySessionError` when no session is in
    flight: Step 6 verifies an open session's work, so a between-sessions
    or not-started set has nothing to verify.
    """
    state = read_session_state(str(session_set_dir)) or {}
    if not state:
        raise VerifySessionError(
            f"no session-state.json in {session_set_dir} -- run "
            "start_session first (Step 1) so the session is in flight."
        )
    spec_md_path = session_set_dir / "spec.md"
    try:
        view = read_progress(state, spec_md_path)
    except (SessionStateInvariantError, TypeError, ValueError) as exc:
        raise VerifySessionError(
            f"could not read session progress for {session_set_dir}: {exc}"
        ) from exc
    if view.current_session is None:
        raise VerifySessionError(
            "no session is in flight for this set (between sessions or "
            "not started). verify_session verifies the in-progress "
            "session's work; run start_session first."
        )
    return int(view.current_session)


def verification_artifact_path(
    session_set_dir: Path, session_number: int, round_number: int
) -> Path:
    """The round's raw verifier-output artifact path (never edited)."""
    if round_number <= 1:
        return session_set_dir / f"s{session_number}-verification.md"
    return session_set_dir / (
        f"s{session_number}-verification-round-{round_number}.md"
    )


def issues_artifact_path(
    session_set_dir: Path, session_number: int, round_number: int
) -> Path:
    """The round's structured-findings artifact path (Set 055 naming)."""
    if round_number <= 1:
        return session_set_dir / f"s{session_number}-issues.json"
    return session_set_dir / (
        f"s{session_number}-issues-round-{round_number}.json"
    )


def fanout_artifact_path(
    session_set_dir: Path,
    session_number: int,
    round_number: int,
    call_index: int,
) -> Path:
    """The raw artifact path for discovery fan-out call *call_index* (>= 2).

    Call 1 always owns the canonical round artifact; later calls write
    ``-fanout-<k>`` siblings (``s2-verification-fanout-2.md``,
    ``s2-verification-round-2-fanout-2.md``). The name keeps the
    ``s<N>-verification*.md`` shape the Set 084 F3 stamp validator binds
    to, and stays outside :func:`verification_artifact_path`'s round
    naming so :func:`resolve_round`'s scan is unaffected.
    """
    base = verification_artifact_path(
        session_set_dir, session_number, round_number
    )
    return base.with_name(f"{base.stem}-fanout-{call_index}.md")


def resolve_round(
    session_set_dir: Path,
    session_number: int,
    explicit_round: Optional[int],
) -> int:
    """Return the effective verification round number.

    When ``--round`` is explicit, the round's artifact must not already
    exist (verification artifacts are never overwritten or edited --
    workflow convention). When omitted, the next free round is inferred
    from the artifacts on disk: 1 if ``sN-verification.md`` is absent,
    else the first round whose artifact is missing.
    """
    if explicit_round is not None:
        if explicit_round < 1:
            raise VerifySessionError(
                f"--round must be >= 1 (got {explicit_round})"
            )
        existing = verification_artifact_path(
            session_set_dir, session_number, explicit_round
        )
        if existing.exists():
            raise VerifySessionError(
                f"round {explicit_round} artifact already exists at "
                f"{existing.name}; verification artifacts are never "
                "overwritten. Omit --round to auto-select the next round."
            )
        return explicit_round

    round_number = 1
    while verification_artifact_path(
        session_set_dir, session_number, round_number
    ).exists():
        round_number += 1
    return round_number


# ---------------------------------------------------------------------------
# The L-064-7 tier-pin guard
# ---------------------------------------------------------------------------

def _round1_verification_row(
    metrics_path: Path,
    session_set_name: str,
    session_number: int,
) -> Optional[dict]:
    """The ROUND-1 session-verification metrics row for (set, session),
    or ``None``.

    Metrics rows append chronologically and do not carry a round number,
    so round 1 IS the first matching session-verification row --
    unconditionally. Shared by the tier-pin guard and the supplementary
    phase's provider-diversity preference; both fail OPEN on a missing
    answer (neither can act on evidence it does not have).
    """
    try:
        raw_lines = metrics_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    for line in raw_lines:
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(row, dict):
            continue
        if row.get("task_type") != SESSION_VERIFICATION_TASK_TYPE:
            continue
        if row.get("session_number") != session_number:
            continue
        row_set = str(row.get("session_set") or "")
        # Metrics rows are slug-keyed at the write boundary, but older
        # rows carry path shapes; match on the trailing slug component.
        row_slug = row_set.replace("\\", "/").rstrip("/").rsplit("/", 1)[-1]
        if os.path.normcase(row_slug) != os.path.normcase(session_set_name):
            continue
        return row
    return None


def round1_verifier_tier(
    metrics_path: Path,
    session_set_name: str,
    session_number: int,
) -> Optional[int]:
    """The tier of the ROUND-1 session-verification row for this
    (set, session) in ``router-metrics.jsonl``, or ``None`` when no row
    (or no readable tier) is found.

    The first matching row is round 1, unconditionally. Its tier is
    returned when readable; an unreadable tier on that row returns
    ``None`` (fail open) rather than falling through to a later row,
    because a later row is a later ROUND and comparing the pin against
    it is exactly the drift L-064-7's guard exists to refuse (a round-2
    call at a lower tier must not lower the floor for round 3).

    Used only by the tier-pin guard below; a missing answer fails OPEN
    (the guard cannot refuse on evidence it does not have -- the refusal
    exists to stop an *encoded* mistake, not to invent one).
    """
    row = _round1_verification_row(
        metrics_path, session_set_name, session_number
    )
    if row is None:
        return None
    row_tier = row.get("tier")
    if isinstance(row_tier, int) and not isinstance(row_tier, bool):
        return row_tier
    return None


def round1_verifier_model(
    metrics_path: Path,
    session_set_name: str,
    session_number: int,
) -> Optional[str]:
    """The model name of the ROUND-1 session-verification row, or ``None``.

    Used by the supplementary phase's ``cross-provider`` preference to
    resolve which provider the discovery pass verified with (via the
    registry), so the supplementary call can *prefer* a third family.
    Fails open: no row / unreadable model -> ``None`` -> the preference
    silently degrades to the base orchestrator-only exclusion.
    """
    row = _round1_verification_row(
        metrics_path, session_set_name, session_number
    )
    if row is None:
        return None
    model = row.get("model")
    if isinstance(model, str) and model.strip():
        return model.strip()
    return None


def check_tier_pin(
    round_number: int,
    max_tier: Optional[int],
    round1_tier: Optional[int],
    wording_only: bool,
) -> Optional[str]:
    """Return the refusal message when the ``--max-tier`` pin is illegal.

    Encodes L-064-7 and its symmetric failure: the pin is a ceiling for
    *wording-only* re-verifies. A substantive re-verify (``--round >= 2``
    without ``--wording-only``) must stay on (or above) the round-1
    verifier's tier, so a ``--max-tier`` below that tier is refused.
    Returns ``None`` when the call is legal (including when the round-1
    tier is unknown -- the guard fails open on missing evidence).
    """
    if max_tier is None or round_number < 2 or wording_only:
        return None
    if round1_tier is None:
        return None
    if max_tier < round1_tier:
        return (
            f"--max-tier {max_tier} is below the round-1 verifier's tier "
            f"({round1_tier}) on a substantive re-verify (--round "
            f"{round_number}). A substantive re-verify must stay on or "
            "above the round-1 verifier's tier -- dropping the tier can "
            "silently break the cross-provider guarantee (L-064-7 "
            "symmetric failure). Pass --wording-only if this re-verify "
            "only fixes verdict wording, or raise/omit --max-tier."
        )
    return None


# ---------------------------------------------------------------------------
# Evidence assembly
# ---------------------------------------------------------------------------

def extract_spec_excerpt(spec_text: str, session_number: int) -> str:
    """Return the ``### Session N of M`` section of *spec_text*.

    Falls back to the whole spec when the heading is not found (a spec
    without per-session headings is unusual but must not silently
    produce an empty task statement).
    """
    pattern = re.compile(r"(?m)^###\s+Session\s+(\d+)\s+of\s+\d+\b")
    matches = list(pattern.finditer(spec_text))
    for i, m in enumerate(matches):
        if int(m.group(1)) == session_number:
            start = m.start()
            end = (
                matches[i + 1].start()
                if i + 1 < len(matches)
                else len(spec_text)
            )
            return spec_text[start:end].strip()
    return spec_text.strip()


def _run_git(repo_root: Path, args: Sequence[str]) -> str:
    """Run a git command in *repo_root*, returning stdout (utf-8).

    Bytes are captured and decoded explicitly (errors="replace") so a
    non-ASCII diff never trips the Windows cp1252 text layer (L-079-1).
    """
    proc = subprocess.run(
        ["git", "-C", str(repo_root), *args],
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        stderr = proc.stderr.decode("utf-8", errors="replace").strip()
        raise VerifySessionError(
            f"git {' '.join(args[:2])}... failed (exit {proc.returncode}): "
            f"{stderr}"
        )
    return proc.stdout.decode("utf-8", errors="replace")


def repo_root_for(session_set_dir: Path) -> Path:
    """The git repo root containing the set dir (never ``Path.cwd()``)."""
    cur = session_set_dir.resolve()
    for candidate in (cur, *cur.parents):
        if (candidate / ".git").exists():
            return candidate
    raise VerifySessionError(
        f"no git repository found containing {session_set_dir}"
    )


def build_diff_pathspecs(excludes: Sequence[str]) -> List[str]:
    """Return the pathspec arguments implementing the exclusions.

    Set 089 (evidence completeness): exclusions are **depth-agnostic**. The
    pre-089 form ``:(exclude)dist`` is anchored at the repo root, so it excluded
    a top-level ``dist/`` but NOT a NESTED generated bundle like
    ``tools/dabbler-ai-orchestration/dist`` -- which then flooded the diff
    (~4,400 lines) and truncated the real source, churning the loop. Each
    pattern now becomes a ``glob``-magic pathspec that matches at ANY depth:
    ``**/<p>`` (the entry itself, anywhere) plus, for directory-style patterns,
    ``**/<p>/**`` (its contents, anywhere). This form subsumes the top-level
    case (``**/dist/**`` also matches ``dist/...`` at the root), so both the main
    diff and the untracked collector -- which share this function -- exclude a
    nested bundle without any per-repo ``--exclude`` workaround. Proven against a
    real ``git`` in ``test_verify_session`` (pathspec nesting is version-
    sensitive; do not assume it). A directory named ``dist`` is treated as a
    generated bundle at every depth; its path still appears in the unfiltered
    ``git status --short`` section of the evidence, so exclusion is never silent.
    """
    if not excludes:
        return []
    specs: List[str] = ["."]
    for pattern in excludes:
        specs.append(f":(exclude,glob)**/{pattern}")
        if "*" not in pattern:
            # A directory-style pattern: also exclude its contents at any depth.
            # (Skipped for globs like ``*.vsix``, where ``**/*.vsix`` already
            # matches the files and a ``/**`` suffix would be inert.)
            specs.append(f":(exclude,glob)**/{pattern}/**")
    return specs


@dataclass
class EvidenceBundle:
    """The deterministic evidence a verification round reviews."""

    spec_excerpt: str
    git_status: str
    diff: str
    diff_base: str
    excludes: List[str] = field(default_factory=list)
    # SS3: untracked files' CONTENT (git diff shows only their names). Each is
    # (path, text) for inlined files, or (path, reason) for ones that could not
    # be safely inlined (reported as explicitly uncovered).
    untracked_included: List[tuple] = field(default_factory=list)
    untracked_omitted: List[tuple] = field(default_factory=list)
    # Set 105: untracked FRAMEWORK_BOOKKEEPING_FILES (blessed-writer / lazy-synth
    # state + ledger output). Neither inlined (untracked_included) nor placed in
    # the "review directly / do not assume clean" bucket (untracked_omitted):
    # they are expected framework output, not reviewed work. Kept as bare paths
    # (no content) -- the schema, close gate, and writer-discipline check own this
    # surface, so the verifier does not need their bytes. Still surfaced in
    # ``git status --short`` (honesty preserved -- exclusion is never silent).
    untracked_bookkeeping: List[str] = field(default_factory=list)
    # Set 089: TRACKED changed files dropped from the diff by a generated-bundle
    # exclude. Reported EXPLICITLY (never silently absent) so a reviewer knows a
    # tracked path was excluded on purpose -- the same honesty SS3 gave untracked
    # excluded files. A real source dir that matches a generated pattern (e.g.
    # src/dist) surfaces here as "review directly", not as a silent omission.
    tracked_excluded: List[str] = field(default_factory=list)
    # Set 096 S2: optional override for the diff section's heading. The
    # remediation-review phase reviews a FIX DELTA (tree-to-tree), not the
    # working tree vs a ref, and the heading must say so.
    diff_heading: Optional[str] = None

    def assembled_char_count(self) -> int:
        """Total characters of assembled evidence (Set 089 oversized-input
        guard). Sums the spec excerpt, git status, diff, and inlined untracked
        content -- the material that would be truncated at the verifier's
        context boundary."""
        return (
            len(self.spec_excerpt)
            + len(self.git_status)
            + len(self.diff)
            + sum(len(text) for _, text in self.untracked_included)
        )

    def as_response_under_review(self) -> str:
        """The evidence rendered for the template's Response Under
        Review slot: status first (untracked deliverables visible --
        L-064-9), then the complete diff, then untracked file CONTENTS
        (SS3 -- git diff omits new-file content) and any uncovered paths."""
        status = self.git_status.strip() or "(clean -- no changes reported)"
        diff = self.diff.strip() or "(empty diff)"
        exclude_note = (
            ", ".join(self.excludes) if self.excludes else "(none)"
        )
        diff_heading = self.diff_heading or (
            f"Complete diff (working tree vs `{self.diff_base}`; "
            f"generated-bundle exclusions: {exclude_note})"
        )
        parts = [
            "The session's work, as the working tree presents it.\n\n"
            f"#### git status --short\n\n```\n{status}\n```\n\n"
            f"#### {diff_heading}\n\n"
            f"```diff\n{diff}\n```"
        ]
        if self.untracked_included:
            blocks = []
            for path, text in self.untracked_included:
                body = text if text.strip() else "(empty file)"
                blocks.append(f"##### `{path}`\n\n```\n{body}\n```")
            parts.append(
                "\n\n#### Untracked file contents (new files, absent from the "
                "diff)\n\n" + "\n\n".join(blocks)
            )
        if self.untracked_omitted:
            lines = "\n".join(
                f"- `{path}` -- {reason}"
                for path, reason in self.untracked_omitted
            )
            parts.append(
                "\n\n#### Uncovered untracked paths (NOT inlined -- review these "
                "directly; do not assume they are clean)\n\n" + lines
            )
        if self.untracked_bookkeeping:
            lines = "\n".join(
                f"- `{path}`" for path in self.untracked_bookkeeping
            )
            parts.append(
                "\n\n#### Expected framework bookkeeping (blessed-writer / "
                "lazy-synth output -- NOT reviewed work)\n\n"
                "These untracked files are framework state/ledger bookkeeping "
                "materialized by a blessed writer or by the read-triggered "
                "`not-started` state synth (the Set 7 \"every spec folder carries "
                "a `session-state.json`\" invariant, fired by any all-sets status "
                "scan). They are machine-written, carry no reviewed content, and "
                "are owned by the schema, the close gate, and the writer-discipline "
                "check -- do NOT review them as session deliverables, and do NOT "
                "flag them as hand-authored state (they are not). Listed here "
                "(not silently dropped) for honesty; the tracked diff still "
                "surfaces any DELIBERATE change to these files for review.\n\n"
                + lines
            )
        if self.tracked_excluded:
            lines = "\n".join(f"- `{path}`" for path in self.tracked_excluded)
            parts.append(
                "\n\n#### Excluded tracked paths (generated-bundle pattern; "
                "changed but DROPPED from the diff -- review directly if any is "
                "real source, e.g. a source dir named `dist`)\n\n" + lines
            )
        return "".join(parts)


# Per-file cap on inlined untracked content. Oversized files are reported as
# uncovered rather than silently dropped or blowing up the prompt.
_UNTRACKED_BYTE_CAP = 64 * 1024

# Set 089 (evidence completeness): cap on the TOTAL assembled prompt sent to the
# verifier. Above this, the input itself is likely to be truncated at the
# model's context boundary -- the verifier would review PARTIAL evidence with no
# signal it is partial (the mirror of the SS3 output-truncation guard, applied
# to the INPUT). The default is comfortably above any legitimate review yet well
# below the smallest verifier's input budget, so it catches a genuine flood
# without false-positiving a normal diff. Overridable (e.g. for a large but
# real change on a high-context verifier) via the env var below.
_EVIDENCE_CHAR_CAP_DEFAULT = 600 * 1024
_EVIDENCE_CHAR_CAP_ENV = "AI_ROUTER_VERIFY_MAX_EVIDENCE_CHARS"


def evidence_char_cap() -> int:
    """The active assembled-evidence character cap (env override or default)."""
    raw = os.environ.get(_EVIDENCE_CHAR_CAP_ENV, "").strip()
    if raw:
        try:
            val = int(raw)
        except ValueError:
            val = 0
        if val > 0:
            return val
    return _EVIDENCE_CHAR_CAP_DEFAULT


def _ls_untracked(
    root: Path,
    run_git: Callable[[Path, Sequence[str]], str],
    pathspecs: Sequence[str],
) -> List[str]:
    """Untracked (non-gitignored) file paths under *pathspecs*, in order.

    ``git ls-files --others --exclude-standard -z`` is file-level (a new
    directory expands to its files -- ``git status --short`` lists only
    ``newdir/``) and NUL-delimited (filenames with spaces/quotes/newlines parse
    safely). ``--exclude-standard`` honors .gitignore, so ignored local junk is
    intentionally not enumerated.
    """
    raw = run_git(
        root, ["ls-files", "--others", "--exclude-standard", "-z", "--", *pathspecs]
    )
    return [rel.strip() for rel in raw.split("\0") if rel.strip()]


def _collect_untracked_contents(
    root: Path,
    excludes: Sequence[str],
    run_git: Callable[[Path, Sequence[str]], str] = _run_git,
) -> tuple:
    """Read the text of untracked FILES (not directories) under *root*.

    Enumerates ALL non-ignored untracked files, then partitions them with the
    SAME generated-bundle pathspecs the diff uses (so exclusion matches the diff
    exactly -- git's ``:(exclude)dist`` excludes a top-level ``dist`` but NOT a
    real source path like ``src/dist/x.py``, which a segment-matcher would wrongly
    drop).

    Returns ``(included, omitted, bookkeeping)``: ``included`` is
    ``[(path, text), ...]`` for UTF-8 text files under the size cap; ``omitted``
    is ``[(path, reason), ...]`` for files that cannot be safely inlined --
    **generated-bundle-excluded**, symlink, oversized, binary/non-UTF-8, or
    unreadable; ``bookkeeping`` is ``[path, ...]`` for
    :data:`FRAMEWORK_BOOKKEEPING_FILES` (Set 105 -- blessed-writer / lazy-synth
    state + ledger output that is expected framework bookkeeping, not reviewed
    work). Every non-inlined file is reported EXPLICITLY (including excluded and
    bookkeeping ones) so a reviewer never mistakes silence for coverage.
    (.gitignore-ignored files are intentionally NOT disclosed -- git itself treats
    them as non-source; the generated-bundle excludes may hold real files, so
    those ARE disclosed as uncovered.)
    """
    all_untracked = _ls_untracked(root, run_git, ["."])
    kept = set(
        _ls_untracked(root, run_git, build_diff_pathspecs(excludes) or ["."])
    )
    included: List[tuple] = []
    omitted: List[tuple] = []
    bookkeeping: List[str] = []
    for rel in all_untracked:
        # Set 105: framework state/ledger bookkeeping is classified by BASENAME
        # (covers own + sibling sets, any depth) BEFORE any other partition -- it
        # is expected machine output regardless of where it lands, and must never
        # be inlined as a deliverable nor demanded for direct review. This touches
        # ONLY untracked files (this collector's whole domain); a tracked/committed
        # change to one of these names still flows through the diff for review.
        if os.path.basename(rel) in FRAMEWORK_BOOKKEEPING_FILES:
            bookkeeping.append(rel)
            continue
        if rel not in kept:
            omitted.append((rel, "excluded (generated-bundle pattern)"))
            continue
        p = root / rel
        try:
            if p.is_symlink():
                omitted.append((rel, "symlink (not followed)"))
                continue
            size = p.stat().st_size
            if size > _UNTRACKED_BYTE_CAP:
                omitted.append((rel, f"oversized ({size} bytes)"))
                continue
            data = p.read_bytes()
        except OSError:
            omitted.append((rel, "unreadable"))
            continue
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            omitted.append((rel, "binary / non-UTF-8"))
            continue
        included.append((rel, text))
    return included, omitted, bookkeeping


def _diff_names(
    root: Path,
    diff_base: str,
    pathspecs: Sequence[str],
    run_git: Callable[[Path, Sequence[str]], str],
) -> List[str]:
    """TRACKED changed file paths vs *diff_base* under *pathspecs* (NUL-safe)."""
    raw = run_git(
        root, ["diff", "--name-only", "-z", diff_base, "--", *pathspecs]
    )
    return [rel for rel in raw.split("\0") if rel]


def _tracked_excluded_paths(
    root: Path,
    diff_base: str,
    excludes: Sequence[str],
    run_git: Callable[[Path, Sequence[str]], str],
) -> List[str]:
    """TRACKED changed files DROPPED from the diff by a generated-bundle exclude.

    The full changed set (no pathspec filter) minus the kept set (the same
    exclude pathspecs the diff itself uses). Reported explicitly so a
    depth-agnostic exclude never SILENTLY removes a tracked path from review
    (Set 089): the flood is suppressed, the fact of the change is not.
    """
    if not excludes:
        return []
    all_changed = _diff_names(root, diff_base, ["."], run_git)
    kept = set(_diff_names(root, diff_base, build_diff_pathspecs(excludes), run_git))
    return [p for p in all_changed if p not in kept]


def assemble_evidence(
    session_set_dir: Path,
    session_number: int,
    diff_base: str,
    excludes: Sequence[str],
    run_git: Callable[[Path, Sequence[str]], str] = _run_git,
    max_evidence_chars: Optional[int] = None,
) -> EvidenceBundle:
    """Assemble the evidence bundle for the round.

    - spec excerpt for this session (what the work was supposed to be);
    - ``git status --short`` so untracked deliverables are visible
      (L-064-9: a diff-only bundle silently omits new files);
    - the complete unfiltered diff, working tree vs *diff_base*, less
      the generated-bundle *excludes*;
    - tracked files those excludes DROPPED from the diff, reported explicitly.

    Set 089: enforces the oversized-INPUT guard HERE (not only in the CLI) so
    every caller fails closed. When the assembled evidence exceeds the cap
    (``max_evidence_chars`` or :func:`evidence_char_cap`), raises
    :class:`EvidenceTooLargeError` rather than returning a bundle the verifier
    would silently truncate.
    """
    spec_path = session_set_dir / "spec.md"
    try:
        spec_text = spec_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise VerifySessionError(
            f"could not read {spec_path}: {exc}"
        ) from exc
    excerpt = extract_spec_excerpt(spec_text, session_number)

    root = repo_root_for(session_set_dir)
    status = run_git(root, ["status", "--short"])
    diff_args = ["diff", "--no-color", diff_base, "--"]
    diff_args.extend(build_diff_pathspecs(excludes) or ["."])
    diff = run_git(root, diff_args)
    untracked_included, untracked_omitted, untracked_bookkeeping = (
        _collect_untracked_contents(root, excludes, run_git)
    )
    tracked_excluded = _tracked_excluded_paths(root, diff_base, excludes, run_git)

    bundle = EvidenceBundle(
        spec_excerpt=excerpt,
        git_status=status,
        diff=diff,
        diff_base=diff_base,
        excludes=list(excludes),
        untracked_included=untracked_included,
        untracked_omitted=untracked_omitted,
        untracked_bookkeeping=untracked_bookkeeping,
        tracked_excluded=tracked_excluded,
    )

    cap = max_evidence_chars if max_evidence_chars is not None else evidence_char_cap()
    assembled = bundle.assembled_char_count()
    if assembled > cap:
        raise EvidenceTooLargeError(assembled, cap)
    return bundle


def load_verification_template() -> str:
    """The push verification template (carries the structured verdict
    schema the workflow requires in every session-verification prompt)."""
    path = Path(__file__).resolve().parent / "prompt-templates" / "verification.md"
    return path.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Cross-round issue ledger as machinery (Set 096)
#
# Set 095 carried the settled-points ledger by hand (a conventions-file
# section the orchestrator re-edited every round) — 17 rounds of copy-carry.
# The no-resurrection function is deterministic: prior rounds' findings live
# in the immutable ``sN-issues*.json`` artifacts, and the orchestrator's
# remediation story lives in a per-round sidecar. So ``verify_session`` now
# ASSEMBLES the ledger itself from those records and prepends it to the
# prompt. ``--conventions-file`` stays for what genuinely needs hand
# authorship: the suite baseline, release contract, and by-design scope.
# ---------------------------------------------------------------------------

# Per-field render caps: the ledger is a settled-points INDEX, not a replay
# of every round's prose. Oversized fields truncate with an explicit marker
# (never silently), and the immutable artifacts remain the full record.
_LEDGER_DESCRIPTION_CAP = 700
_LEDGER_SCENARIO_CAP = 300
_LEDGER_NOTE_CAP = 2000

# The resolution_status values that COUNT as settlement evidence (see the
# docs/session-issues-schema.md v2 enum). ``needs-more-context`` and
# ``escalate-human`` are explicitly OPEN states, and an unrecognized value
# proves nothing — both render as unresolved (fail closed: no-resurrection
# framing is never applied to a finding whose settlement is unproven).
_SETTLED_RESOLUTION_STATUSES = frozenset({
    "fixed",
    "not-reproducible",
    "accepted-risk",
    "accepted-consequence",
    "advisory-disagreement",
})


def remediation_note_path(
    session_set_dir: Path, session_number: int, round_number: int
) -> Path:
    """The orchestrator's remediation-note sidecar for *round_number*.

    Written (free-form markdown) AFTER remediating that round's findings and
    BEFORE the next round routes. A NON-EMPTY sidecar is the orchestrator's
    settlement assertion for the round's status-less findings — without it
    (or a settling per-issue ``resolution_status``) the next round's ledger
    renders them UNRESOLVED and instructs the verifier to re-evaluate them.
    Loop bookkeeping, not reviewed work — excluded from the work-diff
    freshness binding like the ``sN-issues*.json`` files it annotates.
    """
    return session_set_dir / (
        f"s{session_number}-remediation-round-{round_number}.md"
    )


def _squash(text: str, cap: int) -> str:
    """Whitespace-collapse *text* and truncate at *cap* with an explicit
    marker (a ledger entry is an index line, never a silent elision)."""
    flat = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(flat) <= cap:
        return flat
    return flat[:cap].rstrip() + " ...[truncated -- see the round artifact]"


def _render_ledger_issue(issue: dict, ledger_id: str = "") -> List[str]:
    """The index lines for one prior-round finding.

    *ledger_id* (Set 096 S2, remediation-review coverage) is the
    machinery-assigned per-render id (``L1``, ``L2``, ...) the fix-verdict
    coverage check keys on; deterministic because prior rounds' envelopes
    are immutable and rounds render in ascending order. Every blocking id
    is re-verdicted EVERY cycle — a prior-acceptance exemption was tried
    (rounds 5–10) and removed by operator decision (round 11): re-stating
    ``fix-accepted`` costs the reviewer one line and doubles as the
    regression check an exemption structurally forfeits.
    """
    severity = str(issue.get("severity") or "unrated").strip()
    lid_note = f" (ledger id: {ledger_id})" if ledger_id else ""
    issue_id = str(issue.get("issueId") or "").strip()
    id_note = f" (id: {issue_id})" if issue_id else ""
    status = str(issue.get("resolution_status") or "").strip()
    status_note = f" [resolution: {status}]" if status else ""
    lines = [
        f"- [{severity}]{lid_note}{id_note}{status_note} "
        + _squash(issue.get("description"), _LEDGER_DESCRIPTION_CAP)
    ]
    scenario = issue.get("failureScenario")
    if scenario:
        lines.append(
            "  - Failure scenario: " + _squash(scenario, _LEDGER_SCENARIO_CAP)
        )
    return lines


def assemble_cross_round_ledger(
    session_set_dir: Path, session_number: int, current_round: int
) -> str:
    """The rendered cross-round ledger (see
    :func:`assemble_cross_round_ledger_with_ids` for the full contract)."""
    text, _ids = assemble_cross_round_ledger_with_ids(
        session_set_dir, session_number, current_round
    )
    return text


def blocking_ledger_id_map(
    session_set_dir: Path, session_number: int, current_round: int
) -> dict:
    """``{(round, issue_index): "L<k>"}`` in the ledger's encounter order.

    The SINGLE assignment of ledger ids: rounds ascending, envelope order
    within a round, blocking findings only, unreadable envelopes skipped.
    :func:`assemble_cross_round_ledger_with_ids` renders from this map and
    the Set 111 S2 acceptance block keys its harness results off it, so a
    harness result and a ledger line can never disagree about which
    finding ``L3`` is.
    """
    ids: dict = {}
    for prior_round in range(1, current_round):
        envelope = _read_round_envelope(
            session_set_dir, session_number, prior_round
        )
        if envelope is None:
            continue
        issues = [
            i for i in (envelope.get("issues") or []) if isinstance(i, dict)
        ]
        for issue_index, issue in enumerate(issues):
            if is_blocking_issue(issue):
                ids[(prior_round, issue_index)] = f"L{len(ids) + 1}"
    return ids


def assemble_cross_round_ledger_with_ids(
    session_set_dir: Path, session_number: int, current_round: int
) -> "tuple[str, List[str]]":
    """Auto-assemble the cross-round issue ledger from prior rounds' artifacts.

    For every round before *current_round*, reads the round's
    ``sN-issues*.json`` findings envelope (when the round bore findings) and
    the orchestrator's ``sN-remediation-round-<R>.md`` sidecar (when
    written), and renders the ledger block the prompt builder prepends to
    the Original Task. Returns ``""`` when there is nothing to carry
    (round 1, or no prior findings/notes).

    **No-resurrection framing must be EARNED** (S1 verification round 1's
    own Major, fixed fail-closed): an issues artifact proves a finding was
    *reported*, never that it was settled. A prior finding renders as
    SETTLED only with settlement evidence — an explicit per-issue
    ``resolution_status`` in :data:`_SETTLED_RESOLUTION_STATUSES` (which
    takes precedence when present), or, for status-less issues, a NON-EMPTY
    remediation-note sidecar for that round (the sidecar is the
    orchestrator's settlement assertion for the round's findings). Every
    other prior finding renders under an UNRESOLVED block that instructs
    the verifier to re-evaluate it — re-raising an unsettled point is not
    resurrection, and the ledger must never suppress an unremediated
    defect.

    An unreadable artifact is reported EXPLICITLY under the UNRESOLVED
    framing (a parse failure is not settlement evidence); the immutable
    artifacts on disk stay the full record.

    Returns ``(ledger_text, blocking_ledger_ids)``. Every BLOCKING finding
    is numbered ``L1..Ln`` in encounter order (rounds ascending, envelope
    order within a round) — deterministic and stable across re-renders
    because the envelopes are immutable. The remediation-review phase
    requires one ``Fix verdict:`` line per id EVERY cycle, and the
    coverage check compares the parsed id set against this list exactly
    (S2 verification rounds 3–4: identity-free counting double-counts
    restatements; the ids make coverage machine-checkable without fuzzy
    text matching). A prior-acceptance exemption was tried (rounds 5–10)
    and REMOVED by operator decision (round 11, removal-over-addition):
    it structurally forfeited the regression check — a cycle-2 edit could
    silently revert an accepted fix — while saving the reviewer only a
    one-line ``fix-accepted`` restatement per settled id.
    """
    settled_sections: List[str] = []
    unresolved_sections: List[str] = []
    blocking_ids: List[str] = []
    ledger_id_map = blocking_ledger_id_map(
        session_set_dir, session_number, current_round
    )
    for prior_round in range(1, current_round):
        settled_lines: List[str] = []
        unresolved_lines: List[str] = []

        note_path = remediation_note_path(
            session_set_dir, session_number, prior_round
        )
        note_text = ""
        note_present = note_path.exists()
        if note_present:
            try:
                note_text = note_path.read_text(encoding="utf-8").strip()
            except OSError:
                note_text = ""
        round_has_settlement_note = bool(note_text)

        issues_path = issues_artifact_path(
            session_set_dir, session_number, prior_round
        )
        if issues_path.exists():
            try:
                envelope = json.loads(issues_path.read_text(encoding="utf-8"))
                issues = [
                    i for i in (envelope.get("issues") or [])
                    if isinstance(i, dict)
                ]
                verdict = str(
                    envelope.get("verificationVerdict") or "(unrecorded)"
                )
            except (OSError, json.JSONDecodeError, TypeError, ValueError):
                unresolved_lines.append(
                    f"- issues artifact `{issues_path.name}` is unreadable "
                    "-- consult it directly and RE-EVALUATE its findings "
                    "against the current evidence (a parse failure is not "
                    "settlement evidence)."
                )
            else:
                for issue_index, issue in enumerate(issues):
                    status = (
                        str(issue.get("resolution_status") or "")
                        .strip()
                        .lower()
                    )
                    if status:
                        settled = status in _SETTLED_RESOLUTION_STATUSES
                    else:
                        settled = round_has_settlement_note
                    ledger_id = ledger_id_map.get((prior_round, issue_index), "")
                    if ledger_id:
                        blocking_ids.append(ledger_id)
                    (settled_lines if settled else unresolved_lines).extend(
                        _render_ledger_issue(issue, ledger_id=ledger_id)
                    )
                header_line = (
                    f"Verdict: {verdict} -- {len(issues)} finding(s) "
                    "this round."
                )
                if settled_lines:
                    settled_lines.insert(0, header_line)
                if unresolved_lines:
                    unresolved_lines.insert(0, header_line)

        if note_text:
            (settled_lines if (settled_lines or not unresolved_lines)
             else unresolved_lines).append(
                f"Remediation notes (round {prior_round}): "
                + _squash(note_text, _LEDGER_NOTE_CAP)
            )
        elif note_present:
            unresolved_lines.append(
                f"Remediation-note sidecar `{note_path.name}` is EMPTY or "
                "unreadable -- it is not settlement evidence; consult it "
                "directly."
            )

        if settled_lines:
            settled_sections.append(
                f"**Round {prior_round}**\n" + "\n".join(settled_lines)
            )
        if unresolved_lines:
            unresolved_sections.append(
                f"**Round {prior_round}**\n" + "\n".join(unresolved_lines)
            )

    if not settled_sections and not unresolved_sections:
        return "", []

    parts: List[str] = [
        "#### Cross-round issue ledger (auto-assembled from prior rounds' "
        "artifacts)\n\n"
        "Findings from this session's PRIOR verification rounds. New "
        "findings must be NEW defects, material under the severity rubric, "
        "in the artifacts as they now stand."
    ]
    if settled_sections:
        parts.append(
            "##### Settled points -- do not resurrect\n\n"
            "Every entry below carries SETTLEMENT EVIDENCE (an "
            "orchestrator remediation note for the round, or an explicit "
            "per-finding resolution status). A settled point never reopens "
            "under fresh wording -- re-raising one (in any wording) is a "
            "review error. The one exception: if the REMEDIATION itself is "
            "defective in the evidence as it now stands, say so "
            "explicitly, name the round and finding you are challenging, "
            "and present the new evidence.\n\n"
            + "\n\n".join(settled_sections)
        )
    if unresolved_sections:
        parts.append(
            "##### Prior findings WITHOUT settlement evidence -- NOT "
            "settled\n\n"
            "The entries below were reported in a prior round but carry NO "
            "settlement evidence (no remediation note for the round, no "
            "settling resolution status). Do NOT treat them as settled: "
            "re-evaluate each against the evidence as it now stands. If "
            "one is fixed, say so; if it persists, RE-RAISE it -- "
            "re-raising an unsettled point is not resurrection.\n\n"
            + "\n\n".join(unresolved_sections)
        )
    return "\n\n".join(parts), blocking_ids


# ---------------------------------------------------------------------------
# Phase machinery (Set 096 S2): the working-tree snapshot the fix-delta
# review diffs from, the completeness-critic prior-findings block, and the
# per-phase framing blocks. Framings ride in the Original Task slot — the
# canonical template file stays byte-identical, so the Set 084 F3 template
# pin holds on every phase.
# ---------------------------------------------------------------------------

def snapshot_worktree_tree(repo_root: Path) -> Optional[str]:
    """Capture the CURRENT working tree as a git tree object; sha or ``None``.

    Uses a throwaway index (``GIT_INDEX_FILE``) — ``read-tree HEAD`` +
    ``add -A`` + ``write-tree`` — so tracked changes AND untracked
    (non-ignored) files are captured without touching the real index or
    the working tree. The tree object persists in the object DB for the
    session-scoped loop (unreachable objects outlive any realistic
    verification loop's gc horizon).

    Why a tree and not ``git diff <ref>`` later: an untracked file is
    absent from the real index, so a tree-vs-worktree diff would report
    it DELETED even though it sits on disk unchanged. The fix delta is
    therefore a **tree-to-tree** diff between two snapshots, which
    handles untracked files symmetrically and shows files added during
    remediation with their full content.

    Returns ``None`` on any git failure; the caller decides fail-open
    (discovery: warn and continue) vs fail-closed (remediation-review:
    refuse — there is nothing sound to diff).
    """
    import tempfile

    fd, tmp_index = tempfile.mkstemp(prefix="verify-session-index-")
    os.close(fd)
    # Let git create the index file itself: some git versions refuse a
    # pre-existing zero-byte index.
    try:
        os.unlink(tmp_index)
    except OSError:
        pass
    env = os.environ.copy()
    env["GIT_INDEX_FILE"] = tmp_index

    def _git(args: Sequence[str]) -> "subprocess.CompletedProcess[bytes]":
        return subprocess.run(
            ["git", "-C", str(repo_root), *args],
            capture_output=True,
            env=env,
            check=False,
        )

    try:
        if _git(["read-tree", "HEAD"]).returncode != 0:
            # No HEAD yet (fresh repo): start from an empty index.
            if _git(["read-tree", "--empty"]).returncode != 0:
                return None
        if _git(["add", "-A"]).returncode != 0:
            return None
        wt = _git(["write-tree"])
        if wt.returncode != 0:
            return None
        sha = wt.stdout.decode("utf-8", errors="replace").strip()
        return sha or None
    finally:
        try:
            os.unlink(tmp_index)
        except OSError:
            pass


def find_discovery_baseline_tree(
    session_set_dir: Path, session_number: int, current_round: int
) -> Optional[tuple]:
    """The most recent prior round's recorded ``discoveryBaselineTree``.

    Scans the immutable ``sN-issues*.json`` envelopes from
    ``current_round - 1`` down to 1 and returns ``(round, tree_sha)`` for
    the first (i.e. latest) envelope carrying the field, or ``None``.
    Only discovery-family rounds write the field, so a second
    remediation-review cycle diffs from the ORIGINAL discovery baseline —
    the cumulative fix delta — by construction.
    """
    for prior_round in range(current_round - 1, 0, -1):
        path = issues_artifact_path(
            session_set_dir, session_number, prior_round
        )
        if not path.exists():
            continue
        try:
            envelope = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(envelope, dict):
            continue
        tree = envelope.get("discoveryBaselineTree")
        if isinstance(tree, str) and tree.strip():
            return prior_round, tree.strip()
    return None


def _read_round_envelope(
    session_set_dir: Path, session_number: int, round_number: int
) -> Optional[dict]:
    """The round's issues envelope as a dict, or ``None`` (absent or
    unreadable — tolerant reader, like every envelope consumer here)."""
    path = issues_artifact_path(session_set_dir, session_number, round_number)
    if not path.exists():
        return None
    try:
        envelope = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return envelope if isinstance(envelope, dict) else None


def _prior_rounds_have_blocking(
    session_set_dir: Path, session_number: int, current_round: int
) -> bool:
    """Whether any prior round's envelope carries a blocking finding.

    Consulted by the supplementary phase's session-verdict fail-close: a
    clean completeness-critic round never settles a session whose
    discovery blockers stand unremediated.
    """
    for prior_round in range(1, current_round):
        envelope = _read_round_envelope(
            session_set_dir, session_number, prior_round
        )
        if envelope is None:
            continue
        for issue in envelope.get("issues") or []:
            if isinstance(issue, dict) and is_blocking_issue(issue):
                return True
    return False


def count_phase_rounds(
    session_set_dir: Path,
    session_number: int,
    upto_round: int,
    phase_name: str,
) -> int:
    """How many rounds before *upto_round* recorded ``phase: <phase_name>``
    in their envelope. Blocking phased rounds always write an envelope
    (a zero-parse blocking round synthesizes a finding), so this counts
    the loop's completed blocking cycles — the bounded-totals input."""
    return count_phase_family_rounds(
        session_set_dir, session_number, upto_round, (phase_name,)
    )


def count_phase_family_rounds(
    session_set_dir: Path,
    session_number: int,
    upto_round: int,
    phase_names: Optional[Sequence[str]] = None,
) -> int:
    """How many rounds before *upto_round* consumed *phase_names*' budget
    (``None`` = any phase — the classic path's input).

    A round consumes its family's budget unless it ENDED THE LOOP: a clean
    round that settles the session costs nothing, because nothing follows
    it. Everything else is a completed cycle.

    Two sources, unioned by round number so neither double-counts:

    1. ``sN-rounds.jsonl`` — the round ledger (Set 111 S1), which records
       every completed round's phase and whether it ended the loop.
    2. The findings envelopes, as before — the backward-compatible
       fallback for sessions that predate the ledger.

    The ledger exists because the envelopes alone are not a faithful
    record of the loop's cycles (S1 supplementary-round finding, verified
    by reproduction): a **clean supplementary round while prior discovery
    blockers stand** is the second discovery pass and does NOT end the
    loop, yet it writes no envelope — so an envelope-only count let a
    third discovery-family pass through unauthorized, which is exactly
    the grinding this set exists to stop.
    """
    consumed: set = set()
    for record in read_round_ledger(session_set_dir, session_number):
        if record.get("event") != ROUND_EVENT_COMPLETED:
            continue
        round_number = record.get("verificationRound")
        if not isinstance(round_number, int) or round_number >= upto_round:
            continue
        if record.get("endedLoop"):
            continue
        if phase_names is None or record.get("phase") in phase_names:
            consumed.add(round_number)
    for prior_round in range(1, upto_round):
        envelope = _read_round_envelope(
            session_set_dir, session_number, prior_round
        )
        if envelope is None:
            continue
        if phase_names is None or envelope.get("phase") in phase_names:
            consumed.add(prior_round)
    return len(consumed)


@dataclass
class PhaseBoundStatus:
    """The bounded-totals verdict for the round about to run (Set 111 S1).

    Attributes:
        label: operator-facing name of the bounded unit ("discovery
            pass", "remediation-review cycle", "verification round").
        family: the phases that consume this budget (``None`` = any).
        bound: how many findings-bearing rounds the budget allows.
        prior_rounds: how many are already on disk.
        exceeds: whether THIS round would pass the bound.
    """
    label: str
    family: Optional[Sequence[str]]
    bound: int
    prior_rounds: int
    exceeds: bool


def evaluate_phase_bound(
    session_set_dir: Path,
    session_number: int,
    round_number: int,
    phase: Optional[str],
) -> PhaseBoundStatus:
    """Whether the round about to run would pass its bounded total.

    Set 111 S1 (proposal §10 Q5, resolved): the bounds failed because
    NOTHING enforced them — ``count_phase_rounds`` fed an advisory "Next
    action" message and no refusal. This is the same arithmetic, read
    BEFORE the metered call so the CLI can refuse.

    The classic no-``--phase`` path is bounded on ANY prior
    findings-bearing round, not just prior classic ones: otherwise
    dropping ``--phase`` at the phased bound is a one-flag bypass of the
    thing being enforced.
    """
    if phase in DISCOVERY_FAMILY_PHASES:
        family: Optional[Sequence[str]] = DISCOVERY_FAMILY_PHASES
        label, bound = "discovery pass", PHASE_BOUND_DISCOVERY
    elif phase == PHASE_REMEDIATION_REVIEW:
        family = (PHASE_REMEDIATION_REVIEW,)
        label, bound = "remediation-review cycle", PHASE_BOUND_REMEDIATION_REVIEW
    else:
        family = None
        label, bound = "verification round", PHASE_BOUND_CLASSIC
    prior = count_phase_family_rounds(
        session_set_dir, session_number, round_number, family
    )
    return PhaseBoundStatus(
        label=label,
        family=family,
        bound=bound,
        prior_rounds=prior,
        exceeds=prior >= bound,
    )


def round_ledger_path(session_set_dir: Path, session_number: int) -> Path:
    """The session's append-only round ledger.

    One file, two record kinds (``event``): the pre-call operator
    authorization for a past-the-bound round, and the post-call record of
    a completed round. Both are loop bookkeeping about the same rounds,
    so they share one artifact rather than accreting two.
    """
    return session_set_dir / f"s{session_number}-rounds.jsonl"


def read_round_ledger(session_set_dir: Path, session_number: int) -> List[dict]:
    """The ledger's records, or ``[]`` (absent, unreadable, or partly
    malformed — a tolerant reader, like every artifact consumer here; a
    truncated final line never voids the records before it)."""
    path = round_ledger_path(session_set_dir, session_number)
    if not path.exists():
        return []
    records: List[dict] = []
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(record, dict):
            records.append(record)
    return records


def _append_round_ledger(path: Path, record: dict) -> dict:
    """Append one record. Append-only by contract: verification artifacts
    are immutable records, so a retry adds a sibling line rather than
    rewriting one."""
    with open(path, "a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    return record


def record_round_authorization(
    path: Path,
    *,
    session_number: int,
    round_number: int,
    phase: Optional[str],
    status: PhaseBoundStatus,
    attestation: str,
) -> dict:
    """Append the operator's past-the-bound authorization.

    Written BEFORE the metered call, so an authorization the operator
    actually gave is on the record even if the routed call then fails.
    """
    return _append_round_ledger(path, {
        "event": ROUND_EVENT_AUTHORIZATION,
        "sessionNumber": session_number,
        "verificationRound": round_number,
        "phase": phase,
        "boundedUnit": status.label,
        "bound": status.bound,
        "priorRounds": status.prior_rounds,
        "attestation": attestation,
        "recordedAt": datetime.now().astimezone().isoformat(),
    })


def record_round_completed(
    path: Path,
    *,
    session_number: int,
    round_number: int,
    phase: Optional[str],
    verdict: str,
    blocking: bool,
    ended_loop: bool,
) -> dict:
    """Append the completed round's record — the bounded-totals input.

    ``ended_loop`` is the whole point: a clean round that settles the
    session consumes no budget, while a clean SUPPLEMENTARY round whose
    prior discovery blockers still stand does (the loop continues to
    remediation), and that round writes no findings envelope to be
    counted from.
    """
    return _append_round_ledger(path, {
        "event": ROUND_EVENT_COMPLETED,
        "sessionNumber": session_number,
        "verificationRound": round_number,
        "phase": phase,
        "verdict": verdict,
        "blocking": blocking,
        "endedLoop": ended_loop,
        "recordedAt": datetime.now().astimezone().isoformat(),
    })



def assemble_fix_delta_evidence(
    session_set_dir: Path,
    session_number: int,
    baseline_tree: str,
    excludes: Sequence[str],
    run_git: Callable[[Path, Sequence[str]], str] = _run_git,
    max_evidence_chars: Optional[int] = None,
) -> EvidenceBundle:
    """The REMEDIATION-REVIEW evidence bundle: the fix delta only.

    A tree-to-tree diff from *baseline_tree* (recorded by the discovery
    round) to a fresh snapshot of the current working tree, under the
    same generated-bundle exclusions as the normal bundle. ``git status
    --short`` still rides along for orientation. The untracked-content
    collector is deliberately absent: the tree-to-tree diff already
    carries new files' full content as added hunks.

    Raises :class:`VerifySessionError` when the current tree cannot be
    snapshotted (fail closed — there is nothing sound to diff), and
    :class:`EvidenceTooLargeError` over the oversized-input cap.
    """
    spec_path = session_set_dir / "spec.md"
    try:
        spec_text = spec_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise VerifySessionError(
            f"could not read {spec_path}: {exc}"
        ) from exc
    excerpt = extract_spec_excerpt(spec_text, session_number)

    root = repo_root_for(session_set_dir)
    current_tree = snapshot_worktree_tree(root)
    if current_tree is None:
        raise VerifySessionError(
            "could not snapshot the current working tree for the fix-delta "
            "diff (fails closed)"
        )
    status = run_git(root, ["status", "--short"])
    diff_args = ["diff", "--no-color", baseline_tree, current_tree, "--"]
    diff_args.extend(build_diff_pathspecs(excludes) or ["."])
    diff = run_git(root, diff_args)
    exclude_note = ", ".join(excludes) if excludes else "(none)"

    bundle = EvidenceBundle(
        spec_excerpt=excerpt,
        git_status=status,
        diff=diff,
        diff_base=baseline_tree,
        excludes=list(excludes),
        diff_heading=(
            f"FIX DELTA ONLY (tree-to-tree: discovery baseline "
            f"`{baseline_tree[:12]}` -> current working tree "
            f"`{current_tree[:12]}`; generated-bundle exclusions: "
            f"{exclude_note}). This is NOT the full session diff — new "
            f"defects are admissible only within these hunks."
        ),
    )
    cap = (
        max_evidence_chars
        if max_evidence_chars is not None
        else evidence_char_cap()
    )
    assembled = bundle.assembled_char_count()
    if assembled > cap:
        raise EvidenceTooLargeError(assembled, cap)
    return bundle


def assemble_prior_findings_block(
    session_set_dir: Path, session_number: int, current_round: int
) -> str:
    """The supplementary phase's already-reported findings block.

    Rendered from ALL prior rounds' immutable ``sN-issues*.json``
    envelopes (index lines via the shared ledger renderer). Replaces the
    cross-round ledger on the supplementary round: the ledger's
    re-evaluate/re-raise framing is for the post-remediation loop, and
    would contradict the completeness-critic's do-not-re-report
    instruction. Returns ``""`` when no prior round bore findings.
    """
    sections: List[str] = []
    for prior_round in range(1, current_round):
        path = issues_artifact_path(
            session_set_dir, session_number, prior_round
        )
        if not path.exists():
            continue
        lines: List[str] = []
        try:
            envelope = json.loads(path.read_text(encoding="utf-8"))
            issues = [
                i for i in (envelope.get("issues") or [])
                if isinstance(i, dict)
            ]
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            lines.append(
                f"- issues artifact `{path.name}` is unreadable -- consult "
                "it directly before treating any point as unreported."
            )
        else:
            for issue in issues:
                lines.extend(_render_ledger_issue(issue))
        if lines:
            sections.append(
                f"**Round {prior_round}**\n" + "\n".join(lines)
            )
    if not sections:
        return ""
    return (
        "#### Findings already reported by the prior discovery pass(es) -- "
        "DO NOT re-report\n\n"
        "The findings below were already reported against this SAME "
        "evidence. Re-reporting, rephrasing, or re-grading any of them is "
        "a review error for this pass. Your job is what they MISSED.\n\n"
        + "\n\n".join(sections)
    )


def assemble_acceptance_block(
    session_set_dir: Path, session_number: int, current_round: int
) -> str:
    """The remediation-review's acceptance-criteria block (Set 111 S2).

    Renders the harness results for every prior round into two lists —
    findings CLOSED by baseline discrimination (with both runs' evidence)
    and criteria that did NOT close their finding (with the reason) —
    keyed by the same ledger ids the fix-verdict coverage check uses.

    The block REDIRECTS the reviewer's attention; it never removes work
    from the round. Coverage is unchanged: every ledger id still gets a
    fix-verdict line every cycle (the Set 096 S2 round-11 operator
    decision — an exemption forfeits the regression check). What changes
    is that a criteria-closed id costs one line instead of a re-derivation,
    so the round's attention goes where no criterion could reach: what
    the fixes BROKE, and what the criteria MISSED (proposal §9's
    counterexample is exactly that case).

    Returns ``""`` when no acceptance artifact exists — the phase behaves
    exactly as it did before Proposal B.
    """
    try:
        from .acceptance_harness import (
            OUTCOME_AUTO_CLOSED,
            read_acceptance_results,
        )
    except ImportError:  # pragma: no cover - test/bare context
        from acceptance_harness import (  # type: ignore[no-redef]
            OUTCOME_AUTO_CLOSED,
            read_acceptance_results,
        )

    artifacts = read_acceptance_results(
        session_set_dir, session_number, current_round
    )
    if not artifacts:
        return ""
    ledger_id_map = blocking_ledger_id_map(
        session_set_dir, session_number, current_round
    )

    closed_lines: List[str] = []
    open_lines: List[str] = []
    for artifact in artifacts:
        artifact_round = artifact.get("verificationRound")
        for result in artifact.get("results") or []:
            if not isinstance(result, dict):
                continue
            index = result.get("issueIndex")
            ledger_id = ledger_id_map.get((artifact_round, index), "")
            id_note = f"{ledger_id} " if ledger_id else ""
            severity = str(result.get("severity") or "unrated")
            summary = _squash(
                result.get("summary"), _LEDGER_DESCRIPTION_CAP
            )
            head = f"- {id_note}[{severity}] {summary}"
            criterion = str(result.get("criterion") or "").strip()
            if result.get("outcome") == OUTCOME_AUTO_CLOSED:
                baseline = result.get("baseline") or {}
                fixed = result.get("fixed") or {}
                closed_lines.append(head)
                if criterion:
                    closed_lines.append(
                        f"  - Criterion (verifier-authored, run unchanged): "
                        f"`{_squash(criterion, _LEDGER_SCENARIO_CAP)}` "
                        f"-- expected exit "
                        f"{result.get('expectedExitCode')}"
                    )
                closed_lines.append(
                    f"  - Pre-fix tree: exit {baseline.get('exitCode')} "
                    "-- FAILED, as baseline discrimination requires"
                )
                closed_lines.append(
                    f"  - Fixed tree: exit {fixed.get('exitCode')} -- PASSED"
                )
            else:
                reason = _squash(
                    result.get("reason") or "", _LEDGER_SCENARIO_CAP
                )
                open_lines.append(
                    f"{head}\n  - Criterion outcome: "
                    f"{result.get('outcome')} -- {reason}"
                )

    if not closed_lines and not open_lines:
        return ""

    parts: List[str] = [
        "#### Acceptance-criteria harness results (auto-assembled from the "
        "harness artifacts)\n\n"
        "Each blocking finding carried an acceptance criterion the verifier "
        "wrote AT FINDING TIME. A harness -- not the remediator -- ran each "
        "UNCHANGED criterion in disposable checkouts of the pre-fix tree and "
        "the fixed tree. A finding is CRITERIA-CLOSED only where the "
        "criterion FAILED before and PASSED after; anything else proved "
        "nothing and is fully yours to judge."
    ]
    if closed_lines:
        parts.append(
            "##### Criteria-closed findings -- evidence recorded, do not "
            "re-derive\n\n"
            "Give each of these its one required `Fix verdict:` line (the "
            "coverage check is unchanged, and the restatement is the "
            "regression check). Do NOT re-litigate the underlying finding: "
            "the executable evidence below already settles whether it was "
            "addressed. Contradict it ONLY if the fix delta as it now "
            "stands proves the recorded runs wrong -- and then say exactly "
            "how.\n\n"
            + "\n".join(closed_lines)
        )
    if open_lines:
        parts.append(
            "##### Criteria that did NOT close their finding -- judge these "
            "normally\n\n"
            "A vacuous, unrunnable, invalidated or still-failing criterion "
            "is NOT evidence of a fix. Review these findings exactly as you "
            "would with no criterion at all.\n\n"
            + "\n\n".join(open_lines)
        )
    parts.append(
        "**Where your attention belongs on this round:** what the fixes "
        "BROKE, and what the criteria MISSED. A criterion is written before "
        "the fix exists, so it cannot anticipate a fix that satisfies it "
        "while breaking an adjacent deliverable -- that is precisely the "
        "hole this holistic pass exists to cover."
    )
    return "\n\n".join(parts)


def discovery_lens_for_call(call_index: int) -> str:
    """The discovery lens call *call_index* (1-based) reviews under.

    Cycled, so a K=1 fan-out gets lens 1 and a K>len(LENSES) fan-out
    wraps rather than erroring — the lens list and the configured K are
    independent knobs.
    """
    return DISCOVERY_LENSES[(call_index - 1) % len(DISCOVERY_LENSES)]


def build_discovery_lens_framing(lens: str) -> str:
    """The lens block appended to the discovery framing (Set 111 S1).

    Both lenses demand the SAME exhaustive enumeration under the SAME
    severity rubric; they differ only in the DIRECTION of the read, so
    the two calls' attention lands in different places. Nothing here
    raises or lowers severity, and neither lens narrows scope — a
    finding the other lens would have caught is still in scope.
    """
    if lens == DISCOVERY_LENS_FAILURE_SCENARIO:
        return (
            "##### LENS FOR THIS CALL: FAILURE SCENARIOS (code -> the "
            "ways it breaks)\n\n"
            "Read the changed code first and the plan second. For each "
            "changed line, ask how it behaves at its edges: unhandled "
            "inputs and error paths; partial failure, retry and "
            "interrupted-write states; concurrency and ordering; "
            "platform, encoding and locale differences; resource "
            "cleanup on every exit path; and the handling of anything "
            "untrusted. Every finding still needs its concrete failure "
            "scenario -- this lens exists to surface defects a "
            "plan-conformance read cannot see. Scope is NOT narrowed: "
            "report a conformance defect if you find one."
        )
    return (
        "##### LENS FOR THIS CALL: SPEC CONFORMANCE (plan -> the diff)\n\n"
        "Read the session plan first and the diff second. Walk every "
        "obligation the plan states -- each step, each Creates/Touches "
        "entry, each Ends-with clause -- and find the change that "
        "discharges it. What is MISSING, PARTIAL, or CONTRADICTS the "
        "stated plan is this lens's yield: unmet deliverables, silent "
        "scope changes, documentation or comments that no longer match "
        "the code they describe, and claims in the evidence the diff "
        "does not support. Scope is NOT narrowed: report a runtime "
        "defect if you find one."
    )


def build_phase_framing(phase: Optional[str], lens: Optional[str] = None) -> str:
    """The phase's framing block for the Original Task slot ('' when no
    phase). The framing changes COVERAGE and SCOPE only — the severity
    rubric, the materiality gate, and the verdict grammar all stay
    exactly as the template states them.

    ``lens`` (Set 111 S1, discovery only) appends the per-call discovery
    lens so the K-way fan-out sends differently-framed prompts instead
    of identical ones.
    """
    if phase == PHASE_DISCOVERY:
        framing = (
            "#### PHASE: INITIAL DISCOVERY -- exhaustive enumeration "
            "(read first)\n\n"
            "This round is a DISCOVERY pass, not a verdict-only review. "
            "Reviewers are salience-limited: a single pass tends to return "
            "only the most salient handful of findings. Your job here is "
            "the exhaustive harvest:\n\n"
            "- Enumerate EVERY defect you can substantiate from the "
            "evidence, at EVERY severity -- do not stop at the most "
            "salient few, and do not truncate the list for brevity.\n"
            "- Grade each finding under the severity rubric exactly as "
            "instructed: Critical/Major findings (with their mandatory "
            "failure scenarios) as Issues; Minor / immaterial observations "
            "under NITS. The rubric is unchanged -- discovery raises "
            "COVERAGE, never severity.\n"
            "- The verdict token keeps its normal meaning (ISSUES FOUND "
            "only when a Critical/Major Issue exists).\n\n"
            "Findings from this pass seed a consequence-graded remediation "
            "plan that is reviewed against the fix delta afterward, so "
            "completeness now prevents churn later."
        )
        if lens:
            framing += "\n\n" + build_discovery_lens_framing(lens)
        return framing
    if phase == PHASE_SUPPLEMENTARY:
        return (
            "#### PHASE: SUPPLEMENTARY DISCOVERY -- completeness critic "
            "(read first)\n\n"
            "A prior discovery pass over this SAME evidence already "
            "reported the findings listed below this block. This round "
            "exists because same-state review passes are measured to "
            "return largely disjoint finding sets. Your job is to find "
            "what the prior pass MISSED:\n\n"
            "- Do NOT re-report, rephrase, or re-grade the already-"
            "reported findings -- a re-worded duplicate is a review "
            "error.\n"
            "- Look where the prior pass did not: different files, "
            "different defect classes, different failure modes, "
            "cross-cutting concerns.\n"
            "- Same rubric, same format: new Critical/Major Issues "
            "(mandatory failure scenarios) or new NITS. If you genuinely "
            "find nothing new, VERIFIED is the correct verdict for this "
            "pass."
        )
    if phase == PHASE_REMEDIATION_REVIEW:
        return (
            "#### PHASE: REMEDIATION REVIEW -- fix-delta scope "
            "(read first)\n\n"
            "Discovery is over; the blocking findings in the cross-round "
            "issue ledger have been remediated. The Response Under Review "
            "below is the FIX DELTA ONLY -- the changes made since the "
            "discovery baseline -- not the full session diff.\n\n"
            "- The ledger numbers every prior blocking finding with a "
            "ledger id (L1, L2, ...). Give ONE per-finding verdict line "
            "for EVERY ledger id, every cycle -- re-stating fix-accepted "
            "for an already-settled id is deliberate: it re-confirms the "
            "fix still stands in the delta as it now is -- in exactly "
            "this form:\n"
            "  - Fix verdict: L<n> <short summary> -- "
            "fix-accepted | fix-rejected | accepted-with-modification\n"
            "  Coverage is machine-checked against the non-exempt ledger "
            "ids: a missing id fails the round.\n"
            "- If two ledger ids report the SAME underlying point (fan-out "
            "siblings, reworded restatements), verdict the primary one and "
            "mark the other on its own line:\n"
            "  - Fix verdict: L<m> -- duplicate-of L<n>\n"
            "  A duplicate's disposition follows its target's -- never "
            "re-argue the same point under two ids. A duplicate-of chain "
            "must END in a real verdict (fix-accepted / fix-rejected / "
            "accepted-with-modification): cycles, self-references, and "
            "targets with no verdict are machine-rejected as missing "
            "coverage.\n"
            "  fix-accepted = the fix resolves the finding. fix-rejected "
            "= it does not -- you must then restate the finding as an "
            "Issue block (severity + mandatory failure scenario). "
            "accepted-with-modification = resolved, with a residual worth "
            "recording -- state the residual as a NIT.\n"
            "- NEW defects are admissible ONLY within the fix hunks shown "
            "below (a defect the remediation itself introduced). Anything "
            "outside the fix delta is OUT OF SCOPE for this round: record "
            "it under NITS at most, never as an Issue.\n"
            "- This is the ONE holistic look at the whole fix delta, and "
            "the only place two things can be caught: what the fixes BROKE "
            "(a fix that satisfies its own acceptance criterion while "
            "breaking an adjacent deliverable), and what the criteria "
            "MISSED (a criterion written before the fix existed cannot "
            "anticipate either). Where an acceptance-criteria block appears "
            "below, spend the attention it frees HERE -- not on "
            "re-deriving findings whose criteria already discriminated.\n"
            "- Minors are recorded, never re-rounded. The verdict token: "
            "ISSUES FOUND only when a fix is rejected or a new in-hunk "
            "Critical/Major exists; otherwise VERIFIED."
        )
    return ""


def build_prompt(
    evidence: EvidenceBundle,
    session_number: int,
    round_number: int,
    conventions: str = "",
    template: Optional[str] = None,
    ledger: str = "",
    framing: str = "",
) -> str:
    """Fill the verification template with the session's evidence.

    ``conventions`` (optional, from ``--conventions-file``) is the
    up-front conventions block the guidance requires session-verification
    prompts to open with (suite baseline, release contract, by-design
    exclusions) -- it rides at the top of the Original Task slot.

    ``framing`` (Set 096 S2, from :func:`build_phase_framing` — plus, on
    the supplementary phase, :func:`assemble_prior_findings_block`) is
    the phase's coverage/scope block; it rides after the conventions and
    before the ledger, keeping the canonical template file untouched.

    ``ledger`` (Set 096, auto-assembled by
    :func:`assemble_cross_round_ledger`) is the settled-points cross-round
    issue ledger; it rides directly after the phase framing so the
    no-resurrection rule is in front of the verifier before the work.
    """
    if template is None:
        template = load_verification_template()
    task_parts: List[str] = []
    if conventions.strip():
        task_parts.append(
            "#### Conventions and baseline (read first)\n\n"
            + conventions.strip()
        )
    if framing.strip():
        task_parts.append(framing.strip())
    if ledger.strip():
        task_parts.append(ledger.strip())
    task_parts.append(
        f"Session {session_number} of the active session set "
        f"(verification round {round_number}). This is a **pre-close** review "
        "at Step 6: close-out (close_session, change-log.md, the final "
        "disposition verdict, committed/pushed/complete state) happens AFTER "
        "this verification, so those artifacts do not exist yet and their "
        "absence is not a defect (see 'Review scope'). The session's plan, "
        "verbatim from spec.md:\n\n" + evidence.spec_excerpt
    )
    original_task = "\n\n".join(task_parts)
    return build_verification_prompt(
        original_task=original_task,
        original_response=evidence.as_response_under_review(),
        task_type=SESSION_VERIFICATION_TASK_TYPE,
        template=template,
    )


# ---------------------------------------------------------------------------
# Artifact + disposition writes
# ---------------------------------------------------------------------------

def write_issues_artifact(
    path: Path,
    session_number: int,
    round_number: int,
    verdict: str,
    issues: List[dict],
    *,
    phase: Optional[str] = None,
    discovery_baseline_tree: Optional[str] = None,
    fix_verdicts: Optional[List[dict]] = None,
) -> None:
    """Write the Set 055 findings envelope (only called on a
    findings-bearing round; presence of the file means issues found).

    Set 096 S2 — three optional, omit-null envelope fields (tolerant
    readers; ``schemaVersion`` unchanged): ``phase`` (which ``--phase``
    produced the round), ``discoveryBaselineTree`` (the working-tree
    snapshot the remediation-review fix delta diffs from — written by
    discovery-family rounds only), and ``fixVerdicts`` (the parsed
    per-finding fix verdicts of a remediation-review round). Because this
    writer runs only on findings-bearing rounds (the locked Set 055
    invariant), a CLEAN remediation-review round records its fix-verdict
    enumeration in the immutable, stamp-bound ``sN-verification*.md``
    artifact instead — the envelope field exists for the blocking rounds
    the loop continues on.
    """
    envelope = {
        "schemaVersion": 1,
        "sessionNumber": session_number,
        "verificationRound": round_number,
        "verificationVerdict": verdict,
        "issues": issues,
    }
    if phase:
        envelope["phase"] = phase
    if discovery_baseline_tree:
        envelope["discoveryBaselineTree"] = discovery_baseline_tree
    if fix_verdicts:
        envelope["fixVerdicts"] = fix_verdicts
    path.write_text(
        json.dumps(envelope, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def patch_disposition(session_set_dir: Path, verdict: str) -> Path:
    """Patch ``disposition.json``: ``verification_method: "api"`` and the
    verdict token verbatim, preserving every unrelated field.

    Operates on the raw JSON dict (never a dataclass round-trip, which
    would drop unknown keys), writes atomically (temp + ``os.replace``),
    and is idempotent. When no disposition exists yet, a minimal partial
    record carrying only the two fields is created -- Step 8 authors the
    full disposition later and must preserve them.
    """
    path = session_set_dir / "disposition.json"
    data: dict = {}
    if path.is_file():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                data = loaded
        except (OSError, json.JSONDecodeError):
            # A malformed disposition must not eat the verdict: keep the
            # broken content aside and start a fresh patchable record.
            backup = path.with_suffix(".json.malformed")
            try:
                os.replace(path, backup)
                print(
                    f"WARNING: existing disposition.json was malformed; "
                    f"moved to {backup.name}",
                    file=sys.stderr,
                )
            except OSError:
                pass
            data = {}
    data["verification_method"] = "api"
    data["verification_verdict"] = verdict
    serialized = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    tmp_path = f"{path}.tmp.{os.getpid()}"
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write(serialized)
        f.flush()
        try:
            os.fsync(f.fileno())
        except OSError:
            pass
    os.replace(tmp_path, path)
    return path


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="verify_session",
        description=(
            "Step 6 as a first-class command: assemble the session's "
            "evidence bundle deterministically (spec excerpt + git "
            "status --short + the complete working-tree diff), route it "
            "to a cross-provider verifier "
            "(task_type=session-verification), write the raw "
            "sN-verification*.md artifact before any display, write "
            "sN-issues*.json when the round bears findings, classify "
            "blocking-ness (a Minor-only round never opens a "
            "remediation loop), patch disposition.json "
            "(verification_method=api + the verdict token verbatim), "
            "and print the exact next action. Exit codes: 0 "
            "non-blocking (VERIFIED or Minor-only), 2 usage, 3 state "
            "(no session in flight), 4 blocking findings (or a clean "
            "supplementary round while prior discovery blockers stand), "
            "6 routed call failed."
        ),
    )
    p.add_argument(
        "--session-set-dir",
        required=True,
        help=(
            "Path to the session-set directory (or a bare set number, "
            "resolved like the other lifecycle CLIs)."
        ),
    )
    p.add_argument(
        "--phase",
        choices=list(PHASE_CHOICES),
        default=None,
        help=(
            "Phased-loop mode (Set 096). Omitted: the classic single-call "
            "behavior, unchanged. 'discovery': exhaustive-enumeration "
            "framing at all severities, fanned out K ways "
            "(verification.discovery.fan_out, default "
            f"{DISCOVERY_FAN_OUT_DEFAULT}) over the same evidence with a "
            "DIFFERENT lens per call ("
            + " / ".join(DISCOVERY_LENSES) +
            "), merged "
            "into one round envelope; records the discovery baseline tree. "
            "'supplementary': completeness-critic pass over the SAME "
            "evidence BEFORE any remediation (run it when discovery found "
            "Critical/Major); fed the prior findings with a "
            "do-not-re-report instruction. 'remediation-review': reviews "
            "the FIX DELTA since the discovery baseline plus the "
            "auto-ledger; per-finding fix-accepted / fix-rejected / "
            "accepted-with-modification verdicts; new defects admissible "
            "only within the fix hunks."
        ),
    )
    p.add_argument(
        "--diff-base",
        default="HEAD",
        help=(
            "Git ref the working-tree diff is taken against "
            "(default: HEAD). Use the pre-session ref when session work "
            "has already been committed."
        ),
    )
    p.add_argument(
        "--round",
        type=int,
        default=None,
        dest="round_number",
        help=(
            "Verification round number. Default: inferred as the next "
            "free round from the sN-verification*.md artifacts on disk. "
            "An explicit round whose artifact already exists is refused "
            "(artifacts are never overwritten)."
        ),
    )
    p.add_argument(
        "--max-tier",
        type=int,
        default=None,
        help=(
            "Pin route()'s maximum tier. For WORDING-ONLY re-verifies "
            "(L-064-7): pin to the round-1 verifier's own tier so the "
            "short-response escalation heuristic cannot cross providers. "
            "On a substantive --round >= 2 call, a --max-tier below the "
            "round-1 verifier's tier is refused unless --wording-only "
            "is passed."
        ),
    )
    p.add_argument(
        "--wording-only",
        action="store_true",
        help=(
            "Declare this re-verify as wording/schema-only (the round-1 "
            "substance stands; only the verdict format is being "
            "re-collected). Lifts the tier-pin refusal for --round >= 2."
        ),
    )
    p.add_argument(
        "--exclude",
        action="append",
        default=None,
        metavar="PATHSPEC",
        help=(
            "Additional git pathspec to exclude from the evidence diff "
            "(repeatable). Added on top of the defaults: "
            + ", ".join(DEFAULT_DIFF_EXCLUDES)
        ),
    )
    p.add_argument(
        "--no-default-excludes",
        action="store_true",
        help="Drop the default generated-bundle exclusions from the diff.",
    )
    p.add_argument(
        "--conventions-file",
        default=None,
        help=(
            "Optional path to an up-front conventions block (suite "
            "baseline, release contract, by-design exclusions) prepended "
            "to the verification prompt, per the project-guidance "
            "convention."
        ),
    )
    p.add_argument(
        "--complexity-hint",
        type=int,
        default=None,
        help=(
            "Complexity hint passed to route() "
            f"(default {DEFAULT_COMPLEXITY_HINT}, or "
            f"{PHASE_COMPLEXITY_HINT} on any --phase round: discovery "
            "asks for an exhaustive enumeration and the later phases are "
            "by definition downstream of Critical/Major findings)."
        ),
    )
    p.add_argument(
        "--operator-authorized-round",
        default=None,
        metavar="REASON",
        help=(
            "Operator attestation authorizing a round PAST its bounded "
            "total (Set 111 S1). The loop is bounded at 2 discovery-family "
            "passes, 2 remediation-review cycles, and 2 classic rounds; the "
            "round that would pass a bound is REFUSED without this flag. "
            "The value is the operator's reason and must be non-empty -- "
            "the flag alone is never enough (same contract as close_session "
            "--manual-verify). Recorded, append-only, in "
            "sN-rounds.jsonl. This is an operator "
            "authorization: the orchestrator never passes it on its own "
            "authority."
        ),
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help=(
            "Assemble the evidence and print what would run -- writes "
            "nothing, routes nothing."
        ),
    )
    return p


def _resolve_metrics_path() -> Optional[Path]:
    """Best-effort resolution of router-metrics.jsonl for the tier-pin
    guard. Never raises -- a missing answer fails open."""
    try:
        try:
            from metrics import _log_path  # type: ignore[import-not-found]
            from config import load_config  # type: ignore[import-not-found]
        except ImportError:
            from .metrics import _log_path  # type: ignore[no-redef]
            from .config import load_config  # type: ignore[no-redef]
        return Path(_log_path(load_config()))
    except Exception:
        return None


def _default_route(prompt: str, session_set: str, session_number: int,
                   complexity_hint: int, max_tier: Optional[int],
                   exclude_providers: Optional[List[str]] = None,
                   verification_stamp: Optional[dict] = None,
                   prefer_model: Optional[str] = None):
    """Production route() invocation (injectable seam for tests)."""
    from ai_router import route  # lazy: keeps --dry-run and tests hermetic

    kwargs = dict(
        content=prompt,
        task_type=SESSION_VERIFICATION_TASK_TYPE,
        complexity_hint=complexity_hint,
        session_set=session_set,
        session_number=session_number,
    )
    if prefer_model is not None:
        # Set 109 S4: the discovery fan-out's cheap-model preference. Note
        # the task_type is UNCHANGED — this is why the preference exists as
        # a route() argument rather than as its own task type.
        kwargs["prefer_model"] = prefer_model
    if max_tier is not None:
        kwargs["max_tier"] = max_tier
    if exclude_providers is not None:
        # Set 084 (F2): the CLI resolves the orchestrator's effective
        # provider itself and passes the exclusion explicitly. route()
        # would resolve the identical exclusion from session context —
        # the explicit pass keeps the CLI's printed exclusion the one
        # that actually governed selection.
        kwargs["exclude_providers"] = exclude_providers
    if verification_stamp is not None:
        # Set 084 S2 (F3): the producer-side stamp; route() completes
        # it (verifier_model + artifact_sha256) at record time so the
        # metrics row this call writes is the corroborating evidence
        # the close gate accepts.
        kwargs["verification_stamp"] = verification_stamp
    return route(**kwargs)


def resolve_orchestrator_exclusion(
    session_set_dir: Path, session_number: int
) -> "object":
    """The session orchestrator's resolved identity (Set 084 F1/F2).

    Thin wrapper over the shared
    :func:`ai_router.orchestrator_identity.resolve_session_orchestrator_identity`
    so the CLI and ``route()`` resolve through ONE path. Raises
    :class:`VerifySessionError` (state error) on unresolvable identity —
    fail closed: a verification whose exclusion target is unknown must
    not run.
    """
    try:
        from orchestrator_identity import (  # type: ignore[import-not-found]
            IdentityResolutionError,
            resolve_session_orchestrator_identity,
        )
    except ImportError:
        from .orchestrator_identity import (  # type: ignore[no-redef]
            IdentityResolutionError,
            resolve_session_orchestrator_identity,
        )
    try:
        return resolve_session_orchestrator_identity(
            str(session_set_dir), session_number
        )
    except IdentityResolutionError as exc:
        raise VerifySessionError(
            f"the session orchestrator's identity is unresolvable, so "
            f"the cross-provider exclusion cannot be applied (fails "
            f"closed): {exc}"
        ) from exc


def run(args: argparse.Namespace, route_fn=None) -> int:
    """Execute the verify_session flow. Returns the exit code."""
    # -- Resolve the set dir (number handles accepted, like every CLI).
    try:
        session_set_dir = Path(resolve_session_set_dir(args.session_set_dir))
    except SetResolutionError as exc:
        print(f"verify_session: {exc}", file=sys.stderr)
        return EXIT_USAGE
    if not session_set_dir.is_dir():
        print(
            f"verify_session: session-set directory not found: "
            f"{session_set_dir}",
            file=sys.stderr,
        )
        return EXIT_STATE

    set_name = session_set_dir.resolve().name

    # -- Resolve the in-progress session (state error) and the round
    #    (usage error: bad/colliding --round).
    try:
        session_number = resolve_in_progress_session(session_set_dir)
    except VerifySessionError as exc:
        print(f"verify_session: {exc}", file=sys.stderr)
        return EXIT_STATE
    try:
        round_number = resolve_round(
            session_set_dir, session_number, args.round_number
        )
    except VerifySessionError as exc:
        print(f"verify_session: {exc}", file=sys.stderr)
        return EXIT_USAGE

    # -- Set 096 S2: resolve the phase and its knobs BEFORE any metered
    #    call. --phase omitted keeps the classic single-call behavior.
    phase: Optional[str] = getattr(args, "phase", None)
    fan_out = 1
    provider_diversity = PROVIDER_DIVERSITY_DEFAULT
    if phase is not None:
        cfg_fan_out, provider_diversity = load_discovery_phase_config()
        if phase == PHASE_DISCOVERY:
            fan_out = cfg_fan_out
    complexity_hint = args.complexity_hint
    if complexity_hint is None:
        complexity_hint = (
            PHASE_COMPLEXITY_HINT if phase is not None
            else DEFAULT_COMPLEXITY_HINT
        )

    # -- Set 111 S1: ENFORCE the bounded totals (proposal §10 Q5). The
    #    numbers are unchanged -- what changes is that passing one is now
    #    a REFUSAL before any metered call, not an advisory line printed
    #    after one. A --wording-only re-verify re-collects the verdict
    #    FORMAT of a round that already happened, so it is not a fresh
    #    cycle and does not consume (or trip) the budget.
    raw_authorization = getattr(args, "operator_authorized_round", None)
    authorization = (raw_authorization or "").strip()
    if raw_authorization is not None and not authorization:
        print(
            "verify_session: refused -- --operator-authorized-round requires "
            "a non-empty operator attestation (why the bound is being "
            "passed, and what remains unresolved). The flag alone is not an "
            "authorization; an audit trail with nothing in it is worse than "
            "none. Same contract as close_session --manual-verify.",
            file=sys.stderr,
        )
        return EXIT_USAGE
    bound_status = evaluate_phase_bound(
        session_set_dir, session_number, round_number, phase
    )
    if args.wording_only:
        # Not a fresh cycle: it re-collects the verdict FORMAT of a round
        # that already ran, so it neither trips nor consumes the budget.
        bound_status.exceeds = False
    if bound_status.exceeds and not authorization:
        print(
            f"verify_session: refused -- this would be {bound_status.label} "
            f"{bound_status.prior_rounds + 1} of a bounded "
            f"{bound_status.bound} for session {session_number}. The loop "
            "SUSPENDS at the bound; it does not keep opening rounds.\n"
            "  - No Critical/Major left (only Minor or unrated nits): that "
            "is effectively VERIFIED. Record the residual as "
            "adjudicated-minor in the disposition and CLOSE.\n"
            "  - An unfixed or disputed Critical/Major: stop to the "
            "operator -- a single third-provider adjudication or the "
            "operator's own call. An adjudication settles the STOP, not "
            "the truth: a finding waived at the bound is an owed residual "
            "with a named owner, never argued down to nothing.\n"
            "Persisting past the bound requires a material Critical/Major "
            "AND the operator's recorded authorization (never the "
            "orchestrator's own):\n"
            f"  python -m ai_router.verify_session --session-set-dir "
            f"{session_set_dir}"
            + (f" --phase {phase}" if phase else "")
            + " --operator-authorized-round \"<the operator's reason>\"\n"
            "The attestation is appended to "
            f"{round_ledger_path(session_set_dir, session_number).name}"
            " (append-only audit trail).",
            file=sys.stderr,
        )
        return EXIT_USAGE
    if authorization and not bound_status.exceeds:
        if bound_status.prior_rounds >= bound_status.bound:
            reason = (
                "a --wording-only re-verify re-collects an existing round's "
                "verdict format rather than opening a cycle, so it needs no "
                "authorization"
            )
        else:
            reason = (
                f"this is only {bound_status.label} "
                f"{bound_status.prior_rounds + 1} of {bound_status.bound}, "
                "which needs no authorization"
            )
        print(
            "verify_session: NOTE -- --operator-authorized-round was passed "
            f"but {reason}; nothing recorded. Proceeding.",
            file=sys.stderr,
        )
        authorization = ""

    # -- Set 084 (F2): resolve the orchestrator's EFFECTIVE provider
    #    (registry lookup on the orchestrator block's model — the shared
    #    orchestrator_identity path) and exclude it from verifier
    #    selection. Unresolvable identity fails closed BEFORE any
    #    metered call: the remediation is start_session --model.
    try:
        identity = resolve_orchestrator_exclusion(
            session_set_dir, session_number
        )
    except VerifySessionError as exc:
        print(
            f"verify_session: {exc}\nRe-run start_session with --model, "
            "then retry.",
            file=sys.stderr,
        )
        return EXIT_STATE
    exclude_providers = [identity.effective_provider]

    # -- L-064-7 tier-pin guard (before any metered call).
    if args.max_tier is not None and round_number >= 2 and not args.wording_only:
        metrics_path = _resolve_metrics_path()
        r1_tier = (
            round1_verifier_tier(metrics_path, set_name, session_number)
            if metrics_path is not None
            else None
        )
        refusal = check_tier_pin(
            round_number, args.max_tier, r1_tier, args.wording_only
        )
        if refusal:
            print(f"verify_session: refused -- {refusal}", file=sys.stderr)
            return EXIT_USAGE
    if args.wording_only and round_number < 2:
        print(
            "verify_session: NOTE -- --wording-only has no effect on "
            "round 1 (nothing to re-collect); proceeding.",
            file=sys.stderr,
        )

    # -- Evidence bundle.
    excludes: List[str] = []
    if not args.no_default_excludes:
        excludes.extend(DEFAULT_DIFF_EXCLUDES)
    if args.exclude:
        excludes.extend(args.exclude)
    if phase is not None:
        # S2 verification round 1: between phased rounds the loop writes its
        # own bookkeeping into the working tree (round artifacts, issues
        # envelopes, remediation sidecars, disposition patches). That is
        # immutable review machinery (the template's Review-scope carve-out),
        # not work under review — and in the fix delta it is pure noise that
        # dilutes the new-defects-only-within-fix-hunks scope. Exclude this
        # set's bookkeeping from PHASED evidence (the classic path is
        # unchanged for compat; exclusions are disclosed like every other
        # exclude, never silent). One definition with the freshness hash:
        # verification_stamp.WORK_DIFF_SET_BOOKKEEPING.
        try:
            from .verification_stamp import (  # type: ignore[import-not-found]
                WORK_DIFF_SET_BOOKKEEPING as _BOOKKEEPING,
                repo_relative_posix as _rel_posix,
            )
        except ImportError:
            from verification_stamp import (  # type: ignore[no-redef]
                WORK_DIFF_SET_BOOKKEEPING as _BOOKKEEPING,
                repo_relative_posix as _rel_posix,
            )
        try:
            set_rel = _rel_posix(
                session_set_dir.resolve(), repo_root_for(session_set_dir)
            )
            excludes.extend(f"{set_rel}/{name}" for name in _BOOKKEEPING)
        except VerifySessionError:
            pass  # no repo root -> evidence assembly raises its own error
    baseline_round: Optional[int] = None
    baseline_tree: Optional[str] = None
    if phase == PHASE_REMEDIATION_REVIEW:
        baseline = find_discovery_baseline_tree(
            session_set_dir, session_number, round_number
        )
        if baseline is None:
            print(
                "verify_session: --phase remediation-review reviews the fix "
                "delta since the discovery baseline, but no prior round of "
                "this session recorded a discoveryBaselineTree in its "
                "sN-issues*.json envelope. Run --phase discovery first (a "
                "findings-bearing discovery/supplementary round records "
                "the baseline). Refusing (fails closed).",
                file=sys.stderr,
            )
            return EXIT_USAGE
        baseline_round, baseline_tree = baseline
    try:
        if phase == PHASE_REMEDIATION_REVIEW:
            evidence = assemble_fix_delta_evidence(
                session_set_dir, session_number, baseline_tree, excludes
            )
        else:
            evidence = assemble_evidence(
                session_set_dir, session_number, args.diff_base, excludes
            )
    except VerifySessionError as exc:
        print(f"verify_session: {exc}", file=sys.stderr)
        return EXIT_USAGE
    except EvidenceTooLargeError as exc:
        # -- Set 089: oversized-INPUT guard (enforced in assemble_evidence so
        #    every caller fails closed). A larger input would be truncated at
        #    the verifier's context boundary -> it would review PARTIAL evidence
        #    with no signal it is partial (the mirror of the SS3 output-
        #    truncation guard). Fail closed: nothing routed, nothing written,
        #    the close stays BLOCKED.
        print(
            "verify_session: VERIFICATION UNAVAILABLE -- the assembled evidence "
            f"({exc.assembled_chars:,} chars) exceeds the cap ({exc.cap:,} "
            "chars); a larger input would be truncated at the verifier's "
            "context boundary, so it would review PARTIAL evidence with no "
            "signal it is partial. No verdict, artifact, or disposition was "
            "written; the close stays BLOCKED. Shrink the evidence: exclude "
            "generated files (--exclude <path>; the default depth-agnostic "
            "bundle excludes already drop dist/out/node_modules/__pycache__/"
            "*.vsix at any depth), split the change into smaller sessions, or "
            f"-- only if the chosen verifier can truly hold it -- raise "
            f"{_EVIDENCE_CHAR_CAP_ENV}.",
            file=sys.stderr,
        )
        return EXIT_VERIFICATION_UNAVAILABLE

    conventions = ""
    if args.conventions_file:
        try:
            conventions = Path(args.conventions_file).read_text(
                encoding="utf-8"
            )
        except OSError as exc:
            print(
                f"verify_session: could not read --conventions-file: {exc}",
                file=sys.stderr,
            )
            return EXIT_USAGE

    # -- Set 096: the settled-points cross-round ledger is machinery, not a
    #    hand-carried conventions section. Assembled from prior rounds'
    #    immutable sN-issues*.json + the orchestrator's remediation-note
    #    sidecars; empty on round 1 / no prior findings. The SUPPLEMENTARY
    #    phase replaces it with the prior-findings completeness-critic
    #    block: the ledger's re-evaluate/re-raise framing is for the
    #    post-remediation loop and would contradict do-not-re-report.
    if phase == PHASE_SUPPLEMENTARY:
        ledger = ""
        prior_findings = assemble_prior_findings_block(
            session_set_dir, session_number, round_number
        )
        if not prior_findings:
            print(
                "verify_session: --phase supplementary is the "
                "completeness-critic pass over a prior discovery round's "
                "findings, but no prior round of this session bears a "
                "findings envelope. Run --phase discovery first; a clean "
                "discovery round needs no supplementary pass.",
                file=sys.stderr,
            )
            return EXIT_USAGE
        framing = build_phase_framing(phase) + "\n\n" + prior_findings
        ledger_ids: List[str] = []
    else:
        ledger, ledger_ids = assemble_cross_round_ledger_with_ids(
            session_set_dir, session_number, round_number
        )
        framing = build_phase_framing(phase)
        # -- Set 111 S2: the remediation-review reads the acceptance
        #    harness's results, so criteria-closed findings arrive with
        #    their executable evidence attached instead of as open
        #    questions. Empty (and the phase is unchanged) when no
        #    harness artifact exists.
        if phase == PHASE_REMEDIATION_REVIEW:
            acceptance_block = assemble_acceptance_block(
                session_set_dir, session_number, round_number
            )
            if acceptance_block:
                framing = framing + "\n\n" + acceptance_block

    # -- Discovery-family rounds snapshot the working tree so a later
    #    remediation-review can diff the fix delta from it. Fails OPEN
    #    with a loud note: the round itself is still sound evidence.
    snapshot_tree: Optional[str] = None
    if phase in (PHASE_DISCOVERY, PHASE_SUPPLEMENTARY):
        snapshot_tree = snapshot_worktree_tree(
            repo_root_for(session_set_dir)
        )
        if snapshot_tree is None:
            print(
                "verify_session: WARNING -- could not snapshot the working "
                "tree; this round will not record a discoveryBaselineTree, "
                "so a later --phase remediation-review needs a baseline "
                "from another discovery-family round.",
                file=sys.stderr,
            )

    # -- Set 111 S1: one prompt PER CALL. The discovery fan-out varies
    #    the lens by call index -- same evidence, same K, same cost, same
    #    envelope merge; only the framing differs. Every other path
    #    builds exactly one prompt, as before.
    call_lenses: List[Optional[str]] = [
        discovery_lens_for_call(call_index)
        if phase == PHASE_DISCOVERY else None
        for call_index in range(1, fan_out + 1)
    ]
    prompts = [
        build_prompt(
            evidence, session_number, round_number, conventions=conventions,
            ledger=ledger,
            framing=(
                build_phase_framing(phase, lens=lens_k)
                if lens_k else framing
            ),
        )
        for lens_k in call_lenses
    ]
    prompt = prompts[0]

    review_path = verification_artifact_path(
        session_set_dir, session_number, round_number
    )
    issues_path = issues_artifact_path(
        session_set_dir, session_number, round_number
    )
    # -- Discovery fan-out siblings (fan_out == 1 -> just the canonical
    #    artifact). Collisions are refused up front, like the canonical
    #    path in resolve_round (artifacts are never overwritten).
    artifact_paths: List[Path] = [review_path]
    for call_index in range(2, fan_out + 1):
        sibling = fanout_artifact_path(
            session_set_dir, session_number, round_number, call_index
        )
        if sibling.exists():
            print(
                f"verify_session: fan-out artifact {sibling.name} already "
                "exists; verification artifacts are never overwritten. "
                "Omit --round to auto-select the next round.",
                file=sys.stderr,
            )
            return EXIT_USAGE
        artifact_paths.append(sibling)

    # -- Set 084 S2 (F3): build the producer-side evidence stamp. The
    #    evidence hash binds the row to the exact filled prompt the
    #    verifier reviews; the template id + normalized hash bind it to
    #    the canonical adversarial template; route() completes the
    #    verifier_model / artifact_sha256 halves at record time.
    try:
        from .verification_stamp import (  # type: ignore[import-not-found]
            STAMP_SOURCE_VERIFY_SESSION,
            build_stamp,
            compute_work_diff_sha256,
            repo_relative_posix,
            resolve_commitish,
            sha256_hex,
        )
    except ImportError:
        from verification_stamp import (  # type: ignore[no-redef]
            STAMP_SOURCE_VERIFY_SESSION,
            build_stamp,
            compute_work_diff_sha256,
            repo_relative_posix,
            resolve_commitish,
            sha256_hex,
        )
    # I-084-S2-5: the stamp binds to the repo state under review — the
    # resolved diff base plus the canonical work-diff hash the close
    # gate recomputes at close time. Unresolvable state fails closed
    # BEFORE any metered call.
    repo_root = repo_root_for(session_set_dir)
    evidence_base = resolve_commitish(repo_root, args.diff_base)
    if evidence_base is None:
        print(
            f"verify_session: --diff-base {args.diff_base!r} does not "
            "resolve to a commit; the evidence stamp cannot bind to the "
            "repo state (fails closed).",
            file=sys.stderr,
        )
        return EXIT_STATE
    work_diff_sha256 = compute_work_diff_sha256(
        session_set_dir, evidence_base
    )
    if work_diff_sha256 is None:
        print(
            "verify_session: could not compute the work-diff freshness "
            "hash (fails closed).",
            file=sys.stderr,
        )
        return EXIT_STATE
    try:
        # One stamp per fan-out call: each stamp's evidence hash binds to
        # THAT call's filled prompt (Set 111 S1 -- the discovery lenses
        # make the prompts genuinely different, so a shared hash would
        # misdescribe calls 2..K), and the artifact binding is per call.
        stamps = [
            build_stamp(
                source=STAMP_SOURCE_VERIFY_SESSION,
                evidence_sha256=sha256_hex(prompt_k.encode("utf-8")),
                orchestrator_effective_provider=identity.effective_provider,
                artifact_path=repo_relative_posix(path_k, repo_root),
                evidence_base=evidence_base,
                work_diff_sha256=work_diff_sha256,
            )
            for prompt_k, path_k in zip(prompts, artifact_paths)
        ]
        stamp = stamps[0]
    except ValueError as exc:
        # I-084-S2-11: a drifted-template refusal is a controlled
        # fail-closed exit with remediation, never an unwinding
        # traceback — nothing was written, nothing was routed.
        print(
            f"verify_session: refused to stamp (fails closed): {exc}",
            file=sys.stderr,
        )
        return EXIT_STATE

    if args.dry_run:
        print("verify_session: DRY RUN -- nothing written, nothing routed")
        print(f"  session set:        {set_name}")
        print(f"  session:            {session_number}")
        print(f"  round:              {round_number}")
        print(f"  phase:              "
              f"{phase or '(none -- classic single-call)'}")
        if phase == PHASE_DISCOVERY:
            print(f"  discovery fan-out:  {fan_out} call(s), lenses: "
                  + ", ".join(
                      f"{k}={lens_k}"
                      for k, lens_k in enumerate(call_lenses, start=1)
                  ))
        if bound_status.exceeds:
            print(f"  bound:              PAST the bounded "
                  f"{bound_status.bound} {bound_status.label}(s) -- "
                  "operator-authorized")
        if phase == PHASE_REMEDIATION_REVIEW:
            print(f"  fix-delta baseline: round {baseline_round} tree "
                  f"{baseline_tree[:12]}")
        print(f"  orchestrator:       {identity.effective_provider} "
              f"(via {identity.source}; provenance="
              f"{identity.provenance or 'unlabeled'})")
        print(f"  excluded providers: {', '.join(exclude_providers)}")
        print(f"  diff base:          {args.diff_base}")
        print(f"  diff exclusions:    {', '.join(excludes) or '(none)'}")
        print(f"  evidence diff:      {len(evidence.diff)} chars")
        print(f"  git status lines:   {len(evidence.git_status.splitlines())}")
        print(f"  cross-round ledger: "
              f"{f'{len(ledger)} chars (auto-assembled)' if ledger else '(empty -- no prior findings)'}")
        print(f"  complexity hint:    {complexity_hint}")
        print(f"  prompt size:        {len(prompt)} chars")
        print(f"  would write:        "
              f"{', '.join(p.name for p in artifact_paths)}"
              f" (+ {issues_path.name} if findings)")
        print(f"  max tier:           {args.max_tier if args.max_tier is not None else '(router default)'}")
        print(f"  evidence stamp:     source={stamp['source']}, "
              f"template={stamp['template_id']} "
              f"({stamp['template_sha256'][:12]}...), "
              f"evidence={stamp['evidence_sha256'][:12]}...")
        return EXIT_OK

    # -- Route to the cross-provider verifier (orchestrator's effective
    #    provider excluded -- Set 084 F2).
    if route_fn is None:
        route_fn = _default_route
    # -- Set 111 S1: record the operator's authorization BEFORE the
    #    metered call it authorizes. An authorization the operator
    #    actually gave belongs on the record even if the call then fails
    #    -- and a dry run (which returned above) records nothing.
    if authorization:
        auth_path = round_ledger_path(session_set_dir, session_number)
        record_round_authorization(
            auth_path,
            session_number=session_number,
            round_number=round_number,
            phase=phase,
            status=bound_status,
            attestation=authorization,
        )
        print(
            f"verify_session: NOTE -- {bound_status.label} "
            f"{bound_status.prior_rounds + 1} exceeds the bounded "
            f"{bound_status.bound}; proceeding on the operator's recorded "
            f"authorization (appended to {auth_path.name}).",
            file=sys.stderr,
        )
    # R1 remediation (I-084-S1-2): the except clause below must catch the
    # CLASS OBJECT route() actually raises. _default_route resolves route
    # through the ai_router package, whose module raises
    # ai_router.verification.VerificationUnavailableError — so this import
    # is package-relative FIRST (same module object), with the
    # package-absolute form as the only fallback. A bare
    # ``from verification import …`` could bind a DISTINCT class object
    # under sys.path-shim contexts and silently miss the except.
    try:
        from .verification import (  # type: ignore[import-not-found]
            VerificationUnavailableError,
        )
    except ImportError:
        from ai_router.verification import (  # type: ignore[no-redef]
            VerificationUnavailableError,
        )
    # -- Supplementary cross-provider preference (Set 096 S2): when the
    #    config asks for provider diversity, ALSO exclude the round-1
    #    verifier's provider so a third family is preferred. A preference,
    #    never a hard rule: unresolvable round-1 identity fails OPEN to
    #    the base exclusion, and an exclusion that leaves no candidate
    #    degrades LOUDLY to the base exclusion in the loop below.
    preferred_exclusions: Optional[List[str]] = None
    if (
        phase == PHASE_SUPPLEMENTARY
        and provider_diversity == PROVIDER_DIVERSITY_CROSS_PROVIDER
    ):
        metrics_path = _resolve_metrics_path()
        r1_model = (
            round1_verifier_model(metrics_path, set_name, session_number)
            if metrics_path is not None
            else None
        )
        r1_provider = None
        if r1_model:
            try:
                from orchestrator_identity import (  # type: ignore[import-not-found]
                    resolve_model_provider,
                )
            except ImportError:
                from .orchestrator_identity import (  # type: ignore[no-redef]
                    resolve_model_provider,
                )
            r1_provider = resolve_model_provider(r1_model)
        if r1_provider and r1_provider != identity.effective_provider:
            preferred_exclusions = [
                identity.effective_provider, r1_provider,
            ]
        else:
            print(
                "verify_session: NOTE -- provider_diversity=cross-provider "
                "is configured but the round-1 verifier's provider could "
                "not be resolved from the metrics log; using the base "
                "orchestrator-only exclusion.",
                file=sys.stderr,
            )

    # Set 109 S4: the cheap-model preference applies to the DISCOVERY fan-out
    # only. The supplementary and remediation-review passes adjudicate — they
    # decide whether a finding is real and whether a fix landed — and that is
    # the wrong place to economise, so they keep the pinned verifier.
    discovery_preference = (
        load_discovery_model() if phase == PHASE_DISCOVERY else None
    )

    def _route_once(prompt_k: str, stamp_k: dict, exclusions: List[str]):
        return route_fn(
            prompt_k,
            str(session_set_dir),
            session_number,
            complexity_hint,
            args.max_tier,
            exclusions,
            stamp_k,
            discovery_preference,
        )

    # -- The call loop: one call classically, K differently-framed calls
    #    on a discovery fan-out (Set 111 S1: one lens per call over the
    #    same evidence). Call 1 is load-bearing (its failure keeps the
    #    existing hard exits); calls 2..K are yield-enhancement, so their
    #    failure degrades LOUDLY to a reduced fan-out instead of voiding
    #    the round.
    results: List[tuple] = []  # (call_index, result)
    for call_index, (artifact_path_k, stamp_k, prompt_k) in enumerate(
        zip(artifact_paths, stamps, prompts), start=1
    ):
        try:
            if call_index == 1 and preferred_exclusions is not None:
                try:
                    result = _route_once(
                        prompt_k, stamp_k, preferred_exclusions
                    )
                except VerificationUnavailableError:
                    print(
                        "verify_session: NOTE -- no verifier survives the "
                        "cross-provider preference exclusions "
                        f"({', '.join(preferred_exclusions)}); degrading "
                        "to the base orchestrator-only exclusion "
                        "(preference, not a hard rule).",
                        file=sys.stderr,
                    )
                    result = _route_once(
                        prompt_k, stamp_k, exclude_providers
                    )
            else:
                result = _route_once(prompt_k, stamp_k, exclude_providers)
        except VerificationUnavailableError as exc:
            if call_index > 1:
                print(
                    f"verify_session: WARNING -- discovery fan-out call "
                    f"{call_index}/{len(artifact_paths)} could not be "
                    f"routed ({exc}); continuing with the completed "
                    "call(s). The round stands as a reduced-fan-out "
                    "discovery round.",
                    file=sys.stderr,
                )
                break
            # The hard blocked state: no verdict, no artifact, no
            # disposition patch. Only the operator-attested manual path
            # resolves it -- never a silent same-provider verification,
            # never an engine-facing skip (Set 083 operator mandate).
            print(
                "verify_session: VERIFICATION UNAVAILABLE -- no eligible "
                "verifier exists outside the orchestrator's effective "
                f"provider ({', '.join(exclude_providers)}).\n"
                f"Reason: {exc}\n"
                "No verdict was written; the close stays BLOCKED. This state "
                "is resolvable only by the operator (never the engine): run "
                "the verification manually on a different-provider surface "
                "using ai_router/prompt-templates/verification.md, save the "
                "raw output, then close with the attested manual path:\n"
                "  python -m ai_router.close_session --session-set-dir "
                f"{session_set_dir} --manual-verify --interactive\n"
                "The attestation must name the verifying surface, model, "
                "effective provider, template used, timestamp, and the raw "
                "artifact path.",
                file=sys.stderr,
            )
            return EXIT_VERIFICATION_UNAVAILABLE
        except Exception as exc:  # noqa: BLE001 -- report any transport failure
            if call_index > 1:
                print(
                    f"verify_session: WARNING -- discovery fan-out call "
                    f"{call_index}/{len(artifact_paths)} failed ({exc}); "
                    "continuing with the completed call(s). The round "
                    "stands as a reduced-fan-out discovery round.",
                    file=sys.stderr,
                )
                break
            print(
                f"verify_session: routed verification call failed: {exc}\n"
                "Nothing was written. Follow the verifier-failure escalation "
                "ladder (retry once, fall back to the remaining cross-provider "
                "verifier) -- see docs/ai-led-session-workflow.md Step 6.",
                file=sys.stderr,
            )
            return EXIT_ROUTE_FAILED

        # -- Truncation is INVALID EVIDENCE, not a warning (SS3). A truncated
        #    verifier response is an incomplete review; on the load-bearing
        #    first call, treat the round as verification-unavailable and write
        #    NOTHING -- no artifact, no verdict, no disposition patch. The
        #    stamped metrics row route() already recorded then binds an
        #    artifact that never lands on disk, so it fails the close gate's
        #    artifact-hash check (validate_stamped_row check #6) and cannot
        #    corroborate a close: the backstop runs a fresh round rather than
        #    settling on a partial review. A truncated fan-out sibling is
        #    dropped the same way (nothing written), reducing the fan-out.
        if bool(getattr(result, "truncated", False)):
            if call_index > 1:
                print(
                    f"verify_session: WARNING -- fan-out call {call_index}'s "
                    "response was TRUNCATED (L-064-1); dropping that call's "
                    "review (no artifact written; its metrics row cannot "
                    "corroborate a close). The round stands as a "
                    "reduced-fan-out discovery round.",
                    file=sys.stderr,
                )
                continue
            print(
                "verify_session: VERIFICATION UNAVAILABLE -- the verifier response "
                "was TRUNCATED (L-064-1). An incomplete review is invalid evidence: "
                "no verdict, artifact, or disposition was written, and the close "
                "stays BLOCKED. Re-run with a smaller evidence bundle or a "
                "higher-capacity verifier, or resolve via the operator-attested "
                "manual path (see --manual-verify).",
                file=sys.stderr,
            )
            return EXIT_VERIFICATION_UNAVAILABLE

        # -- Persist RAW output BEFORE any display or parsing (L-064-3).
        #    newline="" disables newline translation so the on-disk bytes
        #    equal content.encode("utf-8") — the exact bytes the Set 084 F3
        #    stamp's artifact_sha256 hashed at record time. A translated
        #    CRLF write would break the artifact binding on Windows.
        artifact_path_k.write_text(result.content, encoding="utf-8", newline="")
        results.append((call_index, result))

        # -- Discovery output-budget floor (S2 verification round 8): the
        #    call already ran at its model's configured max_output_tokens;
        #    raising THAT is a provider-limit-bound operator setting. The
        #    implementable half is loud visibility when exhaustive
        #    enumeration landed on an under-budget verifier.
        if phase == PHASE_DISCOVERY:
            cap = _model_output_cap(getattr(result, "model_name", ""))
            floor = load_discovery_min_output_tokens()
            if cap is not None and cap < floor:
                print(
                    f"verify_session: WARNING -- discovery call {call_index} "
                    f"was answered by {result.model_name}, whose configured "
                    f"max_output_tokens ({cap}) is below the discovery "
                    f"output-budget floor ({floor}, "
                    "verification.discovery.min_output_tokens). Exhaustive "
                    "enumeration needs headroom; consider raising that "
                    "model's configured ceiling (provider limits permitting) "
                    "or verifying with a higher-capacity model. A truncated "
                    "response is already treated as invalid evidence.",
                    file=sys.stderr,
                )

    # -- Parse each completed call and merge across the fan-out (a
    #    single-call round merges trivially). Blocking classification runs
    #    on the merged finding set, so a Major from either call blocks.
    merged_issues: List[dict] = []
    call_tokens: List[str] = []
    for call_index, result in results:
        verdict_k, issues_k = parse_verification_response(result.content)
        call_tokens.append(verdict_k)
        if verdict_k != "VERIFIED" and not issues_k:
            # S2 verification (supplementary finding): a blocking verdict
            # whose findings did not parse must still produce an envelope —
            # otherwise the phased loop stalls (no prior-findings block for
            # supplementary, no discoveryBaselineTree for the fix delta).
            # Synthesize one unknown-severity finding (blocking by the
            # anti-laundering rule) pointing at the raw artifact.
            issues_k = [{
                "description": (
                    "the verifier returned a blocking verdict but no "
                    "findings could be parsed from its response -- consult "
                    "the raw artifact "
                    f"{artifact_paths[call_index - 1].name} directly and "
                    "treat its findings as unresolved."
                ),
                "category": "unparseable-findings",
                "severity": "unknown",
            }]
        if phase == PHASE_DISCOVERY and len(artifact_paths) > 1:
            for issue in issues_k:
                issue["discoveryCall"] = call_index
                issue["discoveryLens"] = call_lenses[call_index - 1]
        merged_issues.extend(issues_k)
    # Merged verdict token: VERIFIED ONLY when every completed call's token
    # is exactly VERIFIED — anything else fails closed to ISSUES_FOUND
    # (S2 verification round 1: the merge must not silently depend on the
    # parser's two-token contract; an unknown token must never launder
    # into a clean verdict).
    verdict = (
        "VERIFIED"
        if call_tokens and all(t == "VERIFIED" for t in call_tokens)
        else "ISSUES_FOUND"
    )

    fix_verdicts: List[dict] = []
    if phase == PHASE_REMEDIATION_REVIEW and results:
        fix_verdicts = parse_fix_verdicts(results[0][1].content)
        rejected = [
            fv for fv in fix_verdicts if fv["verdict"] == "fix-rejected"
        ]
        # S2 verification round 1 (anti-laundering): an explicit structured
        # ``fix-rejected`` is blocking evidence even when the reviewer
        # failed to restate an Issue block (or wrapped it in a
        # contradictory VERIFIED token). Only escalate when the round
        # would otherwise be non-blocking — on the normal path the
        # restated Issue already blocks and needs no duplicate.
        if rejected and not classify_blocking(verdict, merged_issues).blocking:
            for fv in rejected:
                merged_issues.append({
                    "description": (
                        "fix-rejected verdict without a restated Issue "
                        f"block: {fv['finding']} -- the reviewer rejected "
                        "this finding's remediation; consult the raw round "
                        "artifact."
                    ),
                    "category": "fix-rejected",
                    "severity": "Major",
                })
        # -- Coverage (S2 verification rounds 3-4): the ledger numbers
        #    every blocking finding (L1..Ln); the reviewer must verdict
        #    each id, and the check is an EXACT id-set comparison — no
        #    fuzzy text matching, no double-counted restatements. A review
        #    that skipped the id format falls back to a count comparison
        #    against the id list, so an honest full enumeration still
        #    passes. A gap on an otherwise non-blocking round escalates
        #    (unknown severity blocks): an under-enumerated review is not
        #    settlement evidence and never closes the loop.
        gap_note = ""
        if ledger_ids:
            parsed_ids = {
                fv["ledgerId"] for fv in fix_verdicts if fv.get("ledgerId")
            }
            if not fix_verdicts:
                gap_note = (
                    "no per-finding fix verdicts could be parsed from this "
                    "remediation-review response -- an un-enumerated "
                    "review is not settlement evidence for the ledger's "
                    "findings."
                )
            elif parsed_ids:
                # Round 10: coverage means every id's verdict chain
                # TERMINATES in a real disposition — a direct
                # fix-accepted / fix-rejected / accepted-with-modification
                # verdict, or a duplicate-of chain ending at one. Cycles
                # (L1<->L2), self-references, and dangling targets are NOT
                # coverage: an aliased id with no terminal disposition
                # escalates exactly like a missing one. Every id is
                # re-verdicted every cycle (round 11, operator decision:
                # the one-line restatement IS the regression check).
                real_ids = {
                    fv["ledgerId"] for fv in fix_verdicts
                    if fv.get("ledgerId") and fv.get("verdict") in (
                        "fix-accepted", "fix-rejected",
                        "accepted-with-modification",
                    )
                }
                dup_map_round = {
                    fv["ledgerId"]: str(fv.get("duplicateOf") or "").upper()
                    for fv in fix_verdicts
                    if fv.get("ledgerId")
                    and fv.get("verdict") == "duplicate-of"
                }
                id_universe = set(ledger_ids)

                def _terminates(lid: str) -> bool:
                    seen: set = set()
                    cur = lid
                    while True:
                        if cur in seen:
                            return False  # duplicate-of cycle
                        seen.add(cur)
                        if cur in real_ids:
                            return True
                        nxt = dup_map_round.get(cur)
                        if not nxt or nxt not in id_universe:
                            return False  # no verdict / dangling target
                        cur = nxt

                unterminated = [
                    i for i in ledger_ids if not _terminates(i)
                ]
                if unterminated:
                    gap_note = (
                        "ledger id(s) "
                        + ", ".join(unterminated)
                        + " received no terminal fix verdict -- each "
                        "required id needs a real disposition, directly "
                        "or via a duplicate-of chain that ends in one "
                        "(cycles and dangling targets are not coverage)."
                    )
            elif len(fix_verdicts) < len(ledger_ids):
                gap_note = (
                    f"only {len(fix_verdicts)} fix verdict(s) parsed for "
                    f"{len(ledger_ids)} numbered blocking finding(s), and "
                    "none carry the prescribed ledger ids -- coverage "
                    "cannot be confirmed."
                )
        if gap_note:
            print(
                f"verify_session: incomplete fix-verdict coverage -- "
                f"{gap_note}",
                file=sys.stderr,
            )
            if not classify_blocking(verdict, merged_issues).blocking:
                merged_issues.append({
                    "description": (
                        "incomplete fix-verdict coverage: " + gap_note
                        + " Re-run --phase remediation-review (one 'Fix "
                        "verdict: L<n> ...' line per ledger id), or "
                        "escalate to the operator."
                    ),
                    "category": "incomplete-fix-verdict-coverage",
                    "severity": "unknown",
                })

    classification = classify_blocking(verdict, merged_issues)

    if merged_issues:
        write_issues_artifact(
            issues_path,
            session_number,
            round_number,
            verdict,
            merged_issues,
            phase=phase,
            discovery_baseline_tree=snapshot_tree,
            fix_verdicts=fix_verdicts or None,
        )

    # -- S2 verification round 1 (gate hole): a CLEAN supplementary round
    #    must not upgrade the SESSION's disposition to VERIFIED while the
    #    discovery round's blockers stand unremediated — the supplementary
    #    round's own stamped row stays fresh (loop bookkeeping is excluded
    #    from the work-diff hash), so a VERIFIED patch here could settle a
    #    close over unremediated Majors. The round verdict stays what the
    #    verifier said; the SESSION verdict written to disposition fails
    #    closed to ISSUES_FOUND, and the claim/stamp mismatch then blocks
    #    any close until a clean remediation-review round exists.
    session_verdict = verdict
    if phase is not None and classification.blocking and verdict == "VERIFIED":
        # Phased paths (S2 verification round 3): a blocking round must
        # never patch a closable VERIFIED claim — a contradictory VERIFIED
        # token (fix-rejected without a restated Issue, an escalated
        # coverage gap) would otherwise leave a disposition the stamped
        # row corroborates. Failing the CLAIM closed makes the claim/stamp
        # mismatch block any close until a genuinely clean round exists.
        # (The classic path keeps its existing semantics — compat.)
        session_verdict = "ISSUES_FOUND"
    supplementary_blockers_stand = (
        phase == PHASE_SUPPLEMENTARY
        and not classification.blocking
        and _prior_rounds_have_blocking(
            session_set_dir, session_number, round_number
        )
    )
    if supplementary_blockers_stand:
        session_verdict = "ISSUES_FOUND"

    # -- Set 111 S1: record the completed round in the ledger BEFORE the
    #    disposition patch, so the bounded-totals input exists even if a
    #    later step fails. `endedLoop` is the load-bearing field: a clean
    #    round that settles the session consumes no budget, but a clean
    #    SUPPLEMENTARY round whose prior discovery blockers still stand
    #    is the second discovery pass and the loop continues -- and that
    #    round writes no findings envelope to be counted from.
    ended_loop = not classification.blocking and not supplementary_blockers_stand
    record_round_completed(
        round_ledger_path(session_set_dir, session_number),
        session_number=session_number,
        round_number=round_number,
        phase=phase,
        verdict=session_verdict,
        blocking=classification.blocking,
        ended_loop=ended_loop,
    )

    disposition_path = patch_disposition(session_set_dir, session_verdict)

    # -- Report (ASCII-only). (A load-bearing truncation was already handled
    #    above as a hard verification-unavailable outcome, so every result
    #    reaching here is whole.)
    total_cost = sum(
        float(getattr(result, "total_cost_usd", 0.0) or 0.0)
        for _, result in results
    )
    print(f"verify_session: session {session_number}, round {round_number}")
    if phase:
        print(f"  phase:              {phase}")
    print(f"  excluded providers: {', '.join(exclude_providers)} "
          f"(orchestrator effective provider via {identity.source})")
    if phase == PHASE_REMEDIATION_REVIEW:
        print(f"  fix-delta baseline: round {baseline_round} tree "
              f"{baseline_tree[:12]}")
    print(f"  cross-round ledger: "
          f"{f'{len(ledger)} chars (auto-assembled)' if ledger else '(empty -- no prior findings)'}")
    if len(artifact_paths) > 1:
        print(f"  discovery fan-out:  {len(results)}/{len(artifact_paths)} "
              "call(s) completed, lenses: "
              + ", ".join(
                  f"{k}={call_lenses[k - 1]}" for k, _ in results
              ))
    if len(results) == 1:
        print(f"  verifier model:     {results[0][1].model_name}")
    else:
        for call_index, result in results:
            print(f"  verifier (call {call_index}): {result.model_name}")
    print(f"  verdict:            {verdict}")
    if session_verdict != verdict:
        print(f"  session verdict:    {session_verdict} (prior discovery "
              "blockers stand unremediated -- a clean completeness-critic "
              "pass never settles them)")
    print(f"  blocking:           {'YES' if classification.blocking else 'no'}"
          f" ({classification.reason})")
    print(f"  findings:           {len(classification.blocking_issues)} blocking, "
          f"{len(classification.nit_issues)} minor/nit")
    if phase == PHASE_REMEDIATION_REVIEW:
        if fix_verdicts:
            counts = {token: 0 for token in (
                "fix-accepted", "fix-rejected", "accepted-with-modification",
            )}
            for fv in fix_verdicts:
                counts[fv["verdict"]] = counts.get(fv["verdict"], 0) + 1
            print(f"  fix verdicts:       "
                  f"{counts['fix-accepted']} accepted, "
                  f"{counts['fix-rejected']} rejected, "
                  f"{counts['accepted-with-modification']} "
                  "accepted-with-modification")
        else:
            print("  fix verdicts:       (none parsed -- consult the raw "
                  "artifact)")
    raw_names = ", ".join(
        str(artifact_paths[call_index - 1]) for call_index, _ in results
    )
    print(f"  raw output:         {raw_names}")
    if merged_issues:
        print(f"  structured issues:  {issues_path}")
    print(f"  disposition patch:  {disposition_path} "
          f"(verification_method=api, verification_verdict={session_verdict})")
    print(f"  cost:               ${total_cost:.4f}")

    set_dir_arg = str(session_set_dir)
    # This round now bears findings on disk when it is blocking, so it has
    # consumed one unit of its own budget (Set 111 S1: the same arithmetic
    # the pre-call refusal uses, so the printed next action can never
    # direct the orchestrator at a round the CLI will refuse).
    family_used = bound_status.prior_rounds + 1
    if classification.blocking:
        if phase == PHASE_DISCOVERY:
            if family_used >= PHASE_BOUND_DISCOVERY:
                print("\nNext action: BLOCKING findings in DISCOVERY, and "
                      f"the bounded {PHASE_BOUND_DISCOVERY} discovery "
                      "passes are now used -- a supplementary pass would be "
                      "REFUSED. Remediate the Critical/Major findings, "
                      f"write the s{session_number}-remediation-round-<R>.md "
                      "sidecar(s), then run the acceptance harness and "
                      "review the fix delta:")
                print(f"  python -m ai_router.acceptance_harness "
                      f"--session-set-dir {set_dir_arg} "
                      f"--round {round_number}")
                print(f"  python -m ai_router.verify_session "
                      f"--session-set-dir {set_dir_arg} "
                      "--phase remediation-review")
            else:
                print("\nNext action: BLOCKING findings in DISCOVERY -- run "
                      "the supplementary discovery pass BEFORE any "
                      "remediation (bounded and ENFORCED: at most "
                      f"{PHASE_BOUND_DISCOVERY} discovery passes total):")
                print(f"  python -m ai_router.verify_session "
                      f"--session-set-dir {set_dir_arg} --phase supplementary")
                print("  Then remediate the merged Critical/Major findings, "
                      f"write the s{session_number}-remediation-round-<R>.md "
                      "sidecar(s), run the acceptance harness for each "
                      "findings-bearing round, and review the fix delta:")
                print(f"  python -m ai_router.acceptance_harness "
                      f"--session-set-dir {set_dir_arg} "
                      f"--round {round_number}")
                print(f"  python -m ai_router.verify_session "
                      f"--session-set-dir {set_dir_arg} "
                      "--phase remediation-review")
        elif phase == PHASE_SUPPLEMENTARY:
            print("\nNext action: discovery is complete. Remediate the "
                  "merged Critical/Major findings from BOTH discovery "
                  f"passes, write the s{session_number}-remediation-round-"
                  "<R>.md sidecar(s), then run the acceptance harness for "
                  "each findings-bearing round and review the fix delta:")
            print(f"  python -m ai_router.acceptance_harness "
                  f"--session-set-dir {set_dir_arg} --round {round_number}")
            print(f"  python -m ai_router.verify_session --session-set-dir "
                  f"{set_dir_arg} --phase remediation-review")
        elif phase == PHASE_REMEDIATION_REVIEW:
            if family_used >= PHASE_BOUND_REMEDIATION_REVIEW:
                # Set 096 S2 printed this suspension; Set 111 S1 makes it
                # real -- the next cycle is refused before it can route.
                print(f"\nNext action: BLOCKING findings in the fix delta "
                      f"on remediation-review cycle {family_used} -- the "
                      f"bounded total ({PHASE_BOUND_REMEDIATION_REVIEW} "
                      "cycles) is reached. The loop SUSPENDS and another "
                      "cycle is now REFUSED: stop to the operator for "
                      "adjudication (accept / dismiss / third-provider "
                      "opinion). Persisting past the bound requires a "
                      "material Critical/Major and the operator's recorded "
                      "--operator-authorized-round attestation -- never "
                      "your own authority.")
            else:
                print("\nNext action: BLOCKING findings in the fix delta -- "
                      "remediate the rejected / new in-hunk findings, "
                      "update the remediation-note sidecar, then re-run:")
                print(f"  python -m ai_router.verify_session "
                      f"--session-set-dir {set_dir_arg} "
                      "--phase remediation-review")
                print("  (bounded and ENFORCED: at most "
                      f"{PHASE_BOUND_REMEDIATION_REVIEW} remediation-review "
                      "cycles; past that, stop to the operator for "
                      "adjudication -- never grind rounds.)")
        else:
            next_round = round_number + 1
            if family_used >= PHASE_BOUND_CLASSIC:
                print(f"\nNext action: BLOCKING findings on verification "
                      f"round {family_used} -- the bounded total "
                      f"({PHASE_BOUND_CLASSIC} automatic rounds) is "
                      "reached. The loop SUSPENDS and another round is now "
                      "REFUSED: stop to the operator for adjudication "
                      "(accept / dismiss / third-provider opinion), or "
                      "re-run with the operator's recorded "
                      "--operator-authorized-round attestation.")
            else:
                print("\nNext action: BLOCKING findings -- remediate each "
                      "Critical/Major finding, then re-verify:")
                print(
                    f"  python -m ai_router.verify_session --session-set-dir "
                    f"{set_dir_arg} --round {next_round} --complexity-hint 85"
                )
                print(
                    f"  (max {PHASE_BOUND_CLASSIC} automatic rounds, "
                    "ENFORCED; a 3rd round or an unfixed Critical/Major "
                    "stops to a human. Track findings in the cross-round "
                    "issue ledger -- do not resurrect settled points.)"
                )
        return EXIT_BLOCKING

    if supplementary_blockers_stand:
        print("\nNext action: this completeness-critic pass found nothing "
              "new, but the prior discovery round's Critical/Major findings "
              "still stand -- the SESSION remains blocking "
              "(disposition patched ISSUES_FOUND). Remediate them, write "
              f"the s{session_number}-remediation-round-<R>.md sidecar(s), "
              "then review the fix delta:")
        print(f"  python -m ai_router.verify_session --session-set-dir "
              f"{set_dir_arg} --phase remediation-review")
        return EXIT_BLOCKING

    # -- Set 111 S1: the severity-gated stop, made structural. A
    #    Minor-only round IS the stop under the consequence rubric
    #    (L-095-1) -- naming it as one, and printing only the close
    #    command, removes the "one more round to polish the nits"
    #    affordance the generic wording left open.
    if classification.nit_issues:
        print(f"\nNext action: MINOR-ONLY round -- "
              f"{len(classification.nit_issues)} Minor / unrated finding(s) "
              "and NO Critical/Major. Under the consequence rubric that is "
              "effectively VERIFIED, and it is the loop's STOP: do NOT open "
              "another verification round to polish Minors. Record them in "
              "the disposition notes (with an owner if any is worth "
              "carrying), then proceed to Step 8:")
    else:
        # A VERIFIED token drops NITS at the parser (only structured
        # blocking blocks survive), so this round may still carry nits in
        # its raw artifact. Say "no Critical/Major" -- which is true in
        # both cases -- rather than "no findings", which is not.
        print("\nNext action: VERIFIED -- no Critical/Major findings. "
              "Record any nits from the raw artifact, then proceed to "
              "Step 8:")
    print("  author the full disposition.json (preserving the patched "
          "verification fields), commit and push, then run:")
    print(
        f"  python -m ai_router.close_session --session-set-dir "
        f"{set_dir_arg}"
    )
    return EXIT_OK


def main(argv: Optional[List[str]] = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
