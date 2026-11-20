import request from 'supertest';
import { app } from '../src/app';
import { resetStore } from '../src/store';

const api = request(app);

beforeEach(resetStore);

const createMember = (body: object) => api.post('/members').send(body);
const noura = { name: '  Noura Al Harbi ', country: 'SA', phone: '055 123 4567' };

describe('contract', () => {
  it('GET /health -> 200', async () => {
    expect((await api.get('/health')).status).toBe(200);
  });

  it('unknown route -> 404 NOT_FOUND', async () => {
    const res = await api.get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('malformed JSON -> 422 VALIDATION', async () => {
    const res = await api.post('/members').set('Content-Type', 'application/json').send('{"name":');
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: { code: 'VALIDATION', message: expect.any(String) } });
  });
});

describe('Part 1 — members', () => {
  it('creates a member with a trimmed name and E.164 phone', async () => {
    const res = await createMember(noura);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), name: 'Noura Al Harbi', country: 'SA', phone: '+966551234567' });
  });

  it.each([
    [{ ...noura, name: '   ' }],
    [{ ...noura, name: 'x'.repeat(121) }],
    [{ ...noura, country: 'US' }],
    [{ ...noura, phone: 551234567 }],
    [{ name: 'No phone', country: 'SA' }],
  ])('422 VALIDATION for %j', async (body) => {
    const res = await createMember(body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('422 INVALID_PHONE for a bad number', async () => {
    const res = await createMember({ ...noura, phone: '00966551234567' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_PHONE');
  });

  it('409 PHONE_TAKEN for the same phone in another spelling', async () => {
    const first = await createMember(noura);
    const res = await createMember({ name: 'Other', country: 'AE', phone: '+966-55-123-4567' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'PHONE_TAKEN', existing_member_id: first.body.id });
  });

  it('only one of two simultaneous writes for the same phone wins', async () => {
    const results = await Promise.all([
      createMember(noura),
      createMember({ ...noura, phone: '966551234567' }),
      createMember({ ...noura, phone: '+966551234567' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
  });

  it('looks up by every accepted spelling', async () => {
    const { body: member } = await createMember(noura);
    for (const query of ['phone=966551234567', 'phone=%2B966551234567', 'phone=055%20123%204567&country=SA']) {
      const res = await api.get(`/members/lookup?${query}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(member);
    }
  });

  it.each([
    ['phone=0551234567', 422, 'PHONE_NEEDS_COUNTRY'],
    ['phone=%2B966551234567&country=AE', 422, 'PHONE_COUNTRY_MISMATCH'],
    ['phone=abc', 422, 'INVALID_PHONE'],
    ['phone=0551234567&country=XX', 422, 'VALIDATION'],
    ['', 422, 'VALIDATION'],
    ['phone=966559999999', 404, 'NOT_FOUND'],
  ])('lookup ?%s -> %i %s', async (query, status, code) => {
    await createMember(noura);
    const res = await api.get(`/members/lookup?${query}`);
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
  });
});

describe('Part 2 — plans, agreements, invoices', () => {
  const saPlan = { id: 'anytime-sa', country: 'SA', monthly: 29900, joining_fee: 0 };

  async function setup() {
    const { body: member } = await createMember(noura);
    await api.post('/plans').send(saPlan);
    const { body: agreement } = await api
      .post('/agreements')
      .send({ member_id: member.id, plan_id: 'anytime-sa', start_date: '2026-09-20', due_day: 1 });
    return { member, agreement };
  }

  it('creates a plan with currency from the country', async () => {
    const res = await api.post('/plans').send(saPlan);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ...saPlan, currency: 'SAR' });
  });

  it('409 PLAN_EXISTS on a duplicate id', async () => {
    await api.post('/plans').send(saPlan);
    const res = await api.post('/plans').send(saPlan);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PLAN_EXISTS');
  });

  it.each([[{ ...saPlan, monthly: 0 }], [{ ...saPlan, joining_fee: -1 }], [{ ...saPlan, monthly: 10.5 }], [{ ...saPlan, monthly: '29900' }]])(
    'plan 422 VALIDATION for %j',
    async (body) => {
      const res = await api.post('/plans').send(body);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION');
    },
  );

  it('creates an agreement', async () => {
    const { member, agreement } = await setup();
    expect(agreement).toEqual({
      id: expect.any(String),
      member_id: member.id,
      plan_id: 'anytime-sa',
      start_date: '2026-09-20',
      due_day: 1,
    });
  });

  it('agreement business errors', async () => {
    const { body: member } = await createMember(noura);
    await api.post('/plans').send(saPlan);
    await api.post('/plans').send({ ...saPlan, id: 'anytime-ae', country: 'AE' });
    const base = { member_id: member.id, plan_id: 'anytime-sa', start_date: '2026-09-20', due_day: 1 };

    const cases: [object, number, string][] = [
      [{ ...base, member_id: 'nope' }, 422, 'UNKNOWN_MEMBER'],
      [{ ...base, plan_id: 'nope' }, 422, 'UNKNOWN_PLAN'],
      [{ ...base, plan_id: 'anytime-ae' }, 422, 'PLAN_COUNTRY_MISMATCH'],
      [{ ...base, due_day: 32 }, 422, 'VALIDATION'],
      [{ ...base, start_date: '2026-02-30' }, 422, 'VALIDATION'],
    ];
    for (const [body, status, code] of cases) {
      const res = await api.post('/agreements').send(body);
      expect([res.status, res.body.error.code]).toEqual([status, code]);
    }
  });

  it('lists invoices for the worked example', async () => {
    const { agreement } = await setup();
    const res = await api.get(`/agreements/${agreement.id}/invoices?from=2026-09-01&to=2026-10-31`);
    expect(res.status).toBe(200);
    expect(res.body.map((i: any) => [i.invoice_no, i.kind, i.net, i.vat, i.total])).toEqual([
      [1, 'FIRST', 10963, 1644, 12607],
      [2, 'MONTHLY', 29900, 4485, 34385],
    ]);
  });

  it.each([
    ['from=2026-10-01&to=2026-09-01', 422, 'INVALID_RANGE'],
    ['from=2026-01-01&to=2027-01-03', 422, 'INVALID_RANGE'], // 367 days
    ['from=2026-01-01', 422, 'VALIDATION'],
    ['from=2026-13-01&to=2026-12-01', 422, 'VALIDATION'],
  ])('invoices ?%s -> %i %s', async (query, status, code) => {
    const { agreement } = await setup();
    const res = await api.get(`/agreements/${agreement.id}/invoices?${query}`);
    expect([res.status, res.body.error.code]).toEqual([status, code]);
  });

  it('366-day range is allowed', async () => {
    const { agreement } = await setup();
    const res = await api.get(`/agreements/${agreement.id}/invoices?from=2026-01-01&to=2027-01-02`);
    expect(res.status).toBe(200);
  });

  it('404 for an unknown agreement', async () => {
    const res = await api.get('/agreements/nope/invoices?from=2026-01-01&to=2026-02-01');
    expect([res.status, res.body.error.code]).toEqual([404, 'NOT_FOUND']);
  });
});

describe('Part 3 — reconciliation', () => {
  async function setup() {
    const { body: sa } = await createMember(noura);
    const { body: bh } = await createMember({ name: 'Ali', country: 'BH', phone: '3600 1234' });
    await api.post('/plans').send({ id: 'sa', country: 'SA', monthly: 29900, joining_fee: 0 });
    await api.post('/plans').send({ id: 'bh', country: 'BH', monthly: 24500, joining_fee: 0 });
    const { body: saAgreement } = await api
      .post('/agreements')
      .send({ member_id: sa.id, plan_id: 'sa', start_date: '2026-09-20', due_day: 1 });
    const { body: bhAgreement } = await api
      .post('/agreements')
      .send({ member_id: bh.id, plan_id: 'bh', start_date: '2026-09-15', due_day: 1 });
    return { saAgreement, bhAgreement };
  }

  it('runs the worked example and stores the run', async () => {
    const { saAgreement, bhAgreement } = await setup();
    const res = await api.post('/reconciliation/runs').send({
      month: '2026-10',
      rows: [
        { gateway_txn_id: 'T-88121', agreement_id: saAgreement.id, amount: 34385, currency: 'SAR', status: 'SETTLED', attempted_on: '2026-10-01' },
        { gateway_txn_id: 'T-88122', agreement_id: bhAgreement.id, amount: 26950, currency: 'BHD', status: 'DECLINED', attempted_on: '2026-10-02' },
      ],
    });

    // exact body from the brief's example
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      month: '2026-10',
      summary: { MATCHED: 1, DUE_DAY_DRIFT: 0, DOUBLE_CHARGE_RISK: 0, MISSING_FROM_LEDGER: 0, DECLINED: 1 },
      rows: [
        { gateway_txn_id: 'T-88121', verdict: 'MATCHED', invoice: { agreement_id: saAgreement.id, invoice_no: 2 } },
        { gateway_txn_id: 'T-88122', verdict: 'DECLINED', invoice: null },
      ],
      unmatched_invoices: [
        { agreement_id: bhAgreement.id, invoice_no: 2, due_date: '2026-10-01', total: 26950, currency: 'BHD' },
      ],
    });

    const stored = await api.get(`/reconciliation/runs/${res.body.id}`);
    expect(stored.status).toBe(200);
    expect(stored.body).toEqual(res.body);
  });

  it('422 INVALID_ROWS with errors inside error', async () => {
    const { saAgreement } = await setup();
    const row = { gateway_txn_id: 'T1', agreement_id: saAgreement.id, amount: 100, currency: 'AED', status: 'SETTLED', attempted_on: '2026-11-01' };
    const res = await api.post('/reconciliation/runs').send({ month: '2026-10', rows: [row] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_ROWS');
    expect(res.body.error.errors).toEqual(
      expect.arrayContaining([
        { gateway_txn_id: 'T1', code: 'ROW_OUTSIDE_MONTH' },
        { gateway_txn_id: 'T1', code: 'CURRENCY_MISMATCH' },
      ]),
    );
  });

  it.each([
    [{ month: '2026-13', rows: [] }],
    [{ month: '2026-10' }],
    [{ month: '2026-10', rows: [{ gateway_txn_id: 'T1' }] }],
  ])('422 VALIDATION for %j', async (body) => {
    const res = await api.post('/reconciliation/runs').send(body);
    expect([res.status, res.body.error.code]).toEqual([422, 'VALIDATION']);
  });

  it('404 for an unknown run', async () => {
    const res = await api.get('/reconciliation/runs/nope');
    expect([res.status, res.body.error.code]).toEqual([404, 'NOT_FOUND']);
  });
});
