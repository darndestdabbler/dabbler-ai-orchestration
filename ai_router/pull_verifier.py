"""Set 067 - first-party tool-loop "pull" verifier adapter (``pull_route``).

This module is the production hardening of the Set 065 spike
(``docs/session-sets/065-verification-surface-empirics/spike_first_party_adapter.py``).
It ships a ``route()``-**parallel** agentic seam in which the *verifier* drives
a tool-use loop and the orchestrator is a **deterministic servant** answering
read-only tool calls with **raw ground truth** (file bytes / raw grep lines /
a directory listing) - never a model-summarized view.

Why a new seam and not a new "provider kind" in ``route()``: ``route()`` /
:func:`ai_router.providers.call_model` is single-shot text-in/text-out (one
POST, one ``APIResult``, no loop). A pull verifier is a multi-turn agentic
executor. They are different control structures, so this is a first-class
entrypoint, not a branch inside ``route()``. The two share only the provider
*config* block (``api_key_env`` / ``base_url`` / ``timeout_seconds`` / ...).

The full design contract is pinned in
``docs/session-sets/067-pull-verifier-adapter-experiment-a/tool-contract.md``.
Session 1 ships the loop driver, caps, the **Anthropic** ``tool_use`` binding,
the sandbox-confined read-only servant, the forced verdict matching the Set 066
``path-aware-critique.json`` critique-entry shape, and tool-call-trace
instrumentation. Session 2 adds the OpenAI / Gemini bindings behind the **same**
driver; Session 4 wires the artifact producer.

Load-bearing invariants:

- **Deterministic servant.** Every tool result is raw ground truth. The driver
  independently re-derives ground truth from the canonical functions and
  asserts byte-equality (or a raw slice for an elided result); a servant that
  summarizes raises :class:`DeterministicServantViolation` - a hard failure.
- **Read-only + sandbox-confined.** The registry has no write tool, and every
  path is confined to the sandbox by :func:`_safe`.
- **Capped + instrumented.** Every run enforces turn / token / cost caps and
  emits a tool-call trace. A run that produces a verdict with **zero** probe
  calls is a failed run (``zero_tool_calls``), not a fast one.
"""

from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple, Union

try:  # package vs bare-import (mirrors the rest of ai_router)
    from .evidence_protocol import (
        ENTRYPOINT_TEST,
        EVIDENCE_HYPOTHESIS,
        EVIDENCE_REPRODUCED,
        authoritative_tier,
        hash_output,
    )
except ImportError:  # pragma: no cover - test/bare context
    from evidence_protocol import (  # type: ignore
        ENTRYPOINT_TEST,
        EVIDENCE_HYPOTHESIS,
        EVIDENCE_REPRODUCED,
        authoritative_tier,
        hash_output,
    )


# ---------------------------------------------------------------------------
# Result / trace data model (the stable surface S2 bindings + S3 harness bind
# to). See tool-contract.md sections 4-5.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Finding:
    """One critique finding - the Set 066 ``$defs/Finding`` shape.

    Set 069 S2 adds the evidence-protocol fields ``evidence_tier`` and
    ``transcript``. They are **orchestrator-stamped** post-hoc (never the agent's
    self-report) by :func:`_stamp_evidence_tiers` and are purely additive: an
    ASSERTED finding (the read-only default) carries neither field, so a read-only
    critique entry is byte-for-byte the Set 067/068 shape. ``evidence_tier`` is
    serialized as the on-disk ``evidenceTier`` key the Set 066 artifact validator
    (S1-extended) checks, and ``transcript`` is the falsifier transcript a
    REPRODUCED finding must carry.
    """

    description: str
    severity: str = ""
    category: str = ""
    evidence_tier: str = ""  # "" => default ASSERTED (no on-disk field)
    transcript: Optional[dict] = None  # falsifier transcript for REPRODUCED

    def to_dict(self) -> dict:
        out: dict = {"description": self.description}
        if self.severity:
            out["severity"] = self.severity
        if self.category:
            out["category"] = self.category
        # Evidence fields are emitted ONLY when set, so an ASSERTED finding stays
        # byte-identical to a pre-069 entry (the field is additive).
        if self.evidence_tier:
            out["evidenceTier"] = self.evidence_tier
        if self.transcript is not None:
            out["transcript"] = self.transcript
        return out


@dataclass(frozen=True)
class PullCritique:
    """The forced structured verdict - the Set 066 ``$defs/Critique`` entry.

    ``provider`` / ``model`` are stamped by the adapter (the verifier never
    reports its own identity); ``verdict`` / ``summary`` / ``findings`` come
    from the forced ``submit_verdict`` tool call.
    """

    provider: str
    model: str
    verdict: str
    summary: str
    findings: Tuple[Finding, ...] = ()

    def to_critique_entry(self) -> dict:
        """Render as a ``path-aware-critique.json`` critique entry (Set 066)."""
        return {
            "provider": self.provider,
            "model": self.model,
            "verdict": self.verdict,
            "summary": self.summary,
            "findings": [f.to_dict() for f in self.findings],
        }


@dataclass
class ToolCallRecord:
    """One probe tool call, for the instrumentation trace."""

    turn: int
    name: str
    args: dict
    raw: bool
    elided: bool
    result_chars: int
    error: bool


# Stop reasons (ASCII machine tokens).
STOP_VERDICT = "verdict"
STOP_MAX_TURNS = "max-turns"
STOP_TOKEN_BUDGET = "token-budget"
STOP_COST_CEILING = "cost-ceiling"
STOP_NO_VERDICT = "no-verdict"


@dataclass
class PullTrace:
    """Instrumentation proving probes actually run, not merely afforded."""

    tool_calls: List[ToolCallRecord] = field(default_factory=list)
    api_turns: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    wall_seconds: float = 0.0
    stop_reason: str = STOP_NO_VERDICT

    @property
    def tool_call_count(self) -> int:
        """Probe calls only (``submit_verdict`` is control, not a probe)."""
        return len(self.tool_calls)

    @property
    def zero_tool_calls(self) -> bool:
        """True when no probe ran - a FAILED run, not a fast one."""
        return self.tool_call_count == 0

    def to_dict(self) -> dict:
        return {
            "tool_calls": [
                {
                    "turn": tc.turn,
                    "name": tc.name,
                    "args": tc.args,
                    "raw": tc.raw,
                    "elided": tc.elided,
                    "result_chars": tc.result_chars,
                    "error": tc.error,
                }
                for tc in self.tool_calls
            ],
            "api_turns": self.api_turns,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "cost_usd": round(self.cost_usd, 6),
            "wall_seconds": round(self.wall_seconds, 2),
            "stop_reason": self.stop_reason,
            "tool_call_count": self.tool_call_count,
            "zero_tool_calls": self.zero_tool_calls,
        }


@dataclass
class PullResult:
    """The outcome of one :func:`pull_route` run."""

    provider: str
    model: str
    critique: Optional[PullCritique]
    trace: PullTrace

    @property
    def ok(self) -> bool:
        """True iff a schema-valid verdict was forced AND a probe ran.

        An agentic arm with zero tool calls is a failed run (tool-contract
        section 5), so ``ok`` requires both a verdict and real tool use.
        """
        return self.critique is not None and not self.trace.zero_tool_calls

    def to_dict(self) -> dict:
        return {
            "provider": self.provider,
            "model": self.model,
            "ok": self.ok,
            "critique": (
                self.critique.to_critique_entry() if self.critique else None
            ),
            "trace": self.trace.to_dict(),
        }


@dataclass(frozen=True)
class PullCaps:
    """Per-run bounds. The loop stops at the first ceiling reached."""

    max_turns: int = 12
    max_output_tokens: int = 4096
    token_budget: int = 200_000
    cost_ceiling_usd: float = 1.00


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class PullVerifierError(Exception):
    """Base class for adapter errors."""


class DeterministicServantViolation(PullVerifierError):
    """A servant returned something other than raw ground truth.

    Raised by the loop driver's guard when a candidate tool result does not
    match the canonical ground truth byte-for-byte (or, for an elided result,
    is not a raw contiguous slice of it). This is the anti-bias guardrail: a
    summarizing servant is a hard failure, never a tolerated degradation.
    """


class VerdictSchemaError(PullVerifierError):
    """The forced ``submit_verdict`` payload did not match the critique shape."""


# ---------------------------------------------------------------------------
# Sandbox confinement (read-only path discipline) - hardened from the spike.
# ---------------------------------------------------------------------------


class SandboxEscape(PullVerifierError):
    """A tool path resolved outside the review sandbox."""


def _safe(sandbox: Path, p: str) -> Path:
    """Confine a tool path to the sandbox; raise :class:`SandboxEscape` if not.

    Hardened from the spike's ``_safe`` to also reject symlink escapes:
    ``Path.resolve()`` collapses symlinks AND ``..`` segments, so a single
    real-prefix check after resolve covers absolute-path escapes, ``..``
    traversal, and symlinks whose real target leaves the sandbox.
    """
    if not isinstance(p, str) or not p:
        raise SandboxEscape(f"invalid path: {p!r}")
    sandbox_real = sandbox.resolve()
    raw = Path(p)
    target = raw.resolve() if raw.is_absolute() else (sandbox / p).resolve()
    if target != sandbox_real and sandbox_real not in target.parents:
        raise SandboxEscape(f"path escapes sandbox: {p}")
    return target


# ---------------------------------------------------------------------------
# Canonical deterministic ground-truth functions.
#
# These ARE the definition of "raw ground truth": the servant produces
# candidate results and the driver re-derives via these and asserts equality.
# Elision is the one permitted transform and is still raw (a contiguous head
# slice + an explicit marker), so both servant and guard agree by construction.
# ---------------------------------------------------------------------------

# Per-result byte cap. A result larger than this is elided to a raw head slice
# so a single huge file cannot blow the token budget in one turn. ASCII marker.
_RESULT_BYTE_CAP = 60_000
_ELISION_MARKER = "\n[... elided {n} bytes ...]\n"


@dataclass(frozen=True)
class GroundTruth:
    """A canonical raw tool result: ``content`` is raw, possibly elided."""

    content: str
    elided: bool
    bytes_total: int


def _elide(text: str) -> GroundTruth:
    """Raw head-slice elision when ``text`` exceeds the byte cap.

    The cap is genuinely on **encoded UTF-8 bytes** (the unit that drives the
    token budget), not character count. The head is a codepoint-aligned raw
    prefix of the first ``_RESULT_BYTE_CAP`` bytes (``errors="ignore"`` drops a
    partial trailing codepoint so the slice stays valid and <= the cap), and
    the dropped count is reported in bytes.
    """
    data = text.encode("utf-8", errors="replace")
    total = len(data)
    if total <= _RESULT_BYTE_CAP:
        return GroundTruth(content=text, elided=False, bytes_total=total)
    head = data[:_RESULT_BYTE_CAP].decode("utf-8", errors="ignore")
    dropped = total - len(head.encode("utf-8"))
    return GroundTruth(
        content=head + _ELISION_MARKER.format(n=dropped),
        elided=True,
        bytes_total=total,
    )


