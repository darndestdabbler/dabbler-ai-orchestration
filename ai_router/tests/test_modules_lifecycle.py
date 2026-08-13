"""Set 122 Session 1: the module lifecycle CLI (``ai_router/modules.py``).

The suite is organized around the three things the session exists to prove:

1. **The port matches the contract.** The Python writers produce the same
   ``docs/modules.yaml`` shapes the TypeScript scaffold produces today, and
   preserve the operator's comments and entry order.
2. **The dangerous paths refuse.** ``rename`` / ``delete`` refuse a module
   with a running session, and every ``session-state.json`` mutation goes
   through the sanctioned writer -- asserted structurally, with a planted
   violation proving the assertion can fail (L-112-1).
3. **Partial failure strands nothing.** Every failure falsifier INJECTS the
   failure rather than hoping for one, because a rollback path that is never
   exercised looks identical to one that does not work.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

import modules
from modules import ModuleIo


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SPEC_TEMPLATE = """# {name}

## Session Set Configuration

```yaml
{stamp}requiresUAT: false
requiresE2E: false
```

## Sessions
"""


def _write(path: Path, text: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="")
    return path


def make_repo(tmp_path: Path, manifest: str = None) -> Path:
    root = tmp_path / "repo"
    (root / "docs" / "session-sets").mkdir(parents=True)
    if manifest is not None:
        _write(root / "docs" / "modules.yaml", manifest)
    return root


def make_set(
    root: Path,
    name: str,
    module: str = None,
    kind: str = None,
    status: str = None,
    sessions: list = None,
    files: dict = None,
) -> Path:
    set_dir = root / "docs" / "session-sets" / name
    stamp = ""
    if module is not None:
        stamp += f"module: {module}\n"
    if kind is not None:
        stamp += f"kind: {kind}\n"
    _write(set_dir / "spec.md", SPEC_TEMPLATE.format(name=name, stamp=stamp))
    if status is not None:
        state = {"schemaVersion": 4, "sessionSetName": name, "status": status}
        if sessions is not None:
            state["sessions"] = sessions
        _write(set_dir / "session-state.json", json.dumps(state, indent=2) + "\n")
    for filename, body in (files or {}).items():
        _write(set_dir / filename, body)
    return set_dir


POPULATED_MANIFEST = """\
# docs/modules.yaml - hand-maintained; comments must survive every write.
modules:
  - slug: greeter
    title: "The Greeter"
    codeRoots:
      - src/greeter
    planPath: docs/modules/greeter/project-plan.md
  # the integration module composes the others
  - slug: integration
    title: "Cross-Module Integration"
    codeRoots: []
    planPath: docs/modules/integration/project-plan.md
    touches:
      - greeter
