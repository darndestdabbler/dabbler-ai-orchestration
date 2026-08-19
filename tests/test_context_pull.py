"""The bounded scope as verification's evidence, and the two-step pull."""

import subprocess

import pytest

from ai_router import ledger
from ai_router.context_scope import (
    MAX_REQUESTS_PER_RESPONSE,
    parse_context_requests,
    render_scope,
    resolve_scope,
    scope_domain,
)
from ai_router.session import (
    declared_module_slug,
    parse_set_config,
    register_session_start,
)
from ai_router.verify import (
    EXIT_BLOCKING,
    EXIT_OK,
    EXIT_STATE,
    EXIT_USAGE,
    decide_escalation,
    resolve_scope_for_set,
    run_round,
)

from .test_verify import CLEAN_RESPONSE, FakeVerifier, make_result

SCOPED_SPEC = """# Demo set

## Session Set Configuration

```yaml
module: demo
totalSessions: 2
```

## Sessions

### Session 1 of 2: First things
1. Register.
2. Build the widget.
3. Cross-provider verification.
4. Close-out.

### Session 2 of 2: Second things
1. Register.
2. Polish the widget.
3. Cross-provider verification.
4. Close-out.
"""

MANIFEST = """modules:
  - slug: demo
    title: The demo module
    codeRoots:
      - src
    specSections:
      - docs/design.md#contracts
    contextAssets:
      - config/*.yaml
"""

WIDGET_BEFORE = '''"""The widget."""
from src import helper


def compute_total(items):
    """Sum the items."""
    return helper.normalize(sum(items))
'''

WIDGET_AFTER = '''"""The widget."""
from src import helper


def compute_total(items, scale):
    """Sum the items, scaled."""
    return helper.normalize(sum(items) * scale)
'''

HELPER = '''"""Helpers."""


def normalize(value):
    """Clamp a value into range."""
    if value < 0:
        return 0
    return value
'''

CALLER = '''"""A caller that lives outside the changed file."""
from src import widget


def report(rows):
    return widget.compute_total(rows)
'''

TEST_WIDGET = '''from src import widget


def test_widget_totals():
    assert widget.compute_total([1, 2]) == 3
'''

DESIGN = """# Design

## Contracts

`compute_total` returns a non-negative integer.

## Other

Not mapped to the module.
"""


def _git(cwd, *args):
    return subprocess.run(
        ["git", "-C", str(cwd), *args], capture_output=True, text=True,
    )


@pytest.fixture
def scoped(sandbox_repo, monkeypatch):
    """A registered session whose set declares a module the manifest
    carries, with a real caller, a real test, and a real one-hop
    reference, so every tier has something to resolve."""
    repo, set_dir = sandbox_repo
    (set_dir / "spec.md").write_text(SCOPED_SPEC, encoding="utf-8")
    (repo / "docs" / "modules.yaml").write_text(MANIFEST, encoding="utf-8")
    (repo / "docs" / "design.md").write_text(DESIGN, encoding="utf-8")
    (repo / "src").mkdir()
    (repo / "src" / "__init__.py").write_text("", encoding="utf-8")
    (repo / "src" / "widget.py").write_text(WIDGET_BEFORE, encoding="utf-8")
    (repo / "src" / "helper.py").write_text(HELPER, encoding="utf-8")
    (repo / "src" / "caller.py").write_text(CALLER, encoding="utf-8")
    (repo / "tests").mkdir()
    (repo / "tests" / "test_widget.py").write_text(TEST_WIDGET,
                                                   encoding="utf-8")
    (repo / "config").mkdir()
    (repo / "config" / "app.yaml").write_text("limit: 10\n", encoding="utf-8")
    (repo / "README.md").write_text("# Outside the module\n", encoding="utf-8")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "seed module")

    register_session_start(set_dir, 1, engine="claude-code",
                           provider="anthropic")
    # The session's work: a signature change with a stale caller.
    (repo / "src" / "widget.py").write_text(WIDGET_AFTER, encoding="utf-8")

    def install(outcomes):
        import importlib

        fake = FakeVerifier(outcomes)
        monkeypatch.setattr(
            importlib.import_module("ai_router.route"), "route", fake
        )
        return fake

    return repo, set_dir, install


