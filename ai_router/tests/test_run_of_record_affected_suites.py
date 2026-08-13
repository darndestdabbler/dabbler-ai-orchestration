"""Falsifiers for the suite-owned input set (Set 129 Session 1).

A5 resolved to *the suite declares its inputs, the intersection decides
the obligation, and modules group* (``docs/proposals/2026-08-12-multi-
module-retesting/verdict.md`` §4). Two things follow, and both are
tested by **planting the declaration** rather than by reading the code
(L-112-1): a gate whose input is a config file is a gate whose regexes
you can review into a false sense of coverage.

The weighting is deliberate. The malformed-declaration case is the one
that is invisible today -- ``load_suites`` dropped a typo'd entry in
silence, ``check_test_run_fresh`` read the resulting empty tuple as *"no
expensive suites"*, and the close gate governing every expensive suite in
the repo passed. Nothing in the shipped test suite could tell that state
apart from a repo that genuinely declares nothing.
"""

from __future__ import annotations

from pathlib import PurePosixPath

import pytest

from ai_router import run_of_record as ror


SHARED = ror.SuiteSpec(
    name="shared-lib",
    command="run shared",
    covers=("libs/shared/",),
    expensive=True,
)
CONSUMER = ror.SuiteSpec(
    name="consumer",
    command="run consumer",
    covers=("libs/shared/", "apps/consumer/"),
    expensive=True,
)


# ---------------------------------------------------------------------------
# FIRES
# ---------------------------------------------------------------------------


class TestTheIntersectionFires:
    def test_the_intersection_decides_and_names_what_matched(self):
        """One claim from three sides, because they are one claim.

        **Fan-out:** ``libs/shared/util.ts`` sits in two declared input
        sets, so it owes two suites. Had ``SuiteSpec`` grown a ``module``
        field and had this change been labelled as belonging to the
        shared module, the consumer suite would have stopped being owed
        because of a LABEL -- a verification reduction wearing an
        organizational costume, and one that fails open (L-125-1).

        **Naming:** the deliverable is auditability, not a bigger
        boolean. A session told only *that* it owes a 14-minute suite
        cannot check the claim; a wrong ``covers`` entry is invisible
        from a yes/no answer and visible the moment the matched input is
        named.

        **Silence:** and the same intersection, from the empty side --
        an input under no suite's declared inputs owes nothing at all,
        which is what keeps a complete input set from collapsing into
        "every change pays for everything".
        """
        matches = ror.affected_suites(
            ["libs/shared/util.ts"], [SHARED, CONSUMER]
        )
        assert [m.suite for m in matches] == ["shared-lib", "consumer"], (
            "a shared input must fan out to every suite declaring it"
        )
        for m in matches:
            assert m.changed_inputs == ("libs/shared/util.ts",)
            assert m.matched_prefixes == ("libs/shared/",)

        (only,) = ror.affected_suites(
            ["apps/consumer/main.ts", "docs/unrelated.md"], [CONSUMER]
        )
        assert only.changed_inputs == ("apps/consumer/main.ts",), (
            "only the paths that actually matched may be reported"
        )
        assert only.matched_prefixes == ("apps/consumer/",)

        assert ror.affected_suites(
            ["docs/planning/some-note.md"], [SHARED, CONSUMER]
        ) == (), "an input under no declared input set owes nothing"

    def test_an_input_changed_after_a_run_stales_it(self, tmp_path):
        """The Set 110 S3 pattern, reached through a declared input that
        is NOT product source: a build-configuration file inside the
        input set stales the run exactly as a source file does. Under the
        old reading of ``covers`` -- "the paths a suite is about" -- this
        file was simply out of scope."""
        import subprocess

        def _git(*args):
            subprocess.run(
                ["git", "-C", str(tmp_path), *args],
                check=True,
                capture_output=True,
            )

        _git("init", "-q")
        _git("config", "user.email", "t@example.com")
        _git("config", "user.name", "T")
        (tmp_path / "libs" / "shared").mkdir(parents=True)
        (tmp_path / "libs" / "shared" / "util.ts").write_text(
            "export const a = 1;\n", encoding="utf-8"
        )
        (tmp_path / "libs" / "shared" / "tsconfig.json").write_text(
            '{"strict": true}\n', encoding="utf-8"
        )
        _git("add", "-A")
        _git("commit", "-qm", "init")
        set_dir = tmp_path / "docs" / "session-sets" / "001-x"
        set_dir.mkdir(parents=True)

        ror.record_run(
            str(set_dir), SHARED, ror.OUTCOME_PASSED,
            duration_seconds=1.0, repo_root=str(tmp_path),
        )
        (tmp_path / "libs" / "shared" / "tsconfig.json").write_text(
            '{"strict": false}\n', encoding="utf-8"
        )
        (v,) = ror.evaluate_freshness(
            str(set_dir),
            ["libs/shared/tsconfig.json"],
            [SHARED],
            repo_root=str(tmp_path),
        )
        assert v.required and not v.passed
        assert "PREDATES" in v.reason
        assert v.changed_inputs == ("libs/shared/tsconfig.json",)


