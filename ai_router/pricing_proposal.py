"""Scrape the published pricing pages and PROPOSE a diff — never a write
(Set 109 S3).

The registry recorded ``$2.50/$15.00`` for a model that bills ``$5.00/$30.00``
and nothing said so for months. The obvious fix — scrape the pricing pages and
update the config — replaces one silent-staleness surface with a worse one: a
parser that returns nothing is safe, and a parser that returns plausible wrong
numbers is worse than the placeholder it replaces, because a wrong number
carries the authority of having been "checked".

So this module never writes a rate on its own authority. It has two commands
and a file between them:

``--fetch``
    Fetch all three published pricing pages, parse them, compare against
    ``router-config.yaml``, and write ``pricing-proposal.json`` — every change
    marked ``"decision": "pending"``. The YAML is not touched. If ANY page
    fails to fetch or parse, nothing is written at all (see *All or nothing*).

``--apply``
    Read the proposal back. **Refuse** while any change is still ``pending``,
    write only the ones marked ``accept``, and stamp ``confirmed_on`` on
    exactly those entries.

The human is the accept step, and the accept step is an edit to a file: to
accept a change you must open the proposal, find the entry, and change its
decision. That is a weaker guarantee than a human understanding the number and
a stronger one than a keystroke at a ``[y/N]`` prompt — and unlike a prompt it
needs no TTY, so both halves of the flow are exercised by the hermetic suite
rather than only by the operator who walks it.

**All or nothing across providers.** If OpenAI parses and Anthropic does not,
no proposal is written. A proposal covering two of three providers reads as
"prices checked" while a third silently rots — which is the failure this
module exists to end, at one third the size.

**Structure failure and price change are different outcomes.** A price this
module did not expect is the *success* case: that is a proposal. A *shape* it
did not expect — a renamed column, a vanished section — is fatal, because a
parser reading an unfamiliar table is exactly how a plausible wrong number
gets manufactured. The structural assertions are deliberately narrow: the
header and row-label text the extraction actually depends on, and nothing
else. Row counts and CSS class names are not asserted; models come and go and
sites restyle, and an assertion that fires on harmless churn trains an
operator to ignore it.

**What is parsed, and what is ignored.** Only standard per-token input and
output rates. Cached-input columns, cache-write columns, batch / flex /
priority tiers, free tiers, storage and grounding rows are all ignored — the
router bills none of them, and a parser that reads a column it does not need
is a parser with more ways to bind the wrong number. On Google that exclusion
is load-bearing rather than cosmetic: the Batch section is exactly half the
Standard rate, so reading the wrong section would understate by 2x, the same
magnitude and shape as the defect this whole effort exists to end.

CLI usage::

    python -m ai_router.pricing_proposal --fetch     # writes the proposal
    # ...a human edits pricing-proposal.json, setting accept / reject...
    python -m ai_router.pricing_proposal --apply     # writes only accepted
"""

from __future__ import annotations

import argparse
import datetime
import json
import re
import sys
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Optional, Sequence

import httpx

try:  # package vs bare-import (mirrors the rest of ai_router)
    from .config import _resolve_config_path, load_config
    from .pricing import (
        CONFIRMED_ON_KEY,
        PRICING_KEY,
        PricingError,
        unconfirmed_and_stale,
        validate_model_rates,
    )
except ImportError:  # pragma: no cover - test/bare context
    from config import _resolve_config_path, load_config  # type: ignore[import-not-found]
    from pricing import (  # type: ignore[import-not-found]
        CONFIRMED_ON_KEY,
        PRICING_KEY,
        PricingError,
        unconfirmed_and_stale,
        validate_model_rates,
    )


SCHEMA_VERSION = 1

#: The published pages, confirmed fetchable and server-rendered on 2026-08-04.
#: Held here rather than in ``router-config.yaml`` on purpose: a consumer repo
#: that repoints ``base_url`` at a proxy has changed where CALLS go, not where
#: OpenAI publishes its price list.
PRICING_PAGES: dict[str, str] = {
    "openai": "https://developers.openai.com/api/docs/pricing",
    "anthropic": "https://platform.claude.com/docs/en/about-claude/pricing",
    "google": "https://ai.google.dev/gemini-api/docs/pricing",
}

DEFAULT_PROPOSAL_FILENAME = "pricing-proposal.json"

EXIT_NO_CHANGES = 0
EXIT_CHANGES = 1
EXIT_FATAL = 2

_HTTP_TIMEOUT_SECONDS = 60.0
_USER_AGENT = "dabbler-ai-router model-pricing-proposal (+https://pypi.org/project/dabbler-ai-router/)"

DECISION_PENDING = "pending"
DECISION_ACCEPT = "accept"
DECISION_REJECT = "reject"
_DECISIONS = (DECISION_PENDING, DECISION_ACCEPT, DECISION_REJECT)


class PageStructureError(RuntimeError):
    """A pricing page did not have the shape the parser was built for.

    Distinct from a changed price on purpose. This is the loud outcome: it
    aborts the whole run and writes no proposal.
    """


class ProposalError(RuntimeError):
    """The proposal file is missing, malformed, or not ready to apply."""


# ---------------------------------------------------------------------------
# A tiny document model
#
# `html.parser` rather than a dependency, and rather than regex. Not a
# stylistic preference: the Google page emits UNESCAPED `<=` inside table
# cells (`$1.25, prompts <= 200k tokens`), and the obvious `<[^>]+>` strip
# swallows the tier boundary as though it were an open tag — silently, leaving
# a plausible-looking single price. `html.parser` hands `<` back as text.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Heading:
    level: int
    text: str


