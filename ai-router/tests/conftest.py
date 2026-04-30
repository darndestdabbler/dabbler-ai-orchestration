"""Pytest config for the ai-router test suite.

The ai-router package directory is hyphenated (``ai-router/``), which
Python cannot import as a regular package. Tests bypass that by adding
the package directory itself to ``sys.path`` and importing modules by
filename (``import queue_db``). This is a test-only convenience; the
production import path uses the ``importlib.util.spec_from_file_location``
pattern documented in ``docs/ai-led-session-workflow.md``.
"""

import sys
from pathlib import Path

AI_ROUTER_DIR = Path(__file__).resolve().parent.parent
if str(AI_ROUTER_DIR) not in sys.path:
    sys.path.insert(0, str(AI_ROUTER_DIR))