def _canonical_read_file(sandbox: Path, args: dict) -> GroundTruth:
    target = _safe(sandbox, args["path"])
    text = target.read_text(encoding="utf-8", errors="replace")
    return _elide(text)


def _canonical_list_dir(sandbox: Path, args: dict) -> GroundTruth:
    target = _safe(sandbox, args.get("path", "."))
    names = []
    for x in sorted(target.iterdir(), key=lambda e: e.name):
        names.append(x.name + ("/" if x.is_dir() else ""))
    return _elide("\n".join(names))


def _within_sandbox(path: Path, sandbox_real: Path) -> bool:
    """True iff ``path``'s real location is inside the sandbox.

    ``Path.resolve()`` collapses symlinks, so this rejects any file whose real
    target leaves the sandbox even when it was discovered via an in-sandbox
    symlink.
    """
    real = path.resolve()
    return real == sandbox_real or sandbox_real in real.parents


def _walk_files(root: Path, sandbox_real: Path) -> List[Path]:
    """Confined, symlink-safe file walk under ``root``.

    Uses ``os.walk(followlinks=False)`` so symlinked *directories* are never
    descended, and confines every yielded *file* with :func:`_within_sandbox`
    so a symlinked file pointing outside the sandbox is skipped (not read,
    not relabelled). This is the load-bearing fix for the grep breakout: every
    filesystem dereference, not just the root, goes through confinement.
    """
    if root.is_file():
        return [root] if _within_sandbox(root, sandbox_real) else []
    found: List[Path] = []
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dirnames.sort()
        for name in sorted(filenames):
            f = Path(dirpath) / name
            # REGULAR files only, AND confined. is_file() is False for a broken
            # symlink (target missing) and for non-regular entries (fifo/socket),
            # so a broken in-tree symlink no longer aborts the grep, and only
            # readable regular files are probed (GPT-5.4 S1 verification R2).
            if f.is_file() and _within_sandbox(f, sandbox_real):
                found.append(f)
    return found


# Conservative ReDoS guard for the model-authored grep pattern (set-067
# whole-set critique, Gemini finding 3). Python's ``re`` has no step/time
# bound, so a pattern with an (unbounded) quantifier applied to a subexpression
# whose body itself contains an unbounded quantifier -- the classic
# catastrophic-backtracking shape ``(a+)+`` / ``(.*)*`` / and the NESTED variant
# ``((a+))+`` / ``(ab(c+)d)+`` -- can hang the orchestrator process. A single
# regex cannot see arbitrary group nesting (set-067 0.21.1 R1), so this is a
# linear scanner that tracks group nesting and per-group "body contains an
# unbounded quantifier" state. A normal pattern like ``(foo|bar)+`` or ``\d+``
# or ``(\d{3})+`` is unaffected (its quantified group's body has no ``*``/``+``).
# Portable + dependency-free HEURISTIC, not a complete defense; full isolation
# (an re2 engine or a subprocess/timeout cage) is tracked for Set 068.
_MAX_REGEX_LEN = 1000
# A brace quantifier: {n} (bounded), {n,m} (bounded), or {n,} (UNBOUNDED).
_BRACE_RE = re.compile(r"\{(\d*)(,?)(\d*)\}")


def _brace_quant_at(pattern: str, i: int) -> Tuple[Optional[str], int]:
    """Classify a ``{...}`` at index ``i``.

    Returns ``(kind, end)`` where ``kind`` is ``"unbounded"`` for ``{n,}``,
    ``"bounded"`` for ``{n}`` / ``{n,m}``, or ``None`` if ``{`` is a literal
    (not a valid brace quantifier). ``end`` is the index just past the brace
    (or ``i`` when it is a literal).
    """
    m = _BRACE_RE.match(pattern, i)
    if not m:
        return None, i
    _lo, comma, hi = m.group(1), m.group(2), m.group(3)
    return ("unbounded" if (comma and not hi) else "bounded"), m.end()


def _has_nested_quantifier(pattern: str) -> bool:
    """True if an UNBOUNDED quantifier is applied to a quantifier-bearing group.

    The catastrophic-backtracking signature is an unbounded quantifier (``*``,
    ``+``, or ``{n,}``) applied to a subexpression whose body itself contains an
    unbounded quantifier (``(a+)+``, ``(.*)*``, ``(a{2,})+``, and the nested
    variants ``((a+))+`` / ``(ab(c+)d)+``). BOUNDED reps (``(a+){2}`` /
    ``(\\d{3})+``) are NOT catastrophic and are allowed (set-067 0.21.1 R2).

    Linear single pass with a group stack: each frame tracks whether that
    group's body contains an unbounded quantifier, and an inner unbounded
    quantifier propagates outward through group boundaries so nesting is caught.
    Escapes (``\\x``) and character classes (``[...]``, where ``*``/``+`` are
    literal) are skipped so they neither mark a body nor open a group.
    """
    body_has_quant: List[bool] = []  # one bool per open group
    i, n = 0, len(pattern)
    while i < n:
        c = pattern[i]
        if c == "\\":  # escaped atom -> skip the next char
            i += 2
            continue
        if c == "[":  # character class: quantifier chars inside are literal
            i += 1
            if i < n and pattern[i] == "^":
                i += 1
            if i < n and pattern[i] == "]":  # a leading ] is a literal member
                i += 1
            while i < n and pattern[i] != "]":
                i += 2 if pattern[i] == "\\" else 1
            i += 1  # past the closing ]
            continue
        if c == "(":
            body_has_quant.append(False)
            i += 1
            continue
        if c == ")":
            had = body_has_quant.pop() if body_has_quant else False
            nxt = pattern[i + 1] if i + 1 < n else ""
            if nxt == "{":
                kind, _end = _brace_quant_at(pattern, i + 1)
            elif nxt in "*+":
                kind = "unbounded"
            elif nxt == "?":
                kind = "bounded"  # optional: not catastrophic
            else:
                kind = None
            if had and kind == "unbounded":
                return True
            # An inner quantifier, or the group's OWN quantifier, is also a
            # quantifier inside the ENCLOSING body. Only an UNBOUNDED one can
            # seed a catastrophic outer pairing, so propagate unbounded-ness.
            if body_has_quant and (had or kind == "unbounded"):
                body_has_quant[-1] = True
            i += 1
            continue
        if c in "*+":  # an unbounded quantifier in the current body
            if body_has_quant:
                body_has_quant[-1] = True
            i += 1
            continue
        if c == "{":  # a brace quantifier in the current body
            kind, end = _brace_quant_at(pattern, i)
            if kind == "unbounded" and body_has_quant:
                body_has_quant[-1] = True
            i = end if kind is not None else i + 1
            continue
        i += 1
    return False


def _reject_dangerous_regex(pattern: str) -> None:
    """Raise ``ValueError`` if ``pattern`` is over-long or ReDoS-prone.

    Surfaced to the model as a raw ``ERROR: ...`` tool result (via
    :func:`_canonical_result`), so it can simplify and retry.
    """
    if len(pattern) > _MAX_REGEX_LEN:
        raise ValueError(
            f"grep pattern rejected: too long ({len(pattern)} > "
            f"{_MAX_REGEX_LEN} chars)"
        )
    if _has_nested_quantifier(pattern):
        raise ValueError(
            "grep pattern rejected: nested quantifier (potential catastrophic "
            "backtracking / ReDoS); simplify the pattern (avoid a quantifier "
            "on a group whose body is itself quantified, e.g. (a+)+ or (.*)*)."
        )


def _isolated_regex_search(pattern: str, payload: List[Tuple[str, str]]) -> List[str]:
    """Delegate to the cage's ReDoS-bounded search (dual import for test/bare).

    Lives in run_test_sandbox.py (the cage machinery this set introduces); kept a
    thin wrapper here so the dual import path (relative in production, bare on the
    test sys.path) is resolved once.
    """
    try:
        from .run_test_sandbox import isolated_regex_search
    except ImportError:  # pragma: no cover - test/bare context
        from run_test_sandbox import isolated_regex_search  # type: ignore
    return isolated_regex_search(pattern, payload)


def _canonical_grep(sandbox: Path, args: dict) -> GroundTruth:
    root = _safe(sandbox, args.get("path", "."))
    pattern = args["pattern"]
    # Cheap PRE-FILTER ONLY (Set 068): reject over-long / obvious catastrophic
    # patterns before paying for the isolated evaluation. The real ReDoS defense
    # now lives in run_test_sandbox.isolated_regex_search (an re2 inline fast path
    # or a subprocess + hard-timeout kill), so a catastrophic pattern the cheap
    # heuristic does NOT model is bounded by isolation rather than hanging.
    _reject_dangerous_regex(pattern)
    sandbox_real = sandbox.resolve()
    files = _walk_files(root, sandbox_real)
    payload: List[Tuple[str, str]] = []
    for f in files:
        rel = f.resolve().relative_to(sandbox_real).as_posix()
        try:
            text = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            # Defense in depth: a file that turns unreadable between the walk
            # and the read is skipped, not allowed to abort the whole grep.
            continue
        payload.append((rel, text))
    # The walk + sandbox confinement stay here; only the regex EVALUATION is
    # isolated. RegexTimeout / RegexError propagate to _canonical_result, which
    # surfaces them to the model as a raw ``ERROR: ...`` it can recover from.
    out = _isolated_regex_search(pattern, payload)
    return _elide("\n".join(out) or "(no matches)")


# Registry of canonical probe functions. NO write/edit/delete tool exists -
# the loop is read-only by construction.
_CANONICAL: Dict[str, Callable[[Path, dict], GroundTruth]] = {
    "read_file": _canonical_read_file,
    "grep": _canonical_grep,
    "list_dir": _canonical_list_dir,
}

PROBE_TOOL_NAMES = tuple(_CANONICAL.keys())
SUBMIT_VERDICT_TOOL = "submit_verdict"

# Set 068: the first WRITE-CAPABLE but CAGED tool. It is NOT a member of
# _CANONICAL (its result is non-re-derivable execution, so the byte-equality
# guard does not apply - see run-test-contract.md sec 1) and is dispatched to the
# disposable-worktree cage, not the read-only servant. It is offered ONLY when a
# RunTestConfig is passed to pull_route(); absent that, the loop is byte-for-byte
# the Set 067 read-only loop.
RUN_TEST_TOOL = "run_test"

# Set 069 S2: raw diff-awareness. Like run_test, get_diff is NOT a member of
# _CANONICAL: the diff RANGE is operator-pinned config (a DiffConfig), never
# model-authored argv, and the orchestrator runs ``git`` itself with no
# model-touchable servant seam in between - so there is no summarizing-servant
# attack surface for the byte-equality guard to defend (the same posture as
# run_test; see run-test-contract.md sec 1). It returns the RAW unified diff +
# changed-path list, never a model-summarized "changed-symbol map" (proposal
# rung 3). Offered ONLY when a DiffConfig is passed to pull_route().
GET_DIFF_TOOL = "get_diff"

