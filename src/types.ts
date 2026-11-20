import { COUNTRY_CODES, ROW_STATUSES, VERDICTS } from './config';

export type CountryCode = (typeof COUNTRY_CODES)[number];
export type RowStatus = (typeof ROW_STATUSES)[number];
export type Verdict = (typeof VERDICTS)[number];

export interface Member {
  id: string;
  name: string;
  country: CountryCode;
  phone: string; // E.164, e.g. +966551234567
}

export interface Plan {
  id: string;
  country: CountryCode;
  currency: string;
  monthly: number; // pre-VAT, minor units
  joining_fee: number; // pre-VAT, minor units
}

export interface Agreement {
  id: string;
  member_id: string;
  plan_id: string;
  start_date: string; // YYYY-MM-DD
  due_day: number; // 1-31
}

export interface Invoice {
  invoice_no: number;
  due_date: string;
  kind: 'FIRST' | 'MONTHLY';
  proration: { days: number; cycle_days: number } | null;
  net: number;
  vat: number;
  total: number;
  currency: string;
}

export interface ExpectedInvoice extends Invoice {
  agreement_id: string;
}

export interface GatewayRow {
  gateway_txn_id: string;
  agreement_id: string;
  amount: number;
  currency: string;
  status: RowStatus;
  attempted_on: string;
}

export interface ReconciledRow {
  gateway_txn_id: string;
  verdict: Verdict;
  invoice: { agreement_id: string; invoice_no: number } | null;
}

export interface UnmatchedInvoice {
  agreement_id: string;
  invoice_no: number;
  due_date: string;
  total: number;
  currency: string;
}

export interface ReconciliationRun {
  id: string;
  month: string; // YYYY-MM
  summary: Record<Verdict, number>;
  rows: ReconciledRow[];
  unmatched_invoices: UnmatchedInvoice[];
}
