# Notes

## How to run

```bash
# Docker (what the graders run)
docker build -t app .
docker run -p 8080:8080 app
docker build --target test .     # runs the test suite

# Local
npm install
npm run dev      # tsx watch on :8080
npm test         # jest
npm run build && npm start
```

Stack: Node 22, TypeScript, Express 5, Jest + supertest. State lives in in-memory Maps (`src/store.ts`) and is empty on every start.

## Layout

- `src/routes.ts`: every endpoint in one place
- `src/handlers/`: request validation, store access and the response, one file per feature
- `src/logic/`: pure business rules (phone normalisation, invoice schedule, reconciliation)
- `src/utils/`: date math, integer money rounding, field validators
- `src/config.ts`: country table, VAT, limits, verdict list
- `src/types.ts`, `src/errors.ts`, `src/store.ts`

## Skipped

- Persistence. It is in-memory only, as the brief allows.
- Pagination, auth and logging beyond startup and 500s.

## Assumptions

- Concurrency: every check-then-write runs synchronously on Node's single thread, with no `await` in between, so two racing requests can't both pass a uniqueness check.
- Members always include `country` in the response, on both create and lookup.
- A lookup `country` that is not AE/SA/BH returns `422 VALIDATION`.
- A missing or non-string `phone` returns `422 VALIDATION`. A string phone that is malformed, including an empty one, returns `422 INVALID_PHONE`.
- A `+` in front of a national number (e.g. `+0551234567`) returns `INVALID_PHONE`.
- Only spaces, hyphens and round brackets are stripped. Dots, tabs or other separators return `INVALID_PHONE`.
- Name length counts characters (Unicode code points), so an emoji counts as 1.
- Validation (`422 VALIDATION`) runs before business checks such as `PHONE_TAKEN`, `PLAN_EXISTS` and `UNKNOWN_*`.
- On `GET /agreements/{id}/invoices`, an unknown id returns 404 before the query params are validated.
- The range limit is `to − from ≤ 366` days, so a 366-day range is allowed and 367 returns `INVALID_RANGE`.
- Plan `id` must be a non-empty string. Plan ids are case-sensitive.
- Row `currency` only has to be a string. A value that differs from the agreement's plan currency is reported as `CURRENCY_MISMATCH`, not `VALIDATION`.
- An empty `rows` array is accepted. All expected invoices for that month then come back as unmatched.
- The ±1 minor-unit tolerance is inclusive: `|total − amount| ≤ 1`.
- If two candidates share the earliest due date, the lower `invoice_no` wins. The brief gives no tie-break for this case.
- `DUPLICATE_TXN` adds one error entry per duplicated row, so a txn id that appears twice gives two entries.
- `ROW_OUTSIDE_MONTH` and `CURRENCY_MISMATCH` apply to DECLINED rows too, because the rule is "any failing row".
- Run rows and `unmatched_invoices` use exactly the fields shown in the brief's example. Rows have `gateway_txn_id`, `verdict` and `invoice`. Unmatched invoices have `agreement_id`, `invoice_no`, `due_date`, `total` and `currency`.
- Request bodies are parsed as JSON whatever their `Content-Type`. Invalid JSON returns `422 VALIDATION`.
- An unknown route returns `404 NOT_FOUND` with the standard error body.
