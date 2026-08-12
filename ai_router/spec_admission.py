"""Authoring-time session admission test: size (Set 111 S4) and shape (Set 128 S1).

**Who uses this:** a spec author, before a set starts —
``python -m ai_router.spec_admission --spec docs/session-sets/<slug>/spec.md``.
Also runnable across every spec (``--all``) as a CI-friendly report.
**See also:** ``docs/planning/session-set-authoring-guide.md`` →
*Sizing a session set* (the prose this check enforces); ``spec_config.py``
(the configuration-block parser, a different concern).

---

Why a check and not a paragraph
-------------------------------
The operator's target is **15-20 minutes of work per session** plus 5-20
minutes of verification scaled to risk (proposal
``2026-08-04-verification-loop-parallelisation-vs-acceptance-criteria.md``
§3). Sets 047-074 already met it. The guide has carried sizing prose since
Set 015 and sessions kept growing anyway, because a session's real size is
only discovered at hour three, by which point splitting costs a context
reset.

The threshold is **measured, not asserted.** Across the 172 schema-v4
sessions in this repo that carry both a parseable spec plan and
start/complete timestamps:

===============  ====  ===========  =======  ======
spec step count     n  median min   p90 min  > 2 h
===============  ====  ===========  =======  ======
1-5 steps         106           42      110     10%
6-8 steps          64           84      386     28%
9-11 steps          2           86      114      0%
===============  ====  ===========  =======  ======

Crossing from 5 steps to 6 **doubles** the median session (42 -> 84 min),
triples the p90 (110 -> 386 min), and nearly triples the share of sessions
that run past two hours (10% -> 28%).

**Re-baselined by Set 128 S1 — read the table before comparing numbers.**
That measurement was taken on specs whose declared steps *already
absorbed the ceremony*: Set 127 S1 spent three of its six declared steps
on register / verify / close, so a historical "5 declared" was roughly
**3-4 real work steps**. Under the step skeleton below, ``4 + N``
declared steps contain only ``N`` work steps, so the old bands do not
transfer and the cap could not be carried over unexamined. The operator
ratified **N = 3 work steps** on 2026-08-12, the value that holds the
measured 42-minute median once the ceremony is subtracted (N = 4 was
their own opening suggestion and was rejected as a deliberate loosening
rather than a re-count). So :data:`DEFAULT_MAX_STEPS` = **7** — four
baked-in ceremony steps plus three authored ones — and it is a tripwire
the author answers at authoring time.

What this check does NOT claim
------------------------------
Step count predicts the **median**, not the **tail**. The longest sessions
on record (591, 562, 544, 509 min) all declared 5-8 steps — within or
barely over the cap. Something other than step count drives the tail, and
this check does not pretend to catch it; a session can pass the admission
test and still run long. Treating a green result as a promise of a short
session is a misreading. It is a floor on obvious oversizing, nothing more.

Reporting, not blocking, by default
-----------------------------------
``--check`` exits non-zero so CI or a pre-commit hook can gate on it.
Without it the CLI reports and exits 0. An author who has a real reason to
exceed the cap records it in the spec with an explicit
``sessionSizeException:`` line naming the session number and the reason
(see :func:`parse_size_exceptions`) — the exception is *declared in the
spec*, so it survives review, rather than being argued at hour three.

The step SHAPE, beside the step count (Set 128 S1)
---------------------------------------------------
Counting steps never noticed *what* a step said, so a spec could compress
three canonical stages into one numbered instruction in the wrong internal
order — and one did. Set 127 Session 2 declared

    5. Full pytest and the Layer 3 run recorded as runs of record; verify; close.

and the orchestrator followed the spec's letter over the ordering policy
that outranks it, spending a 752-second pytest run and a 350-second
Playwright run that a blocking verification finding immediately staled.
Set 112 S3 had already done the same thing into 15 runs and 186 minutes.
The policy was never in doubt; the **shape a spec may declare its steps
in** is what let a retired ordering be re-encoded in prose, where nothing
could check it.

So every session declares ``Register`` + its authored work + a fixed
three-step tail:

============  ===============================================  =========
position      step                                             baked in?
============  ===============================================  =========
1             Register                                         yes
2 ... N+1     the session's actual work                        no
-3            Cross-provider verification                      yes
-2            Required portion of the full test suite          yes
-1            Close-out                                        yes
============  ===============================================  =========

:func:`check_step_shape` recognises those four by **intent**, not by exact
prose — an author who writes "Close out" must not fail on a hyphen — and
it requires each tail step to name exactly one of them, which is what
makes the compressed shape above unwriteable.

Scope boundary: the compression rule reads the **tail region** only. A
work step that merely *describes* verification and a full suite (this
module's own set spec has one) is prose, not ceremony; a work step that
*orders* an early full suite is an A2 ordering concern owned by Set 128
Session 2, not a shape concern.

Requires restructuring, or an informational note
------------------------------------------------
Operator ratification, 2026-08-12 (journalled in Set 128's
``decisions.jsonl``): the shape is **blocking** for a set that has not
started — where restructuring is a text edit and the sessions have yet to
be run — and an **informational note** for every set already started,
complete, or cancelled. The note is deliberately not a warning: those
specs were authored at a different time under a different approach, and
nothing about them is wrong. "Not started" is read from the set's
``session-state.json``, the repo's single source of truth for set
progress; a spec with no state file beside it has never been registered
and is the primary authoring-time case.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

try:
    from .config import load_config  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - direct-script fallback
    try:
        from config import load_config  # type: ignore[no-redef]
    except ImportError:  # pragma: no cover
        load_config = None  # type: ignore[assignment]

try:
    from .progress import canonicalize_status  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - direct-script fallback
    try:
        from progress import canonicalize_status  # type: ignore[no-redef]
    except ImportError:  # pragma: no cover
        canonicalize_status = None  # type: ignore[assignment]


# Locked default (see module docstring for the measurement behind it):
# 4 baked-in ceremony steps + WORK_STEP_BUDGET authored ones.
WORK_STEP_BUDGET = 3
CEREMONY_STEPS = 4
DEFAULT_MAX_STEPS = CEREMONY_STEPS + WORK_STEP_BUDGET

# A session heading in a spec: "### Session 2 of 4: Title".
_SESSION_HEAD_RE = re.compile(
    r"^###\s+Session\s+(\d+)(?:\s+of\s+(\d+))?\s*:\s*(.*)$",
    re.MULTILINE,
)

# A top-level ordered step. Indented list items (sub-steps) are excluded by
# capping the leading whitespace at 3 characters — 4+ spaces is a nested
# list in Markdown.
_STEP_RE = re.compile(r"^\s{0,3}(\d+)\.\s+\S", re.MULTILINE)

# A fenced code block. Steps inside a fence are documentation samples (the
# authoring guide's own spec template is a fenced block full of numbered
# lines) and must not be counted as this spec's steps.
_FENCE_RE = re.compile(r"^\s*(?:```|~~~)", re.MULTILINE)

# An author-declared, spec-resident exception:
#   sessionSizeException: 4 — reason text
# Tolerates ':' or '-' or an em/en dash as the separator.
_EXCEPTION_RE = re.compile(
    r"^\s*sessionSizeException\s*:\s*(\d+)\s*(?:[-:\u2013\u2014]\s*)?(.*)$",
    re.MULTILINE | re.IGNORECASE,
)


# --- The step skeleton (Set 128 S1) --------------------------------------

# The four baked-in steps are recognised by INTENT, not by exact prose.
# Matching a fixed sentence would fail an author who writes "Close out"
# instead of "Close-out" while still passing one who writes the retired
# compressed ordering in different words - exactly backwards. Each intent
# is a family of the phrasings this repo's 45 specs actually use.
REGISTER = "register"
VERIFICATION = "cross-provider verification"
FULL_SUITE = "required portion of the full test suite"
CLOSE_OUT = "close-out"

_INTENT_RE: Dict[str, Tuple[re.Pattern[str], ...]] = {
    REGISTER: (
        re.compile(r"\bregist(?:er|ers|ered|ering|ration)\b", re.IGNORECASE),
    ),
    VERIFICATION: (
        re.compile(r"\bcross[-\s]?provider\b", re.IGNORECASE),
        re.compile(r"\bverif(?:y|ies|ied|ying|ication)\b", re.IGNORECASE),
        re.compile(r"\bpath[-\s]?aware\s+critique\b", re.IGNORECASE),
    ),
    FULL_SUITE: (
        # ``suites?`` and ``tests?``: round 1 found the singular-only forms
        # let "Run the full suites, then cross-provider verification" past
        # the compression rule -- and this set's own spec calls the bad
        # shape "full suites; verify; close".
        re.compile(r"\bfull\b[^.;]{0,40}?\bsuites?\b", re.IGNORECASE),
        re.compile(r"\bfull\s+(?:pytest|playwright|tests?)\b", re.IGNORECASE),
        re.compile(r"\brequired\s+portion\b", re.IGNORECASE),
        re.compile(r"\bruns?\s+of\s+record\b", re.IGNORECASE),
        # "all tests" / "every test" / "the whole suite" are the ordinary
        # ways an engine says the same obligation (round 1, finding 2).
        re.compile(r"\ball\s+(?:the\s+)?tests?\b", re.IGNORECASE),
        re.compile(r"\bevery\s+(?:test|suite)\b", re.IGNORECASE),
        re.compile(r"\b(?:whole|entire)\s+(?:test\s+)?suites?\b", re.IGNORECASE),
    ),
    CLOSE_OUT: (
        # "close-out", "close out", "closeout", "closing out".
        re.compile(r"\bclos(?:e|ing)[-\s]?out\b", re.IGNORECASE),
        # A BARE "close" only where it stands as the instruction itself --
        # at the end of the step or before punctuation, which is how the
        # Set 127 S2 shape wrote it ("...; verify; close."). Round 2 found
        # that an unqualified \bclose\b also matched "Close the tracking
        # issue.", so an arbitrary final work step satisfied the skeleton
        # and a spec with NO close-out step passed.
        re.compile(r"\bclose\b\s*(?:[.;,)\]]|$)", re.IGNORECASE),
        re.compile(
            r"\bclos(?:e|es|ing)\s+(?:the\s+|this\s+)?(?:session|set)\b",
            re.IGNORECASE,
        ),
        re.compile(r"\bclose_session\b", re.IGNORECASE),
    ),
}

# The tail, in the order it must appear, counted from the end.
TAIL_INTENTS: Tuple[str, ...] = (VERIFICATION, FULL_SUITE, CLOSE_OUT)

# Set statuses that mean the set has already been registered. Anything
# else - including a missing state file - means the sessions have not run
# and restructuring is still a text edit.
_STARTED_STATUSES = frozenset({"in-progress", "complete", "cancelled"})

# Sentinel for "resolve the set status from disk", so an explicit
# ``set_status=None`` can still mean "there is no state file".
_AUTO = object()


@dataclass(frozen=True)
class SessionPlan:
    """One session's parsed plan.

    ``steps`` carries the step **text** in spec order, added by Set 114 S2
    so ``start_session`` can seed the plan into ``activity-log.json``
    without a second spec parser (L-069-1: the duplicate-parser bug is
    this repo's most repeated defect). It defaults to ``()`` so a
    consumer-repo caller that constructs a ``SessionPlan`` positionally
    keeps working; ``step_count`` stays an independent field for the
    same reason, and :func:`parse_session_plans` always sets it to
    ``len(steps)``.
    """

    number: int
    title: str
    step_count: int
    steps: Tuple[str, ...] = ()


@dataclass(frozen=True)
class ShapeFinding:
    """One departure from the step skeleton, in one session.

    ``position`` is the step's 1-based position as the author numbered it
    (0 when the finding is about the session as a whole), and ``problem``
    is the sentence an author reads. Both are carried rather than a code,
    because the point of the check is that the author can fix the spec
    without reading this module.
    """

    session_number: int
    position: int
    problem: str

    def to_dict(self) -> dict:
        return {
            "session_number": self.session_number,
            "position": self.position,
            "problem": self.problem,
        }


def intents_named(step_text: str) -> Tuple[str, ...]:
    """Return every skeleton intent *step_text* names, in a stable order.

    A step naming more than one tail intent is the compression this check
    exists to make unwriteable; returning the whole set (rather than a
    first match) is what lets the caller say so.
    """
    return tuple(
        intent
        for intent in (REGISTER, VERIFICATION, FULL_SUITE, CLOSE_OUT)
        if any(p.search(step_text) for p in _INTENT_RE[intent])
    )


def _describe(intents: Sequence[str]) -> str:
    return " + ".join(intents) if intents else "no recognisable ceremony step"


def check_step_shape(plan: SessionPlan) -> List[ShapeFinding]:
    """Return every way *plan*'s steps depart from the skeleton.

    The first step registers; the last three are cross-provider
    verification, then the required portion of the full test suite, then
    close-out, each naming exactly one of those intents. Anything in
    between is the session's authored work and is not inspected — a work
    step that *describes* verification is prose, not ceremony.
    """
    findings: List[ShapeFinding] = []
    steps = plan.steps
    if len(steps) < CEREMONY_STEPS:
        findings.append(
            ShapeFinding(
                plan.number,
                0,
                f"declares {len(steps)} step(s); the skeleton needs at least "
                f"{CEREMONY_STEPS} (Register, then the "
                "verification / full-suite / close-out tail)",
            )
        )
        return findings

    if REGISTER not in intents_named(steps[0]):
        findings.append(
            ShapeFinding(
                plan.number,
                1,
                "step 1 must be Register, and this one does not register",
            )
        )

    tail_start = len(steps) - len(TAIL_INTENTS)
    for offset, expected in enumerate(TAIL_INTENTS):
        position = tail_start + offset + 1
        named = intents_named(steps[tail_start + offset])
        tail_named = [i for i in named if i in TAIL_INTENTS]
        if expected not in tail_named:
            findings.append(
                ShapeFinding(
                    plan.number,
                    position,
                    f"step {position} must be '{expected}'; it names "
                    f"{_describe(tail_named)}",
                )
            )
        elif len(tail_named) > 1:
            others = [i for i in tail_named if i != expected]
            findings.append(
                ShapeFinding(
                    plan.number,
                    position,
                    f"step {position} compresses '{expected}' together with "
                    f"{_describe(others)} into one instruction; each tail "
                    "step declares exactly one stage, in any words, so its "
                    "ordering is checkable rather than stated in prose",
                )
            )
    return findings


def resolve_set_status(spec_path: str) -> Optional[str]:
    """Return the set's ``session-state.json`` status, or None.

    None means no state file beside the spec, i.e. the set has never been
    registered — the primary authoring-time case, and the one the shape
    check blocks. An unreadable or malformed state file resolves to
    ``"in-progress"``: the file exists, and only ``start_session`` creates
    it, so its presence is itself evidence the set was registered. Reading
    a corrupt file as "never started" would turn a state-file bug into a
    blocking finding against work already in flight.

    The status is passed through :func:`progress.canonicalize_status`
    rather than compared raw. This repo already canonicalizes ``done`` and
    ``completed`` to ``complete`` on read, because hand-written files
    carrying a past-participle token are a drift that has happened before;
    a second, stricter notion of "what status means" here would read such a
    set as never started and demand restructuring of a spec whose sessions
    are closed (round 1). One canonicalizer, used everywhere (L-069-1).
    """
    state_path = os.path.join(os.path.dirname(spec_path), "session-state.json")
    if not os.path.isfile(state_path):
        return None
    try:
        with open(state_path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return "in-progress"
    if not isinstance(data, dict):
        return "in-progress"
    status = data.get("status")
    if not isinstance(status, str):
        return "in-progress"
    if canonicalize_status is None:  # pragma: no cover - import fallback
        return status
    return canonicalize_status(status)


@dataclass
class SpecAdmission:
    """The admission verdict for one spec."""

    spec_path: str
    max_steps: int
    sessions: List[SessionPlan] = field(default_factory=list)
    exceptions: Dict[int, str] = field(default_factory=dict)
    # Sessions over the cap with no declared exception.
    violations: List[SessionPlan] = field(default_factory=list)
    # Sessions over the cap that DO carry a declared exception.
    excepted: List[SessionPlan] = field(default_factory=list)
    # Set 128 S1: how each session's steps depart from the skeleton, and
    # whether that blocks. ``set_status`` is the set's own
    # ``session-state.json`` status, or None when it has no state file.
    shape_findings: List[ShapeFinding] = field(default_factory=list)
    set_status: Optional[str] = None
    error: Optional[str] = None

    @property
    def set_started(self) -> bool:
        """True when the set has been registered at least once.

        A started set's spec earns an informational note rather than a
        restructuring requirement: its sessions were planned under the
        approach of their time, and rewriting step text a closed session
        already executed changes nothing that will ever run.
        """
        return self.set_status in _STARTED_STATUSES

    @property
    def restructuring_required(self) -> List[ShapeFinding]:
        """Shape findings that block, i.e. those on an unstarted set."""
        return [] if self.set_started else list(self.shape_findings)

    @property
    def passed(self) -> bool:
        return (
            self.error is None
            and not self.violations
            and not self.restructuring_required
        )


def _strip_fenced_blocks(text: str) -> str:
    """Blank out fenced code blocks, preserving line count and offsets.

    Replacing fenced content with same-length blank lines keeps every
    surviving line at its original index, so a heading's position relative
    to the steps that follow it is unchanged. The authoring guide's own
    embedded spec template (a fenced block with numbered lines) would
    otherwise be counted as real steps.
    """
    out: List[str] = []
    in_fence = False
    for line in text.split("\n"):
        if _FENCE_RE.match(line):
            in_fence = not in_fence
            out.append("")
            continue
        out.append("" if in_fence else line)
    return "\n".join(out)


def parse_size_exceptions(text: str) -> Dict[int, str]:
    """Return ``{session_number: reason}`` for declared size exceptions.

    An exception with an empty reason is **not** honoured — an
    undocumented exception is indistinguishable from a typo, and the whole
    point is that the justification survives review.
    """
    out: Dict[int, str] = {}
    for m in _EXCEPTION_RE.finditer(text):
        reason = m.group(2).strip()
        if reason:
            out[int(m.group(1))] = reason
    return out


def parse_step_texts(segment: str) -> List[str]:
    """Return the text of each top-level step in a session's *segment*.

    Set 114 S2. The admission test only ever needed the step **count**;
    seeding the plan into the activity log needs the step **text**, and
    a second parser for the same list is exactly the duplicate-parser
    defect this repo repeats most (L-069-1). So the text extractor is
    the primitive and :func:`parse_session_plans` counts what it finds —
    the two cannot disagree about what a step is.

    A step runs from its ``N.`` marker to the next one, and ends early at
    the first following line that starts in **column 0** — that is how a
    Markdown list ends, and it is what keeps the ``**Creates:**`` /
    ``**Touches:**`` trailer out of the last step's text. Continuation
    lines and nested bullets (all indented) stay with their step.
    Internal whitespace is collapsed to single spaces so the result is
    one line fit for a log entry's description.

    Spans are cut at the marker's own **line start**, not at
    ``match.start()``: ``_STEP_RE``'s leading ``\\s{0,3}`` can consume the
    preceding newline, so a step introduced by a blank line matches from
    that blank line. Counting never noticed (the match count is the
    same); slicing did — the first step of every session came out empty.
    """
    marks = list(_STEP_RE.finditer(segment))
    bounds = [segment.rfind("\n", 0, m.start(1)) + 1 for m in marks]
    texts: List[str] = []
    for i, start in enumerate(bounds):
        end = bounds[i + 1] if i + 1 < len(bounds) else len(segment)
        lines = segment[start:end].split("\n")
        kept = [lines[0]] if lines else []
        for line in lines[1:]:
            if line.strip() and not line[:1].isspace():
                break
            kept.append(line)
        body = " ".join(kept)
        body = re.sub(r"^\s*\d+\.\s*", "", body)
        texts.append(re.sub(r"\s+", " ", body).strip())
    return texts


def parse_session_plans(text: str) -> List[SessionPlan]:
    """Parse ``### Session N of M: Title`` blocks and count their steps.

    The step count is the number of distinct top-level ordered-list items
    between one session heading and the next, outside code fences. A spec
    that restarts numbering mid-session (two ``1.`` items) counts both,
    which is the honest reading: they are two things the session must do.
    """
    body = _strip_fenced_blocks(text)
    heads = list(_SESSION_HEAD_RE.finditer(body))
    plans: List[SessionPlan] = []
    for i, m in enumerate(heads):
        start = m.end()
        end = heads[i + 1].start() if i + 1 < len(heads) else len(body)
        steps = tuple(parse_step_texts(body[start:end]))
        plans.append(
            SessionPlan(
                number=int(m.group(1)),
                title=(m.group(3) or "").strip(),
                step_count=len(steps),
                steps=steps,
            )
        )
    return plans


def check_spec(
    spec_path: str,
    max_steps: int = DEFAULT_MAX_STEPS,
    set_status: object = _AUTO,
) -> SpecAdmission:
    """Run the admission test against one ``spec.md``.

    *set_status* is the set's ``session-state.json`` status and decides
    whether a shape departure requires restructuring or is only reported;
    it is resolved from disk unless a caller passes it explicitly (None
    meaning "no state file", i.e. never registered).
    """
    result = SpecAdmission(spec_path=spec_path, max_steps=max_steps)
    result.set_status = (
        resolve_set_status(spec_path) if set_status is _AUTO else set_status
    )  # type: ignore[assignment]
    try:
        with open(spec_path, "r", encoding="utf-8") as fh:
            text = fh.read()
    except OSError as exc:
        result.error = f"unreadable: {exc}"
        return result

    result.sessions = parse_session_plans(text)
    result.exceptions = parse_size_exceptions(text)
    if not result.sessions:
        result.error = (
            "no '### Session N of M: <title>' headings found; the sizing "
            "check needs the authoring guide's session-plan layout"
        )
        return result

    for plan in result.sessions:
        result.shape_findings.extend(check_step_shape(plan))
        if plan.step_count <= max_steps:
            continue
        if plan.number in result.exceptions:
            result.excepted.append(plan)
        else:
            result.violations.append(plan)
    return result


def load_max_steps(config: Optional[dict] = None) -> int:
    """Return the configured cap from ``authoring.max_steps_per_session``.

    Falls back to :data:`DEFAULT_MAX_STEPS` on a missing block or any
    non-positive / non-integer value — a config typo must not silently
    disable the check by setting the cap to zero or a string.
    """
    if not isinstance(config, dict):
        return DEFAULT_MAX_STEPS
    block = config.get("authoring")
    if not isinstance(block, dict):
        return DEFAULT_MAX_STEPS
    value = block.get("max_steps_per_session")
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        return DEFAULT_MAX_STEPS
    return value


def _ascii_safe(text: str) -> str:
    """Down-convert *text* to ASCII for console output.

    Spec titles routinely carry em dashes and smart quotes, and this CLI
    prints to a Windows console whose text layer defaults to ``cp1252``
    (L-079-1). Replacing the common typographic characters keeps the
    report readable instead of mojibake, and the final ``encode/decode``
    guarantees no character can raise on the way out.
    """
    for src, dst in (
        ("\u2014", "-"), ("\u2013", "-"), ("\u2018", "'"), ("\u2019", "'"),
        ("\u201c", '"'), ("\u201d", '"'), ("\u2026", "..."), ("\u00a0", " "),
    ):
        text = text.replace(src, dst)
    return text.encode("ascii", "replace").decode("ascii")


def format_report(result: SpecAdmission) -> str:
    """Render a human-readable report for one spec."""
    lines: List[str] = []
    rel = result.spec_path
    if result.error:
        return f"[!] {rel}\n    {_ascii_safe(result.error)}"

    shaped = {f.session_number for f in result.shape_findings}
    lines.append(f"{rel}  (cap: {result.max_steps} steps/session)")
    for plan in result.sessions:
        if plan.step_count > result.max_steps:
            mark = "[x]" if plan.number in result.exceptions else "[!]"
        elif plan.number in shaped and not result.set_started:
            mark = "[!]"
        else:
            mark = "[ok]"
        title = _ascii_safe(plan.title)[:52]
        lines.append(
            f"  {mark:<4} Session {plan.number}: {plan.step_count} steps  {title}"
        )
    for plan in result.excepted:
        lines.append(
            f"       exception (Session {plan.number}): "
            f"{_ascii_safe(result.exceptions[plan.number])}"
        )
    if result.violations:
        nums = ", ".join(str(p.number) for p in result.violations)
        lines.append(
            f"  OVER CAP: session(s) {nums}. Split at authoring, or declare "
            f"'sessionSizeException: <N> - <reason>' in the spec."
        )
    if result.shape_findings and result.set_started:
        # Not a warning. The operator's ruling (Set 128 S1): these specs
        # were authored at a different time under a different approach,
        # and nothing about them is wrong - so the note says what is true
        # and stops there.
        lines.append(
            "  note: authored before the step skeleton (Set 128); the "
            "skeleton applies to sets that have not started."
        )
    elif result.shape_findings:
        lines.append(
            "  REQUIRES RESTRUCTURING: every session declares Register, its "
            "work, then cross-provider verification, the required portion "
            "of the full test suite, and close-out."
        )
        for finding in result.shape_findings:
            lines.append(
                f"       Session {finding.session_number}: "
                f"{_ascii_safe(finding.problem)}"
            )
    return "\n".join(lines)


def _discover_specs(root: str) -> List[str]:
    base = os.path.join(root, "docs", "session-sets")
    if not os.path.isdir(base):
        return []
    found: List[str] = []
    for name in sorted(os.listdir(base)):
        path = os.path.join(base, name, "spec.md")
        if os.path.isfile(path):
            found.append(path)
    return found


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="spec_admission",
        description=(
            "Authoring-time session-size admission test. A spec step list "
            "that plainly exceeds the cap is split at authoring, not "
            "discovered at hour three."
        ),
    )
    p.add_argument("--spec", help="Path to a single spec.md to check.")
    p.add_argument(
        "--all",
        action="store_true",
        help="Check every docs/session-sets/*/spec.md under --repo-root.",
    )
    p.add_argument(
        "--repo-root",
        default=os.getcwd(),
        help="Repository root for --all discovery (default: cwd).",
    )
    p.add_argument(
        "--max-steps",
        type=int,
        default=None,
        help=(
            "Override the per-session step cap (default: "
            f"authoring.max_steps_per_session, else {DEFAULT_MAX_STEPS})."
        ),
    )
    p.add_argument(
        "--check",
        action="store_true",
        help="Exit non-zero when any session exceeds the cap without a "
        "declared exception.",
    )
    return p


def run(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)

    if args.max_steps is not None:
        if args.max_steps < 1:
            print(
                "spec_admission: --max-steps must be >= 1",
                file=sys.stderr,
            )
            return 2
        max_steps = args.max_steps
    else:
        cfg = None
        if load_config is not None:
            try:
                cfg = load_config()
            except Exception:  # pragma: no cover - config is advisory here
                cfg = None
        max_steps = load_max_steps(cfg)

    if args.all:
        specs = _discover_specs(args.repo_root)
        if not specs:
            print(
                f"spec_admission: no specs found under {args.repo_root}",
                file=sys.stderr,
            )
            return 2
    elif args.spec:
        specs = [args.spec]
    else:
        print(
            "spec_admission: pass --spec <path> or --all",
            file=sys.stderr,
        )
        return 2

    results = [check_spec(s, max_steps) for s in specs]

    if args.all:
        # Report only the specs that have something to say, so the
        # all-specs sweep stays readable. An informational shape note on
        # an already-started set is not something to say.
        noisy = [
            r
            for r in results
            if r.violations or r.excepted or r.error or r.restructuring_required
        ]
        for r in noisy:
            print(format_report(r))
            print()
        clean = len(results) - len(noisy)
        restructure = sum(1 for r in results if r.restructuring_required)
        print(
            f"{len(results)} spec(s) checked; {clean} clean, "
            f"{sum(len(r.violations) for r in results)} session(s) over cap "
            f"without an exception, {restructure} unstarted spec(s) requiring "
            f"restructuring."
        )
    else:
        for r in results:
            print(format_report(r))

    if args.check and any(not r.passed for r in results):
        return 1
    return 0


def main(argv: Optional[Sequence[str]] = None) -> int:
    return run(argv)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())


__all__ = [
    "CEREMONY_STEPS",
    "CLOSE_OUT",
    "DEFAULT_MAX_STEPS",
    "FULL_SUITE",
    "REGISTER",
    "TAIL_INTENTS",
    "VERIFICATION",
    "WORK_STEP_BUDGET",
    "SessionPlan",
    "ShapeFinding",
    "SpecAdmission",
    "check_spec",
    "check_step_shape",
    "format_report",
    "intents_named",
    "load_max_steps",
    "parse_session_plans",
    "parse_size_exceptions",
    "parse_step_texts",
    "resolve_set_status",
    "main",
    "run",
]
