# GymNation API — Specification

Source: GymNation take-home brief. This file restates every requirement from it.

---

## 0. Submission & scoring

- Scoring is automated: the container is built and a few hundred unseen requests are replayed. Each part is scored separately.
- Only the `main` branch is checked. Repo size limit: 200 MB.
- Required in repo root:
  - `Dockerfile` (with a `test` stage)
  - `NOTES.md` — how to run, what was skipped, one line per assumption
  - `PROMPTS.md` — AI conversations (exported or pasted)
- Form also needs: repo URL, ~5 min walkthrough video URL (explain the code and the prompts used), LinkedIn/GitHub profile.
- If Parts 1 and 2 pass the bar → 45-min interview on own laptop with own AI tools: add a feature live, then checks are re-run.
- A failed build or start gets one 48-hour window to push a fix to the same branch (visible via ticket status).

---

## 1. Contract (applies to everything)

| Rule | Detail |
|---|---|
| Build / run | `docker build -t app .` then `docker run -p 8080:8080 app` |
| Listen | `0.0.0.0:8080` |
| Health | `GET /health` → `200` within 60 s of start |
| Tests | Dockerfile stage named `test`; `docker build --target test .` must succeed |
| Runtime | No network. State in memory (or embedded store). Every run starts empty |
| Format | JSON in, JSON out |
| Dates | `YYYY-MM-DD`, no time, no zone |
| Money | Always an integer in **minor units**. Each invoice carries its currency |
| IDs | Generated IDs are unique strings, any format |
| Concurrency | Any "may not" rule must hold when two requests race |

### Error body

```json
{ "error": { "code": "...", "message": "..." } }
```

| Situation | Status | Code |
|---|---|---|
| Malformed input: missing field, wrong type, unparseable date, out-of-range value | 422 | `VALIDATION` |
| Unknown ID in the URL | 404 | `NOT_FOUND` |
| Business errors | as stated per part | as stated per part |

---

## 2. Countries

| Country | Code | Dial | Currency | Minor unit | VAT | National mobile | E.164 mobile |
|---|---|---|---|---|---|---|---|
| UAE | `AE` | 971 | AED | 100 fils = 1 AED | 5% | `05X XXX XXXX` | `+9715XXXXXXXX` |
| Saudi Arabia | `SA` | 966 | SAR | 100 halalas = 1 SAR | 15% | `05X XXX XXXX` | `+9665XXXXXXXX` |
| Bahrain | `BH` | 973 | BHD | 1000 fils = 1 BHD | 10% | `3XXX XXXX` | `+9733XXXXXXX` |

- AE / SA national mobiles: 10 digits starting with `05`.
- BH national mobiles: 8 digits starting with `3` (no trunk zero).
- Nothing else is a valid phone.

---

## 3. Part 1 — Members and phones

### Endpoints

**`POST /members`**

```json
{ "name": "Noura Al Harbi", "country": "SA", "phone": "055 123 4567" }
```
→ `201`
```json
{ "id": "…", "name": "Noura Al Harbi", "country": "SA", "phone": "+966551234567" }
```

**`GET /members/lookup?phone=...[&country=XX]`**

All of these find the member above:
- `?phone=966551234567`
- `?phone=%2B966551234567`
- `?phone=055%20123%204567&country=SA`

→ `200` the same member each time. `404 NOT_FOUND` if nobody has that number.

### Field rules

- `name`: trimmed, then 1–120 characters. Returned trimmed.
- `country`: `AE`, `SA` or `BH`.

### Phone rules

1. **Clean** — remove spaces, hyphens, round brackets. If anything other than digits and one leading `+` remains → `422 INVALID_PHONE`.
2. **Accepted forms** — `+` dial code + mobile; dial code + mobile (no `+`); or a national mobile. `00` prefix, landline, wrong length, anything else → `422 INVALID_PHONE`.
3. **National numbers need a country**
   - POST: a national number is read in the member's own country and must match that country's shape.
   - Lookup without `country`: a number matching any country's national shape → `422 PHONE_NEEDS_COUNTRY`. With `country`: must match that country's shape.
