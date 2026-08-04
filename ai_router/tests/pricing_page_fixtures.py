"""Captured provider pricing pages for the Set 109 S3 tests.

Every string below is a VERBATIM slice of a real page, fetched from the live
URL on 2026-08-04 during Set 109 Session 3. Nothing was reshaped, renamed,
re-indented, or invented; the markup — inline styles, class names, unescaped
characters and all — is byte-for-byte what the provider served, so a parser
that passes against these passes against the HTML the tool actually meets.

What was dropped, and only what was dropped:

- ``OPENAI_PRICING_TABLE`` — the page's single pricing ``<table>``, with its
  ``<colgroup>`` and both header rows intact. Of eleven body rows, six are
  kept (``gpt-5.6-sol`` / ``-terra`` / ``-luna``, ``gpt-5.5``, ``gpt-5.4``,
  ``gpt-5.4-mini``); ``gpt-5.5-pro``, ``gpt-5.4-nano``, ``gpt-5.4-pro`` and
  two others were removed. Everything outside the table — navigation, prose,
  scripts — is gone.
- ``ANTHROPIC_PRICING_TABLE`` — the model table's ``<thead>`` plus seven of
  seventeen body rows. The two ``Claude Sonnet 5`` rows are both kept because
  the pair IS the effective-date specimen, and ``Claude Sonnet 4 (retired,
  except on Bedrock and Google Cloud)`` is kept because its parenthetical is
  the status-noise specimen.
- ``GOOGLE_PRICING_SECTIONS`` — two of roughly one hundred model sections,
  each complete: ``Gemini 2.5 Pro`` (the context-tier specimen, and the one
  whose Standard and Batch rates differ by exactly 2x) and
  ``Gemini 2.5 Flash`` (a single-rate control). Each keeps all four billing
  sections — Standard, Batch, Flex, Priority — because the parser's job is to
  read the first and ignore the rest, and a fixture with only Standard could
  not prove it does.

Three properties of this markup are load-bearing and must survive any future
re-capture:

1. Google emits **unescaped** ``<=`` inside ``<td>`` text
   (``$1.25, prompts <= 200k tokens``). A regex tag-strip eats the tier
   boundary; ``html.parser`` does not.
2. Google's Batch rates are exactly half its Standard rates, so a parser that
   read the wrong section would understate by 2x — the same shape as the
   defect Set 109 exists to end.
3. Anthropic states an effective date as English prose inside the model-name
   cell, and gives one model two rows.

Shared with the tests by bare-filename import, matching
``model_inventory_fixtures.py`` and ``stamp_fixtures.py``.
"""

