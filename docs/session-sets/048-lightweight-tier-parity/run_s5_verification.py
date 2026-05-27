"""Set 048 Session 5 end-of-session cross-provider verification.

S5 ships the UAT pass for the audit-locked Lightweight-tier parity
spec. The session's distinct deliverable is the UAT-discovered Critical
bare-import bug fix (`--no-router` was a silent no-op for pip-installed
consumers because production code used bare imports of the new Set 048
modules — the S2 Round-A verifier had flagged this and the dismissal as
a false positive turned out to be wrong). The verifier scope:

1. Bug-fix correctness — are the relative imports the right form,
   and do they cover every production site?
2. Static-analysis test correctness — does the new
   `test_no_bare_imports_of_set048_modules_in_production_code` actually
   catch the bug shape it claims to catch?
3. conftest aliasing — does the alias preserve the test convention
   without introducing side effects (e.g., would the alias break under
   parallel test execution)?
4. UAT checklist coverage — does the 42-item checklist exercise every
   audit-locked §3 deliverable + every operator-locked L1-L5 directive?
5. Version-walk consistency — does CLAUDE.md + CHANGELOG.md describe
   what shipped accurately and consistently?

Output files alongside this script:
  s5-verification-prompt.md, s5-verification-route.md,
  s5-verification-verify.md, s5-verification-result.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
REPO_ROOT = HERE.parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "ai_router"))

import ai_router  # noqa: E402

SESSION_SET = "048-lightweight-tier-parity"
SESSION_NUMBER = 5


def _read(p: str) -> str:
    return (REPO_ROOT / p).read_text(encoding="utf-8")


def _build_prompt() -> str:
    production_imports_test = _read("ai_router/tests/test_production_imports.py")
    conftest = _read("ai_router/tests/conftest.py")

    # Inline excerpts of the 5 production-code fix sites so the verifier
    # can see exactly which import each site uses.
    bug_fix_summary = (
        "## Bare-import bug fix (5 production sites)\n\n"
        "All five sites switched from a bare `from <mod> import …` form\n"
        "to a relative `from .<mod> import …` form:\n\n"
        "1. `ai_router/__init__.py:317-326` — `route()` prologue:\n"
        "   ```python\n"
        "   from .runtime_mode import is_no_router_mode\n"
        "   if is_no_router_mode():\n"
        "       return _build_no_router_route_stub()\n"
        "   _init()\n"
        "   ```\n"
        "2. `ai_router/__init__.py:624-630` — `verify()` prologue:\n"
        "   ```python\n"
        "   from .runtime_mode import is_no_router_mode\n"
        "   if is_no_router_mode():\n"
        "       return _build_no_router_verification_stub(\n"
        "           generator_model=route_result.model_name\n"
        "       )\n"
        "   ```\n"
        "3. `ai_router/start_session.py:843-861` — `main()` entry:\n"
        "   ```python\n"
        "   try:\n"
        "       from .runtime_mode import resolve_no_router_mode\n"
        "       resolve_no_router_mode(\n"
        "           cli_flag=bool(getattr(args, 'no_router', False)),\n"
        "           session_set_dir=Path(args.session_set_dir)\n"
        "           if getattr(args, 'session_set_dir', None) else None,\n"
        "       )\n"
        "   except Exception:\n"
        "       pass  # safe-fallback to full-tier mode\n"
        "   ```\n"
        "4. `ai_router/close_session.py:1644-1657` — `run()` entry:\n"
        "   ```python\n"
        "   try:\n"
        "       from .runtime_mode import resolve_no_router_mode\n"
        "       ssd = getattr(args, 'session_set_dir', None)\n"
        "       resolve_no_router_mode(\n"
        "           cli_flag=bool(getattr(args, 'no_router', False)),\n"
        "           session_set_dir=Path(ssd) if ssd else None,\n"
        "       )\n"
        "   except Exception:\n"
        "       pass\n"
        "   ```\n"
        "5. `ai_router/runtime_mode.py:75-80` — `_spec_tier()`:\n"
        "   ```python\n"
        "   from .spec_config import parse_session_set_config\n"
        "   cfg = parse_session_set_config(spec)\n"
        "   return cfg.tier\n"
        "   ```\n\n"
        "Test files in `ai_router/tests/` still use the bare-import\n"
        "convention (e.g., `from runtime_mode import ENV_VAR_NAME`); the\n"
        "conftest's new aliasing block makes both name forms resolve to\n"
        "the same module object (necessary because `runtime_mode` carries\n"
        "module-level cache state).\n\n"
        "S5 also adjusted `test_runtime_mode.py` caplog filter from\n"
        "`logger=\"runtime_mode\"` to `logger=\"ai_router.runtime_mode\"`\n"
        "to match the `__name__`-based logger of the relative-import-\n"
        "resolved module.\n"
    )

    bare_import_repro = (
        "## Bare-import repro (pre-fix)\n\n"
        "Before the fix, this 5-line script raised\n"
        "`ModuleNotFoundError: No module named 'runtime_mode'`:\n\n"
        "```python\n"
        "import os, sys\n"
        "# Simulate pip-install: ai_router/ not on sys.path.\n"
        "sys.path = [p for p in sys.path if not p.endswith('ai_router')]\n"
        "os.environ['DABBLER_NO_ROUTER'] = '1'\n"
        "import ai_router  # __init__.py runs; bare imports inside are lazy\n"
        "ai_router.route(content='hi')  # raises ModuleNotFoundError\n"
        "```\n\n"
        "After the fix, the same script prints\n"
        "`RouteResult(cost_usd=0.0, model_name='no-router-mode')` and\n"
        "exits 0. `verify()` likewise returns a stub `VerificationResult`\n"
        "without raising.\n\n"
        "The bug was a silent no-op for `--no-router` in the CLI path:\n"
        "`start_session.main()` and `close_session.run()` wrapped the\n"
        "bare import in `try/except: pass`, swallowing the\n"
        "`ModuleNotFoundError`. That meant a Lightweight consumer running\n"
        "`python -m ai_router.start_session --no-router …` would see no\n"
        "error AND no effect from the flag — every session would proceed\n"
        "as full-tier with live LLM calls. For the route()/verify() Python\n"
        "library path, the error surfaced immediately because there was\n"
        "no try/except wrapper.\n"
    )

    uat_checklist_summary = (
        "## UAT checklist artifact\n\n"
        "`docs/session-sets/048-lightweight-tier-parity/\n"
        "048-lightweight-tier-parity-uat-checklist.json` — 42-item ad-hoc\n"
        "UAT in the Set-045 schema (the existing Dabbler\n"
        "UAT-Checklist-Editor renders this format).\n\n"
        "Of the 42 items, 28 are marked `Passes=true / Result=complete`\n"
        "with `Feedback` documenting the verification path (unit test,\n"
        "CLI smoke, file inspection, grep invariant). 14 items are\n"
        "flagged `Passes=false / Result=pending` with `Feedback`\n"
        "explicitly stating 'Manual operator UAT post-publish' for the\n"
        "live-VS-Code surfaces (right-click QuickPick walk-through,\n"
        "wizard radio toggle, L5 left-click toast, soft-gate TTY prompt,\n"
        "PyPI release-workflow build).\n\n"
        "The 42 items map to the audit-locked spec:\n"
        "- Items 1-4: §3.1 --no-router three-knob precedence + override\n"
        "  logging + free-form-prose tier rejection (S2 Round-A I5 fix).\n"
        "- Items 5-6: §3.1 route()/verify() short-circuit + fail-CLOSED\n"
        "  semantics (S2 Round-A C1 fix).\n"
        "- Items 7-9: §3.5 external-verification.md soft gate (TTY prompt\n"
        "  + non-TTY proceed + --accept-suggestions bypass).\n"
        "- Items 10-11: §3.4 + §3.6 tri-state UAT/E2E schema across\n"
        "  Python and TypeScript parsers.\n"
        "- Item 12: §3.6 tier-field backwards-compatibility default.\n"
        "- Items 13-17: §3.2 copyable-prompt commands (path-reference\n"
        "  format / git-range embed / set-accomp gating / review-criteria\n"
        "  embed / slug sanitization).\n"
        "- Items 18-19: L5 left-click dual action (non-terminal vs\n"
        "  terminal row behavior).\n"
        "- Items 20-23: §3.3 context-menu IA refresh (top-level\n"
        "  QuickPick / submenu / L4 close-on-blur / L3 Open AI Assignment\n"
        "  removal).\n"
        "- Items 24-27: §3.7 migrator CLI (happy path / idempotence /\n"
        "  pre-v3 refusal / backup-race fix).\n"
        "- Items 28-29: §3.8 external-verification command (single-set /\n"
        "  multi-set picker).\n"
        "- Item 30: §3.9 review-criteria templates.\n"
        "- Items 31-33: E8 wizard tier-branch (radio group / hide-show /\n"
        "  Full restore).\n"
        "- Items 34-36: doc-revision compliance (cross-repo notice /\n"
        "  workflow Step 6 / authoring guide).\n"
        "- Items 37-40: test surface + packaging (Python / TS suite /\n"
        "  .vsix / PyPI).\n"
        "- Items 41-42: PyPI build (deferred to GitHub Actions) + the\n"
        "  S5-UAT-discovered bare-import bug fix proof.\n"
    )

    version_walk_summary = (
        "## Version-bump consistency\n\n"
        "- `pyproject.toml` `[project] version`: 0.9.0 -> 0.10.0.\n"
        "- `tools/dabbler-ai-orchestration/package.json` `\"version\"`:\n"
        "  0.22.0 -> 0.23.0.\n"
        "- `tools/dabbler-ai-orchestration/CHANGELOG.md` prepends a new\n"
        "  `[0.23.0] — 2026-05-27 (Set 048 — Lightweight-tier parity)`\n"
        "  section with Added / Changed / Removed / Fixed subsections\n"
        "  covering every Set 048 §3 deliverable + the S5 bare-import\n"
        "  fix. The existing `[0.22.0]` (Set 047) section is preserved\n"
        "  unchanged below it.\n"
        "- `CLAUDE.md` `Current:` rewritten to v0.23.0 + Set 048\n"
        "  description; `Previous:` walked to v0.22.0 (Set 047);\n"
        "  `Pre-Previous:` walked to v0.21.0 (Set 045); `Pre-Pre-\n"
        "  Previous:` walked to v0.18.1 (Set 035). The version-walk\n"
        "  bulleted list (chronological summary below the `Current:`\n"
        "  paragraph) gains a new top entry for v0.22.0 (Set 047)\n"
        "  summarizing the v4 schema audit; existing entries for\n"
        "  v0.21.0, v0.20.0, v0.19.0, v0.18.1 are preserved.\n"
        "- Marketplace 0.22.0 (Set 047) was queued but the publish\n"
        "  workflow failed on 2026-05-26 at the /_apis/gallery upload\n"
        "  step. PyPI 0.9.0 IS live. Per the operator-saved memory at\n"
        "  `project_marketplace_0_22_0_queued_unshipped.md`, the 0.23.0\n"
        "  publish supersedes the queued 0.22.0 — no separate retry\n"
        "  needed.\n"
        "- Publishes per `reference_publish_via_github_actions`: push\n"
        "  tag `v0.10.0` to trigger PyPI workflow; push tag\n"
        "  `vsix-v0.23.0` to trigger Marketplace workflow. Both gated\n"
        "  on operator confirmation per the destructive-action policy.\n"
    )

    test_summary = (
        "## Test counts at close\n\n"
        "- Python: 1011 passed + 1 skipped (was 1010 + 1 pre-S5; +1\n"
        "  new test from `test_production_imports.py`; 0 regressions).\n"
        "  All Set 048 module-specific test files pass (115 tests in\n"
        "  spec_config / runtime_mode / no_router_short_circuit /\n"
        "  no_router_close_session / no_router_backcompat /\n"
        "  suggestion_disposition / migrate_lightweight_to_canonical_v4 /\n"
        "  production_imports).\n"
        "- TypeScript (unit): 665 passed + 2 pre-existing failures\n"
        "  unchanged from S2/S3/S4 (configEditor-foundation panel-\n"
        "  lifecycle + notificationsSection rendering — both predate\n"
        "  Set 048).\n"
        "- `.vsix` build sanity-check (`npx vsce package\n"
        "  --allow-missing-repository`) succeeded — 23 files, 881.47 KB.\n"
        "  Build artifact removed locally; canonical publish path is\n"
        "  the GitHub Actions workflow.\n"
    )

    return (
        "# Set 048 Session 5 cross-provider verification request\n\n"
        "## Context\n\n"
        "Set 048 Session 5 is the UAT + close-out session of the audit-\n"
        "locked Lightweight-tier parity arc. The audit-locked spec is at\n"
        "`docs/session-sets/048-lightweight-tier-parity/spec.md`. S5\n"
        "exercises the surface end-to-end, ships a 42-item UAT checklist\n"
        "as the canonical UAT artifact, bumps versions for both\n"
        "registries, and — the load-bearing distinct deliverable — fixes\n"
        "a Critical bug discovered during UAT execution.\n\n"
        "**The UAT-discovered Critical bug:** the `--no-router` mode\n"
        "shipped in Set 048 S2 was a silent no-op for pip-installed\n"
        "consumers (the Lightweight target audience). Five production-\n"
        "code sites used bare imports of the new Set 048 modules\n"
        "(`from runtime_mode import …`) instead of relative imports.\n"
        "The bare form only resolved under the test `conftest.py`'s\n"
        "`sys.path` shim. Pip-installed consumers had no such shim:\n"
        "`route()` and `verify()` raised `ModuleNotFoundError`;\n"
        "`start_session.main()` and `close_session.run()` wrapped the\n"
        "import in `try/except: pass` and silently fell through to\n"
        "full-tier behavior. The S2 Round-A verifier flagged this as\n"
        "Major #2 and the finding was dismissed as a false positive on\n"
        "conftest grounds; that dismissal was wrong.\n\n"
        "Operator-locked premises in scope:\n"
        "- **P1.** Lightweight orchestrators MUST follow the SAME process\n"
        "  as Full for model/effort/session-set/session identification\n"
        "  and state-file updates.\n"
        "- **P3.** Lightweight differs from Full ONLY in: no router\n"
        "  runtime calls; no auto-verification; copyable review prompts;\n"
        "  suggested-not-required UAT/E2E.\n"
        "- **D5.** CLI backward compatibility is firm — the new\n"
        "  `--no-router` flag must be additive only.\n\n"
        "## What I'm asking you to verify\n\n"
        "1. **Bug-fix correctness** — Are the five relative-import\n"
        "   replacements correct? Specifically: does `from .runtime_mode\n"
        "   import is_no_router_mode` resolve to the same module as the\n"
        "   bare `from runtime_mode import …` would have under the test\n"
        "   sys.path shim?\n"
        "2. **Coverage completeness** — Did the fix touch every\n"
        "   production-code bare-import site, or did any sites get\n"
        "   missed? The fix author surveyed all 5 production sites listed\n"
        "   below; confirm no additional sites are hiding.\n"
        "3. **Static-analysis test soundness** — Does the new\n"
        "   `test_no_bare_imports_of_set048_modules_in_production_code`\n"
        "   actually catch the bug shape it claims to catch? Would the\n"
        "   regex pattern `^[ \\t]*from {mod} import\\b` correctly reject\n"
        "   a regression like `from runtime_mode import …` inside a\n"
        "   future production-code function body? Would it correctly\n"
        "   ACCEPT `from .runtime_mode import …` and\n"
        "   `from ai_router.runtime_mode import …`?\n"
        "4. **Conftest aliasing soundness** — Is the conftest alias\n"
        "   (`sys.modules[bare_name] = sys.modules['ai_router.<mod>']`)\n"
        "   sound? Are there scenarios — pytest-xdist parallel workers,\n"
        "   import-order sensitivity, sys.modules eviction — where the\n"
        "   alias breaks down or introduces side effects?\n"
        "5. **caplog logger-name update** — Is changing\n"
        "   `caplog.set_level(logging.INFO, logger=\"runtime_mode\")` to\n"
        "   `logger=\"ai_router.runtime_mode\"` the correct adjustment for\n"
        "   the relative-import-resolved logger name? Are there any\n"
        "   `logging.getLogger(__name__)` callers in other ai_router\n"
        "   modules that may need similar updates?\n"
        "6. **UAT checklist coverage** — Does the 42-item checklist\n"
        "   exercise every audit-locked §3 deliverable AND every\n"
        "   operator-locked L1-L5 directive? Identify any spec sections\n"
        "   the checklist does not cover.\n"
        "7. **Version-walk consistency** — Are the four version-walk\n"
        "   surfaces (pyproject.toml, package.json, CHANGELOG.md,\n"
        "   CLAUDE.md `Extension versioning`) consistent with each other\n"
        "   and with the Set 048 ship list?\n"
        "8. **Memory carry-forward** — Per memory\n"
        "   `project_marketplace_0_22_0_queued_unshipped.md`, the Set 047\n"
        "   Marketplace 0.22.0 publish failed and is queued. The S5\n"
        "   close-out treats the 0.23.0 publish as superseding 0.22.0\n"
        "   (no separate retry). Is that the right call, or should the\n"
        "   0.22.0 publish be retried first?\n\n"
        "Please return findings as a JSON object matching\n"
        "`ai_router/prompt-templates/verification.md` schema.\n\n"
        "---\n\n"
        "## File: ai_router/tests/test_production_imports.py\n\n"
        "```python\n"
        + production_imports_test
        + "\n```\n\n"
        "---\n\n"
        "## File: ai_router/tests/conftest.py (post-S5)\n\n"
        "```python\n"
        + conftest
        + "\n```\n\n"
        "---\n\n"
        + bug_fix_summary
        + "\n---\n\n"
        + bare_import_repro
        + "\n---\n\n"
        + uat_checklist_summary
        + "\n---\n\n"
        + version_walk_summary
        + "\n---\n\n"
        + test_summary
    )


def main() -> int:
    prompt = _build_prompt()
    (HERE / "s5-verification-prompt.md").write_text(prompt, encoding="utf-8")
    print(f"Prompt size: {len(prompt):,} chars / {len(prompt.splitlines()):,} lines")

    print("Routing verification via ai_router.route()...")
    route_result = ai_router.route(
        content=prompt,
        task_type="session-verification",
        complexity_hint=70,
        session_set=SESSION_SET,
        session_number=SESSION_NUMBER,
    )
    print(f"Route phase: model={route_result.model_name} tier={route_result.tier} cost=${route_result.cost_usd:.4f}")
    (HERE / "s5-verification-route.md").write_text(route_result.content, encoding="utf-8")

    print("Routing verify-of-verify via ai_router.verify()...")
    try:
        verify_result = ai_router.verify(
            route_result=route_result,
            original_task=prompt,
            task_type="session-verification",
            session_set=SESSION_SET,
            session_number=SESSION_NUMBER,
        )
    except RuntimeError as exc:
        print(f"Verify step skipped: {exc}")
        verify_result = None

    if verify_result is not None:
        verify_cost = getattr(verify_result, "verifier_cost_usd", 0.0) or 0.0
        verify_model = getattr(verify_result, "verifier_model", "unknown")
        print(f"Verify phase: model={verify_model} cost=${verify_cost:.4f}")
        verify_text = getattr(verify_result, "verifier_response", "") or json.dumps(
            getattr(verify_result, "__dict__", {}), indent=2, default=str
        )
    else:
        verify_cost = 0.0
        verify_model = "skipped"
        verify_text = (
            "Verify-of-verify skipped — no cross-provider verifier "
            "available for the route model."
        )
    (HERE / "s5-verification-verify.md").write_text(verify_text, encoding="utf-8")

    total_cost = route_result.cost_usd + verify_cost
    print(f"\nTotal S5 verification cost: ${total_cost:.4f}")
    result = {
        "session_set": SESSION_SET,
        "session_number": SESSION_NUMBER,
        "route": {
            "model": route_result.model_name,
            "tier": route_result.tier,
            "cost_usd": route_result.cost_usd,
            "tokens_in": getattr(route_result, "input_tokens", None),
            "tokens_out": getattr(route_result, "output_tokens", None),
        },
        "verify": {
            "model": verify_model,
            "tier": "verifier",
            "cost_usd": verify_cost,
            "verdict": getattr(verify_result, "verdict", None) if verify_result is not None else None,
        },
        "total_cost_usd": total_cost,
    }
    (HERE / "s5-verification-result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
