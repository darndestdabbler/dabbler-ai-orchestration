from ai_router.facts import (
    CONTROL_KINDS,
    STATUS_NOT_APPLICABLE,
    STATUS_PASS,
    STATUS_UNKNOWN,
    collect_control_facts,
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


def test_changed_lines_are_the_lines_the_diff_adds():
    """Review context, in the post-image numbering a reader can go and look
    at. A deleted file contributes nothing: none of its lines exist in the
    tree under review."""
    changed = parse_changed_lines(DIFF)

    assert changed["ai_router/widget.py"] == (4, 5, 11)
    assert changed["README.md"] == (2,)
    assert "ai_router/gone.py" not in changed


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