class TestAMalformedDeclarationBlocksTheClose:
    """The live fail-open defect, planted.

    Every entry below is a plausible typo, and every one of them used to
    vanish silently and leave ``check_test_run_fresh`` reporting "no
    expensive suites declared".
    """

    @pytest.mark.parametrize(
        "entry",
        [
            {"nmae": "pytest", "covers": ["ai_router/"]},      # typo'd key
            {"name": "pytest", "cover": ["ai_router/"]},       # typo'd covers
            {"name": "pytest", "covers": "ai_router/"},        # string not list
            {"name": "pytest", "covers": []},                  # empty input set
            {"name": "   ", "covers": ["ai_router/"]},         # blank name
            "pytest",                                          # not a mapping
        ],
    )
    def test_a_typo_is_reported_instead_of_dropped(self, entry):
        loaded = ror.load_suites_checked(
            {"testing": {"suites": [entry]}}
        )
        assert loaded.suites == ()
        assert loaded.errors, (
            "a dropped entry that reports nothing is indistinguishable "
            "from a repo that declares no suites"
        )
        assert not loaded.ok

    def test_a_non_list_suites_key_does_not_silently_become_the_defaults(self):
        """The nastiest shape: ``suites:`` written as a mapping used to
        fall through to ``DEFAULT_SUITES``, so the gate ran against a
        declaration nobody wrote and reported nothing amiss."""
        loaded = ror.load_suites_checked(
            {"testing": {"suites": {"name": "pytest"}}}
        )
        assert loaded.errors
        assert not loaded.ok

    @pytest.mark.parametrize(
        "entry, needle",
        [
            # A bad item INSIDE an otherwise-usable covers list: the
            # surrounding prefixes still load, so the suite survives with
            # a silently narrowed input set.
            ({"name": "s", "covers": ["src/", "", "lib/"]}, "covers[1]"),
            ({"name": "s", "covers": ["src/", 3]}, "covers[1]"),
            # A quoted boolean loads the suite as CHEAP, which removes it
            # from the close gate without removing it from the config.
            ({"name": "s", "covers": ["src/"], "expensive": "true"}, "expensive"),
            ({"name": "s", "covers": ["src/"], "expensive": 1}, "expensive"),
            # A bad test-surface prefix widens what a post-suite fix owes
            # rather than narrowing it, but it is still a typo nobody sees.
            ({"name": "s", "covers": ["src/"], "tests": ["t/", None]}, "tests[1]"),
            ({"name": "s", "covers": ["src/"], "tests": "t/"}, "tests"),
            ({"name": "s", "covers": ["src/"], "command": 7}, "command"),
        ],
    )
    def test_a_malformed_field_inside_a_usable_entry_is_reported(
        self, entry, needle
    ):
        """The half the first fix missed, found by verification.

        Reporting only the entries it DROPPED left the loader still
        filtering bad values out of entries it kept. A silently narrowed
        input set is the same fail-open defect as a silently dropped
        suite, one level down -- and ``expensive: "true"`` is the
        sharpest of them, because the suite stays in the config and
        quietly leaves the gate.
        """
        loaded = ror.load_suites_checked({"testing": {"suites": [entry]}})
        assert loaded.errors, (
            "a value filtered out of a surviving entry must be reported"
        )
        assert any(needle in e for e in loaded.errors), loaded.errors
        assert loaded.suites == (), (
            "an entry with an unusable field must not load as if it were "
            "understood"
        )

    def test_a_relative_covers_spelling_matches_rather_than_silently_missing(
        self,
    ):
        """Supplementary-round finding: only the CHANGED path was
        normalised, not the declared prefix, so the ordinary relative
        spelling ``./src/`` matched nothing while reading as correct --
        the same asymmetry as the dotfile bug, from the other side."""
        suite = ror.SuiteSpec(
            name="s", command="run", covers=("./src/",), expensive=True
        )
        (m,) = ror.affected_suites(["src/app.py"], [suite])
        assert m.changed_inputs == ("src/app.py",)
        assert ror.session_touched("", suite.covers, ["src/app.py"])
        loaded = ror.load_suites_checked(
            {"testing": {"suites": [{"name": "s", "covers": ["./src/"]}]}}
        )
        assert loaded.ok
        assert loaded.suites[0].covers == ("src/",)

    @pytest.mark.parametrize("key", ["expensvie", "cover", "test", "commands"])
    def test_an_unrecognised_FIELD_is_reported_not_defaulted(self, key):
        """Round-4 finding, and the archetype the whole session names: a
        hand-authored YAML key typo. ``expensvie: true`` is not a bad
        value, it is a key nothing reads -- so ``expensive`` keeps its
        default, the suite loads CHEAP, and the close gate goes quiet
        about it. Checking values was not enough; the recognised set has
        to be an allowlist."""
        loaded = ror.load_suites_checked(
            {"testing": {"suites": [
                {"name": "e2e", "covers": ["src/"], key: True}
            ]}}
        )
        assert loaded.errors, f"{key!r} must not be silently ignored"
        assert any(key in e for e in loaded.errors), loaded.errors
        assert loaded.suites == ()

    @pytest.mark.parametrize("root_prefix", ["./", "."])
    def test_a_repo_root_prefix_covers_the_repo_rather_than_nothing(
        self, root_prefix
    ):
        """Round-4 finding, introduced by this session's own normaliser:
        ``./`` normalised to the empty string and the matcher then
        skipped it, so a whole-repo suite -- a legitimate declaration for
        a small consumer -- matched NOTHING and its gate was disarmed for
        every change. The failure is invisible because the declaration is
        the most sweeping one available."""
        loaded = ror.load_suites_checked(
            {"testing": {"suites": [
                {"name": "all", "covers": [root_prefix], "expensive": True}
            ]}}
        )
        assert loaded.ok, loaded.errors
        assert ror.affected_suites(["src/app.py"], loaded.suites)
        assert ror.affected_suites(["deeply/nested/file.txt"], loaded.suites)

    def test_an_empty_covers_string_is_still_rejected(self):
        """The look-alike that keeps the root-prefix fix narrow. ``"./"``
        declares the repo; ``""`` declares nothing, and must stay an
        error rather than silently becoming a whole-repo suite."""
        loaded = ror.load_suites_checked(
            {"testing": {"suites": [{"name": "a", "covers": [""]}]}}
        )
        assert loaded.errors
        assert loaded.suites == ()

    def test_the_close_gate_blocks_on_a_malformed_declaration(
        self, tmp_path, monkeypatch
    ):
        """The whole point, end to end at the gate's own entrypoint.

        Before Set 129 S1 this returned ``(True, "")`` -- a passing gate
        -- because the malformed entry was dropped and the empty tuple
        read as "no expensive suites".
        """
        from ai_router import gate_checks

        monkeypatch.setattr(
            gate_checks,
            "_router_config_or_none",
            lambda: {"testing": {"suites": [{"nmae": "pytest",
                                             "covers": ["ai_router/"]}]}},
        )
        disposition = gate_checks.Disposition(
            status="completed",
            summary="s",
            verification_method="api",
            files_changed=["ai_router/run_of_record.py"],
        )
        ok, detail = gate_checks.check_test_run_fresh(
            str(tmp_path), disposition
        )
        assert ok is False
        assert "malformed" in detail
        assert "testing.suites[0]" in detail

    def test_an_empty_declaration_cannot_pass_as_nothing_owed(
        self, tmp_path, monkeypatch
    ):
        """Same gate, stated from the direction that made it invisible:
        the gate must not read *zero suites* as *nothing owed* when the
        zero came from entries it refused."""
        from ai_router import gate_checks

        monkeypatch.setattr(
            gate_checks,
            "_router_config_or_none",
            lambda: {"testing": {"suites": [{"name": "pytest", "covers": []}]}},
        )
        disposition = gate_checks.Disposition(
            status="completed",
            summary="s",
            verification_method="api",
            files_changed=["ai_router/run_of_record.py"],
        )
        ok, detail = gate_checks.check_test_run_fresh(
            str(tmp_path), disposition
        )
        assert ok is False
        assert "cannot be determined" in detail


