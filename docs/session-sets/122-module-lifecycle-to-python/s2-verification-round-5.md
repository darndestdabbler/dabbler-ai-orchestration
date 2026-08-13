**VERIFIED**

- Fix verdict: L1 echoed command shell-correctness/copy-pasteability -- fix-accepted
- Fix verdict: L2 prompt glyph removed from visible command line -- fix-accepted

The current echo path shows a bare command line, with PowerShell-safe quoting and `&` for quoted interpreter paths, derived from the same invocation data as the spawned argv. The install override delta is harness-scoped by env input and preserves the production default package install.