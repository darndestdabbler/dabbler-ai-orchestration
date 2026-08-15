"""Set 058 S3 — tests for the consumer-bootstrap / CI drift guards.

``drift_guard`` lives under ``ai_router/scripts/`` and is imported by bare
filename via the conftest ``SCRIPTS_DIR`` sys.path shim (same convention as
``backfill_session_state`` / ``dump_session_state_schema``).

Each check is exercised on synthetic temp trees (positive + negative), and a
final test asserts the REAL repository currently passes them all — so this
suite is itself the CI gate: a second in-progress set or a stale committed
``dist/`` bundle turns it red.

Set 112 S2 deleted this file's first section along with the ``stale-framing``
guard it covered. That guard policed the stale "Lightweight = no Python /
no venv / docs-only" framing, which cannot be asserted about anything now that
the Lightweight tier is gone.
"""
from __future__ import annotations

import json
from pathlib import Path

import drift_guard


# ---------------------------------------------------------------------------
# Shared helper
# ---------------------------------------------------------------------------


def _write(p: Path, text: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


# ---------------------------------------------------------------------------
# Check 1 — one-active-set guard
# ---------------------------------------------------------------------------


def _make_set(base: Path, slug: str, status: str) -> None:
    d = base / "docs" / "session-sets" / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / "session-state.json").write_text(
        json.dumps({"schemaVersion": 4, "status": status}), encoding="utf-8"
    )


def test_one_active_set_zero_in_progress_ok(tmp_path: Path):
    _make_set(tmp_path, "001-a", "complete")
    _make_set(tmp_path, "002-b", "not-started")
    assert drift_guard.check_one_active_set(tmp_path) == []


def test_one_active_set_single_in_progress_ok(tmp_path: Path):
    _make_set(tmp_path, "001-a", "in-progress")
    _make_set(tmp_path, "002-b", "complete")
    assert drift_guard.check_one_active_set(tmp_path) == []


def test_one_active_set_two_in_progress_flagged(tmp_path: Path):
    _make_set(tmp_path, "001-a", "in-progress")
    _make_set(tmp_path, "002-b", "in-progress")
    violations = drift_guard.check_one_active_set(tmp_path)
    assert len(violations) == 1
    assert violations[0].check == "one-active-set"
    assert "001-a" in violations[0].detail and "002-b" in violations[0].detail


def test_one_active_set_missing_dir_ok(tmp_path: Path):
    assert drift_guard.check_one_active_set(tmp_path) == []


# ---------------------------------------------------------------------------
# Check 2 — dist-bundle-in-sync guard
# ---------------------------------------------------------------------------


def _make_bundles(base: Path, src_files: dict, dst_files: dict) -> None:
    src = base.joinpath("docs", "templates", "consumer-bootstrap")
    dst = base.joinpath(
        "tools", "dabbler-ai-orchestration", "dist", "templates", "consumer-bootstrap"
    )
    src.mkdir(parents=True, exist_ok=True)
    dst.mkdir(parents=True, exist_ok=True)
    for name, content in src_files.items():
        (src / name).write_text(content, encoding="utf-8")
    for name, content in dst_files.items():
        (dst / name).write_text(content, encoding="utf-8")


def test_dist_in_sync_identical_ok(tmp_path: Path):
    files = {"a.template": "alpha\n", "b.md": "beta\n"}
    _make_bundles(tmp_path, files, dict(files))
    assert drift_guard.check_dist_bundle_in_sync(tmp_path) == []


def test_dist_in_sync_crlf_normalized_ok(tmp_path: Path):
    # Write exact bytes (write_text would re-translate newlines on Windows):
    # LF source vs CRLF dist must be treated as in-sync.
    src = tmp_path.joinpath("docs", "templates", "consumer-bootstrap")
    dst = tmp_path.joinpath(
        "tools", "dabbler-ai-orchestration", "dist", "templates", "consumer-bootstrap"
    )
    src.mkdir(parents=True, exist_ok=True)
    dst.mkdir(parents=True, exist_ok=True)
    (src / "a.template").write_bytes(b"alpha\n")
    (dst / "a.template").write_bytes(b"alpha\r\n")
    assert drift_guard.check_dist_bundle_in_sync(tmp_path) == []


