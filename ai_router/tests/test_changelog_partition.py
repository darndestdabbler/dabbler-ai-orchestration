"""The round-trip contract for partitioned changelogs (Set 122 Session 4).

The spec's binding requirement for this session:

    Keep the concatenated view byte-identical to what the unpartitioned
    file produced for the same inputs, and ship a falsifier proving the
    round trip. A partitioning that quietly reorders history is worse
    than the conflict it removes.

So these tests are written to L-112-1: a gate that only ever passes
proves nothing. Every guarantee below is asserted twice — once that the
honest case passes, and once that a **planted** violation makes it fail.
Reading the concatenation code cannot distinguish "reproduces history"
from "reproduces something"; only planting a reorder can.

The live-corpus tests run against the two real changelogs in this repo,
which is where the assertion earns its keep: a synthetic three-entry
fixture round-trips under almost any implementation, while 550KB of
hand-written prose containing em dashes, fenced code, nested blockquotes
and ten differently-shaped section blocks does not.
"""

from __future__ import annotations

import json
import os
import shutil

import pytest

from ai_router import changelog as cl


# --- helpers -----------------------------------------------------------------


@pytest.fixture
def live_root() -> str:
    """The repo root, so the tests read the real changelogs."""
    return cl.repo_root()


def _seed_pending_region(target, released: str) -> str:
    """A pending region of REAL prose, rebuilt from released history.

    Set 133 S1: the falsifier battery below plants defects into the live
    corpus, and `fold` empties that corpus at every release — so from the
    moment a version is cut until the next contribution, every planted
    violation had nothing left to plant into and the whole battery went
    red on a repo that was working correctly. A gate that only functions
    between releases is not a gate.

    Seeding keeps the property the module docstring actually relies on:
    the subjects are hand-written changelog prose with em dashes, fenced
    code and nested blockquotes, not a synthetic three-liner that would
    round-trip under almost any implementation. They are taken from this
    repo's own released history, re-headed into the pending region at the
    target's fragment heading level so `migrate` cuts them the way a real
    contribution would be cut.
    """
    _, sections = cl.split_blocks(released, 2)
    assert len(sections) >= 2, "released history should carry version sections"
    if target.fragment_heading_level <= 2:
        # Whole-section fragments (the router): re-head two released
        # sections as Unreleased contributions.
        blocks = []
        for index, section in enumerate(sections[:2]):
            lines = section.splitlines(keepends=True)
            body = "".join(lines[1:])
            blocks.append(f"## [Unreleased] — seeded prose {index}\n{body}")
        return "".join(blocks)
    # Level-3 fragments (the extension): the body of one released section
    # already contains several `### Added` / `### Changed` blocks, which
    # is exactly the shape migrate cuts for this target.
    lines = sections[0].splitlines(keepends=True)
    body = "".join(lines[1:])
    _, inner = cl.split_blocks(body, 3)
    assert len(inner) >= 2, "released section should carry several subsections"
    return "## [Unreleased] — seeded\n\n" + "".join(inner)


@pytest.fixture
def sandbox(tmp_path, live_root):
    """A throwaway copy of the live corpus, guaranteed non-empty.

    Mutation tests plant defects, so they must never touch the tree the
    developer is working in. When the live corpus has just been folded
    into a release, the copy is re-seeded from real released prose (see
    :func:`_seed_pending_region`) so the falsifiers keep their subjects.
    """
    root = tmp_path / "repo"
    for target in cl.TARGETS.values():
        rendered_src = target.rendered_path(live_root)
        rendered_dst = root / target.rendered_rel.replace("/", os.sep)
        rendered_dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(rendered_src, rendered_dst)
        fragments_src = target.fragments_dir(live_root)
        if os.path.isdir(fragments_src):
            shutil.copytree(fragments_src, root / target.fragments_rel.replace("/", os.sep))

    for target in cl.TARGETS.values():
        if cl.load_fragments(target, str(root)):
            continue
        path = target.rendered_path(str(root))
        parts = cl.split_document(cl.read_text(path))
        seeded = _seed_pending_region(target, parts.released)
        cl.write_text(path, parts.preamble + seeded + parts.released)
        cl.migrate(target, str(root))
    return str(root)