class TestSetConfig:
    def test_reads_the_declared_module(self):
        assert parse_set_config(SCOPED_SPEC)["module"] == "demo"

    def test_absent_block_is_not_a_declaration(self, tmp_path):
        (tmp_path / "spec.md").write_text("# No config here\n",
                                          encoding="utf-8")
        assert parse_set_config("# No config here\n") == {}
        assert declared_module_slug(tmp_path) is None


class TestEvidenceFork:
    def test_undeclared_module_keeps_the_monolithic_bundle(
        self, sandbox_repo, monkeypatch
    ):
        """A repo with no manifest verifies exactly as it does today."""
        import importlib

        repo, set_dir = sandbox_repo
        register_session_start(set_dir, 1, engine="claude-code",
                               provider="anthropic")
        (repo / "widget.py").write_text("def f(xs): return 1/len(xs)\n",
                                        encoding="utf-8")
        fake = FakeVerifier([make_result(CLEAN_RESPONSE)])
        monkeypatch.setattr(
            importlib.import_module("ai_router.route"), "route", fake
        )
        assert run_round(set_dir) == EXIT_OK
        prompt = fake.calls[0]["prompt"]
        assert "BOUNDED CONTEXT SCOPE" not in prompt
        assert "Complete diff" in prompt

    def test_unresolvable_module_falls_back(self, scoped):
        repo, set_dir, install = scoped
        (repo / "docs" / "modules.yaml").write_text(
            "modules:\n  - slug: other\n    title: Other\n", encoding="utf-8"
        )
        fake = install([make_result(CLEAN_RESPONSE)])
        assert run_round(set_dir) == EXIT_OK
        assert "BOUNDED CONTEXT SCOPE" not in fake.calls[0]["prompt"]

    def test_declared_module_builds_the_scope(self, scoped):
        repo, set_dir, install = scoped
        fake = install([make_result(CLEAN_RESPONSE)])
        assert run_round(set_dir) == EXIT_OK
        prompt = fake.calls[0]["prompt"]
        assert "BOUNDED CONTEXT SCOPE" in prompt
        assert "excluded by default" in prompt
        assert "#### Tier 1 — Modified files" in prompt
        # The change still rides: only the diff says which lines are new.
        assert "#### The change under review" in prompt
        assert "def compute_total(items, scale)" in prompt
        # Tier 2 pulled the caller that lives outside the changed file.
        assert "src/caller.py" in prompt
        assert "def report(rows)" in prompt
        # Tier 3 pulled the test, tier 5 the mapped section only.
        assert "tests/test_widget.py" in prompt
        assert "`compute_total` returns a non-negative integer" in prompt
        assert "Not mapped to the module" not in prompt


class TestRender:
    def test_tiers_are_labelled_and_bounded(self, scoped):
        repo, set_dir, _ = scoped
        scope, ranges, slug = resolve_scope_for_set(repo, set_dir)
        assert slug == "demo"
        rendered = render_scope(scope, changed_ranges=ranges)
        # Tier 4 says, per file, whether it is a surface or the whole file.
        assert "interface surface only" in rendered
        # Tier 7 is names, never contents.
        assert "NAMES ONLY" in rendered
        # Tier 4's Python surface keeps the contract and drops the body.
        assert "def normalize(value):" in rendered
        assert "if value < 0" not in rendered
        # Tier 2 does not oversell a regex match as a call graph.
        assert "not a semantic call graph" in rendered
        # The verifier is told the bound, and how to ask past it.
        assert "CONTEXT-REQUEST:" in rendered
        assert "ESCALATION:" in rendered
        assert "not a verdict" in rendered

    def test_a_file_containing_a_fence_does_not_end_the_block(self, scoped):
        repo, set_dir, _ = scoped
        (repo / "src" / "widget.py").write_text(
            'X = """\n```\nstill inside\n```\n"""\n', encoding="utf-8"
        )
        scope, ranges, _ = resolve_scope_for_set(repo, set_dir)
        rendered = render_scope(scope, changed_ranges=ranges)
        assert "````" in rendered
        assert "still inside" in rendered


