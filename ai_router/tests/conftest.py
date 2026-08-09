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
(``runtime_mode``, ``spec_config``, ``suggestion_disposition``).
Those bare imports only
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

import pytest

AI_ROUTER_DIR = Path(__file__).resolve().parent.parent
if str(AI_ROUTER_DIR) not in sys.path:
    sys.path.insert(0, str(AI_ROUTER_DIR))

# Set 051: the ``scripts/`` utilities (``dump_session_state_schema`` /
# ``backfill_session_state``) are shipped as standalone, file-runnable
# tools (not packaged in the wheel — they have no ``__init__.py`` and
# ``namespaces = false`` excludes them). Their relocated tests
# (``test_dump_session_state_schema`` / ``test_session_state_backfill``)
# import them by bare filename, matching the package's test convention,
# so the scripts dir must be on ``sys.path``. No name collides with a
# top-level ``ai_router`` module.
SCRIPTS_DIR = AI_ROUTER_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

# Set 084 S2: shared test-fixture helpers live beside the tests
# (``stamp_fixtures.py``) and are imported by bare filename like the
# package modules, so the tests dir itself joins sys.path too.
TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

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
#
# Set 109 S2 added ``call_trace``, which holds a ContextVar recording the
# provider requests issued inside a scope. It meets the same criterion for the
# same reason: a test that opened the scope on the bare module while
# ``providers`` announced requests on the package module would observe an
# empty trace and read it as "no request was sent" — the precise false
# negative the module exists to make impossible.
#
# Set 109 S3 added ``pricing``. It holds no mutable state, but it defines
# ``PricingError``, and ``config`` — which validates every model entry at load
# — is itself imported both ways. Without the alias the exception raised by a
# bare-imported ``config`` is a DIFFERENT class object from
# ``ai_router.pricing.PricingError``, so an ``except PricingError`` written
# against the package path silently fails to catch it. Same split-identity
# bug, exception classes rather than caches.
_SHARED_MODULE_NAMES = (
    "runtime_mode",
    "spec_config",
    "suggestion_disposition",
    "call_trace",
    "pricing",
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


@pytest.fixture(autouse=True)
def _no_live_backstop_routing(monkeypatch):
    """Set 084 S2: the close backstop can issue a METERED routed call
    from inside ``close_session.run`` — a surface no pre-084 test had
    to guard against. This autouse fixture replaces the backstop's
    default route seam with a loud refusal on BOTH module identities
    (bare test-convention name and package-qualified name), so a test
    that reaches the backstop without valid stamped evidence fails
    fast instead of spending real provider dollars. Tests that
    exercise the backstop deliberately monkeypatch
    ``close_backstop._default_route`` (or pass ``route_fn``) with
    their own fake on top of this guard.
    """

    def _refuse_live_routing(*_args, **_kwargs):
        raise RuntimeError(
            "close backstop attempted a LIVE routed verification inside "
            "the test suite (no valid stamped evidence for the close "
            "under test). Either give the fixture stamped evidence "
            "(tests/stamp_fixtures.py) or monkeypatch "
            "close_backstop._default_route with a fake."
        )

    for module_name in ("close_backstop", "ai_router.close_backstop"):
        try:
            module = importlib.import_module(module_name)
        except ImportError:
            continue
        monkeypatch.setattr(module, "_default_route", _refuse_live_routing)
    yield


@pytest.fixture()
def placeholder_provider_keys(monkeypatch):
    """Set placeholder ``DABBLER_*`` provider keys for a direct-API test.

    Set 111 S2. A test that builds a provider request and mocks the HTTP
    layer still runs the real key-resolution step, so on a **Copilot CLI**
    seat — which carries no provider keys by design, and is one of the
    two supported populations rather than a misconfiguration — it fails
    on a credential it was never going to send. The key is a placeholder
    precisely because the call is faked.
    """
    for key in (
        "DABBLER_ANTHROPIC_API_KEY",
        "DABBLER_GEMINI_API_KEY",
        "DABBLER_OPENAI_API_KEY",
    ):
        monkeypatch.setenv(key, "test-key")


@pytest.fixture()
def direct_api_transport(monkeypatch, tmp_path_factory,
                         placeholder_provider_keys):
    """Run the test as the **Direct APIs** population, whatever this seat is.

    Set 111 S2. The framework supports two populations — *Direct APIs*
    (provider keys, no Copilot seat) and *Copilot CLI* (a seat, no
    provider keys) — and a machine selects its own with
    ``transport.profile`` in the **gitignored**
    ``ai_router/local-overrides.yaml``.

    A test that fakes the direct-API seam (``ai_router.call_model``, or
    ``httpx``) is asserting a property of the *api* transport. On a
    Copilot seat those fakes are simply never reached: ``route()`` reads
    the seat's local override, dispatches through the **real Copilot
    CLI**, and the test hangs until the CLI's total-timeout — a
    seat-dependent failure that says nothing about the invariant under
    test.

    This fixture removes the seat from the equation by pointing
    ``AI_ROUTER_CONFIG`` at a copy of the **shipped** ``router-config.yaml``
    in a scratch directory, where no ``local-overrides.yaml`` sits beside
    it. The shipped file is pinned to ``profile: api`` (a packaging
    invariant with its own test), so the copy IS the shipping
    configuration — which is what these tests mean by "the live
    registry".
    """
    import shutil

    source = AI_ROUTER_DIR / "router-config.yaml"
    scratch = tmp_path_factory.mktemp("direct-api-config")
    target = scratch / "router-config.yaml"
    shutil.copyfile(source, target)
    monkeypatch.setenv("AI_ROUTER_CONFIG", str(target))
    return target

