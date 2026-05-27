# Set 048 Session 5 cross-provider verification request

## Context

Set 048 Session 5 is the UAT + close-out session of the audit-
locked Lightweight-tier parity arc. The audit-locked spec is at
`docs/session-sets/048-lightweight-tier-parity/spec.md`. S5
exercises the surface end-to-end, ships a 42-item UAT checklist
as the canonical UAT artifact, bumps versions for both
registries, and — the load-bearing distinct deliverable — fixes
a Critical bug discovered during UAT execution.

**The UAT-discovered Critical bug:** the `--no-router` mode
shipped in Set 048 S2 was a silent no-op for pip-installed
consumers (the Lightweight target audience). Five production-
code sites used bare imports of the new Set 048 modules
(`from runtime_mode import …`) instead of relative imports.
The bare form only resolved under the test `conftest.py`'s
`sys.path` shim. Pip-installed consumers had no such shim:
`route()` and `verify()` raised `ModuleNotFoundError`;
`start_session.main()` and `close_session.run()` wrapped the
import in `try/except: pass` and silently fell through to
full-tier behavior. The S2 Round-A verifier flagged this as
Major #2 and the finding was dismissed as a false positive on
conftest grounds; that dismissal was wrong.

Operator-locked premises in scope:
- **P1.** Lightweight orchestrators MUST follow the SAME process
  as Full for model/effort/session-set/session identification
  and state-file updates.
- **P3.** Lightweight differs from Full ONLY in: no router
  runtime calls; no auto-verification; copyable review prompts;
  suggested-not-required UAT/E2E.
- **D5.** CLI backward compatibility is firm — the new
  `--no-router` flag must be additive only.

## What I'm asking you to verify

1. **Bug-fix correctness** — Are the five relative-import
   replacements correct? Specifically: does `from .runtime_mode
   import is_no_router_mode` resolve to the same module as the
   bare `from runtime_mode import …` would have under the test
   sys.path shim?
2. **Coverage completeness** — Did the fix touch every
   production-code bare-import site, or did any sites get
   missed? The fix author surveyed all 5 production sites listed
   below; confirm no additional sites are hiding.
3. **Static-analysis test soundness** — Does the new
   `test_no_bare_imports_of_set048_modules_in_production_code`
   actually catch the bug shape it claims to catch? Would the
   regex pattern `^[ \t]*from {mod} import\b` correctly reject
   a regression like `from runtime_mode import …` inside a
   future production-code function body? Would it correctly
   ACCEPT `from .runtime_mode import …` and
   `from ai_router.runtime_mode import …`?
4. **Conftest aliasing soundness** — Is the conftest alias
   (`sys.modules[bare_name] = sys.modules['ai_router.<mod>']`)
   sound? Are there scenarios — pytest-xdist parallel workers,
   import-order sensitivity, sys.modules eviction — where the
   alias breaks down or introduces side effects?
5. **caplog logger-name update** — Is changing
   `caplog.set_level(logging.INFO, logger="runtime_mode")` to
   `logger="ai_router.runtime_mode"` the correct adjustment for
   the relative-import-resolved logger name? Are there any
   `logging.getLogger(__name__)` callers in other ai_router
   modules that may need similar updates?
6. **UAT checklist coverage** — Does the 42-item checklist
   exercise every audit-locked §3 deliverable AND every
   operator-locked L1-L5 directive? Identify any spec sections
   the checklist does not cover.
7. **Version-walk consistency** — Are the four version-walk
   surfaces (pyproject.toml, package.json, CHANGELOG.md,
   CLAUDE.md `Extension versioning`) consistent with each other
   and with the Set 048 ship list?
8. **Memory carry-forward** — Per memory
   `project_marketplace_0_22_0_queued_unshipped.md`, the Set 047
   Marketplace 0.22.0 publish failed and is queued. The S5
   close-out treats the 0.23.0 publish as superseding 0.22.0
   (no separate retry). Is that the right call, or should the
   0.22.0 publish be retried first?

Please return findings as a JSON object matching
`ai_router/prompt-templates/verification.md` schema.

---

## File: ai_router/tests/test_production_imports.py

