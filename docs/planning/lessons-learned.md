# Lessons Learned

> **Purpose:** The always-loaded **active** tier of the guidance lifecycle —
> durable tactics that must be in context before the same mistake repeats.
> Everything else lives in `lessons-archive.md`, which is **never** read at
> session start: search it with
> `python -m ai_router.guidance_search --archive`.
>
> **Never delete — archive.** Lifecycle mechanics (id markers, the usage
> ledger, retention windows, the preload admission test) are canonical in
> [`docs/guidance-lifecycle.md`](../guidance-lifecycle.md), opened at Step 9;
> citing at close is already a constitution Step 8 obligation. Validate
> markers with `python -m ai_router.validate_guidance_meta`; this file is
> capped by the preload manifest (`python -m ai_router.guidance_report
> --check`).
>
> **Note for consumer repos:** the lessons below are portable. Add
> repo-specific ones under a heading of your own at the bottom.

---

## Portable Lessons (all AI-led-workflow repos)

<!-- lesson-pointer: archived-set="134" -->

> **Where the retired ids went.** Sets 073, 085, 095, 110 and 121 each left a
> table here recording which lessons had been promoted, encoded or archived and
> where their rule now lives. Set 134 S3 measured those five tables at **1,371
> tokens — 60% of this file's preload budget, against 436 tokens of live
> lessons** — and moved them whole to `lessons-archive.md` → *Archived by Set
> 134 S3*. No id was lost and no rule moved: every one of them points at
> `project-guidance.md` (preload, so the pointer was paid twice) or at shipped
> code with its own falsifier. Look one up with
> `python -m ai_router.guidance_search --archive <id>`.

## Windows cp1252 Is A Standing Bug Class — Bytes At Subprocess Boundaries, Persist Before Printing
<!-- lesson: id="L-079-1" added-set="079" scope="portable" -->

- Pass **bytes** end-to-end across a subprocess pipe and decode once at
  the consumer with an explicit codec, and write routed output to disk
  with `encoding="utf-8"` **before** printing it — a text-mode pipe with
  no `encoding=` decodes as cp1252 on Windows, and a mid-print crash
  loses the paid output. (Set 121 S1: the routed-output half is encoded
  in `cli_transport`; **29 production call sites still pass `text=True`
  with no `encoding=`** and are an open residual.)

## A Replacement Doc Inherits The Retired Doc's Claims At Its Peril
<!-- lesson: id="L-064-8" added-set="063" scope="portable" -->

- When authoring a replacement or successor doc, grep the new text for
  claims of *current* behavior (reads, writes, enforcement, defaults) and
  re-verify each against the code before routing verification — prose
  carried over from a superseded doc was true in the old context and
  reads authoritative in the new one.


## Ship Every Pattern Gate With A Falsifier That Plants The Violation
<!-- lesson: id="L-112-1" added-set="112" scope="portable" -->

- Per rule: one falsifier that plants the defect and asserts the gate
  fires, one that plants the legitimate look-alike and asserts it does
  not. Assert the **rule**, not a substring a sibling rule also emits,
  and add a structural assertion beside the textual one. A gate that
  matches nothing looks identical to one that finds nothing, and reading
  its regexes reads as confirmation. (Set 121 S1: the *assert your
  corpus is non-empty* half is now enforced —
  `ai_router/corpus_scan_guard.py`.)
