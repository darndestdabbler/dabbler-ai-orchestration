VERIFIED

The implementation now matches the amended contract rather than the other way
round. Blank lines are counted wherever they fall, `header_line` is reported,
and the header check reads `FIELDS` from csv-model rather than repeating the
four names -- so a column change lands in one place.

I checked the rejection path: a row with the wrong field count is a rejection
rather than a fatal error, and field checks stop at the first failure in FIELDS
order, so a reason names one field. Both are contract clauses and both hold.
