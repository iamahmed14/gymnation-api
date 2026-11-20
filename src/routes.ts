import { Router } from 'express';
import { createAgreement, listInvoices } from './handlers/agreements';
import { health } from './handlers/health';
import { createMember, lookupMember } from './handlers/members';
import { createPlan } from './handlers/plans';
import { createRun, getRun } from './handlers/reconciliation';

export const router = Router();

router.get('/health', health);

// Part 1 — members and phones
router.post('/members', createMember);
router.get('/members/lookup', lookupMember);

// Part 2 — plans, agreements, invoice schedule
router.post('/plans', createPlan);
router.post('/agreements', createAgreement);
router.get('/agreements/:id/invoices', listInvoices);

// Part 3 — gateway reconciliation
router.post('/reconciliation/runs', createRun);
router.get('/reconciliation/runs/:id', getRun);