# --- openai --- https://developers.openai.com/api/docs/pricing (fetched 2026-08-04)
OPENAI_PRICING_TABLE = """\n<table style="width:100%;min-width:100%;table-layout:fixed;border-collapse:collapse;font-size:14px;margin:0"><colgroup><col style="width:20%"/><col style="width:8%"/><col style="width:12%"/><col style="width:12%"/><col style="width:8%"/><col style="width:8%"/><col style="width:12%"/><col style="width:12%"/><col style="width:8%"/></colgroup><thead><tr><th style="background-color:transparent;color:var(--color-text-secondary);font-size:14px;font-weight:500;height:20px;line-height:20px;padding:0;text-align:left;vertical-align:middle;width:20%"></th><th colSpan="4" style="background-color:transparent;color:var(--color-text-secondary);font-size:14px;font-weight:500;height:20px;line-height:20px;padding:0;text-align:left;vertical-align:middle;padding-left:12px"><span aria-label="Short context pricing details" style="align-items:center;cursor:help;display:inline-flex;gap:0.35rem;text-decoration:underline dotted;text-underline-offset:4px;white-space:nowrap" data-state="closed" class="_TriggerDecorator_purug_84" tabindex="0"><span>Short context</span></span></th><th colSpan="4" style="background-color:transparent;color:var(--color-text-secondary);font-size:14px;font-weight:500;height:20px;line-height:20px;padding:0;text-align:left;vertical-align:middle;padding-left:12px"><span aria-label="Long context pricing details" style="align-items:center;cursor:help;display:inline-flex;gap:0.35rem;text-decoration:underline dotted;text-underline-offset:4px;white-space:nowrap" data-state="closed" class="_TriggerDecorator_purug_84" tabindex="0"><span>Long context</span></span></th></tr><tr><th style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;font-weight:600;padding:0.75rem 0;text-align:left;padding-right:12px">Model</th><th style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;font-weight:600;padding:0.75rem 0;text-align:left;padding-left:12px">Input</th><th style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;font-weight:600;padding:0.75rem 0;text-align:left;padding-right:6px;white-space:nowrap">Cached input</th><th style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;font-weight:600;padding:0.75rem 0;text-align:left;padding-left:6px;padding-right:6px;white-space:nowrap"><span aria-label="Cache writes pricing details" style="align-items:center;cursor:help;display:inline-flex;gap:0.35rem;text-decoration:underline dotted;text-underline-offset:4px;white-space:nowrap" data-state="closed" class="_TriggerDecorator_purug_84" tabindex="0"><span>Cache writes</span></span></th><th style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;font-weight:600;padding:0.75rem 0;text-align:left;padding-right:12px"><span aria-label="Output pricing details" style="align-items:center;cursor:help;display:inline-flex;gap:0.35rem;text-decoration:underline dotted;text-underline-offset:4px;white-space:nowrap" data-state="closed" class="_TriggerDecorator_purug_84" tabindex="0"><span>Output</span></span></th><th style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;font-weight:600;padding:0.75rem 0;text-align:left;padding-left:12px">Input</th><th style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;font-weight:600;padding:0.75rem 0;text-align:left;padding-right:6px;white-space:nowrap">Cached input</th><th style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;font-weight:600;padding:0.75rem 0;text-align:left;padding-left:6px;padding-right:6px;white-space:nowrap"><span aria-label="Cache writes pricing details" style="align-items:center;cursor:help;display:inline-flex;gap:0.35rem;text-decoration:underline dotted;text-underline-offset:4px;white-space:nowrap" data-state="closed" class="_TriggerDecorator_purug_84" tabindex="0"><span>Cache writes</span></span></th><th style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;font-weight:600;padding:0.75rem 0;text-align:left"><span aria-label="Output pricing details" style="align-items:center;cursor:help;display:inline-flex;gap:0.35rem;text-decoration:underline dotted;text-underline-offset:4px;white-space:nowrap" data-state="closed" class="_TriggerDecorator_purug_84" tabindex="0"><span>Output</span></span></th></tr></thead><tbody><tr><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:12px;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">gpt-5.6-sol</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:12px;padding-right:0;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$5.00</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">$0.50</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:6px;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">$6.25</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:12px;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$30.00</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:12px;padding-right:0;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$10.00</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">$1.00</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:6px;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">$12.50</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:0;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$45.00</span></td></tr><tr><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:12px;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">gpt-5.6-terra</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:12px;padding-right:0;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$2.00</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">$0.20</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:6px;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">$2.50</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:12px;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$12.00</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:12px;padding-right:0;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$4.00</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">$0.40</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:6px;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">$5.00</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:0;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$18.00</span></td></tr><tr><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:12px;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">gpt-5.6-luna</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:12px;padding-right:0;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$0.20</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">$0.02</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:6px;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">$0.25</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:12px;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$1.20</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:12px;padding-right:0;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$0.40</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">$0.04</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:6px;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">$0.50</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:0;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$1.80</span></td></tr><tr><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:12px;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">gpt-5.5</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:12px;padding-right:0;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$5.00</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">$0.50</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:6px;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">-</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:12px;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$30.00</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:12px;padding-right:0;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$10.00</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">$1.00</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:6px;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">-</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:0;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$45.00</span></td></tr><tr><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:12px;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">gpt-5.4</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:12px;padding-right:0;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$2.50</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">$0.25</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:6px;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">-</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:12px;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$15.00</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:12px;padding-right:0;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$5.00</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">$0.50</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:6px;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">-</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:0;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$22.50</span></td></tr><tr><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:12px;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">gpt-5.4-mini</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:12px;padding-right:0;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$0.75</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">$0.075</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:6px;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">-</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:12px;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">$4.50</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:12px;padding-right:0;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">-</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">-</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:6px;padding-right:6px;text-align:left;vertical-align:middle;white-space:nowrap"><span style="align-items:center;display:flex;width:100%">-</span></td><td style="border-bottom:1px solid var(--color-border-default);color:var(--color-text-primary);font-size:14px;padding-top:0.5rem;padding-bottom:0.5rem;padding-left:0;padding-right:0;text-align:left;vertical-align:middle;white-space:pre-line"><span style="align-items:center;display:flex;width:100%">-</span></td></tr></tbody></table>
"""

