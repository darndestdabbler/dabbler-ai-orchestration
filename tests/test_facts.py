import json

from ai_router.facts import (
    CONTROL_KINDS,
    COVERAGE_MEASURED,
    STATUS_NOT_APPLICABLE,
    STATUS_PASS,
    STATUS_UNKNOWN,
    collect_control_facts,
    load_executed_lines,
    measure_changed_line_coverage,
    parse_changed_lines,
)

DIFF = """diff --git a/ai_router/widget.py b/ai_router/widget.py
--- a/ai_router/widget.py
+++ b/ai_router/widget.py
@@ -3,0 +4,2 @@ def f():
+    a = 1
+    b = 2
@@ -9 +11 @@ def g():
-    return None
+    return 0
diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1,0 +2 @@
+a documentation line
diff --git a/ai_router/gone.py b/ai_router/gone.py
--- a/ai_router/gone.py
+++ /dev/null
@@ -1,3 +0,0 @@
-one
-two
-three
"""


def _report(tmp_path, files):
    """A coverage.py JSON export. ``files`` maps a path to
    ``(executed, missing)`` line lists."""
    path = tmp_path / "coverage.json"
    path.write_text(
        json.dumps({
            "files": {
                name: {"executed_lines": executed, "missing_lines": missing}
                for name, (executed, missing) in files.items()
            }
        }),
        encoding="utf-8",
    )
    return path


def test_changed_line_coverage_names_the_lines_no_test_executed(tmp_path):
    """The fact set 144 leans on: which changed lines ran, which did not.

    Three things are deliberately outside the ratio. A deleted file's lines
    cannot be executed. A changed path the report does not name -- markdown
    here -- is not a coverage question at all. And a changed line coverage
    never tracked as a statement, such as line 5's comment, is not a gap."""
    changed = parse_changed_lines(DIFF)
    assert changed["ai_router/widget.py"] == (4, 5, 11)
    assert "ai_router/gone.py" not in changed

    executed = load_executed_lines(tmp_path, _report(tmp_path, {
        "ai_router/widget.py": ([4, 40], [11]),
    }))
    coverage = measure_changed_line_coverage(changed, executed)

    assert coverage.status == COVERAGE_MEASURED
    assert coverage.changed_lines == 4      # every added line, README included
    assert coverage.measured_lines == 2     # only lines 4 and 11 are statements
    assert coverage.covered_lines == 1
    assert coverage.uncovered == (("ai_router/widget.py", (11,)),)


def test_coverage_without_a_usable_report_is_unknown_never_measured(tmp_path):
    """No report is not "everything covered", and neither is a report that
    names nothing. Both read UNKNOWN, and the absent-report detail names the
    knob that would make it measurable."""
    changed = parse_changed_lines(DIFF)

    absent = measure_changed_line_coverage(changed, None)
    assert absent.status == STATUS_UNKNOWN
    assert absent.changed_lines == 4
    assert "testing.coverage.report" in absent.detail

    empty = measure_changed_line_coverage(
        changed, load_executed_lines(tmp_path, _report(tmp_path, {}))
    )
    assert empty.status == STATUS_UNKNOWN
    assert empty.covered_lines == 0

def test_an_undeclared_control_is_not_applicable_never_pass(tmp_path):
    """A control this repository does not run must not leave a green row
    behind. Every kind appears, and an absent one says so in its own word."""
    facts, errors = collect_control_facts(tmp_path, {"testing": {}})
    assert errors == ()
    assert {f.kind for f in facts} == set(CONTROL_KINDS)
    assert {f.status for f in facts} == {STATUS_NOT_APPLICABLE}


def test_a_control_that_cannot_be_executed_is_unknown_and_blocks(tmp_path):
    """The dangerous direction is a missing tool reading as success. It reads
    UNKNOWN, and a required UNKNOWN is red: only the author can turn "the
    tool never ran" into an answer."""
    config = {"testing": {"controls": [
        {"kind": "lint", "command": "definitely-not-a-real-binary --check",
         "required": True},
        {"kind": "compile", "command": "python -c pass"},
    ]}}
    facts, errors = collect_control_facts(tmp_path, config)
    assert errors == ()
    by_kind = {f.kind: f for f in facts}
    assert by_kind["lint"].status == STATUS_UNKNOWN
    assert by_kind["lint"].red is True
    assert by_kind["compile"].status == STATUS_PASS
    assert by_kind["typecheck"].status == STATUS_NOT_APPLICABLE
