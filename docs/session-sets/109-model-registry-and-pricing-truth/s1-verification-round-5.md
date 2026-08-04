VERIFIED

The fix delta resolves all ledgered blockers: every inventory miss now fails, requested/served mismatches are persisted and reported, and Google credentials no longer enter request URLs or propagated diagnostics. The added tests cover the corrected exit behavior, credential handling, routing-pin classification, and mismatch visibility.

- Fix verdict: L1 verifier-only/pinned models bypassing drift classification -- fix-accepted
- Fix verdict: L2 requested-versus-served mismatch flag missing -- fix-accepted
- Fix verdict: L3 Google enumeration exposing API keys -- fix-accepted
- Fix verdict: L4 -- duplicate-of L3
- Fix verdict: L5 -- duplicate-of L2
- Fix verdict: L6 default gate tolerating identity-only drift -- fix-accepted