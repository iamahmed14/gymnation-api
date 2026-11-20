import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { ROW_STATUSES } from '../config';
import { AppError, notFound, validationError } from '../errors';
import { buildSchedule } from '../logic/invoices';
import { findRowErrors, reconcile } from '../logic/reconciliation';
import { store } from '../store';
import { ExpectedInvoice, GatewayRow, ReconciliationRun } from '../types';
import { isValidMonth, monthBounds } from '../utils/dates';
import { asObject, requireDate, requireInt, requireOneOf, requireString } from '../utils/validate';

// POST /reconciliation/runs
export function createRun(req: Request, res: Response) {
  const body = asObject(req.body);
  const month = requireString(body, 'month');
  if (!isValidMonth(month)) throw validationError('month must be in YYYY-MM format');
  if (!Array.isArray(body.rows)) throw validationError('rows must be an array');
  const rows = body.rows.map(parseRow);

  const errors = findRowErrors(month, rows, (agreementId) => {
    const agreement = store.agreements.get(agreementId);
    return agreement && store.plans.get(agreement.plan_id)!.currency;
  });
  if (errors.length > 0) throw new AppError(422, 'INVALID_ROWS', 'Some rows are invalid', { errors });

  const run: ReconciliationRun = { id: randomUUID(), month, ...reconcile(rows, expectedInvoices(month)) };
  store.runs.set(run.id, run);

  res.status(201).json(run);
}

// GET /reconciliation/runs/:id
export function getRun(req: Request, res: Response) {
  const run = store.runs.get(req.params.id as string);
  if (!run) throw notFound(`Run ${req.params.id} does not exist`);
  res.status(200).json(run);
}

/** Every invoice, from every agreement, due within the month. */
function expectedInvoices(month: string): ExpectedInvoice[] {
  const { first, last } = monthBounds(month);
  return [...store.agreements.values()].flatMap((agreement) =>
    buildSchedule(agreement, store.plans.get(agreement.plan_id)!, first, last).map((invoice) => ({
      agreement_id: agreement.id,
      ...invoice,
    })),
  );
}

function parseRow(value: unknown): GatewayRow {
  const row = asObject(value, 'Each row');
  return {
    gateway_txn_id: requireString(row, 'gateway_txn_id'),
    agreement_id: requireString(row, 'agreement_id'),
    amount: requireInt(row, 'amount', 1),
    currency: requireString(row, 'currency'),
    status: requireOneOf(row, 'status', ROW_STATUSES),
    attempted_on: requireDate(row, 'attempted_on'),
  };
}
