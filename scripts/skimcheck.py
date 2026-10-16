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

# A bold span may wrap across lines but never across a blank line.
BOLD = re.compile(r"\*\*(?:(?!\*\*)[^\n]|\n(?!\s*\n))+?\*\*")
BLOCK = "▒"


def skim(md):
    """Blank every character the eye never lands on.

    Whole-document, by offset, deliberately. An earlier version walked line by
    line and so could not see a bold span that wrapped -- it blanked the one
    sentence each paragraph existed to deliver, while the audit, which joins a
    paragraph before looking, reported the document as fine. The two halves
    disagreed and the audit was believed.
    """
    protect = []

    for m in re.finditer(r"^```.*?^```", md, re.S | re.M):
        protect.append((m.start(), m.end()))
    for m in re.finditer(r"^[ \t]*(#{1,6} .*|\|.*|-{3,}|\d+[.)] |[-*+] )$",
                         md, re.M):
        protect.append((m.start(), m.end()))
    for m in re.finditer(r"^[ \t]*(#{1,6} .*|\|.*|-{3,})$", md, re.M):
        protect.append((m.start(), m.end()))
    # List markers keep their shape so the reader still sees a list.
    for m in re.finditer(r"^[ \t]*(\d+[.)]|[-*+])[ \t]", md, re.M):
        protect.append((m.start(), m.end()))
    for m in BOLD.finditer(md):
        protect.append((m.start(), m.end()))

    keep = bytearray(len(md))
    for a, b in protect:
        for i in range(a, b):
            keep[i] = 1

    out = []
    for i, ch in enumerate(md):
        if keep[i] or ch.isspace():
            out.append(ch)
        else:
            out.append(BLOCK)
    return "".join(out)


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
        # A blockquote is displayed material -- a quoted invariant, a pulled-out
        # warning -- not a paragraph of prose owing a point sentence.
        if (not st or st.startswith("#") or st.startswith("|")
                or st.startswith("---") or st.startswith(">")):
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
        # A paragraph opening in italics is marked by its author as
        # illustration -- evidence for a point made elsewhere. It is meant to
        # go unread by a skimmer, which is exactly the claim "no bold" makes.
        illustration = text.strip().startswith("*") and not text.strip().startswith("**")
        if n == 0 and not lead_in and not illustration:
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