class TestRequestParsing:
    DOMAIN = ("src/helper.py", "src/widget.py")

    def test_in_domain_request_is_served_without_justification(self):
        got = parse_context_requests(
            "CONTEXT-REQUEST: src/helper.py", self.DOMAIN
        )
        assert [(r.path, r.kind, r.refusal) for r in got] == [
            ("src/helper.py", "request", "")
        ]

    def test_out_of_domain_request_needs_a_reason(self):
        got = parse_context_requests("CONTEXT-REQUEST: README.md",
                                     self.DOMAIN)
        assert got[0].kind == "escalation"
        assert "not in the domain" in got[0].refusal

    def test_escalation_states_why(self):
        got = parse_context_requests(
            "ESCALATION: README.md -- it documents the contract",
            self.DOMAIN,
        )
        assert (got[0].kind, got[0].refusal) == ("escalation", "")
        assert got[0].reason == "it documents the contract"

    def test_wildcards_and_directories_are_refused(self):
        got = parse_context_requests(
            "CONTEXT-REQUEST: src/*.py\nCONTEXT-REQUEST: src/",
            self.DOMAIN,
        )
        assert len(got) == 2
        assert all("wildcards and bare directories" in r.refusal for r in got)

    def test_an_escalation_already_in_domain_is_just_served(self):
        got = parse_context_requests(
            "ESCALATION: src/helper.py -- I want it", self.DOMAIN
        )
        assert (got[0].kind, got[0].refusal) == ("request", "")

    def test_protocol_echo_is_not_a_request(self):
        got = parse_context_requests(
            "CONTEXT-REQUEST: <exact-repo-relative-path>", self.DOMAIN
        )
        assert got == []

    def test_batch_beyond_the_limit_is_refused_not_dropped(self):
        lines = "\n".join(
            f"CONTEXT-REQUEST: src/f{i}.py"
            for i in range(MAX_REQUESTS_PER_RESPONSE + 3)
        )
        got = parse_context_requests(lines, ())
        assert len(got) == MAX_REQUESTS_PER_RESPONSE + 3
        assert "over the per-response limit" in got[-1].refusal

    def test_markdown_emphasis_is_presentation_not_a_wildcard(self):
        """The bundle renders every file label bold, so a verifier will
        write the request bold too."""
        got = parse_context_requests(
            "**CONTEXT-REQUEST:** `src/helper.py`", self.DOMAIN
        )
        assert [(r.path, r.kind, r.refusal) for r in got] == [
            ("src/helper.py", "request", "")
        ]

    def test_two_unnamed_requests_collapse_to_one_refusal(self):
        got = parse_context_requests(
            "CONTEXT-REQUEST:\nsrc/helper.py\n\nCONTEXT-REQUEST:\n", ()
        )
        assert len(got) == 1
        assert "must name one exact repo-relative path" in got[0].refusal


class TestInDomainPull:
    def test_named_file_is_served_and_the_round_re_dispatches(self, scoped):
        repo, set_dir, install = scoped
        asking = "ISSUES FOUND\n\nCONTEXT-REQUEST: src/helper.py\n"
        fake = install([
            make_result(asking, cost_usd=0.05),
            make_result(CLEAN_RESPONSE, cost_usd=0.02),
        ])
        assert run_round(set_dir) == EXIT_OK
        assert len(fake.calls) == 2
        second = fake.calls[1]["prompt"]
        assert "served mechanically" in second
        assert "if value < 0" in second   # helper's elided body, now whole
        rows = ledger.read_pulls(repo, set_dir.name, 1)
        assert [(r["path"], r["outcome"], r["decider"]) for r in rows] == [
            ("src/helper.py", "served", "scope")
        ]
        # Both dispatches are billed to the round that made them.
        assert ledger.read_rounds(repo, set_dir.name, 1)[0]["cost_usd"] == 0.07
        # The response that asked is kept beside the one that answered.
        assert ledger.raw_output_path(
            repo, set_dir.name, 1, 1, 1
        ).read_text(encoding="utf-8") == asking

    def test_escalation_alone_does_not_buy_a_re_dispatch(self, scoped, capsys):
        repo, set_dir, install = scoped
        fake = install([make_result(
            "ISSUES FOUND\n\n- **Issue 1:** stale caller\n"
            "  - **Severity:** Major\n"
            "ESCALATION: README.md -- it may document the contract\n"
        )])
        assert run_round(set_dir) == EXIT_BLOCKING
        assert len(fake.calls) == 1
        pending = ledger.pending_escalations(repo, set_dir.name, 1)
        assert [(p["path"], p["outcome"]) for p in pending] == [
            ("README.md", "pending")
        ]
        out = capsys.readouterr().out
        assert "orchestrating engine decides" in out
        assert "verify grant" in out

    def test_a_failed_round_can_be_re_run_after_pull_rows_exist(self, scoped):
        """A round that dies after recording its pull rows must not be
        permanently unrunnable — restating a recorded fact is a no-op."""
        repo, set_dir, install = scoped
        asking = "ISSUES FOUND\n\nCONTEXT-REQUEST: src/helper.py\n"
        install([make_result(asking), make_result("x", truncated=True)])
        assert run_round(set_dir) != EXIT_OK
        assert ledger.read_rounds(repo, set_dir.name, 1) == []
        install([make_result(asking), make_result(CLEAN_RESPONSE)])
        assert run_round(set_dir) == EXIT_OK
        assert len(ledger.read_rounds(repo, set_dir.name, 1)) == 1

    def test_requests_in_the_post_pull_response_are_recorded(self, scoped):
        repo, set_dir, install = scoped
        install([
            make_result("ISSUES FOUND\n\nCONTEXT-REQUEST: src/helper.py\n"),
            make_result(
                "VERIFIED\n\nESCALATION: README.md -- now I want this too\n"
            ),
        ])
        assert run_round(set_dir) == EXIT_OK
        pending = ledger.pending_escalations(repo, set_dir.name, 1)
        assert [p["path"] for p in pending] == ["README.md"]