def test_dist_in_sync_content_drift_flagged(tmp_path: Path):
    _make_bundles(tmp_path, {"a.template": "alpha\n"}, {"a.template": "STALE\n"})
    violations = drift_guard.check_dist_bundle_in_sync(tmp_path)
    assert len(violations) == 1
    assert violations[0].check == "dist-in-sync"


def test_dist_in_sync_missing_dist_file_flagged(tmp_path: Path):
    _make_bundles(tmp_path, {"a.template": "alpha\n", "b.md": "beta\n"}, {"a.template": "alpha\n"})
    violations = drift_guard.check_dist_bundle_in_sync(tmp_path)
    assert any("b.md" in v.location for v in violations)


def test_dist_in_sync_extra_stale_dist_file_flagged(tmp_path: Path):
    _make_bundles(tmp_path, {"a.template": "alpha\n"}, {"a.template": "alpha\n", "old.md": "x\n"})
    violations = drift_guard.check_dist_bundle_in_sync(tmp_path)
    assert any("old.md" in v.location for v in violations)


# ---------------------------------------------------------------------------
# Check 4 — sample-project dist-in-sync guard (Set 107 S1)
#
# Same shipping defect as check 3 on the second template tree the extension
# ships, with one difference that matters: the sample bundle is a TREE, so the
# comparison must recurse. A flat comparison would have compared only
# bundle.json and silently ignored every file under files/ — which is the
# entire user-facing sample.
# ---------------------------------------------------------------------------


def _make_sample_bundles(base: Path, src_files: dict, dst_files: dict) -> None:
    src = base.joinpath("docs", "templates", "sample-project")
    dst = base.joinpath(
        "tools", "dabbler-ai-orchestration", "dist", "templates", "sample-project"
    )
    for root, files in ((src, src_files), (dst, dst_files)):
        for rel, content in files.items():
            path = root.joinpath(*rel.split("/"))
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        root.mkdir(parents=True, exist_ok=True)


def test_sample_dist_in_sync_identical_ok(tmp_path: Path):
    files = {"bundle.json": "{}\n", "files/main.py": "print(1)\n"}
    _make_sample_bundles(tmp_path, files, dict(files))
    assert drift_guard.check_sample_bundle_in_sync(tmp_path) == []


def test_sample_dist_in_sync_recurses_into_files_subtree(tmp_path: Path):
    # The whole point of the recursive walk: a nested drift must be caught.
    _make_sample_bundles(
        tmp_path,
        {"bundle.json": "{}\n", "files/hello/greeting.py": "def greet(): ...\n"},
        {"bundle.json": "{}\n", "files/hello/greeting.py": "STALE\n"},
    )
    violations = drift_guard.check_sample_bundle_in_sync(tmp_path)
    assert len(violations) == 1
    assert violations[0].check == "sample-dist-in-sync"
    assert "files/hello/greeting.py" in violations[0].location


def test_sample_dist_in_sync_missing_nested_dist_file_flagged(tmp_path: Path):
    _make_sample_bundles(
        tmp_path,
        {"bundle.json": "{}\n", "files/docs/session-sets/001-x/spec.md": "x\n"},
        {"bundle.json": "{}\n"},
    )
    violations = drift_guard.check_sample_bundle_in_sync(tmp_path)
    assert any("001-x/spec.md" in v.location for v in violations)


def test_sample_dist_in_sync_extra_stale_nested_dist_file_flagged(tmp_path: Path):
    _make_sample_bundles(
        tmp_path,
        {"bundle.json": "{}\n"},
        {"bundle.json": "{}\n", "files/hello/retired.py": "old\n"},
    )
    violations = drift_guard.check_sample_bundle_in_sync(tmp_path)
    assert any("files/hello/retired.py" in v.location for v in violations)


