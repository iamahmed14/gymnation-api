import { Request, Response } from 'express';
import { COUNTRIES, COUNTRY_CODES } from '../config';
import { AppError, validationError } from '../errors';
import { store } from '../store';
import { Plan } from '../types';
import { asObject, requireInt, requireOneOf, requireString } from '../utils/validate';

// POST /plans
export function createPlan(req: Request, res: Response) {
  const body = asObject(req.body);
  const id = requireString(body, 'id');
  const country = requireOneOf(body, 'country', COUNTRY_CODES);
  const monthly = requireInt(body, 'monthly', 1);
  const joining_fee = requireInt(body, 'joining_fee', 0);

  if (id.trim() === '') throw validationError('id must not be empty');
  if (store.plans.has(id)) throw new AppError(409, 'PLAN_EXISTS', `Plan ${id} already exists`);

  const plan: Plan = { id, country, currency: COUNTRIES[country].currency, monthly, joining_fee };
  store.plans.set(id, plan);

  res.status(201).json(plan);
}