@dataclass(frozen=True)
class Code:
    text: str


@dataclass(frozen=True)
class Table:
    rows: list[list[str]]


class _DocumentParser(HTMLParser):
    """Flatten a page into an ordered list of headings, code spans, and
    tables. Cell text keeps ``<br>`` as a newline — Google states two rates in
    one cell separated by exactly that.
    """

    _HEADINGS = {"h1": 1, "h2": 2, "h3": 3, "h4": 4}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[Any] = []
        self._table_depth = 0
        self._rows: list[list[str]] = []
        self._cells: list[str] = []
        self._buffer: list[str] = []
        self._capturing: Optional[str] = None

    # -- capture helpers ----------------------------------------------------

    def _flush_text(self) -> str:
        text = "".join(self._buffer)
        self._buffer = []
        # Collapse runs of whitespace per line, but keep the line breaks that
        # <br> introduced: they separate one rate from the next.
        lines = [re.sub(r"[ \t\r\f\v]+", " ", ln).strip() for ln in text.split("\n")]
        return "\n".join(ln for ln in lines if ln)

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag == "table":
            self._table_depth += 1
            if self._table_depth == 1:
                self._rows, self._cells, self._buffer = [], [], []
            return
        if self._table_depth:
            if tag == "tr":
                self._cells = []
            elif tag in ("td", "th"):
                self._buffer = []
                self._capturing = "cell"
            elif tag == "br":
                self._buffer.append("\n")
            return
        if tag in self._HEADINGS or tag == "code":
            self._buffer = []
            self._capturing = tag

    def handle_startendtag(self, tag: str, attrs) -> None:
        if tag == "br" and self._table_depth:
            self._buffer.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag == "table":
            if self._table_depth == 1:
                self.blocks.append(Table(rows=self._rows))
                self._rows = []
            self._table_depth = max(0, self._table_depth - 1)
            return
        if self._table_depth:
            if tag in ("td", "th"):
                self._cells.append(self._flush_text())
                self._capturing = None
            elif tag == "tr":
                if self._cells:
                    self._rows.append(self._cells)
                self._cells = []
            return
        if tag == self._capturing:
            text = self._flush_text()
            if tag == "code":
                if text:
                    self.blocks.append(Code(text=text))
            else:
                self.blocks.append(Heading(level=self._HEADINGS[tag], text=text))
            self._capturing = None

    def handle_data(self, data: str) -> None:
        if self._capturing or self._table_depth:
            self._buffer.append(data)


def parse_document(html_text: str) -> list[Any]:
    parser = _DocumentParser()
    parser.feed(html_text)
    parser.close()
    return parser.blocks


# ---------------------------------------------------------------------------
# Money
# ---------------------------------------------------------------------------

#: `$5`, `$5.00`, `$5 / MTok`, `$1.25, prompts <= 200k tokens`.
_MONEY = re.compile(r"\$\s*([0-9]+(?:\.[0-9]+)?)")
#: `prompts <= 200k tokens`, `prompts <= 200,000 tokens`. The bound is what
#: makes a tier writable; without it a tiered rate cannot be proposed at all.
_UPPER_BOUND = re.compile(
    r"<=\s*([0-9][0-9,]*)\s*([km])?\b", re.IGNORECASE
)
_UNPRICED = ("free of charge", "not available", "n/a")


def parse_money(text: str) -> Optional[float]:
    """First dollar amount in *text*, or None when the cell states no rate."""
    if not text:
        return None
    if text.strip() in ("-", "—", "–"):
        return None
    if text.strip().lower() in _UNPRICED:
        return None
    match = _MONEY.search(text)
    return float(match.group(1)) if match else None


def parse_upper_bound(text: str) -> Optional[int]:
    """The ``<= N`` prompt-size bound stated in a cell line, in tokens."""
    match = _UPPER_BOUND.search(text or "")
    if not match:
        return None
    value = int(match.group(1).replace(",", ""))
    suffix = (match.group(2) or "").lower()
    if suffix == "k":
        value *= 1_000
    elif suffix == "m":
        value *= 1_000_000
    return value


# ---------------------------------------------------------------------------
# Per-provider extraction
#
# Each returns {page_key: [rate-row dicts]}, where a rate row is already in
# the `pricing:` schema shape, plus an `observations` map of rates that were
# READ but are deliberately not proposed (see the OpenAI note below).
# ---------------------------------------------------------------------------


@dataclass
class PageRates:
    """What one page says about one model."""

    rows: list[dict] = field(default_factory=list)
    observations: list[dict] = field(default_factory=list)


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise PageStructureError(message)