# Set 069 S3: the probe-template lane (proposal rung 4, "the missing middle").
# Like run_test it dispatches to the disposable-worktree CAGE (execution, NOT
# re-derivable, so OUTSIDE the byte-equality guard) and is NOT a member of
# _CANONICAL. The model selects an OPERATOR-AUTHORED, versioned template by id and
# supplies TYPED, validated args; the harness (ai_router.probe_templates) is
# human-authored and runs in the cage. Offered ONLY when a ProbeTemplateConfig is
# passed to pull_route(); absent it, the loop is byte-for-byte the prior behavior.
RUN_PROBE_TEMPLATE_TOOL = "run_probe_template"


@dataclass(frozen=True)
class RunTestConfig:
    """Cage wiring for the ``run_test`` tool (Set 068).

    Carries the git ``repo_root`` + pinned ``ref`` the disposable worktree is
    created from, the bounded command surface (a default argv, plus an optional
    name->argv map the tool's ``name`` input may select among), and the caps. The
    model can only TRIGGER / select these operator-authored commands; it can never
    author a shell string.
    """

    repo_root: str
    ref: str
    command: Tuple[str, ...] = ()
    commands: Optional[Dict[str, Tuple[str, ...]]] = None
    caps: Optional[object] = None  # run_test_sandbox.RunTestCaps; None -> default

    def resolve(self, name: Optional[str]) -> Tuple[str, ...]:
        """Resolve the argv for an optional command ``name`` (else the default)."""
        if name and self.commands and name in self.commands:
            return tuple(self.commands[name])
        return tuple(self.command or ())

    def resolve_id(self, name: Optional[str]) -> str:
        """Return the TRUSTED command id actually run for ``name``.

        Mirrors :meth:`resolve`: a configured name selects that command; anything
        else (unknown name / no name) falls back to the default command, whose id
        is ``"default"``. This is the id the evidence transcript records - so a
        model-supplied UNKNOWN name (which silently runs the default) can never be
        recorded as if it were a configured command, which would let a false
        ``commandId`` back a REPRODUCED claim (GPT-5.4 S2 verification, finding 1).
        """
        if name and self.commands and name in self.commands:
            return name
        return "default"


def _run_test_tool_schema() -> dict:
    return {
        "name": RUN_TEST_TOOL,
        "description": (
            "Run the project's configured test command in a DISPOSABLE, "
            "detached git worktree of the repo at a pinned ref (cwd is the "
            "throwaway checkout), then discard it. Returns the RAW exit code + "
            "captured output. Ordinary in-tree writes are discarded with the "
            "worktree. You cannot pass a command; you may optionally select a "
            "configured one by name."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": (
                        "optional: select a configured command by name; "
                        "omit to run the default test command"
                    ),
                }
            },
            "required": [],
        },
    }


@dataclass(frozen=True)
class _Execution:
    """A captured cage execution, for orchestrator-side evidence tagging.

    Records exactly the raw facts a REPRODUCED-grade transcript needs (the
    trusted probe identifier + resolved argv, the raw output, the exit code), so
    :func:`_stamp_evidence_tiers` can build a falsifier transcript and replay it on
    a fresh checkout. Captured ONLY for a clean cage run (``ran`` and no cage
    ``error`` and no teardown leak) - a leaky/failed cage run cannot back a
    reproduced claim.

    Two lanes share this record, discriminated by ``kind`` (Set 069 S3):

    - ``"command"`` (run_test): the trusted ``command_id`` (a configured name or
      ``"default"``); the transcript carries ``commandId`` and a ``test_entrypoint``
      whose ref is the resolved argv.
    - ``"template"`` (run_probe_template): the operator-authored ``template_id`` +
      the validated ``template_args``; the transcript carries ``templateId`` +
      ``args`` and the template's declared PUBLIC ``entrypoint_kind`` /
      ``entrypoint_ref`` (meta-oracle).
    """

    command_id: str  # the stable trusted-command id (requested name or "default")
    requested_name: str  # the model's optional name input ("" => default command)
    argv: Tuple[str, ...]
    exit_code: Optional[int]
    raw_output: str
    kind: str = "command"  # "command" (run_test) | "template" (run_probe_template)
    template_id: str = ""  # the operator-authored probe-template id (template lane)
    template_args: Optional[dict] = None  # validated typed args (template lane)
    entrypoint_kind: str = ENTRYPOINT_TEST  # transcript entrypoint kind (template lane)
    entrypoint_ref: str = ""  # transcript entrypoint ref (template lane)
    # The replay context CAPTURED FROM THE LANE THAT RAN THIS PROBE (Set 069 S3,
    # GPT-5.4 R2 finding 1): each execution carries its OWN repo_root / ref / caps
    # so the pristine replay re-runs it against the SAME tree it ran against -
    # never a different lane's config. This decouples replay from any single
    # shared cfg, so mixing the run_test lane (one repo/ref) and the probe-template
    # lane (possibly another) can never replay a finding against the wrong tree.
    repo_root: str = ""
    ref: str = ""
    caps: Optional[object] = None  # run_test_sandbox.RunTestCaps; None -> default

    @property
    def match_id(self) -> str:
        """The id the agent names to back a REPRODUCED claim (command or template)."""
        return self.template_id if self.kind == "template" else self.command_id


def _dispatch_run_test(
    cfg: RunTestConfig, args: dict
) -> Tuple[str, bool, bool, Optional["_Execution"]]:
    """Run the cage for one ``run_test`` call.

    Returns ``(raw_text, is_error, elided, execution)``. ``execution`` is a
    captured :class:`_Execution` for a clean cage run (so a REPRODUCED claim can
    be replayed + transcript-backed by :func:`_stamp_evidence_tiers`), or ``None``
    when the cage errored / leaked (which cannot back a reproduction).

    Dispatched OUTSIDE the deterministic-servant byte-equality guard (execution is
    non-re-derivable). The cage itself enforces the raw-result + disposable-CWD
    isolation + crash-safe-teardown discipline (run_test_sandbox.run_test_in_cage;
    see its docstring for the precise, bounded scope of the isolation).
    """
    try:
        from .run_test_sandbox import run_test_in_cage
    except ImportError:  # pragma: no cover - test/bare context
        from run_test_sandbox import run_test_in_cage  # type: ignore
    name = args.get("name") if isinstance(args, dict) else None
    cmd = cfg.resolve(name)
    # The TRUSTED id actually run (a configured name, else "default"). NOT the
    # model's raw ``name`` - an unknown name silently runs the default, and
    # recording the unknown string as the command_id would let a false commandId
    # back a REPRODUCED claim (GPT-5.4 S2 verification, finding 1).
    resolved_id = cfg.resolve_id(name)
    res = run_test_in_cage(cfg.repo_root, cfg.ref, cmd, caps=cfg.caps)
    content = res.render()
    is_error = content.startswith("ERROR: ")
    elided = "[... elided " in content
    execution: Optional[_Execution] = None
    # A failing FALSIFIER (non-zero exit) is a *successful* probe (ran=True,
    # error=None); only a cage error / teardown leak disqualifies the run from
    # backing a reproduction.
    if res.ran and res.error is None and res.worktree_removed:
        execution = _Execution(
            command_id=resolved_id,
            # requested_name reflects the TRUSTED selection actually made (a real
            # configured name), never the model's unmatched string.
            requested_name=resolved_id if resolved_id != "default" else "",
            argv=tuple(cmd),
            exit_code=res.exit_code,
            raw_output=res.output,
            # Replay context from THIS lane's config (S3 R2 finding 1).
            repo_root=cfg.repo_root,
            ref=cfg.ref,
            caps=cfg.caps,
        )
    return content, is_error, elided, execution


@dataclass(frozen=True)
class DiffConfig:
    """Diff-awareness wiring for the ``get_diff`` tool (Set 069 S2).

    The diff RANGE is operator-pinned, never model-authored: ``base_ref`` is the
    "from" side; ``head_ref`` the "to" side (empty => the working tree, i.e.
    ``git diff <base_ref>``); ``paths`` optionally limits the diff to a fixed
    pathspec. The model can only TRIGGER ``get_diff()``; it supplies no arguments.
    """

    repo_root: str
    base_ref: str
    head_ref: str = ""
    paths: Tuple[str, ...] = ()

    def _range(self) -> Tuple[str, ...]:
        rng = (
            f"{self.base_ref}..{self.head_ref}"
            if self.head_ref
            else self.base_ref
        )
        tail = ("--", *self.paths) if self.paths else ()
        return (rng, *tail)


def _get_diff_tool_schema() -> dict:
    return {
        "name": GET_DIFF_TOOL,
        "description": (
            "Return the RAW unified diff of the change under review (the "
            "operator-pinned ref range), preceded by the list of changed paths. "
            "Read-only; you pass no arguments and cannot choose the range. This "
            "is the raw git diff, never a summarized symbol map - read it to see "
            "exactly what changed before forming a judgment."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    }


def _dispatch_get_diff(cfg: DiffConfig) -> Tuple[str, bool, bool]:
    """Run ``git diff`` for the pinned range; return (raw_text, is_error, elided).

    Dispatched OUTSIDE the byte-equality guard for the same reason as run_test:
    the orchestrator runs ``git`` itself (no model-touchable servant), and the
    range is operator-pinned config, so there is no summarizing-servant surface
    to defend. Output is capped/elided via the shared subprocess primitive, so a
    huge diff cannot blow the token budget in one turn.
    """
    try:
        from .run_test_sandbox import run_subprocess_capped
    except ImportError:  # pragma: no cover - test/bare context
        from run_test_sandbox import run_subprocess_capped  # type: ignore
    rng = cfg._range()
    names = run_subprocess_capped(
        ["git", "-C", cfg.repo_root, "diff", "--name-only", *rng],
        timeout_seconds=30,
        output_byte_cap=_RESULT_BYTE_CAP,
    )
    diff = run_subprocess_capped(
        ["git", "-C", cfg.repo_root, "diff", *rng],
        timeout_seconds=30,
        output_byte_cap=_RESULT_BYTE_CAP,
    )
    if names.timed_out or diff.timed_out:
        return "ERROR: get_diff: git diff timed out", True, False
    # A non-zero git exit (e.g. a bad ref) is surfaced raw so the model can
    # recover, mirroring the read-only servant's raw ERROR discipline.
    if diff.exit_code not in (0, None) or names.exit_code not in (0, None):
        err = (diff.stderr_text or names.stderr_text or "git diff failed").strip()
        return f"ERROR: get_diff: {err}", True, False
    body = (
        "[changed paths]\n"
        + (names.stdout_text or "(no changed paths)")
        + "\n[unified diff]\n"
        + (diff.stdout_text or "(empty diff)")
    )
    elided = names.stdout_elided or diff.stdout_elided
    return body, False, elided


def _run_probe_template_tool_schema(cfg: "object") -> dict:
    """Build the ``run_probe_template`` tool schema, listing available templates.

    ``cfg`` is the active ``probe_templates.ProbeTemplateConfig``; its library is
    rendered into the description so the model knows which operator-authored
    templates exist and what TYPED args each declares. The model supplies only a
    template id + typed args - never code or argv.
    """
    templates = getattr(cfg, "templates", {}) or {}
    lines = [templates[tid].describe() for tid in sorted(templates)]
    listing = "\n".join(f"- {ln}" for ln in lines) or "- (no templates configured)"
    return {
        "name": RUN_PROBE_TEMPLATE_TOOL,
        "description": (
            "Invoke an OPERATOR-AUTHORED, versioned probe template by id with "
            "TYPED, validated args, in the disposable-worktree cage (fresh "
            "checkout at the pinned ref, discarded after). You DO NOT author code "
            "or a command - you only select a template and supply its declared "
            "typed inputs; an unknown id or invalid args come back as a raw ERROR "
            "you can correct. Returns the RAW exit code + captured output (the "
            "probe exits 1 when it reproduced the defect, 0 when the entrypoint "
            "was robust). Available templates:\n" + listing
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "templateId": {
                    "type": "string",
                    "description": "the probe-template id to invoke (see the list)",
                },
                "args": {
                    "type": "object",
                    "description": "the template's declared typed args",
                },
            },
            "required": ["templateId"],
        },
    }


