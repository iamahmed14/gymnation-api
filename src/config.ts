export const PORT = Number(process.env.PORT ?? 8080);

export const COUNTRY_CODES = ['AE', 'SA', 'BH'] as const;

// national: how locals write it, subscriber: the mobile part after the dial code
export const COUNTRIES = {
  AE: { dial: '971', currency: 'AED', vatPercent: 5, national: /^05\d{8}$/, subscriber: /^5\d{8}$/ },
  SA: { dial: '966', currency: 'SAR', vatPercent: 15, national: /^05\d{8}$/, subscriber: /^5\d{8}$/ },
  BH: { dial: '973', currency: 'BHD', vatPercent: 10, national: /^3\d{7}$/, subscriber: /^3\d{7}$/ },
};

export const NAME_MAX_LENGTH = 120;
export const MAX_INVOICE_RANGE_DAYS = 366;
export const AMOUNT_TOLERANCE = 1; // minor units

export const ROW_STATUSES = ['SETTLED', 'DECLINED'] as const;
export const VERDICTS = ['MATCHED', 'DUE_DAY_DRIFT', 'DOUBLE_CHARGE_RISK', 'MISSING_FROM_LEDGER', 'DECLINED'] as const;