class TestTheRealDeclarationsCoverWhatTheSuitesRead:
    """Round-1 verification: the re-derivation was still incomplete.

    Each case below is a real file that a real test in the named suite
    reads, and that the declaration did not name before Set 129 S1. A
    session changing only such a file owed that suite nothing while being
    able to turn it red.
    """

    @staticmethod
    def _suite(name):
        (s,) = [s for s in ror.DEFAULT_SUITES if s.name == name]
        return s

    @pytest.mark.parametrize(
        "suite_name, changed",
        [
            # Layer 2 drives the REAL router CLIs through the workspace
            # venv (moduleCliFixture -> `python -m ai_router.modules`,
            # sampleProjectSmoke -> start_session / close_session), which
            # is exactly how Set 114 S3's new Python gates broke
            # sampleProjectSmoke. A Python-only change could turn the
            # TypeScript suite red while owing it nothing.
            ("mocha", "ai_router/close_session.py"),
            ("mocha", "tools/dabbler-ai-orchestration/media/status-icon.svg"),
            ("mocha", "tools/dabbler-ai-orchestration/dist/templates/x.md"),
            ("mocha", "docs/templates/consumer-bootstrap/AGENTS.md"),
            ("mocha", "test-fixtures/cold-start/full/AGENTS.md"),
            ("mocha", "tools/dabbler-ai-orchestration/package-lock.json"),
            ("mocha", "tools/dabbler-ai-orchestration/scripts/vscode-launch.js"),
            # Layer 3 builds before it runs: esbuild copies the templates
            # into dist, tsc compiles through tsconfig, and the config
            # decides which specs exist at all.
            ("playwright", "tools/dabbler-ai-orchestration/esbuild.js"),
            ("playwright", "tools/dabbler-ai-orchestration/playwright.config.ts"),
            ("playwright", "tools/dabbler-ai-orchestration/dist/templates/x.md"),
            ("playwright", "tools/dabbler-ai-orchestration/resources/cost-estimates.json"),
            # And Layer 3 installs THIS tree: the cold-start walkthrough
            # sets DABBLER_ROUTER_INSTALL_SPEC to the repo root, so it
            # `pip install -e`s the router and drives what it just built.
            # The old file-by-file narrowing assumed the published wheel.
            ("playwright", "ai_router/modules.py"),
            ("playwright", "pyproject.toml"),
            # Layer 1's own configuration and the corpora it asserts on.
            ("pytest", "pytest.ini"),
            ("pytest", "pyproject.toml"),
            ("pytest", ".github/dependabot.yml"),
            ("pytest", "test-fixtures/cold-start/full/AGENTS.md"),
            ("pytest", "tools/dabbler-ai-orchestration/changelog.d/0010-removed.md"),
        ],
    )
    def test_a_real_input_is_declared_by_the_suite_that_reads_it(
        self, suite_name, changed
    ):
        assert ror.affected_suites([changed], [self._suite(suite_name)]), (
            f"{changed} can change {suite_name}'s result but the "
            f"declaration does not name it"
        )

    def test_the_widening_did_not_become_every_change_pays(self):
        """The other direction, which keeps the fix honest: a doc that no
        suite reads must still owe nothing. Widening an input set until
        everything is affected buys the same nothing as declaring too
        little, at 20 minutes a session."""
        for rel in (
            "README.md",
            "docs/planning/project-guidance.md",
            "docs/ai-led-session-workflow.md",
            "CONTRIBUTING.md",
        ):
            assert ror.affected_suites([rel], ror.DEFAULT_SUITES) == (), rel


