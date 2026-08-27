**VERIFIED** — I checked the amendment flow, envelope comparison, schema updates, replay script/report, and the added tests. I found no Critical/Major defect that should block this pre-close review.

**NITS**
- **Nit:** `append_amendment` still permits reason-only/caller-described amendments, but the normal `review_amendment` path rejects amendments that carry no actual change.
- **Nit:** The replay report’s finding-total wording could be clearer about excluding the unreconstructable no-envelope session.