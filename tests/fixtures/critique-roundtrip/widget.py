"""The seeded change a critique round trip is run against.

``os.system`` appears twice in this file and is never called: once in this
sentence, once inside ``HELP``. Text search cannot tell the difference —
telling it needs a deterministic analyzer, not a worker's quote. ``render``
does call ``os.linesep.join``.
"""

import os


def render(rows):
    return os.linesep.join(str(row) for row in rows)


HELP = "shell out with os.system(cmd) if you must, but not from here"