```python
"""Code-review-time invariant: production code must not bare-import Set 048 modules.

Set 048 S5 UAT discovered that ``ai_router/__init__.py``,
``ai_router/start_session.py``, ``ai_router/close_session.py``, and
``ai_router/runtime_mode.py`` used bare imports of the new Set 048
modules (``from runtime_mode import …``, ``from spec_config import …``).
Those bare forms only resolve under the test ``conftest.py`` ``sys.path``
shim — pip-installed package consumers (the Lightweight target audience)
have no such shim, so the imports raised ``ModuleNotFoundError``. The
``route()`` / ``verify()`` call sites blew up outright; the
``start_session.main()`` / ``close_session.run()`` sites silently
swallowed the error in ``try/except``, so ``--no-router`` was a no-op
across the entire production CLI surface.

The original S2 Round-A verifier flagged this as Major #2 and the
finding was dismissed as a false positive on conftest grounds; that
dismissal was wrong. This test exists so the dismissal cannot recur.

The fix: production code uses relative imports (``from .runtime_mode
import …``). Tests retain the bare form for convention; conftest
remains responsible for the test-only ``sys.path`` shim.
"""

import re
from pathlib import Path

AI_ROUTER_DIR = Path(__file__).resolve().parent.parent
SET_048_MODULES = (
    "runtime_mode",
    "spec_config",
    "suggestion_disposition",
    "migrate_lightweight_to_canonical_v4",
)


def test_no_bare_imports_of_set048_modules_in_production_code():
    bad: list[tuple[str, int, str]] = []
    for py_file in AI_ROUTER_DIR.glob("*.py"):
        text = py_file.read_text(encoding="utf-8")
        for lineno, line in enumerate(text.splitlines(), start=1):
            for mod in SET_048_MODULES:
                # Match `from <mod> import` at start of line (with optional
                # leading whitespace for inside-function imports). Reject
                # the bare form; allow `from .<mod>` and `from ai_router.<mod>`.
                if re.match(rf"^[ \t]*from {re.escape(mod)} import\b", line):
                    bad.append((py_file.name, lineno, line.strip()))

    assert not bad, (
        "Production code in ai_router/ has bare imports of Set 048 modules. "
        "These work under the test conftest's sys.path shim but raise "
        "ModuleNotFoundError under pip-install (the Lightweight consumer "
        "target). Use `from .<module> import …` (relative) or "
        "`from ai_router.<module> import …` (absolute) instead.\n"
        f"Offenders:\n  " + "\n  ".join(f"{fn}:{ln}  {src}" for fn, ln, src in bad)
    )

```

---

## File: ai_router/tests/conftest.py (post-S5)

```python
"""Pytest config for the ai_router test suite.

Tests put the package directory itself on ``sys.path`` and import
modules by bare filename (``import session_state``). This pattern
predates the package's PEP 621 install path; with the package now
installable via ``pip install -e .``,
``import ai_router.session_state`` also works. Either form is
supported; the bare-filename form remains the test convention for
consistency with existing test files.

Set 048 S5: production code (``ai_router/__init__.py``,
``start_session.py``, ``close_session.py``, ``runtime_mode.py``) was
discovered to use bare imports of the Set 048 modules
(``runtime_mode``, ``spec_config``, ``suggestion_disposition``,
``migrate_lightweight_to_canonical_v4``). Those bare imports only
worked under the test sys.path shim above — pip-installed consumers
hit ``ModuleNotFoundError``. Production code now uses relative
imports (``from .runtime_mode import …``). The Set 048 modules carry
module-level cache state (``runtime_mode``'s resolved no-router
decision), so the test-side bare import and the production-side
relative import must resolve to the SAME module object. The aliasing
below ensures that.
"""

import importlib
import sys
from pathlib import Path

AI_ROUTER_DIR = Path(__file__).resolve().parent.parent
if str(AI_ROUTER_DIR) not in sys.path:
    sys.path.insert(0, str(AI_ROUTER_DIR))

# Set 048 modules with module-level cache state must share a single
# module-object identity between the bare-name (test convention) and
# package-qualified (production) import paths. Without this aliasing,
# ``runtime_mode.resolve_no_router_mode(...)`` from a test sets the
# cache in ``sys.modules['runtime_mode']`` but ``ai_router.route()``
# (which does ``from .runtime_mode import is_no_router_mode``) reads
# from the distinct ``sys.modules['ai_router.runtime_mode']`` cache.
_SHARED_MODULE_NAMES = (
    "runtime_mode",
    "spec_config",
    "suggestion_disposition",
    "migrate_lightweight_to_canonical_v4",
)
for _name in _SHARED_MODULE_NAMES:
    _pkg = importlib.import_module(f"ai_router.{_name}")
    sys.modules[_name] = _pkg

```

