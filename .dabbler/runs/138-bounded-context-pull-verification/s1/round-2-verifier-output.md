ISSUES FOUND

- **Issue 1:** TypeScript interface extraction strips object return types from function type signatures, and keeps bodies of arrow functions.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/context_scope.py`
  - **Failure scenario:** The extraction heuristic is flawed for arrow functions and function types. For a function type like `type A = (x: string) => { a: number };`, `annotation` is false because there is no `:` after `)`. It hits `tail.endswith("=>")` and elides the object return type, destroying the type contract. For an arrow function with a return type like `const f = (): {a: string} => { return {a: "1"}; }`, `annotation` becomes true at `:`. When it hits the body's `{`, `annotation` is still true, and `tail.endswith("=>")` evaluates to true in `_expects_a_type`. The heuristic treats the body as a type and keeps the entire implementation. Both scenarios are highly probable as they are standard, idiomatic TypeScript constructs.
  - **Acceptance criterion:**
    `python -c "exec('import importlib.util\nspec = importlib.util.spec_from_file_location(\"cs\", \"ai_router/context_scope.py\")\ncs = importlib.util.module_from_spec(spec)\nspec.loader.exec_module(cs)\ns = \"type A = (x: string) => { a: number }; const f = (): {a: string} => { return {a: 1}; }\"\nres, _ = cs.js_interface_surface(s)\nassert \"a: number\" in res and \"return\" not in res, res')"`
  - **Acceptance expectation:** `exit 0`
  - **Details:** **Violation:** The requirement "Bodies are elided; contracts are kept" is broken for arrow functions. **Impact:** Verifiers will receive implementations of arrow functions instead of just the interface, leading to scope bloat. Verifiers will also lose the return types of function type definitions, leading to blind spots. **Evidence:** `js_interface_surface` fails to track whether `=>` is in a type context or a value context. The correct fix requires improved state tracking to distinguish value-level arrow functions from type-level function signatures.

- **Issue 2:** The TypeScript specifier resolver breaks imports in dotfile directories by using `.lstrip("./")`
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/context_scope.py`
  - **Failure scenario:** A TypeScript file inside a dot-prefixed directory (e.g. `.vscode/extension.ts`) uses a relative import (e.g. `import { getConfig } from "./config";`). `posixpath.normpath` yields `.vscode/config.ts`, but `.lstrip("./")` strips both `.` and `/` characters from the left side, mutating the path to `vscode/config.ts`. Because this path does not exist, the file is dropped and the verifier silently loses its interface surface. This is probable because `.vscode` and `.github` are standard repositories directories.
  - **Acceptance criterion:**
    `python -c "exec('import importlib.util\nspec=importlib.util.spec_from_file_location(\"cs\",\"ai_router/context_scope.py\")\ncs=importlib.util.module_from_spec(spec)\nspec.loader.exec_module(cs)\nimport pathlib\nroot=pathlib.Path(\".test_dot\")\nroot.mkdir(exist_ok=True)\n(root/\"h.ts\").touch()\nres=cs._resolve_js_specifier(\"./h.ts\",\".test_dot/m.ts\",pathlib.Path(\".\"))\nassert res == \".test_dot/h.ts\", res')"`
  - **Acceptance expectation:** `exit 0`
  - **Details:** **Violation:** The `_resolve_js_specifier` function improperly mutates valid dot-prefixed directory paths. **Impact:** Relative imports within dotfile directories are silently dropped, violating the requirement that Tier 4 carries interface surface extracted mechanically. **Evidence:** The use of `lstrip("./")` strips a set of characters, not a prefix string. For `.test_dot`, it strips the `.`. The correct fix is to use string slicing or a loop to remove the `./` prefix, as is already done elsewhere in the repo.

NITS

- **Nit:** `_skip_js_literal` does not parse string literals inside template literal expressions (`${}`). If a template literal contains a nested string that happens to contain a `}` (e.g. `` `path: ${config["}"]}` ``), the parser will incorrectly decrement the template depth and prematurely close the literal at the next backtick, potentially unbalancing the entire file's braces.