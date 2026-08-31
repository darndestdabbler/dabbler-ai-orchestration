"""The whole solution on stand-ins alone. Proves the contracts compose.

Nothing real is behind this: the parser is the mock, and it cannot parse. What
is under test is whether the promises fit together, not whether anything works.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from components.csv_parser.mock import mock_parser
from components.csv_app.src.app import run

CASES = [
    ("clean.csv", 0, ["3 record(s) read, 0 row(s) rejected"]),
    ("mixed.csv", 1, ["2 record(s) read, 2 row(s) rejected",
                      "  line 3: 'ada-at-example.com' is not an address this reads",
                      "  line 5: 'two hundred' is not an age from 0 to 150"]),
    ("wrong-header.csv", 2, ["cannot read wrong-header.csv: header is wrong. "
                             "found: first_name, email_address, age, active"]),
    ("not-utf8.csv", 2, ["cannot read not-utf8.csv: not valid UTF-8 at byte 41"]),
]


def main():
    failures = 0
    for path, want_code, want_lines in CASES:
        got = []
        code = run(path, mock_parser, out=got.append)
        ok = code == want_code and got == want_lines
        print(f"{'ok  ' if ok else 'FAIL'} {path}: exit {code}")
        if not ok:
            failures += 1
            print(f"     wanted exit {want_code} and {want_lines}")
            print(f"     got    exit {code} and {got}")
    print(f"\n{len(CASES) - failures}/{len(CASES)} cases pass on mocks alone")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
