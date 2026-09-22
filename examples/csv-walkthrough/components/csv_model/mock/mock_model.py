"""Stand-in for csv-model. Satisfies the contract and promises nothing more.

Deliberately hard-coded where the real component will compute: a mock that
computes is a second implementation, and the integration then passes because
two guesses agree rather than because the contract composes.
"""

FIELDS = ("name", "email", "age", "active")

_TRUE = {"true", "yes", "1"}
_FALSE = {"false", "no", "0"}


class InvalidField(Exception):
    def __init__(self, field, value, reason):
        super().__init__(reason)
        self.field = field
        self.value = value
        self.reason = reason


class PersonRecord:
    __slots__ = FIELDS

    def __init__(self, name, email, age, active):
        object.__setattr__(self, "name", name)
        object.__setattr__(self, "email", email)
        object.__setattr__(self, "age", age)
        object.__setattr__(self, "active", active)

    def __setattr__(self, *_):
        raise AttributeError("a record is read-only once it exists")


def check_field(field, raw):
    """The contract's rules, applied literally. No cleverness to get wrong."""
    if field not in FIELDS:
        raise InvalidField(field, raw, f"'{field}' is not a known field")
    v = (raw or "").strip()
    if field == "name":
        if not v:
            raise InvalidField(field, raw, "name is blank")
        return v
    if field == "email":
        if v.count("@") != 1 or v.startswith("@") or v.endswith("@"):
            raise InvalidField(
                field, raw, f"'{v}' is not an address this reads")
        return v
    if field == "age":
        if not v.isdigit() or not 0 <= int(v) <= 150:
            raise InvalidField(field, raw, f"'{v}' is not an age from 0 to 150")
        return int(v)
    low = v.lower()
    if low in _TRUE:
        return True
    if low in _FALSE:
        return False
    raise InvalidField(field, raw, f"'{v}' is not a yes or a no")
