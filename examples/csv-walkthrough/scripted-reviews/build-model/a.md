VERIFIED

`check_field` is the only place a rule lives and the parser calls it rather
than duplicating the logic, which is the clause the whole decomposition rests
on. Records are genuinely read-only -- I tried assigning and got the declared
AttributeError. FIELDS is exported in order and the parser's header check
consumes it.

NITS

- **Severity:** Minor. `_check_age` relies on `isdigit()` to exclude signs and
  decimals, which is correct but non-obvious. The contract states the rule, so
  this is a readability note only.