def test_sample_dist_in_sync_crlf_normalized_ok(tmp_path: Path):
    src = tmp_path.joinpath("docs", "templates", "sample-project", "files")
    dst = tmp_path.joinpath(
        "tools",
        "dabbler-ai-orchestration",
        "dist",
        "templates",
        "sample-project",
        "files",
    )
    src.mkdir(parents=True, exist_ok=True)
    dst.mkdir(parents=True, exist_ok=True)
    (src / "main.py").write_bytes(b"print(1)\n")
    (dst / "main.py").write_bytes(b"print(1)\r\n")
    assert drift_guard.check_sample_bundle_in_sync(tmp_path) == []


def test_sample_dist_in_sync_missing_dist_dir_flagged(tmp_path: Path):
    tmp_path.joinpath("docs", "templates", "sample-project").mkdir(parents=True)
    violations = drift_guard.check_sample_bundle_in_sync(tmp_path)
    assert len(violations) == 1
    assert "npm run compile" in violations[0].detail


# ---------------------------------------------------------------------------
# Real-repo green — this suite IS the gate
# ---------------------------------------------------------------------------


def _repo_root() -> Path:
    # ai_router/tests/ -> ai_router/ -> repo root
    return Path(__file__).resolve().parents[2]


def test_real_repo_passes_all_drift_checks():
    violations = drift_guard.run_all(_repo_root())
    assert violations == [], "drift_guard found violations in the real repo:\n" + "\n".join(
        v.render() for v in violations
    )


# ---------------------------------------------------------------------------
# Set 109 S4 — the model-registry drift check, now wired into this guard.
#
# Round-1 verification finding: the set built `model_inventory --check` and
# left it unwired, because the repo's own registry failed it. S4 corrected the
# registry, so the one stated reason expired -- and a gate nothing invokes
# catches nothing, which is the same invisibility the set exists to end.
#
# The check reads only router-config.yaml and the committed lockfile. It never
# probes, so it goes red on a COMMIT and never on a provider's release
# schedule.
# ---------------------------------------------------------------------------


def _registry_repo(tmp_path: Path, *, model_id: str, offered: list[str]) -> Path:
    (tmp_path / "ai_router").mkdir(parents=True, exist_ok=True)
    _write(tmp_path / "ai_router" / "router-config.yaml", f"""\
metadata:
  pricing_reviewed: "2026-08-04"
  review_frequency_days: 30
providers:
  openai:
    display_label: OpenAI
    enabled: true
    api_key_env: DABBLER_OPENAI_API_KEY
    base_url: https://api.openai.com/v1
models:
  probe-target:
    provider: openai
    model_id: {model_id}
    tier: 3
    is_enabled: true
    is_enabled_as_verifier: true
    input_cost_per_1m: 5.00
    output_cost_per_1m: 30.00
routing:
  tier1_max_complexity: 30
  tier2_max_complexity: 65
  tier_assignments:
    1: probe-target
    2: probe-target
    3: probe-target
  task_type_overrides: {{}}
""")
    _write(
        tmp_path / "ai_router" / "model-inventory.lock",
        json.dumps({
            "schemaVersion": 1,
            "providers": {
                "openai": {
                    "probed_at": "2099-01-01T00:00:00Z",
                    "models": offered,
                },
            },
        }),
    )
    return tmp_path


def test_model_registry_drift_flags_an_id_the_provider_does_not_offer(tmp_path):
    """The original defect, as a test: `gpt-5.6` is not an id OpenAI lists."""
    repo = _registry_repo(
        tmp_path, model_id="gpt-5.6", offered=["gpt-5.6-sol", "gpt-5.6-luna"]
    )
    violations = drift_guard.check_model_registry_matches_providers(repo)
    assert len(violations) == 1
    assert violations[0].check == "model-registry-drift"
    assert "gpt-5.6" in violations[0].detail
    assert "probe-target" in violations[0].location


def test_model_registry_drift_passes_on_a_real_id(tmp_path):
    repo = _registry_repo(
        tmp_path, model_id="gpt-5.6-sol", offered=["gpt-5.6-sol", "gpt-5.6-luna"]
    )
    assert drift_guard.check_model_registry_matches_providers(repo) == []


