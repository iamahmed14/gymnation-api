import { COUNTRIES, COUNTRY_CODES } from '../config';
import { AppError } from '../errors';
import { CountryCode } from '../types';

const invalidPhone = () => new AppError(422, 'INVALID_PHONE', 'Phone is not a valid AE, SA or BH mobile number');

/** Strip spaces, hyphens and brackets. What's left must be digits with at most one leading '+'. */
function clean(raw: string): { hasPlus: boolean; digits: string } {
  const cleaned = raw.replace(/[ \-()]/g, '');
  if (!/^\+?\d+$/.test(cleaned)) throw invalidPhone();
  return { hasPlus: cleaned.startsWith('+'), digits: cleaned.replace('+', '') };
}

/** Dial code + mobile (e.g. 966551234567) -> its country and E.164 form, or null. */
function parseInternational(digits: string): { country: CountryCode; e164: string } | null {
  for (const country of COUNTRY_CODES) {
    const { dial, subscriber } = COUNTRIES[country];
    if (digits.startsWith(dial) && subscriber.test(digits.slice(dial.length))) {
      return { country, e164: `+${digits}` };
    }
  }
  return null;
}

/** National mobile (e.g. 0551234567 in SA) -> E.164, or null if it isn't that country's shape. */
function parseNational(digits: string, country: CountryCode): string | null {
  const { dial, national } = COUNTRIES[country];
  if (!national.test(digits)) return null;
  return `+${dial}${digits.replace(/^0/, '')}`; // drop the trunk zero (BH has none)
}

/** POST /members: national numbers are read in the member's own country; any of the 3 countries' international numbers is fine. */
export function normalizeForCreate(raw: string, memberCountry: CountryCode): string {
  const { hasPlus, digits } = clean(raw);

  const international = parseInternational(digits);
  if (international) return international.e164;

  const national = hasPlus ? null : parseNational(digits, memberCountry);
  if (national) return national;

  throw invalidPhone();
}

/** GET /members/lookup: a national number needs `country`; an international one must agree with it. */
export function normalizeForLookup(raw: string, country?: CountryCode): string {
  const { hasPlus, digits } = clean(raw);

  const international = parseInternational(digits);
  if (international) {
    if (country && country !== international.country) {
      throw new AppError(422, 'PHONE_COUNTRY_MISMATCH', `Number belongs to ${international.country}, not ${country}`);
    }
    return international.e164;
  }

  if (hasPlus) throw invalidPhone();

  if (!country) {
    const looksNational = COUNTRY_CODES.some((code) => parseNational(digits, code));
    if (looksNational) throw new AppError(422, 'PHONE_NEEDS_COUNTRY', 'National number given without a country');
    throw invalidPhone();
  }

  const national = parseNational(digits, country);
  if (national) return national;

  throw invalidPhone();
}
