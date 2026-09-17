ISSUES FOUND

- **Issue 1:** `csv-app` promises to print the parser's rejection reason
  verbatim, but `csv-parser` explicitly does not promise the wording of that
  reason.
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** The parser team rewords a rejection reason, which its
    own contract says it may do freely. `csv-app`'s test
    `test_prints_each_rejection_reason_verbatim` pins the old wording and
    fails. The app team is now blocked by a change the parser team was told was
    safe. This is probable rather than possible: the reason text is written for
    people, and text written for people gets reworded.
  - **Location:** `csv-app` postconditions versus `csv-parser` notPromised.

NITS

- **Severity:** Minor. `csv-model.check_field` lists `sideEffects: None` while
  the other two omit the section entirely. Consistent either way is fine, but
  the difference reads as meaningful when it is not.
