**ISSUES FOUND**

Fix verdict: L1 environment branch could claim a transport profile dispatch would not use -- fix-accepted  
Fix verdict: L2 -- duplicate-of L4  
Fix verdict: L3 -- duplicate-of L1  
Fix verdict: L4 `--confirm` / `--set` wrote to invocation directory instead of repository root -- fix-accepted  
Fix verdict: L5 explicit config loads can ignore the project file beside that config -- fix-rejected  
Fix verdict: L6 nested project files could override the repository-root file -- fix-accepted

- **Issue 1:** `load_config(path)` still lets the caller’s current repository outrank the explicitly loaded config’s repository.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/config.py:211`, `ai_router/verify_type.py:393`
  - **Failure scenario:** Automation runs from repo A while explicitly loading repo B’s `router-config.yaml`. Repo A has `project-verify-type.txt=DIRECT_API`; repo B has `project-verify-type.txt=COPILOT_CLI`. The current fix calls `derive_transport_profile(config, extra_starts=(config_path.parent,))`, and `derive_transport_profile()` checks `start`/cwd before `extra_starts`, so repo A’s file wins and repo B dispatches as `api`. This is probable because explicit/env config paths are supported specifically for loads from outside the target project, and automation commonly runs from a controlling checkout.
  - **Acceptance criterion:** `python -c "exec('import os\nimport sys\nimport tempfile\nfrom pathlib import Path\nsys.path.insert(0, str(Path.cwd() / \"ai_router\"))\nimport config\nbase = Path(tempfile.mkdtemp())\ncwd_repo = base / \"cwd-repo\"\ntarget_repo = base / \"target-repo\"\nfor repo in (cwd_repo, target_repo):\n    repo.mkdir()\n    (repo / \".git\").mkdir()\n(cwd_repo / \"project-verify-type.txt\").write_text(\"DIRECT_API\\n\", encoding=\"utf-8\")\n(target_repo / \"project-verify-type.txt\").write_text(\"COPILOT_CLI\\n\", encoding=\"utf-8\")\n(target_repo / \"router-config.yaml\").write_text(\"providers: {}\\nmodels: {}\\nrouting:\\n  tier_assignments: {}\\ntransport:\\n  profile: api\\ntransports:\\n  copilot-cli:\\n    lockfile: ai_router/copilot-catalog.lock\\n    roles: {}\\n\", encoding=\"utf-8\")\nos.chdir(cwd_repo)\nprofile = config.load_config(str(target_repo / \"router-config.yaml\"))[\"transport\"][\"profile\"]\nassert profile == \"copilot-cli\", profile')"`
  - **Acceptance expectation:** exit 0
  - **Details:** **Violation:** the fix comment says an explicit/`AI_ROUTER_CONFIG` load “must still honour that project’s committed answer,” but the implementation only adds `config_path.parent` as a fallback after cwd. **Impact:** the merge would still ship the L5 split-brain for external automation whenever the caller is inside another configured repo, causing a Copilot-seat target project to load as direct API. **Evidence:** `config.py` passes the config directory as `extra_starts`, and `verify_type.py` iterates `(start, *extra_starts)`, so the cwd project file is selected before the explicitly loaded config’s project file.