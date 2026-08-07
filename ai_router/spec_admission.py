"""Authoring-time session-size admission test (Set 111 S4).

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
that run past two hours (10% -> 28%). So the default cap is
:data:`DEFAULT_MAX_STEPS` = 5, and it is a tripwire the author answers at
authoring time.

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
"""

from __future__ import annotations

import argparse
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


# Locked default (see module docstring for the measurement behind it).
DEFAULT_MAX_STEPS = 5

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


@dataclass(frozen=True)
class SessionPlan:
    """One session's parsed plan."""

    number: int
    title: str
    step_count: int


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
    error: Optional[str] = None

    @property
    def passed(self) -> bool:
        return self.error is None and not self.violations


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
        segment = body[start:end]
        plans.append(
            SessionPlan(
                number=int(m.group(1)),
                title=(m.group(3) or "").strip(),
                step_count=len(_STEP_RE.findall(segment)),
            )
        )
    return plans


def check_spec(spec_path: str, max_steps: int = DEFAULT_MAX_STEPS) -> SpecAdmission:
    """Run the admission test against one ``spec.md``."""
    result = SpecAdmission(spec_path=spec_path, max_steps=max_steps)
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

    lines.append(f"{rel}  (cap: {result.max_steps} steps/session)")
    for plan in result.sessions:
        if plan.step_count > result.max_steps:
            mark = "[x]" if plan.number in result.exceptions else "[!]"
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
        # all-specs sweep stays readable.
        noisy = [r for r in results if r.violations or r.excepted or r.error]
        for r in noisy:
            print(format_report(r))
            print()
        clean = len(results) - len(noisy)
        print(
            f"{len(results)} spec(s) checked; {clean} clean, "
            f"{sum(len(r.violations) for r in results)} session(s) over cap "
            f"without an exception."
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
    "DEFAULT_MAX_STEPS",
    "SessionPlan",
    "SpecAdmission",
    "check_spec",
    "format_report",
    "load_max_steps",
    "parse_session_plans",
    "parse_size_exceptions",
    "main",
    "run",
]
