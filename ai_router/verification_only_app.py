"""Set 072 (S2) - the verification-only application mode.

A thin orchestration over the Set 070/072 dual-surface machinery, pointable at an
**already-built external target repo**, that runs a configured **provider x surface
matrix** and emits two distinct outputs from ONE run:

1. ``verification-matrix-report.json`` - the *experimental* per-cell record. Each
   cell is one matrix-mode :func:`ai_router.dual_surface_verify.run_dual_surface`
   call (push provider x pull provider pairing) over the same committed state, with
   per-cell :class:`CellTelemetry` stamping every confound this set does NOT yet vary
   (orchestrator provider/model, the push/pull broker) alongside the ones it does
   (push & pull provider/model, per-arm framing strength, surfaces run, diff
   size/shape). This is the telemetry that - for the first time, on real diffs -
   measures how verification *provider* interacts with verification *surface* (the
   field-study finding the equal-arms instrument structurally cannot see).
2. ``remediation-report.{json,md}`` - the *fixer-facing* consolidated output. The
   verification we run during exploration **is** the verification; its findings must
   be usable for remediation **without the target re-running anything**. So every run
   consolidates its cells' findings via the Set 070 provenance merge
   (:func:`ai_router.dual_surface_verify.merge_findings`: push-only / pull-only /
   both), deduplicated by stable finding key, severity-ranked, with file/location /
   impact / evidence retained (in each contributor's verbatim description) and the
   experiment metadata dropped - the artifact the target repo remediates from.

**No new arm-execution logic.** This module *composes* ``run_dual_surface`` (matrix
mode) and the provenance merge; it never re-implements an arm. The dual-surface
runner stays the single home of the push/pull arms, the framing gate (L-069-2 -
held on BOTH arms even in matrix mode), and the equal-arms steelman default.

**Hermetic by construction.** Both the dual-surface runner and the diff dispatch are
injection seams (``run_dual_surface_fn`` / ``diff_dispatch_fn``); tests pass fakes so
no metered LLM call and no real git invocation happen.

The pure-Python validators (:func:`validate_matrix_report`,
:func:`validate_remediation_report`) mirror their schema docs and never raise
(L-066-1 produce<->validate parity).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, List, Optional, Sequence, Tuple, Union

try:  # package + bare-filename import shim (matches the test convention)
    from .dual_surface_verify import (
        PROVENANCE_BOTH,
        PROVENANCE_LABELS,
        SURFACE_PULL,
        SURFACE_PUSH,
        MergeResult,
        _is_int_not_bool,
        _is_nonempty_str_local,
        _severity_rank,
        _validate_merged_finding,
        merge_findings,
        run_dual_surface,
    )
    from .pull_verifier import DiffConfig, _dispatch_get_diff
except ImportError:  # pragma: no cover - test/bare context
    from dual_surface_verify import (  # type: ignore
        PROVENANCE_BOTH,
        PROVENANCE_LABELS,
        SURFACE_PULL,
        SURFACE_PUSH,
        MergeResult,
        _is_int_not_bool,
        _is_nonempty_str_local,
        _severity_rank,
        _validate_merged_finding,
        merge_findings,
        run_dual_surface,
    )
    from pull_verifier import DiffConfig, _dispatch_get_diff  # type: ignore


# A confound this set holds constant but stamps so later work stays comparable: no
# push/pull broker yet (a future track). Recorded literally so the telemetry is
# self-describing rather than silently absent.
BROKER_NONE = "none"

MATRIX_REPORT_KIND = "verification_matrix_report"
MATRIX_REPORT_SCHEMA_VERSIONS = (1,)
MATRIX_REPORT_SCHEMA_VERSION_CURRENT = 1
MATRIX_REPORT_FILENAME = "verification-matrix-report.json"

REMEDIATION_REPORT_KIND = "remediation_report"
REMEDIATION_REPORT_SCHEMA_VERSIONS = (1,)
REMEDIATION_REPORT_SCHEMA_VERSION_CURRENT = 1
REMEDIATION_REPORT_JSON_FILENAME = "remediation-report.json"
REMEDIATION_REPORT_MD_FILENAME = "remediation-report.md"

# Stable machine tokens for the validator results.
REPORT_OK = "report-ok"
REPORT_NOT_AN_OBJECT = "report-not-an-object"
REPORT_BAD_SCHEMA_VERSION = "report-bad-schema-version"
REPORT_BAD_STRUCTURE = "report-bad-structure"


# ---------------------------------------------------------------------------
# Matrix specification: rows -> (push x pull) pairings
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class MatrixRow:
    """One surface roster entry: a provider (optionally model-pinned) for a surface."""

    surface: str  # SURFACE_PUSH / SURFACE_PULL
    provider: str
    model: Optional[str] = None


@dataclass(frozen=True)
class MatrixCell:
    """One provider x surface pairing - exactly one matrix-mode dual-surface run.

    The push arm runs ``push_provider``/``push_model``; the pull arm runs
    ``pull_provider``/``pull_model``. A cell is ALWAYS a matrix-mode run (both
    per-arm providers are set), so it is a per-cell instrument and NEVER RETIRE
    telemetry - the dual-surface scorer rejects a matrix artifact by construction.
    """

    push_provider: str
    pull_provider: str
    push_model: Optional[str] = None
    pull_model: Optional[str] = None

    @property
    def label(self) -> str:
        p = f"{self.push_provider}/{self.push_model or '(default)'}"
        q = f"{self.pull_provider}/{self.pull_model or '(default)'}"
        return f"push={p} pull={q}"


class VerificationOnlyError(Exception):
    """The verification-only matrix could not be assembled (bad config / no cells)."""


def pair_matrix_rows(rows: Sequence[MatrixRow]) -> Tuple[MatrixCell, ...]:
    """Group surface rows into the (push x pull) cross-product of cells.

    Every push roster entry is paired with every pull roster entry. Requires at
    least one push row AND one pull row (a cell needs both surfaces); raises
    :class:`VerificationOnlyError` otherwise so a misconfigured matrix fails loudly
    rather than silently running zero cells.
    """
    push_rows = [r for r in rows if r.surface == SURFACE_PUSH]
    pull_rows = [r for r in rows if r.surface == SURFACE_PULL]
    if not push_rows or not pull_rows:
        raise VerificationOnlyError(
            "a verification matrix needs at least one push row AND one pull row; "
            f"got push={len(push_rows)} pull={len(pull_rows)}"
        )
    cells: List[MatrixCell] = []
    for pr in push_rows:
        for ql in pull_rows:
            cells.append(
                MatrixCell(
                    push_provider=pr.provider,
                    pull_provider=ql.provider,
                    push_model=pr.model,
                    pull_model=ql.model,
                )
            )
    return tuple(cells)


# ---------------------------------------------------------------------------
# Diff shape (computed ONCE per run - the committed state is shared by all cells)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class DiffShape:
    """The size/shape of the committed diff under verification (shared by all cells)."""

    bytes: int
    lines: int
    files: int
    elided: bool

    def to_dict(self) -> dict:
        return {
            "bytes": self.bytes,
            "lines": self.lines,
            "files": self.files,
            "elided": self.elided,
        }


def _measure_diff(
    target_repo: Path,
    *,
    base_ref: str,
    head_ref: str,
    diff_dispatch_fn: Callable[[DiffConfig], Tuple[str, bool, bool]],
) -> DiffShape:
    """Measure the committed diff's size/shape via the runner's existing dispatch.

    Uses the SAME ``_dispatch_get_diff`` the dual-surface push arm uses, so the
    stamped shape describes exactly the snippet the push arm reviewed. A diff-error
    (non-repo / bad ref) collapses to a zeroed shape rather than raising - the
    per-cell ``run_dual_surface`` call surfaces the real error for that cell.
    """
    cfg = DiffConfig(repo_root=str(target_repo), base_ref=base_ref, head_ref=head_ref)
    snippet, is_error, elided = diff_dispatch_fn(cfg)
    if is_error or not isinstance(snippet, str):
        return DiffShape(bytes=0, lines=0, files=0, elided=False)
    return DiffShape(
        bytes=len(snippet),
        lines=snippet.count("\n"),
        files=snippet.count("diff --git "),
        elided=bool(elided),
    )


# ---------------------------------------------------------------------------
# Per-cell telemetry: stamps every confound (composes the run attestation)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class CellTelemetry:
    """Every confound stamped for one matrix cell - varied AND held-constant.

    Composes the dual-surface run's attestation (no duplication): the push/pull
    provider/model and per-arm framing strength are READ FROM the run attestation
    (the measured identities, not a re-assertion). The orchestrator provider/model
    and the broker fields are confounds this set holds CONSTANT but records, so a
    later set that varies them keeps comparable telemetry.
    """

    orchestrator_provider: str
    orchestrator_model: str
    push_provider: str
    push_model: str
    pull_provider: str
    pull_model: str
    push_framing: str
    pull_framing: str
    surfaces: Tuple[str, ...]
    diff_bytes: int
    diff_lines: int
    diff_files: int
    diff_elided: bool
    push_broker: str = BROKER_NONE
    pull_broker: str = BROKER_NONE

    def to_dict(self) -> dict:
        return {
            "orchestratorProvider": self.orchestrator_provider,
            "orchestratorModel": self.orchestrator_model,
            "pushProvider": self.push_provider,
            "pushModel": self.push_model,
            "pullProvider": self.pull_provider,
            "pullModel": self.pull_model,
            "pushFraming": self.push_framing,
            "pullFraming": self.pull_framing,
            "surfaces": list(self.surfaces),
            "diffBytes": self.diff_bytes,
            "diffLines": self.diff_lines,
            "diffFiles": self.diff_files,
            "diffElided": self.diff_elided,
            "pushBroker": self.push_broker,
            "pullBroker": self.pull_broker,
        }


def _framing_strength(attestation: dict, key: str) -> str:
    block = attestation.get(key)
    if isinstance(block, dict):
        strength = block.get("strength")
        if isinstance(strength, str):
            return strength
    return ""


def _cell_telemetry(
    run,
    *,
    orchestrator_provider: str,
    orchestrator_model: str,
    diff_shape: DiffShape,
) -> CellTelemetry:
    att = run.attestation if isinstance(run.attestation, dict) else {}
    return CellTelemetry(
        orchestrator_provider=orchestrator_provider,
        orchestrator_model=orchestrator_model,
        push_provider=att.get("pushProvider", "") if isinstance(att.get("pushProvider"), str) else "",
        push_model=att.get("pushModel", "") if isinstance(att.get("pushModel"), str) else "",
        pull_provider=att.get("pullProvider", "") if isinstance(att.get("pullProvider"), str) else "",
        pull_model=att.get("pullModel", "") if isinstance(att.get("pullModel"), str) else "",
        push_framing=_framing_strength(att, "pushFraming"),
        pull_framing=_framing_strength(att, "pullFraming"),
        surfaces=(SURFACE_PUSH, SURFACE_PULL),
        diff_bytes=diff_shape.bytes,
        diff_lines=diff_shape.lines,
        diff_files=diff_shape.files,
        diff_elided=diff_shape.elided,
        push_broker=BROKER_NONE,
        pull_broker=BROKER_NONE,
    )


# ---------------------------------------------------------------------------
# Cell result + the whole-run report
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class CellResult:
    """One cell's outcome: the per-cell provenance merge + telemetry + raw arm findings.

    ``push_findings`` / ``pull_findings`` are the RAW arm findings (Set-066 Finding
    shape) preserved so :func:`build_remediation_report` can re-merge them across
    cells. ``merge`` is the per-cell provenance merge (the experimental per-cell
    view the matrix report records).
    """

    cell: MatrixCell
    telemetry: CellTelemetry
    push_findings: Tuple[dict, ...]
    pull_findings: Tuple[dict, ...]
    merge: MergeResult
    push_verdict: str
    pull_verdict: str
    pull_ok: bool

    def to_dict(self) -> dict:
        return {
            "telemetry": self.telemetry.to_dict(),
            "pushVerdict": self.push_verdict,
            "pullVerdict": self.pull_verdict,
            "pullOk": self.pull_ok,
            "provenanceComplete": self.merge.provenance_complete,
            "pushUnkeyed": self.merge.push_unkeyed,
            "pullUnkeyed": self.merge.pull_unkeyed,
            "findings": [f.to_dict() for f in self.merge.findings],
        }


@dataclass(frozen=True)
class SkippedCell:
    """A cell whose dual-surface run raised - recorded, never silently dropped."""

    push_provider: str
    pull_provider: str
    reason: str

    def to_dict(self) -> dict:
        return {
            "pushProvider": self.push_provider,
            "pullProvider": self.pull_provider,
            "reason": self.reason,
        }


@dataclass(frozen=True)
class VerificationOnlyReport:
    """The whole verification-only run: the per-cell experimental record."""

    target: str
    committed_ref: str
    generated_at: str
    orchestrator_provider: str
    orchestrator_model: str
    diff_shape: DiffShape
    cells: Tuple[CellResult, ...]
    skipped: Tuple[SkippedCell, ...] = ()

    def to_dict(self) -> dict:
        out = {
            "schemaVersion": MATRIX_REPORT_SCHEMA_VERSION_CURRENT,
            "kind": MATRIX_REPORT_KIND,
            "target": self.target,
            "committedRef": self.committed_ref,
            "generatedAt": self.generated_at,
            "orchestrator": {
                "provider": self.orchestrator_provider,
                "model": self.orchestrator_model,
            },
            "diffShape": self.diff_shape.to_dict(),
            "cells": [c.to_dict() for c in self.cells],
        }
        if self.skipped:
            out["skipped"] = [s.to_dict() for s in self.skipped]
        return out


def run_verification_matrix(
    target_repo: Union[str, Path],
    *,
    base_ref: str,
    head_ref: str = "",
    matrix: Sequence[MatrixCell],
    orchestrator_provider: str,
    orchestrator_model: str,
    generated_at: str,
    push_template: Optional[str] = None,
    pull_template: Optional[str] = None,
    config: Optional[dict] = None,
    caps: Optional[object] = None,
    diff_dispatch_fn: Optional[Callable[[DiffConfig], Tuple[str, bool, bool]]] = None,
    run_dual_surface_fn: Optional[Callable[..., object]] = None,
) -> VerificationOnlyReport:
    """Run the provider x surface matrix over an external built target. No arm logic.

    For each :class:`MatrixCell` it makes ONE matrix-mode ``run_dual_surface`` call,
    pointed at the **external** ``target_repo`` via the runner's ``sandbox_dir`` seam,
    with the cell's per-arm push/pull providers/models. The committed diff is shared
    by all cells, so it is measured ONCE (:func:`_measure_diff`) and stamped into
    every cell's :class:`CellTelemetry`. A cell whose run raises is recorded as a
    :class:`SkippedCell` and the matrix continues (one provider failure never aborts
    the others - the producer-skip discipline, L-067-1).

    ``generated_at`` is passed in (the caller stamps the timestamp) so this stays
    pure/deterministic. ``run_dual_surface_fn`` / ``diff_dispatch_fn`` are injection
    seams; tests pass fakes so no metered call and no real git invocation happen.
    """
    # Resolve the injection seams from the MODULE globals at call time (not bound
    # at def time) so a test can monkeypatch ``run_dual_surface`` / ``_dispatch_get_diff``
    # on the module and the CLI's default path picks the fake up.
    if run_dual_surface_fn is None:
        run_dual_surface_fn = run_dual_surface
    if diff_dispatch_fn is None:
        diff_dispatch_fn = _dispatch_get_diff

    target = Path(target_repo).resolve()
    if not target.is_dir():
        raise VerificationOnlyError(f"target repo is not a directory: {target}")
    cells = tuple(matrix)
    if not cells:
        raise VerificationOnlyError("the verification matrix has no cells")

    diff_shape = _measure_diff(
        target, base_ref=base_ref, head_ref=head_ref, diff_dispatch_fn=diff_dispatch_fn
    )

    results: List[CellResult] = []
    skipped: List[SkippedCell] = []
    committed_ref = f"{base_ref}..{head_ref}" if head_ref else f"{base_ref}..WORKTREE"

    for cell in cells:
        try:
            run = run_dual_surface_fn(
                target,
                base_ref=base_ref,
                head_ref=head_ref,
                provider=cell.push_provider,
                push_provider=cell.push_provider,
                pull_provider=cell.pull_provider,
                push_model=cell.push_model,
                pull_model=cell.pull_model,
                # Point BOTH arms' surface at the EXTERNAL target via the runner's
                # sandbox_dir seam - the load-bearing "verify a built target" hook.
                sandbox_dir=target,
                push_template=push_template,
                pull_template=pull_template,
                config=config,
                caps=caps,
            )
        except Exception as exc:  # one cell's failure must not abort the matrix
            skipped.append(
                SkippedCell(
                    push_provider=cell.push_provider,
                    pull_provider=cell.pull_provider,
                    reason=f"{type(exc).__name__}: {exc}",
                )
            )
            continue

        push_findings = tuple(run.push.issues or ())
        pull_findings = tuple(run.pull.findings or ())
        merge = merge_findings(list(push_findings), list(pull_findings))
        telemetry = _cell_telemetry(
            run,
            orchestrator_provider=orchestrator_provider,
            orchestrator_model=orchestrator_model,
            diff_shape=diff_shape,
        )
        # Prefer the run's own committedRef (honest WORKTREE labeling) when present.
        committed_ref = getattr(run, "committed_ref", committed_ref) or committed_ref
        results.append(
            CellResult(
                cell=cell,
                telemetry=telemetry,
                push_findings=push_findings,
                pull_findings=pull_findings,
                merge=merge,
                push_verdict=run.push.verdict,
                pull_verdict=run.pull.verdict,
                pull_ok=bool(run.pull.ok),
            )
        )

    return VerificationOnlyReport(
        target=target.name,
        committed_ref=committed_ref,
        generated_at=generated_at,
        orchestrator_provider=orchestrator_provider,
        orchestrator_model=orchestrator_model,
        diff_shape=diff_shape,
        cells=tuple(results),
        skipped=tuple(skipped),
    )


# ---------------------------------------------------------------------------
# verification-matrix-report.json validator (L-066-1 parity, never raises)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ReportValidationResult:
    """Outcome of a report validator. Never-raising contract."""

    ok: bool
    code: str
    reasons: Tuple[str, ...] = ()


_MATRIX_TOP_KEYS = {
    "schemaVersion", "kind", "target", "committedRef", "generatedAt",
    "orchestrator", "diffShape", "cells", "skipped",
}
_TELEMETRY_KEYS = {
    "orchestratorProvider", "orchestratorModel", "pushProvider", "pushModel",
    "pullProvider", "pullModel", "pushFraming", "pullFraming", "surfaces",
    "diffBytes", "diffLines", "diffFiles", "diffElided", "pushBroker", "pullBroker",
}
_DIFF_SHAPE_KEYS = {"bytes", "lines", "files", "elided"}
_CELL_KEYS = {
    "telemetry", "pushVerdict", "pullVerdict", "pullOk", "provenanceComplete",
    "pushUnkeyed", "pullUnkeyed", "findings",
}
_SKIPPED_KEYS = {"pushProvider", "pullProvider", "reason"}
_SURFACES = (SURFACE_PUSH, SURFACE_PULL)

# Telemetry string fields: stamped honestly, may be empty (e.g. an unknown
# orchestrator) but MUST be a string when present.
_TELEMETRY_STR_FIELDS = (
    "orchestratorProvider", "orchestratorModel", "pushProvider", "pushModel",
    "pullProvider", "pullModel", "pushFraming", "pullFraming", "pushBroker",
    "pullBroker",
)
_TELEMETRY_INT_FIELDS = ("diffBytes", "diffLines", "diffFiles")


def _is_nonneg_int(value: object) -> bool:
    return _is_int_not_bool(value) and value >= 0


def _validate_diff_shape(obj: object, where: str) -> List[str]:
    reasons: List[str] = []
    if not isinstance(obj, dict):
        return [f"{where} is missing or not an object"]
    extra = sorted(set(obj) - _DIFF_SHAPE_KEYS)
    if extra:
        reasons.append(f"{where} has unexpected key(s): {extra}")
    for key in ("bytes", "lines", "files"):
        if not _is_nonneg_int(obj.get(key)):
            reasons.append(f"{where}.{key} must be a non-negative integer")
    if not isinstance(obj.get("elided"), bool):
        reasons.append(f"{where}.elided must be a boolean")
    return reasons


def _validate_telemetry(obj: object, where: str) -> List[str]:
    reasons: List[str] = []
    if not isinstance(obj, dict):
        return [f"{where} is missing or not an object"]
    extra = sorted(set(obj) - _TELEMETRY_KEYS)
    if extra:
        reasons.append(f"{where} has unexpected key(s): {extra}")
    for key in _TELEMETRY_STR_FIELDS:
        if not isinstance(obj.get(key), str):
            reasons.append(f"{where}.{key} must be a string")
    for key in _TELEMETRY_INT_FIELDS:
        if not _is_nonneg_int(obj.get(key)):
            reasons.append(f"{where}.{key} must be a non-negative integer")
    if not isinstance(obj.get("diffElided"), bool):
        reasons.append(f"{where}.diffElided must be a boolean")
    # A cell is DEFINITIONALLY a dual-surface run, so it always ran BOTH surfaces;
    # the producer can never emit anything else. Enforce exactly {push, pull} (no
    # missing surface, no duplicate) rather than "any non-empty subset" - a
    # single-surface or duplicated-surface telemetry row is incomparable data that
    # the validator must reject to hold produce<->validate parity (L-066-1).
    surfaces = obj.get("surfaces")
    if not isinstance(surfaces, list) or not surfaces:
        reasons.append(f"{where}.surfaces must be a non-empty array")
    elif any(s not in _SURFACES for s in surfaces):
        reasons.append(f"{where}.surfaces entries must be one of {list(_SURFACES)}")
    elif len(surfaces) != len(set(surfaces)):
        reasons.append(f"{where}.surfaces contains duplicate entries: {surfaces}")
    elif set(surfaces) != set(_SURFACES):
        reasons.append(f"{where}.surfaces must be exactly {list(_SURFACES)} "
                       "(a cell always runs both surfaces)")
    return reasons


def _validate_cell(
    obj: object,
    index: int,
    *,
    expected_orchestrator: Optional[dict] = None,
    expected_diff_shape: Optional[dict] = None,
) -> List[str]:
    where = f"cells[{index}]"
    if not isinstance(obj, dict):
        return [f"{where} is not an object"]
    reasons: List[str] = []
    extra = sorted(set(obj) - _CELL_KEYS)
    if extra:
        reasons.append(f"{where} has unexpected key(s): {extra}")
    reasons.extend(_validate_telemetry(obj.get("telemetry"), f"{where}.telemetry"))
    for key in ("pushVerdict", "pullVerdict"):
        if not isinstance(obj.get(key), str):
            reasons.append(f"{where}.{key} must be a string")
    for key in ("pullOk", "provenanceComplete"):
        if not isinstance(obj.get(key), bool):
            reasons.append(f"{where}.{key} must be a boolean")
    for key in ("pushUnkeyed", "pullUnkeyed"):
        if not _is_nonneg_int(obj.get(key)):
            reasons.append(f"{where}.{key} must be a non-negative integer")
    findings = obj.get("findings")
    if not isinstance(findings, list):
        reasons.append(f"{where}.findings must be an array")
    else:
        for i, finding in enumerate(findings):
            reasons.extend(
                _prefix(_validate_merged_finding(finding, i), where)
            )
        # provenanceComplete must be consistent with the cell's own findings +
        # counts (the SAME one-way checks validate_comparison_artifact applies, so
        # the cell validator is no looser than its dual-surface sibling, L-066-1):
        # a complete merge has no unkeyed finding and zero unkeyed counts.
        pc = obj.get("provenanceComplete")
        if pc is True:
            if any(isinstance(f, dict) and not f.get("defectKey") for f in findings):
                reasons.append(f"{where}.provenanceComplete is true but at least one "
                               "finding is unkeyed")
            pu, qu = obj.get("pushUnkeyed"), obj.get("pullUnkeyed")
            if (_is_int_not_bool(pu) and pu != 0) or (_is_int_not_bool(qu) and qu != 0):
                reasons.append(f"{where}.provenanceComplete is true but "
                               "pushUnkeyed/pullUnkeyed is nonzero")

    # The diff and orchestrator are run-level confounds the producer copies into
    # every cell (one dual-surface run over one shared diff); a cell that disagrees
    # with the run-level values is incoherent telemetry. Enforce the cross-field
    # invariant the producer always holds (the Set-070 surfaces-consistency
    # precedent), so a hand-edited / buggy artifact cannot carry per-cell confound
    # drift that silently mixes incomparable data.
    telemetry = obj.get("telemetry")
    if isinstance(telemetry, dict):
        if isinstance(expected_orchestrator, dict):
            if telemetry.get("orchestratorProvider") != expected_orchestrator.get("provider"):
                reasons.append(f"{where}.telemetry.orchestratorProvider does not match "
                               "the run-level orchestrator.provider")
            if telemetry.get("orchestratorModel") != expected_orchestrator.get("model"):
                reasons.append(f"{where}.telemetry.orchestratorModel does not match "
                               "the run-level orchestrator.model")
        if isinstance(expected_diff_shape, dict):
            for tel_key, ds_key in (
                ("diffBytes", "bytes"), ("diffLines", "lines"),
                ("diffFiles", "files"), ("diffElided", "elided"),
            ):
                if telemetry.get(tel_key) != expected_diff_shape.get(ds_key):
                    reasons.append(f"{where}.telemetry.{tel_key} does not match the "
                                   f"run-level diffShape.{ds_key}")
    return reasons


def _prefix(reasons: List[str], where: str) -> List[str]:
    # _validate_merged_finding reports against "findings[i]"; re-root under the cell.
    return [f"{where}.{r}" for r in reasons]


def _validate_skipped(obj: object, index: int) -> List[str]:
    where = f"skipped[{index}]"
    if not isinstance(obj, dict):
        return [f"{where} is not an object"]
    reasons: List[str] = []
    extra = sorted(set(obj) - _SKIPPED_KEYS)
    if extra:
        reasons.append(f"{where} has unexpected key(s): {extra}")
    for key in ("pushProvider", "pullProvider", "reason"):
        if not _is_nonempty_str_local(obj.get(key)):
            reasons.append(f"{where}.{key} is missing or empty")
    return reasons


def validate_matrix_report(
    report: object, *, expected_target: Optional[str] = None
) -> ReportValidationResult:
    """Validate a ``verification-matrix-report.json`` artifact. Never raises.

    Mirrors :func:`ai_router.dual_surface_verify.validate_comparison_artifact`:
    closed envelope (``schemaVersion`` int-not-bool in
    :data:`MATRIX_REPORT_SCHEMA_VERSIONS`, ``kind`` fixed, non-empty ``target`` /
    ``committedRef`` / ``generatedAt``), an ``orchestrator`` object, the
    ``diffShape``, and every cell's telemetry + merged findings (the provenance
    invariants reused from the dual-surface merged-finding validator, L-066-1).
    """
    if not isinstance(report, dict):
        return ReportValidationResult(
            ok=False, code=REPORT_NOT_AN_OBJECT, reasons=("report is not an object",)
        )
    version = report.get("schemaVersion")
    if not _is_int_not_bool(version) or version not in MATRIX_REPORT_SCHEMA_VERSIONS:
        return ReportValidationResult(
            ok=False, code=REPORT_BAD_SCHEMA_VERSION,
            reasons=(f"schemaVersion must be one of "
                     f"{list(MATRIX_REPORT_SCHEMA_VERSIONS)} (integer)",),
        )
    if report.get("kind") != MATRIX_REPORT_KIND:
        return ReportValidationResult(
            ok=False, code=REPORT_BAD_STRUCTURE,
            reasons=(f"kind must be {MATRIX_REPORT_KIND!r}",),
        )
    target = report.get("target")
    if not _is_nonempty_str_local(target):
        return ReportValidationResult(
            ok=False, code=REPORT_BAD_STRUCTURE,
            reasons=("target is missing or empty",),
        )
    if expected_target is not None and target != expected_target:
        return ReportValidationResult(
            ok=False, code=REPORT_BAD_STRUCTURE,
            reasons=(f"target {target!r} does not match the expected target "
                     f"({expected_target!r})",),
        )

    reasons: List[str] = []
    extra = sorted(set(report) - _MATRIX_TOP_KEYS)
    if extra:
        reasons.append(f"unexpected top-level key(s): {extra}")
    for key in ("committedRef", "generatedAt"):
        if not _is_nonempty_str_local(report.get(key)):
            reasons.append(f"{key} is missing or empty")
    orch = report.get("orchestrator")
    if not isinstance(orch, dict):
        reasons.append("orchestrator is missing or not an object")
    else:
        orch_extra = sorted(set(orch) - {"provider", "model"})
        if orch_extra:
            reasons.append(f"orchestrator has unexpected key(s): {orch_extra}")
        for key in ("provider", "model"):
            if not isinstance(orch.get(key), str):
                reasons.append(f"orchestrator.{key} must be a string")
    reasons.extend(_validate_diff_shape(report.get("diffShape"), "diffShape"))

    # The run-level confounds each cell must echo consistently (only cross-checked
    # when the run-level values are themselves well-formed dicts).
    expected_orchestrator = orch if isinstance(orch, dict) else None
    expected_diff_shape = report.get("diffShape")
    expected_diff_shape = expected_diff_shape if isinstance(expected_diff_shape, dict) else None

    cells = report.get("cells")
    if not isinstance(cells, list):
        reasons.append("cells must be an array")
    else:
        for i, cell in enumerate(cells):
            reasons.extend(_validate_cell(
                cell, i,
                expected_orchestrator=expected_orchestrator,
                expected_diff_shape=expected_diff_shape,
            ))

    if "skipped" in report:
        skipped = report.get("skipped")
        if not isinstance(skipped, list):
            reasons.append("skipped, when present, must be an array")
        else:
            for i, s in enumerate(skipped):
                reasons.extend(_validate_skipped(s, i))

    if reasons:
        return ReportValidationResult(
            ok=False, code=REPORT_BAD_STRUCTURE, reasons=tuple(reasons)
        )
    return ReportValidationResult(ok=True, code=REPORT_OK)


# ---------------------------------------------------------------------------
# The fixer-facing remediation report (consolidate cells across the whole run)
# ---------------------------------------------------------------------------

def build_remediation_report(
    report: VerificationOnlyReport, *, generated_at: Optional[str] = None
) -> dict:
    """Consolidate a run's cell findings into the fixer-facing remediation report.

    Gathers EVERY cell's raw push and pull findings, runs the Set 070 provenance
    merge ONCE across the whole run (so a defect a cell caught on both surfaces is
    one ``both`` entry, keyed defects dedup across cells, unkeyed findings stay
    safely over-split), severity-ranks the merged findings (Critical > Major >
    Minor > unspecified, stable within a rank), and drops every experiment confound
    (telemetry / provider / framing / diff) - leaving file/location / impact /
    evidence in each contributor's verbatim description. This is the artifact a
    target repo remediates from **without re-running verification**.
    """
    all_push: List[dict] = []
    all_pull: List[dict] = []
    for cell in report.cells:
        all_push.extend(cell.push_findings)
        all_pull.extend(cell.pull_findings)
    merge = merge_findings(all_push, all_pull)
    # Stable severity rank: sort by descending severity, preserving merge order
    # (keyed-both first, then keyed-single, then unkeyed) within a rank.
    ranked = sorted(
        merge.findings, key=lambda f: _severity_rank(f.severity), reverse=True
    )
    return {
        "schemaVersion": REMEDIATION_REPORT_SCHEMA_VERSION_CURRENT,
        "kind": REMEDIATION_REPORT_KIND,
        "target": report.target,
        "committedRef": report.committed_ref,
        "generatedAt": generated_at if generated_at is not None else report.generated_at,
        "provenanceComplete": merge.provenance_complete,
        "pushUnkeyed": merge.push_unkeyed,
        "pullUnkeyed": merge.pull_unkeyed,
        "findings": [f.to_dict() for f in ranked],
    }


_REMEDIATION_TOP_KEYS = {
    "schemaVersion", "kind", "target", "committedRef", "generatedAt",
    "provenanceComplete", "pushUnkeyed", "pullUnkeyed", "findings",
}


def validate_remediation_report(report: object) -> ReportValidationResult:
    """Validate a ``remediation-report.json`` artifact. Never raises.

    L-066-1 parity with :func:`build_remediation_report`: the closed envelope, the
    int-not-bool schema version, the provenance-complete / unkeyed-count
    consistency, and each finding via the shared merged-finding validator (so the
    provenance invariants - a ``both`` finding must be keyed and cover both surfaces
    - hold here exactly as they do for the comparison artifact).
    """
    if not isinstance(report, dict):
        return ReportValidationResult(
            ok=False, code=REPORT_NOT_AN_OBJECT, reasons=("report is not an object",)
        )
    version = report.get("schemaVersion")
    if not _is_int_not_bool(version) or version not in REMEDIATION_REPORT_SCHEMA_VERSIONS:
        return ReportValidationResult(
            ok=False, code=REPORT_BAD_SCHEMA_VERSION,
            reasons=(f"schemaVersion must be one of "
                     f"{list(REMEDIATION_REPORT_SCHEMA_VERSIONS)} (integer)",),
        )
    if report.get("kind") != REMEDIATION_REPORT_KIND:
        return ReportValidationResult(
            ok=False, code=REPORT_BAD_STRUCTURE,
            reasons=(f"kind must be {REMEDIATION_REPORT_KIND!r}",),
        )
    if not _is_nonempty_str_local(report.get("target")):
        return ReportValidationResult(
            ok=False, code=REPORT_BAD_STRUCTURE, reasons=("target is missing or empty",)
        )

    reasons: List[str] = []
    extra = sorted(set(report) - _REMEDIATION_TOP_KEYS)
    if extra:
        reasons.append(f"unexpected top-level key(s): {extra}")
    for key in ("committedRef", "generatedAt"):
        if not _is_nonempty_str_local(report.get(key)):
            reasons.append(f"{key} is missing or empty")
    if not isinstance(report.get("provenanceComplete"), bool):
        reasons.append("provenanceComplete must be a boolean")
    for key in ("pushUnkeyed", "pullUnkeyed"):
        if not _is_nonneg_int(report.get(key)):
            reasons.append(f"{key} must be a non-negative integer")

    findings = report.get("findings")
    if not isinstance(findings, list):
        reasons.append("findings must be an array")
    else:
        for i, finding in enumerate(findings):
            reasons.extend(_validate_merged_finding(finding, i))
        pc = report.get("provenanceComplete")
        unkeyed_present = any(
            isinstance(f, dict) and not f.get("defectKey") for f in findings
        )
        if pc is True and unkeyed_present:
            reasons.append("provenanceComplete is true but at least one finding is "
                           "unkeyed (an unkeyed finding means the merge is not "
                           "provenance-complete)")
    # provenanceComplete must also be consistent with the recorded unkeyed counts.
    pc = report.get("provenanceComplete")
    pu = report.get("pushUnkeyed")
    qu = report.get("pullUnkeyed")
    if pc is True and (
        (_is_int_not_bool(pu) and pu != 0) or (_is_int_not_bool(qu) and qu != 0)
    ):
        reasons.append("provenanceComplete is true but pushUnkeyed/pullUnkeyed is "
                       "nonzero (an unkeyed finding means the merge is not "
                       "provenance-complete)")

    if reasons:
        return ReportValidationResult(
            ok=False, code=REPORT_BAD_STRUCTURE, reasons=tuple(reasons)
        )
    return ReportValidationResult(ok=True, code=REPORT_OK)


def render_remediation_markdown(report: dict) -> str:
    """Render the remediation report as a human-readable, ASCII-only Markdown doc.

    The fixer-facing view: each finding by descending severity, its provenance
    (which surface[s] caught it), and every contributor's verbatim description
    (where the file/location / impact / evidence live). ASCII-only per the project
    Code Style convention (the .md is utf-8 on disk, but the content stays ASCII so
    a console echo never crashes a cp1252 terminal).
    """
    lines: List[str] = []
    target = report.get("target", "(unknown)")
    lines.append(f"# Remediation report - {target}")
    lines.append("")
    lines.append(f"- committed ref: {report.get('committedRef', '')}")
    lines.append(f"- generated at: {report.get('generatedAt', '')}")
    pc = report.get("provenanceComplete")
    lines.append(f"- provenance complete: {pc}")
    if pc is not True:
        lines.append(
            f"- NOTE: provenance is incomplete "
            f"(pushUnkeyed={report.get('pushUnkeyed')}, "
            f"pullUnkeyed={report.get('pullUnkeyed')}); a defect both surfaces "
            "caught but neither keyed appears as two separate entries."
        )
    findings = report.get("findings")
    findings = findings if isinstance(findings, list) else []
    lines.append(f"- findings: {len(findings)}")
    lines.append("")
    if not findings:
        lines.append("No findings to remediate.")
        return _ascii("\n".join(lines) + "\n")
    for i, f in enumerate(findings, start=1):
        if not isinstance(f, dict):
            continue
        sev = f.get("severity") or "(unspecified)"
        prov = f.get("provenance", "")
        cat = f.get("category") or "(uncategorized)"
        key = f.get("defectKey") or "(unkeyed)"
        lines.append(f"## {i}. [{sev}] {cat} - {prov}")
        lines.append(f"- defect key: {key}")
        surfaces = f.get("surfaces")
        if isinstance(surfaces, list):
            lines.append(f"- surfaces: {', '.join(str(s) for s in surfaces)}")
        contributors = f.get("contributors")
        if isinstance(contributors, list):
            for c in contributors:
                if not isinstance(c, dict):
                    continue
                surface = c.get("surface", "?")
                desc = c.get("description", "")
                lines.append(f"- ({surface}) {desc}")
        lines.append("")
    return _ascii("\n".join(lines) + "\n")


# ---------------------------------------------------------------------------
# Writers + CLI
# ---------------------------------------------------------------------------

def _ascii(text: object) -> str:
    """ASCII-safe rendering (project-guidance Code Style; mirrors pull_critique._ascii)."""
    return str(text).encode("ascii", "backslashreplace").decode("ascii")


def write_reports(
    report: VerificationOnlyReport,
    *,
    matrix_report_path: Path,
    remediation_dir: Optional[Path] = None,
    generated_at: Optional[str] = None,
) -> Tuple[Path, Path, Path]:
    """Write the matrix report (json) + the remediation report (json + md).

    Returns ``(matrix_report_path, remediation_json_path, remediation_md_path)``.
    The remediation files land next to the matrix report unless ``remediation_dir``
    overrides. All writes are utf-8 (L-064-3); the .md is utf-8 with ASCII content.
    """
    matrix_report_path = Path(matrix_report_path)
    matrix_report_path.write_text(
        json.dumps(report.to_dict(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    out_dir = Path(remediation_dir) if remediation_dir is not None else matrix_report_path.parent
    remediation = build_remediation_report(report, generated_at=generated_at)
    rem_json = out_dir / REMEDIATION_REPORT_JSON_FILENAME
    rem_md = out_dir / REMEDIATION_REPORT_MD_FILENAME
    rem_json.write_text(
        json.dumps(remediation, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    rem_md.write_text(render_remediation_markdown(remediation), encoding="utf-8")
    return matrix_report_path, rem_json, rem_md


def parse_cell_specs(specs: Optional[List[str]]) -> Tuple[MatrixRow, ...]:
    """Parse ``--cell SURFACE:PROVIDER[:MODEL]`` specs into surface rows.

    Raises :class:`VerificationOnlyError` on a malformed spec (unknown surface, no
    provider) so a typo fails loudly rather than silently dropping a row.
    """
    rows: List[MatrixRow] = []
    for spec in specs or []:
        parts = spec.split(":")
        surface = parts[0].strip() if parts else ""
        if surface not in _SURFACES:
            raise VerificationOnlyError(
                f"--cell surface must be one of {list(_SURFACES)}, got {surface!r} "
                f"(spec {spec!r}); use e.g. push:anthropic or pull:google:gemini-2.5-pro"
            )
        provider = parts[1].strip() if len(parts) > 1 else ""
        if not provider:
            raise VerificationOnlyError(
                f"--cell {spec!r} has no provider; use SURFACE:PROVIDER[:MODEL]"
            )
        model = parts[2].strip() if len(parts) > 2 and parts[2].strip() else None
        rows.append(MatrixRow(surface=surface, provider=provider, model=model))
    return tuple(rows)


def main(argv: Optional[List[str]] = None) -> int:
    """CLI entry (``python -m ai_router.verification_only_app``). Never calls sys.exit.

    Subcommand ``run`` points the matrix at an external built target and writes both
    the ``verification-matrix-report.json`` and the consolidated
    ``remediation-report.{json,md}``. ASCII-only status; returns an int.
    """
    import argparse
    from datetime import datetime, timezone

    parser = argparse.ArgumentParser(
        prog="python -m ai_router.verification_only_app",
        description=(
            "Verification-only application mode (Set 072): run a provider x surface "
            "matrix over a built target and emit per-cell telemetry + a consolidated "
            "fixer-facing remediation report."
        ),
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_run = sub.add_parser("run", help="run the provider x surface matrix over a target")
    p_run.add_argument("--target", required=True, help="the external built target repo")
    p_run.add_argument("--base", required=True, help="base ref (the 'from' side of the diff)")
    p_run.add_argument("--head", default="", help="head ref (default: the working tree)")
    p_run.add_argument(
        "--cell", action="append", metavar="SURFACE:PROVIDER[:MODEL]",
        help="a surface roster entry (repeatable); push x pull cross-product = the matrix",
    )
    p_run.add_argument("--orchestrator-provider", default="", help="this run's orchestrator provider (stamped)")
    p_run.add_argument("--orchestrator-model", default="", help="this run's orchestrator model (stamped)")
    p_run.add_argument(
        "--out", default=MATRIX_REPORT_FILENAME,
        help=f"path for the matrix report json (default: {MATRIX_REPORT_FILENAME})",
    )

    args = parser.parse_args(argv)

    if args.command == "run":
        try:
            rows = parse_cell_specs(args.cell)
            cells = pair_matrix_rows(rows)
        except VerificationOnlyError as exc:
            print(f"[ ] bad matrix: {_ascii(exc)}")
            return 2
        generated_at = datetime.now(timezone.utc).astimezone().isoformat()
        try:
            report = run_verification_matrix(
                args.target,
                base_ref=args.base,
                head_ref=args.head,
                matrix=cells,
                orchestrator_provider=args.orchestrator_provider,
                orchestrator_model=args.orchestrator_model,
                generated_at=generated_at,
            )
        except VerificationOnlyError as exc:
            print(f"[ ] could not run the matrix: {_ascii(exc)}")
            return 2
        out_path = Path(args.out)
        matrix_path, rem_json, rem_md = write_reports(
            report, matrix_report_path=out_path
        )
        print(f"[x] target={_ascii(report.target)} cells={len(report.cells)} "
              f"skipped={len(report.skipped)}")
        for s in report.skipped:
            print(f"    [skipped] push={_ascii(s.push_provider)} "
                  f"pull={_ascii(s.pull_provider)}: {_ascii(s.reason)}")
        print(f"    wrote {_ascii(matrix_path)}")
        print(f"    wrote {_ascii(rem_json)}")
        print(f"    wrote {_ascii(rem_md)}")
        return 0

    return 2  # pragma: no cover - argparse requires a subcommand


__all__ = [
    # matrix spec
    "MatrixRow",
    "MatrixCell",
    "VerificationOnlyError",
    "pair_matrix_rows",
    "parse_cell_specs",
    # diff shape + telemetry
    "DiffShape",
    "CellTelemetry",
    "BROKER_NONE",
    # results + run
    "CellResult",
    "SkippedCell",
    "VerificationOnlyReport",
    "run_verification_matrix",
    # matrix report
    "MATRIX_REPORT_KIND",
    "MATRIX_REPORT_SCHEMA_VERSIONS",
    "MATRIX_REPORT_SCHEMA_VERSION_CURRENT",
    "MATRIX_REPORT_FILENAME",
    "ReportValidationResult",
    "validate_matrix_report",
    # remediation report
    "REMEDIATION_REPORT_KIND",
    "REMEDIATION_REPORT_SCHEMA_VERSIONS",
    "REMEDIATION_REPORT_JSON_FILENAME",
    "REMEDIATION_REPORT_MD_FILENAME",
    "build_remediation_report",
    "validate_remediation_report",
    "render_remediation_markdown",
    "write_reports",
    "main",
]


if __name__ == "__main__":  # pragma: no cover - CLI entry
    import sys

    raise SystemExit(main(sys.argv[1:]))