def _dispatch_run_probe_template(
    cfg: "object", args: dict
) -> Tuple[str, bool, bool, Optional["_Execution"]]:
    """Run one ``run_probe_template`` call in the cage (Set 069 S3).

    Returns ``(raw_text, is_error, elided, execution)``. ``execution`` is a
    template-kind :class:`_Execution` for a clean cage run (so a REPRODUCED claim
    can be replayed + transcript-backed), or ``None`` when the template is unknown,
    the args are invalid, or the cage errored / leaked. Dispatched OUTSIDE the
    byte-equality guard (execution is non-re-derivable, like run_test).
    """
    try:
        from .probe_templates import run_probe_template
    except ImportError:  # pragma: no cover - test/bare context
        from probe_templates import run_probe_template  # type: ignore
    template_id = args.get("templateId") if isinstance(args, dict) else None
    raw_args = args.get("args") if isinstance(args, dict) else None
    content, is_error, elided, run = run_probe_template(cfg, template_id, raw_args)
    execution: Optional[_Execution] = None
    if run is not None:
        res = run.result
        execution = _Execution(
            command_id="",
            requested_name="",
            argv=tuple(run.argv),
            exit_code=getattr(res, "exit_code", None),
            raw_output=getattr(res, "output", ""),
            kind="template",
            template_id=run.template.template_id,
            template_args=dict(run.args) if run.args else None,
            entrypoint_kind=run.template.entrypoint_kind,
            entrypoint_ref=run.template.entrypoint_ref,
            # Replay context from THE PROBE-TEMPLATE lane's config (S3 R2 finding
            # 1): a template execution replays against ITS OWN repo/ref, never a
            # different lane's, even when both lanes are active with diff configs.
            repo_root=getattr(cfg, "repo_root", ""),
            ref=getattr(cfg, "ref", ""),
            caps=getattr(cfg, "caps", None),
        )
    return content, is_error, elided, execution


# ---------------------------------------------------------------------------
# Deterministic servant (pluggable; default delegates to the canonical fns).
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ToolResult:
    """A servant's candidate tool result. ``raw`` must be True for a probe."""

    content: str
    raw: bool
    elided: bool
    bytes_total: int


def _canonical_result(name: str, args: dict, sandbox: Path) -> ToolResult:
    """The full canonical :class:`ToolResult` for a probe - success OR error.

    This is the single definition of "what raw ground truth IS" for every
    outcome. A success is the raw (possibly elided) content; a failure is a raw
    ``ERROR: {exc}`` string. Both the default servant and the guard derive from
    THIS function, so error results are as deterministic as success results -
    there is no error-shaped hole a servant can inject model-authored text
    through (GPT-5.4 S1 verification, Major #1).
    """
    if name not in _CANONICAL:
        return ToolResult(
            content=f"ERROR: unknown tool {name}",
            raw=True,
            elided=False,
            bytes_total=0,
        )
    try:
        gt = _CANONICAL[name](sandbox, args)
    except Exception as exc:  # raw error surfacing, never a summary
        return ToolResult(
            content=f"ERROR: {exc}", raw=True, elided=False, bytes_total=0
        )
    return ToolResult(
        content=gt.content,
        raw=True,
        elided=gt.elided,
        bytes_total=gt.bytes_total,
    )


class DeterministicServant:
    """Answers read-only probe tool calls with raw ground truth.

    The default implementation delegates to :func:`_canonical_result`, so it
    passes the driver's guard by construction. Tests subclass this to inject a
    *bad* (summarizing) servant and confirm the guard rejects it.

    Errors are surfaced as raw ``ERROR: ...`` text, never hidden (mirrors the
    spike). A sandbox escape is one such raw error - it does not crash the
    loop, so the model can recover and try a different path.
    """

    def run(self, name: str, args: dict, sandbox: Path) -> ToolResult:
        return _canonical_result(name, args, sandbox)


def _guard_raw_ground_truth(
    name: str, args: dict, result: ToolResult, sandbox: Path
) -> None:
    """Assert ``result`` is raw ground truth; raise on any deviation.

    The anti-bias guardrail. Independently re-derives the **full** canonical
    result (success or error) via :func:`_canonical_result` and requires the
    servant's result to match it field-for-field (content / raw / elided /
    bytes_total). Because error results are canonicalized too, a servant cannot
    slip a model-authored view past the guard on EITHER a readable artifact
    (content mismatch) OR a failing probe (error-text mismatch).
    """
    if not result.raw:
        raise DeterministicServantViolation(
            f"{name}: tool result not flagged raw - a probe must return raw "
            "ground truth, never a model-touched view"
        )
    truth = _canonical_result(name, args, sandbox)
    if (
        result.content != truth.content
        or result.raw != truth.raw
        or result.elided != truth.elided
        or result.bytes_total != truth.bytes_total
    ):
        raise DeterministicServantViolation(
            f"{name}: tool result does not match raw ground truth - the "
            "servant summarized, paraphrased, fabricated an error, or "
            "otherwise altered the bytes"
        )


# ---------------------------------------------------------------------------
# Tool schemas (provider-neutral; each binding shapes these to wire format).
# ---------------------------------------------------------------------------


def _probe_tool_schemas() -> List[dict]:
    return [
        {
            "name": "read_file",
            "description": "Read a file's full raw text (read-only).",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
        {
            "name": "grep",
            "description": (
                "Regex-search files under a path; returns raw matching lines "
                "as relpath:lineno:line (read-only)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string"},
                    "path": {"type": "string"},
                },
                "required": ["pattern"],
            },
        },
        {
            "name": "list_dir",
            "description": "List entries under a directory (read-only).",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": [],
            },
        },
    ]


def _verdict_tool_schema(
    allow_evidence: bool = False, allow_template_evidence: bool = False
) -> dict:
    """Build the ``submit_verdict`` schema.

    ``allow_evidence`` (Set 069 S2) gates the per-finding ``evidenceTier`` /
    ``commandId`` proposal fields - offered when the ``run_test`` lane is active.
    ``allow_template_evidence`` (Set 069 S3) gates the ``templateId`` proposal
    field - offered when the ``run_probe_template`` lane is active. ``evidenceTier``
    is added when EITHER lane can back a replay. The orchestrator confers
    REPRODUCED only by replaying the named probe on a fresh checkout (you cannot
    self-grant it). When BOTH flags are False the schema is byte-for-byte the Set
    067/068 read-only shape, so the no-config agent-facing surface is unchanged
    (GPT-5.4 S2 verification, finding 2).
    """
    finding_props: dict = {
        "description": {"type": "string"},
        "severity": {"type": "string"},
        "category": {"type": "string"},
    }
    if allow_evidence or allow_template_evidence:
        # The agent may PROPOSE an evidence tier; it is advisory only. The
        # orchestrator confers REPRODUCED solely by replaying the named probe on
        # a fresh checkout (you cannot self-grant it).
        finding_props["evidenceTier"] = {
            "type": "string",
            "description": (
                "optional: propose REPRODUCED (only if a probe you triggered - a "
                "run_test or a run_probe_template - reproduced this defect) or "
                "HYPOTHESIS (a flagged suspicion). Omit for a read-claim. The "
                "orchestrator replays a REPRODUCED claim and downgrades it to a "
                "read-claim if the replay does not match - you cannot self-grant "
                "it."
            ),
        }
    if allow_evidence:
        finding_props["commandId"] = {
            "type": "string",
            "description": (
                "optional: the run_test command name (or 'default') that "
                "reproduced this defect; required to back a REPRODUCED proposal "
                "from the run_test lane."
            ),
        }
    if allow_template_evidence:
        finding_props["templateId"] = {
            "type": "string",
            "description": (
                "optional: the run_probe_template id that reproduced this defect; "
                "required to back a REPRODUCED proposal from the probe-template "
                "lane."
            ),
        }
    return {
        "name": SUBMIT_VERDICT_TOOL,
        "description": (
            "Submit the final structured critique verdict. Call this exactly "
            "once, after probing the repository, to end the review. Provide a "
            "non-empty summary AND/OR at least one finding."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "verdict": {
                    "type": "string",
                    "description": "e.g. VERIFIED or ISSUES_FOUND",
                },
                "summary": {
                    "type": "string",
                    "description": "Prose verdict / what was reviewed.",
                },
                "findings": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": finding_props,
                        "required": ["description"],
                    },
                },
            },
            # Only ``verdict`` is structurally required; _parse_verdict enforces
            # the Set 066 content rule (non-empty summary OR >=1 finding), so the
            # schema and the parser are aligned (GPT-5.4 S1 verification R2).
            "required": ["verdict"],
        },
    }


def _all_tool_schemas() -> List[dict]:
    return _probe_tool_schemas() + [_verdict_tool_schema()]


