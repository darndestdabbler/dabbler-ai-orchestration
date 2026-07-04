**VERIFIED**

- Reachable warning matrix is covered:
  - **Full + API + no `DABBLER_*` keys** → `envWarningHtml` remains visible.
  - **Full + Copilot + missing CLI** → Copilot warning is visible and actionable.
  - **Full + Copilot + CLI present** → no warning is needed; this is the intended keyless-valid path.
  - **Lightweight** → Copilot sub-choice is omitted, so D6 suppression is not involved.

```json
{"verdict":"VERIFIED","issues":[]}
```