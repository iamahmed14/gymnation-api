import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { MAX_INVOICE_RANGE_DAYS } from '../config';
import { AppError, notFound } from '../errors';
import { buildSchedule } from '../logic/invoices';
import { store } from '../store';
import { Agreement } from '../types';
import { daysBetween } from '../utils/dates';
import { asObject, requireDate, requireInt, requireString } from '../utils/validate';

// POST /agreements
export function createAgreement(req: Request, res: Response) {
  const body = asObject(req.body);
  const member_id = requireString(body, 'member_id');
  const plan_id = requireString(body, 'plan_id');
  const start_date = requireDate(body, 'start_date');
  const due_day = requireInt(body, 'due_day', 1, 31);

  const member = store.members.get(member_id);
  if (!member) throw new AppError(422, 'UNKNOWN_MEMBER', `Member ${member_id} does not exist`);

  const plan = store.plans.get(plan_id);
  if (!plan) throw new AppError(422, 'UNKNOWN_PLAN', `Plan ${plan_id} does not exist`);

  if (plan.country !== member.country) {
    throw new AppError(422, 'PLAN_COUNTRY_MISMATCH', `Plan is for ${plan.country}, member is in ${member.country}`);
  }

  const agreement: Agreement = { id: randomUUID(), member_id, plan_id, start_date, due_day };
  store.agreements.set(agreement.id, agreement);

  res.status(201).json(agreement);
}

// GET /agreements/:id/invoices?from=YYYY-MM-DD&to=YYYY-MM-DD
export function listInvoices(req: Request, res: Response) {
  const agreement = store.agreements.get(req.params.id as string);
  if (!agreement) throw notFound(`Agreement ${req.params.id} does not exist`);

  const query = asObject(req.query, 'Query');
  const from = requireDate(query, 'from');
  const to = requireDate(query, 'to');

  const rangeDays = daysBetween(from, to);
  if (rangeDays < 0 || rangeDays > MAX_INVOICE_RANGE_DAYS) {
    throw new AppError(422, 'INVALID_RANGE', `to must be on or after from, and at most ${MAX_INVOICE_RANGE_DAYS} days later`);
  }

  const plan = store.plans.get(agreement.plan_id)!;
  res.status(200).json(buildSchedule(agreement, plan, from, to));
}
