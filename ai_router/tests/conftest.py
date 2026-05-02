"""Pytest config for the ai_router test suite.

Tests put the package directory itself on ``sys.path`` and import
modules by bare filename (``import queue_db``). This pattern predates
the package's PEP 621 install path and survives Set 010 Session 1
(which renamed the package directory to its underscore form); with
the package now installable via ``pip install -e .``,
``import ai_router.queue_db`` also works. Either form is supported;
the bare-filename form remains the test convention for consistency
with existing test files.
"""

import sys
from pathlib import Path

AI_ROUTER_DIR = Path(__file__).resolve().parent.parent
if str(AI_ROUTER_DIR) not in sys.path:
    sys.path.insert(0, str(AI_ROUTER_DIR))
