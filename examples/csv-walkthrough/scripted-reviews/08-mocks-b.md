VERIFIED

I tried to find a contract clause the mocks quietly promise more than. The
closest is `PersonRecord.__setattr__` raising on assignment -- the contract says
fields are read-only, so this is the promise kept rather than exceeded.

I also checked that the mocks promise *less* than the contract nowhere that
matters to step 5: `mock_parser` returns records and rejections together and
always both, which is the clause the integration depends on.
