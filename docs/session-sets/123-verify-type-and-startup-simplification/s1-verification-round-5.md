**VERIFIED** — I checked the resolver/config code paths, the Session 1 scope, and the targeted resolver tests. The current fix closes the prior split-brain and project-root anchoring defects without a blocking in-hunk regression.

Fix verdict: L1 environment default no longer advertises a dispatch profile `load_config()` will not use -- fix-accepted
Fix verdict: L2 CLI confirmation writes to the enclosing project root -- fix-accepted
Fix verdict: L3 -- duplicate-of L1
Fix verdict: L4 -- duplicate-of L2
Fix verdict: L5 explicit config load honors the project file beside that config -- fix-accepted
Fix verdict: L6 nested project files cannot override the project-root file -- fix-accepted
Fix verdict: L7 explicitly loaded config's repository outranks the caller repository -- fix-accepted
Fix verdict: L8 cwd fallback no longer outranks the loaded config project's own configured profile -- fix-accepted