VERIFIED

I checked the amended clause against the case that caused the send-back: a file
beginning with a blank line. The invariant now names blank lines wherever they
fall, and it says explicitly that it is an invariant rather than a summary,
which is what the earlier round's nit asked for and what the build actually
tripped over.

The reading now reports the blank count and the header line. That is the part
that matters: without it a caller cannot check the invariant at all, so it
would have stayed a sentence nobody could test.
