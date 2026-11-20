import { COUNTRIES } from '../config';
import { Agreement, Invoice, Plan } from '../types';
import { daysBetween, dueDateIn, monthNumber } from '../utils/dates';
import { roundHalfUp, vatOf } from '../utils/money';

/**
 * Every invoice of an agreement whose due date is within [from, to] (inclusive).
 * The schedule is always walked from the start, so invoice_no is the position in the full schedule.
 */
export function buildSchedule(agreement: Agreement, plan: Plan, from: string, to: string): Invoice[] {
  const { start_date: start, due_day: dueDay } = agreement;
  const { vatPercent } = COUNTRIES[plan.country];

  const makeInvoice = (invoice_no: number, due_date: string, net: number, proration: Invoice['proration']): Invoice => {
    const vat = vatOf(net, vatPercent);
    const kind = invoice_no === 1 ? 'FIRST' : 'MONTHLY';
    return { invoice_no, due_date, kind, proration, net, vat, total: net + vat, currency: plan.currency };
  };

  // N = first due date strictly after start, P = the due date one month before N
  let nextMonth = monthNumber(start);
  if (dueDateIn(nextMonth, dueDay) <= start) nextMonth++;
  const N = dueDateIn(nextMonth, dueDay);
  const P = dueDateIn(nextMonth - 1, dueDay);

  // Invoice 1: prorated monthly (rounding #1) + joining fee, due on the start date
  const days = daysBetween(start, N);
  const cycleDays = daysBetween(P, N);
  const firstNet = roundHalfUp(plan.monthly * days, cycleDays) + plan.joining_fee;

  const schedule: Invoice[] = [makeInvoice(1, start, firstNet, { days, cycle_days: cycleDays })];

  // Invoice 2 onwards: full monthly price on each month's due date, starting at N
  for (let month = nextMonth, no = 2; dueDateIn(month, dueDay) <= to; month++, no++) {
    schedule.push(makeInvoice(no, dueDateIn(month, dueDay), plan.monthly, null));
  }

  return schedule.filter((invoice) => invoice.due_date >= from && invoice.due_date <= to);
}
