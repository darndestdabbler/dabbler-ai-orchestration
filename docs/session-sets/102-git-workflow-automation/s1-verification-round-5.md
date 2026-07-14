VERIFIED

Fix verdict: L1 ADO URL-encoded project/repository names are decoded before reuse -- fix-accepted  
Fix verdict: L2 Live GitHub PR, merge, and finalize dogfood was executed -- fix-accepted

The delta correctly resolves single decoding/re-encoding, restricts finalize candidates to session branches, handles main-checkout subdirectories, and adds a genuinely live, gated GitHub round-trip harness consistent with the remediation evidence.