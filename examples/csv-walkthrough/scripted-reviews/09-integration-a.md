VERIFIED

The integration runs on the mock and nothing else -- `integration_check`
imports `mock_parser` directly, and `app.run` takes the parser as an argument
rather than importing one. That is what makes step 5 mean anything: if the
contracts did not compose, there is no real implementation here to paper over
it.

All four declared outcomes are covered, including both exit-2 paths, which are
the ones usually left until something real exists.
