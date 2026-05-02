"""Tests for Set 7 Session 2 deliverables in ``session_state``:

- :func:`read_status` — canonical entry point for "what state is this set
  in?" reads. Verifies the four canonical values pass through, pre-Set-7
  drift is canonicalized at the read boundary, the lazy-synth fallback
  writes a not-started shape on file-absent, and parse / structural
  errors propagate.
- The reader collapses in :mod:`session_log` (``find_active_session_set``)
  and :mod:`__init__` (``print_session_set_status``) — verified by
  fixtures the older tests didn't cover, especially the case where the
  state file says one thing but legacy file presence would have said
  another.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

import session_state
from session_state import (
    SCHEMA_VERSION,
    SESSION_STATE_FILENAME,
    read_status,
    synthesize_not_started_state,
)


def _write_state(set_dir: Path, status: str, **extra) -> None:
    """Drop a session-state.json with the requested status into *set_dir*.

    Helpful for fixtures that need to assert read_status surfaces what
    the file actually says, including pre-Set-7 drift values.
    """
    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "sessionSetName": set_dir.name,
        "status": status,
        **extra,
    }
    (set_dir / SESSION_STATE_FILENAME).write_text(
        json.dumps(payload, indent=2) + "\n", encoding="utf-8"
    )


def _make_set(parent: Path, name: str, *, with_spec: bool = True) -> Path:
    set_dir = parent / name
    set_dir.mkdir(parents=True)
    if with_spec:
        (set_dir / "spec.md").write_text("# spec\n", encoding="utf-8")
    return set_dir


# ---------------------------------------------------------------------------
# Canonical values pass through unchanged
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "status",
    ["not-started", "in-progress", "complete", "cancelled"],
)
def test_canonical_status_passes_through(tmp_path: Path, status: str) -> None:
    set_dir = _make_set(tmp_path, "set-a")
    _write_state(set_dir, status)
    assert read_status(str(set_dir)) == status


# ---------------------------------------------------------------------------
# Pre-Set-7 drift canonicalization at the read boundary
# ---------------------------------------------------------------------------


def test_completed_alias_is_canonicalized_to_complete(tmp_path: Path) -> None:
    """Sets 005 and 006 carry ``status: "completed"`` (the -ed form) plus a
    non-canonical ``lifecycleState: "verified"``. Backfill explicitly
    leaves drifted files untouched, so canonicalization happens at the
    read boundary. Without this, every consumer that switches to
    read_status would regress and stop seeing those sets as done.
    """
    set_dir = _make_set(tmp_path, "set-005-style")
    _write_state(set_dir, "completed", lifecycleState="verified")
    assert read_status(str(set_dir)) == "complete"


def test_done_alias_is_canonicalized_to_complete(tmp_path: Path) -> None:
    """The TS extension historically used ``"done"`` as its display label;
    a state file written by an old extension build could carry that
    value. Canonicalize it the same way as ``"completed"``.
    """
    set_dir = _make_set(tmp_path, "set-old-ts")
    _write_state(set_dir, "done")
    assert read_status(str(set_dir)) == "complete"


def test_unknown_status_passes_through(tmp_path: Path) -> None:
    """Unknown values surface to the caller rather than being rewritten —
    a future status (e.g. Set 8's ``"cancelled"`` or something unforeseen)
    added before this code knows about it should not be silently coerced
    to ``"not-started"``.
    """
    set_dir = _make_set(tmp_path, "set-future")
    _write_state(set_dir, "future-status-xyz")
    assert read_status(str(set_dir)) == "future-status-xyz"


# ---------------------------------------------------------------------------
# Lazy-synthesis fallback (file-absent path)
# ---------------------------------------------------------------------------


def test_lazy_synth_writes_not_started_when_file_absent(
    tmp_path: Path,
) -> None:
    """A folder with spec.md but no session-state.json triggers a write
    of the not-started shape, then re-reads. The returned value must
    match what is now on disk so concurrent callers see consistent
    state.
    """
    set_dir = _make_set(tmp_path, "set-fresh")
    state_path = set_dir / SESSION_STATE_FILENAME
    assert not state_path.exists()

    result = read_status(str(set_dir))
    assert result == "not-started"
    assert state_path.exists()

    # The synthesized file must match what synthesize_not_started_state
    # would have produced — verify by parsing and checking the canonical
    # fields. (Calling synthesize_not_started_state again is a no-op and
    # confirms idempotency.)
    on_disk = json.loads(state_path.read_text(encoding="utf-8"))
    assert on_disk["status"] == "not-started"
    assert on_disk["schemaVersion"] == SCHEMA_VERSION
    assert on_disk["currentSession"] is None
    assert on_disk["startedAt"] is None
    assert on_disk["orchestrator"] is None


def test_lazy_synth_classifies_legacy_changelog_as_complete(
    tmp_path: Path,
) -> None:
    """Verifier round 2 regression: a legacy folder with ``change-log.md``
    but no ``session-state.json`` was being misclassified as
    ``"not-started"`` by the lazy-synth fallback. The fallback now
    routes through :func:`ensure_session_state_file`, which uses the
    same inference rules as the one-shot backfill.
    """
    set_dir = _make_set(tmp_path, "legacy-done")
    (set_dir / "change-log.md").write_text("# Done\n", encoding="utf-8")
    state_path = set_dir / SESSION_STATE_FILENAME
    assert not state_path.exists()

    result = read_status(str(set_dir))
    assert result == "complete"
    # Side effect: file was written with the inferred shape.
    assert state_path.exists()
    on_disk = json.loads(state_path.read_text(encoding="utf-8"))
    assert on_disk["status"] == "complete"
    assert on_disk["lifecycleState"] == "closed"


def test_lazy_synth_classifies_legacy_activity_log_as_in_progress(
    tmp_path: Path,
) -> None:
    """Companion to the change-log case: a folder with an activity log
    but no ``session-state.json`` lazy-synthesizes as in-progress with
    a ``startedAt`` derived from the earliest log entry.
    """
    set_dir = _make_set(tmp_path, "legacy-in-progress")
    (set_dir / "activity-log.json").write_text(
        json.dumps({
            "entries": [
                {"sessionNumber": 1, "dateTime": "2026-01-15T10:00:00-04:00"},
                {"sessionNumber": 1, "dateTime": "2026-01-15T11:00:00-04:00"},
            ]
        }),
        encoding="utf-8",
    )

    result = read_status(str(set_dir))
    assert result == "in-progress"
    on_disk = json.loads(
        (set_dir / SESSION_STATE_FILENAME).read_text(encoding="utf-8")
    )
    assert on_disk["status"] == "in-progress"
    assert on_disk["lifecycleState"] == "work_in_progress"
    # startedAt picked the earliest timestamp, not just any.
    assert on_disk["startedAt"] == "2026-01-15T10:00:00-04:00"


def test_lazy_synth_branch_canonicalizes_aliased_status(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Race regression: verifier round 1 flagged that the post-synthesis
    re-read could bypass canonicalization and return a raw aliased
    value if a parallel writer landed a non-canonical status between
    the existence check and the re-read. Both branches must funnel
    through the shared validation/canonicalization helper.

    Simulate the race by patching ``synthesize_not_started_state`` to
    write a file with the aliased ``"completed"`` value (rather than
    the canonical ``"not-started"``). After read_status returns, the
    value must be canonicalized to ``"complete"`` — the same way the
    file-present branch handles drift.
    """
    set_dir = _make_set(tmp_path, "set-race")

    def fake_synth(d: str) -> str:
        # Pretend a concurrent writer landed an aliased status here
        # between read_status's existence check and re-read.
        _write_state(Path(d), "completed")
        return str(Path(d) / SESSION_STATE_FILENAME)

    monkeypatch.setattr(session_state, "ensure_session_state_file", fake_synth)
    assert read_status(str(set_dir)) == "complete"


def test_lazy_synth_branch_validates_missing_status(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Race regression (continued): the post-synthesis branch must
    raise the same ValueError as the file-present branch when a
    concurrent writer lands a structurally malformed file.
    """
    set_dir = _make_set(tmp_path, "set-race-malformed")

    def fake_synth(d: str) -> str:
        # A concurrent writer wrote a dict with no `status` key.
        (Path(d) / SESSION_STATE_FILENAME).write_text(
            json.dumps({"schemaVersion": SCHEMA_VERSION}),
            encoding="utf-8",
        )
        return str(Path(d) / SESSION_STATE_FILENAME)

    monkeypatch.setattr(session_state, "ensure_session_state_file", fake_synth)
    with pytest.raises(ValueError):
        read_status(str(set_dir))


def test_lazy_synth_is_idempotent_with_existing_file(tmp_path: Path) -> None:
    """If the file already exists when read_status is called, lazy-synth
    must not run — the existing file's contents are returned untouched
    even if they carry pre-Set-7 drift.
    """
    set_dir = _make_set(tmp_path, "set-drifted")
    _write_state(set_dir, "completed", lifecycleState="verified")
    state_path = set_dir / SESSION_STATE_FILENAME
    before = state_path.read_text(encoding="utf-8")

    _ = read_status(str(set_dir))

    after = state_path.read_text(encoding="utf-8")
    assert after == before, (
        "read_status must not rewrite an existing file even if its "
        "contents carry drift; canonicalization happens at the read "
        "boundary, not in the file"
    )


# ---------------------------------------------------------------------------
# Error propagation (parse / structural)
# ---------------------------------------------------------------------------


def test_malformed_json_raises_decode_error(tmp_path: Path) -> None:
    """Per the spec's risk section: "the fallback only triggers on
    file-absent, never on parse-error." A malformed file must raise so
    the caller sees the corruption rather than having it silently
    overwritten by lazy-synth with the not-started shape.
    """
    set_dir = _make_set(tmp_path, "set-corrupt")
    (set_dir / SESSION_STATE_FILENAME).write_text(
        "{not valid json", encoding="utf-8"
    )
    with pytest.raises(json.JSONDecodeError):
        read_status(str(set_dir))


def test_non_object_json_raises_value_error(tmp_path: Path) -> None:
    """A JSON file that parses but isn't a dict (e.g. a top-level array
    or string) is structurally malformed — same risk shape as a parse
    error, same propagation contract.
    """
    set_dir = _make_set(tmp_path, "set-array")
    (set_dir / SESSION_STATE_FILENAME).write_text(
        "[1, 2, 3]", encoding="utf-8"
    )
    with pytest.raises(ValueError):
        read_status(str(set_dir))


def test_missing_status_field_raises_value_error(tmp_path: Path) -> None:
    """A dict without a string ``status`` field cannot answer the
    "what state is this in?" question — surface it rather than guess.
    """
    set_dir = _make_set(tmp_path, "set-no-status")
    (set_dir / SESSION_STATE_FILENAME).write_text(
        json.dumps({"schemaVersion": SCHEMA_VERSION, "currentSession": 1}),
        encoding="utf-8",
    )
    with pytest.raises(ValueError):
        read_status(str(set_dir))


# ---------------------------------------------------------------------------
# Integration with collapsed readers
# ---------------------------------------------------------------------------


def test_find_active_uses_status_not_file_presence(tmp_path: Path) -> None:
    """A folder with both ``activity-log.json`` (legacy "in-progress"
    signal) and ``status: "complete"`` must be treated as complete,
    not in-progress. Pre-Set-7 readers branched on file presence and
    would have flagged this folder as in-progress, but the spec is
    explicit: ``status`` is the single field every reader consults.
    """
    from session_log import find_active_session_set

    base = tmp_path / "session-sets"
    base.mkdir()
    set_dir = _make_set(base, "completed-with-stale-activity-log")
    (set_dir / "activity-log.json").write_text(
        json.dumps({"entries": [{"sessionNumber": 1}]}),
        encoding="utf-8",
    )
    _write_state(set_dir, "complete")

    # No in-progress sets, no not-started sets → SystemExit("No active...").
    # That's the right outcome: a single complete set is not "active".
    with pytest.raises(SystemExit, match="No active session set"):
        find_active_session_set(str(base))


def test_find_active_resolves_status_in_progress(tmp_path: Path) -> None:
    """The positive path: ``status: "in-progress"`` makes a folder the
    unique active set, regardless of which other files exist.
    """
    from session_log import find_active_session_set

    base = tmp_path / "session-sets"
    base.mkdir()

    # Two folders. The "in-progress" one wins even though the other
    # has activity-log.json (legacy signal) — readers must not branch
    # on file presence.
    a = _make_set(base, "a")
    _write_state(a, "in-progress")
    b = _make_set(base, "b")
    (b / "activity-log.json").write_text(
        json.dumps({"entries": []}), encoding="utf-8"
    )
    _write_state(b, "complete")

    result = find_active_session_set(str(base))
    assert os.path.basename(result) == "a"


def test_print_session_set_status_uses_status_field(
    tmp_path: Path, capsys: pytest.CaptureFixture,
) -> None:
    """``print_session_set_status`` must group sets by their canonical
    ``status`` value, not by file presence. Contradictory fixture: a
    folder with ``activity-log.json`` present (legacy "in-progress"
    signal) but ``status: "complete"`` must render in the done group,
    and a folder with ``change-log.md`` present (legacy "done" signal)
    but ``status: "in-progress"`` must render in the in-progress
    group. Round-1 verifier flagged the absence of this test.
    """
    # Lazy import — print_session_set_status is exposed via the package
    # __init__, which test infra loads when needed.
    import importlib.util

    repo_root = Path(__file__).resolve().parents[2]
    init = repo_root / "ai_router" / "__init__.py"
    spec = importlib.util.spec_from_file_location(
        "ai_router_for_test",
        str(init),
        submodule_search_locations=[str(init.parent)],
    )
    mod = importlib.util.module_from_spec(spec)
    import sys as _sys
    _sys.modules["ai_router_for_test"] = mod
    spec.loader.exec_module(mod)

    base = tmp_path / "session-sets"
    base.mkdir()

    # Contradictory: activity-log present + status complete → done
    set_a = _make_set(base, "activity-but-complete")
    (set_a / "activity-log.json").write_text(
        json.dumps({"entries": [{"sessionNumber": 1, "dateTime": "2026-01-01T00:00:00-04:00"}]}),
        encoding="utf-8",
    )
    _write_state(set_a, "complete")

    # Contradictory: change-log present + status in-progress → in-progress
    set_b = _make_set(base, "changelog-but-in-progress")
    (set_b / "change-log.md").write_text("# Changes\n", encoding="utf-8")
    _write_state(set_b, "in-progress")

    # Sanity: a normal not-started (lazy-synthed) set
    _make_set(base, "fresh-set")

    mod.print_session_set_status(str(base))
    captured = capsys.readouterr()
    output = captured.out

    # Find the table row prefixes for each set. The group glyph is
    # `[~]` for in-progress, `[ ]` for not-started, `[x]` for done.
    # The first 3 characters of each table row carry the group glyph
    # (`[~]`, `[ ]`, or `[x]`). Splitting on whitespace would strip the
    # space inside `[ ]`, so slice instead.
    def glyph_for(name: str) -> str:
        for line in output.splitlines():
            if name in line:
                return line[:3]
        raise AssertionError(f"set {name!r} not in output:\n{output}")

    assert glyph_for("activity-but-complete") == "[x]", (
        "status: 'complete' must override legacy activity-log presence"
    )
    assert glyph_for("changelog-but-in-progress") == "[~]", (
        "status: 'in-progress' must override legacy change-log presence"
    )
    assert glyph_for("fresh-set") == "[ ]", (
        "lazy-synthed not-started set should land in not-started group"
    )


def test_find_active_lazy_synthesizes_for_human_authored_folder(
    tmp_path: Path,
) -> None:
    """A human-authored folder (spec.md only, no session-state.json) is
    valid under the Set 7 invariant: lazy-synth turns it into a
    not-started set. With one such folder and nothing else,
    find_active_session_set must return it.
    """
    from session_log import find_active_session_set

    base = tmp_path / "session-sets"
    base.mkdir()
    set_dir = _make_set(base, "human-authored")

    result = find_active_session_set(str(base))
    assert os.path.basename(result) == "human-authored"
    # Lazy-synth side effect.
    assert (set_dir / SESSION_STATE_FILENAME).exists()
