"""Reads a path, uses the parser, reports what it found.

Depends on the parser's promises, never on a parser. Which implementation
answers is decided by the caller, which is what lets this run at step 5 with
nothing real behind it.
"""

import sys


def run(path, parser, out=print):
    """Returns the exit code the contract declares: 0 clean, 1 rejections,
    2 unusable file."""
    try:
        reading = parser.read_people(path)
    except parser.BadHeader as exc:
        out(f"cannot read {path}: header is wrong. {exc}")
        return 2
    except parser.BadEncoding as exc:
        out(f"cannot read {path}: {exc}")
        return 2

    out(f"{len(reading.records)} record(s) read, "
        f"{len(reading.rejections)} row(s) rejected")
    for r in reading.rejections:
        # The reason is passed through unchanged. This app does not own that
        # wording and does not promise it.
        out(f"  line {r.line}: {r.reason}")
    return 1 if reading.rejections else 0


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if len(argv) != 1:
        print("usage: csv-app <path>", file=sys.stderr)
        return 2
    from components.csv_parser.src import parser
    return run(argv[0], parser)
