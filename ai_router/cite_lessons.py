"""Record lesson usage at the source — the D3 citation path (Set 064).

``python -m ai_router.cite_lessons --set <N> --session <M> <id> ...``
records each cited id as a use in the **guidance usage ledger**
(``docs/planning/guidance-usage.json``). The work agent runs this as part
of the final commit so the record lands **inside the committed, pushed
work**.

Set 121 S2 — where the record moved, and why
--------------------------------------------

This CLI used to rewrite a ``last-used-set`` trailer inside
``lessons-learned.md``. That file is **preload**: every session paid to
read bookkeeping it was not going to use, and the accounting cost more
than the headroom that was left. Worse, the constitution mandates this
command in the final commit, so it rewrote a just-verified preload
document and staled its own verification stamp — which is why a
markdown-specific freshness normalizer had to exist at all (Set 119 S3).

The record now goes to a sidecar JSON that is read only at prune time.
The scalar became a **bounded ring of the last ten uses**, each a
``<set>-<session>`` label, so the ledger can finally distinguish *used
once, ten sets ago* from *used in every one of the last ten* — which
warrant opposite pruning decisions. The freshness problem dissolves with
it: the ledger is close output end to end, so it is exempt whole-file and
needs no normalizer.

Why a separate CLI instead of close_session writing the ledger
--------------------------------------------------------------

``close_session`` runs *after* the working tree is clean and pushed; a
post-gate mutation would re-dirty the tree. So the write is the agent's
job (via this CLI, pre-commit) and ``close_session`` only reads
``disposition.lessons_cited`` to stamp the ``closeout_succeeded`` event.

Reactivation loop (D3 lock)
---------------------------

Citing an **archived** id is legal: the use is recorded and the tool
prints a ``RECONSIDER`` line so the operator can move it back to the
active tier. The tool never auto-moves entries.

ASCII-only output (Windows cp1252 consoles).
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import List, Optional, Tuple

try:  # test convention: bare import; production: relative fallback
    from guidance_config import (  # type: ignore[import-not-found]
        LESSONS_ACTIVE,
        LESSONS_ARCHIVE,
        PROJECT_GUIDANCE,
        discover_guidance_files,
    )
    from guidance_ledger import (  # type: ignore[import-not-found]
        GUIDANCE_LEDGER_RELPATH,
        record_citation,
        use_label,
    )
    from guidance_meta import contains_id, find_entry  # type: ignore[import-not-found]
except ImportError:
    from .guidance_config import (  # type: ignore[no-redef]
        LESSONS_ACTIVE,
        LESSONS_ARCHIVE,
        PROJECT_GUIDANCE,
        discover_guidance_files,
    )
    from .guidance_ledger import (  # type: ignore[no-redef]
        GUIDANCE_LEDGER_RELPATH,
        record_citation,
        use_label,
    )
    from .guidance_meta import contains_id, find_entry  # type: ignore[no-redef]


def normalize_set_label(value: str) -> str:
    """Normalize a ``--set`` argument to the stored set form.

    A pure-integer value is zero-padded to three digits (``64`` -> ``064``)
    to match the ``L-<set>-<seq>`` id convention; anything else is passed
    through stripped.
    """
    v = value.strip()
    if v.isdigit():
        return v.zfill(3)
    return v


# Citation outcome tokens.
CITED_ACTIVE = "cited"          # found in the active tier, recorded
CITED_ARCHIVED = "reconsider"   # found in the archive, recorded + flagged
NOT_FOUND = "not-found"         # id present in no guidance file
RECORD_REFUSED = "refused"      # the ledger declined the record


# Set 119 S3 — this module's close-mandated writes, declared here rather
# than listed in verification_stamp.
#
# The constitution MANDATES this CLI in the final commit, which lands a
# usage record AFTER the verification round that will settle the close.
# Before Set 121 S2 that record was a trailer bump inside a PRELOAD
# markdown document, so the exemption had to be surgical: a normalizer
# blanked the one mandated field and let the lesson prose keep binding,
# because a whole-file exemption on an always-loaded document would have
# let a post-verification prose rewrite ride a passed round.
#
# The record now lands in the usage ledger, which is close output END TO
# END — machine-written bookkeeping with a validator, carrying no
# reviewable prose at all — so ``whole-file`` is both correct and
# strictly safer than what it replaces: the two preload documents lost
# their exemption entirely and now bind byte for byte. The path is
# spelled literally because the declaration is read with
# ``ast.literal_eval`` (no import, no side effects, safe on the close
# path); ``test_close_mandated_writes.py`` asserts the literal agrees
# with ``guidance_ledger``.
CLOSE_MANDATED_WRITES = (
    {
        "path": "docs/planning/guidance-usage.json",
        "scope": "repo",
        "bound": "whole-file",
        "reason": (
            "cite_lessons records the cited ids in the guidance usage "
            "ledger during the close-mandated final commit"
        ),
    },
)


def cite_one(
    files: List[Tuple[str, str]], lesson_id: str
) -> Tuple[str, Optional[str]]:
    """Resolve *lesson_id* against the guidance files (label, path pairs).

    Returns ``(outcome, path_or_None)``. This is a **read**: the usage
    record itself goes to the ledger, which is keyed by id and agnostic
    about which document an entry lives in. Resolution still happens so
    an unknown id is reported, an archived one is flagged for
    reconsideration, and — since the ledger has no eviction path — a
    typo never becomes a permanent ghost entry.

    Uses the document-agnostic marker scan rather than the heading-bound
    parser, so an id living in ``project-guidance.md`` (bullets under
    level-3 sections) resolves exactly like a lesson does.
    """
    for _logical_name, path in files:
        try:
            with open(path, "r", encoding="utf-8") as f:
                text = f.read()
        except OSError:
            continue
        if not contains_id(text, lesson_id):
            continue
        entry = find_entry(text, lesson_id)
        archived = (
            entry is not None
            and entry.meta is not None
            and entry.meta.status == "archived"
        )
        return (CITED_ARCHIVED if archived else CITED_ACTIVE), path
    return NOT_FOUND, None


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ai_router.cite_lessons",
        description=(
            "Record that the given lesson ids were instrumental this "
            "session by appending a use to the guidance usage ledger "
            f"({GUIDANCE_LEDGER_RELPATH}). Run as part of the final commit "
            "so the record lands inside the pushed work. Unknown ids are "
            "reported but do not abort the others; exit non-zero if any id "
            "was not found."
        ),
    )
    parser.add_argument(
        "--set",
        dest="set_label",
        required=True,
        help="Session-set number/label whose work cited these lessons (e.g. 64).",
    )
    parser.add_argument(
        "--session",
        dest="session_number",
        required=True,
        help=(
            "Session number within the set. REQUIRED: the ledger records "
            "<set>-<session> because retention is measured in active "
            "sessions, never in elapsed time, and a default would silently "
            "file every session-2+ citation under session 1."
        ),
    )
    parser.add_argument(
        "ids",
        nargs="+",
        help="Lesson ids to cite (e.g. L-064-1 L-030-2).",
    )
    parser.add_argument(
        "--repo-root",
        default=None,
        help="Repo root containing docs/planning (default: current directory).",
    )
    args = parser.parse_args(argv)

    set_label = normalize_set_label(args.set_label)
    found = discover_guidance_files(args.repo_root)
    # Active tier first, then archive (reactivation case).
    files = [
        (name, found[name])
        for name in (LESSONS_ACTIVE, PROJECT_GUIDANCE, LESSONS_ARCHIVE)
        if name in found
    ]
    if not files:
        print(
            "ERROR: no guidance files found under docs/planning "
            "(lessons-learned.md / project-guidance.md / "
            "lessons-archive.md). Nothing to cite."
        )
        return 1

    resolutions = {
        lesson_id: cite_one(files, lesson_id) for lesson_id in args.ids
    }
    # Only ids that resolve to a real guidance entry reach the ledger.
    # The ledger deliberately has no eviction path, so a mistyped id
    # recorded here would be a permanent ghost -- and a later, correct
    # citation could not remove it.
    resolved = [i for i in args.ids if resolutions[i][0] != NOT_FOUND]
    try:
        label = use_label(set_label, args.session_number)
        recorded = (
            record_citation(
                resolved,
                set_number=set_label,
                session_number=args.session_number,
                repo_root=args.repo_root,
            )
            if resolved
            else {}
        )
    except ValueError as exc:
        print(f"ERROR: could not record the citation: {exc}")
        return 1

    any_missing = False
    for lesson_id in args.ids:
        outcome, path = resolutions[lesson_id]
        rel = os.path.basename(path) if path else "(none)"
        record = recorded.get(lesson_id, RECORD_REFUSED)
        if outcome != NOT_FOUND and record in (
            "kind-mismatch", "invalid-id", "unknown",
        ):
            any_missing = True
            print(
                f"[{record}] {lesson_id}: the ledger refused this citation. "
                "An id recorded as an executable check earns a use by FIRING "
                "(ai_router.guidance_ledger fire), never by being mentioned."
            )
            continue
        if outcome == CITED_ACTIVE:
            print(f"[cited]      {lesson_id} -> {label} ({rel})")
        elif outcome == CITED_ARCHIVED:
            print(
                f"[reconsider] {lesson_id} -> {label} ({rel}); id is ARCHIVED "
                "-- consider reactivating it into the active tier."
            )
        else:
            any_missing = True
            print(
                f"[not-found]  {lesson_id}: not present in any guidance file, "
                "so NOTHING was recorded for it. Check the id (typo?) or that "
                "the entry exists."
            )

    return 1 if any_missing else 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())


__all__ = [
    "CITED_ACTIVE",
    "CITED_ARCHIVED",
    "NOT_FOUND",
    "RECORD_REFUSED",
    "CLOSE_MANDATED_WRITES",
    "normalize_set_label",
    "cite_one",
    "main",
]