def test_model_registry_drift_needs_no_provider_api_keys(tmp_path, monkeypatch):
    """Set 111 S2 (operator, 2026-08-07): a guard that touches no provider
    must not demand provider credentials.

    This check reads only ``router-config.yaml`` and the committed
    lockfile -- it never probes. It used to load the config through the
    path that validated API keys, so on a Copilot-CLI seat (no
    ``DABBLER_*`` keys at all, which is one of the two supported
    populations, not a misconfiguration) the guard failed with a
    credentials complaint about a network call it was never going to
    make.
    """
    monkeypatch.delenv("DABBLER_OPENAI_API_KEY", raising=False)
    repo = _registry_repo(
        tmp_path, model_id="gpt-5.6-sol", offered=["gpt-5.6-sol"]
    )
    assert drift_guard.check_model_registry_matches_providers(repo) == []

    drifted = _registry_repo(
        tmp_path / "drifted", model_id="gpt-5.6", offered=["gpt-5.6-sol"]
    )
    violations = drift_guard.check_model_registry_matches_providers(drifted)
    assert len(violations) == 1
    assert "gpt-5.6" in violations[0].detail


def test_model_registry_drift_is_silent_without_the_inputs(tmp_path):
    """A checkout carrying neither file has nothing to certify. Absent inputs
    are not a violation -- this guard also runs in consumer repos."""
    assert drift_guard.check_model_registry_matches_providers(tmp_path) == []


def test_the_check_is_registered_so_it_actually_runs(tmp_path):
    """The finding was not "the check is wrong", it was "nothing calls it".
    Asserting registration is what makes that unable to regress."""
    assert "model-registry-drift" in dict(drift_guard.ALL_CHECKS)


def test_the_real_repository_passes_the_model_registry_check():
    """The property this session delivered, asserted against the real tree:
    every configured model_id is one its provider offers. This assertion
    could not have been written before Set 109 S4."""
    repo_root = Path(drift_guard.__file__).resolve().parent.parent.parent
    assert drift_guard.check_model_registry_matches_providers(repo_root) == []


def test_a_missing_lockfile_alone_is_a_violation(tmp_path):
    """Round-3 nit. An `or` meant deleting model-inventory.lock turned this
    gate green -- a fail-open inside the check added to close a fail-open. A
    registry with no snapshot to check against is unverifiable, and
    unverifiable is not passing."""
    repo = _registry_repo(tmp_path, model_id="gpt-5.6-sol", offered=["gpt-5.6-sol"])
    (repo / "ai_router" / "model-inventory.lock").unlink()
    violations = drift_guard.check_model_registry_matches_providers(repo)
    assert len(violations) == 1
    assert "model-inventory.lock" in violations[0].location


def test_a_missing_config_alone_is_a_violation(tmp_path):
    repo = _registry_repo(tmp_path, model_id="gpt-5.6-sol", offered=["gpt-5.6-sol"])
    (repo / "ai_router" / "router-config.yaml").unlink()
    violations = drift_guard.check_model_registry_matches_providers(repo)
    assert len(violations) == 1
    assert "router-config.yaml" in violations[0].location


# ---------------------------------------------------------------------------
# Set 111 S4 — every workflow `uses:` is pinned to a commit SHA.
#
# A tag is mutable, so `actions/checkout@v4` can be repointed at arbitrary
# code; a branch ref (`@release/v1`, which this repo carried on the PyPI
# publish path) moves on every upstream push. The guard is what stops a
# future edit from quietly reintroducing either.
# ---------------------------------------------------------------------------


def _workflow(tmp_path: Path, body: str, name: str = "test.yml") -> Path:
    wf = tmp_path / ".github" / "workflows"
    wf.mkdir(parents=True, exist_ok=True)
    (wf / name).write_text(body, encoding="utf-8")
    return tmp_path


SHA40 = "11d5960a326750d5838078e36cf38b85af677262"


def test_actions_sha_pin_accepts_a_full_sha(tmp_path: Path):
    root = _workflow(
        tmp_path,
        f"jobs:\n  a:\n    steps:\n      - uses: actions/checkout@{SHA40}  # v4.4.0\n",
    )
    assert drift_guard.check_actions_are_sha_pinned(root) == []


