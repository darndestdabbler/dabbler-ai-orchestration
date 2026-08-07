**ISSUES FOUND**

- **Issue 1:** Standard Go test criteria can still auto-close after edited tests move the ruler.
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A verifier in a Go repo writes the normal criterion `go test ./...`; remediation edits `pkg/widget_test.go` so tests pass while product code remains broken. This is probable for Go users because `go test ./...` and `_test.go` files are the standard package-wide test path, and the harness explicitly tries to recognize `go test` via its generic `test` runner token.
  - **Acceptance criterion:** `python -c 'exec("import runpy, sys\nsys.path.insert(0, \"ai_router\")\nah=runpy.run_path(\"ai_router/acceptance_harness.py\")\nargv=ah[\"tokenize_command\"](\"go test ./...\")\nassert ah[\"modified_test_assets_in_scope\"]([\"pkg/widget_test.go\"], ah[\"criterion_scopes\"](argv), runner=ah[\"is_test_runner\"](argv)) == [\"pkg/widget_test.go\"]")'`
  - **Acceptance expectation:** exit 0
  - **Details:** **Violation:** the session contract says “an edited criterion or test asset invalidates the result,” and `_TEST_RUNNER_TOKENS` explicitly includes generic `test` for “`go test`”. **Impact:** the harness can record `auto-closed` for an unfixed Go finding because the remediator edited the test asset the criterion runs. **Evidence:** current code parses `go test ./...` as a test runner but scopes it to `["..."]`, and `is_test_asset("pkg/widget_test.go")` is false; the probe returned `['go', 'test', './...'] ['...'] True []` and failed the assertion above.