def _parse_verdict(provider: str, model: str, payload: dict) -> PullCritique:
    """Validate a ``submit_verdict`` payload into a :class:`PullCritique`."""
    if not isinstance(payload, dict):
        raise VerdictSchemaError("submit_verdict payload is not an object")
    verdict = payload.get("verdict")
    if not (isinstance(verdict, str) and verdict.strip()):
        raise VerdictSchemaError("submit_verdict.verdict is missing or empty")
    summary = payload.get("summary")
    if not isinstance(summary, str):
        summary = "" if summary is None else str(summary)
    findings_raw = payload.get("findings") or []
    if not isinstance(findings_raw, list):
        raise VerdictSchemaError("submit_verdict.findings must be an array")
    findings: List[Finding] = []
    for i, f in enumerate(findings_raw):
        if not isinstance(f, dict):
            raise VerdictSchemaError(f"findings[{i}] is not an object")
        desc = f.get("description")
        if not (isinstance(desc, str) and desc.strip()):
            raise VerdictSchemaError(
                f"findings[{i}].description is missing or empty"
            )
        sev = f.get("severity") or ""
        cat = f.get("category") or ""
        findings.append(
            Finding(
                description=desc,
                severity=sev if isinstance(sev, str) else str(sev),
                category=cat if isinstance(cat, str) else str(cat),
            )
        )
    # Content non-triviality: the Set 066 per-entry rule (validate_path_aware_
    # critique_artifact) requires a non-empty summary OR at least one finding.
    # Enforcing it here makes the contract's "a single entry it emits is
    # guaranteed to satisfy the per-entry structural rules" actually true,
    # rather than emitting an entry the S4 artifact gate would reject as
    # trivial (GPT-5.4 S1 verification, focus item 4 / summary caveat).
    if not summary.strip() and not findings:
        raise VerdictSchemaError(
            "submit_verdict must carry a non-empty summary OR at least one "
            "finding (a trivial verdict fails the Set 066 critique-entry rule)"
        )
    return PullCritique(
        provider=provider,
        model=model,
        verdict=verdict.strip(),
        summary=summary,
        findings=tuple(findings),
    )


# ---------------------------------------------------------------------------
# Evidence-protocol tagging (Set 069 S2): findings from a TRIGGERED run flow
# through the S1 protocol - the orchestrator stamps the tier, never the agent.
# ---------------------------------------------------------------------------


def _run_pristine_replay(execution: "_Execution") -> Optional[object]:
    """Replay an execution on a SECOND pristine checkout (returns a RunTestResult).

    The load-bearing trust step: the orchestrator (not the agent) re-runs the
    same operator-authored probe argv on a fresh detached worktree, so a
    REPRODUCED finding becomes a re-runnable falsifier. The replay uses the
    execution's OWN captured ``repo_root`` / ``ref`` / ``caps`` - the exact tree
    the probe ran against - so a template execution is never replayed against a
    different lane's config (S3 R2 finding 1). Module-level so tests can
    monkeypatch it without a real cage. Returns ``None`` on any cage import/run
    failure (a missing replay collapses the claim to a read-claim).
    """
    try:
        from .run_test_sandbox import run_test_in_cage
    except ImportError:  # pragma: no cover - test/bare context
        from run_test_sandbox import run_test_in_cage  # type: ignore
    try:
        return run_test_in_cage(
            execution.repo_root, execution.ref, execution.argv,
            caps=execution.caps,
        )
    except Exception:  # pragma: no cover - defensive; a replay error => no tag
        return None


def _build_transcript(execution: "_Execution") -> Optional[dict]:
    """Build a falsifier transcript for an execution + its pristine replay.

    Returns the transcript dict (the S1 ``EvidenceTranscript`` shape) when the
    replay ran cleanly, else ``None`` (a failed/leaky replay cannot back
    REPRODUCED). The transcript is only ever ACCEPTED if
    :func:`evidence_protocol.validate_transcript` agrees - in particular the
    replay must reproduce the same ``outputHash`` (a deterministic falsifier); a
    flaky command's replay will mismatch and the finding collapses to a
    read-claim. Both the original run and the replay use the execution's OWN
    captured replay context (repo/ref/caps). The entrypoint is the command lane's
    ``test_entrypoint`` (a trusted operator-authored command) or the template's
    declared PUBLIC entrypoint - satisfying the meta-oracle rule by construction.
    """
    replay = _run_pristine_replay(execution)
    if (
        replay is None
        or not getattr(replay, "ran", False)
        or getattr(replay, "error", "x") is not None
        or not getattr(replay, "worktree_removed", False)
    ):
        return None
    transcript: dict = {
        "pinnedRef": execution.ref,
        "pristineCheckout": True,
        "exitCode": execution.exit_code,
        "rawOutput": execution.raw_output,
        "outputHash": hash_output(execution.raw_output),
        "replay": {
            "pristineCheckout": True,
            "exitCode": replay.exit_code,
            "outputHash": hash_output(replay.output),
        },
    }
    if execution.kind == "template":
        # The probe-template lane: a templateId-keyed falsifier driving the
        # template's declared PUBLIC entrypoint (meta-oracle by construction).
        transcript["templateId"] = execution.template_id
        transcript["entrypoint"] = {
            "kind": execution.entrypoint_kind,
            "ref": execution.entrypoint_ref,
        }
        if execution.template_args:
            transcript["args"] = execution.template_args
    else:
        # The run_test lane: a commandId-keyed falsifier; the entrypoint is the
        # trusted operator-authored command (test_entrypoint), ref = the argv.
        transcript["commandId"] = execution.command_id
        transcript["entrypoint"] = {
            "kind": ENTRYPOINT_TEST,
            "ref": " ".join(execution.argv),
        }
        if execution.requested_name:
            transcript["args"] = {"name": execution.requested_name}
    return transcript


def _stamp_evidence_tiers(
    critique: PullCritique,
    payload: dict,
    executions: List["_Execution"],
) -> PullCritique:
    """Apply the S1 evidence protocol to a verdict's findings (orchestrator-side).

    For each finding, read the agent's *proposed* ``evidenceTier`` + the probe id
    (``commandId`` or ``templateId``) from the raw ``submit_verdict`` payload
    (aligned by index with the parsed findings - :func:`_parse_verdict` preserves
    order 1:1). Then:

    - a proposed ``REPRODUCED`` is conferred ONLY by :func:`authoritative_tier`
      on a transcript that replays clean (the orchestrator does the replay, using
      the matched execution's OWN captured repo/ref/caps - never a shared cfg);
      if the named probe was never run, or the replay does not match, the claim
      **collapses to a read-claim** (no field) - the agent can never self-grant
      REPRODUCED;
    - a proposed ``HYPOTHESIS`` is preserved (a flagged, agent-proposed
      suspicion);
    - anything else stays the ASSERTED default (no on-disk field), so a read-only
      critique entry is byte-identical to the Set 067/068 shape.
    """
    raw_findings = payload.get("findings") if isinstance(payload, dict) else None
    if not isinstance(raw_findings, list):
        raw_findings = []
    # Lane-keyed maps: a commandId resolves ONLY against run_test executions and a
    # templateId ONLY against probe-template executions, so a command id that
    # happens to equal a template id can never cross-bind a finding to the wrong
    # execution (GPT-5.4 S3 verification, finding 2). First run wins for a given id.
    by_command: Dict[str, _Execution] = {}
    by_template: Dict[str, _Execution] = {}
    for ex in executions:
        if ex.kind == "template":
            by_template.setdefault(ex.template_id, ex)
        else:
            by_command.setdefault(ex.command_id, ex)

    new_findings: List[Finding] = []
    for i, finding in enumerate(critique.findings):
        proposed = None
        command_id = None
        template_id = None
        if i < len(raw_findings) and isinstance(raw_findings[i], dict):
            proposed = raw_findings[i].get("evidenceTier")
            command_id = raw_findings[i].get("commandId")
            template_id = raw_findings[i].get("templateId")
        has_cmd = isinstance(command_id, str) and command_id != ""
        has_tpl = isinstance(template_id, str) and template_id != ""

        if proposed == EVIDENCE_REPRODUCED:
            ex: Optional[_Execution] = None
            if has_cmd and has_tpl:
                # Ambiguous: the agent named BOTH a command and a template id ->
                # do not guess a lane; collapse to a read-claim.
                ex = None
            elif has_cmd:
                ex = by_command.get(command_id)
            elif has_tpl:
                ex = by_template.get(template_id)
            elif len(executions) == 1:
                # No probe named, but exactly one run happened -> unambiguous.
                ex = executions[0]
            transcript = _build_transcript(ex) if ex else None
            tier = authoritative_tier(EVIDENCE_REPRODUCED, transcript)
            if tier == EVIDENCE_REPRODUCED:
                new_findings.append(
                    replace(
                        finding,
                        evidence_tier=EVIDENCE_REPRODUCED,
                        transcript=transcript,
                    )
                )
                continue
            # Collapsed: no valid replayed transcript -> a read-claim (no field).
            new_findings.append(finding)
            continue
        if proposed == EVIDENCE_HYPOTHESIS:
            new_findings.append(replace(finding, evidence_tier=EVIDENCE_HYPOTHESIS))
            continue
        new_findings.append(finding)

    return replace(critique, findings=tuple(new_findings))


# ---------------------------------------------------------------------------
# Provider binding interface + neutral message model.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class NeutralToolCall:
    """A provider-neutral tool-use request from the model."""

    id: str
    name: str
    input: dict


@dataclass
class BindingResponse:
    """Provider-neutral response from one agentic turn."""

    text: str
    tool_calls: List[NeutralToolCall]
    input_tokens: int
    output_tokens: int
    stop_reason: str


# A neutral transcript is a list of dicts:
#   {"role": "user", "text": str}
#   {"role": "assistant", "text": str, "tool_calls": [NeutralToolCall, ...]}
#   {"role": "tool", "results": [{"id": str, "name": str, "content": str}, ...]}


class ProviderBinding:
    """Translate the neutral transcript to/from one provider's wire format.

    The loop driver is provider-agnostic; all per-provider request/response
    shaping lives in a binding. S1 ships :class:`AnthropicBinding`; S2 adds
    OpenAI and Gemini bindings behind this same interface.
    """

    provider_name = "base"

    def request(
        self,
        *,
        system: str,
        transcript: List[dict],
        tools: List[dict],
        force_verdict: bool,
        max_output_tokens: int,
        model: str,
        config: dict,
        generation_params: Optional[dict] = None,
    ) -> BindingResponse:
        raise NotImplementedError


