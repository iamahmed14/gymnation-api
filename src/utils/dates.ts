// Dates are plain 'YYYY-MM-DD' strings. They sort correctly as strings,
// and all arithmetic goes through UTC so there are no timezone surprises.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // rejects things like 2026-02-30 that Date would silently roll over
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function isValidMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / MS_PER_DAY;
}

// A month is handled as one counter (year * 12 + monthIndex) so "next month" is just + 1.
export function monthNumber(date: string): number {
  const [y, m] = date.split('-').map(Number);
  return y * 12 + (m - 1);
}

/** Due date in a month: the due day, clamped to the month's length (31 -> 30 Apr, 28/29 Feb). */
export function dueDateIn(month: number, dueDay: number): string {
  const year = Math.floor(month / 12);
  const monthIndex = month % 12;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const day = Math.min(dueDay, daysInMonth);
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

/** First and last day of a 'YYYY-MM' month. */
export function monthBounds(month: string): { first: string; last: string } {
  return { first: `${month}-01`, last: dueDateIn(monthNumber(`${month}-01`), 31) };
}

const pad = (n: number) => String(n).padStart(2, '0');
