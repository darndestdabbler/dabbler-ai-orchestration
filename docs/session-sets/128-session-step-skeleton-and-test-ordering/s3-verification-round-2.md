VERIFIED

- Fix verdict: L1 vacuous corpus scan on empty discovery -- fix-accepted

The added assertion makes the real-repo corpus test fail before scanning if `_discover_specs` returns no specs, and the Set 118 measurement-prose edits introduce no blocking in-hunk regression.