"""


class FailingIo(ModuleIo):
    """A ModuleIo that fails on demand -- the failure INJECTOR, not a mock.

    Every other operation goes to the real filesystem, so a rollback assertion
    is made against real on-disk state.
    """

    def __init__(self, fail_write_suffix: str = None, fail_cancel: bool = False):
        self.fail_write_suffix = fail_write_suffix
        self.fail_cancel = fail_cancel
        self.cancelled: list = []

    def write_text(self, path: str, data: str) -> None:
        if self.fail_write_suffix and path.replace("\\", "/").endswith(
            self.fail_write_suffix
        ):
            raise OSError(f"injected write failure for {path}")
        super().write_text(path, data)

    def cancel_session_set(self, set_dir: str, reason: str) -> None:
        if self.fail_cancel:
            raise OSError(f"injected cancel failure for {set_dir}")
        self.cancelled.append(set_dir)
        super().cancel_session_set(set_dir, reason)


# ---------------------------------------------------------------------------
# create
# ---------------------------------------------------------------------------


def test_create_on_a_clean_repo_writes_the_canonical_template_and_first_entry(tmp_path):
    root = make_repo(tmp_path)

    result = modules.create_module(str(root), "greeter", "The Greeter")

    assert result.exit_code == 0, result.refused or result.write_failed
    assert result.details["manifestCreated"] is True
    assert result.details["planCreated"] is True
    text = (root / "docs" / "modules.yaml").read_text(encoding="utf-8")
    # The created manifest is the canonical template GROWN by the entry, not a
    # re-serialization: the header comments must survive.
    assert "# docs/modules.yaml - the module manifest" in text
    assert "modules: []" not in text
    entries = modules.parse_manifest_entries(text)
    assert [e.slug for e in entries] == ["greeter"]
    assert entries[0].title == "The Greeter"
    assert entries[0].plan_path == "docs/modules/greeter/project-plan.md"
    stub = (root / "docs" / "modules" / "greeter" / "project-plan.md").read_text(
        encoding="utf-8"
    )
    assert stub.startswith("# The Greeter - module project plan")


def test_create_appends_to_a_populated_manifest_preserving_comments_and_order(tmp_path):
    root = make_repo(tmp_path, POPULATED_MANIFEST)

    result = modules.create_module(str(root), "payment-api")

    assert result.exit_code == 0, result.refused or result.write_failed
    text = (root / "docs" / "modules.yaml").read_text(encoding="utf-8")
    assert "# the integration module composes the others" in text
    assert POPULATED_MANIFEST in text  # a pure append: every prior byte survives
    assert [e.slug for e in modules.parse_manifest_entries(text)] == [
        "greeter",
        "integration",
        "payment-api",
    ]
    # Title defaults to the slug when none is supplied.
    assert modules.parse_manifest_entries(text)[2].title == "payment-api"


@pytest.mark.parametrize(
    "slug,fragment",
    [
        ("greeter", "already exists"),
        ("Greeter", "kebab-case"),
        ("", "Enter a module slug"),
    ],
)
def test_create_refuses_a_bad_or_duplicate_slug_without_writing(tmp_path, slug, fragment):
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    before = (root / "docs" / "modules.yaml").read_text(encoding="utf-8")

    result = modules.create_module(str(root), slug)

    assert result.exit_code == 3
    assert fragment in result.refused
    assert (root / "docs" / "modules.yaml").read_text(encoding="utf-8") == before
    assert not (root / "docs" / "modules").exists()


def test_create_refuses_a_present_but_invalid_manifest(tmp_path):
    root = make_repo(tmp_path, "this: is\n  not: a module manifest\n")

    result = modules.create_module(str(root), "greeter")

    assert result.exit_code == 3
    assert result.refused == modules.INVALID_MANIFEST_MESSAGE
    assert not (root / "docs" / "modules").exists()


def test_create_rolls_back_the_plan_stub_when_the_manifest_write_fails(tmp_path):
    """FALSIFIER: inject the manifest write failure and assert nothing is stranded.

    This is the exact defect the TypeScript scaffold has -- it writes the plan
    stub first and the manifest second, so this failure leaves an orphan stub
    and an orphan directory behind. The gate only proves anything because the
    failure is planted.
    """
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    before = (root / "docs" / "modules.yaml").read_text(encoding="utf-8")

    result = modules.create_module(
        str(root), "payment-api", io=FailingIo(fail_write_suffix="docs/modules.yaml")
    )

    assert result.exit_code == 4
    assert result.rolled_back is True
    assert (root / "docs" / "modules.yaml").read_text(encoding="utf-8") == before
    # Neither the stub, nor either directory the call created, survives.
    assert not (root / "docs" / "modules" / "payment-api" / "project-plan.md").exists()
    assert not (root / "docs" / "modules" / "payment-api").exists()
    assert not (root / "docs" / "modules").exists()


def test_create_rollback_never_deletes_a_pre_existing_plan(tmp_path):
    """The look-alike falsifier: rollback must undo only what THIS call created."""
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    plan = _write(
        root / "docs" / "modules" / "payment-api" / "project-plan.md",
        "# the operator's real plan\n",
    )

    result = modules.create_module(
        str(root), "payment-api", io=FailingIo(fail_write_suffix="docs/modules.yaml")
    )

    assert result.exit_code == 4
    assert plan.read_text(encoding="utf-8") == "# the operator's real plan\n"


def test_create_grows_a_valid_empty_manifest_in_place(tmp_path):
    root = make_repo(
        tmp_path, "# leading comment\nmodules: []   # trailing comment\n# tail\n"
    )

    result = modules.create_module(str(root), "greeter")

    assert result.exit_code == 0, result.refused or result.write_failed
    text = (root / "docs" / "modules.yaml").read_text(encoding="utf-8")
    assert "# leading comment" in text
    assert "# trailing comment" in text
    assert "# tail" in text
    assert [e.slug for e in modules.parse_manifest_entries(text)] == ["greeter"]


# ---------------------------------------------------------------------------
# rename
# ---------------------------------------------------------------------------


def test_rename_slug_restamps_every_affected_set_and_rewrites_the_manifest(tmp_path):
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    make_set(root, "101-greeter-core", module="greeter", status="complete")
    make_set(root, "102-greeter-more", module="greeter", status="not-started")
    make_set(root, "103-other", module="integration", status="not-started")

    result = modules.rename_module(str(root), "greeter", new_slug="salutation")

    assert result.exit_code == 0, result.refused or result.write_failed
    assert result.details["restamped"] == ["101-greeter-core", "102-greeter-more"]
    text = (root / "docs" / "modules.yaml").read_text(encoding="utf-8")
    assert "# the integration module composes the others" in text
    entries = modules.parse_manifest_entries(text)
    assert [e.slug for e in entries] == ["salutation", "integration"]
    assert entries[0].title == "The Greeter"  # untouched by a slug-only rename
    assert entries[0].code_roots == ("src/greeter",)
    for name in ("101-greeter-core", "102-greeter-more"):
        spec = (root / "docs" / "session-sets" / name / "spec.md").read_text(
            encoding="utf-8"
        )
        assert "module: salutation\n" in spec
        assert "module: greeter\n" not in spec
    other = (root / "docs" / "session-sets" / "103-other" / "spec.md").read_text(
        encoding="utf-8"
    )
    assert "module: integration\n" in other


def test_rename_title_only_edits_the_manifest_and_touches_no_spec(tmp_path):
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    spec = make_set(root, "101-greeter-core", module="greeter") / "spec.md"
    before = spec.read_text(encoding="utf-8")

    result = modules.rename_module(str(root), "greeter", new_title="Greeting Service")

    assert result.exit_code == 0, result.refused or result.write_failed
    assert result.details["restamped"] == []
    assert result.details["slugChanged"] is False
    entries = modules.parse_manifest_entries(
        (root / "docs" / "modules.yaml").read_text(encoding="utf-8")
    )
    assert entries[0].slug == "greeter"
    assert entries[0].title == "Greeting Service"
    assert spec.read_text(encoding="utf-8") == before


@pytest.mark.parametrize(
    "status,sessions",
    [
        ("in-progress", None),
        ("not-started", [{"number": 1, "status": "in-progress"}]),
    ],
)
def test_rename_refuses_while_an_affected_set_has_a_running_session(
    tmp_path, status, sessions
):
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    make_set(root, "101-greeter-core", module="greeter", status=status, sessions=sessions)
    before = (root / "docs" / "modules.yaml").read_text(encoding="utf-8")

    result = modules.rename_module(str(root), "greeter", new_slug="salutation")

    assert result.exit_code == 3
    assert "running session" in result.refused
    assert "101-greeter-core" in result.refused
    assert (root / "docs" / "modules.yaml").read_text(encoding="utf-8") == before


@pytest.mark.parametrize(
    "changes",
    [
        {"new_slug": "salutation"},
        {"new_title": "Greeting Service"},
        {"new_slug": "salutation", "new_title": "Greeting Service"},
    ],
    ids=["slug-only", "title-only", "slug-and-title"],
)
def test_every_rename_mode_refuses_a_running_session(tmp_path, changes):
    """The spec's rule is unqualified: `rename` refuses a module with a
    running session. A title-only rename still writes docs/modules.yaml, and
    the TypeScript original gated this check on the slug change alone."""
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    make_set(root, "101-greeter-core", module="greeter", status="in-progress")
    before = (root / "docs" / "modules.yaml").read_text(encoding="utf-8")

    result = modules.rename_module(str(root), "greeter", **changes)

    assert result.exit_code == 3
    assert "running session" in result.refused
    assert (root / "docs" / "modules.yaml").read_text(encoding="utf-8") == before


def test_rename_refuses_a_legacy_in_progress_set_with_no_state_file(tmp_path):
    """A legacy set has no session-state.json; file-presence inference must
    still see it as running, or the refusal silently passes."""
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    make_set(
        root, "101-greeter-core", module="greeter", files={"activity-log.json": "{}\n"}
    )

    result = modules.rename_module(str(root), "greeter", new_slug="salutation")

    assert result.exit_code == 3
    assert "running session" in result.refused


def test_rename_refuses_a_collision_with_an_undeclared_slug_that_has_history(tmp_path):
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    make_set(root, "101-greeter-core", module="greeter", status="complete")
    make_set(root, "102-ghost", module="salutation", status="complete")

    result = modules.rename_module(str(root), "greeter", new_slug="salutation")

    assert result.exit_code == 3
    assert "merge histories" in result.refused
    assert "102-ghost" in result.refused


def test_rename_rolls_every_restamped_spec_back_when_the_manifest_write_fails(tmp_path):
    """FALSIFIER: the manifest is written LAST, so its failure must undo the specs."""
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    spec = make_set(root, "101-greeter-core", module="greeter", status="complete") / "spec.md"
    spec_before = spec.read_text(encoding="utf-8")
    manifest_before = (root / "docs" / "modules.yaml").read_text(encoding="utf-8")

    result = modules.rename_module(
        str(root),
        "greeter",
        new_slug="salutation",
        io=FailingIo(fail_write_suffix="docs/modules.yaml"),
    )

    assert result.exit_code == 4
    assert result.rolled_back is True
    assert spec.read_text(encoding="utf-8") == spec_before
    assert (root / "docs" / "modules.yaml").read_text(encoding="utf-8") == manifest_before


def test_rename_refuses_an_undeclared_module(tmp_path):
    root = make_repo(tmp_path, POPULATED_MANIFEST)

    result = modules.rename_module(str(root), "nope", new_slug="whatever")

    assert result.exit_code == 3
    assert "not declared" in result.refused


# ---------------------------------------------------------------------------
# delete
# ---------------------------------------------------------------------------


def test_delete_cancels_through_the_sanctioned_writer_and_leaves_terminal_sets(tmp_path):
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    live = make_set(root, "101-greeter-core", module="greeter", status="not-started")
    done = make_set(root, "102-greeter-done", module="greeter", status="complete")
    scaffold = make_set(
        root, "103-greeter-plan", module="greeter", kind="plan", status="not-started"
    )
    keep = make_set(root, "104-other", module="integration", status="not-started")

    result = modules.delete_module(str(root), "greeter")

    assert result.exit_code == 0, result.refused or result.write_failed
    assert result.details["cancelled"] == ["101-greeter-core"]
    assert result.details["removed"] == ["103-greeter-plan"]
    assert result.details["terminal"] == ["102-greeter-done"]
    # The cancel went through session_lifecycle.cancel_session_set: both the
    # audit marker and the state-file transition are present and consistent.
    assert (live / "CANCELLED.md").is_file()
    state = json.loads((live / "session-state.json").read_text(encoding="utf-8"))
    assert state["status"] == "cancelled"
    assert state["preCancelStatus"] == "not-started"
    assert not scaffold.exists()
    assert done.is_dir() and not (done / "CANCELLED.md").exists()
    assert keep.is_dir()
    entries = modules.parse_manifest_entries(
        (root / "docs" / "modules.yaml").read_text(encoding="utf-8")
    )
    assert [e.slug for e in entries] == ["integration"]


def test_delete_removes_only_the_entry_and_keeps_the_manifest_readable(tmp_path):
    root = make_repo(tmp_path, POPULATED_MANIFEST)

    result = modules.delete_module(str(root), "integration")

    assert result.exit_code == 0, result.refused or result.write_failed
    text = (root / "docs" / "modules.yaml").read_text(encoding="utf-8")
    # The entry block is gone; the operator's comments are NOT swept into the
    # deletion (a same-or-shallower `#` line attaches forward to what follows,
    # so it is never part of the entry being removed).
    assert "- slug: integration" not in text
    assert "Cross-Module Integration" not in text
    assert "# docs/modules.yaml - hand-maintained" in text
    assert "# the integration module composes the others" in text
    entries = modules.parse_manifest_entries(text)
    assert [e.slug for e in entries] == ["greeter"]
    assert entries[0].code_roots == ("src/greeter",)
    assert entries[0].title == "The Greeter"


def test_delete_refuses_while_an_affected_set_has_a_running_session(tmp_path):
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    live = make_set(root, "101-greeter-core", module="greeter", status="in-progress")
    before = (root / "docs" / "modules.yaml").read_text(encoding="utf-8")

    result = modules.delete_module(str(root), "greeter")

    assert result.exit_code == 3
    assert "running session" in result.refused
    assert (root / "docs" / "modules.yaml").read_text(encoding="utf-8") == before
    assert not (live / "CANCELLED.md").exists()


def test_delete_keeps_the_module_declared_when_a_cancel_fails(tmp_path):
    """FALSIFIER: inject a cancel failure; the module must stay declared so the
    re-run picks up where it stopped rather than leaving it half-deleted."""
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    make_set(root, "101-greeter-core", module="greeter", status="not-started")
    before = (root / "docs" / "modules.yaml").read_text(encoding="utf-8")

    result = modules.delete_module(str(root), "greeter", io=FailingIo(fail_cancel=True))

    assert result.exit_code == 4
    assert result.details["stillDeclared"] is True
    assert (root / "docs" / "modules.yaml").read_text(encoding="utf-8") == before


def test_delete_is_re_runnable_after_a_partial_run(tmp_path):
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    live = make_set(root, "101-greeter-core", module="greeter", status="not-started")
    modules.delete_module(str(root), "greeter", io=FailingIo(fail_write_suffix="docs/modules.yaml"))
    assert (live / "CANCELLED.md").is_file()  # the cancel landed; the manifest did not

    result = modules.delete_module(str(root), "greeter")

    assert result.exit_code == 0, result.refused or result.write_failed
    # An already-cancelled set classifies terminal on the retry -- never re-cancelled.
    assert result.details["cancelled"] == []
    assert result.details["terminal"] == ["101-greeter-core"]
    assert [
        e.slug
        for e in modules.parse_manifest_entries(
            (root / "docs" / "modules.yaml").read_text(encoding="utf-8")
        )
    ] == ["integration"]


# ---------------------------------------------------------------------------
# assign-sets
# ---------------------------------------------------------------------------


def test_assign_sets_stamps_unstamped_sets_and_no_ops_on_the_same_target(tmp_path):
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    fresh = make_set(root, "101-legacy", status="complete") / "spec.md"
    make_set(root, "102-already", module="greeter", status="complete")

    result = modules.assign_sets(str(root), "greeter", ["101-legacy", "102-already"])

    assert result.exit_code == 0, result.refused or result.write_failed
    assert result.details["stamped"] == ["101-legacy"]
    assert result.details["alreadyAssigned"] == ["102-already"]
    text = fresh.read_text(encoding="utf-8")
    assert "```yaml\nmodule: greeter\nrequiresUAT: false\n" in text


def test_assign_sets_refuses_the_whole_batch_when_one_set_belongs_elsewhere(tmp_path):
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    fresh = make_set(root, "101-legacy", status="complete") / "spec.md"
    make_set(root, "102-elsewhere", module="integration", status="complete")
    before = fresh.read_text(encoding="utf-8")

    result = modules.assign_sets(
        str(root), "greeter", ["101-legacy", "102-elsewhere"]
    )

    assert result.exit_code == 3
    assert "already stamped" in result.refused
    assert fresh.read_text(encoding="utf-8") == before  # phase 1 wrote nothing


def test_assign_sets_refuses_an_undeclared_or_pseudo_target(tmp_path):
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    make_set(root, "101-legacy", status="complete")

    assert modules.assign_sets(str(root), "default", ["101-legacy"]).exit_code == 3
    undeclared = modules.assign_sets(str(root), "nope", ["101-legacy"])
    assert undeclared.exit_code == 3
    assert "not declared" in undeclared.refused


def test_assign_sets_rolls_back_every_stamp_when_a_later_write_fails(tmp_path):
    """FALSIFIER: two queued stamps, the second injected to fail."""
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    first = make_set(root, "101-legacy", status="complete") / "spec.md"
    second = make_set(root, "102-legacy", status="complete") / "spec.md"
    before = first.read_text(encoding="utf-8")

    result = modules.assign_sets(
        str(root),
        "greeter",
        ["101-legacy", "102-legacy"],
        io=FailingIo(fail_write_suffix="102-legacy/spec.md"),
    )

    assert result.exit_code == 4
    assert result.rolled_back is True
    assert first.read_text(encoding="utf-8") == before
    assert "module:" not in second.read_text(encoding="utf-8")


def test_stamp_refuses_an_unterminated_config_fence(tmp_path):
    """An unterminated block must refuse loud, never borrow a later fence."""
    text = "# Set\n\n## Session Set Configuration\n\n```yaml\nrequiresUAT: false\n\n## Sessions\n\n```\n"

    edit = modules.stamp_module_into_spec_text(text, "greeter")

    assert edit.kind == "refused"


def test_stamp_ignores_an_indented_module_key(tmp_path):
    """A nested `module:` is not a stamp; treating it as one would silently
    skip a set that genuinely needed stamping."""
    text = (
        "# Set\n\n## Session Set Configuration\n\n```yaml\n"
        "notes:\n  module: greeter\nrequiresUAT: false\n```\n"
    )

    edit = modules.stamp_module_into_spec_text(text, "greeter")

    assert edit.kind == "written"
    assert edit.text.startswith("# Set\n\n## Session Set Configuration\n\n```yaml\nmodule: greeter\n")


# ---------------------------------------------------------------------------
# Lifecycle sets -- the numbering half of the adopted surface
# ---------------------------------------------------------------------------


def test_create_scaffolds_the_numbered_plan_and_decomposition_set_pair(tmp_path):
    """The acceptance criterion from verification round 2: wiring the
    extension's New Module to this CLI must not lose the lifecycle sets the
    TypeScript command creates today."""
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    (root / "docs" / "session-sets" / "005-existing").mkdir(parents=True)

    result = modules.create_module(str(root), "payment-api", "Payment API")

    assert result.exit_code == 0, result.refused or result.write_failed
    sets_root = root / "docs" / "session-sets"
    names = sorted(p.name for p in sets_root.iterdir() if p.is_dir())
    assert "006-payment-api-plan" in names
    assert "007-payment-api-decomposition" in names
    assert result.details["planSetSlug"] == "006-payment-api-plan"
    assert result.details["decompositionSetSlug"] == "007-payment-api-decomposition"

    plan_spec = (sets_root / "006-payment-api-plan" / "spec.md").read_text(
        encoding="utf-8"
    )
    assert "kind: plan" in plan_spec
    assert "module: payment-api" in plan_spec
    assert "{{" not in plan_spec  # every token substituted

    decomp_spec = (sets_root / "007-payment-api-decomposition" / "spec.md").read_text(
        encoding="utf-8"
    )
    assert "kind: decomposition" in decomp_spec
    # The prerequisites cross-link IS the gating mechanism.
    assert "006-payment-api-plan" in decomp_spec
    assert modules.read_spec_module_and_kind(
        str(sets_root / "007-payment-api-decomposition" / "spec.md")
    ) == ("payment-api", "decomposition")
    # State files belong to the sanctioned runtime writers, never the scaffold.
    assert not (sets_root / "006-payment-api-plan" / "session-state.json").exists()


def test_create_reuses_an_existing_lifecycle_set_rather_than_minting_a_duplicate(
    tmp_path,
):
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    existing = root / "docs" / "session-sets" / "004-payment-api-plan"
    _write(existing / "spec.md", "# hand-authored plan set\n")

    result = modules.create_module(str(root), "payment-api")

    assert result.exit_code == 0, result.refused or result.write_failed
    assert result.details["planSetSlug"] == "004-payment-api-plan"
    assert result.details["planSetCreated"] is False
    assert (existing / "spec.md").read_text(encoding="utf-8") == (
        "# hand-authored plan set\n"
    )
    # The decomposition set is still minted, and cross-links to the existing plan.
    decomp = root / "docs" / "session-sets" / result.details["decompositionSetSlug"]
    assert "004-payment-api-plan" in (decomp / "spec.md").read_text(encoding="utf-8")


def test_create_does_not_reuse_a_different_modules_lifecycle_set(tmp_path):
    """FALSIFIER for residual S122-S1-R1 (Set 122 S2).

    ``payment-api`` and ``api`` share a basename suffix, so a suffix match --
    the TypeScript behaviour Session 1 ported verbatim -- makes the new module
    ``api`` adopt ``payment-api``'s lifecycle sets and never get its own. The
    identity test is the name minus its numeric prefix, exactly.
    """
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    sets_root = root / "docs" / "session-sets"
    _write(sets_root / "004-payment-api-plan" / "spec.md", "# payment-api's plan\n")
    _write(
        sets_root / "005-payment-api-decomposition" / "spec.md",
        "# payment-api's decomposition\n",
    )

    result = modules.create_module(str(root), "api", "API")

    assert result.exit_code == 0, result.refused or result.write_failed
    assert result.details["planSetSlug"] == "006-api-plan"
    assert result.details["planSetCreated"] is True
    assert result.details["decompositionSetSlug"] == "007-api-decomposition"
    assert result.details["decompositionSetCreated"] is True
    # The other module's sets are untouched.
    assert (sets_root / "004-payment-api-plan" / "spec.md").read_text(
        encoding="utf-8"
    ) == "# payment-api's plan\n"
    assert modules.read_spec_module_and_kind(
        str(sets_root / "006-api-plan" / "spec.md")
    ) == ("api", "plan")


def test_create_rolls_back_the_lifecycle_sets_too(tmp_path):
    """FALSIFIER: the scaffold runs inside the same transaction as the
    manifest write, so a failure must leave no half-created module behind."""
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    sets_root = root / "docs" / "session-sets"

    class FailAfterScaffold(ModuleIo):
        def write_text(self, path: str, data: str) -> None:
            super().write_text(path, data)
            if path.replace("\\", "/").endswith("-decomposition/spec.md"):
                raise OSError("injected failure after the decomposition spec landed")

    result = modules.create_module(str(root), "payment-api", io=FailAfterScaffold())

    assert result.exit_code == 4
    assert result.rolled_back is True
    assert sorted(p.name for p in sets_root.iterdir() if p.is_dir()) == []
    assert not (root / "docs" / "modules").exists()
    entries = modules.parse_manifest_entries(
        (root / "docs" / "modules.yaml").read_text(encoding="utf-8")
    )
    assert [e.slug for e in entries] == ["greeter", "integration"]


def test_lifecycle_templates_are_byte_identical_in_both_homes():
    """The packaged copy ships in the wheel; the docs copy feeds the extension
    bundle. Two hand-synced copies with no parity check is exactly the drift
    risk the TypeScript resolver names and never tests."""
    packaged = Path(modules.__file__).resolve().parent / "templates"
    docs = (
        Path(modules.__file__).resolve().parent.parent
        / "docs"
        / "templates"
        / "consumer-bootstrap"
    )
    names = sorted(p.name for p in packaged.glob("*.template"))

    assert names, "an empty corpus would pass having compared nothing"
    for name in names:
        assert (docs / name).is_file(), f"{name} is missing from {docs}"
        assert (packaged / name).read_bytes() == (docs / name).read_bytes(), (
            f"{name} has drifted between its packaged and docs copies"
        )


def test_render_lifecycle_spec_fails_loud_on_an_unsubstituted_token():
    with pytest.raises(modules.LifecycleScaffoldError) as excinfo:
        modules.render_lifecycle_spec(
            "module-decomposition-set.spec.md.template",
            {"MODULE_TITLE": "T", "MODULE_SLUG": "m", "SLUG": "s", "CREATED": "d",
             "PLAN_REL_PATH": "p"},  # PLAN_SLUG deliberately withheld
        )

    assert "PLAN_SLUG" in str(excinfo.value)


# ---------------------------------------------------------------------------
# The writer invariant, asserted behaviorally (L-112-1)
# ---------------------------------------------------------------------------


def _state_snapshot(root: Path) -> dict:
    """Every ``session-state.json`` under the repo, path -> raw bytes."""
    return {
        str(path.relative_to(root)): path.read_bytes()
        for path in sorted(root.rglob("session-state.json"))
    }


class _NoCancelIo(ModuleIo):
    """Neutralizes the sanctioned writer, leaving only what modules.py does itself."""

    def cancel_session_set(self, set_dir: str, reason: str) -> None:
        return None


class _LeakyCancelIo(ModuleIo):
    """The planted violation: cancelLifecycle.ts:296's hand-write, in Python."""

    def cancel_session_set(self, set_dir: str, reason: str) -> None:
        path = os.path.join(set_dir, "session-state.json")
        with open(path, "r", encoding="utf-8") as handle:
            state = json.load(handle)
        state["status"] = "cancelled"
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(json.dumps(state, indent=2) + "\n")