def _write_doc(path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    cl.write_text(str(path), body)


def baseline_fragments(target, root):
    """Only the fragments the baseline froze, in render order.

    The falsifiers must plant into the *migrated* corpus. Taking
    ``load_fragments(...)[0]`` instead would silently retarget onto
    whatever contribution was added most recently — which is a fragment
    the baseline does not cover, so nothing would fire and the test
    would pass having asserted nothing.
    """
    recorded = {e["file"] for e in cl.load_baseline(target, root)["fragments"]}
    return [f for f in cl.load_fragments(target, root) if f.filename in recorded]


SYNTHETIC = (
    "# Changelog\n"
    "\n"
    "Intro prose.\n"
    "\n"
    "## [Unreleased] — pending\n"
    "\n"
    "> Lead blockquote that belongs above every contribution.\n"
    "\n"
    "### Added\n"
    "\n"
    "- **(Set 300 S1) Newest thing.** Body.\n"
    "\n"
    "### Fixed\n"
    "\n"
    "- **(Set 299 S2) Older fix.** Body.\n"
    "\n"
    "## [1.2.3] — 2026-01-01\n"
    "\n"
    "### Added\n"
    "\n"
    "- Released, frozen, never re-rendered.\n"
)


@pytest.fixture
def synthetic(tmp_path):
    """A tiny two-block corpus, for the shape assertions."""
    root = tmp_path / "syn"
    target = cl.ChangelogTarget(
        key="syn",
        rendered_rel="pkg/CHANGELOG.md",
        fragments_rel="pkg/changelog.d",
        fragment_heading_level=3,
        label="synthetic",
    )
    _write_doc(root / "pkg" / "CHANGELOG.md", SYNTHETIC)
    return str(root), target


# --- the live corpus round-trips ---------------------------------------------


@pytest.mark.parametrize("key", sorted(cl.TARGETS))
def test_live_corpus_round_trips(live_root, key):
    """`check` passes on the real, shipped partition of both changelogs."""
    problems = cl.check(cl.TARGETS[key], live_root)
    assert problems == [], "\n".join(problems)


@pytest.mark.parametrize("key", sorted(cl.TARGETS))
def test_baseline_corpus_is_non_empty(live_root, key):
    """The scan examined something.

    L-112-1's second half: a check whose corpus comes back empty passes
    having examined nothing, and no planted-violation falsifier covers
    that. Assert the input set, not just the verdict.

    Set 133 S1: an empty corpus is legitimate in exactly one state, and
    `check` already ships that rule — a baseline that lists no fragments
    passes only when `foldedAt` records the release that emptied it. So
    the assertion is not "there are fragments" (which is false for every
    repo sitting on a freshly cut release) but "the corpus and the
    baseline agree about which state this repo is in".
    """
    target = cl.TARGETS[key]
    baseline = cl.load_baseline(target, live_root)
    assert baseline is not None
    on_disk = cl.load_fragments(target, live_root)
    if baseline["fragments"]:
        assert on_disk, f"{key}: baseline lists fragments but none are on disk"
        return
    assert baseline.get("foldedAt"), (
        f"{key}: baseline lists no fragments and records no fold — an empty "
        f"corpus would pass the round-trip check without examining anything"
    )
    assert not on_disk, (
        f"{key}: baseline records a fold but fragments are on disk; the fold "
        f"deletes what it folds, so this corpus is neither state"
    )


@pytest.mark.parametrize("key", sorted(cl.TARGETS))
def test_concatenation_equals_the_recorded_pending_region(live_root, key):
    """The claim in the spec's own words, asserted directly.

    Not "a digest matches" but: the bytes of the fragments, joined in
    render order, are the bytes the unpartitioned file held.

    Set 133 S1: once a release is folded there is no pending region left
    to make that claim about, and the frozen record becomes the whole
    rendered document. The test asserts THAT instead of skipping —
    deliberately, because it is the comparison `check` itself omits in
    its post-fold branch (see the xfail falsifier below).
    """
    target = cl.TARGETS[key]
    baseline = cl.load_baseline(target, live_root)
    fragments = baseline_fragments(target, live_root)
    if not fragments:
        assert baseline.get("foldedAt"), "vacuous: no fragments and no fold"
        rendered = cl.read_text(target.rendered_path(live_root))
        assert cl.sha256_text(rendered) == baseline["originalSha256"], (
            f"{key}: the folded document no longer matches the digest the "
            f"fold recorded for it"
        )
        return
    joined = "".join(f.text for f in fragments)
    assert cl.sha256_text(joined) == baseline["partitionPendingSha256"]


@pytest.mark.parametrize("key", sorted(cl.TARGETS))
def test_render_preserves_every_released_heading(live_root, key):
    """A structural assertion beside the digest one (L-112-1).

    A digest says "something changed" without saying what; this says the
    version history is all still there, in order, however it is spelled.
    """
    target = cl.TARGETS[key]
    rendered = cl.render(target, live_root)
    on_disk = cl.read_text(target.rendered_path(live_root))
    headings = [ln for ln in on_disk.splitlines() if ln.startswith("## [")]
    assert headings, f"{key}: no version headings found — vacuous assertion"
    rendered_headings = [ln for ln in rendered.splitlines() if ln.startswith("## [")]
    assert rendered_headings[-len(headings):] == headings


# --- planted violations: the falsifiers --------------------------------------


@pytest.mark.parametrize("key", sorted(cl.TARGETS))
def test_planted_reorder_fails_the_check(sandbox, key):
    """Swap two fragments' order keys — the check must refuse.

    This is the defect the spec names as worse than the conflict: history
    silently resequenced. Renaming the files is the whole edit, because
    the order key IS the filename prefix, so a reorder in the real world
    looks exactly like this.
    """
    target = cl.TARGETS[key]
    assert cl.check(target, sandbox) == [], "sandbox should start clean"
    fragments = baseline_fragments(target, sandbox)
    assert len(fragments) >= 2
    directory = target.fragments_dir(sandbox)
    first, second = fragments[0], fragments[1]
    tmp = os.path.join(directory, "tmp.md")
    os.rename(os.path.join(directory, first.filename), tmp)
    os.rename(
        os.path.join(directory, second.filename),
        os.path.join(directory, f"{first.order:04d}-{second.slug}.md"),
    )
    os.rename(tmp, os.path.join(directory, f"{second.order:04d}-{first.slug}.md"))

    problems = cl.check(target, sandbox)
    assert problems, "a reordered partition passed the round-trip check"


@pytest.mark.parametrize("key", sorted(cl.TARGETS))
def test_planted_dropped_fragment_fails_the_check(sandbox, key):
    """Delete one fragment — the check must refuse.

    Losing an entry is the quiet failure mode of any concatenation: the
    document still parses, still reads plausibly, and is missing history.
    """
    target = cl.TARGETS[key]
    fragments = baseline_fragments(target, sandbox)
    os.remove(os.path.join(target.fragments_dir(sandbox), fragments[-1].filename))
    problems = cl.check(target, sandbox)
    assert problems, "a partition missing a fragment passed the round-trip check"
    assert any("missing" in p for p in problems)


@pytest.mark.parametrize("key", sorted(cl.TARGETS))
def test_planted_edit_to_a_migrated_fragment_fails_the_check(sandbox, key):
    """Change one character inside a migrated fragment — the check must refuse."""
    target = cl.TARGETS[key]
    fragments = baseline_fragments(target, sandbox)
    path = os.path.join(target.fragments_dir(sandbox), fragments[0].filename)
    cl.write_text(path, cl.read_text(path).replace("the", "teh", 1))
    problems = cl.check(target, sandbox)
    assert problems, "an edited migrated fragment passed the round-trip check"


@pytest.mark.parametrize("key", sorted(cl.TARGETS))
def test_planted_released_history_edit_fails_the_check(sandbox, key):
    """Edit frozen released history — the check must refuse.

    The rendered view is supposed to reproduce a specific document; an
    unannounced edit to the part that never moves is still a divergence.
    """
    target = cl.TARGETS[key]
    path = target.rendered_path(sandbox)
    text = cl.read_text(path)
    marker = "## ["
    index = text.rindex(marker)
    cl.write_text(path, text[:index] + "Planted line.\n\n" + text[index:])
    problems = cl.check(target, sandbox)
    assert problems, "an edited released history passed the round-trip check"


def test_an_empty_baseline_does_not_pass_vacuously(sandbox):
    """A baseline listing no fragments must FAIL unless a fold recorded why.

    Without this, wiping `changelog.d/` and blanking the baseline would
    turn the whole contract green — the exact "corpus came back empty"
    shape L-112-1 says a planted-violation falsifier does not cover.
    """
    target = cl.TARGETS["router"]
    baseline = cl.load_baseline(target, sandbox)
    baseline["fragments"] = []
    baseline.pop("foldedAt", None)
    cl.write_text(target.baseline_path(sandbox), json.dumps(baseline, indent=2) + "\n")
    problems = cl.check(target, sandbox)
    assert problems
    assert any("examining anything" in p for p in problems)


@pytest.mark.xfail(
    strict=True,
    reason=(
        "OPEN DEFECT, found by Set 133 S1 running `fold` on the live repo for "
        "the first time. check()'s empty-corpus branch returns [] as soon as "
        "foldedAt is stamped, without ever comparing the originalSha256 that "
        "fold recorded for the whole document. So between a release and the "
        "next contribution the round-trip guard verifies nothing and an edit "
        "to released history passes silently. The fix is ~6 lines and "
        "symmetric with the comparison the non-empty path already makes; it "
        "was deliberately NOT applied here because this set's spec forbids "
        "product code changes in a release commit (operator ruling, "
        "2026-08-15, journaled). Owner: the follow-on set that picks up this "
        "residual. This test turns green the day the gap is closed."
    ),
)
def test_post_fold_check_still_guards_released_history(sandbox):
    """The window a release is cut in must not be the window with no guard."""
    target = cl.TARGETS["router"]
    assert cl.fold(target, sandbox) > 0, "precondition: something to fold"
    assert cl.check(target, sandbox) == [], "precondition: a fresh fold is clean"

    path = target.rendered_path(sandbox)
    text = cl.read_text(path)
    index = text.rindex("## [")
    cl.write_text(path, text[:index] + "Planted line.\n\n" + text[index:])

    problems = cl.check(target, sandbox)
    assert problems, "a folded changelog accepted an edit to released history"


def test_a_missing_baseline_does_not_pass_vacuously(sandbox):
    """Deleting the baseline must fail, not silently skip the contract."""
    target = cl.TARGETS["router"]
    os.remove(target.baseline_path(sandbox))
    problems = cl.check(target, sandbox)
    assert problems
    assert any("no baseline" in p for p in problems)


# --- restamp is not an escape hatch for a reorder ----------------------------


def test_restamp_accepts_a_frozen_prose_edit(sandbox):
    """The legitimate case: released history was deliberately corrected."""
    target = cl.TARGETS["router"]
    path = target.rendered_path(sandbox)
    text = cl.read_text(path)
    cl.write_text(path, text.replace("All notable changes", "All the notable changes", 1))
    assert cl.check(target, sandbox), "precondition: the edit should break the digest"
    cl.restamp(target, sandbox)
    assert cl.check(target, sandbox) == []


def test_restamp_refuses_when_a_fragment_changed(sandbox):
    """The look-alike: restamp must not launder an edited fragment.

    Without this refusal the escape hatch for "I fixed a typo in a
    released section" becomes the escape hatch for "I rewrote history",
    and the whole baseline is decorative.
    """
    target = cl.TARGETS["router"]
    fragments = baseline_fragments(target, sandbox)
    path = os.path.join(target.fragments_dir(sandbox), fragments[0].filename)
    cl.write_text(path, cl.read_text(path) + "\n- Planted entry.\n")
    with pytest.raises(cl.ChangelogError, match="refusing to restamp"):
        cl.restamp(target, sandbox)


def test_restamp_refuses_when_a_fragment_is_missing(sandbox):
    target = cl.TARGETS["router"]
    fragments = baseline_fragments(target, sandbox)
    os.remove(os.path.join(target.fragments_dir(sandbox), fragments[0].filename))
    with pytest.raises(cl.ChangelogError, match="refusing to restamp"):
        cl.restamp(target, sandbox)


def test_restamp_never_touches_the_partition_digests(sandbox):
    """`partitionSha256` / `partitionPendingSha256` are frozen by design."""
    target = cl.TARGETS["router"]
    before = cl.load_baseline(target, sandbox)
    path = target.rendered_path(sandbox)
    cl.write_text(path, cl.read_text(path) + "\nTrailing prose.\n")
    cl.restamp(target, sandbox)
    after = cl.load_baseline(target, sandbox)
    assert after["partitionSha256"] == before["partitionSha256"]
    assert after["partitionPendingSha256"] == before["partitionPendingSha256"]
    assert after["originalSha256"] != before["originalSha256"]


# --- the slicing itself ------------------------------------------------------


def test_split_document_is_lossless_on_the_live_corpus(live_root):
    for target in cl.TARGETS.values():
        text = cl.read_text(target.rendered_path(live_root))
        assert cl.split_document(text).text == text


def test_split_blocks_is_lossless_on_the_live_corpus(live_root):
    for target in cl.TARGETS.values():
        for fragment in cl.load_fragments(target, live_root):
            lead, blocks = cl.split_blocks(fragment.text, target.fragment_heading_level)
            assert lead + "".join(blocks) == fragment.text


def test_a_heading_inside_a_fenced_code_block_is_not_a_split_point():
    """The legitimate look-alike, planted (L-112-1).

    A changelog that documents markdown, or quotes a spec, contains lines
    that read exactly like headings. Splitting there would cut a code
    sample in half — and because concatenation still round-trips, only a
    human reader would ever find out.
    """
    region = (
        "### Added\n"
        "\n"
        "- Documents the heading convention:\n"
        "\n"
        "  ```markdown\n"
        "  ### Fixed\n"
        "  ### Removed\n"
        "  ```\n"
        "\n"
        "- Second bullet.\n"
    )
    lead, blocks = cl.split_blocks(region, 3)
    assert lead == ""
    assert len(blocks) == 1, "split inside a fenced code block"
    assert blocks[0] == region


def test_a_real_sibling_heading_is_still_a_split_point():
    """The paired assertion: the fence rule must not become a blanket."""
    region = "### Added\n\n- One.\n\n### Fixed\n\n- Two.\n"
    lead, blocks = cl.split_blocks(region, 3)
    assert lead == ""
    assert len(blocks) == 2
    assert "".join(blocks) == region


def test_unreleased_heading_is_not_mistaken_for_released_history():
    parts = cl.split_document(SYNTHETIC)
    assert parts.preamble.endswith("Intro prose.\n\n")
    assert parts.pending.startswith("## [Unreleased]")
    assert parts.released.startswith("## [1.2.3]")


def test_a_document_with_no_released_section_still_splits():
    text = "# C\n\n## [Unreleased] — x\n\n### Added\n\n- One.\n"
    parts = cl.split_document(text)
    assert parts.released == ""
    assert parts.text == text


# --- the going-forward contract ----------------------------------------------


def test_migrate_render_round_trips_the_synthetic_corpus(synthetic):
    root, target = synthetic
    original = cl.read_text(target.rendered_path(root))
    cl.migrate(target, root)
    assert cl.render(target, root) == original


def test_migrate_keeps_the_pending_lead_above_every_contribution(synthetic):
    """The bug the live round trip caught, pinned so it cannot come back.

    The extension changelog's pending region opens with a heading and a
    blockquote that are section furniture, not anyone's contribution.
    Splicing fragments after the *preamble* rather than after the pending
    lead dropped both, and every entry still rendered — which is why only
    a byte comparison found it.
    """
    root, target = synthetic
    cl.migrate(target, root)
    rewritten = cl.read_text(target.rendered_path(root))
    assert "> Lead blockquote that belongs above every contribution." in rewritten
    rendered = cl.render(target, root)
    lead_at = rendered.index("Lead blockquote")
    first_entry_at = rendered.index("Newest thing")
    assert lead_at < first_entry_at


def test_a_new_contribution_lands_on_top_without_renumbering(synthetic):
    """`max + 10` and a descending sort: the newest entry is first."""
    root, target = synthetic
    migrated = cl.migrate(target, root)
    before = [f.filename for f in migrated]
    cl.add_fragment(target, root, "Added", "set-301-s1-new-thing", "### Added\n\n- New.\n")
    after = cl.load_fragments(target, root)
    assert after[0].slug == "set-301-s1-new-thing"
    assert [f.filename for f in after[1:]] == before, "existing fragments were renumbered"
    assert cl.render(target, root).index("- New.") < cl.render(target, root).index(
        "Newest thing"
    )


def test_two_concurrent_contributions_do_not_share_a_file(synthetic):
    """The whole point: concurrency produces two new files, not one conflict.

    Both sessions read the same `max` and both allocate the same order
    key — a tie, broken by slug. Two distinct files, no shared write.
    """
    root, target = synthetic
    cl.migrate(target, root)
    a = cl.add_fragment(target, root, "Added", "set-310-s1-alpha", "### Added\n\n- A.\n")
    # A concurrent worktree has not seen `a` yet, so it allocates the
    # same order key from the same `max`.
    b = cl.Fragment(order=a.order, slug="set-311-s1-beta", text="### Added\n\n- B.\n")
    cl.write_text(os.path.join(target.fragments_dir(root), b.filename), b.text)
    assert a.filename != b.filename
    rendered = cl.render(target, root)
    assert "- A.\n" in rendered and "- B.\n" in rendered
    names = [f.filename for f in cl.load_fragments(target, root)]
    assert len(names) == len(set(names))


def test_fold_writes_the_view_back_and_clears_the_pending_corpus(synthetic):
    root, target = synthetic
    original = cl.read_text(target.rendered_path(root))
    cl.migrate(target, root)
    count = cl.fold(target, root)
    assert count == 2
    assert cl.read_text(target.rendered_path(root)) == original
    assert cl.load_fragments(target, root) == []
    assert cl.check(target, root) == [], "a folded corpus is legitimately empty"


def test_an_unparseable_fragment_name_is_refused(synthetic):
    """The order key is the sort key, so a nameless fragment has no place."""
    root, target = synthetic
    cl.migrate(target, root)
    cl.write_text(os.path.join(target.fragments_dir(root), "notes.md"), "### Added\n\n- x\n")
    with pytest.raises(cl.ChangelogError, match="order key"):
        cl.load_fragments(target, root)


def test_migrating_an_already_partitioned_document_is_refused(synthetic):
    """Nothing to partition must not stamp a baseline over an empty corpus."""
    root, target = synthetic
    cl.migrate(target, root)
    with pytest.raises(cl.ChangelogError, match="nothing to partition"):
        cl.migrate(target, root)


def test_digests_are_line_ending_agnostic(tmp_path):
    """CRLF in a Windows worktree and LF in a Linux one are the same content.

    This repo sets `core.autocrlf=true`, so a raw-byte digest would
    assert which runner executed the test. CI runs both.
    """
    lf = tmp_path / "lf.md"
    crlf = tmp_path / "crlf.md"
    lf.write_bytes(b"# A\n\n- one\n")
    crlf.write_bytes(b"# A\r\n\r\n- one\r\n")
    assert cl.read_text(str(lf)) == cl.read_text(str(crlf))
    assert cl.sha256_text(cl.read_text(str(lf))) == cl.sha256_text(cl.read_text(str(crlf)))


# --- the rendered file is no longer an append target -------------------------


@pytest.mark.parametrize("key", sorted(cl.TARGETS))
def test_the_rendered_changelog_points_at_the_fragments(live_root, key):
    """A developer who opens CHANGELOG.md must be told where entries go.

    Without the pointer the partition is a trap: the file looks like it
    simply stopped being updated.
    """
    target = cl.TARGETS[key]
    text = cl.read_text(target.rendered_path(live_root))
    assert "changelog.d" in text
    assert "ai_router.changelog render" in text


@pytest.mark.parametrize("key", sorted(cl.TARGETS))
def test_the_rendered_changelog_holds_no_pending_entries(live_root, key):
    """The append target is gone, which is what removes the conflict.

    If a session could still add an entry to the rendered file, two
    sessions could still collide there and the partition would be
    decorative.
    """
    target = cl.TARGETS[key]
    parts = cl.split_document(cl.read_text(target.rendered_path(live_root)))
    lead, blocks = cl.split_blocks(parts.pending, target.fragment_heading_level)
    assert blocks == [], (
        f"{key}: {len(blocks)} contribution block(s) are still in the rendered "
        f"file; they belong in {target.fragments_rel}/"
    )


# --- the CLI survives a cp1252 console (L-079-1) -----------------------------


@pytest.mark.parametrize("key", sorted(cl.TARGETS))
def test_render_cli_survives_a_cp1252_console(key):
    """FALSIFIER for the standing Windows bug class.

    A changelog is wall-to-wall em dashes, arrows and curly quotes. The
    child's stdout text layer defaults to `cp1252` on Windows, so
    `print(render(...))` raises UnicodeEncodeError and loses the whole
    document -- which is exactly what the first run of this CLI did.
    The subprocess below forces that encoding on every platform, so the
    regression is caught on the Linux runner too.
    """
    import subprocess
    import sys as _sys

    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "cp1252"
    result = subprocess.run(
        [_sys.executable, "-m", "ai_router.changelog", "render", "--target", key],
        capture_output=True,
        cwd=cl.repo_root(),
        env=env,
    )
    assert result.returncode == 0, result.stderr.decode("utf-8", "replace")[-2000:]
    assert b"UnicodeEncodeError" not in result.stderr
    # The bytes on the wire are UTF-8 regardless of the console's claim.
    assert result.stdout.decode("utf-8").startswith("# Changelog")


def test_list_cli_survives_a_cp1252_console():
    import subprocess
    import sys as _sys

    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "cp1252"
    result = subprocess.run(
        [_sys.executable, "-m", "ai_router.changelog", "list", "--target", "all"],
        capture_output=True,
        cwd=cl.repo_root(),
        env=env,
    )
    assert result.returncode == 0, result.stderr.decode("utf-8", "replace")[-2000:]


def test_check_cli_exit_codes():
    import subprocess
    import sys as _sys

    result = subprocess.run(
        [_sys.executable, "-m", "ai_router.changelog", "check", "--target", "all"],
        capture_output=True,
        text=True,
        cwd=cl.repo_root(),
    )
    assert result.returncode == 0, result.stderr
    assert "round trip OK" in result.stdout


# --- the `add` stub matches the target's own shape ---------------------------


def test_add_stub_for_a_level_two_target_is_a_whole_unreleased_section(tmp_path):
    """Round-1 nit: `add --target router --section Added` emitted `## Added`.

    The router's fragments are whole `## [Unreleased] -- <title>` sections
    with the Keep-a-Changelog section nested under them. Emitting
    `"#" * level + section` produced a bare `## Added`, which is not a
    shape Keep a Changelog has and would have rendered as a version
    heading.
    """
    root = str(tmp_path)
    target = cl.TARGETS["router"]
    cl.write_text(
        target.rendered_path(root), "# C\n\n## [1.0.0] - 2026-01-01\n\n- old\n"
    )
    fragment = cl.add_fragment(
        target, root, "Added", "set-999-s1-thing", title="a new thing"
    )
    assert fragment.text.startswith("## [Unreleased] \u2014 a new thing\n")
    assert "\n### Added\n" in fragment.text
    # It must parse back as exactly one level-2 block.
    lead, blocks = cl.split_blocks(fragment.text, 2)
    assert lead == "" and len(blocks) == 1


def test_add_stub_for_a_level_three_target_is_a_bare_section(tmp_path):
    """The paired case: the extension's fragments nest inside one Unreleased."""
    root = str(tmp_path)
    target = cl.TARGETS["extension"]
    cl.write_text(
        target.rendered_path(root), "# C\n\n## [0.1.0] - 2026-01-01\n\n- old\n"
    )
    fragment = cl.add_fragment(target, root, "Fixed", "set-999-s1-thing")
    assert fragment.text.startswith("### Fixed\n")
    assert "## [Unreleased]" not in fragment.text


def test_add_title_defaults_to_the_slug(tmp_path):
    root = str(tmp_path)
    target = cl.TARGETS["router"]
    cl.write_text(target.rendered_path(root), "# C\n\n## [1.0.0] - x\n\n- old\n")
    fragment = cl.add_fragment(target, root, "Added", "set-999-s1-thing")
    assert fragment.text.startswith("## [Unreleased] \u2014 set-999-s1-thing\n")


def test_an_added_stub_renders_without_disturbing_released_history(tmp_path):
    root = str(tmp_path)
    target = cl.TARGETS["router"]
    original = "# C\n\n## [1.0.0] - 2026-01-01\n\n- old\n"
    cl.write_text(target.rendered_path(root), original)
    cl.add_fragment(target, root, "Added", "set-999-s1-thing", title="t")
    rendered = cl.render(target, root)
    assert rendered.endswith("## [1.0.0] - 2026-01-01\n\n- old\n")
    assert rendered.index("[Unreleased]") < rendered.index("[1.0.0]")
