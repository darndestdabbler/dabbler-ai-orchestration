"""The seeded change a critique round trip is run against.

``os.system`` appears twice in this file and is called zero times: once in
this sentence, once inside ``HELP``. A text search finds both; an AST
search finds neither, because containing the text of a call is not making
one. ``render`` does call ``os.linesep.join``.
"""

import os


def render(rows):
    return os.linesep.join(str(row) for row in rows)


HELP = "shell out with os.system(cmd) if you must, but not from here"