def parse_openai(blocks: list[Any]) -> dict[str, PageRates]:
    """OpenAI: one table, api id in column 0, Short/Long context column groups.

    The long-context rates are READ but never proposed as a tier, because the
    rendered table does not say where the boundary is — the "272K" figure is
    only in a separate embedded payload, and per-model. Manufacturing a
    boundary would be inventing the one number the page does not state, so the
    long-context pair is carried as an *observation* for a human to encode
    deliberately, and the short-context pair is what gets proposed. That is
    still enough to catch the defect that started all this: the recorded
    ``$2.50/$15.00`` against a real ``$5.00/$30.00`` is a short-context
    comparison.
    """
    table = None
    for block in blocks:
        if not isinstance(block, Table) or len(block.rows) < 3:
            continue
        header = [c.lower() for c in block.rows[1]]
        if header[:1] == ["model"] and header.count("input") == 2:
            table = block
            break
    _require(
        table is not None,
        "openai: no pricing table with a 'Model' header and two 'Input' "
        "columns was found on the page",
    )

    group_row = [c.lower() for c in table.rows[0]]
    _require(
        any("short context" in c for c in group_row)
        and any("long context" in c for c in group_row),
        "openai: the pricing table no longer carries 'Short context' and "
        f"'Long context' column groups (found {table.rows[0]!r})",
    )
    header = [c.lower() for c in table.rows[1]]
    _require(
        len(header) == 9,
        f"openai: expected 9 header columns (model + 4 short + 4 long), "
        f"found {len(header)}: {table.rows[1]!r}",
    )
    _require(
        header[1] == "input" and header[4] == "output"
        and header[5] == "input" and header[8] == "output",
        f"openai: input/output columns are not where the parser expects "
        f"them: {table.rows[1]!r}",
    )

    out: dict[str, PageRates] = {}
    for row in table.rows[2:]:
        if len(row) != 9 or not row[0]:
            continue
        short_in, short_out = parse_money(row[1]), parse_money(row[4])
        if short_in is None or short_out is None:
            continue
        rates = PageRates(
            rows=[{"input_cost_per_1m": short_in, "output_cost_per_1m": short_out}]
        )
        long_in, long_out = parse_money(row[5]), parse_money(row[8])
        if long_in is not None and long_out is not None:
            rates.observations.append(
                {
                    "label": "Long context",
                    "input_cost_per_1m": long_in,
                    "output_cost_per_1m": long_out,
                    "note": (
                        "The page does not state the prompt-size boundary for "
                        "this tier, so it is reported rather than proposed. To "
                        "adopt it, add a pricing: row with an explicit "
                        "max_input_tokens."
                    ),
                }
            )
        out[row[0].strip()] = rates
    _require(out, "openai: the pricing table parsed but yielded no priced rows")
    return out


#: "through August 31, 2026" / "starting September 1, 2026" — Anthropic states
#: an effective date as English prose inside the model-name cell, and gives one
#: model two rows.
_STARTING = re.compile(
    r"starting\s+([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})", re.IGNORECASE
)
_THROUGH = re.compile(r"through\s+[A-Z][a-z]+\s+\d{1,2},\s*\d{4}", re.IGNORECASE)
_PARENTHETICAL = re.compile(r"\([^)]*\)")
_MONTHS = {
    m: i
    for i, m in enumerate(
        [
            "january", "february", "march", "april", "may", "june", "july",
            "august", "september", "october", "november", "december",
        ],
        start=1,
    )
}


def split_anthropic_label(cell: str) -> tuple[str, Optional[str]]:
    """Return ``(display_name, effective_from)`` for one model-name cell.

    ``"Claude Sonnet 5 starting September 1, 2026"`` ->
    ``("Claude Sonnet 5", "2026-09-01")``. A ``through ...`` row is the period
    already in force, so it carries no ``effective_from`` — that is what the
    base period means. Parenthetical status noise ("(retired, ...)",
    "(limited availability)") is stripped: it is commentary on availability,
    not part of the model's identity.
    """
    text = _PARENTHETICAL.sub(" ", cell.replace("\n", " "))
    effective_from: Optional[str] = None
    starting = _STARTING.search(text)
    if starting:
        month = _MONTHS.get(starting.group(1).lower())
        if month:
            effective_from = datetime.date(
                int(starting.group(3)), month, int(starting.group(2))
            ).isoformat()
        text = text[: starting.start()]
    else:
        through = _THROUGH.search(text)
        if through:
            text = text[: through.start()]
    return re.sub(r"\s+", " ", text).strip(), effective_from


def parse_anthropic(blocks: list[Any]) -> dict[str, PageRates]:
    """Anthropic: one table keyed by DISPLAY NAME, rates as ``$5 / MTok``."""
    table = None
    for block in blocks:
        if not isinstance(block, Table) or not block.rows:
            continue
        header = [c.lower() for c in block.rows[0]]
        if "model" in header and any("output tokens" in c for c in header):
            table = block
            break
    _require(
        table is not None,
        "anthropic: no pricing table with 'Model' and 'Output Tokens' headers "
        "was found on the page",
    )

    header = [c.lower() for c in table.rows[0]]
    try:
        name_col = header.index("model")
        in_col = next(i for i, c in enumerate(header) if "base input tokens" in c)
        out_col = next(i for i, c in enumerate(header) if "output tokens" in c)
    except (ValueError, StopIteration) as exc:
        raise PageStructureError(
            "anthropic: the pricing table no longer carries the "
            "'Model' / 'Base Input Tokens' / 'Output Tokens' columns the "
            f"parser reads: {table.rows[0]!r}"
        ) from exc

    out: dict[str, PageRates] = {}
    for row in table.rows[1:]:
        if len(row) <= max(name_col, in_col, out_col) or not row[name_col]:
            continue
        display, effective_from = split_anthropic_label(row[name_col])
        input_rate, output_rate = parse_money(row[in_col]), parse_money(row[out_col])
        if not display or input_rate is None or output_rate is None:
            continue
        entry = {"input_cost_per_1m": input_rate, "output_cost_per_1m": output_rate}
        if effective_from:
            entry["effective_from"] = effective_from
        out.setdefault(display, PageRates()).rows.append(entry)
    _require(out, "anthropic: the pricing table parsed but yielded no priced rows")
    return out


_GOOGLE_STANDARD = "standard"
_GOOGLE_INPUT_LABEL = "input price"
_GOOGLE_OUTPUT_LABEL = "output price"