class TestDeclaringTheSessionSetCorpusDoesNotDeadlockTheGate:
    """Round-3 remediation, and the reason the residual could be closed.

    ``docs/session-sets/`` is a real pytest input -- the suite inventories
    every set's activity log and parses every ``spec.md`` -- and declaring
    it naively makes the gate refuse every close: ``record_run`` digests
    the covered surfaces and *then* writes ``test-runs.jsonl`` into the
    set directory, staling the run it just recorded.

    Both directions are pinned, because an exclusion that is too wide is
    just a hole with a comment on it.
    """

    SUITE = ror.SuiteSpec(
        name="pytest",
        command="pytest",
        covers=("docs/",),
        expensive=True,
    )

    @staticmethod
    def _repo(tmp_path):
        import subprocess

        def _git(*args):
            subprocess.run(
                ["git", "-C", str(tmp_path), *args],
                check=True,
                capture_output=True,
            )

        _git("init", "-q")
        _git("config", "user.email", "t@example.com")
        _git("config", "user.name", "T")
        set_dir = tmp_path / "docs" / "session-sets" / "129-x"
        set_dir.mkdir(parents=True)
        (set_dir / "spec.md").write_text("# spec\n", encoding="utf-8")
        other = tmp_path / "docs" / "session-sets" / "001-other"
        other.mkdir(parents=True)
        (other / "activity-log.json").write_text("{}\n", encoding="utf-8")
        _git("add", "-A")
        _git("commit", "-qm", "init")
        return tmp_path, set_dir

    def test_recording_a_run_does_not_stale_it(self, tmp_path):
        """The deadlock, planted. Before the bookkeeping exclusion this
        reported PREDATES with nothing else on disk touched."""
        root, set_dir = self._repo(tmp_path)
        ror.record_run(
            str(set_dir), self.SUITE, ror.OUTCOME_PASSED,
            duration_seconds=1.0, repo_root=str(root),
        )
        (v,) = ror.evaluate_freshness(
            str(set_dir),
            ["docs/session-sets/129-x/spec.md"],
            [self.SUITE],
            repo_root=str(root),
        )
        assert v.passed, v.reason

    def test_the_active_sets_own_spec_still_stales_the_run(self, tmp_path):
        """The exclusion is by sanctioned-writer BASENAME, not by
        directory. ``spec.md`` is not bookkeeping, so editing it after
        the run still refuses the close."""
        root, set_dir = self._repo(tmp_path)
        ror.record_run(
            str(set_dir), self.SUITE, ror.OUTCOME_PASSED,
            duration_seconds=1.0, repo_root=str(root),
        )
        (set_dir / "spec.md").write_text("# spec, edited\n", encoding="utf-8")
        (v,) = ror.evaluate_freshness(
            str(set_dir),
            ["docs/session-sets/129-x/spec.md"],
            [self.SUITE],
            repo_root=str(root),
        )
        assert v.required and not v.passed
        assert "PREDATES" in v.reason

    def test_another_sets_bookkeeping_is_ordinary_changed_work(
        self, tmp_path
    ):
        """The half that keeps the exclusion narrow. A resurrected status
        token in SOMEONE ELSE'S activity log is exactly what
        ``test_step_status_drift`` exists to catch, so it must both owe
        the suite and stale a run recorded before it."""
        root, set_dir = self._repo(tmp_path)
        ror.record_run(
            str(set_dir), self.SUITE, ror.OUTCOME_PASSED,
            duration_seconds=1.0, repo_root=str(root),
        )
        (root / "docs" / "session-sets" / "001-other"
         / "activity-log.json").write_text(
            '{"entries": [{"status": "completed"}]}\n', encoding="utf-8"
        )
        changed = ["docs/session-sets/001-other/activity-log.json"]
        assert ror.affected_suites(
            changed, [self.SUITE], set_rel="docs/session-sets/129-x"
        ), "another set's artifacts are ordinary changed files"
        (v,) = ror.evaluate_freshness(
            str(set_dir), changed, [self.SUITE], repo_root=str(root)
        )
        assert v.required and not v.passed
        assert "PREDATES" in v.reason

    def test_the_active_sets_bookkeeping_does_not_by_itself_owe_the_suite(
        self,
    ):
        """Consistency between the two halves: a file that cannot stale
        the run must not be able to demand it either, or a session owes a
        suite for a reason the freshness check cannot see."""
        changed = [
            "docs/session-sets/129-x/test-runs.jsonl",
            "docs/session-sets/129-x/disposition.json",
            "docs/session-sets/129-x/session-state.json",
            "docs/session-sets/129-x/activity-log.json",
        ]
        assert ror.affected_suites(
            changed, [self.SUITE], set_rel="docs/session-sets/129-x"
        ) == ()
        assert ror.affected_suites(changed, [self.SUITE]) != (), (
            "with no active set named, these are ordinary paths again"
        )