def test_actions_sha_pin_flags_a_mutable_tag(tmp_path: Path):
    root = _workflow(
        tmp_path, "jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n"
    )
    violations = drift_guard.check_actions_are_sha_pinned(root)
    assert len(violations) == 1
    assert violations[0].check == "actions-sha-pinned"
    assert "not pinned to a commit SHA" in violations[0].detail


def test_actions_sha_pin_flags_a_moving_branch(tmp_path: Path):
    """`@release/v1` is not even a tag - it moves on every upstream push."""
    root = _workflow(
        tmp_path,
        "jobs:\n  a:\n    steps:\n"
        "      - uses: pypa/gh-action-pypi-publish@release/v1\n",
    )
    assert len(drift_guard.check_actions_are_sha_pinned(root)) == 1


def test_actions_sha_pin_flags_an_unversioned_reference(tmp_path: Path):
    root = _workflow(
        tmp_path, "jobs:\n  a:\n    steps:\n      - uses: actions/checkout\n"
    )
    assert len(drift_guard.check_actions_are_sha_pinned(root)) == 1


def test_actions_sha_pin_flags_a_short_sha(tmp_path: Path):
    """A 7-char sha is ambiguous and not what the hardening guidance asks."""
    root = _workflow(
        tmp_path, "jobs:\n  a:\n    steps:\n      - uses: actions/checkout@11d5960\n"
    )
    assert len(drift_guard.check_actions_are_sha_pinned(root)) == 1


def test_actions_sha_pin_exempts_a_local_composite_action(tmp_path: Path):
    """A local action resolves in-repo at the workflow's own commit."""
    root = _workflow(
        tmp_path,
        "jobs:\n  a:\n    steps:\n"
        "      - uses: ./.github/actions/require-green-test\n",
    )
    assert drift_guard.check_actions_are_sha_pinned(root) == []


def test_actions_sha_pin_reports_file_and_line(tmp_path: Path):
    root = _workflow(
        tmp_path,
        "jobs:\n  a:\n    steps:\n"
        f"      - uses: actions/checkout@{SHA40}\n"
        "      - uses: actions/setup-node@v4\n",
    )
    (violation,) = drift_guard.check_actions_are_sha_pinned(root)
    assert violation.location == ".github/workflows/test.yml:5"


def test_actions_sha_pin_scans_yaml_extension_too(tmp_path: Path):
    root = _workflow(
        tmp_path,
        "jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n",
        name="other.yaml",
    )
    assert len(drift_guard.check_actions_are_sha_pinned(root)) == 1


def test_actions_sha_pin_is_silent_without_a_workflows_dir(tmp_path: Path):
    assert drift_guard.check_actions_are_sha_pinned(tmp_path) == []


def test_actions_sha_pin_is_registered_so_it_actually_runs():
    assert "actions-sha-pinned" in dict(drift_guard.ALL_CHECKS)


def test_the_real_repo_has_every_action_sha_pinned():
    assert drift_guard.check_actions_are_sha_pinned(_repo_root()) == []


def test_the_real_repo_declares_a_dependabot_bump_path():
    """A SHA pin that nothing maintains rots invisibly."""
    assert (_repo_root() / ".github" / "dependabot.yml").is_file()


# ---------------------------------------------------------------------------
# Set 122 S4: the two things concurrent session sets collide on
# ---------------------------------------------------------------------------


def _sets(tmp_path: Path, *names: str) -> Path:
    root = tmp_path / "repo"
    for name in names:
        (root / "docs" / "session-sets" / name).mkdir(parents=True, exist_ok=True)
    return root


def test_set_number_collision_is_silent_on_unique_numbers(tmp_path: Path):
    root = _sets(tmp_path, "001-a", "002-b", "003-c")
    assert drift_guard.check_set_numbers_are_unique(root) == []


def test_set_number_collision_flags_a_duplicate(tmp_path: Path):
    """FALSIFIER: the shape a merge of two concurrently-scaffolded branches has."""
    root = _sets(tmp_path, "001-a", "123-alpha", "123-beta")
    (violation,) = drift_guard.check_set_numbers_are_unique(root)
    assert violation.check == "set-number-collision"
    assert "123-alpha" in violation.detail and "123-beta" in violation.detail