---

## Bare-import bug fix (5 production sites)

All five sites switched from a bare `from <mod> import …` form
to a relative `from .<mod> import …` form:

1. `ai_router/__init__.py:317-326` — `route()` prologue:
   ```python
   from .runtime_mode import is_no_router_mode
   if is_no_router_mode():
       return _build_no_router_route_stub()
   _init()
   ```
2. `ai_router/__init__.py:624-630` — `verify()` prologue:
   ```python
   from .runtime_mode import is_no_router_mode
   if is_no_router_mode():
       return _build_no_router_verification_stub(
           generator_model=route_result.model_name
       )
   ```
3. `ai_router/start_session.py:843-861` — `main()` entry:
   ```python
   try:
       from .runtime_mode import resolve_no_router_mode
       resolve_no_router_mode(
           cli_flag=bool(getattr(args, 'no_router', False)),
           session_set_dir=Path(args.session_set_dir)
           if getattr(args, 'session_set_dir', None) else None,
       )
   except Exception:
       pass  # safe-fallback to full-tier mode
   ```
4. `ai_router/close_session.py:1644-1657` — `run()` entry:
   ```python
   try:
       from .runtime_mode import resolve_no_router_mode
       ssd = getattr(args, 'session_set_dir', None)
       resolve_no_router_mode(
           cli_flag=bool(getattr(args, 'no_router', False)),
           session_set_dir=Path(ssd) if ssd else None,
       )
   except Exception:
       pass
   ```
5. `ai_router/runtime_mode.py:75-80` — `_spec_tier()`:
   ```python
   from .spec_config import parse_session_set_config
   cfg = parse_session_set_config(spec)
   return cfg.tier
   ```

Test files in `ai_router/tests/` still use the bare-import
convention (e.g., `from runtime_mode import ENV_VAR_NAME`); the
conftest's new aliasing block makes both name forms resolve to
the same module object (necessary because `runtime_mode` carries
module-level cache state).

S5 also adjusted `test_runtime_mode.py` caplog filter from
`logger="runtime_mode"` to `logger="ai_router.runtime_mode"`
to match the `__name__`-based logger of the relative-import-
resolved module.

---

## Bare-import repro (pre-fix)

Before the fix, this 5-line script raised
`ModuleNotFoundError: No module named 'runtime_mode'`:

```python
import os, sys
# Simulate pip-install: ai_router/ not on sys.path.
sys.path = [p for p in sys.path if not p.endswith('ai_router')]
os.environ['DABBLER_NO_ROUTER'] = '1'
import ai_router  # __init__.py runs; bare imports inside are lazy
ai_router.route(content='hi')  # raises ModuleNotFoundError
```

After the fix, the same script prints
`RouteResult(cost_usd=0.0, model_name='no-router-mode')` and
exits 0. `verify()` likewise returns a stub `VerificationResult`
without raising.

The bug was a silent no-op for `--no-router` in the CLI path:
`start_session.main()` and `close_session.run()` wrapped the
bare import in `try/except: pass`, swallowing the
`ModuleNotFoundError`. That meant a Lightweight consumer running
`python -m ai_router.start_session --no-router …` would see no
error AND no effect from the flag — every session would proceed
as full-tier with live LLM calls. For the route()/verify() Python
library path, the error surfaced immediately because there was
no try/except wrapper.

---

## UAT checklist artifact

`docs/session-sets/048-lightweight-tier-parity/
048-lightweight-tier-parity-uat-checklist.json` — 42-item ad-hoc
UAT in the Set-045 schema (the existing Dabbler
UAT-Checklist-Editor renders this format).

Of the 42 items, 28 are marked `Passes=true / Result=complete`
with `Feedback` documenting the verification path (unit test,
CLI smoke, file inspection, grep invariant). 14 items are
flagged `Passes=false / Result=pending` with `Feedback`
explicitly stating 'Manual operator UAT post-publish' for the
live-VS-Code surfaces (right-click QuickPick walk-through,
wizard radio toggle, L5 left-click toast, soft-gate TTY prompt,
PyPI release-workflow build).