# ---------------------------------------------------------------------------
# DOES NOT FIRE -- the legitimate look-alikes
# ---------------------------------------------------------------------------


class TestTheLookAlikesDoNotFire:
    def test_an_explicit_empty_list_is_still_the_deliberate_disarm(
        self, tmp_path, monkeypatch
    ):
        """The look-alike that keeps the fail-closed rule narrow, and the
        boundary this set deliberately did NOT move.

        ``suites: []`` parses cleanly and declares nothing. That is an
        operator decision with no error in it, and Set 129 authorizes no
        new skip -- but it also must not be confused with the malformed
        case above, which is why both directions are pinned here.
        """
        from ai_router import gate_checks

        loaded = ror.load_suites_checked({"testing": {"suites": []}})
        assert loaded.suites == ()
        assert loaded.errors == ()
        assert loaded.ok

        monkeypatch.setattr(
            gate_checks, "_router_config_or_none",
            lambda: {"testing": {"suites": []}},
        )
        disposition = gate_checks.Disposition(
            status="completed",
            summary="s",
            verification_method="api",
            files_changed=["ai_router/run_of_record.py"],
        )
        assert gate_checks.check_test_run_fresh(str(tmp_path), disposition) == (
            True, ""
        )

    def test_a_repo_with_no_module_manifest_behaves_exactly_as_before(
        self, tmp_path
    ):
        """A5's answer, asserted structurally rather than by inspection.

        ``docs/modules.yaml`` is this framework's module tier. The
        obligation must not vary with its presence, because the suite --
        not the module -- declares the input set. Computed with the
        manifest absent and again with a manifest that assigns the
        changed path to a DIFFERENT module than the suite: identical.
        """
        change = ["libs/shared/util.ts"]
        without = ror.affected_suites(change, [SHARED, CONSUMER])

        (tmp_path / "docs").mkdir()
        (tmp_path / "docs" / "modules.yaml").write_text(
            "modules:\n"
            "  - id: consumer-module\n"
            "    codeRoots: ['apps/consumer/']\n"
            "  - id: shared-module\n"
            "    codeRoots: ['libs/shared/']\n",
            encoding="utf-8",
        )
        with_manifest = ror.affected_suites(change, [SHARED, CONSUMER])

        assert without == with_manifest
        assert [m.suite for m in with_manifest] == ["shared-lib", "consumer"]