# --- anthropic --- https://platform.claude.com/docs/en/about-claude/pricing (fetched 2026-08-04)
ANTHROPIC_PRICING_TABLE = """\n<table class="w-full border-collapse"><thead class=""><tr class="border-b-0.5 last:border-b-0"><th class="p-2 pt-0 first:pl-0 last:pr-0 text-left font-semibold text-primary border-b-0.5">Model</th><th class="p-2 pt-0 first:pl-0 last:pr-0 text-left font-semibold text-primary border-b-0.5">Base Input Tokens</th><th class="p-2 pt-0 first:pl-0 last:pr-0 text-left font-semibold text-primary border-b-0.5">5m Cache Writes</th><th class="p-2 pt-0 first:pl-0 last:pr-0 text-left font-semibold text-primary border-b-0.5">1h Cache Writes</th><th class="p-2 pt-0 first:pl-0 last:pr-0 text-left font-semibold text-primary border-b-0.5">Cache Hits &amp; Refreshes</th><th class="p-2 pt-0 first:pl-0 last:pr-0 text-left font-semibold text-primary border-b-0.5">Output Tokens</th></tr></thead><tbody class=""><tr class="border-b-0.5 last:border-b-0"><td class="p-2 first:pl-0 last:pr-0 text-secondary">Claude Fable 5</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$10 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$12.50 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$20 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$1 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$50 / MTok</td></tr><tr class="border-b-0.5 last:border-b-0"><td class="p-2 first:pl-0 last:pr-0 text-secondary">Claude Opus 5</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$5 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$6.25 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$10 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$0.50 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$25 / MTok</td></tr><tr class="border-b-0.5 last:border-b-0"><td class="p-2 first:pl-0 last:pr-0 text-secondary">Claude Opus 4.8</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$5 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$6.25 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$10 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$0.50 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$25 / MTok</td></tr><tr class="border-b-0.5 last:border-b-0"><td class="p-2 first:pl-0 last:pr-0 text-secondary">Claude Sonnet 5<br/><a class="inline-link" href="/docs/en/about-claude/pricing#claude-sonnet-5-introductory-pricing">through August 31, 2026</a></td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$2 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$2.50 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$4 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$0.20 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$10 / MTok</td></tr><tr class="border-b-0.5 last:border-b-0"><td class="p-2 first:pl-0 last:pr-0 text-secondary">Claude Sonnet 5<br/>starting September 1, 2026</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$3 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$3.75 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$6 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$0.30 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$15 / MTok</td></tr><tr class="border-b-0.5 last:border-b-0"><td class="p-2 first:pl-0 last:pr-0 text-secondary">Claude Sonnet 4.6</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$3 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$3.75 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$6 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$0.30 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$15 / MTok</td></tr><tr class="border-b-0.5 last:border-b-0"><td class="p-2 first:pl-0 last:pr-0 text-secondary">Claude Sonnet 4 (<a class="inline-link" href="/docs/en/about-claude/model-deprecations">retired, except on Bedrock and Google Cloud</a>)</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$3 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$3.75 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$6 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$0.30 / MTok</td><td class="p-2 first:pl-0 last:pr-0 text-secondary">$15 / MTok</td></tr></tbody></table>
"""