def parse_google(blocks: list[Any]) -> dict[str, PageRates]:
    """Google: one section per model, four billing modes each.

    Binding is by the api id in the ``<code>`` span that follows each model
    heading, never by the display name. Only the ``Standard`` section is read:
    ``Batch`` is half price for the same model, so a parser that wandered into
    the wrong section would understate by exactly 2x.
    """
    out: dict[str, PageRates] = {}
    model_id: Optional[str] = None
    in_standard = False

    for block in blocks:
        if isinstance(block, Heading):
            if block.level <= 2:
                model_id, in_standard = None, False
            elif block.level >= 3:
                in_standard = block.text.strip().lower() == _GOOGLE_STANDARD
            continue
        if isinstance(block, Code):
            # The id span directly under a model heading. Later <code> spans
            # inside a section are sample snippets, so only the first after a
            # heading is taken.
            if model_id is None and re.fullmatch(r"[a-z0-9][a-z0-9.\-]+", block.text):
                model_id = block.text
            continue
        if not isinstance(block, Table) or model_id is None or not in_standard:
            continue

        rates = _google_section_rates(block, model_id)
        if rates is not None and model_id not in out:
            out[model_id] = rates
        in_standard = False

    _require(
        out,
        "google: no model section yielded a Standard-tier input/output price; "
        "the page's heading -> <code> id -> 'Standard' -> table structure has "
        "changed",
    )
    return out


def _google_section_rates(table: Table, model_id: str) -> Optional[PageRates]:
    """Read one Standard-section table.

    Returns ``None`` ONLY for a section that is not token-priced at all — it
    carries no ``Input price`` / ``Output price`` rows, which is how the page's
    image, video, TTS and embedding models look. That is the one case meaning
    "this section is irrelevant".

    A section that HAS those rows but cannot be read returns an unreadable
    marker instead, because ``build_proposal`` treats ``None`` as "absent from
    the page" and reports it non-fatally. Absent and unreadable are the whole
    distinction this module turns on.
    """
    input_cell = output_cell = None
    for row in table.rows:
        if len(row) < 3:
            continue
        label = row[0].strip().lower()
        if label.startswith(_GOOGLE_INPUT_LABEL):
            input_cell = row[-1]
        elif label.startswith(_GOOGLE_OUTPUT_LABEL):
            output_cell = row[-1]
    if input_cell is None or output_cell is None:
        return None

    input_lines = [ln for ln in input_cell.split("\n") if ln.strip()]
    output_lines = [ln for ln in output_cell.split("\n") if ln.strip()]
    inputs = _priced_lines(input_lines)
    outputs = _priced_lines(output_lines)
    if inputs is None or outputs is None:
        return _unreadable(
            model_id,
            "one of its price cells lists several rates that are neither "
            "prompt-size tiers nor a labelled text rate, so which one applies "
            "to a text prompt cannot be told apart from the rest.",
        )
    if not inputs or not outputs:
        # The section HAS "Input price" / "Output price" rows and none of them
        # yields a rate this parser recognises. That is a parse failure, not an
        # irrelevant section — round 4 caught it returning None, which
        # `build_proposal` reads as "absent from the page" and reports
        # non-fatally. Absent and unreadable are the distinction this module
        # turns on, and a section that was FOUND is not absent.
        return _unreadable(
            model_id,
            "its Input/Output price rows carry no per-token rate this parser "
            "recognises.",
        )

    # A tiered cell states the same boundary on both sides. Anything else --
    # a modality split like "$0.50 (text) $3.00 (audio)", an added line, a
    # reordered one -- is not a prompt-size tier.
    #
    # An earlier draft paired the first input line with the first output line
    # in that case and returned a flat rate. Session 3's own verification round
    # was right to call that out: pairing first-with-first is a GUESS, and a
    # guess that produces a structurally valid, plausible-looking price is
    # precisely the failure this module exists to prevent. It is now UNREADABLE
    # instead — reported, never guessed, and never silently dropped either: a
    # model the config actually routes to surfaces in the proposal as "its rate
    # was NOT checked", with the reason.
    if len(inputs) != len(outputs):
        return _unreadable(
            model_id,
            f"the Standard table states {len(inputs)} input price(s) and "
            f"{len(outputs)} output price(s). Those cannot be paired without "
            "guessing which rate goes with which.",
        )

    rows: list[dict] = []
    for (in_bound, in_value), (out_bound, out_value) in zip(inputs, outputs):
        if len(inputs) > 1 and in_bound != out_bound:
            return _unreadable(
                model_id,
                f"its input and output prompt-size bounds disagree "
                f"({in_bound!r} vs {out_bound!r}).",
            )
        row: dict[str, Any] = {
            "input_cost_per_1m": in_value,
            "output_cost_per_1m": out_value,
        }
        if in_bound is not None:
            row["max_input_tokens"] = in_bound
        rows.append(row)

    # Exactly one unbounded row, or the entry cannot pass validation.
    if len(rows) > 1 and sum(1 for r in rows if "max_input_tokens" not in r) != 1:
        return _unreadable(
            model_id,
            f"it states {len(rows)} tiers but not exactly one unbounded one, "
            "so nothing prices a prompt above the largest bound.",
        )
    return PageRates(rows=rows)