class AnthropicBinding(ProviderBinding):
    """Anthropic Messages API ``tool_use`` binding."""

    provider_name = "anthropic"

    def request(
        self,
        *,
        system: str,
        transcript: List[dict],
        tools: List[dict],
        force_verdict: bool,
        max_output_tokens: int,
        model: str,
        config: dict,
        generation_params: Optional[dict] = None,
    ) -> BindingResponse:
        import httpx

        gp = generation_params or {}
        api_key = _resolve_api_key(config)
        messages = self._to_messages(transcript)
        body = {
            "model": model,
            "max_tokens": max_output_tokens,
            "system": system,
            "tools": [self._to_anthropic_tool(t) for t in tools],
            "messages": messages,
        }
        # Reasoning knobs (same shape as providers.py): effort + adaptive
        # thinking. Optional; absent keys leave the API defaults in place.
        thinking = gp.get("thinking") or {}
        if thinking.get("enabled"):
            body["thinking"] = {"type": thinking.get("type", "adaptive")}
        effort = gp.get("effort")
        if effort:
            body.setdefault("output_config", {})["effort"] = effort
        if force_verdict:
            body["tool_choice"] = {"type": "tool", "name": SUBMIT_VERDICT_TOOL}
        headers = {
            "x-api-key": api_key,
            "anthropic-version": config.get("api_version", "2023-06-01"),
            "content-type": "application/json",
        }
        url = config.get("base_url", "https://api.anthropic.com/v1/messages")
        timeout = config.get("timeout_seconds", 120)
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()
        return self._from_response(data)

    @staticmethod
    def _to_anthropic_tool(tool: dict) -> dict:
        return {
            "name": tool["name"],
            "description": tool["description"],
            "input_schema": tool["parameters"],
        }

    @staticmethod
    def _to_messages(transcript: List[dict]) -> List[dict]:
        messages: List[dict] = []
        for entry in transcript:
            role = entry["role"]
            if role == "user":
                messages.append(
                    {"role": "user", "content": entry["text"]}
                )
            elif role == "assistant":
                content: List[dict] = []
                if entry.get("text"):
                    content.append({"type": "text", "text": entry["text"]})
                for tc in entry.get("tool_calls", []):
                    content.append(
                        {
                            "type": "tool_use",
                            "id": tc.id,
                            "name": tc.name,
                            "input": tc.input,
                        }
                    )
                messages.append({"role": "assistant", "content": content})
            elif role == "tool":
                content = [
                    {
                        "type": "tool_result",
                        "tool_use_id": r["id"],
                        "content": r["content"],
                    }
                    for r in entry["results"]
                ]
                messages.append({"role": "user", "content": content})
        return messages

    @staticmethod
    def _from_response(data: dict) -> BindingResponse:
        blocks = data.get("content", [])
        text = "".join(
            b.get("text", "") for b in blocks if b.get("type") == "text"
        )
        tool_calls = [
            NeutralToolCall(
                id=b["id"], name=b["name"], input=b.get("input", {})
            )
            for b in blocks
            if b.get("type") == "tool_use"
        ]
        usage = data.get("usage", {})
        return BindingResponse(
            text=text,
            tool_calls=tool_calls,
            input_tokens=usage.get("input_tokens", 0),
            output_tokens=usage.get("output_tokens", 0),
            stop_reason=data.get("stop_reason", "unknown"),
        )


class OpenAIBinding(ProviderBinding):
    """OpenAI Responses API function-tool binding.

    GPT-5.x rejects function tools combined with ``reasoning_effort`` on
    ``/v1/chat/completions`` (the API returns 400 "use /v1/responses
    instead"), and the pull verifier always presents tools AND wants
    reasoning for a careful path-aware critique. So this binding uses the
    Responses API, where the provider's tool vocabulary is the
    ``function_call`` / ``function_call_output`` item pair (the Responses-API
    spelling of OpenAI's ``tool_calls``).

    Reasoning items are kept **server-side** via ``previous_response_id``
    chaining (``store: true``), so the driver's neutral transcript never has
    to carry opaque reasoning blobs that the API would otherwise require be
    echoed back. Each turn sends only the entries new since the last response
    (the user message or the ``function_call_output`` results); OpenAI threads
    the prior reasoning + ``function_call`` context itself. The binding is
    therefore **stateful for the lifetime of one** :func:`pull_route` run -
    the driver constructs one fresh instance per run, so the state is per-run.
    """

    provider_name = "openai"

    def __init__(self) -> None:
        self._response_id: Optional[str] = None
        self._sent_upto: int = 0

    def request(
        self,
        *,
        system: str,
        transcript: List[dict],
        tools: List[dict],
        force_verdict: bool,
        max_output_tokens: int,
        model: str,
        config: dict,
        generation_params: Optional[dict] = None,
    ) -> BindingResponse:
        import httpx

        gp = generation_params or {}
        api_key = _resolve_api_key(config)
        # Stage the new cursor; commit it ONLY after a successful response so a
        # failed/retried request on the same instance cannot skip unsent items
        # (GPT-5.4 S2 verification, finding 1 - failure-atomicity).
        input_items, new_upto = self._to_input_items(transcript, self._sent_upto)
        body: dict = {
            "model": model,
            "instructions": system,
            "input": input_items,
            "max_output_tokens": max_output_tokens,
            "tools": [self._to_openai_tool(t) for t in tools],
            # store=true keeps reasoning + function_call context server-side so
            # previous_response_id chaining works without echoing reasoning.
            "store": True,
        }
        if self._response_id:
            body["previous_response_id"] = self._response_id
        effort = gp.get("reasoning_effort")
        if effort:
            body["reasoning"] = {"effort": effort}
        if force_verdict:
            body["tool_choice"] = {"type": "function", "name": SUBMIT_VERDICT_TOOL}
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        base = config.get("base_url", "https://api.openai.com/v1")
        url = f"{base}/responses"
        timeout = config.get("timeout_seconds", 120)
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()
        # Parse FIRST, then commit chaining state - so a parse failure on a
        # malformed-but-JSON response leaves the cursor untouched and a retry
        # resends rather than skips (GPT-5.4 S2 verification R2, finding 1).
        parsed = self._from_response(data)
        self._response_id = data.get("id") or self._response_id
        self._sent_upto = new_upto
        return parsed

    @staticmethod
    def _to_openai_tool(tool: dict) -> dict:
        # Responses API flattens function tools (no nested "function" key).
        return {
            "type": "function",
            "name": tool["name"],
            "description": tool["description"],
            "parameters": tool["parameters"],
        }

    @staticmethod
    def _to_input_items(
        transcript: List[dict], start: int
    ) -> Tuple[List[dict], int]:
        """Translate only the transcript entries new since ``start``.

        Assistant turns are stored server-side (referenced by
        ``previous_response_id``) and must NOT be resent - resending a
        ``function_call`` without its server-side reasoning item is exactly
        the error the chaining design avoids. Returns ``(items, new_start)``.
        """
        items: List[dict] = []
        for entry in transcript[start:]:
            role = entry["role"]
            if role == "user":
                items.append({"role": "user", "content": entry["text"]})
            elif role == "tool":
                for r in entry["results"]:
                    items.append(
                        {
                            "type": "function_call_output",
                            "call_id": r["id"],
                            "output": r["content"],
                        }
                    )
            # assistant: skip (server-side via previous_response_id)
        return items, len(transcript)

    @staticmethod
    def _from_response(data: dict) -> BindingResponse:
        text_parts: List[str] = []
        tool_calls: List[NeutralToolCall] = []
        for item in data.get("output", []) or []:
            if not isinstance(item, dict):
                continue  # defensive: skip a malformed (e.g. null) output item
            itype = item.get("type")
            if itype == "function_call":
                raw_args = item.get("arguments") or "{}"
                try:
                    parsed = json.loads(raw_args)
                except (ValueError, TypeError):
                    parsed = {}
                if not isinstance(parsed, dict):
                    parsed = {}
                tool_calls.append(
                    NeutralToolCall(
                        id=item.get("call_id", ""),
                        name=item.get("name", ""),
                        input=parsed,
                    )
                )
            elif itype == "message":
                for c in item.get("content", []) or []:
                    if c.get("type") in ("output_text", "text"):
                        text_parts.append(c.get("text", ""))
        usage = data.get("usage", {}) or {}
        in_tok = usage.get("input_tokens") or usage.get("prompt_tokens") or 0
        out_tok = usage.get("output_tokens") or usage.get("completion_tokens") or 0
        status = data.get("status", "completed")
        if status == "incomplete":
            reason = (data.get("incomplete_details") or {}).get("reason")
            stop = (
                "max_tokens"
                if reason == "max_output_tokens"
                else (reason or "incomplete")
            )
        else:
            stop = "end_turn"
        return BindingResponse(
            text="".join(text_parts),
            tool_calls=tool_calls,
            input_tokens=int(in_tok),
            output_tokens=int(out_tok),
            stop_reason=stop,
        )


class GeminiBinding(ProviderBinding):
    """Google Gemini ``function_declarations`` binding.

    Gemini has no per-call tool-call id: a model turn carries ``functionCall``
    parts and the matching results go back as ``functionResponse`` parts in a
    following ``user`` turn, matched positionally by name. The driver's neutral
    ids are synthesized here for internal result routing only and are never
    sent on the wire.
    """

    provider_name = "google"

    def request(
        self,
        *,
        system: str,
        transcript: List[dict],
        tools: List[dict],
        force_verdict: bool,
        max_output_tokens: int,
        model: str,
        config: dict,
        generation_params: Optional[dict] = None,
    ) -> BindingResponse:
        import httpx

        gp = generation_params or {}
        api_key = _resolve_api_key(config)
        base = config.get(
            "base_url", "https://generativelanguage.googleapis.com/v1beta"
        )
        url = f"{base}/models/{model}:generateContent?key={api_key}"

        generation_config: dict = {"maxOutputTokens": max_output_tokens}
        thinking_cfg: dict = {}
        if model.startswith("gemini-3"):
            level = gp.get("thinking_level")
            if level:
                thinking_cfg["thinkingLevel"] = str(level).upper()
        else:
            budget = gp.get("thinking_budget")
            if budget is not None:
                thinking_cfg["thinkingBudget"] = int(budget)
        if thinking_cfg:
            generation_config["thinkingConfig"] = thinking_cfg

        body: dict = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": self._to_contents(transcript),
            "tools": [
                {"function_declarations": [self._to_decl(t) for t in tools]}
            ],
            "generationConfig": generation_config,
        }
        if force_verdict:
            body["tool_config"] = {
                "function_calling_config": {
                    "mode": "ANY",
                    "allowed_function_names": [SUBMIT_VERDICT_TOOL],
                }
            }
        timeout = config.get("timeout_seconds", 120)
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, json=body)
            resp.raise_for_status()
            data = resp.json()
        return self._from_response(data)

    @staticmethod
    def _to_decl(tool: dict) -> dict:
        return {
            "name": tool["name"],
            "description": tool["description"],
            "parameters": tool["parameters"],
        }

    @staticmethod
    def _to_contents(transcript: List[dict]) -> List[dict]:
        contents: List[dict] = []
        for entry in transcript:
            role = entry["role"]
            if role == "user":
                contents.append(
                    {"role": "user", "parts": [{"text": entry["text"]}]}
                )
            elif role == "assistant":
                parts: List[dict] = []
                if entry.get("text"):
                    parts.append({"text": entry["text"]})
                for tc in entry.get("tool_calls", []):
                    parts.append(
                        {"functionCall": {"name": tc.name, "args": tc.input}}
                    )
                contents.append({"role": "model", "parts": parts})
            elif role == "tool":
                # functionResponse parts go in a user turn, matched by name.
                parts = [
                    {
                        "functionResponse": {
                            "name": r["name"],
                            "response": {"result": r["content"]},
                        }
                    }
                    for r in entry["results"]
                ]
                contents.append({"role": "user", "parts": parts})
        return contents

    @staticmethod
    def _from_response(data: dict) -> BindingResponse:
        candidates = data.get("candidates") or [{}]
        parts = (candidates[0].get("content", {}) or {}).get("parts", []) or []
        text_chunks: List[str] = []
        tool_calls: List[NeutralToolCall] = []
        for i, part in enumerate(parts):
            if "text" in part:
                text_chunks.append(part["text"])
            fc = part.get("functionCall")
            if fc:
                name = fc.get("name", "")
                tool_calls.append(
                    NeutralToolCall(
                        id=f"{name}-{i}", name=name, input=fc.get("args", {}) or {}
                    )
                )
        usage = data.get("usageMetadata", {}) or {}
        # thoughtsTokenCount is billed as output but reported separately; fold
        # it into output_tokens so the cost/token caps see honest spend.
        out_tokens = usage.get("candidatesTokenCount", 0) + usage.get(
            "thoughtsTokenCount", 0
        )
        finish = candidates[0].get("finishReason", "STOP")
        stop_reason = (
            "max_tokens"
            if finish == "MAX_TOKENS"
            else "end_turn"
            if finish == "STOP"
            else str(finish).lower()
        )
        return BindingResponse(
            text="".join(text_chunks),
            tool_calls=tool_calls,
            input_tokens=usage.get("promptTokenCount", 0),
            output_tokens=out_tokens,
            stop_reason=stop_reason,
        )


