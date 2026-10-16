VERIFIED

The integration is unchanged from step 5 apart from which parser it is handed,
which is the strongest evidence available that the contracts composed: the same
`run()` that passed against a mock that cannot parse now passes against a
parser that can, with no edits to the calling code.

I checked the exit codes against the contract on real files: 0 for a clean
file, 1 where anything was rejected, 2 for a wrong header. The rejection reason
reaches the output unchanged.