4. **International numbers**
   - Lookup: a `country` that disagrees with the dial code → `422 PHONE_COUNTRY_MISMATCH`.
   - POST: a number from any of the three countries is allowed (foreign SIMs).
5. **One member per phone** — no two members may share a phone in any spelling. Second write → `409 PHONE_TAKEN` with `existing_member_id` inside `error`. Must hold under simultaneous writes.

---

## 4. Part 2 — Plans and invoice schedule

### Plans

Created only through the API; nothing is seeded.

**`POST /plans`**
```json
{ "id": "anytime-sa", "country": "SA", "monthly": 29900, "joining_fee": 0 }
```
→ `201`
```json
{ "id": "anytime-sa", "country": "SA", "currency": "SAR", "monthly": 29900, "joining_fee": 0 }
```

- `id` is chosen by the caller. Duplicate → `409 PLAN_EXISTS`.
- `monthly`: integer > 0. `joining_fee`: integer ≥ 0. Both pre-VAT, minor units.
- `currency` and VAT rate come from the country.

### Agreements

**`POST /agreements`**
```json
{ "member_id": "…", "plan_id": "anytime-sa", "start_date": "2026-09-20", "due_day": 1 }
```
→ `201 { id, member_id, plan_id, start_date, due_day }`

- `due_day`: 1–31. A member may have several agreements.
- Unknown member → `422 UNKNOWN_MEMBER`. Unknown plan → `422 UNKNOWN_PLAN`.
- Plan country ≠ member country → `422 PLAN_COUNTRY_MISMATCH`.
- Agreements never end. Invoices are computed on request; nothing is stored.

### Invoices

**`GET /agreements/{id}/invoices?from=YYYY-MM-DD&to=YYYY-MM-DD`** → `200` list of:

```json
{
  "invoice_no": 1,
  "due_date": "2026-09-20",
  "kind": "FIRST",
  "proration": { "days": 11, "cycle_days": 30 },
  "net": 10963,
  "vat": 1644,
  "total": 12607,
  "currency": "SAR"
}
```

- `from` and `to` required, inclusive, filter on `due_date`.
- `to` before `from`, or `to` more than 366 days after `from` → `422 INVALID_RANGE`.
- `invoice_no` = position in the agreement's full schedule (does not restart inside the range).

### Rules

1. **Due dates** — due date in a month = `min(due_day, days in that month)`. The anchor stays (e.g. 31); only the date clamps: 30 Apr, 28/29 Feb, 31 Mar.
2. **First invoice** (`invoice_no` 1, `kind` FIRST) — due on the start date.
   Let **N** = first due date strictly after start, **P** = the due date one month before N.
   - `net = round(monthly × (N − start) / (N − P)) + joining_fee`
   - `proration = { days: N − start, cycle_days: N − P }`
   - If start is itself a due date, days = cycle_days (full price).
3. **Later invoices** — invoice 2 is `MONTHLY`, full monthly price, due on N. Later invoices follow each month's due date. `proration` is `null`.
4. **Rounding** — round half up to a whole minor unit, exactly twice per invoice, never in between:
   - once for the prorated amount;
   - once for `vat = net × VAT rate`.
   - `total = net + vat`. The joining fee is inside the VAT base.
5. **Minor units only** — never round in major units (BHD VAT 579 fils is 0.579 BHD; rounding to 0.58 is wrong).

### Worked examples

- **SA**, plan 29900 / fee 0, start `2026-09-20`, due_day 1: N = 1 Oct, P = 1 Sep → 11/30.
  Invoice 1: net 10963 (10963.33), VAT 1644 (1644.45), total 12607.
  Invoice 2 (MONTHLY, 2026-10-01): net 29900, VAT 4485, total 34385.