The 42 items map to the audit-locked spec:
- Items 1-4: §3.1 --no-router three-knob precedence + override
  logging + free-form-prose tier rejection (S2 Round-A I5 fix).
- Items 5-6: §3.1 route()/verify() short-circuit + fail-CLOSED
  semantics (S2 Round-A C1 fix).
- Items 7-9: §3.5 external-verification.md soft gate (TTY prompt
  + non-TTY proceed + --accept-suggestions bypass).
- Items 10-11: §3.4 + §3.6 tri-state UAT/E2E schema across
  Python and TypeScript parsers.
- Item 12: §3.6 tier-field backwards-compatibility default.
- Items 13-17: §3.2 copyable-prompt commands (path-reference
  format / git-range embed / set-accomp gating / review-criteria
  embed / slug sanitization).
- Items 18-19: L5 left-click dual action (non-terminal vs
  terminal row behavior).
- Items 20-23: §3.3 context-menu IA refresh (top-level
  QuickPick / submenu / L4 close-on-blur / L3 Open AI Assignment
  removal).
- Items 24-27: §3.7 migrator CLI (happy path / idempotence /
  pre-v3 refusal / backup-race fix).
- Items 28-29: §3.8 external-verification command (single-set /
  multi-set picker).
- Item 30: §3.9 review-criteria templates.
- Items 31-33: E8 wizard tier-branch (radio group / hide-show /
  Full restore).
- Items 34-36: doc-revision compliance (cross-repo notice /
  workflow Step 6 / authoring guide).
- Items 37-40: test surface + packaging (Python / TS suite /
  .vsix / PyPI).
- Items 41-42: PyPI build (deferred to GitHub Actions) + the
  S5-UAT-discovered bare-import bug fix proof.

---

## Version-bump consistency

- `pyproject.toml` `[project] version`: 0.9.0 -> 0.10.0.
- `tools/dabbler-ai-orchestration/package.json` `"version"`:
  0.22.0 -> 0.23.0.
- `tools/dabbler-ai-orchestration/CHANGELOG.md` prepends a new
  `[0.23.0] — 2026-05-27 (Set 048 — Lightweight-tier parity)`
  section with Added / Changed / Removed / Fixed subsections
  covering every Set 048 §3 deliverable + the S5 bare-import
  fix. The existing `[0.22.0]` (Set 047) section is preserved
  unchanged below it.
- `CLAUDE.md` `Current:` rewritten to v0.23.0 + Set 048
  description; `Previous:` walked to v0.22.0 (Set 047);
  `Pre-Previous:` walked to v0.21.0 (Set 045); `Pre-Pre-
  Previous:` walked to v0.18.1 (Set 035). The version-walk
  bulleted list (chronological summary below the `Current:`
  paragraph) gains a new top entry for v0.22.0 (Set 047)
  summarizing the v4 schema audit; existing entries for
  v0.21.0, v0.20.0, v0.19.0, v0.18.1 are preserved.
- Marketplace 0.22.0 (Set 047) was queued but the publish
  workflow failed on 2026-05-26 at the /_apis/gallery upload
  step. PyPI 0.9.0 IS live. Per the operator-saved memory at
  `project_marketplace_0_22_0_queued_unshipped.md`, the 0.23.0
  publish supersedes the queued 0.22.0 — no separate retry
  needed.
- Publishes per `reference_publish_via_github_actions`: push
  tag `v0.10.0` to trigger PyPI workflow; push tag
  `vsix-v0.23.0` to trigger Marketplace workflow. Both gated
  on operator confirmation per the destructive-action policy.

---

## Test counts at close

- Python: 1011 passed + 1 skipped (was 1010 + 1 pre-S5; +1
  new test from `test_production_imports.py`; 0 regressions).
  All Set 048 module-specific test files pass (115 tests in
  spec_config / runtime_mode / no_router_short_circuit /
  no_router_close_session / no_router_backcompat /
  suggestion_disposition / migrate_lightweight_to_canonical_v4 /
  production_imports).
- TypeScript (unit): 665 passed + 2 pre-existing failures
  unchanged from S2/S3/S4 (configEditor-foundation panel-
  lifecycle + notificationsSection rendering — both predate
  Set 048).
- `.vsix` build sanity-check (`npx vsce package
  --allow-missing-repository`) succeeded — 23 files, 881.47 KB.
  Build artifact removed locally; canonical publish path is
  the GitHub Actions workflow.
