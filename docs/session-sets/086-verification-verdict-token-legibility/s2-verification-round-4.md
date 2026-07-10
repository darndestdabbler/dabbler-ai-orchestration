- **Issue → Major: prompt scrubbing still leaks on normalized/escaped stderr variants**  
  **Location →** `ai_router/transport_diagnostics.py`, `_scrub_prompt()` and its callers via `_stderr_tail()` in both `build_record()` and `diagnostics_summary()`  
  **Fix →** `_scrub_prompt()` only does `text.replace(prompt, ...)`, so it removes the prompt **only** when stderr contains the exact raw `-p` payload. It does **not** scrub common transformed echoes such as:
  - CRLF-normalized prompt text (`\r\n` instead of `\n`)
  - escaped newline renderings (`\\n`, `\\r\\n`) from JSON/Python-style stderr
  - bytes-repr stderr after `_coerce_str(bytes)` (`b'...\\n...'`)
  
  That means the “prompt payload never reaches the log / raised summary” guarantee is still false for realistic stderr renderings. Normalize and scrub multiple prompt representations before tail-capping, at minimum:
  1. exact raw prompt
  2. CRLF-normalized prompt
  3. escaped `\n` / `\r\n` prompt forms
  
  Add tests for stderr containing:
  - `prompt.replace("\n", "\r\n")`
  - escaped newline text
  - bytes stderr whose stringified form contains the prompt in escaped form