class TestEscalationDecision:
    def _pending(self, scoped):
        repo, set_dir, install = scoped
        install([make_result(
            "ISSUES FOUND\n\n- **Issue 1:** stale caller\n"
            "  - **Severity:** Major\n"
            "ESCALATION: README.md -- it may document the contract\n"
        )])
        run_round(set_dir)
        return repo, set_dir, install

    def test_grant_records_the_deciding_engine(self, scoped):
        repo, set_dir, _ = self._pending(scoped)
        assert decide_escalation(
            set_dir, round_number=1, path="README.md", grant=True
        ) == EXIT_OK
        granted = ledger.granted_paths(repo, set_dir.name, 1)
        assert granted == ["README.md"]
        row = [r for r in ledger.read_pulls(repo, set_dir.name, 1)
               if r["outcome"] == "granted"][0]
        assert row["decider"] == "claude-code (anthropic)"
        assert ledger.pending_escalations(repo, set_dir.name, 1) == []

    def test_a_granted_path_rides_the_next_round(self, scoped):
        repo, set_dir, install = self._pending(scoped)
        decide_escalation(set_dir, round_number=1, path="README.md",
                          grant=True)
        fake = install([make_result(CLEAN_RESPONSE)])
        assert run_round(set_dir) == EXIT_OK
        prompt = fake.calls[0]["prompt"]
        assert "granted by escalation" in prompt
        assert "# Outside the module" in prompt

    def test_refusal_must_say_why(self, scoped):
        repo, set_dir, _ = self._pending(scoped)
        assert decide_escalation(
            set_dir, round_number=1, path="README.md", grant=False
        ) == EXIT_USAGE
        assert ledger.pending_escalations(repo, set_dir.name, 1)

    def test_a_decision_is_final(self, scoped):
        repo, set_dir, _ = self._pending(scoped)
        decide_escalation(set_dir, round_number=1, path="README.md",
                          grant=True)
        assert decide_escalation(
            set_dir, round_number=1, path="README.md", grant=False,
            grounds="changed my mind",
        ) == EXIT_STATE

    def test_only_a_request_the_verifier_made_can_be_decided(self, scoped):
        repo, set_dir, _ = self._pending(scoped)
        assert decide_escalation(
            set_dir, round_number=1, path="config/app.yaml", grant=True
        ) == EXIT_STATE

    def test_a_non_canonical_escalation_still_closes(self, scoped):
        """The pending row and the decision row must share one key, or a
        granted file stays pending forever and can be refused as well."""
        repo, set_dir, install = scoped
        install([make_result(
            "ISSUES FOUND\n\n- **Issue 1:** stale caller\n"
            "  - **Severity:** Major\n"
            "ESCALATION: docs/../README.md -- it may document the contract\n"
        )])
        run_round(set_dir)
        pending = ledger.pending_escalations(repo, set_dir.name, 1)
        assert [p["path"] for p in pending] == ["README.md"]
        assert decide_escalation(
            set_dir, round_number=1, path="README.md", grant=True
        ) == EXIT_OK
        assert ledger.pending_escalations(repo, set_dir.name, 1) == []
        assert decide_escalation(
            set_dir, round_number=1, path="README.md", grant=False,
            grounds="reversing",
        ) == EXIT_STATE
