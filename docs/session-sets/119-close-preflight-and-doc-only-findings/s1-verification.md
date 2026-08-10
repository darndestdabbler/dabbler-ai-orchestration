**VERIFIED** — I checked the plan obligations against the changed implementation, schemas, templates, classifier call sites, operator decision record, template hash pin, and targeted tests. The `evidencePaths` contract is wired on both surfaces, the doc-only cap is applied at the shared blocking predicate, and the required falsifiers are present.

#### NITS

- **Nit:** Doc-capped findings are classified and reported as Minor/nit, but the raw finding dict still preserves its original `severity` value, so durable artifacts may still show `Major` for a capped finding. The loop/gates use `is_blocking_issue`, so this does not reopen rounds.