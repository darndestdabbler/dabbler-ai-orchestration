"""Set 069 S3 - the probe-template lane (the proposal's "missing middle").

Set 069 S2 gave the automated pull-critique producer two execution lanes: it can
**trigger** an operator-authored ``run_test`` command (fixed argv, no model input)
and read the raw ``get_diff``. The next rung up the proposal ladder
(``docs/proposals/2026-06-16-pull-architecture-capabilities/proposal.md`` rung 4 /
spec S3) is the **probe-template lane**: operator-authored, **versioned** probe
harnesses the critic invokes with **typed, validated args**. The harness is
human-authored and stays inside the trusted-command model (it runs in the same
disposable-worktree cage as ``run_test``); the model supplies **only** typed
inputs - never code, never argv. This is the narrowest lane that finds
*novel-but-local* edge cases (e.g. "invoke this validator on malformed bytes",
"call this entrypoint with a bad parent dir") without arbitrary code execution -
the two 0.22.x bugs were exactly this shape.

The lane has three operator-authored parts, all here:

1. **Declarations.** A :class:`ProbeTemplate` is a versioned record naming the
   **real public entrypoint** it drives (meta-oracle: ``entrypoint_kind`` is one
   of :data:`evidence_protocol.PUBLIC_ENTRYPOINT_KINDS`) and its typed
   :class:`ArgSpec` inputs. The model picks a template id + supplies args; it
   never authors the probe.

2. **Typed-arg validation.** :func:`validate_template_args` coerces/validates the
   model's args against the declared specs (required-present, exact type,
   enum-membership, no unknown keys) and **never raises** - an invalid call comes
   back to the model as a raw ``ERROR:`` it can correct, exactly like a cage
   error.

3. **The harness (the driver).** The per-template probe bodies (:data:`_PROBES`)
   are run **inside the cage** as ``python -m ai_router.probe_templates --run
   <id> <json-args>`` (``__main__`` below). Because the cage's cwd is the
   disposable checkout, the driver imports the code **under review** from that
   worktree and drives its public entrypoint, printing a single **deterministic**
   ``PROBE_RESULT: ...`` line (no addresses / temp paths) so a pristine replay
   reproduces the same ``outputHash`` - the S1 falsifier contract. Exit code:
   ``1`` = the probe reproduced the defect (the entrypoint raised), ``0`` = the
   entrypoint was robust, ``2`` = a probe-internal error.

The cage-backed runner :func:`run_probe_template` builds the trusted argv and runs
it via :func:`ai_router.run_test_sandbox.run_test_in_cage` (pristine checkout,
crash-safe teardown, caps) - the same cage ``run_test`` uses. ``pull_verifier``
wires this as the ``run_probe_template`` tool and turns a clean template run into
an orchestrator-stamped, pristine-replayed, transcript-backed evidence-tiered
finding (templateId, per the Set 066 ``EvidenceTranscript`` ``oneOf``).

**Portability.** The *mechanism* (declaration + validation + cage harness) is
repo-portable; the **seed library** (:data:`BUILTIN_PROBE_TEMPLATES`) is authored
for *this* repo because it drives ``ai_router``'s own public entrypoints - the two
0.22.x bug classes. A consumer repo authors its own templates against its own
public entrypoints.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Sequence, Tuple, Union

try:  # package vs bare-import (mirrors the rest of ai_router)
    from .evidence_protocol import (
        ENTRYPOINT_PUBLIC_API,
        PUBLIC_ENTRYPOINT_KINDS,
    )
except ImportError:  # pragma: no cover - test/bare context
    from evidence_protocol import (  # type: ignore
        ENTRYPOINT_PUBLIC_API,
        PUBLIC_ENTRYPOINT_KINDS,
    )


# ---------------------------------------------------------------------------
# Declarations: typed arg specs + the versioned template record.
# ---------------------------------------------------------------------------

ARG_STRING = "string"
ARG_INT = "int"
ARG_BOOL = "bool"
ARG_ENUM = "enum"
ARG_TYPES = (ARG_STRING, ARG_INT, ARG_BOOL, ARG_ENUM)


@dataclass(frozen=True)
class ArgSpec:
    """One typed, validated input the model may supply to a probe template.

    ``type`` is one of :data:`ARG_TYPES`. ``choices`` enumerates the allowed
    values for an ``enum`` arg (ignored otherwise). A non-``required`` arg may be
    omitted (its absence is not an error). The validator coerces nothing silently:
    a value of the wrong JSON type is an error the model must fix.
    """

    name: str
    type: str
    required: bool = True
    choices: Tuple[str, ...] = ()
    description: str = ""

    def describe(self) -> str:
        """One-line human/agent-facing rendering for the tool description."""
        opt = "" if self.required else "?"
        choices = f" one of [{', '.join(self.choices)}]" if self.choices else ""
        desc = f" - {self.description}" if self.description else ""
        return f"{self.name}{opt} ({self.type}{choices}){desc}"


@dataclass(frozen=True)
class ProbeTemplate:
    """An operator-authored, versioned probe harness the critic may parameterize.

    The model selects ``template_id`` and supplies typed ``arg_specs`` inputs; it
    never authors the probe body or its argv. ``entrypoint_kind`` / ``entrypoint_ref``
    name the **real public entrypoint** the probe drives, stamped into the
    REPRODUCED transcript so the meta-oracle rule holds by construction (the probe
    must be ``entrypoint_kind in PUBLIC_ENTRYPOINT_KINDS``, never an agent harness).
    """

    template_id: str
    version: str
    description: str
    entrypoint_kind: str
    entrypoint_ref: str
    arg_specs: Tuple[ArgSpec, ...] = ()

    def describe(self) -> str:
        args = (
            "; ".join(a.describe() for a in self.arg_specs)
            if self.arg_specs
            else "(no args)"
        )
        return (
            f"{self.template_id} (v{self.version}): {self.description} "
            f"| drives {self.entrypoint_ref} | args: {args}"
        )


# ---------------------------------------------------------------------------
# Typed-arg validation (never raises; an invalid call is a raw ERROR to the model)
# ---------------------------------------------------------------------------


def validate_template_args(
    template: ProbeTemplate, raw_args: object
) -> Tuple[dict, List[str]]:
    """Validate the model's ``raw_args`` against ``template``'s declared specs.

    Returns ``(coerced, errors)``. ``coerced`` keeps only declared args, in
    declaration order, with values that passed type/enum checks. ``errors`` is a
    list of ASCII reasons (empty iff the args are valid). Rules:

    - ``raw_args`` must be an object (a missing/``None`` value is treated as ``{}``
      so a template with only optional args can be called with no args);
    - every ``required`` spec must be present;
    - each present value must match its spec's type exactly - ``string`` -> ``str``,
      ``int`` -> ``int`` (a ``bool`` is rejected: it is an ``int`` subclass but not
      an integer input), ``bool`` -> ``bool``, ``enum`` -> a ``str`` in ``choices``;
    - **unknown** keys (not a declared spec) are rejected, so the model cannot
      smuggle an undeclared input past the harness.

    Never raises.
    """
    errors: List[str] = []
    if raw_args is None:
        raw_args = {}
    if not isinstance(raw_args, dict):
        return {}, [f"args must be an object, got {type(raw_args).__name__}"]

    spec_by_name = {s.name: s for s in template.arg_specs}
    for key in raw_args:
        if key not in spec_by_name:
            errors.append(
                f"unknown arg {key!r} (template {template.template_id!r} declares: "
                f"{sorted(spec_by_name) or '(none)'})"
            )

    coerced: dict = {}
    for spec in template.arg_specs:
        if spec.name not in raw_args:
            if spec.required:
                errors.append(f"missing required arg {spec.name!r}")
            continue
        value = raw_args[spec.name]
        if spec.type == ARG_STRING:
            if not isinstance(value, str):
                errors.append(f"arg {spec.name!r} must be a string")
                continue
        elif spec.type == ARG_INT:
            if not isinstance(value, int) or isinstance(value, bool):
                errors.append(f"arg {spec.name!r} must be an integer")
                continue
        elif spec.type == ARG_BOOL:
            if not isinstance(value, bool):
                errors.append(f"arg {spec.name!r} must be a boolean")
                continue
        elif spec.type == ARG_ENUM:
            if not isinstance(value, str) or value not in spec.choices:
                errors.append(
                    f"arg {spec.name!r} must be one of {list(spec.choices)}"
                )
                continue
        else:  # pragma: no cover - guarded by the BUILTIN library's specs
            errors.append(f"arg {spec.name!r} has an unsupported spec type")
            continue
        coerced[spec.name] = value

    return coerced, errors


# ---------------------------------------------------------------------------
# The harness driver (runs INSIDE the cage; imports the code UNDER REVIEW).
#
# Each probe returns ``(exit_code, classification)``:
#   exit 1  -> reproduced (the entrypoint raised the defect being probed)
#   exit 0  -> robust     (the entrypoint handled the bad input gracefully)
#   exit 2  -> probe error (handled by the driver, not a finding)
# ``classification`` MUST be deterministic (no addresses / temp paths) so a
# pristine replay reproduces the same outputHash (the S1 falsifier contract).
# ---------------------------------------------------------------------------

PROBE_REPRODUCED_EXIT = 1
PROBE_ROBUST_EXIT = 0
PROBE_ERROR_EXIT = 2
PROBE_RESULT_PREFIX = "PROBE_RESULT: "

# Malformed payloads for the validator probe. ``invalid-utf8`` is the byte
# sequence that trips a reader catching only (OSError, JSONDecodeError) but NOT
# UnicodeError - the exact 0.22.x class. The others are JSON-shaped corruption a
# robust reader also must not crash on.
_CORRUPTION_BYTES: Dict[str, bytes] = {
    "invalid-utf8": b"\xff\xfe not valid utf-8 \x80\x81",
    "truncated-json": b'{"entries": [',
    "empty": b"",
}


def _import_under_review(module: str, name: str):
    """Import ``name`` from ``ai_router.<module>`` (the worktree copy under review).

    Under the cage the cwd is the disposable checkout, so ``ai_router`` resolves to
    the code under review; the dual import keeps the bare-sys.path test context
    working too.
    """
    try:
        mod = __import__(f"ai_router.{module}", fromlist=[name])
    except ImportError:  # pragma: no cover - bare/test sys.path
        mod = __import__(module, fromlist=[name])
    return getattr(mod, name)


def _probe_malformed_artifact_bytes(args: dict) -> Tuple[int, str]:
    """Drive the path-aware-critique artifact validator on a malformed-bytes file.

    Writes the corruption payload to a temp ``.json`` file and calls the PUBLIC
    ``validate_path_aware_critique_artifact`` (the close-out gate's reader). A
    reader that raises on the bad bytes is the defect (exit 1); one that returns a
    not-ok result is robust (exit 0). The classification is the exception TYPE
    NAME or the result's stable ``code`` - both deterministic across a replay.
    """
    corruption = args["corruption"]
    payload = _CORRUPTION_BYTES[corruption]
    validate = _import_under_review(
        "path_aware_critique", "validate_path_aware_critique_artifact"
    )
    fd, path = tempfile.mkstemp(suffix=".json", prefix="probe-artifact-")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(payload)
        try:
            result = validate(path)
        except Exception as exc:  # the defect: a reader that raises on bad input
            return PROBE_REPRODUCED_EXIT, (
                f"reproduced: validate_path_aware_critique_artifact raised "
                f"{type(exc).__name__} on {corruption} bytes"
            )
        return PROBE_ROBUST_EXIT, (
            f"robust: returned ok={getattr(result, 'ok', '?')} "
            f"code={getattr(result, 'code', '?')} on {corruption} bytes"
        )
    finally:
        try:
            os.unlink(path)
        except OSError:  # pragma: no cover - best-effort cleanup
            pass


def _probe_bad_parent_dir(args: dict) -> Tuple[int, str]:
    """Drive the run_test cage setup with a bad ``worktrees_parent``.

    Calls the PUBLIC ``run_test_in_cage`` with a parent dir that ``mkdtemp`` cannot
    create under (a nonexistent path, or a regular file used as a dir). The bad
    parent fails ``mkdtemp`` BEFORE any ``git worktree add``, so no nested worktree
    is created. A cage that lets the ``OSError`` escape is the defect (exit 1, the
    0.22.x mkdtemp-escaped-try/finally class); one that returns a clean error
    result is robust (exit 0).
    """
    mode = args["parent_mode"]
    run_test_in_cage = _import_under_review("run_test_sandbox", "run_test_in_cage")
    cleanup_file: Optional[str] = None
    if mode == "nonexistent":
        bad_parent = os.path.join(
            tempfile.gettempdir(), "probe-no-such-parent-xyzzy", "deeper"
        )
    else:  # file-as-dir: a path whose parent is a regular file
        fd, fpath = tempfile.mkstemp(prefix="probe-file-as-dir-")
        os.close(fd)
        cleanup_file = fpath
        bad_parent = os.path.join(fpath, "child")
    try:
        try:
            res = run_test_in_cage(
                os.getcwd(),
                "HEAD",
                (sys.executable, "-c", "pass"),
                worktrees_parent=bad_parent,
            )
        except Exception as exc:  # the defect: cage setup lets the OSError escape
            return PROBE_REPRODUCED_EXIT, (
                f"reproduced: run_test_in_cage raised {type(exc).__name__} on a "
                f"{mode} parent dir"
            )
        return PROBE_ROBUST_EXIT, (
            f"robust: ran={getattr(res, 'ran', '?')} "
            f"has_error={getattr(res, 'error', None) is not None} on a {mode} "
            "parent dir"
        )
    finally:
        if cleanup_file is not None:
            try:
                os.unlink(cleanup_file)
            except OSError:  # pragma: no cover - best-effort cleanup
                pass


# The per-template probe bodies, keyed by template id. Co-authored with the
# BUILTIN_PROBE_TEMPLATES declarations below (same ids).
_PROBES: Dict[str, Callable[[dict], Tuple[int, str]]] = {
    "malformed_artifact_bytes": _probe_malformed_artifact_bytes,
    "bad_parent_dir": _probe_bad_parent_dir,
}


# ---------------------------------------------------------------------------
# The seed library (repo-authored: drives ai_router's own public entrypoints).
# These are the templates that would have caught the two 0.22.x bugs.
# ---------------------------------------------------------------------------

BUILTIN_PROBE_TEMPLATES: Dict[str, ProbeTemplate] = {
    "malformed_artifact_bytes": ProbeTemplate(
        template_id="malformed_artifact_bytes",
        version="1",
        description=(
            "Feed malformed bytes to the path-aware-critique artifact validator "
            "and check it does not crash (the contract_gate/UnicodeError 0.22.x "
            "class: a reader catching only OSError/JSONDecodeError raises on "
            "invalid UTF-8)."
        ),
        entrypoint_kind=ENTRYPOINT_PUBLIC_API,
        entrypoint_ref="ai_router.path_aware_critique.validate_path_aware_critique_artifact",
        arg_specs=(
            ArgSpec(
                name="corruption",
                type=ARG_ENUM,
                required=True,
                choices=("invalid-utf8", "truncated-json", "empty"),
                description="the kind of malformed bytes to feed the validator",
            ),
        ),
    ),
    "bad_parent_dir": ProbeTemplate(
        template_id="bad_parent_dir",
        version="1",
        description=(
            "Call the run_test cage with a bad worktrees_parent and check it "
            "returns a clean error rather than letting mkdtemp's OSError escape "
            "(the 0.22.x run_test mkdtemp-escaped-try/finally class)."
        ),
        entrypoint_kind=ENTRYPOINT_PUBLIC_API,
        entrypoint_ref="ai_router.run_test_sandbox.run_test_in_cage",
        arg_specs=(
            ArgSpec(
                name="parent_mode",
                type=ARG_ENUM,
                required=True,
                choices=("nonexistent", "file-as-dir"),
                description="how the parent dir is made unusable for mkdtemp",
            ),
        ),
    ),
}


# ---------------------------------------------------------------------------
# The cage-backed runner (orchestrator side; offered as the run_probe_template
# tool by pull_verifier).
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProbeTemplateConfig:
    """Cage wiring for the ``run_probe_template`` tool (Set 069 S3).

    Mirrors :class:`ai_router.pull_verifier.RunTestConfig`: the git ``repo_root`` +
    pinned ``ref`` the disposable worktree is created from, the library of
    operator-authored templates the model may select among (defaults to
    :data:`BUILTIN_PROBE_TEMPLATES`), and the cage caps. The model supplies only a
    template id + typed args; it never authors the argv.
    """

    repo_root: str
    ref: str
    templates: Dict[str, ProbeTemplate] = field(
        default_factory=lambda: dict(BUILTIN_PROBE_TEMPLATES)
    )
    caps: Optional[object] = None  # run_test_sandbox.RunTestCaps; None -> default

    def get(self, template_id: Optional[str]) -> Optional[ProbeTemplate]:
        if not isinstance(template_id, str):
            return None
        return self.templates.get(template_id)


@dataclass(frozen=True)
class ProbeRun:
    """A clean probe-template cage run, for orchestrator-side evidence tagging."""

    template: ProbeTemplate
    args: dict
    argv: Tuple[str, ...]
    result: object  # run_test_sandbox.RunTestResult


def build_probe_argv(template_id: str, coerced_args: dict) -> Tuple[str, ...]:
    """The trusted argv that runs a probe template inside the cage.

    ``python -m ai_router.probe_templates --run <id> <json-args>`` - run from the
    cage's cwd (the disposable checkout) so the driver imports the code under
    review. Args are JSON-encoded with ``sort_keys=True`` so the argv (and thus the
    replay) is deterministic.
    """
    return (
        sys.executable,
        "-m",
        "ai_router.probe_templates",
        "--run",
        template_id,
        json.dumps(coerced_args, sort_keys=True),
    )


def run_probe_template(
    cfg: ProbeTemplateConfig, template_id: object, raw_args: object
) -> Tuple[str, bool, bool, Optional[ProbeRun]]:
    """Validate + run one probe-template call in the cage.

    Returns ``(rendered_text, is_error, elided, probe_run)``. ``probe_run`` is a
    :class:`ProbeRun` for a clean cage run (so a REPRODUCED claim can be replayed +
    transcript-backed), or ``None`` when the template is unknown, the args are
    invalid, or the cage errored / leaked (none of which can back a reproduction).
    An unknown template or invalid args come back as a raw ``ERROR:`` the model can
    correct - mirroring the cage's raw-error discipline.
    """
    template = cfg.get(template_id if isinstance(template_id, str) else None)
    if template is None:
        available = sorted(cfg.templates)
        return (
            f"ERROR: run_probe_template: unknown templateId {template_id!r}; "
            f"available: {available}",
            True,
            False,
            None,
        )
    coerced, errors = validate_template_args(template, raw_args)
    if errors:
        return (
            f"ERROR: run_probe_template: invalid args for {template.template_id!r}: "
            + "; ".join(errors),
            True,
            False,
            None,
        )

    try:  # the cage machinery (lazy import: dual package/bare context)
        from .run_test_sandbox import run_test_in_cage
    except ImportError:  # pragma: no cover - test/bare context
        from run_test_sandbox import run_test_in_cage  # type: ignore

    argv = build_probe_argv(template.template_id, coerced)
    res = run_test_in_cage(cfg.repo_root, cfg.ref, argv, caps=cfg.caps)
    content = res.render()
    is_error = content.startswith("ERROR: ")
    elided = "[... elided " in content
    probe_run: Optional[ProbeRun] = None
    # The probe's STANDARDIZED exit code is the defect signal: only exit 1
    # (PROBE_REPRODUCED_EXIT) means "this probe reproduced the defect". A clean
    # cage run that was ROBUST (exit 0 -> no defect found) or hit a PROBE-INTERNAL
    # ERROR (exit 2) must NOT back a REPRODUCED claim, even though its output
    # replays deterministically - there is no defect to reproduce (GPT-5.4 S3
    # verification, finding 1). The teardown-leak / cage-error guards stand too.
    if (
        res.ran
        and res.error is None
        and res.worktree_removed
        and res.exit_code == PROBE_REPRODUCED_EXIT
    ):
        probe_run = ProbeRun(
            template=template, args=coerced, argv=argv, result=res
        )
    # A probe-internal error (exit 2) ran cleanly but could not perform its
    # check; surface it as an error tool result so the model treats it as a
    # failed probe rather than a silent robust pass.
    if res.ran and res.error is None and res.exit_code == PROBE_ERROR_EXIT:
        is_error = True
    return content, is_error, elided, probe_run


# ---------------------------------------------------------------------------
# The in-cage driver entrypoint (python -m ai_router.probe_templates --run ...).
# ---------------------------------------------------------------------------


def _driver_main(argv: Optional[Sequence[str]] = None) -> int:
    """Dispatch one probe template by id; print a deterministic PROBE_RESULT line.

    Usage: ``--run <template_id> <json-args>``. Re-validates args (defense in
    depth; the orchestrator validated before building the argv). Output and exit
    code are the probe's; any driver/probe-internal failure is exit 2 with a
    deterministic message, never an uncaught traceback (which would carry
    non-deterministic addresses and break the replay-hash contract).
    """
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) != 3 or args[0] != "--run":
        print(f"{PROBE_RESULT_PREFIX}error: usage --run <template_id> <json-args>")
        return PROBE_ERROR_EXIT
    template_id = args[1]
    probe = _PROBES.get(template_id)
    template = BUILTIN_PROBE_TEMPLATES.get(template_id)
    if probe is None or template is None:
        print(f"{PROBE_RESULT_PREFIX}error: unknown template {template_id}")
        return PROBE_ERROR_EXIT
    try:
        raw = json.loads(args[2])
    except (ValueError, TypeError):
        print(f"{PROBE_RESULT_PREFIX}error: args is not valid JSON")
        return PROBE_ERROR_EXIT
    coerced, errors = validate_template_args(template, raw)
    if errors:
        print(f"{PROBE_RESULT_PREFIX}error: invalid args")
        return PROBE_ERROR_EXIT
    try:
        exit_code, classification = probe(coerced)
    except Exception as exc:  # never leak a traceback (non-deterministic)
        print(f"{PROBE_RESULT_PREFIX}error: probe crashed {type(exc).__name__}")
        return PROBE_ERROR_EXIT
    print(PROBE_RESULT_PREFIX + classification)
    return exit_code


if __name__ == "__main__":  # pragma: no cover - exercised as a subprocess
    raise SystemExit(_driver_main())