# Binding registry. S2 added openai / google behind the same driver.
_BINDINGS: Dict[str, type] = {
    "anthropic": AnthropicBinding,
    "openai": OpenAIBinding,
    "google": GeminiBinding,
}


def _get_binding(provider: str) -> ProviderBinding:
    cls = _BINDINGS.get(provider)
    if cls is None:
        raise NotImplementedError(
            f"no pull-verifier binding for provider {provider!r}; "
            f"available: {sorted(_BINDINGS)} (OpenAI/Gemini land in Set 067 S2)"
        )
    return cls()


# ---------------------------------------------------------------------------
# Config resolution (shares router-config's providers block; no route() call).
# ---------------------------------------------------------------------------


def _resolve_api_key(provider_config: dict) -> str:
    try:
        from .secret_resolver import resolve_secret
    except ImportError:  # pragma: no cover - test/bare context
        from secret_resolver import resolve_secret  # type: ignore
    env = provider_config.get("api_key_env")
    key = resolve_secret(env) if env else None
    if not key:
        raise PullVerifierError(
            f"missing API key (env {env!r}) for the pull verifier"
        )
    return key


def _load_router_config() -> dict:
    try:
        from .config import load_config
    except ImportError:  # pragma: no cover - test/bare context
        from config import load_config  # type: ignore
    return load_config(os.environ.get("AI_ROUTER_CONFIG"))


def _provider_config(provider: str, config: Optional[dict]) -> dict:
    if config is None:
        config = _load_router_config()
    providers = config.get("providers", {})
    pcfg = providers.get(provider)
    if pcfg is None:
        raise PullVerifierError(
            f"provider {provider!r} not found in router-config providers block"
        )
    return pcfg


# Default model pins per provider, used only when the executor config block
# (router-config.yaml ``pull_verifier.models``) does not pin one. S2 wires the
# config block; these are the last-resort fallbacks.
_DEFAULT_MODELS: Dict[str, str] = {
    "anthropic": "claude-sonnet-4-6",
    "openai": "gpt-5.4",
    "google": "gemini-2.5-pro",
}

# Fallback pricing per model id ($/1M tokens) for cost-cap accounting when the
# router config does not carry the executor model. Kept conservative.
_FALLBACK_PRICING: Dict[str, Tuple[float, float]] = {
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-opus-4-8": (5.00, 25.00),
    "gpt-5.4": (2.50, 15.00),
    "gpt-5.4-mini": (0.75, 4.50),
    "gemini-2.5-pro": (1.25, 10.00),
    "gemini-2.5-flash": (0.30, 2.50),
}


# ---------------------------------------------------------------------------
# Executor config block (router-config.yaml ``pull_verifier:``).
#
# This is the route()-PARALLEL executor's own config: per-provider model pins,
# the shared caps, and optional per-provider generation knobs. It is DISTINCT
# from the single-shot routing table (models / tier_assignments) - the pull
# verifier is not a routed model, it is an agentic seam.
# ---------------------------------------------------------------------------


def _executor_block(config: Optional[dict]) -> dict:
    return (config or {}).get("pull_verifier", {}) or {}


def caps_from_config(config: Optional[dict]) -> PullCaps:
    """Build :class:`PullCaps` from the ``pull_verifier.caps`` block.

    Any field absent from the block falls back to the :class:`PullCaps`
    dataclass default, so a config with no ``pull_verifier`` block yields the
    exact S1 defaults (backward compatible).
    """
    caps_cfg = _executor_block(config).get("caps", {}) or {}
    base = PullCaps()
    return PullCaps(
        max_turns=int(caps_cfg.get("max_turns", base.max_turns)),
        max_output_tokens=int(
            caps_cfg.get("max_output_tokens", base.max_output_tokens)
        ),
        token_budget=int(caps_cfg.get("token_budget", base.token_budget)),
        cost_ceiling_usd=float(
            caps_cfg.get("cost_ceiling_usd", base.cost_ceiling_usd)
        ),
    )


def _resolve_gen_params(provider: str, config: Optional[dict]) -> dict:
    """Per-provider generation knobs from ``pull_verifier.generation_params``."""
    gp = _executor_block(config).get("generation_params", {}) or {}
    return gp.get(provider, {}) or {}


def _resolve_model(
    provider: str, model: Optional[str], config: Optional[dict] = None
) -> str:
    if model:
        return model
    pinned = _executor_block(config).get("models", {}).get(provider)
    if not pinned:
        pinned = _DEFAULT_MODELS.get(provider)
    if not pinned:
        raise PullVerifierError(
            f"no default pull-verifier model for provider {provider!r}; "
            "pass model=..."
        )
    return pinned


def _pricing_for(model: str, config: Optional[dict]) -> Tuple[float, float]:
    """Return ``(input_per_1m, output_per_1m)`` for cost accounting."""
    if config is not None:
        for mcfg in config.get("models", {}).values():
            if mcfg.get("model_id") == model:
                return (
                    float(mcfg.get("input_cost_per_1m", 0.0)),
                    float(mcfg.get("output_cost_per_1m", 0.0)),
                )
    return _FALLBACK_PRICING.get(model, (0.0, 0.0))


# ---------------------------------------------------------------------------
# System prompt for the pull verifier.
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = (
    "You are a path-aware code critic. You are given read-only tools to "
    "retrieve ground truth from a repository sandbox: read_file, grep, and "
    "list_dir. You MUST use these tools to inspect the actual code before "
    "forming any judgment - never assume file contents. Probe as much as you "
    "need, then call submit_verdict exactly once with your structured "
    "critique (verdict, summary, findings). Do not call submit_verdict before "
    "you have read the relevant files. Keep all output ASCII-only."
)


# ---------------------------------------------------------------------------
# The loop driver.
# ---------------------------------------------------------------------------