- **AE**, plan 24900 / fee 9900, start `2026-09-05`, due_day 20: N = 20 Sep, P = 20 Aug → 15/31.
  Prorated 12048 (12048.39) + fee = net 21948, VAT 1097 (1097.4), total 23045.
  Invoice 2 due 20 Sep → September has two invoices.

---

## 5. Part 3 — Reconciling the gateway file

### Endpoints

**`POST /reconciliation/runs`**
```json
{
  "month": "2026-10",
  "rows": [
    { "gateway_txn_id": "T-88121", "agreement_id": "…", "amount": 34385, "currency": "SAR", "status": "SETTLED", "attempted_on": "2026-10-01" },
    { "gateway_txn_id": "T-88122", "agreement_id": "…", "amount": 26950, "currency": "BHD", "status": "DECLINED", "attempted_on": "2026-10-02" }
  ]
}
```
→ `201 { id, month, summary, rows, unmatched_invoices }`

**`GET /reconciliation/runs/{id}`** → `200` same body.

### Row rules

- `status`: `SETTLED` or `DECLINED`.
- `amount`: positive integer, minor units, compared with invoice `total` (VAT included).
- `agreement_id` always present but may not exist.

### Validation

Any failing row fails the whole request: `422 INVALID_ROWS`, with
`"errors": [{ "gateway_txn_id": "…", "code": "…" }]` **inside `error`** — one entry per offending row and code, any order.

| Code | When |
|---|---|
| `DUPLICATE_TXN` | Every row whose `gateway_txn_id` appears more than once |
| `ROW_OUTSIDE_MONTH` | `attempted_on` not in `month` |
| `CURRENCY_MISMATCH` | Agreement exists and its plan's currency ≠ row currency (unknown agreements skip this) |

### Matching

- **Expected invoices** = all invoices, from every agreement, whose `due_date` is in `month`.
- Only `SETTLED` rows are matched. Candidates = that row's agreement's expected invoices whose `total` is within 1 minor unit of `amount`.
- Several candidates → earliest due date. Invoices already linked to another row still count as candidates.
- No candidate (unknown agreement or nothing within tolerance) → `MISSING_FROM_LEDGER`.
- Result must not depend on row order.

### Verdicts

| Verdict | When |
|---|---|
| `MATCHED` | Only settled row linked to its invoice, and `attempted_on` = invoice `due_date` |
| `DUE_DAY_DRIFT` | Only settled row linked to its invoice, `attempted_on` on a different day |
| `DOUBLE_CHARGE_RISK` | Two or more settled rows link to the same invoice — all of them get this |
| `MISSING_FROM_LEDGER` | No candidate |
| `DECLINED` | Row status is `DECLINED`; takes no part in matching |

### Response

- `summary`: a key for every verdict, including zeros.
- `rows`: request order; each row is `{ gateway_txn_id, verdict, invoice }`, where `invoice` = `{ agreement_id, invoice_no }` or `null`.
- `unmatched_invoices`: expected invoices no settled row links to, sorted by `due_date`, then `agreement_id`, then `invoice_no`. An invoice whose only rows were declined is included.
- Runs are stored and readable by id. A run never changes members or agreements.

### Example response (for the request above)

```json
{
  "id": "…",
  "month": "2026-10",
  "summary": { "MATCHED": 1, "DUE_DAY_DRIFT": 0, "DOUBLE_CHARGE_RISK": 0, "MISSING_FROM_LEDGER": 0, "DECLINED": 1 },
  "rows": [
    { "gateway_txn_id": "T-88121", "verdict": "MATCHED", "invoice": { "agreement_id": "…", "invoice_no": 2 } },
    { "gateway_txn_id": "T-88122", "verdict": "DECLINED", "invoice": null }
  ],
  "unmatched_invoices": [
    { "agreement_id": "…", "invoice_no": 2, "due_date": "2026-10-01", "total": 26950, "currency": "BHD" }
  ]
}
```

- Response rows have exactly `gateway_txn_id`, `verdict` and `invoice`.
- Unmatched invoices have exactly `agreement_id`, `invoice_no`, `due_date`, `total` and `currency`.
