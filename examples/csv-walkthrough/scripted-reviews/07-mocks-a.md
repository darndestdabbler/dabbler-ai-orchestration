VERIFIED

I checked both mocks for the failure that matters here: a mock that is right by
accident. `mock_parser` refuses to parse at all and serves fixed answers per
fixture name, so the integration cannot pass because two implementations happen
to agree. It raises on an unknown fixture rather than returning empty, which is
the difference between a stand-in and a silent hole.

`mock_model` does apply the real rules, which I looked at hard. It is
justified: those rules *are* the contract, they are four lines each, and a
hard-coded stand-in would have to encode the same answers anyway.

NITS

- **Severity:** Minor. `mock_parser.SCRIPT` uses bare `object()` for records,
  which is honest about the integration not reading them, but will read as an
  oversight to the next person. A one-line comment would settle it.
