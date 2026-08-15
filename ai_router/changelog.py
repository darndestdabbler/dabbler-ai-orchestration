"""Partitioned changelogs: one file per contribution, one computed view.

Set 122 Session 4, implementing the adopted verdict item
``docs/proposals/2026-08-11-multi-module-architecture/verdict.md`` §7.

The defect
----------

``CHANGELOG.md`` is an append-only file that *every* session edits, at the
same offset — the top. Two developers running concurrent session sets in
separate worktrees are therefore **guaranteed** a merge conflict on it,
and the conflict is the worst kind: both sides are correct, so resolving
it is manual reading rather than a rule.

The fix, and why it is this shape
---------------------------------

Sessions stop editing a shared file. Each contribution becomes its own
**fragment** under ``changelog.d/``, and the full document is *computed*
by concatenating the fragments back into the rendered file — the same
"partitioned sources, one computed view" shape as Set 120's session
projection. Two sessions each create a new file, and git merges disjoint
new files without a conflict.

This is not a new convention so much as an existing one made executable.
``ai_router/CHANGELOG.md`` already carries nine stacked
``## [Unreleased] — <title> (Set NNN)`` sections, one per set;
``tools/dabbler-ai-orchestration/CHANGELOG.md`` carries ten separate
``### <Section>`` blocks inside one Unreleased section, also one per
contribution. Sessions were already partitioning by hand. They were just
doing it inside a single file, which is exactly what conflicts.

The byte-identity contract
--------------------------

The spec's binding requirement: *the concatenated view must stay
byte-identical to what the unpartitioned file produced for the same
inputs.* A partitioning that quietly reorders history is worse than the
conflict it removes, so:

- A fragment stores the **verbatim slice** of the original pending
  region. Nothing is re-serialized, re-wrapped, or re-grouped, so
  ``"".join(fragments) == original_pending_region`` holds by
  construction rather than by care.
- ``changelog.d/.baseline.json`` records the pre-partition document
  digest, the fragment order, and each migrated fragment's own digest.
  :func:`check` re-renders from the baseline fragment set alone and
  compares — so a reorder, an edit, or a dropped fragment fails a test
  rather than shipping.

"Byte-identical" means **after line-ending normalization**. This repo
sets ``core.autocrlf=true``, so the same commit is CRLF in a Windows
worktree and LF in a Linux one; a digest over raw bytes would be a
platform assertion, not a content one. Everything here reads through
:func:`read_text`, which normalizes to ``\\n``, and every digest is taken
over that form — the one claim that can be true on both CI runners.

What stays in ``CHANGELOG.md``
------------------------------

Released history, and the preamble. The rendered file is no longer an
append target: pending entries live only in fragments until the operator
folds them into a version at release time (:func:`fold`), which is a
serialized, one-person act and so cannot race. ``render`` prints the
whole document — released history *and* pending fragments — on demand.

The module makes no routed LLM calls and imports nothing else from
``ai_router``, so it is safe to call under any budget regime.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Sequence, Tuple

BASELINE_FILENAME = ".baseline.json"
FRAGMENT_SUFFIX = ".md"

# Fragment order keys are allocated in steps of ten so a contribution can
# be slotted between two existing ones without renumbering the directory.
ORDER_STEP = 10

_FRAGMENT_NAME_RE = re.compile(r"^(\d+)-(.+)\.md$")

# A released section heading is ``## [<something not Unreleased>]``. The
# bracket text is captured rather than matched loosely because the version
# heading carries a trailing em-dash clause the pattern must not depend on.
_VERSION_HEADING_RE = re.compile(r"^## \[([^\]]*)\]")
_UNRELEASED_TOKEN = "Unreleased"

_SET_TAG_RE = re.compile(r"\(Set (\d+)(?:\s+S(\d+))?", re.IGNORECASE)
_FENCE_RE = re.compile(r"^\s*(?:```|~~~)")
_SLUG_STRIP_RE = re.compile(r"[^a-z0-9]+")


class ChangelogError(Exception):
    """Base class for changelog partitioning failures."""


class BaselineMismatchError(ChangelogError):
    """The rendered view no longer reproduces the pre-partition document."""


@dataclass(frozen=True)
class ChangelogTarget:
    """One changelog and the directory holding its fragments."""

    key: str
    rendered_rel: str
    fragments_rel: str
    #: Heading level a *migration* splits this document's pending region
    #: at. Two shapes exist in this repo and both are legitimate: the
    #: router stacks whole ``## [Unreleased]`` sections, the extension
    #: stacks ``### <Section>`` blocks inside one. Going forward a
    #: fragment is just a file, so this only matters at :func:`migrate`.
    fragment_heading_level: int
    label: str

    def rendered_path(self, root: str) -> str:
        return os.path.join(root, *self.rendered_rel.split("/"))

    def fragments_dir(self, root: str) -> str:
        return os.path.join(root, *self.fragments_rel.split("/"))

    def baseline_path(self, root: str) -> str:
        return os.path.join(self.fragments_dir(root), BASELINE_FILENAME)


TARGETS: Dict[str, ChangelogTarget] = {
    "router": ChangelogTarget(
        key="router",
        rendered_rel="ai_router/CHANGELOG.md",
        fragments_rel="ai_router/changelog.d",
        fragment_heading_level=2,
        label="dabbler-ai-router (PyPI)",
    ),
    "extension": ChangelogTarget(
        key="extension",
        rendered_rel="tools/dabbler-ai-orchestration/CHANGELOG.md",
        fragments_rel="tools/dabbler-ai-orchestration/changelog.d",
        fragment_heading_level=3,
        label="Dabbler AI Orchestration (VS Code Marketplace)",
    ),
}


@dataclass(frozen=True)
class Fragment:
    """One contribution: an order key, a slug, and verbatim markdown."""

    order: int
    slug: str
    text: str

    @property
    def filename(self) -> str:
        return f"{self.order:04d}-{self.slug}{FRAGMENT_SUFFIX}"

    @property
    def digest(self) -> str:
        return sha256_text(self.text)


@dataclass(frozen=True)
class DocumentParts:
    """A changelog cut into preamble / pending / released history."""

    preamble: str
    pending: str
    released: str

    @property
    def text(self) -> str:
        return self.preamble + self.pending + self.released


# --- byte discipline ---------------------------------------------------------


def read_text(path: str) -> str:
    """Read a file as UTF-8 with line endings normalized to ``\\n``.

    Every comparison, digest and splice in this module goes through here.
    With ``core.autocrlf=true`` the same commit is CRLF in a Windows
    worktree and LF in a Linux one, so a raw-byte digest would assert
    which machine ran the test rather than what the content is.
    """
    with open(path, "rb") as handle:
        raw = handle.read()
    return raw.decode("utf-8").replace("\r\n", "\n")


def write_text(path: str, text: str) -> None:
    """Write UTF-8 with ``\\n`` endings, never the platform default.

    ``newline=""`` disables Python's own translation; git's ``autocrlf``
    still applies its checkout conversion, which is why readers normalize.
    """
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as handle:
        handle.write(text)


def sha256_text(text: str) -> str:
    """SHA-256 over the LF-normalized UTF-8 encoding of *text*."""
    return hashlib.sha256(text.replace("\r\n", "\n").encode("utf-8")).hexdigest()


# --- parsing -----------------------------------------------------------------


def _fence_mask(lines: Sequence[str]) -> List[bool]:
    """``True`` for every line inside a fenced code block.

    A ``### Something`` line inside a fence is prose about a heading, not
    a heading. Splitting there would cut a code sample in half and, worse,
    would do it silently — the concatenation still round-trips, so only a
    reader would ever notice.
    """
    inside = False
    mask: List[bool] = []
    for line in lines:
        if _FENCE_RE.match(line):
            mask.append(True)
            inside = not inside
            continue
        mask.append(inside)
    return mask


def _splitlines_keepends(text: str) -> List[str]:
    """Split on ``\\n`` only, keeping the terminator.

    ``str.splitlines`` also breaks on form feed, U+2028 and friends, any
    of which could appear inside changelog prose; re-joining after such a
    split is still lossless, but the *line numbering* would not match what
    a heading regex means by "a line".
    """
    if not text:
        return []
    parts = text.split("\n")
    out = [p + "\n" for p in parts[:-1]]
    if parts[-1]:
        out.append(parts[-1])
    return out


def split_document(text: str) -> DocumentParts:
    """Cut a changelog into preamble, pending region, and released history.

    The released history begins at the first ``## [<version>]`` heading
    whose bracket text is not ``Unreleased``. The pending region is
    whatever sits between the first ``## [Unreleased]`` heading and that
    boundary — empty once the document has been partitioned, which is why
    the same function serves both the migration and every later render.
    """
    lines = _splitlines_keepends(text)
    mask = _fence_mask(lines)

    released_start: Optional[int] = None
    unreleased_start: Optional[int] = None
    for index, line in enumerate(lines):
        if mask[index]:
            continue
        match = _VERSION_HEADING_RE.match(line)
        if not match:
            continue
        if match.group(1).strip() == _UNRELEASED_TOKEN:
            if unreleased_start is None:
                unreleased_start = index
            continue
        released_start = index
        break

    if released_start is None:
        released_start = len(lines)
    if unreleased_start is None or unreleased_start > released_start:
        unreleased_start = released_start

    return DocumentParts(
        preamble="".join(lines[:unreleased_start]),
        pending="".join(lines[unreleased_start:released_start]),
        released="".join(lines[released_start:]),
    )


def split_blocks(region: str, level: int) -> Tuple[str, List[str]]:
    """Cut *region* into a lead and one verbatim block per level-*level* heading.

    Returns ``(lead, blocks)`` where ``lead + "".join(blocks) == region``
    exactly. Each block runs from its heading line up to the line before
    the next heading at the same level, so nothing is dropped, reflowed or
    reordered — the round trip is a property of the slicing, not of care
    taken afterwards.
    """
    if level < 1:
        raise ChangelogError(f"heading level must be >= 1, got {level}")
    prefix = "#" * level + " "
    lines = _splitlines_keepends(region)
    mask = _fence_mask(lines)

    starts = [
        index
        for index, line in enumerate(lines)
        if not mask[index] and line.startswith(prefix)
    ]
    if not starts:
        return region, []

    lead = "".join(lines[: starts[0]])
    blocks: List[str] = []
    for position, start in enumerate(starts):
        end = starts[position + 1] if position + 1 < len(starts) else len(lines)
        blocks.append("".join(lines[start:end]))
    return lead, blocks


def derive_slug(block: str, fallback: str = "entry") -> str:
    """A legible filename stem for a block: ``set-122-s4-partitioned-changelogs``.

    Ordering never depends on this — the numeric prefix is the sort key —
    so an imperfect slug costs legibility and nothing else.
    """
    lines = _splitlines_keepends(block)
    heading = lines[0].strip().lstrip("#").strip() if lines else ""
    tag = _SET_TAG_RE.search(block)
    parts: List[str] = []
    if tag:
        parts.append(f"set-{int(tag.group(1)):03d}")
        if tag.group(2):
            parts.append(f"s{int(tag.group(2))}")
    if heading:
        cleaned = heading
        # Strip the "[Unreleased] — " scaffolding so the slug carries the
        # human title rather than a word every fragment would share.
        cleaned = re.sub(r"^\[[^\]]*\]", "", cleaned)
        cleaned = cleaned.lstrip(" \u2014-\u2013")
        cleaned = _SET_TAG_RE.sub("", cleaned)
        parts.append(cleaned)
    stem = _SLUG_STRIP_RE.sub("-", "-".join(parts).lower()).strip("-")
    stem = re.sub(r"-{2,}", "-", stem)
    if not stem:
        stem = fallback
    return stem[:72].rstrip("-") or fallback


# --- fragments ---------------------------------------------------------------


def load_fragments(target: ChangelogTarget, root: str) -> List[Fragment]:
    """Every fragment for *target*, in render order (newest first).

    Render order is **descending** by order key, then descending by slug.
    Descending is what makes the scheme usable: a new contribution takes
    ``max + 10`` and lands at the top of the changelog, which is where a
    changelog entry belongs, without renumbering anything that exists.
    """
    directory = target.fragments_dir(root)
    if not os.path.isdir(directory):
        return []
    fragments: List[Fragment] = []
    for name in sorted(os.listdir(directory)):
        if name == BASELINE_FILENAME or not name.endswith(FRAGMENT_SUFFIX):
            continue
        match = _FRAGMENT_NAME_RE.match(name)
        if not match:
            raise ChangelogError(
                f"{os.path.join(directory, name)}: fragment names must be "
                f"<order>-<slug>.md (e.g. 0120-set-122-s4-partitioning.md); "
                f"the numeric order key is the sort key."
            )
        fragments.append(
            Fragment(
                order=int(match.group(1)),
                slug=match.group(2),
                text=read_text(os.path.join(directory, name)),
            )
        )
    fragments.sort(key=lambda f: (f.order, f.slug), reverse=True)
    return fragments


def next_order(fragments: Sequence[Fragment]) -> int:
    """The order key a new contribution takes: ``max + 10``, or 10 when empty."""
    return (max((f.order for f in fragments), default=0) // ORDER_STEP + 1) * ORDER_STEP


def render(
    target: ChangelogTarget,
    root: str,
    fragments: Optional[Sequence[Fragment]] = None,
) -> str:
    """The whole changelog: preamble + pending lead + fragments + released history.

    Fragments splice in at the END of the pending region, not after the
    preamble. The distinction is load-bearing for the extension changelog,
    whose pending region opens with a ``## [Unreleased]`` heading and a
    blockquote that belong above every contribution; splicing after the
    preamble dropped both, and the round-trip assertion caught it.

    Pass *fragments* to render a specific set — :func:`check` uses it to
    re-render from the baseline set alone, so a later contribution cannot
    make the round-trip assertion vacuous.
    """
    parts = split_document(read_text(target.rendered_path(root)))
    if fragments is None:
        fragments = load_fragments(target, root)
    return parts.preamble + parts.pending + "".join(f.text for f in fragments) + parts.released


# --- baseline ----------------------------------------------------------------


def load_baseline(target: ChangelogTarget, root: str) -> Optional[dict]:
    path = target.baseline_path(root)
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def check(target: ChangelogTarget, root: str) -> List[str]:
    """Verify the round-trip contract. Returns a list of problems (empty = ok).

    Three assertions, and the ordering one is the point. A digest over the
    whole document proves the migration reproduced it *once*; the frozen
    per-fragment order and digests keep proving it, because they are the
    only thing a silent reorder would have to survive.
    """
    problems: List[str] = []
    baseline = load_baseline(target, root)
    if baseline is None:
        return [
            f"{target.baseline_path(root)}: no baseline. Run "
            f"`python -m ai_router.changelog migrate --target {target.key}` "
            f"or restore the file — without it nothing pins the round trip."
        ]

    recorded: List[dict] = baseline.get("fragments") or []
    if not recorded:
        # L-112-1: a gate whose corpus is empty passes having examined
        # nothing. An empty baseline is only legitimate immediately after
        # a fold, which stamps foldedAt to say so.
        if not baseline.get("foldedAt"):
            problems.append(
                f"{target.baseline_path(root)}: baseline lists no fragments and "
                f"records no fold. An empty corpus would pass this check without "
                f"examining anything."
            )
        return problems

    # Deliberately the order `load_fragments` really returns, not a fresh
    # sort: re-sorting here would make the assertion self-consistent and
    # therefore blind to an ordering bug in the production render path,
    # which is the one place a reorder would actually come from.
    on_disk = load_fragments(target, root)
    by_name = {f.filename: f for f in on_disk}
    baseline_fragments: List[Fragment] = []
    for entry in recorded:
        name = entry.get("file")
        fragment = by_name.get(name)
        if fragment is None:
            problems.append(
                f"{target.fragments_rel}/{name}: baseline fragment is missing. "
                f"The rendered view can no longer reproduce the pre-partition "
                f"document."
            )
            continue
        if fragment.digest != entry.get("sha256"):
            problems.append(
                f"{target.fragments_rel}/{name}: content changed since the "
                f"partition (sha256 {fragment.digest[:12]} != recorded "
                f"{str(entry.get('sha256'))[:12]}). Migrated fragments are the "
                f"frozen record of what the unpartitioned file said."
            )
        baseline_fragments.append(fragment)

    if problems:
        return problems

    recorded_names = {entry["file"] for entry in recorded}
    ordered = [f for f in on_disk if f.filename in recorded_names]
    rendered_order = [f.filename for f in ordered]
    recorded_order = [entry["file"] for entry in recorded]
    if rendered_order != recorded_order:
        problems.append(
            "fragment ORDER drifted from the partition. Rendered: "
            f"{rendered_order}; recorded: {recorded_order}. A partitioning that "
            "reorders history is worse than the conflict it removed."
        )
        return problems

    # The claim the spec actually makes: the concatenated view is
    # byte-identical to what the unpartitioned file produced. This digest
    # covers exactly the partitioned region, so an unrelated edit to the
    # preamble or to released history cannot erode it -- and `restamp`
    # never touches it.
    pending = sha256_text("".join(f.text for f in ordered))
    if pending != baseline.get("partitionPendingSha256"):
        problems.append(
            f"{target.rendered_rel}: the concatenation of the baseline "
            f"fragments no longer equals the pending region the unpartitioned "
            f"file held (sha256 {pending[:12]} != recorded "
            f"{str(baseline.get('partitionPendingSha256'))[:12]}). This is the "
            f"round-trip contract itself; there is no re-stamp for it."
        )

    reproduced = render(target, root, fragments=ordered)
    actual = sha256_text(reproduced)
    expected = baseline.get("originalSha256")
    if actual != expected:
        problems.append(
            f"{target.rendered_rel}: rendering from the baseline fragments no "
            f"longer reproduces the recorded document (sha256 "
            f"{actual[:12]} != recorded {str(expected)[:12]}). Either the "
            f"preamble/released history was edited, or a fragment moved. "
            f"A deliberate edit to frozen text is re-stamped with "
            f"`restamp`, which refuses to run if fragment order or content "
            f"changed."
        )
    return problems


# --- operations --------------------------------------------------------------


def migrate(target: ChangelogTarget, root: str, level: Optional[int] = None) -> List[Fragment]:
    """One-time: cut the pending region into fragments and stamp the baseline.

    The rewritten ``CHANGELOG.md`` keeps the preamble (now including the
    pending region's lead, which is section furniture rather than anyone's
    contribution) and the released history. Every byte that moved out is
    in a fragment, verbatim.
    """
    heading_level = target.fragment_heading_level if level is None else level
    path = target.rendered_path(root)
    original = read_text(path)
    parts = split_document(original)
    lead, blocks = split_blocks(parts.pending, heading_level)
    if not blocks:
        raise ChangelogError(
            f"{target.rendered_rel}: found no level-{heading_level} blocks in the "
            f"pending region, so there is nothing to partition. Migrating anyway "
            f"would stamp a baseline over an empty corpus."
        )

    total = len(blocks)
    fragments: List[Fragment] = []
    used: Dict[str, int] = {}
    for position, block in enumerate(blocks):
        # Descending order keys in document order: the topmost (newest)
        # block gets the highest key, so `max + 10` puts the next
        # contribution above it without renumbering anything.
        order = (total - position) * ORDER_STEP
        slug = derive_slug(block)
        seen = used.get(slug, 0)
        used[slug] = seen + 1
        if seen:
            slug = f"{slug}-{seen + 1}"
        fragments.append(Fragment(order=order, slug=slug, text=block))

    ordered = sorted(fragments, key=lambda f: (f.order, f.slug), reverse=True)
    rewritten = parts.preamble + lead + parts.released
    reproduced = (
        split_document(rewritten).preamble
        + split_document(rewritten).pending
        + "".join(f.text for f in ordered)
        + split_document(rewritten).released
    )
    # Verified BEFORE anything reaches disk. A migration that cannot
    # round-trip must leave no trace: a half-partitioned changelog is
    # harder to reason about than the conflict this replaces.
    if sha256_text(reproduced) != sha256_text(original):
        raise ChangelogError(
            f"{target.rendered_rel}: the partition does NOT round-trip, so "
            f"nothing was written. This is the assertion the whole change "
            f"exists to make, so it is checked before the migration is trusted."
        )

    directory = target.fragments_dir(root)
    os.makedirs(directory, exist_ok=True)
    for fragment in ordered:
        write_text(os.path.join(directory, fragment.filename), fragment.text)

    write_text(path, rewritten)

    baseline = {
        "note": (
            "Set 122 S4. Pins the byte-identity contract: rendering from the "
            "fragments listed here must reproduce the pre-partition "
            "CHANGELOG.md exactly (after LF normalization). Verified by "
            "`python -m ai_router.changelog check` and by "
            "ai_router/tests/test_changelog_partition.py."
        ),
        "target": target.key,
        "rendered": target.rendered_rel,
        "partitionedAt": datetime.now().astimezone().isoformat(),
        "fragmentHeadingLevel": heading_level,
        # Frozen forever, never re-stamped: the digest of the pending
        # region as the unpartitioned file held it. `restamp` deliberately
        # cannot reach these two, so the escape hatch for an edit to
        # frozen prose can never become an escape hatch for a reorder.
        "partitionSha256": sha256_text(original),
        "partitionPendingSha256": sha256_text("".join(f.text for f in ordered)),
        # Tracks the whole rendered document, so a deliberate later edit
        # to the preamble or to released history is re-stamped here.
        "originalSha256": sha256_text(original),
        "originalBytes": len(original.encode("utf-8")),
        "fragments": [
            {"file": f.filename, "sha256": f.digest, "bytes": len(f.text.encode("utf-8"))}
            for f in ordered
        ],
    }
    write_text(
        target.baseline_path(root), json.dumps(baseline, indent=2, ensure_ascii=False) + "\n"
    )
    return ordered


def add_fragment(
    target: ChangelogTarget,
    root: str,
    section: str,
    slug: str,
    body: Optional[str] = None,
    title: Optional[str] = None,
) -> Fragment:
    """Create the next fragment for a contribution and return it.

    The order key is allocated here rather than chosen by hand: two
    concurrent sessions each read the same ``max`` and both write
    ``max + 10``, which is a *tie* broken by slug — two distinct new
    files, no shared file, no conflict.

    The stub matches the target's own shape. A level-2 target (the
    router, whose fragments are whole ``## [Unreleased] — …`` sections)
    gets that heading with the section nested under it; a level-3 target
    (the extension, whose fragments are ``### <Section>`` blocks inside
    one Unreleased) gets the section heading alone. Emitting
    ``"#" * level + section`` for both produced a bare ``## Added`` for
    the router, which is not a shape Keep a Changelog has.
    """
    fragments = load_fragments(target, root)
    order = next_order(fragments)
    heading = f"### {section.strip()}"
    if target.fragment_heading_level <= 2:
        heading = f"## [Unreleased] \u2014 {(title or slug).strip()}\n\n{heading}"
    text = body if body is not None else f"{heading}\n\n- \n"
    if not text.endswith("\n"):
        text += "\n"
    fragment = Fragment(order=order, slug=slug, text=text)
    path = os.path.join(target.fragments_dir(root), fragment.filename)
    if os.path.exists(path):
        raise ChangelogError(f"{path} already exists; pick another slug.")
    write_text(path, fragment.text)
    _rebaseline_after_fold(target, root)
    return fragment


def _rebaseline_after_fold(target: ChangelogTarget, root: str) -> bool:
    """Re-establish a partition point on the first fragment after a fold.

    Set 113 S1. ``fold`` empties ``fragments``, stamps ``foldedAt``, and
    re-pins ``partitionPendingSha256`` / ``originalSha256`` to the folded
    document. That state is coherent while the corpus stays empty, and it
    stops being coherent the moment anyone contributes: ``check`` returns
    early on an empty recorded corpus, so the new fragment sits entirely
    outside the round-trip guard, and the corpus matches neither state the
    baseline can describe -- no recorded fragments, ``foldedAt`` set, and a
    file on disk. Every planted-violation falsifier over the live corpus
    then has nothing to examine (L-112-1), which is how the suite reports
    it.

    A fold is a re-partition: the document it wrote IS the new frozen
    history, exactly as the pre-partition document was after ``migrate``.
    So the first contribution after one re-stamps the same three fields
    ``migrate`` stamps, against that document.

    **Only that transition.** A mid-cycle add is left alone, which is the
    behaviour every release before this one already had: ``check`` filters
    the round trip to fragments the baseline RECORDS, so an unrecorded new
    fragment is ignored by it and the recorded corpus keeps proving what
    it always proved. Advancing the pins on every add would instead
    re-stamp ``originalSha256`` from the current file each time, which
    would silently absorb an edit to released history made just before a
    contribution -- the guard's whole job. Widening the round trip to
    cover pending fragments too is a real gap and a real question, but it
    is a change to what the guard PROVES, so it belongs to the operator
    and to the set that already has it queued, not to a helper called from
    ``add``.

    Returns ``True`` when it re-baselined.
    """
    baseline = load_baseline(target, root)
    if baseline is None:
        # A missing baseline is its own loud failure in `check`, which
        # names the migrate command. Inventing one here would answer a
        # question nobody asked and paper over a deleted file.
        return False
    if baseline.get("fragments") or not baseline.get("foldedAt"):
        return False

    fragments = load_fragments(target, root)
    if not fragments:
        return False

    rendered = render(target, root, fragments=fragments)
    baseline.update(
        {
            "partitionedAt": datetime.now().astimezone().isoformat(),
            "partitionPendingSha256": sha256_text(
                "".join(f.text for f in fragments)
            ),
            "originalSha256": sha256_text(rendered),
            "originalBytes": len(rendered.encode("utf-8")),
            "fragments": [
                {
                    "file": f.filename,
                    "sha256": f.digest,
                    "bytes": len(f.text.encode("utf-8")),
                }
                for f in fragments
            ],
            "note": (
                "Re-partitioned at the first contribution after a release "
                "fold. The folded CHANGELOG.md is the frozen document this "
                "corpus round-trips against."
            ),
        }
    )
    # The corpus is no longer the post-fold empty one. Leaving the marker
    # would let a later delete-everything look like a legitimately empty
    # corpus, which is the state it exists to certify.
    baseline.pop("foldedAt", None)
    write_text(
        target.baseline_path(root),
        json.dumps(baseline, indent=2, ensure_ascii=False) + "\n",
    )
    return True


def fold(target: ChangelogTarget, root: str) -> int:
    """Write the full computed view back into ``CHANGELOG.md`` and clear fragments.

    The release-time act, run once by the operator when a version is cut.
    It is deliberately *not* part of any session: a session that folded
    would put the shared file back in the write path and re-create the
    conflict this module removed.
    """
    fragments = load_fragments(target, root)
    if not fragments:
        return 0
    rendered = render(target, root, fragments=fragments)
    write_text(target.rendered_path(root), rendered)
    directory = target.fragments_dir(root)
    for fragment in fragments:
        os.remove(os.path.join(directory, fragment.filename))
    baseline = load_baseline(target, root) or {}
    baseline.update(
        {
            "foldedAt": datetime.now().astimezone().isoformat(),
            "fragments": [],
            "partitionPendingSha256": sha256_text(""),
            "originalSha256": sha256_text(rendered),
            "originalBytes": len(rendered.encode("utf-8")),
            "note": (
                "Folded into the rendered CHANGELOG.md at release time. The "
                "pending corpus is empty by design until the next contribution."
            ),
        }
    )
    write_text(
        target.baseline_path(root), json.dumps(baseline, indent=2, ensure_ascii=False) + "\n"
    )
    return len(fragments)


def restamp(target: ChangelogTarget, root: str) -> str:
    """Re-record ``originalSha256`` after a deliberate edit to frozen text.

    Refuses whenever fragment order or fragment content changed, so the
    escape hatch for "I fixed a typo in a released section" can never be
    the escape hatch for "I reordered history".
    """
    baseline = load_baseline(target, root)
    if baseline is None:
        raise ChangelogError(f"{target.baseline_path(root)}: nothing to restamp.")
    recorded = baseline.get("fragments") or []
    by_name = {f.filename: f for f in load_fragments(target, root)}
    for entry in recorded:
        fragment = by_name.get(entry.get("file"))
        if fragment is None or fragment.digest != entry.get("sha256"):
            raise ChangelogError(
                f"refusing to restamp {target.key}: fragment "
                f"{entry.get('file')!r} is missing or changed. --restamp covers "
                f"edits to the preamble and released history ONLY; a changed "
                f"fragment is exactly what the baseline exists to catch."
            )
    baseline_fragments = [by_name[e["file"]] for e in recorded]
    rendered = render(target, root, fragments=baseline_fragments)
    baseline["originalSha256"] = sha256_text(rendered)
    baseline["originalBytes"] = len(rendered.encode("utf-8"))
    baseline["restampedAt"] = datetime.now().astimezone().isoformat()
    write_text(
        target.baseline_path(root), json.dumps(baseline, indent=2, ensure_ascii=False) + "\n"
    )
    return baseline["originalSha256"]


# --- CLI ---------------------------------------------------------------------


def resolve_targets(key: str) -> List[ChangelogTarget]:
    if key == "all":
        return [TARGETS[k] for k in sorted(TARGETS)]
    if key not in TARGETS:
        raise ChangelogError(
            f"unknown target {key!r}; choose from {', '.join(sorted(TARGETS))} or 'all'."
        )
    return [TARGETS[key]]


def repo_root(explicit: Optional[str] = None) -> str:
    if explicit:
        return explicit
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def emit(text: str) -> None:
    """Write *text* to stdout as UTF-8 BYTES, never through the text layer.

    L-079-1, the standing Windows bug class: the console's text layer
    defaults to ``cp1252``, and a changelog is wall-to-wall em dashes,
    arrows and curly quotes — so ``print(render(...))`` raises
    ``UnicodeEncodeError`` and loses the whole document. It did, on the
    first run of this CLI. Bytes end-to-end is the fix the lesson names.
    """
    buffer = getattr(sys.stdout, "buffer", None)
    if buffer is None:  # pragma: no cover - captured stdout in tests
        sys.stdout.write(text)
        return
    buffer.write(text.encode("utf-8"))
    buffer.flush()


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ai_router.changelog",
        description=(
            "Partitioned changelogs: one fragment file per contribution, one "
            "computed view. Sessions add a fragment and never edit CHANGELOG.md, "
            "so concurrent sessions cannot conflict on it."
        ),
    )
    parser.add_argument(
        "command",
        choices=["render", "check", "add", "migrate", "fold", "restamp", "list"],
        help=(
            "render: print the whole changelog. check: verify the round-trip "
            "baseline. add: create the next fragment. migrate: one-time "
            "partition. fold: release-time write-back (operator). restamp: "
            "re-record the digest after a deliberate frozen-text edit. list: "
            "show fragments in render order."
        ),
    )
    parser.add_argument(
        "--target",
        default="all",
        help="router, extension, or all (default: all).",
    )
    parser.add_argument("--root", default=None, help="Repo root (default: inferred).")
    parser.add_argument(
        "--write",
        action="store_true",
        help="render: write the computed view into CHANGELOG.md instead of stdout.",
    )
    parser.add_argument("--section", default="Added", help="add: the section heading.")
    parser.add_argument("--slug", default=None, help="add: filename stem.")
    parser.add_argument(
        "--title",
        default=None,
        help=(
            "add: the '## [Unreleased] -- <title>' headline, for targets whose "
            "fragments are whole sections (the router). Defaults to the slug."
        ),
    )
    parser.add_argument(
        "--level", type=int, default=None, help="migrate: heading level to split at."
    )
    parser.add_argument("--json", action="store_true", help="Machine-readable output.")
    ns = parser.parse_args(argv)

    try:
        targets = resolve_targets(ns.target)
    except ChangelogError as exc:
        print(f"changelog: {exc}", file=sys.stderr)
        return 2
    root = repo_root(ns.root)

    try:
        if ns.command == "render":
            for target in targets:
                text = render(target, root)
                if ns.write:
                    write_text(target.rendered_path(root), text)
                    print(f"[dabbler] wrote {target.rendered_rel}")
                else:
                    emit(text)
            return 0

        if ns.command == "check":
            failed = False
            report: Dict[str, List[str]] = {}
            for target in targets:
                problems = check(target, root)
                report[target.key] = problems
                if problems:
                    failed = True
            if ns.json:
                print(json.dumps(report, indent=2))
            else:
                for key, problems in report.items():
                    if problems:
                        for problem in problems:
                            print(f"changelog[{key}]: {problem}", file=sys.stderr)
                    else:
                        print(f"[dabbler] {key}: round trip OK")
            return 1 if failed else 0

        if ns.command == "list":
            for target in targets:
                emit(f"# {target.key} ({target.fragments_rel})\n")
                for fragment in load_fragments(target, root):
                    first = fragment.text.splitlines()[0] if fragment.text else ""
                    emit(f"  {fragment.filename}  {first[:70]}\n")
            return 0

        if ns.command == "add":
            if ns.target == "all":
                print(
                    "changelog: add needs one --target (router or extension).",
                    file=sys.stderr,
                )
                return 2
            if not ns.slug:
                print("changelog: add needs --slug.", file=sys.stderr)
                return 2
            fragment = add_fragment(
                targets[0], root, ns.section, ns.slug, title=ns.title
            )
            print(f"[dabbler] created {targets[0].fragments_rel}/{fragment.filename}")
            return 0

        if ns.command == "migrate":
            for target in targets:
                fragments = migrate(target, root, ns.level)
                print(
                    f"[dabbler] {target.key}: partitioned into {len(fragments)} "
                    f"fragment(s); round trip verified."
                )
            return 0

        if ns.command == "fold":
            for target in targets:
                count = fold(target, root)
                print(f"[dabbler] {target.key}: folded {count} fragment(s).")
            return 0

        if ns.command == "restamp":
            for target in targets:
                digest = restamp(target, root)
                print(f"[dabbler] {target.key}: restamped {digest[:12]}")
            return 0
    except ChangelogError as exc:
        print(f"changelog: {exc}", file=sys.stderr)
        return 3

    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())


__all__ = [
    "BASELINE_FILENAME",
    "ORDER_STEP",
    "TARGETS",
    "BaselineMismatchError",
    "ChangelogError",
    "ChangelogTarget",
    "DocumentParts",
    "Fragment",
    "add_fragment",
    "check",
    "derive_slug",
    "emit",
    "fold",
    "load_baseline",
    "load_fragments",
    "main",
    "migrate",
    "next_order",
    "read_text",
    "render",
    "repo_root",
    "resolve_targets",
    "restamp",
    "sha256_text",
    "split_blocks",
    "split_document",
    "write_text",
]