def test_set_number_collision_normalizes_leading_zeros(tmp_path: Path):
    """`7-x` and `007-y` are the same number however they are typed."""
    root = _sets(tmp_path, "7-seven", "007-also-seven")
    assert len(drift_guard.check_set_numbers_are_unique(root)) == 1


def test_set_number_collision_ignores_unnumbered_and_underscore_dirs(tmp_path: Path):
    """The legitimate look-alikes: they must NOT be flagged.

    Bare descriptive slugs predate the numbering convention, and
    `_archived/` is a holding pen the resolver already skips. A guard
    that flagged either would be a false positive on every repo that has
    one.
    """
    root = _sets(tmp_path, "harvester-cli", "another-bare-slug", "_archived", "001-a")
    assert drift_guard.check_set_numbers_are_unique(root) == []


def test_set_number_collision_is_silent_without_a_session_sets_dir(tmp_path: Path):
    assert drift_guard.check_set_numbers_are_unique(tmp_path) == []


def test_set_number_collision_is_registered_so_it_actually_runs():
    assert "set-number-collision" in dict(drift_guard.ALL_CHECKS)


def test_the_real_repo_has_no_duplicate_set_numbers():
    root = _repo_root()
    assert drift_guard.check_set_numbers_are_unique(root) == []
    # L-112-1: name the corpus, so a scan that examined nothing cannot
    # read as a clean bill of health.
    numbered = [
        p.name
        for p in (root / "docs" / "session-sets").iterdir()
        if p.is_dir() and not p.name.startswith("_") and p.name[0].isdigit()
    ]
    assert len(numbered) > 50, "the collision scan examined an empty corpus"


def test_changelog_round_trip_is_registered_so_it_actually_runs():
    assert "changelog-round-trip" in dict(drift_guard.ALL_CHECKS)


def test_the_real_repo_changelog_partition_round_trips():
    assert drift_guard.check_changelog_partition_round_trips(_repo_root()) == []


def test_changelog_round_trip_flags_a_planted_reorder(tmp_path: Path):
    """FALSIFIER: swap two BASELINE fragments' order keys in a copy of the real corpus."""
    import os
    import shutil

    from ai_router import changelog as cl

    repo = _repo_root()
    root = tmp_path / "repo"
    target = cl.TARGETS["router"]
    dst = root / target.rendered_rel.replace("/", os.sep)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(target.rendered_path(str(repo)), dst)
    shutil.copytree(
        target.fragments_dir(str(repo)), root / target.fragments_rel.replace("/", os.sep)
    )

    # Set 133 S1 (L-069-1, the same class as the comment below): `fold`
    # empties the live corpus at every release, so from the moment a
    # version is cut until the next contribution this falsifier had
    # nothing to plant into and failed on a repo that was working
    # correctly. Re-seed from real released prose when that is the state,
    # exactly as the sibling battery in `test_changelog_partition.py`
    # does. (Both sites now carry this; folding the two copies into one
    # shared helper is a recorded follow-on.)
    # Set 113 S1 (L-069-1 / G-008): the guard asked "is the corpus EMPTY",
    # but the plant below needs TWO recorded fragments to swap. Those
    # differ in exactly one state -- a single fragment, which is what the
    # corpus holds between the first contribution after a fold and the
    # second -- so this failed on a correctly working repo the first time
    # anyone contributed post-release. Set 133 S1 fixed the zero case and
    # left the one case. Count the RECORDED fragments: an unrecorded
    # contribution above the baseline cannot be planted into.
    _recorded = {
        e["file"] for e in (cl.load_baseline(target, str(root)) or {}).get("fragments") or []
    }
    if len([f for f in cl.load_fragments(target, str(root)) if f.filename in _recorded]) < 2:
        parts = cl.split_document(cl.read_text(str(dst)))
        _, sections = cl.split_blocks(parts.released, 2)
        assert len(sections) >= 2, "released history should carry version sections"
        seeded = "".join(
            "## [Unreleased] — seeded prose {}\n{}".format(
                index, "".join(section.splitlines(keepends=True)[1:])
            )
            for index, section in enumerate(sections[:2])
        )
        cl.write_text(str(dst), parts.preamble + seeded + parts.released)
        cl.migrate(target, str(root))

    assert drift_guard.check_changelog_partition_round_trips(root) == []

    # L-112-1: plant into the corpus the gate actually reads. `check`
    # re-renders from the BASELINE fragment set alone, so a reorder of two
    # post-partition contributions is not a violation at all -- it is the
    # hand-slotting the order gap exists for. Taking `load_fragments(...)[0]`
    # here retargeted the plant onto whichever fragments were added most
    # recently, and this falsifier passed only while at most one such
    # fragment existed above the baseline. Set 129 S2's own changelog
    # fragment made it two, and the plant stopped firing. The sibling
    # falsifiers in `test_changelog_partition.py` already select this way
    # (`baseline_fragments`); this one did not (L-069-1).
    recorded = {e["file"] for e in cl.load_baseline(target, str(root))["fragments"]}
    fragments = [f for f in cl.load_fragments(target, str(root)) if f.filename in recorded]
    assert len(fragments) >= 2, "the reorder falsifier had no frozen corpus to plant into"

    directory = target.fragments_dir(str(root))
    first, second = fragments[0], fragments[1]
    tmp = os.path.join(directory, "tmp.md")
    os.rename(os.path.join(directory, first.filename), tmp)
    os.rename(
        os.path.join(directory, second.filename),
        os.path.join(directory, f"{first.order:04d}-{second.slug}.md"),
    )
    os.rename(tmp, os.path.join(directory, f"{second.order:04d}-{first.slug}.md"))

    violations = drift_guard.check_changelog_partition_round_trips(root)
    assert violations, "a reordered changelog partition passed the CI gate"
    assert violations[0].check == "changelog-round-trip"