# --- google --- https://ai.google.dev/gemini-api/docs/pricing (fetched 2026-08-04)
GOOGLE_PRICING_SECTIONS = """\n<h2 id="gemini-2.5-pro" data-text="Gemini 2.5 Pro" tabindex="-1">Gemini 2.5 Pro</h2>
        <em><code translate="no" dir="ltr">gemini-2.5-pro</code></em>
    </div>
    <p>
        <a href="https://aistudio.google.com?model=gemini-2.5-pro" class="button button-primary ais">Try it in Google AI Studio</a>
    </p>
</div>

<p>Our state-of-the-art multipurpose model, which excels at coding and complex
reasoning tasks.</p>
<div><devsite-selector data-ds-scope="code-sample">
<section><h3 id="standard_11" data-text="Standard" tabindex="-1">Standard</h3><table class="pricing-table">
  <colgroup>
    <col>
    <col class="free-tier">
    <col class="paid-tier">
  </colgroup>
  <thead>
    <tr>
      <th></th>
      <th scope="col">Free Tier</th>
      <th scope="col">Paid Tier, per 1M tokens in USD</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Input price</td>
      <td>Free of charge</td>
      <td>$1.25, prompts <= 200k tokens<br>$2.50, prompts > 200k tokens</td>
    </tr>
    <tr>
      <td>Output price (including thinking tokens)</td>
      <td>Free of charge</td>
      <td>$10.00, prompts <= 200k tokens<br>$15.00, prompts > 200k</td>
    </tr>
    <tr>
      <td>Context caching price</td>
      <td>Not available</td>
      <td>$0.125, prompts <= 200k tokens<br>$0.25, prompts > 200k<br>$4.50 / 1,000,000 tokens per hour (storage price)</td>
    </tr>
    <tr>
      <td>Grounding with Google Search</td>
      <td>Not available</td>
      <td>1,500 RPD (free), then $35 / 1,000 grounded prompts</td>
    </tr>
    <tr>
      <td>Grounding with Google Maps</td>
      <td>Not available</td>
      <td>10,000 RPD (free), then $25 / 1,000 grounded prompts</td>
    </tr>
    <tr>
      <td>Used to improve our products</td>
      <td><a href="/gemini-api/terms">Yes</a></td>
      <td><a href="/gemini-api/terms">No</a></td>
    </tr>
  </tbody>
</table></section>
<section><h3 id="batch_10" data-text="Batch" tabindex="-1">Batch</h3><table class="pricing-table">
  <colgroup>
    <col>
    <col class="free-tier">
    <col class="paid-tier">
  </colgroup>
  <thead>
    <tr>
      <th></th>
      <th scope="col">Free Tier</th>
      <th scope="col">Paid Tier, per 1M tokens in USD</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Input price</td>
      <td>Not available</td>
      <td>$0.625, prompts <= 200k tokens<br>$1.25, prompts > 200k tokens</td>
    </tr>
    <tr>
      <td>Output price (including thinking tokens)</td>
      <td>Not available</td>
      <td>$5.00, prompts <= 200k tokens<br>$7.50, prompts > 200k</td>
    </tr>
    <tr>
      <td>Context caching price</td>
      <td>Not available</td>
      <td>$0.125, prompts <= 200k tokens<br>$0.25, prompts > 200k<br>$4.50 / 1,000,000 tokens per hour (storage price)</td>
    </tr>
    <tr>
      <td>Grounding with Google Search</td>
      <td>Not available</td>
      <td>1,500 RPD (free), then $35 / 1,000 grounded prompts</td>
    </tr>
    <tr>
      <td>Grounding with Google Maps</td>
      <td>Not available</td>
      <td>Not available</td>
    </tr>
    <tr>
      <td>Used to improve our products</td>
      <td><a href="/gemini-api/terms">Yes</a></td>
      <td><a href="/gemini-api/terms">No</a></td>
    </tr>
  </tbody>
</table></section>
<section><h3 id="flex_7" data-text="Flex" tabindex="-1">Flex</h3><table class="pricing-table">
  <colgroup>
    <col>
    <col class="free-tier">
    <col class="paid-tier">
  </colgroup>
  <thead>
    <tr>
      <th></th>
      <th scope="col">Free Tier</th>
      <th scope="col">Paid Tier, per 1M tokens in USD</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Input price</td>
      <td>Not available</td>
      <td>$0.625, prompts <= 200k tokens<br>$1.25, prompts > 200k tokens</td>
    </tr>
    <tr>
      <td>Output price (including thinking tokens)</td>
      <td>Not available</td>
      <td>$5.00, prompts <= 200k tokens<br>$7.50, prompts > 200k</td>
    </tr>
    <tr>
      <td>Context caching price</td>
      <td>Not available</td>
      <td>$0.125, prompts <= 200k tokens<br>$0.25, prompts > 200k<br>$4.50 / 1,000,000 tokens per hour (storage price)</td>
    </tr>
    <tr>
      <td>Grounding with Google Search</td>
      <td>Not available</td>
      <td>1,500 RPD (free), then $35 / 1,000 grounded prompts</td>
    </tr>
    <tr>
      <td>Grounding with Google Maps</td>
      <td>Not available</td>
      <td>Not available</td>
    </tr>
    <tr>
      <td>Used to improve our products</td>
      <td><a href="/gemini-api/terms">Yes</a></td>
      <td><a href="/gemini-api/terms">No</a></td>
    </tr>
  </tbody>
</table></section>
<section><h3 id="priority_7" data-text="Priority" tabindex="-1">Priority</h3><table class="pricing-table">
  <colgroup>
    <col>
    <col class="free-tier">
    <col class="paid-tier">
  </colgroup>
  <thead>
    <tr>
      <th></th>
      <th scope="col">Free Tier</th>
      <th scope="col">Paid Tier, per 1M tokens in USD</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Input price</td>
      <td>Free of charge</td>
      <td>$2.25, prompts <= 200k tokens<br>$4.50, prompts > 200k tokens</td>
    </tr>
    <tr>
      <td>Output price (including thinking tokens)</td>
      <td>Free of charge</td>
      <td>$18.00, prompts <= 200k tokens<br>$27.00, prompts > 200k</td>
    </tr>
    <tr>
      <td>Context caching price</td>
      <td>Not available</td>
      <td>$0.225, prompts <= 200k tokens<br>$0.45, prompts > 200k<br>$8.10 / 1,000,000 tokens per hour (storage price)</td>
    </tr>
    <tr>
      <td>Grounding with Google Search</td>
      <td>Not available</td>
      <td>1,500 RPD (free), then $35 / 1,000 grounded prompts</td>
    </tr>
    <tr>
      <td>Grounding with Google Maps</td>
      <td>Not available</td>
      <td>10,000 RPD (free), then $25 / 1,000 grounded prompts</td>
    </tr>
    <tr>
      <td>Used to improve our products</td>
      <td><a href="/gemini-api/terms">Yes</a></td>
      <td><a href="/gemini-api/terms">No</a></td>
    </tr>
  </tbody>
</table></section>
</devsite-selector></div>
<div class="models-section">
    <div class="heading-group">
        
<h2 id="gemini-2.5-flash" data-text="Gemini 2.5 Flash" tabindex="-1">Gemini 2.5 Flash</h2>
        <em><code translate="no" dir="ltr">gemini-2.5-flash</code></em>
    </div>
    <p>
        <a href="https://aistudio.google.com?model=gemini-2.5-flash" class="button button-primary ais">Try it in Google AI Studio</a>
    </p>
</div>

<p>Our first hybrid reasoning model which supports a 1M token context window and
has thinking budgets.</p>
<div><devsite-selector data-ds-scope="code-sample">
<section><h3 id="standard_12" data-text="Standard" tabindex="-1">Standard</h3><table class="pricing-table">
  <colgroup>
    <col>
    <col class="free-tier">
    <col class="paid-tier">
  </colgroup>
  <thead>
    <tr>
      <th></th>
      <th scope="col">Free Tier</th>
      <th scope="col">Paid Tier, per 1M tokens in USD</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Input price</td>
      <td>Free of charge</td>
      <td>$0.30 (text / image / video)<br>$1.00 (audio)</td>
    </tr>
    <tr>
      <td>Output price (including thinking tokens)</td>
      <td>Free of charge</td>
      <td>$2.50</td>
    </tr>
    <tr>
      <td>Context caching price</td>
      <td>Not available</td>
      <td>$0.03 (text / image / video)<br>$0.1 (audio)<br>$1.00 / 1,000,000 tokens per hour (storage price)</td>
    </tr>
    <tr>
      <td>Grounding with Google Search</td>
      <td>Free of charge, up to 500 RPD (limit shared with Flash-Lite RPD)</td>
      <td>1,500 RPD (free, limit shared with Flash-Lite RPD), then $35 / 1,000 grounded prompts</td>
    </tr>
    <tr>
      <td>Grounding with Google Maps</td>
      <td>500 RPD</td>
      <td>1,500 RPD (free), then $25 / 1,000 grounded prompts</td>
    </tr>
    <tr>
      <td>Used to improve our products</td>
      <td><a href="/gemini-api/terms">Yes</a></td>
      <td><a href="/gemini-api/terms">No</a></td>
    </tr>
  </tbody>
</table></section>
<section><h3 id="batch_11" data-text="Batch" tabindex="-1">Batch</h3><table class="pricing-table">
  <colgroup>
    <col>
    <col class="free-tier">
    <col class="paid-tier">
  </colgroup>
  <thead>
    <tr>
      <th></th>
      <th scope="col">Free Tier</th>
      <th scope="col">Paid Tier, per 1M tokens in USD</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Input price</td>
      <td>Not available</td>
      <td>$0.15 (text / image / video)<br>$0.50 (audio)</td>
    </tr>
    <tr>
      <td>Output price (including thinking tokens)</td>
      <td>Not available</td>
      <td>$1.25</td>
    </tr>
    <tr>
      <td>Context caching price</td>
      <td>Not available</td>
      <td>$0.03 (text / image / video)<br>$0.1 (audio)<br>$1.00 / 1,000,000 tokens per hour (storage price)</td>
    </tr>
    <tr>
      <td>Grounding with Google Search</td>
      <td>Not available</td>
      <td>1,500 RPD (free, limit shared with Flash-Lite RPD), then $35 / 1,000 grounded prompts</td>
    </tr>
    <tr>
      <td>Grounding with Google Maps</td>
      <td>Not available</td>
      <td>Not available</td>
    </tr>
    <tr>
      <td>Used to improve our products</td>
      <td><a href="/gemini-api/terms">Yes</a></td>
      <td><a href="/gemini-api/terms">No</a></td>
    </tr>
  </tbody>
</table></section>
<section><h3 id="flex_8" data-text="Flex" tabindex="-1">Flex</h3><table class="pricing-table">
  <colgroup>
    <col>
    <col class="free-tier">
    <col class="paid-tier">
  </colgroup>
  <thead>
    <tr>
      <th></th>
      <th scope="col">Free Tier</th>
      <th scope="col">Paid Tier, per 1M tokens in USD</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Input price</td>
      <td>Not available</td>
      <td>$0.15 (text / image / video)<br>$0.50 (audio)</td>
    </tr>
    <tr>
      <td>Output price (including thinking tokens)</td>
      <td>Not available</td>
      <td>$1.25</td>
    </tr>
    <tr>
      <td>Context caching price</td>
      <td>Not available</td>
      <td>$0.03 (text / image / video)<br>$0.1 (audio)<br>$1.00 / 1,000,000 tokens per hour (storage price)</td>
    </tr>
    <tr>
      <td>Grounding with Google Search</td>
      <td>Not available</td>
      <td>1,500 RPD (free, limit shared with Flash-Lite RPD), then $35 / 1,000 grounded prompts</td>
    </tr>
    <tr>
      <td>Grounding with Google Maps</td>
      <td>Not available</td>
      <td>Not available</td>
    </tr>
    <tr>
      <td>Used to improve our products</td>
      <td><a href="/gemini-api/terms">Yes</a></td>
      <td><a href="/gemini-api/terms">No</a></td>
    </tr>
  </tbody>
</table></section>
<section><h3 id="priority_8" data-text="Priority" tabindex="-1">Priority</h3><table class="pricing-table">
  <colgroup>
    <col>
    <col class="free-tier">
    <col class="paid-tier">
  </colgroup>
  <thead>
    <tr>
      <th></th>
      <th scope="col">Free Tier</th>
      <th scope="col">Paid Tier, per 1M tokens in USD</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Input price</td>
      <td>Free of charge</td>
      <td>$0.54 (text / image / video)<br>$1.80 (audio)</td>
    </tr>
    <tr>
      <td>Output price (including thinking tokens)</td>
      <td>Free of charge</td>
      <td>$4.50</td>
    </tr>
    <tr>
      <td>Context caching price</td>
      <td>Not available</td>
      <td>$0.054 (text / image / video)<br>$0.18 (audio)<br>$1.80 / 1,000,000 tokens per hour (storage price)</td>
    </tr>
    <tr>
      <td>Grounding with Google Search</td>
      <td>Free of charge, up to 500 RPD (limit shared with Flash-Lite RPD)</td>
      <td>1,500 RPD (free, limit shared with Flash-Lite RPD), then $35 / 1,000 grounded prompts</td>
    </tr>
    <tr>
      <td>Grounding with Google Maps</td>
      <td>500 RPD</td>
      <td>1,500 RPD (free), then $25 / 1,000 grounded prompts</td>
    </tr>
    <tr>
      <td>Used to improve our products</td>
      <td><a href="/gemini-api/terms">Yes</a></td>
      <td><a href="/gemini-api/terms">No</a></td>
    </tr>
  </tbody>
</table></section>
</devsite-selector></div>
<div class="models-section">
    <div class="heading-group">
        
"""