def _priced_lines(lines: list[str]) -> Optional[list[tuple[Optional[int], float]]]:
    """``(bound, rate)`` per priced line, collapsing a MODALITY split.

    Google states two different things with the same multi-line cell shape:

        $1.25, prompts <= 200k tokens / $2.50, prompts > 200k tokens   <- tiers
        $0.30 (text / image / video)  / $1.00 (audio)                  <- modality

    The first is a prompt-size tier and both lines belong in the schema. The
    second is not: the router sends text, so exactly one of those lines is its
    rate and the others price products it never buys. Reading the labelled
    ``text`` line is a READ; pairing line 1 with line 1 across two cells that
    are split on different axes is a GUESS, and it is how `gemini-2.5-flash`
    silently got the right answer for the wrong reason before this session's
    verification round caught it.

    Returns ``None`` when a multi-rate cell is neither — the caller reports the
    model as unchecked rather than picking one.
    """
    priced = [(parse_upper_bound(ln), parse_money(ln), ln) for ln in lines]
    priced = [(b, v, ln) for b, v, ln in priced if v is not None]
    if len(priced) <= 1 or any(b is not None for b, _, _ in priced):
        return [(b, v) for b, v, _ in priced]
    text_lines = [(b, v) for b, v, ln in priced if _TEXT_MODALITY.search(ln)]
    if len(text_lines) != 1:
        return None
    return text_lines


#: A modality qualifier naming text, e.g. ``(text / image / video)``.
_TEXT_MODALITY = re.compile(r"\(\s*[^)]*\btext\b[^)]*\)", re.IGNORECASE)


def _unreadable(model_id: str, reason: str) -> PageRates:
    """A section that was found but cannot be read without guessing.

    Distinct from all three of: a section that prices something the router does
    not buy (returns None, correctly ignored), a page whose whole structure
    changed (fatal), and a changed price (a proposal). This one is per-model
    and only matters if the config routes to that model — in which case
    :func:`build_proposal` reports the rate as unchecked rather than proposing
    a number nobody can stand behind.
    """
    return PageRates(rows=[], observations=[{"unreadable": reason}])


PARSERS = {
    "openai": parse_openai,
    "anthropic": parse_anthropic,
    "google": parse_google,
}


# ---------------------------------------------------------------------------
# Identity binding
# ---------------------------------------------------------------------------


def anthropic_display_name(model_id: str) -> str:
    """``claude-sonnet-4-6`` -> ``Claude Sonnet 4.6``.

    Anthropic's table never prints the api id, so the binding has to be
    derived. It is derived by RULE rather than by a hand-kept lookup table: a
    second registry mapping ids to display names is one more place to drift,
    and drift between two registries is the disease being treated. Words
    titlecase; the trailing numeric run rejoins on dots. A name that does not
    match is simply not found — never approximately matched.
    """
    parts = model_id.split("-")
    words: list[str] = []
    digits: list[str] = []
    for part in parts:
        if part.isdigit():
            digits.append(part)
        else:
            if digits:  # digits followed by a word: not a trailing version run
                words.append(".".join(digits))
                digits = []
            words.append(part.capitalize())
    if digits:
        words.append(".".join(digits))
    return " ".join(words)


def page_key_for(provider: str, model_id: str) -> str:
    """The string this model is expected to appear under on its page."""
    if provider == "anthropic":
        return anthropic_display_name(model_id)
    return model_id


# ---------------------------------------------------------------------------
# Proposal building
# ---------------------------------------------------------------------------


def _current_declaration(entry: dict) -> dict:
    if entry.get(PRICING_KEY):
        return {PRICING_KEY: entry[PRICING_KEY]}
    if "input_cost_per_1m" in entry or "output_cost_per_1m" in entry:
        return {
            "input_cost_per_1m": entry.get("input_cost_per_1m"),
            "output_cost_per_1m": entry.get("output_cost_per_1m"),
        }
    return {}


def _proposed_declaration(rows: list[dict]) -> dict:
    """A single unbounded, undated row is a flat entry; anything else is a
    ``pricing:`` list. Keeping the common case flat means the proposal does not
    convert ten single-rate models into list form for no reason."""
    if len(rows) == 1 and set(rows[0]) == {"input_cost_per_1m", "output_cost_per_1m"}:
        return dict(rows[0])
    return {PRICING_KEY: rows}


def _normalized(declaration: dict) -> Any:
    """A comparison form that ignores key order and int/float spelling."""
    def _num(value):
        return round(float(value), 6) if isinstance(value, (int, float)) else value

    if PRICING_KEY in declaration:
        return [
            tuple(sorted((k, _num(v)) for k, v in row.items()))
            for row in declaration[PRICING_KEY]
        ]
    return tuple(sorted((k, _num(v)) for k, v in declaration.items()))


