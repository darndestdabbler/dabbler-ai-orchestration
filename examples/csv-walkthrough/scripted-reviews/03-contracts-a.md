VERIFIED

I read the three contracts against each other rather than one at a time, looking
for a promise one makes that another has to keep. The parser's header rule
defers to `csv-model.FIELDS` instead of restating the four names, which is the
place this would normally drift. The app's non-zero exit is declared as retained
rather than left as behaviour, which is right: it is the answer to the plan's
partial-failure question and a script will depend on it.

Every clause names the test that proves it, and the "not promised" sections are
doing real work — rejection wording is excluded in all three, so rewording it
cannot break a consumer.

NITS

- **Severity:** Minor. `csv-parser` promises `records + rejections + blank
  lines + 1 header == total lines`. That is the strongest clause here and the
  one most likely to be quietly weakened later. Worth saying in the contract
  that it is an invariant rather than a summary.