# ---------------------------------------------------------------------------
# STRUCTURAL
# ---------------------------------------------------------------------------


def _independent_intersection(rel: str, covers) -> set:
    """Recompute the intersection a deliberately different way.

    Prefix matching by ANCESTOR-SET membership rather than by
    ``str.startswith``. Written to disagree with the implementation if
    the implementation is wrong about path boundaries, dotted segments,
    or separator normalisation -- a second copy of ``startswith`` would
    only prove the copy was faithful.
    """
    parts = PurePosixPath(rel.replace("\\", "/")).parts
    ancestors = {"/".join(parts[:i]) for i in range(1, len(parts) + 1)}
    return {c for c in covers if c.rstrip("/") in ancestors}


class TestStructuralAgreementWithAnIndependentWalk:
    def test_changed_inputs_equal_an_independent_intersection(self):
        """L-112-1: assert the INPUT SET is non-empty as well as the
        verdict. A walk whose corpus comes back empty agrees with
        anything, having examined nothing."""
        change = [
            "ai_router/run_of_record.py",
            "ai_router/gate_checks.py",
            "ai_router/tests/test_run_of_record.py",
            "tools/dabbler-ai-orchestration/src/extension.ts",
            "tools/dabbler-ai-orchestration/package.json",
            "ai_router/session_state.py",
            ".github/workflows/test.yml",
            ".gitignore",
            "pyproject.toml",
            "README.md",
            "docs/planning/project-guidance.md",
        ]
        suites = ror.DEFAULT_SUITES
        assert change, "the change set under test must not be empty"
        assert suites, "the suite corpus under test must not be empty"

        expected = {}
        for suite in suites:
            hits = sorted(
                rel
                for rel in change
                if _independent_intersection(rel, suite.covers)
            )
            if hits:
                expected[suite.name] = hits
        assert expected, (
            "the independent walk found no affected suite at all, so this "
            "test would pass against a function that returns nothing"
        )

        actual = {
            m.suite: list(m.changed_inputs)
            for m in ror.affected_suites(change, suites)
        }
        assert actual == expected

    def test_a_dotted_input_is_matched_rather_than_silently_mangled(self):
        """The bug the re-derivation walked into.

        ``session_touched`` normalised with ``lstrip("./")``, which
        strips a CHARACTER SET: ``.github/workflows/test.yml`` became
        ``github/workflows/test.yml`` and ``.gitignore`` became
        ``gitignore``. A suite declaring a dotted input therefore matched
        nothing while its declaration read as correct -- a gate scoped
        smaller than it is written, which is the fail-open direction.
        """
        dotted = ror.SuiteSpec(
            name="ci",
            command="run ci",
            covers=(".github/", ".gitignore"),
            expensive=True,
        )
        (m,) = ror.affected_suites(
            [".github/workflows/test.yml", ".gitignore", "src/a.ts"], [dotted]
        )
        assert m.changed_inputs == (".github/workflows/test.yml", ".gitignore")
        assert ror.session_touched("", dotted.covers, [".gitignore"])
        assert ror.session_touched(
            "", dotted.covers, [".github/workflows/test.yml"]
        )
