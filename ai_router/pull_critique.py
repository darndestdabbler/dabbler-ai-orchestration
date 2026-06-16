"""Set 067 S4 - optional automated producer of ``path-aware-critique.json``.

Experiment A (Set 067 S3) **confirmed** the path-aware capability: on identical
frozen code the first-party tool-loop adapter (:mod:`ai_router.pull_verifier`)
caught real, high-severity cross-file defects that snippet-fed routed
single-shot review structurally cannot see. The pre-registered S4 gate therefore
fires: wire the adapter as an **optional automated producer** of the Set 066
``path-aware-critique.json`` artifact that the close-out gate already validates.

This module is that producer. It runs the multi-provider path-aware critique by
driving :func:`ai_router.pull_verifier.pull_route` once per provider over a
read-only repository sandbox, then assembles the per-provider verdicts into the
Set 066 artifact envelope and writes it beside ``spec.md`` at the session-set
root. The artifact is exactly what
:func:`ai_router.path_aware_critique.validate_path_aware_critique_artifact`
checks, so a successful run satisfies a ``required`` close-out gate.

**Manual stays the default; this producer is strictly opt-in.** The operator
runs it explicitly (``python -m ai_router.pull_critique <set-dir>``); nothing in
the normal session flow invokes it. The manual GitHub-Copilot flow
(``ai_router/prompt-templates/path-aware-critique.md``) remains the
always-available fallback. The producer reuses that very template as its
critique instruction, so the automated and manual critiques ask the same
question - the only difference is who drives the tool loop.

Load-bearing properties inherited from the adapter and the Set 066 contract:

- **Multi-provider by construction.** The producer requires ``>= 2`` distinct
  providers to return a usable verdict, or it refuses to write a (gate-failing)
  single-provider artifact.
- **Deterministic servant + read-only + capped.** Every critique runs through
  :func:`pull_route`, so the servant returns raw ground truth, the sandbox is
  read-only, and turn/token/cost caps apply (the ``pull_verifier`` executor
  block in ``router-config.yaml``).
- **Identity-stamped.** The artifact self-declares ``sessionSetName`` (the set
  dir name) and the recorded ``pathAwareCritique`` level, so the close-out
  gate's identity check accepts it for *this* set under *this* policy.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, List, Optional, Sequence, Tuple, Union

try:  # package vs bare-import (mirrors the rest of ai_router)
    from .pull_verifier import (
        DiffConfig,
        PullCaps,
        PullResult,
        RunTestConfig,
        caps_from_config,
        pull_route,
    )
    from .path_aware_critique import (
        PATH_AWARE_CRITIQUE_ADVISORY,
        PATH_AWARE_CRITIQUE_ARTIFACT_FILENAME,
        PATH_AWARE_CRITIQUE_ARTIFACT_SCHEMA_VERSIONS,
        PATH_AWARE_CRITIQUE_NONE,
        PATH_AWARE_CRITIQUE_REQUIRED,
        read_path_aware_critique,
        validate_path_aware_critique_artifact,
    )
    from .blast_radius import classify_paths
    from .run_test_sandbox import run_test_caps_from_config
    from .config import load_config
except ImportError:  # pragma: no cover - test/bare context
    from pull_verifier import (  # type: ignore
        DiffConfig,
        PullCaps,
        PullResult,
        RunTestConfig,
        caps_from_config,
        pull_route,
    )
    from path_aware_critique import (  # type: ignore
        PATH_AWARE_CRITIQUE_ADVISORY,
        PATH_AWARE_CRITIQUE_ARTIFACT_FILENAME,
        PATH_AWARE_CRITIQUE_ARTIFACT_SCHEMA_VERSIONS,
        PATH_AWARE_CRITIQUE_NONE,
        PATH_AWARE_CRITIQUE_REQUIRED,
        read_path_aware_critique,
        validate_path_aware_critique_artifact,
    )
    from blast_radius import classify_paths  # type: ignore
    from run_test_sandbox import run_test_caps_from_config  # type: ignore
    from config import load_config  # type: ignore


# The default provider roster: GPT-5.4 + Gemini-Pro - the exact pair the manual
# flow uses and the pair Experiment A validated as the strong path-aware arms
# (B1/B2). Two DISTINCT providers, which is the Set 066 minimum. ``None`` model
# defers to the ``pull_verifier`` executor block's per-provider pin.
DEFAULT_PROVIDERS: Tuple[Tuple[str, Optional[str]], ...] = (
    ("openai", None),
    ("google", None),
)

# The artifact envelope schema version this producer emits. Pinned to the Set
# 066 contract's supported version so a producer/contract drift is a hard error
# here rather than a gate-time rejection.
_ARTIFACT_SCHEMA_VERSION = PATH_AWARE_CRITIQUE_ARTIFACT_SCHEMA_VERSIONS[0]


class PullCritiqueError(Exception):
    """The producer could not assemble a valid multi-provider artifact."""


@dataclass
class ProducerResult:
    """Outcome of :func:`produce_path_aware_critique`."""

    artifact: dict
    results: List[PullResult]
    written_to: Optional[Path]
    ok: bool
    reasons: Tuple[str, ...] = ()
    # Per-(provider, model) runs that did NOT yield a usable verdict, so the
    # operator can see which provider failed rather than only a count.
    skipped: Tuple[str, ...] = field(default_factory=tuple)


# ---------------------------------------------------------------------------
# Instruction building (reuse the manual template).
# ---------------------------------------------------------------------------

_PROMPT_MARKER = "=== PROMPT ==="

# Last-resort instruction if the shipped template cannot be located (e.g. a
# stripped install). Pulls ground truth and asks for an adversarial review -
# the load-bearing anti-bias property, minus the operator-facing scaffolding.
_FALLBACK_INSTRUCTION = (
    "You are an adversarial code-and-docs reviewer with full read access to a "
    "repository sandbox (session set {slug}). Use the read-only tools to open "
    "and read the actual files - do not assume contents. Find what is wrong, "
    "risky, incomplete, or internally inconsistent in this set's changes: "
    "correctness bugs, contract/cross-artifact drift, completeness gaps, and "
    "false confidence. For every claim of current behavior, verify it against "
    "the file on disk; where a summary and the code disagree, the repository "
    "wins. Then submit your verdict (VERIFIED or ISSUES_FOUND) with findings. "
    "Keep output ASCII-only.\n\n"
    "Change summary (verify, do not trust):\n{change_summary}\n\n"
    "Files changed:\n{files_changed}\n"
)


def _find_template() -> Optional[Path]:
    candidate = (
        Path(__file__).resolve().parent
        / "prompt-templates"
        / "path-aware-critique.md"
    )
    return candidate if candidate.is_file() else None


def _template_prompt_body() -> Optional[str]:
    """Return the fillable prompt body (after ``=== PROMPT ===``), or None."""
    tpl = _find_template()
    if tpl is None:
        return None
    try:
        text = tpl.read_text(encoding="utf-8")
    except OSError:
        return None
    idx = text.find(_PROMPT_MARKER)
    if idx == -1:
        return None
    return text[idx + len(_PROMPT_MARKER) :].strip()


def _read_spec_title(session_set_dir: Path) -> str:
    """Best-effort set title from the spec's first ``# ...`` heading."""
    spec = session_set_dir / "spec.md"
    if not spec.is_file():
        return session_set_dir.name
    try:
        for line in spec.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if stripped.startswith("# "):
                return stripped[2:].strip() or session_set_dir.name
    except OSError:
        pass
    return session_set_dir.name


