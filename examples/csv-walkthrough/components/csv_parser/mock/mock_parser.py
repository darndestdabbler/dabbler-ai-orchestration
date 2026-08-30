"""Stand-in for csv-parser. Returns a fixed answer per fixture name.

It does not read CSV. That is the point: at step 5 the integration must run on
promises alone, and a mock that really parses would hide a contract that does
not compose.
"""

from dataclasses import dataclass, field


class BadHeader(Exception):
    pass


class BadEncoding(Exception):
    pass


@dataclass(frozen=True)
class Rejection:
    line: int
    raw: str
    reason: str


@dataclass(frozen=True)
class Reading:
    records: list = field(default_factory=list)
    rejections: list = field(default_factory=list)


#: What each fixture path yields. Keyed by name so the integration can ask for
#: a case rather than construct one.
SCRIPT = {
    "clean.csv": Reading(records=[object(), object(), object()], rejections=[]),
    "mixed.csv": Reading(
        records=[object(), object()],
        rejections=[
            Rejection(3, "ada,ada-at-example.com,36,yes",
                      "'ada-at-example.com' is not an address this reads"),
            Rejection(5, "bob,bob@example.com,two hundred,no",
                      "'two hundred' is not an age from 0 to 150"),
        ],
    ),
    "wrong-header.csv": None,
    "not-utf8.csv": "encoding",
}


def read_people(path):
    key = str(path).rsplit("/", 1)[-1]
    if key not in SCRIPT:
        raise AssertionError(
            f"the mock has no scripted answer for {key!r}. Add one rather "
            "than teaching the mock to parse."
        )
    outcome = SCRIPT[key]
    if outcome is None:
        raise BadHeader("found: first_name, email_address, age, active")
    if outcome == "encoding":
        raise BadEncoding("not valid UTF-8 at byte 41")
    return outcome
