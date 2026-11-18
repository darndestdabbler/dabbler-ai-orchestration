VERIFIED

I checked the integration against the app's contract clause by clause. Both
counts are printed, each rejection is printed with its line number, and the
exit codes match the declared 0/1/2. The rejection reason reaches the output
untouched, which is the promise that replaced the withdrawn verbatim-wording
one at step 3 -- so the step-3 fix is actually exercised here rather than only
asserted.

NITS

- **Severity:** Minor. `app.main` imports the real parser lazily inside the
  function. That is what keeps this runnable before the real parser exists, but
  it deserves a comment saying so, or someone will "tidy" it to the top.