def build_proposal(
    config: dict,
    page_rates: dict[str, dict[str, PageRates]],
    *,
    generated_on: Optional[datetime.date] = None,
) -> dict:
    """Diff every configured model against what its provider's page says."""
    generated_on = generated_on or datetime.date.today()
    changes: list[dict] = []
    unmatched_config: list[dict] = []
    claimed: dict[str, set] = {p: set() for p in page_rates}
    never, stale = unconfirmed_and_stale(config, today=generated_on)
    needs_stamp = set(never) | set(stale)

    for alias, entry in sorted((config.get("models") or {}).items()):
        if not isinstance(entry, dict):
            continue
        provider = entry.get("provider")
        model_id = entry.get("model_id")
        rates_by_key = page_rates.get(provider)
        if rates_by_key is None or not model_id:
            continue

        key = page_key_for(provider, model_id)
        found = rates_by_key.get(key)
        if found is not None and not found.rows:
            # The section is ON the page and could not be read. That is a
            # PARSE failure on a model the config routes to, so it aborts the
            # whole run exactly as a fetch failure does.
            #
            # Round 3 rejected the softer treatment this replaced, and was
            # right to: reporting it as "not checked" while still writing a
            # proposal for the other eleven models turns a parse failure into
            # a permitted partial. The rule is that a parse failure produces
            # NO proposal, loudly — and "loudly" cannot mean a line an
            # operator may skim past on the way to applying everything else.
            unreadable = next(
                (o["unreadable"] for o in found.observations if "unreadable" in o),
                "its section could not be read",
            )
            raise PageStructureError(
                f"{provider}: model {alias!r} ({model_id}) is on the price "
                f"list but {unreadable}"
            )
        if found is None:
            # Not on the page AT ALL. Deliberately NOT fatal, and a different
            # fact: this is the specimen Session 1's drift gate exists for
            # (`gpt-5.6`, which OpenAI does not list), and it is a registry
            # defect for Session 4 rather than a parser failure. It is
            # reported loudly as unchecked so the run cannot report success
            # over a hole.
            unmatched_config.append(
                {"alias": alias, "provider": provider, "model_id": model_id,
                 "looked_for": key, "reason": "it is not listed there"}
            )
            continue
        claimed[provider].add(key)

        current = _current_declaration(entry)
        proposed = _proposed_declaration(found.rows)
        unchanged = bool(current) and _normalized(current) == _normalized(proposed)
        if unchanged and alias not in needs_stamp:
            continue
        changes.append(
            {
                "alias": alias,
                "provider": provider,
                "model_id": model_id,
                "page_key": key,
                "source_url": PRICING_PAGES[provider],
                # A rate that already matches still needs a route to a
                # `confirmed_on` stamp, or a registry whose prices are all
                # correct can never become a registry whose prices are all
                # CONFIRMED — and every stamp would age out with no sanctioned
                # way to refresh it. So an unchanged rate appears as a
                # `confirm` entry, going through the identical accept/reject
                # machinery and writing nothing but the stamp. It only appears
                # while the entry is unstamped or stale, so a freshly
                # confirmed model stays out of the way until it ages.
                "change_type": "confirm" if unchanged else "update",
                "current": current,
                "proposed": proposed,
                "observations": found.observations,
                "decision": DECISION_PENDING,
            }
        )

    unclaimed = {
        provider: sorted(set(rates) - claimed.get(provider, set()))
        for provider, rates in page_rates.items()
    }
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_by": "ai_router.pricing_proposal",
        "generated_on": generated_on.isoformat(),
        "sources": dict(PRICING_PAGES),
        "how_to_use": (
            "Set each change's \"decision\" to \"accept\" or \"reject\", then "
            "run: python -m ai_router.pricing_proposal --apply. Nothing is "
            "written to router-config.yaml until then, and any change left "
            "\"pending\" refuses the whole apply."
        ),
        "changes": changes,
        "unmatched_config_entries": unmatched_config,
        "unclaimed_page_models": unclaimed,
    }


# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------


def fetch_page(client: httpx.Client, url: str) -> str:
    response = client.get(url, follow_redirects=True,
                          headers={"User-Agent": _USER_AGENT})
    response.raise_for_status()
    return response.text


def fetch_all(client: httpx.Client) -> dict[str, dict[str, PageRates]]:
    """Fetch and parse all three pages, or raise. There is deliberately no
    partial return: see the module docstring."""
    out: dict[str, dict[str, PageRates]] = {}
    for provider, url in PRICING_PAGES.items():
        try:
            html_text = fetch_page(client, url)
        except httpx.HTTPError as exc:
            raise PageStructureError(
                f"{provider}: could not fetch {url}: {exc}"
            ) from exc
        out[provider] = PARSERS[provider](parse_document(html_text))
    return out


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


def _render_declaration(declaration: dict) -> list[str]:
    if not declaration:
        return ["      (no rates declared)"]
    if PRICING_KEY not in declaration:
        return [
            f"      in ${declaration.get('input_cost_per_1m')} / "
            f"out ${declaration.get('output_cost_per_1m')} per 1M"
        ]
    lines = []
    for row in declaration[PRICING_KEY]:
        bits = []
        if "effective_from" in row:
            bits.append(f"from {row['effective_from']}")
        if "max_input_tokens" in row:
            bits.append(f"prompts <= {row['max_input_tokens']:,}")
        else:
            bits.append("all other prompts")
        lines.append(
            f"      in ${row['input_cost_per_1m']} / "
            f"out ${row['output_cost_per_1m']} per 1M  ({', '.join(bits)})"
        )
    return lines


def render_proposal(proposal: dict) -> list[str]:
    """Operator-facing report. ASCII-only (Windows cp1252 consoles)."""
    lines: list[str] = []
    changes = proposal.get("changes") or []
    if not changes:
        lines.append("[ ] OK: every configured rate matches what its provider publishes.")
    for change in changes:
        if change.get("change_type") == "confirm":
            lines.append(
                f"[ ] {change['alias']} ({change['provider']} / "
                f"{change['model_id']}) already MATCHES the page -- "
                f"{change['source_url']}"
            )
            lines.extend(_render_declaration(change["proposed"]))
            lines.append(
                "    Accepting stamps confirmed_on and changes no rate. It is "
                "listed because it has never been confirmed, or its stamp has "
                "aged past the review window."
            )
            continue
        lines.append(
            f"[~] {change['alias']} ({change['provider']} / "
            f"{change['model_id']}) -- {change['source_url']}"
        )
        lines.append("    currently recorded:")
        lines.extend(_render_declaration(change["current"]))
        lines.append("    the page says:")
        lines.extend(_render_declaration(change["proposed"]))
        for observation in change.get("observations") or []:
            lines.append(
                f"    also on the page, NOT proposed -- {observation['label']}: "
                f"in ${observation['input_cost_per_1m']} / "
                f"out ${observation['output_cost_per_1m']} per 1M"
            )
            lines.append(f"      {observation['note']}")

    for miss in proposal.get("unmatched_config_entries") or []:
        lines.append(
            f"[x] NOT CHECKED: {miss['alias']} (model_id "
            f"{miss['model_id']!r}) -- looked for {miss['looked_for']!r} on "
            f"{miss['provider']}'s price list -- "
            + str(miss.get("reason") or "not listed there").rstrip(".")
            + ". Its rate was NOT checked."
        )
    for provider, ids in sorted((proposal.get("unclaimed_page_models") or {}).items()):
        if ids:
            lines.append(
                f"[ ] {provider} also publishes {len(ids)} model(s) no registry "
                f"entry claims: {', '.join(ids[:8])}"
                + (f", +{len(ids) - 8} more" if len(ids) > 8 else "")
            )
    if changes:
        updates = sum(1 for c in changes if c.get("change_type") != "confirm")
        confirms = len(changes) - updates
        lines.append("")
        lines.append(
            f"{updates} rate change(s) and {confirms} confirmation(s) to "
            "review. Nothing has been written. Set each \"decision\" to "
            "\"accept\" or \"reject\" in the proposal file, then run --apply."
        )
    return lines


