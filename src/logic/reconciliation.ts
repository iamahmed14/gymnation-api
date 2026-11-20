import { AMOUNT_TOLERANCE, VERDICTS } from '../config';
import { ExpectedInvoice, GatewayRow, ReconciledRow, UnmatchedInvoice, Verdict } from '../types';

export interface RowError {
  gateway_txn_id: string;
  code: 'DUPLICATE_TXN' | 'ROW_OUTSIDE_MONTH' | 'CURRENCY_MISMATCH';
}

/** Business checks on the file. `currencyOf` returns the plan currency of an agreement, or undefined if unknown. */
export function findRowErrors(
  month: string,
  rows: GatewayRow[],
  currencyOf: (agreementId: string) => string | undefined,
): RowError[] {
  const errors: RowError[] = [];
  const txnCounts = countBy(rows, (row) => row.gateway_txn_id);

  for (const row of rows) {
    const id = row.gateway_txn_id;
    if (txnCounts.get(id)! > 1) errors.push({ gateway_txn_id: id, code: 'DUPLICATE_TXN' });
    if (!row.attempted_on.startsWith(`${month}-`)) errors.push({ gateway_txn_id: id, code: 'ROW_OUTSIDE_MONTH' });

    const planCurrency = currencyOf(row.agreement_id);
    if (planCurrency && planCurrency !== row.currency) errors.push({ gateway_txn_id: id, code: 'CURRENCY_MISMATCH' });
  }
  return errors;
}

/**
 * Link each settled row to an expected invoice and give every row a verdict.
 * A row's link depends only on the row itself (linking never "uses up" an invoice),
 * so the result is the same whatever order the rows come in.
 */
export function reconcile(rows: GatewayRow[], expected: ExpectedInvoice[]) {
  // 1. each settled row -> its invoice: same agreement, total within tolerance, earliest due date wins
  const links = rows.map((row) => (row.status === 'SETTLED' ? findInvoice(row, expected) : null));

  // 2. how many settled rows point at each invoice
  const rowsPerInvoice = countBy(links.filter((inv) => inv !== null), invoiceKey);

  // 3. verdict per row, in request order
  const reconciledRows: ReconciledRow[] = rows.map((row, i) => {
    const inv = links[i];
    return {
      gateway_txn_id: row.gateway_txn_id,
      verdict: verdictFor(row, inv, inv ? rowsPerInvoice.get(invoiceKey(inv))! : 0),
      invoice: inv ? { agreement_id: inv.agreement_id, invoice_no: inv.invoice_no } : null,
    };
  });

  const summary = Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<Verdict, number>;
  reconciledRows.forEach((row) => summary[row.verdict]++);

  const unmatched_invoices: UnmatchedInvoice[] = expected
    .filter((inv) => !rowsPerInvoice.has(invoiceKey(inv)))
    .sort(byDueDate)
    .map(({ agreement_id, invoice_no, due_date, total, currency }) => ({ agreement_id, invoice_no, due_date, total, currency }));

  return { summary, rows: reconciledRows, unmatched_invoices };
}

function findInvoice(row: GatewayRow, expected: ExpectedInvoice[]): ExpectedInvoice | null {
  const candidates = expected.filter(
    (inv) => inv.agreement_id === row.agreement_id && Math.abs(inv.total - row.amount) <= AMOUNT_TOLERANCE,
  );
  return candidates.sort(byDueDate)[0] ?? null;
}

function verdictFor(row: GatewayRow, inv: ExpectedInvoice | null, rowsOnInvoice: number): Verdict {
  if (row.status === 'DECLINED') return 'DECLINED';
  if (!inv) return 'MISSING_FROM_LEDGER';
  if (rowsOnInvoice > 1) return 'DOUBLE_CHARGE_RISK';
  return row.attempted_on === inv.due_date ? 'MATCHED' : 'DUE_DAY_DRIFT';
}

const invoiceKey = (inv: ExpectedInvoice) => `${inv.agreement_id}#${inv.invoice_no}`;

/** Sort by due_date, then agreement_id, then invoice_no (plain string order, not locale order). */
function byDueDate(a: ExpectedInvoice, b: ExpectedInvoice): number {
  return compare(a.due_date, b.due_date) || compare(a.agreement_id, b.agreement_id) || a.invoice_no - b.invoice_no;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function countBy<T>(items: T[], keyOf: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  items.forEach((item) => counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1));
  return counts;
}
