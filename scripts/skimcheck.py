"""Show only what a reader who barely reads is guaranteed to take in.

There are no tuning parameters here, and that is the point. An earlier version
modelled skimming -- a word budget, a salience table, a decay curve down the
page -- and every one of those numbers was an unvalidated claim about human
behaviour. Tune a document against them and you fit noise.

This instead assumes a writing rule: **every paragraph carries one bold
sentence that is its point.** Given that rule, the skim is not a model of
anything. It is just: headings, code, tables, and the bold sentences.

A document passes if the task can be done from what survives. A paragraph with
no bold sentence is assumed unread, which makes it a claim by the author that
the paragraph is deletable. If it turns out not to be deletable, it needed a
bold sentence -- and that is the finding.
"""

import re
import sys
from pathlib import Path

BOLD = re.compile(r"\*\*(?:(?!\*\*).)+\*\*")
BLOCK = "▒"


def blank(text):
    """Everything that is not bold, gone. Layout survives so the page still
    looks like a page; the words do not."""
    out, last = [], 0
    for m in BOLD.finditer(text):
        out.append(re.sub(r"\S", BLOCK, text[last:m.start()]))
        out.append(m.group(0))
        last = m.end()
    out.append(re.sub(r"\S", BLOCK, text[last:]))
    return "".join(out)


def skim(md):
    out, in_fence = [], False
    for raw in md.split("\n"):
        st = raw.strip()
        if st.startswith("```"):
            in_fence = not in_fence
            out.append(raw)
        elif in_fence or not st:
            out.append(raw)
        elif st.startswith("#") or st.startswith("---") or st.startswith("|"):
            out.append(raw)                      # Headings and tables are scanned.
        else:
            indent = len(raw) - len(raw.lstrip())
            m = re.match(r"^([-*+]|\d+[.)])\s", st)
            marker = m.group(0) if m else ""
            out.append(" " * indent + marker + blank(st[len(marker):]))
    return "\n".join(out)


def audit(md):
    """Which paragraphs have no point sentence, and are therefore claimed
    deletable by their own author."""
    paras, cur, in_fence = [], [], False
    for i, raw in enumerate(md.split("\n"), 1):
        st = raw.strip()
        if st.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if not st or st.startswith("#") or st.startswith("|") or st.startswith("---"):
            if cur:
                paras.append(cur)
                cur = []
            continue
        cur.append((i, raw))
    if cur:
        paras.append(cur)

    bare, many = [], []
    for p in paras:
        text = " ".join(r for _, r in p)
        n = len(BOLD.findall(text))
        # A single short line ending in a colon is a label for the block
        # below, not a paragraph making a point. It needs no bold.
        lead_in = len(p) == 1 and text.strip().endswith(":") and len(text) < 90
        if n == 0 and not lead_in:
            bare.append((p[0][0], text.strip()[:70]))
        elif n > 2:
            many.append((p[0][0], n, text.strip()[:60]))
    return paras, bare, many


if __name__ == "__main__":
    src = Path(sys.argv[1])
    md = src.read_text()
    r = skim(md)
    words = lambda t: len([w for w in re.sub(f"[{BLOCK}]+", "", t).split() if w.strip()])
    paras, bare, many = audit(md)
    print(f"[skim] {words(r)}/{words(md)} words survive "
          f"({words(r)/words(md):.0%})", file=sys.stderr)
    print(f"[audit] {len(paras)} paragraphs, {len(bare)} with no point sentence, "
          f"{len(many)} with more than two", file=sys.stderr)
    for ln, t in bare:
        print(f"   line {ln}: no point — {t}...", file=sys.stderr)
    if len(sys.argv) > 2:
        Path(sys.argv[2]).write_text(r)
