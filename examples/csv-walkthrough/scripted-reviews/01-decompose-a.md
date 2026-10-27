VERIFIED

I checked this against the plan's stated likely changes rather than against the
prose. Three candidates are genuinely distinct, the recommendation is argued
from where change lands rather than from taste, and the change table is
falsifiable — I tried each row and got the same answer. The stated cost of
`csv-model` being small is the real objection to C and it is answered rather
than hidden.

NITS

- **Severity:** Minor. The diagram shows `csv-app` depending on both
  `csv-parser` and `csv-model`, which is correct but reads as redundant next to
  the arrow chain. Worth a word saying the direct edge exists because `csv-app`
  names the record type in its own signatures.