# ---------------------------------------------------------------------------
# Apply
# ---------------------------------------------------------------------------


def load_proposal(path) -> dict:
    path = Path(path)
    if not path.exists():
        raise ProposalError(
            f"no proposal at {path}. Run "
            "`python -m ai_router.pricing_proposal --fetch` first."
        )
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ProposalError(f"proposal at {path} is unreadable: {exc}") from exc
    if payload.get("schema_version") != SCHEMA_VERSION:
        raise ProposalError(
            f"proposal at {path} is schema_version "
            f"{payload.get('schema_version')!r}; this build writes and reads "
            f"{SCHEMA_VERSION}."
        )
    return payload


def accepted_changes(proposal: dict) -> list[dict]:
    """The accepted changes, or raise if any decision is still pending.

    Refusing on a pending decision is the whole guarantee. A run that applied
    the accepted ones and left the rest would let an operator half-read a
    proposal and still write prices, which is a machine writing a rate no
    human weighed.
    """
    changes = proposal.get("changes") or []
    bad = [c for c in changes if c.get("decision") not in _DECISIONS]
    if bad:
        raise ProposalError(
            "these changes have an unrecognised decision "
            f"(expected one of {list(_DECISIONS)}): "
            + ", ".join(f"{c.get('alias')}={c.get('decision')!r}" for c in bad)
        )
    pending = [c["alias"] for c in changes if c["decision"] == DECISION_PENDING]
    if pending:
        raise ProposalError(
            f"{len(pending)} change(s) are still 'pending': "
            + ", ".join(pending)
            + ". Every change must be marked 'accept' or 'reject' before any "
            "of them is written."
        )
    return [c for c in changes if c["decision"] == DECISION_ACCEPT]


def _require_ruamel():
    """Lazy-import ruamel.yaml, mirroring ``migrate_router_config``.

    Only ``--apply`` needs it, and only because ``router-config.yaml``'s
    comments are load-bearing documentation that a plain PyYAML round-trip
    would delete. Fetching, parsing, diffing, and reporting all work without
    it, so the dependency stays in the optional extra it already lives in.
    """
    try:
        from ruamel.yaml import YAML  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover - env-dependent
        raise ProposalError(
            "--apply needs ruamel.yaml to rewrite router-config.yaml without "
            "destroying its comments. Install it with:\n"
            "    pip install 'dabbler-ai-router[migration]'\n"
            "or apply the proposed values by hand -- the proposal file states "
            "every one of them."
        ) from exc
    return YAML


def apply_changes(
    config_path,
    changes: list[dict],
    *,
    confirmed_on: Optional[datetime.date] = None,
) -> list[str]:
    """Write accepted rates into the YAML and stamp ``confirmed_on``.

    Returns the aliases written. Every entry is validated against the pricing
    schema BEFORE the file is written, so a proposal that would produce an
    unloadable config fails without leaving a half-written registry behind.
    """
    confirmed_on = confirmed_on or datetime.date.today()
    YAML = _require_ruamel()
    yaml_rt = YAML()
    yaml_rt.preserve_quotes = True
    yaml_rt.width = 4096

    path = Path(config_path)
    with path.open("r", encoding="utf-8") as handle:
        document = yaml_rt.load(handle)

    models = document.get("models") or {}
    written: list[str] = []
    for change in changes:
        alias = change["alias"]
        if alias not in models:
            raise ProposalError(
                f"the proposal names model {alias!r}, which is no longer in "
                f"{path.name}. Re-run --fetch against the current config."
            )
        entry = models[alias]
        # The proposal was built against a specific model_id. Session 4's work
        # is precisely to REPOINT aliases, so a proposal fetched before a
        # repoint would otherwise write the old model's rates into the new
        # model's entry and stamp them confirmed today.
        recorded = change.get("model_id")
        if recorded and str(entry.get("model_id")) != str(recorded):
            raise ProposalError(
                f"model {alias!r} now points at "
                f"{entry.get('model_id')!r}, but this proposal was built "
                f"against {recorded!r}. Its rates were confirmed for a "
                "different model. Re-run --fetch. Nothing was written."
            )
        proposed = change["proposed"]

        if change.get("change_type") != "confirm":
            entry.pop("input_cost_per_1m", None)
            entry.pop("output_cost_per_1m", None)
            entry.pop(PRICING_KEY, None)
            if PRICING_KEY in proposed:
                entry[PRICING_KEY] = proposed[PRICING_KEY]
            else:
                entry["input_cost_per_1m"] = proposed["input_cost_per_1m"]
                entry["output_cost_per_1m"] = proposed["output_cost_per_1m"]
        entry[CONFIRMED_ON_KEY] = confirmed_on.isoformat()

        try:
            validate_model_rates(alias, dict(entry))
        except PricingError as exc:
            raise ProposalError(
                f"applying {alias!r} would produce a config that cannot load: "
                f"{exc}. Nothing was written."
            ) from exc
        written.append(alias)

    if written:
        _refresh_rollup(document, models)
        with path.open("w", encoding="utf-8") as handle:
            yaml_rt.dump(document, handle)
    return written