def test_delete_touches_session_state_only_through_the_sanctioned_writer(tmp_path):
    """The invariant Set 122 exists to restore.

    With the sanctioned writer neutralized, the delete still completes -- and
    every ``session-state.json`` is byte-identical, so nothing in
    ``modules.py`` wrote one itself. The falsifier below plants the direct
    write and proves this comparison can fail.
    """
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    make_set(root, "101-greeter-core", module="greeter", status="not-started")
    make_set(root, "102-greeter-done", module="greeter", status="complete")
    before = _state_snapshot(root)
    assert before, "an empty corpus would pass having examined nothing"

    result = modules.delete_module(str(root), "greeter", io=_NoCancelIo())

    assert result.exit_code == 0, result.refused or result.write_failed
    assert result.details["cancelled"] == ["101-greeter-core"]
    assert _state_snapshot(root) == before


def test_the_state_untouched_assertion_fires_on_a_planted_direct_write(tmp_path):
    """FALSIFIER: the same comparison must FAIL when a state file is hand-written."""
    root = make_repo(tmp_path, POPULATED_MANIFEST)
    make_set(root, "101-greeter-core", module="greeter", status="not-started")
    before = _state_snapshot(root)

    result = modules.delete_module(str(root), "greeter", io=_LeakyCancelIo())

    assert result.exit_code == 0, result.refused or result.write_failed
    assert _state_snapshot(root) != before, (
        "the snapshot comparison did not notice a direct state-file write, so "
        "its passing verdict in the test above would mean nothing"
    )


