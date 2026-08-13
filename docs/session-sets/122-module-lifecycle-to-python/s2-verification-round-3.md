VERIFIED

- Fix verdict: L1 copy-pasteable PowerShell command quoting -- fix-accepted
- Fix verdict: L2 prompt-prefixed echoed command line -- fix-accepted

I checked the fix hunks in `routerCli.ts` and the new `routerCli.test.ts`: the displayed command is now emitted as a bare line, quoted interpreter paths get PowerShell’s `&` call operator, and special characters are escaped for PowerShell without changing the spawned argv. I found no new in-hunk blocking defects.