def test_changelog_round_trip_is_silent_in_a_repo_without_changelogs(tmp_path: Path):
    assert drift_guard.check_changelog_partition_round_trips(tmp_path) == []


def test_changelog_round_trip_reports_a_broken_import_instead_of_skipping(tmp_path: Path):
    """FALSIFIER for the round-1 nit: the gate must not skip itself.

    A partitioned repo whose `ai_router.changelog` cannot be imported has
    a gate that CANNOT run, and a gate that returns clean in that state
    is indistinguishable from a passing one -- the silent fail-open
    branch L-079-3 warns about. Simulated by giving the fake repo a
    `changelog.d/` and an `ai_router/changelog.py` that raises on import,
    with the real package shadowed off `sys.path`.
    """
    import subprocess
    import sys as _sys
    import textwrap

    root = tmp_path / "repo"
    (root / "ai_router" / "changelog.d").mkdir(parents=True)
    (root / "ai_router" / "__init__.py").write_text("", encoding="utf-8")
    (root / "ai_router" / "changelog.py").write_text(
        "raise RuntimeError('planted import failure')\n", encoding="utf-8"
    )
    (root / "ai_router" / "CHANGELOG.md").write_text("# C\n", encoding="utf-8")

    # Run in a subprocess so the planted `ai_router` package wins the
    # import and the real one in this process is not disturbed.
    script = textwrap.dedent(
        f"""
        import sys
        sys.path.insert(0, {str(_repo_root() / "ai_router" / "scripts")!r})
        import drift_guard
        from pathlib import Path
        v = drift_guard.check_changelog_partition_round_trips(Path({str(root)!r}))
        print(len(v))
        print(v[0].check if v else "")
        """
    )
    result = subprocess.run(
        [_sys.executable, "-c", script], capture_output=True, text=True
    )
    assert result.returncode == 0, result.stderr
    lines = result.stdout.strip().splitlines()
    assert lines[0] == "1", f"gate skipped itself: {result.stdout} {result.stderr}"
    assert lines[1] == "changelog-round-trip"


def test_changelog_round_trip_stays_silent_in_a_repo_with_no_partition(tmp_path: Path):
    """The paired look-alike: a consumer repo with no changelog.d/ owes nothing."""
    root = tmp_path / "repo"
    (root / "ai_router").mkdir(parents=True)
    assert drift_guard.check_changelog_partition_round_trips(root) == []
