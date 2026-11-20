import { normalizeForCreate, normalizeForLookup } from '../src/logic/phone';

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (err: any) {
    return err.code;
  }
  return 'NO_ERROR';
};

describe('normalizeForCreate', () => {
  it.each([
    ['055 123 4567', 'SA', '+966551234567'],
    ['(055) 123-4567', 'SA', '+966551234567'],
    ['0501234567', 'AE', '+971501234567'],
    ['3600 1234', 'BH', '+97336001234'],
    ['+966551234567', 'SA', '+966551234567'],
    ['966551234567', 'SA', '+966551234567'],
    ['+97336001234', 'SA', '+97336001234'], // foreign SIM is allowed on create
    ['971501234567', 'BH', '+971501234567'],
  ] as const)('%s in %s -> %s', (raw, country, expected) => {
    expect(normalizeForCreate(raw, country)).toBe(expected);
  });

  it.each([
    ['00966551234567', 'SA'], // 00 prefix
    ['+966 55 123 456', 'SA'], // too short
    ['0551234567', 'BH'], // SA/AE national shape, but member is in BH
    ['36001234', 'SA'], // BH national shape, but member is in SA
    ['041234567', 'AE'], // landline
    ['+97141234567', 'AE'], // international landline
    ['+0551234567', 'SA'], // plus on a national number
    ['055.123.4567', 'SA'], // dots are not stripped
    ['055\t123\t4567', 'SA'], // only spaces are stripped, not tabs
    ['++966551234567', 'SA'],
    ['', 'SA'],
  ] as const)('%s in %s -> INVALID_PHONE', (raw, country) => {
    expect(codeOf(() => normalizeForCreate(raw, country))).toBe('INVALID_PHONE');
  });
});

describe('normalizeForLookup', () => {
  it('accepts international forms with or without +', () => {
    expect(normalizeForLookup('966551234567')).toBe('+966551234567');
    expect(normalizeForLookup('+966551234567')).toBe('+966551234567');
    expect(normalizeForLookup('+966551234567', 'SA')).toBe('+966551234567');
  });

  it('accepts a national number with its country', () => {
    expect(normalizeForLookup('055 123 4567', 'SA')).toBe('+966551234567');
    expect(normalizeForLookup('36001234', 'BH')).toBe('+97336001234');
  });

  it('PHONE_NEEDS_COUNTRY for a national number with no country', () => {
    expect(codeOf(() => normalizeForLookup('0551234567'))).toBe('PHONE_NEEDS_COUNTRY');
    expect(codeOf(() => normalizeForLookup('36001234'))).toBe('PHONE_NEEDS_COUNTRY');
  });

  it('PHONE_COUNTRY_MISMATCH when country disagrees with the dial code', () => {
    expect(codeOf(() => normalizeForLookup('+966551234567', 'AE'))).toBe('PHONE_COUNTRY_MISMATCH');
  });

  it('INVALID_PHONE for a national number that does not fit the given country', () => {
    expect(codeOf(() => normalizeForLookup('36001234', 'SA'))).toBe('INVALID_PHONE');
  });

  it('INVALID_PHONE for junk with no country', () => {
    expect(codeOf(() => normalizeForLookup('12345'))).toBe('INVALID_PHONE');
    expect(codeOf(() => normalizeForLookup('abc'))).toBe('INVALID_PHONE');
  });
});
