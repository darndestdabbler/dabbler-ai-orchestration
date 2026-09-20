"""The record a valid row becomes, and the rules that decide validity.

Knows nothing about files, commas or headers. That is what lets csv-app talk
about results without depending on the file format.
"""

FIELDS = ("name", "email", "age", "active")

_TRUE = {"true", "yes", "1"}
_FALSE = {"false", "no", "0"}
_AGE_MAX = 150


class InvalidField(Exception):
    """A normal outcome, not a bug. One row failing is expected."""

    def __init__(self, field, value, reason):
        super().__init__(reason)
        self.field = field
        self.value = value
        self.reason = reason


class PersonRecord:
    """Complete or absent. There is no partly-filled record, so no consumer
    ever has to check whether a field arrived."""

    __slots__ = FIELDS

    def __init__(self, name, email, age, active):
        for f, v in zip(FIELDS, (name, email, age, active)):
            object.__setattr__(self, f, v)

    def __setattr__(self, *_):
        raise AttributeError("a record is read-only once it exists")

    def __repr__(self):
        return (f"PersonRecord({self.name!r}, {self.email!r}, "
                f"{self.age!r}, {self.active!r})")


def _check_name(v):
    if not v:
        raise InvalidField("name", v, "name is blank")
    return v


def _check_email(v):
    if v.count("@") != 1 or v.startswith("@") or v.endswith("@"):
        raise InvalidField("email", v, f"'{v}' is not an address this reads")
    return v


def _check_age(v):
    if not v.isdigit() or int(v) > _AGE_MAX:
        raise InvalidField("age", v, f"'{v}' is not an age from 0 to {_AGE_MAX}")
    return int(v)


def _check_active(v):
    low = v.lower()
    if low in _TRUE:
        return True
    if low in _FALSE:
        return False
    raise InvalidField("active", v, f"'{v}' is not a yes or a no")


_RULES = {"name": _check_name, "email": _check_email,
          "age": _check_age, "active": _check_active}


def check_field(field, raw):
    """The one place a field's rule lives. The parser calls this rather than
    repeating the rules, so the two cannot disagree about what valid means."""
    if field not in _RULES:
        raise InvalidField(field, raw, f"'{field}' is not a known field")
    return _RULES[field]((raw or "").strip())
