import { buildSchedule } from '../src/logic/invoices';
import { Agreement, Plan } from '../src/types';

const saPlan: Plan = { id: 'anytime-sa', country: 'SA', currency: 'SAR', monthly: 29900, joining_fee: 0 };
const aePlan: Plan = { id: 'anytime-ae', country: 'AE', currency: 'AED', monthly: 24900, joining_fee: 9900 };

const agreement = (start_date: string, due_day: number, plan_id = 'p'): Agreement => ({
  id: 'a1',
  member_id: 'm1',
  plan_id,
  start_date,
  due_day,
});

describe('buildSchedule', () => {
  it('worked example SA: start 2026-09-20, due day 1', () => {
    const [first, second] = buildSchedule(agreement('2026-09-20', 1), saPlan, '2026-09-01', '2026-10-31');
    expect(first).toEqual({
      invoice_no: 1,
      due_date: '2026-09-20',
      kind: 'FIRST',
      proration: { days: 11, cycle_days: 30 },
      net: 10963,
      vat: 1644,
      total: 12607,
      currency: 'SAR',
    });
    expect(second).toEqual({
      invoice_no: 2,
      due_date: '2026-10-01',
      kind: 'MONTHLY',
      proration: null,
      net: 29900,
      vat: 4485,
      total: 34385,
      currency: 'SAR',
    });
  });

  it('worked example AE: start 2026-09-05, due day 20, joining fee in VAT base', () => {
    const invoices = buildSchedule(agreement('2026-09-05', 20), aePlan, '2026-09-01', '2026-09-30');
    expect(invoices).toHaveLength(2); // September has two invoices
    expect(invoices[0]).toMatchObject({ proration: { days: 15, cycle_days: 31 }, net: 21948, vat: 1097, total: 23045 });
    expect(invoices[1]).toMatchObject({ invoice_no: 2, due_date: '2026-09-20', kind: 'MONTHLY', net: 24900 });
  });

  it('start on a due date is full price', () => {
    const [first] = buildSchedule(agreement('2026-09-01', 1), saPlan, '2026-09-01', '2026-09-30');
    expect(first.proration).toEqual({ days: 30, cycle_days: 30 });
    expect(first.net).toBe(29900);
  });

  it('due day 31 clamps per month but the anchor stays at 31', () => {
    const dates = buildSchedule(agreement('2026-01-31', 31), saPlan, '2026-01-01', '2026-05-31').map((i) => i.due_date);
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });

  it('leap year February', () => {
    const dates = buildSchedule(agreement('2028-01-31', 30), saPlan, '2028-02-01', '2028-03-31').map((i) => i.due_date);
    expect(dates).toEqual(['2028-02-29', '2028-03-30']);
  });

  it('invoice_no keeps counting from the start of the schedule', () => {
    const invoices = buildSchedule(agreement('2026-01-15', 1), saPlan, '2026-06-01', '2026-06-30');
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ invoice_no: 6, due_date: '2026-06-01', kind: 'MONTHLY' });
  });

  it('range before the start date is empty', () => {
    expect(buildSchedule(agreement('2026-09-20', 1), saPlan, '2026-01-01', '2026-09-19')).toEqual([]);
  });

  it('BHD VAT is rounded in fils, not in dinars', () => {
    const bhPlan: Plan = { id: 'bh', country: 'BH', currency: 'BHD', monthly: 5790, joining_fee: 0 };
    const [first] = buildSchedule(agreement('2026-09-01', 1), bhPlan, '2026-09-01', '2026-09-01');
    expect(first).toMatchObject({ net: 5790, vat: 579, total: 6369, currency: 'BHD' });
  });
});