def _refresh_rollup(document, models) -> bool:
    """Advance ``metadata.pricing_reviewed`` only when EVERY priced model is
    stamped. Returns whether it moved.

    The VS Code Cost Dashboard renders its staleness banner from this field.
    An earlier draft set it to the oldest EXISTING stamp, which Session 3's
    own verification round correctly called false-fresh: with two of twelve
    models stamped, the oldest existing stamp is today, and the dashboard
    would report the whole file freshly reviewed while ten rates sat
    unconfirmed. A rollup that summarises a subset is worse than a stale one,
    because it is confidently wrong rather than visibly old. So it stays put
    until there is nothing left to confirm.
    """
    priced = [
        entry for entry in models.values()
        if isinstance(entry, dict)
        and (entry.get(PRICING_KEY) or "input_cost_per_1m" in entry
             or "output_cost_per_1m" in entry)
    ]
    stamps = [str(e.get(CONFIRMED_ON_KEY)) for e in priced if e.get(CONFIRMED_ON_KEY)]
    if not priced or len(stamps) != len(priced):
        return False
    document.setdefault("metadata", {})["pricing_reviewed"] = min(stamps)
    return True


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _default_proposal_path(config_path: str) -> Path:
    return Path(config_path).parent / DEFAULT_PROPOSAL_FILENAME


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m ai_router.pricing_proposal",
        description=(
            "Compare router-config.yaml's rates against the providers' "
            "published pricing pages. --fetch proposes; --apply writes only "
            "what a human accepted. No rate is ever written without that."
        ),
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--fetch", action="store_true",
        help="Fetch the three pricing pages and write a proposal file.",
    )
    mode.add_argument(
        "--apply", action="store_true",
        help="Write the accepted changes from the proposal file into the config.",
    )
    parser.add_argument(
        "--config", default=None,
        help="Explicit router-config.yaml path (default: normal resolution).",
    )
    parser.add_argument(
        "--proposal", default=None,
        help=f"Proposal path (default: {DEFAULT_PROPOSAL_FILENAME} beside the config).",
    )
    args = parser.parse_args(argv)

    config_path = _resolve_config_path(args.config)
    proposal_path = Path(args.proposal) if args.proposal else _default_proposal_path(config_path)

    if args.fetch:
        try:
            config = load_config(args.config)
        except Exception as exc:
            print(f"[x] FATAL: cannot load router-config.yaml: {exc}", file=sys.stderr)
            return EXIT_FATAL
        try:
            with httpx.Client(timeout=_HTTP_TIMEOUT_SECONDS) as client:
                page_rates = fetch_all(client)
            # Building the proposal is inside the same guard because a
            # configured model whose section cannot be read is a parse
            # failure like any other, and must reach the same quarantine.
            proposal = build_proposal(config, page_rates)
        except PageStructureError as exc:
            print(f"[x] FATAL: {exc}", file=sys.stderr)
            print(
                "    No proposal was written. A proposal covering only the "
                "providers that happened to parse would read as 'prices "
                "checked' while one silently went stale.",
                file=sys.stderr,
            )
            # Writing nothing is not enough on its own: a proposal from an
            # EARLIER run is still sitting at this path, quite possibly with
            # decisions already marked, and a following --apply would happily
            # write its months-old numbers and stamp them confirmed today.
            # Move it aside rather than delete it — the operator's accept/reject
            # work is theirs, not this command's to throw away.
            if proposal_path.exists():
                stale_path = proposal_path.with_suffix(".stale.json")
                try:
                    proposal_path.replace(stale_path)
                except OSError as move_exc:  # pragma: no cover - fs-dependent
                    print(
                        f"[x] Could NOT move the previous proposal aside "
                        f"({move_exc}). Do not run --apply against "
                        f"{proposal_path}: this refresh failed, so its "
                        "contents are unverified.",
                        file=sys.stderr,
                    )
                else:
                    print(
                        f"    The previous proposal was moved to {stale_path} "
                        "so it cannot be applied as if it were current. Your "
                        "decisions are preserved there.",
                        file=sys.stderr,
                    )
            return EXIT_FATAL

        proposal_path.write_text(
            json.dumps(proposal, indent=2) + "\n", encoding="utf-8"
        )
        for line in render_proposal(proposal):
            print(line)
        print(f"\nWrote {proposal_path}")
        return EXIT_CHANGES if proposal["changes"] else EXIT_NO_CHANGES

    try:
        proposal = load_proposal(proposal_path)
        changes = accepted_changes(proposal)
    except ProposalError as exc:
        print(f"[x] REFUSED: {exc}", file=sys.stderr)
        return EXIT_CHANGES
    if not changes:
        print("[ ] Nothing accepted; router-config.yaml is unchanged.")
        return EXIT_NO_CHANGES
    try:
        written = apply_changes(config_path, changes)
    except ProposalError as exc:
        print(f"[x] REFUSED: {exc}", file=sys.stderr)
        return EXIT_CHANGES
    for alias in written:
        print(f"[x] wrote {alias} and stamped {CONFIRMED_ON_KEY}")
    print(f"Updated {config_path}")
    return EXIT_NO_CHANGES


if __name__ == "__main__":
    raise SystemExit(main())