def _read_disposition(session_set_dir: Path) -> dict:
    disp = session_set_dir / "disposition.json"
    if not disp.is_file():
        return {}
    try:
        data = json.loads(disp.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def build_instruction(session_set_dir: Union[str, Path]) -> str:
    """Build the path-aware critique instruction for a session set.

    Reuses the manual template's prompt body (so the automated and manual
    critiques ask the same adversarial question), filling the placeholders from
    the set's own ``spec.md`` title and ``disposition.json`` (the close-time
    change summary + files-changed list the orchestrator already wrote). Falls
    back to a self-contained instruction when the template is unavailable.

    Placeholder substitution uses ``str.replace`` (not ``str.format``) so the
    template's other literal braces are never misinterpreted.
    """
    set_dir = Path(session_set_dir)
    slug = set_dir.name
    title = _read_spec_title(set_dir)
    disp = _read_disposition(set_dir)
    # disposition.json is operator/tool-written JSON; ``summary`` is normally a
    # string but a malformed disposition could carry a non-string (dict / list /
    # number). Guard with isinstance so build_instruction never raises in
    # str.replace below and abort production before any provider runs (S4
    # dogfood finding 3).
    raw_summary = disp.get("summary")
    change_summary = (
        raw_summary
        if isinstance(raw_summary, str) and raw_summary.strip()
        else "(No close-time summary recorded; inspect spec.md and the "
        "change-log for what this set changed.)"
    )
    files = disp.get("files_changed")
    if isinstance(files, list) and files:
        files_changed = "\n".join(f"- {f}" for f in files if isinstance(f, str))
    else:
        files_changed = (
            "(No file list recorded; list_dir and grep the repository to find "
            "this set's changes.)"
        )
    claims_to_check = (
        "Verify each load-bearing claim in the set's spec.md, change-log, and "
        "any verification artifacts against the actual code on disk. Treat a "
        "claim of current behavior as unproven until you have read the file "
        "that implements it."
    )

    body = _template_prompt_body()
    if body is None:
        return _FALLBACK_INSTRUCTION.replace("{slug}", slug).replace(
            "{change_summary}", change_summary
        ).replace("{files_changed}", files_changed)

    return (
        body.replace("{set_title}", title)
        .replace("{session_set_slug}", slug)
        .replace("{change_summary}", change_summary)
        .replace("{files_changed}", files_changed)
        .replace("{claims_to_check}", claims_to_check)
    )


# ---------------------------------------------------------------------------
# The producer.
# ---------------------------------------------------------------------------


def _now_iso_local() -> str:
    """Local-time ISO-8601 with offset (matches the manual artifact examples)."""
    return datetime.now(timezone.utc).astimezone().isoformat()


def _default_sandbox_for(set_dir: Path) -> Path:
    """The default review sandbox: the git repo root containing ``set_dir``.

    A path-aware critique of a session set must be able to read the *whole
    repository the set lives in* (cross-file defects are the point), not
    whichever directory the operator happened to run from. Defaulting to
    ``Path.cwd()`` silently under-scoped the review when invoked from a
    subdirectory, yet the artifact still passed the close-out gate (the gate
    checks structure / identity, not the review surface) -- a
    gate-passing-but-under-scoped artifact (set-067 whole-set critique, GPT
    finding 2). Walk up from the resolved set dir to the nearest ``.git``;
    fall back to the set dir's top-most existing parent only if none is found.
    """
    cur = set_dir.resolve()
    for candidate in (cur, *cur.parents):
        if (candidate / ".git").exists():
            return candidate
    # No git root found (e.g. a non-repo fixture) -> the set dir itself, which
    # is always inside the review surface and never an unrelated cwd subtree.
    return cur


# Blast-radius budget factors (Set 069 S2): scale the loop budget to the set's
# blast radius so a high-blast set gets the FULL configured budget and a
# low-blast set probes less. Keyed off blast_radius.classify_paths' recommended
# value (required => high blast, advisory => code but low blast, none => docs/
# empty). This is the "turn/token caps per set, not a magic constant" lever the
# proposal (rung 3) calls for - the deeper read->run->read loop costs more, so
# its depth is earned by the change's blast radius rather than fixed.
_BLAST_RADIUS_BUDGET_FACTOR = {
    PATH_AWARE_CRITIQUE_REQUIRED: 1.0,
    PATH_AWARE_CRITIQUE_ADVISORY: 0.6,
    PATH_AWARE_CRITIQUE_NONE: 0.4,
}
# A loop needs a few turns to do anything useful even on a docs-only set.
_MIN_BUDGETED_TURNS = 4
# A token floor so a scaled budget never drops below a workable amount.
_MIN_BUDGETED_TOKENS = 20_000


def budget_caps_for_paths(
    changed_paths: Sequence[str],
    *,
    base_caps: Optional[PullCaps] = None,
    config: Optional[dict] = None,
) -> PullCaps:
    """Return :class:`PullCaps` scaled to the blast radius of ``changed_paths``.

    ``base_caps`` is the configured ceiling (defaults to
    :func:`caps_from_config`); the returned caps scale ``max_turns`` /
    ``token_budget`` / ``cost_ceiling_usd`` down by a factor chosen from the
    set's blast-radius classification, leaving ``max_output_tokens`` (the
    per-call ceiling) intact. A high-blast set (``required``) gets the full
    budget; a low-blast set probes less. Never raises; a non-string path is
    ignored.
    """
    base = base_caps if base_caps is not None else caps_from_config(config)
    paths = [str(p) for p in changed_paths if isinstance(p, str) and p.strip()]
    recommended = classify_paths(paths).recommended if paths else PATH_AWARE_CRITIQUE_NONE
    factor = _BLAST_RADIUS_BUDGET_FACTOR.get(recommended, 0.6)
    return PullCaps(
        max_turns=max(_MIN_BUDGETED_TURNS, int(round(base.max_turns * factor))),
        max_output_tokens=base.max_output_tokens,
        token_budget=max(
            _MIN_BUDGETED_TOKENS, int(base.token_budget * factor)
        ),
        cost_ceiling_usd=base.cost_ceiling_usd * factor,
    )


def produce_path_aware_critique(
    session_set_dir: Union[str, Path],
    *,
    providers: Sequence[Tuple[str, Optional[str]]] = DEFAULT_PROVIDERS,
    instruction: Optional[str] = None,
    sandbox_dir: Optional[Union[str, Path]] = None,
    level: Optional[str] = None,
    config: Optional[dict] = None,
    write: bool = True,
    run_test_config: Optional[RunTestConfig] = None,
    diff_config: Optional[DiffConfig] = None,
    caps: Optional[PullCaps] = None,
    run_pull: Callable[..., PullResult] = pull_route,
) -> ProducerResult:
    """Run a multi-provider path-aware critique and assemble the Set 066 artifact.

    Drives :func:`pull_route` once per ``(provider, model)`` in ``providers``
    over ``sandbox_dir`` (default: the **git repo root containing
    ``session_set_dir``** via :func:`_default_sandbox_for`, so a critic can read
    changed source anywhere in the tree -- NOT ``Path.cwd()``, which could
    silently under-scope the review), collects each usable verdict, and
    assembles the ``path-aware-critique.json`` envelope the Set 066 close-out
    gate validates.

    The producer **refuses to write a gate-failing artifact**: if fewer than two
    DISTINCT providers return a usable verdict (a schema-valid critique from a
    run that actually probed), ``ok`` is False, ``written_to`` is ``None``, and
    ``reasons`` explains which providers were skipped. This is the multi-provider
    invariant enforced at the source, not deferred to gate time.

    Parameters
    ----------
    level:
        The ``pathAwareCritique`` level stamped into the artifact. Defaults to
        the set's durable recorded policy (:func:`read_path_aware_critique`), so
        the artifact's level matches what the close-out gate's identity check
        expects.
    write:
        When True (default) and the artifact is valid, writes it to
        ``<session_set_dir>/path-aware-critique.json`` (utf-8, L-064-3). When
        False, assembles and validates but does not touch disk (a dry run).
    run_test_config:
        Set 069 S2 - when provided, the critics are offered the ``run_test``
        execution lane (the existing disposable-worktree cage): each critic may
        TRIGGER the operator-authored command(s) it carries (no model-authored
        argv), and a reproduced defect flows through the S1 evidence protocol
        (orchestrator-replayed, transcript-backed). Absent it, the loop is
        read-only - byte-for-byte the Set 067/068 behavior.
    diff_config:
        Set 069 S2 - when provided, the critics are offered the read-only
        ``get_diff`` tool (raw unified diff + changed paths over the
        operator-pinned ref range). Absent it, no diff tool is offered.
    caps:
        Per-run :class:`PullCaps`. Default ``None`` resolves the configured caps
        in :func:`pull_route`; but when an execution lane is active (a
        ``run_test_config`` or ``diff_config`` is passed) and no caps are given,
        the producer derives **blast-radius-budgeted** caps from the set's
        changed paths (:func:`budget_caps_for_paths`) so the deeper loop's depth
        is earned by the change's blast radius, not a magic constant.
    run_pull:
        Injection seam for the per-provider adapter call. Defaults to
        :func:`pull_route`; tests pass a fake so no metered call is made.
    """
    # Resolve to an absolute path BEFORE deriving the set name: an invocation
    # like ``.`` from inside the set, or a trailing slash / symlink, otherwise
    # yields an empty or wrong ``Path(...).name`` and the producer would stamp
    # an empty sessionSetName (rejected by the validator) or the wrong set's
    # name (S4 dogfood finding 1).
    set_dir = Path(session_set_dir).resolve()
    if not set_dir.is_dir():
        raise PullCritiqueError(f"session set dir is not a directory: {set_dir}")
    recorded_level = read_path_aware_critique(set_dir)
    if level is None:
        level = recorded_level
    if instruction is None:
        instruction = build_instruction(set_dir)
    if sandbox_dir is None:
        # The repo the set lives in -- NOT Path.cwd() (set-067 critique, GPT
        # finding 2). An explicit sandbox_dir override still wins.
        sandbox_dir = _default_sandbox_for(set_dir)

    # Set 069 S2: when an execution lane is active and the caller did not pin
    # caps, budget the loop by the set's blast radius (files_changed from the
    # disposition). This is the "deeper probing" depth lever - earned by blast
    # radius, not a magic constant. The read-only path (no execution lane) leaves
    # caps=None so pull_route resolves the configured ceiling, unchanged.
    exec_enabled = run_test_config is not None or diff_config is not None
    if caps is None and exec_enabled:
        cfg_for_caps = config if config is not None else load_config(
            os.environ.get("AI_ROUTER_CONFIG")
        )
        files = _read_disposition(set_dir).get("files_changed")
        changed_paths = files if isinstance(files, list) else []
        caps = budget_caps_for_paths(
            changed_paths, base_caps=caps_from_config(cfg_for_caps)
        )

    results: List[PullResult] = []
    critiques: List[dict] = []
    skipped: List[str] = []

    for provider, model in providers:
        label = f"{provider}/{model or '(config default)'}"
        try:
            result = run_pull(
                sandbox_dir,
                instruction,
                provider=provider,
                model=model,
                config=config,
                caps=caps,
                run_test_config=run_test_config,
                diff_config=diff_config,
            )
        except Exception as exc:  # a provider failure must not abort the others
            skipped.append(f"{label}: run raised {type(exc).__name__}: {exc}")
            continue
        results.append(result)
        if not result.ok or result.critique is None:
            why = (
                "zero tool calls (no probe ran)"
                if result.trace.zero_tool_calls
                else f"no schema-valid verdict (stop={result.trace.stop_reason})"
            )
            skipped.append(f"{label}: {why}")
            continue
        # The adapter stamps the REAL provider/model on the critique entry.
        # Distinctness (>= 2 distinct stamped providers) is enforced by
        # validate_path_aware_critique_artifact below, which keys off the
        # stamped ``provider`` -- so no separate accumulator is needed here.
        critiques.append(result.critique.to_critique_entry())

    artifact = {
        "schemaVersion": _ARTIFACT_SCHEMA_VERSION,
        "sessionSetName": set_dir.name,
        "pathAwareCritique": level,
        "critiquedAt": _now_iso_local(),
        "critiques": critiques,
    }

    # Validate the assembled envelope against the same runtime validator the
    # close-out gate uses, so "the producer says ok" means "the gate will say
    # ok". This catches a distinct-provider shortfall, a trivial-content entry,
    # or any envelope drift before anything is written.
    validation = validate_path_aware_critique_artifact(artifact)
    reasons: List[str] = []
    if not validation.ok:
        reasons.append(f"artifact invalid ({validation.code}): " + "; ".join(
            validation.reasons
        ))

    # Gate-identity guard for WRITE mode. The structural validator above is
    # identity-agnostic, but the close-out gate
    # (validate_path_aware_critique_gate) ALSO requires the artifact's level to
    # equal the set's recorded pathAwareCritique policy. An explicit ``level``
    # override that disagrees with the recorded policy would therefore be
    # written-but-gate-rejected, breaking the "refuses to write a gate-failing
    # artifact" guarantee. So in write mode the stamped level must match the
    # recorded policy; a deliberate override is allowed only for a dry run
    # (write=False), where nothing reaches disk (S4 verifier finding 1).
    gate_ok = True
    if write and level != recorded_level:
        gate_ok = False
        reasons.append(
            f"artifact level {level!r} does not match the set's recorded "
            f"pathAwareCritique policy {recorded_level!r}; writing it would "
            "fail the close-out gate's identity check. Use write=False / "
            "--dry-run to stamp a non-recorded level."
        )
    if skipped:
        reasons.extend(skipped)

    ok = validation.ok and gate_ok
    written_to: Optional[Path] = None
    if ok and write:
        out = set_dir / PATH_AWARE_CRITIQUE_ARTIFACT_FILENAME
        # L-064-3: write utf-8 to disk. indent=2 + trailing newline matches the
        # manual artifact shape; never edited after written (artifact discipline).
        out.write_text(
            json.dumps(artifact, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        written_to = out

    return ProducerResult(
        artifact=artifact,
        results=results,
        written_to=written_to,
        ok=ok,
        reasons=tuple(reasons),
        skipped=tuple(skipped),
    )


# ---------------------------------------------------------------------------
# CLI - the opt-in producer entrypoint.
# ---------------------------------------------------------------------------


def _ascii(text: object) -> str:
    """ASCII-safe rendering for CLI status (project-guidance Code Style).

    Dynamic fields (paths, provider/model strings, skip reasons, exception
    messages) can carry non-ASCII that crashes a Windows ``cp1252`` console.
    ``backslashreplace`` keeps the value visible while staying ASCII-only
    (S4 verifier finding 2).
    """
    return str(text).encode("ascii", "backslashreplace").decode("ascii")


def _parse_providers(specs: Optional[List[str]]) -> Tuple[Tuple[str, Optional[str]], ...]:
    """Parse ``--provider`` specs (``provider`` or ``provider:model``)."""
    if not specs:
        return DEFAULT_PROVIDERS
    out: List[Tuple[str, Optional[str]]] = []
    for spec in specs:
        if ":" in spec:
            provider, model = spec.split(":", 1)
            out.append((provider.strip(), model.strip() or None))
        else:
            out.append((spec.strip(), None))
    return tuple(out)


def _build_exec_configs(
    args, repo_root: str, config: Optional[dict]
) -> Tuple[Optional[RunTestConfig], Optional[DiffConfig]]:
    """Build the optional ``RunTestConfig`` / ``DiffConfig`` from CLI flags.

    Raises :class:`PullCritiqueError` on a misconfiguration (run_test requested
    without a pinned ref, or a malformed ``NAME=CMD``). A shell-style command
    string is ``shlex.split`` into an argv; no shell is ever invoked (the cage
    runs ``shell=False``), so this only tokenizes an operator-authored command.
    """
    import shlex

    run_test_config: Optional[RunTestConfig] = None
    if args.run_test_cmd or args.run_test_named:
        if not args.exec_ref:
            raise PullCritiqueError(
                "--run-test-cmd / --run-test-named requires --exec-ref (the "
                "pinned ref the cage checks out)"
            )
        command = (
            tuple(shlex.split(args.run_test_cmd)) if args.run_test_cmd else ()
        )
        commands: dict = {}
        for spec in args.run_test_named or []:
            if "=" not in spec:
                raise PullCritiqueError(
                    f"--run-test-named must be NAME=CMD, got {spec!r}"
                )
            name, cmd = spec.split("=", 1)
            name = name.strip()
            if not name:
                raise PullCritiqueError(
                    f"--run-test-named has an empty NAME: {spec!r}"
                )
            commands[name] = tuple(shlex.split(cmd))
        run_test_config = RunTestConfig(
            repo_root=repo_root,
            ref=args.exec_ref,
            command=command,
            commands=commands or None,
            caps=run_test_caps_from_config(config),
        )

    diff_config: Optional[DiffConfig] = None
    if args.diff_base:
        diff_config = DiffConfig(
            repo_root=repo_root,
            base_ref=args.diff_base,
            head_ref=args.diff_head or "",
        )
    return run_test_config, diff_config


def _main(argv: Optional[List[str]] = None) -> int:
    import argparse
    import sys

    parser = argparse.ArgumentParser(
        prog="python -m ai_router.pull_critique",
        description=(
            "Opt-in automated producer of path-aware-critique.json: runs a "
            "multi-provider path-aware critique via the first-party pull "
            "verifier and writes the Set 066 artifact (manual flow stays the "
            "default)."
        ),
    )
    parser.add_argument(
        "session_set_dir",
        help="the session-set directory (where the artifact is written)",
    )
    parser.add_argument(
        "--provider",
        action="append",
        metavar="PROVIDER[:MODEL]",
        help=(
            "a critic provider, optionally pinned to a model "
            "(e.g. openai:gpt-5.4 or google). Repeatable; >= 2 distinct "
            "providers required. Default: openai + google."
        ),
    )
    parser.add_argument(
        "--sandbox",
        default=None,
        help=(
            "read-only review sandbox (default: the git repo root containing "
            "the session-set dir)"
        ),
    )
    parser.add_argument(
        "--level",
        default=None,
        help=(
            "pathAwareCritique level to stamp (default: the set's recorded "
            "policy)"
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="assemble and validate but do not write the artifact",
    )
    # Set 069 S2: opt-in execution + diff lanes.
    parser.add_argument(
        "--run-test-cmd",
        default=None,
        metavar="CMD",
        help=(
            "enable the run_test execution lane with this DEFAULT command "
            "(a shell-style string shlex-split into an argv; NO shell is "
            "invoked - shell=False). Requires --exec-ref. The model can only "
            "TRIGGER this operator-authored command, never author one."
        ),
    )
    parser.add_argument(
        "--run-test-named",
        action="append",
        metavar="NAME=CMD",
        help=(
            "add a named operator-authored command the critic may SELECT by "
            "name (repeatable). Same shlex/no-shell rules as --run-test-cmd."
        ),
    )
    parser.add_argument(
        "--exec-ref",
        default=None,
        help=(
            "the pinned git ref the run_test cage checks out per run "
            "(e.g. a commit SHA or HEAD). Required to enable run_test."
        ),
    )
    parser.add_argument(
        "--exec-repo-root",
        default=None,
        help=(
            "repo root for run_test / get_diff (default: the resolved sandbox, "
            "i.e. the git repo root containing the set dir)"
        ),
    )
    parser.add_argument(
        "--diff-base",
        default=None,
        help=(
            "enable the read-only get_diff tool against this base ref "
            "(the 'from' side of the diff)"
        ),
    )
    parser.add_argument(
        "--diff-head",
        default="",
        help="the 'to' side of get_diff (default: the working tree)",
    )
    args = parser.parse_args(argv)

    providers = _parse_providers(args.provider)
    # Resolve the repo root for the execution / diff lanes (default: the set's
    # git repo root, the same surface the read-only review defaults to).
    set_dir_resolved = Path(args.session_set_dir).resolve()
    repo_root = (
        args.exec_repo_root
        or args.sandbox
        or str(_default_sandbox_for(set_dir_resolved))
    )
    try:
        cli_config = load_config(os.environ.get("AI_ROUTER_CONFIG"))
    except Exception:  # pragma: no cover - config load is best-effort for caps
        cli_config = None
    try:
        run_test_config, diff_config = _build_exec_configs(
            args, repo_root, cli_config
        )
    except PullCritiqueError as exc:
        print(f"ERROR: {_ascii(exc)}", file=sys.stderr)
        return 2

    try:
        result = produce_path_aware_critique(
            args.session_set_dir,
            providers=providers,
            sandbox_dir=args.sandbox,
            level=args.level,
            write=not args.dry_run,
            run_test_config=run_test_config,
            diff_config=diff_config,
        )
    except PullCritiqueError as exc:
        # ASCII-sanitize the error path too: a non-ASCII set path / message must
        # not crash a cp1252 console on exactly the failure path the guard exists
        # for (S4 dogfood finding 4).
        print(f"ERROR: {_ascii(exc)}", file=sys.stderr)
        return 2

    # ASCII-only status (project-guidance Code Style): every dynamic field is
    # run through _ascii so a non-ASCII path / provider string / exception
    # message cannot crash a cp1252 console (S4 verifier finding 2).
    provs = sorted({c["provider"] for c in result.artifact["critiques"]})
    print(
        f"providers={_ascii(provs)} "
        f"critiques={len(result.artifact['critiques'])} ok={result.ok}"
    )
    for note in result.skipped:
        print(f"  [skipped] {_ascii(note)}")
    if result.written_to is not None:
        print(f"Wrote {_ascii(result.written_to)}")
    elif args.dry_run and result.ok:
        print("[dry-run] artifact is valid; not written")
    if not result.ok:
        for reason in result.reasons:
            print(f"  [reason] {_ascii(reason)}", file=sys.stderr)
    return 0 if result.ok else 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(_main())
