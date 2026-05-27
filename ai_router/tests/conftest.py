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
#
# S5 Round-A Minor #2: the alias is import-order sensitive. If any code
# imports a bare Set 048 module BEFORE conftest runs, ``sys.modules``
# already holds a distinct module object under that name, and replacing
# it here leaves any references already taken pointing at the old
# object. Fail fast in that case rather than silently producing the
# split-module-identity bug this aliasing is supposed to prevent.
_SHARED_MODULE_NAMES = (
    "runtime_mode",
    "spec_config",
    "suggestion_disposition",
    "migrate_lightweight_to_canonical_v4",
)
for _name in _SHARED_MODULE_NAMES:
    _pkg = importlib.import_module(f"ai_router.{_name}")
    _existing = sys.modules.get(_name)
    if _existing is not None and _existing is not _pkg:
        raise RuntimeError(
            f"conftest module-aliasing tripped: sys.modules[{_name!r}] is "
            f"a different object than ai_router.{_name}. Something imported "
            "the bare module name before conftest ran; that early import "
            "would defeat the test convention's shared-state assumption. "
            "Check pre-conftest imports (pytest plugins, sys.path-shimmed "
            "package init code, etc.)."
        )
    sys.modules[_name] = _pkg
