import { AMOUNT_TOLERANCE } from '../config';
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
  const timesSeen = new Map<string, number>();
  for (const row of rows) {
    timesSeen.set(row.gateway_txn_id, (timesSeen.get(row.gateway_txn_id) ?? 0) + 1);
  }

  const errors: RowError[] = [];
  for (const row of rows) {
    const id = row.gateway_txn_id;
    if (timesSeen.get(id)! > 1) errors.push({ gateway_txn_id: id, code: 'DUPLICATE_TXN' });
    if (!row.attempted_on.startsWith(`${month}-`)) errors.push({ gateway_txn_id: id, code: 'ROW_OUTSIDE_MONTH' });

    const planCurrency = currencyOf(row.agreement_id);
    if (planCurrency && planCurrency !== row.currency) errors.push({ gateway_txn_id: id, code: 'CURRENCY_MISMATCH' });
  }
  return errors;
}

/**
 * Match each payment to the invoice it pays and give every payment a verdict.
 * A payment's match depends only on that payment (an invoice is never "used up"),
 * so the result is the same whatever order the rows come in.
 */
export function reconcile(rows: GatewayRow[], expected: ExpectedInvoice[]) {
  // 1. Which invoice does each payment pay? (declined payments pay nothing)
  const paidInvoices = rows.map((row) => (row.status === 'SETTLED' ? findInvoice(row, expected) : undefined));

  // 2. How many payments landed on each invoice?
  const paymentsPerInvoice = new Map<ExpectedInvoice, number>();
  for (const invoice of paidInvoices) {
    if (invoice) paymentsPerInvoice.set(invoice, (paymentsPerInvoice.get(invoice) ?? 0) + 1);
  }

  // 3. Give each payment a verdict, keeping request order
  const summary: Record<Verdict, number> = {
    MATCHED: 0,
    DUE_DAY_DRIFT: 0,
    DOUBLE_CHARGE_RISK: 0,
    MISSING_FROM_LEDGER: 0,
    DECLINED: 0,
  };

  const resultRows: ReconciledRow[] = rows.map((row, i) => {
    const invoice = paidInvoices[i];
    const verdict = getVerdict(row, invoice, paymentsPerInvoice);
    summary[verdict]++;
    return {
      gateway_txn_id: row.gateway_txn_id,
      verdict,
      invoice: invoice ? { agreement_id: invoice.agreement_id, invoice_no: invoice.invoice_no } : null,
    };
  });

  // 4. Invoices nobody paid
  const unmatchedInvoices: UnmatchedInvoice[] = expected
    .filter((invoice) => !paymentsPerInvoice.has(invoice))
    .sort(byDueDate)
    .map(({ agreement_id, invoice_no, due_date, total, currency }) => ({ agreement_id, invoice_no, due_date, total, currency }));

  return { summary, rows: resultRows, unmatched_invoices: unmatchedInvoices };
}

/** Same agreement, total within tolerance of the amount; if several fit, the earliest due date. */
function findInvoice(row: GatewayRow, expected: ExpectedInvoice[]): ExpectedInvoice | undefined {
  const candidates = expected.filter(
    (invoice) => invoice.agreement_id === row.agreement_id && Math.abs(invoice.total - row.amount) <= AMOUNT_TOLERANCE,
  );
  return candidates.sort(byDueDate)[0];
}

function getVerdict(
  row: GatewayRow,
  invoice: ExpectedInvoice | undefined,
  paymentsPerInvoice: Map<ExpectedInvoice, number>,
): Verdict {
  if (row.status === 'DECLINED') return 'DECLINED';
  if (!invoice) return 'MISSING_FROM_LEDGER';
  if (paymentsPerInvoice.get(invoice)! > 1) return 'DOUBLE_CHARGE_RISK';
  if (row.attempted_on === invoice.due_date) return 'MATCHED';
  return 'DUE_DAY_DRIFT';
}

/** Sort by due_date, then agreement_id, then invoice_no (plain string order, not locale order). */
function byDueDate(a: ExpectedInvoice, b: ExpectedInvoice): number {
  return compare(a.due_date, b.due_date) || compare(a.agreement_id, b.agreement_id) || a.invoice_no - b.invoice_no;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
