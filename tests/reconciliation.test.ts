import { findRowErrors, reconcile } from '../src/logic/reconciliation';
import { ExpectedInvoice, GatewayRow } from '../src/types';

const invoice = (agreement_id: string, invoice_no: number, due_date: string, total: number): ExpectedInvoice => ({
  agreement_id,
  invoice_no,
  due_date,
  kind: invoice_no === 1 ? 'FIRST' : 'MONTHLY',
  proration: null,
  net: total,
  vat: 0,
  total,
  currency: 'SAR',
});

const row = (gateway_txn_id: string, overrides: Partial<GatewayRow> = {}): GatewayRow => ({
  gateway_txn_id,
  agreement_id: 'A',
  amount: 34385,
  currency: 'SAR',
  status: 'SETTLED',
  attempted_on: '2026-10-01',
  ...overrides,
});

const expected = [invoice('A', 2, '2026-10-01', 34385), invoice('B', 2, '2026-10-01', 26950)];

describe('reconcile', () => {
  it('matches the worked example', () => {
    const result = reconcile(
      [row('T-88121'), row('T-88122', { agreement_id: 'B', amount: 26950, status: 'DECLINED', attempted_on: '2026-10-02' })],
      expected,
    );
    expect(result.summary).toEqual({ MATCHED: 1, DUE_DAY_DRIFT: 0, DOUBLE_CHARGE_RISK: 0, MISSING_FROM_LEDGER: 0, DECLINED: 1 });
    expect(result.rows[0].invoice).toEqual({ agreement_id: 'A', invoice_no: 2 });
    expect(result.rows[1].invoice).toBeNull();
    // B's invoice only had a declined row, so it is still unmatched
    expect(result.unmatched_invoices.map((i) => i.agreement_id)).toEqual(['B']);
  });

  it('DUE_DAY_DRIFT when paid on a different day', () => {
    expect(reconcile([row('T1', { attempted_on: '2026-10-03' })], expected).rows[0].verdict).toBe('DUE_DAY_DRIFT');
  });

  it('accepts amounts within 1 minor unit, rejects 2 away', () => {
    expect(reconcile([row('T1', { amount: 34386 })], expected).rows[0].verdict).toBe('MATCHED');
    expect(reconcile([row('T1', { amount: 34384 })], expected).rows[0].verdict).toBe('MATCHED');
    expect(reconcile([row('T1', { amount: 34387 })], expected).rows[0].verdict).toBe('MISSING_FROM_LEDGER');
  });

  it('MISSING_FROM_LEDGER for an unknown agreement', () => {
    const result = reconcile([row('T1', { agreement_id: 'nope' })], expected);
    expect(result.rows[0]).toMatchObject({ verdict: 'MISSING_FROM_LEDGER', invoice: null });
  });

  it('every row on a double-charged invoice gets DOUBLE_CHARGE_RISK', () => {
    const result = reconcile([row('T1'), row('T2', { attempted_on: '2026-10-05' })], expected);
    expect(result.rows.map((r) => r.verdict)).toEqual(['DOUBLE_CHARGE_RISK', 'DOUBLE_CHARGE_RISK']);
    expect(result.summary.DOUBLE_CHARGE_RISK).toBe(2);
  });

  it('picks the earliest due date when several invoices fit', () => {
    const twoSameAmount = [invoice('A', 3, '2026-10-20', 100), invoice('A', 2, '2026-10-05', 100)];
    const result = reconcile([row('T1', { amount: 100 })], twoSameAmount);
    expect(result.rows[0].invoice).toEqual({ agreement_id: 'A', invoice_no: 2 });
    expect(result.unmatched_invoices.map((i) => i.invoice_no)).toEqual([3]);
  });

  it('does not depend on row order', () => {
    const rows = [row('T1'), row('T2', { agreement_id: 'B', amount: 26950 }), row('T3', { amount: 34386 })];
    const forward = reconcile(rows, expected);
    const backward = reconcile([...rows].reverse(), expected);
    expect(backward.summary).toEqual(forward.summary);
    expect(backward.rows.reverse()).toEqual(forward.rows);
    expect(backward.unmatched_invoices).toEqual(forward.unmatched_invoices);
  });

  it('sorts unmatched invoices by due_date, agreement_id, invoice_no', () => {
    const list = [invoice('B', 1, '2026-10-02', 1), invoice('B', 2, '2026-10-01', 1), invoice('A', 5, '2026-10-01', 1)];
    expect(reconcile([], list).unmatched_invoices.map((i) => `${i.agreement_id}${i.invoice_no}`)).toEqual(['A5', 'B2', 'B1']);
  });
});

describe('findRowErrors', () => {
  const currencyOf = (id: string) => (id === 'A' ? 'SAR' : undefined);

  it('flags every duplicate, outside-month row and currency mismatch', () => {
    const errors = findRowErrors(
      '2026-10',
      [
        row('T1'),
        row('T1'),
        row('T2', { attempted_on: '2026-11-01' }),
        row('T3', { currency: 'AED' }),
        row('T4', { agreement_id: 'unknown', currency: 'AED' }), // unknown agreement skips currency check
      ],
      currencyOf,
    );
    expect(errors).toEqual([
      { gateway_txn_id: 'T1', code: 'DUPLICATE_TXN' },
      { gateway_txn_id: 'T1', code: 'DUPLICATE_TXN' },
      { gateway_txn_id: 'T2', code: 'ROW_OUTSIDE_MONTH' },
      { gateway_txn_id: 'T3', code: 'CURRENCY_MISMATCH' },
    ]);
  });
});
