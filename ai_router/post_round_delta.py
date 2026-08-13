"""A4: what a fix made AFTER the full suite owes, decided mechanically.

**Who uses this:** the orchestrator at Step 8, when a full suite fails
after verification already passed and the fix has to be classified; and
``close_backstop``, which consults the same function before deciding
whether to buy a metered round.
**See also:** ``docs/planning/session-set-authoring-guide.md`` -> *The
test-run policy* -> A1-A4 (the canonical statement of the rules);
``run_of_record`` (the declared suite surfaces this reads);
``verification_stamp.work_diff_binding_paths`` (the definition of "what
changed" this reuses).

---

The rule
--------
Operator ruling of 2026-08-12, journalled as an **operator-attested
verification-reduction** in Set 128 S2's ``decisions.jsonl`` (the
constitution's hard carve-out -- ``decision_journal`` refuses to write it
without the attestation):

* **A4.1** -- a post-suite fix to one or more tests only (and not to
  code) does not trigger any re-verification.
* **A4.2** -- a post-suite fix to code triggers targeted/focused
  remediation-review only, not an open re-verification.

Why this is not cost-cutting: A2 pushes every full suite AFTER every
cross-verification stage, so a late suite failure strands a stale verdict
**by construction**. A4 is the other half of A2, not an optimization
bolted onto it.

Why it is keyed on WHAT changed and never on HOW MUCH
-----------------------------------------------------
An earlier formulation exempted fixes of "less than two lines". Set 127
S2 planted eight defects against its finished suite to prove its
falsifiers bite, and **six were two lines or fewer** -- ``if (false)``,
``const status = row.status``, one inverted ternary -- every one a real
correctness bug that changed shipped behaviour. A two-line edit is
precisely the size that inverts a predicate. That formulation is
superseded and must not come back.

One definition of "what changed", one definition of "a test"
------------------------------------------------------------
Neither half is invented here. "What changed" is a **tree-to-tree**
diff, the same shape ``verify_session.assemble_fix_delta_evidence``
uses for the remediation-review bundle: the anchor tree against a fresh
``snapshot_worktree_tree`` of the current tree, under the same
bookkeeping exclusions the freshness digest applies (issues envelopes,
remediation sidecars, the round ledger, the decision journal), so a
round's own artifacts never read as work.

Tree-to-tree is not an implementation detail, it is the correctness
condition. A worktree-vs-tree diff sees only TRACKED files, so a caller
has to union the untracked ones back in -- and an untracked file that
was already present in the anchor tree and has not changed since would
be unioned in anyway and misreported as a post-round change. Sessions
create files and leave them untracked until the close-out commit
routinely, so that shape is the common case, not the corner: it would
have denied A4.1 to exactly the sessions that wrote something new. The
tree snapshot captures untracked files symmetrically at both ends,
which is why ``snapshot_worktree_tree`` exists at all.

"A test" is ``run_of_record``'s per-suite ``tests`` declaration, sitting
beside the ``covers`` map that decides which suites a session owes. A
second notion of either would drift from the first (L-069-1), and the
drift would be silent because both directions still produce an answer.

The anchor
----------
The delta is measured from ``worktreeTreeAtCompletion`` on the session's
last completed round in ``sN-rounds.jsonl`` -- a snapshot taken when the
round SETTLED. ``discoveryBaselineTree`` is the wrong anchor and is used
only as a named fallback: it is captured BEFORE a round assembles its
evidence, so a diff from it also contains that round's own remediation
and over-reports shipped-code changes. Over-reporting is the safe
direction, and the verdict says which anchor it used.

Fails closed, in both senses
----------------------------
No anchor, no git, an unreadable ledger, or a repo that cannot be
resolved all yield ``UNKNOWN``, which owes the delta review exactly as
``SHIPPED_CODE`` does. And the test classification is an ALLOWLIST
(``run_of_record.classify_changed_paths``): a path is a test only if it
matches a declared prefix, so anything unrecognised owes the review.
Denylists fail open (L-125-1), and "what counts as a test asset" was
established as an open-ended classification problem by Set 111 S2's
close-backstop round 7 -- which is why it is declared, not sniffed.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

try:
    from .run_of_record import (  # type: ignore[import-not-found]
        classify_changed_paths,
        load_suites,
    )
except ImportError:  # pragma: no cover - direct-script fallback
    from run_of_record import (  # type: ignore[no-redef]
        classify_changed_paths,
        load_suites,
    )


def _changed_paths_since(
    session_set_dir: Path, anchor_tree: str
) -> Optional[List[str]]:
    """Repo-relative paths differing between *anchor_tree* and now.

    A tree-to-tree diff (see the module docstring for why it must be):
    the anchor against a fresh snapshot of the current working tree,
    with the freshness exclusions applied as git pathspecs so round
    bookkeeping never reads as work. Returns ``None`` on any git or
    repo failure, and the caller turns that into ``UNKNOWN``.
    """
    try:
        try:
            from . import verify_session as _vs  # type: ignore[import-not-found]
            from .verification_stamp import (  # type: ignore[import-not-found]
                WORK_DIFF_BASE_EXCLUDES,
                WORK_DIFF_SET_BOOKKEEPING,
                close_mandated_excludes,
                repo_relative_posix,
            )
        except ImportError:  # pragma: no cover - direct-script fallback
            import verify_session as _vs  # type: ignore[no-redef]
            from verification_stamp import (  # type: ignore[no-redef]
                WORK_DIFF_BASE_EXCLUDES,
                WORK_DIFF_SET_BOOKKEEPING,
                close_mandated_excludes,
                repo_relative_posix,
            )
        root = _vs.repo_root_for(Path(session_set_dir))
    except Exception:
        return None

    current_tree = _vs.snapshot_worktree_tree(root)
    if current_tree is None:
        return None

    set_rel = repo_relative_posix(Path(session_set_dir).resolve(), root)
    excludes = [
        *(f"{set_rel}/{name}" for name in WORK_DIFF_SET_BOOKKEEPING),
        *close_mandated_excludes(set_rel),
        "*router-metrics.jsonl",
        *WORK_DIFF_BASE_EXCLUDES,
    ]
    pathspecs = [".", *(f":(exclude){pattern}" for pattern in excludes)]
    proc = subprocess.run(
        [
            "git", "-C", str(root), "-c", "core.quotepath=false",
            "diff", "--name-only", "-z", "--no-ext-diff",
            anchor_tree, current_tree, "--", *pathspecs,
        ],
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        return None
    out = proc.stdout.decode("utf-8", errors="replace")
    return sorted({p for p in out.split("\0") if p})


# The three classifications, plus the fail-closed fourth.
DELTA_NO_CHANGE = "no-change"
DELTA_TEST_ONLY = "test-only"
DELTA_SHIPPED_CODE = "shipped-code"
DELTA_UNKNOWN = "unknown"

# Which anchor the verdict was measured from. The distinction is
# reported, never hidden: a fallback anchor over-reports.
ANCHOR_ROUND_COMPLETION = "round-completion"
ANCHOR_DISCOVERY_BASELINE = "discovery-baseline"
ANCHOR_NONE = "none"

EXIT_OK = 0
EXIT_OWES_REVIEW = 1
EXIT_USAGE = 2


@dataclass(frozen=True)
class DeltaVerdict:
    """What changed since the session's recorded verification round.

    ``owes_review`` is the operative field and it is deliberately NOT a
    simple ``classification == SHIPPED_CODE``: ``UNKNOWN`` owes one too.
    Reading the classification alone is the mistake this attribute
    exists to prevent.
    """

    classification: str
    anchor: str
    anchor_round: Optional[int] = None
    anchor_tree: Optional[str] = None
    test_paths: Tuple[str, ...] = ()
    shipped_paths: Tuple[str, ...] = ()
    reason: str = ""

    @property
    def owes_review(self) -> bool:
        """True when A4.2 (or the fail-closed path) demands a round."""
        return self.classification in (DELTA_SHIPPED_CODE, DELTA_UNKNOWN)

    @property
    def obligation(self) -> str:
        """The one-line instruction an orchestrator acts on."""
        if self.classification == DELTA_NO_CHANGE:
            return (
                "nothing changed since the recorded round; the existing "
                "verification still covers this close"
            )
        if self.classification == DELTA_TEST_ONLY:
            return (
                "A4.1 -- test-only delta; owes NO re-verification (a fix "
                "to a test changes nothing that ships)"
            )
        if self.classification == DELTA_SHIPPED_CODE:
            return (
                "A4.2 -- the delta touches shipped code; owes ONE "
                "delta-scoped `verify_session --phase remediation-review`, "
                "not an open re-verification"
            )
        return (
            "the delta could not be classified, so it owes a delta review "
            "exactly as a shipped-code change would (fails closed)"
        )

    def to_dict(self) -> dict:
        return {
            "classification": self.classification,
            "owesReview": self.owes_review,
            "obligation": self.obligation,
            "anchor": self.anchor,
            "anchorRound": self.anchor_round,
            "anchorTree": self.anchor_tree,
            "testPaths": list(self.test_paths),
            "shippedPaths": list(self.shipped_paths),
            "reason": self.reason,
        }


def _round_ledger_path(session_set_dir: Path, session_number: int) -> Path:
    return Path(session_set_dir) / f"s{session_number}-rounds.jsonl"


def read_round_rows(
    session_set_dir: Path, session_number: int
) -> List[dict]:
    """Every completed-round row for this session, in file order.

    A malformed line is skipped rather than raising -- the ledger is an
    append-only journal and one bad line must not blind the reader to
    the good ones (the same tolerance ``read_records`` applies).
    """
    path = _round_ledger_path(session_set_dir, session_number)
    if not path.exists():
        return []
    out: List[dict] = []
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and parsed.get("event") == "round-completed":
            out.append(parsed)
    return out


def resolve_anchor(
    session_set_dir: Path, session_number: int
) -> Tuple[Optional[str], str, Optional[int]]:
    """``(tree_sha, anchor_kind, round_number)`` for the delta baseline.

    Prefers the LAST completed round's ``worktreeTreeAtCompletion`` --
    the state the session's verification actually settled on. Falls back
    to the last ``discoveryBaselineTree`` (pre-round, so it over-reports)
    and says so. Returns ``(None, ANCHOR_NONE, None)`` when neither
    exists, which the caller turns into ``UNKNOWN``.
    """
    rows = read_round_rows(Path(session_set_dir), session_number)
    for row in reversed(rows):
        tree = row.get("worktreeTreeAtCompletion")
        if isinstance(tree, str) and tree.strip():
            rnd = row.get("verificationRound")
            return (
                tree.strip(),
                ANCHOR_ROUND_COMPLETION,
                rnd if isinstance(rnd, int) else None,
            )
    for row in reversed(rows):
        tree = row.get("discoveryBaselineTree")
        if isinstance(tree, str) and tree.strip():
            rnd = row.get("verificationRound")
            return (
                tree.strip(),
                ANCHOR_DISCOVERY_BASELINE,
                rnd if isinstance(rnd, int) else None,
            )
    return None, ANCHOR_NONE, None


def classify_delta(
    session_set_dir: str | os.PathLike[str],
    session_number: int,
    *,
    config: Optional[dict] = None,
    anchor_tree: Optional[str] = None,
) -> DeltaVerdict:
    """Classify everything that changed since the recorded round.

    *anchor_tree* overrides the resolved anchor -- used by tests and by
    a caller that already knows the tree it cares about. Everything else
    is read from disk: the round ledger for the anchor, git for the
    delta, the declared suites for what counts as a test.
    """
    set_dir = Path(session_set_dir)
    if anchor_tree:
        tree, anchor, anchor_round = anchor_tree, ANCHOR_ROUND_COMPLETION, None
    else:
        tree, anchor, anchor_round = resolve_anchor(set_dir, session_number)

    if tree is None:
        return DeltaVerdict(
            classification=DELTA_UNKNOWN,
            anchor=ANCHOR_NONE,
            reason=(
                f"no completed round for session {session_number} recorded a "
                "worktree snapshot (s<N>-rounds.jsonl is missing, empty, or "
                "predates Set 128 S2), so there is no anchor to measure a "
                "post-round delta from -- fails closed"
            ),
        )

    changed = _changed_paths_since(set_dir, tree)
    if changed is None:
        return DeltaVerdict(
            classification=DELTA_UNKNOWN,
            anchor=anchor,
            anchor_round=anchor_round,
            anchor_tree=tree,
            reason=(
                f"the anchor tree {tree[:12]} could not be diffed against a "
                "snapshot of the current tree (git failed, the repo is "
                "unresolvable, or the object is gone) -- fails closed"
            ),
        )

    suites = load_suites(config if config is not None else _router_config())
    test_paths, shipped_paths = classify_changed_paths(changed, suites)

    caveat = ""
    if anchor == ANCHOR_DISCOVERY_BASELINE:
        caveat = (
            " NOTE: measured from the pre-round discoveryBaselineTree "
            "because no round recorded a completion snapshot, so this "
            "delta also contains that round's own remediation and "
            "over-reports shipped-code changes."
        )

    if not changed:
        return DeltaVerdict(
            classification=DELTA_NO_CHANGE,
            anchor=anchor,
            anchor_round=anchor_round,
            anchor_tree=tree,
            reason=(
                "nothing in the session's work has changed since the "
                f"recorded round{caveat}"
            ),
        )
    if not shipped_paths:
        return DeltaVerdict(
            classification=DELTA_TEST_ONLY,
            anchor=anchor,
            anchor_round=anchor_round,
            anchor_tree=tree,
            test_paths=test_paths,
            reason=(
                f"{len(test_paths)} changed path(s), every one under a "
                f"declared test surface{caveat}"
            ),
        )
    return DeltaVerdict(
        classification=DELTA_SHIPPED_CODE,
        anchor=anchor,
        anchor_round=anchor_round,
        anchor_tree=tree,
        test_paths=test_paths,
        shipped_paths=shipped_paths,
        reason=(
            f"{len(shipped_paths)} changed path(s) are not under any declared "
            f"test surface{caveat}"
        ),
    )


def _router_config() -> Optional[dict]:
    """``router-config.yaml``, or ``None`` when it cannot be read.

    Mirrors ``gate_checks._router_config_or_none``: a config failure
    degrades to the locked default suites rather than raising, because
    neither a report nor a close may wedge on a momentarily unparseable
    config.
    """
    try:
        try:
            from .config import load_config  # type: ignore[import-not-found]
        except ImportError:
            from config import load_config  # type: ignore[no-redef]
        return load_config()
    except Exception:
        return None


def _resolve_session_number(session_set_dir: Path) -> Optional[int]:
    """The session in focus, from ``session-state.json``."""
    try:
        try:
            from .session_state import read_session_state  # type: ignore[import-not-found]
        except ImportError:
            from session_state import read_session_state  # type: ignore[no-redef]
        state = read_session_state(str(session_set_dir))
    except Exception:
        return None
    if not state:
        return None
    sessions = state.get("sessions")
    if not isinstance(sessions, list):
        return None
    in_flight = [
        s.get("number")
        for s in sessions
        if isinstance(s, dict) and s.get("status") == "in-progress"
    ]
    if in_flight and isinstance(in_flight[-1], int):
        return in_flight[-1]
    closed = [
        s.get("number")
        for s in sessions
        if isinstance(s, dict) and s.get("status") == "complete"
        and isinstance(s.get("number"), int)
    ]
    return max(closed) if closed else None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="post_round_delta",
        description=(
            "A4: classify everything that changed since this session's "
            "recorded verification round as no-change, test-only (A4.1 -- "
            "owes nothing) or shipped-code (A4.2 -- owes one delta-scoped "
            "remediation-review). Exit 0 when nothing is owed, 1 when a "
            "review is owed, 2 on a usage error."
        ),
    )
    parser.add_argument(
        "--session-set-dir",
        required=True,
        help="Path to the session-set directory.",
    )
    parser.add_argument(
        "--session-number",
        type=int,
        help=(
            "Session to classify. Inferred from session-state.json "
            "(the in-flight session, else the highest closed one) when "
            "omitted."
        ),
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit the verdict as JSON instead of the ASCII report.",
    )
    return parser


def run(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    set_dir = Path(args.session_set_dir)
    if not set_dir.is_dir():
        print(
            f"post_round_delta: {args.session_set_dir} is not a directory",
            file=sys.stderr,
        )
        return EXIT_USAGE

    session_number = args.session_number
    if session_number is None:
        session_number = _resolve_session_number(set_dir)
    if session_number is None:
        print(
            "post_round_delta: no --session-number given and none could be "
            "resolved from session-state.json",
            file=sys.stderr,
        )
        return EXIT_USAGE

    verdict = classify_delta(set_dir, session_number)

    if args.json:
        print(json.dumps(verdict.to_dict(), indent=2, ensure_ascii=False))
    else:
        mark = "[!]" if verdict.owes_review else "[x]"
        print(f"{mark} session {session_number}: {verdict.classification}")
        print(f"    {verdict.obligation}")
        anchor_note = verdict.anchor
        if verdict.anchor_round is not None:
            anchor_note += f" (round {verdict.anchor_round})"
        if verdict.anchor_tree:
            anchor_note += f" {verdict.anchor_tree[:12]}"
        print(f"    anchor: {anchor_note}")
        print(f"    {verdict.reason}")
        for rel in verdict.shipped_paths:
            print(f"    shipped: {rel}")
        for rel in verdict.test_paths:
            print(f"    test:    {rel}")
    return EXIT_OWES_REVIEW if verdict.owes_review else EXIT_OK


def main(argv: Optional[Sequence[str]] = None) -> int:
    return run(argv)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())


__all__ = [
    "DELTA_NO_CHANGE",
    "DELTA_TEST_ONLY",
    "DELTA_SHIPPED_CODE",
    "DELTA_UNKNOWN",
    "ANCHOR_ROUND_COMPLETION",
    "ANCHOR_DISCOVERY_BASELINE",
    "ANCHOR_NONE",
    "DeltaVerdict",
    "read_round_rows",
    "resolve_anchor",
    "classify_delta",
    "build_parser",
    "run",
    "main",
]