def pull_route(
    sandbox_dir: Union[str, Path],
    instruction: str,
    *,
    provider: str = "anthropic",
    model: Optional[str] = None,
    caps: Optional[PullCaps] = None,
    config: Optional[dict] = None,
    binding: Optional[ProviderBinding] = None,
    servant: Optional[DeterministicServant] = None,
    run_test_config: Optional[RunTestConfig] = None,
    diff_config: Optional[DiffConfig] = None,
    probe_template_config: Optional["object"] = None,
) -> PullResult:
    """Drive a capped, instrumented, sandbox-confined read-only tool loop.

    The verifier drives the loop; this orchestrator answers probe tool calls
    with raw ground truth and forces a structured verdict. Returns a
    :class:`PullResult` whose ``ok`` is True iff a schema-valid verdict was
    produced AND at least one probe ran.

    Parameters mirror the tool-contract. ``binding`` and ``servant`` are
    injection seams (tests pass a fake binding and/or a bad servant); in
    production they default to the provider binding and the canonical servant.
    """
    sandbox = Path(sandbox_dir).resolve()
    if not sandbox.is_dir():
        raise PullVerifierError(f"sandbox is not a directory: {sandbox}")
    servant = servant or DeterministicServant()
    if binding is None:
        binding = _get_binding(provider)
    provider_name = binding.provider_name
    # Load config ONCE here so pricing, the provider block, the executor model
    # pin, the caps, and the generation knobs all see the same resolved config.
    # Previously _provider_config lazily loaded a config that _pricing_for never
    # saw (it still got None), so configured model pricing was silently ignored
    # on the default path (GPT-5.4 S1 verification, Major #4b) and cost
    # accounting fell back to the conservative table.
    if config is None:
        config = _load_router_config()
    model = _resolve_model(provider_name, model, config)
    # Caps default from the executor block; an explicit caps= always wins.
    caps = caps or caps_from_config(config)
    gen_params = _resolve_gen_params(provider_name, config)
    pcfg = _provider_config(provider_name, config)
    in_price, out_price = _pricing_for(model, config)

    # Set 068: offer run_test ONLY when a cage is configured. Absent that, the
    # offered tools are byte-for-byte the Set 067 read-only set (probes + verdict)
    # so the default loop and every Set 067 test are unchanged.
    tools = _probe_tool_schemas()
    if run_test_config is not None:
        tools.append(_run_test_tool_schema())
    if diff_config is not None:
        tools.append(_get_diff_tool_schema())
    if probe_template_config is not None:
        tools.append(_run_probe_template_tool_schema(probe_template_config))
    # The evidence-proposal fields are offered ONLY when an execution lane that can
    # back a REPRODUCED replay is active (run_test -> commandId; run_probe_template
    # -> templateId), so the no-config agent-facing surface is byte-for-byte the
    # Set 067/068 read-only schema.
    tools.append(
        _verdict_tool_schema(
            allow_evidence=run_test_config is not None,
            allow_template_evidence=probe_template_config is not None,
        )
    )
    transcript: List[dict] = [{"role": "user", "text": instruction}]
    trace = PullTrace()
    critique: Optional[PullCritique] = None
    # Set 069 S2: captured clean run_test executions, so a REPRODUCED claim can
    # be replayed + transcript-backed by the orchestrator (never the agent).
    executions: List[_Execution] = []
    # Running estimate of ONE more call's spend: the most recent turn's measured
    # tokens / cost. Used as an adaptive headroom reserve for the budget-aware
    # forced verdict below.
    last_call_tokens = 0
    last_call_cost = 0.0
    # Backstop flag: when spend has already crossed a ceiling, spend exactly ONE
    # final forced-verdict call before honoring the stop (see below).
    budget_exceeded_forced = False
    t0 = time.time()

    for turn in range(caps.max_turns):
        over_token = (
            trace.input_tokens + trace.output_tokens >= caps.token_budget
        )
        over_cost = trace.cost_usd >= caps.cost_ceiling_usd
        if over_token or over_cost:
            # Budget exhausted. Rather than stop EMPTY, spend ONE final forced
            # call to extract a verdict, THEN honor the stop. The proactive
            # reserve below can be defeated by a single over-sized call (the
            # first turn has no reserve; a later call can be much larger than
            # the previous), so without this backstop a verbose prober could
            # still exit with no verdict (set-067 whole-set critique, GPT
            # finding 3; reproduced). Caps remain POST-HOC (tool-contract
            # sec 5): the backstop overshoots by at most one output-capped call.
            if critique is None and not budget_exceeded_forced:
                budget_exceeded_forced = True
                force_verdict = True
            else:
                trace.stop_reason = (
                    STOP_TOKEN_BUDGET if over_token else STOP_COST_CEILING
                )
                break
        else:
            # Budget-aware forced verdict (Set 067 S4 dogfood; L-067-1). The
            # final-turn force alone does NOT protect against budget exhaustion:
            # a verbose-probing reasoning model (GPT-5.4 / Sonnet observed at
            # 17-28 probes) can spend the whole budget probing. So force
            # submit_verdict PROACTIVELY once ONE MORE call of the last call's
            # measured size would breach either ceiling -- an adaptive headroom
            # reserve, tighter than a fixed fraction a single large turn could
            # blow past (S4 R3 verifier). The over-budget backstop above is the
            # safety net when even this is defeated.
            projected_tokens = (
                trace.input_tokens + trace.output_tokens + last_call_tokens
            )
            projected_cost = trace.cost_usd + last_call_cost
            near_budget = (
                projected_tokens >= caps.token_budget
                or projected_cost >= caps.cost_ceiling_usd
            )
            force_verdict = (turn == caps.max_turns - 1) or near_budget
        response = binding.request(
            system=_SYSTEM_PROMPT,
            transcript=transcript,
            tools=tools,
            force_verdict=force_verdict,
            max_output_tokens=caps.max_output_tokens,
            model=model,
            config=pcfg,
            generation_params=gen_params,
        )
        trace.api_turns += 1
        trace.input_tokens += response.input_tokens
        trace.output_tokens += response.output_tokens
        this_call_cost = (
            response.input_tokens / 1e6 * in_price
            + response.output_tokens / 1e6 * out_price
        )
        trace.cost_usd += this_call_cost
        # Remember this call's size as the headroom reserve for the next turn's
        # budget-aware force decision (adaptive one-call estimate).
        last_call_tokens = response.input_tokens + response.output_tokens
        last_call_cost = this_call_cost

        # Record the assistant turn in the transcript.
        transcript.append(
            {
                "role": "assistant",
                "text": response.text,
                "tool_calls": response.tool_calls,
            }
        )

        verdict_calls = [
            tc for tc in response.tool_calls if tc.name == SUBMIT_VERDICT_TOOL
        ]
        # EVERY non-verdict tool call is dispatched to the servant -- including
        # a tool name we do not recognize. Filtering unknown tools out before
        # dispatch (the old ``tc.name in PROBE_TOOL_NAMES`` test) left the
        # model's tool_use UNANSWERED, which Anthropic/OpenAI reject with a 400
        # on the next turn (an assistant tool_use must be followed by a matching
        # tool_result) and made the servant's "ERROR: unknown tool" branch dead
        # code (set-067 whole-set critique, Gemini finding 1; reproduced). The
        # servant returns a raw ERROR for an unknown tool, which the model sees
        # and can recover from.
        non_verdict_calls = [
            tc for tc in response.tool_calls if tc.name != SUBMIT_VERDICT_TOOL
        ]

        # Finalize on the FIRST VALID verdict; remember errors for invalid ones.
        verdict_errors: Dict[str, str] = {}
        finalized = False
        for vc in verdict_calls:
            try:
                critique = _parse_verdict(provider_name, model, vc.input)
                # Set 069 S2/S3: evidence-tier the findings (orchestrator-applied).
                # Only when an execution lane is active AND a verdict carries
                # findings - so the read-only path is byte-for-byte unchanged. Each
                # captured execution carries its OWN replay context (repo/ref/caps
                # from the lane that ran it), so stamping needs no shared cfg and a
                # mixed-lane run replays every finding against the right tree (S3
                # R2 finding 1).
                exec_lane = (
                    run_test_config is not None
                    or probe_template_config is not None
                )
                if exec_lane and critique.findings:
                    critique = _stamp_evidence_tiers(
                        critique, vc.input, executions
                    )
                trace.stop_reason = STOP_VERDICT
                finalized = True
                break
            except VerdictSchemaError as exc:
                # A malformed / truncated forced verdict (e.g. cut off by
                # max_output_tokens) must NOT crash the run (set-067 critique
                # Gemini finding 4). Record the error to feed back; on a final
                # forced turn with no retry the loop ends with no verdict
                # (ok=False), never an unhandled exception.
                verdict_errors[vc.id] = (
                    f"ERROR: invalid submit_verdict: {exc}. Re-call "
                    "submit_verdict with a non-empty verdict and a non-empty "
                    "summary OR at least one finding with a description."
                )
        if finalized:
            break

        if not response.tool_calls:
            # Model returned text with no tool use. Nudge it toward a verdict;
            # the next turn (or the forced final turn) will resolve it.
            transcript.append(
                {
                    "role": "user",
                    "text": (
                        "Use the read-only tools to inspect the code, then "
                        "call submit_verdict with your structured critique."
                    ),
                }
            )
            continue

        # Answer EVERY tool_use this turn with a tool_result so the next request
        # is API-valid -- probes + unknown tools through the servant, and EVERY
        # (invalid) submit_verdict call with its error text, including extra /
        # sibling verdict calls (set-067 0.21.1 R1: answering only the first
        # left extras unanswered -> a 400 on the next turn).
        results = []
        for tc in non_verdict_calls:
            # Set 068: run_test is dispatched to the disposable-worktree CAGE, not
            # the read-only servant, and therefore NOT through the byte-equality
            # guard (execution is non-re-derivable - see run-test-contract.md sec
            # 1). It is still recorded as a real probe (raw=True), so a verdict
            # informed by a run_test is correctly NOT a zero_tool_calls run.
            if tc.name == RUN_TEST_TOOL and run_test_config is not None:
                content, is_error, elided, execution = _dispatch_run_test(
                    run_test_config, tc.input
                )
                if execution is not None:
                    executions.append(execution)
                trace.tool_calls.append(
                    ToolCallRecord(
                        turn=turn,
                        name=tc.name,
                        args=tc.input,
                        raw=True,
                        elided=elided,
                        result_chars=len(content),
                        error=is_error,
                    )
                )
                results.append(
                    {"id": tc.id, "name": tc.name, "content": content}
                )
                continue
            # Set 069 S2: get_diff is dispatched directly (orchestrator runs git;
            # no model-touchable servant, so NOT through the byte-equality guard -
            # same posture as run_test). Recorded as a real probe.
            if tc.name == GET_DIFF_TOOL and diff_config is not None:
                content, is_error, elided = _dispatch_get_diff(diff_config)
                trace.tool_calls.append(
                    ToolCallRecord(
                        turn=turn,
                        name=tc.name,
                        args=tc.input,
                        raw=True,
                        elided=elided,
                        result_chars=len(content),
                        error=is_error,
                    )
                )
                results.append(
                    {"id": tc.id, "name": tc.name, "content": content}
                )
                continue
            # Set 069 S3: run_probe_template -> the cage (like run_test, OUTSIDE
            # the byte-equality guard; a clean run is captured so a REPRODUCED
            # claim can be replayed + transcript-backed via the templateId lane).
            if (
                tc.name == RUN_PROBE_TEMPLATE_TOOL
                and probe_template_config is not None
            ):
                content, is_error, elided, execution = _dispatch_run_probe_template(
                    probe_template_config, tc.input
                )
                if execution is not None:
                    executions.append(execution)
                trace.tool_calls.append(
                    ToolCallRecord(
                        turn=turn,
                        name=tc.name,
                        args=tc.input,
                        raw=True,
                        elided=elided,
                        result_chars=len(content),
                        error=is_error,
                    )
                )
                results.append(
                    {"id": tc.id, "name": tc.name, "content": content}
                )
                continue
            tool_result = servant.run(tc.name, tc.input, sandbox)
            _guard_raw_ground_truth(tc.name, tc.input, tool_result, sandbox)
            is_error = tool_result.content.startswith("ERROR: ")
            trace.tool_calls.append(
                ToolCallRecord(
                    turn=turn,
                    name=tc.name,
                    args=tc.input,
                    raw=tool_result.raw,
                    elided=tool_result.elided,
                    result_chars=len(tool_result.content),
                    error=is_error,
                )
            )
            results.append(
                {
                    "id": tc.id,
                    "name": tc.name,
                    "content": tool_result.content,
                }
            )
        for vc in verdict_calls:
            results.append(
                {
                    "id": vc.id,
                    "name": SUBMIT_VERDICT_TOOL,
                    "content": verdict_errors.get(
                        vc.id,
                        "ERROR: invalid submit_verdict; resubmit a valid "
                        "payload (non-empty verdict; non-empty summary OR a "
                        "finding with a description).",
                    ),
                }
            )
        transcript.append({"role": "tool", "results": results})
    else:
        # Loop exhausted max_turns without a verdict-or-budget break.
        trace.stop_reason = STOP_MAX_TURNS

    trace.wall_seconds = time.time() - t0
    return PullResult(
        provider=provider_name,
        model=model,
        critique=critique,
        trace=trace,
    )


# ---------------------------------------------------------------------------
# CLI (diagnostic only; the S4 producer wiring is a separate seam).
# ---------------------------------------------------------------------------


def _main(argv: Optional[List[str]] = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(
        description=(
            "Run the first-party pull verifier over a sandbox (diagnostic)."
        )
    )
    parser.add_argument("sandbox", help="read-only review sandbox directory")
    parser.add_argument(
        "--instruction",
        default="Review this repository for real defects.",
        help="the critique task",
    )
    parser.add_argument("--provider", default="anthropic")
    parser.add_argument("--model", default=None)
    parser.add_argument("--out", default=None, help="write the result JSON here")
    args = parser.parse_args(argv)

    result = pull_route(
        args.sandbox,
        args.instruction,
        provider=args.provider,
        model=args.model,
    )
    payload = json.dumps(result.to_dict(), indent=2)
    if args.out:
        # L-064-3: write to disk (utf-8) before printing.
        Path(args.out).write_text(payload, encoding="utf-8")
        print(f"Wrote {args.out} ({len(payload)} chars); ok={result.ok}")
    else:
        print(payload)
    return 0 if result.ok else 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(_main())
