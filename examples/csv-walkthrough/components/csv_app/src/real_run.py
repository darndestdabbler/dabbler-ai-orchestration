"""The finished solution: the same integration, with the real parser behind it.

Nothing in `app.run` changed between step 5 and step 6. That is the whole claim
of the six steps -- if the contracts composed on stand-ins, swapping in the real
component is a change of argument, not a change of code.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from components.csv_parser.src import parser
from components.csv_app.src.app import run

if __name__ == "__main__":
    raise SystemExit(run(sys.argv[1] if len(sys.argv) > 1 else "", parser))
