VERIFIED

I looked specifically for the coupling that step 3 removed. `app.run` still
prints the parser's reason without inspecting it, and nothing in the app tests
the wording, so the parser remains free to reword as its contract says it may.

The 1.1.0 additions -- `blank_lines` and `header_line` -- are available to the
app and unused, which is the correct outcome for an additive change: named as
affected, examined, no work needed.
