VERIFIED

Checked the real csv-model against the contract clause by clause rather than
against the mock. FIELDS is exported in declared order; PersonRecord refuses
assignment after construction; InvalidField carries the field, the value and a
one-sentence reason, and every rule path raises it rather than returning a
sentinel.

The component imports nothing outside itself -- no file access, no clock, no
globals -- so the "no side effects" clause is structural rather than asserted.