def test_the_sanctioned_writer_is_the_only_state_route_in_the_source():
    """Structural companion: the import exists and is the single named route."""
    source = Path(modules.__file__).read_text(encoding="utf-8")

    assert "session_lifecycle import" in source
    assert "cancel_session_set as _cancel_session_set" in source
    assert source.count("_cancel_session_set(") == 1


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _run_cli(root: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "ai_router.modules", "--repo-root", str(root), *args],
        capture_output=True,
        text=True,
        cwd=str(Path(modules.__file__).resolve().parent.parent),
    )


def test_cli_create_reports_json_and_exit_zero(tmp_path):
    root = make_repo(tmp_path, POPULATED_MANIFEST)

    proc = _run_cli(root, "--json", "create", "--slug", "payment-api")

    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["command"] == "create"
    assert payload["slug"] == "payment-api"
    assert payload["ok"] is True
    assert payload["planRel"] == "docs/modules/payment-api/project-plan.md"


def test_cli_refusal_exits_three_with_ascii_only_output(tmp_path):
    root = make_repo(tmp_path, POPULATED_MANIFEST)

    proc = _run_cli(root, "delete", "--slug", "nope")

    assert proc.returncode == 3
    assert "[!] Refused" in proc.stderr
    assert "Nothing was written." in proc.stderr
    combined = proc.stdout + proc.stderr
    assert combined.encode("cp1252")  # every CLI surface stays cp1252-safe
